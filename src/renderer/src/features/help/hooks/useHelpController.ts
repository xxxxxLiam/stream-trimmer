/**
 * File: useHelpController.ts
 * Path: src/renderer/src/features/help/hooks/useHelpController.ts
 * Description: The one hook HelpDrawer calls. Holds the view (questions, one answer, shortcuts,
 *   report, sign in, about), the search text and the report note; opens on the sign-in page when the
 *   footer pill asks; closes on Escape; and hands focus back to the Help button on close.
 */
import { useEffect, useMemo, useState } from "react";
import { searchHelp } from "../utils/helpSearch";
import { HELP_ANSWERS, type HelpMoreId } from "../utils/helpContent";
import { useReportMutations } from "./useReportMutations";
import { useCookieDropMutations } from "./useCookieDropMutations";

export type HelpView = { kind: "top" } | { kind: "answer"; id: string } | { kind: "shortcuts" } | { kind: "report" } | { kind: "signin" } | { kind: "about" };

export function useHelpController({ open, onClose, startAt }: { open: boolean; onClose: () => void; startAt: "signin" | null }) {
  const [view, setView] = useState<HelpView>({ kind: "top" });
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  const report = useReportMutations();
  const cookies = useCookieDropMutations();

  useEffect(() => {
    if (!open) return;
    setView(startAt === "signin" ? { kind: "signin" } : { kind: "top" });
    setQuery("");
  }, [open, startAt]);

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
      report.reset();
      setView({ kind: "report" });
    } else if (id === "about") setView({ kind: "about" });
  };

  return {
    view,
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
    cookies,
  };
}
