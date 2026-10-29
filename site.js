// Language, detail and theme toggles. The URL wins (?lang=it&mode=tech&theme=light), so a link can
// open a given view; otherwise the last choice of this browser, otherwise English, simple and the
// system theme. The view is not remembered: without ?mode=tech every visit opens the simple one.
(() => {
  const root = document.documentElement;
  const url = new URLSearchParams(location.search);
  const store = {
    get: (k) => { try { return localStorage.getItem('hp-' + k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem('hp-' + k, v); } catch {} },
  };
  const systemDark = matchMedia('(prefers-color-scheme: dark)').matches;
  const states = { lang: ['en', 'it'], mode: ['simple', 'tech'], theme: ['light', 'dark'] };
  const fallback = { lang: 'en', mode: 'simple', theme: systemDark ? 'dark' : 'light' };
  const labels = {
    lang: { en: 'Language: English. Switch to Italian', it: 'Lingua: italiano. Passa all’inglese' },
    theme: { light: 'Switch to dark theme', dark: 'Switch to light theme' },
  };

  const apply = (key, value, save) => {
    if (!states[key].includes(value)) return;
    root.dataset[key] = value;
    if (key === 'lang') root.lang = value;
    const btn = document.querySelector(`[data-toggle="${key}"]`);
    if (btn && key === 'mode') btn.setAttribute('aria-pressed', String(value === 'tech'));
    if (btn && labels[key]) btn.setAttribute('aria-label', labels[key][value]);
    if (save && key !== 'mode') store.set(key, value);
  };

  for (const key of Object.keys(states)) {
    apply(key, url.get(key) || (key === 'mode' ? null : store.get(key)) || fallback[key], false);
    const btn = document.querySelector(`[data-toggle="${key}"]`);
    if (btn) btn.addEventListener('click', () => apply(key, states[key].find((v) => v !== root.dataset[key]), true));
  }

  // Loops (the decision strip, the flow) run only on screen, never under the pointer or focus,
  // and stop for good with their pause button or under reduced motion.
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.querySelectorAll('[data-loop]').forEach((el) => {
    const btn = el.querySelector('[data-loop-toggle]');
    const st = { seen: false, hover: false, focus: false, held: still };
    const sync = () => {
      el.classList.toggle('is-running', st.seen && !st.hover && !st.focus && !st.held);
      el.classList.toggle('is-held', st.held);
      if (btn) btn.setAttribute('aria-pressed', String(st.held));
    };
    if (btn) btn.addEventListener('click', () => { st.held = !st.held; sync(); });
    [['pointerenter', 'hover', true], ['pointerleave', 'hover', false], ['focusin', 'focus', true], ['focusout', 'focus', false]]
      .forEach(([t, k, v]) => el.addEventListener(t, () => { st[k] = v; sync(); }));
    new IntersectionObserver(([e]) => { st.seen = e.isIntersecting; sync(); }).observe(el);
  });

  // The strip loops on a copy of its list, added only where it may move.
  const strip = document.querySelector('.ticker__list');
  if (strip && !still) { const copy = strip.cloneNode(true); copy.setAttribute('aria-hidden', 'true'); strip.after(copy); }

  // The working day: one tab per person. People type, the bot answers at once, and each reply
  // lights its path through the flow beside it. A click on a reply shows its path again.
  const flow = document.querySelector('[data-flow]');
  const nodes = flow ? [...flow.querySelectorAll('[data-n]')] : [];
  const say = flow?.querySelector('[data-say]'), out = flow?.querySelector('[data-out]');
  let pathRun = 0;
  const wait = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const lastText = (li) => { const p = li?.querySelector('p'); return p ? [...p.childNodes].filter((n) => n.nodeName !== 'B').map((n) => n.textContent).join('') : ''; };
  const showPath = async (li, animate) => {
    if (!flow || !li) return;
    const me = ++pathRun;
    const path = li.dataset.path.split(',').map(Number), fail = li.dataset.fail === '' ? -1 : +li.dataset.fail, flag = li.dataset.flag === '' ? -1 : +li.dataset.flag;
    let ask = li.previousElementSibling; while (ask && !ask.classList.contains('chat__me')) ask = ask.previousElementSibling;
    if (ask?.textContent.trim().endsWith('y') && lastText(ask).trim() === 'y') { let q = ask.previousElementSibling; while (q && !q.classList.contains('chat__me')) q = q.previousElementSibling; ask = q; }
    say.textContent = lastText(ask);
    flow.dataset.kind = li.dataset.kind;
    document.querySelectorAll('.chat__bot.is-current').forEach((x) => x.classList.remove('is-current'));
    li.classList.add('is-current');
    const paint = (upTo) => {
      nodes.forEach((n, i) => {
        const at = path.indexOf(i);
        n.className = n.className.replace(/\bis-\S+/g, '').trim();
        if (at === -1) n.classList.add('is-skip');
        else if (at < upTo) n.classList.add(i === fail ? 'is-fail' : i === flag ? 'is-flag' : 'is-done');
        else if (at === upTo) n.classList.add('is-on');
      });
      const done = upTo >= path.length;
      out.textContent = done ? li.dataset['out' + (root.dataset.lang === 'it' ? 'It' : 'En')] : '';
      out.className = 'flow__out' + (done ? ' flow__out--' + li.dataset.kind : '');
    };
    if (!animate) { paint(path.length); return; }
    for (let i = 0; i <= path.length; i += 1) { if (me !== pathRun) return; paint(i); await wait(140); }
  };

  const panels = [...document.querySelectorAll('[data-chat]')];
  const tabs = [...document.querySelectorAll('.tabs [role="tab"]')];
  let chatRun = 0;
  const prep = (panel) => [...panel.querySelectorAll('.chat__log > li')].map((li) => {
    if (!li.classList.contains('chat__me')) return { li };
    const p = li.querySelector('p'), node = [...p.childNodes].pop(), text = node.textContent;
    const typed = document.createElement('span'), rest = document.createElement('span');
    rest.className = 'chat__rest'; rest.setAttribute('aria-hidden', 'true');
    node.replaceWith(typed, rest); typed.textContent = text;
    return { li, typed, rest, text };
  });
  const scripts = new Map(panels.map((panel) => [panel, prep(panel)]));
  const finish = (panel) => {
    chatRun += 1;
    scripts.get(panel).forEach((r) => { r.li.classList.remove('is-wait'); if (r.typed) { r.typed.textContent = r.text; r.rest.textContent = ''; } });
    const bots = panel.querySelectorAll('.chat__bot[data-path]'); showPath(bots[bots.length - 1], false);
  };
  const play = async (panel) => {
    if (still) { finish(panel); return; }
    const me = ++chatRun, steps = scripts.get(panel);
    steps.forEach((r) => r.li.classList.add('is-wait'));
    for (const r of steps) {
      await wait(r.typed ? 350 : 600);
      if (me !== chatRun) return;
      if (r.typed) { r.typed.textContent = ''; r.rest.textContent = r.text; }
      r.li.classList.remove('is-wait');
      if (r.typed) {
        for (let i = 1; i <= r.text.length; i += 1) { if (me !== chatRun) return; r.typed.textContent = r.text.slice(0, i); r.rest.textContent = r.text.slice(i); await wait(45 + Math.random() * 55); }
      } else if (r.li.dataset.path) {
        await showPath(r.li, true); await wait(700);
      }
    }
  };
  const select = (tab, focus) => {
    tabs.forEach((t) => { const on = t === tab; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; document.getElementById(t.getAttribute('aria-controls')).hidden = !on; });
    if (focus) tab.focus();
    play(document.getElementById(tab.getAttribute('aria-controls')));
  };
  if (panels.length) {
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => select(t));
      t.addEventListener('keydown', (e) => { const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key]; if (d) { e.preventDefault(); select(tabs[(i + d + tabs.length) % tabs.length], true); } });
    });
    panels.forEach((panel, i) => {
      if (i) panel.hidden = true;
      panel.addEventListener('click', (e) => { const li = e.target.closest('.chat__bot[data-path]'); if (li) { chatRun += 1; finish(panel); showPath(li, true); } else finish(panel); });
      panel.addEventListener('keydown', (e) => { const li = e.target.closest('.chat__bot[data-path]'); if (li && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); showPath(li, true); } });
    });
    const current = () => panels.find((x) => !x.hidden);
    document.querySelector('[data-chat-replay]')?.addEventListener('click', () => play(current()));
    finish(panels[0]);
    new IntersectionObserver(([e], obs) => { if (e.isIntersecting) { obs.disconnect(); play(current()); } }, { threshold: 0.3 }).observe(panels[0].parentElement);
  }

  // The Telegram session: plays once when it comes into view, people type and the bot answers.
  const tg = document.querySelector('[data-tg]');
  if (tg && !still) {
    const log = tg.querySelector('.tg__log');
    const steps = [...log.children].map((li) => {
      if (!li.classList.contains('tg__me')) return { li };
      const p = li.querySelector('p'), text = p.textContent;
      return { li, p, text };
    });
    let tgRun = 0;
    // Follow the newest message, unless the reader has scrolled up to read.
    let stick = true;
    log.addEventListener('scroll', () => { stick = log.scrollTop + log.clientHeight >= log.scrollHeight - 24; }, { passive: true });
    const follow = () => { if (stick) log.scrollTop = log.scrollHeight; };
    const show = (li) => { li.classList.remove('is-wait'); follow(); };
    const tgPlay = async () => {
      const me = ++tgRun;
      steps.forEach((r) => r.li.classList.add('is-wait'));
      stick = true;
      for (const r of steps) {
        await wait(r.p ? 500 : 700);
        if (me !== tgRun) return;
        if (!r.p) { show(r.li); continue; }
        r.p.textContent = ''; show(r.li);
        for (let i = 1; i <= r.text.length; i += 1) { if (me !== tgRun) return; r.p.textContent = r.text.slice(0, i); follow(); await wait(45 + Math.random() * 55); }
      }
    };
    tg.addEventListener('click', () => { tgRun += 1; steps.forEach((r) => { if (r.p) r.p.textContent = r.text; show(r.li); }); });
    new IntersectionObserver(([e], obs) => { if (e.isIntersecting) { obs.disconnect(); tgPlay(); } }, { threshold: 0.4 }).observe(tg);
  }

  // The bars grow once, as the chart scrolls into view.
  const chart = document.querySelector('.bars');
  if (chart) {
    chart.querySelectorAll('.bars__bar').forEach((b, i) => b.style.setProperty('--d', i));
    new IntersectionObserver(([e], obs) => { if (e.isIntersecting) { chart.classList.add('is-in'); obs.disconnect(); } }, { threshold: 0.3 }).observe(chart);
  }

  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -10% 0px' });
  document.querySelectorAll('[data-reveal]').forEach((el) => io.observe(el));
})();

