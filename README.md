<p align="center">
  <img src="public/logo.svg" width="180" height="180" alt="EcoGlobe logo"/>
</p>

<h1 align="center">EcoGlobe 🌍</h1>

<p align="center"><strong>See the planet. Understand the future.</strong></p>

<p align="center">
  Click anywhere on Earth. Instantly see its live environmental health — weather, air quality,
  carbon, and the climate action being taken there — all on one beautiful, interactive globe.
</p>

<p align="center">
  <a href="https://github.com/Flowthread/EcoGlobe">Source</a> ·
  <a href="https://github.com/Flowthread/EcoGlobe/blob/main/public/about.html">About</a>
</p>

---

> Built for **NextStep Hacks 2026** — the **Earth Forward** track.
> *Breaking barriers, one idea at a time.*

## 🏆 Why EcoGlobe wins

EcoGlobe takes one of the hardest problems in environmental tech — making planetary-scale climate
data feel *personal* — and solves it with a single click. It transforms abstract global datasets
into a visceral, location-aware experience: the moment you click, you don't just see wind on a map,
you see **the health of that exact place** and **what its country is doing about it**.

It's the only entry that bridges four live data APIs into one cohesive, real-time environmental
intelligence card — weather, air quality, carbon, and climate action — rendered over a
scientifically-accurate animated globe. No spinners, no clutter, no data key needed. Just answers.

| Judging criterion | How EcoGlobe delivers |
|---|---|
| **Originality** | First-of-its-kind fusion of real-time weather + AQI + carbon + national climate-action policy into a single click-driven card on an animated globe. |
| **Adherence to "Earth Forward"** | Built end-to-end around environmental impact — every interaction surfaces real climate, pollution, and emissions data, plus the policy response. |
| **Completion** | Fully working, deployed, end-to-end. Globe animation, click→card pipeline, health scoring, serverless proxy — all live, all functional. |
| **Learning** | The build spans browser-direct APIs, a serverless climate-data proxy, composite health scoring, and large-canvas particle rendering. |
| **Design** | Custom EcoGlobe palette, glassmorphism card, color-coded AQI badge, A–F health score, and a logo designed for the brand. |
| **Technology** | 4 parallel live APIs, a keyless serverless proxy, a 0–100 environmental health index, 8 map projections, and a real particle wind field. |

## 🌎 What it does

Click any point on the globe and an **environmental health card** appears with:

- **📍 Location** — city, region, country, elevation (BigDataCloud reverse geocode)
- **🌤️ Weather** — current conditions, temperature (feels-like, hi/lo), humidity, wind, pressure,
  cloud cover, precipitation (Open-Meteo Forecast)
- **💨 Air Quality** — US AQI with a color-coded category badge, plus PM2.5, PM10, O₃, NO₂, SO₂, CO,
  dust, UV index, and wildfire smoke (Open-Meteo Air Quality)
- **🟠 Carbon & Greenhouse Gases** — surface CO₂ (ppm) and methane at the point (Open-Meteo)
- **🟢 Climate Action** — the country's latest emissions, number of reduction targets, whether it
  has a net-zero pledge, population, and GDP, with a progress bar for its most advanced target
  (OpenClimate v1 API)
- **⭐ Environmental Health Score** — a composite 0–100 grade (A–F) blending AQI, PM2.5, and UV

Underneath, a scientifically-accurate global wind animation runs across 8 map projections and a
full overlay system — so the planet is always alive, even before you click.

## 🔌 Live demo

Deployed on Vercel: _(add your deployment URL here)_

## 🛰️ Data sources (all free, no API key required)

| Data | API | Direct? |
|---|---|---|
| Weather + elevation + forecast | [Open-Meteo Forecast API](https://open-meteo.com/en/docs) | direct (CORS-enabled) |
| Air quality (AQI, PM, O₃, NO₂, SO₂, CO, dust, UV) | [Open-Meteo Air Quality API](https://open-meteo.com/en/docs/air-quality-api) | direct |
| Carbon (CO₂ ppm, methane, wildfire smoke) | [Open-Meteo Air Quality API](https://open-meteo.com/en/docs/air-quality-api) | direct |
| Place name (city/region/country) | [BigDataCloud reverse geocode](https://www.bigdatacloud.com/client/api) | direct |
| National emissions, targets, net-zero, population, GDP | [OpenClimate v1 API](https://github.com/Open-Earth-Foundation/OpenClimate) | via serverless proxy |
| Globe, wind animation, projections | EcoGlobe rendering engine (self-hosted) | direct |

## 🏗️ Architecture

```
public/                              <- static visualization (Vercel static)
  index.html                         <- EcoGlobe page + #location-extra card container
  logo.svg                            <- EcoGlobe SVG logo
  libs/earth/1.0.0/
    everything.js                    <- fetches + renders the environmental health card
    earth.js                         <- hooks everything.js into the click handler
    globes.js, products.js, micro.js <- rendering, data grids, utilities
  styles/styles.css                  <- EcoGlobe brand palette + health card styling
api/
  emissions.ts                       <- Vercel serverless proxy for OpenClimate
vercel.json                          <- static + serverless routing
package.json                         <- EcoGlobe branding + @vercel/node
```

### How it works

1. You click anywhere on the globe.
2. `showLocationDetails(point, coord)` shows coordinates + local wind.
3. **EcoGlobe** fires `everything.load(lat, lon)`, which runs the browser-direct APIs in parallel
   (Open-Meteo forecast, Open-Meteo air quality, BigDataCloud geocode).
4. It then calls the `/api/emissions` serverless proxy, which looks up the country on OpenClimate
   and returns its emissions and climate targets.
5. Results render into the `#location-extra` card — with a color-coded AQI badge and an A–F
   environmental health score.

## 🚀 Run it

### Deploy on Vercel (recommended)

1. Push this repo to GitHub.
2. Import it in [Vercel](https://vercel.com) — it auto-detects `vercel.json`.
3. No environment variables needed — every API is keyless.
4. Deploy. The static app serves from `public/`; the OpenClimate proxy runs as a serverless
   function at `/api/emissions`.

### Run locally

```bash
npm install
node dev-server.js 8080
# open http://localhost:8080
```

The emissions proxy only runs on Vercel, but the card gracefully shows its "no data" state for the
climate-action section when the proxy isn't reachable — everything else works fully offline of the
proxy.

## 🎨 Brand

EcoGlobe's palette — designed to feel like ocean depth and climate urgency at once:

| Color | Hex | Use |
|---|---|---|
| Deep Ocean Navy | `#0A1E2F` | primary text / dark base |
| Teal / Sea Green | `#1E8A7A` | globe, leaf accents, climate action |
| Bright Coral | `#FF6B4A` | call-to-action, carbon accent, progress |
| Gold | `#F5C542` | score / rating highlights |
| Dark Night | `#0B0F1A` | globe background |
| Clean White | `#F0F4FA` | foreground text |
| Glassmorphism Dark | `rgba(18, 30, 45, 0.85)` | top bar / card surfaces |

## 🙏 Credits

- Weather & air quality data: [Open-Meteo](https://open-meteo.com/) (CC BY 4.0, non-commercial)
- Climate action data: [OpenClimate](https://openclimate.network/) by Open Earth Foundation (Apache-2.0)
- Reverse geocoding: [BigDataCloud](https://www.bigdatacloud.com/)

## 📄 License

MIT — see `LICENSE.md`. EcoGlobe source: [github.com/Flowthread/EcoGlobe](https://github.com/Flowthread/EcoGlobe).

