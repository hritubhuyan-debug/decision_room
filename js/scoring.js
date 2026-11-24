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
  function commuteRange(home, work) {
    var road = km(home, work) * 1.35; // straight line → rough road distance
    return [Math.round(road * 2.2 + 5), Math.round(road * 3.4 + 10)]; // weekday 9 am range, minutes
  }
  var TYPICAL = { 1: 600, 2: 900, 3: 1300, 4: 1800 };
  var NEAR_TYPE = { schools: 'school', health: 'hospital', parks: 'park', shops: 'shops', transit: 'metro' };

  // Returns { v: 0..1 | null, l: label, d: display text, s: source }
  function factor(id, home, profile) {
    if (id === 'commute') {
      var w = WORK_PLACES[profile.work];
      if (!w) return { v: null, l: 'Unknown', d: 'Add a place you travel to', s: 'No travel destination set', skip: true };
      var r = commuteRange(home, w), mid = (r[0] + r[1]) / 2;
      return { v: clamp(1 - (mid - 25) / 50), l: 'Estimated', d: r[0] + '–' + r[1] + ' min to ' + w.name + ' at 9 am', s: 'Estimated from distance and typical weekday traffic' };
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
      rows.push({ id: f.id, label: f.label, w: w, v: r.v, l: r.l, d: r.d, s: r.s });
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

  return { evaluate: evaluate, rankAll: rankAll, ruleCosts: ruleCosts, km: km, nearest: nearest };
})();

var Format = {
  price: function (lakh) { return lakh >= 100 ? '₹' + (lakh / 100).toFixed(2).replace(/\.?0+$/, '') + ' Cr' : '₹' + Math.round(lakh) + 'L'; },
  days: function (d) { return d === 0 ? 'today' : d === 1 ? 'yesterday' : d + ' days ago'; }
};