// Activity panel: the numbers count up once, the first time it comes on screen.
(() => {
  const hud = document.querySelector('[data-hud]');
  if (!hud) return;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fmt = (v, d) => v.toFixed(d);
  new IntersectionObserver(([e], obs) => {
    hud.classList.toggle('is-running', e.isIntersecting && !still);
    if (!e.isIntersecting || still || hud.dataset.counted) return;
    hud.dataset.counted = '1';
    const cells = [...hud.querySelectorAll('[data-count]')];
    const t0 = performance.now(), dur = 1800;
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / dur), k = 1 - Math.pow(1 - p, 3);
      cells.forEach((c) => { c.textContent = fmt(+c.dataset.count * k, +c.dataset.dec); });
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }).observe(hud);
})();

// Seven switches: real ablation numbers per model. Only measured states show numbers: all on (full),
// one off (full-minus-X), all off (baseline); any other mix says it was not measured.
(() => {
  const lab = document.querySelector('[data-lab]');
  if (!lab) return;
  const data = JSON.parse(lab.querySelector('[data-lab-data]').textContent);
  const select = lab.querySelector('[data-lab-model]');
  const switches = [...lab.querySelectorAll('[data-feat]')];
  lab.hidden = false;
  lab.closest('figure').querySelector('.switches').hidden = true;

  const value = (config, kpi) => {
    const models = select.value === 'mean' ? data.models : [data.models[+select.value]];
    const vals = models.map((m) => m.kpi[config]?.[kpi]).filter((v) => v != null);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  };
  const render = () => {
    const off = switches.filter((s) => s.getAttribute('aria-checked') === 'false').map((s) => s.dataset.feat);
    const state = off.length === 0 ? 'full' : off.length === data.features.length ? 'baseline' : off.length === 1 ? 'one' : 'mixed';
    const config = { full: 'full', baseline: 'baseline', one: `full-minus-${off[0]}`, mixed: null }[state];
    lab.dataset.state = state;
    lab.querySelectorAll('[data-state]').forEach((p) => { p.hidden = p.dataset.state !== state; });
    lab.querySelectorAll('[data-lab-feat]').forEach((c) => { c.textContent = off[0] || ''; });
    lab.querySelectorAll('[data-kpi]').forEach((row) => {
      const k = row.dataset.kpi, v = config && value(config, k), ref = value('full', k);
      const delta = v == null || ref == null ? null : Math.round((v - ref) * 100);
      const worse = delta && (row.dataset.up === '1' ? delta < 0 : delta > 0);
      row.querySelector('.lab__bar').style.setProperty('--v', v ?? 0);
      row.querySelector('.lab__ref').style.setProperty('--v', ref ?? 0);
      row.querySelector('.lab__val').textContent = v == null ? '—' : `${Math.round(v * 100)}%`;
      row.querySelector('.lab__delta').textContent = !delta ? '' : `${delta > 0 ? '+' : '−'}${Math.abs(delta)} pt`;
      row.classList.toggle('is-worse', Boolean(worse));
    });
  };
  // A click flips the switch and opens its explanation; one open at a time.
  const open = (li) => lab.querySelectorAll('.lab__switches > li').forEach((x) => x.classList.toggle('is-open', x === li));
  switches.forEach((s) => s.addEventListener('click', () => {
    s.setAttribute('aria-checked', String(s.getAttribute('aria-checked') !== 'true'));
    open(s.parentElement);
    render();
  }));
  lab.querySelectorAll('[data-lab-all]').forEach((b) => b.addEventListener('click', () => {
    switches.forEach((s) => s.setAttribute('aria-checked', String(b.dataset.labAll === 'on'))); open(null); render();
  }));
  select.addEventListener('change', render);
  // an <option> cannot hold the two language spans, so its text follows the page language
  const mean = select.querySelector('[data-en]');
  const lang = () => { mean.textContent = mean.dataset[document.documentElement.lang] || mean.dataset.en; };
  new MutationObserver(lang).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  lang();
  render();
})();

