/**
 * 4. 약국장 결재 모듈 컨트롤러 (Executive Approval & Decision Hub v42.0)
 * [1안] 약국 4대 핵심 업무 '원스톱 통합 전자결재 사령탑'
 * - 🌴 1. 법정 연차·유급휴가 결재
 * - 💊 2. 직원 할인구매 결재 & 급여공제 승인
 * - 📅 3. 월간 근무스케줄 마스터 최종 확정 승인
 * - 📝 4. 일일 업무일지 & 특이사항 결재 (서명/확인)
 * - ⚡ 오늘 대기 중인 모든 건 원클릭 전체 일괄 승인 지원
 */
window.ApprovalModule = (function () {

  let activeSubTab = 'all'; // 'all' | 'leave' | 'discount' | 'schedule' | 'worklog' | 'history'
  let isAuthenticated = false; // 약국장 인증 상태

  function setSubTab(tab) {
    activeSubTab = tab;
    render('module-content');
  }

  function render(containerId) {
    const container = document.getElementById(containerId || 'module-content');
    if (!container) return;

    const currentUser = window.SheetsSync.getCurrentUser();
    // 약국장 계정으로 로그인한 경우 1초 즉시 승인 공개
    if (currentUser && currentUser.role === '약국장') {
      isAuthenticated = true;
    }

    if (!isAuthenticated) {
      container.innerHTML = `
        <div class="alert alert-danger p-4 text-center my-5" style="border-radius:18px; box-shadow:0 8px 24px rgba(220,38,38,0.1);">
          <div style="font-size:40px; margin-bottom:12px;"><i class="fas fa-lock text-danger"></i></div>
          <h4 style="font-weight:800; color:#991b1b;">🔒 약국장 전용 최고 보안 구역</h4>
          <p class="mb-0 text-muted" style="font-size:14px;">약국장 결재 사령탑은 <strong>약국장(대표약사) 계정으로 로그인한 경우에만</strong> 공개됩니다.</p>
        </div>
      `;
      return;
    }

    const data = window.SheetsSync.getData();
    const leaveRequests = data.leaveRequests || [];
    const pendingLeaves = leaveRequests.filter(r => r.status === 'PENDING');
    const processedLeaves = leaveRequests.filter(r => r.status !== 'PENDING');

    const purchases = data.discountPurchases || [];
    const unpaidPurchases = purchases.filter(p => !p.isPaid);
    const paidPurchases = purchases.filter(p => p.isPaid);
    const unpaidTotal = unpaidPurchases.reduce((acc, cur) => acc + (cur.totalPrice || 0), 0);

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const monthKey = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
    const scheduleStatusObj = (data.scheduleStatus || {})[monthKey] || {};
    const isScheduleApproved = scheduleStatusObj.directorApproved === true || scheduleStatusObj.pharmacistStatus === 'APPROVED' || scheduleStatusObj.staffStatus === 'APPROVED';

    const logs = (window.SheetsSync.getWorklogs ? window.SheetsSync.getWorklogs() : data.worklogs) || [];
    const pendingLogs = logs.filter(l => l.status === 'PENDING');

    const totalPendingCount = pendingLeaves.length + unpaidPurchases.length + (isScheduleApproved ? 0 : 1) + pendingLogs.length;

    let html = `
      <div class="module-header d-flex justify-content-between align-items-center flex-wrap gap-3 pb-3 mb-4 border-bottom">
        <div>
          <div class="d-flex align-items-center gap-2 mb-1">
            <span class="badge bg-danger" style="font-size:11.5px; padding:5px 12px; border-radius:12px; font-weight:700;">
              🔐 약국장 최고 관리자 사령탑
            </span>
            <span class="badge bg-success" style="font-size:11.5px; padding:5px 12px; border-radius:12px; font-weight:700;">
              <i class="fas fa-shield-check me-1"></i> 실시간 연동 중
            </span>
          </div>
          <h2 style="font-size:24px; font-weight:800; color:#0f172a; margin:0; letter-spacing:-0.5px;">
            👑 약국장 종합 전자결재 & 인사승인 센터
          </h2>
          <p class="subtitle" style="font-size:13.5px; color:#64748b; margin:4px 0 0 0;">
            연차 승인 · 직원 할인구매 · 월간 근무표 확정 · 일일 업무일지까지 약국의 모든 결재를 원스톱으로 처리합니다.
          </p>
        </div>
        
        <div class="d-flex align-items-center gap-2 flex-wrap">
          ${totalPendingCount > 0 ? `
            <button type="button" class="btn btn-success font-bold" onclick="ApprovalModule.approveAllPending()" style="border-radius:14px; padding:10px 20px; font-size:14.5px; box-shadow:0 4px 14px rgba(16,185,129,0.3); transition:transform 0.2s;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
              <i class="fas fa-bolt me-1"></i> ⚡ 오늘 대기건 전체 일괄 승인 (${totalPendingCount}건)
            </button>
          ` : `
            <span class="badge bg-light text-success p-2 px-3 font-bold" style="border-radius:12px; font-size:13.5px; border:1.5px solid #86efac;">
              <i class="fas fa-check-double me-1"></i> 모든 결재가 완료되었습니다
            </span>
          `}
        </div>
      </div>

      <!-- 📊 Lean-OPS Executive KPI 4대 핵심 요약 카드 -->
      <div class="mb-4" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:12px;">
        
        <!-- 1. 연차 결재 대기 -->
        <div class="p-3" style="border-radius:18px; border:1.5px solid ${pendingLeaves.length > 0 ? '#fde68a' : '#e2e8f0'}; background:${pendingLeaves.length > 0 ? '#fffbeb' : '#ffffff'}; display:flex; flex-direction:column; justify-content:space-between; cursor:pointer;" onclick="ApprovalModule.setSubTab('leave')">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span style="font-size:12px; font-weight:800; color:#92400e;">🌴 연차 결재 대기</span>
            <div style="width:26px; height:26px; border-radius:8px; background:#fef3c7; color:#d97706; display:flex; align-items:center; justify-content:center; font-size:12px;">
              <i class="fas fa-plane-departure"></i>
            </div>
          </div>
          <div style="font-size:22px; font-weight:800; color:#b45309; font-family:'Outfit',sans-serif;">
            ${pendingLeaves.length}<span style="font-size:13px; font-weight:700;"> 건</span>
          </div>
          <div style="font-size:11px; color:#d97706; font-weight:600; margin-top:2px;">
            ${pendingLeaves.length > 0 ? '승인 대기 중' : '모두 완료'}
          </div>
        </div>

        <!-- 2. 할인구매 정산 대기 -->
        <div class="p-3" style="border-radius:18px; border:1.5px solid ${unpaidPurchases.length > 0 ? '#fecdd3' : '#e2e8f0'}; background:${unpaidPurchases.length > 0 ? '#fff1f2' : '#ffffff'}; display:flex; flex-direction:column; justify-content:space-between; cursor:pointer;" onclick="ApprovalModule.setSubTab('discount')">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span style="font-size:12px; font-weight:800; color:#9f1239;">💊 할인구매 결재</span>
            <div style="width:26px; height:26px; border-radius:8px; background:#ffe4e6; color:#e11d48; display:flex; align-items:center; justify-content:center; font-size:12px;">
              <i class="fas fa-shopping-bag"></i>
            </div>
          </div>
          <div style="font-size:22px; font-weight:800; color:#be123c; font-family:'Outfit',sans-serif;">
            ${unpaidPurchases.length}<span style="font-size:13px; font-weight:700;"> 건</span>
          </div>
          <div style="font-size:11px; color:#e11d48; font-weight:600; margin-top:2px;">
            ₩${unpaidTotal.toLocaleString()}원 대기
          </div>
        </div>

        <!-- 3. 근무스케줄 확정 -->
        <div class="p-3" style="border-radius:18px; border:1.5px solid ${isScheduleApproved ? '#bbf7d0' : '#fed7aa'}; background:${isScheduleApproved ? '#f0fdf4' : '#fff7ed'}; display:flex; flex-direction:column; justify-content:space-between; cursor:pointer;" onclick="ApprovalModule.setSubTab('schedule')">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span style="font-size:12px; font-weight:800; color:${isScheduleApproved ? '#15803d' : '#c2410c'};">📅 ${currentMonth}월 스케줄</span>
            <div style="width:26px; height:26px; border-radius:8px; background:${isScheduleApproved ? '#dcfce7' : '#ffedd5'}; color:${isScheduleApproved ? '#16a34a' : '#ea580c'}; display:flex; align-items:center; justify-content:center; font-size:12px;">
              <i class="fas fa-calendar-check"></i>
            </div>
          </div>
          <div style="font-size:20px; font-weight:800; color:${isScheduleApproved ? '#15803d' : '#ea580c'};">
            ${isScheduleApproved ? '✅ 확정완료' : '⏳ 승인대기'}
          </div>
          <div style="font-size:11px; color:${isScheduleApproved ? '#166534' : '#c2410c'}; font-weight:600; margin-top:2px;">
            ${isScheduleApproved ? '마스터 승인됨' : '약국장 결재 필요'}
          </div>
        </div>

        <!-- 4. 업무일지 확인 -->
        <div class="p-3" style="border-radius:18px; border:1.5px solid ${pendingLogs.length > 0 ? '#bfdbfe' : '#e2e8f0'}; background:${pendingLogs.length > 0 ? '#eff6ff' : '#ffffff'}; display:flex; flex-direction:column; justify-content:space-between; cursor:pointer;" onclick="ApprovalModule.setSubTab('worklog')">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span style="font-size:12px; font-weight:800; color:#1e40af;">📝 업무일지 확인</span>
            <div style="width:26px; height:26px; border-radius:8px; background:#dbeafe; color:#2563eb; display:flex; align-items:center; justify-content:center; font-size:12px;">
              <i class="fas fa-clipboard-list"></i>
            </div>
          </div>
          <div style="font-size:22px; font-weight:800; color:#1d4ed8; font-family:'Outfit',sans-serif;">
            ${pendingLogs.length}<span style="font-size:13px; font-weight:700;"> 건</span>
          </div>
          <div style="font-size:11px; color:#2563eb; font-weight:600; margin-top:2px;">
            ${pendingLogs.length > 0 ? '진행/미확인 항목' : '모두 확인완료'}
          </div>
        </div>

      </div>

      <!-- 🔀 스마트 서브 탭 네비게이션 바 -->
      <!-- 🔀 럭셔리 균등 그리드 서브 탭 네비게이션 (PC 한줄 균형 & 모바일 자동 정돈) -->
      <div class="approval-subtabs-grid mb-4" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:8px; background:#f8fafc; padding:8px; border-radius:16px; border:1px solid #e2e8f0;">
        
        <button type="button" class="btn text-center" style="border-radius:12px; padding:10px 12px; font-size:13.5px; transition:all 0.2s; border:none; ${activeSubTab === 'all' ? 'background:#0f172a; color:#ffffff; font-weight:800; box-shadow:0 4px 12px rgba(15,23,42,0.2);' : 'background:#ffffff; color:#475569; font-weight:600; border:1px solid #e2e8f0;'}" onclick="ApprovalModule.setSubTab('all')">
          <i class="fas fa-layer-group me-1.5" style="color:${activeSubTab === 'all' ? '#60a5fa' : '#3b82f6'};"></i> 전체 모아보기
        </button>

        <button type="button" class="btn text-center d-flex align-items-center justify-content-center gap-1" style="border-radius:12px; padding:10px 12px; font-size:13.5px; transition:all 0.2s; border:none; ${activeSubTab === 'leave' ? 'background:#0f172a; color:#ffffff; font-weight:800; box-shadow:0 4px 12px rgba(15,23,42,0.2);' : 'background:#ffffff; color:#475569; font-weight:600; border:1px solid #e2e8f0;'}" onclick="ApprovalModule.setSubTab('leave')">
          <i class="fas fa-umbrella-beach me-1" style="color:${activeSubTab === 'leave' ? '#fde047' : '#eab308'};"></i> 연차 결재
          ${pendingLeaves.length > 0 ? `<span class="badge bg-danger ms-1" style="font-size:11px; padding:3px 7px; border-radius:8px;">${pendingLeaves.length}</span>` : ''}
        </button>

        <button type="button" class="btn text-center d-flex align-items-center justify-content-center gap-1" style="border-radius:12px; padding:10px 12px; font-size:13.5px; transition:all 0.2s; border:none; ${activeSubTab === 'discount' ? 'background:#0f172a; color:#ffffff; font-weight:800; box-shadow:0 4px 12px rgba(15,23,42,0.2);' : 'background:#ffffff; color:#475569; font-weight:600; border:1px solid #e2e8f0;'}" onclick="ApprovalModule.setSubTab('discount')">
          <i class="fas fa-shopping-bag me-1" style="color:${activeSubTab === 'discount' ? '#f472b6' : '#ec4899'};"></i> 직원 할인구매
          ${unpaidPurchases.length > 0 ? `<span class="badge bg-danger ms-1" style="font-size:11px; padding:3px 7px; border-radius:8px;">${unpaidPurchases.length}</span>` : ''}
        </button>

        <button type="button" class="btn text-center" style="border-radius:12px; padding:10px 12px; font-size:13.5px; transition:all 0.2s; border:none; ${activeSubTab === 'schedule' ? 'background:#0f172a; color:#ffffff; font-weight:800; box-shadow:0 4px 12px rgba(15,23,42,0.2);' : 'background:#ffffff; color:#475569; font-weight:600; border:1px solid #e2e8f0;'}" onclick="ApprovalModule.setSubTab('schedule')">
          <i class="fas fa-calendar-check me-1.5" style="color:${activeSubTab === 'schedule' ? '#4ade80' : '#22c55e'};"></i> 스케줄 승인
        </button>

        <button type="button" class="btn text-center d-flex align-items-center justify-content-center gap-1" style="border-radius:12px; padding:10px 12px; font-size:13.5px; transition:all 0.2s; border:none; ${activeSubTab === 'worklog' ? 'background:#0f172a; color:#ffffff; font-weight:800; box-shadow:0 4px 12px rgba(15,23,42,0.2);' : 'background:#ffffff; color:#475569; font-weight:600; border:1px solid #e2e8f0;'}" onclick="ApprovalModule.setSubTab('worklog')">
          <i class="fas fa-clipboard-list me-1" style="color:${activeSubTab === 'worklog' ? '#60a5fa' : '#3b82f6'};"></i> 일일 업무일지
          ${pendingLogs.length > 0 ? `<span class="badge bg-primary ms-1" style="font-size:11px; padding:3px 7px; border-radius:8px;">${pendingLogs.length}</span>` : ''}
        </button>

        <button type="button" class="btn text-center" style="border-radius:12px; padding:10px 12px; font-size:13.5px; transition:all 0.2s; border:none; ${activeSubTab === 'history' ? 'background:#0f172a; color:#ffffff; font-weight:800; box-shadow:0 4px 12px rgba(15,23,42,0.2);' : 'background:#ffffff; color:#475569; font-weight:600; border:1px solid #e2e8f0;'}" onclick="ApprovalModule.setSubTab('history')">
          <i class="fas fa-history me-1.5" style="color:${activeSubTab === 'history' ? '#cbd5e1' : '#64748b'};"></i> 결재 이력
        </button>

      </div>

      <!-- 📦 서브 탭 컨텐츠 영역 -->
      <div id="approval-tab-content">
        ${renderContentSections({ pendingLeaves, processedLeaves, unpaidPurchases, paidPurchases, unpaidTotal, currentYear, currentMonth, isScheduleApproved, pendingLogs, data })}
      </div>
    `;

    container.innerHTML = html;
  }

  function renderContentSections(ctx) {
    let html = '';

    // 1. 연차·유급휴가 결재 섹션
    if (activeSubTab === 'all' || activeSubTab === 'leave') {
      html += renderLeaveApprovalSection(ctx.pendingLeaves);
    }

    // 2. 직원 할인구매 결재 섹션
    if (activeSubTab === 'all' || activeSubTab === 'discount') {
      html += renderDiscountApprovalSection(ctx.unpaidPurchases, ctx.unpaidTotal);
    }

    // 3. 월간 근무스케줄 마스터 승인 섹션
    if (activeSubTab === 'all' || activeSubTab === 'schedule') {
      html += renderScheduleApprovalSection(ctx.currentYear, ctx.currentMonth, ctx.isScheduleApproved, ctx.data);
    }

    // 4. 일일 업무일지 & 특이사항 서명 섹션
    if (activeSubTab === 'all' || activeSubTab === 'worklog') {
      html += renderWorklogApprovalSection(ctx.pendingLogs);
    }

    // 5. 결재 완료 이력 섹션
    if (activeSubTab === 'history') {
      html += renderHistorySection(ctx.processedLeaves, ctx.paidPurchases);
    }

    return html;
  }

  // 🌴 1. 연차 결재 섹션
  function renderLeaveApprovalSection(pendingLeaves) {
    return `
      <div class="card-section mb-5" style="background:#ffffff; border:1.5px solid #cbd5e1; border-radius:20px; padding:24px; box-shadow:0 6px 20px rgba(0,0,0,0.03);">
        <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3 pb-2 border-bottom">
          <div class="d-flex align-items-center gap-2">
            <div style="width:36px; height:36px; border-radius:10px; background:#fef3c7; color:#d97706; display:flex; align-items:center; justify-content:center; font-size:18px;">
              <i class="fas fa-plane-departure"></i>
            </div>
            <div>
              <h3 style="font-size:18px; font-weight:800; color:#0f172a; margin:0;">
                🌴 1. 연차·유급휴가 결재 대기 <span class="badge bg-warning text-dark ms-1" style="border-radius:10px;">${pendingLeaves.length}건</span>
              </h3>
              <span style="font-size:12.5px; color:#64748b;">직원들이 제출한 연차 유급휴가 신청 건을 승인하거나 반려합니다.</span>
            </div>
          </div>

          ${pendingLeaves.length > 0 ? `
            <div class="d-flex align-items-center gap-2">
              <button type="button" class="btn btn-sm btn-success font-bold" onclick="ApprovalModule.bulkApproveLeave()" style="border-radius:10px; padding:7px 16px;">
                <i class="fas fa-check-double me-1"></i> 선택 일괄 승인
              </button>
              <button type="button" class="btn btn-sm btn-outline-danger font-bold" onclick="ApprovalModule.bulkRejectLeave()" style="border-radius:10px; padding:7px 14px;">
                <i class="fas fa-times me-1"></i> 선택 반려
              </button>
            </div>
          ` : ''}
        </div>

        <div class="table-responsive" style="border-radius:12px; border:1px solid #e2e8f0; overflow-x:auto; -webkit-overflow-scrolling:touch;">
          <table class="table align-middle mb-0" style="font-size:13.5px; min-width:760px; white-space:nowrap;">
            <thead style="background:#f8fafc; font-weight:700; color:#475569; border-bottom:2px solid #e2e8f0;">
              <tr>
                <th style="width:45px; text-align:center;">
                  <input type="checkbox" onchange="ApprovalModule.toggleAllLeaveChecks(this)" style="cursor:pointer; width:16px; height:16px;">
                </th>
                <th style="width:120px;">신청 직원</th>
                <th style="width:100px; text-align:center;">구분</th>
                <th style="width:180px; text-align:center;">신청 기간</th>
                <th style="width:90px; text-align:center;">차감 일수</th>
                <th>신청 사유</th>
                <th style="width:130px; text-align:center;">신청 일시</th>
                <th style="width:150px; text-align:center;">결재 승인</th>
              </tr>
            </thead>
            <tbody>
              ${pendingLeaves.length === 0 ? `
                <tr>
                  <td colspan="8" class="text-center py-5 text-muted" style="background:#f8fafc;">
                    <i class="fas fa-check-circle text-success mb-2" style="font-size:28px;"></i><br>
                    <strong>현재 결재 대기 중인 연차 신청 건이 없습니다.</strong>
                  </td>
                </tr>
              ` : pendingLeaves.map(req => `
                <tr style="border-bottom:1px solid #f1f5f9;">
                  <td style="text-align:center;">
                    <input type="checkbox" class="leave-chk" value="${req.id}" style="cursor:pointer; width:16px; height:16px;">
                  </td>
                  <td>
                    <strong style="font-size:14.5px; color:#0f172a;">${req.empName}</strong>
                    <span class="badge ${req.role && req.role.includes('약사') ? 'bg-primary' : 'bg-secondary'} ms-1" style="font-size:11px; padding:3px 7px; border-radius:6px;">${req.role || '직원'}</span>
                  </td>
                  <td style="text-align:center;"><span class="badge bg-info text-dark" style="font-size:12px; padding:4px 8px; border-radius:8px;">${req.type || '연차'}</span></td>
                  <td style="text-align:center; font-family:'Outfit', sans-serif; font-weight:600; color:#1e293b;">${req.startDate} ~ ${req.endDate}</td>
                  <td style="text-align:center;"><strong class="text-primary" style="font-size:15px; font-family:'Outfit', sans-serif;">${req.daysCount}일</strong></td>
                  <td style="color:#475569; font-weight:500;">${req.reason || '-'}</td>
                  <td style="text-align:center; font-size:12px; color:#64748b;">${req.createdAt || '-'}</td>
                  <td style="text-align:center;">
                    <div class="d-flex justify-content-center gap-1.5">
                      <button type="button" class="btn btn-sm btn-success font-bold" onclick="ApprovalModule.approveLeaveSingle('${req.id}')" style="border-radius:8px; padding:5px 12px; font-size:12.5px;">
                        <i class="fas fa-check"></i> 승인
                      </button>
                      <button type="button" class="btn btn-sm btn-outline-danger font-bold" onclick="ApprovalModule.rejectLeaveSingle('${req.id}')" style="border-radius:8px; padding:5px 10px; font-size:12.5px;">
                        <i class="fas fa-times"></i> 반려
                      </button>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // 💊 2. 직원 할인구매 결재 섹션
  function renderDiscountApprovalSection(unpaidPurchases, unpaidTotal) {
    return `
      <div class="card-section mb-5" style="background:#ffffff; border:1.5px solid #cbd5e1; border-radius:20px; padding:24px; box-shadow:0 6px 20px rgba(0,0,0,0.03);">
        <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3 pb-2 border-bottom">
          <div class="d-flex align-items-center gap-2">
            <div style="width:36px; height:36px; border-radius:10px; background:#ffe4e6; color:#e11d48; display:flex; align-items:center; justify-content:center; font-size:18px;">
              <i class="fas fa-shopping-bag"></i>
            </div>
            <div>
              <h3 style="font-size:18px; font-weight:800; color:#0f172a; margin:0;">
                💊 2. 직원 할인구매 결재 & 급여공제 승인 <span class="badge bg-danger ms-1" style="border-radius:10px;">${unpaidPurchases.length}건 (₩${unpaidTotal.toLocaleString()}원)</span>
              </h3>
              <span style="font-size:12.5px; color:#64748b;">동료 약사의 1차 교차검수를 거친 구매 건을 약국장이 최종 승인 및 정산 처리합니다.</span>
            </div>
          </div>

          ${unpaidPurchases.length > 0 ? `
            <button type="button" class="btn btn-sm btn-success font-bold" onclick="ApprovalModule.bulkSettleDiscount()" style="border-radius:10px; padding:7px 16px;">
              <i class="fas fa-check-circle me-1"></i> 💰 할인구매 전건 일괄 결재 정산
            </button>
          ` : ''}
        </div>

        <div class="table-responsive" style="border-radius:12px; border:1px solid #e2e8f0; overflow-x:auto; -webkit-overflow-scrolling:touch;">
          <table class="table align-middle mb-0" style="font-size:13.5px; min-width:760px; white-space:nowrap;">
            <thead style="background:#f8fafc; font-weight:700; color:#475569; border-bottom:2px solid #e2e8f0;">
              <tr>
                <th style="width:130px;">구매 일시</th>
                <th style="width:110px;">직원명</th>
                <th>구매 품목 / 수량</th>
                <th style="width:130px; text-align:right;">결제 금액</th>
                <th style="width:130px; text-align:center;">1차 교차검수</th>
                <th style="width:150px; text-align:center;">약국장 최종 결재</th>
              </tr>
            </thead>
            <tbody>
              ${unpaidPurchases.length === 0 ? `
                <tr>
                  <td colspan="6" class="text-center py-5 text-muted" style="background:#f8fafc;">
                    <i class="fas fa-receipt text-success mb-2" style="font-size:28px;"></i><br>
                    <strong>정산 대기 중인 직원 할인구매 내역이 없습니다.</strong>
                  </td>
                </tr>
              ` : unpaidPurchases.map(p => {
                const isCross = !!p.isCrossChecked;
                return `
                  <tr style="border-bottom:1px solid #f1f5f9;">
                    <td style="color:#64748b; font-family:'Outfit', sans-serif;">${p.dateStr || '-'}</td>
                    <td><strong style="color:#0f172a; font-size:14.5px;">${p.empName}</strong></td>
                    <td style="font-weight:600; color:#334155;">${p.itemName || '-'}</td>
                    <td style="text-align:right; font-weight:800; color:#15803d; font-family:'Outfit', sans-serif; font-size:15px;">${(p.totalPrice || 0).toLocaleString()} 원</td>
                    <td style="text-align:center;">
                      <span class="badge ${isCross ? 'bg-primary' : 'bg-secondary'}" style="padding:5px 10px; border-radius:8px; font-size:11.5px;">
                        <i class="fas ${isCross ? 'fa-stethoscope' : 'fa-clock'} me-1"></i> ${isCross ? (p.crossCheckerName ? `🩺 ${p.crossCheckerName}` : '검수완료') : '검수대기'}
                      </span>
                    </td>
                    <td style="text-align:center;">
                      <button type="button" class="btn btn-sm btn-outline-success font-bold" onclick="ApprovalModule.settleDiscountSingle('${p.id}')" style="border-radius:10px; padding:5px 14px; font-size:12.5px;">
                        <i class="fas fa-coins me-1"></i> 결재 정산 승인
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
  }

  // 📅 3. 월간 근무스케줄 마스터 최종 승인 섹션
  function renderScheduleApprovalSection(currentYear, currentMonth, isApproved, data) {
    const monthKey = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
    const scheduleRecords = (data.schedule || []).filter(r => r.date && r.date.startsWith(monthKey));

    return `
      <div class="card-section mb-5" style="background:#ffffff; border:1.5px solid #cbd5e1; border-radius:20px; padding:24px; box-shadow:0 6px 20px rgba(0,0,0,0.03);">
        <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3 pb-2 border-bottom">
          <div class="d-flex align-items-center gap-2">
            <div style="width:36px; height:36px; border-radius:10px; background:#ffedd5; color:#ea580c; display:flex; align-items:center; justify-content:center; font-size:18px;">
              <i class="fas fa-calendar-check"></i>
            </div>
            <div>
              <h3 style="font-size:18px; font-weight:800; color:#0f172a; margin:0;">
                📅 3. ${currentYear}년 ${currentMonth}월 근무스케줄 마스터 확정 결재
              </h3>
              <span style="font-size:12.5px; color:#64748b;">약사 및 일반직원의 월간 시프트 편성을 검토하고 마스터 근무표로 최종 확정 승인합니다.</span>
            </div>
          </div>

          <span class="badge ${isApproved ? 'bg-success' : 'bg-warning text-dark'}" style="font-size:13px; padding:7px 14px; border-radius:12px; font-weight:700;">
            <i class="fas ${isApproved ? 'fa-check-circle' : 'fa-clock'} me-1"></i> ${isApproved ? '마스터 승인 완료' : '결재 대기 중'}
          </span>
        </div>

        <div class="card p-4 mb-3" style="background:linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%); border:1px solid #bfdbfe; border-radius:16px;">
          <div class="d-flex justify-content-between align-items-center flex-wrap gap-3">
            <div>
              <h4 style="font-size:16px; font-weight:800; color:#1e40af; margin:0 0 4px 0;">
                📋 ${currentMonth}월 총 등록 근무 시프트: <strong style="font-family:'Outfit', sans-serif;">${scheduleRecords.length}건</strong>
              </h4>
              <p style="font-size:13px; color:#475569; margin:0;">
                약국장 최종 승인 시 전체 직원의 모바일 앱에 '확정 근무표'로 공식 공표됩니다.
              </p>
            </div>

            <div class="d-flex align-items-center gap-2 flex-wrap">
              <button type="button" class="btn btn-outline-primary font-bold" onclick="App.switchModule('schedule', true)" style="border-radius:10px; padding:8px 16px; font-size:13.5px;">
                <i class="fas fa-calendar-alt me-1"></i> 근무표 전체 열람 바로가기
              </button>
              ${isApproved ? `
                <button type="button" class="btn btn-outline-danger font-bold" onclick="ApprovalModule.rejectScheduleMaster('${monthKey}')" style="border-radius:10px; padding:8px 16px; font-size:13.5px;">
                  <i class="fas fa-undo me-1"></i> 승인 취소 (재조정 요청)
                </button>
              ` : `
                <button type="button" class="btn btn-success font-bold" onclick="ApprovalModule.approveScheduleMaster('${monthKey}')" style="border-radius:10px; padding:8px 22px; font-size:14px; box-shadow:0 4px 12px rgba(16,185,129,0.3);">
                  <i class="fas fa-check-circle me-1"></i> 🚀 ${currentMonth}월 마스터 근무표 최종 승인
                </button>
              `}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // 📝 4. 일일 업무일지 & 특이사항 결재 섹션
  function renderWorklogApprovalSection(pendingLogs) {
    return `
      <div class="card-section mb-5" style="background:#ffffff; border:1.5px solid #cbd5e1; border-radius:20px; padding:24px; box-shadow:0 6px 20px rgba(0,0,0,0.03);">
        <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3 pb-2 border-bottom">
          <div class="d-flex align-items-center gap-2">
            <div style="width:36px; height:36px; border-radius:10px; background:#dbeafe; color:#2563eb; display:flex; align-items:center; justify-content:center; font-size:18px;">
              <i class="fas fa-clipboard-check"></i>
            </div>
            <div>
              <h3 style="font-size:18px; font-weight:800; color:#0f172a; margin:0;">
                📝 4. 일일 업무일지 & 특이사항 결재 (확인 서명) <span class="badge bg-primary ms-1" style="border-radius:10px;">${pendingLogs.length}건</span>
              </h3>
              <span style="font-size:12.5px; color:#64748b;">약국 품절약, 장비 이상, 인수인계 보고 사항을 확인하고 서명합니다.</span>
            </div>
          </div>

          ${pendingLogs.length > 0 ? `
            <button type="button" class="btn btn-sm btn-primary font-bold" onclick="ApprovalModule.bulkSignWorklogs()" style="border-radius:10px; padding:7px 16px;">
              <i class="fas fa-pen-alt me-1"></i> 전체 확인 서명 완료
            </button>
          ` : ''}
        </div>

        <div class="table-responsive" style="border-radius:12px; border:1px solid #e2e8f0; overflow-x:auto; -webkit-overflow-scrolling:touch;">
          <table class="table align-middle mb-0" style="font-size:13.5px; min-width:720px; white-space:nowrap;">
            <thead style="background:#f8fafc; font-weight:700; color:#475569; border-bottom:2px solid #e2e8f0;">
              <tr>
                <th style="width:110px;">구분 태그</th>
                <th style="width:100px;">작성자</th>
                <th>업무 내용 및 특이사항</th>
                <th style="width:130px; text-align:center;">등록 일시</th>
                <th style="width:130px; text-align:center;">약국장 확인</th>
              </tr>
            </thead>
            <tbody>
              ${pendingLogs.length === 0 ? `
                <tr>
                  <td colspan="5" class="text-center py-5 text-muted" style="background:#f8fafc;">
                    <i class="fas fa-clipboard-check text-primary mb-2" style="font-size:28px;"></i><br>
                    <strong>확인 대기 중인 업무일지가 없습니다.</strong>
                  </td>
                </tr>
              ` : pendingLogs.map(log => `
                <tr style="border-bottom:1px solid #f1f5f9;">
                  <td><span class="badge bg-danger" style="border-radius:6px; font-size:11.5px; padding:4px 8px;">${log.tag || '일반업무'}</span></td>
                  <td><strong style="color:#0f172a;">${log.author || '직원'}</strong></td>
                  <td style="color:#334155; font-weight:600; white-space:normal; min-width:280px;">${log.content || '-'}</td>
                  <td style="text-align:center; font-size:12px; color:#64748b;">${log.date || log.createdAt || '-'}</td>
                  <td style="text-align:center;">
                    <button type="button" class="btn btn-sm btn-outline-primary font-bold" onclick="ApprovalModule.signWorklogSingle('${log.id}')" style="border-radius:8px; padding:5px 12px; font-size:12.5px;">
                      <i class="fas fa-check me-1"></i> 확인 서명
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // 📜 5. 종합 결재 완료 이력 섹션
  function renderHistorySection(processedLeaves, paidPurchases) {
    return `
      <div class="card-section mb-5" style="background:#ffffff; border:1.5px solid #cbd5e1; border-radius:20px; padding:24px; box-shadow:0 6px 20px rgba(0,0,0,0.03);">
        <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3 pb-2 border-bottom">
          <div class="d-flex align-items-center gap-2">
            <div style="width:36px; height:36px; border-radius:10px; background:#f1f5f9; color:#475569; display:flex; align-items:center; justify-content:center; font-size:18px;">
              <i class="fas fa-history"></i>
            </div>
            <div>
              <h3 style="font-size:18px; font-weight:800; color:#0f172a; margin:0;">
                📜 종합 결재 처리 완료 이력 (Audit Trail)
              </h3>
              <span style="font-size:12.5px; color:#64748b;">승인 및 반려 완료된 연차와 정산 완료된 할인구매 이력을 투명하게 보관합니다.</span>
            </div>
          </div>
        </div>

        <div class="table-responsive" style="border-radius:12px; border:1px solid #e2e8f0; overflow-x:auto; -webkit-overflow-scrolling:touch;">
          <table class="table align-middle mb-0" style="font-size:13.5px; min-width:720px; white-space:nowrap;">
            <thead style="background:#f8fafc; font-weight:700; color:#475569; border-bottom:2px solid #e2e8f0;">
              <tr>
                <th style="width:110px;">결재 구분</th>
                <th style="width:120px;">대상 직원</th>
                <th>내용 / 기간 / 금액</th>
                <th style="width:110px; text-align:center;">처리 결과</th>
                <th style="width:140px; text-align:center;">처리 일시</th>
              </tr>
            </thead>
            <tbody>
              ${processedLeaves.map(r => `
                <tr style="border-bottom:1px solid #f1f5f9;">
                  <td><span class="badge bg-info text-dark" style="border-radius:6px; font-size:11.5px;">🌴 연차결재</span></td>
                  <td><strong>${r.empName}</strong></td>
                  <td>${r.type} (${r.daysCount}일) — ${r.startDate} ~ ${r.endDate} (${r.reason || '사유미입력'})</td>
                  <td style="text-align:center;">
                    <span class="badge ${r.status === 'APPROVED' ? 'bg-success' : 'bg-danger'}" style="padding:5px 10px; border-radius:8px;">
                      ${r.status === 'APPROVED' ? '✅ 승인완료' : '❌ 반려됨'}
                    </span>
                  </td>
                  <td style="text-align:center; font-size:12px; color:#64748b;">${r.approvedAt || r.createdAt || '-'}</td>
                </tr>
              `).join('')}

              ${paidPurchases.map(p => `
                <tr style="border-bottom:1px solid #f1f5f9;">
                  <td><span class="badge bg-warning text-dark" style="border-radius:6px; font-size:11.5px;">💊 할인구매</span></td>
                  <td><strong>${p.empName}</strong></td>
                  <td>${p.itemName} — <strong style="color:#15803d; font-family:'Outfit', sans-serif;">${(p.totalPrice || 0).toLocaleString()}원</strong></td>
                  <td style="text-align:center;">
                    <span class="badge bg-success" style="padding:5px 10px; border-radius:8px;">
                      💰 정산완료
                    </span>
                  </td>
                  <td style="text-align:center; font-size:12px; color:#64748b;">${p.dateStr || '-'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ⚡ 4대 결재 통합 일괄 승인 함수
  function approveAllPending() {
    if (!confirm('대기 중인 연차 신청, 할인구매 정산, 근무표, 업무일지 전체를 일괄 승인하시겠습니까?')) {
      return;
    }

    const data = window.SheetsSync.getData();

    // 1. 연차 승인
    (data.leaveRequests || []).forEach(r => {
      if (r.status === 'PENDING') {
        r.status = 'APPROVED';
        r.approvedAt = new Date().toLocaleString('ko-KR');
        const emp = (data.employees || []).find(e => e.id === r.empId);
        if (emp) {
          emp.usedLeave = (emp.usedLeave || 0) + r.daysCount;
        }
      }
    });

    // 2. 할인구매 정산
    (data.discountPurchases || []).forEach(p => {
      p.isPaid = true;
    });

    // 3. 근무스케줄 승인
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    if (!data.scheduleStatus) data.scheduleStatus = {};
    data.scheduleStatus[monthKey] = {
      pharmacistStatus: 'APPROVED',
      staffStatus: 'APPROVED',
      approvedAt: new Date().toLocaleString('ko-KR')
    };

    // 4. 업무일지 서명
    (data.worklogs || []).forEach(l => {
      l.status = 'COMPLETED';
    });

    window.SheetsSync.saveData(window.SheetsSync.STORAGE_KEYS.LEAVE_REQUESTS, data.leaveRequests);
    window.SheetsSync.saveData(window.SheetsSync.STORAGE_KEYS.EMPLOYEES, data.employees);
    window.SheetsSync.saveData(window.SheetsSync.STORAGE_KEYS.DISCOUNT_PURCHASES, data.discountPurchases);
    window.SheetsSync.saveData(window.SheetsSync.STORAGE_KEYS.SCHEDULE_STATUS, data.scheduleStatus);
    window.SheetsSync.saveData(window.SheetsSync.STORAGE_KEYS.WORKLOGS, data.worklogs);

    render('module-content');
    alert('🎉 대기 중인 모든 연차, 할인구매, 스케줄, 업무일지가 1클릭으로 성공적으로 일괄 승인되었습니다!');
  }

  // --- 개별 액션 핸들러들 ---

  function toggleAllLeaveChecks(master) {
    document.querySelectorAll('.leave-chk').forEach(c => c.checked = master.checked);
  }

  function approveLeaveSingle(id) {
    const data = window.SheetsSync.getData();
    const req = (data.leaveRequests || []).find(r => r.id === id);
    if (!req) return;

    if (!confirm(`'${req.empName}' 님의 ${req.type} (${req.daysCount}일) 신청을 승인하시겠습니까?`)) return;

    req.status = 'APPROVED';
    req.approvedAt = new Date().toLocaleString('ko-KR');
    const emp = (data.employees || []).find(e => e.id === req.empId);
    if (emp) emp.usedLeave = (emp.usedLeave || 0) + req.daysCount;

    window.SheetsSync.saveData(window.SheetsSync.STORAGE_KEYS.LEAVE_REQUESTS, data.leaveRequests);
    window.SheetsSync.saveData(window.SheetsSync.STORAGE_KEYS.EMPLOYEES, data.employees);
    render('module-content');
    alert(`'${req.empName}' 님의 연차가 성공적으로 승인되었습니다.`);
  }

  function rejectLeaveSingle(id) {
    const data = window.SheetsSync.getData();
    const req = (data.leaveRequests || []).find(r => r.id === id);
    if (!req) return;

    if (!confirm(`'${req.empName}' 님의 ${req.type} 신청을 반려하시겠습니까?`)) return;

    req.status = 'REJECTED';
    req.approvedAt = new Date().toLocaleString('ko-KR');

    window.SheetsSync.saveData(window.SheetsSync.STORAGE_KEYS.LEAVE_REQUESTS, data.leaveRequests);
    render('module-content');
    alert(`'${req.empName}' 님의 연차가 반려 처리되었습니다.`);
  }

  function bulkApproveLeave() {
    const chks = document.querySelectorAll('.leave-chk:checked');
    if (chks.length === 0) {
      alert('승인할 연차 신청 항목을 선택해 주세요.');
      return;
    }
    const data = window.SheetsSync.getData();
    const ids = Array.from(chks).map(c => c.value);

    ids.forEach(id => {
      const req = (data.leaveRequests || []).find(r => r.id === id);
      if (req && req.status === 'PENDING') {
        req.status = 'APPROVED';
        req.approvedAt = new Date().toLocaleString('ko-KR');
        const emp = (data.employees || []).find(e => e.id === req.empId);
        if (emp) emp.usedLeave = (emp.usedLeave || 0) + req.daysCount;
      }
    });

    window.SheetsSync.saveData(window.SheetsSync.STORAGE_KEYS.LEAVE_REQUESTS, data.leaveRequests);
    window.SheetsSync.saveData(window.SheetsSync.STORAGE_KEYS.EMPLOYEES, data.employees);
    render('module-content');
    alert(`${ids.length}건의 연차가 일괄 승인되었습니다.`);
  }

  function bulkRejectLeave() {
    const chks = document.querySelectorAll('.leave-chk:checked');
    if (chks.length === 0) {
      alert('반려할 연차 신청 항목을 선택해 주세요.');
      return;
    }
    const data = window.SheetsSync.getData();
    const ids = Array.from(chks).map(c => c.value);

    ids.forEach(id => {
      const req = (data.leaveRequests || []).find(r => r.id === id);
      if (req) {
        req.status = 'REJECTED';
        req.approvedAt = new Date().toLocaleString('ko-KR');
      }
    });

    window.SheetsSync.saveData(window.SheetsSync.STORAGE_KEYS.LEAVE_REQUESTS, data.leaveRequests);
    render('module-content');
    alert(`${ids.length}건의 연차가 반려 처리되었습니다.`);
  }

  function settleDiscountSingle(id) {
    if (window.DiscountPurchaseModule && window.DiscountPurchaseModule.quickTogglePaid) {
      window.DiscountPurchaseModule.quickTogglePaid(id);
      render('module-content');
    } else {
      const data = window.SheetsSync.getData();
      const p = (data.discountPurchases || []).find(x => x.id === id);
      if (p) p.isPaid = true;
      window.SheetsSync.saveData(window.SheetsSync.STORAGE_KEYS.DISCOUNT_PURCHASES, data.discountPurchases);
      render('module-content');
    }
  }

  function bulkSettleDiscount() {
    const data = window.SheetsSync.getData();
    (data.discountPurchases || []).forEach(p => p.isPaid = true);
    window.SheetsSync.saveData(window.SheetsSync.STORAGE_KEYS.DISCOUNT_PURCHASES, data.discountPurchases);
    render('module-content');
    alert('할인구매 건이 모두 정산 완료 처리되었습니다.');
  }

  function approveScheduleMaster(monthKey) {
    const data = window.SheetsSync.getData();
    if (!data.scheduleStatus) data.scheduleStatus = {};
    const employees = data.employees || [];
    
    let statusObj = data.scheduleStatus[monthKey] || {};
    statusObj.directorApproved = true;
    statusObj.pharmacistStatus = 'APPROVED';
    statusObj.staffStatus = 'APPROVED';
    statusObj.approvedAt = new Date().toLocaleString('ko-KR');
    employees.forEach(emp => {
      statusObj[emp.id] = 'APPROVED';
    });
    data.scheduleStatus[monthKey] = statusObj;

    window.SheetsSync.saveData(window.SheetsSync.STORAGE_KEYS.SCHEDULE_STATUS, data.scheduleStatus);
    render('module-content');
    alert(`🎉 ${monthKey} 마스터 근무표가 최종 확정 승인되었습니다!`);
  }

  function rejectScheduleMaster(monthKey) {
    const data = window.SheetsSync.getData();
    if (!data.scheduleStatus) data.scheduleStatus = {};
    data.scheduleStatus[monthKey] = {
      pharmacistStatus: 'PENDING',
      staffStatus: 'PENDING'
    };
    window.SheetsSync.saveData(window.SheetsSync.STORAGE_KEYS.SCHEDULE_STATUS, data.scheduleStatus);
    render('module-content');
    alert(`스케줄 승인이 취소되고 재조정 요청 상태로 전환되었습니다.`);
  }

  function signWorklogSingle(id) {
    const data = window.SheetsSync.getData();
    const log = (data.worklogs || []).find(l => l.id === id);
    if (log) {
      log.status = 'COMPLETED';
      window.SheetsSync.saveData(window.SheetsSync.STORAGE_KEYS.WORKLOGS, data.worklogs);
      render('module-content');
      alert('업무일지 확인 서명이 완료되었습니다.');
    }
  }

  function bulkSignWorklogs() {
    const data = window.SheetsSync.getData();
    (data.worklogs || []).forEach(l => l.status = 'COMPLETED');
    window.SheetsSync.saveData(window.SheetsSync.STORAGE_KEYS.WORKLOGS, data.worklogs);
    render('module-content');
    alert('모든 업무일지가 확인 서명 완료되었습니다.');
  }

  return {
    render,
    setSubTab,
    approveAllPending,
    toggleAllLeaveChecks,
    approveLeaveSingle,
    rejectLeaveSingle,
    bulkApproveLeave,
    bulkRejectLeave,
    settleDiscountSingle,
    bulkSettleDiscount,
    approveScheduleMaster,
    rejectScheduleMaster,
    signWorklogSingle,
    bulkSignWorklogs
  };
})();
