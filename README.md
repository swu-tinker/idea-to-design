# idea-to-design

A Claude Code plugin that takes a design idea to finished screens.
You describe what you want to build. The plugin reads your repo so designs fit today's product. Then it explores several directions, critiques them, revises them, and sends your pick to Figma.

## Install it

In Claude Code, add this repo as a plugin marketplace, then install the plugin:

```
/plugin marketplace add swu-tinker/idea-to-design
/plugin install idea-to-design@idea-to-design
```

The repo must be one you can open on GitHub.

**Working on the plugin itself?** Load it straight from your local folder instead, so your edits take effect right away:

```bash
claude --plugin-dir ~/Developer/idea-to-design
```

## How to use it

Type the command, the path to a local copy of your repo, and your idea:

```
/idea-to-design repo=~/code/my-app <your idea or a brief file path>
```

The repo is required. If you leave it out, the captain asks for it before it starts.

To change other settings for one run, put them before the idea too:

```
/idea-to-design designers=4 designer_model=fable <your idea>
```

## Settings

Defaults live in the **Settings** table at the top of `skills/idea-to-design/SKILL.md`. Change them there to change every run.

| Setting | Default | Allowed |
|---|---|---|
| `repo` | none | a local folder path |
| `designers` | 3 | 2–5 |
| `designer_model` | opus | haiku, sonnet, opus, fable |
| `designer_effort` | medium | low, medium, high, xhigh, max |
| `scout_model` | opus | haiku, sonnet, opus, fable |
| `scout_effort` | medium | low, medium, high, xhigh, max |
| `crit_model` | opus | haiku, sonnet, opus, fable |
| `crit_effort` | medium | low, medium, high, xhigh, max |
| `ux_crit_model` | fable | haiku, sonnet, opus, fable |
| `ux_crit_effort` | high | low, medium, high, xhigh, max |
| `revision_rounds` | 1 | 1–2 |
| `split_at` | 10 | 6–30 |

The UX/UI crit gets its own setting because UX and UI quality matter most. `opus` means the newest Opus (5.5 today). `fable` means the newest Fable (5.2 today).

The captain runs on whatever model and effort your session uses. Start it on Opus at medium effort to match.

## What happens

1. **Scout.** A read-only scout finds today's related screens, settings, parts, copy, and the data the product has today. It writes them to `context.md`. While it reads, the captain may ask you up to three things a repo can't answer: how you'll know it worked, what must stay the same, and which platform.
2. **Intake.** The captain asks a few more questions if your brief is thin. It skips anything the repo or you already answered. You confirm the brief and the files the scout read.
3. **Baseline and directions.** The captain first writes `sample-data.md`: the people, names, and numbers every screen shows, so you compare designs and not made-up details. Then, at the same time, one designer agent rebuilds today's screens on a "Baseline" canvas, and the captain writes one direction per designer agent. You check both at once.

   Each direction gets a different **change budget**, so you get a real spread:
   - **Close to today** keeps today's layout and changes only what the idea needs.
   - **Rework the page** must use a new layout.
   - **Rethink the feature** may change how the feature works.

   All three stay with the repo's rules and design system. Each designer agent picks its own layout.

   Designs show only data the product has today. If a direction needs new data, it says so in a "Needs new data" note on its canvas.
4. **Design.** The captain makes one Claude Design canvas per direction and sends you the links. Each designer agent copies the baseline screens in first, then designs its direction into them. You watch each canvas fill in.
5. **Crit.** 4 crit agents review every direction. Each has one focus. They read the screen files saved in the run folder, which is faster than fetching them from the canvas. The platform crit also checks the fit with today's product.
6. **Revise.** The crit goes back to the same designer agent who built each direction. It posts the crit on the canvas as color-coded sticky notes under round 1. Then it builds round 2 on a new page. You review them all and pick. The captain never ranks the directions, so the pick is yours.
7. **Build-out (big flows only).** The full flow for the direction you picked, built in parts. See below.
8. **Handoff.** Your chosen screens go to Figma, after you approve.

It pauses for you at steps 2, 3, 6, 7, and 8. It may also ask early questions during step 1.

## Big flows: explore first, then build out

A long flow, like signup, can be 20 or more screens. Building it three times would be slow, and a single designer agent could run out of memory. So when a direction has more than `split_at` screens:

1. **Explore.** Each direction designs only the 3–4 **key moments**, the screens where the directions really differ. You approve the list. You pick a direction as usual.
2. **Spine.** The picked direction's designer agent builds the shared parts first: the page frame, step bar, patterns, and sample data.
3. **Segments.** Several designer agents each build one stretch of the flow, like Search, Details, and Book, at the same time. They write files only and never publish, so nothing clashes.
4. **Stitch.** The picked direction's designer agent places every segment on a "Full flow" page, links the seams, fixes mismatches, and publishes.
5. **Crit and one revise** on the full flow.

The captain skill has a glossary of these words, under "Words this plugin uses."