// Cost calculator: requests a day on a log scale (10 to 5000), times 30 days, times the measured
// usd per step of each model.
(() => {
  const calc = document.querySelector('[data-calc]');
  if (!calc) return;
  const range = calc.querySelector('[data-calc-range]'), out = calc.querySelector('[data-calc-out]');
  const rows = [...calc.querySelectorAll('[data-usd]')];
  const perDay = () => { const v = 10 * Math.pow(500, range.value / 100), p = Math.pow(10, Math.floor(Math.log10(v)) - 1); return Math.round(v / p) * p; };
  const render = () => {
    const n = perDay(), lang = document.documentElement.lang || 'en';
    const money = new Intl.NumberFormat(lang, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
    const costs = rows.map((r) => n * 30 * +r.dataset.usd), top = Math.max(...costs);
    out.textContent = n.toLocaleString(lang);
    range.setAttribute('aria-valuetext', `${n.toLocaleString(lang)}`);
    rows.forEach((r, i) => {
      r.querySelector('.calc__bar').style.setProperty('--v', costs[i] / top);
      r.querySelector('.calc__val').textContent = money.format(costs[i]);
    });
  };
  range.addEventListener('input', render);
  new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  render();
})();

// Injection replay: the real event lines appear at their real offsets, once on screen or on Play.
(() => {
  const box = document.querySelector('[data-replay]');
  if (!box) return;
  const section = box.closest('section'), lines = [...box.querySelectorAll('[data-ms]')];
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let run = 0;
  const show = (li) => {
    li.classList.remove('is-wait');
    if (li.classList.contains('replay__line--data')) section.classList.add('is-read');
    if (li === lines.at(-1)) section.classList.add('is-done');
  };
  const play = () => {
    const me = ++run;
    section.classList.remove('is-read', 'is-done');
    if (still) { lines.forEach(show); return; }
    lines.forEach((li) => { li.classList.add('is-wait'); setTimeout(() => { if (me === run) show(li); }, +li.dataset.ms + 300); });
  };
  box.querySelector('[data-replay-play]').addEventListener('click', play);
  if (still) { play(); return; }
  lines.forEach((li) => li.classList.add('is-wait'));
  new IntersectionObserver(([e], obs) => { if (e.isIntersecting) { obs.disconnect(); play(); } }, { threshold: 0.5 }).observe(box);
})();
