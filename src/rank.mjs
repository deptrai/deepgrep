/**
 * rank.mjs — pure functions for result ranking and deduplication.
 *
 * All functions are pure: no I/O, no side effects, input arrays never mutated.
 * Call via contract.mjs#serializeSearchResult (opts.rerank).
 */

const TEST_PATTERNS = ["/test/", ".test.", "__tests__/", "/spec/", ".spec."];

function isTestFile(path) {
  if (!path) return false;
  return TEST_PATTERNS.some((p) => path.includes(p));
}

/**
 * Merge overlapping or adjacent ranges (1-indexed inclusive).
 * [[1,10],[5,15]] → [[1,15]]   (overlapping)
 * [[1,5],[6,10]]  → [[1,10]]   (adjacent)
 * [[1,3],[5,7]]   → [[1,3],[5,7]]  (non-overlapping)
 */
function mergeRanges(ranges) {
  if (!ranges || ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const merged = [[sorted[0][0], sorted[0][1]]];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const curr = sorted[i];
    if (curr[0] <= last[1] + 1) {
      last[1] = Math.max(last[1], curr[1]);
    } else {
      merged.push([curr[0], curr[1]]);
    }
  }
  return merged;
}

/**
 * Deduplicate files by full_path. Duplicate full_paths have their ranges
 * concatenated; metadata from the first occurrence is preserved.
 * Insertion order preserved (first-occurrence wins).
 */
function deduplicateFiles(files) {
  const seen = new Map();
  for (const f of files) {
    const key = f.full_path;
    if (seen.has(key)) {
      const existing = seen.get(key);
      existing.ranges = [...(existing.ranges || []), ...(f.ranges || [])];
    } else {
      seen.set(key, { ...f, ranges: [...(f.ranges || [])] });
    }
  }
  return [...seen.values()];
}

/**
 * Sort source files before test/spec files. Relative order within each
 * group is preserved (stable).
 */
function sortByRelevance(files) {
  const source = files.filter((f) => !isTestFile(f.full_path || f.path || ""));
  const tests  = files.filter((f) =>  isTestFile(f.full_path || f.path || ""));
  return [...source, ...tests];
}

/**
 * Rank and deduplicate a files array.
 *
 * Always applied:
 *   1. Deduplicate by full_path (concat ranges of duplicates)
 *   2. Merge overlapping/adjacent ranges within each file
 *
 * Only when opts.rerank === true:
 *   3. Sort source files before test/spec files
 *
 * Input is NOT mutated.
 *
 * @param {Array}  files  — Array<{ path, full_path, ranges, ... }>
 * @param {Object} opts   — { rerank?: boolean }
 * @returns {Array}
 */
export function rankResults(files, opts = {}) {
  if (!files || files.length === 0) return [];
  let result = deduplicateFiles(files);
  result = result.map((f) => ({ ...f, ranges: mergeRanges(f.ranges) }));
  if (opts.rerank === true) result = sortByRelevance(result);
  return result;
}
