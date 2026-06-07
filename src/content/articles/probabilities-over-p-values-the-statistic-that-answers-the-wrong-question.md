---
section: "police-policy"
title: "Probabilities Over p-Values: The Statistic That Answers the Wrong Question"
description: "Policing trials report p-values and statistical significance. But a p-value cannot tell a chief how likely an intervention is to work, or whether it is worth the money. The case for reporting probabilities instead — explained in plain English, with the evidence."
pubDate: 2026-06-07
thumbnail: "/images/prob-over-pvalues-chart1-decision-bands.png"
tags: ["evidence-based-policing", "statistics", "p-values", "decision-making", "research", "what-works", "policy", "police"]
---

A chief constable is handed the result of a trial. A new scheme to cut repeat burglary was tested across a dozen neighbourhoods, and the evaluation reports that it worked, with a p-value of **0.04**. Rolling it out across the force would cost a little under £2 million a year. The question in the room is simple: do we spend the money?

The p-value cannot answer it. Not because the trial was poor, but because a p-value is the answer to a question almost nobody in that room is asking. This piece sets out, in plain terms, what a p-value actually tells you, what it does not, and why a different way of reporting the same evidence would line up far better with the decisions police leaders are paid to make. The maths is kept to the minimum the argument needs, because the point here is the decision, not the derivation.

## What a p-value actually says

Start with what that 0.04 means, because it is almost always misread.

The p-value imagines a world in which the scheme does nothing at all — zero effect, every apparent improvement down to luck. It then asks: in that imaginary do-nothing world, how often would a fluke at least as large as the one we saw turn up by chance? The answer here is about 4 times in 100.[^1]

That is the whole of it. A p-value is a statement about data in a hypothetical world where the intervention is useless. It is not a statement about whether the intervention is useless.

The trap is to read "p = 0.04" as "a 4% chance the scheme doesn't work, so a 96% chance it does." That reading is wrong, and the error is not subtle.[^2] The p-value started by *assuming* the scheme does nothing and never circles back to tell you how likely that assumption is. To get from the data to "how likely is it to work?" you need to feed in how plausible the effect was to begin with and how large it is — exactly the quantities a bare p-value leaves out. The American Statistical Association said as much in 2016, in a rare formal intervention: a p-value "does not measure the probability that the studied hypothesis is true."[^2] Decades of evidence show the misreading is the norm, not the exception, among researchers and the people they report to.[^3]

So the chief who reads 0.04 as "96% likely to work" has been misled by the format, not the finding. And the figure they actually want — the probability the scheme works, and works enough to be worth £2m — is nowhere on the page.

## Clearing a low bar is not the same as mattering

There is a second problem, and it is quieter but just as costly.

Statistical significance is a threshold for *noticing* an effect. It is not a measure of how big that effect is. Run a trial across enough neighbourhoods and a tiny improvement — two fewer burglaries a year across the whole force — can clear the p < 0.05 bar comfortably. The result is "statistically significant" and operationally trivial. Run a smaller trial, and a useful effect can miss the threshold and be written up as a failure.[^2]

The word "significant" does a lot of damage here, because in plain English it means *important*, and in statistics it means *detectable*. The two come apart all the time. A trial can be significant and pointless, or non-significant and promising. A chief who treats the p < 0.05 stamp as a green light, and its absence as a red one, is being steered by a word that was never doing the job they think it was.

None of this is an argument for being softer on evidence. It is an argument that the standard report answers a narrow technical question and then leaves the decision-maker to make the leap to a practical one on their own, usually without noticing they have leapt.

## The question a chief is actually asking

Scott Mourtgos, a serving police executive turned academic, set this out for policing in the *Justice Evaluation Journal* in January 2026. His argument is that null-hypothesis significance testing — the p < 0.05 machinery — dominates policing research while telling leaders almost nothing about "the operational, fiscal, and political uncertainty they actually face." His fix is to report the thing the chief wanted in the first place: the probability that an intervention clears a bar the force has defined in advance.[^4]

That bar might be an effect size ("at least a 10% cut in repeat burglary") or a cost test ("a saving that covers the £2m"). Instead of "is the effect detectable?", the report answers "what is the probability this clears the bar that matters to us?" — and then ties that probability to a decision.

Mourtgos packages this as **PASS**: proceed, adjust, stall, or scrap. The thresholds are set by the force, but the logic is the one leaders already use for risk.

![A horizontal probability scale from 0 to 100 per cent divided into four decision bands — scrap, stall, adjust and proceed — with example probabilities marked: 10 to 20 per cent for scrap, around 50 per cent for stall, 70 to 80 per cent for adjust, and 90 per cent or more for proceed.](/images/prob-over-pvalues-chart1-decision-bands.png)
*The reframe in one picture. The question is no longer "is it significant?" but "how likely is this to clear the bar we care about?" — and the answer points to an action. Bands are illustrative; the force sets them.*

Worked through, it reads the way an operational conversation already does. If the analysis says there is a **90% or greater** probability that a new use-of-force training package reduces use-of-force incidents, you proceed and roll it out. If the probability sits at **70 to 80%**, promising but not nailed down, you adjust — pilot it in a few areas, or tune it to local conditions. Around **50%**, a coin flip, you stall and wait for more data. And if the probability of benefit is only **10 to 20%** while the costs are real, you scrap it.[^4] Mourtgos walks through three cases this way: a use-of-force training study, a hot-spots patrol experiment, and a real victim-engagement scheme. In each, the output is not a verdict of significant-or-not but a probability attached to a decision.

