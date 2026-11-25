/**
 * File: useHelpController.ts
 * Path: src/renderer/src/features/help/hooks/useHelpController.ts
 * Description: The one hook HelpDrawer calls. Holds the view (questions, one answer, shortcuts,
 *   report, sign in, about), the search text and the report note; opens on the sign-in page when the
 *   footer pill asks; closes on Escape; and hands focus back to the Help button on close.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { searchHelp } from "../utils/helpSearch";
import { HELP_ANSWERS, type HelpMoreId } from "../utils/helpContent";
import { useReportMutations } from "./useReportMutations";

export type HelpView = { kind: "top" } | { kind: "answer"; id: string } | { kind: "shortcuts" } | { kind: "report" } | { kind: "about" };

export function useHelpController({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [view, setView] = useState<HelpView>({ kind: "top" });
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  const report = useReportMutations();
  const reportRef = useRef(report);
  reportRef.current = report;

  useEffect(() => {
    if (!open) return;
    // A report that finished while Help was closed is shown first, so its result is never lost.
    setView(reportRef.current.unseen && reportRef.current.state !== "writing" ? { kind: "report" } : { kind: "top" });
    setQuery("");
  }, [open]);

  // Looking at the result is seeing it.
  useEffect(() => {
    if (open && view.kind === "report" && report.state !== "writing") report.markSeen();
  }, [open, view.kind, report.state]);

  // Escape closes Help (the drawer blocks nothing, so this is the keyboard way out).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const results = useMemo(() => searchHelp(query), [query]);
  const answer = view.kind === "answer" ? (HELP_ANSWERS.find((a) => a.id === view.id) ?? null) : null;

  const openMore = (id: HelpMoreId) => {
    if (id === "shortcuts") setView({ kind: "shortcuts" });
    else if (id === "report") {
      // A note that has not been sent yet stays; only a finished report starts the page empty again.
      if (report.state !== "writing") {
        report.reset();
        setNote("");
      }
      setView({ kind: "report" });
    } else if (id === "about") setView({ kind: "about" });
  };

  // The note goes with the report; the next time Report a problem opens it is empty again.
  const sendReport = async () => {
    await report.send(note);
    setNote("");
  };

  return {
    view,
    sendReport,
    top: () => setView({ kind: "top" }),
    openAnswer: (id: string) => setView({ kind: "answer", id }),
    openMore,
    query,
    setQuery,
    results,
    answer,
    note,
    setNote,
    report,
  };
}
