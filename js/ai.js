// AI client. Talks only to your Cloudflare Worker, which holds the API key.
// Saves tokens: on-demand calls only, small payloads, results cached per question.

var AI = (function () {
  var CACHE_KEY = 'dr-ai-cache-v1';
  var cache = {};
  try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch (e) { cache = {}; }

  function hash(str) { var h = 5381; for (var i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return String(h >>> 0); }
  function save() { try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (e) { /* storage full or blocked */ } }

  function configured() { return !!(window.DR_CONFIG && window.DR_CONFIG.aiEndpoint); }

  function parseJSON(text) {
    try { return JSON.parse(text); } catch (e) { /* fall through */ }
    var a = text.indexOf('{'), b = text.lastIndexOf('}');
    if (a >= 0 && b > a) { try { return JSON.parse(text.slice(a, b + 1)); } catch (e) { /* ignore */ } }
    return null;
  }

  // task: 'explain' | 'neighbourhood' | 'compare' | 'whatif' | 'owner'
  function ask(task, payload) {
    var key = task + ':' + hash(JSON.stringify(payload));
    if (cache[key]) return Promise.resolve(cache[key]);
    if (!configured()) return Promise.reject(new Error('not-configured'));
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 20000);
    return fetch(window.DR_CONFIG.aiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task: task, payload: payload }),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (res) {
      clearTimeout(timer);
      if (!res.ok) throw new Error('http-' + res.status);
      return res.json();
    }).then(function (data) {
      if (!data || typeof data.text !== 'string') throw new Error('bad-response');
      var out = { text: data.text.trim(), json: parseJSON(data.text) };
      cache[key] = out; save();
      return out;
    }).catch(function (err) { clearTimeout(timer); throw err; });
  }

  function errorMessage(err) {
    var m = err && err.message;
    if (m === 'not-configured') return 'AI isn’t connected yet. Add your Worker URL in js/config.js.';
    if (m === 'http-429') return 'You’ve reached the AI limit for now. Try again later; everything else still works.';
    return 'AI help is unavailable right now. Everything else works.';
  }

  return { ask: ask, configured: configured, errorMessage: errorMessage };
})();
