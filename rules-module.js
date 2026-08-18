/**
 * 5. 신세계약국 취업규칙 열람 모듈 컨트롤러 (Employment Regulations Viewer)
 * 첨부된 취업규칙 전문 조항 검색, 장별 목차 바로가기 및 인쇄 지원
 */
window.RulesModule = (function () {

  let activeChapterId = null;

  function render(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const rulesData = window.RULES_DATA;

    const html = `
      <div class="module-header">
        <div>
          <h2>📜 신세계약국 취업규칙 전문 열람</h2>
          <p class="subtitle">시행일: ${rulesData.effectiveDate} | 약국 전 직원 필수 숙지 인사·노무 규정</p>
        </div>
        <button class="btn btn-outline" onclick="window.print()">
          <i class="fas fa-print"></i> 취업규칙 인쇄/저장
        </button>
      </div>

      <!-- 📊 Lean-OPS KPI 4카드 -->
      <div class="mb-4" style="display:grid; grid-template-columns:repeat(auto-fit,minmax(135px,1fr)); gap:10px;">
        <div class="kpi-summary-card p-3" style="border-radius:16px; border:1.5px solid #cbd5e1; background:#ffffff; display:flex; flex-direction:column; justify-content:space-between;">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span style="font-size:12px; font-weight:800; color:#475569;">총 장(章) 수</span>
            <div style="width:24px;height:24px;border-radius:6px;background:#eff6ff;color:#2563eb;display:flex;align-items:center;justify-content:center;font-size:12px;"><i class="fas fa-book"></i></div>
          </div>
          <div style="font-size:20px;font-weight:800;color:#0f172a;font-family:'Outfit',sans-serif;">${rulesData.chapters.length}<span style="font-size:12px;"> 장</span></div>
          <div style="font-size:10.5px;color:#64748b;">취업규칙 목차</div>
        </div>
        <div class="kpi-summary-card p-3" style="border-radius:16px; border:1.5px solid #bbf7d0; background:#f0fdf4; display:flex; flex-direction:column; justify-content:space-between;">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span style="font-size:12px; font-weight:800; color:#15803d;">총 조항 수</span>
            <div style="width:24px;height:24px;border-radius:6px;background:#dcfce7;color:#16a34a;display:flex;align-items:center;justify-content:center;font-size:12px;"><i class="fas fa-list-ol"></i></div>
          </div>
          <div style="font-size:20px;font-weight:800;color:#15803d;font-family:'Outfit',sans-serif;">${rulesData.chapters.reduce((s,ch)=>s+(ch.articles?ch.articles.length:0),0)}<span style="font-size:12px;"> 조</span></div>
          <div style="font-size:10.5px;color:#059669;">법정 규정</div>
        </div>
        <div class="kpi-summary-card p-3" style="border-radius:16px; border:1.5px solid #bfdbfe; background:#eff6ff; display:flex; flex-direction:column; justify-content:space-between;">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span style="font-size:12px; font-weight:800; color:#1e40af;">시행일</span>
            <div style="width:24px;height:24px;border-radius:6px;background:#dbeafe;color:#1d4ed8;display:flex;align-items:center;justify-content:center;font-size:12px;"><i class="fas fa-calendar-alt"></i></div>
          </div>
          <div style="font-size:14px;font-weight:800;color:#1d4ed8;font-family:'Outfit',sans-serif;">${rulesData.effectiveDate || '2024-01-01'}</div>
          <div style="font-size:10.5px;color:#2563eb;">최종 개정</div>
        </div>
        <div class="kpi-summary-card p-3" style="border-radius:16px; border:1.5px solid #fde68a; background:#fffbeb; display:flex; flex-direction:column; justify-content:space-between;">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span style="font-size:12px; font-weight:800; color:#92400e;">적용 인원</span>
            <div style="width:24px;height:24px;border-radius:6px;background:#fef3c7;color:#d97706;display:flex;align-items:center;justify-content:center;font-size:12px;"><i class="fas fa-users"></i></div>
          </div>
          <div style="font-size:20px;font-weight:800;color:#d97706;font-family:'Outfit',sans-serif;">9<span style="font-size:12px;"> 인</span></div>
          <div style="font-size:10.5px;color:#b45309;">전 직원 필수</div>
        </div>
      </div>

      <!-- 검색 & 본문 메인 레이아웃 -->
      <div class="rules-main-layout">
        <!-- 좌측 장별 목차 바로가기 -->
        <div class="rules-toc-sidebar sticky-panel">
          <div class="search-box mb-4">
            <i class="fas fa-search"></i>
            <input type="text" id="rules-search-input" placeholder="조항, 키워드 검색 (예: 시용, 연차, 포괄)..." oninput="RulesModule.searchRules()">
          </div>
          <h4><i class="fas fa-list"></i> 목차 (Chapters)</h4>
          <ul class="toc-list">
            ${rulesData.chapters.map(ch => `
              <li>
                <a href="#${ch.id}" class="toc-link" onclick="RulesModule.scrollToChapter('${ch.id}', event)">
                  <span class="toc-num">${ch.number}</span>
                  <span class="toc-title">${ch.title}</span>
                </a>
              </li>
            `).join('')}
          </ul>
        </div>

        <!-- 우측 본문 조항 영역 -->
        <div class="rules-content-area" id="rules-text-container">
          ${renderRulesBody(rulesData.chapters)}
        </div>
      </div>
    `;

    container.innerHTML = html;
  }

  function renderRulesBody(chapters, searchKeyword = '') {
    return chapters.map(ch => `
      <div class="rules-chapter-card" id="${ch.id}">
        <div class="chapter-header">
          <h3><span class="ch-badge">${ch.number}</span> ${ch.title}</h3>
        </div>
        <div class="chapter-body">
          ${ch.articles.map(art => {
            let contentHtml = art.content.replace(/\n/g, '<br>');

            if (searchKeyword) {
              const regex = new RegExp(`(${searchKeyword})`, 'gi');
              contentHtml = contentHtml.replace(regex, '<mark class="search-hl">$1</mark>');
            }

            return `
              <div class="article-item" id="${art.id}">
                <div class="article-title-bar">
                  <strong>${art.number} [${art.title}]</strong>
                  <div class="article-tags">
                    ${art.tags.map(t => `<span class="tag-pill">#${t}</span>`).join('')}
                  </div>
                </div>
                <div class="article-content">${contentHtml}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `).join('');
  }

  function scrollToChapter(chId, e) {
    if (e) e.preventDefault();
    const elem = document.getElementById(chId);
    if (elem) {
      elem.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.querySelectorAll('.toc-link').forEach(l => l.classList.remove('active'));
      const activeLink = document.querySelector(`.toc-link[href="#${chId}"]`);
      if (activeLink) activeLink.classList.add('active');
    }
  }

  function searchRules() {
    const query = document.getElementById('rules-search-input').value.trim().toLowerCase();
    const rulesData = window.RULES_DATA;

    if (!query) {
      document.getElementById('rules-text-container').innerHTML = renderRulesBody(rulesData.chapters);
      return;
    }

    const filteredChapters = rulesData.chapters.map(ch => {
      const matchingArticles = ch.articles.filter(art =>
        art.number.toLowerCase().includes(query) ||
        art.title.toLowerCase().includes(query) ||
        art.content.toLowerCase().includes(query) ||
        art.tags.some(t => t.toLowerCase().includes(query))
      );

      if (matchingArticles.length > 0) {
        return {
          ...ch,
          articles: matchingArticles
        };
      }
      return null;
    }).filter(ch => ch !== null);

    if (filteredChapters.length === 0) {
      document.getElementById('rules-text-container').innerHTML = `
        <div class="empty-state">
          <i class="fas fa-search-minus"></i>
          <p>'${query}' 키워드와 일치하는 취업규칙 조항이 없습니다.</p>
        </div>
      `;
    } else {
      document.getElementById('rules-text-container').innerHTML = renderRulesBody(filteredChapters, query);
    }
  }

  return {
    render,
    scrollToChapter,
    searchRules
  };
})();
