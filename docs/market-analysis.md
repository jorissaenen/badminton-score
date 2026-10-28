# Market, pricing, revenue and costs

A first estimate (28 October 2026) to decide whether and how to sell the app. Numbers come from
public sources found online (listed at the end) or are estimates marked as such. Treat this as a
direction, not a forecast: the next step is talking to 5–10 clubs (see "How to check this").

## 1. Who would use it

The app's strength is the combination of hands-free scoring, attendance and reminders, a fair
rotation for the evening, statistics over seasons, and live following. That fits **racket sports
with several courts and short matches**: badminton, padel, tennis, table tennis, pickleball.
Football is crowded in Belgium (the RBFA's own free app, Spond), so it is later growth, not the
first target (see [decisions.md](decisions.md), D4).

### Clubs in Belgium and the Netherlands

| Sport | Region | Clubs | Members | Source |
|---|---|---|---|---|
| Badminton | Flanders | ~200 (estimate) | 33,282 (2023) | Statistiek Vlaanderen |
| Badminton | Wallonia and Brussels | ~80 (estimate) | ~10,000 (estimate) | – |
| Badminton | Netherlands | 452 | 35,896 (2021) | Badminton Nederland |
| Padel | Belgium | 416 | 95,000+ (2023); ~500,000 players | Padel Belgium, FIP |
| Tennis | Flanders | 520+ | 200,000+ players | Tennis en Padel Vlaanderen |
| Tennis | Wallonia and Brussels | ~300 (estimate) | – | – |
| Table tennis | Belgium | ~500 (estimate) | ~25,000 (unverified) | – |

That is roughly **2,500 racket-sport clubs** in Belgium and the Netherlands, plus an unknown but
large number of **informal groups** (friends who rent a court every week, company teams). Informal
groups rarely pay, but they spread the app.

Not every club is a fit:

- **Badminton and table tennis clubs** play club evenings with rotation: the best fit (~1,200).
- **Tennis clubs** often have their own booking systems and play by appointment: a partial fit, mainly
  for club evenings and internal competitions.
- **Padel clubs** are mostly commercial venues with a booking platform (such as Playtomic): the
  venue is not the customer, but the groups that play there every week are.

**Realistic addressable market in Belgium and the Netherlands: about 1,500 clubs and a few
thousand informal groups.** Across Europe, badminton alone counts tens of thousands of clubs
(Ireland 450, Netherlands 452, France several hundred more), so the market grows a lot with
languages and other countries.

## 2. What clubs pay today

| App | What it does | Price |
|---|---|---|
| Spond | Events, attendance, payments | Core free; club website €15/month; fee per payment |
| Twizzit (Belgian) | Member administration, invoicing, planning | About €3.75–5.50 per member per year (unconfirmed) |
| SportEasy (French) | Team management | About €69 per team per year, or €9.99 per month |
| TeamSnap (US) | Team management | About $100–130 per team per year |
| Courtzy, PaQueueKa, Kourt | Rotation for an evening | Small app subscriptions; paid host tier with ranking |

What this tells us:

- **Organising (events, attendance) is expected for free** because of Spond. Charging for that alone
  won't work.
- **Clubs do pay for things that save the board work or that members value**: administration,
  websites, statistics, competitions. Typical amounts are **€50–130 per team per year**, or a few
  euros per member per year.
- A badminton club of 40 members with a membership fee of €100–150 has €4,000–6,000 a year;
  **€50–100 a year for the app is 1–2 %** of that, an amount a board decides on without much discussion.

## 3. Proposed pricing

| | **Free** | **Club** | **Club Plus** | **League / federation** |
|---|---|---|---|---|
| For | Friends, a small group | A club with one team | A club with several teams | Federations, leagues |
| Price | €0 | **€59 per year** (or €6 per month) | **€149 per year** (or €15 per month) | On request |
| Teams | 1 | 1 | Unlimited | Unlimited |
| Members | Up to 15 | Unlimited | Unlimited | Unlimited |
| Scoring, events, reminders, rotation | Yes | Yes | Yes | Yes |
| Statistics and ranking | Current season | All seasons | All seasons, export | All, across clubs |
| Viewers (family) | – | Yes | Yes | Yes |
| Live display on a TV | – | Yes | Yes | Yes |
| Matches against other clubs | – | – | Yes | Yes, with competitions and standings |
| Public page with logo and colours | – | – | Yes | Yes |

Choices behind this:

- **Per club, not per member**: simple for the treasurer, and members never see a paywall.
- **Yearly billing by default** with two months free compared with monthly: fewer payment fees and
  less churn.
- **The free version must be good** for 5 friends: it is the way new clubs find the app.
- **Federation deal**: one contract that gives all clubs of, for example, Badminton Vlaanderen the
  Club tier. Fewer customers to win one by one, one bigger contract.

## 4. Revenue scenarios

Assumptions: Belgium and the Netherlands only; 60 % of paying clubs on Club (€59), 40 % on Club Plus
(€149), so an average of **€95 per paying club per year**.

| After about 3 years | Paying clubs | Revenue per year |
|---|---|---|
| Careful (2 % of 1,500 clubs) | 30 | ~€2,900 |
| Realistic (5 %) | 75 | ~€7,100 |
| Good (10 %) | 150 | ~€14,300 |
| With a federation deal (e.g. 200 clubs for €10,000) | +200 | +€10,000 |
| Europe, badminton and padel groups, 3 languages (500 clubs) | 500 | ~€47,500 |

In short: **in Belgium and the Netherlands alone this is a solid side income, not a full salary.**
It becomes a real business with a federation deal, with other countries, or with tournaments and
leagues as a bigger product.

## 5. Costs

### Google Firebase

Firebase charges by use. The free allowance per day: 50,000 document reads, 20,000 writes, 1 GiB
stored, 2 million function calls per month; notifications (Cloud Messaging) are always free. Beyond
that: about $0.03–0.04 per 100,000 reads and $0.09–0.11 per 100,000 writes (the Belgian region costs
somewhat more than the US one).

**One typical club** (14 players, one evening of 1.5 hours a week, 2 courts, about 14 matches of one
game to 21):

| Per month | Amount | Cost |
|---|---|---|
| Score updates and live summary | ~5,000 writes | ~€0.005 |
| Scoreboards, displays and members opening the app | ~45,000 reads | ~€0.02 |
| Reminders, results, statistics (functions) | ~1,000 calls | €0 (free allowance) |
| Storage (match history) | ~3 MB a year | €0 |
| **Total per club** | | **about €0.03 per month** |

- The **free allowance covers about 30 such clubs** completely.
- **500 clubs** cost roughly **€15–25 per month** in total.
- The expensive case is **public matches with many live viewers**: 300 people following a full
  match is about 165,000 reads, roughly €0.06 per match. That is why live viewers read one small
  summary document (D9) and why the public page is a paid tier.

**Firebase stays below 1 % of revenue in every scenario.** Set the budget alert (€5 now) higher as
clubs grow, so a mistake or abuse is noticed within a day.

### Other costs

| Cost | Amount | When |
|---|---|---|
| Domain name | ~€15 per year | Now |
| Stripe payment fees | ~1.5 % + €0.25 per payment (European cards) | From the first paid club; about €1.10 on a €59 yearly payment |
| E-mail address on own domain | €0–7 per month | When selling |
| Accountant and VAT returns | €300–1,000 per year | From the first sale |
| Company or self-employed status | Social contributions depend on income | From the first sale; Belgium has a VAT exemption for turnover up to €25,000 |
| Google Play developer account | €25 once | Only for a store app |
| Apple Developer Program | €99 per year | Only for an iPhone store app or Apple Watch |
| Marketing (demos at clubs, flyers, social media) | Mostly time | – |

### Your time

The largest cost is your own time: building, support for club boards, invoices, and making sure
nothing breaks during a club evening. Plan for a few hours a week of support once 50+ clubs pay.

## 6. Profit, roughly

| Scenario | Revenue | Costs (Firebase, Stripe, accountant, domain) | Before tax |
|---|---|---|---|
| Careful (30 clubs) | €2,900 | ~€500 | ~€2,400 |
| Realistic (75 clubs) | €7,100 | ~€900 | ~€6,200 |
| Good (150 clubs) | €14,300 | ~€1,400 | ~€12,900 |
| Europe (500 clubs) | €47,500 | ~€3,500 | ~€44,000 |

Margins are high (85–90 %) because the infrastructure is almost free; the real constraint is how
many clubs you can win and support.

## 7. How to check this

1. **Use it in your own club** for a season (the beta).
2. **Talk to 5–10 club boards** (badminton and table tennis first): show the prototype, ask what they
   use now, what it costs, and whether they would pay €59 a year. Their answers matter more than any
   number above.
3. **Offer the first 20 clubs a free year** in exchange for feedback and a testimonial.
4. **Ask Badminton Vlaanderen** whether they are interested in a federation deal once 10+ clubs use
   it.
5. **Measure**: how many free groups become paying clubs. 2–5 % is normal for this kind of app.

## 8. Update: casual teams first (see decisions D18–D22)

The first target moved from clubs to **informal teams and friend groups**, then **event
organisers**. That changes the numbers:

- **The market is larger but harder to count.** Belgium has thousands of loose five-a-side teams
  (Ghent alone has a separate hall rate for "loose" minivoetbal teams), growing pub darts leagues
  (the Limburg darts league alone added 20 teams in one year), padel groups on top of Padel Belgium's
  95,000 members, and friend groups renting badminton courts. No source gives a total; a careful
  guess for Belgium is **10,000+ casual teams**.
- **They pay less per team but there are many more**, and they spread the app themselves: every
  challenge or tournament brings in other teams.
- **The free core (D19, "will we be enough?") must win against WhatsApp polls and Spond.** Revenue
  comes from personal statistics, team extras and organisers.

Example after about 3 years, Belgium and the Netherlands:

| Source | Assumption | Revenue per year |
|---|---|---|
| Team Plus | 1,500 active teams, 15 % pay €49 | ~€11,000 |
| Player Plus | 12,000 active players, 4 % pay €19 | ~€9,100 |
| Organisers | 150 tournaments at €19 on average | ~€2,900 |
| Clubs | 40 clubs at €95 on average | ~€3,800 |
| **Total** | | **~€27,000** |

Costs stay small: a casual team with one game a week uses about the same as the club in section 5
(about €0.03 per month); a tournament page with 200 live viewers costs a few cents. Payment fees
weigh more on small amounts (€0.25 + 1.5 % on €1.99 is 14 %), so **yearly plans** should be the
default.

## Sources

- Statistiek Vlaanderen, members of sports clubs: <https://www.vlaanderen.be/statistiek-vlaanderen/sport/ledencijfers-sportclubs>
- Sport Vlaanderen publication (2023 member numbers): <https://publicaties.vlaanderen.be/view-file/74348>
- Sporza, Badminton Vlaanderen growth since corona (Feb 2024): <https://sporza.be/nl/2024/02/02/badminton-vlaanderen-telt-sinds-corona-8-3-meer-leden-en-42-meer-g-sporters-en-willen-nog-diverser-worden~1706877570326/>
- VRT, record number of sports club members in Flanders (Sep 2025): <https://www.vrt.be/vrtnws/nl/2025/09/03/nog-nooit-zoveel-sportleden-in-vlaanderen/>
- Badminton Nederland annual report 2021: <https://oud-jul2024.badminton.nl/uploads/documents/5.1-5.2-Jaarverslag-Badminton-Nederland-2021.pdf>
- Badminton Europe, members growth: <https://badmintoneurope.com/web/corporate/members-growth>
- FIP, Focus on Belgium (padel): <https://www.padelfip.com/2024/04/focus-on-belgium-a-history-of-more-than-30-years/>
- FIP World Padel Report 2025: <https://www.padelfip.com/2025/12/online-the-fip-world-padel-report-2025-a-comprehensive-analysis-of-a-sport-in-constant-growth/>
- DH, padel in Wallonia (Apr 2025): <https://www.dhnet.be/sports/tennis/2025/04/25/lotto-brussels-premier-padel-et-la-folie-du-padel-en-wallonie-le-padel-nest-plus-un-effet-de-mode-dit-crevits-CSPVTK26PFEJXFWU4FH637ZQSI/>
- Tennis Vlaanderen, Tennismakingsmaand press release (Apr 2025): <https://cdn.uc.assets.prezly.com/d34acd73-194a-4101-aa72-dbb76e85b187/-/inline/no/media-alerttennismakingsmaand04042025.pdf>
- Table tennis, unverified member estimate: <https://www.tabletennisdaily.com/forum/topics/usa-table-tennis-at-its-finest.2436/post-31730>
- Spond pricing (Capterra): <https://www.capterra.co.uk/software/181253/spond>
- Twizzit (GetApp): <https://www.getapp.com/all-software/a/twizzit/>
- SportEasy (FitGap): <https://us.fitgap.com/products/024553/sporteasy>
- TeamSnap pricing (Zoftwarehub): <https://zoftwarehub.com/products/teamsnap/pricing>
- Firestore pricing: <https://cloud.google.com/firestore/pricing>
- VRT, Ghent hall rates for loose minivoetbal teams (Apr 2026): <https://www.vrt.be/vrtnws/nl/2026/04/14/gent-minivoetbal-kritiek-tarieven-prijsverhoging-besparing-zaalv/>
- Gent, minivoetbal: <https://stad.gent/nl/sport/aanbod/vind-een-sport/minivoetbal>
- VRT, darts growth in Limburg (Oct 2023): <https://www.vrt.be/vrtnws/nl/2023/10/12/eerste-internationale-darts-gala-vindt-plaats-in-hasselt-zo-fi/>
