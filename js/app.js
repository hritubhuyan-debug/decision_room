// Decision Room — app (plain JS, hash routing, no build step)
(function () {
  'use strict';
  if (window.DR_PREVIEW) return; // the phone-preview page only shows the frame

  // ---------- State ----------
  var STORE = 'dr-state-v1';
  var DEFAULT_STATE = {
    ess: { city: 'Bengaluru', budget: 130, bhk: 3, motivation: 'live', timing: '3m' },
    places: [{ label: 'Office', area: 'itpl', freq: 'daily', mode: 'car' }],
    mode: null, aiEnabled: false, household: [], cardAnswers: {}, cardIdx: 0, qIdx: 0, qAnswers: {},
    weights: null, suggested: null, locks: {}, alpha: 0.5,
    must: { budget: true, bhk: true, pets: false, lift: false, parking: false, ready: false },
    saved: [], status: {}, compare: [], comparedHistory: [], compareNote: '', scenarios: [],
    signedIn: false, signupAsked: false, filter: 'all', sort: 'fit', tab: 'why', setupDone: false
  };
  var S = load();
  var UI = { overlay: null, ai: {}, map: null, mapSel: null, undo: null, matchTimer: null, preview: '' };

  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(STORE));
      if (s && s.ess) {
        var m = Object.assign(clone(DEFAULT_STATE), s);
        if (!s.places) m.places = s.ess.work ? [{ label: 'Office', area: s.ess.work, freq: 'daily', mode: 'car' }] : clone(DEFAULT_STATE.places);
        delete m.ess.work;
        return m;
      }
    } catch (e) { /* ignore */ }
    return clone(DEFAULT_STATE);
  }
  function persist() { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch (e) { /* ignore */ } }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function aiOn() { return S.mode === 'quick' || S.aiEnabled; }
  function profile() { return { budget: S.ess.budget, bhk: S.ess.bhk, places: S.places || [], must: S.must }; }

  // ---------- Helpers ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(sel) { return document.querySelector(sel); }
  function go(route) { if (location.hash === '#/' + route) render(); else location.hash = '#/' + route; }
  function homeById(id) { for (var i = 0; i < HOMES.length; i++) if (HOMES[i].id === id) return HOMES[i]; return null; }
  function factorLabel(id) { for (var i = 0; i < FACTORS.length; i++) if (FACTORS[i].id === id) return FACTORS[i].label; return id; }
  function ranked() { return Scoring.rankAll(profile(), S.weights || baseWeights()); }
  function evalOf(id) { return Scoring.evaluate(homeById(id), profile(), S.weights || baseWeights()); }
  function isSaved(id) { return S.saved.indexOf(id) >= 0; }

  function toast(msg, actionLabel, action) {
    var t = $('#toast');
    t.innerHTML = '<span>' + esc(msg) + '</span>' + (actionLabel ? '<button type="button" class="toast-btn">' + esc(actionLabel) + '</button>' : '');
    t.hidden = false;
    if (actionLabel) t.querySelector('.toast-btn').onclick = function () { t.hidden = true; action(); };
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { t.hidden = true; }, actionLabel ? 7000 : 4500);
  }

  function baseWeights() {
    var m = S.ess.motivation, L = DEFAULT_WEIGHTS.live, I = DEFAULT_WEIGHTS.invest, w = {};
    FACTORS.forEach(function (f) { w[f.id] = m === 'live' ? L[f.id] : m === 'invest' ? I[f.id] : Math.round((L[f.id] + I[f.id]) / 2); });
    var hh = S.household;
    if (hh.indexOf('children') >= 0) w.schools = Math.max(w.schools, 6); else if (m !== 'invest') w.schools = 1;
    if (hh.indexOf('parents') >= 0) w.health = Math.min(10, w.health + 3);
    if (hh.indexOf('pets') >= 0) w.parks = Math.min(10, w.parks + 2);
    return w;
  }

  // ---------- Setup content ----------
  // Quick mode has two kinds of card:
  //  1. "About you": ONE characteristic. Swipe right = it matters, left = it doesn't.
  //  2. "Trade-off": TWO options that compete. Swipe toward the one you'd pick.
  var CARDS = [
    { id: 'household', type: 'chips', q: 'Who\u2019s moving in with you?', show: function () { return true; } },
    { id: 'k-schools', tint: 'sky', f: { schools: 1 }, text: 'Good schools close by', sub: 'Within a short drive or walk', icon: 'M3 9l9-5 9 5-9 5zM7 11v5c3 2 7 2 10 0v-5', show: function (m, hh) { return m !== 'invest' && hh.indexOf('children') >= 0; } },
    { id: 'k-parks', tint: 'teal', f: { parks: 1 }, text: 'A park or lake nearby', sub: 'For walks, kids or a dog', icon: 'M12 3l5 8H7zM12 11v10M8 21h8', show: function (m) { return m !== 'invest'; } },
    { id: 'k-shops', tint: 'beige', f: { shops: 1 }, text: 'Shops and caf\u00e9s you can walk to', sub: 'Groceries, pharmacy, a coffee', icon: 'M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2', show: function () { return true; } },
    { id: 'k-safety', tint: 'navy', f: { safety: 1 }, text: 'Streets that feel safe at night', sub: 'Well lit, settled, walkable', icon: 'M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z', show: function () { return true; } },
    { id: 'k-health', tint: 'sky', f: { health: 1 }, text: 'A hospital within easy reach', sub: 'About 2 km or less', icon: 'M12 6v12M6 12h12', show: function (m) { return m !== 'invest'; } },
    { id: 'k-transit', tint: 'teal', f: { transit: 1 }, text: 'A metro station nearby', sub: 'Good for everyone at home, and for resale', icon: 'M7 3h10v13H7zM7 11h10M9 20l-2 2M15 20l2 2', show: function () { return true; } },
    { id: 'k-community', tint: 'beige', f: { community: 1 }, text: 'A gated society with a clubhouse', sub: 'Pool, gym, play areas, security', icon: 'M4 21V9l8-5 8 5v12M9 21v-6h6v6', show: function () { return true; } },
    { id: 'k-rent', tint: 'sky', f: { investment: 1 }, text: 'Strong rental demand', sub: 'Easy to find tenants', icon: 'M4 12l8-7 8 7M9 20v-6h6v6', show: function (m) { return m !== 'live'; } },
    { id: 'k-resale', tint: 'teal', f: { investment: 1, transit: 0.5 }, text: 'Easy to resell later', sub: 'A sought-after area and layout', icon: 'M4 17l6-6 4 4 6-6M14 9h6v6', show: function (m) { return m !== 'live'; } },
    { id: 't-commute-space', kind: 'pair', q: 'If you can\u2019t have both, which wins?', opts: [['Shorter commute', { commute: 3 }, 'M5 17h14M7 17l1.5-5h7L17 17M8 20v-3M16 20v-3M9 12V9h6v3'], ['More space', { space: 3 }, 'M4 4h16v16H4zM4 12h8V4M12 16h8']], show: function (m) { return m !== 'invest'; } },
    { id: 't-price-new', kind: 'pair', q: 'If you can\u2019t have both, which wins?', opts: [['Lower price', { price: 3 }, 'M7 5h10M7 9h10M11 5c3 0 5 2 5 4s-2 4-5 4H8l7 7'], ['Newer building', { building: 3 }, 'M6 21V5l6-2 6 2v16M10 8h4M10 12h4M10 16h4']], show: function () { return true; } },
    { id: 't-quiet-connected', kind: 'pair', q: 'If you can\u2019t have both, which wins?', opts: [['A quiet lane', { safety: 2, parks: 1 }, 'M12 3l5 8H7zM12 11v10M4 21h16'], ['Close to shops and metro', { shops: 2, transit: 2 }, 'M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2']], show: function (m) { return m !== 'invest'; } },
    { id: 't-price-rent', kind: 'pair', q: 'If you can\u2019t have both, which wins?', opts: [['Lower price', { price: 3 }, 'M7 5h10M7 9h10M11 5c3 0 5 2 5 4s-2 4-5 4H8l7 7'], ['Stronger rental demand', { investment: 3 }, 'M4 12l8-7 8 7M9 20v-6h6v6']], show: function (m) { return m !== 'live'; } }
  ];
  var HOUSEHOLD = [['partner', 'Partner'], ['children', 'Children'], ['parents', 'Parents'], ['pets', 'Pets'], ['solo', 'Just me']];

  function visibleCards() { return CARDS.filter(function (c) { return c.show(S.ess.motivation, S.household); }); }

  function weightsFromCards() {
    var w = baseWeights();
    visibleCards().forEach(function (c) {
      var ans = S.cardAnswers[c.id];
      if (c.f && (ans === 'like' || ans === 'dislike')) {
        Object.keys(c.f).forEach(function (k) {
          var d = Math.round(4 * c.f[k]);
          w[k] = Math.max(0, Math.min(10, ans === 'like' ? Math.max(w[k] + d, 7) : w[k] - d));
        });
      }
      if (c.kind === 'pair' && ans != null && ans !== 'skip') {
        var picks = ans === 'both' ? [0, 1] : [+ans];
        picks.forEach(function (j) { var e = c.opts[j][1]; Object.keys(e).forEach(function (k) { w[k] = Math.min(10, w[k] + (ans === 'both' ? Math.ceil(e[k] / 2) : e[k])); }); });
      }
    });
    return w;
  }

  var QUESTIONS = {
    commute: ['How important is a short commute?', 'A long daily commute adds up to hours every week, and it’s hard to change after you buy.'],
    price: ['How important is getting good value for money?', 'Paying less leaves room for registration, interiors and savings.'],
    space: ['How important is extra space beyond the bedrooms you need?', 'Carpet area decides how the home feels day to day. Listings often quote larger “super built-up” figures.'],
    schools: ['How important are good schools nearby?', 'School runs happen every weekday for years; distance matters more than it seems.'],
    health: ['How important is healthcare nearby?', 'Matters most with young children, older parents or ongoing care needs.'],
    safety: ['How important is how safe the area feels?', 'Includes street lighting, walkability at night and how settled the area is.'],
    parks: ['How important are parks and green space?', 'Useful for children, pets, walks and exercise.'],
    shops: ['How important are shops and daily needs within easy reach?', 'Groceries, pharmacies and cafés you can walk to save daily time.'],
    transit: ['How important is public transport, like the metro?', 'Good transport helps every household member and supports resale value.'],
    community: ['How important are the community and society amenities?', 'Clubhouse, play areas and the kind of neighbours you’ll have.'],
    building: ['How important is a newer building in good condition?', 'Older buildings can mean more maintenance; new ones can carry delivery risk.'],
    investment: ['How important are rental demand and resale prospects?', 'Decides how easily you could rent out or sell later.']
  };
  function questionList() {
    var list = [{ id: 'household' }, { id: 'travel' }];
    FACTORS.forEach(function (f) {
      if (f.id === 'schools' && S.household.indexOf('children') < 0) return;
      if (f.id === 'investment' && S.ess.motivation === 'live') return;
      list.push({ id: f.id });
    });
    return list;
  }
  function weightsFromQuestions() {
    var w = {};
    FACTORS.forEach(function (f) { var a = S.qAnswers[f.id]; w[f.id] = a == null ? 0 : a === 'na' ? 0 : a; });
    return w;
  }

  // ---------- Interaction 1: expanding selector (pill → segmented control) ----------
  var MORPHS = {
    bhk: { label: 'Bedrooms', opts: [['1', '1 BHK', '1'], ['2', '2 BHK', '2'], ['3', '3 BHK', '3'], ['4', '4+ BHK', '4+']], get: function () { return String(S.ess.bhk); }, set: function (v) { S.ess.bhk = +v; } },
    motivation: { label: 'Buying to', opts: [['live', 'Live in', 'Live in'], ['invest', 'Invest', 'Invest'], ['both', 'Live in and invest', 'Both']], get: function () { return S.ess.motivation; }, set: function (v) { S.ess.motivation = v; S.weights = null; } },
    timing: { label: 'Moving', opts: [['explore', 'Just exploring', 'Exploring'], ['3m', 'Within 3 months', '3 months'], ['1m', 'Within a month', '1 month'], ['visiting', 'Already visiting homes', 'Visiting']], get: function () { return S.ess.timing; }, set: function (v) { S.ess.timing = v; } },
    sort: { label: 'Sort by', opts: [['fit', 'Best fit', 'Best fit'], ['price', 'Price', 'Price'], ['commute', 'Commute', 'Commute']], get: function () { return S.sort; }, set: function (v) { S.sort = v; } }
  };
  var CHEV = '<svg class="morph-chev" aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 7l-4 5 4 5M15 7l4 5-4 5"/></svg>';
  var CHECK = '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  function morph(name, extraClass) {
    var m = MORPHS[name], cur = m.get(), i = 0;
    m.opts.forEach(function (o, j) { if (o[0] === cur) i = j; });
    var open = UI.morph === name;
    if (!open) return '<div class="morph ' + (extraClass || '') + '" data-morph="' + name + '"><button type="button" class="morph-pill" data-action="morph-open" data-name="' + name + '" aria-expanded="false"><span class="morph-label">' + m.label + '</span><span class="morph-value">' + esc(m.opts[i][1]) + '</span>' + CHEV + '</button></div>';
    return '<div class="morph is-open ' + (extraClass || '') + '" data-morph="' + name + '"><div class="morph-panel" role="group" aria-label="' + m.label + '">' +
      '<div class="seg" style="--n:' + m.opts.length + ';--i:' + i + '"><span class="seg-thumb" aria-hidden="true"></span>' +
      m.opts.map(function (o, j) { return '<button type="button" class="seg-opt" data-action="morph-pick" data-name="' + name + '" data-value="' + esc(o[0]) + '" data-i="' + j + '" aria-pressed="' + (j === i) + '" title="' + esc(o[1]) + '">' + esc(o[2]) + '</button>'; }).join('') +
      '</div><button type="button" class="morph-done" data-action="morph-done" data-name="' + name + '" aria-label="Done">' + CHECK + '</button></div></div>';
  }
  // Segmented control with a sliding thumb (filters, tabs)
  function segInline(action, opts, cur, label) {
    var i = 0; opts.forEach(function (o, j) { if (o[0] === cur) i = j; });
    return '<div class="seg seg-inline" role="tablist" aria-label="' + esc(label) + '" style="--n:' + opts.length + ';--i:' + i + '"><span class="seg-thumb" aria-hidden="true"></span>' +
      opts.map(function (o, j) { return '<button type="button" role="tab" class="seg-opt" data-action="' + action + '" data-value="' + o[0] + '" data-i="' + j + '" aria-pressed="' + (j === i) + '" aria-selected="' + (j === i) + '">' + esc(o[1]) + '</button>'; }).join('') + '</div>';
  }
  function slideThumb(btn) {
    var seg = btn.closest('.seg'); seg.style.setProperty('--i', btn.getAttribute('data-i'));
    seg.querySelectorAll('.seg-opt').forEach(function (b) { b.setAttribute('aria-pressed', b === btn); b.setAttribute('aria-selected', b === btn); });
  }
  function scoreBlock(e) {
    return '<div class="score"><span class="score-num">' + (e.hi > e.lo ? e.lo + '–' + e.hi : e.lo) + '</span><span class="score-unit">fit with your priorities</span>' +
      (e.hi > e.lo ? (function (n) { return '<span class="score-pill">' + n + (n === 1 ? ' unknown widens' : ' unknowns widen') + ' the range</span>'; })(e.rows.filter(function (r) { return r.w > 0 && r.v == null; }).length) : '') + '</div>';
  }

  // ---------- Shared bits ----------
  function evChip(label, source) {
    return '<button type="button" class="ev ev-' + esc(label) + '" data-action="ev" data-l="' + esc(label) + '" data-s="' + esc(source) + '">' + esc(label) + '</button>';
  }
  function band(e, big) {
    return '<div class="band' + (big ? ' band-big' : '') + '" role="img" aria-label="Fit ' + e.lo + (e.hi > e.lo ? ' to ' + e.hi : '') + ' out of 100">' +
      '<div class="band-track"><div class="band-solid" style="width:' + e.lo + '%"></div><div class="band-hatch" style="left:' + e.lo + '%;width:' + (e.hi - e.lo) + '%"></div></div>' +
      '<span class="band-val">' + e.lo + (e.hi > e.lo ? '–' + e.hi : '') + '</span></div>';
  }
  function reasonLine(e) {
    var r = e.rows.filter(function (x) { return x.w > 0 && x.pts != null; }).sort(function (a, b) { return b.pts - a.pts; }).slice(0, 2);
    return r.length ? 'Strong on ' + r.map(function (x) { return x.label.toLowerCase(); }).join(' and ') : 'Not enough known yet';
  }
  function tradeoffLine(e) {
    var r = e.rows.filter(function (x) { return x.w >= 5 && x.v != null && x.v < 0.5; }).sort(function (a, b) { return b.w - a.w; })[0];
    return r ? 'Weaker on ' + r.label.toLowerCase() + ' (' + r.d + ')' : 'No big trade-off among your top priorities';
  }
  function imgUrl(id, w) { return 'https://images.unsplash.com/photo-' + id + '?auto=format&fit=crop&q=70&w=' + w; }
  function photo(h, cls) {
    var hero = /photo-hero/.test(cls || '');
    if (!h.img) return '<div class="photo ' + (cls || '') + '"><img src="' + esc(h.photo) + '" alt="' + esc(h.name) + ', building exterior" loading="lazy" onload="this.classList.add(\'is-loaded\')"></div>';
    var id = h.img.id, sizes = hero ? '(min-width: 900px) 760px, 100vw' : '(min-width: 900px) 168px, 84vw';
    return '<div class="photo ' + (cls || '') + '"><img src="' + imgUrl(id, 1200) + '" srcset="' + imgUrl(id, 480) + ' 480w, ' + imgUrl(id, 800) + ' 800w, ' + imgUrl(id, 1200) + ' 1200w, ' + imgUrl(id, 1800) + ' 1800w" sizes="' + sizes + '"' +
      ' alt="' + esc(h.name) + ', building exterior"' + (hero ? '' : ' loading="lazy"') + ' decoding="async" onload="this.classList.add(\'is-loaded\')"' +
      ' onerror="this.onerror=null;this.removeAttribute(\'srcset\');this.src=\'' + esc(h.photo) + '\';if(this.nextElementSibling)this.nextElementSibling.hidden=true">' +
      (hero ? '<a class="credit" href="' + esc(h.img.page) + '" target="_blank" rel="noopener">Photo \u00b7 ' + esc(h.img.by) + ' / Unsplash</a>' : '') + '</div>';
  }
  function aiBadge() { return '<span class="ai-badge">AI</span>'; }
  function aiBlock(key, render) {
    var st = UI.ai[key];
    if (!st) return '';
    if (st.loading) return '<p class="ai-loading" role="status">' + aiBadge() + ' Thinking…</p>';
    if (st.err) return '<p class="ai-err" role="status">' + esc(st.err) + '</p>';
    return render(st.res);
  }
  function runAI(key, task, payload, after) {
    UI.ai[key] = { loading: true }; render();
    AI.ask(task, payload).then(function (res) {
      UI.ai[key] = { res: res }; if (after) after(res); render();
    }).catch(function (err) { UI.ai[key] = { err: AI.errorMessage(err) }; render(); });
  }
  function topPriorities(n) {
    var w = S.weights || baseWeights(), sum = 0;
    FACTORS.forEach(function (f) { sum += w[f.id]; });
    return FACTORS.map(function (f) { return { factor: f.label, share: sum ? Math.round(w[f.id] / sum * 100) : 0 }; })
      .sort(function (a, b) { return b.share - a.share; }).slice(0, n);
  }
  function homePayload(e) {
    return {
      name: e.home.name, area: e.home.area, price: Format.price(e.home.price), bhk: e.home.bhk,
      fit: e.lo === e.hi ? String(e.lo) : e.lo + '-' + e.hi,
      listedBy: e.home.listedBy, confirmed: Format.days(e.home.confirmedDays),
      mustHaves: e.gate.fails.map(function (f) { return 'FAILS: ' + f.text; }).concat(e.gate.unknown.map(function (u) { return 'UNKNOWN: ' + u.text; })),
      factors: e.rows.filter(function (r) { return r.w > 0; }).map(function (r) { return { f: r.label, share: r.share + '%', score: r.v == null ? null : Math.round(r.v * 100), label: r.l, detail: r.d }; }),
      concerns: e.concerns
    };
  }

  // ---------- Your important places ----------
  var PLACE_LABELS = [['Office', 'Office'], ['Partner\u2019s office', 'Partner\u2019s office'], ['School', 'School'], ['College', 'College'], ['Parents', 'Parents'], ['Other', 'Other']];
  var FREQS = [['daily', 'Daily'], ['few', 'A few times a week'], ['weekly', 'Weekly']];
  var MODES_UI = [['car', 'Car'], ['bike', 'Two-wheeler'], ['metro', 'Metro'], ['walk', 'Walk']];
  function labelOf(list, v) { for (var i = 0; i < list.length; i++) if (list[i][0] === v) return list[i][1]; return v; }
  function placesList() {
    var rows = S.places.map(function (p, i) {
      var a = WORK_PLACES[p.area];
      return '<div class="place-row"><span class="place-pin" aria-hidden="true">' + (i + 1) + '</span><span class="place-text"><b>' + esc(p.label) + '</b> \u00b7 ' + esc(a ? a.name : 'Choose an area') +
        '<br><span class="muted">' + esc(labelOf(FREQS, p.freq)) + ' \u00b7 ' + esc(labelOf(MODES_UI, p.mode)) + '</span></span>' +
        '<button type="button" class="btn btn-small" data-action="place-edit" data-i="' + i + '">Edit</button></div>';
    }).join('');
    return '<div class="places">' + (rows || '<p class="muted place-empty">No places yet. Add where you travel to, and we\u2019ll estimate the commute from every home.</p>') +
      (S.places.length < 3 ? '<button type="button" class="btn btn-ghost place-add" data-action="place-add">+ Add a place</button>' : '') + '</div>';
  }
  function placeEditor(o) {
    var d = o.draft, areas = Object.keys(WORK_PLACES).sort(function (x, y) { return WORK_PLACES[x].name.localeCompare(WORK_PLACES[y].name); });
    return '<h2>' + (o.idx == null ? 'Add a place' : 'Edit place') + '</h2>' +
      '<div class="field"><span class="label">What is it?</span>' + chipGroup('place-label', PLACE_LABELS, d.label) + '</div>' +
      '<div class="field"><label for="place-area">Where is it?</label><select id="place-area" data-bind="place-area"><option value="">Choose an area</option>' +
      areas.map(function (k) { return '<option value="' + k + '"' + (d.area === k ? ' selected' : '') + '>' + esc(WORK_PLACES[k].name) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><span class="label">How often do you go?</span>' + chipGroup('place-freq', FREQS, d.freq) + '</div>' +
      '<div class="field"><span class="label">How do you usually travel?</span>' + chipGroup('place-mode', MODES_UI, d.mode) + '</div>' +
      '<p class="muted">Daily trips count most in the commute score. Times are estimates for a weekday at 9 am.</p>' +
      '<button type="button" class="btn btn-primary btn-block" data-action="place-save">Save place</button>' +
      (o.idx != null ? '<button type="button" class="btn btn-link" data-action="place-remove">Remove this place</button>' : '');
  }

  // ---------- Layout ----------
  var MAIN = { discover: 1, home: 1, saved: 1, compare: 1, you: 1 };
  function shell(route, inner) {
    if (!MAIN[route]) return '<main class="setup" id="main">' + inner + '</main>';
    var nav = [['discover', 'Discover', 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'], ['saved', 'Saved', 'M6 3h12v18l-6-4-6 4z'], ['priorities', 'Priorities', 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0'], ['you', 'You', 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9a8 8 0 0 1 16 0']];
    var cur = route === 'home' ? 'discover' : route === 'compare' ? 'saved' : route;
    var links = nav.map(function (n) {
      var act = n[0] === 'priorities' ? 'data-action="open-priorities"' : 'href="#/' + n[0] + '"';
      var tag = n[0] === 'priorities' ? 'button type="button"' : 'a';
      var end = n[0] === 'priorities' ? 'button' : 'a';
      return '<' + tag + ' class="nav-link' + (cur === n[0] ? ' is-active' : '') + '" ' + act + (cur === n[0] ? ' aria-current="page"' : '') + '><svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="' + n[2] + '"/></svg><span>' + n[1] + '</span></' + end + '>';
    }).join('');
    var aiCtl = S.mode === 'step'
      ? '<label class="ai-switch"><input type="checkbox" data-action="toggle-ai"' + (S.aiEnabled ? ' checked' : '') + '> Enable AI mode</label>'
      : '<span class="ai-pill">AI help on</span>';
    return '<header class="topbar"><a class="brand" href="#/discover"><svg class=\'logo-mark\' aria-hidden=\'true\' viewBox=\'0 0 32 32\' width=\'28\' height=\'28\'><rect width=\'32\' height=\'32\' rx=\'9\' fill=\'#2F4156\'/><path d=\'M9 22V14l7-5 7 5v8\' fill=\'none\' stroke=\'#C8D9E6\' stroke-width=\'2.2\' stroke-linejoin=\'round\'/><path d=\'M13 22v-4.5a3 3 0 0 1 6 0V22\' fill=\'none\' stroke=\'#fff\' stroke-width=\'2.2\'/></svg><span>Decision Room</span></a><nav class="nav nav-top" aria-label="Main">' + links + '</nav>' + aiCtl + '</header>' +
      '<main id="main" class="main main-' + route + '">' + inner + '</main>' +
      '<nav class="nav nav-bottom" aria-label="Main">' + links + '</nav>';
  }

  // ---------- Setup views ----------
  function vWelcome() {
    return '<div class="setup-col welcome">' +
      '<div class="brand-lockup"><svg class=\'logo-mark\' aria-hidden=\'true\' viewBox=\'0 0 32 32\' width=\'28\' height=\'28\'><rect width=\'32\' height=\'32\' rx=\'9\' fill=\'#2F4156\'/><path d=\'M9 22V14l7-5 7 5v8\' fill=\'none\' stroke=\'#C8D9E6\' stroke-width=\'2.2\' stroke-linejoin=\'round\'/><path d=\'M13 22v-4.5a3 3 0 0 1 6 0V22\' fill=\'none\' stroke=\'#fff\' stroke-width=\'2.2\'/></svg><span>Decision Room</span></div><p class="eyebrow">Bengaluru \u00b7 Early access</p>' +
      '<h1>Find a home that fits your life, and see what we know for sure</h1>' +
      marquee() +
      '<a class="btn btn-primary btn-block" href="#/essentials">Start</a>' +
      '<p class="muted center">No sign-up needed to browse.</p><p class="fineprint center">Listings are sample data and AI answers are simulated, for demonstration.</p></div>';
  }

  // Interaction 2 (welcome): sliding feature cards. Duplicated once for a seamless loop.
  function marquee() {
    var icon = function (d) { return '<svg aria-hidden="true" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="' + d + '"/></svg>'; };
    var items = [
      ['f-navy', 'Ranked by your priorities', 'You set the weights. Change them any time.', 'M8 28h6V18H8zM17 28h6V10h-6zM26 28h6V22h-6z'],
      ['f-sky', 'See the life around it', 'Commute, schools, parks and transport on one map.', 'M20 34s10-9 10-16a10 10 0 0 0-20 0c0 7 10 16 10 16zM20 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
      ['f-teal', 'Know what’s verified', 'Every fact says if it’s verified, estimated or unknown.', 'M20 6l11 4v9c0 7-5 12-11 15-6-3-11-8-11-15v-9zM15 20l4 4 7-8'],
      ['f-white', 'AI when you want it', 'Go quick with AI help, or step by step on your own.', 'M20 8v6M20 26v6M8 20h6M26 20h6M12 12l4 4M24 24l4 4M28 12l-4 4M16 24l-4 4']
    ];
    var one = items.map(function (it, k) { return '<div class="feature ' + it[0] + '"' + (k >= 4 ? ' aria-hidden="true"' : '') + '>' + icon(it[3]) + '<div><b>' + it[1] + '</b><br><span>' + it[2] + '</span></div></div>'; });
    var copy = items.map(function (it) { return '<div class="feature ' + it[0] + '" aria-hidden="true">' + icon(it[3]) + '<div><b>' + it[1] + '</b><br><span>' + it[2] + '</span></div></div>'; });
    return '<div class="marquee" aria-label="What Decision Room does"><div class="marquee-track">' + one.join('') + copy.join('') + '</div></div>';
  }

  function chipGroup(name, options, current, multi) {
    return '<div class="chips" role="group">' + options.map(function (o) {
      var on = multi ? current.indexOf(o[0]) >= 0 : current === o[0];
      return '<button type="button" class="chip' + (on ? ' is-on' : '') + '" aria-pressed="' + on + '" data-action="chip" data-name="' + name + '" data-value="' + esc(o[0]) + '">' + esc(o[1]) + '</button>';
    }).join('') + '</div>';
  }

  function vEssentials() {
    var e = S.ess;
    return '<div class="setup-col"><p class="step-label">Step 1 of 3 · The essentials</p><h1>Let’s start with the basics</h1>' +
      '<div class="field"><label for="city">City</label><select id="city" data-bind="city"><option>Bengaluru</option><option disabled>Pune (coming soon)</option><option disabled>Hyderabad (coming soon)</option></select></div>' +
      '<div class="field"><label for="budget">Budget, all-in including registration: <b id="budget-val">' + Format.price(e.budget) + '</b></label><input id="budget" type="range" min="50" max="250" step="5" value="' + e.budget + '" data-bind="budget"></div>' +
      '<div class="field"><span class="label">Tap to change</span>' + morph('bhk') + morph('motivation') + morph('timing') + '</div>' +
      '<div class="field"><span class="label">Your important places <span class="muted">(up to 3, optional)</span></span>' + placesList() + '</div>' +
      '<a class="btn btn-primary btn-block" href="#/mode">Continue</a></div>';
  }

  function vMode() {
    return '<div class="setup-col"><a class="back" href="#/essentials">‹ Back</a><p class="step-label">Step 2 of 3 · Your pace</p><h1>How would you like to tell us what matters?</h1>' +
      '<div class="mode-cards">' +
      '<button type="button" class="mode-card' + (S.mode === 'quick' ? ' is-on' : '') + '" data-action="pick-mode" data-value="quick"><span class="tag">About 3 min</span><b>Quick, with AI help</b><span>Answer a few quick trade-offs. AI suggests your priorities and explains your matches.</span></button>' +
      '<button type="button" class="mode-card' + (S.mode === 'step' ? ' is-on' : '') + '" data-action="pick-mode" data-value="step"><span class="tag">About 8 min</span><b>Step by step, you decide</b><span>One question at a time. You set every priority yourself. No AI, unless you turn it on later.</span></button>' +
      '</div><p class="muted center">You can switch any time in You.</p></div>';
  }

  function vCards() {
    var cards = visibleCards(), i = Math.min(S.cardIdx, cards.length - 1), c = cards[i];
    if (c.type === 'chips') {
      return '<div class="setup-col"><button type="button" class="back" data-action="card-back">‹ Back</button><p class="step-label">About you</p><h1 class="card-q">' + esc(c.q) + '</h1>' +
        '<p class="muted">Pick all that apply. Then swipe through a short deck: right if something matters, left if it doesn’t.</p>' + chipGroup('household', HOUSEHOLD, S.household, true) +
        '<button type="button" class="btn btn-primary btn-block" data-action="card-next">Start swiping</button></div>';
    }
    // One continuous deck: every remaining card is in the stack; swiping never reloads the page.
    var deck = cards.slice(i).filter(function (x) { return x.type !== 'chips'; });
    var coach = S.deckCoach ? '' : '<div class="coach" id="coach" role="dialog" aria-modal="true" aria-labelledby="coach-h"><div class="coach-in">' +
      '<h2 id="coach-h">Swipe to show what matters</h2><p>Every swipe tunes which homes rise to the top. You can change anything later.</p>' +
      '<div class="coach-demo" aria-hidden="true"><span class="coach-side">←<br>Not for me</span><span class="coach-card"><svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11V5a1.5 1.5 0 0 1 3 0v5M12 10V4a1.5 1.5 0 0 1 3 0v6M15 10V6a1.5 1.5 0 0 1 3 0v7a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-3l-2.5-4a1.5 1.5 0 0 1 2.5-1.6L9 13"/></svg></span><span class="coach-side">→<br>Matters</span></div>' +
      '<p class="coach-note">For trade-offs, swipe toward the one you’d pick.</p>' +
      '<button type="button" class="coach-btn" data-action="coach-done">Got it, start swiping</button></div></div>';
    return '<div class="deck-screen"><div class="deck-head"><button type="button" class="deck-back" data-action="deck-exit" aria-label="Back to choosing a pace">‹</button><b>What matters to you</b></div>' +
      '<div class="deck-meta"><span>✦ Shaping your matches</span><span id="deck-count" aria-live="polite"></span></div>' +
      '<div class="deck-progress" aria-hidden="true"><span id="deck-bar"></span></div>' +
      '<div class="deck" id="deck">' + deck.map(deckCard).join('') + coach + '</div>' +
      '<div class="deck-buttons" id="deck-buttons"></div></div>';
  }
  function deckCard(c) {
    var art = function (d, size) { return '<svg class="scene-icon" aria-hidden="true" viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="' + d + '"/></svg>'; };
    if (c.kind === 'pair') {
      var A = c.opts[0][0], B = c.opts[1][0];
      return '<div class="swipe-card deck-card swipe-pair" data-id="' + c.id + '" data-kind="pair" data-a="' + esc(A) + '" data-b="' + esc(B) + '" tabindex="-1" role="group" aria-label="Trade-off: ' + esc(A) + ' or ' + esc(B) + '. Swipe left for ' + esc(A) + ', right for ' + esc(B) + '.">' +
        '<span class="deck-tag">Trade-off</span><span class="stamp stamp-like" aria-hidden="true">' + esc(B) + '</span><span class="stamp stamp-nope" aria-hidden="true">' + esc(A) + '</span>' +
        '<div class="pair-scene"><div class="swipe-opt scene tint-sky" data-side="0">' + art(c.opts[0][2], 72) + '<b>' + esc(A) + '</b><span class="opt-hint">← swipe left</span></div>' +
        '<div class="swipe-opt scene tint-teal" data-side="1">' + art(c.opts[1][2], 72) + '<b>' + esc(B) + '</b><span class="opt-hint">swipe right →</span></div><span class="pair-or" aria-hidden="true">or</span></div>' +
        '<div class="deck-caption"><b>If you can’t have both, which wins?</b></div></div>';
    }
    return '<div class="swipe-card deck-card swipe-single" data-id="' + c.id + '" data-kind="single" tabindex="-1" role="group" aria-label="' + esc(c.text) + '. Swipe right if it matters to you, left if it doesn’t.">' +
      '<span class="deck-tag">About you</span><span class="stamp stamp-like" aria-hidden="true">Matters</span><span class="stamp stamp-nope" aria-hidden="true">Not for me</span>' +
      '<div class="scene tint-' + (c.tint || 'sky') + '">' + art(c.icon, 120) + '</div>' +
      '<div class="deck-caption"><b>' + esc(c.text) + '</b><span>' + esc(c.sub) + '</span></div></div>';
  }
  function roundBtn(val, glyph, caption, label, cls) {
    return '<button type="button" class="round-btn' + (cls ? ' ' + cls : '') + '" data-action="card-pick" data-value="' + val + '" aria-label="' + esc(label) + '"><span class="round-glyph" aria-hidden="true">' + glyph + '</span><span class="round-cap">' + esc(caption) + '</span></button>';
  }
  // Positions the stack, sets the counter and the button row for whichever card is on top.
  function syncDeck() {
    var deckEl = document.getElementById('deck'); if (!deckEl) return;
    var els = deckEl.querySelectorAll('.swipe-card:not(.is-gone)');
    els.forEach(function (el, k) { el.setAttribute('data-pos', Math.min(k, 3)); el.style.zIndex = 50 - k; if (k === 0) el.id = 'swipe-card'; else el.removeAttribute('id'); el.setAttribute('aria-hidden', k === 0 ? 'false' : 'true'); });
    var total = visibleCards().filter(function (x) { return x.type !== 'chips'; }).length, done = total - els.length;
    var bar = document.getElementById('deck-bar'); if (bar) bar.style.width = (total ? done / total * 100 : 0) + '%';
    var cnt = document.getElementById('deck-count'); if (cnt) cnt.textContent = Math.min(done + 1, total) + ' of ' + total;
    var top = els[0]; if (!top) return;
    var pair = top.getAttribute('data-kind') === 'pair', A = top.getAttribute('data-a'), B = top.getAttribute('data-b');
    var undo = '<button type="button" class="round-btn is-undo" data-action="card-back" aria-label="Undo last swipe"' + (S.cardIdx <= 1 ? ' disabled' : '') + '><span class="round-glyph" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4v6h6"/><path d="M5.5 15a7 7 0 1 0 1.6-7.3L4 10"/></svg></span><span class="round-cap">Undo</span></button>';
    var thumb = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10v11H4V10zM7 10l4-7a2 2 0 0 1 3 2l-1 5h5a2 2 0 0 1 2 2.3l-1.3 7A2 2 0 0 1 16.7 21H7"/></svg>';
    document.getElementById('deck-buttons').innerHTML = pair
      ? roundBtn('0', '←', A, 'Pick ' + A) + undo + roundBtn('1', '→', B, 'Pick ' + B, 'is-strong')
      : roundBtn('dislike', '✕', 'Not for me', 'Doesn’t matter to me') + undo + roundBtn('like', thumb, 'Matters', 'This matters to me', 'is-strong');
    initSwipe();
  }
  function vQuestions() {
    var list = questionList(), i = Math.min(S.qIdx, list.length - 1), q = list[i], body;
    if (q.id === 'household') {
      body = '<h1>Who’s moving in with you?</h1><p class="muted">Pick all that apply. This decides which questions follow.</p>' + chipGroup('household', HOUSEHOLD, S.household, true);
    } else if (q.id === 'travel') {
      body = '<h1>Where do you travel to regularly?</h1><p class="muted">Add up to 3 places, like your office, a school or your parents\u2019 home. We estimate the trip from every home, and daily trips count most.</p>' + placesList();
    } else {
      var t = QUESTIONS[q.id], a = S.qAnswers[q.id];
      var steps = '';
      for (var n = 0; n <= 10; n++) steps += '<button type="button" class="scale-step' + (a === n ? ' is-on' : '') + '" aria-pressed="' + (a === n) + '" data-action="q-answer" data-value="' + n + '">' + n + '</button>';
      body = '<h1>' + esc(t[0]) + '</h1><details class="why"><summary>Why it matters</summary><p>' + esc(t[1]) + '</p></details>' +
        '<div class="scale" role="group" aria-label="Importance from 0 to 10">' + steps + '</div><div class="scale-ends"><span>Not important</span><span>Essential</span></div>' +
        '<button type="button" class="btn btn-ghost' + (a === 'na' ? ' is-on' : '') + '" data-action="q-answer" data-value="na">Not relevant to me</button>';
    }
    return '<div class="setup-col"><button type="button" class="back" data-action="q-back">‹ Back</button><p class="step-label">' + (i + 1) + ' of ' + list.length + '</p>' +
      '<div class="progress"><div style="width:' + Math.round((i + 1) / list.length * 100) + '%"></div></div>' + body +
      '<button type="button" class="btn btn-primary btn-block" data-action="q-next">Next</button>' +
      '<button type="button" class="btn btn-link" data-action="q-later">Save and continue later</button></div>';
  }

  function mustList() {
    return MUST_HAVES.map(function (m) {
      var sub = m.id === 'budget' ? Format.price(S.ess.budget) : m.id === 'bhk' ? S.ess.bhk + ' BHK or more' : '';
      var hint = m.id === 'pets' && S.household.indexOf('pets') >= 0 && !S.must.pets ? '<span class="hint">You mentioned pets</span>' : '';
      return '<label class="switch-row"><span><b>' + esc(m.label) + '</b>' + (sub ? '<span class="muted"> · ' + esc(sub) + '</span>' : '') + hint + '</span><input type="checkbox" class="switch" data-action="must" data-id="' + m.id + '"' + (S.must[m.id] ? ' checked' : '') + '></label>';
    }).join('');
  }
  function vMust() {
    return '<div class="setup-col"><button type="button" class="back" data-action="must-back">‹ Back</button><p class="step-label">Step 3 of 3 · Dealbreakers</p><h1>Anything you can’t live without?</h1>' +
      '<p class="muted">Homes that fail these are hidden. They’re never weighed against anything else.</p><div class="switch-list">' + mustList() + '</div>' +
      '<a class="btn btn-primary btn-block" href="#/priorities">Continue</a></div>';
  }

  // ---------- Priorities (page + overlay share this) ----------
  function prioritiesBody(context) {
    var w = S.weights, sum = 0;
    FACTORS.forEach(function (f) { sum += w[f.id]; });
    var order = FACTORS.slice().sort(function (a, b) { return w[b.id] - w[a.id]; });
    var rows = order.map(function (f) {
      var share = sum ? Math.round(w[f.id] / sum * 100) : 0, locked = !!S.locks[f.id];
      var mark = aiOn() && S.suggested ? '<span class="ai-mark" style="left:calc(' + S.suggested[f.id] * 10 + '% - 1px)" title="AI suggestion: ' + S.suggested[f.id] + '"></span>' : '';
      var note = f.id === 'commute' && !S.places.length ? '<span class="hint">Add your important places in Essentials to use this</span>' : '';
      return '<div class="slider-row"><div class="slider-head"><label for="w-' + f.id + '">' + esc(f.label) + '</label><span class="slider-meta"><b id="wv-' + f.id + '">' + w[f.id] + '</b> · <span id="ws-' + f.id + '">' + share + '%</span></span>' +
        '<button type="button" class="lock' + (locked ? ' is-on' : '') + '" data-action="lock" data-id="' + f.id + '" aria-pressed="' + locked + '" aria-label="' + (locked ? 'Unlock ' : 'Lock ') + esc(f.label) + '">' + (locked ? 'Locked' : 'Lock') + '</button></div>' +
        '<div class="slider-wrap">' + mark + '<input type="range" id="w-' + f.id + '" min="0" max="10" step="1" value="' + w[f.id] + '" data-action="weight" data-id="' + f.id + '"' + (locked ? ' disabled' : '') + '></div>' + note + '</div>';
    }).join('');
    var high = FACTORS.filter(function (f) { return w[f.id] >= 9; }).length;
    var alpha = S.ess.motivation === 'both' ? '<div class="slider-row alpha"><div class="slider-head"><label for="alpha">Live in ↔ Invest</label></div><input type="range" id="alpha" min="0" max="10" step="1" value="' + Math.round(S.alpha * 10) + '" data-action="alpha"><div class="scale-ends"><span>Live in</span><span>Invest</span></div></div>' : '';
    var whatif = aiOn() ? '<form class="whatif" data-action="whatif"><label for="whatif-in">' + aiBadge() + ' Ask a what-if</label><div class="row"><input id="whatif-in" maxlength="200" placeholder="What if commute matters most?" autocomplete="off"><button class="btn btn-primary" type="submit">Ask</button></div>' + aiBlock('whatif', function (r) { return r.json && r.json.note ? '<p class="ai-text">' + aiBadge() + ' ' + esc(r.json.note) + '</p>' : ''; }) + '</form>' : '';
    var scen = '<div class="scenarios"><button type="button" class="btn btn-ghost" data-action="save-scenario">Save as scenario</button>' + S.scenarios.map(function (s, i) { return '<button type="button" class="chip" data-action="apply-scenario" data-i="' + i + '">' + esc(s.name) + '</button>'; }).join('') + '</div>';
    var reset = aiOn() && S.suggested ? '<button type="button" class="btn btn-link" data-action="reset-suggested">Reset to AI suggestion</button>' : '';
    return '<p class="muted">Set how much each thing matters, from 0 to 10. The share shows its part of each home’s fit score.' + (aiOn() && S.suggested ? ' The small marker on each slider is the AI’s suggestion.' : '') + '</p>' +
      whatif + alpha + '<p id="preview" class="preview" aria-live="polite">' + esc(UI.preview) + '</p>' +
      (high >= 7 ? '<p class="note">When everything is top priority, nothing stands out. Try lowering a few.</p>' : '') +
      rows + reset + scen +
      '<h2 class="h-sub">Must-haves <span class="muted">· never weighed</span></h2><div class="switch-list">' + mustList() + '</div>' +
      (context === 'page' ? '<a class="btn btn-primary btn-block" href="#/matching">Show homes</a>' : '');
  }
  function vPriorities() {
    if (!S.weights) initWeights();
    return '<div class="setup-col"><button type="button" class="back" data-action="pri-back">‹ Back</button><h1>Your priorities</h1>' + prioritiesBody('page') + '</div>';
  }
  function initWeights() {
    if (S.mode === 'quick') { S.weights = weightsFromCards(); S.suggested = clone(S.weights); }
    else { S.weights = weightsFromQuestions(); S.suggested = null; }
    persist();
  }

  function vMatching() {
    var all = ranked(), pass = all.filter(function (e) { return e.gate.status === 'pass' || e.gate.status === 'check'; }).length;
    var removed = all.length - pass;
    clearTimeout(UI.matchTimer);
    UI.matchTimer = setTimeout(function () { S.setupDone = true; persist(); go('discover'); }, 1800);
    return '<div class="setup-col matching" role="status"><div class="spinner" aria-hidden="true"></div><h1>Checking homes</h1>' +
      '<p>' + all.length + ' homes checked · ' + removed + ' don’t meet your must-haves · ' + pass + ' scored on your priorities</p>' +
      '<p class="muted">Matching uses fixed rules, not AI, so the same choices always give the same results.</p></div>';
  }

  // ---------- Discover ----------
  function homeCard(e, rank) {
    var h = e.home, saved = isSaved(h.id), hasConcern = e.concerns.length > 0;
    var miss = e.gate.status === 'near' ? '<p class="flag flag-near">Near miss: ' + esc(e.gate.fails[0].text) + '</p>' : '';
    return '<article class="card' + (UI.mapSel === h.id ? ' is-sel' : '') + '" id="card-' + h.id + '" data-id="' + h.id + '">' +
      photo(h, 'photo-card') +
      '<div class="card-body"><div class="card-top"><h3><a href="#/home/' + h.id + '">' + (rank ? rank + '. ' : '') + esc(h.name) + '</a></h3><span class="price">' + Format.price(h.price) + '</span></div>' +
      '<p class="meta">' + h.bhk + ' BHK · ' + esc(h.area) + ' · ' + esc(h.listedBy) + '-listed · confirmed ' + Format.days(h.confirmedDays) + '</p>' +
      scoreBlock(e) + '<div class="band-noval">' + band(e) + '</div><p class="reason">' + esc(reasonLine(e)) + '</p><p class="tradeoff">' + esc(tradeoffLine(e)) + '</p>' + miss +
      (hasConcern && isSaved(h.id) ? '<p class="flag">⚠ ' + e.concerns.length + ' thing' + (e.concerns.length > 1 ? 's' : '') + ' to check before you visit</p>' : '') +
      '<div class="card-foot"><span class="muted">' + e.factsKnown + ' of ' + e.facts + ' facts known</span>' +
      '<span class="row-center"><button type="button" class="btn btn-small' + (saved ? ' is-on' : '') + '" data-action="save" data-id="' + h.id + '" aria-pressed="' + saved + '">' + (saved ? 'Saved' : 'Save') + '</button>' +
      '<a class="card-expand" href="#/home/' + h.id + '" aria-label="Open ' + esc(h.name) + '"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7"/></svg></a></span></div></div></article>';
  }

  function vDiscover() {
    var all = ranked(), pass = all.filter(function (e) { return e.gate.status === 'pass'; }), check = all.filter(function (e) { return e.gate.status === 'check'; }), near = all.filter(function (e) { return e.gate.status === 'near'; });
    if (!pass.length && !check.length) return vNoMatch(near);
    var list = S.filter === 'check' ? check : S.filter === 'near' ? near : pass.concat(check);
    list = list.filter(function (e) { return !(S.status[e.home.id] && S.status[e.home.id].step === 'Walk away'); });
    if (S.sort === 'price') list = list.slice().sort(function (a, b) { return a.home.price - b.home.price; });
    if (S.sort === 'commute') list = list.slice().sort(function (a, b) { var x = a.rows[0].v, y = b.rows[0].v; return (y == null ? -1 : y) - (x == null ? -1 : x); });
    var lowEv = all.filter(function (e) { return e.gate.status !== 'out'; }).every(function (e) { return e.factsKnown / e.facts < 0.75; });
    var banner = (pass.length + check.length) <= 2 ? '<p class="banner">Only ' + (pass.length + check.length) + ' homes fit your must-haves. <button type="button" class="btn-link" data-action="open-priorities">See what each rule costs</button></p>' :
      lowEv ? '<p class="banner">We know less about these homes, so fit ranges are wider.</p>' : '';
    var filters = segInline('filter', [['all', 'All · ' + (pass.length + check.length)], ['check', 'Needs checking · ' + check.length], ['near', 'Near misses · ' + near.length]], S.filter, 'Filter homes');
    return '<div class="discover"><section class="list-pane" aria-label="Matched homes"><div class="list-head"><h1>Worth considering</h1>' +
      filters + morph('sort', 'sort-morph') + banner + '</div>' +
      '<div class="cards-scroll">' + (list.length ? list.map(function (e, i) { return homeCard(e, S.filter === 'all' && S.sort === 'fit' ? i + 1 : 0); }).join('') : '<p class="empty">Nothing here right now.</p>') + '</div>' +
      '</section><section class="map-pane" aria-label="Map"><div id="map" class="map"></div></section></div>';
  }

  function vNoMatch(near) {
    var costs = Scoring.ruleCosts(profile(), S.weights);
    return '<div class="setup-col"><h1>No homes meet all your must-haves</h1><p>We checked ' + HOMES.length + ' homes and haven’t relaxed anything. Here’s what each rule costs you:</p>' +
      '<div class="panel">' + costs.map(function (c) { return '<div class="cost-row"><span><b>' + esc(c.label) + '</b><br><span class="muted">Turning it off brings back ' + c.n + ' home' + (c.n === 1 ? '' : 's') + '</span></span><button type="button" class="btn btn-small" data-action="must-off" data-id="' + c.id + '">Turn off</button></div>'; }).join('') + '</div>' +
      (near.length ? '<h2 class="h-sub">Closest misses</h2>' + near.slice(0, 3).map(function (e) { return '<p>' + esc(e.home.name) + ' · ' + esc(e.gate.fails[0].text) + '</p>'; }).join('') : '') +
      '<button type="button" class="btn btn-primary btn-block" data-action="open-priorities">Open Priorities</button></div>';
  }

  // ---------- Property detail ----------
  function vHome(id) {
    var h = homeById(id); if (!h) return '<div class="setup-col"><p>Home not found.</p><a href="#/discover">Back to Discover</a></div>';
    var e = evalOf(id), st = S.status[id], key = 'explain:' + id;
    var concerns = e.concerns.length ? '<section class="concerns" aria-label="Concerns"><h2>Before you decide</h2><ul>' + e.concerns.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ul>' + ownerBlock(e) + '</section>' : '';
    var next;
    if (aiOn()) {
      next = '<section class="next-box"><h2>' + aiBadge() + ' Suggested next step</h2>' +
        (UI.ai[key] ? aiBlock(key, function (r) {
          var j = r.json || {};
          return (j.why ? '<p class="ai-text">' + esc(j.why) + '</p>' : '<p class="ai-text">' + esc(r.text) + '</p>') + (j.tradeoff ? '<p class="ai-text muted">' + esc(j.tradeoff) + '</p>' : '') + (j.next ? '<p class="ai-next"><b>' + esc(j.next) + '</b> · ' + esc(j.reason || '') + '</p>' : '');
        }) : '<button type="button" class="btn btn-ghost" data-action="ai-explain" data-id="' + id + '">Explain this home with AI</button>') + '</section>';
    } else {
      var unknowns = e.rows.filter(function (r) { return r.w > 0 && r.v == null; }).map(function (r) { return r.label; }).concat(e.gate.unknown.map(function (u) { return u.text.replace(': can’t confirm', ''); }));
      next = '<section class="next-box"><h2>Still unknown</h2>' + (unknowns.length ? '<ul class="checklist">' + unknowns.map(function (u) { return '<li><label><input type="checkbox"> ' + esc(u) + '</label></li>'; }).join('') + '</ul>' : '<p>Everything you weighted is known.</p>') + '</section>';
    }
    var tabs = segInline('tab', [['why', 'Why it fits'], ['know', 'What we know'], ['life', 'Life around it']], S.tab, 'Home details');
    var body = S.tab === 'know' ? tabKnow(e) : S.tab === 'life' ? tabLife(e) : tabWhy(e);
    return '<div class="detail"><div class="detail-main"><a class="back" href="#/discover">‹ Worth considering</a>' + photo(h, 'photo-hero') +
      '<div class="detail-head"><h1>' + esc(h.name) + '</h1><p class="price-big">' + Format.price(h.price) + ' <span class="muted">all-in</span></p>' +
      '<p class="meta">' + h.bhk + ' BHK · ' + esc(h.area) + ' · ' + esc(h.listedBy) + '-listed · confirmed ' + Format.days(h.confirmedDays) + '</p></div>' +
      '<section class="fit-summary"><h2 class="sr">Fit with your priorities</h2>' + scoreBlock(e) + '<div class="band-noval">' + band(e, true) + '</div><p>' + esc(reasonLine(e)) + '. ' + esc(tradeoffLine(e)) + '.</p>' +
      (e.gate.status === 'near' ? '<p class="flag flag-near">Near miss: ' + esc(e.gate.fails[0].text) + '</p>' : '') + '</section>' +
      concerns + next +
      '<div class="detail-tabs">' + tabs + '</div><div class="tab-body" role="tabpanel">' + body + '</div></div>' +
      '<div class="sticky-bar"><button type="button" class="btn' + (isSaved(id) ? ' is-on' : '') + '" data-action="save" data-id="' + id + '">' + (isSaved(id) ? 'Saved' : 'Save') + '</button>' +
      '<button type="button" class="btn btn-primary" data-action="open-next" data-id="' + id + '">' + (st ? 'Next step: ' + esc(st.step) : 'Choose next step') + '</button></div></div>';
  }

  function ownerBlock(e) {
    var id = e.home.id, key = 'owner:' + id;
    if (!aiOn()) {
      var qs = e.gate.unknown.map(function (u) { return 'Can you confirm: ' + u.text.replace(': can’t confirm', '').toLowerCase() + '?'; });
      if (e.home.carpet.v == null) qs.push('What carpet area is written in the sale agreement?');
      return qs.length ? '<h3>Questions to ask the owner</h3><ul>' + qs.map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ul>' : '';
    }
    if (!UI.ai[key]) return '<button type="button" class="btn btn-ghost" data-action="ai-owner" data-id="' + id + '">' + aiBadge() + ' Draft questions for the owner</button>';
    return aiBlock(key, function (r) {
      var q = r.json && r.json.questions ? r.json.questions : [r.text];
      return '<h3>' + aiBadge() + ' Questions to ask the owner</h3><ul class="owner-q">' + q.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul><button type="button" class="btn btn-small" data-action="copy-owner" data-id="' + id + '">Copy questions</button><p class="muted">Nothing is sent. Copy and send them yourself.</p>';
    });
  }

  function tabWhy(e) {
    var rows = e.rows.filter(function (r) { return r.w > 0; }).sort(function (a, b) { return b.share - a.share; });
    return '<p class="muted">Points each priority adds to the fit score. Dashed bars are unknown.</p>' + rows.map(function (r) {
      var max = r.share, got = r.pts == null ? 0 : r.pts;
      return '<div class="why-row"><span class="why-label">' + esc(r.label) + ' <span class="muted">(' + r.share + '%)</span></span><div class="why-bar' + (r.v == null ? ' is-unknown' : '') + '"><div style="width:' + (max ? got / max * 100 : 0) + '%"></div></div><span class="why-pts">' + (r.pts == null ? '?' : got + '/' + max) + '</span></div>';
    }).join('');
  }
  function tabKnow(e) {
    var h = e.home;
    var facts = [['Price', Format.price(h.price), 'Verified', 'Listing, confirmed ' + Format.days(h.confirmedDays)],
      ['K-RERA', h.rera.v, h.rera.l, h.rera.s],
      ['Carpet area', h.carpet.v ? h.carpet.v.toLocaleString('en-IN') + ' sq ft' : 'Unclear', h.carpet.l, h.carpet.s],
      ['Pets', h.pets.v == null ? 'Not confirmed' : h.pets.v ? 'Allowed' : 'Not allowed', h.pets.l, h.pets.s],
      ['Lift', h.lift.v == null ? 'Not confirmed' : h.lift.v ? 'Yes' : 'No', h.lift.l, h.lift.s],
      ['Covered parking', h.parking.v == null ? 'Not confirmed' : h.parking.v ? 'Yes' : 'No', h.parking.l, h.parking.s],
      ['Ready to move in', h.ready.v ? 'Yes' : 'No', h.ready.l, h.ready.s]];
    e.rows.forEach(function (r) { if (['commute', 'safety', 'community', 'investment', 'building'].indexOf(r.id) >= 0 && r.d) facts.push([r.label, r.d, r.l, r.s]); });
    return '<p class="muted">Tap a label to see where it comes from.</p><dl class="facts">' + facts.map(function (f) {
      return '<div class="fact"><dt>' + esc(f[0]) + '</dt><dd>' + esc(f[1]) + ' ' + evChip(f[2], f[3]) + '</dd></div>';
    }).join('') + '</dl>';
  }
  function nearbyFor(h) {
    var w = S.weights, types = [['school', 'schools'], ['hospital', 'health'], ['park', 'parks'], ['metro', 'transit'], ['shops', 'shops']];
    return types.filter(function (t) { return w[t[1]] > 0; }).map(function (t) { var n = Scoring.nearest(h, t[0]); return n ? { type: t[0], name: n.p.name, km: Math.round(n.d * 10) / 10 } : null; }).filter(Boolean);
  }
  function tabLife(e) {
    var h = e.home, near = nearbyFor(h), key = 'neigh:' + h.id;
    var trips = e.rows[0].trips || [];
    var commute = trips.length ? '<h3 class="h-trips">Your trips from here</h3><ul class="near-list">' + trips.map(function (t) { return '<li><span><b>' + esc(t.label) + '</b> \u00b7 ' + esc(t.to) + '<br><span class="muted">' + esc(labelOf(FREQS, t.freq)) + '</span></span><span>' + t.lo + '\u2013' + t.hi + ' min ' + esc(t.how) + ' ' + evChip('Estimated', e.rows[0].s) + '</span></li>'; }).join('') + '</ul>' : '<p class="muted">Add your important places to see trip times from this home.</p>';
    var ai = aiOn() ? '<div class="ai-box">' + (UI.ai[key] ? aiBlock(key, function (r) { return '<p class="ai-text">' + aiBadge() + ' ' + esc(r.text) + '</p>'; }) : '<button type="button" class="btn btn-ghost" data-action="ai-neigh" data-id="' + h.id + '">' + aiBadge() + ' Summarise the neighbourhood for me</button>') + '</div>' : '';
    return commute + '<div id="mini-map" class="map map-mini"></div><ul class="near-list">' + near.map(function (n) { return '<li><span>' + esc(n.name) + '</span><span class="muted">about ' + n.km + ' km</span></li>'; }).join('') + '</ul><p class="muted">Distances are straight-line estimates.</p>' + ai;
  }

  // ---------- Saved & Compare ----------
  function vSaved() {
    var tab = S.savedTab || 'short';
    var walked = Object.keys(S.status).filter(function (id) { return S.status[id].step === 'Walk away'; });
    var short = S.saved.filter(function (id) { return walked.indexOf(id) < 0; });
    var ids = tab === 'walked' ? walked : short;
    var tabs = '<div class="tabs" role="tablist"><button type="button" role="tab" class="tab' + (tab === 'short' ? ' is-on' : '') + '" data-action="saved-tab" data-value="short">Shortlist · ' + short.length + '</button><button type="button" role="tab" class="tab' + (tab === 'walked' ? ' is-on' : '') + '" data-action="saved-tab" data-value="walked">Walked away · ' + walked.length + '</button></div>';
    var list = ids.length ? ids.map(function (id) {
      var e = evalOf(id), h = e.home, st = S.status[id], inCmp = S.compare.indexOf(id) >= 0;
      return '<article class="card card-row">' + photo(h, 'photo-thumb') + '<div class="card-body"><div class="card-top"><h3><a href="#/home/' + id + '">' + esc(h.name) + '</a></h3><span class="price">' + Format.price(h.price) + '</span></div>' + band(e) +
        (st ? '<p class="meta">Next step: <b>' + esc(st.step) + '</b>' + (st.reason ? ' · ' + esc(st.reason) : '') + '</p>' : '') +
        (tab === 'walked' ? '<button type="button" class="btn btn-small" data-action="restore" data-id="' + id + '">Restore</button>' : '<label class="cmp-check"><input type="checkbox" data-action="cmp-toggle" data-id="' + id + '"' + (inCmp ? ' checked' : '') + '> Compare</label>') + '</div></article>';
    }).join('') : '<p class="empty">' + (tab === 'walked' ? 'Homes you walk away from appear here, with your reason.' : 'Save homes from Discover to build your shortlist.') + '</p>';
    return '<div class="page"><h1>Saved</h1>' + tabs + list + (tab === 'short' && short.length ? '<a class="btn btn-primary btn-block" href="#/compare">Compare ' + S.compare.length + ' of 3</a>' : '') + '</div>';
  }

  function vCompare() {
    var ids = S.compare.filter(homeById);
    if (ids.length < 2) return '<div class="page"><a class="back" href="#/saved">‹ Saved</a><h1>Compare</h1><p class="empty">Pick 2 or 3 saved homes to compare.</p><a class="btn btn-primary" href="#/saved">Go to Saved</a></div>';
    var evs = ids.map(evalOf), w = S.weights;
    var order = FACTORS.filter(function (f) { return w[f.id] > 0; }).sort(function (a, b) { return w[b.id] - w[a.id]; });
    var head = '<tr><th scope="col" class="sticky-col">Your priorities</th>' + evs.map(function (e) { return '<th scope="col">' + photo(e.home, 'photo-thumb') + '<a href="#/home/' + e.home.id + '">' + esc(e.home.name) + '</a><div class="muted">' + Format.price(e.home.price) + '</div>' + band(e) + '</th>'; }).join('') + '</tr>';
    var concernRow = '<tr class="concern-row"><th scope="row" class="sticky-col">Concerns</th>' + evs.map(function (e) { return '<td>' + (e.concerns.length ? e.concerns.map(function (c) { return '<p>⚠ ' + esc(c) + '</p>'; }).join('') : '<span class="muted">None found</span>') + '</td>'; }).join('') + '</tr>';
    var rows = order.map(function (f) {
      var cells = evs.map(function (e) { for (var i = 0; i < e.rows.length; i++) if (e.rows[i].id === f.id) return e.rows[i]; });
      var best = Math.max.apply(null, cells.map(function (c) { return c.v == null ? -1 : c.v; }));
      return '<tr><th scope="row" class="sticky-col">' + esc(f.label) + ' <span class="muted">' + w[f.id] + '</span></th>' + cells.map(function (c) {
        return '<td' + (c.v != null && c.v === best && best >= 0 ? ' class="is-best"' : '') + '>' + esc(c.d || '—') + ' ' + evChip(c.l, c.s) + '</td>';
      }).join('') + '</tr>';
    }).join('');
    var key = 'compare:' + ids.join(',');
    var summary = aiOn() ? '<div class="ai-box">' + (UI.ai[key] ? aiBlock(key, function (r) { return '<p class="ai-text">' + aiBadge() + ' ' + esc(r.text) + '</p>'; }) : '<button type="button" class="btn btn-ghost" data-action="ai-compare">' + aiBadge() + ' Summarise this comparison</button>') + '</div>' : '';
    return '<div class="page page-wide"><a class="back" href="#/saved">‹ Saved</a><h1>Compare</h1>' + (S.compareNote ? '<p class="banner">' + esc(S.compareNote) + '</p>' : '') + summary +
      '<div class="table-wrap"><table class="compare"><thead>' + head + '</thead><tbody>' + concernRow + rows + '</tbody></table></div>' +
      '<div class="row-wrap"><button type="button" class="btn" data-action="open-priorities">Adjust priorities</button>' + evs.map(function (e) { return '<button type="button" class="btn" data-action="open-next" data-id="' + e.home.id + '">Next step: ' + esc(e.home.name) + '</button>'; }).join('') +
      '<button type="button" class="btn btn-primary" data-action="open-none">None of these</button></div></div>';
  }

  // ---------- You ----------
  function vYou() {
    return '<div class="page"><h1>You</h1><div class="panel">' +
      '<div class="cost-row"><span><b>Essentials</b><br><span class="muted">' + esc(S.ess.city) + ' · ' + Format.price(S.ess.budget) + ' · ' + S.ess.bhk + ' BHK · ' + (S.places.length ? S.places.length + ' important place' + (S.places.length > 1 ? 's' : '') : 'no important places') + '</span></span><a class="btn btn-small" href="#/essentials">Edit</a></div>' +
      '<div class="cost-row"><span><b>Mode</b><br><span class="muted">' + (S.mode === 'quick' ? 'Quick, with AI help' : 'Step by step') + '</span></span><button type="button" class="btn btn-small" data-action="switch-mode">Switch to ' + (S.mode === 'quick' ? 'step by step' : 'Quick') + '</button></div>' +
      (S.mode === 'step' ? '<label class="switch-row"><span><b>Enable AI mode</b><br><span class="muted">Explanations, summaries and what-ifs. Never changes your sliders on its own.</span></span><input type="checkbox" class="switch" data-action="toggle-ai"' + (S.aiEnabled ? ' checked' : '') + '></label>' : '') +
      '<div class="cost-row"><span><b>AI help</b><br><span class="muted">' + (AI.configured() ? 'Available' : AI.demo() ? 'Demo: answers are simulated from the listing facts' : 'Unavailable right now') + '</span></span></div>' +
      '<div class="cost-row"><span><b>Account</b><br><span class="muted">' + (S.signedIn ? 'Signed in' : 'Guest · saved on this device') + '</span></span></div>' +
      '<div class="cost-row"><span><b>Privacy</b><br><span class="muted">Your phone number is never shared. Browsing needs no sign-up.</span></span></div>' +
      '</div><button type="button" class="btn btn-link" data-action="reset-all">Clear my data on this device</button></div>';
  }

  // ---------- Overlays ----------
  function overlay() {
    var o = UI.overlay; if (!o) return '';
    var inner = '';
    if (o.type === 'priorities') inner = '<h2>Your priorities</h2>' + prioritiesBody('overlay');
    if (o.type === 'next') {
      var e = evalOf(o.id), ai = UI.ai['explain:' + o.id], sug = ai && ai.res && ai.res.json ? ai.res.json.next : null, cur = S.status[o.id];
      var opts = [['Shortlist', 'Keep it as a top option'], ['Visit', 'Adds its unknowns to your visit notes'], ['Investigate', 'Shows what to confirm first'], ['Walk away', 'Moves it to Walked away; you can restore it']];
      inner = '<h2>Next step for ' + esc(e.home.name) + '</h2>' + opts.map(function (op) {
        var on = o.pick ? o.pick === op[0] : cur ? cur.step === op[0] : sug === op[0];
        return '<button type="button" class="option-card' + (on ? ' is-on' : '') + '" data-action="pick-next" data-value="' + op[0] + '"><b>' + op[0] + (sug === op[0] && aiOn() ? ' ' + aiBadge() + '<span class="muted"> suggested</span>' : '') + '</b><span>' + op[1] + '</span></button>';
      }).join('') +
        (o.pick === 'Walk away' ? '<p class="label">Why? (optional)</p>' + chipGroup('walk-reason', [['Too expensive', 'Too expensive'], ['Too far', 'Too far'], ['Too small', 'Too small'], ['Concern about the building', 'Concern about the building'], ['Other', 'Other']], o.reason || '') : '') +
        (o.pick === 'Visit' ? visitNotes(e) : '') + (o.pick === 'Investigate' ? '<div class="note">' + ownerBlock(e) + '</div>' : '') +
        '<button type="button" class="btn btn-primary btn-block" data-action="confirm-next"' + (o.pick ? '' : ' disabled') + '>Confirm</button>';
    }
    if (o.type === 'none') {
      inner = '<h2>None of these?</h2><p class="muted">That’s a valid decision. Telling us why is optional and helps find better matches.</p>' +
        chipGroup('none-reason', [['Too far', 'All too far'], ['Too expensive', 'All too expensive'], ['Too small', 'All too small'], ['Not my style', 'Not my style']], o.reason || '') +
        '<button type="button" class="btn btn-primary btn-block" data-action="confirm-none">Show the next best homes</button>';
    }
    if (o.type === 'place') inner = placeEditor(o);
    if (o.type === 'signup') {
      inner = '<h2>Keep your shortlist on every device</h2><p class="muted">Sign up with email or phone so your saved homes follow you. We never share your number or email.</p>' +
        '<div class="field"><label for="su">Email or phone</label><input id="su" autocomplete="off"></div>' +
        '<button type="button" class="btn btn-primary btn-block" data-action="signup-ok">Continue</button><button type="button" class="btn btn-link" data-action="signup-later">Not now, keep it on this device</button>';
    }
    return '<div class="scrim" data-action="close-overlay"></div><div class="sheet sheet-' + o.type + '" role="dialog" aria-modal="true" aria-label="' + esc(o.type) + '"><button type="button" class="sheet-close" data-action="close-overlay" aria-label="Close">×</button>' + inner + '</div>';
  }
  function visitNotes(e) {
    var u = e.rows.filter(function (r) { return r.w > 0 && r.v == null; }).map(function (r) { return 'Check ' + r.label.toLowerCase(); }).concat(e.gate.unknown.map(function (x) { return 'Confirm ' + x.text.replace(': can’t confirm', '').toLowerCase(); }));
    return '<div class="note"><b>Added to your visit notes:</b><ul>' + (u.length ? u : ['Check light, noise and the building’s condition']).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';
  }

  // ---------- Swipe cards (Quick mode) ----------
  function commitCard(val) {
    var cards = visibleCards(), c = cards[Math.min(S.cardIdx, cards.length - 1)];
    if (val != null) S.cardAnswers[c.id] = val;
    S.cardIdx++; S.weights = null; persist();
    if (S.cardIdx >= visibleCards().length) go('must');
    else if (document.getElementById('deck') && val != null) syncDeck();
    else render();
  }
  var flying = false;
  function flyOut(val) {
    var card = document.getElementById('swipe-card'); if (!card) return;
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var left = val === 'dislike' || val === '0', right = val === 'like' || val === '1';
    var t = left ? 'translate(-150%, 30px) rotate(-22deg)' : right ? 'translate(150%, 30px) rotate(22deg)' : val === 'both' ? 'translateY(-130%) scale(.9)' : 'translateY(130%) scale(.9)';
    card.style.setProperty('--left', left ? 1 : 0); card.style.setProperty('--right', right ? 1 : 0);
    card.style.transition = reduce ? 'none' : 'transform 340ms cubic-bezier(.2,.8,.2,1), opacity 340ms';
    card.style.transform = t; card.style.opacity = '0'; card.classList.add('is-gone'); card.removeAttribute('id');
    // The next card rises at the same moment, so the deck never pauses.
    var deckEl = document.getElementById('deck');
    if (deckEl) deckEl.querySelectorAll('.swipe-card:not(.is-gone)').forEach(function (el, k) { el.setAttribute('data-pos', Math.min(k, 3)); });
    commitCard(String(val));
    setTimeout(function () { if (card.parentNode) card.parentNode.removeChild(card); }, reduce ? 0 : 360);
  }
  function initSwipe() {
    var card = document.getElementById('swipe-card'); if (!card || card.getAttribute('data-bound')) return;
    card.setAttribute('data-bound', '1');
    var startX = 0, startY = 0, dx = 0, dragging = false, moved = false, THRESH = 90;
    card.addEventListener('pointerdown', function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      dragging = true; moved = false; startX = e.clientX; startY = e.clientY; dx = 0;
      card.style.transition = 'none'; card.classList.add('is-dragging');
      if (card.setPointerCapture) card.setPointerCapture(e.pointerId);
    });
    card.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      dx = e.clientX - startX; var dy = e.clientY - startY;
      if (Math.abs(dx) > 4) moved = true;
      card.style.transform = 'translate(' + dx + 'px,' + dy * 0.15 + 'px) rotate(' + dx / 18 + 'deg)';
      var p = Math.min(1, Math.abs(dx) / THRESH);
      card.style.setProperty('--left', dx < 0 ? p : 0); card.style.setProperty('--right', dx > 0 ? p : 0);
    });
    function end() {
      if (!dragging) return; dragging = false; card.classList.remove('is-dragging');
      var pair = card.getAttribute('data-kind') === 'pair';
      if (Math.abs(dx) >= THRESH) { flyOut(dx < 0 ? (pair ? '0' : 'dislike') : (pair ? '1' : 'like')); return; }
      card.style.transition = 'transform 280ms cubic-bezier(.2,.8,.2,1)'; card.style.transform = '';
      card.style.setProperty('--left', 0); card.style.setProperty('--right', 0);
    }
    card.addEventListener('pointerup', end); card.addEventListener('pointercancel', end);
    card.addEventListener('click', function (e) {
      if (moved) return; var opt = e.target.closest('.swipe-opt'); if (opt) flyOut(opt.getAttribute('data-side'));
    });
  }

  // ---------- Map ----------
  // Basemap: CARTO Positron when a free key is set in config.js; otherwise OpenStreetMap tiles (no key), softened to grey in CSS.
  function baseLayer() {
    var k = (window.DR_CONFIG || {}).cartoKey;
    if (k) return L.tileLayer('https://basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}{r}.png?key=' + encodeURIComponent(k), { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; CARTO' });
    return L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, className: 'tiles-osm', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' });
  }
  function destroyMaps() { if (UI.map) { UI.map.remove(); UI.map = null; } if (UI.mini) { UI.mini.remove(); UI.mini = null; } }
  function initDiscoverMap() {
    var el = $('#map'); if (!el) return;
    if (typeof L === 'undefined') { el.innerHTML = '<p class="map-fallback">The map couldn’t load. The list still has everything.</p>'; return; }
    var map = L.map(el, { scrollWheelZoom: false }).setView([12.985, 77.72], 13);
    baseLayer().addTo(map);
    var w = S.weights, bounds = [];
    S.places.forEach(function (pl, i) { var wp = WORK_PLACES[pl.area]; if (wp) L.marker([wp.lat, wp.lng], { icon: L.divIcon({ className: 'pin-work', html: '<span>' + esc(pl.label) + '</span>', iconSize: [96, 22] }) }).addTo(map).bindTooltip(wp.name); });
    var typeW = { school: 'schools', hospital: 'health', park: 'parks', metro: 'transit', shops: 'shops' };
    PLACES.forEach(function (p) { if ((w[typeW[p.type]] || 0) >= 4) L.circleMarker([p.lat, p.lng], { radius: 5, color: '#567C8D', weight: 1, fillOpacity: 0.6 }).addTo(map).bindTooltip(p.name); });
    document.querySelectorAll('.list-pane .card').forEach(function (c, i) {
      var h = homeById(c.getAttribute('data-id'));
      var m = L.marker([h.lat, h.lng], { icon: L.divIcon({ className: 'pin-home' + (UI.mapSel === h.id ? ' is-sel' : ''), html: '<span>' + (i + 1) + '</span>', iconSize: [28, 28] }) }).addTo(map);
      m.bindTooltip(h.name);
      m.on('click', function () { selectHome(h.id, false); });
      bounds.push([h.lat, h.lng]);
    });
    if (bounds.length) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 });
    UI.map = map;
  }
  function initMiniMap() {
    var el = $('#mini-map'); if (!el || typeof L === 'undefined') { if (el) el.hidden = true; return; }
    var h = homeById(location.hash.split('/')[2]);
    var map = L.map(el, { scrollWheelZoom: false, zoomControl: false }).setView([h.lat, h.lng], 14);
    baseLayer().addTo(map);
    L.marker([h.lat, h.lng], { icon: L.divIcon({ className: 'pin-home is-sel', html: '<span>⌂</span>', iconSize: [28, 28] }) }).addTo(map);
    nearbyFor(h).forEach(function (n) { var p = PLACES.filter(function (x) { return x.name === n.name; })[0]; if (p) L.circleMarker([p.lat, p.lng], { radius: 5, color: '#567C8D', weight: 1, fillOpacity: 0.6 }).addTo(map).bindTooltip(p.name); });
    UI.mini = map;
  }
  // Interaction 2 (phone Discover): cards leaving the left edge blur and fade, like the reference.
  // The card that settles in the centre highlights its pin and pans the map.
  function initCarousel() {
    var sc = $('.cards-scroll');
    if (!sc || !window.matchMedia || !window.matchMedia('(max-width: 899px)').matches) return;
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches, ticking = false, settle = null;
    function paint() {
      ticking = false;
      var box = sc.getBoundingClientRect();
      sc.querySelectorAll('.card').forEach(function (c) {
        var r = c.getBoundingClientRect(), out = Math.max(0, Math.min(1, (box.left + 8 - r.left) / r.width));
        c.style.filter = reduce || !out ? '' : 'blur(' + (out * 6).toFixed(1) + 'px)';
        c.style.opacity = out ? (1 - out * 0.65).toFixed(2) : '';
        c.style.transform = out && !reduce ? 'scale(' + (1 - out * 0.06).toFixed(3) + ')' : '';
      });
    }
    sc.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(paint); }
      clearTimeout(settle);
      settle = setTimeout(function () {
        var box = sc.getBoundingClientRect(), mid = box.left + box.width / 2, best = null, bd = 1e9;
        sc.querySelectorAll('.card').forEach(function (c) { var r = c.getBoundingClientRect(), d = Math.abs(r.left + r.width / 2 - mid); if (d < bd) { bd = d; best = c; } });
        if (best) selectHome(best.getAttribute('data-id'), true);
      }, 140);
    }, { passive: true });
    paint();
  }

  function selectHome(id, fromCard) {
    UI.mapSel = id;
    document.querySelectorAll('.card.is-sel').forEach(function (c) { c.classList.remove('is-sel'); });
    var card = $('#card-' + id); if (card) { card.classList.add('is-sel'); if (!fromCard) card.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
    if (UI.map && fromCard) { var h = homeById(id); UI.map.panTo([h.lat, h.lng]); }
  }

  // ---------- Render ----------
  function render() {
    var parts = (location.hash.replace(/^#\/?/, '') || '').split('/'), route = parts[0] || (S.setupDone ? 'discover' : 'welcome');
    if (route !== 'matching') clearTimeout(UI.matchTimer);
    if (MAIN[route] && !S.weights) { route = S.mode ? 'priorities' : 'welcome'; }
    if ((route === 'cards' || route === 'questions') && !S.mode) route = 'mode';
    destroyMaps();
    var views = { welcome: vWelcome, essentials: vEssentials, mode: vMode, cards: vCards, questions: vQuestions, must: vMust, priorities: vPriorities, matching: vMatching, discover: vDiscover, saved: vSaved, compare: vCompare, you: vYou };
    var html = route === 'home' ? vHome(parts[1]) : (views[route] || vWelcome)();
    $('#app').innerHTML = shell(route, html) + overlay();
    document.title = 'Decision Room · ' + (route.charAt(0).toUpperCase() + route.slice(1));
    if (route === 'discover') { initDiscoverMap(); initCarousel(); }
    if (route === 'cards') syncDeck();
    if (route === 'home' && S.tab === 'life') initMiniMap();
    persist();
  }

  // ---------- Actions ----------
  function setWeights(next, msg) {
    UI.undo = clone(S.weights); S.weights = next; UI.preview = ''; persist(); render();
    toast(msg || 'Priorities updated', 'Undo', function () { S.weights = UI.undo; persist(); render(); });
  }
  function previewText(next) {
    var before = Scoring.rankAll(profile(), S.weights).filter(function (e) { return e.gate.status === 'pass' || e.gate.status === 'check'; }).map(function (e) { return e.home.id; });
    var after = Scoring.rankAll(profile(), next).filter(function (e) { return e.gate.status === 'pass' || e.gate.status === 'check'; }).map(function (e) { return e.home.id; });
    var moved = []; after.slice(0, 3).forEach(function (id, i) { var j = before.indexOf(id); if (j !== i) moved.push(homeById(id).name + (j > i ? ' moves up to #' : ' drops to #') + (i + 1)); });
    return moved.length ? moved.slice(0, 2).join(' · ') : 'No change in your top 3';
  }
  function save(id) {
    var i = S.saved.indexOf(id);
    if (i >= 0) { S.saved.splice(i, 1); S.compare = S.compare.filter(function (x) { return x !== id; }); persist(); render(); return; }
    S.saved.push(id); if (S.compare.length < 3 && S.compare.indexOf(id) < 0) S.compare.push(id);
    persist();
    if (!S.signedIn && !S.signupAsked) { UI.overlay = { type: 'signup', after: id }; render(); return; }
    render(); concernToast(id);
  }
  function concernToast(id) {
    var e = evalOf(id);
    if (e.concerns.length) toast('Before you visit ' + e.home.name + ': ' + e.concerns.length + ' thing' + (e.concerns.length > 1 ? 's' : '') + ' to check.', 'See', function () { S.tab = 'why'; go('home/' + id); });
    else toast('Saved to your shortlist');
  }

  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-action]'); if (!t) return;
    var a = t.getAttribute('data-action'), id = t.getAttribute('data-id'), val = t.getAttribute('data-value');
    if (t.tagName === 'INPUT' && t.type !== 'button') return; // handled in change
    if (a === 'chip') {
      var name = t.getAttribute('data-name');
      if (name === 'household') {
        var hh = S.household, k = hh.indexOf(val);
        if (val === 'solo') S.household = k >= 0 ? [] : ['solo'];
        else { S.household = hh.filter(function (x) { return x !== 'solo'; }); if (k >= 0) S.household.splice(S.household.indexOf(val), 1); else S.household.push(val); }
        S.weights = null;
      } else if (name === 'bhk') S.ess.bhk = +val;
      else if (name === 'motivation') { S.ess.motivation = val; S.weights = null; }
      else if (name === 'timing') S.ess.timing = val;
      else if (name === 'walk-reason' || name === 'none-reason') UI.overlay.reason = UI.overlay.reason === val ? '' : val;
      else if (name === 'place-label') UI.overlay.draft.label = val;
      else if (name === 'place-freq') UI.overlay.draft.freq = val;
      else if (name === 'place-mode') UI.overlay.draft.mode = val;
      persist(); render(); return;
    }
    if (a === 'pick-mode') { S.mode = val; S.weights = null; S.cardIdx = 0; S.qIdx = 0; persist(); go(val === 'quick' ? 'cards' : 'questions'); return; }
    if (a === 'card-pick' || a === 'card-next') {
      if (a === 'card-pick' && document.getElementById('swipe-card')) { flyOut(val); return; }
      commitCard(a === 'card-pick' ? val : null);
      return;
    }
    if (a === 'coach-done') { S.deckCoach = true; persist(); var co = document.getElementById('coach'); if (co) co.parentNode.removeChild(co); var tc = document.getElementById('swipe-card'); if (tc) tc.focus(); return; }
    if (a === 'deck-exit') { S.cardIdx = 0; persist(); go('mode'); return; }
    if (a === 'card-back') { if (S.cardIdx > 0) { S.cardIdx--; persist(); render(); } else go('mode'); return; }
    if (a === 'q-answer') { var q = questionList()[S.qIdx]; S.qAnswers[q.id] = val === 'na' ? 'na' : +val; S.weights = null; persist(); render(); return; }
    if (a === 'q-next') { S.qIdx++; persist(); if (S.qIdx >= questionList().length) go('must'); else render(); return; }
    if (a === 'q-back') { if (S.qIdx > 0) { S.qIdx--; persist(); render(); } else go('mode'); return; }
    if (a === 'q-later') { persist(); toast('Saved. Come back any time and you’ll pick up here.'); return; }
    if (a === 'must-back') { if (S.mode === 'quick') S.cardIdx = Math.max(0, visibleCards().length - 1); else S.qIdx = Math.max(0, questionList().length - 1); persist(); go(S.mode === 'quick' ? 'cards' : 'questions'); return; }
    if (a === 'pri-back') { go('must'); return; }
    if (a === 'open-priorities') { if (!S.weights) initWeights(); UI.preview = ''; UI.overlay = { type: 'priorities' }; render(); return; }
    if (a === 'close-overlay') { var was = UI.overlay; UI.overlay = null; render(); if (was && was.type === 'signup') { S.signupAsked = true; persist(); concernToast(was.after); } return; }
    if (a === 'lock') { S.locks[id] = !S.locks[id]; persist(); render(); return; }
    if (a === 'reset-suggested') { setWeights(clone(S.suggested), 'Reset to the AI suggestion'); return; }
    if (a === 'save-scenario') { S.scenarios.push({ name: 'Scenario ' + (S.scenarios.length + 1), weights: clone(S.weights) }); persist(); render(); toast('Saved as Scenario ' + S.scenarios.length); return; }
    if (a === 'apply-scenario') { var sc = S.scenarios[+t.getAttribute('data-i')]; setWeights(clone(sc.weights), 'Applied ' + sc.name); return; }
    if (a === 'morph-open') { UI.morph = t.getAttribute('data-name'); render(); var first = document.querySelector('.morph.is-open .seg-opt[aria-pressed="true"]'); if (first) first.focus(); return; }
    if (a === 'morph-pick') { MORPHS[t.getAttribute('data-name')].set(val); persist(); slideThumb(t); return; }
    if (a === 'morph-done') {
      var box = t.closest('.morph'); box.classList.add('is-closing');
      setTimeout(function () { UI.morph = null; render(); var p = document.querySelector('[data-morph="' + t.getAttribute('data-name') + '"] .morph-pill'); if (p) p.focus(); }, 190);
      return;
    }
    if (a === 'place-add') { var used = S.places.map(function (p) { return p.label; }); var free = PLACE_LABELS.filter(function (l) { return used.indexOf(l[0]) < 0; })[0]; UI.overlay = { type: 'place', idx: null, draft: { label: free ? free[0] : 'Other', area: '', freq: 'daily', mode: 'car' } }; render(); return; }
    if (a === 'place-edit') { var ix = +t.getAttribute('data-i'); UI.overlay = { type: 'place', idx: ix, draft: clone(S.places[ix]) }; render(); return; }
    if (a === 'place-save') {
      var dr = UI.overlay.draft; if (!dr.area) { toast('Choose where this place is first'); return; }
      if (UI.overlay.idx == null) S.places.push(dr); else S.places[UI.overlay.idx] = dr;
      UI.overlay = null; persist(); render(); toast('Saved. Commute now includes ' + dr.label.toLowerCase() + '.'); return;
    }
    if (a === 'place-remove') { S.places.splice(UI.overlay.idx, 1); UI.overlay = null; persist(); render(); toast('Place removed'); return; }
    if (a === 'filter') { slideThumb(t); S.filter = val; persist(); setTimeout(render, 220); return; }
    if (a === 'save') { save(id); return; }
    if (a === 'ev') { toast(t.getAttribute('data-l') + ': ' + t.getAttribute('data-s')); return; }
    if (a === 'tab') { slideThumb(t); S.tab = val; persist(); setTimeout(render, 220); return; }
    if (a === 'saved-tab') { S.savedTab = val; persist(); render(); return; }
    if (a === 'restore') { delete S.status[id]; persist(); render(); toast('Restored to your shortlist'); return; }
    if (a === 'open-next') { UI.overlay = { type: 'next', id: id }; render(); return; }
    if (a === 'pick-next') { UI.overlay.pick = val; UI.overlay.reason = ''; render(); return; }
    if (a === 'confirm-next') {
      var o = UI.overlay; S.status[o.id] = { step: o.pick, reason: o.reason || '' };
      if (!isSaved(o.id)) S.saved.push(o.id);
      if (o.pick === 'Walk away') S.compare = S.compare.filter(function (x) { return x !== o.id; });
      UI.overlay = null; persist(); render(); toast(o.pick === 'Walk away' ? 'Moved to Walked away. You can restore it any time.' : 'Next step set: ' + o.pick); return;
    }
    if (a === 'open-none') { UI.overlay = { type: 'none' }; render(); return; }
    if (a === 'confirm-none') {
      var reason = UI.overlay.reason; S.comparedHistory = S.comparedHistory.concat(S.compare);
      var nextSet = ranked().filter(function (e) { return (e.gate.status === 'pass' || e.gate.status === 'check') && S.comparedHistory.indexOf(e.home.id) < 0 && !(S.status[e.home.id] && S.status[e.home.id].step === 'Walk away'); }).slice(0, 3).map(function (e) { return e.home.id; });
      UI.overlay = null;
      var map = { 'Too far': 'commute', 'Too expensive': 'price', 'Too small': 'space' };
      var hint = reason && map[reason] && aiOn() ? ' All ' + reason.toLowerCase().replace('too ', 'too ') + '? Consider raising ' + factorLabel(map[reason]) + ' in Priorities.' : '';
      if (nextSet.length >= 1) { S.compare = nextSet; nextSet.forEach(function (x) { if (!isSaved(x)) S.saved.push(x); }); S.compareNote = 'These are the next best-fit homes you haven’t compared yet.' + hint; }
      else S.compareNote = 'No better matches right now.' + (hint || ' Try adjusting your priorities.');
      persist(); render(); return;
    }
    if (a === 'signup-ok') { S.signedIn = true; var af = UI.overlay.after; UI.overlay = null; persist(); render(); concernToast(af); return; }
    if (a === 'signup-later') { S.signupAsked = true; var af2 = UI.overlay.after; UI.overlay = null; persist(); render(); concernToast(af2); return; }
    if (a === 'must-off') { S.must[id] = false; persist(); render(); return; }
    if (a === 'switch-mode') {
      S.mode = S.mode === 'quick' ? 'step' : 'quick';
      if (S.mode === 'step') { S.suggested = null; S.aiEnabled = false; }
      else if (!S.suggested) S.suggested = weightsFromCards();
      persist(); render(); toast('Switched to ' + (S.mode === 'quick' ? 'Quick mode. AI suggestions are shown as markers.' : 'Step-by-step mode. AI is off.')); return;
    }
    if (a === 'reset-all') { localStorage.removeItem(STORE); S = clone(DEFAULT_STATE); UI.ai = {}; UI.overlay = null; go('welcome'); return; }
    if (a === 'copy-owner') {
      var st = UI.ai['owner:' + id], txt = st && st.res ? ((st.res.json && st.res.json.questions) || [st.res.text]).join('\n') : '';
      if (navigator.clipboard) navigator.clipboard.writeText(txt).then(function () { toast('Questions copied'); }, function () { toast('Couldn’t copy; select the text instead'); });
      return;
    }
    if (a === 'ai-explain') { runAI('explain:' + id, 'explain', { buyer: buyerPayload(), home: homePayload(evalOf(id)) }); return; }
    if (a === 'ai-owner') { var eo = evalOf(id); runAI('owner:' + id, 'owner', { home: eo.home.name, unknowns: eo.gate.unknown.map(function (u) { return u.text; }), concerns: eo.concerns }); return; }
    if (a === 'ai-neigh') { var hn = homeById(id); runAI('neigh:' + id, 'neighbourhood', { buyer: buyerPayload(), home: hn.name + ', ' + hn.area, nearby: nearbyFor(hn) }); return; }
    if (a === 'ai-compare') { runAI('compare:' + S.compare.join(','), 'compare', { buyer: buyerPayload(), homes: S.compare.map(function (x) { return homePayload(evalOf(x)); }) }); return; }
    if (a === 'card-key') return;
  });

  function buyerPayload() {
    return { motivation: S.ess.motivation, household: S.household, timing: S.ess.timing, priorities: topPriorities(5) };
  }

  document.addEventListener('input', function (ev) {
    var t = ev.target, a = t.getAttribute('data-action'), bind = t.getAttribute('data-bind');
    if (bind === 'budget') { $('#budget-val').textContent = Format.price(+t.value); }
    if (a === 'weight') {
      var next = clone(S.weights); next[t.getAttribute('data-id')] = +t.value;
      var sum = 0; FACTORS.forEach(function (f) { sum += next[f.id]; });
      FACTORS.forEach(function (f) { var s = document.getElementById('ws-' + f.id); if (s) s.textContent = (sum ? Math.round(next[f.id] / sum * 100) : 0) + '%'; });
      document.getElementById('wv-' + t.getAttribute('data-id')).textContent = t.value;
      var p = $('#preview'); if (p) p.textContent = previewText(next);
    }
  });

  document.addEventListener('change', function (ev) {
    var t = ev.target, a = t.getAttribute('data-action'), bind = t.getAttribute('data-bind');
    if (bind === 'budget') { S.ess.budget = +t.value; persist(); return; }
    if (bind === 'place-area') { UI.overlay.draft.area = t.value; return; }
    if (bind === 'city') { S.ess.city = t.value; persist(); return; }
    if (bind === 'sort') { S.sort = t.value; persist(); render(); return; }
    if (a === 'weight') { var next = clone(S.weights); next[t.getAttribute('data-id')] = +t.value; var msg = previewText(next); setWeights(next, msg); return; }
    if (a === 'alpha') {
      S.alpha = +t.value / 10; var n2 = clone(S.weights);
      FACTORS.forEach(function (f) { if (!S.locks[f.id]) n2[f.id] = Math.round((1 - S.alpha) * DEFAULT_WEIGHTS.live[f.id] + S.alpha * DEFAULT_WEIGHTS.invest[f.id]); });
      setWeights(n2, S.alpha < 0.5 ? 'Leaning towards living in' : S.alpha > 0.5 ? 'Leaning towards investment' : 'Balanced'); return;
    }
    if (a === 'must') { S.must[t.getAttribute('data-id')] = t.checked; persist(); render(); return; }
    if (a === 'toggle-ai') { S.aiEnabled = t.checked; persist(); render(); toast(t.checked ? 'AI mode on. AI parts are marked “AI” and never change your sliders.' : 'AI mode off'); return; }
    if (a === 'cmp-toggle') {
      var id = t.getAttribute('data-id'), i = S.compare.indexOf(id);
      if (t.checked && i < 0) { if (S.compare.length >= 3) { t.checked = false; toast('You can compare up to 3 homes. Untick one first.'); return; } S.compare.push(id); }
      if (!t.checked && i >= 0) S.compare.splice(i, 1);
      S.compareNote = ''; persist(); render(); return;
    }
  });

  document.addEventListener('submit', function (ev) {
    var f = ev.target; if (f.getAttribute('data-action') !== 'whatif') return;
    ev.preventDefault();
    var text = (f.querySelector('input').value || '').trim().slice(0, 200); if (!text) return;
    var payload = { request: text, factors: FACTORS.map(function (x) { return { id: x.id, label: x.label, weight: S.weights[x.id], locked: !!S.locks[x.id] }; }) };
    runAI('whatif', 'whatif', payload, function (res) {
      var ch = res.json && res.json.changes; if (!ch) return;
      var next = clone(S.weights), changed = 0;
      Object.keys(ch).forEach(function (k) { if (next[k] != null && !S.locks[k]) { var v = Math.max(0, Math.min(10, Math.round(+ch[k]))); if (!isNaN(v) && v !== next[k]) { next[k] = v; changed++; } } });
      if (changed) {
        var prev = clone(S.weights), moves = previewText(next);
        UI.undo = prev; S.weights = next; persist();
        setTimeout(function () { toast((res.json.note || 'Priorities updated') + ' · ' + moves, 'Undo', function () { S.weights = prev; persist(); render(); }); }, 0);
      }
    });
  });

  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && UI.morph) { UI.morph = null; render(); return; }
    if (ev.key === 'Escape' && UI.overlay) { UI.overlay = null; render(); return; }
    var route = (location.hash.replace(/^#\/?/, '') || '').split('/')[0];
    if (route !== 'cards' || UI.overlay || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    if (document.getElementById('coach')) { if (ev.key === 'Enter') { ev.preventDefault(); document.querySelector('[data-action=coach-done]').click(); } return; }
    if (document.getElementById('swipe-card')) {
      var pairCard = document.getElementById('swipe-card').getAttribute('data-kind') === 'pair';
      var map = pairCard ? { ArrowLeft: '0', ArrowRight: '1', ArrowUp: 'both', ArrowDown: 'skip' } : { ArrowLeft: 'dislike', ArrowRight: 'like', ArrowDown: 'skip' };
      if (map[ev.key]) { ev.preventDefault(); flyOut(map[ev.key]); }
      return;
    }
    var tiles = document.querySelectorAll('.tile'); if (!tiles.length) return;
    if (ev.key === 'ArrowLeft') { tiles[0].focus(); ev.preventDefault(); }
    if (ev.key === 'ArrowRight') { tiles[tiles.length - 1].focus(); ev.preventDefault(); }
  });

  document.addEventListener('mouseover', function (ev) {
    var c = ev.target.closest && ev.target.closest('.list-pane .card');
    if (c && UI.map && window.matchMedia('(min-width: 900px)').matches && UI.mapSel !== c.getAttribute('data-id')) selectHome(c.getAttribute('data-id'), true);
  });

  window.addEventListener('hashchange', function () { UI.overlay = null; UI.morph = null; window.scrollTo(0, 0); render(); });
  render();
})();
