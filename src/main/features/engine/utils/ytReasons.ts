/**
 * File: ytReasons.ts
 * Path: src/main/features/engine/utils/ytReasons.ts
 * Description: Reads yt-dlp's own words for why a video can't be had and gives one plain sentence and a kind.
 *   One table, used by the open-a-video route and by the clip failure table, so both say the same thing.
 *   The raw text never leaves main; only the sentence and the kind do.
 */

export type YtReasonKind =
  | "members"
  | "private"
  | "age"
  | "signin"
  | "live"
  | "region"
  | "removed"
  | "refused"
  | "offline";

export interface YtReason {
  kind: YtReasonKind;
  /** One plain sentence for the person. No yt-dlp text, no exit code. */
  sentence: string;
}

/** Order matters: the first row that matches wins (members-only before private, age before the bot check). */
const ROWS: { kind: YtReasonKind; test: RegExp; sentence: string }[] = [
  {
    kind: "members",
    test: /members[- ]only|join this channel|available to this channel'?s members|requires? (?:a )?(?:membership|payment)/i,
    sentence: "This video is for channel members only.",
  },
  { kind: "private", test: /private video|video is private/i, sentence: "This video is private." },
  {
    kind: "age",
    test: /confirm your age|age[- ]restricted|inappropriate for some users/i,
    sentence: "This video is age-restricted, so YouTube wants a signed-in account to play it.",
  },
  {
    kind: "signin",
    test: /confirm you.re not a bot|sign in to confirm/i,
    sentence: "YouTube wants a signed-in account before it will share this video.",
  },
  {
    kind: "live",
    test: /live event will begin|premieres? in|will premiere|is upcoming|this live event|live stream recording is not available/i,
    sentence: "This live video hasn't started yet.",
  },
  {
    kind: "region",
    test: /not (?:made this video )?available in your country|blocked (?:it )?in your country|geo[- ]?restrict/i,
    sentence: "This video isn't available in your country.",
  },
  {
    kind: "removed",
    test: /video unavailable|has been removed|no longer available|video has been (?:deleted|terminated)|does not exist|account associated with this video has been terminated/i,
    sentence: "This video has been removed or isn't available.",
  },
  {
    kind: "refused",
    test: /HTTP Error (?:403|429)|\bForbidden\b|Too Many Requests/i,
    sentence: "YouTube refused the request for this video.",
  },
  {
    kind: "offline",
    test: /ENOTFOUND|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|timed out|connection (?:reset|refused|aborted)|network is unreachable|temporary failure in name resolution|unable to download webpage|Name or service not known|getaddrinfo/i,
    sentence: "Clipr couldn't reach YouTube. Check your internet connection.",
  },
];

export function ytReasonOf(raw: string): YtReason | null {
  const text = raw || "";
  for (const row of ROWS) if (row.test.test(text)) return { kind: row.kind, sentence: row.sentence };
  return null;
}
