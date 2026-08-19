/**
 * 신세계약국 HR/OPS 플랫폼 메인 애플리케이션 코어 (App Main Controller)
 * 10개 통합 모듈 사이드바 관리, 직원 개별 로그인, RBAC 권한 제어 및 10자리 복합 비밀번호 검증
 */
window.App = (function () {

  let activeModule = 'notices';
  let isDrawerOpen = false;

  const MODULE_TITLES = {
    'notices': '📢 공지사항 & 업무 SOP',
    'worklog': '📝 약국 업무일지 & 인수인계',
    'schedule': '📅 월간 근무 스케줄',
    'annual-leave': '🌴 연차대장 & 연차 전용 달력',
    'discount-purchase': '🛍️ 직원할인구매대장',
    'rules': '📜 신세계약국 취업규칙 전문 열람',
    'emergency-contacts': '☎️ 약국 운영 지원 연락망 센터',
    'approval': '🔐 약국장 결재 & 인사승인 센터 (약국장 전용)',
    'staff-directory': '👤 약국 직원 명부 (약국장 전용)',
    'pharmacy-settlement': '📊 스마트약국 정산 대시보드 (약국장 전용)',
    'building-rental': '🏢 건물 임대업 대시보드 (약국장 전용)'
  };

  const MODULE_ICONS = {
    'notices': 'fa-bullhorn',
    'worklog': 'fa-pen-fancy',
    'schedule': 'fa-calendar-alt',
    'annual-leave': 'fa-umbrella-beach',
    'discount-purchase': 'fa-shopping-bag',
    'rules': 'fa-book-medical',
    'emergency-contacts': 'fa-phone-alt',
    'approval': 'fa-user-check',
    'staff-directory': 'fa-address-book',
    'pharmacy-settlement': 'fa-coins',
    'building-rental': 'fa-building'
  };

  function init() {
    loadSavedTheme();
    setupEventListeners();
    updateSheetSyncBadge();
    
    // 유저 세션 및 사이드바 권한 렌더링
    renderSidebarNavigation();
    renderUserHeader();
    renderQuickLoginButtons();

    // 핸드폰/스마트폰 및 PC 접속 시 드로어 메뉴 가동
    openDrawer();

    renderActiveModule();

    // ⚡ 앱 기동 즉시 클라우드 최신 데이터 동기화 (아이폰/카톡/PC 첫 접속 즉각 반영)
    if (window.SheetsSync && typeof window.SheetsSync.pullFromCloud === 'function') {
      window.SheetsSync.pullFromCloud();
    }

    // 🚀 [Option A] 자동 버전 감지 및 스마트 무중단 자동 업데이트 가동
    startAutoUpdateChecker();
  }

function setupEventListeners() {
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeSheetModal();
        closeDrawer();
        closeEmpModal();
        closeLeaveModal();
        closeDateDetailModal();
        closeDiscountModal();
        closeChangePwModal();
        if (window.NoticesModule) window.NoticesModule.closeModal();
        if (window.ScheduleModule) window.ScheduleModule.closeShiftModal();
        if (window.WorklogModule) window.WorklogModule.closeModal();
        if (window.DiscountPurchaseModule) window.DiscountPurchaseModule.closeModal();
        const pModal = document.getElementById('property-crud-modal');
        if (pModal) pModal.style.display = 'none';
      }
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 900) {
        openDrawer();
      }
    });

    // 1. 기존에 추가했던 '바깥 어두운 배경(오버레이)' 터치 시 닫기
    const overlay = document.getElementById('drawer-overlay');
    if (overlay) {
      overlay.addEventListener('click', () => {
        if (window.innerWidth <= 900) {
          closeDrawer();
        }
      });
    }

    // 2. ★ 대표님 요청 기능: 사이드바 내부의 까만 '빈 공간' 터치 시 닫기
    const drawer = document.getElementById('app-drawer');
    if (drawer) {
      drawer.addEventListener('click', (e) => {
        // 스마트폰(모바일) 화면 크기일 때만 작동
        if (window.innerWidth <= 900) {
          // 터치한 곳이 버튼이나 하단 서명란인지 확인
          const isButtonOrFooter = e.target.closest('button') || e.target.closest('.drawer-footer');
          
          // 버튼이나 서명란이 아닌, 사진에 동그라미 치신 진짜 '빈 공간'을 터치했을 때만 사이드바 닫기
          if (!isButtonOrFooter) {
            closeDrawer();
          }
        }
      });
    }
  }

  function computeNotificationBadges() {
    try {
      const data = window.SheetsSync.getData();
      const currUser = window.SheetsSync.getCurrentUser();
      const isDirector = currUser && currUser.role === '약국장';

      // 1. 공지사항 (notices): 최근 3일 이내 공지
      const notices = data.notices || [];
      const now = new Date();
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const hasNewNotice = notices.some(n => (n.date && n.date >= threeDaysAgo) || n.isPinned);

      // 2. 업무일지 (worklogs): PENDING 상태이거나 약국장 미확인 건
      const worklogs = (window.SheetsSync.getWorklogs ? window.SheetsSync.getWorklogs() : data.worklogs) || [];
      const pendingWorklogs = worklogs.filter(w => w.status === 'PENDING' || (w.checkedBy && !w.checkedBy.includes('문성도 약국장')));

      // 3. 월간 근무 스케줄 (schedule): 스케줄 수정 요청 코멘트(반려)가 있거나 당월 미승인 상태
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;
      const monthKey = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
      const scheduleStatus = data.scheduleStatus || {};
      const stObj = scheduleStatus[monthKey] || {};
      const hasDirectorComment = !!(stObj.directorComment && !stObj.directorApproved);
      const isSchedulePending = !stObj.directorApproved && (stObj.pharmacistStatus !== 'APPROVED');

      // 4. 연차대장 (annual-leave): PENDING 상태의 연차 신청 건수
      const leaveRequests = data.leaveRequests || [];
      const pendingLeaves = leaveRequests.filter(l => l.status === 'PENDING');

      // 5. 직원할인구매 (discount-purchase): 미정산(!isPaid) 건수
      const discountPurchases = data.discountPurchases || [];
      const unpaidPurchases = discountPurchases.filter(p => !p.isPaid);

      // 6. 약국장 결재 (approval): 4대 결재 대기 합계
      const totalApprovalCount = pendingLeaves.length + unpaidPurchases.length + (isSchedulePending ? 1 : 0) + pendingWorklogs.length;

      return {
        notices: hasNewNotice ? 'N' : null,
        worklog: pendingWorklogs.length > 0 ? (isDirector ? pendingWorklogs.length : 'N') : null,
        schedule: hasDirectorComment ? '!' : (isDirector && isSchedulePending ? 'N' : null),
        annualLeave: pendingLeaves.length > 0 ? pendingLeaves.length : null,
        discountPurchase: unpaidPurchases.length > 0 ? (isDirector ? unpaidPurchases.length : 'N') : null,
        approval: totalApprovalCount > 0 ? totalApprovalCount : null
      };
    } catch(e) {
      return {};
    }
  }

  function renderSidebarNavigation() {
    const nav = document.querySelector('.drawer-menu');
    const drawer = document.getElementById('app-drawer');
    const mainWrapper = document.getElementById('main-wrapper');
    const topHeader = document.querySelector('.top-header');

    const currUser = window.SheetsSync.getCurrentUser();
    if (!currUser) {
      if (drawer) drawer.style.display = 'none';
      if (mainWrapper) mainWrapper.classList.add('full-width');
      if (topHeader) topHeader.style.display = 'none';
      if (nav) nav.innerHTML = '';
      return;
    } else {
      if (drawer) drawer.style.display = '';
      if (mainWrapper) mainWrapper.classList.remove('full-width');
      if (topHeader) topHeader.style.display = '';
    }

    if (!nav) return;

    const isDirector = currUser.role === '약국장' || currUser.id === 'emp_1';
    const badges = computeNotificationBadges();

    // 맞춤 허용 탭 목록 (개인별 권한)
    const allowed = currUser.allowedTabs || [
      'notices-module', 'worklog-module', 'schedule-module',
      'annual-leave-module', 'discount-purchase-module', 'rules-module', 'emergency-contacts-module'
    ];

    let html = '';

    if (isDirector || allowed.includes('notices-module')) {
      html += `
        <button class="menu-item ${activeModule === 'notices' ? 'active' : ''}" data-module="notices" onclick="App.switchModule('notices', true)">
          <div class="menu-icon-wrapper">
            <i class="fas fa-bullhorn"></i>
            ${badges.notices ? `<span class="menu-item-badge">${badges.notices}</span>` : ''}
          </div>
          <span>공지사항 & SOP</span>
        </button>
      `;
    }

    if (isDirector || allowed.includes('worklog-module')) {
      html += `
        <button class="menu-item ${activeModule === 'worklog' ? 'active' : ''}" data-module="worklog" onclick="App.switchModule('worklog', true)">
          <div class="menu-icon-wrapper">
            <i class="fas fa-pen-fancy"></i>
            ${badges.worklog ? `<span class="menu-item-badge">${badges.worklog}</span>` : ''}
          </div>
          <span>업무일지 & 인수인계</span>
        </button>
      `;
    }

    if (isDirector || allowed.includes('schedule-module')) {
      html += `
        <button class="menu-item ${activeModule === 'schedule' ? 'active' : ''}" data-module="schedule" onclick="App.switchModule('schedule', true)">
          <div class="menu-icon-wrapper">
            <i class="fas fa-calendar-alt"></i>
            ${badges.schedule ? `<span class="menu-item-badge ${badges.schedule === '!' ? 'badge-amber' : ''}">${badges.schedule}</span>` : ''}
          </div>
          <span>월간 근무 스케줄</span>
        </button>
      `;
    }

    if (isDirector || allowed.includes('annual-leave-module')) {
      html += `
        <button class="menu-item ${activeModule === 'annual-leave' ? 'active' : ''}" data-module="annual-leave" onclick="App.switchModule('annual-leave', true)">
          <div class="menu-icon-wrapper">
            <i class="fas fa-umbrella-beach"></i>
            ${badges.annualLeave ? `<span class="menu-item-badge">${badges.annualLeave}</span>` : ''}
          </div>
          <span>연차대장 & 달력</span>
        </button>
      `;
    }

    if (isDirector || allowed.includes('discount-purchase-module')) {
      html += `
        <button class="menu-item ${activeModule === 'discount-purchase' ? 'active' : ''}" data-module="discount-purchase" onclick="App.switchModule('discount-purchase', true)">
          <div class="menu-icon-wrapper">
            <i class="fas fa-shopping-bag"></i>
            ${badges.discountPurchase ? `<span class="menu-item-badge">${badges.discountPurchase}</span>` : ''}
          </div>
          <span>직원할인구매대장</span>
        </button>
      `;
    }

    if (isDirector || allowed.includes('rules-module')) {
      html += `
        <button class="menu-item ${activeModule === 'rules' ? 'active' : ''}" data-module="rules" onclick="App.switchModule('rules', true)">
          <div class="menu-icon-wrapper">
            <i class="fas fa-book-medical"></i>
          </div>
          <span>취업규칙 전문</span>
        </button>
      `;
    }

    if (isDirector || allowed.includes('emergency-contacts-module')) {
      html += `
        <button class="menu-item ${activeModule === 'emergency-contacts' ? 'active' : ''}" data-module="emergency-contacts" onclick="App.switchModule('emergency-contacts', true)">
          <div class="menu-icon-wrapper">
            <i class="fas fa-phone-alt text-warning"></i>
          </div>
          <span>약국 운영 지원 연락망</span>
        </button>
      `;
    }

    // 약국장 전용 보안 4대 메뉴
    if (isDirector) {
      html += `
        <div style="padding:12px 16px 4px 16px; font-size:11px; font-weight:bold; color:#ef4444; text-transform:uppercase;">
          🔒 약국장 전용 관리 메뉴
        </div>
        <button class="menu-item ${activeModule === 'approval' ? 'active' : ''}" data-module="approval" onclick="App.switchModule('approval', true)">
          <div class="menu-icon-wrapper">
            <i class="fas fa-user-check text-danger"></i>
            ${badges.approval ? `<span class="menu-item-badge">${badges.approval}</span>` : ''}
          </div>
          <span>약국장 결재</span>
        </button>
        <button class="menu-item ${activeModule === 'staff-directory' ? 'active' : ''}" data-module="staff-directory" onclick="App.switchModule('staff-directory', true)">
          <div class="menu-icon-wrapper">
            <i class="fas fa-address-book text-danger"></i>
          </div>
          <span>직원 명부</span>
        </button>
        <button class="menu-item ${activeModule === 'pharmacy-settlement' ? 'active' : ''}" data-module="pharmacy-settlement" onclick="App.switchModule('pharmacy-settlement', true)">
          <div class="menu-icon-wrapper">
            <i class="fas fa-coins text-warning"></i>
          </div>
          <span>스마트약국 정산</span>
        </button>
        <button class="menu-item ${activeModule === 'building-rental' ? 'active' : ''}" data-module="building-rental" onclick="App.switchModule('building-rental', true)">
          <div class="menu-icon-wrapper">
            <i class="fas fa-building text-info"></i>
          </div>
          <span>건물 임대업 대시보드</span>
        </button>
      `;
    }

    nav.innerHTML = html;

    // ★ 추가: 좌측 하단 구글 시트 연동 버튼 약국장 전용 보안 처리 ★
    const footerBtn = document.querySelector('.drawer-footer');
    if (footerBtn) {
      if (isDirector) {
        footerBtn.style.display = 'block'; // 약국장으로 로그인하면 보임
      } else {
        footerBtn.style.display = 'none';  // 로그아웃 상태이거나 일반 직원이면 흔적도 없이 숨김
      }
    }
  }
  function renderUserHeader() {
    const badge = document.getElementById('user-profile-badge');
    if (!badge) return;

    const curr = window.SheetsSync.getCurrentUser();
    if (curr) {
      const isDirector = curr.role === '약국장';
      const isPharm = curr.role === '근무약사';
      
      const badgeStyle = isDirector
        ? 'background:linear-gradient(135deg, #dc2626 0%, #991b1b 100%); color:#ffffff;'
        : isPharm
        ? 'background:linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color:#ffffff;'
        : 'background:linear-gradient(135deg, #059669 0%, #047857 100%); color:#ffffff;';

      const iconClass = isDirector ? 'fa-crown text-warning' : isPharm ? 'fa-user-md' : 'fa-user-nurse';

      badge.innerHTML = `
        <div class="d-flex align-items-center gap-1" style="white-space:nowrap; flex-wrap:nowrap;">
          <span class="user-badge-pill" style="${badgeStyle} font-size:12.5px; font-weight:700; padding:5px 12px; border-radius:20px; box-shadow:0 2px 6px rgba(0,0,0,0.12); display:inline-flex; align-items:center; gap:5px;" title="${curr.name} (${curr.role})">
            <i class="fas ${iconClass}"></i>
            <span>${curr.name}</span>
          </span>

          <button type="button" class="header-action-btn" onclick="App.openChangePwModal()" title="비밀번호 자율 변경" style="background:#ffffff; border:1px solid #cbd5e1; border-radius:20px; font-size:11.5px; font-weight:700; color:#334155; padding:5px 10px; box-shadow:0 1px 3px rgba(0,0,0,0.05); display:inline-flex; align-items:center; gap:4px; cursor:pointer;" onmouseover="this.style.background='#f8fafc'; this.style.borderColor='#94a3b8';" onmouseout="this.style.background='#ffffff'; this.style.borderColor='#cbd5e1';">
            <i class="fas fa-key text-warning"></i>
            <span>비번 변경</span>
          </button>

          <button type="button" class="header-action-btn" onclick="App.userLogout()" title="계정 로그아웃 및 계정 전환" style="background:#fff1f2; border:1px solid #fecdd3; border-radius:20px; font-size:11.5px; font-weight:700; color:#e11d48; padding:5px 10px; box-shadow:0 1px 3px rgba(0,0,0,0.05); display:inline-flex; align-items:center; gap:4px; cursor:pointer;" onmouseover="this.style.background='#ffe4e6'; this.style.borderColor='#fda4af';" onmouseout="this.style.background='#fff1f2'; this.style.borderColor='#fecdd3';">
            <i class="fas fa-sign-out-alt"></i>
            <span>로그아웃</span>
          </button>
        </div>
      `;
    } else {
      badge.innerHTML = `
        <button class="btn btn-sm font-bold shadow-sm" onclick="App.showLoginModal()" style="background:linear-gradient(135deg, #059669 0%, #047857 100%); color:#ffffff; border:none; border-radius:20px; font-size:12px; padding:6px 14px; display:inline-flex; align-items:center; gap:5px;">
          <i class="fas fa-user-lock"></i> <span>직원 로그인</span>
        </button>
      `;
    }
  }

  function renderQuickLoginButtons() {
    const container = document.getElementById('quick-login-buttons');
    if (!container) return;

    const emps = window.SheetsSync.getEmployees();

    const director = emps.filter(e => e.role === '약국장');
    const pharmacists = emps.filter(e => e.role === '근무약사');
    const staff = emps.filter(e => e.role === '일반직원');

    container.innerHTML = `
      <div class="w-100 mb-3 text-start">
        <div style="font-size:11px; font-weight:bold; color:#dc2626; margin-bottom:6px; letter-spacing:0.5px;">👑 대표 약국장</div>
        <div class="d-flex flex-wrap gap-2">
          ${director.map(e => `
            <button type="button" class="btn btn-sm" onclick="App.quickSelectLogin('${e.email || e.username}')" style="background:linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color:#fff; border:none; border-radius:20px; font-size:13px; padding:7px 16px; font-weight:bold; box-shadow:0 2px 6px rgba(220,38,38,0.25);">
              🏆 ${e.name} (${e.role})
            </button>
          `).join('')}
        </div>
      </div>

      <div class="w-100 mb-3 text-start">
        <div style="font-size:11px; font-weight:bold; color:#2563eb; margin-bottom:6px; letter-spacing:0.5px;">👨‍⚕️ 근무약사 (4인)</div>
        <div class="d-flex flex-wrap gap-2">
          ${pharmacists.map(e => `
            <button type="button" class="btn btn-sm" onclick="App.quickSelectLogin('${e.email || e.username}')" style="background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; border-radius:20px; font-size:13px; padding:6px 14px; font-weight:600;" onmouseover="this.style.background='#dbeafe';" onmouseout="this.style.background='#eff6ff';">
              👨‍⚕️ ${e.name} (${e.position || '약사'})
            </button>
          `).join('')}
        </div>
      </div>

      <div class="w-100 text-start">
        <div style="font-size:11px; font-weight:bold; color:#059669; margin-bottom:6px; letter-spacing:0.5px;">👨‍💼 일반직원 (4인)</div>
        <div class="d-flex flex-wrap gap-2">
          ${staff.map(e => `
            <button type="button" class="btn btn-sm" onclick="App.quickSelectLogin('${e.email || e.username}')" style="background:#f0fdf4; color:#15803d; border:1px solid #bbf7d0; border-radius:20px; font-size:13px; padding:6px 14px; font-weight:600;" onmouseover="this.style.background='#dcfce7';" onmouseout="this.style.background='#f0fdf4';">
              👨‍💼 ${e.name} (${e.position || '직원'})
            </button>
          `).join('')}
        </div>
      </div>
    `;
  }

  function quickSelectLogin(val) {
    const input = document.getElementById('login-username');
    if (input) input.value = val;

    const passInput = document.getElementById('login-passcode');
    if (passInput) {
      passInput.value = ''; // 🔒 보안 수칙: 비밀번호는 자동 입력되지 않으며 본인이 직접 입력합니다.
      passInput.focus();
    }
  }

  function showLoginModal() {
    renderQuickLoginButtons();
    const m = document.getElementById('login-modal');
    if (m) m.style.display = 'flex';
  }

  function closeLoginModal() {
    const m = document.getElementById('login-modal');
    if (m) m.style.display = 'none';
  }

  function handleLoginSubmit(e) {
    e.preventDefault();
    const inputVal = document.getElementById('login-username').value.trim().toLowerCase();
    const pass = document.getElementById('login-passcode').value.trim();

    const emps = window.SheetsSync.getEmployees();
    
    // 유연한 다중 조건 매칭 (이름, 이메일, 아이디, ID 접두사 모두 가능)
    const target = emps.find(emp => {
      const u = (emp.username || '').toLowerCase();
      const email = (emp.email || '').toLowerCase();
      const name = (emp.name || '').toLowerCase();
      const id = (emp.id || '').toLowerCase();
      const shortUser = u.split('@')[0];

      return inputVal === u ||
             inputVal === email ||
             inputVal === name ||
             inputVal === id ||
             inputVal === shortUser ||
             u.startsWith(inputVal) ||
             email.startsWith(inputVal);
    });

    if (!target) {
      alert('❌ 존재하지 않는 아이디(이메일 또는 이름)입니다.');
      return;
    }

    if (!verifyEmployeePasscode(target, pass)) {
      alert(`❌ 비밀번호가 올바르지 않습니다.\n(초기 비밀번호는 ${target.name} 님의 휴대폰 뒷 4자리 또는 1234입니다)`);
      return;
    }

    window.SheetsSync.setCurrentUser(target);
    closeLoginModal();

    // 🌐 로그인 직후 즉시 최신 클라우드 전체 데이터 동기화
    window.SheetsSync.pullFromCloud();

    if (window.ScheduleModule && window.ScheduleModule.closeInlinePanel) {
      window.ScheduleModule.closeInlinePanel();
    }

    renderSidebarNavigation();
    renderUserHeader();

    // 🚨 약국장의 스케줄 수정(반려) 요청이 있는 경우 스케줄 탭으로 자동 이동 및 알림 팝업 전송!
    checkPendingRejectionNotice(true, target);
  }

  function checkPendingRejectionNotice(isLoginEvent = false, targetUser = null) {
    const currUser = targetUser || window.SheetsSync.getCurrentUser();
    if (!currUser || currUser.role === '약국장') {
      if (isLoginEvent) {
        alert(`🎉 반가워요, ${currUser ? currUser.name : ''} ${currUser ? currUser.role : ''}님! 성공적으로 로그인되었습니다.`);
        switchModule('notices', true);
      }
      return;
    }

    const data = window.SheetsSync.getData();
    const scheduleStatus = data.scheduleStatus || {};

    let pendingComment = null;
    let pendingMonthKey = null;

    Object.keys(scheduleStatus).forEach(mKey => {
      const st = scheduleStatus[mKey];
      if (st && st.directorComment && !st.directorApproved) {
        pendingComment = st.directorComment;
        pendingMonthKey = mKey;
      }
    });

    if (pendingComment) {
      switchModule('schedule', true);
      setTimeout(() => {
        alert(`🚨 [약국장 스케줄 재조율(수정) 요청 알림]\n\n💬 약국장 전달 사유: "${pendingComment}"\n\n팀원들과 위 사유를 확인하신 후, 하단 스케줄표에서 근무 시간 및 OFF를 보정하고 [스케줄 제출하기] 버튼을 다시 눌러주세요.`);
      }, 300);
    } else if (isLoginEvent) {
      alert(`🎉 반가워요, ${currUser.name} ${currUser.role}님! 성공적으로 로그인되었습니다.`);
      switchModule('notices', true);
    }
  }

  function userLogout() {
    window.SheetsSync.logoutUser();
    if (window.ScheduleModule && window.ScheduleModule.closeInlinePanel) {
      window.ScheduleModule.closeInlinePanel();
    }
    renderSidebarNavigation();
    renderUserHeader();
    renderActiveModule();
  }

  function openChangePwModal() {
    const curr = window.SheetsSync.getCurrentUser();
    if (!curr) {
      alert('🔒 먼저 상단 [🔑 직원 로그인 / 계정 선택]을 통해 접속한 후 비밀번호를 변경해 주세요.');
      return;
    }
    const m = document.getElementById('change-password-modal');
    if (m) {
      document.getElementById('cpw-current').value = '';
      document.getElementById('cpw-new').value = '';
      document.getElementById('cpw-confirm').value = '';
      document.getElementById('pw-realtime-msg').innerText = '비밀번호를 입력해 주세요.';
      document.getElementById('pw-realtime-msg').className = 'mb-3 p-2 text-center text-muted';
      m.style.display = 'flex';
    }
  }

  function closeChangePwModal() {
    const m = document.getElementById('change-password-modal');
    if (m) m.style.display = 'none';
  }

  function checkPwRealtime() {
    const newPw = document.getElementById('cpw-new').value;
    const msgBox = document.getElementById('pw-realtime-msg');
    if (!msgBox) return;

    const res = window.SheetsSync.validatePasswordComplexity(newPw);
    if (res.valid) {
      msgBox.className = 'mb-3 p-2 text-center text-white bg-success';
      msgBox.innerText = '✅ ' + res.message;
    } else {
      msgBox.className = 'mb-3 p-2 text-center text-white bg-danger';
      msgBox.innerText = '❌ ' + res.message;
    }
  }

  function handleChangePwSubmit(e) {
    e.preventDefault();
    const curr = window.SheetsSync.getCurrentUser();
    const currentPw = document.getElementById('cpw-current').value.trim();
    const newPw = document.getElementById('cpw-new').value.trim();
    const confirmPw = document.getElementById('cpw-confirm').value.trim();

    if (newPw !== confirmPw) {
      alert('❌ 새 비밀번호와 비밀번호 확인이 일치하지 않습니다.');
      return;
    }

    const res = window.SheetsSync.changePassword(curr.id, currentPw, newPw);
    if (res.success) {
      alert('🎉 ' + res.message);
      closeChangePwModal();
    } else {
      alert('❌ ' + res.message);
    }
  }

  function renderActiveModule() {
    const currUser = window.SheetsSync.getCurrentUser();
    if (!currUser) {
      renderLoginGateway();
      return;
    }

    switch (activeModule) {
      case 'notices':
        if (window.NoticesModule) window.NoticesModule.render('module-content');
        break;
      case 'worklog':
        if (window.WorklogModule) window.WorklogModule.render('module-content');
        break;
      case 'schedule':
        if (window.ScheduleModule) window.ScheduleModule.render('module-content');
        break;
      case 'annual-leave':
        if (window.AnnualLeaveModule) window.AnnualLeaveModule.render('module-content');
        break;
      case 'staff-directory':
        if (window.StaffDirectoryModule) window.StaffDirectoryModule.render('module-content');
        break;
      case 'discount-purchase':
        if (window.DiscountPurchaseModule) window.DiscountPurchaseModule.render('module-content');
        break;
      case 'rules':
        if (window.RulesModule) window.RulesModule.render('module-content');
        break;
      case 'emergency-contacts':
        if (window.EmergencyContactsModule) window.EmergencyContactsModule.render('module-content');
        break;
      case 'pharmacy-settlement':
        if (window.PharmacySettlementModule) window.PharmacySettlementModule.render('module-content');
        break;
      case 'building-rental':
        if (window.BuildingRentalModule) window.BuildingRentalModule.render('module-content');
        break;
      case 'approval':
        if (window.ApprovalModule) window.ApprovalModule.render('module-content');
        break;
    }
  }

  function renderLoginGateway() {
    const container = document.getElementById('module-content');
    if (!container) return;

    const titleEl = document.getElementById('active-module-title');
    if (titleEl) titleEl.innerText = '🔒 신세계약국 커넥트';

    const emps = window.SheetsSync.getEmployees() || [];
    const activeEmps = emps.filter(e => !e.isCandidate && e.role !== '예비인력' && !e.name.includes('이정은') && !e.name.includes('간영자') && !e.name.includes('테스트'));
    
    // 2대 정예 그룹: 조제 케어팀 (약사 5인: 문성도 포함) / 헬스케어 파트너 (지원팀 4인)
    const careTeam = activeEmps.filter(e => e.role === '약국장' || e.role === '근무약사' || (e.role || '').includes('약사'));
    const partnerTeam = activeEmps.filter(e => e.role === '일반직원');

    container.innerHTML = `
      <div style="min-height: 85vh; display: flex; align-items: center; justify-content: center; padding: 24px 14px;">
        <div style="width: 100%; max-width: 560px; padding: 42px 32px; background: rgba(255, 255, 255, 0.98); border: 1.5px solid rgba(203, 213, 225, 0.85); border-radius: 28px; box-shadow: 0 25px 60px -12px rgba(15, 23, 42, 0.12), 0 0 0 1px rgba(255, 255, 255, 0.8) inset; text-align: center;">
          
          <!-- 🌟 3D 엠보싱 대형 로고 -->
          <div style="width: 88px; height: 88px; margin: 0 auto 16px auto; border-radius: 24px; background: radial-gradient(circle at 30% 30%, #ffffff 0%, #ecfdf5 70%, #d1fae5 100%); border: 2.5px solid #6ee7b7; display: flex; align-items: center; justify-content: center; box-shadow: 0 16px 32px -4px rgba(5, 150, 105, 0.28), 0 4px 12px rgba(0,0,0,0.06), inset 0 2px 5px rgba(255,255,255,0.95); padding: 8px;">
            <img src="logo.jpg" alt="신세계약국 로고" style="width: 100%; height: 100%; object-fit: contain; border-radius: 16px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.1));">
          </div>

          <h2 style="font-size: 25px; font-weight: 900; color: #0f172a; margin-bottom: 4px; letter-spacing: -0.5px;">
            신세계약국
          </h2>
          <p style="font-size: 13.5px; color: #64748b; font-weight: 600; margin-bottom: 24px; letter-spacing: 0.2px;">
            HR & Operations Platform • Connect Portal
          </p>

          <!-- 2대 정예 그룹 계정 선택 박스 -->
          <div style="background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 20px; padding: 22px 18px; margin-bottom: 24px; text-align: left;">
            
            <!-- 1. 💊 조제 케어팀 (약사 5인) -->
            <div style="margin-bottom: 18px;">
              <div style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 800; color: #1d4ed8; background: #eff6ff; border: 1.5px solid #bfdbfe; padding: 4px 12px; border-radius: 20px; margin-bottom: 10px;">
                <i class="fas fa-pills"></i> 조제 케어팀
              </div>
              <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 8px;">
                ${careTeam.map(e => `
                  <button type="button" onclick="App.quickSelectGatewayLogin('${e.id}')" id="gw-emp-btn-${e.id}" class="gw-emp-btn" style="background: #ffffff; color: #1e40af; border: 1.5px solid #cbd5e1; border-radius: 14px; font-size: 14.5px; padding: 9px 6px; font-weight: 800; cursor: pointer; text-align: center; box-shadow: 0 2px 6px rgba(0,0,0,0.03);">
                    ${e.name}
                  </button>
                `).join('')}
              </div>
            </div>

            <!-- 2. 🌿 헬스케어 파트너 (지원팀 4인) -->
            <div>
              <div style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 800; color: #047857; background: #ecfdf5; border: 1.5px solid #a7f3d0; padding: 4px 12px; border-radius: 20px; margin-bottom: 10px;">
                <i class="fas fa-hand-holding-medical"></i> 헬스케어 파트너
              </div>
              <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 8px;">
                ${partnerTeam.map(e => `
                  <button type="button" onclick="App.quickSelectGatewayLogin('${e.id}')" id="gw-emp-btn-${e.id}" class="gw-emp-btn" style="background: #ffffff; color: #047857; border: 1.5px solid #cbd5e1; border-radius: 14px; font-size: 14.5px; padding: 9px 6px; font-weight: 800; cursor: pointer; text-align: center; box-shadow: 0 2px 6px rgba(0,0,0,0.03);">
                    ${e.name}
                  </button>
                `).join('')}
              </div>
            </div>

          </div>

          <!-- 로그인 폼 (이메일 직접 입력 및 상단 터치 자동완성 지원) -->
          <form onsubmit="App.handleGatewayLoginSubmit(event)" style="text-align: left;">
            <div class="mb-3">
              <label style="display: block; font-size: 13px; font-weight: 700; color: #334155; margin-bottom: 6px;">
                👤 계정 아이디 (이메일 주소)
              </label>
              <input type="text" id="gw-login-username" class="form-control" placeholder="예: iniha@naver.com (성함 터치 또는 직접 입력)" style="height: 48px; font-size: 14.5px; font-weight: 700; color: #0f172a; background: #ffffff; border-radius: 14px; border: 1.5px solid #cbd5e1; padding: 0 16px;" required>
            </div>

            <div class="mb-4">
              <label style="display: block; font-size: 13px; font-weight: 700; color: #334155; margin-bottom: 6px;">
                🔒 비밀번호 <span style="font-weight: normal; color: #94a3b8; font-size: 12px;">(초기 번호: 휴대폰 뒷 4자리)</span>
              </label>
              <input type="password" id="gw-login-passcode" class="form-control" placeholder="비밀번호를 입력하세요" style="height: 48px; font-size: 16px; border-radius: 14px; border: 1.5px solid #cbd5e1; letter-spacing: 2px; padding: 0 16px;" required>
            </div>

            <button type="submit" style="width: 100%; height: 54px; border-radius: 16px; background: linear-gradient(135deg, #059669 0%, #047857 100%); color: #ffffff; font-size: 16.5px; font-weight: 800; border: none; box-shadow: 0 6px 20px rgba(5,150,105,0.4); cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px; transition: all 0.2s ease;">
              <i class="fas fa-link"></i> ✨ 신세계약국 커넥트 입장
            </button>
          </form>

        </div>
      </div>
    `;
  }

  function quickSelectGatewayLogin(empId) {
    const emps = window.SheetsSync.getEmployees() || [];
    const emp = emps.find(e => e.id === empId);
    if (!emp) return;

    const userInput = document.getElementById('gw-login-username');
    const passInput = document.getElementById('gw-login-passcode');

    if (userInput) userInput.value = emp.email || emp.username || emp.name;

    document.querySelectorAll('.gw-emp-btn').forEach(btn => {
      btn.style.outline = 'none';
      btn.style.boxShadow = '';
      btn.style.borderColor = '#cbd5e1';
    });
    const activeBtn = document.getElementById('gw-emp-btn-' + emp.id);
    if (activeBtn) {
      activeBtn.style.outline = '3px solid #059669';
      activeBtn.style.boxShadow = '0 0 0 4px rgba(5,150,105,0.25)';
      activeBtn.style.borderColor = '#059669';
    }

    if (passInput) {
      passInput.value = '';
      passInput.focus();
    }
  }

  function verifyEmployeePasscode(emp, inputPass) {
    if (!emp || !inputPass) return false;
    const p = String(inputPass).trim();
    const storedPass = String(emp.passcode || '').trim();

    // 1. 등록/수정된 최신 비밀번호와 100% 일치할 때만 승인 (이전 번호 및 1234 완전 차단)
    if (storedPass) {
      return p === storedPass;
    }

    // 2. 비밀번호가 설정되어 있지 않은 경우에만 휴대폰 뒷 4자리 또는 1234 허용
    const phoneDigits = String(emp.phone || '').replace(/[^0-9]/g, '');
    const phoneLast4 = phoneDigits.length >= 4 ? phoneDigits.slice(-4) : '';
    if (phoneLast4 && p === phoneLast4) return true;
    if (p === '1234') return true;

    return false;
  }

  function handleGatewayLoginSubmit(e) {
    e.preventDefault();
    const inputVal = (document.getElementById('gw-login-username').value || '').trim().toLowerCase();
    const pass = document.getElementById('gw-login-passcode').value.trim();

    if (!inputVal) {
      alert('계정 아이디(이메일 주소)를 입력하거나 위에서 본인 이름을 선택해 주세요.');
      return;
    }

    const emps = window.SheetsSync.getEmployees() || [];
    const target = emps.find(emp => {
      const u = (emp.username || '').toLowerCase();
      const email = (emp.email || '').toLowerCase();
      const name = (emp.name || '').toLowerCase();
      const id = (emp.id || '').toLowerCase();
      const shortUser = u.split('@')[0];
      const shortEmail = email.split('@')[0];

      return inputVal === u ||
             inputVal === email ||
             inputVal === name ||
             inputVal === id ||
             inputVal === shortUser ||
             inputVal === shortEmail ||
             u.startsWith(inputVal) ||
             email.startsWith(inputVal);
    });

    if (!target) {
      alert('❌ 일치하는 직원 계정(이메일 또는 성함)을 찾을 수 없습니다.');
      return;
    }

    if (!verifyEmployeePasscode(target, pass)) {
      alert(`❌ 비밀번호가 올바르지 않습니다.\n(초기 비밀번호는 ${target.name} 님의 휴대폰 뒷 4자리 또는 1234입니다)`);
      return;
    }

    window.SheetsSync.setCurrentUser(target);
    renderSidebarNavigation();
    renderUserHeader();
    renderActiveModule();
    checkPendingRejectionNotice(true, target);
  }

  function switchModule(moduleName, isUserAction = false) {
    if (!MODULE_TITLES[moduleName]) return;

    // 보안 접근 가드 (약국장 전용 4대 모듈)
    const curr = window.SheetsSync.getCurrentUser();
    const isDirector = curr && curr.role === '약국장';

    if (['approval', 'staff-directory', 'pharmacy-settlement', 'building-rental'].includes(moduleName) && !isDirector) {
      alert('🔒 보안 안내: 선택하신 메뉴는 약국장 전용 관리 영역입니다.');
      return;
    }

    activeModule = moduleName;

    document.querySelectorAll('.menu-item').forEach(btn => {
      if (btn.getAttribute('data-module') === moduleName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    const titleElem = document.getElementById('active-module-title');
    if (titleElem) {
      titleElem.textContent = MODULE_TITLES[moduleName];
    }

    renderActiveModule();

    if (isUserAction && window.innerWidth <= 900) {
      closeDrawer();
    }
  }

  function openDrawer() {
    isDrawerOpen = true;
    const sidebar = document.getElementById('app-drawer');
    const overlay = document.getElementById('drawer-overlay');
    const wrapper = document.getElementById('main-wrapper');

    if (sidebar) sidebar.classList.add('open');
    if (overlay) overlay.classList.add('open');
    if (wrapper) wrapper.classList.add('drawer-open');
  }

  function closeDrawer() {
    isDrawerOpen = false;
    const sidebar = document.getElementById('app-drawer');
    const overlay = document.getElementById('drawer-overlay');
    const wrapper = document.getElementById('main-wrapper');

    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('open');
    if (wrapper) wrapper.classList.remove('drawer-open');
  }

  function toggleDrawer() {
    if (isDrawerOpen) {
      closeDrawer();
    } else {
      openDrawer();
    }
  }

  function loadSavedTheme() {
    try {
      const saved = localStorage.getItem('ssg_theme');
      const body = document.body;
      const icon = document.getElementById('theme-toggle-icon');
      if (saved === 'dark') {
        body.setAttribute('data-theme', 'dark');
        body.classList.add('dark-theme');
        if (icon) icon.className = 'fas fa-sun text-warning';
      }
    } catch(e){}
  }

  function toggleTheme() {
    const body = document.body;
    const icon = document.getElementById('theme-toggle-icon');
    const isDark = body.getAttribute('data-theme') === 'dark' || body.classList.contains('dark-theme');

    if (isDark) {
      body.removeAttribute('data-theme');
      body.classList.remove('dark-theme');
      if (icon) icon.className = 'fas fa-moon';
      try { localStorage.setItem('ssg_theme', 'light'); } catch(e){}
    } else {
      body.setAttribute('data-theme', 'dark');
      body.classList.add('dark-theme');
      if (icon) icon.className = 'fas fa-sun text-warning';
      try { localStorage.setItem('ssg_theme', 'dark'); } catch(e){}
    }
  }

  function updateSheetSyncBadge() {
    const textElem = document.getElementById('sheet-sync-status-text');
    if (textElem) {
      textElem.textContent = `📊 구글 시트 다운로드`;
    }
  }

  function downloadActiveModuleToGoogleSheets() {
    const data = window.SheetsSync.getData();
    const employees = data.employees || [];
    const schedule = data.schedule || [];
    const currentYear = 2026;
    const currentMonth = 8;
    const monthKey = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

    let moduleName = MODULE_TITLES[activeModule] || activeModule;
    moduleName = moduleName.replace(/[^a-zA-Z0-9가-힣]/g, '_');
    let filename = `신세계약국_${moduleName}_${currentYear}년${String(currentMonth).padStart(2, '0')}월.csv`;
    let rows = [];

    if (activeModule === 'schedule') {
      filename = `신세계약국_월간근무스케줄및급여정산표_${currentYear}년${String(currentMonth).padStart(2, '0')}월.csv`;
      
      rows.push(['신세계약국 월간 근무 스케줄 및 세전/세후 급여 정산 집계표']);
      rows.push(['산출년월', `${currentYear}년 ${currentMonth}월`]);
      rows.push([]);

      rows.push(['[ 1. 근무약사 급여 정산표 ]']);
      rows.push(['약사명', '직무', '평일 시급(원)', '주말/공휴일 시급(원)', '총 실근무 시수', '평일 시수', '주말/공휴일 시수', '평일 산출액(원)', '주말/공휴일 산출액(원)', '월 세전 총급여액(원)']);

      const pharmacists = employees.filter(e => e.role === '근무약사' || (e.role || '').includes('약사'));
      const pRatesMap = window.SheetsSync.getPharmacistRates ? window.SheetsSync.getPharmacistRates() : {};

      pharmacists.forEach(p => {
        const empShifts = schedule.filter(r => r.empId === p.id && r.date.startsWith(monthKey));
        const rateObj = pRatesMap[p.id] || { weekdayRate: p.hourlyRate || 35000, holidayRate: 40000, breakHours: 1.0 };
        const calc = window.LaborCalculator.calculatePharmacistPayroll(empShifts, rateObj.weekdayRate, rateObj.holidayRate, rateObj.breakHours);
        rows.push([p.name, p.role, rateObj.weekdayRate, rateObj.holidayRate, calc.totalNetHours, calc.weekdayNetHours, calc.holidayNetHours, calc.weekdayPay, calc.holidayPay, calc.totalPayroll]);
      });

      rows.push([]);
      rows.push(['[ 2. 일반직원 급여 정산표 ]']);
      rows.push(['직원명', '직무', '기준시급(원)', '기본월급(원)', '비과세 식대(원)', '초과수당(원)', '공제삭감(원)', '조정반영 세전총급여(원)']);

      const staffMembers = employees.filter(e => !e.role.includes('약사') && e.role !== '약국장' && e.role !== '예비인력' && e.name !== '이정은');
      const allAdjustments = window.SheetsSync.getOvertimeAdjustments ? window.SheetsSync.getOvertimeAdjustments() : {};
      const monthAdj = allAdjustments[monthKey] || {};

      staffMembers.forEach(s => {
        const empShifts = schedule.filter(r => r.empId === s.id && r.date.startsWith(monthKey));
        const calc = window.LaborCalculator.calculateStaffPayroll(empShifts, s.hourlyRate || 13500);
        const empAdj = monthAdj[s.id] || { overtimePay: 0, deductionPay: 0 };
        const baseSal = s.baseMonthlySalary || 2621500;
        const total = baseSal + 200000 + (empAdj.overtimePay || 0) - (empAdj.deductionPay || 0);
        rows.push([s.name, s.position, s.hourlyRate || 13500, baseSal, 200000, empAdj.overtimePay || 0, empAdj.deductionPay || 0, total]);
      });

      rows.push([]);
      rows.push(['[ 3. 상세 일자별 근무 기록표 ]']);
      rows.push(['일자', '직원명', '직무', '근무구분', '출근시간', '퇴근시간', '휴게시간 차감']);
      schedule.filter(r => r.date.startsWith(monthKey)).forEach(r => {
        const emp = employees.find(e => e.id === r.empId);
        rows.push([r.date, emp ? emp.name : r.empId, emp ? emp.role : '', r.shift, r.startTime || '-', r.endTime || '-', `${r.breakHours || 1.0}시간`]);
      });

    } else if (activeModule === 'staff-directory') {
      filename = `신세계약국_직원명부.csv`;
      rows.push(['신세계약국 정식 직원 명부 (약국장 포함 9인)']);
      rows.push(['성명', '구분/직무', '직책', '급여유형', '입사일자', '약정시급/기본급', '연락처', '이메일 계정', '잔여연차', '비고']);
      employees.forEach(e => {
        rows.push([e.name, e.role, e.position, e.payType, e.joinDate, e.baseMonthlySalary || e.hourlyRate, e.phone, e.email, (15 - (e.usedLeave || 0)), e.memo]);
      });

    } else if (activeModule === 'annual-leave') {
      filename = `신세계약국_연차대장.csv`;
      rows.push(['신세계약국 연차 유급휴가 대장 (근로기준법 제60조)']);
      rows.push(['성명', '직무', '입사일자', '법정 총 연차일수', '사용 연차일수', '잔여 연차일수']);
      employees.forEach(e => {
        const calc = window.LaborCalculator.calculateStatutoryLeave(e.joinDate);
        rows.push([e.name, e.role, e.joinDate, calc.totalGranted, e.usedLeave || 0, (calc.totalGranted - (e.usedLeave || 0))]);
      });

      rows.push([]);
      rows.push(['[ 연차 신청 및 사용 상세 기록 ]']);
      rows.push(['신청일시', '직원명', '직무', '시작일', '종료일', '사용일수', '구분', '사유', '승인상태']);
      (data.leaveRequests || []).forEach(l => {
        rows.push([l.createdAt, l.empName, l.role, l.startDate, l.endDate, l.daysCount, l.type, l.reason, l.status]);
      });

    } else if (activeModule === 'discount-purchase') {
      filename = `신세계약국_직원할인구매대장.csv`;
      rows.push(['신세계약국 직원 할인 구매 정산 대장']);
      rows.push(['구매일시', '직원명', '품목명', '도매가(단가)', '수량', '결제 총금액']);
      (data.discountPurchases || []).forEach(d => {
        rows.push([d.dateStr, d.empName, d.itemName, d.unitPrice, d.qty, d.totalPrice]);
      });

    } else if (activeModule === 'notices') {
      filename = `신세계약국_공지사항및SOP.csv`;
      rows.push(['신세계약국 공지사항 & 업무 SOP 목록']);
      rows.push(['등록일자', '카테고리', '제목', '작성자', '상단고정여부', '내용']);
      (data.notices || []).forEach(n => {
        rows.push([n.date, n.category, n.title, n.author, n.isPinned ? '예' : '아니오', n.content.replace(/\n/g, ' ')]);
      });

    } else if (activeModule === 'worklog') {
      filename = `신세계약국_업무일지.csv`;
      rows.push(['신세계약국 약국 업무일지 & 인수인계 목록']);
      rows.push(['작성일자', '작성자', '구분', '업무 내용', '진행상태']);
      (data.worklogs || []).forEach(w => {
        rows.push([w.date, w.author, w.category, w.content, w.status]);
      });

    } else if (activeModule === 'emergency-contacts') {
      filename = `신세계약국_운영지원연락망.csv`;
      rows.push(['신세계약국 약국 운영 지원 연락망 Center']);
      rows.push(['구분', '담당자/기관명', '직통 연락처', '비고']);
      (data.emergencyContacts || []).forEach(c => {
        rows.push([c.category, c.name, c.phone, c.memo]);
      });

    } else if (activeModule === 'pharmacy-settlement') {
      filename = `신세계약국_스마트정산대시보드_2026년08월.csv`;
      const ps = data.pharmacySettlement || {};
      const dispensingFee = Number(ps.dispensingFee) || 18500000;
      const generalRevenue = Number(ps.generalRevenue || ps.posRevenue) || 24200000;
      const patientCopay = Number(ps.patientCopay) || 12000000;
      const nhisClaim = Number(ps.nhisClaim) || 18000000;
      const otherIncome = Number(ps.otherIncome) || 1800000;
      const totalRev = dispensingFee + generalRevenue + patientCopay + nhisClaim + otherIncome;
      const cardRev = Number(ps.cardRevenue) || Math.round(totalRev * 0.85);
      const cashRev = Number(ps.cashRevenue) || (totalRev - cardRev);

      const cashWholesale = ps.cashWholesale || { '다우약품': 12400000, '산성호': 8500000, '백제약품': 7200000, '지오영': 6800000 };
      const cardPharma = ps.cardPharma || { '대웅제약': 2400000, '동화약품': 1800000, '일양약품': 1200000, '비타민하우스': 950000, 'GC녹십자': 1050000 };

      rows.push(['신세계약국 스마트 정산 손익 대시보드']);
      rows.push(['산출년월', '2026년 08월']);
      rows.push([]);

      rows.push(['[ 1. 월간 손익 요약 (P&L Summary) ]']);
      rows.push(['수입 항목', '산출 설명', '금액(원)']);
      rows.push(['처방전 조제료 수입', '조제기술료 및 행위료', dispensingFee]);
      rows.push(['매장 일반매출', '일반의약품, 영양제, 의약외품', generalRevenue]);
      rows.push(['(세분화) 카드 수입', '신용/체크카드 결제 수납액', cardRev]);
      rows.push(['(세분화) 현금 수입', '현금 및 계좌이체 수납액', cashRev]);
      rows.push(['환자 본인부담금', '창구 직접 결제액', patientCopay]);
      rows.push(['국민건강보험공단 청구금', '공단 입금 요양급여비', nhisClaim]);
      rows.push(['비급여 및 기타수입', '비급여 주사제/제수입', otherIncome]);
      rows.push(['당월 총수입 합계', '', totalRev]);
      rows.push([]);

      rows.push(['[ 2-A. 도매상 및 제약사 현금결제 ]']);
      rows.push(['업체명/거래처', '결제 방식', '결제 금액(원)']);
      Object.entries(cashWholesale).forEach(([k, v]) => {
        rows.push([k, '현금/계좌이체 결제', v]);
      });
      rows.push([]);

      rows.push(['[ 2-B. 도매상 및 제약사 카드결제 ]']);
      rows.push(['업체명/거래처', '결제 방식', '결제 금액(원)']);
      Object.entries(cardPharma).forEach(([k, v]) => {
        rows.push([k, '신용카드 결제', v]);
      });
      rows.push([]);

      rows.push(['[ 3. 공과금 및 고정 관리비 ]']);
      rows.push(['비용 항목', '산출 설명', '금액(원)']);
      rows.push(['약국 월 임차료', '매장 월세', Number(ps.rentExpense) || 3500000]);
      rows.push(['건물 관리비', '전기/수도/수선 관리비', Number(ps.maintExpense) || 500000]);
      rows.push(['4대보험 사업주 부담금', '직원 4대보험 부담금', Number(ps.insurance4Cost) || 1850000]);
      rows.push(['세무사 기장료', '세무사 기장/결산 수수료', Number(ps.taxAccountantFee) || 220000]);
      rows.push(['카드/통신 수수료', 'POS/카드 가맹점 수수료', Number(ps.posCardFee) || 1120000]);
      Object.entries(ps.customOperating || {}).forEach(([k, v]) => {
        rows.push([`${k} (추가)`, '사용자 추가 고정비', v]);
      });
      rows.push([]);

      rows.push(['[ 4. 금융비용 및 원리금 상환 ]']);
      rows.push(['금융 항목', '산출 설명', '금액(원)']);
      rows.push(['담보대출 이자', '약국 담보/운전자금 이자', Number(ps.loanInterest) || 2150000]);
      rows.push(['대출 원리금 상환액', '원금 및 이자 상환액', Number(ps.loanPrincipal) || 1500000]);
      Object.entries(ps.customFinancial || {}).forEach(([k, v]) => {
        rows.push([`${k} (추가)`, '사용자 추가 금융비용', v]);
      });
      rows.push([]);

      rows.push(['[ 5. 2026년 8월 일일 결산 회계 장부 (31일) ]']);
      rows.push(['일자', '요일', '조제매출(원)', '일반매출(원)', '일총매출(원)', '카드수입액(원)', '현금수입액(원)', '일소액지출(원)', '비고']);
      (ps.dailyLogs || []).forEach(l => {
        rows.push([l.date, l.dayOfWeek, l.dispensingRevenue, l.posRevenue, l.totalRevenue, l.cardPay, l.cashPay, l.dailyExpense, l.note]);
      });

    } else if (activeModule === 'building-rental') {
      filename = `신세계약국타워_건물임대업_자산대장.csv`;
      const br = data.buildingRental || {};
      rows.push(['신세계약국 타워 건물 임대업 대시보드 자산 대장']);
      rows.push(['건물명', br.buildingName || '신세계약국 타워']);
      rows.push(['보유 자산가치', br.assetValue || 5500000000]);
      rows.push([]);
      rows.push(['[ 호실별 임대차 계약 대장 ]']);
      rows.push(['호실', '입주 상호명', '대표자명', '업종', '보증금(원)', '월 임대료(원)', '월 관리비(원)', '부가세 VAT(원)', '계약 시작일', '계약 만료일', '수납 상태', '비고']);
      (br.units || []).forEach(u => {
        rows.push([u.unit, u.tenantName, u.repName || '대표자', u.type, u.deposit, u.rent, u.maintenanceFee, u.vat || (u.rent * 0.1), u.startDate, u.endDate, u.status === 'PAID' ? '수납완료' : '당월미납', u.note]);
      });

    } else {
      filename = `신세계약국_${activeModule}.csv`;
      rows.push(['신세계약국 데이터 내보내기']);
      rows.push(['모듈', activeModule]);
      employees.forEach(e => {
        rows.push([e.name, e.role, e.email, e.phone]);
      });
    }

    const csvContent = '\uFEFF' + rows.map(r => r.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    alert(`📊 현재 화면 [${MODULE_TITLES[activeModule] || activeModule}] 주요 데이터가 구글 스프레드시트 연동 전용 파일(${filename})로 다운로드되었습니다!`);
  }

  function openSheetModal() {
    let modal = document.getElementById('sheet-sync-setup-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'sheet-sync-setup-modal';
      modal.className = 'modal-overlay';
      modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); z-index:9999999; display:flex; justify-content:center; align-items:center;';
      document.body.appendChild(modal);
    }

    const sheetId = "16yVS9f9bQs9Z2S1k2McnxhHGb9QjQguPa93MxZvNtP0";
    const sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;

    modal.innerHTML = `
      <div class="modal-card" style="background:#ffffff; border-radius:22px; max-width:640px; width:94%; padding:28px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.35); position:relative; max-height:92vh; overflow-y:auto;">
        <button type="button" class="close-btn" onclick="document.getElementById('sheet-sync-setup-modal').style.display='none'" style="position:absolute; top:20px; right:24px; font-size:26px; background:none; border:none; color:#64748b; cursor:pointer;">&times;</button>
        
        <div class="d-flex align-items-center gap-3 mb-4 pb-3 border-bottom">
          <div style="width:50px; height:50px; border-radius:14px; background:#dcfce7; color:#15803d; display:flex; justify-content:center; align-items:center; font-size:26px; flex-shrink:0;">
            <i class="fas fa-database"></i>
          </div>
          <div>
            <span class="badge bg-success mb-1" style="font-size:11.5px; border-radius:8px;">약국장 전용 데이터 & 동기화 센터</span>
            <h3 style="font-size:20px; font-weight:800; color:#0f172a; margin:0;">🔄 기기 간 실시간 동기화 & 백업 센터</h3>
          </div>
        </div>

        <!-- 1. 클라우드 실시간 동기화 카드 -->
        <div class="card p-3 mb-3" style="background:linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border:1.5px solid #93c5fd; border-radius:16px;">
          <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
            <div>
              <span style="font-size:12px; font-weight:700; color:#1d4ed8;">☁️ 집 ↔ 약국 컴퓨터 실시간 클라우드 동기화</span>
              <div style="font-size:13px; color:#1e40af;">최신 데이터를 즉시 불러오거나 클라우드에 업로드합니다.</div>
            </div>
            <div class="d-flex gap-2">
              <button type="button" class="btn btn-primary font-bold" onclick="App.forceSyncCloudNow()" style="border-radius:10px; padding:8px 16px; font-size:13px; box-shadow:0 4px 12px rgba(37,99,235,0.25);">
                <i class="fas fa-cloud-download-alt me-1"></i> 지금 클라우드 동기화
              </button>
            </div>
          </div>
        </div>

        <!-- 2. 기기 간 원클릭 파일 백업 및 복원 카드 -->
        <div class="card p-3 mb-3" style="background:#f8fafc; border:1.5px solid #cbd5e1; border-radius:16px;">
          <span style="font-size:12px; font-weight:700; color:#475569;">💾 집 컴퓨터 ↔ 약국 컴퓨터 100% 완전 복원 (파일 백업)</span>
          <p class="text-muted mb-2" style="font-size:12.5px;">네트워크 환경과 무관하게 집 컴퓨터의 모든 데이터를 파일(.json)로 저장하여 약국 컴퓨터에 즉시 복원할 수 있습니다.</p>
          <div class="d-flex flex-wrap gap-2">
            <button type="button" class="btn btn-outline-primary font-bold" onclick="App.exportBackupFile()" style="border-radius:10px; padding:8px 14px; font-size:13px;">
              <i class="fas fa-download me-1"></i> 📥 집 컴퓨터 데이터 백업 저장 (.json)
            </button>
            <button type="button" class="btn btn-success font-bold" onclick="App.triggerImportBackup()" style="border-radius:10px; padding:8px 14px; font-size:13px;">
              <i class="fas fa-upload me-1"></i> 📤 약국 컴퓨터에 백업 파일 복원
            </button>
          </div>
        </div>

        <!-- 3. 구글 스프레드시트 연동 카드 -->
        <div class="card p-3 mb-4" style="background:#ffffff; border:1.5px solid #e2e8f0; border-radius:16px;">
          <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
            <div>
              <span style="font-size:12px; font-weight:700; color:#64748b;">📊 구글 스프레드시트 연동</span>
              <div style="font-size:14px; font-weight:700; color:#0f172a;">신세계약국 마스터 구글 시트</div>
            </div>
            <div class="d-flex gap-2">
              <a href="${sheetUrl}" target="_blank" class="btn btn-outline-secondary font-bold" style="border-radius:10px; padding:7px 14px; font-size:12.5px;">
                <i class="fas fa-external-link-alt me-1"></i> 시트 열기
              </a>
              <button type="button" class="btn btn-outline-success font-bold" onclick="App.triggerDirectSheetSync()" style="border-radius:10px; padding:7px 14px; font-size:12.5px;">
                <i class="fas fa-sync-alt me-1"></i> 시트 연동
              </button>
            </div>
          </div>
        </div>

        <!-- 4. 하단 액션 버튼 -->
        <div class="d-flex justify-content-between align-items-center pt-2">
          <button type="button" class="btn btn-outline-dark font-bold" onclick="App.downloadActiveModuleToGoogleSheets()" style="border-radius:10px; padding:8px 16px; font-size:13px;">
            <i class="fas fa-file-csv me-1 text-success"></i> 현재 화면 엑셀(CSV) 다운로드
          </button>
          <button type="button" class="btn btn-secondary font-bold" onclick="document.getElementById('sheet-sync-setup-modal').style.display='none'" style="border-radius:10px; padding:8px 18px;">닫기</button>
        </div>
      </div>
    `;

    modal.style.display = 'flex';
  }

  function exportBackupFile() {
    if (window.SheetsSync && window.SheetsSync.exportFullBackupJSON) {
      window.SheetsSync.exportFullBackupJSON();
      alert('💾 현재 모든 데이터(직원명부, 스케줄, 업무일지, 결산, 연차 등)가 백업 파일(.json)로 안전하게 다운로드되었습니다!\n\n이 파일을 카카오톡이나 메일/USB를 통해 약국 컴퓨터로 전송하신 뒤, 약국 컴퓨터에서 [📤 약국 컴퓨터에 백업 파일 복원]을 누르시면 1초 만에 100% 동일하게 복원됩니다.');
    }
  }

  function triggerImportBackup() {
    let input = document.getElementById('backup-file-hidden-input');
    if (!input) {
      input = document.createElement('input');
      input.type = 'file';
      input.id = 'backup-file-hidden-input';
      input.accept = '.json,application/json';
      input.style.display = 'none';
      input.onchange = function(e) {
        handleBackupFileSelect(e);
      };
      document.body.appendChild(input);
    }
    input.value = '';
    input.click();
  }

  function handleBackupFileSelect(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(evt) {
      try {
        const text = evt.target.result;
        const res = window.SheetsSync.importFullBackupJSON(text);
        if (res && res.success) {
          alert('🎉 백업 파일의 모든 데이터가 성공적으로 복원되었습니다!\n(직원명부, 스케줄, 업무일지, 결산, 연차 등 모든 데이터가 최신으로 갱신되었습니다)');
          const modal = document.getElementById('sheet-sync-setup-modal');
          if (modal) modal.style.display = 'none';
        } else {
          alert('❌ 백업 파일 복원 실패: ' + (res.error || '올바른 파일 형식이 아닙니다.'));
        }
      } catch(err) {
        alert('❌ 파일 읽기 오류: ' + err.message);
      }
    };
    reader.readAsText(file, 'utf-8');
  }

  async function forceSyncCloudNow() {
    if (window.SheetsSync && window.SheetsSync.pullFromCloud) {
      await window.SheetsSync.pullFromCloud();
      alert('🎉 클라우드 최신 데이터 동기화가 완료되었습니다!');
      renderActiveModule();
      renderSidebarNavigation();
    }
  }

  async function triggerDirectSheetSync() {
    const sheetId = "16yVS9f9bQs9Z2S1k2McnxhHGb9QjQguPa93MxZvNtP0";
    if (window.SheetsSync && window.SheetsSync.syncDirectWithGoogleSheet) {
      const res = await window.SheetsSync.syncDirectWithGoogleSheet(sheetId);
      if (res && res.success) {
        alert("🎉 구글 스프레드시트(신세계약국_DB_260818) 데이터가 성공적으로 동기화 반영되었습니다!");
        if (window.StaffDirectoryModule) {
          window.StaffDirectoryModule.render('module-content');
        }
        renderActiveModule();
        renderSidebarNavigation();
      } else {
        alert("⚠️ 구글 시트 접근 안내: 구글 시트 우측 상단 [공유] 버튼을 눌러 '링크가 있는 모든 사용자(뷰어/편집자)'로 설정해 주시면 즉시 100% 자동 동기화됩니다.");
      }
    }
    const modal = document.getElementById('sheet-sync-setup-modal');
    if (modal) modal.style.display = 'none';
  }

  function closeSheetModal() {
    const modal = document.getElementById('sheet-sync-setup-modal');
    if (modal) modal.style.display = 'none';
  }
function copyGasScriptCode() {
    const code = `/**
 * 신세계약국 & 구글 스프레드시트 100% 실시간 양방향 동기화 Google Apps Script
 * Sheet ID: 16yVS9f9bQs9Z2S1k2McnxhHGb9QjQguPa93MxZvNtP0
 */

function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var data = {
    employees: readSheetData(ss.getSheetByName("직원명부")),
    dailySettlement: readSheetData(ss.getSheetByName("일일결산")),
    schedule: readSheetData(ss.getSheetByName("월간근무스케줄")),
    pharmacySettlement: readSheetData(ss.getSheetByName("스마트약국정산")),
    buildingRental: readSheetData(ss.getSheetByName("건물임대대장")),
    leaveRequests: readSheetData(ss.getSheetByName("연차신청대장"))
  };
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var contents = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (contents.employees) writeSheetData(ss.getSheetByName("직원명부"), contents.employees);
    if (contents.dailySettlement) writeSheetData(ss.getSheetByName("일일결산"), contents.dailySettlement);
    if (contents.pharmacySettlement) writeSheetData(ss.getSheetByName("스마트약국정산"), contents.pharmacySettlement);
    if (contents.buildingRental) writeSheetData(ss.getSheetByName("건물임대대장"), contents.buildingRental);
    return ContentService.createTextOutput(JSON.stringify({ status: "SUCCESS" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "ERROR", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function readSheetData(sheet) {
  if (!sheet) return [];
  var values = sheet.getDataRange().getValues();
  if (values.length <= 1) return [];
  var headers = values[0];
  var result = [];
  for (var i = 1; i < values.length; i++) {
    var row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[i][j];
    }
    result.push(row);
  }
  return result;
}

function writeSheetData(sheet, dataList) {
  if (!sheet || !dataList || dataList.length === 0) return;
  var headers = Object.keys(dataList[0]);
  sheet.clearContents();
  sheet.appendRow(headers);
  dataList.forEach(function(item) {
    var row = headers.map(function(h) { return item[h] || ""; });
    sheet.appendRow(row);
  });
}`;

    navigator.clipboard.writeText(code).then(() => {
      alert("📋 Google Apps Script (GAS) 100% 양방향 자동 통신 코드가 클립보드에 복사되었습니다!\n구글 시트 메뉴 [확장 프로그램] ➔ [Apps Script]에 붙여넣어 주세요.");
    });
  }

  function openEmpModal() {
    if (window.StaffDirectoryModule && window.StaffDirectoryModule.openNewEmpModal) {
      window.StaffDirectoryModule.openNewEmpModal();
      return;
    }
    let modal = document.getElementById('new-emp-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'new-emp-modal';
      modal.className = 'modal-overlay';
      modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); z-index:9999999; display:flex; justify-content:center; align-items:center;';
      document.body.appendChild(modal);
    }
    modal.style.display = 'flex';
    modal.style.zIndex = '9999999';
  }

  function saveNewEmployee(e) {
    e.preventDefault();
    const curr = window.SheetsSync.getCurrentUser();
    if (curr && curr.role !== '약국장' && curr.name !== '문성도') {
      alert('🔒 [권한 통제] 약국장님만 신규 직원을 등록할 수 있습니다.');
      return;
    }

    const name = document.getElementById('new-emp-name').value.trim();
    const role = document.getElementById('new-emp-role').value;
    const position = document.getElementById('new-emp-position').value.trim();
    const payType = document.getElementById('new-emp-paytype').value;
    const hourlyRate = parseInt(document.getElementById('new-emp-rate').value) || 35000;
    const baseMonthlySalary = parseInt(document.getElementById('new-emp-salary').value) || 2717000;
    const email = document.getElementById('new-emp-email').value.trim();
    const phone = document.getElementById('new-emp-phone').value.trim();
    const joinDate = document.getElementById('new-emp-joindate').value;
    const memo = document.getElementById('new-emp-memo').value.trim();

    const emps = window.SheetsSync.getEmployees() || [];
    
    if (emps.some(emp => emp.email === email || emp.username === email)) {
      alert('⚠️ 이미 등록된 이메일 계정이 존재합니다. 다른 이메일을 사용하세요.');
      return;
    }

    const ALL_COMMON_TABS = [
      'notices-module', 'worklog-module', 'schedule-module',
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

    document.getElementById('new-emp-modal').style.display = 'none';
    alert(`🎉 신규 직원 [${name} ${role}] 님의 계정 및 명부 등록이 완료되었습니다!\n(초기 비밀번호: 1234)`);
    
    if (window.StaffDirectoryModule) {
      window.StaffDirectoryModule.render('module-content');
    }
  }

  function openLeaveModal() {
    if (window.AnnualLeaveModule && window.AnnualLeaveModule.toggleInlineLeaveForm) {
      window.AnnualLeaveModule.toggleInlineLeaveForm(true);
    }
  }

  function submitLeaveRequest(e) {
    if (window.AnnualLeaveModule && window.AnnualLeaveModule.submitLeaveApplication) {
      window.AnnualLeaveModule.submitLeaveApplication(e);
    }
  }

  // 🚀 [Option A] 자동 버전 감지 및 무중단 스마트 자동 업데이트 엔진
  let isCheckingUpdate = false;
  async function checkAppUpdate() {
    if (isCheckingUpdate || typeof window === 'undefined' || typeof window.fetch !== 'function') return;
    isCheckingUpdate = true;
    try {
      const res = await fetch('version.json?_t=' + Date.now(), {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
      });
      if (res && res.ok) {
        const data = await res.json();
        if (data && data.version) {
          const storedVersion = localStorage.getItem('ssg_app_version');
          if (!storedVersion) {
            localStorage.setItem('ssg_app_version', data.version);
            return;
          }
          if (storedVersion !== data.version) {
            localStorage.setItem('ssg_app_version', data.version);
            console.log("ℹ️ 새 버전 배포 감지:", data.version);
          }
        }
      }
    } catch(e) {
      // 오프라인이나 네트워크 불안정 시 조용히 무시
    } finally {
      isCheckingUpdate = false;
    }
  }

  function startAutoUpdateChecker() {
    // 1. 앱 기동 2초 후 1차 체크 및 클라우드 동기화
    setTimeout(() => {
      checkAppUpdate();
      if (window.SheetsSync && typeof window.SheetsSync.pullFromCloud === 'function') {
        window.SheetsSync.pullFromCloud();
      }
    }, 2000);

    // 2. 다른 앱이나 탭에서 약국 앱으로 돌아올 때(Focus) 체크 및 클라우드 동기화
    window.addEventListener('focus', () => {
      checkAppUpdate();
      if (window.SheetsSync && typeof window.SheetsSync.pullFromCloud === 'function') {
        window.SheetsSync.pullFromCloud();
      }
    });

    // 3. 백그라운드 자동 동기화 & 버전 체크 (배터리 및 트래픽 절약형 45초 주기)
    setInterval(() => {
      checkAppUpdate();
      if (window.SheetsSync && typeof window.SheetsSync.pullFromCloud === 'function') {
        window.SheetsSync.pullFromCloud();
      }
    }, 45000);
  }

  return {
    init,
    renderActiveModule,
    getActiveModule: () => activeModule,
    renderSidebarNavigation,
    renderUserHeader,
    quickSelectLogin,
    showLoginModal,
    closeLoginModal,
    handleLoginSubmit,
    userLogout,
    openChangePwModal,
    closeChangePwModal,
    checkPwRealtime,
    handleChangePwSubmit,
    switchModule,
    navigate: function(mod) { switchModule(mod, true); },
    toggleDrawer,
    openDrawer,
    closeDrawer,
    toggleTheme,
    downloadActiveModuleToGoogleSheets,
    openSheetModal,
    closeSheetModal,
    triggerDirectSheetSync,
    copyGasScriptCode,
    openEmpModal,
    saveNewEmployee,
    openLeaveModal,
    submitLeaveRequest,
    checkPendingRejectionNotice,
    quickSelectGatewayLogin,
    handleGatewayLoginSubmit
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  window.App.init();
});
