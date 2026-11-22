/**
 * A-04: the expired-session warning, in the UI.
 *  (a) returning user whose saved cookies.txt has passed its date
 *  (b) importing an already-expired cookies.txt through the real modal button
 *  (c) a cookies.txt whose expiry is a huge number
 *  (d) a session that expires tomorrow (the "expires soon" warning)
 */
const fs = require("node:fs");
const { launchApp } = require("/home/user/stream-trimmer/audit/harness/app.cjs");
const L = require("./lib.cjs");

const sec = (ms) => Math.floor(ms / 1000);

async function chipText(win) {
  return win.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button")).find((x) =>
      /signed in|not signed|expired|checking/i.test(x.textContent || ""),
    );
    return b ? b.textContent.trim().replace(/\s+/g, " ") : null;
  });
}

(async () => {
  // the imported-session probe always says signed_in; browsers never do
  L.stub({ app: { exitCode: 1, stderr: "[debug] Found YouTube account cookies" }, browser: { exitCode: 0 } });

  const a = await launchApp({ label: "A-04-expired", cwd: L.STUB, outDir: `${L.OUT}/A-04` });
  const cookieFile = L.cookieFileOf(a);
  try {
    await a.win.waitForSelector("header", { timeout: 20000 });

    // ---- (a) returning user, saved file expired in 2001 -----------------
    fs.writeFileSync(cookieFile, L.goodCookies({ expires: 1000000000 }), { mode: 0o600 });
    await a.win.reload();
    await a.win.waitForSelector("header", { timeout: 20000 });
    await a.win.waitForTimeout(3500);
    console.log("(a) RETURNING USER, EXPIRED FILE");
    console.log("   dump:", JSON.stringify(await L.dump(a.win)));
    console.log("   chip:", await chipText(a.win));
    console.log("   SHOT", await a.shot("a-returning-expired"));

    // ---- (b) import an already-expired file through the modal button ----
    const past = L.writeFixture("expired-cookies.txt", L.goodCookies({ expires: 1000000000 }));
    await L.stubPicker(a.app, [past]);
    await a.win.click('[role="dialog"] button:has-text("Choose cookies.txt")');
    await a.win.waitForTimeout(4000);
    console.log("(b) IMPORTED AN EXPIRED FILE VIA THE PICKER");
    console.log("   modal still open:", await a.win.evaluate(() => !!document.querySelector('[role="dialog"]')));
    console.log("   dump:", JSON.stringify(await L.dump(a.win)));
    console.log("   chip:", await chipText(a.win));
    console.log("   store:", JSON.stringify(a.readState()));
    console.log("   SHOT", await a.shot("b-imported-expired"));

    // what does the checklist say about sign-in in this state?
    const check = await a.win.evaluate(() => {
      const btn = Array.from(document.querySelectorAll("button")).find(
        (b) => (b.textContent || "").trim() === "Help" || b.getAttribute("aria-label") === "Help",
      );
      btn?.click();
      return Boolean(btn);
    });
    await a.win.waitForTimeout(1200);
    console.log("   help opened:", check);
    console.log(
      "   checklist sign-in row:",
      JSON.stringify(
        await a.win.evaluate(() => {
          const li = document.querySelector('[data-setup-item="sign-in"]');
          return li
            ? { done: li.dataset.done, blocked: li.dataset.blocked, text: li.innerText.replace(/\s+/g, " ").slice(0, 160) }
            : null;
        }),
      ),
    );
    console.log("   SHOT", await a.shot("b-checklist-after-expired-import"));

    // ---- (c) huge expiry ------------------------------------------------
    const huge = L.writeFixture("huge-expiry.txt", L.goodCookies({ expires: 99999999999999 }));
    await L.stubPicker(a.app, [huge]);
    await a.win.evaluate(() => {
      const b = Array.from(document.querySelectorAll("button")).find((x) => /^Help$/.test((x.textContent || "").trim()));
      b?.click();
    });
    await a.win.waitForTimeout(400);
    // re-open modal path: disconnect first so the connect modal returns
    await L.ipc(a.win, "youtube:disconnect");
    await a.win.reload();
    await a.win.waitForSelector("header", { timeout: 20000 });
    await a.win.waitForTimeout(2500);
    fs.writeFileSync(cookieFile, L.goodCookies({ expires: 99999999999999 }), { mode: 0o600 });
    await a.win.reload();
    await a.win.waitForSelector("header", { timeout: 20000 });
    await a.win.waitForTimeout(4000);
    console.log("(c) HUGE EXPIRY");
    console.log("   probe:", JSON.stringify(await L.ipc(a.win, "youtube:probe")));
    console.log("   chip:", await chipText(a.win));
    const tip = await a.win.evaluate(() => {
      const b = Array.from(document.querySelectorAll("button")).find((x) => /signed in|expired/i.test(x.textContent || ""));
      return b ? { title: b.getAttribute("title"), aria: b.getAttribute("aria-label"), text: b.innerText.replace(/\s+/g, " ") } : null;
    });
    console.log("   chip attrs:", JSON.stringify(tip));
    console.log("   SHOT", await a.shot("c-huge-expiry"));
    // the chip's own panel, where the date is printed
    await a.win.evaluate(() => {
      const b = Array.from(document.querySelectorAll("button")).find((x) => /signed in|expired/i.test(x.textContent || ""));
      b?.click();
    });
    await a.win.waitForTimeout(900);
    console.log(
      "   expiry text anywhere on screen:",
      JSON.stringify(
        await a.win.evaluate(() => {
          const t = document.body.innerText;
          return (t.match(/.{0,60}(Invalid Date|expires?|Runs out).{0,60}/gi) || []).slice(0, 8);
        }),
      ),
    );
    console.log("   SHOT", await a.shot("c-huge-expiry-panel"));

    // ---- (d) expires tomorrow -> "expires soon" -------------------------
    fs.writeFileSync(cookieFile, L.goodCookies({ expires: sec(Date.now() + 36 * 3600 * 1000) }), { mode: 0o600 });
    await a.win.reload();
    await a.win.waitForSelector("header", { timeout: 20000 });
    await a.win.waitForTimeout(4000);
    console.log("(d) EXPIRES IN 36 HOURS");
    console.log("   chip:", await chipText(a.win));
    console.log("   SHOT", await a.shot("d-expiring-soon"));
    console.log("MAIN LOG:", a.logs.stdout.join("").split("\n").filter((l) => /youtube|auth/.test(l)).slice(-14).join("\n"));
  } finally {
    await a.close();
  }
})();
