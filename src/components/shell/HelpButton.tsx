/**
 * File: HelpButton.tsx
 * Path: src/components/shell/HelpButton.tsx
 * Description: The "?" button. ALWAYS the last item top right of the header, on
 *   every screen (BUILD-SPEC section 7). Toggles the help drawer; shortcut ⌘/.
 */
import { IconHelp } from "./icons";

export default function HelpButton({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      id="ui-help-button"
      className="icon-btn"
      onClick={onToggle}
      aria-label="Help"
      aria-pressed={open}
      aria-controls="ui-help-drawer"
      title="Help (⌘/)"
    >
      <IconHelp />
    </button>
  );
}
