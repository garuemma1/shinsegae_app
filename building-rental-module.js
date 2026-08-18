/**
 * 11. 삼남매아빠 부동산 임대업 대시보드 모듈 컨트롤러 (Building Rental Asset Engine v3.2 - 풀너비 반응형 완벽 고정)
 */
window.BuildingRentalModule = (function () {

  let activeSubTab = 'monthly'; // 'monthly' | 'yearly'
  let isBulkEditMode = false;
  let settlementMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  let selectedYear = String(new Date().getFullYear()); // 연도별 탭 전용 연도 선택 값
  let monthlySettlementData = [];
  let rentalChartInstances = {};

  const fmt = num => new Intl.NumberFormat('ko-KR').format(Math.round(num || 0));

  function formatInputCurrency(inputElem, idx, shareRate) {
    let value = inputElem.value.replace(/[^0-9]/g, '');
    if (value === '') inputElem.value = '0';
    else inputElem.value = new Intl.NumberFormat('ko-KR').format(parseInt(value, 10));
    if (idx !== undefined && shareRate !== undefined) {
      calcRealTimeProfit(idx, shareRate);
    }
  }

  function getRawNumber(valueStr) {
    if (!valueStr) return 0;
    return parseInt(valueStr.toString().replace(/,/g, ''), 10) || 0;
  }

  function calcRealTimeProfit(idx, shareRate) {
    const rInput = document.getElementById(`rent_input_${idx}`);
    const iInput = document.getElementById(`int_input_${idx}`);
    const targetElem = document.getElementById(`my_net_${idx}`);
    
    if (rInput && iInput && targetElem) {
      const r = getRawNumber(rInput.value);
      const i = getRawNumber(iInput.value);
      const myNet = Math.round((r - i) * (shareRate / 100));
      
      targetElem.innerHTML = `${fmt(myNet)} 원`;
      targetElem.style.color = myNet >= 0 ? '#059669' : '#dc2626';
    }
  }

  function moveMonth(offset) {
    let [year, month] = settlementMonth.split('-').map(Number);
    let date = new Date(year, month - 1 + offset, 1);
    settlementMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    isBulkEditMode = false;
    render('module-content');
  }

  function setSubTab(tab) {
    activeSubTab = tab;
    if (tab === 'yearly') isBulkEditMode = false;
    render('module-content');
  }

  function changeYearFilter(yearVal) {
    selectedYear = yearVal;
    render('module-content');
  }

  function render(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const currentUser = window.SheetsSync.getCurrentUser();
    if (!currentUser || currentUser.role !== '약국장') {
      container.innerHTML = `
        <div class="alert alert-danger p-4 text-center my-5" style="border-radius:16px;">
          <h4><i class="fas fa-lock"></i> 🔒 접근 권한 제한 영역</h4>
          <p class="mb-0">이곳은 <strong>약국장(건물주) 전용 보안 대시보드</strong>입니다.</p>
        </div>
      `;
      return;
    }

    const rData = window.SheetsSync.getBuildingRental() || { units: [], monthlyRecords: {} };
    if (!rData.monthlyRecords) rData.monthlyRecords = {};
    const units = rData.units || [];

    let totalTargetRent = 0;
    const calculatedUnits = units.map(u => {
      const shareRate = Number(u.mySharePercent) || (u.ownershipType === 'SOLE' ? 100 : (u.ownershipType === 'JOINT2' ? 50 : 25));
      totalTargetRent += Number(u.rent) || 0;
      return { ...u, shareRate };
    });

    let currentMonthRecords = rData.monthlyRecords[settlementMonth] || [];
    if (currentMonthRecords.length === 0 || currentMonthRecords.length !== units.length) {
      currentMonthRecords = calculatedUnits.map(u => ({
        id: u.id, buildingName: u.buildingName, unit: u.unit, tenantName: u.tenantName, endDate: u.endDate,
        shareRate: u.shareRate, ownerLabel: u.ownerLabel,
        targetDeposit: u.deposit || 0, actualDeposit: u.deposit || 0,
        targetRent: u.rent || 0, actualRent: u.rent || 0,
        targetInterest: u.mortgageInterest || 0, actualInterest: u.mortgageInterest || 0, memo: ''
      }));
    } else {
      currentMonthRecords = currentMonthRecords.map((rec, idx) => {
        const master = calculatedUnits.find(u => u.id === rec.id) || calculatedUnits[idx];
        return {
          ...rec, buildingName: master.buildingName, unit: master.unit, tenantName: master.tenantName, endDate: master.endDate,
          shareRate: master.shareRate, ownerLabel: master.ownerLabel, targetDeposit: master.deposit || 0,
          targetRent: master.rent || 0, targetInterest: master.mortgageInterest || 0
        };
      });
    }

    monthlySettlementData = currentMonthRecords;

    let actualTotalRent = 0, actualMyNet = 0;
    monthlySettlementData.forEach(r => {
      actualTotalRent += r.actualRent;
      actualMyNet += Math.round((r.actualRent - r.actualInterest) * (r.shareRate / 100));
    });

    const currentYearStr = settlementMonth.substring(0, 4);
    let ytdMyNetProfit = 0;
    Object.keys(rData.monthlyRecords).forEach(key => {
      if (key.startsWith(currentYearStr)) {
        rData.monthlyRecords[key].forEach(r => {
          ytdMyNetProfit += Math.round((r.actualRent - r.actualInterest) * (r.shareRate / 100));
        });
      }
    });
    if (ytdMyNetProfit === 0 && actualMyNet > 0) ytdMyNetProfit = actualMyNet;

    const calculateDDay = (endDateStr) => {
      if (!endDateStr) return { days: 999, label: '-' };
      const diffDays = Math.ceil((new Date(endDateStr).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays < 0) return { days: diffDays, label: `만료초과 (${Math.abs(diffDays)}일)` };
      return { days: diffDays, label: diffDays === 0 ? '오늘 만료' : `D-${diffDays}` };
    };

    // ==========================================
    // HTML 렌더링 시작 (직원할인대장 스타일 100% 풀너비 적용)
    // ==========================================
    let html = `
      <div style="width: 100%; margin: 0; padding: 0 10px; box-sizing: border-box;">
        <div class="module-header d-flex justify-content-between align-items-center flex-wrap gap-3 mb-4">
          <div>
            <h2 style="font-size:24px; font-weight:800; color:#0f172a; margin:0; letter-spacing:-0.5px;">
              <i class="fas fa-building text-success me-2"></i> 삼남매아빠 부동산 임대업 Asset ERP
            </h2>
            <p class="subtitle" style="font-size:14px; color:#64748b; margin:4px 0 0 0;">연/월별 수익 흐름과 상가 자산을 한눈에 통제하는 대표님 전용 종합 대시보드</p>
          </div>
          <div class="d-flex align-items-center gap-2">
            <button type="button" class="btn btn-success font-bold shadow-sm" onclick="BuildingRentalModule.openAddModal()" style="border-radius:12px; padding:10px 18px; font-size:14px;">
              <i class="fas fa-plus-circle me-1"></i> 신규 계약 마스터 등록
            </button>
          </div>
        </div>

        <!-- 📊 미니 요약 카드 -->
        <div class="mb-4" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:16px;">
          <div class="p-4" style="background:#ffffff; border:1px solid #e2e8f0; border-radius:18px;">
            <div style="font-size:13px; font-weight:700; color:#64748b; margin-bottom:8px;">[${settlementMonth}] 예상 총 월세 (마스터 기준)</div>
            <div style="font-size:24px; font-weight:800; color:#0f172a;">${fmt(totalTargetRent)} <span style="font-size:14px; font-weight:600; color:#94a3b8;">원</span></div>
          </div>
          <div class="p-4" style="background:linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); border:1px solid #bfdbfe; border-radius:18px;">
            <div style="font-size:13px; font-weight:800; color:#1e40af; margin-bottom:8px;">★ [${settlementMonth}] 실제 수납액 (정산 기준)</div>
            <div style="font-size:24px; font-weight:800; color:#1d4ed8;">${fmt(actualTotalRent)} <span style="font-size:14px; font-weight:600; color:#3b82f6;">원</span></div>
          </div>
          <div class="p-4" style="background:linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%); border:1px solid #bbf7d0; border-radius:18px;">
            <div style="font-size:13px; font-weight:800; color:#166534; margin-bottom:8px;">★ [${currentYearStr}년] 누적 내 지분 순수익</div>
            <div style="font-size:24px; font-weight:800; color:#15803d;">${fmt(ytdMyNetProfit)} <span style="font-size:14px; font-weight:600; color:#22c55e;">원 (올해)</span></div>
          </div>
        </div>

        <!-- 📈 상단 밸런스 차트 구역 -->
        <div class="row mb-4">
          <div class="col-12">
            <div class="card shadow-sm" style="border-radius:20px; border:1px solid #cbd5e1; overflow:hidden;">
              <div class="card-header" style="background:#ffffff; border-bottom:1px solid #f1f5f9; padding:16px 20px;">
                <h4 style="font-size:15px; font-weight:800; color:#0f172a; margin:0;"><i class="fas fa-chart-bar text-primary me-2"></i>수익 흐름 비교 분석 (좌: ${currentYearStr}년 월별 흐름 / 우: 연도별 총합 비교)</h4>
              </div>
              <div class="card-body p-3" style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px;">
                
                <div style="flex:1; min-width:280px; display:flex; flex-direction:column; align-items:center; justify-content:center; border-right:1px dashed #cbd5e1; padding-right:8px;">
                  <span style="font-size:12px; font-weight:800; color:#2563eb; margin-bottom:6px; white-space:nowrap;">[ ${currentYearStr}년 ] 월별 내 지분 순수익 흐름</span>
                  <div style="position:relative; height:220px; width:100%;"><canvas id="yearlyTrendCanvas"></canvas></div>
                </div>

                <div style="flex:1; min-width:280px; display:flex; flex-direction:column; align-items:center; justify-content:center; padding-left:8px;">
                  <span style="font-size:12px; font-weight:800; color:#059669; margin-bottom:6px; white-space:nowrap;">[ 연도별 ] 내 지분 순수익 흐름 (총합 비교)</span>
                  <div style="position:relative; height:220px; width:100%;"><canvas id="yearlyAggregateCanvas"></canvas></div>
                </div>

              </div>
            </div>
          </div>
        </div>
        
        <!-- 도넛 차트 영역 -->
        <div class="row mb-4">
          <div class="col-12">
            <div class="card shadow-sm" style="border-radius:20px; border:1px solid #cbd5e1; overflow:hidden;">
              <div class="card-header" style="background:#ffffff; border-bottom:1px solid #f1f5f9; padding:16px 20px;">
                <h4 style="font-size:15px; font-weight:800; color:#0f172a; margin:0;"><i class="fas fa-chart-pie text-success me-2"></i>수익 기여도 포트폴리오 (좌: 이번달 / 우: 올해누적)</h4>
              </div>
              <div class="card-body p-3" style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px;">
                
                <div style="flex:1; min-width:280px; display:flex; flex-direction:column; align-items:center; justify-content:center; border-right:1px dashed #cbd5e1; padding-right:8px;">
                  <span style="font-size:12px; font-weight:800; color:#15803d; margin-bottom:6px; white-space:nowrap;">[ ${settlementMonth} ] 이번달</span>
                  <div style="position:relative; height:180px; width:100%;"><canvas id="monthlyDonutCanvas"></canvas></div>
                </div>
                
                <div style="flex:1; min-width:280px; display:flex; flex-direction:column; align-items:center; justify-content:center; padding-left:8px;">
                  <span style="font-size:12px; font-weight:800; color:#b45309; margin-bottom:6px; white-space:nowrap;">[ ${currentYearStr}년 ] 올해 누적</span>
                  <div style="position:relative; height:180px; width:100%;"><canvas id="yearlyDonutCanvas"></canvas></div>
                </div>

              </div>
            </div>
          </div>
        </div>

        <!-- 🗂️ 장부 이원화 탭 -->
        <div class="d-flex gap-2 border-bottom pb-3 mb-4">
          <button type="button" class="btn ${activeSubTab === 'monthly' ? 'btn-primary font-bold' : 'btn-outline-secondary font-bold'}" onclick="BuildingRentalModule.setSubTab('monthly')" style="border-radius:12px; padding:10px 24px; font-size:15px;">
            <i class="fas fa-calendar-check me-1"></i> 1. 월별 상세 정산 장부
          </button>
          <button type="button" class="btn ${activeSubTab === 'yearly' ? 'btn-success font-bold' : 'btn-outline-secondary font-bold'}" onclick="BuildingRentalModule.setSubTab('yearly')" style="border-radius:12px; padding:10px 24px; font-size:15px;">
            <i class="fas fa-coins me-1"></i> 2. 연도별 누적 수익 대장
          </button>
        </div>
    `;

    // =========================================================
    // 📅 [탭 1] 월별 상세 정산 장부 (직원할인대장 스타일 100% 풀너비 적용)
    // =========================================================
    if (activeSubTab === 'monthly') {
      let sumDeposit = 0, sumRent = 0, sumInterest = 0, sumNet = 0;

      html += `
          <div class="card mb-4 shadow-sm" style="border-radius:16px; border:1px solid #cbd5e1; background:#ffffff; width: 100%;">
            <div class="card-body p-3" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
              <div style="display:flex; align-items:center; gap:10px;">
                <div style="width:36px; height:36px; border-radius:10px; background:#eff6ff; color:#2563eb; display:flex; justify-content:center; align-items:center; font-size:15px;">
                  <i class="fas fa-calendar-alt"></i>
                </div>
                <div>
                  <div style="font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase;">조회 기준 월</div>
                  <div style="font-size:19px; font-weight:800; color:#0f172a; font-family:'Outfit', sans-serif;">
                    ${settlementMonth.split('-')[0]}년 ${settlementMonth.split('-')[1]}월
                  </div>
                </div>
              </div>
              <div style="display:flex; align-items:center; gap:6px;">
                <button type="button" class="btn btn-outline-secondary font-bold shadow-sm" onclick="BuildingRentalModule.moveMonth(-1)" style="border-radius:8px; padding:6px 14px; font-size:12.5px; background:#f8fafc;">
                  <i class="fas fa-chevron-left me-1"></i> 이전 달
                </button>
                <button type="button" class="btn btn-primary font-bold shadow-sm" onclick="BuildingRentalModule.moveMonth(1)" style="border-radius:8px; padding:6px 14px; font-size:12.5px;">
                  다음 달 <i class="fas fa-chevron-right ms-1"></i>
                </button>
              </div>
            </div>
          </div>

          <div class="card mb-5 shadow-sm" style="border-radius:20px; border:2px solid #bfdbfe; overflow:hidden; width: 100%;">
            <div class="card-header d-flex justify-content-between align-items-center flex-wrap gap-3" style="background:#eff6ff; padding:16px 24px; border-bottom:1px solid #bfdbfe;">
              <h3 style="font-size:16px; font-weight:800; margin:0; color:#1e40af;"><i class="fas fa-list-alt me-2"></i> ${settlementMonth} 상세 정산 내역</h3>
              <div class="form-check form-switch" style="display:flex; align-items:center; gap:8px; margin:0;">
                <input class="form-check-input" type="checkbox" id="bulkEditSwitch" style="width:44px; height:24px; cursor:pointer;" 
                       ${isBulkEditMode ? 'checked' : ''} onchange="BuildingRentalModule.toggleBulkEditMode(this.checked)">
                <label class="form-check-label font-bold" for="bulkEditSwitch" style="color:${isBulkEditMode ? '#dc2626' : '#64748b'}; cursor:pointer; font-size:14px; margin-top:2px;">
                  ${isBulkEditMode ? '⚡ 일괄 수정 모드 켜짐' : '일괄 수정 켜기'}
                </label>
              </div>
            </div>

            <div class="card-body p-0">
              <div style="width:100%; overflow-x:auto; -webkit-overflow-scrolling:touch;">
                <table style="width:100%; min-width:950px; border-collapse:collapse; text-align:left; font-size:13.5px; white-space:nowrap;">
                  <thead style="background:#ffffff; color:#475569; border-bottom:2px solid #cbd5e1;">
                    <tr>
                      <th style="padding:14px 20px; width:22%;">상호 / 호실</th>
                      <th style="padding:14px 15px; width:10%;">지분율</th>
                      <th style="text-align:right; padding:14px 20px; color:#0f172a; width:14%;">보증금</th>
                      <th style="text-align:right; padding:14px 20px; color:#1d4ed8; width:14%;">월세 수납</th>
                      <th style="text-align:right; padding:14px 20px; color:#dc2626; width:14%;">대출 이자</th>
                      <th style="text-align:right; padding:14px 20px; background:#ecfdf5; color:#065f46; width:16%;">★ 내지분 순수익</th>
                      <th style="text-align:center; padding:14px 10px; width:8%;">만료 D-Day</th>
                      <th style="text-align:center; padding:14px 10px; width:6%;">관리</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${monthlySettlementData.map((rec, idx) => {
                      const dday = calculateDDay(rec.endDate);
                      const net = rec.actualRent - rec.actualInterest;
                      const myNet = Math.round(net * (rec.shareRate / 100));
                      
                      sumDeposit += rec.actualDeposit;
                      sumRent += rec.actualRent;
                      sumInterest += rec.actualInterest;
                      sumNet += myNet;

                      return `
                        <tr style="border-bottom:1px solid #f1f5f9; background:${isBulkEditMode ? '#fffbfa' : '#ffffff'}; transition:background 0.2s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                          <td style="padding:14px 20px;">
                            <div style="font-size:14.5px; font-weight:800; color:#0f172a;">${rec.buildingName}</div>
                            <div style="font-size:12px; color:#64748b; margin-top:2px;">${rec.unit}</div>
                          </td>
                          <td style="padding:14px 15px;">
                            <span style="display:inline-block; background:${rec.shareRate===100?'#dcfce7':'#dbeafe'}; color:${rec.shareRate===100?'#166534':'#1e40af'}; font-size:11px; font-weight:800; padding:4px 8px; border-radius:6px;">${rec.ownerLabel}</span>
                          </td>
                          <td style="text-align:right; padding:14px 20px;">
                            ${isBulkEditMode ? `<input type="text" class="form-control text-end font-bold" style="border-radius:8px;" id="dep_input_${idx}" value="${fmt(rec.actualDeposit)}" oninput="BuildingRentalModule.formatInputCurrency(this, ${idx}, ${rec.shareRate})">` : `<strong>${fmt(rec.actualDeposit)}</strong>`}
                          </td>
                          <td style="text-align:right; padding:14px 20px;">
                            ${isBulkEditMode ? `<input type="text" class="form-control text-end font-bold text-primary" style="border-color:#93c5fd; border-radius:8px;" id="rent_input_${idx}" value="${fmt(rec.actualRent)}" oninput="BuildingRentalModule.formatInputCurrency(this, ${idx}, ${rec.shareRate})">` : `<strong style="color:#1d4ed8;">${fmt(rec.actualRent)}</strong>`}
                          </td>
                          <td style="text-align:right; padding:14px 20px;">
                            ${isBulkEditMode ? `<input type="text" class="form-control text-end font-bold text-danger" style="border-color:#fca5a5; border-radius:8px;" id="int_input_${idx}" value="${fmt(rec.actualInterest)}" oninput="BuildingRentalModule.formatInputCurrency(this, ${idx}, ${rec.shareRate})">` : `<strong style="color:#dc2626;">${fmt(rec.actualInterest)}</strong>`}
                          </td>
                          <td style="text-align:right; padding:14px 20px; background:#f0fdf4;">
                            <strong id="my_net_${idx}" style="font-size:16px; font-weight:900; color:${myNet>=0?'#059669':'#dc2626'}; font-family:'Outfit',sans-serif;">${fmt(myNet)} 원</strong>
                          </td>
                          <td style="text-align:center; padding:14px 10px;">
                            <span class="badge ${dday.days<=90?'bg-danger':'bg-secondary'}" style="font-size:11px;">${dday.label}</span>
                          </td>
                          <td style="text-align:center; padding:14px 10px;">
                            <button onclick="BuildingRentalModule.openEditModal('${rec.id}')" class="btn btn-sm btn-light font-bold" style="font-size:11px; border:1px solid #cbd5e1; border-radius:8px;">수정</button>
                          </td>
                        </tr>
                      `;
                    }).join('')}
                  </tbody>
                  <tfoot style="background:linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color:#ffffff;">
                    <tr>
                      <td colspan="2" style="padding:16px 20px; font-weight:900; font-size:15px; letter-spacing:1px;">💰 [ ${settlementMonth} ] 총 합계</td>
                      <td style="text-align:right; padding:16px 20px; font-weight:800; font-size:15px;">${fmt(sumDeposit)}</td>
                      <td style="text-align:right; padding:16px 20px; font-weight:800; font-size:15px; color:#93c5fd;">${fmt(sumRent)}</td>
                      <td style="text-align:right; padding:16px 20px; font-weight:800; font-size:15px; color:#fca5a5;">${fmt(sumInterest)}</td>
                      <td style="text-align:right; padding:16px 20px; font-weight:900; font-size:18px; color:#6ee7b7;">${fmt(sumNet)} 원</td>
                      <td colspan="2"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              
              ${isBulkEditMode ? `
                <div class="p-4" style="background:#fef2f2; border-top:2px solid #fecaca; text-align:right;">
                  <span class="me-3 font-bold text-danger">※ 수정 후 반드시 저장 버튼을 눌러야 반영됩니다.</span>
                  <button type="button" class="btn btn-danger font-bold px-4 py-2" onclick="BuildingRentalModule.saveMonthlySettlement()" style="border-radius:12px; font-size:16px;">
                    <i class="fas fa-save me-2"></i> [ ${settlementMonth} ] 장부 저장하기
                  </button>
                </div>
              ` : ''}
            </div>
          </div>
      `;
    } 
    // =========================================================
    // 📊 [탭 2] 연도별 누적 수익 대장 (직원할인대장 스타일 100% 풀너비 적용)
    // =========================================================
    else if (activeSubTab === 'yearly') {
      let yearlyAgg = {};
      
      Object.keys(rData.monthlyRecords).forEach(key => {
        if (key.startsWith(selectedYear)) {
          rData.monthlyRecords[key].forEach(r => {
            if (!yearlyAgg[r.id]) {
              yearlyAgg[r.id] = { ...r, sumRent: 0, sumInterest: 0, sumNet: 0 };
            }
            yearlyAgg[r.id].sumRent += r.actualRent;
            yearlyAgg[r.id].sumInterest += r.actualInterest;
            yearlyAgg[r.id].sumNet += Math.round((r.actualRent - r.actualInterest) * (r.shareRate / 100));
          });
        }
      });

      const yearlyArray = Object.values(yearlyAgg);
      let totalYRent = 0, totalYInterest = 0, totalYNet = 0;

      html += `
          <div class="card mb-4 shadow-sm" style="border-radius:16px; border:1px solid #cbd5e1; background:#ffffff; width: 100%;">
            <div class="card-body p-3" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
              <div style="display:flex; align-items:center; gap:10px;">
                <div style="width:36px; height:36px; border-radius:10px; background:#f0fdf4; color:#16a34a; display:flex; justify-content:center; align-items:center; font-size:15px;">
                  <i class="fas fa-calendar-check"></i>
                </div>
                <div>
                  <div style="font-size:11px; font-weight:700; color:#64748b; text-transform:uppercase;">조회 기준 연도</div>
                  <div style="font-size:19px; font-weight:800; color:#0f172a; font-family:'Outfit', sans-serif;">
                    ${selectedYear}년 누적 장부
                  </div>
                </div>
              </div>
              <div>
                <select class="form-select font-bold shadow-sm" style="width:140px; border-radius:8px; border:1.5px solid #cbd5e1; font-size:13.5px; background:#f8fafc; cursor:pointer;" 
                        onchange="BuildingRentalModule.changeYearFilter(this.value)">
                  ${(() => {
                    const currentY = new Date().getFullYear();
                    let options = '';
                    for (let y = currentY + 5; y >= currentY - 5; y--) {
                      options += `<option value="${y}" ${String(selectedYear) === String(y) ? 'selected' : ''}>${y}년</option>`;
                    }
                    return options;
                  })()}
                </select>
              </div>
            </div>
          </div> 

          <div class="card mb-5 shadow-sm" style="border-radius:20px; border:2px solid #bbf7d0; overflow:hidden; width: 100%;">
            <div class="card-header" style="background:#f0fdf4; padding:16px 24px; border-bottom:1px solid #bbf7d0;">
              <h3 style="font-size:16px; font-weight:800; margin:0; color:#15803d;"><i class="fas fa-coins me-2"></i> ${selectedYear}년 전체 누적 수익 대장 (1월~현재)</h3>
            </div>
            <div class="card-body p-0">
              <div style="width:100%; overflow-x:auto; -webkit-overflow-scrolling:touch;">
                <table style="width:100%; min-width:850px; border-collapse:collapse; text-align:left; font-size:13.5px; white-space:nowrap;">
                  <thead style="background:#ffffff; color:#475569; border-bottom:2px solid #cbd5e1;">
                    <tr>
                      <th style="padding:14px 20px; width:25%;">상호 / 호실</th>
                      <th style="padding:14px 15px; width:12%;">지분율</th>
                      <th style="text-align:right; padding:14px 20px; color:#1d4ed8; width:20%;">올해 누적 수납 월세</th>
                      <th style="text-align:right; padding:14px 20px; color:#dc2626; width:20%;">올해 누적 납부 이자</th>
                      <th style="text-align:right; padding:14px 20px; background:#ecfdf5; color:#065f46; width:23%;">★ 올해 누적 내지분 수익</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${yearlyArray.map(rec => {
                      totalYRent += rec.sumRent; totalYInterest += rec.sumInterest; totalYNet += rec.sumNet;
                      return `
                        <tr style="border-bottom:1px solid #f1f5f9; background:#ffffff;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                          <td style="padding:14px 20px;">
                            <div style="font-size:14.5px; font-weight:800; color:#0f172a;">${rec.buildingName}</div>
                            <div style="font-size:12px; color:#64748b; margin-top:2px;">${rec.unit}</div>
                          </td>
                          <td style="padding:14px 15px;">
                            <span style="display:inline-block; background:${rec.shareRate===100?'#dcfce7':'#dbeafe'}; color:${rec.shareRate===100?'#166534':'#1e40af'}; font-size:11px; font-weight:800; padding:4px 8px; border-radius:6px;">${rec.ownerLabel}</span>
                          </td>
                          <td style="text-align:right; padding:14px 20px; font-weight:800; color:#1d4ed8; font-size:15px;">${fmt(rec.sumRent)}</td>
                          <td style="text-align:right; padding:14px 20px; font-weight:800; color:#dc2626; font-size:15px;">${fmt(rec.sumInterest)}</td>
                          <td style="text-align:right; padding:14px 20px; font-weight:900; font-size:16px; color:#059669; background:#f0fdf4;">${fmt(rec.sumNet)} 원</td>
                        </tr>
                      `;
                    }).join('')}
                    ${yearlyArray.length === 0 ? `<tr><td colspan="5" class="text-center p-5 text-muted">${selectedYear}년에 입력된 정산 데이터가 없습니다.</td></tr>` : ''}
                  </tbody>
                  <tfoot style="background:linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color:#ffffff; border-top:2px solid #334155;">
                    <tr>
                      <td colspan="2" style="padding:18px 20px; font-weight:800; font-size:15px; letter-spacing:-0.3px;">
                        <i class="fas fa-trophy text-warning me-2"></i> [ ${selectedYear}년 ] 연간 총 누적 합계
                      </td>
                      <td style="text-align:right; padding:18px 20px; font-weight:800; font-size:16px; color:#93c5fd; font-family:'Outfit', sans-serif;">
                        ${fmt(totalYRent)}
                      </td>
                      <td style="text-align:right; padding:18px 20px; font-weight:800; font-size:16px; color:#fca5a5; font-family:'Outfit', sans-serif;">
                        ${fmt(totalYInterest)}
                      </td>
                      <td style="text-align:right; padding:18px 20px; font-weight:900; font-size:18px; color:#34d399; font-family:'Outfit', sans-serif; background:rgba(52,211,153,0.08);">
                        ${fmt(totalYNet)} <span style="font-size:13px; font-weight:700;">원</span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
      `;
    }

    // 최상위 박스 닫기 및 CRUD 모달창
    html += `
      </div>
      <div id="property-crud-modal" class="modal-overlay" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(15,23,42,0.7); z-index:999999; justify-content:center; align-items:center;">
        <div id="property-modal-content"></div>
      </div>
    `;

    container.innerHTML = html;

    setTimeout(() => {
      initRentalCharts(rData, monthlySettlementData, currentYearStr);
    }, 100);
  }

  // =====================================================================
  // ★ 차트 (Bar x 2, Donut x 2) - 충돌 방지 및 완전 초기화 버전
  // =====================================================================
  function initRentalCharts(rData, currentMonthData, yearStr) {
    if (typeof Chart === 'undefined') return;
    const fmt2 = v => Math.round((v || 0) / 10000);

    Object.keys(rentalChartInstances).forEach(key => {
      if (rentalChartInstances[key]) {
        rentalChartInstances[key].destroy();
        rentalChartInstances[key] = null;
      }
    });

    const yearlyTrendCtx = document.getElementById('yearlyTrendCanvas');
    if (yearlyTrendCtx) {
      const labels = [], trendData = [];
      for (let i = 1; i <= 12; i++) {
        labels.push(`${i}월`);
        const mKey = `${yearStr}-${String(i).padStart(2, '0')}`;
        let monthSum = 0;
        (rData.monthlyRecords[mKey] || []).forEach(r => {
          monthSum += Math.round((r.actualRent - r.actualInterest) * (r.shareRate / 100));
        });
        trendData.push(fmt2(monthSum));
      }
      rentalChartInstances.yearlyTrend = new Chart(yearlyTrendCtx, {
        type: 'bar',
        data: { labels, datasets: [{ label: '월별 순수익(만원)', data: trendData, backgroundColor: '#3b82f6', borderRadius: 4 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
      });
    }

    const yearlyAggregateCtx = document.getElementById('yearlyAggregateCanvas');
    if (yearlyAggregateCtx) {
      const aggYears = ['2024년', '2025년', '2026년'];
      const aggData = aggYears.map(yLabel => {
        const yNum = yLabel.replace('년', '');
        let ySum = 0;
        Object.keys(rData.monthlyRecords).forEach(key => {
          if (key.startsWith(yNum)) {
            rData.monthlyRecords[key].forEach(r => {
              ySum += Math.round((r.actualRent - r.actualInterest) * (r.shareRate / 100));
            });
          }
        });
        return fmt2(ySum);
      });

      rentalChartInstances.yearlyAggregate = new Chart(yearlyAggregateCtx, {
        type: 'bar',
        data: { labels: aggYears, datasets: [{ label: '연도별 순수익(만원)', data: aggData, backgroundColor: '#059669', borderRadius: 4 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
      });
    }

    const monthlyDonutCtx = document.getElementById('monthlyDonutCanvas');
    if (monthlyDonutCtx) {
      const posUnits = currentMonthData.filter(u => (u.actualRent - u.actualInterest) > 0);
      rentalChartInstances.monthlyDonut = new Chart(monthlyDonutCtx, {
        type: 'doughnut',
        data: {
          labels: posUnits.map(u => u.buildingName.substring(0, 6)),
          datasets: [{ data: posUnits.map(u => fmt2(Math.round((u.actualRent - u.actualInterest) * (u.shareRate / 100)))), backgroundColor: ['#10b981','#3b82f6','#f59e0b','#ef4444','#8b5cf6','#06b6d4'] }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { display: false } } }
      });
    }

    const yearlyDonutCtx = document.getElementById('yearlyDonutCanvas');
    if (yearlyDonutCtx) {
      const ytdMap = {};
      Object.keys(rData.monthlyRecords).forEach(key => {
        if (key.startsWith(yearStr)) {
          rData.monthlyRecords[key].forEach(r => {
            if (!ytdMap[r.id]) ytdMap[r.id] = { name: r.buildingName, net: 0 };
            ytdMap[r.id].net += Math.round((r.actualRent - r.actualInterest) * (r.shareRate / 100));
          });
        }
      });
      const ytdArray = Object.values(ytdMap).filter(u => u.net > 0);
      rentalChartInstances.yearlyDonut = new Chart(yearlyDonutCtx, {
        type: 'doughnut',
        data: {
          labels: ytdArray.map(u => u.name.substring(0, 6)),
          datasets: [{ data: ytdArray.map(u => fmt2(u.net)), backgroundColor: ['#8b5cf6','#f59e0b','#3b82f6','#10b981','#ef4444','#06b6d4'] }]
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '65%', plugins: { legend: { display: false } } }
      });
    }
  }

  function toggleBulkEditMode(isOn) { isBulkEditMode = isOn; render('module-content'); }

  function saveMonthlySettlement() {
    const rData = window.SheetsSync.getBuildingRental() || { units: [], monthlyRecords: {} };
    if (!rData.monthlyRecords) rData.monthlyRecords = {};
    monthlySettlementData.forEach((rec, idx) => {
      const dIn = document.getElementById(`dep_input_${idx}`), rIn = document.getElementById(`rent_input_${idx}`), iIn = document.getElementById(`int_input_${idx}`);
      if (dIn) rec.actualDeposit = getRawNumber(dIn.value);
      if (rIn) rec.actualRent = getRawNumber(rIn.value);
      if (iIn) rec.actualInterest = getRawNumber(iIn.value);
      if (rec.actualDeposit !== rec.targetDeposit) {
        rec.targetDeposit = rec.actualDeposit;
        const masterUnit = rData.units.find(u => u.id === rec.id);
        if (masterUnit) masterUnit.deposit = rec.actualDeposit;
      }
    });
    rData.monthlyRecords[settlementMonth] = monthlySettlementData;
    window.SheetsSync.saveBuildingRental(rData);
    isBulkEditMode = false;
    alert(`🎉 [${settlementMonth}] 정산 장부가 안전하게 저장되었습니다!`);
    render('module-content');
  }

  function openAddModal() { renderPropertyModal(null); }
  function openEditModal(unitId) {
    const rData = window.SheetsSync.getBuildingRental();
    renderPropertyModal((rData.units || []).find(u => u.id === unitId));
  }

  function renderPropertyModal(target = null) {
    const isEdit = target !== null;
    const u = target || { id: `prop_${Date.now()}`, buildingName: '', unit: '', ownershipType: 'SOLE', mySharePercent: 100, ownerLabel: '단독 (100%)', tenantName: '', deposit: 0, rent: 0, mortgageInterest: 0, startDate: new Date().toISOString().split('T')[0], endDate: new Date().toISOString().split('T')[0] };
    const content = document.getElementById('property-modal-content');
    
    content.innerHTML = `
      <div class="modal-card shadow-lg" style="background:#fff; border-radius:24px; max-width:700px; width:95%; padding:32px; position:relative; max-height:92vh; overflow-y:auto;">
        <button type="button" onclick="document.getElementById('property-crud-modal').style.display='none'" style="position:absolute; top:24px; right:28px; font-size:24px; background:#f1f5f9; width:40px; height:40px; border-radius:50%; border:none; color:#64748b; cursor:pointer;"><i class="fas fa-times"></i></button>
        <h3 style="font-size:20px; font-weight:800; margin-bottom:24px;">${isEdit ? '계약 원본 수정' : '신규 계약 등록'}</h3>
        <form onsubmit="BuildingRentalModule.savePropertySubmit(event, '${u.id}', ${!isEdit})">
          <div class="row g-3 mb-4">
            <div class="col-md-6"><label class="form-label font-bold">건물명 *</label><input type="text" id="pf-bName" class="form-control" value="${u.buildingName}" required></div>
            <div class="col-md-6"><label class="form-label font-bold">호실 *</label><input type="text" id="pf-unit" class="form-control" value="${u.unit}" required></div>
            <div class="col-md-6">
              <label class="form-label font-bold">소유 형태 *</label>
              <select id="pf-own" class="form-select" onchange="BuildingRentalModule.onOwnershipChange(this.value)">
                <option value="SOLE" ${u.ownershipType==='SOLE'?'selected':''}>단독(100%)</option><option value="JOINT2" ${u.ownershipType==='JOINT2'?'selected':''}>동업(50%)</option><option value="JOINT4" ${u.ownershipType==='JOINT4'?'selected':''}>동업(25%)</option>
              </select>
            </div>
            <div class="col-md-6"><label class="form-label font-bold">내 지분(%) *</label><input type="number" id="pf-share" class="form-control" value="${u.mySharePercent}" required></div>
            <div class="col-md-6"><label class="form-label font-bold">임차인 *</label><input type="text" id="pf-tenant" class="form-control" value="${u.tenantName}" required></div>
            <div class="col-md-6"><label class="form-label font-bold">보증금 *</label><input type="text" id="pf-dep" class="form-control" value="${fmt(u.deposit)}" oninput="BuildingRentalModule.formatInputCurrency(this)" required></div>
            <div class="col-md-6"><label class="form-label font-bold">월세 *</label><input type="text" id="pf-rent" class="form-control text-primary" value="${fmt(u.rent)}" oninput="BuildingRentalModule.formatInputCurrency(this)" required></div>
            <div class="col-md-6"><label class="form-label font-bold">이자</label><input type="text" id="pf-int" class="form-control text-danger" value="${fmt(u.mortgageInterest)}" oninput="BuildingRentalModule.formatInputCurrency(this)"></div>
            <div class="col-md-6"><label class="form-label font-bold">시작일</label><input type="date" id="pf-start" class="form-control" value="${u.startDate}"></div>
            <div class="col-md-6"><label class="form-label font-bold">만료일 *</label><input type="date" id="pf-end" class="form-control" value="${u.endDate}" required></div>
          </div>
          <div class="d-flex justify-content-between border-top pt-4">
            ${isEdit ? `<button type="button" class="btn btn-outline-danger" onclick="BuildingRentalModule.deleteProperty('${u.id}')">삭제</button>` : '<div></div>'}
            <div>
              <button type="button" class="btn btn-light" onclick="document.getElementById('property-crud-modal').style.display='none'">취소</button>
              <button type="submit" class="btn btn-primary">저장</button>
            </div>
          </div>
        </form>
      </div>
    `;
    document.getElementById('property-crud-modal').style.display = 'flex';
  }

  function onOwnershipChange(val) {
    const i = document.getElementById('pf-share');
    if (val === 'SOLE') i.value = 100; else if (val === 'JOINT2') i.value = 50; else if (val === 'JOINT4') i.value = 25;
  }

  function savePropertySubmit(e, id, isNew) {
    e.preventDefault();
    const rData = window.SheetsSync.getBuildingRental() || { units: [] };
    const share = Number(document.getElementById('pf-share').value) || 100;
    const newObj = {
      id, buildingName: document.getElementById('pf-bName').value, unit: document.getElementById('pf-unit').value,
      ownershipType: document.getElementById('pf-own').value, mySharePercent: share, ownerLabel: share === 100 ? '단독(100%)' : `동업(${share}%)`,
      tenantName: document.getElementById('pf-tenant').value, deposit: getRawNumber(document.getElementById('pf-dep').value),
      rent: getRawNumber(document.getElementById('pf-rent').value), mortgageInterest: getRawNumber(document.getElementById('pf-int').value),
      startDate: document.getElementById('pf-start').value, endDate: document.getElementById('pf-end').value
    };
    if (isNew) rData.units.push(newObj);
    else { const idx = rData.units.findIndex(u => u.id === id); if (idx !== -1) rData.units[idx] = newObj; }
    window.SheetsSync.saveBuildingRental(rData);
    document.getElementById('property-crud-modal').style.display = 'none';
    render('module-content');
  }

  function deleteProperty(id) {
    if (!confirm('정말로 이 마스터 계약을 삭제하시겠습니까?')) return;
    if (window.SheetsSync && typeof window.SheetsSync.addDeletedId === 'function') {
      window.SheetsSync.addDeletedId(id);
    }
    const rData = window.SheetsSync.getBuildingRental();
    rData.units = (rData.units || []).filter(u => u.id !== id);
    window.SheetsSync.saveBuildingRental(rData);
    document.getElementById('property-crud-modal').style.display = 'none';
    render('module-content');
  }

  return { render, moveMonth, setSubTab, changeYearFilter, toggleBulkEditMode, saveMonthlySettlement, formatInputCurrency, openAddModal, openEditModal, savePropertySubmit, deleteProperty, onOwnershipChange };
})();