Notice what this does to our burglary trial. "p = 0.04" becomes something like: "an 85% probability the scheme cuts repeat burglary by at least 10%, and a 60% probability it pays for itself." Those are two numbers a chief can actually weigh against £2m and against everything else competing for the money. The evidence has not changed. The register has.

## The framing is not cosmetic — it changes the decision

It would be fair to ask whether any of this matters in practice, or whether it is a stylistic preference dressed up as a reform. Here the evidence is unusually direct.

Akisato Suzuki, then at University College Dublin, ran a survey experiment on **517 people** in Ireland. Each was given the same kind of decision — whether to introduce a new bus line to cut traffic — and the same underlying evidence about how well it would work. The only thing that changed between groups was how the uncertainty was *worded*. Some saw it as statistical significance with a p-value; others saw it as a straight probability that the estimate was right.[^5]

When the evidence was strong, the wording barely mattered: **82%** backed the policy under the p-value framing, **91%** under the probability framing. But when the evidence was weaker — the same weaker evidence for both groups — the two framings split apart. Under the probability wording, support held at **83%**. Under the p-value wording, it collapsed to **39%**.

![A grouped bar chart. With strong evidence, support for the policy is 82 per cent under p-value framing and 91 per cent under probability framing. With weaker evidence, support is 39 per cent under p-value framing but 83 per cent under probability framing — a 44-point gap produced by wording alone.](/images/prob-over-pvalues-chart2-framing-survey.png)
*Same evidence, same uncertainty, two ways of writing it down — and a 44-point swing in what people decided. Source: Suzuki's survey experiment in Ireland.*

A 44-point swing from wording alone. The p-value framing pushed people toward an all-or-nothing reading — over the line or not — while the probability framing let them see uncertainty as a dial, which is what it is. Suzuki's reading is that the significance format hides the continuous nature of the evidence; the probability format shows it.[^5] For anyone commissioning trials, the lesson is uncomfortable: the format you choose is not a neutral container. It moves the decision.

## Why this lands now

This would be a technical footnote if policing were not being pushed, hard, toward "data-guided" decisions. The January 2026 White Paper makes data and evidence central to how forces are meant to work, and a new national performance framework will measure them on it.[^6] The machinery for evidence-led policing is being built at the very moment the standard way of reporting evidence is least fit for the people using it.

If trials keep landing on chiefs' desks in a format that obscures the decision rather than informing it, then "data-guided" will mean leaders nodding along to p < 0.05 and quietly filling the gap with instinct — which is the situation the reform was meant to end. This is a literacy problem, and it runs in both directions: evaluators need to report in a register decision-makers can use, and decision-makers need to stop treating the significance stamp as a verdict.

## The verdict

Reporting probabilities instead of p-values is sometimes heard as going easy on the evidence. It is the opposite. A p-value lets a researcher stop at "statistically significant" and hand the hard part — is it big enough, is it worth it, should we do it — to someone who has been handed the wrong number to make it with. Reporting the probability that an intervention clears a stated bar forces the analysis to confront the actual decision, costs and all, in the open.

The field does not need to abandon rigour. It needs to point the rigour at the question being asked. A chief deciding whether to spend £2m is asking how likely this is to work and whether it is worth it. That question has an answer. The p-value is not it.

---

[^1]: Scott M. Mourtgos, "Probabilities Over p-Values: A Decision Framework for Evidence-Based Policing," *Justice Evaluation Journal*, published online 29 January 2026 (DOI 10.1080/24751979.2026.2618794); preprint at CrimRxiv (crimrxiv.com/pub/3gbvojje). The "imaginary do-nothing world" is the null hypothesis; the p-value is the probability of data at least as extreme as observed, assuming that null is true.

[^2]: Ronald L. Wasserstein and Nicole A. Lazar, "The ASA Statement on p-Values: Context, Process, and Purpose," *The American Statistician*, 2016 (a p-value "does not measure the probability that the studied hypothesis is true, or the probability that the data were produced by random chance alone"; significance is not a measure of effect size or practical importance).

[^3]: Sander Greenland et al., "Statistical tests, P values, confidence intervals, and power: a guide to misinterpretations," *European Journal of Epidemiology*, 2016; Gerd Gigerenzer, "Statistical Rituals: The Replication Delusion and How We Got There," *Advances in Methods and Practices in Psychological Science*, 2018 (the widespread, persistent misreading of p-values among researchers and consumers of research).

[^4]: Mourtgos, "Probabilities Over p-Values," 2026 (the PASS framework — proceed, adjust, stall, scrap; the three steps of estimating effects that matter, linking them to expected utility, and applying transparent thresholds; the example probability bands of ≥90% to proceed, 70–80% to adjust, ~50% to stall, and 10–20% to scrap; and the three worked cases of use-of-force training, hot-spots patrol, and victim engagement).

[^5]: Akisato Suzuki, "Which Type of Statistical Uncertainty Helps Evidence-Based Policymaking? An Insight from a Survey Experiment in Ireland," arXiv 2108.05100, 2021 (517 responses; bus-line scenario; treatments of p = 2%, p = 25%, 95% probability and 68% probability; adoption of .82 and .91 under low uncertainty, and .39 against .83 under high uncertainty). See also Suzuki, "Policy Implications of Statistical Estimates: A General Bayesian Decision-Theoretic Model for Binary Outcomes," arXiv 2008.10903, 2022.

[^6]: HM Government, "From local to national: a new model for policing" (White Paper), GOV.UK, 26 January 2026 (data- and evidence-led policing; the move toward a national performance framework). On the deeper problem of acting on significance thresholds, see John P. A. Ioannidis, "Why Most Published Research Findings Are False," *PLoS Medicine*, 2005.
