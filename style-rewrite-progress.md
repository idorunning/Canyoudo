# Style rewrite progress

Tracks the oldest-first sweep applying `writing-style.md` (all pieces) and, where
the piece is a genuine news report rather than an essay/argument,
`police-oracle-style-guide.md` (see that file's "When to use it" test — most
articles stay in the essay register and only need the `writing-style.md`
cleanup, not a register switch).

**Two standing instructions from Nathan, apply to every pass:**
- **Never change the headline/title.** Style, structure and evidence can
  change; the title frontmatter field doesn't.
- **Each pass is also a fact-check pass, not just a style pass.** Verify the
  load-bearing claims and figures with a live search before touching the
  prose — check whether a cited stat still has a traceable source, whether a
  named tool/model/policy is still current, and whether anything has moved
  on since the article's last `updatedDate`. Fix what's wrong or outdated,
  add a source where a claim currently has none, and note in the commit
  message what changed and why. Don't invent figures or citations — if a
  claim can't be verified, flag it rather than silently dropping or altering
  it.

Queue order = `pubDate` ascending, published articles only (`draft: true`
articles are excluded — they're not live, nothing to keep consistent with the
rest of the site until they're published). Regenerate the queue with:

```
for f in src/content/articles/*.md src/content/articles/*.mdx; do
  pubdate=$(grep -m1 '^pubDate:' "$f" | sed 's/pubDate:\s*//')
  draft=$(grep -m1 '^draft:' "$f" | sed 's/draft:\s*//')
  [ "$draft" = "true" ] && continue
  echo "$pubdate|$(basename "$f")"
done | sort
```

Mark a row done by ticking it and adding the commit that did the rewrite.
Re-run and re-triage the queue any time `writing-style.md` or
`police-oracle-style-guide.md` changes materially — an earlier pass may no
longer match the current guide.

## Queue

- [x] 2025-02-18 — `boosting-public-confidence-through-neighbourhood-policing.md` — essay register, `writing-style.md` cleanup (banned corrective-antithesis/tricolon repeats, academic framing, over-bolding; added a case-study evidence caveat)
- [x] 2025-03-25 — `when-seeing-is-no-longer-believing-the-ai-generated-content-threat-to-criminal-justice.mdx` — already a strong style match, no prose rewrite needed; fact-check pass corrected an outdated model reference (OpenAI's Sora, named as current, shut down April 2026) and a real gap in C2PA's reliability as a provenance signal (independent 2026 testing found a tampered manifest validating as untampered), and added missing sourcing for the deepfake-volume and CCTV-retention stats plus a newer EU AI Act Omnibus detail
- [x] 2025-05-06 — `the-officers-were-losing-why-british-policing-must-rethink-cognitive-diversity.md` — essay register, heavy `writing-style.md` cleanup (consultant-speak, broken subheading, run-on paragraphs) plus real evidence corrections: the ENIGMA-ADHD brain-volume claim was misattributed to Barkley and overstated (largest study found differences in children, not adults), the "neurodivergent employees" process-improvement claim was actually about autistic employees specifically (Hartman et al. 2023), added a full Sources section (previously had none despite several specific stats)
- [x] 2025-06-17 — `when-police-stop-investigating-crime-the-fuel-theft-crisis-hurting-british-policing.md` — already the site's own model example for the "Consider…" cold open (left untouched); light cleanup of self-referential meta-commentary; fact-check found the "loss of more than 20,000 officers" resourcing claim is now outdated — the Police Uplift Programme fully replaced that loss by March 2023 and numbers peaked at an all-time high in March 2024, which actually sharpens the article's real point (this is a prioritisation choice, not a staffing shortage); added a Sources section (previously had none)
- [x] 2025-07-29 — `the-hidden-crisis-how-police-burnout-threatens-officer-safety-and-public-trust.md` — was ~220 lines of HR-training-manual listicle sprawl (bureaucratic "within 72 hours / within 4 weeks / within 6 months" checklists, a vendor-by-vendor programme catalogue) with ~40 largely uncited statistics. Condensed to essay length, verified the core evidentiary claims (What Cops Want 2024 survey, Kop & Euwema 2001, Williamson & Feyer 2000 sleep/BAC equivalence), corrected a misattribution (the BAC-equivalence figures are Williamson & Feyer, not NIJ), flagged RITE Academy's "Block-Out Syndrome" as commercial terminology rather than peer-reviewed science, and replaced the 40-year-old "3x suicide rate" figure's silent presentation as current with its actual source and a more recent comparison figure. Not every one of the ~40 original statistics was individually re-verified given the piece's scale — the ones kept are the load-bearing, checkable ones; the exhaustive programme catalogue was cut rather than fact-checked line by line.
- [x] 2025-10-21 — `the-legal-aid-paradox.mdx` — already well-sourced with a full References section; essay register. Removed American spellings (criticized→criticised) and a banned metaphorical "navigate"/"differently than", trimmed consultant-speak, gave it a proper bold standfirst open. Fact-check: core claims (40% adult waiver, Cadder 2010, Confait case, JUSTICE Scotland "6% understood rights", Nottingham 52.8–64.1%) all verified; corrected one attribution — the non-waiver rule for under-16s/vulnerable adults is the Criminal Justice (Scotland) Act 2016 (ss.32–33), which followed Cadder, not Cadder itself. Added the 2016 Act to references.
- [x] 2026-01-07 — `do-you-understand.mdx` — already strongly in voice (kept the distinctive dry asides — "that's on me pal", "Did someone say Brits on holiday?", "olde world legal jargon"). Fixes were mechanical: the article used a `⦁` unicode character for all 13 bullets, which does not render as a markdown list — converted to `-`; promoted two orphan heading-lines to `##`; gave it a bold standfirst open; made the numbered policy list's formatting consistent. Fact-check: the two load-bearing legal claims (Equal Treatment Bench Book's "checking understanding" guidance against "do you understand?"; Criminal Practice Directions 2023 as amended Nov 2025, "every reasonable step" duty) both verified. Added a Sources section (had none).
- [x] 2026-04-29 — `should-britain-drill-baby-drill-the-north-sea-question-in-plain-english.mdx` — confirmed strong exemplar; no prose rewrite. Fact-check spot-checked the load-bearing figures: AR7 offshore-wind auction (£91/MWh, Jan 2026) ✓, Court of Session Rosebank/Jackdaw unlawful ruling (Jan 2025, Lord Ericht, per Finch) ✓. One figure had moved: Norway's sovereign wealth fund is over $2 trillion by 2026 (article said $1.5tn), updated.
- [x] 2026-06-05 — `the-drug-thats-already-here-what-nitazenes-mean-for-british-policing.md` — exemplary already: 32 footnotes, clean evidence separation, strong voice. No prose rewrite. Fact-check confirmed the anchor claims (NCA ~1,000 deaths since June 2023, Biggar "extraordinary", NSA 2026; ONS 195/52 deaths). One accuracy fix: body said Poleszak was "sentenced in 2026" but he has only pleaded guilty — sentencing is 17 July 2026 — corrected to match the article's own footnote, and added the Cornwall death link the NCA confirmed. (Title left as-is per keep-headlines rule, including its "New drug" capitalisation.)
- [x] 2026-06-05 — `what-palantirs-advance-means-for-british-policing-and-should-we-trust-them.md` — strong, well-sourced, in-voice (separates strong/weak claims, gives Palantir's case at its strongest). No prose rewrite. Fact-check verified all three anchor claims (£9m firearms contract June 2026; Met £50m block by Deputy Mayor 20 May 2026; Commons SIT Committee "unacceptable point of weakness" 3 June 2026). One development added: Palantir has since taken the mayor's policing office to the High Court to overturn the Met refusal (trial listed Jan 2027) — strengthens the "precedent worth noting" section rather than dating it.
- [x] 2026-06-06 — `the-neighbourhood-policing-guarantee-confidence-or-crime.md` — **verified, no changes needed.** Already exemplary: perfect house voice (the "scoreboard" refrain, proper counter-argument handling), correct evidence-based reasoning (an accurate application of the Koper curve, Sherman-Weisburd hotspot RCT and Weisburd's crime-concentration law), fully footnoted. Fact-check confirmed the recent policy specifics — White Paper "From Local to National" (26 Jan 2026, CP 1489) and the Guarantee milestones (3,000 met early in Jan 2026, 13,000 by 2029). Deliberately did NOT bump `updatedDate` or edit the prose, since there was nothing to correct — forcing a diff would be dishonest.
- [ ] 2026-06-07 — `jerry-ratcliffe-and-the-case-for-intelligence-led-policing.md`
- [ ] 2026-06-07 — `lawrence-sherman-and-the-invention-of-evidence-based-policing.mdx`
- [ ] 2026-06-07 — `more-or-less-and-the-art-of-not-being-fooled-by-numbers.md`
- [ ] 2026-06-07 — `reading-the-data.md`
- [ ] 2026-06-07 — `sir-robert-peel-and-the-invention-of-policing-by-consent.mdx`
- [ ] 2026-06-07 — `the-murder-of-henry-nowak-what-the-court-found.md` (likely a Police Oracle news-register candidate — court outcome, "who did what, when")
- [ ] 2026-06-08 — `susanne-knabe-nicol-and-the-last-mile-of-evidence-based-policing.md`
- [ ] 2026-06-11 — `jason-roach-and-the-art-of-catching-criminals-by-their-small-mistakes.md`
- [ ] 2026-06-11 — `the-society-of-evidence-based-policing.md`
- [ ] 2026-06-12 — `martyns-law-what-it-is-and-what-happens-next.md` (already flagged in `writing-style.md` as a strong exemplar — check only, likely no rewrite needed)
- [ ] 2026-06-13 — `does-domestic-abuse-spike-when-england-play.md`
- [ ] 2026-06-14 — `policeai-a-police-leaders-guide.mdx`
- [ ] 2026-06-15 — `a-police-leaders-simple-guide-to-ai.mdx`
- [ ] 2026-06-16 — `alex-murray-and-the-rise-of-evidence-based-policing.md`
- [x] 2026-06-17 — `self-selection-policing-catching-serious-criminals-and-bad-cops-through-minor-offences.mdx` — news register (Police Oracle), commit `537fa3e` (worked example that shaped the style guide)
- [ ] 2026-06-17 — `standard-medium-high-grading-domestic-abuse-risk.mdx` (already flagged in `writing-style.md` as a strong exemplar — check only, likely no rewrite needed)
- [ ] 2026-06-17 — `the-power-of-civil-orders.mdx` (already flagged in `writing-style.md` as a strong exemplar — check only, likely no rewrite needed)
- [ ] 2026-06-25 — `the-perception-of-the-police-in-online-media.mdx`
- [ ] 2026-07-10 — `how-worthing-became-the-shoplifting-capital-of-the-uk.md`

## Excluded (draft, not published)

- `policing-the-police-why-the-small-stuff-matters.md` (2025-09-09, `draft: true`)
- `cracking-the-somerton-man-code.md` (2025-12-19, `draft: true`)
- `what-open-source-research-can-tell-us-about-missing-people-in-britain.md` (2026-06-05, `draft: true`)

## Narration (OpenAI TTS)

Do **not** hold narration back until the whole queue is done. Regenerate audio
per article, right after that article's rewrite is published — `pubDate`/body
hash changes automatically invalidate the cached MP3 in
`scripts/generate-audio.mjs`, so each rewrite gets fresh narration on the next
build with `AUDIO_ALLOW_SYNTHESIS=true`, at no extra cost over doing it later.
Batching it to the end would leave rewritten text paired with stale audio for
the entire sweep.
