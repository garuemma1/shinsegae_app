/**
 * 10. 스마트약국 정산 시스템 모듈 컨트롤러 (Smart Pharmacy Financial Settlement Engine v42.0)
 * 약국장 전용: 일일결산 회계장부(31일 개별 수정/추가/삭제) 및 월간 손익계산서(P&L 수입/사입/고정비/금융비용 항목별 추가/수정/삭제)
 * 구글 스프레드시트 100% 양방향 연동 지원
 */
window.PharmacySettlementModule = (function () {

  let activeSubTab = 'daily'; // 1순위: 'daily' | 2순위: 'pnl' | 3순위: 'yearly'

  function setSubTab(tab) {
    activeSubTab = tab;
    render('module-content');
  }

  function render(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const currentUser = window.SheetsSync.getCurrentUser();

    // 보안 검증: 약국장만 접근 가능
    if (!currentUser || currentUser.role !== '약국장') {
      container.innerHTML = `
        <div class="alert alert-danger p-4 text-center my-5" style="border-radius:16px;">
          <h4><i class="fas fa-lock"></i> 🔒 접근 권한 제한 영역</h4>
          <p class="mb-0">스마트약국 정산 시스템은 <strong>약국장(대표약사) 전용 보안 대시보드</strong>입니다.</p>
        </div>
      `;
      return;
    }

    const pData = window.SheetsSync.getPharmacySettlement();
    const emps = window.SheetsSync.getEmployees();
    const schedule = window.SheetsSync.getSchedule();

    // 1. 인건비 실시간 자동 계산 (9인 직원 정산 연동)
    let totalPayrollExpense = 0;
    const pRatesMap = window.SheetsSync.getPharmacistRates ? window.SheetsSync.getPharmacistRates() : {};
    const payrollDetails = emps.map(emp => {
      const empShifts = schedule.filter(s => s.empId === emp.id);
      let payAmount = 0;
      if (emp.role === '근무약사' || (emp.role || '').includes('약사')) {
        const pRate = pRatesMap[emp.id] || { weekdayRate: emp.hourlyRate || 40000, holidayRate: 40000, breakHours: 1.0 };
        const calc = window.LaborCalculator.calculatePharmacistPayroll(empShifts, pRate.weekdayRate, pRate.holidayRate, pRate.breakHours);
        payAmount = calc.totalPayroll;
      } else {
        const baseSal = Number(emp.baseMonthlySalary) || (emp.name === '이승학' ? 2821500 : 2717000);
        payAmount = baseSal;
      }
      totalPayrollExpense += payAmount;

      // 퇴직적립금 추정액 (월선급 1/12)
      const severanceAccrual = Math.round(payAmount / 12);

      return {
        emp,
        payAmount,
        severanceAccrual
      };
    });

    // 2. 수입 산출 (일반매출, 카드 수입, 현금 수입 추가)
    const dispensingFee = Number(pData.dispensingFee) || 18500000;
    const generalRevenue = Number(pData.generalRevenue || pData.posRevenue) || 24200000;
    const patientCopay = Number(pData.patientCopay) || 12000000;
    const nhisClaim = Number(pData.nhisClaim) || 18000000;
    const otherIncome = Number(pData.otherIncome) || 1800000;
    const totalRevenue = dispensingFee + generalRevenue + patientCopay + nhisClaim + otherIncome;

    // 카드 수입 & 현금 수입 (미설정 시 총수입의 85%/15% 자동 할당)
    const cardRevenue = Number(pData.cardRevenue) || Math.round(totalRevenue * 0.85);
    const cashRevenue = Number(pData.cashRevenue) || (totalRevenue - cardRevenue);

    // 3. 약품 사입비 산출 (도매상 및 제약사 현금 + 카드)
    const cashWholesaleObj = pData.cashWholesale || { '다우약품': 12400000, '산성호': 8500000, '백제약품': 7200000, '지오영': 6800000 };
    const cardPharmaObj = pData.cardPharma || { '대웅제약': 2400000, '동화약품': 1800000, '일양약품': 1200000, '비타민하우스': 950000, 'GC녹십자': 1050000 };

    let totalCashWholesale = 0;
    Object.values(cashWholesaleObj).forEach(v => totalCashWholesale += Number(v) || 0);

    let totalCardPharma = 0;
    Object.values(cardPharmaObj).forEach(v => totalCardPharma += Number(v) || 0);

    const totalDrugCost = totalCashWholesale + totalCardPharma;

    // 4. 공과금 및 고정비 (동적 항목 포함)
    const customOperatingObj = pData.customOperating || {};
    const rentExp = Number(pData.rentExpense) || 3500000;
    const maintExp = Number(pData.maintExpense) || 500000;
    const ins4Cost = Number(pData.insurance4Cost) || 1850000;
    const taxFee = Number(pData.taxAccountantFee) || 220000;
    const posFee = Number(pData.posCardFee) || 1120000;

    let totalCustomOperating = 0;
    Object.values(customOperatingObj).forEach(v => totalCustomOperating += Number(v) || 0);

    const totalFixedOperating = rentExp + maintExp + ins4Cost + taxFee + posFee + totalCustomOperating;

    // 5. 금융비용 (동적 항목 포함)
    const customFinancialObj = pData.customFinancial || {};
    const loanInterest = Number(pData.loanInterest) || 2150000;
    const loanPrincipal = Number(pData.loanPrincipal) || 1500000;

    let totalCustomFinancial = 0;
    Object.values(customFinancialObj).forEach(v => totalCustomFinancial += Number(v) || 0);

    const totalFinancialCost = loanInterest + loanPrincipal + totalCustomFinancial;

    // 6. Lean-OPS 변동비 / 고정비 / 공헌이익 / 영업이익 연산
    let parttimePayroll = 0;
    let fulltimePayroll = 0;
    payrollDetails.forEach(item => {
      if ((item.emp.role || '').includes('약사')) {
        parttimePayroll += item.payAmount;
      } else {
        fulltimePayroll += item.payAmount;
      }
    });

    // 변동비: 약품 사입비 + 파트타임 약사 인건비 + POS/카드 수수료
    const variableCosts = totalDrugCost + parttimePayroll + posFee;
    const variableRate = totalRevenue > 0 ? ((variableCosts / totalRevenue) * 100).toFixed(1) : '0.0';

    // 공헌이익 = 매출 - 변동비
    const contributionMargin = totalRevenue - variableCosts;
    const contributionMarginRate = totalRevenue > 0 ? ((contributionMargin / totalRevenue) * 100).toFixed(1) : '0.0';

    // 고정비 = 임차료 + 건물관리비 + 정직원 인건비 + 4대보험 + 세무사 기장료 + 동적 고정비 + 금융비용
    const fixedCosts = rentExp + maintExp + fulltimePayroll + ins4Cost + taxFee + totalCustomOperating + totalFinancialCost;
    const fixedRate = totalRevenue > 0 ? ((fixedCosts / totalRevenue) * 100).toFixed(1) : '0.0';

    // 영업이익 = 공헌이익 - 고정비
    const operatingProfit = contributionMargin - fixedCosts;
    const operatingProfitRate = totalRevenue > 0 ? ((operatingProfit / totalRevenue) * 100).toFixed(1) : '0.0';

    const totalExpenses = variableCosts + fixedCosts;
    const netProfit = operatingProfit;

    // 일평균 매출
    const dailyAvgRev = Math.round(totalRevenue / 31);

    const fmt = num => new Intl.NumberFormat('ko-KR').format(Math.round(num || 0));

    let html = `
      <div class="module-header d-flex justify-content-between align-items-center flex-wrap gap-2 mb-4">
        <div>
          <h2 style="font-size:22px; font-weight:800; color:#0f172a; margin:0;"><i class="fas fa-calculator text-primary me-2"></i> 📊 신세계약국 스마트 정산 대시보드</h2>
          <p class="subtitle" style="font-size:13px; color:#64748b; margin:4px 0 0 0;">약국장 전용: Lean-OPS 경영 대시보드 (매출·변동비·공헌이익·고정비·영업이익 5대 파이프라인 연동)</p>
        </div>
        <div class="d-flex align-items-center gap-2">
          <button type="button" class="btn btn-outline-success font-bold" onclick="PharmacySettlementModule.openImportModal()" style="border-radius:10px; padding:7px 14px; font-size:13px; box-shadow:0 2px 6px rgba(16,185,129,0.15);">
            <i class="fas fa-file-import text-success me-1"></i> 📥 구글 스프레드시트 불러오기
          </button>
          <button type="button" class="btn btn-outline-primary font-bold" onclick="App.openSheetModal()" style="border-radius:10px; padding:7px 14px; font-size:13px; box-shadow:0 2px 6px rgba(37,99,235,0.15);">
            <i class="fas fa-file-export text-primary me-1"></i> 📊 구글 스프레드시트 연동 설정
          </button>
          <span class="badge bg-danger" style="font-size:12.5px; padding:8px 14px; border-radius:10px;">🔐 약국장 전용 보안 대시보드</span>
        </div>
      </div>

      <!-- 💡 Lean-OPS 스타일 5대 핵심 경영 KPI 카드 (Executive Financial Pipeline 5 Cards) -->
      <div class="mb-4" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(135px, 1fr)); gap:10px;">
        <div class="kpi-summary-card p-3" style="border-radius:16px; border:1.5px solid #cbd5e1; background:#ffffff; display:flex; flex-direction:column; justify-content:space-between;">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span style="font-size:12px; font-weight:800; color:#475569;">매출</span>
            <div style="width:24px; height:24px; border-radius:6px; background:#eff6ff; color:#2563eb; display:flex; align-items:center; justify-content:center; font-size:12px;">
              <i class="fas fa-chart-line"></i>
            </div>
          </div>
          <div style="font-size:18px; font-weight:800; color:#0f172a; font-family:'Outfit', sans-serif;">
            ${(totalRevenue / 100000000).toFixed(1)}<span style="font-size:12px; font-weight:700;">억 원</span>
          </div>
          <div style="font-size:10.5px; color:#64748b; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            ₩${fmt(totalRevenue)}
          </div>
        </div>

        <div class="kpi-summary-card p-3" style="border-radius:16px; border:1.5px solid #fca5a5; background:#fff5f5; display:flex; flex-direction:column; justify-content:space-between;">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span style="font-size:12px; font-weight:800; color:#991b1b;">변동비</span>
            <div style="width:24px; height:24px; border-radius:6px; background:#fee2e2; color:#dc2626; display:flex; align-items:center; justify-content:center; font-size:12px;">
              <i class="fas fa-shopping-cart"></i>
            </div>
          </div>
          <div style="font-size:18px; font-weight:800; color:#b91c1c; font-family:'Outfit', sans-serif;">
            ${(variableCosts / 100000000).toFixed(1)}<span style="font-size:12px; font-weight:700;">억 원</span>
          </div>
          <div style="font-size:10.5px; color:#ef4444; margin-top:2px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            매출 대비 ${variableRate}%
          </div>
        </div>

        <div class="kpi-summary-card p-3" style="border-radius:16px; border:1.5px solid #bfdbfe; background:#eff6ff; display:flex; flex-direction:column; justify-content:space-between;">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span style="font-size:12px; font-weight:800; color:#1e40af;">공헌이익</span>
            <div style="width:24px; height:24px; border-radius:6px; background:#dbeafe; color:#1d4ed8; display:flex; align-items:center; justify-content:center; font-size:12px;">
              <i class="fas fa-percentage"></i>
            </div>
          </div>
          <div style="font-size:18px; font-weight:800; color:#1d4ed8; font-family:'Outfit', sans-serif;">
            ${(contributionMargin / 100000000).toFixed(1)}<span style="font-size:12px; font-weight:700;">억 원</span>
          </div>
          <div style="font-size:10.5px; color:#2563eb; margin-top:2px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            공헌이익률 ${contributionMarginRate}%
          </div>
        </div>

        <div class="kpi-summary-card p-3" style="border-radius:16px; border:1.5px solid #fed7aa; background:#fff7ed; display:flex; flex-direction:column; justify-content:space-between;">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span style="font-size:12px; font-weight:800; color:#c2410c;">고정비</span>
            <div style="width:24px; height:24px; border-radius:6px; background:#ffedd5; color:#ea580c; display:flex; align-items:center; justify-content:center; font-size:12px;">
              <i class="fas fa-building"></i>
            </div>
          </div>
          <div style="font-size:18px; font-weight:800; color:#c2410c; font-family:'Outfit', sans-serif;">
            ${(fixedCosts / 100000000).toFixed(1)}<span style="font-size:12px; font-weight:700;">억 원</span>
          </div>
          <div style="font-size:10.5px; color:#ea580c; margin-top:2px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            매출 대비 ${fixedRate}%
          </div>
        </div>

        <div class="kpi-summary-card p-3" style="border-radius:16px; border:1.5px solid #a7f3d0; background:#f0fdf4; display:flex; flex-direction:column; justify-content:space-between;">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span style="font-size:12px; font-weight:800; color:#15803d;">영업이익</span>
            <div style="width:24px; height:24px; border-radius:6px; background:#dcfce7; color:#16a34a; display:flex; align-items:center; justify-content:center; font-size:12px;">
              <i class="fas fa-trophy"></i>
            </div>
          </div>
          <div style="font-size:18px; font-weight:800; color:#15803d; font-family:'Outfit', sans-serif;">
            ${fmt(operatingProfit)}<span style="font-size:12px; font-weight:700;">원</span>
          </div>
          <div style="font-size:10.5px; color:#16a34a; margin-top:2px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            이익률 ${operatingProfitRate}%
          </div>
        </div>
      </div>

      <!-- 📌 세부 3대 서브 탭 네비게이션 (100% 풀 와이드) -->
      <div class="d-flex gap-2 border-bottom pb-3 mb-4 flex-wrap">
        <button type="button" class="btn ${activeSubTab === 'daily' ? 'btn-primary font-bold' : 'btn-outline-secondary'}" onclick="PharmacySettlementModule.setSubTab('daily')" style="border-radius:10px; padding:10px 20px; font-size:14px;">
          <i class="fas fa-book me-1"></i> ① 일일 결산 & 회계 장부 (Daily Log)
        </button>
        <button type="button" class="btn ${activeSubTab === 'pnl' ? 'btn-primary font-bold' : 'btn-outline-secondary'}" onclick="PharmacySettlementModule.setSubTab('pnl')" style="border-radius:10px; padding:10px 20px; font-size:14px;">
          <i class="fas fa-file-invoice me-1"></i> ② 월간 종합 손익계산서 (P&L View)
        </button>
        <button type="button" class="btn ${activeSubTab === 'yearly' ? 'btn-primary font-bold' : 'btn-outline-secondary'}" onclick="PharmacySettlementModule.setSubTab('yearly')" style="border-radius:10px; padding:10px 20px; font-size:14px;">
          <i class="fas fa-chart-bar me-1"></i> ③ 연도별 장기 성장 통계 (Historical Trends)
        </button>
      </div>
    `;

    // 1순위 서브 탭: 일일 결산 & 회계 장부 (Daily Log) - 일자별 개별 수정/추가/삭제
    if (activeSubTab === 'daily') {
      const dailyLogs = pData.dailyLogs || [];

      html += `
        <div class="card mb-4 shadow-sm" style="border-radius:18px; border:1.5px solid #cbd5e1; overflow:hidden;">
          <div class="card-header d-flex justify-content-between align-items-center flex-wrap gap-2" style="background:#0f172a; color:#ffffff; padding:16px 20px;">
            <h3 style="font-size:16.5px; font-weight:800; margin:0; color:#ffffff;"><i class="fas fa-book-open me-2 text-warning"></i> 2026년 8월 일일 결산 및 회계 장부 (Daily Log)</h3>
            <div class="d-flex align-items-center gap-2">
              <button type="button" class="btn btn-sm btn-success font-bold" onclick="PharmacySettlementModule.openDailyLogEditModal()">
                <i class="fas fa-plus-circle me-1"></i> ➕ 일일결산 내역 추가/등록
              </button>
              <button type="button" class="btn btn-sm btn-outline-light font-bold" onclick="App.openSheetModal()">
                <i class="fas fa-table text-success me-1"></i> 구글 시트 연동 설정
              </button>
            </div>
          </div>
          <div class="card-body p-0">
            <div class="table-responsive">
              <table class="table table-striped table-hover align-middle mb-0" style="font-size:13px;">
                <thead style="background:#f1f5f9; color:#334155;">
                  <tr>
                    <th style="text-align:center; padding:10px; width:100px;">일자</th>
                    <th style="text-align:center; padding:10px; width:60px;">요일</th>
                    <th style="text-align:right; padding:10px;">조제 매출</th>
                    <th style="text-align:right; padding:10px;">일반 매출</th>
                    <th style="text-align:right; padding:10px;">일 총 매출</th>
                    <th style="text-align:center; padding:10px; width:100px;">카드/현금 비중</th>
                    <th style="text-align:right; padding:10px;">일 소액지출</th>
                    <th style="padding:10px;">비고 및 특이사항</th>
                    <th style="text-align:center; padding:10px; width:110px;">세부 관리</th>
                  </tr>
                </thead>
                <tbody>
                  ${dailyLogs.map(log => `
                    <tr>
                      <td style="text-align:center; font-weight:700; color:#0f172a;">${log.date}</td>
                      <td style="text-align:center;">
                        <span class="${log.dayOfWeek === '일' ? 'text-danger font-bold' : (log.dayOfWeek === '토' ? 'text-primary font-bold' : 'text-dark')}">
                          ${log.dayOfWeek}요일
                        </span>
                      </td>
                      <td style="text-align:right; font-weight:700; color:#1e40af; font-family:'Outfit', sans-serif;">${fmt(log.dispensingRevenue)} 원</td>
                      <td style="text-align:right; font-weight:700; color:#0369a1; font-family:'Outfit', sans-serif;">${fmt(log.posRevenue)} 원</td>
                      <td style="text-align:right; font-weight:800; color:#15803d; font-family:'Outfit', sans-serif;">${fmt(log.totalRevenue)} 원</td>
                      <td style="text-align:center;">
                        <span class="badge bg-light text-dark" style="border:1px solid #cbd5e1; font-size:11px;">카드 ${log.cardPay > 0 ? Math.round((log.cardPay/log.totalRevenue)*100) : 85}%</span>
                      </td>
                      <td style="text-align:right; color:#dc2626; font-weight:600; font-family:'Outfit', sans-serif;">${fmt(log.dailyExpense)} 원</td>
                      <td style="color:#64748b; font-size:12px;">${log.note || '-'}</td>
                      <td style="text-align:center;">
                        <div class="d-flex justify-content-center gap-1">
                          <button type="button" class="btn btn-xs btn-outline-primary font-bold" onclick="PharmacySettlementModule.openDailyLogEditModal('${log.date}')" style="padding:2px 6px; font-size:11.5px;">
                            ✏️ 수정
                          </button>
                          <button type="button" class="btn btn-xs btn-outline-danger font-bold" onclick="PharmacySettlementModule.deleteDailyLog('${log.date}')" style="padding:2px 6px; font-size:11.5px;">
                            🗑️ 초기화
                          </button>
                        </div>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
    }

    // 2순위 서브 탭: 월간 종합 손익계산서 (P&L View) - 세부 항목별 추가/수정/삭제
    else if (activeSubTab === 'pnl') {
      html += `
        <!-- 1. 수입 세부 분석 -->
        <div class="card mb-4 shadow-sm" style="border-radius:18px; border:1.5px solid #cbd5e1; overflow:hidden;">
          <div class="card-header d-flex justify-content-between align-items-center" style="background:#eff6ff; border-bottom:1.5px solid #bfdbfe; padding:16px 20px;">
            <h3 style="font-size:16px; font-weight:800; color:#1e40af; margin:0;"><i class="fas fa-coins me-2"></i> 1. 수입 분석 (Revenue Breakdown)</h3>
            <span class="badge bg-primary" style="font-size:12.5px;">총 수입: ${fmt(totalRevenue)} 원</span>
          </div>
          <div class="card-body p-0">
            <div class="table-responsive">
              <table class="table align-middle mb-0" style="font-size:13.5px;">
                <thead style="background:#f8fafc; color:#334155;">
                  <tr>
                    <th style="padding:12px 16px;">수입 항목 구별</th>
                    <th style="padding:12px 16px;">세부 설명 및 산출 기준</th>
                    <th style="text-align:right; padding:12px 16px; width:220px;">당월 수입 금액 (원)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style="font-weight:700; color:#0f172a;">💊 조제료 수입</td>
                    <td style="color:#64748b;">처방전 조제기술료 및 행위료 총액</td>
                    <td style="text-align:right;">
                      <input type="number" class="form-control form-control-sm text-end font-bold text-primary" style="font-size:14px; border-radius:8px; border:1.5px solid #93c5fd;" value="${dispensingFee}" onchange="PharmacySettlementModule.updateField('dispensingFee', this.value)">
                    </td>
                  </tr>
                  <tr>
                    <td style="font-weight:700; color:#0f172a;">🛒 매장 일반매출</td>
                    <td style="color:#64748b;">일반의약품, 영양제, 의약외품, 마스크 등 카운터 일반매출 결제액</td>
                    <td style="text-align:right;">
                      <input type="number" class="form-control form-control-sm text-end font-bold text-primary" style="font-size:14px; border-radius:8px; border:1.5px solid #93c5fd;" value="${generalRevenue}" onchange="PharmacySettlementModule.updateField('generalRevenue', this.value)">
                    </td>
                  </tr>
                  <tr style="background:#f8fafc;">
                    <td style="font-weight:700; color:#2563eb; padding-left:28px;">💳 (세분화) 카드 수입</td>
                    <td style="color:#64748b;">당월 총 수입 중 신용/체크 카드 가맹점 입금액 (약 85%)</td>
                    <td style="text-align:right;">
                      <input type="number" class="form-control form-control-sm text-end font-bold text-primary" style="font-size:14px; border-radius:8px; border:1.5px solid #93c5fd;" value="${cardRevenue}" onchange="PharmacySettlementModule.updateField('cardRevenue', this.value)">
                    </td>
                  </tr>
                  <tr style="background:#f8fafc;">
                    <td style="font-weight:700; color:#059669; padding-left:28px;">💵 (세분화) 현금 수입</td>
                    <td style="color:#64748b;">당월 총 수입 중 현금 및 통장 계좌이체 수납액 (약 15%)</td>
                    <td style="text-align:right;">
                      <input type="number" class="form-control form-control-sm text-end font-bold text-success" style="font-size:14px; border-radius:8px; border:1.5px solid #a7f3d0;" value="${cashRevenue}" onchange="PharmacySettlementModule.updateField('cashRevenue', this.value)">
                    </td>
                  </tr>
                  <tr>
                    <td style="font-weight:700; color:#0f172a;">🏥 환자 본인부담금</td>
                    <td style="color:#64748b;">처방전 조제 시 환자 직접 현금/카드 창구 결제액</td>
                    <td style="text-align:right;">
                      <input type="number" class="form-control form-control-sm text-end font-bold text-primary" style="font-size:14px; border-radius:8px; border:1.5px solid #93c5fd;" value="${patientCopay}" onchange="PharmacySettlementModule.updateField('patientCopay', this.value)">
                    </td>
                  </tr>
                  <tr>
                    <td style="font-weight:700; color:#0f172a;">🏛️ 국민건강보험공단 청구금</td>
                    <td style="color:#64748b;">심평원 미지급 청구 및 공단 입금 요양급여비</td>
                    <td style="text-align:right;">
                      <input type="number" class="form-control form-control-sm text-end font-bold text-primary" style="font-size:14px; border-radius:8px; border:1.5px solid #93c5fd;" value="${nhisClaim}" onchange="PharmacySettlementModule.updateField('nhisClaim', this.value)">
                    </td>
                  </tr>
                  <tr>
                    <td style="font-weight:700; color:#0f172a;">🔮 비급여 및 기타수입</td>
                    <td style="color:#64748b;">비급여 처방약, 주사제, 제조/판매 기타 제수입</td>
                    <td style="text-align:right;">
                      <input type="number" class="form-control form-control-sm text-end font-bold text-primary" style="font-size:14px; border-radius:8px; border:1.5px solid #93c5fd;" value="${otherIncome}" onchange="PharmacySettlementModule.updateField('otherIncome', this.value)">
                    </td>
                  </tr>
                  <tr style="background:#eff6ff; font-weight:800;">
                    <td colspan="2" style="font-size:15px; color:#1e40af;">총 수입 합계 (Total Gross Revenue)</td>
                    <td style="text-align:right; font-size:16px; color:#1d4ed8; font-family:'Outfit', sans-serif;">${fmt(totalRevenue)} 원</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- 2. 약품 결제 분석 (도매상/제약사 거래처 동적 추가/수정/삭제) -->
        <div class="row g-4 mb-4">
          <div class="col-md-6">
            <div class="card h-100 shadow-sm" style="border-radius:18px; border:1.5px solid #cbd5e1; overflow:hidden;">
              <div class="card-header d-flex justify-content-between align-items-center" style="background:#fef2f2; border-bottom:1.5px solid #fecaca; padding:14px 20px;">
                <h3 style="font-size:15.5px; font-weight:800; color:#991b1b; margin:0;"><i class="fas fa-truck-loading me-2"></i> 2-A. 도매상 및 제약사 현금결제</h3>
                <button type="button" class="btn btn-xs btn-outline-danger font-bold" onclick="PharmacySettlementModule.openAddSubItemModal('도매상/제약사 현금결제 거래처', 'cashWholesale')" style="padding:4px 10px; border-radius:8px;">
                  ➕ 거래처 추가
                </button>
              </div>
              <div class="card-body p-0">
                <table class="table align-middle mb-0" style="font-size:13px;">
                  <tbody>
                    ${Object.entries(cashWholesaleObj).map(([name, val]) => `
                      <tr>
                        <td style="font-weight:700; color:#0f172a; padding:10px 16px;">🏢 ${name}</td>
                        <td style="text-align:right; padding:10px 16px;">
                          <div class="d-flex align-items-center justify-content-end gap-1">
                            <input type="number" class="form-control form-control-sm text-end font-bold text-danger" style="width:130px; border-radius:8px; border:1.5px solid #fca5a5;" value="${val}" onchange="PharmacySettlementModule.updateSubField('cashWholesale', '${name}', this.value)">
                            <button type="button" class="btn btn-xs btn-outline-secondary" onclick="PharmacySettlementModule.deleteSubField('cashWholesale', '${name}')" title="거래처 삭제">🗑️</button>
                          </div>
                        </td>
                      </tr>
                    `).join('')}
                    <tr style="background:#fef2f2; font-weight:800;">
                      <td style="color:#991b1b; padding:10px 16px;">도매상 및 제약사 현금결제 소계</td>
                      <td style="text-align:right; color:#dc2626; font-size:15px; padding:10px 16px; font-family:'Outfit', sans-serif;">${fmt(totalCashWholesale)} 원</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div class="col-md-6">
            <div class="card h-100 shadow-sm" style="border-radius:18px; border:1.5px solid #cbd5e1; overflow:hidden;">
              <div class="card-header d-flex justify-content-between align-items-center" style="background:#fff7ed; border-bottom:1.5px solid #fed7aa; padding:14px 20px;">
                <h3 style="font-size:15.5px; font-weight:800; color:#c2410c; margin:0;"><i class="fas fa-credit-card me-2"></i> 2-B. 도매상 및 제약사 카드결제</h3>
                <button type="button" class="btn btn-xs btn-outline-warning font-bold text-dark" onclick="PharmacySettlementModule.openAddSubItemModal('도매상/제약사 카드결제 거래처', 'cardPharma')" style="padding:4px 10px; border-radius:8px;">
                  ➕ 거래처 추가
                </button>
              </div>
              <div class="card-body p-0">
                <table class="table align-middle mb-0" style="font-size:13px;">
                  <tbody>
                    ${Object.entries(cardPharmaObj).map(([name, val]) => `
                      <tr>
                        <td style="font-weight:700; color:#0f172a; padding:10px 16px;">💊 ${name}</td>
                        <td style="text-align:right; padding:10px 16px;">
                          <div class="d-flex align-items-center justify-content-end gap-1">
                            <input type="number" class="form-control form-control-sm text-end font-bold text-danger" style="width:130px; border-radius:8px; border:1.5px solid #fdba74;" value="${val}" onchange="PharmacySettlementModule.updateSubField('cardPharma', '${name}', this.value)">
                            <button type="button" class="btn btn-xs btn-outline-secondary" onclick="PharmacySettlementModule.deleteSubField('cardPharma', '${name}')" title="거래처 삭제">🗑️</button>
                          </div>
                        </td>
                      </tr>
                    `).join('')}
                    <tr style="background:#fff7ed; font-weight:800;">
                      <td style="color:#c2410c; padding:10px 16px;">도매상 및 제약사 카드결제 소계</td>
                      <td style="text-align:right; color:#ea580c; font-size:15px; padding:10px 16px; font-family:'Outfit', sans-serif;">${fmt(totalCardPharma)} 원</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        <!-- 3. 인건비 및 퇴직적립금 분석 -->
        <div class="card mb-4 shadow-sm" style="border-radius:18px; border:1.5px solid #cbd5e1; overflow:hidden;">
          <div class="card-header d-flex justify-content-between align-items-center" style="background:#f0fdf4; border-bottom:1.5px solid #bbf7d0; padding:16px 20px;">
            <h3 style="font-size:16px; font-weight:800; color:#15803d; margin:0;"><i class="fas fa-users me-2"></i> 3. 인건비 및 퇴직적립금 분석 (Labor Cost Breakdown - 9인)</h3>
            <span class="badge bg-success" style="font-size:12.5px;">당월 총 인건비: ${fmt(totalPayrollExpense)} 원</span>
          </div>
          <div class="card-body p-0">
            <div class="table-responsive">
              <table class="table align-middle mb-0" style="font-size:13px;">
                <thead style="background:#f8fafc;">
                  <tr>
                    <th style="padding:10px 14px;">직원명</th>
                    <th style="padding:10px 10px;">직무 구분</th>
                    <th style="text-align:right; padding:10px 14px;">당월 급여 지급액</th>
                    <th style="text-align:right; padding:10px 14px;">월 퇴직적립금 (1/12)</th>
                    <th style="padding:10px 14px;">적립 상태</th>
                  </tr>
                </thead>
                <tbody>
                  ${payrollDetails.map(item => `
                    <tr>
                      <td style="padding:10px 14px; font-weight:700; color:#0f172a;">👤 ${item.emp.name}</td>
                      <td style="padding:10px 10px;">
                        <span class="badge ${item.emp.role.includes('약사') ? 'bg-primary' : 'bg-success'}" style="font-size:11.5px; padding:3px 8px;">
                          ${item.emp.position || item.emp.role}
                        </span>
                      </td>
                      <td style="text-align:right; padding:10px 14px; font-weight:800; color:#15803d; font-family:'Outfit', sans-serif;">
                        ${fmt(item.payAmount)} 원
                      </td>
                      <td style="text-align:right; padding:10px 14px; font-weight:700; color:#0284c7; font-family:'Outfit', sans-serif;">
                        ${fmt(item.severanceAccrual)} 원
                      </td>
                      <td style="padding:10px 14px;">
                        <span class="badge bg-light text-dark" style="border:1px solid #cbd5e1; font-size:11px; padding:3px 8px;">🟢 정상 적립 중</span>
                      </td>
                    </tr>
                  `).join('')}
                  <tr style="background:#f0fdf4; font-weight:800;">
                    <td colspan="2" style="color:#166534; padding:12px 14px;">인건비 총액 합계</td>
                    <td style="text-align:right; color:#15803d; font-size:15.5px; padding:12px 14px; font-family:'Outfit', sans-serif;">${fmt(totalPayrollExpense)} 원</td>
                    <td style="text-align:right; color:#0369a1; font-size:14.5px; padding:12px 14px; font-family:'Outfit', sans-serif;">${fmt(totalPayrollExpense / 12)} 원</td>
                    <td>-</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- 4. 고정비 & 5. 금융비용 (항목별 동적 추가/수정/삭제 지원) -->
        <div class="row g-4 mb-4">
          <div class="col-md-6">
            <div class="card h-100 shadow-sm" style="border-radius:18px; border:1.5px solid #cbd5e1; overflow:hidden;">
              <div class="card-header d-flex justify-content-between align-items-center" style="background:#f8fafc; border-bottom:1.5px solid #e2e8f0; padding:14px 20px;">
                <h3 style="font-size:15.5px; font-weight:800; color:#334155; margin:0;"><i class="fas fa-building me-2"></i> 4. 공과금 및 고정 관리비</h3>
                <button type="button" class="btn btn-xs btn-outline-primary font-bold" onclick="PharmacySettlementModule.openAddSubItemModal('고정 관리비 항목', 'customOperating')" style="padding:4px 10px; border-radius:8px;">
                  ➕ 고정비 추가
                </button>
              </div>
              <div class="card-body p-0">
                <table class="table align-middle mb-0" style="font-size:13px;">
                  <tbody>
                    <tr>
                      <td style="font-weight:700; padding:10px 16px;">🏢 약국 월 임차료</td>
                      <td style="text-align:right; padding:10px 16px;">
                        <input type="number" class="form-control form-control-sm text-end font-bold" style="width:140px; display:inline-block;" value="${rentExp}" onchange="PharmacySettlementModule.updateField('rentExpense', this.value)">
                      </td>
                    </tr>
                    <tr>
                      <td style="font-weight:700; padding:10px 16px;">⚡ 건물 관리비 (전기/수도 포함)</td>
                      <td style="text-align:right; padding:10px 16px;">
                        <input type="number" class="form-control form-control-sm text-end font-bold" style="width:140px; display:inline-block;" value="${maintExp}" onchange="PharmacySettlementModule.updateField('maintExpense', this.value)">
                      </td>
                    </tr>
                    <tr>
                      <td style="font-weight:700; padding:10px 16px;">🛡️ 4대보험 약국 사업주 부담금</td>
                      <td style="text-align:right; padding:10px 16px;">
                        <input type="number" class="form-control form-control-sm text-end font-bold" style="width:140px; display:inline-block;" value="${ins4Cost}" onchange="PharmacySettlementModule.updateField('insurance4Cost', this.value)">
                      </td>
                    </tr>
                    <tr>
                      <td style="font-weight:700; padding:10px 16px;">📑 세무사 기장료 및 결산 수수료</td>
                      <td style="text-align:right; padding:10px 16px;">
                        <input type="number" class="form-control form-control-sm text-end font-bold" style="width:140px; display:inline-block;" value="${taxFee}" onchange="PharmacySettlementModule.updateField('taxAccountantFee', this.value)">
                      </td>
                    </tr>
                    <tr>
                      <td style="font-weight:700; padding:10px 16px;">💳 일반매출/카드결제/통신 수수료</td>
                      <td style="text-align:right; padding:10px 16px;">
                        <input type="number" class="form-control form-control-sm text-end font-bold" style="width:140px; display:inline-block;" value="${posFee}" onchange="PharmacySettlementModule.updateField('posCardFee', this.value)">
                      </td>
                    </tr>
                    ${Object.entries(customOperatingObj).map(([name, val]) => `
                      <tr>
                        <td style="font-weight:700; padding:10px 16px;">📌 ${name} (추가)</td>
                        <td style="text-align:right; padding:10px 16px;">
                          <div class="d-flex align-items-center justify-content-end gap-1">
                            <input type="number" class="form-control form-control-sm text-end font-bold" style="width:130px;" value="${val}" onchange="PharmacySettlementModule.updateSubField('customOperating', '${name}', this.value)">
                            <button type="button" class="btn btn-xs btn-outline-secondary" onclick="PharmacySettlementModule.deleteSubField('customOperating', '${name}')" title="항목 삭제">🗑️</button>
                          </div>
                        </td>
                      </tr>
                    `).join('')}
                    <tr style="background:#f8fafc; font-weight:800;">
                      <td style="padding:10px 16px;">고정 관리비 소계</td>
                      <td style="text-align:right; font-size:15px; color:#0f172a; padding:10px 16px; font-family:'Outfit', sans-serif;">${fmt(totalFixedOperating)} 원</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div class="col-md-6">
            <div class="card h-100 shadow-sm" style="border-radius:18px; border:1.5px solid #cbd5e1; overflow:hidden;">
              <div class="card-header d-flex justify-content-between align-items-center" style="background:#f8fafc; border-bottom:1.5px solid #e2e8f0; padding:14px 20px;">
                <h3 style="font-size:15.5px; font-weight:800; color:#334155; margin:0;"><i class="fas fa-university me-2"></i> 5. 금융비용 및 원리금 상환</h3>
                <button type="button" class="btn btn-xs btn-outline-danger font-bold" onclick="PharmacySettlementModule.openAddSubItemModal('금융비용 항목', 'customFinancial')" style="padding:4px 10px; border-radius:8px;">
                  ➕ 금융비용 추가
                </button>
              </div>
              <div class="card-body p-0">
                <table class="table align-middle mb-0" style="font-size:13px;">
                  <tbody>
                    <tr>
                      <td style="font-weight:700; padding:10px 16px;">🏦 약국 담보/운전자금 대출 이자</td>
                      <td style="text-align:right; padding:10px 16px;">
                        <input type="number" class="form-control form-control-sm text-end font-bold text-danger" style="width:140px; display:inline-block;" value="${loanInterest}" onchange="PharmacySettlementModule.updateField('loanInterest', this.value)">
                      </td>
                    </tr>
                    <tr>
                      <td style="font-weight:700; padding:10px 16px;">💸 대출 원리금 상환액</td>
                      <td style="text-align:right; padding:10px 16px;">
                        <input type="number" class="form-control form-control-sm text-end font-bold text-danger" style="width:140px; display:inline-block;" value="${loanPrincipal}" onchange="PharmacySettlementModule.updateField('loanPrincipal', this.value)">
                      </td>
                    </tr>
                    ${Object.entries(customFinancialObj).map(([name, val]) => `
                      <tr>
                        <td style="font-weight:700; padding:10px 16px;">📌 ${name} (추가)</td>
                        <td style="text-align:right; padding:10px 16px;">
                          <div class="d-flex align-items-center justify-content-end gap-1">
                            <input type="number" class="form-control form-control-sm text-end font-bold text-danger" style="width:130px;" value="${val}" onchange="PharmacySettlementModule.updateSubField('customFinancial', '${name}', this.value)">
                            <button type="button" class="btn btn-xs btn-outline-secondary" onclick="PharmacySettlementModule.deleteSubField('customFinancial', '${name}')" title="항목 삭제">🗑️</button>
                          </div>
                        </td>
                      </tr>
                    `).join('')}
                    <tr style="background:#f8fafc; font-weight:800;">
                      <td style="padding:10px 16px;">금융비용 소계</td>
                      <td style="text-align:right; font-size:15px; color:#be123c; padding:10px 16px; font-family:'Outfit', sans-serif;">${fmt(totalFinancialCost)} 원</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    // 3순위 서브 탭: 연도별 장기 성장 통계 (Historical Trends)
    else if (activeSubTab === 'yearly') {
      const stats = pData.yearlyStats || [];

      html += `
        <div class="card mb-4 shadow-sm" style="border-radius:18px; border:1.5px solid #cbd5e1; overflow:hidden;">
          <div class="card-header d-flex justify-content-between align-items-center" style="background:#0f172a; color:#ffffff; padding:16px 20px;">
            <h3 style="font-size:16.5px; font-weight:800; margin:0; color:#ffffff;"><i class="fas fa-chart-line me-2 text-success"></i> 2021년 ~ 2026년 연도별 장기 성장 통계 (Historical Trends)</h3>
            <span class="badge bg-success" style="font-size:12.5px; padding:6px 12px;">연평균 성장률(CAGR): +14.2%</span>
          </div>
          <div class="card-body p-4">
            <div class="table-responsive mb-4">
              <table class="table table-bordered align-middle text-center" style="font-size:13.5px;">
                <thead style="background:#f8fafc; color:#334155;">
                  <tr>
                    <th>연도</th>
                    <th>연 총 매출액</th>
                    <th>약품 사입비</th>
                    <th>총 인건비</th>
                    <th>고정 관리비</th>
                    <th>연 영업 순이익</th>
                    <th>손익 마진율 (%)</th>
                  </tr>
                </thead>
                <tbody>
                  ${stats.map(s => `
                    <tr class="${s.year === 2026 ? 'table-success font-bold' : ''}">
                      <td style="font-weight:800;">${s.year}년 ${s.year === 2026 ? '(당해 연도)' : ''}</td>
                      <td style="color:#1d4ed8; font-weight:800; font-family:'Outfit', sans-serif;">${fmt(s.revenue)} 원</td>
                      <td style="color:#dc2626; font-family:'Outfit', sans-serif;">${fmt(s.drugCost)} 원</td>
                      <td style="color:#15803d; font-family:'Outfit', sans-serif;">${fmt(s.payroll)} 원</td>
                      <td style="color:#64748b; font-family:'Outfit', sans-serif;">${fmt(s.operating)} 원</td>
                      <td style="color:#047857; font-weight:800; font-size:15px; font-family:'Outfit', sans-serif;">${fmt(s.profit)} 원</td>
                      <td>
                        <span class="badge bg-success" style="font-size:12px; padding:4px 8px;">${s.margin}%</span>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>

            <div class="alert alert-info p-3" style="border-radius:12px; font-size:13.5px;">
              💡 <strong>계절별 매출 사이클 비교 분석:</strong> 봄/가을 환절기(3~5월, 9~11월) 처방 조제 매출이 연간 매출의 약 58%를 차지하며, 여름철(7~8월)에는 영양제 및 일반의약품 매출 비중이 상승하는 경향을 보입니다.
            </div>
          </div>
        </div>
      `;
    }

    container.innerHTML = html;
  }

  // --- 기본 수치 업데이트 ---

  function updateField(field, val) {
    const data = window.SheetsSync.getPharmacySettlement();
    data[field] = Number(val) || 0;
    window.SheetsSync.savePharmacySettlement(data);
    render('module-content');
  }

  function updateSubField(category, key, val) {
    const data = window.SheetsSync.getPharmacySettlement();
    if (!data[category]) data[category] = {};
    data[category][key] = Number(val) || 0;
    window.SheetsSync.savePharmacySettlement(data);
    render('module-content');
  }

  function deleteSubField(category, key) {
    const data = window.SheetsSync.getPharmacySettlement();
    if (data[category] && data[category][key] !== undefined) {
      if (confirm(`🗑️ 정말로 [${key}] 항목을 삭제하시겠습니까?`)) {
        delete data[category][key];
        window.SheetsSync.savePharmacySettlement(data);
        render('module-content');
        alert(`🗑️ [${key}] 항목이 삭제되었습니다.`);
      }
    }
  }

  // --- 세부 항목 동적 추가 모달 (현금/카드 거래처, 고정비, 금융비용) ---

  function openAddSubItemModal(title, categoryKey) {
    let modal = document.getElementById('ps-subitem-add-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'ps-subitem-add-modal';
      modal.className = 'modal-overlay';
      modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); z-index:9999999; display:flex; justify-content:center; align-items:center;';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="modal-card" style="background:#ffffff; border-radius:18px; max-width:480px; width:92%; padding:24px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.35); position:relative;">
        <button type="button" class="close-btn" onclick="document.getElementById('ps-subitem-add-modal').style.display='none'" style="position:absolute; top:18px; right:20px; font-size:24px; background:none; border:none; color:#64748b; cursor:pointer;">&times;</button>
        
        <h4 style="font-size:17px; font-weight:800; color:#0f172a; margin-bottom:16px;">
          ➕ 신규 ${title} 추가
        </h4>

        <form onsubmit="PharmacySettlementModule.saveSubItemSubmit(event, '${categoryKey}')">
          <div class="mb-3">
            <label class="form-label font-bold" style="font-size:13px; color:#334155;">업체명 / 항목 명칭 *</label>
            <input type="text" class="form-control font-bold" id="psform-item-name" required placeholder="예: 신풍제약, 소독방역비, 리스이자">
          </div>

          <div class="mb-3">
            <label class="form-label font-bold" style="font-size:13px; color:#334155;">당월 결제/지출 금액 (원) *</label>
            <input type="number" class="form-control font-bold text-danger" id="psform-item-val" required placeholder="예: 1500000" min="0">
          </div>

          <div class="d-flex justify-content-end gap-2 mt-4">
            <button type="button" class="btn btn-secondary font-bold" onclick="document.getElementById('ps-subitem-add-modal').style.display='none'">취소</button>
            <button type="submit" class="btn btn-primary font-bold px-4">
              <i class="fas fa-check me-1"></i> 항목 추가 완료
            </button>
          </div>
        </form>
      </div>
    `;

    modal.style.display = 'flex';
  }

  function saveSubItemSubmit(e, categoryKey) {
    e.preventDefault();
    const data = window.SheetsSync.getPharmacySettlement();
    if (!data[categoryKey]) data[categoryKey] = {};

    const name = document.getElementById('psform-item-name').value.trim();
    const val = Number(document.getElementById('psform-item-val').value) || 0;

    if (name) {
      data[categoryKey][name] = val;
      window.SheetsSync.savePharmacySettlement(data);

      const modal = document.getElementById('ps-subitem-add-modal');
      if (modal) modal.style.display = 'none';

      render('module-content');
      alert(`🎉 [${name}] 항목이 성공적으로 추가 등록되었습니다!`);
    }
  }

  // --- 일일 결산 31일 세부 수정 및 등록 모달 ---

  function openDailyLogEditModal(targetDate = null) {
    const data = window.SheetsSync.getPharmacySettlement();
    if (!data.dailyLogs) data.dailyLogs = [];

    const defaultDate = targetDate || '2026-08-15';
    const logObj = data.dailyLogs.find(l => l.date === defaultDate) || {
      date: defaultDate,
      dayOfWeek: '토',
      dispensingRevenue: 650000,
      posRevenue: 850000,
      totalRevenue: 1500000,
      cardPay: 1275000,
      cashPay: 225000,
      dailyExpense: 35000,
      note: '정상 조제/일반매출 정산'
    };

    let modal = document.getElementById('ps-dailylog-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'ps-dailylog-modal';
      modal.className = 'modal-overlay';
      modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); z-index:9999999; display:flex; justify-content:center; align-items:center;';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="modal-card" style="background:#ffffff; border-radius:20px; max-width:600px; width:95%; padding:26px; box-shadow:0 25px 50px -12px rgba(0,0,0,0.35); position:relative; max-height:90vh; overflow-y:auto;">
        <button type="button" class="close-btn" onclick="document.getElementById('ps-dailylog-modal').style.display='none'" style="position:absolute; top:20px; right:24px; font-size:26px; background:none; border:none; color:#64748b; cursor:pointer;">&times;</button>
        
        <h3 style="font-size:18px; font-weight:800; color:#0f172a; margin-bottom:18px;">
          📅 일일 결산 & 회계 장부 세부 수정 / 등록
        </h3>

        <form onsubmit="PharmacySettlementModule.saveDailyLogSubmit(event)">
          <div class="row g-3">
            <div class="col-md-6">
              <label class="form-label font-bold" style="font-size:13px; color:#334155;">결산 일자 *</label>
              <input type="date" class="form-control font-bold" id="dlform-date" value="${logObj.date}" required>
            </div>
            <div class="col-md-6">
              <label class="form-label font-bold" style="font-size:13px; color:#334155;">요일 구별</label>
              <select class="form-select font-bold" id="dlform-dayOfWeek">
                <option value="월" ${logObj.dayOfWeek === '월' ? 'selected' : ''}>월요일</option>
                <option value="화" ${logObj.dayOfWeek === '화' ? 'selected' : ''}>화요일</option>
                <option value="수" ${logObj.dayOfWeek === '수' ? 'selected' : ''}>수요일</option>
                <option value="목" ${logObj.dayOfWeek === '목' ? 'selected' : ''}>목요일</option>
                <option value="금" ${logObj.dayOfWeek === '금' ? 'selected' : ''}>금요일</option>
                <option value="토" ${logObj.dayOfWeek === '토' ? 'selected' : ''}>토요일</option>
                <option value="일" ${logObj.dayOfWeek === '일' ? 'selected' : ''}>일요일/공휴일</option>
              </select>
            </div>

            <div class="col-md-6">
              <label class="form-label font-bold" style="font-size:13px; color:#334155;">처방 조제 매출 (원) *</label>
              <input type="number" class="form-control font-bold text-primary" id="dlform-dispensingRevenue" value="${logObj.dispensingRevenue}" required min="0" oninput="PharmacySettlementModule.recalcDailyTotal()">
            </div>
            <div class="col-md-6">
              <label class="form-label font-bold" style="font-size:13px; color:#334155;">매장 일반 매출 (원) *</label>
              <input type="number" class="form-control font-bold text-primary" id="dlform-posRevenue" value="${logObj.posRevenue}" required min="0" oninput="PharmacySettlementModule.recalcDailyTotal()">
            </div>

            <div class="col-md-4">
              <label class="form-label font-bold" style="font-size:13px; color:#334155;">일 총 매출액 (자동연산)</label>
              <input type="number" class="form-control font-bold text-success" id="dlform-totalRevenue" value="${logObj.totalRevenue}" readonly style="background:#f0fdf4;">
            </div>
            <div class="col-md-4">
              <label class="form-label font-bold" style="font-size:13px; color:#334155;">카드 결제 수입액 (원)</label>
              <input type="number" class="form-control font-bold" id="dlform-cardPay" value="${logObj.cardPay}" min="0">
            </div>
            <div class="col-md-4">
              <label class="form-label font-bold" style="font-size:13px; color:#334155;">현금 결제 수입액 (원)</label>
              <input type="number" class="form-control font-bold text-success" id="dlform-cashPay" value="${logObj.cashPay}" min="0">
            </div>

            <div class="col-md-6">
              <label class="form-label font-bold" style="font-size:13px; color:#334155;">일 소액지출 금액 (원)</label>
              <input type="number" class="form-control font-bold text-danger" id="dlform-dailyExpense" value="${logObj.dailyExpense}" min="0">
            </div>
            <div class="col-md-6">
              <label class="form-label font-bold" style="font-size:13px; color:#334155;">비고 및 특이사항</label>
              <input type="text" class="form-control" id="dlform-note" value="${logObj.note || ''}" placeholder="예: 광복절 휴일 운영, 의원 휴진 등">
            </div>
          </div>

          <div class="d-flex justify-content-end gap-2 mt-4 pt-2 border-top">
            <button type="button" class="btn btn-secondary font-bold" onclick="document.getElementById('ps-dailylog-modal').style.display='none'">취소</button>
            <button type="submit" class="btn btn-primary font-bold px-4">
              <i class="fas fa-save me-1"></i> 일일결산 저장 완료
            </button>
          </div>
        </form>
      </div>
    `;

    modal.style.display = 'flex';
  }

  function recalcDailyTotal() {
    const disp = Number(document.getElementById('dlform-dispensingRevenue').value) || 0;
    const pos = Number(document.getElementById('dlform-posRevenue').value) || 0;
    const tot = disp + pos;
    const totalElem = document.getElementById('dlform-totalRevenue');
    const cardElem = document.getElementById('dlform-cardPay');
    const cashElem = document.getElementById('dlform-cashPay');

    if (totalElem) totalElem.value = tot;
    if (cardElem && (!cardElem.value || Number(cardElem.value) === 0)) {
      cardElem.value = Math.round(tot * 0.85);
    }
    if (cashElem && (!cashElem.value || Number(cashElem.value) === 0)) {
      cashElem.value = tot - (Number(cardElem.value) || 0);
    }
  }

  function saveDailyLogSubmit(e) {
    e.preventDefault();
    const data = window.SheetsSync.getPharmacySettlement();
    if (!data.dailyLogs) data.dailyLogs = [];

    const dateVal = document.getElementById('dlform-date').value;
    const dayOfWeek = document.getElementById('dlform-dayOfWeek').value;
    const dispensingRevenue = Number(document.getElementById('dlform-dispensingRevenue').value) || 0;
    const posRevenue = Number(document.getElementById('dlform-posRevenue').value) || 0;
    const totalRevenue = dispensingRevenue + posRevenue;
    const cardPay = Number(document.getElementById('dlform-cardPay').value) || Math.round(totalRevenue * 0.85);
    const cashPay = Number(document.getElementById('dlform-cashPay').value) || (totalRevenue - cardPay);
    const dailyExpense = Number(document.getElementById('dlform-dailyExpense').value) || 0;
    const note = document.getElementById('dlform-note').value.trim();

    const newLogObj = {
      date: dateVal,
      dayOfWeek,
      dispensingRevenue,
      posRevenue,
      totalRevenue,
      cardPay,
      cashPay,
      dailyExpense,
      note: note || '정상 조제/일반매출 정산'
    };

    const existingIdx = data.dailyLogs.findIndex(l => l.date === dateVal);
    if (existingIdx >= 0) {
      data.dailyLogs[existingIdx] = newLogObj;
    } else {
      data.dailyLogs.push(newLogObj);
      data.dailyLogs.sort((a, b) => a.date.localeCompare(b.date));
    }

    window.SheetsSync.savePharmacySettlement(data);

    const modal = document.getElementById('ps-dailylog-modal');
    if (modal) modal.style.display = 'none';

    render('module-content');
    alert(`🎉 [${dateVal}] 일일 결산 내역이 성공적으로 저장 및 반영되었습니다!`);
  }

  function deleteDailyLog(dateVal) {
    const data = window.SheetsSync.getPharmacySettlement();
    if (!data.dailyLogs) return;

    const targetIdx = data.dailyLogs.findIndex(l => l.date === dateVal);
    if (targetIdx >= 0) {
      if (confirm(`🗑️ 정말로 [${dateVal}] 일일 결산 내역을 초기화 삭제하시겠습니까?`)) {
        data.dailyLogs[targetIdx] = {
          date: dateVal,
          dayOfWeek: data.dailyLogs[targetIdx].dayOfWeek,
          dispensingRevenue: 0,
          posRevenue: 0,
          totalRevenue: 0,
          cardPay: 0,
          cashPay: 0,
          dailyExpense: 0,
          note: '미입력 / 결산 대기'
        };
        window.SheetsSync.savePharmacySettlement(data);
        render('module-content');
        alert(`🗑️ [${dateVal}] 일일 결산 내역이 초기화되었습니다.`);
      }
    }
  }

  // --- 구글 시트 CSV 파일 불러오기 연동 ---

  function openImportModal() {
    let input = document.getElementById('ps-csv-file-input');
    if (!input) {
      input = document.createElement('input');
      input.type = 'file';
      input.id = 'ps-csv-file-input';
      input.accept = '.csv, .txt';
      input.style.display = 'none';
      document.body.appendChild(input);
      input.addEventListener('change', handleCSVImport);
    }
    input.click();
  }

  function handleCSVImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (evt) {
      try {
        const text = evt.target.result;
        const lines = text.split('\n');
        const pData = window.SheetsSync.getPharmacySettlement();

        lines.forEach(line => {
          const parts = line.split(',').map(s => s.replace(/"/g, '').trim());
          if (parts.length >= 2) {
            const keyName = parts[0];
            const numVal = Number(parts[parts.length - 1]);

            // 일일 결산 31일 일자별 행 파싱 (예: 2026-08-01, 토, 650000, 850000...)
            if (keyName && (keyName.startsWith('2026-') || keyName.match(/^\d{4}-\d{2}-\d{2}$/))) {
              const dispensingRev = Number(parts[2]) || 0;
              const posRev = Number(parts[3]) || 0;
              const totalRev = Number(parts[4]) || (dispensingRev + posRev);
              const cardPay = Number(parts[5]) || Math.round(totalRev * 0.85);
              const cashPay = Number(parts[6]) || (totalRev - cardPay);
              const dailyExp = Number(parts[7]) || 0;
              const noteStr = parts[8] || '구글 시트 일일 결산 연동';

              if (!pData.dailyLogs) pData.dailyLogs = [];
              const targetLog = pData.dailyLogs.find(l => l.date === keyName);
              if (targetLog) {
                targetLog.dispensingRevenue = dispensingRev;
                targetLog.posRevenue = posRev;
                targetLog.totalRevenue = totalRev;
                targetLog.cardPay = cardPay;
                targetLog.cashPay = cashPay;
                targetLog.dailyExpense = dailyExp;
                if (noteStr) targetLog.note = noteStr;
              }
            } else if (!isNaN(numVal) && numVal >= 0) {
              if (keyName.includes('조제료') || keyName.includes('dispensingFee')) pData.dispensingFee = numVal;
              else if (keyName.includes('일반매출') || keyName.includes('generalRevenue')) pData.generalRevenue = numVal;
              else if (keyName.includes('카드 수입') || keyName.includes('cardRevenue')) pData.cardRevenue = numVal;
              else if (keyName.includes('현금 수입') || keyName.includes('cashRevenue')) pData.cashRevenue = numVal;
              else if (keyName.includes('본인부담금') || keyName.includes('patientCopay')) pData.patientCopay = numVal;
              else if (keyName.includes('청구금') || keyName.includes('nhisClaim')) pData.nhisClaim = numVal;
              else if (keyName.includes('기타수입') || keyName.includes('otherIncome')) pData.otherIncome = numVal;
              else if (keyName.includes('임차료') || keyName.includes('rentExpense')) pData.rentExpense = numVal;
              else if (keyName.includes('관리비') || keyName.includes('maintExpense')) pData.maintExpense = numVal;
              else if (keyName.includes('4대보험') || keyName.includes('insurance4Cost')) pData.insurance4Cost = numVal;
              else if (keyName.includes('기장료') || keyName.includes('taxAccountantFee')) pData.taxAccountantFee = numVal;
              else if (keyName.includes('통신 수수료') || keyName.includes('posCardFee')) pData.posCardFee = numVal;
              else if (keyName.includes('대출 이자') || keyName.includes('loanInterest')) pData.loanInterest = numVal;
              else if (keyName.includes('원리금 상환액') || keyName.includes('loanPrincipal')) pData.loanPrincipal = numVal;
              else if (['다우약품', '산성호', '백제약품', '지오영'].some(k => keyName.includes(k))) {
                if (!pData.cashWholesale) pData.cashWholesale = {};
                pData.cashWholesale[keyName] = numVal;
              }
              else if (['대웅제약', '동화약품', '일양약품', '비타민하우스', 'GC녹십자'].some(k => keyName.includes(k))) {
                if (!pData.cardPharma) pData.cardPharma = {};
                pData.cardPharma[keyName] = numVal;
              }
            }
          }
        });

        window.SheetsSync.savePharmacySettlement(pData);
        render('module-content');
        alert(`🎉 구글 스프레드시트 파일(${file.name}) 데이터가 스마트약국 정산으로 연동 반영되었습니다!`);
      } catch (err) {
        alert('❌ 파일 읽기 중 오류가 발생했습니다. 구글 시트에서 다운로드한 CSV 파일 형식을 확인해 주세요.');
      }
    };
    reader.readAsText(file, 'UTF-8');
  }

  return {
    render,
    setSubTab,
    updateField,
    updateSubField,
    deleteSubField,
    openAddSubItemModal,
    saveSubItemSubmit,
    openDailyLogEditModal,
    saveDailyLogSubmit,
    deleteDailyLog,
    recalcDailyTotal,
    openImportModal
  };
})();
