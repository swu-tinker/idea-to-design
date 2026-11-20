#!/usr/bin/env python3
"""Sort crit findings from lens files into one fix list per direction.

Crit agents write one file per lens: <run>/crit/<lens>.md. Each finding is a
table row that starts with the direction letter:

| Dir | View | Screen | Issue | Severity | Why / rule | Fix idea |

This script reads every row, tags it with its lens, puts must-fix items first,
and writes <run>/direction-<x>/crit-to-fix.md for each direction it finds.

It does NOT merge duplicates. The captain does that by hand afterward.

Usage:
    python3 sort-crit.py <run folder> [--notes notes.md]

--notes adds a file of captain notes to the top of every fix list.
"""

import argparse
import pathlib
import sys

LENS_NAMES = {"ux": "UX/UI", "platform": "Platform", "a11y": "Accessibility", "brief": "Brief"}
SEVERITY_RANK = {"must fix": 0, "should fix": 1, "nice to have": 2}


def read_rows(crit_dir):
    rows = {}
    for path in sorted(crit_dir.glob("*.md")):
        lens = LENS_NAMES.get(path.stem, path.stem)
        for line in path.read_text().splitlines():
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if len(cells) < 7:
                continue
            letter = cells[0]
            if len(letter) != 1 or not letter.isalpha() or not letter.isupper():
                continue  # header, divider, or a table that isn't findings
            _, view, screen, issue, severity, why, fix = cells[:7]
            rank = SEVERITY_RANK.get(severity.lower(), 3)
            rows.setdefault(letter, []).append((rank, lens, view, screen, issue, severity, why, fix))
    return rows


def write_lists(run, rows, notes):
    summary = []
    for letter, items in sorted(rows.items()):
        items.sort(key=lambda r: (r[0], r[1]))
        counts = [sum(1 for r in items if r[0] == i) for i in range(3)]
        out = [
            f"# Crit to fix — Direction {letter}",
            "",
            f"From {len({r[1] for r in items})} crit agents. "
            f"Must fix: {counts[0]}. Should fix: {counts[1]}. Nice to have: {counts[2]}.",
            "Must-fix items come first. Rows that say the same thing from two lenses: fix once.",
            "",
        ]
        if notes:
            out += ["## Notes from the captain", "", notes.strip(), ""]
        out += [
            "## Findings",
            "",
            "| Lens | View | Screen | Issue | Severity | Why / rule | Fix idea |",
            "|---|---|---|---|---|---|---|",
        ]
        out += [f"| {r[1]} | {r[2]} | {r[3]} | {r[4]} | {r[5]} | {r[6]} | {r[7]} |" for r in items]
        folder = run / f"direction-{letter.lower()}"
        folder.mkdir(exist_ok=True)
        (folder / "crit-to-fix.md").write_text("\n".join(out) + "\n")
        summary.append(f"{letter}: {len(items)} findings, {counts[0]} must fix, {counts[1]} should fix, {counts[2]} nice to have")
    return summary


def main():
    parser = argparse.ArgumentParser(description="Sort crit findings into one fix list per direction.")
    parser.add_argument("run", type=pathlib.Path, help="The run folder, which holds crit/")
    parser.add_argument("--notes", type=pathlib.Path, help="A file of captain notes to add to every list")
    args = parser.parse_args()

    crit_dir = args.run / "crit"
    if not crit_dir.is_dir():
        sys.exit(f"No crit folder at {crit_dir}")
    rows = read_rows(crit_dir)
    if not rows:
        sys.exit(f"No finding rows found in {crit_dir}. Check that crit files use the shared table format.")
    notes = args.notes.read_text() if args.notes else ""
    for line in write_lists(args.run, rows, notes):
        print(line)


if __name__ == "__main__":
    main()
