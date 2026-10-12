// Relays one attendance submission to the Apps Script "Attendance" web app.
//
// The form at the Apps Script URL works like this: the page calls
//   google.script.run.submitStudentAttendance(ug, otp)
// which is really just a form POST to /callback on the same deployment.
// We replay that request directly, so no headless browser is needed.

const DEPLOYMENT_ID = "AKfycbzDBQiJ1ibYdBvFMAtZPU-YfEoWlFAxybctQ8KU_trhm3GX4ZYoamIWlMl7gMz1mS5l";
const EXEC_URL = `https://script.google.com/macros/s/${DEPLOYMENT_ID}/exec`;
const CALLBACK_URL = `https://script.google.com/macros/s/${DEPLOYMENT_ID}/callback`;
const SERVER_FN = "submitStudentAttendance";
const CALL_TIMEOUT_MS = 45_000;

export const config = { maxDuration: 60 };

// The reply looks like:
//   )]}'
//
//   [["op.exec",[0,"\"Incorrect OTP.\""]],["di",563]]
// op.exec[0] is the status (0 = the function returned; anything else = it threw)
// and op.exec[1] is the function's return value JSON-encoded.
function parseReply(raw) {
  const start = raw.indexOf("[");
  if (start < 0) return null;
  let rows;
  try {
    rows = JSON.parse(raw.slice(start));
  } catch {
    return null;
  }
  const exec = rows.find((r) => Array.isArray(r) && r[0] === "op.exec");
  if (!exec || !Array.isArray(exec[1])) return null;
  const [status, resultRaw] = exec[1];
  let result;
  try {
    result = JSON.parse(resultRaw);
  } catch {
    result = resultRaw;
  }
  return { status, result };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only" });
    return;
  }
  const { ug, otp } = req.body || {};
  if (typeof ug !== "string" || typeof otp !== "string" || !ug.trim() || !otp.trim()) {
    res.status(400).json({ ug: String(ug ?? ""), reached: false, msg: "missing ug or otp" });
    return;
  }

  // Exactly the payload google.script.run sends:
  // [functionName, json(parameters), null, [0], null, null, 1, 0]
  const payload = [SERVER_FN, JSON.stringify([ug.trim(), otp.trim()]), null, [0], null, null, 1, 0];
  const body = new URLSearchParams({ request: JSON.stringify(payload) }).toString();

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
    const r = await fetch(`${CALLBACK_URL}?nocache_id=${Date.now() % 100000}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        "X-Same-Domain": "1",
        Referer: EXEC_URL,
        Origin: "https://script.google.com",
      },
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);

    const reply = parseReply(await r.text());
    if (!reply) {
      res.status(200).json({ ug, reached: false, msg: `no reply (unexpected response ${r.status})` });
      return;
    }
    if (reply.status !== 0) {
      // The server function threw: same as the browser's failure handler.
      const msg = typeof reply.result === "string" ? reply.result : JSON.stringify(reply.result);
      res.status(200).json({ ug, reached: false, msg });
      return;
    }
    res.status(200).json({ ug, reached: true, msg: String(reply.result) });
  } catch (e) {
    const reason = e && e.name === "AbortError" ? "timeout" : (e && e.message) || String(e);
    res.status(200).json({ ug, reached: false, msg: `no reply (${reason})` });
  }
}
