/**
 * pack.mjs — orchestrator for deepgrep_pack context assembly.
 *
 * ADR-9 binding constraints:
 *   1. Reuse readSnippets + formatSnippetToolOutput — no snippet I/O duplication.
 *   2. max_chars = hard budget limit; max_lines = advisory hint only.
 *   3. Role labeling via roles.mjs pure function — no AST/LSP.
 *   4. Stateless: no session linkage; files/ranges direct = pure local.
 */

import { rankResults } from "./rank.mjs";
import { readSnippets } from "./snippets.mjs";
import { labelRole } from "./roles.mjs";

// Budget allocation priority (highest → lowest importance for agents)
const ROLE_PRIORITY = ["implementation", "caller", "config", "type", "docs", "test"];

/**
 * Assemble a context pack from files/ranges with role labeling and budget enforcement.
 *
 * @param {Object}  opts
 * @param {string}  [opts.query]      - original search query (improves role detection)
 * @param {Array}   [opts.files]      - [{file: string, ranges: [number,number][]}]
 * @param {number}   opts.max_chars   - hard character budget (required)
 * @param {number}  [opts.max_lines]  - advisory line hint (not enforced)
 * @param {boolean} [opts.rerank]     - apply source-before-test sort via rankResults
 * @returns {{ snippets: Array, dropped: Array, meta: Object }}
 */
export function packContext({ query, files, max_chars, max_lines, rerank = false } = {}) {
  if (!files || files.length === 0) {
    return {
      snippets: [],
      dropped: [],
      meta: { total_chars: 0, budget_chars: max_chars, used_pct: 0 },
    };
  }

  // Normalize to internal format expected by rankResults + readSnippets
  const normalized = files.map((f) => {
    const segments = String(f.file).replace(/\\/g, "/").split("/");
    const shortPath = segments.length >= 2 ? segments.slice(-2).join("/") : f.file;
    return { path: shortPath, full_path: f.file, ranges: f.ranges ?? [] };
  });

  // Step 1: dedup + merge ranges (always); optional rerank
  const ranked = rankResults(normalized, { rerank });

  // Step 2: attach role labels
  const labeled = ranked.map((f) => ({
    ...f,
    role: labelRole({ path: f.full_path, query }),
  }));

  // Step 3: read all snippets in ONE call (ADR-9 constraint — no I/O duplication)
  const snippetMap = readSnippets(labeled);

  // Step 4: bucket by role
  const groups = Object.fromEntries(ROLE_PRIORITY.map((r) => [r, []]));
  for (const f of labeled) {
    const bucket = f.role in groups ? f.role : "implementation";
    groups[bucket].push(f);
  }

  // Step 5: fill budget in priority order
  const snippets = [];
  const dropped  = [];
  let totalChars = 0;

  for (const role of ROLE_PRIORITY) {
    const bucket = groups[role];
    if (!bucket.length) continue;
    let droppedCount = 0;
    for (const f of bucket) {
      const content = snippetMap.get(f.full_path);
      if (!content) continue;
      if (totalChars + content.length > max_chars) {
        droppedCount++;
        continue;
      }
      snippets.push({ role, path: f.path, full_path: f.full_path, ranges: f.ranges, content });
      totalChars += content.length;
    }
    if (droppedCount > 0) {
      dropped.push({ role, count: droppedCount, reason: "budget" });
    }
  }

  return {
    snippets,
    dropped,
    meta: {
      total_chars: totalChars,
      budget_chars: max_chars,
      used_pct: max_chars > 0 ? Math.round((totalChars / max_chars) * 100) : 0,
    },
  };
}
