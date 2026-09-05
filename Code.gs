/**
 * 365메가스타약국 (구 회천메디칼약국) 스마트 연동 초고속 백엔드 (Google Apps Script)
 * 🛡️ [원인 100% 해소: getDisplayValues + parseVal 유연한 셀 서식 대응 + 초고속 메모리 스캔]
 * - ⚡ 1. getDisplayValues() & getValues() 이중 스캔으로 콤마(,), ₩, 숫자, 날짜 서식 100% 파싱
 * - ⚡ 2. parseVal() 복원으로 천단위 쉼표("150,000") 및 통화 서식 무락 파싱
 * - ⚡ 3. 1~31일차 탐색 시 '1일', '1', 날짜 서식 완벽 자동 매칭
 */

var SPREADSHEET_ID = ""; // 독립형 스크립트 사용 시 여기에 진짜 구글 시트 ID 입력

function getSS() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss && SPREADSHEET_ID) {
    try { ss = SpreadsheetApp.openById(SPREADSHEET_ID); } catch (e) {}
  }
  if (!ss) {
    try {
      var files = DriveApp.getFilesByType(MimeType.GOOGLE_SHEETS);
      if (files.hasNext()) ss = SpreadsheetApp.open(files.next());
    } catch (e2) {}
  }
  return ss;
}

const CACHE_TTL_SEC = 120; // 서버 RAM 캐시 유효기간: 2분

function doGet(e) {
  if (!e) e = { parameter: { action: 'ping' } };
  return handleFastRequest(e);
}

function doPost(e) {
  if (!e) e = { parameter: { action: 'ping' } };
  return handleFastRequest(e);
}

