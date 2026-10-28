# Decisions

Choices that are cheap to make now and expensive to change once there are real users and data.
Each has a status: **decided**, **proposed** (waiting for the owner), or **later** (deliberately
postponed). The design these decisions shape is in [architecture.md](architecture.md); the screens
are in the redesign prototype (Badminton Score redesign, a private canvas on claude.ai).

## Product

### D1. Product name and own domain — proposed
The app grows beyond badminton, so "Badminton Score" won't fit. More important than the name is
the **address**: an installed app, its sign-in and its stored data belong to its web address. Moving
from `jorissaenen.github.io` later means everyone reinstalls and signs in again. So: pick a name,
register a domain (about €15 a year), and move the app there **before** the club starts using it.
GitHub Pages and Firebase both work with an own domain.

Candidates (domains checked 28 Oct 2026; `.be` and `.eu` could not be checked automatically):

| Name | .com | .app | Note |
|---|---|---|---|
| **Klubscore** | free | free | Clear in Dutch, German and English; any sport |
| Kluppo | free | free | Playful, distinctive, says nothing about scores |
| Scorabo | free | free | Score + bravo; "abo" also means subscription in Dutch |
| Klikscore | taken | free | One click to score, the app's origin |
| MatchTally | taken | free | Plain English |
| Teamscorer | taken | free | Plain English |
| Matchpunt | taken | free | Dutch for match point; local feel |

Before choosing: check the `.be`, a trademark search (EUIPO, Benelux BOIP) and app store names.

### D2. Three tabs: Play, Clubs, You — decided
In a match the scoreboard fills the screen without tabs. Play always shows the same buttons in the
same order (Club match, Follow a court, Quick match, Continue match); buttons that can't be used at
that moment are greyed out with the reason, never hidden. The default (white) button is Club match
during an event, Quick match otherwise.

### D3. Wording that stays positive — decided
Score keepers show "% correct" (99%), not an error rate. Everyone ranks from their first match; no
minimum number of matches.

## Data model

### D4. Sport-independent matches — decided
A match is an append-only list of events (point, goal, card, substitution, timeout, clock start or
stop, undo, fix), each with who entered it, the device and the input. What differs per sport lives in
a **rules module**: score units (rally point; goal; 1, 2 or 3 points), structure (games to 21;
halves; quarters), clock (none; counting up with stoppage time; counting down), how a match ends
(score reached; time up), ties (impossible; draw, extra time, penalties; overtime) and extra event
types.

- The **clock is stored as start and stop events**, never as a ticking number: every screen
  computes the time itself, offline too, without a database write every second.
- Events **may name a player** (scorer, assist). Badminton doesn't need it; football does.
- Every match records the **rules module and version** it was played with, so a rules change never
  changes old results.
- Score updates of a match are called `updates`, never `events`, so they don't mix with club events.

### D5. Person, account and player profile are separate — proposed
A **person** (player profile) need not have an account: a U7 player. An **account** can manage
several profiles: a parent with two children, who answers events and gets the notifications for
them. One person can play in several teams and clubs. "One account = one player", as now, does not
fit youth teams, and changing it later means moving all results.

### D6. Clubs, teams and roles — decided
- A club is created with **one team** (simple: the club *is* the team, no team screens) or **several
  teams**. A one-team club can add teams later; its team becomes the first, nothing is lost.
- Roles split in two levels. **Club:** owner, club admin (creates teams, appoints team admins, club
  settings, and everything a team admin can do in every team). **Team:** team admin (plans events,
  invites, manages roles in the team, invites other teams and accepts invitations), score keeper,
  member, viewer. One person can have a different role in each team. In a one-team club the levels
  merge into owner, admin, score keeper, member, viewer.
- Seasons belong to the club (open question O2: per team?). Each team has its own ranking.
- **Contacts:** a team shows its key people with call and WhatsApp buttons. Everyone decides
  whether to share their own number; only team members see it, never viewers.

