---
name: design-platform-rules
description: General design rules for idea-to-design runs. A fallback only. The repo's own rules, listed in context.md, always come first. Used by crit-platform and designer agents.
---

# General design rules (fallback)

**The repo's own rules come first.** If `context.md` lists repo rules, those win whenever they disagree with this file. Use this file only for gaps they don't cover.

These rules hold for any product. Keep product-specific rules, like casing, terms, and page layouts, in the product's repo, not here.

<!--
Add rules here only if they hold for every product your team designs.
Number each rule so crit can cite it, like "Rule 2.1".
-->

## 1. Design system

- 1.1 Use design system components. Don't hand-build a part the system already has.
- 1.2 Use tokens for color, type, spacing, and radius. No one-off values.
- 1.3 Use the system's icon set only.
- 1.4 When no part fits, a new part is fine. Build it from the system's tokens and smaller parts, and list it as a new part.

## 2. Pages and flows

- 2.1 One primary action per screen.
- 2.2 Never add a required step to a key flow for an optional feature.
- 2.3 Show every added cost before the person commits.
- 2.4 Optional add-ons are off by default.
- 2.5 Match how nearby screens in the product already save, confirm, and show errors.

## 3. Content

- 3.1 Follow the product's own copy guide for casing, terms, and tone.
- 3.2 Destructive actions say what will be lost.
