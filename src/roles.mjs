/**
 * roles.mjs — pure role labeling heuristics for deepgrep_pack.
 *
 * ADR-9: heuristic-bounded ONLY — path patterns, filename, match density.
 * FORBIDDEN: AST, tree-sitter, import graph, symbol resolution.
 * Every heuristic case has a corresponding test fixture in test/roles.test.mjs.
 */

const TEST_PATTERNS    = ["/test/", ".test.", "__tests__/", "/spec/", ".spec."];
const CONFIG_PATTERNS  = ["/config/", ".config.", "package.json", "tsconfig.json", ".env"];
const DOCS_PATTERNS    = ["/docs/", "README", ".md"];
const TYPE_PATTERNS    = [".d.ts", "/types/", "/interfaces/"];

/**
 * Label the role of a file based on path heuristics and optional match density.
 *
 * @param {Object} opts
 * @param {string} [opts.path]          - file path (relative or absolute)
 * @param {string} [opts.full_path]     - absolute path (fallback when path absent)
 * @param {string} [opts.query]         - original search query (reserved, unused)
 * @param {number} [opts.matchDensity]  - matches-per-line ratio
 * @returns {"implementation"|"caller"|"config"|"test"|"docs"|"type"}
 */
export function labelRole({ path, full_path, query, matchDensity } = {}) {
  const p = path || full_path || "";

  if (TEST_PATTERNS.some((pat)   => p.includes(pat))) return "test";
  if (CONFIG_PATTERNS.some((pat) => p.includes(pat))) return "config";
  if (DOCS_PATTERNS.some((pat)   => p.includes(pat))) return "docs";
  if (TYPE_PATTERNS.some((pat)   => p.includes(pat))) return "type";

  if (typeof matchDensity === "number") {
    if (matchDensity >= 0.3) return "implementation";
    if (matchDensity < 0.1)  return "caller";
  }

  return "implementation";
}

/**
 * Calculate match density (matches per line) for role detection.
 *
 * @param {string} content
 * @param {string} [query]
 * @returns {number}
 */
export function calculateMatchDensity(content, query) {
  if (!query || !content) return 0;
  const lines = content.split("\n");
  if (lines.length === 0) return 0;
  const matches = content.toLowerCase().split(query.toLowerCase()).length - 1;
  return matches / lines.length;
}
