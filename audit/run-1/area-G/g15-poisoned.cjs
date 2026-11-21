#!/usr/bin/env node
/**
 * G area, audit-only. Is a damaged cached `source.*` permanent?
 * pruneWorkDir() keeps every `source.*` on failure (it is treated as resumable
 * data), and findDownloaded() never checks it is valid media, so every retry
 * trims from the same broken file.
 */
const fs = require("node:fs"); const os = require("node:os"); const path = require("node:path");
const S = require("./srv.cjs");
const DL = (segs) => ({ url: S.YT, deliver: "path", quality: "360", format: "mp4", segments: segs });
(async () => {
  for (const d of fs.readdirSync(os.tmpdir()).filter((n)=>n.startsWith("ytclip-"))) fs.rmSync(path.join(os.tmpdir(),d),{recursive:true,force:true});
  const stub = S.makeStub("g15");
  const base = { info: { id: "stub0000001", title: "Stub", duration: 60 } };
  S.setStub(stub, base);
  const s = await S.start({ stub });
  const segs = [{ start: 7, end: 13 }];
  const warm = await s.json("POST", "/api/download?jobId=job_warm", DL(segs));
  const dir = path.dirname(JSON.parse(warm.body||"{}").path||"");
  fs.rmSync(path.join(dir,"clip.mp4"),{force:true});
  const good = fs.readFileSync(path.join(S.REPO,"audit","fixtures","fixture.mp4"));
  fs.writeFileSync(path.join(dir,"source.mp4"), good.subarray(0, 300000));
  S.setStub(stub, { ...base, failDownload: 1, failStderr: "ERROR: unable to download video data: HTTP Error 403: Forbidden" });
  for (let i=1;i<=3;i++){
    const r = await s.json("POST", `/api/download?jobId=job_try${i}`, DL(segs));
    let j={}; try{j=JSON.parse(r.body||"{}");}catch{}
    console.log(`attempt ${i}: status=${r.status} code=${j.code} errorStartsWith=${JSON.stringify(String(j.error||"").slice(0,70))}`);
    console.log(`           files left in the work folder: ${JSON.stringify(fs.readdirSync(dir))}`);
  }
  // Only clearing the cache unsticks it.
  console.log("clear:", (await s.json("POST","/api/cache/clear",{})).body);
  S.setStub(stub, base);
  const after = await s.json("POST", "/api/download?jobId=job_after_clear", DL(segs));
  console.log("after Clear cache:", after.status, (after.body||"").slice(0,120));
  await s.stop();
  console.log("SUMMARY-DONE");
})().catch((e)=>{console.error("FATAL",e);process.exit(1);});
