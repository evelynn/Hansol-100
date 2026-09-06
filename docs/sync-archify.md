# Updating the vendored Archify engine

Hansol-100 embeds Archify's *clean Skill package* at `engines/archify/` — the
same file set `archify.zip` ships (no tests, no lockfile, no generator
scripts). Provenance is recorded in `engines/archify/VENDOR.json`.

## Procedure

```bash
# 1. Get the Archify source you want (any branch/tag/commit)
git clone https://github.com/tt-a1i/archify ../archify     # or your fork, e.g. evelynn/archify
git -C ../archify checkout v2.17.0                          # optional

# 2. Stage + copy + record provenance
node scripts/sync-archify.mjs --from ../archify

# 3. Prove the engine still works as shipped
npm test        # tests/archify-engine.test.mjs: doctor, per-type validation, render + check, SKILL.md path integrity
npm run doctor

# 4. Commit engines/archify as one change
git add engines/archify && git commit -m "chore(archify): sync engine to <version> (<commit>)"
```

`--check` re-stages from the checkout and exits 1 if `engines/archify`
differs (ignoring `VENDOR.json`), which is handy in a release checklist.

## What the script does

1. Runs Archify's own `scripts/stage-clean-skill.mjs --root <checkout> --dest <tmp>`.
   That stager selects only git-tracked files under `archify/`, rejects
   symlinks and unmerged entries, drops tests/lockfile/generators, and strips
   `scripts`/`devDependencies` from `package.json` — exactly what the ZIP
   contains.
2. Replaces `engines/archify` atomically (rename in, rename out).
3. Writes `VENDOR.json` with the version, repository URL, commit, `git describe`,
   whether the source tree was dirty, the file count and a timestamp.

## What to check after a sync

- `node bin/hansol.mjs archify doctor` says “Archify is ready”.
- If Archify added a diagram type: extend `ARCHIFY_TYPES` in
  `scripts/lib/detect.mjs`, `ARCHIFY_TEMPLATE_FILES` in
  `scripts/lib/archify-engine.mjs`, the `kind.*` labels in
  `scripts/server/ui/i18n.js`, and the `--kind-*` colours in `styles.css`.
- If Archify changed its diagnostics or receipt shape: the UI reads
  `diagnostics[].{code,message,supportedFixes}` and
  `checks[].{name,ok,details}` / `composition.summary` — adjust
  `viewer.js`/`editor.js` if those move.
- Sample library entries copied from `engines/archify/examples/` may need
  refreshing if the schema version changed.
