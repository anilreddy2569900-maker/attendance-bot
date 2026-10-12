/* Attendance — bulk submit.
 * Port of bulk_submit.py: same column detection, same UG/26/ prefixing,
 * same OK / FAIL / ERROR / CHECK classification, same retry behaviour.
 * Submissions go through /api/submit (one student per request, 4 at a time).
 */

"use strict";

// ---------------------------------------------------------------- constants
const UG_RE = /^UG\/\d+\/\d+$/;
const BARE_RE = /^\d+$/;
const PREFIX_DEFAULT = "UG/26/";
const CONCURRENCY = 4;
const STORAGE_KEY = "attendance-bot.students.v1";

// OK    = server accepted it ("Attendance marked successfully", "Already marked")
// FAIL  = server answered but rejected ("Incorrect OTP.", "Invalid UG number")
// ERROR = never got an answer (network down, timeout) - safe to retry
// CHECK = server answered something we don't recognise - look at it yourself
const FAIL_RE = /\b(incorrect|invalid|wrong|expired|error|not|fail\w*|denied|closed|unauthori[sz]ed|exceed\w*|limit)\b|please enter/i;
const OK_RE = /\b(success\w*|marked|submitted|recorded|saved|already|present|done)\b/i;

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- state
let students = [];            // [{ug, name}]
let results = new Map();      // ug -> {ug, name, status, msg, otp, attempts}
let running = false;

// ---------------------------------------------------------------- helpers
function norm(v) {
  if (v === null || v === undefined) return "";
  let s = String(v).replace(/\s+/g, "").toUpperCase();
  if (s.endsWith(".0") && /^\d+\.0$/.test(s)) s = s.slice(0, -2);
  return s;
}

function isHeader(v) {
  const s = norm(v);
  return s.includes("UG") && !/\d/.test(s);
}

function short(e) {
  const s = String((e && e.message) || e || e.constructor.name).trim().split("\n")[0];
  return s.slice(0, 120);
}

function classify(reached, msg) {
  if (!reached) return "ERROR";
  if (FAIL_RE.test(msg)) return "FAIL";
  if (OK_RE.test(msg)) return "OK";
  return "CHECK";
}

// ---------------------------------------------------------------- student list
function bestColumn(rows, test) {
  // The column with the most matches wins. On a tie, the column with the
  // longer values wins (so UG numbers beat a 1, 2, 3... serial-number column).
  const counts = new Map();
  const sizes = new Map();
  for (const r of rows) {
    r.forEach((v, i) => {
      const s = norm(v);
      if (test(s)) {
        counts.set(i, (counts.get(i) || 0) + 1);
        sizes.set(i, (sizes.get(i) || 0) + s.length);
      }
    });
  }
  let best = null, bestN = 0, bestSize = 0;
  for (const [i, n] of counts) {
    const size = sizes.get(i);
    if (n > bestN || (n === bestN && size > bestSize)) { best = i; bestN = n; bestSize = size; }
  }
  return best;
}

function loadStudents(rows) {
  // Finds the UG column automatically: first a column of full IDs like
  // UG/26/12345, otherwise the column headed "UG ..." or the column of plain
  // numbers like 20292 (bare). The name is the first other text cell on the row.
  let ugCol = bestColumn(rows, (v) => UG_RE.test(v));
  const bare = ugCol === null;
  const warnings = [];

  if (bare) {
    let headerCol = null;
    for (const r of rows.slice(0, 3)) {
      r.forEach((v, i) => {
        if (headerCol === null && isHeader(v)) headerCol = i;
      });
    }
    ugCol = headerCol !== null ? headerCol : bestColumn(rows, (v) => BARE_RE.test(v));
  }
  if (ugCol === null) {
    throw new Error("Couldn't find a UG column (expected values like UG/26/12345 or 20292).");
  }
  const valid = bare ? BARE_RE : UG_RE;
  const prefix = bare ? PREFIX_DEFAULT : "";
  const seen = new Set();
  const out = [];

  for (const r of rows) {
    const raw = ugCol < r.length ? r[ugCol] : null;
    const ug = norm(raw);
    if (!ug || isHeader(raw)) continue;                 // blank cell or header row
    if (!valid.test(ug)) {
      warnings.push(`skipping row, UG value looks wrong: ${JSON.stringify(raw == null ? "" : String(raw))}`);
      continue;
    }
    const full = prefix + ug;
    if (seen.has(full)) {
      warnings.push(`skipping duplicate: ${full}`);
      continue;
    }
    seen.add(full);
    const name = r
      .filter((v, i) => i !== ugCol && v !== null && v !== undefined && v !== "" && !/^\d+$/.test(norm(v)))
      .map((v) => String(v).trim())
      .join(" ");
    out.push({ ug: full, name });
  }
  return { students: out, warnings };
}

