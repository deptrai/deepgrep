# deepgrep v1.1 — Roadmap

Mục tiêu v1.1: khuếch đại core value (deep multi-hop reasoning), giảm friction khi dùng hằng ngày, tăng độ tin cậy. Sắp theo thứ tự ưu tiên thực thi.

---

## P0 — Core value & reliability (làm trước)

### F1. Auto-escalation: quick → deep tự động
**Vấn đề:** User phải tự chọn `deepgrep_search` vs `deepgrep_deep`. Benchmark cho thấy query ≥3 vế thì quick thua hẳn.

**Giải pháp:**
- `deepgrep_search` tự phát hiện query phức tạp → đề xuất hoặc tự nâng lên deep
- Heuristic phát hiện multi-hop: đếm số mệnh đề (and/+/,/then), độ dài, keywords ("trace", "flow", "across", "from...to")
- Khi quick trả 0 results → tự retry bằng deep (1 lần)
- Thêm param `auto_escalate: true` (default true) để tắt được

**Acceptance:**
- Query 1 vế → chạy quick, không escalate
- Query ≥3 vế hoặc quick trả 0 → tự dùng deep, log rõ "[escalated to deep mode]"
- Output ghi mode thực tế đã dùng

**Files:** `src/server.mjs` (tool handler), thêm `src/escalate.mjs` (heuristic)

---

### F2. Verify + hoàn thiện cache
**Vấn đề:** `cache.mjs` đã có scaffold nhưng chưa verify hoạt động end-to-end. Cache giảm token cost trực tiếp.

**Giải pháp:**
- Test cache hit/miss với query lặp trên codebase chưa đổi
- Đảm bảo invalidation đúng khi file thay đổi (mtime hash)
- Thêm `cache_hit: true/false` vào output metadata
- Env `DEEPGREP_CACHE_DISABLED`, `DEEPGREP_CACHE_TTL_MS`

**Acceptance:**
- Query lặp y hệt → cache hit, 0 API call, <100ms
- File đổi → cache miss → gọi lại API
- `[config] cache_hit=true` hiện trong output

**Files:** `src/cache.mjs`, `src/openai-backend.mjs`, `src/core.mjs`

---

### F3. Better error UX
**Vấn đề:** Lỗi 429/403 (như Haiku) trả message kỹ thuật khó hiểu.

**Giải pháp:**
- Map lỗi → message actionable:
  - 429 → "Model {X} rate limited, retrying... hoặc đổi DEEPGREP_MODEL"
  - 403 → "Model {X} not accessible with this key. Try deep-search combo or another model"
  - No key → signup URL (đã có)
- Khi deep mode model fail → tự suggest fallback model

**Files:** `src/openai-backend.mjs`, `src/server.mjs`

---

## P1 — Friction reduction (làm sau P0)

### F4. Health-check tool: `deepgrep_status`
**Giải pháp:** Tool mới trả về:
- Key có hợp lệ không (test ping)
- Models nào available (list từ /models, test 1-2 cái)
- Devin Desktop có cài không (cho fast mode auto)
- Config hiện tại (URL, model, fast backend)

**Lợi ích:** User mới chạy 1 lệnh biết setup đúng chưa. Giảm debug.

**Files:** `src/server.mjs` (tool mới), `src/health.mjs`

---

### F5. Query refinement cho quick mode
**Vấn đề:** Quick mode nhạy với chất lượng query (benchmark: query mơ hồ/tiếng Việt → sai hướng).

**Giải pháp:**
- Pre-process query: detect non-English → gợi ý/tự dịch sang code terms
- Hoặc khi kết quả yếu → trả suggestion: "Try rephrasing with specific code terms (e.g. checkCredits, saveUsage)"

**Files:** `src/server.mjs`, có thể tái dùng escalate logic

---

### F6. Single binary build (bun compile)
**Giải pháp:**
- `bun build src/server.mjs --compile --outfile deepgrep`
- User không cần Node — download binary chạy luôn
- Thêm vào CI release (build cho macOS/Linux/Windows)

**Lợi ích:** DX tốt hơn, distribute dễ. Effort thấp.

**Files:** `package.json` scripts, `.github/workflows/`

---

## P2 — Nice to have (chờ tín hiệu thực tế)

### F7. Test suite
- node:test cho `protobuf.mjs` (round-trip), `_parseAnswer` (+ path guard), cache logic, escalation heuristic
- `npm test` xanh
- Guard cho refactor sau này

### F8. Streaming progress
- Hiện user đợi 20-40s deep mode không biết gì
- Stream progress qua MCP (turn 1/3, executing N commands...) nếu client support

### F9. Result ranking/dedup cải tiến
- Khi deep trả nhiều file, rank theo relevance score
- Dedup file trùng giữa các turn

---

## KHÔNG làm trong v1.1 (tránh scope creep)

- ❌ Port Rust (bottleneck là network)
- ❌ Embedding index / Context Engine
- ❌ Multi-repo / GitHub integration
- ❌ Thêm model providers mới

---

## Thứ tự thực thi đề xuất

```
Sprint 1 (core): F2 (cache verify) → F1 (auto-escalate) → F3 (error UX)
Sprint 2 (friction): F4 (status tool) → F6 (binary) → F5 (query refine)
Sprint 3 (polish): F7 (tests) → F8 (streaming) → F9 (ranking)
```

F1 + F2 là 2 thứ tác động lớn nhất tới trải nghiệm hằng ngày của chính bạn:
- F1: không phải nghĩ chọn tool nào
- F2: query lặp không tốn token + nhanh tức thì

---

## Version bump

v1.0.0 → **v1.1.0** sau khi xong P0 (F1-F3).
P1/P2 có thể là v1.2.
