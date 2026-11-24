/**
 * File: ownerAccess.ts
 * Path: src/main/features/engine/services/channelExport/ownerAccess.ts
 * Description: The server half of the owner gate for the channel exporter's routes.
 */
import { type NextFunction, type Request, type Response } from "express";
import fs from "node:fs";
import path from "node:path";
// @ts-ignore -- plain CommonJS shared with the main process; no type file.
import { hashMachineId, readMachineId } from "../../../../shared/services/machineId.ts";
import { D } from "./channelDeps";

// ---------------------------------------------------------------------------
// Owner gate, server half. The renderer hides the tool from anyone not on the
// build's owner list; that alone leaves the routes live for any local caller.
// This is the same decision made where it cannot be skipped. The machine id is
// read here, in the main process (the server runs inside it), and compared
// against the same salted-hash list the UI uses; nothing but the yes/no ever
// leaves. Fails closed: no list, no salt, or an unreadable id all mean no.
// ---------------------------------------------------------------------------
const ANY_MACHINE = "*";

export function parseOwnerList(raw: string | undefined | null): string[] {
  return String(raw ?? "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

/** Pure decision, mirroring src/renderer/src/shared/utils/ownerGate.ts decideAccess. */
export function decideOwnerAccess(input: {
  list: string[];
  salt: string;
  machineId: string | null;
}): boolean {
  if (input.list.includes(ANY_MACHINE)) return true;
  if (input.list.length === 0 || !input.salt || !input.machineId) return false;
  return input.list.includes(hashMachineId(input.machineId, input.salt));
}

// Literal `process.env.X` reads, so scripts/build-server.cjs can bake the values
// into an owner build (esbuild `define` only matches the literal form). In a
// public build this whole module is replaced by a stub.
function bakedSetting(name: string): string {
  if (name === "VITE_OWNER_MACHINES") return String(process.env.VITE_OWNER_MACHINES ?? "");
  if (name === "VITE_OWNER_SALT") return String(process.env.VITE_OWNER_SALT ?? "");
  return "";
}

function ownerSetting(name: string): string {
  const fromEnv = bakedSetting(name).trim();
  if (fromEnv) return fromEnv;
  // `npm run dev:server` does not load .env. Never in the packaged app.
  if (process.env.ELECTRON_RESOURCES) return "";
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), ".env"), "utf8");
    const line = raw.split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
    return (line ? line.split("=").slice(1).join("=") : "").trim();
  } catch {
    return "";
  }
}

let ownerVerdict: Promise<boolean> | null = null;
export function isOwnerMachine(): Promise<boolean> {
  if (D.isOwnerMachine) return Promise.resolve(D.isOwnerMachine()).catch(() => false);
  if (!ownerVerdict) {
    ownerVerdict = (async () => {
      try {
        const list = parseOwnerList(ownerSetting("VITE_OWNER_MACHINES"));
        const salt = ownerSetting("VITE_OWNER_SALT");
        const machineId = list.includes(ANY_MACHINE) ? null : await readMachineId();
        return decideOwnerAccess({ list, salt, machineId });
      } catch {
        return false;
      }
    })();
  }
  return ownerVerdict;
}

/**
 * Wraps a handler so a non-owner machine sees exactly what an unregistered
 * route gives: Express's own 404, via next(). No message, no hint it exists.
 */
export function ownerOnly(
  handler: (req: Request, res: Response) => unknown,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    void isOwnerMachine().then((ok) => {
      if (!ok) return next();
      return Promise.resolve(handler(req, res)).catch((e) => {
        if (!res.headersSent) res.status(500).json({ error: D.fullErrMessage(e) });
      });
    });
  };
}
