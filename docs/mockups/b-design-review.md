# B direction: semester cards — design review

Status (2026-09-11): the user accepted B and authorized implementation. The app/ redesign is implemented and being verified. Authentication, cloud storage, sync and recovery are now in scope; the product brief and cloud architecture document supersede the browser-only labels in these reference images.

## Images

1. [Build a unit](b-01-build-unit-v1.png): first-visit unit entry, same-unit draft cards, date editor.
2. [See your semester](b-02-semester-v1.png): saved monthly overview, unit filters, overdue and undated work, mobile adaptation.
3. [Submission and resubmission](b-03-submissions-v1.png): awaiting results, completion, new deadline, retained history.

All image text is English. The warm ivory, serif headings, teal controls and unit-colored cards extend the selected B concept. Images were produced with the built-in image generation tool, using the original B image as a visual reference. Exact prompts are in [b-generation-prompts.md](b-generation-prompts.md).

## Accepted direction

Input is a useful opportunity to understand one's assessments. Enter a unit once, explicitly add assessment cards, give them dates when known, and see the semester take shape. No automatic import or LMS integration. Student-focused assessment management remains the product. Paid features and prices are undecided.

## Adopted interaction details

- After signing in, unit entry is inline; semester setup and separate unit administration are not required. A temporary sample can be explored before signing in.
- Each explicitly added card has one editable title defaulting to Assessment 1, Assessment 2, etc. These are convenience labels, not inferred institutional assessment numbers. Renaming replaces the title; there is no second name field.
- Dates are optional. Choose in a calendar or type a supported date and read back the full year before saving. Remember the last calendar month, never copy the last deadline to a new assessment.
- Drafts are distinct from saved assessments. Save the batch explicitly. Changing units, leaving the editor or closing it must not silently discard unfinished drafts; retain drafts or present a clear recovery/discard choice. Drafts are stored per account on the current device; reopening a saved draft creates a separate editing copy.
- The saved overview groups active work by month, with overdue work first and an always-accessible undated area. It must support more months/records than these illustrations and show all records, including on mobile.
- Color identifies units, with text labels as well. No drag gesture is required for any action.
- Mark submitted records the student's confirmation; it does not submit files to the school.
- Submitted contains awaiting results and completed records. Completion and resubmission remain separate choices; no grades or reassessment limits are inferred.
- A resubmission keeps the same assessment identity, adds the new optional deadline, preserves all past deadlines/submissions, and returns the card to active work.
- Preserve the underlying safeguards with a durable local outbox, cloud acknowledgement, revision conflicts, additive export/restore, history, completion undo and isolated sample behavior.

## Image interpretation

The panels are illustrative states, not a single continuous dataset. Page 02's mobile September preview omits Practical demo to fit the composition; the implementation must include it rather than hide records. Page 03's Original due date is a historical fact, not a separate synthetic submission event; use the actual stored snapshots when rendering history. The 2 attempts caption counts the new resubmission round, not two completed submissions. The My semester heading does not introduce mandatory term setup, automatic study planning or a paid semester limit.

## Implementation handoff

Continue in /Users/takahiro/Developer/assessment-tracker. Keep app/ as the implementation location; do not create a competing app-v2 folder. Preserve unrelated user files and changes. Before a broad redesign, preserve a recoverable baseline of the existing source and inspect untracked files; app/ was untracked before redesign and is included in the verified external recovery archive. Do not assume a branch alone preserves uncommitted/untracked work.

An optional new implementation conversation can start after mockup review, in the same project. Use this document plus README.md, AGENTS.md, docs/product-brief.md and docs/tasks.md as the handoff. This turn created neither a new conversation nor a branch, and did not change app code.

