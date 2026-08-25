/**
 * 📦 일반약 보관 위치 관리 모듈 (Medicine Location Module)
 * 신세계약국 입고 약품 보관 위치 사진 등록, 실시간 검색, 위치 변경 이력 추적
 */
window.MedicineLocationModule = (function () {
  let activeCategory = 'ALL';
  let searchQuery = '';

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

    const html = `
      <div class="module-header" style="margin-bottom:20px;">
        <div>
          <h2 style="font-size:22px; font-weight:800; color:#0f172a; display:flex; align-items:center; gap:8px; margin:0;">
            <i class="fas fa-boxes-packing text-primary"></i>
            <span>📦 일반약 위치 관리 & 위치 검색</span>
          </h2>
          <p class="subtitle" style="margin-top:4px; font-size:13px; color:#64748b;">
            신규 입고약 보관 위치 사진 업로드, 약품 검색 및 진열대 위치 변경 이력 추적
          </p>
        </div>
        <button type="button" class="btn btn-primary font-bold" onclick="MedicineLocationModule.openCreateModal()" style="border-radius:12px; padding:10px 20px; font-size:14px; background:linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); border:none; box-shadow:0 4px 12px rgba(37,99,235,0.25);">
          <i class="fas fa-plus-circle me-1"></i> 새 약품 위치 등록
        </button>
      </div>

      <!-- 🔍 1. 실시간 통합 검색 바 & 퀵 통계 -->
      <div style="background:#ffffff; border:1.5px solid #cbd5e1; border-radius:16px; padding:18px 20px; margin-bottom:20px; box-shadow:0 2px 8px rgba(0,0,0,0.04);">
        <div style="display:flex; flex-wrap:wrap; items-center; justify-content:space-between; gap:12px;">
          <div style="flex:1; min-width:280px; position:relative;">
            <i class="fas fa-search" style="position:absolute; left:14px; top:50%; transform:translateY(-50%); color:#94a3b8; font-size:15px;"></i>
            <input type="text" id="med-search-input" value="${searchQuery}" oninput="MedicineLocationModule.handleSearch(this.value)" placeholder="약품명, 효능, 보관 위치(예: 임팩타민, A구역, 냉장고) 실시간 검색..." style="width:100%; padding:11px 14px 11px 40px; border:1.5px solid #cbd5e1; border-radius:12px; font-size:14px; outline:none; font-weight:700; color:#0f172a; box-sizing:border-box;" onfocus="this.style.borderColor='#2563eb'" onblur="this.style.borderColor='#cbd5e1'">
            ${searchQuery ? `<button onclick="MedicineLocationModule.handleSearch('')" style="position:absolute; right:12px; top:50%; transform:translateY(-50%); background:none; border:none; color:#94a3b8; cursor:pointer;">✖</button>` : ''}
          </div>
          <div style="display:flex; align-items:center; gap:8px; font-size:13px; font-weight:700; color:#475569; background:#f8fafc; padding:6px 14px; border-radius:10px; border:1px solid #e2e8f0;">
            <i class="fas fa-layer-group text-primary"></i>
            <span>등록된 약품: <strong style="color:#2563eb; font-size:16px;">${items.length}</strong>개</span>
          </div>
        </div>

        <!-- 🎯 2. 구역별 퀵 필터 탭 -->
        <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:14px; padding-top:12px; border-top:1px solid #f1f5f9;">
          <button type="button" onclick="MedicineLocationModule.filterCategory('ALL')" style="padding:6px 14px; border-radius:20px; font-size:12.5px; font-weight:800; cursor:pointer; border:1.5px solid ${activeCategory === 'ALL' ? '#2563eb' : '#cbd5e1'}; background:${activeCategory === 'ALL' ? '#2563eb' : '#ffffff'}; color:${activeCategory === 'ALL' ? '#ffffff' : '#475569'}; shadow:${activeCategory === 'ALL' ? '0 2px 6px rgba(37,99,235,0.2)' : 'none'};">
            전체 보기 (${items.length})
          </button>
          ${DEFAULT_ZONES.map(z => {
            const count = items.filter(i => i.zoneId === z.id).length;
            const isActive = activeCategory === z.id;
            return `
              <button type="button" onclick="MedicineLocationModule.filterCategory('${z.id}')" style="padding:6px 14px; border-radius:20px; font-size:12.5px; font-weight:800; cursor:pointer; border:1.5px solid ${isActive ? z.color : z.border}; background:${isActive ? z.color : z.bg}; color:${isActive ? '#ffffff' : z.color};">
                <i class="fas ${z.icon}"></i> ${z.name} (${count})
              </button>
            `;
          }).join('')}
        </div>
      </div>

      <!-- 🖼️ 3. 약품 카드 그리드 (리스트) -->
      ${filtered.length === 0 ? `
        <div style="text-align:center; padding:60px 20px; background:#ffffff; border-radius:20px; border:1.5px dashed #cbd5e1; margin-top:10px;">
          <div style="width:60px; height:60px; border-radius:50%; background:#eff6ff; color:#2563eb; display:flex; align-items:center; justify-content:center; font-size:26px; margin:0 auto 14px auto;">
            <i class="fas fa-box-open"></i>
          </div>
          <h3 style="font-size:17px; font-weight:800; color:#0f172a; margin-bottom:6px;">등록된 일반약 위치 데이터가 없습니다.</h3>
          <p style="font-size:13.5px; color:#64748b; margin-bottom:16px;">검색어를 확인하시거나 우측 상단의 <b>[새 약품 위치 등록]</b> 버튼을 눌러 사진과 보관 위치를 등록하세요.</p>
          <button type="button" class="btn btn-primary font-bold" onclick="MedicineLocationModule.openCreateModal()" style="border-radius:10px; padding:9px 18px;">
            <i class="fas fa-plus"></i> 첫 약품 위치 등록하기
          </button>
        </div>
      ` : `
        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:18px;">
          ${filtered.map(item => renderMedicineCard(item)).join('')}
        </div>
      `}

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
              <label class="form-label font-bold" style="font-size:13.5px; color:#334155; margin-bottom:6px;">보관 위치 사진 첨부 <span style="color:#ef4444;">*</span></label>
              
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
      <div style="background:#ffffff; border:1.5px solid #e2e8f0; border-radius:18px; overflow:hidden; box-shadow:0 3px 10px rgba(0,0,0,0.04); display:flex; flex-direction:column; justify-content:space-between; transition:transform 0.2s, box-shadow 0.2s;" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 8px 20px rgba(0,0,0,0.08)';" onmouseout="this.style.transform='none'; this.style.boxShadow='0 3px 10px rgba(0,0,0,0.04)';">
        <div>
          <!-- 사진 보관 뷰 영역 -->
          <div style="position:relative; width:100%; height:180px; background:#f8fafc; overflow:hidden; border-bottom:1px solid #f1f5f9; cursor:pointer;" onclick="MedicineLocationModule.openDetailModal('${item.id}')">
            ${item.photoUrl ? `
              <img src="${item.photoUrl}" alt="${item.name}" style="width:100%; height:100%; object-fit:cover;" />
            ` : `
              <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:#94a3b8;">
                <i class="fas fa-camera" style="font-size:32px; margin-bottom:6px;"></i>
                <span style="font-size:12px; font-weight:700;">등록된 사진 없음</span>
              </div>
            `}
            <span style="position:absolute; top:12px; left:12px; background:${zone.bg}; color:${zone.color}; border:1.5px solid ${zone.border}; font-size:11.5px; font-weight:800; padding:4px 10px; border-radius:20px; box-shadow:0 2px 6px rgba(0,0,0,0.1);">
              <i class="fas ${zone.icon}"></i> ${zone.name}
            </span>
          </div>

          <!-- 카드 정보 본문 -->
          <div style="padding:16px;">
            <h4 style="font-size:16px; font-weight:800; color:#0f172a; margin:0 0 8px 0; cursor:pointer;" onclick="MedicineLocationModule.openDetailModal('${item.id}')">
              ${item.name}
            </h4>

            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:10px 12px; margin-bottom:10px;">
              <div style="font-size:11px; color:#64748b; font-weight:600; margin-bottom:2px;">📍 보관 상세 위치</div>
              <div style="font-size:13.5px; font-weight:800; color:#1d4ed8; word-break:break-all;">
                ${item.locationDetail}
              </div>
            </div>

            ${item.notes ? `
              <p style="font-size:12px; color:#475569; margin:0 0 10px 0; background:#fffbeb; border:1px solid #fde68a; padding:6px 10px; border-radius:8px; font-weight:600;">
                💡 ${item.notes}
              </p>
            ` : ''}
          </div>
        </div>

        <!-- 카드 하단 관리 메타 바 -->
        <div style="padding:12px 16px; background:#f8fafc; border-top:1px solid #f1f5f9; display:flex; align-items:center; justify-content:space-between; font-size:11.5px; color:#64748b;">
          <div>
            <i class="fas fa-user-circle" style="color:#94a3b8;"></i> <b>${item.updatedBy || '약국'}</b> · ${item.updatedAt ? item.updatedAt.substring(5,16) : ''}
          </div>

          <div style="display:flex; align-items:center; gap:6px;">
            <button type="button" onclick="MedicineLocationModule.openEditModal('${item.id}')" style="background:#ffffff; border:1px solid #cbd5e1; border-radius:8px; padding:4px 9px; font-size:11.5px; font-weight:700; color:#334155; cursor:pointer;">
              <i class="fas fa-sync-alt text-primary"></i> 위치 변경
            </button>
            <button type="button" onclick="MedicineLocationModule.openDetailModal('${item.id}')" style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; padding:4px 9px; font-size:11.5px; font-weight:800; color:#2563eb; cursor:pointer;">
              이력 (${historyCount})
            </button>
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
        const MAX_WIDTH = 800;
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);

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

    // 만약 새 base64 이미지 데이터면 구글 드라이브/클라우드로 저장 업로드 시도
    if (photoBase64 && photoBase64.startsWith('data:image')) {
      try {
        if (window.GAS_WEB_APP_URL) {
          btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 사진 업로드 중...';
          const response = await fetch(window.GAS_WEB_APP_URL, {
            method: 'POST',
            body: JSON.stringify({ action: 'uploadImage', data: photoBase64, filename: `약품위치_${Date.now()}.jpg` })
          });
          const result = await response.json();
          if (result && result.url) photoUrl = result.url;
        }
      } catch (err) {
        console.warn("구글 드라이브 이미지 저장 백업:", err);
      }
    }

    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 16);
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

        target.zoneId = zoneId;
        target.zoneName = zoneName;
        target.locationDetail = locationDetail;
        target.photoUrl = photoUrl || target.photoUrl;
        target.notes = notes;
        target.updatedBy = currUser.name;
        target.updatedAt = nowStr;
      }
    } else {
      // 신규 입고 약품 위치 등록
      const newItem = {
        id: 'med_' + Date.now(),
        name,
        zoneId,
        zoneName,
        locationDetail,
        photoUrl,
        notes,
        updatedBy: currUser.name,
        updatedAt: nowStr,
        history: []
      };
      items.unshift(newItem);
    }

    saveStorageData(items);
    closeModal();
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
      <div style="display:flex; align-items:center; gap:10px; border-bottom:1.5px solid #f1f5f9; padding-bottom:14px; margin-bottom:16px;">
        <div style="width:40px; height:40px; border-radius:12px; background:${zone.bg}; color:${zone.color}; display:flex; align-items:center; justify-content:center; font-size:20px;">
          <i class="fas fa-boxes-stacked"></i>
        </div>
        <div>
          <h3 style="font-size:18px; font-weight:800; color:#0f172a; margin:0;">${target.name}</h3>
          <span style="font-size:11.5px; font-weight:800; color:${zone.color};">📍 ${zone.name}</span>
        </div>
      </div>

      <!-- 대표 위치 사진 -->
      ${target.photoUrl ? `
        <div style="margin-bottom:18px; text-align:center; background:#f8fafc; border:1px solid #e2e8f0; border-radius:14px; padding:12px; position:relative;">
          <img src="${target.photoUrl}" alt="${target.name}" style="max-height:280px; width:100%; object-fit:contain; border-radius:10px;" />
          <a href="${target.photoUrl}" target="_blank" style="display:inline-flex; align-items:center; gap:4px; margin-top:8px; background:#ffffff; border:1px solid #cbd5e1; padding:4px 12px; border-radius:8px; font-size:12px; font-weight:700; color:#2563eb; text-decoration:none;">
            <i class="fas fa-expand"></i> 사진 원본 크게보기
          </a>
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

  function handleSearch(val) {
    searchQuery = val;
    render('module-content');
    const inputEl = document.getElementById('med-search-input');
    if (inputEl) {
      inputEl.focus();
      inputEl.setSelectionRange(val.length, val.length);
    }
  }

  function filterCategory(catId) {
    activeCategory = catId;
    render('module-content');
  }

  return {
    render, openCreateModal, openEditModal, closeModal, openDetailModal, closeDetailModal,
    handlePhotoSelect, resetPhoto, handleSubmit, handleSearch, filterCategory
  };
})();
