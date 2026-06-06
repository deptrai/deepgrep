/**
 * Health check for deepgrep — validates API key, models, and Devin Desktop.
 *
 * Used by the deepgrep_status MCP tool.
 */

import { existsSync } from "node:fs";
import { getDbPath } from "./extract-key.mjs";

const SIGNUP_URL = "https://deepgrep.chainlens.net";

/**
 * Ping a single model via chat completions to check availability.
 * Returns "ok", "rate_limited" (429), "unauthorized" (403/401), or "error:<msg>".
 * @param {string} baseUrl
 * @param {string} apiKey
 * @param {string} model
 * @returns {Promise<string>}
 */
async function _pingModel(baseUrl, apiKey, model) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 3,
        stream: false,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (resp.status === 200) return "ok";
    if (resp.status === 429) return "rate_limited";
    if (resp.status === 403 || resp.status === 401) return "unauthorized";
    return `error:${resp.status}`;
  } catch (e) {
    clearTimeout(timer);
    if (e.name === "AbortError") return "error:timeout";
    return `error:${e.message?.slice(0, 40) || "unknown"}`;
  }
}

/**
 * Check whether the Devin Desktop (or legacy Windsurf) local DB exists.
 * @returns {boolean}
 */
function _detectDevin() {
  try {
    return existsSync(getDbPath());
  } catch {
    return false;
  }
}

/**
 * Run a full health check of the deepgrep configuration.
 *
 * @returns {Promise<{
 *   keyValid: boolean,
 *   endpoint: string,
 *   models: Array<{id: string, status: string}>,
 *   devinDetected: boolean,
 *   config: { fastBackend: string, fastModel: string, deepModel: string, apiUrl: string },
 *   signupUrl: string
 * }>}
 */
export async function checkHealth() {
  const apiUrl = process.env.DEEPGREP_API_URL || "https://router.chainlens.net/v1";
  const apiKey = process.env.DEEPGREP_API_KEY || "";
  const deepModel = process.env.DEEPGREP_MODEL || "deep-search";
  const fastBackend = process.env.DEEPGREP_FAST_BACKEND || "windsurf";
  const fastModel = process.env.DEEPGREP_FAST_MODEL || "";

  // 1. Check if key is set and valid — use a quick chat ping (more reliable than /models timeout)
  let keyValid = false;
  if (apiKey) {
    const status = await _pingModel(apiUrl, apiKey, "deep-search");
    keyValid = status === "ok" || status === "rate_limited"; // rate_limited = key valid but throttled
  }

  // 2. Ping up to 2 models
  const modelsToPing = ["deep-search"];
  if (deepModel && deepModel !== "deep-search") {
    modelsToPing.push(deepModel);
  }

  const models = [];
  if (apiKey && keyValid) {
    for (const id of modelsToPing) {
      const status = await _pingModel(apiUrl, apiKey, id);
      models.push({ id, status });
    }
  }

  // 3. Devin Desktop detection
  const devinDetected = _detectDevin();

  return {
    keyValid,
    endpoint: apiUrl,
    models,
    devinDetected,
    config: { fastBackend, fastModel, deepModel, apiUrl },
    signupUrl: SIGNUP_URL,
  };
}

/**
 * Format a HealthReport into a human-readable string for MCP output.
 * @param {Object} report
 * @returns {string}
 */
export function formatHealthReport(report) {
  const lines = ["deepgrep status", ""];

  // Key
  if (report.keyValid) {
    lines.push("✅ API key: valid");
  } else if (process.env.DEEPGREP_API_KEY) {
    lines.push("❌ API key: invalid or unreachable");
  } else {
    lines.push(`❌ API key: not set — get a free key at ${report.signupUrl}`);
  }

  // Endpoint
  lines.push(`✅ Endpoint: ${report.endpoint}`);

  // Models
  for (const m of report.models) {
    if (m.status === "ok") {
      lines.push(`✅ ${m.id}: available`);
    } else if (m.status === "rate_limited") {
      lines.push(`⚠️  ${m.id}: rate limited (429)`);
    } else if (m.status === "unauthorized") {
      lines.push(`❌ ${m.id}: unauthorized (403/401)`);
    } else {
      lines.push(`⚠️  ${m.id}: ${m.status}`);
    }
  }

  // Devin Desktop
  if (report.devinDetected) {
    lines.push("✅ Devin Desktop: detected (fast mode auto-key OK)");
  } else {
    const fastNote = report.config.fastBackend === "windsurf"
      ? "⚠️  Devin Desktop: not detected — set DEEPGREP_FAST_BACKEND=openai for fast mode"
      : "ℹ️  Devin Desktop: not detected (fast mode using openai backend)";
    lines.push(fastNote);
  }

  // Config summary
  lines.push("");
  lines.push(`Config: fast_backend=${report.config.fastBackend}` +
    (report.config.fastModel ? `, fast_model=${report.config.fastModel}` : "") +
    `, deep_model=${report.config.deepModel}`);

  // Signup hint if key missing
  if (!report.keyValid && !process.env.DEEPGREP_API_KEY) {
    lines.push("");
    lines.push(`💡 Get a free API key: ${report.signupUrl}`);
  }

  return lines.join("\n");
}
