# Project skills

Claude Code loads these skills automatically when working in this repository. They are vendored
copies of third-party skills, chosen for quality: established authors, high GitHub star counts or
install counts on [skills.sh](https://skills.sh), permissive licenses. Each was copied from its
source at the commit below and reviewed before it was added: no hooks, no symbolic links, no hidden
or invisible text, no instructions to download content at run time (see "Changes" for the one that
did), and the bundled scripts only run when someone runs them on purpose.

| Skill | What it's for | Source (commit) | Stars* | License |
| --- | --- | --- | --- | --- |
| `frontend-design` | Art direction: a distinctive visual identity instead of template defaults | [anthropics/skills](https://github.com/anthropics/skills/tree/main/skills/frontend-design) (`dbd4588f9e10`) | 182.9k | Apache-2.0 |
| `webapp-testing` | Drive the running app with Playwright: screenshots, console logs, UI checks | [anthropics/skills](https://github.com/anthropics/skills/tree/main/skills/webapp-testing) (`dbd4588f9e10`) | 182.9k | Apache-2.0 |
| `web-design-guidelines` | Review UI code against Vercel's Web Interface Guidelines | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) (`063bee94c3f4`) + [web-interface-guidelines](https://github.com/vercel-labs/web-interface-guidelines) (`434b7f9`) | 32.8k | MIT |
| `vercel-react-best-practices` | React performance and patterns (this app doesn't use React; only relevant if that changes) | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) (`063bee94c3f4`) | 32.8k | MIT |
| `ui-ux-pro-max` | Searchable design database: styles (incl. Liquid Glass, glassmorphism), palettes, font pairings, UX and iOS/Android guidelines | [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) (`623a9a9037d0`) | 138.8k | MIT |
| `design-taste-frontend` | Anti-generic design rules: layout, type, colour, motion, critique | [leonxlnx/taste-skill](https://github.com/leonxlnx/taste-skill) (`6010f91a9935`) | 101.0k | MIT |
| `apple-design` | Apple's design approach (WWDC talks) translated for the web: springs, gestures, sheets, translucent materials, typography | [emilkowalski/skills](https://github.com/emilkowalski/skills) (`2d228630ba14`) | 48.6k | MIT |
| `emil-design-eng` | Design-engineering craft: animation, interaction details, polish | [emilkowalski/skills](https://github.com/emilkowalski/skills) (`2d228630ba14`) | 48.6k | MIT |
| `review-animations` | Review animations against motion standards | [emilkowalski/skills](https://github.com/emilkowalski/skills) (`2d228630ba14`) | 48.6k | MIT |
| `material-3` | Material Design 3 / M3 Expressive (Android look and feel), tokens, components, compliance audit | [hamen/material-3-skill](https://github.com/hamen/material-3-skill) (`14385f2bf380`) | 1.5k | MIT |
| `brand-discovery` | Positioning, audience, voice: the strategy a logo is built on | [rampstackco/claude-skills](https://github.com/rampstackco/claude-skills) (`9b90db257f73`) | 986 | MIT |
| `brand-ideation` | Divergent concept exploration before committing to a direction | same | 986 | MIT |
| `creative-direction` | Project-wide aesthetic direction (references, register, what to reject) | same | 986 | MIT |
| `art-direction` | Turning creative direction into concrete visual decisions | same | 986 | MIT |
| `brand-identity` | The full identity system: logo + colour + type + voice + applications | same | 986 | MIT |
| `logo-design` | Logo variants across architectures (wordmark, lockup, monogram, letterform-as-symbol) with rationale and application specs | same | 986 | MIT |
| `brand-style-guide` | Brand guidelines document | same | 986 | MIT |
| `brand-voice` | Tone of voice and messaging rules | same | 986 | MIT |
| `brand` | Brand voice, visual identity, messaging, style guides; syncs brand colours into design tokens | [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) (`623a9a9037d0`) | 138.8k | MIT |
| `design-system` | Token architecture (primitive → semantic → component), CSS variables, type and spacing scales | same | 138.8k | MIT |
| `product-marketing` | Product marketing context document (positioning, audience, voice) that the other marketing skills build on | [coreyhaines31/marketingskills](https://github.com/coreyhaines31/marketingskills) (`e85f3cbc2e4a`) | 56.0k | MIT |
| `copywriting` | Marketing and page copy (landing, feature, about pages, CTAs) | same | 56.0k | MIT |
| `copy-editing` | Review and tighten existing copy | same | 56.0k | MIT |
| `onboarding` | First-run experience, activation, time-to-value | same | 56.0k | MIT |
| `launch` | Launch and release plans (Product Hunt, announcements) | same | 56.0k | MIT |
| `marketing-psychology` | Behavioural principles and mental models applied ethically | same | 56.0k | MIT |
| `accessibility` | WCAG 2.2 audit and fixes | [addyosmani/web-quality-skills](https://github.com/addyosmani/web-quality-skills) (`afa8da942115`) | 3.0k | MIT |
| `performance` | Loading and runtime performance | same | 3.0k | MIT |
| `core-web-vitals` | LCP, INP, CLS | same | 3.0k | MIT |
| `best-practices` | Lighthouse best practices (security, modern APIs) | same | 3.0k | MIT |
| `web-quality-audit` | Runs the four quality skills above as one audit | same | 3.0k | MIT |

\* Star counts of the source repository, as noted when the skills were chosen (not updated).

## Changes to the originals

- **`web-design-guidelines`**: the original told the assistant to download the latest guidelines
  from GitHub's `main` branch before every review, so its rules could change without review. They
  are now a reviewed copy in `references/guidelines.md` (web-interface-guidelines `command.md` at
  commit `434b7f9`), and `SKILL.md` points there instead.
- Each skill folder carries its source's license. For the two vercel-labs skills, whose repository
  states "MIT" in its README without a license file, a standard MIT license text is included.

## Updating

Copy a skill again from its source at a newer commit, review the changes (scripts, links, anything
that would download or run something), and update the commit in the table.

The site is published with Jekyll, which skips folders starting with a dot, so these files are not
part of the website.