### D7. Who can see results — decided
A club setting (owners and club admins): **members only**, **members and their viewers**, or
**everyone with the link**. A viewer always hangs off the member who invited them: if that member
leaves or is removed, their viewers lose access. Viewers can follow live scores, results and match
history and get "match finished" notifications; they can't answer events, keep score, see phone
numbers, invite others or appear in the ranking. The security rules enforce this like any role.

### D8. Events between teams and clubs — decided
A team admin invites a team of the own club from a list, or of another club by link or QR code. A
team admin (or club admin, or owner) of the other side chooses which of their teams plays and
accepts. The shared event gets its own place in the database with the list of participating teams;
the rules let someone read it only when they belong to one of them. Each team answers attendance for
itself; both see the score; the result counts for both; neither sees the other's member list or
phone numbers.

### D9. Live scores scale through one small document per match — decided
Firestore charges per read. A match keeps one small **live summary** (score, game, server, clock)
that screens and viewers listen to; the full list of updates loads only when someone opens the
match. 300 parents following a match then cost 300 reads per change of the summary, not per stored
update.

## Business

### D10. The club subscribes; the app checks entitlements, not plan names — decided
Pricing, revenue and cost estimates: [market-analysis.md](market-analysis.md).
Clubs buy, not members, so the plan belongs to the club. Code and security rules never ask "is this
the Pro plan?" but "what may this club do?" — for example `maxTeams`, `maxMembersPerTeam`,
`viewers`, `statsHistory`, `interClubMatches`, `publicPage`, `liveDisplay`. A plan only fills those
values in. Tiers, prices and exceptions for one club change without code changes.

A first idea of the tiers (prices later):

| | Free | Club | Pro / league |
|---|---|---|---|
| Teams | 1 | unlimited | unlimited |
| Members per team | up to 15 | unlimited | unlimited |
| Scoring, events, reminders | yes | yes | yes |
| Viewers (family) | – | yes | yes |
| Statistics | current season | all seasons | all seasons and export |
| Matches against other clubs | – | yes | yes, plus competitions and standings |
| Public page | – | link only | own page with logo and club colours |
| Live display on a TV | – | yes | yes |

### D11. Payments through Stripe on the web — later
As a web app the club can pay through Stripe (about 1.5–3 % per payment) instead of an app store
(15–30 %). Firebase has a ready-made Stripe extension. Needed only when the first paid tier exists.

## Privacy and quality

### D12. Privacy, especially for children — decided
For minors: a parent's consent, as little data as possible, no photos by default, no children's
names on public pages, data export and deletion, data stored in the EU (`europe-west1`, already so).

### D13. Languages from the start — decided
Dutch, French and English. Texts live in language files from the start of the redesign.

### D14. Build step with TypeScript before the redesign — decided
The app is still plain JavaScript files. Before the redesign is built, the alpha gets a build step
(Vite) with TypeScript for the data model and the rules modules, so a mistake in the structure is
caught before it reaches users. Production (v28) stays as it is.

### D15. Notifications — decided
- **Reminder** per event at a smart moment (an afternoon or evening event the same morning at 09:00, a
  morning event the evening before at 19:00), or 1–3 days before, another day and time, or none.
  Not for people who said they're not coming.
- **Results** when an event is over: once the end time has passed and no match has been played for
  10 minutes (a tournament: 5 minutes after the last match); or at a set time; or off. To everyone
  who played and to viewers who follow the club. The scheduled function then checks every 5 minutes.

### D16. App Check against abuse — later
Firebase App Check protects the database and functions from bots, needed once public pages exist.

### D17. Native apps in the stores — later
The web app can later be wrapped as a store app (better notifications on iPhone). Not needed now.

## Open questions

- **O1.** Name and domain (D1).
- **O2.** One season per club, or per team (youth teams may follow other calendars)?
- **O3.** Public clubs: only reachable by link, or also findable in the app?
- **O4.** Viewer notifications: only when a match ends, or also after each game?
- **O5.** Role name: "team admin" or "coach"?
- **O6.** Accepting a match invitation: is the other team's admin enough, or must their club admin
  approve too?
- **O7.** Person and parent model (D5): confirm.
