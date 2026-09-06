#!/usr/bin/env node
// Sync the vendored Archify engine (engines/archify) from an Archify checkout.
//
// Hansol-100 embeds the *clean* Archify Skill package — the same file set
// archify.zip ships (no tests, no lockfile, no generator scripts). We reuse
// Archify's own stager (scripts/stage-clean-skill.mjs) so the vendored tree is
// byte-identical to what Archify itself distributes, then record provenance in
// engines/archify/VENDOR.json.
//
//   node scripts/sync-archify.mjs --from ../archify           # update engines/archify
//   node scripts/sync-archify.mjs --from ../archify --check   # exit 1 if engines/archify drifted
//
// Updates to the merged product live in Hansol-100; this script is the one
// sanctioned path for pulling upstream Archify changes in.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE_DIR = path.join(repoRoot, "engines", "archify");
const VENDOR_FILE = "VENDOR.json";

function usage() {
  return `Usage: node scripts/sync-archify.mjs --from <archify-repo> [--check]

  --from <path>   Path to an Archify repository checkout (contains archify/ and scripts/stage-clean-skill.mjs)
  --check         Do not write; exit 1 when engines/archify differs from a fresh stage of <path>
`;
}

function arg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1] ?? null;
}

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

function listFiles(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full, base));
    else out.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return out.sort();
}

function diffTrees(left, right) {
  const leftFiles = listFiles(left).filter((f) => f !== VENDOR_FILE);
  const rightFiles = listFiles(right).filter((f) => f !== VENDOR_FILE);
  const problems = [];
  const rightSet = new Set(rightFiles);
  for (const file of leftFiles) {
    if (!rightSet.has(file)) {
      problems.push(`only in staged package: ${file}`);
      continue;
    }
    if (!fs.readFileSync(path.join(left, file)).equals(fs.readFileSync(path.join(right, file)))) {
      problems.push(`content differs: ${file}`);
    }
  }
  const leftSet = new Set(leftFiles);
  for (const file of rightFiles) {
    if (!leftSet.has(file)) problems.push(`only in engines/archify: ${file}`);
  }
  return problems;
}

export function stageArchify(fromRepo) {
  const from = path.resolve(fromRepo);
  const stager = path.join(from, "scripts", "stage-clean-skill.mjs");
  if (!fs.existsSync(stager)) {
    throw new Error(`not an Archify checkout (missing scripts/stage-clean-skill.mjs): ${from}`);
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hansol-archify-sync-"));
  const dest = path.join(tmp, "archify");
  const result = spawnSync(process.execPath, [stager, "--root", from, "--dest", dest], {
    encoding: "utf8",
  });
  if (result.status !== 0) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw new Error(`Archify stager failed: ${(result.stderr || result.stdout || "").trim()}`);
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(dest, "package.json"), "utf8"));
  const vendor = {
    name: "archify",
    version: pkg.version,
    source: {
      repository: git(from, ["remote", "get-url", "origin"]) || "unknown",
      commit: git(from, ["rev-parse", "HEAD"]) || "unknown",
      describe: git(from, ["describe", "--tags", "--always"]) || "unknown",
      dirty: (git(from, ["status", "--porcelain", "--", "archify"]) || "") !== "",
    },
    stager: "scripts/stage-clean-skill.mjs",
    fileCount: listFiles(dest).length,
    syncedAt: new Date().toISOString(),
    note: "Vendored clean Archify Skill package. Do not edit by hand; run `npm run sync:archify -- --from <archify-repo>`.",
  };
  return { tmp, dest, vendor };
}

function main() {
  const from = arg("--from");
  const check = process.argv.includes("--check");
  if (!from || process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(usage());
    process.exit(from ? 0 : 2);
  }
  const { tmp, dest, vendor } = stageArchify(from);
  try {
    if (check) {
      if (!fs.existsSync(ENGINE_DIR)) {
        console.error("engines/archify is missing");
        process.exit(1);
      }
      const problems = diffTrees(dest, ENGINE_DIR);
      if (problems.length) {
        console.error(`engines/archify drifted from ${from} (${problems.length} difference(s)):`);
        for (const p of problems.slice(0, 40)) console.error(`  ${p}`);
        if (problems.length > 40) console.error(`  … ${problems.length - 40} more`);
        process.exit(1);
      }
      console.log(`OK: engines/archify matches ${from} (archify ${vendor.version}, ${vendor.source.commit.slice(0, 12)})`);
      return;
    }
    fs.mkdirSync(path.dirname(ENGINE_DIR), { recursive: true });
    const incoming = `${ENGINE_DIR}.incoming-${process.pid}`;
    const outgoing = `${ENGINE_DIR}.outgoing-${process.pid}`;
    fs.rmSync(incoming, { recursive: true, force: true });
    fs.cpSync(dest, incoming, { recursive: true });
    fs.writeFileSync(path.join(incoming, VENDOR_FILE), `${JSON.stringify(vendor, null, 2)}\n`);
    if (fs.existsSync(ENGINE_DIR)) fs.renameSync(ENGINE_DIR, outgoing);
    fs.renameSync(incoming, ENGINE_DIR);
    fs.rmSync(outgoing, { recursive: true, force: true });
    console.log(`synced engines/archify ← ${from}`);
    console.log(`  archify ${vendor.version} @ ${vendor.source.commit.slice(0, 12)} (${vendor.fileCount} files)${vendor.source.dirty ? " [source tree dirty]" : ""}`);
    console.log("  next: npm test");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
