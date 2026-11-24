# Decision Room — prototype

A responsive (phone + web) prototype of an AI-assisted home-buying decision tool.
**All homes, prices and places are fictional.** Plain HTML, CSS and JavaScript: no build step.

## What's real and what's AI

| Part | How it works |
| --- | --- |
| Must-have checks, fit scores, ranking, what-if re-ranking, concern flags | Plain JavaScript (`js/scoring.js`). No AI, no tokens. Same inputs → same results. |
| "Explain this home", neighbourhood summary, comparison summary, owner questions, typed what-ifs | Real AI (Claude Haiku) through your Cloudflare Worker. Only runs when the buyer taps a button. Results are cached in the browser. |
| Step-by-step mode | No AI unless the buyer switches on **Enable AI mode**. |

If the Worker isn't set up, the app shows "AI isn't connected yet" and everything else still works.

## 1 · Put it on GitHub Pages (about 5 min)

1. Create a new GitHub repository and upload everything in this folder (keep the folder structure).
2. Repository → **Settings → Pages** → Source: **Deploy from a branch** → Branch: `main`, folder `/ (root)` → Save.
3. After a minute your site is at `https://<your-username>.github.io/<repo-name>/`.

To try it on your computer first: in this folder run `python3 -m http.server 8000` and open http://localhost:8000.

## 2 · Connect the AI (about 20 min)

1. **Get an API key:** sign in to the Claude Console (console.anthropic.com) → API keys → Create key. Copy it.
2. **Create the Worker:** sign in to Cloudflare (free plan) → **Workers & Pages → Create → Create Worker** → name it e.g. `decision-room-ai` → Deploy → **Edit code** → replace everything with the contents of `worker/worker.js` → Deploy.
3. **Add settings:** Worker → **Settings → Variables and Secrets**:
   - `ANTHROPIC_API_KEY` → type **Secret** → paste your key
   - `ALLOWED_ORIGINS` → type **Text** → `https://<your-username>.github.io,http://localhost:8000`
     (the origin only: no repo name, no trailing slash)
   - optional `MODEL` → defaults to `claude-haiku-5-5`
4. Copy the Worker's URL (like `https://decision-room-ai.<you>.workers.dev`).
5. Open `js/config.js`, paste it as `aiEndpoint`, commit. Done.

**Token and cost safeguards already built in:** AI is only called on a tap, never on page load; each request sends only one home's scores and labelled facts; replies are capped at 140–220 tokens; repeated questions are served from the browser cache; the Worker accepts only 5 fixed tasks from your site and allows about 40 calls per visitor per hour. Set a monthly spend limit in the Claude Console as well.

## 3 · Replace the placeholder photos

Each home's photo is `images/homes/<id>.svg`. To use real photos (that you have the right to use):

1. Add `images/homes/<id>.jpg` (landscape, ideally 1600 × 900, under ~300 KB).
2. In `js/data.js`, change that home's `photo` to `images/homes/<id>.jpg`.

Photos are shown in fixed shapes (16:9 cards and hero, square thumbnails) and cropped to fill, so any landscape photo displays correctly on phone and desktop.

Home ids: `lakeside, palmgrove, cedar, banyan, orchid, maple, silveroak, greenleaf, ivy, sunrise`.

## 4 · Design system (from the moodboard)

All colours, fonts, spacing, radii and motion live in `css/tokens.css`. Change values there and the whole app follows.

- **Palette:** Navy `#2F4156` (text, primary buttons), Teal `#567C8D` (accent, fills), Sky Blue `#C8D9E6` (tints, selected states), Beige `#F5EFEB` (background), White (cards). Small teal text uses a deeper `#4A6B7A` so it stays readable on beige.
- **Type:** Helvetica Neue (falls back to Helvetica, then Arial on Windows/Android). Light weight for big scores, medium for labels.
- **Look:** soft white dashboard cards with rounded corners and gentle shadows; pill buttons; hatched bars for unknown parts of a score.
- **Interactions:** the expanding selector (Essentials, Sort) morphs from a pill into a segmented control with a sliding highlight and a ✓ to close; filters and tabs use the same sliding highlight; homes on the phone map sit in a swipeable carousel where cards blur out at the edge; the welcome screen has a slowly sliding feature carousel (pauses on hover, stops if the device asks for reduced motion).
- **Map:** CARTO "Positron" light basemap (muted, matches the palette). Free for low-traffic and non-commercial use; check CARTO's terms before a public launch.

## Files

```
index.html          page shell (loads Leaflet map + scripts)
css/tokens.css      design tokens (replace in Step 5)
css/app.css         layout and components, mobile first, desktop at 900px+
js/config.js        your Worker URL
js/data.js          fictional homes and places
js/scoring.js       must-have gate + weighted fit score (no AI)
js/ai.js            AI client: calls the Worker, caches answers
js/app.js           screens, routing, interactions
worker/worker.js    Cloudflare Worker (holds the API key)
images/homes/       placeholder photos
```

Map data © OpenStreetMap contributors, via Leaflet.
