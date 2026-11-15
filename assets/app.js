/* Seok's Paper 웹앱: data/index.json(발행 목록)과 data/editions/날짜.json(그날 신문)을 읽어 그린다. */
(() => {
  'use strict';

  const TABS = [
    { id: 'hot', label: '1면 핫이슈' },
    { id: 'macro', label: '2면 매크로' },
    { id: 'company', label: '3면 기업' },
    { id: 'social', label: '4·5면 SNS' },
    { id: 'weekly', label: '주간 특보' }
  ];
  const CONF = { confirmed: '확인됨', partial: '일부 확인', rumor: '가설·소문' };
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];

  const state = { index: null, edition: null, date: null, tab: 'hot', item: null, calMonth: null, lastFocus: null };
  const $ = (s) => document.querySelector(s);
  const el = { content: $('#content'), tabs: $('#tabs'), date: $('#dateLabel'), issue: $('#issueLine'),
    banner: $('#sampleBanner'), cal: $('#calendar'), recent: $('#recent'), calPanel: $('#calendarPanel'),
    calBtn: $('#calBtn'), calScrim: $('#calScrim'), detail: $('#detail'), detailBody: $('#detailBody') };

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const fmtLong = (s) => { const d = parseDate(s); return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 ${DOW[d.getDay()]}요일`; };
  const fmtShort = (s) => { const d = parseDate(s); return `${d.getMonth() + 1}.${d.getDate()} (${DOW[d.getDay()]})`; };
  const badge = (c) => (c && CONF[c] ? `<span class="badge ${c}">${CONF[c]}</span>` : '');
  const tickers = (arr) => (arr || []).map((t) => `<span class="ticker">${esc(t)}</span>`).join('');
  const changeClass = (v) => (/^\+/.test(v || '') ? 'up' : (/^[-−]/.test(v || '') ? 'down' : ''));

  /* ---------- 주소(#/날짜/탭/기사) ---------- */
  function readHash() {
    const p = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    return { date: p[0] || null, tab: p[1] || null, item: p[2] || null };
  }
  function go(date, tab, item) {
    const h = '#/' + [date, tab, item].filter(Boolean).join('/');
    if (location.hash !== h) location.hash = h; else route();
  }

  async function fetchJSON(url) {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error(url + ' ' + r.status);
    return r.json();
  }

  async function route() {
    const h = readHash();
    const list = state.index.editions;
    const date = h.date && list.some((e) => e.date === h.date) ? h.date : state.index.latest;
    try {
      if (date !== state.date) {
        state.edition = await fetchJSON(`data/editions/${date}.json`);
        state.date = date;
      }
    } catch (e) {
      el.content.innerHTML = `<p class="state">이 날짜의 신문을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.</p>`;
      return;
    }
    const ed = state.edition;
    const avail = TABS.filter((t) => t.id !== 'weekly' || ed.weekly);
    state.tab = avail.some((t) => t.id === h.tab) ? h.tab : 'hot';
    state.item = h.item;
    if (!state.calMonth || !sameMonth(state.calMonth, date)) state.calMonth = date.slice(0, 7);
    renderChrome(ed, avail);
    renderTab();
    renderCalendar();
    if (state.item) openDetail(state.item); else closeDetail(true);
  }
  const sameMonth = (ym, date) => date.startsWith(ym);

  /* ---------- 제호, 탭 ---------- */
  function renderChrome(ed, avail) {
    el.banner.hidden = !ed.sample;
    el.date.textContent = fmtLong(ed.date);
    el.issue.textContent = `제${ed.issue}호 · 06:15 발행 · 집계 ${ed.window || ''}`;
    document.title = `Seok's Paper · ${fmtShort(ed.date)}`;
    el.tabs.innerHTML = avail.map((t) => `<button type="button" role="tab" class="tab${t.id === 'weekly' ? ' weekly-tab' : ''}" id="tab-${t.id}" aria-selected="${t.id === state.tab}" aria-controls="content" data-tab="${t.id}">${esc(t.label)}${t.id === 'weekly' ? '<span class="dot" aria-hidden="true"></span>' : ''}</button>`).join('');
  }
  el.tabs.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (b) { go(state.date, b.dataset.tab); window.scrollTo({ top: 0 }); }
  });
  el.tabs.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const btns = [...el.tabs.querySelectorAll('[data-tab]')];
    const i = btns.findIndex((b) => b.dataset.tab === state.tab);
    const n = btns[(i + (e.key === 'ArrowRight' ? 1 : btns.length - 1)) % btns.length];
    go(state.date, n.dataset.tab);
    setTimeout(() => document.getElementById('tab-' + n.dataset.tab)?.focus(), 0);
  });

  /* ---------- 면별 화면 ---------- */
  function renderTab() {
    const ed = state.edition;
    const html = { hot: hotPage, macro: macroPage, company: companyPage, social: socialPage, weekly: weeklyPage }[state.tab](ed);
    el.content.innerHTML = html;
  }

  function hotPage(ed) {
    const max = Math.max(...ed.hot.map((h) => h.channels), 1);
    return `
      <section class="panel lead-panel">
        <div><span class="kicker">오늘의 한 줄</span><p class="lead-text">${esc(ed.lead)}</p></div>
        <div class="stats">
          <div class="stat"><strong>${esc(ed.stats.priority)}</strong><span>1순위 채널</span></div>
          <div class="stat"><strong>${esc(ed.stats.chats)}</strong><span>전체 대화방</span></div>
          <div class="stat"><strong>${esc(ed.stats.messages)}</strong><span>분석한 메시지</span></div>
        </div>
      </section>
      <div class="section-head"><h2 class="section-title">핫이슈 TOP ${ed.hot.length}</h2><p class="section-note">여러 채널에서 겹친 순 · 누르면 자세히</p></div>
      <div class="cards">${ed.hot.map((h, i) => `
        <button type="button" class="card" data-open="${esc(h.id)}">
          <span class="rank${i < 3 ? ' top' : ''}">${i + 1}</span>
          <span class="card-body">
            <span class="card-title">${esc(h.title)}</span>
            <span class="card-text">${esc(h.summary)}</span>
            <span class="card-meta">
              <span class="mention"><span class="mbar"><i style="width:${Math.round(h.channels / max * 100)}%"></i></span>${esc(h.channels)}개 채널</span>
              ${tickers(h.tickers)}${badge(h.confidence)}<span class="more">자세히 ›</span>
            </span>
          </span>
        </button>`).join('')}
      </div>`;
  }

  function macroPage(ed) {
    const m = ed.macro;
    return `
      <div class="section-head"><h2 class="section-title">매크로 환경 ${m.items.length}가지</h2><p class="section-note">1순위에서 고르고 전체 대화방과 공식 발표로 보강</p></div>
      <section class="indicators" aria-label="주요 지표">${m.indicators.map((x) => `
        <div class="indicator"><span class="small muted">${esc(x.label)}</span><strong>${esc(x.value)}</strong><span class="small ${changeClass(x.change)}">${esc(x.change)}</span></div>`).join('')}
      </section>
      <div class="cards">${m.items.map((x, i) => `
        <button type="button" class="card no-rank" data-open="${esc(x.id)}">
          <span class="card-body">
            <span class="card-meta"><span class="rank top" style="font-size:20px">${i + 1}</span><span class="chip">${esc(x.category)}</span>${badge(x.confidence)}</span>
            <span class="card-title">${esc(x.title)}</span>
            <span class="card-text">${esc(x.now)}</span>
            <span class="macro-read"><b>시장 해석</b>${esc(x.read)}</span>
            <span class="card-meta small muted"><span>다음 일정 · ${esc(x.next)}</span><span class="more">자세히 ›</span></span>
          </span>
        </button>`).join('')}
      </div>`;
  }

  function companyPage(ed) {
    const c = ed.company;
    const max = Math.max(...c.ranking.map((r) => r.telegram + r.x), 1);
    return `
      <div class="section-head"><h2 class="section-title">많이 언급된 기업</h2><p class="section-note">지난 24시간 텔레그램과 X 언급 횟수</p></div>
      <section class="panel" style="display:flex;flex-direction:column;gap:12px">
        <div class="legend"><span><i style="background:var(--accent)"></i>텔레그램</span><span><i class="xkey" style="background:#9DB4F0"></i>X</span></div>
        <div class="rank-list">${c.ranking.map((r) => `
          <div class="rank-row"><span class="name">${esc(r.name)}</span>
            <span class="stack" role="img" aria-label="${esc(r.name)} 텔레그램 ${r.telegram}회, X ${r.x}회"><i class="tg" style="width:${r.telegram / max * 100}%"></i><i class="x" style="width:${r.x / max * 100}%"></i></span>
            <strong class="num" style="text-align:right">${r.telegram + r.x}</strong></div>`).join('')}
        </div>
      </section>
      <div class="cards">${c.cards.map((x) => `
        <button type="button" class="card no-rank" data-open="${esc(x.id)}">
          <span class="card-body">
            <span class="card-meta"><span class="card-title" style="font-size:19px">${esc(x.name)}</span><span class="ticker">${esc(x.ticker)}</span></span>
            <span class="small muted">언급 ${x.telegram + x.x}회 · 텔레그램 ${x.telegram} · X ${x.x}</span>
            <span class="metric-grid">
              <span class="metric"><span>종가</span><strong>${esc(x.metrics.price)}</strong></span>
              <span class="metric"><span>등락</span><strong class="${changeClass(x.metrics.change)}">${esc(x.metrics.change)}</strong></span>
              <span class="metric"><span>다음 실적</span><strong>${esc(x.metrics.earnings)}</strong></span>
            </span>
            <span class="card-text">${esc(x.what)}</span>
            <span class="card-meta"><span class="more">핵심 논점과 수치 보기 ›</span></span>
          </span>
        </button>`).join('')}
      </div>`;
  }

  function socialPage(ed) {
    const s = ed.social;
    const d = s.debate;
    return `
      <section class="notice"><p>사실보다 사람들의 해석과 가설을 모은 면입니다. 확인되지 않은 내용이 섞여 있어 표시를 붙였습니다.</p>
        <div class="card-meta">${badge('confirmed')}${badge('partial')}${badge('rumor')}</div></section>
      <div class="section-head"><h2 class="section-title"><span class="page-mark">4면</span>오늘의 논쟁</h2></div>
      <section class="panel debate">
        <button type="button" class="card no-rank" data-open="${esc(d.id)}" style="border:0;padding:0">
          <span class="card-body"><span class="card-title" style="font-size:22px">${esc(d.title)}</span>
          <span class="card-meta">${d.signals.map((x) => `<span class="chip">${esc(x)}</span>`).join('')}<span class="more">자세히 ›</span></span></span>
        </button>
        <div class="positions">${d.positions.map((p) => `
          <div class="position" style="border-top-color:${esc(p.color)}">
            <div class="view-top"><strong>${esc(p.label)}</strong>${badge(p.confidence)}</div>
            <div class="share"><span class="bar"><i style="width:${p.share}%;background:${esc(p.color)}"></i></span><span class="num">언급 ${p.share}%</span></div>
            <p style="margin:0;font-size:14.5px">${esc(p.claim)}</p>
            <p class="small muted" style="margin:0">근거로 드는 것: ${esc(p.basis)}</p>
            <span class="small muted">주로 나온 곳: ${esc(p.where)}</span>
          </div>`).join('')}
        </div>
        <div class="facts"><div class="fact known"><b>확인된 사실</b>${esc(d.known)}</div><div class="fact unknown"><b>아직 모르는 것</b>${esc(d.unknown)}</div></div>
      </section>
      <div class="section-head"><h2 class="section-title"><span class="page-mark">5면</span>그 밖의 화제</h2></div>
      <div class="cards">${s.buzz.map((b) => `
        <button type="button" class="card no-rank" data-open="${esc(b.id)}">
          <span class="card-body">
            <span class="card-meta"><span class="small" style="font-weight:600">${esc(b.where)}</span><span style="margin-left:auto">${badge(b.confidence)}</span></span>
            <span class="card-title" style="font-size:16.5px">${esc(b.title)}</span>
            <span class="card-text">${esc(b.note)}</span>
          </span>
        </button>`).join('')}
      </div>`;
  }

  function weeklyPage(ed) {
    const w = ed.weekly;
    return `
      <section class="panel weekly-head lead-panel">
        <div><span class="kicker">주간 특보 · ${esc(w.range)}</span><p class="lead-text">${esc(w.oneLine)}</p></div>
        <div class="stats">
          <div class="stat"><strong>${esc(w.issues)}</strong><span>묶은 일간 호</span></div>
          <div class="stat"><strong>${esc(w.messages)}</strong><span>분석한 메시지</span></div>
          <div class="stat"><strong>${esc(w.debates)}</strong><span>주요 논쟁</span></div>
        </div>
      </section>
      <div class="section-head"><h2 class="section-title">주간 TOP ${w.top.length} 흐름</h2><p class="section-note">어느 요일에 등장했는지 함께 표시</p></div>
      <div class="cards">${w.top.map((t, i) => `
        <div class="card" style="cursor:default">
          <span class="rank top" style="color:var(--hot)">${i + 1}</span>
          <span class="card-body"><span class="card-title">${esc(t.title)}</span>
            <span class="days">${['월', '화', '수', '목', '금', '토'].map((d, j) => `<span class="${t.days[j] ? 'on' : ''}">${d}</span>`).join('')}</span>
            <span class="card-text">${esc(t.note)}</span></span>
        </div>`).join('')}
      </div>
      <section class="panel"><h2 class="section-title" style="font-size:20px">매크로 주간 변화</h2>
        <div class="table-box"><table><thead><tr><th scope="col">지표</th><th scope="col">월요일</th><th scope="col">토요일</th><th scope="col">변화</th></tr></thead>
        <tbody>${w.macro.map((r) => `<tr><th scope="row">${esc(r.label)}</th><td>${esc(r.start)}</td><td>${esc(r.end)}</td><td class="${changeClass(r.change)}">${esc(r.change)}</td></tr>`).join('')}</tbody></table></div>
      </section>
      <section class="panel"><h2 class="section-title" style="font-size:20px">이번 주 많이 언급된 기업</h2>
        <div class="table-box"><table><thead><tr><th scope="col">기업</th><th scope="col">언급</th><th scope="col" style="text-align:left">주된 이야기</th></tr></thead>
        <tbody>${w.companies.map((c) => `<tr><th scope="row">${esc(c.name)}</th><td>${esc(c.count)}회</td><td style="text-align:left">${esc(c.note)}</td></tr>`).join('')}</tbody></table></div>
      </section>
      <section class="notice"><b class="section-title" style="font-size:20px">이번 주 논쟁 결산</b><p>${esc(w.debate)}</p></section>
      <section class="panel"><h2 class="section-title" style="font-size:20px">다음 주 볼 일정</h2>
        <div class="table-box"><table><tbody>${w.next.map((n) => `<tr><th scope="row" style="width:110px">${esc(n.date)}</th><td style="text-align:left">${esc(n.event)}</td></tr>`).join('')}</tbody></table></div>
      </section>`;
  }

  el.content.addEventListener('click', (e) => {
    const b = e.target.closest('[data-open]');
    if (b) { state.lastFocus = b; go(state.date, state.tab, b.dataset.open); }
  });

  /* ---------- 상세 보기 ---------- */
  function findItem(id) {
    const ed = state.edition;
    const pools = [ed.hot, ed.macro.items, ed.company.cards, ed.social.buzz, [ed.social.debate]];
    for (const p of pools) { const f = (p || []).find((x) => x && x.id === id); if (f) return f; }
    return null;
  }

  function chart(timeline) {
    if (!timeline || !timeline.length) return '';
    const W = 480, H = 130, pad = 18, bw = (W - pad * 2) / timeline.length;
    const max = Math.max(...timeline.map((t) => t.count), 1);
    const bars = timeline.map((t, i) => {
      const h = Math.max(2, (t.count / max) * (H - 40));
      const x = pad + i * bw + 1;
      return `<rect class="b${t.count === max ? ' max' : ''}" x="${x.toFixed(1)}" y="${(H - 22 - h).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${h.toFixed(1)}" rx="2"><title>${esc(t.label)} ${t.count}건</title></rect>`;
    }).join('');
    const labels = timeline.map((t, i) => (i % 6 === 0 ? `<text x="${(pad + i * bw).toFixed(1)}" y="${H - 6}">${esc(t.label)}</text>` : '')).join('');
    const peak = timeline.find((t) => t.count === max);
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="시간대별 언급 수. 가장 많은 때는 ${esc(peak.label)} ${max}건">${bars}${labels}<text x="${W - pad}" y="12" text-anchor="end">최고 ${max}건 · ${esc(peak.label)}</text></svg>`;
  }

  function openDetail(id) {
    const it = findItem(id);
    if (!it) { closeDetail(true); return; }
    const d = it.detail || {};
    const ed = state.edition;
    const meta = [
      it.channels ? `<span class="mention">${esc(it.channels)}개 채널 언급${it.priority ? ` (1순위 ${esc(it.priority)})` : ''}</span>` : '',
      it.category ? `<span class="chip">${esc(it.category)}</span>` : '',
      it.where ? `<span class="chip">${esc(it.where)}</span>` : '',
      tickers(it.tickers || (it.ticker ? [it.ticker] : [])),
      badge(it.confidence)
    ].join('');
    const blocks = [];
    if (d.summary) blocks.push(`<section class="d-block"><h3>핵심 요약</h3><ul>${d.summary.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></section>`);
    if (d.numbers && d.numbers.length) blocks.push(`<section class="d-block"><h3>숫자로 보기</h3>${ed.sample ? '<span class="sample-note">시범 화면이라 표의 수치는 예시입니다.</span>' : ''}
      <div class="table-box"><table><thead><tr><th scope="col">항목</th><th scope="col">값</th><th scope="col" style="text-align:left">설명</th></tr></thead><tbody>
      ${d.numbers.map((n) => `<tr><th scope="row">${esc(n.label)}</th><td class="${changeClass(n.value)}">${esc(n.value)}</td><td style="text-align:left" class="muted">${esc(n.note || '')}</td></tr>`).join('')}
      </tbody></table></div>${d.numbersSource ? `<span class="small muted">출처: ${esc(d.numbersSource)}</span>` : ''}</section>`);
    if (d.timeline) blocks.push(`<section class="d-block"><h3>시간대별 언급 흐름</h3>${chart(d.timeline)}</section>`);
    if (d.views) blocks.push(`<section class="d-block"><h3>채널별 시각</h3>${d.views.map((v) => `<div class="view"><div class="view-top"><strong>${esc(v.label)}</strong><span class="muted num">${esc(v.count)}곳</span></div><p>${esc(v.text)}</p><span class="small muted">${esc(v.who)}</span></div>`).join('')}</section>`);
    if (d.excerpts) blocks.push(`<section class="d-block"><h3>채널 발췌 요약</h3>${d.excerpts.map((x) => `<div class="excerpt"><span class="who">${esc(x.channel)} · ${esc(x.time)}</span><span>${esc(x.text)}</span></div>`).join('')}</section>`);
    if (d.background) blocks.push(`<section class="d-block"><h3>배경</h3><p>${esc(d.background)}</p></section>`);
    if (d.watch) blocks.push(`<section class="d-block"><h3>앞으로 볼 것</h3><ul>${d.watch.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></section>`);
    if (d.sources) blocks.push(`<section class="d-block"><h3>원문 보기</h3>${d.sources.map((s) => `<a class="link-row" href="${esc(s.url)}" target="_blank" rel="noopener"><span><strong>${esc(s.name)}</strong><br><span class="small muted">${esc(s.meta)}</span></span><span class="go">원문 열기 ↗</span></a>`).join('')}</section>`);
    if (d.related) blocks.push(`<section class="d-block"><h3>함께 읽기</h3>${d.related.map((r) => `<a class="link-row" href="${esc(r.url)}" target="_blank" rel="noopener"><span><span class="small muted">${esc(r.source)}</span><br><strong>${esc(r.title)}</strong><br><span class="small muted">${esc(r.note || '')}</span></span><span class="go">↗</span></a>`).join('')}</section>`);

    el.detailBody.innerHTML = `
      <div style="display:flex;flex-direction:column;gap:10px">
        <span class="kicker">${esc(it.kicker || sectionName(state.tab))}</span>
        <h2 class="d-title" id="detailTitle">${esc(it.title || it.name)}</h2>
        <div class="d-meta">${meta}</div>
      </div>${blocks.join('')}`;
    el.detail.hidden = false;
    document.body.style.overflow = 'hidden';
    const sheet = el.detail.querySelector('.detail-sheet');
    sheet.scrollTop = 0;
    sheet.focus();
  }
  const sectionName = (t) => (TABS.find((x) => x.id === t) || {}).label || '';

  function closeDetail(silent) {
    if (el.detail.hidden) return;
    el.detail.hidden = true;
    document.body.style.overflow = '';
    if (!silent && state.lastFocus) state.lastFocus.focus();
  }
  el.detail.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) go(state.date, state.tab); });

  /* ---------- 달력 ---------- */
  function renderCalendar() {
    const [y, m] = state.calMonth.split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const days = new Date(y, m, 0).getDate();
    const byDate = new Map(state.index.editions.map((e) => [e.date, e]));
    const cells = [];
    for (let i = 0; i < first.getDay(); i++) cells.push('<span class="cal-day" aria-hidden="true"></span>');
    for (let d = 1; d <= days; d++) {
      const ds = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const e = byDate.get(ds);
      if (e) {
        cells.push(`<button type="button" class="cal-day${e.weekly ? ' weekly' : ''}${ds === state.date ? ' selected' : ''}" data-date="${ds}" aria-label="${fmtLong(ds)} 신문${e.weekly ? '과 주간 특보' : ''} 열기"${ds === state.date ? ' aria-current="date"' : ''}>${d}<span class="mk" aria-hidden="true"></span></button>`);
      } else {
        cells.push(`<span class="cal-day">${d}</span>`);
      }
    }
    el.cal.innerHTML = `
      <div class="cal-nav"><button type="button" data-month="-1" aria-label="이전 달">‹</button><strong>${y}년 ${m}월</strong><button type="button" data-month="1" aria-label="다음 달">›</button></div>
      <div class="cal-grid">${DOW.map((d, i) => `<span class="cal-dow${i === 0 ? ' sun' : ''}">${d}</span>`).join('')}${cells.join('')}</div>
      <div class="legend" style="justify-content:center;margin-top:8px"><span><i style="border-radius:50%;background:var(--accent);width:7px;height:7px"></i>일간</span><span><i style="background:var(--hot);transform:rotate(45deg);width:7px;height:7px"></i>주간 특보</span></div>`;
    const recent = state.index.editions.slice(0, 6);
    el.recent.innerHTML = `<h3>최근 발행</h3>${recent.map((e) => `<button type="button" data-date="${e.date}"><span class="rd">${fmtShort(e.date)}${e.weekly ? ' · 일간 + 주간 특보' : ''}</span><span class="rh">${esc(e.lead)}</span></button>`).join('')}`;
  }
  el.calPanel.addEventListener('click', (e) => {
    const mv = e.target.closest('[data-month]');
    if (mv) {
      const [y, m] = state.calMonth.split('-').map(Number);
      const d = new Date(y, m - 1 + Number(mv.dataset.month), 1);
      state.calMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      renderCalendar();
      return;
    }
    const b = e.target.closest('[data-date]');
    if (b) { toggleCal(false); go(b.dataset.date, 'hot'); window.scrollTo({ top: 0 }); }
  });
  function toggleCal(open) {
    el.calPanel.classList.toggle('open', open);
    el.calScrim.hidden = !open;
    el.calBtn.setAttribute('aria-expanded', String(open));
    if (open) el.calPanel.querySelector('button')?.focus();
  }
  el.calBtn.addEventListener('click', () => toggleCal(!el.calPanel.classList.contains('open')));
  document.querySelectorAll('[data-cal-close]').forEach((b) => b.addEventListener('click', () => toggleCal(false)));

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!el.detail.hidden) go(state.date, state.tab);
    else if (el.calPanel.classList.contains('open')) toggleCal(false);
  });

  /* ---------- 시작 ---------- */
  window.addEventListener('hashchange', route);
  fetchJSON('data/index.json')
    .then((idx) => { state.index = idx; return route(); })
    .catch(() => { el.content.innerHTML = '<p class="state">아직 발행된 신문이 없어요.</p>'; el.date.textContent = ''; });
})();
