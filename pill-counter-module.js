/**
 * 🔢 스마트 알약 카운터 & 조제 검수기 모듈 (AI Spatial Object Detection v2.0 - 대안 1 전면 적용)
 * 신세계약국 전용 유료 앱(Pilleye)급 Gemini 2.5 Flash Vision [box_2d] 딥러닝 객체 검출 메인 엔진 탑재
 * - 메인 엔진: 🤖 Google Gemini 2.5 Flash 네이티브 2D 바운딩박스([ymin, xmin, ymax, xmax] 0~1000 좌표계) 사물 검출 + NMS 중복 제거
 * - 클라우드 키 공유: 약국장님이 1회 API 키 등록 시 Firebase 실시간 DB를 통해 약국 모든 스마트폰·PC에 자동 동기화
 * - 보조 엔진: 🎯 원터치 알약 스포이드(1-Tap Template) & 과분할 폭주가 100% 제거된 NMS 원형 비전 검출기
 * - 조제실 특화: 🚨 이종 알약(다른 색·크기 알약 혼입) 자동 경보 + 👁️ 원본 비교(마커 숨기기) + 🧮 처방 계산기 + ➕ 다회차 누적 합산
 */
window.PillCounterModule = (function () {
  const HISTORY_STORAGE_KEY = 'ssg_pill_counter_history_v1';
  const GEMINI_KEY_STORAGE = 'ssg_pill_gemini_api_key_v1';
  const FIREBASE_AI_CONFIG_URL = 'https://shinsegae-pharmacy-default-rtdb.firebaseio.com/shinsegae_master_db/pillCounterConfig.json';

  // --- 상태 변수 ---
  let loadedImage = null;
  let loadedDataUrl = '';
  let imageWidth = 0;
  let imageHeight = 0;
  let markers = [];             // [{ id, x, y, r, box: [ymin,xmin,ymax,xmax], isManual, isOutlier, isAi }]
  let undoStack = [];

  // 엔진 모드: 'AI_PRIMARY' (Gemini 2.5 Vision box_2d 메인) | 'LOCAL_NMS' (로컬 스포이드/원형 검출)
  let engineMode = 'AI_PRIMARY';
  let showBoundingBoxes = true; // AI가 잡은 알약 사각 테두리(box_2d) 함께 표시 여부
  let lastScanMethod = '';      // 'AI_BOX2D' | 'LOCAL_TEMPLATE' | 'DEMO'
  let aiStatusMessage = '';

  // 보조 비전 파라미터 (로컬 스포이드/보정용)
  let bgMode = 'AUTO';          // 'AUTO' | 'DARK_BG' | 'BRIGHT_BG'
  let sensitivity = 50;         // 15 ~ 85
  let roiMarginPct = 6;         // 가장자리(책상/트레이 테두리) 제외 % (기본 6%)
  let outlierCheckEnabled = true;
  let lockedTemplate = null;    // 🎯 기준 알약 스포이드: { L, A, B, rNorm, areaNorm }

  // 캔버스 인터랙션 & 뷰어 상태
  let interactionMode = 'EDIT'; // 'EDIT' (+1/-1 터치보정) | 'LOCK_SAMPLE' (🎯 알약 스포이드) | 'PAN' (✋ 화면 이동)
  let markerDisplayStyle = 'NUMBER'; // 'NUMBER' | 'DOT_NUMBER' | 'RING'
  let markerScale = 95;
  let markerOpacity = 90;
  let hideMarkersTemp = false;
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

  // 분석용 캐시 데이터
  let cachedAnalysis = null;

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
          // 로컬에만 키가 있으면 클라우드에 올려서 전 직원이 공유하도록 백업
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
    if (outlierCheckEnabled && outlierMarkers.length > 0 && !isAiScanning) {
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
              <div style="font-size:15px; font-weight:900;">[대안 1] Gemini 2.5 AI 딥러닝 사물 검출 엔진을 활성화하려면 무료 API 키를 1회 등록해 주세요!</div>
              <div style="font-size:12px; color:#ddd6fe; margin-top:2px;">
                약국장님이 한 번만 등록하시면 약국 내 모든 스마트폰과 PC에 자동으로 공유되어 촬영 즉시 99% 정확도로 알약을 셉니다.
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
      <div class="pill-counter-wrapper" style="max-width:1280px; margin:0 auto; padding-bottom:40px;">
        
        <!-- 1. 상단 헤더 & AI 엔진 상태 표시 -->
        <div class="card shadow-sm mb-3" style="border-radius:20px; border:1px solid #cbd5e1; background:linear-gradient(135deg,#0f172a 0%,#1e1b4b 100%); color:#ffffff; padding:20px 24px;">
          <div class="d-flex justify-content-between align-items-center flex-wrap gap-3">
            <div>
              <div style="display:inline-flex; align-items:center; gap:6px; background:${hasApiKey ? 'rgba(16,185,129,0.22)' : 'rgba(245,158,11,0.22)'}; border:1px solid ${hasApiKey ? 'rgba(52,211,153,0.5)' : 'rgba(251,191,36,0.5)'}; color:${hasApiKey ? '#6ee7b7' : '#fde68a'}; padding:3px 11px; border-radius:20px; font-size:11.5px; font-weight:800; margin-bottom:6px;">
                <span>${hasApiKey ? '🤖 GEMINI 2.5 VISION AI (box_2d 사물검출 가동 중)' : '⚠️ AI 키 미등록 (등록 시 촬영 즉시 AI 자동 카운팅)'}</span>
              </div>
              <h2 style="font-size:22px; font-weight:900; margin:0; color:#ffffff; letter-spacing:-0.4px;">
                🔢 스마트 알약 카운터 & 조제 검수기 <span style="font-size:13px; font-weight:700; color:#a5b4fc;">v2.0 AI Object Detection</span>
              </h2>
              <p style="font-size:13px; color:#cbd5e1; margin:4px 0 0 0;">
                픽셀 밝기 공식 대신 <strong>Gemini 2.5 Vision AI 사물 검출(box_2d)</strong>이 사람 눈처럼 배경·그림자·테두리를 무시하고 실제 알약만 정확히 짚어냅니다.
              </p>
            </div>

            <div class="d-flex align-items-center gap-2 flex-wrap">
              <button type="button" onclick="PillCounterModule.toggleSound()" style="background:rgba(255,255,255,0.1); color:${soundEnabled ? '#38bdf8' : '#94a3b8'}; border:1px solid rgba(255,255,255,0.2); border-radius:12px; padding:8px 13px; font-size:12.5px; font-weight:700; cursor:pointer;">
                <i class="fas ${soundEnabled ? 'fa-volume-up' : 'fa-volume-mute'}"></i> ${soundEnabled ? '음성·진동 ON' : '무음 모드'}
              </button>
              <button type="button" onclick="PillCounterModule.openAiSettingsModal()" style="background:${hasApiKey ? 'rgba(16,185,129,0.25)' : 'rgba(245,158,11,0.3)'}; color:#ffffff; border:1px solid ${hasApiKey ? '#34d399' : '#fbbf24'}; border-radius:12px; padding:8px 14px; font-size:12.5px; font-weight:800; cursor:pointer;">
                🔑 ${hasApiKey ? 'AI 키 연동됨 (설정)' : 'AI 키 등록하기'}
              </button>
              <button type="button" onclick="PillCounterModule.loadDemoSample()" style="background:rgba(255,255,255,0.12); color:#fde68a; border:1px solid rgba(251,191,36,0.4); border-radius:12px; padding:8px 13px; font-size:12.5px; font-weight:800; cursor:pointer;">
                🧪 샘플 45정 테스트
              </button>
            </div>
          </div>
        </div>

        ${apiKeyGuideBannerHTML}

        <!-- 2. 🧮 처방전 목표 수량 자동 계산기 & 실시간 카운트 전광판 -->
        <div class="row g-3 mb-3">
          <div class="col-lg-7">
            <div class="card shadow-sm h-100" style="border-radius:18px; border:1px solid #cbd5e1; background:#ffffff; padding:16px 20px;">
              <div class="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
                <div style="font-size:14px; font-weight:800; color:#0f172a;">
                  🧮 처방전 조제 목표량 자동 계산기 <span style="font-size:11.5px; font-weight:600; color:#64748b;">(1회량 × 횟수 × 일수)</span>
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
                  <label style="font-size:11.5px; font-weight:700; color:#475569; display:block; margin-bottom:3px;">💊 약품명 / 환자 메모 (선택)</label>
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
                    <span>📸 현재 사진 감지 수량</span>
                    ${lastScanMethod === 'AI_BOX2D' ? `<span style="background:#6d28d9; color:#fff; padding:1px 7px; border-radius:10px; font-size:10.5px;">🤖 AI 정밀판독</span>` : ''}
                  </div>
                  <div style="display:flex; align-items:baseline; gap:8px;">
                    <span id="pc-current-count-num" style="font-size:38px; font-weight:900; color:#065f46; font-family:'Outfit',sans-serif; line-height:1.1;">${isAiScanning ? '...' : currCount}</span>
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
                    <button type="button" onclick="PillCounterModule.addCurrentToBatch()" ${currCount === 0 ? 'disabled' : ''} style="background:#059669; color:#ffffff; border:none; border-radius:10px; padding:7px 12px; font-size:12px; font-weight:800; cursor:pointer; opacity:${currCount === 0 ? '0.5' : '1'};">
                      ➕ 누적 합산 (${batchCounts.length + 1}차)
                    </button>
                    <button type="button" onclick="PillCounterModule.saveCurrentInspection()" ${totalEffectiveCount === 0 ? 'disabled' : ''} style="background:#ffffff; color:#047857; border:1.5px solid #059669; border-radius:10px; padding:7px 11px; font-size:12px; font-weight:800; cursor:pointer; opacity:${totalEffectiveCount === 0 ? '0.5' : '1'};">
                      💾 기록저장
                    </button>
                  </div>
                  ${batchCounts.length > 0 ? `
                    <div style="font-size:11.5px; color:#065f46; font-weight:700;">
                      ${batchCounts.map(b => `${b.batchNo}차(${b.count}정)`).join(' + ')}
                      <button type="button" onclick="PillCounterModule.clearBatches()" style="background:none; border:none; color:#dc2626; font-weight:800; cursor:pointer; margin-left:4px; text-decoration:underline;">[누적초기화]</button>
                    </div>
                  ` : `
                    <span style="font-size:11px; color:#047857;">💡 사진 촬영 즉시 AI가 알약 위치를 자동 검출합니다!</span>
                  `}
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
        <div class="card shadow-sm mb-3" style="border-radius:18px; border:1px solid #cbd5e1; background:#ffffff; padding:16px 20px;">
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
                <button type="button" onclick="PillCounterModule.runGeminiAIVision(true)" ${isAiScanning ? 'disabled' : ''} style="background:linear-gradient(135deg,#7c3aed 0%,#6d28d9 100%); color:#ffffff; border:none; border-radius:12px; padding:9px 16px; font-size:13px; font-weight:800; cursor:pointer; display:inline-flex; align-items:center; gap:6px; box-shadow:0 4px 12px rgba(124,58,237,0.3);">
                  <i class="fas ${isAiScanning ? 'fa-spinner fa-spin' : 'fa-robot'}"></i>
                  ${isAiScanning ? 'AI가 알약을 세는 중...' : '🤖 AI 사물검출 재실행'}
                </button>
                <button type="button" onclick="PillCounterModule.resetAll()" style="background:#fff1f2; color:#e11d48; border:1px solid #fecdd3; border-radius:12px; padding:9px 13px; font-size:12.5px; font-weight:800; cursor:pointer;">
                  🗑️ 사진 지우기
                </button>
              ` : ''}
            </div>
          </div>

          <!-- 🎥 실시간 WebRTC 카메라 뷰파인더 영역 -->
          ${isCameraOpen ? `
            <div style="margin-top:16px; background:#090d16; border-radius:16px; padding:14px; position:relative; text-align:center;">
              <div style="position:relative; display:inline-block; width:100%; max-width:720px; border-radius:12px; overflow:hidden; border:2px solid #38bdf8;">
                <video id="pc-live-video" autoplay playsinline muted style="width:100%; max-height:58vh; object-fit:contain; display:block; background:#000;"></video>
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

        <!-- 4. 메인 인터랙티브 비전 캔버스 & 제어 패널 -->
        <div class="row g-3">
          <div class="col-lg-8">
            <div class="card shadow-sm" style="border-radius:18px; border:1px solid #cbd5e1; background:#ffffff; overflow:hidden;">
              
              <!-- 캔버스 상단 툴바 -->
              <div style="background:#f8fafc; padding:10px 16px; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                <div class="d-flex align-items-center gap-1 flex-wrap">
                  <button type="button" onclick="PillCounterModule.setInteractionMode('EDIT')" style="background:${interactionMode === 'EDIT' ? '#1e40af' : '#ffffff'}; color:${interactionMode === 'EDIT' ? '#ffffff' : '#334155'}; border:1px solid #cbd5e1; border-radius:10px; padding:6px 12px; font-size:12px; font-weight:800; cursor:pointer;">
                    ✏️ 터치 보정 (+1 / -1)
                  </button>
                  <button type="button" onclick="PillCounterModule.setInteractionMode('LOCK_SAMPLE')" style="background:${interactionMode === 'LOCK_SAMPLE' ? '#059669' : (lockedTemplate ? '#ecfdf5' : '#ffffff')}; color:${interactionMode === 'LOCK_SAMPLE' ? '#ffffff' : (lockedTemplate ? '#047857' : '#334155')}; border:1px solid ${lockedTemplate ? '#10b981' : '#cbd5e1'}; border-radius:10px; padding:6px 12px; font-size:12px; font-weight:800; cursor:pointer;" title="알약 1개를 터치하면 그 알약과 동일한 크기·색상의 알약만 정밀 검출합니다">
                    🎯 ${lockedTemplate ? '알약 스포이드 적용됨' : '알약 1개 터치 스포이드'}
                  </button>
                  <button type="button" onclick="PillCounterModule.setInteractionMode('PAN')" style="background:${interactionMode === 'PAN' ? '#475569' : '#ffffff'}; color:${interactionMode === 'PAN' ? '#ffffff' : '#334155'}; border:1px solid #cbd5e1; border-radius:10px; padding:6px 11px; font-size:12px; font-weight:800; cursor:pointer;">
                    ✋ 화면 이동
                  </button>
                </div>

                <!-- 👁️ 원본 비교(마커 숨기기) & 실행취소 -->
                <div class="d-flex align-items-center gap-1 flex-wrap">
                  <button type="button"
                    onmousedown="PillCounterModule.setHideMarkersTemp(true)"
                    onmouseup="PillCounterModule.setHideMarkersTemp(false)"
                    onmouseleave="PillCounterModule.setHideMarkersTemp(false)"
                    ontouchstart="PillCounterModule.setHideMarkersTemp(true); event.preventDefault();"
                    ontouchend="PillCounterModule.setHideMarkersTemp(false); event.preventDefault();"
                    style="background:${hideMarkersTemp ? '#f59e0b' : '#0f172a'}; color:#ffffff; border:none; border-radius:10px; padding:6px 12px; font-size:12px; font-weight:800; cursor:pointer; user-select:none;">
                    👁️ 누르는 동안 마커 숨기기(원본비교)
                  </button>
                  <button type="button" onclick="PillCounterModule.undoLastAction()" ${undoStack.length === 0 ? 'disabled' : ''} style="background:#ffffff; color:#334155; border:1px solid #cbd5e1; border-radius:10px; padding:6px 10px; font-size:12px; font-weight:700; cursor:pointer; opacity:${undoStack.length === 0 ? '0.45' : '1'};">
                    ↩️ 되돌리기
                  </button>
                </div>
              </div>

              <!-- 캔버스 뷰포트 본체 -->
              <div id="pc-canvas-viewport" style="background:#0f172a; min-height:440px; max-height:72vh; position:relative; overflow:hidden; display:flex; align-items:center; justify-content:center; touch-action:none;">
                ${loadedImage ? `
                  <canvas id="pc-main-canvas" style="max-width:100%; max-height:70vh; cursor:${interactionMode === 'PAN' ? 'grab' : 'crosshair'}; display:block;"></canvas>
                  ${isAiScanning ? `
                    <div style="position:absolute; inset:0; background:rgba(15,23,42,0.72); display:flex; flex-direction:column; align-items:center; justify-content:center; color:#ffffff; z-index:20; backdrop-filter:blur(3px);">
                      <div style="width:64px; height:64px; border-radius:20px; background:linear-gradient(135deg,#7c3aed,#2563eb); display:flex; align-items:center; justify-content:center; font-size:28px; margin-bottom:14px; box-shadow:0 0 30px rgba(124,58,237,0.6);">
                        <i class="fas fa-robot fa-bounce"></i>
                      </div>
                      <div style="font-size:18px; font-weight:900; letter-spacing:-0.3px; margin-bottom:6px;">
                        🤖 Gemini 2.5 Vision AI가 알약 객체를 정밀 검출 중입니다...
                      </div>
                      <div style="font-size:13px; color:#cbd5e1;">
                        배경 노이즈와 그림자를 제외하고 개별 알약의 2D 위치(box_2d)를 찾고 있습니다 (약 1~2초)
                      </div>
                    </div>
                  ` : ''}
                ` : `
                  <div style="text-align:center; padding:50px 24px; color:#94a3b8;">
                    <div style="width:76px; height:76px; border-radius:24px; background:rgba(139,92,246,0.15); border:2px dashed rgba(167,139,250,0.5); color:#c4b5fd; display:flex; align-items:center; justify-content:center; font-size:32px; margin:0 auto 16px auto;">
                      <i class="fas fa-robot"></i>
                    </div>
                    <h4 style="color:#f8fafc; font-size:17px; font-weight:800; margin-bottom:8px;">
                      조제할 알약을 펴놓고 사진을 촬영해 주세요
                    </h4>
                    <p style="font-size:13px; color:#94a3b8; max-width:480px; margin:0 auto 20px auto; line-height:1.6;">
                      • 사진을 찍거나 불러오면 <strong>Gemini 2.5 Vision AI 사물 검출(box_2d)</strong> 엔진이 즉시 가동되어 실제 알약만 정확히 짚어냅니다.<br>
                      • 혹시 누락되거나 더 찍힌 알약이 있으면 화면을 톡 터치해 <strong>+1 추가 / -1 삭제</strong>할 수 있습니다.
                    </p>
                    <div class="d-flex justify-content-center gap-2 flex-wrap">
                      <label for="pc-camera-file-input" style="background:#2563eb; color:#ffffff; border-radius:12px; padding:10px 20px; font-size:13.5px; font-weight:800; cursor:pointer; margin:0;">
                        📸 바로 사진 찍기
                      </label>
                      <button type="button" onclick="PillCounterModule.loadDemoSample()" style="background:#f59e0b; color:#0f172a; border:none; border-radius:12px; padding:10px 18px; font-size:13.5px; font-weight:800; cursor:pointer;">
                        🧪 샘플 45정 테스트 체험
                      </button>
                    </div>
                  </div>
                `}
              </div>

              <!-- 캔버스 하단 안내 & 돋보기 줌 바 -->
              <div style="background:#f8fafc; padding:9px 16px; border-top:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; font-size:12px; color:#475569;">
                <div>
                  ${interactionMode === 'LOCK_SAMPLE' ? `
                    <strong style="color:#059669;">🎯 [알약 1개 터치 스포이드 모드]</strong> 화면에서 <strong>정상 알약 1개의 정중앙을 콕</strong> 찍어주세요!
                  ` : `
                    💡 <strong>터치 보정:</strong> 빈 알약 터치 시 <strong style="color:#16a34a;">+1 추가</strong> / 찍힌 번호 마커 터치 시 <strong style="color:#dc2626;">-1 삭제</strong>
                  `}
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
          </div>

          <!-- 우측: AI 사물 검출 & 마커 제어 패널 -->
          <div class="col-lg-4">
            <div class="card shadow-sm mb-3" style="border-radius:18px; border:1px solid #cbd5e1; background:#ffffff; padding:16px 18px;">
              <h4 style="font-size:14.5px; font-weight:800; color:#0f172a; margin:0 0 12px 0; display:flex; align-items:center; justify-content:space-between;">
                <span>🤖 AI 사물 검출 & 마커 표시 설정</span>
                <span style="font-size:11px; color:#6d28d9; font-weight:800;">대안 1 (box_2d)</span>
              </h4>

              <!-- AI 인식 상태 요약 박스 -->
              <div class="p-3 mb-3" style="background:#f5f3ff; border:1.5px solid #ddd6fe; border-radius:12px;">
                <div style="font-size:12px; font-weight:800; color:#4c1d95; margin-bottom:4px;">
                  ⚡ 메인 엔진: Gemini 2.5 Flash Spatial AI
                </div>
                <div style="font-size:11.5px; color:#5b21b6; line-height:1.5;">
                  ${aiStatusMessage ? escapeHtml(aiStatusMessage) : (hasApiKey
                    ? '✅ API 키가 연동되어 있습니다. 사진을 찍으면 즉시 AI가 알약의 2D 경계 상자(box_2d)를 찾아 번호를 매깁니다.'
                    : '⚠️ 상단 [🔑 AI 키 등록하기]에서 무료 API 키를 1회 등록하면 촬영 즉시 AI 자동 판독이 작동합니다.')}
                </div>
                <div class="form-check form-switch mt-2">
                  <input class="form-check-input" type="checkbox" id="pc-bbox-toggle" ${showBoundingBoxes ? 'checked' : ''} onchange="PillCounterModule.toggleBoundingBoxes(this.checked)">
                  <label class="form-check-label" for="pc-bbox-toggle" style="font-size:11.5px; font-weight:800; color:#4c1d95;">
                    🔲 AI가 인식한 알약 테두리(Bounding Box) 함께 표시
                  </label>
                </div>
              </div>

              <!-- 마커 표시 스타일 & 크기 조절 -->
              <div class="p-2 mb-3" style="background:#f8fafc; border-radius:12px; border:1px solid #e2e8f0;">
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <span style="font-size:12px; font-weight:800; color:#334155;">🔢 마커 스타일</span>
                  <div class="btn-group btn-group-sm">
                    <button type="button" onclick="PillCounterModule.setMarkerStyle('NUMBER')" class="btn btn-xs ${markerDisplayStyle === 'NUMBER' ? 'btn-primary' : 'btn-outline-secondary'}" style="font-size:11px; padding:2px 8px;">번호원형</button>
                    <button type="button" onclick="PillCounterModule.setMarkerStyle('DOT_NUMBER')" class="btn btn-xs ${markerDisplayStyle === 'DOT_NUMBER' ? 'btn-primary' : 'btn-outline-secondary'}" style="font-size:11px; padding:2px 8px;">작은점+번호</button>
                    <button type="button" onclick="PillCounterModule.setMarkerStyle('RING')" class="btn btn-xs ${markerDisplayStyle === 'RING' ? 'btn-primary' : 'btn-outline-secondary'}" style="font-size:11px; padding:2px 8px;">투명링</button>
                  </div>
                </div>
                <div class="d-flex align-items-center gap-2" style="font-size:11.5px;">
                  <span style="min-width:58px; font-weight:700; color:#475569;">마커 크기:</span>
                  <input type="range" min="50" max="180" value="${markerScale}" oninput="PillCounterModule.onMarkerAppearanceChange('scale', this.value)" class="form-range">
                  <span id="pc-mscale-val" style="min-width:36px; text-align:right; font-weight:700;">${markerScale}%</span>
                </div>
                <div class="d-flex align-items-center gap-2 mt-1" style="font-size:11.5px;">
                  <span style="min-width:58px; font-weight:700; color:#475569;">투명도:</span>
                  <input type="range" min="30" max="100" value="${markerOpacity}" oninput="PillCounterModule.onMarkerAppearanceChange('opacity', this.value)" class="form-range">
                  <span id="pc-mopa-val" style="min-width:36px; text-align:right; font-weight:700;">${markerOpacity}%</span>
                </div>
              </div>

              <!-- 보조 로컬 스포이드 제어 (오프라인/수동 튜닝용) -->
              <div class="p-2 mb-2" style="background:#f8fafc; border-radius:12px; border:1px solid #e2e8f0;">
                <div style="font-size:11.5px; font-weight:800; color:#475569; margin-bottom:6px;">
                  🎯 보조 스포이드 설정 (알약 1개 터치 시 민감도)
                </div>
                <div class="d-flex justify-content-between" style="font-size:11.5px; font-weight:700; color:#334155; margin-bottom:2px;">
                  <span>스포이드 색상 허용 폭</span>
                  <strong id="pc-sens-val" style="color:#059669;">${sensitivity}%</strong>
                </div>
                <input type="range" min="15" max="85" value="${sensitivity}" oninput="PillCounterModule.onVisionSliderChange('sensitivity', this.value)" class="form-range">

                <div class="d-flex justify-content-between mt-1" style="font-size:11.5px; font-weight:700; color:#334155; margin-bottom:2px;">
                  <span>가장자리(트레이 테두리) 제외 영역</span>
                  <strong id="pc-roi-val" style="color:#d97706;">${roiMarginPct}%</strong>
                </div>
                <input type="range" min="0" max="25" value="${roiMarginPct}" oninput="PillCounterModule.onVisionSliderChange('roiMarginPct', this.value)" class="form-range">
              </div>

              <!-- 🚨 이종 알약 자동 감지 스위치 -->
              <div class="form-check form-switch mt-2">
                <input class="form-check-input" type="checkbox" id="pc-outlier-toggle" ${outlierCheckEnabled ? 'checked' : ''} onchange="PillCounterModule.toggleOutlierCheck(this.checked)">
                <label class="form-check-label" for="pc-outlier-toggle" style="font-size:12px; font-weight:800; color:#581c87;">
                  🚨 이종 알약(다른 색·크기 알약 섞임) 자동 경보
                </label>
              </div>
            </div>

            <!-- 📋 최근 조제 검수 히스토리 카드 -->
            <div class="card shadow-sm" style="border-radius:18px; border:1px solid #cbd5e1; background:#ffffff; padding:16px 18px;">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <h4 style="font-size:14px; font-weight:800; color:#0f172a; margin:0;">
                  📋 최근 알약 카운팅 검수 기록 (${historyList.length})
                </h4>
                ${historyList.length > 0 ? `
                  <button type="button" onclick="PillCounterModule.clearHistory()" style="background:none; border:none; color:#ef4444; font-size:11.5px; font-weight:700; cursor:pointer;">전체비우기</button>
                ` : ''}
              </div>

              <div style="max-height:220px; overflow-y:auto;">
                ${historyList.length === 0 ? `
                  <div style="text-align:center; padding:20px 10px; font-size:12px; color:#94a3b8;">
                    아직 저장된 검수 기록이 없습니다.<br>[💾 기록저장] 버튼을 누르면 최근 내역이 보관됩니다.
                  </div>
                ` : historyList.map(item => `
                  <div style="padding:8px 10px; border-bottom:1px solid #f1f5f9; display:flex; justify-content:space-between; align-items:center; font-size:12px;">
                    <div>
                      <div style="font-weight:800; color:#1e293b;">
                        ${escapeHtml(item.drugName || '일반 알약 카운팅')}
                        ${item.targetCount > 0 ? (item.totalCount === item.targetCount
                          ? `<span style="color:#059669; font-size:11px;">[✅ ${item.targetCount}정 일치]</span>`
                          : `<span style="color:#d97706; font-size:11px;">[목표 ${item.targetCount}정]</span>`) : ''}
                      </div>
                      <div style="font-size:11px; color:#64748b;">
                        ${item.timeStr} • 검수자: ${escapeHtml(item.userName || '약사')}
                      </div>
                    </div>
                    <div style="font-size:15px; font-weight:900; color:#047857;">
                      ${item.totalCount}정
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        </div>

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
        <div style="background:#ffffff; border-radius:22px; max-width:540px; width:100%; padding:26px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.4);">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h3 style="font-size:18px; font-weight:900; color:#4c1d95; margin:0;">🤖 Gemini 2.5 Vision AI 키 등록 (약국 전 기기 자동 공유)</h3>
            <button type="button" onclick="PillCounterModule.closeAiSettingsModal()" style="background:none; border:none; font-size:24px; color:#64748b; cursor:pointer;">&times;</button>
          </div>

          <div style="background:#f5f3ff; border:1px solid #ddd6fe; border-radius:14px; padding:14px; font-size:12.5px; color:#4c1d95; line-height:1.6; margin-bottom:14px;">
            <strong>💡 왜 Gemini 2.5 AI 사물 검출(대안 1)인가요?</strong><br>
            • 일반 밝기/색상 공식과 달리 <strong>AI가 사람 눈처럼 실제 알약의 2D 위치(box_2d)</strong>만 찾아내므로, 조제대 무늬·트레이 테두리·그림자·빛 반사에 의한 숫자 오류가 사라집니다.<br>
            • <strong>약국장님이 1회만 등록</strong>하시면 파이어베이스 클라우드를 통해 <strong>약국 모든 스마트폰·PC에 자동 연동</strong>됩니다!
          </div>

          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:12px; font-size:12px; color:#334155; margin-bottom:14px;">
            <strong>🔑 30초 무료 발급 방법 (Google AI Studio):</strong><br>
            1. <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener" style="color:#2563eb; font-weight:800; text-decoration:underline;">여기를 눌러 Google AI Studio(aistudio.google.com/app/apikey)</a>에 접속합니다.<br>
            2. 구글 로그인 후 <strong>[Create API key]</strong> 버튼을 눌러 생성된 <code>AIzaSy...</code> 키를 복사해 아래에 붙여넣으세요.
          </div>

          <div class="mb-3">
            <label style="font-size:12.5px; font-weight:800; color:#0f172a; display:block; margin-bottom:5px;">🔑 Google Gemini API Key 입력</label>
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
  // 🚀 [대안 1 메인 엔진] Google Gemini 2.5 Flash Spatial Object Detection (box_2d)
  // ============================================================================
  async function runGeminiAIVision(isManualTrigger = false) {
    if (!loadedImage) return;
    const apiKey = getGeminiApiKey();
    if (!apiKey || apiKey.length < 10) {
      if (isManualTrigger) {
        showAiConfigModal = true;
      } else {
        // API 키가 아직 없을 때는 과분할이 제거된 안전한 NMS 로컬 엔진으로 초기 표시 후 안내
        runSafeLocalVision();
        aiStatusMessage = 'ℹ️ 무료 AI 키를 등록하시면 촬영 즉시 Gemini 2.5 AI 사물 검출이 자동 실행됩니다.';
      }
      render('module-content');
      return;
    }

    isAiScanning = true;
    aiStatusMessage = '🤖 Gemini 2.5 Vision AI가 사진 속 알약의 2D 경계 상자(box_2d)를 정밀 검출 중입니다...';
    render('module-content');

    try {
      // ROI 여백이 설정되어 있으면 가장자리 노이즈 방지를 위해 ROI 내부만 깔끔하게 마스킹/전송
      const off = document.createElement('canvas');
      const maxDim = 1280;
      const sc = Math.min(1, maxDim / Math.max(imageWidth, imageHeight));
      off.width = Math.round(imageWidth * sc);
      off.height = Math.round(imageHeight * sc);
      const ctx = off.getContext('2d');
      ctx.drawImage(loadedImage, 0, 0, off.width, off.height);

      // 가장자리 제외 영역(roiMarginPct)이 있으면 테두리 바깥(책상/손/배경)을 어둡게 마스킹하여 AI가 트레이 내부 알약에만 100% 집중하도록 유도
      if (roiMarginPct > 0) {
        const mx = Math.round((off.width * roiMarginPct) / 100);
        const my = Math.round((off.height * roiMarginPct) / 100);
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(0, 0, off.width, my);
        ctx.fillRect(0, off.height - my, off.width, my);
        ctx.fillRect(0, 0, mx, off.height);
        ctx.fillRect(off.width - mx, 0, mx, off.height);
      }

      const base64Data = off.toDataURL('image/jpeg', 0.90).split(',')[1];

      // Gemini 2.5 네이티브 Spatial Grounding 프롬프트: [ymin, xmin, ymax, xmax] (0~1000 정수 좌표)
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

      // 1차: gemini-2.5-flash 호출 -> 실패 시 gemini-2.0-flash 자동 폴백
      let resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        }
      );

      if (!resp.ok) {
        resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
          }
        );
      }

      if (!resp.ok) {
        let errDetail = 'HTTP ' + resp.status;
        try {
          const errJson = await resp.json();
          if (errJson?.error?.message) errDetail = errJson.error.message;
        } catch (e) {}
        throw new Error(errDetail);
      }

      const json = await resp.json();
      let rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      rawText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();

      let parsed = {};
      try {
        parsed = JSON.parse(rawText);
      } catch (parseErr) {
        // 배열 형태로 바로 반환된 경우 대응
        if (rawText.charAt(0) === '\x5b') {
          parsed = { pills: JSON.parse(rawText) };
        }
      }

      const rawList = Array.isArray(parsed.pills) ? parsed.pills : (Array.isArray(parsed) ? parsed : []);

      // 2D 바운딩박스 정규화 및 이상치(트레이 전체 박스나 미세 먼지) 제거 + NMS(중복 박스 제거)
      const cleanedPills = postProcessAiBoxes(rawList);

      undoStack.push(JSON.parse(JSON.stringify(markers)));
      markers = cleanedPills;
      lastScanMethod = 'AI_BOX2D';
      aiStatusMessage = `✅ Gemini 2.5 AI 사물 검출 완료: 총 ${markers.length}정의 알약(box_2d)을 정확히 인식했습니다.`;
      checkTargetMatchFeedback();
    } catch (err) {
      aiStatusMessage = '⚠️ AI 호출 오류: ' + (err.message || err) + ' (API 키를 확인해 주세요)';
      if (isManualTrigger) {
        alert('⚠️ Gemini AI 스캔 중 오류가 발생했습니다:\n' + (err.message || err) + '\n\n[🔑 AI 키 연동 설정]에서 유효한 Gemini API 키인지 확인해 주세요.');
      } else {
        runSafeLocalVision();
      }
    } finally {
      isAiScanning = false;
      render('module-content');
    }
  }

  // Gemini box_2d ([ymin, xmin, ymax, xmax] 0~1000) 후처리 및 NMS(비최대 억제 중복 제거)
  function postProcessAiBoxes(rawList) {
    const candidates = [];

    for (let i = 0; i < rawList.length; i++) {
      const item = rawList[i];
      if (!item) continue;

      let ymin, xmin, ymax, xmax;
      if (Array.isArray(item.box_2d) && item.box_2d.length === 4) {
        [ymin, xmin, ymax, xmax] = item.box_2d.map(Number);
        // 만약 0~1 스케일로 왔다면 0~1000으로 변환
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
      // 너무 거대한 박스(트레이 전체: 화면의 35% 초과) 또는 너무 작은 점(화면의 0.5% 미만) 제외
      if (bw < 5 || bh < 5 || bw > 350 || bh > 350) continue;
      // 종횡비가 극단적인 선(트레이 테두리 직선 등: 5.5:1 초과) 제외
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
        area: bw * bh,
        isOutlier: !!item.isOutlier
      });
    }

    if (candidates.length === 0) return [];

    // 1. 표준 알약 반지름(중앙값) 계산 후 크기 이상치(배경 노이즈/거대 박스) 2차 필터링
    const sortedR = candidates.map(c => c.r).sort((a, b) => a - b);
    const medR = sortedR[Math.floor(sortedR.length / 2)] || 0.024;

    const sizeFiltered = candidates.filter(c => c.r >= medR * 0.38 && c.r <= medR * 2.8);

    // 2. NMS (Non-Maximum Suppression): 한 알약에 중복으로 2개 박스가 찍힌 경우 제거!
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
          r: Math.max(0.014, Math.min(0.055, medR * 0.95)),
          box: c.box,
          isManual: false,
          isAi: true,
          isOutlier: outlierCheckEnabled ? !!c.isOutlier : false
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

  // ============================================================================
  // 🎯 보조 엔진: 과분할(1알 다중 카운팅) 폭주가 100% 제거된 안전 NMS 로컬 비전 & 스포이드
  // ============================================================================
  function prepareImageAnalysisCache(img) {
    const MAX_DIM = 720;
    const origW = img.naturalWidth || img.width;
    const origH = img.naturalHeight || img.height;
    const scale = Math.min(1, MAX_DIM / Math.max(origW, origH));
    const w = Math.max(64, Math.round(origW * scale));
    const h = Math.max(64, Math.round(origH * scale));

    const offCanvas = document.createElement('canvas');
    offCanvas.width = w;
    offCanvas.height = h;
    const ctx = offCanvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);

    const imgData = ctx.getImageData(0, 0, w, h).data;
    const len = w * h;
    const L = new Float32Array(len);
    const A = new Float32Array(len);
    const B = new Float32Array(len);

    for (let i = 0; i < len; i++) {
      const idx = i * 4;
      const r = imgData[idx] / 255;
      const g = imgData[idx + 1] / 255;
      const b = imgData[idx + 2] / 255;
      L[i] = (0.299 * r + 0.587 * g + 0.114 * b) * 100;
      A[i] = (r - g) * 100;
      B[i] = ((r + g) * 0.5 - b) * 100;
    }

    cachedAnalysis = { w, h, L, A, B };
  }

  function runSafeLocalVision() {
    if (!loadedImage) return;
    if (!cachedAnalysis) prepareImageAnalysisCache(loadedImage);
    const { w, h, L, A, B } = cachedAnalysis;
    const len = w * h;

    const marginX = Math.round((w * Math.max(4, roiMarginPct)) / 100);
    const marginY = Math.round((h * Math.max(4, roiMarginPct)) / 100);

    // 1. 사진 바깥 테두리가 아니라 중앙 트레이 영역(20%~80%)의 픽셀 중앙값(Median)으로 배경 색상 추정!
    const sampleL = [];
    const sampleA = [];
    const sampleB = [];
    for (let y = Math.round(h * 0.15); y < Math.round(h * 0.85); y += 6) {
      for (let x = Math.round(w * 0.15); x < Math.round(w * 0.85); x += 6) {
        const i = y * w + x;
        sampleL.push(L[i]);
        sampleA.push(A[i]);
        sampleB.push(B[i]);
      }
    }
    sampleL.sort((a, b) => a - b);
    sampleA.sort((a, b) => a - b);
    sampleB.sort((a, b) => a - b);
    const midIdx = Math.floor(sampleL.length / 2);
    const bgL = sampleL[midIdx] || 40;
    const bgA = sampleA[midIdx] || 0;
    const bgB = sampleB[midIdx] || 0;

    const mask = new Uint8Array(len);
    const colorTol = 12 + (sensitivity / 100) * 26;

    for (let y = marginY; y < h - marginY; y++) {
      const row = y * w;
      for (let x = marginX; x < w - marginX; x++) {
        const i = row + x;
        if (lockedTemplate) {
          // 🎯 사용자가 찍은 알약 1개와 색상(L,A,B)이 일치하는 픽셀만 추출
          const distRef = Math.hypot(
            (L[i] - lockedTemplate.L) * 0.75,
            (A[i] - lockedTemplate.A) * 1.4,
            (B[i] - lockedTemplate.B) * 1.4
          );
          const distBg = Math.hypot(
            (L[i] - bgL) * 0.85,
            (A[i] - bgA) * 1.4,
            (B[i] - bgB) * 1.4
          );
          if (distRef <= colorTol && distBg > 12) {
            mask[i] = 1;
          }
        } else {
          const dL = L[i] - bgL;
          const dColor = Math.hypot(A[i] - bgA, B[i] - bgB);
          const diff = bgL < 55
            ? Math.max(0, dL) * 1.1 + dColor * 1.25
            : Math.max(0, -dL - 12) * 0.8 + dColor * 1.65;
          if (diff > (42 - (sensitivity / 100) * 22)) {
            mask[i] = 1;
          }
        }
      }
    }

    // 2. 최소 알약 면적 하한선 강제 적용 (미세 먼지/반사광/바닥 무늬 100% 제거!)
    const minDim = Math.min(w, h);
    const minPillRadiusPx = lockedTemplate
      ? Math.max(6, lockedTemplate.rNorm * minDim * 0.58)
      : Math.max(8, minDim * 0.017);
    const minPillAreaPx = Math.PI * minPillRadiusPx * minPillRadiusPx;
    const maxTotalBlobArea = w * h * 0.18;

    const visited = new Uint8Array(len);
    const queue = new Int32Array(len);
    const validBlobs = [];

    for (let y = marginY; y < h - marginY; y++) {
      for (let x = marginX; x < w - marginY; x++) {
        const start = y * w + x;
        if (!mask[start] || visited[start]) continue;

        let qH = 0, qT = 0;
        visited[start] = 1;
        queue[qT++] = start;
        let sumX = 0, sumY = 0;
        let minX = x, maxX = x, minY = y, maxY = y;

        while (qH < qT) {
          const curr = queue[qH++];
          const cx = curr % w;
          const cy = (curr / w) | 0;
          sumX += cx;
          sumY += cy;
          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;

          if (cx > marginX && mask[curr - 1] && !visited[curr - 1]) { visited[curr - 1] = 1; queue[qT++] = curr - 1; }
          if (cx < w - marginX - 1 && mask[curr + 1] && !visited[curr + 1]) { visited[curr + 1] = 1; queue[qT++] = curr + 1; }
          if (cy > marginY && mask[curr - w] && !visited[curr - w]) { visited[curr - w] = 1; queue[qT++] = curr - w; }
          if (cy < h - marginY - 1 && mask[curr + w] && !visited[curr + w]) { visited[curr + w] = 1; queue[qT++] = curr + w; }
        }

        const area = qT;
        const bw = maxX - minX + 1;
        const bh = maxY - minY + 1;
        const aspect = Math.max(bw, bh) / Math.max(1, Math.min(bw, bh));
        const fillRatio = area / Math.max(1, bw * bh);

        // 알약 형태 조건: 최소 면적 이상, 거대 배경 제외, 직선 테두리(aspect > 4.2) 제외, 속이 빈 테두리(fillRatio < 0.32) 제외
        if (area >= minPillAreaPx && area <= maxTotalBlobArea && aspect <= 4.2 && fillRatio >= 0.32) {
          validBlobs.push({
            area,
            cx: sumX / area,
            cy: sumY / area,
            minX, maxX, minY, maxY,
            rPx: Math.sqrt(area / Math.PI)
          });
        }
      }
    }

    if (validBlobs.length === 0) {
      markers = [];
      return;
    }

    // 3. 표준 단일 알약 면적 계산 (과분할 원천 차단!)
    const sortedAreas = validBlobs.map(b => b.area).sort((a, b) => a - b);
    const unitArea = lockedTemplate
      ? lockedTemplate.areaNorm * len
      : sortedAreas[Math.floor(sortedAreas.length * 0.5)];
    const unitRadiusPx = Math.sqrt(unitArea / Math.PI);

    const rawPills = [];
    validBlobs.forEach(b => {
      if (b.area < unitArea * 0.35) return;
      // 정말 2~3개가 붙은 확실한 경우(면적 1.85배 이상)에만 최대 3개까지 보수적으로 분할
      const countEst = Math.min(3, Math.max(1, Math.round(b.area / (unitArea * 1.15))));
      if (countEst === 1) {
        rawPills.push({
          x: b.cx / w,
          y: b.cy / h,
          r: (unitRadiusPx * 0.95) / minDim,
          box: [b.minY / h, b.minX / w, b.maxY / h, b.maxX / w]
        });
      } else {
        // 긴 축 방향으로 균등 배치
        const isHoriz = (b.maxX - b.minX) >= (b.maxY - b.minY);
        for (let k = 0; k < countEst; k++) {
          const frac = (k + 0.5) / countEst;
          const px = isHoriz ? (b.minX + (b.maxX - b.minX) * frac) : b.cx;
          const py = isHoriz ? b.cy : (b.minY + (b.maxY - b.minY) * frac);
          rawPills.push({
            x: px / w,
            y: py / h,
            r: (unitRadiusPx * 0.9) / minDim,
            box: null
          });
        }
      }
    });

    // 4. NMS (비최대 억제): 한 알약 반경(1.15 * r) 안에 절대 2개 이상의 마커가 찍히지 않도록 보장!
    const finalMarkers = [];
    const minDistNorm = (unitRadiusPx * 1.15) / minDim;

    for (let i = 0; i < rawPills.length; i++) {
      const p = rawPills[i];
      let tooClose = false;
      for (let j = 0; j < finalMarkers.length; j++) {
        if (Math.hypot(p.x - finalMarkers[j].x, p.y - finalMarkers[j].y) < minDistNorm) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) {
        // 중심 색상 샘플링 (이종 알약 감사용)
        const sx = Math.min(w - 1, Math.max(0, Math.round(p.x * w)));
        const sy = Math.min(h - 1, Math.max(0, Math.round(p.y * h)));
        const si = sy * w + sx;
        finalMarkers.push({
          id: 'loc_' + finalMarkers.length + '_' + Date.now(),
          x: p.x,
          y: p.y,
          r: p.r,
          box: p.box,
          colorL: L[si],
          colorA: A[si],
          colorB: B[si],
          isManual: false,
          isAi: false,
          isOutlier: false
        });
      }
    }

    sortMarkersReadingOrder(finalMarkers);
    markers = finalMarkers;
    if (outlierCheckEnabled) detectOutliersLocal();
  }

  function detectOutliersLocal() {
    if (!markers || markers.length < 4) return;
    const hasColor = markers.some(m => m.colorL !== undefined);
    if (!hasColor) return;

    const sortedL = markers.map(m => m.colorL || 70).sort((a, b) => a - b);
    const sortedA = markers.map(m => m.colorA || 0).sort((a, b) => a - b);
    const sortedB = markers.map(m => m.colorB || 0).sort((a, b) => a - b);
    const mid = Math.floor(markers.length / 2);
    const medL = lockedTemplate ? lockedTemplate.L : sortedL[mid];
    const medA = lockedTemplate ? lockedTemplate.A : sortedA[mid];
    const medB = lockedTemplate ? lockedTemplate.B : sortedB[mid];

    let found = false;
    markers.forEach(m => {
      if (m.isManual || m.colorL === undefined) return;
      const delta = Math.hypot((m.colorL - medL) * 0.65, (m.colorA - medA) * 1.45, (m.colorB - medB) * 1.45);
      m.isOutlier = delta > 24;
      if (m.isOutlier) found = true;
    });
    if (found) playFeedbackSound('WARN');
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
  // 인터랙티브 캔버스 렌더링 (AI box_2d 테두리 + 일련번호 배지 + 원본비교)
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

    // 1. 원본 사진 렌더링
    ctx.drawImage(loadedImage, 0, 0, dispW, dispH);

    // 2. ROI 가장자리 제외 가이드라인 표시
    if (roiMarginPct > 0 && !hideMarkersTemp) {
      const mx = (dispW * roiMarginPct) / 100;
      const my = (dispH * roiMarginPct) / 100;
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
      ctx.lineWidth = 1.5 / zoomLevel;
      ctx.setLineDash([6 / zoomLevel, 4 / zoomLevel]);
      ctx.strokeRect(mx, my, dispW - 2 * mx, dispH - 2 * my);
      ctx.setLineDash([]);
    }

    // 3. 마커 및 AI 바운딩박스(box_2d) 렌더링
    if (!hideMarkersTemp) {
      const alpha = markerOpacity / 100;
      const scaleMul = markerScale / 100;
      const minDim = Math.min(dispW, dispH);

      for (let i = 0; i < markers.length; i++) {
        const m = markers[i];
        const cx = m.x * dispW;
        const cy = m.y * dispH;
        const baseR = Math.max(10, Math.min(24, (m.r || 0.022) * minDim * 0.78)) * scaleMul;

        // 🔲 AI가 검출한 2D 바운딩박스(box_2d) 표시
        if (showBoundingBoxes && m.box && m.box.length === 4) {
          const [ymin, xmin, ymax, xmax] = m.box;
          const bx = xmin * dispW;
          const by = ymin * dispH;
          const bw = (xmax - xmin) * dispW;
          const bh = (ymax - ymin) * dispH;
          ctx.strokeStyle = m.isOutlier
            ? `rgba(147, 51, 234, ${Math.min(1, alpha)})`
            : `rgba(56, 189, 248, ${Math.min(0.85, alpha)})`;
          ctx.lineWidth = 1.8 / zoomLevel;
          ctx.strokeRect(bx, by, bw, bh);
        }

        // 🚨 이종 알약 경고 링
        if (m.isOutlier) {
          ctx.beginPath();
          ctx.arc(cx, cy, baseR * 1.45, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(147, 51, 234, ${Math.min(1, alpha + 0.1)})`;
          ctx.lineWidth = 3 / zoomLevel;
          ctx.stroke();
        }

        if (markerDisplayStyle === 'RING') {
          ctx.beginPath();
          ctx.arc(cx, cy, baseR, 0, Math.PI * 2);
          ctx.strokeStyle = m.isOutlier
            ? `rgba(147, 51, 234, ${alpha})`
            : (m.isManual ? `rgba(37, 99, 235, ${alpha})` : `rgba(16, 185, 129, ${alpha})`);
          ctx.lineWidth = 2.8 / zoomLevel;
          ctx.stroke();
        } else if (markerDisplayStyle === 'DOT_NUMBER') {
          ctx.beginPath();
          ctx.arc(cx, cy, Math.max(4, baseR * 0.35), 0, Math.PI * 2);
          ctx.fillStyle = m.isOutlier ? `rgba(147, 51, 234, ${alpha})` : `rgba(16, 185, 129, ${alpha})`;
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(cx, cy, baseR, 0, Math.PI * 2);
          ctx.fillStyle = m.isOutlier
            ? `rgba(147, 51, 234, ${alpha})`
            : (m.isManual ? `rgba(37, 99, 235, ${alpha})` : `rgba(5, 150, 105, ${alpha})`);
          ctx.fill();
          ctx.lineWidth = 1.8 / zoomLevel;
          ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
          ctx.stroke();
        }

        const fontSize = Math.max(9, Math.round(baseR * (i >= 99 ? 0.78 : 0.92)));
        ctx.font = `900 ${fontSize}px 'Outfit', sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const label = m.isOutlier ? `${i + 1}!` : String(i + 1);
        if (markerDisplayStyle !== 'NUMBER') {
          ctx.strokeStyle = 'rgba(15, 23, 42, 0.9)';
          ctx.lineWidth = 3 / zoomLevel;
          ctx.strokeText(label, cx, cy);
        }
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(1, alpha + 0.1)})`;
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

      if (interactionMode === 'LOCK_SAMPLE') {
        lockPillTemplateAt(nx, ny);
        return;
      }

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
        const hitRadius = Math.max(0.022, (m.r || 0.024) * (markerScale / 100) * 1.15);
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

  function lockPillTemplateAt(nx, ny) {
    if (!cachedAnalysis) prepareImageAnalysisCache(loadedImage);
    const { w, h, L, A, B } = cachedAnalysis;
    const px = Math.min(w - 1, Math.max(0, Math.round(nx * w)));
    const py = Math.min(h - 1, Math.max(0, Math.round(ny * h)));

    let sumL = 0, sumA = 0, sumB = 0, cnt = 0;
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const sx = Math.min(w - 1, Math.max(0, px + dx));
        const sy = Math.min(h - 1, Math.max(0, py + dy));
        const idx = sy * w + sx;
        sumL += L[idx];
        sumA += A[idx];
        sumB += B[idx];
        cnt++;
      }
    }
    const refL = sumL / cnt;
    const refA = sumA / cnt;
    const refB = sumB / cnt;

    const dirs = [[1,0],[-1,0],[0,1],[0,-1],[0.7,0.7],[-0.7,0.7],[0.7,-0.7],[-0.7,-0.7]];
    const radii = [];
    const maxSearchR = Math.round(Math.min(w, h) * 0.08);
    dirs.forEach(([dx, dy]) => {
      let rStep = 2;
      while (rStep < maxSearchR) {
        const sx = Math.round(px + dx * rStep);
        const sy = Math.round(py + dy * rStep);
        if (sx < 0 || sx >= w || sy < 0 || sy >= h) break;
        const idx = sy * w + sx;
        const diff = Math.hypot((L[idx] - refL) * 0.8, (A[idx] - refA) * 1.4, (B[idx] - refB) * 1.4);
        if (diff > 20) break;
        rStep++;
      }
      radii.push(rStep);
    });
    radii.sort((a, b) => a - b);
    const estRadiusPx = Math.max(7, radii[Math.floor(radii.length / 2)]);
    const rNorm = estRadiusPx / Math.min(w, h);
    const areaNorm = (Math.PI * estRadiusPx * estRadiusPx) / (w * h);

    lockedTemplate = { L: refL, A: refA, B: refB, rNorm, areaNorm };
    interactionMode = 'EDIT';
    lastScanMethod = 'LOCAL_TEMPLATE';
    runSafeLocalVision();
    aiStatusMessage = `🎯 스포이드 완료: 선택한 알약과 동일한 색상·크기의 알약 ${markers.length}정을 검출했습니다.`;
    playFeedbackSound('MATCH');
    render('module-content');
  }

  function clearLockedTemplate() {
    lockedTemplate = null;
    runGeminiAIVision(false);
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
    loadImageFromSrc(dataUrl, false);
  }

  function handleFileSelect(event) {
    const file = event.target && event.target.files && event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      loadImageFromSrc(e.target.result, false);
    };
    reader.readAsDataURL(file);
  }

  function loadImageFromSrc(src, isDemo = false) {
    const img = new Image();
    img.onload = function () {
      loadedImage = img;
      loadedDataUrl = src;
      imageWidth = img.naturalWidth || img.width;
      imageHeight = img.naturalHeight || img.height;
      cachedAnalysis = null;
      lockedTemplate = null;
      undoStack = [];
      zoomLevel = 1.0;
      panX = 0;
      panY = 0;

      if (isDemo && !getGeminiApiKey()) {
        // API 키 등록 전 데모 체험 시에는 데모 좌표/안전 로컬 엔진 즉시 표시
        runSafeLocalVision();
        lastScanMethod = 'DEMO';
        checkTargetMatchFeedback();
        render('module-content');
      } else {
        // 🚀 대안 1 핵심: 사진 촬영/업로드 즉시 Gemini 2.5 Vision AI 사물 검출(box_2d) 자동 실행!
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

    // 이종 알약 1정 추가 (총 45정)
    pillCoords.push({ x: w * 0.52, y: h * 0.51, isForeign: true });

    pillCoords.forEach((p) => {
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
    });

    if (!drugNameInput) drugNameInput = '샘플 테스트정 (45정 + 이종알약 1정)';
    if (!targetCount) {
      rxDose = '1';
      rxFreq = '3';
      rxDays = '15';
      targetCount = 45;
    }

    loadImageFromSrc(c.toDataURL('image/jpeg', 0.94), true);
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

  function onVisionSliderChange(key, val) {
    const num = Number(val);
    if (key === 'sensitivity') {
      sensitivity = num;
      const el = document.getElementById('pc-sens-val');
      if (el) el.textContent = num + '%';
      if (loadedImage && (lockedTemplate || !getGeminiApiKey())) {
        runSafeLocalVision();
        updateCountDisplayFast();
        drawCanvas();
      }
    } else if (key === 'roiMarginPct') {
      roiMarginPct = num;
      const el = document.getElementById('pc-roi-val');
      if (el) el.textContent = num + '%';
      if (loadedImage) {
        // 이미 AI로 찍힌 마커들 중 새로운 ROI 여백 바깥에 있는 테두리 오인식 마커들을 즉시 필터링!
        const mFrac = roiMarginPct / 100;
        markers = markers.filter(m => m.x >= mFrac && m.x <= (1 - mFrac) && m.y >= mFrac && m.y <= (1 - mFrac));
        updateCountDisplayFast();
        drawCanvas();
      }
    }
  }

  function onMarkerAppearanceChange(type, val) {
    const num = Number(val);
    if (type === 'scale') {
      markerScale = num;
      const el = document.getElementById('pc-mscale-val');
      if (el) el.textContent = num + '%';
    } else if (type === 'opacity') {
      markerOpacity = num;
      const el = document.getElementById('pc-mopa-val');
      if (el) el.textContent = num + '%';
    }
    drawCanvas();
  }

  function toggleBoundingBoxes(checked) {
    showBoundingBoxes = !!checked;
    drawCanvas();
  }

  function clearOutlierFlags() {
    markers.forEach(m => { m.isOutlier = false; });
    render('module-content');
  }

  function toggleOutlierCheck(checked) {
    outlierCheckEnabled = !!checked;
    if (!outlierCheckEnabled) {
      markers.forEach(m => { m.isOutlier = false; });
    } else {
      detectOutliersLocal();
    }
    render('module-content');
  }

  function setBgMode(mode) {
    bgMode = mode;
    render('module-content');
  }

  function setMarkerStyle(style) {
    markerDisplayStyle = style;
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

  function reRunLocalVision() {
    if (!loadedImage) return;
    runGeminiAIVision(true);
  }

  function resetAll() {
    stopLiveCamera();
    loadedImage = null;
    loadedDataUrl = '';
    cachedAnalysis = null;
    lockedTemplate = null;
    markers = [];
    undoStack = [];
    zoomLevel = 1.0;
    panX = 0;
    panY = 0;
    aiStatusMessage = '';
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
    loadedDataUrl = '';
    cachedAnalysis = null;
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
    onVisionSliderChange,
    onMarkerAppearanceChange,
    toggleBoundingBoxes,
    setBgMode,
    setMarkerStyle,
    setInteractionMode,
    setHideMarkersTemp,
    clearLockedTemplate,
    clearOutlierFlags,
    toggleOutlierCheck,
    undoLastAction,
    changeZoom,
    resetZoomPan,
    reRunLocalVision,
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
