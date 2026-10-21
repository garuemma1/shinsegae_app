/**
 * 🔢 스마트 알약 카운터 & 조제 검수기 모듈 (v3.0 AI 스트리밍 판독 + 학습 데이터 자동 수집)
 * - 사진을 찍으면 Gemini AI 정밀스캔이 자동 실행 (고전 로컬 분석은 AI 실패 시 비상용으로만 사용)
 * - 스트리밍 판독: AI가 알약 박스를 하나 찾을 때마다 화면에 번호가 1, 2, 3... 실시간으로 찍힘
 * - 정확도 보강: 알약 테두리 박스(box) 방식 + 1024px 해상도 + 박스 안 박스/반쪽 박스 병합 후처리
 * - 학습 데이터 자동 수집: [💾 근거 기록저장] 시 번호 없는 원본 사진 + 보정 완료된 알약 위치(YOLO 형식)를
 *   Firebase(pillCounterTrainingData)에 따로 쌓아 2단계 전용 AI 모델 학습에 사용 (localStorage 용량 영향 0)
 * - 조제 근거 정보 3항목 [👤 사람이름 | 💊 약이름 | 🎯 목표개수] & Cloudinary 증거 사진 보관함 유지
 */
window.PillCounterModule = (function () {
  const HISTORY_STORAGE_KEY = 'ssg_pill_counter_history_v1';
  const GEMINI_KEY_STORAGE = 'ssg_pill_gemini_api_key_v1';
  const WORKING_MODEL_STORAGE = 'ssg_pill_working_model_v4';
  const FIREBASE_AI_CONFIG_URL = 'https://shinsegae-pharmacy-default-rtdb.firebaseio.com/shinsegae_master_db/pillCounterConfig.json';
  const FIREBASE_HISTORY_URL = 'https://shinsegae-pharmacy-default-rtdb.firebaseio.com/shinsegae_master_db/pillCounterHistory.json';
  // 2단계 전용 AI 모델 학습용 데이터 (원본 사진 URL + 보정 완료 알약 박스). 기록 1건당 POST로 추가만 함
  const FIREBASE_TRAIN_URL = 'https://shinsegae-pharmacy-default-rtdb.firebaseio.com/shinsegae_master_db/pillCounterTrainingData.json';
  const AI_MODEL_QUEUE = ['gemini-2.5-flash', 'gemini-flash-latest'];
  // 알약 전용 YOLO AI (Roboflow) 설정 — 약국 전 기기 공유 (Firebase pillCounterConfig에 함께 저장)
  const ROBOFLOW_KEY_STORAGE = 'ssg_pill_roboflow_key_v1';
  const ROBOFLOW_MODEL_STORAGE = 'ssg_pill_roboflow_model_v1';
  const ROBOFLOW_CONF_STORAGE = 'ssg_pill_roboflow_conf_v1';

  // --- 상태 변수 ---
  let loadedImage = null;
  let imageWidth = 0;
  let imageHeight = 0;
  let markers = [];             // [{ id, x, y, r, isManual }]
  let undoStack = [];

  let interactionMode = 'EDIT'; // 'EDIT' (+1/-1 터치보정) | 'PAN' (✋ 화면 이동)
  let hideMarkersTemp = false;
  let zoomLevel = 1.0;
  let panX = 0;
  let panY = 0;
  let isDraggingPan = false;
  let dragStartX = 0;
  let dragStartY = 0;

  // 조제 근거 정보 3항목 (사람이름 / 약이름 / 목표개수) & 누적 합산 상태
  let patientNameInput = '';
  let drugNameInput = '';
  let targetCount = 0;
  let batchCounts = [];
  let lastScanElapsedSec = '';
  let lastScanEngineName = '';  // '⚡로컬 0.1초' | '🤖AI'

  // 검수 근거 보관함 검색어 & 사진 확대 모달 상태
  let historySearchQuery = '';
  let previewRecord = null;

  // 진행 상태
  let isAiScanning = false;
  let isSavingCloud = false;
  let showAiConfigModal = false;
  let cloudKeyLoaded = false;
  let cloudHistoryLoaded = false;

  // AI 스캔 세션 관리 (새 사진을 올리면 이전 스캔 결과는 무시)
  let scanToken = 0;
  let scanAbortController = null;
  let scanNotice = '';          // 'AI 실패 → 간이분석 결과' 등 안내 문구

  // 학습 데이터 수집 현황
  let trainingCount = null;     // null = 아직 조회 전
  let trainingCountLoaded = false;

  // --- 클라우드(Firebase) 공용 Gemini API 키 자동 동기화 ---
  async function syncGeminiKeyFromCloud() {
    if (cloudKeyLoaded) return;
    cloudKeyLoaded = true;
    try {
      const localKey = getGeminiApiKey();
      const localRf = getRoboflowConfig();
      const res = await fetch(`${FIREBASE_AI_CONFIG_URL}?t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const data = (await res.json()) || {};
        let changed = false;
        let needPush = false;

        if (data.geminiApiKey && String(data.geminiApiKey).trim().length > 10) {
          const cloudKey = String(data.geminiApiKey).trim();
          if (cloudKey !== localKey) {
            localStorage.setItem(GEMINI_KEY_STORAGE, cloudKey);
            changed = true;
          }
        } else if (localKey && localKey.length > 10) {
          needPush = true;
        }

        if (data.roboflowApiKey && data.roboflowModelId) {
          localStorage.setItem(ROBOFLOW_KEY_STORAGE, String(data.roboflowApiKey).trim());
          localStorage.setItem(ROBOFLOW_MODEL_STORAGE, String(data.roboflowModelId).trim());
          if (data.roboflowConfidence) localStorage.setItem(ROBOFLOW_CONF_STORAGE, String(data.roboflowConfidence));
          changed = true;
        } else if (localRf.apiKey && localRf.modelId) {
          needPush = true;
        }

        if (changed) updateAiStatusBadgeOnly();
        if (needPush) await pushAiConfigToCloud();
      }
    } catch (e) {}
  }

  // Gemini 키 + Roboflow 설정을 한 번에 저장 (한쪽만 PUT 하면 다른 쪽이 지워지므로 항상 전체 저장)
  async function pushAiConfigToCloud() {
    try {
      const rf = getRoboflowConfig();
      await fetch(FIREBASE_AI_CONFIG_URL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          geminiApiKey: getGeminiApiKey() || '',
          roboflowApiKey: rf.apiKey || '',
          roboflowModelId: rf.modelId || '',
          roboflowConfidence: rf.confidence,
          updatedAt: Date.now()
        })
      });
    } catch (e) {}
  }

  function getRoboflowConfig() {
    try {
      const conf = parseInt(localStorage.getItem(ROBOFLOW_CONF_STORAGE) || '40', 10);
      return {
        apiKey: (localStorage.getItem(ROBOFLOW_KEY_STORAGE) || '').trim(),
        modelId: (localStorage.getItem(ROBOFLOW_MODEL_STORAGE) || '').trim(),
        confidence: isNaN(conf) ? 40 : Math.max(5, Math.min(90, conf))
      };
    } catch (e) {
      return { apiKey: '', modelId: '', confidence: 40 };
    }
  }

  function isRoboflowReady() {
    const rf = getRoboflowConfig();
    return rf.apiKey.length > 5 && rf.modelId.indexOf('/') > 0;
  }

  function updateScanNoticeOnly() {
    render('module-content');
  }

  // --- 클라우드(Firebase) 검수 근거 기록 동기화 ---
  async function syncHistoryFromCloud() {
    if (cloudHistoryLoaded) return;
    cloudHistoryLoaded = true;
    try {
      const res = await fetch(`${FIREBASE_HISTORY_URL}?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const cloudData = await res.json();
      const localList = getHistoryList();

      if (Array.isArray(cloudData) && cloudData.length > 0) {
        const mergedMap = new Map();
        cloudData.forEach(item => {
          if (item && item.id) mergedMap.set(item.id, sanitizeHistoryItem(item));
        });
        localList.forEach(item => {
          if (item && item.id && !mergedMap.has(item.id)) {
            mergedMap.set(item.id, sanitizeHistoryItem(item));
          }
        });
        const merged = Array.from(mergedMap.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 500);
        localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(merged));
        renderHistoryItemsOnly();
      } else if (localList.length > 0) {
        await pushHistoryToCloud(localList);
      }
    } catch (e) {}
  }

  async function pushHistoryToCloud(list) {
    try {
      const clean = (list || []).slice(0, 500).map(sanitizeHistoryItem);
      await fetch(FIREBASE_HISTORY_URL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clean)
      });
    } catch (e) {}
  }

  function sanitizeHistoryItem(item) {
    const rawPhoto = String(item.photoUrl || '');
    return {
      id: item.id || ('pch_' + Date.now()),
      createdAt: Number(item.createdAt) || Date.now(),
      patientName: String(item.patientName || '').trim() || '미입력',
      drugName: String(item.drugName || '').trim() || '조제 알약',
      targetCount: Number(item.targetCount) || 0,
      totalCount: Number(item.totalCount) || 0,
      userName: String(item.userName || '약사').trim(),
      timeStr: String(item.timeStr || '').trim(),
      photoUrl: (rawPhoto.startsWith('http') || rawPhoto.startsWith('data:image')) ? rawPhoto : ''
    };
  }

  function getHistoryList() {
    try {
      const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return (Array.isArray(parsed) ? parsed : []).map(sanitizeHistoryItem);
    } catch (e) {
      return [];
    }
  }

  function saveHistoryList(list) {
    try {
      const clean = (list || []).slice(0, 500).map(sanitizeHistoryItem);
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(clean));
      pushHistoryToCloud(clean);
    } catch (e) {}
  }

  function getGeminiApiKey() {
    try {
      return (localStorage.getItem(GEMINI_KEY_STORAGE) || '').trim();
    } catch (e) {
      return '';
    }
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getAiBadgeInfo() {
    if (isRoboflowReady()) {
      return { ok: true, text: '🎯 YOLO 1~2초 판독' };
    }
    if (getGeminiApiKey().length > 10) {
      return { ok: true, text: '🤖 Gemini 고속 판독' };
    }
    return { ok: false, text: '⚠️ AI 키 등록 필요' };
  }

  function updateAiStatusBadgeOnly() {
    const badge = document.getElementById('pc-ai-status-badge');
    if (!badge) return;
    const info = getAiBadgeInfo();
    badge.style.background = info.ok ? 'rgba(16,185,129,0.22)' : 'rgba(245,158,11,0.25)';
    badge.style.borderColor = info.ok ? 'rgba(52,211,153,0.5)' : 'rgba(251,191,36,0.5)';
    badge.style.color = info.ok ? '#6ee7b7' : '#fde68a';
    badge.textContent = info.text;
  }

  // --- 학습 데이터 수집 개수 조회 (shallow=true: 키 목록만 받아서 가볍게 셈) ---
  async function syncTrainingCount() {
    if (trainingCountLoaded) return;
    trainingCountLoaded = true;
    try {
      const res = await fetch(`${FIREBASE_TRAIN_URL}?shallow=true&t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      trainingCount = data && typeof data === 'object' ? Object.keys(data).length : 0;
      updateTrainingCountOnly();
    } catch (e) {}
  }

  function updateTrainingCountOnly() {
    const el = document.getElementById('pc-training-count');
    if (el && trainingCount !== null) {
      el.textContent = `🧠 학습 데이터 ${trainingCount}장 수집 (목표 100장)`;
    }
  }

  function buildVerifyBannerHTML() {
    const currCount = markers.length;
    const batchSum = batchCounts.reduce((acc, b) => acc + (Number(b.count) || 0), 0);
    const totalEffectiveCount = batchSum + currCount;

    if (targetCount > 0 && (loadedImage || batchCounts.length > 0) && !isAiScanning) {
      const diff = totalEffectiveCount - targetCount;
      if (diff === 0) {
        return `
          <div style="background:linear-gradient(135deg,#059669 0%,#10b981 100%); color:#ffffff; border-radius:14px; padding:11px 18px; margin-bottom:12px; display:flex; align-items:center; gap:10px; box-shadow:0 4px 14px rgba(16,185,129,0.25);">
            <span style="font-size:20px;">✅</span>
            <div style="font-size:14.5px; font-weight:900;">
              목표 조제 수량(${targetCount}정)과 100% 일치합니다!
              <span style="font-size:12px; font-weight:600; opacity:0.9; margin-left:6px;">(현재 ${currCount}정${batchSum > 0 ? ` + 누적 ${batchSum}정` : ''})</span>
            </div>
          </div>
        `;
      } else if (diff < 0) {
        return `
          <div style="background:linear-gradient(135deg,#d97706 0%,#f59e0b 100%); color:#ffffff; border-radius:14px; padding:11px 18px; margin-bottom:12px; display:flex; align-items:center; gap:10px;">
            <span style="font-size:20px;">⚠️</span>
            <div style="font-size:14.5px; font-weight:900;">
              목표(${targetCount}정)보다 <span style="text-decoration:underline;">${Math.abs(diff)}정 부족</span>합니다!
              <span style="font-size:12px; font-weight:600; opacity:0.95; margin-left:6px;">(현재 총 ${totalEffectiveCount}정 — 빠진 알약을 터치해 +1 추가하거나 보충하세요)</span>
            </div>
          </div>
        `;
      } else {
        return `
          <div style="background:linear-gradient(135deg,#dc2626 0%,#ef4444 100%); color:#ffffff; border-radius:14px; padding:11px 18px; margin-bottom:12px; display:flex; align-items:center; gap:10px;">
            <span style="font-size:20px;">🚨</span>
            <div style="font-size:14.5px; font-weight:900;">
              목표(${targetCount}정)보다 <span style="text-decoration:underline;">+${diff}정 초과</span>되었습니다!
              <span style="font-size:12px; font-weight:600; opacity:0.95; margin-left:6px;">(현재 총 ${totalEffectiveCount}정 — 잘못 찍힌 번호를 터치해 -1 삭제하거나 덜어내세요)</span>
            </div>
          </div>
        `;
      }
    }
    return '';
  }

  function refreshDynamicZonesWithoutRender() {
    const bannerZone = document.getElementById('pc-verify-banner-zone');
    if (bannerZone) {
      bannerZone.innerHTML = buildVerifyBannerHTML();
    }
    const resetWrap = document.getElementById('pc-reset-target-wrap');
    if (resetWrap) {
      resetWrap.innerHTML = targetCount > 0
        ? `<button type="button" onclick="PillCounterModule.setQuickTarget(0)" style="background:#fee2e2; color:#dc2626; border:none; border-radius:6px; padding:2px 8px; font-size:11px; font-weight:800; cursor:pointer;">목표 초기화</button>`
        : '';
    }
    const numEl = document.getElementById('pc-current-count-num');
    if (numEl && !isAiScanning) {
      numEl.textContent = String(markers.length);
    }
  }

  function getFilteredHistoryList() {
    const list = getHistoryList();
    const q = (historySearchQuery || '').trim().toLowerCase();
    if (!q) return list;
    return list.filter(item => {
      const pName = String(item.patientName || '').toLowerCase();
      const dName = String(item.drugName || '').toLowerCase();
      const cnt = String(item.totalCount || '') + '정';
      const tStr = String(item.timeStr || '').toLowerCase();
      const uName = String(item.userName || '').toLowerCase();
      return pName.includes(q) || dName.includes(q) || cnt.includes(q) || tStr.includes(q) || uName.includes(q);
    });
  }

  function buildHistoryItemsHTML() {
    const allList = getHistoryList();
    const filtered = getFilteredHistoryList();

    if (allList.length === 0) {
      return `
        <div style="text-align:center; padding:28px 16px; color:#64748b; background:#f8fafc; border-radius:12px; border:1px dashed #cbd5e1; font-size:13px;">
          아직 저장된 조제 검수 근거 기록이 없습니다. 상단에서 <strong>사람이름·약이름</strong>을 적고 <strong>[💾 근거 기록저장]</strong>을 누르면 사진과 함께 이곳에 영구 보관됩니다.
        </div>
      `;
    }

    if (filtered.length === 0) {
      return `
        <div style="text-align:center; padding:24px 16px; color:#64748b; background:#f8fafc; border-radius:12px; border:1px dashed #cbd5e1; font-size:13px;">
          🔍 '<strong>${escapeHtml(historySearchQuery)}</strong>' 검색 결과가 없습니다.
        </div>
      `;
    }

    return `
      <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(310px, 1fr)); gap:10px; max-height:380px; overflow-y:auto; padding-right:2px;">
        ${filtered.map(item => {
          const hasPhoto = item.photoUrl && (item.photoUrl.startsWith('http') || item.photoUrl.startsWith('data:image'));
          const pName = item.patientName && item.patientName !== '미입력' ? item.patientName : '이름 미입력';
          const isNameMissing = !item.patientName || item.patientName === '미입력';
          return `
            <div onclick="PillCounterModule.openPhotoModal('${escapeHtml(item.id)}')" title="클릭하면 번호가 찍힌 검수 증거 사진이 크게 열립니다" style="padding:10px 12px; background:#f8fafc; border:1.5px solid #cbd5e1; border-radius:12px; display:flex; align-items:center; justify-content:space-between; gap:10px; cursor:pointer; transition:all 0.15s;" onmouseover="this.style.borderColor='#2563eb'; this.style.background='#eff6ff';" onmouseout="this.style.borderColor='#cbd5e1'; this.style.background='#f8fafc';">
              <div style="display:flex; align-items:center; gap:10px; min-width:0; flex:1;">
                ${hasPhoto ? `
                  <div style="width:56px; height:56px; border-radius:10px; overflow:hidden; flex-shrink:0; border:1.5px solid #2563eb; position:relative; background:#0f172a;">
                    <img src="${escapeHtml(item.photoUrl)}" alt="검수사진" loading="lazy" style="width:100%; height:100%; object-fit:cover; display:block;">
                    <span style="position:absolute; bottom:0; right:0; background:rgba(37,99,235,0.9); color:#fff; font-size:9px; padding:1px 4px; font-weight:800;">🔍사진</span>
                  </div>
                ` : `
                  <div style="width:56px; height:56px; border-radius:10px; background:#e2e8f0; color:#64748b; display:flex; flex-direction:column; align-items:center; justify-content:center; font-size:16px; flex-shrink:0; border:1px dashed #94a3b8;">
                    <span>📷</span>
                    <span style="font-size:9px; font-weight:800;">클릭</span>
                  </div>
                `}

                <div style="min-width:0; flex:1;">
                  <div style="display:flex; align-items:center; gap:5px; flex-wrap:wrap; margin-bottom:2px;">
                    <span style="background:${isNameMissing ? '#f1f5f9' : '#dbeafe'}; color:${isNameMissing ? '#64748b' : '#1e40af'}; border:1px solid ${isNameMissing ? '#cbd5e1' : '#93c5fd'}; padding:1px 7px; border-radius:6px; font-size:12px; font-weight:900;">
                      👤 ${escapeHtml(pName)}
                    </span>
                    <span style="font-size:13px; font-weight:900; color:#0f172a; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                      💊 ${escapeHtml(item.drugName || '조제 알약')}
                    </span>
                  </div>

                  <div style="font-size:11px; color:#64748b; display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                    <span>🕒 ${escapeHtml(item.timeStr || '')}</span>
                    <span>• ${escapeHtml(item.userName || '약사')}</span>
                    <button type="button" onclick="event.stopPropagation(); PillCounterModule.editHistoryItem('${escapeHtml(item.id)}')" style="background:none; border:none; color:#2563eb; font-size:11px; font-weight:800; padding:0; cursor:pointer;">[✏️수정]</button>
                    <button type="button" onclick="event.stopPropagation(); PillCounterModule.deleteHistoryItem('${escapeHtml(item.id)}')" style="background:none; border:none; color:#dc2626; font-size:11px; font-weight:800; padding:0; cursor:pointer;">[삭제]</button>
                  </div>
                </div>
              </div>

              <div style="text-align:right; flex-shrink:0;">
                <div style="font-size:18px; font-weight:900; color:#047857; line-height:1.1;">
                  ${item.totalCount}<span style="font-size:12px; font-weight:800; margin-left:1px;">정</span>
                </div>
                ${item.targetCount > 0 ? (item.totalCount === item.targetCount
                  ? `<div style="font-size:10.5px; font-weight:800; color:#059669;">✅ 목표(${item.targetCount}) 일치</div>`
                  : `<div style="font-size:10.5px; font-weight:800; color:#d97706;">목표 ${item.targetCount}정</div>`
                ) : ''}
                <div style="margin-top:3px; background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; border-radius:6px; padding:2px 7px; font-size:10.5px; font-weight:800; display:inline-block;">
                  🖼️ 사진보기
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderHistoryItemsOnly() {
    const listContainer = document.getElementById('pc-history-items-container');
    if (listContainer) {
      listContainer.innerHTML = buildHistoryItemsHTML();
    }
    const countSpan = document.getElementById('pc-history-total-count');
    if (countSpan) {
      const allLen = getHistoryList().length;
      const filLen = getFilteredHistoryList().length;
      countSpan.textContent = historySearchQuery.trim()
        ? `검색 ${filLen}건 / 전체 ${allLen}건`
        : `총 ${allLen}건`;
    }
    const clearSearchBtn = document.getElementById('pc-clear-search-btn');
    if (clearSearchBtn) {
      clearSearchBtn.style.display = historySearchQuery.trim() ? 'inline-block' : 'none';
    }
  }

  // --- 메인 렌더링 ---
  function render(containerId) {
    syncGeminiKeyFromCloud();
    syncHistoryFromCloud();
    syncTrainingCount();

    const container = document.getElementById(containerId || 'module-content');
    if (!container) return;

    const savedScrollY = window.scrollY || window.pageYOffset || 0;
    const savedContainerScroll = container.scrollTop || 0;

    const hasApiKey = getGeminiApiKey().length > 10 || isRoboflowReady();
    const badgeInfo = getAiBadgeInfo();
    const currCount = markers.length;
    const batchSum = batchCounts.reduce((acc, b) => acc + (Number(b.count) || 0), 0);
    const totalEffectiveCount = batchSum + currCount;
    const historyList = getHistoryList();
    const filteredHistory = getFilteredHistoryList();

    container.innerHTML = `
      <div class="pill-counter-wrapper" style="max-width:1100px; margin:0 auto; padding-bottom:36px;">
        
        <!-- 1. 슬림 헤더 -->
        <div class="card shadow-sm mb-3" style="border-radius:18px; border:1px solid #cbd5e1; background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%); color:#ffffff; padding:13px 18px;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <h2 style="font-size:18px; font-weight:900; margin:0; color:#ffffff; letter-spacing:-0.4px;">
                🔢 스마트 알약 카운터 & 조제 근거 보관함
              </h2>
              <span id="pc-ai-status-badge" style="background:${hasApiKey ? 'rgba(16,185,129,0.22)' : 'rgba(245,158,11,0.25)'}; border:1px solid ${hasApiKey ? 'rgba(52,211,153,0.5)' : 'rgba(251,191,36,0.5)'}; color:${hasApiKey ? '#6ee7b7' : '#fde68a'}; padding:2px 10px; border-radius:20px; font-size:11px; font-weight:800;">
                ${badgeInfo.text}
              </span>
              <span id="pc-training-count" style="background:rgba(124,58,237,0.25); border:1px solid rgba(167,139,250,0.5); color:#ddd6fe; padding:2px 10px; border-radius:20px; font-size:11px; font-weight:800;">
                🧠 학습 데이터 ${trainingCount !== null ? trainingCount : '...'}장 수집 (목표 100장)
              </span>
            </div>

            <button type="button" onclick="PillCounterModule.openAiSettingsModal()" style="background:rgba(255,255,255,0.12); color:#ffffff; border:1px solid rgba(255,255,255,0.25); border-radius:10px; padding:6px 12px; font-size:12px; font-weight:800; cursor:pointer;">
              🔑 ${hasApiKey ? 'AI 키 설정' : '무료 AI 키 등록'}
            </button>
          </div>
        </div>

        <!-- 2. 조제 근거 정보 입력 & 실시간 카운트 전광판 -->
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:12px; margin-bottom:12px;">
          
          <!-- 좌측: 사람이름 / 약이름 / 목표개수 3가지 한 줄 배치 -->
          <div class="card shadow-sm" style="border-radius:16px; border:1px solid #cbd5e1; background:#ffffff; padding:12px 16px; display:flex; flex-direction:column; justify-content:center;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <span style="font-size:13px; font-weight:800; color:#0f172a;">
                📝 조제 근거 정보 입력 <span style="font-size:11px; font-weight:600; color:#64748b;">(클레임 대비 기록용)</span>
              </span>
              <span id="pc-reset-target-wrap">
                ${targetCount > 0 ? `
                  <button type="button" onclick="PillCounterModule.setQuickTarget(0)" style="background:#fee2e2; color:#dc2626; border:none; border-radius:6px; padding:2px 8px; font-size:11px; font-weight:800; cursor:pointer;">목표 초기화</button>
                ` : ''}
              </span>
            </div>

            <div style="display:grid; grid-template-columns:1fr 1.25fr 88px; gap:8px; align-items:end;">
              <div>
                <label style="font-size:11px; font-weight:800; color:#1e40af; display:block; margin-bottom:3px;">👤 사람이름</label>
                <input type="text" id="pc-patient-name" class="form-control form-control-sm" placeholder="예: 홍길동" value="${escapeHtml(patientNameInput)}" oninput="PillCounterModule.onTextMetaInput()" style="width:100%; border-radius:8px; font-weight:800; border:1.5px solid #93c5fd; background:#f8fafc; padding:6px 9px; font-size:13px;">
              </div>
              <div>
                <label style="font-size:11px; font-weight:800; color:#0f172a; display:block; margin-bottom:3px;">💊 약이름</label>
                <input type="text" id="pc-drug-name" class="form-control form-control-sm" placeholder="예: 리피토정" value="${escapeHtml(drugNameInput)}" oninput="PillCounterModule.onTextMetaInput()" style="width:100%; border-radius:8px; font-weight:800; border:1.5px solid #cbd5e1; padding:6px 9px; font-size:13px;">
              </div>
              <div>
                <label style="font-size:11px; font-weight:800; color:#1d4ed8; display:block; margin-bottom:3px;">🎯 목표개수</label>
                <input type="number" step="1" min="0" id="pc-target-count" class="form-control form-control-sm text-center" placeholder="선택" value="${targetCount || ''}" oninput="PillCounterModule.onDirectTargetInput(this.value)" style="width:100%; border-radius:8px; font-weight:900; border:1.5px solid #2563eb; background:#eff6ff; color:#1e40af; padding:6px 4px; font-size:13px; text-align:center;">
              </div>
            </div>
          </div>

          <!-- 우측: 감지된 알약 개수 & 저장 버튼 -->
          <div class="card shadow-sm" style="border-radius:16px; border:2px solid #10b981; background:linear-gradient(135deg,#ecfdf5 0%,#f0fdf4 100%); padding:12px 18px; display:flex; flex-direction:column; justify-content:center;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
              <div>
                <div style="font-size:11.5px; font-weight:800; color:#047857;">
                  📸 감지된 알약 개수 ${lastScanElapsedSec ? `<span style="color:#059669; font-size:11px; font-weight:800;">(${lastScanEngineName} ${lastScanElapsedSec}초)</span>` : ''}
                </div>
                <div style="display:flex; align-items:baseline; gap:6px;">
                  <span id="pc-current-count-num" style="font-size:38px; font-weight:900; color:#065f46; font-family:'Outfit',sans-serif; line-height:1.05;">${isAiScanning ? '...' : currCount}</span>
                  <span style="font-size:15px; font-weight:800; color:#047857;">정</span>
                  ${batchSum > 0 ? `
                    <span style="background:#059669; color:#ffffff; padding:2px 9px; border-radius:20px; font-size:12px; font-weight:800;">
                      누적 총 ${totalEffectiveCount}정
                    </span>
                  ` : ''}
                </div>
              </div>

              <div style="display:flex; flex-direction:column; gap:4px; align-items:flex-end;">
                <div style="display:flex; gap:6px;">
                  <button type="button" onclick="PillCounterModule.addCurrentToBatch()" ${currCount === 0 || isAiScanning ? 'disabled' : ''} style="background:#059669; color:#ffffff; border:none; border-radius:10px; padding:8px 11px; font-size:12px; font-weight:800; cursor:pointer; opacity:${currCount === 0 ? '0.45' : '1'};">
                    ➕ 누적(${batchCounts.length + 1}차)
                  </button>
                  <button type="button" onclick="PillCounterModule.saveCurrentInspection()" ${totalEffectiveCount === 0 || isSavingCloud ? 'disabled' : ''} style="background:#1d4ed8; color:#ffffff; border:none; border-radius:10px; padding:8px 13px; font-size:12.5px; font-weight:900; cursor:pointer; box-shadow:0 3px 8px rgba(29,78,216,0.25); opacity:${totalEffectiveCount === 0 ? '0.45' : '1'};">
                    ${isSavingCloud ? '☁️ 사진저장중...' : '💾 근거 기록저장'}
                  </button>
                </div>
                ${batchCounts.length > 0 ? `
                  <div style="font-size:11px; color:#065f46; font-weight:700;">
                    ${batchCounts.map(b => `${b.batchNo}차(${b.count})`).join('+')}
                    <button type="button" onclick="PillCounterModule.clearBatches()" style="background:none; border:none; color:#dc2626; font-weight:800; cursor:pointer;">[초기화]</button>
                  </div>
                ` : ''}
              </div>
            </div>
          </div>
        </div>

        <!-- 목표 대비 일치/부족/초과 배너 영역 -->
        <div id="pc-verify-banner-zone">${buildVerifyBannerHTML()}</div>

        <!-- 3. 올인원 카운팅 보드 -->
        <div class="card shadow-sm mb-3" style="border-radius:18px; border:1px solid #cbd5e1; background:#ffffff; overflow:hidden;">
          
          <!-- 상단 컨트롤 바 -->
          <div style="background:#f8fafc; padding:10px 14px; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <!-- 📸 1. 스마트폰 바로 카메라 촬영 -->
              <label for="pc-camera-input" style="background:linear-gradient(135deg,#2563eb 0%,#1d4ed8 100%); color:#ffffff; border-radius:10px; padding:8px 14px; font-size:13px; font-weight:800; cursor:pointer; display:inline-flex; align-items:center; gap:6px; margin:0; box-shadow:0 3px 10px rgba(37,99,235,0.25);">
                <i class="fas fa-camera"></i> 📸 바로 카메라 촬영
              </label>
              <input type="file" id="pc-camera-input" accept="image/*" capture="environment" onchange="PillCounterModule.handleFileSelect(event)" style="display:none;">

              <!-- 📁 2. 앨범 / PC 사진 선택 -->
              <label for="pc-gallery-input" style="background:#ffffff; color:#334155; border:1.5px solid #cbd5e1; border-radius:10px; padding:7px 13px; font-size:12.5px; font-weight:800; cursor:pointer; display:inline-flex; align-items:center; gap:5px; margin:0;">
                <i class="fas fa-images" style="color:#64748b;"></i> 📁 앨범/사진 선택
              </label>
              <input type="file" id="pc-gallery-input" accept="image/*" onchange="PillCounterModule.handleFileSelect(event)" style="display:none;">

              ${loadedImage ? `
                <button type="button" onclick="PillCounterModule.setInteractionMode('${interactionMode === 'EDIT' ? 'PAN' : 'EDIT'}')" style="background:${interactionMode === 'PAN' ? '#475569' : '#ffffff'}; color:${interactionMode === 'PAN' ? '#ffffff' : '#1e40af'}; border:1px solid #cbd5e1; border-radius:10px; padding:7px 12px; font-size:12px; font-weight:800; cursor:pointer;">
                  ${interactionMode === 'EDIT' ? '✏️ 터치보정 모드' : '✋ 화면이동 모드'}
                </button>
              ` : ''}
            </div>

            ${loadedImage ? `
              <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                <!-- 🤖 AI 정밀 재분석 버튼 -->
                <button type="button" onclick="PillCounterModule.streamGeminiVision()" ${isAiScanning ? 'disabled' : ''} style="background:linear-gradient(135deg,#7c3aed,#6d28d9); color:#ffffff; border:none; border-radius:10px; padding:7px 12px; font-size:12px; font-weight:800; cursor:pointer; box-shadow:0 2px 8px rgba(124,58,237,0.3);" title="구글 Gemini AI 실시간 스트리밍으로 정밀하게 다시 판독합니다">
                  🔄 AI 재분석
                </button>
                <!-- ⚡ 간이분석 (비상용) 버튼 -->
                <button type="button" onclick="PillCounterModule.runLocalVisionFallback()" ${isAiScanning ? 'disabled' : ''} style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; border-radius:10px; padding:7px 10px; font-size:11.5px; font-weight:800; cursor:pointer;" title="인터넷이 불안정할 때 스마트폰/PC 자체 비전으로 0.1초 즉시 카운팅합니다">
                  ⚡ 간이분석(비상용)
                </button>
                <button type="button"
                  onmousedown="PillCounterModule.setHideMarkersTemp(true)"
                  onmouseup="PillCounterModule.setHideMarkersTemp(false)"
                  onmouseleave="PillCounterModule.setHideMarkersTemp(false)"
                  ontouchstart="PillCounterModule.setHideMarkersTemp(true); event.preventDefault();"
                  ontouchend="PillCounterModule.setHideMarkersTemp(false); event.preventDefault();"
                  style="background:${hideMarkersTemp ? '#f59e0b' : '#0f172a'}; color:#ffffff; border:none; border-radius:10px; padding:7px 11px; font-size:12px; font-weight:800; cursor:pointer; user-select:none;">
                  👁️ 원본비교
                </button>
                <button type="button" onclick="PillCounterModule.undoLastAction()" ${undoStack.length === 0 ? 'disabled' : ''} style="background:#ffffff; color:#334155; border:1px solid #cbd5e1; border-radius:10px; padding:7px 10px; font-size:12px; font-weight:700; cursor:pointer; opacity:${undoStack.length === 0 ? '0.4' : '1'};">
                  ↩️
                </button>
                <button type="button" onclick="PillCounterModule.resetAll()" style="background:#fff1f2; color:#e11d48; border:1px solid #fecdd3; border-radius:10px; padding:7px 10px; font-size:12px; font-weight:800; cursor:pointer;">
                  🗑️
                </button>
              </div>
            ` : ''}
          </div>

          <!-- 캔버스 뷰포트 본체 -->
          <div id="pc-canvas-viewport" style="background:#0f172a; min-height:400px; max-height:72vh; position:relative; overflow:hidden; display:flex; align-items:center; justify-content:center; touch-action:none;">
            ${loadedImage ? `
              <canvas id="pc-main-canvas" style="max-width:100%; max-height:70vh; cursor:${interactionMode === 'PAN' ? 'grab' : 'crosshair'}; display:block;"></canvas>
              ${isAiScanning ? `
                <div id="pc-stream-status-overlay" style="position:absolute; top:14px; left:50%; transform:translateX(-50%); background:rgba(15,23,42,0.88); color:#ffffff; padding:8px 20px; border-radius:24px; border:1.5px solid rgba(139,92,246,0.65); display:flex; align-items:center; gap:10px; z-index:20; backdrop-filter:blur(6px); box-shadow:0 8px 24px rgba(0,0,0,0.45); pointer-events:none;">
                  <span class="fas fa-brain fa-spin" style="color:#c084fc; font-size:15px;"></span>
                  <div style="display:flex; align-items:center; gap:8px;">
                    <span style="font-size:13px; font-weight:900; letter-spacing:-0.2px;">AI 실시간 스트리밍 판독 중...</span>
                    <span id="pc-stream-pill-counter-pill" style="background:linear-gradient(135deg,#7c3aed,#2563eb); color:#ffffff; padding:2px 10px; border-radius:14px; font-size:12px; font-weight:900;">
                      ${markers.length}정 실시간 감지
                    </span>
                  </div>
                </div>
              ` : ''}
              ${scanNotice ? `
                <div style="position:absolute; bottom:12px; left:50%; transform:translateX(-50%); background:rgba(217,119,6,0.92); color:#ffffff; padding:5px 14px; border-radius:12px; font-size:12px; font-weight:800; z-index:18; box-shadow:0 4px 12px rgba(0,0,0,0.3);">
                  ${escapeHtml(scanNotice)}
                </div>
              ` : ''}
            ` : `
              <div style="text-align:center; padding:44px 20px; color:#94a3b8;">
                <div style="width:62px; height:62px; border-radius:20px; background:rgba(56,189,248,0.12); border:2px dashed rgba(56,189,248,0.4); color:#38bdf8; display:flex; align-items:center; justify-content:center; font-size:25px; margin:0 auto 12px auto;">
                  <i class="fas fa-pills"></i>
                </div>
                <h4 style="color:#f8fafc; font-size:16px; font-weight:800; margin-bottom:6px;">
                  상단 [📸 바로 카메라 촬영] 또는 [📁 앨범/사진 선택]을 눌러주세요
                </h4>
                <p style="font-size:12.5px; color:#94a3b8; max-width:480px; margin:0 auto 16px auto; line-height:1.5;">
                  • 사진을 찍으면 <strong>Gemini AI 실시간 스트리밍</strong>으로 번호가 화면에 즉시 찍힙니다.<br>
                  • <strong>[💾 근거 기록저장]</strong> 시 조제 검수 사진과 함께 <strong>2단계 전용 AI 학습 데이터</strong>가 자동 누적됩니다.
                </p>
                <button type="button" onclick="PillCounterModule.loadDemoSample()" style="background:rgba(245,158,11,0.18); color:#fde68a; border:1px solid rgba(251,191,36,0.45); border-radius:10px; padding:8px 16px; font-size:12.5px; font-weight:800; cursor:pointer;">
                  🧪 샘플 45정 테스트해보기
                </button>
              </div>
            `}
          </div>

          <!-- 캔버스 하단 안내 & 돋보기 줌 바 -->
          ${loadedImage ? `
            <div style="background:#f8fafc; padding:8px 14px; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; font-size:12px; color:#475569;">
              <div>
                💡 빈 알약 터치 <strong style="color:#16a34a;">+1 추가</strong> / 번호 터치 <strong style="color:#dc2626;">-1 삭제</strong>
              </div>
              <div style="display:flex; align-items:center; gap:4px;">
                <span style="font-weight:700;">🔍</span>
                <button type="button" onclick="PillCounterModule.changeZoom(-0.25)" style="border:1px solid #cbd5e1; background:#fff; border-radius:6px; padding:1px 7px; font-weight:800;">-</button>
                <span style="font-weight:800; min-width:38px; text-align:center;">${Math.round(zoomLevel * 100)}%</span>
                <button type="button" onclick="PillCounterModule.changeZoom(0.25)" style="border:1px solid #cbd5e1; background:#fff; border-radius:6px; padding:1px 7px; font-weight:800;">+</button>
                <button type="button" onclick="PillCounterModule.resetZoomPan()" style="border:1px solid #cbd5e1; background:#fff; border-radius:6px; padding:1px 7px; font-size:11px; font-weight:700;">맞춤</button>
              </div>
            </div>
          ` : ''}
        </div>

        <!-- 4. 📂 조제 검수 근거 보관함 -->
        <div class="card shadow-sm" style="border-radius:16px; border:1.5px solid #cbd5e1; background:#ffffff; padding:16px 18px;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
            <div>
              <h4 style="font-size:15px; font-weight:900; color:#0f172a; margin:0; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                <span>📂 조제 검수 근거 보관함</span>
                <span id="pc-history-total-count" style="background:#e0f2fe; color:#0369a1; padding:2px 9px; border-radius:20px; font-size:11.5px; font-weight:800;">
                  ${historySearchQuery.trim() ? `검색 ${filteredHistory.length}건 / 전체 ${historyList.length}건` : `총 ${historyList.length}건`}
                </span>
                <span style="font-size:11px; font-weight:700; color:#059669;">• ☁️ Cloudinary 사진 저장 (앱 속도 영향 0%)</span>
              </h4>
            </div>

            ${historyList.length > 0 ? `
              <button type="button" onclick="PillCounterModule.clearHistory()" style="background:none; border:none; color:#ef4444; font-size:11.5px; font-weight:800; cursor:pointer;">전체 비우기</button>
            ` : ''}
          </div>

          <!-- 🔍 실시간 검색바 -->
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
            <div style="position:relative; flex:1;">
              <input type="text" id="pc-history-search" class="form-control form-control-sm"
                placeholder="🔍 사람이름(환자명), 약이름(약품명), 알약 개수, 날짜로 검색하세요... (예: 홍길동, 리피토, 45)"
                value="${escapeHtml(historySearchQuery)}"
                oninput="PillCounterModule.onHistorySearchInput(this.value)"
                style="width:100%; border-radius:10px; padding:8px 14px; font-size:13px; font-weight:700; border:1.5px solid #94a3b8; background:#f8fafc;">
            </div>
            <button type="button" id="pc-clear-search-btn" onclick="PillCounterModule.clearHistorySearch()"
              style="display:${historySearchQuery.trim() ? 'inline-block' : 'none'}; background:#f1f5f9; color:#334155; border:1px solid #cbd5e1; border-radius:10px; padding:7px 12px; font-size:12px; font-weight:800; cursor:pointer; white-space:nowrap;">
              ✕ 검색초기화
            </button>
          </div>

          <div id="pc-history-items-container">
            ${buildHistoryItemsHTML()}
          </div>
        </div>

        <!-- 🖼️ 증거 사진 크게 보기 모달 -->
        ${previewRecord ? renderPhotoPreviewModalHTML(previewRecord) : ''}

        <!-- 🤖 Gemini AI 비전 API 키 설정 모달 -->
        ${showAiConfigModal ? renderAiConfigModalHTML() : ''}
      </div>
    `;

    if (loadedImage) {
      requestAnimationFrame(() => {
        bindCanvasEvents();
        drawCanvas();
      });
    }

    requestAnimationFrame(() => {
      if (savedScrollY > 0) window.scrollTo({ top: savedScrollY, behavior: 'instant' });
      if (savedContainerScroll > 0) container.scrollTop = savedContainerScroll;
    });
  }

  function renderPhotoPreviewModalHTML(rec) {
    const pName = rec.patientName && rec.patientName !== '미입력' ? rec.patientName : '이름 미입력';
    return `
      <div onclick="PillCounterModule.closePhotoModal()" style="position:fixed; inset:0; background:rgba(15,23,42,0.82); z-index:999998; display:flex; align-items:center; justify-content:center; padding:16px; backdrop-filter:blur(3px);">
        <div onclick="event.stopPropagation()" style="background:#ffffff; border-radius:20px; max-width:780px; width:100%; overflow:hidden; box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);">
          <div style="background:#0f172a; color:#ffffff; padding:14px 20px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <div>
              <div style="font-size:16px; font-weight:900; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                <span style="background:#2563eb; color:#fff; padding:2px 9px; border-radius:6px; font-size:13px;">👤 ${escapeHtml(pName)}</span>
                <span>💊 ${escapeHtml(rec.drugName || '조제 알약')}</span>
                <span style="color:#34d399; font-size:18px; font-weight:900;">총 ${rec.totalCount}정 검수완료</span>
              </div>
              <div style="font-size:12px; color:#94a3b8; margin-top:3px;">
                🕒 검수 일시: ${escapeHtml(rec.timeStr || '')} | 담당: ${escapeHtml(rec.userName || '약사')}
                ${rec.targetCount > 0 ? ` | 처방 목표량: ${rec.targetCount}정` : ''}
              </div>
            </div>
            <button type="button" onclick="PillCounterModule.closePhotoModal()" style="background:rgba(255,255,255,0.15); border:none; color:#ffffff; width:34px; height:34px; border-radius:10px; font-size:20px; font-weight:900; cursor:pointer;">&times;</button>
          </div>

          <div style="background:#090d16; text-align:center; max-height:68vh; overflow:auto; padding:12px;">
            ${rec.photoUrl ? `
              <img src="${escapeHtml(rec.photoUrl)}" alt="조제검수 증거사진" style="max-width:100%; max-height:64vh; border-radius:10px; border:1px solid #334155;">
            ` : `
              <div style="padding:36px 20px; color:#cbd5e1;">
                <div style="font-size:32px; margin-bottom:8px;">📷</div>
                <div style="font-size:14.5px; font-weight:800; color:#ffffff; margin-bottom:6px;">
                  이 기록은 이전 버전에서 사진이 누락되어 저장된 내역입니다.
                </div>
                <div style="font-size:12.5px; color:#94a3b8; margin-bottom:14px;">
                  새로 촬영 후 <strong>[💾 근거 기록저장]</strong>을 누르시면 번호(1~N)가 찍힌 알약 사진이 함께 저장됩니다.
                </div>
                ${loadedImage ? `
                  <button type="button" onclick="PillCounterModule.attachCurrentPhotoToRecord('${escapeHtml(rec.id)}')" style="background:#2563eb; color:#ffffff; border:none; border-radius:10px; padding:9px 18px; font-size:13px; font-weight:900; cursor:pointer; box-shadow:0 4px 12px rgba(37,99,235,0.4);">
                    📸 현재 화면의 번호 찍힌 알약 사진을 '${escapeHtml(pName)}' 기록에 바로 연결하기
                  </button>
                ` : ''}
              </div>
            `}
          </div>

          <div style="padding:12px 18px; background:#f8fafc; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <span style="font-size:12px; color:#475569; font-weight:700;">
              💡 각 알약 위에 고유 번호(1~${rec.totalCount})가 마킹되어 조제 수량이 검증된 사진입니다.
            </span>
            <div style="display:flex; gap:8px;">
              ${rec.photoUrl ? `
                <a href="${escapeHtml(rec.photoUrl)}" target="_blank" rel="noopener" class="btn btn-sm btn-outline-primary" style="border-radius:8px; font-weight:800; font-size:12px;">
                  🔗 원본 새창 열기
                </a>
              ` : ''}
              <button type="button" onclick="PillCounterModule.closePhotoModal()" class="btn btn-sm btn-dark" style="border-radius:8px; font-weight:800; font-size:12px; padding:6px 16px;">닫기</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderAiConfigModalHTML() {
    const savedKey = getGeminiApiKey();
    const rf = getRoboflowConfig();
    return `
      <div style="position:fixed; inset:0; background:rgba(15,23,42,0.7); z-index:999999; display:flex; align-items:center; justify-content:center; padding:16px;">
        <div style="background:#ffffff; border-radius:20px; max-width:500px; width:100%; padding:22px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.4);">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <h3 style="font-size:16.5px; font-weight:900; color:#4c1d95; margin:0;">🔑 Gemini AI 키 설정 (약국 전 기기 자동 공유)</h3>
            <button type="button" onclick="PillCounterModule.closeAiSettingsModal()" style="background:none; border:none; font-size:24px; color:#64748b; cursor:pointer;">&times;</button>
          </div>
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px 12px; font-size:12px; color:#334155; margin-bottom:12px; line-height:1.5;">
            • <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener" style="color:#2563eb; font-weight:800; text-decoration:underline;">Google AI Studio</a>에서 복사한 <code>AIzaSy...</code> 키를 붙여넣으시면 약국 내 모든 기기에 자동 공유됩니다.
          </div>
          <div class="mb-3">
            <input type="text" id="pc-gemini-key-input" class="form-control" placeholder="AIzaSy... API 키 붙여넣기" value="${escapeHtml(savedKey)}" style="width:100%; border-radius:10px; font-size:13px; font-weight:700; padding:9px 12px; border:1.5px solid #8b5cf6;">
          </div>

          <div style="border-top:1px dashed #cbd5e1; padding-top:12px; margin-bottom:12px;">
            <div style="font-size:14px; font-weight:900; color:#047857; margin-bottom:6px;">🎯 알약 전용 YOLO AI (Roboflow) — 1~2초 판독 (선택)</div>
            <div style="background:#ecfdf5; border:1px solid #a7f3d0; border-radius:10px; padding:9px 12px; font-size:11.5px; color:#065f46; margin-bottom:8px; line-height:1.55;">
              • 입력하면 <strong>1순위 YOLO(1~2초) → 실패 시 Gemini → 간이분석</strong> 순으로 자동 전환됩니다.<br>
              • <a href="https://app.roboflow.com" target="_blank" rel="noopener" style="color:#047857; font-weight:800; text-decoration:underline;">Roboflow</a> 무료 가입 → Settings → API Keys에서 <strong>Private API Key</strong> 복사<br>
              • <a href="https://universe.roboflow.com/search?q=pill%20counting" target="_blank" rel="noopener" style="color:#047857; font-weight:800; text-decoration:underline;">Roboflow Universe</a>에서 알약 모델을 골라 우리 약 사진으로 먼저 테스트 후, 모델 ID(<code>프로젝트명/버전번호</code>)를 복사
            </div>
            <input type="text" id="pc-roboflow-key-input" class="form-control mb-2" placeholder="Roboflow Private API Key" value="${escapeHtml(rf.apiKey)}" style="width:100%; border-radius:10px; font-size:13px; font-weight:700; padding:8px 12px; border:1.5px solid #10b981;">
            <div style="display:grid; grid-template-columns:1fr 110px; gap:8px;">
              <input type="text" id="pc-roboflow-model-input" class="form-control" placeholder="모델 ID 예: pill-counting-xxxx/3" value="${escapeHtml(rf.modelId)}" style="width:100%; border-radius:10px; font-size:13px; font-weight:700; padding:8px 12px; border:1.5px solid #10b981;">
              <input type="number" min="5" max="90" step="5" id="pc-roboflow-conf-input" class="form-control text-center" title="확신도 기준(%) — 낮추면 더 많이 잡고, 높이면 엄격해짐" value="${rf.confidence}" style="width:100%; border-radius:10px; font-size:13px; font-weight:800; padding:8px 6px; border:1.5px solid #10b981;">
            </div>
            <div style="font-size:11px; color:#64748b; margin-top:4px;">우측 숫자 = 확신도 기준(%) · 덜 세면 낮추고(예: 30), 더 세면 높이세요(예: 55)</div>
          </div>
          <div style="display:flex; justify-content:flex-end; gap:8px;">
            <button type="button" onclick="PillCounterModule.closeAiSettingsModal()" class="btn btn-sm btn-secondary" style="border-radius:8px; padding:7px 14px;">닫기</button>
            <button type="button" onclick="PillCounterModule.saveAiSettingsKey()" class="btn btn-sm btn-primary font-bold" style="border-radius:8px; padding:7px 18px; background:#6d28d9; border:none; color:#fff;">💾 저장</button>
          </div>
        </div>
      </div>
    `;
  }

  // ============================================================================
  // ⚡ [엔진 1] 초고속 로컬 비전 알고리즘 (Distance Transform Watershed Peak) — 0.1초 즉시 카운팅
  // ============================================================================
  function runLocalVisionFallback() {
    runLocalVisionPillCounter('⚡간이 0.1초');
  }

  function runLocalVisionPillCounter(customEngineName) {
    if (!loadedImage) return;
    const startTime = performance.now();

    // 540px로 다운스케일하여 ~20만 픽셀 내외로 메모리 최적화 (JS 연산 시간 30ms 이내 보장)
    const maxDim = 540;
    const sc = Math.min(1, maxDim / Math.max(imageWidth, imageHeight));
    const w = Math.max(1, Math.round(imageWidth * sc));
    const h = Math.max(1, Math.round(imageHeight * sc));

    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const ctx = off.getContext('2d');
    ctx.drawImage(loadedImage, 0, 0, w, h);
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;

    // 1. 가장자리 4변 테두리를 샘플링하여 조제대/트레이 배경색 추정
    let sumR = 0, sumG = 0, sumB = 0, countBg = 0;
    for (let x = 0; x < w; x += 3) {
      let i1 = (0 * w + x) * 4;
      sumR += d[i1]; sumG += d[i1 + 1]; sumB += d[i1 + 2];
      let i2 = ((h - 1) * w + x) * 4;
      sumR += d[i2]; sumG += d[i2 + 1]; sumB += d[i2 + 2];
      countBg += 2;
    }
    for (let y = 0; y < h; y += 3) {
      let i1 = (y * w + 0) * 4;
      sumR += d[i1]; sumG += d[i1 + 1]; sumB += d[i1 + 2];
      let i2 = (y * w + (w - 1)) * 4;
      sumR += d[i2]; sumG += d[i2 + 1]; sumB += d[i2 + 2];
      countBg += 2;
    }
    const bgR = countBg > 0 ? (sumR / countBg) : 40;
    const bgG = countBg > 0 ? (sumG / countBg) : 40;
    const bgB = countBg > 0 ? (sumB / countBg) : 40;

    // 2. 배경과의 색상 유클리드 거리로 알약 픽셀(이진 마스크) 검출
    const bin = new Uint8Array(w * h);
    let fgCount = 0;
    const colorThreshold = 24;

    for (let i = 0, p = 0; i < d.length; i += 4, p++) {
      const dr = d[i] - bgR;
      const dg = d[i + 1] - bgG;
      const db = d[i + 2] - bgB;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      if (dist >= colorThreshold) {
        bin[p] = 1;
        fgCount++;
      }
    }

    // 만약 트레이와 알약 색이 비슷해 전경이 너무 적다면 적응형 명도(Luminance) 대비로 2차 보완
    if (fgCount < 300) {
      let totalLum = 0;
      const lum = new Uint8Array(w * h);
      for (let i = 0, p = 0; i < d.length; i += 4, p++) {
        lum[p] = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
        totalLum += lum[p];
      }
      const avgLum = totalLum / (w * h);
      for (let p = 0; p < w * h; p++) {
        if (Math.abs(lum[p] - avgLum) > 20) {
          bin[p] = 1;
        }
      }
    }

    // 3. 2패스 고속 유클리드 근사 거리 변환 (Chamfer Distance Transform)
    // 알약 내부 중심일수록 거리가 커지고, 붙어 있는 알약 사이 경계선은 거리가 얕아짐
    const distMap = new Float32Array(w * h);
    const INF = 9999;
    for (let p = 0; p < w * h; p++) {
      distMap[p] = bin[p] === 1 ? INF : 0;
    }

    // 순방향 패스 (좌상 -> 우하)
    for (let y = 1; y < h; y++) {
      for (let x = 1; x < w - 1; x++) {
        const p = y * w + x;
        if (distMap[p] > 0) {
          distMap[p] = Math.min(
            distMap[p],
            distMap[p - 1] + 1.0,
            distMap[p - w] + 1.0,
            distMap[p - w - 1] + 1.414,
            distMap[p - w + 1] + 1.414
          );
        }
      }
    }

    // 역방향 패스 (우하 -> 좌상)
    for (let y = h - 2; y >= 0; y--) {
      for (let x = w - 2; x >= 1; x--) {
        const p = y * w + x;
        if (distMap[p] > 0) {
          distMap[p] = Math.min(
            distMap[p],
            distMap[p + 1] + 1.0,
            distMap[p + w] + 1.0,
            distMap[p + w + 1] + 1.414,
            distMap[p + w - 1] + 1.414
          );
        }
      }
    }

    // 4. 로컬 피크(Local Maxima) 검출 -> 각 알약의 정중앙 좌표 검출
    const peaks = [];
    const minPillRadiusPx = 4;
    const maxPillRadiusPx = Math.min(w, h) * 0.14;

    for (let y = 2; y < h - 2; y++) {
      for (let x = 2; x < w - 2; x++) {
        const p = y * w + x;
        const val = distMap[p];
        if (val < minPillRadiusPx || val > maxPillRadiusPx) continue;

        let isMax = true;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            if (distMap[(y + dy) * w + (x + dx)] > val) {
              isMax = false;
              break;
            }
          }
          if (!isMax) break;
        }

        if (isMax) {
          peaks.push({ x, y, rPx: val });
        }
      }
    }

    // 5. 피크 간 거리 기반 비최대 억제(NMS)로 겹침 피크 정밀 병합
    peaks.sort((a, b) => b.rPx - a.rPx);
    const kept = [];
    for (let i = 0; i < peaks.length; i++) {
      const pk = peaks[i];
      let dup = false;
      const minSep = Math.max(minPillRadiusPx * 1.6, pk.rPx * 1.10);
      for (let j = 0; j < kept.length; j++) {
        if (Math.hypot(pk.x - kept[j].x, pk.y - kept[j].y) < minSep) {
          dup = true;
          break;
        }
      }
      if (!dup) {
        kept.push(pk);
      }
    }

    // 정규화 좌표(0.0 ~ 1.0)로 변환
    const detectedMarkers = kept.map((pk, idx) => ({
      id: 'loc_' + idx + '_' + Date.now(),
      x: pk.x / w,
      y: pk.y / h,
      r: Math.max(0.015, Math.min(0.038, (pk.rPx / Math.min(w, h)) * 0.95)),
      isManual: false
    }));

    sortMarkersReadingOrder(detectedMarkers);
    undoStack.push(JSON.parse(JSON.stringify(markers)));
    markers = detectedMarkers;
    lastScanElapsedSec = ((performance.now() - startTime) / 1000).toFixed(2);
    lastScanEngineName = customEngineName || '⚡로컬 0.1초';
    render('module-content');
  }

  // ============================================================================
  // 🎯 [엔진 1순위] 알약 전용 YOLO AI (Roboflow 클라우드) — 필아이와 같은 방식, 1~2초
  // - 사진을 1번만 보내면 모든 알약 위치를 한 번에 돌려받음 (글자 타이핑 방식이 아님)
  // - 실패하거나 키가 없으면 자동으로 Gemini AI(2순위)로 넘어감
  // ============================================================================
  async function runRoboflowYolo(currentToken) {
    const cfg = getRoboflowConfig();
    if (!cfg.apiKey || !cfg.modelId) throw new Error('Roboflow 미설정');

    const off = document.createElement('canvas');
    const maxDim = 1024;
    const sc = Math.min(1, maxDim / Math.max(imageWidth, imageHeight));
    off.width = Math.round(imageWidth * sc);
    off.height = Math.round(imageHeight * sc);
    off.getContext('2d').drawImage(loadedImage, 0, 0, off.width, off.height);
    const base64Data = off.toDataURL('image/jpeg', 0.85).split(',')[1];

    const modelPath = cfg.modelId.replace(/^\/+|\/+$/g, '');
    const query = `api_key=${encodeURIComponent(cfg.apiKey)}&confidence=${cfg.confidence}&overlap=30`;
    const hosts = ['https://serverless.roboflow.com', 'https://detect.roboflow.com'];
    let lastErr = '';

    for (let h = 0; h < hosts.length; h++) {
      if (currentToken !== scanToken) return [];
      try {
        const resp = await fetch(`${hosts[h]}/${modelPath}?${query}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: base64Data,
          signal: scanAbortController ? scanAbortController.signal : undefined
        });
        if (!resp.ok) {
          lastErr = 'HTTP ' + resp.status;
          if (resp.status === 401 || resp.status === 403) break;
          continue;
        }
        const data = await resp.json();
        const preds = Array.isArray(data.predictions) ? data.predictions : [];
        const imgW = (data.image && Number(data.image.width)) || off.width;
        const imgH = (data.image && Number(data.image.height)) || off.height;
        const minDim = Math.min(imgW, imgH);

        const list = [];
        for (let i = 0; i < preds.length; i++) {
          const p = preds[i];
          const cx = Number(p.x) / imgW;
          const cy = Number(p.y) / imgH;
          if (isNaN(cx) || isNaN(cy) || cx < 0 || cx > 1 || cy < 0 || cy > 1) continue;
          const halfSize = Math.max(Number(p.width) || 0, Number(p.height) || 0) / 2 / minDim;
          list.push({
            id: 'yolo_' + i + '_' + Date.now(),
            x: cx,
            y: cy,
            r: Math.max(0.012, Math.min(0.038, halfSize || 0.022)),
            isManual: false
          });
        }
        return list;
      } catch (e) {
        if (e && e.name === 'AbortError') return [];
        lastErr = e.message || String(e);
      }
    }
    throw new Error(lastErr || 'Roboflow 응답 실패');
  }

  // ============================================================================
  // 🤖 [통합 판독] 1순위 YOLO(Roboflow) → 2순위 Gemini 고속 스트리밍 → 3순위 간이분석
  // - Gemini는 속생각(thinking) 0초 강제 차단 + 768px 단일 타일로 30초 → 수 초로 단축
  // - NMS 후처리: 겹침/이중 카운팅/절단선 분할 오인식 자동 병합
  // ============================================================================
  async function streamGeminiVision() {
    if (!loadedImage) return;
    const apiKey = getGeminiApiKey();
    const hasRoboflow = isRoboflowReady();
    if ((!apiKey || apiKey.length < 10) && !hasRoboflow) {
      showAiConfigModal = true;
      render('module-content');
      return;
    }

    scanToken++;
    const currentToken = scanToken;
    if (scanAbortController) {
      try { scanAbortController.abort(); } catch (e) {}
    }
    scanAbortController = new AbortController();

    isAiScanning = true;
    scanNotice = '';
    lastScanElapsedSec = '';
    markers = [];
    undoStack = [];
    const startTime = performance.now();
    render('module-content');

    try {
      // ---- 1순위: 알약 전용 YOLO (1~2초) ----
      if (hasRoboflow) {
        try {
          const yoloMarkers = await runRoboflowYolo(currentToken);
          if (currentToken !== scanToken) return;
          if (yoloMarkers.length > 0) {
            markers = postProcessAiBoxes(yoloMarkers);
            lastScanElapsedSec = ((performance.now() - startTime) / 1000).toFixed(1);
            lastScanEngineName = '🎯YOLO';
            return;
          }
          scanNotice = 'ℹ️ YOLO가 알약을 찾지 못해 Gemini AI로 다시 판독합니다.';
        } catch (yoloErr) {
          if (currentToken !== scanToken) return;
          scanNotice = 'ℹ️ YOLO 연결 실패(' + (yoloErr.message || '오류') + ') → Gemini AI로 판독합니다.';
        }
        if (!apiKey || apiKey.length < 10) {
          scanNotice = '⚠️ YOLO 판독 실패 → 비상 간이분석이 적용되었습니다.';
          runLocalVisionFallback();
          return;
        }
        updateScanNoticeOnly();
      }

      // ---- 2순위: Gemini 고속 스트리밍 ----
      // 768px 이하 = 구글 서버가 사진을 여러 조각으로 쪼개지 않는 크기 (처리량 최소화)
      const off = document.createElement('canvas');
      const maxDim = 768;
      const sc = Math.min(1, maxDim / Math.max(imageWidth, imageHeight));
      off.width = Math.round(imageWidth * sc);
      off.height = Math.round(imageHeight * sc);
      const ctx = off.getContext('2d');
      try {
        ctx.filter = 'contrast(1.08) saturate(1.05)';
      } catch (e) {}
      ctx.drawImage(loadedImage, 0, 0, off.width, off.height);

      const base64Data = off.toDataURL('image/jpeg', 0.85).split(',')[1];

      const promptText = [
        'Count and locate every individual pill, tablet, or capsule in this image.',
        'Rules:',
        '1. Return a JSON array of bounding boxes: [[ymin, xmin, ymax, xmax], ...]',
        '2. Coordinates must be integers from 0 to 1000 (0=top/left, 1000=bottom/right).',
        '3. Return ONE box per individual pill. If pills touch, detect each one separately.',
        '4. Do NOT split a single scored/grooved pill into two.',
        '5. Ignore tray edges, text, dust, reflections, and empty background.',
        'Output format: [[ymin,xmin,ymax,xmax],...] with NO commentary, NO markdown formatting.'
      ].join('\n');

      let streamSuccess = false;

      for (let m = 0; m < AI_MODEL_QUEUE.length; m++) {
        if (currentToken !== scanToken) return;
        const modelId = AI_MODEL_QUEUE[m];
        try {
          await executeSseStream(modelId, apiKey, base64Data, promptText, currentToken);
          streamSuccess = true;
          break;
        } catch (streamErr) {
          if (currentToken !== scanToken) return;
        }
      }

      if (currentToken !== scanToken) return;

      if (!streamSuccess || markers.length === 0) {
        try {
          const directJson = await callGeminiSingleDirect(apiKey, base64Data, promptText);
          let rawText = directJson?.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
          rawText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
          const parsedBoxes = extractBoxesFromText(rawText);
          if (parsedBoxes.length > 0) {
            markers = convertBoxesToMarkers(parsedBoxes);
            streamSuccess = true;
          }
        } catch (directErr) {}
      }

      if (currentToken !== scanToken) return;

      if (!streamSuccess || markers.length === 0) {
        scanNotice = '⚠️ AI 연결 지연으로 비상 간이분석이 적용되었습니다.';
        runLocalVisionFallback();
        return;
      }

      markers = postProcessAiBoxes(markers);
      lastScanElapsedSec = ((performance.now() - startTime) / 1000).toFixed(1);
      lastScanEngineName = '🤖AI';
    } catch (err) {
      if (currentToken !== scanToken) return;
      scanNotice = '⚠️ AI 연결 지연으로 비상 간이분석이 적용되었습니다.';
      runLocalVisionFallback();
    } finally {
      if (currentToken === scanToken) {
        isAiScanning = false;
        render('module-content');
      }
    }
  }

  async function executeSseStream(modelId, apiKey, base64Data, promptText, currentToken) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:streamGenerateContent?key=${encodeURIComponent(apiKey)}&alt=sse`;

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: promptText },
            { inline_data: { mime_type: 'image/jpeg', data: base64Data } }
          ]
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 4096,
          // ⚠️ 30초 지연의 주범: 2.5 모델의 '속생각(thinking)'을 0초로 강제 차단
          thinkingConfig: { thinkingBudget: 0 }
        }
      }),
      signal: scanAbortController.signal
    });

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let accumulatedText = '';
    const boxSet = new Set();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (currentToken !== scanToken) {
        try { reader.cancel(); } catch (e) {}
        return;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      let newlyFound = false;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line.startsWith('data:')) continue;
        const jsonStr = line.slice(5).trim();
        if (!jsonStr || jsonStr === '[DONE]') continue;

        try {
          const chunkData = JSON.parse(jsonStr);
          const chunkText = chunkData?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (chunkText) {
            accumulatedText += chunkText;
          }
        } catch (e) {}
      }

      const tupleRegex = /\[\s*(\d{1,4})\s*,\s*(\d{1,4})\s*,\s*(\d{1,4})\s*,\s*(\d{1,4})\s*\]/g;
      let match;
      while ((match = tupleRegex.exec(accumulatedText)) !== null) {
        const key = `${match[1]}_${match[2]}_${match[3]}_${match[4]}`;
        if (!boxSet.has(key)) {
          boxSet.add(key);
          const [ymin, xmin, ymax, xmax] = [Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4])];
          const m = createMarkerFromBox(ymin, xmin, ymax, xmax, markers.length);
          if (m) {
            markers.push(m);
            newlyFound = true;
          }
        }
      }

      if (newlyFound && currentToken === scanToken) {
        updateStreamingCounterDisplay();
        drawCanvas();
      }
    }
  }

  function createMarkerFromBox(ymin, xmin, ymax, xmax, idx) {
    let ny1 = ymin, nx1 = xmin, ny2 = ymax, nx2 = xmax;
    if (ny2 > 1.05 || nx2 > 1.05) {
      ny1 /= 1000; nx1 /= 1000; ny2 /= 1000; nx2 /= 1000;
    }
    const cx = (nx1 + nx2) / 2;
    const cy = (ny1 + ny2) / 2;
    const bw = Math.abs(nx2 - nx1);
    const bh = Math.abs(ny2 - ny1);

    if (isNaN(cx) || isNaN(cy) || cx < 0.005 || cx > 0.995 || cy < 0.005 || cy > 0.995) return null;
    const estR = Math.max(0.012, Math.min(0.038, Math.max(bw, bh) / 2));

    return {
      id: 'ai_' + idx + '_' + Date.now(),
      x: cx,
      y: cy,
      r: estR,
      isManual: false
    };
  }

  function updateStreamingCounterDisplay() {
    const numEl = document.getElementById('pc-current-count-num');
    if (numEl) numEl.textContent = String(markers.length);
    const streamPill = document.getElementById('pc-stream-pill-counter-pill');
    if (streamPill) streamPill.textContent = `${markers.length}정 실시간 감지`;
  }

  function extractBoxesFromText(rawText) {
    const list = [];
    if (!rawText) return list;
    const tupleRegex = /\[\s*(\d{1,4})\s*,\s*(\d{1,4})\s*,\s*(\d{1,4})\s*,\s*(\d{1,4})\s*\]/g;
    let match;
    while ((match = tupleRegex.exec(rawText)) !== null) {
      list.push([Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4])]);
    }
    return list;
  }

  function convertBoxesToMarkers(boxList) {
    const res = [];
    for (let i = 0; i < boxList.length; i++) {
      const b = boxList[i];
      const m = createMarkerFromBox(b[0], b[1], b[2], b[3], i);
      if (m) res.push(m);
    }
    return res;
  }

  function postProcessAiBoxes(list) {
    if (!list || list.length <= 1) return list || [];
    const kept = [];
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      let isDup = false;
      const mR = m.r || 0.022;
      for (let j = 0; j < kept.length; j++) {
        const k = kept[j];
        const kR = k.r || 0.022;
        const d = Math.hypot(m.x - k.x, m.y - k.y);
        const minDist = Math.max(0.012, Math.min(mR, kR) * 0.78);
        if (d < minDist) {
          isDup = true;
          k.x = (k.x + m.x) / 2;
          k.y = (k.y + m.y) / 2;
          k.r = Math.max(k.r, m.r);
          break;
        }
      }
      if (!isDup) {
        kept.push({
          id: 'ai_' + kept.length + '_' + Date.now(),
          x: m.x,
          y: m.y,
          r: m.r,
          isManual: false
        });
      }
    }
    sortMarkersReadingOrder(kept);
    return kept;
  }

  async function callGeminiSingleDirect(apiKey, base64Data, promptText) {
    const genConfig = {
      temperature: 0.1,
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingBudget: 0 }
    };

    let lastErr = '';
    for (let m = 0; m < AI_MODEL_QUEUE.length; m++) {
      const modelId = AI_MODEL_QUEUE[m];
      try {
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${encodeURIComponent(apiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { text: promptText },
                  { inline_data: { mime_type: 'image/jpeg', data: base64Data } }
                ]
              }],
              generationConfig: genConfig
            })
          }
        );

        if (resp.ok) {
          return await resp.json();
        }
        lastErr = 'HTTP ' + resp.status;
      } catch (netErr) {
        lastErr = netErr.message || String(netErr);
      }
    }

    throw new Error(lastErr || 'AI 서버 응답 실패');
  }

  function sortMarkersReadingOrder(list) {
    if (list.length <= 1) return;
    const avgR = list.reduce((s, m) => s + (m.r || 0.022), 0) / list.length;
    const rowBand = Math.max(0.032, avgR * 1.6);
    list.sort((a, b) => {
      const rowA = Math.round(a.y / rowBand);
      const rowB = Math.round(b.y / rowBand);
      if (rowA !== rowB) return rowA - rowB;
      return a.x - b.x;
    });
  }

  // ============================================================================
  // 인터랙티브 캔버스 렌더링
  // ============================================================================
  function drawCanvas() {
    const canvas = document.getElementById('pc-main-canvas');
    if (!canvas || !loadedImage) return;

    const dispW = Math.min(960, imageWidth);
    const dispH = Math.round(imageHeight * (dispW / imageWidth));
    if (canvas.width !== dispW || canvas.height !== dispH) {
      canvas.width = dispW;
      canvas.height = dispH;
    }

    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.clearRect(0, 0, dispW, dispH);

    ctx.translate(dispW / 2 + panX, dispH / 2 + panY);
    ctx.scale(zoomLevel, zoomLevel);
    ctx.translate(-dispW / 2, -dispH / 2);

    ctx.drawImage(loadedImage, 0, 0, dispW, dispH);

    if (!hideMarkersTemp) {
      const minDim = Math.min(dispW, dispH);

      for (let i = 0; i < markers.length; i++) {
        const m = markers[i];
        const cx = m.x * dispW;
        const cy = m.y * dispH;
        const baseR = Math.max(10, Math.min(20, (m.r || 0.022) * minDim * 0.72));

        ctx.beginPath();
        ctx.arc(cx, cy, baseR, 0, Math.PI * 2);
        ctx.fillStyle = m.isManual ? 'rgba(37, 99, 235, 0.90)' : 'rgba(5, 150, 105, 0.88)';
        ctx.fill();
        ctx.lineWidth = 1.8 / zoomLevel;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
        ctx.stroke();

        const fontSize = Math.max(9, Math.round(baseR * (i >= 99 ? 0.78 : 0.92)));
        ctx.font = `900 ${fontSize}px 'Outfit', sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(String(i + 1), cx, cy);
      }
    }

    ctx.restore();
  }

  function screenToNormalizedCoords(canvas, clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const rawX = (clientX - rect.left) * scaleX;
    const rawY = (clientY - rect.top) * scaleY;

    const unpannedX = rawX - (canvas.width / 2 + panX);
    const unpannedY = rawY - (canvas.height / 2 + panY);
    const imgX = unpannedX / zoomLevel + canvas.width / 2;
    const imgY = unpannedY / zoomLevel + canvas.height / 2;

    return {
      nx: imgX / canvas.width,
      ny: imgY / canvas.height
    };
  }

  function bindCanvasEvents() {
    const canvas = document.getElementById('pc-main-canvas');
    if (!canvas) return;

    canvas.onpointerdown = function (e) {
      if (!loadedImage || isAiScanning) return;
      if (interactionMode === 'PAN') {
        isDraggingPan = true;
        dragStartX = e.clientX - panX;
        dragStartY = e.clientY - panY;
        canvas.setPointerCapture(e.pointerId);
        return;
      }

      const { nx, ny } = screenToNormalizedCoords(canvas, e.clientX, e.clientY);
      if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return;

      undoStack.push(JSON.parse(JSON.stringify(markers)));
      if (undoStack.length > 25) undoStack.shift();

      const aspect = canvas.width / canvas.height;
      let hitIdx = -1;
      let minDist = Infinity;

      for (let i = 0; i < markers.length; i++) {
        const m = markers[i];
        const dx = (nx - m.x) * aspect;
        const dy = ny - m.y;
        const dist = Math.hypot(dx, dy);
        const hitRadius = Math.max(0.022, (m.r || 0.022) * 1.15);
        if (dist <= hitRadius && dist < minDist) {
          minDist = dist;
          hitIdx = i;
        }
      }

      if (hitIdx >= 0) {
        markers.splice(hitIdx, 1);
      } else {
        const avgR = markers.length > 0
          ? markers.reduce((s, m) => s + (m.r || 0.022), 0) / markers.length
          : 0.022;
        markers.push({
          id: 'man_' + Date.now(),
          x: nx,
          y: ny,
          r: avgR,
          isManual: true
        });
      }

      refreshDynamicZonesWithoutRender();
      drawCanvas();
    };

    canvas.onpointermove = function (e) {
      if (!isDraggingPan) return;
      panX = e.clientX - dragStartX;
      panY = e.clientY - dragStartY;
      drawCanvas();
    };

    canvas.onpointerup = function () {
      isDraggingPan = false;
    };
  }

  // ============================================================================
  // 사진 로드 & 데모 샘플
  // ============================================================================
  function handleFileSelect(event) {
    const file = event.target && event.target.files && event.target.files[0];
    if (!file) return;
    const objUrl = URL.createObjectURL(file);
    loadImageFromSrc(objUrl, null, true);
    event.target.value = '';
  }

  function loadImageFromSrc(src, demoMarkers = null, isObjectUrl = false) {
    const img = new Image();
    img.onload = function () {
      if (isObjectUrl) {
        try { URL.revokeObjectURL(src); } catch (e) {}
      }
      loadedImage = img;
      imageWidth = img.naturalWidth || img.width;
      imageHeight = img.naturalHeight || img.height;
      undoStack = [];
      zoomLevel = 1.0;
      panX = 0;
      panY = 0;

      if (demoMarkers) {
        markers = demoMarkers;
        lastScanElapsedSec = '0.05';
        lastScanEngineName = '⚡로컬 0.1초';
        render('module-content');
      } else {
        // 🤖 기본값으로 클라우드 Gemini AI 실시간 스트리밍 판독 자동 실행 (1~2초 내 실시간 마킹)
        const apiKey = getGeminiApiKey();
        if ((apiKey && apiKey.length > 10) || isRoboflowReady()) {
          streamGeminiVision();
        } else {
          runLocalVisionFallback();
          showAiConfigModal = true;
          render('module-content');
        }
      }
    };
    img.src = src;
  }

  function loadDemoSample() {
    const w = 960;
    const h = 640;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');

    const bgGrad = ctx.createRadialGradient(w * 0.42, h * 0.45, 50, w * 0.5, h * 0.5, 580);
    bgGrad.addColorStop(0, '#263244');
    bgGrad.addColorStop(1, '#131b26');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 6;
    ctx.strokeRect(28, 28, w - 56, h - 56);

    const pillCoords = [];
    const rng = (seed) => {
      const x = Math.sin(seed * 9999.123) * 10000;
      return x - Math.floor(x);
    };

    const pillR = 19;
    let seed = 101;
    while (pillCoords.length < 45) {
      seed++;
      const px = 95 + rng(seed * 2) * (w - 190);
      const py = 85 + rng(seed * 3) * (h - 170);
      let overlap = false;
      for (let i = 0; i < pillCoords.length; i++) {
        if (Math.hypot(px - pillCoords[i].x, py - pillCoords[i].y) < pillR * 2.25) {
          overlap = true;
          break;
        }
      }
      if (!overlap) {
        pillCoords.push({ x: px, y: py });
      }
    }

    const fallbackDemoMarkers = [];
    pillCoords.forEach((p, idx) => {
      ctx.beginPath();
      ctx.arc(p.x + 3, p.y + 4, pillR, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
      ctx.fill();

      const pGrad = ctx.createRadialGradient(p.x - 5, p.y - 5, 2, p.x, p.y, pillR);
      pGrad.addColorStop(0, '#fef9c3');
      pGrad.addColorStop(1, '#fde047');

      ctx.beginPath();
      ctx.arc(p.x, p.y, pillR, 0, Math.PI * 2);
      ctx.fillStyle = pGrad;
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(p.x - pillR * 0.55, p.y - 2);
      ctx.lineTo(p.x + pillR * 0.55, p.y + 2);
      ctx.strokeStyle = 'rgba(161, 98, 7, 0.25)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      fallbackDemoMarkers.push({
        id: 'demo_' + idx,
        x: p.x / w,
        y: p.y / h,
        r: pillR / Math.min(w, h),
        isManual: false
      });
    });

    sortMarkersReadingOrder(fallbackDemoMarkers);

    if (!drugNameInput) drugNameInput = '샘플 테스트정';
    if (!targetCount) targetCount = 45;

    loadImageFromSrc(c.toDataURL('image/jpeg', 0.90), fallbackDemoMarkers, false);
  }

  // ============================================================================
  // ☁️ 번호 마커(1~N)가 찍힌 증거 사진 직접 합성 & Cloudinary 업로드
  // ============================================================================
  function buildMarkedEvidenceJpeg(pName, dName, totalCount, timeStr, uName) {
    if (!loadedImage || !imageWidth || !imageHeight) return '';

    const maxW = 800;
    const sc = Math.min(1, maxW / Math.max(imageWidth, imageHeight));
    const imgW = Math.max(320, Math.round(imageWidth * sc));
    const imgH = Math.max(240, Math.round(imageHeight * sc));
    const stampH = 46;

    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = imgW;
    thumbCanvas.height = imgH + stampH;
    const tCtx = thumbCanvas.getContext('2d');

    tCtx.drawImage(loadedImage, 0, 0, imgW, imgH);

    const minDim = Math.min(imgW, imgH);
    for (let i = 0; i < markers.length; i++) {
      const m = markers[i];
      const cx = m.x * imgW;
      const cy = m.y * imgH;
      const baseR = Math.max(10, Math.min(20, (m.r || 0.022) * minDim * 0.72));

      tCtx.beginPath();
      tCtx.arc(cx, cy, baseR, 0, Math.PI * 2);
      tCtx.fillStyle = m.isManual ? 'rgba(37, 99, 235, 0.92)' : 'rgba(5, 150, 105, 0.90)';
      tCtx.fill();
      tCtx.lineWidth = 2;
      tCtx.strokeStyle = '#ffffff';
      tCtx.stroke();

      const fontSize = Math.max(9, Math.round(baseR * (i >= 99 ? 0.78 : 0.92)));
      tCtx.font = `900 ${fontSize}px sans-serif`;
      tCtx.textAlign = 'center';
      tCtx.textBaseline = 'middle';
      tCtx.fillStyle = '#ffffff';
      tCtx.fillText(String(i + 1), cx, cy);
    }

    tCtx.fillStyle = '#0f172a';
    tCtx.fillRect(0, imgH, imgW, stampH);
    tCtx.fillStyle = '#ffffff';
    tCtx.font = 'bold 13px sans-serif';
    tCtx.textAlign = 'left';
    tCtx.textBaseline = 'middle';
    const stampText = `[신세계약국 조제검수] 환자: ${pName}  |  약품: ${dName}  |  검수수량: ${totalCount}정  |  ${timeStr} (${uName})`;
    tCtx.fillText(stampText, 12, imgH + stampH / 2);

    return thumbCanvas.toDataURL('image/jpeg', 0.82);
  }

  function buildRawJpeg(maxW = 1024) {
    if (!loadedImage || !imageWidth || !imageHeight) return '';
    const sc = Math.min(1, maxW / Math.max(imageWidth, imageHeight));
    const rw = Math.round(imageWidth * sc);
    const rh = Math.round(imageHeight * sc);
    const canvas = document.createElement('canvas');
    canvas.width = rw;
    canvas.height = rh;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(loadedImage, 0, 0, rw, rh);
    return canvas.toDataURL('image/jpeg', 0.88);
  }

  async function saveCurrentInspection() {
    onTextMetaInput();

    const batchSum = batchCounts.reduce((acc, b) => acc + (Number(b.count) || 0), 0);
    const totalCount = batchSum + markers.length;
    if (totalCount <= 0 || isSavingCloud) return;

    const pName = (patientNameInput || '').trim() || '미입력';
    const dName = (drugNameInput || '').trim() || '조제 알약';
    const currUser = (window.SheetsSync && window.SheetsSync.getCurrentUser) ? window.SheetsSync.getCurrentUser() : null;
    const uName = currUser ? currUser.name : '약사';
    const now = new Date();
    const timeStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    let markedJpg = '';
    let rawJpg = '';
    try {
      markedJpg = buildMarkedEvidenceJpeg(pName, dName, totalCount, timeStr, uName);
      rawJpg = buildRawJpeg(1024);
    } catch (e) {}

    isSavingCloud = true;
    render('module-content');

    let cloudPhotoUrl = markedJpg;
    let rawCloudPhotoUrl = '';
    try {
      if (markedJpg && window.App && typeof window.App.processAndUploadPhoto === 'function') {
        const uploaded = await window.App.processAndUploadPhoto(markedJpg);
        if (uploaded) cloudPhotoUrl = uploaded;
      }
      if (rawJpg && window.App && typeof window.App.processAndUploadPhoto === 'function') {
        const uploadedRaw = await window.App.processAndUploadPhoto(rawJpg);
        if (uploadedRaw) rawCloudPhotoUrl = uploadedRaw;
      }
    } catch (e) {}

    const newRecord = {
      id: 'pch_' + Date.now(),
      createdAt: Date.now(),
      patientName: pName,
      drugName: dName,
      targetCount: targetCount || 0,
      totalCount,
      userName: uName,
      timeStr,
      photoUrl: cloudPhotoUrl
    };

    const list = getHistoryList();
    list.unshift(newRecord);
    saveHistoryList(list);

    // 🧠 [2단계 전용 AI 모델 준비] 약사가 검수한 정답 알약 좌표(YOLO format) + 깨끗한 원본 사진 Firebase 자동 누적
    try {
      const yoloBoxes = markers.map(m => ({
        class: 0,
        x_center: Number(m.x.toFixed(4)),
        y_center: Number(m.y.toFixed(4)),
        width: Number(((m.r || 0.022) * 2).toFixed(4)),
        height: Number(((m.r || 0.022) * 2).toFixed(4))
      }));

      const trainPayload = {
        rawPhotoUrl: rawCloudPhotoUrl || cloudPhotoUrl,
        pillCount: markers.length,
        drugName: dName,
        patientName: pName,
        targetCount: targetCount || 0,
        boxes: yoloBoxes,
        savedAt: Date.now(),
        savedBy: uName
      };

      fetch(FIREBASE_TRAIN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(trainPayload)
      }).then(() => {
        if (trainingCount !== null) {
          trainingCount++;
          updateTrainingCountOnly();
        }
      }).catch(() => {});
    } catch (e) {}

    isSavingCloud = false;
    render('module-content');
  }

  async function attachCurrentPhotoToRecord(recordId) {
    if (!loadedImage || isSavingCloud) return;
    const list = getHistoryList();
    const idx = list.findIndex(item => item.id === recordId);
    if (idx < 0) return;

    const rec = list[idx];
    const totalCount = markers.length > 0 ? markers.length : rec.totalCount;
    const jpgData = buildMarkedEvidenceJpeg(rec.patientName, rec.drugName, totalCount, rec.timeStr, rec.userName);
    if (!jpgData) return;

    isSavingCloud = true;
    let cloudPhotoUrl = jpgData;
    try {
      if (window.App && typeof window.App.processAndUploadPhoto === 'function') {
        const uploaded = await window.App.processAndUploadPhoto(jpgData);
        if (uploaded) cloudPhotoUrl = uploaded;
      }
    } catch (e) {}
    isSavingCloud = false;

    list[idx].photoUrl = cloudPhotoUrl;
    if (markers.length > 0) list[idx].totalCount = markers.length;
    saveHistoryList(list);
    previewRecord = list[idx];
    render('module-content');
  }

  // ============================================================================
  // UI 이벤트 핸들러
  // ============================================================================
  function onTextMetaInput() {
    const pEl = document.getElementById('pc-patient-name');
    const dEl = document.getElementById('pc-drug-name');
    if (pEl) patientNameInput = pEl.value;
    if (dEl) drugNameInput = dEl.value;
  }

  function onDirectTargetInput(val) {
    targetCount = Math.max(0, parseInt(val, 10) || 0);
    refreshDynamicZonesWithoutRender();
  }

  function onHistorySearchInput(val) {
    historySearchQuery = String(val || '');
    renderHistoryItemsOnly();
  }

  function clearHistorySearch() {
    historySearchQuery = '';
    const sInput = document.getElementById('pc-history-search');
    if (sInput) sInput.value = '';
    renderHistoryItemsOnly();
  }

  function openPhotoModal(recordId) {
    const list = getHistoryList();
    const found = list.find(item => item.id === recordId);
    if (!found) return;
    previewRecord = found;
    render('module-content');
  }

  function closePhotoModal() {
    previewRecord = null;
    render('module-content');
  }

  function editHistoryItem(recordId) {
    const list = getHistoryList();
    const idx = list.findIndex(item => item.id === recordId);
    if (idx < 0) return;

    const item = list[idx];
    const newPatient = prompt('👤 환자분 성함(사람이름)을 입력하세요:', item.patientName === '미입력' ? '' : item.patientName);
    if (newPatient === null) return;

    const newDrug = prompt('💊 약이름(약품명/메모)을 입력하세요:', item.drugName || '');
    if (newDrug === null) return;

    list[idx].patientName = newPatient.trim() || '미입력';
    list[idx].drugName = newDrug.trim() || '조제 알약';
    saveHistoryList(list);
    renderHistoryItemsOnly();
  }

  function deleteHistoryItem(recordId) {
    if (!confirm('이 조제 검수 기록을 삭제하시겠습니까?')) return;
    const list = getHistoryList().filter(item => item.id !== recordId);
    saveHistoryList(list);
    renderHistoryItemsOnly();
  }

  function setQuickTarget(num) {
    targetCount = Number(num) || 0;
    if (targetCount === 0) {
      const tEl = document.getElementById('pc-target-count');
      if (tEl) tEl.value = '';
    }
    refreshDynamicZonesWithoutRender();
  }

  function setInteractionMode(mode) {
    interactionMode = mode;
    render('module-content');
  }

  function setHideMarkersTemp(hide) {
    hideMarkersTemp = !!hide;
    drawCanvas();
  }

  function undoLastAction() {
    if (undoStack.length === 0) return;
    markers = undoStack.pop();
    render('module-content');
  }

  function changeZoom(delta) {
    zoomLevel = Math.min(3.5, Math.max(1.0, +(zoomLevel + delta).toFixed(2)));
    if (zoomLevel === 1.0) {
      panX = 0;
      panY = 0;
    }
    render('module-content');
  }

  function resetZoomPan() {
    zoomLevel = 1.0;
    panX = 0;
    panY = 0;
    render('module-content');
  }

  function resetAll() {
    loadedImage = null;
    markers = [];
    undoStack = [];
    zoomLevel = 1.0;
    panX = 0;
    panY = 0;
    lastScanElapsedSec = '';
    lastScanEngineName = '';
    render('module-content');
  }

  function addCurrentToBatch() {
    if (markers.length === 0) return;
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    batchCounts.push({
      batchNo: batchCounts.length + 1,
      count: markers.length,
      timeStr
    });
    loadedImage = null;
    markers = [];
    undoStack = [];
    render('module-content');
  }

  function clearBatches() {
    batchCounts = [];
    render('module-content');
  }

  function clearHistory() {
    if (!confirm('저장된 조제 검수 근거 기록을 모두 비우시겠습니까?')) return;
    saveHistoryList([]);
    renderHistoryItemsOnly();
  }

  function openAiSettingsModal() {
    showAiConfigModal = true;
    render('module-content');
  }

  function closeAiSettingsModal() {
    showAiConfigModal = false;
    render('module-content');
  }

  async function saveAiSettingsKey() {
    const input = document.getElementById('pc-gemini-key-input');
    const val = input ? input.value.trim() : '';
    const rfKeyEl = document.getElementById('pc-roboflow-key-input');
    const rfModelEl = document.getElementById('pc-roboflow-model-input');
    const rfConfEl = document.getElementById('pc-roboflow-conf-input');
    const rfKey = rfKeyEl ? rfKeyEl.value.trim() : '';
    // 사용자가 Universe 주소 전체를 붙여넣어도 "프로젝트/버전" 형태로 정리
    let rfModel = rfModelEl ? rfModelEl.value.trim() : '';
    rfModel = rfModel.replace(/^https?:\/\/[^/]+\//i, '').replace(/\/model\//i, '/').replace(/\?.*$/, '');
    const rfParts = rfModel.split('/').filter(Boolean);
    if (rfParts.length >= 3) rfModel = rfParts.slice(-2).join('/');
    const rfConf = rfConfEl ? (parseInt(rfConfEl.value, 10) || 40) : 40;

    try {
      if (val) localStorage.setItem(GEMINI_KEY_STORAGE, val);
      else localStorage.removeItem(GEMINI_KEY_STORAGE);
      if (rfKey) localStorage.setItem(ROBOFLOW_KEY_STORAGE, rfKey);
      else localStorage.removeItem(ROBOFLOW_KEY_STORAGE);
      if (rfModel) localStorage.setItem(ROBOFLOW_MODEL_STORAGE, rfModel);
      else localStorage.removeItem(ROBOFLOW_MODEL_STORAGE);
      localStorage.setItem(ROBOFLOW_CONF_STORAGE, String(Math.max(5, Math.min(90, rfConf))));
    } catch (e) {}

    await pushAiConfigToCloud();
    showAiConfigModal = false;

    if (rfKey && rfModel && rfModel.indexOf('/') < 0) {
      alert('⚠️ Roboflow 모델 ID는 "프로젝트명/버전번호" 형식이어야 합니다. (예: pill-counting-abcd/3)');
    }

    if (val || isRoboflowReady()) {
      const parts = [];
      if (isRoboflowReady()) parts.push('🎯 YOLO(1순위)');
      if (val) parts.push('🤖 Gemini(2순위)');
      alert('✅ AI 설정이 저장되어 약국 내 모든 기기에 공유되었습니다!\n사용 엔진: ' + parts.join(' → '));
      if (loadedImage) {
        streamGeminiVision();
        return;
      }
    } else {
      alert('ℹ️ AI 키가 모두 삭제되었습니다.');
    }
    render('module-content');
  }

  return {
    render,
    handleFileSelect,
    loadDemoSample,
    onTextMetaInput,
    onDirectTargetInput,
    onHistorySearchInput,
    clearHistorySearch,
    openPhotoModal,
    closePhotoModal,
    editHistoryItem,
    deleteHistoryItem,
    setQuickTarget,
    setInteractionMode,
    setHideMarkersTemp,
    undoLastAction,
    changeZoom,
    resetZoomPan,
    streamGeminiVision,
    runLocalVisionFallback,
    runLocalVisionPillCounter,
    runSingleFastGeminiAI: streamGeminiVision,
    resetAll,
    addCurrentToBatch,
    clearBatches,
    saveCurrentInspection,
    attachCurrentPhotoToRecord,
    clearHistory,
    openAiSettingsModal,
    closeAiSettingsModal,
    saveAiSettingsKey
  };
})();
