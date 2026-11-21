/**
 * File: setupTasks.ts
 * Path: src/lib/setupTasks.ts
 * Description: Setup checklist logic (BUILD-SPEC A7). Pure: takes the app's CURRENT state and
 *   returns the ordered items. Nothing is stored; "done" is derived, so clearing a folder
 *   un-ticks its item and the list doubles as a health check. Items 3 to 8 describe the
 *   active campaign only. Setup never blocks first use: this list is advice, never a gate.
 *
 * Dependency chain:
 *   1 sign-in              (none)
 *   2 campaign             (none)
 *   3 clips folder         needs 2
 *   4 length band          needs 2
 *   5 clip id pattern      needs 2
 *   6 after cutting        needs 2 and 3
 *   7 Final Cut details    shown only when 6 is Final Cut; four sub-items
 *   8 channel data folder  needs 2; shown only when the build has the exporter
 *   9 clip bank (optional) needs 2 and a loaded video
 */
import type { SessionStatus } from "./youtubeConnection";
import type { AfterCutting } from "./fcpxml";

export const SETUP_FIRST_LINE =
  "Setup is optional. You can paste a link and cut a clip right now with nothing set.";

export type SetupItemId =
  | "sign-in"
  | "campaign"
  | "clips-folder"
  | "length-band"
  | "id-pattern"
  | "after-cutting"
  | "fcp-library"
  | "fcp-media-event"
  | "fcp-project-event"
  | "fcp-timeline"
  | "data-folder"
  | "clip-bank";

/** What the inline control does. The component maps each to a real action. */
export type SetupAction =
  | "sign-in"
  | "open-campaigns"
  | "pick-clips-folder"
  | "pick-data-folder"
  | "confirm-data-folder"
  | "open-editor-handoff"
  | "open-bank";

export type SetupCampaign = {
  id: string;
  name: string;
  clipsDir: string;
  dataDir: string;
  targetMinSec: number;
  targetMaxSec: number;
  hardMaxSec: number;
  clipIdPattern: string;
};

export type SetupInput = {
  signIn: SessionStatus;
  /** Every campaign that exists. */
  campaigns: ReadonlyArray<{ id: string }>;
  /** The selected campaign, or null. Items 3 to 8 are about this one only. */
  campaign: SetupCampaign | null;
  /** False while the data folder is a suggestion the user has not accepted. */
  dataDirConfirmed: boolean;
  /** Build has the exporter AND this machine may use it. */
  exporter: boolean;
  videoLoaded: boolean;
  /** null when nothing has ever been chosen for this campaign. */
  afterCutting: AfterCutting | null;
  finalCut: {
    fcpLibrary: string;
    mediaEvent: string;
    projectEvent: string;
    timelineFormat: { width: number; height: number; fps: string } | null;
  };
  /** Clips banked under the active campaign, across every video. */
  bankedClips: number;
};

export type SetupItem = {
  id: SetupItemId;
  title: string;
  /** One line: what. */
  what: string;
  /** One line: why it matters. */
  why: string;
  done: boolean;
  /** True while a prerequisite is not done. A blocked item is never done. */
  blocked: boolean;
  /** Plain words for what it is waiting for. Empty when not blocked. */
  blockedBy: string[];
  optional: boolean;
  /** Set on the Final Cut sub-items. */
  parentId?: SetupItemId;
  /** Short status detail shown beside the title, e.g. "Runs out soon". */
  note?: string;
  action: SetupAction;
  actionLabel: string;
};

const nonEmpty = (s: string | undefined | null) => (s ?? "").trim().length > 0;

export function bandIsSet(c: Pick<SetupCampaign, "targetMinSec" | "targetMaxSec" | "hardMaxSec">): boolean {
  return (
    Number.isFinite(c.targetMinSec) &&
    Number.isFinite(c.targetMaxSec) &&
    Number.isFinite(c.hardMaxSec) &&
    c.targetMaxSec > 0 &&
    c.targetMinSec >= 0 &&
    c.targetMinSec <= c.targetMaxSec &&
    c.targetMaxSec <= c.hardMaxSec
  );
}

