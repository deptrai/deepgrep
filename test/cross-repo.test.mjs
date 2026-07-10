/**
 * cross-repo.test.mjs — unit tests for Story 6.1 multi-repo search functionality.
 *
 * Coverage:
 *  AC1/AC2 — project_paths param accepted; mergeSettledResults merges across paths
 *  AC3     — max_results_per_path=10 default cap enforced per path (handler side)
 *  AC4     — partial failure tolerance: one bad path warns, others succeed
 *  AC5     — contract.mjs adds meta.project_paths when multi-path (>1 paths)
 *  AC6     — backward compat: project_path singular unchanged; no meta.project_paths
 *  AC7/AC8 — handler-level only (noted as gaps below)
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { mergeSettledResults, _formatResult } from "../src/server.mjs";
import { serializeSearchResult } from "../src/contract.mjs";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Wrap a value as a fulfilled PromiseSettledResult. */
function fulfilled(value) {
  return { status: "fulfilled", value };
}

/** Wrap an error message as a rejected PromiseSettledResult. */
function rejected(reason) {
  return { status: "rejected", reason: new Error(reason) };
}

/**
 * Build a minimal internal search result shape accepted by mergeSettledResults
 * and serializeSearchResult.
 */
function mockResult(filePaths = [], rg_patterns = [], metaOverride = {}) {
  return {
    files: filePaths.map((p) => ({
      path: p,
      full_path: p,
      ranges: [[1, 5]],
      score: null,
      role: null,
    })),
    rg_patterns,
    _meta: {
      backend: "windsurf",
      model: "SWE-1.6",
      treeDepth: 3,
      treeSizeKB: 10,
      fellBack: false,
      cache_hit: false,
      ...metaOverride,
    },
  };
}

// ─── AC1/AC2: mergeSettledResults merges across fulfilled paths ───────────────

test("AC1/AC2: all fulfilled — files and rg_patterns merged from all paths", () => {
  const settled = [
    fulfilled(mockResult(["a/foo.js"], ["authHandler"])),
    fulfilled(mockResult(["b/bar.js"], ["dbConnect"])),
  ];
  const { merged, warnings, hasAny } = mergeSettledResults(settled, ["/repo/a", "/repo/b"]);

  assert.equal(merged.files.length, 2, "should have 2 files total");
  assert.equal(merged.files[0].full_path, "a/foo.js");
  assert.equal(merged.files[1].full_path, "b/bar.js");
  assert.deepEqual(merged.rg_patterns, ["authHandler", "dbConnect"]);
  assert.equal(warnings.length, 0);
  assert.equal(hasAny, true);
});

test("AC1/AC2: three fulfilled paths — all files concatenated in order", () => {
  const settled = [
    fulfilled(mockResult(["a/1.js"])),
    fulfilled(mockResult(["b/2.js"])),
    fulfilled(mockResult(["c/3.js"])),
  ];
  const { merged } = mergeSettledResults(settled, ["/a", "/b", "/c"]);

  assert.equal(merged.files.length, 3);
  assert.equal(merged.files[2].full_path, "c/3.js");
});

test("AC1/AC2: meta taken from first fulfilled result only", () => {
  const settled = [
    fulfilled(mockResult([], [], { backend: "windsurf", model: "SWE-1.6" })),
    fulfilled(mockResult([], [], { backend: "openai", model: "deep-search" })),
  ];
  const { merged } = mergeSettledResults(settled, ["/a", "/b"]);

  assert.equal(merged._meta.backend, "windsurf");
  assert.equal(merged._meta.model, "SWE-1.6");
});

test("AC1/AC2: empty results from all paths — merged is empty but hasAny true", () => {
  const settled = [
    fulfilled(mockResult([], [])),
    fulfilled(mockResult([], [])),
  ];
  const { merged, hasAny } = mergeSettledResults(settled, ["/a", "/b"]);

  assert.equal(merged.files.length, 0);
  assert.equal(merged.rg_patterns.length, 0);
  assert.equal(hasAny, true, "hasAny=true because at least one path fulfilled");
});

