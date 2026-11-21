/**
 * File: g3b-cancel-query.cjs
 * Path: audit/run-2/area-G/g3b-cancel-query.cjs
 * Description: The documented alternative form of the cancel call —
 * `POST /api/download/cancel?jobId=<id>` with the id in the QUERY — in the
 * four body shapes a caller might send with it.
 */
const G = require("./glib.cjs");

(async () => {
  const s = await G.startServer({ label: "cancel-query", cfg: { duration: 30 } });
  const out = { when: new Date().toISOString(), rows: [] };
  const shapes = [
    { name: "no body, no content-type", headers: {}, body: null },
    { name: "no body, content-type json", headers: { "content-type": "application/json" }, body: null },
    { name: "empty object body", headers: { "content-type": "application/json" }, body: "{}" },
    { name: "literal null body", headers: { "content-type": "application/json" }, body: "null" },
    { name: "text/plain body", headers: { "content-type": "text/plain" }, body: "x" },
  ];
  for (const sh of shapes) {
    const r = await G.request({
      port: s.port,
      method: "POST",
      path: "/api/download/cancel?jobId=job_from_query",
      headers: sh.headers,
      body: sh.body,
      timeout: 15_000,
    });
    out.rows.push({
      shape: sh.name,
      status: r.status,
      contentType: (r.headers || {})["content-type"] || null,
      body: (r.body || "").slice(0, 100).replace(/\n/g, " "),
    });
  }
  await s.stop();
  for (const r of out.rows) console.log(`${String(r.status).padEnd(4)} ${String(r.contentType).slice(0,30).padEnd(32)} ${r.shape.padEnd(28)} ${r.body}`);
  console.log("results:", G.saveResults("g3b-cancel-query", out));
})();
