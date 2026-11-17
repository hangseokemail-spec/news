/* Seok's Paper 웹앱: data/index.json(발행 목록)과 data/editions/날짜.json(그날 신문)을 읽어 그린다. */
(() => {
  'use strict';

  const TABS = [
    { id: 'column', label: '총평' },
    { id: 'hot', label: '핫이슈' },
    { id: 'macro', label: '매크로' },
    { id: 'company', label: '개별 기업' },
    { id: 'earnings', label: '실적 분석' },
    { id: 'social', label: 'SNS1' },
    { id: 'social2', label: 'SNS2' },
    { id: 'picks', label: '리포트' },
    { id: 'weekly', label: '주간 특보' }
  ];
  const CONF = { confirmed: '확인됨', partial: '일부 확인', rumor: '가설·소문' };
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];

  const state = { index: null, edition: null, date: null, tab: 'hot', item: null, calMonth: null, lastFocus: null, hotN: null };
  const HOTN_STORE = 'sp_hot_n';
  try { const v = parseInt(localStorage.getItem(HOTN_STORE), 10); if (v > 0) state.hotN = v; } catch (e) {}
  const $ = (s) => document.querySelector(s);
  const el = { content: $('#content'), tabs: $('#tabs'), date: $('#dateLabel'), issue: $('#issueLine'),
    banner: $('#sampleBanner'), cal: $('#calendar'), recent: $('#recent'), calPanel: $('#calendarPanel'),
    calBtn: $('#calBtn'), calScrim: $('#calScrim'), detail: $('#detail'), detailBody: $('#detailBody'),
    owner: $('#ownerBox'), ownerText: $('#ownerText'), ownerOff: $('#ownerOff') };
  const paidChip = (it) => (it.paid ? `<span class="chip paid">유료 · ${esc(it.paid.source)}</span>` : '');

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

  /* ---------- 전체판(선생님 전용) 열쇠 ---------- */
  const KEY_STORE = 'sp_owner_key';
  function b64(s) {
    let t = s.replace(/-/g, '+').replace(/_/g, '/');
    while (t.length % 4) t += '=';
    return Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
  }
  function captureKey() {
    const m = location.hash.match(/^#key=([A-Za-z0-9_-]{20,})/);
    if (!m) return false;
    try { localStorage.setItem(KEY_STORE, m[1]); } catch (e) { /* 저장 불가 브라우저 */ }
    history.replaceState(null, '', location.pathname + location.search + '#/');
    state.date = null;
    return true;
  }
  function ownerKey() { try { return localStorage.getItem(KEY_STORE); } catch (e) { return null; } }
  async function decryptFull(date) {
    const env = await fetchJSON(`data/editions/${date}.full.enc`);
    const key = await crypto.subtle.importKey('raw', b64(ownerKey()), 'AES-GCM', false, ['decrypt']);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(env.iv) }, key, b64(env.data));
    return JSON.parse(new TextDecoder().decode(plain));
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
        const meta = list.find((e) => e.date === date) || {};
        let ed = null;
        state.full = false;
        state.keyError = false;
        if (meta.full && ownerKey()) {
          try { ed = await decryptFull(date); state.full = true; } catch (err) { state.keyError = true; }
        }
        state.edition = ed || await fetchJSON(`data/editions/${date}.json`);
        state.date = date;
      }
    } catch (e) {
      el.content.innerHTML = `<p class="state">이 날짜의 신문을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.</p>`;
      return;
    }
    const ed = state.edition;
    const avail = TABS.filter((t) => (t.id !== 'weekly' || ed.weekly) && (t.id !== 'earnings' || ed.earnings) && (t.id !== 'column' || ed.column));
    state.tab = avail.some((t) => t.id === h.tab) ? h.tab : avail[0].id;   // 총평이 있으면 총평부터
    state.item = h.item;
    if (!state.calMonth || !sameMonth(state.calMonth, date)) state.calMonth = date.slice(0, 7);
    renderChrome(ed, avail);
    renderTab();
    renderCalendar();
    if (state.item) openDetail(state.item); else closeDetail(true);
  }
  const sameMonth = (ym, date) => date.startsWith(ym);

  /* ---------- 그날의 색: 표지에서 뽑아 신문 전체(제호 띠, 강조색, 그래프, 카드, 상세 창)에 입힌다 ---------- */
  const hex2rgb = (h) => { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const rgb2hsl = ([r, g, b]) => {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    if (mx === mn) return [0, 0, l];
    const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
  };
  const hsl = (h, s, l) => `hsl(${Math.round(h)} ${Math.round(Math.max(0, Math.min(1, s)) * 100)}% ${Math.round(Math.max(0, Math.min(1, l)) * 1000) / 10}%)`;
  const hsl2rgb = (h, s, l) => {
    const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    return [f(0) * 255, f(8) * 255, f(4) * 255];
  };
  const lum = (rgb) => { const c = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  // 강조색이 글자로 읽히도록 밝기를 조정 (흰 바탕 4.5:1, 어두운 바탕 4.5:1)
  function readable(h, s, l, bg, darker) {
    for (let i = 0; i < 60; i++) {
      if (contrast(hsl2rgb(h, s, l), bg) >= 4.5) break;
      l += darker ? -0.01 : 0.01;
    }
    return l;
  }
  function buildTheme(accent, mast) {
    const [ah, as0] = accent, [mh, ms] = mast;
    const as = Math.min(0.85, Math.max(0.35, as0));
    const light = {
      '--accent': hsl(ah, as, readable(ah, as, 0.45, [255, 255, 255], true) + 0.04),
      '--accent-ink': hsl(ah, as, readable(ah, as, 0.4, [255, 255, 255], true)),
      '--accent-soft': hsl(ah, Math.min(as, 0.55), 0.93),
      '--line-accent': hsl(ah, Math.min(as, 0.45), 0.84),
      '--paper': hsl(mh, Math.min(ms, 0.18), 0.965),
      '--mast-bg': hsl(mh, Math.min(ms, 0.45), 0.12),
    };
    const dark = {
      '--accent': hsl(ah, as, readable(ah, as, 0.6, [23, 29, 36], false)),
      '--accent-ink': hsl(ah, as, readable(ah, as, 0.66, [23, 29, 36], false)),
      '--accent-soft': hsl(ah, Math.min(as, 0.5), 0.18),
      '--line-accent': hsl(ah, Math.min(as, 0.4), 0.3),
      '--paper': hsl(mh, Math.min(ms, 0.25), 0.07),
      '--mast-bg': hsl(mh, Math.min(ms, 0.45), 0.09),
    };
    return { light, dark };
  }
  function themeFromImage(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const W = 48, H = 64, cv = document.createElement('canvas');
          cv.width = W; cv.height = H;
          const cx = cv.getContext('2d', { willReadFrequently: true });
          cx.drawImage(img, 0, 0, W, H);
          const px = cx.getImageData(0, 0, W, H).data, buckets = new Map();
          for (let i = 0; i < px.length; i += 4) {
            const k = ((px[i] >> 4) << 8) | ((px[i + 1] >> 4) << 4) | (px[i + 2] >> 4);
            const b = buckets.get(k) || { n: 0, r: 0, g: 0, b: 0 };
            b.n++; b.r += px[i]; b.g += px[i + 1]; b.b += px[i + 2]; buckets.set(k, b);
          }
          const list = [...buckets.values()].map((b) => { const rgb = [b.r / b.n, b.g / b.n, b.b / b.n]; return { n: b.n, rgb, hsl: rgb2hsl(rgb) }; });
          list.sort((a, b) => b.n - a.n);
          const dom = list[0];
          const darkish = list.filter((c) => c.hsl[2] < 0.3).sort((a, b) => b.n - a.n)[0] || dom;
          const acc = list.filter((c) => c.hsl[1] > 0.25 && c.hsl[2] > 0.22 && c.hsl[2] < 0.8)
            .sort((a, b) => b.hsl[1] * Math.sqrt(b.n) - a.hsl[1] * Math.sqrt(a.n))[0];
          resolve(buildTheme(acc ? acc.hsl : [215, 0.6, 0.45], darkish.hsl));
        } catch (e) { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }
  const THEME_VARS = ['--accent', '--accent-ink', '--accent-soft', '--line-accent', '--paper', '--mast-bg'];
  async function applyTheme(ed) {
    const root = document.documentElement;
    THEME_VARS.forEach((v) => root.style.removeProperty(v));
    document.body.classList.remove('themed');
    root.style.removeProperty('--cover-url');
    document.body.classList.remove('has-banner');
    const banner = ed.art && ed.art.banner;
    if (!ed.cover && !ed.theme && !banner) return;
    let t = null;
    if (ed.theme && ed.theme.accent && ed.theme.mast) t = buildTheme(rgb2hsl(hex2rgb(ed.theme.accent)), rgb2hsl(hex2rgb(ed.theme.mast)));
    const srcImg = ed.cover ? ed.cover.src : banner;
    const key = `sp_theme_v1_${ed.date}_${srcImg || ''}`;
    if (!t) { try { t = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { t = null; } }
    if (!t && srcImg) { t = await themeFromImage(srcImg); try { if (t) localStorage.setItem(key, JSON.stringify(t)); } catch (e) { /* 저장 못 해도 괜찮다 */ } }
    if (!t || state.date !== ed.date) return;
    const vars = matchMedia('(prefers-color-scheme: dark)').matches ? t.dark : t.light;
    Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
    const backdrop = banner || (ed.cover && ed.cover.src);
    // CSS 파일(assets/) 기준으로 풀리지 않게 절대 주소로
    if (backdrop) root.style.setProperty('--cover-url', `url("${new URL(backdrop, location.href).href}")`);
    if (banner) document.body.classList.add('has-banner');
    document.body.classList.add('themed');
  }

  /* ---------- 제호, 탭 ---------- */
  function renderChrome(ed, avail) {
    applyTheme(ed);
    el.banner.hidden = !ed.sample;
    el.date.textContent = fmtLong(ed.date);
    el.issue.textContent = `제${ed.issue}호 · ${ed.published || '07:00'} 발행${ed.updated ? ` · ${ed.updated}` : ''}${state.full ? ' · 전체판' : ''}`;
    el.owner.hidden = !ownerKey();
    el.ownerText.textContent = state.keyError
      ? '이 기기에 저장된 열쇠로 전체판을 열지 못해 공유판을 보여드려요.'
      : (state.full ? '이 기기에서는 전체판(선생님 전용)을 보고 있어요.' : '이 날짜에는 전체판이 따로 없어요.');
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
    const html = { column: columnPage, hot: hotPage, macro: macroPage, company: companyPage, earnings: earningsPage, social: socialPage, social2: social2Page, picks: picksPage, weekly: weeklyPage }[state.tab](ed);
    el.content.innerHTML = html;
  }

  function hotN(ed) {
    const total = ed.hot.length;
    const want = state.hotN || 7;
    return Math.max(Math.min(want, total), Math.min(3, total));
  }

  // 총평: 편집장 칼럼 — 위에 핵심 카드 3장, 아래 풀어 쓴 글 (2026-11-18)
  function columnPage(ed) {
    const c = ed.column;
    const TONE = { up: '좋은 쪽', down: '조심', flat: '중립' };
    const cards = (c.cards || []).map((x, i) => `
      <article class="panel col-card t-${esc(x.tone)}">
        <span class="col-no">${i + 1}</span>
        <span class="kicker">${esc(x.tag)}${x.tone ? ` · ${TONE[x.tone] || ''}` : ''}</span>
        <h3 class="col-card-title">${esc(x.title)}</h3>
        ${x.num ? `<strong class="col-num ${changeClass(x.num)}">${esc(x.num)}</strong>` : ''}
        <p>${esc(x.text)}</p>
      </article>`).join('');
    const secs = (c.sections || []).map((x) => `
      <section class="col-sec">${x.h ? `<h3>${esc(x.h)}</h3>` : ''}${x.body.map((p) => `<p>${esc(p)}</p>`).join('')}</section>`).join('');
    const acts = (c.actions || []).length ? `
      <section class="panel col-acts"><h3>오늘 투자자가 점검할 것</h3>
        <ol>${c.actions.map((a) => `<li>${a.if ? `<span class="col-if">${esc(a.if)}</span>` : ''}<span>${esc(a.then)}</span></li>`).join('')}</ol>
        <p class="small muted" style="margin:6px 0 0">편집장의 판단을 정리한 것이며 매매를 권하는 글이 아닙니다. 결정은 각자의 상황에 맞게.</p></section>` : '';
    return `
      <article class="column">
        <header class="col-head">
          <span class="kicker">편집장 총평${c.board ? ` · 참고: Seoks 현황판 ${esc(c.board)}` : ''}</span>
          <h2 class="col-title">${esc(c.title)}</h2>
          ${c.standfirst ? `<p class="col-stand">${esc(c.standfirst)}</p>` : ''}
          <span class="small muted">${esc(c.byline || '편집장')}</span>
        </header>
        <div class="col-cards">${cards}</div>
        ${(c.signals || []).length || (c.noise || []).length ? `
        <section class="col-sn">
          <div class="panel col-sig"><h3>신호 — 중요하게 볼 것</h3><ul>${(c.signals || []).map((x) => `<li><strong>${esc(x.what)}</strong>${x.why ? `<span>${esc(x.why)}</span>` : ''}</li>`).join('')}</ul></div>
          <div class="panel col-noise"><h3>소음 — 흘려들을 것</h3><ul>${(c.noise || []).map((x) => `<li><strong>${esc(x.what)}</strong>${x.why ? `<span>${esc(x.why)}</span>` : ''}</li>`).join('')}</ul></div>
        </section>` : ''}
        <div class="panel col-body">${secs}</div>
        ${acts}
      </article>`;
  }

  function hotPage(ed) {
    const n = hotN(ed);
    const total = ed.hot.length;
    const cv = ed.cover;
    return `
      <div class="hot-top${cv ? ' has-cover' : ''}">
      ${cv ? `<figure class="cover"><a href="${esc(cv.src)}" target="_blank" rel="noopener"><img src="${esc(cv.src)}" alt="오늘의 표지: ${esc(cv.alt || '')}" loading="eager"></a>${state.full && cv.why ? `<figcaption class="small muted">${esc(cv.by)} 시안 채택 · ${esc(cv.why)}</figcaption>` : ''}</figure>` : ''}
      <section class="panel lead-panel">
        <div><span class="kicker">오늘의 한 줄</span><p class="lead-text">${esc(ed.lead)}</p></div>
      </section>
      ${total > 3 ? `<section class="count-bar" aria-label="기사 수 조절">
        <label for="hotN"><strong>기사 수</strong> <span class="num" id="hotNVal">${n}</span>개</label>
        <input type="range" id="hotN" min="${Math.min(3, total)}" max="${total}" step="1" value="${n}" aria-valuetext="${n}개">
        <span class="small muted">최대 ${total}개</span>
      </section>` : ''}
      </div>
      <div class="section-head"><h2 class="section-title">핫이슈 TOP <span id="hotNTitle">${n}</span></h2><p class="section-note">누르면 자세히</p></div>
      <div class="cards hot-cards">${ed.hot.map((h, i) => `
        <button type="button" class="card" data-open="${esc(h.id)}" data-rank="${i + 1}"${i + 1 > n ? ' hidden' : ''}>
          <span class="rank${i < 3 ? ' top' : ''}">${i + 1}</span>
          <span class="card-body">
            <span class="card-title">${esc(h.title)}</span>
            ${keyStrip(h)}
            <span class="card-text">${esc(h.summary)}</span>
            ${cardChart(h)}
            <span class="card-meta">
              ${tickers(h.tickers)}${badge(h.confidence)}${paidChip(h)}<span class="more">자세히 ›</span>
            </span>
          </span>
        </button>`).join('')}
      </div>`;
  }

  function editorBox(text, title = '편집장 총평') {
    return text ? `<section class="panel editor-box"><span class="kicker">${esc(title)}</span><p>${esc(text)}</p></section>` : '';
  }
  // 분기별 막대(매출·EPS) — 값이 음수면 아래로
  function qBars(qs, key, label, fmt) {
    const pts = (qs || []).filter((x) => x[key] !== undefined && x[key] !== null);
    if (pts.length < 2) return '';
    const W = 150, H = 54, pad = 2, bw = Math.floor((W - pad * 2) / pts.length) - 4;
    const vals = pts.map((x) => x[key]);
    const max = Math.max(...vals, 0), min = Math.min(...vals, 0), span = (max - min) || 1;
    const zero = H - 14 - ((0 - min) / span) * (H - 18);
    const bars = pts.map((x, i) => {
      const v = x[key], h = Math.max(1, Math.abs(v) / span * (H - 18));
      const y = v >= 0 ? zero - h : zero;
      const xx = pad + i * (bw + 4);
      return `<rect x="${xx}" y="${y.toFixed(1)}" width="${bw}" height="${h.toFixed(1)}" rx="2" class="${i === pts.length - 1 ? 'qb last' : 'qb'}${v < 0 ? ' neg' : ''}"><title>${esc(x.q)} ${esc(fmt(v))}</title></rect>`
        + `<text x="${xx + bw / 2}" y="${H - 2}" text-anchor="middle" class="qlab">${esc(x.q)}</text>`;
    }).join('');
    const last = pts[pts.length - 1];
    return `<span class="qchart"><span class="small muted">${esc(label)} <strong>${esc(fmt(last[key]))}</strong> <span class="muted">(${esc(last.q)})</span></span><svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="${esc(label)} 최근 ${pts.length}분기">${bars}</svg></span>`;
  }
  const fmtRev = (v) => (Math.abs(v) >= 100 ? `${(v / 100).toLocaleString('ko-KR', { maximumFractionDigits: v >= 10000 ? 0 : 1 })}억$` : `${v.toLocaleString('ko-KR')}백만$`);
  const fmtEps = (v) => `${v.toFixed(2)}$`;

  function macroPage(ed) {
    const m = ed.macro;
    return `
      ${editorBox(m.editorial)}
      <div class="section-head"><h2 class="section-title">매크로 환경 ${m.items.length}가지</h2></div>
      <section class="indicators" aria-label="주요 지표">${m.indicators.map((x) => `
        <div class="indicator"><span class="small muted">${esc(x.label)}</span><strong>${esc(x.value)}</strong><span class="small ${changeClass(x.change)}">${esc(x.change)}</span></div>`).join('')}
      </section>
      <div class="cards">${m.items.map((x, i) => `
        <button type="button" class="card no-rank" data-open="${esc(x.id)}">
          <span class="card-body">
            <span class="card-meta"><span class="rank top" style="font-size:20px">${i + 1}</span><span class="chip">${esc(x.category)}</span>${badge(x.confidence)}</span>
            <span class="card-title">${esc(x.title)}</span>
            ${keyStrip(x)}
            <span class="card-text">${esc(x.now)}</span>
            ${cardChart(x)}
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
      <div class="company-wrap"><div class="company-side">
      <div class="section-head"><h2 class="section-title">많이 언급된 기업</h2><p class="section-note">지난 24시간 언급 횟수</p></div>
      <section class="panel" style="display:flex;flex-direction:column;gap:12px">
        <div class="legend"><span><i style="background:var(--accent)"></i>텔레그램</span><span><i class="xkey" style="background:#9DB4F0"></i>X</span></div>
        <div class="rank-list">${c.ranking.map((r) => `
          <div class="rank-row"><span class="name">${esc(r.name)}</span>
            <span class="stack" role="img" aria-label="${esc(r.name)} 텔레그램 ${r.telegram}회, X ${r.x}회"><i class="tg" style="width:${r.telegram / max * 100}%"></i><i class="x" style="width:${r.x / max * 100}%"></i></span>
            <strong class="num" style="text-align:right">${r.telegram + r.x}</strong></div>`).join('')}
        </div>
      </section></div>
      <div class="cards company-cards big">${c.cards.map((x) => {
        const d = x.detail || {};
        const nums = (d.numbers || []).filter((n) => ['주가', '시가총액', '선행 PER', '52주 고점 대비', '연초 이후', '다음 실적'].includes(n.label));
        const grid = nums.length ? nums : [{ label: '주가', value: x.metrics.price }, { label: '등락', value: x.metrics.change }, { label: '다음 실적', value: x.metrics.earnings }];
        return `
        <button type="button" class="card no-rank company-card" data-open="${esc(x.id)}">
          <span class="card-body">
            <span class="card-meta"><span class="card-title" style="font-size:20px">${esc(x.name)}</span><span class="ticker">${esc(x.ticker)}</span><span class="small muted">언급 ${x.telegram + x.x}회</span></span>
            ${x.headline ? `<span class="company-head">${esc(x.headline)}</span>` : ''}
            <span class="metric-grid six">${grid.map((n) => `<span class="metric"><span>${esc(n.label)}</span><strong class="${changeClass(n.value)}">${esc(n.value)}</strong></span>`).join('')}</span>
            ${keyStrip(x, 4)}
            <span class="card-text">${esc(x.what)}</span>
            ${d.summary && d.summary.length ? `<ul class="pick-sum">${d.summary.slice(0, 3).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}
            <span class="card-meta"><span class="more">기사와 수치 보기 ›</span></span>
          </span>
        </button>`;
      }).join('')}
      </div></div>`;
  }

  function earningsPage(ed) {
    const e = ed.earnings;
    const st = e.stats || {};
    const RES = { beat: '컨센 상회', mixed: '일부 하회', miss: '컨센 하회' };
    const rows = (e.reported || []).map((r) => `
      <article class="panel earn-card ${esc(r.result || '')}">
        <div class="card-meta"><strong style="font-size:16.5px">${esc(r.name)}</strong><span class="ticker">${esc(r.ticker)}</span><span class="res-badge">${esc(RES[r.result] || '')}</span></div>
        <span class="small muted">${esc(r.sector || '')}${r.marketCap ? ` · ${esc(r.marketCap)}` : ''} · ${esc(r.date || '')} ${esc(r.time || '')}</span>
        <div class="earn-nums">
          <span><span class="small muted">EPS vs 컨센</span><strong class="${changeClass(r.epsSurprise)}">${esc(r.epsSurprise || '—')}</strong></span>
          <span><span class="small muted">매출 vs 컨센</span><strong class="${changeClass(r.revSurprise)}">${esc(r.revSurprise || '—')}</strong></span>
          <span><span class="small muted">주가</span><strong class="${changeClass(r.change)}">${esc(r.change || '—')}</strong>${r.perfWeek ? `<span class="small ${changeClass(r.perfWeek)}">1주 ${esc(r.perfWeek)}</span>` : ''}</span>
        </div>
        ${r.epsGrowth || r.salesGrowth ? `<span class="small">전년 대비 ${r.epsGrowth ? `EPS <b class="${changeClass(r.epsGrowth)}">${esc(r.epsGrowth)}</b>` : ''} ${r.salesGrowth ? `· 매출 <b class="${changeClass(r.salesGrowth)}">${esc(r.salesGrowth)}</b>` : ''}</span>` : ''}
        ${r.quarters ? `<div class="qcharts">${qBars(r.quarters, 'rev', '분기 매출', fmtRev)}${qBars(r.quarters, 'eps', '분기 EPS', fmtEps)}</div>` : ''}
        ${r.note ? `<p class="small" style="margin:0">${esc(r.note)}</p>` : ''}
      </article>`).join('');
    const up = (e.upcoming || []).map((r) => `<tr><th scope="row" style="width:110px">${esc(r.date)}${r.time ? ` <span class="small muted">${esc(r.time)}</span>` : ''}</th><td style="text-align:left"><strong>${esc(r.name)}</strong> <span class="ticker">${esc(r.ticker)}</span></td><td class="small muted">${esc(r.marketCap || '')}</td><td class="small">${r.epsEst ? `EPS 컨센 ${esc(r.epsEst)}` : ''}</td><td style="text-align:left" class="small">${esc(r.note || '')}</td></tr>`).join('');
    return `
      <section class="panel lead-panel">
        <div><span class="kicker">S&amp;P 500 실적 · ${esc(e.range || '')}</span><p class="lead-text">${esc(e.lead || '최근 발표한 S&P 500 기업의 실적을 시장 예상치(컨센서스)와 비교했습니다.')}</p></div>
        <div class="stats">
          <div class="stat"><strong>${esc(st.count ?? (e.reported || []).length)}</strong><span>발표 기업</span></div>
          <div class="stat"><strong>${esc(st.epsBeat ?? '—')}</strong><span>EPS 예상 상회</span></div>
          <div class="stat"><strong>${esc(st.revBeat ?? '—')}</strong><span>매출 예상 상회</span></div>
        </div>
      </section>
      <div class="earn-wrap${e.calendar && e.calendar.length ? ' solo' : ''}"><div>
      <div class="section-head"><h2 class="section-title">발표한 기업</h2><p class="section-note">서프라이즈 = 실제치가 컨센서스보다 높거나 낮은 정도</p></div>
      <div class="earn-cards">${rows || '<section class="panel"><p class="muted" style="margin:0">이 기간에 발표한 기업이 없어요.</p></section>'}</div>
      <span class="small muted">실적·서프라이즈 Finviz, 분기 매출·EPS 그래프는 회사 공시 기준(야후 파이낸스) · 카드 색: 컨센 하회는 파랑, 일부 하회는 노랑</span></div>
      ${up && !(e.calendar && e.calendar.length) ? `<div><div class="section-head"><h2 class="section-title">다음 발표 예정</h2></div>
      <section class="panel"><div class="table-box"><table><tbody>${up}</tbody></table></div></section></div>` : ''}</div>
      ${e.calendar && e.calendar.length ? earningsCalendar(e.calendar) : ''}`;
  }

  // 실적 달력: 날짜별 발표 예정 기업 — 이번 분기 컨센서스, 직전 분기 실제치·컨센서스 (2026-11-17 제3호부터)
  function earningsCalendar(days) {
    const SHOW = 8;
    const pair = (o) => {
      if (!o) return '';
      const main = o.act ? `<strong>${esc(o.act)}</strong>` : '';
      const est = o.est ? `<span class="muted">컨센 ${esc(o.est)}${o.derived ? '<sup title="실제치와 서프라이즈 비율로 거꾸로 계산">역산</sup>' : ''}</span>` : '';
      const sp = o.surprise ? `<b class="${changeClass(o.surprise)}">${esc(o.surprise)}</b>` : '';
      return [main, est, sp].filter(Boolean).join(' ');
    };
    const item = (x) => {
      const n = x.next || {};
      const l = x.last || {};
      const last = (l.rev && Object.keys(l.rev).length) || (l.eps && Object.keys(l.eps).length);
      return `<li class="ecal-item">
        <div class="ecal-top"><span><strong>${esc(x.name)}</strong> <span class="ticker">${esc(x.ticker)}</span></span>
          <span class="ecal-when">${x.session ? `<span class="chip">${esc(x.session)}</span>` : ''}${x.kst ? `<span class="small muted">${esc(x.kst)}</span>` : ''}</span></div>
        ${x.marketCap ? `<span class="small muted">시가총액 ${esc(x.marketCap)}</span>` : ''}
        <div class="ecal-cons"><span class="small muted">이번 분기 컨센서스${n.quarter ? ` · ${esc(n.quarter)}` : ''}</span>
          <span class="ecal-big"><span>매출 <strong>${esc(n.rev || '—')}</strong></span><span>EPS <strong>${esc(n.eps || '—')}</strong></span></span></div>
        ${last ? `<dl class="ecal-nums"><dt>${(l.rev && l.rev.act) || (l.eps && l.eps.act) ? '직전 분기 실제' : '직전 분기 서프라이즈(컨센 대비)'}${l.quarter ? `<span class="small muted"> · ${esc(l.quarter)}</span>` : ''}</dt>
          <dd class="ecal-last">${l.rev ? `<span>매출 ${pair(l.rev)}</span>` : ''}${l.eps ? `<span>EPS ${pair(l.eps)}</span>` : ''}</dd></dl>` : ''}
      </li>`;
    };
    const day = (d) => {
      const first = d.items.slice(0, SHOW).map(item).join('');
      const more = d.items.length > SHOW ? `<details class="ecal-more"><summary>${d.items.length - SHOW}곳 더 보기</summary><ul class="ecal-list">${d.items.slice(SHOW).map(item).join('')}</ul></details>` : '';
      return `<section class="ecal-day"><h3 class="ecal-date">${esc(d.date)} <span>(${esc(d.dow)})</span><span class="small muted">${d.items.length}곳</span></h3>
        <ul class="ecal-list">${first}</ul>${more}</section>`;
    };
    return `<div class="section-head"><h2 class="section-title">다음 발표 예정 · 실적 달력</h2>
        <p class="section-note">날짜는 미국 발표일, 옆에 한국 시각. 서프라이즈 = 실제치가 컨센서스보다 높거나 낮은 정도</p></div>
      <div class="ecal">${days.map(day).join('')}</div>`;
  }

  function socialPage(ed) {
    const s = ed.social;
    const d = s.debate;
    return `
      <section class="notice"><p>사실보다 사람들의 해석과 가설을 모은 면입니다. 확인되지 않은 내용이 섞여 있어 표시를 붙였습니다.</p>
        <div class="card-meta">${badge('confirmed')}${badge('partial')}${badge('rumor')}</div></section>
      <div class="section-head"><h2 class="section-title">오늘의 논쟁</h2></div>
      <section class="panel debate">
        <button type="button" class="card no-rank" data-open="${esc(d.id)}" style="border:0;padding:0">
          <span class="card-body"><span class="card-title" style="font-size:22px">${esc(d.title)}</span>
          ${keyStrip(d)}
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
      <div class="section-head"><h2 class="section-title">그 밖의 화제</h2></div>
      <div class="cards">${s.buzz.map((b) => `
        <button type="button" class="card no-rank" data-open="${esc(b.id)}">
          <span class="card-body">
            <span class="card-meta"><span class="small" style="font-weight:600">${esc(b.where)}</span><span style="margin-left:auto">${badge(b.confidence)}</span></span>
            <span class="card-title" style="font-size:16.5px">${esc(b.title)}</span>
            ${keyStrip(b)}
            <span class="card-text">${esc(b.note)}</span>
            ${cardChart(b)}
            ${b.basis && !(b.key || []).length ? `<span class="basis"><b>근거</b>${esc(b.basis)}</span>` : ''}
          </span>
        </button>`).join('')}
      </div>`;
  }

  /* SNS2: 유튜브·블로그 (그리고 GPT·Gemini 조사원이 찾은 SNS 이야기) */
  function social2Page(ed) {
    const s = ed.social || {};
    const blog = s.blogs || [];
    const ext = s.external || [];
    const yt = youtubeBlock(s.youtube);
    const cur = s.curated || [];
    const cu = cur.length ? `<div class="section-head"><h2 class="section-title">선생님이 고른 글</h2><p class="section-note">Seeking Alpha·블로그 등 · 누르면 자세히</p></div>
      <div class="cards">${cur.map((c) => `
        <button type="button" class="card no-rank" data-open="${esc(c.id)}">
          <span class="card-body">
            <span class="card-meta"><span class="small" style="font-weight:700">${esc(c.source || '')}</span>${c.date ? `<span class="small muted">${esc(c.date)}</span>` : ''}${paidChip(c)}</span>
            <span class="card-title" style="font-size:16.5px">${esc(c.title)}</span>
            ${keyStrip(c)}
            <span class="card-text">${esc(c.summary)}</span>
            ${cardChart(c)}
            <span class="card-meta"><span class="more">자세히 ›</span></span>
          </span>
        </button>`).join('')}</div>` : '';
    const bl = blog.length ? `<div class="section-head"><h2 class="section-title">블로그에서 읽을 만한 글</h2><p class="section-note">요약 · 원문 링크</p></div>
      <div class="yt-list">${blog.map((b) => `
        <article class="panel yt">
          <div class="card-meta"><span class="small" style="font-weight:700">${esc(b.blog || '네이버 블로그')}</span>${b.date ? `<span class="small muted">${esc(b.date)}</span>` : ''}</div>
          <a class="yt-title" href="${esc(b.url)}" target="_blank" rel="noopener">${esc(b.title)} ↗</a>
          ${keyStrip(b)}
          <p class="yt-gist">${esc(b.gist || '')}</p>
          ${b.points && b.points.length ? `<ul class="yt-points">${b.points.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
        </article>`).join('')}</div>` : '';
    const ex = ext.length ? `<div class="section-head"><h2 class="section-title">다른 곳에서 본 이야기</h2><p class="section-note">레딧·X·해외 커뮤니티 등</p></div>
      <div class="yt-list">${ext.map((b) => `
        <article class="panel yt">
          <div class="card-meta"><span class="small" style="font-weight:700">${esc(b.where || '')}</span>${badge(b.confidence)}</div>
          <span class="yt-title">${esc(b.title)}</span>
          ${keyStrip(b)}
          <p class="yt-gist">${esc(b.note || '')}</p>
          ${(b.links || []).map((l) => `<a class="small" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.name)} ↗</a>`).join(' ')}
        </article>`).join('')}</div>` : '';
    if (!cu && !yt && !bl && !ex) return `<section class="panel"><p style="margin:0">이번 호에는 유튜브·블로그 요약이 없습니다.</p></section>`;
    return `${editorBox(s.editorial2)}${cu}${yt}${bl}${ex}`;
  }

  /* 리포트: 카리스석스 방에 올린 PDF 중 최대 2개 요약 */
  function reportLink(r) {
    return '';   // 원문은 싣지 않는다(저작권, 선생님 지시 2026-11-18)
    if (r.link) return `<a class="link-row" href="${esc(r.link)}" target="_blank" rel="noopener"><span><strong>원문 PDF 보기</strong><br><span class="small muted">${esc(r.file || '')}</span></span><span class="go">열기 ↗</span></a>`;
    return r.file ? `<div class="link-row"><span><strong>원문 PDF</strong><br><span class="small muted">${esc(r.file)}${state.full && r.folder ? ` · ${esc(r.folder)}` : ''}</span></span></div>` : '';
  }
  // 함께 읽기: 영어 기사는 [원문] [국문] 버튼 — 국문은 Claude(Sonnet)가 원문을 읽고 한국어로 정리한 내용을 펼친다
  function isForeign(r) {
    if (r.lang) return r.lang !== 'ko';
    const t = `${r.title || ''}`;
    return !/[가-힣]/.test(t) && /[A-Za-z]{3,}/.test(t);
  }
  function koPanel(k) {
    const pts = (k.points || []).map((x) => `<li>${esc(x)}</li>`).join('');
    const nums = (k.numbers || []).map((n) => `<li><span class="muted">${esc(n.label)}</span> <strong>${esc(n.value)}</strong></li>`).join('');
    const text = (k.text || []).map((x) => `<p>${esc(x)}</p>`).join('');
    return `<div class="rel-ko" hidden>${k.gist ? `<p class="rel-gist">${esc(k.gist)}</p>` : ''}${text}${pts ? `<ul>${pts}</ul>` : ''}${nums ? `<ul class="rel-nums">${nums}</ul>` : ''}`
      + `<span class="small muted">${k.mode === '전문 번역' ? '원문을 한국어로 옮긴 것' : '원문을 읽고 한국어로 정리한 내용'} · Claude</span></div>`;
  }
  function relatedRow(r) {
    if (!r.url) return '';
    if (!isForeign(r)) {
      return `<a class="link-row" href="${esc(r.url)}" target="_blank" rel="noopener"><span><span class="small muted">${esc(r.source)}</span><br><strong>${esc(r.title)}</strong><br><span class="small muted">${esc(r.note || '')}</span></span><span class="go">↗</span></a>`;
    }
    const tko = r.title_ko || (r.ko && r.ko.title_ko);
    const head = tko ? `<strong>${esc(tko)}</strong><br><span class="small muted">${esc(r.title)}</span>` : `<strong>${esc(r.title)}</strong>`;
    const koBtn = r.ko ? `<button type="button" class="rel-btn ko" data-relko>국문</button>` : '';
    return `<div class="rel-item"><div class="link-row rel-foreign"><span><span class="small muted">${esc(r.source)}</span><br>${head}${r.note ? `<br><span class="small muted">${esc(r.note)}</span>` : ''}</span>`
      + `<span class="rel-btns"><a class="rel-btn" href="${esc(r.url)}" target="_blank" rel="noopener">원문</a>${koBtn}</span></div>${r.ko ? koPanel(r.ko) : ''}</div>`;
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-relko]');
    if (!b) return;
    const panel = b.closest('.rel-item').querySelector('.rel-ko');
    panel.hidden = !panel.hidden;
    b.classList.toggle('on', !panel.hidden);
    b.textContent = panel.hidden ? '국문' : '접기';
  });

  function reportBlock(it) {
    const r = it.report;
    const lab = r.series_label || (r.series === '소몽' ? '소몽' : '');
    const rows = (lab ? [['자료', lab], ['발행일', r.date], ['분량', r.pages ? `${r.pages}쪽` : '']] : [['발행', r.publisher], ['작성', r.author], ['발행일', r.date], ['분량', r.pages ? `${r.pages}쪽` : '']]).filter((x) => x[1]);
    return `<section class="d-block span-all report-head"><div class="report-meta">${rows.map((x) => `<span><span class="muted">${esc(x[0])}</span> ${esc(x[1])}</span>`).join('')}</div>${reportLink(r)}</section>`;
  }
  function picksPage(ed) {
    const ps = ed.picks || [];
    const weekly = ps.some((p) => p.report && p.report.series === '소몽');
    const head = `<div class="section-head"><h2 class="section-title">${weekly ? '이번 주를 정리한 리포트' : '이번 호의 리포트'}</h2><p class="section-note">${weekly ? '월요일 · 소몽 주간 정리, 자세한 요약' : '하루 1~2개, 자세한 요약'}</p></div>`;
    if (!ps.length) return `${head}<section class="panel empty-picks"><p style="margin:0">이번 호에 정리한 리포트가 없습니다.</p></section>`;
    return `${head}<div class="picks">${ps.map((x) => `
      <article class="panel pick">
        <button type="button" class="card no-rank" data-open="${esc(x.id)}" style="border:0;padding:0;background:none">
          <span class="card-body">
            <span class="card-meta"><span class="chip">${esc((x.report || {}).publisher || 'PDF')}</span>${(x.report || {}).date ? `<span class="small muted">${esc(x.report.date)}</span>` : ''}${tickers(x.tickers)}</span>
            <span class="card-title" style="font-size:20px">${esc(x.title)}</span>
            ${keyStrip(x, 4)}
            ${(x.detail || {}).thesis ? `<span class="thesis"><b>이 리포트가 말하는 것</b>${esc(x.detail.thesis)}</span>` : `<span class="card-text">${esc(x.summary)}</span>`}
            ${(x.detail || {}).claims ? `<ol class="pick-claims">${x.detail.claims.slice(0, 4).map((c) => `<li>${esc(c.claim || c)}</li>`).join('')}</ol>` : ((x.detail || {}).summary ? `<ul class="pick-sum">${x.detail.summary.slice(0, 3).map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : '')}
            ${cardChart(x)}
            <span class="card-meta"><span class="more">전체 요약과 수치 보기 ›</span></span>
          </span>
        </button>
        ${reportLink(x.report || {})}
      </article>`).join('')}</div>`;
  }

  function youtubeBlock(list) {
    if (!list || !list.length) return '';
    return `<div class="section-head"><h2 class="section-title"><span class="yt-mark" aria-hidden="true">▶</span> 유튜브에서 많이 본 영상</h2><p class="section-note">지난 24시간 조회수 상위 · 영상 요약과 볼 점</p></div>
      <div class="yt-list">${list.map((v) => `
        <article class="panel yt">
          <div class="card-meta"><span class="small" style="font-weight:700">${esc(v.channel)}</span><span class="small muted">조회 ${Number(v.views).toLocaleString('ko-KR')}</span>${v.stance ? `<span class="chip">${esc(v.stance)}</span>` : ''}</div>
          <a class="yt-title" href="${esc(v.url)}" target="_blank" rel="noopener">${esc(v.title)} ↗</a>
          <p class="yt-gist">${esc(v.gist)}</p>
          ${v.facts && v.facts.length ? `<ul class="yt-points">${v.facts.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
          ${v.meaning ? `<div class="yt-meaning"><b>이 영상에서 볼 것</b><p>${esc(v.meaning)}</p></div>` : ''}
          <a class="rel-btn yt-go" href="${esc(v.url)}" target="_blank" rel="noopener">영상 보기 ↗</a>
          ${v.tickers && v.tickers.length ? `<div class="card-meta">${tickers(v.tickers)}</div>` : ''}
        </article>`).join('')}
      </div>`;
  }

  /* 주간 스크리닝: 매수 관심 후보 10 · 매도 검토 후보 10 (차트 + 한 줄 이유) */
  /* 스크리닝 2판: 단계·이평 배열·추세 템플릿·RS·섹터 칩과 패턴 줄 */
  function taChips(x) {
    const t = x.ta, s = x.sector_info || {};
    const chip = (txt, cls) => `<span class="chip ${cls || ''}">${esc(txt)}</span>`;
    const stageCls = { 2: 'up', 4: 'down' }[t.stage] || '';
    return `<span class="ta-chips">${chip(t.stage_ko, stageCls)}${chip(t.align)}${chip(`추세 템플릿 ${t.template}/8`)}${chip(`RS ${x.rs_rating ?? '-'}`)}${s.ko ? chip(`${s.ko} ${s.label || ''}`, s.label === '주도' || s.label === '강세' ? 'up' : s.label === '약세' ? 'down' : '') : ''}</span>`;
  }
  function taPatterns(t) {
    const ps = t.patterns || [];
    const ma = t.ma || {};
    const maLine = `<li><b>이동평균</b> 50일선 ${ma.dist50 > 0 ? '+' : ''}${esc(ma.dist50)}% · 200일선 ${ma.dist200 > 0 ? '+' : ''}${esc(ma.dist200)}%${ma.cross ? ` · ${esc(ma.cross.type)} ${esc(ma.cross.date)}` : ''}</li>`;
    const pl = ps.map((p) => `<li class="${p.dir === 'up' ? 'up' : p.dir === 'down' ? 'down' : ''}"><b>${esc(p.name)}</b> ${esc(p.status)}${p.when ? ` (${esc(p.when)})` : ''}${p.neckline != null ? ` · 기준선 ${esc(p.neckline)}` : ''}${p.target != null ? ` · 목표 ${esc(p.target)}` : ''}${p.invalid != null ? ` · 무효 ${esc(p.invalid)}` : ''}</li>`).join('');
    return `<ul class="ta-pats">${pl || '<li class="muted">뚜렷한 차트 패턴 없음</li>'}${maLine}</ul>`;
  }
  function sectorTable(secs) {
    if (!secs || !secs.length) return '';
    const cls = (l) => (l === '주도' || l === '강세' ? 'up' : l === '약세' ? 'down' : '');
    const f = (v) => (v == null ? '-' : `${v > 0 ? '+' : ''}${v}%p`);
    return `<section class="panel"><h3 class="section-title" style="font-size:18px">섹터 흐름 (S&P 500 대비)</h3>
      <div class="table-box"><table><thead><tr><th scope="col">순위</th><th scope="col" style="text-align:left">섹터</th><th scope="col">1개월</th><th scope="col">3개월</th><th scope="col">6개월</th><th scope="col" style="text-align:left">추세</th></tr></thead>
      <tbody>${secs.map((s) => `<tr><td>${esc(s.rank)}</td><th scope="row" style="text-align:left">${esc(s.ko)} <span class="chip ${cls(s.label)}">${esc(s.label)}</span> <span class="small muted">${esc(s.etf)}</span></th><td class="${changeClass(f(s.vs_spy_1m))}">${f(s.vs_spy_1m)}</td><td class="${changeClass(f(s.vs_spy_3m))}">${f(s.vs_spy_3m)}</td><td class="${changeClass(f(s.vs_spy_6m))}">${f(s.vs_spy_6m)}</td><td style="text-align:left">${esc(s.stage_ko || '')}</td></tr>`).join('')}</tbody></table></div></section>`;
  }

  function screenBlock(sc) {
    if (!sc) return '';
    const card = (x, side) => `
      <article class="panel scr ${side}">
        <div class="card-meta"><span class="ticker">${esc(x.ticker)}</span><strong>${esc(x.company || '')}</strong><span class="small muted">${esc(x.sector || '')}</span></div>
        <span class="keynums">
          <span class="kn"><strong>${esc(x.price)}</strong><span>주가</span></span>
          <span class="kn"><strong class="${changeClass(x.perf_half)}">${esc(x.perf_half || '-')}</strong><span>6개월</span></span>
          <span class="kn"><strong>${esc(x.fpe || '-')}</strong><span>선행 PER</span></span>
          <span class="kn"><strong class="${changeClass(x.eps_next_y)}">${esc(x.eps_next_y || '-')}</strong><span>내년 EPS 성장</span></span>
        </span>
        ${x.ta ? taChips(x) : ''}
        ${x.chart ? miniChart(x.chart, !x.ta) : ''}
        ${x.ta ? taPatterns(x.ta) : ''}
        <p class="yt-gist">${esc(x.why || '')}</p>
        ${x.ta && (x.ta.signals || []).length ? `<details class="ta-more"><summary>기술적 분석 자세히</summary><ul>${x.ta.signals.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></details>` : ''}
        <span class="small muted">펀더멘털 ${Math.round((x.F || 0) * 100)} · ${x.ta ? `기술 ${Math.round(((side === 'buy' ? x.Tb : x.Tr) || 0) * 100)} · 섹터 ${Math.round((x.Ss || 0) * 100)}` : `차트 ${Math.round((x.C || 0) * 100)}`} · 고점 대비 ${esc(x.from_high || '-')} · RSI ${esc(x.rsi ?? '-')}</span>
        <span class="small"><a href="https://finviz.com/quote.ashx?t=${encodeURIComponent(x.ticker)}" target="_blank" rel="noopener">Finviz 차트 ↗</a> · <a href="https://seekingalpha.com/symbol/${encodeURIComponent(x.ticker)}" target="_blank" rel="noopener">Seeking Alpha ↗</a></span>
      </article>`;
    return `<div class="section-head"><h2 class="section-title">이번 주 스크리닝</h2><p class="section-note">${esc(sc.method || '')}</p></div>
      <section class="notice"><p style="margin:0">${sc.version >= 2 ? '규칙(펀더멘털·기술적 분석·섹터 강도)으로 후보를 추린 뒤 편집장이 차트를 직접 보고 고른 종목입니다.' : '규칙에 따라 기계적으로 고른 후보입니다.'} 투자 권유가 아니며, 판단 전에 직접 확인하세요.</p></section>
      ${sectorTable(sc.sectors)}
      <h3 class="scr-h up">매수 관심 후보 ${(sc.buy || []).length}</h3><div class="scr-grid">${(sc.buy || []).map((x) => card(x, 'buy')).join('')}</div>
      <h3 class="scr-h down">매도 검토 후보 ${(sc.sell || []).length}</h3><div class="scr-grid">${(sc.sell || []).map((x) => card(x, 'sell')).join('')}</div>`;
  }

  function weeklyPage(ed) {
    const w = Object.assign({ top: [], macro: [], companies: [], next: [] }, ed.weekly);
    return `
      <section class="panel weekly-head lead-panel">
        <div><span class="kicker">주간 특보 · ${esc(w.range)}</span><p class="lead-text">${esc(w.oneLine)}</p></div>
        <div class="stats">
          <div class="stat"><strong>${esc(w.issues)}</strong><span>묶은 일간 호</span></div>
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
      </section>
      ${screenBlock(w.screen)}`;
  }

  el.content.addEventListener('input', (e) => {
    if (e.target.id !== 'hotN') return;
    const n = parseInt(e.target.value, 10);
    state.hotN = n;
    try { localStorage.setItem(HOTN_STORE, String(n)); } catch (err) {}
    e.target.setAttribute('aria-valuetext', `${n}개`);
    const v = document.getElementById('hotNVal'); if (v) v.textContent = n;
    const t = document.getElementById('hotNTitle'); if (t) t.textContent = n;
    el.content.querySelectorAll('.card[data-rank]').forEach((c) => { c.hidden = Number(c.dataset.rank) > n; });
  });

  el.content.addEventListener('click', (e) => {
    const b = e.target.closest('[data-open]');
    if (b) { state.lastFocus = b; go(state.date, state.tab, b.dataset.open); }
  });

  /* ---------- 상세 보기 ---------- */
  function findItem(id) {
    const ed = state.edition;
    const pools = [ed.hot, ed.macro.items, ed.company.cards, ed.social.buzz, [ed.social.debate], ed.picks, (ed.social || {}).curated];
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

  /* 카드 요약용 핵심 수치 (최대 n개) */
  function keyStrip(it, n = 3) {
    const k = (it.key || []).slice(0, n);
    if (!k.length) return '';
    return `<span class="keynums">${k.map((x) => `<span class="kn"><strong class="${changeClass(x.value)}">${esc(x.value)}</strong><span>${esc(x.label)}</span></span>`).join('')}</span>`;
  }
  /* 카드용 작은 그래프: 상세의 첫 그래프를 줄여서 */
  function cardChart(it) {
    const c = ((it.detail || {}).charts || [])[0];
    if (!c) return '';
    return `<span class="card-chart"><span class="cc-title">${esc(c.title)}</span>${miniChart(c, true)}</span>`;
  }

  const VERDICT = { '일치': 'ok', '대체로 일치': 'ok', '일부 일치': 'one', '엇갈림': 'mixed', '단일 출처': 'no', '확인 안 됨': 'no' };

  /* 막대 그래프 (음수 지원). c = {type:'bar', unit, points:[{label, value}]} */
  function miniChart(c, compact) {
    const pts = (c.points || []).filter((p) => typeof p.value === 'number');
    if (!pts.length) return '';
    if (c.type === 'line') return lineChart(c, compact);
    const W = compact ? 320 : 480, H = compact ? 108 : 170, padL = 4, padR = 4, top = compact ? 16 : 22, bottom = compact ? 32 : 30;
    const maxV = Math.max(0, ...pts.map((p) => p.value)), minV = Math.min(0, ...pts.map((p) => p.value));
    const span = (maxV - minV) || 1;
    const y = (v) => top + (maxV - v) / span * (H - top - bottom);
    const bw = (W - padL - padR) / pts.length;
    const fmt = (v) => `${Math.abs(v) >= 1000 ? v.toLocaleString('ko-KR', { maximumFractionDigits: 0 }) : Number(v.toFixed(2)).toLocaleString('ko-KR')}${esc(c.unit || '')}`;
    const bars = pts.map((p, i) => {
      const x = padL + i * bw + bw * 0.15, w = bw * 0.7;
      const y0 = y(Math.max(0, p.value)), h = Math.max(1.5, Math.abs(y(p.value) - y(0)));
      const neg = p.value < 0;
      return `<rect class="b${neg ? ' neg' : ''}${p.hi ? ' max' : ''}" x="${x.toFixed(1)}" y="${y0.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="2"><title>${esc(p.label)} ${fmt(p.value)}</title></rect>
        <text x="${(x + w / 2).toFixed(1)}" y="${(neg ? y0 + h + 12 : y0 - 4).toFixed(1)}" text-anchor="middle">${fmt(p.value)}</text>
        <text x="${(x + w / 2).toFixed(1)}" y="${H - (compact ? 5 : 8)}" text-anchor="middle">${esc(p.label)}</text>`;
    }).join('');
    const zero = minV < 0 ? `<line x1="${padL}" x2="${W - padR}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}" class="zero"/>` : '';
    return `<svg class="chart mini${compact ? ' compact' : ''}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(c.title)}: ${pts.map((p) => `${esc(p.label)} ${fmt(p.value)}`).join(', ')}">${zero}${bars}</svg>`;
  }

  /* 선 그래프 (주가 흐름 등). c = {type:'line', points:[{label, value}], series2:[...] (선택, 예: 50일 이동평균)} */
  function lineChart(c, compact) {
    const pts = (c.points || []).filter((p) => typeof p.value === 'number');
    const s2 = (c.series2 || []).map((p) => (typeof p.value === 'number' ? p.value : null));
    const s3 = (c.series3 || []).map((p) => (typeof p.value === 'number' ? p.value : null));
    const lastV = pts.length ? pts[pts.length - 1].value : 0;
    const near = (v) => typeof v === 'number' && Math.abs(v / lastV - 1) <= 0.35;
    const lines = (c.lines || []).filter((l) => near(l.v1) && near(l.v2));
    const marks = (c.marks || []).filter((m) => near(m.v));
    const W = compact ? 320 : 480, H = compact ? 96 : (s3.length ? 200 : 160), pad = 6, bottom = compact ? 14 : 22;
    const all = pts.map((p) => p.value).concat(s2.filter((v) => v !== null), s3.filter((v) => v !== null), lines.flatMap((l) => [l.v1, l.v2]), marks.map((m) => m.v));
    const mx = Math.max(...all), mn = Math.min(...all), span = (mx - mn) || 1;
    const x = (i) => pad + i * (W - pad * 2) / Math.max(1, pts.length - 1);
    const y = (v) => pad + (mx - v) / span * (H - pad - bottom);
    const path = (vals) => vals.map((v, i) => (v === null ? '' : `${i && vals[i - 1] !== null ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)).join('');
    const first = pts[0].value, last = pts[pts.length - 1].value, up = last >= first;
    const lab = `<text x="${pad}" y="${H - 4}">${esc(pts[0].label)}</text><text x="${W - pad}" y="${H - 4}" text-anchor="end">${esc(pts[pts.length - 1].label)} ${Number(last.toFixed(2)).toLocaleString('ko-KR')}${esc(c.unit || '')}</text>`;
    const seg = lines.map((l) => `<line x1="${x(l.i1).toFixed(1)}" y1="${y(l.v1).toFixed(1)}" x2="${x(l.i2).toFixed(1)}" y2="${y(l.v2).toFixed(1)}" class="pl ${esc(l.kind || '')}"/>${l.label ? `<text class="pl-t" x="${x(l.i2).toFixed(1)}" y="${(y(l.v2) - 3).toFixed(1)}" text-anchor="end">${esc(l.label)}</text>` : ''}`).join('');
    const mk = marks.map((m) => `<circle cx="${x(m.i).toFixed(1)}" cy="${y(m.v).toFixed(1)}" r="2.2" class="pm"/><text class="pm-t" x="${x(m.i).toFixed(1)}" y="${(y(m.v) - 5).toFixed(1)}" text-anchor="middle">${esc(m.label)}</text>`).join('');
    const legend = s3.length ? `<text class="lg" x="${pad + 2}" y="${pad + 8}"><tspan class="lg2">— 50일선</tspan> <tspan class="lg3">— 200일선</tspan></text>` : '';
    return `<svg class="chart mini line${compact ? ' compact' : ''}${s3.length ? ' ta' : ''}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(c.title)}">${s3.length ? `<path d="${path(s3)}" class="ma2"/>` : ''}${s2.length ? `<path d="${path(s2)}" class="ma"/>` : ''}<path d="${path(pts.map((p) => p.value))}" class="ln ${up ? 'upl' : 'dnl'}"/>${seg}${mk}${legend}${lab}</svg>`;
  }

  function openDetail(id) {
    const it = findItem(id);
    if (!it) { closeDetail(true); return; }
    const d = it.detail || {};
    const ed = state.edition;
    const meta = [
      it.category ? `<span class="chip">${esc(it.category)}</span>` : '',
      it.where ? `<span class="chip">${esc(it.where)}</span>` : '',
      tickers(it.tickers || (it.ticker ? [it.ticker] : [])),
      badge(it.confidence),
      paidChip(it)
    ].join('');
    const blocks = [];
    if (it.paid && !state.full && it.paid.url) {
      blocks.push(`<section class="d-block paid-block"><h3>유료 구독 기사</h3><p>${esc(it.paid.source)}의 유료 기사라 공유판에는 요지와 원문 링크만 싣습니다. 전문은 구독 후 원문에서 읽을 수 있어요.</p>
        <a class="link-row" href="${esc(it.paid.url)}" target="_blank" rel="noopener"><span><strong>${esc(it.paid.title || it.title)}</strong><br><span class="small muted">${esc(it.paid.source)}</span></span><span class="go">원문 열기 ↗</span></a></section>`);
    } else if (it.paid && !state.full) {   // 유료 강의 자료처럼 공개 링크가 없는 것
      blocks.push(`<section class="d-block paid-block"><h3>유료 자료</h3><p>${esc(it.paid.source)}의 유료 자료라 공유판에는 요지만 싣습니다.</p></section>`);
    }
    if ((it.key || []).length && !(it.paid && !state.full)) blocks.push(`<section class="d-keys span-all" aria-label="핵심 수치">${it.key.map((x) => `<div class="dk"><strong class="${changeClass(x.value)}">${esc(x.value)}</strong><span>${esc(x.label)}</span></div>`).join('')}</section>`);
    if (it.report) blocks.push(reportBlock(it));
    if (d.thesis) blocks.push(`<section class="d-block span-all d-thesis"><h3>이 리포트가 말하고자 하는 것</h3><p>${esc(d.thesis)}</p></section>`);
    if (d.claims && d.claims.length) blocks.push(`<section class="d-block span-all"><h3>주장과 근거</h3><ol class="claims">${d.claims.map((c) => `<li><strong>${esc(c.claim || c)}</strong>${(c.evidence || []).length ? `<ul>${c.evidence.map((e2) => `<li>${esc(e2)}</li>`).join('')}</ul>` : ''}</li>`).join('')}</ol></section>`);
    if (d.meaning) blocks.push(`<section class="d-block span-all d-meaning"><h3>편집장이 본 의미</h3><p>${esc(d.meaning)}</p></section>`);
    if (d.summary) blocks.push(`<section class="d-block"><h3>핵심 요약</h3><ul>${d.summary.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></section>`);
    if (d.article && d.article.length) blocks.push(`<section class="d-block span-all d-article"><h3>기사</h3>${d.article.map((p) => `<p>${esc(p)}</p>`).join('')}</section>`);   // 핵심 요약 아래 기사 본문 (2026-11-18)
    (d.charts || []).forEach((c) => blocks.push(`<section class="d-block"><h3>${esc(c.title)}</h3>${miniChart(c)}${c.note ? `<span class="small muted">${esc(c.note)}</span>` : ''}${c.source ? `<span class="small muted">출처: ${esc(c.source)}</span>` : ''}</section>`));
    (d.sections || []).forEach((sec) => blocks.push(`<section class="d-block"><h3>${esc(sec.title)}</h3>${sec.text ? `<p>${esc(sec.text)}</p>` : ''}${(sec.bullets || []).length ? `<ul>${sec.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}</section>`));
    if (d.points && d.points.length) blocks.push(`<section class="d-block"><h3>투자 포인트</h3><ul>${d.points.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>`);
    if (d.risks && d.risks.length) blocks.push(`<section class="d-block counter"><h3>리스크</h3><ul>${d.risks.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></section>`);
    if (d.why) blocks.push(`<section class="d-block"><h3>오늘 신문과의 연결</h3><p>${esc(d.why)}</p></section>`);
    if (d.logic && d.logic.length) blocks.push(`<section class="d-block"><h3>논리 따라가기</h3><ol class="logic">${d.logic.map((l) => `<li><span class="step">${esc(l.step)}</span><span>${esc(l.text)}</span></li>`).join('')}</ol></section>`);
    if (d.numbers && d.numbers.length) {   // 숫자로 보기: 꼭 볼 숫자만, 설명이 없으면 두 칸 (2026-11-18)
      const withNote = d.numbers.some((n) => n.note);
      blocks.push(`<section class="d-block"><h3>숫자로 보기</h3>${ed.sample ? '<span class="sample-note">시범 화면이라 표의 수치는 예시입니다.</span>' : ''}
      <div class="table-box"><table class="nums"><tbody>
      ${d.numbers.map((n) => `<tr><th scope="row">${esc(n.label)}</th><td class="${changeClass(n.value)}">${esc(n.value)}</td>${withNote ? `<td style="text-align:left" class="muted small">${esc(n.note || '')}</td>` : ''}</tr>`).join('')}
      </tbody></table></div>${d.numbersSource ? `<span class="small muted">${esc(d.numbersSource)}</span>` : ''}</section>`);
    }
    if (d.checks && d.checks.length) blocks.push(`<section class="d-block"><h3>교차 확인</h3>
      <ul class="checks-simple">${d.checks.map((c) => `<li><span>${esc(c.item)}</span><span class="verdict v-${esc(VERDICT[c.verdict] || 'no')}">${esc(c.verdict || '확인 안 됨')}</span></li>`).join('')}</ul></section>`);   // 항목과 판정만, 출처 없이 (선생님 지시 2026-11-18)
    if (d.counter && d.counter.length) blocks.push(`<section class="d-block counter"><h3>반론과 약점</h3><ul>${d.counter.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></section>`);
    if (d.test && d.test.length) blocks.push(`<section class="d-block"><h3>맞는지 확인하려면</h3><ul>${d.test.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></section>`);
    if (d.timeline && state.full) blocks.push(`<section class="d-block"><h3>시간대별 언급 흐름</h3>${chart(d.timeline)}</section>`);
    if (d.views) blocks.push(`<section class="d-block"><h3>시장의 시각</h3>${d.views.map((v) => `<div class="view"><div class="view-top"><strong>${esc(v.label)}</strong></div><p>${esc(v.text)}</p></div>`).join('')}</section>`);   // 출처 없이 의견만 (선생님 지시)
    if (d.excerpts) blocks.push(`<section class="d-block"><h3>주요 발언 요약</h3>${d.excerpts.map((x) => `<div class="excerpt"><span>${esc(x.text)}</span></div>`).join('')}</section>`);
    if (d.background && !(d.article && d.article.length)) blocks.push(`<section class="d-block"><h3>배경</h3><p>${esc(d.background)}</p></section>`);   // 기사 본문이 있으면 배경은 본문에 들어 있다
    if (d.watch) blocks.push(`<section class="d-block"><h3>앞으로 볼 것</h3><ul>${d.watch.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></section>`);
    if (d.sources) blocks.push(`<section class="d-block"><h3>원문 보기</h3>${d.sources.map((s) => `<a class="link-row" href="${esc(s.url)}" target="_blank" rel="noopener"><span><strong>${esc(s.name)}</strong><br><span class="small muted">${esc(s.meta)}</span></span><span class="go">원문 열기 ↗</span></a>`).join('')}</section>`);
    if (state.full && it.factors) {
      const FK = { impact: '증시 영향', reach: '조회수', credibility: '신뢰도', coherence: '설명력', breadth: '확산', us: '미국 주식 관련성', novelty: '새로움', confidence: '확인 정도' };
      blocks.push(`<section class="d-block owner-only"><h3>선정 점수 ${esc(it.score)} <span class="small muted">(전체판에만 보임)</span></h3><div class="factor-list">${Object.keys(FK).filter((k) => k in it.factors).map((k) => `<div class="factor"><span>${FK[k]}</span><span class="bar"><i style="width:${Math.round(it.factors[k] * 100)}%"></i></span><span class="num">${Math.round(it.factors[k] * 100)}</span></div>`).join('')}</div></section>`);
    }
    if (d.related) blocks.push(`<section class="d-block"><h3>함께 읽기</h3>${d.related.map(relatedRow).join('')}</section>`);

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
    if (b) { toggleCal(false); go(b.dataset.date); window.scrollTo({ top: 0 }); }
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

  el.ownerOff.addEventListener('click', () => {
    try { localStorage.removeItem(KEY_STORE); } catch (e) { /* 무시 */ }
    state.date = null;
    route();
  });

  /* ---------- 시작 ---------- */
  captureKey();
  window.addEventListener('hashchange', () => { captureKey(); route(); });
  fetchJSON('data/index.json')
    .then((idx) => { state.index = idx; return route(); })
    .catch(() => { el.content.innerHTML = '<p class="state">아직 발행된 신문이 없어요.</p>'; el.date.textContent = ''; });
})();
