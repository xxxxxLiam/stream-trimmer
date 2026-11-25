/**
 * File: ChannelButton.tsx
 * Path: src/renderer/src/features/channelExport/components/ChannelButton.tsx
 * Description: The owner build's top-bar icon, next to Panels, that opens Channel data. Rendered only
 *   when CHANNEL_DATA_BUILT, so a public build drops it with the rest of the exporter.
 */
import { PersonVideo2 } from "react-bootstrap-icons";
import { glyph } from "../../../shared/components/icons";

const Channel = glyph(PersonVideo2);

export default function ChannelButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button type="button" id="ui-channel-data" className="icon-btn" aria-label="Channel data" title="Channel data" aria-pressed={open} onClick={onToggle}>
      <Channel />
      {open ? <span className="icon-label ml-[8px] text-body">Channel data</span> : null}
    </button>
  );
}
