/**
 * 📋 환자 예약 주문 & 처방약 미출약 & 고객 안내 문자 통합 모듈 (Patient Orders & Shortages & SMS Module)
 * 365메가스타약국 HR/OPS 마스터 개발 가이드라인 완벽 준수
 * 
 * [서브탭 1: 💊 처방약 미출약 관리] (5단계 파이프라인)
 * - 1. 미출 접수 ➔ 2. 주문 완료 ➔ 3. 조제 완료 ➔ 4. 수령 대기 ➔ 5. 수령 완료
 * - 환자명, 주민번호(마스킹), 연락처, 처방병원, 미출약품, 도매상 주문처, 보관위치, 수납상태
 * - 원터치 [✉️ 문자 발송] 클릭 시 고객 정보 및 템플릿 자동 프리필 연동
 * 
 * [서브탭 2: 📦 일반약·건기식 예약 주문] (기존 대장 고도화)
 * - 주문접수 ➔ 입고완료 ➔ 수령완료
 * - 완납/계약금/미결제 잔액 관리, 방문/택배 수령, 사진 첨부(카메라/갤러리)
 * 
 * [서브탭 3: 📨 고객 안내 문자 발송 센터] (상황별 6대 템플릿)
 * - 결제 누락(약값 입금), 비대면 처방, 처방약 조제완료, 미수령 약품보관, 주문약품 입고, 처방 미출약 조제완료, 직접 작성
 * - 고객명, 휴대폰번호, 계좌/금액 실시간 자동 치환 및 미리보기
 * - 문자앱 발송, 문구 복사, 카카오톡 공유, 최근 발송 이력 실시간 관리
 */
