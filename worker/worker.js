// Decision Room — AI proxy for Cloudflare Workers (free tier is enough).
// Holds your Anthropic API key so it never appears in the website's code.
// Only accepts 5 fixed tasks from allowed websites, with small token limits.
//
// Settings (Cloudflare dashboard → your Worker → Settings → Variables and Secrets):
//   ANTHROPIC_API_KEY  (Secret)  your key from the Claude Console
//   ALLOWED_ORIGINS    (Text)    e.g. https://your-name.github.io,http://localhost:8000
//   MODEL              (Text, optional) defaults to claude-haiku-5-5

const RULES = 'Use ONLY the facts in the JSON input. Never invent facts, numbers, places, prices, legal status or amenities. ' +
  "Facts labelled 'Estimated' are estimates: say so. 'Unknown' or null means unknown: say it is unknown, never guess. " +
  'Plain, friendly English for a homebuyer in India. No markdown.';

const TASKS = {
  explain: {
    max: 220,
    system: RULES + ' Explain how well this home fits the buyer\'s priorities. Reply with ONLY a JSON object: ' +
      '{"why": "max 2 sentences", "tradeoff": "1 sentence on the main compromise", "next": "Shortlist" | "Visit" | "Investigate" | "Walk away", "reason": "1 sentence"}. ' +
      'Choose Investigate if a must-have is UNKNOWN or there are concerns to check; Walk away if a must-have FAILS.'
  },
  neighbourhood: {
    max: 160,
    system: RULES + ' Write a 2 to 3 sentence neighbourhood summary for this buyer using only the nearby places and distances given, ' +
      'focusing on their top priorities. Distances are straight-line, so say "about".'
  },
  compare: {
    max: 180,
    system: RULES + ' Compare these homes against the buyer\'s priorities in 2 to 3 sentences: which leads on what matters most, ' +
      'the key trade-off, and any concern that should be checked first. Do not tell them what to buy.'
  },
  whatif: {
    max: 140,
    system: 'You convert a homebuyer\'s what-if request into priority slider changes. Weights are integers 0 to 10. ' +
      'Never change a factor where locked is true. Only use factor ids from the input. ' +
      'Reply with ONLY JSON: {"changes": {"factorId": newWeight}, "note": "one short sentence describing what changed"}. ' +
      'If the request is not about priorities, reply {"changes": {}, "note": "short explanation"}.'
  },
  owner: {
    max: 180,
    system: RULES + ' Draft 3 to 5 short, polite questions a buyer can send the owner to confirm ONLY the unknown facts and concerns given. ' +
      'Reply with ONLY JSON: {"questions": ["..."]}.'
  }
};

const hits = new Map(); // best-effort rate limit per visitor IP (per Worker instance)
const LIMIT = 40, WINDOW_MS = 60 * 60 * 1000;

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin'
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (!allowed.includes(origin)) return new Response('Forbidden', { status: 403 });
    const headers = cors(origin);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers });

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const now = Date.now(), h = hits.get(ip) || { n: 0, reset: now + WINDOW_MS };
    if (now > h.reset) { h.n = 0; h.reset = now + WINDOW_MS; }
    if (++h.n > LIMIT) return new Response('Too many requests', { status: 429, headers });
    hits.set(ip, h);

    let body;
    try { body = await request.json(); } catch { return new Response('Bad request', { status: 400, headers }); }
    const task = TASKS[body && body.task];
    const input = JSON.stringify(body && body.payload || {});
    if (!task || input.length > 6000) return new Response('Bad request', { status: 400, headers });

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: env.MODEL || 'claude-haiku-5-5',
        max_tokens: task.max,
        system: task.system,
        messages: [{ role: 'user', content: input }]
      })
    });
    if (!res.ok) return new Response('Upstream error', { status: 502, headers });
    const data = await res.json();
    const text = (data.content || []).filter(c => c.type === 'text').map(c => c.text).join('').trim();
    return new Response(JSON.stringify({ text }), { headers: { ...headers, 'Content-Type': 'application/json' } });
  }
};
