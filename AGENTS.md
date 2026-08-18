# EcoGlobe (cambecc/earth fork)

Repo: https://github.com/Flowthread/EcoGlobe (main branch). Hack: NextStep Hacks 2026.

Brand: "EcoGlobe" — tagline "See the planet. Understand the future."
Palette: Deep Ocean Navy #0A1E2F, Teal/Sea Green #1E8A7A, Bright Coral #FF6B4A,
Gold #F5C542, Dark Night #0B0F1A, Clean White #F0F4FA, Glassmorphism Dark rgba(18,30,45,0.85).
Logo: public/logo.svg.

## Run locally
- Dev server: `node dev-server.js 8080` (express 3.4.4, serves `public/`).
- The custom logger in dev-server.js does not flush request lines reliably under
  modern Node; use `express.logger("dev")` in a throwaway server for request logging.

## Data architecture (products.js)
- Weather files live in `public/data/weather/{dir}/{stamp}-{type}-{surface}-{level}-gfs-1.0.json`.
  - `dir` = "current" or "yyyy/mm/dd". `stamp` = "current" (for current dir) or hour like "0300".
  - Grid is 360x181 (1 deg), header fields: lo1,la1,dx,dy,nx,ny,refTime,forecastTime,centerName + flat `data` array.
- Two file formats consumed by builders:
  - GRIB-JSON: `[{header, data}]` — wind, temp, total_cloud_water, total_precipitable_water, mean_sea_level_pressure.
  - NetCDF-JSON: `{Originating_or_generating_Center, variables:{time,lat,lon,<var>:{data,shape}}}` — relative_humidity (`Relative_humidity_isobaric`/`Relative_humidity_height_above_ground`), air_density.
- `buildProduct.load` (products.js) has a 404 fallback: a dated file that 404s is retried as
  `/data/weather/current/current-<rest-of-filename>` so historical time-nav renders using current data.
- `buildGrids` (earth.js) keeps the previous grid when a new selection has no data (null-safe
  `interpolateField`, `validityDate`, `showGridDetails`).

## Generated data
- `scripts/generate_grids.py` synthesizes the 34 current-step files for all overlays + altitude
  levels from the bundled surface wind file. Approximation data for visualization only.

## Click feature
- Clicking the globe (orthographic) shows weather/carbon/air-quality/location data. Latitude
  from projection clicks is clamped/validated (TASK_1).

## Environmental health card (everything.js)
- `everything.load(lat, lon)` fires Open-Meteo forecast + air-quality + BigDataCloud reverse
  geocode in parallel (`Promise.allSettled`), then the national climate-action data via the
  `/api/emissions` OpenClimate proxy. A `currentToken` stale-click guard supersedes older clicks.
- The Climate Action section is ALWAYS rendered at the bottom of the card (visually separated by
  a top divider + green tint, class `ef-action--footer`). When the proxy returns an actor it shows:
  latest emissions (Mt CO₂e/yr, most recent year), number of climate targets, net-zero pledge
  (Yes/No), and a progress bar for the most advanced target (`percent_achieved`). When no actor is
  resolved it shows an explicit "no data" state instead of omitting the section.
- Target selection: prefer the target with the highest `percent_achieved`; if none carry a progress
  value, fall back to the nearest `target_year` and render the bar at 0%.

## expand.js caveat (IMPORTANT)
- `public/index.html` is hand-edited and contains the `<div id="location-extra">` card container
  that `everything.js` renders into. `public/templates/index.html` (the Swig source) does NOT
  contain it. Therefore running `node expand.js` would regenerate `public/index.html` from the
  template and silently REMOVE the card container, breaking the environmental health card.
- Resolution: treat `public/index.html` as the source of truth for the built page. Do NOT re-run
  `expand.js` without first adding the `#location-extra` div to `public/templates/index.html`
  (and the `everything.js` script tag, which the template also lacks).

## Deployment (Vercel)
- `vercel.json` routes every non-`/api/` path to `public/` (static) and treats `api/emissions.ts`
  and `api/climate-agent.ts` as serverless functions. No env vars required except `OPENROUTER_API_KEY`
  for the AI summary.

## AI climate-action summary (api/climate-agent.ts)
- `POST /api/climate-agent` accepts `{ country, emissions:{latestYear,latestEmissions(Mt),latestSource},
  targets, hasNetZero, actor }` and returns `{ success, summary }` from OpenRouter
  (`deepseek/deepseek-v4-flash`). Requires `OPENROUTER_API_KEY`; without it → 503. 10s timeout via
  AbortController.
- In `everything.js`, `buildClimateContext(country, emissions)` distills the OpenClimate actor into
  the compact context (latest emissions in Mt, target count, net-zero flag). `getClimateSummary(ctx)`
  POSTs it to the agent. The summary is attached to the load() return as `aiSummary` and rendered in
  the Climate Action section below the progress bar ("AI Overview"). A null/failed result shows the
  fallback "AI summary not available." and never breaks the rest of the card.
