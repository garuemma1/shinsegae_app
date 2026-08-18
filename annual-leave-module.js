/**
 * 3. 연차대장 & 직원 관리 모듈 컨트롤러 (Annual Leave Ledger & Employee Management v6.5)
 * [보안/프라이버시 강화] 약국장(전체 8인 대장 & 전체 통계) vs 일반직원(본인 발생/사용/잔여 연차 마이대시보드)
 */
window.AnnualLeaveModule = (function () {

  let currentCalYear = 2026;
  let currentCalMonth = 8;
  let calViewMode = 'grid'; // 'grid': 달력 뷰, 'list': 모바일 리스트 뷰
  let showInlineLeaveForm = false;

  function render(containerId) {
    const container = document.getElementById(containerId || 'module-content');
    if (!container) return;

    const currUser = window.SheetsSync.getCurrentUser();
    const isDirector = currUser && currUser.role === '약국장';

    const data = window.SheetsSync.getData();
    const employees = data.employees || [];
    const leaveRequests = data.leaveRequests || [];

    // 약국장(문성도) 제외 연차 대상 직원 전용 필터링
    const targetEmployees = employees.filter(e => !e.role.includes('약국장') && e.name !== '문성도');

    // 약국장용 전체 대장 집계
    const totalGrantedSum = targetEmployees.reduce((sum, e) => {
      const calc = window.LaborCalculator.calculateStatutoryLeave(e.joinDate);
      return sum + calc.totalGranted;
    }, 0);
    const totalUsedSum = targetEmployees.reduce((sum, e) => sum + (e.usedLeave || 0), 0);
    const pendingRequests = leaveRequests.filter(r => r.status === 'PENDING');
    const myLeaveRequests = currUser ? leaveRequests.filter(r => r.empId === currUser.id) : [];

    // 👤 일반 직원용 본인 연차 개인 집계
    const myEmp = targetEmployees.find(e => e.id === (currUser ? currUser.id : '')) || currUser || targetEmployees[0];
    const myCalc = myEmp && myEmp.joinDate ? window.LaborCalculator.calculateStatutoryLeave(myEmp.joinDate) : { totalGranted: 15, tenureText: '1년차', description: '기본 15일 부여' };
    const myUsed = myEmp ? (myEmp.usedLeave || 0) : 0;
    const myRemaining = Math.max(0, (myCalc.totalGranted || 0) - myUsed);
    const myPendingCount = myLeaveRequests.filter(r => r.status === 'PENDING').length;

    const todayStr = new Date().toISOString().split('T')[0];

    const html = `
      <div class="module-header d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
        <div>
          <h2 style="font-size:24px; font-weight:800; color:#0f172a; margin-bottom:4px; letter-spacing:-0.5px;">
            ${isDirector ? '🌴 신세계약국 법정 연차대장 & 인사승인 Center' : `🌴 ${currUser ? currUser.name : '직원'} 님의 연차 유급휴가 관리 센터`}
          </h2>
          <p class="subtitle" style="color:#64748b; font-size:14px; margin:0;">
            ${isDirector ? '근로기준법 제60조 입사일 기준 전 직원 법정 연차 산정 대장 및 <strong>약국장 원스톱 결재</strong>' : '근로기준법 제60조에 따른 본인 법정 연차 실시간 조회 및 유급휴가 온라인 간편 신청'}
          </p>
        </div>
        <div class="header-actions">
          <button type="button" 
                  class="btn font-bold shadow-sm" 
                  onclick="AnnualLeaveModule.toggleInlineLeaveForm()" 
                  style="border-radius:14px; padding:11px 22px; font-size:15px; background:${showInlineLeaveForm ? '#334155' : 'linear-gradient(135deg, #059669 0%, #047857 100%)'}; color:#ffffff; border:none; box-shadow:0 4px 14px rgba(5,150,105,0.25); transition:all 0.2s;">
            <i class="fas ${showInlineLeaveForm ? 'fa-times' : 'fa-edit'} me-1.5"></i> 🌴 연차유급휴가 신청서 (${showInlineLeaveForm ? '신청서 닫기 ▲' : '신청서 작성 ▼'})
          </button>
        </div>
      </div>

      <!-- 🌴 [단일 통합] 연차유급휴가 신청 인라인 폼 (팝업 중복 제거 및 럭셔리 반응형 핏) -->
      ${showInlineLeaveForm ? `
        <div id="inline-leave-box" class="card mb-4 shadow-sm" style="border-radius:22px; border:2px solid #059669; background:#ffffff; padding:24px 28px; box-shadow:0 10px 30px rgba(5,150,105,0.1);">
          <div class="d-flex justify-content-between align-items-center mb-4 border-bottom pb-3">
            <div class="d-flex align-items-center gap-3">
              <div style="width:42px; height:42px; border-radius:12px; background:#d1fae5; color:#059669; display:flex; align-items:center; justify-content:center; font-size:20px;">
                <i class="fas fa-umbrella-beach"></i>
              </div>
              <div>
                <h3 style="font-size:18px; font-weight:800; color:#065f46; margin:0;">
                  🌴 연차 유급휴가 신청서 작성
                </h3>
                <span style="font-size:12.5px; color:#64748b;">신청 제출 즉시 약국장 결재 대기 목록에 등록되며, 승인 시 연차가 자동 차감됩니다.</span>
              </div>
            </div>
            <button type="button" class="btn btn-sm btn-outline-secondary font-bold" onclick="AnnualLeaveModule.toggleInlineLeaveForm(false)" style="border-radius:10px; padding:6px 14px;">✕ 닫기</button>
          </div>

          <form onsubmit="AnnualLeaveModule.submitLeaveApplication(event)">
            <div class="row g-3 mb-3">
              <!-- 1. 신청 직원 (일반직원은 본인 고정, 약국장만 선택 가능) -->
              <div class="col-md-6">
                <label class="form-label font-bold" style="font-size:13.5px; color:#334155; margin-bottom:6px;">
                  <i class="fas fa-user text-emerald me-1"></i> 신청 직원
                </label>
                ${isDirector ? `
                  <select id="inline-leave-emp-id" class="form-select font-bold" required style="border-radius:12px; padding:12px 16px; border:1.5px solid #cbd5e1; background:#ffffff; font-size:14.5px; color:#0f172a;">
                    ${targetEmployees.map(e => `
                      <option value="${e.id}">${e.name} (${e.role} / ${e.position || '직원'})</option>
                    `).join('')}
                  </select>
                ` : `
                  <input type="hidden" id="inline-leave-emp-id" value="${currUser ? currUser.id : ''}">
                  <input type="text" class="form-control font-bold" value="${currUser ? currUser.name : '직원'} (${currUser ? currUser.role : '직무'} - 본인 신청)" readonly style="border-radius:12px; padding:12px 16px; border:1.5px solid #cbd5e1; background:#f8fafc; font-size:14.5px; color:#0f172a; cursor:not-allowed;">
                `}
              </div>

              <!-- 2. 휴가 구분 -->
              <div class="col-md-6">
                <label class="form-label font-bold" style="font-size:13.5px; color:#334155; margin-bottom:6px;">
                  <i class="fas fa-tag text-emerald me-1"></i> 휴가 구분
                </label>
                <select id="inline-leave-type" class="form-select font-bold" required style="border-radius:12px; padding:12px 16px; border:1.5px solid #cbd5e1; background:#ffffff; font-size:14.5px; color:#0f172a;">
                  <option value="연차" selected>🌴 전일 연차 (1.0일 차감)</option>
                  <option value="오전반차">🌅 오전 반차 (0.5일 차감)</option>
                  <option value="오후반차">🌆 오후 반차 (0.5일 차감)</option>
                </select>
              </div>
            </div>

            <div class="row g-3 mb-3">
              <!-- 3. 시작일자 -->
              <div class="col-md-6">
                <label class="form-label font-bold" style="font-size:13.5px; color:#334155; margin-bottom:6px;">
                  <i class="far fa-calendar-alt text-emerald me-1"></i> 휴가 시작일자
                </label>
                <input type="date" id="inline-leave-start" class="form-control font-bold" value="${todayStr}" required style="border-radius:12px; padding:12px 16px; border:1.5px solid #cbd5e1; background:#ffffff; font-size:14.5px; color:#0f172a;">
              </div>

              <!-- 4. 종료일자 -->
              <div class="col-md-6">
                <label class="form-label font-bold" style="font-size:13.5px; color:#334155; margin-bottom:6px;">
                  <i class="far fa-calendar-check text-emerald me-1"></i> 휴가 종료일자
                </label>
                <input type="date" id="inline-leave-end" class="form-control font-bold" value="${todayStr}" required style="border-radius:12px; padding:12px 16px; border:1.5px solid #cbd5e1; background:#ffffff; font-size:14.5px; color:#0f172a;">
              </div>
            </div>

            <!-- 5. 사유 -->
            <div class="mb-4">
              <label class="form-label font-bold" style="font-size:13.5px; color:#334155; margin-bottom:6px;">
                <i class="fas fa-comment-alt text-emerald me-1"></i> 연차 신청 사유
              </label>
              <textarea id="inline-leave-reason" class="form-control font-bold" rows="2" placeholder="연차 신청 사유를 입력하세요 (예: 여름 정기 휴가, 개인 사정, 병원 진료 등)..." required style="border-radius:12px; padding:12px 16px; border:1.5px solid #cbd5e1; background:#ffffff; font-size:14px; line-height:1.5; color:#0f172a;"></textarea>
            </div>

            <div class="d-flex justify-content-end gap-2">
              <button type="button" class="btn btn-secondary font-bold" onclick="AnnualLeaveModule.toggleInlineLeaveForm(false)" style="border-radius:12px; padding:10px 22px;">✕ 취소</button>
              <button type="submit" class="btn btn-success font-bold" style="border-radius:12px; padding:10px 28px; font-size:15px; background:#059669; box-shadow:0 4px 14px rgba(5,150,105,0.3);"><i class="fas fa-check me-1"></i> 🌴 연차 신청서 제출 완료</button>
            </div>
          </form>
        </div>
      ` : ''}

      <!-- 📊 KPI 요약 카드 (약국장: 전체 통계 / 직원: 본인 연차 통계) -->
      <div class="mb-4" style="display:grid; grid-template-columns:repeat(auto-fit,minmax(135px,1fr)); gap:10px;">
        ${isDirector ? `
          <!-- 👑 약국장 전용 KPI -->
          <div class="kpi-summary-card p-3" style="border-radius:16px; border:1.5px solid #cbd5e1; background:#ffffff; display:flex; flex-direction:column; justify-content:space-between;">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <span style="font-size:12px; font-weight:800; color:#475569;">연차 대상</span>
              <div style="width:24px;height:24px;border-radius:6px;background:#eff6ff;color:#2563eb;display:flex;align-items:center;justify-content:center;font-size:12px;"><i class="fas fa-users"></i></div>
            </div>
            <div style="font-size:20px;font-weight:800;color:#0f172a;font-family:'Outfit',sans-serif;">${targetEmployees.length}<span style="font-size:12px;"> 명</span></div>
            <div style="font-size:10.5px;color:#64748b;">약국장 제외</div>
          </div>
          <div class="kpi-summary-card p-3" style="border-radius:16px; border:1.5px solid #bfdbfe; background:#eff6ff; display:flex; flex-direction:column; justify-content:space-between;">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <span style="font-size:12px; font-weight:800; color:#1e40af;">총 발생 연차</span>
              <div style="width:24px;height:24px;border-radius:6px;background:#dbeafe;color:#1d4ed8;display:flex;align-items:center;justify-content:center;font-size:12px;"><i class="fas fa-calendar-check"></i></div>
            </div>
            <div style="font-size:20px;font-weight:800;color:#1d4ed8;font-family:'Outfit',sans-serif;">${totalGrantedSum}<span style="font-size:12px;"> 일</span></div>
            <div style="font-size:10.5px;color:#2563eb;">전체 직원 합계</div>
          </div>
          <div class="kpi-summary-card p-3" style="border-radius:16px; border:1.5px solid #fca5a5; background:#fff5f5; display:flex; flex-direction:column; justify-content:space-between;">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <span style="font-size:12px; font-weight:800; color:#991b1b;">사용 연차</span>
              <div style="width:24px;height:24px;border-radius:6px;background:#fee2e2;color:#dc2626;display:flex;align-items:center;justify-content:center;font-size:12px;"><i class="fas fa-umbrella-beach"></i></div>
            </div>
            <div style="font-size:20px;font-weight:800;color:#b91c1c;font-family:'Outfit',sans-serif;">${totalUsedSum}<span style="font-size:12px;"> 일</span></div>
            <div style="font-size:10.5px;color:#ef4444;">누적 사용 합계</div>
          </div>
          <div class="kpi-summary-card p-3" style="border-radius:16px; border:1.5px solid #fde68a; background:#fffbeb; display:flex; flex-direction:column; justify-content:space-between;">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <span style="font-size:12px; font-weight:800; color:#92400e;">결재 대기</span>
              <div style="width:24px;height:24px;border-radius:6px;background:#fef3c7;color:#d97706;display:flex;align-items:center;justify-content:center;font-size:12px;"><i class="fas fa-clock"></i></div>
            </div>
            <div style="font-size:20px;font-weight:800;color:#d97706;font-family:'Outfit',sans-serif;">${pendingRequests.length}<span style="font-size:12px;"> 건</span></div>
            <div style="font-size:10.5px;color:#b45309;">승인 대기 중</div>
          </div>
        ` : `
          <!-- 👤 일반 직원 본인 전용 KPI (발생, 사용, 잔여, 대기) -->
          <div class="kpi-summary-card p-3" style="border-radius:16px; border:1.5px solid #bfdbfe; background:#eff6ff; display:flex; flex-direction:column; justify-content:space-between;">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <span style="font-size:12px; font-weight:800; color:#1e40af;">🌴 내 발생 연차</span>
              <div style="width:24px;height:24px;border-radius:6px;background:#dbeafe;color:#1d4ed8;display:flex;align-items:center;justify-content:center;font-size:12px;"><i class="fas fa-calendar-check"></i></div>
            </div>
            <div style="font-size:22px;font-weight:800;color:#1d4ed8;font-family:'Outfit',sans-serif;">${myCalc.totalGranted}<span style="font-size:12px;"> 일</span></div>
            <div style="font-size:10.5px;color:#2563eb;">근속 ${myCalc.tenureText} 기준</div>
          </div>

          <div class="kpi-summary-card p-3" style="border-radius:16px; border:1.5px solid #fca5a5; background:#fff5f5; display:flex; flex-direction:column; justify-content:space-between;">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <span style="font-size:12px; font-weight:800; color:#991b1b;">🏖️ 내 사용 연차</span>
              <div style="width:24px;height:24px;border-radius:6px;background:#fee2e2;color:#dc2626;display:flex;align-items:center;justify-content:center;font-size:12px;"><i class="fas fa-umbrella-beach"></i></div>
            </div>
            <div style="font-size:22px;font-weight:800;color:#b91c1c;font-family:'Outfit',sans-serif;">${myUsed}<span style="font-size:12px;"> 일</span></div>
            <div style="font-size:10.5px;color:#ef4444;">승인 완료 합계</div>
          </div>

          <div class="kpi-summary-card p-3" style="border-radius:16px; border:1.5px solid #bbf7d0; background:#f0fdf4; display:flex; flex-direction:column; justify-content:space-between;">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <span style="font-size:12px; font-weight:800; color:#15803d;">✨ 내 잔여 연차</span>
              <div style="width:24px;height:24px;border-radius:6px;background:#dcfce7;color:#16a34a;display:flex;align-items:center;justify-content:center;font-size:12px;"><i class="fas fa-star"></i></div>
            </div>
            <div style="font-size:22px;font-weight:800;color:#15803d;font-family:'Outfit',sans-serif;">${myRemaining}<span style="font-size:12px;"> 일</span></div>
            <div style="font-size:10.5px;color:#059669;">${myRemaining > 0 ? '사용 가능' : '소진 완료'}</div>
          </div>

          <div class="kpi-summary-card p-3" style="border-radius:16px; border:1.5px solid #fde68a; background:#fffbeb; display:flex; flex-direction:column; justify-content:space-between;">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <span style="font-size:12px; font-weight:800; color:#92400e;">⏳ 내 결재 대기</span>
              <div style="width:24px;height:24px;border-radius:6px;background:#fef3c7;color:#d97706;display:flex;align-items:center;justify-content:center;font-size:12px;"><i class="fas fa-clock"></i></div>
            </div>
            <div style="font-size:22px;font-weight:800;color:#d97706;font-family:'Outfit',sans-serif;">${myPendingCount}<span style="font-size:12px;"> 건</span></div>
            <div style="font-size:10.5px;color:#b45309;">약국장 승인 대기</div>
          </div>
        `}
      </div>

      <!-- 👑 약국장 접속 시: 결재 대기 연차 목록 원스톱 승인/반려 섹션 -->
      ${isDirector ? `
        <div class="card mb-5 shadow-sm" style="border-radius:20px; border:2px solid #f59e0b; background:#fffdf5; overflow:hidden; box-shadow:0 8px 24px rgba(245,158,11,0.12);">
          <div class="card-header d-flex justify-content-between align-items-center flex-wrap gap-2" style="background:linear-gradient(135deg, #78350f 0%, #b45309 100%); color:#ffffff; padding:16px 22px;">
            <div class="d-flex align-items-center gap-2">
              <div style="width:36px; height:36px; border-radius:10px; background:rgba(255,255,255,0.2); display:flex; align-items:center; justify-content:center; font-size:18px;">
                <i class="fas fa-user-shield text-warning"></i>
              </div>
              <div>
                <h3 style="font-size:17px; font-weight:800; margin:0; color:#ffffff;">
                  👑 약국장 전용: 결재 대기 연차 신청 목록 (${pendingRequests.length}건)
                </h3>
              </div>
            </div>
            
            ${pendingRequests.length > 0 ? `
              <div class="d-flex align-items-center gap-2 flex-wrap ms-auto">
                <label class="text-white font-bold d-flex align-items-center gap-1" style="font-size:13px; cursor:pointer;">
                  <input type="checkbox" id="leave-select-all-pending" onchange="AnnualLeaveModule.toggleSelectAll(this)" style="width:16px; height:16px;">
                  <span>전체 선택 (<span id="leave-selected-count">0</span>건)</span>
                </label>
                <button type="button" class="btn btn-sm btn-success font-bold" onclick="AnnualLeaveModule.bulkApprove()" style="border-radius:8px; padding:6px 14px; font-size:13px; box-shadow:0 2px 8px rgba(16,185,129,0.3);">
                  <i class="fas fa-check-double me-1"></i> 선택 일괄 승인
                </button>
                <button type="button" class="btn btn-sm btn-danger font-bold" onclick="AnnualLeaveModule.bulkDelete()" style="border-radius:8px; padding:6px 14px; font-size:13px;">
                  <i class="fas fa-trash-alt me-1"></i> 선택 반려/삭제
                </button>
              </div>
            ` : ''}
          </div>

          <div class="card-body p-0">
            ${pendingRequests.length === 0 ? `
              <div class="p-4 text-center text-muted" style="font-size:14px; background:#ffffff;">
                <i class="fas fa-check-circle text-success mb-2" style="font-size:28px;"></i><br>
                <strong style="color:#0f172a;">현재 결재 대기 중인 직원의 연차 신청 건이 없습니다.</strong><br>
                <span style="font-size:12.5px; color:#64748b;">모든 신청이 승인 완료되어 정상 근무 및 휴가 스케줄에 반영되었습니다.</span>
              </div>
            ` : `
              <div class="table-responsive">
                <table class="table table-hover align-middle mb-0" style="font-size:13.5px; min-width:760px;">
                  <thead style="background:#f8fafc; color:#475569; font-weight:700; border-bottom:1.5px solid #e2e8f0;">
                    <tr>
                      <th style="width:50px; text-align:center;">선택</th>
                      <th style="width:140px;">신청 직원</th>
                      <th style="width:100px; text-align:center;">구분</th>
                      <th style="width:180px; text-align:center;">신청 기간</th>
                      <th style="width:90px; text-align:center;">차감 일수</th>
                      <th>신청 사유</th>
                      <th style="width:130px; text-align:center;">신청 일시</th>
                      <th style="width:140px; text-align:center;">원터치 결재</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${pendingRequests.map(req => `
                      <tr style="background:#ffffff; border-bottom:1px solid #f1f5f9;">
                        <td style="text-align:center;">
                          <input type="checkbox" class="leave-pending-chk" value="${req.id}" onchange="AnnualLeaveModule.updateSelectedCount()" style="width:16px; height:16px;">
                        </td>
                        <td>
                          <strong style="font-size:15px; color:#0f172a;">${req.empName}</strong>
                          <span class="badge ${req.role.includes('약사') ? 'bg-primary' : 'bg-secondary'} ms-1" style="font-size:11px; padding:3px 6px; border-radius:6px;">${req.role}</span>
                        </td>
                        <td style="text-align:center;">
                          <span class="badge" style="background:#dbeafe; color:#1e40af; border:1px solid #bfdbfe; font-size:12px; padding:4px 8px; border-radius:6px; font-weight:700;">${req.type}</span>
                        </td>
                        <td style="text-align:center; font-family:'Outfit',sans-serif; font-weight:700; color:#1e293b;">
                          ${req.startDate} ~ ${req.endDate}
                        </td>
                        <td style="text-align:center;">
                          <strong style="color:#059669; font-size:15px; font-family:'Outfit',sans-serif;">${req.daysCount}일</strong>
                        </td>
                        <td style="color:#334155; font-weight:500;">
                          ${req.reason}
                        </td>
                        <td style="text-align:center; font-size:12px; color:#64748b; font-family:'Outfit',sans-serif;">
                          ${req.createdAt || '-'}
                        </td>
                        <td style="text-align:center;">
                          <div class="d-flex align-items-center justify-content-center gap-1">
                            <button type="button" class="btn btn-sm btn-success font-bold" onclick="AnnualLeaveModule.approveLeaveRequest('${req.id}')" style="border-radius:8px; padding:5px 10px; font-size:12px; box-shadow:0 2px 6px rgba(16,185,129,0.3);">
                              <i class="fas fa-check"></i> 승인
                            </button>
                            <button type="button" class="btn btn-sm btn-danger font-bold" onclick="AnnualLeaveModule.rejectLeaveRequest('${req.id}')" style="border-radius:8px; padding:5px 10px; font-size:12px;">
                              <i class="fas fa-times"></i> 반려
                            </button>
                          </div>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            `}
          </div>
        </div>
      ` : `
        <!-- 👤 직원 접속 시: 본인 연차 신청 및 결재 진행 현황 카드 -->
        <div class="card mb-5 shadow-sm" style="border-radius:18px; border:1.5px solid #cbd5e1; background:#ffffff; overflow:hidden;">
          <div class="card-header d-flex justify-content-between align-items-center" style="background:#f8fafc; padding:14px 20px; border-bottom:1.5px solid #e2e8f0;">
            <h4 style="font-size:15px; font-weight:800; color:#0f172a; margin:0;">
              <i class="fas fa-user-clock text-primary me-2"></i> ${currUser ? currUser.name : '본인'} 님의 연차 유급휴가 신청 및 처리 내역
            </h4>
          </div>
          <div class="table-responsive">
            <table class="table table-hover align-middle mb-0" style="font-size:13.5px;">
              <thead style="background:#ffffff; color:#64748b; font-weight:700; border-bottom:1px solid #e2e8f0;">
                <tr>
                  <th style="padding:12px 16px;">신청 구분</th>
                  <th style="padding:12px 16px; text-align:center;">신청 기간</th>
                  <th style="padding:12px 16px; text-align:center;">차감 일수</th>
                  <th style="padding:12px 16px;">신청 사유</th>
                  <th style="padding:12px 16px; text-align:center;">결재 상태</th>
                  <th style="padding:12px 16px; text-align:center;">신청 일시</th>
                </tr>
              </thead>
              <tbody>
                ${myLeaveRequests.length === 0 ? `
                  <tr>
                    <td colspan="6" class="text-center py-4 text-muted" style="font-size:13.5px;">
                      <i class="fas fa-info-circle me-1"></i>아직 신청하신 연차 유급휴가 내역이 없습니다. 상단 <strong>[🌴 연차유급휴가 신청서 작성]</strong> 버튼을 눌러 신청해 보세요!
                    </td>
                  </tr>
                ` : myLeaveRequests.map(r => `
                  <tr>
                    <td style="padding:12px 16px;"><strong>${r.type}</strong></td>
                    <td style="padding:12px 16px; text-align:center; font-family:'Outfit',sans-serif; font-weight:700;">${r.startDate} ~ ${r.endDate}</td>
                    <td style="padding:12px 16px; text-align:center; font-weight:700; color:#059669; font-family:'Outfit',sans-serif;">${r.daysCount}일</td>
                    <td style="padding:12px 16px; color:#334155;">${r.reason}</td>
                    <td style="padding:12px 16px; text-align:center;">
                      ${r.status === 'APPROVED' ? '<span class="badge bg-success" style="padding:5px 10px; border-radius:12px;"><i class="fas fa-check me-1"></i>승인 완료</span>' : (r.status === 'REJECTED' ? '<span class="badge bg-danger" style="padding:5px 10px; border-radius:12px;"><i class="fas fa-times me-1"></i>반려됨</span>' : '<span class="badge bg-warning text-dark" style="padding:5px 10px; border-radius:12px;"><i class="fas fa-clock me-1"></i>약국장 결재 대기</span>')}
                    </td>
                    <td style="padding:12px 16px; text-align:center; font-size:12px; color:#64748b; font-family:'Outfit',sans-serif;">
                      ${r.createdAt || '-'}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `}

      <!-- 근로기준법 제60조 주요 규정 안내 럭셔리 카드 -->
      <div class="labor-law-banner mb-5" style="border-radius:16px;">
        <div class="law-icon"><i class="fas fa-balance-scale"></i></div>
        <div class="law-text">
          <strong>⚖️ 근로기준법 제60조(연차 유급휴가) 법정 산정 기준 요약 (근무약사 & 일반직원 대상)</strong>
          <ul>
            <li><strong>1년 미만 근로자:</strong> 1개월 개근 시 1일 유급휴가 발생 (입사 후 1년간 최대 11일)</li>
            <li><strong>1년 이상 근로자:</strong> 1년간 80% 이상 출근 시 15일 기본 유급휴가 부여</li>
            <li><strong>2년 이상 근속자:</strong> 3년차부터 매 2년마다 1일 추가 가산 (15일 + Math.floor((근속년 - 1) / 2), 최대 25일 한도)</li>
          </ul>
        </div>
      </div>

      <!-- 👑 약국장에게만 통계 차트 및 전체 산정 대장 노출 -->
      ${isDirector ? `
        <!-- 📊 Chart.js: 직원별 잔여연차 Bar + 사용/잔여 비율 Donut -->
        <div class="row g-3 mb-4">
          <div class="col-md-7">
            <div class="card shadow-sm" style="border-radius:16px; border:1.5px solid #cbd5e1; overflow:hidden;">
              <div class="card-header d-flex justify-content-between align-items-center" style="background:#f8fafc; border-bottom:1.5px solid #e2e8f0; padding:12px 18px;">
                <h4 style="font-size:14px; font-weight:800; color:#0f172a; margin:0;"><i class="fas fa-chart-bar text-success me-2"></i>🌴 전 직원 잔여 연차일수 비교</h4>
              </div>
              <div style="position:relative; height:200px; width:100%; padding:12px;">
                <canvas id="leaveBarCanvas"></canvas>
              </div>
            </div>
          </div>
          <div class="col-md-5">
            <div class="card shadow-sm" style="border-radius:16px; border:1.5px solid #cbd5e1; overflow:hidden;">
              <div class="card-header d-flex justify-content-between align-items-center" style="background:#f8fafc; border-bottom:1.5px solid #e2e8f0; padding:12px 18px;">
                <h4 style="font-size:14px; font-weight:800; color:#0f172a; margin:0;"><i class="fas fa-chart-pie text-warning me-2"></i>🍩 약국 연차 사용/잔여 비율</h4>
              </div>
              <div style="position:relative; height:200px; width:100%; padding:12px;">
                <canvas id="leaveDonutCanvas"></canvas>
              </div>
            </div>
          </div>
        </div>

        <!-- 1. 신세계약국 직원별 연차 유급휴가 산정 대장 -->
        <div class="card-section mb-6" style="background:#ffffff; border:1.5px solid #cbd5e1; border-radius:20px; padding:24px; box-shadow:0 4px 18px rgba(15,23,42,0.03);">
          <div class="section-title-bar mb-4 pb-3 border-bottom d-flex justify-content-between align-items-center flex-wrap gap-2">
            <div>
              <h3 style="font-size:18px; font-weight:800; color:#0f172a; margin:0;"><i class="fas fa-list-alt text-primary me-2"></i>신세계약국 직원별 연차 유급휴가 산정 대장</h3>
              <span class="text-muted" style="font-size:13px;">📜 근로기준법 제60조 및 취업규칙 제13조 전 직원 연차 관리 대장</span>
            </div>
          </div>
          <div class="table-responsive" style="border-radius:12px; overflow-x:auto; border:1px solid #e2e8f0;">
            <table class="data-table align-middle mb-0" style="font-size:13.5px; min-width:820px;">
              <thead>
                <tr style="background:#f8fafc; font-weight:700; color:#334155;">
                  <th style="padding:12px 16px;">성명</th>
                  <th style="padding:12px 14px;">구분 / 직무</th>
                  <th style="padding:12px 14px;">상세 직책</th>
                  <th style="padding:12px 14px; text-align:center;">입사 일자</th>
                  <th style="padding:12px 14px; text-align:center;">근속 연수</th>
                  <th style="width: 110px; text-align: center; padding:12px 14px;">총 법정 연차</th>
                  <th style="width: 100px; text-align: center; padding:12px 14px;">사용 연차</th>
                  <th style="width: 100px; text-align: center; padding:12px 14px;">잔여 연차</th>
                  <th style="padding:12px 16px;">비고 및 법정 산정 기준</th>
                </tr>
              </thead>
              <tbody>
                ${targetEmployees.map(emp => {
                  const calc = window.LaborCalculator.calculateStatutoryLeave(emp.joinDate);
                  const used = emp.usedLeave || 0;
                  const remaining = calc.totalGranted - used;

                  return `
                    <tr style="border-bottom:1px solid #f1f5f9;">
                      <td style="padding:12px 16px;"><strong>${emp.name}</strong></td>
                      <td style="padding:12px 14px;">
                        <span class="badge ${emp.role.includes('약사') ? 'badge-pharmacist' : 'badge-staff'}">
                          ${emp.role}
                        </span>
                      </td>
                      <td style="padding:12px 14px;">${emp.position || '직원'}</td>
                      <td style="padding:12px 14px; text-align:center; font-family:'Outfit',sans-serif;">${emp.joinDate}</td>
                      <td style="padding:12px 14px; text-align:center;"><strong>${calc.tenureText}</strong></td>
                      <td class="text-center font-bold text-primary" style="padding:12px 14px; font-family:'Outfit',sans-serif;">${calc.totalGranted} 일</td>
                      <td class="text-center font-bold text-muted" style="padding:12px 14px; font-family:'Outfit',sans-serif;">${used} 일</td>
                      <td class="text-center font-bold ${remaining > 0 ? 'text-success' : 'text-danger'}" style="padding:12px 14px; font-size:16px; font-family:'Outfit',sans-serif;">
                        ${remaining} 일
                      </td>
                      <td style="padding:12px 16px;"><small class="text-muted">${calc.description}</small></td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      ` : `
        <!-- 👤 일반 직원 전용: 본인 법정 연차 상세 산정 카드 -->
        <div class="card-section mb-6" style="background:#ffffff; border:1.5px solid #cbd5e1; border-radius:20px; padding:24px; box-shadow:0 4px 18px rgba(15,23,42,0.03);">
          <div class="section-title-bar mb-4 pb-3 border-bottom d-flex justify-content-between align-items-center flex-wrap gap-2">
            <div>
              <h3 style="font-size:18px; font-weight:800; color:#0f172a; margin:0;"><i class="fas fa-id-card text-primary me-2"></i>${currUser ? currUser.name : '본인'} 님의 법정 연차 상세 산정 내역</h3>
              <span class="text-muted" style="font-size:13px;">📜 근로기준법 제60조에 따라 자동 계산된 본인 연차 내역입니다.</span>
            </div>
          </div>
          <div class="table-responsive" style="border-radius:12px; border:1px solid #e2e8f0;">
            <table class="table align-middle mb-0" style="font-size:14px;">
              <thead style="background:#f8fafc; font-weight:700; color:#334155;">
                <tr>
                  <th style="padding:12px 16px;">성명</th>
                  <th style="padding:12px 14px;">직무/직책</th>
                  <th style="padding:12px 14px; text-align:center;">입사 일자</th>
                  <th style="padding:12px 14px; text-align:center;">근속 연수</th>
                  <th style="width: 110px; text-align: center; padding:12px 14px;">발생 연차</th>
                  <th style="width: 100px; text-align: center; padding:12px 14px;">사용 연차</th>
                  <th style="width: 100px; text-align: center; padding:12px 14px;">잔여 연차</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style="padding:14px 16px;"><strong>${myEmp ? myEmp.name : (currUser ? currUser.name : '')}</strong></td>
                  <td style="padding:14px 14px;"><span class="badge ${(myEmp && myEmp.role.includes('약사')) ? 'badge-pharmacist' : 'badge-staff'}">${myEmp ? myEmp.role : ''} (${myEmp ? (myEmp.position || '직원') : ''})</span></td>
                  <td style="padding:14px 14px; text-align:center; font-family:'Outfit',sans-serif;">${myEmp ? myEmp.joinDate : '-'}</td>
                  <td style="padding:14px 14px; text-align:center;"><strong>${myCalc.tenureText}</strong></td>
                  <td class="text-center font-bold text-primary" style="padding:14px 14px; font-size:16px; font-family:'Outfit',sans-serif;">${myCalc.totalGranted} 일</td>
                  <td class="text-center font-bold text-muted" style="padding:14px 14px; font-size:16px; font-family:'Outfit',sans-serif;">${myUsed} 일</td>
                  <td class="text-center font-bold ${myRemaining > 0 ? 'text-success' : 'text-danger'}" style="padding:14px 14px; font-size:18px; font-family:'Outfit',sans-serif;">
                    ${myRemaining} 일
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      `}

      <!-- 2. 📅 월간 연차신청 달력 현황 (7열 독립 반응형 그리드 탑재) -->
      <div class="card-section mb-5" style="background:#ffffff; border:1.5px solid #cbd5e1; border-radius:20px; padding:24px; box-shadow:0 4px 18px rgba(15,23,42,0.03);">
        <div class="section-title-bar flex-between flex-wrap gap-2 mb-4 pb-3 border-bottom">
          <div>
            <h3 style="font-size:18px; font-weight:800; color:#0f172a; margin:0;"><i class="far fa-calendar-alt text-warning me-2"></i>월간 연차신청 달력 현황 (${currentCalYear}년 ${currentCalMonth}월)</h3>
            <span class="text-muted" style="font-size:13px;">📅 승인 확정 연차 및 결재 대기 중인 전 직원 휴가 일정</span>
          </div>

          <div class="d-flex align-items-center gap-3 flex-wrap">
            <!-- 1. 토글 스위치 (달력/목록) -->
            <div style="background:#f1f5f9; padding:4px; border-radius:12px; display:inline-flex; border:1px solid #e2e8f0;">
              <button type="button" onclick="AnnualLeaveModule.setCalViewMode('grid')" style="border:none; background:${calViewMode === 'grid' ? '#ffffff' : 'transparent'}; color:${calViewMode === 'grid' ? '#0f172a' : '#64748b'}; box-shadow:${calViewMode === 'grid' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none'}; border-radius:8px; padding:6px 16px; font-size:13px; font-weight:800; transition:all 0.2s;">
                <i class="fas fa-th me-1"></i> 달력
              </button>
              <button type="button" onclick="AnnualLeaveModule.setCalViewMode('list')" style="border:none; background:${calViewMode === 'list' ? '#ffffff' : 'transparent'}; color:${calViewMode === 'list' ? '#0f172a' : '#64748b'}; box-shadow:${calViewMode === 'list' ? '0 2px 6px rgba(0,0,0,0.06)' : 'none'}; border-radius:8px; padding:6px 16px; font-size:13px; font-weight:800; transition:all 0.2s;">
                <i class="fas fa-list me-1"></i> 목록
              </button>
            </div>

            <!-- 2. 일체형 월 네비게이션 -->
            <div style="display:inline-flex; align-items:center; background:#ffffff; border:1.5px solid #cbd5e1; border-radius:12px; overflow:hidden; box-shadow:0 2px 8px rgba(0,0,0,0.03);">
              <button type="button" onclick="AnnualLeaveModule.changeCalMonth(-1)" style="border:none; background:transparent; color:#475569; padding:8px 16px; cursor:pointer; transition:background 0.2s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                <i class="fas fa-chevron-left"></i>
              </button>
              <span style="font-size:15px; font-weight:800; color:#0f172a; padding:0 12px; min-width:100px; text-align:center; font-family:'Outfit', sans-serif;">
                ${currentCalYear}년 ${currentCalMonth}월
              </span>
              <button type="button" onclick="AnnualLeaveModule.changeCalMonth(1)" style="border:none; background:transparent; color:#475569; padding:8px 16px; cursor:pointer; transition:background 0.2s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                <i class="fas fa-chevron-right"></i>
              </button>
            </div>
          </div>
        </div>

        <div id="annual-leave-calendar-container" class="mt-4">
          ${calViewMode === 'grid' ? renderCalendarGrid(leaveRequests) : renderCalendarList(leaveRequests)}
        </div>
      </div>
    `;

    container.innerHTML = html;

    if (isDirector) {
      setTimeout(() => {
        initLeaveCharts(targetEmployees);
      }, 50);
    }
  }

  // 👑 약국장 연차 단건 승인 함수
  function approveLeaveRequest(reqId) {
    const currUser = window.SheetsSync.getCurrentUser();
    if (!currUser || currUser.role !== '약국장') {
      alert('🔒 [보안 권한 통제] 연차 결재 승인은 약국장 계정으로만 가능합니다.');
      return;
    }

    const data = window.SheetsSync.getData();
    const leaveRequests = data.leaveRequests || [];
    const req = leaveRequests.find(r => r.id === reqId);
    if (!req) return;

    if (!confirm(`'${req.empName}' 님의 ${req.type} (${req.daysCount}일: ${req.startDate} ~ ${req.endDate}) 신청을 최종 승인하시겠습니까?`)) {
      return;
    }

    req.status = 'APPROVED';
    req.approvedAt = new Date().toLocaleString('ko-KR');

    const employees = data.employees || [];
    const emp = employees.find(e => e.id === req.empId);
    if (emp) {
      emp.usedLeave = (emp.usedLeave || 0) + req.daysCount;
      window.SheetsSync.saveEmployees(employees);
    }

    window.SheetsSync.saveLeaveRequests(leaveRequests);
    render('module-content');
    alert(`🎉 '${req.empName}' 님의 ${req.type} 신청이 성공적으로 승인 완료되었습니다!\n(직원 연차 대장에 자동 차감 반영되었습니다)`);
  }

  // 👑 약국장 연차 단건 반려 함수
  function rejectLeaveRequest(reqId) {
    const currUser = window.SheetsSync.getCurrentUser();
    if (!currUser || currUser.role !== '약국장') {
      alert('🔒 [보안 권한 통제] 연차 반려 처리는 약국장 계정으로만 가능합니다.');
      return;
    }

    const data = window.SheetsSync.getData();
    const leaveRequests = data.leaveRequests || [];
    const req = leaveRequests.find(r => r.id === reqId);
    if (!req) return;

    const reason = prompt(`'${req.empName}' 님의 연차 신청을 반려하시겠습니까?\n직원에게 전달할 반려 사유를 입력해 주세요:`, '약국 운영 일정상 해당일자 인원 부족');
    if (reason === null) return;

    req.status = 'REJECTED';
    req.rejectReason = reason;
    req.approvedAt = new Date().toLocaleString('ko-KR');

    window.SheetsSync.saveLeaveRequests(leaveRequests);
    render('module-content');
    alert(`'${req.empName}' 님의 연차 신청이 반려 처리되었습니다.`);
  }

  // 👑 약국장 연차 선택 일괄 승인
  function bulkApprove() {
    const currUser = window.SheetsSync.getCurrentUser();
    if (!currUser || currUser.role !== '약국장') {
      alert('🔒 [보안 권한 통제] 약국장 계정으로만 가능합니다.');
      return;
    }

    const chks = document.querySelectorAll('.leave-pending-chk:checked');
    if (chks.length === 0) {
      alert('일괄 승인할 연차 신청 항목을 체크박스로 선택해 주세요.');
      return;
    }

    if (!confirm(`선택하신 ${chks.length}건의 연차 신청을 일괄 최종 승인하시겠습니까?`)) {
      return;
    }

    const data = window.SheetsSync.getData();
    const leaveRequests = data.leaveRequests || [];
    const employees = data.employees || [];
    const idsToApprove = Array.from(chks).map(c => c.value);

    idsToApprove.forEach(id => {
      const req = leaveRequests.find(r => r.id === id);
      if (req && req.status === 'PENDING') {
        req.status = 'APPROVED';
        req.approvedAt = new Date().toLocaleString('ko-KR');
        const emp = employees.find(e => e.id === req.empId);
        if (emp) {
          emp.usedLeave = (emp.usedLeave || 0) + req.daysCount;
        }
      }
    });

    window.SheetsSync.saveEmployees(employees);
    window.SheetsSync.saveLeaveRequests(leaveRequests);
    render('module-content');
    alert(`🎉 선택하신 ${chks.length}건의 연차가 한 번에 일괄 승인 완료되었습니다!`);
  }

  // 👑 약국장 연차 선택 일괄 삭제/반려
  function bulkDelete() {
    const currUser = window.SheetsSync.getCurrentUser();
    if (!currUser || currUser.role !== '약국장') {
      alert('🔒 [보안 권한 통제] 약국장 계정으로만 가능합니다.');
      return;
    }

    const chks = document.querySelectorAll('.leave-pending-chk:checked');
    if (chks.length === 0) {
      alert('일괄 삭제/반려할 연차 신청 항목을 체크박스로 선택해 주세요.');
      return;
    }

    if (!confirm(`선택하신 ${chks.length}건의 연차 신청 내역을 삭제/반려하시겠습니까?`)) {
      return;
    }

    const data = window.SheetsSync.getData();
    let leaveRequests = data.leaveRequests || [];
    const idsToDelete = Array.from(chks).map(c => c.value);

    leaveRequests = leaveRequests.filter(r => !idsToDelete.includes(r.id));
    window.SheetsSync.saveLeaveRequests(leaveRequests);
    render('module-content');
    alert(`선택하신 ${idsToDelete.length}건의 연차 신청 항목이 삭제/반려되었습니다.`);
  }

  function updateSelectedCount() {
    const chks = document.querySelectorAll('.leave-pending-chk:checked');
    const el = document.getElementById('leave-selected-count');
    if (el) el.textContent = chks.length;
  }

  function toggleSelectAll(masterChk) {
    const chks = document.querySelectorAll('.leave-pending-chk');
    chks.forEach(c => c.checked = masterChk.checked);
    updateSelectedCount();
  }

  function toggleInlineLeaveForm(forceState) {
    const currUser = window.SheetsSync.getCurrentUser();
    if (!currUser) {
      alert('⚠️ 연차 신청을 위해 먼저 로그인해 주세요.');
      if (window.App && typeof window.App.showLoginModal === 'function') {
        window.App.showLoginModal();
      }
      return;
    }

    if (forceState !== undefined) {
      showInlineLeaveForm = forceState;
    } else {
      showInlineLeaveForm = !showInlineLeaveForm;
    }
    render('module-content');
    if (showInlineLeaveForm) {
      setTimeout(() => {
        const box = document.getElementById('inline-leave-box');
        if (box && typeof box.scrollIntoView === 'function') {
          box.scrollIntoView({ behavior: 'smooth' });
        }
      }, 50);
    }
  }

  function submitLeaveApplication(e) {
    if (e) e.preventDefault();

    const currUser = window.SheetsSync.getCurrentUser();
    if (!currUser) {
      alert('⚠️ 연차 신청을 위해 먼저 로그인해 주세요.');
      if (window.App && typeof window.App.showLoginModal === 'function') {
        window.App.showLoginModal();
      }
      return;
    }

    const empIdInput = document.getElementById('inline-leave-emp-id');
    const empId = empIdInput ? empIdInput.value.trim() : '';
    const type = (document.getElementById('inline-leave-type') || {}).value || '연차';
    const startDate = (document.getElementById('inline-leave-start') || {}).value || '';
    const endDate = (document.getElementById('inline-leave-end') || {}).value || '';
    const reason = (document.getElementById('inline-leave-reason') || {}).value || '';

    if (!startDate || !endDate || !reason.trim()) {
      alert('⚠️ 시작일자, 종료일자, 신청 사유는 필수 입력 사항입니다.');
      return;
    }

    const emps = window.SheetsSync.getEmployees() || [];
    const target = emps.find(emp => emp.id === empId) || window.SheetsSync.getCurrentUser();

    const diffTime = new Date(endDate).getTime() - new Date(startDate).getTime();
    const diffDays = Math.round(diffTime / (1000 * 3600 * 24)) + 1;
    const daysCount = type.includes('반차') ? 0.5 : (diffDays > 0 ? diffDays : 1.0);

    const data = window.SheetsSync.getData();
    const leaveRequests = data.leaveRequests || [];

    const newReq = {
      id: 'l_' + Date.now(),
      empId: target ? target.id : 'emp_unknown',
      empName: target ? target.name : '직원',
      role: target ? target.role : '일반직원',
      startDate: startDate,
      endDate: endDate,
      daysCount: daysCount,
      type: type,
      reason: reason.trim(),
      status: 'PENDING',
      createdAt: new Date().toISOString().replace('T', ' ').slice(0, 16)
    };

    leaveRequests.push(newReq);
    window.SheetsSync.saveLeaveRequests(leaveRequests);

    showInlineLeaveForm = false;

    alert(`🎉 [${target ? target.name : '직원'}] 님의 ${type} 유급휴가 신청서(${startDate} ~ ${endDate}, ${daysCount}일)가 정상적으로 제출되었습니다!\n(약국장 승인 후 연차 대장에 자동 차감 반영됩니다)`);
    
    render('module-content');
  }

  // 📅 완벽한 7열 반응형 연차 달력 그리드 (PC & 스마트폰 깨짐 방지)
  function renderCalendarGrid(leaveRequests) {
    const year = currentCalYear;
    const month = currentCalMonth;
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);

    const startDayOfWeek = firstDay.getDay();
    const totalDays = lastDay.getDate();
    const todayStr = new Date().toISOString().split('T')[0];

    let html = `
      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:14px; padding:12px 16px; margin-bottom:16px;" class="d-flex justify-content-between align-items-center flex-wrap gap-2">
        <div class="d-flex align-items-center gap-3 flex-wrap" style="font-size:12.5px; font-weight:700;">
          <span style="color:#065f46; background:#d1fae5; border:1px solid #6ee7b7; padding:4px 10px; border-radius:12px; display:inline-flex; align-items:center; gap:4px;">
            <i class="fas fa-check-circle"></i> 🌴 승인 확정 연차
          </span>
          <span style="color:#92400e; background:#fef3c7; border:1px solid #fde68a; padding:4px 10px; border-radius:12px; display:inline-flex; align-items:center; gap:4px;">
            <i class="fas fa-clock"></i> ⏳ 결재 대기 중
          </span>
        </div>
        <span class="text-muted" style="font-size:12.5px; font-weight:600;"><i class="fas fa-info-circle me-1"></i>승인된 연차는 자동으로 직원 휴가 스케줄에 연동됩니다.</span>
      </div>

      <div style="overflow-x:auto; -webkit-overflow-scrolling:touch; border-radius:16px; border:1.5px solid #cbd5e1; background:#cbd5e1;">
        <div style="display:grid; grid-template-columns:repeat(7, minmax(100px, 1fr)); gap:1px; width:100%; min-width:700px; background:#cbd5e1;">
          
          <!-- 요일 헤더 -->
          <div style="background:#ffffff; padding:12px 4px; text-align:center; font-weight:800; font-size:14px; color:#dc2626; border-bottom:2px solid #cbd5e1;">일</div>
          <div style="background:#ffffff; padding:12px 4px; text-align:center; font-weight:800; font-size:14px; color:#334155; border-bottom:2px solid #cbd5e1;">월</div>
          <div style="background:#ffffff; padding:12px 4px; text-align:center; font-weight:800; font-size:14px; color:#334155; border-bottom:2px solid #cbd5e1;">화</div>
          <div style="background:#ffffff; padding:12px 4px; text-align:center; font-weight:800; font-size:14px; color:#334155; border-bottom:2px solid #cbd5e1;">수</div>
          <div style="background:#ffffff; padding:12px 4px; text-align:center; font-weight:800; font-size:14px; color:#334155; border-bottom:2px solid #cbd5e1;">목</div>
          <div style="background:#ffffff; padding:12px 4px; text-align:center; font-weight:800; font-size:14px; color:#334155; border-bottom:2px solid #cbd5e1;">금</div>
          <div style="background:#ffffff; padding:12px 4px; text-align:center; font-weight:800; font-size:14px; color:#2563eb; border-bottom:2px solid #cbd5e1;">토</div>
    `;

    // 1일 전 빈 셀 채우기
    for (let i = 0; i < startDayOfWeek; i++) {
      html += `<div style="background:#f8fafc; min-height:115px;"></div>`;
    }

    // 날짜 셀 채우기
    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayOfWeek = (startDayOfWeek + day - 1) % 7;
      const isToday = dateStr === todayStr;

      const dayLeaves = leaveRequests.filter(l => {
        return dateStr >= l.startDate && dateStr <= l.endDate;
      });

      html += `
        <div style="background:#ffffff; min-height:115px; padding:10px 8px; display:flex; flex-direction:column; justify-content:space-between; ${isToday ? 'border:2px solid #10b981; background:#f0fdf4;' : ''}">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span style="font-weight:800; font-size:14px; font-family:'Outfit',sans-serif; color:${dayOfWeek === 0 ? '#dc2626' : (dayOfWeek === 6 ? '#2563eb' : '#0f172a')};">
              ${day}
            </span>
            ${isToday ? '<span class="badge bg-success" style="font-size:10px; padding:2px 6px; border-radius:6px;">오늘</span>' : ''}
          </div>

          <div style="display:flex; flex-direction:column; gap:4px; flex:1; justify-content:flex-start; margin-top:4px;">
            ${dayLeaves.map(l => {
              const isApproved = l.status === 'APPROVED';
              const bg = isApproved ? '#d1fae5' : '#fef3c7';
              const textCol = isApproved ? '#065f46' : '#92400e';
              const borderCol = isApproved ? '#6ee7b7' : '#fde68a';
              const icon = isApproved ? '🌴' : '⏳';

              return `
                <div style="background:${bg}; color:${textCol}; border:1px solid ${borderCol}; padding:4px 6px; border-radius:6px; font-size:11.5px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; box-shadow:0 1px 3px rgba(0,0,0,0.03);" title="${l.empName} (${l.type} - ${l.reason})">
                  ${icon} <strong>${l.empName}</strong> (${l.type})
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    // 마지막 주 남은 셀 채우기
    const totalCells = startDayOfWeek + totalDays;
    const remainingCells = (7 - (totalCells % 7)) % 7;
    for (let i = 0; i < remainingCells; i++) {
      html += `<div style="background:#f8fafc; min-height:115px;"></div>`;
    }

    html += `
        </div>
      </div>
    `;

    return html;
  }

  function renderCalendarList(leaveRequests) {
    const monthStr = `${currentCalYear}-${String(currentCalMonth).padStart(2, '0')}`;
    const monthLeaves = leaveRequests.filter(l => l.startDate.startsWith(monthStr) || l.endDate.startsWith(monthStr));

    if (monthLeaves.length === 0) {
      return `
        <div class="text-center py-6 text-muted" style="background:#f8fafc; border-radius:16px; padding:32px; border:1px solid #e2e8f0;">
          <i class="far fa-calendar-times mb-2" style="color:#cbd5e1; font-size:36px;"></i>
          <p class="mb-0 font-bold" style="color:#64748b;">${currentCalYear}년 ${currentCalMonth}월에는 등록된 연차 유급휴가 일정이 없습니다.</p>
        </div>
      `;
    }

    return `
      <div class="leave-timeline-list">
        ${monthLeaves.map(l => {
          const d = new Date(l.startDate);
          const dayName = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
          const isApproved = l.status === 'APPROVED';

          return `
            <div class="timeline-item ${isApproved ? 'item-approved' : 'item-pending'}" style="background:#ffffff; border:1.5px solid ${isApproved ? '#bbf7d0' : '#fde68a'}; border-radius:14px; padding:14px 18px; margin-bottom:12px; display:flex; align-items:center; gap:16px; box-shadow:0 2px 8px rgba(15,23,42,0.03);">
              <div style="background:${isApproved ? '#eff6ff' : '#fffbeb'}; border:1px solid ${isApproved ? '#bfdbfe' : '#fde68a'}; padding:8px 12px; border-radius:10px; text-align:center; min-width:64px;">
                <span style="font-weight:800; font-size:15px; color:#1e293b; font-family:'Outfit',sans-serif; display:block;">${l.startDate.substring(5)}</span>
                <span style="font-size:11px; font-weight:700; color:${d.getDay() === 0 ? '#dc2626' : (d.getDay() === 6 ? '#2563eb' : '#64748b')};">(${dayName})</span>
              </div>
              <div style="flex:1;">
                <div class="d-flex align-items-center gap-2 mb-1">
                  <strong style="font-size:15px; color:#0f172a;">${l.empName}</strong>
                  <span class="badge ${l.role.includes('약사') ? 'bg-primary' : 'bg-secondary'}" style="font-size:11px; padding:3px 6px; border-radius:6px;">${l.role}</span>
                  <span class="badge ${isApproved ? 'bg-success' : 'bg-warning text-dark'}" style="font-size:11px; padding:3px 8px; border-radius:6px;">
                    ${isApproved ? '<i class="fas fa-check me-1"></i>승인 완료' : '<i class="fas fa-clock me-1"></i>약국장 결재 대기'}
                  </span>
                </div>
                <div style="font-size:13px; color:#475569;">
                  <span class="badge" style="background:#eff6ff; color:#1e40af; border:1px solid #bfdbfe; font-size:11px; padding:3px 6px; border-radius:4px; margin-right:6px;">${l.type} (${l.daysCount}일)</span>
                  ${l.reason}
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function setCalViewMode(mode) {
    calViewMode = mode;
    render('module-content');
  }

  function changeCalMonth(delta) {
    currentCalMonth += delta;
    if (currentCalMonth > 12) {
      currentCalMonth = 1;
      currentCalYear++;
    } else if (currentCalMonth < 1) {
      currentCalMonth = 12;
      currentCalYear--;
    }
    render('module-content');
  }

  let leaveChartInst = {};
  function initLeaveCharts(targetEmployees) {
    if (typeof Chart === 'undefined') return;

    const barLabels = targetEmployees.map(e => e.name);
    const barData1 = targetEmployees.map(e => {
      const calc = window.LaborCalculator.calculateStatutoryLeave(e.joinDate);
      return Math.max(0, calc.totalGranted - (e.usedLeave || 0));
    });
    const barData2 = targetEmployees.map(e => e.usedLeave || 0);

    const barCtx = document.getElementById('leaveBarCanvas');
    if (barCtx) {
      if (leaveChartInst.bar) {
        try { leaveChartInst.bar.destroy(); } catch (e) {}
        leaveChartInst.bar = null;
      }
      leaveChartInst.bar = new Chart(barCtx, {
        type: 'bar',
        indexAxis: 'y',
        data: {
          labels: barLabels,
          datasets: [
            { label: '잔여연차', data: barData1, backgroundColor: 'rgba(16,185,129,0.82)', borderRadius: 4 },
            { label: '사용연차', data: barData2, backgroundColor: 'rgba(239,68,68,0.65)', borderRadius: 4 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false, animation: false,
          plugins: { legend: { position: 'top', labels: { boxWidth: 10, font: { size: 10 } } } },
          scales: { x: { stacked: false, ticks: { stepSize: 1 } } }
        }
      });
    }

    const donutData = [
      Math.max(0, targetEmployees.reduce((s,e) => { const c = window.LaborCalculator.calculateStatutoryLeave(e.joinDate); return s + c.totalGranted - (e.usedLeave||0); }, 0)),
      targetEmployees.reduce((s,e) => s + (e.usedLeave||0), 0)
    ];

    const donutCtx = document.getElementById('leaveDonutCanvas');
    if (donutCtx) {
      if (leaveChartInst.donut) {
        try { leaveChartInst.donut.destroy(); } catch (e) {}
        leaveChartInst.donut = null;
      }
      leaveChartInst.donut = new Chart(donutCtx, {
        type: 'doughnut',
        data: {
          labels: ['잔여 연차 (마일)', '사용 연차 (마일)'],
          datasets: [{
            data: donutData,
            backgroundColor: ['#10b981', '#ef4444']
          }]
        },
        options: {
          responsive: true, maintainAspectRatio: false, animation: false,
          plugins: { legend: { position: 'right', labels: { boxWidth: 10, font: { size: 10 } } } }
        }
      });
    }
  }

  return {
    render,
    toggleInlineLeaveForm,
    submitLeaveApplication,
    changeCalMonth,
    setCalViewMode,
    approveLeaveRequest,
    rejectLeaveRequest,
    bulkApprove,
    bulkDelete,
    updateSelectedCount,
    toggleSelectAll
  };
})();
