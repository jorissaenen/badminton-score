# Project skills

Claude Code loads these skills automatically when working in this repository. Most are vendored
copies of third-party skills (the project's own are listed at the end), chosen for quality:
established authors, high GitHub star counts or install counts on [skills.sh](https://skills.sh),
permissive licenses. Each was copied from its
source at the commit below and reviewed before it was added: no hooks, no symbolic links, no hidden
or invisible text, no instructions to download content at run time (see "Changes" for the one that
did), and the bundled scripts only run when someone runs them on purpose.

| Skill | What it's for | Source (commit) | Stars* | License |
| --- | --- | --- | --- | --- |
| `frontend-design` | Art direction: a distinctive visual identity instead of template defaults | [anthropics/skills](https://github.com/anthropics/skills/tree/main/skills/frontend-design) (`dbd4588f9e10`) | 182.9k | Apache-2.0 |
| `webapp-testing` | Drive the running app with Playwright: screenshots, console logs, UI checks | [anthropics/skills](https://github.com/anthropics/skills/tree/main/skills/webapp-testing) (`dbd4588f9e10`) | 182.9k | Apache-2.0 |
| `ui-ux-pro-max` | Searchable design database: styles (incl. Liquid Glass, glassmorphism), palettes, font pairings, UX and iOS/Android guidelines | [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) (`623a9a9037d0`) | 138.8k | MIT |
| `apple-design` | Apple's design approach (WWDC talks) translated for the web: springs, gestures, sheets, translucent materials, typography | [emilkowalski/skills](https://github.com/emilkowalski/skills) (`2d228630ba14`) | 48.6k | MIT |
| `emil-design-eng` | Design-engineering craft: animation, interaction details, polish | [emilkowalski/skills](https://github.com/emilkowalski/skills) (`2d228630ba14`) | 48.6k | MIT |
| `review-animations` | Review animations against motion standards | [emilkowalski/skills](https://github.com/emilkowalski/skills) (`2d228630ba14`) | 48.6k | MIT |
| `material-3` | Material Design 3 / M3 Expressive (Android look and feel), tokens, components, compliance audit | [hamen/material-3-skill](https://github.com/hamen/material-3-skill) (`14385f2bf380`) | 1.5k | MIT |
| `brand` | Brand voice, visual identity, messaging, style guides; syncs brand colours into design tokens | [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) (`623a9a9037d0`) | 138.8k | MIT |
| `design-system` | Token architecture (primitive → semantic → component), CSS variables, type and spacing scales | same | 138.8k | MIT |
| `copywriting` | Marketing and page copy (landing, feature, about pages, CTAs) | [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) (`e85f3cbc2e4a`) | 56.0k | MIT |
| `copy-editing` | Review and tighten existing copy | same | 56.0k | MIT |
| `accessibility` | WCAG 2.2 audit and fixes | [addyosmani/web-quality-skills](https://github.com/addyosmani/web-quality-skills) (`afa8da942115`) | 3.0k | MIT |
| `performance` | Loading and runtime performance | same | 3.0k | MIT |
| `core-web-vitals` | LCP, INP, CLS | same | 3.0k | MIT |
| `best-practices` | Lighthouse best practices (security, modern APIs) | same | 3.0k | MIT |
| `web-quality-audit` | Runs the four quality skills above as one audit | same | 3.0k | MIT |
| `brainstorming` | Finding out what is wanted before building: one question at a time, approaches, a short design | [obra/superpowers](https://github.com/obra/superpowers) (`2ce8aa15d05b`) | ~150k–268k | MIT |
| `writing-plans` | Turning an agreed design into a step-by-step plan with tests per step | same | | MIT |
| `test-driven-development` | Test first, watch it fail, then the code; rules for honest tests | same | | MIT |
| `systematic-debugging` | Root cause before fixes; tracing, defence in depth, waiting on conditions | same | | MIT |
| `verification-before-completion` | No "done" or "passes" without the command's output as proof | same | | MIT |
| `receiving-code-review` | Weighing review feedback technically instead of agreeing by reflex | same | | MIT |
| `planning-with-files` | Plan, findings and progress files that survive a context reset (adapted, see Changes) | [OthmanAdi/planning-with-files](https://github.com/OthmanAdi/planning-with-files) (`0fa6c79885e1`) | ~18k–26k | MIT |
| `sentry-security-review` | Security review with high-confidence findings only (OWASP-based) | [getsentry/skills](https://github.com/getsentry/skills) (`0c464f411bdf`), skill `security-review` | ~10.8k | Apache-2.0; references CC BY-SA 4.0 (OWASP) |
| `skill-scanner` | Checks a skill for hidden instructions, dangerous scripts and excessive permissions before installing it | same | | Apache-2.0 |
| `firebase-firestore` | Firestore data modelling, queries, indexes, SDK use | [firebase/agent-skills](https://github.com/firebase/agent-skills) (`e61fb31eea51`) | official (Google) | Apache-2.0 |
| `firestore-rules-creation` | Writing secure Firestore rules: validators on create and update, attack checklist | same | | Apache-2.0 |
| `firebase-security-rules-auditor` | Red-team audit of security rules with a score | same | | Apache-2.0 |
| `firebase-auth-basics` | Firebase Authentication concepts, web SDK, rules with `request.auth` | same | | Apache-2.0 |

\* Star counts of the source repository, as noted when the skills were chosen (not updated). Counts with ~ come from
star-tracking sites (GitHub itself wasn't reachable), so they are approximate.

The `anthropics/skills` copies (`frontend-design`, `webapp-testing`) were compared with commit
`ca45fc496a34` (3 November 2026): unchanged.

## Changes to the originals

- **`web-design-guidelines`**: the original told the assistant to download the latest guidelines
  from GitHub's `main` branch before every review, so its rules could change without review. They
  are now a reviewed copy in `references/guidelines.md` (web-interface-guidelines `command.md` at
  commit `434b7f9`), and `SKILL.md` points there instead.
- Each skill folder carries its source's license. For the two vercel-labs skills, whose repository
  states "MIT" in its README without a license file, a standard MIT license text is included.

- **superpowers** (seven of its fifteen skills; left out: git worktrees and branch finishing, as this
  project commits to `main`; the subagent skills, as each extra agent starts from zero and costs a
  full context; `executing-plans`, which needs those scripts; its session-start hook):
  - `brainstorming`: without the "visual companion" (a local web server that loads a logo from the
    author's website, unreachable from a cloud session); visuals go on the design board instead. The
    builder check is done as a separate pass by the same assistant instead of a fresh agent. Specs go
    in `docs/specs/`.
  - `writing-plans`: plans go in `docs/plans/`; the hand-over carries the plan out in the same
    session (no worktree, no agent per task), with rulings noted in the plan.
  - References to other superpowers skills use their names here (`test-driven-development`, …;
    `writing-skills` → `skill-creator`). Left out of `systematic-debugging`: the author's test and
    creation-log files.
- **`planning-with-files`** is an adaptation, not a copy: the original installs five hooks that run a
  shell script automatically on every prompt and before every tool call, plus some 12,000 lines of
  helper scripts (one reads earlier chat transcripts). Kept: the method, its rules and the three
  templates (unchanged); files go in `docs/work/<date>-<task>/`; use limited to work that spans
  sessions.
- **`sentry-security-review`**: renamed from `security-review` (that name is a built-in command);
  description and license line adjusted; `SPEC.md` left out. Its reference files were scanned
  (scanner below, plus searches for hidden characters, links and download commands) rather than read
  line by line; the hits were teaching examples (an injection example, Amazon's documented dummy key,
  lists of weak default passwords).
- **`skill-scanner`**: unchanged. Its script only reads files and prints JSON (needs PyYAML; run it
  with `python3 -I skill-scanner/scripts/scan_skill.py <skill-folder>`). It was run over every skill
  added here: no findings except expected ones in security texts.
- **Firebase skills**: unchanged. Left out: `firebase-basics` (it tells the assistant to log in to
  Firebase, install more skills and an MCP server, and always fetch the newest CLI; this project
  never logs in from a session and deploys through GitHub Actions, see `CLAUDE.md`), and skills for
  products Skoor doesn't use. Their advice to validate rules with `firebase deploy --dry-run` is
  overridden by `CLAUDE.md`: use the emulator tests.

## Removed (3 November 2026)

To keep the always-loaded skill descriptions small, these were removed (they're in git history):
the brand set (`brand-discovery`, `brand-ideation`, `brand-identity`, `brand-style-guide`,
`brand-voice`, `art-direction`, `creative-direction`, `logo-design`: the brand is done), the
marketing set (`product-marketing`, `onboarding`, `launch`, `marketing-psychology`),
`vercel-react-best-practices` (no React here), and two overlapping design skills
(`web-design-guidelines`, `design-taste-frontend`).

## Written for this project

`skoor-test-env`, `skoor-release`, `skoor-i18n`, `skoor-rules-change`, `skoor-ui-check`,
`skoor-watch-builds`, `design-board`, `lean-work`, `market-research`: the project's own know-how
(see `CLAUDE.md` in the repository root).

## Updating

Copy a skill again from its source at a newer commit, review the changes (scripts, links, anything
that would download or run something), and update the commit in the table.

The site is published with Jekyll, which skips folders starting with a dot, so these files are not
part of the website.
