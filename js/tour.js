// Decision Room — scenario mode ("Ananya's story")
// Open the prototype with ?tour=ananya. It plays the real screens step by step and
// calls out each design decision and each place AI is used. Exit restores the visitor's own data.
(function () {
  'use strict';
  var params = new URLSearchParams(location.search);
  if (params.get('tour') !== 'ananya' || window.DR_PREVIEW) return;

  var STORE = 'dr-state-v1', BACKUP = 'dr-state-backup-tour', STEP = 'dr-tour-step';

  // Ananya's answers, as if she had gone through setup herself.
  var SCENARIO = {
    ess: { city: 'Bengaluru', budget: 130, bhk: 3, motivation: 'live', timing: '3m' },
    places: [{ label: 'Office', area: 'itpl', freq: 'daily', mode: 'car' }, { label: 'Parents', area: 'jayanagar', freq: 'weekly', mode: 'car' }],
    mode: 'quick', aiEnabled: true, household: ['partner', 'children'],
    cardAnswers: { household: true, 'k-schools': 'like', 'k-parks': 'like', 'k-shops': 'dislike', 'k-safety': 'like', 'k-health': 'like', 'k-transit': 'dislike', 'k-community': 'skip', 't-commute-space': '0', 't-price-new': '0', 't-quiet-connected': '0' },
    cardIdx: 1, deckCoach: true, weights: null, suggested: null, locks: {}, alpha: 0.5,
    must: { budget: true, bhk: true, pets: false, lift: false, parking: false, ready: true },
    saved: ['lakeside', 'palmgrove', 'cedar'], status: {}, compare: ['lakeside', 'palmgrove', 'cedar'], compareNote: '',
    signedIn: true, signupAsked: true, filter: 'all', sort: 'fit', tab: 'why', setupDone: true
  };

  // Start: keep the visitor's own data aside, load Ananya's.
  if (!sessionStorage.getItem(STEP)) {
    try { var mine = localStorage.getItem(STORE); if (mine && !localStorage.getItem(BACKUP)) localStorage.setItem(BACKUP, mine); } catch (e) { /* ignore */ }
    try { localStorage.setItem(STORE, JSON.stringify(SCENARIO)); } catch (e) { /* ignore */ }
    sessionStorage.setItem(STEP, '0');
  }

  var D = 'Design decision', A1 = 'AI · Level 1 · informs', A2 = 'AI · Level 2 · suggests';
  var STEPS = [
    { route: 'welcome', title: 'Meet Ananya', body: '31, moving from Pune for a job at ITPL. Husband, a 4-year-old, parents in Jayanagar. Budget ₹1.3 Cr. She can’t visit often; her brother helps.', tags: [] },
    { route: 'essentials', target: '.places', title: 'Essentials: her important places', body: 'Not one “commute”. Office daily by car, parents weekly. Commute is scored to each place, weighted by how often she goes.', tags: [D] },
    { route: 'mode', target: '.mode-cards', title: 'She chooses her pace', body: 'Quick, with AI, or step by step with no AI at all. Buying a home is serious, so AI is a choice, not a default.', tags: [D] },
    { route: 'cards', target: '#deck', title: 'The swipe deck', body: 'About-you cards are like or dislike; trade-offs are left or right. She likes schools, parks and safety, and picks a shorter commute over more space.', tags: [D, A2], note: 'Each swipe nudges a suggested weight. Nothing is final yet.' },
    { route: 'must', target: '.switch-list', title: 'Must-haves are a gate', body: 'Budget, 3 BHK, ready to move. Dealbreakers filter homes out; they are never traded against other priorities.', tags: [D] },
    { route: 'priorities', target: '.slider-row', prep: 'weights', title: 'Her priorities, suggested by AI', body: 'The orange marker is AI’s suggestion from her swipes. She raises Schools herself. AI never moves a slider on its own.', tags: [A2, D] },
    { route: 'discover', target: '.dx-map', title: 'Discover: her amenities on the map', body: 'For the selected home, the map shows the school, park, hospital and metro she weighted, with distances. Price pins, fit scores, ranked by fixed rules.', tags: [D] },
    { route: 'home/palmgrove', target: '.fit-summary', title: 'An honest range: 67–85', body: 'Some facts are unknown, so the score is a range instead of a fake single number. Every fact is Verified, Estimated or Unknown.', tags: [D] },
    { route: 'home/palmgrove', target: '.alert-row', title: 'Alerts as a symbol', body: '⚠ 4 things to check. Details only on tap, so the screen stays calm.', tags: [D] },
    { route: 'home/palmgrove', target: '.next-box', title: 'AI suggests the next step', body: 'Investigate, with the reason: confirm what’s unknown before spending a visit on it. She decides.', tags: [A2] },
    { route: 'saved', target: '.sv-best', title: 'Best of all saved', body: 'Without being asked, AI names {best} as the best fit among her saved homes, worked out from her own weights.', tags: [A1] },
    { route: 'best', target: '.why-panel', title: 'Why this one?', body: 'Where it wins, where others beat it, and all saved homes ranked. Reasons, not a black box.', tags: [A1, D] },
    { route: 'compare', target: '.verdict', title: 'Compare 3, with a one-line verdict', body: 'Side by side on her priorities. “None of these” shows the next best set.', tags: [A1, D] },
    { route: 'home/lakeside', target: '.next-box', title: 'It ends in a decision', body: 'Visit, investigate, shortlist or walk away. Next: a visit checklist she can send to her brother.', tags: [D], note: 'Future: the proxy visit, from the interviews.' },
    { route: 'discover', title: 'That’s Ananya’s story', body: 'Rules rank. AI explains. The buyer decides.', tags: [], last: true }
  ];

  function css() {
    var st = document.createElement('style');
    st.textContent = [
      '.tour-ring{position:fixed;z-index:9000;pointer-events:none;border-radius:24px;box-shadow:0 0 0 3px #F29B38,0 0 0 9999px rgba(22,22,22,.38);transition:all 320ms cubic-bezier(.2,.8,.2,1)}',
      '.tour-ring::after{content:"";position:absolute;inset:-10px;border-radius:30px;border:2px solid rgba(242,155,56,.6);animation:tourpulse 1.6s ease-out infinite}',
      '@keyframes tourpulse{from{opacity:1;transform:scale(.98)}to{opacity:0;transform:scale(1.04)}}',
      '.tour-card{position:fixed;z-index:9001;left:50%;bottom:24px;transform:translateX(-50%);width:min(560px,calc(100vw - 24px));background:rgba(255,255,255,.9);-webkit-backdrop-filter:saturate(1.6) blur(20px);backdrop-filter:saturate(1.6) blur(20px);border-radius:28px;box-shadow:0 24px 60px rgba(22,22,22,.25);padding:20px 22px 18px;font-family:"Helvetica Neue",Helvetica,Arial,sans-serif;color:#161616}',
      '.tour-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-size:12px;color:#6E6A65;letter-spacing:.06em;text-transform:uppercase}',
      '.tour-exit{border:0;background:none;font:inherit;color:#6E6A65;cursor:pointer;text-transform:none;letter-spacing:0;font-size:13px}',
      '.tour-card h3{margin:0 0 6px;font-size:20px;font-weight:600;letter-spacing:-.01em}',
      '.tour-card p{margin:0;font-size:14px;line-height:1.5;color:#3D3B38}',
      '.tour-tags{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0 0}',
      '.tour-tag{font-size:12px;font-weight:700;padding:5px 11px;border-radius:999px}',
      '.tour-tag.d{background:#161616;color:#fff}.tour-tag.a{background:#F29B38;color:#161616}',
      '.tour-note{margin-top:10px!important;font-size:13px!important;color:#6E6A65!important;font-style:italic}',
      '.tour-nav{display:flex;align-items:center;gap:8px;margin-top:16px}',
      '.tour-dots{flex:1;display:flex;gap:4px}.tour-dots i{height:4px;flex:1;border-radius:2px;background:rgba(22,22,22,.12)}.tour-dots i.on{background:#161616}',
      '.tour-btn{border:0;border-radius:999px;height:42px;padding:0 18px;font:inherit;font-size:14px;font-weight:600;cursor:pointer;background:rgba(22,22,22,.06);color:#161616}',
      '.tour-btn.p{background:#161616;color:#fff}',
      '.tour-btn:focus-visible{outline:2px solid #F29B38;outline-offset:2px}',
      '@media (min-width:900px){.tour-card{left:auto;right:24px;transform:none}}',
      '@media (prefers-reduced-motion:reduce){.tour-ring,.tour-ring::after{transition:none;animation:none}}'
    ].join('');
    document.head.appendChild(st);
  }

  var ring, card, i = +(sessionStorage.getItem(STEP) || 0);

  function prep(step) {
    var api = window.DR; if (!api) return;
    var S = api.S();
    if (step.prep === 'weights' && !S.tourWeights) {
      var w = api.weightsFromCards(); S.suggested = JSON.parse(JSON.stringify(w));
      w.schools = Math.min(10, (w.schools || 0) + 2); S.weights = w; S.tourWeights = true; api.persist();
    }
    if (!S.weights) { var w2 = api.weightsFromCards(); S.weights = w2; S.suggested = JSON.parse(JSON.stringify(w2)); api.persist(); }
    if (step.route === 'discover') api.UI.mapSel = 'lakeside';
    if (step.route === 'cards') { S.cardIdx = 1; api.persist(); }
  }

  function target() { var step = STEPS[i]; return step.target ? document.querySelector(step.target) : null; }
  function fit() {
    var el = target(); if (!el) { ring.style.opacity = '0'; return; }
    var r = el.getBoundingClientRect(), pad = 8;
    ring.style.left = (r.left - pad) + 'px'; ring.style.top = (r.top - pad) + 'px';
    ring.style.width = (r.width + pad * 2) + 'px'; ring.style.height = (r.height + pad * 2) + 'px';
    ring.style.opacity = '1';
  }
  function place() {
    ring.style.opacity = '0';
    var el = target(); if (!el) return;
    el.scrollIntoView({ block: 'center' });
    setTimeout(fit, 120);
  }

  function show() {
    var step = STEPS[i]; sessionStorage.setItem(STEP, String(i));
    prep(step);
    if (location.hash !== '#/' + step.route) location.hash = '#/' + step.route; else window.DR && window.DR.render();
    setTimeout(function () { place(); fill(); }, 700);
    card.innerHTML = '<div class="tour-top"><span>Ananya’s story · ' + (i + 1) + ' of ' + STEPS.length + '</span><button type="button" class="tour-exit" data-t="exit">Exit scenario ✕</button></div>' +
      '<h3>' + slots(step.title) + '</h3><p>' + slots(step.body) + '</p>' +
      (step.tags.length ? '<div class="tour-tags">' + step.tags.map(function (t) { return '<span class="tour-tag ' + (t === D ? 'd' : 'a') + '">' + t + '</span>'; }).join('') + '</div>' : '') +
      (step.note ? '<p class="tour-note">' + step.note + '</p>' : '') +
      '<div class="tour-nav"><div class="tour-dots" aria-hidden="true">' + STEPS.map(function (_, k) { return '<i' + (k <= i ? ' class="on"' : '') + '></i>'; }).join('') + '</div>' +
      (i > 0 ? '<button type="button" class="tour-btn" data-t="back">Back</button>' : '') +
      '<button type="button" class="tour-btn p" data-t="' + (step.last ? 'exit' : 'next') + '">' + (step.last ? 'Finish' : i === 0 ? 'Start' : 'Next') + '</button></div>';
    var b = card.querySelector('.tour-btn.p'); if (b) b.focus({ preventScroll: true });
  }

  // Put the live numbers from the screen into the callout text.
  function fill() {
    var txt = function (sel) { var e = document.querySelector(sel); return e ? e.textContent.trim() : ''; };
    var map = {
      '{range}': txt('.fit-summary .score-num') || 'a range',
      '{alerts}': (txt('.alert-row span:nth-child(2)') || 'Things to check').replace(/ before you decide$/, ''),
      '{best}': txt('.sv-best .sv-h') || 'one home'
    };
    card.querySelectorAll('[data-fill]').forEach(function (el) { el.textContent = map['{' + el.getAttribute('data-fill') + '}']; });
  }
  function slots(t) { return t.replace(/\{(range|alerts|best)\}/g, '<span data-fill="$1">\u2026</span>'); }

  function exit() {
    try {
      var mine = localStorage.getItem(BACKUP);
      if (mine) localStorage.setItem(STORE, mine); else localStorage.removeItem(STORE);
      localStorage.removeItem(BACKUP);
    } catch (e) { /* ignore */ }
    sessionStorage.removeItem(STEP);
    location.href = location.pathname + '#/discover';
  }

  function start() {
    css();
    ring = document.createElement('div'); ring.className = 'tour-ring'; ring.style.opacity = '0'; ring.setAttribute('aria-hidden', 'true');
    card = document.createElement('div'); card.className = 'tour-card'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', 'Scenario walkthrough');
    document.body.appendChild(ring); document.body.appendChild(card);
    card.addEventListener('click', function (ev) {
      var t = ev.target.closest('[data-t]'); if (!t) return;
      var a = t.getAttribute('data-t');
      if (a === 'next' && i < STEPS.length - 1) { i++; show(); }
      if (a === 'back' && i > 0) { i--; show(); }
      if (a === 'exit') exit();
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.target.closest && ev.target.closest('input, textarea, select')) return;
      if (ev.key === 'ArrowRight' && i < STEPS.length - 1) { i++; show(); }
      if (ev.key === 'ArrowLeft' && i > 0) { i--; show(); }
    });
    window.addEventListener('resize', fit);
    window.addEventListener('scroll', function () { if (ring.style.opacity === '1') fit(); }, { passive: true });
    show();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
