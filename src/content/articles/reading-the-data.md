---
title: "More or Less Policing: how to read the numbers without being fooled"
section: "data-stories"
description: "A new strand, in the spirit of Radio 4's More or Less: police statistics are everywhere, and most of them are easy to misread. Here's how to read them — starting with the trap inside every stop-and-search figure."
pubDate: 2026-06-07
heroImage: "/images/prob-over-pvalues-chart1-decision-bands.png"
tags: ["More or Less Policing", "stop and search", "statistics", "transparency"]
redirectFrom: ["/other/reading-the-data"]
practicalSummary:
  problem: >-
    Police statistics have never been more available or easier to misread,
    and quoting a figure without examining the method behind it misleads in
    either direction.
  evidence:
    - point: >-
        data.police.uk publishes millions of records a month under an open
        licence, which makes careful reading more necessary, not less.
      source: "data.police.uk"
      url: "https://data.police.uk"
    - point: >-
        The familiar stop-and-search ratio divides searches by residential
        population, but searches happen where people are, not where they
        sleep, so the raw ratio cannot say how much is bias and how much is
        deployment.
    - point: >-
        A single figure is a dot, not an insight: a force's number means
        nothing until it is set beside last year, a similar force, or what
        you would expect.
  outcomes:
    - action: >-
        ask what exactly is counted on top and what is on the bottom before
        repeating any police rate
      benefit: >-
        the force stops quoting figures the method cannot support, and the
        public gets claims that mean what they say.
    - action: >-
        set every figure against last year, a comparable force, or a sensible
        expectation
      benefit: >-
        a dot becomes an insight, and leaders draw conclusions the public can
        actually weigh.
    - action: >-
        check the working in the underlying data, noting the month it
        describes and the day it was pulled
      benefit: >-
        claims can be verified rather than taken on trust, by the force and
        the public alike.
---

For more than twenty years, Radio 4's *More or Less* has done something quietly radical: it takes a number that everyone is repeating — in a headline, a manifesto, a select committee — and asks the boring, devastating question. *Where did that come from, and does it mean what they say it means?* Tim Harford and the team have made a national pastime of the polite teardown, and along the way they have taught a generation of listeners — me included — that a statistic is not a fact. It's a claim, with a method behind it, and the method is where the truth lives.

This is the first piece in a strand that borrows their habit of mind and points it at policing. Call it **More or Less Policing**. The premise is simple. Police data has never been more available — [data.police.uk](https://data.police.uk) publishes millions of records a month under an open licence — and never more easy to misread. So each piece here will take one police number, or one kind of police number, and show you how to read it. And because reading is easier when you can see the thing, each one is paired with [the live data explorer](/data), where the same figures sit waiting, stamped with the month they describe and the day they were pulled.

A grateful nod to *More or Less* before we start: this strand is an homage, not an affiliation. If you don't already subscribe, fix that. Then come back.

## The number everyone gets wrong

Here is a figure you have seen in some form: *Black people are several times more likely to be stopped and searched than white people.* It is true. It is also, on its own, almost meaningless — and the reason why is the single most useful idea in all of statistics.

Look at the national stop-and-search snapshot in [the explorer](/data). You can see, this month, the share of searches carried out on each ethnic group. It is a stark picture. But notice what that chart is *not* telling you. It shows the **numerator** — how many searches. It says nothing about the **denominator** — how many people there were to search in the first place.

A rate is a numerator over a denominator. Change the denominator and the same numerator tells a completely different story. "Several times more likely" usually divides searches by *residential* population — who lives there, counted at the last census. But searches don't happen where people sleep. They happen where people are: town centres at midnight, transport hubs, the night-time economy, the places policing is deployed. The population *available to be searched* at the time and place of searching is not the population of the borough. Sometimes it's wildly different.

This is not an argument that disproportionality is fine. It plainly is not, and the evidence that some of it reflects bias rather than deployment is real and serious. It is an argument that **the raw ratio cannot tell you how much** — and anyone who quotes the ratio as if it settles the question, in either direction, has skipped the step that matters. The honest answer requires the right denominator, and the right denominator is hard.

## Three questions to ask any rate

When a police statistic is a rate — and most of the ones that start arguments are — ask:

1. **What's on top, exactly?** A "stop" can mean a search under PACE, a traffic stop, a stop-and-account. Count different things, get different numbers.
2. **What's on the bottom, exactly?** Residents? Daytime population? People actually present? The choice often matters more than the data.
3. **Compared to what?** A force's number means nothing until you set it beside last year, beside a similar force, beside what you'd expect. A single figure is a dot; insight starts at the second dot.

That last one is why the explorer always shows you every force at once, and why the standing health warning at the top of every view says the same three things: the data isn't everywhere, isn't now, and isn't exact.

## What this strand will do

Future pieces will take the same scalpel to other favourites: why "recorded crime went up" can be *good* news, what an "outcome rate" actually counts, why the crime map lies a little on purpose, and why the latest figure is never the latest month. Each will be short, each will name the trap, and each will hand you straight to the data so you can check my working — which is, after all, the whole point.

A statistic is a claim. Let's read the claims carefully.

*Explore the figures behind this piece in the [Crime Dashboard →](/data)*
