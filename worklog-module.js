/**
 * 8. 약국 업무일지 & 교대 인수인계 모듈 (카톡 대체형 완결판)
 * 기능: 칸반형 업무 현황판, 이미지 자동 압축 첨부, 완료 시 달력 히스토리 보관, 인수인계 피드 및 V체크 추가
 */
window.WorklogModule = (function () {

  let currentYear = new Date().getFullYear();
  let currentMonth = new Date().getMonth() + 1;
  let showCalendar = true;
  
  // 구글 앱스 스크립트 웹 앱 URL (★ 1단계에서 배포한 URL로 반드시 변경해주세요!)
  const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbyVsOK5a0PVtW1-h8SlSZ1PGa4J-xx6T6i-tKAICePoP7D3aZ52coIFFYzRvRR0G8IVEw/exec'; 

  function render(containerId) {
    const container = document.getElementById(containerId || 'module-content');
    if (!container) return;

    const currUser = window.SheetsSync.getCurrentUser(); // 현재 로그인한 사용자 정보 가져오기
    const logs = window.SheetsSync.getWorklogs() || [];

    function getLogMs(log) {
      if (!log) return 0;
      // 1. id에 고유 타임스탬프가 있으면 id 기반 초정밀 정렬
      if (log.id && typeof log.id === 'string' && log.id.startsWith('task_')) {
        const idNum = parseInt(log.id.replace('task_', ''), 10);
        if (!isNaN(idNum) && idNum > 1000000000000) return idNum;
      }
      const str = log.createdAt || log.date || '';
      if (!str) return 0;
      const s = String(str).trim().replace(/-/g, '/');
      const ms = new Date(s).getTime();
      return isNaN(ms) ? (new Date(str).getTime() || 0) : ms;
    }

    function formatLogDateTime(task) {
      if (!task) return '';
      if (task.createdAt && task.createdAt.length >= 16) {
        return task.createdAt.substring(5, 16); // '08-18 11:54'
      }
      if (task.createdAt && task.createdAt.length >= 5) {
        return task.createdAt.substring(5);
      }
      if (task.id && typeof task.id === 'string' && task.id.startsWith('task_')) {
        const ts = parseInt(task.id.replace('task_', ''), 10);
        if (!isNaN(ts) && ts > 1000000000000) {
          const d = new Date(ts);
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          const h = String(d.getHours()).padStart(2, '0');
          const min = String(d.getMinutes()).padStart(2, '0');
          return `${m}-${day} ${h}:${min}`;
        }
      }
      return (task.date || '').substring(5);
    }

    // 1. 진행 중인 업무 (PENDING 상태) - 가장 최근 입력한 글이 무조건 최상단(1등)에 오도록 완벽 정렬!
    const pendingTasks = logs
      .filter(l => l.status === 'PENDING' || !l.status)
      .sort((a, b) => getLogMs(b) - getLogMs(a));
    
    // 2. 당월 달력용 데이터 (완료된 것 + 당일 등록된 것 모두 포함)
    const monthPrefix = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
    const monthLogs = logs.filter(l => (l.date || '').startsWith(monthPrefix));

    // 3. 최근 15일 업무 피드 데이터 (가장 최근 글이 위로 오도록 정렬 - 아이폰/갤럭시 100% 호환)
    const todayMs = new Date().getTime();
    const fifteenDaysMs = 20 * 24 * 60 * 60 * 1000;
    const sortedLogs = [...logs]
      .filter(log => {
        const logDateMs = getLogMs(log);
        if (logDateMs === 0) return true; // 날짜 상관없이 데이터 유실 방지
        return Math.abs(todayMs - logDateMs) <= fifteenDaysMs;
      })
      .sort((a, b) => getLogMs(b) - getLogMs(a));

    let html = `
      <div class="module-header d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
        <div>
          <h2 style="font-size:24px; font-weight:800; color:#0f172a; margin-bottom:4px; letter-spacing:-0.5px;">
            📝 실시간 약국 업무 & 인수인계 보드
          </h2>
          <p class="subtitle" style="color:#64748b; font-size:14px; margin:0;">
            품절약, 주문 요청, 특이사항을 카톡 대신 올리고 완료 시 체크해 주세요.
          </p>
        </div>
        
        <div class="d-flex align-items-center gap-3 flex-wrap mt-2">
          
          <!-- 🔍 통합 검색창 -->
          <div style="display:flex; align-items:center; background:#ffffff; border:2px solid #e2e8f0; border-radius:12px; padding:6px; width:310px; box-shadow:0 4px 12px rgba(0,0,0,0.06); transition:all 0.2s;" onfocusin="this.style.borderColor='#3b82f6'; this.style.boxShadow='0 0 0 4px rgba(59,130,246,0.15)';" onfocusout="this.style.borderColor='#e2e8f0'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.06)';">
            <input type="text" id="wl-search-input" placeholder="🔍 약 이름, 품절약 검색..." onkeypress="if(event.key==='Enter') WorklogModule.executeSearch()" style="border:none; background:#f1f5f9; border-radius:8px; outline:none; padding:10px 14px; width:100%; font-size:14.5px; color:#0f172a; font-weight:700; transition:background 0.2s;" onfocus="this.style.background='#ffffff'" onblur="this.style.background='#f1f5f9'">
            <button type="button" onclick="WorklogModule.executeSearch()" style="background:#2563eb; border:none; border-radius:8px; color:#ffffff; width:40px; height:40px; flex-shrink:0; display:flex; justify-content:center; align-items:center; cursor:pointer; margin-left:6px; box-shadow:0 2px 4px rgba(37,99,235,0.2); transition:transform 0.2s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
              <i class="fas fa-search"></i>
            </button>
          </div>

          <!-- 📝 새 업무 등록 버튼 -->
          <button type="button" onclick="WorklogModule.showCreateModal()" style="display:flex; align-items:center; gap:8px; background:linear-gradient(135deg, #059669 0%, #047857 100%); color:#ffffff; border:none; border-radius:12px; padding:10px 20px; font-size:15px; font-weight:800; box-shadow:0 4px 12px rgba(5, 150, 105, 0.25); cursor:pointer; transition:transform 0.2s;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
            <i class="fas fa-plus-circle" style="font-size:16px;"></i> 새 업무 등록
          </button>
        </div>
      </div>

      <!-- 상단: 진행 중인 실시간 업무 보드 (대표님 맞춤형 정갈 럭셔리 소통 테이블) -->
      <div class="card shadow-sm mb-5" style="border-radius:20px; border:1.5px solid #cbd5e1; background:#ffffff; overflow:hidden; box-shadow:0 10px 25px -5px rgba(15,23,42,0.06);">
        <div class="card-header d-flex justify-content-between align-items-center flex-wrap gap-2" style="background:#f8fafc; border-bottom:1.5px solid #e2e8f0; padding:18px 24px;">
          <div>
            <h3 style="font-size:18px; font-weight:800; margin:0; color:#0f172a; display:flex; align-items:center; gap:8px;">
              🚨 미해결 업무 및 품절 현황
              <span class="badge" style="background:#ef4444; color:#ffffff; font-size:12.5px; font-weight:800; border-radius:12px; padding:3px 10px;">
                ${pendingTasks.length}건 대기중
              </span>
            </h3>
            <p style="font-size:12.5px; color:#64748b; margin:4px 0 0 0; font-weight:600;">
              가장 최근 등록된 순서대로 정렬됩니다.
            </p>
          </div>
          <span style="font-size:12.5px; color:#64748b; font-weight:700;">
            <i class="fas fa-arrow-down-short-wide me-1 text-primary"></i> 최근 등록순
          </span>
        </div>
        
        <!-- 반응형 정갈 럭셔리 보드 (모바일: 100% 쾌적 카드 / PC: 4열 와이드 테이블) -->
        <div style="padding: 16px; background: #f8fafc;">
          ${pendingTasks.length === 0 ? `
            <div style="text-align: center; padding: 48px 20px; background: #ffffff; color: #64748b; border-radius:16px; border:1.5px dashed #cbd5e1;">
              <div style="width: 52px; height: 52px; border-radius: 50%; background: #ecfdf5; color: #10b981; display: flex; align-items: center; justify-content: center; font-size: 24px; margin: 0 auto 12px auto;">
                <i class="fas fa-check-double"></i>
              </div>
              <div style="font-size: 16px; font-weight: 800; color: #0f172a; margin-bottom: 4px;">모든 미해결 업무가 완료되었습니다!</div>
              <div style="font-size: 13.5px; color: #94a3b8;">새로운 전달사항이나 품절약이 있으면 상단의 [새 업무 등록]을 눌러주세요.</div>
            </div>
            <div class="wl-card-list">
              ${pendingTasks.map((task) => {
                const rawContent = String(task.content || task.text || task.contentRx || task.note || '내용 없음').replace(/\+/g, ' ');
                const contentText = rawContent.split('\n').map(line => line.trim()).join('\n');
                const authorStr = String(task.authorName || task.author || '문성도').replace(/\+/g, ' ');
                const timeStr = String(formatLogDateTime(task)).replace(/\+/g, ' ');
                const rawTag = String(task.tag || task.type || '메모');
                const tagBadge = getTagBadge(rawTag);

                let tagClass = 'tag-memo';
                if (rawTag.includes('품절')) tagClass = 'tag-soldout';
                else if (rawTag.includes('주문')) tagClass = 'tag-order';
                else if (rawTag.includes('입고') || rawTag.includes('처리')) tagClass = 'tag-stock';
                else if (rawTag.includes('고객')) tagClass = 'tag-customer';

                return `
                  <div class="wl-premium-card ${tagClass}" style="text-align: left !important; width: 100% !important; background: #ffffff; border-radius: 14px; padding: 16px 18px; box-shadow: 0 2px 8px rgba(15,23,42,0.04);">
                    
                    <!-- 1단: 태그 + 작성시간 + 작성자 + 완료 버튼 -->
                    <div class="wl-card-header" style="display: flex !important; justify-content: space-between !important; align-items: center !important; flex-wrap: wrap !important; gap: 8px !important; padding-bottom: 10px !important; margin-bottom: 10px !important; border-bottom: 1px solid #f1f5f9 !important; text-align: left !important;">
                      <div class="wl-card-meta" style="display: flex !important; align-items: center !important; gap: 8px !important; flex-wrap: wrap !important; text-align: left !important;">
                        ${tagBadge}
                        <span style="font-size:12px; font-weight:700; color:#2563eb; background:#eff6ff; border:1px solid #bfdbfe; padding:3px 9px; border-radius:6px; display:inline-flex; align-items:center; gap:4px;">
                          <i class="far fa-clock"></i> ${timeStr}
                        </span>
                        <span style="font-size:13px; font-weight:800; color:#1e293b; display:inline-flex; align-items:center; gap:4px;">
                          <i class="fas fa-user-circle" style="color:#64748b;"></i> ${authorStr}
                        </span>
                      </div>

                      <button type="button" onclick="WorklogModule.completeTask('${task.id}')" style="background:#10b981; color:#ffffff; border:none; border-radius:8px; font-size:12.5px; padding:6px 14px; font-weight:800; cursor:pointer; display:inline-flex; align-items:center; gap:5px; box-shadow:0 2px 6px rgba(16,185,129,0.3); transition:all 0.2s;" onmouseover="this.style.background='#059669'" onmouseout="this.style.background='#10b981'">
                        <i class="fas fa-check"></i> 완료
                      </button>
                    </div>

                    <!-- 2단: 100% 가로폭 넓고 시원한 내용 및 사진 (좌측 강제 밀착 정렬) -->
                    <div class="wl-card-content-box" style="text-align: left !important; width: 100% !important; padding: 4px 0 !important; margin: 0 !important;">
                      <p class="wl-card-text" style="text-align: left !important; font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important; font-size: 15px !important; font-weight: 600 !important; color: #0f172a !important; line-height: 1.65 !important; white-space: pre-wrap !important; word-break: break-word !important; letter-spacing: -0.3px !important; margin: 0 !important; padding: 0 !important; width: 100% !important; display: block !important;">
                        ${contentText}
                      </p>
                      ${task.imageUrl ? `
                        <div style="margin-top:10px; text-align:left !important;">
                          <a href="${task.imageUrl}" target="_blank" style="display:inline-flex; align-items:center; gap:6px; padding:5px 12px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:8px; color:#1d4ed8; font-size:12px; font-weight:800; text-decoration:none; box-shadow:0 1px 3px rgba(37,99,235,0.08); transition:all 0.2s;" onmouseover="this.style.background='#dbeafe'" onmouseout="this.style.background='#eff6ff'">
                            <i class="fas fa-camera"></i> 📷 첨부 사진 보기 (클릭 시 확대)
                          </a>
                        </div>
                      ` : ''}
                    </div>

                  </div>
                `;
              }).join('')}
            </div>
          `}
        </div>
      </div>

      <!-- 중간: 일일 교대일지 달력 (히스토리 보관소) -->
      <div class="card shadow-sm mb-5" style="border-radius:20px; border:1px solid #cbd5e1; background:#ffffff; overflow:hidden;">
        <div class="card-header d-flex justify-content-between align-items-center flex-wrap gap-3" style="background:linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color:#ffffff; padding:18px 24px;">
          <div class="d-flex align-items-center gap-3">
            <div style="width:40px; height:40px; border-radius:12px; background:rgba(255,255,255,0.1); display:flex; justify-content:center; align-items:center;"><i class="fas fa-calendar-alt text-warning" style="font-size:20px;"></i></div>
            <div>
              <h3 style="font-size:17px; font-weight:bold; margin:0; color:#ffffff;">📅 ${currentYear}년 ${currentMonth}월 업무 달력 (완료 보관소)</h3>
              <p style="font-size:12.5px; margin:0; color:#94a3b8; margin-top:2px;">날짜를 누르시면 당일 히스토리가 팝업으로 나타납니다.</p>
            </div>
          </div>
          <div class="d-flex align-items-center gap-2">
            <button class="btn btn-sm btn-outline-light" onclick="WorklogModule.changeMonth(-1)"><i class="fas fa-chevron-left"></i></button>
            <span class="badge bg-primary" style="font-size:14px; padding:8px 16px;">${currentYear}년 ${String(currentMonth).padStart(2, '0')}월</span>
            <button class="btn btn-sm btn-outline-light" onclick="WorklogModule.changeMonth(1)"><i class="fas fa-chevron-right"></i></button>
          </div>
        </div>
        <div class="card-body" style="padding:20px;">
          ${renderMonthlyCalendar(logs, currentYear, currentMonth)}
        </div>
      </div>

      <!-- 하단: 최근 15일 인수인계 & 피드 (V체크 기능 포함) -->
      <div class="card shadow-sm mb-5" style="border-radius:20px; border:1px solid #cbd5e1; background:#ffffff; overflow:hidden;">
        <div class="card-header" style="background:#f8fafc; border-bottom:1px solid #e2e8f0; padding:18px 24px;">
          <h3 style="font-size:17px; font-weight:800; margin:0; color:#0f172a;">📋 최근 15일 인수인계 & 업무 피드</h3>
          <p style="font-size:12.5px; margin:0; color:#64748b; margin-top:4px;">최근 15일 내역만 최신순으로 나열됩니다. 내용을 확인하신 후 하단의 <b>'✔ 확인 완료'</b>를 눌러 인계받았음을 표시해 주세요.</p>
        </div>
        <div class="card-body" style="padding:24px; background:#f1f5f9; display:flex; flex-direction:column; gap:16px; max-height:800px; overflow-y:auto;">
          ${sortedLogs.length === 0 ? '<div class="text-center text-muted py-4">최근 15일 내에 등록된 업무 내역이 없습니다.</div>' : ''}
          ${sortedLogs.map(log => {
             const checkedArr = log.checkedBy || []; // 확인한 사람들 배열
             const hasChecked = currUser && checkedArr.includes(currUser.name); // 내가 이미 체크했는지 여부
             const contentText = String(log.content || log.text || log.contentRx || log.note || '<span style="color:#94a3b8; font-style:italic;">내용 없음</span>').replace(/\+/g, ' ');
             const authorStr = String(log.authorName || log.author || '문성도').replace(/\+/g, ' ');
             const timeDisplay = String(log.createdAt || log.date || '').replace(/\+/g, ' ');
             const isCompleted = log.status === 'COMPLETED';
             const compBy = String(log.completedBy || '담당자').replace(/\+/g, ' ');

             return `
               <div style="background:#ffffff; border:1px solid #cbd5e1; border-radius:16px; padding:18px 20px; box-shadow:0 2px 4px rgba(0,0,0,0.02);">
                 <!-- 상단: 작성자 및 상태 정보 -->
                 <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                   <div class="d-flex align-items-center gap-2 flex-wrap">
                     ${log.tag ? getTagBadge(log.tag) : '<span class="badge" style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; padding:5px 10px; border-radius:6px; font-size:12px;">⚪ 일반/메모</span>'}
                     <span style="font-size:14.5px; font-weight:800; color:#1e293b;"><i class="fas fa-user-edit me-1" style="color:#94a3b8;"></i>${authorStr}</span>
                     <span style="font-size:12px; color:#64748b; background:#f8fafc; padding:3px 8px; border-radius:6px; border:1px solid #e2e8f0;"><i class="far fa-clock me-1"></i>${timeDisplay}</span>
                   </div>
                    <div class="d-flex align-items-center gap-2">
                      ${isCompleted 
                        ? `<span style="font-size:12px; font-weight:700; color:#16a34a; background:#dcfce7; padding:4px 10px; border-radius:6px; border:1px solid #bbf7d0;">✅ 해결완료 (완료자: ${compBy})</span>` 
                        : `<span style="font-size:12px; font-weight:700; color:#ef4444; background:#fee2e2; padding:4px 10px; border-radius:6px; border:1px solid #fecdd3;">🚨 미해결</span>`
                      }
                      ${(currUser && (currUser.role === '약국장' || currUser.id === 'emp_1' || authorStr === currUser.name)) ? `
                        <button type="button" class="btn btn-sm text-danger" onclick="WorklogModule.deleteTask('${log.id}')" style="background:#fff1f2; border:1px solid #fecdd3; padding:2px 8px; border-radius:6px; font-size:11.5px; font-weight:700;" title="업무일지 삭제">
                          <i class="fas fa-trash-alt"></i> 삭제
                        </button>
                      ` : ''}
                    </div>
                 </div>
                 
                 <!-- 본문 내용 및 콤팩트 사진 링크 -->
                 <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:14px 16px; margin-bottom:14px;">
                   <div style="font-size:15.5px; font-weight:700; color:#1e293b; line-height:1.65; white-space:pre-wrap; word-break:break-word;">${contentText}</div>
                   ${log.imageUrl ? `
                     <div style="margin-top:10px;">
                       <a href="${log.imageUrl}" target="_blank" style="display:inline-flex; align-items:center; gap:5px; padding:4px 10px; background:#ffffff; border:1px solid #cbd5e1; border-radius:6px; text-decoration:none; color:#2563eb; font-size:12px; font-weight:700; transition:all 0.2s; box-shadow:0 1px 2px rgba(0,0,0,0.03);" onmouseover="this.style.background='#eff6ff'; this.style.borderColor='#bfdbfe';" onmouseout="this.style.background='#ffffff'; this.style.borderColor='#cbd5e1';">
                         <i class="far fa-image" style="font-size:13px;"></i> 첨부 사진 보기
                       </a>
                     </div>
                   ` : ''}
                 </div>
                 
                 <!-- 하단: V체크 (인수인계 확인) 1:1 수평 정렬 영역 -->
                 <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 pt-2" style="border-top:1px solid #f1f5f9;">
                   <div class="d-flex flex-wrap gap-2 align-items-center">
                     <span style="font-size:12.5px; color:#64748b; font-weight:700;"><i class="fas fa-user-check me-1" style="color:#059669;"></i>인계 확인:</span>
                     ${checkedArr.length > 0 
                       ? checkedArr.map(n => `<span style="font-size:12px; font-weight:700; color:#16a34a; background:#dcfce7; border:1px solid #bbf7d0; padding:3px 9px; border-radius:12px; display:inline-flex; align-items:center; gap:3px;"><i class="fas fa-check" style="font-size:10px;"></i> ${n}</span>`).join('') 
                       : '<span style="font-size:12px; color:#94a3b8; font-style:italic;">미확인</span>'}
                   </div>
                   
                   <button type="button" onclick="WorklogModule.checkTask('${log.id}')" 
                           style="border-radius:8px; padding:6px 14px; font-size:12.5px; font-weight:800; height:32px; display:inline-flex; align-items:center; justify-content:center; gap:5px; transition:all 0.2s; 
                           ${hasChecked 
                             ? 'background:#f1f5f9; color:#94a3b8; border:1px solid #cbd5e1; cursor:not-allowed;' 
                             : 'background:#2563eb; color:#ffffff; border:none; box-shadow:0 2px 6px rgba(37,99,235,0.25); cursor:pointer;'}"
                           ${hasChecked ? 'disabled' : ''}>
                     ${hasChecked ? '<i class="fas fa-check-double"></i> 내 확인 완료' : '<i class="fas fa-check"></i> 확인 완료'}
                   </button>
                 </div>
               </div>
             `;
          }).join('')}
        </div>
      </div>

      <!-- 신규 업무 등록 모달 (사진 첨부 포함) -->
      <div class="modal-overlay" id="worklog-create-modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(15,23,42,0.7); backdrop-filter:blur(5px); z-index:99999; justify-content:center; align-items:center;">
        <div class="modal-card shadow-lg" style="background:#fff; border-radius:24px; max-width:540px; width:92%; padding:36px; position:relative; box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);">
          <button class="close-btn" onclick="WorklogModule.closeModal()" style="position:absolute; top:24px; right:24px; background:#f1f5f9; border:none; width:36px; height:36px; border-radius:50%; font-size:18px; color:#64748b; cursor:pointer; display:flex; align-items:center; justify-content:center; transition:background 0.2s;"><i class="fas fa-times"></i></button>
          
          <div class="d-flex align-items-center gap-3 mb-4 border-bottom pb-3">
            <div style="width:48px; height:48px; border-radius:14px; background:#eff6ff; color:#2563eb; display:flex; justify-content:center; align-items:center; font-size:20px;"><i class="fas fa-pen-fancy"></i></div>
            <div>
              <h3 style="font-size:20px; font-weight:800; margin:0; color:#0f172a;">새 업무/이슈 등록</h3>
              <p class="text-muted mb-0" style="font-size:13.5px; margin-top:4px;">정확한 인수인계를 위해 내용을 상세히 적어주세요.</p>
            </div>
          </div>

          <form onsubmit="WorklogModule.submitTask(event)">
            <div class="mb-4">
              <label class="form-label font-bold" style="font-size:14px; color:#334155; margin-bottom:8px;">구분 태그 <span class="text-danger">*</span></label>
              <select id="wl-tag" class="form-select font-bold" style="border-radius:12px; background:#f8fafc; border:1px solid #cbd5e1; padding:12px 16px; font-size:15px; width:100%; box-shadow:inset 0 1px 2px rgba(0,0,0,0.02);" required>
                <option value="품절">🔴 품절약 등록 (입고 요망)</option>
                <option value="주문">🟡 주문 요청 (도매상/본사)</option>
                <option value="고객">🔵 특정 환자/예약/선결제</option>
                <option value="입고">🟢 입고 완료 / 지시사항 전달</option>
                <option value="메모" selected>⚪ 일반 업무 / 기타 메모</option>
              </select>
            </div>

            <div class="mb-4">
              <label class="form-label font-bold" style="font-size:14px; color:#334155; margin-bottom:8px;">내용 작성 <span class="text-danger">*</span></label>
              <textarea id="wl-content" class="form-control" rows="5" style="border-radius:12px; background:#f8fafc; border:1px solid #cbd5e1; padding:16px; font-size:15px; width:100%; resize:none; line-height:1.6; box-shadow:inset 0 1px 2px rgba(0,0,0,0.02);" placeholder="어떤 약이 품절인지, 누구에게 전달할 메모인지 구체적으로 작성해 주세요..." required></textarea>
            </div>

           <div class="mb-4">
              <label class="form-label font-bold" style="font-size:14px; color:#334155; margin-bottom:8px;">사진 첨부 (선택)</label>
              
              <div style="position: relative; width: 100%;">
                <label for="wl-image" style="display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; border-radius:12px; border:2px dashed #94a3b8; padding:24px 16px; background:#f8fafc; color:#475569; font-size:14px; font-weight:700; cursor:pointer; transition:all 0.2s; text-align:center;" onmouseover="this.style.borderColor='#3b82f6'; this.style.color='#3b82f6'; this.style.background='#eff6ff'" onmouseout="this.style.borderColor='#94a3b8'; this.style.color='#475569'; this.style.background='#f8fafc'">
                  <i class="fas fa-camera" style="font-size:24px; color:#94a3b8; transition:color 0.2s;" id="wl-camera-icon"></i>
                  <span id="wl-file-name">여기를 눌러 사진을 선택하세요 (모바일은 카메라 작동)</span>
                </label>
                <input type="file" id="wl-image" accept="image/*" style="display:none;" onchange="document.getElementById('wl-file-name').innerText = this.files[0] ? this.files[0].name : '여기를 눌러 사진을 선택하세요 (모바일은 카메라 작동)'; document.getElementById('wl-camera-icon').style.color = '#3b82f6'; WorklogModule.previewImage(event)">
              </div>
              
              <div id="wl-preview-container" style="display:none; margin-top:16px; text-align:center; background:#f1f5f9; padding:16px; border-radius:12px;">
                <img id="wl-preview-img" style="max-height:180px; border-radius:8px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);" />
                <input type="hidden" id="wl-compressed-base64" />
              </div>
            </div>

            <div class="d-flex justify-content-end gap-2 mt-2">
              <button type="button" class="btn btn-light font-bold" onclick="WorklogModule.closeModal()" style="border-radius:12px; padding:12px 24px; font-size:15px; background:#f1f5f9; color:#475569; border:none;">취소</button>
              <button type="submit" id="wl-submit-btn" class="btn btn-primary font-bold" style="border-radius:12px; padding:12px 24px; font-size:15px; background:linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); border:none; box-shadow:0 4px 12px rgba(37,99,235,0.25);">
                <i class="fas fa-paper-plane me-1"></i> 등록하기
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- 🔍 검색 결과 팝업 모달 -->
      <div class="modal-overlay" id="worklog-search-modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(15,23,42,0.7); backdrop-filter:blur(5px); z-index:99999; justify-content:center; align-items:center;">
        <div class="modal-card shadow-lg" style="background:#fff; border-radius:24px; max-width:650px; width:92%; max-height:85vh; overflow-y:auto; padding:32px; position:relative;">
          <button class="close-btn" onclick="document.getElementById('worklog-search-modal').style.display='none'" style="position:absolute; top:20px; right:20px; background:#f1f5f9; border:none; width:36px; height:36px; border-radius:50%; font-size:18px; color:#64748b; cursor:pointer;"><i class="fas fa-times"></i></button>
          <div id="worklog-search-modal-content"></div>
        </div>
      </div>

      <!-- 당일 상세 팝업 모달 -->
      <div class="modal-overlay" id="worklog-day-modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(15,23,42,0.6); z-index:99999; justify-content:center; align-items:center;">
        <div class="modal-card shadow-lg" style="background:#fff; border-radius:24px; max-width:600px; width:92%; max-height:85vh; overflow-y:auto; padding:32px; position:relative;">
          <button class="close-btn" onclick="WorklogModule.closeDayModal()" style="position:absolute; top:20px; right:20px; background:none; border:none; font-size:20px; color:#64748b;">&times;</button>
          <div id="worklog-day-modal-content"></div>
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  // 헬퍼: 태그 배지 생성기
  function getTagBadge(tag) {
    if(tag === '품절') return '<span class="badge" style="background:#fee2e2; color:#ef4444; border:1px solid #fca5a5; padding:6px 12px;">🔴 품절</span>';
    if(tag === '주문') return '<span class="badge" style="background:#fef3c7; color:#d97706; border:1px solid #fde68a; padding:6px 12px;">🟡 주문</span>';
    if(tag === '고객') return '<span class="badge" style="background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe; padding:6px 12px;">🔵 고객/예약</span>';
    if(tag === '입고') return '<span class="badge" style="background:#dcfce7; color:#16a34a; border:1px solid #bbf7d0; padding:6px 12px;">🟢 입고/처리</span>';
    return '<span class="badge" style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; padding:6px 12px;">⚪ 일반/메모</span>';
  }

  // 달력 렌더링
  function renderMonthlyCalendar(logs, year, month) {
    const firstDay = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const todayStr = new Date().toISOString().split('T')[0];

    let gridHtml = `
      <div style="display:grid; grid-template-columns:repeat(7, minmax(0, 1fr)); gap:1px; background:#e2e8f0; border:1px solid #cbd5e1; border-radius:12px; overflow:hidden;">
        <div style="background:#fff1f2; color:#e11d48; text-align:center; padding:10px; font-weight:800; font-size:13px;">일</div>
        <div style="background:#f8fafc; color:#334155; text-align:center; padding:10px; font-weight:800; font-size:13px;">월</div>
        <div style="background:#f8fafc; color:#334155; text-align:center; padding:10px; font-weight:800; font-size:13px;">화</div>
        <div style="background:#f8fafc; color:#334155; text-align:center; padding:10px; font-weight:800; font-size:13px;">수</div>
        <div style="background:#f8fafc; color:#334155; text-align:center; padding:10px; font-weight:800; font-size:13px;">목</div>
        <div style="background:#f8fafc; color:#334155; text-align:center; padding:10px; font-weight:800; font-size:13px;">금</div>
        <div style="background:#eff6ff; color:#2563eb; text-align:center; padding:10px; font-weight:800; font-size:13px;">토</div>
    `;

    for (let i = 0; i < firstDay; i++) { gridHtml += `<div style="background:#f8fafc; min-height:80px;"></div>`; }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayLogs = logs.filter(l => l.date === dateStr);
      const isToday = dateStr === todayStr;

      gridHtml += `
        <div onclick="WorklogModule.openDayModal('${dateStr}')" style="background:#ffffff; min-height:80px; padding:8px; cursor:pointer; border-right:1px solid #f1f5f9; border-bottom:1px solid #f1f5f9;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='#ffffff'">
          <div style="font-weight:800; font-size:13px; color:${(firstDay+d-1)%7===0?'#e11d48':(firstDay+d-1)%7===6?'#2563eb':'#0f172a'};">
            ${d} ${isToday ? '<span class="badge bg-primary" style="font-size:9px;">오늘</span>' : ''}
          </div>
          <div style="margin-top:6px; display:flex; flex-direction:column; gap:2px;">
            ${dayLogs.slice(0,3).map(l => `
              <div style="font-size:10px; background:${l.status === 'PENDING' ? '#fee2e2' : '#f1f5f9'}; color:${l.status === 'PENDING' ? '#ef4444' : '#475569'}; padding:2px 4px; border-radius:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                ${l.status === 'PENDING' ? '🚨' : '✅'} ${l.content || '업무일지'}
              </div>
            `).join('')}
            ${dayLogs.length > 3 ? `<div style="font-size:10px; color:#94a3b8; text-align:center;">+${dayLogs.length - 3}건 더보기</div>` : ''}
          </div>
        </div>
      `;
    }
    gridHtml += `</div>`;
    return gridHtml;
  }

  function previewImage(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800; 
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
        document.getElementById('wl-preview-img').src = compressedBase64;
        document.getElementById('wl-compressed-base64').value = compressedBase64;
        document.getElementById('wl-preview-container').style.display = 'block';
      }
    };
  }

  async function submitTask(e) {
    e.preventDefault();
    const btn = document.getElementById('wl-submit-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 저장 중...';

    const curr = window.SheetsSync.getCurrentUser();
    if (!curr) { alert("로그인이 필요합니다."); btn.disabled = false; btn.innerText = '등록하기'; return; }

    const tag = document.getElementById('wl-tag').value;
    const content = document.getElementById('wl-content').value;
    const base64Data = document.getElementById('wl-compressed-base64').value;
    let imageUrl = '';

    if (base64Data) {
      try {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 사진 업로드 중...';
        const response = await fetch(GAS_WEB_APP_URL, {
          method: 'POST',
          body: JSON.stringify({ action: 'uploadImage', data: base64Data, filename: `업무사진_${Date.now()}.jpg` })
        });
        const result = await response.json();
        imageUrl = result.url || '';
      } catch (err) {
        console.warn("이미지 업로드 실패:", err);
      }
    }

    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const fullCreatedAt = `${dateStr} ${timeStr}`;

    const newLog = {
      id: 'task_' + Date.now(),
      date: dateStr,
      authorName: curr.name,
      tag: tag,
      content: content,
      imageUrl: imageUrl,
      status: 'PENDING',
      createdAt: fullCreatedAt,
      checkedBy: [] // 📌 신규 등록 시 확인자 배열 초기화
    };

    const logs = window.SheetsSync.getWorklogs() || [];
    logs.unshift(newLog);
    window.SheetsSync.saveWorklogs(logs);

    closeModal();
    alert('✅ 성공적으로 등록되었습니다.');
    render('module-content');
  }

  // 📌 1. 상단 미해결 업무 완료 처리 로직 (재확인 팝업 강화)
  function completeTask(id) {
    const curr = window.SheetsSync.getCurrentUser();
    if (!curr) { alert("로그인이 필요합니다."); return; }

    // 🚨 요청하신 확인 팝업창 (문구 강화)
    if (!confirm('🚨 정말로 해당 업무를 [완료 처리] 하시겠습니까?\n\n✔ 완료 처리 시 상단 목록에서 사라집니다.\n✔ 달력과 하단 피드에서는 언제든 다시 볼 수 있습니다.')) {
      return; 
    }

    const logs = window.SheetsSync.getWorklogs() || [];
    const target = logs.find(l => l.id === id);
    if (target) {
      target.status = 'COMPLETED';
      target.completedBy = curr.name;
      target.completedAt = new Date().toISOString().replace('T', ' ').substring(0, 16);
      window.SheetsSync.saveWorklogs(logs);
      render('module-content');
    }
  }

  // 📌 2. 하단 피드 인수인계 V체크 (확인완료) 로직 (신규 추가)
  function checkTask(id) {
    const curr = window.SheetsSync.getCurrentUser();
    if (!curr) { alert("로그인이 필요합니다."); return; }

    const logs = window.SheetsSync.getWorklogs() || [];
    const target = logs.find(l => l.id === id);
    if (target) {
      if (!target.checkedBy) target.checkedBy = []; // 배열이 없으면 생성
      
      // 내 이름이 아직 없다면 추가
      if (!target.checkedBy.includes(curr.name)) {
        target.checkedBy.push(curr.name);
        window.SheetsSync.saveWorklogs(logs);
        render('module-content'); // 화면 즉시 새로고침하여 체크 표시
      }
    }
  }

  function deleteTask(id) {
    const curr = window.SheetsSync.getCurrentUser();
    if (!curr) { alert("로그인이 필요합니다."); return; }

    const logs = window.SheetsSync.getWorklogs() || [];
    const target = logs.find(l => l.id === id);
    if (!target) return;

    const isDirector = curr.role === '약국장' || curr.id === 'emp_1';
    const isMyLog = target.authorName === curr.name;

    if (!isDirector && !isMyLog) {
      alert("🚨 본인이 작성한 업무일지만 삭제할 수 있습니다.\n(약국장은 모든 업무일지를 삭제할 수 있습니다)");
      return;
    }

    if (!confirm(`정말로 이 업무일지를 삭제하시겠습니까?\n\n작성자: ${target.authorName}\n내용: ${(target.content || '').substring(0, 30)}...`)) {
      return;
    }

    if (window.SheetsSync && typeof window.SheetsSync.addDeletedId === 'function') {
      window.SheetsSync.addDeletedId(id);
    }
    const cleanLogs = logs.filter(l => l.id !== id);
    window.SheetsSync.saveWorklogs(cleanLogs);
    render('module-content');
    alert("업무일지가 성공적으로 삭제되었습니다.");
  }

  function showCreateModal() {
    const curr = window.SheetsSync.getCurrentUser();
    if (!curr) {
      alert("⚠️ 업무 등록을 위해 먼저 로그인해 주세요.");
      if (window.App && typeof window.App.showLoginModal === 'function') {
        window.App.showLoginModal();
      }
      return;
    }
    document.getElementById('worklog-create-modal').style.display = 'flex';
  }
  function closeModal() { document.getElementById('worklog-create-modal').style.display = 'none'; }
  function changeMonth(delta) {
    currentMonth += delta;
    if (currentMonth > 12) { currentMonth = 1; currentYear++; }
    else if (currentMonth < 1) { currentMonth = 12; currentYear--; }
    render('module-content');
  }

  function executeSearch() {
    const keyword = document.getElementById('wl-search-input').value.trim();
    if (!keyword) { alert('검색어를 입력해 주세요.'); return; }

    const logs = window.SheetsSync.getWorklogs() || [];
    const lowerKeyword = keyword.toLowerCase();
    
    const results = logs.filter(l => {
      const text = (l.content || '') + (l.authorName || '') + (l.tag || '');
      return text.toLowerCase().includes(lowerKeyword);
    });

    const content = document.getElementById('worklog-search-modal-content');
    let html = `
      <div class="d-flex align-items-center gap-3 mb-4 border-bottom pb-3">
        <div style="width:48px; height:48px; border-radius:14px; background:#f0fdf4; color:#16a34a; display:flex; justify-content:center; align-items:center; font-size:22px;"><i class="fas fa-search"></i></div>
        <div>
          <h3 style="font-size:20px; font-weight:800; margin:0; color:#0f172a;">'${keyword}' 검색 결과</h3>
          <p class="text-muted mb-0" style="font-size:13.5px; margin-top:4px;">총 ${results.length}건의 기록이 발견되었습니다.</p>
        </div>
      </div>
    `;

    if (results.length === 0) {
      html += `<div class="text-center py-5"><i class="fas fa-search-minus fa-3x mb-3 text-secondary" style="opacity:0.3;"></i><h4 style="font-size:16px; color:#475569;">일치하는 내역이 없습니다.</h4></div>`;
    } else {
      html += `<div style="display:flex; flex-direction:column; gap:16px;">`;
      html += results.map(l => {
        const isCompleted = l.status === 'COMPLETED';
        const contentText = l.content || l.contentRx || l.note || '내용 없음';
        const highlightedText = contentText.replace(new RegExp(keyword, 'gi'), match => `<mark style="background:#fef08a; padding:0 2px; border-radius:4px; font-weight:bold;">${match}</mark>`);

        return `
        <div class="p-4" style="background:${isCompleted ? '#f8fafc' : '#ffffff'}; border:1px solid ${isCompleted ? '#e2e8f0' : '#cbd5e1'}; border-radius:16px;">
          <div class="d-flex justify-content-between align-items-start mb-3 flex-wrap gap-2">
            <div class="d-flex align-items-center gap-2 flex-wrap">
              <span style="font-size:12px; color:#64748b; background:#f1f5f9; padding:4px 8px; border-radius:6px;"><i class="far fa-calendar-alt me-1"></i>${l.date}</span>
              ${l.tag ? getTagBadge(l.tag) : ''}
              <span style="font-size:14px; font-weight:800; color:#1e293b;">${l.authorName}</span>
            </div>
            <div style="font-size:12px; font-weight:700; padding:4px 10px; border-radius:6px; background:${isCompleted ? '#dcfce7' : '#fee2e2'}; color:${isCompleted ? '#16a34a' : '#ef4444'};">
              ${isCompleted ? `✅ ${l.completedBy} 완료` : '🚨 진행 중'}
            </div>
          </div>
          <div style="font-size:15px; color:#334155; line-height:1.6; background:#f1f5f9; padding:14px 16px; border-radius:12px;">
            <div>${highlightedText}</div>
            ${l.imageUrl ? `
              <div style="margin-top:10px;">
                <a href="${l.imageUrl}" target="_blank" style="display:inline-flex; align-items:center; gap:5px; background:#ffffff; border:1px solid #cbd5e1; padding:4px 10px; border-radius:6px; font-size:12px; color:#2563eb; text-decoration:none; font-weight:700; transition:all 0.2s;" onmouseover="this.style.background='#eff6ff'" onmouseout="this.style.background='#ffffff'">
                  <i class="far fa-image" style="font-size:12px;"></i> 첨부사진 보기
                </a>
              </div>
            ` : ''}
          </div>
        </div>
      `}).join('');
      html += `</div>`;
    }
    
    content.innerHTML = html;
    document.getElementById('worklog-search-modal').style.display = 'flex';
  }

  function openDayModal(dateStr) {
    const logs = window.SheetsSync.getWorklogs() || [];
    const dayLogs = logs.filter(l => l.date === dateStr);
    const content = document.getElementById('worklog-day-modal-content');
    
    let html = `
      <div class="d-flex align-items-center gap-3 mb-4 border-bottom pb-3">
        <div style="width:48px; height:48px; border-radius:14px; background:#fff1f2; color:#e11d48; display:flex; justify-content:center; align-items:center; font-size:22px;">
          <i class="fas fa-calendar-day"></i>
        </div>
        <div>
          <h3 style="font-size:20px; font-weight:800; margin:0; color:#0f172a;">${dateStr} 업무 히스토리</h3>
          <p class="text-muted mb-0" style="font-size:13.5px; margin-top:4px;">해당 날짜에 등록되거나 처리된 총 ${dayLogs.length}건의 업무입니다.</p>
        </div>
      </div>
    `;
    
    if (dayLogs.length === 0) {
      html += `
        <div class="text-center py-5">
          <i class="fas fa-inbox fa-3x mb-3 text-secondary" style="opacity:0.3;"></i>
          <h4 style="font-size:16px; font-weight:bold; color:#475569;">이 날짜에 기록된 내역이 없습니다.</h4>
        </div>
      `;
    } else {
      html += `<div style="display:flex; flex-direction:column; gap:16px;">`;
      html += dayLogs.map(l => {
        const contentText = l.content || l.contentRx || l.note || '<span style="color:#94a3b8; font-style:italic;">내용 없음</span>';
        const isCompleted = l.status === 'COMPLETED';

        return `
        <div class="p-4" style="background:${isCompleted ? '#f8fafc' : '#ffffff'}; border:1px solid ${isCompleted ? '#e2e8f0' : '#cbd5e1'}; border-radius:16px; box-shadow:0 2px 8px rgba(0,0,0,0.02);">
          
          <div class="d-flex justify-content-between align-items-start mb-3 flex-wrap gap-2">
            <div class="d-flex align-items-center gap-2 flex-wrap">
              ${l.tag ? getTagBadge(l.tag) : '<span class="badge" style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; padding:6px 12px; border-radius:8px;">⚪ 구 일지</span>'}
              <span style="font-size:15px; font-weight:800; color:#1e293b;"><i class="fas fa-user-edit me-1" style="color:#94a3b8;"></i>${l.authorName}</span>
            </div>
            <div style="font-size:13px; font-weight:700; padding:6px 12px; border-radius:8px; background:${isCompleted ? '#dcfce7' : '#fee2e2'}; color:${isCompleted ? '#16a34a' : '#ef4444'}; display:inline-flex; align-items:center;">
              ${isCompleted ? `<i class="fas fa-check-circle me-1"></i>${l.completedBy} 완료` : '🚨 진행 중'}
            </div>
          </div>
          
          <div style="font-size:15px; color:#334155; line-height:1.7; white-space:pre-wrap; word-break:break-word; background:#f1f5f9; padding:14px 16px; border-radius:12px;">
            <div>${contentText}</div>
            ${l.imageUrl ? `
              <div style="margin-top:10px;">
                <a href="${l.imageUrl}" target="_blank" style="display:inline-flex; align-items:center; gap:5px; background:#ffffff; border:1px solid #cbd5e1; padding:4px 10px; border-radius:6px; font-size:12px; color:#2563eb; text-decoration:none; font-weight:700; transition:all 0.2s;" onmouseover="this.style.background='#eff6ff'" onmouseout="this.style.background='#ffffff'">
                  <i class="far fa-image" style="font-size:12px;"></i> 첨부사진 보기
                </a>
              </div>
            ` : ''}
          </div>
        </div>
      `}).join('');
      html += `</div>`;
    }
    
    content.innerHTML = html;
    document.getElementById('worklog-day-modal').style.display = 'flex';
  }
  function closeDayModal() { document.getElementById('worklog-day-modal').style.display = 'none'; }

  // 외부에서 호출할 수 있도록 함수들을 내보냅니다 (checkTask, deleteTask 포함됨)
  return { 
    render, showCreateModal, closeModal, previewImage, 
    submitTask, completeTask, checkTask, deleteTask, changeMonth, 
    openDayModal, closeDayModal, executeSearch 
  };
})();