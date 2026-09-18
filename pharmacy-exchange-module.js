/**
 * 💊 인근약국 교품 & 불용재고 대장 모듈 (Pharmacy Exchange & Dead-Stock Module)
 * 365메가스타약국 HR/OPS 마스터 개발 가이드라인 완벽 준수
 * [1] 🤝 인근약국 교품 장부: 빌려준 약(대여) / 빌려온 약(차용) 실시간 추적 및 원터치 반환/정산
 * [2] 📦 불용재고 관리: 처방 중단 고가 전문약 낱알/포장 재고 관리 및 0.1초 실시간 총 손실액 산출
 */
if (typeof window.PharmacyExchangeModule === 'undefined') {
  window.PharmacyExchangeModule = (function () {
    let activeSubTab = null;       // 탭 진입 시 최신 등록 글 기준으로 자동 결정 ('EXCHANGE' | 'DEAD_STOCK')
    let exchangeFilter = 'ALL';    // 'ALL', 'LEND', 'BORROW', 'PENDING', 'SETTLED'
    let deadStockFilter = 'ALL';   // 'ALL', 'STORAGE', 'DISPOSAL', 'SETTLED'
    let searchQuery = '';
    let selectedPhotos = [];       // [{ id, data, isNew }]
    let editingItemId = null;      // ✏️ 수정 중인 항목 ID (신규 등록 시 null)

    function escapeHTML(str) {
      if (!str) return '';
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    // 🕒 한국 로컬 일시(KST) 안전 포맷팅
    function formatExchangeDate(val, fallbackStr) {
      if (fallbackStr && typeof fallbackStr === 'string' && fallbackStr.length >= 10) {
        return fallbackStr.replace(/-/g, '.');
      }
      if (!val) return '';
      if (typeof val === 'number' || (!isNaN(Number(val)) && String(val).length >= 10 && !String(val).includes('-') && !String(val).includes('.'))) {
        const d = new Date(Number(val));
        if (!isNaN(d.getTime())) {
          const yy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          const hh = String(d.getHours()).padStart(2, '0');
          const mi = String(d.getMinutes()).padStart(2, '0');
          return `${yy}.${mm}.${dd} ${hh}:${mi}`;
        }
      }
      if (typeof val === 'string') {
        if (val.includes('-') || val.includes('.')) {
          return val.replace(/-/g, '.').substring(0, 16);
        }
      }
      return '';
    }

    // 📦 데이터 로드 (sheets-sync 연동)
    function getStorageData() {
      try {
        if (window.SheetsSync && typeof window.SheetsSync.getPharmacyExchange === 'function') {
          return window.SheetsSync.getPharmacyExchange();
        }
        const raw = localStorage.getItem('ssg_pharmacy_exchange_v1');
        return raw ? JSON.parse(raw) : { exchanges: [], deadStocks: [] };
      } catch (e) {
        return { exchanges: [], deadStocks: [] };
      }
    }

    function saveStorageData(data) {
      try {
        if (window.SheetsSync && typeof window.SheetsSync.savePharmacyExchange === 'function') {
          window.SheetsSync.savePharmacyExchange(data);
          return;
        }
        localStorage.setItem('ssg_pharmacy_exchange_v1', JSON.stringify(data));
      } catch (e) {
        console.warn('saveStorageData warning:', e);
      }
    }

    // ==========================================
    // 🎯 최신 등록 글 기준 스마트 서브탭 자동 판별 (마스터 대원칙 제174조)
    // ==========================================
    function getItemTimestamp(item) {
      if (!item) return 0;

      // 1. updatedAt 필드 (숫자 ms 또는 유효한 날짜 문자열)
      if (item.updatedAt) {
        const num = Number(item.updatedAt);
        if (!isNaN(num) && num > 100000000000) return num;
        const parsed = Date.parse(item.updatedAt);
        if (!isNaN(parsed) && parsed > 0) return parsed;
      }

      // 2. createdAt 필드
      if (item.createdAt) {
        const num = Number(item.createdAt);
        if (!isNaN(num) && num > 100000000000) return num;
        const parsed = Date.parse(item.createdAt);
        if (!isNaN(parsed) && parsed > 0) return parsed;
      }

      // 3. 고유 ID에 각인된 밀리초 타임스탬프 (exc_1789... 또는 ds_1789...)
      if (item.id && typeof item.id === 'string') {
        const m = item.id.match(/\d{10,13}/);
        if (m) {
          const num = Number(m[0]);
          if (num > 100000000000) return num;
          if (num > 1000000000) return num * 1000;
        }
      }

      // 4. displayDate 또는 date 문자열 (예: '2026.09.16 17:41' 또는 '2026-09-16 17:41')
      const dateStr = item.displayDate || item.date;
      if (dateStr && typeof dateStr === 'string') {
        const clean = dateStr.trim().replace(/\./g, '/');
        const parsed = Date.parse(clean);
        if (!isNaN(parsed) && parsed > 0) return parsed;
      }

      return 0;
    }

    function getLatestTime(list) {
      if (!Array.isArray(list) || list.length === 0) return 0;
      let max = 0;
      for (let i = 0; i < list.length; i++) {
        const t = getItemTimestamp(list[i]);
        if (t > max) max = t;
      }
      return max;
    }

    function determineDefaultSubTab() {
      const data = getStorageData();
      const exchanges = data.exchanges || [];
      const deadStocks = data.deadStocks || [];

      const latestExchangeTime = getLatestTime(exchanges);
      const latestDeadStockTime = getLatestTime(deadStocks);

      // 불용재고에 등록된 글이 교품보다 최신이거나, 교품이 없고 불용재고만 있는 경우 불용재고 서브탭 우선 활성화
      if (latestDeadStockTime > latestExchangeTime) {
        return 'DEAD_STOCK';
      }
      return 'EXCHANGE';
    }

    function autoSelectLatestSubTab() {
      activeSubTab = determineDefaultSubTab();
    }

    // ==========================================
    // 📸 사진 압축 및 Cloudinary 업로드 파이프라인
    // ==========================================
    async function handlePhotoSelect(inputEl) {
      if (!inputEl || !inputEl.files || inputEl.files.length === 0) return;
      const files = Array.from(inputEl.files);
      if (selectedPhotos.length + files.length > 5) {
        alert('📷 사진은 1건당 최대 5장까지만 첨부할 수 있습니다.');
        inputEl.value = '';
        return;
      }

      for (const file of files) {
        try {
          const compressedBase64 = await compressPhotoFile(file);
          if (compressedBase64) {
            selectedPhotos.push({
              id: 'ex_p_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
              data: compressedBase64,
              isNew: true
            });
          }
        } catch (err) {
          console.warn("Photo compress fail:", err);
        }
      }

      inputEl.value = '';
      renderPhotoPreviews();
    }

    function compressPhotoFile(file) {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const img = new Image();
            img.onload = () => {
              try {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 480;
                let width = img.width || MAX_WIDTH;
                let height = img.height || 360;
                if (width > MAX_WIDTH) {
                  height = Math.round((height * MAX_WIDTH) / width);
                  width = MAX_WIDTH;
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (ctx) ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.4));
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

    function renderPhotoPreviews() {
      const container = document.getElementById('ex-photo-preview-container');
      const grid = document.getElementById('ex-photo-thumbnails-grid');
      const textEl = document.getElementById('ex-photo-count-text');
      if (!container || !grid) return;

      if (selectedPhotos.length === 0) {
        container.style.display = 'none';
        grid.innerHTML = '';
        return;
      }

      container.style.display = 'block';
      if (textEl) textEl.innerText = `📷 첨부된 사진 (${selectedPhotos.length}/5장)`;

      grid.innerHTML = selectedPhotos.map((photo, idx) => `
        <div style="position:relative; flex-shrink:0; width:68px; height:68px; border-radius:10px; overflow:hidden; border:1.5px solid #cbd5e1; background:#ffffff; box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <img src="${photo.data}" alt="사진 ${idx + 1}" style="width:100%; height:100%; object-fit:cover;" />
          <button type="button" onclick="PharmacyExchangeModule.removePhoto(${idx})" style="position:absolute; top:2px; right:2px; background:rgba(220,38,38,0.9); color:#ffffff; border:none; width:20px; height:20px; border-radius:50%; font-size:11px; font-weight:900; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:0 1px 3px rgba(0,0,0,0.3); z-index:2;">✕</button>
          <span style="position:absolute; bottom:2px; left:2px; background:rgba(15,23,42,0.7); color:#fff; font-size:9px; font-weight:800; padding:1px 4px; border-radius:4px;">${idx + 1}</span>
        </div>
      `).join('');
    }

    function removePhoto(idx) {
      if (idx >= 0 && idx < selectedPhotos.length) {
        selectedPhotos.splice(idx, 1);
        renderPhotoPreviews();
      }
    }

    function resetPhoto() {
      selectedPhotos = [];
      const camInput = document.getElementById('ex-photo-camera');
      const galInput = document.getElementById('ex-photo-gallery');
      if (camInput) camInput.value = '';
      if (galInput) galInput.value = '';
      renderPhotoPreviews();
    }

    // ==========================================
    // 🎨 메인 뷰 렌더링
    // ==========================================
    function render(containerId) {
      const container = document.getElementById(containerId || 'module-content');
      if (!container) return;

      // 🌟 마스터 UX: 최초 진입 시 또는 서브탭 미지정 시 가장 최근 등록된 글 기준으로 서브탭 자동 선택 (마스터 대원칙 제174조)
      if (!activeSubTab) {
        activeSubTab = determineDefaultSubTab();
      }

      const data = getStorageData();
      const exchanges = data.exchanges || [];
      const deadStocks = data.deadStocks || [];

      // 통계 지표 계산
      const pendingExchanges = exchanges.filter(e => e.status !== 'SETTLED_RETURN' && e.status !== 'SETTLED_MONEY');
      const totalDeadStockLoss = deadStocks.reduce((sum, item) => sum + (Number(item.totalPrice) || 0), 0);

      const html = `
        <div class="module-header flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm mb-4 sm:mb-5">
          <div class="space-y-1">
            <h2 class="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2 flex-wrap">
              <i class="fas fa-handshake text-indigo-600"></i>
              <span>💊 인근약국 교품 & 불용재고 대장</span>
            </h2>
            <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed break-keep">
              인근 약국간 의약품 대여/차용 실시간 장부 & 처방 중단 고가 불용약 손실 관리
            </p>
          </div>
          <div class="flex items-center gap-2 w-full sm:w-auto">
            <button type="button" class="flex-1 sm:flex-initial btn btn-primary font-bold text-xs px-3.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-md transition flex items-center justify-center gap-1.5 whitespace-nowrap" onclick="PharmacyExchangeModule.openCreateModal()">
              <i class="fas fa-plus-circle"></i>
              <span>${activeSubTab === 'EXCHANGE' ? '+ 새 교품 내역 등록' : '+ 새 불용재고 등록'}</span>
            </button>
          </div>
        </div>

        <!-- 🏷️ 투트랙 서브탭 네비게이션 & 통계 요약 바 -->
        <div class="bg-white dark:bg-slate-900 p-3.5 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm mb-4 sm:mb-5 space-y-3">
          <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div class="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              <button type="button" onclick="PharmacyExchangeModule.setSubTab('EXCHANGE')" class="px-3.5 py-2 rounded-lg text-xs font-black transition flex items-center gap-1.5 ${activeSubTab === 'EXCHANGE' ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'}">
                <i class="fas fa-boxes-packing"></i>
                <span>🤝 인근약국 교품 장부</span>
                <span class="px-1.5 py-0.2 rounded-full text-[10px] font-bold ${pendingExchanges.length > 0 ? 'bg-rose-500 text-white' : 'bg-slate-200 text-slate-700'}">${exchanges.length}</span>
              </button>
              <button type="button" onclick="PharmacyExchangeModule.setSubTab('DEAD_STOCK')" class="px-3.5 py-2 rounded-lg text-xs font-black transition flex items-center gap-1.5 ${activeSubTab === 'DEAD_STOCK' ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'}">
                <i class="fas fa-triangle-exclamation"></i>
                <span>📦 불용재고 관리</span>
                <span class="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700">${deadStocks.length}</span>
              </button>
            </div>

            <!-- 실시간 요약 브리핑 칩 -->
            <div class="flex items-center gap-2 flex-wrap">
              ${activeSubTab === 'EXCHANGE' ? `
                <div class="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800">
                  <span>총 교품: <strong class="text-indigo-600 dark:text-indigo-400 font-black">${exchanges.length}</strong>건</span>
                  <span class="text-slate-300 dark:text-slate-700">|</span>
                  <span class="text-rose-600 dark:text-rose-400">미정산(진행중): <strong class="font-black text-sm">${pendingExchanges.length}</strong>건</span>
                </div>
              ` : `
                <div class="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 bg-amber-50 dark:bg-amber-950/40 px-3 py-1.5 rounded-xl border border-amber-200 dark:border-amber-800/80">
                  <span class="text-amber-800 dark:text-amber-400">총 불용재고: <strong class="font-black">${deadStocks.length}</strong>품목</span>
                  <span class="text-amber-300 dark:text-amber-700">|</span>
                  <span class="text-rose-600 dark:text-rose-400">총 손실 추정액: <strong class="font-black text-sm">₩ ${Math.round(totalDeadStockLoss).toLocaleString()}</strong>원</span>
                </div>
              `}
            </div>
          </div>

          <!-- 🔍 실시간 검색 & 필터 칩 바 -->
          <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
            <div class="relative flex-grow">
              <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
              <input type="text" id="ex-search-input" value="${escapeHTML(searchQuery)}" oninput="PharmacyExchangeModule.handleSearch(this.value)" placeholder="${activeSubTab === 'EXCHANGE' ? '약품명, 상대 약국명(예: 메가스타), 담당자 검색...' : '불용 약품명, 제약사, 처방 병원, 사유 검색...'}" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl pl-8 pr-8 py-2 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-indigo-500">
              <button id="ex-search-clear-btn" onclick="PharmacyExchangeModule.handleSearch('')" style="display:${searchQuery ? 'block' : 'none'};" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs">✖</button>
            </div>
          </div>

          <!-- 상태별 필터 칩 (가로 스크롤) -->
          <div class="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs font-bold whitespace-nowrap pt-1">
            ${renderFilterChips(exchanges, deadStocks)}
          </div>
        </div>

        <!-- 📦 콘텐츠 카드 리스트 컨테이너 -->
        <div id="ex-card-grid-container">
          ${renderContentGridHTML()}
        </div>

        <!-- 📝 등록/수정 모달창 -->
        ${renderModalHTML()}
      `;

      container.innerHTML = html;
    }

    function renderFilterChips(exchanges, deadStocks) {
      if (activeSubTab === 'EXCHANGE') {
        const lendCount = exchanges.filter(e => e.type === 'LEND').length;
        const borrowCount = exchanges.filter(e => e.type === 'BORROW').length;
        const pendingCount = exchanges.filter(e => e.status !== 'SETTLED_RETURN' && e.status !== 'SETTLED_MONEY').length;
        const settledCount = exchanges.filter(e => e.status === 'SETTLED_RETURN' || e.status === 'SETTLED_MONEY').length;

        const chips = [
          { id: 'ALL', label: `전체 (${exchanges.length})` },
          { id: 'PENDING', label: `⏳ 미정산/진행중 (${pendingCount})`, color: '#ef4444' },
          { id: 'LEND', label: `🔺 빌려줌 (${lendCount})`, color: '#2563eb' },
          { id: 'BORROW', label: `🔻 빌려옴 (${borrowCount})`, color: '#059669' },
          { id: 'SETTLED', label: `✅ 정산완료 (${settledCount})`, color: '#64748b' }
        ];

        return chips.map(c => {
          const isSel = exchangeFilter === c.id;
          return `
            <button type="button" onclick="PharmacyExchangeModule.setFilter('${c.id}')" class="px-3 py-1.5 rounded-full text-xs font-black transition ${isSel ? 'bg-indigo-600 text-white shadow' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'}">
              ${c.label}
            </button>
          `;
        }).join('');
      } else {
        const storageCount = deadStocks.filter(d => d.status === 'STORAGE' || !d.status).length;
        const disposalCount = deadStocks.filter(d => d.status === 'DISPOSAL').length;
        const settledCount = deadStocks.filter(d => d.status === 'SETTLED').length;

        const chips = [
          { id: 'ALL', label: `전체 (${deadStocks.length})` },
          { id: 'STORAGE', label: `📦 보관중 (${storageCount})`, color: '#d97706' },
          { id: 'DISPOSAL', label: `⚠️ 폐기예정 (${disposalCount})`, color: '#ef4444' },
          { id: 'SETTLED', label: `✅ 정산완료 (${settledCount})`, color: '#64748b' }
        ];

        return chips.map(c => {
          const isSel = deadStockFilter === c.id;
          return `
            <button type="button" onclick="PharmacyExchangeModule.setFilter('${c.id}')" class="px-3 py-1.5 rounded-full text-xs font-black transition ${isSel ? 'bg-indigo-600 text-white shadow' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'}">
              ${c.label}
            </button>
          `;
        }).join('');
      }
    }

    function renderContentGridHTML() {
      const data = getStorageData();
      if (activeSubTab === 'EXCHANGE') {
        return renderExchangeListHTML(data.exchanges || []);
      } else {
        return renderDeadStockListHTML(data.deadStocks || []);
      }
    }

    // ==========================================
    // 🤝 1. 교품 장부 카드 리스트 렌더링
    // ==========================================
    function renderExchangeListHTML(exchanges) {
      let filtered = [...exchanges];

      // 필터 적용
      if (exchangeFilter === 'LEND') filtered = filtered.filter(e => e.type === 'LEND');
      else if (exchangeFilter === 'BORROW') filtered = filtered.filter(e => e.type === 'BORROW');
      else if (exchangeFilter === 'PENDING') filtered = filtered.filter(e => e.status !== 'SETTLED_RETURN' && e.status !== 'SETTLED_MONEY');
      else if (exchangeFilter === 'SETTLED') filtered = filtered.filter(e => e.status === 'SETTLED_RETURN' || e.status === 'SETTLED_MONEY');

      // 검색어 적용
      if (searchQuery.trim()) {
        const kw = searchQuery.trim().toLowerCase().replace(/\s+/g, '');
        filtered = filtered.filter(e => {
          const text = [e.drugName, e.partnerPharmacy, e.notes, e.updatedBy].join(' ').toLowerCase().replace(/\s+/g, '');
          return text.includes(kw);
        });
      }

      // 최신순 내림차순 정렬 (마스터 대원칙 제1조, 제122조)
      filtered.sort((a, b) => (Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0)));

      if (filtered.length === 0) {
        return `
          <div class="bg-white dark:bg-slate-900 rounded-2xl p-8 sm:p-12 text-center border border-slate-200 dark:border-slate-800 space-y-3">
            <div class="text-4xl">🤝</div>
            <h4 class="text-base font-bold text-slate-700 dark:text-slate-300">${exchanges.length === 0 ? '등록된 인근약국 교품 내역이 없습니다.' : '검색/필터 조건과 일치하는 교품 내역이 없습니다.'}</h4>
            <p class="text-xs text-slate-400 max-w-sm mx-auto">상단의 <strong>[+ 새 교품 내역 등록]</strong> 버튼을 눌러 인근 약국과 주고받은 약품을 기록하세요.</p>
          </div>
        `;
      }

      const currUser = (window.SheetsSync && window.SheetsSync.getCurrentUser && window.SheetsSync.getCurrentUser()) || {};
      const isDirector = currUser.role === '약국장' || currUser.id === 'emp_1';

      return `
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
          ${filtered.map(item => {
            const isLend = item.type === 'LEND'; // true: 빌려줌, false: 빌려옴
            const isSettled = item.status === 'SETTLED_RETURN' || item.status === 'SETTLED_MONEY';
            const allPhotos = (item.photos && Array.isArray(item.photos) && item.photos.length > 0)
              ? item.photos
              : (item.photoUrl ? [item.photoUrl] : []);
            const mainPhoto = allPhotos[0] || '';

            return `
              <div class="bg-white dark:bg-slate-900 border ${isSettled ? 'border-slate-200 dark:border-slate-800 opacity-80' : (isLend ? 'border-blue-200 dark:border-blue-900' : 'border-emerald-200 dark:border-emerald-900')} rounded-2xl overflow-hidden flex flex-col justify-between shadow-sm hover:shadow-md transition relative">
                <div>
                  ${mainPhoto ? `
                    <div class="relative w-full h-36 bg-slate-100 dark:bg-slate-950 overflow-hidden border-b border-slate-100 dark:border-slate-800 cursor-pointer" onclick="PharmacyExchangeModule.openPhoto('${item.id}', 0)">
                      <img src="${mainPhoto}" alt="${escapeHTML(item.drugName)}" class="w-full h-full object-cover" />
                      <span class="absolute top-2.5 left-2.5 text-[11px] font-black px-2.5 py-0.5 rounded-full shadow-sm ${isLend ? 'bg-blue-600 text-white' : 'bg-emerald-600 text-white'}">
                        ${isLend ? '🔺 빌려줌 (대여)' : '🔻 빌려옴 (차용)'}
                      </span>
                      ${allPhotos.length > 1 ? `
                        <span class="absolute top-2.5 right-2.5 text-[11px] font-black px-2 py-0.5 rounded-full shadow-md bg-black/75 text-white">
                          📷 ${allPhotos.length}장
                        </span>
                      ` : ''}
                    </div>
                  ` : ''}

                  <div class="p-4 space-y-3">
                    <div class="flex items-center justify-between gap-2">
                      <div class="flex items-center gap-1.5 flex-wrap">
                        ${!mainPhoto ? `
                          <span class="text-[11px] font-black px-2.5 py-0.5 rounded-full ${isLend ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'}">
                            ${isLend ? '🔺 빌려줌' : '🔻 빌려옴'}
                          </span>
                        ` : ''}
                        <span class="text-xs font-black text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                          🏥 ${escapeHTML(item.partnerPharmacy)}
                        </span>
                      </div>
                      <span class="text-[11px] font-black px-2.5 py-0.5 rounded-full ${isSettled ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' : 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 animate-pulse'}">
                        ${item.status === 'SETTLED_RETURN' ? '✅ 반환완료' : (item.status === 'SETTLED_MONEY' ? '💰 정산완료' : '⏳ 미정산')}
                      </span>
                    </div>

                    <div>
                      <h3 class="text-base font-extrabold text-slate-900 dark:text-white leading-tight break-all">
                        ${escapeHTML(item.drugName)}
                      </h3>
                      <div class="text-xs font-bold text-slate-500 dark:text-slate-400 mt-1">
                        수량: <strong class="text-sm font-black ${isLend ? 'text-blue-600' : 'text-emerald-600'}">${escapeHTML(item.quantity)}</strong> ${escapeHTML(item.unit || '정')}
                      </div>
                    </div>

                    ${item.notes ? `
                      <div class="text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-950 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 font-medium leading-snug">
                        💡 ${escapeHTML(item.notes)}
                      </div>
                    ` : ''}
                  </div>
                </div>

                <!-- 하단 상태 토글 & 액션 바 -->
                <div class="p-3 bg-slate-50 dark:bg-slate-950 border-t border-slate-100 dark:border-slate-800 text-xs flex flex-col gap-2">
                  <div class="flex items-center justify-between text-[11px] text-slate-400">
                    <span>🕒 <b>${escapeHTML(item.updatedBy || '약국')}</b> · ${escapeHTML(formatExchangeDate(item.updatedAt, item.displayDate))}</span>
                    <div class="flex items-center gap-1">
                      <button type="button" onclick="PharmacyExchangeModule.openEditModal('EXCHANGE', '${item.id}')" class="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 font-bold p-1 flex items-center gap-0.5" title="수정">
                        <i class="fas fa-edit"></i> <span style="font-size:11px;">수정</span>
                      </button>
                      ${isDirector ? `
                        <button type="button" onclick="PharmacyExchangeModule.deleteItem('EXCHANGE', '${item.id}', '${escapeHTML(item.drugName).replace(/'/g, "\\'")}')" class="text-rose-500 hover:text-rose-700 font-bold p-1" title="삭제">
                          <i class="fas fa-trash-alt"></i>
                        </button>
                      ` : ''}
                    </div>
                  </div>

                  <!-- 원터치 상태 변경 토글 버튼 -->
                  <div class="grid grid-cols-2 gap-1.5 pt-1 border-t border-slate-200 dark:border-slate-800">
                    <button type="button" onclick="PharmacyExchangeModule.toggleExchangeStatus('${item.id}', 'SETTLED_RETURN')" class="px-2 py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 ${item.status === 'SETTLED_RETURN' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100'}">
                      <i class="fas fa-rotate-left text-xs"></i> 📦 반환 완료
                    </button>
                    <button type="button" onclick="PharmacyExchangeModule.toggleExchangeStatus('${item.id}', 'SETTLED_MONEY')" class="px-2 py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 ${item.status === 'SETTLED_MONEY' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100'}">
                      <i class="fas fa-coins text-xs"></i> 💰 현금/정산
                    </button>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    // ==========================================
    // 📦 2. 불용재고 카드 리스트 렌더링
    // ==========================================
    function renderDeadStockListHTML(deadStocks) {
      let filtered = [...deadStocks];

      // 필터 적용
      if (deadStockFilter === 'STORAGE') filtered = filtered.filter(d => d.status === 'STORAGE' || !d.status);
      else if (deadStockFilter === 'DISPOSAL') filtered = filtered.filter(d => d.status === 'DISPOSAL');
      else if (deadStockFilter === 'SETTLED') filtered = filtered.filter(d => d.status === 'SETTLED');

      // 검색어 적용
      if (searchQuery.trim()) {
        const kw = searchQuery.trim().toLowerCase().replace(/\s+/g, '');
        filtered = filtered.filter(d => {
          const text = [d.drugName, d.manufacturer, d.hospital, d.reason, d.locationDetail, d.updatedBy].join(' ').toLowerCase().replace(/\s+/g, '');
          return text.includes(kw);
        });
      }

      // 최신순 정렬
      filtered.sort((a, b) => (Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0)));

      if (filtered.length === 0) {
        return `
          <div class="bg-white dark:bg-slate-900 rounded-2xl p-8 sm:p-12 text-center border border-slate-200 dark:border-slate-800 space-y-3">
            <div class="text-4xl">📦</div>
            <h4 class="text-base font-bold text-slate-700 dark:text-slate-300">${deadStocks.length === 0 ? '등록된 불용재고 데이터가 없습니다.' : '검색/필터 조건과 일치하는 불용재고가 없습니다.'}</h4>
            <p class="text-xs text-slate-400 max-w-sm mx-auto">처방이 중단된 고가약 낱알/포장 재고를 등록하여 유효기간 만료 손실을 예방하세요.</p>
          </div>
        `;
      }

      const currUser = (window.SheetsSync && window.SheetsSync.getCurrentUser && window.SheetsSync.getCurrentUser()) || {};
      const isDirector = currUser.role === '약국장' || currUser.id === 'emp_1';

      return `
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
          ${filtered.map(item => {
            const allPhotos = (item.photos && Array.isArray(item.photos) && item.photos.length > 0)
              ? item.photos
              : (item.photoUrl ? [item.photoUrl] : []);
            const mainPhoto = allPhotos[0] || '';
            const status = item.status || 'STORAGE';

            return `
              <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden flex flex-col justify-between shadow-sm hover:shadow-md transition relative">
                <div>
                  ${mainPhoto ? `
                    <div class="relative w-full h-36 bg-slate-100 dark:bg-slate-950 overflow-hidden border-b border-slate-100 dark:border-slate-800 cursor-pointer" onclick="PharmacyExchangeModule.openPhoto('${item.id}', 0)">
                      <img src="${mainPhoto}" alt="${escapeHTML(item.drugName)}" class="w-full h-full object-cover" />
                      <span class="absolute top-2.5 left-2.5 text-[11px] font-black px-2.5 py-0.5 rounded-full shadow-sm ${status === 'STORAGE' ? 'bg-amber-600 text-white' : (status === 'DISPOSAL' ? 'bg-rose-600 text-white' : 'bg-slate-600 text-white')}">
                        ${status === 'STORAGE' ? '📦 보관중' : (status === 'DISPOSAL' ? '⚠️ 폐기예정' : '✅ 정산완료')}
                      </span>
                    </div>
                  ` : ''}

                  <div class="p-4 space-y-3">
                    <div class="flex items-center justify-between gap-2">
                      <span class="text-xs font-black text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                        🏢 ${escapeHTML(item.manufacturer || '제약사 미기재')}
                      </span>
                      <span class="text-[11px] font-black px-2 py-0.5 rounded-full ${status === 'STORAGE' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' : (status === 'DISPOSAL' ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300')}">
                        ${status === 'STORAGE' ? '📦 보관중' : (status === 'DISPOSAL' ? '⚠️ 폐기예정' : '✅ 정산완료')}
                      </span>
                    </div>

                    <div>
                      <h3 class="text-base font-extrabold text-slate-900 dark:text-white leading-tight break-all">
                        ${escapeHTML(item.drugName)}
                      </h3>
                      <div class="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400 mt-1.5">
                        <span>수량: <strong class="text-sm font-black text-indigo-600">${escapeHTML(item.quantity)}</strong> ${escapeHTML(item.unit || '정')}</span>
                        <span>유효기간: <strong class="text-rose-600 dark:text-rose-400">${escapeHTML(item.expiryDate || '미입력')}</strong></span>
                      </div>
                    </div>

                    <!-- 금액 계산 박스 -->
                    <div class="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-xl p-2.5 flex items-center justify-between text-xs">
                      <span class="font-bold text-amber-800 dark:text-amber-300">💰 추정 손실액</span>
                      <span class="text-sm font-black text-amber-900 dark:text-amber-200">₩ ${Math.round(Number(item.totalPrice) || 0).toLocaleString()}원</span>
                    </div>

                    <div class="space-y-1 text-xs text-slate-600 dark:text-slate-400">
                      ${item.hospital ? `<div class="font-medium">🏥 처방 의원: <b>${escapeHTML(item.hospital)}</b></div>` : ''}
                      ${item.locationDetail ? `<div class="font-medium">📍 보관 위치: <b>${escapeHTML(item.locationDetail)}</b></div>` : ''}
                      ${item.reason ? `<div class="font-medium text-slate-500">사유: ${escapeHTML(item.reason)}</div>` : ''}
                    </div>
                  </div>
                </div>

                <!-- 하단 상태 토글 & 삭제 바 -->
                <div class="p-3 bg-slate-50 dark:bg-slate-950 border-t border-slate-100 dark:border-slate-800 text-xs flex flex-col gap-2">
                  <div class="flex items-center justify-between text-[11px] text-slate-400">
                    <span>🕒 <b>${escapeHTML(item.updatedBy || '약국')}</b> · ${escapeHTML(formatExchangeDate(item.updatedAt, item.displayDate))}</span>
                    <div class="flex items-center gap-1">
                      <button type="button" onclick="PharmacyExchangeModule.openEditModal('DEAD_STOCK', '${item.id}')" class="text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 font-bold p-1 flex items-center gap-0.5" title="수정">
                        <i class="fas fa-edit"></i> <span style="font-size:11px;">수정</span>
                      </button>
                      ${isDirector ? `
                        <button type="button" onclick="PharmacyExchangeModule.deleteItem('DEAD_STOCK', '${item.id}', '${escapeHTML(item.drugName).replace(/'/g, "\\'")}')" class="text-rose-500 hover:text-rose-700 font-bold p-1" title="삭제">
                          <i class="fas fa-trash-alt"></i>
                        </button>
                      ` : ''}
                    </div>
                  </div>

                  <div class="grid grid-cols-3 gap-1 pt-1 border-t border-slate-200 dark:border-slate-800">
                    <button type="button" onclick="PharmacyExchangeModule.toggleDeadStockStatus('${item.id}', 'STORAGE')" class="px-1.5 py-1 rounded text-[11px] font-bold ${status === 'STORAGE' ? 'bg-amber-600 text-white' : 'bg-white dark:bg-slate-800 border border-slate-200 text-slate-600'}">보관중</button>
                    <button type="button" onclick="PharmacyExchangeModule.toggleDeadStockStatus('${item.id}', 'DISPOSAL')" class="px-1.5 py-1 rounded text-[11px] font-bold ${status === 'DISPOSAL' ? 'bg-rose-600 text-white' : 'bg-white dark:bg-slate-800 border border-slate-200 text-slate-600'}">폐기예정</button>
                    <button type="button" onclick="PharmacyExchangeModule.toggleDeadStockStatus('${item.id}', 'SETTLED')" class="px-1.5 py-1 rounded text-[11px] font-bold ${status === 'SETTLED' ? 'bg-slate-600 text-white' : 'bg-white dark:bg-slate-800 border border-slate-200 text-slate-600'}">정산완료</button>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    // ==========================================
    // 📝 모달 HTML 생성 (교품 / 불용재고)
    // ==========================================
    function renderModalHTML() {
      return `
        <div id="ex-modal-overlay" class="modal-overlay" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(15,23,42,0.8); backdrop-filter:blur(5px); z-index:99999; justify-content:center; align-items:center; padding:16px;">
          <div class="modal-card shadow-2xl" style="background:#ffffff; border-radius:24px; max-width:560px; width:100%; max-height:90vh; overflow-y:auto; padding:28px; position:relative; box-sizing:border-box;">
            <div style="display:flex; align-items:center; justify-content:space-between; border-bottom:1.5px solid #f1f5f9; padding-bottom:14px; margin-bottom:20px;">
              <div style="display:flex; align-items:center; gap:10px;">
                <div id="ex-modal-icon" style="width:40px; height:40px; border-radius:12px; background:#e0e7ff; color:#4338ca; display:flex; align-items:center; justify-content:center; font-size:20px; border:1px solid #c7d2fe;">
                  <i class="fas fa-handshake"></i>
                </div>
                <div>
                  <h3 id="ex-modal-title" style="font-size:18px; font-weight:800; color:#0f172a; margin:0;">
                    ${activeSubTab === 'EXCHANGE' ? '인근약국 교품 내역 등록' : '처방 중단 불용재고 등록'}
                  </h3>
                  <p id="ex-modal-desc" style="font-size:12px; color:#64748b; margin:2px 0 0 0;">
                    ${activeSubTab === 'EXCHANGE' ? '약품 대여/차용 내역을 실시간 장부에 기록합니다.' : '처방 중단 고가약 손실을 방지하기 위해 재고를 기재합니다.'}
                  </p>
                </div>
              </div>
              <button type="button" onclick="PharmacyExchangeModule.closeModal()" style="background:#f1f5f9; border:none; width:32px; height:32px; border-radius:50%; font-size:16px; color:#64748b; cursor:pointer;">&times;</button>
            </div>

            <form onsubmit="PharmacyExchangeModule.handleSubmit(event)" style="display:flex; flex-direction:column; gap:14px;">
              <div id="ex-modal-fields-container">
                ${activeSubTab === 'EXCHANGE' ? renderExchangeFormFields() : renderDeadStockFormFields()}
              </div>

              <!-- 📸 사진 첨부 공통 UI -->
              <div>
                <label style="display:block; font-size:13px; font-weight:800; color:#334155; margin-bottom:6px;">
                  사진 첨부 <span style="font-weight:normal; color:#64748b; font-size:12px;">(선택 - Cloudinary 25GB 호스팅)</span>
                </label>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; width:100%;">
                  <label for="ex-photo-camera" style="display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; border-radius:14px; border:2px dashed #4f46e5; padding:12px 10px; background:#eef2ff; color:#4f46e5; font-size:12px; font-weight:800; cursor:pointer; text-align:center;">
                    <i class="fas fa-camera" style="font-size:20px;"></i>
                    <span>📸 바로 카메라 촬영</span>
                  </label>
                  <input type="file" id="ex-photo-camera" accept="image/*" capture="environment" style="display:none;" onchange="PharmacyExchangeModule.handlePhotoSelect(this)">

                  <label for="ex-photo-gallery" style="display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; border-radius:14px; border:2px dashed #94a3b8; padding:12px 10px; background:#f8fafc; color:#475569; font-size:12px; font-weight:800; cursor:pointer; text-align:center;">
                    <i class="fas fa-images" style="font-size:20px;"></i>
                    <span>📁 앨범/사진 선택</span>
                  </label>
                  <input type="file" id="ex-photo-gallery" accept="image/*" multiple style="display:none;" onchange="PharmacyExchangeModule.handlePhotoSelect(this)">
                </div>

                <div id="ex-photo-preview-container" style="display:none; margin-top:10px; background:#f8fafc; padding:10px; border-radius:12px; border:1px solid #cbd5e1;">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <span id="ex-photo-count-text" style="font-size:11.5px; font-weight:800; color:#4f46e5;">📷 첨부된 사진 (0/5장)</span>
                    <button type="button" onclick="PharmacyExchangeModule.resetPhoto()" style="background:#fee2e2; border:1px solid #fca5a5; color:#dc2626; font-size:10px; font-weight:800; padding:2px 6px; border-radius:5px; cursor:pointer;">전체 취소 ✖</button>
                  </div>
                  <div id="ex-photo-thumbnails-grid" style="display:flex; gap:8px; overflow-x:auto; padding-bottom:4px;" class="no-scrollbar"></div>
                </div>
              </div>

              <!-- 하단 버튼 바 -->
              <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:10px;">
                <button type="button" class="btn btn-secondary" onclick="PharmacyExchangeModule.closeModal()" style="border-radius:10px; padding:10px 18px; font-weight:700;">취소</button>
                <button type="submit" id="ex-submit-btn" class="btn btn-primary" style="background:#4f46e5; border-color:#4f46e5; border-radius:10px; padding:10px 24px; font-weight:800; color:#fff;">
                  <i class="fas fa-save me-1"></i> 저장하기
                </button>
              </div>
            </form>
          </div>
        </div>
      `;
    }

    function renderExchangeFormFields() {
      return `
        <div>
          <label style="display:block; font-size:13px; font-weight:800; color:#334155; margin-bottom:6px;">거래 구분 <span style="color:#ef4444;">*</span></label>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
            <label style="display:flex; align-items:center; justify-content:center; gap:6px; padding:10px; border-radius:10px; border:2px solid #3b82f6; background:#eff6ff; color:#1d4ed8; font-weight:800; font-size:13px; cursor:pointer;">
              <input type="radio" name="ex-type" value="LEND" checked style="accent-color:#2563eb;">
              <span>🔺 빌려줌 (대여)</span>
            </label>
            <label style="display:flex; align-items:center; justify-content:center; gap:6px; padding:10px; border-radius:10px; border:2px solid #10b981; background:#f0fdf4; color:#047857; font-weight:800; font-size:13px; cursor:pointer;">
              <input type="radio" name="ex-type" value="BORROW" style="accent-color:#059669;">
              <span>🔻 빌려옴 (차용)</span>
            </label>
          </div>
        </div>

        <div>
          <label style="display:block; font-size:13px; font-weight:800; color:#334155; margin-bottom:5px;">상대 약국명 <span style="color:#ef4444;">*</span></label>
          <div style="display:flex; gap:6px; margin-bottom:6px; overflow-x:auto;" class="no-scrollbar">
            <button type="button" onclick="document.getElementById('ex-partner').value='365메가스타약국'" class="px-2 py-1 rounded bg-slate-100 text-[11px] font-bold text-slate-700 hover:bg-slate-200">365메가스타약국</button>
            <button type="button" onclick="document.getElementById('ex-partner').value='별내스타약국'" class="px-2 py-1 rounded bg-slate-100 text-[11px] font-bold text-slate-700 hover:bg-slate-200">별내스타약국</button>
            <button type="button" onclick="document.getElementById('ex-partner').value='신세계온누리약국'" class="px-2 py-1 rounded bg-slate-100 text-[11px] font-bold text-slate-700 hover:bg-slate-200">신세계온누리약국</button>
          </div>
          <input type="text" id="ex-partner" required placeholder="예: 365메가스타약국, 별내스타약국 등" style="width:100%; border:1.5px solid #cbd5e1; border-radius:10px; padding:10px 14px; font-size:13.5px; font-weight:700; box-sizing:border-box;">
        </div>

        <div>
          <label style="display:block; font-size:13px; font-weight:800; color:#334155; margin-bottom:5px;">약품명 및 규격 <span style="color:#ef4444;">*</span></label>
          <input type="text" id="ex-drug-name" required placeholder="예: 세비카정 5/20mg, 타이레놀 500mg" style="width:100%; border:1.5px solid #cbd5e1; border-radius:10px; padding:10px 14px; font-size:14px; font-weight:700; box-sizing:border-box;">
        </div>

        <div style="display:grid; grid-template-columns:2fr 1fr; gap:10px;">
          <div>
            <label style="display:block; font-size:13px; font-weight:800; color:#334155; margin-bottom:5px;">수량 <span style="color:#ef4444;">*</span></label>
            <input type="text" id="ex-quantity" required placeholder="예: 30, 100, 1" style="width:100%; border:1.5px solid #cbd5e1; border-radius:10px; padding:10px 14px; font-size:14px; font-weight:700; box-sizing:border-box;">
          </div>
          <div>
            <label style="display:block; font-size:13px; font-weight:800; color:#334155; margin-bottom:5px;">단위</label>
            <select id="ex-unit" style="width:100%; border:1.5px solid #cbd5e1; border-radius:10px; padding:10px 8px; font-size:13.5px; font-weight:700; background:#ffffff; box-sizing:border-box;">
              <option value="정" selected>정 (T)</option>
              <option value="통/병">통/병 (Btl)</option>
              <option value="PTP">PTP/포</option>
              <option value="박스">박스 (Box)</option>
            </select>
          </div>
        </div>

        <div>
          <label style="display:block; font-size:13px; font-weight:700; color:#334155; margin-bottom:4px;">참고 메모 (선택)</label>
          <input type="text" id="ex-notes" placeholder="예: 박스 개봉품 30정 빌려줌, 3일내 반환 예정" style="width:100%; border:1.5px solid #cbd5e1; border-radius:10px; padding:10px 14px; font-size:13px; box-sizing:border-box;">
        </div>
      `;
    }

    function renderDeadStockFormFields() {
      return `
        <div>
          <label style="display:block; font-size:13px; font-weight:800; color:#334155; margin-bottom:5px;">불용 약품명 및 규격 <span style="color:#ef4444;">*</span></label>
          <input type="text" id="ds-drug-name" required placeholder="예: 넥시움정 40mg, 리피토정 20mg" style="width:100%; border:1.5px solid #cbd5e1; border-radius:10px; padding:10px 14px; font-size:14px; font-weight:700; box-sizing:border-box;">
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <div>
            <label style="display:block; font-size:13px; font-weight:800; color:#334155; margin-bottom:5px;">제약사/도매상</label>
            <input type="text" id="ds-manufacturer" placeholder="예: 화이자, 아스트라, 백제약품" style="width:100%; border:1.5px solid #cbd5e1; border-radius:10px; padding:10px 12px; font-size:13px; font-weight:700; box-sizing:border-box;">
          </div>
          <div>
            <label style="display:block; font-size:13px; font-weight:800; color:#334155; margin-bottom:5px;">유효기간 <span style="color:#ef4444;">*</span></label>
            <input type="text" id="ds-expiry" required placeholder="예: 2026-12" style="width:100%; border:1.5px solid #cbd5e1; border-radius:10px; padding:10px 12px; font-size:13px; font-weight:700; box-sizing:border-box;">
          </div>
        </div>

        <div style="display:grid; grid-template-columns:2fr 1fr 2fr; gap:8px;">
          <div>
            <label style="display:block; font-size:13px; font-weight:800; color:#334155; margin-bottom:5px;">잔여 수량 <span style="color:#ef4444;">*</span></label>
            <input type="number" id="ds-quantity" required placeholder="예: 28" oninput="PharmacyExchangeModule.calcTotalPrice()" style="width:100%; border:1.5px solid #cbd5e1; border-radius:10px; padding:10px 10px; font-size:13.5px; font-weight:700; box-sizing:border-box;">
          </div>
          <div>
            <label style="display:block; font-size:13px; font-weight:800; color:#334155; margin-bottom:5px;">단위</label>
            <select id="ds-unit" style="width:100%; border:1.5px solid #cbd5e1; border-radius:10px; padding:10px 6px; font-size:13px; font-weight:700; background:#ffffff; box-sizing:border-box;">
              <option value="정" selected>정</option>
              <option value="캡슐">캡슐</option>
              <option value="통/병">통/병</option>
              <option value="PTP">PTP</option>
              <option value="박스">박스</option>
            </select>
          </div>
          <div>
            <label style="display:block; font-size:13px; font-weight:800; color:#334155; margin-bottom:5px;">단가 (원)</label>
            <input type="number" id="ds-price" placeholder="예: 1250" oninput="PharmacyExchangeModule.calcTotalPrice()" style="width:100%; border:1.5px solid #cbd5e1; border-radius:10px; padding:10px 10px; font-size:13.5px; font-weight:700; box-sizing:border-box;">
          </div>
        </div>

        <div style="background:#fef3c7; border:1px solid #fde68a; border-radius:10px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:12px; font-weight:800; color:#92400e;">총 예상 손실 금액</span>
          <span id="ds-total-price-text" style="font-size:15px; font-weight:900; color:#b45309;">₩ 0원</span>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <div>
            <label style="display:block; font-size:13px; font-weight:700; color:#334155; margin-bottom:4px;">처방 의원</label>
            <input type="text" id="ds-hospital" placeholder="예: 3층 내과의원" style="width:100%; border:1.5px solid #cbd5e1; border-radius:10px; padding:9px 12px; font-size:13px; box-sizing:border-box;">
          </div>
          <div>
            <label style="display:block; font-size:13px; font-weight:700; color:#334155; margin-bottom:4px;">보관 위치</label>
            <input type="text" id="ds-location" placeholder="예: 조제실 불용약 바구니 2번" style="width:100%; border:1.5px solid #cbd5e1; border-radius:10px; padding:9px 12px; font-size:13px; box-sizing:border-box;">
          </div>
        </div>

        <div>
          <label style="display:block; font-size:13px; font-weight:700; color:#334155; margin-bottom:4px;">발생 사유/메모</label>
          <input type="text" id="ds-reason" placeholder="예: 환자 전원 및 처방 코드 삭제로 방치" style="width:100%; border:1.5px solid #cbd5e1; border-radius:10px; padding:9px 12px; font-size:13px; box-sizing:border-box;">
        </div>
      `;
    }

    function calcTotalPrice() {
      const q = Number(document.getElementById('ds-quantity')?.value) || 0;
      const p = Number(document.getElementById('ds-price')?.value) || 0;
      const total = Math.round(q * p);
      const textEl = document.getElementById('ds-total-price-text');
      if (textEl) textEl.innerText = `₩ ${total.toLocaleString()}원`;
    }

    // ==========================================
    // 💾 데이터 저장 처리
    // ==========================================
    async function handleSubmit(e) {
      if (e) e.preventDefault();

      const liveBtn = document.getElementById('ex-submit-btn');
      if (liveBtn) {
        liveBtn.disabled = true;
        liveBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> 저장 및 업로드 중...';
      }

      try {
        const currUser = (window.SheetsSync && window.SheetsSync.getCurrentUser && window.SheetsSync.getCurrentUser()) || { name: '약국' };
        let uploadedUrls = [];

        // 사진 Cloudinary 비동기 병렬 업로드 (마스터 대원칙 제120조, 제133조)
        if (selectedPhotos.length > 0) {
          uploadedUrls = await Promise.all(selectedPhotos.map(async (p) => {
            if (!p.isNew && p.data && p.data.startsWith('http')) return p.data;
            if (window.App && typeof window.App.uploadPhotoToCloudinary === 'function') {
              try {
                const cUrl = await window.App.uploadPhotoToCloudinary(p.data);
                if (cUrl) return cUrl;
              } catch (ue) {}
            }
            return p.data;
          }));
        }
        uploadedUrls = uploadedUrls.filter(Boolean);

        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const date = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const nowStr = `${year}.${month}.${date} ${hours}:${minutes}`;
        const nowMs = Date.now();

        const data = getStorageData();

        if (editingItemId) {
          // ✏️ 기존 항목 수정
          if (activeSubTab === 'EXCHANGE') {
            const target = (data.exchanges || []).find(e => String(e.id) === String(editingItemId));
            if (target) {
              const typeRadio = document.querySelector('input[name="ex-type"]:checked');
              target.type = typeRadio ? typeRadio.value : (target.type || 'LEND');
              target.partnerPharmacy = (document.getElementById('ex-partner')?.value || '').trim();
              target.drugName = (document.getElementById('ex-drug-name')?.value || '').trim();
              target.quantity = (document.getElementById('ex-quantity')?.value || '').trim();
              target.unit = document.getElementById('ex-unit')?.value || target.unit || '정';
              target.notes = (document.getElementById('ex-notes')?.value || '').trim();
              target.photos = uploadedUrls;
              target.photoUrl = uploadedUrls[0] || '';
              target.updatedBy = currUser.name;
              target.updatedAt = nowMs;
            }
          } else {
            const target = (data.deadStocks || []).find(d => String(d.id) === String(editingItemId));
            if (target) {
              const drugName = (document.getElementById('ds-drug-name')?.value || '').trim();
              const manufacturer = (document.getElementById('ds-manufacturer')?.value || '').trim();
              const expiryDate = (document.getElementById('ds-expiry')?.value || '').trim();
              const quantity = Number(document.getElementById('ds-quantity')?.value) || 0;
              const unit = document.getElementById('ds-unit')?.value || target.unit || '정';
              const price = Number(document.getElementById('ds-price')?.value) || 0;
              const totalPrice = Math.round(quantity * price);
              const hospital = (document.getElementById('ds-hospital')?.value || '').trim();
              const locationDetail = (document.getElementById('ds-location')?.value || '').trim();
              const reason = (document.getElementById('ds-reason')?.value || '').trim();

              target.drugName = drugName;
              target.manufacturer = manufacturer;
              target.expiryDate = expiryDate;
              target.quantity = quantity;
              target.unit = unit;
              target.price = price;
              target.totalPrice = totalPrice;
              target.hospital = hospital;
              target.locationDetail = locationDetail;
              target.reason = reason;
              target.photos = uploadedUrls;
              target.photoUrl = uploadedUrls[0] || '';
              target.updatedBy = currUser.name;
              target.updatedAt = nowMs;
            }
          }

          editingItemId = null;
          saveStorageData(data);
          closeModal();
          resetPhoto();
          alert('✅ 성공적으로 수정되었습니다!');
          render('module-content');
        } else {
          // ➕ 신규 항목 추가
          if (activeSubTab === 'EXCHANGE') {
            // 교품 저장
            const typeRadio = document.querySelector('input[name="ex-type"]:checked');
            const type = typeRadio ? typeRadio.value : 'LEND';
            const partnerPharmacy = (document.getElementById('ex-partner')?.value || '').trim();
            const drugName = (document.getElementById('ex-drug-name')?.value || '').trim();
            const quantity = (document.getElementById('ex-quantity')?.value || '').trim();
            const unit = document.getElementById('ex-unit')?.value || '정';
            const notes = (document.getElementById('ex-notes')?.value || '').trim();

            const newItem = {
              id: 'exc_' + nowMs,
              type,
              partnerPharmacy,
              drugName,
              quantity,
              unit,
              notes,
              photos: uploadedUrls,
              photoUrl: uploadedUrls[0] || '',
              status: 'PENDING', // PENDING, SETTLED_RETURN, SETTLED_MONEY
              updatedBy: currUser.name,
              updatedAt: nowMs,
              displayDate: nowStr
            };

            if (!data.exchanges) data.exchanges = [];
            data.exchanges.unshift(newItem);
          } else {
            // 불용재고 저장
            const drugName = (document.getElementById('ds-drug-name')?.value || '').trim();
            const manufacturer = (document.getElementById('ds-manufacturer')?.value || '').trim();
            const expiryDate = (document.getElementById('ds-expiry')?.value || '').trim();
            const quantity = Number(document.getElementById('ds-quantity')?.value) || 0;
            const unit = document.getElementById('ds-unit')?.value || '정';
            const price = Number(document.getElementById('ds-price')?.value) || 0;
            const totalPrice = Math.round(quantity * price);
            const hospital = (document.getElementById('ds-hospital')?.value || '').trim();
            const locationDetail = (document.getElementById('ds-location')?.value || '').trim();
            const reason = (document.getElementById('ds-reason')?.value || '').trim();

            const newItem = {
              id: 'ds_' + nowMs,
              drugName,
              manufacturer,
              expiryDate,
              quantity,
              unit,
              price,
              totalPrice,
              hospital,
              locationDetail,
              reason,
              photos: uploadedUrls,
              photoUrl: uploadedUrls[0] || '',
              status: 'STORAGE', // STORAGE, DISPOSAL, SETTLED
              updatedBy: currUser.name,
              updatedAt: nowMs,
              displayDate: nowStr
            };

            if (!data.deadStocks) data.deadStocks = [];
            data.deadStocks.unshift(newItem);
          }

          saveStorageData(data);
          closeModal();
          resetPhoto();
          alert('✅ 성공적으로 저장되었습니다!');
          render('module-content');
        }

      } catch (err) {
        console.error("PharmacyExchangeModule handleSubmit error:", err);
        alert("⚠️ 저장 처리 중 오류가 발생했습니다: " + err.message);
      } finally {
        if (liveBtn) {
          liveBtn.disabled = false;
          liveBtn.innerHTML = '<i class="fas fa-save me-1"></i> 저장하기';
        }
      }
    }

    // ==========================================
    // ⚡ 원터치 상태 변경 (반환/정산/보관)
    // ==========================================
    function toggleExchangeStatus(id, newStatus) {
      const data = getStorageData();
      const target = (data.exchanges || []).find(e => String(e.id) === String(id));
      if (!target) return;

      target.status = target.status === newStatus ? 'PENDING' : newStatus;
      target.updatedAt = Date.now(); // 마스터 대원칙 제26조 타임스탬프 필수 갱신
      saveStorageData(data);
      render('module-content');
      if (window.DailyBriefingWidget && typeof window.DailyBriefingWidget.renderWidget === 'function') {
        window.DailyBriefingWidget.renderWidget();
      }
    }

    function toggleDeadStockStatus(id, newStatus) {
      const data = getStorageData();
      const target = (data.deadStocks || []).find(d => String(d.id) === String(id));
      if (!target) return;

      target.status = newStatus;
      target.updatedAt = Date.now();
      saveStorageData(data);
      render('module-content');
      if (window.DailyBriefingWidget && typeof window.DailyBriefingWidget.renderWidget === 'function') {
        window.DailyBriefingWidget.renderWidget();
      }
    }

    function deleteItem(type, id, name) {
      const currUser = (window.SheetsSync && window.SheetsSync.getCurrentUser && window.SheetsSync.getCurrentUser()) || {};
      const isDirector = currUser.role === '약국장' || currUser.id === 'emp_1';

      if (!isDirector) {
        alert('🔒 약품 교품 및 불용재고 삭제는 약국장 전용 권한입니다.');
        return;
      }

      if (!confirm(`🗑️ [${name}] 내역을 정말로 영구 삭제하시겠습니까?\n(삭제 후 클라우드에서도 함께 제거됩니다)`)) {
        return;
      }

      const data = getStorageData();
      if (type === 'EXCHANGE') {
        data.exchanges = (data.exchanges || []).filter(e => String(e.id) !== String(id));
      } else {
        data.deadStocks = (data.deadStocks || []).filter(d => String(d.id) !== String(id));
      }

      if (window.SheetsSync && typeof window.SheetsSync.addDeletedId === 'function') {
        window.SheetsSync.addDeletedId(id);
      }

      saveStorageData(data);
      render('module-content');
    }

    // ==========================================
    // 🔍 검색 & 서브탭 & 필터 전환
    // ==========================================
    function handleSearch(val) {
      searchQuery = val;
      const clearBtn = document.getElementById('ex-search-clear-btn');
      if (clearBtn) clearBtn.style.display = val ? 'block' : 'none';

      const grid = document.getElementById('ex-card-grid-container');
      if (grid) {
        grid.innerHTML = renderContentGridHTML();
      } else {
        render();
      }
    }

    function setSubTab(tab, shouldRender = true) {
      activeSubTab = tab;
      searchQuery = '';
      if (shouldRender) {
        render('module-content');
      }
    }

    function setFilter(filter) {
      if (activeSubTab === 'EXCHANGE') {
        exchangeFilter = filter;
      } else {
        deadStockFilter = filter;
      }
      render('module-content');
    }

    function openCreateModal() {
      editingItemId = null;
      selectedPhotos = [];

      const titleEl = document.getElementById('ex-modal-title');
      if (titleEl) titleEl.innerText = (activeSubTab === 'EXCHANGE' ? '인근약국 교품 내역 등록' : '처방 중단 불용재고 등록');

      const descEl = document.getElementById('ex-modal-desc');
      if (descEl) descEl.innerText = (activeSubTab === 'EXCHANGE' ? '약품 대여/차용 내역을 실시간 장부에 기록합니다.' : '처방 중단 고가약 손실을 방지하기 위해 재고를 기재합니다.');

      const iconEl = document.getElementById('ex-modal-icon');
      if (iconEl) iconEl.innerHTML = activeSubTab === 'EXCHANGE' ? '<i class="fas fa-handshake"></i>' : '<i class="fas fa-boxes-stacked"></i>';

      const submitBtn = document.getElementById('ex-submit-btn');
      if (submitBtn) submitBtn.innerHTML = '<i class="fas fa-save me-1"></i> 저장하기';

      const fieldsContainer = document.getElementById('ex-modal-fields-container');
      if (fieldsContainer) {
        fieldsContainer.innerHTML = (activeSubTab === 'EXCHANGE' ? renderExchangeFormFields() : renderDeadStockFormFields());
      }

      resetPhoto();

      const overlay = document.getElementById('ex-modal-overlay');
      if (overlay) overlay.style.display = 'flex';
    }

    function openEditModal(type, id) {
      const data = getStorageData();
      let item = null;
      if (type === 'EXCHANGE') {
        item = (data.exchanges || []).find(e => String(e.id) === String(id));
      } else {
        item = (data.deadStocks || []).find(d => String(d.id) === String(id));
      }
      if (!item) {
        alert('⚠️ 해당 항목을 찾을 수 없습니다.');
        return;
      }

      editingItemId = id;
      activeSubTab = type;

      const titleEl = document.getElementById('ex-modal-title');
      if (titleEl) titleEl.innerText = (type === 'EXCHANGE' ? '인근약국 교품 내역 수정' : '처방 중단 불용재고 수정');

      const descEl = document.getElementById('ex-modal-desc');
      if (descEl) descEl.innerText = (type === 'EXCHANGE' ? '기존 등록된 교품 내역을 수정합니다.' : '기존 등록된 불용재고 정보를 수정합니다.');

      const iconEl = document.getElementById('ex-modal-icon');
      if (iconEl) iconEl.innerHTML = '<i class="fas fa-edit"></i>';

      const submitBtn = document.getElementById('ex-submit-btn');
      if (submitBtn) submitBtn.innerHTML = '<i class="fas fa-edit me-1"></i> 수정 내용 저장';

      const fieldsContainer = document.getElementById('ex-modal-fields-container');
      if (fieldsContainer) {
        fieldsContainer.innerHTML = (type === 'EXCHANGE' ? renderExchangeFormFields() : renderDeadStockFormFields());
      }

      // 폼 값 채우기
      if (type === 'EXCHANGE') {
        const radio = document.querySelector(`input[name="ex-type"][value="${item.type || 'LEND'}"]`);
        if (radio) radio.checked = true;
        const partnerEl = document.getElementById('ex-partner');
        if (partnerEl) partnerEl.value = item.partnerPharmacy || '';
        const drugEl = document.getElementById('ex-drug-name');
        if (drugEl) drugEl.value = item.drugName || '';
        const qtyEl = document.getElementById('ex-quantity');
        if (qtyEl) qtyEl.value = item.quantity || '';
        const unitEl = document.getElementById('ex-unit');
        if (unitEl) unitEl.value = item.unit || '정';
        const notesEl = document.getElementById('ex-notes');
        if (notesEl) notesEl.value = item.notes || '';
      } else {
        const drugEl = document.getElementById('ds-drug-name');
        if (drugEl) drugEl.value = item.drugName || '';
        const mfgEl = document.getElementById('ds-manufacturer');
        if (mfgEl) mfgEl.value = item.manufacturer || '';
        const expEl = document.getElementById('ds-expiry');
        if (expEl) expEl.value = item.expiryDate || '';
        const qtyEl = document.getElementById('ds-quantity');
        if (qtyEl) qtyEl.value = item.quantity != null ? item.quantity : '';
        const unitEl = document.getElementById('ds-unit');
        if (unitEl) unitEl.value = item.unit || '정';
        const priceEl = document.getElementById('ds-price');
        if (priceEl) priceEl.value = item.price != null ? item.price : '';
        const hospEl = document.getElementById('ds-hospital');
        if (hospEl) hospEl.value = item.hospital || '';
        const locEl = document.getElementById('ds-location');
        if (locEl) locEl.value = item.locationDetail || '';
        const reasonEl = document.getElementById('ds-reason');
        if (reasonEl) reasonEl.value = item.reason || '';
        calcTotalPrice();
      }

      // 기존 사진 복원
      const existingPhotos = (item.photos && Array.isArray(item.photos) && item.photos.length > 0)
        ? item.photos
        : (item.photoUrl ? [item.photoUrl] : []);
      selectedPhotos = existingPhotos.map((url, idx) => ({
        id: 'photo_edit_' + idx + '_' + Date.now(),
        data: url,
        isNew: false
      }));
      renderPhotoPreviews();

      const overlay = document.getElementById('ex-modal-overlay');
      if (overlay) overlay.style.display = 'flex';
    }

    function closeModal() {
      editingItemId = null;
      const overlay = document.getElementById('ex-modal-overlay');
      if (overlay) overlay.style.display = 'none';
      resetPhoto();
    }

    function openPhoto(id, initialIdx = 0) {
      try {
        const data = getStorageData();
        let target = null;
        if (activeSubTab === 'EXCHANGE') {
          target = (data.exchanges || []).find(e => String(e.id) === String(id));
        } else {
          target = (data.deadStocks || []).find(d => String(d.id) === String(id));
        }
        if (!target) return;

        const allPhotos = (target.photos && Array.isArray(target.photos) && target.photos.length > 0)
          ? target.photos
          : (target.photoUrl ? [target.photoUrl] : []);

        if (allPhotos.length > 0 && window.App && typeof window.App.openImageLightbox === 'function') {
          window.App.openImageLightbox(allPhotos, target.drugName || '약품 사진', initialIdx);
        }
      } catch (e) {
        console.warn('openPhoto error:', e);
      }
    }

    // 0.1초 실시간 클라우드 리스너 연동 (마스터 대원칙 제7조)
    if (typeof window !== 'undefined') {
      window.addEventListener('ssg_cloud_updated', () => {
        const active = window.App && typeof window.App.getActiveModule === 'function' ? window.App.getActiveModule() : '';
        if (active === 'pharmacy-exchange') {
          const anyModalOpen = Array.from(document.querySelectorAll('.modal-overlay')).some(m => {
            const disp = window.getComputedStyle(m).display;
            return disp !== 'none' && disp !== '';
          });
          if (!anyModalOpen) {
            render('module-content');
          }
        }
      });
    }

    return {
      render,
      setSubTab,
      setFilter,
      handleSearch,
      openCreateModal,
      openEditModal,
      closeModal,
      handlePhotoSelect,
      removePhoto,
      resetPhoto,
      handleSubmit,
      calcTotalPrice,
      toggleExchangeStatus,
      toggleDeadStockStatus,
      deleteItem,
      openPhoto,
      determineDefaultSubTab,
      autoSelectLatestSubTab,
      getActiveSubTab: () => activeSubTab
    };
  })();
}
