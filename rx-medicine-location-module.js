/**
 * 💉 전문약(조제실) 보관 위치 & 전산 수정 이력 관리 모듈 (Rx Medicine Location Module)
 * 약품명 통합, 수기 위치 지정, 📸카메라 촬영/앨범 선택 (100KB 압축), ❄️냉장/🔒향정 구역 구분, 전산 수정 흔적 & 타임라인 기록
 */
window.RxMedicineLocationModule = (function () {
  'use strict';

  let activeCategory = 'ALL';
  let searchQuery = '';

  function escapeHTML(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  const DEFAULT_ZONES = [
    { id: 'ZONE_NOR', name: '📦 일반 조제선반 (실온)', icon: 'fa-cubes', color: '#059669', bg: '#f0fdf4', border: '#86efac' },
    { id: 'ZONE_REF', name: '❄️ 조제실 냉장고 (2~8℃)', icon: 'fa-snowflake', color: '#0284c7', bg: '#f0f9ff', border: '#bae6fd' },
    { id: 'ZONE_SAFE', name: '🔒 향정/마약류 보안금고', icon: 'fa-shield-halved', color: '#dc2626', bg: '#fff1f2', border: '#fecdd3' }
  ];

  function getInitialSound(text) {
    if (!text) return '';
    const CHOSUNG = [
      'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ',
      'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'
    ];
    let result = '';
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i) - 44032;
      if (code >= 0 && code <= 11172) {
        const chosungIndex = Math.floor(code / 588);
        result += CHOSUNG[chosungIndex];
      } else {
        result += text.charAt(i);
      }
    }
    return result;
  }

  const DEFAULT_SEED_ITEMS = [
    {
      id: 'rx_seed_1',
      name: '타이레놀정 500mg',
      zoneId: 'ZONE_NOR',
      zoneName: '📦 일반 조제선반 (실온)',
      locationDetail: '조제대 1번 랙 3단 5번서랍',
      notes: '조제대 전면 다빈도 랙 배치',
      adjustmentReason: '유팜 전산 500정 vs 실사 480정 실사 보정 완료',
      updatedAt: '2026-08-26 10:00',
      updatedBy: '이승학',
      photoUrl: '',
      history: []
    },
    {
      id: 'rx_seed_2',
      name: '팍스로비드',
      zoneId: 'ZONE_NOR',
      zoneName: '📦 일반 조제선반 (실온)',
      locationDetail: 'A-4 조제선반',
      notes: '코로나 치료제 전용 보관함',
      adjustmentReason: '유팜 전산 300 ↔ 실사 250 수량 재확인 수정',
      updatedAt: '2026-08-26 10:45',
      updatedBy: '문성도',
      photoUrl: '',
      history: []
    },
    {
      id: 'rx_seed_3',
      name: '아모디핀정 5mg',
      zoneId: 'ZONE_NOR',
      zoneName: '📦 일반 조제선반 (실온)',
      locationDetail: '조제대 2번 랙 1단 2번서랍',
      notes: '혈압약 전용선반',
      adjustmentReason: '조제실 수기 위치 및 재고 확인 기록',
      updatedAt: '2026-08-26 10:00',
      updatedBy: '권명주',
      photoUrl: '',
      history: []
    },
    {
      id: 'rx_seed_4',
      name: '휴마로그주사 퀵펜 (100단위/mL)',
      zoneId: 'ZONE_REF',
      zoneName: '❄️ 조제실 냉장고 (2~8℃)',
      locationDetail: '조제실 냉장고 1호 2번선반',
      notes: '2~8℃ 냉장 필수 보관',
      adjustmentReason: '유팜 전산 30펜 ↔ 실제 25펜 냉장 실사 보정',
      updatedAt: '2026-08-26 11:30',
      updatedBy: '문성도',
      photoUrl: '',
      history: []
    }
  ];

  function getStorageData() {
    try {
      if (window.SheetsSync && typeof window.SheetsSync.getRxMedicineLocations === 'function') {
        const cloudData = window.SheetsSync.getRxMedicineLocations();
        if (cloudData && Array.isArray(cloudData)) return cloudData;
      }
      const raw = localStorage.getItem('ssg_rx_medicine_locations_v1') || localStorage.getItem('ssg_rx_medicine_locations');
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
      return [];
    } catch (e) {
      return [];
    }
  }

  function saveStorageData(list) {
    if (window.SheetsSync && typeof window.SheetsSync.saveRxMedicineLocations === 'function') {
      window.SheetsSync.saveRxMedicineLocations(list);
      if (typeof window.SheetsSync.pushToCloud === 'function') {
        window.SheetsSync.pushToCloud();
      }
    } else {
      localStorage.setItem('ssg_rx_medicine_locations_v1', JSON.stringify(list));
      localStorage.setItem('ssg_rx_medicine_locations', JSON.stringify(list));
    }
  }

  // 📸 캔버스 압축 (Max Width 600px, 0.5 Quality -> 100~200KB)
  function handlePhotoSelect(inputEl) {
    const file = inputEl.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 600;
        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.5);

        const previewImg = document.getElementById('rx-photo-preview-img');
        const base64Input = document.getElementById('rx-photo-base64');
        const prevContainer = document.getElementById('rx-photo-preview-container');

        if (previewImg) previewImg.src = compressedBase64;
        if (base64Input) base64Input.value = compressedBase64;
        if (prevContainer) prevContainer.style.display = 'block';
      };
    };
  }

  function resetPhoto() {
    const camInput = document.getElementById('rx-photo-camera');
    const galInput = document.getElementById('rx-photo-gallery');
    if (camInput) camInput.value = '';
    if (galInput) galInput.value = '';

    const base64Input = document.getElementById('rx-photo-base64');
    if (base64Input) base64Input.value = '';

    const prevContainer = document.getElementById('rx-photo-preview-container');
    if (prevContainer) prevContainer.style.display = 'none';
  }

  function filterItems(items) {
    return items.filter(item => {
      const matchCat = activeCategory === 'ALL' || item.zoneId === activeCategory;
      const rawQ = searchQuery.toLowerCase().trim();
      if (!rawQ) return matchCat;

      const keywords = rawQ.split(/\s+/).filter(Boolean);
      const initial = getInitialSound(item.name || '').toLowerCase();

      const targetText = [
        item.name || '',
        item.zoneName || '',
        item.locationDetail || '',
        item.notes || '',
        item.adjustmentReason || '',
        item.updatedBy || '',
        initial
      ].join(' ').toLowerCase();

      const targetTextNoSpace = targetText.replace(/\s+/g, '');

      const matchQuery = keywords.every(kw => {
        const kwNoSpace = kw.replace(/\s+/g, '');
        return targetText.includes(kw) || targetTextNoSpace.includes(kwNoSpace);
      });

      return matchCat && matchQuery;
    });
  }

  function render(containerId) {
    const container = document.getElementById(containerId || 'module-content');
    if (!container) return;

    const items = getStorageData();
    const filtered = filterItems(items);

    // ⚡ 새로 등록/수정된 전문약 위치 정보가 무조건 맨 최상단(Top) 첫 번째에 뜨도록 최신순 내림차순 정렬
    const sortedFiltered = [...filtered].sort((a, b) => {
      const getNum = (item) => {
        if (item.updatedAt) {
          if (typeof item.updatedAt === 'number') return item.updatedAt;
          const ms = new Date(String(item.updatedAt).replace(/-/g, '/')).getTime();
          if (!isNaN(ms)) return ms;
        }
        if (item.createdAt) return item.createdAt;
        if (item.id && typeof item.id === 'string' && item.id.startsWith('rx_')) {
          const num = parseInt(item.id.replace('rx_', ''), 10);
          if (!isNaN(num)) return num;
        }
        return 0;
      };
      return getNum(b) - getNum(a);
    });

    const html = `
      <div class="module-header flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm mb-4 sm:mb-5">
        <div class="space-y-1">
          <h2 class="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2 flex-wrap">
            <i class="fas fa-pills text-emerald-600"></i>
            <span>💉 전문약 (조제실) 위치 관리 & 전산 수정 흔적 기록</span>
          </h2>
          <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed break-keep">
            조제실 수기 위치 지정, 📸사진 첨부(100KB 압축), ❄️냉장/🔒향정 구역 구분, 전산 수정 이력 타임라인 추적
          </p>
        </div>
        <button type="button" class="w-full sm:w-auto flex-1 sm:flex-initial btn btn-emerald font-bold text-xs px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition flex items-center justify-center gap-1.5 whitespace-nowrap" onclick="RxMedicineLocationModule.openCreateModal()">
          <i class="fas fa-plus-circle"></i>
          <span>+ 새 전문약 위치/수정흔적 등록</span>
        </button>
      </div>

      <!-- 🔍 1. 실시간 통합 검색 바 & 퀵 필터 -->
      <div class="bg-white dark:bg-slate-900 p-3.5 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm mb-4 sm:mb-5 space-y-3">
        <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <div class="relative flex-grow">
            <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
            <input type="text" id="rx-search-input" value="${escapeHTML(searchQuery)}" oninput="RxMedicineLocationModule.handleSearch(this.value)" placeholder="약품명, 수기 위치, 수정 흔적 메모, 초성(예: ㅌㅇㄹㄴ) 검색..." class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl pl-8 pr-8 py-2 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-emerald-500">
            <button id="rx-search-clear-btn" onclick="RxMedicineLocationModule.handleSearch('')" style="display:${searchQuery ? 'block' : 'none'};" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs">✖</button>
          </div>

          <div class="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-xl whitespace-nowrap self-start sm:self-auto">
            <i class="fas fa-layer-group text-emerald-600"></i>
            <span>등록 전문약: <strong class="text-emerald-600 dark:text-emerald-400 text-sm font-black">${items.length}</strong>개</span>
          </div>
        </div>

        <div class="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs font-bold whitespace-nowrap pt-2 border-t border-slate-100 dark:border-slate-800">
          <button type="button" onclick="RxMedicineLocationModule.setCategory('ALL')" class="px-3 py-1.5 rounded-full text-xs font-black transition ${activeCategory === 'ALL' ? 'bg-emerald-600 text-white shadow' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'}">
            전체 보기 (${items.length})
          </button>
          ${DEFAULT_ZONES.map(z => {
            const count = items.filter(i => i.zoneId === z.id).length;
            const isSel = activeCategory === z.id;
            return `
              <button type="button" onclick="RxMedicineLocationModule.setCategory('${z.id}')" style="padding:6px 14px; border-radius:20px; font-size:12.5px; font-weight:700; border:1.5px solid ${isSel ? z.color : '#e2e8f0'}; background:${isSel ? z.color : '#ffffff'}; color:${isSel ? '#ffffff' : '#475569'}; cursor:pointer;">
                <span>${z.name}</span> (${count})
              </button>
            `;
          }).join('')}
        </div>
      </div>

      <!-- 📦 2. 전문약 카드리스트 Display Grid -->
      <div id="rx-card-grid-container">
        ${renderCardGridHTML(sortedFiltered, items.length)}
      </div>

      <!-- 📝 3. 전문약 등록/수정 전용 모달 -->
      <div id="rx-location-modal" class="modal-overlay" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(15,23,42,0.8); backdrop-filter:blur(5px); z-index:99999; justify-content:center; align-items:center; padding:16px;">
        <div class="modal-card shadow-2xl" style="background:#ffffff; border-radius:24px; max-width:560px; width:100%; max-height:90vh; overflow-y:auto; padding:28px; position:relative; box-sizing:border-box;">
          <div style="display:flex; align-items:center; justify-content:space-between; border-bottom:1.5px solid #f1f5f9; padding-bottom:14px; margin-bottom:20px;">
            <div style="display:flex; align-items:center; gap:10px;">
              <div style="width:40px; height:40px; border-radius:12px; background:#f0fdf4; color:#059669; display:flex; align-items:center; justify-content:center; font-size:20px; border:1px solid #86efac;">
                <i class="fas fa-pills"></i>
              </div>
              <div>
                <h3 id="rx-modal-title" style="font-size:18px; font-weight:800; color:#0f172a; margin:0;">전문약 위치 등록 & 전산 수정 흔적 기록</h3>
                <p style="font-size:12px; color:#64748b; margin:2px 0 0 0;">조제실 수기 위치와 유팜/전산상 수정한 흔적을 기록으로 남깁니다.</p>
              </div>
            </div>
            <button type="button" onclick="RxMedicineLocationModule.closeModal()" style="background:#f1f5f9; border:none; width:32px; height:32px; border-radius:50%; font-size:16px; color:#64748b; cursor:pointer;">&times;</button>
          </div>

          <form onsubmit="RxMedicineLocationModule.handleFormSubmit(event)" style="display:flex; flex-direction:column; gap:14px;">
            <input type="hidden" id="rx-item-id" value="" />

            <div>
              <label style="display:block; font-size:13px; font-weight:800; color:#334155; margin-bottom:5px;">약품명 <span style="color:#ef4444;">*</span></label>
              <input type="text" id="rx-name" required placeholder="예: 타이레놀정 500mg, 팍스로비드" style="width:100%; border:1.5px solid #cbd5e1; border-radius:10px; padding:10px 14px; font-size:14px; font-weight:700; outline:none; box-sizing:border-box;">
            </div>

            <div>
              <label style="display:block; font-size:13px; font-weight:800; color:#334155; margin-bottom:5px;">보관 구역 선택 <span style="color:#ef4444;">*</span></label>
              <select id="rx-zone-id" required style="width:100%; border:1.5px solid #cbd5e1; border-radius:10px; padding:10px 14px; font-size:14px; font-weight:700; outline:none; background:#ffffff; box-sizing:border-box;">
                ${DEFAULT_ZONES.map(z => `<option value="${z.id}">${z.name}</option>`).join('')}
              </select>
            </div>

            <div>
              <label style="display:block; font-size:13px; font-weight:800; color:#059669; margin-bottom:5px;">📍 조제실 수기 위치 (자유 작성) <span style="color:#ef4444;">*</span></label>
              <input type="text" id="rx-location-detail" required placeholder="예: 조제대 1번 랙 3단 5번서랍, 창가 A장 2단" style="width:100%; border:1.5px solid #86efac; background:#f0fdf4; border-radius:10px; padding:10px 14px; font-size:14px; font-weight:800; color:#065f46; box-sizing:border-box;">
            </div>

            <!-- 📝 전산 수정 흔적 메모 -->
            <div>
              <label style="display:block; font-size:13px; font-weight:800; color:#059669; margin-bottom:5px;">
                📝 전산 수정 흔적 & 보정 사유 메모 <span style="color:#ef4444;">*</span>
              </label>
              <input type="text" id="rx-adjustment-reason" required placeholder="예: 유팜 전산 200정 ↔ 실제 180정 실사 보정 완료, A-2선반에서 위치 이동" style="width:100%; border:1.5px solid #cbd5e1; border-radius:10px; padding:10px 14px; font-size:13.5px; font-weight:700; box-sizing:border-box;">
            </div>

            <!-- 📸 사진 첨부 (바로 카메라 촬영 & 앨범 사진 선택) -->
            <div>
              <label style="display:block; font-size:13px; font-weight:800; color:#334155; margin-bottom:6px;">
                보관 위치 사진 첨부 <span style="font-weight:normal; color:#64748b; font-size:12px;">(선택 - 100KB 자동 압축)</span>
              </label>
              
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; width:100%;">
                <label for="rx-photo-camera" style="display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; border-radius:14px; border:2px dashed #059669; padding:14px 10px; background:#f0fdf4; color:#059669; font-size:13px; font-weight:800; cursor:pointer; text-align:center;">
                  <i class="fas fa-camera" style="font-size:22px; color:#059669;"></i>
                  <span>📸 바로 카메라 촬영</span>
                  <span style="font-size:10px; color:#059669;">(모바일 현장 촬영)</span>
                </label>
                <input type="file" id="rx-photo-camera" accept="image/*" capture="environment" style="display:none;" onchange="RxMedicineLocationModule.handlePhotoSelect(this)">

                <label for="rx-photo-gallery" style="display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; border-radius:14px; border:2px dashed #94a3b8; padding:14px 10px; background:#f8fafc; color:#475569; font-size:13px; font-weight:800; cursor:pointer; text-align:center;">
                  <i class="fas fa-images" style="font-size:22px; color:#64748b;"></i>
                  <span>📁 앨범/사진 선택</span>
                  <span style="font-size:10px; color:#94a3b8;">(갤러리/PC 업로드)</span>
                </label>
                <input type="file" id="rx-photo-gallery" accept="image/*" style="display:none;" onchange="RxMedicineLocationModule.handlePhotoSelect(this)">
              </div>

              <div id="rx-photo-preview-container" style="display:none; margin-top:12px; text-align:center; background:#f1f5f9; padding:12px; border-radius:12px; position:relative;">
                <img id="rx-photo-preview-img" style="max-height:180px; border-radius:8px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);" />
                <input type="hidden" id="rx-photo-base64" />
                <button type="button" onclick="RxMedicineLocationModule.resetPhoto()" style="position:absolute; top:8px; right:8px; background:#ef4444; color:#fff; border:none; border-radius:50%; width:26px; height:26px; font-size:12px; cursor:pointer;">✕</button>
              </div>
            </div>

            <div>
              <label style="display:block; font-size:13px; font-weight:700; color:#334155; margin-bottom:4px;">참고 메모 (선택)</label>
              <textarea id="rx-notes" rows="2" placeholder="예: 조제대 손실분 등록, 3박스 추가 입고" style="width:100%; border:1.5px solid #cbd5e1; border-radius:10px; padding:10px 14px; font-size:13.5px; outline:none; box-sizing:border-box;"></textarea>
            </div>

            <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:10px;">
              <button type="button" class="btn btn-secondary" onclick="RxMedicineLocationModule.closeModal()" style="border-radius:10px; padding:10px 20px; font-weight:700;">취소</button>
              <button type="submit" id="rx-submit-btn" class="btn btn-emerald" style="border-radius:10px; padding:10px 22px; background:linear-gradient(135deg, #059669 0%, #047857 100%); color:#ffffff; font-weight:800; border:none; box-shadow:0 4px 12px rgba(5,150,105,0.3); cursor:pointer;">
                <i class="fas fa-save me-1"></i> 저장하기
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- 🔍 4. 전문약 위치 상세 & 히스토리 타임라인 팝업 모달 -->
      <div id="rx-detail-modal" class="modal-overlay" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(15,23,42,0.8); backdrop-filter:blur(5px); z-index:99999; justify-content:center; align-items:center; padding:16px;">
        <div class="modal-card shadow-2xl" style="background:#ffffff; border-radius:24px; max-width:600px; width:100%; max-height:90vh; overflow-y:auto; padding:28px; position:relative; box-sizing:border-box;">
          <button type="button" onclick="RxMedicineLocationModule.closeDetailModal()" style="position:absolute; top:20px; right:20px; background:#f1f5f9; border:none; width:34px; height:34px; border-radius:50%; font-size:16px; color:#64748b; cursor:pointer;"><i class="fas fa-times"></i></button>
          <div id="rx-detail-modal-content"></div>
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  function renderCardGridHTML(filtered, totalCount) {
    if (!filtered || filtered.length === 0) {
      return `
        <div class="bg-white dark:bg-slate-900 rounded-2xl p-8 sm:p-12 text-center border border-slate-200 dark:border-slate-800 space-y-3">
          <div class="text-4xl">💊</div>
          <h4 class="text-base font-bold text-slate-700 dark:text-slate-300">${totalCount === 0 ? '등록된 전문약 위치 데이터가 없습니다.' : '검색어와 일치하는 전문약 위치 정보가 없습니다.'}</h4>
          <p class="text-xs text-slate-400 max-w-sm mx-auto">상단의 <strong>[+ 새 전문약 위치/수정흔적 등록]</strong> 버튼을 눌러 위치와 수정 흔적을 남기세요.</p>
        </div>
      `;
    }

    return `
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
        ${filtered.map(item => renderItemCard(item)).join('')}
      </div>
    `;
  }

  function renderItemCard(item) {
    const zoneObj = DEFAULT_ZONES.find(z => z.id === item.zoneId) || DEFAULT_ZONES[0];
    const historyCount = item.history ? item.history.length : 1;
    const currUser = (window.SheetsSync && window.SheetsSync.getCurrentUser && window.SheetsSync.getCurrentUser()) || {};
    const isDirector = currUser.role === '약국장' || currUser.id === 'emp_1';
    const hasPhoto = !!item.photoUrl;

    return `
      <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden flex flex-col justify-between shadow-sm hover:shadow-md transition relative">
        <div>
          ${hasPhoto ? `
            <!-- 📸 사진이 있을 때 썸네일 박스 -->
            <div class="relative w-full h-40 sm:h-44 bg-slate-100 dark:bg-slate-950 overflow-hidden border-b border-slate-100 dark:border-slate-800 cursor-pointer" onclick="RxMedicineLocationModule.openDetailModal('${item.id}')">
              <img src="${item.photoUrl}" alt="${escapeHTML(item.name)}" class="w-full h-full object-cover" />
              <span class="absolute top-2.5 left-2.5 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full shadow-sm" style="background:${zoneObj.bg}; color:${zoneObj.color}; border:1px solid ${zoneObj.border};">
                ${zoneObj.name}
              </span>
            </div>
          ` : ''}

          <div class="p-4 space-y-3">
            <div class="flex items-center justify-between gap-2">
              <h3 class="text-base font-extrabold text-slate-900 dark:text-white leading-tight cursor-pointer break-all" onclick="RxMedicineLocationModule.openDetailModal('${item.id}')">
                ${escapeHTML(item.name)}
              </h3>
              ${!hasPhoto ? `
                <span class="text-[11px] font-extrabold px-2.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0" style="background:${zoneObj.bg}; color:${zoneObj.color}; border:1px solid ${zoneObj.border};">
                  ${zoneObj.name}
                </span>
              ` : ''}
            </div>

            <!-- 수기 위치 뱃지 -->
            <div class="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 rounded-xl p-3 flex items-start gap-2">
              <i class="fas fa-location-dot text-emerald-600 mt-0.5 text-xs"></i>
              <div>
                <div class="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">조제실 수기 위치</div>
                <div class="text-sm font-black text-emerald-900 dark:text-emerald-200 mt-0.5">
                  ${escapeHTML(item.locationDetail || '위치 미지정')}
                </div>
              </div>
            </div>

            <!-- 📝 전산 수정 흔적 메모 뱃지 -->
            ${item.adjustmentReason ? `
              <div class="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3">
                <div class="text-[10.5px] font-extrabold text-emerald-600 dark:text-emerald-400 mb-0.5">📝 전산 수정 흔적</div>
                <div class="text-xs font-bold text-slate-700 dark:text-slate-300 leading-snug">
                  ${escapeHTML(item.adjustmentReason)}
                </div>
              </div>
            ` : ''}

            ${item.notes ? `
              <div class="text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/80 rounded-lg p-2.5">
                <i class="fas fa-sticky-note text-rose-500 mr-1"></i> ${escapeHTML(item.notes)}
              </div>
            ` : ''}
          </div>
        </div>

        <!-- 하단 관리 메타 바 -->
        <div class="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-950 border-t border-slate-100 dark:border-slate-800 text-xs">
          <span class="text-[11px] font-medium text-slate-400">
            🕒 <b>${escapeHTML(item.updatedBy || '약국')}</b> (${escapeHTML(item.updatedAt ? String(item.updatedAt).substring(5,16) : '')})
          </span>
          <div class="flex items-center gap-1.5 flex-wrap">
            <button type="button" onclick="RxMedicineLocationModule.openEditModal('${item.id}')" class="px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-950 border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 font-bold text-xs transition">
              <i class="fas fa-edit me-1"></i> 수정/흔적
            </button>
            <button type="button" onclick="RxMedicineLocationModule.openDetailModal('${item.id}')" class="px-2.5 py-1 rounded-lg bg-blue-100 dark:bg-blue-950 border border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-300 font-bold text-xs transition">
              이력 (${historyCount})
            </button>
            ${isDirector ? `
              <button type="button" onclick="RxMedicineLocationModule.deleteItem('${item.id}', '${escapeHTML(item.name).replace(/'/g, "\\'")}')" class="px-2 py-1 rounded-lg bg-rose-100 dark:bg-rose-950 border border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-300 font-bold text-xs transition" title="약국장 전용 삭제">
                <i class="fas fa-trash-alt"></i>
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }

  function handleSearch(val) {
    searchQuery = val;
    const clearBtn = document.getElementById('rx-search-clear-btn');
    if (clearBtn) clearBtn.style.display = val ? 'block' : 'none';

    const gridContainer = document.getElementById('rx-card-grid-container');
    if (gridContainer) {
      const items = getStorageData();
      const filtered = filterItems(items);
      gridContainer.innerHTML = renderCardGridHTML(filtered, items.length);
    } else {
      render();
    }
  }

  function setCategory(cat) {
    activeCategory = cat;
    render();
  }

  function openCreateModal() {
    document.getElementById('rx-item-id').value = '';
    document.getElementById('rx-modal-title').innerText = '전문약 보관 위치 등록 & 전산 수정 흔적 작성';
    document.getElementById('rx-name').value = '';
    document.getElementById('rx-name').readOnly = false;
    document.getElementById('rx-zone-id').value = 'ZONE_NOR';
    document.getElementById('rx-location-detail').value = '';
    document.getElementById('rx-adjustment-reason').value = '';
    document.getElementById('rx-notes').value = '';
    resetPhoto();

    const modal = document.getElementById('rx-location-modal');
    if (modal) modal.style.display = 'flex';
  }

  function openEditModal(id) {
    const items = getStorageData();
    const target = items.find(i => i.id === id);
    if (!target) return;

    document.getElementById('rx-item-id').value = target.id;
    document.getElementById('rx-modal-title').innerText = `🔄 [${target.name}] 위치 및 전산 수정 흔적 작성`;
    document.getElementById('rx-name').value = target.name;
    document.getElementById('rx-name').readOnly = true;
    document.getElementById('rx-zone-id').value = target.zoneId || 'ZONE_NOR';
    document.getElementById('rx-location-detail').value = target.locationDetail || '';
    document.getElementById('rx-adjustment-reason').value = target.adjustmentReason || '';
    document.getElementById('rx-notes').value = target.notes || '';

    resetPhoto();
    if (target.photoUrl) {
      document.getElementById('rx-photo-preview-img').src = target.photoUrl;
      document.getElementById('rx-photo-base64').value = target.photoUrl;
      document.getElementById('rx-photo-preview-container').style.display = 'block';
    }

    const modal = document.getElementById('rx-location-modal');
    if (modal) modal.style.display = 'flex';
  }

  async function handleFormSubmit(e) {
    if (e && e.preventDefault) e.preventDefault();
    const btn = document.getElementById('rx-submit-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> 저장 중...';
    }

    try {
      const itemId = document.getElementById('rx-item-id') ? document.getElementById('rx-item-id').value : '';
      const nameElem = document.getElementById('rx-name');
      const name = nameElem ? nameElem.value.trim() : '';
      if (!name) {
        alert('⚠️ 전문약 품목명을 입력해 주세요.');
        return;
      }

      const zoneIdElem = document.getElementById('rx-zone-id');
      const zoneId = zoneIdElem ? zoneIdElem.value : 'ZONE_NOR';
      const zoneObj = DEFAULT_ZONES.find(z => z.id === zoneId);
      const zoneName = zoneObj ? zoneObj.name : '📦 일반 조제선반';
      const locDetailElem = document.getElementById('rx-location-detail');
      const locationDetail = locDetailElem ? locDetailElem.value.trim() : '';
      const adjReasonElem = document.getElementById('rx-adjustment-reason');
      const adjustmentReason = adjReasonElem ? adjReasonElem.value.trim() : '';
      const photoElem = document.getElementById('rx-photo-base64');
      const photoBase64 = photoElem ? photoElem.value : '';
      const notesElem = document.getElementById('rx-notes');
      const notes = notesElem ? notesElem.value.trim() : '';

      let photoUrl = photoBase64;
      if (photoBase64 && window.App && typeof window.App.uploadImageToImgBB === 'function') {
        try {
          if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> 이미지 호스팅 업로드 중...';
          photoUrl = await window.App.uploadImageToImgBB(photoBase64);
        } catch (err) {
          console.warn("ImgBB upload fail, using base64 fallback:", err);
        }
      }

      const currUser = (window.SheetsSync && window.SheetsSync.getCurrentUser && window.SheetsSync.getCurrentUser()) || { name: '약국' };
      const nowStr = formatCurrentDateTime();
      const nowMs = Date.now();
      const items = getStorageData() || [];

      if (itemId) {
        // 기존 위치 수정 및 수정 흔적 이력 축적
        const target = items.find(i => i.id === itemId);
        if (target) {
          const historyEntry = {
            zoneName: target.zoneName,
            locationDetail: target.locationDetail,
            photoUrl: target.photoUrl,
            updatedBy: target.updatedBy,
            updatedAt: target.updatedAt,
            notes: target.notes,
            adjustmentReason: target.adjustmentReason
          };
          if (!target.history) target.history = [];
          target.history.unshift(historyEntry);
          if (target.history.length > 5) target.history = target.history.slice(0, 5);

          target.zoneId = zoneId;
          target.zoneName = zoneName;
          target.locationDetail = locationDetail;
          target.photoUrl = photoUrl || target.photoUrl;
          target.notes = notes;
          target.adjustmentReason = adjustmentReason;
          target.updatedBy = currUser.name || '약국';
          target.updatedAt = nowMs;
          target.displayDate = nowStr;
        }
      } else {
        // 신규 등록 또는 동종 제품 존재 시 덮어쓰기
        const existingIndex = items.findIndex(i => (i.name || '').trim().toLowerCase() === name.toLowerCase());

        if (existingIndex !== -1) {
          const target = items[existingIndex];
          const historyEntry = {
            zoneName: target.zoneName,
            locationDetail: target.locationDetail,
            photoUrl: target.photoUrl,
            updatedBy: target.updatedBy,
            updatedAt: target.updatedAt,
            notes: target.notes,
            adjustmentReason: target.adjustmentReason
          };
          if (!target.history) target.history = [];
          target.history.unshift(historyEntry);
          if (target.history.length > 5) target.history = target.history.slice(0, 5);

          items[existingIndex] = {
            ...target,
            name: name,
            zoneId: zoneId,
            zoneName: zoneName,
            locationDetail: locationDetail,
            notes: notes || target.notes,
            photoUrl: photoUrl || target.photoUrl,
            adjustmentReason: adjustmentReason,
            updatedAt: nowMs,
            displayDate: nowStr,
            updatedBy: currUser.name || '약국'
          };
        } else {
          const newItem = {
            id: 'rx_' + nowMs,
            name,
            zoneId,
            zoneName,
            locationDetail,
            photoUrl: photoUrl || '',
            notes,
            adjustmentReason,
            updatedBy: currUser.name || '약국',
            updatedAt: nowMs,
            displayDate: nowStr,
            history: []
          };
          items.unshift(newItem);
        }
      }

      saveStorageData(items);
      closeModal();
      alert('✅ 성공적으로 저장되었습니다!');
      render('module-content');

    } catch (err) {
      console.error("RxMedicineLocationModule handleFormSubmit error:", err);
      alert("⚠️ 전문약 저장 처리 중 오류가 발생했습니다: " + err.message);
    } finally {
      const liveBtn = document.getElementById('rx-submit-btn');
      if (liveBtn) {
        liveBtn.disabled = false;
        liveBtn.innerHTML = '<i class="fas fa-save me-1"></i> 저장하기';
      }
    }
  }

  function openDetailModal(id) {
    const items = getStorageData();
    const target = items.find(i => i.id === id);
    if (!target) return;

    const history = target.history || [];
    const zoneObj = DEFAULT_ZONES.find(z => z.id === target.zoneId) || DEFAULT_ZONES[0];
    const currUser = (window.SheetsSync && window.SheetsSync.getCurrentUser && window.SheetsSync.getCurrentUser()) || {};
    const isDirector = currUser.role === '약국장' || currUser.id === 'emp_1';

    const contentHtml = `
      <div style="display:flex; align-items:center; justify-content:space-between; border-bottom:1.5px solid #f1f5f9; padding-bottom:14px; margin-bottom:16px; padding-right:50px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <div style="width:40px; height:40px; border-radius:12px; background:${zoneObj.bg}; color:${zoneObj.color}; display:flex; align-items:center; justify-content:center; font-size:20px; border:1px solid ${zoneObj.border};">
            <i class="fas fa-pills"></i>
          </div>
          <div>
            <h3 style="font-size:18px; font-weight:800; color:#0f172a; margin:0;">${escapeHTML(target.name)}</h3>
            <span style="font-size:11.5px; font-weight:800; color:${zoneObj.color};">${zoneObj.name}</span>
          </div>
        </div>
        ${isDirector ? `
          <button type="button" onclick="RxMedicineLocationModule.deleteItem('${target.id}', '${escapeHTML(target.name).replace(/'/g, "\\'")}')" style="background:#fff1f2; border:1px solid #fecdd3; border-radius:10px; padding:6px 12px; font-size:12px; font-weight:800; color:#e11d48; cursor:pointer; flex-shrink:0;">
            <i class="fas fa-trash-alt me-1"></i> 위치 삭제
          </button>
        ` : ''}
      </div>

      ${target.photoUrl ? `
        <div style="margin-bottom:18px; text-align:center; background:#f8fafc; border:1px solid #e2e8f0; border-radius:14px; padding:12px; position:relative;">
          <img src="${target.photoUrl}" alt="${escapeHTML(target.name)}" onclick="RxMedicineLocationModule.openPhoto('${target.id}')" style="max-height:260px; width:100%; object-fit:contain; border-radius:10px; cursor:pointer;" />
          <div style="margin-top:8px;">
            <button type="button" onclick="RxMedicineLocationModule.openPhoto('${target.id}')" style="display:inline-flex; align-items:center; gap:5px; background:#ffffff; border:1px solid #cbd5e1; padding:6px 14px; border-radius:10px; font-size:12px; font-weight:800; color:#059669; cursor:pointer; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
              <i class="fas fa-expand"></i> 사진 원본 크게보기
            </button>
          </div>
        </div>
      ` : ''}

      <div style="background:#f0fdf4; border:1.5px solid #86efac; border-radius:14px; padding:14px 16px; margin-bottom:20px;">
        <div style="font-size:11.5px; color:#059669; font-weight:700; margin-bottom:4px;">🎯 [현재 조제실 보관 위치]</div>
        <div style="font-size:15px; font-weight:900; color:#065f46;">${escapeHTML(target.locationDetail || '미지정')}</div>
        ${target.adjustmentReason ? `<div style="font-size:12.5px; color:#334155; margin-top:6px; font-weight:700;">📝 수정한 흔적: ${escapeHTML(target.adjustmentReason)}</div>` : ''}
        <div style="font-size:11px; color:#64748b; margin-top:8px; padding-top:6px; border-top:1px solid #bbf7d0;">
          수정자: <b>${escapeHTML(target.updatedBy || '약국')}</b> · 최종 수정시각: ${escapeHTML(target.updatedAt || '')}
        </div>
      </div>

      <h4 style="font-size:14px; font-weight:800; color:#0f172a; margin:0 0 12px 0; display:flex; align-items:center; gap:6px;">
        <i class="fas fa-history" style="color:#059669;"></i> 전산상 수정한 과거 흔적 이력 타임라인 (${history.length + 1}건)
      </h4>

      <div style="display:flex; flex-direction:column; gap:10px;">
        <div style="border-left:3px solid #059669; padding-left:12px; margin-left:4px;">
          <div style="font-size:11px; color:#059669; font-weight:800;">[최신 수정 흔적] ${target.updatedAt}</div>
          <div style="font-size:13px; font-weight:800; color:#0f172a;">${target.zoneName} - ${escapeHTML(target.locationDetail)}</div>
          <div style="font-size:11.5px; color:#334155; font-weight:600;">수정자: <b>${escapeHTML(target.updatedBy)}</b> | 내용: ${escapeHTML(target.adjustmentReason || '최신 등록')}</div>
        </div>

        ${history.map((h, idx) => `
          <div style="border-left:3px solid #cbd5e1; padding-left:12px; margin-left:4px; opacity:0.85;">
            <div style="font-size:11px; color:#64748b; font-weight:700;">[과거 수정 흔적 ${history.length - idx}] ${h.updatedAt || ''}</div>
            <div style="font-size:12.5px; font-weight:700; color:#475569;">${h.zoneName || ''} - ${escapeHTML(h.locationDetail || '')}</div>
            <div style="font-size:11px; color:#64748b;">수정자: <b>${escapeHTML(h.updatedBy || '')}</b> | 내용: ${escapeHTML(h.adjustmentReason || '이전 수정 흔적')}</div>
          </div>
        `).join('')}
      </div>
    `;

    document.getElementById('rx-detail-modal-content').innerHTML = contentHtml;
    document.getElementById('rx-detail-modal').style.display = 'flex';
  }

  function closeDetailModal() {
    const modal = document.getElementById('rx-detail-modal');
    if (modal) modal.style.display = 'none';
  }

  function deleteItem(id, name) {
    const currUser = (window.SheetsSync && window.SheetsSync.getCurrentUser && window.SheetsSync.getCurrentUser()) || {};
    const isDirector = currUser.role === '약국장' || currUser.id === 'emp_1';

    if (!isDirector) {
      alert('🔒 약품 위치 삭제는 약국장 권한 전용입니다.');
      return;
    }

    const list = getStorageData();
    const target = list.find(i => i.id === id);
    const targetName = name || (target ? target.name : '');

    if (confirm(`'${targetName}' 전문약 위치 정보를 정말 삭제하시겠습니까?\n(이 작업은 복구할 수 없습니다)`)) {
      if (window.SheetsSync && typeof window.SheetsSync.addDeletedId === 'function') {
        window.SheetsSync.addDeletedId(id);
      }
      const newList = list.filter(i => i.id !== id);
      saveStorageData(newList);
      closeDetailModal();
      render();
    }
  }

  function closeModal() {
    const modal = document.getElementById('rx-location-modal');
    if (modal) modal.style.display = 'none';
  }

  function formatCurrentDateTime() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mi = String(now.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
  }

  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ⚡ 파이어베이스 / 백엔드 실시간 구글 동기화 수신 이벤트 링커 (스마트폰 ↔ PC 0.1초 실시간 호환)
  if (typeof window !== 'undefined') {
    window.addEventListener('ssg_cloud_updated', function () {
      const currMod = window.App && typeof window.App.getActiveModule === 'function' ? window.App.getActiveModule() : '';
      if (currMod === 'rx-medicine-location' || document.getElementById('rx-card-grid-container')) {
        handleSearch(searchQuery || '');
      }
    });
  }

  function openPhoto(id) {
    try {
      const items = getStorageData() || [];
      const target = items.find(i => String(i.id) === String(id));
      if (target && target.photoUrl && window.App && typeof window.App.openImageLightbox === 'function') {
        window.App.openImageLightbox(target.photoUrl, target.name || '전문약 위치 사진');
      }
    } catch(e) {
      console.warn('openPhoto error:', e);
    }
  }

  return {
    render: render,
    handleSearch: handleSearch,
    setCategory: setCategory,
    handlePhotoSelect: handlePhotoSelect,
    resetPhoto: resetPhoto,
    openCreateModal: openCreateModal,
    openEditModal: openEditModal,
    openDetailModal: openDetailModal,
    closeDetailModal: closeDetailModal,
    closeModal: closeModal,
    handleFormSubmit: handleFormSubmit,
    deleteItem: deleteItem,
    openPhoto: openPhoto
  };
})();
