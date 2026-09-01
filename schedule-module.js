/**
 * 2. 월간 근무 스케줄 모듈 컨트롤러 (Monthly Roster & Labor Contract Payroll Engine)
 * 근무자 / OFF(휴무자) 명확 구분 체크 기능 및 근무자별 자율 출퇴근 시간 정밀 설정
 */
window.ScheduleModule = (function () {

  let currentYear = 2026;
  let currentMonth = 8;
  let roleFilter = 'all'; // 'all': 전체, 'pharmacist': 약사만
  let showOffStaff = false; // false: 근무자만 보기, true: OFF 포함 전체 보기
  let showSettlement = true;
  let showCalendar = true; // 달력 접고 펴기 토글 상태
  let showSubmittedDetails = true; // 약국장 전용 전 직원 신청 스케줄 상세 내역 접고 펴기 토글 상태
  let activeInlinePanel = null; // null | 'director-tax-pdf' | empId | 'my-paystub' (팝업창 차단 원천 해결용 인라인 작업 패널 상태)
  let isPayrollUnlocked = true;

  function toggleSubmittedDetails() {
    showSubmittedDetails = !showSubmittedDetails;
    render('module-content');
  }

  const DYNAMIC_COLOR_PALETTE = [
    'badge-black', 'badge-blue', 'badge-purple', 'badge-orange',
    'badge-teal', 'badge-red', 'badge-green', 'badge-gold', 'badge-pink', 'badge-indigo'
  ];

  const PREDEFINED_COLOR_MAP = {
    '문성도': 'badge-black',
    '권명주': 'badge-blue',
    '양윤지': 'badge-purple',
    '김동완': 'badge-teal',
    '유호종': 'badge-orange',
    '이승학': 'badge-red',
    '김제희': 'badge-gold',
    '윤세라': 'badge-green',
    '김배영': 'badge-pink'
  };

  function getStaffColorClass(name, idx) {
    if (PREDEFINED_COLOR_MAP[name]) return PREDEFINED_COLOR_MAP[name];
    return DYNAMIC_COLOR_PALETTE[idx % DYNAMIC_COLOR_PALETTE.length];
  }

  function formatShiftShortTime(shift, startTime, endTime) {
    if (shift === 'OFF') return '⚪ OFF';
    let start = startTime;
    let end = endTime;

    if (!start || !end) {
      if (shift === 'A') { start = '09:00'; end = '18:00'; }
      else if (shift === 'B') { start = '10:00'; end = '22:00'; }
      else if (shift === 'C') { start = '09:00'; end = '13:00'; }
      else if (shift === 'D') { start = '13:00'; end = '22:00'; }
      else if (shift === 'FULL') { start = '09:00'; end = '22:00'; }
      else return '';
    }

    const cleanStart = start.endsWith(':00') ? start.slice(0, 2) : start;
    const cleanEnd = end.endsWith(':00') ? end.slice(0, 2) : end;

    return `(${cleanStart}-${cleanEnd})`;
  }

  function render(containerId) {
    const container = document.getElementById(containerId || 'module-content');
    if (!container) return;

    const currUser = window.SheetsSync.getCurrentUser();
    if (currUser && currUser.role === '약국장') {
      isPayrollUnlocked = true;
    } else {
      isPayrollUnlocked = false;
      if (activeInlinePanel && activeInlinePanel !== 'my-paystub' && (!currUser || activeInlinePanel !== currUser.id)) {
        activeInlinePanel = null;
      }
    }

    const data = window.SheetsSync.getData();
    const employees = data.employees || [];
    const scheduleRecords = data.schedule || [];
    const monthKey = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
    const statusObj = ((data.scheduleStatus || {})[monthKey]) || {};

    const html = `
      <!-- 상단 헤더 및 필터 스위치 -->
      <div class="schedule-top-bar mb-4">
        <div class="st-left">
          <h2>월간 근무표</h2>
          <span class="text-muted text-sm ml-2">
            <i class="fas fa-lock text-warning"></i> 월 급여 정산표: 약국장 보안 보호
          </span>
        </div>

        <div class="st-right flex-wrap-gap">
          <!-- 1. 근무자 표시 역할 필터 ( [ 👨‍💼 전체 ] / [ 👨‍⚕️ 약사만 ] ) -->
          <div class="role-filter-toggle">
            <button type="button" class="filter-btn ${roleFilter === 'all' ? 'active' : ''}" onclick="ScheduleModule.setRoleFilter('all')">
              <i class="fas fa-users"></i> 👨‍💼 전체
            </button>
            <button type="button" class="filter-btn ${roleFilter === 'pharmacist' ? 'active' : ''}" onclick="ScheduleModule.setRoleFilter('pharmacist')">
              <i class="fas fa-user-md"></i> 👨‍⚕️ 약사만
            </button>
          </div>

          <!-- 2. 근무 / OFF(휴무자) 구분 표시 필터 -->
          <div class="role-filter-toggle ml-2">
            <button type="button" class="filter-btn ${!showOffStaff ? 'active' : ''}" onclick="ScheduleModule.setShowOffStaff(false)" title="실제 근무자만 표시">
              <i class="fas fa-user-check text-success"></i> 🟢 근무자만 보기
            </button>
            
          </div>
        </div>
      </div>

      <!-- 월 서브 컨트롤러 네비게이션 바 -->
      <div class="schedule-nav-bar mb-4">
        <div class="snav-left">
          <button type="button" class="btn btn-icon" onclick="ScheduleModule.changeMonth(-1)"><i class="fas fa-chevron-left"></i></button>
          <strong class="snav-month-title">${currentYear}년 ${currentMonth}월</strong>
          <button type="button" class="btn btn-icon" onclick="ScheduleModule.changeMonth(1)"><i class="fas fa-chevron-right"></i></button>
          <button type="button" class="btn btn-outline btn-sm ml-2" onclick="ScheduleModule.goToday()">오늘</button>
        </div>

        <div class="snav-right">
          <!-- 달력 접기 / 펼치기 토글 버튼 -->
          <button type="button" class="btn btn-success btn-sm font-bold" onclick="ScheduleModule.toggleCalendar()" style="box-shadow:0 2px 6px rgba(5,150,105,0.3);">
            <i class="fas fa-calendar-alt"></i> 📅 ${currentMonth}월 월간 근무스케줄 달력 (${showCalendar ? '달력 접기 ▲' : '달력 펼치기 ▼'})
          </button>
        </div>
      </div>

      <!-- 🚨 약국장 스케줄 수정 요청(반려) 전달 알림 배너 (해당 직원 계정 접속 시만 노출) -->
      ${(() => {
        if (!currUser || currUser.role === '약국장') return '';
        const userComment = statusObj[currUser.id + '_comment'] || (statusObj[currUser.id] === 'DRAFT' ? statusObj.directorComment : null);
        const isDismissed = statusObj[currUser.id + '_dismissed'];
        if (!userComment || isDismissed || statusObj[currUser.id] === 'APPROVED') return '';
        return `
          <div class="alert mb-4" style="background:#fffbeb; border:2px solid #f59e0b; border-radius:18px; padding:18px 22px; box-shadow:0 8px 20px rgba(245,158,11,0.15);">
            <div class="d-flex align-items-center gap-3">
              <div style="width:46px; height:46px; border-radius:50%; background:#fef3c7; color:#d97706; display:flex; justify-content:center; align-items:center; font-size:22px; font-weight:bold; flex-shrink:0;">
                <i class="fas fa-undo-alt"></i>
              </div>
              <div style="flex:1;">
                <div class="d-flex align-items-center justify-content-between gap-2 mb-1">
                  <div class="d-flex align-items-center gap-2">
                    <span class="badge bg-warning text-dark font-bold" style="font-size:12px; padding:4px 10px; border-radius:10px;">🚨 약국장 스케줄 재조율(수정) 요청 알림</span>
                    <span style="font-size:12px; color:#b45309; font-weight:700;">(${currentMonth}월 근무 스케줄)</span>
                  </div>
                  <button type="button" class="btn btn-sm btn-outline-warning" onclick="ScheduleModule.dismissNotice()" style="font-size:11px; padding:2px 8px; border-radius:6px; font-weight:bold;">✕ 닫기</button>
                </div>
                <h4 style="font-size:15px; font-weight:800; color:#92400e; margin:0 0 4px 0;">
                  💬 약국장 전달 사유: <span style="color:#b45309; text-decoration:underline;">"${userComment}"</span>
                </h4>
                <p class="mb-0 text-muted" style="font-size:13px; font-weight:600;">
                  위 조율 사유를 확인하신 후, 하단 스케줄표에서 근무 시간 및 OFF를 보정하시고 <strong>[내 스케줄 최종 제출하기]</strong> 버튼을 다시 눌러주세요.
                </p>
              </div>
            </div>
          </div>
        `;
      })()}

<!-- 📦 1번 통합 박스: 개인 자율 제출 & 통합 마스터 승인 센터 -->
      <div class="schedule-control-card mb-4" style="background:#ffffff; border:1.5px solid #cbd5e1; border-radius:18px; padding:22px; box-shadow:0 4px 18px rgba(15,23,42,0.05);">
        ${(() => {
          // 상태값 가져오기 (개인별 상태 추적)
          const myStatus = statusObj[currUser ? currUser.id : ''] || 'DRAFT';
          
          if (currUser && currUser.role !== '약국장') {
            // ==========================================
            // 👤 1-1. 일반 직원/근무약사 접속 시 화면 (My Schedule)
            // ==========================================
            return `
              <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
                <div class="d-flex align-items-center gap-3">
                  <div style="width:48px; height:48px; border-radius:14px; background:#eff6ff; border:1px solid #bfdbfe; color:#2563eb; display:flex; justify-content:center; align-items:center; font-size:20px;">
                    <i class="fas fa-user-clock"></i>
                  </div>
                  <div>
                    <h3 style="font-size:18px; font-weight:800; color:#0f172a; margin:0;">😎 ${currUser.name} 님의 ${currentMonth}월 스케줄 제출</h3>
                    <p style="font-size:13px; color:#64748b; margin:2px 0 0 0;">내 스케줄(근무/오프)을 달력에 입력한 뒤 제출하기 버튼을 눌러주세요.</p>
                  </div>
                </div>
                <div class="text-end">
                  <div class="mb-2">
                    ${myStatus === 'APPROVED' ? '<span class="badge bg-success py-2 px-3" style="font-size:14px;">✅ 약국장 최종 확정</span>' : 
                      (myStatus === 'SUBMITTED' ? '<span class="badge bg-info text-white py-2 px-3" style="font-size:14px;">⏳ 약국장 결재 대기중</span>' : 
                      '<span class="badge bg-warning text-dark py-2 px-3" style="font-size:14px;">📝 작성 및 조율 중</span>')}
                  </div>
                  ${myStatus !== 'APPROVED' ? `
                    <button type="button" class="btn btn-primary font-bold shadow-sm" onclick="ScheduleModule.submitMySchedule()" style="border-radius:12px; padding:10px 24px;">
                      📤 내 스케줄 최종 제출하기
                    </button>
                  ` : ''}
                </div>
              </div>
            `;
          } else {
            // ==========================================
            // 👑 1-2. 약국장 접속 시 화면 (Master Board)
            // ==========================================
            const targetEmployees = employees.filter(e => e.role !== '약국장' && e.name !== '이정은' && e.name !== '주찬양');
            const submittedList = targetEmployees.filter(e => statusObj[e.id] === 'SUBMITTED' || statusObj[e.id] === 'APPROVED');
            const unsubmittedList = targetEmployees.filter(e => statusObj[e.id] !== 'SUBMITTED' && statusObj[e.id] !== 'APPROVED');

            const submitCount = submittedList.length;
            const totalCount = targetEmployees.length;
            const progressPercent = Math.round((submitCount / (totalCount || 1)) * 100) || 0;
            
            return `
              <div class="d-flex justify-content-between align-items-center mb-4 pb-3 border-bottom flex-wrap gap-2">
                <div class="d-flex align-items-center gap-3">
                  <div style="width:48px; height:48px; border-radius:14px; background:#fef2f2; border:1px solid #fecaca; color:#dc2626; display:flex; justify-content:center; align-items:center; font-size:20px;">
                    <i class="fas fa-chess-king"></i>
                  </div>
                  <div>
                    <h3 style="font-size:18px; font-weight:800; color:#0f172a; margin:0;">👑 ${currentMonth}월 마스터 스케줄 결재 현황</h3>
                    <p style="font-size:13px; color:#64748b; margin:2px 0 0 0;">직원들의 개별 제출 현황을 파악하고 빈틈없는 달력을 완성하세요.</p>
                  </div>
                </div>
              </div>
              
              <!-- 🚨 직원이 새롭게 스케줄을 제출했을 때 약국장 전용 강조 알림 배너 -->
              ${(() => {
                const newlySubmittedEmps = targetEmployees.filter(e => statusObj[e.id] === 'SUBMITTED');
                if (newlySubmittedEmps.length === 0) return '';
                const namesText = newlySubmittedEmps.map(e => e.name).join(', ');
                return `
                  <div class="alert mb-4 animate-scaleIn" style="background:linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border:2px solid #3b82f6; border-radius:16px; padding:16px 20px; box-shadow:0 6px 18px rgba(37,99,235,0.15);">
                    <div class="d-flex align-items-center justify-content-between flex-wrap gap-2">
                      <div class="d-flex align-items-center gap-3">
                        <div style="width:40px; height:40px; border-radius:50%; background:#2563eb; color:#ffffff; display:flex; justify-content:center; align-items:center; font-size:18px; flex-shrink:0;">
                          <i class="fas fa-bell animate-bounce"></i>
                        </div>
                        <div>
                          <div class="d-flex align-items-center gap-2">
                            <span class="badge bg-primary font-bold" style="font-size:11.5px; padding:4px 10px; border-radius:8px;">🔔 신규 스케줄 제출 알림</span>
                            <span style="font-size:12px; color:#1e40af; font-weight:700;">총 ${newlySubmittedEmps.length}명 미결재 제출</span>
                          </div>
                          <h4 style="font-size:15px; font-weight:800; color:#1e3a8a; margin:4px 0 0 0;">
                            직원 <span style="color:#2563eb; text-decoration:underline;">[${namesText}]</span> 님이 근무 스케줄을 작성하여 새로 제출했습니다!
                          </h4>
                        </div>
                      </div>
                      <span style="font-size:12.5px; color:#1d4ed8; font-weight:700; background:#ffffff; padding:6px 14px; border-radius:10px; border:1px solid #bfdbfe;">
                        👉 하단 달력에서 시간을 대조하신 후 최종 승인해 주세요.
                      </span>
                    </div>
                  </div>
                `;
              })()}

              <div class="mb-4">
                <div class="d-flex justify-content-between mb-1" style="font-size:14px; font-weight:700;">
                  <span>전체 직원 제출 진행률</span>
                  <span class="text-primary">${submitCount}명 / ${totalCount}명 제출 (${progressPercent}%)</span>
                </div>
                <div class="progress" style="height: 12px; border-radius: 6px; background:#f1f5f9; margin-bottom:14px;">
                  <div class="progress-bar progress-bar-striped progress-bar-animated bg-primary" role="progressbar" style="width: ${progressPercent}%"></div>
                </div>

                <!-- 👥 제출 상태별 직원 명단 카드 -->
                <div class="p-3" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:14px;">
                  <div class="row g-3">
                    <!-- 1. 제출 완료 명단 -->
                    <div class="col-md-6">
                      <div class="d-flex align-items-center gap-2 mb-2">
                        <span class="badge bg-success font-bold" style="font-size:11.5px; padding:4px 9px; border-radius:6px;">
                          <i class="fas fa-check-circle me-1"></i> 🟢 제출 완료 (${submittedList.length}명)
                        </span>
                      </div>
                      <div class="d-flex flex-wrap gap-1">
                        ${submittedList.length === 0 ? '<span class="text-muted" style="font-size:12px;">아직 제출한 직원이 없습니다.</span>' : submittedList.map(e => `
                          <span class="badge" style="background:#dcfce7; color:#15803d; border:1px solid #86efac; padding:5px 8px 5px 10px; font-size:12px; border-radius:8px; display:inline-flex; align-items:center; gap:5px;">
                            <strong>${e.name}</strong> <span style="font-size:11px; opacity:0.85;">(${e.role})</span>
                            <i class="fas fa-check-circle text-success" style="font-size:10px;"></i>
                            <button type="button" class="btn btn-sm" onclick="ScheduleModule.rejectMasterSchedule('${e.id}')" title="${e.name} 스케줄 재수정 요청(반려)" style="font-size:10px; padding:1px 5px; border-radius:4px; line-height:1.2; font-weight:bold; background:#fee2e2; color:#dc2626; border:1px solid #fca5a5; margin-left:2px;">
                              반려
                            </button>
                          </span>
                        `).join('')}
                      </div>
                    </div>

                    <!-- 2. 미제출 / 작성중 명단 -->
                    <div class="col-md-6">
                      <div class="d-flex align-items-center gap-2 mb-2">
                        <span class="badge bg-warning text-dark font-bold" style="font-size:11.5px; padding:4px 9px; border-radius:6px;">
                          <i class="fas fa-clock me-1"></i> ⏳ 미제출 · 작성중 (${unsubmittedList.length}명)
                        </span>
                      </div>
                      <div class="d-flex flex-wrap gap-1">
                        ${unsubmittedList.length === 0 ? '<span class="text-success font-bold" style="font-size:12px;">🎉 모든 직원이 제출을 완료했습니다!</span>' : unsubmittedList.map(e => `
                          <span class="badge" style="background:#fff7ed; color:#c2410c; border:1px solid #fed7aa; padding:6px 10px; font-size:12px; border-radius:8px; display:inline-flex; align-items:center; gap:4px;">
                            <strong>${e.name}</strong> <span style="font-size:11px; opacity:0.85;">(${e.role})</span>
                            <i class="fas fa-pencil-alt text-warning" style="font-size:10px;"></i>
                          </span>
                        `).join('')}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div class="d-flex justify-content-between align-items-center flex-wrap gap-3" style="background:#0f172a; padding:16px 20px; border-radius:14px; color:#ffffff; box-shadow:0 4px 14px rgba(15,23,42,0.15);">
                <div class="d-flex align-items-center gap-2">
                  <span class="badge bg-warning text-dark font-bold" style="padding:6px 12px; font-size:12.5px; border-radius:8px;">🔐 약국장 최종 결재</span>
                  <span style="font-size:13.5px; font-weight:700; color:#cbd5e1;">하단 달력에서 인원 겹침/부족(🚨)을 조율한 뒤 확정하세요.</span>
                </div>
                <div class="d-flex gap-2 flex-wrap ms-auto">
                  <button type="button" class="btn btn-sm text-white font-bold" onclick="ScheduleModule.approveMasterSchedule()" style="background:linear-gradient(135deg, #10b981 0%, #059669 100%); border:none; box-shadow:0 4px 12px rgba(16,185,129,0.3); font-size:13.5px; padding:9px 22px; border-radius:10px;">
                    <i class="fas fa-check-circle me-1"></i> 🏆 전체 스케줄 최종 승인 확정
                  </button>
                  <button type="button" class="btn btn-sm text-white font-bold" onclick="ScheduleModule.rejectMasterSchedule()" style="background:linear-gradient(135deg, #ea580c 0%, #c2410c 100%); border:none; box-shadow:0 4px 12px rgba(234,88,12,0.3); font-size:13.5px; padding:9px 22px; border-radius:10px;">
                    <i class="fas fa-undo me-1"></i> ↩️ 개별 스케줄 재수정 요청
                  </button>
                </div>
              </div>
            `;
          }
        })()}
      </div>
<!-- 📅 🚨[위치 변경됨] 월간 근무스케줄 달력 영역 (결재 현황 바로 아래) -->
      ${showCalendar ? `
        <div class="card-section mb-4" style="background:#ffffff; border:1.5px solid #cbd5e1; border-radius:24px; padding:24px; box-shadow:0 12px 35px rgba(15,23,42,0.08);">
          <div class="d-flex justify-content-between align-items-center mb-4 pb-3 border-bottom">
            <h3 style="font-size:18px; font-weight:800; color:#0f172a; margin:0;">
              <i class="fas fa-calendar-alt text-success me-2"></i> ${currentMonth}월 전체 팀원 근무 스케줄 현황
            </h3>
            <span class="badge bg-light text-dark font-bold" style="padding:6px 14px; border-radius:12px; border:1px solid #e2e8f0; font-size:12.5px;">
              <i class="fas fa-mobile-alt text-primary me-1"></i> 날짜 터치 시 수정
            </span>
          </div>
          
          <div class="calendar-scroll-wrapper" style="border-radius:16px; overflow:hidden; border:1.5px solid #e2e8f0;">
            ${renderImage1StyleCalendar(currentYear, currentMonth, employees, scheduleRecords)}
          </div>
        </div>
      ` : ''}
      <!-- 📋 약국장: 전 직원 신청 상세 내역 / 일반 직원: 본인 신청 상세 내역 (날짜·요일·신청시간·실근무시수) -->
      ${(currUser && currUser.role === '약국장') 
        ? renderDirectorSubmittedDetailsCard(currentYear, currentMonth, employees, scheduleRecords) 
        : renderStaffPersonalSubmittedDetailsCard(currentYear, currentMonth, currUser, scheduleRecords)}

      <!-- 📦 2번 통합 박스: 약국장 전용 세무사 제출용 집계표 & 세후 통합명세서 교부 센터 -->
      ${(currUser && currUser.role === '약국장') ? `
        <div class="tax-control-card mb-4" style="background:#ffffff; border:1.5px solid #cbd5e1; border-radius:18px; padding:22px; box-shadow:0 4px 18px rgba(15,23,42,0.05);">
          <div class="d-flex justify-content-between align-items-center flex-wrap gap-3">
            <div class="d-flex align-items-center gap-3">
              <div style="width:42px; height:42px; border-radius:12px; background:#eff6ff; border:1px solid #bfdbfe; color:#2563eb; display:flex; justify-content:center; align-items:center; font-size:19px; flex-shrink:0;">
                <i class="fas fa-file-invoice-dollar"></i>
              </div>
              <div>
                <h3 style="font-size:16.5px; font-weight:800; color:#0f172a; margin:0;">
                  💼 세무사 제출용 ${currentMonth}월 총근무시수 집계표 & 세후 명세서 교부 센터
                </h3>
                <p style="font-size:12.5px; color:#64748b; margin:3px 0 0 0;">세무사에 제출할 급여 집계표를 다운로드하거나, 세무사 검토 후 전달받은 세후 명세서를 업로드하여 교부합니다.</p>
              </div>
            </div>

            <div class="d-flex gap-2 flex-wrap ms-auto">
              <button type="button" class="btn btn-sm text-white font-bold" onclick="ScheduleModule.exportTaxAccountantReport()" style="background:linear-gradient(135deg, #0284c7 0%, #0369a1 100%); border:none; box-shadow:0 4px 12px rgba(2,132,199,0.25); font-size:13.5px; padding:10px 20px; border-radius:10px;">
                <i class="fas fa-file-export me-1"></i> 📤 세무사 제출용 ${currentMonth}월 총근무시수 & 세전급여 집계표
              </button>
              <button type="button" class="btn btn-sm text-white font-bold" onclick="ScheduleModule.openDirectorTaxPaystubModal()" style="background:linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); border:none; box-shadow:0 4px 12px rgba(37,99,235,0.25); font-size:13.5px; padding:10px 20px; border-radius:10px;">
                <i class="fas fa-file-invoice me-1"></i> 📁 세후 세무사통합명세서 등록 및 교부
              </button>
            </div>
          </div>
        </div>
      ` : ''}

      <!-- 💡 팝업창 차단 원천 해결: 인라인 작업 카드 패널 (화면에 직접 바로 펼쳐지는 인라인 작업창) -->
      ${renderInlineWorkPanel(currUser, employees)}
<!-- 💰 [순서 변경 1] 급여 정산표 영역: 스크롤 최소화를 위해 달력 위로 배치 (고급형 UI) -->
      ${(currUser && currUser.role === '약국장') ? renderSettlementDashboard(employees, scheduleRecords) : renderStaffPersonalPaystubSection(currUser)}

    
     
      <!-- 자율 출퇴근 시간 및 OFF(휴무) 설정 모달 -->
      <div class="modal-overlay" id="shift-modal" style="display:none;">
        <div class="modal-card">
          <div class="modal-header">
            <h3>⏰ 근무자별 출퇴근 시간 및 OFF (휴무) 설정</h3>
            <button type="button" class="close-btn" onclick="ScheduleModule.closeShiftModal()">&times;</button>
          </div>
          <div class="modal-body">
            <input type="hidden" id="modal-shift-date">
            
            <div class="form-group">
              <label>근무자 선택</label>
              <select id="modal-shift-empid" class="form-control" onchange="ScheduleModule.onModalEmpChange()">
                ${employees.map(e => `<option value="${e.id}">${e.name} (${e.role} - ${e.position})</option>`).join('')}
              </select>
            </div>

            <div class="form-group">
              <label>근무 / OFF(휴무) 여부 구분</label>
              <div class="role-filter-toggle w-100" style="display: flex;">
                <button type="button" id="btn-shift-mode-work" class="filter-btn active" style="flex:1;" onclick="ScheduleModule.setModalWorkMode(true)">
                  🟢 근무 지정
                </button>
                <button type="button" id="btn-shift-mode-off" class="filter-btn" style="flex:1;" onclick="ScheduleModule.setModalWorkMode(false)">
                  ⚪ OFF (휴무) 지정
                </button>
              </div>
            </div>

            <div id="work-time-fields-group">
              <div class="form-group">
                <label>빠른 기본 조 선택</label>
                <div class="shift-preset-grid">
                  <button type="button" class="btn btn-outline btn-sm font-bold" onclick="ScheduleModule.setPresetTime('09:00', '18:00', 'A')">A조 (09:00~18:00)</button>
                  <button type="button" class="btn btn-outline btn-sm font-bold" onclick="ScheduleModule.setPresetTime('10:00', '22:00', 'B')">B조 (10:00~22:00)</button>
                  <button type="button" class="btn btn-outline btn-sm font-bold" onclick="ScheduleModule.setPresetTime('09:00', '13:00', 'C')">C조 (09:00~13:00)</button>
                  <button type="button" class="btn btn-outline btn-sm font-bold" onclick="ScheduleModule.setPresetTime('13:00', '22:00', 'D')">D조 (13:00~22:00)</button>
                </div>
              </div>

              <div class="form-row my-3">
                <div class="form-group">
                  <label>출근 시간</label>
                  <input type="time" id="modal-start-time" value="09:00">
                </div>
                <div class="form-group">
                  <label>퇴근 시간</label>
                  <input type="time" id="modal-end-time" value="17:30">
                </div>
              </div>

              <div class="form-group my-3">
                <label style="font-weight:700; color:#334155; margin-bottom:6px;">
                  ☕ 휴게시간 설정 (실근무 시수 차감)
                </label>
                <select id="modal-break-hours" class="form-select form-control font-bold" style="border-radius:12px; border:1.5px solid #93c5fd; padding:10px 14px; font-size:14px; color:#1e293b;">
                  <option value="1.0">☕ 1시간 차감 (기본 식사/휴게시간)</option>
                  <option value="0.5">⏱️ 30분 (0.5시간) 차감</option>
                  <option value="0.0">⚡ 0시간 (차감 없음 - 연속 근무)</option>
                </select>
              </div>
            </div>

            <div class="labor-notice-box mb-3">
              <i class="fas fa-utensils"></i> <strong>휴게시간 차감 안내:</strong> 선택하신 휴게시간(1시간 / 30분 / 0시간)이 자동 반영되어 실근무시수 및 월 급여 정산표에 즉시 연동됩니다.
            </div>

            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" onclick="ScheduleModule.closeShiftModal()">취소</button>
              <button type="button" class="btn btn-primary" onclick="ScheduleModule.saveCustomShift()">설정 저장</button>
            </div>
          </div>
        </div>
      </div>
    `;

    // 🔒 가로 스크롤 위치 기억 (좌측 튕김 방지)
    const scrollMap = [];
    const oldTables = container.querySelectorAll('.table-responsive');
    oldTables.forEach((t, i) => {
      scrollMap[i] = t.scrollLeft;
    });

    container.innerHTML = html;

    // 🔒 가로 스크롤 위치 0.01초 내 즉각 복원
    const newTables = container.querySelectorAll('.table-responsive');
    newTables.forEach((t, i) => {
      if (scrollMap[i] !== undefined && scrollMap[i] > 0) {
        t.scrollLeft = scrollMap[i];
      }
    });
  }

// 달력형 뷰 (개인 맞춤화 + 결원 자동 경고 마스터 보드)
  function renderImage1StyleCalendar(year, month, employees, scheduleRecords) {
    const currUser = window.SheetsSync.getCurrentUser();
    const isDirector = currUser && currUser.role === '약국장';

    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDayIndex = new Date(year, month - 1, 1).getDay();

    // 전체 동료 스케줄 상호 열람 지원 (직원 및 약국장 모두 동료들의 근무시간을 확인하여 조율 가능)
    let filteredEmployees = employees;
    if (roleFilter === 'pharmacist') {
      filteredEmployees = employees.filter(e => e.role.includes('약사') || e.role === '약국장');
    }

   // 🚨 모바일 달력 짤림 방지: 칸 강제 조절 및 텍스트 넘침 방지 스타일 적용
    let gridHtml = `
      <div class="roster-image1-calendar" style="display:grid; grid-template-columns:repeat(7, minmax(0, 1fr)); width:100%; table-layout:fixed; word-break:break-all;">
    `;
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

    dayNames.forEach((d, idx) => {
      gridHtml += `<div class="img1-cal-header ${idx === 0 ? 'text-danger' : (idx === 6 ? 'text-primary' : '')}" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${d}</div>`;
    });

    for (let i = 0; i < firstDayIndex; i++) {
      gridHtml += `<div class="img1-cal-cell empty-cell"></div>`;
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const multInfo = window.LaborCalculator.getDateMultiplierInfo(dateStr);
      const d = new Date(dateStr);
      const isSun = d.getDay() === 0;
      const isSat = d.getDay() === 6;

      let holidayLabel = '';
      if (multInfo.isHoliday && !isSun && !isSat) {
        holidayLabel = multInfo.label.replace('공휴일 (', '').replace(')', '');
      }

      // 🚨 결원 체크 로직 (약국장에게만 작동)
      let isWarning = false;
      let workingPharmacistCount = 0;
      
      if (isDirector) {
        employees.forEach(emp => {
          if (emp.role.includes('약사')) {
            const rec = scheduleRecords.find(r => r.empId === emp.id && r.date === dateStr);
            if (rec && rec.shift && rec.shift !== 'OFF') {
              workingPharmacistCount++;
            }
          }
        });
        // 공휴일 및 일요일은 약사 1명 이상이면 정상 (0명일 때만 경고)
        // 평일/토요일은 약사 1명 이하(0~1명)일 때 경고
        const isHolidayOrSun = isSun || multInfo.isHoliday;
        if (isHolidayOrSun) {
          if (workingPharmacistCount < 1) {
            isWarning = true;
          }
        } else {
          if (workingPharmacistCount <= 1) {
            isWarning = true;
          }
        }
      }

      gridHtml += `
        <div class="img1-cal-cell ${multInfo.isHoliday ? 'is-holiday-cell' : ''}" style="${isWarning ? 'background-color: #fef2f2; border: 1.5px solid #fca5a5;' : ''}">
          <div class="img1-day-top">
            <div>
              <span class="img1-day-num ${isSun || multInfo.isHoliday ? 'text-danger' : (isSat ? 'text-primary' : '')}">${day}</span>
              ${holidayLabel ? `<span class="img1-holiday-tag">${holidayLabel}</span>` : ''}
            </div>
            ${isWarning ? `<span class="badge bg-danger" style="font-size:10px; animation: blink 1.5s infinite;">🚨 인원 부족</span>` : ''}
          </div>

          <div class="img1-staff-badge-stack">
            ${filteredEmployees.map((emp, idx) => {
              const rec = scheduleRecords.find(r => r.empId === emp.id && r.date === dateStr);
              const shift = rec ? rec.shift : 'OFF';

              if (shift === 'OFF' || !shift) {
                if (!showOffStaff) return '';
                return `
                  <div class="img1-staff-pill badge-off" 
                       onclick="ScheduleModule.openShiftModal('${dateStr}', '${emp.id}', '${emp.name}', 'OFF')"
                       title="${emp.name} (OFF/휴무)">
                    <span class="pill-name">${emp.name}</span>
                    <span class="pill-time-tag">⚪ OFF</span>
                  </div>
                `;
              }

              const colorClass = getStaffColorClass(emp.name, idx);
              const timeTag = formatShiftShortTime(shift, rec ? rec.startTime : '', rec ? rec.endTime : '');
              const fullTimeDisplay = (rec && rec.startTime) ? `${rec.startTime}~${rec.endTime}` : emp.name;

              return `
                <div class="img1-staff-pill ${colorClass}" 
                     onclick="ScheduleModule.openShiftModal('${dateStr}', '${emp.id}', '${emp.name}', '${shift}')"
                     title="${emp.name} ${fullTimeDisplay}">
                  <span class="pill-name">${emp.name}</span>
                  <span class="pill-time-tag">${timeTag}</span>
                </div>
              `;
            }).join('')}
          </div>

          <div class="img1-add-btn" onclick="ScheduleModule.openShiftModal('${dateStr}', '${isDirector ? '' : (currUser ? currUser.id : '')}', '', 'A')" title="스케줄 설정">+ 스케줄 기입</div>
        </div>
      `;
    }

    gridHtml += '</div>';
    
    if (!document.getElementById('warning-blink-style')) {
      gridHtml += `<style id="warning-blink-style">@keyframes blink { 50% { opacity: 0.5; } }</style>`;
    }
    
    return gridHtml;
  }
  function toggleEmployeeAccordion(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const isShown = el.classList.contains('show') && el.style.display !== 'none';
    const chevron = document.getElementById('chev-' + id);
    if (isShown) {
      el.classList.remove('show');
      el.style.display = 'none';
      if (chevron) chevron.className = 'fas fa-chevron-down';
    } else {
      el.classList.add('show');
      el.style.display = 'block';
      if (chevron) chevron.className = 'fas fa-chevron-up';
    }
  }

  function renderDirectorSubmittedDetailsCard(year, month, employees, scheduleRecords) {
    if (!showSubmittedDetails) {
      return `
        <div class="card mb-4 shadow-sm" style="border-radius:18px; border:1.5px solid #cbd5e1; background:#ffffff; overflow:hidden;">
          <div class="card-header d-flex justify-content-between align-items-center flex-wrap gap-2" style="background:#0f172a; color:#ffffff; padding:14px 22px;">
            <div class="d-flex align-items-center gap-2">
              <span class="badge bg-warning text-dark font-bold" style="padding:6px 12px; font-size:12px; border-radius:8px;">🔐 약국장 전용</span>
              <h3 style="font-size:16px; font-weight:800; margin:0; color:#ffffff;">
                📋 ${month}월 전 직원 신청 근무 스케줄 상세 내역 (날짜·요일·시간·실근무시수)
              </h3>
            </div>
            <button type="button" class="btn btn-sm btn-outline-light font-bold" onclick="ScheduleModule.toggleSubmittedDetails()" style="border-radius:10px; padding:6px 16px; font-size:13px;">
              <i class="fas fa-chevron-down me-1"></i> 상세 내역 펼치기 ▼
            </button>
          </div>
        </div>
      `;
    }

    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

    const employeeDetails = employees.map(emp => {
      const empRecords = scheduleRecords.filter(r => r.empId === emp.id && r.date && r.date.startsWith(monthKey) && r.shift !== 'OFF');
      empRecords.sort((a, b) => a.date.localeCompare(b.date));

      let totalNetHours = 0;
      let weekdayHours = 0;
      let holidayHours = 0;

      const list = empRecords.map(rec => {
        const d = new Date(rec.date);
        const dayOfWeek = dayNames[d.getDay()];
        const multInfo = window.LaborCalculator ? window.LaborCalculator.getDateMultiplierInfo(rec.date) : { isHoliday: false };
        const isSun = d.getDay() === 0;
        const isSat = d.getDay() === 6;
        const isWeekendOrHoliday = isSun || isSat || multInfo.isHoliday;

        const recBreak = (rec.breakHours !== undefined && rec.breakHours !== null && !isNaN(rec.breakHours)) ? Number(rec.breakHours) : 1.0;
        const netH = window.LaborCalculator.calculateShiftNetHours(rec.startTime, rec.endTime, rec.shift, recBreak);
        totalNetHours += netH;
        if (isWeekendOrHoliday) {
          holidayHours += netH;
        } else {
          weekdayHours += netH;
        }

        return {
          date: rec.date,
          dayOfWeek,
          shift: rec.shift,
          startTime: rec.startTime || '09:00',
          endTime: rec.endTime || '18:00',
          breakHours: recBreak,
          netHours: netH
        };
      });

      return {
        emp,
        records: list,
        totalNetHours: Math.round(totalNetHours * 10) / 10,
        weekdayHours: Math.round(weekdayHours * 10) / 10,
        holidayHours: Math.round(holidayHours * 10) / 10
      };
    });

    return `
      <div class="card mb-4 shadow-sm" style="border-radius:18px; border:1.5px solid #cbd5e1; background:#ffffff; overflow:hidden;">
        <div class="card-header d-flex justify-content-between align-items-center flex-wrap gap-2" style="background:#0f172a; color:#ffffff; padding:16px 22px;">
          <div class="d-flex align-items-center gap-2">
            <span class="badge bg-warning text-dark font-bold" style="padding:6px 12px; font-size:12.5px; border-radius:8px;">🔐 약국장 전용</span>
            <h3 style="font-size:16.5px; font-weight:800; margin:0; color:#ffffff;">
              📋 ${month}월 전 직원 신청 근무 스케줄 상세 내역 (날짜·요일·시간·실근무시수)
            </h3>
          </div>
          <div class="d-flex align-items-center gap-3">
            <span style="font-size:12.5px; color:#cbd5e1;" class="d-none d-md-inline">전체 ${employees.length}인 자율 제출 상세 명단</span>
            <button type="button" class="btn btn-sm btn-outline-light font-bold" onclick="ScheduleModule.toggleSubmittedDetails()" style="border-radius:10px; padding:6px 16px; font-size:13px;">
              <i class="fas fa-chevron-up me-1"></i> 상세 내역 접기 ▲
            </button>
          </div>
        </div>

        <div class="card-body" style="padding:20px;">
          <div class="accordion" id="directorSubmittedScheduleAccordion">
            ${employeeDetails.map((item, idx) => {
              const emp = item.emp;
              const isPharmacist = emp.role.includes('약사') || emp.role === '약국장';
              const roleBadge = isPharmacist ? '💊 근무약사' : '💻 일반직원';
              const roleBg = isPharmacist ? '#dbeafe' : '#dcfce7';
              const roleColor = isPharmacist ? '#1e40af' : '#15803d';
              const hasRecords = item.records.length > 0;

              return `
                <div class="accordion-item mb-3" style="border:1.5px solid #e2e8f0; border-radius:14px; overflow:hidden; background:#ffffff;">
                  <h2 class="accordion-header" id="heading-${emp.id}" style="margin:0;">
                    <button class="accordion-button ${hasRecords ? '' : 'collapsed'}" type="button" onclick="ScheduleModule.toggleEmployeeAccordion('collapse-${emp.id}')" style="background:#f8fafc; font-size:14px; font-weight:700; padding:14px 18px; box-shadow:none; cursor:pointer; width:100%; border:none; text-align:left; display:block;">
                      <div class="d-flex justify-content-between align-items-center w-100 flex-wrap gap-2">
                        <div class="d-flex align-items-center gap-2 flex-wrap">
                          <span style="font-size:15px; font-weight:800; color:#0f172a; white-space:nowrap;">👤 ${emp.name} (${emp.position || emp.role})</span>
                          <span style="background:${roleBg}; color:${roleColor}; font-size:11.5px; padding:3px 8px; border-radius:6px; font-weight:700; white-space:nowrap;">${roleBadge}</span>
                        </div>
                        <div class="d-flex align-items-center gap-2 flex-wrap ms-auto">
                          <span style="font-size:13px; color:#475569; white-space:nowrap;">신청 근무일수: <strong style="color:#0f172a;">${item.records.length}일</strong></span>
                          <span style="font-size:13px; color:#1d4ed8; font-weight:800; background:#eff6ff; padding:4px 12px; border-radius:8px; border:1px solid #bfdbfe; white-space:nowrap; display:inline-block;">
                            ⏱️ 당월 신청 총시수: <strong>${item.totalNetHours}h</strong> <span style="font-size:12px; color:#475569; font-weight:600; margin-left:4px;">(평일: <strong style="color:#2563eb;">${item.weekdayHours}h</strong> / 주말·공휴: <strong style="color:#dc2626;">${item.holidayHours}h</strong>)</span>
                          </span>
                          <i id="chev-collapse-${emp.id}" class="fas ${hasRecords ? 'fa-chevron-up' : 'fa-chevron-down'}" style="color:#64748b; margin-left:8px;"></i>
                        </div>
                      </div>
                    </button>
                  </h2>
                  <div id="collapse-${emp.id}" class="accordion-collapse ${hasRecords ? 'show' : ''}" style="${hasRecords ? 'display:block;' : 'display:none;'}">
                    <div class="accordion-body p-0">
                      ${item.records.length === 0 ? `
                        <div class="p-3 text-center text-muted" style="font-size:13px;">등록된 근무 신청 내역이 없습니다. (ALL OFF)</div>
                      ` : `
                        <div class="table-responsive">
                          <table class="table table-sm table-striped align-middle mb-0" style="font-size:13px;">
                            <thead style="background:#f1f5f9; color:#334155;">
                              <tr>
                                <th style="text-align:center; padding:10px 12px; width:130px; white-space:nowrap;">근무 일자</th>
                                <th style="text-align:center; padding:10px 8px; width:80px; white-space:nowrap;">요일</th>
                                <th style="text-align:center; padding:10px 12px; width:180px; white-space:nowrap;">신청 출퇴근 시간</th>
                                <th style="text-align:center; padding:10px 10px; width:150px; white-space:nowrap;">휴게시간 차감</th>
                                <th style="text-align:right; padding:10px 18px; width:130px; white-space:nowrap;">실근무 시수</th>
                              </tr>
                            </thead>
                            <tbody>
                              ${item.records.map(r => `
                                <tr>
                                  <td style="text-align:center; font-weight:700; color:#1e293b; white-space:nowrap;">${r.date}</td>
                                  <td style="text-align:center; white-space:nowrap;">
                                    <span class="${r.dayOfWeek === '일' ? 'text-danger font-bold' : (r.dayOfWeek === '토' ? 'text-primary font-bold' : 'text-dark')}">
                                      ${r.dayOfWeek}요일
                                    </span>
                                  </td>
                                  <td style="text-align:center; font-weight:700; color:#2563eb; white-space:nowrap;">${r.startTime} ~ ${r.endTime}</td>
                                  <td style="text-align:center; color:#475569; white-space:nowrap;">
                                    ${r.breakHours === 0.5 ? '<span class="badge bg-warning text-dark" style="font-size:11.5px; padding:4px 8px;">⏱️ 30분</span>' : (r.breakHours === 0 ? '<span class="badge bg-success" style="font-size:11.5px; padding:4px 8px;">⚡ 0시간 (차감없음)</span>' : '<span class="badge bg-light text-dark" style="border:1px solid #cbd5e1; font-size:11.5px; padding:4px 8px;">☕ 1시간</span>')}
                                  </td>
                                  <td style="text-align:right; font-weight:800; color:#15803d; padding-right:18px; white-space:nowrap;">${r.netHours}시간</td>
                                </tr>
                              `).join('')}
                            </tbody>
                          </table>
                        </div>
                      `}
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;
  }

  function renderStaffPersonalSubmittedDetailsCard(year, month, currUser, scheduleRecords) {
    if (!currUser) return '';

    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

    const empRecords = (scheduleRecords || []).filter(r => r.empId === currUser.id && r.date && r.date.startsWith(monthKey) && r.shift !== 'OFF');
    empRecords.sort((a, b) => a.date.localeCompare(b.date));

    let totalNetHours = 0;
    let weekdayHours = 0;
    let holidayHours = 0;

    const list = empRecords.map(rec => {
      const d = new Date(rec.date);
      const dayOfWeek = dayNames[d.getDay()];
      const multInfo = window.LaborCalculator ? window.LaborCalculator.getDateMultiplierInfo(rec.date) : { isHoliday: false };
      const isSun = d.getDay() === 0;
      const isSat = d.getDay() === 6;
      const isWeekendOrHoliday = isSun || isSat || multInfo.isHoliday;

      const recBreak = (rec.breakHours !== undefined && rec.breakHours !== null && !isNaN(rec.breakHours)) ? Number(rec.breakHours) : 1.0;
      const netH = window.LaborCalculator.calculateShiftNetHours(rec.startTime, rec.endTime, rec.shift, recBreak);
      totalNetHours += netH;
      if (isWeekendOrHoliday) {
        holidayHours += netH;
      } else {
        weekdayHours += netH;
      }

      return {
        date: rec.date,
        dayOfWeek,
        shift: rec.shift,
        startTime: rec.startTime || '09:00',
        endTime: rec.endTime || '18:00',
        breakHours: recBreak,
        netHours: netH
      };
    });

    totalNetHours = Math.round(totalNetHours * 10) / 10;
    weekdayHours = Math.round(weekdayHours * 10) / 10;
    holidayHours = Math.round(holidayHours * 10) / 10;

    return `
      <div class="card mb-4 shadow-sm" style="border-radius:18px; border:1.5px solid #bfdbfe; background:#ffffff; overflow:hidden;">
        <div class="card-header d-flex justify-content-between align-items-center flex-wrap gap-2" style="background:linear-gradient(135deg, #1e40af 0%, #1d4ed8 100%); color:#ffffff; padding:16px 22px;">
          <div class="d-flex align-items-center gap-2">
            <span class="badge bg-light text-primary font-bold" style="padding:6px 12px; font-size:12.5px; border-radius:8px;">👤 ${currUser.name} 님 전용</span>
            <h3 style="font-size:16.5px; font-weight:800; margin:0; color:#ffffff;">
              📋 ${month}월 본인 신청 근무 스케줄 상세 내역 (날짜·요일·시간·실근무시수)
            </h3>
          </div>
          <div class="d-flex align-items-center gap-2 flex-wrap ms-auto">
            <span style="font-size:13px; color:#e0e7ff; white-space:nowrap;">신청 근무일수: <strong style="color:#ffffff;">${list.length}일</strong></span>
            <span style="font-size:13px; color:#1e40af; font-weight:800; background:#ffffff; padding:4px 12px; border-radius:8px; white-space:nowrap; display:inline-block;">
              ⏱️ 당월 총시수: <strong>${totalNetHours}h</strong> <span style="font-size:12px; color:#475569; font-weight:600; margin-left:4px;">(평일: <strong style="color:#2563eb;">${weekdayHours}h</strong> / 주말·공휴: <strong style="color:#dc2626;">${holidayHours}h</strong>)</span>
            </span>
          </div>
        </div>

        <div class="card-body p-0">
          ${list.length === 0 ? `
            <div class="p-4 text-center text-muted" style="font-size:13.5px;">
              <i class="fas fa-calendar-times mb-2" style="font-size:24px; color:#94a3b8; display:block;"></i>
              등록된 본인의 근무 신청 내역이 없습니다. (상단 달력에서 <strong>[+ 스케줄 기입]</strong>을 눌러 근무 일정을 등록해주세요.)
            </div>
          ` : `
            <div class="table-responsive">
              <table class="table table-sm table-striped align-middle mb-0" style="font-size:13px;">
                <thead style="background:#f1f5f9; color:#334155;">
                  <tr>
                    <th style="text-align:center; padding:10px 12px; width:130px; white-space:nowrap;">근무 일자</th>
                    <th style="text-align:center; padding:10px 8px; width:80px; white-space:nowrap;">요일</th>
                    <th style="text-align:center; padding:10px 12px; width:180px; white-space:nowrap;">신청 출퇴근 시간</th>
                    <th style="text-align:center; padding:10px 10px; width:150px; white-space:nowrap;">휴게시간 차감</th>
                    <th style="text-align:right; padding:10px 18px; width:130px; white-space:nowrap;">실근무 시수</th>
                  </tr>
                </thead>
                <tbody>
                  ${list.map(r => `
                    <tr>
                      <td style="text-align:center; font-weight:700; color:#1e293b; white-space:nowrap;">${r.date}</td>
                      <td style="text-align:center; white-space:nowrap;">
                        <span class="${r.dayOfWeek === '일' ? 'text-danger font-bold' : (r.dayOfWeek === '토' ? 'text-primary font-bold' : 'text-dark')}">
                          ${r.dayOfWeek}요일
                        </span>
                      </td>
                      <td style="text-align:center; font-weight:700; color:#2563eb; white-space:nowrap;">${r.startTime} ~ ${r.endTime}</td>
                      <td style="text-align:center; color:#475569; white-space:nowrap;">
                        ${r.breakHours === 0.5 ? '<span class="badge bg-warning text-dark" style="font-size:11.5px; padding:4px 8px;">⏱️ 30분</span>' : (r.breakHours === 0 ? '<span class="badge bg-success" style="font-size:11.5px; padding:4px 8px;">⚡ 0시간 (차감없음)</span>' : '<span class="badge bg-light text-dark" style="border:1px solid #cbd5e1; font-size:11.5px; padding:4px 8px;">☕ 1시간</span>')}
                      </td>
                      <td style="text-align:right; font-weight:800; color:#15803d; padding-right:18px; white-space:nowrap;">${r.netHours}시간</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>
      </div>
    `;
  }

  function computeItemizedPaystubBreakdown(currUser, paystub) {
    const netSalary = paystub ? (paystub.netSalary || 0) : 0;
    const totalDeduction = paystub ? (paystub.totalDeduction || 0) : 0;
    const preTaxTotal = (paystub && paystub.preTax) ? paystub.preTax : (netSalary + totalDeduction);

    const monthKey = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
    const allAdjustments = (window.SheetsSync && window.SheetsSync.getOvertimeAdjustments) ? window.SheetsSync.getOvertimeAdjustments() : {};
    const empAdj = (currUser && allAdjustments[monthKey] && allAdjustments[monthKey][currUser.id]) || { mealAllowance: 200000, overtimePay: 0, deductionPay: 0 };

    const isPharmacist = currUser && (currUser.role === '근무약사' || (currUser.role || '').includes('약사'));

    // 식대 (설정된 값 또는 기본 20만원)
    const mealAllowance = empAdj.mealAllowance !== undefined ? Number(empAdj.mealAllowance) : (preTaxTotal > 200000 ? 200000 : 0);
    const overtimePay = Number(empAdj.overtimePay) || 0;

    let baseSalary = 0;
    if (preTaxTotal > 0) {
      baseSalary = Math.max(0, preTaxTotal - mealAllowance - overtimePay);
    }

    const taxableBase = Math.max(0, preTaxTotal - mealAllowance);

    let pension = Math.round(taxableBase * 0.045);
    let health = Math.round(taxableBase * 0.03545);
    let longterm = Math.round(health * 0.1295);
    let employment = Math.round(taxableBase * 0.009);

    let total4Ins = pension + health + longterm + employment;
    let taxRem = Math.max(0, totalDeduction - total4Ins);

    let incomeTax = Math.round(taxRem * 0.909);
    let localTax = taxRem - incomeTax;

    return {
      preTaxTotal,
      baseSalary,
      mealAllowance,
      overtimePay,
      totalDeduction,
      pension,
      health,
      longterm,
      employment,
      incomeTax,
      localTax,
      netSalary
    };
  }

  // 📄 세무사 공식 '급상여명세서' 100% 동일 양식 렌더러 (좌우 2열 대칭 구조)
  function renderOfficialTaxPayslipHtml(emp, paystub, year, month) {
    const itemized = computeItemizedPaystubBreakdown(emp, paystub);
    const lastDayOfMonth = new Date(year, month, 0).getDate();
    const payDateStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}`;

    return `
      <div class="official-payslip-doc p-4" style="background:#ffffff; border:1.5px solid #cbd5e1; border-radius:18px; box-shadow:0 4px 18px rgba(15,23,42,0.04); font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color:#0f172a;">
        
        <!-- 1. 문서 헤더 타이틀 -->
        <div class="text-center mb-3 pb-2">
          <h2 style="font-size:22px; font-weight:800; color:#0f172a; margin:0 0 8px 0; letter-spacing:2px;">
            ${year}년 ${String(month).padStart(2, '0')}월분 급상여명세서
          </h2>
          <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 px-2" style="font-size:13.5px; font-weight:600; color:#475569;">
            <span>회사명 : <strong>신세계약국</strong></span>
            <span>지 급 일 : <strong style="font-family:'Outfit', sans-serif;">${payDateStr}</strong></span>
          </div>
        </div>

        <!-- 2. 사원 인적 사항 그리드 박스 -->
        <div class="mb-3" style="border:1px solid #cbd5e1; background:#f8fafc; font-size:13px;">
          <div class="row g-0 border-bottom">
            <div class="col-4 p-2 border-end">사원코드 : <strong style="font-family:'Outfit', sans-serif;">${(emp.id || '').replace(/[^0-9]/g, '') || '01'}</strong></div>
            <div class="col-4 p-2 border-end">사 원 명 : <strong>${emp.name}</strong></div>
            <div class="col-4 p-2">입 사 일 : <strong style="font-family:'Outfit', sans-serif;">${emp.joinDate || '-'}</strong></div>
          </div>
          <div class="row g-0">
            <div class="col-4 p-2 border-end">부 서 : <strong>${emp.role || '약국부'}</strong></div>
            <div class="col-4 p-2 border-end">직 위 : <strong>${emp.position || '직원'}</strong></div>
            <div class="col-4 p-2">호 봉 : <strong>-</strong></div>
          </div>
        </div>

        <!-- 3. 좌우 2열 대칭 [지급 내역 vs 공제 내역] 테이블 -->
        <div class="table-responsive mb-3" style="border:1.5px solid #cbd5e1; border-radius:10px; overflow:hidden;">
          <table class="table mb-0 align-middle" style="font-size:13.5px;">
            <thead style="background:#f1f5f9; border-bottom:2px solid #cbd5e1; font-weight:800; color:#1e293b;">
              <tr>
                <th style="width:28%; padding:10px 14px;">지 급 내 역</th>
                <th style="width:22%; text-align:right; padding:10px 14px; border-end:2px solid #cbd5e1;">지 급 액</th>
                <th style="width:28%; padding:10px 14px;">공 제 내 역</th>
                <th style="width:22%; text-align:right; padding:10px 14px;">공 제 액</th>
              </tr>
            </thead>
            <tbody>
              <!-- Row 1: 기본급 vs 국민연금 -->
              <tr style="border-bottom:1px solid #f1f5f9;">
                <td style="padding:9px 14px; font-weight:600;">기본급</td>
                <td style="padding:9px 14px; text-align:right; font-family:'Outfit', sans-serif; font-weight:700; border-end:2px solid #cbd5e1;">
                  ${itemized.baseSalary.toLocaleString()}
                </td>
                <td style="padding:9px 14px; font-weight:600;">국민연금</td>
                <td style="padding:9px 14px; text-align:right; font-family:'Outfit', sans-serif; font-weight:700;">
                  ${itemized.pension.toLocaleString()}
                </td>
              </tr>

              <!-- Row 2: 식대 vs 건강보험 -->
              <tr style="border-bottom:1px solid #f1f5f9;">
                <td style="padding:9px 14px; font-weight:600;">식대</td>
                <td style="padding:9px 14px; text-align:right; font-family:'Outfit', sans-serif; font-weight:700; border-end:2px solid #cbd5e1;">
                  ${itemized.mealAllowance.toLocaleString()}
                </td>
                <td style="padding:9px 14px; font-weight:600;">건강보험</td>
                <td style="padding:9px 14px; text-align:right; font-family:'Outfit', sans-serif; font-weight:700;">
                  ${itemized.health.toLocaleString()}
                </td>
              </tr>

              <!-- Row 3: 추가수당(발생 시) vs 장기요양보험료 -->
              <tr style="border-bottom:1px solid #f1f5f9;">
                <td style="padding:9px 14px; font-weight:600;">
                  ${itemized.overtimePay > 0 ? '<strong style="color:#2563eb;">추가수당</strong>' : ''}
                </td>
                <td style="padding:9px 14px; text-align:right; font-family:'Outfit', sans-serif; font-weight:700; border-end:2px solid #cbd5e1;">
                  ${itemized.overtimePay > 0 ? `<span style="color:#2563eb;">${itemized.overtimePay.toLocaleString()}</span>` : ''}
                </td>
                <td style="padding:9px 14px; font-weight:600;">장기요양보험료</td>
                <td style="padding:9px 14px; text-align:right; font-family:'Outfit', sans-serif; font-weight:700;">
                  ${itemized.longterm.toLocaleString()}
                </td>
              </tr>

              <!-- Row 4: 공란 vs 고용보험 -->
              <tr style="border-bottom:1px solid #f1f5f9;">
                <td style="padding:9px 14px;"></td>
                <td style="padding:9px 14px; border-end:2px solid #cbd5e1;"></td>
                <td style="padding:9px 14px; font-weight:600;">고용보험</td>
                <td style="padding:9px 14px; text-align:right; font-family:'Outfit', sans-serif; font-weight:700;">
                  ${itemized.employment.toLocaleString()}
                </td>
              </tr>

              <!-- Row 5: 공란 vs 소득세 -->
              <tr style="border-bottom:1px solid #f1f5f9;">
                <td style="padding:9px 14px;"></td>
                <td style="padding:9px 14px; border-end:2px solid #cbd5e1;"></td>
                <td style="padding:9px 14px; font-weight:600;">소득세</td>
                <td style="padding:9px 14px; text-align:right; font-family:'Outfit', sans-serif; font-weight:700;">
                  ${itemized.incomeTax.toLocaleString()}
                </td>
              </tr>

              <!-- Row 6: 공란 vs 지방소득세 -->
              <tr style="border-bottom:2px solid #cbd5e1;">
                <td style="padding:9px 14px;"></td>
                <td style="padding:9px 14px; border-end:2px solid #cbd5e1;"></td>
                <td style="padding:9px 14px; font-weight:600;">지방소득세</td>
                <td style="padding:9px 14px; text-align:right; font-family:'Outfit', sans-serif; font-weight:700;">
                  ${itemized.localTax.toLocaleString()}
                </td>
              </tr>

              <!-- Subtotal Row: 지급액 계 vs 공제액 계 -->
              <tr style="background:#f8fafc; font-weight:800; font-size:14.5px;">
                <td style="padding:11px 14px; color:#1e40af;">지 급 액 계</td>
                <td style="padding:11px 14px; text-align:right; color:#1d4ed8; font-family:'Outfit', sans-serif; border-end:2px solid #cbd5e1;">
                  ${itemized.preTaxTotal.toLocaleString()}
                </td>
                <td style="padding:11px 14px; color:#991b1b;">공 제 액 계</td>
                <td style="padding:11px 14px; text-align:right; color:#b91c1c; font-family:'Outfit', sans-serif;">
                  ${itemized.totalDeduction.toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- 4. 최하단 실지급액 (차인지급액) 바 -->
        <div class="d-flex justify-content-between align-items-center p-3" style="background:linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%); border:2px solid #10b981; border-radius:12px;">
          <span style="font-size:15px; font-weight:800; color:#065f46;">
            💰 실 지 급 액 (차인지급액 = 지급액 계 - 공제액 계)
          </span>
          <strong style="font-size:22px; font-weight:800; color:#047857; font-family:'Outfit', sans-serif;">
            ${itemized.netSalary.toLocaleString()} 원
          </strong>
        </div>
      </div>
    `;
  }

  function renderStaffPersonalPaystubSection(currUser) {
    if (!currUser) return '';

    return `
      <div class="card-section mt-4 mb-5" style="background:#ffffff; border:1.5px solid #e2e8f0; border-radius:18px; padding:24px; box-shadow:0 4px 15px rgba(0,0,0,0.03);">
        <div class="d-flex align-items-center gap-3">
          <div style="width:48px; height:48px; border-radius:14px; background:#eff6ff; color:#2563eb; display:flex; justify-content:center; align-items:center; font-size:22px; flex-shrink:0;">
            <i class="fas fa-shield-alt"></i>
          </div>
          <div>
            <h4 style="font-size:16px; font-weight:800; color:#0f172a; margin:0;">🔒 급여명세서 개인정보 보호 안내</h4>
            <p style="font-size:13.5px; color:#64748b; margin:4px 0 0 0; line-height:1.5;">
              약국 공용 기기 보안 및 개인 금융정보 보호를 위해, 확정 급여명세서는 <strong>${currUser.name} 님의 등록된 개인 이메일(${currUser.email || '-'})</strong>로 안전하게 1:1 발송됩니다.
            </p>
          </div>
        </div>
      </div>
    `;
  }

  function renderSettlementDashboard(employees, scheduleRecords) {
    const currUser = window.SheetsSync.getCurrentUser();
    const isDirector = currUser && currUser.role === '약국장';

    const pharmacists = employees.filter(e => (e.role === '근무약사' || (e.role.includes('약사') && e.role !== '약국장')) && e.role !== '예비인력' && e.name !== '이정은' && e.name !== '주찬양');
    const staffMembers = employees.filter(e => {
      if (!e || !e.name) return false;
      if (e.role.includes('약사') || e.role === '약국장') return false;
      if (e.name.includes('이정은') || e.name.includes('테스트')) return false;
      // 예비인력 중 '간영자' / '간명자' 님은 일반직원 급여 정산표에 기본 등재!
      if (e.name.includes('간영자') || e.name.includes('간명자')) return true;
      return e.role !== '예비인력';
    });

    const monthKey = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
    let allSchedules = scheduleRecords || [];

    if (allSchedules.filter(r => r.date && r.date.startsWith(monthKey)).length === 0 && window.SheetsSync && window.SheetsSync.generateScheduleForMonth) {
      const generated = window.SheetsSync.generateScheduleForMonth(currentYear, currentMonth);
      allSchedules = [...allSchedules, ...generated];
      window.SheetsSync.saveSchedule(allSchedules);
    }

    const monthPaystubs = (window.SheetsSync.getPaystubs ? window.SheetsSync.getPaystubs() : {})[monthKey] || {};
    const monthAdj = (window.SheetsSync.getOvertimeAdjustments ? window.SheetsSync.getOvertimeAdjustments() : {})[monthKey] || {};
    const pRatesMap = window.SheetsSync.getPharmacistRates ? window.SheetsSync.getPharmacistRates() : {};

    // 🔗 권명주 약사님 총 시수 산출액 실시간 계산 (간영자 님 급여 자동 연동용)
    const kwonEmpObj = employees.find(e => e.name === '권명주');
    let kwonTotalPayroll = 0;
    if (kwonEmpObj) {
      const kwonShifts = allSchedules.filter(r => r.empId === kwonEmpObj.id && r.date && r.date.startsWith(monthKey));
      const kwonRateObj = pRatesMap[kwonEmpObj.id] || {};
      const kwonWkRate = Number(kwonEmpObj.weekdayRate) || Number(kwonEmpObj.hourlyRate) || Number(kwonRateObj.weekdayRate) || 40000;
      const kwonHolRate = Number(kwonEmpObj.holidayRate) || Number(kwonRateObj.holidayRate) || 40000;
      const kwonBreak = Number(kwonRateObj.breakHours) || 1.0;
      const kwonCalc = window.LaborCalculator.calculatePharmacistPayroll(kwonShifts, kwonWkRate, kwonHolRate, kwonBreak);
      kwonTotalPayroll = kwonCalc.totalPayroll;
    }

    let html = `
      <!-- 1. 근무약사 급여 정산표 -->
      <div class="card-section mb-6">
        <div class="section-title-bar">
          <div>
            <h3><i class="fas fa-user-md text-warning"></i> 근무약사 급여 정산표 (${currentYear}년 ${currentMonth}월)</h3>
            <span class="text-muted">📜 약정시급 + 비과세 식대 + 추가수당/공제삭감 직접입력 세전총급여 집계표</span>
          </div>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; background:#eff6ff; border:1px solid #bfdbfe; border-bottom:none; color:#1e40af; padding:8px 14px; border-radius:12px 12px 0 0; font-size:12px; font-weight:bold;">
          <span><i class="fas fa-calculator"></i> 근무약사 월간 세전 급여 정산 (약국장 직접 수정 가능)</span>
          <span style="color:#2563eb;"><i class="fas fa-arrows-alt-h"></i> 화면이좁을 경우 좌우로 스크롤 가능</span>
        </div>
        <div class="table-responsive" style="overflow-x:auto; -webkit-overflow-scrolling:touch; border-radius:0 0 14px 14px; border:1px solid #cbd5e1; width:100%; background:#fff; margin-bottom:20px; box-shadow:0 2px 8px rgba(0,0,0,0.04);">
          <table class="data-table align-middle" style="width:100%; font-size:13px;">
            <thead>
              <tr style="background:#f8fafc; border-bottom:2px solid #cbd5e1;">
                <th style="width:85px; text-align:center; padding:10px 8px; white-space:nowrap;">약사명</th>
                <th style="width:85px; text-align:center; padding:10px 8px; white-space:nowrap;">직책</th>
                <th style="width:150px; text-align:center; padding:10px 8px; white-space:nowrap;">확정 근로시수</th>
                <th style="width:125px; text-align:right; padding:10px 10px; white-space:nowrap;">평일 산출금액</th>
                <th style="width:135px; background:#fff7ed; color:#c2410c; text-align:right; padding:10px 10px; white-space:nowrap;">주말/공휴일 산출</th>
                <th style="width:115px; text-align:right; padding:10px 10px; white-space:nowrap;">비과세 식대</th>
                <th style="width:105px; text-align:right; padding:10px 10px; white-space:nowrap;">추가 수당</th>
                <th style="width:105px; text-align:right; padding:10px 10px; white-space:nowrap;">공제 삭감</th>
                <th style="width:145px; text-align:right; padding:10px 10px; white-space:nowrap;">월 세전 총급여액</th>
                <th style="width:105px; text-align:center; padding:10px 8px; white-space:nowrap;">명세서 교부</th>
              </tr>
            </thead>
            <tbody>
              ${pharmacists.map(p => {
                const empShifts = allSchedules.filter(r => r.empId === p.id && r.date && r.date.startsWith(monthKey));
                const rateObj = pRatesMap[p.id] || {};
                const currentWeekdayRate = Number(p.weekdayRate) || Number(p.hourlyRate) || Number(rateObj.weekdayRate) || 40000;
                const currentHolidayRate = Number(p.holidayRate) || Number(rateObj.holidayRate) || 40000;
                const currentBreakHours = Number(rateObj.breakHours) || 1.0;
                let calc = window.LaborCalculator.calculatePharmacistPayroll(empShifts, currentWeekdayRate, currentHolidayRate, currentBreakHours);

                const empAdj = monthAdj[p.id] || {};
                const mealAlw = Number(empAdj.mealAllowance !== undefined ? empAdj.mealAllowance : 0);
                const overtimePay = Number(empAdj.overtimePay || 0);
                const deductionPay = Number(empAdj.deductionPay || 0);
                const pharmacistPretaxTotal = calc.totalPayroll + mealAlw + overtimePay - deductionPay;

                const ps = monthPaystubs[p.id];
                const isPublished = ps && ps.published;
                const activeUnsettledPretax = isPublished ? 0 : pharmacistPretaxTotal;

                const isKwon = p.name === '권명주';

                return `
                  <tr>
                    <td style="text-align:center; padding:10px 8px;">
                      <strong>${p.name}</strong>
                      ${isKwon ? `<div style="font-size:9.5px; color:#7c3aed; background:#f5f3ff; border:1px solid #ddd6fe; padding:2px 4px; border-radius:4px; margin-top:3px; font-weight:700; white-space:nowrap;">🔗 세무 165만 / 잔여 간영자 연동</div>` : ''}
                    </td>
                    <td style="text-align:center; padding:10px 8px;"><span class="badge badge-pharmacist" style="padding:4px 8px; font-size:12px;">${p.role}</span></td>
                    <td style="text-align:center; padding:10px 8px;">
                      <div style="font-size:13px; font-weight:700; color:#0f172a;">
                        총 <span class="text-primary" style="font-size:14.5px; font-family:'Outfit', sans-serif;">${calc.totalNetHours}h</span> (${calc.totalWorkDays}일)
                      </div>
                      <div class="text-muted" style="font-size:11.5px; margin-top:1px;">
                        평일 ${calc.weekdayNetHours}h / 휴일 <strong style="color:#ea580c;">${calc.holidayNetHours}h</strong>
                      </div>
                    </td>
                    <td style="text-align:right; padding:10px 10px; white-space:nowrap;">
                      <div>
                        <span style="color:#1e40af; font-weight:700; font-size:13.5px; font-family:'Outfit', sans-serif;">${calc.weekdayPay.toLocaleString()}</span>
                        <span style="font-size:12px; color:#475569; margin-left:1px; font-weight:600;">원</span>
                      </div>
                      <div style="font-size:10.5px; background:#eff6ff; color:#1e40af; border:1px solid #bfdbfe; padding:1px 5px; border-radius:5px; margin-top:2px; font-weight:600; text-align:right; display:inline-block;">
                        ${currentWeekdayRate.toLocaleString()}원 × ${calc.weekdayNetHours}h
                      </div>
                    </td>
                    <td style="background:#fff7ed; text-align:right; padding:10px 10px; white-space:nowrap;">
                      <div>
                        <strong style="color:#c2410c; font-size:13.5px; font-family:'Outfit', sans-serif;">${calc.holidayPay.toLocaleString()}</strong>
                        <span style="font-size:12px; color:#c2410c; margin-left:1px; font-weight:600;">원</span>
                      </div>
                      <div style="font-size:10.5px; background:#fff7ed; color:#c2410c; border:1px solid #ffedd5; padding:1px 5px; border-radius:5px; margin-top:2px; font-weight:600; text-align:right; display:inline-block;">
                        ${currentHolidayRate.toLocaleString()}원 × ${calc.holidayNetHours}h
                      </div>
                    </td>
                    <td style="text-align:right; padding:10px 10px; white-space:nowrap;">
                      ${isDirector ? `
                        <input type="text" class="form-control form-control-sm font-bold text-success text-end" style="width:100px; border-radius:8px; border:1.5px solid #86efac; padding:4px 6px; font-size:13px; font-family:'Outfit', sans-serif; display:inline-block;" value="${mealAlw === 0 ? '0' : mealAlw.toLocaleString()}" placeholder="0" oninput="let v = this.value.replace(/[^0-9-]/g, ''); this.value = v ? Number(v).toLocaleString() : '';" onchange="ScheduleModule.updateAdjustment('${p.id}', 'mealAllowance', this.value)" title="약국장 직접 입력: 비과세 식대">
                      ` : `
                        <strong style="color:#166534; font-size:13.5px; font-family:'Outfit', sans-serif;">${mealAlw.toLocaleString()}</strong>
                        <span style="font-size:12px; color:#166534; font-weight:600; margin-left:1px;">원</span>
                      `}
                    </td>
                    <td style="text-align:right; padding:10px 10px; white-space:nowrap;">
                      ${isDirector ? `
                        <input type="text" class="form-control form-control-sm font-bold text-primary text-end" style="width:90px; border-radius:8px; border:1.5px solid #93c5fd; padding:4px 6px; font-size:13px; font-family:'Outfit', sans-serif; display:inline-block;" value="${overtimePay === 0 ? '0' : overtimePay.toLocaleString()}" placeholder="0" oninput="let v = this.value.replace(/[^0-9-]/g, ''); this.value = v ? Number(v).toLocaleString() : '';" onchange="ScheduleModule.updateAdjustment('${p.id}', 'overtimePay', this.value)" title="약국장 직접 입력: 추가 수당">
                      ` : `
                        <span style="font-weight:700; color:${overtimePay > 0 ? '#15803d' : '#94a3b8'}; font-size:13.5px; font-family:'Outfit', sans-serif;">${overtimePay > 0 ? '+' + overtimePay.toLocaleString() : '0'}</span>
                        <span style="font-size:12px; color:${overtimePay > 0 ? '#15803d' : '#94a3b8'}; font-weight:600; margin-left:1px;">원</span>
                      `}
                    </td>
                    <td style="text-align:right; padding:10px 10px; white-space:nowrap;">
                      ${isDirector ? `
                        <input type="text" class="form-control form-control-sm font-bold text-danger text-end" style="width:90px; border-radius:8px; border:1.5px solid #fca5a5; padding:4px 6px; font-size:13px; font-family:'Outfit', sans-serif; display:inline-block;" value="${deductionPay === 0 ? '0' : deductionPay.toLocaleString()}" placeholder="0" oninput="let v = this.value.replace(/[^0-9-]/g, ''); this.value = v ? Number(v).toLocaleString() : '';" onchange="ScheduleModule.updateAdjustment('${p.id}', 'deductionPay', this.value)" title="약국장 직접 입력: 공제 삭감">
                      ` : `
                        <span style="font-weight:700; color:${deductionPay > 0 ? '#dc2626' : '#94a3b8'}; font-size:13.5px; font-family:'Outfit', sans-serif;">${deductionPay > 0 ? '-' + deductionPay.toLocaleString() : '0'}</span>
                        <span style="font-size:12px; color:${deductionPay > 0 ? '#dc2626' : '#94a3b8'}; font-weight:600; margin-left:1px;">원</span>
                      `}
                    </td>
                    <td style="text-align:right; padding:10px 10px; white-space:nowrap;">
                      <div>
                        <strong class="${isPublished ? 'text-muted' : 'text-success'}" style="font-size:15px; font-family:'Outfit', sans-serif;">${activeUnsettledPretax.toLocaleString()}</strong>
                        <span style="font-size:12px; color:${isPublished ? '#64748b' : '#15803d'}; margin-left:1px; font-weight:600;">원</span>
                      </div>
                      ${isPublished ? `
                        <div style="font-size:11px; background:#d1fae5; color:#047857; border:1px solid #6ee7b7; padding:2px 6px; border-radius:6px; margin-top:3px; font-weight:700; text-align:right; display:inline-block;">
                          <i class="fas fa-check-double me-1"></i> 교부완료 (미정산 0원 정산)
                        </div>
                      ` : `
                        <div style="font-size:11px; background:#fef3c7; color:#b45309; border:1px solid #fde68a; padding:2px 6px; border-radius:6px; margin-top:3px; font-weight:700; text-align:right; display:inline-block;">
                          <i class="fas fa-clock me-1"></i> 미교부 잔액: ${pharmacistPretaxTotal.toLocaleString()}원 (등록대기)
                        </div>
                      `}
                    </td>
                    <td style="text-align:center; padding:10px 8px;">
                      <button type="button" class="btn btn-xs font-bold" onclick="window.openUploadPaystubModal ? window.openUploadPaystubModal('${p.id}') : (window.ScheduleModule && window.ScheduleModule.openUploadPaystubModal('${p.id}'))" style="font-size:12px; padding:6px 12px; border-radius:8px; ${isPublished ? 'background:#10b981; color:#fff; border:none; box-shadow:0 2px 5px rgba(16,185,129,0.3);' : 'background:#2563eb; color:#fff; border:none; box-shadow:0 3px 8px rgba(37,99,235,0.4);'}">
                        <i class="fas ${isPublished ? 'fa-check-circle' : 'fa-upload'}"></i> ${isPublished ? '교부완료' : '세후등록'}
                      </button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- 2. 일반직원 급여 정산표 -->
      <div class="card-section mb-6">
        <div class="section-title-bar">
          <div>
            <h3><i class="fas fa-money-check-alt text-primary"></i> 일반직원 급여 정산표 (${currentYear}년 ${currentMonth}월)</h3>
            <span class="text-muted">📜 약정월급 + 비과세 식대 + 추가수당/공제삭감 직접입력 세전총급여</span>
          </div>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; background:#f0fdf4; border:1px solid #bbf7d0; border-bottom:none; color:#15803d; padding:8px 14px; border-radius:12px 12px 0 0; font-size:12px; font-weight:bold;">
          <span><i class="fas fa-wallet"></i> 일반직원 월간 세전 총급여 정산 (약국장 직접 수정 가능)</span>
          <span style="color:#16a34a;"><i class="fas fa-arrows-alt-h"></i> 화면이 좁을 경우 좌우로 스크롤 가능</span>
        </div>
        <div class="table-responsive" style="overflow-x:auto; -webkit-overflow-scrolling:touch; border-radius:0 0 14px 14px; border:1px solid #cbd5e1; width:100%; background:#fff; margin-bottom:20px; box-shadow:0 2px 8px rgba(0,0,0,0.04);">
          <table class="data-table" style="width:100%; font-size:13px;">
            <thead>
              <tr style="background:#f8fafc; border-bottom:2px solid #cbd5e1;">
                <th style="width:90px; text-align:center; padding:10px 8px; white-space:nowrap;">직원명</th>
                <th style="width:100px; text-align:center; padding:10px 8px; white-space:nowrap;">담당 직무</th>
                <th style="width:130px; text-align:right; padding:10px 12px; white-space:nowrap;">약정 기본월급</th>
                <th style="width:115px; text-align:right; padding:10px 10px; white-space:nowrap;">비과세 식대</th>
                <th style="width:105px; text-align:right; padding:10px 10px; white-space:nowrap;">추가 수당</th>
                <th style="width:105px; text-align:right; padding:10px 10px; white-space:nowrap;">공제 삭감</th>
                <th style="width:150px; text-align:right; padding:10px 12px; white-space:nowrap;">세전 총급여</th>
                <th style="width:110px; text-align:center; padding:10px 8px; white-space:nowrap;">명세서 등록</th>
              </tr>
            </thead>
            <tbody>
              ${staffMembers.map(s => {
                const hourlyRate = Number(s.hourlyRate) || 13000;
                
                const empAdj = monthAdj[s.id] || {};
                let mealAlw = Number(empAdj.mealAllowance !== undefined ? empAdj.mealAllowance : 0);
                const overtimePay = Number(empAdj.overtimePay || 0);
                const deductionPay = Number(empAdj.deductionPay || 0);

                const isKan = s.name.includes('간영자') || s.name.includes('간명자');
                let baseSal = Number(s.baseMonthlySalary) || 2717000;

                // 🔗 간영자 님: 권명주 약사님 총시수 산출액 - 165만원 연동
                if (isKan && kwonTotalPayroll > 0) {
                  const kanTotalWithMeal = Math.max(0, kwonTotalPayroll - 1650000);
                  baseSal = Math.max(0, kanTotalWithMeal - 100000);
                  mealAlw = 100000;
                }

                const adjustedPretaxTotal = baseSal + mealAlw + overtimePay - deductionPay;

                const ps = monthPaystubs[s.id];
                const isPublished = ps && ps.published;
                const activeUnsettledPretaxStaff = isPublished ? 0 : adjustedPretaxTotal;

                const posDisplay = isKan ? '매장관리' : ((s.position && s.position !== 'undefined' && s.position !== '') ? s.position : (
                  s.name === '이승학' ? '조제실 및 전산' :
                  s.name === '김제희' ? '조제실 일반전산' :
                  s.name === '윤세라' ? '조제실 서포트' :
                  s.name === '김배영' ? '매장관리 및 서포트' :
                  (s.role || '일반직원')
                ));

                return `
                  <tr>
                    <td style="text-align:center; padding:10px 8px;">
                      <strong>${s.name}</strong>
                      ${isKan ? `<div style="font-size:9.5px; color:#2563eb; background:#eff6ff; border:1px solid #bfdbfe; padding:2px 4px; border-radius:4px; margin-top:3px; font-weight:700; white-space:nowrap;">🔗 권명주 연동 (${(kwonTotalPayroll/10000).toFixed(0)}만 - 165만)</div>` : ''}
                    </td>
                    <td style="text-align:center; padding:10px 8px;"><span class="badge badge-staff" style="padding:4px 8px; font-size:12px;">${posDisplay}</span></td>
                    <td style="text-align:right; padding:10px 12px; white-space:nowrap;">
                      <strong style="color:#15803d; font-size:14px; font-family:'Outfit', sans-serif;">${baseSal.toLocaleString()}</strong>
                      <span style="font-size:12px; color:#15803d; font-weight:600; margin-left:1px;">원</span>
                    </td>
                    <td style="text-align:right; padding:10px 10px; white-space:nowrap;">
                      ${isDirector ? `
                        <input type="text" class="form-control form-control-sm font-bold text-success text-end" style="width:100px; border-radius:8px; border:1.5px solid #86efac; padding:4px 6px; font-size:13px; font-family:'Outfit', sans-serif; display:inline-block;" value="${mealAlw === 0 ? '0' : mealAlw.toLocaleString()}" placeholder="0" oninput="let v = this.value.replace(/[^0-9-]/g, ''); this.value = v ? Number(v).toLocaleString() : '';" onchange="ScheduleModule.updateAdjustment('${s.id}', 'mealAllowance', this.value)" title="약국장 직접 입력: 비과세 식대">
                      ` : `
                        <strong style="color:#166534; font-size:13.5px; font-family:'Outfit', sans-serif;">${mealAlw.toLocaleString()}</strong>
                        <span style="font-size:12px; color:#166534; font-weight:600; margin-left:1px;">원</span>
                      `}
                    </td>
                    <td style="text-align:right; padding:10px 10px; white-space:nowrap;">
                      ${isDirector ? `
                        <input type="text" class="form-control form-control-sm font-bold text-primary text-end" style="width:90px; border-radius:8px; border:1.5px solid #93c5fd; padding:4px 6px; font-size:13px; font-family:'Outfit', sans-serif; display:inline-block;" value="${overtimePay === 0 ? '0' : overtimePay.toLocaleString()}" placeholder="0" oninput="let v = this.value.replace(/[^0-9-]/g, ''); this.value = v ? Number(v).toLocaleString() : '';" onchange="ScheduleModule.updateAdjustment('${s.id}', 'overtimePay', this.value)" title="약국장 직접 입력: 추가 수당">
                      ` : `
                        <span style="font-weight:700; color:${overtimePay > 0 ? '#15803d' : '#94a3b8'}; font-size:13.5px; font-family:'Outfit', sans-serif;">${overtimePay > 0 ? '+' + overtimePay.toLocaleString() : '0'}</span>
                        <span style="font-size:12px; color:${overtimePay > 0 ? '#15803d' : '#94a3b8'}; font-weight:600; margin-left:1px;">원</span>
                      `}
                    </td>
                    <td style="text-align:right; padding:10px 10px; white-space:nowrap;">
                      ${isDirector ? `
                        <input type="text" class="form-control form-control-sm font-bold text-danger text-end" style="width:90px; border-radius:8px; border:1.5px solid #fca5a5; padding:4px 6px; font-size:13px; font-family:'Outfit', sans-serif; display:inline-block;" value="${deductionPay === 0 ? '0' : deductionPay.toLocaleString()}" placeholder="0" oninput="let v = this.value.replace(/[^0-9-]/g, ''); this.value = v ? Number(v).toLocaleString() : '';" onchange="ScheduleModule.updateAdjustment('${s.id}', 'deductionPay', this.value)" title="약국장 직접 입력: 공제 삭감">
                      ` : `
                        <span style="font-weight:700; color:${deductionPay > 0 ? '#dc2626' : '#94a3b8'}; font-size:13.5px; font-family:'Outfit', sans-serif;">${deductionPay > 0 ? '-' + deductionPay.toLocaleString() : '0'}</span>
                        <span style="font-size:12px; color:${deductionPay > 0 ? '#dc2626' : '#94a3b8'}; font-weight:600; margin-left:1px;">원</span>
                      `}
                    </td>
                    <td style="text-align:right; padding:10px 12px; white-space:nowrap;">
                      <div>
                        <strong class="${isPublished ? 'text-muted' : 'text-success'}" style="font-size:15px; font-family:'Outfit', sans-serif;">${activeUnsettledPretaxStaff.toLocaleString()}</strong>
                        <span style="font-size:12px; color:${isPublished ? '#64748b' : '#15803d'}; margin-left:1px; font-weight:600;">원</span>
                      </div>
                      ${isPublished ? `
                        <div style="font-size:11px; background:#d1fae5; color:#047857; border:1px solid #6ee7b7; padding:2px 6px; border-radius:6px; margin-top:3px; font-weight:700; text-align:right; display:inline-block;">
                          <i class="fas fa-check-double me-1"></i> 교부완료 (미정산 0원 정산)
                        </div>
                      ` : `
                        <div style="font-size:11px; background:#fef3c7; color:#b45309; border:1px solid #fde68a; padding:2px 6px; border-radius:6px; margin-top:3px; font-weight:700; text-align:right; display:inline-block;">
                          <i class="fas fa-clock me-1"></i> 미교부 잔액: ${adjustedPretaxTotal.toLocaleString()}원 (등록대기)
                        </div>
                      `}
                    </td>
                    <td style="text-align:center; padding:10px 8px;">
                      <button type="button" class="btn btn-xs font-bold" onclick="window.openUploadPaystubModal ? window.openUploadPaystubModal('${s.id}') : (window.ScheduleModule && window.ScheduleModule.openUploadPaystubModal('${s.id}'))" style="font-size:12px; padding:6px 12px; border-radius:8px; ${isPublished ? 'background:#10b981; color:#fff; border:none; box-shadow:0 2px 5px rgba(16,185,129,0.3);' : 'background:#2563eb; color:#fff; border:none; box-shadow:0 3px 8px rgba(37,99,235,0.4);'}">
                        <i class="fas ${isPublished ? 'fa-check-circle' : 'fa-upload'}"></i> ${isPublished ? '교부완료' : '세후등록'}
                      </button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    return html;
  }

  // 1. 공제/수당 실시간 저장 함수 (콤마 제거 로직 추가)
  function updateAdjustment(empId, field, val) {
    const currUser = window.SheetsSync.getCurrentUser();
    if (!currUser || currUser.role !== '약국장') {
      alert('🔒 [보안 권한 통제] 비과세 식대, 추가 수당, 공제 삭감은 약국장 계정으로만 직접 수정 및 저장이 가능합니다.');
      render('module-content');
      return;
    }

    const data = window.SheetsSync.getData();
    let allAdjustments = data.overtimeAdjustments || {};
    const monthKey = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

    if (!allAdjustments[monthKey]) allAdjustments[monthKey] = {};
    if (!allAdjustments[monthKey][empId]) {
      allAdjustments[monthKey][empId] = { mealAllowance: 0, overtimePay: 0, deductionPay: 0 };
    }

    // 💡 콤마(,)가 포함된 텍스트가 들어오면 콤마를 제거한 뒤 숫자로 저장합니다.
    const cleanVal = String(val).replace(/,/g, '');
    allAdjustments[monthKey][empId][field] = Number(cleanVal) || 0;
    
    window.SheetsSync.saveOvertimeAdjustments(allAdjustments);
    render('module-content');
  }
  function toggleSettlement() {
    showSettlement = !showSettlement;
    render('module-content');
  }

  function setRoleFilter(filter) {
    roleFilter = filter;
    render('module-content');
  }

  function setShowOffStaff(show) {
    showOffStaff = show;
    render('module-content');
  }

  function changeMonth(delta) {
    currentMonth += delta;
    if (currentMonth > 12) {
      currentMonth = 1;
      currentYear++;
    } else if (currentMonth < 1) {
      currentMonth = 12;
      currentYear--;
    }
    render('module-content');
  }

  function goToday() {
    currentYear = 2026;
    currentMonth = 8;
    render('module-content');
  }

  let currentModalWorkMode = true; // true: 근무, false: OFF

  function openShiftModal(dateStr, empId, empName, currentShift) {
    const currUser = window.SheetsSync.getCurrentUser();
    if (!currUser) {
      alert('⚠️ 근무 스케줄 수정을 위해 먼저 로그인해 주세요.');
      if (window.App && typeof window.App.showLoginModal === 'function') {
        window.App.showLoginModal();
      }
      return;
    }

    const isDirector = currUser.role === '약국장';
    const targetEmpId = empId || currUser.id;

    // 🔒 약국장 최종 승인 확정 후 일반 직원 계정 수정 완전 차단 (약국장이 반려해줘야만 재수정 가능)
    if (!isDirector) {
      const data = window.SheetsSync.getData();
      const monthKey = currentYear + '-' + String(currentMonth).padStart(2, '0');
      const statusObj = ((data.scheduleStatus || {})[monthKey]) || {};
      const myStatus = statusObj[currUser.id] || 'DRAFT';
      const isDirectorApproved = statusObj.directorApproved === true || myStatus === 'APPROVED';

      if (isDirectorApproved) {
        alert("🔒 [약국장 최종 승인 완료 픽스 상태]\n\n" + currentMonth + "월 근무 스케줄이 약국장님에 의해 최종 승인 확정되었습니다.\n확정된 이후에는 임의로 스케줄을 변경할 수 없으며, 수정이 필요하신 경우 약국장님께 [개별 스케줄 재수정 요청(반려)]을 요청해 주세요.");
        return;
      }
    }

    // 본인 확인 및 약국장 권한 통제
    if (!isDirector && targetEmpId !== currUser.id) {
      const emps = window.SheetsSync.getEmployees() || [];
      const targetEmp = emps.find(e => e.id === targetEmpId || e.name === empName);
      const targetName = targetEmp ? targetEmp.name : (empName || '해당 직원');
      alert("🔒 [권한 통제] 본인(" + currUser.name + ")의 근무/휴무 스케줄만 수정할 수 있습니다.\n(" + targetName + " 님의 스케줄 수정은 해당 직원 본인 계정 또는 약국장님만 가능합니다)");
      return;
    }

    document.getElementById('modal-shift-date').value = dateStr;
    const select = document.getElementById('modal-shift-empid');
    
    if (select) {
      if (!isDirector) {
        const pos = (currUser.position && currUser.position !== 'undefined') ? ' / ' + currUser.position : '';
        select.innerHTML = '<option value="' + currUser.id + '">' + currUser.name + ' (' + currUser.role + pos + ' - 본인)</option>';
        select.value = currUser.id;
        select.disabled = true;
      } else {
        const emps = window.SheetsSync.getEmployees() || [];
        select.innerHTML = emps.map(e => {
          const pos = (e.position && e.position !== 'undefined') ? ' / ' + e.position : '';
          return '<option value="' + e.id + '">' + e.name + ' (' + (e.role || '직원') + pos + ')</option>';
        }).join('');
        select.value = targetEmpId;
        select.disabled = false;
      }
    }

    onModalEmpChange();
    document.getElementById('shift-modal').style.display = 'flex';
  }

  function onModalEmpChange() {
    const dateStr = document.getElementById('modal-shift-date').value;
    const empId = document.getElementById('modal-shift-empid').value;

    const data = window.SheetsSync.getData();
    const rec = (data.schedule || []).find(s => s.date === dateStr && s.empId === empId);

    const breakSelect = document.getElementById('modal-break-hours');
    if (breakSelect) {
      if (rec && rec.breakHours !== undefined && rec.breakHours !== null && !isNaN(rec.breakHours)) {
        breakSelect.value = Number(rec.breakHours).toFixed(1);
      } else {
        breakSelect.value = "1.0";
      }
    }

    // 🚀 사용자가 날짜를 클릭했을 때 항상 [🟢 근무 지정] 모드를 1순위로 기본 활성화하여 시간 입력창이 바로 뜨도록 지원!
    if (rec && rec.shift === 'OFF' && rec.manuallySetOff) {
      setModalWorkMode(false);
    } else if (rec && rec.shift !== 'OFF') {
      setModalWorkMode(true);
      if (rec.startTime) document.getElementById('modal-start-time').value = rec.startTime;
      if (rec.endTime) document.getElementById('modal-end-time').value = rec.endTime;
    } else {
      setModalWorkMode(true);
      document.getElementById('modal-start-time').value = (rec && rec.startTime) ? rec.startTime : '09:00';
      document.getElementById('modal-end-time').value = (rec && rec.endTime) ? rec.endTime : '18:00';
    }
  }

  function setModalWorkMode(isWork) {
    currentModalWorkMode = isWork;
    const btnWork = document.getElementById('btn-shift-mode-work');
    const btnOff = document.getElementById('btn-shift-mode-off');
    const group = document.getElementById('work-time-fields-group');

    if (isWork) {
      if (btnWork) btnWork.classList.add('active');
      if (btnOff) btnOff.classList.remove('active');
      if (group) group.style.display = 'block';
    } else {
      if (btnWork) btnWork.classList.remove('active');
      if (btnOff) btnOff.classList.add('active');
      if (group) group.style.display = 'none';
    }
  }

  function closeShiftModal() {
    document.getElementById('shift-modal').style.display = 'none';
  }

  function setPresetTime(start, end, shiftCode) {
    setModalWorkMode(true);
    document.getElementById('modal-start-time').value = start;
    document.getElementById('modal-end-time').value = end;
  }

  function saveCustomShift() {
    const currUser = window.SheetsSync.getCurrentUser();
    if (!currUser) return;
    const isDirector = currUser.role === '약국장';

    const dateStr = document.getElementById('modal-shift-date').value;
    const empId = document.getElementById('modal-shift-empid').value;
    const startTime = document.getElementById('modal-start-time').value;
    const endTime = document.getElementById('modal-end-time').value;

    const breakSelect = document.getElementById('modal-break-hours');
    let breakHours = 1.0;
    if (breakSelect && breakSelect.value !== undefined && breakSelect.value !== '') {
      const parsed = parseFloat(breakSelect.value);
      if (!isNaN(parsed)) breakHours = parsed;
    }

    if (!isDirector && empId !== currUser.id) {
      alert('🔒 [권한 통제] 본인의 근무/휴무 스케줄만 수정 및 저장할 수 있습니다.');
      return;
    }

    const shift = currentModalWorkMode ? 'CUSTOM' : 'OFF';

    const data = window.SheetsSync.getData();
    let schedule = data.schedule || [];

    const existingIdx = schedule.findIndex(s => s.date === dateStr && s.empId === empId);
    const newRecord = {
      id: `sch_${dateStr}_${empId}`,
      date: dateStr,
      empId,
      shift,
      startTime: currentModalWorkMode ? startTime : '',
      endTime: currentModalWorkMode ? endTime : '',
      breakHours: currentModalWorkMode ? breakHours : 1.0,
      manuallySetOff: !currentModalWorkMode,
      updatedAt: Date.now()
    };

    if (existingIdx >= 0) {
      schedule[existingIdx] = newRecord;
    } else {
      schedule.push(newRecord);
    }

    window.SheetsSync.saveData(window.SheetsSync.STORAGE_KEYS.SCHEDULE, schedule);
    closeShiftModal();
    render('module-content');
  }

  function sendPaystubEmail(empEmail, name, role, netHours, rate, baseSalary, holidayAllowance, totalSalary, mealAllowance, type) {
    const targetEmail = empEmail || (name === '문성도' ? 'director@shinsegae.com' : 'kwon@shinsegae.com');
    const subject = encodeURIComponent('[신세계약국] ' + currentYear + '년 ' + currentMonth + '월 ' + name + '님 월 급여명세서 전달');
    let bodyText = '안녕하세요, ' + name + ' ' + role + '님.\n신세계약국 ' + currentYear + '년 ' + currentMonth + '월 급여명세서 전달해 드립니다.\n\n';
    bodyText += '성명: ' + name + ' (' + role + ')\n';
    bodyText += '등록 이메일: ' + targetEmail + '\n';
    bodyText += '월 총 실근무시수: ' + netHours + ' 시간 (휴게시간 차감 완료)\n';
    bodyText += '------------------------------------\n';
    if (type === 'pharmacist') {
      bodyText += '▪️ 약정시급: ' + rate.toLocaleString() + ' 원/h\n';
      bodyText += '▪️ 기본급 분 (83.3%): ' + baseSalary.toLocaleString() + ' 원\n';
      bodyText += '▪️ 주휴수당 분 (16.7%): ' + holidayAllowance.toLocaleString() + ' 원\n';
    } else {
      bodyText += '▪️ 주40시간 고정 기본월급: ' + baseSalary.toLocaleString() + ' 원\n';
      bodyText += '▪️ 비과세 식대: ' + mealAllowance.toLocaleString() + ' 원\n';
    }
    bodyText += '------------------------------------\n';
    bodyText += '💰 월 세전 산출 총급여: ' + totalSalary.toLocaleString() + ' 원\n\n';
    bodyText += '* 본 명세서는 당월 확정 근무표에 따른 세전 산출내역이며, 세무사 산출 4대보험 및 세금 공제 후 최종 세후 실수령액이 확정 교부됩니다.\n';
    bodyText += '신세계약국 HR/OPS 자동 발송 시스템';

    const mailtoUrl = 'mailto:' + targetEmail + '?subject=' + subject + '&body=' + encodeURIComponent(bodyText);
    window.open(mailtoUrl, '_blank');
    alert('📧 ' + name + ' 직원 (' + targetEmail + ')에게 이메일 급여명세서 발송 연결이 완료되었습니다!');
  }

  function ensurePaystubModalExists() {
    let modal = document.getElementById('paystub-detail-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'paystub-detail-modal';
      modal.className = 'modal-overlay';
      modal.style.cssText = 'display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.65); z-index:999999; justify-content:center; align-items:center;';
      modal.innerHTML = '<div class="modal-card" style="background:#fff; border-radius:20px; max-width:620px; width:94%; padding:28px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.3); position:relative;">' +
        '<button type="button" class="close-btn" onclick="document.getElementById(\'paystub-detail-modal\').style.display=\'none\'" style="position:absolute; top:20px; right:24px; font-size:24px; background:none; border:none; color:#64748b; cursor:pointer;">&times;</button>' +
        '<div id="paystub-detail-modal-content"></div>' +
      '</div>';
      document.body.appendChild(modal);
    }
    return modal;
  }

  function fmtNum(val) {
    if (val === null || val === undefined || isNaN(val)) return '0';
    return Number(val).toLocaleString();
  }

  function showPaystubModal(name, role, netHours, rate, baseSalary, holidayAllowance, totalSalary, mealAllowance, type, empEmail) {
    const modal = ensurePaystubModalExists();
    const content = document.getElementById('paystub-detail-modal-content');
    if (!content) return;

    const isPharmacist = type === 'pharmacist';
    const isMonthly = !isPharmacist;

    const badgeText = isPharmacist ? '👨‍⚕️ 근무약사 (약정 시급제)' : '👨‍💼 일반직원 (주40시간 정액 월급제)';
    const badgeBg = isPharmacist ? 'bg-primary' : 'bg-success';

    const safeNetHours = netHours || 0;
    const safeRate = rate || 0;
    const safeBaseSal = baseSalary || 0;
    const safeHolAlw = holidayAllowance || 0;
    const safeMealAlw = mealAllowance || 0;
    const safeTotSal = totalSalary || (safeBaseSal + safeMealAlw);

    let html = '';
    html += '<div class="d-flex align-items-center gap-3 mb-3 pb-3 border-bottom">';
    html += '  <div style="width:44px; height:44px; border-radius:50%; background:#dcfce7; color:#15803d; display:flex; justify-content:center; align-items:center; font-size:22px;">';
    html += '    <i class="fas fa-file-invoice-dollar"></i>';
    html += '  </div>';
    html += '  <div>';
    html += '    <span class="badge ' + badgeBg + ' mb-1" style="font-size:11px; border-radius:12px;">' + badgeText + '</span>';
    html += '    <h3 style="font-size:20px; font-weight:bold; margin:0; color:#0f172a;">';
    html += '      📄 신세계약국 ' + currentYear + '년 ' + currentMonth + '월 급여명세서';
    html += '    </h3>';
    html += '  </div>';
    html += '</div>';

    html += '<div class="card p-3 mb-3" style="background:#f8fafc; border-radius:12px; border:1px solid #e2e8f0; font-size:13.5px; color:#1e293b;">';
    html += '  <div class="row g-2">';
    html += '    <div class="col-6"><strong>성명:</strong> ' + name + '</div>';
    html += '    <div class="col-6"><strong>직책 / 직무:</strong> ' + role + '</div>';
    html += '    <div class="col-12"><strong>수신 이메일:</strong> ' + (empEmail || '등록된 이메일 계정') + '</div>';
    html += '  </div>';
    html += '</div>';

    html += '<div class="card p-3 mb-4" style="background:#ffffff; border-radius:12px; border:1px solid #cbd5e1; font-size:14px; color:#0f172a;">';
    html += '  <h4 style="font-size:15px; font-weight:bold; color:#1e293b; margin-bottom:12px; border-bottom:1px solid #f1f5f9; padding-bottom:6px;">';
    html += '    📊 당월 산출 내역 명세 (근로계약서 제6조)';
    html += '  </h4>';

    if (isMonthly) {
      html += '  <div class="d-flex justify-content-between mb-2">';
      html += '    <span style="color:#64748b;">▪️ 주40시간 약정 기본 월급</span>';
      html += '    <strong style="color:#0f172a;">' + fmtNum(safeBaseSal) + ' 원</strong>';
      html += '  </div>';
      html += '  <div class="d-flex justify-content-between mb-2">';
      html += '    <span style="color:#64748b;">▪️ 비과세 식대 수당</span>';
      html += '    <strong style="color:#166534;">+ ' + fmtNum(safeMealAlw) + ' 원</strong>';
      html += '  </div>';
      html += '  <div class="d-flex justify-content-between mb-2">';
      html += '    <span style="color:#64748b;">▪️ 당월 실근무시수 (휴게 1h 공제)</span>';
      html += '    <span>' + safeNetHours + ' 시간</span>';
      html += '  </div>';
      html += '  <div class="d-flex justify-content-between mb-2">';
      html += '    <span style="color:#64748b;">▪️ 초과/결근 조정 차감액</span>';
      html += '    <span style="color:#e11d48;">0 원 (정상 수당 적용)</span>';
      html += '  </div>';
    } else {
      html += '  <div class="d-flex justify-content-between mb-2">';
      html += '    <span style="color:#64748b;">▪️ 당월 총 실근무시수 (휴게 1h 공제)</span>';
      html += '    <strong style="color:#2563eb;">' + safeNetHours + ' 시간</strong>';
      html += '  </div>';
      html += '  <div class="d-flex justify-content-between mb-2">';
      html += '    <span style="color:#64748b;">▪️ 약정 시급</span>';
      html += '    <strong style="color:#0f172a;">' + fmtNum(safeRate) + ' 원 / 시간</strong>';
      html += '  </div>';
      html += '  <div class="d-flex justify-content-between mb-2 pl-3" style="font-size:13px; color:#475569;">';
      html += '    <span>  └ 기본급 분 (83.3%)</span>';
      html += '    <span>' + fmtNum(safeBaseSal) + ' 원</span>';
      html += '  </div>';
      html += '  <div class="d-flex justify-content-between mb-2 pl-3" style="font-size:13px; color:#475569;">';
      html += '    <span>  └ 주휴수당 분 (16.7%)</span>';
      html += '    <span>' + fmtNum(safeHolAlw) + ' 원</span>';
      html += '  </div>';
    }

    html += '  <div class="pt-3 mt-2 border-top d-flex justify-content-between align-items-center">';
    html += '    <strong style="font-size:16px; color:#0f172a;">💰 당월 월 세전 총급여액</strong>';
    html += '    <strong style="font-size:20px; color:#059669;">' + fmtNum(safeTotSal) + ' 원</strong>';
    html += '  </div>';
    html += '</div>';

    html += '<div class="alert alert-info p-3 mb-4" style="font-size:12.5px; border-radius:10px; line-height:1.6; color:#0f172a;">';
    html += '  🛡️ <strong>[안내 및 세무 처리 과정]</strong><br>';
    html += '  1. 본 명세서는 당월 확정 근무표(실근무시수)에 근거하여 자동 연동 산출된 세전 금액입니다.<br>';
    html += '  2. 약국장이 세무사에게 본 집계표 전달 후, 세무사가 산출한 <strong>4대보험 및 세금 공제 완료 세후 실수령액 PDF 명세서</strong>가 공식 전달됩니다.';
    html += '</div>';

    html += '<div class="d-flex justify-content-end gap-2">';
    html += '  <button type="button" class="btn btn-secondary" onclick="document.getElementById(\'paystub-detail-modal\').style.display=\'none\'">닫기</button>';
    html += '  <button type="button" class="btn btn-success font-bold" onclick="ScheduleModule.sendPaystubEmail(\'' + empEmail + '\', \'' + name + '\', \'' + role + '\', ' + safeNetHours + ', ' + safeRate + ', ' + safeBaseSal + ', ' + safeHolAlw + ', ' + safeTotSal + ', ' + safeMealAlw + ', \'' + type + '\')">';
    html += '    <i class="fas fa-envelope"></i> 📧 이메일로 명세서 전송';
    html += '  </button>';
    html += '</div>';

    content.innerHTML = html;
    modal.style.display = 'flex';
    modal.style.zIndex = '999999';
    modal.style.opacity = '1';
  }

  function exportTaxAccountantReport() {
    const data = window.SheetsSync.getData();
    const employees = (data.employees || []).filter(e => e.role !== '약국장' && e.name !== '이정은' && e.name !== '주찬양' && (e.role !== '예비인력' || e.name.includes('간영자') || e.name.includes('간명자')));
    const scheduleRecords = data.schedule || [];
    const monthKey = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
    const allAdjustments = window.SheetsSync.getOvertimeAdjustments ? window.SheetsSync.getOvertimeAdjustments() : {};
    const monthAdj = allAdjustments[monthKey] || {};
    const pRatesMap = window.SheetsSync.getPharmacistRates ? window.SheetsSync.getPharmacistRates() : {};

    // 🔗 권명주 약사님 총 시수 산출액 계산 (간영자 님 급여 자동 연동용)
    const kwonEmp = (data.employees || []).find(e => e.name === '권명주');
    let kwonTotalPayroll = 0;
    if (kwonEmp) {
      const kwonShifts = scheduleRecords.filter(r => r.empId === kwonEmp.id && r.date && r.date.startsWith(monthKey));
      const kwonRateObj = pRatesMap[kwonEmp.id] || {};
      const kwonWkRate = Number(kwonEmp.weekdayRate) || Number(kwonEmp.hourlyRate) || Number(kwonRateObj.weekdayRate) || 40000;
      const kwonHolRate = Number(kwonEmp.holidayRate) || Number(kwonRateObj.holidayRate) || 40000;
      const kwonBreak = Number(kwonRateObj.breakHours) || 1.0;
      const kwonCalc = window.LaborCalculator.calculatePharmacistPayroll(kwonShifts, kwonWkRate, kwonHolRate, kwonBreak);
      kwonTotalPayroll = kwonCalc.totalPayroll;
    }

    let report = `<${currentMonth}월 급여>\n\n정규직\n\n`;

    // 🏆 대표님 지정 정확한 순서 배열: 이승학 -> 양윤지 -> 권명주 -> 간영자 -> 김제희 -> 김배영 -> 김동완 -> 윤세라 (유호종은 맨 마지막 멘트 아래!)
    const ORDER_MAP = {
      '이승학': 1,
      '양윤지': 2,
      '권명주': 3,
      '간영자': 4,
      '간명자': 4,
      '김제희': 5,
      '김배영': 6,
      '김동완': 7,
      '윤세라': 8
    };

    const mainEmployees = employees.filter(e => e.name !== '유호종').sort((a, b) => {
      const orderA = ORDER_MAP[a.name] || 99;
      const orderB = ORDER_MAP[b.name] || 99;
      return orderA - orderB;
    });

    const yoEmp = employees.find(e => e.name === '유호종');

    mainEmployees.forEach(emp => {
      const empAdj = monthAdj[emp.id] || {};
      const mealAlw = Number(empAdj.mealAllowance !== undefined ? empAdj.mealAllowance : 0);
      const overtimePay = Number(empAdj.overtimePay || 0);
      const deductionPay = Number(empAdj.deductionPay || 0);

      if (emp.name === '이승학') {
        const mealPart = mealAlw > 0 ? (mealAlw % 10000 === 0 ? `${mealAlw / 10000}만` : `${mealAlw.toLocaleString()}원`) : '15만';
        report += `${emp.name} 세후249만 (식대포함${mealPart})\n\n`;
      } else if (emp.name === '권명주') {
        report += `권명주 세전 155만 +식대 10만\n\n`;
      } else if (emp.name.includes('간영자') || emp.name.includes('간명자')) {
        const kanTotalWithMeal = Math.max(0, kwonTotalPayroll - 1650000);
        const kanPreTaxBase = Math.max(0, kanTotalWithMeal - 100000);
        report += `간영자 세전 ${kanPreTaxBase.toLocaleString()}원 +식대 10만\n\n`;
      } else {
        const isPharmacist = emp.role && emp.role.includes('약사');
        let pretaxTotal = 0;

        let mealText = '';
        if (mealAlw > 0) {
          if (mealAlw % 10000 === 0) {
            mealText = ` +식대 ${mealAlw / 10000}만`;
          } else {
            mealText = ` +식대 ${mealAlw.toLocaleString()}원`;
          }
        }

        if (isPharmacist) {
          const empShifts = scheduleRecords.filter(r => r.empId === emp.id && r.date && r.date.startsWith(monthKey));
          const rateObj = pRatesMap[emp.id] || {};
          const currentWeekdayRate = Number(emp.weekdayRate) || Number(emp.hourlyRate) || Number(rateObj.weekdayRate) || 40000;
          const currentHolidayRate = Number(emp.holidayRate) || Number(rateObj.holidayRate) || 40000;
          const currentBreakHours = Number(rateObj.breakHours) || 1.0;
          const calc = window.LaborCalculator.calculatePharmacistPayroll(empShifts, currentWeekdayRate, currentHolidayRate, currentBreakHours);
          pretaxTotal = calc.totalPayroll + overtimePay - deductionPay;
        } else {
          const baseSal = Number(emp.baseMonthlySalary) || 2717000;
          pretaxTotal = baseSal + overtimePay - deductionPay;
        }

        report += `${emp.name} 세전 ${pretaxTotal.toLocaleString()}원${mealText}\n\n`;
      }
    });

    report += `일용직 x\n\n\n세전이신분들은 세후 금액을 부탁드립니다\n\n`;

    if (yoEmp) {
      const empAdj = monthAdj[yoEmp.id] || {};
      const overtimePay = Number(empAdj.overtimePay || 0);
      const deductionPay = Number(empAdj.deductionPay || 0);
      const empShifts = scheduleRecords.filter(r => r.empId === yoEmp.id && r.date && r.date.startsWith(monthKey));
      const rateObj = pRatesMap[yoEmp.id] || {};
      const currentWeekdayRate = Number(yoEmp.weekdayRate) || Number(yoEmp.hourlyRate) || Number(rateObj.weekdayRate) || 25000;
      const currentHolidayRate = Number(yoEmp.holidayRate) || Number(rateObj.holidayRate) || 27000;
      const currentBreakHours = Number(rateObj.breakHours) || 1.0;
      const calc = window.LaborCalculator.calculatePharmacistPayroll(empShifts, currentWeekdayRate, currentHolidayRate, currentBreakHours);
      const pretaxTotal = calc.totalPayroll + overtimePay - deductionPay;

      report += `${yoEmp.name} 세전 ${pretaxTotal.toLocaleString()}원`;
    }

    if (navigator.clipboard) {
      navigator.clipboard.writeText(report);
      alert('📋 [세무사 제출용 카톡 급여 집계표]가 복사되었습니다!\n\n카카오톡 세무사 대화방에 Ctrl+V로 즉시 붙여넣기 하세요.\n\n' + report);
    } else {
      alert(report);
    }
  }

 
// 1. 개인 자율 스케줄 제출 함수
  // 1. 개인 자율 스케줄 제출 함수
  function submitMySchedule() {
    const currUser = window.SheetsSync.getCurrentUser();
    if (!currUser) {
      alert("⚠️ 스케줄 제출을 위해 먼저 로그인해 주세요.");
      if (window.App && typeof window.App.showLoginModal === 'function') {
        window.App.showLoginModal();
      }
      return;
    }

    const data = window.SheetsSync.getData();
    let scheduleStatus = data.scheduleStatus || {};
    const monthKey = currentYear + '-' + String(currentMonth).padStart(2, '0');
    
    let statusObj = scheduleStatus[monthKey] || {};
    
    // 내 상태를 '제출 완료(SUBMITTED)'로 변경 및 제출 시각/직원 기록
    statusObj[currUser.id] = 'SUBMITTED';
    statusObj[currUser.id + '_lastSubmittedAt'] = Date.now();
    statusObj.lastSubmittedEmpName = currUser.name;
    statusObj.lastSubmittedAt = Date.now();
    statusObj.hasNewSubmission = true; // 약국장 알림 뱃지 트리가용

    scheduleStatus[monthKey] = statusObj;
    window.SheetsSync.saveData(window.SheetsSync.STORAGE_KEYS.SCHEDULE_STATUS, scheduleStatus);

    render('module-content');
    alert("📤 " + currentMonth + "월 스케줄이 약국장님께 성공적으로 제출되었습니다!\n(약국장님 화면에 실시간 알림 뱃지와 제출자 알림 카드가 즉시 생성됩니다)");
  }

  // 2. 약국장 통합 마스터 승인 함수
  function approveMasterSchedule() {
    const currUser = window.SheetsSync.getCurrentUser();
    if (!currUser || (currUser.role !== '약국장' && currUser.id !== 'emp_1')) {
      alert("🔒 [보안 권한 통제] 전체 스케줄 최종 승인 및 확정은 대표 약국장(문성도) 권한으로만 가능합니다.");
      return;
    }

    const data = window.SheetsSync.getData();
    const employees = data.employees || [];
    let scheduleStatus = data.scheduleStatus || {};
    const monthKey = currentYear + '-' + String(currentMonth).padStart(2, '0');
    
    let statusObj = scheduleStatus[monthKey] || {};

    // 💡 약국장 마스터 최종 승인 확정 시: 전체 직원(전원)의 상태를 '확정(APPROVED)'으로 일괄 완료 처리
    employees.forEach(emp => {
      if (emp.role !== '약국장') {
        statusObj[emp.id] = 'APPROVED';
      }
    });
    
    statusObj.directorApproved = true;
    statusObj.pharmacistStatus = 'APPROVED';
    statusObj.staffStatus = 'APPROVED';
    statusObj.approvedAt = new Date().toLocaleString('ko-KR');
    statusObj.approvedTimestamp = Date.now(); // 🛡️ 타임스탬프로 충돌 우선순위 보장

    scheduleStatus[monthKey] = statusObj;

    // 🛡️ 1단계: localStorage에 직접 즉시 기록 (saveData가 getData()에 의존하는 타이밍 이슈 방지)
    try {
      localStorage.setItem(window.SheetsSync.STORAGE_KEYS.SCHEDULE_STATUS, JSON.stringify(scheduleStatus));
    } catch(e) {}

    // 🛡️ 2단계: SheetsSync 공식 저장 + Firebase 업로드
    window.SheetsSync.saveData(window.SheetsSync.STORAGE_KEYS.SCHEDULE_STATUS, scheduleStatus);

    // 🛡️ 3단계: 2초 후 Firebase에 한 번 더 강제 업로드 (네트워크 지연 대비)
    setTimeout(() => {
      if (window.SheetsSync.pushToCloud) {
        window.SheetsSync.pushToCloud();
      }
    }, 2000);

    render('module-content');
    alert('🏆 ' + currentYear + '년 ' + currentMonth + '월 전체 직원 근무 스케줄이 최종 확정되었습니다!\n(모든 직원의 스케줄이 일괄 제출 및 확정 완료 처리되었습니다.)');
  }

  // 2-2. 직원 알림 닫기 함수
  function dismissNotice() {
    const currUser = window.SheetsSync.getCurrentUser();
    if (!currUser) return;
    const data = window.SheetsSync.getData();
    let scheduleStatus = data.scheduleStatus || {};
    const monthKey = currentYear + '-' + String(currentMonth).padStart(2, '0');
    let statusObj = scheduleStatus[monthKey] || {};
    statusObj[currUser.id + '_dismissed'] = true;
    scheduleStatus[monthKey] = statusObj;
    window.SheetsSync.saveData(window.SheetsSync.STORAGE_KEYS.SCHEDULE_STATUS, scheduleStatus);
    render('module-content');
  }

  // 3. 약국장 개별 스케줄 반려(재수정 요청) 함수
  function rejectMasterSchedule(specificEmpId = null) {
    const currUser = window.SheetsSync.getCurrentUser();
    if (!currUser || (currUser.role !== '약국장' && currUser.id !== 'emp_1')) {
      alert("🔒 [보안 권한 통제] 스케줄 반려 및 재조율 요청은 대표 약국장(문성도) 권한으로만 가능합니다.");
      return;
    }

    const data = window.SheetsSync.getData();
    const targetEmployees = (data.employees || []).filter(e => e.role !== '약국장' && e.name !== '이정은' && e.name !== '주찬양');
    
    let targetEmp = null;
    if (specificEmpId && typeof specificEmpId === 'string') {
      targetEmp = targetEmployees.find(e => e.id === specificEmpId || e.name === specificEmpId);
    }

    if (!targetEmp) {
      const empListText = targetEmployees.map((e, idx) => `[${idx + 1}] ${e.name} (${e.role})`).join('\n');
      const input = prompt(`↩️ 누구의 스케줄을 재조율(반려)하시겠습니까?\n직원 번호 또는 이름을 입력하세요:\n\n${empListText}`);
      if (!input) return;

      const trimmed = input.trim();
      const num = parseInt(trimmed);
      if (!isNaN(num) && num >= 1 && num <= targetEmployees.length) {
        targetEmp = targetEmployees[num - 1];
      } else {
        targetEmp = targetEmployees.find(e => e.name === trimmed || e.id === trimmed);
      }
    }

    if (!targetEmp) {
      alert("⚠️ 해당 직원을 찾을 수 없습니다. 번호 또는 정확한 이름을 입력해 주세요.");
      return;
    }

    const note = prompt(`'${targetEmp.name}' 님에게 전달할 수정 요청 사유를 입력하세요:`, '근무 시간 및 인원 조율 필요');
    if (note === null) return;

    let scheduleStatus = data.scheduleStatus || {};
    const monthKey = currentYear + '-' + String(currentMonth).padStart(2, '0');
    let statusObj = scheduleStatus[monthKey] || {};

    // 해당 직원을 DRAFT로 전환하고 개별 피드백 저장
    statusObj[targetEmp.id] = 'DRAFT';
    statusObj[targetEmp.id + '_comment'] = note;
    statusObj[targetEmp.id + '_dismissed'] = false;
    statusObj.directorComment = `[${targetEmp.name}님 지정 피드백] ${note}`;
    statusObj.directorApproved = false;

    scheduleStatus[monthKey] = statusObj;
    window.SheetsSync.saveData(window.SheetsSync.STORAGE_KEYS.SCHEDULE_STATUS, scheduleStatus);
    render('module-content');
    alert(`↩️ ${targetEmp.name} 님의 스케줄이 반려(재조율 요청) 처리되었습니다.`);
  }
  function renderInlineWorkPanel(currUser, employees) {
    if (!activeInlinePanel) return '';
    if (!currUser) return '';

    const isDirector = currUser.role === '약국장';

    // 🔒 보안 권한 제어: 약국장이 아닌 직원은 약국장 전용 급여 등록/편집창(타 직원 명세서) 표시 절대 차단!
    if (!isDirector) {
      if (activeInlinePanel === 'director-tax-pdf' || (activeInlinePanel !== 'my-paystub' && activeInlinePanel !== currUser.id)) {
        activeInlinePanel = null;
        return '';
      }
    }

    if (activeInlinePanel === 'director-tax-pdf') {
      return renderInlineDirectorTaxPdfPanel(employees);
    } else if (activeInlinePanel === 'my-paystub') {
      return renderInlinePersonalPaystubDetail(currUser);
    } else {
      return renderInlineIndividualPaystubPanel(activeInlinePanel, employees);
    }
  }

  function renderInlineDirectorTaxPdfPanel(employees) {
    const currentMatches = window._activeTaxMatches || [
      { empId: 'emp_6', empName: '이승학', role: '일반직원', preTax: 2795540, deduction: 305540, net: 2490000, pageNum: 1, matched: true },
      { empId: 'emp_3', empName: '양윤지', role: '근무약사', preTax: 4532000, deduction: 449980, net: 4082020, pageNum: 2, matched: true },
      { empId: 'emp_2', empName: '권명주', role: '근무약사', preTax: 1650000, deduction: 160510, net: 1489490, pageNum: 3, matched: true },
      { empId: 'emp_7', empName: '김제희', role: '일반직원', preTax: 2320000, deduction: 236300, net: 2083700, pageNum: 5, matched: true },
      { empId: 'emp_9', empName: '김배영', role: '일반직원', preTax: 1106700, deduction: 108130, net: 998570, pageNum: 6, matched: true },
      { empId: 'emp_4', empName: '김동완', role: '근무약사', preTax: 3329000, deduction: 310080, net: 3018920, pageNum: 7, matched: true },
      { empId: 'emp_8', empName: '윤세라', role: '일반직원', preTax: 1870810, deduction: 175690, net: 1695120, pageNum: 8, matched: true }
    ];

    let html = '';
    html += '<div id="inline-panel-container" class="card-section my-5" style="background:#ffffff; border:3px solid #2563eb; border-radius:24px; box-shadow:0 25px 50px -12px rgba(37,99,235,0.25); overflow:hidden; position:relative;">';
    html += '  <div style="background:linear-gradient(135deg, #1e3a8a 0%, #1d4ed8 100%); color:#ffffff; padding:24px 30px; border-bottom:3px solid #1e40af;">';
    html += '    <div class="d-flex justify-content-between align-items-center flex-wrap gap-3">';
    html += '      <div class="d-flex align-items-center gap-3">';
    html += '        <div style="width:54px; height:54px; border-radius:16px; background:rgba(255,255,255,0.18); color:#ffffff; display:flex; justify-content:center; align-items:center; font-size:26px; flex-shrink:0; backdrop-filter:blur(4px);">';
    html += '          <i class="fas fa-file-invoice"></i>';
    html += '        </div>';
    html += '        <div>';
    html += '          <span class="badge" style="background:rgba(255,255,255,0.25); color:#ffffff; font-size:12px; padding:5px 12px; border-radius:12px; font-weight:700;">약국장 전용 세무사 통합 명세서 원클릭 센터</span>';
    html += '          <h2 style="font-size:22px; font-weight:800; margin:4px 0 0 0; color:#ffffff; letter-spacing:-0.3px;">';
    html += '            📁 세후 세무사통합명세서 등록 및 1클릭 교부 센터';
    html += '          </h2>';
    html += '        </div>';
    html += '      </div>';
    html += '      <button type="button" class="btn font-bold" onclick="ScheduleModule.closeInlinePanel()" style="background:#ffffff; color:#dc2626; border:none; padding:10px 20px; border-radius:14px; box-shadow:0 4px 12px rgba(0,0,0,0.15);">';
    html += '        <i class="fas fa-times me-1"></i> 작업창 닫기';
    html += '      </button>';
    html += '    </div>';
    html += '  </div>';

    html += '  <div style="padding:28px 30px 30px 30px;">';
    html += '    <div class="alert alert-info p-3 mb-4" style="font-size:14px; line-height:1.65; border-radius:16px; background:#f0f9ff; border:1.5px solid #bae6fd; color:#0369a1;">';
    html += '      📌 <strong>[1클릭 자동 분할 & 일일 알바 미신고자 자동 예외처리 안내]</strong><br>';
    html += '      세무사 통파일 PDF를 올리시면 <strong>각 직원 이름에 해당하는 명세서 1페이지가 사진/파일로 자동 분할</strong>되어 각 직원의 개별 계정으로 일괄 등록됩니다.<br>';
    html += '      세무 신고 대상이 아닌 일일 알바 직원은 <strong>미포함(세무제외) 상태로 안전하게 자동 유지</strong>됩니다!';
    html += '    </div>';

    html += '    <div class="card p-5 mb-4 text-center" style="background:#ffffff; border:1px solid #e2e8f0; border-radius:24px; box-shadow:0 10px 30px rgba(15,23,42,0.04);">';
    html += '      <div class="d-flex flex-column align-items-center justify-content-center gap-2">';
    html += '        <div style="width:72px; height:72px; border-radius:20px; background:linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); color:#2563eb; display:flex; justify-content:center; align-items:center; font-size:32px; margin-bottom:8px; box-shadow:0 8px 16px rgba(37,99,235,0.12);">';
    html += '          <i class="fas fa-file-pdf"></i>';
    html += '        </div>';
    html += '        <h3 style="font-size:19px; font-weight:800; color:#0f172a; margin:0;">';
    html += '          세무사 전달 PDF 통합 파일 업로드';
    html += '        </h3>';
    html += '        <p style="font-size:13.5px; color:#64748b; font-weight:600; margin:0 0 18px 0;">(파일 선택 즉시 직원별 1페이지 사진 자동 추출 및 실수령액 매칭이 진행됩니다)</p>';
    html += '        <div style="width:100%; max-width:360px;">';
    // 💡 1. 투박한 기본 file input은 화면에서 숨김 처리 (display:none)
    html += '          <input type="file" id="tax-pdf-file-selector" accept=".pdf" style="display:none;" onchange="ScheduleModule.processTaxPdfFile(this)">';
    // 💡 2. input을 대신 클릭해주는 고급스러운 라벨(Label) 버튼 제작
    html += '          <label for="tax-pdf-file-selector" class="hover-shadow" style="display:flex; justify-content:center; align-items:center; gap:10px; width:100%; background:#1e293b; color:#ffffff; padding:15px 24px; border-radius:14px; font-size:15px; font-weight:700; cursor:pointer; box-shadow:0 6px 16px rgba(15,23,42,0.2); transition:transform 0.2s; margin:0;" onmouseover="this.style.transform=\'scale(1.02)\'" onmouseout="this.style.transform=\'scale(1)\'">';
    html += '            <i class="fas fa-folder-open"></i> 내 PC에서 PDF 파일 선택하기';
    html += '          </label>';
    html += '        </div>';
    html += '      </div>';
    html += '    </div>';

    html += '    <div id="tax-paystub-preview-wrapper">';
    html +=        renderTaxPaystubPreviewTable(currentMatches, employees);
    html += '    </div>';
    html += '  </div>';
    html += '</div>';

    return html;
  }

  function renderInlineIndividualPaystubPanel(empId, employees) {
    const data = window.SheetsSync.getData ? window.SheetsSync.getData() : {};
    const emps = employees || data.employees || [];
    const emp = emps.find(e => e.id === empId || e.name === empId) || emps[0];

    if (!emp) return '';

    const monthKey = currentYear + '-' + String(currentMonth).padStart(2, '0');
    const allPaystubs = window.SheetsSync.getPaystubs ? window.SheetsSync.getPaystubs() : {};
    const existing = (allPaystubs[monthKey] && allPaystubs[monthKey][emp.id]) || {};

    const allAdjustments = window.SheetsSync.getOvertimeAdjustments ? window.SheetsSync.getOvertimeAdjustments() : {};
    const empAdj = (allAdjustments[monthKey] && allAdjustments[monthKey][emp.id]) || { overtimePay: 0, deductionPay: 0 };

    const scheduleRecords = window.SheetsSync.getSchedule ? window.SheetsSync.getSchedule() : [];
    const empShifts = scheduleRecords.filter(r => r.empId === emp.id && r.date && r.date.startsWith(monthKey));

    const isPharmacist = emp.role && emp.role.includes('약사');
    let pretaxTotal = 0;

    if (isPharmacist) {
      const calc = window.LaborCalculator.calculatePharmacistPayroll(empShifts, emp.hourlyRate || 35000);
      pretaxTotal = calc.totalPayroll;
    } else {
      const baseSal = emp.baseMonthlySalary || 2621500;
      pretaxTotal = baseSal + 200000 + (empAdj.overtimePay || 0) - (empAdj.deductionPay || 0);
    }

    const defaultNetSalary = existing.netSalary || Math.round(pretaxTotal * 0.91);
    const defaultDeduction = existing.totalDeduction || (pretaxTotal - defaultNetSalary);

    let html = '';
    html += '<div id="inline-panel-container" class="card-section mb-5" style="background:#ffffff; border:2.5px solid #059669; border-radius:22px; padding:30px; box-shadow:0 20px 45px -10px rgba(5,150,105,0.25);">';
    html += '  <div class="d-flex justify-content-between align-items-center mb-4 pb-3 border-bottom">';
    html += '    <div class="d-flex align-items-center gap-3">';
    html += '      <div style="width:48px; height:48px; border-radius:12px; background:#d1fae5; color:#047857; display:flex; justify-content:center; align-items:center; font-size:24px;">';
    html += '        <i class="fas fa-file-signature"></i>';
    html += '      </div>';
    html += '      <div>';
    html += '        <span class="badge bg-success mb-1" style="font-size:11.5px; border-radius:10px;">약국장 전용 개별 급여명세서 교부</span>';
    html += '        <h3 style="font-size:20px; font-weight:800; margin:0; color:#0f172a;">';
    html += '          📄 ' + emp.name + ' ' + emp.role + ' (' + currentYear + '년 ' + currentMonth + '월 세후 명세서 등록)';
    html += '        </h3>';
    html += '      </div>';
    html += '    </div>';
    html += '    <button type="button" class="btn btn-outline-danger font-bold" onclick="ScheduleModule.closeInlinePanel()" style="border-radius:12px; padding:8px 16px;">';
    html += '      <i class="fas fa-times me-1"></i> 작업창 닫기';
    html += '    </button>';
    html += '  </div>';

    html += '  <div class="card p-3 mb-4" style="background:#f8fafc; border-radius:14px; border:1.5px solid #e2e8f0; font-size:14px; color:#1e293b;">';
    html += '    <div class="row g-2">';
    html += '      <div class="col-6"><strong>성명:</strong> ' + emp.name + ' (' + (emp.position || '직원') + ')</div>';
    html += '      <div class="col-6"><strong>계정 이메일:</strong> ' + (emp.email || '-') + '</div>';
    html += '      <div class="col-12"><strong>당월 계산 세전 총급여액:</strong> <strong class="text-success" style="font-size:16px;">' + pretaxTotal.toLocaleString() + ' 원</strong></div>';
    html += '    </div>';
    html += '  </div>';

    html += '  <form onsubmit="ScheduleModule.saveDirectorPaystub(event, \'' + emp.id + '\')">';
    html += '    <div class="mb-3">';
    html += '      <label class="form-label font-bold" style="font-size:14px; color:#0f172a;">💰 세무사 확정 세후 실수령액 (원)</label>';
    html += '      <input type="text" id="ps-net-salary" class="form-control form-control-lg font-bold" style="color:#059669; font-size:18px; background:#ffffff; border:2px solid #059669; border-radius:12px; padding:10px 14px; box-shadow:0 2px 4px rgba(5,150,105,0.08);" value="' + (defaultNetSalary ? defaultNetSalary.toLocaleString() : '0') + '" required placeholder="예: 2,680,500" oninput="let v = this.value.replace(/[^0-9-]/g, \'\'); this.value = v ? Number(v).toLocaleString() : \'\';">';
    html += '    </div>';
    html += '    <div class="mb-3">';
    html += '      <label class="form-label font-bold" style="font-size:13.5px; color:#0f172a;">🛡️ 4대보험 및 세금 공제 총액 (원)</label>';
    html += '      <input type="text" id="ps-total-deduction" class="form-control font-bold" style="color:#dc2626; font-size:15px; background:#ffffff; border:1.5px solid #cbd5e1; border-radius:12px; padding:10px 14px;" value="' + (defaultDeduction ? defaultDeduction.toLocaleString() : '0') + '" placeholder="예: 341,000" oninput="let v = this.value.replace(/[^0-9-]/g, \'\'); this.value = v ? Number(v).toLocaleString() : \'\';">';
    html += '    </div>';

    html += '    <div class="mb-3 p-3" style="background:#f8fafc; border:1.5px solid #e2e8f0; border-radius:14px;">';
    html += '      <label class="form-label font-bold" style="font-size:13.5px; color:#0f172a; mb-2">📎 세무사 제공 명세서 사진 1장 또는 PDF 파일 선택</label>';
    html += '      <input type="file" id="ps-file-input" class="form-control mb-2" accept="image/*,.pdf" style="background:#ffffff; border:1.5px solid #cbd5e1; border-radius:10px; padding:8px 12px;" onchange="ScheduleModule.handlePaystubFileChange(this)">';
    html += '      <input type="text" id="ps-file-url" class="form-control" style="background:#ffffff; border:1.5px solid #cbd5e1; border-radius:10px; padding:8px 12px; font-weight:600;" value="' + (existing.pdfUrl || '') + '" placeholder="또는 이미지/웹 명세서 URL 주소 입력">';
    html += '      <input type="hidden" id="ps-file-data" value="' + (existing.fileData || '') + '">';
    html += '      <input type="hidden" id="ps-file-name" value="' + (existing.fileName || '') + '">';
    html += '      <span class="form-text" style="font-size:12px; color:#64748b; margin-top:6px; display:block;">💡 명세서 사진(또는 PDF) 선택 시 직원의 계정에서 바로 이미지로 크게보기 및 다운로드가 가능합니다.</span>';
    html += '    </div>';

    html += '    <div class="mb-3">';
    html += '      <label class="form-label font-bold" style="font-size:13.5px; color:#0f172a;">💬 약국장 전달 메모 (선택사항)</label>';
    html += '      <textarea id="ps-note" class="form-control" style="background:#ffffff; border:1.5px solid #cbd5e1; border-radius:12px; padding:10px 14px; font-weight:600;" rows="2" placeholder="예: 8월 노고 많으셨습니다. 세무사 검토 완료분입니다.">' + (existing.note || '8월 확정 급여명세서입니다. 노고에 감사드립니다.') + '</textarea>';
    html += '    </div>';

    html += '    <input type="hidden" id="ps-published" value="true">';

    html += '    <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 pt-3 border-top">';
    html += '      <button type="button" class="btn btn-secondary font-bold" onclick="ScheduleModule.closeInlinePanel()" style="border-radius:12px; padding:10px 20px;">취소</button>';
    html += '      <button type="submit" class="btn btn-success btn-lg font-bold" style="padding:12px 28px; border-radius:14px; box-shadow:0 4px 14px rgba(16,185,129,0.3);">';
    html += '        <i class="fas fa-paper-plane me-1"></i> ' + emp.name + ' 님 ' + currentMonth + '월 급여명세서 저장 및 이메일 즉시 발송';
    html += '      </button>';
    html += '    </div>';
    html += '  </form>';
    html += '</div>';

    return html;
  }

  function renderInlinePersonalPaystubDetail(currUser) {
    if (!currUser) return '';

    let html = '';
    html += '<div id="inline-panel-container" class="card-section mb-5" style="background:#ffffff; border:2px solid #2563eb; border-radius:22px; padding:26px; box-shadow:0 10px 30px rgba(37,99,235,0.15);">';
    html += '  <div class="d-flex justify-content-between align-items-center mb-3 pb-3 border-bottom">';
    html += '    <div class="d-flex align-items-center gap-3">';
    html += '      <div style="width:48px; height:48px; border-radius:14px; background:#eff6ff; color:#2563eb; display:flex; justify-content:center; align-items:center; font-size:22px;">';
    html += '        <i class="fas fa-shield-alt"></i>';
    html += '      </div>';
    html += '      <div>';
    html += '        <span class="badge bg-primary mb-1" style="font-size:11.5px; border-radius:10px;">🔒 급여명세서 개인정보 보호</span>';
    html += '        <h3 style="font-size:20px; font-weight:800; margin:0; color:#0f172a;">';
    html += '          📄 ' + currUser.name + ' 님의 급여명세서 안내';
    html += '        </h3>';
    html += '      </div>';
    html += '    </div>';
    html += '    <button type="button" class="btn btn-outline-secondary font-bold" onclick="ScheduleModule.closeInlinePanel()">';
    html += '      <i class="fas fa-times me-1"></i> 창 닫기';
    html += '    </button>';
    html += '  </div>';
    html += '  <div class="alert alert-info p-3 mb-0" style="font-size:14px; border-radius:14px; line-height:1.6;">';
    html += '    약국 현장 보안 및 개인 금융정보 보호를 위해 화면에는 급여 액수가 표시되지 않습니다.<br>';
    html += '    확정 급여명세서는 <strong>' + currUser.name + ' 님의 등록 개인 이메일 (' + (currUser.email || '-') + ')</strong>로 안전하게 1:1 발송되었습니다.';
    html += '  </div>';
    html += '</div>';

    return html;
  }

  function openDirectorTaxPaystubModal() {
    activeInlinePanel = 'director-tax-pdf';
    render('module-content');
    setTimeout(() => {
      const panel = document.getElementById('inline-panel-container');
      if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }

  function openUploadPaystubModal(empId) {
    activeInlinePanel = empId;
    render('module-content');
    setTimeout(() => {
      const panel = document.getElementById('inline-panel-container');
      if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }

  function showMyPaystubModal() {
    activeInlinePanel = 'my-paystub';
    render('module-content');
    setTimeout(() => {
      const panel = document.getElementById('inline-panel-container');
      if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }

  function showPaystubByEmpId(empId) {
    activeInlinePanel = empId;
    render('module-content');
    setTimeout(() => {
      const panel = document.getElementById('inline-panel-container');
      if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }

  function closeInlinePanel() {
    activeInlinePanel = null;
    render('module-content');
  }

  

  function updateStaffOvertimePay(empId, overtimeVal, deductionVal) {
    const monthKey = currentYear + '-' + String(currentMonth).padStart(2, '0');
    const allAdjustments = window.SheetsSync.getOvertimeAdjustments ? window.SheetsSync.getOvertimeAdjustments() : {};
    if (!allAdjustments[monthKey]) allAdjustments[monthKey] = {};
    if (!allAdjustments[monthKey][empId]) allAdjustments[monthKey][empId] = { overtimePay: 0, deductionPay: 0 };

    if (overtimeVal !== null && overtimeVal !== undefined) {
      allAdjustments[monthKey][empId].overtimePay = parseInt(overtimeVal) || 0;
    }
    if (deductionVal !== null && deductionVal !== undefined) {
      allAdjustments[monthKey][empId].deductionPay = parseInt(deductionVal) || 0;
    }

    window.SheetsSync.saveOvertimeAdjustments(allAdjustments);
    render('module-content');
  }

  function updatePharmacistRateSettings(empId, weekdayRate, holidayRate, breakHours) {
    const emps = window.SheetsSync.getEmployees ? window.SheetsSync.getEmployees() : [];
    const emp = emps.find(e => e.id === empId);
    if (emp && weekdayRate !== null && weekdayRate !== undefined && weekdayRate !== '') {
      emp.hourlyRate = parseInt(weekdayRate) || 35000;
      window.SheetsSync.saveEmployees(emps);
    }

    const pRatesMap = window.SheetsSync.getPharmacistRates ? window.SheetsSync.getPharmacistRates() : {};
    if (!pRatesMap[empId]) pRatesMap[empId] = { weekdayRate: (emp ? emp.hourlyRate : 35000), holidayRate: 40000, breakHours: 1.0 };
    if (weekdayRate !== null && weekdayRate !== undefined && weekdayRate !== '') pRatesMap[empId].weekdayRate = parseInt(weekdayRate) || 35000;
    if (holidayRate !== null && holidayRate !== undefined && holidayRate !== '') pRatesMap[empId].holidayRate = parseInt(holidayRate) || 40000;
    if (breakHours !== null && breakHours !== undefined && breakHours !== '') pRatesMap[empId].breakHours = parseFloat(breakHours) || 1.0;

    if (window.SheetsSync.savePharmacistRates) window.SheetsSync.savePharmacistRates(pRatesMap);
    render('module-content');
  }

  function updateStaffSalarySettings(empId, hourlyRate, baseMonthlySalary) {
    const emps = window.SheetsSync.getEmployees ? window.SheetsSync.getEmployees() : [];
    const emp = emps.find(e => e.id === empId);
    if (emp) {
      if (hourlyRate !== null && hourlyRate !== undefined && hourlyRate !== '') {
        emp.hourlyRate = parseInt(hourlyRate) || 13000;
      }
      if (baseMonthlySalary !== null && baseMonthlySalary !== undefined && baseMonthlySalary !== '') {
        emp.baseMonthlySalary = parseInt(baseMonthlySalary) || 2621500;
      }
      window.SheetsSync.saveEmployees(emps);
    }
    render('module-content');
  }

  function handlePaystubFileChange(input) {
    if (input.files && input.files[0]) {
      const file = input.files[0];
      const reader = new FileReader();
      reader.onload = function(e) {
        document.getElementById('ps-file-data').value = e.target.result;
        document.getElementById('ps-file-name').value = file.name;
      };
      reader.readAsDataURL(file);
    }
  }

  // 2. 급여명세서 최종 등록 함수 (Cloudinary 업로드 및 콤마 제거 로직)
  async function saveDirectorPaystub(e, empId) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> 저장 및 업로드 중...';
    }

    try {
      const monthKey = currentYear + '-' + String(currentMonth).padStart(2, '0');
      const allPaystubs = window.SheetsSync.getPaystubs ? window.SheetsSync.getPaystubs() : {};
      if (!allPaystubs[monthKey]) allPaystubs[monthKey] = {};

      const netSalary = parseInt(document.getElementById('ps-net-salary').value.replace(/,/g, '')) || 0;
      const totalDeduction = parseInt(document.getElementById('ps-total-deduction').value.replace(/,/g, '')) || 0;
      
      let pdfUrl = document.getElementById('ps-file-url').value.trim();
      let fileData = document.getElementById('ps-file-data').value;
      const fileName = document.getElementById('ps-file-name').value;
      const note = document.getElementById('ps-note').value.trim();
      const pubEl = document.getElementById('ps-published');
      const published = pubEl ? (pubEl.value === 'true' || pubEl.checked) : true;

      // 🚀 개별 등록 시에도 이미지 파일이 있으면 Cloudinary 영구 호스팅 업로드
      if (fileData && fileData.startsWith('data:image') && window.App && typeof window.App.processAndUploadPhoto === 'function') {
        const cloudUrl = await window.App.processAndUploadPhoto(fileData);
        if (cloudUrl && cloudUrl.startsWith('http')) {
          fileData = cloudUrl;
          if (!pdfUrl) pdfUrl = cloudUrl;
        }
      }

      const now = new Date();
      const pad = n => String(n).padStart(2, '0');
      const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

      allPaystubs[monthKey][empId] = {
        empId,
        year: currentYear,
        month: currentMonth,
        netSalary,
        totalDeduction,
        pdfUrl,
        fileData,
        fileName,
        note,
        published,
        updatedAt: dateStr
      };

      window.SheetsSync.savePaystubs(allPaystubs);

      // 📧 발행 체크 시 해당 직원 개인 이메일로 1:1 확정 급여명세서 즉시 발송
      const data = window.SheetsSync.getData ? window.SheetsSync.getData() : {};
      const emps = window.SheetsSync.getEmployees ? window.SheetsSync.getEmployees() : (data.employees || []);
      const targetEmp = emps.find(e => e.id === empId);

      if (published && targetEmp && targetEmp.email && window.SheetsSync && typeof window.SheetsSync.sendPaystubEmailToStaff === 'function') {
        window.SheetsSync.sendPaystubEmailToStaff({
          email: targetEmp.email,
          name: targetEmp.name,
          year: currentYear,
          month: currentMonth,
          netSalary,
          preTax: 0,
          totalDeduction,
          fileUrl: pdfUrl || fileData,
          note: note || (currentMonth + '월 세무사 확정 급여명세서입니다. 노고에 감사드립니다!')
        });
      }

      closeInlinePanel();
      render('module-content');
      alert('🎉 ' + (targetEmp ? targetEmp.name : '직원') + ' 님의 급여명세서가 ' + (published ? '등록 완료 및 개인 이메일(' + (targetEmp ? targetEmp.email : '미등록') + ')로 안전하게 1:1 발송' : '임시 저장') + '되었습니다!');
    } catch(err) {
      console.error('saveDirectorPaystub error:', err);
      alert('⚠️ 저장 중 오류가 발생했습니다: ' + err.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-envelope me-1"></i> 급여명세서 저장 및 이메일 발송';
      }
    }
  }

  function openPaystubAttachment(empId) {
    const monthKey = currentYear + '-' + String(currentMonth).padStart(2, '0');
    const allPaystubs = window.SheetsSync.getPaystubs ? window.SheetsSync.getPaystubs() : {};
    const paystub = (allPaystubs[monthKey] && allPaystubs[monthKey][empId]) || {};

    const urlOrData = paystub.fileData || paystub.pdfUrl;
    if (!urlOrData) {
      alert('등록된 명세서 파일 또는 링크가 없습니다.');
      return;
    }

    if (window.App && typeof window.App.openImageLightbox === 'function' && !urlOrData.endsWith('.pdf') && !urlOrData.startsWith('data:application/pdf')) {
      window.App.openImageLightbox(urlOrData, (paystub.fileName || '급여명세서'));
    } else {
      window.open(urlOrData, '_blank');
    }
  }

  function showUnpublishedPaystubModal(emp) {
    const modal = ensurePaystubModalExists();
    const content = document.getElementById('paystub-detail-modal-content');
    if (!content) return;

    let html = '';
    html += '<div class="text-center py-4">';
    html += '  <div style="width:70px; height:70px; border-radius:50%; background:#fef3c7; color:#d97706; display:inline-flex; justify-content:center; align-items:center; font-size:32px; margin-bottom:16px;">';
    html += '    <i class="fas fa-clock"></i>';
    html += '  </div>';
    html += '  <h3 style="font-size:20px; font-weight:bold; color:#0f172a; margin-bottom:8px;">';
    html += '    ⏳ ' + emp.name + ' 님의 ' + currentYear + '년 ' + currentMonth + '월 급여명세서 산출 중';
    html += '  </h3>';
    html += '  <p style="font-size:14px; color:#475569; max-width:440px; margin:0 auto 20px auto; line-height:1.6;">';
    html += '    현재 세무사에서 4대보험 및 세금 공제 산출 작업이 진행 중입니다.<br>';
    html += '    약국장이 최종 검토 후 <strong>세후 실수령액 및 PDF 명세서</strong>를 등록하면 즉시 열람 및 다운로드가 가능합니다.';
    html += '  </p>';
    html += '  <button type="button" class="btn btn-secondary font-bold" onclick="document.getElementById(\'paystub-detail-modal\').style.display=\'none\'">';
    html += '    확인';
    html += '  </button>';
    html += '</div>';
    content.innerHTML = html;
    modal.style.display = 'flex';
    modal.style.zIndex = '999999';
    modal.style.opacity = '1';
  }

  function showPublishedPaystubModal(emp, paystub) {
    const modal = ensurePaystubModalExists();
    const content = document.getElementById('paystub-detail-modal-content');
    if (!content) return;

    let html = '';
    html += '<div class="d-flex align-items-center gap-3 mb-3 pb-3 border-bottom">';
    html += '  <div style="width:48px; height:48px; border-radius:14px; background:#eff6ff; color:#2563eb; display:flex; justify-content:center; align-items:center; font-size:24px;">';
    html += '    <i class="fas fa-user-shield"></i>';
    html += '  </div>';
    html += '  <div>';
    html += '    <span class="badge bg-primary mb-1" style="font-size:11.5px; border-radius:10px;">🔒 급여명세서 개인정보 보호</span>';
    html += '    <h3 style="font-size:20px; font-weight:800; margin:0; color:#0f172a;">';
    html += '      📄 ' + emp.name + ' 님의 ' + currentMonth + '월 급여명세서 안내';
    html += '    </h3>';
    html += '  </div>';
    html += '</div>';

    html += '<div class="alert alert-info p-4 mb-4" style="font-size:14px; border-radius:16px; line-height:1.7; background:#f0f9ff; border:1.5px solid #bae6fd; color:#0369a1;">';
    html += '  <div class="d-flex align-items-center gap-2 mb-2 font-bold" style="font-size:15px; color:#1e40af;">';
    html += '    <i class="fas fa-lock"></i> 약국 현장 보안 및 개인 금융정보 보호 방침 안내';
    html += '  </div>';
    html += '  약국 공용 기기 및 화면 노출로 인한 <strong>개인정보 유출을 방지</strong>하기 위해, 앱 화면에는 급여 액수 및 명세서 이미지가 표시되지 않습니다.<br><br>';
    html += '  당월 확정 급여명세서는 <strong>' + emp.name + ' 님의 등록 개인 이메일 계정</strong>으로 안전하게 1:1 전송되었습니다:';
    html += '  <div class="p-3 my-2 text-center" style="background:#ffffff; border:1.5px dashed #0284c7; border-radius:12px; font-size:15px; font-weight:800; color:#0284c7;">';
    html += '    📧 ' + (emp.email || '등록된 개인 이메일') + '';
    html += '  </div>';
    html += '  개인 이메일함(네이버/네이트 등)을 열어 세무사 확정 명세서 및 실수령액을 안전하게 확인해 주시기 바랍니다.<br>';
    html += '  <span style="font-size:12px; color:#64748b;">(※ 메일이 보이지 않을 경우 스팸 메일함을 확인하시거나 약국장에게 문의해 주세요.)</span>';
    html += '</div>';

    html += '<div class="d-flex justify-content-end">';
    html += '  <button type="button" class="btn btn-primary font-bold" onclick="document.getElementById(\'paystub-detail-modal\').style.display=\'none\'" style="border-radius:12px; padding:10px 24px;">확인 완료</button>';
    html += '</div>';

    content.innerHTML = html;
    modal.style.display = 'flex';
    modal.style.zIndex = '999999';
    modal.style.opacity = '1';
  }

  function showPaystubByEmpId(empId) {
    const currUser = window.SheetsSync.getCurrentUser();
    const isDirector = currUser && currUser.role === '약국장';

    if (isDirector) {
      openUploadPaystubModal(empId);
      return;
    }

    const data = window.SheetsSync.getData ? window.SheetsSync.getData() : {};
    const employees = window.SheetsSync.getEmployees ? window.SheetsSync.getEmployees() : (data.employees || []);
    let emp = employees.find(e => e.id === empId || e.username === empId || e.email === empId || e.name === empId) || currUser;

    const monthKey = currentYear + '-' + String(currentMonth).padStart(2, '0');
    const allPaystubs = window.SheetsSync.getPaystubs ? window.SheetsSync.getPaystubs() : {};
    const monthPaystubs = allPaystubs[monthKey] || {};
    const paystub = monthPaystubs[emp.id];

    if (!paystub || !paystub.published) {
      showUnpublishedPaystubModal(emp);
      return;
    }

    // 🔒 일반 직원은 앱 화면에서 액수가 절대 뜨지 않고 이메일 확인 안내 모달만 표출
    showPublishedPaystubModal(emp, paystub);
  }

  function showMyPaystubModal() {
    const curr = window.SheetsSync.getCurrentUser();
    if (!curr) {
      alert('로그인이 필요한 서비스입니다. 계정 로그인 후 다시 이용해 주세요.');
      return;
    }
    showPaystubByEmpId(curr.id || curr.username || curr.email);
  }

  function renderTaxPaystubPreviewTable(matches, employees) {
    const matchedCount = matches.filter(m => m.matched).length;
    const verifiedCount = matches.filter(m => m.verified).length;

    let html = '';
    html += '<div class="card-section p-4 mb-4" style="background:#ffffff; border:1.5px solid #cbd5e1; border-radius:18px; box-shadow:0 4px 15px rgba(0,0,0,0.03);">';
    html += '  <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">';
    html += '    <div>';
    html += '      <h4 style="font-size:16.5px; font-weight:800; margin:0; color:#0f172a;">';
    html += '        📊 세무사 PDF 매칭 직원 (' + matchedCount + '명 매칭 / ' + verifiedCount + '명 검수완료)';
    html += '      </h4>';
    html += '      <span style="font-size:12.5px; color:#64748b;">각 직원의 <strong>[🔍 미리보기 & 검수]</strong> 버튼을 눌러 명세서와 사진이 일치하는지 1인씩 안전하게 확인하세요.</span>';
    html += '    </div>';
    html += '    <span class="badge ' + (verifiedCount === matchedCount && matchedCount > 0 ? 'bg-success' : 'bg-primary') + '" style="font-size:13px; padding:7px 14px; border-radius:20px; font-weight:700;">';
    html += '      <i class="fas fa-user-check me-1"></i> 검수 진행률: ' + verifiedCount + ' / ' + matchedCount + ' 명';
    html += '    </span>';
    html += '  </div>';

    html += '  <div class="table-responsive" style="border-radius:12px; overflow-x:auto; border:1px solid #e2e8f0; -webkit-overflow-scrolling:touch;">';
    html += '    <table class="table table-bordered table-hover align-middle mb-0" style="font-size:13.5px; min-width:760px; white-space:nowrap;">';
    html += '      <thead class="table-light">';
    html += '        <tr style="background:#f8fafc; font-weight:700; color:#334155;">';
    html += '          <th style="width:65px; white-space:nowrap;" class="text-center">페이지</th>';
    html += '          <th style="white-space:nowrap;">직원명</th>';
    html += '          <th style="white-space:nowrap;">직무</th>';
    html += '          <th class="text-end" style="white-space:nowrap;">세전 총급여</th>';
    html += '          <th class="text-end" style="white-space:nowrap;">공제액계 (4대보험/세금)</th>';
    html += '          <th style="background:#ecfdf5; color:#065f46; white-space:nowrap;" class="text-end">💰 세후 실수령액</th>';
    html += '          <th class="text-center" style="width:130px; white-space:nowrap;">중간 검수 & 대조</th>';
    html += '          <th class="text-center" style="white-space:nowrap;">상태</th>';
    html += '        </tr>';
    html += '      </thead>';
    html += '      <tbody>';

    matches.forEach(m => {
      html += '        <tr style="' + (m.matched ? '' : 'opacity:0.6; background:#f8fafc;') + '">';
      html += '          <td class="text-center font-bold text-muted" style="font-weight:700;">' + (m.pageNum ? ('P.' + m.pageNum) : '-') + '</td>';
      html += '          <td><strong style="font-size:15px; color:#0f172a;">' + m.empName + '</strong></td>';
      html += '          <td><span class="badge ' + (m.role === '근무약사' ? 'bg-primary' : 'bg-secondary') + '" style="padding:5px 10px; border-radius:8px;">' + m.role + '</span></td>';
      html += '          <td class="text-end font-bold" style="color:#475569;">' + (m.preTax ? (m.preTax.toLocaleString() + ' 원') : '-') + '</td>';
      html += '          <td class="text-end font-bold text-danger">' + (m.deduction ? ('- ' + m.deduction.toLocaleString() + ' 원') : '-') + '</td>';
      html += '          <td style="background:#f0fdf4;" class="text-end"><strong class="text-success" style="font-size:16px; font-family:\'Outfit\', sans-serif;">' + (m.net ? (m.net.toLocaleString() + ' 원') : '산출 제외') + '</strong></td>';
      html += '          <td class="text-center">';
      if (m.matched) {
        html += '            <button type="button" class="btn btn-sm ' + (m.verified ? 'btn-outline-success font-bold' : 'btn-warning font-bold text-dark') + '" onclick="ScheduleModule.openMatchInspectionModal(\'' + m.empId + '\')" style="border-radius:8px; padding:5px 12px; font-size:12.5px;">';
        html += '              <i class="fas ' + (m.verified ? 'fa-check-circle text-success' : 'fa-search') + ' me-1"></i> ' + (m.verified ? '검수완료 (다시보기)' : '🔍 미리보기 & 검수');
        html += '            </button>';
      } else {
        html += '            <span class="text-muted" style="font-size:12px;">-</span>';
      }
      html += '          </td>';
      html += '          <td class="text-center">';
      html +=              m.matched ? (m.verified ? '<span class="badge bg-success" style="padding:6px 12px; border-radius:12px;"><i class="fas fa-check-double me-1"></i> 🟢 검수완료</span>' : '<span class="badge bg-warning text-dark" style="padding:6px 12px; border-radius:12px;"><i class="fas fa-clock me-1"></i> ⏳ 검수대기</span>') : '<span class="badge bg-light text-dark" style="padding:6px 12px; border-radius:12px;">⚪ 세무미신고</span>';
      html += '          </td>';
      html += '        </tr>';
    });

    html += '      </tbody>';
    html += '    </table>';
    html += '  </div>';
    html += '</div>';

    html += '<div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mt-4 pt-3 border-top">';
    html += '  <button type="button" class="btn btn-outline-secondary font-bold" onclick="ScheduleModule.closeInlinePanel()" style="padding:10px 22px; border-radius:14px;">';
    html += '    <i class="fas fa-times me-1"></i> 작업창 닫기';
    html += '  </button>';
    html += '  <button type="button" id="btn-execute-tax-publish" class="btn btn-success btn-lg font-bold" style="padding:12px 28px; border-radius:16px; box-shadow:0 8px 20px rgba(16,185,129,0.35); font-size:16px;" onclick="ScheduleModule.executeTaxPaystubPublishing()">';
    html += '    <i class="fas fa-envelope me-1"></i> 🚀 최종 확정 급여명세서 일괄 교부 (직원 이메일 1:1 발송)';
    html += '  </button>';
    html += '</div>';

    return html;
  }

  // 🔍 약국장 1인 중간 검수 & 사진/명세서 실시간 대조 모달 (금액 수기 수정 지원)
  function openMatchInspectionModal(empId) {
    const matches = window._activeTaxMatches || [];
    const match = matches.find(m => m.empId === empId);
    if (!match) return;

    const data = window.SheetsSync.getData();
    const emps = data.employees || [];
    const emp = emps.find(e => e.id === empId) || { id: empId, name: match.empName, role: match.role };

    let modal = document.getElementById('tax-match-inspect-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'tax-match-inspect-modal';
      modal.className = 'modal-overlay';
      modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.75); z-index:9999999; display:flex; justify-content:center; align-items:center;';
      document.body.appendChild(modal);
    }

    const paystubTemp = {
      empId: emp.id,
      netSalary: match.net,
      totalDeduction: match.deduction,
      preTax: match.preTax,
      published: true
    };

    modal.innerHTML = `
      <div class="modal-card" style="background:#ffffff; border-radius:24px; max-width:980px; width:95%; max-height:92vh; overflow-y:auto; padding:28px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.5); position:relative;">
        <button type="button" class="close-btn" onclick="document.getElementById('tax-match-inspect-modal').style.display='none'" style="position:absolute; top:20px; right:24px; font-size:26px; background:none; border:none; color:#64748b; cursor:pointer;">&times;</button>
        
        <div class="d-flex align-items-center gap-3 mb-4 border-bottom pb-3">
          <div style="width:48px; height:48px; border-radius:14px; background:#eff6ff; color:#2563eb; display:flex; justify-content:center; align-items:center; font-size:22px;">
            <i class="fas fa-clipboard-check"></i>
          </div>
          <div>
            <span class="badge bg-primary mb-1" style="font-size:11.5px; border-radius:8px;">약국장 1:1 교부 전 중간 검수 & 금액 보정 모드</span>
            <h3 style="font-size:20px; font-weight:800; margin:0; color:#0f172a;">
              🔍 [${match.empName} ${match.role}] 급여명세서 & 첨부 사진 대조 검수
            </h3>
          </div>
        </div>

        <div class="alert alert-info p-3 mb-3" style="font-size:13.5px; border-radius:12px; line-height:1.5;">
          📌 세무사 PDF에서 추출된 <strong>1페이지 원본 명세서 사진</strong>과 <strong>세후 실수령액</strong>을 확인해 주세요.<br>
          필요 시 아래 입력창에서 금액을 직접 수정하신 후 확인 버튼을 누르시면 반영됩니다.
        </div>

        <!-- 💰 실시간 금액 확인 및 수정 폼 -->
        <div class="card p-3 mb-4" style="background:#f8fafc; border:1.5px solid #cbd5e1; border-radius:16px;">
          <div class="row g-3 align-items-center">
            <div class="col-md-4">
              <label class="form-label font-bold text-success" style="font-size:14px;">💰 세후 실수령액 (원)</label>
              <input type="text" id="inspect-net" class="form-control form-control-lg font-bold text-success" style="font-size:20px; border:2px solid #059669; border-radius:12px;" value="${(match.net || 0).toLocaleString()}" oninput="let v=this.value.replace(/[^0-9-]/g,''); this.value=v?Number(v).toLocaleString():'';">
            </div>
            <div class="col-md-4">
              <label class="form-label font-bold text-muted" style="font-size:13px;">세전 총급여 (원)</label>
              <input type="text" id="inspect-pretax" class="form-control font-bold" style="font-size:16px; border:1.5px solid #cbd5e1; border-radius:10px;" value="${(match.preTax || 0).toLocaleString()}" oninput="let v=this.value.replace(/[^0-9-]/g,''); this.value=v?Number(v).toLocaleString():'';">
            </div>
            <div class="col-md-4">
              <label class="form-label font-bold text-danger" style="font-size:13px;">4대보험/세금 공제총액 (원)</label>
              <input type="text" id="inspect-deduction" class="form-control font-bold text-danger" style="font-size:16px; border:1.5px solid #cbd5e1; border-radius:10px;" value="${(match.deduction || 0).toLocaleString()}" oninput="let v=this.value.replace(/[^0-9-]/g,''); this.value=v?Number(v).toLocaleString():'';">
            </div>
          </div>
        </div>

        <!-- 📷 세무사 PDF 추출 원본 1페이지 사진 (선명하고 쾌적한 뷰어) -->
        <div class="card p-3 mb-4" style="background:#ffffff; border:1.5px solid #cbd5e1; border-radius:18px;">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <h4 style="font-size:15.5px; font-weight:800; color:#065f46; margin:0;">
              <i class="fas fa-image text-success me-1"></i> 세무사 PDF 추출 원본 1페이지 명세서 (P.${match.pageNum})
            </h4>
          </div>
          <div style="background:#1e293b; padding:16px; border-radius:14px; text-align:center; max-height:550px; overflow-y:auto;">
            ${match.pageImageData ? `<img src="${match.pageImageData}" style="max-width:100%; border-radius:8px; box-shadow:0 8px 25px rgba(0,0,0,0.5);" />` : '<div class="text-white py-5">첨부된 사진이 없습니다.</div>'}
          </div>
        </div>

        <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 pt-3 border-top">
          <button type="button" class="btn btn-secondary font-bold" onclick="document.getElementById('tax-match-inspect-modal').style.display='none'" style="border-radius:12px; padding:10px 20px;">
            닫기
          </button>
          <button type="button" class="btn btn-success btn-lg font-bold" onclick="ScheduleModule.confirmMatchInspection('${match.empId}')" style="border-radius:14px; padding:12px 28px; box-shadow:0 4px 14px rgba(16,185,129,0.3);">
            <i class="fas fa-check-circle me-1"></i> ✅ [${match.empName}] 명세서 및 금액 확인 완료
          </button>
        </div>
      </div>
    `;

    modal.style.display = 'flex';
    modal.style.zIndex = '9999999';
  }

  function confirmMatchInspection(empId) {
    const matches = window._activeTaxMatches || [];
    const match = matches.find(m => m.empId === empId);
    if (match) {
      const preTaxEl = document.getElementById('inspect-pretax');
      const dedEl = document.getElementById('inspect-deduction');
      const netEl = document.getElementById('inspect-net');
      if (preTaxEl) match.preTax = parseInt(preTaxEl.value.replace(/,/g, '')) || 0;
      if (dedEl) match.deduction = parseInt(dedEl.value.replace(/,/g, '')) || 0;
      if (netEl) match.net = parseInt(netEl.value.replace(/,/g, '')) || 0;
      match.verified = true;
    }

    const modal = document.getElementById('tax-match-inspect-modal');
    if (modal) modal.style.display = 'none';

    const wrapper = document.getElementById('tax-paystub-preview-wrapper');
    if (wrapper) {
      const data = window.SheetsSync.getData();
      const employees = (data.employees || []).filter(e => e.role !== '약국장');
      wrapper.innerHTML = renderTaxPaystubPreviewTable(matches, employees);
    }

    alert(`🎉 [${match ? match.empName : '직원'}] 님의 명세서 검수가 완료되었습니다!`);
  }

  async function processTaxPdfFile(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];

    try {
      if (typeof pdfjsLib === 'undefined') {
        alert('PDF 라이브러리를 초기화하는 중입니다. 1초 후 다시 선택해 주세요.');
        return;
      }
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const numPages = pdfDoc.numPages;

      const data = window.SheetsSync.getData();
      const employees = (data.employees || []).filter(e => e.role !== '약국장');

      const matches = [];

      for (let pNum = 1; pNum <= numPages; pNum++) {
        const page = await pdfDoc.getPage(pNum);
        const textContent = await page.getTextContent();
        const text = textContent.items.map(item => item.str).join(' ');

        // ✅ scale: 1.4 + JPEG 0.70 압축으로 선명한 한글 텍스트 보존 & 메모리 폭발 방지 (~100KB)
        const viewport = page.getViewport({ scale: 1.4 });
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        await page.render({ canvasContext: ctx, viewport: viewport }).promise;
        const pageImageData = canvas.toDataURL('image/jpeg', 0.7);

        let matchedEmp = null;
        employees.forEach(e => {
          if (text.includes(e.name)) {
            matchedEmp = e;
          }
        });

        if (matchedEmp) {
          const numbers = text.match(/[0-9]{1,3}(,[0-9]{3})+/g) || [];
          let net = 0, deduction = 0, preTax = 0;

          if (numbers.length >= 3) {
            net = parseInt(numbers[numbers.length - 1].replace(/,/g, '')) || 0;
            deduction = parseInt(numbers[numbers.length - 2].replace(/,/g, '')) || 0;
            preTax = parseInt(numbers[numbers.length - 3].replace(/,/g, '')) || 0;
          }

          if (preTax <= net || preTax <= deduction) {
            preTax = net + deduction;
          }

          matches.push({
            empId: matchedEmp.id,
            empName: matchedEmp.name,
            role: matchedEmp.role,
            preTax,
            deduction,
            net,
            pageNum: pNum,
            pageImageData,
            matched: true,
            verified: false
          });
        }
      }

      window._activeTaxMatches = matches;
      const wrapper = document.getElementById('tax-paystub-preview-wrapper');
      if (wrapper) {
        wrapper.innerHTML = renderTaxPaystubPreviewTable(matches, employees);
      }

      const panel = document.getElementById('inline-panel-container');
      if (panel) {
        panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }

      alert('🎉 PDF 파일 총 ' + numPages + '개 페이지 중 세무 신고 대상 직원 ' + matches.length + '명의 급여명세서가 1페이지씩 개별 고화질 이미지로 안전하게 추출되었습니다!\n각 직원의 [🔍 미리보기 & 검수] 버튼을 눌러 확인 후 최종 교부해 주세요.');
    } catch (err) {
      console.error("PDF Parsing error:", err);
      alert('PDF 분석 중 오류가 발생했습니다: ' + err.message);
    }
  }

  async function executeTaxPaystubPublishing() {
    const btn = document.getElementById('btn-execute-tax-publish');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> Cloudinary 클라우드에 고화질 명세서 업로드 및 전송 중...';
    }

    try {
      const monthKey = currentYear + '-' + String(currentMonth).padStart(2, '0');
      const allPaystubs = window.SheetsSync.getPaystubs ? window.SheetsSync.getPaystubs() : {};
      if (!allPaystubs[monthKey]) allPaystubs[monthKey] = {};

      const matches = window._activeTaxMatches || [];
      if (!matches.length) {
        alert('교부할 매칭 내역이 없습니다. 먼저 PDF 파일을 선택해 주세요.');
        return;
      }

      const now = new Date();
      const pad = n => String(n).padStart(2, '0');
      const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

      let uploadSuccessCount = 0;

      for (let i = 0; i < matches.length; i++) {
        const item = matches[i];
        if (!item.empId || !item.net) continue;

        let finalUrl = item.cloudUrl || '';
        // 🚀 Cloudinary 영구 호스팅 파이프라인으로 각 페이지 이미지 업로드
        if (!finalUrl && item.pageImageData && item.pageImageData.startsWith('data:image')) {
          if (window.App && typeof window.App.processAndUploadPhoto === 'function') {
            try {
              const uploaded = await window.App.processAndUploadPhoto(item.pageImageData);
              if (uploaded && uploaded.startsWith('http')) {
                finalUrl = uploaded;
                item.cloudUrl = uploaded;
              }
            } catch(ue) {
              console.warn('Cloud upload warning for ' + item.empName, ue);
            }
          }
        }

        allPaystubs[monthKey][item.empId] = {
          empId: item.empId,
          year: currentYear,
          month: currentMonth,
          netSalary: item.net,
          totalDeduction: item.deduction,
          preTax: item.preTax,
          fileData: finalUrl || item.pageImageData || null,
          pdfUrl: finalUrl || '',
          fileName: item.empName + '_급여명세서_' + currentMonth + '월.jpg',
          note: currentMonth + '월 세무사 확정 급여명세서입니다. 노고에 감사드립니다!',
          published: true,
          updatedAt: dateStr
        };

        uploadSuccessCount++;
      }

      window.SheetsSync.savePaystubs(allPaystubs);

      // 📧 각 직원의 등록 개인 이메일로 1:1 확정 급여명세서 안전 발송
      const emps = window.SheetsSync.getEmployees ? window.SheetsSync.getEmployees() : [];
      let emailSentCount = 0;
      for (let i = 0; i < matches.length; i++) {
        const item = matches[i];
        if (item.empId && item.net) {
          const emp = emps.find(e => e.id === item.empId);
          if (emp && emp.email && window.SheetsSync && typeof window.SheetsSync.sendPaystubEmailToStaff === 'function') {
            window.SheetsSync.sendPaystubEmailToStaff({
              email: emp.email,
              name: emp.name,
              year: currentYear,
              month: currentMonth,
              netSalary: item.net,
              preTax: item.preTax,
              totalDeduction: item.deduction,
              fileUrl: item.cloudUrl || '',
              note: currentMonth + '월 세무사 확정 급여명세서입니다. 노고에 감사드립니다!'
            });
            emailSentCount++;
          }
        }
      }

      closeInlinePanel();
      render('module-content');

      alert('🏆 세무 신고 대상 직원 ' + uploadSuccessCount + '명의 ' + currentMonth + '월 확정 급여명세서가 각 직원의 개인 이메일(' + emailSentCount + '명)로 안전하게 1:1 발송 및 교부되었습니다!\n\n🔒 (약국 공용 화면에는 개인 금융정보 보호를 위해 급여 액수가 노출되지 않습니다)');
    } catch (err) {
      console.error('executeTaxPaystubPublishing error:', err);
      alert('⚠️ 교부 처리 중 오류가 발생했습니다: ' + err.message);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-envelope me-1"></i> 🚀 최종 확정 급여명세서 일괄 교부 (직원 이메일 1:1 발송)';
      }
    }
  }

  function toggleCalendar() {
    showCalendar = !showCalendar;
    render('module-content');
  }

  // 전역 글로벌 단축 함수 바인딩 (모든 버튼 click 전용)
  window.showMyPaystubModal = showMyPaystubModal;
  window.showPaystubByEmpId = showPaystubByEmpId;
  window.openUploadPaystubModal = openUploadPaystubModal;
  window.saveDirectorPaystub = saveDirectorPaystub;
  window.openDirectorTaxPaystubModal = openDirectorTaxPaystubModal;
  window.processTaxPdfFile = processTaxPdfFile;
  window.executeTaxPaystubPublishing = executeTaxPaystubPublishing;
  window.toggleCalendar = toggleCalendar;
  window.toggleSubmittedDetails = toggleSubmittedDetails;
  window.closeInlinePanel = closeInlinePanel;
  window.updatePharmacistRateSettings = updatePharmacistRateSettings;
  window.openMatchInspectionModal = openMatchInspectionModal;
  window.confirmMatchInspection = confirmMatchInspection;
  window.toggleEmployeeAccordion = toggleEmployeeAccordion;

  const exportedModule = {
    render,
    setRoleFilter,
    setShowOffStaff,
    toggleSettlement,
    toggleCalendar,
    toggleSubmittedDetails,
    toggleEmployeeAccordion,
    closeInlinePanel,
    showMyPaystubModal,
    showPaystubByEmpId,
    updateStaffOvertimePay,
    updateAdjustment,
    updatePharmacistRateSettings,
    updateStaffSalarySettings,
    openUploadPaystubModal,
    handlePaystubFileChange,
    saveDirectorPaystub,
    openPaystubAttachment,
    openDirectorTaxPaystubModal,
    openMatchInspectionModal,
    confirmMatchInspection,
    processTaxPdfFile,
    executeTaxPaystubPublishing,
    changeMonth,
    goToday,
    openShiftModal,
    onModalEmpChange,
    setModalWorkMode,
    closeShiftModal,
    setPresetTime,
    saveCustomShift,
    showPaystubModal,
    submitMySchedule,
    approveMasterSchedule,
    rejectMasterSchedule,
    dismissNotice,
    exportTaxAccountantReport
  };

  window.ScheduleModule = exportedModule;
  return exportedModule;
})();
