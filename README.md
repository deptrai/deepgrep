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

### Option A: npx (recommended)

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

### Option B: Standalone binary (experimental — targeted for v1.2)

> ⚠️ **Experimental — not yet supported.** The `bun --compile` binary does not
> currently embed the native `rg` (ripgrep) binary or the `sql.js` WASM, so a
> downloaded binary fails to run searches on machines without the build-time
> `node_modules`. Use **Option A (npx)** for now — the binary is tracked for v1.2.

```bash
# (v1.2) Download binary (macOS example):
curl -L https://github.com/deptrai/deepgrep/releases/latest/download/deepgrep-macos -o deepgrep
chmod +x deepgrep
```

Or build from source (requires [Bun](https://bun.sh)):
```bash
git clone https://github.com/deptrai/deepgrep
cd deepgrep && npm install
npm run build:binary   # outputs dist/deepgrep
```

Then configure your MCP client with:
```json
"command": "/path/to/deepgrep"
```

## MCP Tools

deepgrep exposes three tools, all using your `DEEPGREP_API_KEY` — one key, all modes.

| Tool | Speed | Best for |
|------|-------|----------|
| `deepgrep_search` | ~3-5s | Quick lookups, simple queries |
| `deepgrep_deep` | ~20-40s | Complex tracing, architecture, multi-hop |
| `deepgrep_status` | instant | Health check, config verification |

### `deepgrep_search` — Fast mode

Quick semantic search for everyday lookups. Supports `auto_escalate=true` (default): automatically switches to deep mode for complex queries or empty results.

### `deepgrep_deep` — Deep mode

Slower, multi-hop reasoning for complex tracing, architecture, and cross-file questions. Requires `DEEPGREP_API_KEY`.

### `deepgrep_status` — Health check

No parameters. Returns:
- ✅/❌ API key validity
- ✅/❌ Endpoint reachability
- ✅/⚠️ Model availability (rate limited, unauthorized, etc.)
- ✅/⚠️/ℹ️ Devin Desktop detection
- Current configuration summary

Example output:
```
deepgrep status

✅ API key: valid
✅ Endpoint: https://router.chainlens.net/v1
✅ deep-search: available
✅ Devin Desktop: detected (fast mode auto-key OK)

Config: fast_backend=windsurf, deep_model=deep-search
```

Use this to verify your setup or debug configuration issues.

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
| `DEEPGREP_API_KEY` | — | API key for deep mode ([get yours](https://deepgrep.chainlens.net)) |
| `DEEPGREP_API_URL` | `https://router.chainlens.net/v1` | API endpoint for deep mode |
| `DEEPGREP_MODEL` | `deep-search` | Model for deep search |
| `DEEPGREP_FAST_BACKEND` | `windsurf` | Fast mode backend: `openai` or `windsurf` (auto-detect Devin Desktop) |
| `DEEPGREP_FAST_MODEL` | — | Model for fast mode (required when `DEEPGREP_FAST_BACKEND=openai`) |
| `DEEPGREP_CACHE_DISABLED` | — | Set `1` to disable result cache (legacy: `FC_CACHE_DISABLED`) |
| `DEEPGREP_CACHE_TTL_MS` | `300000` (5 min) | Cache TTL in ms (legacy: `FC_CACHE_TTL_MS`) |
| `DEEPGREP_CACHE_MAX_ENTRIES` | `200` | Max cached entries before LRU eviction (legacy: `FC_CACHE_MAX_ENTRIES`) |

## Parameters

Both `deepgrep_search` and `deepgrep_deep` accept:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `query` | *(required)* | Natural language search query |
| `project_path` | cwd | Absolute path to project root |
| `tree_depth` | 3 | Directory tree depth (1-6). Lower for huge repos. |
| `max_results` | 10 | Max files to return (1-30) |
| `exclude_paths` | `[]` | Patterns to exclude (e.g. `["node_modules", "dist"]`) |
| `include_snippets` | `false` | Include actual code content in results |

`deepgrep_search` also accepts:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `max_turns` | 3 | Search rounds (1-5). More = better results, slower. |
| `auto_escalate` | `true` | Auto-switch to deep mode for complex queries or empty results |

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
| GPT-5.5 | `cx/gpt-5.5` | Most reliable for complex queries |
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

---

## Configuration for All ADEs (AI Development Environments)

deepgrep works with any MCP-compatible client. Below is how to configure it for each ADE, plus where to put your agent steering/rules so the AI knows **when** to use deepgrep.

### MCP Server Configuration

#### Kiro

`~/.kiro/settings/mcp.json` (user-level) or `.kiro/settings/mcp.json` (workspace):

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
      },
      "autoApprove": ["*"]
    }
  }
}
```

#### Claude Code

```bash
# Add the MCP server
claude mcp add deepgrep -- npx -y deepgrep

