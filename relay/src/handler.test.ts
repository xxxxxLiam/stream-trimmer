/**
 * File: handler.test.ts
 * Path: relay/src/handler.test.ts
 * Description: The crash-report relay with GitHub mocked: schema and size refusals, identity stripping for all three
 *   systems, de-dup into a comment, GitHub failing as 502, the per-IP limit, and the token never in a response.
 *   No real call is made. Also builds relay/dist/worker.js for real and runs the built file.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { CLIENT_HEADER, CLIENT_VALUE, MAX_BODY_BYTES, createRelay, signatureOf, type Env } from "./handler";

const TOKEN = "ghp_SECRET_TOKEN_VALUE_123";
const env: Env = { GITHUB_TOKEN: TOKEN };

type Call = { url: string; method: string; body?: any };
function mockGithub(opts: { openIssues?: any[]; failIssue?: boolean; failList?: boolean } = {}) {
  const calls: Call[] = [];
  const fetchFn = (async (input: any, init: any = {}) => {
    const url = String(input);
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url, method, body });
    const ok = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
    if (url.includes("/issues?")) return opts.failList ? ok({}, 500) : ok(opts.openIssues ?? []);
    if (url.endsWith("/labels")) return ok({}, 422);
    if (url.endsWith("/comments")) return ok({ id: 1 }, 201);
    if (url.endsWith("/issues")) return opts.failIssue ? ok({ message: `bad credentials ${TOKEN}` }, 401) : ok({ number: 42 }, 201);
    return ok({}, 404);
  }) as typeof fetch;
  return { fetchFn, calls };
}

const good = (over: Record<string, unknown> = {}) => ({
  kind: "crash",
  error: "TypeError: x is undefined\n    at render (C:\\Users\\Jane Doe\\AppData\\app.js:10:5)",
  appVersion: "14.0.0",
  os: "darwin 24.1",
  log: ["opened a video", "something broke"],
  ...over,
});

function post(relay: ReturnType<typeof createRelay>, body: unknown, headers: Record<string, string> = {}, raw?: string) {
  return relay(
    new Request("https://relay.example/report", {
      method: "POST",
      headers: { [CLIENT_HEADER]: CLIENT_VALUE, "CF-Connecting-IP": "1.2.3.4", ...headers },
      body: raw ?? JSON.stringify(body),
    }),
    env,
  );
}
const make = (opts?: Parameters<typeof mockGithub>[0], now = () => 0) => {
  const gh = mockGithub(opts);
  return { relay: createRelay({ fetch: gh.fetchFn, now }), ...gh };
};

test("a good report files one private issue, answers 202 with its number, and never shows the token", async () => {
  const { relay, calls } = make();
  const res = await post(relay, good());
  assert.equal(res.status, 202);
  const text = await res.text();
  assert.deepEqual(JSON.parse(text), { issue: 42 });
  assert.ok(!text.includes(TOKEN));
  const issue = calls.find((c) => c.method === "POST" && c.url.endsWith("/issues"))!;
  assert.match(issue.body.title, /^Crash: TypeError: x is undefined$/);
  assert.deepEqual(issue.body.labels, ["crash-report"]);
  assert.ok(calls.some((c) => c.url.endsWith("/labels")), "the label is created if missing");
});

test("a problem report from Help gets the user-report label and a title from the note", async () => {
  const { relay, calls } = make();
  const res = await post(relay, good({ kind: "problem", note: "The clip button does nothing when I press it twice in a row quickly", error: "No error shown" }));
  assert.equal(res.status, 202);
  const issue = calls.find((c) => c.url.endsWith("/issues") && c.method === "POST")!;
  assert.deepEqual(issue.body.labels, ["user-report"]);
  assert.match(issue.body.title, /^Problem: The clip button does nothing when I press it twice in a/);
  assert.ok(issue.body.title.length <= "Problem: ".length + 60);
});

test("anything off the fixed schema is a 400: wrong kind, extra keys, wrong types, too many log lines, no error", async () => {
  const { relay, calls } = make();
  for (const bad of [
    good({ kind: "other" }),
    good({ extra: 1 }),
    good({ error: 5 }),
    good({ error: "" }),
    good({ log: new Array(51).fill("x") }),
    good({ log: [1] }),
    good({ note: "x".repeat(2001) }),
    good({ appVersion: undefined }),
    [],
    "text",
  ])
    assert.equal((await post(relay, bad)).status, 400, JSON.stringify(bad).slice(0, 60));
  assert.equal((await post(relay, null, {}, "{not json")).status, 400);
  assert.equal(calls.length, 0, "nothing reached GitHub");
});

test("the size cap: over 32 KB is a 413 before it is read as a report", async () => {
  const { relay, calls } = make();
  const res = await post(relay, good({ error: "x".repeat(MAX_BODY_BYTES + 10) }));
  assert.equal(res.status, 413);
  assert.equal(calls.length, 0);
});

test("a request without the client header, or the wrong verb or path, is refused", async () => {
  const { relay } = make();
  const noHeader = await relay(new Request("https://relay.example/report", { method: "POST", body: JSON.stringify(good()) }), env);
  assert.equal(noHeader.status, 403);
  const get = await relay(new Request("https://relay.example/report", { method: "GET", headers: { [CLIENT_HEADER]: CLIENT_VALUE } }), env);
  assert.equal(get.status, 405);
  const other = await relay(new Request("https://relay.example/other", { method: "POST", headers: { [CLIENT_HEADER]: CLIENT_VALUE } }), env);
  assert.equal(other.status, 404);
});

test("home folders, emails, query strings and video links are stripped again on the server, for Mac, Windows and Linux", async () => {
  const { relay, calls } = make();
  const dirty = good({
    note: "mail me at jáne@exämple.com",
    error: [
      "Error: cannot open /Users/Jane Doe/Movies/a.mp4",
      "    at open (C:\\Users\\Jane Doe\\AppData\\x.js:1:1)",
      "also /home/jdoe/clips/b.mp4 and https://example.com/api?token=SECRETVALUE&who=janedoe99",
    ].join("\n"),
    log: ["watching https://www.youtube.com/watch?v=dQw4w9WgXcQ", "wrote D:\\Clips\\out.mp4", "\\\\fileserver\\share\\jane\\x.mp4"],
  });
  const res = await post(relay, dirty);
  assert.equal(res.status, 202);
  const issue = calls.find((c) => c.url.endsWith("/issues") && c.method === "POST")!;
  const all = `${issue.body.title}\n${issue.body.body}`;
  for (const leak of ["Jane", "Doe", "jdoe", "jáne", "exämple", "SECRETVALUE", "janedoe99", "dQw4w9WgXcQ", "youtube.com", "fileserver", "D:\\Clips"])
    assert.ok(!all.includes(leak), `leaked ${leak}`);
  assert.match(all, /https:\/\/example\.com\/api/);
});

test("the same crash again becomes a +1 comment on the open issue, not a new issue", async () => {
  const sig = await signatureOf("TypeError: x is undefined\n    at render (/a/b/app.js:10:5)");
  const { relay, calls } = make({ openIssues: [{ number: 7, comments: 3, body: `text\n\nSignature: ${sig}` }] });
  const res = await post(relay, good({ error: "TypeError: x is undefined\n    at render (C:\\Users\\Other\\app.js:10:5)" }));
  assert.equal(res.status, 202);
  assert.deepEqual(await res.json(), { issue: 7, duplicate: true });
  const comment = calls.find((c) => c.url.endsWith("/issues/7/comments"))!;
  assert.match(comment.body.body, /^\+1 \(report 5\)/);
  assert.ok(!calls.some((c) => c.method === "POST" && c.url.endsWith("/issues")), "no new issue");
});

test("a different crash is a new issue", async () => {
  const { relay, calls } = make({ openIssues: [{ number: 7, comments: 0, body: "Signature: 0000000000000000" }] });
  assert.equal((await post(relay, good())).status, 202);
  assert.ok(calls.some((c) => c.method === "POST" && c.url.endsWith("/issues")));
});

test("when GitHub fails the answer is 502 with nothing from GitHub in it, so the app keeps the report", async () => {
  for (const opts of [{ failIssue: true }, { failList: true }]) {
    const { relay } = make(opts);
    const res = await post(relay, good());
    assert.equal(res.status, 502);
    const text = await res.text();
    assert.ok(!text.includes(TOKEN) && !text.includes("bad credentials"));
  }
  const noToken = createRelay({ fetch: mockGithub().fetchFn, now: () => 0 });
  assert.equal((await noToken(new Request("https://r.example/report", { method: "POST", headers: { [CLIENT_HEADER]: CLIENT_VALUE }, body: JSON.stringify(good()) }), {})).status, 502);
});

test("a sixth report from one address in an hour is a 429; an hour later it is fine; another address is unaffected", async () => {
  let now = 0;
  const { relay } = make(undefined, () => now);
  for (let i = 0; i < 5; i++) assert.equal((await post(relay, good({ kind: "problem", note: `n${i}` }))).status, 202);
  assert.equal((await post(relay, good())).status, 429);
  assert.equal((await post(relay, good(), { "CF-Connecting-IP": "9.9.9.9" })).status, 202);
  now = 3_600_001;
  assert.equal((await post(relay, good())).status, 202);
});

test("the built worker.js is one file that runs: it answers a bad report with 400 and a good one through a mocked GitHub", async () => {
  const out = join(mkdtempSync(join(tmpdir(), "relay-build-")), "worker.js");
  const r = spawnSync("node", [join(process.cwd(), "scripts", "build-relay.cjs")], { env: { ...process.env, BUILD_RELAY_OUT: out }, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  // The file Liam pastes into Cloudflare is the one committed: it must match what the sources build to.
  assert.equal(readFileSync(out, "utf8"), readFileSync(join(process.cwd(), "relay", "dist", "worker.js"), "utf8"), "relay/dist/worker.js is stale: run npm run build:relay");
  const mod = await import(pathToFileURL(out).href);
  const bad = await mod.default.fetch(new Request("https://r.example/report", { method: "POST", headers: { [CLIENT_HEADER]: CLIENT_VALUE }, body: "{}" }), env);
  assert.equal(bad.status, 400);
  const real = globalThis.fetch;
  const gh = mockGithub();
  globalThis.fetch = gh.fetchFn;
  try {
    const ok = await mod.default.fetch(new Request("https://r.example/report", { method: "POST", headers: { [CLIENT_HEADER]: CLIENT_VALUE }, body: JSON.stringify(good()) }), env);
    assert.equal(ok.status, 202);
  } finally {
    globalThis.fetch = real;
  }
});

test("GET /min-version returns the dashboard value, needs the client header, and is not a report route", async () => {
  const relay = createRelay({ fetch: (async () => new Response("{}", { status: 500 })) as unknown as typeof fetch, now: () => 0 });
  const ask = (init: RequestInit, e: Env = {}) => relay(new Request("https://r.test/min-version", init), e);
  const ok = await ask({ headers: { [CLIENT_HEADER]: CLIENT_VALUE } }, { MIN_VERSION: " 19.6.0 " });
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { minVersion: "19.6.0" });
  const none = await ask({ headers: { [CLIENT_HEADER]: CLIENT_VALUE } });
  assert.deepEqual(await none.json(), { minVersion: "" });
  assert.equal((await ask({})).status, 403);
  assert.equal((await ask({ method: "POST", headers: { [CLIENT_HEADER]: CLIENT_VALUE } })).status, 405);
});
