/**
 * 직원할인구매대장 모듈 컨트롤러 (Staff Discount Purchase Log Module)
 * 1초 원터치 검수 및 약국장 입금정산 완료 + 근무약사 셀프 검수 방지 교차검증 + 천원단위 콤마 서식 + 탭 배치 최적화
 */
window.DiscountPurchaseModule = (function () {

  let currentTab = 'individual'; // 1차 기본 탭: 개별 기록
  let searchQuery = '';
  let discountBarChartInstance = null;
  let discountDonutChartInstance = null;

  // ⚡ 실시간 클라우드 상호 동기화 이벤트 리스너 장착 (PC ↔ 스마트폰 0.1초 실시간 100% 호환)
  if (typeof window !== 'undefined') {
    window.addEventListener('ssg_cloud_updated', function () {
      const activeMod = window.App && typeof window.App.getActiveModule === 'function' ? window.App.getActiveModule() : '';
      if (activeMod === 'discount-purchase' || document.getElementById('discount-tab-content')) {
        render('module-content');
      }
    });
    window.addEventListener('ssg_data_changed', function () {
      const activeMod = window.App && typeof window.App.getActiveModule === 'function' ? window.App.getActiveModule() : '';
      if (activeMod === 'discount-purchase' || document.getElementById('discount-tab-content')) {
        render('module-content');
      }
    });
  }

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
        <div class="module-header mb-4">
          <div>
            <h2 style="font-weight: 800; color: #0f172a; letter-spacing: -0.5px;">🛍️ 직원할인구매대장</h2>
            <p class="subtitle" style="color: #64748b; margin-top: 4px;">약국 내 일반의약품, 건강기능식품 및 외용제 직원 할인 구매 내역 관리 및 월별 정산 대장</p>
          </div>
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

        <!-- 🖊️ 4대 통계 카드 아래 [한 칸 위] 독립 행 (좌측 가독성배치 & 모바일 반응형 100% 밀착 보강) -->
        <div style="margin-top: 24px; margin-bottom: 18px; display: flex; align-items: center; justify-content: flex-start; width: 100%;">
          <button type="button" class="btn shadow-sm" onclick="DiscountPurchaseModule.openAddModal()" style="background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: #ffffff; font-size: 14.5px; font-weight: 800; border-radius: 12px; padding: 11px 24px; border: none; box-shadow: 0 4px 14px rgba(37,99,235,0.35); cursor: pointer; transition: all 0.2s; display: inline-flex; align-items: center; justify-content: center; gap: 8px; max-width: 100%; box-sizing: border-box;">
            <i class="fas fa-plus-circle" style="font-size: 16px;"></i> + 구매 신청 / 등록
          </button>
        </div>

        <!-- 하단 탭 및 데이터 리스트 (100% 와이드) -->
        <div class="card-section" style="border-radius: 20px; padding: 28px; background:#ffffff; box-shadow: 0 10px 30px rgba(0,0,0,0.04); border: 1px solid #e2e8f0;">
          <div class="d-flex flex-column flex-md-row justify-content-between align-items-md-center mb-4 gap-3 flex-wrap">
            <h3 style="font-size: 19px; font-weight: 800; color: #0f172a; margin:0;"><i class="fas fa-receipt text-primary me-2"></i>할인 구매 내역 및 월별 정산 집계</h3>
            
            <div class="d-flex align-items-center gap-3 flex-wrap">
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
          <div class="modal-card shadow-lg" style="background:#fff; width:94%; max-width:580px; border-radius:22px; padding:28px; position:relative; transform:translateY(20px); transition:transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275); border:1px solid #cbd5e1; max-height:92vh; overflow-y:auto;">
            <button type="button" onclick="DiscountPurchaseModule.closeModal()" style="position:absolute; top:20px; right:20px; background:#f1f5f9; border:none; width:36px; height:36px; border-radius:50%; font-size:18px; color:#64748b; cursor:pointer; display:flex; align-items:center; justify-content:center;">&times;</button>
            <h3 id="discount-modal-title" style="font-size:20px; font-weight:800; margin-bottom:22px; color:#0f172a;">🛍️ 직원 할인 구매 신청</h3>
            
            <form id="discount-form" onkeydown="DiscountPurchaseModule.handleFormKeyDown(event)" onsubmit="DiscountPurchaseModule.savePurchase(event)">
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

              <!-- 🛒 다중 품목 동적 입력 장바구니 영역 -->
              <div class="mb-4" style="background:#f8fafc; border:1.5px solid #e2e8f0; border-radius:14px; padding:16px;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                  <label class="form-label" style="font-size:13.5px; font-weight:800; color:#0f172a; margin:0;">
                    🛒 구매 품목 리스트 (<span id="disc-items-count" style="color:#2563eb;">1</span>건)
                  </label>
                  <button type="button" onclick="DiscountPurchaseModule.addItemRow()" style="background:#eff6ff; border:1px solid #bfdbfe; color:#2563eb; font-size:12.5px; font-weight:800; border-radius:8px; padding:5px 14px; cursor:pointer; transition:all 0.2s;">
                    <i class="fas fa-plus-circle me-1"></i> + 품목 추가
                  </button>
                </div>

                <div id="disc-items-list" style="display:flex; flex-direction:column; gap:10px; max-height:260px; overflow-y:auto; padding-right:2px;">
                  <!-- 자바스크립트로 동적 품목 행 렌더링 -->
                </div>
              </div>

              <!-- 💵 전체 총 결제금액 자동 합산 바 -->
              <div class="mb-4" style="background:#eff6ff; border:1.5px solid #bfdbfe; border-radius:14px; padding:14px 18px; display:flex; align-items:center; justify-content:space-between;">
                <span style="font-size:14px; font-weight:700; color:#1e40af;"><i class="fas fa-calculator me-1.5"></i>전체 총 결제금액</span>
                <span style="font-size:22px; font-weight:900; color:#2563eb;" id="disc-grand-total">0 원</span>
              </div>

              <div class="alert alert-info py-2 px-3 mb-4" style="font-size:12.5px; border-radius:10px; line-height:1.5; background:#f0fdf4; border:1px solid #bbf7d0; color:#15803d;">
                <i class="fas fa-info-circle me-1"></i> 여러 품목을 한번에 추가하여 신청할 수 있습니다. 등록 후 목록에서 <strong>[🩺 검수 확인]</strong> 및 <strong>[💰 입금 확인]</strong>을 원터치로 완료하세요.
              </div>

              <div class="d-flex justify-content-end gap-2">
                <button type="button" class="btn btn-light px-4 font-bold" style="border-radius:10px; background:#f1f5f9; color:#475569;" onclick="DiscountPurchaseModule.closeModal()">취소</button>
                <button type="submit" class="btn btn-success px-4 font-bold" style="border-radius:10px; background:linear-gradient(135deg, #16a34a 0%, #15803d 100%); border:none; box-shadow:0 4px 12px rgba(22,163,74,0.3);"><i class="fas fa-check me-1"></i> 구매 내역 신청/등록</button>
              </div>
            </form>
          </div>
        </div>
      `;

      container.innerHTML = html;

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

  // 📋 1. 개별 기록 (원터치 검수 및 입금정산 버튼 탑재 - 가장 최근 등록건 100% 최상단 노출)
  function renderIndividualList(purchases) {
    if (purchases.length === 0) {
      return `<div class="text-center text-muted py-5" style="font-size:14px; background:#f8fafc; border-radius:12px;"><i class="fas fa-inbox mb-2" style="font-size:24px;"></i><br>등록된 구매 내역이 없습니다.</div>`;
    }

    // ⚡ 무조건 가장 최근에 등록/수정된 내역이 최상단(Top)에 뜨도록 최신순 내림차순 강제 정렬
    const sortedPurchases = [...purchases].sort((a, b) => {
      const getNum = (p) => {
        if (p.updatedAt) return p.updatedAt;
        if (p.createdAt) return p.createdAt;
        if (p.id && typeof p.id === 'string' && p.id.startsWith('disc_')) {
          const num = parseInt(p.id.replace('disc_', ''), 10);
          if (!isNaN(num)) return num;
        }
        if (p.dateIso) {
          const ms = new Date(p.dateIso).getTime();
          if (!isNaN(ms)) return ms;
        }
        return 0;
      };
      return getNum(b) - getNum(a);
    });

    const currUser = window.SheetsSync.getCurrentUser();

    return sortedPurchases.map(p => {
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
              </div>
              <div style="margin-top:8px; background:#f8fafc; border:1.5px solid #cbd5e1; border-radius:14px; padding:12px 16px; width:100%;">
                ${(() => {
                  // 1. items 배열이 선명하게 들어있는 신규 다중 품목 신청 건
                  if (p.items && Array.isArray(p.items) && p.items.length > 0) {
                    return p.items.map((it, idx) => `
                      <div style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:6px 12px; padding:6px 0; ${idx < p.items.length - 1 ? 'border-bottom:1px dashed #cbd5e1;' : ''} font-size:13px; font-weight:800;">
                        <span style="color:#0f172a; font-size:13.5px; word-break:break-all; flex:1; min-width:140px;"><i class="fas fa-pills me-1.5" style="font-size:13px; color:#2563eb;"></i>${escapeHTML(it.name)}</span>
                        <span style="color:#475569; font-size:12.5px; white-space:nowrap; margin-left:auto;">
                          단가 <strong style="color:#0f172a;">${(it.price||0).toLocaleString()}원</strong> × <strong style="color:#2563eb;">${it.qty||1}개</strong> = <strong style="color:#16a34a; font-size:13.5px;">${((it.price||0)*(it.qty||1)).toLocaleString()}원</strong>
                        </span>
                      </div>
                    `).join('');
                  }

                  // 2. 구버전 파싱 (itemName에 '(외 N건: 약A, 약B)' 형식으로 묶여있는 기록도 단가/수량/가격 개별 1행 노출)
                  if (p.itemName && p.itemName.includes(': ')) {
                    try {
                      const detailPart = p.itemName.split(': ')[1].replace(/\)$/, '');
                      const parsedNames = detailPart.split(', ').map(s => s.trim()).filter(Boolean);
                      if (parsedNames.length > 0) {
                        const unitP = p.unitPrice || Math.round((p.totalPrice||0) / parsedNames.length);
                        return parsedNames.map((name, idx) => `
                          <div style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:6px 12px; padding:6px 0; ${idx < parsedNames.length - 1 ? 'border-bottom:1px dashed #cbd5e1;' : ''} font-size:13px; font-weight:800;">
                            <span style="color:#0f172a; font-size:13.5px; word-break:break-all; flex:1; min-width:140px;"><i class="fas fa-pills me-1.5" style="font-size:13px; color:#2563eb;"></i>${escapeHTML(name)}</span>
                            <span style="color:#475569; font-size:12.5px; white-space:nowrap; margin-left:auto;">
                              단가 <strong style="color:#0f172a;">${(unitP||0).toLocaleString()}원</strong> × <strong style="color:#2563eb;">${p.qty||1}개</strong> = <strong style="color:#16a34a; font-size:13.5px;">${((unitP||0)*(p.qty||1)).toLocaleString()}원</strong>
                            </span>
                          </div>
                        `).join('');
                      }
                    } catch(e){}
                  }

                  // 3. 단일 품목 내역
                  return `
                    <div style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:6px 12px; padding:4px 0; font-size:13px; font-weight:800;">
                      <span style="color:#0f172a; font-size:13.5px; word-break:break-all; flex:1; min-width:140px;"><i class="fas fa-box me-1.5" style="font-size:13px; color:#2563eb;"></i>${escapeHTML(p.itemName)}</span>
                      <span style="color:#475569; font-size:12.5px; white-space:nowrap; margin-left:auto;">
                        단가 <strong style="color:#0f172a;">${(p.unitPrice||0).toLocaleString()}원</strong> × <strong style="color:#2563eb;">${p.qty||1}개</strong> = <strong style="color:#16a34a; font-size:13.5px;">${(p.totalPrice||0).toLocaleString()}원</strong>
                      </span>
                    </div>
                  `;
                })()}

                <div style="border-top:1.5px solid #cbd5e1; margin-top:8px; padding-top:8px; display:flex; justify-content:space-between; align-items:center;">
                  <span style="font-size:13px; font-weight:800; color:#1e40af;"><i class="fas fa-calculator me-1.5"></i>전체 총 결제금액</span>
                  <span style="font-size:16.5px; font-weight:900; color:#16a34a; font-family:'Outfit', sans-serif;">${(p.totalPrice || 0).toLocaleString()} 원</span>
                </div>
              </div>
            </div>
          </div>
          
          <div style="text-align:right; min-width:auto;" class="d-flex flex-column align-items-end justify-content-center">
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
                    <td style="padding:14px 20px; color:#334155; font-weight:600;">
                      ${(() => {
                        if (item.items && Array.isArray(item.items) && item.items.length > 0) {
                          const first = item.items[0].name;
                          return item.items.length === 1 ? escapeHTML(first) : `${escapeHTML(first)} 외 ${item.items.length - 1}건`;
                        }
                        let name = item.itemName || '';
                        if (name.includes(' (외 ')) {
                          const parts = name.split(' (외 ');
                          const firstName = parts[0];
                          return `${escapeHTML(firstName)} 외 1건`;
                        }
                        return escapeHTML(name);
                      })()}
                    </td>
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
    const tabContent = document.getElementById('discount-tab-content');
    if (tabContent) {
      const data = window.SheetsSync.getData();
      const purchases = data.discountPurchases || [];
      const employees = data.employees || [];
      tabContent.innerHTML = renderTabContent(purchases, employees);
    }
  }

  // 🛒 장바구니 동적 품목 행 추가 (선명한 가독성 & 정갈한 슬림 flex 레이아웃)
  function addItemRow(itemData = { name: '', price: '', qty: 1 }) {
    const listEl = document.getElementById('disc-items-list');
    if (!listEl) return;

    const rowId = 'item_row_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
    const div = document.createElement('div');
    div.className = 'disc-item-row';
    div.id = rowId;
    div.style.cssText = 'background:#ffffff; border:1.5px solid #cbd5e1; border-radius:14px; padding:14px; position:relative; box-shadow:0 2px 8px rgba(15,23,42,0.04); margin-bottom:4px;';

    const priceVal = typeof itemData.price === 'number' ? itemData.price.toLocaleString() : (itemData.price || '');

    div.innerHTML = `
      <div style="display:flex; flex-wrap:wrap; align-items:center; gap:8px;">
        <div style="flex:2; min-width:140px;">
          <label style="font-size:11px; font-weight:800; color:#475569; display:block; margin-bottom:3px;">품목/제품명</label>
          <input type="text" class="form-control disc-item-name" placeholder="예: 비타500" value="${escapeHTML(itemData.name || '')}" required oninput="DiscountPurchaseModule.calcTotal()" style="background:#ffffff; border:1.5px solid #cbd5e1; color:#0f172a; font-weight:800; font-size:13.5px; border-radius:10px; padding:8px 12px; outline:none; width:100%; box-sizing:border-box;">
        </div>

        <div style="flex:1.2; min-width:100px;">
          <label style="font-size:11px; font-weight:800; color:#475569; display:block; margin-bottom:3px;">할인 단가(원)</label>
          <input type="text" class="form-control disc-item-price" placeholder="0" value="${priceVal}" required oninput="DiscountPurchaseModule.formatRowPrice(this)" style="background:#ffffff; border:1.5px solid #cbd5e1; color:#0f172a; font-weight:800; font-size:13.5px; border-radius:10px; padding:8px 12px; text-align:right; outline:none; width:100%; box-sizing:border-box;">
        </div>

        <div style="width:65px;">
          <label style="font-size:11px; font-weight:800; color:#475569; display:block; margin-bottom:3px; text-align:center;">수량</label>
          <input type="number" class="form-control disc-item-qty" min="1" value="${itemData.qty || 1}" required oninput="DiscountPurchaseModule.calcTotal()" style="background:#ffffff; border:1.5px solid #cbd5e1; color:#0f172a; font-weight:800; font-size:13.5px; border-radius:10px; padding:8px 6px; text-align:center; outline:none; width:100%; box-sizing:border-box;">
        </div>

        <div style="margin-top:18px; flex-shrink:0;">
          <button type="button" class="btn text-danger p-1 disc-item-del-btn" onclick="DiscountPurchaseModule.removeItemRow(this)" title="품목 삭제" style="background:#fff1f2; border:1px solid #fecdd3; border-radius:8px; width:34px; height:34px; display:inline-flex; align-items:center; justify-content:center; cursor:pointer;">
            <i class="fas fa-trash-alt" style="font-size:14px; color:#e11d48;"></i>
          </button>
        </div>
      </div>

      <div style="font-size:12px; font-weight:800; color:#475569; text-align:right; margin-top:8px; border-top:1px dashed #e2e8f0; padding-top:6px;">
        품목 소계: <strong class="disc-item-subtotal font-black" style="font-size:14px; color:#2563eb;">0</strong>원
      </div>
    `;

    listEl.appendChild(div);
    updateItemCountDisplay();
    calcTotal();
  }

  function removeItemRow(btnEl) {
    const listEl = document.getElementById('disc-items-list');
    if (!listEl) return;
    const rows = listEl.querySelectorAll('.disc-item-row');
    if (rows.length <= 1) {
      alert("⚠️ 최소 1개 이상의 구매 품목이 필요합니다.");
      return;
    }
    const row = btnEl.closest('.disc-item-row');
    if (row) {
      row.remove();
      updateItemCountDisplay();
      calcTotal();
    }
  }

  function updateItemCountDisplay() {
    const listEl = document.getElementById('disc-items-list');
    if (!listEl) return;
    const rows = listEl.querySelectorAll('.disc-item-row');
    const countEl = document.getElementById('disc-items-count');
    if (countEl) countEl.textContent = rows.length;
  }

  function formatRowPrice(inputEl) {
    if (!inputEl) return;
    let val = inputEl.value.replace(/[^0-9]/g, '');
    if (val) {
      inputEl.value = Number(val).toLocaleString();
    } else {
      inputEl.value = '';
    }
    calcTotal();
  }

  function formatPriceInput(inputEl) {
    formatRowPrice(inputEl);
  }

  function calcTotal() {
    const listEl = document.getElementById('disc-items-list');
    if (!listEl) return;

    let grandTotal = 0;
    const rows = listEl.querySelectorAll('.disc-item-row');

    rows.forEach(row => {
      const priceInput = row.querySelector('.disc-item-price');
      const qtyInput = row.querySelector('.disc-item-qty');
      const subtotalEl = row.querySelector('.disc-item-subtotal');

      const rawPrice = (priceInput ? priceInput.value : '').replace(/,/g, '');
      const price = parseFloat(rawPrice) || 0;
      const qty = parseInt(qtyInput ? qtyInput.value : 1) || 1;
      const subtotal = price * qty;

      if (subtotalEl) subtotalEl.textContent = subtotal.toLocaleString();
      grandTotal += subtotal;
    });

    const grandTotalEl = document.getElementById('disc-grand-total');
    if (grandTotalEl) grandTotalEl.textContent = grandTotal.toLocaleString() + ' 원';
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
    if (!modal) return;

    document.getElementById('discount-form').reset();
    document.getElementById('discount-modal-title').textContent = '🛍️ 직원 할인 구매 신청';
    document.getElementById('disc-id').value = '';
    
    const tzoffset = (new Date()).getTimezoneOffset() * 60000;
    const localISOTime = (new Date(Date.now() - tzoffset)).toISOString().slice(0, 16);
    document.getElementById('disc-datetime').value = localISOTime;

    const listEl = document.getElementById('disc-items-list');
    if (listEl) listEl.innerHTML = '';
    addItemRow({ name: '', price: '', qty: 1 });

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

    if (item.dateIso) {
      document.getElementById('disc-datetime').value = item.dateIso;
    }

    const listEl = document.getElementById('disc-items-list');
    if (listEl) listEl.innerHTML = '';

    if (item.items && Array.isArray(item.items) && item.items.length > 0) {
      item.items.forEach(it => addItemRow(it));
    } else {
      addItemRow({ name: item.itemName || '', price: item.unitPrice || 0, qty: item.qty || 1 });
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

  function quickToggleCrossCheck(id) {
    const currUser = window.SheetsSync.getCurrentUser();
    if (!currUser) {
      alert("🚨 로그인이 필요합니다.");
      return;
    }

    const isDirector = currUser.role === '약국장' || currUser.id === 'emp_1';
    const isPharmacist = (currUser.role || '').includes('약사');

    if (!isDirector && !isPharmacist) {
      alert("🔒 의약품 검수는 약사만 가능합니다.");
      return;
    }

    const data = window.SheetsSync.getData();
    const purchases = data.discountPurchases || [];
    const item = purchases.find(p => p.id === id);
    if (!item) return;

    if (!isDirector && item.empId === currUser.id) {
      alert("🔒 본인 구매 품목은 셀프 검수가 불가합니다. 다른 근무약사 또는 약국장님의 검수를 받아주세요.");
      return;
    }

    if (item.isCrossChecked) {
      if (confirm(`'${item.itemName}' 검수를 취소하시겠습니까?`)) {
        item.isCrossChecked = false;
        item.crossCheckerId = null;
        item.crossCheckerName = null;
      }
    } else {
      item.isCrossChecked = true;
      item.crossCheckerId = currUser.id;
      item.crossCheckerName = currUser.name;
    }

    window.SheetsSync.saveDiscountPurchases(purchases);
    render('module-content');
  }

  function quickTogglePaid(id) {
    const currUser = window.SheetsSync.getCurrentUser();
    if (!currUser) {
      alert("🚨 로그인이 필요합니다.");
      return;
    }

    if (currUser.role !== '약국장') {
      alert("🔒 약국장 전용 권한입니다.");
      return;
    }

    const data = window.SheetsSync.getData();
    const purchases = data.discountPurchases || [];
    const item = purchases.find(p => p.id === id);
    if (!item) return;

    if (item.isPaid) {
      if (confirm(`입금 완료 상태를 해제하시겠습니까?`)) item.isPaid = false;
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
    const listEl = document.getElementById('disc-items-list');
    const rows = listEl ? listEl.querySelectorAll('.disc-item-row') : [];

    const items = [];
    let grandTotal = 0;

    rows.forEach(row => {
      const name = (row.querySelector('.disc-item-name').value || '').trim();
      const rawPrice = (row.querySelector('.disc-item-price').value || '').replace(/,/g, '');
      const price = parseFloat(rawPrice) || 0;
      const qty = parseInt(row.querySelector('.disc-item-qty').value) || 1;
      const subtotal = price * qty;

      if (name) {
        items.push({ name, price, qty, totalPrice: subtotal });
        grandTotal += subtotal;
      }
    });

    if (items.length === 0) {
      alert("⚠️ 최소 1개 이상의 구매 품목명을 입력해 주세요.");
      return;
    }

    const firstItem = items[0];
    const itemName = items.length === 1 ? firstItem.name : `${firstItem.name} 외 ${items.length - 1}건`;
    const unitPrice = firstItem.price;
    const qty = firstItem.qty;
    const totalPrice = grandTotal;

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
          totalPrice,
          items
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
        items,
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

  function handleFormKeyDown(e) {
    if (e.key === 'Enter' || e.keyCode === 13) {
      e.preventDefault();
      return false;
    }
  }

  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  return {
    render,
    switchSubTab,
    handleSearch,
    handleFormKeyDown,
    formatPriceInput,
    formatRowPrice,
    addItemRow,
    removeItemRow,
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