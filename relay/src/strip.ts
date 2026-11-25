/**
 * File: strip.ts
 * Path: relay/src/strip.ts
 * Description: Removes who and where from report text on the server, even though the app already did:
 *   home folders on Mac, Windows and Linux, emails, query strings on links, and any video link.
 */
import { redact } from "../../src/common/utils/redact";

/** A YouTube address, whole: a report never carries a video link. */
const VIDEO_LINK = /https?:\/\/(?:[\w-]+\.)*(?:youtube\.com|youtu\.be|youtube-nocookie\.com|googlevideo\.com)[^\s"'<>)]*/gi;
/** Any other address keeps its origin and path; the query and fragment may hold tokens and names. */
const URL_QUERY = /(https?:\/\/[^\s"'<>?#]+)[?#][^\s"'<>]*/gi;
/** Backslash paths with a drive or a UNC share: C:\Users\Jane Doe\x, \\server\share\x. */
const WIN_ANY = /(?<![\w])(?:[A-Za-z]:\\|\\\\)[^\n"'<>|*?]*/g;

export function stripIdentity(text: string): string {
  return redact(String(text ?? ""))
    .replace(VIDEO_LINK, "<video link>")
    .replace(URL_QUERY, "$1")
    .replace(WIN_ANY, (m) => (/^[A-Za-z]:\\Users\\|~/.test(m) ? m : "<path>"));
}
