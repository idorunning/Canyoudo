# Research tools and features — what to build next

Written alongside the Blue Book design pass (July 2026). It supersedes the
feature list in `docs/design/identity-and-features.html` by carrying the
still-good items forward, dropping what has since shipped, and adding the
tools that the new design language now has somewhere to put.

**What already exists**, so nothing below duplicates it: the Research
Assistant (three modes — search, overview, cited review with PDF export,
`docs/research-assistant-v4.md`), the Crime Dashboard and Crime Data Explorer
(data.police.uk, refreshed monthly), the Perception Explorer (a quarter
century of UK news language), Practical Summaries, the saved library and
offline reading, audio editions, site search, and accounts.

Each item below says what it does for the reader, what it needs, and roughly
what it costs to build. "Small" is a weekend; "medium" is a few weekends;
"large" is a project.

---

## Tier 1 — build first: these define what the site is

### 1. An evidence-strength rating on every paper

The College of Policing rates every intervention in its Crime Reduction
Toolkit against EMMIE — effect, mechanism, moderators, implementation,
economic cost — and prints the rating where you can filter and sort on it.
This site argues about *how we would know*, and currently asks readers to
take each piece's evidential strength on trust.

Rate the evidence behind each article — systematic review, randomised trial,
quasi-experimental, observational, single case, expert opinion — and print it
on the paper. It costs a frontmatter field and a component.

The design language already has the parts: a `.surface-well` panel, a
`.rule-head`, `.u-datum` labels and a five-segment meter built from
`--accent` (evidenced), `--ink-300` (untested) and `--flag` (reserved for the
case EMMIE allows and most write-ups quietly drop — an intervention the
evidence shows makes things *worse*). Empty must mean untested, not weak:
those are different claims and the mark must not conflate them.

*Source: College of Policing, EMMIE. **Small build, highest value.***

### 2. A "what the evidence says" index

The flagship. A browsable index of interventions — hot-spot patrol, focused
deterrence, problem-oriented policing, body-worn video, stop and search,
neighbourhood teams — each with direction of effect, strength of evidence,
rough cost, and links to the articles here that cover it. The College's
toolkit rewritten in this site's voice, which is worth doing because theirs
is written for people already inside the profession and this one is readable
by anyone.

Steal their "pin to compare" interaction. It is the rating from (1) applied
to interventions instead of papers, so build (1) first.

*Source: College of Policing Crime Reduction Toolkit. **Large build,
defining.***

### 3. A CPD log officers can export

Every officer and member of police staff has to evidence continuing
professional development for their PDR, and almost nobody enjoys assembling
it. The site already has accounts, a saved library, reading-time data and
jsPDF. Add a control that records what was read, when, for how long, and a
free-text reflection — then exports the year as a signed-looking PDF.

It is the feature most likely to make someone create an account, and it is
worth far more once what was read carries an evidence rating.

*Source: Police Oracle's CPD offer, and the PDR process itself. **Small
build, highest pull.***

---

## Tier 2 — strong, and cheaper than they look

### 4. A source index

The site cites heavily and nowhere can a reader see the whole body of
evidence it draws on. One page listing every study, report and dataset cited
anywhere, with which articles use it, generated from existing citations.
Cheap, genuinely useful to a researcher, and a quiet authority signal almost
no site offers. In the Blue Book it is a ruled table in the label voice, with
`.chip` filters by source type.

***Small build, distinctive.***

### 5. Corrections and methodology pages

A dated corrections log — what changed, and whether the conclusion survived —
beside a page explaining how evidence is rated here and what the ratings
mean. A publication that argues for evidence and does not publish its own
error record is making an argument it has not accepted itself. `--flag` earns
its place in the palette here.

***Small build, trust.***

### 6. Stat check, as a standing feature

"More or Less Policing" already exists as a topic. Make it a recurring,
indexed feature with a fixed shape: the number in circulation, where it came
from, what it actually measures, and a verdict. One a fortnight, short. The
most shareable thing this site could publish and the clearest demonstration
of the masthead promise — and the share card system already renders a figure
and a verdict well.

*Source: BBC More or Less, Full Fact. **Small build, very shareable.***

### 7. Reading paths by role