function handleFastRequest(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(30000);

  try {
    var params = (e && e.parameter) ? e.parameter : { action: 'ping' };
    var action = params.action || 'ping';
    var postData = null;

    if (e && e.postData && e.postData.contents) {
      try {
        postData = JSON.parse(e.postData.contents);
        if (postData.action) action = postData.action;
      } catch (parseErr) {}
    }

    var result = { success: false, action: action, timestamp: new Date().toISOString() };
    var ss = getSS();
    if (!ss) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: "스프레드시트를 찾을 수 없습니다. (Code.gs의 SPREADSHEET_ID를 설정해 주세요.)"
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var cache = CacheService.getScriptCache();

    // ⚡ [1] 읽기 요청: bypassCache=true 체크 및 RAM 캐시 조율
    if (['getFullMonthData', 'getMonthly', 'getDaily', 'getRxLocations', 'getOtcLocations'].indexOf(action) !== -1) {
      var targetKey = (postData && (postData.yymm || postData.sheetName)) || params.yymm || params.sheetName || 'default';
      var dayParam = (postData && postData.day) || params.day || '';
      var cacheKey = getExactCacheKey(action, targetKey, dayParam);

      // ⚡ bypassCache=true 파라미터 수신 시 CacheService 조회를 무조건 스킵
      var bypassCache = (params.bypassCache === 'true' || (postData && postData.bypassCache === true));

      if (!bypassCache) {
        var cachedJson = cache.get(cacheKey);
        if (cachedJson) {
          try {
            var parsed = JSON.parse(cachedJson);
            parsed.cached = true;
            return ContentService.createTextOutput(JSON.stringify(parsed)).setMimeType(ContentService.MimeType.JSON);
          } catch (cErr) {}
        }
      }

      // 캐시 미스 또는 bypassCache=true 일 때 시트 파일 원본 메모리 스캔 실행
      if (action === 'getFullMonthData') {
        result.data = getFullMonthData(ss, targetKey);
        result.success = true;
      } else if (action === 'getMonthly') {
        result.data = getMonthlyRecord(ss, targetKey);
        result.success = true;
      } else if (action === 'getDaily') {
        result.data = getDailyRecord(ss, targetKey, parseInt(dayParam || '1', 10));
        result.success = true;
      } else if (action === 'getRxLocations') {
        result.data = getLocationsRecord(ss, '전문약위치');
        result.success = true;
      } else if (action === 'getOtcLocations') {
        result.data = getLocationsRecord(ss, '일반약위치');
        result.success = true;
      }

      var strResult = JSON.stringify(result);
      if (strResult.length < 100000) {
        try { cache.put(cacheKey, strResult, CACHE_TTL_SEC); } catch (putErr) {}
      }
      return ContentService.createTextOutput(strResult).setMimeType(ContentService.MimeType.JSON);
    }

    // ⚡ [2] 쓰기 요청: 블록 일괄 쓰기 + 정밀 캐시 무효화
    switch (action) {
      case 'ping':
        result.success = true;
        result.message = '365메가스타약국 스마트정산 Web App 정상 작동 중';
        result.spreadsheetName = ss.getName();
        result.sheets = ss.getSheets().map(function(s) { return s.getName(); });
        break;

      case 'saveDaily':
        var saveSheetName = (postData && postData.sheetName) || params.sheetName || '2608';
        var saveDay = parseInt((postData && postData.day) || params.day || '1', 10);
        var dailyData = (postData && postData.data) || {};
        result.data = saveDailyRecordFast(ss, saveSheetName, saveDay, dailyData);
        result.success = true;
        invalidateExactCache(cache, saveSheetName, saveDay);
        break;

      case 'saveMonthly':
        var saveMSheetName = (postData && postData.sheetName) || params.sheetName || '2608결산';
        var monthlyData = (postData && postData.data) || {};
        result.data = saveMonthlyRecordSafeBlock(ss, saveMSheetName, monthlyData);
        result.success = true;
        invalidateExactCache(cache, saveMSheetName);
        break;

      default:
        result.error = '알 수 없는 요청 (Action: ' + action + ')';
    }

    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

// 🎯 정확한 캐시 키 생성기
function getExactCacheKey(action, targetKey, dayParam) {
  var cleanKey = String(targetKey || '').trim();
  var cleanDay = String(dayParam || '').trim();
  return 'c_' + action + '_' + cleanKey + (cleanDay ? '_' + cleanDay : '');
}

// 🎯 정확한 캐시 무효화 함수
function invalidateExactCache(cache, keyPrefix, day) {
  try {
    var prefix = keyPrefix.replace(/결산$/, '').trim();
    cache.remove(getExactCacheKey('getFullMonthData', prefix, ''));
    cache.remove(getExactCacheKey('getMonthly', prefix + '결산', ''));
    if (day) {
      cache.remove(getExactCacheKey('getDaily', prefix, day));
    }
    for (var d = 1; d <= 31; d++) {
      cache.remove(getExactCacheKey('getDaily', prefix, d));
    }
  } catch (e) {}
}

// ==========================================
// 헬퍼 함수 모음 (안전한 파싱)
// ==========================================
function parseVal(val) {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  var str = String(val).trim();
  if (!/[0-9]/.test(str)) return 0;
  var match = str.match(/-?[0-9,.]+/);
  if (!match) return 0;
  var clean = match[0].replace(/,/g, '');
  if (!clean || clean === '-' || clean === '.') return 0;
  var num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

function getCellValue(values, row1, col1) {
  if (!values || !values.length) return '';
  var r = row1 - 1;
  var c = col1 - 1;
  if (r >= 0 && r < values.length && values[r] && c >= 0 && c < values[r].length) return values[r][c];
  return '';
}

// 스마트 일자 탐색 (서식/숫자/문자/날짜 100% 자동 매칭)
function findDayStartRowInValues(rawValues, displayValues, day) {
  var values = displayValues || rawValues;
  if (!values || !values.length) return -1;

  var targetStr = String(day);
  var targetLabel = day + "일";
  var lastRow = Math.min(values.length, 245);

  for (var r = 0; r < lastRow; r++) {
    var dRaw = displayValues && displayValues[r] ? String(displayValues[r][0] || '').trim() : '';
    var vRaw = rawValues && rawValues[r] ? rawValues[r][0] : null;

    if (dRaw === targetLabel || dRaw === targetStr) return r + 1;

    if (vRaw !== null && vRaw !== undefined) {
      var vStr = String(vRaw).trim();
      if (vStr === targetLabel || vStr === targetStr) return r + 1;
      if (typeof vRaw === 'number' && vRaw === day) return r + 1;
      if (typeof vRaw === 'object' && vRaw instanceof Date && vRaw.getDate() === day) return r + 1;
      var numInA = parseInt(vStr.replace(/[^0-9]/g, ''), 10);
      if (numInA === day && (vStr.indexOf('일') !== -1 || vStr === targetStr)) return r + 1;
    }
  }
  return -1;
}

function findDayStartRow(sheet, day) {
  var rawValues = sheet.getDataRange().getValues();
  var displayValues = sheet.getDataRange().getDisplayValues();
  return findDayStartRowInValues(rawValues, displayValues, day);
}

// ==========================================
// 1. 일일 장부 파싱 (2차원 메모리 연산 + parseVal 적용)
// ==========================================
function getDailyRecordFromValues(rawValues, displayValues, sheetName, day) {
  if (!rawValues || rawValues.length === 0) return null;
  var startRow = findDayStartRowInValues(rawValues, displayValues, day);
  if (startRow === -1) {
    return { day: day, sheetName: sheetName, prevCash: 600000, cashSales: 0, cardSales: 0, totalSales: 0, rxSales: 0, otcSales: 0, transferSales: 0, expCashBuy: 0, expDiscount: 0, expMiscCash: 0, expMeal: 0, expMiscCard: 0, expBacchus: 0, mallDaewoong: 0, mallHmp: 0, mallDonga: 0, mallJoongwae: 0, mallVet: 0, mallIldong: 0, mallChongKunDang: 0, mallGreenCross: 0, mallOther: 0, mallBags: 0 };
  }

  var blockHeight = 8;
  var startIdx = startRow - 1;
  var endIdx = Math.min(startIdx + blockHeight, rawValues.length);
  var data = { day: day, sheetName: sheetName, prevCash: 600000, cashSales: 0, cardSales: 0, totalSales: 0, rxSales: 0, otcSales: 0, transferSales: 0, expCashBuy: 0, expDiscount: 0, expMiscCash: 0, expMeal: 0, expMiscCard: 0, expBacchus: 0, mallDaewoong: 0, mallHmp: 0, mallDonga: 0, mallJoongwae: 0, mallVet: 0, mallIldong: 0, mallChongKunDang: 0, mallGreenCross: 0, mallOther: 0, mallBags: 0 };

  for (var i = startIdx; i < endIdx; i++) {
    var rowVals = rawValues[i] || [];
    var dispRowVals = displayValues ? (displayValues[i] || []) : rowVals;

    var colA = String(dispRowVals[0] || '').trim();
    var colB = String(dispRowVals[1] || '').trim();
    var colC = String(dispRowVals[2] || '').trim();

    // 날짜 헤더 행(예: "31일" 단독 표시 행)만 건너뛰고, 데이터가 기재된 행은 '시재'/'이월' 여부와 무관하게 전수 파싱!
    if (colA.indexOf('일') !== -1 && !colB && !colC && !rowVals[8] && !rowVals[9] && !rowVals[12]) continue;

    var bNum = parseVal(rowVals[1]) || parseVal(dispRowVals[1]); 
    if (bNum > 0 && data.prevCash === 600000) data.prevCash = bNum;
    var cNum = parseVal(rowVals[2]) || parseVal(dispRowVals[2]);
    if (cNum > 0 && (colB.indexOf('시재') !== -1 || colB === '시재') && data.prevCash === 600000) data.prevCash = cNum;

    if (colC.indexOf('현금') !== -1 || colC === '현금') { 
      var cVal = parseVal(rowVals[3]) || parseVal(dispRowVals[3]); 
      if (cVal > 0) data.cashSales = cVal; 
    }
    if (colC.indexOf('카드') !== -1 || colC === '카드') { 
      var cardVal = parseVal(rowVals[3]) || parseVal(dispRowVals[3]); 
      if (cardVal > 0) data.cardSales = cardVal; 
    }

    var eVal = parseVal(rowVals[4]) || parseVal(dispRowVals[4]); if (eVal > 0 && data.totalSales === 0) data.totalSales = eVal;
    var fVal = parseVal(rowVals[5]) || parseVal(dispRowVals[5]); if (fVal > 0 && data.rxSales === 0) data.rxSales = fVal;
    var gVal = parseVal(rowVals[6]) || parseVal(dispRowVals[6]); if (gVal > 0 && data.otcSales === 0) data.otcSales = gVal;
    var iVal = parseVal(rowVals[8]) || parseVal(dispRowVals[8]); if (iVal > 0) data.transferSales += iVal;
    var jVal = parseVal(rowVals[9]) || parseVal(dispRowVals[9]); if (jVal > 0) data.expCashBuy += jVal;
    var kVal = parseVal(rowVals[10]) || parseVal(dispRowVals[10]); if (kVal > 0) data.expDiscount += kVal;
    var lVal = parseVal(rowVals[11]) || parseVal(dispRowVals[11]); if (lVal > 0) data.expMiscCash += lVal;
    var mVal = parseVal(rowVals[12]) || parseVal(dispRowVals[12]); if (mVal > 0) data.expMeal += mVal;
    var nVal = parseVal(rowVals[13]) || parseVal(dispRowVals[13]); if (nVal > 0) data.expMiscCard += nVal;
    var oVal = parseVal(rowVals[14]) || parseVal(dispRowVals[14]); if (oVal > 0) data.expBacchus += oVal;

    var mallKeys = ['mallDaewoong', 'mallHmp', 'mallDonga', 'mallJoongwae', 'mallVet', 'mallIldong', 'mallChongKunDang', 'mallGreenCross', 'mallOther', 'mallBags'];
    for (var m = 0; m < mallKeys.length; m++) {
      var mallVal = parseVal(rowVals[15 + m]) || parseVal(dispRowVals[15 + m]);
      if (mallVal > 0) data[mallKeys[m]] += mallVal;
    }
  }

  if (data.cashSales === 0 && (endIdx - startIdx) >= 4 && rawValues[startIdx + 3]) data.cashSales = parseVal(rawValues[startIdx + 3][3]);
  if (data.cardSales === 0 && (endIdx - startIdx) >= 5 && rawValues[startIdx + 4]) data.cardSales = parseVal(rawValues[startIdx + 4][3]);

  return data;
}

function getDailyRecord(ss, sheetName, day) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return null;
  var rawValues = sheet.getDataRange().getValues();
  var displayValues = sheet.getDataRange().getDisplayValues();
  return getDailyRecordFromValues(rawValues, displayValues, sheetName, day);
}

// ==========================================
// ⚡ 2. 일일 장부 초고속 쓰기 (setValues 묶음 일괄 처리)
// ==========================================
function saveDailyRecordFast(ss, sheetName, day, data) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('시트를 찾을 수 없습니다: ' + sheetName);

  var rawValues = sheet.getDataRange().getValues();
  var displayValues = sheet.getDataRange().getDisplayValues();
  var startRow = findDayStartRowInValues(rawValues, displayValues, day);
  if (startRow === -1) startRow = day === 1 ? 1 : 11 + (day - 2) * 8;

  var blockHeight = 8;
  var cashRowOffset = 3;
  var cardRowOffset = 4;
  for (var i = 0; i < blockHeight; i++) {
    var txt = String(getCellValue(displayValues || rawValues, startRow + i, 3) || '').trim();
    if (txt.indexOf('현금') !== -1 || txt === '현금') cashRowOffset = i;
    if (txt.indexOf('카드') !== -1 || txt === '카드') cardRowOffset = i;
  }

  var cashRow = startRow + cashRowOffset;
  var cardRow = startRow + cardRowOffset;

  if (data.prevCash !== undefined) sheet.getRange(cashRow, 2).setValue(data.prevCash);
  
  sheet.getRange(cashRow, 4, 2, 1).setValues([[data.cashSales || 0], [data.cardSales || 0]]);
  
  if (data.rxSales !== undefined) sheet.getRange(cashRow, 6).setValue(data.rxSales);
  
  var expBlock = [[
    data.transferSales || 0, data.expCashBuy || 0, data.expDiscount || 0,
    data.expMiscCash || 0, data.expMeal || 0, data.expMiscCard || 0, data.expBacchus || 0
  ]];
  sheet.getRange(cashRow, 9, 1, 7).setValues(expBlock);

  var mallBlock = [[
    data.mallDaewoong || 0, data.mallHmp || 0, data.mallDonga || 0,
    data.mallJoongwae || 0, data.mallVet || 0, data.mallIldong || 0,
    data.mallChongKunDang || 0, data.mallGreenCross || 0, data.mallOther || 0, data.mallBags || 0
  ]];
  sheet.getRange(startRow + 3, 16, 1, 10).setValues(mallBlock);

  SpreadsheetApp.flush();
  return { success: true, day: day, sheetName: sheetName };
}

// ==========================================
// 3. 월말 결산 파싱 (메모리 2차원 스캔 + parseVal 천단위 콤마 대응)
// ==========================================
function getMonthlyRecordFromValues(rawValues, displayValues, sheetName) {
  var values = rawValues;
  var dispValues = displayValues || rawValues;
  if (!values || values.length === 0) return null;

  var discounts = [], pharmTrades = [], cashVendors = [], cardVendors = [], employees = [], severances = [], utilities = [], cardCashbacks = [], cardWithdrawals = [];

  for (var r = 54; r <= 80; r++) {
    var rawName = getCellValue(dispValues, r, 14) || getCellValue(dispValues, r, 15) || '';
    var amt = parseVal(getCellValue(dispValues, r, 16)) || parseVal(getCellValue(values, r, 16));
    if (rawName && !String(rawName).includes('에누리') && !String(rawName).includes('합계')) discounts.push({ name: String(rawName).trim(), amount: amt, cell: 'P' + r });
  }
  if (discounts.length === 0) {
    for (var r = 30; r <= 50; r++) {
      var rawName = getCellValue(dispValues, r, 14) || getCellValue(dispValues, r, 15) || '';
      var amt = parseVal(getCellValue(dispValues, r, 16)) || parseVal(getCellValue(values, r, 16));
      if (rawName && !String(rawName).includes('에누리')) discounts.push({ name: String(rawName).trim(), amount: amt, cell: 'P' + r });
    }
  }

  for (var r = 41; r <= 50; r++) {
    var rawName = getCellValue(dispValues, r, 14) || getCellValue(dispValues, r, 15) || '';
    var amt = parseVal(getCellValue(dispValues, r, 16)) || parseVal(getCellValue(values, r, 16));
    if (rawName && !String(rawName).includes('약국간') && !String(rawName).includes('합계')) pharmTrades.push({ name: String(rawName).trim(), amount: amt, cell: 'P' + r });
  }
  for (var r = 4; r <= 30; r++) {
    var rawName = getCellValue(dispValues, r, 21);
    var amt = parseVal(getCellValue(dispValues, r, 22)) || parseVal(getCellValue(values, r, 22));
    if (rawName && !String(rawName).includes('현금결제') && !String(rawName).includes('합계')) cashVendors.push({ name: String(rawName).trim(), amount: amt, cell: 'V' + r });
  }
  for (var r = 4; r <= 40; r++) {
    var rawName = getCellValue(dispValues, r, 24);
    var amt = parseVal(getCellValue(dispValues, r, 25)) || parseVal(getCellValue(values, r, 25));
    if (rawName && !String(rawName).includes('카드노무') && !String(rawName).includes('합계')) cardVendors.push({ name: String(rawName).trim(), amount: amt, cell: 'Y' + r });
  }
  for (var r = 4; r <= 40; r++) {
    var rawName = getCellValue(dispValues, r, 26);
    var amt = parseVal(getCellValue(dispValues, r, 27)) || parseVal(getCellValue(values, r, 27));
    if (rawName && !String(rawName).includes('카드노무') && !String(rawName).includes('합계')) cardVendors.push({ name: String(rawName).trim(), amount: amt, cell: 'AA' + r });
  }
  for (var r = 54; r <= 63; r++) {
    var rawName = getCellValue(dispValues, r, 21);
    var amt = parseVal(getCellValue(dispValues, r, 22)) || parseVal(getCellValue(values, r, 22));
    if (rawName && !String(rawName).includes('인건비') && !String(rawName).includes('합계')) employees.push({ name: String(rawName).trim(), amount: amt, cell: 'V' + r });
  }
  for (var r = 54; r <= 63; r++) {
    var rawName = getCellValue(dispValues, r, 23);
    var amt = parseVal(getCellValue(dispValues, r, 24)) || parseVal(getCellValue(values, r, 24));
    if (rawName && !String(rawName).includes('인건비') && !String(rawName).includes('합계')) employees.push({ name: String(rawName).trim(), amount: amt, cell: 'X' + r });
  }
  for (var r = 44; r <= 63; r++) {
    var rawName = getCellValue(dispValues, r, 26);
    var amt = parseVal(getCellValue(dispValues, r, 27)) || parseVal(getCellValue(values, r, 27));
    if (rawName && !String(rawName).includes('퇴직금') && !String(rawName).includes('합계')) severances.push({ name: String(rawName).trim(), amount: amt, cell: 'AA' + r });
  }
  for (var r = 69; r <= 85; r++) {
    var rawName = getCellValue(dispValues, r, 21);
    var amt = parseVal(getCellValue(dispValues, r, 22)) || parseVal(getCellValue(values, r, 22));
    if (rawName && !String(rawName).includes('공과금') && !String(rawName).includes('합계')) utilities.push({ name: String(rawName).trim(), amount: amt, cell: 'V' + r });
  }
  for (var r = 69; r <= 85; r++) {
    var rawName = getCellValue(dispValues, r, 23);
    var amt = parseVal(getCellValue(dispValues, r, 24)) || parseVal(getCellValue(values, r, 24));
    if (rawName && !String(rawName).includes('공과금') && !String(rawName).includes('합계')) utilities.push({ name: String(rawName).trim(), amount: amt, cell: 'X' + r });
  }
  for (var r = 69; r <= 85; r++) {
    var rawName = getCellValue(dispValues, r, 26) || getCellValue(values, r, 26);
    var spend = parseVal(getCellValue(dispValues, r, 27)) || parseVal(getCellValue(values, r, 27));
    if (rawName && !String(rawName).includes('카드별결제') && !String(rawName).includes('합계')) cardCashbacks.push({ name: String(rawName).trim(), spend: spend, rate: String(rawName).includes('우리') ? 1.7 : 1.5, cell: 'AA' + r });
  }
  if (cardCashbacks.length === 0) {
    for (var r = 30; r <= 35; r++) {
      var rawName = getCellValue(dispValues, r, 14) || getCellValue(dispValues, r, 15);
      var spend = parseVal(getCellValue(dispValues, r, 16)) || parseVal(getCellValue(values, r, 16));
      if (rawName && !String(rawName).includes('카드사별') && !String(rawName).includes('혜택')) cardCashbacks.push({ name: String(rawName).trim(), spend: spend, rate: String(rawName).includes('우리') ? 1.7 : 1.5, cell: 'P' + r });
    }
  }
  for (var r = 50; r <= 55; r++) {
    var rawName = getCellValue(dispValues, r, 18);
    var amt = parseVal(getCellValue(dispValues, r, 19)) || parseVal(getCellValue(values, r, 19));
    if (rawName && !String(rawName).includes('계좌별') && !String(rawName).includes('합계')) cardWithdrawals.push({ name: String(rawName).trim(), amount: amt, cell: 'S' + r });
  }

  return {
    sheetName: sheetName,
    netSurplus: parseVal(getCellValue(dispValues, 2, 13)) || parseVal(getCellValue(values, 2, 13)),
    theoreticalProfit: parseVal(getCellValue(dispValues, 4, 3)) || parseVal(getCellValue(values, 4, 3)),
    incomeRxFee: parseVal(getCellValue(dispValues, 5, 3)) || parseVal(getCellValue(values, 5, 3)),
    otcProfit: parseVal(getCellValue(dispValues, 6, 3)) || parseVal(getCellValue(values, 6, 3)),
    incomeNonCovered: parseVal(getCellValue(dispValues, 8, 3)) || parseVal(getCellValue(values, 8, 3)),
    otcTotalSales: parseVal(getCellValue(dispValues, 12, 3)) || parseVal(getCellValue(values, 12, 3)),
    grossIncome: parseVal(getCellValue(dispValues, 4, 16)) || parseVal(getCellValue(values, 4, 16)),
    incomeOtcRaw: parseVal(getCellValue(dispValues, 6, 16)) || parseVal(getCellValue(values, 6, 16)),
    incomeCopay: parseVal(getCellValue(dispValues, 7, 16)) || parseVal(getCellValue(values, 7, 16)),
    incomeNhisClaim: parseVal(getCellValue(dispValues, 8, 16)) || parseVal(getCellValue(values, 8, 16)),
    totalDiscounts: parseVal(getCellValue(dispValues, 9, 16)) || parseVal(getCellValue(values, 9, 16)),
    totalPharmTrades: parseVal(getCellValue(dispValues, 10, 16)) || parseVal(getCellValue(values, 10, 16)),
    incomeDiscount: parseVal(getCellValue(dispValues, 11, 16)) || parseVal(getCellValue(values, 11, 16)),
    totalCashback: parseVal(getCellValue(dispValues, 13, 16)) || parseVal(getCellValue(values, 13, 16)),
    grossExpenses: parseVal(getCellValue(dispValues, 4, 19)) || parseVal(getCellValue(values, 4, 19)),
    vendorCashTotal: parseVal(getCellValue(dispValues, 6, 19)) || parseVal(getCellValue(values, 6, 19)),
    vendorCardTotal: parseVal(getCellValue(dispValues, 7, 19)) || parseVal(getCellValue(values, 7, 19)),
    expCardWithdraw: parseVal(getCellValue(values, 49, 19)) || parseVal(getCellValue(values, 7, 19)) || 0,
    expPayroll: parseVal(getCellValue(dispValues, 8, 19)) || parseVal(getCellValue(values, 8, 19)),
    expUtility: parseVal(getCellValue(dispValues, 9, 19)) || parseVal(getCellValue(values, 9, 19)),
    expRent: parseVal(getCellValue(values, 10, 19)) || 15070000,
    expOtherOperating: parseVal(getCellValue(dispValues, 11, 19)) || parseVal(getCellValue(values, 11, 19)),
    expCardFee: parseVal(getCellValue(dispValues, 12, 19)) || parseVal(getCellValue(values, 12, 19)),
    expFinance: parseVal(getCellValue(dispValues, 13, 19)) || parseVal(getCellValue(values, 13, 19)),
    expPension: parseVal(getCellValue(values, 14, 19)) || 340000,
    expSaving: parseVal(getCellValue(values, 15, 19)) || 1000000,
    expYellowUmbrella: parseVal(getCellValue(values, 16, 19)) || 400000,
    expSeverance: parseVal(getCellValue(dispValues, 17, 19)) || parseVal(getCellValue(values, 17, 19)),
    expDining: parseVal(getCellValue(dispValues, 38, 19)) || parseVal(getCellValue(values, 38, 19)),
    discounts: discounts,
    pharmTrades: pharmTrades,
    cashVendors: cashVendors,
    cardVendors: cardVendors,
    employees: employees,
    severances: severances,
    utilities: utilities,
    cardCashbacks: cardCashbacks,
    cardWithdrawals: cardWithdrawals
  };
}

function getMonthlyRecord(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return null;
  var rawValues = sheet.getDataRange().getValues();
  var displayValues = sheet.getDataRange().getDisplayValues();
  return getMonthlyRecordFromValues(rawValues, displayValues, sheetName);
}

// ==========================================
// ⚡ 4. 월말 결산 초고속 쓰기 (수식 100% 보존)
// ==========================================
function saveMonthlyRecordSafeBlock(ss, sheetName, data) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('결산 시트를 찾을 수 없습니다: ' + sheetName);

  if (data.incomeRxFee !== undefined) sheet.getRange('C5').setValue(data.incomeRxFee);
  if (data.otcProfit !== undefined) sheet.getRange('C6').setValue(data.otcProfit);
  if (data.incomeNonCovered !== undefined) sheet.getRange('C8').setValue(data.incomeNonCovered);
  if (data.incomeNhisClaim !== undefined) sheet.getRange('P8').setValue(data.incomeNhisClaim);
  if (data.expRent !== undefined) sheet.getRange('S10').setValue(data.expRent);
  if (data.expPension !== undefined) sheet.getRange('S14').setValue(data.expPension);
  if (data.expSaving !== undefined) sheet.getRange('S15').setValue(data.expSaving);
  if (data.expYellowUmbrella !== undefined) sheet.getRange('S16').setValue(data.expYellowUmbrella);
  if (data.expDining !== undefined) sheet.getRange('S38').setValue(data.expDining);

  function saveTargetItems(items, defaultColName, defaultColAmt, startRowDefault) {
    if (!items || !Array.isArray(items)) return;
    items.forEach(function(item, idx) {
      if (item.cell) {
        sheet.getRange(item.cell).setValue(item.amount !== undefined ? item.amount : (item.spend || 0));
        var rNum = parseInt(item.cell.replace(/[^0-9]/g, ''), 10);
        if (rNum && item.name) {
          var colLetter = item.cell.replace(/[0-9]/g, '');
          var nameCol = colLetter;
          if (colLetter === 'V') nameCol = 'U';
          else if (colLetter === 'Y') nameCol = 'X';
          else if (colLetter === 'AA') nameCol = 'Z';
          else if (colLetter === 'X') nameCol = 'W';
          else if (colLetter === 'P') nameCol = 'N';
          sheet.getRange(nameCol + rNum).setValue(item.name);
        }
      } else if (startRowDefault && defaultColAmt) {
        var rNum = startRowDefault + idx;
        sheet.getRange(defaultColAmt + rNum).setValue(item.amount !== undefined ? item.amount : (item.spend || 0));
        if (item.name && defaultColName) sheet.getRange(defaultColName + rNum).setValue(item.name);
      }
    });
  }

  saveTargetItems(data.cashVendors, 'U', 'V', 4);
  saveTargetItems(data.cardVendors, 'X', 'Y', 4);
  saveTargetItems(data.employees, 'U', 'V', 54);
  saveTargetItems(data.severances, 'Z', 'AA', 44);
  saveTargetItems(data.utilities, 'U', 'V', 69);
  saveTargetItems(data.discounts, 'N', 'P', 54);
  saveTargetItems(data.pharmTrades, 'N', 'P', 41);
  saveTargetItems(data.cardCashbacks, 'Z', 'AA', 69);
  saveTargetItems(data.cardWithdrawals, 'R', 'S', 50);

  SpreadsheetApp.flush();
  return { success: true, sheetName: sheetName };
}

