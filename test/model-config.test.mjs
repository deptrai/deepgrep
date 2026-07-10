/**
 * Tests for per-mode model configuration changes:
 *   - core.mjs: search() accepts model param, checkRateLimit uses per-call model,
 *     cache key includes effectiveModel, _meta.model populated
 *   - server.mjs: WS_FAST_MODEL / WS_DEEP_MODEL env vars, DEEP_BACKEND gating
 *   - _formatResult: model from _meta displayed in [config] line
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { _formatResult, formatSnippetToolOutput } from "../src/server.mjs";
import { rankResults } from "../src/rank.mjs";
import { serializeSearchResult } from "../src/contract.mjs";

// ─── _formatResult: model from _meta ───────────────────────

test("_formatResult: uses _meta.model in [config] line when present", () => {
  const result = {
    files: [{ path: "src/a.ts", full_path: "/abs/src/a.ts", ranges: [[1, 10]] }],
    rg_patterns: ["auth"],
    _meta: { treeDepth: 3, treeSizeKB: 5.2, model: "glm-5-2-high", backend: "windsurf" },
  };
  const out = _formatResult(result, 5, 10, 8, 90000, []);
  assert.match(out, /model=glm-5-2-high/);
});

test("_formatResult: falls back to SWE-1.7 default when _meta.model absent", () => {
  const result = {
    files: [{ path: "src/a.ts", full_path: "/abs/src/a.ts", ranges: [[1, 10]] }],
    rg_patterns: ["auth"],
    _meta: { treeDepth: 3, treeSizeKB: 5.2 },
  };
  const out = _formatResult(result, 3, 10, 8, 30000, []);
  assert.match(out, /model=SWE-1\.7/);
});

test("_formatResult: uses _meta.model for error diagnostic line", () => {
  const result = {
    files: [],
    error: "something went wrong",
    _meta: { treeDepth: 2, treeSizeKB: 1.5, model: "glm-5-2-high", backend: "windsurf" },
  };
  const out = _formatResult(result, 5, 10, 8, 90000, []);
  // Non-friendly errors include backend/model diagnostic
  assert.match(out, /backend=windsurf.*model=glm-5-2-high/);
});

test("_formatResult: 429 error uses friendly message with model", () => {
  const result = {
    files: [],
    error: "HTTP 429: Too Many Requests",
    _meta: { treeDepth: 2, treeSizeKB: 1.5, model: "swe-1-7" },
  };
  const out = _formatResult(result, 3, 10, 8, 30000, []);
  // Friendly error path — should mention rate limit
  assert.match(out, /rate.limit|429|too many/i);
});

// ─── serializeSearchResult: model propagates through JSON contract ───

test("serializeSearchResult JSON: backend from _meta preserved", () => {
  const result = {
    files: [{ path: "a.ts", full_path: "/abs/a.ts", ranges: [[1, 5]] }],
    rg_patterns: [],
    _meta: { treeDepth: 3, treeSizeKB: 2.0, backend: "windsurf", model: "glm-5-2-high" },
  };
  const json = serializeSearchResult(result, { maxTurns: 5, mode: "deep" }, _formatResult, "json");
  const parsed = JSON.parse(json);
  assert.equal(parsed.meta.backend, "windsurf");
  assert.equal(parsed.meta.mode, "deep");
});

test("serializeSearchResult text: model from _meta shown in config line", () => {
  const result = {
    files: [{ path: "a.ts", full_path: "/abs/a.ts", ranges: [[1, 5]] }],
    rg_patterns: ["test"],
    _meta: { treeDepth: 2, treeSizeKB: 1.0, model: "swe-1-7", backend: "windsurf" },
  };
  const text = serializeSearchResult(result, { maxTurns: 3, maxResults: 10, maxCommands: 8, timeoutMs: 30000, excludePaths: [], mode: "quick" }, _formatResult, "text");
  assert.match(text, /model=swe-1-7/);
  assert.match(text, /mode.*quick|backend=windsurf/);
});

// ─── rank.mjs: dedup + merge always applied (unchanged but covers path) ───

test("rankResults: deduplicates files by full_path and merges ranges", () => {
  const files = [
    { path: "a.ts", full_path: "/abs/a.ts", ranges: [[1, 5], [3, 8]] },
    { path: "a.ts", full_path: "/abs/a.ts", ranges: [[10, 15]] },
  ];
  const ranked = rankResults(files, {});
  assert.equal(ranked.length, 1);
  // [1,5] and [3,8] overlap → [1,8]; [10,15] adjacent to [1,8]? No (gap at 9)
  assert.deepEqual(ranked[0].ranges, [[1, 8], [10, 15]]);
});

test("rankResults: rerank=true sorts source before test files", () => {
  const files = [
    { path: "a.test.ts", full_path: "/abs/a.test.ts", ranges: [[1, 5]] },
    { path: "a.ts", full_path: "/abs/a.ts", ranges: [[1, 5]] },
  ];
  const ranked = rankResults(files, { rerank: true });
  assert.equal(ranked[0].full_path, "/abs/a.ts");
  assert.equal(ranked[1].full_path, "/abs/a.test.ts");
});

test("rankResults: rerank=false preserves LLM order", () => {
  const files = [
    { path: "a.test.ts", full_path: "/abs/a.test.ts", ranges: [[1, 5]] },
    { path: "a.ts", full_path: "/abs/a.ts", ranges: [[1, 5]] },
  ];
  const ranked = rankResults(files, { rerank: false });
  assert.equal(ranked[0].full_path, "/abs/a.test.ts");
});

test("rankResults: empty input returns empty", () => {
  assert.deepEqual(rankResults([], {}), []);
  assert.deepEqual(rankResults(null, {}), []);
});

test("rankResults: adjacent ranges merge (gap of 1)", () => {
  const files = [
    { path: "a.ts", full_path: "/abs/a.ts", ranges: [[1, 5], [6, 10]] },
  ];
  const ranked = rankResults(files, {});
  assert.deepEqual(ranked[0].ranges, [[1, 10]]);
});

test("rankResults: non-adjacent ranges do not merge", () => {
  const files = [
    { path: "a.ts", full_path: "/abs/a.ts", ranges: [[1, 3], [5, 7]] },
  ];
  const ranked = rankResults(files, {});
  assert.deepEqual(ranked[0].ranges, [[1, 3], [5, 7]]);
});

// ─── Env var defaults for model config ─────────────────────

test("WS_MODEL default is swe-1-7 (core.mjs module constant)", async () => {
  // Import core.mjs fresh — WS_MODEL is a module-level const derived from env.
  // We can't directly access it, but we can verify the default by checking
  // that the search function signature accepts a model override.
  // This is a structural test: the function must accept model param.
  const src = await import("node:fs").then((fs) => fs.readFileSync(
    new URL("../src/core.mjs", import.meta.url), "utf-8"
  ));
  assert.match(src, /model = null/);
  assert.match(src, /effectiveModel = model \|\| WS_MODEL/);
});

test("server.mjs has WS_FAST_MODEL and WS_DEEP_MODEL with correct defaults", async () => {
  const src = await import("node:fs").then((fs) => fs.readFileSync(
    new URL("../src/server.mjs", import.meta.url), "utf-8"
  ));
  assert.match(src, /WS_FAST_MODEL.*swe-1-7/);
  assert.match(src, /WS_DEEP_MODEL.*glm-5-2-high/);
});

test("server.mjs DEEP_BACKEND gating skips API key check for windsurf", async () => {
  const src = await import("node:fs").then((fs) => fs.readFileSync(
    new URL("../src/server.mjs", import.meta.url), "utf-8"
  ));
  // The gating condition must check DEEP_BACKEND !== "windsurf" before requiring key
  assert.match(src, /DEEP_BACKEND !== "windsurf" && !DEEP_API_KEY/);
});

test("server.mjs deep mode windsurf path passes WS_DEEP_MODEL", async () => {
  const src = await import("node:fs").then((fs) => fs.readFileSync(
    new URL("../src/server.mjs", import.meta.url), "utf-8"
  ));
  // Deep mode windsurf path must pass model: WS_DEEP_MODEL
  assert.match(src, /model: WS_DEEP_MODEL/);
});

test("server.mjs deep mode uses 9 turns and 180s timeout", async () => {
  const src = await import("node:fs").then((fs) => fs.readFileSync(
    new URL("../src/server.mjs", import.meta.url), "utf-8"
  ));
  // Deep mode must use maxTurns: 9 and timeoutMs: 180000
  assert.match(src, /maxTurns: 9,/);
  assert.match(src, /timeoutMs: 180000/);
});

test("server.mjs fast mode windsurf path passes WS_FAST_MODEL", async () => {
  const src = await import("node:fs").then((fs) => fs.readFileSync(
    new URL("../src/server.mjs", import.meta.url), "utf-8"
  ));
  // Fast mode windsurf path must pass model: WS_FAST_MODEL
  assert.match(src, /model: WS_FAST_MODEL/);
});

// ─── core.mjs: checkRateLimit accepts model param ─────────

test("core.mjs checkRateLimit accepts model parameter", async () => {
  const src = await import("node:fs").then((fs) => fs.readFileSync(
    new URL("../src/core.mjs", import.meta.url), "utf-8"
  ));
  // checkRateLimit signature must have model param with WS_MODEL default
  assert.match(src, /checkRateLimit\(apiKey, jwt, model = WS_MODEL\)/);
});

test("core.mjs cache key uses effectiveModel not WS_MODEL", async () => {
  const src = await import("node:fs").then((fs) => fs.readFileSync(
    new URL("../src/core.mjs", import.meta.url), "utf-8"
  ));
  // Cache key must use effectiveModel (per-call), not the module-level WS_MODEL
  assert.match(src, /buildCacheKey\(\{ query, model: effectiveModel/);
});

test("core.mjs _meta includes model field", async () => {
  const src = await import("node:fs").then((fs) => fs.readFileSync(
    new URL("../src/core.mjs", import.meta.url), "utf-8"
  ));
  // Result _meta must include model: effectiveModel
  assert.match(src, /_meta: \{.*model: effectiveModel/);
});

// ─── Escalation helper uses correct model ──────────────────

test("server.mjs escalation windsurf path uses WS_DEEP_MODEL", async () => {
  const src = await import("node:fs").then((fs) => fs.readFileSync(
    new URL("../src/server.mjs", import.meta.url), "utf-8"
  ));
  // The runDeepEscalation helper's windsurf branch must pass model: WS_DEEP_MODEL
  assert.match(src, /runDeepEscalation[\s\S]*?model: WS_DEEP_MODEL/);
});

test("server.mjs deepReady allows windsurf backend without API key", async () => {
  const src = await import("node:fs").then((fs) => fs.readFileSync(
    new URL("../src/server.mjs", import.meta.url), "utf-8"
  ));
  // deepReady = DEEP_BACKEND === "windsurf" || !!(DEEP_API_KEY && DEEP_API_KEY.trim())
  assert.match(src, /deepReady = DEEP_BACKEND === "windsurf" \|\| !!\(DEEP_API_KEY && DEEP_API_KEY\.trim\(\)\)/);
});

// ─── Edge case fixes ───────────────────────────────────────

test("WS_FAST_MODEL trims whitespace and falls back to default if empty", async () => {
  const src = await import("node:fs").then((fs) => fs.readFileSync(
    new URL("../src/server.mjs", import.meta.url), "utf-8"
  ));
  // Must use .trim() and || fallback for whitespace-only protection
  assert.match(src, /WS_FAST_MODEL.*\.trim\(\).*swe-1-7/);
  assert.match(src, /WS_DEEP_MODEL.*\.trim\(\).*glm-5-2-high/);
});

test("DEEP_BACKEND is trimmed and lowercased for case-insensitive matching", async () => {
  const src = await import("node:fs").then((fs) => fs.readFileSync(
    new URL("../src/server.mjs", import.meta.url), "utf-8"
  ));
  assert.match(src, /DEEP_BACKEND.*\.trim\(\)\.toLowerCase\(\)/);
});

test("escalation failures are caught — pre-escalate has try/catch fallback", async () => {
  const src = await import("node:fs").then((fs) => fs.readFileSync(
    new URL("../src/server.mjs", import.meta.url), "utf-8"
  ));
  // Pre-escalate path must have try/catch that falls through on error
  assert.match(src, /if \(auto_escalate && deepReady && escalate\) \{[\s\S]*?try \{[\s\S]*?runDeepEscalation[\s\S]*?\} catch[\s\S]*?fall through/);
});

test("escalation failures are caught — empty-result escalation has try/catch", async () => {
  const src = await import("node:fs").then((fs) => fs.readFileSync(
    new URL("../src/server.mjs", import.meta.url), "utf-8"
  ));
  // Both empty-result escalation paths must have try/catch
  const matches = src.match(/try \{[\s\S]*?runDeepEscalation\(\);[\s\S]*?\} catch/g);
  assert.ok(matches && matches.length >= 2, "expected at least 2 try/catch around runDeepEscalation");
});

test("core.mjs _buildRequest accepts and sends model parameter", async () => {
  const src = await import("node:fs").then((fs) => fs.readFileSync(
    new URL("../src/core.mjs", import.meta.url), "utf-8"
  ));
  // _buildRequest must accept model param and write it to protobuf field 4
  assert.match(src, /_buildRequest\(apiKey, jwt, messages, toolDefs, model/);
  assert.match(src, /if \(model\) req\.writeString\(4, model\)/);
});

test("core.mjs search() passes effectiveModel to _buildRequest", async () => {
  const src = await import("node:fs").then((fs) => fs.readFileSync(
    new URL("../src/core.mjs", import.meta.url), "utf-8"
  ));
  // Both _buildRequest calls in search() must pass effectiveModel
  const matches = src.match(/_buildRequest\(apiKey, jwt, messages, toolDefs, effectiveModel\)/g);
  assert.equal(matches?.length, 2, "both _buildRequest calls must pass effectiveModel");
});

test("core.mjs cache hit preserves model in _meta", async () => {
  const src = await import("node:fs").then((fs) => fs.readFileSync(
    new URL("../src/core.mjs", import.meta.url), "utf-8"
  ));
  // Cache hit must set model: cached._meta?.model || effectiveModel
  assert.match(src, /cache_hit: true, model: cached\._meta\?\.model \|\| effectiveModel/);
});

test("core.mjs baseMeta includes model for error paths", async () => {
  const src = await import("node:fs").then((fs) => fs.readFileSync(
    new URL("../src/core.mjs", import.meta.url), "utf-8"
  ));
  // baseMeta must include model: effectiveModel so error paths have it
  assert.match(src, /baseMeta = \{.*model: effectiveModel/);
});

test("windsurf.mjs model property matches API identifier format", async () => {
  const src = await import("node:fs").then((fs) => fs.readFileSync(
    new URL("../src/backends/windsurf.mjs", import.meta.url), "utf-8"
  ));
  // Class property must use lowercase API identifier, not display name
  assert.match(src, /model = "swe-1-7"/);
  assert.doesNotMatch(src, /model = "SWE-1\.7"/);
});

test("server.mjs header doc WS_DEEP_MODEL default matches actual default", async () => {
  const src = await import("node:fs").then((fs) => fs.readFileSync(
    new URL("../src/server.mjs", import.meta.url), "utf-8"
  ));
  // Doc comment must say glm-5-2-high, not glm-5-2
  assert.match(src, /WS_DEEP_MODEL.*default: glm-5-2-high/);
});
