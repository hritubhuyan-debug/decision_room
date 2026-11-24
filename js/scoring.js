// Deterministic matching: must-have gate + weighted additive fit score.
// No AI here. Same inputs always give the same ranking.

window.FACTORS = [
  { id: 'commute', label: 'Commute' },
  { id: 'price', label: 'Value for money' },
  { id: 'space', label: 'Space' },
  { id: 'schools', label: 'Schools nearby' },
  { id: 'health', label: 'Healthcare nearby' },
  { id: 'safety', label: 'Safety' },
  { id: 'parks', label: 'Parks and green space' },
  { id: 'shops', label: 'Shops and daily needs' },
  { id: 'transit', label: 'Public transport' },
  { id: 'community', label: 'Community and amenities' },
  { id: 'building', label: 'Building age and condition' },
  { id: 'investment', label: 'Rental and resale prospects' }
];

window.DEFAULT_WEIGHTS = {
  live: { commute: 6, price: 6, space: 5, schools: 3, health: 4, safety: 6, parks: 4, shops: 4, transit: 4, community: 4, building: 4, investment: 1 },
  invest: { commute: 2, price: 7, space: 3, schools: 2, health: 2, safety: 4, parks: 2, shops: 3, transit: 6, community: 3, building: 5, investment: 9 }
};

window.MUST_HAVES = [
  { id: 'budget', label: 'All-in cost within budget' },
  { id: 'bhk', label: 'Minimum bedrooms' },
  { id: 'pets', label: 'Pets allowed' },
  { id: 'lift', label: 'Lift / step-free access' },
  { id: 'parking', label: 'Covered parking' },
  { id: 'ready', label: 'Ready to move in' }
];

