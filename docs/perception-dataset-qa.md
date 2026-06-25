# The Perception of the Police in Online Media — Dataset Q&A

*Answers grounded in the committed dataset (`src/content/perception/*.json`, built 23 June 2026, `methodologyVersion 2026.1`, `sample: false`). Where the live article currently over-claims relative to what the data actually supports, it is flagged **⚠ Honest caveat** rather than smoothed over.*

---

## Dataset scale

**How many articles are in the final dataset?**
**76,436 headline records** across the 26 years (sum of each year's `itemCount`).
⚠ Honest caveat: this counts *article–subject matches*, not unique articles. Each year is queried three times (the police generally / forces / leaders-officers-staff), so an article mentioning "a police officer" can be counted in more than one subject facet. The true count of *distinct* headlines is somewhat lower; the dataset does not store a de-duplicated cross-facet union.

**How many unique publishers?**
Effectively **one** — *The Guardian* — for the word analysis. Across the whole corpus only **three source labels** appear: `The Guardian` (all 26 years), `GDELT DOC 2.0` (a multi-outlet *aggregator* label, on 2017–2023 only), and `BBC News` (2025 only). The clouds, themes and word ranks are Guardian-derived throughout.

**How many total words analysed?**
**726,421 word-tokens** (sum of `corpusTokens` across the three facets, all years). These are **headline words only** — not article bodies.

**How many article headlines?**
The corpus is headline-only, so headlines = the 76,436 records above (with the same cross-facet-overlap caveat).

**How many articles per year on average?**
**~2,940** per year.

**Which year contains the fewest articles?**
**2000 — 1,412 records** (8,467 words). The earliest, thinnest year.

**Which year contains the most articles?**
**2011 — 5,048 records** (46,206 words) — the year of the England riots, the Duggan shooting, phone-hacking and the Stephenson resignation.

---

## Sources

**Which publishers are included?**
The Guardian (backbone, 2000–2025); GDELT DOC 2.0 as a breadth/tone aggregator on a handful of mid-decade years; BBC News on 2025 only.

**Is the dataset Guardian-only, or does it aggregate multiple sources?**
**Functionally Guardian-only.** It was *designed* to aggregate (GDELT, BBC, Wayback fetchers all exist), but live multi-source fetching from CI was abandoned after GDELT rate-limiting proved unworkable from a shared runner IP. The committed result leans almost entirely on the Guardian.

**If multiple sources, how many contribute before 2005?**
**One** (The Guardian). 2000–2016 are all Guardian-only.

**How many contribute after 2020?**
The Guardian every year; GDELT contributed counts to 2020–2023; BBC News to 2025. So nominally up to three labels, but the Guardian dominates and GDELT is itself an aggregator, not a single masthead. Treat post-2020 as **Guardian-dominant with partial breadth**, not genuine multi-publisher coverage.

**How exactly is the diversity index calculated?**
Normalised Shannon entropy of the per-year outlet shares (`scripts/build-perception.mjs`):

```
H = −Σ pᵢ · ln(pᵢ)        (pᵢ = outlet i's share of that year's records)
diversityIndex = H / ln(k)  (k = number of distinct outlets; 0 if k = 1, null if k = 0)
```

0 = one outlet carries everything; 1 = perfectly even spread.
⚠ **Honest caveat — this is the article's weakest claim.** In the committed data the index is **0 for 22 of 26 years** (only 2020 = 0.817, 2021 = 0.817, 2025 = 1.0). The article says diversity "climbs as the press moves online, with breadth widening from around 2008 and again from 2017" — **the committed numbers do not show that**. The index honestly reports a near-single-source corpus; the prose should be corrected to match, or the claim dropped.

---

## Collection method

**How were articles identified as being "about policing"?**
By query selection at fetch time. An article entered a facet's corpus if it matched that facet's search terms (Guardian Content API, `production-office=uk` to keep it UK-desk). No relevance was inferred from the body — selection is by the search query plus the UK-desk filter.

**What search terms were used?** (`scripts/perception/config.mjs`, `FACET_QUERIES`)
- **The police, generally:** `police`, `policing`, `constabulary`, `"police force"`, `"law enforcement"`.
- **British police forces:** the named territorial forces plus `"met police"`, `"city of london police"`.
- **Leaders, officers & staff:** `"police officer"`, `"chief constable"`, `"police commissioner"`, `"police and crime commissioner"`, `"police constable"`, `"police sergeant"`, `"community support officer"`, `"special constable"`, `"police staff"`.

Ambiguous bare words (`force`, `officer`, `commissioner`, `sergeant`) were deliberately dropped or qualified with "police" so armed forces / loan officers / EU commissioners don't leak in.

**Were articles manually reviewed at any stage?**
**No.** The pipeline is fully deterministic — keyword selection, lemmatised token counting, dictionary sentiment, dictionary themes. There was no human read of individual articles. (The *lexicons and stopword lists* were hand-curated and iteratively reviewed against the real top-words output, but no article was individually classified by a person or an AI.)

**How were duplicates removed?**
Within the Guardian feed, the API returns one canonical copy per article, and pagination uses `order-by=newest` for a deterministic non-overlapping sweep. ⚠ Honest caveat: there is **no near-duplicate / wire-syndication de-duplication** implemented in the committed build pipeline. The article's claim that "wire copy … is de-duplicated so syndication cannot inflate a phrase's weight" describes a *designed* (MinHash/Jaccard) step that was never needed once the corpus collapsed to a single non-syndicating source — but as written it overstates what the code does. Recommend softening it.

**How was syndicated content identified?**
It wasn't, in the shipped corpus — see above. Syndication de-dup was scoped for the multi-source design that was abandoned. With a single-publisher corpus the risk is largely moot, but the prose should not imply a dedup step ran.

---

## Sentiment / tone

**What sentiment model or method was used?**
A **lightweight dictionary (lexicon) method** — *not* a trained model. Two hand-built AFINN-style word lists (`POSITIVE`, `NEGATIVE` in `scripts/perception/lexicons.mjs`) scoped to how the press writes about policing (`praise`, `hero`, `reassuring`… vs `scandal`, `misconduct`, `brutality`, `crisis`…). Each headline is scored by counting positive vs negative hits.

**Is sentiment calculated from headlines, article text, or both?**
**Headlines only.** No body text is fetched or stored.

**What does a score of 0 mean?**
Two different numbers are on display, so it's worth separating them:
- **Mean tone** (`sentiment.mean`, range −1…+1): per headline, `(positiveHits − negativeHits) / (positiveHits + negativeHits)`, averaged over the year. **0 = balanced** — as many positive as negative sentiment words, or none at all (a neutral, factual headline).
- **Sentiment view percentages** (0–100% in the explorer): the share of headlines classified positive or negative. **0% = no headlines** of that polarity that year.

**What does a score of 100 mean?**
Only the percentage lines reach 100: **100% would mean every classified headline that year carried that polarity.** The mean-tone scale never reaches 100 — its extremes are −1 (every scored word negative) and +1 (every scored word positive).

**Can you provide example positive and negative scores from real years?**
From the committed `police-general` facet:

| Year | Mean tone | % negative headlines | Note |
|---|---|---|---|
| 2004 | **+0.053** | 3% | the most *favourable* year |
| 2000 | 0.000 | 0% | flat/neutral (thin early sample) |
| 2011 | −0.058 | 9% | riots year — high volume, not yet peak negativity |
| 2015 | −0.145 | 17% | survey-confidence *peak*, yet tone already clearly negative |
| 2021 | −0.198 | 23% | Sarah Everard |
| 2022 | **−0.208** | 23% | Charing Cross / Carrick — the **most negative year** |
| 2025 | −0.157 | 18% | partial recovery |

---

## Themes

**How were the five themes selected?**
They are the article's editorial spine — **trust, misconduct, reform, race, leadership** — chosen to track the documented arc of UK policing debate (Macpherson → Casey). They're defined as keyword lexicons in `scripts/perception/lexicons.mjs`.

**Are they dictionary-based keywords?**
**Yes.** Each theme is a curated term list (e.g. *misconduct* = `corruption, scandal, brutality, racist, misogyny, rape, sacked, vetting…`). A headline "mentions" a theme if it contains ≥1 of that theme's terms.

**Are they AI-classified themes?**
**No.** No model classification — pure keyword matching, fully reproducible.

**Can themes overlap?**
**Yes.** Each theme is tested independently per headline, so one headline can count toward several themes at once (a "racist misconduct scandal" hits *misconduct*, *race* and arguably *reform*). The theme counts are therefore not mutually exclusive and won't sum to the article count.

**How many theme mentions are recorded across the whole corpus?**
**16,661 theme-mentions** (all facets, all years):

| Theme | Mentions |
|---|---|
| reform | 4,889 |
| misconduct | 4,564 |
| leadership | 3,761 |
| race | 2,890 |
| **trust** | **557** |

---

## Key findings

**What is the single strongest statistical finding from the dataset?**
**Police-headline negativity rose roughly fourfold across the quarter-century and peaked in 2021–2022.** The share of negative-classified headlines climbed from ~3–5% (2000–2004) to 15–17% (mid-2010s) to **23% in 2021 and 2022**, and mean tone fell almost monotonically from ~0 to **−0.21**. The trough sits exactly on the Everard→Charing Cross→Carrick→Casey cluster — a clean, well-evidenced signal.

**What finding surprised you most?**
That **"trust" is by far the rarest theme** — 557 mentions against misconduct's 4,564. The press almost never frames policing in the explicit *language* of trust/confidence/legitimacy; it writes about the police through misconduct, reform and leadership instead. The thing the surveys measure (confidence) is the thing the coverage least often *names*.

**Did any expected trend fail to appear?**
**Yes — the "peak then fall" shape didn't appear in the language.** Survey confidence rose, peaked ~2015, then fell. The media tone series shows **no 2015 peak** — negativity just keeps rising through the whole period. So the headline-language curve and the public-confidence curve are **not the same shape**, which has direct consequences for the next section.

---

## Confidence and trust — what is actually being claimed?

You're right that the article drifts between three positions. Here is what the **data** can and cannot support:

- **"Media language *reflects* public perception"** — only weakly. The two curves diverge (no shared 2015 peak), so the language is not a clean mirror of confidence.
- **"Media language *influences* public perception"** — **the dataset cannot support this at all.** There is no causal design, no individual-level exposure data, no counterfactual. Any influence claim is outside the evidence.
- **"Media language *forms part of the information environment* people consume"** — **this is the only fully defensible claim,** and it's the one the data actually demonstrates: a measurable, datable shift in how the most-read UK broadsheet worded police coverage.

⚠ Recommendation: **commit explicitly to the third position** and state up front that the media curve and the survey curve are *related but distinct* series — not proxies for each other. That divergence is a finding, not a flaw; lean into it.

---

## Social-media section

**Why include algorithmic feeds at all?**
As **context for how readers encounter** police coverage — the shift from front page to ranked feed over the same window. It's framed as background, not mechanism.

**Does your dataset contain social-media content?**
**No.** Zero social posts, engagement metrics or platform data. The corpus is news headlines only. The social-media milestones are a hand-curated `context.json` overlay (dated events + a UK social-news-adoption series), not measured data.

**Is there any measured relationship between your tone series and social-media milestones?**
**None.** No correlation is computed, no statistical link is tested. The overlay is a visual annotation the reader can switch on; the article explicitly declines to assert causation.

**Is it simply contextual background?**
Yes — and ⚠ you're right that it's the **weakest evidential link in the piece.** It mixes a rigorously-derived in-house series (the tone line) with an off-dataset narrative (feeds amplify negativity). Honest options: (a) keep it but quarantine it clearly as "context, not evidence — and not from this dataset," or (b) cut it to a short closing aside. Given everything else here is reproducible from committed counts, the strongest move is to make the seam between *measured* and *contextual* unmissable.

---

## What makes this project unique?

**What can a reader learn here that they cannot learn from ONS confidence surveys?**
The **vocabulary** of the change. Surveys give a single confidence number per year; they don't tell you that coverage moved from *reform/community/reassurance* to *misconduct/vetting/abuse*, which forces and which named individuals carried the story, or that "trust" is the word the press least often reaches for. This dataset is a record of *language*, not opinion.

**What question does this dataset answer better than surveys?**
*"In what terms did the national press talk about the police, year by year — and how did those terms change?"* A survey can't answer that; a longitudinal word analysis is purpose-built for it.

**Why should somebody spend five minutes exploring the visualisations?**
Because they can **watch a relationship break down in the language itself** — press play and see the optimistic mid-2000s vocabulary harden, year by year, into the crisis vocabulary of the 2020s, with the named events surfacing exactly where the tone dips. It turns an abstract "confidence fell" into something you can read in the words.

---

## On Question 40 — the reframe

Your instinct is the right one, and the data backs it. **"Surveys tell us *whether* confidence rose or fell. This dataset shows the *language* that accompanied that change."** That should be the thesis in the first two sentences.

And the dataset gives that frame a sharper edge than you may have realised: the media-language curve and the survey-confidence curve **are not the same shape** — confidence peaked around 2015 while the language kept darkening straight through. So the honest, distinctive argument isn't "the words mirror the mood." It's:

> *Surveys measure how people feel about the police. This dataset measures the words the press used while that feeling changed — and the two don't move in lockstep. The language is its own story.*

Build the piece around that and three problems solve themselves at once: the reflect/influence/environment drift collapses into the defensible third position; the social-media section becomes an optional aside rather than a load-bearing claim; and the reader has a reason to care before the first chart.

---

*Source of record: `src/content/perception/*.json` + `index.json` (built 2026-06-23). Pipeline: `scripts/perception/` (fetch + analyse), `scripts/build-perception.mjs` (normalise + diversity), `scripts/generate-perception-clouds.mjs` (clouds + client bundle). No article body text is stored anywhere in the dataset — only derived counts and headline-level provenance.*
