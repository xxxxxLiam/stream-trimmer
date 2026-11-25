/**
 * File: fcpLook.ts
 * Path: src/common/types/fcpLook.ts
 * Description: What reading a user's Final Cut look file returns. The same shape for the picker and for a dropped file.
 */
import type { Look } from "../utils/fcpLook";

export type FcpLookFileResult =
  | {
      ok: true;
      /** The file's name, for "Your look: <name>". */
      fileName: string;
      /** The parsed look, small enough to keep with a campaign (the export itself is not kept). */
      look: Look;
    }
  | { ok: false; cancelled?: boolean; /** One plain sentence for under the row, in error red. */ reason: string };

/** The biggest export accepted. Real ones are a few KB; this stops a wrong file being read whole. */
export const FCP_LOOK_MAX_BYTES = 5 * 1024 * 1024;
