/**
 * 📋 환자 예약 주문 & 선결제 관리 모듈 (Patient Orders Module)
 * 365메가스타약국 HR/OPS 마스터 개발 가이드라인 완벽 준수
 * [1] 환자 예약 등록: 환자명, 연락처, 품목, 수량, 선결제 구분(완납/계약금/미결제), 처방/약곽 사진
 * [2] 3단계 파이프라인: [⏳ 주문접수] ➔ [📦 입고완료] ➔ [✅ 고객수령]
 * [3] 원터치 문자 안내: 입고 즉시 고객 도착 알림 문자 템플릿 복사 및 SMS 전송 지원
 */
if (typeof window.PatientOrdersModule === 'undefined') {
  window.PatientOrdersModule = (function () {
    let activeFilter = 'ALL'; // 'ALL', 'PENDING_ORDER', 'ARRIVED', 'COMPLETED'
    let searchQuery = '';
    let selectedPhotos = [];   // [{ id, data, isNew }]

    function escapeHTML(str) {
      if (!str) return '';
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    // 🕒 한국 로컬 일시(KST) 안전 포맷팅
    function formatOrderDate(val, fallbackStr) {
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
        if (window.SheetsSync && typeof window.SheetsSync.getPatientOrders === 'function') {
          return window.SheetsSync.getPatientOrders();
        }
        const raw = localStorage.getItem('ssg_patient_orders_v1');
        return raw ? JSON.parse(raw) : [];
      } catch (e) {
        return [];
      }
    }

    function saveStorageData(list) {
      try {
        if (window.SheetsSync && typeof window.SheetsSync.savePatientOrders === 'function') {
          window.SheetsSync.savePatientOrders(list);
          return;
        }
        localStorage.setItem('ssg_patient_orders_v1', JSON.stringify(list));
      } catch (e) {
        console.warn('savePatientOrders warning:', e);
      }
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
              id: 'ord_p_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
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
      const container = document.getElementById('ord-photo-preview-container');
      const grid = document.getElementById('ord-photo-thumbnails-grid');
      const textEl = document.getElementById('ord-photo-count-text');
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
          <button type="button" onclick="PatientOrdersModule.removePhoto(${idx})" style="position:absolute; top:2px; right:2px; background:rgba(220,38,38,0.9); color:#ffffff; border:none; width:20px; height:20px; border-radius:50%; font-size:11px; font-weight:900; cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:0 1px 3px rgba(0,0,0,0.3); z-index:2;">✕</button>
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
      const camInput = document.getElementById('ord-photo-camera');
      const galInput = document.getElementById('ord-photo-gallery');
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

      const items = getStorageData() || [];

      // 통계 계산
      const pendingOrderCount = items.filter(i => i.status === 'PENDING_ORDER' || !i.status).length;
      const arrivedCount = items.filter(i => i.status === 'ARRIVED').length;
      const completedCount = items.filter(i => i.status === 'COMPLETED').length;
      const totalUnpaidBalance = items
        .filter(i => i.status !== 'COMPLETED')
        .reduce((sum, item) => sum + (Number(item.unpaidBalance) || 0), 0);

      const html = `
        <div class="module-header flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm mb-4 sm:mb-5">
          <div class="space-y-1">
            <h2 class="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2 flex-wrap">
              <i class="fas fa-clipboard-list text-teal-600"></i>
              <span>📋 환자 예약 주문 & 선결제 관리</span>
            </h2>
            <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed break-keep">
              손님 맞춤 의약품/영양제 예약 접수, 선결제 정산, 입고 시 원터치 문자 안내 발송
            </p>
          </div>
          <button type="button" class="w-full sm:w-auto flex-1 sm:flex-initial btn btn-primary font-bold text-xs px-3.5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white shadow-md transition flex items-center justify-center gap-1.5 whitespace-nowrap" onclick="PatientOrdersModule.openCreateModal()">
            <i class="fas fa-plus-circle"></i>
            <span>+ 새 환자 예약 주문 접수</span>
          </button>
        </div>

        <!-- 📊 상단 대시보드 요약 바 & 실시간 검색창 -->
        <div class="bg-white dark:bg-slate-900 p-3.5 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm mb-4 sm:mb-5 space-y-3">
          <!-- 3대 핵심 현황 칩 -->
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div class="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex flex-col justify-between">
              <span class="text-[11px] font-bold text-slate-500 dark:text-slate-400">총 누적 예약</span>
              <span class="text-lg font-black text-slate-800 dark:text-slate-200 mt-1">${items.length}건</span>
            </div>
            <div class="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 rounded-xl p-3 flex flex-col justify-between">
              <span class="text-[11px] font-bold text-amber-700 dark:text-amber-400">⏳ 주문 대기</span>
              <span class="text-lg font-black text-amber-900 dark:text-amber-200 mt-1">${pendingOrderCount}건</span>
            </div>
            <div class="bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800/80 rounded-xl p-3 flex flex-col justify-between ${arrivedCount > 0 ? 'ring-2 ring-teal-500 ring-offset-1' : ''}">
              <span class="text-[11px] font-bold text-teal-700 dark:text-teal-400">📦 입고 완료 (미수령)</span>
              <span class="text-lg font-black text-teal-900 dark:text-teal-200 mt-1">${arrivedCount}건</span>
            </div>
            <div class="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/80 rounded-xl p-3 flex flex-col justify-between">
              <span class="text-[11px] font-bold text-rose-700 dark:text-rose-400">💰 미결제 잔액 총액</span>
              <span class="text-lg font-black text-rose-900 dark:text-rose-200 mt-1">₩ ${Math.round(totalUnpaidBalance).toLocaleString()}원</span>
            </div>
          </div>

          <!-- 🔍 실시간 검색창 -->
          <div class="relative flex-grow pt-1">
            <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
            <input type="text" id="ord-search-input" value="${escapeHTML(searchQuery)}" oninput="PatientOrdersModule.handleSearch(this.value)" placeholder="환자명, 전화번호(뒷자리), 예약 약품명, 메모 검색..." class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl pl-8 pr-8 py-2 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-teal-500">
            <button id="ord-search-clear-btn" onclick="PatientOrdersModule.handleSearch('')" style="display:${searchQuery ? 'block' : 'none'};" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs">✖</button>
          </div>

          <!-- 상태별 필터 칩 (가로 스크롤) -->
          <div class="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs font-bold whitespace-nowrap pt-1 border-t border-slate-100 dark:border-slate-800">
            <button type="button" onclick="PatientOrdersModule.setFilter('ALL')" class="px-3 py-1.5 rounded-full text-xs font-black transition ${activeFilter === 'ALL' ? 'bg-teal-600 text-white shadow' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'}">
              전체 보기 (${items.length})
            </button>
            <button type="button" onclick="PatientOrdersModule.setFilter('PENDING_ORDER')" class="px-3 py-1.5 rounded-full text-xs font-black transition ${activeFilter === 'PENDING_ORDER' ? 'bg-amber-600 text-white shadow' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'}">
              ⏳ 주문 접수/대기 (${pendingOrderCount})
            </button>
            <button type="button" onclick="PatientOrdersModule.setFilter('ARRIVED')" class="px-3 py-1.5 rounded-full text-xs font-black transition ${activeFilter === 'ARRIVED' ? 'bg-teal-600 text-white shadow' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'}">
              📦 입고 완료 (미수령) (${arrivedCount})
            </button>
            <button type="button" onclick="PatientOrdersModule.setFilter('COMPLETED')" class="px-3 py-1.5 rounded-full text-xs font-black transition ${activeFilter === 'COMPLETED' ? 'bg-slate-700 text-white shadow' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'}">
              ✅ 수령 완료 (${completedCount})
            </button>
          </div>
        </div>

        <!-- 📦 예약 주문 카드 그리드 -->
        <div id="ord-card-grid-container">
          ${renderCardGridHTML(items)}
        </div>

        <!-- 📝 신규 예약 등록 모달창 -->
        ${renderModalHTML()}

        <!-- 💬 입고 안내 문자 전송 팝업 모달창 -->
        ${renderSmsModalHTML()}
      `;

      container.innerHTML = html;
    }

    function renderCardGridHTML(items) {
      let filtered = [...items];

      // 필터 적용
      if (activeFilter === 'PENDING_ORDER') filtered = filtered.filter(i => i.status === 'PENDING_ORDER' || !i.status);
      else if (activeFilter === 'ARRIVED') filtered = filtered.filter(i => i.status === 'ARRIVED');
      else if (activeFilter === 'COMPLETED') filtered = filtered.filter(i => i.status === 'COMPLETED');

      // 검색어 적용
      if (searchQuery.trim()) {
        const kw = searchQuery.trim().toLowerCase().replace(/\s+/g, '');
        filtered = filtered.filter(i => {
          const text = [i.patientName, i.phone, i.drugName, i.notes, i.registeredBy].join(' ').toLowerCase().replace(/\s+/g, '');
          return text.includes(kw);
        });
      }

      // 최신순 내림차순 정렬 (마스터 대원칙 제1조, 제122조)
      filtered.sort((a, b) => (Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0)));

      if (filtered.length === 0) {
        return `
          <div class="bg-white dark:bg-slate-900 rounded-2xl p-8 sm:p-12 text-center border border-slate-200 dark:border-slate-800 space-y-3">
            <div class="text-4xl">📋</div>
            <h4 class="text-base font-bold text-slate-700 dark:text-slate-300">${items.length === 0 ? '등록된 환자 예약 주문 건이 없습니다.' : '검색/필터 조건과 일치하는 예약 주문이 없습니다.'}</h4>
            <p class="text-xs text-slate-400 max-w-sm mx-auto">상단의 <strong>[+ 새 환자 예약 주문 접수]</strong> 버튼을 눌러 손님의 주문 내역을 기록하세요.</p>
          </div>
        `;
      }

      const currUser = (window.SheetsSync && window.SheetsSync.getCurrentUser && window.SheetsSync.getCurrentUser()) || {};
      const isDirector = currUser.role === '약국장' || currUser.id === 'emp_1';

      return `
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
          ${filtered.map(item => {
            const status = item.status || 'PENDING_ORDER';
            const isCompleted = status === 'COMPLETED';
            const isArrived = status === 'ARRIVED';
            const allPhotos = (item.photos && Array.isArray(item.photos) && item.photos.length > 0)
              ? item.photos
              : (item.photoUrl ? [item.photoUrl] : []);
            const mainPhoto = allPhotos[0] || '';

            // 선결제 상태 레이블 및 색상
            let payBadge = '';
            if (item.payType === 'PAID_FULL') {
              payBadge = '<span class="text-[11px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">💰 전액 완납</span>';
            } else if (item.payType === 'PAID_PARTIAL') {
              payBadge = `<span class="text-[11px] font-black px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">💳 계약금 (잔액 ₩${Number(item.unpaidBalance || 0).toLocaleString()})</span>`;
            } else {
              payBadge = `<span class="text-[11px] font-black px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">⏳ 수령시 결제 (₩${Number(item.totalPrice || 0).toLocaleString()})</span>`;
            }

            return `
              <div class="bg-white dark:bg-slate-900 border ${isArrived ? 'border-teal-400 dark:border-teal-700 shadow-md ring-2 ring-teal-500/20' : (isCompleted ? 'border-slate-200 dark:border-slate-800 opacity-75' : 'border-amber-200 dark:border-amber-900')} rounded-2xl overflow-hidden flex flex-col justify-between transition relative">
                <div>
                  ${mainPhoto ? `
                    <div class="relative w-full h-36 bg-slate-100 dark:bg-slate-950 overflow-hidden border-b border-slate-100 dark:border-slate-800 cursor-pointer" onclick="PatientOrdersModule.openPhoto('${item.id}', 0)">
                      <img src="${mainPhoto}" alt="${escapeHTML(item.patientName)}" class="w-full h-full object-cover" />
                      <span class="absolute top-2.5 left-2.5 text-[11px] font-black px-2.5 py-0.5 rounded-full shadow-sm ${status === 'ARRIVED' ? 'bg-teal-600 text-white' : (status === 'COMPLETED' ? 'bg-slate-600 text-white' : 'bg-amber-600 text-white')}">
                        ${status === 'ARRIVED' ? '📦 입고 완료 (미수령)' : (status === 'COMPLETED' ? '✅ 수령 완료' : '⏳ 주문 접수')}
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
                      <div class="flex items-center gap-1.5">
                        <span class="text-sm font-black text-slate-900 dark:text-white">
                          👤 ${escapeHTML(item.patientName)}
                        </span>
                        <span class="text-xs font-bold text-slate-500 dark:text-slate-400">
                          (${escapeHTML(item.phone || '연락처 없음')})
                        </span>
                      </div>
                      ${payBadge}
                    </div>

                    <div>
                      <div class="text-base font-extrabold text-slate-900 dark:text-white leading-tight break-all">
                        💊 ${escapeHTML(item.drugName)}
                      </div>
                      <div class="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400 mt-1.5">
                        <span>수량: <strong class="text-sm font-black text-teal-600">${escapeHTML(item.quantity)}</strong> ${escapeHTML(item.unit || '개')}</span>
                        <span>총액: <strong class="text-slate-800 dark:text-slate-200">₩ ${Math.round(Number(item.totalPrice) || 0).toLocaleString()}원</strong></span>
                      </div>
                    </div>

                    ${item.notes ? `
                      <div class="text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-950 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 font-medium leading-snug">
                        💡 ${escapeHTML(item.notes)}
                      </div>
                    ` : ''}
                  </div>
                </div>

                <!-- 하단 액션 & 상태 전환 바 -->
                <div class="p-3 bg-slate-50 dark:bg-slate-950 border-t border-slate-100 dark:border-slate-800 text-xs flex flex-col gap-2">
                  <div class="flex items-center justify-between text-[11px] text-slate-400">
                    <span>🕒 <b>${escapeHTML(item.registeredBy || '약국')}</b> · ${escapeHTML(formatOrderDate(item.updatedAt, item.displayDate))}</span>
                    ${isDirector ? `
                      <button type="button" onclick="PatientOrdersModule.deleteItem('${item.id}', '${escapeHTML(item.patientName).replace(/'/g, "\\'")}')" class="text-rose-500 hover:text-rose-700 font-bold p-1" title="삭제">
                        <i class="fas fa-trash-alt"></i>
                      </button>
                    ` : ''}
                  </div>

                  <!-- 원터치 상태 전환 버튼 군 -->
                  <div class="grid grid-cols-2 gap-1.5 pt-1 border-t border-slate-200 dark:border-slate-800">
                    ${status === 'PENDING_ORDER' ? `
                      <button type="button" onclick="PatientOrdersModule.updateStatus('${item.id}', 'ARRIVED')" class="w-full col-span-2 px-2.5 py-2 rounded-xl text-xs font-black transition flex items-center justify-center gap-1.5 bg-teal-600 hover:bg-teal-500 text-white shadow-sm">
                        <i class="fas fa-box-open"></i> 📦 약품 입고 완료 (문자 발송)
                      </button>
                    ` : (status === 'ARRIVED' ? `
                      <button type="button" onclick="PatientOrdersModule.openSmsModal('${item.id}')" class="px-2 py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 bg-white dark:bg-slate-800 border border-teal-400 text-teal-700 dark:text-teal-300 hover:bg-teal-50">
                        <i class="fas fa-comment-dots text-xs"></i> 💬 문자 전송
                      </button>
                      <button type="button" onclick="PatientOrdersModule.updateStatus('${item.id}', 'COMPLETED')" class="px-2 py-1.5 rounded-lg text-xs font-black transition flex items-center justify-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm">
                        <i class="fas fa-check-circle text-xs"></i> ✅ 수령 완료
                      </button>
                    ` : `
                      <button type="button" onclick="PatientOrdersModule.updateStatus('${item.id}', 'ARRIVED')" class="w-full col-span-2 px-2 py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 bg-slate-100 text-slate-600 hover:bg-slate-200">
                        <i class="fas fa-rotate-left text-xs"></i> ↩️ 입고 대기 상태로 되돌리기
                      </button>
                    `)}
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    // ==========================================
    // 📝 신규 예약 등록 모달 HTML
    // ==========================================
    function renderModalHTML() {
      return `
        <div id="ord-modal-overlay" class="modal-overlay" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(15,23,42,0.8); backdrop-filter:blur(5px); z-index:99999; justify-content:center; align-items:center; padding:16px;">
          <div class="modal-card shadow-2xl" style="background:#ffffff; border-radius:24px; max-width:540px; width:100%; max-height:90vh; overflow-y:auto; padding:28px; position:relative; box-sizing:border-box;">
            <div style="display:flex; align-items:center; justify-content:space-between; border-bottom:1.5px solid #f1f5f9; padding-bottom:14px; margin-bottom:20px;">
              <div style="display:flex; align-items:center; gap:10px;">
                <div style="width:40px; height:40px; border-radius:12px; background:#ccfbf1; color:#0f766e; display:flex; align-items:center; justify-content:center; font-size:20px; border:1px solid #99f6e4;">
                  <i class="fas fa-clipboard-check"></i>
                </div>
                <div>
                  <h3 style="font-size:18px; font-weight:800; color:#0f172a; margin:0;">새 환자 예약 주문 접수</h3>
                  <p style="font-size:12px; color:#64748b; margin:2px 0 0 0;">손님이 주문하신 의약품/영양제 내역과 선결제 정보를 등록합니다.</p>
                </div>
              </div>
              <button type="button" onclick="PatientOrdersModule.closeModal()" style="background:#f1f5f9; border:none; width:32px; height:32px; border-radius:50%; font-size:16px; color:#64748b; cursor:pointer;">&times;</button>
            </div>

            <form onsubmit="PatientOrdersModule.handleSubmit(event)" style="display:flex; flex-direction:column; gap:14px;">
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                <div>
                  <label style="display:block; font-size:13px; font-weight:800; color:#334155; margin-bottom:5px;">환자 성함 <span style="color:#ef4444;">*</span></label>
                  <input type="text" id="ord-patient-name" required placeholder="예: 홍길동" style="width:100%; border:1.5px solid #cbd5e1; border-radius:10px; padding:10px 14px; font-size:14px; font-weight:700; box-sizing:border-box;">
                </div>
                <div>
                  <label style="display:block; font-size:13px; font-weight:800; color:#334155; margin-bottom:5px;">휴대폰 연락처 <span style="color:#ef4444;">*</span></label>
                  <input type="text" id="ord-phone" required placeholder="예: 010-1234-5678" style="width:100%; border:1.5px solid #cbd5e1; border-radius:10px; padding:10px 14px; font-size:14px; font-weight:700; box-sizing:border-box;">
                </div>
              </div>

              <div>
                <label style="display:block; font-size:13px; font-weight:800; color:#334155; margin-bottom:5px;">주문 약품명 및 규격 <span style="color:#ef4444;">*</span></label>
                <input type="text" id="ord-drug-name" required placeholder="예: 액티넘 EX 골드 90정, 팍스로비드" style="width:100%; border:1.5px solid #cbd5e1; border-radius:10px; padding:10px 14px; font-size:14px; font-weight:700; box-sizing:border-box;">
              </div>

              <div style="display:grid; grid-template-columns:2fr 1fr; gap:10px;">
                <div>
                  <label style="display:block; font-size:13px; font-weight:800; color:#334155; margin-bottom:5px;">수량 <span style="color:#ef4444;">*</span></label>
                  <input type="number" id="ord-quantity" required value="1" min="1" oninput="PatientOrdersModule.calcTotal()" style="width:100%; border:1.5px solid #cbd5e1; border-radius:10px; padding:10px 14px; font-size:14px; font-weight:700; box-sizing:border-box;">
                </div>
                <div>
                  <label style="display:block; font-size:13px; font-weight:800; color:#334155; margin-bottom:5px;">단위</label>
                  <select id="ord-unit" style="width:100%; border:1.5px solid #cbd5e1; border-radius:10px; padding:10px 8px; font-size:13.5px; font-weight:700; background:#ffffff; box-sizing:border-box;">
                    <option value="통/병" selected>통/병 (Btl)</option>
                    <option value="박스">박스 (Box)</option>
                    <option value="포/포장">포/포장 (PTP)</option>
                    <option value="정">정 (T)</option>
                  </select>
                </div>
              </div>

              <div>
                <label style="display:block; font-size:13px; font-weight:800; color:#334155; margin-bottom:6px;">선결제 여부 구분 <span style="color:#ef4444;">*</span></label>
                <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px;">
                  <label style="display:flex; align-items:center; justify-content:center; gap:4px; padding:9px 4px; border-radius:10px; border:2px solid #10b981; background:#f0fdf4; color:#047857; font-weight:800; font-size:12px; cursor:pointer; text-align:center;">
                    <input type="radio" name="ord-paytype" value="PAID_FULL" checked onchange="PatientOrdersModule.updatePayFields()" style="accent-color:#059669;">
                    <span>💰 전액 완납</span>
                  </label>
                  <label style="display:flex; align-items:center; justify-content:center; gap:4px; padding:9px 4px; border-radius:10px; border:2px solid #3b82f6; background:#eff6ff; color:#1d4ed8; font-weight:800; font-size:12px; cursor:pointer; text-align:center;">
                    <input type="radio" name="ord-paytype" value="PAID_PARTIAL" onchange="PatientOrdersModule.updatePayFields()" style="accent-color:#2563eb;">
                    <span>💳 계약금</span>
                  </label>
                  <label style="display:flex; align-items:center; justify-content:center; gap:4px; padding:9px 4px; border-radius:10px; border:2px solid #ef4444; background:#fef2f2; color:#b91c1c; font-weight:800; font-size:12px; cursor:pointer; text-align:center;">
                    <input type="radio" name="ord-paytype" value="UNPAID" onchange="PatientOrdersModule.updatePayFields()" style="accent-color:#dc2626;">
                    <span>⏳ 수령시 결제</span>
                  </label>
                </div>
              </div>

              <!-- 금액 입력 섹션 -->
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; background:#f8fafc; padding:12px; border-radius:12px; border:1px solid #e2e8f0;">
                <div>
                  <label style="display:block; font-size:12px; font-weight:800; color:#334155; margin-bottom:4px;">총 결제 예정 금액 (원)</label>
                  <input type="number" id="ord-total-price" placeholder="예: 35000" oninput="PatientOrdersModule.calcTotal()" style="width:100%; border:1.5px solid #cbd5e1; border-radius:8px; padding:8px 10px; font-size:13.5px; font-weight:800; box-sizing:border-box;">
                </div>
                <div id="ord-paid-amount-box">
                  <label style="display:block; font-size:12px; font-weight:800; color:#334155; margin-bottom:4px;">선결제(지불) 금액 (원)</label>
                  <input type="number" id="ord-paid-amount" placeholder="예: 35000" oninput="PatientOrdersModule.calcTotal()" style="width:100%; border:1.5px solid #cbd5e1; border-radius:8px; padding:8px 10px; font-size:13.5px; font-weight:800; box-sizing:border-box;">
                </div>
              </div>

              <!-- 잔액 요약 바 -->
              <div style="background:#eff6ff; border:1px solid #bfdbfe; border-radius:10px; padding:10px 14px; display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:12px; font-weight:800; color:#1e40af;">남은 수령 시 결제 잔액</span>
                <span id="ord-balance-text" style="font-size:15px; font-weight:900; color:#1d4ed8;">₩ 0원</span>
              </div>

              <!-- 📸 처방전/약곽 사진 첨부 -->
              <div>
                <label style="display:block; font-size:13px; font-weight:800; color:#334155; margin-bottom:6px;">
                  사진 첨부 <span style="font-weight:normal; color:#64748b; font-size:12px;">(선택 - 처방전, 환자 메모, 약곽 사진)</span>
                </label>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; width:100%;">
                  <label for="ord-photo-camera" style="display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; border-radius:14px; border:2px dashed #0d9488; padding:12px 10px; background:#f0fdfa; color:#0d9488; font-size:12px; font-weight:800; cursor:pointer; text-align:center;">
                    <i class="fas fa-camera" style="font-size:20px;"></i>
                    <span>📸 바로 카메라 촬영</span>
                  </label>
                  <input type="file" id="ord-photo-camera" accept="image/*" capture="environment" style="display:none;" onchange="PatientOrdersModule.handlePhotoSelect(this)">

                  <label for="ord-photo-gallery" style="display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; border-radius:14px; border:2px dashed #94a3b8; padding:12px 10px; background:#f8fafc; color:#475569; font-size:12px; font-weight:800; cursor:pointer; text-align:center;">
                    <i class="fas fa-images" style="font-size:20px;"></i>
                    <span>📁 앨범/사진 선택</span>
                  </label>
                  <input type="file" id="ord-photo-gallery" accept="image/*" multiple style="display:none;" onchange="PatientOrdersModule.handlePhotoSelect(this)">
                </div>

                <div id="ord-photo-preview-container" style="display:none; margin-top:10px; background:#f8fafc; padding:10px; border-radius:12px; border:1px solid #cbd5e1;">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                    <span id="ord-photo-count-text" style="font-size:11.5px; font-weight:800; color:#0d9488;">📷 첨부된 사진 (0/5장)</span>
                    <button type="button" onclick="PatientOrdersModule.resetPhoto()" style="background:#fee2e2; border:1px solid #fca5a5; color:#dc2626; font-size:10px; font-weight:800; padding:2px 6px; border-radius:5px; cursor:pointer;">전체 취소 ✖</button>
                  </div>
                  <div id="ord-photo-thumbnails-grid" style="display:flex; gap:8px; overflow-x:auto; padding-bottom:4px;" class="no-scrollbar"></div>
                </div>
              </div>

              <div>
                <label style="display:block; font-size:13px; font-weight:700; color:#334155; margin-bottom:4px;">참고 메모 / 전달 사항</label>
                <input type="text" id="ord-notes" placeholder="예: 금요일 저녁 방문 예정, 본인 외 가족 수령 가능" style="width:100%; border:1.5px solid #cbd5e1; border-radius:10px; padding:10px 14px; font-size:13px; box-sizing:border-box;">
              </div>

              <!-- 하단 버튼 바 -->
              <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:10px;">
                <button type="button" class="btn btn-secondary" onclick="PatientOrdersModule.closeModal()" style="border-radius:10px; padding:10px 18px; font-weight:700;">취소</button>
                <button type="submit" id="ord-submit-btn" class="btn btn-primary" style="background:#0d9488; border-color:#0d9488; border-radius:10px; padding:10px 24px; font-weight:800; color:#fff;">
                  <i class="fas fa-save me-1"></i> 예약 접수 완료
                </button>
              </div>
            </form>
          </div>
        </div>
      `;
    }

    // ==========================================
    // 💬 입고 안내 문자 전송 팝업 모달 HTML
    // ==========================================
    function renderSmsModalHTML() {
      return `
        <div id="ord-sms-modal" class="modal-overlay" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(15,23,42,0.8); backdrop-filter:blur(5px); z-index:999999; justify-content:center; align-items:center; padding:16px;">
          <div class="modal-card shadow-2xl" style="background:#ffffff; border-radius:24px; max-width:480px; width:100%; padding:24px; position:relative; box-sizing:border-box;">
            <div style="display:flex; align-items:center; justify-content:space-between; border-bottom:1.5px solid #f1f5f9; padding-bottom:12px; margin-bottom:16px;">
              <div style="display:flex; align-items:center; gap:8px;">
                <div style="width:36px; height:36px; border-radius:10px; background:#f0fdfa; color:#0d9488; display:flex; align-items:center; justify-content:center; font-size:18px;">
                  <i class="fas fa-paper-plane"></i>
                </div>
                <div>
                  <h3 style="font-size:16px; font-weight:800; color:#0f172a; margin:0;">입고 안내 문자 발송</h3>
                  <span id="ord-sms-patient-title" style="font-size:12px; color:#64748b; font-weight:700;">-</span>
                </div>
              </div>
              <button type="button" onclick="PatientOrdersModule.closeSmsModal()" style="background:#f1f5f9; border:none; width:30px; height:30px; border-radius:50%; font-size:15px; color:#64748b; cursor:pointer;">&times;</button>
            </div>

            <div style="margin-bottom:14px;">
              <label style="display:block; font-size:12.5px; font-weight:800; color:#334155; margin-bottom:6px;">발송할 문자 문구 (편집 가능)</label>
              <textarea id="ord-sms-text" rows="5" style="width:100%; border:1.5px solid #cbd5e1; border-radius:12px; padding:12px; font-size:13px; font-weight:600; line-height:1.5; color:#1e293b; box-sizing:border-box; outline:none;"></textarea>
            </div>

            <div style="display:flex; flex-direction:column; gap:8px;">
              <button type="button" onclick="PatientOrdersModule.copySmsText()" class="w-full py-2.5 rounded-xl font-bold text-xs bg-teal-600 hover:bg-teal-500 text-white shadow-sm flex items-center justify-center gap-1.5 transition">
                <i class="fas fa-copy"></i> 📋 문자 문구 1초 복사하기
              </button>
              <a id="ord-sms-app-link" href="#" class="w-full py-2.5 rounded-xl font-bold text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 text-center flex items-center justify-center gap-1.5 transition">
                <i class="fas fa-sms"></i> 💬 스마트폰 문자(SMS) 앱 바로 열기
              </a>
              <button type="button" onclick="PatientOrdersModule.closeSmsModal()" class="w-full py-2 rounded-xl font-bold text-xs text-slate-400 hover:text-slate-600 text-center">
                닫기
              </button>
            </div>
          </div>
        </div>
      `;
    }

    function updatePayFields() {
      const typeRadio = document.querySelector('input[name="ord-paytype"]:checked');
      const payType = typeRadio ? typeRadio.value : 'PAID_FULL';
      const totalInput = document.getElementById('ord-total-price');
      const paidInput = document.getElementById('ord-paid-amount');
      const paidBox = document.getElementById('ord-paid-amount-box');

      if (payType === 'PAID_FULL') {
        if (paidBox) paidBox.style.display = 'none';
        if (paidInput && totalInput) paidInput.value = totalInput.value;
      } else if (payType === 'PAID_PARTIAL') {
        if (paidBox) paidBox.style.display = 'block';
      } else {
        if (paidBox) paidBox.style.display = 'none';
        if (paidInput) paidInput.value = '0';
      }
      calcTotal();
    }

    function calcTotal() {
      const total = Number(document.getElementById('ord-total-price')?.value) || 0;
      const typeRadio = document.querySelector('input[name="ord-paytype"]:checked');
      const payType = typeRadio ? typeRadio.value : 'PAID_FULL';
      const paidInput = document.getElementById('ord-paid-amount');
      
      let paid = 0;
      if (payType === 'PAID_FULL') {
        paid = total;
        if (paidInput) paidInput.value = total;
      } else if (payType === 'PAID_PARTIAL') {
        paid = Number(paidInput?.value) || 0;
      } else {
        paid = 0;
        if (paidInput) paidInput.value = 0;
      }

      const balance = Math.max(0, total - paid);
      const balanceEl = document.getElementById('ord-balance-text');
      if (balanceEl) {
        balanceEl.innerText = `₩ ${balance.toLocaleString()}원`;
      }
    }

    // ==========================================
    // 💾 데이터 저장 처리
    // ==========================================
    async function handleSubmit(e) {
      if (e) e.preventDefault();

      const liveBtn = document.getElementById('ord-submit-btn');
      if (liveBtn) {
        liveBtn.disabled = true;
        liveBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> 저장 중...';
      }

      try {
        const currUser = (window.SheetsSync && window.SheetsSync.getCurrentUser && window.SheetsSync.getCurrentUser()) || { name: '약국' };
        let uploadedUrls = [];

        // 사진 Cloudinary 업로드 (마스터 대원칙 제120조, 제133조)
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

        const patientName = (document.getElementById('ord-patient-name')?.value || '').trim();
        const phone = (document.getElementById('ord-phone')?.value || '').trim();
        const drugName = (document.getElementById('ord-drug-name')?.value || '').trim();
        const quantity = Number(document.getElementById('ord-quantity')?.value) || 1;
        const unit = document.getElementById('ord-unit')?.value || '통/병';
        const typeRadio = document.querySelector('input[name="ord-paytype"]:checked');
        const payType = typeRadio ? typeRadio.value : 'PAID_FULL';
        const totalPrice = Number(document.getElementById('ord-total-price')?.value) || 0;
        let paidAmount = Number(document.getElementById('ord-paid-amount')?.value) || 0;
        if (payType === 'PAID_FULL') paidAmount = totalPrice;
        if (payType === 'UNPAID') paidAmount = 0;
        const unpaidBalance = Math.max(0, totalPrice - paidAmount);
        const notes = (document.getElementById('ord-notes')?.value || '').trim();

        const newItem = {
          id: 'ord_' + nowMs,
          patientName,
          phone,
          drugName,
          quantity,
          unit,
          payType,
          totalPrice,
          paidAmount,
          unpaidBalance,
          notes,
          photos: uploadedUrls,
          photoUrl: uploadedUrls[0] || '',
          status: 'PENDING_ORDER', // 'PENDING_ORDER', 'ARRIVED', 'COMPLETED'
          registeredBy: currUser.name,
          updatedBy: currUser.name,
          updatedAt: nowMs,
          createdAt: nowMs,
          displayDate: nowStr
        };

        const list = getStorageData();
        list.unshift(newItem);
        saveStorageData(list);

        closeModal();
        resetPhoto();
        alert(`✅ [${patientName}] 님의 예약 주문이 성공적으로 접수되었습니다!`);
        render('module-content');

      } catch (err) {
        console.error("PatientOrdersModule handleSubmit error:", err);
        alert("⚠️ 예약 저장 중 오류가 발생했습니다: " + err.message);
      } finally {
        if (liveBtn) {
          liveBtn.disabled = false;
          liveBtn.innerHTML = '<i class="fas fa-save me-1"></i> 예약 접수 완료';
        }
      }
    }

    // ==========================================
    // ⚡ 3단계 상태 변경 파이프라인
    // ==========================================
    function updateStatus(id, newStatus) {
      const list = getStorageData();
      const target = list.find(i => String(i.id) === String(id));
      if (!target) return;

      target.status = newStatus;
      target.updatedAt = Date.now(); // 마스터 대원칙 제26조 타임스탬프 필수 갱신

      const currUser = (window.SheetsSync && window.SheetsSync.getCurrentUser && window.SheetsSync.getCurrentUser()) || { name: '약국' };
      target.updatedBy = currUser.name;

      saveStorageData(list);
      render('module-content');

      // 입고 완료 시 자동으로 안내 문자 팝업 띄우기
      if (newStatus === 'ARRIVED') {
        openSmsModal(id);
      }
    }

    // ==========================================
    // 💬 입고 안내 문자 모달 로직
    // ==========================================
    function openSmsModal(id) {
      const list = getStorageData();
      const target = list.find(i => String(i.id) === String(id));
      if (!target) return;

      const modal = document.getElementById('ord-sms-modal');
      const titleEl = document.getElementById('ord-sms-patient-title');
      const textEl = document.getElementById('ord-sms-text');
      const linkEl = document.getElementById('ord-sms-app-link');
      if (!modal || !textEl) return;

      if (titleEl) titleEl.innerText = `${target.patientName} 님 (${target.phone})`;

      let balanceMsg = '';
      if (target.unpaidBalance > 0) {
        balanceMsg = `\n(남은 결제 잔액: ₩${target.unpaidBalance.toLocaleString()}원)`;
      } else {
        balanceMsg = `\n(결제 완료 건입니다)`;
      }

      const smsContent = `[신세계약국 안내]\n안녕하세요, ${target.patientName}님!\n주문 예약하신 [${target.drugName}]이 약국에 입고 완료되었습니다.\n편하신 시간에 내방하시어 수령해 주시기 바랍니다.${balanceMsg}\n\n감사합니다.`;

      textEl.value = smsContent;

      // 모바일 문자 앱 직통 링크 세팅 (sms:phone?body=...)
      if (linkEl) {
        const cleanPhone = (target.phone || '').replace(/[^0-9]/g, '');
        const encodedBody = encodeURIComponent(smsContent);
        linkEl.href = `sms:${cleanPhone}?body=${encodedBody}`;
      }

      modal.style.display = 'flex';
    }

    function closeSmsModal() {
      const modal = document.getElementById('ord-sms-modal');
      if (modal) modal.style.display = 'none';
    }

    function copySmsText() {
      const textEl = document.getElementById('ord-sms-text');
      if (!textEl) return;

      textEl.select();
      textEl.setSelectionRange(0, 99999);
      navigator.clipboard.writeText(textEl.value).then(() => {
        alert('📋 문자 문구가 클립보드에 복사되었습니다!\n손님 문자창에 붙여넣기(Ctrl+V)하여 발송하세요.');
      }).catch(() => {
        document.execCommand('copy');
        alert('📋 문자 문구가 복사되었습니다.');
      });
    }

    function deleteItem(id, name) {
      const currUser = (window.SheetsSync && window.SheetsSync.getCurrentUser && window.SheetsSync.getCurrentUser()) || {};
      const isDirector = currUser.role === '약국장' || currUser.id === 'emp_1';

      if (!isDirector) {
        alert('🔒 예약 주문 삭제는 약국장 전용 권한입니다.');
        return;
      }

      if (!confirm(`🗑️ [${name}] 님의 예약 주문 내역을 정말로 삭제하시겠습니까?\n(삭제 후 클라우드에서도 함께 제거됩니다)`)) {
        return;
      }

      let list = getStorageData();
      list = list.filter(i => String(i.id) !== String(id));

      if (window.SheetsSync && typeof window.SheetsSync.addDeletedId === 'function') {
        window.SheetsSync.addDeletedId(id);
      }

      saveStorageData(list);
      render('module-content');
    }

    function handleSearch(val) {
      searchQuery = val;
      const clearBtn = document.getElementById('ord-search-clear-btn');
      if (clearBtn) clearBtn.style.display = val ? 'block' : 'none';

      const grid = document.getElementById('ord-card-grid-container');
      if (grid) {
        grid.innerHTML = renderCardGridHTML(getStorageData());
      } else {
        render();
      }
    }

    function setFilter(filter) {
      activeFilter = filter;
      render('module-content');
    }

    function openCreateModal() {
      selectedPhotos = [];
      const overlay = document.getElementById('ord-modal-overlay');
      if (overlay) overlay.style.display = 'flex';
      updatePayFields();
    }

    function closeModal() {
      const overlay = document.getElementById('ord-modal-overlay');
      if (overlay) overlay.style.display = 'none';
      resetPhoto();
    }

    function openPhoto(id, initialIdx = 0) {
      try {
        const list = getStorageData();
        const target = list.find(i => String(i.id) === String(id));
        if (!target) return;

        const allPhotos = (target.photos && Array.isArray(target.photos) && target.photos.length > 0)
          ? target.photos
          : (target.photoUrl ? [target.photoUrl] : []);

        if (allPhotos.length > 0 && window.App && typeof window.App.openImageLightbox === 'function') {
          window.App.openImageLightbox(allPhotos, target.patientName + ' 예약 사진', initialIdx);
        }
      } catch (e) {
        console.warn('openPhoto error:', e);
      }
    }

    // 0.1초 실시간 클라우드 리스너 연동 (마스터 대원칙 제7조)
    if (typeof window !== 'undefined') {
      window.addEventListener('ssg_cloud_updated', () => {
        const active = window.App && typeof window.App.getActiveModule === 'function' ? window.App.getActiveModule() : '';
        if (active === 'patient-orders') {
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
      setFilter,
      handleSearch,
      openCreateModal,
      closeModal,
      handlePhotoSelect,
      removePhoto,
      resetPhoto,
      handleSubmit,
      updatePayFields,
      calcTotal,
      updateStatus,
      openSmsModal,
      closeSmsModal,
      copySmsText,
      deleteItem,
      openPhoto
    };
  })();
}
