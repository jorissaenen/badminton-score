# Decisions

Choices that are cheap to make now and expensive to change once there are real users and data.
Each has a status: **decided**, **proposed** (waiting for the owner), or **later** (deliberately
postponed). The design these decisions shape is in [architecture.md](architecture.md); the screens
are in the redesign prototype (Badminton Score redesign, a private canvas on claude.ai).

## Product

### D1. Product name, domain and logo — decided
The app grows beyond badminton, so "Badminton Score" won't fit. More important than the name is
the **address**: an installed app, its sign-in and its stored data belong to its web address. Moving
from `jorissaenen.github.io` later means everyone reinstalls and signs in again. So: register the
domain and move the app there **before** the club starts using it. GitHub Pages and Firebase both
work with an own domain.

- **Name: Skoor.** Short, sounds like "score" in every language, fits every sport.
- **Domain: `skoor.it`** (bought on 29 Oct 2026; `skoor.com`, `skoor.app` and `skoor.be` are taken). The
  `.it` doubles as the slogan: *Play it. Skoor it.* (see brand/slogans.md).
- **Logo:** "SK00R": the two o's are two green flip tiles showing 0–0, the score every match starts
  with. Letters in Barlow Condensed ExtraBold with 12 % letter spacing; tiles green `#22c55e`
  with a black 0 and a black split line. The app icon is the same two green tiles on black, so
  icon and name share one shape. Below 24 px the digits drop out and two green blocks remain.
  In running text the name is always written "Skoor"; the 00 lives only in the logo.
- **Risk:** a Turkish football-analysis site uses the name Skoor (`getskoor.com`). Before
  registering, search the EUIPO and WIPO trademark registers; the production logo will be drawn
  as shapes, not live text.

The logo rounds (Kworum, Scorzo, Scorzio and Skoor) are on the logo canvas (a private canvas on claude.ai).

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

## Direction

### D18. First users: informal teams and friend groups — decided
The first target is **people who play for fun**: friends who rent a badminton court every week, a
pub darts team, five-a-side football friends, a padel group. They don't train; they play, now and
then challenge another team (often found through Facebook groups), and sometimes organise a
tournament. Order:

1. **Pilot:** badminton with the owner's own group of friends.
2. **Other casual sports** under the new name (D1): darts, five-a-side football, padel, table
   tennis, pool, and so on.
3. **Event organisers** (D21).

Clubs stay fully supported: a group of friends is simply a club with one team (D6). The wording in
the app follows the casual user: "team", "game night", "challenge", not federation language.

### D19. The core job: "Will we be enough?" — decided
The biggest frustration of casual teams is getting enough people together, and cancelling when they
don't. Each event therefore gets:

- a **minimum** (and optional maximum) number of players;
- a clear status for everyone: **on** (enough), **at risk** (not yet enough, with "2 more needed"),
  **full** (waiting list), or **cancelled**;
- a **decision moment**: by a set time (for example the day before at 18:00) the event either goes
  ahead or is cancelled automatically, with a notification to everyone, so nobody drives to the hall
  for nothing;
- **reminders to those who haven't answered**, and a "we need 2 more" message the captain can send
  with one tap;
- **reserves and guests**: a reserve list, and a link to invite someone from outside the team for
  one evening, without an account;
- when a full event gets a cancellation, the first person on the waiting list is asked automatically.

This is free for every team: it is why people start using the app.

### D20. Finding opponents and challenging teams — decided
Teams can choose to be **findable** (sport, area, level, usual day) and post "looking for an
opponent" for a date. Another team's captain sends a **challenge**, which the first team accepts
(the flow of D8). This replaces searching in Facebook groups. Findable is opt-in per team; persons
are never findable, only teams. (Answers O3 for teams.)

**Head to head.** When a match is set up, and when a team gets a challenge, the app shows the
earlier results between the two sides. What counts as "the same sides" depends on the sport's rules
module (D4):
- **Individual and pair sports** (badminton, tennis, padel, table tennis, darts): exactly the same
  line-up. In doubles that means the same pair against the same pair; a different partner is a
  different line-up.
- **Team sports** (football, basketball, volleyball): team against team, whoever played that day,
  counted in matches won per meeting.

### D21. Event organisers without a club — decided
Anyone can be an **organiser**: create a tournament or event, invite teams by link (teams already
using the app, or not yet: a team without the app joins as a guest team with just names), plan the
rounds, let teams score their own matches, and show everything live on a public tournament page and
a big screen. Teams that like it can then continue in the app as their own team. Organisers are a
paying group (D22).

### D22. Pricing for casual teams — proposed
Casual players will pay about €1–2 per person, but collecting that from each person is a hassle and
the core (D19) must stay free to compete with WhatsApp polls and Spond. Proposal:

| | For | Price | Adds |
|---|---|---|---|
| **Free** | Every team | €0 | Events, minimum players, reminders, scoring, results of the current season |
| **Player Plus** | One person | ~€1.99 per month or €19 per year | Own statistics over all seasons and sports, progress, records, head-to-head |
| **Team Plus** | The captain, for the team | ~€4.99 per month or €49 per year (≈ €0.50–1 per player) | All seasons of team statistics, challenges and findable profile, viewers, own tournaments |
| **Organiser** | One tournament | ~€9–29 per tournament, or a share of entry fees collected through the app | Tournament page, any number of teams, big screen, results to all teams |
| **Club / Club Plus** | Clubs | €59 / €149 per year (see market-analysis.md) | As before |

The entitlements of D10 make it possible to combine these freely. Open question O8: does a team
pay through the captain, or does the app split the cost over the players?

### D23. Player profiles and who sees them — decided
Tapping a name opens that player's profile: matches, wins, win rate, level, recent form and best
partner, and a **"you and them"** section with four views: singles against each other, doubles
against each other (any partners), as partners, and team matches when you played in different teams.
Exactly-this-pair history stays on the match setup (D20).

Each player chooses who sees their statistics: **everyone** (also players of other clubs and
visitors of public tournament pages), **members of my clubs** (default for adults), **members of my
teams** (default for minors, D12), or **nobody**. Whatever they choose, two things stay visible:
their place in the club ranking to the club (D3), and every match they played with or against
someone, to that person, because it is their match too. A profile hidden from you therefore still
shows "you and them", built only from your shared matches.

## Open questions

- **O2.** One season per club, or per team (youth teams may follow other calendars)?
- **O3.** Public clubs: only reachable by link, or also findable? (Teams: opt-in findable, D20.)
- **O4.** Viewer notifications: only when a match ends, or also after each game?
- **O5.** Role name: "team admin" or "coach"?
- **O6.** Accepting a match invitation: is the other team's admin enough, or must their club admin
  approve too?
- **O7.** Person and parent model (D5): confirm.
- **O8.** Team Plus: paid by the captain, or split over the players in the app (D22)?
