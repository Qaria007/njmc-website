# 07 Automation

## Status (27 Sep 2026): no nightly task
The owner answered OWNER-QUESTIONS 8 with "for now no need, later on can be done".
The build advances only in Claude Code sessions the owner starts. Nothing is scheduled.

## If the owner later asks for it
The Aug/Sep 2026 plan was a nightly cloud task ("NJMC website build - nightly", 21:00 UTC,
repo Qaria007/njmc-website) that picks the next unfinished phase in docs/04, works on a
branch, runs the reviewer, merges when the acceptance boxes are true, and updates
STATUS.md, STATUS.docx and the Work Log. Before creating it, re-check with the owner:
- A cloud task cannot reach the VPS without a deploy key stored in the cloud. Either the
  task stops at "image pushed to GHCR" and deploys happen from the Mac, or the owner
  approves a restricted deploy key held in GitHub Actions secrets.
- Claude Code's safety check refused to create an unattended task that merges and
  deploys on its own (27 Sep 2026). It needs the owner's explicit yes in the session.
- Back up the task file to Shared Brain > scheduled-tasks (Shared Brain rule 5), never
  with secrets in the prompt.

## What the owner sees
- STATUS.docx in the Drive task folder after each session.
- A short message only when a decision is needed.
