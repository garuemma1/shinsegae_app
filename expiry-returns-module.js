/**
 * ⏳ 유효기간 임박 & 제약사/도매상 반품 대장 시스템 모듈 (ExpiryReturnsModule)
 * 365메가스타약국 HR/OPS 플랫폼 전용
 * - 조제실(전문약)/매대(일반약) 3~6개월 전 유효기간 임박약 전 직원 상시 등록
 * - 3단계 라이프사이클: ⏳ 임박대기 ➔ 📦 반품처리중 ➔ ✅ 반품완료/정산마감
 * - 도매상·제약사별 실시간 자동 집계 및 반품요청서 1초 복사/출력
 * - 132대 마스터 개발 대원칙 100% 준수 (Cloudinary 다중사진, Last-Write-Wins, 0.01초 N뱃지 연동)
 */
if (typeof window.ExpiryReturnsModule === 'undefined') {
  window.ExpiryReturnsModule = (function () {

    // 모듈 내부 상태
    let activeView = 'list';         // 'list' (전체 대장) | 'vendors' (도매상별 집계) | 'matrix' (D-Day 위험도)
    let statusFilter = 'ALL';        // 'ALL' | 'PENDING_RETURN' | 'PROCESSING_RETURN' | 'COMPLETED'
    let drugTypeFilter = 'ALL';      // 'ALL' | 'OTC' | 'ETC'
    let vendorFilter = 'ALL';        // 'ALL' | 특정 거래처명
    let periodFilter = 'ALL';        // 'ALL' | 'EXPIRED' | '3M' | '6M'
    let searchQuery = '';
    let searchDebounceTimer = null;

    // 사진 첨부 임시 저장소 (최대 5장)
    let selectedPhotos = []; // [{ id, data, isNew }]

    // 거래처(도매상/제약사) 기본 프리셋
    const DEFAULT_VENDORS = [
      '백제약품',
      '지오영',
      '훼밀리팜',
      '화천메디칼',
      '신덕약품',
      '동양약품',
      '일동제약',
      '대웅제약',
      '종근당',
      '유한양행',
      'JW중외제약',
      '한미약품',
      '보령제약',
      '동국제약',
      'GC녹십자'
    ];

    // ────────────────────────────────────────────────────────────
    // 🛡️ 헬퍼 함수들 (규칙 61, 5, 19, 104)
    // ────────────────────────────────────────────────────────────
    function escapeHTML(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function parseVal(val) {
      if (val === null || val === undefined) return 0;
      if (typeof val === 'number') return isNaN(val) ? 0 : val;
      const clean = String(val).replace(/[^0-9.-]/g, '');
      const num = parseFloat(clean);
      return isNaN(num) ? 0 : Math.round(num);
    }

    function formatKRW(num) {
      return (parseVal(num)).toLocaleString('ko-KR') + '원';
    }

    // 유효기간 D-Day 계산 엔진
    function calculateExpiryDDay(expiryDateStr) {
      if (!expiryDateStr) return { days: 9999, months: 999, label: '미정', status: 'UNKNOWN', badgeClass: 'bg-slate-100 text-slate-700 border-slate-300' };

      const cleanDate = expiryDateStr.trim().replace(/\./g, '-').replace(/\//g, '-');
      let targetDate;

      // 'YYYY-MM' 형식인 경우 해당 월의 말일로 계산
      if (/^\d{4}-\d{2}$/.test(cleanDate)) {
        const parts = cleanDate.split('-');
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        targetDate = new Date(y, m, 0, 23, 59, 59); // 해당 월 마지막 날
      } else {
        targetDate = new Date(cleanDate + 'T23:59:59');
      }

      if (isNaN(targetDate.getTime())) {
        return { days: 9999, months: 999, label: expiryDateStr, status: 'UNKNOWN', badgeClass: 'bg-slate-100 text-slate-700 border-slate-300' };
      }

      const now = new Date();
      const diffMs = targetDate.getTime() - now.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      const diffMonths = (targetDate.getFullYear() - now.getFullYear()) * 12 + (targetDate.getMonth() - now.getMonth());

      if (diffDays < 0) {
        return {
          days: diffDays,
          months: diffMonths,
          label: `만료 지남 (D+${Math.abs(diffDays)})`,
          status: 'EXPIRED',
          badgeClass: 'bg-red-600 text-white font-black border-red-700 shadow-sm'
        };
      } else if (diffDays <= 30) {
        return {
          days: diffDays,
          months: diffMonths,
          label: `D-${diffDays}일 (초긴급)`,
          status: 'CRITICAL',
          badgeClass: 'bg-rose-500 text-white font-extrabold border-rose-600 animate-pulse'
        };
      } else if (diffDays <= 90) {
        return {
          days: diffDays,
          months: diffMonths,
          label: `D-${diffDays}일 (3개월이내)`,
          status: 'URGENT',
          badgeClass: 'bg-amber-500 text-white font-extrabold border-amber-600'
        };
      } else if (diffDays <= 180) {
        return {
          days: diffDays,
          months: diffMonths,
          label: `D-${diffDays}일 (6개월이내)`,
          status: 'WARNING',
          badgeClass: 'bg-yellow-400 text-yellow-950 font-bold border-yellow-500'
        };
      } else {
        return {
          days: diffDays,
          months: diffMonths,
          label: `D-${diffDays}일 (여유)`,
          status: 'SAFE',
          badgeClass: 'bg-emerald-100 text-emerald-800 font-semibold border-emerald-300'
        };
      }
    }

    // ────────────────────────────────────────────────────────────
    // 🎨 메인 화면 렌더링 (render)
    // ────────────────────────────────────────────────────────────
    function render(containerId) {
      const target = document.getElementById(containerId || 'module-content');
      if (!target) return;

      const currUser = window.SheetsSync.getCurrentUser();
      const isDirector = currUser && currUser.role === '약국장';
      const allReturns = (window.SheetsSync.getExpiryReturns ? window.SheetsSync.getExpiryReturns() : []) || [];

      // 전체 통계 연산
      const pendingList = allReturns.filter(r => r.status === 'PENDING_RETURN');
      const processingList = allReturns.filter(r => r.status === 'PROCESSING_RETURN');
      const completedList = allReturns.filter(r => r.status === 'COMPLETED');

      const expiredCount = allReturns.filter(r => {
        const d = calculateExpiryDDay(r.expiryDate);
        return d.status === 'EXPIRED';
      }).length;

      const urgent3MCount = allReturns.filter(r => {
        const d = calculateExpiryDDay(r.expiryDate);
        return d.status === 'CRITICAL' || d.status === 'URGENT';
      }).length;

      const totalPendingAmount = pendingList.reduce((sum, r) => sum + parseVal(r.estimatedReturnAmount), 0);
      const totalProcessingAmount = processingList.reduce((sum, r) => sum + parseVal(r.estimatedReturnAmount), 0);
      const totalSettledAmount = completedList.reduce((sum, r) => sum + parseVal(r.actualSettledAmount || r.estimatedReturnAmount), 0);

      // 고유 거래처 목록 추출
      const vendorSet = new Set();
      allReturns.forEach(r => { if (r.vendor) vendorSet.add(r.vendor); });
      const currentVendors = Array.from(vendorSet);

      target.innerHTML = `
        <div class="expiry-returns-wrapper p-3 sm:p-5 md:p-6 space-y-4 sm:space-y-6 max-w-7xl mx-auto" style="min-height: 100dvh;">

          <!-- 1. 상단 마스터 헤더 -->
          <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div class="space-y-1">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-xl sm:text-2xl">⏳</span>
                <h2 class="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                  유효기간 임박 & 제약사 반품 대장
                </h2>
                <span class="text-[11px] px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold border border-amber-300 whitespace-nowrap">
                  실시간 반품 파이프라인
                </span>
                ${urgent3MCount > 0 ? `
                  <span class="text-[11px] px-2.5 py-0.5 rounded-full bg-red-100 text-red-700 font-black border border-red-300 animate-pulse">
                    🚨 3개월 임박 ${urgent3MCount}건
                  </span>
                ` : ''}
              </div>
              <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed break-keep">
                조제실/매대 3~6개월 전 유효기간 임박약 등록 ➔ 각 도매상·제약사별 반품 요청서 자동 집계 ➔ 약국장 최종 정산 승인
              </p>
            </div>

            <!-- 신규 등록 & 액션 버튼 그룹 -->
            <div class="flex items-center gap-2 w-full sm:w-auto pt-1 sm:pt-0">
              <button
                type="button"
                onclick="ExpiryReturnsModule.openAddModal()"
                class="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 bg-gradient-to-r from-blue-700 to-indigo-800 hover:from-blue-800 hover:to-indigo-900 text-white shadow-md transition transform active:scale-95 whitespace-nowrap"
              >
                <i class="fas fa-plus-circle"></i>
                <span>+ 임박약 / 반품 등록</span>
              </button>

              <button
                type="button"
                onclick="ExpiryReturnsModule.openVendorStatementModal()"
                class="flex-1 sm:flex-initial px-3.5 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 shadow-sm transition whitespace-nowrap"
                title="도매상 방문 시 영업사원 인계용 반품명세서 1초 복사/출력"
              >
                <i class="fas fa-file-invoice text-blue-600"></i>
                <span>반품명세서 추출</span>
              </button>
            </div>
          </div>

          <!-- 2. 3대 핵심 요약 지표 카드 (KPI Dashboard) -->
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <!-- 1단계 대기 -->
            <div 
              onclick="ExpiryReturnsModule.setStatusFilter('PENDING_RETURN')" 
              class="cursor-pointer bg-amber-50/70 dark:bg-amber-950/30 p-3.5 sm:p-4 rounded-2xl border border-amber-200 dark:border-amber-900/60 shadow-sm hover:shadow transition"
            >
              <div class="flex items-center justify-between text-xs font-bold text-amber-800 dark:text-amber-300 mb-1">
                <span>⏳ ① 임박·반품대기</span>
                <span class="text-[10px] px-1.5 py-0.5 rounded bg-amber-200/80 dark:bg-amber-900/60">등록단계</span>
              </div>
              <div class="text-xl sm:text-2xl font-black text-amber-900 dark:text-amber-100">
                ${pendingList.length}<span class="text-xs font-normal ml-0.5">건</span>
              </div>
              <div class="text-[11px] font-semibold text-amber-700 dark:text-amber-400 mt-1 truncate">
                예상 ${formatKRW(totalPendingAmount)}
              </div>
            </div>

            <!-- 2단계 처리중 -->
            <div 
              onclick="ExpiryReturnsModule.setStatusFilter('PROCESSING_RETURN')" 
              class="cursor-pointer bg-blue-50/70 dark:bg-blue-950/30 p-3.5 sm:p-4 rounded-2xl border border-blue-200 dark:border-blue-900/60 shadow-sm hover:shadow transition"
            >
              <div class="flex items-center justify-between text-xs font-bold text-blue-800 dark:text-blue-300 mb-1">
                <span>📦 ② 반품처리중</span>
                <span class="text-[10px] px-1.5 py-0.5 rounded bg-blue-200/80 dark:bg-blue-900/60">영업인계</span>
              </div>
              <div class="text-xl sm:text-2xl font-black text-blue-900 dark:text-blue-100">
                ${processingList.length}<span class="text-xs font-normal ml-0.5">건</span>
              </div>
              <div class="text-[11px] font-semibold text-blue-700 dark:text-blue-400 mt-1 truncate">
                진행 ${formatKRW(totalProcessingAmount)}
              </div>
            </div>

            <!-- 3단계 완료/정산 -->
            <div 
              onclick="ExpiryReturnsModule.setStatusFilter('COMPLETED')" 
              class="cursor-pointer bg-emerald-50/70 dark:bg-emerald-950/30 p-3.5 sm:p-4 rounded-2xl border border-emerald-200 dark:border-emerald-900/60 shadow-sm hover:shadow transition"
            >
              <div class="flex items-center justify-between text-xs font-bold text-emerald-800 dark:text-emerald-300 mb-1">
                <span>✅ ③ 반품완료·정산</span>
                <span class="text-[10px] px-1.5 py-0.5 rounded bg-emerald-200/80 dark:bg-emerald-900/60">정산마감</span>
              </div>
              <div class="text-xl sm:text-2xl font-black text-emerald-900 dark:text-emerald-100">
                ${completedList.length}<span class="text-xs font-normal ml-0.5">건</span>
              </div>
              <div class="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 mt-1 truncate">
                정산 ${formatKRW(totalSettledAmount)}
              </div>
            </div>

            <!-- 위험도 요약 -->
            <div 
              onclick="ExpiryReturnsModule.setPeriodFilter('3M')" 
              class="cursor-pointer bg-rose-50/70 dark:bg-rose-950/30 p-3.5 sm:p-4 rounded-2xl border border-rose-200 dark:border-rose-900/60 shadow-sm hover:shadow transition"
            >
              <div class="flex items-center justify-between text-xs font-bold text-rose-800 dark:text-rose-300 mb-1">
                <span>🚨 임박 및 만료약</span>
                <span class="text-[10px] px-1.5 py-0.5 rounded bg-rose-200/80 dark:bg-rose-900/60">주의관찰</span>
              </div>
              <div class="text-xl sm:text-2xl font-black text-rose-900 dark:text-rose-100">
                ${urgent3MCount + expiredCount}<span class="text-xs font-normal ml-0.5">건</span>
              </div>
              <div class="text-[11px] font-semibold text-rose-700 dark:text-rose-400 mt-1 truncate">
                만료 ${expiredCount}건 / 3M임박 ${urgent3MCount}건
              </div>
            </div>
          </div>

          <!-- 3. 뷰 모드 탭 스위처 & 통합 필터 컨트롤러 (규칙 58 모바일 가로스크롤) -->
          <div class="bg-white dark:bg-slate-900 p-3 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
            
            <!-- 3대 뷰 모드 전환 버튼 -->
            <div class="flex items-center justify-between flex-wrap gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div class="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                <button
                  type="button"
                  onclick="ExpiryReturnsModule.setView('list')"
                  class="px-3 py-1.5 rounded-lg text-xs font-bold transition ${activeView === 'list' ? 'bg-white dark:bg-slate-700 text-blue-700 dark:text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}"
                >
                  <i class="fas fa-list-ul mr-1"></i> 전체 대장 뷰
                </button>
                <button
                  type="button"
                  onclick="ExpiryReturnsModule.setView('vendors')"
                  class="px-3 py-1.5 rounded-lg text-xs font-bold transition ${activeView === 'vendors' ? 'bg-white dark:bg-slate-700 text-blue-700 dark:text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}"
                >
                  <i class="fas fa-building mr-1"></i> 도매상·제약사별 집계 뷰
                </button>
                <button
                  type="button"
                  onclick="ExpiryReturnsModule.setView('matrix')"
                  class="px-3 py-1.5 rounded-lg text-xs font-bold transition ${activeView === 'matrix' ? 'bg-white dark:bg-slate-700 text-blue-700 dark:text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'}"
                >
                  <i class="fas fa-calendar-check mr-1"></i> D-Day 위험도 매트릭스
                </button>
              </div>

              <!-- 실시간 검색창 (한글 IME 보존 & 120ms 디바운스 - 규칙 50, 92) -->
              <div class="relative w-full sm:w-72">
                <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
                <input
                  type="text"
                  id="exp-search-input"
                  value="${escapeHTML(searchQuery)}"
                  oninput="ExpiryReturnsModule.handleSearchInput(this.value)"
                  placeholder="약품명, 거래처, 제조사 검색..."
                  class="w-full pl-8 pr-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
              </div>
            </div>

            <!-- 세부 필터 칩 (가로 터치 스크롤 - 규칙 58) -->
            <div class="flex items-center gap-2 overflow-x-auto whitespace-nowrap no-scrollbar py-1 text-xs">
              
              <!-- 상태 필터 -->
              <span class="text-[11px] font-bold text-slate-400 pl-1">상태:</span>
              <button onclick="ExpiryReturnsModule.setStatusFilter('ALL')" class="px-2.5 py-1 rounded-lg font-bold border transition ${statusFilter === 'ALL' ? 'bg-slate-800 text-white border-slate-800' : 'bg-slate-50 text-slate-600 border-slate-200'}">
                전체 (${allReturns.length})
              </button>
              <button onclick="ExpiryReturnsModule.setStatusFilter('PENDING_RETURN')" class="px-2.5 py-1 rounded-lg font-bold border transition ${statusFilter === 'PENDING_RETURN' ? 'bg-amber-500 text-white border-amber-500' : 'bg-slate-50 text-amber-700 border-slate-200'}">
                ⏳ 임박대기 (${pendingList.length})
              </button>
              <button onclick="ExpiryReturnsModule.setStatusFilter('PROCESSING_RETURN')" class="px-2.5 py-1 rounded-lg font-bold border transition ${statusFilter === 'PROCESSING_RETURN' ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-blue-700 border-slate-200'}">
                📦 반품처리중 (${processingList.length})
              </button>
              <button onclick="ExpiryReturnsModule.setStatusFilter('COMPLETED')" class="px-2.5 py-1 rounded-lg font-bold border transition ${statusFilter === 'COMPLETED' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-slate-50 text-emerald-700 border-slate-200'}">
                ✅ 정산완료 (${completedList.length})
              </button>

              <span class="text-slate-300">|</span>

              <!-- 유효기간 잔여 기간 필터 -->
              <span class="text-[11px] font-bold text-slate-400">유효기간:</span>
              <button onclick="ExpiryReturnsModule.setPeriodFilter('ALL')" class="px-2.5 py-1 rounded-lg font-bold border transition ${periodFilter === 'ALL' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 text-slate-600 border-slate-200'}">
                전체기한
              </button>
              <button onclick="ExpiryReturnsModule.setPeriodFilter('EXPIRED')" class="px-2.5 py-1 rounded-lg font-bold border transition ${periodFilter === 'EXPIRED' ? 'bg-red-600 text-white border-red-600' : 'bg-slate-50 text-red-600 border-slate-200'}">
                🔴 만료초과 (${expiredCount})
              </button>
              <button onclick="ExpiryReturnsModule.setPeriodFilter('3M')" class="px-2.5 py-1 rounded-lg font-bold border transition ${periodFilter === '3M' ? 'bg-rose-500 text-white border-rose-500' : 'bg-slate-50 text-rose-600 border-slate-200'}">
                ⚠️ 3개월 이내 (${urgent3MCount})
              </button>
              <button onclick="ExpiryReturnsModule.setPeriodFilter('6M')" class="px-2.5 py-1 rounded-lg font-bold border transition ${periodFilter === '6M' ? 'bg-amber-500 text-white border-amber-500' : 'bg-slate-50 text-amber-700 border-slate-200'}">
                💡 6개월 이내
              </button>

              <span class="text-slate-300">|</span>

              <!-- 약품 구분 필터 -->
              <span class="text-[11px] font-bold text-slate-400">구분:</span>
              <button onclick="ExpiryReturnsModule.setDrugTypeFilter('ALL')" class="px-2.5 py-1 rounded-lg font-bold border transition ${drugTypeFilter === 'ALL' ? 'bg-slate-700 text-white border-slate-700' : 'bg-slate-50 text-slate-600 border-slate-200'}">
                전체
              </button>
              <button onclick="ExpiryReturnsModule.setDrugTypeFilter('OTC')" class="px-2.5 py-1 rounded-lg font-bold border transition ${drugTypeFilter === 'OTC' ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-blue-700 border-slate-200'}">
                💊 일반약
              </button>
              <button onclick="ExpiryReturnsModule.setDrugTypeFilter('ETC')" class="px-2.5 py-1 rounded-lg font-bold border transition ${drugTypeFilter === 'ETC' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-slate-50 text-emerald-700 border-slate-200'}">
                💉 전문약
              </button>

              <!-- 거래처 선택 드롭다운 -->
              ${currentVendors.length > 0 ? `
                <span class="text-slate-300">|</span>
                <select 
                  onchange="ExpiryReturnsModule.setVendorFilter(this.value)"
                  class="px-2 py-1 rounded-lg font-bold border border-slate-200 bg-slate-50 text-slate-700 text-xs focus:outline-none"
                >
                  <option value="ALL" ${vendorFilter === 'ALL' ? 'selected' : ''}>🏢 거래처 전체</option>
                  ${currentVendors.map(v => `<option value="${escapeHTML(v)}" ${vendorFilter === v ? 'selected' : ''}>${escapeHTML(v)}</option>`).join('')}
                </select>
              ` : ''}

            </div>

          </div>

          <!-- 4. 메인 콘텐츠 컨테이너 (3대 뷰 모드별 렌더링) -->
          <div id="exp-main-content-container">
            ${renderViewContent(allReturns, isDirector)}
          </div>

        </div>

        <!-- 5. 전역 모달 렌더링 컨테이너 -->
        <div id="exp-modal-container"></div>
      `;
    }

    // ────────────────────────────────────────────────────────────
    // 🔀 뷰 모드별 콘텐츠 렌더링 분기
    // ────────────────────────────────────────────────────────────
    function renderViewContent(allReturns, isDirector) {
      // [1] 필터링
      let filtered = allReturns.filter(item => {
        if (!item) return false;

        // 상태 필터
        if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;

        // 약품 구분 필터
        if (drugTypeFilter !== 'ALL' && item.drugType !== drugTypeFilter) return false;

        // 거래처 필터
        if (vendorFilter !== 'ALL' && item.vendor !== vendorFilter) return false;

        // 유효기간 기간 필터
        if (periodFilter !== 'ALL') {
          const dday = calculateExpiryDDay(item.expiryDate);
          if (periodFilter === 'EXPIRED' && dday.status !== 'EXPIRED') return false;
          if (periodFilter === '3M' && dday.status !== 'CRITICAL' && dday.status !== 'URGENT' && dday.status !== 'EXPIRED') return false;
          if (periodFilter === '6M' && dday.days > 180) return false;
        }

        // 검색어 필터
        if (searchQuery) {
          const q = searchQuery.toLowerCase().trim();
          const matchName = (item.drugName || '').toLowerCase().includes(q);
          const matchVendor = (item.vendor || '').toLowerCase().includes(q);
          const matchMfr = (item.manufacturer || '').toLowerCase().includes(q);
          const matchMemo = (item.memo || '').toLowerCase().includes(q);
          if (!matchName && !matchVendor && !matchMfr && !matchMemo) return false;
        }

        return true;
      });

      // [2] 최신순 내림차순 정렬 (규칙 1, 104, 122)
      filtered.sort((a, b) => {
        const tA = (typeof a.updatedAt === 'number') ? a.updatedAt : (parseVal(a.updatedAt) || parseVal(a.createdAt) || 0);
        const tB = (typeof b.updatedAt === 'number') ? b.updatedAt : (parseVal(b.updatedAt) || parseVal(b.createdAt) || 0);
        return tB - tA;
      });

      if (activeView === 'vendors') {
        return renderVendorGroupView(filtered, isDirector);
      } else if (activeView === 'matrix') {
        return renderMatrixView(filtered, isDirector);
      } else {
        return renderListView(filtered, isDirector);
      }
    }

    // ────────────────────────────────────────────────────────────
    // 📋 [뷰 1] 전체 대장 뷰 렌더링
    // ────────────────────────────────────────────────────────────
    function renderListView(items, isDirector) {
      if (items.length === 0) {
        return `
          <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center shadow-sm">
            <div class="w-16 h-16 mx-auto mb-3 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 text-2xl">
              <i class="fas fa-boxes-packing"></i>
            </div>
            <h3 class="text-base font-bold text-slate-700 dark:text-slate-300 mb-1">
              해당 조건의 유효기간 임박/반품 내역이 없습니다.
            </h3>
            <p class="text-xs text-slate-400 mb-4">
              새로운 유효기간 임박 의약품이 발견되면 상단 [+ 임박약/반품 등록] 버튼을 눌러 등록하세요.
            </p>
            <button
              type="button"
              onclick="ExpiryReturnsModule.openAddModal()"
              class="px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition"
            >
              <i class="fas fa-plus mr-1"></i> 지금 첫 약품 등록하기
            </button>
          </div>
        `;
      }

      return `
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
          ${items.map(item => renderReturnCard(item, isDirector)).join('')}
        </div>
      `;
    }

    // 개별 카드 렌더링 (단일 품목 카드)
    function renderReturnCard(item, isDirector) {
      const dday = calculateExpiryDDay(item.expiryDate);
      const isOTC = item.drugType === 'OTC';
      const photos = Array.isArray(item.photos) ? item.photos : [];

      // 상태별 뱃지
      let statusBadge = '';
      if (item.status === 'PENDING_RETURN') {
        statusBadge = `<span class="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300">⏳ 1단계: 임박/반품대기</span>`;
      } else if (item.status === 'PROCESSING_RETURN') {
        statusBadge = `<span class="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-blue-100 text-blue-900 border border-blue-300">📦 2단계: 반품처리중</span>`;
      } else if (item.status === 'COMPLETED') {
        statusBadge = `<span class="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-900 border border-emerald-300">✅ 3단계: 정산완료</span>`;
      }

      return `
        <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm hover:shadow-md transition flex flex-col justify-between space-y-3 relative group">
          
          <!-- 상단: 구분/D-Day & 상태 -->
          <div class="space-y-2">
            <div class="flex items-center justify-between gap-1 flex-wrap">
              <div class="flex items-center gap-1.5">
                <span class="px-2 py-0.5 rounded-md text-[10.5px] font-extrabold ${isOTC ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}">
                  ${isOTC ? '💊 일반약' : '💉 전문약'}
                </span>
                <span class="px-2 py-0.5 rounded-full text-[10.5px] font-bold border ${dday.badgeClass}">
                  ${dday.label}
                </span>
              </div>
              <div>${statusBadge}</div>
            </div>

            <!-- 약품명 및 규격 -->
            <div>
              <h4 class="text-sm font-extrabold text-slate-900 dark:text-white leading-tight break-keep">
                ${escapeHTML(item.drugName)}
              </h4>
              ${item.spec ? `
                <p class="text-[11.5px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
                  규격: ${escapeHTML(item.spec)}
                </p>
              ` : ''}
            </div>

            <!-- 거래처 / 제조사 태그 -->
            <div class="flex items-center gap-1.5 flex-wrap text-xs">
              <span class="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold border border-slate-200 dark:border-slate-700">
                🏢 거래처: ${escapeHTML(item.vendor || '미지정')}
              </span>
              ${item.manufacturer ? `
                <span class="px-2 py-0.5 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-500 font-semibold">
                  제조: ${escapeHTML(item.manufacturer)}
                </span>
              ` : ''}
            </div>

            <!-- 수량 및 금액 그리드 -->
            <div class="bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-xl border border-slate-200/70 dark:border-slate-700/60 space-y-1 text-xs">
              <div class="flex items-center justify-between">
                <span class="text-slate-500 font-semibold">수량:</span>
                <span class="font-extrabold text-slate-900 dark:text-white text-sm">
                  ${item.qty} <span class="text-xs font-normal text-slate-500">${escapeHTML(item.unit || '개')}</span>
                </span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-slate-500 font-semibold">유효기간:</span>
                <span class="font-bold text-slate-800 dark:text-slate-200">
                  📅 ${escapeHTML(item.expiryDate || '미정')}
                </span>
              </div>
              <div class="flex items-center justify-between pt-1 border-t border-slate-200 dark:border-slate-700">
                <span class="text-slate-500 font-semibold">반품 예상가:</span>
                <span class="font-extrabold text-blue-700 dark:text-blue-400">
                  ${formatKRW(item.estimatedReturnAmount)}
                </span>
              </div>
              ${item.status === 'COMPLETED' ? `
                <div class="flex items-center justify-between font-black text-emerald-700 dark:text-emerald-400">
                  <span>실제 정산액:</span>
                  <span>${formatKRW(item.actualSettledAmount || item.estimatedReturnAmount)}</span>
                </div>
              ` : ''}
            </div>

            <!-- 사진 썸네일 그리드 (규칙 120 - 최대 5장 전역 라이트박스 갤러리) -->
            ${photos.length > 0 ? `
              <div class="pt-1">
                <div class="flex items-center gap-1.5 overflow-x-auto pb-1">
                  ${photos.map((photoUrl, idx) => `
                    <div 
                      onclick="ExpiryReturnsModule.openPhotoLightbox('${item.id}', ${idx})" 
                      class="cursor-pointer relative w-12 h-12 rounded-lg overflow-hidden border border-slate-200 shadow-2xs hover:scale-105 transition shrink-0"
                    >
                      <img src="${escapeHTML(photoUrl)}" class="w-full h-full object-cover" alt="약품사진">
                      ${photos.length > 1 && idx === 0 ? `
                        <span class="absolute bottom-0 right-0 bg-black/70 text-white text-[9px] font-bold px-1 rounded-tl">
                          ${photos.length}장
                        </span>
                      ` : ''}
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : ''}

            <!-- 비고 메모 & 이력 -->
            ${item.memo ? `
              <p class="text-xs text-slate-600 dark:text-slate-400 bg-amber-50/50 dark:bg-amber-950/20 p-2 rounded-lg border border-amber-100 dark:border-amber-900/40 break-keep">
                📝 ${escapeHTML(item.memo)}
              </p>
            ` : ''}

            <!-- 인계 및 정산 상태 이력 정보 -->
            ${item.returnHandoverDate ? `
              <div class="text-[11px] text-slate-400 leading-tight">
                🚚 <strong>인계:</strong> ${escapeHTML(item.returnHandoverDate)} (${escapeHTML(item.returnCollector || '영업담당')})
              </div>
            ` : ''}
            ${item.settledDate ? `
              <div class="text-[11px] text-emerald-600 font-semibold leading-tight">
                💳 <strong>정산완료:</strong> ${escapeHTML(item.settledDate)}
              </div>
            ` : ''}
          </div>

          <!-- 하단: 작성자 정보 & 약국장/담당자 액션 컨트롤러 -->
          <div class="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
            <div class="flex items-center justify-between text-[11px] text-slate-400">
              <span>등록: ${escapeHTML(item.registeredBy || '직원')} (${escapeHTML(item.registeredByRole || '직원')})</span>
              <span>${escapeHTML(item.createdAt || '')}</span>
            </div>

            <!-- 상태 전환 버튼 그룹 (약국장 1-Click 원터치) -->
            <div class="flex items-center gap-1.5 pt-1">
              ${item.status === 'PENDING_RETURN' ? `
                <button
                  type="button"
                  onclick="ExpiryReturnsModule.openHandoverModal('${item.id}')"
                  class="flex-1 py-1.5 px-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-xs transition active:scale-95 flex items-center justify-center gap-1"
                >
                  <i class="fas fa-truck"></i>
                  <span>📦 반품 수거/인계</span>
                </button>
              ` : ''}

              ${item.status === 'PROCESSING_RETURN' ? `
                <button
                  type="button"
                  onclick="ExpiryReturnsModule.openSettleModal('${item.id}')"
                  class="flex-1 py-1.5 px-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs transition active:scale-95 flex items-center justify-center gap-1"
                >
                  <i class="fas fa-check-circle"></i>
                  <span>✅ 반품정산 확정</span>
                </button>
              ` : ''}

              ${item.status === 'COMPLETED' ? `
                <button
                  type="button"
                  onclick="ExpiryReturnsModule.revertToProcessing('${item.id}')"
                  class="flex-1 py-1.5 px-2 rounded-xl text-[11.5px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-300 transition"
                  title="정산 취소 후 다시 처리중으로 복원"
                >
                  <i class="fas fa-undo"></i>
                  <span>처리중으로 복원</span>
                </button>
              ` : ''}

              <!-- 수정 버튼 -->
              <button
                type="button"
                onclick="ExpiryReturnsModule.openEditModal('${item.id}')"
                class="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition"
                title="상세 내역 수정"
              >
                <i class="fas fa-edit"></i>
              </button>

              <!-- 영구 삭제 버튼 (약국장 최고관리자 또는 작성자) -->
              ${isDirector ? `
                <button
                  type="button"
                  onclick="ExpiryReturnsModule.confirmDelete('${item.id}')"
                  class="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 transition"
                  title="내역 영구 삭제 (블랙리스트 보존)"
                >
                  <i class="fas fa-trash-alt"></i>
                </button>
              ` : ''}
            </div>

          </div>

        </div>
      `;
    }

    // ────────────────────────────────────────────────────────────
    // 🏢 [뷰 2] 도매상·제약사별 스마트 집계 뷰 렌더링
    // ────────────────────────────────────────────────────────────
    function renderVendorGroupView(items, isDirector) {
      // 거래처별 그룹화
      const vendorGroups = {};

      items.forEach(item => {
        const vendor = item.vendor || '기타 거래처';
        if (!vendorGroups[vendor]) {
          vendorGroups[vendor] = {
            vendor: vendor,
            items: [],
            pendingCount: 0,
            pendingAmount: 0,
            processingCount: 0,
            processingAmount: 0,
            completedCount: 0,
            completedAmount: 0,
            totalCount: 0,
            totalAmount: 0
          };
        }
        const g = vendorGroups[vendor];
        g.items.push(item);
        g.totalCount++;
        const amt = parseVal(item.estimatedReturnAmount);
        g.totalAmount += amt;

        if (item.status === 'PENDING_RETURN') {
          g.pendingCount++;
          g.pendingAmount += amt;
        } else if (item.status === 'PROCESSING_RETURN') {
          g.processingCount++;
          g.processingAmount += amt;
        } else if (item.status === 'COMPLETED') {
          g.completedCount++;
          g.completedAmount += parseVal(item.actualSettledAmount || item.estimatedReturnAmount);
        }
      });

      const groupList = Object.values(vendorGroups).sort((a, b) => b.totalAmount - a.totalAmount);

      if (groupList.length === 0) {
        return `
          <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center shadow-sm">
            <p class="text-sm font-bold text-slate-500">집계할 거래처별 내역이 없습니다.</p>
          </div>
        `;
      }

      return `
        <div class="space-y-4 sm:space-y-6">
          <div class="bg-blue-50 dark:bg-blue-950/40 p-4 rounded-2xl border border-blue-200 dark:border-blue-900 text-xs text-blue-900 dark:text-blue-200 flex items-center justify-between flex-wrap gap-2">
            <div class="flex items-center gap-2">
              <i class="fas fa-info-circle text-blue-600 text-base"></i>
              <span>도매상 방문 시 우측의 <strong>[📄 반품요청서 1초 복사]</strong> 버튼을 누르면 해당 거래처 반품 내역을 카카오톡 텍스트나 인쇄용 서식으로 즉시 추출할 수 있습니다.</span>
            </div>
            <span class="font-extrabold text-blue-800 dark:text-blue-300">총 ${groupList.length}개 거래처</span>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            ${groupList.map(g => `
              <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm space-y-4">
                
                <!-- 거래처 카드 헤더 -->
                <div class="flex items-start justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div>
                    <h3 class="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                      <i class="fas fa-building text-blue-600"></i>
                      <span>${escapeHTML(g.vendor)}</span>
                    </h3>
                    <p class="text-xs text-slate-400 mt-0.5">
                      총 ${g.totalCount}개 품목 • 총합 ${formatKRW(g.totalAmount)}
                    </p>
                  </div>
                  
                  <button
                    type="button"
                    onclick="ExpiryReturnsModule.copyVendorStatement('${escapeHTML(g.vendor)}')"
                    class="px-3 py-1.5 rounded-xl text-xs font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 shadow-2xs transition flex items-center gap-1 active:scale-95"
                  >
                    <i class="fas fa-copy"></i>
                    <span>반품서 복사</span>
                  </button>
                </div>

                <!-- 3대 상태별 집계 칩 -->
                <div class="grid grid-cols-3 gap-2 text-center">
                  <div class="bg-amber-50 dark:bg-amber-950/30 p-2.5 rounded-xl border border-amber-200/80">
                    <div class="text-[10.5px] font-bold text-amber-800">⏳ 대기</div>
                    <div class="text-sm sm:text-base font-black text-amber-900">${g.pendingCount}건</div>
                    <div class="text-[10px] text-amber-700 truncate">${formatKRW(g.pendingAmount)}</div>
                  </div>
                  <div class="bg-blue-50 dark:bg-blue-950/30 p-2.5 rounded-xl border border-blue-200/80">
                    <div class="text-[10.5px] font-bold text-blue-800">📦 처리중</div>
                    <div class="text-sm sm:text-base font-black text-blue-900">${g.processingCount}건</div>
                    <div class="text-[10px] text-blue-700 truncate">${formatKRW(g.processingAmount)}</div>
                  </div>
                  <div class="bg-emerald-50 dark:bg-emerald-950/30 p-2.5 rounded-xl border border-emerald-200/80">
                    <div class="text-[10.5px] font-bold text-emerald-800">✅ 정산완료</div>
                    <div class="text-sm sm:text-base font-black text-emerald-900">${g.completedCount}건</div>
                    <div class="text-[10px] text-emerald-700 truncate">${formatKRW(g.completedAmount)}</div>
                  </div>
                </div>

                <!-- 세부 품목 아코디언 / 목록 요약 -->
                <div class="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                  ${g.items.map(i => {
                    const dday = calculateExpiryDDay(i.expiryDate);
                    return `
                      <div class="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 text-xs border border-slate-100 dark:border-slate-700/50">
                        <div class="min-w-0 pr-2">
                          <div class="font-bold text-slate-800 dark:text-slate-200 truncate">
                            ${escapeHTML(i.drugName)}
                          </div>
                          <div class="text-[10.5px] text-slate-400">
                            ${i.qty}${escapeHTML(i.unit || '개')} • 만료: ${escapeHTML(i.expiryDate)} (${dday.label})
                          </div>
                        </div>
                        <div class="text-right shrink-0">
                          <span class="font-extrabold text-slate-800 dark:text-slate-100">
                            ${formatKRW(i.estimatedReturnAmount)}
                          </span>
                          <div>
                            ${i.status === 'PENDING_RETURN' ? '<span class="text-[9.5px] px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 font-bold">대기</span>' : ''}
                            ${i.status === 'PROCESSING_RETURN' ? '<span class="text-[9.5px] px-1.5 py-0.2 rounded bg-blue-100 text-blue-800 font-bold">처리중</span>' : ''}
                            ${i.status === 'COMPLETED' ? '<span class="text-[9.5px] px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 font-bold">완료</span>' : ''}
                          </div>
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>

              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    // ────────────────────────────────────────────────────────────
    // ⏰ [뷰 3] D-Day 위험도 매트릭스 뷰 렌더링
    // ────────────────────────────────────────────────────────────
    function renderMatrixView(items, isDirector) {
      const expiredList = [];
      const criticalList = [];  // <= 30일
      const urgentList = [];    // <= 90일 (3개월)
      const warningList = [];   // <= 180일 (6개월)
      const safeList = [];      // > 180일

      items.forEach(item => {
        const d = calculateExpiryDDay(item.expiryDate);
        if (d.status === 'EXPIRED') expiredList.push(item);
        else if (d.status === 'CRITICAL') criticalList.push(item);
        else if (d.status === 'URGENT') urgentList.push(item);
        else if (d.status === 'WARNING') warningList.push(item);
        else safeList.push(item);
      });

      const matrixSections = [
        { title: '🔴 유효기간 만료 (지남)', desc: '즉시 반품 또는 폐기 처리 대상', list: expiredList, borderClass: 'border-red-300 bg-red-50/40', badgeClass: 'bg-red-600 text-white' },
        { title: '🟠 30일 이내 초긴급', desc: '도매상 영업사원 즉시 인계 요망', list: criticalList, borderClass: 'border-rose-300 bg-rose-50/40', badgeClass: 'bg-rose-500 text-white' },
        { title: '🟡 3개월 이내 임박', desc: '조제실/매약 소진 유도 또는 반품 준비', list: urgentList, borderClass: 'border-amber-300 bg-amber-50/40', badgeClass: 'bg-amber-500 text-white' },
        { title: '💡 6개월 이내 도래', desc: '사전 재고 점검 및 처방 동향 확인', list: warningList, borderClass: 'border-yellow-300 bg-yellow-50/40', badgeClass: 'bg-yellow-500 text-yellow-950' },
        { title: '🟢 6개월 이상 여유', desc: '정상 재고 상태', list: safeList, borderClass: 'border-emerald-200 bg-emerald-50/30', badgeClass: 'bg-emerald-600 text-white' }
      ];

      return `
        <div class="space-y-6">
          ${matrixSections.map(sec => `
            <div class="bg-white dark:bg-slate-900 rounded-2xl border ${sec.borderClass} p-4 sm:p-5 shadow-sm space-y-3">
              <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                <div class="flex items-center gap-2">
                  <h3 class="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                    ${sec.title}
                  </h3>
                  <span class="text-xs px-2 py-0.5 rounded-full font-bold ${sec.badgeClass}">
                    ${sec.list.length}건
                  </span>
                </div>
                <span class="text-xs text-slate-400">${sec.desc}</span>
              </div>

              ${sec.list.length === 0 ? `
                <p class="text-xs text-slate-400 py-2">해당 구간의 품목이 없습니다.</p>
              ` : `
                <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  ${sec.list.map(item => renderReturnCard(item, isDirector)).join('')}
                </div>
              `}
            </div>
          `).join('')}
        </div>
      `;
    }

    // ────────────────────────────────────────────────────────────
    // 📝 [모달 1] 신규 임박약 / 반품 등록 모달 (Cloudinary 최대 5장)
    // ────────────────────────────────────────────────────────────
    function openAddModal() {
      selectedPhotos = [];
      const currUser = window.SheetsSync.getCurrentUser();
      const modalTarget = document.getElementById('exp-modal-container');
      if (!modalTarget) return;

      const defaultDate = new Date();
      defaultDate.setMonth(defaultDate.getMonth() + 3);
      const defaultExpMonth = `${defaultDate.getFullYear()}-${String(defaultDate.getMonth() + 1).padStart(2, '0')}`;

      modalTarget.innerHTML = `
        <div class="modal-overlay" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.65); z-index:999999; display:flex; justify-content:center; align-items:flex-end sm:align-items:center; padding:0 sm:p-4;">
          <div class="modal-card bg-white dark:bg-slate-900 w-full sm:max-w-2xl rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90dvh] overflow-y-auto" style="border: 1px solid #cbd5e1;">
            
            <!-- 모달 헤더 -->
            <div class="flex items-center justify-between border-b border-slate-100 pb-3">
              <div class="flex items-center gap-2">
                <span class="text-xl">➕</span>
                <h3 class="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
                  유효기간 임박약 / 제약사 반품 등록
                </h3>
              </div>
              <button type="button" onclick="ExpiryReturnsModule.closeModal()" class="text-slate-400 hover:text-slate-700 text-xl font-bold p-1">&times;</button>
            </div>

            <!-- 등록 폼 -->
            <form onsubmit="ExpiryReturnsModule.handleAddSubmit(event)" class="space-y-3.5 text-xs">
              
              <!-- 1. 약품 구분 및 약품명 -->
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label class="block font-bold text-slate-700 dark:text-slate-200 mb-1">약품 구분 *</label>
                  <select id="exp-form-type" class="w-full h-10 px-3 rounded-xl border border-slate-300 bg-slate-50 font-bold text-slate-900 focus:ring-2 focus:ring-blue-500">
                    <option value="OTC" selected>💊 일반약 (매약)</option>
                    <option value="ETC">💉 전문약 (조제실)</option>
                  </select>
                </div>
                <div class="sm:col-span-2">
                  <label class="block font-bold text-slate-700 dark:text-slate-200 mb-1">약품명 *</label>
                  <input
                    type="text"
                    id="exp-form-name"
                    required
                    placeholder="예: 타이레놀정 500mg, 세레브렉스캡슐 등"
                    class="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white font-bold text-slate-900 focus:ring-2 focus:ring-blue-500"
                  >
                </div>
              </div>

              <!-- 2. 규격 / 포장단위 & 수량 / 단위 -->
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div>
                  <label class="block font-bold text-slate-700 mb-1">규격/포장</label>
                  <input type="text" id="exp-form-spec" placeholder="예: 10T/상자, 30C" class="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white font-semibold">
                </div>
                <div>
                  <label class="block font-bold text-slate-700 mb-1">수량 *</label>
                  <input 
                    type="number" 
                    id="exp-form-qty" 
                    required 
                    min="1" 
                    value="1" 
                    oninput="ExpiryReturnsModule.updateEstimatedAmount()"
                    class="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white font-bold text-slate-900"
                  >
                </div>
                <div>
                  <label class="block font-bold text-slate-700 mb-1">단위</label>
                  <select id="exp-form-unit" class="w-full h-10 px-3 rounded-xl border border-slate-300 bg-slate-50 font-bold">
                    <option value="개" selected>개</option>
                    <option value="상자">상자(Box)</option>
                    <option value="병">병(Bottle)</option>
                    <option value="포">포</option>
                    <option value="PTP">PTP</option>
                    <option value="T">T(정)</option>
                    <option value="C">C(캡슐)</option>
                  </select>
                </div>
                <div>
                  <label class="block font-bold text-slate-700 mb-1">유효기간 *</label>
                  <input 
                    type="month" 
                    id="exp-form-expiry" 
                    required 
                    value="${defaultExpMonth}"
                    onchange="ExpiryReturnsModule.updateFormDDayPreview()"
                    class="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white font-bold text-blue-700"
                  >
                </div>
              </div>

              <!-- 유효기간 D-Day 실시간 미리보기 뱃지 -->
              <div id="exp-form-dday-preview" class="p-2 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 font-bold text-xs flex items-center justify-between">
                <span>⏳ 잔여 유효기간 계산 중...</span>
              </div>

              <!-- 3. 거래처(도매상) & 제조사 & 단가/예상금액 -->
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label class="block font-bold text-slate-700 mb-1">거래처 (도매상/제약사) *</label>
                  <div class="space-y-1">
                    <select id="exp-form-vendor-select" onchange="ExpiryReturnsModule.handleVendorSelect(this.value)" class="w-full h-10 px-3 rounded-xl border border-slate-300 bg-slate-50 font-bold">
                      ${DEFAULT_VENDORS.map(v => `<option value="${v}">${v}</option>`).join('')}
                      <option value="CUSTOM">직접 입력 ➔</option>
                    </select>
                    <input type="text" id="exp-form-vendor-custom" placeholder="거래처명 직접 입력" style="display:none;" class="w-full h-10 px-3 rounded-xl border border-blue-400 bg-blue-50 font-bold">
                  </div>
                </div>

                <div>
                  <label class="block font-bold text-slate-700 mb-1">제조사 (제약사명)</label>
                  <input type="text" id="exp-form-manufacturer" placeholder="예: 유한양행, 대웅제약" class="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white font-semibold">
                </div>

                <div>
                  <label class="block font-bold text-slate-700 mb-1">매입 단가 (원)</label>
                  <input 
                    type="number" 
                    id="exp-form-cost" 
                    placeholder="0" 
                    value="0"
                    oninput="ExpiryReturnsModule.updateEstimatedAmount()"
                    class="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white font-bold"
                  >
                </div>
              </div>

              <!-- 총 반품 예상금액 자동 합산 박스 (규칙 4, 5) -->
              <div class="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                <span class="font-bold text-slate-600">💰 총 반품 예상 합산금액:</span>
                <span id="exp-form-total-preview" class="text-base font-black text-blue-700">0원</span>
              </div>

              <!-- 4. 사진 첨부 (규칙 120: Cloudinary 영구 호스팅 기반 최대 5장) -->
              <div class="space-y-1.5">
                <div class="flex items-center justify-between">
                  <label class="font-bold text-slate-700 flex items-center gap-1.5">
                    <i class="fas fa-camera text-blue-600"></i>
                    <span>약품 및 유효기간 인쇄면 사진 첨부 (최대 5장)</span>
                  </label>
                  <span id="exp-photo-counter" class="text-[11px] font-bold text-slate-400">0 / 5장</span>
                </div>
                
                <div class="flex items-center gap-2">
                  <label class="cursor-pointer px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 font-bold text-slate-700 text-xs flex items-center gap-1.5 transition">
                    <i class="fas fa-images"></i>
                    <span>사진 선택 / 촬영</span>
                    <input 
                      type="file" 
                      id="exp-photo-file-input" 
                      accept="image/*" 
                      multiple 
                      onchange="ExpiryReturnsModule.handlePhotoSelect(event)" 
                      style="display:none;"
                    >
                  </label>
                  <span class="text-[11px] text-slate-400">약품명과 유효기간 글씨가 선명하게 나오도록 촬영해 주세요.</span>
                </div>

                <!-- 사진 미리보기 그리드 -->
                <div id="exp-photo-preview-grid" class="flex items-center gap-2 overflow-x-auto py-2">
                  <!-- 동적 프리뷰 렌더링 -->
                </div>
              </div>

              <!-- 5. 비고 메모 -->
              <div>
                <label class="block font-bold text-slate-700 mb-1">비고 / 참고 메모</label>
                <textarea id="exp-form-memo" rows="2" placeholder="예: 개봉 10T 남음, 백제 영업사원 9/15 방문 시 인계 요망 등..." class="w-full p-2.5 rounded-xl border border-slate-300 bg-white font-semibold"></textarea>
              </div>

              <!-- 버튼 그룹 -->
              <div class="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button type="button" onclick="ExpiryReturnsModule.closeModal()" class="px-4 py-2.5 rounded-xl font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition">
                  취소
                </button>
                <button type="submit" id="exp-submit-btn" class="px-5 py-2.5 rounded-xl font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md transition flex items-center gap-1.5 active:scale-95">
                  <i class="fas fa-check"></i>
                  <span>등록 완료</span>
                </button>
              </div>

            </form>
          </div>
        </div>
      `;

      updateFormDDayPreview();
      updateEstimatedAmount();
    }

    // ────────────────────────────────────────────────────────────
    // 📸 사진 첨부 처리 핸들러 (규칙 108, 120 - Cloudinary 파이프라인)
    // ────────────────────────────────────────────────────────────
    function handlePhotoSelect(event) {
      const files = event.target.files;
      if (!files || files.length === 0) return;

      const remainingSlots = 5 - selectedPhotos.length;
      if (remainingSlots <= 0) {
        alert('사진은 최대 5장까지만 등록 가능합니다.');
        return;
      }

      const filesToProcess = Array.from(files).slice(0, remainingSlots);

      filesToProcess.forEach(file => {
        const reader = new FileReader();
        reader.onload = function (e) {
          const img = new Image();
          img.onload = function () {
            // 규칙 108: 480px / 0.4 quality 압축
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            const maxDim = 480;

            if (width > height && width > maxDim) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else if (height > maxDim) {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            const compressedBase64 = canvas.toDataURL('image/jpeg', 0.4);

            selectedPhotos.push({
              id: 'photo_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
              data: compressedBase64,
              isNew: true
            });

            renderPhotoPreviews();
          };
          img.src = e.target.result;
        };
        reader.readAsDataURL(file);
      });
    }

    function renderPhotoPreviews() {
      const container = document.getElementById('exp-photo-preview-grid');
      const counter = document.getElementById('exp-photo-counter');
      if (counter) counter.textContent = `${selectedPhotos.length} / 5장`;
      if (!container) return;

      container.innerHTML = selectedPhotos.map((p, idx) => `
        <div class="relative w-16 h-16 rounded-xl overflow-hidden border border-slate-300 shadow-sm shrink-0 group">
          <img src="${p.data}" class="w-full h-full object-cover" alt="미리보기">
          <button
            type="button"
            onclick="ExpiryReturnsModule.removePhoto(${idx})"
            class="absolute top-1 right-1 w-5 h-5 rounded-full bg-red-600 text-white font-black text-xs flex items-center justify-center shadow transition hover:scale-110"
            title="삭제"
          >&times;</button>
        </div>
      `).join('');
    }

    function removePhoto(index) {
      selectedPhotos.splice(index, 1);
      renderPhotoPreviews();
    }

    // ────────────────────────────────────────────────────────────
    // 🚚 [모달 2] 반품 수거 / 인계 확인 모달
    // ────────────────────────────────────────────────────────────
    function openHandoverModal(id) {
      const allReturns = window.SheetsSync.getExpiryReturns() || [];
      const item = allReturns.find(r => r.id === id);
      if (!item) return;

      const modalTarget = document.getElementById('exp-modal-container');
      if (!modalTarget) return;

      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      modalTarget.innerHTML = `
        <div class="modal-overlay" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.65); z-index:999999; display:flex; justify-content:center; align-items:center; padding:16px;">
          <div class="modal-card bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl p-5 shadow-2xl space-y-4">
            
            <div class="flex items-center justify-between border-b pb-2">
              <h3 class="text-base font-extrabold text-blue-700 flex items-center gap-2">
                <i class="fas fa-truck"></i> 📦 도매상/제약사 반품 인계 확인
              </h3>
              <button type="button" onclick="ExpiryReturnsModule.closeModal()" class="text-slate-400 text-xl font-bold">&times;</button>
            </div>

            <div class="bg-blue-50 p-3 rounded-xl border border-blue-200 text-xs space-y-1">
              <div class="font-extrabold text-blue-900">${escapeHTML(item.drugName)}</div>
              <div class="text-blue-700">수량: ${item.qty}${escapeHTML(item.unit || '개')} • 거래처: ${escapeHTML(item.vendor)}</div>
              <div class="text-blue-600 font-bold">반품 예상액: ${formatKRW(item.estimatedReturnAmount)}</div>
            </div>

            <form onsubmit="ExpiryReturnsModule.handleHandoverSubmit(event, '${item.id}')" class="space-y-3 text-xs">
              <div>
                <label class="block font-bold text-slate-700 mb-1">인계 일시</label>
                <input type="text" id="exp-handover-date" value="${dateStr}" required class="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white font-bold">
              </div>

              <div>
                <label class="block font-bold text-slate-700 mb-1">수거 영업사원 / 담당자 성함</label>
                <input type="text" id="exp-handover-collector" placeholder="예: ${escapeHTML(item.vendor)} 박담당 주임" class="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white font-bold">
              </div>

              <div>
                <label class="block font-bold text-slate-700 mb-1">인계 메모 (송장번호 또는 특이사항)</label>
                <input type="text" id="exp-handover-memo" placeholder="예: 반품 전표 서명 완료" class="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white">
              </div>

              <div class="flex items-center justify-end gap-2 pt-2 border-t">
                <button type="button" onclick="ExpiryReturnsModule.closeModal()" class="px-3.5 py-2 rounded-xl font-bold bg-slate-100 text-slate-700">취소</button>
                <button type="submit" class="px-4 py-2 rounded-xl font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md">
                  📦 [반품처리중]으로 전환
                </button>
              </div>
            </form>

          </div>
        </div>
      `;
    }

    function handleHandoverSubmit(e, id) {
      e.preventDefault();
      const handoverDate = document.getElementById('exp-handover-date').value.trim();
      const collector = document.getElementById('exp-handover-collector').value.trim();
      const memo = document.getElementById('exp-handover-memo').value.trim();

      window.SheetsSync.updateExpiryReturnStatus(id, 'PROCESSING_RETURN', {
        returnHandoverDate: handoverDate,
        returnCollector: collector,
        memo: memo
      });

      closeModal();
      render();
    }

    // ────────────────────────────────────────────────────────────
    // 💳 [모달 3] 약국장 최종 정산 완료 승인 모달
    // ────────────────────────────────────────────────────────────
    function openSettleModal(id) {
      const allReturns = window.SheetsSync.getExpiryReturns() || [];
      const item = allReturns.find(r => r.id === id);
      if (!item) return;

      const modalTarget = document.getElementById('exp-modal-container');
      if (!modalTarget) return;

      const now = new Date();
      const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      modalTarget.innerHTML = `
        <div class="modal-overlay" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.65); z-index:999999; display:flex; justify-content:center; align-items:center; padding:16px;">
          <div class="modal-card bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl p-5 shadow-2xl space-y-4">
            
            <div class="flex items-center justify-between border-b pb-2">
              <h3 class="text-base font-extrabold text-emerald-700 flex items-center gap-2">
                <i class="fas fa-check-circle"></i> ✅ 반품 정산 확정 (약국장 최종 승인)
              </h3>
              <button type="button" onclick="ExpiryReturnsModule.closeModal()" class="text-slate-400 text-xl font-bold">&times;</button>
            </div>

            <div class="bg-emerald-50 p-3 rounded-xl border border-emerald-200 text-xs space-y-1">
              <div class="font-extrabold text-emerald-900">${escapeHTML(item.drugName)}</div>
              <div class="text-emerald-800">거래처: ${escapeHTML(item.vendor)} • 수량: ${item.qty}${escapeHTML(item.unit || '개')}</div>
              <div class="text-emerald-700 font-bold">반품 원가(예상액): ${formatKRW(item.estimatedReturnAmount)}</div>
            </div>

            <form onsubmit="ExpiryReturnsModule.handleSettleSubmit(event, '${item.id}')" class="space-y-3 text-xs">
              <div>
                <label class="block font-bold text-slate-700 mb-1">실제 정산 확정 금액 (원) *</label>
                <input 
                  type="number" 
                  id="exp-settle-amount" 
                  value="${item.actualSettledAmount || item.estimatedReturnAmount}" 
                  required 
                  class="w-full h-10 px-3 rounded-xl border border-emerald-400 bg-white font-black text-emerald-800 text-base"
                >
                <span class="text-[10.5px] text-slate-400">거래명세서 상에 마이너스 정산된 실제 입금/차감 금액을 입력하세요.</span>
              </div>

              <div>
                <label class="block font-bold text-slate-700 mb-1">정산 마감 일자</label>
                <input type="date" id="exp-settle-date" value="${dateStr}" required class="w-full h-10 px-3 rounded-xl border border-slate-300 bg-white font-bold">
              </div>

              <div class="flex items-center justify-end gap-2 pt-2 border-t">
                <button type="button" onclick="ExpiryReturnsModule.closeModal()" class="px-3.5 py-2 rounded-xl font-bold bg-slate-100 text-slate-700">취소</button>
                <button type="submit" class="px-4 py-2 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md">
                  ✅ 정산 완료 승인
                </button>
              </div>
            </form>

          </div>
        </div>
      `;
    }

    function handleSettleSubmit(e, id) {
      e.preventDefault();
      const actualAmt = parseVal(document.getElementById('exp-settle-amount').value);
      const settleDate = document.getElementById('exp-settle-date').value.trim();

      window.SheetsSync.updateExpiryReturnStatus(id, 'COMPLETED', {
        actualSettledAmount: actualAmt,
        settledDate: settleDate
      });

      closeModal();
      render();
    }

    function revertToProcessing(id) {
      if (!confirm('해당 건을 다시 [📦 반품처리중] 상태로 되돌리시겠습니까?')) return;
      window.SheetsSync.updateExpiryReturnStatus(id, 'PROCESSING_RETURN', {
        actualSettledAmount: 0,
        settledDate: ''
      });
      render();
    }

    // ────────────────────────────────────────────────────────────
    // 📄 [모달 4] 도매상별 반품 요청서 1초 복사/추출 모달
    // ────────────────────────────────────────────────────────────
    function openVendorStatementModal(vendorName) {
      const allReturns = window.SheetsSync.getExpiryReturns() || [];
      const modalTarget = document.getElementById('exp-modal-container');
      if (!modalTarget) return;

      const vendorSet = new Set();
      allReturns.forEach(r => { if (r.vendor) vendorSet.add(r.vendor); });
      const vendors = Array.from(vendorSet);

      const targetVendor = vendorName || (vendors.length > 0 ? vendors[0] : 'ALL');

      modalTarget.innerHTML = `
        <div class="modal-overlay" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.65); z-index:999999; display:flex; justify-content:center; align-items:center; padding:16px;">
          <div class="modal-card bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl p-5 shadow-2xl space-y-4 max-h-[90dvh] overflow-y-auto">
            
            <div class="flex items-center justify-between border-b pb-2">
              <h3 class="text-base font-extrabold text-blue-700 flex items-center gap-2">
                <i class="fas fa-file-invoice"></i> 📄 도매상별 반품 요청서 추출 및 복사
              </h3>
              <button type="button" onclick="ExpiryReturnsModule.closeModal()" class="text-slate-400 text-xl font-bold">&times;</button>
            </div>

            <!-- 거래처 선택기 -->
            <div class="flex items-center gap-2 text-xs">
              <span class="font-bold text-slate-700">추출할 거래처:</span>
              <select id="exp-statement-vendor-select" onchange="ExpiryReturnsModule.updateStatementContent(this.value)" class="px-3 py-1.5 rounded-xl border border-blue-400 bg-blue-50 font-bold text-blue-900">
                <option value="ALL" ${targetVendor === 'ALL' ? 'selected' : ''}>전체 거래처 통합</option>
                ${vendors.map(v => `<option value="${escapeHTML(v)}" ${targetVendor === v ? 'selected' : ''}>${escapeHTML(v)}</option>`).join('')}
              </select>
            </div>

            <!-- 추출된 반품 텍스트 에어리어 -->
            <div class="space-y-1">
              <div class="flex items-center justify-between text-xs font-semibold text-slate-500">
                <span>카카오톡 / 문자 전송용 텍스트 서식</span>
                <span class="text-blue-600 font-bold cursor-pointer hover:underline" onclick="ExpiryReturnsModule.copyStatementText()">
                  <i class="fas fa-copy mr-1"></i> 클립보드 전체 복사
                </span>
              </div>
              <textarea 
                id="exp-statement-textarea" 
                rows="12" 
                readonly 
                class="w-full p-3 rounded-xl border border-slate-300 bg-slate-50 font-mono text-xs text-slate-800 leading-relaxed focus:outline-none"
              ></textarea>
            </div>

            <div class="flex items-center justify-end gap-2 pt-2 border-t">
              <button type="button" onclick="ExpiryReturnsModule.closeModal()" class="px-4 py-2 rounded-xl font-bold bg-slate-100 text-slate-700 text-xs">닫기</button>
              <button type="button" onclick="ExpiryReturnsModule.copyStatementText()" class="px-4 py-2 rounded-xl font-bold bg-blue-600 hover:bg-blue-700 text-white text-xs shadow-md flex items-center gap-1.5">
                <i class="fas fa-copy"></i>
                <span>1초 클립보드 복사</span>
              </button>
            </div>

          </div>
        </div>
      `;

      updateStatementContent(targetVendor);
    }

    function updateStatementContent(vendor) {
      const textarea = document.getElementById('exp-statement-textarea');
      if (!textarea) return;

      const allReturns = window.SheetsSync.getExpiryReturns() || [];
      const now = new Date();
      const todayStr = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;

      let items = allReturns;
      if (vendor !== 'ALL') {
        items = allReturns.filter(r => r.vendor === vendor);
      }

      // 대기 및 처리중 항목 우선
      const activeItems = items.filter(r => r.status !== 'COMPLETED');
      const targetItems = activeItems.length > 0 ? activeItems : items;

      const totalQty = targetItems.reduce((sum, r) => sum + parseVal(r.qty), 0);
      const totalAmt = targetItems.reduce((sum, r) => sum + parseVal(r.estimatedReturnAmount), 0);

      let text = `[신세계약국 의약품 반품 요청서]\n`;
      text += `■ 거래처: ${vendor === 'ALL' ? '전체 거래처' : vendor}\n`;
      text += `■ 요청일자: ${todayStr}\n`;
      text += `■ 품목수: 총 ${targetItems.length}개 품목 (${totalQty}개)\n`;
      text += `■ 반품예상총액: ${formatKRW(totalAmt)}\n`;
      text += `━━━━━━━━━━━━━━━━━━━━━━\n`;

      targetItems.forEach((r, idx) => {
        text += `${idx + 1}. ${r.drugName} [${r.spec || '규격없음'}]\n`;
        text += `   - 수량: ${r.qty}${r.unit || '개'}\n`;
        text += `   - 유효기간: ${r.expiryDate || '미정'}\n`;
        text += `   - 예상가: ${formatKRW(r.estimatedReturnAmount)}\n`;
        if (r.memo) text += `   - 비고: ${r.memo}\n`;
      });

      text += `━━━━━━━━━━━━━━━━━━━━━━\n`;
      text += `위 품목의 반품 수거 및 정산 처리를 요청드립니다.\n- 신세계약국 -`;

      textarea.value = text;
    }

    function copyStatementText() {
      const textarea = document.getElementById('exp-statement-textarea');
      if (!textarea) return;
      textarea.select();
      navigator.clipboard.writeText(textarea.value).then(() => {
        alert('🎉 반품요청서 텍스트가 클립보드에 복사되었습니다!\n카카오톡 단톡방이나 영업사원 문자창에 바로 붙여넣기(Ctrl+V)하세요.');
      }).catch(() => {
        document.execCommand('copy');
        alert('🎉 복사되었습니다.');
      });
    }

    function copyVendorStatement(vendorName) {
      openVendorStatementModal(vendorName);
    }

    // ────────────────────────────────────────────────────────────
    // 💾 신규 임박약 폼 제출 처리 (Cloudinary 사진 업로드 파이프라인)
    // ────────────────────────────────────────────────────────────
    async function handleAddSubmit(e) {
      e.preventDefault();
      const submitBtn = document.getElementById('exp-submit-btn');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 저장 및 클라우드 업로드 중...';
      }

      try {
        const drugType = document.getElementById('exp-form-type').value;
        const drugName = document.getElementById('exp-form-name').value.trim();
        const spec = document.getElementById('exp-form-spec').value.trim();
        const qty = parseVal(document.getElementById('exp-form-qty').value) || 1;
        const unit = document.getElementById('exp-form-unit').value;
        const expiryDate = document.getElementById('exp-form-expiry').value.trim();

        const vendorSelect = document.getElementById('exp-form-vendor-select').value;
        const vendorCustom = document.getElementById('exp-form-vendor-custom').value.trim();
        const vendor = vendorSelect === 'CUSTOM' ? (vendorCustom || '기타') : vendorSelect;

        const manufacturer = document.getElementById('exp-form-manufacturer').value.trim();
        const costPrice = parseVal(document.getElementById('exp-form-cost').value);
        const memo = document.getElementById('exp-form-memo').value.trim();

        const currUser = window.SheetsSync.getCurrentUser();

        // 📷 규칙 120: Cloudinary 영구 호스팅 병렬 업로드
        let photoUrls = [];
        if (selectedPhotos.length > 0 && window.App && typeof window.App.processAndUploadPhoto === 'function') {
          photoUrls = await Promise.all(
            selectedPhotos.map(p => {
              if (p.data.startsWith('http')) return Promise.resolve(p.data);
              return window.App.processAndUploadPhoto(p.data);
            })
          );
        }

        const newItem = {
          drugName,
          drugType,
          spec,
          qty,
          unit,
          expiryDate,
          vendor,
          manufacturer,
          costPrice,
          memo,
          photos: photoUrls,
          registeredBy: currUser ? currUser.name : '직원',
          registeredByRole: currUser ? currUser.role : '직원'
        };

        window.SheetsSync.addExpiryReturn(newItem);

        closeModal();
        render();
      } catch (err) {
        console.error('Save error:', err);
        alert('등록 중 오류가 발생했습니다: ' + err.message);
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '등록 완료';
        }
      }
    }

    // ────────────────────────────────────────────────────────────
    // ✏️ 수정 및 삭제 처리
    // ────────────────────────────────────────────────────────────
    function openEditModal(id) {
      const allReturns = window.SheetsSync.getExpiryReturns() || [];
      const item = allReturns.find(r => r.id === id);
      if (!item) return;

      selectedPhotos = (item.photos || []).map(url => ({ id: 'p_' + Math.random(), data: url, isNew: false }));
      const modalTarget = document.getElementById('exp-modal-container');
      if (!modalTarget) return;

      modalTarget.innerHTML = `
        <div class="modal-overlay" style="position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.65); z-index:999999; display:flex; justify-content:center; align-items:flex-end sm:align-items:center; padding:0 sm:p-4;">
          <div class="modal-card bg-white dark:bg-slate-900 w-full sm:max-w-2xl rounded-t-3xl sm:rounded-2xl p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90dvh] overflow-y-auto">
            
            <div class="flex items-center justify-between border-b pb-3">
              <h3 class="text-base sm:text-lg font-extrabold text-slate-900 flex items-center gap-2">
                <i class="fas fa-edit text-blue-600"></i> 내역 수정: ${escapeHTML(item.drugName)}
              </h3>
              <button type="button" onclick="ExpiryReturnsModule.closeModal()" class="text-slate-400 text-xl font-bold">&times;</button>
            </div>

            <form onsubmit="ExpiryReturnsModule.handleEditSubmit(event, '${item.id}')" class="space-y-3.5 text-xs">
              
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label class="block font-bold text-slate-700 mb-1">약품 구분</label>
                  <select id="exp-edit-type" class="w-full h-10 px-3 rounded-xl border border-slate-300 font-bold">
                    <option value="OTC" ${item.drugType === 'OTC' ? 'selected' : ''}>💊 일반약</option>
                    <option value="ETC" ${item.drugType === 'ETC' ? 'selected' : ''}>💉 전문약</option>
                  </select>
                </div>
                <div class="sm:col-span-2">
                  <label class="block font-bold text-slate-700 mb-1">약품명 *</label>
                  <input type="text" id="exp-edit-name" required value="${escapeHTML(item.drugName)}" class="w-full h-10 px-3 rounded-xl border border-slate-300 font-bold">
                </div>
              </div>

              <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div>
                  <label class="block font-bold text-slate-700 mb-1">규격</label>
                  <input type="text" id="exp-edit-spec" value="${escapeHTML(item.spec || '')}" class="w-full h-10 px-3 rounded-xl border border-slate-300">
                </div>
                <div>
                  <label class="block font-bold text-slate-700 mb-1">수량 *</label>
                  <input type="number" id="exp-edit-qty" required min="1" value="${item.qty}" class="w-full h-10 px-3 rounded-xl border border-slate-300 font-bold">
                </div>
                <div>
                  <label class="block font-bold text-slate-700 mb-1">단위</label>
                  <input type="text" id="exp-edit-unit" value="${escapeHTML(item.unit || '개')}" class="w-full h-10 px-3 rounded-xl border border-slate-300">
                </div>
                <div>
                  <label class="block font-bold text-slate-700 mb-1">유효기간</label>
                  <input type="month" id="exp-edit-expiry" value="${escapeHTML(item.expiryDate || '')}" class="w-full h-10 px-3 rounded-xl border border-slate-300 font-bold text-blue-700">
                </div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label class="block font-bold text-slate-700 mb-1">거래처 (도매상)</label>
                  <input type="text" id="exp-edit-vendor" value="${escapeHTML(item.vendor || '')}" class="w-full h-10 px-3 rounded-xl border border-slate-300 font-bold">
                </div>
                <div>
                  <label class="block font-bold text-slate-700 mb-1">제조사</label>
                  <input type="text" id="exp-edit-manufacturer" value="${escapeHTML(item.manufacturer || '')}" class="w-full h-10 px-3 rounded-xl border border-slate-300">
                </div>
                <div>
                  <label class="block font-bold text-slate-700 mb-1">매입 단가 (원)</label>
                  <input type="number" id="exp-edit-cost" value="${item.costPrice || 0}" class="w-full h-10 px-3 rounded-xl border border-slate-300 font-bold">
                </div>
              </div>

              <!-- 사진 관리 -->
              <div class="space-y-1.5">
                <div class="flex items-center justify-between">
                  <label class="font-bold text-slate-700">첨부 사진 (최대 5장)</label>
                  <span id="exp-photo-counter" class="text-[11px] font-bold text-slate-400">${selectedPhotos.length} / 5장</span>
                </div>
                <div class="flex items-center gap-2">
                  <label class="cursor-pointer px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-300 font-bold text-slate-700 text-xs flex items-center gap-1.5">
                    <i class="fas fa-camera"></i> 사진 추가
                    <input type="file" accept="image/*" multiple onchange="ExpiryReturnsModule.handlePhotoSelect(event)" style="display:none;">
                  </label>
                </div>
                <div id="exp-photo-preview-grid" class="flex items-center gap-2 overflow-x-auto py-1">
                  ${selectedPhotos.map((p, idx) => `
                    <div class="relative w-14 h-14 rounded-xl overflow-hidden border border-slate-300 shrink-0">
                      <img src="${p.data}" class="w-full h-full object-cover">
                      <button type="button" onclick="ExpiryReturnsModule.removePhoto(${idx})" class="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-red-600 text-white font-bold text-[10px] flex items-center justify-center">&times;</button>
                    </div>
                  `).join('')}
                </div>
              </div>

              <div>
                <label class="block font-bold text-slate-700 mb-1">비고 메모</label>
                <textarea id="exp-edit-memo" rows="2" class="w-full p-2.5 rounded-xl border border-slate-300">${escapeHTML(item.memo || '')}</textarea>
              </div>

              <div class="flex items-center justify-end gap-2 pt-3 border-t">
                <button type="button" onclick="ExpiryReturnsModule.closeModal()" class="px-4 py-2.5 rounded-xl font-bold bg-slate-100 text-slate-700">취소</button>
                <button type="submit" id="exp-edit-submit-btn" class="px-5 py-2.5 rounded-xl font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-md">
                  수정사항 저장
                </button>
              </div>

            </form>
          </div>
        </div>
      `;
    }

    async function handleEditSubmit(e, id) {
      e.preventDefault();
      const submitBtn = document.getElementById('exp-edit-submit-btn');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 저장 중...';
      }

      try {
        const drugType = document.getElementById('exp-edit-type').value;
        const drugName = document.getElementById('exp-edit-name').value.trim();
        const spec = document.getElementById('exp-edit-spec').value.trim();
        const qty = parseVal(document.getElementById('exp-edit-qty').value) || 1;
        const unit = document.getElementById('exp-edit-unit').value.trim();
        const expiryDate = document.getElementById('exp-edit-expiry').value.trim();
        const vendor = document.getElementById('exp-edit-vendor').value.trim();
        const manufacturer = document.getElementById('exp-edit-manufacturer').value.trim();
        const costPrice = parseVal(document.getElementById('exp-edit-cost').value);
        const memo = document.getElementById('exp-edit-memo').value.trim();

        let photoUrls = [];
        if (selectedPhotos.length > 0 && window.App && typeof window.App.processAndUploadPhoto === 'function') {
          photoUrls = await Promise.all(
            selectedPhotos.map(p => {
              if (p.data.startsWith('http')) return Promise.resolve(p.data);
              return window.App.processAndUploadPhoto(p.data);
            })
          );
        }

        const allReturns = window.SheetsSync.getExpiryReturns() || [];
        const target = allReturns.find(r => r.id === id);
        if (target) {
          target.drugType = drugType;
          target.drugName = drugName;
          target.spec = spec;
          target.qty = qty;
          target.unit = unit;
          target.expiryDate = expiryDate;
          target.vendor = vendor;
          target.manufacturer = manufacturer;
          target.costPrice = costPrice;
          target.estimatedReturnAmount = Math.round(qty * costPrice);
          target.memo = memo;
          target.photos = photoUrls;
          target.updatedAt = Date.now();

          window.SheetsSync.saveExpiryReturns(allReturns);
        }

        closeModal();
        render();
      } catch (err) {
        alert('수정 실패: ' + err.message);
        if (submitBtn) submitBtn.disabled = false;
      }
    }

    function confirmDelete(id) {
      const allReturns = window.SheetsSync.getExpiryReturns() || [];
      const item = allReturns.find(r => r.id === id);
      const name = item ? item.drugName : '해당 약품';

      if (confirm(`정말로 [${name}] 내역을 영구 삭제하시겠습니까?\n(삭제 후에는 클라우드 동기화 시에도 다시 되살아나지 않습니다.)`)) {
        window.SheetsSync.deleteExpiryReturn(id);
        render();
      }
    }

    // ────────────────────────────────────────────────────────────
    // 🔍 전역 라이트박스 갤러리 연동 (규칙 64, 65, 120)
    // ────────────────────────────────────────────────────────────
    function openPhotoLightbox(itemId, startIndex = 0) {
      const allReturns = window.SheetsSync.getExpiryReturns() || [];
      const item = allReturns.find(r => r.id === itemId);
      if (!item || !item.photos || item.photos.length === 0) return;

      if (window.App && typeof window.App.openImageLightbox === 'function') {
        window.App.openImageLightbox(item.photos, item.drugName + ' (유효기간 사진)', startIndex);
      } else {
        window.open(item.photos[startIndex], '_blank');
      }
    }

    // ────────────────────────────────────────────────────────────
    // ⚡ 인터랙션 헬퍼 함수들 (D-Day 미리보기, 벤더 선택, 디바운스 검색)
    // ────────────────────────────────────────────────────────────
    function updateFormDDayPreview() {
      const input = document.getElementById('exp-form-expiry');
      const preview = document.getElementById('exp-form-dday-preview');
      if (!input || !preview) return;

      const d = calculateExpiryDDay(input.value);
      preview.innerHTML = `
        <span>유효기간 상태: <strong class="ml-1">${escapeHTML(d.label)}</strong></span>
        <span class="px-2 py-0.5 rounded-md text-[10px] font-bold ${d.badgeClass}">${d.status}</span>
      `;
    }

    function updateEstimatedAmount() {
      const qtyInput = document.getElementById('exp-form-qty');
      const costInput = document.getElementById('exp-form-cost');
      const totalPreview = document.getElementById('exp-form-total-preview');
      if (!qtyInput || !costInput || !totalPreview) return;

      const q = parseVal(qtyInput.value) || 0;
      const c = parseVal(costInput.value) || 0;
      totalPreview.textContent = formatKRW(q * c);
    }

    function handleVendorSelect(val) {
      const customInput = document.getElementById('exp-form-vendor-custom');
      if (!customInput) return;
      if (val === 'CUSTOM') {
        customInput.style.display = 'block';
        customInput.focus();
      } else {
        customInput.style.display = 'none';
      }
    }

    function handleSearchInput(val) {
      searchQuery = val;
      if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        // 규칙 50, 92: 검색창 DOM은 보존하고 하단 콘텐츠만 부분 갱신!
        const container = document.getElementById('exp-main-content-container');
        if (container) {
          const currUser = window.SheetsSync.getCurrentUser();
          const isDirector = currUser && currUser.role === '약국장';
          const allReturns = window.SheetsSync.getExpiryReturns() || [];
          container.innerHTML = renderViewContent(allReturns, isDirector);
        }
      }, 120);
    }

    function setView(v) {
      activeView = v;
      render();
    }

    function setStatusFilter(s) {
      statusFilter = s;
      render();
    }

    function setPeriodFilter(p) {
      periodFilter = p;
      render();
    }

    function setDrugTypeFilter(t) {
      drugTypeFilter = t;
      render();
    }

    function setVendorFilter(v) {
      vendorFilter = v;
      render();
    }

    function closeModal() {
      const modalTarget = document.getElementById('exp-modal-container');
      if (modalTarget) modalTarget.innerHTML = '';
      selectedPhotos = [];
    }

    // ────────────────────────────────────────────────────────────
    // 🚀 외부 공개 API 리턴
    // ────────────────────────────────────────────────────────────
    return {
      init: function () {
        // 클라우드 동기화 수신 시 0.1초 자동 리렌더링 (규칙 7)
        window.addEventListener('ssg_cloud_updated', () => {
          if (window.App && window.App.getActiveModule && window.App.getActiveModule() === 'expiry-returns') {
            render();
          }
        });
      },
      render,
      setView,
      setStatusFilter,
      setPeriodFilter,
      setDrugTypeFilter,
      setVendorFilter,
      handleSearchInput,
      openAddModal,
      openEditModal,
      openHandoverModal,
      openSettleModal,
      openVendorStatementModal,
      closeModal,
      handleAddSubmit,
      handleEditSubmit,
      handleHandoverSubmit,
      handleSettleSubmit,
      revertToProcessing,
      confirmDelete,
      handlePhotoSelect,
      removePhoto,
      openPhotoLightbox,
      updateFormDDayPreview,
      updateEstimatedAmount,
      handleVendorSelect,
      copyVendorStatement,
      copyStatementText,
      updateStatementContent
    };

  })();
}
