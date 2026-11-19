// Passcode check for the Hobknob Co-Living Academy Deal Analyzer.
// Two passcodes, both kept only in Vercel environment variables, never in the code:
//   ACADEMY_PASSCODE  the permanent one for students who bought the course.
//   TRIAL_PASSCODE    the free trial one. Optional. Leave it unset and there is no trial.
//   TRIAL_ENDS        optional, YYYY-MM-DD. The trial passcode stops working at 12:00 am Eastern on this
//                     date. Defaults to 2027-01-01 (Brian, Nov 2026), so the trial runs through Dec 31, 2026.
// The end date is checked on every visit, so the trial shuts off on its own with no redeploy.
// Changing any of these variables does need a redeploy before Vercel uses the new value.
import { timingSafeEqual, createHash } from "node:crypto";

const DEFAULT_TRIAL_ENDS = "2027-01-01";

const sameText = (a, b) => {
  // Compare hashes so the check takes the same time no matter how much of the guess is right.
  const ha = createHash("sha256").update(String(a)).digest();
  const hb = createHash("sha256").update(String(b)).digest();
  return timingSafeEqual(ha, hb);
};

// Midnight Eastern time (EST or EDT, whichever is in effect) at the start of a YYYY-MM-DD date.
export function easternMidnight(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || "").trim());
  if (!m) return null;
  const [y, mo, d] = [+m[1], +m[2], +m[3]];
  const guess = Date.UTC(y, mo - 1, d, 5); // 12:00 am EST is 5:00 am UTC
  const hourThere = +new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", hourCycle: "h23" }).format(new Date(guess));
  return new Date(guess - hourThere * 3600 * 1000); // in EDT that guess reads 1:00 am, so step back an hour
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Use POST." });
  const student = String(process.env.ACADEMY_PASSCODE || "").trim();
  const trial = String(process.env.TRIAL_PASSCODE || "").trim();
  if (!student) {
    // Fail closed: with no student passcode set, nobody gets in, trial included.
    return res.status(503).json({ ok: false, error: "The analyzer is not set up yet (no passcode configured). Please contact Hobknob Co-Living Academy." });
  }
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const code = String((body && body.code) || "").trim().toLowerCase();

  if (code && sameText(code, student.toLowerCase())) return res.status(200).json({ ok: true, tier: "student" });

  if (code && trial && sameText(code, trial.toLowerCase())) {
    const ends = easternMidnight(process.env.TRIAL_ENDS || DEFAULT_TRIAL_ENDS);
    if (!ends) return res.status(503).json({ ok: false, error: "The trial is not set up correctly. Please contact Hobknob Co-Living Academy." });
    if (Date.now() >= ends.getTime()) return res.status(403).json({ ok: false, expired: true, endsAt: ends.toISOString(), error: "Your free trial has ended." });
    return res.status(200).json({ ok: true, tier: "trial", endsAt: ends.toISOString() });
  }

  // A short pause on a wrong guess slows down anyone trying passcodes one after another.
  await new Promise((r) => setTimeout(r, 700));
  return res.status(401).json({ ok: false, error: "That passcode did not work. Check your course for the current one." });
}
