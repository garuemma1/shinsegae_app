/**
 * 직원 명부 모듈 컨트롤러 (Staff Directory Module v5.0)
 * 약국장(문성도) 전용 직원 계정 관리, 신규 등록, 세부 정보 수정, 비밀번호 초기화, 급여유형 및 메뉴 탭 맞춤 권한 조정 센터
 */
window.StaffDirectoryModule = (function () {

  let searchQuery = '';
  let activeRoleFilter = 'ALL'; // 'ALL', '약국장', '근무약사', '일반직원', '예비인력'
  let showInlineRegistrationForm = false;
  let editingEmpId = null;

  function render(containerId) {
    const container = document.getElementById(containerId || 'module-content');
    if (!container) return;

    const currUser = window.SheetsSync.getCurrentUser();
    if (!currUser || currUser.role !== '약국장') {
      container.innerHTML = `
        <div class="card p-5 text-center my-5 shadow-sm" style="border-radius:20px; border:2px dashed #fca5a5; background:#fff5f5;">
          <div style="width:60px; height:60px; border-radius:50%; background:#fee2e2; color:#dc2626; display:flex; justify-content:center; align-items:center; font-size:28px; margin:0 auto 16px;">
            <i class="fas fa-lock"></i>
          </div>
          <h3 style="font-size:20px; font-weight:bold; color:#991b1b; margin-bottom:8px;">🔒 약국장 전용 보안 관리 구역입니다</h3>
          <p class="text-muted mb-0" style="font-size:14px;">직원 명부 및 탭 메뉴 접근 권한 관리는 <strong>약국장(문성도) 계정으로 로그인한 경우에만</strong> 공개됩니다.</p>
        </div>
      `;
      return;
    }

    const employees = window.SheetsSync.getEmployees() || [];

    // 통계 집계
    const directorCount = employees.filter(e => e.role === '약국장').length;
    const pharmacistCount = employees.filter(e => e.role === '근무약사' || (e.role || '').includes('약사')).length;
    const staffCount = employees.filter(e => e.role === '일반직원').length;
    const reserveCount = employees.filter(e => e.role === '예비인력').length;

    const todayStr = new Date().toISOString().split('T')[0];

    const html = `
      <div class="module-header d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
        <div>
          <h2 style="font-size:24px; font-weight:bold; color:var(--primary-color); margin-bottom:4px;">
            👥 신세계약국 정식 직원 명부 (전체 ${employees.length}인 통합 관리)
          </h2>
          <p class="subtitle" style="color:var(--text-muted); font-size:14px; margin:0;">
            전 직원 계정 정보, 인원 추가/삭제(퇴사), 휴대폰 연락처/입사일 수정, 비밀번호 초기화, 급여유형 및 맞춤 권한 통합 관리
          </p>
        </div>
        <button type="button" class="btn btn-primary font-bold shadow-sm" onclick="StaffDirectoryModule.openNewEmpModal()" style="border-radius:12px; padding:10px 20px; font-size:15px; background:linear-gradient(135deg, #10b981 0%, #059669 100%); border:none;">
          <i class="fas fa-user-plus"></i> ➕ 신규 직원 등록
        </button>
      </div>

      <!-- 신규 직원 등록 인라인 펼치기 폼 -->
      ${showInlineRegistrationForm ? `
        <div id="inline-registration-box" class="card mb-4 shadow-sm" style="border-radius:20px; border:2px solid #2563eb; background:#eff6ff; padding:24px;">
          <div class="d-flex justify-content-between align-items-center mb-3 border-bottom pb-2">
            <h3 style="font-size:18px; font-weight:bold; color:#1e40af; margin:0;">
              <i class="fas fa-user-plus text-primary"></i> ➕ 신규 직원 계정 및 명부 등록 (약국장 전용)
            </h3>
            <button type="button" class="btn btn-sm btn-outline-secondary" onclick="StaffDirectoryModule.toggleInlineRegistrationForm(false)" style="border-radius:10px;">✕ 닫기</button>
          </div>
          <form onsubmit="StaffDirectoryModule.handleNewEmpSubmit(event)">
            <div class="row g-3 mb-3">
              <div class="col-md-6">
                <label class="form-label font-bold" style="font-size:13px; color:#334155;">성명 (이름)</label>
                <input type="text" id="new-emp-name-inline" class="form-control" placeholder="예: 홍길동" required style="border-radius:10px; padding:10px;">
              </div>
              <div class="col-md-6">
                <label class="form-label font-bold" style="font-size:13px; color:#334155;">구분 / 직무</label>
                <select id="new-emp-role-inline" class="form-select" required style="border-radius:10px; padding:10px;">
                  <option value="근무약사">💊 근무약사</option>
                  <option value="일반직원" selected>💻 일반직원</option>
                  <option value="예비인력">⏳ 예비인력</option>
                </select>
              </div>
            </div>

            <div class="row g-3 mb-3">
              <div class="col-md-6">
                <label class="form-label font-bold" style="font-size:13px; color:#334155;">상세 직책</label>
                <input type="text" id="new-emp-position-inline" class="form-control" placeholder="예: 조제팀 / 전산 / 매장" required style="border-radius:10px; padding:10px;">
              </div>
              <div class="col-md-6">
                <label class="form-label font-bold" style="font-size:13px; color:#334155;">급여 유형</label>
                <select id="new-emp-paytype-inline" class="form-select" required style="border-radius:10px; padding:10px;">
                  <option value="HOURLY">⏱️ 약정시급제 (근무약사)</option>
                  <option value="MONTHLY" selected>💼 주40h 고정월급제 (일반직원)</option>
                </select>
              </div>
            </div>

            <div class="row g-3 mb-3">
              <div class="col-md-6">
                <label class="form-label font-bold" style="font-size:13px; color:#334155;">약정 평일시급 (원/h)</label>
                <input type="number" id="new-emp-rate-inline" class="form-control" value="35000" style="border-radius:10px; padding:10px;">
              </div>
              <div class="col-md-6">
                <label class="form-label font-bold" style="font-size:13px; color:#334155;">기본 월급 (원/월, 식대20만 포함)</label>
                <input type="number" id="new-emp-salary-inline" class="form-control" value="2717000" style="border-radius:10px; padding:10px;">
              </div>
            </div>

            <div class="row g-3 mb-3">
              <div class="col-md-6">
                <label class="form-label font-bold" style="font-size:13px; color:#334155;">로그인 아이디 (이메일 계정)</label>
                <input type="text" id="new-emp-email-inline" class="form-control" placeholder="예: hong@shinsegae.com" required style="border-radius:10px; padding:10px;">
              </div>
              <div class="col-md-6">
                <label class="form-label font-bold" style="font-size:13px; color:#334155;">휴대폰 연락처</label>
                <input type="text" id="new-emp-phone-inline" class="form-control" placeholder="예: 010-1234-5678" required style="border-radius:10px; padding:10px;">
              </div>
            </div>

            <div class="row g-3 mb-3">
              <div class="col-md-6">
                <label class="form-label font-bold" style="font-size:13px; color:#334155;">입사 일자</label>
                <input type="date" id="new-emp-joindate-inline" class="form-control" value="${todayStr}" required style="border-radius:10px; padding:10px;">
              </div>
              <div class="col-md-6">
                <label class="form-label font-bold" style="font-size:13px; color:#334155;">초기 비밀번호</label>
                <input type="text" class="form-control" value="1234" readonly style="border-radius:10px; padding:10px; background:#f1f5f9;">
              </div>
            </div>

            <div class="mb-4">
              <label class="form-label font-bold" style="font-size:13px; color:#334155;">약국장 참고 메모</label>
              <textarea id="new-emp-memo-inline" class="form-control" rows="2" placeholder="직원 업무 분담 및 특이사항 메모..." style="border-radius:10px; padding:10px;"></textarea>
            </div>

            <div class="d-flex justify-content-end gap-2">
              <button type="button" class="btn btn-secondary" onclick="StaffDirectoryModule.toggleInlineRegistrationForm(false)" style="border-radius:10px; padding:8px 18px;">취소</button>
              <button type="submit" class="btn btn-success font-bold" style="border-radius:10px; padding:8px 24px; font-size:15px;"><i class="fas fa-check"></i> ➕ 신규 직원 등록 완료</button>
            </div>
          </form>
        </div>
      ` : ''}

      <!-- 고급 핵심 요약 스탯 카드 4열 Grid -->
      <div class="stats-overview-grid mb-4" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:16px;">
        <div class="card p-3 shadow-sm" style="border-radius:16px; border:1px solid #cbd5e1; background:#ffffff;">
          <div class="d-flex align-items-center gap-3">
            <div style="width:48px; height:48px; border-radius:14px; background:#eff6ff; color:#2563eb; display:flex; justify-content:center; align-items:center; font-size:22px;">
              <i class="fas fa-users"></i>
            </div>
            <div>
              <span class="text-muted" style="font-size:12.5px; font-weight:600;">총 등록 구성원</span>
              <div style="font-size:20px; font-weight:800; color:#0f172a;">${employees.length} <small style="font-size:13px; font-weight:normal; color:#64748b;">명 (약국장 ${directorCount} + 직원 ${employees.length - directorCount})</small></div>
            </div>
          </div>
        </div>

        <div class="card p-3 shadow-sm" style="border-radius:16px; border:1px solid #cbd5e1; background:#ffffff;">
          <div class="d-flex align-items-center gap-3">
            <div style="width:48px; height:48px; border-radius:14px; background:#fef3c7; color:#d97706; display:flex; justify-content:center; align-items:center; font-size:22px;">
              <i class="fas fa-user-md"></i>
            </div>
            <div>
              <span class="text-muted" style="font-size:12.5px; font-weight:600;">약사 조제 팀</span>
              <div style="font-size:20px; font-weight:800; color:#b45309;">${pharmacistCount} <small style="font-size:13px; font-weight:normal; color:#64748b;">명 (약국장 ${directorCount} + 근무약사 ${pharmacistCount - directorCount})</small></div>
            </div>
          </div>
        </div>

        <div class="card p-3 shadow-sm" style="border-radius:16px; border:1px solid #cbd5e1; background:#ffffff;">
          <div class="d-flex align-items-center gap-3">
            <div style="width:48px; height:48px; border-radius:14px; background:#f0fdf4; color:#16a34a; display:flex; justify-content:center; align-items:center; font-size:22px;">
              <i class="fas fa-desktop"></i>
            </div>
            <div>
              <span class="text-muted" style="font-size:12.5px; font-weight:600;">전산 & 매장 팀</span>
              <div style="font-size:20px; font-weight:800; color:#15803d;">${staffCount} <small style="font-size:13px; font-weight:normal; color:#64748b;">명 (월급제 정직원)</small></div>
            </div>
          </div>
        </div>

        <div class="card p-3 shadow-sm" style="border-radius:16px; border:1px solid #cbd5e1; background:#ffffff;">
          <div class="d-flex align-items-center gap-3">
            <div style="width:48px; height:48px; border-radius:14px; background:#faf5ff; color:#9333ea; display:flex; justify-content:center; align-items:center; font-size:22px;">
              <i class="fas fa-user-shield"></i>
            </div>
            <div>
              <span class="text-muted" style="font-size:12.5px; font-weight:600;">권한 보안 관리</span>
              <div style="font-size:20px; font-weight:800; color:#7e22ce;">100% <small style="font-size:13px; font-weight:normal; color:#16a34a;">정상 가동 중</small></div>
            </div>
          </div>
        </div>
      </div>

      <!-- 검색 바 및 역할 필터 -->
      <div class="card mb-4 shadow-sm" style="border-radius:18px; border:1px solid #cbd5e1; background:#ffffff;">
        <div class="card-body" style="padding:16px 24px;">
          <div class="d-flex justify-content-between align-items-center flex-wrap gap-3">
            <div class="d-flex align-items-center gap-2 flex-wrap">
              <span style="font-size:13px; font-weight:bold; color:#475569;"><i class="fas fa-filter text-primary"></i> 직무별 필터:</span>
              <div class="btn-group" role="group">
                <button type="button" class="btn btn-sm ${activeRoleFilter === 'ALL' ? 'btn-primary' : 'btn-outline-secondary'}" onclick="StaffDirectoryModule.setRoleFilter('ALL')" style="border-radius:20px 0 0 20px; font-size:13px; padding:6px 16px; font-weight:700;">
                  전체 (${employees.length})
                </button>
                <button type="button" class="btn btn-sm ${activeRoleFilter === '약국장' ? 'btn-danger' : 'btn-outline-secondary'}" onclick="StaffDirectoryModule.setRoleFilter('약국장')" style="font-size:13px; padding:6px 16px; font-weight:700;">
                  👑 약국장 (${directorCount})
                </button>
                <button type="button" class="btn btn-sm ${activeRoleFilter === '근무약사' ? 'btn-warning text-dark font-bold' : 'btn-outline-secondary'}" onclick="StaffDirectoryModule.setRoleFilter('근무약사')" style="font-size:13px; padding:6px 16px;">
                  💊 근무약사 (${pharmacistCount - directorCount})
                </button>
                <button type="button" class="btn btn-sm ${activeRoleFilter === '일반직원' ? 'btn-success' : 'btn-outline-secondary'}" onclick="StaffDirectoryModule.setRoleFilter('일반직원')" style="font-size:13px; padding:6px 16px; font-weight:700;">
                  💻 일반직원 (${staffCount})
                </button>
                <button type="button" class="btn btn-sm ${activeRoleFilter === '예비인력' ? 'btn-secondary text-white font-bold' : 'btn-outline-secondary'}" onclick="StaffDirectoryModule.setRoleFilter('예비인력')" style="border-radius:0 20px 20px 0; font-size:13px; padding:6px 16px;" title="예비인력 필터">
                  ⏳ 예비인력 (${reserveCount})
                </button>
              </div>
            </div>

            <div class="search-box flex-grow-1" style="max-width:340px; margin:0; position:relative;">
              <input type="text" class="form-control" placeholder="🔍 직원 이름, 직책, 이메일 검색..." value="${searchQuery}" oninput="StaffDirectoryModule.handleSearch(this.value)" style="border-radius:20px; border:1px solid #94a3b8; padding:7px 16px; font-size:13.5px;">
            </div>
          </div>
        </div>
      </div>

      <!-- 직원 카드리스트 Grid -->
      <div class="staff-cards-grid" id="staff-directory-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(350px, 1fr)); gap:20px;">
        ${renderStaffCards(employees)}
      </div>
    `;

    container.innerHTML = html;
  }

  function toggleInlineRegistrationForm(forceState) {
    if (forceState !== undefined) {
      showInlineRegistrationForm = forceState;
    } else {
      showInlineRegistrationForm = !showInlineRegistrationForm;
    }
    render('module-content');
    if (showInlineRegistrationForm) {
      setTimeout(() => {
        const regBox = document.getElementById('inline-registration-box');
        if (regBox && typeof regBox.scrollIntoView === 'function') {
          regBox.scrollIntoView({ behavior: 'smooth' });
        }
      }, 50);
    }
  }

  function setRoleFilter(role) {
    activeRoleFilter = role;
    render('module-content');
  }

  function renderStaffCards(employees) {
    const filtered = employees.filter(emp => {
      // 역할 필터
      if (activeRoleFilter !== 'ALL') {
        if (activeRoleFilter === '약국장' && emp.role !== '약국장') return false;
        if (activeRoleFilter === '근무약사' && (emp.role !== '근무약사' && !emp.role.includes('약사'))) return false;
        if (activeRoleFilter === '일반직원' && emp.role !== '일반직원') return false;
        if (activeRoleFilter === '예비인력' && emp.role !== '예비인력') return false;
      }
      // 검색어 필터
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return emp.name.toLowerCase().includes(q) || 
             emp.role.toLowerCase().includes(q) || 
             (emp.position && emp.position.toLowerCase().includes(q)) || 
             (emp.email && emp.email.toLowerCase().includes(q));
    });

    if (filtered.length === 0) {
      return `<div class="card p-5 text-center text-muted col-span-full" style="grid-column:1/-1; border-radius:18px; border:2px dashed #cbd5e1; background:#ffffff;">검색 또는 필터 조건에 일치하는 직원이 없습니다.</div>`;
    }

    const pRatesMap = window.SheetsSync.getPharmacistRates ? window.SheetsSync.getPharmacistRates() : {};

    return filtered.map(emp => {
      const isDirector = emp.role === '약국장';
      const isPharmacist = emp.role.includes('약사');
      const avatarBg = isDirector ? '#fee2e2' : (isPharmacist ? '#dbeafe' : '#dcfce7');
      const avatarColor = isDirector ? '#dc2626' : (isPharmacist ? '#2563eb' : '#16a34a');
      const roleBadgeClass = isDirector ? 'bg-danger' : (isPharmacist ? 'bg-primary' : 'bg-success');
      const payBadge = isDirector ? '👑 총괄약국장' : (emp.payType === 'HOURLY' ? '⏱️ 약정시급제' : '💼 주40h 월급제');
      const pRateObj = {
        weekdayRate: emp.weekdayRate || emp.hourlyRate || (pRatesMap[emp.id] && pRatesMap[emp.id].weekdayRate) || 35000,
        holidayRate: emp.holidayRate || (pRatesMap[emp.id] && pRatesMap[emp.id].holidayRate) || 40000
      };

      // 전체 세부 정보 수정 모드 (Full Edit Mode)
      if (editingEmpId === emp.id) {
        return `
          <div class="card shadow-md" style="border-radius:18px; border:2px solid #2563eb; overflow:hidden; background:#ffffff;">
            <div class="card-header d-flex justify-content-between align-items-center" style="background:#eff6ff; padding:14px 20px; border-bottom:1px solid #bfdbfe;">
              <h3 style="font-size:16px; font-weight:bold; margin:0; color:#1e40af;">
                <i class="fas fa-user-edit"></i> ✏️ [${emp.name}] 직원 세부 정보 수정 (약국장)
              </h3>
              <button type="button" class="btn btn-xs btn-outline-secondary" onclick="StaffDirectoryModule.cancelFullEdit()" style="border-radius:8px;">✕ 취소</button>
            </div>

            <div class="card-body" style="padding:20px; font-size:13px;">
              <div class="row g-2 mb-2">
                <div class="col-6">
                  <label class="form-label mb-1 font-bold" style="color:#334155;">성명 (이름)</label>
                  <input type="text" id="edit-name-${emp.id}" class="form-control form-control-sm font-bold" value="${emp.name}">
                </div>
                <div class="col-6">
                  <label class="form-label mb-1 font-bold" style="color:#334155;">구분 / 직무</label>
                  <select id="edit-role-${emp.id}" class="form-select form-select-sm font-bold">
                    <option value="근무약사" ${isPharmacist ? 'selected' : ''}>💊 근무약사</option>
                    <option value="일반직원" ${!isPharmacist && !isDirector && emp.role !== '예비인력' ? 'selected' : ''}>💻 일반직원</option>
                    <option value="예비인력" ${emp.role === '예비인력' ? 'selected' : ''}>⏳ 예비인력</option>
                    ${isDirector ? `<option value="약국장" selected>👑 약국장</option>` : ''}
                  </select>
                </div>
              </div>

              <div class="row g-2 mb-2">
                <div class="col-6">
                  <label class="form-label mb-1 font-bold" style="color:#334155;">📱 휴대폰 연락처</label>
                  <input type="text" id="edit-phone-${emp.id}" class="form-control form-control-sm font-bold text-primary" value="${emp.phone || ''}" placeholder="010-0000-0000">
                </div>
                <div class="col-6">
                  <label class="form-label mb-1 font-bold" style="color:#334155;">📅 입사 일자</label>
                  <input type="date" id="edit-joindate-${emp.id}" class="form-control form-control-sm font-bold" value="${emp.joinDate || ''}">
                </div>
              </div>

              <div class="row g-2 mb-2">
                <div class="col-6">
                  <label class="form-label mb-1 font-bold" style="color:#334155;">🏢 상세 직책</label>
                  <input type="text" id="edit-position-${emp.id}" class="form-control form-control-sm" value="${emp.position || ''}" placeholder="예: 조제팀장 / 전산">
                </div>
                <div class="col-6">
                  <label class="form-label mb-1 font-bold" style="color:#334155;">📧 로그인 이메일 아이디</label>
                  <input type="text" id="edit-email-${emp.id}" class="form-control form-control-sm" value="${emp.email || emp.username}">
                </div>
              </div>

              <!-- 급여 및 시급 조건 수정 -->
              <div class="p-3 my-2" style="background:#f8fafc; border-radius:12px; border:1px solid #e2e8f0;">
                <div class="font-bold mb-2" style="color:#1e293b; font-size:12.5px;"><i class="fas fa-coins text-warning"></i> 급여 조건 및 시급 수정</div>
                ${isPharmacist ? `
                  <div class="row g-2">
                    <div class="col-6">
                      <label class="form-label mb-1" style="font-size:11.5px; color:#1e40af;">☀️ 평일시급 (원/h)</label>
                      <input type="number" id="edit-weekday-${emp.id}" class="form-control form-control-sm font-bold" value="${pRateObj.weekdayRate}">
                    </div>
                    <div class="col-6">
                      <label class="form-label mb-1" style="font-size:11.5px; color:#c2410c;">🏖️ 주말·공휴일 시급 (원/h)</label>
                      <input type="number" id="edit-holiday-${emp.id}" class="form-control form-control-sm font-bold" value="${pRateObj.holidayRate}">
                    </div>
                  </div>
                ` : `
                  <div class="row g-2">
                    <div class="col-6">
                      <label class="form-label mb-1" style="font-size:11.5px; color:#15803d;">👛 기본 고정월급 (원/월)</label>
                      <input type="number" id="edit-salary-${emp.id}" class="form-control form-control-sm font-bold" value="${emp.baseMonthlySalary || 2717000}">
                    </div>
                    <div class="col-6">
                      <label class="form-label mb-1" style="font-size:11.5px; color:#0369a1;">⏱️ 초과 책정시급 (원/h)</label>
                      <input type="number" id="edit-hourly-${emp.id}" class="form-control form-control-sm font-bold" value="${emp.hourlyRate || 13000}">
                    </div>
                  </div>
                `}
              </div>

              <div class="mb-2">
                <label class="form-label mb-1 font-bold" style="color:#334155;">💬 약국장 참고 메모</label>
                <textarea id="edit-memo-${emp.id}" class="form-control form-control-sm" rows="2">${emp.memo || ''}</textarea>
              </div>
            </div>

            <div class="card-footer d-flex justify-content-end gap-2" style="background:#ffffff; padding:12px 20px; border-top:1px solid #e2e8f0;">
              <button type="button" class="btn btn-sm btn-secondary" onclick="StaffDirectoryModule.cancelFullEdit()" style="border-radius:10px; padding:6px 14px;">취소</button>
              <button type="button" class="btn btn-sm btn-primary font-bold" onclick="StaffDirectoryModule.saveFullEdit('${emp.id}')" style="border-radius:10px; padding:6px 18px; background:#2563eb;"><i class="fas fa-check"></i> 💾 세부 정보 수정 저장</button>
            </div>
          </div>
        `;
      }

      return `
        <div class="card shadow-sm" style="border-radius:18px; border:1px solid #cbd5e1; overflow:hidden; background:#ffffff; transition:transform 0.2s ease, box-shadow 0.2s ease;">
          <div class="card-header d-flex justify-content-between align-items-center" style="background:#f8fafc; padding:16px 20px; border-bottom:1px solid #e2e8f0;">
            <div class="d-flex align-items-center gap-3">
              <div style="width:46px; height:46px; border-radius:50%; background:${avatarBg}; color:${avatarColor}; display:flex; justify-content:center; align-items:center; font-size:20px; font-weight:bold;">
                <i class="fas ${isDirector ? 'fa-user-tie' : (isPharmacist ? 'fa-user-md' : 'fa-user')}"></i>
              </div>
              <div>
                <h3 style="font-size:18px; font-weight:bold; margin:0; color:#0f172a;">${emp.name}</h3>
                <div class="d-flex align-items-center gap-1 mt-1">
                  <span class="badge ${roleBadgeClass}" style="font-size:11.5px; padding:4px 9px;">${emp.role}</span>
                  <span class="badge bg-secondary" style="font-size:11.5px; padding:4px 8px;">${emp.position || '직원'}</span>
                </div>
              </div>
            </div>
            <div class="d-flex flex-column align-items-end gap-1">
              <span class="badge bg-light text-dark font-bold" style="font-size:11.5px; border:1px solid #cbd5e1; border-radius:12px; padding:4px 8px;">
                ${payBadge}
              </span>
              <button type="button" class="btn btn-xs btn-outline-primary font-bold" onclick="StaffDirectoryModule.editFullEmployee('${emp.id}')" style="font-size:11px; padding:2px 8px; border-radius:8px;" title="연락처/입사일/직책/급여 세부정보 전체 수정">
                <i class="fas fa-user-edit"></i> ✏️ 세부정보 수정
              </button>
            </div>
          </div>

          <div class="card-body" style="padding:20px; font-size:13.5px;">
            <div class="d-flex flex-column gap-2">
              <div class="d-flex justify-content-between align-items-center pb-2 border-bottom">
                <span class="text-muted"><i class="fas fa-envelope text-primary"></i> 계정 이메일:</span>
                <strong style="color:#1e293b; font-family:'Outfit', sans-serif;">${emp.email || emp.username}</strong>
              </div>

              <div class="d-flex justify-content-between align-items-center pb-2 border-bottom">
                <span class="text-muted"><i class="fas fa-phone-alt text-success"></i> 휴대폰 연락처:</span>
                <a href="tel:${emp.phone}" class="font-bold text-primary" style="text-decoration:none;">${emp.phone}</a>
              </div>

              <div class="d-flex justify-content-between align-items-center pb-2 border-bottom">
                <span class="text-muted"><i class="fas fa-calendar-alt text-warning"></i> 입사 일자:</span>
                <span class="font-bold">${emp.joinDate}</span>
              </div>

              <!-- 약정 급여 조건 구분 카드 -->
              <div id="pay-box-${emp.id}">
                ${isDirector ? `
                  <div class="p-3 my-2" style="background:#fef2f2; border-radius:12px; border:1px solid #fecaca;">
                    <div class="d-flex justify-content-between align-items-center">
                      <span style="font-size:12.5px; font-weight:700; color:#dc2626;"><i class="fas fa-crown"></i> 약국장 권한:</span>
                      <strong style="color:#991b1b; font-size:13.5px;">대표 약국장 (총괄 경영)</strong>
                    </div>
                  </div>
                ` : (isPharmacist ? `
                  <div class="p-3 my-2" style="background:#fff7ed; border-radius:12px; border:1px solid #ffedd5;">
                    <div class="d-flex justify-content-between align-items-center mb-1 pb-1 border-bottom border-warning-subtle">
                      <span style="font-size:12.5px; font-weight:700; color:#1e40af;"><i class="fas fa-sun text-primary"></i> 평일 근무시급:</span>
                      <strong style="color:#1e40af; font-size:14.5px; font-family:'Outfit', sans-serif;">${pRateObj.weekdayRate.toLocaleString()} 원/h</strong>
                    </div>
                    <div class="d-flex justify-content-between align-items-center pt-1">
                      <span style="font-size:12.5px; font-weight:700; color:#c2410c;"><i class="fas fa-umbrella-beach text-warning"></i> 주말·공휴일 시급:</span>
                      <strong style="color:#c2410c; font-size:14.5px; font-family:'Outfit', sans-serif;">${pRateObj.holidayRate.toLocaleString()} 원/h</strong>
                    </div>
                  </div>
                ` : `
                  <div class="p-3 my-2" style="background:#f0fdf4; border-radius:12px; border:1px solid #dcfce7;">
                    <div class="d-flex justify-content-between align-items-center mb-1 pb-1 border-bottom border-success-subtle">
                      <span style="font-size:12.5px; font-weight:700; color:#15803d;"><i class="fas fa-wallet text-success"></i> 기본 고정월급:</span>
                      <strong style="color:#15803d; font-size:14.5px; font-family:'Outfit', sans-serif;">${(emp.baseMonthlySalary || 2717000).toLocaleString()} 원/월</strong>
                    </div>
                    <div class="d-flex justify-content-between align-items-center pt-1">
                      <span style="font-size:12.5px; font-weight:700; color:#0369a1;"><i class="fas fa-stopwatch text-info"></i> 초과/연장 책정시급:</span>
                      <strong style="color:#0369a1; font-size:14.5px; font-family:'Outfit', sans-serif;">${(emp.hourlyRate || 13000).toLocaleString()} 원/h</strong>
                    </div>
                  </div>
                `)}
              </div>
            </div>

            <div class="p-3 mt-3" style="background:#f8fafc; border-radius:12px; border:1px solid #e2e8f0; font-size:12.5px;">
              <div class="mb-1 text-muted font-bold"><i class="fas fa-sticky-note text-info"></i> 약국장 참고 메모:</div>
              <div id="memo-box-${emp.id}" style="color:#334155; line-height:1.5;">${emp.memo ? emp.memo : '등록된 참고 메모가 없습니다.'}</div>
            </div>
          </div>

          <div class="card-footer d-flex gap-2 flex-wrap" style="background:#ffffff; padding:14px 20px; border-top:1px solid #e2e8f0;">
            ${!isDirector ? `
              <button type="button" class="btn btn-sm btn-outline-primary flex-grow-1 font-bold" onclick="StaffDirectoryModule.openPermModal('${emp.id}')" style="border-radius:10px; padding:7px; font-size:12.5px;">
                <i class="fas fa-cog"></i> ⚙️ 탭 권한
              </button>
              <button type="button" class="btn btn-sm btn-outline-warning font-bold" onclick="StaffDirectoryModule.resetPasscode('${emp.id}')" style="border-radius:10px; padding:7px; font-size:12.5px;">
                <i class="fas fa-key"></i> 🔑 암호 리셋
              </button>
              <button type="button" class="btn btn-sm btn-outline-danger font-bold" onclick="StaffDirectoryModule.deleteEmployee('${emp.id}')" style="border-radius:10px; padding:7px; font-size:12.5px;" title="직원 퇴사/계정 삭제">
                <i class="fas fa-user-minus"></i> 🗑️ 계정 삭제
              </button>
            ` : `
              <div class="text-center w-100 py-1 text-danger font-bold" style="font-size:13px;">
                👑 신세계약국 대표약사 최고 관리자 계정
              </div>
            `}
          </div>
        </div>
      `;
    }).join('');
  }

  function editFullEmployee(empId) {
    editingEmpId = empId;
    render('module-content');
  }

  function cancelFullEdit() {
    editingEmpId = null;
    render('module-content');
  }

  function saveFullEdit(empId) {
    const emps = window.SheetsSync.getEmployees() || [];
    const target = emps.find(e => e.id === empId);
    if (!target) return;

    const newName = document.getElementById(`edit-name-${empId}`).value.trim();
    const newRole = document.getElementById(`edit-role-${empId}`).value;
    const newPhone = document.getElementById(`edit-phone-${empId}`).value.trim();
    const newJoinDate = document.getElementById(`edit-joindate-${empId}`).value;
    const newPosition = document.getElementById(`edit-position-${empId}`).value.trim();
    const newEmail = document.getElementById(`edit-email-${empId}`).value.trim();
    const newMemo = document.getElementById(`edit-memo-${empId}`).value.trim();

    if (!newName || !newPhone || !newEmail) {
      alert('⚠️ 성명, 휴대폰 연락처, 이메일은 필수 입력 항목입니다.');
      return;
    }

    target.name = newName;
    target.role = newRole;
    target.phone = newPhone;
    target.joinDate = newJoinDate;
    target.position = newPosition;
    target.email = newEmail;
    target.username = newEmail;
    target.memo = newMemo;
    target.updatedAt = Date.now();

    const isPharmacist = newRole.includes('약사');
    if (isPharmacist) {
      const weekdayRateInput = document.getElementById(`edit-weekday-${empId}`);
      const holidayRateInput = document.getElementById(`edit-holiday-${empId}`);
      const weekdayRate = weekdayRateInput ? (parseInt(weekdayRateInput.value) || 35000) : (target.hourlyRate || 35000);
      const holidayRate = holidayRateInput ? (parseInt(holidayRateInput.value) || 40000) : 40000;
      target.hourlyRate = weekdayRate;
      target.weekdayRate = weekdayRate;
      target.holidayRate = holidayRate;

      const pRates = window.SheetsSync.getPharmacistRates ? window.SheetsSync.getPharmacistRates() : {};
      pRates[empId] = pRates[empId] || { breakHours: 1.0 };
      pRates[empId].weekdayRate = weekdayRate;
      pRates[empId].holidayRate = holidayRate;
      if (window.SheetsSync.savePharmacistRates) window.SheetsSync.savePharmacistRates(pRates);
    } else {
      const baseSalInput = document.getElementById(`edit-salary-${empId}`);
      const hourlyInput = document.getElementById(`edit-hourly-${empId}`);
      const baseSal = baseSalInput ? (parseInt(baseSalInput.value) || 2717000) : (target.baseMonthlySalary || 2717000);
      const hourlyRate = hourlyInput ? (parseInt(hourlyInput.value) || 13000) : (target.hourlyRate || 13000);
      target.baseMonthlySalary = baseSal;
      target.hourlyRate = hourlyRate;
    }

    window.SheetsSync.saveEmployees(emps);
    if (typeof window.SheetsSync.pushToCloud === 'function') {
      window.SheetsSync.pushToCloud();
    }
    editingEmpId = null;

    alert(`✅ [${newName}] 직원의 세부 정보 수정이 완벽히 저장되었습니다!`);
    render('module-content');
  }

  function deleteEmployee(empId) {
    const emps = window.SheetsSync.getEmployees() || [];
    const target = emps.find(e => e.id === empId);
    if (!target) return;

    if (target.role === '약국장') {
      alert('❌ 총괄 약국장 최고 관리자 계정은 삭제할 수 없습니다.');
      return;
    }

    if (confirm(`⚠️ [${target.name} ${target.role}] 직원의 계정 및 명부를 삭제(퇴사 처리)하시겠습니까?`)) {
      if (typeof window.SheetsSync.addDeletedId === 'function') {
        window.SheetsSync.addDeletedId(empId);
      }
      const updatedEmps = emps.filter(e => e.id !== empId);
      window.SheetsSync.saveEmployees(updatedEmps);
      if (typeof window.SheetsSync.pushToCloud === 'function') {
        window.SheetsSync.pushToCloud();
      }
      alert(`🗑️ [${target.name}] 직원의 계정 및 명부가 성공적으로 삭제되었습니다.`);
      render('module-content');
    }
  }

  function editMemo(empId) {
    const emps = window.SheetsSync.getEmployees();
    const target = emps.find(e => e.id === empId);
    if (!target) return;

    const box = document.getElementById(`memo-box-${empId}`);
    if (!box) return;

    const currentMemo = target.memo || '';
    box.innerHTML = `
      <div class="mt-2">
        <textarea id="memo-input-${empId}" class="form-control mb-2" rows="2" style="font-size:12.5px; border-radius:8px;">${currentMemo}</textarea>
        <div class="d-flex justify-content-end gap-1">
          <button type="button" class="btn btn-xs btn-secondary" onclick="StaffDirectoryModule.cancelMemo('${empId}')" style="font-size:11.5px; padding:3px 8px;">취소</button>
          <button type="button" class="btn btn-xs btn-primary font-bold" onclick="StaffDirectoryModule.saveMemo('${empId}')" style="font-size:11.5px; padding:3px 10px;"><i class="fas fa-check"></i> 저장</button>
        </div>
      </div>
    `;
  }

  function saveMemo(empId) {
    const emps = window.SheetsSync.getEmployees();
    const target = emps.find(e => e.id === empId);
    if (!target) return;

    const input = document.getElementById(`memo-input-${empId}`);
    if (!input) return;

    target.memo = input.value.trim();
    target.updatedAt = Date.now();
    window.SheetsSync.saveEmployees(emps);
    alert(`📝 ${target.name} 직원의 약국장 참고 메모가 저장되었습니다.`);
    render('module-content');
  }

  function cancelMemo(empId) {
    render('module-content');
  }

  function handleSearch(val) {
    searchQuery = val;
    const grid = document.getElementById('staff-directory-grid');
    if (grid) {
      const emps = window.SheetsSync.getEmployees() || [];
      grid.innerHTML = renderStaffCards(emps);
    }
  }

  function resetPasscode(empId) {
    const emps = window.SheetsSync.getEmployees();
    const target = emps.find(e => e.id === empId);
    if (!target) return;

    // 직원 전화번호 뒷 4자리 추천값 생성
    let defaultPhoneTail = '1234';
    if (target.phone && target.phone.length >= 4) {
      const cleanPhone = target.phone.replace(/[^0-9]/g, '');
      if (cleanPhone.length >= 4) {
        defaultPhoneTail = cleanPhone.slice(-4);
      }
    }

    const newCode = prompt(
      `🔐 [약국장 전용 개별 비밀번호 설정]\n\n'${target.name}' (${target.role}) 직원의 새로운 초기 비밀번호를 설정해 주세요.\n\n(추천: 해당 직원 휴대폰 뒷 4자리 '${defaultPhoneTail}' 또는 원하시는 개별 임시암호):`,
      defaultPhoneTail
    );

    if (newCode === null) return; // 사용자가 취소를 누른 경우

    const cleanCode = newCode.trim();
    if (!cleanCode) {
      alert('⚠️ 비밀번호는 공백일 수 없습니다.');
      return;
    }

    window.SheetsSync.resetPassword(empId, cleanCode);
    alert(`🎉 [${target.name}] 직원의 비밀번호가 '${cleanCode}'(으)로 안전하게 설정되었습니다!\n\n해당 직원에게 1:1 카카오톡으로 안내해 주세요.`);
    render('module-content');
  }

  function openPermModal(empId) {
    const emps = window.SheetsSync.getEmployees();
    const target = emps.find(e => e.id === empId);
    if (!target) return;

    const modal = document.getElementById('perm-modal');
    if (!modal) return;

    document.getElementById('perm-emp-id').value = target.id;
    document.getElementById('perm-emp-name').innerText = target.name + ' (' + target.role + ')';

    let permMap = {};
    try {
      const pRaw = localStorage.getItem('ssg_emp_permissions') || localStorage.getItem('ssg_emp_permissions_v1');
      if (pRaw) permMap = JSON.parse(pRaw);
    } catch(e) {}

    const allowed = (permMap && permMap[target.id]) || target.allowedTabs || [
      'notices-module', 'worklog-module', 'medicine-location-module', 'rx-medicine-location-module', 'schedule-module',
      'annual-leave-module', 'discount-purchase-module', 'rules-module', 'emergency-contacts-module'
    ];

    const tabCheckboxes = modal.querySelectorAll('.perm-tab-cb');
    tabCheckboxes.forEach(cb => {
      cb.checked = allowed.includes(cb.value);
    });

    modal.style.display = 'flex';
  }

  function saveStaffPermissions(e) {
    e.preventDefault();
    const empId = document.getElementById('perm-emp-id').value;
    const modal = document.getElementById('perm-modal');
    if (!modal) return;

    const tabCheckboxes = modal.querySelectorAll('.perm-tab-cb');
    const newAllowed = [];
    tabCheckboxes.forEach(cb => {
      if (cb.checked) newAllowed.push(cb.value);
    });

    if (!empId) {
      alert('❌ 직원 ID를 찾을 수 없습니다.');
      return;
    }

    window.SheetsSync.updateStaffPermissions(empId, newAllowed);
    modal.style.display = 'none';

    if (window.App && typeof window.App.renderSidebarNavigation === 'function') {
      window.App.renderSidebarNavigation();
    }
    if (window.App && typeof window.App.renderUserHeader === 'function') {
      window.App.renderUserHeader();
    }

    render('module-content');
    alert('✅ 탭 접근 권한이 영구적으로 저장되었습니다!');
  }

  function editPayCondition(empId) {
    const emps = window.SheetsSync.getEmployees();
    const target = emps.find(e => e.id === empId);
    if (!target) return;

    const box = document.getElementById(`pay-box-${empId}`);
    if (!box) return;

    const isPharmacist = target.role.includes('약사');
    const pRatesMap = window.SheetsSync.getPharmacistRates ? window.SheetsSync.getPharmacistRates() : {};
    const pRateObj = pRatesMap[empId] || { weekdayRate: target.hourlyRate || 35000, holidayRate: 40000 };

    if (isPharmacist) {
      box.innerHTML = `
        <div class="mt-2 p-3" style="background:#fff7ed; border-radius:12px; border:1px solid #ffedd5;">
          <div class="mb-2">
            <label class="form-label mb-1 font-bold" style="font-size:12px; color:#1e40af;">☀️ 평일 근무시급 (원/h):</label>
            <input type="number" id="pay-input-weekday-${empId}" class="form-control form-control-sm font-bold text-end" value="${pRateObj.weekdayRate}" style="color:#1e40af;">
          </div>
          <div class="mb-3">
            <label class="form-label mb-1 font-bold" style="font-size:12px; color:#c2410c;">🏖️ 주말·공휴일 시급 (원/h):</label>
            <input type="number" id="pay-input-holiday-${empId}" class="form-control form-control-sm font-bold text-end" value="${pRateObj.holidayRate}" style="color:#c2410c;">
          </div>
          <div class="d-flex justify-content-end gap-1">
            <button type="button" class="btn btn-xs btn-secondary" onclick="StaffDirectoryModule.cancelMemo('${empId}')" style="font-size:11.5px; padding:3px 10px;">취소</button>
            <button type="button" class="btn btn-xs btn-primary font-bold" onclick="StaffDirectoryModule.savePayCondition('${empId}')" style="font-size:11.5px; padding:3px 12px;"><i class="fas fa-check"></i> 저장</button>
          </div>
        </div>
      `;
    } else {
      box.innerHTML = `
        <div class="mt-2 p-3" style="background:#f0fdf4; border-radius:12px; border:1px solid #dcfce7;">
          <div class="mb-2">
            <label class="form-label mb-1 font-bold" style="font-size:12px; color:#15803d;">👛 기본 고정월급 (원/월):</label>
            <input type="number" id="pay-input-salary-${empId}" class="form-control form-control-sm font-bold text-end" value="${target.baseMonthlySalary || 0}" style="color:#15803d;">
          </div>
          <div class="mb-3">
            <label class="form-label mb-1 font-bold" style="font-size:12px; color:#0369a1;">⏱️ 초과 책정시급 (원/h):</label>
            <input type="number" id="pay-input-hourly-${empId}" class="form-control form-control-sm font-bold text-end" value="${target.hourlyRate || 13000}" style="color:#0369a1;">
          </div>
          <div class="d-flex justify-content-end gap-1">
            <button type="button" class="btn btn-xs btn-secondary" onclick="StaffDirectoryModule.cancelMemo('${empId}')" style="font-size:11.5px; padding:3px 10px;">취소</button>
            <button type="button" class="btn btn-xs btn-primary font-bold" onclick="StaffDirectoryModule.savePayCondition('${empId}')" style="font-size:11.5px; padding:3px 12px;"><i class="fas fa-check"></i> 저장</button>
          </div>
        </div>
      `;
    }
  }

  function savePayCondition(empId) {
    const emps = window.SheetsSync.getEmployees();
    const target = emps.find(e => e.id === empId);
    if (!target) return;

    const isPharmacist = target.role.includes('약사');

    if (isPharmacist) {
      const weekdayRate = parseInt(document.getElementById(`pay-input-weekday-${empId}`).value) || 35000;
      const holidayRate = parseInt(document.getElementById(`pay-input-holiday-${empId}`).value) || 40000;

      const pRates = window.SheetsSync.getPharmacistRates ? window.SheetsSync.getPharmacistRates() : {};
      pRates[empId] = pRates[empId] || { breakHours: 1.0 };
      pRates[empId].weekdayRate = weekdayRate;
      pRates[empId].holidayRate = holidayRate;
      if (window.SheetsSync.savePharmacistRates) window.SheetsSync.savePharmacistRates(pRates);

      target.hourlyRate = weekdayRate;
      target.weekdayRate = weekdayRate;
      target.holidayRate = holidayRate;
      target.updatedAt = Date.now();
      window.SheetsSync.saveEmployees(emps);
      alert(`💰 [${target.name}] 시급이 수정되었습니다.`);
    } else {
      const baseMonthlySalary = parseInt(document.getElementById(`pay-input-salary-${empId}`).value) || 2717000;
      const hourlyRate = parseInt(document.getElementById(`pay-input-hourly-${empId}`).value) || 13000;

      target.baseMonthlySalary = baseMonthlySalary;
      target.hourlyRate = hourlyRate;
      target.updatedAt = Date.now();
      window.SheetsSync.saveEmployees(emps);
      alert(`💼 [${target.name}] 급여 조건이 수정되었습니다.`);
    }

    render('module-content');
  }

  function openNewEmpModal() {
    toggleInlineRegistrationForm(true);

    let modal = document.getElementById('new-emp-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'new-emp-modal';
      modal.className = 'modal-overlay';
      modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); z-index:9999999; display:flex; justify-content:center; align-items:center;';
      document.body.appendChild(modal);
    }

    const todayStr = new Date().toISOString().split('T')[0];

    modal.innerHTML = `
      <div class="modal-card" style="background:#ffffff; border-radius:20px; max-width:640px; width:94%; padding:28px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.4); position:relative; max-height:92vh; overflow-y:auto;">
        <button type="button" class="close-btn" onclick="document.getElementById('new-emp-modal').style.display='none'" style="position:absolute; top:20px; right:24px; font-size:26px; background:none; border:none; color:#64748b; cursor:pointer;">&times;</button>
        
        <div class="d-flex align-items-center gap-3 mb-4">
          <div style="width:48px; height:48px; border-radius:50%; background:#dbeafe; color:#2563eb; display:flex; justify-content:center; align-items:center; font-size:22px; font-weight:bold;">
            <i class="fas fa-user-plus"></i>
          </div>
          <div>
            <h3 style="font-size:20px; font-weight:bold; margin:0; color:#0f172a;">👥 신규 직원 계정 및 명부 등록 (약국장 전용)</h3>
            <p class="text-muted mb-0" style="font-size:13px;">신세계약국 신규 직원 계정 생성 및 기본 정보를 등록합니다.</p>
          </div>
        </div>

        <form onsubmit="StaffDirectoryModule.handleNewEmpSubmit(event)">
          <div class="row g-3 mb-3">
            <div class="col-md-6">
              <label class="form-label font-bold" style="font-size:13px; color:#334155;">성명 (이름)</label>
              <input type="text" id="new-emp-name" class="form-control" placeholder="예: 홍길동" required style="border-radius:10px; padding:10px;">
            </div>
            <div class="col-md-6">
              <label class="form-label font-bold" style="font-size:13px; color:#334155;">구분 / 직무</label>
              <select id="new-emp-role" class="form-select" required style="border-radius:10px; padding:10px;">
                <option value="근무약사">💊 근무약사</option>
                <option value="일반직원" selected>💻 일반직원</option>
                <option value="예비인력">⏳ 예비인력</option>
              </select>
            </div>
          </div>

          <div class="row g-3 mb-3">
            <div class="col-md-6">
              <label class="form-label font-bold" style="font-size:13px; color:#334155;">상세 직책</label>
              <input type="text" id="new-emp-position" class="form-control" placeholder="예: 조제팀 / 전산 / 매장" required style="border-radius:10px; padding:10px;">
            </div>
            <div class="col-md-6">
              <label class="form-label font-bold" style="font-size:13px; color:#334155;">급여 유형</label>
              <select id="new-emp-paytype" class="form-select" required style="border-radius:10px; padding:10px;">
                <option value="HOURLY">⏱️ 약정시급제 (근무약사)</option>
                <option value="MONTHLY" selected>💼 주40h 고정월급제 (일반직원)</option>
              </select>
            </div>
          </div>

          <div class="row g-3 mb-3">
            <div class="col-md-6">
              <label class="form-label font-bold" style="font-size:13px; color:#334155;">약정 평일시급 (원/h)</label>
              <input type="number" id="new-emp-rate" class="form-control" value="35000" style="border-radius:10px; padding:10px;">
            </div>
            <div class="col-md-6">
              <label class="form-label font-bold" style="font-size:13px; color:#334155;">기본 월급 (원/월, 식대20만 포함)</label>
              <input type="number" id="new-emp-salary" class="form-control" value="2717000" style="border-radius:10px; padding:10px;">
            </div>
          </div>

          <div class="row g-3 mb-3">
            <div class="col-md-6">
              <label class="form-label font-bold" style="font-size:13px; color:#334155;">로그인 아이디 (이메일 계정)</label>
              <input type="text" id="new-emp-email" class="form-control" placeholder="예: hong@shinsegae.com" required style="border-radius:10px; padding:10px;">
            </div>
            <div class="col-md-6">
              <label class="form-label font-bold" style="font-size:13px; color:#334155;">휴대폰 연락처</label>
              <input type="text" id="new-emp-phone" class="form-control" placeholder="예: 010-1234-5678" required style="border-radius:10px; padding:10px;">
            </div>
          </div>

          <div class="row g-3 mb-3">
            <div class="col-md-6">
              <label class="form-label font-bold" style="font-size:13px; color:#334155;">입사 일자</label>
              <input type="date" id="new-emp-joindate" class="form-control" value="${todayStr}" required style="border-radius:10px; padding:10px;">
            </div>
            <div class="col-md-6">
              <label class="form-label font-bold" style="font-size:13px; color:#334155;">초기 비밀번호</label>
              <input type="text" id="new-emp-passcode" class="form-control" value="1234" readonly style="border-radius:10px; padding:10px; background:#f1f5f9;">
            </div>
          </div>

          <div class="mb-4">
            <label class="form-label font-bold" style="font-size:13px; color:#334155;">약국장 참고 메모</label>
            <textarea id="new-emp-memo" class="form-control" rows="2" placeholder="직원 업무 분담 및 특이사항 메모..." style="border-radius:10px; padding:10px;"></textarea>
          </div>

          <div class="d-flex justify-content-end gap-2">
            <button type="button" class="btn btn-secondary" onclick="document.getElementById('new-emp-modal').style.display='none'" style="border-radius:10px; padding:8px 18px;">취소</button>
            <button type="submit" class="btn btn-primary font-bold" style="border-radius:10px; padding:8px 22px; font-size:15px;"><i class="fas fa-save"></i> ➕ 신규 직원 등록 완료</button>
          </div>
        </form>
      </div>
    `;

    modal.style.display = 'flex';
    modal.style.zIndex = '9999999';
    setTimeout(() => {
      const nameInput = document.getElementById('new-emp-name');
      if (nameInput) nameInput.focus();
    }, 100);
  }

  function handleNewEmpSubmit(e) {
    e.preventDefault();

    const form = e.target;
    const getVal = (id1, id2) => {
      if (form) {
        const input = form.querySelector(`#${id1}, #${id2}`);
        if (input && input.value.trim()) return input.value.trim();
      }
      const el1 = document.getElementById(id1);
      if (el1 && el1.value.trim()) return el1.value.trim();
      const el2 = document.getElementById(id2);
      if (el2 && el2.value.trim()) return el2.value.trim();
      return '';
    };

    const name = getVal('new-emp-name-inline', 'new-emp-name');
    const role = getVal('new-emp-role-inline', 'new-emp-role') || '일반직원';
    const position = getVal('new-emp-position-inline', 'new-emp-position') || '직원';
    const payType = getVal('new-emp-paytype-inline', 'new-emp-paytype') || 'MONTHLY';
    const hourlyRate = parseInt(getVal('new-emp-rate-inline', 'new-emp-rate')) || 35000;
    const baseMonthlySalary = parseInt(getVal('new-emp-salary-inline', 'new-emp-salary')) || 2717000;
    const email = getVal('new-emp-email-inline', 'new-emp-email');
    const phone = getVal('new-emp-phone-inline', 'new-emp-phone');
    const joinDate = getVal('new-emp-joindate-inline', 'new-emp-joindate') || new Date().toISOString().split('T')[0];
    const memo = getVal('new-emp-memo-inline', 'new-emp-memo');

    if (!name || !email || !phone) {
      alert('⚠️ 성명, 이메일 아이디, 휴대폰 연락처는 필수 입력 사항입니다.');
      return;
    }

    const emps = window.SheetsSync.getEmployees() || [];
    
    if (emps.some(emp => emp.email === email || emp.username === email)) {
      alert('⚠️ 이미 등록된 이메일 계정이 존재합니다.');
      return;
    }

    const ALL_COMMON_TABS = [
      'notices-module', 'worklog-module', 'medicine-location-module', 'schedule-module',
      'annual-leave-module', 'discount-purchase-module', 'rules-module', 'emergency-contacts-module'
    ];

    const newEmp = {
      id: 'emp_' + (emps.length + 1) + '_' + Date.now(),
      username: email,
      email: email,
      passcode: '1234',
      name: name,
      role: role,
      position: position,
      payType: payType,
      joinDate: joinDate,
      hourlyRate: hourlyRate,
      baseMonthlySalary: baseMonthlySalary,
      phone: phone,
      usedLeave: 0,
      pendingLeave: 0,
      memo: memo,
      allowedTabs: [...ALL_COMMON_TABS]
    };

    emps.push(newEmp);
    window.SheetsSync.saveEmployees(emps);

    if (role.includes('약사')) {
      const rates = window.SheetsSync.getPharmacistRates ? window.SheetsSync.getPharmacistRates() : {};
      rates[newEmp.id] = { weekdayRate: hourlyRate, holidayRate: Math.round(hourlyRate * 1.15), breakHours: 1.0 };
      if (window.SheetsSync.savePharmacistRates) window.SheetsSync.savePharmacistRates(rates);
    }

    const modal = document.getElementById('new-emp-modal');
    if (modal) modal.style.display = 'none';
    showInlineRegistrationForm = false;

    alert(`🎉 신규 직원 [${name} ${role}] 님의 등록이 완료되었습니다!`);
    render('module-content');
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('ssg_cloud_updated', () => {
      if (window.App && window.App.getActiveModule && window.App.getActiveModule() === 'staff-directory') {
        if (!editingEmpId) {
          render('module-content');
        }
      }
    });
  }

  return {
    render,
    isEditing: () => editingEmpId !== null,
    setRoleFilter,
    toggleInlineRegistrationForm,
    openNewEmpModal,
    handleNewEmpSubmit,
    editFullEmployee,
    saveFullEdit,
    cancelFullEdit,
    deleteEmployee,
    editPayCondition,
    savePayCondition,
    editMemo,
    saveMemo,
    cancelMemo,
    handleSearch,
    resetPasscode,
    openPermModal,
    saveStaffPermissions
  };
})();