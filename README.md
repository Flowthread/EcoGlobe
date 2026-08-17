# Earth Forward 🌍

**Click anywhere on Earth to see its live environmental health: weather, air quality, carbon, and the climate action being taken there.**

Built for **NextStep Hacks 2026** — theme: *Earth Forward*.

Earth Forward turns a beautiful global wind visualization into a global **environmental intelligence tool**. Every click answers one question: *"How healthy is this place, and what's being done about it?"*

## Live demo

Deployed on Vercel: _(add your deployment URL here)_

## What it does

Click any point on the globe and an **environmental health card** appears with:

- **Location** — city, region, country, elevation (BigDataCloud reverse geocode)
- **Weather** — current conditions, temperature (incl. feels-like, hi/lo), humidity, wind, pressure, cloud cover, precipitation (Open-Meteo Forecast)
- **Air Quality** — US AQI with a color-coded category badge, plus PM2.5, PM10, O₃, NO₂, SO₂, CO, dust, UV index, and wildfire smoke (Open-Meteo Air Quality)
- **Carbon & Greenhouse Gases** — surface CO₂ (ppm) and methane at the point (Open-Meteo Air Quality)
- **Climate Action** — the containing country's latest emissions, number of reduction targets, whether it has a net-zero pledge, population, and GDP (OpenClimate v1 API)
- **Environmental Health Score** — a composite 0–100 grade (A–F) blending AQI, PM2.5, and UV

The original wind animation, 8 map projections, and overlay system are all preserved.

## Data sources (all free, no API key required)

| Data | API | Browser? |
|---|---|---|
| Weather + elevation + forecast | [Open-Meteo Forecast API](https://open-meteo.com/en/docs) | direct (CORS-enabled) |
| Air quality (AQI, PM, O₃, NO₂, SO₂, CO, dust, UV) | [Open-Meteo Air Quality API](https://open-meteo.com/en/docs/air-quality-api) | direct |
| Carbon (CO₂ ppm, methane, wildfire smoke) | [Open-Meteo Air Quality API](https://open-meteo.com/en/docs/air-quality-api) | direct |
| Place name (city/region/country) | [BigDataCloud reverse geocode](https://www.bigdatacloud.com/client/api) | direct |
| National emissions, targets, net-zero, population, GDP | [OpenClimate v1 API](https://github.com/Open-Earth-Foundation/OpenClimate) | via serverless proxy |
| Map, wind animation, projections | [cambecc/earth](https://github.com/cambecc/earth) (self-hosted) | direct |

## Architecture

```
public/                              <- static earth visualization (Vercel static)
  index.html                         <- adds #location-extra card container
  libs/earth/1.0.0/
    everything.js                    <- NEW: fetches + renders the environmental health card
    earth.js                         <- modified: hooks everything.js into the click handler
    globes.js, products.js, micro.js <- original (unchanged)
  styles/styles.css                  <- modified: adds health card styling
api/
  emissions.ts                       <- NEW: Vercel serverless proxy for OpenClimate
vercel.json                          <- NEW: static + serverless routing
package.json                         <- modified: adds @vercel/node
```

### How it works

1. The user clicks anywhere on the globe.
2. earth's existing `showLocationDetails(point, coord)` runs (it already shows coordinates + wind).
3. **New:** it also calls `everything.load(lat, lon)`, which fires the browser-direct APIs in parallel (Open-Meteo forecast, Open-Meteo air quality, BigDataCloud geocode).
4. It then calls the `/api/emissions` serverless proxy, which looks up the country on OpenClimate and returns its emissions/targets.
5. Results render into the `#location-extra` card with an AQI badge and health score.

## Deploy on Vercel

1. Fork/push this repo.
2. Import it in [Vercel](https://vercel.com) — it auto-detects the `vercel.json` config.
3. No environment variables needed (all APIs are keyless).
4. Deploy. The static earth app serves from `public/`; the OpenClimate proxy runs as a serverless function at `/api/emissions`.

Run locally without Vercel: the original `dev-server.js` serves the static app (the emissions proxy only works on Vercel, but the card gracefully omits the climate-action section if the proxy is unreachable).

```
npm install
node dev-server.js 8080
# open http://localhost:8080
```

## Hackathon build breakdown

Per Devpost rules, here's what existed before vs. what was built during NextStep Hacks 2026:

### Pre-existing (from cambecc/earth, MIT licensed)
- The global wind visualization, D3 + backbone + Canvas architecture
- 8 map projections, particle animation, overlay system
- The static dev server
- All original `micro.js`, `globes.js`, `products.js`, and most of `earth.js`

### Built during the hackathon
- **`everything.js`** — new module orchestrating 4 data APIs, with health-score computation, AQI categorization, and card rendering
- **`api/emissions.ts`** — new Vercel serverless proxy bridging OpenClimate climate-action data to the browser
- **`earth.js` modification** — hooking the environmental card into the click handler (`showLocationDetails` / `clearLocationDetails`)
- **`index.html` modification** — the `#location-extra` container + updated metadata
- **`styles.css` addition** — the full environmental health card UI (AQI badge, score badge, sections, scrollbar)
- **`vercel.json`** — deployment config for static + serverless
- **`package.json`** — added `@vercel/node`

## Credits

- Wind visualization: [cambecc/earth](https://github.com/cambecc/earth) by Cameron Beccario (MIT)
- Weather & air quality data: [Open-Meteo](https://open-meteo.com/) (CC BY 4.0, non-commercial)
- Climate action data: [OpenClimate](https://openclimate.network/) by Open Earth Foundation (Apache-2.0)
- Reverse geocoding: [BigDataCloud](https://www.bigdatacloud.com/)

## License

MIT — see `LICENSE.md`. The original earth README is preserved as `earth-original-readme.md`.