# Set environment variables (in your shell profile or .env)
export DEEPGREP_API_KEY="your-key"
export DEEPGREP_FAST_BACKEND="openai"
export DEEPGREP_FAST_MODEL="kr/claude-haiku-4.5"
```

Or add to `.claude/settings.json`:
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

#### Cursor

Settings → Features → MCP Servers → Add:
- Command: `npx -y deepgrep`
- Env: `DEEPGREP_API_KEY=your-key`, `DEEPGREP_FAST_BACKEND=openai`, `DEEPGREP_FAST_MODEL=kr/claude-haiku-4.5`

Or in `.cursor/mcp.json`:
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

#### Devin Desktop / Windsurf

Add to `~/Library/Application Support/Devin/User/globalStorage/mcp_config.json` (Devin Desktop) or `~/.codeium/windsurf/mcp_config.json` (Windsurf):

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

> 💡 **Devin Desktop bonus:** deepgrep auto-detects your local Devin credentials for fast mode. Omit `DEEPGREP_FAST_BACKEND` and `DEEPGREP_FAST_MODEL` to use free SWE-1.6 automatically.

#### Codex CLI (OpenAI)

Add to `~/.codex/config.json` or `codex.json` in project root:
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

#### VS Code + Copilot (GitHub Copilot MCP)

Add to `.vscode/mcp.json`:
```json
{
  "servers": {
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

### Where to Put Steering/Rules (Agent Instructions)

Each ADE has its own file for "always-on" agent instructions. Put your deepgrep usage rules here so the agent knows when to use `deepgrep_search` vs `deepgrep_deep` vs native grep:

| ADE | Steering/Rules file | Scope | Notes |
|-----|---------------------|-------|-------|
| **Kiro** | `.kiro/steering/*.md` | Global or per-workspace | Supports `always`, `fileMatch`, `manual` inclusion modes |
| **Claude Code** | `CLAUDE.md` (project root) | Per-project | Also supports `.claude/CLAUDE.md` for subfolders |
| **Cursor** | `.cursor/rules/*.mdc` | Per-project | MDC format, supports `globs` for conditional rules |
| **Devin Desktop / Windsurf** | `.windsurfrules` (project root) | Per-project | Single file, always loaded |
| **Codex CLI** | `AGENTS.md` or `codex.md` (root) | Per-project | Auto-read on startup |
| **VS Code Copilot** | `.github/copilot-instructions.md` | Per-repo | Auto-injected into Copilot Chat |
| **Aider** | `.aider.conf.yml` + conventions | Per-project | Config-based |
| **Cline/Roo** | `.clinerules` (project root) | Per-project | Single file, always loaded |

### Example Steering Content (copy-paste into your ADE's rules file)

```markdown
# Code Search Strategy

## When to use deepgrep

- **`deepgrep_search`** (fast, ~3-5s): Simple queries, 1-2 questions. "Where is X?", "Find the auth logic".
- **`deepgrep_deep`** (thorough, ~20-40s): Complex multi-hop queries (3+ parts), architecture understanding, cross-layer tracing.
- **`grep_search`** (native): When you already know the exact function/variable name.

## Rules
- For natural language code search, prefer `deepgrep_search` over native grep.
- If `deepgrep_search` returns incomplete results or wrong direction, escalate to `deepgrep_deep`.
- Always add `exclude_paths: ["node_modules", "dist", ".git", "build", ".next"]` for JS/TS projects.
- Write queries in English with code terms for best results on fast mode.
```
