import { test } from "node:test";
import assert from "node:assert/strict";
import { checkHealth, formatHealthReport } from "../src/health.mjs";

const baseReport = (over = {}) => ({
  keyPresent: true,
  keyValid: true,
  keyStatus: "ok",
  endpointReachable: true,
  endpoint: "https://api.example/v1",
  models: [{ id: "deep-search", status: "ok" }],
  devinDetected: true,
  config: { fastBackend: "windsurf", fastModel: "", deepModel: "deep-search", apiUrl: "https://api.example/v1" },
  signupUrl: "https://signup.example",
  ...over,
});

// ─── formatHealthReport (pure — reads only the report, never env: P15) ───

test("valid key → ✅, model available, no signup hint", () => {
  const out = formatHealthReport(baseReport());
  assert.match(out, /✅ API key: valid/);
  assert.match(out, /✅ Endpoint: https:\/\/api\.example\/v1$/m);
  assert.match(out, /✅ deep-search: available/);
  assert.doesNotMatch(out, /Get a free API key/);
});

test("missing key → not set + signup URL + endpoint not checked", () => {
  const out = formatHealthReport(baseReport({
    keyPresent: false, keyValid: false, keyStatus: "no_key", endpointReachable: null, models: [], devinDetected: false,
  }));
  assert.match(out, /❌ API key: not set/);
  assert.match(out, /https:\/\/signup\.example/);
  assert.match(out, /ℹ️ {2}Endpoint: .* \(not checked/);
});

test("invalid key (unauthorized) → shows signup URL (AC#2 / P3)", () => {
  const out = formatHealthReport(baseReport({
    keyValid: false, keyStatus: "unauthorized", models: [{ id: "deep-search", status: "unauthorized" }], devinDetected: false,
  }));
  assert.match(out, /❌ API key: invalid \(unauthorized\)/);
  assert.match(out, /https:\/\/signup\.example/); // P3: URL on invalid, not just missing
});

test("network error is NOT reported as invalid key, no signup hint (P5)", () => {
  const out = formatHealthReport(baseReport({
    keyValid: false, keyStatus: "error:timeout", endpointReachable: false,
    models: [{ id: "deep-search", status: "error:timeout" }], devinDetected: false,
  }));
  assert.match(out, /could not verify/);
  assert.doesNotMatch(out, /invalid \(unauthorized\)/);
  assert.match(out, /❌ Endpoint: .* \(unreachable\)/); // P9
  assert.doesNotMatch(out, /Get a free API key/);
});

test("Devin detected with openai fast backend is informational only (P13)", () => {
  const out = formatHealthReport(baseReport({
    config: { fastBackend: "openai", fastModel: "kr/x", deepModel: "deep-search", apiUrl: "x" },
  }));
  assert.match(out, /ℹ️ {2}Devin Desktop: detected \(not used/);
  assert.doesNotMatch(out, /auto-key OK/);
});

// ─── checkHealth (mocked fetch) ───

function snapshotEnv() {
  return { url: process.env.DEEPGREP_API_URL, key: process.env.DEEPGREP_API_KEY, model: process.env.DEEPGREP_MODEL };
}
function restoreEnv(s) {
  for (const [name, v] of [["DEEPGREP_API_URL", s.url], ["DEEPGREP_API_KEY", s.key], ["DEEPGREP_MODEL", s.model]]) {
    if (v === undefined) delete process.env[name];
    else process.env[name] = v;
  }
}

test("checkHealth: trailing-slash URL not doubled + single ping of configured model (P1/P2/P11)", async () => {
  const origFetch = global.fetch;
  const saved = snapshotEnv();
  const calls = [];
  global.fetch = async (url) => { calls.push(url); return new Response("{}", { status: 200 }); };
  process.env.DEEPGREP_API_URL = "https://api.example/v1/";
  process.env.DEEPGREP_API_KEY = "k";
  process.env.DEEPGREP_MODEL = "custom-model";
  try {
    const r = await checkHealth();
    assert.equal(calls.length, 1, "exactly one ping — no double-ping (P2)");
    assert.equal(calls[0], "https://api.example/v1/chat/completions", "no '//' in path (P11)");
    assert.equal(r.models.length, 1);
    assert.equal(r.models[0].id, "custom-model", "pings configured model, not hardcoded deep-search (P1)");
    assert.equal(r.keyValid, true);
  } finally {
    global.fetch = origFetch;
    restoreEnv(saved);
  }
});

test("checkHealth: whitespace-only key treated as not set, no ping (P12)", async () => {
  const origFetch = global.fetch;
  const saved = snapshotEnv();
  let pinged = false;
  global.fetch = async () => { pinged = true; return new Response("{}", { status: 200 }); };
  process.env.DEEPGREP_API_KEY = "   ";
  delete process.env.DEEPGREP_API_URL;
  try {
    const r = await checkHealth();
    assert.equal(r.keyPresent, false);
    assert.equal(pinged, false, "must not ping with a whitespace-only key");
    assert.equal(r.endpointReachable, null);
  } finally {
    global.fetch = origFetch;
    restoreEnv(saved);
  }
});
