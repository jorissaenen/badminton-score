---
name: lean-work
description: Do the work with fewer tokens without lowering quality - search before reading, read only the lines needed, batch independent calls, keep output short, test narrowly while iterating and fully at the end. Use on every task in this project; especially long sessions.
---

# Lean work

Every tool call re-reads the whole conversation, and everything printed stays in it. Saving
tokens means fewer, smaller, well-aimed calls, never skipping checks.

## Finding things

- `grep -n` (or Grep) for the symbol first; then read only that range (`sed -n 'A,Bp'` or Read with
  offset/limit). Read a whole file only when you'll change much of it.
- Don't re-read a file you just wrote or edited; the tools report failures.
- Know the map before searching: `CLAUDE.md` lists where things live; the project skills hold the
  how-to (test setup, release, watch builds). Don't rediscover what they document.
- Ask a question of the code once, precisely, rather than browsing.

## Calls

- Independent calls go in **one** message (several reads, searches or checks at once).
- Chain dependent shell steps in one command with `&&`; one Python script for several related
  edits instead of many small edits.
- Long output (tests, builds, Gradle, emulators) → a file in the scratchpad; print the tail or
  `grep` for `fail|error|BUILD`. Use `head`/`tail`/`cut -c1-200` on anything that may be long.
- Background servers: start once (detached), check with `curl -s -o /dev/null -w %{http_code}`.

## Testing

- While iterating: run the narrowest test (one file, `node --test tests/x.test.js`, one Gradle task).
- Before claiming done and before committing: the full relevant suites (see `skoor-release`).
  That one full run is never skipped.
- Screenshots: one combined image instead of many separate ones; look at it once, carefully.

## Writing

- Progress notes: one short line between steps, only when there's something to say.
- Final message: what changed for the owner, what was tested (counts), what wasn't, what he needs
  to do. No recap of every step, no repeated explanations.
- Don't spawn extra agents unless the owner asks: each one starts from zero.

## Web research

- One round of searches in parallel, then follow up only on gaps. Prefer primary sources. Cite
  what you use; say plainly when a figure is an estimate or from an aggregator.
