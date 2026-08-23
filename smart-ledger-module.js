/**
 * 신세계약국 & 회천메디칼약국 듀얼 스마트장부 완벽 이식 모듈 (Smart Ledger Module)
 * 원본 결제시스템 (store.js + ui.js + sheets-client.js + charts.js) 100.0% 완전 일치 통합 엔진
 */

// ==========================================
// 1. Google Sheets Web App API Client Module
// ==========================================
class GoogleSheetsClient {
  constructor() {
    this.currentPharmacy = 'hoecheon';
    this.storageKey = 'hoecheon_gas_webapp_url';
    this.syncUrlFromCloud();
    this.isConnected = false;
    this.lastSyncTime = null;
  }

  setPharmacy(pKey) {
    this.currentPharmacy = pKey;
    this.storageKey = pKey === 'ssg' ? 'ssg_gas_webapp_url' : 'hoecheon_gas_webapp_url';
    this.syncUrlFromCloud();
  }

  syncUrlFromCloud() {
    try {
      let url = (typeof localStorage !== 'undefined' && localStorage.getItem(this.storageKey)) || '';
      if (!url && window.SheetsSync && typeof window.SheetsSync.getGasUrls === 'function') {
        const cloudUrls = window.SheetsSync.getGasUrls();
        const pKey = this.storageKey.startsWith('ssg') ? 'ssg' : 'hoecheon';
        url = cloudUrls[pKey] || '';
        if (url && typeof localStorage !== 'undefined') {
          localStorage.setItem(this.storageKey, url);
        }
      }
      this.webAppUrl = (url || '').trim();
    } catch (e) {
      this.webAppUrl = '';
    }
  }

  get isConfigured() {
    if (!this.webAppUrl) this.syncUrlFromCloud();
    return Boolean(this.webAppUrl && this.webAppUrl.startsWith('https://script.google.com/macros/s/'));
  }

  setUrl(url) {
    this.webAppUrl = (url || '').trim();
    const pKey = this.storageKey.startsWith('ssg') ? 'ssg' : 'hoecheon';
    try {
      if (typeof localStorage !== 'undefined') {
        if (this.webAppUrl) {
          localStorage.setItem(this.storageKey, this.webAppUrl);
        } else {
          localStorage.removeItem(this.storageKey);
        }
      }
      if (window.SheetsSync && typeof window.SheetsSync.saveGasUrl === 'function') {
        window.SheetsSync.saveGasUrl(pKey, this.webAppUrl);
      }
    } catch (e) {}
  }

  async request(method, params = {}, body = null) {
    if (!this.isConfigured) {
      throw new Error('Google Sheets Web App URL이 설정되지 않았습니다.');
    }

    let url = this.webAppUrl;
    const queryParams = new URLSearchParams(params).toString();
    if (queryParams) {
      url += (url.includes('?') ? '&' : '?') + queryParams;
    }

    const options = {
      method: method,
      mode: 'cors',
      headers: { 'Accept': 'application/json' }
    };

    if (method === 'POST' && body) {
      options.body = JSON.stringify(body);
      options.headers['Content-Type'] = 'text/plain;charset=utf-8';
    }

    try {
      const response = await fetch(url, options);
      if (!response.ok) throw new Error(`HTTP 오류 (${response.status})`);
      const data = await response.json();
      this.isConnected = true;
      this.lastSyncTime = new Date();
      return data;
    } catch (err) {
      console.warn('Google Sheets API 통신 오류:', err);
      this.isConnected = false;
      throw err;
    }
  }

  async ping() {
    try {
      return await this.request('GET', { action: 'ping' });
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async getDaily(sheetName, day) {
    return await this.request('GET', { action: 'getDaily', sheetName: sheetName, day: day });
  }

  async saveDaily(sheetName, day, data) {
    return await this.request('POST', {}, { action: 'saveDaily', sheetName: sheetName, day: day, data: data });
  }

  async getMonthly(sheetName) {
    return await this.request('GET', { action: 'getMonthly', sheetName: sheetName });
  }

  async getFullMonthData(yymm) {
    return await this.request('GET', { action: 'getFullMonthData', yymm: yymm });
  }

  async saveMonthly(sheetName, data) {
    return await this.request('POST', {}, { action: 'saveMonthly', sheetName: sheetName, data: data });
  }

  async listSheets() {
    return await this.request('GET', { action: 'listSheets' });
  }
}

window.sheetsClient = new GoogleSheetsClient();


// ==========================================
// 2. Charts Controller Module
// ==========================================
const ChartsController = {
  salesChartInstance: null,
  profitChartInstance: null,

  destroyCharts() {
    if (this.salesChartInstance) {
      this.salesChartInstance.destroy();
      this.salesChartInstance = null;
    }
    if (this.profitChartInstance) {
      this.profitChartInstance.destroy();
      this.profitChartInstance = null;
    }
  },

  renderAnalyticsCharts(trendData) {
    this.destroyCharts();
    if (!trendData || !trendData.length) return;

    const labels = trendData.map(d => d.month);
    const otcSales = trendData.map(d => d.otcSales);
    const ma12 = trendData.map(d => d.ma12);
    const netProfits = trendData.map(d => d.netProfit);

    // 1. 일반매출 & 12개월 이동평균선 복합 차트
    const salesCanvas = document.getElementById('analytics-sales-chart');
    if (salesCanvas && window.Chart) {
      const ctx = salesCanvas.getContext('2d');
      this.salesChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [
            {
              type: 'line',
              label: '12개월 이동평균선 (12M MA)',
              data: ma12,
              borderColor: '#38bdf8',
              backgroundColor: '#38bdf8',
              borderWidth: 3,
              pointRadius: 4,
              pointHoverRadius: 6,
              tension: 0.3,
              yAxisID: 'y'
            },
            {
              type: 'bar',
              label: '일반매출 (매약)',
              data: otcSales,
              backgroundColor: 'rgba(245, 158, 11, 0.8)',
              borderRadius: 6,
              yAxisID: 'y'
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              labels: { color: '#94a3b8', font: { family: 'sans-serif', size: 12 } }
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  return `${context.dataset.label}: ₩${Number(context.raw).toLocaleString()}원`;
                }
              }
            }
          },
          scales: {
            x: {
              grid: { color: '#1e293b' },
              ticks: { color: '#64748b' }
            },
            y: {
              grid: { color: '#1e293b' },
              ticks: {
                color: '#64748b',
                callback: function(value) {
                  return '₩' + (value / 10000).toLocaleString() + '만';
                }
              }
            }
          }
        }
      });
    }

    // 2. 실질 순잉여금 흑자/적자 추이 차트
    const profitCanvas = document.getElementById('analytics-profit-chart');
    if (profitCanvas && window.Chart) {
      const ctx = profitCanvas.getContext('2d');
      this.profitChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [
            {
              label: '월 실질 순잉여금 (M2)',
              data: netProfits,
              borderColor: '#10b981',
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              borderWidth: 3,
              pointRadius: 5,
              pointHoverRadius: 7,
              pointBackgroundColor: netProfits.map(v => v >= 0 ? '#10b981' : '#f43f5e'),
              pointBorderColor: '#0f172a',
              pointBorderWidth: 2,
              fill: true,
              tension: 0.3
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              labels: { color: '#94a3b8', font: { family: 'sans-serif', size: 12 } }
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  const val = context.raw;
                  return `순잉여금(M2): ${val >= 0 ? '+' : ''}₩${Number(val).toLocaleString()}원`;
                }
              }
            }
          },
          scales: {
            x: {
              grid: { color: '#1e293b' },
              ticks: { color: '#64748b' }
            },
            y: {
              grid: { color: '#1e293b' },
              ticks: {
                color: '#64748b',
                callback: function(value) {
                  return '₩' + (value / 10000).toLocaleString() + '만';
                }
              }
            }
          }
        }
      });
    }
  }
};


// ==========================================
// 3. Smart Store & Calculation Engine (store.js)
// ==========================================
const DEFAULT_CASH_VENDORS = [
  { name: '다원약품', amount: 0, cell: 'V4' },
  { name: '미향', amount: 0, cell: 'V5' },
  { name: '신성호', amount: 0, cell: 'V6' },
  { name: '에코테라팜', amount: 0, cell: 'V7' },
  { name: '영진약품', amount: 0, cell: 'V8' },
  { name: '유화메디칼', amount: 0, cell: 'V9' },
  { name: '훼밀리팜일반', amount: 0, cell: 'V10' },
  { name: '훼밀리팜전문', amount: 0, cell: 'V11' },
  { name: '맥스포스', amount: 0, cell: 'V12' },
  { name: '현매 (일일시트 J247 자동 연동)', amount: 0, cell: 'V14', readOnly: true }
];

const DEFAULT_CARD_VENDORS = [
  // Y열 그룹 (좌측)
  { name: '동화', amount: 0, cell: 'Y4' },
  { name: '경남', amount: 0, cell: 'Y5' },
  { name: '경방', amount: 0, cell: 'Y6' },
  { name: '고려', amount: 0, cell: 'Y7' },
  { name: '광동제약', amount: 0, cell: 'Y8' },
  { name: '그린스토어', amount: 0, cell: 'Y9' },
  { name: '나이스팜2', amount: 0, cell: 'Y10' },
  { name: '동국일반', amount: 0, cell: 'Y12' },
  { name: '동성', amount: 0, cell: 'Y13' },
  { name: '디알에스', amount: 0, cell: 'Y14' },
  { name: '박카스', amount: 0, cell: 'Y15' },
  { name: '백제', amount: 0, cell: 'Y16' },
  { name: '삼진', amount: 0, cell: 'Y17' },
  { name: '신신제약', amount: 0, cell: 'Y19' },
  { name: '아워팜', amount: 0, cell: 'Y20' },
  { name: '에코테라팜2', amount: 0, cell: 'Y21' },
  { name: '온라인몰결제총합 (Y250 자동 연동)', amount: 0, cell: 'Y22', readOnly: true },
  { name: '웅진렌탈', amount: 0, cell: 'Y23' },
  { name: '위생', amount: 0, cell: 'Y24' },
  { name: '전화비', amount: 0, cell: 'Y25' },

  // AA열 그룹 (우측)
  { name: '대원제약', amount: 0, cell: 'AA4' },
  { name: '동원팜', amount: 0, cell: 'AA5' },
  { name: '비타민하우스', amount: 0, cell: 'AA6' },
  { name: '원탁', amount: 0, cell: 'AA7' },
  { name: '유한내츄럴보호대', amount: 0, cell: 'AA8' },
  { name: '유한양행', amount: 0, cell: 'AA9' },
  { name: '인터넷', amount: 0, cell: 'AA10' },
  { name: '제일약품', amount: 0, cell: 'AA11' },
  { name: '쥴릭', amount: 0, cell: 'AA14' },
  { name: '지오영', amount: 0, cell: 'AA15' },
  { name: '케어센스', amount: 0, cell: 'AA17' },
  { name: '태극제약', amount: 0, cell: 'AA18' },
  { name: '하나', amount: 0, cell: 'AA19' },
  { name: '한가람약품', amount: 0, cell: 'AA20' },
  { name: '한풍', amount: 0, cell: 'AA21' },
  { name: '현대', amount: 0, cell: 'AA22' },
  { name: '한독', amount: 0, cell: 'AA23' }
];

const DEFAULT_EMPLOYEES = [
  { name: '권명주5', amount: 0, cell: 'V29' },
  { name: '김배영5', amount: 0, cell: 'V30' },
  { name: '김동완5', amount: 0, cell: 'V31' },
  { name: '양윤지5', amount: 0, cell: 'V32' },
  { name: '김제희5', amount: 0, cell: 'V33' },
  { name: '이승학11', amount: 0, cell: 'X29' },
  { name: '유호종31', amount: 0, cell: 'X30' },
  { name: '간영자5', amount: 0, cell: 'X31' },
  { name: '윤세라5', amount: 0, cell: 'X32' }
];

const DEFAULT_UTILITIES = [
  { name: '관리비', amount: 0, cell: 'V39' },
  { name: '캡스5', amount: 0, cell: 'V40' },
  { name: '유비케어20', amount: 0, cell: 'V41' },
  { name: '토너비용', amount: 0, cell: 'V42' },
  { name: '세무사비1', amount: 0, cell: 'V43' },
  { name: '소득월액보험료', amount: 0, cell: 'X38' },
  { name: '건강보험료', amount: 0, cell: 'X39' },
  { name: '연금보험료', amount: 0, cell: 'X40' },
  { name: '고용보험료', amount: 0, cell: 'X41' },
  { name: '산재보험료', amount: 0, cell: 'X42' },
  { name: '갑근세', amount: 0, cell: 'X45' }
];

const DEFAULT_DISCOUNTS = [
  { name: '삼천당', amount: 0, cell: 'P30' },
  { name: '동화약품', amount: 0, cell: 'P31' },
  { name: '유화메디칼', amount: 0, cell: 'P32' },
  { name: '하나', amount: 0, cell: 'P33' },
  { name: '동원금융', amount: 0, cell: 'P34' },
  { name: '훼밀리팜금융비용', amount: 0, cell: 'P35' },
  { name: '백제금융', amount: 0, cell: 'P36' },
  { name: '지오영금융', amount: 0, cell: 'P37' },
  { name: '동원에누리', amount: 0, cell: 'P38' },
  { name: '훼밀리팜에누리', amount: 0, cell: 'P39' },
  { name: '훼밀리페이', amount: 0, cell: 'P40' },
  { name: '허정환', amount: 0, cell: 'P41' }
];

const DEFAULT_ONLINE_MALLS = [
  { id: 'mallDaewoong', name: '대웅몰', colLetter: 'P', colIndex: 16 },
  { id: 'mallHmp', name: 'HMP', colLetter: 'Q', colIndex: 17 },
  { id: 'mallDonga', name: '동아몰', colLetter: 'R', colIndex: 18 },
  { id: 'mallJoongwae', name: '중외몰', colLetter: 'S', colIndex: 19 },
  { id: 'mallVet', name: '동물약', colLetter: 'T', colIndex: 20 },
  { id: 'mallIldong', name: '일동몰', colLetter: 'U', colIndex: 21 },
  { id: 'mallChongKunDang', name: '종근당몰', colLetter: 'V', colIndex: 22 },
  { id: 'mallGreenCross', name: '녹십자몰', colLetter: 'W', colIndex: 23 },
  { id: 'mallOther', name: '그외몰', colLetter: 'X', colIndex: 24 },
  { id: 'mallBags', name: '조은봉투', colLetter: 'Y', colIndex: 25 }
];

