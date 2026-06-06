# deepgrep

**AI code search that thinks — not just matches.**

Ask your codebase questions in natural language. Get precise file paths + line ranges in seconds.
Zero index. Zero setup. Zero daemon. Works with any MCP client.

```
You: "trace the authentication flow from API route to database"

deepgrep:
  [1/4] src/middleware/auth.ts (L1-85)
  [2/4] src/services/jwt-verify.ts (L10-60)
  [3/4] src/repositories/users.ts (L30-90)
  [4/4] src/db/schema.ts (L120-180)

  grep keywords: authenticate, jwt.*verify, session.*token
```

## Why deepgrep?

AI agents (Claude Code, Kiro, Codex, Cursor) waste tokens grepping blindly:

```
grep "auth" → 200 matches → read 10 files → still lost
22 tool calls. $0.56 in tokens. 58 seconds.
```

**deepgrep thinks like a developer** — it reads your project structure, greps strategically, traces logic across files, and returns precise answers.

```
deepgrep "trace the auth flow" → 4 files, done.
1 tool call. 3 seconds.
```

## How It Compares

| | grep/ripgrep | Embedding search (ai-grep) | **deepgrep** |
|---|---|---|---|
| Setup | None | Rust + 800MB models + daemon + index | **`npx deepgrep`** |
| Understands meaning | ❌ | ✅ (keyword similarity) | ✅ (**AI reasoning**) |
| Multi-hop tracing | ❌ | ❌ | ✅ |
| Needs index | No | Yes (per project) | **No** |
| Complex queries | ❌ | Medium | **High** |
| MCP support | ❌ | ✅ | ✅ |

## Quick Start

### 1. Get a free API key

