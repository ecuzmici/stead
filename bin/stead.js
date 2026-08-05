#!/usr/bin/env node
"use strict";
// stead — deterministic attestor for GUARANTEES.md. Implements FORMAT.md v0.1.
// No network. No LLM calls. Zero dependencies.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const STATUSES = ["HOLDS", "ENFORCED", "CHECKED", "SAMPLED", "TRUSTED", "OPEN", "BROKEN"];
const ANCHOR_TIERS = ["HOLDS", "ENFORCED", "CHECKED", "SAMPLED"];
const STATUS_WIDTH = Math.max(...STATUSES.map((s) => s.length));

// ---------- parsing ----------

const G_LINE = /^([A-Z]+\d+)\s{2,}(.+?)\s{2,}([A-Z]+)(\s+given\s+(T\d+(?:\s*,\s*T\d+)*))?\s*$/;
const T_LINE = /^(T\d+)\s{2,}(.+?)\s*$/;

function parseGuarantees(text) {
  const lines = text.split("\n");
  const doc = { title: null, guarantees: [], givens: [], outOfScope: [], errors: [] };
  let section = "top"; // top | given | scope
  lines.forEach((line, i) => {
    const n = i + 1;
    if (/^#\s/.test(line) && section === "top" && doc.title === null) {
      doc.title = line;
      return;
    }
    if (/^##\s+Given\s*$/i.test(line)) { section = "given"; return; }
    if (/^##\s+Out of scope\s*$/i.test(line)) { section = "scope"; return; }
    if (/^##\s/.test(line)) { doc.errors.push(`line ${n}: unknown section "${line.trim()}"`); return; }
    if (line.trim() === "") return;

    if (section === "top") {
      const m = G_LINE.exec(line);
      if (!m) { doc.errors.push(`line ${n}: not a guarantee line: "${line.trim()}"`); return; }
      const [, id, text_, status, , refs] = m;
      if (!STATUSES.includes(status)) doc.errors.push(`line ${n}: unknown status "${status}"`);
      doc.guarantees.push({
        id, text: text_, status, lineIndex: i,
        givenRefs: refs ? refs.split(/\s*,\s*/) : [],
      });
    } else if (section === "given") {
      const m = T_LINE.exec(line);
      if (!m) { doc.errors.push(`line ${n}: not a Given line: "${line.trim()}"`); return; }
      doc.givens.push({ id: m[1], text: m[2] });
    } else {
      doc.outOfScope.push(line);
    }
  });
  if (doc.title === null) doc.errors.push("missing title line (# GUARANTEES — <project>)");
  doc.lines = lines;
  return doc;
}

// ---------- validation ----------

function validate(doc, anchors) {
  const errors = [...doc.errors];
  const gIds = new Set();
  for (const g of doc.guarantees) {
    if (gIds.has(g.id)) errors.push(`duplicate guarantee id ${g.id}`);
    gIds.add(g.id);
  }
  const tIds = new Set(doc.givens.map((t) => t.id));
  const referenced = new Set();
  for (const g of doc.guarantees) {
    for (const r of g.givenRefs) {
      if (!tIds.has(r)) errors.push(`${g.id} references undefined Given ${r}`);
      referenced.add(r);
    }
  }
  for (const t of doc.givens) {
    if (!referenced.has(t.id)) errors.push(`Given ${t.id} is referenced by no guarantee`);
  }
  for (const [id, a] of Object.entries(anchors.anchors || {})) {
    if (!gIds.has(id)) errors.push(`orphan anchor: ${id} has no guarantee line`);
    if (!["check", "files", "trusted"].includes(a.kind)) {
      errors.push(`anchor ${id}: unknown kind "${a.kind}"`);
      continue;
    }
    if (a.kind === "trusted") {
      if (a.tier) errors.push(`anchor ${id}: "trusted" anchors must not declare a tier`);
      const g = doc.guarantees.find((x) => x.id === id);
      if (g && g.givenRefs.length === 0) errors.push(`${id}: trusted guarantee has no "given" refs`);
    } else {
      if (!ANCHOR_TIERS.includes(a.tier)) errors.push(`anchor ${id}: tier must be one of ${ANCHOR_TIERS.join("/")}`);
      if (a.kind === "check" && typeof a.cmd !== "string") errors.push(`anchor ${id}: kind "check" requires "cmd"`);
      if (a.kind === "files" && !a.files) errors.push(`anchor ${id}: kind "files" requires "files"`);
      if (a.llm_behavior === true && ANCHOR_TIERS.indexOf(a.tier) < ANCHOR_TIERS.indexOf("SAMPLED")) {
        errors.push(`anchor ${id}: LLM-behavior guarantees can never exceed SAMPLED (FORMAT.md §2)`);
      }
    }
  }
  return errors;
}

// ---------- evidence ----------

function sha256(filePath) {
  return "sha256:" + crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function runAnchor(id, anchor, root, notes) {
  if (!anchor) return "OPEN";
  if (anchor.kind === "trusted") return "TRUSTED";
  let ok = true;
  if (anchor.files) {
    for (const [rel, want] of Object.entries(anchor.files)) {
      const p = path.join(root, rel);
      if (!fs.existsSync(p)) { ok = false; notes.push(`${id}: lost anchor — missing file ${rel}`); continue; }
      const got = sha256(p);
      if (got !== want) { ok = false; notes.push(`${id}: hash mismatch for ${rel}`); }
    }
  }
  if (ok && anchor.kind === "check") {
    const r = spawnSync(anchor.cmd, { shell: true, cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    if (r.status !== 0) {
      ok = false;
      const tail = ((r.stderr || "").toString() + (r.stdout || "").toString()).trim().split("\n").slice(-3).join(" | ");
      notes.push(`${id}: check failed (exit ${r.status})${tail ? " — " + tail : ""}`);
    }
  }
  return ok ? anchor.tier : "BROKEN";
}

// ---------- rewriting ----------

function rewriteStatusColumn(doc, computed) {
  const lines = [...doc.lines];
  for (const g of doc.guarantees) {
    const status = computed.get(g.id);
    const line = lines[g.lineIndex];
    const m = G_LINE.exec(line);
    const [, id, text, , , refs] = m;
    // Reconstruct, preserving the original gap before the status column
    // and padding the status so any "given" suffix stays aligned.
    const prefix = line.slice(0, line.indexOf(m[3], id.length + text.length));
    const suffix = refs ? "  given " + refs : "";
    lines[g.lineIndex] = prefix + (refs ? status.padEnd(STATUS_WIDTH) : status) + suffix;
  }
  return lines.join("\n");
}

// ---------- output ----------

const useColor = process.stdout.isTTY && !("NO_COLOR" in process.env);
const COLORS = {
  HOLDS: "\x1b[32m", ENFORCED: "\x1b[32m", CHECKED: "\x1b[36m", SAMPLED: "\x1b[36m",
  TRUSTED: "\x1b[33m", OPEN: "\x1b[33m", BROKEN: "\x1b[31m",
};
function paint(status) {
  return useColor ? COLORS[status] + status + "\x1b[0m" : status;
}

function printTable(doc, computed) {
  if (doc.title) console.log(doc.title.replace(/^#\s*/, "") + "\n");
  const idW = Math.max(...doc.guarantees.map((g) => g.id.length), 2);
  const txtW = Math.max(...doc.guarantees.map((g) => g.text.length), 4);
  for (const g of doc.guarantees) {
    const status = computed.get(g.id);
    const given = g.givenRefs.length ? "  given " + g.givenRefs.join(", ") : "";
    console.log(
      `${g.id.padEnd(idW)}  ${g.text.padEnd(txtW)}  ${paint(status).padEnd(useColor ? STATUS_WIDTH + 9 : STATUS_WIDTH)}${given}`
    );
  }
  if (doc.givens.length) {
    console.log("\nGiven");
    for (const t of doc.givens) console.log(`  ${t.id}  ${t.text}`);
  }
  if (doc.outOfScope.length) {
    console.log("\nOut of scope\n  " + doc.outOfScope.join("\n  "));
  }
}

// ---------- commands ----------

function load(root) {
  const gPath = path.join(root, "GUARANTEES.md");
  const aPath = path.join(root, ".stead", "anchors.json");
  if (!fs.existsSync(gPath)) fail(`no GUARANTEES.md in ${root} (run "stead init")`);
  const doc = parseGuarantees(fs.readFileSync(gPath, "utf8"));
  let anchors = { version: 1, anchors: {} };
  if (fs.existsSync(aPath)) {
    try { anchors = JSON.parse(fs.readFileSync(aPath, "utf8")); }
    catch (e) { fail(`.stead/anchors.json is not valid JSON: ${e.message}`); }
  }
  return { doc, anchors, gPath };
}

function compute(doc, anchors, root, notes) {
  const computed = new Map();
  for (const g of doc.guarantees) {
    computed.set(g.id, runAnchor(g.id, (anchors.anchors || {})[g.id], root, notes));
  }
  return computed;
}

function cmdCheck(root) {
  const { doc, anchors, gPath } = load(root);
  const errors = validate(doc, anchors);
  if (errors.length) {
    for (const e of errors) console.error("error: " + e);
    process.exit(2);
  }
  const notes = [];
  const computed = compute(doc, anchors, root, notes);
  const rewritten = rewriteStatusColumn(doc, computed);
  const original = doc.lines.join("\n");
  if (rewritten !== original) {
    fs.writeFileSync(gPath, rewritten);
    for (const g of doc.guarantees) {
      const now = computed.get(g.id);
      if (now !== g.status) console.log(`${g.id}: ${g.status} -> ${now}`);
    }
  }
  for (const n of notes) console.error("note: " + n);
  const broken = [...computed.values()].filter((s) => s === "BROKEN").length;
  console.log(broken === 0 ? "stead check: ok" : `stead check: ${broken} BROKEN`);
  process.exit(broken === 0 ? 0 : 1);
}

function cmdStatus(root) {
  const { doc, anchors } = load(root);
  const errors = validate(doc, anchors);
  if (errors.length) {
    for (const e of errors) console.error("error: " + e);
    process.exit(2);
  }
  const notes = [];
  const computed = compute(doc, anchors, root, notes);
  printTable(doc, computed);
  for (const n of notes) console.error("note: " + n);
  process.exit([...computed.values()].includes("BROKEN") ? 1 : 0);
}

function cmdInit(root) {
  const name = path.basename(path.resolve(root));
  const gPath = path.join(root, "GUARANTEES.md");
  if (fs.existsSync(gPath)) fail(`${gPath} already exists`);
  fs.mkdirSync(path.join(root, ".stead"), { recursive: true });
  for (const d of ["tickets", "lemmas", "failures", "transcripts", "decisions"]) {
    fs.mkdirSync(path.join(root, "machine", d), { recursive: true });
    fs.writeFileSync(path.join(root, "machine", d, ".gitkeep"), "");
  }
  fs.writeFileSync(
    gPath,
    `# GUARANTEES — ${name}\n\nG1  <state the first promise in one plain-English line>  OPEN\n\n## Given\n\n## Out of scope\n`
  );
  fs.writeFileSync(
    path.join(root, ".stead", "anchors.json"),
    JSON.stringify({ version: 1, anchors: {} }, null, 2) + "\n"
  );
  fs.writeFileSync(
    path.join(root, "machine", "README.md"),
    "# Machine layer\n\nAgents own this tree. Humans never review it.\nEverything here is regenerable except `decisions/`.\n"
  );
  console.log(`initialized stead in ${root}`);
}

function fail(msg) {
  console.error("stead: " + msg);
  process.exit(2);
}

// ---------- main ----------

const [, , cmd, ...rest] = process.argv;
const root = path.resolve(rest.find((a) => !a.startsWith("-")) || ".");
switch (cmd) {
  case "check": cmdCheck(root); break;
  case "status": cmdStatus(root); break;
  case "init": cmdInit(root); break;
  default:
    console.log("usage: stead <check|status|init> [dir]");
    process.exit(cmd ? 2 : 0);
}
