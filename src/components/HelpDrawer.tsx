/**
 * File: HelpDrawer.tsx
 * Path: src/components/HelpDrawer.tsx
 * Description: Right-side help drawer. Phase A stub: renders nothing.
 * Contract: when open, render <aside id="ui-help-drawer"> as a flex child that is
 *   `w-full md:w-[400px] shrink-0`; when closed, render null. Never an overlay.
 */
export type HelpDrawerProps = { open: boolean; onClose: () => void };

// TODO(B6): replaced by help agent.
export default function HelpDrawer(_props: HelpDrawerProps) {
  return null;
}
