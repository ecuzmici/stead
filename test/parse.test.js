"use strict";
// Grammar + validation rules from FORMAT.md §1–§3.
const { makeFixture, stead, assert } = require("./helpers");

function checkOn(files) {
  return stead(["check"], makeFixture(files));
}

// Unreferenced Given fails validation.
let r = checkOn({
  "GUARANTEES.md": "# GUARANTEES — x\n\nG1  A thing.  OPEN\n\n## Given\nT1  Dangling.\n",
  ".stead/anchors.json": JSON.stringify({ version: 1, anchors: {} }),
});
assert(r.status === 2 && r.stderr.includes("referenced by no guarantee"), "unreferenced Given accepted");

// Undefined T-ref fails validation.
r = checkOn({
  "GUARANTEES.md": "# GUARANTEES — x\n\nG1  A thing.  TRUSTED  given T9\n",
  ".stead/anchors.json": JSON.stringify({ version: 1, anchors: { G1: { kind: "trusted" } } }),
});
assert(r.status === 2 && r.stderr.includes("undefined Given T9"), "undefined T-ref accepted");

// Orphan anchor fails validation.
r = checkOn({
  "GUARANTEES.md": "# GUARANTEES — x\n\nG1  A thing.  OPEN\n",
  ".stead/anchors.json": JSON.stringify({
    version: 1,
    anchors: { G7: { kind: "check", tier: "SAMPLED", cmd: "exit 0" } },
  }),
});
assert(r.status === 2 && r.stderr.includes("orphan anchor"), "orphan anchor accepted");

// LLM-behavior ceiling: tier above SAMPLED with llm_behavior fails.
r = checkOn({
  "GUARANTEES.md": "# GUARANTEES — x\n\nG1  The model always answers politely.  OPEN\n",
  ".stead/anchors.json": JSON.stringify({
    version: 1,
    anchors: { G1: { kind: "check", tier: "HOLDS", cmd: "exit 0", llm_behavior: true } },
  }),
});
assert(r.status === 2 && r.stderr.includes("never exceed SAMPLED"), "LLM ceiling not enforced");

// llm_behavior at SAMPLED is fine.
r = checkOn({
  "GUARANTEES.md": "# GUARANTEES — x\n\nG1  The model always answers politely.  OPEN\n",
  ".stead/anchors.json": JSON.stringify({
    version: 1,
    anchors: { G1: { kind: "check", tier: "SAMPLED", cmd: "exit 0", llm_behavior: true } },
  }),
});
assert(r.status === 0, "SAMPLED llm_behavior rejected");

// Lost file anchor -> BROKEN, exit 1.
r = checkOn({
  "GUARANTEES.md": "# GUARANTEES — x\n\nG1  Proved thing.  HOLDS\n",
  ".stead/anchors.json": JSON.stringify({
    version: 1,
    anchors: { G1: { kind: "files", tier: "HOLDS", files: { "proof.dfy": "sha256:00" } } },
  }),
});
assert(r.status === 1 && r.stderr.includes("lost anchor"), "lost anchor not BROKEN");

// stead init scaffolds a checkable repo.
const os = require("os"), fs = require("fs"), path = require("path");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "stead-init-"));
r = stead(["init"], dir);
assert(r.status === 0, "init failed");
assert(fs.existsSync(path.join(dir, "GUARANTEES.md")), "init: no GUARANTEES.md");
assert(fs.existsSync(path.join(dir, ".stead", "anchors.json")), "init: no anchors.json");
assert(fs.existsSync(path.join(dir, "machine", "decisions")), "init: no machine/decisions");
r = stead(["check"], dir);
assert(r.status === 0, "freshly initialized repo does not pass check");

console.log("parse: ok");
