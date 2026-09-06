# Library

This folder is the content store behind `hansol100 serve` and `hansol100 library …`.

- One diagram per file: `<id>.json` (`id` = lowercase letters, digits, Hangul, `.`, `_`, `-`).
- Two document shapes are accepted and detected automatically:
  - **board-v1** process boards (`title`, `lanes`, `stages`, `nodes`, `edges`) → SVG / PNG / motion SVG
  - **Archify** diagrams (`diagram_type`: architecture | workflow | sequence | dataflow | lifecycle) → interactive HTML
- Files are plain JSON, so agents (via the Skill), people (via the web editor) and git all edit the same source of truth.
- Deleting from the web UI moves files to `.trash/` (restorable from the UI); it never hard-deletes.

Point the service at another folder with `hansol100 serve --library <dir>` or `HANSOL_LIBRARY=<dir>`.
