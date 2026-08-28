/**
 * 📦 약국 소모품 관리 & 주문 시스템 모듈 (SuppliesModule)
 * 신세계약국 전용 - 전산봉투, 약봉투, 영수증롤, 라벨지 등 소모품 신청/승인/입고/지출연동
 */
window.SuppliesModule = (function () {
  let activeTab = 'requests'; // 'requests' | 'catalog'
  let statusFilter = 'ALL';   // 'ALL' | 'PENDING' | 'ORDERED' | 'COMPLETED' | 'REJECTED'
  let searchQuery = '';
  let urgentOnlyFilter = false;

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

        <!-- KPI 통계 카운터 카드 (2x2 모바일 / 4x1 PC 적응형) -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-4">
          <div class="bg-amber-500/10 border border-amber-500/30 rounded-xl sm:rounded-2xl p-3 sm:p-4 flex items-center justify-between">
            <div>
              <div class="text-[11px] sm:text-xs font-bold text-amber-600 dark:text-amber-400">요청 대기 중</div>
              <div class="text-xl sm:text-2xl font-black text-amber-700 dark:text-amber-300 mt-0.5">${pendingList.length} <span class="text-xs font-normal">건</span></div>
            </div>
            <div class="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-500 font-bold text-sm sm:text-base">
              ${urgentCount > 0 ? `<span class="animate-bounce text-red-500">⚡${urgentCount}</span>` : '⏳'}
            </div>
          </div>

          <div class="bg-blue-500/10 border border-blue-500/30 rounded-xl sm:rounded-2xl p-3 sm:p-4 flex items-center justify-between">
            <div>
              <div class="text-[11px] sm:text-xs font-bold text-blue-600 dark:text-blue-400">주문 진행 중</div>
              <div class="text-xl sm:text-2xl font-black text-blue-700 dark:text-blue-300 mt-0.5">${orderedList.length} <span class="text-xs font-normal">건</span></div>
            </div>
            <div class="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-500 text-sm sm:text-lg font-bold">
              🚚
            </div>
          </div>

          <div class="bg-emerald-500/10 border border-emerald-500/30 rounded-xl sm:rounded-2xl p-3 sm:p-4 flex items-center justify-between">
            <div>
              <div class="text-[11px] sm:text-xs font-bold text-emerald-600 dark:text-emerald-400">입고 완료 (누적)</div>
              <div class="text-xl sm:text-2xl font-black text-emerald-700 dark:text-emerald-300 mt-0.5">${completedList.length} <span class="text-xs font-normal">건</span></div>
            </div>
            <div class="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-500 text-sm sm:text-lg font-bold">
              ✅
            </div>
          </div>

          <div class="bg-slate-500/10 border border-slate-300 dark:border-slate-700 rounded-xl sm:rounded-2xl p-3 sm:p-4 flex items-center justify-between">
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
                  placeholder="품목명, 신청자 검색..."
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

      <!-- 공통 모달 3: 자주쓰는 품목 추가 모달 -->
      ${renderPresetModalHTML()}
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
        (s.memo && s.memo.toLowerCase().includes(q))
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

    return `
      <div class="bg-white dark:bg-slate-900 rounded-2xl p-5 border ${isUrgent ? 'border-red-400 dark:border-red-600/60 shadow-red-500/5' : 'border-slate-200 dark:border-slate-800'} shadow-sm hover:shadow-md transition flex flex-col justify-between space-y-4 relative">
        
        <!-- 카드 헤더 (긴급태그 + 카테고리 + 상태) -->
        <div>
          <div class="flex items-center justify-between gap-2 mb-2">
            <div class="flex items-center gap-1.5 flex-wrap">
              ${isUrgent ? `<span class="px-2 py-0.5 text-[10px] font-black rounded bg-red-500 text-white animate-pulse">⚡ 긴급요청</span>` : ''}
              ${renderCategoryBadge(item.category)}
            </div>
            <div>
              ${renderStatusBadge(item.status)}
            </div>
          </div>

          <h3 class="text-base font-extrabold text-slate-900 dark:text-white leading-tight">
            ${escapeHTML(item.itemName)}
          </h3>

          <div class="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2">
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
        <div class="pt-2 flex items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800">
          <div class="flex items-center gap-1.5">
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
                onclick="SuppliesModule.completeOrderPrompt('${item.id}')"
                class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow transition flex items-center gap-1"
                title="물품 수령 및 입고 완료 처리"
              >
                <i class="fas fa-box-open"></i> 입고 완료
              </button>
            ` : ''}

            ${isCompleted ? `
              <span class="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <i class="fas fa-check-double"></i> 입고 완료 (${item.completedAt || '처리됨'})
              </span>
            ` : ''}
          </div>

          <button 
            onclick="SuppliesModule.deleteRequest('${item.id}')"
            class="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            title="요청 삭제"
          >
            <i class="fas fa-trash-alt text-xs"></i>
          </button>
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
        <div class="text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between">
          <span>약국에서 정기적으로 구매하는 자주 쓰는 소모품 목록입니다. <strong>[1초 간편 신청]</strong> 버튼으로 바로 요청할 수 있습니다.</span>
          ${isDirector ? `
            <button onclick="SuppliesModule.openPresetModal()" class="text-emerald-600 hover:underline font-bold text-xs">
              + 자주쓰는 품목 추가
            </button>
          ` : ''}
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

              <div class="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                <span class="text-[11px] text-slate-400">기본단위: ${escapeHTML(p.defaultUnit || '개')}</span>
                <button 
                  onclick="SuppliesModule.openRequestModalWithPreset('${p.id}')"
                  class="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition shadow-sm flex items-center gap-1"
                >
                  <i class="fas fa-paper-plane"></i> 1초 간편 신청
                </button>
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

  function renderPresetModalHTML() {
    return `
      <div id="supplies-preset-modal" class="modal-overlay" style="display:none;">
        <div class="modal-card max-w-md">
          <div class="modal-header">
            <h3 class="font-bold text-base flex items-center gap-2">
              <i class="fas fa-plus"></i>
              <span>자주 쓰는 소모품 품목 추가</span>
            </h3>
            <button class="close-btn" onclick="SuppliesModule.closePresetModal()">&times;</button>
          </div>
          
          <form onsubmit="SuppliesModule.handlePresetSubmit(event)" class="modal-body space-y-3">
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

  // 4. 모듈 이벤트 및 액션 컨트롤러
  function setTab(tab) {
    activeTab = tab;
    if (window.App && typeof window.App.renderActiveModule === 'function') {
      window.App.renderActiveModule();
    }
  }

  function setStatusFilter(filter) {
    statusFilter = filter;
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

  function completeOrderPrompt(id) {
    const supplies = window.SheetsSync.getSupplies() || [];
    const target = supplies.find(s => s.id === id);
    if (!target) return;

    window.SheetsSync.updateSupplyStatus(id, 'COMPLETED');

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

  function openPresetModal() {
    const modal = document.getElementById('supplies-preset-modal');
    if (modal) modal.style.display = 'flex';
  }

  function closePresetModal() {
    const modal = document.getElementById('supplies-preset-modal');
    if (modal) modal.style.display = 'none';
  }

  function handlePresetSubmit(e) {
    e.preventDefault();
    const name = document.getElementById('sup-preset-name').value.trim();
    const category = document.getElementById('sup-preset-cat').value;
    const unit = document.getElementById('sup-preset-unit').value.trim() || '상자';
    const vendor = document.getElementById('sup-preset-vendor').value.trim() || '도매몰';
    const price = Number(document.getElementById('sup-preset-price').value) || 0;
    const memo = document.getElementById('sup-preset-memo').value.trim();

    if (!name) return;

    const presets = window.SheetsSync.getSupplyPresets() || [];
    presets.push({
      id: 'pre_' + Date.now(),
      itemName: name,
      category,
      defaultUnit: unit,
      defaultVendor: vendor,
      estimatedPrice: price,
      memo
    });

    window.SheetsSync.saveSupplyPresets(presets);
    closePresetModal();
    alert('자주 쓰는 소모품이 카탈로그에 등록되었습니다.');

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
    completeOrderPrompt,
    rejectRequest,
    deleteRequest,
    openPresetModal,
    closePresetModal,
    handlePresetSubmit
  };

})();

if (typeof window !== 'undefined') {
  window.addEventListener('ssg_cloud_updated', function () {
    const currMod = window.App && typeof window.App.getActiveModule === 'function' ? window.App.getActiveModule() : '';
    if (currMod === 'supplies-module' || currMod === 'supplies') {
      const activeEl = document.activeElement;
      const isTyping = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT');
      if (!isTyping) {
        if (window.App && typeof window.App.renderActiveModule === 'function') {
          window.App.renderActiveModule(true);
        }
      }
    }
  });
}
