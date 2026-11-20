---
name: crit-steps
description: Shared review steps and findings format for idea-to-design crit agents. Load before reviewing design canvases in a run.
---


# Shared crit steps

## 1. Read the run

- `<run folder>/brief.md` and `<run folder>/directions.md`.
- `<run folder>/direction-<x>/canvas.md` for every direction letter the captain gave you. Each has a canvas link and a list of screens.

## 2. Look at every screen in every direction

For each canvas:

1. List its files with `Artifact` (`action: "list"`, `scope: "files"`, `url: <canvas link>`).
2. Read `project/canvas.json` to see the screens and pages. Each round of design has its own page (`round-1`, `round-2`, and so on). **Review only the newest round.** Older rounds and the sticky notes on them are history. A `baseline` page, if there is one, shows the product as it is now. Use it for comparison, but don't review it. After a build-out, review the newest "Full flow" page as one flow: check that each seam hands off cleanly and that the whole flow looks like one designer agent made it.
3. Read each `project/*.dc.html` screen with `Artifact` (`action: "read"`, `path: ...`).

You are reading screen code, not pictures. Judge what the code says: components used, text, labels, colors, sizes, states, and links between screens.

**Never publish to or change a canvas.** You only read.

## 3. Write findings

Write one file for your lens. Use this table, one row per issue:

| Dir | View | Screen | Issue | Severity | Why / rule | Fix idea |
|---|---|---|---|---|---|---|
| A | Admin | Settings.dc.html | Price uses a hand-built input | Must fix | Rule 1.1: use system components | Use the design system's currency field |

Severity:

- **Must fix**: breaks a rule, blocks a user, or misses the brief.
- **Should fix**: clear problem, but users can get by.
- **Nice to have**: polish.

Rules:

- Be specific. Name the screen file and the element.
- One issue per row. No duplicates.
- Keep it to your lens.
- End with 1–2 lines per direction: its biggest strength and biggest risk for your lens.

Your final reply to the captain: the file path and a count of must-fix items per direction.
