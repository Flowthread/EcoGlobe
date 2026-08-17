/**
 * everything - Environmental intelligence for any point on Earth.
 *
 * Extends the "earth" wind visualization with a click-to-reveal environmental
 * health card: live weather, air quality (AQI + pollutants), atmospheric
 * carbon (CO2 / methane), reverse-geocoded place info, and the climate
 * action being taken by the containing country.
 *
 * Data sources (all free, no API key required for browser-direct calls):
 *   - Open-Meteo Forecast API   (weather, elevation)
 *   - Open-Meteo Air Quality API (AQI, pollutants, CO2, methane, dust, UV)
 *   - BigDataCloud reverse-geocode (place name)
 *   - OpenClimate v1 API (national emissions + targets) via /api/emissions proxy
 *
 * Copyright (c) 2026 Earth Forward hackathon build.
 * The MIT License - http://opensource.org/licenses/MIT
 */
var everything = (function () {
    "use strict";

    var FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
    var AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality";
    var REVERSE_GEOCODE_URL = "https://api.bigdatacloud.net/data/reverse-geocode-client";
    var EMISSIONS_PROXY = "/api/emissions";

    // Tracks the in-flight request so a newer click supersedes a stale one.
    var currentToken = 0;

    function fmt(n, unit, digits) {
        if (n == null || (typeof n === "number" && isNaN(n))) return "—";
        var d = digits == null ? 1 : digits;
        var v = typeof n === "number" ? n.toFixed(d) : n;
        return unit ? v + " " + unit : v;
    }

    function degToCompass(deg) {
        if (deg == null || isNaN(deg)) return "—";
        var dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
        return dirs[Math.round(((deg % 360) / 22.5)) % 16];
    }

    // US EPA AQI category. Returns {label, color}.
    function aqiCategory(aqi) {
        if (aqi == null || isNaN(aqi)) return { label: "Unknown", color: "#888888" };
        if (aqi <= 50)  return { label: "Good",                       color: "#00e400" };
        if (aqi <= 100) return { label: "Moderate",                    color: "#ffff00" };
        if (aqi <= 150) return { label: "Unhealthy (Sensitive)",       color: "#ff7e00" };
        if (aqi <= 200) return { label: "Unhealthy",                  color: "#ff0000" };
        if (aqi <= 300) return { label: "Very Unhealthy",             color: "#8f3f97" };
        return { label: "Hazardous", color: "#7e0023" };
    }

    // WMO weather interpretation codes (subset) used by Open-Meteo.
    function weatherCodeLabel(code) {
        var m = {
            0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
            45: "Fog", 48: "Depositing rime fog",
            51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
            56: "Light freezing drizzle", 57: "Dense freezing drizzle",
            61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
            66: "Light freezing rain", 67: "Heavy freezing rain",
            71: "Slight snow fall", 73: "Moderate snow fall", 75: "Heavy snow fall",
            77: "Snow grains",
            80: "Slight rain showers", 81: "Moderate rain showers", 82: "Violent rain showers",
            85: "Slight snow showers", 86: "Heavy snow showers",
            95: "Thunderstorm", 96: "Thunderstorm w/ slight hail", 99: "Thunderstorm w/ heavy hail"
        };
        return m[code] || (code != null ? "Code " + code : "—");
    }

    // Composite 0-100 environmental health score from AQI, PM2.5 and UV.
    // Higher is healthier. Derived purely from fetched values.
    function healthScore(aqi, pm25, uv) {
        if (aqi == null && pm25 == null && uv == null) return null;

        // AQI component: 0->100 healthy, 300+->0.
        var aqiScore = 100;
        if (aqi != null && !isNaN(aqi)) {
            aqiScore = Math.max(0, 100 - (aqi / 3.0));
        }

        // PM2.5 component: 0->100, 150+->0 (ug/m3).
        var pmScore = 100;
        if (pm25 != null && !isNaN(pm25)) {
            pmScore = Math.max(0, 100 - (pm25 / 1.5));
        }

        // UV component: 0-2 full, 11+ reduced.
        var uvScore = 100;
        if (uv != null && !isNaN(uv)) {
            uvScore = Math.max(0, 100 - (Math.max(0, uv - 2) * 9));
        }

        // Weighted blend: air quality matters most.
        return Math.round(aqiScore * 0.5 + pmScore * 0.35 + uvScore * 0.15);
    }

    function scoreGrade(score) {
        if (score == null) return { grade: "—", color: "#888888" };
        if (score >= 90) return { grade: "A", color: "#00e400" };
        if (score >= 75) return { grade: "B", color: "#9acd32" };
        if (score >= 60) return { grade: "C", color: "#ffff00" };
        if (score >= 45) return { grade: "D", color: "#ff7e00" };
        return { grade: "F", color: "#ff0000" };
    }

    function esc(s) {
        if (s == null) return "";
        return String(s).replace(/[&<>"]/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
        });
    }

    async function fetchJson(url) {
        var r = await fetch(url);
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
    }

    async function getWeather(lat, lon) {
        var url = FORECAST_URL + "?latitude=" + lat + "&longitude=" + lon +
            "&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation," +
            "weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m" +
            "&daily=temperature_2m_max,temperature_2m_min,precipitation_sum" +
            "&timezone=auto";
        return fetchJson(url);
    }

    async function getAirQuality(lat, lon) {
        var url = AIR_QUALITY_URL + "?latitude=" + lat + "&longitude=" + lon +
            "&current=us_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone," +
            "dust,uv_index,carbon_dioxide,methane,pm10_wildfires&timezone=auto";
        return fetchJson(url);
    }

    async function getPlace(lat, lon) {
        var url = REVERSE_GEOCODE_URL + "?latitude=" + lat + "&longitude=" + lon + "&localityLanguage=en";
        return fetchJson(url);
    }

    // National climate action via the OpenClimate proxy.
    async function getEmissions(countryName) {
        if (!countryName) return null;
        try {
            var url = EMISSIONS_PROXY + "?q=" + encodeURIComponent(countryName);
            var data = await fetchJson(url);
            return data && data.success ? data.data : null;
        } catch (e) {
            return null;
        }
    }

    // Aggregate every source for one click.
    async function load(lat, lon) {
        var token = ++currentToken;

        var results = await Promise.allSettled([
            getWeather(lat, lon),
            getAirQuality(lat, lon),
            getPlace(lat, lon)
        ]);

        // Stale click guard: a later click should override this one.
        if (token !== currentToken) return null;

        var wx = results[0].status === "fulfilled" ? results[0].value : null;
        var aq = results[1].status === "fulfilled" ? results[1].value : null;
        var place = results[2].status === "fulfilled" ? results[2].value : null;

        var country = place && (place.countryName || place.countryCode);

        var emissions = null;
        if (country) {
            emissions = await getEmissions(country);
            if (token !== currentToken) return null;  // re-check after the await
        }

        var c = (wx && wx.current) || {};
        var daily = (wx && wx.daily) || {};
        var a = (aq && aq.current) || {};

        var score = healthScore(a.us_aqi, a.pm2_5, a.uv_index);

        return {
            place: place || {},
            weather: {
                temp: c.temperature_2m, feels: c.apparent_temperature,
                humidity: c.relative_humidity_2m, precip: c.precipitation,
                cloud: c.cloud_cover, pressure: c.pressure_msl,
                windSpeed: c.wind_speed_10m, windDir: c.wind_direction_10m,
                windDirCompass: degToCompass(c.wind_direction_10m),
                code: c.weather_code, codeLabel: weatherCodeLabel(c.weather_code),
                tMax: daily.temperature_2m_max && daily.temperature_2m_max[0],
                tMin: daily.temperature_2m_min && daily.temperature_2m_min[0],
                precipSum: daily.precipitation_sum && daily.precipitation_sum[0],
                elevation: wx && wx.elevation
            },
            air: {
                usAqi: a.us_aqi, aqiCat: aqiCategory(a.us_aqi),
                pm25: a.pm2_5, pm10: a.pm10, o3: a.ozone,
                no2: a.nitrogen_dioxide, so2: a.sulphur_dioxide,
                co: a.carbon_monoxide, dust: a.dust, uv: a.uv_index,
                fireSmoke: a.pm10_wildfires
            },
            carbon: { co2: a.carbon_dioxide, methane: a.methane },
            emissions: emissions,
            score: score,
            scoreGrade: scoreGrade(score)
        };
    }

    function row(label, value) {
        return '<div class="ef-row"><span class="ef-label">' + esc(label) + '</span>' +
            '<span class="ef-value">' + esc(value) + '</span></div>';
    }

    // Render the aggregated card into the given DOM element.
    function render(el, d) {
        if (!d) return;
        var p = d.place, w = d.weather, a = d.air, cb = d.carbon;

        var placeName = p.city || p.locality || p.principalSubdivision || p.countryName || "Location";
        var region = [p.principalSubdivision, p.countryName].filter(Boolean).join(", ");
        var score = d.score != null ? d.score : "—";

        var html = '';

        // Header: place + health score badge
        html += '<div class="ef-head">';
        html +=   '<div class="ef-place">' + esc(placeName) + '</div>';
        if (region) html += '<div class="ef-region">' + esc(region) + '</div>';
        html +=   '<div class="ef-score" style="border-color:' + d.scoreGrade.color + ';color:' + d.scoreGrade.color + '">' +
                  '<span class="ef-score-grade">' + d.scoreGrade.grade + '</span>' +
                  '<span class="ef-score-val">' + score + '</span><span class="ef-score-of">/100</span></div>';
        html += '</div>';

        // Weather
        html += '<div class="ef-section ef-weather">';
        html +=   '<div class="ef-section-title">Weather</div>';
        html +=   row("Conditions", w.codeLabel);
        html +=   row("Temp", fmt(w.temp, "°C") + " (feels " + fmt(w.feels, "°C") + ")");
        html +=   row("Hi / Lo", fmt(w.tMax, "°", 0) + " / " + fmt(w.tMin, "°", 0));
        html +=   row("Humidity", fmt(w.humidity, "%", 0));
        html +=   row("Wind", fmt(w.windSpeed, "km/h", 1) + " " + (w.windDirCompass || "") + " (" + fmt(w.windDir, "°", 0) + ")");
        html +=   row("Pressure", fmt(w.pressure, "hPa", 0));
        html +=   row("Cloud", fmt(w.cloud, "%", 0));
        html +=   row("Precip", fmt(w.precip, "mm", 1) + " (24h " + fmt(w.precipSum, "mm", 1) + ")");
        if (w.elevation != null) html += row("Elevation", fmt(w.elevation, "m", 0));
        html += '</div>';

        // Air quality
        html += '<div class="ef-section ef-air">';
        html +=   '<div class="ef-section-title">Air Quality</div>';
        html +=   '<div class="ef-aqi-badge" style="background:' + a.aqiCat.color + '">' +
                  '<span class="ef-aqi-val">' + fmt(a.usAqi, "", 0) + '</span>' +
                  '<span class="ef-aqi-label">' + esc(a.aqiCat.label) + '</span></div>';
        html +=   row("PM2.5", fmt(a.pm25, "µg/m³"));
        html +=   row("PM10", fmt(a.pm10, "µg/m³"));
        html +=   row("Ozone (O₃)", fmt(a.o3, "µg/m³"));
        html +=   row("NO₂", fmt(a.no2, "µg/m³"));
        html +=   row("SO₂", fmt(a.so2, "µg/m³"));
        html +=   row("Carbon Monoxide", fmt(a.co, "µg/m³"));
        html +=   row("Dust", fmt(a.dust, "µg/m³"));
        html +=   row("UV Index", fmt(a.uv, "", 1));
        if (a.fireSmoke != null) html += row("Wildfire Smoke", fmt(a.fireSmoke, "µg/m³"));
        html += '</div>';

        // Carbon
        html += '<div class="ef-section ef-carbon">';
        html +=   '<div class="ef-section-title">Carbon &amp; Greenhouse Gases</div>';
        html +=   row("CO₂ (surface)", fmt(cb.co2, "ppm", 1));
        html +=   row("Methane (CH₄)", fmt(cb.methane, "µg/m³"));
        html += '</div>';

        // Climate action
        if (d.emissions) {
            var e = d.emissions;
            var targets = e.targets || [];
            var hasNetZero = targets.some(function (t) { return t.is_net_zero; });
            var emissionsSources = e.emissions ? Object.keys(e.emissions) : [];
            var latestYear = null, latestEmissions = null, latestSource = null;
            emissionsSources.forEach(function (dsId) {
                var records = (e.emissions[dsId] && e.emissions[dsId].data) || [];
                records.forEach(function (rec) {
                    if (rec.total_emissions != null && (latestYear == null || rec.year > latestYear)) {
                        latestYear = rec.year;
                        latestEmissions = rec.total_emissions;
                        latestSource = e.emissions[dsId].name || dsId;
                    }
                });
            });
            var population = e.population && e.population[0];
            var gdp = e.gdp && e.gdp[0];

            // Find the most progressed target with a percent_achieved value.
            var bestTarget = null;
            targets.forEach(function (t) {
                if (t.percent_achieved != null &&
                    (bestTarget == null || t.percent_achieved > (bestTarget.percent_achieved || -1))) {
                    bestTarget = t;
                }
            });
            var initiative = bestTarget && bestTarget.initiative;

            html += '<div class="ef-section ef-action">';
            html +=   '<div class="ef-section-title">Climate Action · ' + esc(e.name || p.countryName || "") + '</div>';
            if (latestEmissions != null) {
                html += row("Latest emissions", fmt((latestEmissions / 1000000), "Mt CO₂e", 1) + " (" + latestYear + ")");
                if (latestSource) html += row("Source", esc(latestSource));
            }
            html +=   row("Reduction targets", String(targets.length));
            html +=   row("Net-zero pledge", hasNetZero ? "Yes" : "No / unknown");
            if (initiative && initiative.name) {
                html += row("Initiative", initiative.name);
            }
            if (bestTarget && bestTarget.target_year) {
                var pct = bestTarget.percent_achieved != null ? fmt(bestTarget.percent_achieved, "%", 1) : "—";
                html += row("Target " + bestTarget.target_year, pct + " achieved");
            }
            if (population) html += row("Population", fmt(population.population, "", 0).replace(/\B(?=(\d{3})+(?!\d))/g, ","));
            if (gdp) html += row("GDP", "$" + fmt((gdp.gdp / 1000000000), "B", 1));
            html += '</div>';
        }

        // Footer: data sources
        html += '<div class="ef-foot">Open-Meteo · BigDataCloud · OpenClimate</div>';

        el.classList.remove("invisible");
        el.innerHTML = html;
    }

    function showLoading(el) {
        el.classList.remove("invisible");
        el.innerHTML = '<div class="ef-loading">Loading environmental data…</div>';
    }

    function showError(el) {
        el.classList.remove("invisible");
        el.innerHTML = '<div class="ef-loading">Environmental data unavailable for this point.</div>';
    }

    function clear(el) {
        el.classList.add("invisible");
        el.innerHTML = "";
    }

    return {
        load: load,
        render: render,
        showLoading: showLoading,
        showError: showError,
        clear: clear
    };
})();
