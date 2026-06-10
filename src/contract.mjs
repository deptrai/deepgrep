/**
 * contract.mjs — single serialization seam for all deepgrep tool output.
 *
 * ADR-8: ALL JSON formatting lives here. Tool handlers call serializeSearchResult()
 * or serializeSnippetResult() — never JSON.stringify inline.
 *
 * Text path delegates to _formatResult (imported from server.mjs) unchanged.
 * JSON path builds the v1.0 schema with forward-looking retrieval/index_used fields.
 */

import { rankResults } from "./rank.mjs";

// ─── JSON contract helpers ─────────────────────────────────

/**
 * Build ADR-8 JSON contract from internal search result shape.
 *
 * Internal shape: { files, rg_patterns, _meta, error? }
 * @param {Object} result
 * @param {Object} opts  — { maxTurns, maxResults, excludePaths, mode }
 * @returns {string}  JSON string
 */
function toJsonContract(result, opts = {}) {
  const meta = result._meta || {};
  const mode = opts.mode || (meta.backend === "openai" ? "deep" : "quick");

  const files = (result.files || []).map((f) => ({
    path: f.path,
    full_path: f.full_path,
    ranges: f.ranges ?? [],
    role: f.role ?? null,
    score: f.score ?? null,
  }));

  const rawPatterns = result.rg_patterns || [];
  const grep_keywords = [...new Set(rawPatterns)].filter((p) => p.length >= 3);

  const contract = {
    schema_version: "1.0",
    files,
    grep_keywords,
    meta: {
      backend: meta.backend || "windsurf",
      mode,
      cache_hit: meta.cache_hit ?? false,
      retrieval: "lexical",
      index_used: false,
      tree_depth: meta.treeDepth ?? null,
      tree_size_kb: meta.treeSizeKB ?? null,
      fell_back: meta.fellBack ?? false,
    },
  };

  if (result.error) {
    contract.error = typeof result.error === "string" ? result.error : String(result.error);
  }

  return JSON.stringify(contract, null, 2);
}

/**
 * Build ADR-8 JSON contract for deepgrep_get snippet result.
 *
 * @param {Map|string} snippetResult  — Map<full_path, snippet_text> OR text string
 * @param {Array} files  — original files param from tool call (for metadata)
 * @returns {string}  JSON string
 */
function toSnippetJsonContract(snippetResult, files = []) {
  if (typeof snippetResult === "string") {
    return JSON.stringify({
      schema_version: "1.0",
      files: [],
      content: snippetResult,
      meta: { retrieval: "lexical", index_used: false },
    }, null, 2);
  }

  const fileResults = files.map((f) => {
    const content = snippetResult instanceof Map
      ? (snippetResult.get(f.file) ?? null)
      : null;
    // path: last component(s) to match search output convention (short path)
    // full_path: the absolute path as supplied
    const segments = f.file.replace(/\\/g, "/").split("/");
    const path = segments.length >= 2 ? segments.slice(-2).join("/") : f.file;
    return {
      path,
      full_path: f.file,
      ranges: f.ranges ?? [],
      content,
    };
  }).filter((f) => f.content !== null);

  return JSON.stringify({
    schema_version: "1.0",
    files: fileResults,
    meta: { retrieval: "lexical", index_used: false },
  }, null, 2);
}

// ─── Public API ────────────────────────────────────────────

/**
 * Serialize a search result to text or JSON.
 *
 * @param {Object}   result     — internal shape {files, rg_patterns, _meta, error?}
 * @param {Object}   opts       — {maxTurns, maxResults, maxCommands, timeoutMs, excludePaths, includeSnippets, mode}
 * @param {Function} formatText — _formatResult function from server.mjs (injected to avoid circular dep)
 * @param {string}   format     — "text" | "json"
 * @returns {string}
 */
export function serializeSearchResult(result, opts, formatText, format = "text") {
  const ranked = { ...result, files: rankResults(result.files || [], opts) };
  if (format === "json") return toJsonContract(ranked, opts);
  return formatText(
    ranked,
    opts.maxTurns ?? 3,
    opts.maxResults ?? 10,
    opts.maxCommands ?? 8,
    opts.timeoutMs ?? 30000,
    opts.excludePaths ?? [],
    opts.includeSnippets ?? false,
  );
}

/**
 * Serialize deepgrep_get snippet output to text or JSON.
 *
 * @param {string}  textOutput    — existing formatted text output
 * @param {Map}     snippetMap    — Map<full_path, snippet_text> from readSnippets
 * @param {Array}   files         — original files param [{file, ranges}]
 * @param {string}  format        — "text" | "json"
 * @returns {string}
 */
export function serializeSnippetResult(textOutput, snippetMap, files, format = "text") {
  if (format === "json") {
    // When snippetMap is absent or empty (e.g. "No files/ranges provided"), encode textOutput as content
    const payload = (snippetMap instanceof Map && snippetMap.size > 0) ? snippetMap : textOutput;
    return toSnippetJsonContract(payload, files);
  }
  return textOutput;
}
