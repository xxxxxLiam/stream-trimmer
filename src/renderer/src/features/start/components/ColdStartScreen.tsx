/**
 * File: ColdStartScreen.tsx
 * Path: src/renderer/src/features/start/components/ColdStartScreen.tsx
 * Description: Connects ColdStart to the clipper context. Shown while no video is open.
 */
import ColdStart from "./ColdStart";
import { useStartController } from "../hooks/useStartController";

export default function ColdStartScreen() {
  return <ColdStart {...useStartController()} />;
}
