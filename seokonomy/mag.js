/* SEOKONOMY — 주간 시장 경제지 화면 (2026-11-21 제1호부터).
   탭: 시장 읽기(총평) · 주간 TOP(막대로 5~10개) · 매크로·일정 · 매수 관심 · 매도 검토 · 인뎁스
   종목 카드: 기술적 분석 요소를 누르면 자세한 설명, RSI·상대강도는 그래프 밑에 작은 칸으로 함께 그린다. */
(() => {
  'use strict';
  const TABS = [
    { id: 'reading', label: '시장 읽기' },
    { id: 'top', label: '주간 TOP' },
    { id: 'macro', label: '매크로·일정' },
    { id: 'buy', label: '매수 관심' },
    { id: 'sell', label: '매도 검토' },
    { id: 'indepth', label: '인뎁스' }
  ];
  const TOPN_STORE = 'seokonomy.topN';
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
    .replace(/(S&amp;P|나스닥|러셀|다우) (500|100|2000|30)/g, '$1&nbsp;$2');   // 'S&P 500' 같은 이름이 줄 끝에서 갈라지지 않게 (선생님 지시 2026-11-21)
  const el = { tabs: $('#tabs'), content: $('#content'), meta: $('#issueMeta'), past: $('#pastSel'), foot: $('#foot') };
  const state = { index: null, date: null, tab: 'reading', mag: null, topN: 10, open: {} };
  try { const n = parseInt(localStorage.getItem(TOPN_STORE), 10); if (n >= 5 && n <= 10) state.topN = n; } catch (e) { /* 저장소 없음 */ }

  const sign = (v) => (typeof v === 'number' ? (v > 0 ? '+' : '') + v : v);
  const cls = (v) => { const s = String(v ?? ''); return /^\+|^[0-9.]+%p?$/.test(s) && !/^0(\.0+)?%?p?$/.test(s) ? (s.startsWith('-') ? 'down' : 'up') : (s.startsWith('-') || s.startsWith('−') ? 'down' : ''); };
  const chg = (v) => { const s = String(v ?? ''); return s.startsWith('-') || s.startsWith('−') ? 'down' : (s.startsWith('+') ? 'up' : ''); };
  const fmtDate = (d) => { const x = new Date(d + 'T00:00:00+09:00'); return `${x.getFullYear()}. ${x.getMonth() + 1}. ${x.getDate()}. (${'일월화수목금토'[x.getDay()]})`; };

  /* ---------- 주소 #/날짜/탭 ---------- */
  function parse() {
    const p = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    return { date: /^\d{4}-\d{2}-\d{2}$/.test(p[0] || '') ? p[0] : null, tab: p[1] || (p[0] && !/^\d/.test(p[0]) ? p[0] : null) };
  }
  function go(date, tab) {
    const h = '#/' + [date, tab].filter(Boolean).join('/');
    if (location.hash !== h) location.hash = h; else route();
  }
  async function getJSON(u) { const r = await fetch(u, { cache: 'no-cache' }); if (!r.ok) throw new Error(r.status); return r.json(); }

  async function route() {
    const p = parse();
    try {
      if (!state.index) state.index = await getJSON('data/index.json');
    } catch (e) { el.content.innerHTML = '<p class="empty">아직 발행된 호가 없습니다.</p>'; return; }
    const date = p.date || state.index.latest;
    state.tab = TABS.some((t) => t.id === p.tab) ? p.tab : 'reading';
    if (date !== state.date || !state.mag) {
      try { state.mag = await getJSON(`data/${date}.json`); state.date = date; state.open = {}; }
      catch (e) { el.content.innerHTML = '<p class="empty">이 호를 불러오지 못했습니다.</p>'; return; }
    }
    render();
  }

  function render() {
    const m = state.mag;
    el.meta.textContent = `제${m.issue}호 · ${fmtDate(m.date)} · ${m.range || ''}`;
    document.title = `SEOKONOMY 제${m.issue}호 — ${(m.cover || {}).headline || '주간 시장 경제지'}`;
    el.past.innerHTML = state.index.issues.map((i) => `<option value="${esc(i.date)}"${i.date === state.date ? ' selected' : ''}>제${esc(i.issue)}호 ${esc(i.date)}</option>`).join('');
    el.tabs.innerHTML = TABS.map((t, i) => `<button type="button" class="tab" role="tab" id="tab-${t.id}" aria-selected="${t.id === state.tab}" aria-controls="content" data-tab="${t.id}"><span class="n">${String(i + 1).padStart(2, '0')}</span>${esc(t.label)}</button>`).join('');
    const page = { reading: readingPage, top: topPage, macro: macroPage, buy: (x) => stockPage(x, 'buy'), sell: (x) => stockPage(x, 'sell'), indepth: indepthPage }[state.tab];
    el.content.innerHTML = page(m);
    el.foot.innerHTML = footer(m);
    const cur = $(`#tab-${state.tab}`); if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  el.tabs.addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) { go(state.date, b.dataset.tab); window.scrollTo(0, 0); } });
  el.past.addEventListener('change', () => go(el.past.value, state.tab));

  /* ---------- 글 안의 근거 번호 [3] → 근거 주소로 바로 가는 작은 단추 ---------- */
  function withRefs(text, refs) {
    const map = {}; (refs || []).forEach((r) => { map[r.n] = r; });
    // 근거 번호는 앞 낱말에 붙여 한 덩어리로 — 번호만 다음 줄 맨 앞으로 떨어지지 않게
    return esc(text).replace(/([^\s\[]*)\s*\[(\d+(?:\s*[,·]\s*\d+)*)\]/g, (all, pre, g) => `<span class="nb">${pre}${g.split(/\s*[,·]\s*/).map((n) => {
      const r = map[n];
      return r && r.url ? `<sup class="fn"><a href="${esc(r.url)}" target="_blank" rel="noopener" title="${esc(r.title)} — ${esc(r.source || '')}">${n}</a></sup>` : `<sup class="fn"><a href="#ref-${n}">${n}</a></sup>`;
    }).join('')}</span>`);
  }
  function refList(refs, title) {
    if (!refs || !refs.length) return '';
    return `<section class="refs"><h4>${esc(title || '근거 — 더 찾아보기')}</h4><ol>${refs.map((r) => `<li id="ref-${esc(r.n)}" value="${esc(r.n)}"><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)} ↗</a> <span class="src">${esc(r.source || '')}</span></li>`).join('')}</ol></section>`;
  }

  /* ---------- 01 시장 읽기 ---------- */
  function readingPage(m) {
    const rd = m.reading || {}, cv = m.cover || {};
    let first = true;
    const secs = (rd.sections || []).map((s) => `
      ${s.heading ? `<h4>${esc(s.heading)}</h4>` : ''}
      ${(s.paras || []).map((p, i) => { const c = first ? ' class="drop"' : ''; first = false; return `<p${c}>${withRefs(p, rd.refs)}</p>${s.pull && i === Math.min(1, s.paras.length - 1) ? `<blockquote class="pull">${esc(s.pull)}</blockquote>` : ''}`; }).join('')}`).join('');
    const chars = (rd.sections || []).reduce((a, s) => a + (s.paras || []).join('').length, 0);
    return `
      <header class="cover">
        <span class="kicker">이번 주 시장 읽기 · ${esc(m.range || '')}</span>
        <h2 class="cover-head">${esc(cv.headline || rd.title)}</h2>
        ${cv.dek ? `<p class="dek">${esc(cv.dek)}</p>` : ''}
      </header>
      ${(rd.glance || []).length ? `<div class="glance">${rd.glance.map((g) => `<div><b>${esc(g.label)}</b><p>${esc(g.text)}</p></div>`).join('')}</div>` : ''}
      <article class="essay">
        <h3 class="essay-title">${esc(rd.title || '')}</h3>
        ${rd.standfirst ? `<p class="standfirst">${esc(rd.standfirst)}</p>` : ''}
        <p class="byline">읽는 데 약 ${Math.max(3, Math.round(chars / 600))}분 · 문단의 작은 번호를 누르면 근거로 갑니다</p>
        ${secs}
        ${(rd.next_watch || []).length ? `<div class="panel"><b>다음 주, 판단을 바꿀 것</b><ul>${rd.next_watch.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
        ${refList(rd.refs)}
      </article>`;
  }

  /* ---------- 02 주간 TOP ---------- */
  const DAYS = ['월', '화', '수', '목', '금', '토'];
  function topPage(m) {
    const top = m.top || [];
    const max = Math.min(10, top.length), min = Math.min(5, max);
    const n = Math.max(min, Math.min(state.topN, max));
    return `
      <div class="sec-head"><h2 class="sec-title">이번 주 TOP <span id="topNTitle">${n}</span></h2><p class="sec-note">중요한 순서 · 시장에 남긴 영향과 다음 주까지 이어질 힘으로 매김</p></div>
      <div class="slider"><label for="topN">몇 개까지 볼까요</label>
        <input id="topN" type="range" min="${min}" max="${max}" step="1" value="${n}" aria-valuetext="${n}개"><output id="topNVal" for="topN">${n}</output></div>
      <div class="tops">${top.map((t, i) => `
        <article class="topc" data-rank="${i + 1}"${i + 1 > n ? ' hidden' : ''}>
          <span class="rk" aria-hidden="true">${i + 1}</span>
          <div>
            <h3><span class="sr">${i + 1}위 </span>${esc(t.title)}</h3>
            <span class="days" aria-label="신문에 나온 요일">${DAYS.map((d, j) => `<span class="${(t.days || [])[j] ? 'on' : ''}">${d}</span>`).join('')}</span>
            ${(t.tickers || []).length ? ` <span class="tks">${t.tickers.map((k) => `<span class="tk">${esc(k)}</span>`).join('')}</span>` : ''}
            <p>${esc(t.summary)}</p>
            ${t.why ? `<p><span class="lbl">왜 중요한가</span>${esc(t.why)}</p>` : ''}
            ${t.impact ? `<p><span class="lbl">주가에 남긴 것</span>${esc(t.impact)}</p>` : ''}
            ${(t.key || []).length ? `<div class="keys">${t.key.map((k) => `<span><strong class="${chg(k.value)}">${esc(k.value)}</strong>${esc(k.label)}</span>`).join('')}</div>` : ''}
            ${t.next ? `<p><span class="lbl">다음에 볼 것</span>${esc(t.next)}</p>` : ''}
            ${(t.links || []).length ? `<div class="links">${t.links.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.title)} ↗</a>`).join('')}</div>` : ''}
          </div>
        </article>`).join('')}</div>`;
  }
  el.content.addEventListener('input', (e) => {
    if (e.target.id !== 'topN') return;
    const n = parseInt(e.target.value, 10);
    state.topN = n;
    try { localStorage.setItem(TOPN_STORE, String(n)); } catch (err) { /* 무시 */ }
    e.target.setAttribute('aria-valuetext', `${n}개`);
    $('#topNVal').textContent = n; $('#topNTitle').textContent = n;
    el.content.querySelectorAll('.topc[data-rank]').forEach((c) => { c.hidden = Number(c.dataset.rank) > n; });
  });

  /* ---------- 03 매크로·일정·많이 언급된 기업 ---------- */
  function macroPage(m) {
    const mc = m.macro || {};
    let g = null;
    const rows = (mc.table || []).map((r) => {
      const head = r.group && r.group !== g ? `<tr class="grp"><td colspan="5">${esc(r.group)}</td></tr>` : '';
      g = r.group;
      return `${head}<tr><th scope="row">${esc(r.label)}</th><td>${esc(r.start)}</td><td>${esc(r.end)}</td><td class="${chg(r.change)}"><b>${esc(r.change)}</b></td><td class="read">${esc(r.read || '')}</td></tr>`;
    }).join('');
    const maxC = Math.max(1, ...(mc.companies || []).map((c) => Number(c.count) || 0));
    const tone = (t) => `<span class="tone ${t === '긍정' ? 'pos' : t === '부정' ? 'neg' : ''}">${esc(t || '')}</span>`;
    return `
      <div class="sec-head"><h2 class="sec-title">매크로 주간 변화</h2><p class="sec-note">지난주 금요일 종가 → 이번 주 금요일 종가</p></div>
      ${mc.note ? `<p class="lede">${esc(mc.note)}</p>` : ''}
      <div class="panel tbox"><table class="tbl"><thead><tr><th scope="col" class="l">지표</th><th scope="col">지난주</th><th scope="col">이번 주</th><th scope="col">변화</th><th scope="col" class="l">무엇을 말하나</th></tr></thead><tbody>${rows}</tbody></table></div>
      ${(mc.breadth || []).length ? `<div class="panel"><b>시장 속 온도 (증시 현황판)</b><div class="tbox"><table class="tbl"><tbody>${mc.breadth.map((b) => `<tr><th scope="row">${esc(b.label)}</th><td><b>${esc(b.value)}</b></td><td class="read">${esc(b.note || '')}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
      <div class="sec-head"><h2 class="sec-title">다음 주 볼 일정</h2><p class="sec-note">시각은 한국 기준</p></div>
      <div class="panel"><ul class="cal">${(mc.next || []).map((n) => `<li><span class="d">${esc(n.date)}${n.time ? `<span class="t">${esc(n.time)}</span>` : ''}</span><span><span class="e">${esc(n.event)}</span>${n.why ? `<span class="w">${esc(n.why)}</span>` : ''}${n.url ? ` <a class="small" href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.source || '출처')} ↗</a>` : ''}</span></li>`).join('')}</ul></div>
      <div class="sec-head"><h2 class="sec-title">이번 주 많이 언급된 기업</h2><p class="sec-note">텔레그램·X·한경·레딧·유튜브 한 주 원자료에서 그 회사를 언급한 글 수</p></div>
      <div class="panel tbox"><table class="tbl"><thead><tr><th scope="col" class="l">기업</th><th scope="col">언급</th><th scope="col">이번 주 주가</th><th scope="col" class="l">무슨 이야기였나</th></tr></thead><tbody>
        ${(mc.companies || []).map((c) => `<tr><th scope="row">${esc(c.name)} ${c.ticker && !/^\d/.test(c.ticker) ? `<span class="tk">${esc(c.ticker)}</span>` : ''}${c.sp500 === false ? ' <span class="small muted">S&amp;P 500 밖</span>' : ''}</th>
          <td><b>${Number(c.count).toLocaleString('ko-KR')}</b><div class="bar" aria-hidden="true"><i style="width:${Math.round((Number(c.count) || 0) / maxC * 100)}%"></i></div></td>
          <td class="${chg(c.change_week)}">${esc(c.change_week || '-')}</td><td class="read">${esc(c.note)} ${c.tone ? tone(c.tone) : ''}</td></tr>`).join('')}
      </tbody></table></div>`;
  }

  /* ---------- 04·05 종목 ---------- */
  const TC = [
    ['price_above_150_200', '주가가 150일선과 200일선 위에 있다'],
    ['sma150_above_200', '150일선이 200일선 위에 있다'],
    ['sma200_rising_1m', '200일선이 한 달 전보다 올라 있다 (긴 추세가 위를 향함)'],
    ['sma50_above_150_200', '50일선이 150일선·200일선 위에 있다'],
    ['price_above_50', '주가가 50일선 위에 있다'],
    ['above_52w_low_30', '1년 최저가보다 30% 이상 높다'],
    ['within_25_of_high', '1년 최고가에서 25% 안쪽이다'],
    ['rs_70', '상대강도 순위가 70 이상이다 (S&P 500 종목 중 상위 30%)']
  ];
  const STAGE = {
    1: ['1단계 · 바닥 다지기', '오랫동안 내린 뒤 주가가 옆으로 움직이며 평균선(150일선)이 평평해진 구간입니다. 파는 힘이 줄었지만 아직 사는 힘이 이기지는 못했습니다.'],
    2: ['2단계 · 상승 추세', '주가가 150일 평균선 위에 있고, 그 평균선이 위로 기울어 있는 구간입니다. 산을 오르는 길의 한가운데라고 보면 됩니다. 추세를 따르는 투자자들이 가장 선호하는 구간입니다.'],
    3: ['3단계 · 천장권', '오래 오른 뒤 주가가 150일선 근처에서 오르내리고 평균선이 평평해진 구간입니다. 사는 힘과 파는 힘이 맞서며 꼭대기를 만들 수 있습니다.'],
    4: ['4단계 · 하락 추세', '주가가 150일 평균선 아래에 있고, 그 평균선이 아래로 기울어 있는 구간입니다. 내리막길의 한가운데로, 반등이 나와도 평균선 근처에서 막히기 쉽습니다.']
  };
  const PAT = {
    '이중 바닥': '주가가 비슷한 높이에서 두 번 바닥을 찍고(W 모양) 그 사이의 봉우리(기준선)를 넘으면, 내리던 흐름이 오르는 쪽으로 바뀌었다고 봅니다.',
    '이중 천장': '주가가 비슷한 높이에서 두 번 꼭대기를 찍고(M 모양) 그 사이의 골짜기(기준선)를 깨면, 오르던 흐름이 꺾였다고 봅니다.',
    '헤드앤숄더': '왼쪽 어깨-머리-오른쪽 어깨처럼 봉우리 세 개가 생기고 어깨 아래 선(목선)을 깨면 하락 전환 신호로 봅니다.',
    '역헤드앤숄더': '헤드앤숄더를 뒤집은 모양입니다. 골짜기 세 개 위의 선(목선)을 넘으면 상승 전환 신호로 봅니다.',
    '상승 삼각형': '위쪽은 평평하고 아래쪽 저점이 점점 높아지는 모양입니다. 위쪽 선을 넘으면 오르는 쪽으로 풀린다고 봅니다.',
    '하락 삼각형': '아래쪽은 평평하고 위쪽 고점이 점점 낮아지는 모양입니다. 아래쪽 선을 깨면 내리는 쪽으로 풀린다고 봅니다.',
    '대칭 삼각형': '고점은 낮아지고 저점은 높아지며 폭이 좁아지는 모양입니다. 어느 쪽으로 빠져나가느냐가 다음 방향입니다.',
    '컵앤핸들': '둥근 컵 모양으로 내렸다 회복한 뒤 손잡이처럼 살짝 쉬어 가는 모양입니다. 손잡이 위(기준선)를 거래량과 함께 넘으면 상승 신호로 봅니다.',
    '상승 깃발': '가파르게 오른 뒤(깃대) 좁은 폭으로 살짝 내리며 쉬는(깃발) 모양입니다. 쉬는 구간 위를 넘으면 오르던 흐름이 이어진다고 봅니다.',
    'VCP': '변동성 축소 패턴입니다. 출렁임의 폭이 점점 줄어드는(예: 20% → 10% → 5%) 동안 파는 물량이 마르고, 마지막 좁은 구간 위를 넘으면 상승 신호로 봅니다.',
    '신고가': '1년 중 가장 높은 값을 넘었다는 뜻입니다. 위에 물려 있는 매물이 없어 추세가 이어지기 쉽다고 봅니다.',
    '신저가': '1년 중 가장 낮은 값을 깼다는 뜻입니다. 아래에 받쳐 줄 가격대가 마땅치 않아 약세가 이어지기 쉽다고 봅니다.'
  };
  const patKey = (name) => Object.keys(PAT).find((k) => String(name).includes(k));

  function explainHTML(x, term) {
    const t = x.ta || {}, ma = t.ma || {}, mv = t.ma_values || {}, rs = t.rs || {}, vol = t.volume || {};
    const pct = (v) => (v == null ? '-' : `${v > 0 ? '+' : ''}${v}%`);
    if (term === 'stage') {
      const s = STAGE[t.stage] || ['-', ''];
      return `<h5>추세 단계: ${esc(s[0])}</h5><p>주가의 큰 흐름을 네 단계(바닥 다지기 → 상승 → 천장권 → 하락)로 나눠 보는 방법입니다(스탠 와인스타인의 단계 분석). 기준은 150일 이동평균선(약 30주 평균 주가)입니다. 주가가 이 선 위인지 아래인지, 선이 오르는지 내리는지로 단계를 나눕니다.</p><p>${esc(s[1])}</p>
        <div class="this"><b>${esc(x.ticker)}의 지금</b> · 주가 ${esc(x.price)} · 150일선 ${esc(mv.sma150 ?? '-')} · 150일선 기울기 ${esc(sign(mv.slope150 ?? '-'))}%/월</div>`;
    }
    if (term === 'align') {
      return `<h5>이동평균선 배열: ${esc(t.align)}</h5><p>이동평균선은 지난 며칠 동안의 평균 주가를 이은 선입니다. 20일선은 한 달, 50일선은 두 달 반, 200일선은 열 달쯤의 평균입니다.</p>
        <ul><li><b>정배열</b> — 주가 &gt; 20일선 &gt; 50일선 &gt; 150일선 &gt; 200일선. 짧은 평균일수록 위에 있어, 최근에 산 사람일수록 더 비싸게 샀다는 뜻입니다. 오르는 힘이 고르게 쌓인 모습입니다.</li><li><b>역배열</b> — 그 반대. 최근에 산 사람일수록 더 싸게 샀는데도 손해인 모습입니다. 내리는 힘이 쌓여 있습니다.</li><li><b>혼조</b> — 섞여 있어 방향이 아직 정리되지 않았습니다.</li></ul>
        <div class="this"><b>${esc(x.ticker)}의 지금</b> · 50일선 대비 ${pct(ma.dist50)} · 200일선 대비 ${pct(ma.dist200)}${ma.cross ? ` · ${esc(ma.cross.type)}(${esc(ma.cross.date)})` : ''}${ma.support50 ? ' · 최근 50일선에서 받치고 반등' : ''}</div>
        <p class="small muted">골든크로스 = 50일선이 200일선을 아래에서 위로 뚫음(상승 신호), 데드크로스 = 위에서 아래로 뚫음(하락 신호).</p>`;
    }
    if (term === 'template') {
      const c = t.template_checks;
      const list = c ? `<ul>${TC.map(([k, label]) => `<li><span class="${c[k] ? 'ok' : 'no'}">${c[k] ? '✓' : '✗'}</span> ${esc(label)}</li>`).join('')}</ul>` : '';
      return `<h5>추세 점검 ${esc(t.template)}/8</h5><p>오르는 종목이 '건강하게' 오르고 있는지 여덟 가지로 확인하는 점검표입니다(마크 미너비니의 '추세 템플릿'). 많이 맞을수록 상승 추세가 튼튼하다는 뜻이고, 6개 이상이면 튼튼한 편, 3개 이하면 상승 추세라고 보기 어렵습니다.</p>${list}
        <p class="small muted">매도 검토 후보는 이 점수가 낮을수록 추세가 무너졌다는 뜻입니다.</p>`;
    }
    if (term === 'rs') {
      return `<h5>상대강도 ${esc(x.rs_rating ?? '-')} — RSI와는 다른 지표</h5><p>상대강도(RS, Relative Strength)는 이 종목이 <b>다른 종목들보다</b> 얼마나 잘 올랐는지를 1~99로 매긴 순위입니다. 최근 3·6·9·12개월 주가 상승률(최근 3개월에 두 배 무게)을 S&P 500 종목 500곳과 비교합니다. 89라면 상위 11%라는 뜻입니다. 이름이 비슷한 RSI는 <b>그 종목 혼자</b>의 최근 14일 오르내림 힘을 보는 지표라 서로 다릅니다.</p>
        <p>그래프 밑 <b>상대강도선</b>은 '이 종목 주가 ÷ S&amp;P 500 지수'를 6개월 전을 100으로 맞춰 그린 선입니다. 선이 오르면 시장보다 강하고, 내리면 시장보다 약합니다.</p>
        <div class="this"><b>${esc(x.ticker)}의 지금</b> · S&amp;P 500 대비 3개월 ${pct(rs.vs_spy_3m)}p · 6개월 ${pct(rs.vs_spy_6m)}p · 12개월 ${pct(rs.vs_spy_12m)}p${rs.rs_line_high ? ' · 상대강도선 1년 신고가' : rs.rs_line_low ? ' · 상대강도선 1년 신저가' : ''}</div>`;
    }
    if (term === 'rsi') {
      return `<h5>RSI ${esc(t.rsi)} — 최근 14일 오르는 힘과 내리는 힘</h5><p>RSI(상대강도지수)는 최근 14거래일 동안 오른 날의 폭과 내린 날의 폭을 견줘 0~100으로 나타냅니다. 50보다 높으면 오르는 힘이, 낮으면 내리는 힘이 우세합니다.</p>
        <ul><li><b>70 이상</b> — 짧은 기간에 많이 올라 숨을 고를 수 있는 '과열' 구간</li><li><b>30 이하</b> — 짧은 기간에 많이 내려 반등이 나올 수 있는 '과매도' 구간 (그래도 하락 추세에서는 30 아래에 오래 머물기도 합니다)</li></ul>
        <div class="this"><b>${esc(x.ticker)}의 지금</b> · RSI ${esc(t.rsi)}${t.rsi_week_ago != null ? ` (1주 전 ${esc(t.rsi_week_ago)})` : ''} — 그래프 밑에 14일 RSI 변화를 함께 그렸습니다.</div>`;
    }
    if (term === 'sector') {
      const s = x.sector_info || {};
      return `<h5>업종 흐름: ${esc(s.ko || x.sector)} ${esc(s.label || '')}</h5><p>같은 업종 주식들은 함께 움직이는 경우가 많습니다. 업종 ETF(${esc(s.etf || '-')})가 S&amp;P 500보다 얼마나 강했는지(1·3·6개월)로 '주도·강세·중립·약세'를 매깁니다. 강한 업종 안의 강한 종목이 오르기 쉽고, 약한 업종 안의 약한 종목이 내리기 쉽습니다.</p>
        <div class="this"><b>${esc(s.ko || x.sector)}</b> · 업종 순위 ${esc(s.rank ?? '-')}/11 · S&amp;P 500 대비 3개월 ${pct(s.vs_spy_3m)}p · ${esc(s.stage_ko || '')}</div>`;
    }
    if (term === 'volume') {
      return `<h5>거래량으로 본 사고파는 힘</h5><p>주가가 오를 때 거래가 많고 내릴 때 적으면 사려는 사람이 더 적극적이라는 뜻입니다. '상승일/하락일 거래량 비'가 1보다 크면 사는 쪽이 우세합니다.</p><p><b>분산일</b>은 거래량이 전날보다 늘면서 주가가 0.2% 넘게 내린 날로, 큰손이 물량을 넘기는 흔적으로 봅니다. 최근 25일 안에 5~6번 이상이면 경계 신호입니다.</p>
        <div class="this"><b>${esc(x.ticker)}의 지금</b> · 상승일/하락일 거래량 ${esc(vol.ud_ratio ?? '-')}배 · 최근 25일 분산일 ${esc(vol.dist_days_25 ?? '-')}회 · 매집일 ${esc(vol.acc_days_25 ?? '-')}회 · 누적 거래량(OBV) ${esc(vol.obv_trend || '-')}</div>`;
    }
    if (term.startsWith('pat:')) {
      const p = (t.patterns || [])[Number(term.slice(4))] || {};
      const k = patKey(p.name);
      return `<h5>차트 패턴: ${esc(p.name)} — ${esc(p.status)}</h5><p>${esc(k ? PAT[k] : '주가가 그리는 모양에서 다음 방향을 읽는 방법입니다.')}</p>
        <ul>${p.neckline != null ? `<li><b>기준선 ${esc(p.neckline)}</b> — 이 가격을 넘거나(상승 패턴) 깨면(하락 패턴) 패턴이 '확인'됩니다.</li>` : ''}${p.target != null ? `<li><b>목표 ${esc(p.target)}</b> — 패턴 높이만큼 더 간다고 볼 때의 가격(참고용 계산)입니다.</li>` : ''}${p.invalid != null ? `<li><b>무효 ${esc(p.invalid)}</b> — 이 가격을 반대로 지나면 패턴이 깨졌다고 봅니다.</li>` : ''}</ul>
        <p class="small muted">패턴은 도구가 찾고, 그림을 직접 보며 억지스러운 것은 걸렀습니다. 확률의 언어이지 약속이 아닙니다.</p>`;
    }
    return '';
  }

  /* 주가 + 50·200일선 + 패턴 선, 아래에 RSI·상대강도선 칸 */
  function priceChart(x, panes) {
    const c = x.chart || {};
    const pts = (c.points || []).map((p) => p.value);
    if (!pts.length) return '';
    const s2 = (c.series2 || []).map((p) => (typeof p.value === 'number' ? p.value : null));
    const s3 = (c.series3 || []).map((p) => (typeof p.value === 'number' ? p.value : null));
    const last = pts[pts.length - 1];
    const near = (v) => typeof v === 'number' && Math.abs(v / last - 1) <= 0.35;
    const lines = (c.lines || []).filter((l) => near(l.v1) && near(l.v2));
    const marks = (c.marks || []).filter((m) => near(m.v));
    const W = 560, PH = 210, SH = 78, gap = 14, padL = 6, padR = 46;
    const showR = panes.rsi && (c.rsi || []).length, showS = panes.rs && (c.rs_line || []).length;
    const H = PH + (showR ? SH + gap : 0) + (showS ? SH + gap : 0) + 16;
    const n = pts.length, X = (i) => padL + i * (W - padL - padR) / Math.max(1, n - 1);
    const all = pts.concat(s2.filter((v) => v !== null), s3.filter((v) => v !== null), lines.flatMap((l) => [l.v1, l.v2]));
    const mx = Math.max(...all), mn = Math.min(...all), sp = (mx - mn) || 1;
    const Y = (v) => 8 + (mx - v) / sp * (PH - 16);
    const path = (vals, y) => vals.map((v, i) => (v == null ? '' : `${i && vals[i - 1] != null ? 'L' : 'M'}${X(i).toFixed(1)},${y(v).toFixed(1)}`)).join('');
    const yt = [mx, (mx + mn) / 2, mn].map((v) => `<line class="grid" x1="${padL}" x2="${W - padR}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text x="${W - padR + 4}" y="${(Y(v) + 3).toFixed(1)}">${Number(v.toFixed(v >= 100 ? 0 : 2)).toLocaleString('ko-KR')}</text>`).join('');
    const seg = lines.map((l) => `<line class="pl ${esc(l.kind || '')}" x1="${X(l.i1).toFixed(1)}" y1="${Y(l.v1).toFixed(1)}" x2="${X(l.i2).toFixed(1)}" y2="${Y(l.v2).toFixed(1)}"/>${l.label ? `<text x="${X(l.i2).toFixed(1)}" y="${(Y(l.v2) - 3).toFixed(1)}" text-anchor="end">${esc(l.label)}</text>` : ''}`).join('');
    const mk = marks.map((m) => `<circle class="pm" cx="${X(m.i).toFixed(1)}" cy="${Y(m.v).toFixed(1)}" r="2.3"/><text x="${X(m.i).toFixed(1)}" y="${(Y(m.v) - 5).toFixed(1)}" text-anchor="middle">${esc(m.label)}</text>`).join('');
    let y0 = PH + gap, extra = '';
    if (showR) {
      const r = c.rsi, Yr = (v) => y0 + (100 - v) / 100 * SH;
      extra += `<rect class="zone" x="${padL}" y="${Yr(70).toFixed(1)}" width="${W - padL - padR}" height="${(Yr(30) - Yr(70)).toFixed(1)}" opacity=".5"/>
        ${[70, 50, 30].map((v) => `<line class="lvl" x1="${padL}" x2="${W - padR}" y1="${Yr(v).toFixed(1)}" y2="${Yr(v).toFixed(1)}"/><text x="${W - padR + 4}" y="${(Yr(v) + 3).toFixed(1)}">${v}</text>`).join('')}
        <path class="rsi" d="${path(r, Yr)}"/><text class="pane-t" x="${padL + 2}" y="${y0 + 10}">RSI(14) ${esc((x.ta || {}).rsi ?? '')}</text>`;
      y0 += SH + gap;
    }
    if (showS) {
      const r = c.rs_line.filter((v) => v != null), a = Math.max(...r), b = Math.min(...r), s = (a - b) || 1;
      const Ys = (v) => y0 + 6 + (a - v) / s * (SH - 12);
      extra += `<line class="lvl" x1="${padL}" x2="${W - padR}" y1="${Ys(100).toFixed(1)}" y2="${Ys(100).toFixed(1)}"/><text x="${W - padR + 4}" y="${(Ys(100) + 3).toFixed(1)}">100</text>
        <path class="rsl" d="${path(c.rs_line, Ys)}"/><text class="pane-t" x="${padL + 2}" y="${y0 + 10}">상대강도선 (주가 ÷ S&amp;P 500, 6개월 전=100)</text>`;
    }
    const lab = (c.points || []);
    const xl = `<text x="${padL}" y="${H - 3}">${esc(lab[0].label)}</text><text x="${((padL + W - padR) / 2).toFixed(0)}" y="${H - 3}" text-anchor="middle">${esc(lab[Math.floor(n / 2)].label)}</text><text x="${W - padR}" y="${H - 3}" text-anchor="end">${esc(lab[n - 1].label)}</text>`;
    return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(x.ticker)} 6개월 주가와 50일선·200일선${showR ? ', RSI' : ''}${showS ? ', 상대강도선' : ''}">${yt}${s3.length ? `<path class="m200" d="${path(s3, Y)}"/>` : ''}${s2.length ? `<path class="m50" d="${path(s2, Y)}"/>` : ''}<path class="px" d="${path(pts, Y)}"/>${seg}${mk}${extra}${xl}</svg>`;
  }

  function chartBlock(x, side) {
    const key = `${side}:${x.ticker}`, p = state.open[key] || (state.open[key] = { rsi: false, rs: false, term: null });
    const c = x.chart || {};
    return `${priceChart(x, p)}
      <div class="legend"><span><i style="background:var(--ink)"></i>주가</span><span><i style="background:#D08A1E"></i>50일선</span><span><i style="background:#3B6BC4"></i>200일선</span>${(c.lines || []).length ? '<span><i style="background:var(--red-2)"></i>패턴 기준선</span>' : ''}</div>
      <div class="toggles" role="group" aria-label="그래프 아래에 더 그리기">
        ${(c.rsi || []).length ? `<button type="button" data-pane="rsi" aria-pressed="${p.rsi}">RSI 함께 보기</button>` : ''}
        ${(c.rs_line || []).length ? `<button type="button" data-pane="rs" aria-pressed="${p.rs}">상대강도선 함께 보기</button>` : ''}
      </div>`;
  }

  function stockCard(x, side) {
    const t = x.ta || {}, s = x.sector_info || {};
    const key = `${side}:${x.ticker}`, p = state.open[key] || (state.open[key] = { rsi: false, rs: false, term: null });
    const chip = (term, label, tone) => `<button type="button" class="chip${tone ? ' ' + tone : ''}${p.term === term ? ' on' : ''}" data-term="${term}" aria-expanded="${p.term === term}">${esc(label)}</button>`;
    const stTone = { 2: 'g', 4: 'r' }[t.stage] || '';
    const tpl = t.template ?? '-';
    const chips = x.ta ? [
      chip('stage', (STAGE[t.stage] || ['-'])[0], stTone),
      chip('align', `평균선 ${t.align || '-'}`, t.align === '정배열' ? 'g' : t.align === '역배열' ? 'r' : ''),
      chip('template', `추세 점검 ${tpl}/8`, tpl >= 6 ? 'g' : tpl <= 2 ? 'r' : ''),
      chip('rs', `상대강도 ${x.rs_rating ?? '-'}`, x.rs_rating >= 70 ? 'g' : x.rs_rating <= 30 ? 'r' : ''),
      chip('rsi', `RSI ${t.rsi ?? '-'}`, t.rsi >= 70 ? 'r' : t.rsi <= 30 ? 'g' : ''),
      chip('volume', `거래량 ${(t.volume || {}).ud_ratio ?? '-'}배`, ''),
      s.ko ? chip('sector', `${s.ko} ${s.label || ''}`, s.label === '주도' || s.label === '강세' ? 'g' : s.label === '약세' ? 'r' : '') : ''
    ].join('') : '';
    const num = (v, l, c2) => `<span><strong class="${c2 || ''}">${esc(v ?? '-')}</strong>${esc(l)}</span>`;
    const pats = (t.patterns || []).map((pt, i) => `<li><button type="button" data-term="pat:${i}">${esc(pt.name)}</button> ${esc(pt.status)}${pt.when ? ` (${esc(pt.when)})` : ''}${pt.neckline != null ? ` · 기준선 ${esc(pt.neckline)}` : ''}${pt.target != null ? ` · 목표 ${esc(pt.target)}` : ''}${pt.invalid != null ? ` · 무효 ${esc(pt.invalid)}` : ''}</li>`).join('');
    return `
      <article class="stock ${side}" id="s-${esc(x.ticker)}" data-key="${esc(key)}">
        <div class="s-top"><span class="tkr">${esc(x.ticker)}</span><span class="co">${esc(x.company || '')}</span><span class="ind">${esc(s.ko || x.sector || '')} · ${esc(x.industry || '')}</span></div>
        ${x.headline ? `<h3 class="s-head">${esc(x.headline)}</h3>` : ''}
        <div class="nums">${num(x.price, '주가')}${num(x.change_week, '이번 주', chg(x.change_week))}${num(x.perf_half, '6개월', chg(x.perf_half))}${num(x.fpe || '-', '선행 PER')}${num(x.eps_next_y || '-', '내년 EPS 성장', chg(x.eps_next_y))}${num(x.upside != null ? sign(x.upside) + '%' : '-', '목표가까지', chg(String(sign(x.upside))))}</div>
        <div class="chips" role="group" aria-label="기술적 분석 요소 — 누르면 설명">${chips}</div>
        <div class="explain"${p.term ? '' : ' hidden'}>${p.term ? explainHTML(x, p.term) : ''}</div>
        <div class="chart-box">${chartBlock(x, side)}</div>
        <div class="s-body">
          ${x.why ? `<p><b>${side === 'buy' ? '왜 관심인가' : '왜 검토하나'}</b>${esc(x.why)}</p>` : ''}
          ${x.sentiment_note ? `<p><b>이번 주 분위기</b>${esc(x.sentiment_note)}</p>` : ''}
          ${x.fund_note ? `<p><b>펀더멘털</b>${esc(x.fund_note)}</p>` : ''}
          ${x.risk ? `<p><b>주의할 점</b>${esc(x.risk)}</p>` : ''}
          ${x.watch ? `<p><b>볼 가격</b>${esc(x.watch)}</p>` : ''}
        </div>
        ${pats ? `<ul class="pats" aria-label="차트 패턴 — 이름을 누르면 설명">${pats}</ul>` : ''}
        ${(t.signals || []).length ? `<details class="more"><summary>기술적 신호 전부 보기</summary><ul>${t.signals.map((g) => `<li>${esc(g)}</li>`).join('')}</ul></details>` : ''}
        <div class="s-foot"><span>점수 — 펀더 ${Math.round((x.F || 0) * 100)} · 기술 ${Math.round(((side === 'buy' ? x.Tb : x.Tr) || 0) * 100)} · 업종 ${Math.round((x.Ss || 0) * 100)}</span><a href="https://finviz.com/quote.ashx?t=${encodeURIComponent(x.ticker)}" target="_blank" rel="noopener">Finviz 차트 ↗</a></div>
      </article>`;
  }

  function sectorTable(secs) {
    if (!secs || !secs.length) return '';
    const f = (v) => (v == null ? '-' : `${v > 0 ? '+' : ''}${v}%p`);
    return `<details class="panel"><summary><b>업종 흐름표 (S&amp;P 500 대비)</b> — 펼쳐 보기</summary><div class="tbox"><table class="tbl"><thead><tr><th scope="col">순위</th><th scope="col" class="l">업종</th><th scope="col">1개월</th><th scope="col">3개월</th><th scope="col">6개월</th><th scope="col" class="l">추세</th></tr></thead><tbody>
      ${secs.map((s) => `<tr><td>${esc(s.rank)}</td><th scope="row">${esc(s.ko)} <span class="small muted">${esc(s.etf)} · ${esc(s.label)}</span></th><td class="${chg(f(s.vs_spy_1m))}">${f(s.vs_spy_1m)}</td><td class="${chg(f(s.vs_spy_3m))}">${f(s.vs_spy_3m)}</td><td class="${chg(f(s.vs_spy_6m))}">${f(s.vs_spy_6m)}</td><td class="read">${esc(s.stage_ko || '')}</td></tr>`).join('')}
    </tbody></table></div></details>`;
  }

  const lastBar = (list) => { const p = ((list[0] || {}).chart || {}).points || []; return p.length ? p[p.length - 1].label : ''; };
  function stockPage(m, side) {
    const list = m[side] || [];
    const sc = m.screen || {};
    return `
      <div class="sec-head"><h2 class="sec-title">${side === 'buy' ? '매수 관심 후보' : '매도 검토 후보'} ${list.length}</h2><p class="sec-note">S&amp;P 500 종목 ${esc(sc.universe || 500)}곳에서 · 기술적 분석 + 센티 + 펀더멘털 · ${esc(lastBar(list))} 종가 기준</p></div>
      ${m[side === 'buy' ? 'intro_buy' : 'intro_sell'] ? `<p class="lede">${esc(m[side === 'buy' ? 'intro_buy' : 'intro_sell'])}</p>` : ''}
      <p class="notice">규칙으로 추린 후보 가운데 차트를 직접 보고 이번 주 분위기와 펀더멘털을 함께 따져 골랐습니다. 투자 권유가 아니며, 판단 전에 직접 확인하세요. 동그라미(ⓘ) 단추를 누르면 그 요소의 뜻과 이 종목의 값이 나옵니다.</p>
      ${sectorTable(sc.sectors)}
      <div class="stocks">${list.map((x) => stockCard(x, side)).join('')}</div>`;
  }

  el.content.addEventListener('click', (e) => {
    const card = e.target.closest('.stock');
    if (!card) return;
    const side = card.classList.contains('buy') ? 'buy' : 'sell';
    const x = (state.mag[side] || []).find((y) => `${side}:${y.ticker}` === card.dataset.key);
    if (!x) return;
    const p = state.open[card.dataset.key];
    const tb = e.target.closest('[data-term]'), pb = e.target.closest('[data-pane]');
    if (tb) {
      const term = tb.dataset.term;
      p.term = p.term === term ? null : term;
      if (p.term === 'rsi') p.rsi = true;      // RSI를 누르면 그래프 밑에 RSI도 함께 (선생님 지시 2026-11-21)
      if (p.term === 'rs') p.rs = true;
    } else if (pb) {
      p[pb.dataset.pane] = !p[pb.dataset.pane];
    } else return;
    const y = card.getBoundingClientRect().top;
    card.outerHTML = stockCard(x, side);
    const nc = document.querySelector(`.stock[data-key="${CSS.escape(`${side}:${x.ticker}`)}"]`);
    if (nc) { window.scrollBy(0, nc.getBoundingClientRect().top - y); const f = nc.querySelector(tb ? `[data-term="${CSS.escape(tb.dataset.term)}"]` : `[data-pane="${pb.dataset.pane}"]`); if (f) f.focus(); }
  });

  /* ---------- 06 인뎁스 ---------- */
  function indepthPage(m) {
    const d = m.indepth || {};
    if (!d.title) return '<p class="empty">이번 호 인뎁스가 없습니다.</p>';
    return `<article class="feature">
      <span class="kicker">인뎁스 · ${esc(d.kicker || '')}</span>
      <h2 class="f-title">${esc(d.title)}</h2>
      ${d.standfirst ? `<p class="standfirst">${esc(d.standfirst)}</p>` : ''}
      <p class="byline">읽는 데 약 ${Math.max(3, Math.round((d.sections || []).reduce((a, s) => a + (s.paras || []).join('').length, 0) / 600))}분 · 문단의 작은 번호를 누르면 근거로 갑니다</p>
      ${(d.sections || []).map((s, si) => `${s.heading ? `<h4>${esc(s.heading)}</h4>` : ''}${(s.paras || []).map((p) => `<p>${withRefs(p, d.refs)}</p>`).join('')}${si === 0 && (d.numbers || []).length ? numBox(d) : ''}`).join('')}
      ${d.takeaway ? `<blockquote class="pull">${esc(d.takeaway)}</blockquote>` : ''}
      ${refList(d.refs, '근거와 더 읽을거리')}
    </article>`;
  }
  function numBox(d) {
    return `<aside class="numbox"><h5>${esc(d.numbers_title || '숫자로 보기')}</h5><div class="tbox"><table class="tbl"><tbody>${d.numbers.map((n) => `<tr><th scope="row">${esc(n.label)}</th><td class="${chg(n.value)}"><b>${esc(n.value)}</b></td><td class="read">${withRefs(n.note || '', d.refs)}</td></tr>`).join('')}</tbody></table></div></aside>`;
  }

  function footer(m) {
    return `<p><b>SEOKONOMY 세코노미</b> 제${esc(m.issue)}호 · ${esc(m.date)} 발행 · 매주 토요일 아침 8시</p>
      <p>모든 내용은 공개 자료와 선생님이 모은 자료를 정리한 것이며 투자 권유가 아닙니다. 판단과 책임은 읽는 분께 있습니다.</p>
      <p><a href="../">Seok's Paper(아침 신문)로 가기</a></p>`;
  }

  window.addEventListener('hashchange', route);
  route();
})();
