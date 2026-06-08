import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { formatSnippetToolOutput } from "../src/server.mjs";

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "deepgrep-snippets-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function snapshotEnv() {
  return {
    key: process.env.DEEPGREP_API_KEY,
    maxLines: process.env.FC_SNIPPET_MAX_LINES,
  };
}

function restoreEnv(saved) {
  for (const [name, value] of [
    ["DEEPGREP_API_KEY", saved.key],
    ["FC_SNIPPET_MAX_LINES", saved.maxLines],
  ]) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

test("formats valid ranges with headers, code fences, and line numbers", () => {
  withTempDir((dir) => {
    const file = join(dir, "auth.mjs");
    writeFileSync(file, [
      "const first = 1;",
      "export function login(user, pass) {",
      "  return user === pass;",
      "}",
    ].join("\n"));

    const out = formatSnippetToolOutput({ files: [{ file, ranges: [[2, 3]] }] });

    assert.equal(out, [
      `## ${file} (L2-3)`,
      "```",
      "2 | export function login(user, pass) {",
      "3 |   return user === pass;",
      "```",
    ].join("\n"));
  });
});

test("respects FC_SNIPPET_MAX_LINES across output", () => {
  const saved = snapshotEnv();
  process.env.FC_SNIPPET_MAX_LINES = "2";
  try {
    withTempDir((dir) => {
      const file = join(dir, "many.mjs");
      writeFileSync(file, ["a", "b", "c", "d"].join("\n"));

      const out = formatSnippetToolOutput({ files: [{ file, ranges: [[1, 4]] }] });

      assert.match(out, /1 \| a/);
      assert.match(out, /2 \| b/);
      assert.doesNotMatch(out, /3 \| c/);
      assert.match(out, /snippet line budget \(2\) reached/);
    });
  } finally {
    restoreEnv(saved);
  }
});

test("binary files are reported without crashing", () => {
  withTempDir((dir) => {
    const file = join(dir, "binary.bin");
    writeFileSync(file, Buffer.from([0x61, 0x00, 0x62]));

    const out = formatSnippetToolOutput({ files: [{ file, ranges: [[1, 1]] }] });

    assert.match(out, new RegExp(`## ${file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\(L1-1\\)`));
    assert.match(out, /\[binary file — snippet omitted\]/);
  });
});

test("out-of-bounds ranges are skipped gracefully", () => {
  withTempDir((dir) => {
    const file = join(dir, "short.mjs");
    writeFileSync(file, ["one", "two"].join("\n"));

    const out = formatSnippetToolOutput({ files: [{ file, ranges: [[99, 100]] }] });

    assert.equal(out, "No snippets found for given ranges.");
  });
});

test("empty files or ranges return clear no-input message", () => {
  withTempDir((dir) => {
    const file = join(dir, "empty-ranges.mjs");
    writeFileSync(file, "one\ntwo");

    assert.equal(formatSnippetToolOutput({ files: [] }), "No files/ranges provided");
    assert.equal(formatSnippetToolOutput({ files: [{ file, ranges: [] }] }), "No files/ranges provided");
  });
});

test("does not require or read DEEPGREP_API_KEY", () => {
  const saved = snapshotEnv();
  delete process.env.DEEPGREP_API_KEY;
  try {
    withTempDir((dir) => {
      const file = join(dir, "local.mjs");
      writeFileSync(file, "local only");

      const out = formatSnippetToolOutput({ files: [{ file, ranges: [[1, 1]] }] });

      assert.match(out, /1 \| local only/);
    });
  } finally {
    restoreEnv(saved);
  }
});

test("multi-range entry: comma-joined header and '...' separator between blocks", () => {
  withTempDir((dir) => {
    const file = join(dir, "multi.mjs");
    writeFileSync(file, ["a", "b", "c", "d", "e", "f"].join("\n"));

    const out = formatSnippetToolOutput({ files: [{ file, ranges: [[1, 2], [5, 6]] }] });

    assert.match(out, new RegExp(`## ${file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\(L1-2, L5-6\\)`));
    assert.match(out, /1 \| a/);
    assert.match(out, /2 \| b/);
    assert.match(out, /5 \| e/);
    assert.match(out, /6 \| f/);
    assert.match(out, /\.\.\./);
  });
});

test("mixed input: file with empty ranges is skipped, valid file is served", () => {
  withTempDir((dir) => {
    const good = join(dir, "good.mjs");
    const bad = join(dir, "bad.mjs");
    writeFileSync(good, "hello\nworld");
    writeFileSync(bad, "ignored");

    const out = formatSnippetToolOutput({
      files: [
        { file: good, ranges: [[1, 1]] },
        { file: bad, ranges: [] },
      ],
    });

    assert.match(out, /1 \| hello/);
    assert.doesNotMatch(out, /ignored/);
  });
});