// ─── AC3: max_results_per_path default cap ────────────────────────────────────
// The cap (perPathMax = max_results_per_path ?? 10) is applied in the tool handler
// BEFORE calling the search backend, not inside mergeSettledResults.
// We verify mergeSettledResults faithfully merges pre-capped result sets.

test("AC3: mergeSettledResults sums pre-capped results without additional truncation", () => {
  // Simulate each path already capped to 10 results (the handler default)
  const filesA = Array.from({ length: 10 }, (_, i) => `a/file${i}.js`);
  const filesB = Array.from({ length: 10 }, (_, i) => `b/file${i}.js`);
  const settled = [
    fulfilled(mockResult(filesA)),
    fulfilled(mockResult(filesB)),
  ];
  const { merged } = mergeSettledResults(settled, ["/a", "/b"]);

  // Total is 10+10 — merge does not apply a second cap
  assert.equal(merged.files.length, 20, "merge accumulates all per-path results");
});

test("AC3: single path with 10 results passes through untouched", () => {
  const files = Array.from({ length: 10 }, (_, i) => `src/file${i}.js`);
  const { merged } = mergeSettledResults([fulfilled(mockResult(files))], ["/repo"]);

  assert.equal(merged.files.length, 10);
});

// ─── AC4: partial failure tolerance ──────────────────────────────────────────

test("AC4: one path fails — warning emitted, successful path results preserved", () => {
  const settled = [
    rejected("project path does not exist or is not a directory: /bad/path"),
    fulfilled(mockResult(["src/auth.js"], ["authMiddleware"])),
  ];
  const { merged, warnings, hasAny } = mergeSettledResults(settled, ["/bad/path", "/good/repo"]);

  assert.equal(hasAny, true, "hasAny=true when at least one path succeeded");
  assert.equal(merged.files.length, 1);
  assert.equal(merged.files[0].full_path, "src/auth.js");
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /⚠️ Path failed: \/bad\/path/);
  assert.match(warnings[0], /project path does not exist/);
});

test("AC4: first path fails, second succeeds — meta from second fulfilled path", () => {
  const settled = [
    rejected("no such directory"),
    fulfilled(mockResult(["b/main.js"], [], { backend: "windsurf", model: "SWE-1.6" })),
  ];
  const { merged, hasAny } = mergeSettledResults(settled, ["/missing", "/present"]);

  assert.equal(hasAny, true);
  assert.equal(merged._meta.backend, "windsurf");
  assert.equal(merged.files.length, 1);
});

test("AC4: warning message contains path and error reason", () => {
  const settled = [
    rejected("ENOENT: no such file"),
    fulfilled(mockResult(["ok.js"])),
  ];
  const { warnings } = mergeSettledResults(settled, ["/nonexistent", "/ok"]);

  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /\/nonexistent/);
  assert.match(warnings[0], /ENOENT: no such file/);
});

test("AC4: all paths fail — hasAny=false, warnings for each path", () => {
  const settled = [
    rejected("not a directory: /bad1"),
    rejected("not a directory: /bad2"),
  ];
  const { merged, warnings, hasAny } = mergeSettledResults(settled, ["/bad1", "/bad2"]);

  assert.equal(hasAny, false, "hasAny=false when no path succeeded");
  assert.equal(warnings.length, 2, "one warning per failed path");
  assert.equal(merged.files.length, 0);
  assert.deepEqual(merged._meta, {}, "empty meta when all fail");
});

test("AC4: error with no message falls back to 'unknown error'", () => {
  const noMsgRejected = { status: "rejected", reason: {} }; // reason has no .message
  const { warnings } = mergeSettledResults([noMsgRejected], ["/some/path"]);

  assert.match(warnings[0], /unknown error/);
});

// ─── AC5: contract.mjs adds meta.project_paths when multi-path ───────────────

test("AC5: meta.project_paths present in JSON when 2+ paths provided", () => {
  const result = mockResult(["src/foo.js"]);
  const paths = ["/repo/a", "/repo/b"];

  const json = serializeSearchResult(
    result,
    { maxTurns: 3, maxResults: 10, maxCommands: 8, timeoutMs: 30000, excludePaths: [], includeSnippets: false, mode: "quick", projectPaths: paths },
    _formatResult,
    "json"
  );

  const parsed = JSON.parse(json);
  assert.deepEqual(parsed.meta.project_paths, paths);
});

