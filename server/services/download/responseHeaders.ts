/**
 * File: responseHeaders.ts
 * Path: server/services/download/responseHeaders.ts
 * Description: Sets the X-* headers that describe what was delivered and how.
 */
import { DownloadCtx } from "./jobContext";
import { DeliveryReport } from "./qualityCheck";

export function setDeliveryHeaders(ctx: DownloadCtx, report: DeliveryReport): void {
  const { delivered, degraded, lowQuality } = report;
  const { res, quality, segCount, cookieMode, jobId } = ctx;
    if (delivered.height) {
      res.setHeader("X-Delivered-Height", String(delivered.height));
    }
    if (delivered.audioKbps) {
      res.setHeader("X-Delivered-Audio-Kbps", String(delivered.audioKbps));
    }
    if (ctx.chosenFormat) res.setHeader("X-Selected-Format", ctx.chosenFormat);
    if (ctx.availableHeights.length)
      res.setHeader("X-Available-Heights", ctx.availableHeights.join(","));
    res.setHeader("X-Auth-Mode", cookieMode);
    res.setHeader("X-Segments", String(segCount));
    if (ctx.joinMethod) res.setHeader("X-Join-Method", ctx.joinMethod);
    if (lowQuality) {
      res.setHeader("X-Quality-Cause", lowQuality.code);
      res.setHeader("X-Quality-Message", lowQuality.cause);
      res.setHeader("X-Quality-Action", lowQuality.action.id);
    }
    // Both client sets came back degraded. Nothing left to retry, so say so
    // out loud rather than letting a 360p file pass for a 1080p download.
    if (degraded) {
      res.setHeader("X-Quality-Degraded", "1");
      console.error(
        `[server] /api/download still degraded job=${jobId} requested=${quality} delivered=${delivered.height ?? "?"} available=${ctx.availableHeights.join(",") || "unknown"} format=${ctx.chosenFormat || "?"} auth=${cookieMode}`,
      );
    }
    console.log(
      `[server] /api/download built job=${jobId} requested=${quality} delivered=${delivered.height ?? "?"} format=${ctx.chosenFormat || "?"} auth=${cookieMode} segments=${segCount}${ctx.joinMethod ? ` join=${ctx.joinMethod}` : ""}`,
    );
    res.setHeader(
      "Access-Control-Expose-Headers",
      "X-Delivered-Height, X-Delivered-Audio-Kbps, X-Selected-Format, X-Available-Heights, X-Auth-Mode, X-Quality-Degraded, X-Segments, X-Join-Method, X-Quality-Cause, X-Quality-Message, X-Quality-Action",
    );
}