if (typeof window.PatientOrdersModule === 'undefined') {
  window.PatientOrdersModule = (function () {
    // 🎯 활성 서브탭 ('SHORTAGE' | 'ORDER' | 'SMS')
    let activeSubTab = 'SHORTAGE';

    // 🔍 검색어 및 필터 상태
    let shortageFilter = 'ALL';   // 'ALL', 'PENDING_ORDER', 'ORDERED', 'PREPARED', 'AWAITING_PICKUP', 'COMPLETED'
    let orderFilter = 'ALL';      // 'ALL', 'PENDING_ORDER', 'ARRIVED', 'COMPLETED'
    let searchQuery = '';
    let selectedPhotos = [];      // [{ id, data, isNew }]

    // 📨 SMS 센터 상태
    let selectedTemplateKey = 'PAY_REQUEST'; // 기본 템플릿: 결제 누락(약값 입금)
    let smsRecipientName = '';
    let smsPhone = '';
    let smsCustomAmount = '';
    let smsDrugName = '';
    let smsLocation = '';
    let smsCustomMessage = '';
    let smsSelectedAccount = '기본계좌';

    // 🏢 약국 공식 정보 (신세계약국)
    const PHARMACY_INFO = {
      name: '신세계약국',
      phone: '031-852-2212',
      bankName: '기업은행',
      accountNumber: '01-0648-34342',
      accountHolder: '문성도',
      lunchTime: '1~2시',
      closeTime: '저녁 8시'
    };

    // 📨 6+1 상황별 공식 문자 템플릿 정의
    const SMS_TEMPLATES = {
      PAY_REQUEST: {
        key: 'PAY_REQUEST',
        title: '약값 계좌 입금 요청',
        badge: '결제 누락',
        badgeColor: 'bg-rose-500 text-white',
        desc: '계좌 입금 요청 및 사과 안내',
        template: `[신세계약국]
{고객명}님, 안녕하세요. 아래 계좌로 입금 부탁드립니다. 불편을 드려 죄송합니다.
■ 입금 계좌: {계좌정보}
■ 입금 금액: {입금금액}원
(문의: 031-852-2212)`
      },
      UNTACT_RX: {
        key: 'UNTACT_RX',
        title: '비대면 처방 수령 안내',
        badge: '비대면 처방',
        badgeColor: 'bg-blue-600 text-white',
        desc: '비대면 조제 완료, 저녁 8시 마감 및 점심시간 제외 안내',
        template: `[신세계약국]
{고객명}님, 접수해주신 비대면 처방 조제가 완료되었습니다.
1~2시 점심시간은 피해서 방문해주시기 바랍니다.
■ 영업 마감: 저녁 8시
(문의: 031-852-2212)`
      },
      GENERAL_RX: {
        key: 'GENERAL_RX',
        title: '일반 조제약 준비 완료',
        badge: '처방약 조제',
        badgeColor: 'bg-emerald-600 text-white',
        desc: '일반 처방 조제 완료 및 수령 안내 (점심시간 제외)',
        template: `[신세계약국]
{고객명}님, 요청하신 처방 조제약이 준비 완료되었습니다.
편하신 시간에 약국으로 방문하여 수령하시기 바랍니다.
{보관위치안내}
■ 점심시간: 오후 1시 ~ 2시
(문의: 031-852-2212)`
      },
      SHORTAGE_RX: {
        key: 'SHORTAGE_RX',
        title: '처방 미출약 입고 및 조제 완료',
        badge: '처방 미출약',
        badgeColor: 'bg-teal-600 text-white',
        desc: '부족했던 처방약 입고 및 조제 완료 안내',
        template: `[신세계약국]
{고객명}님, 처방 조제 시 부족했던 약품({약품명})이 입고되어 조제가 완료되었습니다.
약국에 방문하셔서 수령해 주시기 바랍니다.
{보관위치안내}
(문의: 031-852-2212)`
      },
      WAITING_PICKUP: {
        key: 'WAITING_PICKUP',
        title: '미수령 약품 보관 안내',
        badge: '수령 대기',
        badgeColor: 'bg-amber-600 text-white',
        desc: '약국 보관 중인 미수령 약품 수령 안내',
        template: `[신세계약국]
{고객명}님, 약국에 보관 중인 미수령 약품({약품명})이 있습니다.
방문하시어 수령해 주시기 바랍니다.
■ 영업 시간: 평일 09:00 ~ 20:00
(문의: 031-852-2212)`
      },
      STOCK_ARRIVED: {
        key: 'STOCK_ARRIVED',
        title: '주문 약품/제품 입고',
        badge: '입고 안내',
        badgeColor: 'bg-indigo-600 text-white',
        desc: '주문 요청하신 의약품/건강식품 입고 안내',
        template: `[신세계약국]
{고객명}님, 주문 요청하신 {약품명} 제품이 약국에 입고되었습니다.
편하신 시간에 방문하셔서 수령하시기 바랍니다.
(문의: 031-852-2212)`
      },
      CUSTOM: {
        key: 'CUSTOM',
        title: '자유 서식 문자',
        badge: '직접 작성',
        badgeColor: 'bg-slate-700 text-white',
        desc: '사용자 직접 작성 맞춤 안내 문자',
        template: `[신세계약국]
{고객명}님, 안녕하세요. 
{직접입력내용}
(문의: 031-852-2212)`
      }
    };

    function escapeHTML(str) {
      if (!str) return '';
      return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    function formatPhone(str) {
      if (!str) return '';
      const clean = String(str).replace(/[^0-9]/g, '');
      if (clean.length === 11) {
        return clean.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
      } else if (clean.length === 10) {
        return clean.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3');
      }
      return clean;
    }

    function maskResidentId(str) {
      if (!str) return '';
      const clean = String(str).trim();
      if (!clean) return '';
      if (clean.includes('-')) {
        const parts = clean.split('-');
        const front = parts[0];
        const back = parts[1] || '';
        const backMasked = back.length > 0 ? (back[0] + '******') : '******';
        return `${front}-${backMasked}`;
      }
      if (clean.length >= 7) {
        return clean.substring(0, 6) + '-' + clean[6] + '******';
      }
      return clean;
    }

    function formatDate(val, fallbackStr) {
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

    // ==========================================
    // 📦 데이터 영구 저장소 (로컬 + SheetsSync 연동)
    // ==========================================
    // 1. 처방약 미출약 저장소
    function getShortagesData() {
      try {
        if (window.SheetsSync && typeof window.SheetsSync.getPrescriptionShortages === 'function') {
          return window.SheetsSync.getPrescriptionShortages();
        }
        const raw = localStorage.getItem('ssg_prescription_shortages_v1');
        return raw ? JSON.parse(raw) : [];
      } catch (e) {
        return [];
      }
    }

    function saveShortagesData(list) {
      try {
        if (window.SheetsSync && typeof window.SheetsSync.savePrescriptionShortages === 'function') {
          window.SheetsSync.savePrescriptionShortages(list);
          return;
        }
        localStorage.setItem('ssg_prescription_shortages_v1', JSON.stringify(list));
      } catch (e) {
        console.warn('saveShortagesData warning:', e);
      }
    }

    // 2. 일반약·건기식 예약 주문 저장소 (기존 100% 호환)
    function getOrdersData() {
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

    function saveOrdersData(list) {
      try {
        if (window.SheetsSync && typeof window.SheetsSync.savePatientOrders === 'function') {
          window.SheetsSync.savePatientOrders(list);
          return;
        }
        localStorage.setItem('ssg_patient_orders_v1', JSON.stringify(list));
      } catch (e) {
        console.warn('saveOrdersData warning:', e);
      }
    }

    // 3. 고객 안내 문자 발송 이력 저장소
    function getSmsHistoryData() {
      try {
        if (window.SheetsSync && typeof window.SheetsSync.getSmsDispatchHistory === 'function') {
          return window.SheetsSync.getSmsDispatchHistory();
        }
        const raw = localStorage.getItem('ssg_sms_dispatch_history_v1');
        return raw ? JSON.parse(raw) : [];
      } catch (e) {
        return [];
      }
    }

    function saveSmsHistoryData(list) {
      try {
        if (window.SheetsSync && typeof window.SheetsSync.saveSmsDispatchHistory === 'function') {
          window.SheetsSync.saveSmsDispatchHistory(list);
          return;
        }
        localStorage.setItem('ssg_sms_dispatch_history_v1', JSON.stringify(list));
      } catch (e) {
        console.warn('saveSmsHistoryData warning:', e);
      }
    }

    // ==========================================
    // 📸 사진 압축 및 프리뷰 관리 (일반약 예약용)
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
          const compressed = await compressPhotoFile(file);
          if (compressed) {
            selectedPhotos.push({
              id: 'p_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
              data: compressed,
              isNew: true
            });
          }
        } catch (err) {}
      }
      inputEl.value = '';
      renderPhotoPreviews();
    }

    function compressPhotoFile(file) {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
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
          };
          img.onerror = () => resolve('');
          img.src = e.target.result;
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
      const cam = document.getElementById('ord-photo-camera');
      const gal = document.getElementById('ord-photo-gallery');
      if (cam) cam.value = '';
      if (gal) gal.value = '';
      renderPhotoPreviews();
    }

    // ==========================================
    // 🎨 메인 뷰 렌더링
    // ==========================================
    function render(containerId) {
      const container = document.getElementById(containerId || 'module-content');
      if (!container) return;

      const shortages = getShortagesData();
      const orders = getOrdersData();
      const smsHistory = getSmsHistoryData();

      // 통계 지표 산출
      const pendingShortages = shortages.filter(s => s.status !== 'COMPLETED').length;
      const pendingOrders = orders.filter(o => o.status !== 'COMPLETED').length;

      const html = `
        <!-- 상단 모듈 헤더 -->
        <div class="module-header flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm mb-4">
          <div class="space-y-1">
            <h2 class="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2 flex-wrap">
              <i class="fas fa-clipboard-check text-teal-600"></i>
              <span>📋 환자 미출약 & 예약주문 & 고객안내</span>
              <span class="text-xs px-2.5 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 font-bold">
                신세계약국 스마트 케어
              </span>
            </h2>
            <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed break-keep">
              처방약 미출약 5단계 파이프라인 관리, 일반약·건기식 예약 주문, 상황별 고객 안내 문자 원터치 발송
            </p>
          </div>
          <div class="flex items-center gap-2 w-full sm:w-auto">
            ${activeSubTab === 'SHORTAGE' ? `
              <button type="button" class="flex-1 sm:flex-initial btn btn-primary font-bold text-xs px-3.5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white shadow-md transition flex items-center justify-center gap-1.5 whitespace-nowrap" onclick="PatientOrdersModule.openCreateShortageModal()">
                <i class="fas fa-plus-circle"></i>
                <span>+ 신규 처방 미출 등록</span>
              </button>
            ` : activeSubTab === 'ORDER' ? `
              <button type="button" class="flex-1 sm:flex-initial btn btn-primary font-bold text-xs px-3.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-md transition flex items-center justify-center gap-1.5 whitespace-nowrap" onclick="PatientOrdersModule.openCreateOrderModal()">
                <i class="fas fa-plus-circle"></i>
                <span>+ 새 일반약 예약 주문</span>
              </button>
            ` : `
              <button type="button" class="flex-1 sm:flex-initial btn btn-primary font-bold text-xs px-3.5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white shadow-md transition flex items-center justify-center gap-1.5 whitespace-nowrap" onclick="PatientOrdersModule.resetSmsForm()">
                <i class="fas fa-rotate-left"></i>
                <span>입력창 초기화</span>
              </button>
            `}
          </div>
        </div>

        <!-- 🏷️ 3대 통합 서브탭 바 -->
        <div class="bg-white dark:bg-slate-900 p-2 sm:p-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm mb-4">
          <div class="flex items-center gap-2 overflow-x-auto no-scrollbar">
            <!-- 서브탭 1: 처방약 미출약 관리 -->
            <button type="button" onclick="PatientOrdersModule.setSubTab('SHORTAGE')" class="flex-1 min-w-[160px] sm:min-w-[180px] px-3.5 py-2.5 rounded-xl text-xs font-black transition flex items-center justify-center gap-2 ${activeSubTab === 'SHORTAGE' ? 'bg-teal-600 text-white shadow-md' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'}">
              <i class="fas fa-pills"></i>
              <span>💊 처방약 미출약 관리</span>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-black ${pendingShortages > 0 ? (activeSubTab === 'SHORTAGE' ? 'bg-white text-teal-700' : 'bg-rose-500 text-white') : 'bg-slate-200 text-slate-700'}">${shortages.length}</span>
            </button>

            <!-- 서브탭 2: 일반약·건기식 예약 주문 -->
            <button type="button" onclick="PatientOrdersModule.setSubTab('ORDER')" class="flex-1 min-w-[160px] sm:min-w-[180px] px-3.5 py-2.5 rounded-xl text-xs font-black transition flex items-center justify-center gap-2 ${activeSubTab === 'ORDER' ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'}">
              <i class="fas fa-box-archive"></i>
              <span>📦 일반약 예약·선결제</span>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-black ${pendingOrders > 0 ? (activeSubTab === 'ORDER' ? 'bg-white text-indigo-700' : 'bg-rose-500 text-white') : 'bg-slate-200 text-slate-700'}">${orders.length}</span>
            </button>

            <!-- 서브탭 3: 고객 안내 문자 발송 센터 -->
            <button type="button" onclick="PatientOrdersModule.setSubTab('SMS')" class="flex-1 min-w-[160px] sm:min-w-[180px] px-3.5 py-2.5 rounded-xl text-xs font-black transition flex items-center justify-center gap-2 ${activeSubTab === 'SMS' ? 'bg-blue-600 text-white shadow-md' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'}">
              <i class="fas fa-paper-plane"></i>
              <span>📨 고객 안내 문자 발송</span>
              <span class="px-2 py-0.5 rounded-full text-[10px] font-black bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">${smsHistory.length}</span>
            </button>
          </div>
        </div>

        <!-- 뷰 컨텐츠 영역 -->
        <div id="subtab-content-container">
          ${activeSubTab === 'SHORTAGE' ? renderShortageViewHTML(shortages) :
            activeSubTab === 'ORDER' ? renderOrderViewHTML(orders) :
            renderSmsCenterViewHTML(smsHistory)}
        </div>

        <!-- 📝 모달 레이어 -->
        <div id="patient-orders-modal-root">
          ${renderShortageModalHTML()}
          ${renderOrderModalHTML()}
          ${renderOrderEditModalHTML()}
        </div>
      `;

      container.innerHTML = html;
    }

    // ==========================================
    // 💊 [서브탭 1] 처방약 미출약 관리 HTML 렌더러
    // ==========================================
    function renderShortageViewHTML(items) {
      // 5단계 카운트 계산
      const c1 = items.filter(i => i.status === 'PENDING_ORDER' || !i.status).length;
      const c2 = items.filter(i => i.status === 'ORDERED').length;
      const c3 = items.filter(i => i.status === 'PREPARED').length;
      const c4 = items.filter(i => i.status === 'AWAITING_PICKUP').length;
      const c5 = items.filter(i => i.status === 'COMPLETED').length;
      const activeCount = c1 + c2 + c3 + c4;

      let filtered = [...items];
      if (shortageFilter !== 'ALL') {
        filtered = filtered.filter(i => (i.status || 'PENDING_ORDER') === shortageFilter);
      }

      if (searchQuery.trim()) {
        const kw = searchQuery.trim().toLowerCase().replace(/\s+/g, '');
        filtered = filtered.filter(i => {
          const text = [i.patientName, i.phone, i.drugName, i.clinicName, i.notes, i.orderSupplier, i.storageLocation].join(' ').toLowerCase().replace(/\s+/g, '');
          return text.includes(kw);
        });
      }

      filtered.sort((a, b) => (Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0)));

      return `
        <!-- 상단 헤더 & 검색 바 -->
        <div class="bg-white dark:bg-slate-900 p-3.5 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm mb-4 space-y-3">
          <div class="flex items-center justify-between flex-wrap gap-2">
            <div class="flex items-center gap-2">
              <span class="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                <i class="fas fa-boxes-stacked text-teal-600"></i>
                <span>미출약 관리 파이프라인</span>
              </span>
              <span class="px-2 py-0.5 rounded-full text-xs font-bold bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 border border-teal-200">진행중 ${activeCount}건</span>
              <span class="text-xs text-slate-400">전체 ${items.length}건</span>
            </div>
          </div>

          <!-- 5단계 상태 파이프라인 카운터 칩 (사진 3 완벽 매칭) -->
          <div class="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1">
            <!-- 1. 미출 접수 -->
            <div onclick="PatientOrdersModule.setShortageFilter('PENDING_ORDER')" class="cursor-pointer p-3 rounded-xl border transition flex flex-col justify-between ${shortageFilter === 'PENDING_ORDER' ? 'bg-amber-100 border-amber-400 ring-2 ring-amber-500' : 'bg-amber-50/60 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/60 hover:bg-amber-100/70'}">
              <div class="flex items-center justify-between">
                <span class="text-[11px] font-bold text-amber-800 dark:text-amber-300">1. 미출 접수</span>
                <span class="text-base font-black text-amber-900 dark:text-amber-200">${c1}</span>
              </div>
              <span class="text-[10px] text-amber-700/80 dark:text-amber-400 mt-1">주문 필요 건</span>
            </div>

            <!-- 2. 주문 완료 -->
            <div onclick="PatientOrdersModule.setShortageFilter('ORDERED')" class="cursor-pointer p-3 rounded-xl border transition flex flex-col justify-between ${shortageFilter === 'ORDERED' ? 'bg-sky-100 border-sky-400 ring-2 ring-sky-500' : 'bg-sky-50/60 dark:bg-sky-950/20 border-sky-200 dark:border-sky-800/60 hover:bg-sky-100/70'}">
              <div class="flex items-center justify-between">
                <span class="text-[11px] font-bold text-sky-800 dark:text-sky-300">2. 주문 완료</span>
                <span class="text-base font-black text-sky-900 dark:text-sky-200">${c2}</span>
              </div>
              <span class="text-[10px] text-sky-700/80 dark:text-sky-400 mt-1">입고 및 조제 대기</span>
            </div>

            <!-- 3. 조제 완료 -->
            <div onclick="PatientOrdersModule.setShortageFilter('PREPARED')" class="cursor-pointer p-3 rounded-xl border transition flex flex-col justify-between ${shortageFilter === 'PREPARED' ? 'bg-purple-100 border-purple-400 ring-2 ring-purple-500' : 'bg-purple-50/60 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800/60 hover:bg-purple-100/70'}">
              <div class="flex items-center justify-between">
                <span class="text-[11px] font-bold text-purple-800 dark:text-purple-300">3. 조제 완료</span>
                <span class="text-base font-black text-purple-900 dark:text-purple-200">${c3}</span>
              </div>
              <span class="text-[10px] text-purple-700/80 dark:text-purple-400 mt-1">보관함 보관중</span>
            </div>

            <!-- 4. 수령 대기 -->
            <div onclick="PatientOrdersModule.setShortageFilter('AWAITING_PICKUP')" class="cursor-pointer p-3 rounded-xl border transition flex flex-col justify-between ${shortageFilter === 'AWAITING_PICKUP' ? 'bg-teal-100 border-teal-400 ring-2 ring-teal-500' : 'bg-teal-50/60 dark:bg-teal-950/20 border-teal-200 dark:border-teal-800/60 hover:bg-teal-100/70'}">
              <div class="flex items-center justify-between">
                <span class="text-[11px] font-bold text-teal-800 dark:text-teal-300">4. 수령 대기</span>
                <span class="text-base font-black text-teal-900 dark:text-teal-200">${c4}</span>
              </div>
              <span class="text-[10px] text-teal-700/80 dark:text-teal-400 mt-1">문자 발송 완료</span>
            </div>

            <!-- 5. 수령 완료 -->
            <div onclick="PatientOrdersModule.setShortageFilter('COMPLETED')" class="cursor-pointer p-3 rounded-xl border transition flex flex-col justify-between col-span-2 sm:col-span-1 ${shortageFilter === 'COMPLETED' ? 'bg-slate-200 border-slate-400 ring-2 ring-slate-500' : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 hover:bg-slate-100'}">
              <div class="flex items-center justify-between">
                <span class="text-[11px] font-bold text-slate-700 dark:text-slate-300">5. 수령 완료</span>
                <span class="text-base font-black text-slate-800 dark:text-slate-200">${c5}</span>
              </div>
              <span class="text-[10px] text-slate-500 dark:text-slate-400 mt-1">미출 해소 완료</span>
            </div>
          </div>

          <!-- 실시간 검색 및 필터 칩 -->
          <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div class="relative flex-grow">
              <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
              <input type="text" value="${escapeHTML(searchQuery)}" oninput="PatientOrdersModule.handleSearch(this.value)" placeholder="환자명, 전화번호, 처방약품명, 병원, 보관위치 검색..." class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl pl-8 pr-8 py-2 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-teal-500">
              <button onclick="PatientOrdersModule.handleSearch('')" style="display:${searchQuery ? 'block' : 'none'};" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs">✖</button>
            </div>
            <button onclick="PatientOrdersModule.setShortageFilter('ALL')" class="px-3 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap ${shortageFilter === 'ALL' ? 'bg-slate-800 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}">
              전체 보기 (${items.length})
            </button>
          </div>
        </div>

        <!-- 📦 미출약 카드 그리드 -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
          ${filtered.length === 0 ? `
            <div class="col-span-full bg-white dark:bg-slate-900 rounded-2xl p-8 sm:p-12 text-center border border-slate-200 dark:border-slate-800 space-y-3">
              <div class="text-4xl">💊</div>
              <h4 class="text-base font-bold text-slate-700 dark:text-slate-300">등록된 처방약 미출 내역이 없습니다.</h4>
              <p class="text-xs text-slate-400 max-w-sm mx-auto">상단의 <strong>[+ 신규 처방 미출 등록]</strong> 버튼을 눌러 부족했던 처방약 내역을 등록하세요.</p>
            </div>
          ` : filtered.map(item => renderShortageCard(item)).join('')}
        </div>
      `;
    }

    // 사진 3의 미출약 카드 상세 렌더링
    function renderShortageCard(item) {
      const status = item.status || 'PENDING_ORDER';
      const isCompleted = status === 'COMPLETED';

      // 5단계 상태 라벨 & 배지 색상
      const statusMeta = {
        PENDING_ORDER: { label: '1. 미출 접수', badge: 'bg-amber-100 text-amber-800 border-amber-300', btnText: '약품 주문 완료 처리 >', nextStatus: 'ORDERED' },
        ORDERED: { label: '2. 주문 완료', badge: 'bg-sky-100 text-sky-800 border-sky-300', btnText: '약입고 후 조제 완료 (보관 위치 기록) >', nextStatus: 'PREPARED' },
        PREPARED: { label: '3. 조제 완료', badge: 'bg-purple-100 text-purple-800 border-purple-300', btnText: '수령 대기 전환 (문자 발송) >', nextStatus: 'AWAITING_PICKUP' },
        AWAITING_PICKUP: { label: '4. 수령 대기', badge: 'bg-teal-100 text-teal-800 border-teal-300', btnText: '고객 수령 완료 처리 (미출 해소) >', nextStatus: 'COMPLETED' },
        COMPLETED: { label: '5. 수령 완료', badge: 'bg-slate-200 text-slate-700 border-slate-300', btnText: '✅ 수령 완료됨', nextStatus: null }
      }[status] || { label: '1. 미출 접수', badge: 'bg-amber-100 text-amber-800', btnText: '다음 단계 >', nextStatus: 'ORDERED' };

      // 결제 상태 라벨
      const payMeta = {
        UNPAID: { label: '미결제 (수령시 수납)', color: 'bg-rose-50 text-rose-700 border-rose-200' },
        PAID_FULL: { label: '선결제 완납', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
        BANK_TRANSFER: { label: '계좌입금 예정', color: 'bg-blue-50 text-blue-700 border-blue-200' }
      }[item.payType || 'UNPAID'] || { label: '미결제 (수령시 수납)', color: 'bg-rose-50 text-rose-700' };

      return `
        <div class="bg-white dark:bg-slate-900 rounded-2xl border ${isCompleted ? 'border-slate-200 dark:border-slate-800 opacity-80' : 'border-slate-300 dark:border-slate-700 shadow-sm'} p-4 flex flex-col justify-between space-y-3 transition hover:shadow-md">
          <!-- 카드 헤더 (상태 배지 & 결제 배지 & 액션) -->
          <div class="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2.5">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="text-xs font-black px-2.5 py-0.5 rounded-full border ${statusMeta.badge}">${statusMeta.label}</span>
              <span class="text-xs font-bold px-2 py-0.5 rounded-full border ${payMeta.color}">${payMeta.label}</span>
            </div>
            <div class="flex items-center gap-1 text-slate-400">
              <button onclick="PatientOrdersModule.openEditShortageModal('${item.id}')" title="수정" class="p-1 hover:text-teal-600 transition"><i class="fas fa-edit text-xs"></i></button>
              <button onclick="PatientOrdersModule.deleteShortage('${item.id}')" title="삭제" class="p-1 hover:text-rose-600 transition"><i class="fas fa-trash-alt text-xs"></i></button>
            </div>
          </div>

          <!-- 환자 정보 -->
          <div class="space-y-1">
            <div class="flex items-center justify-between">
              <span class="text-base font-black text-slate-900 dark:text-white">
                ${escapeHTML(item.patientName)} 
                <span class="text-xs font-medium text-slate-500 dark:text-slate-400">(${maskResidentId(item.residentId || item.birth)})</span>
              </span>
              ${item.clinicName ? `<span class="text-[11px] font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">🏥 ${escapeHTML(item.clinicName)}</span>` : ''}
            </div>
            <div class="text-xs font-bold text-teal-700 dark:text-teal-400 flex items-center gap-1">
              <i class="fas fa-phone-alt text-[10px]"></i>
              <a href="tel:${item.phone}" class="hover:underline">${formatPhone(item.phone)}</a>
            </div>
          </div>

          <!-- 미출 약품 내역 박스 -->
          <div class="bg-slate-50 dark:bg-slate-950 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
            <span class="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">미출 약품 내역</span>
            <div class="text-xs font-black text-slate-800 dark:text-slate-200 break-keep">
              ${escapeHTML(item.drugName)}
            </div>
          </div>

          <!-- 주문처 및 문서/처방일자 -->
          <div class="flex items-center gap-2 text-[11px] font-bold text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-950/60 p-2 rounded-lg border border-slate-100 dark:border-slate-800 flex-wrap">
            <span class="text-blue-700 dark:text-blue-400"><i class="fas fa-truck text-[10px]"></i> 주문처: ${escapeHTML(item.orderSupplier || '미지정')}</span>
            <span class="text-slate-300 dark:text-slate-700">|</span>
            <span>문서일: ${escapeHTML(item.rxDate || formatDate(item.createdAt, '').substring(0, 10))}</span>
          </div>

          <!-- 보관 위치 및 비고 -->
          <div class="space-y-1 text-xs">
            ${item.storageLocation ? `
              <div class="font-bold text-purple-700 dark:text-purple-400 flex items-center gap-1">
                <i class="fas fa-box-open text-[10px]"></i>
                <span>보관위치: <strong>${escapeHTML(item.storageLocation)}</strong></span>
              </div>
            ` : ''}
            ${item.notes ? `
              <div class="text-[11px] text-slate-500 dark:text-slate-400 bg-amber-50/50 dark:bg-amber-950/20 p-2 rounded-lg border border-amber-200/50 break-keep">
                <strong>비고:</strong> ${escapeHTML(item.notes)}
              </div>
            ` : ''}
          </div>

          <!-- 접수일 및 등록자 -->
          <div class="flex items-center justify-between text-[10px] font-bold text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800">
            <span>접수: ${formatDate(item.createdAt, '').substring(0, 10)}</span>
            <span>등록: ${escapeHTML(item.registeredBy || '직원')}</span>
          </div>

          <!-- 액션 버튼 영역 (다음 단계 진행 & 원터치 문자 발송) -->
          <div class="space-y-1.5 pt-1">
            ${statusMeta.nextStatus ? `
              <button onclick="PatientOrdersModule.updateShortageStatus('${item.id}', '${statusMeta.nextStatus}')" class="w-full py-2.5 px-3 rounded-xl bg-purple-700 hover:bg-purple-600 text-white font-extrabold text-xs shadow transition flex items-center justify-center gap-1.5">
                <span>${statusMeta.btnText}</span>
              </button>
            ` : ''}
            <div class="flex items-center gap-1.5">
              <button onclick="PatientOrdersModule.jumpToSmsFromShortage('${item.id}')" class="flex-1 py-2 px-3 rounded-xl bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-bold text-xs transition flex items-center justify-center gap-1">
                <i class="fas fa-envelope text-[11px]"></i>
                <span>안내문자 발송</span>
              </button>
              ${!isCompleted ? `
                <button onclick="PatientOrdersModule.updateShortageStatus('${item.id}', 'COMPLETED')" class="py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-bold text-xs transition whitespace-nowrap">
                  수령완료
                </button>
              ` : ''}
            </div>
          </div>
        </div>
      `;
    }

    // ==========================================
    // 📦 [서브탭 2] 일반약·건기식 예약 주문 HTML 렌더러 (기존 100% 호환)
    // ==========================================
    function renderOrderViewHTML(items) {
      const pendingOrderCount = items.filter(i => i.status === 'PENDING_ORDER' || !i.status).length;
      const arrivedCount = items.filter(i => i.status === 'ARRIVED').length;
      const completedCount = items.filter(i => i.status === 'COMPLETED').length;
      const totalUnpaidBalance = items
        .filter(i => i.status !== 'COMPLETED')
        .reduce((sum, item) => sum + (Number(item.unpaidBalance) || 0), 0);

      let filtered = [...items];
      if (orderFilter === 'PENDING_ORDER') filtered = filtered.filter(i => i.status === 'PENDING_ORDER' || !i.status);
      else if (orderFilter === 'ARRIVED') filtered = filtered.filter(i => i.status === 'ARRIVED');
      else if (orderFilter === 'COMPLETED') filtered = filtered.filter(i => i.status === 'COMPLETED');

      if (searchQuery.trim()) {
        const kw = searchQuery.trim().toLowerCase().replace(/\s+/g, '');
        filtered = filtered.filter(i => {
          const text = [i.patientName, i.phone, i.drugName, i.notes, i.registeredBy].join(' ').toLowerCase().replace(/\s+/g, '');
          return text.includes(kw);
        });
      }

      filtered.sort((a, b) => (Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0)));

      return `
        <!-- 상단 대시보드 요약 바 -->
        <div class="bg-white dark:bg-slate-900 p-3.5 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm mb-4 space-y-3">
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div class="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex flex-col justify-between">
              <span class="text-[11px] font-bold text-slate-500 dark:text-slate-400">총 누적 예약</span>
              <span class="text-lg font-black text-slate-800 dark:text-slate-200 mt-1">${items.length}건</span>
            </div>
            <div class="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 rounded-xl p-3 flex flex-col justify-between cursor-pointer" onclick="PatientOrdersModule.setOrderFilter('PENDING_ORDER')">
              <span class="text-[11px] font-bold text-amber-700 dark:text-amber-400">⏳ 1단계: 주문 접수/발주</span>
              <span class="text-lg font-black text-amber-900 dark:text-amber-200 mt-1">${pendingOrderCount}건</span>
            </div>
            <div class="bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800/80 rounded-xl p-3 flex flex-col justify-between cursor-pointer ${arrivedCount > 0 ? 'ring-2 ring-teal-500' : ''}" onclick="PatientOrdersModule.setOrderFilter('ARRIVED')">
              <span class="text-[11px] font-bold text-teal-700 dark:text-teal-400">📦 2단계: 약 도착 (미수령)</span>
              <span class="text-lg font-black text-teal-900 dark:text-teal-200 mt-1">${arrivedCount}건</span>
            </div>
            <div class="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/80 rounded-xl p-3 flex flex-col justify-between">
              <span class="text-[11px] font-bold text-rose-700 dark:text-rose-400">💰 미결제 잔액 총액</span>
              <span class="text-lg font-black text-rose-900 dark:text-rose-200 mt-1">₩ ${Math.round(totalUnpaidBalance).toLocaleString()}원</span>
            </div>
          </div>

          <!-- 검색창 및 상태 필터 칩 -->
          <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div class="relative flex-grow">
              <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
              <input type="text" value="${escapeHTML(searchQuery)}" oninput="PatientOrdersModule.handleSearch(this.value)" placeholder="환자명, 전화번호, 제품명, 메모 검색..." class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl pl-8 pr-8 py-2 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-indigo-500">
              <button onclick="PatientOrdersModule.handleSearch('')" style="display:${searchQuery ? 'block' : 'none'};" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs">✖</button>
            </div>
            <div class="flex items-center gap-1.5 overflow-x-auto no-scrollbar whitespace-nowrap">
              <button onclick="PatientOrdersModule.setOrderFilter('ALL')" class="px-3 py-1.5 rounded-full text-xs font-bold transition ${orderFilter === 'ALL' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}">전체 (${items.length})</button>
              <button onclick="PatientOrdersModule.setOrderFilter('PENDING_ORDER')" class="px-3 py-1.5 rounded-full text-xs font-bold transition ${orderFilter === 'PENDING_ORDER' ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600'}">1단계 발주대기 (${pendingOrderCount})</button>
              <button onclick="PatientOrdersModule.setOrderFilter('ARRIVED')" class="px-3 py-1.5 rounded-full text-xs font-bold transition ${orderFilter === 'ARRIVED' ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600'}">2단계 입고 (${arrivedCount})</button>
              <button onclick="PatientOrdersModule.setOrderFilter('COMPLETED')" class="px-3 py-1.5 rounded-full text-xs font-bold transition ${orderFilter === 'COMPLETED' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600'}">3단계 수령완료 (${completedCount})</button>
            </div>
          </div>
        </div>

        <!-- 예약 주문 카드 그리드 -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
          ${filtered.length === 0 ? `
            <div class="col-span-full bg-white dark:bg-slate-900 rounded-2xl p-8 sm:p-12 text-center border border-slate-200 dark:border-slate-800 space-y-3">
              <div class="text-4xl">📦</div>
              <h4 class="text-base font-bold text-slate-700 dark:text-slate-300">등록된 일반약 예약 건이 없습니다.</h4>
              <p class="text-xs text-slate-400 max-w-sm mx-auto">상단의 <strong>[+ 새 일반약 예약 주문]</strong> 버튼을 눌러 등록하세요.</p>
            </div>
          ` : filtered.map(item => renderOrderCard(item)).join('')}
        </div>
      `;
    }

    function renderOrderCard(item) {
      const status = item.status || 'PENDING_ORDER';
      const isCompleted = status === 'COMPLETED';
      const isArrived = status === 'ARRIVED';
      const allPhotos = (item.photos && Array.isArray(item.photos) && item.photos.length > 0) ? item.photos : (item.photoUrl ? [item.photoUrl] : []);
      const mainPhoto = allPhotos[0] || '';

      return `
        <div class="bg-white dark:bg-slate-900 rounded-2xl border ${isCompleted ? 'border-slate-200 dark:border-slate-800 opacity-80' : 'border-slate-300 dark:border-slate-700 shadow-sm'} p-4 flex flex-col justify-between space-y-3 transition hover:shadow-md">
          <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
            <span class="text-xs font-black px-2.5 py-0.5 rounded-full ${status === 'ARRIVED' ? 'bg-teal-600 text-white' : status === 'COMPLETED' ? 'bg-slate-600 text-white' : 'bg-amber-500 text-white'}">
              ${status === 'ARRIVED' ? '📦 2단계: 약 도착 (수령대기)' : status === 'COMPLETED' ? '✅ 3단계: 고객 수령완료' : '⏳ 1단계: 주문 접수/발주'}
            </span>
            <div class="flex items-center gap-1 text-slate-400">
              <button onclick="PatientOrdersModule.openEditOrderModal('${item.id}')" title="수정" class="p-1 hover:text-indigo-600 transition"><i class="fas fa-edit text-xs"></i></button>
              <button onclick="PatientOrdersModule.deleteOrder('${item.id}')" title="삭제" class="p-1 hover:text-rose-600 transition"><i class="fas fa-trash-alt text-xs"></i></button>
            </div>
          </div>

          <div class="space-y-1">
            <div class="flex items-center justify-between">
              <span class="text-base font-black text-slate-900 dark:text-white">${escapeHTML(item.patientName)}</span>
              <span class="text-xs font-bold text-slate-500">${item.deliveryType === 'PARCEL' ? '🚚 택배 배송' : '🏬 약국 방문 수령'}</span>
            </div>
            <div class="text-xs font-bold text-indigo-700 dark:text-indigo-400">
              <a href="tel:${item.phone}">${formatPhone(item.phone)}</a>
            </div>
          </div>

          <div class="bg-slate-50 dark:bg-slate-950 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
            <span class="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">주문 품목</span>
            <div class="text-xs font-black text-slate-800 dark:text-slate-200 break-keep">${escapeHTML(item.drugName)}</div>
          </div>

          <div class="flex items-center justify-between text-xs font-bold bg-slate-50 dark:bg-slate-950/60 p-2 rounded-lg border border-slate-100">
            <span>총액: ₩${Number(item.totalPrice || 0).toLocaleString()}원</span>
            <span class="${Number(item.unpaidBalance || 0) > 0 ? 'text-rose-600 font-black' : 'text-emerald-600'}">
              ${Number(item.unpaidBalance || 0) > 0 ? `미결제: ₩${Number(item.unpaidBalance).toLocaleString()}원` : '결제완료'}
            </span>
          </div>

          ${mainPhoto ? `
            <div class="flex items-center gap-2 cursor-pointer pt-1" onclick="PatientOrdersModule.openPhotoLightbox('${item.id}')">
              <img src="${mainPhoto}" class="w-12 h-12 object-cover rounded-lg border border-slate-200" />
              <span class="text-[11px] font-bold text-slate-500">📷 사진 ${allPhotos.length}장 첨부됨</span>
            </div>
          ` : ''}

          ${item.notes ? `<div class="text-[11px] text-slate-500 bg-amber-50/50 p-2 rounded-lg break-keep"><strong>메모:</strong> ${escapeHTML(item.notes)}</div>` : ''}

          <div class="space-y-1.5 pt-1">
            <div class="flex items-center gap-1.5">
              ${status === 'PENDING_ORDER' ? `
                <button onclick="PatientOrdersModule.updateOrderStatus('${item.id}', 'ARRIVED')" class="flex-1 py-2 px-3 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs transition">
                  📦 약 도착 처리
                </button>
              ` : status === 'ARRIVED' ? `
                <button onclick="PatientOrdersModule.updateOrderStatus('${item.id}', 'COMPLETED')" class="flex-1 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs transition">
                  ✅ 수령 완료 처리
                </button>
              ` : ''}
              <button onclick="PatientOrdersModule.jumpToSmsFromOrder('${item.id}')" class="flex-1 py-2 px-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold text-xs transition flex items-center justify-center gap-1">
                <i class="fas fa-envelope text-[11px]"></i>
                <span>고객 문자 발송</span>
              </button>
            </div>
          </div>
        </div>
      `;
    }

    // ==========================================
    // 📨 [서브탭 3] 고객 안내 문자 발송 센터 HTML (사진 1, 2, 4 완벽 구현)
    // ==========================================
    function renderSmsCenterViewHTML(history) {
      const resolvedMessage = resolveSmsTemplate();

      return `
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
          <!-- 좌측 컬럼: 1 상황별 템플릿 선택 + 2 받는 사람 정보 & 액션 (사진 1, 2) -->
          <div class="lg:col-span-7 space-y-4">
            <!-- 📞 발신 약국 정보 헤더 카드 -->
            <div class="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-900 dark:to-slate-800 p-4 rounded-2xl border border-blue-100 dark:border-slate-700 shadow-sm flex items-center justify-between gap-3">
              <div class="flex items-center gap-2.5">
                <div class="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md text-base">
                  <i class="fas fa-comment-dots"></i>
                </div>
                <div>
                  <h3 class="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <span>문자 발송하기</span>
                    <span class="text-[10px] px-2 py-0.5 rounded-full bg-blue-600 text-white font-bold">신세계약국</span>
                  </h3>
                  <p class="text-xs text-slate-500 dark:text-slate-400">약값 입금 요청, 비대면 처방 수령 등 고객 안내용 문자를 신속하게 작성하고 발송합니다.</p>
                </div>
              </div>
              <div class="text-right text-xs font-bold text-slate-700 dark:text-slate-300">
                <div class="text-blue-600 dark:text-blue-400 font-black">📞 발신 번호: 031-852-2212</div>
                <div class="text-[11px] text-slate-500">기업은행 01-0648-34342 (문성도)</div>
              </div>
            </div>

            <!-- 1. 상황별 템플릿 선택 (사진 1 & 2 드롭다운/칩) -->
            <div class="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
              <div class="flex items-center justify-between">
                <span class="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <span class="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-black flex items-center justify-center">1</span>
                  <span>상황별 템플릿 선택</span>
                </span>
                <span class="text-[11px] text-blue-600 dark:text-blue-400 font-bold">클릭 시 즉시 적용</span>
              </div>

              <!-- 템플릿 드롭다운 선택 상자 -->
              <div class="relative">
                <select id="sms-template-select" onchange="PatientOrdersModule.selectSmsTemplate(this.value)" class="w-full bg-slate-50 dark:bg-slate-950 border-2 border-blue-500 dark:border-blue-600 rounded-xl px-3.5 py-3 text-xs font-extrabold text-slate-900 dark:text-white outline-none cursor-pointer shadow-sm">
                  ${Object.values(SMS_TEMPLATES).map(tpl => `
                    <option value="${tpl.key}" ${tpl.key === selectedTemplateKey ? 'selected' : ''}>
                      [${tpl.badge}] ${tpl.title} - ${tpl.desc}
                    </option>
                  `).join('')}
                </select>
              </div>

              <!-- 빠른 원터치 템플릿 칩 바 (사진 2 템플릿 목록) -->
              <div class="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-1">
                ${Object.values(SMS_TEMPLATES).map(tpl => `
                  <button type="button" onclick="PatientOrdersModule.selectSmsTemplate('${tpl.key}')" class="p-2 rounded-xl border text-left transition flex items-center gap-1.5 ${selectedTemplateKey === tpl.key ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-500 ring-2 ring-blue-500/30 font-black' : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 hover:bg-slate-100'}">
                    <span class="text-[10px] px-1.5 py-0.5 rounded font-black ${tpl.badgeColor} whitespace-nowrap">${tpl.badge}</span>
                    <span class="text-[11px] truncate text-slate-800 dark:text-slate-200">${tpl.title}</span>
                  </button>
                `).join('')}
              </div>
            </div>

            <!-- 2. 받는 사람 정보 & 상황별 변수 입력 (사진 1) -->
            <div class="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <div class="flex items-center justify-between">
                <span class="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-2">
                  <span class="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] font-black flex items-center justify-center">2</span>
                  <span>받는 사람 정보 & 세부 변수</span>
                </span>
                <span class="text-[11px] px-2 py-0.5 rounded-full font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                  현재 선택: [${SMS_TEMPLATES[selectedTemplateKey]?.badge}]
                </span>
              </div>

              <div class="space-y-3">
                <!-- 받는 사람 이름 (고객명) -->
                <div>
                  <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    <i class="fas fa-user text-slate-400 mr-1"></i> 받는 사람 이름 (고객명) <span class="text-rose-500">*</span>
                  </label>
                  <input type="text" id="sms-input-name" value="${escapeHTML(smsRecipientName)}" oninput="PatientOrdersModule.handleSmsNameChange(this.value)" placeholder="예: 홍길동" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-blue-500">
                  <span class="text-[10px] text-slate-400 mt-0.5 block">* 이름을 입력하면 문구 내 '{고객명}님' 자리에 자동으로 반영됩니다.</span>
                </div>

                <!-- 휴대폰 번호 -->
                <div>
                  <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    <i class="fas fa-mobile-alt text-slate-400 mr-1"></i> 휴대폰 번호 <span class="text-rose-500">*</span>
                  </label>
                  <input type="tel" id="sms-input-phone" value="${escapeHTML(smsPhone)}" oninput="PatientOrdersModule.handleSmsPhoneChange(this.value)" placeholder="010-0000-0000" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-blue-500">
                </div>

                <!-- 상황별 변수 필드: [결제 누락] 일 때 -->
                ${selectedTemplateKey === 'PAY_REQUEST' ? `
                  <div class="bg-rose-50/60 dark:bg-rose-950/20 p-3.5 rounded-xl border border-rose-200 dark:border-rose-800/60 space-y-2.5">
                    <div class="flex items-center justify-between">
                      <label class="block text-xs font-black text-rose-800 dark:text-rose-300">
                        <i class="fas fa-won-sign mr-1"></i> 입금 요청 금액 (원) <span class="text-rose-500">*</span>
                      </label>
                      <span class="text-[10px] text-rose-600 font-bold">약국 공식 계좌 자동 안내</span>
                    </div>
                    <input type="text" id="sms-input-amount" value="${escapeHTML(smsCustomAmount)}" oninput="PatientOrdersModule.handleSmsAmountChange(this.value)" placeholder="예: 6,500" class="w-full bg-white dark:bg-slate-950 border border-rose-300 dark:border-rose-700 rounded-xl px-3.5 py-2.5 text-xs font-black text-rose-900 dark:text-rose-200 outline-none focus:border-rose-500">
                    <div class="flex items-center gap-1.5 flex-wrap">
                      <span class="text-[10px] font-bold text-slate-400">빠른 금액 선택:</span>
                      <button type="button" onclick="PatientOrdersModule.setAmountPreset(3000)" class="px-2 py-0.5 rounded-md bg-white border border-rose-200 text-[11px] font-bold text-rose-700 hover:bg-rose-100">+3,000원</button>
                      <button type="button" onclick="PatientOrdersModule.setAmountPreset(5000)" class="px-2 py-0.5 rounded-md bg-white border border-rose-200 text-[11px] font-bold text-rose-700 hover:bg-rose-100">+5,000원</button>
                      <button type="button" onclick="PatientOrdersModule.setAmountPreset(10000)" class="px-2 py-0.5 rounded-md bg-white border border-rose-200 text-[11px] font-bold text-rose-700 hover:bg-rose-100">+10,000원</button>
                      <button type="button" onclick="PatientOrdersModule.setAmountPreset(30000)" class="px-2 py-0.5 rounded-md bg-white border border-rose-200 text-[11px] font-bold text-rose-700 hover:bg-rose-100">+30,000원</button>
                    </div>
                    <div class="text-[11px] font-bold text-slate-600 dark:text-slate-400 pt-1">
                      계좌: 기업은행 01-0648-34342 (예금주: 문성도)
                    </div>
                  </div>
                ` : ''}

                <!-- 상황별 변수 필드: [약품명] 이 필요한 템플릿일 때 -->
                ${['SHORTAGE_RX', 'STOCK_ARRIVED', 'WAITING_PICKUP'].includes(selectedTemplateKey) ? `
                  <div>
                    <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      <i class="fas fa-pills text-slate-400 mr-1"></i> 약품/제품명 <span class="text-rose-500">*</span>
                    </label>
                    <input type="text" id="sms-input-drug" value="${escapeHTML(smsDrugName)}" oninput="PatientOrdersModule.handleSmsDrugChange(this.value)" placeholder="예: 트라젠타정 30일분 / 아로나민골드" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-blue-500">
                  </div>
                ` : ''}

                <!-- 상황별 변수 필드: [보관위치] 가 필요한 템플릿일 때 -->
                ${['GENERAL_RX', 'SHORTAGE_RX'].includes(selectedTemplateKey) ? `
                  <div>
                    <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      <i class="fas fa-map-pin text-slate-400 mr-1"></i> 약품 보관 위치 (선택)
                    </label>
                    <input type="text" id="sms-input-location" value="${escapeHTML(smsLocation)}" oninput="PatientOrdersModule.handleSmsLocationChange(this.value)" placeholder="예: A-1 보관함 / 조제실 냉장고 2번" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-blue-500">
                  </div>
                ` : ''}

                <!-- 상황별 변수 필드: [직접 작성] 템플릿일 때 -->
                ${selectedTemplateKey === 'CUSTOM' ? `
                  <div>
                    <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      <i class="fas fa-pen text-slate-400 mr-1"></i> 직접 입력 안내 문구 <span class="text-rose-500">*</span>
                    </label>
                    <textarea id="sms-input-custom" rows="4" oninput="PatientOrdersModule.handleSmsCustomMsgChange(this.value)" placeholder="전달하고자 하는 안내 내용을 자유롭게 입력하세요..." class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl p-3 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-blue-500">${escapeHTML(smsCustomMessage)}</textarea>
                  </div>
                ` : ''}
              </div>
            </div>
          </div>

          <!-- 우측 컬럼: 실시간 문자 미리보기 & 전송 액션 & 최근 발송 이력 (사진 1, 4) -->
          <div class="lg:col-span-5 space-y-4">
            <!-- 💬 실시간 문자 미리보기 (Preview) 박스 -->
            <div class="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
              <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
                <span class="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <i class="fas fa-mobile-screen-button text-blue-600"></i>
                  <span>문자 미리보기 (실시간 반영)</span>
                </span>
                <span class="text-[10px] font-bold text-slate-400">${calculateByteLength(resolvedMessage)} Bytes</span>
              </div>

              <!-- 스마트폰 메시지 버블 스타일 -->
              <div class="bg-slate-100 dark:bg-slate-950 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-inner">
                <div class="flex items-center justify-between text-[11px] font-extrabold text-slate-500 mb-2 px-1">
                  <span>📞 발신 번호: <strong class="text-blue-600 font-black">031-852-2212</strong></span>
                  <span>📱 수신 번호: <strong class="text-slate-800 dark:text-slate-200">${smsPhone || '미입력'}</strong></span>
                </div>
                <div class="bg-white dark:bg-slate-900 p-3.5 rounded-2xl rounded-tl-sm border border-slate-200 dark:border-slate-800 shadow-sm text-xs font-bold text-slate-900 dark:text-slate-100 leading-relaxed whitespace-pre-wrap font-sans">
${escapeHTML(resolvedMessage)}
                </div>
                <div class="text-right text-[10px] text-slate-400 font-bold mt-1.5">신세계약국 고객 알림 (발신: 031-852-2212)</div>
              </div>

              <!-- 🚀 4대 원터치 발송 & 공유 액션 버튼 바 -->
              <div class="space-y-2 pt-1">
                <button type="button" onclick="PatientOrdersModule.sendSmsViaApp()" class="w-full py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black text-xs shadow-lg transition flex items-center justify-center gap-2">
                  <i class="fas fa-paper-plane"></i>
                  <span>스마트폰 문자앱으로 발송하기</span>
                </button>

                <div class="grid grid-cols-2 gap-2">
                  <button type="button" onclick="PatientOrdersModule.copySmsTextToClipboard()" class="py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs transition flex items-center justify-center gap-1.5">
                    <i class="fas fa-copy text-slate-500"></i>
                    <span>문구 복사</span>
                  </button>
                  <button type="button" onclick="PatientOrdersModule.recordSmsDispatch(true)" class="py-2.5 px-3 rounded-xl bg-emerald-50 dark:bg-emerald-950 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-bold text-xs transition flex items-center justify-center gap-1.5">
                    <i class="fas fa-check-circle"></i>
                    <span>발송 이력 저장</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- 🕒 최근 발송 이력 (사진 4 완벽 구현) -->
            <div class="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
              <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2.5">
                <div class="flex items-center gap-2">
                  <span class="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <i class="fas fa-clock-rotate-left text-blue-600"></i>
                    <span>최근 발송 이력</span>
                  </span>
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-blue-950 text-blue-600">${history.length}건</span>
                </div>
                <span class="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                  <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>실시간 공유</span>
                </span>
              </div>

              <!-- 이력 카드 목록 (최신순) -->
              <div class="space-y-2.5 max-h-[500px] overflow-y-auto no-scrollbar">
                ${history.length === 0 ? `
                  <div class="p-6 text-center text-xs text-slate-400 font-bold space-y-1">
                    <i class="fas fa-inbox text-2xl mb-1 block"></i>
                    <span>최근 발송된 문자 이력이 없습니다.</span>
                  </div>
                ` : history.map(h => `
                  <div class="bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                    <div class="flex items-center justify-between text-xs">
                      <span class="font-black text-slate-900 dark:text-white">
                        ${escapeHTML(h.recipientName || '고객')}님 <span class="text-[11px] font-medium text-slate-500">(${formatPhone(h.phone)})</span>
                      </span>
                      <button onclick="PatientOrdersModule.deleteSmsHistory('${h.id}')" title="삭제" class="text-slate-400 hover:text-rose-500 text-xs">
                        <i class="fas fa-trash-alt"></i>
                      </button>
                    </div>

                    <div class="flex items-center gap-1.5 flex-wrap text-[10px] font-bold">
                      <span class="px-2 py-0.5 rounded-full ${h.badgeColor || 'bg-blue-100 text-blue-800'}">${escapeHTML(h.templateTitle || '안내문자')}</span>
                      <span class="text-slate-500"><i class="fas fa-user-circle"></i> ${escapeHTML(h.senderName || '직원')}</span>
                      <span class="text-slate-400 ml-auto">${formatDate(h.createdAt, '')}</span>
                    </div>

                    <!-- 실제 발송 문구 버블 -->
                    <div class="bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 text-[11px] text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-sans leading-relaxed">
${escapeHTML(h.content)}
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        </div>
      `;
    }

    // 템플릿 변수 치환기
    function resolveSmsTemplate() {
      const tplObj = SMS_TEMPLATES[selectedTemplateKey] || SMS_TEMPLATES.PAY_REQUEST;
      let text = tplObj.template;

      const cName = (smsRecipientName || '').trim() || '고객';
      text = text.replace(/{고객명}/g, cName);

      // 계좌 정보 치환
      const accInfo = `${PHARMACY_INFO.bankName} ${PHARMACY_INFO.accountNumber} (예금주: ${PHARMACY_INFO.accountHolder})`;
      text = text.replace(/{계좌정보}/g, accInfo);

      // 입금 금액 치환
      const amtStr = smsCustomAmount ? Number(String(smsCustomAmount).replace(/[^0-9]/g, '')).toLocaleString() : '0';
      text = text.replace(/{입금금액}/g, amtStr);

      // 약품명 치환
      const dName = (smsDrugName || '').trim() || '처방/주문 약품';
      text = text.replace(/{약품명}/g, dName);

      // 보관위치 치환
      if (smsLocation && smsLocation.trim()) {
        text = text.replace(/{보관위치안내}/g, `■ 보관 위치: ${smsLocation.trim()}`);
      } else {
        text = text.replace(/{보관위치안내}\n?/g, '');
      }

      // 직접입력내용 치환
      text = text.replace(/{직접입력내용}/g, (smsCustomMessage || '').trim() || '안내 말씀 드립니다.');

      // 약국 전화번호 치환
      text = text.replace(/{약국전화}/g, PHARMACY_INFO.phone);

      return text;
    }

    function calculateByteLength(str) {
      if (!str) return 0;
      let b = 0;
      for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        b += c >> 7 ? 2 : 1;
      }
      return b;
    }

    // ==========================================
    // 📝 [모달 1] 신규 처방 미출 등록 모달 (사진 3 대응)
    // ==========================================
    function renderShortageModalHTML() {
      const todayStr = new Date().toISOString().substring(0, 10);
      return `
        <div id="shortage-create-modal" style="display:none;" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 shadow-2xl space-y-4">
            <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 class="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <i class="fas fa-pills text-teal-600"></i>
                <span>+ 신규 처방 미출약 등록</span>
              </h3>
              <button type="button" onclick="PatientOrdersModule.closeCreateShortageModal()" class="text-slate-400 hover:text-slate-600 font-bold text-lg">✕</button>
            </div>

            <form onsubmit="PatientOrdersModule.handleShortageSubmit(event)" class="space-y-3.5">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">환자명 <span class="text-rose-500">*</span></label>
                  <input type="text" id="sh-input-patient" required placeholder="예: 최유림" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-teal-500">
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">주민번호 앞자리(생년월일)</label>
                  <input type="text" id="sh-input-resident" placeholder="예: 930529-2" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-teal-500">
                </div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">연락처 <span class="text-rose-500">*</span></label>
                  <input type="tel" id="sh-input-phone" required placeholder="010-0000-0000" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-teal-500">
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">처방 병의원</label>
                  <input type="text" id="sh-input-clinic" placeholder="예: 서울내과의원" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-teal-500">
                </div>
              </div>

              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">미출 약품 내역 <span class="text-rose-500">*</span></label>
                <textarea id="sh-input-drug" required rows="2" placeholder="예: 트라젠타정 30정 미출 / 전체 미출" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl p-2.5 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-teal-500"></textarea>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">주문처 (도매상)</label>
                  <select id="sh-input-supplier" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-teal-500">
                    <option value="동원">동원약품</option>
                    <option value="백제">백제약품</option>
                    <option value="지오영">지오영</option>
                    <option value="훼밀리">훼밀리팜</option>
                    <option value="자체">약국자체/인근약국</option>
                    <option value="기타">기타 주문처</option>
                  </select>
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">문서/처방일자</label>
                  <input type="date" id="sh-input-rxdate" value="${todayStr}" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-teal-500">
                </div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">결제 상태</label>
                  <select id="sh-input-paytype" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-teal-500">
                    <option value="UNPAID">미결제 (수령시 수납)</option>
                    <option value="PAID_FULL">선결제 완납</option>
                    <option value="BANK_TRANSFER">계좌입금 예정</option>
                  </select>
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">보관 위치 (입고 후 지정 가능)</label>
                  <input type="text" id="sh-input-location" placeholder="예: A-1 보관함 / 냉장고" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-teal-500">
                </div>
              </div>

              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">비고 / 전달사항 (방문예정일 등)</label>
                <input type="text" id="sh-input-notes" placeholder="예: 10.12 방문예정 / 가족 대리수령" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-teal-500">
              </div>

              <div class="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button type="button" onclick="PatientOrdersModule.closeCreateShortageModal()" class="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs">취소</button>
                <button type="submit" class="flex-1 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-black text-xs shadow-md">등록 완료</button>
              </div>
            </form>
          </div>
        </div>
      `;
    }

    // ==========================================
    // 📝 [모달 2] 일반약 예약 주문 신규 모달 (기존 보존)
    // ==========================================
    function renderOrderModalHTML() {
      return `
        <div id="ord-modal-overlay" style="display:none;" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 shadow-2xl space-y-4">
            <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 class="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <i class="fas fa-cart-plus text-indigo-600"></i>
                <span>+ 새 일반약 예약 주문 접수</span>
              </h3>
              <button type="button" onclick="PatientOrdersModule.closeOrderModal()" class="text-slate-400 hover:text-slate-600 font-bold text-lg">✕</button>
            </div>

            <form onsubmit="PatientOrdersModule.handleOrderSubmit(event)" class="space-y-3.5">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">손님 이름 <span class="text-rose-500">*</span></label>
                  <input type="text" id="ord-input-patient" required placeholder="예: 김철수" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-indigo-500">
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">휴대폰 번호 <span class="text-rose-500">*</span></label>
                  <input type="tel" id="ord-input-phone" required placeholder="010-0000-0000" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-indigo-500">
                </div>
              </div>

              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">예약 약품/제품명 <span class="text-rose-500">*</span></label>
                <input type="text" id="ord-input-drug" required placeholder="예: 아로나민골드 100정 x 2통" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-indigo-500">
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">수령 방식</label>
                  <select id="ord-input-delivery" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-indigo-500">
                    <option value="PICKUP">🏬 약국 방문 수령</option>
                    <option value="PARCEL">🚚 택배 배송</option>
                  </select>
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">결제 구분</label>
                  <select id="ord-input-paytype" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-indigo-500">
                    <option value="UNPAID">미결제 (방문시 결제)</option>
                    <option value="PAID_FULL">선결제 완납</option>
                    <option value="BANK_TRANSFER">계좌 입금 확인</option>
                  </select>
                </div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">약값 총액 (원)</label>
                  <input type="number" id="ord-input-price" value="0" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-indigo-500">
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">기결제/입금액 (원)</label>
                  <input type="number" id="ord-input-paid" value="0" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-indigo-500">
                </div>
              </div>

              <!-- 사진 첨부 영역 -->
              <div class="space-y-1.5 pt-1">
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300">📷 처방전/약곽 사진 첨부 (최대 5장)</label>
                <div class="flex items-center gap-2">
                  <label class="flex-1 py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-xs font-bold text-center cursor-pointer border border-dashed border-slate-300 dark:border-slate-700">
                    <i class="fas fa-camera mr-1"></i> 카메라 촬영
                    <input type="file" id="ord-photo-camera" accept="image/*" capture="environment" onchange="PatientOrdersModule.handlePhotoSelect(this)" class="hidden">
                  </label>
                  <label class="flex-1 py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-xs font-bold text-center cursor-pointer border border-dashed border-slate-300 dark:border-slate-700">
                    <i class="fas fa-image mr-1"></i> 갤러리 선택
                    <input type="file" id="ord-photo-gallery" accept="image/*" multiple onchange="PatientOrdersModule.handlePhotoSelect(this)" class="hidden">
                  </label>
                </div>
                <div id="ord-photo-preview-container" style="display:none;" class="pt-1">
                  <span id="ord-photo-count-text" class="text-[11px] font-bold text-slate-500 block mb-1"></span>
                  <div id="ord-photo-thumbnails-grid" class="flex items-center gap-2 overflow-x-auto pb-1"></div>
                </div>
              </div>

              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">특이사항 메모</label>
                <input type="text" id="ord-input-notes" placeholder="예: 택배 주소, 포장 요청 등" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white outline-none focus:border-indigo-500">
              </div>

              <div class="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button type="button" onclick="PatientOrdersModule.closeOrderModal()" class="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs">취소</button>
                <button type="submit" class="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs shadow-md">주문 등록</button>
              </div>
            </form>
          </div>
        </div>
      `;
    }

    // ==========================================
    // 📝 [모달 3] 일반약 예약 수정 모달 (기존 보존)
    // ==========================================
    function renderOrderEditModalHTML() {
      return `
        <div id="ord-edit-modal-overlay" style="display:none;" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 shadow-2xl space-y-4">
            <div class="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 class="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <i class="fas fa-edit text-indigo-600"></i>
                <span>예약 주문 수정</span>
              </h3>
              <button type="button" onclick="PatientOrdersModule.closeEditOrderModal()" class="text-slate-400 hover:text-slate-600 font-bold text-lg">✕</button>
            </div>
            <form onsubmit="PatientOrdersModule.handleEditOrderSubmit(event)" id="ord-edit-form" class="space-y-3.5">
              <input type="hidden" id="ord-edit-id">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">손님 이름</label>
                  <input type="text" id="ord-edit-patient" required class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white outline-none">
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">휴대폰 번호</label>
                  <input type="tel" id="ord-edit-phone" required class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white outline-none">
                </div>
              </div>
              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">약품/제품명</label>
                <input type="text" id="ord-edit-drug" required class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white outline-none">
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">총액</label>
                  <input type="number" id="ord-edit-price" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white outline-none">
                </div>
                <div>
                  <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">기결제액</label>
                  <input type="number" id="ord-edit-paid" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white outline-none">
                </div>
              </div>
              <div>
                <label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">메모</label>
                <input type="text" id="ord-edit-notes" class="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 dark:text-white outline-none">
              </div>
              <div class="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button type="button" onclick="PatientOrdersModule.closeEditOrderModal()" class="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs">취소</button>
                <button type="submit" class="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-black text-xs shadow-md">수정 저장</button>
              </div>
            </form>
          </div>
        </div>
      `;
    }

    // ==========================================
    // ⚙️ 이벤트 및 액션 핸들러
    // ==========================================
    function setSubTab(subTab, renderNow = true) {
      activeSubTab = subTab;
      if (renderNow) render('module-content');
    }

    function setShortageFilter(filter) {
      shortageFilter = filter;
      render('module-content');
    }

    function setOrderFilter(filter) {
      orderFilter = filter;
      render('module-content');
    }

    function handleSearch(q) {
      searchQuery = q || '';
      render('module-content');
    }

    // 처방 미출약 모달 컨트롤
    function openCreateShortageModal() {
      const modal = document.getElementById('shortage-create-modal');
      if (modal) modal.style.display = 'flex';
    }

    function closeCreateShortageModal() {
      const modal = document.getElementById('shortage-create-modal');
      if (modal) modal.style.display = 'none';
    }

    function handleShortageSubmit(e) {
      e.preventDefault();
      const patient = document.getElementById('sh-input-patient')?.value.trim();
      const resident = document.getElementById('sh-input-resident')?.value.trim();
      const phone = document.getElementById('sh-input-phone')?.value.trim();
      const clinic = document.getElementById('sh-input-clinic')?.value.trim();
      const drug = document.getElementById('sh-input-drug')?.value.trim();
      const supplier = document.getElementById('sh-input-supplier')?.value;
      const rxdate = document.getElementById('sh-input-rxdate')?.value;
      const paytype = document.getElementById('sh-input-paytype')?.value;
      const location = document.getElementById('sh-input-location')?.value.trim();
      const notes = document.getElementById('sh-input-notes')?.value.trim();

      if (!patient || !phone || !drug) {
        alert('환자명, 연락처, 미출 약품 내역을 모두 입력해주세요.');
        return;
      }

      const currUser = (window.SheetsSync && window.SheetsSync.getCurrentUser && window.SheetsSync.getCurrentUser()) || {};
      const newShortage = {
        id: 'sh_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        patientName: patient,
        residentId: resident,
        phone: formatPhone(phone),
        clinicName: clinic,
        drugName: drug,
        orderSupplier: supplier,
        rxDate: rxdate,
        payType: paytype,
        storageLocation: location,
        notes: notes,
        status: 'PENDING_ORDER',
        registeredBy: currUser.name || '직원',
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      const list = getShortagesData();
      list.unshift(newShortage);
      saveShortagesData(list);
      closeCreateShortageModal();
      render('module-content');
    }

    function updateShortageStatus(id, newStatus) {
      const list = getShortagesData();
      const target = list.find(i => String(i.id) === String(id));
      if (!target) return;

      target.status = newStatus;
      target.updatedAt = Date.now();
      saveShortagesData(list);
      render('module-content');
    }

    function deleteShortage(id) {
      if (!confirm('이 처방 미출 건을 삭제하시겠습니까?')) return;
      let list = getShortagesData();
      list = list.filter(i => String(i.id) !== String(id));
      saveShortagesData(list);
      render('module-content');
    }

    // 처방 미출약 카드에서 문자 발송으로 즉시 이동 (스마트 프리필)
    function jumpToSmsFromShortage(id) {
      const list = getShortagesData();
      const target = list.find(i => String(i.id) === String(id));
      if (!target) return;

      selectedTemplateKey = 'SHORTAGE_RX';
      smsRecipientName = target.patientName;
      smsPhone = target.phone;
      smsDrugName = target.drugName;
      smsLocation = target.storageLocation || '';
      activeSubTab = 'SMS';
      render('module-content');

      if (window.App && typeof window.App.showToast === 'function') {
        window.App.showToast(`✉️ ${target.patientName} 님의 처방 미출 안내문자 템플릿이 자동 세팅되었습니다!`);
      }
    }

    // 일반약 주문에서 문자 발송으로 즉시 이동
    function jumpToSmsFromOrder(id) {
      const list = getOrdersData();
      const target = list.find(i => String(i.id) === String(id));
      if (!target) return;

      selectedTemplateKey = Number(target.unpaidBalance || 0) > 0 ? 'PAY_REQUEST' : 'STOCK_ARRIVED';
      smsRecipientName = target.patientName;
      smsPhone = target.phone;
      smsDrugName = target.drugName;
      smsCustomAmount = String(target.unpaidBalance || 0);
      activeSubTab = 'SMS';
      render('module-content');

      if (window.App && typeof window.App.showToast === 'function') {
        window.App.showToast(`✉️ ${target.patientName} 님의 안내문자 템플릿이 자동 세팅되었습니다!`);
      }
    }

    // 일반약 주문 모달 컨트롤
    function openCreateOrderModal() {
      const modal = document.getElementById('ord-modal-overlay');
      if (modal) modal.style.display = 'flex';
      resetPhoto();
    }

    function closeOrderModal() {
      const modal = document.getElementById('ord-modal-overlay');
      if (modal) modal.style.display = 'none';
      resetPhoto();
    }

    function handleOrderSubmit(e) {
      e.preventDefault();
      const patient = document.getElementById('ord-input-patient')?.value.trim();
      const phone = document.getElementById('ord-input-phone')?.value.trim();
      const drug = document.getElementById('ord-input-drug')?.value.trim();
      const delivery = document.getElementById('ord-input-delivery')?.value;
      const paytype = document.getElementById('ord-input-paytype')?.value;
      const price = Number(document.getElementById('ord-input-price')?.value || 0);
      const paid = Number(document.getElementById('ord-input-paid')?.value || 0);
      const notes = document.getElementById('ord-input-notes')?.value.trim();

      if (!patient || !phone || !drug) {
        alert('환자명, 휴대폰 번호, 약품명을 입력하세요.');
        return;
      }

      const currUser = (window.SheetsSync && window.SheetsSync.getCurrentUser && window.SheetsSync.getCurrentUser()) || {};
      const newOrder = {
        id: 'ord_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        patientName: patient,
        phone: formatPhone(phone),
        drugName: drug,
        deliveryType: delivery,
        payType: paytype,
        totalPrice: price,
        paidAmount: paid,
        unpaidBalance: Math.max(0, price - paid),
        notes: notes,
        photos: selectedPhotos.map(p => p.data),
        status: 'PENDING_ORDER',
        registeredBy: currUser.name || '직원',
        createdAt: Date.now(),
        updatedAt: Date.now()
      };

      const list = getOrdersData();
      list.unshift(newOrder);
      saveOrdersData(list);
      closeOrderModal();
      render('module-content');
    }

    function updateOrderStatus(id, newStatus) {
      const list = getOrdersData();
      const target = list.find(i => String(i.id) === String(id));
      if (!target) return;

      target.status = newStatus;
      target.updatedAt = Date.now();
      saveOrdersData(list);
      render('module-content');
    }

    function deleteOrder(id) {
      if (!confirm('이 일반약 예약 건을 삭제하시겠습니까?')) return;
      let list = getOrdersData();
      list = list.filter(i => String(i.id) !== String(id));
      saveOrdersData(list);
      render('module-content');
    }

    function openEditOrderModal(id) {
      const list = getOrdersData();
      const target = list.find(i => String(i.id) === String(id));
      if (!target) return;

      document.getElementById('ord-edit-id').value = target.id;
      document.getElementById('ord-edit-patient').value = target.patientName || '';
      document.getElementById('ord-edit-phone').value = target.phone || '';
      document.getElementById('ord-edit-drug').value = target.drugName || '';
      document.getElementById('ord-edit-price').value = target.totalPrice || 0;
      document.getElementById('ord-edit-paid').value = target.paidAmount || 0;
      document.getElementById('ord-edit-notes').value = target.notes || '';

      const modal = document.getElementById('ord-edit-modal-overlay');
      if (modal) modal.style.display = 'flex';
    }

    function closeEditOrderModal() {
      const modal = document.getElementById('ord-edit-modal-overlay');
      if (modal) modal.style.display = 'none';
    }

    function handleEditOrderSubmit(e) {
      e.preventDefault();
      const id = document.getElementById('ord-edit-id')?.value;
      const list = getOrdersData();
      const target = list.find(i => String(i.id) === String(id));
      if (!target) return;

      target.patientName = document.getElementById('ord-edit-patient')?.value.trim();
      target.phone = formatPhone(document.getElementById('ord-edit-phone')?.value.trim());
      target.drugName = document.getElementById('ord-edit-drug')?.value.trim();
      target.totalPrice = Number(document.getElementById('ord-edit-price')?.value || 0);
      target.paidAmount = Number(document.getElementById('ord-edit-paid')?.value || 0);
      target.unpaidBalance = Math.max(0, target.totalPrice - target.paidAmount);
      target.notes = document.getElementById('ord-edit-notes')?.value.trim();
      target.updatedAt = Date.now();

      saveOrdersData(list);
      closeEditOrderModal();
      render('module-content');
    }

    function openPhotoLightbox(id) {
      const list = getOrdersData();
      const target = list.find(i => String(i.id) === String(id));
      if (!target || !target.photos || target.photos.length === 0) return;
      if (window.App && typeof window.App.openImageLightbox === 'function') {
        window.App.openImageLightbox(target.photos, target.patientName + ' 예약 사진', 0);
      }
    }

    // ==========================================
    // 📨 SMS 센터 입력 및 전송 액션
    // ==========================================
    function selectSmsTemplate(key) {
      selectedTemplateKey = key;
      render('module-content');
    }

    function handleSmsNameChange(val) {
      smsRecipientName = val;
      render('module-content');
    }

    function handleSmsPhoneChange(val) {
      smsPhone = formatPhone(val);
      const input = document.getElementById('sms-input-phone');
      if (input) input.value = smsPhone;
      render('module-content');
    }

    function handleSmsAmountChange(val) {
      smsCustomAmount = val;
      render('module-content');
    }

    function setAmountPreset(amt) {
      smsCustomAmount = String(amt);
      render('module-content');
    }

    function handleSmsDrugChange(val) {
      smsDrugName = val;
      render('module-content');
    }

    function handleSmsLocationChange(val) {
      smsLocation = val;
      render('module-content');
    }

    function handleSmsCustomMsgChange(val) {
      smsCustomMessage = val;
      render('module-content');
    }

    function resetSmsForm() {
      smsRecipientName = '';
      smsPhone = '';
      smsCustomAmount = '';
      smsDrugName = '';
      smsLocation = '';
      smsCustomMessage = '';
      render('module-content');
    }

    // 문자앱으로 직접 발송 (sms: 스킴)
    function sendSmsViaApp() {
      const phone = (smsPhone || '').replace(/[^0-9]/g, '');
      const msg = resolveSmsTemplate();

      if (!phone) {
        alert('수신자 휴대폰 번호를 입력하세요.');
        return;
      }

      // 발송 이력 자동 저장
      recordSmsDispatch(false);

      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      const delimiter = isIOS ? '&' : '?';
      const url = `sms:${phone}${delimiter}body=${encodeURIComponent(msg)}`;
      window.location.href = url;
    }

    function copySmsTextToClipboard() {
      const msg = resolveSmsTemplate();
      if (!msg) return;

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(msg).then(() => {
          alert('📋 문자 문구가 클립보드에 복사되었습니다!\n원하는 곳에 붙여넣기(Ctrl+V)하세요.');
        }).catch(() => {
          fallbackCopyText(msg);
        });
      } else {
        fallbackCopyText(msg);
      }
      recordSmsDispatch(false);
    }

    function fallbackCopyText(text) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try {
        document.execCommand('copy');
        alert('📋 문자 문구가 클립보드에 복사되었습니다!');
      } catch (e) {
        prompt('문구를 복사하세요:', text);
      }
      ta.remove();
    }

    function recordSmsDispatch(showAlert = true) {
      const phone = (smsPhone || '').trim();
      const msg = resolveSmsTemplate();
      if (!phone && !smsRecipientName) return;

      const currUser = (window.SheetsSync && window.SheetsSync.getCurrentUser && window.SheetsSync.getCurrentUser()) || {};
      const tplMeta = SMS_TEMPLATES[selectedTemplateKey] || SMS_TEMPLATES.PAY_REQUEST;

      const newEntry = {
        id: 'sms_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        recipientName: smsRecipientName || '고객',
        phone: formatPhone(phone),
        templateKey: selectedTemplateKey,
        templateTitle: tplMeta.title,
        badgeColor: tplMeta.badgeColor,
        content: msg,
        senderName: currUser.name || '직원',
        createdAt: Date.now()
      };

      const history = getSmsHistoryData();
      history.unshift(newEntry);
      if (history.length > 50) history.pop(); // 최대 50건 유지
      saveSmsHistoryData(history);

      if (showAlert) {
        alert('✅ 고객 발송 이력이 저장되었습니다!');
      }
      render('module-content');
    }

    function deleteSmsHistory(id) {
      if (!confirm('이 발송 이력을 삭제하시겠습니까?')) return;
      let history = getSmsHistoryData();
      history = history.filter(h => String(h.id) !== String(id));
      saveSmsHistoryData(history);
      render('module-content');
    }

    // 0.1초 실시간 클라우드 리스너 연동 (마스터 대원칙 제7조)
    if (typeof window !== 'undefined') {
      window.addEventListener('ssg_cloud_updated', () => {
        const active = window.App && typeof window.App.getActiveModule === 'function' ? window.App.getActiveModule() : '';
        if (active === 'patient-orders') {
          const anyModalOpen = Array.from(document.querySelectorAll('.modal-overlay, #shortage-create-modal, #ord-modal-overlay, #ord-edit-modal-overlay')).some(m => {
            const disp = window.getComputedStyle(m).display;
            return disp !== 'none' && disp !== '';
          });
          if (!anyModalOpen) {
            render('module-content');
          }
        }
      });
    }

    // ==========================================
    // 🌐 공개 인터페이스 (Public API)
    // ==========================================
    return {
      render,
      setSubTab,
      setShortageFilter,
      setOrderFilter,
      handleSearch,
      // 처방 미출약
      openCreateShortageModal,
      closeCreateShortageModal,
      handleShortageSubmit,
      updateShortageStatus,
      deleteShortage,
      jumpToSmsFromShortage,
      // 일반약 예약
      openCreateOrderModal,
      closeOrderModal,
      handleOrderSubmit,
      updateOrderStatus,
      deleteOrder,
      openEditOrderModal,
      closeEditOrderModal,
      handleEditOrderSubmit,
      openPhotoLightbox,
      handlePhotoSelect,
      removePhoto,
      jumpToSmsFromOrder,
      // SMS 센터
      selectSmsTemplate,
      handleSmsNameChange,
      handleSmsPhoneChange,
      handleSmsAmountChange,
      setAmountPreset,
      handleSmsDrugChange,
      handleSmsLocationChange,
      handleSmsCustomMsgChange,
      resetSmsForm,
      sendSmsViaApp,
      copySmsTextToClipboard,
      recordSmsDispatch,
      deleteSmsHistory
    };
  })();
}
