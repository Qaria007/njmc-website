# STATUS

Updated 27 Sep 2026 (session 1, Claude Code on the Mac).

| Phase | State |
|---|---|
| 0 Setup and inventory | Done except the nightly task (see Blocked) |
| 1 Foundation | Not started. Needs Vercel + Neon accounts (owner question 3) |
| 2 to 9 | Not started |

## Done (Phase 0)
- Private repo Qaria007/njmc-website with the build pack.
- docs/old-site/inventory.md: 43 live URLs (EN + AR), all 200, title, description, H1.
- docs/old-site/pages/: text snapshot of every page, Arabic included (reuse source).
- docs/old-site/redirect-map.csv: every old `.html` URL to its new URL (301).
- Live state vs the Aug 2026 spec recorded in inventory.md.
- Unpublished assets: impurity article is already live; the rebuilt verification
  page and WhatsApp button were not found anywhere (inventory.md explains).
- OWNER-QUESTIONS.docx in the Drive task folder.

## Blocked
- Nightly scheduled task (docs/07): NOT created. Claude Code's safety check refused
  to set up an unattended job that merges to main and deploys on its own; needs the
  owner's explicit go-ahead in chat. docs/07-automation.md is also not yet in the repo
  for the same reason (copy in Drive).
- Phase 1: Vercel and Neon accounts (owner creates, question 3).

## Next
- Owner answers OWNER-QUESTIONS.docx (or says "default").
- Phase 1 scaffold (Next.js + Payload + Postgres) can start locally without accounts.