var Scoring = (function () {
  function clamp(x) { return Math.max(0, Math.min(1, x)); }
  function km(a, b) {
    var R = 6371, toR = Math.PI / 180;
    var dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function nearest(home, type) {
    var best = null;
    PLACES.forEach(function (p) {
      if (p.type !== type) return;
      var d = km(home, p);
      if (!best || d < best.d) best = { p: p, d: d };
    });
    return best;
  }
  var MODES = {
    car: { label: 'by car', a: 2.2, b: 3.4, base: [5, 10] },
    bike: { label: 'by two-wheeler', a: 1.6, b: 2.5, base: [3, 6] },
    metro: { label: 'by metro', a: 1.5, b: 1.9, base: [8, 14] },
    walk: { label: 'on foot', a: 12, b: 15, base: [0, 2] }
  };
  var FREQ = { daily: 1, few: 0.6, weekly: 0.25 };
  // Weekday 9 am travel-time range in minutes. An estimate, not a routing service.
  function trip(home, place) {
    var area = WORK_PLACES[place.area]; if (!area) return null;
    var road = km(home, area) * 1.35, mode = place.mode || 'car', note = '';
    if (mode === 'metro') {
      var m1 = nearest(home, 'metro'), m2 = nearest(area, 'metro');
      if (!m1 || !m2 || m1.d > 1.5 || m2.d > 1.5) { mode = 'car'; note = ' (no metro close by)'; }
      else {
        var walkMin = (m1.d + m2.d) * 12;
        return { label: place.label, to: area.name, lo: Math.round(walkMin + road * MODES.metro.a + MODES.metro.base[0]), hi: Math.round(walkMin + road * MODES.metro.b + MODES.metro.base[1]), how: MODES.metro.label, freq: place.freq };
      }
    }
    var M = MODES[mode];
    return { label: place.label, to: area.name, lo: Math.round(road * M.a + M.base[0]), hi: Math.round(road * M.b + M.base[1]), how: M.label + note, freq: place.freq };
  }
  var TYPICAL = { 1: 600, 2: 900, 3: 1300, 4: 1800 };
  var NEAR_TYPE = { schools: 'school', health: 'hospital', parks: 'park', shops: 'shops', transit: 'metro' };

  // Returns { v: 0..1 | null, l: label, d: display text, s: source }
  function factor(id, home, profile) {
    if (id === 'commute') {
      var trips = (profile.places || []).map(function (p) { return trip(home, p); }).filter(Boolean);
      if (!trips.length) return { v: null, l: 'Unknown', d: 'Add the places you travel to', s: 'No important places set', skip: true };
      var sw = 0, sv = 0;
      trips.forEach(function (t) { var w = FREQ[t.freq] || 0.5, mid = (t.lo + t.hi) / 2; sw += w; sv += w * clamp(1 - (mid - 25) / 50); });
      var main = trips.slice().sort(function (x, y) { return (FREQ[y.freq] || 0) - (FREQ[x.freq] || 0); })[0];
      return { v: sv / sw, l: 'Estimated', d: main.label + ': ' + main.lo + '\u2013' + main.hi + ' min ' + main.how + (trips.length > 1 ? ' (+' + (trips.length - 1) + ' more)' : ''), s: 'Estimated from distance, travel mode and typical weekday 9 am traffic; daily trips count most', trips: trips };
    }
    if (id === 'price') {
      var ratio = home.price / profile.budget;
      var v = ratio <= 0.85 ? 1 : ratio <= 1 ? 1 - (ratio - 0.85) / 0.15 * 0.7 : 0.1;
      return { v: clamp(v), l: 'Verified', d: Format.price(home.price) + ' all-in', s: 'Listing price, confirmed ' + Format.days(home.confirmedDays) + '; registration estimated' };
    }
    if (id === 'space') {
      if (home.carpet.v == null) return { v: null, l: 'Unknown', d: 'Carpet area unclear', s: home.carpet.s };
      return { v: clamp(0.5 + (home.carpet.v - (TYPICAL[home.bhk] || 1300)) / 600), l: home.carpet.l, d: home.carpet.v.toLocaleString('en-IN') + ' sq ft carpet', s: home.carpet.s };
    }
    if (NEAR_TYPE[id]) {
      var n = nearest(home, NEAR_TYPE[id]);
      if (!n) return { v: null, l: 'Unknown', d: 'No data', s: 'No places of this type in our data' };
      return { v: clamp(1 - (n.d - 0.8) / 4), l: 'Estimated', d: n.p.name + ' · about ' + n.d.toFixed(1) + ' km', s: 'Straight-line distance; actual route may be longer' };
    }
    if (id === 'safety' || id === 'community') {
      var f = home[id];
      return { v: f.v, l: f.l, d: f.v == null ? 'Not known' : f.v >= 0.75 ? 'Good' : f.v >= 0.6 ? 'Fair' : 'Mixed', s: f.s };
    }
    if (id === 'building') {
      if (home.ready.v === false) return { v: 0.7, l: 'Estimated', d: 'New, under construction', s: home.ready.s };
      return { v: clamp(1 - home.age / 25), l: 'Verified', d: home.age + ' years old', s: 'K-RERA / occupancy certificate date' };
    }
    if (id === 'investment') {
      var rr = home.rental;
      return { v: rr.v, l: rr.l, d: rr.v == null ? 'Not known' : rr.v >= 0.75 ? 'Strong rental demand' : rr.v >= 0.55 ? 'Moderate rental demand' : 'Weaker rental demand', s: rr.s };
    }
    return { v: null, l: 'Unknown', d: '', s: '' };
  }

  function gate(home, profile) {
    var fails = [], unknown = [];
    MUST_HAVES.forEach(function (m) {
      if (!profile.must[m.id]) return;
      if (m.id === 'budget') {
        if (home.price > profile.budget) fails.push({ id: m.id, near: home.price <= profile.budget * 1.08, text: Format.price(home.price - profile.budget) + ' over budget' });
      } else if (m.id === 'bhk') {
        if (home.bhk < profile.bhk) fails.push({ id: m.id, near: home.bhk === profile.bhk - 1, text: home.bhk + ' BHK, you need ' + profile.bhk });
      } else {
        var f = home[m.id];
        if (f.v === false) fails.push({ id: m.id, near: false, text: m.label + ': no' });
        else if (f.v == null || f.l === 'Estimated') unknown.push({ id: m.id, text: m.label + ': can’t confirm' });
      }
    });
    var status = fails.length === 0 ? (unknown.length ? 'check' : 'pass') : (fails.length === 1 && fails[0].near && !unknown.length ? 'near' : 'out');
    return { status: status, fails: fails, unknown: unknown };
  }

  function evaluate(home, profile, weights) {
    var g = gate(home, profile), rows = [], sumW = 0, known = 0, unknownW = 0, facts = 0, factsKnown = 0;
    FACTORS.forEach(function (f) {
      var r = factor(f.id, home, profile), w = weights[f.id] || 0;
      if (r.skip) w = 0;
      if (!r.skip) { facts++; if (r.v != null) factsKnown++; }
      rows.push({ id: f.id, label: f.label, w: w, v: r.v, l: r.l, d: r.d, s: r.s, trips: r.trips });
      if (w <= 0) return;
      sumW += w;
      if (r.v == null) unknownW += w; else known += w * r.v;
    });
    var lo = sumW ? Math.round(known / sumW * 100) : 0;
    var hi = sumW ? Math.round((known + unknownW) / sumW * 100) : 0;
    rows.forEach(function (r) { r.share = sumW && r.w > 0 ? Math.round(r.w / sumW * 100) : 0; r.pts = r.v == null ? null : Math.round(r.w * r.v / (sumW || 1) * 100); });
    var concerns = home.concerns.slice();
    g.unknown.forEach(function (u) { concerns.unshift('Must-have not confirmed: ' + u.text.replace(': can’t confirm', '') + '.'); });
    return { home: home, gate: g, rows: rows, lo: lo, hi: hi, mid: (lo + hi) / 2, facts: facts, factsKnown: factsKnown, concerns: concerns };
  }

  function rankAll(profile, weights) {
    return HOMES.map(function (h) { return evaluate(h, profile, weights); })
      .sort(function (a, b) { return b.mid - a.mid || b.lo - a.lo; });
  }

  // For the no-match state: how many homes come back if one rule is switched off
  function ruleCosts(profile, weights) {
    return MUST_HAVES.filter(function (m) { return profile.must[m.id]; }).map(function (m) {
      var p = JSON.parse(JSON.stringify(profile)); p.must[m.id] = false;
      var n = rankAll(p, weights).filter(function (e) { return e.gate.status === 'pass' || e.gate.status === 'check'; }).length;
      return { id: m.id, label: m.label, n: n };
    });
  }

  return { evaluate: evaluate, rankAll: rankAll, ruleCosts: ruleCosts, km: km, nearest: nearest, trip: trip };
})();

var Format = {
  price: function (lakh) { return lakh >= 100 ? '₹' + (lakh / 100).toFixed(2).replace(/\.?0+$/, '') + ' Cr' : '₹' + Math.round(lakh) + 'L'; },
  days: function (d) { return d === 0 ? 'today' : d === 1 ? 'yesterday' : d + ' days ago'; }
};
