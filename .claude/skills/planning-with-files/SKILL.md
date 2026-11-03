---
name: planning-with-files
description: Persistent planning on disk for long work that may span sessions or a context reset - keeps task_plan.md, findings.md and progress.md current so the work can be picked up exactly where it stopped. Use for multi-session features, long research, or anything that would be costly to rediscover; not for small or single-session tasks.
---

# Planning with Files

Adapted from [OthmanAdi/planning-with-files](https://github.com/OthmanAdi/planning-with-files)
(MIT): the core method and its three templates, without its hooks and helper scripts (see
`.claude/skills/README.md`).

## The idea

```
Context window = memory (volatile, limited)
Files on disk  = notebook (persistent)
→ Anything that would be costly to rediscover gets written down.
```

## Where the files go

One folder per task: `docs/work/YYYY-MM-DD-<task>/` with

| File | Holds | Update |
|---|---|---|
| `task_plan.md` | Goal, next step, phases with status, decisions, errors | After each phase, and when the next step changes |
| `findings.md` | What was found: facts, sources, file paths, decisions with reasons | After every discovery worth keeping |
| `progress.md` | Chronological log: actions, files changed, test results, errors | During the work |

Start from the templates in `templates/` (copy them; keep the `### Phase N: Name` headings and
exactly one `**Status:** pending | in_progress | complete` line per phase). Commit the folder with
the work, so it survives the container being reclaimed. When the task is done, say so in
`task_plan.md`; delete the folder only when the person agrees the notes are no longer needed.

## When resuming

Before anything else, read `task_plan.md`, then `progress.md`, then what you need from
`findings.md`, and run `git log --oneline -10` and `git status` to see work not yet logged.
Answer for yourself:

| Question | Answer from |
|---|---|
| Where am I? | Current phase in task_plan.md |
| Where am I going? | Remaining phases |
| What's the goal? | Goal in task_plan.md |
| What have I learned? | findings.md |
| What have I done? | progress.md and git log |
| What do I do next? | Next Step in task_plan.md |

Trust these files and git over your own memory of the conversation.

## Rules

1. **Plan first.** No long task without `task_plan.md`.
2. **Write findings down within two lookups.** After every two searches, page views or
   screenshots, write what matters into `findings.md` before it scrolls away.
3. **Read before deciding.** Before a major decision, re-read the goal and next step.
4. **Update after acting.** Finishing a phase: set its status, refresh `## Next Step`, log
   errors and the files changed.
5. **Log every error,** with the attempt number and what you did about it.
6. **Never repeat a failed action as it was.** Change something: the input, the tool, the
   approach.
7. **More work after completion:** add phases (Phase 6, 7…) and a new session entry in
   `progress.md`.

## Three-strike rule for errors

1. Diagnose and fix (read the error, find the cause, targeted fix).
2. Different approach (another method or tool; never the same action again).
3. Broader rethink (question assumptions, search, update the plan).
After three failures: tell the person what you tried, the exact error, and ask.

## Reading and writing, cheaply

| Situation | Do |
|---|---|
| Just wrote a file | Don't read it back |
| Looked at an image, PDF, page or screenshot | Write the findings now |
| Starting a new phase | Read the plan |
| Resuming after a gap | Read all three files |

## Not for

Simple questions, single-file edits, quick lookups, and anything finished in one sitting: there
the files cost more than they save.
