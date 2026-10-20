/**
 * 🔢 스마트 알약 카운터 & 조제 검수기 모듈 (AI Spatial Object Detection v2.1 - 심플 실무형 UI)
 * 신세계약국 전용 유료 앱(Pilleye)급 Gemini 2.5 Flash Vision [box_2d] 딥러닝 객체 검출 메인 엔진 탑재
 * - 메인 엔진: 🤖 Google Gemini 2.5 Flash 네이티브 2D 바운딩박스([ymin, xmin, ymax, xmax] 0~1000 좌표계) 사물 검출 + NMS 중복 제거
 * - 클라우드 키 공유: 약국장님이 1회 API 키 등록 시 Firebase 실시간 DB를 통해 약국 모든 스마트폰·PC에 자동 동기화
 * - 심플 실무 UX: 불필요한 슬라이더/스포이드 설정을 제거하고 [처방계산기 + 대형 카운팅 화면 + 터치보정(+1/-1) + 원본비교 + 검수기록]으로 직관화
 */
window.PillCounterModule = (function () {
  const HISTORY_STORAGE_KEY = 'ssg_pill_counter_history_v1';
  const GEMINI_KEY_STORAGE = 'ssg_pill_gemini_api_key_v1';
  const WORKING_MODEL_STORAGE = 'ssg_pill_working_model_v1';
  const FIREBASE_AI_CONFIG_URL = 'https://shinsegae-pharmacy-default-rtdb.firebaseio.com/shinsegae_master_db/pillCounterConfig.json';

  // --- 상태 변수 ---
  let loadedImage = null;
  let imageWidth = 0;
  let imageHeight = 0;
  let markers = [];             // [{ id, x, y, r, box: [ymin,xmin,ymax,xmax], isManual, isOutlier, isAi }]
  let undoStack = [];

  let showBoundingBoxes = true; // AI가 잡은 알약 사각 테두리(box_2d) 표시 여부
  let lastScanMethod = '';      // 'AI_BOX2D' | 'DEMO'

  // 캔버스 인터랙션 & 뷰어 상태
  let interactionMode = 'EDIT'; // 'EDIT' (+1/-1 터치보정) | 'PAN' (✋ 화면 이동)
  let hideMarkersTemp = false;  // 👁️ 누르고 있는 동안 마커 숨기기
  let zoomLevel = 1.0;
  let panX = 0;
  let panY = 0;
  let isDraggingPan = false;
  let dragStartX = 0;
  let dragStartY = 0;

  // 처방전 조제 계산기 & 다회차 합산 상태
  let drugNameInput = '';
  let rxDose = '';
  let rxFreq = '';
  let rxDays = '';
  let targetCount = 0;
  let batchCounts = [];
  let soundEnabled = true;

  // 실시간 카메라 & 토치(플래시) 상태
  let cameraStream = null;
  let isCameraOpen = false;
  let isTorchOn = false;
  let isAiScanning = false;
  let showAiConfigModal = false;
  let cloudKeyLoaded = false;

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
            if (window.App && window.App.getActiveModule && window.App.getActiveModule() === 'pill-counter') {
              render('module-content');
            }
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

  // --- 유틸리티: 효과음(Web Audio API) & 진동(Vibration) ---
  function playFeedbackSound(type) {
    if (!soundEnabled) return;
    try {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        if (type === 'MATCH') navigator.vibrate([70, 40, 110]);
        else if (type === 'ADD' || type === 'REMOVE') navigator.vibrate(25);
        else if (type === 'WARN') navigator.vibrate([120, 60, 120]);
      }
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      if (type === 'MATCH') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now);
        osc.frequency.setValueAtTime(880.0, now + 0.09);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
        osc.start(now);
        osc.stop(now + 0.28);
      } else if (type === 'ADD') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(660, now);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (type === 'REMOVE') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(420, now);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (type === 'WARN') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(310, now);
        osc.frequency.setValueAtTime(260, now + 0.12);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
        osc.start(now);
        osc.stop(now + 0.26);
      }
    } catch (e) {}
  }

  function getHistoryList() {
    try {
      const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveHistoryList(list) {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify((list || []).slice(0, 30)));
    } catch (e) {}
  }

  function getGeminiApiKey() {
    try {
      return (localStorage.getItem(GEMINI_KEY_STORAGE) || '').trim();
    } catch (e) {
      return '';
    }
  }

  // --- 메인 렌더링 ---
  function render(containerId) {
    syncGeminiKeyFromCloud();

    const container = document.getElementById(containerId || 'module-content');
    if (!container) return;

    const hasApiKey = getGeminiApiKey().length > 10;
    const currCount = markers.length;
    const outlierMarkers = markers.filter(m => m.isOutlier);
    const batchSum = batchCounts.reduce((acc, b) => acc + (Number(b.count) || 0), 0);
    const totalEffectiveCount = batchSum + currCount;
    const historyList = getHistoryList();

    // 목표 수량 대비 판정 배너
    let verifyBannerHTML = '';
    if (targetCount > 0 && (loadedImage || batchCounts.length > 0) && !isAiScanning) {
      const diff = totalEffectiveCount - targetCount;
      if (diff === 0) {
        verifyBannerHTML = `
          <div style="background:linear-gradient(135deg,#059669 0%,#10b981 100%); color:#ffffff; border-radius:14px; padding:12px 18px; margin-bottom:14px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; box-shadow:0 6px 18px rgba(16,185,129,0.28);">
            <div style="display:flex; align-items:center; gap:10px;">
              <span style="font-size:24px;">✅</span>
              <div>
                <div style="font-size:16px; font-weight:900;">목표 조제 수량(${targetCount}정)과 100% 일치합니다!</div>
                <div style="font-size:12px; opacity:0.92;">현재 사진 ${currCount}정 ${batchSum > 0 ? `+ 이전 누적 ${batchSum}정 = 총 ${totalEffectiveCount}정` : ''}</div>
              </div>
            </div>
            <button type="button" onclick="PillCounterModule.saveCurrentInspection()" style="background:#ffffff; color:#047857; border:none; border-radius:10px; padding:7px 14px; font-size:12.5px; font-weight:800; cursor:pointer;">
              💾 검수 완료 기록 저장
            </button>
          </div>
        `;
      } else if (diff < 0) {
        verifyBannerHTML = `
          <div style="background:linear-gradient(135deg,#d97706 0%,#f59e0b 100%); color:#ffffff; border-radius:14px; padding:12px 18px; margin-bottom:14px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; box-shadow:0 6px 18px rgba(217,119,6,0.25);">
            <div style="display:flex; align-items:center; gap:10px;">
              <span style="font-size:24px;">⚠️</span>
              <div>
                <div style="font-size:16px; font-weight:900;">목표(${targetCount}정)보다 <span style="text-decoration:underline;">${Math.abs(diff)}정 부족</span>합니다! (${diff}정)</div>
                <div style="font-size:12px; opacity:0.95;">현재 총 ${totalEffectiveCount}정 확인됨 — 알약 ${Math.abs(diff)}정을 더 보충하거나 누락된 알약을 터치(+1)하세요.</div>
              </div>
            </div>
          </div>
        `;
      } else {
        verifyBannerHTML = `
          <div style="background:linear-gradient(135deg,#dc2626 0%,#ef4444 100%); color:#ffffff; border-radius:14px; padding:12px 18px; margin-bottom:14px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; box-shadow:0 6px 18px rgba(220,38,38,0.28);">
            <div style="display:flex; align-items:center; gap:10px;">
              <span style="font-size:24px;">🚨</span>
              <div>
                <div style="font-size:16px; font-weight:900;">목표(${targetCount}정)보다 <span style="text-decoration:underline;">+${diff}정 초과</span>되었습니다!</div>
                <div style="font-size:12px; opacity:0.95;">현재 총 ${totalEffectiveCount}정 확인됨 — 초과된 알약 ${diff}정을 덜어내거나 잘못 찍힌 마커를 터치(-1)하세요.</div>
              </div>
            </div>
          </div>
        `;
      }
    }

    // 이종 알약 경보 배너
    let outlierBannerHTML = '';
    if (outlierMarkers.length > 0 && !isAiScanning) {
      outlierBannerHTML = `
        <div style="background:#faf5ff; border:2px solid #9333ea; color:#581c87; border-radius:14px; padding:11px 16px; margin-bottom:14px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="background:#9333ea; color:#fff; border-radius:8px; padding:4px 9px; font-size:12px; font-weight:800;">🚨 이종 알약 의심 ${outlierMarkers.length}정</span>
            <div style="font-size:13px; font-weight:700;">
              모양이나 색상이 다른 알약 <strong>${outlierMarkers.length}정</strong>이 감지되었습니다! 화면의 <strong style="color:#9333ea;">보라색 경고 마커(!)</strong>를 확인하세요.
            </div>
          </div>
          <button type="button" onclick="PillCounterModule.clearOutlierFlags()" style="background:#ffffff; color:#6b21a8; border:1px solid #d8b4fe; border-radius:8px; padding:4px 10px; font-size:11.5px; font-weight:700; cursor:pointer;">
            정상 알약으로 일괄 확인
          </button>
        </div>
      `;
    }

    // AI API 키 미등록 시 1회 등록 안내 배너
    let apiKeyGuideBannerHTML = '';
    if (!hasApiKey) {
      apiKeyGuideBannerHTML = `
        <div style="background:linear-gradient(135deg,#4c1d95 0%,#6d28d9 100%); color:#ffffff; border-radius:16px; padding:14px 20px; margin-bottom:14px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; box-shadow:0 8px 20px rgba(109,40,217,0.28);">
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="width:42px; height:42px; border-radius:12px; background:rgba(255,255,255,0.18); display:flex; align-items:center; justify-content:center; font-size:22px;">🤖</div>
            <div>
              <div style="font-size:15px; font-weight:900;">Gemini 2.5 AI 딥러닝 사물 검출 엔진을 활성화하려면 무료 API 키를 1회 등록해 주세요!</div>
              <div style="font-size:12px; color:#ddd6fe; margin-top:2px;">
                약국장님이 한 번만 등록하시면 약국 내 모든 스마트폰과 PC에 자동으로 공유되어 촬영 즉시 정확하게 알약을 셉니다.
              </div>
            </div>
          </div>
          <button type="button" onclick="PillCounterModule.openAiSettingsModal()" style="background:#f59e0b; color:#0f172a; border:none; border-radius:12px; padding:9px 16px; font-size:13px; font-weight:900; cursor:pointer; white-space:nowrap; box-shadow:0 4px 10px rgba(0,0,0,0.2);">
            🔑 무료 AI 키 1분 등록하기
          </button>
        </div>
      `;
    }

    container.innerHTML = `
      <div class="pill-counter-wrapper" style="max-width:1140px; margin:0 auto; padding-bottom:40px;">
        
        <!-- 1. 상단 헤더 & AI 엔진 상태 표시 -->
        <div class="card shadow-sm mb-3" style="border-radius:20px; border:1px solid #cbd5e1; background:linear-gradient(135deg,#0f172a 0%,#1e1b4b 100%); color:#ffffff; padding:18px 22px;">
          <div class="d-flex justify-content-between align-items-center flex-wrap gap-3">
            <div>
              <div style="display:inline-flex; align-items:center; gap:6px; background:${hasApiKey ? 'rgba(16,185,129,0.22)' : 'rgba(245,158,11,0.22)'}; border:1px solid ${hasApiKey ? 'rgba(52,211,153,0.5)' : 'rgba(251,191,36,0.5)'}; color:${hasApiKey ? '#6ee7b7' : '#fde68a'}; padding:3px 11px; border-radius:20px; font-size:11.5px; font-weight:800; margin-bottom:5px;">
                <span>${hasApiKey ? '🤖 GEMINI 2.5 VISION AI 연동 완료 (촬영 즉시 자동 카운팅)' : '⚠️ AI 키 미등록'}</span>
              </div>
              <h2 style="font-size:21px; font-weight:900; margin:0; color:#ffffff; letter-spacing:-0.4px;">
                🔢 스마트 알약 카운터 & 조제 검수기
              </h2>
            </div>

            <div class="d-flex align-items-center gap-2 flex-wrap">
              <button type="button" onclick="PillCounterModule.toggleSound()" style="background:rgba(255,255,255,0.1); color:${soundEnabled ? '#38bdf8' : '#94a3b8'}; border:1px solid rgba(255,255,255,0.2); border-radius:12px; padding:7px 12px; font-size:12px; font-weight:700; cursor:pointer;">
                <i class="fas ${soundEnabled ? 'fa-volume-up' : 'fa-volume-mute'}"></i> ${soundEnabled ? '음성·진동 ON' : '무음'}
              </button>
              <button type="button" onclick="PillCounterModule.openAiSettingsModal()" style="background:${hasApiKey ? 'rgba(16,185,129,0.22)' : 'rgba(245,158,11,0.3)'}; color:#ffffff; border:1px solid ${hasApiKey ? '#34d399' : '#fbbf24'}; border-radius:12px; padding:7px 13px; font-size:12px; font-weight:800; cursor:pointer;">
                🔑 ${hasApiKey ? 'AI 키 설정' : 'AI 키 등록'}
              </button>
              <button type="button" onclick="PillCounterModule.loadDemoSample()" style="background:rgba(255,255,255,0.12); color:#fde68a; border:1px solid rgba(251,191,36,0.4); border-radius:12px; padding:7px 12px; font-size:12px; font-weight:800; cursor:pointer;">
                🧪 샘플 45정 테스트
              </button>
            </div>
          </div>
        </div>

        ${apiKeyGuideBannerHTML}

        <!-- 2. 🧮 처방전 목표 수량 자동 계산기 & 실시간 카운트 전광판 -->
        <div class="row g-3 mb-3">
          <div class="col-lg-7">
            <div class="card shadow-sm h-100" style="border-radius:18px; border:1px solid #cbd5e1; background:#ffffff; padding:15px 18px;">
              <div class="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
                <div style="font-size:13.5px; font-weight:800; color:#0f172a;">
                  🧮 처방 조제 목표량 계산기 <span style="font-size:11.5px; font-weight:600; color:#64748b;">(선택 입력)</span>
                </div>
                <div class="d-flex gap-1 flex-wrap">
                  ${[28, 30, 56, 60, 90, 100, 180].map(preset => `
                    <button type="button" onclick="PillCounterModule.setQuickTarget(${preset})" style="background:${targetCount === preset ? '#2563eb' : '#f1f5f9'}; color:${targetCount === preset ? '#ffffff' : '#334155'}; border:1px solid ${targetCount === preset ? '#1d4ed8' : '#cbd5e1'}; border-radius:8px; padding:2px 8px; font-size:11.5px; font-weight:700; cursor:pointer;">
                      ${preset}정
                    </button>
                  `).join('')}
                  ${targetCount > 0 ? `
                    <button type="button" onclick="PillCounterModule.setQuickTarget(0)" style="background:#fee2e2; color:#dc2626; border:1px solid #fecaca; border-radius:8px; padding:2px 8px; font-size:11.5px; font-weight:700; cursor:pointer;">
                      초기화
                    </button>
                  ` : ''}
                </div>
              </div>

              <div class="row g-2 align-items-end">
                <div class="col-sm-4 col-12">
                  <label style="font-size:11.5px; font-weight:700; color:#475569; display:block; margin-bottom:3px;">💊 약품명 / 메모 (선택)</label>
                  <input type="text" id="pc-drug-name" class="form-control form-control-sm" placeholder="예: 리피토정 10mg" value="${escapeHtml(drugNameInput)}" oninput="PillCounterModule.updateRxInputs()" style="border-radius:10px; font-weight:700;">
                </div>
                <div class="col-sm-2 col-3">
                  <label style="font-size:11.5px; font-weight:700; color:#475569; display:block; margin-bottom:3px;">1회량</label>
                  <input type="number" step="0.5" min="0" id="pc-rx-dose" class="form-control form-control-sm text-center" placeholder="1" value="${rxDose}" oninput="PillCounterModule.updateRxInputs()" style="border-radius:10px; font-weight:800;">
                </div>
                <div class="col-sm-2 col-3">
                  <label style="font-size:11.5px; font-weight:700; color:#475569; display:block; margin-bottom:3px;">1일 횟수</label>
                  <input type="number" step="1" min="0" id="pc-rx-freq" class="form-control form-control-sm text-center" placeholder="3" value="${rxFreq}" oninput="PillCounterModule.updateRxInputs()" style="border-radius:10px; font-weight:800;">
                </div>
                <div class="col-sm-2 col-3">
                  <label style="font-size:11.5px; font-weight:700; color:#475569; display:block; margin-bottom:3px;">투약일수</label>
                  <input type="number" step="1" min="0" id="pc-rx-days" class="form-control form-control-sm text-center" placeholder="30" value="${rxDays}" oninput="PillCounterModule.updateRxInputs()" style="border-radius:10px; font-weight:800;">
                </div>
                <div class="col-sm-2 col-3">
                  <label style="font-size:11.5px; font-weight:800; color:#1d4ed8; display:block; margin-bottom:3px;">🎯 목표 수량</label>
                  <input type="number" step="1" min="0" id="pc-target-count" class="form-control form-control-sm text-center" placeholder="직접입력" value="${targetCount || ''}" oninput="PillCounterModule.setDirectTarget(this.value)" style="border-radius:10px; font-weight:900; border:1.5px solid #2563eb; background:#eff6ff; color:#1e40af;">
                </div>
              </div>
            </div>
          </div>

          <!-- 우측: 실시간 카운트 대형 전광판 -->
          <div class="col-lg-5">
            <div class="card shadow-sm h-100" style="border-radius:18px; border:2px solid #10b981; background:linear-gradient(135deg,#ecfdf5 0%,#f0fdf4 100%); padding:14px 20px; display:flex; flex-direction:column; justify-content:center;">
              <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
                <div>
                  <div style="font-size:12px; font-weight:800; color:#047857; display:flex; align-items:center; gap:6px;">
                    <span>📸 현재 감지된 알약 수</span>
                    ${lastScanMethod === 'AI_BOX2D' ? `<span style="background:#6d28d9; color:#fff; padding:1px 7px; border-radius:10px; font-size:10.5px;">🤖 AI 판독</span>` : ''}
                  </div>
                  <div style="display:flex; align-items:baseline; gap:8px;">
                    <span id="pc-current-count-num" style="font-size:40px; font-weight:900; color:#065f46; font-family:'Outfit',sans-serif; line-height:1.1;">${isAiScanning ? '...' : currCount}</span>
                    <span style="font-size:16px; font-weight:800; color:#047857;">정(캡슐)</span>
                    ${batchSum > 0 ? `
                      <span style="background:#059669; color:#ffffff; padding:3px 10px; border-radius:20px; font-size:12.5px; font-weight:800;">
                        총 누적: ${totalEffectiveCount}정
                      </span>
                    ` : ''}
                  </div>
                </div>

                <div class="d-flex flex-column gap-1 align-items-end">
                  <div class="d-flex gap-1">
                    <button type="button" onclick="PillCounterModule.addCurrentToBatch()" ${currCount === 0 ? 'disabled' : ''} style="background:#059669; color:#ffffff; border:none; border-radius:10px; padding:7px 12px; font-size:12px; font-weight:800; cursor:pointer; opacity:${currCount === 0 ? '0.5' : '1'};" title="대량 조제 시 여러 번 나누어 찍어 합산합니다">
                      ➕ 누적 합산 (${batchCounts.length + 1}차)
                    </button>
                    <button type="button" onclick="PillCounterModule.saveCurrentInspection()" ${totalEffectiveCount === 0 ? 'disabled' : ''} style="background:#ffffff; color:#047857; border:1.5px solid #059669; border-radius:10px; padding:7px 11px; font-size:12px; font-weight:800; cursor:pointer; opacity:${totalEffectiveCount === 0 ? '0.5' : '1'};">
                      💾 기록저장
                    </button>
                  </div>
                  ${batchCounts.length > 0 ? `
                    <div style="font-size:11.5px; color:#065f46; font-weight:700;">
                      ${batchCounts.map(b => `${b.batchNo}차(${b.count}정)`).join(' + ')}
                      <button type="button" onclick="PillCounterModule.clearBatches()" style="background:none; border:none; color:#dc2626; font-weight:800; cursor:pointer; margin-left:4px; text-decoration:underline;">[초기화]</button>
                    </div>
                  ` : ''}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 검증 결과 배너 & 이종 알약 경보 배너 -->
        <div id="pc-banners-area">
          ${verifyBannerHTML}
          ${outlierBannerHTML}
        </div>

        <!-- 3. 촬영/업로드 컨트롤 바 & 실시간 카메라 뷰파인더 -->
        <div class="card shadow-sm mb-3" style="border-radius:18px; border:1px solid #cbd5e1; background:#ffffff; padding:14px 18px;">
          <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
            <div class="d-flex align-items-center gap-2 flex-wrap">
              <label for="pc-camera-file-input" style="background:linear-gradient(135deg,#2563eb 0%,#1d4ed8 100%); color:#ffffff; border-radius:12px; padding:10px 18px; font-size:14px; font-weight:800; cursor:pointer; display:inline-flex; align-items:center; gap:7px; box-shadow:0 4px 12px rgba(37,99,235,0.28); margin:0;">
                <i class="fas fa-camera"></i> 📸 카메라 촬영 (즉시 AI 카운팅)
              </label>
              <input type="file" id="pc-camera-file-input" accept="image/*" capture="environment" onchange="PillCounterModule.handleFileSelect(event)" style="display:none;">

              <label for="pc-gallery-file-input" style="background:#f8fafc; color:#1e293b; border:1.5px solid #cbd5e1; border-radius:12px; padding:9px 14px; font-size:13px; font-weight:700; cursor:pointer; display:inline-flex; align-items:center; gap:6px; margin:0;">
                <i class="fas fa-images text-primary"></i> 앨범/PC 사진 선택
              </label>
              <input type="file" id="pc-gallery-file-input" accept="image/*" onchange="PillCounterModule.handleFileSelect(event)" style="display:none;">

              <button type="button" onclick="PillCounterModule.toggleLiveCamera()" style="background:${isCameraOpen ? '#dc2626' : '#0f172a'}; color:#ffffff; border:none; border-radius:12px; padding:10px 16px; font-size:13px; font-weight:800; cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
                <i class="fas ${isCameraOpen ? 'fa-times-circle' : 'fa-video'}"></i>
                ${isCameraOpen ? '라이브 카메라 닫기' : '🎥 실시간 카메라 + 🔦조명'}
              </button>
            </div>

            <!-- 우측: AI 재스캔 & 초기화 -->
            <div class="d-flex align-items-center gap-2 flex-wrap">
              ${loadedImage ? `
                <button type="button" onclick="PillCounterModule.runGeminiAIVision(true)" ${isAiScanning ? 'disabled' : ''} style="background:linear-gradient(135deg,#7c3aed 0%,#6d28d9 100%); color:#ffffff; border:none; border-radius:12px; padding:9px 15px; font-size:13px; font-weight:800; cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
                  <i class="fas ${isAiScanning ? 'fa-spinner fa-spin' : 'fa-robot'}"></i>
                  ${isAiScanning ? 'AI 분석 중...' : '🔄 AI 다시 세기'}
                </button>
                <button type="button" onclick="PillCounterModule.resetAll()" style="background:#fff1f2; color:#e11d48; border:1px solid #fecdd3; border-radius:12px; padding:9px 13px; font-size:12.5px; font-weight:800; cursor:pointer;">
                  🗑️ 지우기
                </button>
              ` : ''}
            </div>
          </div>

          <!-- 🎥 실시간 WebRTC 카메라 뷰파인더 영역 -->
          ${isCameraOpen ? `
            <div style="margin-top:14px; background:#090d16; border-radius:16px; padding:14px; position:relative; text-align:center;">
              <div style="position:relative; display:inline-block; width:100%; max-width:740px; border-radius:12px; overflow:hidden; border:2px solid #38bdf8;">
                <video id="pc-live-video" autoplay playsinline muted style="width:100%; max-height:60vh; object-fit:contain; display:block; background:#000;"></video>
                <div style="position:absolute; inset:6%; border:2px dashed rgba(56,189,248,0.75); border-radius:14px; pointer-events:none; display:flex; align-items:flex-start; justify-content:center; padding-top:8px;">
                  <span style="background:rgba(15,23,42,0.75); color:#7dd3fc; font-size:11.5px; font-weight:700; padding:3px 10px; border-radius:12px;">
                    💡 가이드 사각형 안에 알약이 서로 포개지지 않게 펴놓고 촬영하세요
                  </span>
                </div>
              </div>

              <div class="d-flex justify-content-center align-items-center gap-3 mt-3 flex-wrap">
                <button type="button" onclick="PillCounterModule.toggleTorch()" style="background:${isTorchOn ? '#f59e0b' : '#334155'}; color:#ffffff; border:none; border-radius:20px; padding:10px 18px; font-size:13.5px; font-weight:800; cursor:pointer; display:inline-flex; align-items:center; gap:6px;">
                  <i class="fas fa-bolt"></i> 🔦 ${isTorchOn ? '플래시(조명) 켜짐 ON' : '플래시(조명) 켜기'}
                </button>
                <button type="button" onclick="PillCounterModule.captureFromLiveCamera()" style="background:linear-gradient(135deg,#10b981 0%,#059669 100%); color:#ffffff; border:3px solid #ffffff; border-radius:30px; padding:11px 28px; font-size:15.5px; font-weight:900; cursor:pointer; box-shadow:0 6px 20px rgba(16,185,129,0.45);">
                  📸 즉시 캡처 및 AI 카운팅!
                </button>
              </div>
            </div>
          ` : ''}
        </div>

        <!-- 4. 메인 카운팅 화면 (전체 폭으로 시원하게 배치) -->
        <div class="card shadow-sm mb-3" style="border-radius:18px; border:1px solid #cbd5e1; background:#ffffff; overflow:hidden;">
          
          <!-- 캔버스 상단 심플 툴바 -->
          <div style="background:#f8fafc; padding:10px 16px; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <div class="d-flex align-items-center gap-2 flex-wrap">
              <button type="button" onclick="PillCounterModule.setInteractionMode('EDIT')" style="background:${interactionMode === 'EDIT' ? '#1e40af' : '#ffffff'}; color:${interactionMode === 'EDIT' ? '#ffffff' : '#334155'}; border:1px solid #cbd5e1; border-radius:10px; padding:6px 13px; font-size:12.5px; font-weight:800; cursor:pointer;">
                ✏️ 터치 보정 (+1 추가 / -1 삭제)
              </button>
              <button type="button" onclick="PillCounterModule.setInteractionMode('PAN')" style="background:${interactionMode === 'PAN' ? '#475569' : '#ffffff'}; color:${interactionMode === 'PAN' ? '#ffffff' : '#334155'}; border:1px solid #cbd5e1; border-radius:10px; padding:6px 12px; font-size:12.5px; font-weight:800; cursor:pointer;">
                ✋ 화면 이동
              </button>
              <button type="button" onclick="PillCounterModule.toggleBoundingBoxes(!${showBoundingBoxes})" style="background:${showBoundingBoxes ? '#eff6ff' : '#ffffff'}; color:${showBoundingBoxes ? '#1d4ed8' : '#64748b'}; border:1px solid ${showBoundingBoxes ? '#93c5fd' : '#cbd5e1'}; border-radius:10px; padding:6px 12px; font-size:12px; font-weight:800; cursor:pointer;">
                🔲 AI 테두리 ${showBoundingBoxes ? 'ON' : 'OFF'}
              </button>
            </div>

            <!-- 👁️ 원본 비교(마커 숨기기) & 되돌리기 -->
            <div class="d-flex align-items-center gap-2 flex-wrap">
              <button type="button"
                onmousedown="PillCounterModule.setHideMarkersTemp(true)"
                onmouseup="PillCounterModule.setHideMarkersTemp(false)"
                onmouseleave="PillCounterModule.setHideMarkersTemp(false)"
                ontouchstart="PillCounterModule.setHideMarkersTemp(true); event.preventDefault();"
                ontouchend="PillCounterModule.setHideMarkersTemp(false); event.preventDefault();"
                style="background:${hideMarkersTemp ? '#f59e0b' : '#0f172a'}; color:#ffffff; border:none; border-radius:10px; padding:6px 14px; font-size:12.5px; font-weight:800; cursor:pointer; user-select:none;">
                👁️ 누르는 동안 마커 숨기기(원본비교)
              </button>
              <button type="button" onclick="PillCounterModule.undoLastAction()" ${undoStack.length === 0 ? 'disabled' : ''} style="background:#ffffff; color:#334155; border:1px solid #cbd5e1; border-radius:10px; padding:6px 11px; font-size:12px; font-weight:700; cursor:pointer; opacity:${undoStack.length === 0 ? '0.45' : '1'};">
                ↩️ 되돌리기
              </button>
            </div>
          </div>

          <!-- 캔버스 뷰포트 본체 -->
          <div id="pc-canvas-viewport" style="background:#0f172a; min-height:460px; max-height:74vh; position:relative; overflow:hidden; display:flex; align-items:center; justify-content:center; touch-action:none;">
            ${loadedImage ? `
              <canvas id="pc-main-canvas" style="max-width:100%; max-height:72vh; cursor:${interactionMode === 'PAN' ? 'grab' : 'crosshair'}; display:block;"></canvas>
              ${isAiScanning ? `
                <div style="position:absolute; inset:0; background:rgba(15,23,42,0.72); display:flex; flex-direction:column; align-items:center; justify-content:center; color:#ffffff; z-index:20; backdrop-filter:blur(3px);">
                  <div style="width:64px; height:64px; border-radius:20px; background:linear-gradient(135deg,#7c3aed,#2563eb); display:flex; align-items:center; justify-content:center; font-size:28px; margin-bottom:14px; box-shadow:0 0 30px rgba(124,58,237,0.6);">
                    <i class="fas fa-robot fa-bounce"></i>
                  </div>
                  <div style="font-size:18px; font-weight:900; letter-spacing:-0.3px; margin-bottom:6px;">
                    🤖 Gemini 2.5 Vision AI가 알약 개수를 세고 있습니다...
                  </div>
                  <div style="font-size:13px; color:#cbd5e1;">
                    배경과 그림자를 제외하고 실제 알약 위치만 정밀 검출 중입니다 (약 1~2초)
                  </div>
                </div>
              ` : ''}
            ` : `
              <div style="text-align:center; padding:56px 24px; color:#94a3b8;">
                <div style="width:76px; height:76px; border-radius:24px; background:rgba(139,92,246,0.15); border:2px dashed rgba(167,139,250,0.5); color:#c4b5fd; display:flex; align-items:center; justify-content:center; font-size:32px; margin:0 auto 16px auto;">
                  <i class="fas fa-camera"></i>
                </div>
                <h4 style="color:#f8fafc; font-size:18px; font-weight:800; margin-bottom:8px;">
                  조제할 알약을 펴놓고 사진을 촬영해 주세요
                </h4>
                <p style="font-size:13.5px; color:#94a3b8; max-width:480px; margin:0 auto 22px auto; line-height:1.6;">
                  • 사진을 찍으면 <strong>Gemini 2.5 AI</strong>가 즉시 알약을 하나씩 찾아 번호를 매겨줍니다.<br>
                  • 촬영 후 빠진 알약은 톡 누르면 <strong>+1 추가</strong>, 잘못 찍힌 번호는 누르면 <strong>-1 삭제</strong>됩니다.
                </p>
                <div class="d-flex justify-content-center gap-2 flex-wrap">
                  <label for="pc-camera-file-input" style="background:#2563eb; color:#ffffff; border-radius:12px; padding:11px 22px; font-size:14px; font-weight:800; cursor:pointer; margin:0;">
                    📸 바로 사진 찍기
                  </label>
                  <button type="button" onclick="PillCounterModule.loadDemoSample()" style="background:#f59e0b; color:#0f172a; border:none; border-radius:12px; padding:11px 20px; font-size:14px; font-weight:800; cursor:pointer;">
                    🧪 샘플 45정 테스트 체험
                  </button>
                </div>
              </div>
            `}
          </div>

          <!-- 캔버스 하단 안내 & 돋보기 줌 바 -->
          <div style="background:#f8fafc; padding:9px 16px; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; font-size:12px; color:#475569;">
            <div>
              💡 <strong>1초 터치 보정:</strong> 빈 알약 터치 시 <strong style="color:#16a34a;">+1 추가</strong> / 찍힌 번호 마커 터치 시 <strong style="color:#dc2626;">-1 삭제</strong>
            </div>
            <div class="d-flex align-items-center gap-2">
              <span style="font-weight:700;">🔍 화면 확대:</span>
              <button type="button" onclick="PillCounterModule.changeZoom(-0.25)" style="border:1px solid #cbd5e1; background:#fff; border-radius:6px; padding:2px 8px; font-weight:800;">-</button>
              <span style="font-weight:800; min-width:42px; text-align:center;">${Math.round(zoomLevel * 100)}%</span>
              <button type="button" onclick="PillCounterModule.changeZoom(0.25)" style="border:1px solid #cbd5e1; background:#fff; border-radius:6px; padding:2px 8px; font-weight:800;">+</button>
              <button type="button" onclick="PillCounterModule.resetZoomPan()" style="border:1px solid #cbd5e1; background:#fff; border-radius:6px; padding:2px 8px; font-size:11px; font-weight:700;">100% 맞춤</button>
            </div>
          </div>
        </div>

        <!-- 5. 📋 최근 알약 카운팅 검수 기록 (하단 심플 카드) -->
        ${historyList.length > 0 ? `
          <div class="card shadow-sm" style="border-radius:18px; border:1px solid #cbd5e1; background:#ffffff; padding:14px 18px;">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <h4 style="font-size:13.5px; font-weight:800; color:#0f172a; margin:0;">
                📋 최근 알약 카운팅 검수 기록 (${historyList.length})
              </h4>
              <button type="button" onclick="PillCounterModule.clearHistory()" style="background:none; border:none; color:#ef4444; font-size:11.5px; font-weight:700; cursor:pointer;">전체비우기</button>
            </div>
            <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(260px, 1fr)); gap:8px; max-height:180px; overflow-y:auto;">
              ${historyList.map(item => `
                <div style="padding:8px 12px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; display:flex; justify-content:space-between; align-items:center; font-size:12px;">
                  <div>
                    <div style="font-weight:800; color:#1e293b;">
                      ${escapeHtml(item.drugName || '알약 카운팅')}
                      ${item.targetCount > 0 ? (item.totalCount === item.targetCount
                        ? `<span style="color:#059669; font-size:11px;">[✅ ${item.targetCount}정 일치]</span>`
                        : `<span style="color:#d97706; font-size:11px;">[목표 ${item.targetCount}정]</span>`) : ''}
                    </div>
                    <div style="font-size:11px; color:#64748b;">
                      ${item.timeStr} • ${escapeHtml(item.userName || '약사')}
                    </div>
                  </div>
                  <div style="font-size:15px; font-weight:900; color:#047857;">
                    ${item.totalCount}정
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

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
  }

  function renderAiConfigModalHTML() {
    const savedKey = getGeminiApiKey();
    return `
      <div style="position:fixed; inset:0; background:rgba(15,23,42,0.7); z-index:999999; display:flex; align-items:center; justify-content:center; padding:16px;">
        <div style="background:#ffffff; border-radius:22px; max-width:520px; width:100%; padding:24px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.4);">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h3 style="font-size:17px; font-weight:900; color:#4c1d95; margin:0;">🔑 Gemini 2.5 Vision AI 키 설정 (전 기기 자동 공유)</h3>
            <button type="button" onclick="PillCounterModule.closeAiSettingsModal()" style="background:none; border:none; font-size:24px; color:#64748b; cursor:pointer;">&times;</button>
          </div>

          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:12px; font-size:12px; color:#334155; margin-bottom:14px; line-height:1.6;">
            • <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener" style="color:#2563eb; font-weight:800; text-decoration:underline;">Google AI Studio (aistudio.google.com/app/apikey)</a>에서 발급된 <code>AIzaSy...</code> 키를 복사해 붙여넣으시면 약국 내 모든 스마트폰·PC에 자동 연동됩니다.
          </div>

          <div class="mb-3">
            <label style="font-size:12.5px; font-weight:800; color:#0f172a; display:block; margin-bottom:5px;">🔑 Google Gemini API Key</label>
            <input type="text" id="pc-gemini-key-input" class="form-control" placeholder="AIzaSy... 로 시작하는 API 키 붙여넣기" value="${escapeHtml(savedKey)}" style="border-radius:12px; font-size:13.5px; font-weight:700; padding:10px 14px; border:1.5px solid #8b5cf6;">
          </div>

          <div class="d-flex justify-content-end gap-2">
            <button type="button" onclick="PillCounterModule.closeAiSettingsModal()" class="btn btn-sm btn-secondary" style="border-radius:10px; padding:8px 16px;">닫기</button>
            <button type="button" onclick="PillCounterModule.saveAiSettingsKey()" class="btn btn-sm btn-primary font-bold" style="border-radius:10px; padding:8px 20px; background:linear-gradient(135deg,#7c3aed,#6d28d9); border:none; font-size:13.5px;">
              💾 저장 및 약국 전 기기 공유
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ============================================================================
  // 🚀 [메인 엔진] Google Gemini Vision Spatial Object Detection (자동 최신 모델 탐색 + box_2d)
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

      // 최신 버전 Flash 모델을 최우선 정렬
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

  async function callGeminiWithAutoFallback(apiKey, requestBody) {
    const candidateSet = new Set();

    // 1. 이전에 성공했던 모델 캐시 확인 (단, 지원 종료된 2.0은 제외)
    try {
      const cachedModel = localStorage.getItem(WORKING_MODEL_STORAGE);
      if (cachedModel && !cachedModel.includes('2.0-flash')) {
        candidateSet.add(cachedModel);
      }
    } catch (e) {}

    // 2. 구글 공식 최신 별칭 및 주력 모델 추가
    ['gemini-flash-latest', 'gemini-2.5-flash', 'gemini-3.0-flash', 'gemini-2.5-pro'].forEach(m => candidateSet.add(m));

    // 3. 실시간 구글 서버 활성 모델 목록(/v1beta/models) 조회 후 병합
    const discovered = await discoverAvailableGeminiModels(apiKey);
    discovered.forEach(m => candidateSet.add(m));

    const queue = Array.from(candidateSet);
    const tried = new Set();
    let lastErrorMsg = '사용 가능한 Gemini 비전 모델을 찾을 수 없습니다.';

    while (queue.length > 0) {
      const modelId = queue.shift();
      if (!modelId || tried.has(modelId)) continue;
      tried.add(modelId);

      try {
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${encodeURIComponent(apiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
          }
        );

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

        // 구글 에러 메시지가 특정 최신 모델(예: models/gemini-3.x-flash)을 안내한 경우 즉시 최우선 재시도!
        const hintMatch = errDetail.match(/models\/([a-zA-Z0-9._-]+)/);
        if (hintMatch && hintMatch[1] && !tried.has(hintMatch[1])) {
          queue.unshift(hintMatch[1]);
        }
      } catch (netErr) {
        lastErrorMsg = netErr.message || String(netErr);
      }
    }

    throw new Error(lastErrorMsg);
  }

  async function runGeminiAIVision(isManualTrigger = false) {
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
      const maxDim = 1280;
      const sc = Math.min(1, maxDim / Math.max(imageWidth, imageHeight));
      off.width = Math.round(imageWidth * sc);
      off.height = Math.round(imageHeight * sc);
      const ctx = off.getContext('2d');
      ctx.drawImage(loadedImage, 0, 0, off.width, off.height);

      const base64Data = off.toDataURL('image/jpeg', 0.90).split(',')[1];

      const promptText = [
        'Detect every single pill, tablet, or capsule in this image.',
        'IMPORTANT RULES:',
        '1. Output exactly ONE bounding box ("box_2d": [ymin, xmin, ymax, xmax] normalized 0 to 1000) per individual pill.',
        '2. Never split a single pill into multiple boxes (ignore score lines, imprints, or light reflections on a pill).',
        '3. Ignore the tray border, table background, shadows, dust specks, or fingers.',
        '4. If two or more pills are touching each other, output a separate tight bounding box for each individual pill.',
        '5. Set "isOutlier": true ONLY if a pill clearly has a different color, shape, or size from the rest of the pills.',
        'Return JSON format: {"pills": [{"box_2d": [ymin, xmin, ymax, xmax], "isOutlier": false}]}'
      ].join('\n');

      const requestBody = {
        contents: [{
          parts: [
            { text: promptText },
            { inline_data: { mime_type: 'image/jpeg', data: base64Data } }
          ]
        }],
        generationConfig: {
          temperature: 0.0,
          responseMimeType: 'application/json'
        }
      };

      const json = await callGeminiWithAutoFallback(apiKey, requestBody);
      let rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      rawText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();

      let parsed = {};
      try {
        parsed = JSON.parse(rawText);
      } catch (parseErr) {
        if (rawText.charAt(0) === '\x5b') {
          parsed = { pills: JSON.parse(rawText) };
        }
      }

      const rawList = Array.isArray(parsed.pills) ? parsed.pills : (Array.isArray(parsed) ? parsed : []);
      const cleanedPills = postProcessAiBoxes(rawList);

      undoStack.push(JSON.parse(JSON.stringify(markers)));
      markers = cleanedPills;
      lastScanMethod = 'AI_BOX2D';
      checkTargetMatchFeedback();
    } catch (err) {
      alert('⚠️ Gemini AI 스캔 중 오류가 발생했습니다:\n' + (err.message || err));
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

      let ymin, xmin, ymax, xmax;
      if (Array.isArray(item.box_2d) && item.box_2d.length === 4) {
        [ymin, xmin, ymax, xmax] = item.box_2d.map(Number);
        if (ymax <= 1.05 && xmax <= 1.05) {
          ymin *= 1000; xmin *= 1000; ymax *= 1000; xmax *= 1000;
        }
      } else if (item.x !== undefined && item.y !== undefined) {
        const cx = Number(item.x) <= 1.05 ? Number(item.x) * 1000 : Number(item.x);
        const cy = Number(item.y) <= 1.05 ? Number(item.y) * 1000 : Number(item.y);
        const rr = (Number(item.r) || 0.024) * 1000;
        ymin = cy - rr; xmin = cx - rr; ymax = cy + rr; xmax = cx + rr;
      } else {
        continue;
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
        isOutlier: !!item.isOutlier
      });
    }

    if (candidates.length === 0) return [];

    const sortedR = candidates.map(c => c.r).sort((a, b) => a - b);
    const medR = sortedR[Math.floor(sortedR.length / 2)] || 0.024;
    const sizeFiltered = candidates.filter(c => c.r >= medR * 0.38 && c.r <= medR * 2.8);

    // NMS (비최대 억제 중복 제거)
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
          isAi: true,
          isOutlier: !!c.isOutlier
        });
      }
    }

    sortMarkersReadingOrder(kept);
    if (kept.some(m => m.isOutlier)) playFeedbackSound('WARN');
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
  // 인터랙티브 캔버스 렌더링 (자동 최적 크기 번호 마커 + AI box_2d 테두리)
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

        // 🔲 AI가 인식한 2D 바운딩박스(box_2d) 테두리 표시
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

        // 🚨 이종 알약 경고 링
        if (m.isOutlier) {
          ctx.beginPath();
          ctx.arc(cx, cy, baseR * 1.45, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(147, 51, 234, 0.98)';
          ctx.lineWidth = 3 / zoomLevel;
          ctx.stroke();
        }

        // 고시인성 원형 번호 배지
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
        playFeedbackSound('REMOVE');
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
        playFeedbackSound('ADD');
      }

      updateCountDisplayFast();
      drawCanvas();
      checkTargetMatchFeedback();
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

  function updateCountDisplayFast() {
    const numEl = document.getElementById('pc-current-count-num');
    if (numEl) numEl.textContent = String(markers.length);
  }

  function checkTargetMatchFeedback() {
    if (targetCount <= 0) return;
    const batchSum = batchCounts.reduce((acc, b) => acc + (Number(b.count) || 0), 0);
    const total = batchSum + markers.length;
    if (total === targetCount) {
      playFeedbackSound('MATCH');
    }
  }

  // ============================================================================
  // 실시간 카메라, 사진 업로드 & 데모 샘플 시뮬레이터
  // ============================================================================
  async function toggleLiveCamera() {
    if (isCameraOpen) {
      stopLiveCamera();
      render('module-content');
      return;
    }

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        alert('ℹ️ 현재 브라우저에서는 실시간 비디오 스트림을 지원하지 않습니다. 좌측 [📸 카메라 촬영] 버튼을 이용해 주세요.');
        return;
      }
      cameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      });
      isCameraOpen = true;
      isTorchOn = false;

      render('module-content');
      setTimeout(() => {
        const videoEl = document.getElementById('pc-live-video');
        if (videoEl && cameraStream) {
          videoEl.srcObject = cameraStream;
        }
      }, 60);
    } catch (err) {
      alert('📷 카메라 권한을 허용해 주시거나 좌측 [📸 카메라 촬영] 버튼을 눌러 촬영해 주세요.');
    }
  }

  function stopLiveCamera() {
    if (cameraStream) {
      cameraStream.getTracks().forEach(t => {
        try { t.stop(); } catch (e) {}
      });
      cameraStream = null;
    }
    isCameraOpen = false;
    isTorchOn = false;
  }

  async function toggleTorch() {
    if (!cameraStream) return;
    const track = cameraStream.getVideoTracks()[0];
    if (!track) return;
    try {
      const nextState = !isTorchOn;
      await track.applyConstraints({ advanced: [{ torch: nextState }] });
      isTorchOn = nextState;
      render('module-content');
      setTimeout(() => {
        const videoEl = document.getElementById('pc-live-video');
        if (videoEl && cameraStream) videoEl.srcObject = cameraStream;
      }, 40);
    } catch (e) {
      alert('ℹ️ 현재 기기 또는 브라우저에서는 웹 카메라 플래시(조명) 직접 제어를 지원하지 않습니다.');
    }
  }

  function captureFromLiveCamera() {
    const videoEl = document.getElementById('pc-live-video');
    if (!videoEl || !videoEl.videoWidth) return;

    const capCanvas = document.createElement('canvas');
    capCanvas.width = videoEl.videoWidth;
    capCanvas.height = videoEl.videoHeight;
    const ctx = capCanvas.getContext('2d');
    ctx.drawImage(videoEl, 0, 0);

    const dataUrl = capCanvas.toDataURL('image/jpeg', 0.92);
    stopLiveCamera();
    loadImageFromSrc(dataUrl);
  }

  function handleFileSelect(event) {
    const file = event.target && event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      loadImageFromSrc(e.target.result);
    };
    reader.readAsDataURL(file);
  }

  function loadImageFromSrc(src, demoMarkers = null) {
    const img = new Image();
    img.onload = function () {
      loadedImage = img;
      imageWidth = img.naturalWidth || img.width;
      imageHeight = img.naturalHeight || img.height;
      undoStack = [];
      zoomLevel = 1.0;
      panX = 0;
      panY = 0;

      if (demoMarkers && !getGeminiApiKey()) {
        markers = demoMarkers;
        lastScanMethod = 'DEMO';
        checkTargetMatchFeedback();
        render('module-content');
      } else {
        runGeminiAIVision(false);
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

    if (!drugNameInput) drugNameInput = '샘플 테스트정 (45정 + 이종알약 1정)';
    if (!targetCount) {
      rxDose = '1';
      rxFreq = '3';
      rxDays = '15';
      targetCount = 45;
    }

    loadImageFromSrc(c.toDataURL('image/jpeg', 0.94), fallbackDemoMarkers);
  }

  // ============================================================================
  // UI 이벤트 핸들러
  // ============================================================================
  function updateRxInputs() {
    const nameEl = document.getElementById('pc-drug-name');
    const doseEl = document.getElementById('pc-rx-dose');
    const freqEl = document.getElementById('pc-rx-freq');
    const daysEl = document.getElementById('pc-rx-days');

    if (nameEl) drugNameInput = nameEl.value;
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
      checkTargetMatchFeedback();
      render('module-content');
    }
  }

  function setDirectTarget(val) {
    targetCount = Math.max(0, parseInt(val, 10) || 0);
    checkTargetMatchFeedback();
    render('module-content');
  }

  function setQuickTarget(num) {
    targetCount = Number(num) || 0;
    if (targetCount === 0) {
      rxDose = '';
      rxFreq = '';
      rxDays = '';
    }
    checkTargetMatchFeedback();
    render('module-content');
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
    stopLiveCamera();
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
    playFeedbackSound('ADD');
    checkTargetMatchFeedback();
    render('module-content');
  }

  function clearBatches() {
    batchCounts = [];
    render('module-content');
  }

  function saveCurrentInspection() {
    const batchSum = batchCounts.reduce((acc, b) => acc + (Number(b.count) || 0), 0);
    const totalCount = batchSum + markers.length;
    if (totalCount <= 0) return;

    const currUser = (window.SheetsSync && window.SheetsSync.getCurrentUser) ? window.SheetsSync.getCurrentUser() : null;
    const now = new Date();
    const timeStr = `${now.getMonth() + 1}/${now.getDate()} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const list = getHistoryList();
    list.unshift({
      id: 'pch_' + Date.now(),
      drugName: (drugNameInput || '').trim() || '조제 알약 카운팅',
      targetCount: targetCount || 0,
      totalCount,
      userName: currUser ? currUser.name : '약사',
      timeStr
    });
    saveHistoryList(list);
    playFeedbackSound('MATCH');
    render('module-content');
  }

  function clearHistory() {
    if (!confirm('최근 알약 카운팅 검수 이력을 모두 비우시겠습니까?')) return;
    saveHistoryList([]);
    render('module-content');
  }

  function toggleSound() {
    soundEnabled = !soundEnabled;
    render('module-content');
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
      alert('✅ Gemini 2.5 Vision AI 키가 저장되었으며, 약국 내 모든 기기(스마트폰·PC)에 자동 공유되었습니다!');
      if (loadedImage) {
        runGeminiAIVision(true);
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
    toggleLiveCamera,
    toggleTorch,
    captureFromLiveCamera,
    loadDemoSample,
    updateRxInputs,
    setDirectTarget,
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
    toggleSound,
    openAiSettingsModal,
    closeAiSettingsModal,
    saveAiSettingsKey
  };
})();
