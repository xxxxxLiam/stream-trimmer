/**
 * File: panelRegistrations.ts
 * Path: src/renderer/src/modules/layout/utils/panelRegistrations.ts
 * Description: Pulls in each feature's panels file, which registers its panels with
 *   registerPanel() when imported. The order here is the order of the tabs. A new feature adds
 *   one line; replacing a panel means editing that feature's own panels file, nothing here.
 */
import "../../../features/transcript/panels"; // Videos | Transcript | Markers  (left)
import "../../../features/clips/panels"; // Export | History  (right)
import "../../../features/player/panels"; // Preview | Timeline  (centre)
