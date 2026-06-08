# deepgrep v1.1 — Roadmap

v1.1 goal: amplify core value (deep multi-hop reasoning), reduce day-to-day friction, increase reliability. Ordered by execution priority.

---

## P0 — Core value & reliability (do first)

### F1. Auto-escalation: quick → deep automatically
**Problem:** Users have to manually choose `deepgrep_search` vs `deepgrep_deep`. Benchmarks show that for queries with ≥3 clauses, quick mode loses badly.

**Solution:**
- `deepgrep_search` auto-detects complex queries → suggests or auto-upgrades to deep
- Multi-hop detection heuristic: count clauses (and/+/,/then), length, keywords ("trace", "flow", "across", "from...to")
- When quick returns 0 results → auto-retry with deep (once)
- Add param `auto_escalate: true` (default true) so it can be disabled

**Acceptance:**
- Single-clause query → runs quick, no escalation
- Query with ≥3 clauses or quick returns 0 → auto-uses deep, logs "[escalated to deep mode]" clearly
- Output records the mode actually used

**Files:** `src/server.mjs` (tool handler), add `src/escalate.mjs` (heuristic)

---

### F2. Verify + finalize cache
**Problem:** `cache.mjs` has scaffolding but isn't verified end-to-end. Cache directly reduces token cost.

**Solution:**
- Test cache hit/miss with repeated queries on an unchanged codebase
- Ensure correct invalidation when files change (mtime hash)
- Add `cache_hit: true/false` to output metadata
- Env `DEEPGREP_CACHE_DISABLED`, `DEEPGREP_CACHE_TTL_MS`

**Acceptance:**
- Identical repeated query → cache hit, 0 API calls, <100ms
- File changed → cache miss → API called again
- `[config] cache_hit=true` shows in output

**Files:** `src/cache.mjs`, `src/openai-backend.mjs`, `src/core.mjs`

---

### F3. Better error UX
**Problem:** Errors like 429/403 (e.g. Haiku) return technical messages that are hard to understand.

**Solution:**
- Map errors → actionable messages:
  - 429 → "Model {X} rate limited, retrying... or change DEEPGREP_MODEL"
  - 403 → "Model {X} not accessible with this key. Try deep-search combo or another model"
  - No key → signup URL (already exists)
- When a deep mode model fails → auto-suggest a fallback model

**Files:** `src/openai-backend.mjs`, `src/server.mjs`

---

## P1 — Friction reduction (after P0)

### F4. Health-check tool: `deepgrep_status`
**Solution:** New tool that returns:
- Whether the key is valid (test ping)
- Which models are available (list from /models, test 1-2 of them)
- Whether Devin Desktop is installed (for fast mode auto)
- Current config (URL, model, fast backend)

**Benefit:** New users run one command to confirm correct setup. Less debugging.

**Files:** `src/server.mjs` (new tool), `src/health.mjs`

---

### F5. Query refinement for quick mode
**Problem:** Quick mode is sensitive to query quality (benchmark: vague/non-English queries → wrong direction).

**Solution:**
- Pre-process query: detect non-English → suggest/auto-translate to code terms
- Or when results are weak → return suggestion: "Try rephrasing with specific code terms (e.g. checkCredits, saveUsage)"

**Files:** `src/server.mjs`, may reuse escalate logic

---

### F6. Single binary build (bun compile)
**Solution:**
- `bun build src/server.mjs --compile --outfile deepgrep`
- Users don't need Node — download binary and run directly
- Add to CI release (build for macOS/Linux/Windows)

**Benefit:** Better DX, easier to distribute. Low effort.

**Files:** `package.json` scripts, `.github/workflows/`

---

## P2 — Nice to have (wait for real signal)

### F7. Test suite
- node:test for `protobuf.mjs` (round-trip), `_parseAnswer` (+ path guard), cache logic, escalation heuristic
- `npm test` green
- Guard for future refactors

### F8. Streaming progress
- Currently users wait 20-40s in deep mode with no feedback
- Stream progress over MCP (turn 1/3, executing N commands...) if the client supports it

### F9. Result ranking/dedup improvements
- When deep returns many files, rank by relevance score
- Dedup duplicate files across turns

---

## NOT doing in v1.1 (avoid scope creep)

- ❌ Rust port (bottleneck is network)
- ❌ Embedding index / Context Engine
- ❌ Multi-repo / GitHub integration
- ❌ New model providers

---

## Suggested execution order

```
Sprint 1 (core): F2 (cache verify) → F1 (auto-escalate) → F3 (error UX)
Sprint 2 (friction): F4 (status tool) → F6 (binary) → F5 (query refine)
Sprint 3 (polish): F7 (tests) → F8 (streaming) → F9 (ranking)
```

F1 + F2 are the two highest-impact items for your own daily experience:
- F1: no need to think about which tool to pick
- F2: repeated queries cost no tokens + are instant

---

## Version bump

v1.0.0 → **v1.1.0** after P0 (F1-F3) is done.
P1/P2 may be v1.2.
