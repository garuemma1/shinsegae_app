/**
 * 📦 일반약 보관 위치 관리 모듈 (Medicine Location Module)
 * 신세계약국 입고 약품 보관 위치 사진 등록, 실시간 검색, 위치 변경 이력 추적
 */
window.MedicineLocationModule = (function () {
  let activeCategory = 'ALL';
  let searchQuery = '';

  function escapeHTML(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  const DEFAULT_ZONES = [
    { id: 'ZONE_A', name: 'A구역 (메인 카운터)', icon: 'fa-cash-register', color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' },
    { id: 'ZONE_B', name: 'B구역 (벽면 영양제)', icon: 'fa-capsules', color: '#059669', bg: '#f0fdf4', border: '#86efac' },
    { id: 'ZONE_C', name: 'C구역 (한방/외용제)', icon: 'fa-mortar-pestle', color: '#d97706', bg: '#fffbeb', border: '#fde68a' },
    { id: 'ZONE_D', name: 'D구역 (창고/상단)', icon: 'fa-boxes-stacked', color: '#7c3aed', bg: '#faf5ff', border: '#ddd6fe' },
    { id: 'ZONE_REF', name: '❄️ 냉장고', icon: 'fa-snowflake', color: '#0284c7', bg: '#f0f9ff', border: '#bae6fd' },
    { id: 'ZONE_EVENT', name: '🔥 이달의 행사매대', icon: 'fa-fire', color: '#dc2626', bg: '#fff1f2', border: '#fecdd3' }
  ];

  function getStorageData() {
    try {
      if (window.SheetsSync && typeof window.SheetsSync.getMedicineLocations === 'function') {
        return window.SheetsSync.getMedicineLocations();
      }
      const raw = localStorage.getItem('ssg_medicine_locations_v1') || localStorage.getItem('ssg_medicine_locations');
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveStorageData(list) {
    if (window.SheetsSync && typeof window.SheetsSync.saveMedicineLocations === 'function') {
      window.SheetsSync.saveMedicineLocations(list);
      if (typeof window.SheetsSync.pushToCloud === 'function') {
        window.SheetsSync.pushToCloud();
      }
    } else {
      localStorage.setItem('ssg_medicine_locations_v1', JSON.stringify(list));
      localStorage.setItem('ssg_medicine_locations', JSON.stringify(list));
    }
  }

  function render(containerId) {
    const container = document.getElementById(containerId || 'module-content');
    if (!container) return;

    const items = getStorageData();

    // 필터링 적용 (공백 무시 및 한글/영문 멀티 키워드 정밀 검색)
    let filtered = items.filter(item => {
      const matchCat = activeCategory === 'ALL' || item.zoneId === activeCategory;
      const rawQ = searchQuery.toLowerCase().trim();
      if (!rawQ) return matchCat;

      // 띄어쓰기로 분리된 다중 키워드 검색 지원 (예: "A구역 타이레놀")
      const keywords = rawQ.split(/\s+/).filter(Boolean);

      const targetText = [
        item.name || '',
        item.zoneName || '',
        item.locationDetail || '',
        item.notes || '',
        item.updatedBy || ''
      ].join(' ').toLowerCase();

      // 공백 제거 텍스트도 함께 검색 (예: "A 구역" vs "A구역")
      const targetTextNoSpace = targetText.replace(/\s+/g, '');

      const matchQuery = keywords.every(kw => {
        const kwNoSpace = kw.replace(/\s+/g, '');
        return targetText.includes(kw) || targetTextNoSpace.includes(kwNoSpace);
      });

      return matchCat && matchQuery;
    });

    // ⚡ 새로 등록/수정된 약품 위치 정보가 무조건 맨 최상단(Top) 첫 번째에 뜨도록 최신순 내림차순 정렬
    const sortedFiltered = [...filtered].sort((a, b) => {
      const getNum = (item) => {
        if (item.updatedAt) return item.updatedAt;
        if (item.createdAt) return item.createdAt;
        if (item.id && typeof item.id === 'string' && item.id.startsWith('med_')) {
          const num = parseInt(item.id.replace('med_', ''), 10);
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
            <i class="fas fa-boxes-packing text-blue-600"></i>
            <span>📦 일반약 위치 관리 & 위치 검색</span>
          </h2>
          <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed break-keep">
            신규 입고약 보관 위치 사진 업로드, 약품 검색 및 진열대 위치 변경 이력 추적
          </p>
        </div>
        <button type="button" class="w-full sm:w-auto flex-1 sm:flex-initial btn btn-primary font-bold text-xs px-3.5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white shadow-md transition flex items-center justify-center gap-1.5 whitespace-nowrap" onclick="MedicineLocationModule.openCreateModal()">
          <i class="fas fa-plus-circle"></i>
          <span>+ 새 약품 위치 등록</span>
        </button>
      </div>

      <!-- 🔍 1. 실시간 통합 검색 바 & 퀵 통계 -->
      <div class="bg-white dark:bg-slate-900 p-3.5 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm mb-4 sm:mb-5 space-y-3">
        <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <div class="relative flex-grow">
            <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
            <input type="text" id="med-search-input" value="${escapeHTML(searchQuery)}" oninput="MedicineLocationModule.handleSearch(this.value)" placeholder="약품명, 효능, 보관 위치(예: 임팩타민, A구역) 검색..." class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl pl-8 pr-8 py-2 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-blue-500">
            <button id="med-search-clear-btn" onclick="MedicineLocationModule.handleSearch('')" style="display:${searchQuery ? 'block' : 'none'};" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs">✖</button>
          </div>

          <div class="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-xl whitespace-nowrap self-start sm:self-auto">
            <i class="fas fa-layer-group text-blue-600"></i>
            <span>등록된 약품: <strong class="text-blue-600 dark:text-blue-400 text-sm font-black">${items.length}</strong>개</span>
          </div>
        </div>

        <!-- 🎯 2. 구역별 퀵 필터 탭 (no-scrollbar 가로 스크롤) -->
        <div class="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs font-bold whitespace-nowrap pt-2 border-t border-slate-100 dark:border-slate-800">
          <button type="button" onclick="MedicineLocationModule.filterCategory('ALL')" class="px-3 py-1.5 rounded-full text-xs font-black transition ${activeCategory === 'ALL' ? 'bg-blue-600 text-white shadow' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'}">
            전체 보기 (${items.length})
          </button>
          ${DEFAULT_ZONES.map(z => {
            const count = items.filter(i => i.zoneId === z.id).length;
            const isActive = activeCategory === z.id;
            return `
              <button type="button" onclick="MedicineLocationModule.filterCategory('${z.id}')" class="px-3 py-1.5 rounded-full text-xs font-bold transition border ${isActive ? 'bg-blue-600 text-white border-blue-600 shadow' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200'}">
                <i class="fas ${z.icon}"></i> ${z.name} (${count})
              </button>
            `;
          }).join('')}
        </div>
      </div>

      <!-- 🖼️ 3. 약품 카드 그리드 컨테이너 -->
      <div id="med-card-grid-container">
        ${renderCardGridHTML(sortedFiltered, items.length)}
      </div>

      <!-- 📝 4. 신규 등록 / 위치 변경 모달 -->
      <div id="med-location-modal" class="modal-overlay" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(15,23,42,0.75); backdrop-filter:blur(4px); z-index:99999; justify-content:center; align-items:center; padding:16px;">
        <div class="modal-card shadow-2xl" style="background:#ffffff; border-radius:24px; max-width:550px; width:100%; max-height:90vh; overflow-y:auto; padding:28px; position:relative; box-sizing:border-box;">
          <button type="button" onclick="MedicineLocationModule.closeModal()" style="position:absolute; top:20px; right:20px; background:#f1f5f9; border:none; width:34px; height:34px; border-radius:50%; font-size:16px; color:#64748b; cursor:pointer;"><i class="fas fa-times"></i></button>
          
          <div style="display:flex; align-items:center; gap:10px; border-bottom:1.5px solid #f1f5f9; padding-bottom:14px; margin-bottom:20px;">
            <div style="width:40px; height:40px; border-radius:12px; background:#eff6ff; color:#2563eb; display:flex; align-items:center; justify-content:center; font-size:20px;">
              <i class="fas fa-camera-retro"></i>
            </div>
            <div>
              <h3 id="med-modal-title" style="font-size:18px; font-weight:800; color:#0f172a; margin:0;">약품 보관 위치 등록</h3>
              <p style="font-size:12px; color:#64748b; margin:2px 0 0 0;">새로 입고되었거나 위치가 변경된 약품의 사진과 장소를 기입하세요.</p>
            </div>
          </div>

          <form onsubmit="MedicineLocationModule.handleSubmit(event)">
            <input type="hidden" id="med-item-id" value="" />

            <div class="mb-3">
              <label class="form-label font-bold" style="font-size:13.5px; color:#334155; margin-bottom:6px;">약품명 및 용량 <span style="color:#ef4444;">*</span></label>
              <input type="text" id="med-name" required placeholder="예: 임팩타민 프리미엄 120정, 판피린 큐" style="width:100%; border:1.5px solid #cbd5e1; border-radius:10px; padding:10px 14px; font-size:14px; font-weight:700; outline:none; box-sizing:border-box;" onfocus="this.style.borderColor='#2563eb'" onblur="this.style.borderColor='#cbd5e1'" />
            </div>

            <div class="mb-3">
              <label class="form-label font-bold" style="font-size:13.5px; color:#334155; margin-bottom:6px;">보관 구역 선택 <span style="color:#ef4444;">*</span></label>
              <select id="med-zone-id" required style="width:100%; border:1.5px solid #cbd5e1; border-radius:10px; padding:10px 14px; font-size:14px; font-weight:700; outline:none; background:#ffffff; box-sizing:border-box;">
                ${DEFAULT_ZONES.map(z => `<option value="${z.id}">${z.name}</option>`).join('')}
              </select>
            </div>

            <div class="mb-3">
              <label class="form-label font-bold" style="font-size:13.5px; color:#334155; margin-bottom:6px;">상세 위치 설명 <span style="color:#ef4444;">*</span></label>
              <input type="text" id="med-location-detail" required placeholder="예: A-2 진열대 맨 위칸 / 박스채 창고 D-1 보관" style="width:100%; border:1.5px solid #cbd5e1; border-radius:10px; padding:10px 14px; font-size:14px; font-weight:700; outline:none; box-sizing:border-box;" onfocus="this.style.borderColor='#2563eb'" onblur="this.style.borderColor='#cbd5e1'" />
            </div>

            <div class="mb-3">
              <label class="form-label font-bold" style="font-size:13.5px; color:#334155; margin-bottom:6px;">보관 위치 사진 첨부 <span style="font-weight:normal; color:#64748b; font-size:12px;">(선택)</span></label>
              
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; width:100%;">
                <!-- 📸 1. 바로 카메라 촬영 버튼 (스마트폰 직통: capture="environment") -->
                <label for="med-photo-camera" style="display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; border-radius:14px; border:2px dashed #2563eb; padding:16px 10px; background:#eff6ff; color:#1d4ed8; font-size:13px; font-weight:800; cursor:pointer; text-align:center;">
                  <i class="fas fa-camera" style="font-size:22px; color:#2563eb;"></i>
                  <span>📸 바로 카메라 촬영</span>
                  <span style="font-size:10px; color:#3b82f6;">(모바일 현장 촬영)</span>
                </label>
                <input type="file" id="med-photo-camera" accept="image/*" capture="environment" style="display:none;" onchange="MedicineLocationModule.handlePhotoSelect(this)">

                <!-- 📁 2. 앨범/사진 선택 버튼 -->
                <label for="med-photo-gallery" style="display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; border-radius:14px; border:2px dashed #94a3b8; padding:16px 10px; background:#f8fafc; color:#475569; font-size:13px; font-weight:800; cursor:pointer; text-align:center;">
                  <i class="fas fa-images" style="font-size:22px; color:#64748b;"></i>
                  <span>📁 앨범/사진 선택</span>
                  <span style="font-size:10px; color:#94a3b8;">(갤러리/PC)</span>
                </label>
                <input type="file" id="med-photo-gallery" accept="image/*" style="display:none;" onchange="MedicineLocationModule.handlePhotoSelect(this)">
              </div>

              <!-- 사진 미리보기 컨테이너 -->
              <div id="med-photo-preview-container" style="display:none; margin-top:12px; text-align:center; background:#f1f5f9; padding:12px; border-radius:12px; position:relative;">
                <img id="med-photo-preview-img" style="max-height:200px; border-radius:8px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);" />
                <input type="hidden" id="med-photo-base64" />
                <button type="button" onclick="MedicineLocationModule.resetPhoto()" style="position:absolute; top:8px; right:8px; background:#ef4444; color:#fff; border:none; border-radius:50%; width:26px; height:26px; font-size:12px; cursor:pointer;">✕</button>
              </div>
            </div>

            <div class="mb-4">
              <label class="form-label font-bold" style="font-size:13.5px; color:#334155; margin-bottom:6px;">특이사항 및 메모 (선택)</label>
              <textarea id="med-notes" rows="2" placeholder="예: 3박스 추가 입고됨, 유효기간 2028년까지" style="width:100%; border:1.5px solid #cbd5e1; border-radius:10px; padding:10px 14px; font-size:13.5px; outline:none; box-sizing:border-box;"></textarea>
            </div>

            <div style="display:flex; justify-content:end; gap:8px;">
              <button type="button" onclick="MedicineLocationModule.closeModal()" style="padding:10px 20px; border-radius:10px; background:#f1f5f9; color:#475569; border:none; font-weight:700; cursor:pointer;">취소</button>
              <button type="submit" id="med-submit-btn" style="padding:10px 22px; border-radius:10px; background:linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color:#ffffff; border:none; font-weight:800; cursor:pointer; box-shadow:0 4px 12px rgba(37,99,235,0.25);">
                <i class="fas fa-save me-1"></i> 저장하기
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- 🔍 약품 위치 상세 & 이력 히스토리 팝업 모달 -->
      <div id="med-detail-modal" class="modal-overlay" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(15,23,42,0.8); backdrop-filter:blur(5px); z-index:99999; justify-content:center; align-items:center; padding:16px;">
        <div class="modal-card shadow-2xl" style="background:#ffffff; border-radius:24px; max-width:600px; width:100%; max-height:90vh; overflow-y:auto; padding:28px; position:relative; box-sizing:border-box;">
          <button type="button" onclick="MedicineLocationModule.closeDetailModal()" style="position:absolute; top:20px; right:20px; background:#f1f5f9; border:none; width:34px; height:34px; border-radius:50%; font-size:16px; color:#64748b; cursor:pointer;"><i class="fas fa-times"></i></button>
          <div id="med-detail-modal-content"></div>
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  function renderMedicineCard(item) {
    const zone = DEFAULT_ZONES.find(z => z.id === item.zoneId) || { name: item.zoneName || '일반구역', color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe', icon: 'fa-box' };
    const historyCount = item.history ? item.history.length : 1;

    return `
      <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden flex flex-col justify-between shadow-sm hover:shadow-md transition relative">
        <div>
          <!-- 사진 보관 뷰 영역 -->
          <div class="relative w-full h-40 sm:h-44 bg-slate-100 dark:bg-slate-950 overflow-hidden border-b border-slate-100 dark:border-slate-800 cursor-pointer" onclick="MedicineLocationModule.openDetailModal('${item.id}')">
            ${item.photoUrl ? `
              <img src="${item.photoUrl}" alt="${escapeHTML(item.name)}" class="w-full h-full object-cover" />
            ` : `
              <div class="flex flex-col items-center justify-center h-full text-slate-400">
                <i class="fas fa-camera text-2xl mb-1"></i>
                <span class="text-xs font-bold">등록된 사진 없음</span>
              </div>
            `}
            <span class="absolute top-2.5 left-2.5 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full shadow-sm" style="background:${zone.bg}; color:${zone.color}; border:1px solid ${zone.border};">
              <i class="fas ${zone.icon}"></i> ${zone.name}
            </span>
          </div>

          <!-- 카드 정보 본문 -->
          <div class="p-4 space-y-3">
            <h4 class="text-base font-extrabold text-slate-900 dark:text-white leading-tight cursor-pointer break-all" onclick="MedicineLocationModule.openDetailModal('${item.id}')">
              ${escapeHTML(item.name)}
            </h4>

            <div class="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/80 rounded-xl p-3">
              <div class="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-0.5">📍 보관 상세 위치</div>
              <div class="text-sm font-black text-blue-900 dark:text-blue-200 break-all">
                ${escapeHTML(item.locationDetail)}
              </div>
            </div>

            ${item.notes ? `
              <p class="text-xs text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 rounded-lg p-2.5 font-bold leading-snug">
                💡 ${escapeHTML(item.notes)}
              </p>
            ` : ''}
          </div>
        </div>

        <!-- 카드 하단 관리 메타 바 -->
        <div class="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-950 border-t border-slate-100 dark:border-slate-800 text-xs">
          <span class="text-[11px] font-medium text-slate-400">
            🕒 <b>${escapeHTML(item.updatedBy || '약국')}</b> · ${escapeHTML(item.updatedAt ? String(item.updatedAt).substring(5,16) : '')}
          </span>

          <div class="flex items-center gap-1.5 flex-wrap">
            <button type="button" onclick="MedicineLocationModule.openEditModal('${item.id}')" class="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs transition">
              <i class="fas fa-sync-alt text-blue-500"></i> 변경
            </button>
            <button type="button" onclick="MedicineLocationModule.openDetailModal('${item.id}')" class="px-2.5 py-1 rounded-lg bg-blue-100 dark:bg-blue-950 border border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-300 font-bold text-xs transition">
              이력 (${historyCount})
            </button>
            ${window.SheetsSync && window.SheetsSync.getCurrentUser() && window.SheetsSync.getCurrentUser().role === '약국장' ? `
              <button type="button" onclick="MedicineLocationModule.deleteMedicine('${item.id}', '${escapeHTML(item.name).replace(/'/g, "\\'")}')" class="px-2 py-1 rounded-lg bg-rose-100 dark:bg-rose-950 border border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-300 font-bold text-xs transition" title="약국장 전용 삭제">
                <i class="fas fa-trash-alt"></i>
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }

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
        // Firebase payload 크기 최적화를 위해 0.5 압축 (100~200KB 수준)
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.5);

        document.getElementById('med-photo-preview-img').src = compressedBase64;
        document.getElementById('med-photo-base64').value = compressedBase64;
        document.getElementById('med-photo-preview-container').style.display = 'block';
      };
    };
  }

  function resetPhoto() {
    const camInput = document.getElementById('med-photo-camera');
    const galInput = document.getElementById('med-photo-gallery');
    if (camInput) camInput.value = '';
    if (galInput) galInput.value = '';

    const base64Input = document.getElementById('med-photo-base64');
    if (base64Input) base64Input.value = '';

    const prevContainer = document.getElementById('med-photo-preview-container');
    if (prevContainer) prevContainer.style.display = 'none';
  }

  function openCreateModal() {
    document.getElementById('med-item-id').value = '';
    document.getElementById('med-modal-title').innerText = '약품 보관 위치 등록';
    document.getElementById('med-name').value = '';
    document.getElementById('med-name').readOnly = false;
    document.getElementById('med-zone-id').value = 'ZONE_A';
    document.getElementById('med-location-detail').value = '';
    document.getElementById('med-notes').value = '';
    resetPhoto();
    document.getElementById('med-location-modal').style.display = 'flex';
  }

  function openEditModal(id) {
    const items = getStorageData();
    const target = items.find(i => i.id === id);
    if (!target) return;

    document.getElementById('med-item-id').value = target.id;
    document.getElementById('med-modal-title').innerText = `🔄 [${target.name}] 위치 변경 및 업데이트`;
    document.getElementById('med-name').value = target.name;
    document.getElementById('med-name').readOnly = true;
    document.getElementById('med-zone-id').value = target.zoneId || 'ZONE_A';
    document.getElementById('med-location-detail').value = target.locationDetail || '';
    document.getElementById('med-notes').value = target.notes || '';
    resetPhoto();

    if (target.photoUrl) {
      document.getElementById('med-photo-preview-img').src = target.photoUrl;
      document.getElementById('med-photo-base64').value = target.photoUrl;
      document.getElementById('med-photo-preview-container').style.display = 'block';
    }

    document.getElementById('med-location-modal').style.display = 'flex';
  }

  function closeModal() {
    document.getElementById('med-location-modal').style.display = 'none';
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const currUser = window.SheetsSync ? window.SheetsSync.getCurrentUser() : null;
    if (!currUser) {
      alert("로그인이 필요합니다.");
      return;
    }

    const btn = document.getElementById('med-submit-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 저장 중...';

    const itemId = document.getElementById('med-item-id').value;
    const name = document.getElementById('med-name').value.trim();
    const zoneId = document.getElementById('med-zone-id').value;
    const zoneObj = DEFAULT_ZONES.find(z => z.id === zoneId);
    const zoneName = zoneObj ? zoneObj.name : '일반구역';
    const locationDetail = document.getElementById('med-location-detail').value.trim();
    const photoBase64 = document.getElementById('med-photo-base64').value;
    const notes = document.getElementById('med-notes').value.trim();

    let photoUrl = photoBase64;
    if (photoBase64 && window.App && typeof window.App.uploadImageToImgBB === 'function') {
      try {
        if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 이미지 호스팅 업로드 중...';
        photoUrl = await window.App.uploadImageToImgBB(photoBase64);
      } catch (err) {
        console.warn("ImgBB upload fail, using base64 fallback:", err);
      }
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const date = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const nowStr = `${year}-${month}-${date} ${hours}:${minutes}`;
    const items = getStorageData();

    if (itemId) {
      // 기존 약품 위치 수정/변경 (히스토리 누적)
      const target = items.find(i => i.id === itemId);
      if (target) {
        const historyEntry = {
          zoneName: target.zoneName,
          locationDetail: target.locationDetail,
          photoUrl: target.photoUrl,
          updatedBy: target.updatedBy,
          updatedAt: target.updatedAt,
          notes: target.notes
        };
        if (!target.history) target.history = [];
        target.history.unshift(historyEntry);
        // 약품당 과거 사진 히스토리는 최근 5건만 보존하고 오래된 히스토리는 자동 정리 (메모리 절감)
        if (target.history.length > 5) {
          target.history = target.history.slice(0, 5);
        }

        target.zoneId = zoneId;
        target.zoneName = zoneName;
        target.locationDetail = locationDetail;
        target.photoUrl = photoUrl || target.photoUrl;
        target.notes = notes;
        target.updatedBy = currUser.name;
        target.updatedAt = Date.now();
        target.displayDate = nowStr;
      }
    } else {
      // 신규 입고 약품 위치 등록
      const newItem = {
        id: 'med_' + Date.now(),
        name,
        zoneId,
        zoneName,
        locationDetail,
        photoUrl: photoUrl || '',
        notes,
        updatedBy: currUser.name,
        updatedAt: Date.now(),
        displayDate: nowStr,
        history: []
      };
      items.unshift(newItem);
    }

    saveStorageData(items);
    closeModal();
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save me-1"></i> 저장하기';
    alert('✅ 성공적으로 저장되었습니다!');
    render('module-content');
  }

  function openDetailModal(id) {
    const items = getStorageData();
    const target = items.find(i => i.id === id);
    if (!target) return;

    const history = target.history || [];
    const zone = DEFAULT_ZONES.find(z => z.id === target.zoneId) || { name: target.zoneName, color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' };

    const contentHtml = `
      <div style="display:flex; align-items:center; justify-content:space-between; border-bottom:1.5px solid #f1f5f9; padding-bottom:14px; margin-bottom:16px; padding-right:50px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <div style="width:40px; height:40px; border-radius:12px; background:${zone.bg}; color:${zone.color}; display:flex; align-items:center; justify-content:center; font-size:20px;">
            <i class="fas fa-boxes-stacked"></i>
          </div>
          <div>
            <h3 style="font-size:18px; font-weight:800; color:#0f172a; margin:0;">${target.name}</h3>
            <span style="font-size:11.5px; font-weight:800; color:${zone.color};">📍 ${zone.name}</span>
          </div>
        </div>
        ${window.SheetsSync && window.SheetsSync.getCurrentUser() && window.SheetsSync.getCurrentUser().role === '약국장' ? `
          <button type="button" onclick="MedicineLocationModule.deleteMedicine('${target.id}', '${target.name.replace(/'/g, "\\'")}')" style="background:#fef2f2; border:1px solid #fecdd3; border-radius:10px; padding:6px 12px; font-size:12px; font-weight:800; color:#ef4444; cursor:pointer; flex-shrink:0;">
            <i class="fas fa-trash-can me-1"></i> 위치 삭제
          </button>
        ` : ''}
      </div>

      <!-- 대표 위치 사진 -->
      ${target.photoUrl ? `
        <div style="margin-bottom:18px; text-align:center; background:#f8fafc; border:1px solid #e2e8f0; border-radius:14px; padding:12px; position:relative;">
          <img src="${target.photoUrl}" alt="${escapeHTML(target.name)}" onclick="MedicineLocationModule.openPhoto('${target.id}')" style="max-height:280px; width:100%; object-fit:contain; border-radius:10px; cursor:pointer;" />
          <div style="margin-top:8px;">
            <button type="button" onclick="MedicineLocationModule.openPhoto('${target.id}')" style="display:inline-flex; align-items:center; gap:5px; background:#ffffff; border:1px solid #cbd5e1; padding:6px 14px; border-radius:10px; font-size:12px; font-weight:800; color:#2563eb; cursor:pointer; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
              <i class="fas fa-expand"></i> 사진 원본 크게보기
            </button>
          </div>
        </div>
      ` : ''}

      <!-- 현재 보관 정보 -->
      <div style="background:#eff6ff; border:1.5px solid #bfdbfe; border-radius:14px; padding:14px 16px; margin-bottom:20px;">
        <div style="font-size:11.5px; color:#1e40af; font-weight:700; margin-bottom:4px;">🎯 [현재 보관 위치]</div>
        <div style="font-size:15px; font-weight:800; color:#1d4ed8;">${target.locationDetail}</div>
        ${target.notes ? `<div style="font-size:12.5px; color:#475569; margin-top:6px; font-weight:600;">💡 ${target.notes}</div>` : ''}
        <div style="font-size:11px; color:#64748b; margin-top:8px; padding-top:6px; border-top:1px solid #dbeafe;">
          작성자: <b>${target.updatedBy || '약국'}</b> · 최종 수정: ${target.updatedAt}
        </div>
      </div>

      <!-- 위치 이동 히스토리 타임라인 -->
      <h4 style="font-size:14px; font-weight:800; color:#0f172a; margin:0 0 12px 0; display:flex; align-items:center; gap:6px;">
        <i class="fas fa-history text-primary"></i> 위치 변경 이력 추적 (${history.length + 1}건)
      </h4>

      <div style="display:flex; flex-direction:column; gap:10px;">
        <!-- 1. 현재 최고 최근 이력 -->
        <div style="border-left:3px solid #2563eb; padding-left:12px; margin-left:4px;">
          <div style="font-size:11px; color:#2563eb; font-weight:800;">[현재 최신 위치] ${target.updatedAt}</div>
          <div style="font-size:13px; font-weight:800; color:#0f172a;">${target.zoneName} - ${target.locationDetail}</div>
          <div style="font-size:11px; color:#64748b;">등록자: ${target.updatedBy}</div>
        </div>

        <!-- 2. 과거 이력 목록 -->
        ${history.map((h, idx) => `
          <div style="border-left:3px solid #cbd5e1; padding-left:12px; margin-left:4px; opacity:0.85;">
            <div style="font-size:11px; color:#64748b; font-weight:700;">[과거 이력 ${history.length - idx}] ${h.updatedAt}</div>
            <div style="font-size:12.5px; font-weight:700; color:#475569;">${h.zoneName} - ${h.locationDetail}</div>
            <div style="font-size:11px; color:#94a3b8;">작성자: ${h.updatedBy}</div>
          </div>
        `).join('')}
      </div>
    `;

    document.getElementById('med-detail-modal-content').innerHTML = contentHtml;
    document.getElementById('med-detail-modal').style.display = 'flex';
  }

  function closeDetailModal() {
    document.getElementById('med-detail-modal').style.display = 'none';
  }

  function renderCardGridHTML(filtered, totalCount) {
    if (!filtered || filtered.length === 0) {
      return `
        <div style="text-align:center; padding:60px 20px; background:#ffffff; border-radius:20px; border:1.5px dashed #cbd5e1; margin-top:10px;">
          <div style="width:60px; height:60px; border-radius:50%; background:#eff6ff; color:#2563eb; display:flex; align-items:center; justify-content:center; font-size:26px; margin:0 auto 14px auto;">
            <i class="fas fa-box-open"></i>
          </div>
          <h3 style="font-size:17px; font-weight:800; color:#0f172a; margin-bottom:6px;">${totalCount === 0 ? '등록된 일반약 위치 데이터가 없습니다.' : '일치하는 약품 위치 검색 결과가 없습니다.'}</h3>
          <p style="font-size:13.5px; color:#64748b; margin-bottom:16px;">검색어를 확인하시거나 우측 상단의 <b>[새 약품 위치 등록]</b> 버튼을 눌러 사진과 보관 위치를 등록하세요.</p>
          <button type="button" class="btn btn-primary font-bold" onclick="MedicineLocationModule.openCreateModal()" style="border-radius:10px; padding:9px 18px;">
            <i class="fas fa-plus"></i> 첫 약품 위치 등록하기
          </button>
        </div>
      `;
    }
    return `
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
        ${filtered.map(item => renderMedicineCard(item)).join('')}
      </div>
    `;
  }

  function handleSearch(val) {
    searchQuery = val;

    // 지우기 버튼 토글
    const clearBtn = document.getElementById('med-search-clear-btn');
    if (clearBtn) clearBtn.style.display = val ? 'block' : 'none';

    // input 요소를 재렌더링하지 않고 하단 그리드만 0.01초 부분 업데이트 (한글 IME 풀림 원천 방지)
    const gridContainer = document.getElementById('med-card-grid-container');
    if (gridContainer) {
      const items = getStorageData();
      const rawQ = searchQuery.toLowerCase().trim();
      const keywords = rawQ.split(/\s+/).filter(Boolean);

      const filtered = items.filter(item => {
        const matchCat = activeCategory === 'ALL' || item.zoneId === activeCategory;
        if (!rawQ) return matchCat;

        const targetText = [
          item.name || '',
          item.zoneName || '',
          item.locationDetail || '',
          item.notes || '',
          item.updatedBy || ''
        ].join(' ').toLowerCase();

        const targetTextNoSpace = targetText.replace(/\s+/g, '');

        const matchQuery = keywords.every(kw => {
          const kwNoSpace = kw.replace(/\s+/g, '');
          return targetText.includes(kw) || targetTextNoSpace.includes(kwNoSpace);
        });

        return matchCat && matchQuery;
      });

      gridContainer.innerHTML = renderCardGridHTML(filtered, items.length);
    } else {
      render('module-content');
    }
  }

  function filterCategory(catId) {
    activeCategory = catId;
    render('module-content');
  }

  function deleteMedicine(id, name) {
    const currUser = window.SheetsSync ? window.SheetsSync.getCurrentUser() : null;
    if (!currUser || currUser.role !== '약국장') {
      alert('🔒 약국장 계정만 약품 위치 데이터를 삭제할 수 있습니다.');
      return;
    }

    if (!confirm(`🗑️ [${name}] 약품 위치 등록을 정말로 삭제하시겠습니까?\n(삭제 후 파이어베이스 클라우드에서도 함께 지워집니다)`)) {
      return;
    }

    const items = getStorageData().filter(i => i.id !== id);
    if (window.SheetsSync && typeof window.SheetsSync.addDeletedId === 'function') {
      window.SheetsSync.addDeletedId(id);
    }
    saveStorageData(items);
    closeDetailModal();
    render('module-content');
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('ssg_cloud_updated', () => {
      const active = window.App && typeof window.App.getActiveModule === 'function' ? window.App.getActiveModule() : '';
      if (active === 'medicine-location') {
        const anyModalOpen = Array.from(document.querySelectorAll('.modal-overlay')).some(m => {
          const disp = window.getComputedStyle(m).display;
          return disp !== 'none' && disp !== '';
        });
        if (!anyModalOpen) {
          render('module-content');
        }
      }
    });
  }

  function openPhoto(id) {
    try {
      const items = getStorageData() || [];
      const target = items.find(i => String(i.id) === String(id));
      if (target && target.photoUrl && window.App && typeof window.App.openImageLightbox === 'function') {
        window.App.openImageLightbox(target.photoUrl, target.name || '약품 위치 사진');
      }
    } catch(e) {
      console.warn('openPhoto error:', e);
    }
  }

  return {
    render, openCreateModal, openEditModal, closeModal, openDetailModal, closeDetailModal,
    handlePhotoSelect, resetPhoto, handleSubmit, handleSearch, filterCategory, deleteMedicine, openPhoto
  };
})();
