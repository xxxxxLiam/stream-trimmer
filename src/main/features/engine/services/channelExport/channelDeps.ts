/**
 * File: channelDeps.ts
 * Path: src/main/features/engine/services/channelExport/channelDeps.ts
 * Description: What the exporter needs from the engine, handed over once when the routes are registered.
 */
import { type Express, type Response } from "express";
import { type ChildProcess } from "node:child_process";
import { z } from "zod";

/** Everything the exporter needs from server/index.ts, passed in explicitly. */
export interface ChannelDeps {
  app: Express;
  yt: {
    exec: (
      url: string,
      opts: Record<string, unknown>,
      execaOpts?: Record<string, unknown>,
    ) => ChildProcess;
  } | null;
  binariesOk: boolean;
  resolvedFfmpeg: string | null | undefined;
  urlSchema: z.ZodType<string>;
  authSourceSchema: z.ZodType<string>;
  binaryError: (res: Response) => unknown;
  childEnv: () => NodeJS.ProcessEnv;
  appCookieFile: () => string | null;
  resolveCookieOptions: (source: string | undefined) => Record<string, unknown>;
  /**
   * Optional owner check supplied by the host. When absent the server decides
   * from the same VITE_OWNER_MACHINES / VITE_OWNER_SALT the UI is built with.
   */
  isOwnerMachine?: () => boolean | Promise<boolean>;
  parseVtt: (raw: string) => Array<{ start: number; end: number; text: string }>;
  fullErrMessage: (e: unknown) => string;
  logYtError: (
    where: string,
    url: string,
    options: Record<string, unknown>,
    e: unknown,
  ) => void;
}

// Set by registerChannelRoutes before any handler can run.
export let D!: ChannelDeps;

export function setChannelDeps(deps: ChannelDeps): void {
  D = deps;
}
