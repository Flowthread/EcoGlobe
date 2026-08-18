// Vercel serverless function: generates a 1–3 sentence AI summary of a
// country's climate action using OpenRouter (deepseek/deepseek-v4-flash).
//
// POST /api/climate-agent
//   body (flat contract, preferred): {
//     country: string,
//     emissions: number | string,            // latest emissions, e.g. Mt CO2e/yr
//     targets: number,                       // number of climate targets set
//     netZero: boolean | string,             // net-zero pledge status
//     actor?: object                         // optional full OpenClimate actor
//   }
//   Backward-compatible shapes also accepted:
//     - emissions as { latestEmissions, latestYear, latestSource }
//     - hasNetZero as an alias for netZero
//     - targets/emissions/netZero stringified
//
// Response:
//   - { success: true, summary: string }
//   - 503 if OPENROUTER_API_KEY is missing (and logged)
//   - 200 with { success: false, summary: "AI summary not available at this time." }
//     on any OpenRouter failure (upstream error, timeout, empty response) so the
//     frontend always gets a displayable string and never breaks the card.
//   - 400 on malformed/missing required fields.
//
// Requests time out after 10s so a slow model never hangs the caller.

import type { VercelRequest, VercelResponse } from "@vercel/node";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "deepseek/deepseek-v4-flash";
const TIMEOUT_MS = 10_000;
const FALLBACK_SUMMARY = "AI summary not available at this time.";

const SYSTEM_PROMPT =
  "You are a climate policy analyst. Given the following climate data for a " +
  "country, write a 1–3 sentence summary of what that country is doing to " +
  "address climate change. Keep it informative, slightly optimistic, and easy " +
  "to understand. If the data is insufficient, state that clearly.";

type AnyObj = Record<string, unknown>;

interface ReqBody {
  country?: unknown;
  emissions?: unknown;            // number | string | { latestEmissions, latestYear, latestSource }
  emissionsYear?: unknown;        // year for flat-number emissions (sibling field)
  targets?: unknown;              // number | string
  netZero?: unknown;               // boolean | string
  hasNetZero?: unknown;            // legacy alias for netZero
  actor?: AnyObj;
}

function toStr(v: unknown): string {
  if (v == null) return "";
  return String(v);
}

function toNum(v: unknown): number | null {
  const n = typeof v === "number" ? v : parseFloat(toStr(v));
  return typeof n === "number" && !isNaN(n) ? n : null;
}

// Normalize the various accepted emissions shapes into { value, year, source }.
function normalizeEmissions(raw: unknown): {
  value: string;
  year: string;
  source: string;
} {
  if (raw && typeof raw === "object") {
    const o = raw as AnyObj;
    const val = o.latestEmissions ?? o.emissions ?? o.value;
    const year = o.latestYear ?? o.year;
    const source = o.latestSource ?? o.source;
    return {
      value: val != null ? toStr(val) : "",
      year: year != null ? toStr(year) : "",
      source: source != null ? toStr(source) : "",
    };
  }
  // Flat: a number or string (e.g. "5400" Mt CO2e/yr).
  return { value: raw != null ? toStr(raw) : "", year: "", source: "" };
}

function boolish(v: unknown): boolean | null {
  if (v == null) return null;
  if (typeof v === "boolean") return v;
  const s = toStr(v).trim().toLowerCase();
  if (["true", "yes", "1", "y"].includes(s)) return true;
  if (["false", "no", "0", "n"].includes(s)) return false;
  return null;
}

function describeData(b: ReqBody): string {
  const parts: string[] = [];
  if (b.country) parts.push("Country: " + toStr(b.country));

  const e = normalizeEmissions(b.emissions);
  // A flat-number emissions value may be accompanied by a sibling emissionsYear.
  const year = e.year || (b.emissionsYear != null ? toStr(b.emissionsYear) : "");
  if (e.value) {
    parts.push(
      "Latest emissions: " + e.value + " Mt CO2e/yr" +
      (year ? " (" + year + ")" : "")
    );
  } else {
    parts.push("Latest emissions: unknown");
  }

  const targetsNum = toNum(b.targets);
  parts.push("Number of climate targets set: " + (targetsNum ?? 0));

  const nz = boolish(b.netZero != null ? b.netZero : b.hasNetZero);
  parts.push("Net-zero pledge: " + (nz === true ? "Yes" : nz === false ? "No" : "No/unknown"));

  if (e.source) parts.push("Emissions data source: " + e.source);
  return parts.join("\n");
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  if (req.method !== "POST") {
    res.status(405).json({ success: false, summary: FALLBACK_SUMMARY, message: "method not allowed, use POST" });
    return;
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("[climate-agent] OPENROUTER_API_KEY is not configured");
    res.status(503).json({
      success: false,
      summary: FALLBACK_SUMMARY,
      message: "AI summary unavailable: OPENROUTER_API_KEY is not configured.",
    });
    return;
  }

  let body: ReqBody;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  } catch {
    res.status(400).json({ success: false, summary: FALLBACK_SUMMARY, message: "invalid JSON body" });
    return;
  }

  if (!body.country) {
    res.status(400).json({ success: false, summary: FALLBACK_SUMMARY, message: "missing 'country' in body" });
    return;
  }

  const userContent = describeData(body);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const r = await fetch(OPENROUTER_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        temperature: 0.5,
        max_tokens: 160,
      }),
    });

    if (!r.ok) {
      const text = await r.text().catch(() => "");
      console.error("[climate-agent] OpenRouter HTTP " + r.status + ": " + text.slice(0, 300));
      // Graceful: return 200 + fallback so the frontend never breaks.
      res.status(200).json({ success: false, summary: FALLBACK_SUMMARY });
      return;
    }

    const data = (await r.json()) as AnyObj;
    const choices = (data.choices as AnyObj[]) || [];
    const first = choices[0] || {};
    const msg = (first.message as AnyObj) || {};
    const summary = typeof msg.content === "string" ? msg.content.trim() : "";

    if (!summary) {
      console.error("[climate-agent] empty AI response");
      res.status(200).json({ success: false, summary: FALLBACK_SUMMARY });
      return;
    }
    res.status(200).json({ success: true, summary });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    console.error("[climate-agent] " + (aborted ? "timeout" : err instanceof Error ? err.message : "failed"));
    // Graceful: 200 + fallback on timeout/throw.
    res.status(200).json({ success: false, summary: FALLBACK_SUMMARY });
  } finally {
    clearTimeout(timer);
  }
}
