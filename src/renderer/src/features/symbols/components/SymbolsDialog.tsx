/**
 * File: SymbolsDialog.tsx
 * Path: src/renderer/src/features/symbols/components/SymbolsDialog.tsx
 * Description: Symbols and phrases inside the app window, for the browser build that cannot open the
 *   separate always-on-top window. It is the same content, in the shared centred dialog.
 */
import CentredDialog from "../../../shared/components/CentredDialog";
import SymbolsWindow from "./SymbolsWindow";

export default function SymbolsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <CentredDialog open={open} onClose={onClose} title="Symbols and phrases" widthClass="max-w-[396px]" id="ui-symbols-dialog">
      <SymbolsWindow />
    </CentredDialog>
  );
}
