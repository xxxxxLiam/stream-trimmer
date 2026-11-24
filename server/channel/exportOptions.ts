/**
 * File: exportOptions.ts
 * Path: server/channel/exportOptions.ts
 * Description: The channel export request schema and how many videos a limit reads and ranks.
 */
import { z } from "zod";
import { D } from "./channelDeps";

// ---------------------------------------------------------------------------
// Channel profile exporter — enumerate a channel, rank by views, and collect
// metadata / comments / transcripts for the top N videos.
// ---------------------------------------------------------------------------

// Hard ceiling on how deep a channel listing is read. A channel with more
// videos than this exports its most-viewed CANDIDATE_CAP, not all of them.
const CANDIDATE_CAP = 20000;
const CHANNEL_LIMIT_MAX = 10000; // largest budget that can be asked for by number
export const SHORT_MAX_SECONDS = 60;

/** How many videos to export: a count, or every video the channel lists. */
type ChannelLimit = number | "all";

const DEFAULT_LISTING_DEPTH = 3000;

/**
 * How deep to read a channel tab.
 *
 * This was a flat 3000, which quietly capped an "export the whole channel" run
 * at 3000 candidates. It stays at least 3000 for numeric budgets: the Shorts
 * tab comes back newest-first, so a shallow listing would rank the newest
 * videos rather than the most-viewed ones.
 */
export function listingDepth(limit: ChannelLimit): number {
  if (limit === "all") return CANDIDATE_CAP;
  return Math.min(CANDIDATE_CAP, Math.max(DEFAULT_LISTING_DEPTH, limit * 2));
}

/** How many of a tab's ranked entries go into the candidate pool. */
export function poolCap(limit: ChannelLimit): number {
  return limit === "all" ? CANDIDATE_CAP : Math.min(CANDIDATE_CAP, limit * 2);
}

export const META_CONCURRENCY = 3;

export function buildChannelExportSchema() {
  return z.object({
  url: D.urlSchema,
  contentType: z.enum(["shorts", "longform", "all"]).default("all"),
  limit: z
    .union([z.literal("all"), z.number().int().min(1).max(CHANNEL_LIMIT_MAX)])
    .default(100),
  // What to collect. Each is its own CSV, and turning one off skips the work
  // rather than just the file.
  includeVideoDetails: z.boolean().default(true),
  includeComments: z.boolean().default(true),
  includeTranscripts: z.boolean().default(true),
  // Throw away any saved progress for this exact request and start over.
  fresh: z.boolean().default(false),
  // "rows" returns every row in the JSON response, which is what a browser
  // needs. "path" writes the CSVs on this machine and returns their paths, so
  // a whole-channel export never has to fit in a JSON body — see
  // finishExportToDisk below.
  deliver: z.enum(["rows", "path"]).default("rows"),
  cookiesFromBrowser: D.authSourceSchema.optional(),
  });
}

export type ChannelExportInput = z.infer<ReturnType<typeof buildChannelExportSchema>>;
