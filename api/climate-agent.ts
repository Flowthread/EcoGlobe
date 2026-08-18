// Vercel serverless function: generates a 1–3 sentence AI summary of a
// country's climate action using OpenRouter (deepseek/deepseek-v4-flash).
//
// POST /api/climate-agent
//   body: { country: string, emissions: { latestYear, latestEmissions, latestSource },
//           targets: number, hasNetZero: boolean, actor?: object }
// -> { success: true, summary: string }
//
// Requires OPENROUTER_API_KEY in the environment. If missing -> 503.
// Requests time out after 10s so a slow model never hangs the caller.

import type { VercelRequest, VercelResponse } from "@vercel/node";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "deepseek/deepseek-v4-flash";
const TIMEOUT_MS = 10_000;

const SYSTEM_PROMPT =
  "You are a climate policy analyst. Given the following climate data for a " +
  "country, write a 1–3 sentence summary of what that country is doing to " +
  "address climate change. Keep it informative, slightly optimistic, and easy " +
  "to understand. If the data is insufficient, state that clearly.";

type AnyObj = Record<string, unknown>;

interface ReqBody {
  country?: string;
  emissions?: {
    latestYear?: number | string;
    latestEmissions?: number | string; // Mt CO2e/yr (already converted by the caller)
    latestSource?: string;
  };
  targets?: number;
  hasNetZero?: boolean;
  actor?: AnyObj;
}

function describeData(b: ReqBody): string {
  const parts: string[] = [];
  if (b.country) parts.push("Country: " + b.country);
  const e = b.emissions || {};
  if (e.latestEmissions != null) {
    parts.push(
      "Latest emissions: " + e.latestEmissions + " Mt CO2e/yr" +
      (e.latestYear != null ? " (" + e.latestYear + ")" : "")
    );
  } else {
    parts.push("Latest emissions: unknown");
  }
  parts.push("Number of climate targets set: " + (b.targets ?? 0));
  parts.push("Net-zero pledge: " + (b.hasNetZero ? "Yes" : "No/unknown"));
  if (e.latestSource) parts.push("Emissions data source: " + e.latestSource);
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
    res.status(405).json({ success: false, message: "method not allowed, use POST" });
    return;
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    res.status(503).json({
      success: false,
      message: "AI summary unavailable: OPENROUTER_API_KEY is not configured.",
    });
    return;
  }

  let body: ReqBody;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  } catch {
    res.status(400).json({ success: false, message: "invalid JSON body" });
    return;
  }

  if (!body.country) {
    res.status(400).json({ success: false, message: "missing 'country' in body" });
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
      res.status(502).json({
        success: false,
        message: "OpenRouter error HTTP " + r.status,
        detail: text.slice(0, 500),
      });
      return;
    }

    const data = (await r.json()) as AnyObj;
    const choices = (data.choices as AnyObj[]) || [];
    const first = choices[0] || {};
    const msg = (first.message as AnyObj) || {};
    const summary = typeof msg.content === "string" ? msg.content.trim() : "";

    if (!summary) {
      res.status(502).json({ success: false, message: "empty AI response" });
      return;
    }
    res.status(200).json({ success: true, summary });
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    res.status(504).json({
      success: false,
      message: aborted
        ? "AI summary timed out"
        : err instanceof Error ? err.message : "AI summary failed",
    });
  } finally {
    clearTimeout(timer);
  }
}
