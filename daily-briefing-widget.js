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

    // 1. 근무 & 출근 인원
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

    // 오늘 휴가자 (leaveRequests 승인 또는 schedule 휴가)
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

    // 2. 업무일지 (해당 날짜에 등록된 일지)
    const dayLogs = worklogs.filter(w => {
      const wDate = w.date || (w.createdAt ? String(w.createdAt).split(' ')[0] : '');
      return wDate === targetDateStr;
    });
    const importantLogs = dayLogs.filter(w => (w.tag && (w.tag.includes('중요') || w.tag.includes('긴급'))) || (w.content && w.content.includes('긴급')));

    // 3. 소모품/비품 신청 (해당 날짜 등록)
    const daySupplies = supplies.filter(s => {
      const sDate = s.requestDate || (s.createdAt ? String(s.createdAt).split(' ')[0] : '');
      return sDate === targetDateStr;
    });
    const pendingSuppliesCount = supplies.filter(s => s.status === 'PENDING').length;

    // 4. 의약품 반품/폐기
    const dayReturns = expiryReturns.filter(e => {
      const eDate = e.date || (e.registeredAt ? String(e.registeredAt).split(' ')[0] : (e.createdAt ? String(e.createdAt).split(' ')[0] : ''));
      return eDate === targetDateStr;
    });

    // 5. 신규 공지사항
    const dayNotices = notices.filter(n => {
      const nDate = n.date || (n.createdAt ? String(n.createdAt).split(' ')[0] : '');
      return nDate === targetDateStr;
    });

    // 6. 결재 대기 건수 (휴가 미결재 + 비품 미주문)
    const pendingLeavesCount = leaveRequests.filter(l => l.status === 'PENDING').length;

    return {
      targetDateStr,
      onDutyStaff,
      onLeaveStaff,
      dayLogs,
      importantLogs,
      daySupplies,
      pendingSuppliesCount,
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

    let html = `
      <div id="daily-briefing-box" style="margin-bottom:18px; border-radius:18px; background:linear-gradient(135deg, #ffffff 0%, #f8fafc 100%); border:1.8px solid #cbd5e1; box-shadow:0 6px 18px rgba(15,23,42,0.06); overflow:hidden; transition:all 0.25s ease;">
        
        <!-- 1. 상단 브리핑 헤더 & 슬림 요약 바 -->
        <div style="padding:12px 18px; background:#ffffff; border-bottom:${isExpanded ? '1.5px solid #e2e8f0' : 'none'}; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; cursor:pointer;" onclick="DailyBriefingWidget.toggleExpand()">
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            <div style="width:34px; height:34px; border-radius:10px; background:linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color:#ffffff; display:flex; justify-content:center; align-items:center; font-size:16px; box-shadow:0 3px 8px rgba(37,99,235,0.3);">
              <i class="fas fa-newspaper"></i>
            </div>
            <div>
              <div style="display:flex; align-items:center; gap:6px;">
                <strong style="font-size:14.5px; color:#0f172a; font-weight:800;">신세계 데일리 3초 브리핑</strong>
                <span class="badge" style="background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe; font-size:11px; padding:2px 8px; border-radius:12px; font-weight:700;">
                  📅 ${dateLabel}
                </span>
              </div>
              <!-- 슬림 상태일 때 핵심 지표 1줄 요약 -->
              <div style="font-size:12px; color:#475569; margin-top:2px; font-weight:600;">
                <span style="color:#047857;">💊 근무 <strong>${b.onDutyStaff.length}명</strong></span>
                ${b.onLeaveStaff.length > 0 ? `<span style="color:#d97706; margin-left:6px;">🏖️ 휴가 <strong>${b.onLeaveStaff.length}명</strong></span>` : ''}
                <span style="color:#2563eb; margin-left:6px;">📋 일지 <strong>${b.dayLogs.length}건</strong></span>
                <span style="color:#b45309; margin-left:6px;">📦 소모품 <strong>${b.daySupplies.length}건</strong></span>
                ${b.pendingLeavesCount > 0 ? `<span class="badge bg-danger ms-2" style="font-size:10px; padding:2px 6px;">결재대기 ${b.pendingLeavesCount}건</span>` : ''}
              </div>
            </div>
          </div>

          <!-- 우측 조작 버튼 -->
          <div style="display:flex; align-items:center; gap:6px;" onclick="event.stopPropagation()">
            <div class="btn-group btn-group-sm" role="group">
              <button type="button" class="btn ${targetDayOffset === -1 ? 'btn-primary' : 'btn-outline-secondary'}" style="font-size:11px; padding:4px 9px; font-weight:700; border-radius:8px 0 0 8px;" onclick="DailyBriefingWidget.setDayOffset(-1)">어제</button>
              <button type="button" class="btn ${targetDayOffset === 0 ? 'btn-primary' : 'btn-outline-secondary'}" style="font-size:11px; padding:4px 9px; font-weight:700;" onclick="DailyBriefingWidget.setDayOffset(0)">오늘</button>
              <button type="button" class="btn ${targetDayOffset === 1 ? 'btn-primary' : 'btn-outline-secondary'}" style="font-size:11px; padding:4px 9px; font-weight:700; border-radius:0 8px 8px 0;" onclick="DailyBriefingWidget.setDayOffset(1)">내일</button>
            </div>
            <button type="button" class="btn btn-sm btn-light font-bold" style="border-radius:10px; border:1px solid #cbd5e1; padding:4px 10px; font-size:12px; color:#475569;" onclick="DailyBriefingWidget.toggleExpand()">
              <i class="fas ${isExpanded ? 'fa-chevron-up' : 'fa-chevron-down'} me-1"></i> ${isExpanded ? '간략히' : '자세히'}
            </button>
          </div>
        </div>

        <!-- 2. 펼쳤을 때 나타나는 4대 핵심 카드 뉴스 영역 -->
        ${isExpanded ? `
          <div style="padding:16px 18px; background:#f8fafc;">
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:12px;">
              
              <!-- 카드 1: 근무 & 휴가 현황 -->
              <div style="background:#ffffff; border:1.5px solid #e2e8f0; border-radius:14px; padding:14px; box-shadow:0 2px 6px rgba(0,0,0,0.02); display:flex; flex-direction:column; justify-content:space-between;">
                <div>
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <strong style="font-size:13px; color:#0f172a;"><i class="fas fa-user-md text-emerald-600 me-1"></i> 1. 근무 & 휴가 현황</strong>
                    <button class="btn btn-xs btn-outline-success font-bold" style="font-size:10.5px; padding:2px 6px; border-radius:6px;" onclick="App.navigateTo('schedule')">근무표 바로가기</button>
                  </div>
                  <div style="font-size:12px; color:#334155; line-height:1.6;">
                    <div>▪️ <strong>약사 출근(${pharmacists.length}명):</strong> ${pharmacists.length > 0 ? pharmacists.map(p => `<span class="badge bg-light text-dark border ms-1">${p.name}</span>`).join('') : '<span class="text-muted">배정 없음</span>'}</div>
                    <div style="margin-top:4px;">▪️ <strong>직원 출근(${generalStaff.length}명):</strong> ${generalStaff.length > 0 ? generalStaff.map(g => `<span class="badge bg-light text-dark border ms-1">${g.name}</span>`).join('') : '<span class="text-muted">배정 없음</span>'}</div>
                    ${b.onLeaveStaff.length > 0 ? `<div style="margin-top:5px; color:#b45309; background:#fffbeb; padding:4px 8px; border-radius:6px; font-weight:700;">🏖️ 휴가자: ${b.onLeaveStaff.map(l => `${l.name}(${l.type})`).join(', ')}</div>` : '<div style="margin-top:4px; font-size:11.5px; color:#64748b;">🏖️ 휴가자: 없음</div>'}
                  </div>
                </div>
              </div>

              <!-- 카드 2: 인수인계 & 특이사항 -->
              <div style="background:#ffffff; border:1.5px solid #e2e8f0; border-radius:14px; padding:14px; box-shadow:0 2px 6px rgba(0,0,0,0.02); display:flex; flex-direction:column; justify-content:space-between;">
                <div>
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <strong style="font-size:13px; color:#0f172a;"><i class="fas fa-clipboard-list text-primary me-1"></i> 2. 인수인계 & 업무일지</strong>
                    <button class="btn btn-xs btn-outline-primary font-bold" style="font-size:10.5px; padding:2px 6px; border-radius:6px;" onclick="App.navigateTo('worklog')">업무일지</button>
                  </div>
                  <div style="font-size:12px; color:#334155; line-height:1.5;">
                    <div>▪️ 당일 등록 일지: <strong>${b.dayLogs.length}건</strong> ${b.importantLogs.length > 0 ? `<span class="badge bg-danger ms-1">중요 ${b.importantLogs.length}건</span>` : ''}</div>
                    <div style="margin-top:5px; max-height:65px; overflow-y:auto; background:#f8fafc; border:1px solid #e2e8f0; padding:6px 8px; border-radius:8px; font-size:11.5px;">
                      ${b.dayLogs.length > 0 ? b.dayLogs.slice(0, 3).map(l => `<div>• <strong>${l.authorName || '직원'}</strong>: ${(l.content || '').slice(0, 22)}${(l.content || '').length > 22 ? '...' : ''}</div>`).join('') : '<span class="text-muted">당일 등록된 일지가 없습니다.</span>'}
                    </div>
                  </div>
                </div>
              </div>

              <!-- 카드 3: 소모품 & 의약품 반품 -->
              <div style="background:#ffffff; border:1.5px solid #e2e8f0; border-radius:14px; padding:14px; box-shadow:0 2px 6px rgba(0,0,0,0.02); display:flex; flex-direction:column; justify-content:space-between;">
                <div>
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <strong style="font-size:13px; color:#0f172a;"><i class="fas fa-boxes text-amber-500 me-1"></i> 3. 소모품 & 반품 동향</strong>
                    <button class="btn btn-xs btn-outline-secondary font-bold" style="font-size:10.5px; padding:2px 6px; border-radius:6px;" onclick="App.navigateTo('supplies')">소모품</button>
                  </div>
                  <div style="font-size:12px; color:#334155; line-height:1.6;">
                    <div>▪️ 당일 소모품 신청: <strong>${b.daySupplies.length}건</strong> (전체 대기 ${b.pendingSuppliesCount}건)</div>
                    <div style="margin-top:2px;">▪️ 유효기간 반품/폐기: <strong>${b.dayReturns.length}건</strong></div>
                    ${b.daySupplies.length > 0 ? `<div style="font-size:11px; color:#0284c7; margin-top:3px; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">신청: ${b.daySupplies.map(s => s.itemName).join(', ')}</div>` : ''}
                  </div>
                </div>
              </div>

              <!-- 카드 4: 공지 & 결재 알림 -->
              <div style="background:#ffffff; border:1.5px solid #e2e8f0; border-radius:14px; padding:14px; box-shadow:0 2px 6px rgba(0,0,0,0.02); display:flex; flex-direction:column; justify-content:space-between;">
                <div>
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <strong style="font-size:13px; color:#0f172a;"><i class="fas fa-bell text-rose-500 me-1"></i> 4. 공지 & 결재 알림</strong>
                    <button class="btn btn-xs btn-outline-danger font-bold" style="font-size:10.5px; padding:2px 6px; border-radius:6px;" onclick="App.navigateTo('annual-leave')">결재 확인</button>
                  </div>
                  <div style="font-size:12px; color:#334155; line-height:1.6;">
                    <div>▪️ 당일 신규 공지: <strong>${b.dayNotices.length}건</strong></div>
                    <div style="margin-top:2px;">
                      ▪️ 결재 대기 건수: <strong class="${b.pendingLeavesCount > 0 ? 'text-danger' : 'text-success'}">${b.pendingLeavesCount}건</strong>
                      ${b.pendingLeavesCount > 0 ? `<span class="badge bg-danger ms-1" style="font-size:10px;">약국장 확인 필요</span>` : '<span class="text-success ms-1">모두 처리됨</span>'}
                    </div>
                  </div>
                </div>
              </div>

            </div>
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
