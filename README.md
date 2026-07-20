# korea100studio

Turn any process into a vertical swimlane board (SVG/PNG), audit its
composition, and animate it. korea100studio is a standalone Agent Skill
extracted from [korea100](https://hosungseo.github.io/korea100)'s process
renderer — it works from within Claude Code and Codex, driven by a
`SKILL.md` entry point plus a small ESM CLI (`scripts/board.mjs`).

## Install

Check out this repo into your skills directory:

```bash
# Claude Code
git clone <repo-url> ~/.claude/skills/korea100studio

# Codex
git clone <repo-url> ~/.agents/skills/korea100studio
```

## Setup

```bash
cd ~/.claude/skills/korea100studio  # or wherever you cloned it
npm install
npm test
```

See `SKILL.md` for usage once it lands.
