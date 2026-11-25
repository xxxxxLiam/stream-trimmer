/**
 * File: fcpLook.fixture.ts
 * Path: src/common/utils/fcpLook.fixture.ts
 * Description: Sample Final Cut XML exports for tests: one project, one clip, with or without a look,
 *   at any FCPXML version. Shaped like what Final Cut writes (File, then Export XML). Test support only.
 */

export interface SampleOptions {
  /** FCPXML version, e.g. "1.10" to "1.13". */
  version?: string;
  /** Children of the <asset-clip>. Omit for a typical look; "" for a clip with none. */
  clipChildren?: string;
  /** Effect resources to write. Omit for the Color Board the typical look uses. */
  effects?: string;
  /** Leave the clip out of the spine altogether. */
  noClip?: boolean;
}

export const TYPICAL_CHILDREN = `
              <adjust-transform scale="1.2 1.2"/>
              <adjust-volume amount="-3dB"/>
              <filter-video ref="r3" name="Color Board">
                <param name="Exposure" key="9999/999166631/999166633/2/999166635" value="0.1"/>
              </filter-video>`;

/** Newer Final Cut writes this for loudness. The bundled 1.10 DTD does not know it, so tests that validate skip it. */
export const LOUDNESS_CHILD = '<adjust-loudness amount="40" uniformity="30"/>';

export const COLOR_BOARD_EFFECT =
  '    <effect id="r3" name="Color Board" uid=".../Color Board" src="/System/Library/Filters/Color Board.moef"/>';

export function sampleExport(o: SampleOptions = {}): string {
  const version = o.version ?? "1.13";
  const children = o.clipChildren ?? TYPICAL_CHILDREN;
  const effects = o.effects ?? COLOR_BOARD_EFFECT;
  const clip = o.noClip
    ? ""
    : children
      ? `<asset-clip ref="r2" offset="0s" name="Clip" duration="300300/30000s" format="r1" tcFormat="NDF">${children}
            </asset-clip>`
      : `<asset-clip ref="r2" offset="0s" name="Clip" duration="300300/30000s" format="r1" tcFormat="NDF"/>`;
  return `<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE fcpxml>
<fcpxml version="${version}">
  <resources>
    <format id="r1" name="FFVideoFormat1080p2997" frameDuration="1001/30000s" width="1920" height="1080" colorSpace="1-1-1 (Rec. 709)"/>
    <asset id="r2" name="Clip" start="0s" duration="300300/30000s" hasVideo="1" format="r1" hasAudio="1" audioSources="1" audioChannels="2" audioRate="48000">
      <media-rep kind="original-media" src="file:///Users/me/Clip.mp4"/>
    </asset>
${effects}
  </resources>
  <library location="file:///Users/me/Movies/Library.fcpbundle/">
    <event name="Look" uid="AAAA">
      <project name="My look" uid="BBBB">
        <sequence format="r1" duration="300300/30000s" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k">
          <spine>
            ${clip}
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>
`;
}
