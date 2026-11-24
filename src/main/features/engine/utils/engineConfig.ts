/**
 * File: engineConfig.ts
 * Path: src/main/features/engine/utils/engineConfig.ts
 * Description: Engine-wide constants: the listen port and the longest clip it will cut.
 */


export const PORT = Number(process.env.PORT || 5174);
export const MAX_CLIP_SECONDS = 600;
