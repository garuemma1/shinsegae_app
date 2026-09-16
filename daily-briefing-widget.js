/**
 * 📰 신세계약국 데일리 3초 브리핑 카드 뉴스 위젯 (Daily Briefing Widget)
 * - 당일 / 전일 / 명일의 약국 변동 사항(근무, 업무일지, 비품, 반품, 공지, 결재) 실시간 초고속 집계
 * - 슬림 1줄 요약 바 ↔ 4분할 상세 카드 뉴스 원클릭 토글
 * - 각 항목 클릭 시 해당 모듈로 원클릭 딥링크 점프
 */
window.DailyBriefingWidget = (function () {
  let isExpanded = false;
  let targetDayOffset = 0; // 0: 오늘, -1: 어제, 1: 내일

  function getTargetDateStr(offset = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function getDateLabel(offset = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const month = d.getMonth() + 1;
    const date = d.getDate();
    const dayName = days[d.getDay()];
    let tag = '오늘';
    if (offset === -1) tag = '어제';
    else if (offset === -2) tag = '그제';
    else if (offset === 1) tag = '내일';
    return `${month}월 ${date}일(${dayName}) · ${tag}`;
  }

  function aggregateBriefingData(targetDateStr) {
    const data = window.SheetsSync.getData ? window.SheetsSync.getData() : {};
    const employees = (window.SheetsSync && typeof window.SheetsSync.getEmployees === 'function')
      ? window.SheetsSync.getEmployees()
      : (data.employees || []);
    const scheduleRecords = (window.SheetsSync && typeof window.SheetsSync.getSchedule === 'function')
      ? window.SheetsSync.getSchedule()
      : (data.schedule || []);
    const worklogs = (window.SheetsSync && typeof window.SheetsSync.getWorklogs === 'function')
      ? window.SheetsSync.getWorklogs()
      : (data.worklogs || []);
    const supplies = (window.SheetsSync && typeof window.SheetsSync.getSupplies === 'function')
      ? window.SheetsSync.getSupplies()
      : (data.supplies || []);
    const expiryReturns = (window.SheetsSync && typeof window.SheetsSync.getExpiryReturns === 'function')
      ? window.SheetsSync.getExpiryReturns()
      : (data.expiryReturns || []);
    const notices = (window.SheetsSync && typeof window.SheetsSync.getNotices === 'function')
      ? window.SheetsSync.getNotices()
      : (data.notices || []);
    const leaveRequests = (window.SheetsSync && typeof window.SheetsSync.getLeaveRequests === 'function')
      ? window.SheetsSync.getLeaveRequests()
      : (data.leaveRequests || []);
    const getLocalOrCloudData = (key, sheetsGetter, fallbackArr) => {
      if (typeof sheetsGetter === 'function') {
        const list = sheetsGetter();
        if (Array.isArray(list) && list.length > 0) return list;
      }
      if (Array.isArray(fallbackArr) && fallbackArr.length > 0) return fallbackArr;
      try {
        const raw = localStorage.getItem(key);
        if (raw) return JSON.parse(raw);
      } catch(e) {}
      return [];
    };

    const medicineLocations = getLocalOrCloudData('ssg_medicine_locations_v1', window.SheetsSync ? window.SheetsSync.getMedicineLocations : null, data.medicineLocations);
    const rxMedicineLocations = getLocalOrCloudData('ssg_rx_medicine_locations_v1', window.SheetsSync ? window.SheetsSync.getRxMedicineLocations : null, data.rxMedicineLocations);

    // 🌟 환자 예약 주문 & 선결제 데이터 로드
    const patientOrders = getLocalOrCloudData('ssg_patient_orders_v1', window.SheetsSync ? window.SheetsSync.getPatientOrders : null, data.patientOrders);

    // 🌟 인근약국 교품 & 불용재고 데이터 로드
    let pharmacyExchangeRaw = null;
    if (window.SheetsSync && typeof window.SheetsSync.getPharmacyExchange === 'function') {
      pharmacyExchangeRaw = window.SheetsSync.getPharmacyExchange();
    }
    if (!pharmacyExchangeRaw && data.pharmacyExchange) {
      pharmacyExchangeRaw = data.pharmacyExchange;
    }
    if (!pharmacyExchangeRaw) {
      try {
        const rawPE = localStorage.getItem('ssg_pharmacy_exchange_v1');
        if (rawPE) pharmacyExchangeRaw = JSON.parse(rawPE);
      } catch (e) {}
    }
    const pharmacyExchanges = (pharmacyExchangeRaw && Array.isArray(pharmacyExchangeRaw.exchanges)) ? pharmacyExchangeRaw.exchanges : [];
    const deadStocks = (pharmacyExchangeRaw && Array.isArray(pharmacyExchangeRaw.deadStocks)) ? pharmacyExchangeRaw.deadStocks : [];

    // 🌟 타임스탬프(숫자 ms), YYYY-MM-DD, ISO 문자열, id(med_1788...) 모든 날짜 형식을 'YYYY-MM-DD'로 안전 변환
    function getEntityDateStr(item) {
      if (!item) return '';
      // 1. displayDate (예: "2026-09-09 14:30")
      if (item.displayDate) {
        const s = String(item.displayDate).trim().replace(/\./g, '-');
        const p = s.split(' ')[0];
        if (p && p.includes('-')) return p;
      }
      // 2. date (예: "2026-09-09")
      if (item.date) {
        const s = String(item.date).trim().replace(/\./g, '-');
        const p = s.split(' ')[0];
        if (p && p.includes('-')) return p;
      }
      // 3. updatedAt (ms 숫자 타임스탬프 또는 문자열)
      if (item.updatedAt) {
        if (typeof item.updatedAt === 'number') {
          const d = new Date(item.updatedAt);
          if (!isNaN(d.getTime())) {
            const pad = n => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
          }
        } else {
          const str = String(item.updatedAt).trim().replace(/\./g, '-');
          if (str.includes('-')) return str.split(' ')[0].split('T')[0];
          const num = parseInt(str, 10);
          if (!isNaN(num) && num > 1000000000000) {
            const d = new Date(num);
            const pad = n => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
          }
        }
      }
      // 4. createdAt
      if (item.createdAt) {
        if (typeof item.createdAt === 'number') {
          const d = new Date(item.createdAt);
          if (!isNaN(d.getTime())) {
            const pad = n => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
          }
        } else {
          const str = String(item.createdAt).trim().replace(/\./g, '-');
          if (str.includes('-')) return str.split(' ')[0].split('T')[0];
          const num = parseInt(str, 10);
          if (!isNaN(num) && num > 1000000000000) {
            const d = new Date(num);
            const pad = n => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
          }
        }
      }
      // 5. id에 타임스탬프가 포함된 경우 ('med_1788...', 'ord_1788...', 'exc_1788...', 'ds_1788...' 등)
      if (item.id && typeof item.id === 'string') {
        const num = parseInt(item.id.replace(/^med_|^rx_|^task_|^sup_|^ret_|^ord_|^exc_|^ds_/, ''), 10);
        if (!isNaN(num) && num > 1000000000000) {
          const d = new Date(num);
          if (!isNaN(d.getTime())) {
            const pad = n => String(n).padStart(2, '0');
            return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
          }
        }
      }
      return '';
    }

    function checkMedDateMatch(m, targetDate) {
      if (getEntityDateStr(m) === targetDate) return true;
      if (m.history && Array.isArray(m.history)) {
        return m.history.some(h => getEntityDateStr(h) === targetDate);
      }
      return false;
    }

    // 1. 월간 근무 스케줄 & 출근 인원
    const dayShifts = scheduleRecords.filter(r => r.date === targetDateStr && r.shift && r.shift !== 'OFF');
    const onDutyStaff = [];
    dayShifts.forEach(s => {
      const emp = employees.find(e => e.id === s.empId);
      if (emp) {
        onDutyStaff.push({
          name: emp.name,
          role: emp.role || '직원',
          shift: s.shift,
          timeText: (s.startTime && s.endTime) ? `${s.startTime}~${s.endTime}` : (s.shift || '')
        });
      }
    });

    // 오늘 휴가자 (연차대장 승인건)
    const onLeaveStaff = [];
    leaveRequests.forEach(l => {
      if (l.status === 'APPROVED') {
        const start = l.startDate || l.date;
        const end = l.endDate || l.startDate || l.date;
        if (start && end && targetDateStr >= start && targetDateStr <= end) {
          const emp = employees.find(e => e.id === l.empId);
          if (emp && !onLeaveStaff.some(item => item.name === emp.name)) {
            onLeaveStaff.push({ name: emp.name, type: l.type || '연차' });
          }
        }
      }
    });

    // 2. 업무일지 & 인수인계
    const dayLogs = worklogs.filter(w => {
      const wDate = getEntityDateStr(w) || w.date || (w.createdAt ? String(w.createdAt).split(' ')[0] : '');
      return wDate === targetDateStr;
    });
    // 특이사항/긴급/중요/품절/주의/인수인계 공유 필터링
    const isNotableLog = (w) => {
      const tag = String(w.tag || w.type || '');
      const c = String(w.content || w.text || '');
      return tag.includes('특이') || tag.includes('중요') || tag.includes('긴급') || 
             tag.includes('품절') || tag.includes('주의') || tag.includes('고객') ||
             tag.includes('클레임') || tag.includes('사고') || tag.includes('확인') ||
             c.includes('특이') || c.includes('중요') || c.includes('긴급') || 
             c.includes('품절') || c.includes('주의') || c.includes('필독') || c.includes('확인요망');
    };
    const importantLogs = dayLogs.filter(isNotableLog);

    // 3. 약국 소모품 관리
    const daySupplies = supplies.filter(s => {
      const sDate = getEntityDateStr(s) || s.requestDate || (s.createdAt ? String(s.createdAt).split(' ')[0] : '');
      return sDate === targetDateStr;
    });
    const pendingSuppliesCount = supplies.filter(s => s.status === 'PENDING').length;

    // 4. 일반의약품 위치 관리 (해당 날짜 신규 등록/수정)
    const dayOtcMeds = medicineLocations.filter(m => checkMedDateMatch(m, targetDateStr));

    // 5. 전문의약품 위치 관리 (해당 날짜 신규 등록/수정)
    const dayRxMeds = rxMedicineLocations.filter(m => checkMedDateMatch(m, targetDateStr));

    // 6. 유효기간 & 반품 대장
    const dayReturns = expiryReturns.filter(e => {
      const eDate = getEntityDateStr(e) || e.date || (e.registeredAt ? String(e.registeredAt).split(' ')[0] : (e.createdAt ? String(e.createdAt).split(' ')[0] : ''));
      if (eDate === targetDateStr) return true;
      if (e.returnHandoverDate && String(e.returnHandoverDate).split(' ')[0] === targetDateStr) return true;
      if (e.settledDate && String(e.settledDate).split(' ')[0] === targetDateStr) return true;
      return false;
    });

    // 7. 공지사항 & 업무 SOP
    const dayNotices = notices.filter(n => {
      const nDate = getEntityDateStr(n) || n.date || (n.createdAt ? String(n.createdAt).split(' ')[0] : '');
      return nDate === targetDateStr;
    });

    // 결재 대기 건수 (연차/휴가 미결재)
    const pendingLeavesCount = leaveRequests.filter(l => l.status === 'PENDING').length;

    // 🚨 유효기간 3단계 조기경보 실시간 집계 (미정산 건 대상)
    const activeReturns = expiryReturns.filter(e => e.status !== 'COMPLETED');
    const nowTime = Date.now();
    const criticalReturns = [];
    const urgentReturns = [];
    activeReturns.forEach(e => {
      if (!e.expiryDate) return;
      const clean = String(e.expiryDate).trim().replace(/\./g, '-').replace(/\//g, '-');
      let target;
      if (/^\d{4}-\d{2}$/.test(clean)) {
        const parts = clean.split('-');
        target = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10), 0, 23, 59, 59);
      } else {
        target = new Date(clean + 'T23:59:59');
      }
      if (isNaN(target.getTime())) return;
      const diffDays = Math.ceil((target.getTime() - nowTime) / (1000 * 60 * 60 * 24));
      if (diffDays <= 30) {
        criticalReturns.push(e);
      } else if (diffDays <= 90) {
        urgentReturns.push(e);
      }
    });

    // 8. 📋 환자 예약 주문 & 선결제 관리
    // 당일 접수 또는 당일 상태 변경된 주문
    const dayOrders = patientOrders.filter(o => {
      const oDate = getEntityDateStr(o) || (o.registeredAt ? String(o.registeredAt).split(' ')[0] : '');
      return oDate === targetDateStr;
    });
    // 현재 진행 중인 환자 주문 (입고대기 or 입고완료/발송준비)
    const pendingOrders = patientOrders.filter(o => o.status === 'PENDING_ORDER');
    const arrivedOrders = patientOrders.filter(o => o.status === 'ARRIVED');
    const unpaidOrders = patientOrders.filter(o => o.paymentStatus === 'PENDING' || (o.paymentStatus === 'BANK_TRANSFER' && !o.isBankTransferred));

    // 9. 🤝 인근약국 교품 & 불용재고 대장
    // 당일 등록된 교품 내역
    const dayExchanges = pharmacyExchanges.filter(x => {
      const xDate = getEntityDateStr(x) || (x.date ? String(x.date).split(' ')[0] : '');
      return xDate === targetDateStr;
    });

    // 헬퍼: 교품 정산 완료 여부 판별 (SETTLED, SETTLED_RETURN, SETTLED_MONEY 모두 완벽 인식)
    const isSettledExchange = (x) => {
      if (!x) return false;
      const s = String(x.status || '').toUpperCase();
      return s === 'SETTLED' || s === 'SETTLED_RETURN' || s === 'SETTLED_MONEY' || s.startsWith('SETTLED');
    };

    // 미정산(빌려줌/빌려옴) 교품 내역 (SETTLED_RETURN, SETTLED_MONEY는 정산 완료로 완벽 제외!)
    const pendingExchanges = pharmacyExchanges.filter(x => !isSettledExchange(x));
    const lendExchanges = pendingExchanges.filter(x => x.type === 'LEND');
    const borrowExchanges = pendingExchanges.filter(x => x.type === 'BORROW');
    // 당일 정산 완료된 교품 내역
    const settledExchangesToday = pharmacyExchanges.filter(x => {
      if (!isSettledExchange(x)) return false;
      const xDate = getEntityDateStr(x) || (x.date ? String(x.date).split(' ')[0] : '');
      return xDate === targetDateStr;
    });

    // 당일 등록된 불용재고 내역
    const dayDeadStocks = deadStocks.filter(d => {
      const dDate = getEntityDateStr(d) || (d.displayDate ? String(d.displayDate).split(' ')[0] : '');
      return dDate === targetDateStr;
    });
    // 현재 보관 중(미정산)인 불용재고 리스트 및 총 손실액
    const activeDeadStocks = deadStocks.filter(d => d.status === 'STORAGE');
    const totalDeadStockLoss = activeDeadStocks.reduce((sum, d) => sum + (Number(d.totalPrice) || 0), 0);

    return {
      targetDateStr,
      onDutyStaff,
      onLeaveStaff,
      dayLogs,
      importantLogs,
      daySupplies,
      pendingSuppliesCount,
      dayOtcMeds,
      dayRxMeds,
      dayReturns,
      dayNotices,
      pendingLeavesCount,
      criticalReturns,
      urgentReturns,
      dayOrders,
      pendingOrders,
      arrivedOrders,
      unpaidOrders,
      dayExchanges,
      pendingExchanges,
      lendExchanges,
      borrowExchanges,
      settledExchangesToday,
      dayDeadStocks,
      activeDeadStocks,
      totalDeadStockLoss
    };
  }

  function renderWidget() {
    try {
      const container = document.getElementById('daily-briefing-widget-mount');
      if (!container) return;

    const currUser = window.SheetsSync.getCurrentUser ? window.SheetsSync.getCurrentUser() : null;
    if (!currUser) {
      container.innerHTML = '';
      return;
    }

    const targetDateStr = getTargetDateStr(targetDayOffset);
    const dateLabel = getDateLabel(targetDayOffset);
    const b = aggregateBriefingData(targetDateStr);

    const pharmacists = b.onDutyStaff.filter(s => s.role.includes('약사') || s.role === '약국장');
    const generalStaff = b.onDutyStaff.filter(s => !s.role.includes('약사') && s.role !== '약국장');

    // 🌟 변동사항이 있는 실무 카드만 선별 생성 (변동 없는 탭은 제외하여 깔끔함 극대화)
    const activeCards = [];

    // 카드 1: 월간 근무 스케줄 (출근자 또는 휴가자가 있을 때만)
    if (b.onDutyStaff.length > 0 || b.onLeaveStaff.length > 0) {
      activeCards.push(`
        <div style="background:#ffffff; border:1.5px solid #e2e8f0; border-radius:14px; padding:14px; box-shadow:0 2px 6px rgba(0,0,0,0.02);">
          <div style="margin-bottom:8px;">
            <strong style="font-size:13px; color:#0f172a;"><i class="fas fa-calendar-alt text-emerald-600 me-1"></i> 월간 근무 스케줄</strong>
          </div>
          <div style="font-size:12px; color:#334155; line-height:1.6;">
            <div>▪️ <strong>약사 출근(${pharmacists.length}명):</strong> ${pharmacists.length > 0 ? pharmacists.map(p => `<span class="badge bg-light text-dark border ms-1">${p.name}</span>`).join('') : '<span class="text-muted">배정 없음</span>'}</div>
            <div style="margin-top:4px;">▪️ <strong>직원 출근(${generalStaff.length}명):</strong> ${generalStaff.length > 0 ? generalStaff.map(g => `<span class="badge bg-light text-dark border ms-1">${g.name}</span>`).join('') : '<span class="text-muted">배정 없음</span>'}</div>
            ${b.onLeaveStaff.length > 0 ? `<div style="margin-top:5px; color:#b45309; background:#fffbeb; padding:4px 8px; border-radius:6px; font-weight:700;">🏖️ 휴가자: ${b.onLeaveStaff.map(l => `${l.name}(${l.type})`).join(', ')}</div>` : ''}
          </div>
        </div>
      `);
    }

    // 카드 2: 업무일지 & 인수인계 (당일 등록된 일지가 있을 때만)
    if (b.dayLogs.length > 0) {
      activeCards.push(`
        <div style="background:#ffffff; border:1.5px solid #e2e8f0; border-radius:14px; padding:14px; box-shadow:0 2px 6px rgba(0,0,0,0.02);">
          <div style="margin-bottom:8px;">
            <strong style="font-size:13px; color:#0f172a;"><i class="fas fa-clipboard-list text-primary me-1"></i> 업무일지 & 인수인계 (${b.dayLogs.length}건)</strong>
          </div>
          ${b.importantLogs.length > 0 ? `
            <div style="background:#fff1f2; border:1.2px solid #fecdd3; border-radius:8px; padding:7px 9px; margin-bottom:8px;">
              <div style="font-size:11.5px; color:#e11d48; font-weight:800; margin-bottom:3px;">
                <i class="fas fa-fire me-1"></i>특이사항 (${b.importantLogs.length}건)
              </div>
              ${b.importantLogs.map(l => `
                <div style="font-size:11.5px; color:#9f1239; line-height:1.45; margin-top:3px; word-break:break-word;">
                  • <strong>${l.authorName || '직원'}</strong> [${l.tag || '특이'}]: ${l.content || l.text || ''}
                </div>
              `).join('')}
            </div>
          ` : ''}
          <div style="font-size:11.5px; color:#334155; line-height:1.5;">
            ${b.dayLogs.map(l => `
              <div style="margin-top:4px; padding-top:4px; border-top:1px solid #f1f5f9; word-break:break-word;">
                • <strong>${l.authorName || '직원'}</strong> <span style="color:#64748b; font-size:10.5px;">(${l.tag || '일지'})</span>: ${l.content || l.text || ''}
              </div>
            `).join('')}
          </div>
        </div>
      `);
    }

    // 카드 3: 약품 위치 관리 (일반약 또는 전문약 변동이 있을 때만)
    if ((b.dayOtcMeds.length + b.dayRxMeds.length) > 0) {
      activeCards.push(`
        <div style="background:#ffffff; border:1.5px solid #e2e8f0; border-radius:14px; padding:14px; box-shadow:0 2px 6px rgba(0,0,0,0.02);">
          <div style="margin-bottom:8px;">
            <strong style="font-size:13px; color:#0f172a;"><i class="fas fa-map-marker-alt text-teal-600 me-1"></i> 약품 위치 변동 (${b.dayOtcMeds.length + b.dayRxMeds.length}건)</strong>
          </div>
          <div style="font-size:12px; color:#334155; line-height:1.6;">
            ${b.dayOtcMeds.length > 0 ? `<div>▪️ 일반약: <strong class="text-success">${b.dayOtcMeds.length}건</strong> (${b.dayOtcMeds.map(m => m.name).join(', ')})</div>` : ''}
            ${b.dayRxMeds.length > 0 ? `<div style="margin-top:3px;">▪️ 전문약: <strong class="text-primary">${b.dayRxMeds.length}건</strong> (${b.dayRxMeds.map(m => m.name).join(', ')})</div>` : ''}
          </div>
        </div>
      `);
    }

    // 카드 4: 소모품 관리 (당일 신청이 있을 때만)
    if (b.daySupplies.length > 0) {
      activeCards.push(`
        <div style="background:#ffffff; border:1.5px solid #e2e8f0; border-radius:14px; padding:14px; box-shadow:0 2px 6px rgba(0,0,0,0.02);">
          <div style="margin-bottom:8px;">
            <strong style="font-size:13px; color:#0f172a;"><i class="fas fa-boxes text-amber-500 me-1"></i> 소모품 신청 (${b.daySupplies.length}건)</strong>
          </div>
          <div style="font-size:12px; color:#334155; line-height:1.6; word-break:break-word;">
            <div>▪️ 신청 품목: ${b.daySupplies.map(s => `<strong>${s.itemName}</strong>(${s.quantity || 1}개)`).join(', ')}</div>
            <div style="margin-top:3px; font-size:11px; color:#64748b;">(현재 전체 대기: 총 ${b.pendingSuppliesCount}건)</div>
          </div>
        </div>
      `);
    }

    // 카드 5: 유효기간 & 반품 대장 (당일 등록 또는 인계 변동이 있을 때만)
    if (b.dayReturns.length > 0) {
      activeCards.push(`
        <div style="background:#ffffff; border:1.5px solid #e2e8f0; border-radius:14px; padding:14px; box-shadow:0 2px 6px rgba(0,0,0,0.02);">
          <div style="margin-bottom:8px;">
            <strong style="font-size:13px; color:#0f172a;"><i class="fas fa-undo-alt text-rose-500 me-1"></i> 유효기간 반품/폐기 (${b.dayReturns.length}건)</strong>
          </div>
          <div style="font-size:12px; color:#334155; line-height:1.6; word-break:break-word;">
            <div>▪️ 반품 품목: ${b.dayReturns.map(r => `<strong>${r.drugName || r.name || r.medName || '약품'}</strong> (${r.qty || 1}${r.unit || '개'}${r.vendor ? ` · ${r.vendor}` : ''})`).join(', ')}</div>
          </div>
        </div>
      `);
    }

    // 카드 6: 공지사항 & 업무 SOP (당일 신규 공지 또는 결재대기 있을 때만)
    if (b.dayNotices.length > 0 || b.pendingLeavesCount > 0) {
      activeCards.push(`
        <div style="background:#ffffff; border:1.5px solid #e2e8f0; border-radius:14px; padding:14px; box-shadow:0 2px 6px rgba(0,0,0,0.02);">
          <div style="margin-bottom:8px;">
            <strong style="font-size:13px; color:#0f172a;"><i class="fas fa-bullhorn text-indigo-500 me-1"></i> 공지 및 알림</strong>
          </div>
          <div style="font-size:12px; color:#334155; line-height:1.6;">
            ${b.dayNotices.length > 0 ? b.dayNotices.map(n => `<div>📌 <strong>${n.title}</strong></div>`).join('') : ''}
            ${b.pendingLeavesCount > 0 ? `<div style="color:#dc2626; margin-top:3px;">• 결재 대기: <strong>${b.pendingLeavesCount}건</strong></div>` : ''}
          </div>
        </div>
      `);
    }

    // 카드 7: 환자 예약 주문 & 선결제 관리 (당일 접수 또는 현재 미수령/대기 건이 있을 때만)
    if (b.dayOrders.length > 0 || b.pendingOrders.length > 0 || b.arrivedOrders.length > 0) {
      activeCards.push(`
        <div onclick="App.switchModule('patient-orders', true)" style="background:#ffffff; border:1.5px solid #c7d2fe; border-radius:14px; padding:14px; box-shadow:0 2px 6px rgba(99,102,241,0.08); cursor:pointer; transition:transform 0.15s ease;">
          <div style="margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
            <strong style="font-size:13px; color:#3730a3;"><i class="fas fa-clipboard-check text-indigo-600 me-1"></i> 환자 예약 주문 (${b.dayOrders.length > 0 ? `오늘 +${b.dayOrders.length}건` : `진행중 ${b.pendingOrders.length + b.arrivedOrders.length}건`})</strong>
            <span style="font-size:11px; color:#4f46e5; font-weight:700;">대장 이동 ➔</span>
          </div>
          <div style="font-size:12px; color:#334155; line-height:1.6;">
            ${b.arrivedOrders.length > 0 ? `
              <div style="color:#15803d; font-weight:700; background:#f0fdf4; padding:4px 8px; border-radius:6px; margin-bottom:4px;">
                📦 <strong>약 입고 완료 (손님 수령/배송 대기):</strong> ${b.arrivedOrders.length}건
                <div style="font-size:11px; font-weight:normal; color:#166534; margin-top:2px;">
                  ${b.arrivedOrders.slice(0, 3).map(o => `• ${o.patientName || '환자'}(${o.itemSummary || o.medName || '품목'}${o.receiveMethod === 'PARCEL' ? ' · 택배' : ' · 방문'})`).join('<br>')}
                  ${b.arrivedOrders.length > 3 ? `<br>외 ${b.arrivedOrders.length - 3}건` : ''}
                </div>
              </div>
            ` : ''}
            ${b.pendingOrders.length > 0 ? `
              <div style="color:#b45309; margin-top:3px;">
                ⏳ <strong>도매상 발주/입고 대기:</strong> ${b.pendingOrders.length}건 (${b.pendingOrders.slice(0, 3).map(o => o.patientName).join(', ')}${b.pendingOrders.length > 3 ? ' 외' : ''})
              </div>
            ` : ''}
            ${b.unpaidOrders.length > 0 ? `
              <div style="color:#dc2626; font-size:11px; margin-top:3px;">
                ⚠️ <strong>미결제/계좌입금 확인필요:</strong> ${b.unpaidOrders.length}건
              </div>
            ` : ''}
          </div>
        </div>
      `);
    }

    // 카드 8: 인근약국 교품 & 불용재고 대장 (당일 등록 또는 미정산 교품/불용재고가 있을 때)
    if (b.dayExchanges.length > 0 || b.pendingExchanges.length > 0 || b.dayDeadStocks.length > 0 || b.activeDeadStocks.length > 0) {
      activeCards.push(`
        <div onclick="App.switchModule('pharmacy-exchange', true)" style="background:#ffffff; border:1.5px solid #fed7aa; border-radius:14px; padding:14px; box-shadow:0 2px 6px rgba(249,115,22,0.08); cursor:pointer; transition:transform 0.15s ease;">
          <div style="margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
            <strong style="font-size:13px; color:#9a3412;"><i class="fas fa-handshake text-amber-600 me-1"></i> 교품 & 불용재고 (${(b.dayExchanges.length + b.dayDeadStocks.length) > 0 ? `오늘 +${b.dayExchanges.length + b.dayDeadStocks.length}건` : `관리중`})</strong>
            <span style="font-size:11px; color:#c2410c; font-weight:700;">대장 이동 ➔</span>
          </div>
          <div style="font-size:12px; color:#334155; line-height:1.6;">
            <!-- 🤝 교품 섹션 -->
            <div style="padding-bottom:6px; border-bottom:1px dashed #fed7aa;">
              <div style="font-weight:700; color:#b45309; margin-bottom:2px;">
                🤝 <strong>인근약국 교품 (미정산):</strong> <span class="${b.pendingExchanges.length > 0 ? 'text-danger font-black' : 'text-success font-black'}">${b.pendingExchanges.length}건</span>
                ${b.lendExchanges.length > 0 ? `<span class="badge bg-warning text-dark ms-1">빌려줌 ${b.lendExchanges.length}</span>` : ''}
                ${b.borrowExchanges.length > 0 ? `<span class="badge bg-info text-dark ms-1">빌려옴 ${b.borrowExchanges.length}</span>` : ''}
                ${b.settledExchangesToday && b.settledExchangesToday.length > 0 ? `<span class="badge bg-success ms-1">오늘 정산완료 ${b.settledExchangesToday.length}</span>` : ''}
              </div>
              ${b.pendingExchanges.length > 0 ? `
                <div style="font-size:11.5px; color:#475569; line-height:1.5;">
                  ${b.pendingExchanges.slice(0, 2).map(x => `• [${x.type === 'LEND' ? '대여' : '차용'}] ${x.partnerPharmacy || x.targetPharmacy || '인근약국'}: ${x.drugName || '약품'}(${x.quantity || x.qty || 1}${x.unit || '개'})`).join('<br>')}
                  ${b.pendingExchanges.length > 2 ? `<br>외 ${b.pendingExchanges.length - 2}건` : ''}
                </div>
              ` : '<div style="color:#16a34a; font-size:11px; font-weight:700;">✨ 미정산 교품 없음 (모두 정산 완료됨)</div>'}
            </div>

            <!-- 📦 불용재고 섹션 -->
            <div style="margin-top:6px;">
              <div style="font-weight:700; color:#475569; margin-bottom:2px;">
                📦 <strong>처방중단 불용재고:</strong> <span class="text-amber-700 font-black">${b.activeDeadStocks.length}품목</span>
                ${b.dayDeadStocks.length > 0 ? `<span class="badge bg-danger ms-1">오늘 등록 +${b.dayDeadStocks.length}</span>` : ''}
              </div>
              ${b.activeDeadStocks.length > 0 ? `
                <div style="font-size:11px; color:#64748b;">
                  • 손실 추정액: <strong class="text-danger font-bold">₩ ${Math.round(b.totalDeadStockLoss).toLocaleString()}</strong>원
                </div>
                <div style="font-size:11.5px; color:#475569; line-height:1.5; margin-top:2px;">
                  ${b.activeDeadStocks.slice(0, 2).map(d => `• ${d.drugName || '약품'}(${d.quantity || 0}개 · ${d.hospital || d.locationDetail || '보관'})`).join('<br>')}
                  ${b.activeDeadStocks.length > 2 ? `<br>외 ${b.activeDeadStocks.length - 2}품목` : ''}
                </div>
              ` : '<div style="color:#16a34a; font-size:11px;">✨ 등록된 불용재고 없음</div>'}
            </div>
          </div>
        </div>
      `);
    }

    let html = `
      <style>
        #daily-briefing-box {
          margin-bottom: 16px;
          border-radius: 16px;
          background: #ffffff;
          border: 1.5px solid #cbd5e1;
          box-shadow: 0 4px 14px rgba(15,23,42,0.05);
          overflow: hidden;
          transition: all 0.25s ease;
        }
        .briefing-bar-inner {
          padding: 12px 16px;
          background: #ffffff;
        }
        .briefing-top-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .briefing-title-group {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .briefing-app-icon {
          width: 32px;
          height: 32px;
          border-radius: 9px;
          background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
          color: #ffffff;
          display: flex;
          justify-content: center;
          align-items: center;
          font-size: 15px;
          box-shadow: 0 2px 6px rgba(37,99,235,0.25);
          flex-shrink: 0;
        }
        .briefing-title-text {
          font-size: 14px;
          font-weight: 800;
          color: #0f172a;
          letter-spacing: -0.3px;
        }
        .briefing-date-badge {
          background: #eff6ff;
          color: #2563eb;
          border: 1px solid #bfdbfe;
          font-size: 11px;
          padding: 2px 8px;
          border-radius: 10px;
          font-weight: 700;
          white-space: nowrap;
        }
        .briefing-actions-group {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .briefing-day-btn {
          font-size: 11px;
          padding: 4px 8px;
          font-weight: 700;
        }
        .briefing-toggle-btn {
          font-size: 11.5px;
          padding: 4px 10px;
          font-weight: 700;
          border-radius: 8px;
          border: 1px solid #cbd5e1;
          background: #f8fafc;
          color: #475569;
          cursor: pointer;
          white-space: nowrap;
          transition: background 0.15s ease;
        }
        .briefing-toggle-btn:hover {
          background: #f1f5f9;
        }
        /* 🌟 모바일 핸드폰에서 1줄로 산뜻하게 가로 스와이프되는 칩 리본 */
        .briefing-chips-scroll {
          display: flex;
          align-items: center;
          gap: 6px;
          overflow-x: auto;
          white-space: nowrap;
          -webkit-overflow-scrolling: touch;
          padding: 8px 1px 4px 1px;
          scrollbar-width: none;
        }
        .briefing-chips-scroll::-webkit-scrollbar {
          display: none;
        }
        .briefing-chip {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 9px;
          border-radius: 8px;
          font-size: 11.5px;
          font-weight: 700;
          flex-shrink: 0;
          user-select: none;
        }
        /* 🌟 전 직원 실시간 공유 배너 (글자 짤림 방지: word-break & 온전한 전체 줄바꿈) */
        .briefing-notable-banner {
          margin-top: 8px;
          border-radius: 10px;
          padding: 8px 12px;
          transition: all 0.15s ease;
        }
        .alert-notable {
          background: #fff1f2;
          border: 1.5px solid #fda4af;
          box-shadow: 0 1px 5px rgba(225,29,72,0.06);
        }
        .alert-normal-log {
          background: #f0fdf4;
          border: 1.2px solid #bbf7d0;
        }
        .alert-empty-log {
          background: #f8fafc;
          border: 1px dashed #cbd5e1;
        }
        .badge-notable-pulse {
          background: #e11d48;
          color: #ffffff;
          font-size: 10.5px;
          font-weight: 800;
          padding: 2px 7px;
          border-radius: 6px;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }
        .badge-normal-log {
          background: #16a34a;
          color: #ffffff;
          font-size: 10.5px;
          font-weight: 800;
          padding: 2px 7px;
          border-radius: 6px;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }
        .badge-empty-log {
          background: #64748b;
          color: #ffffff;
          font-size: 10.5px;
          font-weight: 700;
          padding: 2px 7px;
          border-radius: 6px;
          display: inline-flex;
          align-items: center;
          gap: 4px;
        }
        @media (max-width: 600px) {
          .briefing-bar-inner {
            padding: 10px 12px;
          }
          .briefing-title-text {
            font-size: 13.5px;
          }
          .briefing-top-row {
            gap: 6px;
          }
        }
      </style>

      <div id="daily-briefing-box">
        
        <!-- 1. 상단 브리핑 헤더 & 슬림 요약 바 -->
        <div class="briefing-bar-inner" style="border-bottom:${isExpanded ? '1.5px solid #e2e8f0' : 'none'};">
          
          <!-- 1단: 제목 / 날짜 / 제어 버튼 (모바일 반응형 일목요연 정돈) -->
          <div class="briefing-top-row">
            <div class="briefing-title-group" onclick="DailyBriefingWidget.toggleExpand()" style="cursor:pointer;">
              <div class="briefing-app-icon">
                <i class="fas fa-newspaper"></i>
              </div>
              <div>
                <div style="display:flex; align-items:center; gap:6px;">
                  <span class="briefing-title-text">신세계 3초 브리핑</span>
                  <span class="briefing-date-badge">
                    📅 ${dateLabel}
                  </span>
                </div>
              </div>
            </div>

            <!-- 우측 그제/어제/오늘 전환 및 자세히 보기 토글 -->
            <div class="briefing-actions-group">
              <div class="btn-group btn-group-sm" role="group">
                <button type="button" class="btn ${targetDayOffset === -2 ? 'btn-primary' : 'btn-outline-secondary'} briefing-day-btn" style="border-radius:6px 0 0 6px;" onclick="DailyBriefingWidget.setDayOffset(-2)">그제</button>
                <button type="button" class="btn ${targetDayOffset === -1 ? 'btn-primary' : 'btn-outline-secondary'} briefing-day-btn" onclick="DailyBriefingWidget.setDayOffset(-1)">어제</button>
                <button type="button" class="btn ${targetDayOffset === 0 ? 'btn-primary' : 'btn-outline-secondary'} briefing-day-btn" style="border-radius:0 6px 6px 0;" onclick="DailyBriefingWidget.setDayOffset(0)">오늘</button>
              </div>
              <button type="button" class="briefing-toggle-btn" onclick="DailyBriefingWidget.toggleExpand()">
                <i class="fas ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'} me-1"></i>${isExpanded ? '간략히' : '자세히'}
              </button>
            </div>
          </div>

          <!-- 2단: 🌟 7대 실무 핵심 지표 가로 스크롤 칩 리본 (핸드폰에서 1줄로 산뜻하고 매끄럽게 터치 스와이프) -->
          <div class="briefing-chips-scroll">
            <div class="briefing-chip" style="background:#ecfdf5; color:#065f46; border:1px solid #a7f3d0;">
              📅 근무 <strong style="color:#047857;">${b.onDutyStaff.length}명</strong>
            </div>

            ${b.onLeaveStaff.length > 0 ? `
              <div class="briefing-chip" style="background:#fffbeb; color:#92400e; border:1px solid #fde68a;">
                🏖️ 휴가 <strong style="color:#b45309;">${b.onLeaveStaff.length}명</strong>
              </div>
            ` : ''}

            <div class="briefing-chip" style="background:#eff6ff; color:#1e40af; border:1px solid #bfdbfe;">
              📝 일지 <strong style="color:#2563eb;">${b.dayLogs.length}건</strong>
              ${b.importantLogs.length > 0 ? `<span style="background:#dc2626; color:#fff; font-size:10px; padding:1px 5px; border-radius:10px; margin-left:2px;">특이 ${b.importantLogs.length}</span>` : ''}
            </div>

            <div class="briefing-chip" style="background:#fff7ed; color:#9a3412; border:1px solid #fed7aa;">
              📦 소모품 <strong style="color:#c2410c;">${b.daySupplies.length}건</strong>
            </div>

            <div class="briefing-chip" style="background:#f0fdf4; color:#166534; border:1px solid #bbf7d0;">
              💊 약품위치 <strong style="color:#15803d;">${b.dayOtcMeds.length + b.dayRxMeds.length}건</strong>
            </div>

            <!-- 📋 환자 예약 주문 브리핑 칩 -->
            ${(b.dayOrders.length > 0 || b.pendingOrders.length > 0 || b.arrivedOrders.length > 0) ? `
              <div class="briefing-chip" onclick="App.switchModule('patient-orders', true)" style="background:#eef2ff; color:#3730a3; border:1px solid #c7d2fe; cursor:pointer;">
                📋 예약주문 <strong style="color:#4338ca;">${b.dayOrders.length > 0 ? `+${b.dayOrders.length}` : (b.pendingOrders.length + b.arrivedOrders.length)}건</strong>
                ${b.arrivedOrders.length > 0 ? `<span style="background:#16a34a; color:#fff; font-size:10px; padding:1px 5px; border-radius:10px; margin-left:2px;">도착 ${b.arrivedOrders.length}</span>` : ''}
              </div>
            ` : ''}

            <!-- 🤝 인근약국 교품 & 불용재고 브리핑 칩 -->
            ${(b.dayExchanges.length > 0 || b.pendingExchanges.length > 0 || b.dayDeadStocks.length > 0 || b.activeDeadStocks.length > 0) ? `
              <div class="briefing-chip" onclick="App.switchModule('pharmacy-exchange', true)" style="background:#fff7ed; color:#9a3412; border:1px solid #ffedd5; cursor:pointer;">
                ${b.pendingExchanges.length > 0 ? `
                  🤝 교품 <strong style="color:#ea580c;">${b.pendingExchanges.length}건</strong>
                  ${b.lendExchanges.length > 0 ? `<span style="background:#eab308; color:#000; font-size:10px; padding:1px 4px; border-radius:10px; margin-left:2px;">줌${b.lendExchanges.length}</span>` : ''}
                  ${b.borrowExchanges.length > 0 ? `<span style="background:#06b6d4; color:#fff; font-size:10px; padding:1px 4px; border-radius:10px; margin-left:2px;">옴${b.borrowExchanges.length}</span>` : ''}
                ` : `
                  🤝 교품 <strong style="color:#16a34a;">정산완료</strong>
                `}
                ${b.activeDeadStocks.length > 0 ? `<span style="background:#78716c; color:#fff; font-size:10px; padding:1px 4px; border-radius:10px; margin-left:2px;">불용${b.activeDeadStocks.length}</span>` : ''}
              </div>
            ` : ''}

            ${b.criticalReturns.length > 0 ? `
              <div class="briefing-chip" onclick="App.switchModule('expiry-returns', true)" style="background:#fee2e2; color:#b91c1c; border:1.5px solid #ef4444; cursor:pointer;">
                🚨 초긴급반품 <strong style="color:#dc2626;">${b.criticalReturns.length}건</strong>
              </div>
            ` : `
              <div class="briefing-chip" onclick="App.switchModule('expiry-returns', true)" style="background:#fef2f2; color:#991b1b; border:1px solid #fecaca; cursor:pointer;">
                ⚠️ 반품 <strong style="color:#dc2626;">${b.dayReturns.length}건</strong>
              </div>
            `}

            ${b.dayNotices.length > 0 ? `
              <div class="briefing-chip" style="background:#faf5ff; color:#6b21a8; border:1px solid #e9d5ff;">
                📢 공지 <strong style="color:#7c3aed;">${b.dayNotices.length}건</strong>
              </div>
            ` : ''}

            ${b.pendingLeavesCount > 0 ? `
              <div class="briefing-chip" style="background:#fff1f2; color:#9f1239; border:1px solid #fecdd3;">
                ⏳ 결재대기 <strong style="color:#be123c;">${b.pendingLeavesCount}건</strong>
              </div>
            ` : ''}
          </div>

          <!-- 🚨 유효기간 3단계 초긴급 조기경보 알림 배너 (전 직원 즉각 인지) -->
          ${b.criticalReturns.length > 0 ? `
            <div onclick="App.switchModule('expiry-returns', true)" style="margin-top:10px; padding:10px 14px; background:linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%); border-radius:10px; color:#ffffff; cursor:pointer; display:flex; align-items:center; justify-content:space-between; gap:10px; box-shadow:0 2px 8px rgba(185,28,28,0.25);">
              <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:16px;">🚨</span>
                <div>
                  <div style="font-size:12.5px; font-weight:800; letter-spacing:-0.2px;">
                    유효기간 D-30 초긴급 반품 대상 약품 ${b.criticalReturns.length}건 발생!
                  </div>
                  <div style="font-size:11px; opacity:0.85; margin-top:2px;">
                    ${b.criticalReturns.slice(0, 3).map(c => `${c.drugName}(${c.vendor || '도매상'})`).join(', ')}${b.criticalReturns.length > 3 ? ' 외' : ''} ➔ 지금 바로 확인 및 인계하기
                  </div>
                </div>
              </div>
              <button type="button" class="btn btn-sm btn-light font-bold" style="font-size:11px; padding:3px 8px; border-radius:6px; flex-shrink:0;">
                반품대장 ➔
              </button>
            </div>
          ` : ''}

          <!-- 📦 환자 예약약 입고완료(수령/발송 대기) 알림 배너 (전달 누락 0건 방어) -->
          ${b.arrivedOrders.length > 0 ? `
            <div onclick="App.switchModule('patient-orders', true)" style="margin-top:10px; padding:10px 14px; background:linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); border-radius:10px; color:#ffffff; cursor:pointer; display:flex; align-items:center; justify-content:space-between; gap:10px; box-shadow:0 2px 8px rgba(37,99,235,0.25);">
              <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:16px;">📦</span>
                <div>
                  <div style="font-size:12.5px; font-weight:800; letter-spacing:-0.2px;">
                    약 입고 완료! 손님 수령/배송 대기 ${b.arrivedOrders.length}건
                  </div>
                  <div style="font-size:11px; opacity:0.9; margin-top:2px;">
                    ${b.arrivedOrders.slice(0, 2).map(o => `${o.patientName} 님 (${o.itemSummary || o.medName || '품목'})`).join(', ')}${b.arrivedOrders.length > 2 ? ` 외 ${b.arrivedOrders.length - 2}건` : ''} ➔ 지금 바로 확인 및 약 전달하기
                  </div>
                </div>
              </div>
              <button type="button" class="btn btn-sm btn-light font-bold" style="font-size:11px; padding:3px 8px; border-radius:6px; flex-shrink:0; color:#1e40af;">
                예약대장 ➔
              </button>
            </div>
          ` : ''}

          <!-- 3단: 🌟 업무일지 특이사항 & 인수인계 전 직원 실시간 공유 배너 (글자 짤림 완전 제거 & 전문 표시) -->
          ${b.importantLogs.length > 0 ? `
            <div class="briefing-notable-banner alert-notable">
              <div style="display:flex; align-items:center; gap:6px; margin-bottom:5px;">
                <span class="badge-notable-pulse">
                  <i class="fas fa-exclamation-triangle"></i> 특이사항 공유 (${b.importantLogs.length}건)
                </span>
              </div>
              <div style="font-size:12px; color:#9f1239; line-height:1.5; word-break:break-word;">
                ${b.importantLogs.map(l => `
                  <div style="margin-top:3px; padding-top:3px; border-top:1px dashed #fecdd3;">
                    • <strong>[${l.authorName || '직원'} · ${l.tag || '특이'}]</strong> ${l.content || l.text || ''}
                  </div>
                `).join('')}
              </div>
            </div>
          ` : (b.dayLogs.length > 0 ? `
            <div class="briefing-notable-banner alert-normal-log">
              <div style="display:flex; align-items:center; gap:6px; margin-bottom:5px;">
                <span class="badge-normal-log">
                  <i class="fas fa-clipboard-check"></i> 인수인계 공유 (${b.dayLogs.length}건)
                </span>
              </div>
              <div style="font-size:12px; color:#166534; line-height:1.5; word-break:break-word;">
                ${b.dayLogs.map(l => `
                  <div style="margin-top:3px; padding-top:3px; border-top:1px dashed #bbf7d0;">
                    • <strong>[${l.authorName || '직원'} · ${l.tag || '일지'}]</strong> ${l.content || l.text || ''}
                  </div>
                `).join('')}
              </div>
            </div>
          ` : `
            <div class="briefing-notable-banner alert-empty-log">
              <div style="display:flex; align-items:center; gap:6px;">
                <span class="badge-empty-log">
                  <i class="fas fa-info-circle"></i> 업무 인계
                </span>
                <span style="font-size:11.5px; color:#64748b; font-weight:600;">
                  오늘 등록된 특이사항 및 인수인계 메모가 없습니다.
                </span>
              </div>
            </div>
          `)}

        </div>

        <!-- 2. 펼쳤을 때: 변동사항 있는 모듈 카드만 선별 노출 (변동 없는 모듈은 자동 숨김 처리) -->
        ${isExpanded ? `
          <div style="padding:14px 16px; background:#f8fafc; border-top:1px solid #e2e8f0;">
            ${activeCards.length > 0 ? `
              <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:12px;">
                ${activeCards.join('')}
              </div>
            ` : `
              <div style="text-align:center; padding:20px; color:#64748b; background:#ffffff; border-radius:12px; border:1.5px dashed #cbd5e1; font-size:12.5px; font-weight:700;">
                ✨ 선택하신 날짜(${dateLabel})에는 등록된 변동사항이 없습니다.
              </div>
            `}
          </div>
        ` : ''}

      </div>
    `;

    container.innerHTML = html;
    } catch (err) {
      console.error("DailyBriefingWidget.renderWidget caught error:", err);
    }
  }

  function toggleExpand() {
    isExpanded = !isExpanded;
    renderWidget();
  }

  function setDayOffset(offset) {
    targetDayOffset = offset;
    renderWidget();
  }

  return {
    renderWidget,
    toggleExpand,
    setDayOffset
  };
})();
