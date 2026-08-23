/**
 * 스마트장부 통합 모듈 (Smart Ledger Module for Shinsegae & Hoecheon & Megastar)
 * 일일정산(캘린더/온라인몰/시재) + 5단 월말결산 + 12M MA 소득추이통계 + 구글시트 1:1 양방향 실시간 동기화
 */
window.SmartLedgerModule = (function () {

  // 약국별 설정 프로필
  const PHARMACY_PROFILES = {
    'ssg': {
      key: 'ssg',
      name: '신세계약국',
      subtitle: '신세계약국 스마트 일일정산 & 월말결제 장부 시스템',
      storageKey: 'ssg_smart_ledger_v1',
      urlKey: 'ssg_gas_url',
      defaultUrl: 'https://script.google.com/macros/s/AKfycbxL7_u3l5j7hFpG8r4mB2vN9wK1qE6/exec'
    },
    'hoecheon': {
      key: 'hoecheon',
      name: '회천메디칼약국',
      subtitle: '회천메디칼약국 스마트 일일정산 & 월말결제 장부 시스템',
      storageKey: 'hoecheon_smart_ledger_v1',
      urlKey: 'hoecheon_gas_url',
      defaultUrl: 'https://script.google.com/macros/s/AKfycbzp29y7XW9iYV5qKqI1bK3G8l0O9eM/exec'
    }
  };

  let activePharmacyKey = 'ssg';
  let currentRoute = 'daily-settlement'; // 'daily-settlement', 'monthly-settlement', 'trends'
  let activeMonthlyTab = 0;
  let chartInstance = null;

  // 기본 서식 데이터 정의
  const DEFAULT_CASH_VENDORS = [
    { name: '백제약품', amount: 0, cell: 'V4' },
    { name: '신덕약품', amount: 0, cell: 'V5' },
    { name: '세화헬스케어', amount: 0, cell: 'V6' },
    { name: '지오영', amount: 0, cell: 'V7' },
    { name: '유화약품', amount: 0, cell: 'V8' },
    { name: '동원약품', amount: 0, cell: 'V9' },
    { name: '한미약품', amount: 0, cell: 'V10' },
    { name: '대웅제약', amount: 0, cell: 'V11' },
    { name: '보령제약', amount: 0, cell: 'V12' },
    { name: '종근당', amount: 0, cell: 'V13' },
    { name: '유한양행', amount: 0, cell: 'V14' },
    { name: '일동제약', amount: 0, cell: 'V15' },
    { name: '광동제약', amount: 0, cell: 'V16' },
    { name: 'HK이노엔', amount: 0, cell: 'V17' },
    { name: 'GC녹십자', amount: 0, cell: 'V18' },
    { name: 'JW중외제약', amount: 0, cell: 'V19' },
    { name: '동국제약', amount: 0, cell: 'V20' },
    { name: '동아제약', amount: 0, cell: 'V21' },
    { name: '신신제약', amount: 0, cell: 'V22' }
  ];

  const DEFAULT_CARD_VENDORS = [
    { name: '팜스넷', amount: 0, cell: 'Y4' },
    { name: '일동몰', amount: 0, cell: 'Y5' },
    { name: '더샵', amount: 0, cell: 'Y6' },
    { name: '유한양행', amount: 0, cell: 'Y7' },
    { name: '바로팜', amount: 0, cell: 'Y8' },
    { name: '한미약품', amount: 0, cell: 'Y9' },
    { name: '대웅더샵', amount: 0, cell: 'Y10' },
    { name: '보령제약', amount: 0, cell: 'Y11' },
    { name: '종근당몰', amount: 0, cell: 'Y12' },
    { name: '동아제약', amount: 0, cell: 'Y13' },
    { name: '광동몰', amount: 0, cell: 'Y14' },
    { name: '지오영몰', amount: 0, cell: 'Y15' },
    { name: '백제몰', amount: 0, cell: 'Y16' },
    { name: '복산나이스', amount: 0, cell: 'Y17' },
    { name: '메디스트림', amount: 0, cell: 'Y18' },
    { name: '약사공론몰', amount: 0, cell: 'Y19' },
    { name: '팜스메이트', amount: 0, cell: 'Y20' },
    { name: '데일리몰', amount: 0, cell: 'Y21' },
    { name: '메디컬몰', amount: 0, cell: 'Y22' },
    { name: 'K약품몰', amount: 0, cell: 'Y23' },
    { name: 'H몰', amount: 0, cell: 'Y24' }
  ];

  const DEFAULT_EMPLOYEES = [
    { name: '이슬약1', amount: 0, cell: 'X54' },
    { name: '유효정1', amount: 0, cell: 'X55' },
    { name: '강현정6', amount: 0, cell: 'X56' },
    { name: '윤세라6', amount: 0, cell: 'X57' },
    { name: '권명주5', amount: 0, cell: 'V54' },
    { name: '김배영5', amount: 0, cell: 'V55' },
    { name: '김동완5', amount: 0, cell: 'V56' },
    { name: '양윤지5', amount: 0, cell: 'V57' },
    { name: '김제희5', amount: 0, cell: 'V58' }
  ];

  const DEFAULT_UTILITIES = [
    { name: '집기세', amount: 0, cell: 'V69' },
    { name: '관리비', amount: 0, cell: 'V70' },
    { name: '캡스', amount: 0, cell: 'V71' },
    { name: '유비케어20', amount: 0, cell: 'V72' },
    { name: '토너비용', amount: 0, cell: 'V73' },
    { name: '세무사비1', amount: 0, cell: 'V74' },
    { name: '이디피27', amount: 0, cell: 'V75' },
    { name: '소득월액보험료', amount: 0, cell: 'X69' },
    { name: '건강보험료', amount: 0, cell: 'X70' },
    { name: '연금보험료', amount: 0, cell: 'X71' },
    { name: '고용보험료', amount: 0, cell: 'X72' },
    { name: '산재보험료', amount: 0, cell: 'X73' }
  ];

  const DEFAULT_DISCOUNTS = [
    { name: '동화약품', amount: 0, cell: 'P54' },
    { name: '유화메디칼', amount: 0, cell: 'P55' },
    { name: '하나', amount: 0, cell: 'P56' },
    { name: '동원약품', amount: 0, cell: 'P57' },
    { name: '훼밀리약품금융비용', amount: 0, cell: 'P58' },
    { name: '백제금융', amount: 0, cell: 'P59' },
    { name: '지오영금융', amount: 0, cell: 'P60' },
    { name: '동화에누리', amount: 0, cell: 'P61' },
    { name: '훼밀리약품에누리', amount: 0, cell: 'P62' },
    { name: '동화스피디', amount: 0, cell: 'P63' },
    { name: '위장관', amount: 0, cell: 'P64' },
    { name: '지오영에누리', amount: 0, cell: 'P65' }
  ];

  const DEFAULT_PHARM_TRADES = [
    { name: '희망메디칼', amount: 0, cell: 'P41' },
    { name: '다산메디칼', amount: 0, cell: 'P42' },
    { name: '연푸른', amount: 0, cell: 'P43' },
    { name: '녹십자약국', amount: 0, cell: 'P44' },
    { name: '기타 약국', amount: 0, cell: 'P45' }
  ];

  const DEFAULT_CARD_CASHBACKS = [
    { id: 'samsung', name: '삼성10/농협', spend: 0, rate: 1.5, cell: 'AA70' },
    { id: 'kb', name: '국민7/부산은행', spend: 0, rate: 1.5, cell: 'AA71' },
    { id: 'shinhan', name: '신한8/부산은행', spend: 0, rate: 1.5, cell: 'AA72' },
    { id: 'woori', name: '우리10/우리은행', spend: 0, rate: 1.7, cell: 'AA73' }
  ];

  const DEFAULT_SEVERANCES = [
    { name: '김배영 (251118)', amount: 0, cell: 'AA44' },
    { name: '김제희 (241101)', amount: 0, cell: 'AA45' },
    { name: '이승학 (2307)', amount: 256000, cell: 'AA46' },
    { name: '권명주 (240909)', amount: 0, cell: 'AA47' },
    { name: '양윤지 (231004)', amount: 0, cell: 'AA48' },
    { name: '김동완 (260301)', amount: 0, cell: 'AA49' },
    { name: '윤세라 (260301)', amount: 0, cell: 'AA50' }
  ];

  const AVAILABLE_MONTHS = ['2608', '2609', '2610', '2611', '2612', '2701', '2702'];

  // 메모리 데이터 저장소 객체
  const storeMap = {};

  function getStore(pKey = activePharmacyKey) {
    if (!storeMap[pKey]) {
      storeMap[pKey] = {
        pharmacyKey: pKey,
        currentYYMM: '2608',
        currentDate: '260823',
        availableMonths: [...AVAILABLE_MONTHS],
        dailyRecords: {},
        monthlyRecords: {}
      };
      loadStoreFromLocal(pKey);
    }
    return storeMap[pKey];
  }

  function getGasUrl(pKey = activePharmacyKey) {
    const prof = PHARMACY_PROFILES[pKey] || PHARMACY_PROFILES['ssg'];
    try {
      return localStorage.getItem(prof.urlKey) || prof.defaultUrl;
    } catch(e) {
      return prof.defaultUrl;
    }
  }

  function setGasUrl(pKey, url) {
    const prof = PHARMACY_PROFILES[pKey] || PHARMACY_PROFILES['ssg'];
    try {
      localStorage.setItem(prof.urlKey, url.trim());
    } catch(e) {}
  }

  function formatMoney(num) {
    const n = Math.round(Number(num) || 0);
    return n.toLocaleString('ko-KR');
  }

  function parseMoney(str) {
    if (typeof str === 'number') return Math.round(str) || 0;
    if (!str) return 0;
    const clean = String(str).replace(/[^0-9\-]/g, '');
    const val = parseInt(clean, 10);
    return isNaN(val) ? 0 : val;
  }

  function getDayOfWeek(dateStr) {
    if (!dateStr || dateStr.length < 6) return '';
    const yy = 2000 + parseInt(dateStr.substring(0, 2), 10);
    const mm = parseInt(dateStr.substring(2, 4), 10) - 1;
    const dd = parseInt(dateStr.substring(4, 6), 10);
    const d = new Date(yy, mm, dd);
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    return days[d.getDay()] || '';
  }

  function getDaysInMonth(yymm) {
    if (!yymm || yymm.length < 4) return 31;
    const yy = 2000 + parseInt(yymm.substring(0, 2), 10);
    const mm = parseInt(yymm.substring(2, 4), 10);
    return new Date(yy, mm, 0).getDate();
  }

  function getInitDaily(dateStr) {
    return {
      date: dateStr,
      dayOfWeek: getDayOfWeek(dateStr),
      salesCash: 0,
      salesCard: 0,
      salesRxFee: 0,
      salesPosOtc: 0,
      discount: 0,
      bankDeposit: 0,
      cashPurchases: 0,
      meals: 0,
      miscCard1: 0,
      miscCard2: 0,
      onlineCards: {
        bacchus: 0,
        pharmNet: 0,
        ildong: 0,
        theShop: 0,
        baroPharm: 0,
        hugel: 0
      },
      customMalls: [],
      actualCash: 0,
      prevVaultCash: 0,
      totalSales: 0,
      totalCardSales: 0,
      otcCalcSales: 0,
      posDiff: 0,
      otcDiscrepancy: 0,
      dailySurplus: 0,
      theoreticalVault: 0,
      vaultDifference: 0,
      onlineCardTotal: 0
    };
  }

  function calculateDaily(record) {
    record.dayOfWeek = getDayOfWeek(record.date);
    const cash = record.salesCash || 0;
    const card = record.salesCard || 0;
    const rx = record.salesRxFee || 0;
    const pos = record.salesPosOtc || 0;
    const disc = record.discount || 0;
    const bank = record.bankDeposit || 0;
    const buy = record.cashPurchases || 0;
    const meal = record.meals || 0;
    const mc1 = record.miscCard1 || 0;
    const mc2 = record.miscCard2 || 0;
    const prevCash = record.prevVaultCash || 0;
    const actualCash = record.actualCash || 0;

    record.totalSales = cash + card;
    record.totalCardSales = card;
    record.otcCalcSales = record.totalSales - rx;
    record.posDiff = record.otcCalcSales - pos;
    record.otcDiscrepancy = record.posDiff;

    let onlineSum = 0;
    if (record.onlineCards) {
      Object.values(record.onlineCards).forEach(v => onlineSum += (Number(v) || 0));
    }
    if (record.customMalls && Array.isArray(record.customMalls)) {
      record.customMalls.forEach(m => onlineSum += (Number(m.amount) || 0));
    }
    record.onlineCardTotal = onlineSum;

    record.dailySurplus = cash - (buy + meal + bank);
    record.theoreticalVault = prevCash + record.dailySurplus;
    record.vaultDifference = actualCash - record.theoreticalVault;
    return record;
  }

  function getInitMonthly(yymm) {
    return {
      yymm: yymm,
      incomeRxFee: 0,
      incomeCopay: 0,
      incomeNhisClaim: 0,
      incomeDiscount: 0,
      incomeNonCovered: 0,
      otcTotalSales: 0,
      otcDailyAvg: 0,
      otcMarginRate: 40,
      otcProfit: 0,
      theoreticalProfit: 0,
      grossIncome: 0,
      totalDiscounts: 0,
      totalPharmTrades: 0,
      totalCashback: 0,
      grossExpenses: 0,
      vendorCashTotal: 0,
      vendorCardTotal: 0,
      expPayroll: 0,
      expUtility: 0,
      expRent: 15070000,
      expOtherOperating: 0,
      expCardFee: 0,
      expFinance: 0,
      expPension: 340000,
      expSaving: 1000000,
      expYellowUmbrella: 400000,
      expSeverance: 0,
      expDining: 0,
      netSurplus: 0,
      cashVendors: JSON.parse(JSON.stringify(DEFAULT_CASH_VENDORS)),
      cardVendors: JSON.parse(JSON.stringify(DEFAULT_CARD_VENDORS)),
      employees: JSON.parse(JSON.stringify(DEFAULT_EMPLOYEES)),
      severances: JSON.parse(JSON.stringify(DEFAULT_SEVERANCES)),
      utilities: JSON.parse(JSON.stringify(DEFAULT_UTILITIES)),
      discounts: JSON.parse(JSON.stringify(DEFAULT_DISCOUNTS)),
      pharmTrades: JSON.parse(JSON.stringify(DEFAULT_PHARM_TRADES)),
      cardCashbacks: JSON.parse(JSON.stringify(DEFAULT_CARD_CASHBACKS)),
      otherOperatingItems: [
        { name: '식대 (카드)', amount: 0, cell: 'T69' },
        { name: '잡비 1 (현금)', amount: 500000, cell: 'T70' },
        { name: '잡비 2 (카드)', amount: 20000, cell: 'T71' },
        { name: '약국식대실비', amount: 30500, cell: 'T72' }
      ],
      financeItems: []
    };
  }

  function calculateMonthly(m, pKey = activePharmacyKey) {
    const store = getStore(pKey);
    let monthOtcTotal = 0;
    let daysWithRecords = 0;
    const daysCount = getDaysInMonth(m.yymm);

    for (let d = 1; d <= daysCount; d++) {
      const dateStr = `${m.yymm}${String(d).padStart(2, '0')}`;
      const dayRec = store.dailyRecords[dateStr];
      if (dayRec && (dayRec.salesCash > 0 || dayRec.salesCard > 0)) {
        monthOtcTotal += dayRec.otcCalcSales || 0;
        daysWithRecords++;
      }
    }

    if (monthOtcTotal > 0 || !m.otcTotalSales) {
      m.otcTotalSales = monthOtcTotal;
    }
    const divisor = daysWithRecords > 0 ? daysWithRecords : daysCount;
    m.otcDailyAvg = Math.round(m.otcTotalSales / divisor);

    const margin = m.otcMarginRate !== undefined ? m.otcMarginRate : 40;
    m.otcProfit = Math.round(m.otcTotalSales * (margin / 100));

    let sumDiscount = 0;
    (m.discounts || []).forEach(d => sumDiscount += (Number(d.amount) || 0));
    m.totalDiscounts = sumDiscount;

    let sumPharm = 0;
    (m.pharmTrades || []).forEach(p => sumPharm += (Number(p.amount) || 0));
    m.totalPharmTrades = sumPharm;

    let sumCashback = 0;
    (m.cardCashbacks || []).forEach(c => {
      const spend = Number(c.spend || c.amount) || 0;
      const rate = Number(c.rate) || 1.5;
      c.cashback = Math.round(spend * (rate / 100));
      sumCashback += c.cashback;
    });
    m.totalCashback = sumCashback;

    m.theoreticalProfit = (m.incomeRxFee || 0) + m.otcProfit + m.totalDiscounts + (m.incomeNonCovered || 0) + m.totalCashback;
    m.grossIncome = (m.otcTotalSales || 0) + (m.incomeCopay || 0) + (m.incomeNhisClaim || 0) + m.totalDiscounts + m.totalPharmTrades + (m.incomeDiscount || 0) + m.totalCashback;

    let sumCashV = 0;
    (m.cashVendors || []).forEach(v => sumCashV += (Number(v.amount) || 0));
    m.vendorCashTotal = sumCashV;

    let sumCardV = 0;
    (m.cardVendors || []).forEach(v => sumCardV += (Number(v.amount) || 0));
    m.vendorCardTotal = sumCardV;

    let sumEmp = 0;
    (m.employees || []).forEach(e => sumEmp += (Number(e.amount) || 0));
    m.expPayroll = sumEmp;

    let sumSev = 0;
    (m.severances || []).forEach(s => sumSev += (Number(s.amount) || 0));
    m.expSeverance = sumSev;

    let sumUtil = 0;
    (m.utilities || []).forEach(u => sumUtil += (Number(u.amount) || 0));
    m.expUtility = sumUtil;

    let sumOtherOp = 0;
    (m.otherOperatingItems || []).forEach(o => sumOtherOp += (Number(o.amount) || 0));
    m.expOtherOperating = sumOtherOp;

    let sumFin = 0;
    (m.financeItems || []).forEach(f => sumFin += (Number(f.amount) || 0));
    m.expFinance = sumFin;

    m.grossExpenses = m.vendorCashTotal + m.vendorCardTotal + m.expPayroll + m.expUtility + (m.expRent || 0) + m.expOtherOperating + (m.expCardFee || 0) + m.expFinance + (m.expPension || 0) + (m.expSaving || 0) + (m.expYellowUmbrella || 0) + m.expSeverance;
    m.netSurplus = m.grossIncome - m.grossExpenses;
    return m;
  }

  function loadStoreFromLocal(pKey) {
    const prof = PHARMACY_PROFILES[pKey] || PHARMACY_PROFILES['ssg'];
    try {
      const raw = localStorage.getItem(prof.storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          storeMap[pKey] = Object.assign(storeMap[pKey] || {}, parsed);
        }
      }
    } catch(e) {}
  }

  function saveStoreToLocal(pKey = activePharmacyKey) {
    const prof = PHARMACY_PROFILES[pKey] || PHARMACY_PROFILES['ssg'];
    const store = getStore(pKey);
    try {
      localStorage.setItem(prof.storageKey, JSON.stringify({
        currentYYMM: store.currentYYMM,
        currentDate: store.currentDate,
        availableMonths: store.availableMonths,
        dailyRecords: store.dailyRecords,
        monthlyRecords: store.monthlyRecords
      }));
    } catch(e) {}
  }

  // UI 렌더링 엔진
  function render(containerId, pKey = activePharmacyKey) {
    activePharmacyKey = pKey;
    const container = document.getElementById(containerId);
    if (!container) return;

    const prof = PHARMACY_PROFILES[pKey] || PHARMACY_PROFILES['ssg'];
    const store = getStore(pKey);

    container.innerHTML = `
      <div class="smart-ledger-wrapper bg-slate-950 text-slate-100 min-h-screen p-3 md:p-6 rounded-2xl shadow-2xl space-y-6 font-sans">
        <!-- 상단 헤더 영역 -->
        <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/90 p-4 md:p-5 rounded-2xl border border-slate-800 shadow-xl">
          <div class="flex items-center gap-3">
            <div class="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center text-slate-950 font-black text-xl shadow-lg">
              💊
            </div>
            <div>
              <div class="flex items-center gap-2">
                <h2 class="text-lg md:text-xl font-black text-white">${prof.name} 스마트장부</h2>
                <span class="text-[10px] bg-emerald-500/20 text-emerald-400 font-bold px-2 py-0.5 rounded-full border border-emerald-500/40">1:1 실시간 연동</span>
              </div>
              <p class="text-xs text-slate-400">${prof.subtitle}</p>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <!-- 월 선택 셀렉터 -->
            <div class="bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-700 text-xs flex items-center gap-1.5">
              <i class="fas fa-calendar-alt text-amber-400"></i>
              <select onchange="SmartLedgerModule.handleMonthChange(this.value)" class="bg-transparent text-white font-bold outline-none cursor-pointer">
                ${store.availableMonths.map(m => `
                  <option value="${m}" ${m === store.currentYYMM ? 'selected' : ''} class="bg-slate-900 text-white">
                    20${m.substring(0,2)}년 ${m.substring(2,4)}월 (${m})
                  </option>
                `).join('')}
              </select>
            </div>

            <!-- 시트 실시간 동기화 버튼 -->
            <button onclick="SmartLedgerModule.syncWithSheets()" class="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/40 text-xs font-bold flex items-center gap-1.5 transition shadow-sm">
              <i class="fas fa-sync-alt" id="sl-sync-spin"></i>
              <span>시트 동기화</span>
            </button>

            <!-- 시트 설정 버튼 -->
            <button onclick="SmartLedgerModule.showSettingsModal()" class="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition" title="구글 시트 연동 설정">
              <i class="fas fa-cog text-amber-400"></i>
            </button>
          </div>
        </div>

        <!-- 메인 3대 네비게이션 (일일정산 / 월말결산 / 소득추이통계) -->
        <div class="flex bg-slate-900/60 p-1.5 rounded-2xl border border-slate-800 gap-2 overflow-x-auto">
          <button onclick="SmartLedgerModule.navigateTo('daily-settlement')" class="px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition whitespace-nowrap ${currentRoute === 'daily-settlement' ? 'bg-amber-500 text-slate-950 font-black shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'}">
            <i class="fas fa-calculator"></i>
            <span>일일 정산 (일일장부)</span>
          </button>
          <button onclick="SmartLedgerModule.navigateTo('monthly-settlement')" class="px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition whitespace-nowrap ${currentRoute === 'monthly-settlement' ? 'bg-amber-500 text-slate-950 font-black shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'}">
            <i class="fas fa-receipt"></i>
            <span>월말 결산 (월간금전출납부)</span>
          </button>
          <button onclick="SmartLedgerModule.navigateTo('trends')" class="px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition whitespace-nowrap ${currentRoute === 'trends' ? 'bg-amber-500 text-slate-950 font-black shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-800'}">
            <i class="fas fa-chart-line"></i>
            <span>소득 추이 통계 (12M MA)</span>
          </button>
        </div>

        <!-- 본문 뷰포트 영역 -->
        <div id="sl-main-viewport"></div>
      </div>
    `;

    renderViewport();
  }

  function renderViewport() {
    const vp = document.getElementById('sl-main-viewport');
    if (!vp) return;

    if (currentRoute === 'daily-settlement') {
      renderDailySettlement(vp);
    } else if (currentRoute === 'monthly-settlement') {
      renderMonthlySettlement(vp);
    } else if (currentRoute === 'trends') {
      renderTrends(vp);
    }
  }

  // 1. 일일 정산 화면 렌더링
  function renderDailySettlement(container) {
    const store = getStore();
    const curDate = store.currentDate;
    if (!store.dailyRecords[curDate]) {
      store.dailyRecords[curDate] = getInitDaily(curDate);
    }
    const rec = calculateDaily(store.dailyRecords[curDate]);
    const daysInMonth = getDaysInMonth(store.currentYYMM);

    container.innerHTML = `
      <div class="space-y-6 text-slate-100">
        <!-- 캘린더 날짜 바 -->
        <div class="bg-slate-900/90 p-3.5 rounded-2xl border border-slate-800 flex items-center gap-2 overflow-x-auto no-scrollbar">
          ${Array.from({ length: daysInMonth }, (_, i) => {
            const d = i + 1;
            const dateStr = `${store.currentYYMM}${String(d).padStart(2, '0')}`;
            const dow = getDayOfWeek(dateStr);
            const isSelected = dateStr === curDate;
            const isSun = dow === '일';
            const isSat = dow === '토';
            const dayColor = isSun ? 'text-rose-400' : isSat ? 'text-blue-400' : 'text-slate-400';

            return `
              <button 
                onclick="SmartLedgerModule.handleDateSelect('${dateStr}')"
                class="flex-shrink-0 w-12 py-2 rounded-xl text-center transition flex flex-col items-center justify-center border ${
                  isSelected 
                    ? 'bg-amber-500 text-slate-950 border-amber-400 font-black shadow-lg shadow-amber-500/20' 
                    : 'bg-slate-950/60 hover:bg-slate-800 border-slate-800/80 text-white'
                }"
              >
                <span class="text-[10px] font-bold ${isSelected ? 'text-slate-950' : dayColor}">${dow}</span>
                <span class="text-sm font-extrabold">${d}</span>
              </button>
            `;
          }).join('')}
        </div>

        <!-- 4대 요약 KPI 카드 -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="bg-slate-900/90 p-4 rounded-2xl border border-slate-800 shadow-md">
            <span class="text-xs text-slate-400 font-bold block mb-1">일일 총매출 (현금 + 카드)</span>
            <div class="text-2xl font-black text-amber-400">₩${formatMoney(rec.totalSales)}</div>
            <span class="text-[10px] text-slate-500">조제매출 ₩${formatMoney(rec.salesRxFee)} 포함</span>
          </div>

          <div class="bg-slate-900/90 p-4 rounded-2xl border border-slate-800 shadow-md">
            <span class="text-xs text-slate-400 font-bold block mb-1">일반약 산출매출</span>
            <div class="text-2xl font-black text-emerald-400">₩${formatMoney(rec.otcCalcSales)}</div>
            <div class="text-[10px] ${rec.posDiff === 0 ? 'text-slate-500' : rec.posDiff > 0 ? 'text-amber-400' : 'text-rose-400'} font-bold">
              POS 차액: ₩${formatMoney(rec.posDiff)}
            </div>
          </div>

          <div class="bg-slate-900/90 p-4 rounded-2xl border border-slate-800 shadow-md">
            <span class="text-xs text-slate-400 font-bold block mb-1">온라인몰 당일 결제합계</span>
            <div class="text-2xl font-black text-purple-400">₩${formatMoney(rec.onlineCardTotal)}</div>
            <span class="text-[10px] text-slate-500">박카스 + 팜스넷 + 더샵 등</span>
          </div>

          <div class="bg-slate-900/90 p-4 rounded-2xl border border-slate-800 shadow-md">
            <span class="text-xs text-slate-400 font-bold block mb-1">금고 시재 과부족</span>
            <div class="text-2xl font-black ${rec.vaultDifference === 0 ? 'text-emerald-400' : rec.vaultDifference > 0 ? 'text-blue-400' : 'text-rose-400'}">
              ₩${formatMoney(rec.vaultDifference)}
            </div>
            <span class="text-[10px] text-slate-500">실물 시재 ₩${formatMoney(rec.actualCash)}</span>
          </div>
        </div>

        <!-- 3개 입력 섹션 그리드 -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- 1. 매출 & 조제본부금 -->
          <div class="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 space-y-4">
            <h3 class="text-sm font-bold text-amber-400 flex items-center gap-2 border-b border-slate-800 pb-2">
              <i class="fas fa-coins"></i>
              <span>1. 매출 및 조제내역</span>
            </h3>
            <div class="space-y-3 text-xs">
              <div class="flex justify-between items-center">
                <span class="text-slate-400 font-medium">현금매출:</span>
                <input type="text" inputmode="numeric" value="${formatMoney(rec.salesCash)}" oninput="SmartLedgerModule.handleDailyInput('salesCash', this)" class="w-32 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-right font-bold text-white outline-none focus:border-amber-400"/>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-slate-400 font-medium">카드매출:</span>
                <input type="text" inputmode="numeric" value="${formatMoney(rec.salesCard)}" oninput="SmartLedgerModule.handleDailyInput('salesCard', this)" class="w-32 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-right font-bold text-white outline-none focus:border-amber-400"/>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-slate-400 font-medium">조제본부금 (Rx):</span>
                <input type="text" inputmode="numeric" value="${formatMoney(rec.salesRxFee)}" oninput="SmartLedgerModule.handleDailyInput('salesRxFee', this)" class="w-32 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-right font-bold text-white outline-none focus:border-amber-400"/>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-slate-400 font-medium">POS 일반약 매출:</span>
                <input type="text" inputmode="numeric" value="${formatMoney(rec.salesPosOtc)}" oninput="SmartLedgerModule.handleDailyInput('salesPosOtc', this)" class="w-32 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-right font-bold text-white outline-none focus:border-amber-400"/>
              </div>
            </div>
          </div>

          <!-- 2. 지출 & 현금사입 -->
          <div class="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 space-y-4">
            <h3 class="text-sm font-bold text-amber-400 flex items-center gap-2 border-b border-slate-800 pb-2">
              <i class="fas fa-wallet"></i>
              <span>2. 지출 및 통장이체</span>
            </h3>
            <div class="space-y-3 text-xs">
              <div class="flex justify-between items-center">
                <span class="text-slate-400 font-medium">통장이체액:</span>
                <input type="text" inputmode="numeric" value="${formatMoney(rec.bankDeposit)}" oninput="SmartLedgerModule.handleDailyInput('bankDeposit', this)" class="w-32 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-right font-bold text-white outline-none focus:border-amber-400"/>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-slate-400 font-medium">현금사입:</span>
                <input type="text" inputmode="numeric" value="${formatMoney(rec.cashPurchases)}" oninput="SmartLedgerModule.handleDailyInput('cashPurchases', this)" class="w-32 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-right font-bold text-white outline-none focus:border-amber-400"/>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-slate-400 font-medium">식대 (현금):</span>
                <input type="text" inputmode="numeric" value="${formatMoney(rec.meals)}" oninput="SmartLedgerModule.handleDailyInput('meals', this)" class="w-32 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-right font-bold text-white outline-none focus:border-amber-400"/>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-slate-400 font-medium">잡비 1 (현금):</span>
                <input type="text" inputmode="numeric" value="${formatMoney(rec.miscCard1)}" oninput="SmartLedgerModule.handleDailyInput('miscCard1', this)" class="w-32 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-right font-bold text-white outline-none focus:border-amber-400"/>
              </div>
            </div>
          </div>

          <!-- 3. 온라인몰 즉시결제 & 금고 시재 -->
          <div class="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 space-y-4">
            <div class="flex justify-between items-center border-b border-slate-800 pb-2">
              <h3 class="text-sm font-bold text-purple-400 flex items-center gap-2">
                <i class="fas fa-shopping-cart"></i>
                <span>3. 온라인몰 & 금고 실물 시재</span>
              </h3>
            </div>
            <div class="space-y-2.5 text-xs max-h-[300px] overflow-y-auto pr-1">
              <div class="flex justify-between items-center">
                <span class="text-slate-400">박카스:</span>
                <input type="text" inputmode="numeric" value="${formatMoney(rec.onlineCards?.bacchus)}" oninput="SmartLedgerModule.handleOnlineMallInput('bacchus', this)" class="w-28 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-right font-bold text-white outline-none focus:border-purple-400"/>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-slate-400">팜스넷:</span>
                <input type="text" inputmode="numeric" value="${formatMoney(rec.onlineCards?.pharmNet)}" oninput="SmartLedgerModule.handleOnlineMallInput('pharmNet', this)" class="w-28 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-right font-bold text-white outline-none focus:border-purple-400"/>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-slate-400">일동몰:</span>
                <input type="text" inputmode="numeric" value="${formatMoney(rec.onlineCards?.ildong)}" oninput="SmartLedgerModule.handleOnlineMallInput('ildong', this)" class="w-28 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-right font-bold text-white outline-none focus:border-purple-400"/>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-slate-400">더샵:</span>
                <input type="text" inputmode="numeric" value="${formatMoney(rec.onlineCards?.theShop)}" oninput="SmartLedgerModule.handleOnlineMallInput('theShop', this)" class="w-28 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-right font-bold text-white outline-none focus:border-purple-400"/>
              </div>
              <div class="pt-2 border-t border-slate-800 space-y-2">
                <div class="flex justify-between items-center">
                  <span class="text-amber-300 font-bold">전일 금고 이월시재:</span>
                  <input type="text" inputmode="numeric" value="${formatMoney(rec.prevVaultCash)}" oninput="SmartLedgerModule.handleDailyInput('prevVaultCash', this)" class="w-28 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-right font-bold text-amber-300 outline-none focus:border-amber-400"/>
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-emerald-400 font-bold">당일 마감 실물시재:</span>
                  <input type="text" inputmode="numeric" value="${formatMoney(rec.actualCash)}" oninput="SmartLedgerModule.handleDailyInput('actualCash', this)" class="w-28 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-right font-bold text-emerald-400 outline-none focus:border-emerald-400"/>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 저장 버튼 바 -->
        <div class="flex justify-end pt-2">
          <button onclick="SmartLedgerModule.saveCurrentDaily()" class="px-8 py-3.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl shadow-xl flex items-center gap-2 transition text-sm">
            <i class="fas fa-save"></i>
            <span>${rec.date} 일일 정산 저장 (구글 시트 동기화)</span>
          </button>
        </div>
      </div>
    `;
  }

  // 2. 월말 결산 화면 렌더링
  function renderMonthlySettlement(container) {
    const store = getStore();
    const yymm = store.currentYYMM;
    if (!store.monthlyRecords[yymm]) {
      store.monthlyRecords[yymm] = getInitMonthly(yymm);
    }
    const m = calculateMonthly(store.monthlyRecords[yymm]);

    container.innerHTML = `
      <div class="space-y-6 text-slate-100">
        <!-- 상단 4대 총괄 지표 카드 -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="bg-slate-900/90 p-4 rounded-2xl border border-slate-800 shadow-md">
            <span class="text-xs text-slate-400 font-bold block mb-1">월 실질 통장 순잉여금 (M2)</span>
            <div class="text-2xl font-black ${m.netSurplus >= 0 ? 'text-amber-400' : 'text-rose-400'}">
              ₩${formatMoney(m.netSurplus)}
            </div>
            <span class="text-[10px] text-slate-500">P4(총수입) - S4(총지출)</span>
          </div>

          <div class="bg-slate-900/90 p-4 rounded-2xl border border-slate-800 shadow-md">
            <span class="text-xs text-slate-400 font-bold block mb-1">이론적 총수익 분석 (C4)</span>
            <div class="text-2xl font-black text-emerald-400">₩${formatMoney(m.theoreticalProfit)}</div>
            <span class="text-[10px] text-slate-500">조제료 + 매약순익40% + 에누리 + 비급여 + 캐시백</span>
          </div>

          <div class="bg-slate-900/90 p-4 rounded-2xl border border-slate-800 shadow-md">
            <span class="text-xs text-slate-400 font-bold block mb-1">통장 총수입 (P4)</span>
            <div class="text-2xl font-black text-blue-400">₩${formatMoney(m.grossIncome)}</div>
            <span class="text-[10px] text-slate-500">일반매출 + 본부금 + 공단청구 + 에누리 + 약국거래</span>
          </div>

          <div class="bg-slate-900/90 p-4 rounded-2xl border border-slate-800 shadow-md">
            <span class="text-xs text-slate-400 font-bold block mb-1">통장 총지출 (S4)</span>
            <div class="text-2xl font-black text-rose-400">₩${formatMoney(m.grossExpenses)}</div>
            <span class="text-[10px] text-slate-500">거래처 + 급여 + 공과금 + 월세 + 금융비용</span>
          </div>
        </div>

        <!-- 5개 반응형 탭 그리드 (모바일/PC 절대 안잘림) -->
        <div class="bg-slate-900/90 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 border-b border-slate-800 bg-slate-950/80 p-1.5 gap-1.5" id="sl-monthly-tabs">
            <button onclick="SmartLedgerModule.switchMonthlyTab(0)" class="sl-tab-btn px-2.5 sm:px-3 py-2.5 rounded-xl text-xs font-bold transition text-center flex items-center justify-center ${activeMonthlyTab === 0 ? 'bg-amber-500 text-slate-950 shadow-md font-black' : 'text-slate-400 hover:text-white hover:bg-slate-800'}">
              <span class="hidden md:inline">1. 거래처 결제 대장</span>
              <span class="md:hidden">1. 거래처 결제</span>
            </button>
            <button onclick="SmartLedgerModule.switchMonthlyTab(1)" class="sl-tab-btn px-2.5 sm:px-3 py-2.5 rounded-xl text-xs font-bold transition text-center flex items-center justify-center ${activeMonthlyTab === 1 ? 'bg-amber-500 text-slate-950 shadow-md font-black' : 'text-slate-400 hover:text-white hover:bg-slate-800'}">
              <span class="hidden md:inline">2. 직원 급여 & 퇴직금</span>
              <span class="md:hidden">2. 급여 · 퇴직금</span>
            </button>
            <button onclick="SmartLedgerModule.switchMonthlyTab(2)" class="sl-tab-btn px-2.5 sm:px-3 py-2.5 rounded-xl text-xs font-bold transition text-center flex items-center justify-center ${activeMonthlyTab === 2 ? 'bg-amber-500 text-slate-950 shadow-md font-black' : 'text-slate-400 hover:text-white hover:bg-slate-800'}">
              <span class="hidden md:inline">3. 공과금 세부 내역</span>
              <span class="md:hidden">3. 공과금 내역</span>
            </button>
            <button onclick="SmartLedgerModule.switchMonthlyTab(3)" class="sl-tab-btn px-2.5 sm:px-3 py-2.5 rounded-xl text-xs font-bold transition text-center flex items-center justify-center ${activeMonthlyTab === 3 ? 'bg-amber-500 text-slate-950 shadow-md font-black' : 'text-slate-400 hover:text-white hover:bg-slate-800'}">
              <span class="hidden md:inline">4. 에누리 · 카드결제액</span>
              <span class="md:hidden">4. 에누리 · 카드결제</span>
            </button>
            <button onclick="SmartLedgerModule.switchMonthlyTab(4)" class="sl-tab-btn col-span-2 sm:col-span-1 lg:col-span-1 px-2.5 sm:px-3 py-2.5 rounded-xl text-xs font-bold transition text-center flex items-center justify-center ${activeMonthlyTab === 4 ? 'bg-amber-500 text-slate-950 shadow-md font-black' : 'text-slate-400 hover:text-white hover:bg-slate-800'}">
              <span class="hidden md:inline">5. 손익 종합 분석표</span>
              <span class="md:hidden">5. 손익 종합 분석</span>
            </button>
          </div>

          <!-- 탭 1: 거래처 결제 대장 -->
          <div id="sl-tab-pane-0" class="p-5 space-y-5 ${activeMonthlyTab === 0 ? '' : 'hidden'}">
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <!-- 현금 거래처 (V4:V30) -->
              <div class="space-y-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div class="flex justify-between items-center border-b border-slate-800 pb-2">
                  <span class="text-xs text-amber-400 font-bold">현금 거래처 (S6 합계: ₩${formatMoney(m.vendorCashTotal)})</span>
                </div>
                <div class="space-y-2 text-xs max-h-[450px] overflow-y-auto pr-1">
                  ${m.cashVendors.map((v, idx) => `
                    <div class="flex items-center justify-between gap-2 p-1.5 rounded-lg hover:bg-slate-900">
                      <span class="text-slate-300 font-bold truncate">${v.name}</span>
                      <input type="text" inputmode="numeric" value="${formatMoney(v.amount)}" oninput="SmartLedgerModule.handleVendorInput('cashVendors', ${idx}, this)" class="w-28 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-right font-bold text-white outline-none focus:border-amber-400"/>
                    </div>
                  `).join('')}
                </div>
              </div>

              <!-- 카드 거래처 (Y4:Y40) -->
              <div class="space-y-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div class="flex justify-between items-center border-b border-slate-800 pb-2">
                  <span class="text-xs text-purple-400 font-bold">카드 거래처 (S7 합계: ₩${formatMoney(m.vendorCardTotal)})</span>
                </div>
                <div class="space-y-2 text-xs max-h-[450px] overflow-y-auto pr-1">
                  ${m.cardVendors.map((v, idx) => `
                    <div class="flex items-center justify-between gap-2 p-1.5 rounded-lg hover:bg-slate-900">
                      <span class="text-slate-300 font-bold truncate">${v.name}</span>
                      <input type="text" inputmode="numeric" value="${formatMoney(v.amount)}" oninput="SmartLedgerModule.handleVendorInput('cardVendors', ${idx}, this)" class="w-28 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-right font-bold text-white outline-none focus:border-purple-400"/>
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>
          </div>

          <!-- 탭 2: 직원 급여 & 퇴직금 -->
          <div id="sl-tab-pane-1" class="p-5 space-y-5 ${activeMonthlyTab === 1 ? '' : 'hidden'}">
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div class="space-y-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
                <span class="text-xs text-amber-400 font-bold block border-b border-slate-800 pb-2">인건비 급여대장 (S8: ₩${formatMoney(m.expPayroll)})</span>
                <div class="space-y-2 text-xs max-h-[400px] overflow-y-auto pr-1">
                  ${m.employees.map((e, idx) => `
                    <div class="flex items-center justify-between gap-2 p-1.5 rounded-lg hover:bg-slate-900">
                      <span class="text-slate-300 font-bold truncate">${e.name}</span>
                      <input type="text" inputmode="numeric" value="${formatMoney(e.amount)}" oninput="SmartLedgerModule.handleVendorInput('employees', ${idx}, this)" class="w-28 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-right font-bold text-white outline-none focus:border-amber-400"/>
                    </div>
                  `).join('')}
                </div>
              </div>

              <div class="space-y-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
                <span class="text-xs text-blue-400 font-bold block border-b border-slate-800 pb-2">퇴직금 적립대장 (S17: ₩${formatMoney(m.expSeverance)})</span>
                <div class="space-y-2 text-xs max-h-[400px] overflow-y-auto pr-1">
                  ${m.severances.map((s, idx) => `
                    <div class="flex items-center justify-between gap-2 p-1.5 rounded-lg hover:bg-slate-900">
                      <span class="text-slate-300 font-bold truncate">${s.name}</span>
                      <input type="text" inputmode="numeric" value="${formatMoney(s.amount)}" oninput="SmartLedgerModule.handleVendorInput('severances', ${idx}, this)" class="w-28 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-right font-bold text-white outline-none focus:border-blue-400"/>
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>
          </div>

          <!-- 탭 3: 공과금 세부 내역 -->
          <div id="sl-tab-pane-2" class="p-5 space-y-5 ${activeMonthlyTab === 2 ? '' : 'hidden'}">
            <div class="space-y-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
              <span class="text-xs text-amber-400 font-bold block border-b border-slate-800 pb-2">공과금 세부 내역 (S9: ₩${formatMoney(m.expUtility)})</span>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs max-h-[450px] overflow-y-auto pr-1">
                ${m.utilities.map((u, idx) => `
                  <div class="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-slate-900/60 border border-slate-800">
                    <span class="text-slate-300 font-bold truncate">${u.name}</span>
                    <input type="text" inputmode="numeric" value="${formatMoney(u.amount)}" oninput="SmartLedgerModule.handleVendorInput('utilities', ${idx}, this)" class="w-28 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-right font-bold text-white outline-none focus:border-amber-400"/>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>

          <!-- 탭 4: 에누리 · 약국거래 · 카드결제액 -->
          <div id="sl-tab-pane-3" class="p-5 space-y-5 ${activeMonthlyTab === 3 ? '' : 'hidden'}">
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 text-xs">
              <!-- 1. 에누리 -->
              <div class="space-y-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
                <span class="text-xs text-emerald-400 font-bold block border-b border-slate-800 pb-2">에누리/금융할인 (P9: ₩${formatMoney(m.totalDiscounts)})</span>
                <div class="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                  ${m.discounts.map((d, idx) => `
                    <div class="flex items-center justify-between gap-2 p-1 rounded hover:bg-slate-900">
                      <span class="text-slate-300 truncate">${d.name}</span>
                      <input type="text" inputmode="numeric" value="${formatMoney(d.amount)}" oninput="SmartLedgerModule.handleVendorInput('discounts', ${idx}, this)" class="w-24 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-right font-bold text-white outline-none focus:border-emerald-400"/>
                    </div>
                  `).join('')}
                </div>
              </div>

              <!-- 2. 약국간거래 -->
              <div class="space-y-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
                <span class="text-xs text-blue-400 font-bold block border-b border-slate-800 pb-2">약국간거래 (P10: ₩${formatMoney(m.totalPharmTrades)})</span>
                <div class="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                  ${m.pharmTrades.map((p, idx) => `
                    <div class="flex items-center justify-between gap-2 p-1 rounded hover:bg-slate-900">
                      <span class="text-slate-300 truncate">${p.name}</span>
                      <input type="text" inputmode="numeric" value="${formatMoney(p.amount)}" oninput="SmartLedgerModule.handleVendorInput('pharmTrades', ${idx}, this)" class="w-24 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-right font-bold text-white outline-none focus:border-blue-400"/>
                    </div>
                  `).join('')}
                </div>
              </div>

              <!-- 3. 이번달 카드별 결제금액 (Z69:AA75 연동) -->
              <div class="space-y-3 bg-slate-950 p-4 rounded-xl border border-purple-500/40">
                <div>
                  <span class="text-xs text-purple-400 font-bold block">이번달 카드별 결제금액 (Z69:AA75)</span>
                  <span class="text-[10px] text-purple-300 font-bold">C9/P13 혜택 합산: ₩${formatMoney(m.totalCashback)}</span>
                </div>
                <div class="space-y-2.5 max-h-[400px] overflow-y-auto pr-1">
                  ${m.cardCashbacks.map((c, idx) => `
                    <div class="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1.5">
                      <div class="flex justify-between items-center">
                        <span class="text-slate-200 font-bold text-xs">${c.name}</span>
                        <span class="text-[9px] text-purple-300 bg-purple-950/60 px-1.5 py-0.5 rounded border border-purple-800/60">${c.rate || 1.5}%</span>
                      </div>
                      <div>
                        <label class="text-[10px] text-slate-400 block mb-0.5">이번달 카드 결제원금 입력:</label>
                        <input type="text" inputmode="numeric" value="${formatMoney(c.spend || c.amount)}" oninput="SmartLedgerModule.handleCardSpendInput(${idx}, this)" class="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-right font-bold text-white outline-none focus:border-purple-400 text-xs" placeholder="결제금액 입력"/>
                      </div>
                      <div class="flex justify-between text-[10px] bg-slate-950/60 px-2 py-0.5 rounded text-purple-400 font-bold">
                        <span>🎁 캐시백 혜택:</span>
                        <span>₩${formatMoney(c.cashback)}</span>
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>
          </div>

          <!-- 탭 5: 손익 종합 분석표 -->
          <div id="sl-tab-pane-4" class="p-5 space-y-5 ${activeMonthlyTab === 4 ? '' : 'hidden'}">
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 text-xs">
              <!-- 1. C열 이론적 총수익 -->
              <div class="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                <div class="flex justify-between items-center border-b border-slate-800 pb-2">
                  <span class="text-sm font-bold text-emerald-400">1. 이론적 총수익 분석 (C4)</span>
                  <span class="text-base font-black text-emerald-400">₩${formatMoney(m.theoreticalProfit)}</span>
                </div>
                <div class="space-y-2">
                  <div class="flex justify-between items-center">
                    <span class="text-slate-400">월조제료 (C5 직접입력):</span>
                    <input type="text" inputmode="numeric" value="${formatMoney(m.incomeRxFee)}" oninput="SmartLedgerModule.handleMonthlyFieldInput('incomeRxFee', this)" class="w-28 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-right font-bold text-white outline-none focus:border-amber-400"/>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-slate-400">일반매출순익 (C6 마진40%):</span>
                    <span class="font-bold text-emerald-400">₩${formatMoney(m.otcProfit)}</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-slate-400">에누리 (C7 = P29):</span>
                    <span class="font-bold text-emerald-400">₩${formatMoney(m.totalDiscounts)}</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-slate-400">처방비급여마진 (C8):</span>
                    <input type="text" inputmode="numeric" value="${formatMoney(m.incomeNonCovered)}" oninput="SmartLedgerModule.handleMonthlyFieldInput('incomeNonCovered', this)" class="w-28 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-right font-bold text-white outline-none focus:border-amber-400"/>
                  </div>
                  <div class="flex justify-between items-center py-1 bg-purple-950/20 px-2 rounded-lg border border-purple-500/20">
                    <div class="flex items-center gap-1">
                      <span class="text-slate-300 font-medium">카드별 혜택 (C9 = P13):</span>
                      <span class="text-[9px] text-purple-400 bg-purple-950/60 px-1.5 py-0.5 rounded border border-purple-800/60">4번 탭 연동</span>
                    </div>
                    <span class="font-bold text-purple-400">₩${formatMoney(m.totalCashback)}</span>
                  </div>
                </div>
              </div>

              <!-- 2. P열 통장 총수입 -->
              <div class="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                <div class="flex justify-between items-center border-b border-slate-800 pb-2">
                  <span class="text-sm font-bold text-blue-400">2. 통장 총수입 (P4)</span>
                  <span class="text-base font-black text-blue-400">₩${formatMoney(m.grossIncome)}</span>
                </div>
                <div class="space-y-2">
                  <div class="flex justify-between items-center">
                    <span class="text-slate-400">일반매약총액 (P6):</span>
                    <span class="font-bold text-white">₩${formatMoney(m.otcTotalSales)}</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-slate-400">조제본인부담 (P7 직접입력):</span>
                    <input type="text" inputmode="numeric" value="${formatMoney(m.incomeCopay)}" oninput="SmartLedgerModule.handleMonthlyFieldInput('incomeCopay', this)" class="w-28 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-right font-bold text-white outline-none focus:border-blue-400"/>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-slate-400">공단청구액 (P8 직접입력):</span>
                    <input type="text" inputmode="numeric" value="${formatMoney(m.incomeNhisClaim)}" oninput="SmartLedgerModule.handleMonthlyFieldInput('incomeNhisClaim', this)" class="w-28 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-right font-bold text-white outline-none focus:border-blue-400"/>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-slate-400">에누리 (P9):</span>
                    <span class="font-bold text-white">₩${formatMoney(m.totalDiscounts)}</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-slate-400">약국간거래 (P10):</span>
                    <span class="font-bold text-white">₩${formatMoney(m.totalPharmTrades)}</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-slate-400">카드사 캐시백 (P13):</span>
                    <span class="font-bold text-purple-400">₩${formatMoney(m.totalCashback)}</span>
                  </div>
                </div>
              </div>

              <!-- 3. S열 통장 총지출 -->
              <div class="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                <div class="flex justify-between items-center border-b border-slate-800 pb-2">
                  <span class="text-sm font-bold text-rose-400">3. 통장 총지출 (S4)</span>
                  <span class="text-base font-black text-rose-400">₩${formatMoney(m.grossExpenses)}</span>
                </div>
                <div class="space-y-2">
                  <div class="flex justify-between items-center">
                    <span class="text-slate-400">현금거래처 (S6):</span>
                    <span class="font-bold text-white">₩${formatMoney(m.vendorCashTotal)}</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-slate-400">카드거래처 (S7):</span>
                    <span class="font-bold text-white">₩${formatMoney(m.vendorCardTotal)}</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-slate-400">급여총액 (S8):</span>
                    <span class="font-bold text-white">₩${formatMoney(m.expPayroll)}</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-slate-400">공과금총액 (S9):</span>
                    <span class="font-bold text-white">₩${formatMoney(m.expUtility)}</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-slate-400">약국임대료 (S10):</span>
                    <input type="text" inputmode="numeric" value="${formatMoney(m.expRent)}" oninput="SmartLedgerModule.handleMonthlyFieldInput('expRent', this)" class="w-28 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-right font-bold text-white outline-none focus:border-rose-400"/>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-slate-400">퇴직금적립 (S17):</span>
                    <span class="font-bold text-white">₩${formatMoney(m.expSeverance)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 결산 저장 버튼 -->
        <div class="flex justify-end pt-2">
          <button onclick="SmartLedgerModule.saveCurrentMonthly()" class="px-8 py-3.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl shadow-xl flex items-center gap-2 transition text-sm">
            <i class="fas fa-save"></i>
            <span>20${yymm.substring(0,2)}년 ${yymm.substring(2,4)}월 결산 저장 (구글 시트 동기화)</span>
          </button>
        </div>
      </div>
    `;
  }

  // 3. 소득 추이 통계 (12M MA)
  function renderTrends(container) {
    const store = getStore();
    container.innerHTML = `
      <div class="space-y-6 text-slate-100">
        <div class="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl space-y-4">
          <div class="flex justify-between items-center flex-wrap gap-2">
            <div>
              <h3 class="text-base font-black text-white flex items-center gap-2">
                <i class="fas fa-chart-line text-amber-400"></i>
                <span>월별 실질 순잉여금 (M2) & 12개월 이동평균선</span>
              </h3>
              <p class="text-xs text-slate-400">구글 스프레드시트 실제 결산 데이터 기반 실시간 산출</p>
            </div>
          </div>
          <div class="relative h-72 md:h-96 w-full">
            <canvas id="sl-trend-chart"></canvas>
          </div>
        </div>
      </div>
    `;

    setTimeout(initTrendChart, 100);
  }

  function initTrendChart() {
    const ctx = document.getElementById('sl-trend-chart');
    if (!ctx) return;

    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }

    const store = getStore();
    const months = store.availableMonths;
    const labels = months.map(m => `20${m.substring(0,2)}.${m.substring(2,4)}`);
    const values = months.map(m => {
      const rec = store.monthlyRecords[m];
      return rec ? (rec.netSurplus || 0) : 0;
    });

    if (window.Chart) {
      chartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [
            {
              label: '월 실질 순잉여금 (M2)',
              data: values,
              backgroundColor: 'rgba(245, 158, 11, 0.4)',
              borderColor: 'rgba(245, 158, 11, 1)',
              borderWidth: 2,
              borderRadius: 8
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: '#94a3b8', font: { weight: 'bold' } } }
          },
          scales: {
            x: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
            y: { ticks: { color: '#94a3b8' }, grid: { color: 'rgba(255,255,255,0.05)' } }
          }
        }
      });
    }
  }

  // 실시간 콤마 포맷터
  function formatCurrencyInput(inputEl) {
    if (!inputEl) return 0;
    const rawVal = inputEl.value || '';
    const num = parseMoney(rawVal);
    const formatted = formatMoney(num);
    const selStart = inputEl.selectionStart;
    const lenDiff = formatted.length - rawVal.length;
    inputEl.value = formatted;
    try {
      const newPos = Math.max(0, selStart + lenDiff);
      inputEl.setSelectionRange(newPos, newPos);
    } catch(e) {}
    return num;
  }

  // 이벤트 핸들러
  function handleDateSelect(dateStr) {
    const store = getStore();
    store.currentDate = dateStr;
    renderViewport();
  }

  function handleMonthChange(yymm) {
    const store = getStore();
    store.currentYYMM = yymm;
    store.currentDate = `${yymm}01`;
    renderViewport();
  }

  function navigateTo(route) {
    currentRoute = route;
    renderViewport();
  }

  function switchMonthlyTab(tabIdx) {
    activeMonthlyTab = tabIdx;
    const tabs = document.querySelectorAll('.sl-tab-btn');
    tabs.forEach((btn, i) => {
      if (i === tabIdx) {
        btn.classList.remove('text-slate-400', 'hover:text-white', 'hover:bg-slate-800');
        btn.classList.add('bg-amber-500', 'text-slate-950', 'shadow-md', 'font-black');
      } else {
        btn.classList.remove('bg-amber-500', 'text-slate-950', 'shadow-md', 'font-black');
        btn.classList.add('text-slate-400', 'hover:text-white', 'hover:bg-slate-800');
      }
    });

    for (let i = 0; i < 5; i++) {
      const pane = document.getElementById(`sl-tab-pane-${i}`);
      if (pane) {
        if (i === tabIdx) pane.classList.remove('hidden');
        else pane.classList.add('hidden');
      }
    }
  }

  function handleDailyInput(field, inputEl) {
    const num = formatCurrencyInput(inputEl);
    const store = getStore();
    const curDate = store.currentDate;
    if (!store.dailyRecords[curDate]) store.dailyRecords[curDate] = getInitDaily(curDate);
    store.dailyRecords[curDate][field] = num;
    calculateDaily(store.dailyRecords[curDate]);
    saveStoreToLocal();
  }

  function handleOnlineMallInput(mallKey, inputEl) {
    const num = formatCurrencyInput(inputEl);
    const store = getStore();
    const curDate = store.currentDate;
    if (!store.dailyRecords[curDate]) store.dailyRecords[curDate] = getInitDaily(curDate);
    if (!store.dailyRecords[curDate].onlineCards) store.dailyRecords[curDate].onlineCards = {};
    store.dailyRecords[curDate].onlineCards[mallKey] = num;
    calculateDaily(store.dailyRecords[curDate]);
    saveStoreToLocal();
  }

  function handleVendorInput(listKey, idx, inputEl) {
    const num = formatCurrencyInput(inputEl);
    const store = getStore();
    const yymm = store.currentYYMM;
    if (!store.monthlyRecords[yymm]) store.monthlyRecords[yymm] = getInitMonthly(yymm);
    if (store.monthlyRecords[yymm][listKey] && store.monthlyRecords[yymm][listKey][idx]) {
      store.monthlyRecords[yymm][listKey][idx].amount = num;
    }
    calculateMonthly(store.monthlyRecords[yymm]);
    saveStoreToLocal();
  }

  function handleCardSpendInput(idx, inputEl) {
    const num = formatCurrencyInput(inputEl);
    const store = getStore();
    const yymm = store.currentYYMM;
    if (!store.monthlyRecords[yymm]) store.monthlyRecords[yymm] = getInitMonthly(yymm);
    if (store.monthlyRecords[yymm].cardCashbacks && store.monthlyRecords[yymm].cardCashbacks[idx]) {
      store.monthlyRecords[yymm].cardCashbacks[idx].spend = num;
    }
    calculateMonthly(store.monthlyRecords[yymm]);
    saveStoreToLocal();
  }

  function handleMonthlyFieldInput(field, inputEl) {
    const num = formatCurrencyInput(inputEl);
    const store = getStore();
    const yymm = store.currentYYMM;
    if (!store.monthlyRecords[yymm]) store.monthlyRecords[yymm] = getInitMonthly(yymm);
    store.monthlyRecords[yymm][field] = num;
    calculateMonthly(store.monthlyRecords[yymm]);
    saveStoreToLocal();
  }

  // 구글 스프레드시트 1:1 양방향 통신
  async function syncWithSheets() {
    const pKey = activePharmacyKey;
    const prof = PHARMACY_PROFILES[pKey];
    const url = getGasUrl(pKey);

    const spin = document.getElementById('sl-sync-spin');
    if (spin) spin.classList.add('fa-spin');

    try {
      const pingRes = await fetch(`${url}?action=ping`).then(r => r.json());
      if (pingRes && pingRes.success) {
        const store = getStore(pKey);
        if (pingRes.sheets && Array.isArray(pingRes.sheets)) {
          const monthsFromSheets = pingRes.sheets.filter(s => /^\d{4}$/.test(s));
          if (monthsFromSheets.length > 0) {
            store.availableMonths = [...new Set(monthsFromSheets)].sort();
          }
        }

        // 현재 선택된 월 데이터 가져오기
        const monthRes = await fetch(`${url}?action=getMonthly&sheetName=${store.currentYYMM}결산`).then(r => r.json());
        if (monthRes && monthRes.success && monthRes.data) {
          const d = monthRes.data;
          const m = store.monthlyRecords[store.currentYYMM] || getInitMonthly(store.currentYYMM);
          if (d.incomeRxFee) m.incomeRxFee = d.incomeRxFee;
          if (d.incomeCopay) m.incomeCopay = d.incomeCopay;
          if (d.incomeNhisClaim) m.incomeNhisClaim = d.incomeNhisClaim;
          if (d.otcTotalSales) m.otcTotalSales = d.otcTotalSales;
          if (d.cashVendors) m.cashVendors = d.cashVendors;
          if (d.cardVendors) m.cardVendors = d.cardVendors;
          if (d.employees) m.employees = d.employees;
          if (d.severances) m.severances = d.severances;
          if (d.utilities) m.utilities = d.utilities;
          if (d.discounts) m.discounts = d.discounts;
          if (d.pharmTrades) m.pharmTrades = d.pharmTrades;
          if (d.cardCashbacks) m.cardCashbacks = d.cardCashbacks;
          calculateMonthly(m, pKey);
        }

        saveStoreToLocal(pKey);
        alert(`✅ [${prof.name}] 구글 스프레드시트와 실시간 동기화 완료!`);
        render('module-content', pKey);
      } else {
        alert(`⚠️ [${prof.name}] 구글 스프레드시트 응답 확인 필요`);
      }
    } catch(e) {
      alert(`⚠️ [${prof.name}] 동기화 오류: ${e.message}\n설정에서 구글 Web App URL을 확인해 주세요.`);
    } finally {
      if (spin) spin.classList.remove('fa-spin');
    }
  }

  async function saveCurrentMonthly() {
    const pKey = activePharmacyKey;
    const prof = PHARMACY_PROFILES[pKey];
    const url = getGasUrl(pKey);
    const store = getStore(pKey);
    const yymm = store.currentYYMM;
    const m = store.monthlyRecords[yymm];
    if (!m) return;

    try {
      const res = await fetch(url, {
        method: 'POST',
        body: JSON.stringify({
          action: 'saveMonthly',
          sheetName: `${yymm}결산`,
          data: m
        })
      }).then(r => r.json());

      if (res && res.success) {
        alert(`🎉 [${prof.name}] ${yymm}결산 구글 스프레드시트 저장 완료!`);
      } else {
        alert(`⚠️ [${prof.name}] 저장 응답 실패: ${res?.error || '알 수 없는 오류'}`);
      }
    } catch(e) {
      alert(`⚠️ 저장 중 오류: ${e.message}`);
    }
  }

  async function saveCurrentDaily() {
    const pKey = activePharmacyKey;
    const prof = PHARMACY_PROFILES[pKey];
    const url = getGasUrl(pKey);
    const store = getStore(pKey);
    const curDate = store.currentDate;
    const rec = store.dailyRecords[curDate];
    if (!rec) return;

    try {
      const yymm = curDate.substring(0, 4);
      const dayNum = parseInt(curDate.substring(4, 6), 10);

      const res = await fetch(url, {
        method: 'POST',
        body: JSON.stringify({
          action: 'saveDaily',
          sheetName: yymm,
          day: dayNum,
          data: rec
        })
      }).then(r => r.json());

      if (res && res.success) {
        alert(`🎉 [${prof.name}] ${curDate} 일일 정산 구글 시트 저장 완료!`);
      } else {
        alert(`⚠️ 저장 실패: ${res?.error || '알 수 없는 오류'}`);
      }
    } catch(e) {
      alert(`⚠️ 저장 중 오류: ${e.message}`);
    }
  }

  function showSettingsModal() {
    const pKey = activePharmacyKey;
    const prof = PHARMACY_PROFILES[pKey];
    const curUrl = getGasUrl(pKey);

    let modal = document.getElementById('sl-settings-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'sl-settings-modal';
      modal.style.cssText = 'position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.75); z-index:999999; display:flex; justify-content:center; align-items:center;';
      document.body.appendChild(modal);
    }

    modal.innerHTML = `
      <div class="bg-slate-900 p-6 rounded-2xl border border-slate-800 max-w-lg w-full text-slate-100 space-y-4 shadow-2xl">
        <div class="flex justify-between items-center border-b border-slate-800 pb-3">
          <h3 class="text-base font-black text-amber-400">⚙️ [${prof.name}] 구글 시트 연동 설정</h3>
          <button onclick="document.getElementById('sl-settings-modal').style.display='none'" class="text-slate-400 hover:text-white text-xl">&times;</button>
        </div>
        <div class="space-y-3 text-xs">
          <div>
            <label class="block text-slate-400 font-bold mb-1">구글 Apps Script 웹앱 URL (Web App URL):</label>
            <input type="text" id="sl-set-url" value="${curUrl}" class="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-white font-mono text-xs outline-none focus:border-amber-400"/>
          </div>
          <p class="text-[11px] text-slate-400 leading-relaxed">
            * 구글 스프레드시트 [확장 프로그램] ➔ [Apps Script] ➔ [배포] ➔ [새 배포] ➔ [웹 앱] 배포 URL을 입력하세요.
          </p>
        </div>
        <div class="flex justify-end gap-2 pt-2 border-t border-slate-800">
          <button onclick="document.getElementById('sl-settings-modal').style.display='none'" class="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl font-bold text-xs">닫기</button>
          <button onclick="SmartLedgerModule.saveSettings('${pKey}')" class="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs">저장하기</button>
        </div>
      </div>
    `;
    modal.style.display = 'flex';
  }

  function saveSettings(pKey) {
    const input = document.getElementById('sl-set-url');
    if (input) {
      setGasUrl(pKey, input.value.trim());
      alert(`✅ [${PHARMACY_PROFILES[pKey].name}] 구글 연동 URL 저장 완료!`);
      const modal = document.getElementById('sl-settings-modal');
      if (modal) modal.style.display = 'none';
    }
  }

  return {
    render,
    syncWithSheets,
    saveCurrentDaily,
    saveCurrentMonthly,
    handleDateSelect,
    handleMonthChange,
    navigateTo,
    switchMonthlyTab,
    handleDailyInput,
    handleOnlineMallInput,
    handleVendorInput,
    handleCardSpendInput,
    handleMonthlyFieldInput,
    showSettingsModal,
    saveSettings
  };

})();