// ---------------------------------------------------------------- input sources
async function readRows(file) {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  if (ext === "txt") {
    const text = await file.text();
    return text
      .split(/\r?\n/)
      .filter((l) => l.trim())
      .map((l) => l.trim().split(/\t|,|\s{2,}|\s+/));
  }
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, blankrows: false, defval: null });
}

let lastWarnings = [];
let lastSource = "";

function adoptList(parsed, source) {
  // Adds to whatever is already loaded — an uploaded file or pasted text
  // never wipes the list you already have.
  const seen = new Set(students.map((s) => s.ug));
  const warnings = parsed.warnings.slice();
  let added = 0;
  for (const s of parsed.students) {
    if (seen.has(s.ug)) {
      warnings.push(`already in the list, skipping: ${s.ug}`);
      continue;
    }
    seen.add(s.ug);
    students.push(s);
    added++;
  }
  saveList();
  renderPreview(warnings, source ? `${added} added · ${source}` : source);
  renderResults();
  updateRunState();
}

function removeStudent(ug) {
  students = students.filter((s) => s.ug !== ug);
  results.delete(ug);
  saveList();
  renderPreview(lastWarnings, lastSource);
  renderResults();
  updateRunState();
}

function renderPreview(warnings, source) {
  lastWarnings = warnings;
  lastSource = source || "";
  const wrap = $("previewWrap");
  wrap.hidden = students.length === 0 && warnings.length === 0;
  $("clearList").hidden = wrap.hidden;
  $("count").textContent =
    `${students.length} student${students.length === 1 ? "" : "s"} loaded` + (source ? ` · ${source}` : "");

  const ul = $("preview");
  ul.innerHTML = "";
  for (const s of students.slice(0, 200)) {
    const li = document.createElement("li");
    const ug = document.createElement("span");
    ug.className = "ug";
    ug.textContent = s.ug;
    const nm = document.createElement("span");
    nm.className = "nm";
    nm.textContent = s.name;
    const del = document.createElement("button");
    del.className = "del";
    del.type = "button";
    del.textContent = "×";
    del.title = `Remove ${s.ug}`;
    del.setAttribute("aria-label", `Remove ${s.ug}`);
    del.addEventListener("click", () => removeStudent(s.ug));
    li.append(ug, nm, del);
    ul.appendChild(li);
  }
  $("warnings").innerHTML = "";
  for (const w of warnings.slice(0, 20)) {
    const d = document.createElement("div");
    d.textContent = `! ${w}`;
    $("warnings").appendChild(d);
  }
}

function saveList() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(students));
  } catch (_) { /* private mode etc. */ }
}

function loadSavedList() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (Array.isArray(saved) && saved.length) {
      students = saved;
      const g = $("guide");
      if (g) g.open = false;       // returning user: the list is already there
      renderPreview([], "saved on this device — upload again only to change it");
      updateRunState();
    }
  } catch (_) { /* ignore */ }
}

// ---------------------------------------------------------------- running
function updateRunState() {
  const otpOk = $("otp").value.trim().length > 0;
  $("run").disabled = running || students.length === 0 || !otpOk;
  $("run").textContent = running ? "Running…" : "Run";
  $("runHint").textContent =
    students.length === 0
      ? "Load a student list first."
      : otpOk
        ? `Ready: ${students.length} student${students.length === 1 ? "" : "s"} will be submitted.`
        : "Type the OTP to enable Run.";
}

async function submitOne(ug, otp) {
  try {
    const r = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ug, otp }),
    });
    const data = await r.json();
    const reached = Boolean(data.reached);
    return { reached, msg: String(data.msg ?? `unexpected reply (HTTP ${r.status})`) };
  } catch (e) {
    return { reached: false, msg: `no reply (${short(e)})` };
  }
}

async function runQueue(ugs, otp) {
  const queue = ugs.slice();
  const total = queue.length;
  let done = 0;

  async function worker() {
    while (queue.length) {
      const ug = queue.shift();
      const { reached, msg } = await submitOne(ug, otp);
      const prev = results.get(ug);
      results.set(ug, {
        ug,
        name: (students.find((s) => s.ug === ug) || {}).name || (prev && prev.name) || "",
        status: classify(reached, msg),
        msg,
        otp,
        attempts: (prev && prev.attempts ? prev.attempts : 0) + 1,
      });
      done++;
      renderResults(done, total);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, worker));
}

async function run(only) {
  const otp = $("otp").value.trim();
  if (running || !otp) return;
  running = true;
  updateRunState();
  $("resultsCard").hidden = false;

  const ugs = (only || students.map((s) => s.ug)).filter((u) => students.some((s) => s.ug === u) || results.has(u));
  for (const ug of ugs) {
    if (!results.has(ug)) {
      results.set(ug, { ug, name: (students.find((s) => s.ug === ug) || {}).name || "", status: "WORKING", msg: "Sending…", otp, attempts: 0 });
    } else {
      const r = results.get(ug);
      results.set(ug, { ...r, status: "WORKING", msg: "Sending…" });
    }
  }
  renderResults(0, ugs.length);

  const t0 = performance.now();
  await runQueue(ugs, otp);
  running = false;
  updateRunState();
  renderResults(ugs.length, ugs.length, (performance.now() - t0) / 1000);
}

