// Demo AI: writes the same kinds of answers the real AI would, from the same facts the app sends,
// entirely in the browser. No API calls and no cost. Used when DR_CONFIG.aiMode is 'demo'
// and no aiEndpoint is set. It never adds facts that aren't in the payload.
var DemoAI = (function () {
  function lower(s) { return String(s || '').charAt(0).toLowerCase() + String(s || '').slice(1); }
  function list(a) { return a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
  function lo(fit) { return parseInt(String(fit), 10) || 0; }
  function mid(fit) { var p = String(fit).split('-').map(Number); return p.length > 1 ? (p[0] + p[1]) / 2 : p[0]; }
  function dash(fit) { return String(fit).replace('-', '\u2013'); }
  function concernText(c) { return lower(String(c).replace(/^Must-have not confirmed: (.*)\.$/, '$1 isn\u2019t confirmed yet.')); }
  function weighted(h) { return (h.factors || []).slice().sort(function (a, b) { return parseInt(b.share, 10) - parseInt(a.share, 10); }); }

  function nextStep(h) {
    var fails = h.mustHaves.filter(function (m) { return m.indexOf('FAILS') === 0; });
    var unknown = h.mustHaves.filter(function (m) { return m.indexOf('UNKNOWN') === 0; });
    if (fails.length) return { next: 'Walk away', reason: 'It fails one of your must-haves: ' + fails[0].replace('FAILS: ', '') + '.' };
    if (unknown.length) return { next: 'Investigate', reason: 'Confirm ' + lower(unknown[0].replace('UNKNOWN: ', '').replace(': can’t confirm', '')) + ' before spending a visit on it.' };
    if (h.concerns.length) return { next: 'Investigate', reason: 'Check this first: ' + concernText(h.concerns[0]) };
    if (lo(h.fit) >= 75) return { next: 'Visit', reason: 'It fits your priorities well and the key facts are known, so it’s worth seeing in person.' };
    return { next: 'Shortlist', reason: 'Keep it as a backup while you look at stronger fits.' };
  }

  var T = {
    explain: function (p) {
      var h = p.home, f = weighted(h);
      var strong = f.filter(function (x) { return x.score != null && x.score >= 70; }).slice(0, 2).map(function (x) { return lower(x.f); });
      var weak = f.filter(function (x) { return x.score != null && x.score < 50; })[0];
      var unknown = f.filter(function (x) { return x.score == null; }).map(function (x) { return lower(x.f); });
      var est = f.some(function (x) { return x.label === 'Estimated' && strong.indexOf(lower(x.f)) >= 0; });
      var why = h.name + ' scores ' + dash(h.fit) + ' on your priorities' + (strong.length ? ', strongest on ' + list(strong) + (est ? ' (partly estimated)' : '') : '') + '.';
      if (unknown.length) why += ' We don’t know its ' + list(unknown) + ' yet, which is why the score is a range.';
      var tradeoff = weak ? 'The main compromise is ' + lower(weak.f) + ': ' + lower(weak.detail) + '.' : 'There’s no big compromise among the things you weighted most.';
      var n = nextStep(h);
      return { why: why, tradeoff: tradeoff, next: n.next, reason: n.reason };
    },
    neighbourhood: function (p) {
      var typeOf = { 'Schools nearby': 'school', 'Healthcare nearby': 'hospital', 'Parks and green space': 'park', 'Public transport': 'metro', 'Shops and daily needs': 'shops' };
      var near = (p.nearby || []).slice().sort(function (a, b) { return a.km - b.km; });
      if (!near.length) return 'We don’t have nearby places on record for this home yet.';
      var first = null;
      (p.buyer.priorities || []).some(function (pr) { var t = typeOf[pr.factor]; var hit = near.filter(function (n) { return n.type === t; })[0]; if (hit) { first = { pr: pr, n: hit }; return true; } return false; });
      var s = first ? 'For ' + lower(first.pr.factor) + ', the closest option is ' + first.n.name + ', about ' + first.n.km + ' km from ' + p.home.split(',')[0] + '.' : 'The closest place we know of is ' + near[0].name + ', about ' + near[0].km + ' km away.';
      var others = near.filter(function (n) { return !first || n.name !== first.n.name; }).slice(0, 3).map(function (n) { return n.name + ' (about ' + n.km + ' km)'; });
      if (others.length) s += ' Also nearby: ' + list(others) + '.';
      return s + ' These are straight-line distances, so actual routes may be longer.';
    },
    compare: function (p) {
      var homes = p.homes, top = (p.buyer.priorities[0] || {}).factor;
      var leader = homes.slice().sort(function (a, b) { return mid(b.fit) - mid(a.fit); })[0];
      var bestTop = null, bestScore = -1;
      homes.forEach(function (h) { (h.factors || []).forEach(function (x) { if (x.f === top && x.score != null && x.score > bestScore) { bestScore = x.score; bestTop = h; } }); });
      var s = leader.name + ' has the best overall fit (' + dash(leader.fit) + ')' + (bestTop && top ? (bestTop === leader ? ' and also leads on ' + lower(top) + ', your top priority.' : ', while ' + bestTop.name + ' leads on ' + lower(top) + ', your top priority.') : '.');
      var cheapest = homes.slice().sort(function (a, b) { return parseFloat(a.price.replace(/[^\d.]/g, '')) * (/Cr/.test(a.price) ? 100 : 1) - parseFloat(b.price.replace(/[^\d.]/g, '')) * (/Cr/.test(b.price) ? 100 : 1); })[0];
      if (cheapest !== leader) s += ' ' + cheapest.name + ' costs less (' + cheapest.price + ') but fits your priorities less well.';
      var withConcern = homes.filter(function (h) { return h.concerns.length; })[0];
      if (withConcern) s += ' Before deciding, check ' + withConcern.name + ': ' + concernText(withConcern.concerns[0]);
      return s;
    },
    whatif: function (p) {
      var t = p.request.toLowerCase();
      var words = {
        commute: ['commute', 'travel', 'office', 'work', 'drive'], price: ['price', 'budget', 'cheap', 'cost', 'value', 'money', 'afford'],
        space: ['space', 'bigger', 'size', 'room', 'carpet'], schools: ['school'], health: ['hospital', 'health', 'doctor', 'clinic'],
        safety: ['safe', 'security'], parks: ['park', 'green', 'garden', 'walk', 'dog'], shops: ['shop', 'grocer', 'market', 'mall', 'cafe', 'café'],
        transit: ['metro', 'transport', 'bus', 'train'], community: ['community', 'amenit', 'clubhouse', 'neighbour', 'society'],
        building: ['newer', 'new building', 'condition', 'old building', 'age of'], investment: ['rent', 'resale', 'invest', 'yield', 'return']
      };
      var hit = p.factors.filter(function (f) { return (words[f.id] || []).some(function (w) { return t.indexOf(w) >= 0; }); });
      if (!hit.length) return JSON.stringify({ changes: {}, note: 'I couldn’t tell which priority you meant. Try naming one, like commute, schools or price.' });
      var up = /(most|top|highest|only thing|really|very|main)/.test(t), down = /(less|not|doesn.?t|don.?t|lower|least|never mind)/.test(t);
      var changes = {}, notes = [];
      hit.forEach(function (f) {
        if (f.locked) { notes.push(f.label + ' is locked, so I left it'); return; }
        var v = down ? Math.max(0, f.weight - 4) : up ? 10 : Math.min(10, f.weight + 3);
        if (v !== f.weight) { changes[f.id] = v; notes.push(f.label + ' ' + (v > f.weight ? 'raised' : 'lowered') + ' to ' + v); }
      });
      return JSON.stringify({ changes: changes, note: notes.length ? notes.join('; ') + '.' : 'That priority is already set that way.' });
    },
    owner: function (p) {
      var q = [];
      (p.unknowns || []).forEach(function (u) {
        if (/Pets/.test(u)) q.push('Do the society bylaws allow pets, including a large dog?');
        else if (/Lift/.test(u)) q.push('Is there a working lift, and does it have power backup?');
        else if (/parking/i.test(u)) q.push('Is there an allotted covered parking slot with the flat?');
        else if (/Ready/.test(u)) q.push('When exactly could we move in?');
      });
      (p.concerns || []).forEach(function (c) {
        if (/Carpet area/.test(c)) q.push('What carpet area is written in the sale agreement?');
        else if (/complaints/.test(c)) q.push('Have the handover complaints on K-RERA been resolved?');
        else if (/Under construction/.test(c)) q.push('How is construction progressing against the Dec 2027 completion date?');
        else if (/before RERA/.test(c)) q.push('Could you share the title deed and building approvals?');
        else if (/Availability/.test(c)) q.push('Is the home still available?');
      });
      q = q.filter(function (x, i) { return q.indexOf(x) === i; });
      if (q.length < 3) q.push('Is it still available for a visit this week?');
      return JSON.stringify({ questions: q.slice(0, 5) });
    }
  };

  function answer(task, payload) {
    var out = T[task](payload);
    var text = typeof out === 'string' ? out : JSON.stringify(out);
    return new Promise(function (resolve) { setTimeout(function () { resolve(text); }, 650 + Math.round(Math.random() * 400)); });
  }
  return { answer: answer };
})();