## What you see on each canvas

- **Baseline page:** today's screens, rebuilt from the code, so you can compare before and after.
- **Round 1 page:** the first designs. After crit, sticky notes appear below each screen. Red means must fix, and orange means should fix.
- **Round 2 page:** the revised designs, plus a green "What changed" note. Round 1 stays as it was, so you can compare.
- **More than one view:** each view gets its own row, with a title above it.

## Track progress in the side panel

A "Design run" panel opens beside the chat when a run starts. It updates on its own as the run moves. It shows:

- Every stage, from Setup to Figma, with a mark for done, working, or not started.
- What is happening right now.
- Each helper agent and its status.
- A "Waiting on you" box when the captain needs your answer.
- The direction table, once the canvases exist:

```
Baseline: canvas ✓

My feature         Round 1    Crit      Round 2    Your pick    Figma
Dir A              ✓          ✓ 4/4     ● working  ○            ○
Dir B              ✓          ✓ 4/4     ✓          ○            ○
Dir C              ● working  ○         ○          ○            ○
```

Each direction name links to its canvas.

The captain doesn't print this table in chat. In chat, it sends short one-line updates.

If you close the panel, type `/pipeline` to open it again. The panel shows the newest run that changed in the last 24 hours. It reads `pipeline.md` in the run folder, which the captain rewrites at every step.

## Designer agents check each screen once

Before publishing a screen, each designer agent runs one script, `add-screen.mjs`. It adds the screen to the canvas file, measures it in a hidden copy of Chrome on your computer, and sets the real page height. It also reports cut-off text, overlapping text, and broken links. The designer agent fixes what's listed once, then publishes. There's no re-check, so it can't loop. It needs Google Chrome, with no other installs. Without Chrome, the check is skipped.

## Which design system it uses

Designer agents use whatever design system that repo uses today. It works with any system, including an in-house one. The scout finds it in the repo's packages and imports. The captain matches it to the systems in Claude Design and only asks you if there's more than one match. If the scout can't tell, the captain asks you which one to use.

The plugin names no design system. It decides what to do from what each system holds in Claude Design.

- **It reads the system's own README first.** Most systems in Claude Design have one. It often says how the parts load, the copy rules, and the known flaws. The captain saves it in the run folder as `design-system-readme.md`. Designer and crit agents read it. Crit agents don't blame a direction for a flaw the system's owners already list.
- **It saves the system's styles once.** The screen check needs the styles and fonts on your computer. The first run downloads them to `design-runs/_shared/ds/`. Later runs reuse that copy.
- **It checks for updates each run.** Claude Design gives each system a version stamp. If the stamp changed, the run downloads the styles again. A run that already started keeps the copy it began with, so every direction matches.
- **A system with no styles to load skips the download.** The run still reads its README.

## Where things are saved

Each run gets a folder in your current project: `design-runs/<feature>/`.
It holds the settings, repo context, brief, sample data, directions, canvas links, crit notes, pipeline table, and your decisions.
You can read it at any time, and a stopped run can pick up from it.

It also holds `timings.md`, a time log for the run. When the run ends, the captain adds a table of minutes per stage, so you can see which stage is slowest.

## Files in this plugin

| File | What it does |
|---|---|
| `skills/idea-to-design/SKILL.md` | The captain. Runs the pipeline and holds the settings. |
| `agents/scout.md` | Reads the repo, read-only, and writes `context.md`. |
| `agents/designer.md` | Builds one direction on a canvas. One copy runs per direction. Also does the baseline rebuild. |
| `agents/crit-platform.md` | Checks design platform rules. |
| `agents/crit-ux.md` | Checks UX and UI: flow, clarity, edge cases, layout, and hierarchy. |
| `agents/crit-a11y.md` | Checks accessibility. |
| `agents/crit-brief.md` | Checks that the design solves the brief. |
| `skills/crit-steps/SKILL.md` | Shared review steps and findings format for crit agents. |
| `skills/design-platform-rules/SKILL.md` | General design rules. A fallback: the repo's own rules come first. |
| `scripts/sort-crit.py` | Sorts crit findings from one file per lens into one fix list per direction. |
| `scripts/ds-cache.mjs` | Keeps one saved copy of a design system's styles and fonts for all runs, and checks its version stamp. |
| `scripts/screen-check/add-screen.mjs` | One command per screen: adds it to `canvas.json`, runs the check, and sets its height. |
| `scripts/screen-check/check-screens.mjs` | Measures screens in headless Chrome: real height, cut-off text, overlaps, broken links. Changes nothing. |
| `hooks/register.tsx` | Draws the "Design run" side panel and adds the `/pipeline` command. |
| `hooks/parse.ts` | Reads `pipeline.md` into the parts the panel draws. |

## To do before the first real run

- Fill in `skills/design-platform-rules/SKILL.md` with your real rules.
- Make sure the Figma connector is on in Claude Code.