// ---------------------------------------------------------------- results UI
function counts() {
  const c = { OK: 0, FAIL: 0, ERROR: 0, CHECK: 0, WORKING: 0 };
  for (const r of results.values()) c[r.status] = (c[r.status] || 0) + 1;
  return c;
}

function renderResults(done, total, seconds) {
  const c = counts();
  const finished = c.OK + c.FAIL + c.ERROR + c.CHECK;
  const parts = [
    `<span class="chip s-ok">OK ${c.OK}</span>`,
    `<span class="chip s-fail">FAIL ${c.FAIL}</span>`,
    `<span class="chip s-error">ERROR ${c.ERROR}</span>`,
    `<span class="chip s-check">CHECK ${c.CHECK}</span>`,
  ];
  if (total !== undefined && done < total) parts.push(`<span class="chip">sending ${done}/${total}…</span>`);
  else if (seconds !== undefined) parts.push(`<span class="chip">${finished} done in ${seconds.toFixed(1)}s</span>`);
  $("summary").innerHTML = parts.join("");

  const tb = $("results");
  tb.innerHTML = "";
  for (const s of students) {
    const r = results.get(s.ug);
    if (!r) continue;
    const tr = document.createElement("tr");
    if (r.status === "WORKING") tr.className = "working";
    tr.innerHTML =
      `<td><span class="pill s-${r.status.toLowerCase()}">${r.status === "WORKING" ? "…" : r.status}</span></td>` +
      `<td class="ug">${escapeHtml(r.ug)}</td>` +
      `<td>${escapeHtml(r.name)}</td>` +
      `<td class="msg">${escapeHtml(r.msg)}</td>`;
    tb.appendChild(tr);
  }
  // students not in the main list (e.g. pasted, then list replaced) still show
  for (const r of results.values()) {
    if (students.some((s) => s.ug === r.ug)) continue;
    const tr = document.createElement("tr");
    tr.innerHTML =
      `<td><span class="pill s-${r.status.toLowerCase()}">${r.status === "WORKING" ? "…" : r.status}</span></td>` +
      `<td class="ug">${escapeHtml(r.ug)}</td>` +
      `<td>${escapeHtml(r.name)}</td>` +
      `<td class="msg">${escapeHtml(r.msg)}</td>`;
    tb.appendChild(tr);
  }

  const failed = [...results.values()].filter((r) => r.status === "FAIL" || r.status === "ERROR").length;
  $("retry").hidden = failed === 0 || running;
  $("csv").hidden = results.size === 0;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------------------------------------------------------------- CSV
function downloadCsv() {
  const rows = [...results.values()];
  const cols = ["ug", "name", "status", "msg", "otp", "attempts"];
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const text = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\r\n");
  const stamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  a.download = `results_${stamp}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------------------------------------------------------------- events
$("browse").addEventListener("click", () => $("file").click());
$("file").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    adoptList(loadStudents(await readRows(f)), f.name);
  } catch (err) {
    renderPreview([`Can't read ${f.name}: ${short(err)}`], "");
  }
  e.target.value = "";
});

const drop = $("drop");
["dragenter", "dragover"].forEach((ev) =>
  drop.addEventListener(ev, (e) => {
    e.preventDefault();
    drop.classList.add("over");
  })
);
["dragleave", "drop"].forEach((ev) =>
  drop.addEventListener(ev, (e) => {
    e.preventDefault();
    drop.classList.remove("over");
  })
);
drop.addEventListener("drop", async (e) => {
  const f = e.dataTransfer.files[0];
  if (!f) return;
  try {
    adoptList(loadStudents(await readRows(f)), f.name);
  } catch (err) {
    renderPreview([`Can't read ${f.name}: ${short(err)}`], "");
  }
});

$("pasteBtn").addEventListener("click", () => {
  try {
    const rows = $("paste").value
      .split(/\r?\n/)
      .filter((l) => l.trim())
      .map((l) => l.trim().split(/\t|,|\s{2,}|\s+/));
    if (!rows.length) return;
    adoptList(loadStudents(rows), "pasted text");
  } catch (err) {
    renderPreview([short(err)], "");
  }
});

$("clearList").addEventListener("click", () => {
  students = [];
  results.clear();
  saveList();
  renderPreview([], "");
  renderResults();
  updateRunState();
  $("resultsCard").hidden = true;
});

$("otp").addEventListener("input", updateRunState);
$("otp").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !$("run").disabled) run();
});
$("run").addEventListener("click", () => run());
$("retry").addEventListener("click", () => {
  const ugs = [...results.values()].filter((r) => r.status === "FAIL" || r.status === "ERROR").map((r) => r.ug);
  if (ugs.length) run(ugs);
});
$("csv").addEventListener("click", downloadCsv);

// ---------------------------------------------------------------- boot
loadSavedList();
updateRunState();
