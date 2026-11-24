/**
 * File: ytRunner.ts
 * Path: server/channel/ytRunner.ts
 * Description: Runs yt-dlp for a channel export job with a private cookie copy per run.
 */
import { CookieJarMissingError, acquireCookiePath, type CookieLease } from "../cookieJar";
import { D } from "./channelDeps";
import { ChannelJob } from "./channelJobs";

// Spawn yt-dlp for a job, registering the child so cancellation can kill it.
// Every exporter run is one of thousands in flight over a job's life, and
// yt-dlp writes its cookie jar back on every run, so none of them may be handed
// the canonical file. Each gets a private copy that is thrown away (release
// false) when the run ends; the saved session is refreshed by single runs
// elsewhere, never by the exporter.
export async function runForJob(
  job: ChannelJob,
  url: string,
  opts: Record<string, unknown>,
  timeoutMs = 180_000,
): Promise<any> {
  const canonical = D.appCookieFile();
  if (!canonical || opts.cookies !== canonical) {
    return runForJobRaw(job, url, opts, timeoutMs);
  }
  let lease: CookieLease;
  try {
    lease = await acquireCookiePath({ refresher: false });
  } catch (e) {
    if (!(e instanceof CookieJarMissingError)) throw e;
    const { cookies: _gone, ...rest } = opts;
    return runForJobRaw(job, url, rest, timeoutMs);
  }
  try {
    return await runForJobRaw(job, url, { ...opts, cookies: lease.path }, timeoutMs);
  } finally {
    await lease.release(false);
  }
}

function runForJobRaw(
  job: ChannelJob,
  url: string,
  opts: Record<string, unknown>,
  timeoutMs = 180_000,
): Promise<any> {
  return new Promise((resolve, reject) => {
    if (job.cancelled) return reject(new Error("cancelled"));
    const child = D.yt!.exec(url, opts, { env: D.childEnv() });
    job.children.add(child);
    const outChunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    let settled = false;
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    }, timeoutMs);
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      job.children.delete(child);
      fn();
    };
    child.stdout?.on("data", (c: Buffer) => outChunks.push(c));
    child.stderr?.on("data", (c: Buffer) => errChunks.push(c));
    child.on("error", (err) => finish(() => reject(err)));
    child.on("close", (code) => {
      const stdout = Buffer.concat(outChunks).toString();
      const stderr = Buffer.concat(errChunks).toString();
      finish(() => {
        if (code === 0) {
          try {
            resolve(stdout.trim().startsWith("{") ? JSON.parse(stdout) : stdout);
          } catch {
            resolve(stdout);
          }
        } else {
          const err: any = new Error(stderr.trim() || `yt-dlp exited ${code}`);
          err.stderr = stderr;
          err.exitCode = code;
          reject(err);
        }
      });
    });
  });
}
