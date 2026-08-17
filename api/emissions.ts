// Vercel serverless function: proxies national climate-action data from the
// OpenClimate v1 API, keeping the browser call keyless and CORS-safe.
//
// GET /api/emissions?q=<country name or actor id>
// -> { success: true, data: { actor_id, name, emissions, targets, population, gdp, ... } }

import type { VercelRequest, VercelResponse } from "@vercel/node";

const OC_BASE = "https://openclimate.network/api/v1";

type AnyObj = Record<string, unknown>;

// Maps verbose country names (as returned by BigDataCloud) to OpenClimate-
// friendly names or directly to ISO actor_ids.
const COUNTRY_OVERRIDES: Record<string, string> = {
  "united states of america (the)": "US",
  "united states of america": "US",
  "united states": "US",
  "united kingdom of great britain and northern ireland (the)": "GB",
  "united kingdom": "GB",
  "russian federation (the)": "RU",
  "russian federation": "RU",
  "russia": "RU",
  "korea (the republic of)": "KR",
  "republic of korea": "KR",
  "south korea": "KR",
  "korea (the democratic people's republic of)": "KP",
  "north korea": "KP",
  "iran (islamic republic of)": "IR",
  "iran": "IR",
  "syrian arab republic (the)": "SY",
  "syrian arab republic": "SY",
  "syria": "SY",
  "venezuela (bolivarian republic of)": "VE",
  "venezuela": "VE",
  "bolivia (plurinational state of)": "BO",
  "bolivia": "BO",
  "tanzania, united republic of": "TZ",
  "tanzania": "TZ",
  "czechia": "CZ",
  "czech republic": "CZ",
  "moldova, republic of": "MD",
  "moldova": "MD",
  "ivory coast": "CI",
  "côte d'ivoire": "CI",
  "vietnam": "VN",
  "viet nam": "VN",
  "brunei darussalam": "BN",
  "brunei": "BN",
  "laos": "LA",
  "lao people's democratic republic": "LA",
};

function normalizeCountry(q: string): string {
  const lower = q.trim().toLowerCase();
  if (COUNTRY_OVERRIDES[lower]) return COUNTRY_OVERRIDES[lower];
  return q.trim();
}

async function fetchJson(url: string): Promise<AnyObj> {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`HTTP ${r.status} from ${url}`);
  return (await r.json()) as AnyObj;
}

// Resolve a country name to an actor_id. OpenClimate's full-text `q` search is
// unreliable for common country names, so we use the exact `name` match and
// prefer results whose type is "country". Falls back to the name as an id
// (e.g. passing "US" directly).
async function resolveActorId(q: string): Promise<string | null> {
  const normalized = normalizeCountry(q);

  // If normalization produced a 2-letter code, use it directly.
  if (/^[A-Z]{2}$/.test(normalized)) return normalized;

  // Otherwise, try the exact name search filtered to countries.
  try {
    const searchUrl = `${OC_BASE}/search/actor?name=${encodeURIComponent(normalized)}&type=country`;
    const json = await fetchJson(searchUrl);
    const hits = (json.data as AnyObj[]) || [];
    const country = hits.find((h) => h.type === "country") || hits[0];
    if (country && country.actor_id) return String(country.actor_id);
  } catch {
    /* fall through */
  }

  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS for the browser caller.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  const q = String(req.query.q || "").trim();
  if (!q) {
    res.status(400).json({ success: false, message: "missing 'q' query parameter" });
    return;
  }

  try {
    const actorId = await resolveActorId(q);
    if (!actorId) {
      res.status(200).json({ success: true, data: null });
      return;
    }

    // Fetch the actor overview: emissions, targets, population, GDP, etc.
    const actorUrl = `${OC_BASE}/actor/${encodeURIComponent(actorId)}`;
    const actorJson = await fetchJson(actorUrl);

    res.status(200).json({ success: true, data: actorJson.data || null });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    res.status(500).json({ success: false, message });
  }
}

