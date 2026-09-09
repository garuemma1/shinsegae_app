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
    const tag = offset === 0 ? '오늘' : (offset === -1 ? '어제' : '내일');
    return `${month}월 ${date}일(${dayName}) · ${tag}`;
  }

  function aggregateBriefingData(targetDateStr) {
    const data = window.SheetsSync.getData ? window.SheetsSync.getData() : {};
    const employees = data.employees || [];
    const scheduleRecords = data.schedule || [];
    const worklogs = data.worklogs || [];
    const supplies = data.supplies || [];
    const expiryReturns = data.expiryReturns || [];
    const notices = data.notices || [];
    const leaveRequests = data.leaveRequests || [];
    const medicineLocations = data.medicineLocations || [];
    const rxMedicineLocations = data.rxMedicineLocations || [];

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
      const wDate = w.date || (w.createdAt ? String(w.createdAt).split(' ')[0] : '');
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
      const sDate = s.requestDate || (s.createdAt ? String(s.createdAt).split(' ')[0] : '');
      return sDate === targetDateStr;
    });
    const pendingSuppliesCount = supplies.filter(s => s.status === 'PENDING').length;

    // 4. 일반의약품 위치 관리 (해당 날짜 신규 등록/수정)
    const dayOtcMeds = medicineLocations.filter(m => {
      const mDate = m.updatedAt ? String(m.updatedAt).split(' ')[0].replace(/\./g, '-') : (m.date || '');
      return mDate === targetDateStr;
    });

    // 5. 전문의약품 위치 관리 (해당 날짜 신규 등록/수정)
    const dayRxMeds = rxMedicineLocations.filter(m => {
      const mDate = m.updatedAt ? String(m.updatedAt).split(' ')[0].replace(/\./g, '-') : (m.date || '');
      return mDate === targetDateStr;
    });

    // 6. 유효기간 & 반품 대장
    const dayReturns = expiryReturns.filter(e => {
      const eDate = e.date || (e.registeredAt ? String(e.registeredAt).split(' ')[0] : (e.createdAt ? String(e.createdAt).split(' ')[0] : ''));
      return eDate === targetDateStr;
    });

    // 7. 공지사항 & 업무 SOP
    const dayNotices = notices.filter(n => {
      const nDate = n.date || (n.createdAt ? String(n.createdAt).split(' ')[0] : '');
      return nDate === targetDateStr;
    });

    // 결재 대기 건수 (연차/휴가 미결재)
    const pendingLeavesCount = leaveRequests.filter(l => l.status === 'PENDING').length;

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
      pendingLeavesCount
    };
  }

  function renderWidget() {
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

    // 카드 5: 유효기간 & 반품 대장 (당일 등록이 있을 때만)
    if (b.dayReturns.length > 0) {
      activeCards.push(`
        <div style="background:#ffffff; border:1.5px solid #e2e8f0; border-radius:14px; padding:14px; box-shadow:0 2px 6px rgba(0,0,0,0.02);">
          <div style="margin-bottom:8px;">
            <strong style="font-size:13px; color:#0f172a;"><i class="fas fa-undo-alt text-rose-500 me-1"></i> 유효기간 반품/폐기 (${b.dayReturns.length}건)</strong>
          </div>
          <div style="font-size:12px; color:#334155; line-height:1.6; word-break:break-word;">
            <div>▪️ 반품 품목: ${b.dayReturns.map(r => `<strong>${r.name || r.medName || '약품'}</strong>`).join(', ')}</div>
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

            <!-- 우측 어제/오늘/내일 전환 및 자세히 보기 토글 -->
            <div class="briefing-actions-group">
              <div class="btn-group btn-group-sm" role="group">
                <button type="button" class="btn ${targetDayOffset === -1 ? 'btn-primary' : 'btn-outline-secondary'} briefing-day-btn" style="border-radius:6px 0 0 6px;" onclick="DailyBriefingWidget.setDayOffset(-1)">어제</button>
                <button type="button" class="btn ${targetDayOffset === 0 ? 'btn-primary' : 'btn-outline-secondary'} briefing-day-btn" onclick="DailyBriefingWidget.setDayOffset(0)">오늘</button>
                <button type="button" class="btn ${targetDayOffset === 1 ? 'btn-primary' : 'btn-outline-secondary'} briefing-day-btn" style="border-radius:0 6px 6px 0;" onclick="DailyBriefingWidget.setDayOffset(1)">내일</button>
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

            <div class="briefing-chip" style="background:#fef2f2; color:#991b1b; border:1px solid #fecaca;">
              ⚠️ 반품 <strong style="color:#dc2626;">${b.dayReturns.length}건</strong>
            </div>

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