"New sergeant", "response officer", "analyst", "on a promotion board",
"writing a business case" — each a short ordered path through articles that
already exist. Pure curation over existing content, no new writing, and it
answers the question a first-time visitor actually has.

***Small build, good retention.***

### 8. Briefing packs

Select several papers and export one PDF with a cover, contents and sources —
something to take into a meeting or hand to a chief officer. The PDF
machinery already exists for single articles and for the research review.
This is how the writing gets into rooms you are not in.

***Small build, reach.***

### 9. A news register in the site's own voice

There is a full Police Oracle style guide in the repository — inverted
pyramid, present-perfect lead, attribution throughout, a quarantined Analysis
block — and the site publishes nothing in that register. The homepage news is
aggregated third-party headlines that link away. Short reports of your own on
HMICFRS publications, College releases, court outcomes and misconduct
findings would give people a reason to come back weekly rather than when an
essay lands.

*Source: `police-oracle-style-guide.md`. **Medium build, ongoing cost.***

---

## Tier 3 — new tools the data already supports

These are additions since the earlier feature review, and each one leans on
data the site already ingests.

### 10. Force comparison, side by side

The dashboard reads one force at a time. A two- or three-force comparison —
recorded crime per 1,000, stop-and-search rate and disparity ratio, outcome
rates, workforce size — is the question every reader of a force page actually
has next ("is mine unusual?"). The bundle in `src/lib/policedata-bundle.json`
already holds every force; this is a view, not an ingest.

***Small build, high traffic.***

### 11. A "what changed this month" digest

The dashboard refreshes monthly and says nothing about what moved. A short
generated digest — the largest month-on-month movers by force and category,
with the caveats the `CaveatBanner` already carries — turns a static
dashboard into a reason to return. Publishable as a post and as an email.

***Small build, retention.***

### 12. Freedom-of-information tracker

Requests made, what was asked, which force answered, how long it took, and
the disclosed document. Almost nobody publishes their FOI trail; doing so is
both a research asset and the strongest possible statement of method. A
content collection plus a ruled table.

***Small build, distinctive.***

### 13. A policy-document diff

Codes of practice, APP guidance and statutory codes change quietly. Keep
dated snapshots of a handful of key documents and show what changed between
versions. Nothing in UK policing does this, practitioners would use it, and
the design language has the parts already (well surfaces, mono, `--flag` for
removals, `--accent` for additions).

***Medium build, genuinely novel.***

### 14. Ask this article

The research assistant answers from the whole corpus. A narrower control on a
single article — ask a question, get an answer drawn only from *this* piece
and its cited sources, with the passage highlighted — is cheaper, faster, and
much easier to keep honest, because the retrieval set is one document. It
also suits the long essays better than a general chat window.

***Medium build, fits the assistant already built.***

### 15. A cost-of-a-decision calculator

Officer hours, custody hours, a court file, a PACE clock — a small calculator
that turns a proposed operational change into an hours-and-pounds estimate,
with every rate sourced and editable. Business cases are what practitioners
actually have to write, and this is the arithmetic they do badly in Excel.

***Medium build, high practitioner value.***

### 16. Alerts and a saved-search digest

The research assistant already searches College, gov.uk, Crossref, Europe PMC
and CORE. Let a signed-in reader save a query and receive new matches weekly.
It reuses the whole source layer, and it is the natural bridge between the
tools and the newsletter.

***Medium build, uses what exists.***

---

## Deliberately not

- **A jobs board, eLearning, talent pools.** Police Oracle's commercial core,
  and they work because a company staffs them. For one person they would
  consume everything and dilute what the site is for. Link out instead.
- **"Most commented".** Standard on trade press, and it optimises for the
  wrong thing: it promotes whatever is most argued about, not what is best
  evidenced. On a site whose whole point is the difference between those two,
  it would undercut the argument.
- **A general-purpose chatbot on the homepage.** The assistant works because
  it is scoped to retrieved sources. An open chat window would make claims the
  site cannot stand behind.

---

## If you only do one

**The evidence rating.** It is a frontmatter field and a component, it
changes nothing about how you write, and it turns the masthead promise into
something a reader can see on every page rather than take on trust.
Everything else here is easier to argue for once it exists: the what-works
index is the same rating applied to interventions, the CPD log is worth more
when what was read carries a strength, and the source index and corrections
log are the two halves of the same claim.
