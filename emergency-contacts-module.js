/**
 * 9. 약국 운영 지원 연락망 모듈 컨트롤러 (Pharmacy Operations Support Hub)
 * [업그레이드] 실시간 통합 스마트 검색창 + 원터치 퀵 태그 + 내부인력 세부사항 약국장 보안 보호 + 협력업체 전 직원 세부사항 개방 + 럭셔리 PC/모바일 카드
 */
window.EmergencyContactsModule = (function () {

  let activeTab = 'family'; // 'family', 'pharma', 'equipment', 'facilities'
  let staffRoleFilter = 'ALL'; // 'ALL', '약국장', '근무약사', '일반직원'
  let searchQuery = '';
  let showAddForm = false;

  function render(containerId) {
    const container = document.getElementById(containerId || 'module-content');
    if (!container) return;

    const currUser = window.SheetsSync.getCurrentUser();
    const isDirector = currUser && currUser.role === '약국장';

    const data = window.SheetsSync.getEmergencyContacts() || {};
    const employees = window.SheetsSync.getEmployees() || [];
    const pharmaData = data.wholesalers || [];
    const equipmentData = data.equipment || data.support || [];
    const facilitiesData = data.facilities || [];

    const isSearching = searchQuery.trim().length > 0;

    const html = `
      <div class="module-header d-flex justify-content-between align-items-center mb-3 flex-wrap gap-3">
        <div>
          <h2 style="font-size:24px; font-weight:800; color:#0f172a; margin-bottom:4px; letter-spacing:-0.5px;">
            ☎️ 신세계약국 운영 지원 연락망 Center
          </h2>
          <p class="subtitle" style="color:#64748b; font-size:14px; margin:0;">
            내부 인력(직원명부 실시간 연동), 의약품 도매·제약사, 전산·조제장비 및 시설·소모품 긴급 연락망
          </p>
        </div>
      </div>

      <!-- 🔍 [1] 정갈하고 고급스러운 통합 스마트 검색창 -->
      <div class="card mb-4 shadow-sm" style="background:#ffffff; border:1.5px solid #cbd5e1; border-radius:20px; padding:18px 22px; box-shadow:0 4px 18px rgba(15,23,42,0.04);">
        <div class="position-relative mb-2">
          <i class="fas fa-search position-absolute" style="top:50%; left:18px; transform:translateY(-50%); color:#059669; font-size:17px;"></i>
          <input type="text" 
                 id="contact-global-search-input" 
                 class="form-control" 
                 placeholder="🔍 지오영, 백제, 한미약품, JVM, 전산, 봉투, 폐기물, 직원 이름 검색..." 
                 value="${searchQuery}" 
                 oninput="EmergencyContactsModule.handleSearch(this.value)" 
                 style="border-radius:14px; padding:13px 44px 13px 48px; background:#f8fafc; border:1.5px solid #cbd5e1; font-size:15px; font-weight:600; color:#0f172a; transition:all 0.2s;"
                 onfocus="this.style.borderColor='#10b981'; this.style.background='#ffffff'; this.style.boxShadow='0 0 0 3px rgba(16,185,129,0.15)';"
                 onblur="this.style.borderColor='#cbd5e1'; this.style.background='#f8fafc'; this.style.boxShadow='none';">
          ${isSearching ? `
            <button type="button" 
                    onclick="EmergencyContactsModule.clearSearch()" 
                    style="position:absolute; top:50%; right:14px; transform:translateY(-50%); background:#e2e8f0; border:none; width:26px; height:26px; border-radius:50%; font-size:13px; color:#475569; cursor:pointer; display:flex; align-items:center; justify-content:center;">
              &times;
            </button>
          ` : ''}
        </div>

        <!-- 🏷️ 자주 찾는 업체 원터치 퀵 태그 (Quick Chips) -->
        <div class="d-flex align-items-center gap-1 flex-wrap mt-2" style="font-size:13px;">
          <span style="color:#64748b; font-weight:700; margin-right:4px;">⚡ 빠른 검색:</span>
          <button type="button" class="btn btn-sm" onclick="EmergencyContactsModule.applyQuickSearch('지오영')" style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; border-radius:12px; padding:3px 10px; font-size:12px; font-weight:700;">#지오영</button>
          <button type="button" class="btn btn-sm" onclick="EmergencyContactsModule.applyQuickSearch('백제약품')" style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; border-radius:12px; padding:3px 10px; font-size:12px; font-weight:700;">#백제약품</button>
          <button type="button" class="btn btn-sm" onclick="EmergencyContactsModule.applyQuickSearch('한미약품')" style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; border-radius:12px; padding:3px 10px; font-size:12px; font-weight:700;">#한미약품</button>
          <button type="button" class="btn btn-sm" onclick="EmergencyContactsModule.applyQuickSearch('JVM')" style="background:#faf5ff; color:#7e22ce; border:1px solid #e9d5ff; border-radius:12px; padding:3px 10px; font-size:12px; font-weight:700;">#JVM 조제기</button>
          <button type="button" class="btn btn-sm" onclick="EmergencyContactsModule.applyQuickSearch('팜IT')" style="background:#faf5ff; color:#7e22ce; border:1px solid #e9d5ff; border-radius:12px; padding:3px 10px; font-size:12px; font-weight:700;">#팜IT 전산</button>
          <button type="button" class="btn btn-sm" onclick="EmergencyContactsModule.applyQuickSearch('조은봉투')" style="background:#fffbeb; color:#b45309; border:1px solid #fde68a; border-radius:12px; padding:3px 10px; font-size:12px; font-weight:700;">#약봉투</button>
          <button type="button" class="btn btn-sm" onclick="EmergencyContactsModule.applyQuickSearch('폐기물')" style="background:#fffbeb; color:#b45309; border:1px solid #fde68a; border-radius:12px; padding:3px 10px; font-size:12px; font-weight:700;">#보건소/폐기물</button>
        </div>
      </div>

      <!-- 📞 빠른 스마트폰 다이얼 연결 안내 -->
      <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:14px; padding:12px 18px; margin-bottom:20px; display:flex; align-items:center; gap:12px;">
        <div style="width:34px; height:34px; border-radius:10px; background:#dcfce7; color:#16a34a; display:flex; justify-content:center; align-items:center; font-size:16px; flex-shrink:0;">
          <i class="fas fa-phone-alt"></i>
        </div>
        <div style="font-size:13.5px; color:#166534; line-height:1.5; font-weight:600;">
          하단의 <strong>파란색 전화번호 버튼</strong>을 터치하시면 스마트폰 전화 걸기 창으로 즉시 번호가 자동 연결됩니다.
        </div>
      </div>

      <!-- 🔍 실시간 검색 모드일 때: 통합 검색 결과 화면 -->
      ${isSearching ? renderGlobalSearchResults(searchQuery, employees, pharmaData, equipmentData, facilitiesData, isDirector) : `
        <!-- [2] 4대 핵심 카테고리 탭 (2x2 반응형 럭셔리 카드 탭) -->
        <div class="mb-4" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:14px;">
          
          <!-- 1. 내부 인력 카드 -->
          <div onclick="EmergencyContactsModule.setActiveTab('family')" 
               style="cursor:pointer; border-radius:18px; padding:18px 20px; transition:all 0.2s; background:#f0fdf4; border:2px solid ${activeTab === 'family' ? '#16a34a' : '#bbf7d0'}; box-shadow:${activeTab === 'family' ? '0 8px 20px rgba(22,163,74,0.15)' : 'none'}; transform:${activeTab === 'family' ? 'translateY(-2px)' : 'none'}; display:flex; flex-direction:column; justify-content:space-between;">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <span style="font-size:14px; font-weight:800; color:#15803d;">1. 내부 인력</span>
              <div style="width:32px;height:32px;border-radius:10px;background:#dcfce7;color:#16a34a;display:flex;align-items:center;justify-content:center;font-size:14px;"><i class="fas fa-users"></i></div>
            </div>
            <div style="font-size:24px;font-weight:800;color:#15803d;font-family:'Outfit',sans-serif;">${employees.length}<span style="font-size:13px; font-weight:600;"> 명</span></div>
            <div style="font-size:12px;color:#059669;font-weight:600;margin-top:4px;">약국 패밀리 명부</div>
          </div>

          <!-- 2. 의약품 공급 카드 -->
          <div onclick="EmergencyContactsModule.setActiveTab('pharma')" 
               style="cursor:pointer; border-radius:18px; padding:18px 20px; transition:all 0.2s; background:#eff6ff; border:2px solid ${activeTab === 'pharma' ? '#2563eb' : '#bfdbfe'}; box-shadow:${activeTab === 'pharma' ? '0 8px 20px rgba(37,99,235,0.15)' : 'none'}; transform:${activeTab === 'pharma' ? 'translateY(-2px)' : 'none'}; display:flex; flex-direction:column; justify-content:space-between;">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <span style="font-size:14px; font-weight:800; color:#1e40af;">2. 의약품 공급</span>
              <div style="width:32px;height:32px;border-radius:10px;background:#dbeafe;color:#2563eb;display:flex;align-items:center;justify-content:center;font-size:14px;"><i class="fas fa-pills"></i></div>
            </div>
            <div style="font-size:24px;font-weight:800;color:#1d4ed8;font-family:'Outfit',sans-serif;">${pharmaData.length}<span style="font-size:13px; font-weight:600;"> 개사</span></div>
            <div style="font-size:12px;color:#2563eb;font-weight:600;margin-top:4px;">도매상 / 제약사 직거래</div>
          </div>

          <!-- 3. 전산 및 장비 카드 -->
          <div onclick="EmergencyContactsModule.setActiveTab('equipment')" 
               style="cursor:pointer; border-radius:18px; padding:18px 20px; transition:all 0.2s; background:#faf5ff; border:2px solid ${activeTab === 'equipment' ? '#9333ea' : '#e9d5ff'}; box-shadow:${activeTab === 'equipment' ? '0 8px 20px rgba(147,51,234,0.15)' : 'none'}; transform:${activeTab === 'equipment' ? 'translateY(-2px)' : 'none'}; display:flex; flex-direction:column; justify-content:space-between;">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <span style="font-size:14px; font-weight:800; color:#6b21a8;">3. 전산 및 장비</span>
              <div style="width:32px;height:32px;border-radius:10px;background:#f3e8ff;color:#9333ea;display:flex;align-items:center;justify-content:center;font-size:14px;"><i class="fas fa-laptop-medical"></i></div>
            </div>
            <div style="font-size:24px;font-weight:800;color:#9333ea;font-family:'Outfit',sans-serif;">${equipmentData.length}<span style="font-size:13px; font-weight:600;"> 개처</span></div>
            <div style="font-size:12px;color:#7c3aed;font-weight:600;margin-top:4px;">ATC 조제기 / 팜IT / POS</div>
          </div>

          <!-- 4. 시설 및 소모품 카드 -->
          <div onclick="EmergencyContactsModule.setActiveTab('facilities')" 
               style="cursor:pointer; border-radius:18px; padding:18px 20px; transition:all 0.2s; background:#fffbeb; border:2px solid ${activeTab === 'facilities' ? '#d97706' : '#fde68a'}; box-shadow:${activeTab === 'facilities' ? '0 8px 20px rgba(217,119,6,0.15)' : 'none'}; transform:${activeTab === 'facilities' ? 'translateY(-2px)' : 'none'}; display:flex; flex-direction:column; justify-content:space-between;">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <span style="font-size:14px; font-weight:800; color:#92400e;">4. 시설 및 소모품</span>
              <div style="width:32px;height:32px;border-radius:10px;background:#fef3c7;color:#d97706;display:flex;align-items:center;justify-content:center;font-size:14px;"><i class="fas fa-building"></i></div>
            </div>
            <div style="font-size:24px;font-weight:800;color:#d97706;font-family:'Outfit',sans-serif;">${facilitiesData.length}<span style="font-size:13px; font-weight:600;"> 개처</span></div>
            <div style="font-size:12px;color:#b45309;font-weight:600;margin-top:4px;">약봉투 / 방범 / 폐기물</div>
          </div>
        </div>

        <!-- 선택된 탭별 본문 섹션 -->
        <div class="tab-content-container">
          ${activeTab === 'family' ? renderFamilyTab(employees, isDirector) : ''}
          ${activeTab === 'pharma' ? renderPharmaTab(pharmaData, isDirector) : ''}
          ${activeTab === 'equipment' ? renderEquipmentTab(equipmentData, isDirector) : ''}
          ${activeTab === 'facilities' ? renderFacilitiesTab(facilitiesData, isDirector) : ''}
        </div>
      `}
    `;

    container.innerHTML = html;
  }

  function handleSearch(val) {
    searchQuery = val;
    render('module-content');
  }

  function applyQuickSearch(keyword) {
    searchQuery = keyword;
    render('module-content');
  }

  function clearSearch() {
    searchQuery = '';
    render('module-content');
  }

  function setActiveTab(tabName) {
    activeTab = tabName;
    searchQuery = '';
    showAddForm = false;
    render('module-content');
  }

  function setStaffRoleFilter(role) {
    staffRoleFilter = role;
    render('module-content');
  }

  function toggleAddForm(forceState) {
    showAddForm = forceState !== undefined ? forceState : !showAddForm;
    render('module-content');
  }

  // 🔍 4대 분야 통합 실시간 검색 결과 렌더링
  function renderGlobalSearchResults(q, employees, pharmaList, equipmentList, facilitiesList, isDirector) {
    const query = q.toLowerCase();

    const matchedStaff = employees.filter(s => 
      (s.name && s.name.toLowerCase().includes(query)) ||
      (s.role && s.role.toLowerCase().includes(query)) ||
      (s.position && s.position.toLowerCase().includes(query)) ||
      (s.phone && s.phone.includes(query)) ||
      (isDirector && s.memo && s.memo.toLowerCase().includes(query))
    );

    const matchedPharma = pharmaList.filter(p => 
      (p.name && p.name.toLowerCase().includes(query)) ||
      (p.repName && p.repName.toLowerCase().includes(query)) ||
      (p.phone && p.phone.includes(query)) ||
      (p.items && p.items.toLowerCase().includes(query)) ||
      (p.cutoff && p.cutoff.toLowerCase().includes(query))
    );

    const matchedEquip = equipmentList.filter(e => 
      (e.name && e.name.toLowerCase().includes(query)) ||
      (e.category && e.category.toLowerCase().includes(query)) ||
      (e.phone && e.phone.includes(query)) ||
      (e.notes && e.notes.toLowerCase().includes(query))
    );

    const matchedFac = facilitiesList.filter(f => 
      (f.name && f.name.toLowerCase().includes(query)) ||
      (f.category && f.category.toLowerCase().includes(query)) ||
      (f.phone && f.phone.includes(query)) ||
      (f.notes && f.notes.toLowerCase().includes(query))
    );

    const totalMatches = matchedStaff.length + matchedPharma.length + matchedEquip.length + matchedFac.length;

    return `
      <div class="card p-4 mb-4" style="border-radius:20px; border:1.5px solid #10b981; background:#ffffff; box-shadow:0 8px 25px rgba(16,185,129,0.08);">
        <div class="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2 border-bottom pb-3">
          <div>
            <span class="badge bg-success mb-1" style="font-size:12px; padding:5px 12px; border-radius:12px;">통합 실시간 검색</span>
            <h3 style="font-size:19px; font-weight:800; color:#065f46; margin:0;">
              🔍 '${q}' 검색 결과 (총 ${totalMatches}건)
            </h3>
          </div>
          <button type="button" class="btn btn-sm btn-outline-secondary font-bold" onclick="EmergencyContactsModule.clearSearch()" style="border-radius:10px; padding:6px 16px;">
            <i class="fas fa-undo me-1"></i> 검색 닫기 (전체 목록 보기)
          </button>
        </div>

        ${totalMatches === 0 ? `
          <div class="text-center py-5 text-muted" style="font-size:14.5px;">
            <i class="fas fa-search mb-2" style="font-size:30px; color:#cbd5e1;"></i><br>
            '<strong>${q}</strong>'에 일치하는 연락처를 찾을 수 없습니다.<br>
            다른 키워드(예: 지오영, 한미, JVM, 폐기물 등)로 검색해 보세요.
          </div>
        ` : `
          <!-- 1. 내부 인력 검색결과 -->
          ${matchedStaff.length > 0 ? `
            <div class="mb-4">
              <h4 style="font-size:15px; font-weight:800; color:#15803d; margin-bottom:12px;"><i class="fas fa-users me-1"></i> 내부인력 (${matchedStaff.length}건)</h4>
              <div class="row g-3">${matchedStaff.map(s => renderStaffCard(s, isDirector)).join('')}</div>
            </div>
          ` : ''}

          <!-- 2. 의약품 공급 검색결과 -->
          ${matchedPharma.length > 0 ? `
            <div class="mb-4">
              <h4 style="font-size:15px; font-weight:800; color:#1d4ed8; margin-bottom:12px;"><i class="fas fa-pills me-1"></i> 의약품 공급 (${matchedPharma.length}건)</h4>
              <div class="row g-3">${matchedPharma.map((p, idx) => renderVendorCard('pharma', p, idx, isDirector)).join('')}</div>
            </div>
          ` : ''}

          <!-- 3. 전산 및 장비 검색결과 -->
          ${matchedEquip.length > 0 ? `
            <div class="mb-4">
              <h4 style="font-size:15px; font-weight:800; color:#7e22ce; margin-bottom:12px;"><i class="fas fa-laptop-medical me-1"></i> 전산 및 조제장비 (${matchedEquip.length}건)</h4>
              <div class="row g-3">${matchedEquip.map((e, idx) => renderVendorCard('equipment', e, idx, isDirector)).join('')}</div>
            </div>
          ` : ''}

          <!-- 4. 시설 및 소모품 검색결과 -->
          ${matchedFac.length > 0 ? `
            <div class="mb-3">
              <h4 style="font-size:15px; font-weight:800; color:#b45309; margin-bottom:12px;"><i class="fas fa-building me-1"></i> 시설 및 소모품 (${matchedFac.length}건)</h4>
              <div class="row g-3">${matchedFac.map((f, idx) => renderVendorCard('facilities', f, idx, isDirector)).join('')}</div>
            </div>
          ` : ''}
        `}
      </div>
    `;
  }

  /* [카테고리 1] 👥 1. 내부 인력 (약국 패밀리) */
  function renderFamilyTab(employees, isDirector) {
    const filtered = staffRoleFilter === 'ALL' ? employees : employees.filter(s => s.role === staffRoleFilter);
    const directorList = filtered.filter(s => s.role === '약국장');
    const pharmList = filtered.filter(s => s.role === '근무약사' || (s.role || '').includes('약사'));
    const generalStaffList = filtered.filter(s => !s.role.includes('약사') && s.role !== '약국장');

    return `
      <div class="card p-4 mb-4" style="border-radius:20px; border:1.5px solid #e2e8f0; background:#ffffff; box-shadow:0 4px 16px rgba(15,23,42,0.03);">
        <div class="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2 border-bottom pb-3">
          <div>
            <h3 style="font-size:19px; font-weight:800; color:#065f46; margin:0; letter-spacing:-0.5px;">
              <i class="fas fa-users text-emerald me-1"></i> 내부인력 (약국패밀리 비상 연락망)
            </h3>
            <span class="text-muted" style="font-size:13px;">
              <i class="fas fa-sync-alt text-success me-1"></i>직원 명부 데이터가 실시간 자동 연동됩니다.
            </span>
          </div>

          <div class="d-flex gap-1 flex-wrap">
            <button type="button" class="btn btn-sm ${staffRoleFilter === 'ALL' ? 'btn-success font-bold text-white' : 'btn-outline-secondary'}" onclick="EmergencyContactsModule.setStaffRoleFilter('ALL')" style="border-radius:10px; padding:6px 14px;">전체 (${employees.length}명)</button>
            <button type="button" class="btn btn-sm ${staffRoleFilter === '약국장' ? 'btn-danger font-bold text-white' : 'btn-outline-secondary'}" onclick="EmergencyContactsModule.setStaffRoleFilter('약국장')" style="border-radius:10px; padding:6px 14px;">👑 대표약국장</button>
            <button type="button" class="btn btn-sm ${staffRoleFilter === '근무약사' ? 'btn-primary font-bold text-white' : 'btn-outline-secondary'}" onclick="EmergencyContactsModule.setStaffRoleFilter('근무약사')" style="border-radius:10px; padding:6px 14px;">👨‍⚕️ 약사진</button>
            <button type="button" class="btn btn-sm ${staffRoleFilter === '일반직원' ? 'btn-success font-bold text-white' : 'btn-outline-secondary'}" onclick="EmergencyContactsModule.setStaffRoleFilter('일반직원')" style="border-radius:10px; padding:6px 14px;">👨‍💼 일반직원</button>
          </div>
        </div>

        ${directorList.length > 0 ? `
          <div class="sub-category-section mb-5">
            <h4 style="font-size:15px; font-weight:800; color:#dc2626; margin-bottom:14px;"><i class="fas fa-crown me-1"></i> 대표약국장 (총괄 및 긴급 대응)</h4>
            <div class="row g-3">${directorList.map(s => renderStaffCard(s, isDirector)).join('')}</div>
          </div>
        ` : ''}

        ${pharmList.length > 0 ? `
          <div class="sub-category-section mb-5">
            <h4 style="font-size:15px; font-weight:800; color:#2563eb; margin-bottom:14px;"><i class="fas fa-user-md me-1"></i> 약사진 (조제료 / 야간조제 / 신약검수)</h4>
            <div class="row g-3">${pharmList.map(s => renderStaffCard(s, isDirector)).join('')}</div>
          </div>
        ` : ''}

        ${generalStaffList.length > 0 ? `
          <div class="sub-category-section">
            <h4 style="font-size:15px; font-weight:800; color:#059669; margin-bottom:14px;"><i class="fas fa-user-nurse me-1"></i> 일반직원 팀 (전산 / 조제보조 / 매장관리)</h4>
            <div class="row g-3">${generalStaffList.map(s => renderStaffCard(s, isDirector)).join('')}</div>
          </div>
        ` : ''}
      </div>
    `;
  }

  // 👤 내부 인력 카드 (약국장 메모는 약국장에게만 공개)
  function renderStaffCard(s, isDirector) {
    const isOwner = s.role === '약국장';
    const isPharm = s.role === '근무약사' || (s.role || '').includes('약사');
    const badgeBg = isOwner ? '#dc2626' : isPharm ? '#2563eb' : '#059669';
    const phone = s.phone || '010-0000-0000';

    return `
      <div class="col-lg-4 col-md-6 col-12">
        <div class="p-4 shadow-sm" style="background:#ffffff; border-radius:18px; border:1.5px solid ${isOwner ? '#fecaca' : isPharm ? '#bfdbfe' : '#bbf7d0'}; height:100%; display:flex; flex-direction:column; justify-content:space-between; box-shadow:0 3px 12px rgba(15,23,42,0.03);">
          <div>
            <div class="d-flex align-items-center mb-3">
              <div style="width:42px; height:42px; border-radius:12px; background:${isOwner ? '#fee2e2' : isPharm ? '#eff6ff' : '#f0fdf4'}; display:flex; justify-content:center; align-items:center; font-size:18px; color:${badgeBg}; margin-right:12px; border:1px solid ${isOwner ? '#fecaca' : isPharm ? '#bfdbfe' : '#bbf7d0'};">
                <i class="fas ${isOwner ? 'fa-crown' : isPharm ? 'fa-user-md' : 'fa-user'}"></i>
              </div>
              <div>
                <strong style="font-size:17.5px; font-weight:800; color:#0f172a;">${s.name}</strong>
                <span class="badge ms-1.5" style="background:${badgeBg}; color:#fff; font-size:11.5px; padding:4px 8px; border-radius:8px; font-weight:700;">${s.role}</span>
              </div>
            </div>
            
            <div style="font-size:13.5px; color:#475569; margin-bottom:12px; font-weight:600;">
              <i class="fas fa-briefcase text-muted me-1"></i> 담당: <strong style="color:#1e293b;">${s.position || s.dept || '약국 운영 지원'}</strong>
            </div>
          </div>
          
          <div>
            <!-- 원터치 전화 버튼 -->
            <div style="margin-bottom:${isDirector && (s.memo || s.notes) ? '10px' : '0'};">
              <a href="tel:${phone}" style="display:flex; align-items:center; justify-content:center; gap:8px; font-size:16.5px; font-weight:800; color:#1d4ed8; text-decoration:none; background:#eff6ff; padding:9px 16px; border-radius:12px; border:1.5px solid #bfdbfe; transition:all 0.15s; font-family:'Outfit',sans-serif;" onmouseover="this.style.background='#dbeafe'" onmouseout="this.style.background='#eff6ff'">
                <i class="fas fa-phone-alt" style="font-size:14px;"></i> ${phone}
              </a>
            </div>

            <!-- 🔒 약국장 전용 관리 메모 (약국장에게만 표시됨) -->
            ${isDirector && (s.memo || s.notes) ? `
              <div style="font-size:12.5px; color:#78350f; background:#fef3c7; border:1px solid #fde68a; padding:8px 12px; border-radius:10px; line-height:1.4;">
                <strong>🔐 약국장 비고:</strong> ${s.memo || s.notes}
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }

  /* [카테고리 2] 🏭 2. 의약품 공급 */
  function renderPharmaTab(pharmaList, isDirector) {
    return `
      <div class="card p-4 mb-4" style="border-radius:20px; border:1.5px solid #e2e8f0; background:#ffffff; box-shadow:0 4px 16px rgba(15,23,42,0.03);">
        <div class="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2 border-bottom pb-3">
          <div>
            <h3 style="font-size:19px; font-weight:800; color:#0369a1; margin:0;"><i class="fas fa-truck-loading text-blue me-1"></i> 의약품 공급처 (도매상 & 제약사 직거래)</h3>
            <span class="text-muted" style="font-size:13px;">전 직원이 주문 마감시간 및 담당자 직통 연락처를 열람할 수 있습니다.</span>
          </div>
          ${isDirector ? `
            <button type="button" class="btn btn-sm btn-primary font-bold shadow-sm" onclick="EmergencyContactsModule.toggleAddForm()" style="border-radius:12px; padding:8px 18px; background:linear-gradient(135deg, #0284c7 0%, #0369a1 100%); border:none;">
              <i class="fas ${showAddForm ? 'fa-times' : 'fa-plus'} me-1"></i> ${showAddForm ? '닫기' : '➕ 신규 공급업체 등록'}
            </button>
          ` : ''}
        </div>
        ${showAddForm ? renderAddVendorForm('pharma') : ''}
        <div class="row g-3">${pharmaList.map((item, idx) => renderVendorCard('pharma', item, idx, isDirector)).join('')}</div>
      </div>
    `;
  }

  /* [카테고리 3] 💻 3. 전산 및 조제 장비 */
  function renderEquipmentTab(equipmentList, isDirector) {
    return `
      <div class="card p-4 mb-4" style="border-radius:20px; border:1.5px solid #e2e8f0; background:#ffffff; box-shadow:0 4px 16px rgba(15,23,42,0.03);">
        <div class="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2 border-bottom pb-3">
          <div>
            <h3 style="font-size:19px; font-weight:800; color:#6d28d9; margin:0;"><i class="fas fa-laptop-medical text-purple me-1"></i> 전산 및 조제 장비 유지보수</h3>
            <span class="text-muted" style="font-size:13px;">조제기 에러, 팜IT 청구 장애, 카드단말기 결제 오류 시 긴급 A/S 연락망입니다.</span>
          </div>
          ${isDirector ? `
            <button type="button" class="btn btn-sm btn-primary font-bold shadow-sm" onclick="EmergencyContactsModule.toggleAddForm()" style="border-radius:12px; padding:8px 18px; background:linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%); border:none;">
              <i class="fas ${showAddForm ? 'fa-times' : 'fa-plus'} me-1"></i> ${showAddForm ? '닫기' : '➕ 신규 장비업체 등록'}
            </button>
          ` : ''}
        </div>
        ${showAddForm ? renderAddVendorForm('equipment') : ''}
        <div class="row g-3">${equipmentList.map((item, idx) => renderVendorCard('equipment', item, idx, isDirector)).join('')}</div>
      </div>
    `;
  }

  /* [카테고리 4] 🏬 4. 소모품 및 시설 관리 */
  function renderFacilitiesTab(facilitiesList, isDirector) {
    return `
      <div class="card p-4 mb-4" style="border-radius:20px; border:1.5px solid #e2e8f0; background:#ffffff; box-shadow:0 4px 16px rgba(15,23,42,0.03);">
        <div class="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2 border-bottom pb-3">
          <div>
            <h3 style="font-size:19px; font-weight:800; color:#b45309; margin:0;"><i class="fas fa-building text-amber me-1"></i> 시설 및 소모품 지원</h3>
            <span class="text-muted" style="font-size:13px;">약봉투 주문, 건물 관리사무소, 방범 보안, 의료폐기물 수거 업체 정보입니다.</span>
          </div>
          ${isDirector ? `
            <button type="button" class="btn btn-sm btn-warning text-dark font-bold shadow-sm" onclick="EmergencyContactsModule.toggleAddForm()" style="border-radius:12px; padding:8px 18px; background:#f59e0b; border:none;">
              <i class="fas ${showAddForm ? 'fa-times' : 'fa-plus'} me-1"></i> ${showAddForm ? '닫기' : '➕ 신규 시설업체 등록'}
            </button>
          ` : ''}
        </div>
        ${showAddForm ? renderAddVendorForm('facilities') : ''}
        <div class="row g-3">${facilitiesList.map((item, idx) => renderVendorCard('facilities', item, idx, isDirector)).join('')}</div>
      </div>
    `;
  }

  /* 신규 업체 등록 폼 */
  function renderAddVendorForm(tabType) {
    const isPharma = tabType === 'pharma';
    const isEquip = tabType === 'equipment';
    const borderColor = isPharma ? '#0284c7' : isEquip ? '#7c3aed' : '#d97706';
    const bgColor = isPharma ? '#f0f9ff' : isEquip ? '#f5f3ff' : '#fffbeb';

    return `
      <div class="card p-4 mb-4 shadow-sm" style="border-radius:18px; border:2px solid ${borderColor}; background:${bgColor};">
        <h4 style="font-size:16px; font-weight:800; color:${borderColor}; margin-bottom:16px;"><i class="fas fa-plus-circle me-1"></i> 신규 협력업체 / 지원 연락처 등록 폼</h4>
        <form onsubmit="EmergencyContactsModule.saveNewVendor(event, '${tabType}')">
          <div class="row g-3 mb-3">
            <div class="col-md-6">
              <label class="form-label font-bold" style="font-size:13px; color:#334155;">업체 / 기관명</label>
              <input type="text" id="vendor-name" class="form-control font-bold" placeholder="예: 지오영 / JVM / 조은봉투" required style="border-radius:10px; padding:10px 14px;">
            </div>
            <div class="col-md-6">
              <label class="form-label font-bold" style="font-size:13px; color:#334155;">구분 / 카테고리</label>
              <input type="text" id="vendor-category" class="form-control" placeholder="예: 도매상, 약국전산, 소모품 등" required style="border-radius:10px; padding:10px 14px;">
            </div>
          </div>
          <div class="row g-3 mb-3">
            <div class="col-md-4">
              <label class="form-label font-bold" style="font-size:13px; color:#334155;">담당자 이름 / 직함</label>
              <input type="text" id="vendor-rep" class="form-control" placeholder="예: 김지오 팀장" style="border-radius:10px; padding:10px 14px;">
            </div>
            <div class="col-md-4">
              <label class="form-label font-bold" style="font-size:13px; color:#334155;">직통 전화번호</label>
              <input type="text" id="vendor-phone" class="form-control font-bold text-primary" placeholder="010-1234-5678" required style="border-radius:10px; padding:10px 14px;">
            </div>
            <div class="col-md-4">
              <label class="form-label font-bold" style="font-size:13px; color:#334155;">마감/운영시간</label>
              <input type="text" id="vendor-cutoff" class="form-control" placeholder="오후 5:30 마감" style="border-radius:10px; padding:10px 14px;">
            </div>
          </div>
          <div class="mb-4">
            <label class="form-label font-bold" style="font-size:13px; color:#334155;">취급품목 / 주요 메모</label>
            <input type="text" id="vendor-notes" class="form-control" placeholder="주요 취급품목 및 긴급 A/S 처리 방법..." style="border-radius:10px; padding:10px 14px;">
          </div>
          <div class="d-flex justify-content-end gap-2">
            <button type="button" class="btn btn-light font-bold" onclick="EmergencyContactsModule.toggleAddForm(false)" style="border-radius:10px; padding:8px 20px;">취소</button>
            <button type="submit" class="btn btn-success font-bold" style="border-radius:10px; padding:8px 20px;"><i class="fas fa-check me-1"></i> 업체 등록 완료</button>
          </div>
        </form>
      </div>
    `;
  }

  // 🏭 협력업체 카드 (모든 직원 세부사항 100% 열람)
  function renderVendorCard(tabType, item, idx, isDirector) {
    const isPharma = tabType === 'pharma';
    const isEquip = tabType === 'equipment';
    const borderColor = isPharma ? '#0284c7' : isEquip ? '#7c3aed' : '#d97706';
    const titleColor = isPharma ? '#0369a1' : isEquip ? '#5b21b6' : '#92400e';
    const categoryBadge = item.category || item.type || '운영지원';
    const cutoffText = item.cutoff || '상시 운영';
    const notesText = item.items || item.notes || '약국 운영 지원 연락처';

    return `
      <div class="col-lg-6 col-12">
        <div class="p-4 shadow-sm" style="background:#ffffff; border-radius:18px; border:1.5px solid #cbd5e1; border-left:6px solid ${borderColor}; height:100%; position:relative; display:flex; flex-direction:column; justify-content:space-between; box-shadow:0 3px 12px rgba(15,23,42,0.03);">
          
          ${isDirector ? `
            <button type="button" onclick="EmergencyContactsModule.deleteVendor('${tabType}', ${idx}, '${item.name}')" style="position:absolute; top:16px; right:16px; background:#fee2e2; border:none; width:28px; height:28px; border-radius:8px; color:#dc2626; font-size:13px; display:flex; align-items:center; justify-content:center; transition:all 0.2s;" title="업체 삭제">
              <i class="fas fa-trash-alt"></i>
            </button>
          ` : ''}

          <div>
            <div class="mb-2 pr-4">
              <span class="badge mb-1.5" style="background:${borderColor}; color:#fff; font-size:11.5px; padding:4px 9px; border-radius:8px; font-weight:700;">${categoryBadge}</span>
              <h4 style="font-size:18px; font-weight:800; margin:0; color:${titleColor}; letter-spacing:-0.3px;">${item.name}</h4>
            </div>

            <div class="d-flex align-items-center gap-2 mb-3 flex-wrap" style="font-size:13.5px; color:#475569; font-weight:600;">
              ${item.repName ? `<span>👤 담당: <strong style="color:#0f172a;">${item.repName}</strong></span>` : ''}
              <span class="badge" style="background:#f8fafc; color:#334155; border:1px solid #cbd5e1; font-size:12px; padding:4px 8px; border-radius:6px; font-weight:600;">
                <i class="far fa-clock text-muted me-1"></i>${cutoffText}
              </span>
            </div>
          </div>

          <div>
            <!-- 직통 전화 버튼 -->
            <div style="margin-bottom:10px;">
              <a href="tel:${item.phone}" style="display:flex; align-items:center; justify-content:center; gap:8px; font-size:17px; font-weight:800; color:#1d4ed8; text-decoration:none; background:#eff6ff; padding:9px 16px; border-radius:12px; border:1.5px solid #bfdbfe; transition:all 0.15s; font-family:'Outfit',sans-serif;" onmouseover="this.style.background='#dbeafe'" onmouseout="this.style.background='#eff6ff'">
                <i class="fas fa-phone-alt" style="font-size:14px;"></i> ${item.phone}
              </a>
            </div>

            <!-- 세부사항 / 취급품목 / 메모 (모든 직원 열람) -->
            <div style="font-size:13px; color:#475569; background:#f8fafc; padding:9px 12px; border-radius:10px; border:1px solid #e2e8f0; line-height:1.45;">
              📦 <strong>세부사항:</strong> ${notesText}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function saveNewVendor(e, tabType) {
    if (e) e.preventDefault();
    const name = document.getElementById('vendor-name').value.trim();
    const category = document.getElementById('vendor-category').value.trim();
    const repName = document.getElementById('vendor-rep').value.trim();
    const phone = document.getElementById('vendor-phone').value.trim();
    const cutoff = document.getElementById('vendor-cutoff').value.trim();
    const notes = document.getElementById('vendor-notes').value.trim();

    if (!name || !phone) { alert('⚠️ 업체명과 직통 전화번호는 필수 입력 항목입니다.'); return; }

    const data = window.SheetsSync.getEmergencyContacts() || { staff: [], wholesalers: [], equipment: [], facilities: [] };
    const newVendor = { name, category: category || '운영지원', type: category || '운영지원', repName: repName || '담당자', phone, cutoff: cutoff || '상시 운영', items: notes || '약국 운영 지원', notes: notes || '약국 운영 지원' };

    if (tabType === 'pharma') { if (!data.wholesalers) data.wholesalers = []; data.wholesalers.push(newVendor); } 
    else if (tabType === 'equipment') { if (!data.equipment) data.equipment = []; data.equipment.push(newVendor); } 
    else if (tabType === 'facilities') { if (!data.facilities) data.facilities = []; data.facilities.push(newVendor); }

    window.SheetsSync.saveEmergencyContacts(data);
    showAddForm = false;
    alert(`🎉 신규 협력업체 [${name}] 연락처가 성공적으로 등록되었습니다!`);
    render('module-content');
  }

  function deleteVendor(tabType, idx, vendorName) {
    if (!confirm(`'${vendorName}' 업체를 삭제하시겠습니까?`)) return;
    const data = window.SheetsSync.getEmergencyContacts() || {};
    if (tabType === 'pharma' && data.wholesalers) data.wholesalers.splice(idx, 1);
    else if (tabType === 'equipment' && data.equipment) data.equipment.splice(idx, 1);
    else if (tabType === 'facilities' && data.facilities) data.facilities.splice(idx, 1);

    window.SheetsSync.saveEmergencyContacts(data);
    render('module-content');
  }

  return { render, setActiveTab, setStaffRoleFilter, toggleAddForm, saveNewVendor, deleteVendor, handleSearch, applyQuickSearch, clearSearch };
})();