export function patternIsSet(pattern: string): boolean {
  return nonEmpty(pattern) && /\{nn\}|\{n\}/.test(pattern);
}

function sameDir(a: string, b: string): boolean {
  const n = (p: string) => p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  return nonEmpty(a) && nonEmpty(b) && n(a) === n(b);
}

/** Build the ordered checklist from the current state. Order is fixed and never depends on done. */
export function buildSetupItems(s: SetupInput): SetupItem[] {
  const c = s.campaign;
  const items: SetupItem[] = [];

  // 1. Sign in. No prerequisite.
  const signedIn = s.signIn === "signed_in" || s.signIn === "expiring_soon";
  items.push({
    id: "sign-in",
    title: "Sign in to YouTube",
    what: "Import a cookies.txt from your browser so the app is signed in.",
    why: "Without it YouTube serves 360p instead of 1080p.",
    done: signedIn,
    blocked: false,
    blockedBy: [],
    optional: false,
    note:
      s.signIn === "expiring_soon" ? "Runs out soon"
      : s.signIn === "expired" ? "Sign-in expired"
      : s.signIn === "checking" ? "Checking"
      : undefined,
    action: "sign-in",
    actionLabel: signedIn ? "Import a fresh cookies.txt" : "Import cookies.txt",
  });

  // 2. Campaign. No prerequisite.
  const hasCampaign = c !== null;
  items.push({
    id: "campaign",
    title: "Create a campaign",
    what: "Name the client or show you are cutting for.",
    why: "Everything below is saved per campaign.",
    done: hasCampaign,
    blocked: false,
    blockedBy: [],
    optional: false,
    note: !hasCampaign && s.campaigns.length > 0 ? "Pick one from the Campaign chip" : undefined,
    action: "open-campaigns",
    actionLabel: s.campaigns.length > 0 && !hasCampaign ? "Pick a campaign" : "New campaign",
  });

  const needCampaign = hasCampaign ? [] : ["Create a campaign"];
  const campaignItem = (
    id: SetupItemId,
    title: string,
    what: string,
    why: string,
    rawDone: boolean,
    action: SetupAction,
    actionLabel: string,
  ): SetupItem => ({
    id,
    title,
    what,
    why,
    done: hasCampaign && rawDone,
    blocked: !hasCampaign,
    blockedBy: needCampaign,
    optional: false,
    action,
    actionLabel,
  });

  // 3 to 5. Need a campaign.
  const clipsDone = hasCampaign && nonEmpty(c.clipsDir);
  items.push(
    campaignItem(
      "clips-folder",
      "Choose the clips folder",
      "Pick where this campaign's cut clips are saved.",
      "Every clip for this campaign lands there.",
      clipsDone,
      "pick-clips-folder",
      "Choose folder",
    ),
    campaignItem(
      "length-band",
      "Set the clip length band",
      "Set the shortest, longest and hard maximum length.",
      "The app flags an out-of-band clip before you cut it, not after.",
      hasCampaign && bandIsSet(c),
      "open-campaigns",
      "Edit campaign",
    ),
    campaignItem(
      "id-pattern",
      "Set the clip id pattern",
      "Choose how clips are numbered, such as {prefix}-{videoId}-{nn}.",
      "It names the files and the used-material lines.",
      hasCampaign && patternIsSet(c.clipIdPattern),
      "open-campaigns",
      "Edit campaign",
    ),
  );

  // 6. After cutting. Needs 2 and 3.
  const afterBlockedBy: string[] = [];
  if (!hasCampaign) afterBlockedBy.push("Create a campaign");
  if (!clipsDone) afterBlockedBy.push("Choose the clips folder");
  const afterBlocked = afterBlockedBy.length > 0;
  items.push({
    id: "after-cutting",
    title: "Choose what happens after cutting",
    what: "Nothing, reveal the file, or send it to Final Cut Pro.",
    why: "Saves you dragging every clip into your editor by hand.",
    done: !afterBlocked && s.afterCutting !== null,
    blocked: afterBlocked,
    blockedBy: afterBlockedBy,
    optional: false,
    action: "open-editor-handoff",
    actionLabel: "Choose",
  });

  // 7. Final Cut details: only when 6 is Final Cut. Four sub-items.
  if (hasCampaign && s.afterCutting === "finalcut") {
    const fc = s.finalCut;
    const sub = (
      id: SetupItemId,
      title: string,
      what: string,
      why: string,
      done: boolean,
    ): SetupItem => ({
      id,
      parentId: "after-cutting",
      title,
      what,
      why,
      done,
      blocked: false,
      blockedBy: [],
      optional: false,
      action: "open-editor-handoff",
      actionLabel: "Set",
    });
    const tl = fc.timelineFormat;
    items.push(
      sub(
        "fcp-library",
        "Final Cut library",
        "Name the .fcpbundle the import must land in.",
        "With several libraries open, this aims the import at the right one. The library must already exist.",
        nonEmpty(fc.fcpLibrary),
      ),
      sub(
        "fcp-media-event",
        "Final Cut media event",
        "Name the event that holds the raw clip.",
        "The clip arrives in the event you expect.",
        nonEmpty(fc.mediaEvent),
      ),
      sub(
        "fcp-project-event",
        "Final Cut project event",
        "Name the event where the project is created.",
        "Leave it blank and no project is made.",
        nonEmpty(fc.projectEvent),
      ),
      sub(
        "fcp-timeline",
        "Final Cut timeline format",
        "Pick the size and frame rate of the timeline.",
        "The default is vertical 1080x1920. Getting it wrong means fixing every timeline by hand.",
        tl !== null && tl.width > 0 && tl.height > 0 && nonEmpty(tl.fps),
      ),
    );
  }

  // 8. Channel data folder. Only in a build with the exporter.
  if (s.exporter) {
    const dataDone =
      hasCampaign && nonEmpty(c.dataDir) && s.dataDirConfirmed && !sameDir(c.clipsDir, c.dataDir);
    const dataItem = campaignItem(
      "data-folder",
      "Choose the channel data folder",
      "Pick where exported channel CSVs are saved.",
      "Research data stays apart from your clips.",
      dataDone,
      hasCampaign && nonEmpty(c.dataDir) && !s.dataDirConfirmed ? "confirm-data-folder" : "pick-data-folder",
      hasCampaign && nonEmpty(c.dataDir) && !s.dataDirConfirmed ? "Use suggested folder" : "Choose folder",
    );
    if (hasCampaign && sameDir(c.clipsDir, c.dataDir)) dataItem.note = "Same as the clips folder";
    items.push(dataItem);
  }

  // 9. Clip bank. Optional. Needs a campaign and a loaded video.
  const bankBlockedBy: string[] = [];
  if (!hasCampaign) bankBlockedBy.push("Create a campaign");
  if (!s.videoLoaded) bankBlockedBy.push("Load a video");
  items.push({
    id: "clip-bank",
    title: "Import a clip bank",
    what: "Paste a list of timestamps once and cut from it whenever.",
    why: "Skip re-finding the same moments for every cut.",
    done: bankBlockedBy.length === 0 && s.bankedClips > 0,
    blocked: bankBlockedBy.length > 0,
    blockedBy: bankBlockedBy,
    optional: true,
    action: "open-bank",
    actionLabel: "Open bank",
  });

  return items;
}

/** Progress over required items only (optional ones never count against you). */
export function setupProgress(items: readonly SetupItem[]): { done: number; total: number } {
  const req = items.filter((i) => !i.optional);
  return { done: req.filter((i) => i.done).length, total: req.length };
}
