/**
 * 1. 공지사항 모듈 컨트롤러 (Notice Board Controller)
 * 신세계약국 공지사항 & 업무 SOP 최고급 정갈 리디자인
 */
window.NoticesModule = (function () {

  let selectedCategory = 'ALL';

  function render(containerId) {
    const container = document.getElementById(containerId || 'module-content');
    if (!container) return;

    const data = window.SheetsSync.getData();
    const notices = data.notices || [];

    // 카테고리별 건수 집계
    const totalCount = notices.length;
    const urgentCount = notices.filter(n => n.category === '긴급/근무').length;
    const dispensingCount = notices.filter(n => n.category === '조제/투약').length;
    const hrCount = notices.filter(n => n.category === '인사/휴가').length;

    const html = `
      <div class="module-header">
        <div>
          <h2>📢 약국 공지사항 & 업무 SOP</h2>
          <p class="subtitle">신세계약국 주요 전달사항, 조제 수칙 및 교대 인수인계 가이드라인</p>
        </div>
        <button type="button" class="btn btn-primary" onclick="NoticesModule.openCreateModal()">
          <i class="fas fa-plus"></i> 새 공지사항 작성
        </button>
      </div>

      <!-- 📊 Lean-OPS KPI 4카드 -->
      <div class="mb-4" style="display:grid; grid-template-columns:repeat(auto-fit,minmax(135px,1fr)); gap:10px;">
        <div class="kpi-summary-card p-3" style="border-radius:16px; border:1.5px solid #cbd5e1; background:#ffffff; display:flex; flex-direction:column; justify-content:space-between;" onclick="NoticesModule.filterCategory('ALL')" style="cursor:pointer;">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span style="font-size:12px; font-weight:800; color:#475569;">전체 공지</span>
            <div style="width:24px;height:24px;border-radius:6px;background:#eff6ff;color:#2563eb;display:flex;align-items:center;justify-content:center;font-size:12px;"><i class="fas fa-bullhorn"></i></div>
          </div>
          <div style="font-size:20px;font-weight:800;color:#0f172a;font-family:'Outfit',sans-serif;">${totalCount}<span style="font-size:12px;"> 건</span></div>
          <div style="font-size:10.5px;color:#64748b;">전체 SOP 포함</div>
        </div>
        <div class="kpi-summary-card p-3" style="border-radius:16px; border:1.5px solid #fde68a; background:#fffbeb; display:flex; flex-direction:column; justify-content:space-between;" onclick="NoticesModule.filterCategory('긴급/근무')" style="cursor:pointer;">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span style="font-size:12px; font-weight:800; color:#92400e;">긴급/근무</span>
            <div style="width:24px;height:24px;border-radius:6px;background:#fef3c7;color:#d97706;display:flex;align-items:center;justify-content:center;font-size:12px;"><i class="fas fa-exclamation-circle"></i></div>
          </div>
          <div style="font-size:20px;font-weight:800;color:#d97706;font-family:'Outfit',sans-serif;">${urgentCount}<span style="font-size:12px;"> 건</span></div>
          <div style="font-size:10.5px;color:#b45309;">긴급 근무 지침</div>
        </div>
        <div class="kpi-summary-card p-3" style="border-radius:16px; border:1.5px solid #bfdbfe; background:#eff6ff; display:flex; flex-direction:column; justify-content:space-between;" onclick="NoticesModule.filterCategory('조제/투약')" style="cursor:pointer;">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span style="font-size:12px; font-weight:800; color:#1e40af;">조제/투약</span>
            <div style="width:24px;height:24px;border-radius:6px;background:#dbeafe;color:#1d4ed8;display:flex;align-items:center;justify-content:center;font-size:12px;"><i class="fas fa-pills"></i></div>
          </div>
          <div style="font-size:20px;font-weight:800;color:#1d4ed8;font-family:'Outfit',sans-serif;">${dispensingCount}<span style="font-size:12px;"> 건</span></div>
          <div style="font-size:10.5px;color:#2563eb;">조제 수칙</div>
        </div>
        <div class="kpi-summary-card p-3" style="border-radius:16px; border:1.5px solid #e9d5ff; background:#faf5ff; display:flex; flex-direction:column; justify-content:space-between;" onclick="NoticesModule.filterCategory('인사/휴가')" style="cursor:pointer;">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span style="font-size:12px; font-weight:800; color:#6b21a8;">인사/휴가</span>
            <div style="width:24px;height:24px;border-radius:6px;background:#f3e8ff;color:#9333ea;display:flex;align-items:center;justify-content:center;font-size:12px;"><i class="fas fa-user-clock"></i></div>
          </div>
          <div style="font-size:20px;font-weight:800;color:#9333ea;font-family:'Outfit',sans-serif;">${hrCount}<span style="font-size:12px;"> 건</span></div>
          <div style="font-size:10.5px;color:#7c3aed;">인사/휴가 지침</div>
        </div>
      </div>

      <!-- 🍩 카테고리별 공지 비율 Donut + 필터바 -->
      <div class="row g-3 mb-4">
        <div class="col-md-4">
          <div class="card shadow-sm" style="border-radius:16px; border:1.5px solid #cbd5e1; overflow:hidden;">
            <div class="card-header" style="background:#f8fafc; border-bottom:1.5px solid #e2e8f0; padding:12px 18px;">
              <h4 style="font-size:13px; font-weight:800; color:#0f172a; margin:0;"><i class="fas fa-chart-pie text-primary me-2"></i>🍩 지침유형별 비율</h4>
            </div>
            <div style="position:relative; height:180px; width:100%; padding:10px;">
              <canvas id="noticesDonutCanvas"></canvas>
            </div>
          </div>
        </div>
        <div class="col-md-8">

      <div class="card-section mb-6">
        <div class="filter-bar-header mb-4">
          <div class="notice-search-box w-100 mb-3" style="display:flex; align-items:center; background:#ffffff; border:1.5px solid #cbd5e1; border-radius:14px; padding:4px 14px; box-shadow:0 2px 8px rgba(15,23,42,0.04); transition:all 0.2s;" onfocusin="this.style.borderColor='#059669'; this.style.boxShadow='0 0 0 4px rgba(5,150,105,0.12)';" onfocusout="this.style.borderColor='#cbd5e1'; this.style.boxShadow='0 2px 8px rgba(15,23,42,0.04)';">
            <i class="fas fa-search" style="color:#059669; font-size:15px; margin-right:12px; flex-shrink:0;"></i>
            <input type="text" id="notice-search" placeholder="공지 제목, 업무 SOP 수칙, 작성자 검색..." oninput="NoticesModule.filterNotices()" style="border:none; outline:none; background:transparent; width:100%; font-size:14px; font-weight:700; color:#0f172a; padding:10px 0;">
            <span style="font-size:11.5px; font-weight:700; color:#059669; background:#ecfdf5; border:1px solid #a7f3d0; padding:4px 10px; border-radius:8px; flex-shrink:0; margin-left:8px;" class="hide-mobile">실시간 검색</span>
          </div>
          <div class="category-tabs">
            <button type="button" class="cat-btn ${selectedCategory === 'ALL' ? 'active' : ''}" onclick="NoticesModule.filterCategory('ALL', this)">전체 보기</button>
            <button type="button" class="cat-btn ${selectedCategory === '긴급/근무' ? 'active' : ''}" onclick="NoticesModule.filterCategory('긴급/근무', this)">🚨 긴급/근무</button>
            <button type="button" class="cat-btn ${selectedCategory === '조제/투약' ? 'active' : ''}" onclick="NoticesModule.filterCategory('조제/투약', this)">💊 조제/투약</button>
            <button type="button" class="cat-btn ${selectedCategory === '인사/휴가' ? 'active' : ''}" onclick="NoticesModule.filterCategory('인사/휴가', this)">🌴 인사/휴가</button>
            <button type="button" class="cat-btn ${selectedCategory === '일반공지' ? 'active' : ''}" onclick="NoticesModule.filterCategory('일반공지', this)">📢 일반공지</button>
          </div>
        </div>

        <!-- 공지사항 카드 리스트 Grid -->
        <div class="notices-grid" id="notices-list-container">
          ${renderNoticesList(notices)}
        </div>
      </div>
        </div> <!-- end col-md-8 -->
      </div> <!-- end row -->

      <!-- 공지사항 작성/편집 모달 -->

      <div class="modal-overlay" id="notice-modal" style="display:none;">
        <div class="modal-card">
          <div class="modal-header">
            <h3 id="notice-modal-title">📢 새 공지사항 / 업무 SOP 등록</h3>
            <button class="close-btn" onclick="NoticesModule.closeModal()">&times;</button>
          </div>
          <div class="modal-body">
            <form id="notice-form" onsubmit="NoticesModule.saveNotice(event)">
              <div class="form-group">
                <label>공지 제목</label>
                <input type="text" id="form-notice-title" required placeholder="예: [중요] 8월 휴가 신청 및 야간 교대 지침">
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>카테고리</label>
                  <select id="form-notice-category">
                    <option value="긴급/근무">🚨 긴급/근무</option>
                    <option value="조제/투약">💊 조제/투약</option>
                    <option value="인사/휴가">🌴 인사/휴가</option>
                    <option value="일반공지">📢 일반공지</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>작성자</label>
                  <input type="text" id="form-notice-author" placeholder="작성자 성함" required>
                </div>
              </div>
              <div class="form-group">
                <label class="checkbox-label" style="display: flex; align-items: center; gap: 8px; font-weight: 700; cursor: pointer;">
                  <input type="checkbox" id="form-notice-pinned" style="width: auto;"> 📌 최상단 우선 고지 (Important Pin)
                </label>
              </div>
              <div class="form-group">
                <label>공지 상세 내용 및 업무 인수인계 수칙</label>
                <textarea id="form-notice-content" rows="6" required placeholder="공지 상세 내용 및 업무 인수인계 수칙을 입력하세요."></textarea>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" onclick="NoticesModule.closeModal()">취소</button>
                <button type="submit" class="btn btn-primary">등록하기</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;

    setTimeout(() => {
      initNoticesChart({ totalCount, urgentCount, dispensingCount, hrCount });
    }, 50);
  }

  function renderNoticesList(notices) {
    if (notices.length === 0) {
      return `
        <div class="empty-state py-8 text-center text-muted col-span-full">
          <i class="fas fa-bullhorn fs-2 mb-2"></i>
          <p>등록되거나 검색된 공지사항이 없습니다.</p>
        </div>
      `;
    }

    const currUser = window.SheetsSync.getCurrentUser();
    const isDirector = currUser && (currUser.role === '약국장' || currUser.id === 'emp_1');

    // Pinned notices first
    const sorted = [...notices].sort((a, b) => (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0));

    return sorted.map(notice => {
      const isMyNotice = currUser && (
        (notice.authorId && notice.authorId === currUser.id) ||
        (notice.author && (notice.author.includes(currUser.name) || notice.author.trim() === currUser.name.trim())) ||
        (notice.authorName && notice.authorName.trim() === currUser.name.trim())
      );
      const canDelete = isDirector || isMyNotice;

      return `
        <div class="notice-card ${notice.isPinned ? 'pinned' : ''}">
          <div class="notice-card-header">
            <div class="notice-badges">
              ${notice.isPinned ? `<span class="badge badge-pinned"><i class="fas fa-thumbtack"></i> 최상단 고정</span>` : ''}
              <span class="badge badge-category">${notice.category}</span>
            </div>
            <span class="notice-date"><i class="far fa-clock"></i> ${notice.date}</span>
          </div>
          <h3 class="notice-title">${notice.title}</h3>
          <p class="notice-content">${notice.content.replace(/\n/g, '<br>')}</p>
          <div class="notice-card-footer" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; padding-top:12px; border-top:1px solid #f1f5f9;">
            <span class="notice-author" style="font-weight:700; color:var(--text-main); display:flex; align-items:center; gap:6px; font-size:13px;">
              <i class="fas fa-user-circle text-primary"></i> ${notice.author}
              ${isMyNotice && !isDirector ? '<span class="badge" style="background:#eff6ff; color:#2563eb; font-size:10.5px; padding:2px 7px; border-radius:10px; font-weight:700; border:1px solid #bfdbfe;">내 작성글</span>' : ''}
            </span>
            ${canDelete ? `
              <button type="button" class="link-btn text-danger" onclick="NoticesModule.deleteNotice('${notice.id}')" style="display:inline-flex; align-items:center; gap:4px; font-size:12px; font-weight:700; padding:4px 9px; border-radius:6px; background:#fff1f2; border:1px solid #fecdd3; color:#e11d48; cursor:pointer; transition:all 0.2s;" onmouseover="this.style.background='#ffe4e6'" onmouseout="this.style.background='#fff1f2'">
                <i class="fas fa-trash-alt"></i> 삭제
              </button>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  function filterNotices() {
    const data = window.SheetsSync.getData();
    let notices = data.notices || [];
    const searchElem = document.getElementById('notice-search');
    const query = searchElem ? searchElem.value.toLowerCase() : '';

    if (selectedCategory !== 'ALL') {
      notices = notices.filter(n => n.category === selectedCategory);
    }

    if (query) {
      notices = notices.filter(n =>
        n.title.toLowerCase().includes(query) ||
        n.content.toLowerCase().includes(query) ||
        n.author.toLowerCase().includes(query)
      );
    }

    const container = document.getElementById('notices-list-container');
    if (container) {
      container.innerHTML = renderNoticesList(notices);
    }
  }

  function filterCategory(cat, btnElem) {
    selectedCategory = cat;
    document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
    if (btnElem) {
      btnElem.classList.add('active');
    }
    filterNotices();
  }

  function openCreateModal() {
    const form = document.getElementById('notice-form');
    if (form) form.reset();

    const currUser = window.SheetsSync.getCurrentUser();
    const authorInput = document.getElementById('form-notice-author');
    if (authorInput) {
      if (currUser) {
        authorInput.value = currUser.name;
      } else {
        authorInput.value = '문성도';
      }
    }

    const modal = document.getElementById('notice-modal');
    if (modal) modal.style.display = 'flex';
  }

  function closeModal() {
    const modal = document.getElementById('notice-modal');
    if (modal) modal.style.display = 'none';
  }

  function saveNotice(e) {
    e.preventDefault();
    const currUser = window.SheetsSync.getCurrentUser();
    const title = document.getElementById('form-notice-title').value.trim();
    const category = document.getElementById('form-notice-category').value;
    let author = document.getElementById('form-notice-author').value.trim();
    if (!author) {
      author = currUser ? currUser.name : '문성도';
    }
    const isPinned = document.getElementById('form-notice-pinned').checked;
    const content = document.getElementById('form-notice-content').value.trim();

    const data = window.SheetsSync.getData();
    if (!data.notices) data.notices = [];

    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const newNotice = {
      id: 'not_' + Date.now(),
      title,
      category,
      author,
      authorId: currUser ? currUser.id : (author.includes('문성도') ? 'emp_1' : ''),
      authorName: currUser ? currUser.name : author,
      isPinned,
      content,
      date: dateStr
    };

    data.notices.unshift(newNotice);
    window.SheetsSync.saveData(window.SheetsSync.STORAGE_KEYS.NOTICES, data.notices);

    closeModal();
    render('module-content');
    alert('새 공지사항이 성공적으로 등록되었습니다.');
  }

  function deleteNotice(id) {
    const currUser = window.SheetsSync.getCurrentUser();
    if (!currUser) {
      alert('로그인이 필요한 기능입니다.');
      return;
    }

    const isDirector = currUser.role === '약국장' || currUser.id === 'emp_1';
    const data = window.SheetsSync.getData();
    const target = (data.notices || []).find(n => n.id === id);

    if (!target) {
      alert('삭제할 공지사항을 찾을 수 없습니다.');
      return;
    }

    const isMyNotice = (
      (target.authorId && target.authorId === currUser.id) ||
      (target.author && (target.author.includes(currUser.name) || target.author.trim() === currUser.name.trim())) ||
      (target.authorName && target.authorName.trim() === currUser.name.trim())
    );

    if (!isDirector && !isMyNotice) {
      alert('🚨 본인이 작성한 공지사항만 삭제할 수 있습니다.\n(약국장은 전체 공지사항을 삭제할 수 있습니다.)');
      return;
    }

    const confirmMsg = isDirector && !isMyNotice
      ? `🚨 [약국장 관리자 권한]\n'${target.author}'님이 작성한 공지사항을 삭제하시겠습니까?\n\n제목: ${target.title}`
      : `정말로 본인이 작성한 공지사항을 삭제하시겠습니까?\n\n제목: ${target.title}`;

    if (!confirm(confirmMsg)) return;

    data.notices = data.notices.filter(n => n.id !== id);
    window.SheetsSync.saveData(window.SheetsSync.STORAGE_KEYS.NOTICES, data.notices);
    render('module-content');
  }

  let noticeChartInst = {};
  function initNoticesChart({ totalCount, urgentCount, dispensingCount, hrCount }) {
    if (typeof Chart === 'undefined') return;
    const ctx = document.getElementById('noticesDonutCanvas');
    if (!ctx) return;
    if (noticeChartInst.donut) noticeChartInst.donut.destroy();
    noticeChartInst.donut = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['긴급/근무', '조제/투약', '인사/휴가', '기타'],
        datasets: [{ data: [urgentCount, dispensingCount, hrCount, Math.max(0, totalCount - urgentCount - dispensingCount - hrCount)], backgroundColor: ['#f59e0b','#3b82f6','#8b5cf6','#10b981'] }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { boxWidth: 10, font: { size: 10 } } } } }
    });
  }

  return {
    render,
    filterNotices,
    filterCategory,
    openCreateModal,
    closeModal,
    saveNotice,
    deleteNotice
  };
})();
