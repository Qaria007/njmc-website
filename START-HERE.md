# START HERE: NJMC website rebuild (Claude Code)

Owner: Dr. Majid Qaria. Prepared in Claude chat on 26 Sep 2026.
Project: NJMC. Drive: Claude shared drive > NJMC > the task folder this file sits in.

## What this is
A complete, autonomous build pack for the new njmcmedicsupp.com: a custom
Next.js + Payload CMS site that replaces the current static site on Hostinger and
can grow into an application later (client portal, manufacturer database,
PharmaTrust integration) without another platform change.

## The owner has very little time. Work accordingly.
- Run autonomously. Do not ask for approval of routine engineering choices.
- Batch every question for the owner into ONE Word file, `OWNER-QUESTIONS.docx`, in
  the Drive task folder (he cannot open .md). Never ask one question at a time.
- Before asking anything, look for the answer yourself: the NJMC and LNJC Drive
  project folders, the live site, the PharmaTrust repo (GitHub Qaria007/PharmaTrust),
  the Work Log. Ask only what cannot be found.
- When blocked on the owner, keep working on every task that is not blocked.
- Owner style: short, "this -> there" instructions, one step at a time.

## Session 1 (today, the only session the owner starts by hand)
1. Read, in order: `CLAUDE.md`, `BRAND.md`, `docs/DECISIONS.md`, then `docs/01`
   to `docs/07`, then the Aug 2026 spec in Drive (ID in CLAUDE.md).
2. Create the private repo `Qaria007/njmc-website`. Copy this whole pack into it
   (pack files at the repo root and in `docs/`). Commit and push.
3. Do Phase 0 from `docs/04-phases-and-acceptance.md` (inventory of the old site,
   redirect map, status file).
4. Set up the nightly automation described in `docs/07-automation.md`, and back
   up the scheduled task file to Shared Brain > scheduled-tasks (Shared Brain rule 5).
5. Write `OWNER-QUESTIONS.docx` (start from `docs/06-owner-checkpoints.md`,
   remove anything you already found the answer to).
6. End: Work Log note (Shared Brain rule 3), push, and tell the owner in at most
   5 lines: repo link, what runs nightly, and the questions file location.

## After session 1
The nightly scheduled task advances the build phase by phase. The owner only:
answers `OWNER-QUESTIONS.docx` once, glances at the preview link (C2, no approval
wait), and does the DNS switch at C3.