test("AC5: meta.project_paths omitted when projectPaths has exactly 1 entry (condition: length > 1)", () => {
  const result = mockResult(["src/foo.js"]);

  const json = serializeSearchResult(
    result,
    { maxTurns: 3, maxResults: 10, maxCommands: 8, timeoutMs: 30000, excludePaths: [], includeSnippets: false, mode: "quick", projectPaths: ["/only-one"] },
    _formatResult,
    "json"
  );

  const parsed = JSON.parse(json);
  assert.equal("project_paths" in parsed.meta, false, "single path must not add project_paths field");
});

test("AC5: meta.project_paths includes all path strings exactly as provided", () => {
  const paths = ["/workspace/frontend", "/workspace/backend", "/workspace/shared"];
  const result = mockResult(["shared/utils.js"]);

  const json = serializeSearchResult(
    result,
    { maxTurns: 3, maxResults: 10, maxCommands: 8, timeoutMs: 30000, excludePaths: [], includeSnippets: false, mode: "quick", projectPaths: paths },
    _formatResult,
    "json"
  );

  const { meta } = JSON.parse(json);
  assert.equal(meta.project_paths.length, 3);
  assert.equal(meta.project_paths[0], "/workspace/frontend");
  assert.equal(meta.project_paths[2], "/workspace/shared");
});

// ─── AC6: backward compat — project_path (singular) unchanged ────────────────

test("AC6: serializeSearchResult without projectPaths does not add meta.project_paths", () => {
  const result = mockResult(["src/bar.js"]);

  const json = serializeSearchResult(
    result,
    { maxTurns: 3, maxResults: 10, maxCommands: 8, timeoutMs: 30000, excludePaths: [], includeSnippets: false, mode: "quick" },
    _formatResult,
    "json"
  );

  const parsed = JSON.parse(json);
  assert.equal("project_paths" in parsed.meta, false);
  assert.equal(parsed.schema_version, "1.0");
  assert.ok(Array.isArray(parsed.files), "files array still present");
});

test("AC6: _formatResult still produces correct text output for single-path result", () => {
  const result = mockResult(["src/utils.js"]);
  const text = _formatResult(result, 3, 10, 8, 30000, [], false);

  assert.match(text, /Found 1 relevant files/);
  assert.match(text, /src\/utils\.js/);
  assert.match(text, /\[config\] backend=windsurf/);
});

test("AC6: JSON contract schema_version and core fields unaffected by cross-repo params", () => {
  const result = mockResult(["lib/db.js"], ["queryBuilder"]);

  const json = serializeSearchResult(
    result,
    { maxTurns: 3, maxResults: 10, maxCommands: 8, timeoutMs: 30000, excludePaths: [], includeSnippets: false, mode: "quick" },
    _formatResult,
    "json"
  );

  const parsed = JSON.parse(json);
  assert.equal(parsed.schema_version, "1.0");
  assert.equal(parsed.files[0].full_path, "lib/db.js");
  assert.ok(parsed.grep_keywords.includes("queryBuilder"));
  assert.equal(parsed.meta.backend, "windsurf");
});

// ─── AC7/AC8: handler-level — noted as coverage gaps ─────────────────────────
//
// AC7 (project_paths wins over project_path when both provided):
//   Lives in the tool handler's branch guard: `if (Array.isArray(project_paths)) { ... }`
//   The single-path fallback only runs when project_paths is absent/undefined.
//   Not reachable without calling the registered MCP tool handler or a live server.
//   Confirmed correct by reading server.mjs lines 324-374 (deepgrep_search) and
//   lines 573-612 (deepgrep_deep): multi-path branch entered before project_path is read.
//
// AC8 (project_paths=[] returns error message):
//   Handler returns immediately: "Error: project_paths must not be empty"
//   Not reachable without the handler. Confirmed correct by reading server.mjs
//   lines 325-327 and 574-576.
//
// Both ACs require handler-level integration tests (MCP transport or exported handler).
// Gap documented here; no test stubs that would pass vacuously.