// ⚡ 5. 전체 31일 일괄 조회 (RAM 캐싱 지원 + getDisplayValues 복원)
function getFullMonthData(ss, yymm) {
  var dailySheet = ss.getSheetByName(yymm);
  var monthlySheet = ss.getSheetByName(yymm + "결산");

  var dailyRawValues = dailySheet ? dailySheet.getDataRange().getValues() : null;
  var dailyDisplayValues = dailySheet ? dailySheet.getDataRange().getDisplayValues() : null;

  var monthlyRawValues = monthlySheet ? monthlySheet.getDataRange().getValues() : null;
  var monthlyDisplayValues = monthlySheet ? monthlySheet.getDataRange().getDisplayValues() : null;

  var dailyList = {};
  if (dailyRawValues) {
    for (var day = 1; day <= 31; day++) {
      var rec = getDailyRecordFromValues(dailyRawValues, dailyDisplayValues, yymm, day);
      if (rec) dailyList[day] = rec;
    }
  }

  var monthly = monthlyRawValues ? getMonthlyRecordFromValues(monthlyRawValues, monthlyDisplayValues, yymm + "결산") : null;
  var cumulative = { cashSalesTotal: 0, cardSalesTotal: 0, onlineMallTotal: 0, totalSalesSum: 0, rxSalesSum: 0, otcSalesSum: 0 };
  
  if (dailyRawValues && dailyRawValues.length) {
    var maxR = dailyRawValues.length;
    var dVals = dailyDisplayValues || dailyRawValues;
    var rVals = dailyRawValues;

    // 1. 하단 요약 영역 스마트 동적 스캔 (240행부터 끝까지 라벨 기반 정밀 탐색)
    var scanStart = Math.max(0, maxR - 25);
    for (var r = scanStart; r < maxR; r++) {
      var rowStr = '';
      for (var c = 0; c < Math.min(30, (dVals[r] ? dVals[r].length : 0)); c++) {
        rowStr += ' ' + String(dVals[r][c] || '');
      }
      rowStr = rowStr.replace(/\s+/g, '');

      // ① 월현금매출 (B/C열 "월현금매출", D열 금액)
      if (rowStr.indexOf('월현금매출') !== -1 || (rowStr.indexOf('현금') !== -1 && rowStr.indexOf('매출') !== -1 && rowStr.indexOf('월') !== -1)) {
        for (var c = 1; c <= 8; c++) {
          var val = parseVal(getCellValue(dVals, r + 1, c)) || parseVal(getCellValue(rVals, r + 1, c));
          if (val > 100000) { cumulative.cashSalesTotal = val; break; }
        }
      }

      // ② 월카드매출 (B/C열 "월카드매출", D열 금액)
      if (rowStr.indexOf('월카드매출') !== -1 || (rowStr.indexOf('카드') !== -1 && rowStr.indexOf('매출') !== -1 && rowStr.indexOf('월') !== -1)) {
        for (var c = 1; c <= 8; c++) {
          var val = parseVal(getCellValue(dVals, r + 1, c)) || parseVal(getCellValue(rVals, r + 1, c));
          if (val > 1000000) { cumulative.cardSalesTotal = val; break; }
        }
      }

      // ③ 온라인몰즉시결제 (Y/Z열 금액)
      if (rowStr.indexOf('온라인몰즉시결제') !== -1 || rowStr.indexOf('온라인몰카드') !== -1 || (rowStr.indexOf('온라인몰') !== -1 && rowStr.indexOf('결제') !== -1)) {
        for (var c = 15; c <= 30; c++) {
          var val = parseVal(getCellValue(dVals, r + 1, c)) || parseVal(getCellValue(rVals, r + 1, c));
          if (val > 100000) { cumulative.onlineMallTotal = val; break; }
        }
      }

      // ④ 월총합 바 (E열 당월총매출, F열 전산본부금, G열 매약매출)
      if (rowStr.indexOf('월총합') !== -1 || rowStr.indexOf('월합계') !== -1 || rowStr.indexOf('당월총매출') !== -1) {
        var totE = parseVal(getCellValue(dVals, r + 1, 5)) || parseVal(getCellValue(rVals, r + 1, 5));
        var rxF = parseVal(getCellValue(dVals, r + 1, 6)) || parseVal(getCellValue(rVals, r + 1, 6));
        var otcG = parseVal(getCellValue(dVals, r + 1, 7)) || parseVal(getCellValue(rVals, r + 1, 7));
        if (totE > 1000000) cumulative.totalSalesSum = totE;
        if (rxF > 1000000) cumulative.rxSalesSum = rxF;
        if (otcG > 1000000) cumulative.otcSalesSum = otcG;
      }
    }

    // 2. 명시적 셀 좌표 2중 안전 폴백 (D251, D252, Y252 등)
    if (cumulative.cashSalesTotal === 0 && maxR >= 251) {
      cumulative.cashSalesTotal = parseVal(getCellValue(dVals, 251, 4)) || parseVal(getCellValue(rVals, 251, 4));
    }
    if (cumulative.cardSalesTotal === 0 && maxR >= 252) {
      cumulative.cardSalesTotal = parseVal(getCellValue(dVals, 252, 4)) || parseVal(getCellValue(rVals, 252, 4));
    }
    if (cumulative.onlineMallTotal === 0) {
      var candidateRows = [252, 251, 250, 253];
      var candidateCols = [25, 26, 27, 24]; // Y, Z, AA, X
      for (var cr = 0; cr < candidateRows.length; cr++) {
        for (var cc = 0; cc < candidateCols.length; cc++) {
          var v = parseVal(getCellValue(dVals, candidateRows[cr], candidateCols[cc])) || parseVal(getCellValue(rVals, candidateRows[cr], candidateCols[cc]));
          if (v > 1000000) { cumulative.onlineMallTotal = v; break; }
        }
        if (cumulative.onlineMallTotal > 0) break;
      }
    }
    if (cumulative.totalSalesSum === 0 && maxR >= 250) {
      cumulative.totalSalesSum = parseVal(getCellValue(dVals, 250, 5)) || parseVal(getCellValue(rVals, 250, 5))
        || parseVal(getCellValue(dVals, 249, 5)) || parseVal(getCellValue(rVals, 249, 5));
    }
    if (cumulative.rxSalesSum === 0 && maxR >= 250) {
      cumulative.rxSalesSum = parseVal(getCellValue(dVals, 250, 6)) || parseVal(getCellValue(rVals, 250, 6))
        || parseVal(getCellValue(dVals, 249, 6)) || parseVal(getCellValue(rVals, 249, 6));
    }
    if (cumulative.otcSalesSum === 0 && maxR >= 250) {
      cumulative.otcSalesSum = parseVal(getCellValue(dVals, 250, 7)) || parseVal(getCellValue(rVals, 250, 7))
        || parseVal(getCellValue(dVals, 249, 7)) || parseVal(getCellValue(rVals, 249, 7));
    }
  }

  return { yymm: yymm, hasDailySheet: !!dailySheet, hasMonthlySheet: !!monthlySheet, dailyRecords: dailyList, monthlyRecord: monthly, cumulative: cumulative };
}

// 약품 위치 데이터 읽기/쓰기
function getLocationsRecord(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var result = [];
  for (var i = 0; i < values.length; i++) {
    var raw = values[i][0];
    if (raw && typeof raw === 'string') {
      try { result.push(JSON.parse(raw)); } catch (e) {}
    }
  }
  return result;
}

function saveLocationsRecord(ss, sheetName, items) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.getRange(1, 1).setValue("DATA_JSON");
  }
  sheet.clearContents();
  sheet.getRange(1, 1).setValue("DATA_JSON");
  if (items && items.length > 0) {
    var rows = items.map(function(item) { return [JSON.stringify(item)]; });
    sheet.getRange(2, 1, rows.length, 1).setValues(rows);
  }
  SpreadsheetApp.flush();
  return true;
}