function getColumnLetter(colIndex) {
  let temp = colIndex;
  let letter = '';
  while (temp > 0) {
    let mod = (temp - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    temp = Math.floor((temp - mod) / 26);
  }
  return letter;
}

const DEFAULT_PHARM_TRADES = [
  { name: '회천메디칼', amount: 0, cell: 'P23' },
  { name: '다산메디칼', amount: 0, cell: 'P24' },
  { name: '연푸른', amount: 0, cell: 'P25' },
  { name: '녹십자약국', amount: 0, cell: 'P26' },
  { name: '기타 약국', amount: 0, cell: 'P27' }
];

const DEFAULT_CARD_CASHBACKS = [
  { id: 'samsung', name: '삼성10/농협', spend: 0, rate: 1.5, cell: 'AA70' },
  { id: 'kb', name: '국민7/부산은행', spend: 0, rate: 1.5, cell: 'AA71' },
  { id: 'shinhan', name: '신한8/부산은행', spend: 0, rate: 1.5, cell: 'AA72' },
  { id: 'woori', name: '우리10/우리은행', spend: 0, rate: 1.7, cell: 'AA73' }
];

const DEFAULT_SEVERANCES = [
  { name: '김배영 (251118)', amount: 0, cell: 'AA30' },
  { name: '김제희 (241101)', amount: 0, cell: 'AA31' },
  { name: '이승학 (2307)', amount: 256000, cell: 'AA32' },
  { name: '권명주 (240909)', amount: 0, cell: 'AA33' },
  { name: '양윤지 (231004)', amount: 0, cell: 'AA34' },
  { name: '김동완 (260301)', amount: 0, cell: 'AA35' },
  { name: '윤세라 (260301)', amount: 0, cell: 'AA36' }
];

const AVAILABLE_MONTHS = ['2608', '2609', '2610', '2611', '2612', '2701', '2702'];

class PharmacyStore {
  constructor() {
    this.activePharmacy = 'ssg';
    this.pharmacyName = '신세계약국';
    this.pharmacyBadge = '신세계';
    this.pharmacySubtitle = '신세계약국 스마트 일일정산 & 월말결제 시스템';
    this.currentYYMM = '2608';
    this.availableMonths = [...AVAILABLE_MONTHS];
    this.onlineMalls = [...DEFAULT_ONLINE_MALLS];
    this.dailyRecords = {};
    this.monthlyRecords = {};
    this.loadFromLocal();
  }

  setPharmacy(pKey) {
    this.activePharmacy = pKey;
    if (pKey === 'ssg') {
      this.pharmacyName = '신세계약국';
      this.pharmacyBadge = '신세계';
      this.pharmacySubtitle = '신세계약국 스마트 일일정산 & 월말결제 시스템';
    } else {
      this.pharmacyName = '회천메디칼약국';
      this.pharmacyBadge = '회천';
      this.pharmacySubtitle = '일일정산 & 월말결제 스마트 시스템';
    }
    this.loadFromLocal();
  }

  get storagePrefix() {
    return this.activePharmacy === 'ssg' ? 'ssg_' : 'hoecheon_';
  }

  loadFromLocal() {
    try {
      if (typeof localStorage === 'undefined') return;
      const prefix = this.storagePrefix;
      const savedDaily = localStorage.getItem(`${prefix}daily_records`);
      const savedMonthly = localStorage.getItem(`${prefix}monthly_records`);
      const savedYYMM = localStorage.getItem(`${prefix}current_yymm`);
      const months = localStorage.getItem(`${prefix}available_months`);
      const savedMalls = localStorage.getItem(`${prefix}online_malls`);

      if (savedDaily) this.dailyRecords = JSON.parse(savedDaily);
      else this.dailyRecords = {};

      if (savedMonthly) this.monthlyRecords = JSON.parse(savedMonthly);
      else this.monthlyRecords = {};

      if (savedYYMM && (AVAILABLE_MONTHS.includes(savedYYMM) || /^[0-9]{4}$/.test(savedYYMM))) {
        this.currentYYMM = savedYYMM;
      } else {
        this.currentYYMM = '2608';
      }
      if (months) {
        const parsedM = JSON.parse(months);
        if (Array.isArray(parsedM) && parsedM.some(m => AVAILABLE_MONTHS.includes(m))) {
          this.availableMonths = parsedM.filter(m => AVAILABLE_MONTHS.includes(m) || parseInt(m, 10) >= 2608);
        }
      }
      if (!this.availableMonths || this.availableMonths.length === 0) {
        this.availableMonths = [...AVAILABLE_MONTHS];
      }
      if (!this.availableMonths.includes(this.currentYYMM)) {
        this.currentYYMM = this.availableMonths[0] || '2608';
      }
      if (savedMalls) {
        try {
          const parsed = JSON.parse(savedMalls);
          if (Array.isArray(parsed) && parsed.length > 0) {
            this.onlineMalls = parsed;
          }
        } catch (err) {}
      }
    } catch (e) {
      console.error('Local Storage load error:', e);
    }
  }

  saveToLocal() {
    try {
      if (typeof localStorage === 'undefined') return;
      const prefix = this.storagePrefix;
      localStorage.setItem(`${prefix}daily_records`, JSON.stringify(this.dailyRecords));
      localStorage.setItem(`${prefix}monthly_records`, JSON.stringify(this.monthlyRecords));
      localStorage.setItem(`${prefix}current_yymm`, this.currentYYMM);
      localStorage.setItem(`${prefix}available_months`, JSON.stringify(this.availableMonths));
      localStorage.setItem(`${prefix}online_malls`, JSON.stringify(this.onlineMalls));
    } catch (e) {
      console.error('Local Storage save error:', e);
    }
  }

  addOnlineMall(name) {
    if (!name || !name.trim()) return null;
    const trimmed = name.trim();
    let maxCol = 25;
    this.onlineMalls.forEach(m => {
      if (m.colIndex && m.colIndex > maxCol) maxCol = m.colIndex;
    });
    const nextCol = maxCol + 1;
    const colLetter = getColumnLetter(nextCol);
    const id = `mall_custom_${Date.now()}`;
    const newMall = {
      id: id,
      name: trimmed,
      colLetter: colLetter,
      colIndex: nextCol,
      isCustom: true
    };
    this.onlineMalls.push(newMall);
    this.saveToLocal();
    return newMall;
  }

  removeOnlineMall(id) {
    this.onlineMalls = this.onlineMalls.filter(m => m.id !== id);
    this.saveToLocal();
  }

  formatMoney(num) {
    if (isNaN(num) || num === null || num === undefined) return '0';
    return Number(num).toLocaleString('ko-KR');
  }

  parseMoney(val) {
    if (typeof val === 'number') return val;
    if (!val) return 0;
    const clean = String(val).replace(/[^0-9.-]+/g, '');
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  }

  setCurrentYYMM(yymm) {
    this.currentYYMM = yymm;
    if (!this.availableMonths.includes(yymm)) {
      this.availableMonths.push(yymm);
      this.availableMonths.sort();
    }
    this.saveToLocal();
  }

  getDailyKey(yymm, day) {
    return `${yymm}_${String(day).padStart(2, '0')}`;
  }

  getDaily(yymm, day) {
    const key = this.getDailyKey(yymm, day);
    if (!this.dailyRecords[key]) {
      const initial = {
        yymm: yymm,
        day: day,
        prevCash: 600000,
        cashSales: 0,
        cardSales: 0,
        rxSales: 0,
        posOtcSales: 0,
        transferSales: 0,
        expCashBuy: 0,
        expDiscount: 0,
        expMiscCash: 0,
        expMeal: 0,
        expMiscCard: 0,
        expBacchus: 0,
        actualCash: 0,
        notes: ''
      };
      this.onlineMalls.forEach(m => {
        initial[m.id] = 0;
      });
      this.dailyRecords[key] = initial;
    }

    return this.calculateDaily(this.dailyRecords[key]);
  }

  calculateDaily(record) {
    const r = { ...record };

    r.prevCash = this.parseMoney(r.prevCash) || 600000;
    r.cashSales = this.parseMoney(r.cashSales);
    r.cardSales = this.parseMoney(r.cardSales);
    r.rxSales = this.parseMoney(r.rxSales);
    r.posOtcSales = this.parseMoney(r.posOtcSales);
    r.transferSales = this.parseMoney(r.transferSales);

    r.expCashBuy = this.parseMoney(r.expCashBuy);
    r.expDiscount = this.parseMoney(r.expDiscount);
    r.expMiscCash = this.parseMoney(r.expMiscCash);
    r.expMeal = this.parseMoney(r.expMeal);
    r.expMiscCard = this.parseMoney(r.expMiscCard);
    r.expBacchus = this.parseMoney(r.expBacchus);
    
    let onlineMallSum = (r.expBacchus || 0);
    this.onlineMalls.forEach(m => {
      r[m.id] = this.parseMoney(r[m.id]);
      onlineMallSum += r[m.id];
    });

    r.actualCash = this.parseMoney(r.actualCash);

    // 당일 총매출 (E6) = 현금매출(D5) + 카드매출(D6) + 손님계좌이체(I5) + 잡비1(L5)
    r.totalSales = r.cashSales + r.cardSales + r.transferSales + r.expMiscCash;
    // 일반약(매약) 매출 (G6) = 당일총매출(E6) - 전산본부금합(F6)
    r.otcSales = Math.max(0, r.totalSales - r.rxSales);
    // 매약 대조 오차 (장부 매약 vs 포스 일반약)
    r.otcDifference = r.posOtcSales > 0 ? (r.otcSales - r.posOtcSales) : 0;

    r.dailyOnlineMallTotal = onlineMallSum;
    r.totalCashExpenses = (r.expMiscCash || 0);
    r.totalExpenses = r.totalCashExpenses;
    
    r.expectedCashSurplus = r.cashSales - r.totalCashExpenses;
    r.expectedCash = r.prevCash + r.expectedCashSurplus;
    r.cashWithdrawal = Math.max(0, r.actualCash - r.prevCash);
    r.cashDifference = r.actualCash > 0 ? (r.actualCash - r.expectedCash) : 0;

    return r;
  }

  async saveDaily(record) {
    const calculated = this.calculateDaily(record);
    const key = this.getDailyKey(calculated.yymm, calculated.day);
    this.dailyRecords[key] = calculated;
    this.saveToLocal();

    if (window.sheetsClient && window.sheetsClient.isConfigured) {
      try {
        const payload = {
          ...calculated,
          malls: this.onlineMalls.map(m => ({
            id: m.id,
            name: m.name,
            colIndex: m.colIndex,
            colLetter: m.colLetter,
            amount: calculated[m.id] || 0
          }))
        };
        await window.sheetsClient.saveDaily(calculated.yymm, calculated.day, payload);
      } catch (err) {
        console.warn("Google Sheets save error:", err);
      }
    }
    return calculated;
  }

  getMonthSummary(yymm) {
    let totalSalesSum = 0;
    let otcSalesSum = 0;
    let rxSalesSum = 0;
    let cashSalesSum = 0;
    let cardSalesSum = 0;
    let cashBuySum = 0;
    let expDiscountSum = 0;
    let expMiscCashSum = 0;
    let expMealSum = 0;
    let expMiscCardSum = 0;
    let expBacchusSum = 0;
    let onlineMallCardTotal = 0;
    let daysWithData = 0;

    for (let day = 1; day <= 31; day++) {
      const rec = this.getDaily(yymm, day);
      if (rec.totalSales > 0 || rec.actualCash > 0) daysWithData++;
      totalSalesSum += rec.totalSales;
      otcSalesSum += rec.otcSales;
      rxSalesSum += rec.rxSales;
      cashSalesSum += rec.cashSales;
      cardSalesSum += rec.cardSales;
      cashBuySum += rec.expCashBuy;
      expDiscountSum += rec.expDiscount;
      expMiscCashSum += rec.expMiscCash;
      expMealSum += rec.expMeal;
      expMiscCardSum += rec.expMiscCard;
      expBacchusSum += rec.expBacchus;

      onlineMallCardTotal += (rec.dailyOnlineMallTotal || 0);
    }

    return {
      yymm,
      daysWithData,
      totalSalesSum,
      otcSalesSum,
      rxSalesSum,
      cashSalesSum,
      cardSalesSum,
      cashBuySum,
      expDiscountSum,
      expMiscCashSum,
      expMealSum,
      expMiscCardSum,
      expBacchusSum,
      onlineMallCardTotal
    };
  }

  getMonthly(yymm) {
    const summary = this.getMonthSummary(yymm);

    let rec = this.monthlyRecords[yymm];
    if (!rec) {
      rec = {
        yymm: yymm,
        incomeRxFee: 28500000,
        incomeNhisClaim: 68200000,
        incomeNonCovered: 0,
        cardSpendSamsung: 0,
        cardSpendKB: 0,
        cardSpendShinhan: 0,
        cardSpendWoori: 0,
        expRent: 15070000,
        expSaving: 1000000,
        expYellowUmbrella: 400000,
        expPension: 340000,
        expDining: 0,
        expFinanceBusan: 0,
        expFinanceWoori: 0,
        notes: ''
      };
    }

    if (!rec.cashVendors || !Array.isArray(rec.cashVendors) || rec.cashVendors.length === 0) {
      rec.cashVendors = DEFAULT_CASH_VENDORS.map(v => ({ ...v }));
    }
    if (!rec.cardVendors || !Array.isArray(rec.cardVendors) || rec.cardVendors.length === 0) {
      rec.cardVendors = DEFAULT_CARD_VENDORS.map(v => ({ ...v }));
    }
    if (!rec.employees || !Array.isArray(rec.employees) || rec.employees.length === 0) {
      rec.employees = DEFAULT_EMPLOYEES.map(v => ({ ...v }));
    }
    if (!rec.utilities || !Array.isArray(rec.utilities) || rec.utilities.length === 0) {
      rec.utilities = DEFAULT_UTILITIES.map(v => ({ ...v }));
    }
    if (!rec.discounts || !Array.isArray(rec.discounts) || rec.discounts.length === 0) {
      rec.discounts = DEFAULT_DISCOUNTS.map(v => ({ ...v }));
    }
    if (!rec.pharmTrades || !Array.isArray(rec.pharmTrades) || rec.pharmTrades.length === 0) {
      rec.pharmTrades = DEFAULT_PHARM_TRADES.map(v => ({ ...v }));
    }
    if (!rec.severances || !Array.isArray(rec.severances) || rec.severances.length === 0) {
      rec.severances = DEFAULT_SEVERANCES.map(v => ({ ...v }));
    }
    if (!rec.cardCashbacks || !Array.isArray(rec.cardCashbacks) || rec.cardCashbacks.length === 0) {
      rec.cardCashbacks = DEFAULT_CARD_CASHBACKS.map(v => ({ ...v }));
    }

    return this.calculateMonthly(rec, summary);
  }

  calculateMonthly(record, summary = null) {
    const m = { ...record };
    const s = summary || this.getMonthSummary(m.yymm);

    // 1. 이론적 총수익 분석 (B4:C13)
    m.otcMarginRate = m.otcMarginRate !== undefined ? parseFloat(m.otcMarginRate) : 40;
    m.otcTotalSales = this.parseMoney(m.otcTotalSales) || (s.otcSalesSum || 0);
    m.otcProfit = Math.round(m.otcTotalSales * (m.otcMarginRate / 100));
    m.otcDailyAvg = Math.round(m.otcTotalSales / 30);
    m.incomeRxFee = this.parseMoney(m.incomeRxFee);
    m.incomeNonCovered = this.parseMoney(m.incomeNonCovered);

    // 2. 수입 부문 (O4:P36)
    m.incomeOtcRaw = m.otcTotalSales;
    m.incomeCopay = this.parseMoney(m.incomeCopay) || (s.rxSalesSum || 0);
    m.incomeNhisClaim = this.parseMoney(m.incomeNhisClaim);
    m.incomeDiscount = this.parseMoney(m.incomeDiscount) || (s.expDiscountSum || 0);

    if (!m.cardCashbacks || !Array.isArray(m.cardCashbacks) || m.cardCashbacks.length === 0) {
      m.cardCashbacks = DEFAULT_CARD_CASHBACKS.map(v => ({ ...v }));
    }

    let cashbackSum = 0;
    m.cardCashbacks.forEach(c => {
      c.spend = this.parseMoney(c.spend || c.amount);
      c.rate = c.rate !== undefined ? parseFloat(c.rate) : 1.5;
      c.cashback = c.spend > 0 ? Math.round(c.spend * (c.rate / 100)) : 0;
      cashbackSum += c.cashback;
    });
    m.totalCashback = cashbackSum;

    let pharmTradeSum = 0;
    if (m.pharmTrades && Array.isArray(m.pharmTrades)) {
      m.pharmTrades.forEach(v => { pharmTradeSum += this.parseMoney(v.amount); });
    }
    m.totalPharmTrades = pharmTradeSum;

    let discountSum = 0;
    if (m.discounts && Array.isArray(m.discounts)) {
      m.discounts.forEach(v => { discountSum += this.parseMoney(v.amount); });
    }
    m.totalDiscounts = discountSum;

    m.theoreticalProfit = m.incomeRxFee + m.otcProfit + m.totalDiscounts + m.incomeNonCovered + m.totalCashback;
    m.grossIncome = m.incomeOtcRaw + m.incomeCopay + m.incomeNhisClaim + m.totalDiscounts + m.totalPharmTrades + m.incomeDiscount;

    // 3. 지출 부문 (R4:S43)
    let cashVendorSum = 0;
    if (m.cashVendors && Array.isArray(m.cashVendors)) {
      m.cashVendors.forEach((v, i) => {
        if (i === 9 || (v.name && v.name.includes('현매'))) {
          v.amount = s.cashBuySum || 0;
        }
        cashVendorSum += this.parseMoney(v.amount);
      });
    }
    m.vendorCashTotal = cashVendorSum;

    let cardVendorSum = 0;
    if (m.cardVendors && Array.isArray(m.cardVendors)) {
      m.cardVendors.forEach((v) => {
        if (v.name && v.name.includes('온라인몰결제총합')) {
          v.amount = s.onlineMallCardTotal || 0;
        }
        cardVendorSum += this.parseMoney(v.amount);
      });
    }
    m.vendorCardTotal = cardVendorSum;

    let payrollSum = 0;
    if (m.employees && Array.isArray(m.employees)) {
      m.employees.forEach(v => { payrollSum += this.parseMoney(v.amount); });
    }
    m.expPayroll = payrollSum;

    let utilitySum = 0;
    if (m.utilities && Array.isArray(m.utilities)) {
      m.utilities.forEach(v => { utilitySum += this.parseMoney(v.amount); });
    }
    m.expUtility = utilitySum;

    let severanceSum = 0;
    if (m.severances && Array.isArray(m.severances)) {
      m.severances.forEach(v => { severanceSum += this.parseMoney(v.amount); });
    }
    m.expSeverance = severanceSum;

    m.expRent = this.parseMoney(m.expRent) || 15070000;
    m.expCardFee = Math.round((s.cardSalesSum || 0) * 0.016);
    m.expPension = this.parseMoney(m.expPension) || 340000;
    m.expSaving = this.parseMoney(m.expSaving) || 1000000;
    m.expYellowUmbrella = this.parseMoney(m.expYellowUmbrella) || 400000;

    m.expDining = this.parseMoney(m.expDining);
    m.expMiscCashSum = s.expMiscCashSum || 0;
    m.expMiscCardSum = (s.expMiscCardSum || 0);
    m.expMealSum = (s.expMealSum || 0);
    m.expOtherOperating = m.expDining + m.expMiscCashSum + m.expMiscCardSum + m.expMealSum;

    m.expFinanceBusan = this.parseMoney(m.expFinanceBusan);
    m.expFinanceWoori = this.parseMoney(m.expFinanceWoori);
    m.expFinance = m.expFinanceBusan + m.expFinanceWoori;

    m.grossExpenses = m.vendorCashTotal + m.vendorCardTotal + m.expPayroll + m.expUtility + m.expRent + 
                      m.expOtherOperating + m.expCardFee + m.expFinance + m.expPension + m.expSaving + 
                      m.expYellowUmbrella + m.expSeverance;

    m.netSurplus = m.grossIncome - m.grossExpenses;

    return m;
  }

  async saveMonthly(record) {
    const summary = this.getMonthSummary(record.yymm);
    const calculated = this.calculateMonthly(record, summary);
    this.monthlyRecords[calculated.yymm] = calculated;
    this.saveToLocal();

    if (window.sheetsClient && window.sheetsClient.isConfigured) {
      try {
        await window.sheetsClient.saveMonthly(`${calculated.yymm}결산`, calculated);
      } catch (err) {
        console.warn("Google Sheets save error:", err);
      }
    }
    return calculated;
  }

  updateCustomItem(yymm, listKey, index, field, value) {
    const m = this.getMonthly(yymm);
    if (m[listKey] && m[listKey][index]) {
      m[listKey][index][field] = (field === 'amount' || field === 'spend') ? this.parseMoney(value) : value;
      this.monthlyRecords[yymm] = this.calculateMonthly(m);
      this.saveToLocal();
    }
  }

  addCustomItem(yymm, listKey, item) {
    const m = this.getMonthly(yymm);
    if (!m[listKey]) m[listKey] = [];
    m[listKey].push(item);
    this.monthlyRecords[yymm] = this.calculateMonthly(m);
    this.saveToLocal();
  }

  removeCustomItem(yymm, listKey, index) {
    const m = this.getMonthly(yymm);
    if (m[listKey] && m[listKey][index]) {
      m[listKey].splice(index, 1);
      this.monthlyRecords[yymm] = this.calculateMonthly(m);
      this.saveToLocal();
    }
  }

  async loadMonthFromSheets(yymm) {
    if (!window.sheetsClient || !window.sheetsClient.isConfigured) return;
    try {
      const result = await window.sheetsClient.getFullMonthData(yymm);
      if (result && result.success && result.data) {
        // 1. 1일~31일 일일 장부 전체 동기화
        if (result.data.dailyList && Array.isArray(result.data.dailyList)) {
          result.data.dailyList.forEach(daily => {
            if (daily && daily.day) {
              const key = this.getDailyKey(yymm, daily.day);
              this.dailyRecords[key] = this.calculateDaily({
                yymm: yymm,
                day: daily.day,
                prevCash: daily.prevCash || 600000,
                cashSales: daily.cashSales || 0,
                cardSales: daily.cardSales || 0,
                rxSales: daily.rxSales || 0,
                posOtcSales: daily.posOtcSales || 0,
                transferSales: daily.transferSales || 0,
                expCashBuy: daily.expCashBuy || 0,
                expDiscount: daily.expDiscount || 0,
                expMiscCash: daily.expMiscCash || 0,
                expMeal: daily.expMeal || 0,
                expMiscCard: daily.expMiscCard || 0,
                expBacchus: daily.expBacchus || 0,
                actualCash: daily.actualCash || 0,
                ...daily
              });
            }
          });
        }

        // 2. 월말 결산 전체 동기화
        if (result.data.monthly) {
          const d = result.data.monthly;
          const current = this.getMonthly(yymm);

          if (d.incomeRxFee !== undefined) current.incomeRxFee = d.incomeRxFee;
          if (d.incomeCopay !== undefined) current.incomeCopay = d.incomeCopay;
          if (d.incomeNhisClaim !== undefined) current.incomeNhisClaim = d.incomeNhisClaim;
          if (d.otcTotalSales !== undefined) current.otcTotalSales = d.otcTotalSales;
          if (d.cashVendors && Array.isArray(d.cashVendors)) current.cashVendors = d.cashVendors;
          if (d.cardVendors && Array.isArray(d.cardVendors)) current.cardVendors = d.cardVendors;
          if (d.employees && Array.isArray(d.employees)) current.employees = d.employees;
          if (d.severances && Array.isArray(d.severances)) current.severances = d.severances;
          if (d.utilities && Array.isArray(d.utilities)) current.utilities = d.utilities;
          if (d.discounts && Array.isArray(d.discounts)) current.discounts = d.discounts;
          if (d.pharmTrades && Array.isArray(d.pharmTrades)) current.pharmTrades = d.pharmTrades;
          if (d.cardCashbacks && Array.isArray(d.cardCashbacks)) current.cardCashbacks = d.cardCashbacks;

          this.monthlyRecords[yymm] = this.calculateMonthly(current);
        }
        this.saveToLocal();
      }
    } catch (e) {
      console.warn(`Load monthly from sheets (${yymm}) failed:`, e);
      throw e;
    }
  }

  clearLocalCache() {
    try {
      const prefix = this.storagePrefix;
      localStorage.removeItem(`${prefix}daily_records`);
      localStorage.removeItem(`${prefix}monthly_records`);
      this.dailyRecords = {};
      this.monthlyRecords = {};
    } catch (e) {}
  }

  getTrendData() {
    const list = [];
    const validMonths = this.availableMonths.filter(m => /^[0-9]{4}$/.test(m));

    validMonths.forEach(mStr => {
      const m = this.getMonthly(mStr);
      const yy = mStr.substring(0, 2);
      const mm = mStr.substring(2, 4);

      list.push({
        yymm: mStr,
        month: `${yy}.${mm}`,
        otcSales: m.otcTotalSales || 0,
        netProfit: m.netSurplus || 0
      });
    });

    return list.map((item, index, arr) => {
      const windowItems = arr.slice(Math.max(0, index - 11), index + 1);
      const sum = windowItems.reduce((acc, curr) => acc + curr.otcSales, 0);
      const ma12 = Math.round(sum / windowItems.length);
      return {
        ...item,
        ma12: ma12
      };
    });
  }
}

window.store = new PharmacyStore();


// ==========================================
// 4. UI Component Renderer (ui.js 100% 완전 원본)
// ==========================================
const UI = {
  currentRoute: 'daily-settlement',
  selectedDay: 1,
  activeMonthlyTab: 0,

  init() {
    this.renderHeader();
    this.renderNavigation();
    this.renderCurrentView();
  },

  navigateTo(route) {
    this.currentRoute = route;
    this.renderNavigation();
    this.renderCurrentView();
  },

  navigate(route) {
    this.navigateTo(route);
  },

  renderHeader() {
    const headerEl = document.getElementById('header-container');
    if (!headerEl) return;

    const currentYYMM = window.store.currentYYMM;
    const monthlyData = window.store.getMonthly(currentYYMM);
    const isConfigured = window.sheetsClient && window.sheetsClient.isConfigured;
    const pName = window.store.pharmacyName || '신세계약국';
    const pBadge = window.store.pharmacyBadge || '신세계';
    const pSubtitle = window.store.pharmacySubtitle || '일일정산 & 월말결제 스마트 시스템';

    headerEl.innerHTML = `
      <div class="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        <!-- Pharmacy Logo & Title -->
        <div class="flex items-center gap-3 cursor-pointer" onclick="UI.navigateTo('daily-settlement')">
          <div class="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-black shadow-md text-sm">
            ${pBadge}
          </div>
          <div>
            <h1 class="font-extrabold text-white text-base tracking-tight flex items-center gap-2">
              ${pName} 스마트 장부
              <span class="text-[10px] px-2 py-0.5 rounded-full ${isConfigured ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-slate-700 text-slate-300'} font-bold">
                ${isConfigured ? '⚡ Google Sheets 연동' : '💾 로컬 모드'}
              </span>
            </h1>
            <p class="text-xs text-slate-400 font-medium">${pSubtitle}</p>
          </div>
        </div>

        <!-- Year/Month Picker, Surplus Badge & Tools -->
        <div class="flex items-center gap-2 flex-wrap">
          <!-- Quick Year/Month Selector -->
          <div class="flex items-center bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-xs font-bold">
            <i data-lucide="calendar" class="w-3.5 h-3.5 text-amber-400 mr-2"></i>
            <select 
              id="header-month-selector"
              onchange="UI.handleMonthChange(this.value)"
              class="bg-transparent text-white font-bold outline-none cursor-pointer"
            >
              ${window.store.availableMonths.map(m => `
                <option value="${m}" ${m === currentYYMM ? 'selected' : ''} class="bg-slate-900 text-white">
                  20${m.substring(0,2)}년 ${m.substring(2,4)}월 (${m})
                </option>
              `).join('')}
            </select>
          </div>

          <!-- M2 Surplus Badge -->
          <div class="bg-slate-800/90 px-3 py-1.5 rounded-xl border border-slate-700 text-xs flex items-center gap-1.5 shadow-sm">
            <i data-lucide="wallet" class="w-3.5 h-3.5 text-amber-400"></i>
            <span class="text-slate-400">실질 순잉여금(M2):</span>
            <span class="font-black text-amber-400">₩${window.store.formatMoney(monthlyData.netSurplus)}</span>
          </div>

          <!-- Sync Button -->
          <button 
            onclick="UI.syncWithGoogleSheets()" 
            id="sync-btn"
            class="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-emerald-500/40 text-xs font-bold flex items-center gap-1.5 transition shadow-sm"
            title="구글 스프레드시트 최신 데이터 실시간 동기화"
          >
            <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i>
            <span class="hidden sm:inline">시트 동기화</span>
          </button>

          <!-- Settings Button -->
          <button 
            onclick="UI.showSettingsModal()"
            class="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
            title="구글 시트 연동 설정"
          >
            <i data-lucide="settings" class="w-4 h-4 text-amber-400"></i>
          </button>

          <!-- Create Next Month Button -->
          <button 
            onclick="UI.showNewMonthModal()"
            class="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center gap-1 shadow-lg transition"
          >
            <i data-lucide="plus-circle" class="w-4 h-4"></i>
            <span>새 월 장부 생성</span>
          </button>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();
  },

  renderNavigation() {
    const navEl = document.getElementById('dynamic-nav-container');
    if (!navEl) return;

    const navItems = [
      { id: 'daily-settlement', label: '일일 정산 (일일장부)', icon: 'calculator' },
      { id: 'monthly-settlement', label: '월말 결산 (월간금전출납부)', icon: 'receipt' },
      { id: 'trends', label: '소득 추이 통계 (12M MA)', icon: 'trending-up' }
    ];

    navEl.innerHTML = navItems.map(item => `
      <button 
        onclick="UI.navigateTo('${item.id}')"
        class="px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition whitespace-nowrap ${
          this.currentRoute === item.id 
            ? 'bg-amber-500 text-slate-950 shadow-md' 
            : 'text-slate-400 hover:text-white hover:bg-slate-800'
        }"
      >
        <i data-lucide="${item.icon}" class="w-4 h-4"></i>
        <span>${item.label}</span>
      </button>
    `).join('');

    if (window.lucide) window.lucide.createIcons();
  },

  renderCurrentView() {
    const appContainer = document.getElementById('app-container');
    if (!appContainer) return;

    switch (this.currentRoute) {
      case 'daily-settlement':
        appContainer.innerHTML = this.renderDailySettlementHTML();
        break;
      case 'monthly-settlement':
        appContainer.innerHTML = this.renderMonthlySettlementHTML();
        break;
      case 'trends':
        appContainer.innerHTML = this.renderTrendsHTML();
        setTimeout(() => {
          const trendData = window.store.getTrendData();
          ChartsController.renderAnalyticsCharts(trendData);
        }, 50);
        break;
      default:
        appContainer.innerHTML = this.renderDailySettlementHTML();
    }

    if (window.lucide) window.lucide.createIcons();
  },

  handleMonthChange(yymm) {
    window.store.setCurrentYYMM(yymm);
    this.selectedDay = 1;
    this.renderHeader();
    this.renderCurrentView();
  },

  selectDay(day) {
    this.selectedDay = day;
    this.renderCurrentView();
  },

  // ================= 1. 일일 정산 HTML 뷰 =================
  renderDailySettlementHTML() {
    const yymm = window.store.currentYYMM;
    const day = this.selectedDay;
    const rec = window.store.getDaily(yymm, day);
    const summary = window.store.getMonthSummary(yymm);

    const year = 2000 + parseInt(yymm.substring(0, 2), 10);
    const month = parseInt(yymm.substring(2, 4), 10);
    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDayOfWeek = new Date(year, month - 1, 1).getDay();

    const today = new Date();
    const isCurrentYearMonth = today.getFullYear() === year && (today.getMonth() + 1) === month;
    const todayDate = today.getDate();

    const emptySlots = Array.from({ length: firstDayOfWeek }).map(() => `
      <div class="min-h-[46px] rounded-xl bg-slate-950/20 border border-dashed border-slate-800/30 opacity-20 select-none pointer-events-none"></div>
    `).join('');

    const dayCells = Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
      const r = window.store.getDaily(yymm, d);
      const hasData = r.totalSales > 0 || r.actualCash > 0;
      const isSelected = d === day;
      const isToday = isCurrentYearMonth && d === todayDate;
      const dayOfWeek = (firstDayOfWeek + d - 1) % 7;

      let dayNumColor = 'text-slate-200';
      if (dayOfWeek === 0) dayNumColor = 'text-rose-400';
      else if (dayOfWeek === 6) dayNumColor = 'text-sky-400';

      if (isSelected) {
        return `
          <button 
            onclick="UI.selectDay(${d})"
            class="group relative min-h-[48px] py-1.5 px-1 rounded-xl font-bold transition flex flex-col items-center justify-between bg-gradient-to-br from-amber-400 via-amber-500 to-amber-600 text-slate-950 shadow-lg shadow-amber-500/25 ring-2 ring-amber-300 scale-[1.02] z-10"
          >
            <div class="flex items-center justify-between w-full px-1.5">
              <span class="text-xs sm:text-sm font-black leading-tight">${d}</span>
              ${isToday ? '<span class="text-[9px] bg-slate-950/80 text-amber-300 px-1 rounded font-black leading-none py-0.5">오늘</span>' : ''}
            </div>
            <div class="flex items-center gap-1 mt-1">
              <span class="w-1.5 h-1.5 rounded-full ${hasData ? 'bg-slate-950' : 'bg-slate-950/40'}"></span>
            </div>
          </button>
        `;
      }

      return `
        <button 
          onclick="UI.selectDay(${d})"
          class="group relative min-h-[48px] py-1.5 px-1 rounded-xl font-bold transition flex flex-col items-center justify-between ${
            hasData 
              ? 'bg-slate-800/90 hover:bg-slate-750 border border-slate-700/90 shadow-sm text-slate-100' 
              : 'bg-slate-950/50 hover:bg-slate-850/60 border border-slate-800/60 text-slate-400 hover:text-slate-200'
          } ${isToday ? 'ring-1 ring-sky-400/80 ring-offset-1 ring-offset-slate-900' : ''}"
        >
          <div class="flex items-center justify-between w-full px-1.5">
            <span class="text-xs sm:text-sm font-bold leading-tight ${dayNumColor}">${d}</span>
            ${isToday ? '<span class="text-[9px] bg-sky-500/20 text-sky-300 border border-sky-500/30 px-1 rounded font-bold leading-none py-0.5">오늘</span>' : ''}
          </div>
          <div class="flex items-center gap-1 mt-1">
            <span class="w-1.5 h-1.5 rounded-full ${
              hasData ? 'bg-emerald-400 shadow-sm shadow-emerald-400/80' : 'bg-transparent'
            }"></span>
          </div>
        </button>
      `;
    }).join('');

    const targetDateObj = new Date(year, month - 1, day);
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    const currentDayName = dayNames[targetDateObj.getDay()];

    return `
      <div class="space-y-6 animate-fadeIn text-slate-100">
        <!-- 7열 미니 캘린더 달력 그리드 -->
        <div class="bg-slate-900/90 rounded-2xl p-4 sm:p-5 border border-slate-800 shadow-xl space-y-3">
          <div class="flex items-center justify-between flex-wrap gap-2 px-1">
            <div class="flex items-center gap-2">
              <span class="text-xs sm:text-sm font-bold text-amber-400 flex items-center gap-1.5">
                <i data-lucide="calendar" class="w-4 h-4 text-amber-400"></i>
                <span>20${yymm.substring(0, 2)}년 ${yymm.substring(2, 4)}월 일일장부</span>
              </span>
              <span class="text-xs text-slate-400 font-medium">| 선택일: <strong class="text-white font-bold">${day}일 (${currentDayName})</strong></span>
            </div>
            <div class="flex items-center gap-2">
              <div class="flex items-center gap-1 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800 text-xs">
                <button onclick="UI.selectDay(Math.max(1, ${day} - 1))" class="p-0.5 text-slate-400 hover:text-white" title="이전 날짜">◀</button>
                <span class="font-black text-amber-400 px-1.5">${day}일 (${currentDayName})</span>
                <button onclick="UI.selectDay(Math.min(${daysInMonth}, ${day} + 1))" class="p-0.5 text-slate-400 hover:text-white" title="다음 날짜">▶</button>
              </div>
              <span class="text-[11px] text-slate-400 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
                입력 완료: <b class="text-emerald-400">${summary.daysWithData}</b>일 / ${daysInMonth}일
              </span>
            </div>
          </div>

          <!-- 7열 요일 헤더 -->
          <div class="grid grid-cols-7 gap-1.5 sm:gap-2 text-center text-xs font-bold py-1 border-b border-slate-800/80">
            <span class="text-rose-400">일</span>
            <span class="text-slate-400">월</span>
            <span class="text-slate-400">화</span>
            <span class="text-slate-400">수</span>
            <span class="text-slate-400">목</span>
            <span class="text-slate-400">금</span>
            <span class="text-sky-400">토</span>
          </div>

          <!-- 7열 날짜 타일 그리드 -->
          <div class="grid grid-cols-7 gap-1.5 sm:gap-2">
            ${emptySlots}
            ${dayCells}
          </div>
        </div>

        <!-- 1. 당일 매출 실적 블루 배너 -->
        <div class="bg-slate-900/90 rounded-2xl p-5 border border-slate-800 shadow-xl space-y-4">
          <div class="flex justify-between items-center border-b border-slate-800 pb-3">
            <h2 class="text-sm font-bold text-slate-200 flex items-center gap-2">
              <i data-lucide="calculator" class="w-4 h-4 text-amber-400"></i>
              <span>당일 매출 실적 (${yymm} 시트)</span>
            </h2>
            <span class="text-xs text-amber-400 font-bold">${day}일</span>
          </div>

          <!-- 총매출 블루 배너 -->
          <div class="bg-gradient-to-r from-blue-950/80 to-slate-900 p-4 rounded-xl border border-blue-900/40 flex justify-between items-center">
            <div>
              <span class="text-xs text-blue-300 font-medium">당일 총매출 (E열 자동계산)</span>
            </div>
            <div class="text-right">
              <span class="text-[10px] text-slate-400 block mb-0.5">현금(D5)+카드(D9)+이체(I5)+잡비(L5)</span>
              <span class="text-2xl font-black text-blue-400 tracking-tight">₩${window.store.formatMoney(rec.totalSales)}</span>
            </div>
          </div>

          <!-- 4대 매출 입력란 -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div class="space-y-1">
              <label class="text-slate-400 block font-medium">현금매출 (D5)</label>
              <input type="text" inputmode="numeric" value="${window.store.formatMoney(rec.cashSales)}" oninput="UI.handleDailyChange('cashSales', this)" class="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-right font-bold text-white outline-none focus:border-amber-400" placeholder="0"/>
            </div>

            <div class="space-y-1">
              <label class="text-slate-400 block font-medium">카드매출 (D9)</label>
              <input type="text" inputmode="numeric" value="${window.store.formatMoney(rec.cardSales)}" oninput="UI.handleDailyChange('cardSales', this)" class="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-right font-bold text-white outline-none focus:border-amber-400" placeholder="0"/>
            </div>

            <div class="space-y-1">
              <label class="text-slate-400 block font-medium">전산본부금합 (F5)</label>
              <input type="text" inputmode="numeric" value="${window.store.formatMoney(rec.rxSales)}" oninput="UI.handleDailyChange('rxSales', this)" class="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-right font-bold text-white outline-none focus:border-amber-400" placeholder="0"/>
            </div>

            <div class="space-y-1">
              <label class="text-slate-400 block font-medium">손님계좌이체 (I1)</label>
              <input type="text" inputmode="numeric" value="${window.store.formatMoney(rec.transferSales)}" oninput="UI.handleDailyChange('transferSales', this)" class="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-right font-bold text-white outline-none focus:border-amber-400" placeholder="0"/>
            </div>
          </div>

          <!-- POS 일반약 대조 박스 -->
          <div class="bg-slate-950/70 p-4 rounded-xl border border-slate-800/80 space-y-3">
            <div class="flex justify-between items-center text-xs">
              <span class="text-slate-300 font-bold">1. 장부 계산 매약매출 (G5 = E5 - F5):</span>
              <span class="text-base font-black text-amber-400">₩${window.store.formatMoney(rec.otcSales)}</span>
            </div>
            <div class="flex justify-between items-center text-xs gap-3">
              <label class="text-slate-400">2. 포스기 일반약 마감 금액:</label>
              <input type="text" inputmode="numeric" value="${window.store.formatMoney(rec.posOtcSales)}" oninput="UI.handleDailyChange('posOtcSales', this)" class="w-40 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1 text-right font-bold text-white outline-none focus:border-amber-400" placeholder="0"/>
            </div>
            ${rec.posOtcSales > 0 ? `
              <div class="pt-2 border-t border-slate-800 flex justify-between items-center text-xs">
                <span class="text-slate-400 font-medium">매약 대조 차액 (장부 - 포스):</span>
                <span class="font-extrabold ${rec.otcDifference === 0 ? 'text-emerald-400' : rec.otcDifference > 0 ? 'text-amber-400' : 'text-rose-400'}">
                  ${rec.otcDifference > 0 ? '+' : ''}₩${window.store.formatMoney(rec.otcDifference)}
                  ${rec.otcDifference === 0 ? ' (완벽 일치)' : ' (차액 발생)'}
                </span>
              </div>
            ` : ''}
          </div>
        </div>

        <!-- 2. 당일 지출 & 온라인몰 카드 즉시결제 -->
        <div class="bg-slate-900/90 rounded-2xl p-5 border border-slate-800 shadow-xl space-y-4">
          <h2 class="text-sm font-bold text-slate-200 flex items-center gap-2 border-b border-slate-800 pb-3">
            <i data-lucide="shopping-bag" class="w-4 h-4 text-purple-400"></i>
            <span>당일 지출 & 카드 즉시결제</span>
          </h2>

          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div class="space-y-1">
              <label class="text-slate-400 block font-medium">현매사입 (J5 통장)</label>
              <input type="text" inputmode="numeric" value="${window.store.formatMoney(rec.expCashBuy)}" oninput="UI.handleDailyChange('expCashBuy', this)" class="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-right font-bold text-white outline-none focus:border-purple-400" placeholder="0"/>
            </div>

            <div class="space-y-1">
              <label class="text-slate-400 block font-medium">직원할인구매 (K5)</label>
              <input type="text" inputmode="numeric" value="${window.store.formatMoney(rec.expDiscount)}" oninput="UI.handleDailyChange('expDiscount', this)" class="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-right font-bold text-white outline-none focus:border-purple-400" placeholder="0"/>
            </div>

            <div class="space-y-1">
              <label class="text-slate-400 block font-medium">잡비1 현금 (L5 금고)</label>
              <input type="text" inputmode="numeric" value="${window.store.formatMoney(rec.expMiscCash)}" oninput="UI.handleDailyChange('expMiscCash', this)" class="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-right font-bold text-white outline-none focus:border-purple-400" placeholder="0"/>
            </div>

            <div class="space-y-1">
              <label class="text-slate-400 block font-medium">식대 (M5 통장)</label>
              <input type="text" inputmode="numeric" value="${window.store.formatMoney(rec.expMeal)}" oninput="UI.handleDailyChange('expMeal', this)" class="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-right font-bold text-white outline-none focus:border-purple-400" placeholder="0"/>
            </div>
          </div>

          <!-- 온라인몰 카드 즉시결제 (P~Z열 + 박카스) -->
          <div class="bg-slate-950/70 p-4 rounded-xl border border-slate-800 space-y-3">
            <div class="flex justify-between items-center border-b border-slate-800 pb-2">
              <span class="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                <i data-lucide="credit-card" class="w-3.5 h-3.5 text-purple-400"></i>
                <span>온라인몰 카드 즉시결제 (P~Z열 + 박카스)</span>
              </span>
              <button onclick="UI.showAddOnlineMallModal()" class="px-2 py-1 bg-purple-950/80 hover:bg-purple-900 text-purple-300 rounded-lg text-xs font-bold border border-purple-500/40 transition">
                + 몰 추가
              </button>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
              <div class="space-y-1">
                <label class="text-slate-400 block truncate">박카스 (O5)</label>
                <input type="text" inputmode="numeric" value="${window.store.formatMoney(rec.expBacchus)}" oninput="UI.handleDailyChange('expBacchus', this)" class="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-right font-bold text-white outline-none focus:border-purple-400" placeholder="0"/>
              </div>

              ${window.store.onlineMalls.map(m => `
                <div class="space-y-1 relative group">
                  <div class="flex justify-between items-center">
                    <label class="text-slate-400 block truncate">${m.name} (${m.colLetter}5)</label>
                    ${m.isCustom ? `
                      <button onclick="UI.removeOnlineMall('${m.id}')" class="text-rose-400 hover:text-rose-300 text-[10px] opacity-0 group-hover:opacity-100 transition">삭제</button>
                    ` : ''}
                  </div>
                  <input type="text" inputmode="numeric" value="${window.store.formatMoney(rec[m.id])}" oninput="UI.handleDailyChange('${m.id}', this)" class="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-right font-bold text-white outline-none focus:border-purple-400" placeholder="0"/>
                </div>
              `).join('')}
            </div>

            <div class="pt-2 border-t border-slate-800 flex justify-between items-center text-xs">
              <span class="text-slate-400 font-bold">당일 온라인몰 카드즉시결제 소계:</span>
              <span class="text-sm font-black text-purple-400">₩${window.store.formatMoney(rec.dailyOnlineMallTotal)}</span>
            </div>
          </div>
        </div>

        <!-- 3. 마감 시재 & 통장 입금방식 정산 -->
        <div class="bg-slate-900/90 rounded-2xl p-5 border border-slate-800 shadow-xl space-y-4">
          <h2 class="text-sm font-bold text-slate-200 flex items-center gap-2 border-b border-slate-800 pb-3">
            <i data-lucide="vault" class="w-4 h-4 text-emerald-400"></i>
            <span>마감 시재 & 통장 입금방식 정산</span>
          </h2>

          <div class="space-y-3 text-xs">
            <div class="space-y-1">
              <label class="text-emerald-400 block font-bold">1. 금고 실제 총 보유 현금 (직접 세어 입력):</label>
              <input type="text" inputmode="numeric" value="${window.store.formatMoney(rec.actualCash)}" oninput="UI.handleDailyChange('actualCash', this)" class="w-full bg-slate-950 border border-emerald-500/60 rounded-xl p-3 text-right text-lg font-black text-emerald-400 outline-none focus:border-emerald-400" placeholder="0"/>
            </div>

            <div class="flex justify-between items-center py-2 bg-slate-950/60 px-3 rounded-xl border border-slate-800/80">
              <span class="text-slate-400">내일 남겨둘 잔돈 시재:</span>
              <span class="font-bold text-white">₩${window.store.formatMoney(rec.prevCash)}</span>
            </div>

            <div class="p-3 bg-amber-950/20 border border-amber-500/30 rounded-xl flex justify-between items-center">
              <div>
                <span class="text-xs text-amber-300 font-bold block">오늘 통장에 입금할 현금:</span>
                <span class="text-[10px] text-slate-400">금고 총액 - 내일 시재 60만 원</span>
              </div>
              <span class="text-lg font-black text-amber-400">₩${window.store.formatMoney(rec.cashWithdrawal)}</span>
            </div>

            <div class="flex justify-between items-center pt-2 text-xs border-t border-slate-800">
              <span class="text-slate-400">시재 과부족 오차 (실제 - 장부장산):</span>
              <span class="font-extrabold ${rec.cashDifference === 0 ? 'text-emerald-400' : 'text-rose-400'}">
                ${rec.cashDifference === 0 ? '✓ 시재 잔액 일치 (오차 0원)' : `오차 발생: ₩${window.store.formatMoney(rec.cashDifference)}`}
              </span>
            </div>
          </div>

          <!-- 일일 정산 저장 버튼 -->
          <div class="pt-3">
            <button onclick="UI.saveCurrentDaily()" class="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-sm shadow-lg flex items-center justify-center gap-2 transition">
              <i data-lucide="save" class="w-4 h-4"></i>
              <span>${day}일 결산 저장 (구글 시트 동기화)</span>
            </button>
          </div>
        </div>

        <!-- 당월 누적 집계 푸터 바 (247~250행 1:1 연동) -->
        <div class="bg-slate-900/95 p-4 rounded-2xl border border-slate-800 shadow-xl text-xs space-y-2">
          <div class="text-slate-400 font-bold flex items-center gap-1.5">
            <i data-lucide="layers" class="w-3.5 h-3.5 text-amber-400"></i>
            <span>20${yymm.substring(0, 2)}년 ${yymm.substring(2, 4)}월 당월 누적 집계 (현재 247~250행 1:1 연동)</span>
          </div>
          <div class="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
            <span class="text-slate-400">당월총매출(E247): <b class="text-white">₩${window.store.formatMoney(summary.totalSalesSum)}</b></span>
            <span class="text-slate-400">일반매출(G247): <b class="text-amber-400">₩${window.store.formatMoney(summary.otcSalesSum)}</b></span>
            <span class="text-slate-400">본부금(F247): <b class="text-white">₩${window.store.formatMoney(summary.rxSalesSum)}</b></span>
            <span class="text-slate-400">월원금통장총액(D249): <b class="text-white">₩${window.store.formatMoney(summary.cashSalesSum)}</b></span>
            <span class="text-slate-400">월카드지출총액(D250): <b class="text-white">₩${window.store.formatMoney(summary.cardSalesSum)}</b></span>
            <span class="text-slate-400">온라인몰카드총합(Y250): <b class="text-purple-400">₩${window.store.formatMoney(summary.onlineMallCardTotal)}</b></span>
          </div>
        </div>
      </div>
    `;
  },

  handleDailyChange(field, inputOrVal) {
    const isEl = typeof inputOrVal === 'object' && inputOrVal !== null;
    const num = isEl ? this.formatCurrencyInput(inputOrVal) : window.store.parseMoney(inputOrVal);
    const yymm = window.store.currentYYMM;
    const day = this.selectedDay;
    const rec = window.store.getDaily(yymm, day);
    rec[field] = num;
    window.store.calculateDaily(rec);
    window.store.saveToLocal();
  },

  async saveCurrentDaily() {
    const yymm = window.store.currentYYMM;
    const day = this.selectedDay;
    const rec = window.store.getDaily(yymm, day);
    await window.store.saveDaily(rec);
    this.showToast(`🎉 ${day}일 일일 정산 저장 및 동기화 완료!`);
    this.renderHeader();
    this.renderCurrentView();
  },

  showAddOnlineMallModal() {
    const name = prompt('추가할 온라인몰 이름을 입력하세요:');
    if (name) {
      window.store.addOnlineMall(name);
      this.renderCurrentView();
      this.showToast(`온라인몰 '${name}' 추가 완료`);
    }
  },

  removeOnlineMall(id) {
    if (confirm('해당 온라인몰 항목을 삭제하시겠습니까?')) {
      window.store.removeOnlineMall(id);
      this.renderCurrentView();
    }
  },

  // ================= 2. 월말 결산 HTML 뷰 (5개 탭 완벽 원본) =================
  renderMonthlySettlementHTML() {
    const yymm = window.store.currentYYMM;
    const m = window.store.getMonthly(yymm);
    const activeTab = this.activeMonthlyTab || 0;

    return `
      <div class="space-y-6 animate-fadeIn text-slate-100">
        <!-- 상단 4대 총괄 지표 카드 -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="bg-slate-900/90 rounded-2xl p-5 border border-slate-800 shadow-xl">
            <span class="text-xs text-slate-400 font-bold block mb-1">월 실질 통장 순잉여금 (M2)</span>
            <div class="text-2xl font-black ${m.netSurplus >= 0 ? 'text-amber-400' : 'text-rose-400'}">
              ₩${window.store.formatMoney(m.netSurplus)}
            </div>
            <span class="text-[10px] text-slate-500">P4(총수입) - S4(총지출)</span>
          </div>

          <div class="bg-slate-900/90 rounded-2xl p-5 border border-slate-800 shadow-xl">
            <span class="text-xs text-slate-400 font-bold block mb-1">이론적 총수익 분석 (C4)</span>
            <div class="text-2xl font-black text-emerald-400">₩${window.store.formatMoney(m.theoreticalProfit)}</div>
            <span class="text-[10px] text-slate-500">조제료 + 매약순익40% + 에누리 + 비급여 + 캐시백</span>
          </div>

          <div class="bg-slate-900/90 rounded-2xl p-5 border border-slate-800 shadow-xl">
            <span class="text-xs text-slate-400 font-bold block mb-1">통장 총수입 (P4)</span>
            <div class="text-2xl font-black text-blue-400">₩${window.store.formatMoney(m.grossIncome)}</div>
            <span class="text-[10px] text-slate-500">일반매출 + 본부금 + 공단청구 + 에누리 + 약국거래</span>
          </div>

          <div class="bg-slate-900/90 rounded-2xl p-5 border border-slate-800 shadow-xl">
            <span class="text-xs text-slate-400 font-bold block mb-1">통장 총지출 (S4)</span>
            <div class="text-2xl font-black text-rose-400">₩${window.store.formatMoney(m.grossExpenses)}</div>
            <span class="text-[10px] text-slate-500">거래처 + 급여 + 공과금 + 월세 + 금융비용</span>
          </div>
        </div>

        <!-- 5개 탭 컨테이너 -->
        <div class="bg-slate-900/90 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
          <!-- 탭 헤더 버튼 (모바일/PC 완벽 반응형 그리드) -->
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 border-b border-slate-800 bg-slate-950/80 p-1.5 gap-1.5" id="monthly-tabs">
            <button onclick="UI.switchMonthlyTab(0)" class="monthly-tab-btn px-2.5 sm:px-3 py-2.5 rounded-xl text-xs font-bold transition text-center flex items-center justify-center ${activeTab === 0 ? 'bg-amber-500 text-slate-950 shadow-md font-black' : 'text-slate-400 hover:text-white hover:bg-slate-800'}">
              <span class="hidden md:inline">1. 거래처 결제 대장</span>
              <span class="md:hidden">1. 거래처 결제</span>
            </button>
            <button onclick="UI.switchMonthlyTab(1)" class="monthly-tab-btn px-2.5 sm:px-3 py-2.5 rounded-xl text-xs font-bold transition text-center flex items-center justify-center ${activeTab === 1 ? 'bg-amber-500 text-slate-950 shadow-md font-black' : 'text-slate-400 hover:text-white hover:bg-slate-800'}">
              <span class="hidden md:inline">2. 직원 급여 & 퇴직금</span>
              <span class="md:hidden">2. 급여 · 퇴직금</span>
            </button>
            <button onclick="UI.switchMonthlyTab(2)" class="monthly-tab-btn px-2.5 sm:px-3 py-2.5 rounded-xl text-xs font-bold transition text-center flex items-center justify-center ${activeTab === 2 ? 'bg-amber-500 text-slate-950 shadow-md font-black' : 'text-slate-400 hover:text-white hover:bg-slate-800'}">
              <span class="hidden md:inline">3. 공과금 세부 내역</span>
              <span class="md:hidden">3. 공과금 내역</span>
            </button>
            <button onclick="UI.switchMonthlyTab(3)" class="monthly-tab-btn px-2.5 sm:px-3 py-2.5 rounded-xl text-xs font-bold transition text-center flex items-center justify-center ${activeTab === 3 ? 'bg-amber-500 text-slate-950 shadow-md font-black' : 'text-slate-400 hover:text-white hover:bg-slate-800'}">
              <span class="hidden md:inline">4. 에누리 · 카드결제액</span>
              <span class="md:hidden">4. 에누리 · 카드결제</span>
            </button>
            <button onclick="UI.switchMonthlyTab(4)" class="monthly-tab-btn col-span-2 sm:col-span-1 lg:col-span-1 px-2.5 sm:px-3 py-2.5 rounded-xl text-xs font-bold transition text-center flex items-center justify-center ${activeTab === 4 ? 'bg-amber-500 text-slate-950 shadow-md font-black' : 'text-slate-400 hover:text-white hover:bg-slate-800'}">
              <span class="hidden md:inline">5. 손익 종합 분석표</span>
              <span class="md:hidden">5. 손익 종합 분석</span>
            </button>
          </div>

          <!-- 탭 1: 거래처 결제 대장 (현금 V열 + 카드 Y/AA열) -->
          <div id="tab-content-0" class="monthly-tab-pane p-5 space-y-5 ${activeTab === 0 ? '' : 'hidden'}">
            <div class="flex justify-between items-center flex-wrap gap-2">
              <h3 class="text-sm font-bold text-amber-400 flex items-center gap-2">
                <i data-lucide="truck" class="w-4 h-4"></i>
                <span>거래처 결제 대장 (S6 현금: ₩${window.store.formatMoney(m.vendorCashTotal)} / S7 카드: ₩${window.store.formatMoney(m.vendorCardTotal)})</span>
              </h3>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <!-- 현금결제 대장 (V4:V30) -->
              <div class="space-y-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div class="flex justify-between items-center border-b border-slate-800 pb-2">
                  <span class="text-xs text-amber-400 font-bold">현금결제 거래처 (V열)</span>
                  <button onclick="UI.showAddItemModal('cashVendors', '현금 거래처 추가')" class="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-lg text-xs font-bold border border-amber-500/30 transition flex items-center gap-1">
                    <i data-lucide="plus" class="w-3 h-3"></i>+ 추가
                  </button>
                </div>
                <div class="space-y-2 text-xs max-h-[500px] overflow-y-auto pr-1">
                  ${m.cashVendors.map((v, idx) => `
                    <div class="flex items-center justify-between gap-2 p-1.5 rounded-lg hover:bg-slate-900 transition">
                      <div class="flex items-center gap-1.5 min-w-0">
                        <span class="text-slate-300 font-bold truncate">${v.name}</span>
                        ${v.cell ? `<span class="text-[9px] text-slate-500 bg-slate-900 px-1 rounded border border-slate-800">${v.cell}</span>` : ''}
                      </div>
                      <div class="flex items-center gap-1">
                        <input 
                          type="text" 
                          inputmode="numeric"
                          value="${window.store.formatMoney(v.amount)}" 
                          ${v.readOnly ? 'readonly' : ''} 
                          oninput="UI.handleVendorChange('cashVendors', ${idx}, this)" 
                          class="w-28 bg-slate-900 border ${v.readOnly ? 'border-amber-500/30 text-amber-300' : 'border-slate-700 text-white'} rounded px-2 py-1 text-right font-bold outline-none focus:border-amber-400"
                        />
                        ${!v.readOnly ? `
                          <button onclick="UI.showEditItemModal('cashVendors', ${idx})" class="p-1 text-slate-400 hover:text-amber-400 transition" title="수정">
                            <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
                          </button>
                          <button onclick="UI.removeVendor('cashVendors', ${idx})" class="p-1 text-slate-500 hover:text-rose-400 transition" title="삭제">
                            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                          </button>
                        ` : '<div class="w-12"></div>'}
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>

              <!-- 카드결제 대장 (Y4:Y40 & AA4:AA40) -->
              <div class="space-y-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div class="flex justify-between items-center border-b border-slate-800 pb-2">
                  <span class="text-xs text-purple-400 font-bold">카드결제 거래처 (Y/AA열)</span>
                  <button onclick="UI.showAddItemModal('cardVendors', '카드 거래처 추가')" class="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-purple-400 rounded-lg text-xs font-bold border border-purple-500/30 transition flex items-center gap-1">
                    <i data-lucide="plus" class="w-3 h-3"></i>+ 추가
                  </button>
                </div>
                <div class="space-y-2 text-xs max-h-[500px] overflow-y-auto pr-1">
                  ${m.cardVendors.map((v, idx) => `
                    <div class="flex items-center justify-between gap-2 p-1.5 rounded-lg hover:bg-slate-900 transition">
                      <div class="flex items-center gap-1.5 min-w-0">
                        <span class="text-slate-300 font-bold truncate">${v.name}</span>
                        ${v.cell ? `<span class="text-[9px] text-slate-500 bg-slate-900 px-1 rounded border border-slate-800">${v.cell}</span>` : ''}
                      </div>
                      <div class="flex items-center gap-1">
                        <input 
                          type="text" 
                          inputmode="numeric"
                          value="${window.store.formatMoney(v.amount)}" 
                          ${v.readOnly ? 'readonly' : ''} 
                          oninput="UI.handleVendorChange('cardVendors', ${idx}, this)" 
                          class="w-28 bg-slate-900 border ${v.readOnly ? 'border-purple-500/30 text-purple-300' : 'border-slate-700 text-white'} rounded px-2 py-1 text-right font-bold outline-none focus:border-purple-400"
                        />
                        ${!v.readOnly ? `
                          <button onclick="UI.showEditItemModal('cardVendors', ${idx})" class="p-1 text-slate-400 hover:text-amber-400 transition" title="수정">
                            <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
                          </button>
                          <button onclick="UI.removeVendor('cardVendors', ${idx})" class="p-1 text-slate-500 hover:text-rose-400 transition" title="삭제">
                            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                          </button>
                        ` : '<div class="w-12"></div>'}
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>
          </div>

          <!-- 탭 2: 직원 급여 & 퇴직금 적립 -->
          <div id="tab-content-1" class="monthly-tab-pane p-5 space-y-5 ${activeTab === 1 ? '' : 'hidden'}">
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <!-- 급여대장 (S8) -->
              <div class="space-y-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div class="flex justify-between items-center border-b border-slate-800 pb-2">
                  <span class="text-xs text-amber-400 font-bold">인건비 급여대장 (S8: ₩${window.store.formatMoney(m.expPayroll)})</span>
                  <button onclick="UI.showAddItemModal('employees', '직원 급여 항목 추가')" class="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-lg text-xs font-bold border border-amber-500/30 transition flex items-center gap-1">
                    <i data-lucide="plus" class="w-3 h-3"></i>+ 추가
                  </button>
                </div>
                <div class="space-y-2 text-xs max-h-[450px] overflow-y-auto pr-1">
                  ${m.employees.map((e, idx) => `
                    <div class="flex items-center justify-between gap-2 p-1.5 rounded-lg hover:bg-slate-900 transition">
                      <div class="flex items-center gap-1.5 min-w-0">
                        <span class="text-slate-300 font-bold truncate">${e.name}</span>
                        ${e.cell ? `<span class="text-[9px] text-slate-500 bg-slate-900 px-1 rounded border border-slate-800">${e.cell}</span>` : ''}
                      </div>
                      <div class="flex items-center gap-1">
                        <input 
                          type="text" 
                          inputmode="numeric"
                          value="${window.store.formatMoney(e.amount)}" 
                          oninput="UI.handleVendorChange('employees', ${idx}, this)" 
                          class="w-28 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-right font-bold text-white outline-none focus:border-amber-400"
                        />
                        <button onclick="UI.showEditItemModal('employees', ${idx})" class="p-1 text-slate-400 hover:text-amber-400 transition" title="수정">
                          <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
                        </button>
                        <button onclick="UI.removeVendor('employees', ${idx})" class="p-1 text-slate-500 hover:text-rose-400 transition" title="삭제">
                          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                        </button>
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>

              <!-- 퇴직금 적립 (S17 = AA29) -->
              <div class="space-y-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div class="flex justify-between items-center border-b border-slate-800 pb-2">
                  <span class="text-xs text-blue-400 font-bold">퇴직금 적립대장 (S17: ₩${window.store.formatMoney(m.expSeverance)})</span>
                  <button onclick="UI.showAddItemModal('severances', '퇴직금 적립 항목 추가')" class="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-blue-400 rounded-lg text-xs font-bold border border-blue-500/30 transition flex items-center gap-1">
                    <i data-lucide="plus" class="w-3 h-3"></i>+ 추가
                  </button>
                </div>
                <div class="space-y-2 text-xs max-h-[450px] overflow-y-auto pr-1">
                  ${m.severances.map((s, idx) => `
                    <div class="flex items-center justify-between gap-2 p-1.5 rounded-lg hover:bg-slate-900 transition">
                      <div class="flex items-center gap-1.5 min-w-0">
                        <span class="text-slate-300 font-bold truncate">${s.name}</span>
                        ${s.cell ? `<span class="text-[9px] text-slate-500 bg-slate-900 px-1 rounded border border-slate-800">${s.cell}</span>` : ''}
                      </div>
                      <div class="flex items-center gap-1">
                        <input 
                          type="text" 
                          inputmode="numeric"
                          value="${window.store.formatMoney(s.amount)}" 
                          oninput="UI.handleVendorChange('severances', ${idx}, this)" 
                          class="w-28 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-right font-bold text-white outline-none focus:border-blue-400"
                        />
                        <button onclick="UI.showEditItemModal('severances', ${idx})" class="p-1 text-slate-400 hover:text-amber-400 transition" title="수정">
                          <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
                        </button>
                        <button onclick="UI.removeVendor('severances', ${idx})" class="p-1 text-slate-500 hover:text-rose-400 transition" title="삭제">
                          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                        </button>
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>
          </div>

          <!-- 탭 3: 공과금 세부 내역 -->
          <div id="tab-content-2" class="monthly-tab-pane p-5 space-y-5 ${activeTab === 2 ? '' : 'hidden'}">
            <div class="space-y-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
              <div class="flex justify-between items-center border-b border-slate-800 pb-2">
                <span class="text-xs text-amber-400 font-bold">공과금 세부 내역 (S9: ₩${window.store.formatMoney(m.expUtility)})</span>
                <button onclick="UI.showAddItemModal('utilities', '공과금 항목 추가')" class="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-amber-400 rounded-lg text-xs font-bold border border-amber-500/30 transition flex items-center gap-1">
                  <i data-lucide="plus" class="w-3 h-3"></i>+ 추가
                </button>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs max-h-[500px] overflow-y-auto pr-1">
                ${m.utilities.map((u, idx) => `
                  <div class="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-900/60 border border-slate-800/80 hover:bg-slate-900 transition">
                    <div class="flex items-center gap-1.5 min-w-0">
                      <span class="text-slate-300 font-bold truncate">${u.name}</span>
                      ${u.cell ? `<span class="text-[9px] text-slate-500 bg-slate-900 px-1 rounded border border-slate-800">${u.cell}</span>` : ''}
                    </div>
                    <div class="flex items-center gap-1">
                      <input 
                        type="text" 
                        inputmode="numeric"
                        value="${window.store.formatMoney(u.amount)}" 
                        oninput="UI.handleVendorChange('utilities', ${idx}, this)" 
                        class="w-28 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-right font-bold text-white outline-none focus:border-amber-400"
                      />
                      <button onclick="UI.showEditItemModal('utilities', ${idx})" class="p-1 text-slate-400 hover:text-amber-400 transition" title="수정">
                        <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
                      </button>
                      <button onclick="UI.removeVendor('utilities', ${idx})" class="p-1 text-slate-500 hover:text-rose-400 transition" title="삭제">
                        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                      </button>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>

          <!-- 탭 4: 에누리 · 약국거래 · 카드결제액 -->
          <div id="tab-content-3" class="monthly-tab-pane p-5 space-y-5 ${activeTab === 3 ? '' : 'hidden'}">
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <!-- 에누리/금융할인 (P9) -->
              <div class="space-y-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div class="flex justify-between items-center border-b border-slate-800 pb-2">
                  <span class="text-xs text-emerald-400 font-bold">에누리/금융할인 (P9: ₩${window.store.formatMoney(m.totalDiscounts)})</span>
                  <button onclick="UI.showAddItemModal('discounts', '에누리 항목 추가')" class="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-emerald-400 rounded-lg text-xs font-bold border border-emerald-500/30 transition flex items-center gap-1">
                    <i data-lucide="plus" class="w-3 h-3"></i>+ 추가
                  </button>
                </div>
                <div class="space-y-2 text-xs max-h-[450px] overflow-y-auto pr-1">
                  ${m.discounts.map((d, idx) => `
                    <div class="flex items-center justify-between gap-2 p-1.5 rounded-lg hover:bg-slate-900 transition">
                      <div class="flex items-center gap-1.5 min-w-0">
                        <span class="text-slate-300 font-bold truncate">${d.name}</span>
                        ${d.cell ? `<span class="text-[9px] text-slate-500 bg-slate-900 px-1 rounded border border-slate-800">${d.cell}</span>` : ''}
                      </div>
                      <div class="flex items-center gap-1">
                        <input 
                          type="text" 
                          inputmode="numeric"
                          value="${window.store.formatMoney(d.amount)}" 
                          oninput="UI.handleVendorChange('discounts', ${idx}, this)" 
                          class="w-28 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-right font-bold text-white outline-none focus:border-emerald-400"
                        />
                        <button onclick="UI.showEditItemModal('discounts', ${idx})" class="p-1 text-slate-400 hover:text-amber-400 transition" title="수정">
                          <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
                        </button>
                        <button onclick="UI.removeVendor('discounts', ${idx})" class="p-1 text-slate-500 hover:text-rose-400 transition" title="삭제">
                          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                        </button>
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>

              <!-- 약국간거래 (P10) -->
              <div class="space-y-3 bg-slate-950 p-4 rounded-xl border border-slate-800">
                <div class="flex justify-between items-center border-b border-slate-800 pb-2">
                  <span class="text-xs text-blue-400 font-bold">약국간거래 (P10: ₩${window.store.formatMoney(m.totalPharmTrades)})</span>
                  <button onclick="UI.showAddItemModal('pharmTrades', '약국간거래 항목 추가')" class="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-blue-400 rounded-lg text-xs font-bold border border-blue-500/30 transition flex items-center gap-1">
                    <i data-lucide="plus" class="w-3 h-3"></i>+ 추가
                  </button>
                </div>
                <div class="space-y-2 text-xs max-h-[450px] overflow-y-auto pr-1">
                  ${m.pharmTrades.map((v, idx) => `
                    <div class="flex items-center justify-between gap-2 p-1.5 rounded-lg hover:bg-slate-900 transition">
                      <div class="flex items-center gap-1.5 min-w-0">
                        <span class="text-slate-300 font-bold truncate">${v.name}</span>
                        ${v.cell ? `<span class="text-[9px] text-slate-500 bg-slate-900 px-1 rounded border border-slate-800">${v.cell}</span>` : ''}
                      </div>
                      <div class="flex items-center gap-1">
                        <input 
                          type="text" 
                          inputmode="numeric"
                          value="${window.store.formatMoney(v.amount)}" 
                          oninput="UI.handleVendorChange('pharmTrades', ${idx}, this)" 
                          class="w-28 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-right font-bold text-white outline-none focus:border-blue-400"
                        />
                        <button onclick="UI.showEditItemModal('pharmTrades', ${idx})" class="p-1 text-slate-400 hover:text-amber-400 transition" title="수정">
                          <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
                        </button>
                        <button onclick="UI.removeVendor('pharmTrades', ${idx})" class="p-1 text-slate-500 hover:text-rose-400 transition" title="삭제">
                          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                        </button>
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>

              <!-- 이번달 카드별 결제금액 (Z69:AA75 연동) -->
              <div class="space-y-3 bg-slate-950 p-4 rounded-xl border border-purple-500/40">
                <div class="flex justify-between items-center border-b border-slate-800 pb-2">
                  <div>
                    <span class="text-xs text-purple-400 font-bold block">이번달 카드별 결제금액 (Z69:AA75)</span>
                    <span class="text-[10px] text-purple-300 font-bold">C9/P13 혜택 합산: ₩<span id="disp-total-cashback-c9">${window.store.formatMoney(m.totalCashback)}</span></span>
                  </div>
                  <button onclick="UI.showAddItemModal('cardCashbacks', '카드사 추가')" class="px-2 py-1 bg-purple-950/60 hover:bg-purple-900/60 text-purple-300 rounded-lg text-xs font-bold border border-purple-500/40 transition flex items-center gap-1">
                    <i data-lucide="plus" class="w-3 h-3"></i>+ 카드사 추가
                  </button>
                </div>
                <div class="space-y-3 text-xs max-h-[500px] overflow-y-auto pr-1">
                  ${m.cardCashbacks.map((c, idx) => `
                    <div class="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
                      <div class="flex items-center justify-between">
                        <span class="text-slate-200 font-bold text-xs">${c.name}</span>
                        <div class="flex items-center gap-1">
                          <span class="text-[10px] text-purple-300 font-bold bg-purple-950/60 px-2 py-0.5 rounded border border-purple-800/60">
                            요율: ${c.rate || 1.5}%
                          </span>
                          <button onclick="UI.showEditItemModal('cardCashbacks', ${idx})" class="p-1 text-slate-400 hover:text-amber-400 transition" title="수정">
                            <i data-lucide="pencil" class="w-3 h-3"></i>
                          </button>
                          <button onclick="UI.removeVendor('cardCashbacks', ${idx})" class="p-1 text-slate-500 hover:text-rose-400 transition" title="삭제">
                            <i data-lucide="trash-2" class="w-3 h-3"></i>
                          </button>
                        </div>
                      </div>
                      <div class="space-y-1">
                        <label class="text-[10px] text-slate-400 block font-medium">이번달 카드 결제원금 입력:</label>
                        <input 
                          type="text" 
                          inputmode="numeric"
                          value="${window.store.formatMoney(c.spend || c.amount)}" 
                          oninput="UI.handleCardSpendChange(${idx}, this)" 
                          class="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-right font-bold text-white outline-none focus:border-purple-400 text-xs" 
                          placeholder="결제금액 입력"
                        />
                      </div>
                      <div class="flex justify-between items-center text-[10px] bg-slate-950/60 px-2 py-1 rounded border border-slate-900">
                        <span class="text-slate-400">🎁 계산된 캐시백 혜택:</span>
                        <span class="font-bold text-purple-400" id="disp-cashback-item-${idx}">₩${window.store.formatMoney(c.cashback)}</span>
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>
          </div>

          <!-- 탭 5: 손익 종합 분석표 (C열/P열/S열) -->
          <div id="tab-content-4" class="monthly-tab-pane p-5 space-y-5 ${activeTab === 4 ? '' : 'hidden'}">
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 text-xs">
              <!-- C열: 이론적 총수익 분석표 -->
              <div class="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                <div class="flex justify-between items-center border-b border-slate-800 pb-2">
                  <span class="text-sm font-bold text-emerald-400">
                    1. 이론적 총수익 분석 (C4)
                  </span>
                  <span class="text-base font-black text-emerald-400" id="disp-c4-theoretical">
                    ₩${window.store.formatMoney(m.theoreticalProfit)}
                  </span>
                </div>
                <div class="space-y-2">
                  <div class="flex justify-between items-center">
                    <span class="text-slate-400">월조제료 (C5 직접입력):</span>
                    <input type="text" inputmode="numeric" value="${window.store.formatMoney(m.incomeRxFee)}" oninput="UI.handleMonthlyChange('incomeRxFee', this)" class="w-28 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-right font-bold text-white outline-none focus:border-amber-400"/>
                  </div>
                  <div class="flex justify-between items-center">
                    <div class="flex items-center gap-1.5">
                      <span class="text-slate-400">일반매출순익 (C6):</span>
                      <div class="flex items-center bg-slate-900 border border-amber-500/50 rounded px-1.5 py-0.5">
                        <input 
                          type="number" 
                          step="0.5"
                          min="0"
                          max="100"
                          value="${m.otcMarginRate !== undefined ? m.otcMarginRate : 40}" 
                          oninput="UI.handleMarginRateChange(this.value)"
                          class="w-9 bg-transparent text-right font-black text-amber-400 outline-none text-xs"
                        />
                        <span class="text-[10px] text-amber-400 font-bold ml-0.5">%</span>
                      </div>
                    </div>
                    <span class="font-bold text-emerald-400" id="display-otc-profit">₩${window.store.formatMoney(m.otcProfit)}</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-slate-400">에누리 (C7 = P29):</span>
                    <span class="font-bold text-emerald-400">₩${window.store.formatMoney(m.totalDiscounts)}</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-slate-400">처방비급여마진 (C8 직접입력):</span>
                    <input type="text" inputmode="numeric" value="${window.store.formatMoney(m.incomeNonCovered)}" oninput="UI.handleMonthlyChange('incomeNonCovered', this)" class="w-28 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-right font-bold text-white outline-none focus:border-amber-400"/>
                  </div>
                  <div class="flex justify-between items-center py-1 bg-purple-950/20 px-2 rounded-lg border border-purple-500/20">
                    <div class="flex items-center gap-1">
                      <span class="text-slate-300 font-medium">카드별 혜택 (C9 = P13):</span>
                      <span class="text-[9px] text-purple-400 bg-purple-950/60 px-1.5 py-0.5 rounded border border-purple-800/60">4번 탭 연동</span>
                    </div>
                    <span class="font-bold text-purple-400" id="disp-c9-cashback">₩${window.store.formatMoney(m.totalCashback)}</span>
                  </div>
                  <div class="pt-2 border-t border-slate-800/80">
                    <div class="flex justify-between text-[11px] text-slate-500">
                      <span>(월총일반매출액 C12):</span>
                      <span>₩${window.store.formatMoney(m.otcTotalSales)}</span>
                    </div>
                    <div class="flex justify-between text-[11px] text-slate-500">
                      <span>(일평균 일반매출 C13):</span>
                      <span>₩${window.store.formatMoney(m.otcDailyAvg)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- P열: 통장 수입 총괄표 -->
              <div class="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                <div class="flex justify-between items-center border-b border-slate-800 pb-2">
                  <span class="text-sm font-bold text-blue-400">
                    2. 통장 총수입 (P4)
                  </span>
                  <span class="text-base font-black text-blue-400">
                    ₩${window.store.formatMoney(m.grossIncome)}
                  </span>
                </div>
                <div class="space-y-2">
                  <div class="flex justify-between items-center">
                    <span class="text-slate-400">일반매약총액 (P6):</span>
                    <span class="font-bold text-white">₩${window.store.formatMoney(m.incomeOtcRaw)}</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-slate-400">조제본인부담금합 (P7 = F247):</span>
                    <span class="font-bold text-white">₩${window.store.formatMoney(m.incomeCopay)}</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-slate-400">전월공단청구금입금액 (P8 직접입력):</span>
                    <input type="text" inputmode="numeric" value="${window.store.formatMoney(m.incomeNhisClaim)}" oninput="UI.handleMonthlyChange('incomeNhisClaim', this)" class="w-28 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-right font-bold text-white outline-none focus:border-amber-400"/>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-slate-400">에누리합계 (P9 = P29):</span>
                    <span class="font-bold text-white">₩${window.store.formatMoney(m.totalDiscounts)}</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-slate-400">약국간거래합 (P10 = P22):</span>
                    <span class="font-bold text-white">₩${window.store.formatMoney(m.totalPharmTrades)}</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-slate-400">직원할인구매이체 (P11):</span>
                    <span class="font-bold text-white">₩${window.store.formatMoney(m.incomeDiscount)}</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-slate-400">카드사 캐시백 (P13):</span>
                    <span class="font-bold text-purple-400">₩${window.store.formatMoney(m.totalCashback)}</span>
                  </div>
                </div>
              </div>

              <!-- S열: 통장 지출 총괄표 -->
              <div class="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
                <div class="flex justify-between items-center border-b border-slate-800 pb-2">
                  <span class="text-sm font-bold text-rose-400">
                    3. 통장 총지출 (S4)
                  </span>
                  <span class="text-base font-black text-rose-400">
                    ₩${window.store.formatMoney(m.grossExpenses)}
                  </span>
                </div>
                <div class="space-y-2">
                  <div class="flex justify-between items-center">
                    <span class="text-slate-400">현금결재 (S6 = V3):</span>
                    <span class="font-bold text-white">₩${window.store.formatMoney(m.vendorCashTotal)}</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-slate-400">카드출금 (S7 = Y3):</span>
                    <span class="font-bold text-white">₩${window.store.formatMoney(m.vendorCardTotal)}</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-slate-400">인건비 (S8 = V28):</span>
                    <span class="font-bold text-white">₩${window.store.formatMoney(m.expPayroll)}</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-slate-400">공과금 (S9 = V37):</span>
                    <span class="font-bold text-white">₩${window.store.formatMoney(m.expUtility)}</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-slate-400">약국임대료 (S10):</span>
                    <input type="text" inputmode="numeric" value="${window.store.formatMoney(m.expRent)}" oninput="UI.handleMonthlyChange('expRent', this)" class="w-24 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-right font-bold text-white outline-none focus:border-amber-400"/>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-slate-400">기타운영비 (S11 = S37):</span>
                    <span class="font-bold text-white">₩${window.store.formatMoney(m.expOtherOperating)}</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-slate-400">카드수수료 (S12 = 1.6%):</span>
                    <span class="font-bold text-white">₩${window.store.formatMoney(m.expCardFee)}</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-slate-400">금융비용 (S13 = S22):</span>
                    <span class="font-bold text-white">₩${window.store.formatMoney(m.expFinance)}</span>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-slate-400">연금저축 (S14):</span>
                    <input type="text" inputmode="numeric" value="${window.store.formatMoney(m.expPension)}" oninput="UI.handleMonthlyChange('expPension', this)" class="w-24 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-right font-bold text-white outline-none focus:border-amber-400"/>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-slate-400">적금/소득세 (S15):</span>
                    <input type="text" inputmode="numeric" value="${window.store.formatMoney(m.expSaving)}" oninput="UI.handleMonthlyChange('expSaving', this)" class="w-24 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-right font-bold text-white outline-none focus:border-amber-400"/>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-slate-400">노란우산 (S16):</span>
                    <input type="text" inputmode="numeric" value="${window.store.formatMoney(m.expYellowUmbrella)}" oninput="UI.handleMonthlyChange('expYellowUmbrella', this)" class="w-24 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-right font-bold text-white outline-none focus:border-amber-400"/>
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-slate-400">퇴직금적립 (S17 = AA29):</span>
                    <span class="font-bold text-white">₩${window.store.formatMoney(m.expSeverance)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 월말 결산 저장 버튼 바 -->
        <div class="flex justify-end gap-3 pt-2">
          <button 
            onclick="UI.saveCurrentMonthly()"
            class="px-8 py-3.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl shadow-xl flex items-center gap-2 transition text-sm shadow-amber-500/20"
          >
            <i data-lucide="save" class="w-4 h-4"></i>
            <span>20${yymm.substring(0,2)}년 ${yymm.substring(2,4)}월 결산 저장 (구글 시트 ${yymm}결산 동기화)</span>
          </button>
        </div>
      </div>
    `;
  },

  switchMonthlyTab(tabIdx) {
    this.activeMonthlyTab = tabIdx;
    const tabs = document.querySelectorAll('.monthly-tab-btn');
    const panes = document.querySelectorAll('.monthly-tab-pane');

    tabs.forEach((btn, i) => {
      if (i === tabIdx) {
        btn.classList.remove('text-slate-400', 'hover:text-white', 'hover:bg-slate-800');
        btn.classList.add('bg-amber-500', 'text-slate-950', 'shadow-md', 'font-black');
      } else {
        btn.classList.remove('bg-amber-500', 'text-slate-950', 'shadow-md', 'font-black');
        btn.classList.add('text-slate-400', 'hover:text-white', 'hover:bg-slate-800');
      }
    });

    panes.forEach((pane, i) => {
      if (i === tabIdx) {
        pane.classList.remove('hidden');
      } else {
        pane.classList.add('hidden');
      }
    });
  },

  formatCurrencyInput(inputEl) {
    if (!inputEl || typeof inputEl !== 'object') return 0;
    const rawVal = inputEl.value || '';
    const num = window.store.parseMoney(rawVal);
    const formatted = window.store.formatMoney(num);
    
    const selStart = inputEl.selectionStart;
    const lenDiff = formatted.length - rawVal.length;
    inputEl.value = formatted;
    try {
      const newPos = Math.max(0, selStart + lenDiff);
      inputEl.setSelectionRange(newPos, newPos);
    } catch (e) {}
    return num;
  },

  handleVendorChange(listKey, idx, inputOrVal) {
    const isEl = typeof inputOrVal === 'object' && inputOrVal !== null;
    const num = isEl ? this.formatCurrencyInput(inputOrVal) : window.store.parseMoney(inputOrVal);
    const yymm = window.store.currentYYMM;
    window.store.updateCustomItem(yymm, listKey, idx, 'amount', num);
    this.renderHeader();
  },

  handleCardSpendChange(idx, inputOrVal) {
    const isEl = typeof inputOrVal === 'object' && inputOrVal !== null;
    const num = isEl ? this.formatCurrencyInput(inputOrVal) : window.store.parseMoney(inputOrVal);
    const yymm = window.store.currentYYMM;
    window.store.updateCustomItem(yymm, 'cardCashbacks', idx, 'spend', num);
    this.renderHeader();

    const m = window.store.getMonthly(yymm);
    const c9El = document.getElementById('disp-c9-cashback');
    if (c9El) c9El.textContent = `₩${window.store.formatMoney(m.totalCashback)}`;
    const c4El = document.getElementById('disp-c4-theoretical');
    if (c4El) c4El.textContent = `₩${window.store.formatMoney(m.theoreticalProfit)}`;
    const itemCashbackEl = document.getElementById(`disp-cashback-item-${idx}`);
    if (itemCashbackEl && m.cardCashbacks && m.cardCashbacks[idx]) {
      itemCashbackEl.textContent = `혜택(${m.cardCashbacks[idx].rate || 1.5}%): ₩${window.store.formatMoney(m.cardCashbacks[idx].cashback)}`;
    }
  },

  handleMarginRateChange(val) {
    const yymm = window.store.currentYYMM;
    const m = window.store.getMonthly(yymm);
    m.otcMarginRate = parseFloat(val) || 0;
    window.store.calculateMonthly(m);
    window.store.saveToLocal();
    this.renderHeader();
    const profitEl = document.getElementById('display-otc-profit');
    if (profitEl) profitEl.textContent = `₩${window.store.formatMoney(m.otcProfit)}`;
  },

  handleMonthlyChange(field, inputOrVal) {
    const isEl = typeof inputOrVal === 'object' && inputOrVal !== null;
    const num = isEl ? this.formatCurrencyInput(inputOrVal) : window.store.parseMoney(inputOrVal);
    const yymm = window.store.currentYYMM;
    const m = window.store.getMonthly(yymm);
    m[field] = num;
    window.store.calculateMonthly(m);
    window.store.saveToLocal();
    this.renderHeader();
  },

  removeVendor(listKey, idx) {
    const yymm = window.store.currentYYMM;
    const m = window.store.getMonthly(yymm);
    const item = m[listKey]?.[idx];
    const itemName = item?.name || '해당 항목';

    if (confirm(`'${itemName}' 항목을 삭제하시겠습니까?`)) {
      window.store.removeCustomItem(yymm, listKey, idx);
      this.renderCurrentView();
      this.renderHeader();
      this.showToast(`'${itemName}' 항목이 삭제되었습니다.`);
    }
  },

  showAddItemModal(listKey, title) {
    const modalContainer = document.getElementById('modal-container');
    if (!modalContainer) return;

    modalContainer.innerHTML = `
      <div class="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl animate-scaleIn">
        <div class="flex justify-between items-center border-b border-slate-800 pb-3">
          <h3 class="text-sm font-bold text-white flex items-center gap-2">
            <i data-lucide="plus-circle" class="w-4 h-4 text-amber-400"></i>
            <span>${title}</span>
          </h3>
          <button onclick="UI.closeModal()" class="text-slate-500 hover:text-white">✕</button>
        </div>

        <div class="space-y-3 text-xs">
          <div>
            <label class="text-slate-400 block mb-1">항목명 / 거래처명 / 직원명</label>
            <input type="text" id="modal-item-name" class="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white outline-none focus:border-amber-400" placeholder="예: 신규 거래처명"/>
          </div>
          <div>
            <label class="text-slate-400 block mb-1">금액 (원)</label>
            <input type="text" inputmode="numeric" id="modal-item-amount" oninput="UI.formatCurrencyInput(this)" class="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-right font-bold text-white outline-none focus:border-amber-400" placeholder="0"/>
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-2 border-t border-slate-800">
          <button onclick="UI.closeModal()" class="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:bg-slate-800">취소</button>
          <button onclick="UI.saveNewItem('${listKey}')" class="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs shadow-md">추가하기</button>
        </div>
      </div>
    `;

    modalContainer.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  },

  showEditItemModal(listKey, idx) {
    const yymm = window.store.currentYYMM;
    const m = window.store.getMonthly(yymm);
    const item = m[listKey]?.[idx];
    if (!item) return;

    const modalContainer = document.getElementById('modal-container');
    if (!modalContainer) return;

    modalContainer.innerHTML = `
      <div class="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl animate-scaleIn">
        <div class="flex justify-between items-center border-b border-slate-800 pb-3">
          <h3 class="text-sm font-bold text-white flex items-center gap-2">
            <i data-lucide="edit" class="w-4 h-4 text-amber-400"></i>
            <span>항목 이름 및 금액 수정</span>
          </h3>
          <button onclick="UI.closeModal()" class="text-slate-500 hover:text-white">✕</button>
        </div>

        <div class="space-y-3 text-xs">
          <div>
            <label class="text-slate-400 block mb-1">항목명 / 거래처명 / 직원명</label>
            <input type="text" id="modal-edit-name" value="${item.name}" class="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-white outline-none focus:border-amber-400"/>
          </div>
          <div>
            <label class="text-slate-400 block mb-1">금액 (원)</label>
            <input type="text" inputmode="numeric" id="modal-edit-amount" value="${window.store.formatMoney(item.amount || item.spend)}" oninput="UI.formatCurrencyInput(this)" class="w-full bg-slate-950 border border-slate-700 rounded-lg p-2 text-right font-bold text-white outline-none focus:border-amber-400"/>
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-2 border-t border-slate-800">
          <button onclick="UI.closeModal()" class="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:bg-slate-800">취소</button>
          <button onclick="UI.saveEditItem('${listKey}', ${idx})" class="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs shadow-md">수정 완료</button>
        </div>
      </div>
    `;

    modalContainer.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  },

  saveNewItem(listKey) {
    const nameInput = document.getElementById('modal-item-name');
    const amountInput = document.getElementById('modal-item-amount');
    if (!nameInput || !nameInput.value.trim()) {
      alert('항목 이름을 입력하세요.');
      return;
    }

    const yymm = window.store.currentYYMM;
    const name = nameInput.value.trim();
    const amount = window.store.parseMoney(amountInput.value);

    window.store.addCustomItem(yymm, listKey, { name: name, amount: amount });
    this.closeModal();
    this.renderCurrentView();
    this.renderHeader();
    this.showToast(`'${name}' 항목이 추가되었습니다.`);
  },

  saveEditItem(listKey, idx) {
    const nameInput = document.getElementById('modal-edit-name');
    const amountInput = document.getElementById('modal-edit-amount');
    if (!nameInput || !nameInput.value.trim()) {
      alert('항목 이름을 입력하세요.');
      return;
    }

    const yymm = window.store.currentYYMM;
    const name = nameInput.value.trim();
    const amount = window.store.parseMoney(amountInput.value);

    const m = window.store.getMonthly(yymm);
    if (m[listKey] && m[listKey][idx]) {
      m[listKey][idx].name = name;
      if (listKey === 'cardCashbacks') {
        m[listKey][idx].spend = amount;
      } else {
        m[listKey][idx].amount = amount;
      }
      window.store.monthlyRecords[yymm] = window.store.calculateMonthly(m);
      window.store.saveToLocal();
    }

    this.closeModal();
    this.renderCurrentView();
    this.renderHeader();
    this.showToast(`'${name}' 항목이 수정되었습니다.`);
  },

  closeModal() {
    const modalContainer = document.getElementById('modal-container');
    if (modalContainer) modalContainer.classList.add('hidden');
  },

  async saveCurrentMonthly() {
    const yymm = window.store.currentYYMM;
    const rec = window.store.getMonthly(yymm);
    await window.store.saveMonthly(rec);
    this.showToast(`🎉 20${yymm.substring(0,2)}년 ${yymm.substring(2,4)}월 결산 저장 및 구글 시트 동기화 완료!`);
    this.renderHeader();
    this.renderCurrentView();
  },

  // ================= 3. 소득 추이 통계 (12M MA) HTML 뷰 =================
  renderTrendsHTML() {
    const trendData = window.store.getTrendData();

    return `
      <div class="space-y-6 animate-fadeIn text-slate-100">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl space-y-3">
            <div class="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 class="text-sm font-bold text-amber-400 flex items-center gap-2">
                <i data-lucide="trending-up" class="w-4 h-4"></i>
                <span>일반매출(매약) & 12개월 이동평균선 (12M MA)</span>
              </h3>
              <span class="text-[10px] text-slate-500">장기 성장 추세선 분석</span>
            </div>
            <div class="h-72 w-full relative">
              <canvas id="analytics-sales-chart"></canvas>
            </div>
          </div>

          <div class="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl space-y-3">
            <div class="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 class="text-sm font-bold text-emerald-400 flex items-center gap-2">
                <i data-lucide="line-chart" class="w-4 h-4"></i>
                <span>월간 실질 통장 순잉여금 (M2) 흑자 추이</span>
              </h3>
              <span class="text-[10px] text-slate-500">P4(총수입) - S4(총지출)</span>
            </div>
            <div class="h-72 w-full relative">
              <canvas id="analytics-profit-chart"></canvas>
            </div>
          </div>
        </div>

        <div class="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-bold text-slate-200 flex items-center gap-2">
              <i data-lucide="table-2" class="w-4 h-4 text-amber-400"></i>
              <span>월별 경영 실적 및 순이익 지표 상세</span>
            </h3>
            <span class="text-xs text-slate-500">실시간 장부 데이터 1:1 연동</span>
          </div>

          <div class="overflow-x-auto rounded-xl border border-slate-800">
            <table class="w-full text-xs text-left border-collapse">
              <thead>
                <tr class="bg-slate-950/80 text-slate-400 border-b border-slate-800 font-bold">
                  <th class="p-3">기준 월</th>
                  <th class="p-3 text-right">일반약 매출 (매약)</th>
                  <th class="p-3 text-right">12M 이동평균선</th>
                  <th class="p-3 text-right">실질 순잉여금 (M2)</th>
                  <th class="p-3 text-right">전월 대비 증감</th>
                  <th class="p-3 text-center">장부 바로가기</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-800/60">
                ${trendData.map((d, i) => {
                  const prev = trendData[i - 1];
                  const diff = prev ? d.otcSales - prev.otcSales : 0;
                  return `
                    <tr class="hover:bg-slate-800/40 transition">
                      <td class="p-3 font-bold text-amber-400">${d.month}</td>
                      <td class="p-3 text-right font-mono font-bold text-white">₩${window.store.formatMoney(d.otcSales)}</td>
                      <td class="p-3 text-right font-mono text-sky-300">₩${window.store.formatMoney(d.ma12)}</td>
                      <td class="p-3 text-right font-mono font-bold text-emerald-400">₩${window.store.formatMoney(d.netProfit)}</td>
                      <td class="p-3 text-right font-mono">
                        ${!prev ? '<span class="text-slate-500">-</span>' : 
                          diff >= 0 ? `<span class="text-emerald-400 font-bold">+₩${window.store.formatMoney(diff)}</span>` : 
                          `<span class="text-rose-400 font-bold">-₩${window.store.formatMoney(Math.abs(diff))}</span>`}
                      </td>
                      <td class="p-3 text-center">
                        <button 
                          onclick="UI.handleMonthChange('${d.yymm}'); UI.navigate('monthly-settlement');" 
                          class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[11px] font-bold border border-slate-700 transition"
                        >
                          결산 보기 →
                        </button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  },

  // ================= 4. 알림 & 모달 & 동기화 =================
  showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-5 right-5 bg-slate-900 border border-amber-500 text-amber-400 px-4 py-2.5 rounded-xl shadow-2xl z-50 text-xs font-bold flex items-center gap-2 transition-all duration-300';
    toast.innerHTML = `<i data-lucide="check-circle" class="w-4 h-4 text-amber-400"></i> <span>${msg}</span>`;
    document.body.appendChild(toast);
    if (window.lucide) window.lucide.createIcons();

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },

  async syncWithGoogleSheets() {
    if (!window.sheetsClient || !window.sheetsClient.isConfigured) {
      this.showSettingsModal();
      return;
    }

    const syncBtn = document.getElementById('sync-btn');
    if (syncBtn) syncBtn.classList.add('animate-spin');

    try {
      try {
        const pingRes = await window.sheetsClient.ping();
        if (pingRes && pingRes.sheets && Array.isArray(pingRes.sheets)) {
          const discovered = [];
          pingRes.sheets.forEach(sName => {
            const m = sName.replace(/결산$/, '').trim();
            if (/^[0-9]{4}$/.test(m) && !discovered.includes(m)) {
              discovered.push(m);
            }
          });
          if (discovered.length > 0) {
            window.store.availableMonths = discovered.sort();
          }
        }
      } catch (pingErr) {
        console.warn("Ping error:", pingErr);
      }

      if (!window.store.availableMonths.includes(window.store.currentYYMM)) {
        window.store.currentYYMM = window.store.availableMonths[0] || '2608';
      }

      const currentYYMM = window.store.currentYYMM;
      this.showToast(`구글 시트(20${currentYYMM.substring(0,2)}년 ${currentYYMM.substring(2,4)}월)에서 데이터를 가져오는 중...`);
      await window.store.loadMonthFromSheets(currentYYMM);
      this.renderHeader();
      this.renderCurrentView();
      this.showToast(`⚡ 20${currentYYMM.substring(0,2)}년 ${currentYYMM.substring(2,4)}월 시트 데이터를 100% 동기화 완료했습니다!`);
    } catch (e) {
      console.warn("Sync error:", e);
      this.showToast('⚠️ 동기화 오류: ' + (e.message || e));
    } finally {
      if (syncBtn) syncBtn.classList.remove('animate-spin');
    }
  },

  showSettingsModal() {
    const currentUrl = window.sheetsClient ? window.sheetsClient.webAppUrl : '';
    const pName = window.store.pharmacyName || '신세계약국';

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4';
    modal.id = 'settings-modal';
    modal.innerHTML = `
      <div class="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-lg w-full space-y-4 shadow-2xl">
        <div class="flex justify-between items-center">
          <h3 class="text-sm font-bold text-white flex items-center gap-2">
            <i data-lucide="settings" class="w-4 h-4 text-amber-400"></i>
            <span>[${pName}] Google Apps Script 웹 앱 연동 설정</span>
          </h3>
          <button onclick="document.getElementById('settings-modal').remove()" class="text-slate-500 hover:text-white">✕</button>
        </div>

        <p class="text-xs text-slate-400">
          [${pName}] 구글 스프레드시트의 <b>[확장 프로그램] → [Apps Script] → [배포] → [새 배포]</b>에서 발급된 웹 앱 URL을 등록합니다.
        </p>

        <div class="space-y-2">
          <label class="text-xs font-bold text-slate-300">웹 앱 배포 URL (Web App URL)</label>
          <input 
            type="text" 
            id="setting-gas-url" 
            class="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-xs text-white focus:border-amber-500 font-mono outline-none"
            placeholder="https://script.google.com/macros/s/..."
            value="${currentUrl}"
          />
        </div>

        <div class="flex justify-between items-center pt-2">
          <button 
            onclick="UI.showResetConfirmModal()"
            class="px-3 py-2 bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 border border-rose-500/30 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
            title="브라우저에 저장된 임시 캐시 데이터를 초기화하고 시트에서 새로 불러옵니다"
          >
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            <span>임시 데이터 초기화</span>
          </button>

          <div class="flex gap-2">
            <button onclick="document.getElementById('settings-modal').remove()" class="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-bold">취소</button>
            <button onclick="UI.saveSettings()" class="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black">저장 및 연결</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    if (window.lucide) window.lucide.createIcons();
  },

  showResetConfirmModal() {
    if (confirm('⚠️ 브라우저 로컬에 저장된 장부 임시 데이터를 모두 초기화하시겠습니까?\n(구글 스프레드시트에 저장된 실제 데이터는 안전하게 보존됩니다)')) {
      window.store.clearLocalCache();
      const settingsModal = document.getElementById('settings-modal');
      if (settingsModal) settingsModal.remove();
      this.showToast('🧹 임시 데이터가 초기화되었습니다. [시트 동기화]를 눌러주세요.');
      this.renderHeader();
      this.renderCurrentView();
    }
  },

  async saveSettings() {
    const input = document.getElementById('setting-gas-url');
    if (!input) return;

    const url = input.value.trim();
    window.sheetsClient.setUrl(url);

    const modal = document.getElementById('settings-modal');
    if (modal) modal.remove();

    if (window.sheetsClient.isConfigured) {
      this.showToast('구글 시트 연결을 테스트하는 중...');
      const res = await window.sheetsClient.ping();
      if (res.success) {
        this.showToast('✅ 구글 시트와 성공적으로 연결되었습니다!');
        await this.syncWithGoogleSheets();
      } else {
        this.showToast('⚠️ 연결 실패: URL 또는 배포 권한을 확인해주세요.');
      }
    } else {
      this.showToast('URL 설정이 해제되었습니다. 로컬 모드로 동작합니다.');
    }

    this.renderHeader();
  },

  showNewMonthModal() {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4';
    modal.id = 'new-month-modal';

    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const defaultYYMM = `${String(nextMonth.getFullYear()).substring(2)}${String(nextMonth.getMonth() + 1).padStart(2, '0')}`;

    modal.innerHTML = `
      <div class="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl">
        <div class="flex justify-between items-center">
          <h3 class="text-sm font-bold text-white flex items-center gap-2">
            <i data-lucide="calendar-plus" class="w-4 h-4 text-amber-400"></i>
            <span>새 월 장부 생성</span>
          </h3>
          <button onclick="document.getElementById('new-month-modal').remove()" class="text-slate-500 hover:text-white">✕</button>
        </div>

        <p class="text-xs text-slate-400 leading-relaxed">
          생성할 연월(YYMM 4자리)을 입력하세요.<br/>
          (예: 26년 9월 → <b>2609</b>)
        </p>

        <div class="space-y-2">
          <label class="text-xs font-bold text-slate-300">장부 연월 (YYMM)</label>
          <input 
            type="text" 
            id="new-month-input" 
            class="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-sm text-center text-white focus:border-amber-500 font-mono font-bold outline-none"
            placeholder="2609"
            maxlength="4"
            value="${defaultYYMM}"
          />
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <button onclick="document.getElementById('new-month-modal').remove()" class="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-bold">취소</button>
          <button onclick="UI.createNewMonth()" class="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-black">장부 생성</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    if (window.lucide) window.lucide.createIcons();
  },

  createNewMonth() {
    const input = document.getElementById('new-month-input');
    if (!input) return;

    const yymm = input.value.trim();
    if (!/^[0-9]{4}$/.test(yymm)) {
      alert('연월은 4자리 숫자(YYMM, 예: 2609)로 입력해주세요.');
      return;
    }

    window.store.setCurrentYYMM(yymm);

    const modal = document.getElementById('new-month-modal');
    if (modal) modal.remove();

    this.showToast(`✨ 20${yymm.substring(0,2)}년 ${yymm.substring(2,4)}월 장부가 성공적으로 생성되었습니다!`);
    this.renderHeader();
    this.renderCurrentView();
  }
};

window.UI = UI;


// ==========================================
// 5. Smart Ledger Module Wrapper (신세계 / 회천 마운트)
// ==========================================
window.SmartLedgerModule = {
  render: function (containerId, pharmacyKey = 'ssg') {
    const container = document.getElementById(containerId);
    if (!container) return;

    // 약국 컨텍스트 스위칭
    window.store.setPharmacy(pharmacyKey);
    window.sheetsClient.setPharmacy(pharmacyKey);

    // 원본 컨테이너 구조 주입
    container.innerHTML = `
      <div id="smart-ledger-root" class="bg-slate-950 text-slate-100 min-h-screen font-sans flex flex-col antialiased selection:bg-amber-500 selection:text-slate-950 rounded-2xl overflow-hidden shadow-2xl">
        <!-- Top Dynamic Header -->
        <header id="header-container" class="bg-slate-900/95 backdrop-blur-md border-b border-slate-800 sticky top-0 z-40 px-4 py-2.5">
        </header>

        <!-- Main Navigation Bar -->
        <nav class="bg-slate-900 border-b border-slate-800 px-4 py-2 sticky top-[61px] z-30 shadow-lg">
          <div class="max-w-7xl mx-auto flex items-center justify-between">
            <div class="flex items-center space-x-1 sm:space-x-2 overflow-x-auto no-scrollbar" id="dynamic-nav-container">
            </div>
          </div>
        </nav>

        <!-- Main Content Container -->
        <main class="flex-grow max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6" id="app-container">
        </main>

        <!-- Universal Modal Layer -->
        <div id="modal-container" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 hidden">
        </div>
      </div>
    `;

    // 100% 원본 UI 초기화 가동
    window.UI.init();
  }
};
