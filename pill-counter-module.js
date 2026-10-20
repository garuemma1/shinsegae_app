/**
 * 🔢 스마트 알약 카운터 & 조제 검수기 모듈 (v2.4 환자 클레임 대비 증거보관함 & 타이핑 점프 방지 에디션)
 * - 무소음 초경량 설계: 음성/오디오 버퍼 전면 제거, 앱 실행 속도 영향 0%
 * - Cloudinary 연동: 검수 저장 시 번호 마커가 찍힌 증거 사진을 Cloudinary URL로만 저장 (로컬 Base64 0KB)
 * - 환자 클레임 대비 근거 보관함: [👤 사람이름 | 💊 약이름 | 🔢 개수 | 🖼️ 증거사진] 리스트 + 실시간 초고속 검색 + 증거사진 확대 모달
 * - 한글 타이핑 중 화면 점프 원천 차단: 모든 입력창(oninput)에서 전체 리렌더링(innerHTML 교체)을 제거하여 포커스/스크롤 100% 고정
 * - 5배속 초고속 AI 판독: thinkingBudget:0 즉시 응답 + 840px 고대비 샤프닝 + 초단축 JSON 프로토콜 적용
 */
window.PillCounterModule = (function () {
  const HISTORY_STORAGE_KEY = 'ssg_pill_counter_history_v1';
  const GEMINI_KEY_STORAGE = 'ssg_pill_gemini_api_key_v1';
  const WORKING_MODEL_STORAGE = 'ssg_pill_working_model_v1';
  const FIREBASE_AI_CONFIG_URL = 'https://shinsegae-pharmacy-default-rtdb.firebaseio.com/shinsegae_master_db/pillCounterConfig.json';
  const FIREBASE_HISTORY_URL = 'https://shinsegae-pharmacy-default-rtdb.firebaseio.com/shinsegae_master_db/pillCounterHistory.json';

  // --- 상태 변수 ---
  let loadedImage = null;
  let imageWidth = 0;
  let imageHeight = 0;
  let markers = [];             // [{ id, x, y, r, box: [ymin,xmin,ymax,xmax], isManual, isOutlier }]
  let undoStack = [];

  let showBoundingBoxes = true;
  let interactionMode = 'EDIT'; // 'EDIT' (+1/-1 터치보정) | 'PAN' (✋ 화면 이동)
  let hideMarkersTemp = false;
  let zoomLevel = 1.0;
  let panX = 0;
  let panY = 0;
  let isDraggingPan = false;
  let dragStartX = 0;
  let dragStartY = 0;

  // 환자명 / 약품명 / 처방전 조제 계산기 & 다회차 합산 상태
  let patientNameInput = '';
  let drugNameInput = '';
  let rxDose = '';
  let rxFreq = '';
  let rxDays = '';
  let targetCount = 0;
  let batchCounts = [];

  // 검수 근거 보관함 검색어 & 사진 확대 모달 상태
  let historySearchQuery = '';
  let previewRecord = null;     // 클릭하여 확대 보기 중인 검수 기록 객체

  // 진행 상태
  let isAiScanning = false;
  let isSavingCloud = false;
  let showAiConfigModal = false;
  let cloudKeyLoaded = false;
  let cloudHistoryLoaded = false;

  // --- 현재 사용자가 입력창에 타이핑 중인지 확인 (타이핑 중 리렌더링으로 인한 포커스/스크롤 점프 원천 차단) ---
  function isUserTypingInInput() {
    const el = document.activeElement;
    if (!el) return false;
    const tag = (el.tagName || '').toUpperCase();
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  }

  // --- 클라우드(Firebase) 공용 Gemini API 키 자동 동기화 ---
  async function syncGeminiKeyFromCloud() {
    if (cloudKeyLoaded) return;
    cloudKeyLoaded = true;
    try {
      const localKey = getGeminiApiKey();
      const res = await fetch(`${FIREBASE_AI_CONFIG_URL}?t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data && data.geminiApiKey && String(data.geminiApiKey).trim().length > 10) {
          const cloudKey = String(data.geminiApiKey).trim();
          if (cloudKey !== localKey) {
            localStorage.setItem(GEMINI_KEY_STORAGE, cloudKey);
            updateAiStatusBadgeOnly();
          }
        } else if (localKey && localKey.length > 10) {
          await pushGeminiKeyToCloud(localKey);
        }
      }
    } catch (e) {}
  }

  async function pushGeminiKeyToCloud(apiKey) {
    try {
      await fetch(FIREBASE_AI_CONFIG_URL, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          geminiApiKey: apiKey || '',
          updatedAt: Date.now()
        })
      });
    } catch (e) {}
  }

  // --- 클라우드(Firebase) 검수 근거 기록 동기화 (약국 내 모든 PC/폰에서 환자 클레임 근거 공유, 이미지 URL만 저장하여 초경량) ---
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
      // Base64 데이터는 절대 저장하지 않고 Cloudinary URL(http/https)만 보관하여 앱 속도 100% 보호
      photoUrl: rawPhoto.startsWith('http') ? rawPhoto : ''
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

  // --- 부분 DOM 업데이트 헬퍼 (입력창 포커스/스크롤 유지용) ---
  function updateAiStatusBadgeOnly() {
    const badge = document.getElementById('pc-ai-status-badge');
    if (!badge) return;
    const hasApiKey = getGeminiApiKey().length > 10;
    badge.style.background = hasApiKey ? 'rgba(16,185,129,0.22)' : 'rgba(245,158,11,0.25)';
    badge.style.borderColor = hasApiKey ? 'rgba(52,211,153,0.5)' : 'rgba(251,191,36,0.5)';
    badge.style.color = hasApiKey ? '#6ee7b7' : '#fde68a';
    badge.textContent = hasApiKey ? '⚡ 초고속 AI 비전 가동 중' : '⚠️ AI 키 등록 필요';
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
          아직 저장된 조제 검수 근거 기록이 없습니다. 상단에서 <strong>사람이름·약이름</strong>을 적고 <strong>[💾 기록저장]</strong>을 누르면 사진과 함께 이곳에 영구 보관됩니다.
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
          const hasPhoto = item.photoUrl && item.photoUrl.startsWith('http');
          const pName = item.patientName && item.patientName !== '미입력' ? item.patientName : '이름 미입력';
          const isNameMissing = !item.patientName || item.patientName === '미입력';
          return `
            <div style="padding:10px 12px; background:#f8fafc; border:1.5px solid #e2e8f0; border-radius:12px; display:flex; align-items:center; justify-content:space-between; gap:10px; transition:all 0.15s;">
              <div style="display:flex; align-items:center; gap:10px; min-width:0; flex:1;">
                ${hasPhoto ? `
                  <div onclick="PillCounterModule.openPhotoModal('${escapeHtml(item.id)}')" title="클릭하여 증거 사진 크게 보기" style="width:54px; height:54px; border-radius:10px; overflow:hidden; flex-shrink:0; border:1.5px solid #94a3b8; cursor:pointer; position:relative; background:#0f172a;">
                    <img src="${escapeHtml(item.photoUrl)}" alt="검수사진" loading="lazy" style="width:100%; height:100%; object-fit:cover; display:block;">
                    <span style="position:absolute; bottom:0; right:0; background:rgba(15,23,42,0.8); color:#fff; font-size:9px; padding:1px 4px; font-weight:800;">🔍확대</span>
                  </div>
                ` : `
                  <div style="width:54px; height:54px; border-radius:10px; background:#e2e8f0; color:#64748b; display:flex; align-items:center; justify-content:center; font-size:18px; flex-shrink:0;">
                    💊
                  </div>
                `}

                <div style="min-width:0; flex:1;">
                  <!-- 1줄: 사람이름 + 약이름 -->
                  <div style="display:flex; align-items:center; gap:5px; flex-wrap:wrap; margin-bottom:2px;">
                    <span style="background:${isNameMissing ? '#f1f5f9' : '#dbeafe'}; color:${isNameMissing ? '#64748b' : '#1e40af'}; border:1px solid ${isNameMissing ? '#cbd5e1' : '#93c5fd'}; padding:1px 7px; border-radius:6px; font-size:12px; font-weight:900;">
                      👤 ${escapeHtml(pName)}
                    </span>
                    <span style="font-size:13px; font-weight:900; color:#0f172a; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                      💊 ${escapeHtml(item.drugName || '조제 알약')}
                    </span>
                  </div>

                  <!-- 2줄: 검수 일시 + 담당자 + 수정/삭제 -->
                  <div style="font-size:11px; color:#64748b; display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                    <span>🕒 ${escapeHtml(item.timeStr || '')}</span>
                    <span>• ${escapeHtml(item.userName || '약사')}</span>
                    <button type="button" onclick="PillCounterModule.editHistoryItem('${escapeHtml(item.id)}')" style="background:none; border:none; color:#2563eb; font-size:11px; font-weight:800; padding:0; cursor:pointer;">[✏️수정]</button>
                    <button type="button" onclick="PillCounterModule.deleteHistoryItem('${escapeHtml(item.id)}')" style="background:none; border:none; color:#dc2626; font-size:11px; font-weight:800; padding:0; cursor:pointer;">[삭제]</button>
                  </div>
                </div>
              </div>

              <!-- 우측: 알약 개수 & 증거사진 버튼 -->
              <div style="text-align:right; flex-shrink:0;">
                <div style="font-size:18px; font-weight:900; color:#047857; line-height:1.1;">
                  ${item.totalCount}<span style="font-size:12px; font-weight:800; margin-left:1px;">정</span>
                </div>
                ${item.targetCount > 0 ? (item.totalCount === item.targetCount
                  ? `<div style="font-size:10.5px; font-weight:800; color:#059669;">✅ 목표(${item.targetCount}) 일치</div>`
                  : `<div style="font-size:10.5px; font-weight:800; color:#d97706;">목표 ${item.targetCount}정</div>`
                ) : ''}
                ${hasPhoto ? `
                  <button type="button" onclick="PillCounterModule.openPhotoModal('${escapeHtml(item.id)}')" style="margin-top:3px; background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; border-radius:6px; padding:2px 7px; font-size:10.5px; font-weight:800; cursor:pointer;">
                    🖼️ 증거사진
                  </button>
                ` : ''}
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

    const container = document.getElementById(containerId || 'module-content');
    if (!container) return;

    // 스크롤 위치 보존 (화면 점프 방지)
    const savedScrollY = window.scrollY || window.pageYOffset || 0;
    const savedContainerScroll = container.scrollTop || 0;

    const hasApiKey = getGeminiApiKey().length > 10;
    const currCount = markers.length;
    const outlierMarkers = markers.filter(m => m.isOutlier);
    const batchSum = batchCounts.reduce((acc, b) => acc + (Number(b.count) || 0), 0);
    const totalEffectiveCount = batchSum + currCount;
    const historyList = getHistoryList();
    const filteredHistory = getFilteredHistoryList();

    // 이종 알약 경보 배너
    let outlierBannerHTML = '';
    if (outlierMarkers.length > 0 && !isAiScanning) {
      outlierBannerHTML = `
        <div style="background:#faf5ff; border:1.5px solid #9333ea; color:#581c87; border-radius:14px; padding:10px 16px; margin-bottom:12px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
          <div style="font-size:13px; font-weight:800;">
            🚨 모양이나 색상이 다른 알약 <strong>${outlierMarkers.length}정</strong>이 감지되었습니다! (보라색 <strong style="color:#9333ea;">!</strong> 마커 확인)
          </div>
          <button type="button" onclick="PillCounterModule.clearOutlierFlags()" style="background:#ffffff; color:#6b21a8; border:1px solid #d8b4fe; border-radius:8px; padding:3px 10px; font-size:11.5px; font-weight:700; cursor:pointer;">
            정상 확인
          </button>
        </div>
      `;
    }

    container.innerHTML = `
      <div class="pill-counter-wrapper" style="max-width:1100px; margin:0 auto; padding-bottom:36px;">
        
        <!-- 1. 슬림 헤더 -->
        <div class="card shadow-sm mb-3" style="border-radius:18px; border:1px solid #cbd5e1; background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%); color:#ffffff; padding:14px 20px;">
          <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
            <div class="d-flex align-items-center gap-2 flex-wrap">
              <h2 style="font-size:19px; font-weight:900; margin:0; color:#ffffff; letter-spacing:-0.4px;">
                🔢 스마트 알약 카운터 & 조제 근거 보관함
              </h2>
              <span id="pc-ai-status-badge" style="background:${hasApiKey ? 'rgba(16,185,129,0.22)' : 'rgba(245,158,11,0.25)'}; border:1px solid ${hasApiKey ? 'rgba(52,211,153,0.5)' : 'rgba(251,191,36,0.5)'}; color:${hasApiKey ? '#6ee7b7' : '#fde68a'}; padding:2px 10px; border-radius:20px; font-size:11px; font-weight:800;">
                ${hasApiKey ? '⚡ 초고속 AI 비전 가동 중' : '⚠️ AI 키 등록 필요'}
              </span>
            </div>

            <button type="button" onclick="PillCounterModule.openAiSettingsModal()" style="background:rgba(255,255,255,0.12); color:#ffffff; border:1px solid rgba(255,255,255,0.25); border-radius:10px; padding:6px 12px; font-size:12px; font-weight:800; cursor:pointer;">
              🔑 ${hasApiKey ? 'AI 키 설정' : '무료 AI 키 등록'}
            </button>
          </div>
        </div>

        <!-- 2. 환자명(사람이름) · 약품명(약이름) · 목표수량 입력 & 실시간 카운트 전광판 -->
        <div class="row g-3 mb-3">
          <div class="col-lg-7">
            <div class="card shadow-sm h-100" style="border-radius:16px; border:1px solid #cbd5e1; background:#ffffff; padding:14px 16px;">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <span style="font-size:13px; font-weight:800; color:#0f172a;">
                  📝 조제 근거 정보 입력 <span style="font-size:11px; font-weight:600; color:#64748b;">(사람이름·약이름 입력 후 저장 시 클레임 증거로 보관)</span>
                </span>
                <span id="pc-reset-target-wrap">
                  ${targetCount > 0 ? `
                    <button type="button" onclick="PillCounterModule.setQuickTarget(0)" style="background:#fee2e2; color:#dc2626; border:none; border-radius:6px; padding:2px 8px; font-size:11px; font-weight:800; cursor:pointer;">목표 초기화</button>
                  ` : ''}
                </span>
              </div>
              <div class="row g-2 align-items-end">
                <div class="col-sm-3 col-6">
                  <label style="font-size:11px; font-weight:800; color:#1e40af; display:block; margin-bottom:2px;">👤 사람이름(환자명)</label>
                  <input type="text" id="pc-patient-name" class="form-control form-control-sm" placeholder="예: 홍길동" value="${escapeHtml(patientNameInput)}" oninput="PillCounterModule.onTextMetaInput()" style="border-radius:8px; font-weight:800; border:1.5px solid #93c5fd; background:#f8fafc;">
                </div>
                <div class="col-sm-3 col-6">
                  <label style="font-size:11px; font-weight:800; color:#0f172a; display:block; margin-bottom:2px;">💊 약이름(약품명)</label>
                  <input type="text" id="pc-drug-name" class="form-control form-control-sm" placeholder="예: 리피토정" value="${escapeHtml(drugNameInput)}" oninput="PillCounterModule.onTextMetaInput()" style="border-radius:8px; font-weight:800; border:1.5px solid #cbd5e1;">
                </div>
                <div class="col-sm-1 col-3" style="min-width:52px;">
                  <label style="font-size:10.5px; font-weight:700; color:#64748b; display:block; margin-bottom:2px;">1회</label>
                  <input type="number" step="0.5" min="0" id="pc-rx-dose" class="form-control form-control-sm text-center px-1" placeholder="1" value="${rxDose}" oninput="PillCounterModule.onRxCalcInput()" style="border-radius:8px; font-weight:800;">
                </div>
                <div class="col-sm-1 col-3" style="min-width:52px;">
                  <label style="font-size:10.5px; font-weight:700; color:#64748b; display:block; margin-bottom:2px;">횟수</label>
                  <input type="number" step="1" min="0" id="pc-rx-freq" class="form-control form-control-sm text-center px-1" placeholder="3" value="${rxFreq}" oninput="PillCounterModule.onRxCalcInput()" style="border-radius:8px; font-weight:800;">
                </div>
                <div class="col-sm-2 col-3">
                  <label style="font-size:10.5px; font-weight:700; color:#64748b; display:block; margin-bottom:2px;">일수</label>
                  <input type="number" step="1" min="0" id="pc-rx-days" class="form-control form-control-sm text-center px-1" placeholder="30" value="${rxDays}" oninput="PillCounterModule.onRxCalcInput()" style="border-radius:8px; font-weight:800;">
                </div>
                <div class="col-sm-2 col-3">
                  <label style="font-size:11px; font-weight:800; color:#1d4ed8; display:block; margin-bottom:2px;">🎯 목표개수</label>
                  <input type="number" step="1" min="0" id="pc-target-count" class="form-control form-control-sm text-center px-1" placeholder="선택" value="${targetCount || ''}" oninput="PillCounterModule.onDirectTargetInput(this.value)" style="border-radius:8px; font-weight:900; border:1.5px solid #2563eb; background:#eff6ff; color:#1e40af;">
                </div>
              </div>
            </div>
          </div>

          <div class="col-lg-5">
            <div class="card shadow-sm h-100" style="border-radius:16px; border:2px solid #10b981; background:linear-gradient(135deg,#ecfdf5 0%,#f0fdf4 100%); padding:12px 18px; display:flex; flex-direction:column; justify-content:center;">
              <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
                <div>
                  <div style="font-size:11.5px; font-weight:800; color:#047857;">📸 감지된 알약 개수</div>
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

                <!-- 단일화된 액션 버튼: [➕ 누적] & [💾 기록저장] -->
                <div class="d-flex flex-column gap-1 align-items-end">
                  <div class="d-flex gap-1">
                    <button type="button" onclick="PillCounterModule.addCurrentToBatch()" ${currCount === 0 || isAiScanning ? 'disabled' : ''} style="background:#059669; color:#ffffff; border:none; border-radius:10px; padding:7px 11px; font-size:12px; font-weight:800; cursor:pointer; opacity:${currCount === 0 ? '0.45' : '1'};">
                      ➕ 누적(${batchCounts.length + 1}차)
                    </button>
                    <button type="button" onclick="PillCounterModule.saveCurrentInspection()" ${totalEffectiveCount === 0 || isSavingCloud ? 'disabled' : ''} style="background:#1d4ed8; color:#ffffff; border:none; border-radius:10px; padding:7px 13px; font-size:12.5px; font-weight:900; cursor:pointer; box-shadow:0 3px 8px rgba(29,78,216,0.25); opacity:${totalEffectiveCount === 0 ? '0.45' : '1'};">
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
        </div>

        <!-- 목표 대비 일치/부족/초과 배너 영역 (타이핑 시 이 영역만 부분 갱신되어 스크롤 점프 없음) -->
        <div id="pc-verify-banner-zone">${buildVerifyBannerHTML()}</div>
        ${outlierBannerHTML}

        <!-- 3. 올인원 카운팅 보드 (상단 원버튼 촬영 + 인터랙티브 캔버스 통합) -->
        <div class="card shadow-sm mb-3" style="border-radius:18px; border:1px solid #cbd5e1; background:#ffffff; overflow:hidden;">
          
          <!-- 상단 컨트롤 바: 스마트폰 직통 카메라(capture="environment") + 앨범/PC 사진 선택 -->
          <div style="background:#f8fafc; padding:10px 14px; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <div class="d-flex align-items-center gap-2 flex-wrap">
              <!-- 📸 1. 스마트폰 바로 카메라 촬영 (capture="environment" 필수 적용) -->
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
                  ${interactionMode === 'EDIT' ? '✏️ 터치보정 모드 (✋이동 전환)' : '✋ 화면이동 모드 (✏️보정 전환)'}
                </button>
              ` : ''}
            </div>

            ${loadedImage ? `
              <div class="d-flex align-items-center gap-1 flex-wrap">
                <button type="button"
                  onmousedown="PillCounterModule.setHideMarkersTemp(true)"
                  onmouseup="PillCounterModule.setHideMarkersTemp(false)"
                  onmouseleave="PillCounterModule.setHideMarkersTemp(false)"
                  ontouchstart="PillCounterModule.setHideMarkersTemp(true); event.preventDefault();"
                  ontouchend="PillCounterModule.setHideMarkersTemp(false); event.preventDefault();"
                  style="background:${hideMarkersTemp ? '#f59e0b' : '#0f172a'}; color:#ffffff; border:none; border-radius:10px; padding:7px 12px; font-size:12px; font-weight:800; cursor:pointer; user-select:none;">
                  👁️ 원본비교(누르기)
                </button>
                <button type="button" onclick="PillCounterModule.undoLastAction()" ${undoStack.length === 0 ? 'disabled' : ''} style="background:#ffffff; color:#334155; border:1px solid #cbd5e1; border-radius:10px; padding:7px 10px; font-size:12px; font-weight:700; cursor:pointer; opacity:${undoStack.length === 0 ? '0.4' : '1'};">
                  ↩️
                </button>
                <button type="button" onclick="PillCounterModule.runGeminiAIVision(true)" ${isAiScanning ? 'disabled' : ''} style="background:#f5f3ff; color:#6d28d9; border:1px solid #ddd6fe; border-radius:10px; padding:7px 11px; font-size:12px; font-weight:800; cursor:pointer;">
                  🔄 재분석
                </button>
                <button type="button" onclick="PillCounterModule.resetAll()" style="background:#fff1f2; color:#e11d48; border:1px solid #fecdd3; border-radius:10px; padding:7px 10px; font-size:12px; font-weight:800; cursor:pointer;">
                  🗑️
                </button>
              </div>
            ` : ''}
          </div>

          <!-- 캔버스 뷰포트 본체 -->
          <div id="pc-canvas-viewport" style="background:#0f172a; min-height:420px; max-height:72vh; position:relative; overflow:hidden; display:flex; align-items:center; justify-content:center; touch-action:none;">
            ${loadedImage ? `
              <canvas id="pc-main-canvas" style="max-width:100%; max-height:70vh; cursor:${interactionMode === 'PAN' ? 'grab' : 'crosshair'}; display:block;"></canvas>
              ${isAiScanning ? `
                <div style="position:absolute; inset:0; background:rgba(15,23,42,0.68); display:flex; flex-direction:column; align-items:center; justify-content:center; color:#ffffff; z-index:20; backdrop-filter:blur(2px);">
                  <div style="width:54px; height:54px; border-radius:16px; background:linear-gradient(135deg,#7c3aed,#2563eb); display:flex; align-items:center; justify-content:center; font-size:24px; margin-bottom:10px;">
                    <i class="fas fa-bolt fa-spin"></i>
                  </div>
                  <div style="font-size:16.5px; font-weight:900; margin-bottom:4px;">
                    ⚡ 초고속 AI가 알약 개수를 읽는 중입니다...
                  </div>
                  <div style="font-size:12px; color:#cbd5e1;">
                    고대비 압축 전송으로 빠르게 좌표를 추출하고 있습니다
                  </div>
                </div>
              ` : ''}
            ` : `
              <div style="text-align:center; padding:48px 20px; color:#94a3b8;">
                <div style="width:64px; height:64px; border-radius:20px; background:rgba(56,189,248,0.12); border:2px dashed rgba(56,189,248,0.4); color:#38bdf8; display:flex; align-items:center; justify-content:center; font-size:26px; margin:0 auto 12px auto;">
                  <i class="fas fa-pills"></i>
                </div>
                <h4 style="color:#f8fafc; font-size:16.5px; font-weight:800; margin-bottom:6px;">
                  상단 [📸 바로 카메라 촬영] 또는 [📁 앨범/사진 선택]을 눌러주세요
                </h4>
                <p style="font-size:12.5px; color:#94a3b8; max-width:460px; margin:0 auto 16px auto; line-height:1.5;">
                  • 어두운 바닥 위에 알약이 겹치지 않게 한 겹으로 펴놓고 찍으면 가장 빠르고 정확합니다.<br>
                  • 카운팅 후 <strong>사람이름·약이름</strong>을 적고 <strong>[💾 근거 기록저장]</strong>을 누르면 하단 보관함에 증거 사진이 저장됩니다.
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
                <button type="button" onclick="PillCounterModule.toggleBoundingBoxes(!${showBoundingBoxes})" style="margin-left:8px; border:1px solid #cbd5e1; background:#fff; border-radius:6px; padding:1px 7px; font-size:11px; font-weight:700;">
                  🔲 테두리 ${showBoundingBoxes ? 'ON' : 'OFF'}
                </button>
              </div>
              <div class="d-flex align-items-center gap-1">
                <span style="font-weight:700;">🔍</span>
                <button type="button" onclick="PillCounterModule.changeZoom(-0.25)" style="border:1px solid #cbd5e1; background:#fff; border-radius:6px; padding:1px 7px; font-weight:800;">-</button>
                <span style="font-weight:800; min-width:38px; text-align:center;">${Math.round(zoomLevel * 100)}%</span>
                <button type="button" onclick="PillCounterModule.changeZoom(0.25)" style="border:1px solid #cbd5e1; background:#fff; border-radius:6px; padding:1px 7px; font-weight:800;">+</button>
                <button type="button" onclick="PillCounterModule.resetZoomPan()" style="border:1px solid #cbd5e1; background:#fff; border-radius:6px; padding:1px 7px; font-size:11px; font-weight:700;">맞춤</button>
              </div>
            </div>
          ` : ''}
        </div>

        <!-- 4. 📂 조제 검수 근거 보관함 (환자 클레임 대비: 사람이름 / 약이름 / 개수 / 증거사진 + 실시간 검색) -->
        <div class="card shadow-sm" style="border-radius:16px; border:1.5px solid #cbd5e1; background:#ffffff; padding:16px 18px;">
          <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
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

          <!-- 🔍 실시간 검색바 (타이핑 시 아래 목록만 부분 갱신되어 한글 자모 깨짐/화면 점프 0%) -->
          <div class="d-flex align-items-center gap-2 mb-3">
            <div style="position:relative; flex:1;">
              <input type="text" id="pc-history-search" class="form-control form-control-sm"
                placeholder="🔍 사람이름(환자명), 약이름(약품명), 알약 개수, 날짜로 검색하세요... (예: 홍길동, 리피토, 45)"
                value="${escapeHtml(historySearchQuery)}"
                oninput="PillCounterModule.onHistorySearchInput(this.value)"
                style="border-radius:10px; padding:8px 14px; font-size:13px; font-weight:700; border:1.5px solid #94a3b8; background:#f8fafc;">
            </div>
            <button type="button" id="pc-clear-search-btn" onclick="PillCounterModule.clearHistorySearch()"
              style="display:${historySearchQuery.trim() ? 'inline-block' : 'none'}; background:#f1f5f9; color:#334155; border:1px solid #cbd5e1; border-radius:10px; padding:7px 12px; font-size:12px; font-weight:800; cursor:pointer; white-space:nowrap;">
              ✕ 검색초기화
            </button>
          </div>

          <!-- 저장된 근거 리스트 컨테이너 -->
          <div id="pc-history-items-container">
            ${buildHistoryItemsHTML()}
          </div>
        </div>

        <!-- 🖼️ 증거 사진 크게 보기 모달 (환자 클레임 시 화면 제시용) -->
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

    // 스크롤 복원
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
              <div style="padding:40px; color:#94a3b8;">저장된 사진이 없습니다.</div>
            `}
          </div>

          <div style="padding:12px 18px; background:#f8fafc; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <span style="font-size:12px; color:#475569; font-weight:700;">
              💡 각 알약 위에 고유 번호(1~${rec.totalCount})가 마킹되어 조제 수량이 검증된 사진입니다.
            </span>
            <div class="d-flex gap-2">
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
    return `
      <div style="position:fixed; inset:0; background:rgba(15,23,42,0.7); z-index:999999; display:flex; align-items:center; justify-content:center; padding:16px;">
        <div style="background:#ffffff; border-radius:20px; max-width:500px; width:100%; padding:22px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.4);">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <h3 style="font-size:16.5px; font-weight:900; color:#4c1d95; margin:0;">🔑 Gemini AI 키 설정 (약국 전 기기 자동 공유)</h3>
            <button type="button" onclick="PillCounterModule.closeAiSettingsModal()" style="background:none; border:none; font-size:24px; color:#64748b; cursor:pointer;">&times;</button>
          </div>
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px 12px; font-size:12px; color:#334155; margin-bottom:12px; line-height:1.5;">
            • <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener" style="color:#2563eb; font-weight:800; text-decoration:underline;">Google AI Studio</a>에서 복사한 <code>AIzaSy...</code> 키를 붙여넣으시면 약국 내 모든 기기에 자동 공유됩니다.
          </div>
          <div class="mb-3">
            <input type="text" id="pc-gemini-key-input" class="form-control" placeholder="AIzaSy... API 키 붙여넣기" value="${escapeHtml(savedKey)}" style="border-radius:10px; font-size:13px; font-weight:700; padding:9px 12px; border:1.5px solid #8b5cf6;">
          </div>
          <div class="d-flex justify-content-end gap-2">
            <button type="button" onclick="PillCounterModule.closeAiSettingsModal()" class="btn btn-sm btn-secondary" style="border-radius:8px; padding:7px 14px;">닫기</button>
            <button type="button" onclick="PillCounterModule.saveAiSettingsKey()" class="btn btn-sm btn-primary font-bold" style="border-radius:8px; padding:7px 18px; background:#6d28d9; border:none;">💾 저장</button>
          </div>
        </div>
      </div>
    `;
  }

  // ============================================================================
  // ⚡ 5배속 초고속 AI 판독 엔진 (thinkingBudget:0 + 사전 모델조회 생략 + 840px 고대비 압축 + 초단축 JSON)
  // ============================================================================
  async function discoverAvailableGeminiModels(apiKey) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`);
      if (!res.ok) return [];
      const data = await res.json();
      const models = Array.isArray(data.models) ? data.models : [];
      const valid = [];
      for (let i = 0; i < models.length; i++) {
        const m = models[i];
        const methods = Array.isArray(m.supportedGenerationMethods) ? m.supportedGenerationMethods : [];
        if (!methods.includes('generateContent')) continue;
        const id = String(m.name || '').replace(/^models\//, '');
        if (!id.startsWith('gemini-')) continue;
        if (/2\.0-flash|1\.5-|1\.0-|embedding|tts|audio|imagen|veo|aqa|bisheng|robotics|computer-use|learnlm|thinking/i.test(id)) continue;
        valid.push(id);
      }
      valid.sort((a, b) => {
        const aFlash = a.includes('flash') ? 1 : 0;
        const bFlash = b.includes('flash') ? 1 : 0;
        if (aFlash !== bFlash) return bFlash - aFlash;
        return b.localeCompare(a);
      });
      return valid;
    } catch (e) {
      return [];
    }
  }

  async function tryGenerateWithModel(apiKey, modelId, base64Data, promptText, useThinkingZero = true) {
    const genConfig = {
      temperature: 0.0,
      responseMimeType: 'application/json'
    };
    if (useThinkingZero) {
      genConfig.thinkingConfig = { thinkingBudget: 0 };
    }

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
    return resp;
  }

  async function callGeminiFast(apiKey, base64Data, promptText) {
    const fastQueue = [];
    try {
      const cached = localStorage.getItem(WORKING_MODEL_STORAGE);
      if (cached && !cached.includes('2.0-flash')) fastQueue.push(cached);
    } catch (e) {}

    ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-3.0-flash'].forEach(m => {
      if (!fastQueue.includes(m)) fastQueue.push(m);
    });

    const tried = new Set();
    let lastErrorMsg = '';
    let discoveredLoaded = false;

    while (fastQueue.length > 0) {
      const modelId = fastQueue.shift();
      if (!modelId || tried.has(modelId)) continue;
      tried.add(modelId);

      try {
        let resp = await tryGenerateWithModel(apiKey, modelId, base64Data, promptText, true);

        if (resp.status === 400) {
          resp = await tryGenerateWithModel(apiKey, modelId, base64Data, promptText, false);
        }

        if (resp.ok) {
          try { localStorage.setItem(WORKING_MODEL_STORAGE, modelId); } catch (e) {}
          return await resp.json();
        }

        let errDetail = 'HTTP ' + resp.status;
        try {
          const errJson = await resp.json();
          if (errJson?.error?.message) errDetail = errJson.error.message;
        } catch (e) {}
        lastErrorMsg = errDetail;

        const hintMatch = errDetail.match(/models\/([a-zA-Z0-9._-]+)/);
        if (hintMatch && hintMatch[1] && !tried.has(hintMatch[1])) {
          fastQueue.unshift(hintMatch[1]);
          continue;
        }

        if (fastQueue.length === 0 && !discoveredLoaded) {
          discoveredLoaded = true;
          const discovered = await discoverAvailableGeminiModels(apiKey);
          discovered.forEach(d => {
            if (!tried.has(d)) fastQueue.push(d);
          });
        }
      } catch (netErr) {
        lastErrorMsg = netErr.message || String(netErr);
      }
    }

    throw new Error(lastErrorMsg || 'AI 서버 응답 실패');
  }

  async function runGeminiAIVision() {
    if (!loadedImage) return;
    const apiKey = getGeminiApiKey();
    if (!apiKey || apiKey.length < 10) {
      showAiConfigModal = true;
      render('module-content');
      return;
    }

    isAiScanning = true;
    render('module-content');

    try {
      const off = document.createElement('canvas');
      const maxDim = 840;
      const sc = Math.min(1, maxDim / Math.max(imageWidth, imageHeight));
      off.width = Math.round(imageWidth * sc);
      off.height = Math.round(imageHeight * sc);
      const ctx = off.getContext('2d');
      try {
        ctx.filter = 'contrast(1.08) saturate(1.05)';
      } catch (e) {}
      ctx.drawImage(loadedImage, 0, 0, off.width, off.height);

      const base64Data = off.toDataURL('image/jpeg', 0.80).split(',')[1];

      const promptText = [
        'Count every individual pill, tablet, or capsule in this image.',
        'Rules:',
        '1. Return ONE tight 2D bounding box [ymin, xmin, ymax, xmax] (integers 0 to 1000) per single pill.',
        '2. Do NOT split one pill into multiple boxes (ignore score lines, letters, or glare).',
        '3. Separate touching pills into individual boxes.',
        '4. Ignore background, tray edges, shadows, or dust.',
        '5. Add 5th integer: 1 if the pill has a clearly different color/shape from the majority (outlier), else 0.',
        'Output compact JSON ONLY: {"b":[[ymin,xmin,ymax,xmax,0]]}'
      ].join('\n');

      const json = await callGeminiFast(apiKey, base64Data, promptText);
      let rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      rawText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();

      let parsed = {};
      try {
        parsed = JSON.parse(rawText);
      } catch (parseErr) {
        if (rawText.charAt(0) === '\x5b') {
          parsed = { b: JSON.parse(rawText) };
        }
      }

      const rawList = Array.isArray(parsed.b)
        ? parsed.b
        : (Array.isArray(parsed.pills) ? parsed.pills : (Array.isArray(parsed) ? parsed : []));
      const cleanedPills = postProcessAiBoxes(rawList);

      undoStack.push(JSON.parse(JSON.stringify(markers)));
      markers = cleanedPills;
    } catch (err) {
      alert('⚠️ AI 스캔 오류:\n' + (err.message || err));
    } finally {
      isAiScanning = false;
      render('module-content');
    }
  }

  function postProcessAiBoxes(rawList) {
    const candidates = [];

    for (let i = 0; i < rawList.length; i++) {
      const item = rawList[i];
      if (!item) continue;

      let ymin, xmin, ymax, xmax, isOut = false;
      if (Array.isArray(item) && item.length >= 4) {
        ymin = Number(item[0]);
        xmin = Number(item[1]);
        ymax = Number(item[2]);
        xmax = Number(item[3]);
        isOut = Number(item[4]) === 1;
      } else if (Array.isArray(item.box_2d) && item.box_2d.length === 4) {
        [ymin, xmin, ymax, xmax] = item.box_2d.map(Number);
        isOut = !!item.isOutlier;
      } else {
        continue;
      }

      if (ymax <= 1.05 && xmax <= 1.05) {
        ymin *= 1000; xmin *= 1000; ymax *= 1000; xmax *= 1000;
      }

      if (isNaN(ymin) || isNaN(xmin) || isNaN(ymax) || isNaN(xmax)) continue;
      if (ymin > ymax) { const t = ymin; ymin = ymax; ymax = t; }
      if (xmin > xmax) { const t = xmin; xmin = xmax; xmax = t; }

      const bw = xmax - xmin;
      const bh = ymax - ymin;
      if (bw < 5 || bh < 5 || bw > 350 || bh > 350) continue;
      const aspect = Math.max(bw, bh) / Math.max(1, Math.min(bw, bh));
      if (aspect > 5.5) continue;

      const cx = (xmin + xmax) / 2000;
      const cy = (ymin + ymax) / 2000;
      const rNorm = Math.sqrt(bw * bh) / 2000;

      candidates.push({
        x: Math.min(0.99, Math.max(0.01, cx)),
        y: Math.min(0.99, Math.max(0.01, cy)),
        r: Math.min(0.08, Math.max(0.012, rNorm)),
        box: [ymin / 1000, xmin / 1000, ymax / 1000, xmax / 1000],
        isOutlier: isOut
      });
    }

    if (candidates.length === 0) return [];

    const sortedR = candidates.map(c => c.r).sort((a, b) => a - b);
    const medR = sortedR[Math.floor(sortedR.length / 2)] || 0.024;
    const sizeFiltered = candidates.filter(c => c.r >= medR * 0.38 && c.r <= medR * 2.8);

    const kept = [];
    const minCenterDist = medR * 0.85;

    for (let i = 0; i < sizeFiltered.length; i++) {
      const c = sizeFiltered[i];
      let isDuplicate = false;
      for (let j = 0; j < kept.length; j++) {
        const k = kept[j];
        const dist = Math.hypot(c.x - k.x, c.y - k.y);
        const iou = computeBoxIoU(c.box, k.box);
        if (dist < minCenterDist || iou > 0.48) {
          isDuplicate = true;
          break;
        }
      }
      if (!isDuplicate) {
        kept.push({
          id: 'ai_' + kept.length + '_' + Date.now(),
          x: c.x,
          y: c.y,
          r: Math.max(0.014, Math.min(0.055, medR * 0.92)),
          box: c.box,
          isManual: false,
          isOutlier: !!c.isOutlier
        });
      }
    }

    sortMarkersReadingOrder(kept);
    return kept;
  }

  function computeBoxIoU(b1, b2) {
    if (!b1 || !b2) return 0;
    const yA = Math.max(b1[0], b2[0]);
    const xA = Math.max(b1[1], b2[1]);
    const yB = Math.min(b1[2], b2[2]);
    const xB = Math.min(b1[3], b2[3]);
    const interW = Math.max(0, xB - xA);
    const interH = Math.min(1, Math.max(0, yB - yA));
    const interArea = interW * interH;
    if (interArea <= 0) return 0;
    const area1 = (b1[3] - b1[1]) * (b1[2] - b1[0]);
    const area2 = (b2[3] - b2[1]) * (b2[2] - b2[0]);
    return interArea / Math.max(0.00001, area1 + area2 - interArea);
  }

  function sortMarkersReadingOrder(list) {
    if (list.length <= 1) return;
    const avgR = list.reduce((s, m) => s + (m.r || 0.024), 0) / list.length;
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
        const baseR = Math.max(10, Math.min(22, (m.r || 0.022) * minDim * 0.72));

        if (showBoundingBoxes && m.box && m.box.length === 4) {
          const [ymin, xmin, ymax, xmax] = m.box;
          const bx = xmin * dispW;
          const by = ymin * dispH;
          const bw = (xmax - xmin) * dispW;
          const bh = (ymax - ymin) * dispH;
          ctx.strokeStyle = m.isOutlier ? 'rgba(147, 51, 234, 0.95)' : 'rgba(56, 189, 248, 0.82)';
          ctx.lineWidth = 1.8 / zoomLevel;
          ctx.strokeRect(bx, by, bw, bh);
        }

        if (m.isOutlier) {
          ctx.beginPath();
          ctx.arc(cx, cy, baseR * 1.45, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(147, 51, 234, 0.98)';
          ctx.lineWidth = 3 / zoomLevel;
          ctx.stroke();
        }

        ctx.beginPath();
        ctx.arc(cx, cy, baseR, 0, Math.PI * 2);
        ctx.fillStyle = m.isOutlier
          ? 'rgba(147, 51, 234, 0.92)'
          : (m.isManual ? 'rgba(37, 99, 235, 0.90)' : 'rgba(5, 150, 105, 0.88)');
        ctx.fill();
        ctx.lineWidth = 1.8 / zoomLevel;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
        ctx.stroke();

        const fontSize = Math.max(9, Math.round(baseR * (i >= 99 ? 0.78 : 0.92)));
        ctx.font = `900 ${fontSize}px 'Outfit', sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const label = m.isOutlier ? `${i + 1}!` : String(i + 1);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(label, cx, cy);
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
        const hitRadius = Math.max(0.022, (m.r || 0.024) * 1.15);
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
          box: [ny - avgR, nx - avgR, ny + avgR, nx + avgR],
          isManual: true,
          isOutlier: false
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
  // 사진 로드 & 데모 샘플 시뮬레이터 (메모리 즉시 해제 적용)
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

      if (demoMarkers && !getGeminiApiKey()) {
        markers = demoMarkers;
        render('module-content');
      } else {
        runGeminiAIVision();
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
    while (pillCoords.length < 44) {
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
        pillCoords.push({ x: px, y: py, isForeign: false });
      }
    }

    pillCoords.push({ x: w * 0.52, y: h * 0.51, isForeign: true });

    const fallbackDemoMarkers = [];
    pillCoords.forEach((p, idx) => {
      ctx.beginPath();
      ctx.arc(p.x + 3, p.y + 4, pillR, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
      ctx.fill();

      const pGrad = ctx.createRadialGradient(p.x - 5, p.y - 5, 2, p.x, p.y, pillR);
      if (p.isForeign) {
        pGrad.addColorStop(0, '#fda4af');
        pGrad.addColorStop(1, '#fb7185');
      } else {
        pGrad.addColorStop(0, '#fef9c3');
        pGrad.addColorStop(1, '#fde047');
      }
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

      const nx = p.x / w;
      const ny = p.y / h;
      const rx = pillR / w;
      const ry = pillR / h;
      fallbackDemoMarkers.push({
        id: 'demo_' + idx,
        x: nx,
        y: ny,
        r: pillR / Math.min(w, h),
        box: [ny - ry, nx - rx, ny + ry, nx + rx],
        isManual: false,
        isOutlier: !!p.isForeign
      });
    });

    sortMarkersReadingOrder(fallbackDemoMarkers);

    if (!drugNameInput) drugNameInput = '샘플 테스트정';
    if (!targetCount) {
      rxDose = '1';
      rxFreq = '3';
      rxDays = '15';
      targetCount = 45;
    }

    loadImageFromSrc(c.toDataURL('image/jpeg', 0.90), fallbackDemoMarkers, false);
  }

  // ============================================================================
  // ☁️ Cloudinary 증거 사진 업로드 연동 기록 저장 (하단 검수 워터마크 스탬프 합성)
  // ============================================================================
  async function saveCurrentInspection() {
    // 저장 직전 입력창의 최신 텍스트 동기화
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

    isSavingCloud = true;
    render('module-content');

    let cloudPhotoUrl = '';
    try {
      const canvas = document.getElementById('pc-main-canvas');
      if (canvas && window.App && typeof window.App.uploadPhotoToCloudinary === 'function') {
        // 마커가 찍힌 결과 화면 + 하단 검수 증명 스탬프 바를 합성하여 760px 경량 JPEG로 Cloudinary 업로드
        const sc = Math.min(1, 760 / Math.max(canvas.width, canvas.height));
        const imgW = Math.round(canvas.width * sc);
        const imgH = Math.round(canvas.height * sc);
        const stampH = 44;

        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.width = imgW;
        thumbCanvas.height = imgH + stampH;
        const tCtx = thumbCanvas.getContext('2d');

        // 상단: 번호 마커가 찍힌 알약 사진
        tCtx.drawImage(canvas, 0, 0, imgW, imgH);

        // 하단: 조제 검수 증명 스탬프 바 (환자명 | 약품명 | 수량 | 일시)
        tCtx.fillStyle = '#0f172a';
        tCtx.fillRect(0, imgH, imgW, stampH);
        tCtx.fillStyle = '#ffffff';
        tCtx.font = 'bold 13px sans-serif';
        tCtx.textBaseline = 'middle';
        const stampText = `[신세계약국 조제검수] 환자: ${pName}  |  약품: ${dName}  |  검수수량: ${totalCount}정  |  ${timeStr} (${uName})`;
        tCtx.fillText(stampText, 12, imgH + stampH / 2);

        const jpgData = thumbCanvas.toDataURL('image/jpeg', 0.80);
        const uploaded = await window.App.uploadPhotoToCloudinary(jpgData);
        if (uploaded && uploaded.startsWith('http')) {
          cloudPhotoUrl = uploaded;
        }
      }
    } catch (e) {}

    const list = getHistoryList();
    list.unshift({
      id: 'pch_' + Date.now(),
      createdAt: Date.now(),
      patientName: pName,
      drugName: dName,
      targetCount: targetCount || 0,
      totalCount,
      userName: uName,
      timeStr,
      photoUrl: cloudPhotoUrl
    });
    saveHistoryList(list);

    isSavingCloud = false;
    render('module-content');
  }

  // ============================================================================
  // UI 이벤트 핸들러 (타이핑 중 절대 render() 호출 금지 -> 한글 조합/스크롤 100% 고정!)
  // ============================================================================
  function onTextMetaInput() {
    const pEl = document.getElementById('pc-patient-name');
    const dEl = document.getElementById('pc-drug-name');
    if (pEl) patientNameInput = pEl.value;
    if (dEl) drugNameInput = dEl.value;
    // 절대 render()를 호출하지 않음! (포커스 유지 & 화면 아래로 점프 원천 방지)
  }

  function onRxCalcInput() {
    const doseEl = document.getElementById('pc-rx-dose');
    const freqEl = document.getElementById('pc-rx-freq');
    const daysEl = document.getElementById('pc-rx-days');

    if (doseEl) rxDose = doseEl.value;
    if (freqEl) rxFreq = freqEl.value;
    if (daysEl) rxDays = daysEl.value;

    const d = parseFloat(rxDose) || 0;
    const f = parseFloat(rxFreq) || 0;
    const dy = parseFloat(rxDays) || 0;
    if (d > 0 && f > 0 && dy > 0) {
      targetCount = Math.round(d * f * dy);
      const tInput = document.getElementById('pc-target-count');
      if (tInput) tInput.value = targetCount;
    }
    // 전체 리렌더링 대신 배너 영역만 부분 업데이트 (포커스/스크롤 유지)
    refreshDynamicZonesWithoutRender();
  }

  function onDirectTargetInput(val) {
    targetCount = Math.max(0, parseInt(val, 10) || 0);
    // 전체 리렌더링 대신 배너 영역만 부분 업데이트 (포커스/스크롤 유지)
    refreshDynamicZonesWithoutRender();
  }

  function onHistorySearchInput(val) {
    historySearchQuery = String(val || '');
    // 검색창 자체는 건드리지 않고 아래 결과 목록만 0.01초 부분 업데이트!
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
      rxDose = '';
      rxFreq = '';
      rxDays = '';
      const doseEl = document.getElementById('pc-rx-dose');
      const freqEl = document.getElementById('pc-rx-freq');
      const daysEl = document.getElementById('pc-rx-days');
      const tEl = document.getElementById('pc-target-count');
      if (doseEl) doseEl.value = '';
      if (freqEl) freqEl.value = '';
      if (daysEl) daysEl.value = '';
      if (tEl) tEl.value = '';
    }
    refreshDynamicZonesWithoutRender();
  }

  function toggleBoundingBoxes(checked) {
    showBoundingBoxes = !!checked;
    render('module-content');
  }

  function clearOutlierFlags() {
    markers.forEach(m => { m.isOutlier = false; });
    render('module-content');
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
    try {
      if (val) localStorage.setItem(GEMINI_KEY_STORAGE, val);
      else localStorage.removeItem(GEMINI_KEY_STORAGE);
    } catch (e) {}

    await pushGeminiKeyToCloud(val);
    showAiConfigModal = false;

    if (val) {
      alert('✅ Gemini AI 키가 저장되었으며 약국 내 모든 기기에 공유되었습니다!');
      if (loadedImage) {
        runGeminiAIVision();
        return;
      }
    } else {
      alert('ℹ️ API 키가 삭제되었습니다.');
    }
    render('module-content');
  }

  return {
    render,
    handleFileSelect,
    loadDemoSample,
    onTextMetaInput,
    onRxCalcInput,
    onDirectTargetInput,
    onHistorySearchInput,
    clearHistorySearch,
    openPhotoModal,
    closePhotoModal,
    editHistoryItem,
    deleteHistoryItem,
    setQuickTarget,
    toggleBoundingBoxes,
    clearOutlierFlags,
    setInteractionMode,
    setHideMarkersTemp,
    undoLastAction,
    changeZoom,
    resetZoomPan,
    runGeminiAIVision,
    resetAll,
    addCurrentToBatch,
    clearBatches,
    saveCurrentInspection,
    clearHistory,
    openAiSettingsModal,
    closeAiSettingsModal,
    saveAiSettingsKey
  };
})();
