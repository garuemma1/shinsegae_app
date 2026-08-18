/**
 * 직원할인구매대장 모듈 컨트롤러 (Staff Discount Purchase Log Module)
 * 1초 원터치 검수 및 약국장 입금정산 완료 + 근무약사 셀프 검수 방지 교차검증 + 천원단위 콤마 서식 + 탭 배치 최적화
 */
window.DiscountPurchaseModule = (function () {

  let currentTab = 'individual'; // 1차 기본 탭: 개별 기록
  let searchQuery = '';
  let discountBarChartInstance = null;
  let discountDonutChartInstance = null;

  function render(containerId) {
    const container = document.getElementById(containerId || 'module-content');
    if (!container) return;

    try {
      const data = window.SheetsSync.getData();
      const purchases = data.discountPurchases || [];
      const employees = data.employees || [];

      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;
      const stats = calculatePurchaseStats(purchases, currentYear, currentMonth);

      const html = `
        <div class="module-header flex justify-between items-center mb-4">
          <div>
            <h2 style="font-weight: 800; color: #0f172a; letter-spacing: -0.5px;">🛍️ 직원할인구매대장</h2>
            <p class="subtitle" style="color: #64748b; margin-top: 4px;">약국 내 일반의약품, 건강기능식품 및 외용제 직원 할인 구매 내역 관리 및 월별 정산 대장</p>
          </div>
          <button type="button" class="btn btn-primary shadow-sm" onclick="DiscountPurchaseModule.openAddModal()" style="font-size: 15px; font-weight: 700; border-radius: 10px; padding: 10px 20px; transition: all 0.2s;">
            <i class="fas fa-plus me-1"></i> + 구매 신청 / 등록
          </button>
        </div>

        <!-- 상단 4대 KPI 요약 통계 -->
        <div class="kpi-grid my-4" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; clear: both;">
          <div class="kpi-card" style="background:#ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.02);">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
              <span style="font-size: 13.5px; font-weight: 700; color: #64748b;">당월 총 구매 건수</span>
              <div style="width: 36px; height: 36px; border-radius: 10px; background: #eff6ff; color: #3b82f6; display: flex; align-items: center; justify-content: center; font-size:16px;"><i class="fas fa-shopping-bag"></i></div>
            </div>
            <div style="font-size: 28px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px;">${stats.currentMonthCount} <span style="font-size: 14px; font-weight: 600; color: #94a3b8;">건</span></div>
          </div>

          <div class="kpi-card" style="background: linear-gradient(135deg, #16a34a 0%, #15803d 100%); border: none; border-radius: 16px; padding: 20px; box-shadow: 0 8px 20px rgba(22,163,74,0.2);">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
              <span style="font-size: 13.5px; font-weight: 700; color: #dcfce7;">당월 총 결제 금액</span>
              <div style="width: 36px; height: 36px; border-radius: 10px; background: rgba(255,255,255,0.2); color: #ffffff; display: flex; align-items: center; justify-content: center; font-size:16px;"><i class="fas fa-wallet"></i></div>
            </div>
            <div style="font-size: 28px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">${stats.currentMonthTotal.toLocaleString()} <span style="font-size: 15px; font-weight: 600; color: #bbf7d0;">원</span></div>
          </div>

          <div class="kpi-card" style="background:#ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.02);">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
              <span style="font-size: 13.5px; font-weight: 700; color: #64748b;">구매 참여 직원 수</span>
              <div style="width: 36px; height: 36px; border-radius: 10px; background: #f0fdf4; color: #16a34a; display: flex; align-items: center; justify-content: center; font-size:16px;"><i class="fas fa-users"></i></div>
            </div>
            <div style="font-size: 28px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px;">${stats.uniqueStaffCount} <span style="font-size: 14px; font-weight: 600; color: #94a3b8;">명</span></div>
          </div>

          <div class="kpi-card" style="background:#ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.02);">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
              <span style="font-size: 13.5px; font-weight: 700; color: #64748b;">건당 평균 구매액</span>
              <div style="width: 36px; height: 36px; border-radius: 10px; background: #fff7ed; color: #ea580c; display: flex; align-items: center; justify-content: center; font-size:16px;"><i class="fas fa-chart-line"></i></div>
            </div>
            <div style="font-size: 28px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px;">${stats.avgAmount.toLocaleString()} <span style="font-size: 14px; font-weight: 600; color: #94a3b8;">원</span></div>
          </div>
        </div>

        <!-- 📊 Chart.js 영역 -->
        <div class="row g-3 mb-4">
          <div class="col-lg-7">
            <div class="card" style="border-radius:16px; border:1px solid #e2e8f0; box-shadow:0 4px 15px rgba(0,0,0,0.02); overflow:hidden;">
              <div class="card-header d-flex justify-content-between align-items-center" style="background:#ffffff; border-bottom:1px solid #f1f5f9; padding:16px 20px;">
                <h4 style="font-size:15px; font-weight:800; color:#1e293b; margin:0;"><i class="fas fa-chart-bar text-primary me-2"></i>월별 할인 구매금액 추세</h4>
              </div>
              <div style="position:relative; height:240px; width:100%; padding:16px;"><canvas id="discountBarCanvas"></canvas></div>
            </div>
          </div>
          <div class="col-lg-5">
            <div class="card" style="border-radius:16px; border:1px solid #e2e8f0; box-shadow:0 4px 15px rgba(0,0,0,0.02); overflow:hidden;">
              <div class="card-header d-flex justify-content-between align-items-center" style="background:#ffffff; border-bottom:1px solid #f1f5f9; padding:16px 20px;">
                <h4 style="font-size:15px; font-weight:800; color:#1e293b; margin:0;"><i class="fas fa-chart-pie text-success me-2"></i>직원별 구매비중</h4>
              </div>
              <div style="position:relative; height:240px; width:100%; padding:16px;"><canvas id="discountDonutCanvas"></canvas></div>
            </div>
          </div>
        </div>

        <!-- 하단 탭 및 데이터 리스트 -->
        <div class="card-section" style="border-radius: 20px; padding: 28px; background:#ffffff; box-shadow: 0 10px 30px rgba(0,0,0,0.04); border: 1px solid #e2e8f0;">
          <div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 gap-3">
            <h3 style="font-size: 19px; font-weight: 800; color: #0f172a; margin:0;"><i class="fas fa-receipt text-primary me-2"></i>할인 구매 내역 및 월별 정산 집계</h3>
            
            <!-- 🔀 탭 배치: 개별 기록이 좌측, 월별 합계가 우측 -->
            <div class="p-1" style="background:#f1f5f9; border-radius:12px; display:inline-flex; border:1px solid #e2e8f0;">
              <button type="button" class="btn btn-sm ${currentTab === 'individual' ? 'bg-white shadow-sm text-primary font-bold' : 'text-muted border-0'}" 
                      style="border-radius:10px; padding:8px 18px; transition:all 0.2s; font-size:13.5px;" 
                      onclick="DiscountPurchaseModule.switchSubTab('individual')">
                <i class="fas fa-list-ul me-1"></i> 📋 개별 기록
              </button>
              <button type="button" class="btn btn-sm ${currentTab === 'monthly' ? 'bg-white shadow-sm text-primary font-bold' : 'text-muted border-0'}" 
                      style="border-radius:10px; padding:8px 18px; transition:all 0.2s; font-size:13.5px;" 
                      onclick="DiscountPurchaseModule.switchSubTab('monthly')">
                <i class="fas fa-calendar-check me-1"></i> 📊 월별 합계
              </button>
            </div>
          </div>

          <div class="search-box mb-4 position-relative">
            <i class="fas fa-search position-absolute text-muted" style="top: 50%; left: 16px; transform: translateY(-50%);"></i>
            <input type="text" class="form-control" placeholder="직원 이름 또는 의약품/제품명으로 검색해 보세요..." 
                   value="${searchQuery}" oninput="DiscountPurchaseModule.handleSearch(this.value)" 
                   style="border-radius:12px; padding: 12px 16px 12px 42px; background:#f8fafc; border:1px solid #e2e8f0; font-size:14px; transition:all 0.2s;">
          </div>

          <div id="discount-tab-content">
            ${renderTabContent(purchases, employees)}
          </div>
        </div>

        <!-- 🛑 모달창 (신청 및 수정) -->
        <div id="discount-modal-container" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(15,23,42,0.6); backdrop-filter: blur(4px); z-index:999999; justify-content:center; align-items:center; opacity:0; transition:opacity 0.2s;">
          <div class="modal-card shadow-lg" style="background:#fff; width:92%; max-width:540px; border-radius:22px; padding:28px; position:relative; transform:translateY(20px); transition:transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); border:1px solid #cbd5e1;">
            <button type="button" onclick="DiscountPurchaseModule.closeModal()" style="position:absolute; top:20px; right:20px; background:#f1f5f9; border:none; width:36px; height:36px; border-radius:50%; font-size:18px; color:#64748b; cursor:pointer; display:flex; align-items:center; justify-content:center;">&times;</button>
            <h3 id="discount-modal-title" style="font-size:20px; font-weight:800; margin-bottom:22px; color:#0f172a;">🛍️ 직원 할인 구매 신청</h3>
            
            <form id="discount-form" onsubmit="DiscountPurchaseModule.savePurchase(event)">
              <input type="hidden" id="disc-id">
              
              <div class="row g-3 mb-3">
                <div class="col-sm-6">
                  <label class="form-label" style="font-size:13px; font-weight:700; color:#475569;">구매 직원</label>
                  <select id="disc-emp" class="form-select font-bold" style="border-radius:10px; background:#f8fafc;" required></select>
                  <small id="disc-emp-hint" class="text-danger d-none mt-1" style="font-size:11.5px; font-weight:600;"><i class="fas fa-lock me-1"></i>본인 계정으로 자동 지정</small>
                </div>
                <div class="col-sm-6">
                  <label class="form-label" style="font-size:13px; font-weight:700; color:#475569;">구매 일시</label>
                  <input type="datetime-local" id="disc-datetime" class="form-control font-bold" style="border-radius:10px; background:#f8fafc;" required>
                </div>
              </div>

              <div class="mb-3">
                <label class="form-label" style="font-size:13px; font-weight:700; color:#475569;">약품 / 물품명</label>
                <input type="text" id="disc-item" class="form-control" style="border-radius:10px; background:#f8fafc; font-size:14.5px; font-weight:600;" placeholder="예: 타이레놀정 500mg 1통, 영양제 등" required>
              </div>

              <!-- 💵 천원 단위 콤마 자동 서식 & 수량/합계 -->
              <div class="row g-3 mb-4">
                <div class="col-4">
                  <label class="form-label" style="font-size:13px; font-weight:700; color:#475569;">할인 단가 (원)</label>
                  <input type="text" id="disc-price" class="form-control font-bold" style="border-radius:10px; background:#f8fafc; text-align:right;" placeholder="0" required oninput="DiscountPurchaseModule.formatPriceInput(this)">
                </div>
                <div class="col-4">
                  <label class="form-label" style="font-size:13px; font-weight:700; color:#475569;">수량</label>
                  <input type="number" id="disc-qty" class="form-control font-bold" style="border-radius:10px; background:#f8fafc; text-align:center;" value="1" min="1" required oninput="DiscountPurchaseModule.calcTotal()">
                </div>
                <div class="col-4">
                  <label class="form-label" style="font-size:13px; font-weight:800; color:#2563eb;">총 결제금액</label>
                  <input type="text" id="disc-total" class="form-control font-bold text-primary" style="border-radius:10px; background:#eff6ff; border:1.5px solid #bfdbfe; text-align:right; font-size:14px;" readonly value="0 원">
                </div>
              </div>

              <div class="alert alert-info py-2 px-3 mb-4" style="font-size:12.5px; border-radius:10px; line-height:1.5; background:#eff6ff; border:1px solid #bfdbfe; color:#1e40af;">
                <i class="fas fa-info-circle me-1"></i> 등록 후 목록에서 <strong>[🩺 검수 확인]</strong> 및 <strong>[💰 입금 확인]</strong>을 원터치(1-Click)로 즉시 처리하실 수 있습니다.
              </div>

              <div class="d-flex justify-content-end gap-2">
                <button type="button" class="btn btn-light px-4 font-bold" style="border-radius:10px; background:#f1f5f9; color:#475569;" onclick="DiscountPurchaseModule.closeModal()">취소</button>
                <button type="submit" class="btn btn-success px-4 font-bold" style="border-radius:10px; box-shadow:0 4px 12px rgba(22,163,74,0.3);"><i class="fas fa-check me-1"></i> 내역 등록</button>
              </div>
            </form>
          </div>
        </div>
      `;

      container.innerHTML = html;

      setTimeout(() => {
        initDiscountBarChart(purchases);
        initDiscountDonutChart(purchases);
      }, 150);

    } catch (e) {
      console.error("할인구매대장 렌더링 오류:", e);
      container.innerHTML = `<div class="alert alert-danger m-4">화면을 불러오는 중 오류가 발생했습니다.</div>`;
    }
  }

  function calculatePurchaseStats(purchases, year, month) {
    const yearStr = String(year);
    const monthStr = String(month).padStart(2, '0');
    const currentMonthPurchases = purchases.filter(p => (p.dateStr || '').includes(`${yearStr}. ${monthStr}`) || (p.dateStr || '').includes(`${yearStr}-${monthStr}`));
    const currentMonthCount = currentMonthPurchases.length;
    const currentMonthTotal = currentMonthPurchases.reduce((sum, p) => sum + (p.totalPrice || 0), 0);
    const uniqueStaffCount = new Set(currentMonthPurchases.map(p => p.empName)).size;
    const avgAmount = currentMonthCount > 0 ? Math.round(currentMonthTotal / currentMonthCount) : 0;
    return { currentMonthCount, currentMonthTotal, uniqueStaffCount, avgAmount };
  }

  function renderTabContent(purchases, employees) {
    let filtered = purchases.filter(p => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (p.empName && p.empName.toLowerCase().includes(q)) || (p.itemName && p.itemName.toLowerCase().includes(q));
    });

    if (currentTab === 'monthly') return renderMonthlySummary(filtered);
    return renderIndividualList(filtered);
  }

  // 📋 1. 개별 기록 (원터치 검수 및 입금정산 버튼 탑재)
  function renderIndividualList(purchases) {
    if (purchases.length === 0) {
      return `<div class="text-center text-muted py-5" style="font-size:14px; background:#f8fafc; border-radius:12px;"><i class="fas fa-inbox mb-2" style="font-size:24px;"></i><br>등록된 구매 내역이 없습니다.</div>`;
    }

    const currUser = window.SheetsSync.getCurrentUser();

    return purchases.map(p => {
      const isCross = !!p.isCrossChecked;
      const isPaid = !!p.isPaid;
      const checkerLabel = p.crossCheckerName ? `🩺 검수: ${p.crossCheckerName}` : '🩺 검수완료';

      return `
        <div style="background:#ffffff; border:1.5px solid #e2e8f0; border-radius:16px; padding:18px 22px; margin-bottom:14px; display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:16px; box-shadow:0 3px 10px rgba(15,23,42,0.03); transition:all 0.2s;">
          
          <div class="d-flex align-items-center" style="min-width:260px; flex:1;">
            <div style="width:46px; height:46px; border-radius:14px; background:linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%); color:#2563eb; display:flex; align-items:center; justify-content:center; font-size:19px; margin-right:16px; flex-shrink:0; border:1px solid #bfdbfe;">
              <i class="fas fa-shopping-basket"></i>
            </div>
            <div>
              <div style="font-size:12px; color:#64748b; font-weight:600; margin-bottom:3px;">
                <i class="far fa-clock me-1"></i>${p.dateStr || '-'}
              </div>
              <div class="d-flex align-items-center gap-2 flex-wrap">
                <span class="badge" style="background:#ecfdf5; color:#047857; border:1.5px solid #a7f3d0; font-size:12.5px; padding:4px 10px; border-radius:8px; font-weight:800; box-shadow:0 1px 3px rgba(5,150,105,0.08);"><i class="fas fa-user-circle me-1" style="font-size:11.5px; opacity:0.85;"></i>${p.empName}</span>
                <strong style="color:#1e293b; font-size:15.5px; word-break:break-all;">${p.itemName}</strong>
              </div>
              <div style="font-size:13px; color:#475569; margin-top:4px;">
                단가 <strong style="color:#0f172a;">${(p.unitPrice || 0).toLocaleString()}원</strong> × <strong style="color:#2563eb;">${p.qty || 1}개</strong>
              </div>
            </div>
          </div>
          
          <div style="text-align:right; min-width:220px;" class="d-flex flex-column align-items-end justify-content-center">
            <div style="color:#15803d; font-size:19px; font-weight:800; margin-bottom:8px; font-family:'Outfit', sans-serif; letter-spacing:-0.3px;">
              ${(p.totalPrice || 0).toLocaleString()} <span style="font-size:14px; font-weight:700;">원</span>
            </div>

            <!-- ⚡ 1초 원터치 검수 & 입금 확인 버튼 그룹 -->
            <div class="d-flex align-items-center justify-content-end gap-2 flex-wrap">
              <!-- 검수약사 버튼 -->
              <button type="button" 
                      class="btn btn-sm font-bold" 
                      onclick="DiscountPurchaseModule.quickToggleCrossCheck('${p.id}')"
                      style="border-radius:20px; font-size:12px; padding:5px 12px; transition:all 0.15s; ${isCross ? 'background:#eff6ff; color:#1d4ed8; border:1.5px solid #93c5fd;' : 'background:#f8fafc; color:#64748b; border:1.5px solid #cbd5e1;'}"
                      title="${isCross ? '클릭 시 검수 취소/변경' : '클릭하여 원터치 검수 확인'}">
                <i class="fas ${isCross ? 'fa-check-double text-primary' : 'fa-stethoscope text-muted'} me-1"></i> ${isCross ? checkerLabel : '검수 확인'}
              </button>

              <!-- 약국장 입금 버튼 -->
              <button type="button" 
                      class="btn btn-sm font-bold" 
                      onclick="DiscountPurchaseModule.quickTogglePaid('${p.id}')"
                      style="border-radius:20px; font-size:12px; padding:5px 12px; transition:all 0.15s; ${isPaid ? 'background:#dcfce7; color:#15803d; border:1.5px solid #86efac;' : 'background:#fff1f2; color:#be123c; border:1.5px solid #fecdd3;'}"
                      title="${isPaid ? '클릭 시 입금 취소/변경' : '클릭하여 원터치 입금 정산 완료'}">
                <i class="fas ${isPaid ? 'fa-check-circle text-success' : 'fa-coins text-danger'} me-1"></i> ${isPaid ? '입금완료' : '정산 대기'}
              </button>
              
              <!-- 수정/삭제 버튼 -->
              <button type="button" style="background:#f1f5f9; border:none; width:30px; height:30px; border-radius:8px; color:#64748b; margin-left:4px; display:inline-flex; align-items:center; justify-content:center;" onclick="DiscountPurchaseModule.openEditModal('${p.id}')" title="수정"><i class="fas fa-edit"></i></button>
              <button type="button" style="background:#fee2e2; border:none; width:30px; height:30px; border-radius:8px; color:#dc2626; display:inline-flex; align-items:center; justify-content:center;" onclick="DiscountPurchaseModule.deletePurchase('${p.id}')" title="삭제"><i class="fas fa-trash-alt"></i></button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // 📊 2. 월별 합계 (월별 그룹 및 정산 테이블)
  function renderMonthlySummary(purchases) {
    const monthlyMap = {};
    purchases.forEach(p => {
      let monthKey = "2026년 08월";
      if (p.dateStr) {
        const parts = p.dateStr.split('.');
        if (parts.length >= 2) monthKey = `${parts[0].trim()}년 ${parts[1].trim()}월`;
      }
      if (!monthlyMap[monthKey]) monthlyMap[monthKey] = { count: 0, total: 0, items: [] };
      monthlyMap[monthKey].count++;
      monthlyMap[monthKey].total += (p.totalPrice || 0);
      monthlyMap[monthKey].items.push(p);
    });

    const months = Object.keys(monthlyMap).sort().reverse();
    if (months.length === 0) {
      return `<div class="text-center text-muted py-5" style="font-size:14px; background:#f8fafc; border-radius:12px;"><i class="fas fa-inbox mb-2" style="font-size:24px;"></i><br>등록된 구매 내역이 없습니다.</div>`;
    }

    return months.map(month => `
      <div class="mb-4" style="background:#ffffff; border:1.5px solid #e2e8f0; border-radius:18px; overflow:hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.02);">
        <div class="d-flex justify-content-between align-items-center p-4 border-bottom flex-wrap gap-2" style="background:#f8fafc;">
          <span style="font-size:17.5px; font-weight:800; color:#0f172a;"><i class="far fa-calendar-check text-primary me-2"></i>${month} 정산</span>
          <div style="text-align:right;">
            <span style="font-size:12.5px; color:#64748b; font-weight:600; margin-right:6px;">월 총합계 (${monthlyMap[month].count}건):</span>
            <strong style="font-size:20px; color:#16a34a; letter-spacing:-0.5px; font-family:'Outfit', sans-serif;">${monthlyMap[month].total.toLocaleString()} 원</strong>
          </div>
        </div>
        
        <div style="overflow-x:auto; -webkit-overflow-scrolling:touch; width:100%;">
          <table style="width:100%; min-width:780px; border-collapse:collapse; text-align:left; font-size:13.5px; white-space:nowrap;">
            <thead style="background:#ffffff; border-bottom:2px solid #e2e8f0; color:#64748b; font-weight:700;">
              <tr>
                <th style="padding:14px 20px; width:22%;">구매일시</th>
                <th style="padding:14px 18px; width:14%;">직원명</th>
                <th style="padding:14px 20px; width:26%;">구매품목</th>
                <th style="padding:14px 20px; width:16%; text-align:right;">결제금액</th>
                <th style="padding:14px 18px; width:11%; text-align:center;">검수약사</th>
                <th style="padding:14px 18px; width:11%; text-align:center;">약국장정산</th>
              </tr>
            </thead>
            <tbody>
              ${monthlyMap[month].items.map(item => {
                const isCross = !!item.isCrossChecked;
                const isPaid = !!item.isPaid;
                const checkerLabel = item.crossCheckerName ? `🩺 ${item.crossCheckerName}` : '🩺 검수완료';

                return `
                  <tr style="border-bottom:1px solid #f1f5f9; transition:background 0.2s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'">
                    <td style="padding:14px 20px; color:#64748b; font-weight:500;">${item.dateStr || '-'}</td>
                    <td style="padding:14px 18px; font-weight:700; color:#1e293b;">
                      <span class="badge" style="background:#ecfdf5; color:#047857; border:1.5px solid #a7f3d0; font-size:12px; padding:4px 9px; border-radius:8px; font-weight:800;"><i class="fas fa-user-circle me-1" style="font-size:11px; opacity:0.85;"></i>${item.empName}</span>
                    </td>
                    <td style="padding:14px 20px; color:#334155; font-weight:600;">${item.itemName}</td>
                    <td style="padding:14px 20px; color:#15803d; font-weight:800; text-align:right; font-size:14.5px; font-family:'Outfit', sans-serif;">${(item.totalPrice || 0).toLocaleString()}원</td>
                    <td style="padding:14px 18px; text-align:center;">
                      <button type="button" 
                              class="btn btn-sm font-bold" 
                              onclick="DiscountPurchaseModule.quickToggleCrossCheck('${item.id}')"
                              style="border-radius:14px; font-size:11.5px; padding:4px 9px; ${isCross ? 'background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe;' : 'background:#f8fafc; color:#64748b; border:1px solid #cbd5e1;'}"
                              title="${isCross ? '클릭 시 검수 취소/변경' : '클릭하여 검수 확인'}">
                        <i class="fas ${isCross ? 'fa-check-double' : 'fa-stethoscope'} me-1"></i>${isCross ? checkerLabel : '검수대기'}
                      </button>
                    </td>
                    <td style="padding:14px 18px; text-align:center;">
                      <button type="button" 
                              class="btn btn-sm font-bold" 
                              onclick="DiscountPurchaseModule.quickTogglePaid('${item.id}')"
                              style="border-radius:14px; font-size:11.5px; padding:4px 9px; ${isPaid ? 'background:#dcfce7; color:#15803d; border:1px solid #86efac;' : 'background:#fff1f2; color:#be123c; border:1px solid #fecdd3;'}"
                              title="${isPaid ? '클릭 시 입금 취소/변경' : '클릭하여 입금 정산 완료'}">
                        <i class="fas ${isPaid ? 'fa-check-circle' : 'fa-coins'} me-1"></i>${isPaid ? '입금완료' : '미정산'}
                      </button>
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `).join('');
  }

  function switchSubTab(tab) {
    currentTab = tab;
    render('module-content');
  }

  function handleSearch(val) {
    searchQuery = val;
    render('module-content');
  }

  // 💵 천원 단위 콤마 입력 서식
  function formatPriceInput(input) {
    let val = input.value.replace(/[^0-9]/g, '');
    if (val) {
      input.value = Number(val).toLocaleString();
    } else {
      input.value = '';
    }
    calcTotal();
  }

  function calcTotal() {
    const rawPrice = (document.getElementById('disc-price').value || '').replace(/,/g, '');
    const price = parseFloat(rawPrice) || 0;
    const qty = parseInt(document.getElementById('disc-qty').value) || 1;
    const total = price * qty;
    document.getElementById('disc-total').value = total.toLocaleString() + ' 원';
  }

  function openAddModal() {
    const currentUser = window.SheetsSync.getCurrentUser();
    if (!currentUser) {
      alert("⚠️ 직원할인구매 신청을 위해 먼저 로그인해 주세요.");
      if (window.App && typeof window.App.showLoginModal === 'function') {
        window.App.showLoginModal();
      }
      return;
    }

    const modal = document.getElementById('discount-modal-container');
    if (!modal) { alert("모달 창을 찾을 수 없습니다."); return; }

    document.getElementById('discount-form').reset();
    document.getElementById('discount-modal-title').textContent = '🛍️ 직원 할인 구매 신청';
    document.getElementById('disc-id').value = '';
    document.getElementById('disc-price').value = '';
    document.getElementById('disc-qty').value = '1';
    document.getElementById('disc-total').value = '0 원';
    
    const tzoffset = (new Date()).getTimezoneOffset() * 60000;
    const localISOTime = (new Date(Date.now() - tzoffset)).toISOString().slice(0, 16);
    document.getElementById('disc-datetime').value = localISOTime;

    applyRolePermissions(currentUser, null);

    modal.style.display = 'flex';
    setTimeout(() => { modal.style.opacity = '1'; modal.querySelector('.modal-card').style.transform = 'translateY(0)'; }, 10);
  }

  function openEditModal(id) {
    const currentUser = window.SheetsSync.getCurrentUser();
    if (!currentUser) { alert("로그인이 필요합니다."); return; }

    const modal = document.getElementById('discount-modal-container');
    const data = window.SheetsSync.getData();
    const item = (data.discountPurchases || []).find(p => p.id === id);
    if (!item) return;

    document.getElementById('discount-modal-title').textContent = '🛍️ 할인 구매 내역 수정';
    document.getElementById('disc-id').value = item.id;
    document.getElementById('disc-item').value = item.itemName || '';
    document.getElementById('disc-price').value = (item.unitPrice || 0).toLocaleString();
    document.getElementById('disc-qty').value = item.qty || 1;
    document.getElementById('disc-total').value = (item.totalPrice || 0).toLocaleString() + ' 원';

    // 기존 날짜 복원
    if (item.dateIso) {
      document.getElementById('disc-datetime').value = item.dateIso;
    } else {
      const tzoffset = (new Date()).getTimezoneOffset() * 60000;
      const localISOTime = (new Date(Date.now() - tzoffset)).toISOString().slice(0, 16);
      document.getElementById('disc-datetime').value = localISOTime;
    }

    applyRolePermissions(currentUser, item);

    modal.style.display = 'flex';
    setTimeout(() => { modal.style.opacity = '1'; modal.querySelector('.modal-card').style.transform = 'translateY(0)'; }, 10);
  }

  function applyRolePermissions(currentUser, existingItem) {
    const select = document.getElementById('disc-emp');
    const hint = document.getElementById('disc-emp-hint');

    const isDirector = currentUser.role === '약국장';
    const employees = window.SheetsSync.getData().employees || [];
    const targetEmpId = existingItem ? existingItem.empId : currentUser.id;

    if (isDirector) {
      select.innerHTML = employees.map(e => `<option value="${e.id}" ${e.id === targetEmpId ? 'selected' : ''}>${e.name} (${e.role})</option>`).join('');
      select.disabled = false;
      hint.classList.add('d-none');
    } else {
      const me = employees.find(e => e.id === targetEmpId) || currentUser;
      select.innerHTML = `<option value="${me.id}" selected>${me.name} (${me.role})</option>`;
      select.disabled = true;
      if (!existingItem) hint.classList.remove('d-none');
    }
  }

  function closeModal() {
    const modal = document.getElementById('discount-modal-container');
    if (!modal) return;
    modal.style.opacity = '0';
    modal.querySelector('.modal-card').style.transform = 'translateY(20px)';
    setTimeout(() => { modal.style.display = 'none'; }, 200);
  }

  // ⚡ 1초 원터치 검수 확인 (근무약사 본인 셀프 검수 원천 차단)
  function quickToggleCrossCheck(id) {
    const currUser = window.SheetsSync.getCurrentUser();
    if (!currUser) {
      alert("🚨 로그인이 필요합니다. 화면 상단에서 직원 로그인을 먼저 진행해 주세요!");
      return;
    }

    const isDirector = currUser.role === '약국장';
    const isPharmacist = (currUser.role || '').includes('약사');

    if (!isDirector && !isPharmacist) {
      alert("🔒 [권한 통제] 의약품 검수는 약사 면허를 보유한 근무약사 또는 약국장님만 가능합니다.");
      return;
    }

    const data = window.SheetsSync.getData();
    const purchases = data.discountPurchases || [];
    const item = purchases.find(p => p.id === id);
    if (!item) return;

    // 🚨 근무약사 본인 구매 품목 셀프 검수 방지 (약국장 제외)
    if (!isDirector && item.empId === currUser.id) {
      alert(`🔒 [교차 검수 규정] 본인(${currUser.name} 약사)이 구매한 품목은 셀프 검수를 할 수 없습니다.\n다른 근무약사 또는 약국장님의 검수를 받아주세요.`);
      return;
    }

    // 토글 처리
    if (item.isCrossChecked) {
      if (confirm(`'${item.itemName}' 품목의 검수를 취소(검수 대기 상태로 변경)하시겠습니까?`)) {
        item.isCrossChecked = false;
        item.crossCheckerId = null;
        item.crossCheckerName = null;
      } else {
        return;
      }
    } else {
      item.isCrossChecked = true;
      item.crossCheckerId = currUser.id;
      item.crossCheckerName = currUser.name;
    }

    window.SheetsSync.saveDiscountPurchases(purchases);
    render('module-content');
  }

  // ⚡ 1초 원터치 약국장 입금 정산 완료
  function quickTogglePaid(id) {
    const currUser = window.SheetsSync.getCurrentUser();
    if (!currUser) {
      alert("🚨 로그인이 필요합니다. 화면 상단에서 로그인을 먼저 진행해 주세요!");
      return;
    }

    const isDirector = currUser.role === '약국장';
    if (!isDirector) {
      alert("🔒 [보안 권한 통제] 입금 정산 처리는 약국장님 전용 권한입니다.");
      return;
    }

    const data = window.SheetsSync.getData();
    const purchases = data.discountPurchases || [];
    const item = purchases.find(p => p.id === id);
    if (!item) return;

    if (item.isPaid) {
      if (confirm(`'${item.empName}' 님의 '${item.itemName}' (${(item.totalPrice||0).toLocaleString()}원) 입금 완료 상태를 '정산 대기'로 변경하시겠습니까?`)) {
        item.isPaid = false;
      } else {
        return;
      }
    } else {
      item.isPaid = true;
    }

    window.SheetsSync.saveDiscountPurchases(purchases);
    render('module-content');
  }

  function savePurchase(e) {
    e.preventDefault();
    const id = document.getElementById('disc-id').value;
    
    const selectElem = document.getElementById('disc-emp');
    let empId = selectElem.value;
    if (selectElem.disabled) { 
       const currentUser = window.SheetsSync.getCurrentUser();
       if(currentUser) empId = currentUser.id;
    }

    const datetime = document.getElementById('disc-datetime').value;
    const itemName = document.getElementById('disc-item').value.trim();
    const rawPrice = (document.getElementById('disc-price').value || '').replace(/,/g, '');
    const unitPrice = parseFloat(rawPrice) || 0;
    const qty = parseInt(document.getElementById('disc-qty').value) || 1;
    const totalPrice = unitPrice * qty;

    const data = window.SheetsSync.getData();
    const emp = (data.employees || []).find(employee => employee.id === empId);
    const dateObj = new Date(datetime);
    const dateStr = `${dateObj.getFullYear()}. ${String(dateObj.getMonth()+1).padStart(2,'0')}. ${String(dateObj.getDate()).padStart(2,'0')}. ${String(dateObj.getHours()).padStart(2,'0')}:${String(dateObj.getMinutes()).padStart(2,'0')}`;

    let purchases = data.discountPurchases || [];

    if (id) {
      const idx = purchases.findIndex(p => p.id === id);
      if (idx >= 0) {
        const existing = purchases[idx];
        purchases[idx] = { 
          ...existing, 
          empId, 
          empName: emp ? emp.name : '직원', 
          dateIso: datetime,
          dateStr, 
          itemName, 
          unitPrice, 
          qty, 
          totalPrice 
        };
      }
    } else {
      purchases.unshift({ 
        id: 'disc_' + Date.now(), 
        empId, 
        empName: emp ? emp.name : '직원', 
        dateIso: datetime,
        dateStr, 
        itemName, 
        unitPrice, 
        qty, 
        totalPrice, 
        isCrossChecked: false, 
        isPaid: false 
      });
    }

    window.SheetsSync.saveDiscountPurchases(purchases);
    closeModal();
    render('module-content');
  }

  function deletePurchase(id) {
    const currUser = window.SheetsSync.getCurrentUser();
    if (!currUser) {
      alert("로그인이 필요합니다.");
      return;
    }

    const data = window.SheetsSync.getData();
    let purchases = data.discountPurchases || [];
    const item = purchases.find(p => p.id === id);
    if (!item) return;

    const isDirector = currUser.role === '약국장';
    if (!isDirector && item.empId !== currUser.id) {
      alert("🔒 [권한 통제] 본인이 등록한 구매 내역만 삭제할 수 있습니다.");
      return;
    }

    if (!confirm(`'${item.itemName}' (${(item.totalPrice||0).toLocaleString()}원) 구매 내역을 삭제하시겠습니까?`)) return;

    if (window.SheetsSync && typeof window.SheetsSync.addDeletedId === 'function') {
      window.SheetsSync.addDeletedId(id);
    }
    purchases = purchases.filter(p => p.id !== id);
    window.SheetsSync.saveDiscountPurchases(purchases);
    render('module-content');
  }

  // ── Chart.js 시각화 ──
  function initDiscountBarChart(purchases) {
    const canvas = document.getElementById('discountBarCanvas');
    if (!canvas) return;
    if (typeof Chart === 'undefined') return;

    const labels = [];
    const totals = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      labels.push(`${y}.${m}`);
      const monthTotal = purchases
        .filter(p => { const ds = p.dateStr || ''; return ds.includes(`${y}. ${m}`) || ds.includes(`${y}-${m}`); })
        .reduce((sum, p) => sum + (p.totalPrice || 0), 0);
      totals.push(monthTotal);
    }

    const ctx = canvas.getContext('2d');
    if (discountBarChartInstance) {
      try { discountBarChartInstance.destroy(); } catch (e) {}
      discountBarChartInstance = null;
    }

    discountBarChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: '구매 금액',
          data: totals,
          backgroundColor: totals.map((v, i) => i === 5 ? 'rgba(59,130,246,0.85)' : 'rgba(59,130,246,0.3)'),
          borderColor: totals.map((v, i) => i === 5 ? '#2563eb' : '#93c5fd'),
          borderWidth: 1.5,
          borderRadius: 6,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `  ${ctx.parsed.y.toLocaleString()}원` } } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11, weight: '600' }, color: '#64748b' } },
          y: { grid: { color: 'rgba(226,232,240,0.6)' }, ticks: { font: { size: 10 }, color: '#94a3b8', callback: v => v === 0 ? '0' : (v >= 10000 ? (v / 10000).toFixed(0) + '만' : v.toLocaleString()) } }
        }
      }
    });
  }

  function initDiscountDonutChart(purchases) {
    const canvas = document.getElementById('discountDonutCanvas');
    if (!canvas) return;
    if (typeof Chart === 'undefined') return;

    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const monthPurchases = purchases.filter(p => { const ds = p.dateStr || ''; return ds.includes(`${y}. ${m}`) || ds.includes(`${y}-${m}`); });

    const staffMap = {};
    monthPurchases.forEach(p => { const name = p.empName || '미상'; staffMap[name] = (staffMap[name] || 0) + (p.totalPrice || 0); });

    const entries = Object.entries(staffMap).sort((a, b) => b[1] - a[1]);
    const totalAmount = entries.reduce((s, e) => s + e[1], 0);

    const palette = ['#10b981','#3b82f6','#f59e0b','#ec4899','#8b5cf6','#06b6d4','#f97316','#14b8a6','#a855f7','#64748b'];
    const labels = entries.length === 0 ? ['데이터 없음'] : entries.map(([name, amt]) => { const pct = totalAmount > 0 ? ((amt / totalAmount) * 100).toFixed(1) : 0; return `${name} (${pct}%)`; });
    const data = entries.length === 0 ? [1] : entries.map(([, amt]) => amt);
    const colors = entries.length === 0 ? ['#f1f5f9'] : entries.map((_, i) => palette[i % palette.length]);

    const ctx = canvas.getContext('2d');
    if (discountDonutChartInstance) {
      try { discountDonutChartInstance.destroy(); } catch (e) {}
      discountDonutChartInstance = null;
    }

    discountDonutChartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: '#ffffff', hoverBorderWidth: 3, hoverOffset: 6 }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '65%', animation: false,
        plugins: {
          legend: { display: entries.length > 0, position: 'bottom', labels: { font: { size: 11, weight: '600' }, color: '#475569', padding: 12, boxWidth: 12, boxHeight: 12 } },
          tooltip: { callbacks: { label: ctx => { const val = ctx.parsed; const pct = totalAmount > 0 ? ((val / totalAmount) * 100).toFixed(1) : 0; return `  ${val.toLocaleString()}원 (${pct}%)`; } } }
        }
      }
    });
  }

  return {
    render,
    switchSubTab,
    handleSearch,
    formatPriceInput,
    calcTotal,
    openAddModal,
    openEditModal,
    closeModal,
    savePurchase,
    deletePurchase,
    quickToggleCrossCheck,
    quickTogglePaid
  };
})();