→ [deepgrep.chainlens.net](https://deepgrep.chainlens.net)

### 2. Add to your MCP client

#### Kiro

Add to `~/.kiro/settings/mcp.json`:

```json
{
  "mcpServers": {
    "deepgrep": {
      "command": "npx",
      "args": ["-y", "deepgrep"],
      "env": {
        "DEEPGREP_API_KEY": "your-key",
        "DEEPGREP_FAST_BACKEND": "openai",
        "DEEPGREP_FAST_MODEL": "kr/claude-haiku-4.5"
      }
    }
  }
}
```

#### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "deepgrep": {
      "command": "npx",
      "args": ["-y", "deepgrep"],
      "env": {
        "DEEPGREP_API_KEY": "your-key",
        "DEEPGREP_FAST_BACKEND": "openai",
        "DEEPGREP_FAST_MODEL": "kr/claude-haiku-4.5"
      }
    }
  }
}
```

#### Claude Code

```bash
claude mcp add deepgrep -- npx -y deepgrep
# Then set env: DEEPGREP_API_KEY=your-key DEEPGREP_FAST_BACKEND=openai DEEPGREP_FAST_MODEL=kr/claude-haiku-4.5
```

#### Cursor

Settings → MCP → Add server → command: `npx -y deepgrep`, env: `DEEPGREP_API_KEY=your-key`

### 3. Done! Ask your code anything.

## Two Search Modes

| Mode | Tool | Speed | Best for |
|------|------|-------|----------|
| **Fast** | `deepgrep_search` | ~3-5s | Quick lookups, simple queries |
| **Deep** | `deepgrep_deep` | ~20-30s | Complex tracing, architecture, multi-hop |

Both use your `DEEPGREP_API_KEY`. One key, both modes.

### Fast mode examples

```
"where is the database connection configured?"
"find the error handling middleware"
"Supabase client initialization"
```

### Deep mode examples

```
"trace the full data flow from API request through service layer to database write"
"how does the job queue retry failed tasks and what happens to the dead letter queue"
"find all places where user permissions are checked and explain the authorization model"
```

## Configuration

### Recommended (Chainlens key — one key, all features)

```json
"env": {
  "DEEPGREP_API_KEY": "your-chainlens-key",
  "DEEPGREP_FAST_BACKEND": "openai",
  "DEEPGREP_FAST_MODEL": "kr/claude-haiku-4.5"
}
```

→ [Get free key](https://deepgrep.chainlens.net) — includes free tier with frontier models.

### Alternative: Bring your own model

deepgrep works with **any OpenAI-compatible API**:

**OpenAI / Anthropic / etc:**
```json
"env": {
  "DEEPGREP_API_URL": "https://api.openai.com/v1",
  "DEEPGREP_API_KEY": "sk-your-key",
  "DEEPGREP_MODEL": "gpt-4o",
  "DEEPGREP_FAST_BACKEND": "openai",
  "DEEPGREP_FAST_MODEL": "gpt-4o-mini"
}
```

**Local model (Ollama, LM Studio):**
```json
"env": {
  "DEEPGREP_API_URL": "http://localhost:11434/v1",
  "DEEPGREP_API_KEY": "not-needed",
  "DEEPGREP_MODEL": "qwen2.5-coder:32b",
  "DEEPGREP_FAST_BACKEND": "openai",
  "DEEPGREP_FAST_MODEL": "qwen2.5-coder:7b"
}
```

**Devin Desktop users:** If you have Devin Desktop installed, fast mode auto-detects your local credentials (free SWE-1.6). No config needed — just omit `DEEPGREP_FAST_BACKEND`.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DEEPGREP_API_KEY` | — | API key ([get yours](https://deepgrep.chainlens.net)) |
| `DEEPGREP_API_URL` | `https://router.chainlens.net/v1` | API endpoint for deep mode |
| `DEEPGREP_MODEL` | `deep-search` | Model for deep search |
| `DEEPGREP_FAST_BACKEND` | `windsurf` | Fast mode backend: `openai` or `windsurf` |
| `DEEPGREP_FAST_MODEL` | — | Model for fast mode (when `FAST_BACKEND=openai`) |
| `DEEPGREP_NO_TELEMETRY` | — | Set `1` to disable anonymous stats |

## Parameters

Both tools accept:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `query` | *(required)* | Natural language search query |
| `project_path` | cwd | Absolute path to project root |
| `tree_depth` | 3 | Directory tree depth (1-6). Lower for huge repos. |
| `max_results` | 10 | Max files to return (1-30) |
| `exclude_paths` | [] | Patterns to exclude (e.g. `["node_modules", "dist"]`) |
| `include_snippets` | false | Include actual code content in results |

`deepgrep_search` also accepts `max_turns` (1-5, default 3).

## How It Works

```
┌─────────────────┐         ┌──────────────────────┐
│  Your IDE/Agent  │  MCP   │  deepgrep (local)     │
│  (Kiro, Claude)  │◄──────►│                        │
└─────────────────┘         │  1. Read project tree  │
                            │  2. Send query to AI   │
                            │  3. AI reasons + greps │
                            │  4. Execute rg locally │
                            │  5. Repeat 2-3 rounds  │
                            │  6. Return files+lines │
                            └──────────┬─────────────┘
                                       │
                      Only query text ──┼──► AI API
                      (your code stays local)
```

**Privacy:** Your source code never leaves your machine. Only the search query and directory tree structure are sent to the AI model.

## Chainlens Router — Multi-model Combo

When using a Chainlens key, deep mode uses **combo routing** — automatic fallback between models:

```
Request → "deep-search" combo
           ├─ Try: Sonnet 4.6 (fast, ~5s)
           │   └─ If error/timeout → fallback ↓
           └─ Try: GPT-5.5 (reliable, ~20s)
               └─ Response returned
```

### Available models

| Model | ID | Notes |
|-------|-----|-------|
| **Combo (default)** | `deep-search` | Sonnet 4.6 → GPT-5.5 fallback |
| Claude Sonnet 4.6 | `kr/claude-sonnet-4.6` | Fast, good accuracy |
| Claude Haiku 4.5 | `kr/claude-haiku-4.5` | Cheapest, good for fast mode |
| GPT-5.5 | `cx/gpt-5.5` | Most reliable |
| Claude Opus 4.8 | `kr/claude-opus-4.8` | Most powerful |

Override: `DEEPGREP_MODEL=kr/claude-sonnet-4.6`

### Custom combos

Create your own priority chains on [Chainlens Dashboard](https://router.chainlens.net/dashboard) → Combos → Create.

List all models: `curl -H "Authorization: Bearer KEY" https://router.chainlens.net/v1/models`

## Requirements

- Node.js >= 18
- No other dependencies needed (ripgrep bundled via npm)

## License

MIT
