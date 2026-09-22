# Lantern

**Time-aware safer routes for women walking alone.**

Built by **Team Paradigm** for **MUSA CodeX 2026** · Theme: *Women Safety & Social Impact* · Problem: *"The Route Nobody Warned Her About"*

> **Data notice:** the street map, streetlight coverage and baseline incident reports in this project are **synthetic demo data**. Lantern is a working prototype of the *idea*, not a real-world safety map. See [Demo limitations](#demo-limitations).

---

## What is Lantern?

Most navigation apps answer one question: *what is the fastest way?* The fastest way at 2 PM and the fastest way at 11 PM are the same to a map app, but they are not the same walk.

Lantern reweights every street for the **hour you are actually travelling**. It compares the fastest route with a safety-weighted one, and explains in plain language why they differ. Users can report an incident, which is saved and used in later route calculations.

## Problem statement

A short route can pass through an unlit alley that is busy at noon and empty at midnight. Nobody warns you, because that information lives in other people's experience, not in the map. Lantern makes that hidden context visible and lets people add to it.

## Key features

- **Time-aware route recommendation.** A departure-time slider with 8 AM, 2 PM, 6 PM and 11 PM presets. Changing the hour changes the safety numbers and can change the route.
- **Fastest vs. safer route**, drawn on the map and compared side by side (distance and safety score).
- **Three safety factors:** street lighting, foot traffic / isolation, and incident reports, shown per route in a comparison table.
- **"Why the route changes"** explanation that names the risky shortcut and shows how its score moves between morning and night.
- **Incident reporting** with severity. Click a street on the map (or use the dropdown), then submit. The UI updates immediately and the report is saved to Supabase.
- **Persistence with a safe fallback.** Saved reports load on startup and feed the safety calculation. If the database is not configured or is unreachable, Lantern keeps working on the demo data and shows a short message.
- **Source and destination pickers** for six demo places.

## How the safety score works

Every street segment gets a **penalty** for the selected hour:

```
penalty = lighting risk + isolation risk + incident risk      (clamped to 0 – 1.8)
score   = 100 × (1 − penalty / 1.8)                           (0 – 100, higher is safer)
```

| Factor | How it is calculated |
|---|---|
| **Lighting risk** | Only applies at night (8 PM – 6 AM). Lit segment: `0.08`. Unlit segment: `0.55`. In daylight: `0`. |
| **Isolation risk** | `(1 − foot traffic) × 0.35`. Foot traffic depends on street type (avenue / cross street / alley) and hour. Alleys are busiest 7 AM – 7 PM and nearly empty after. |
| **Incident risk** | Each report is weighted by how close its hour is to your departure hour (`proximity = max(0, 1 − hours_apart / 6)`, wrapping around midnight) and by severity (`severity / 3`). The sum is divided by `2.2` and capped at `1`. |

Two routes are then found with **Dijkstra's algorithm**, using different edge weights:

- **Fastest:** minimise `distance`
- **Recommended:** minimise `distance × (1 + 2.5 × penalty)` for the selected hour

Because the penalty depends on the hour, the same street grid can produce different recommended routes at 8 AM and 11 PM.

Reports you submit are added **on top of** the synthetic baseline reports. They use the hour that was selected when you submitted.

## Technologies used

- **Frontend:** plain HTML, CSS and JavaScript. No framework and no build step.
- **Map:** inline SVG, drawn from a graph of street segments.
- **Routing:** Dijkstra implemented in `js/routing.js`.
- **Backend / database:** [Supabase](https://supabase.com) (Postgres + auto-generated REST API), called with `fetch`. No SDK is needed.
- **Fonts:** Space Grotesk and Inter via Google Fonts.

## Project structure

```
lantern/
├── index.html            Page markup
├── css/
│   └── style.css         Styles
├── js/
│   ├── config.js         ← Supabase URL + public key go here
│   ├── data.js           Synthetic street grid + baseline incidents (demo / fallback data)
│   ├── safety.js         Lighting, isolation and incident risk; penalty and score
│   ├── routing.js        Dijkstra; fastest and recommended routes
│   ├── supabase.js       Load and save incident reports; error handling
│   └── app.js            UI, map rendering, incident form
├── supabase/
│   └── schema.sql        Table + Row Level Security policies
├── README.md
└── .gitignore
```

## How to run locally

Lantern is a static site.

**Quickest:** open `index.html` in a browser. It runs in demo mode with no setup.

**Recommended** (especially once Supabase is connected): serve the folder locally.

```bash
cd lantern
python3 -m http.server 8000
# then open http://localhost:8000
```

Any static file server works. To publish, the folder can be deployed as-is to GitHub Pages, Netlify or Vercel.

Google Fonts needs an internet connection. Without it, the browser falls back to a system font and everything else still works.

## How to configure Supabase

Without this, Lantern runs in **demo mode**: everything works, but new reports last only until the page is refreshed.

1. **Create a project** at [supabase.com](https://supabase.com).
2. **Create the table.** Open *SQL Editor → New query*, paste the contents of [`supabase/schema.sql`](supabase/schema.sql), and click *Run*.
3. **Copy your URL and public key.** Open *Project Settings → API* (or *API Keys*):
   - **Project URL**, for example `https://abcdxyz.supabase.co`
   - The **publishable** key (`sb_publishable_…`), or the legacy **anon** key (`eyJ…`)
4. **Paste them into `js/config.js`:**

   ```js
   window.LANTERN_CONFIG = {
     SUPABASE_URL: 'https://YOUR-PROJECT.supabase.co',
     SUPABASE_ANON_KEY: 'sb_publishable_...'
   };
   ```
5. **Reload the page.** The status line under *Report an incident* should read *"Connected to Supabase"*. Submit a report, then check *Table Editor → incident_reports*, and refresh the page to see it come back.

### Security

- Only the **public** key belongs in the browser. It is designed to be visible; **Row Level Security** in `schema.sql` is what protects the table (visitors can read and add reports, but not edit or delete them).
- **Never** put a `sb_secret_…` key or the `service_role` key in this project. Lantern detects and refuses to use them, but they should not be pasted here at all. If one was ever committed, rotate it in Supabase.
- `route_segment` values are stored as segment ids (`e0`, `e1`, …) generated from a fixed seed in `js/data.js`. **Do not change the seed or the grid without clearing the table**, or old reports will point at different streets.

## Demo walkthrough

1. Choose **From** and **To** (default: Metro Station → Home).
2. Pick a departure time. Try **2 PM**, then **11 PM**, and watch the routes and scores change.
3. Compare the **Fastest** and **Recommended** cards and the **safety factors** table.
4. Read **Why the route changes**.
5. Click a street on the recommended (teal) route at 11 PM, choose **Severe**, and press **Add report**.
6. The report appears on the map at once, the score shift is shown, and the route updates. With Supabase connected, refresh the page: the report is still there.

## Demo limitations

- **All map, lighting and baseline incident data is synthetic.** It is generated from a fixed random seed. Nothing here describes any real street, city or event.
- The map is a small **4 × 5 grid** with six named demo places. There is no address search or real geocoding.
- Only **two routes** are computed (fastest and recommended), not a full set of alternatives.
- The safety model is a **transparent heuristic** for demonstration. Its weights are hand-chosen and have not been validated against real data.
- Reports are **anonymous and unmoderated**, and there is no rate limiting. Anyone with the page can submit. A production version would need verification, spam protection and moderation.
- Saved reports are **loaded once at page load**. There is no live sync between users.
- In demo mode (no database), reports live in browser memory only.
- Older reports do not fade with time yet.

## Future scope

- Use a **real street network** (for example OpenStreetMap) and real streetlight and footfall data where available.
- Address search, live location, and multiple alternative routes.
- **Accounts or anonymous auth**, rate limiting, moderation and report trust scoring.
- **Live updates** with Supabase Realtime; **decay** of old reports.
- Personal safety preferences (for example, weight lighting more heavily).
- Trip sharing and a check-in feature; a mobile-first PWA.
- Validation with local women's safety groups and municipal data partners before any real-world use.
