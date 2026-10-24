/**
 * 📦 약국 소모품 관리 & 주문 시스템 모듈 (SuppliesModule)
 * 신세계약국 전용 - 전산봉투, 약봉투, 영수증롤, 라벨지 등 소모품 신청/승인/입고/지출연동
 */
window.SuppliesModule = (function () {
  let activeTab = 'requests'; // 'requests' | 'catalog'
  let statusFilter = 'ALL';   // 'ALL' | 'PENDING' | 'ORDERED' | 'COMPLETED' | 'REJECTED'
  let searchQuery = '';
  let urgentOnlyFilter = false;
  let selectedCompletePhotos = [];
  let selectedEditPhotos = [];
  const LOCATION_QUICK_TAGS = ['창고 선반', '조제실 하단 서랍', '매대 하단 서랍', '탕비실/다용도실', '전산봉투 보관함', 'ATC 옆 수납장'];

  function renderHTML() {
    const currUser = window.SheetsSync.getCurrentUser();
    const isDirector = currUser && currUser.role === '약국장';
    const supplies = window.SheetsSync.getSupplies() || [];
    const presets = window.SheetsSync.getSupplyPresets() || [];

    // 통계 집계
    const pendingList = supplies.filter(s => s.status === 'PENDING');
    const urgentCount = pendingList.filter(s => s.urgency === 'URGENT').length;
    const orderedList = supplies.filter(s => s.status === 'ORDERED');
    const completedList = supplies.filter(s => s.status === 'COMPLETED');

    const totalOrderedPrice = orderedList.reduce((sum, s) => sum + (Number(s.actualPrice || s.estimatedPrice) || 0), 0);
    const totalCompletedPrice = completedList.reduce((sum, s) => sum + (Number(s.actualPrice || s.estimatedPrice) || 0), 0);

    return `
      <div class="supplies-container p-3 sm:p-5 md:p-6 space-y-4 sm:space-y-6">
        
        <!-- 상단 헤더 & 타이틀 -->
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <div class="space-y-1">
            <div class="flex items-center gap-2 flex-wrap">
              <h2 class="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                <span>📦 약국 소모품 관리 & 주문 시스템</span>
              </h2>
              <span class="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold border border-emerald-300 dark:border-emerald-700 whitespace-nowrap">
                신세계약국 소모품 시스템
              </span>
            </div>
            <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed break-keep">
              전산봉투, 약봉투, 영수증롤, 라벨지 등 약국 소모품 요청 및 주문/입고 현황 관리
            </p>
          </div>

          <div class="flex items-center gap-2 w-full sm:w-auto pt-1 sm:pt-0">
            <button 
              onclick="SuppliesModule.openRequestModal()"
              class="flex-1 sm:flex-initial btn btn-primary px-3.5 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white shadow-md transition whitespace-nowrap"
            >
              <i class="fas fa-plus-circle"></i>
              <span>+ 신규 소모품 요청 올리기</span>
            </button>
            
            ${isDirector ? `
              <button 
                onclick="SuppliesModule.openPresetModal()"
                class="flex-1 sm:flex-initial btn btn-secondary px-3 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 transition whitespace-nowrap"
              >
                <i class="fas fa-cog text-amber-500"></i>
                <span>자주 쓰는 품목 관리</span>
              </button>
            ` : ''}
          </div>
        </div>

        <!-- KPI 통계 카운터 카드 (2x2 모바일 / 4x1 PC 적응형 - 클릭 시 필터 토글) -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-4">
          <div onclick="SuppliesModule.setStatusFilter('PENDING')" class="bg-amber-500/10 border ${statusFilter === 'PENDING' && activeTab === 'requests' ? 'border-amber-500 ring-2 ring-amber-500/40' : 'border-amber-500/30'} rounded-xl sm:rounded-2xl p-3 sm:p-4 flex items-center justify-between cursor-pointer hover:bg-amber-500/15 transition">
            <div>
              <div class="text-[11px] sm:text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                <span>요청 대기 중</span>
                <span class="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-300">${statusFilter === 'PENDING' && activeTab === 'requests' ? '✓ 필터중' : '클릭 필터'}</span>
              </div>
              <div class="text-xl sm:text-2xl font-black text-amber-700 dark:text-amber-300 mt-0.5">${pendingList.length} <span class="text-xs font-normal">건</span></div>
            </div>
            <div class="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-500 font-bold text-sm sm:text-base">
              ${urgentCount > 0 ? `<span class="animate-bounce text-red-500">⚡${urgentCount}</span>` : '⏳'}
            </div>
          </div>

          <div onclick="SuppliesModule.setStatusFilter('ORDERED')" class="bg-blue-500/10 border ${statusFilter === 'ORDERED' && activeTab === 'requests' ? 'border-blue-500 ring-2 ring-blue-500/40' : 'border-blue-500/30'} rounded-xl sm:rounded-2xl p-3 sm:p-4 flex items-center justify-between cursor-pointer hover:bg-blue-500/15 transition">
            <div>
              <div class="text-[11px] sm:text-xs font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1.5">
                <span>주문 진행 중</span>
                <span class="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-700 dark:text-blue-300">${statusFilter === 'ORDERED' && activeTab === 'requests' ? '✓ 필터중' : '클릭 필터'}</span>
              </div>
              <div class="text-xl sm:text-2xl font-black text-blue-700 dark:text-blue-300 mt-0.5">${orderedList.length} <span class="text-xs font-normal">건</span></div>
            </div>
            <div class="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-500 text-sm sm:text-lg font-bold">
              🚚
            </div>
          </div>

          <div onclick="SuppliesModule.setStatusFilter('COMPLETED')" class="bg-emerald-500/10 border ${statusFilter === 'COMPLETED' && activeTab === 'requests' ? 'border-emerald-500 ring-2 ring-emerald-500/40' : 'border-emerald-500/30'} rounded-xl sm:rounded-2xl p-3 sm:p-4 flex items-center justify-between cursor-pointer hover:bg-emerald-500/15 transition">
            <div>
              <div class="text-[11px] sm:text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <span>입고 완료 (누적)</span>
                <span class="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">${statusFilter === 'COMPLETED' && activeTab === 'requests' ? '✓ 필터중' : '클릭 필터'}</span>
              </div>
              <div class="text-xl sm:text-2xl font-black text-emerald-700 dark:text-emerald-300 mt-0.5">${completedList.length} <span class="text-xs font-normal">건</span></div>
            </div>
            <div class="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-500 text-sm sm:text-lg font-bold">
              ✅
            </div>
          </div>

          <div onclick="SuppliesModule.setStatusFilter('ALL')" class="bg-slate-500/10 border ${statusFilter === 'ALL' && activeTab === 'requests' ? 'border-slate-500 ring-2 ring-slate-400/30' : 'border-slate-300 dark:border-slate-700'} rounded-xl sm:rounded-2xl p-3 sm:p-4 flex items-center justify-between cursor-pointer hover:bg-slate-500/15 transition">
            <div>
              <div class="text-[11px] sm:text-xs font-bold text-slate-500 dark:text-slate-400">이번 달 집계 금액</div>
              <div class="text-base sm:text-lg font-black text-slate-800 dark:text-slate-100 mt-0.5">₩${(totalOrderedPrice + totalCompletedPrice).toLocaleString()}</div>
            </div>
            <div class="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 text-sm sm:text-lg font-bold">
              💳
            </div>
          </div>
        </div>

        <!-- 탭 및 검색 / 필터 컨트롤 Bar -->
        <div class="bg-white dark:bg-slate-900 p-3 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          
          <!-- 서브 탭 스위치 -->
          <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div class="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
              <button 
                onclick="SuppliesModule.setTab('requests')"
                class="px-3.5 py-2 rounded-xl text-xs font-black transition flex items-center gap-1.5 whitespace-nowrap ${activeTab === 'requests' ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'}"
              >
                <i class="fas fa-clipboard-list"></i>
                <span>소모품 요청 목록</span>
                <span class="px-1.5 py-0.5 text-[10px] rounded-full bg-white/20 font-bold">${supplies.length}</span>
              </button>

              <button 
                onclick="SuppliesModule.setTab('catalog')"
                class="px-3.5 py-2 rounded-xl text-xs font-black transition flex items-center gap-1.5 whitespace-nowrap ${activeTab === 'catalog' ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'}"
              >
                <i class="fas fa-th-large"></i>
                <span>자주 쓰는 소모품 카탈로그</span>
                <span class="px-1.5 py-0.5 text-[10px] rounded-full bg-white/20 font-bold">${presets.length}</span>
              </button>
            </div>

            <!-- 검색 창 & 긴급 필터 -->
            <div class="flex items-center gap-2 w-full sm:w-auto">
              <div class="relative flex-grow sm:w-60">
                <input 
                  type="text"
                  placeholder="품목명, 신청자, 보관위치 검색..."
                  value="${searchQuery}"
                  oninput="SuppliesModule.handleSearch(this.value)"
                  class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-medium focus:outline-none focus:border-emerald-500 pl-8 text-slate-900 dark:text-white"
                />
                <i class="fas fa-search absolute left-2.5 top-2.5 text-slate-400 text-xs"></i>
              </div>

              <button 
                onclick="SuppliesModule.toggleUrgentFilter()"
                class="px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1 border whitespace-nowrap ${urgentOnlyFilter ? 'bg-red-500 text-white border-red-500' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-200'}"
              >
                <span>⚡ 긴급만 보기</span>
              </button>
            </div>
          </div>

          <!-- 상태별 필터 칩 (요청 목록 탭일 경우만 표시) -->
          ${activeTab === 'requests' ? `
            <div class="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs font-bold whitespace-nowrap">
              <span class="text-slate-400 text-[11px] mr-1 hidden sm:inline">상태 필터:</span>
              <button onclick="SuppliesModule.setStatusFilter('ALL')" class="px-2.5 py-1 rounded-lg transition ${statusFilter === 'ALL' ? 'bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 font-black' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200'}">전체</button>
              <button onclick="SuppliesModule.setStatusFilter('PENDING')" class="px-2.5 py-1 rounded-lg transition ${statusFilter === 'PENDING' ? 'bg-amber-500 text-white font-black' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20'}">⏳ 요청 대기 (${pendingList.length})</button>
              <button onclick="SuppliesModule.setStatusFilter('ORDERED')" class="px-2.5 py-1 rounded-lg transition ${statusFilter === 'ORDERED' ? 'bg-blue-500 text-white font-black' : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20'}">🚚 주문 완료 (${orderedList.length})</button>
              <button onclick="SuppliesModule.setStatusFilter('COMPLETED')" class="px-2.5 py-1 rounded-lg transition ${statusFilter === 'COMPLETED' ? 'bg-emerald-600 text-white font-black' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20'}">✅ 입고 완료 (${completedList.length})</button>
              <button onclick="SuppliesModule.setStatusFilter('REJECTED')" class="px-2.5 py-1 rounded-lg transition ${statusFilter === 'REJECTED' ? 'bg-rose-500 text-white font-black' : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20'}">❌ 반려</button>
            </div>
          ` : ''}

        </div>

        <!-- 본문 탭 영역 -->
        <div id="supplies-tab-content">
          ${activeTab === 'requests' ? renderRequestsTabHTML(supplies, isDirector) : renderCatalogTabHTML(presets, isDirector)}
        </div>

      </div>

      <!-- 공통 모달 1: 소모품 신청 모달 -->
      ${renderRequestModalHTML(presets, currUser)}

      <!-- 공통 모달 2: 약국장 주문 확정 처리 모달 -->
      ${renderConfirmModalHTML()}

      <!-- 공통 모달 3: 자주쓰는 품목 추가/수정 모달 -->
      ${renderPresetModalHTML()}

      <!-- 공통 모달 4: 입고 완료 확인 모달 -->
      ${renderCompleteModalHTML()}

      <!-- 공통 모달 5: 소모품 요청 전 항목 통합 수정 모달 -->
      ${renderEditModalHTML()}
    `;
  }

  // 1. 소모품 요청 목록 탭 HTML
  function renderRequestsTabHTML(supplies, isDirector) {
    let filtered = supplies;

    if (statusFilter !== 'ALL') {
      filtered = filtered.filter(s => s.status === statusFilter);
    }

    if (urgentOnlyFilter) {
      filtered = filtered.filter(s => s.urgency === 'URGENT');
    }

    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(s => 
        (s.itemName && s.itemName.toLowerCase().includes(q)) ||
        (s.applicantName && s.applicantName.toLowerCase().includes(q)) ||
        (s.vendor && s.vendor.toLowerCase().includes(q)) ||
        (s.memo && s.memo.toLowerCase().includes(q)) ||
        (s.storageLocation && s.storageLocation.toLowerCase().includes(q))
      );
    }

    // 타임스탬프 기준 최상단 내림차순 정렬 (Rule ①)
    filtered.sort((a, b) => (Number(b.updatedAt || 0) - Number(a.updatedAt || 0)));

    if (filtered.length === 0) {
      return `
        <div class="bg-white dark:bg-slate-900 rounded-2xl p-12 text-center border border-slate-200 dark:border-slate-800 space-y-3">
          <div class="text-4xl">📦</div>
          <div class="text-base font-bold text-slate-700 dark:text-slate-300">등록된 소모품 요청이 없습니다.</div>
          <p class="text-xs text-slate-400 max-w-sm mx-auto">
            전산봉투, 약봉투, 영수증롤 등 필요한 소모품이 떨어졌다면 상단의 <strong>[+ 신규 소모품 요청 올리기]</strong> 버튼을 눌러주세요.
          </p>
        </div>
      `;
    }

    return `
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        ${filtered.map(item => renderSupplyCardHTML(item, isDirector)).join('')}
      </div>
    `;
  }

  // 소모품 카테고리 태그 렌더링
  function renderCategoryBadge(cat) {
    const map = {
      '전산/인쇄': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700',
      '약봉투/비닐': 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300 dark:border-amber-700',
      '조제용품': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700',
      '청소용품': 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300 border-sky-300 dark:border-sky-700',
      '기타': 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700'
    };
    const cls = map[cat] || map['기타'];
    return `<span class="px-2 py-0.5 text-[10px] font-extrabold rounded border ${cls}">${cat || '기타'}</span>`;
  }

  // 상태 배지 렌더링
  function renderStatusBadge(status) {
    switch(status) {
      case 'PENDING':
        return `<span class="px-2.5 py-1 text-xs font-black rounded-lg bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center gap-1"><i class="fas fa-hourglass-half animate-spin text-[10px]"></i> 요청 대기</span>`;
      case 'ORDERED':
        return `<span class="px-2.5 py-1 text-xs font-black rounded-lg bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/30 flex items-center gap-1"><i class="fas fa-truck text-[10px]"></i> 주문 완료</span>`;
      case 'COMPLETED':
        return `<span class="px-2.5 py-1 text-xs font-black rounded-lg bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1"><i class="fas fa-check-circle text-[10px]"></i> 입고 완료</span>`;
      case 'REJECTED':
        return `<span class="px-2.5 py-1 text-xs font-black rounded-lg bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 flex items-center gap-1"><i class="fas fa-times-circle text-[10px]"></i> 반려</span>`;
      default:
        return `<span class="px-2.5 py-1 text-xs font-bold rounded-lg bg-slate-200 text-slate-700">${status}</span>`;
    }
  }

  // 요청 개별 카드 HTML
  function renderSupplyCardHTML(item, isDirector) {
    const isUrgent = item.urgency === 'URGENT';
    const isPending = item.status === 'PENDING';
    const isOrdered = item.status === 'ORDERED';
    const isCompleted = item.status === 'COMPLETED';
    const isRejected = item.status === 'REJECTED';
    const itemPhotos = (Array.isArray(item.photos) && item.photos.length > 0)
      ? item.photos.filter(Boolean)
      : (item.photoUrl ? [item.photoUrl] : []);
    const hasLocationInfo = Boolean((item.storageLocation && item.storageLocation.trim()) || itemPhotos.length > 0);

    return `
      <div class="bg-white dark:bg-slate-900 rounded-2xl p-5 border ${isUrgent ? 'border-red-400 dark:border-red-600/60 shadow-red-500/5' : 'border-slate-200 dark:border-slate-800'} shadow-sm hover:shadow-md transition flex flex-col justify-between space-y-4 relative">
        
        <!-- 카드 헤더 (긴급태그 + 카테고리 + 상태) -->
        <div>
          <div class="flex items-center justify-between gap-2 mb-2">
            <div class="flex items-center gap-1.5 flex-wrap">
              ${isUrgent ? `<span class="px-2 py-0.5 text-[10px] font-black rounded bg-red-500 text-white animate-pulse">⚡ 긴급요청</span>` : ''}
              ${renderCategoryBadge(item.category)}
            </div>
            <div onclick="SuppliesModule.openEditModal('${item.id}')" class="cursor-pointer hover:opacity-80 transition" title="클릭하여 진행 단계 및 소모품 정보 수정">
              ${renderStatusBadge(item.status)}
            </div>
          </div>

          <h3 class="text-base font-extrabold text-slate-900 dark:text-white leading-tight">
            ${escapeHTML(item.itemName)}
          </h3>

          <div class="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
            <span>수량: <strong class="text-emerald-600 dark:text-emerald-400 font-extrabold text-sm">${item.qty} ${escapeHTML(item.unit || '개')}</strong></span>
            <span>·</span>
            <span>신청: <strong>${escapeHTML(item.applicantName || '직원')}</strong> (${escapeHTML(item.applicantRole || '직원')})</span>
          </div>
        </div>

        <!-- 카드 바디 (메모 & 금액 / 거래처) -->
        <div class="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-100 dark:border-slate-800/80 text-xs space-y-2">
          ${item.memo ? `
            <div class="text-slate-700 dark:text-slate-300 font-medium leading-relaxed">
              <i class="fas fa-sticky-note text-amber-500 mr-1"></i> ${escapeHTML(item.memo)}
            </div>
          ` : '<div class="text-slate-400 italic">등록된 특이사항 메모가 없습니다.</div>'}

          ${isRejected && item.rejectReason ? `
            <div class="text-rose-600 dark:text-rose-400 font-bold leading-relaxed bg-rose-50 dark:bg-rose-950/40 px-2.5 py-1.5 rounded-lg border border-rose-200 dark:border-rose-800/60">
              <i class="fas fa-exclamation-circle mr-1"></i> 반려 사유: ${escapeHTML(item.rejectReason)}
            </div>
          ` : ''}

          ${hasLocationInfo ? `
            <div class="bg-emerald-50/90 dark:bg-emerald-950/40 p-2.5 rounded-xl border border-emerald-200 dark:border-emerald-800/70 space-y-2">
              <div class="flex items-center justify-between gap-2">
                <div class="text-emerald-800 dark:text-emerald-200 font-extrabold text-xs flex items-center gap-1.5">
                  <i class="fas fa-map-marker-alt text-emerald-600 dark:text-emerald-400"></i>
                  <span>보관위치: ${escapeHTML(item.storageLocation || '현장 보관 사진 참조')}</span>
                </div>
                ${itemPhotos.length > 0 ? `
                  <button type="button" onclick="SuppliesModule.openSupplyPhoto('${item.id}', 0)" class="px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 text-[10px] font-extrabold hover:bg-emerald-600 hover:text-white transition whitespace-nowrap">
                    🔍 크게보기 (${itemPhotos.length}장)
                  </button>
                ` : ''}
              </div>
              ${itemPhotos.length > 0 ? `
                <div class="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                  ${itemPhotos.map((pUrl, pIdx) => `
                    <div onclick="SuppliesModule.openSupplyPhoto('${item.id}', ${pIdx})" class="relative w-14 h-14 rounded-lg overflow-hidden border-2 border-emerald-400 dark:border-emerald-600 cursor-pointer flex-shrink-0 shadow-sm hover:opacity-90 transition" title="클릭하여 보관 위치 사진 크게보기">
                      <img src="${pUrl}" alt="보관위치 사진 ${pIdx + 1}" class="w-full h-full object-cover" loading="lazy" />
                      <span class="absolute bottom-0 right-0 bg-emerald-700/90 text-white text-[9px] font-black px-1 rounded-tl">${pIdx + 1}</span>
                    </div>
                  `).join('')}
                </div>
              ` : ''}
            </div>
          ` : ''}

          <div class="pt-2 border-t border-slate-200 dark:border-slate-800/80 flex items-center justify-between flex-wrap gap-1 text-[11px]">
            <div>
              <span class="text-slate-400">주문처:</span>
              <strong class="text-slate-700 dark:text-slate-200">${escapeHTML(item.vendor || '미지정 (확정 시 입력)')}</strong>
            </div>
            <div>
              <span class="text-slate-400">예상/실제금액:</span>
              <strong class="text-emerald-600 dark:text-emerald-400 font-bold">₩${(item.actualPrice || item.estimatedPrice || 0).toLocaleString()}</strong>
            </div>
          </div>
          <div class="text-[10px] text-slate-400 text-right">
            신청일시: ${item.createdAt || '방금 전'}
          </div>
        </div>

        <!-- 액션 버튼 영역 -->
        <div class="pt-2 flex items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800 flex-wrap">
          <div class="flex items-center gap-1.5 flex-wrap">
            ${isPending ? `
              <button 
                onclick="SuppliesModule.openConfirmModal('${item.id}')"
                class="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow transition flex items-center gap-1"
                title="약국장/관리자 주문 승인 확정"
              >
                <i class="fas fa-check"></i> 주문 확정
              </button>

              <button 
                onclick="SuppliesModule.rejectRequest('${item.id}')"
                class="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-rose-500 hover:text-white text-slate-600 dark:text-slate-400 font-bold text-xs transition"
                title="요청 반려"
              >
                반려
              </button>
            ` : ''}

            ${isOrdered ? `
              <button 
                onclick="SuppliesModule.openCompleteModal('${item.id}')"
                class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow transition flex items-center gap-1"
                title="물품 수령 및 입고 완료 처리"
              >
                <i class="fas fa-camera"></i> 물품 수령 / 입고완료 (위치·사진)
              </button>

              <button 
                onclick="SuppliesModule.revertStatus('${item.id}', 'PENDING')"
                class="px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-500 hover:text-white text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700 font-bold text-[11px] transition flex items-center gap-1"
                title="요청 대기 상태로 되돌리기"
              >
                <i class="fas fa-undo-alt text-[10px]"></i> ◀ 요청 대기로
              </button>
            ` : ''}

            ${isCompleted ? `
              <span class="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mr-1">
                <i class="fas fa-check-double"></i> 입고 완료 (${item.completedAt || '처리됨'})
              </span>

              <button 
                onclick="SuppliesModule.openCompleteModal('${item.id}')"
                class="px-2.5 py-1 rounded-lg ${hasLocationInfo ? 'bg-emerald-100 dark:bg-emerald-950/60 hover:bg-emerald-600 hover:text-white text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700' : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm'} font-bold text-[11px] transition flex items-center gap-1"
                title="입고된 소모품의 보관 위치 및 사진 첨부/수정"
              >
                <i class="fas fa-camera text-[10px]"></i> ${hasLocationInfo ? '위치/사진 변경' : '📸 보관위치 사진첨부'}
              </button>

              <button 
                onclick="SuppliesModule.revertStatus('${item.id}', 'ORDERED')"
                class="px-2 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-600 hover:text-white text-blue-700 dark:text-blue-300 border border-blue-300 dark:border-blue-700 font-bold text-[11px] transition flex items-center gap-1"
                title="주문 완료(진행중) 상태로 되돌리기"
              >
                <i class="fas fa-undo-alt text-[10px]"></i> ◀ 주문 완료로
              </button>

              <button 
                onclick="SuppliesModule.revertStatus('${item.id}', 'PENDING')"
                class="px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-500 hover:text-white text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700 font-bold text-[11px] transition flex items-center gap-1"
                title="요청 대기 상태로 되돌리기"
              >
                ◀ 대기로
              </button>
            ` : ''}

            ${isRejected ? `
              <button 
                onclick="SuppliesModule.revertStatus('${item.id}', 'PENDING')"
                class="px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-500 hover:text-white text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700 font-bold text-xs transition flex items-center gap-1"
                title="반려 취소 및 요청 대기 상태로 복원"
              >
                <i class="fas fa-undo-alt text-[10px]"></i> ◀ 요청 대기로 복원
              </button>
            ` : ''}
          </div>

          <div class="flex items-center gap-1 ml-auto">
            <button 
              onclick="SuppliesModule.openEditModal('${item.id}')"
              class="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-emerald-600 hover:text-white text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-bold text-xs transition flex items-center gap-1"
              title="소모품 품목명/수량/단위/거래처/금액/상태 수정"
            >
              <i class="fas fa-edit text-[11px]"></i>
              <span>수정</span>
            </button>

            <button 
              onclick="SuppliesModule.deleteRequest('${item.id}')"
              class="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              title="요청 삭제"
            >
              <i class="fas fa-trash-alt text-xs"></i>
            </button>
          </div>
        </div>

      </div>
    `;
  }

  // 2. 자주 쓰는 소모품 카탈로그 탭 HTML
  function renderCatalogTabHTML(presets, isDirector) {
    if (presets.length === 0) {
      return `
        <div class="bg-white dark:bg-slate-900 rounded-2xl p-12 text-center border border-slate-200 dark:border-slate-800 space-y-3">
          <div class="text-4xl">📋</div>
          <div class="text-base font-bold text-slate-700 dark:text-slate-300">자주 쓰는 소모품 카탈로그가 비어있습니다.</div>
        </div>
      `;
    }

    return `
      <div class="space-y-4">
        <div class="text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between flex-wrap gap-2">
          <span>약국에서 정기적으로 구매하는 자주 쓰는 소모품 목록입니다. <strong>[1초 간편 신청]</strong> 버튼으로 바로 요청할 수 있습니다.</span>
          <button onclick="SuppliesModule.openPresetModal()" class="text-emerald-600 hover:underline font-bold text-xs">
            + 자주쓰는 품목 추가
          </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          ${presets.map(p => `
            <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition flex flex-col justify-between space-y-3">
              <div>
                <div class="flex items-center justify-between gap-1 mb-1.5">
                  ${renderCategoryBadge(p.category)}
                  <span class="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">₩${(p.estimatedPrice || 0).toLocaleString()}</span>
                </div>
                <h4 class="font-extrabold text-sm text-slate-900 dark:text-white">${escapeHTML(p.itemName)}</h4>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">${escapeHTML(p.memo || '주요 구매처: ' + (p.defaultVendor || '도매몰'))}</p>
              </div>

              <div class="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-1.5 flex-wrap">
                <span class="text-[11px] text-slate-400">기본단위: ${escapeHTML(p.defaultUnit || '개')}</span>
                <div class="flex items-center gap-1 ml-auto">
                  <button 
                    onclick="SuppliesModule.openPresetModal('${p.id}')"
                    class="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold text-[11px] transition"
                    title="카탈로그 품목 수정"
                  >
                    <i class="fas fa-edit"></i> 수정
                  </button>
                  <button 
                    onclick="SuppliesModule.deletePreset('${p.id}')"
                    class="p-1 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                    title="카탈로그 품목 삭제"
                  >
                    <i class="fas fa-trash-alt text-[11px]"></i>
                  </button>
                  <button 
                    onclick="SuppliesModule.openRequestModalWithPreset('${p.id}')"
                    class="px-2.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition shadow-sm flex items-center gap-1"
                  >
                    <i class="fas fa-paper-plane"></i> 1초 신청
                  </button>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // 3. 모달 HTML 렌더링 함수들
  function renderRequestModalHTML(presets, currUser) {
    const applicantName = currUser ? currUser.name : '직원';
    const applicantRole = currUser ? currUser.role : '일반직원';

    return `
      <div id="supplies-request-modal" class="modal-overlay" style="display:none;">
        <div class="modal-card max-w-lg">
          <div class="modal-header">
            <h3 class="font-bold text-base flex items-center gap-2">
              <span>📦 신규 약국 소모품 요청 올리기</span>
            </h3>
            <button class="close-btn" onclick="SuppliesModule.closeRequestModal()">&times;</button>
          </div>
          
          <form onsubmit="SuppliesModule.handleRequestSubmit(event)" class="modal-body space-y-4">
            
            <div class="form-group">
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">자주 쓰는 품목 빠른 선택 (선택 시 자동 채움)</label>
              <select id="sup-req-preset-select" onchange="SuppliesModule.applyPresetToForm(this.value)" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium">
                <option value="">-- 직접 입력 또는 아래 카탈로그에서 선택 --</option>
                ${presets.map(p => `<option value="${p.id}">${p.itemName} (${p.category} / ₩${(p.estimatedPrice||0).toLocaleString()})</option>`).join('')}
              </select>
            </div>

            <div class="form-group">
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">소모품 품목명 <span class="text-rose-500">*</span></label>
              <input type="text" id="sup-req-name" required placeholder="예: 전산약봉투, 영수증 감열지롤, 라벨지..." class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold">
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div class="form-group">
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">카테고리</label>
                <select id="sup-req-cat" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium">
                  <option value="전산/인쇄">전산/인쇄</option>
                  <option value="약봉투/비닐">약봉투/비닐</option>
                  <option value="조제용품">조제용품</option>
                  <option value="청소용품">청소용품</option>
                  <option value="기타">기타소모품</option>
                </select>
              </div>

              <div class="form-group">
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">긴급도</label>
                <select id="sup-req-urgency" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-red-500">
                  <option value="NORMAL">보통 (일반 재고 보충)</option>
                  <option value="URGENT">⚡ 긴급 (재고 임박/즉시 주문)</option>
                </select>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div class="form-group">
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">필요 수량 <span class="text-rose-500">*</span></label>
                <input type="number" id="sup-req-qty" required min="1" value="1" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-black">
              </div>

              <div class="form-group">
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">단위 (상자/묶음/롤)</label>
                <input type="text" id="sup-req-unit" placeholder="예: 상자, 박스(50롤)" value="상자" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium">
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div class="form-group">
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">신청자 성함</label>
                <input type="text" id="sup-req-applicant" value="${escapeHTML(applicantName)}" required class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold">
              </div>

              <div class="form-group">
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">예상 구매처 (선택)</label>
                <input type="text" id="sup-req-vendor" placeholder="예: 조은봉투, 드림오피스, 백제약품" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium">
              </div>
            </div>

            <div class="form-group">
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">요청 사유 및 특이사항 메모</label>
              <textarea id="sup-req-memo" rows="2" placeholder="예: 전산봉투 잔여수량 1상자 미만으로 떨어졌습니다. 2상자 추가 구매 필요합니다." class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium"></textarea>
            </div>

            <div class="modal-footer flex items-center justify-end gap-2 pt-3">
              <button type="button" class="btn btn-secondary" onclick="SuppliesModule.closeRequestModal()">취소</button>
              <button type="submit" class="btn btn-primary bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded-xl text-xs">
                🚀 소모품 요청 올리기
              </button>
            </div>

          </form>
        </div>
      </div>
    `;
  }

  function renderConfirmModalHTML() {
    return `
      <div id="supplies-confirm-modal" class="modal-overlay" style="display:none;">
        <div class="modal-card max-w-md">
          <div class="modal-header">
            <h3 class="font-bold text-base text-blue-600 dark:text-blue-400 flex items-center gap-2">
              <i class="fas fa-check-circle"></i>
              <span>약국장 소모품 주문 확정</span>
            </h3>
            <button class="close-btn" onclick="SuppliesModule.closeConfirmModal()">&times;</button>
          </div>
          
          <form onsubmit="SuppliesModule.handleConfirmSubmit(event)" class="modal-body space-y-4">
            <input type="hidden" id="sup-confirm-id">

            <div class="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-xl border border-blue-200 dark:border-blue-800 text-xs space-y-1">
              <div id="sup-confirm-summary" class="font-extrabold text-blue-900 dark:text-blue-200"></div>
              <div id="sup-confirm-memo" class="text-blue-700 dark:text-blue-300"></div>
            </div>

            <div class="form-group">
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">실제 주문처 (도매상 / 인쇄소 / 쇼핑몰) <span class="text-rose-500">*</span></label>
              <input type="text" id="sup-confirm-vendor" required placeholder="예: 조은봉투 인쇄소, 드림오피스 몰" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold">
            </div>

            <div class="form-group">
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">실제 결제/주문 금액 (원) <span class="text-rose-500">*</span></label>
              <input type="number" id="sup-confirm-price" required min="0" step="100" placeholder="예: 120000" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-black text-emerald-600">
            </div>

            <div class="modal-footer flex items-center justify-end gap-2 pt-3">
              <button type="button" class="btn btn-secondary" onclick="SuppliesModule.closeConfirmModal()">취소</button>
              <button type="submit" class="btn btn-primary bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 py-2 rounded-xl text-xs">
                ✅ 주문 완료 처리
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  function renderCompleteModalHTML() {
    return `
      <div id="supplies-complete-modal" class="modal-overlay" style="display:none;">
        <div class="modal-card max-w-md">
          <div class="modal-header">
            <h3 class="font-bold text-base text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
              <i class="fas fa-box-open"></i>
              <span id="sup-complete-modal-title">약국 소모품 입고 완료 & 보관 위치 등록</span>
            </h3>
            <button class="close-btn" onclick="SuppliesModule.closeCompleteModal()">&times;</button>
          </div>
          
          <form onsubmit="SuppliesModule.handleCompleteSubmit(event)" class="modal-body space-y-4">
            <input type="hidden" id="sup-complete-id">

            <div class="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800 text-xs space-y-1.5">
              <div id="sup-complete-summary" class="font-black text-emerald-900 dark:text-emerald-200 text-sm"></div>
              <div id="sup-complete-details" class="text-emerald-700 dark:text-emerald-300 font-bold"></div>
            </div>

            <p class="text-xs font-bold text-slate-700 dark:text-slate-200 leading-relaxed">
              위 소모품이 약국에 입고되었습니다. <strong class="text-emerald-600 dark:text-emerald-400">보관해 둔 위치와 현장 사진</strong>을 함께 기록해 두면 전 직원이 쉽게 찾을 수 있습니다!
            </p>

            <!-- 📍 입고 보관 위치 설명 -->
            <div class="form-group space-y-1.5">
              <label class="block text-xs font-extrabold text-slate-700 dark:text-slate-200">
                📍 입고 물품 보관 위치 <span class="text-slate-400 font-normal">(선택 · 1초 태그 클릭 또는 직접 입력)</span>
              </label>
              <div class="flex items-center gap-1 flex-wrap">
                ${LOCATION_QUICK_TAGS.map(tag => `
                  <button type="button" onclick="SuppliesModule.setQuickLocation('complete', '${tag}')" class="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-emerald-100 dark:hover:bg-emerald-950 text-slate-600 dark:text-slate-300 hover:text-emerald-700 border border-slate-200 dark:border-slate-700 text-[11px] font-bold transition">
                    +${tag}
                  </button>
                `).join('')}
              </div>
              <input type="text" id="sup-complete-location" placeholder="예: 탕비실 선반 2층 우측 박스칸 / 조제실 ATC 하단 서랍" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500">
            </div>

            <!-- 📸 보관 위치 사진 첨부 (카메라 직통 / 갤러리) -->
            <div class="form-group space-y-2">
              <label class="block text-xs font-extrabold text-slate-700 dark:text-slate-200">
                📸 보관 위치 사진 첨부 <span class="text-slate-400 font-normal">(선택 · 최대 5장)</span>
              </label>
              <div class="grid grid-cols-2 gap-2.5">
                <label for="sup-complete-photo-cam" class="flex flex-col items-center justify-center gap-1 p-3 rounded-xl border-2 border-dashed border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 font-extrabold text-xs cursor-pointer hover:bg-emerald-100/70 transition text-center">
                  <i class="fas fa-camera text-lg text-emerald-600"></i>
                  <span>📸 바로 카메라 촬영</span>
                  <span class="text-[10px] font-normal text-emerald-600/80">(모바일 현장 촬영)</span>
                </label>
                <input type="file" id="sup-complete-photo-cam" accept="image/*" capture="environment" style="display:none;" onchange="SuppliesModule.handleSupplyPhotoSelect('complete', this)">

                <label for="sup-complete-photo-gal" class="flex flex-col items-center justify-center gap-1 p-3 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 font-extrabold text-xs cursor-pointer hover:bg-slate-100 transition text-center">
                  <i class="fas fa-images text-lg text-slate-500"></i>
                  <span>📁 앨범/사진 선택</span>
                  <span class="text-[10px] font-normal text-slate-400">(갤러리 / PC)</span>
                </label>
                <input type="file" id="sup-complete-photo-gal" accept="image/*" multiple style="display:none;" onchange="SuppliesModule.handleSupplyPhotoSelect('complete', this)">
              </div>

              <!-- 첨부 사진 썸네일 미리보기 -->
              <div id="sup-complete-photo-preview" style="display:none;" class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                <div class="flex items-center justify-between">
                  <span id="sup-complete-photo-count" class="text-[11px] font-extrabold text-emerald-700 dark:text-emerald-400">📷 첨부된 사진 (0/5장)</span>
                  <button type="button" onclick="SuppliesModule.resetSupplyPhotos('complete')" class="px-2 py-0.5 rounded bg-rose-100 text-rose-700 text-[10px] font-extrabold hover:bg-rose-200">전체 취소 ✖</button>
                </div>
                <div id="sup-complete-photo-grid" class="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar"></div>
              </div>
            </div>

            <div class="modal-footer flex items-center justify-end gap-2 pt-2">
              <button type="button" class="btn btn-secondary text-xs" onclick="SuppliesModule.closeCompleteModal()">취소</button>
              <button type="submit" data-role="sup-submit-btn" class="btn btn-primary bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1">
                <i class="fas fa-check-double"></i> 입고 완료 확정
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  function renderPresetModalHTML() {
    return `
      <div id="supplies-preset-modal" class="modal-overlay" style="display:none;">
        <div class="modal-card max-w-md">
          <div class="modal-header">
            <h3 id="sup-preset-modal-title" class="font-bold text-base flex items-center gap-2">
              <i class="fas fa-plus"></i>
              <span>자주 쓰는 소모품 품목 추가 / 수정</span>
            </h3>
            <button class="close-btn" onclick="SuppliesModule.closePresetModal()">&times;</button>
          </div>
          
          <form onsubmit="SuppliesModule.handlePresetSubmit(event)" class="modal-body space-y-3">
            <input type="hidden" id="sup-preset-id" value="">

            <div class="form-group">
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">품목명 <span class="text-rose-500">*</span></label>
              <input type="text" id="sup-preset-name" required placeholder="예: 전산봉투 5000매" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold">
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div class="form-group">
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">카테고리</label>
                <select id="sup-preset-cat" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium">
                  <option value="전산/인쇄">전산/인쇄</option>
                  <option value="약봉투/비닐">약봉투/비닐</option>
                  <option value="조제용품">조제용품</option>
                  <option value="청소용품">청소용품</option>
                  <option value="기타">기타소모품</option>
                </select>
              </div>

              <div class="form-group">
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">기본 단위</label>
                <input type="text" id="sup-preset-unit" placeholder="상자" value="상자" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium">
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div class="form-group">
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">주요 구매처</label>
                <input type="text" id="sup-preset-vendor" placeholder="조은봉투" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium">
              </div>

              <div class="form-group">
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">예상 단가(원)</label>
                <input type="number" id="sup-preset-price" placeholder="120000" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold">
              </div>
            </div>

            <div class="form-group">
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">참고 규격 / 특이사항</label>
              <input type="text" id="sup-preset-memo" placeholder="예: 1상자당 5,000매 규격" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium">
            </div>

            <div class="modal-footer flex items-center justify-end gap-2 pt-3">
              <button type="button" class="btn btn-secondary" onclick="SuppliesModule.closePresetModal()">취소</button>
              <button type="submit" class="btn btn-primary bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded-xl text-xs">
                저장하기
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  function renderEditModalHTML() {
    return `
      <div id="supplies-edit-modal" class="modal-overlay" style="display:none;">
        <div class="modal-card max-w-lg">
          <div class="modal-header">
            <h3 class="font-bold text-base text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
              <i class="fas fa-edit"></i>
              <span>소모품 요청 내역 및 진행 단계 통합 수정</span>
            </h3>
            <button class="close-btn" onclick="SuppliesModule.closeEditModal()">&times;</button>
          </div>
          
          <form onsubmit="SuppliesModule.handleEditSubmit(event)" class="modal-body space-y-3.5">
            <input type="hidden" id="sup-edit-id">

            <div class="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800">
              <label class="block text-xs font-black text-emerald-800 dark:text-emerald-300 mb-1.5">
                📌 현재 진행 단계 (상태 변경 및 이전 단계 되돌리기 가능)
              </label>
              <select id="sup-edit-status" class="w-full bg-white dark:bg-slate-900 border border-emerald-400 dark:border-emerald-700 rounded-xl px-3 py-2 text-xs font-black text-slate-900 dark:text-white">
                <option value="PENDING">⏳ 1단계: 요청 대기 (PENDING)</option>
                <option value="ORDERED">🚚 2단계: 주문 완료 / 진행중 (ORDERED)</option>
                <option value="COMPLETED">✅ 3단계: 입고 완료 (COMPLETED)</option>
                <option value="REJECTED">❌ 반려됨 (REJECTED)</option>
              </select>
            </div>

            <div class="form-group">
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">소모품 품목명 <span class="text-rose-500">*</span></label>
              <input type="text" id="sup-edit-name" required placeholder="예: 비닐봉투(박카스2박스용), 전산약봉투..." class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white">
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div class="form-group">
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">카테고리</label>
                <select id="sup-edit-cat" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 dark:text-white">
                  <option value="전산/인쇄">전산/인쇄</option>
                  <option value="약봉투/비닐">약봉투/비닐</option>
                  <option value="조제용품">조제용품</option>
                  <option value="청소용품">청소용품</option>
                  <option value="기타">기타소모품</option>
                </select>
              </div>

              <div class="form-group">
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">긴급도</label>
                <select id="sup-edit-urgency" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-red-500">
                  <option value="NORMAL">보통 (일반 재고 보충)</option>
                  <option value="URGENT">⚡ 긴급 (재고 임박/즉시 주문)</option>
                </select>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div class="form-group">
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">필요 수량 <span class="text-rose-500">*</span></label>
                <input type="number" id="sup-edit-qty" required min="1" value="1" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-black text-slate-900 dark:text-white">
              </div>

              <div class="form-group">
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">단위 (상자/묶음/롤/개)</label>
                <input type="text" id="sup-edit-unit" placeholder="예: 상자, 박스, 롤, 개" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 dark:text-white">
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div class="form-group">
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">신청자 성함</label>
                <input type="text" id="sup-edit-applicant" required class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white">
              </div>

              <div class="form-group">
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">주문처 (도매상/인쇄소/쇼핑몰)</label>
                <input type="text" id="sup-edit-vendor" placeholder="예: 조은봉투, 드림오피스, 쿠팡" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 dark:text-white">
              </div>
            </div>

            <div class="grid grid-cols-2 gap-3">
              <div class="form-group">
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">실제 결제/주문 금액 (원)</label>
                <input type="number" id="sup-edit-price" min="0" step="10" placeholder="예: 120000" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-black text-emerald-600">
              </div>

              <div class="form-group">
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">입고 완료일 (입고완료 시)</label>
                <input type="text" id="sup-edit-completed-date" placeholder="예: 2026-10-19" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 dark:text-white">
              </div>
            </div>

            <div class="form-group">
              <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">요청 사유 및 특이사항 메모</label>
              <textarea id="sup-edit-memo" rows="2" placeholder="특이사항 또는 메모를 입력하세요." class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-900 dark:text-white"></textarea>
            </div>

            <!-- 📍 입고 보관 위치 설명 (수정 모달) -->
            <div class="form-group space-y-1.5 pt-2 border-t border-slate-200 dark:border-slate-800">
              <label class="block text-xs font-extrabold text-emerald-700 dark:text-emerald-400">
                📍 입고 물품 보관 위치 <span class="text-slate-400 font-normal">(선택 · 입고 완료 시 보관 장소)</span>
              </label>
              <div class="flex items-center gap-1 flex-wrap">
                ${LOCATION_QUICK_TAGS.map(tag => `
                  <button type="button" onclick="SuppliesModule.setQuickLocation('edit', '${tag}')" class="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-emerald-100 dark:hover:bg-emerald-950 text-slate-600 dark:text-slate-300 hover:text-emerald-700 border border-slate-200 dark:border-slate-700 text-[10px] font-bold transition">
                    +${tag}
                  </button>
                `).join('')}
              </div>
              <input type="text" id="sup-edit-location" placeholder="예: 탕비실 선반 2층 우측 박스칸 / 조제실 하단 서랍" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white">
            </div>

            <!-- 📸 보관 위치 사진 첨부/수정 (수정 모달) -->
            <div class="form-group space-y-2">
              <label class="block text-xs font-extrabold text-emerald-700 dark:text-emerald-400">
                📸 보관 위치 사진 첨부 / 수정 <span class="text-slate-400 font-normal">(선택 · 최대 5장)</span>
              </label>
              <div class="grid grid-cols-2 gap-2.5">
                <label for="sup-edit-photo-cam" class="flex flex-col items-center justify-center gap-1 p-2.5 rounded-xl border-2 border-dashed border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 font-extrabold text-xs cursor-pointer hover:bg-emerald-100/70 transition text-center">
                  <i class="fas fa-camera text-base text-emerald-600"></i>
                  <span>📸 바로 카메라 촬영</span>
                </label>
                <input type="file" id="sup-edit-photo-cam" accept="image/*" capture="environment" style="display:none;" onchange="SuppliesModule.handleSupplyPhotoSelect('edit', this)">

                <label for="sup-edit-photo-gal" class="flex flex-col items-center justify-center gap-1 p-2.5 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 font-extrabold text-xs cursor-pointer hover:bg-slate-100 transition text-center">
                  <i class="fas fa-images text-base text-slate-500"></i>
                  <span>📁 앨범/사진 선택</span>
                </label>
                <input type="file" id="sup-edit-photo-gal" accept="image/*" multiple style="display:none;" onchange="SuppliesModule.handleSupplyPhotoSelect('edit', this)">
              </div>

              <div id="sup-edit-photo-preview" style="display:none;" class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                <div class="flex items-center justify-between">
                  <span id="sup-edit-photo-count" class="text-[11px] font-extrabold text-emerald-700 dark:text-emerald-400">📷 첨부된 사진 (0/5장)</span>
                  <button type="button" onclick="SuppliesModule.resetSupplyPhotos('edit')" class="px-2 py-0.5 rounded bg-rose-100 text-rose-700 text-[10px] font-extrabold hover:bg-rose-200">전체 취소 ✖</button>
                </div>
                <div id="sup-edit-photo-grid" class="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar"></div>
              </div>
            </div>

            <div class="modal-footer flex items-center justify-end gap-2 pt-3">
              <button type="button" class="btn btn-secondary text-xs" onclick="SuppliesModule.closeEditModal()">취소</button>
              <button type="submit" data-role="sup-submit-btn" class="btn btn-primary bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1">
                <i class="fas fa-save"></i> 수정 내용 저장
              </button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  // 4. 모듈 이벤트 및 액션 컨트롤러
  function setTab(tab) {
    activeTab = tab;
    if (window.App && typeof window.App.renderActiveModule === 'function') {
      window.App.renderActiveModule();
    }
  }

  function setStatusFilter(filter) {
    if (activeTab !== 'requests') {
      activeTab = 'requests';
      statusFilter = filter;
    } else if (filter !== 'ALL' && statusFilter === filter) {
      statusFilter = 'ALL';
    } else {
      statusFilter = filter;
    }
    if (window.App && typeof window.App.renderActiveModule === 'function') {
      window.App.renderActiveModule();
    }
  }

  function handleSearch(query) {
    searchQuery = query;
    const content = document.getElementById('supplies-tab-content');
    if (content) {
      const supplies = window.SheetsSync.getSupplies() || [];
      const presets = window.SheetsSync.getSupplyPresets() || [];
      const currUser = window.SheetsSync.getCurrentUser();
      const isDirector = currUser && currUser.role === '약국장';
      content.innerHTML = activeTab === 'requests' ? renderRequestsTabHTML(supplies, isDirector) : renderCatalogTabHTML(presets, isDirector);
    }
  }

  function toggleUrgentFilter() {
    urgentOnlyFilter = !urgentOnlyFilter;
    if (window.App && typeof window.App.renderActiveModule === 'function') {
      window.App.renderActiveModule();
    }
  }

  function openRequestModal() {
    const modal = document.getElementById('supplies-request-modal');
    if (modal) modal.style.display = 'flex';
  }

  function openRequestModalWithPreset(presetId) {
    openRequestModal();
    applyPresetToForm(presetId);
  }

  function closeRequestModal() {
    const modal = document.getElementById('supplies-request-modal');
    if (modal) modal.style.display = 'none';
  }

  function applyPresetToForm(presetId) {
    if (!presetId) return;
    const presets = window.SheetsSync.getSupplyPresets() || [];
    const p = presets.find(item => item.id === presetId);
    if (!p) return;

    const nameEl = document.getElementById('sup-req-name');
    const catEl = document.getElementById('sup-req-cat');
    const unitEl = document.getElementById('sup-req-unit');
    const vendorEl = document.getElementById('sup-req-vendor');
    const memoEl = document.getElementById('sup-req-memo');

    if (nameEl) nameEl.value = p.itemName || '';
    if (catEl) catEl.value = p.category || '기타';
    if (unitEl) unitEl.value = p.defaultUnit || '상자';
    if (vendorEl) vendorEl.value = p.defaultVendor || '';
    if (memoEl && p.memo) memoEl.value = p.memo;
  }

  function handleRequestSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('sup-req-name').value.trim();
    const category = document.getElementById('sup-req-cat').value;
    const urgency = document.getElementById('sup-req-urgency').value;
    const qty = Number(document.getElementById('sup-req-qty').value) || 1;
    const unit = document.getElementById('sup-req-unit').value.trim() || '개';
    const applicantName = document.getElementById('sup-req-applicant').value.trim() || '직원';
    const vendor = document.getElementById('sup-req-vendor').value.trim();
    const memo = document.getElementById('sup-req-memo').value.trim();

    if (!name) {
      alert('소모품 품목명을 입력하세요.');
      return;
    }

    const currUser = window.SheetsSync.getCurrentUser();
    const applicantRole = currUser ? currUser.role : '직원';

    window.SheetsSync.addSupplyRequest({
      itemName: name,
      category,
      urgency,
      qty,
      unit,
      applicantName,
      applicantRole,
      vendor,
      memo
    });

    closeRequestModal();
    alert('📦 소모품 요청이 정상 등록되었습니다!\n사이드바와 약국장 대시보드에 실시간 공유됩니다.');

    if (window.App && typeof window.App.renderActiveModule === 'function') {
      window.App.renderActiveModule();
    }
  }

  function openConfirmModal(id) {
    const supplies = window.SheetsSync.getSupplies() || [];
    const target = supplies.find(s => s.id === id);
    if (!target) return;

    const modal = document.getElementById('supplies-confirm-modal');
    const idEl = document.getElementById('sup-confirm-id');
    const summaryEl = document.getElementById('sup-confirm-summary');
    const memoEl = document.getElementById('sup-confirm-memo');
    const vendorEl = document.getElementById('sup-confirm-vendor');
    const priceEl = document.getElementById('sup-confirm-price');
    const payMethodEl = document.getElementById('sup-confirm-paymethod');
    const ledgerCategoryEl = document.getElementById('sup-confirm-ledgercategory');

    if (idEl) idEl.value = target.id;
    if (summaryEl) summaryEl.textContent = `[${target.category || '소모품'}] ${target.itemName} (${target.qty}${target.unit || '개'}) - 신청: ${target.applicantName || '직원'}`;
    if (memoEl) memoEl.textContent = target.memo ? `메모: ${target.memo}` : '';
    if (vendorEl) vendorEl.value = target.vendor || '조은봉투 인쇄소';
    if (priceEl) priceEl.value = target.estimatedPrice || target.actualPrice || 120000;

    if (payMethodEl) {
      payMethodEl.value = target.payMethod || 'CASH';
      updateLedgerCategoryOptions(payMethodEl.value);
    }
    if (ledgerCategoryEl && target.ledgerCategory) {
      ledgerCategoryEl.value = target.ledgerCategory;
    }

    if (modal) modal.style.display = 'flex';
  }

  function closeConfirmModal() {
    const modal = document.getElementById('supplies-confirm-modal');
    if (modal) modal.style.display = 'none';
  }

  function updateLedgerCategoryOptions(payMethod) {
    const selectEl = document.getElementById('sup-confirm-ledgercategory');
    if (!selectEl) return;

    if (payMethod === 'CARD') {
      selectEl.innerHTML = `
        <option value="잡비 카드">🟡 [카드] 잡비 카드 (소모품/쿠팡/일반쇼핑몰 카드 결제) [추천]</option>
        <option value="조은봉투">🟡 [카드] 조은봉투 (약봉투/전산봉투 카드 결제)</option>
        <option value="그외 온라인결제">🟡 [카드] 그외 온라인결제 (제약회사 온라인 결제)</option>
        <option value="바로팜">🟡 [카드] 바로팜</option>
        <option value="HMP 대웅 한미">🟡 [카드] HMP 대웅 한미</option>
        <option value="대웅 다원">🟡 [카드] 대웅 다원</option>
        <option value="동아">🟡 [카드] 동아</option>
        <option value="쥴릭">🟡 [카드] 쥴릭</option>
        <option value="동화약품">🟡 [카드] 동화약품</option>
        <option value="일동">🟡 [카드] 일동</option>
        <option value="종근당">🟡 [카드] 종근당</option>
        <option value="녹십자">🟡 [카드] 녹십자</option>
        <option value="보령">🟡 [카드] 보령</option>
      `;
    } else {
      selectEl.innerHTML = `
        <option value="잡비 현금">🟢 [현금] 잡비 현금 (소모품/전산봉투/기타 현금) [추천]</option>
        <option value="식대">🟢 [현금] 식대</option>
        <option value="박카스">🟢 [현금] 박카스</option>
        <option value="현매">🟢 [현금] 현매</option>
        <option value="손님계좌이체">🟢 [현금] 손님계좌이체</option>
      `;
    }
  }

  function handleConfirmSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('sup-confirm-id').value;
    const vendorEl = document.getElementById('sup-confirm-vendor');
    const priceEl = document.getElementById('sup-confirm-price');
    const vendor = vendorEl ? vendorEl.value.trim() : '';
    const price = priceEl ? (Number(priceEl.value) || 0) : 0;

    window.SheetsSync.updateSupplyStatus(id, 'ORDERED', {
      vendor,
      actualPrice: price
    });

    closeConfirmModal();

    if (window.App && typeof window.App.renderActiveModule === 'function') {
      window.App.renderActiveModule();
    }
  }

  function setQuickLocation(mode, tag) {
    const inputId = mode === 'edit' ? 'sup-edit-location' : 'sup-complete-location';
    const el = document.getElementById(inputId);
    if (!el) return;
    const cur = el.value.trim();
    if (!cur) {
      el.value = tag;
    } else if (!cur.includes(tag)) {
      el.value = cur + ' · ' + tag;
    }
    el.focus();
  }

  function compressLocalSupplyImage(file) {
    return new Promise((resolve) => {
      if (window.App && typeof window.App.compressPhotoFile === 'function') {
        window.App.compressPhotoFile(file).then(resolve).catch(() => resolve(''));
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const img = new Image();
          img.onload = () => {
            try {
              const canvas = document.createElement('canvas');
              const MAX_WIDTH = 720;
              let width = img.width || MAX_WIDTH;
              let height = img.height || 540;
              if (width > MAX_WIDTH) {
                height = Math.round((height * MAX_WIDTH) / width);
                width = MAX_WIDTH;
              }
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              if (ctx) ctx.drawImage(img, 0, 0, width, height);
              resolve(canvas.toDataURL('image/jpeg', 0.65));
            } catch (err) {
              resolve(e.target.result);
            }
          };
          img.onerror = () => resolve('');
          img.src = e.target.result;
        } catch (err) {
          resolve('');
        }
      };
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  }

  async function handleSupplyPhotoSelect(mode, input) {
    if (!input || !input.files || input.files.length === 0) return;
    const targetArr = mode === 'edit' ? selectedEditPhotos : selectedCompletePhotos;
    const files = Array.from(input.files);
    for (const file of files) {
      if (targetArr.length >= 5) {
        alert('보관 위치 사진은 최대 5장까지 첨부할 수 있습니다.');
        break;
      }
      const dataUrl = await compressLocalSupplyImage(file);
      if (dataUrl) {
        targetArr.push({
          id: 'sup_p_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          data: dataUrl,
          isNew: true
        });
      }
    }
    input.value = '';
    renderSupplyPhotoPreviews(mode);
  }

  function renderSupplyPhotoPreviews(mode) {
    const prefix = mode === 'edit' ? 'sup-edit-photo' : 'sup-complete-photo';
    const targetArr = mode === 'edit' ? selectedEditPhotos : selectedCompletePhotos;
    const previewBox = document.getElementById(prefix + '-preview');
    const countEl = document.getElementById(prefix + '-count');
    const gridEl = document.getElementById(prefix + '-grid');
    if (!previewBox || !gridEl) return;

    if (targetArr.length === 0) {
      previewBox.style.display = 'none';
      gridEl.innerHTML = '';
      return;
    }

    previewBox.style.display = 'block';
    if (countEl) countEl.textContent = `📷 첨부된 사진 (${targetArr.length}/5장)`;
    gridEl.innerHTML = targetArr.map((p, idx) => `
      <div class="relative w-16 h-16 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700 bg-white flex-shrink-0 shadow-sm">
        <img src="${p.data}" alt="첨부사진 ${idx + 1}" class="w-full h-full object-cover" />
        <button type="button" onclick="SuppliesModule.removeSupplyPhoto('${mode}', ${idx})" class="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-rose-600 text-white text-[10px] font-black flex items-center justify-center shadow">✕</button>
        <span class="absolute bottom-0.5 left-0.5 bg-slate-900/75 text-white text-[9px] font-bold px-1 rounded">${idx + 1}</span>
      </div>
    `).join('');
  }

  function removeSupplyPhoto(mode, idx) {
    const targetArr = mode === 'edit' ? selectedEditPhotos : selectedCompletePhotos;
    if (idx >= 0 && idx < targetArr.length) {
      targetArr.splice(idx, 1);
      renderSupplyPhotoPreviews(mode);
    }
  }

  function resetSupplyPhotos(mode) {
    if (mode === 'edit') {
      selectedEditPhotos = [];
      const cam = document.getElementById('sup-edit-photo-cam');
      const gal = document.getElementById('sup-edit-photo-gal');
      if (cam) cam.value = '';
      if (gal) gal.value = '';
    } else {
      selectedCompletePhotos = [];
      const cam = document.getElementById('sup-complete-photo-cam');
      const gal = document.getElementById('sup-complete-photo-gal');
      if (cam) cam.value = '';
      if (gal) gal.value = '';
    }
    renderSupplyPhotoPreviews(mode);
  }

  async function uploadSupplyPhotoArray(photoObjArr) {
    if (!photoObjArr || photoObjArr.length === 0) return [];
    const uploaded = await Promise.all(photoObjArr.map(async (p) => {
      if (!p || !p.data) return '';
      if (!p.isNew && (p.data.startsWith('http') || p.data.startsWith('assets/'))) {
        return p.data;
      }
      if (window.App && typeof window.App.processAndUploadPhoto === 'function') {
        try {
          const cloudUrl = await window.App.processAndUploadPhoto(p.data);
          return cloudUrl || p.data;
        } catch (e) {
          return p.data;
        }
      }
      return p.data;
    }));
    return uploaded.filter(Boolean);
  }

  function openSupplyPhoto(id, photoIndex = 0) {
    const supplies = window.SheetsSync.getSupplies() || [];
    const target = supplies.find(s => String(s.id) === String(id));
    if (!target) return;
    const photos = (Array.isArray(target.photos) && target.photos.length > 0)
      ? target.photos.filter(Boolean)
      : (target.photoUrl ? [target.photoUrl] : []);
    if (photos.length === 0) return;

    if (window.App && typeof window.App.openImageLightbox === 'function') {
      const title = `📦 [${target.itemName}] 보관 위치: ${target.storageLocation || '현장 사진'}`;
      window.App.openImageLightbox(photos, title, photoIndex);
    } else {
      window.open(photos[photoIndex] || photos[0], '_blank');
    }
  }

  function openCompleteModal(id) {
    const supplies = window.SheetsSync.getSupplies() || [];
    const target = supplies.find(s => s.id === id);
    if (!target) return;

    const summaryEl = document.getElementById('sup-complete-summary');
    const detailsEl = document.getElementById('sup-complete-details');
    const idEl = document.getElementById('sup-complete-id');

    if (idEl) idEl.value = target.id;
    if (summaryEl) summaryEl.innerText = `📦 ${target.itemName} (${target.qty}${target.unit || '개'})`;
    if (detailsEl) detailsEl.innerText = `주문처: ${target.vendor || '미지정'} · 결제금액: ₩${(target.actualPrice || target.estimatedPrice || 0).toLocaleString()}`;
    const titleEl = document.getElementById('sup-complete-modal-title');
    if (titleEl) {
      titleEl.textContent = target.status === 'COMPLETED' ? '입고 물품 보관 위치 & 사진 등록/수정' : '약국 소모품 입고 완료 & 보관 위치 등록';
    }
    const locEl = document.getElementById('sup-complete-location');
    if (locEl) locEl.value = target.storageLocation || '';
    resetSupplyPhotos('complete');
    const existingPhotos = (Array.isArray(target.photos) && target.photos.length > 0)
      ? target.photos.filter(Boolean)
      : (target.photoUrl ? [target.photoUrl] : []);
    existingPhotos.forEach((url, idx) => {
      selectedCompletePhotos.push({ id: 'sup_exist_c_' + idx, data: url, isNew: false });
    });
    renderSupplyPhotoPreviews('complete');

    const modal = document.getElementById('supplies-complete-modal');
    if (modal) modal.style.display = 'flex';
  }

  function closeCompleteModal() {
    const modal = document.getElementById('supplies-complete-modal');
    if (modal) modal.style.display = 'none';
  }

  async function handleCompleteSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('sup-complete-id').value;
    if (!id) return;

    const locEl = document.getElementById('sup-complete-location');
    const storageLocation = locEl ? locEl.value.trim() : '';
    const submitBtn = e.target ? e.target.querySelector('button[type="submit"]') : null;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 사진 업로드 및 저장 중...';
    }

    try {
      const uploadedUrls = await uploadSupplyPhotoArray(selectedCompletePhotos);
      window.SheetsSync.updateSupplyStatus(id, 'COMPLETED', {
        storageLocation,
        photoUrl: uploadedUrls[0] || '',
        photos: uploadedUrls
      });
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-check-double"></i> 입고 완료 확정';
      }
      resetSupplyPhotos('complete');
    }
    closeCompleteModal();

    if (window.App && typeof window.App.renderActiveModule === 'function') {
      window.App.renderActiveModule();
    }
  }

  function completeOrderPrompt(id) {
    openCompleteModal(id);
  }

  function openEditModal(id) {
    const supplies = window.SheetsSync.getSupplies() || [];
    const target = supplies.find(s => String(s.id) === String(id));
    if (!target) return;

    const idEl = document.getElementById('sup-edit-id');
    const statusEl = document.getElementById('sup-edit-status');
    const nameEl = document.getElementById('sup-edit-name');
    const catEl = document.getElementById('sup-edit-cat');
    const urgencyEl = document.getElementById('sup-edit-urgency');
    const qtyEl = document.getElementById('sup-edit-qty');
    const unitEl = document.getElementById('sup-edit-unit');
    const applicantEl = document.getElementById('sup-edit-applicant');
    const vendorEl = document.getElementById('sup-edit-vendor');
    const priceEl = document.getElementById('sup-edit-price');
    const completedDateEl = document.getElementById('sup-edit-completed-date');
    const memoEl = document.getElementById('sup-edit-memo');

    if (idEl) idEl.value = target.id;
    if (statusEl) statusEl.value = target.status || 'PENDING';
    if (nameEl) nameEl.value = target.itemName || '';
    if (catEl) {
      const catVal = target.category === '기타소모품' ? '기타' : (target.category || '기타');
      catEl.value = ['전산/인쇄', '약봉투/비닐', '조제용품', '청소용품', '기타'].includes(catVal) ? catVal : '기타';
    }
    if (urgencyEl) urgencyEl.value = target.urgency || 'NORMAL';
    if (qtyEl) qtyEl.value = Number(target.qty) || 1;
    if (unitEl) unitEl.value = target.unit || '상자';
    if (applicantEl) applicantEl.value = target.applicantName || '직원';
    if (vendorEl) vendorEl.value = target.vendor || '';
    if (priceEl) priceEl.value = Number(target.actualPrice || target.estimatedPrice) || 0;
    if (completedDateEl) completedDateEl.value = target.completedAt || '';
    if (memoEl) memoEl.value = target.memo || '';
    const locEl = document.getElementById('sup-edit-location');
    if (locEl) locEl.value = target.storageLocation || '';
    resetSupplyPhotos('edit');
    const existingPhotos = (Array.isArray(target.photos) && target.photos.length > 0)
      ? target.photos.filter(Boolean)
      : (target.photoUrl ? [target.photoUrl] : []);
    existingPhotos.forEach((url, idx) => {
      selectedEditPhotos.push({ id: 'sup_exist_e_' + idx, data: url, isNew: false });
    });
    renderSupplyPhotoPreviews('edit');

    const modal = document.getElementById('supplies-edit-modal');
    if (modal) modal.style.display = 'flex';
  }

  function closeEditModal() {
    const modal = document.getElementById('supplies-edit-modal');
    if (modal) modal.style.display = 'none';
  }

  async function handleEditSubmit(e) {
    e.preventDefault();
    const id = document.getElementById('sup-edit-id').value;
    if (!id) return;

    const newStatus = document.getElementById('sup-edit-status').value || 'PENDING';
    const itemName = document.getElementById('sup-edit-name').value.trim();
    const category = document.getElementById('sup-edit-cat').value;
    const urgency = document.getElementById('sup-edit-urgency').value;
    const qty = Math.max(1, Number(document.getElementById('sup-edit-qty').value) || 1);
    const unit = document.getElementById('sup-edit-unit').value.trim() || '개';
    const applicantName = document.getElementById('sup-edit-applicant').value.trim() || '직원';
    const vendor = document.getElementById('sup-edit-vendor').value.trim();
    const price = Math.max(0, Number(document.getElementById('sup-edit-price').value) || 0);
    const completedAt = document.getElementById('sup-edit-completed-date').value.trim();
    const memo = document.getElementById('sup-edit-memo').value.trim();
    const locEl = document.getElementById('sup-edit-location');
    const storageLocation = locEl ? locEl.value.trim() : '';

    if (!itemName) {
      alert('소모품 품목명을 입력해 주세요.');
      return;
    }

    const submitBtn = e.target ? e.target.querySelector('button[type="submit"]') : null;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 저장 중...';
    }

    try {
      const uploadedUrls = await uploadSupplyPhotoArray(selectedEditPhotos);
      window.SheetsSync.updateSupplyStatus(id, newStatus, {
        itemName,
        category,
        urgency,
        qty,
        unit,
        applicantName,
        vendor,
        actualPrice: price,
        estimatedPrice: price,
        completedAt,
        memo,
        storageLocation,
        photoUrl: uploadedUrls[0] || '',
        photos: uploadedUrls
      });
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-save"></i> 수정 내용 저장';
      }
      resetSupplyPhotos('edit');
    }

    closeEditModal();

    if (window.App && typeof window.App.renderActiveModule === 'function') {
      window.App.renderActiveModule();
    }
  }

  function revertStatus(id, targetStatus) {
    const supplies = window.SheetsSync.getSupplies() || [];
    const target = supplies.find(s => String(s.id) === String(id));
    if (!target) return;

    const statusLabelMap = {
      'PENDING': '⏳ 요청 대기',
      'ORDERED': '🚚 주문 완료 (진행중)',
      'COMPLETED': '✅ 입고 완료'
    };
    const nextLabel = statusLabelMap[targetStatus] || targetStatus;

    if (!confirm(`[${target.itemName}] 품목을 '${nextLabel}' 단계로 되돌리시겠습니까?`)) {
      return;
    }

    window.SheetsSync.updateSupplyStatus(id, targetStatus);

    if (window.App && typeof window.App.renderActiveModule === 'function') {
      window.App.renderActiveModule();
    }
  }

  function rejectRequest(id) {
    const reason = prompt('소모품 요청 반려 사유를 입력하세요 (예: 재고 여유 확인됨, 중복 요청)');
    if (reason === null) return;

    window.SheetsSync.updateSupplyStatus(id, 'REJECTED', { rejectReason: reason });
    if (window.App && typeof window.App.renderActiveModule === 'function') {
      window.App.renderActiveModule();
    }
  }

  function deleteRequest(id) {
    if (!confirm('정말 이 소모품 요청 기록을 삭제하시겠습니까?')) return;
    window.SheetsSync.deleteSupplyRequest(id);
    if (window.App && typeof window.App.renderActiveModule === 'function') {
      window.App.renderActiveModule();
    }
  }

  function openPresetModal(presetId) {
    const modal = document.getElementById('supplies-preset-modal');
    const idEl = document.getElementById('sup-preset-id');
    const nameEl = document.getElementById('sup-preset-name');
    const catEl = document.getElementById('sup-preset-cat');
    const unitEl = document.getElementById('sup-preset-unit');
    const vendorEl = document.getElementById('sup-preset-vendor');
    const priceEl = document.getElementById('sup-preset-price');
    const memoEl = document.getElementById('sup-preset-memo');

    if (presetId) {
      const presets = window.SheetsSync.getSupplyPresets() || [];
      const target = presets.find(p => String(p.id) === String(presetId));
      if (target) {
        if (idEl) idEl.value = target.id;
        if (nameEl) nameEl.value = target.itemName || '';
        if (catEl) catEl.value = target.category || '전산/인쇄';
        if (unitEl) unitEl.value = target.defaultUnit || '상자';
        if (vendorEl) vendorEl.value = target.defaultVendor || '';
        if (priceEl) priceEl.value = target.estimatedPrice || 0;
        if (memoEl) memoEl.value = target.memo || '';
      }
    } else {
      if (idEl) idEl.value = '';
      if (nameEl) nameEl.value = '';
      if (catEl) catEl.value = '전산/인쇄';
      if (unitEl) unitEl.value = '상자';
      if (vendorEl) vendorEl.value = '';
      if (priceEl) priceEl.value = '';
      if (memoEl) memoEl.value = '';
    }

    if (modal) modal.style.display = 'flex';
  }

  function closePresetModal() {
    const modal = document.getElementById('supplies-preset-modal');
    if (modal) modal.style.display = 'none';
  }

  function handlePresetSubmit(e) {
    e.preventDefault();
    const idEl = document.getElementById('sup-preset-id');
    const editId = idEl ? idEl.value.trim() : '';
    const name = document.getElementById('sup-preset-name').value.trim();
    const category = document.getElementById('sup-preset-cat').value;
    const unit = document.getElementById('sup-preset-unit').value.trim() || '상자';
    const vendor = document.getElementById('sup-preset-vendor').value.trim() || '도매몰';
    const price = Number(document.getElementById('sup-preset-price').value) || 0;
    const memo = document.getElementById('sup-preset-memo').value.trim();

    if (!name) return;

    const presets = window.SheetsSync.getSupplyPresets() || [];
    if (editId) {
      const idx = presets.findIndex(p => String(p.id) === String(editId));
      if (idx !== -1) {
        presets[idx] = {
          ...presets[idx],
          itemName: name,
          category,
          defaultUnit: unit,
          defaultVendor: vendor,
          estimatedPrice: price,
          memo
        };
      }
    } else {
      presets.push({
        id: 'pre_' + Date.now(),
        itemName: name,
        category,
        defaultUnit: unit,
        defaultVendor: vendor,
        estimatedPrice: price,
        memo
      });
    }

    window.SheetsSync.saveSupplyPresets(presets);
    closePresetModal();
    alert(editId ? '자주 쓰는 소모품 정보가 수정되었습니다.' : '자주 쓰는 소모품이 카탈로그에 등록되었습니다.');

    if (window.App && typeof window.App.renderActiveModule === 'function') {
      window.App.renderActiveModule();
    }
  }

  function deletePreset(presetId) {
    if (!presetId) return;
    if (!confirm('이 자주 쓰는 소모품 품목을 카탈로그에서 삭제하시겠습니까?')) return;
    const presets = (window.SheetsSync.getSupplyPresets() || []).filter(p => String(p.id) !== String(presetId));
    window.SheetsSync.saveSupplyPresets(presets);
    if (window.App && typeof window.App.renderActiveModule === 'function') {
      window.App.renderActiveModule();
    }
  }

  function escapeHTML(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, function (m) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
    });
  }

  return {
    renderHTML,
    setTab,
    setStatusFilter,
    handleSearch,
    toggleUrgentFilter,
    openRequestModal,
    openRequestModalWithPreset,
    closeRequestModal,
    applyPresetToForm,
    handleRequestSubmit,
    openConfirmModal,
    closeConfirmModal,
    updateLedgerCategoryOptions,
    handleConfirmSubmit,
    openCompleteModal,
    closeCompleteModal,
    handleCompleteSubmit,
    completeOrderPrompt,
    setQuickLocation,
    handleSupplyPhotoSelect,
    removeSupplyPhoto,
    resetSupplyPhotos,
    openSupplyPhoto,
    openEditModal,
    closeEditModal,
    handleEditSubmit,
    revertStatus,
    rejectRequest,
    deleteRequest,
    openPresetModal,
    closePresetModal,
    handlePresetSubmit,
    deletePreset
  };

})();

if (typeof window !== 'undefined') {
  window.addEventListener('ssg_cloud_updated', function () {
    const currMod = window.App && typeof window.App.getActiveModule === 'function' ? window.App.getActiveModule() : '';
    if (currMod === 'supplies-module' || currMod === 'supplies') {
      const activeEl = document.activeElement;
      const isTyping = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT');
      const modalIds = ['supplies-request-modal', 'supplies-confirm-modal', 'supplies-preset-modal', 'supplies-complete-modal', 'supplies-edit-modal'];
      const isAnyModalOpen = modalIds.some(function (mId) {
        const m = document.getElementById(mId);
        return m && m.style.display !== 'none' && m.style.display !== '';
      });
      if (!isTyping && !isAnyModalOpen) {
        if (window.App && typeof window.App.renderActiveModule === 'function') {
          window.App.renderActiveModule(true);
        }
      }
    }
  });
}
