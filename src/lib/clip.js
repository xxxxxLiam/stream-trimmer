export const MAX_CLIP_SECONDS = 600;

export function formatTimestamp(seconds) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

// Parse "HH:MM:SS", "MM:SS", or bare "SS" into seconds. Returns null if invalid.
export function parseTimestamp(text) {
  if (text == null) return null;
  const t = String(text).trim();
  if (t === "") return null;
  const parts = t.split(":").map((p) => p.trim());
  if (parts.some((p) => p === "" || !/^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  if (nums.length === 1) return nums[0];
  if (nums.length === 2) return nums[0] * 60 + nums[1];
  if (nums.length === 3) return nums[0] * 3600 + nums[1] * 60 + nums[2];
  return null;
}

export function extractVideoId(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1) || null;
    const v = u.searchParams.get("v");
    if (v) return v;
    const parts = u.pathname.split("/");
    const i = parts.findIndex((p) => ["embed", "shorts", "v"].includes(p));
    return i >= 0 ? parts[i + 1] || null : null;
  } catch {
    return null;
  }
}

export async function parseJson(response) {
  const ct = response.headers.get("content-type") || "";
  if (!ct.includes("application/json")) {
    throw new Error("Backend not reachable. Run `npm run dev` locally.");
  }
  return response.json();
}
