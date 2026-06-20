---
title: How I built this website — a guide for non-coders (like me!)
description: An honest, plain-English tour of how this site is put together, why I use each service, and a running log of every change. I'm learning as I go — suggestions welcome.
draft: true
---

I am not a software developer. I came into this with minimal academic qualifications, a career that started in commercial operations, and a policing job. Everything on this site has been built by me, in my spare time, with a lot of help from an AI assistant and a lot of trial and error.

I wanted one page that pulls back the curtain: what this website actually is, which services make it work, and **why** I chose each one. Then, beneath that, a running **change log** — every fix, new article and tweak, written in plain English. Partly so I can see how far it's come, and partly because if you're thinking "could I do this?", the honest answer is **yes** — and this is roughly the order I learned it in.

If you spot a mistake or have a better way of doing something, please tell me. The whole point is that I'm learning in the open. There's a comments box at the bottom, or you can [get in touch](/contact).

## First, the big idea: this is a "static" website

Most websites build each page fresh, on demand, every time someone visits — which means a server constantly doing work, and more things to break.

This site is **static**. Every page is built once, in advance, into plain files (the same kind of files your browser already knows how to read). Those files just sit on the internet waiting to be handed out. It's faster, far cheaper, and there's much less to go wrong. For a one-person project, that's exactly what you want.

The interactive bits — the crime dashboard, the research search — are the exception, and I'll come to how those work near the end.

## The address: a domain name and DNS

The website needs an address people can type — in my case `thinkingaboutpolicing.org`. That's a **domain name**, which I rent (you can't really "buy" one outright; you pay yearly).

**DNS** is the internet's address book. When someone types the domain, DNS is what points it at the actual computers serving the site. You set this up once and mostly forget it.

> A note on Cloudflare: people often add a service like Cloudflare in front of a site to handle DNS and add a speed/security layer. I'm keeping this page honest — at the time of writing, Cloudflare isn't doing that job here; the hosting service below handles the address directly. I'm noting it because it's a common next step I may take, and I'd rather tell you what's actually true than what sounds impressive.

## GitHub: a save history (and undo button) for the whole site

This was the first genuinely new concept I had to get my head around.

**GitHub** stores every file that makes up the site, and — crucially — it remembers **every version**. Every change is saved as a labelled snapshot. If I break something, I can see exactly what changed and roll back to how it was. Nothing is ever really lost.

Think of it as track-changes and an undo button for the entire website, with a full history I can scroll back through. It's also the single source of truth — everything else plugs into it.

## How the pages are actually written: Astro, Markdown and Tailwind

A few tools turn my writing into real web pages:

- **Markdown** is a simple way to write formatted text. You type `## A heading` or `**bold**` in plain text and it becomes a proper heading or bold text. No fiddly buttons. Most of the articles on this site are just Markdown files.
- **Astro** is the engine that takes those Markdown files plus a set of page templates and assembles the finished website — the menus, the layout, the article pages — all built ahead of time into those static files I mentioned.
- **Tailwind** is how the site is styled — the fonts, colours, spacing. It lets me adjust the look in small, predictable steps.

The lovely thing: to publish a new article, I mostly just **write**. The tools handle turning it into a page, adding it to the menus, building the table of contents, and working out the reading time.

## Netlify: the robot that publishes everything

Here's where it clicks together. **Netlify** is the hosting service — it's where the website actually lives so the world can reach it. But it does something cleverer than just storing files.

Netlify **watches GitHub**. The moment I save a change to GitHub, Netlify notices, rebuilds the whole site fresh, and publishes it — usually within a minute or two. I never copy files around or "upload" anything. I make a change, and a couple of minutes later it's just... live.

Netlify also runs the few interactive features that *do* need a little server work, like the research and data tools.

## Editing in the browser: the built-in editor at /admin

Writing in Markdown files is fine on a laptop, but I didn't want to need code tools every time I fixed a typo. So the site has a **browser-based editor** (built with a tool called Sveltia CMS) at `/admin`.

I sign in, and I get a friendly editor — title boxes, a normal writing area, a button to add a photo. When I hit save, it quietly records the change to GitHub, which triggers Netlify to rebuild and publish. I can literally fix a sentence from my phone. **This very page, and the change log below it, are both edited that way.**

## Photos: Pexels, and giving credit

Good photos matter, and I can't take them all myself. **Pexels** is a library of free stock photos that are licensed to be used.

When the site is built, a small script fetches the images it needs and tidies them up (shrinking big ones so pages load quickly). Where a photo comes from a photographer on Pexels, they're credited. The rule I try to stick to: only use images I'm actually allowed to use, and say where they came from.

## Counting visitors honestly: GoatCounter

I like knowing whether anyone's reading, but I didn't want to spy on people or bury the site in cookie pop-ups.

**GoatCounter** is a privacy-friendly visitor counter. It gives me simple numbers — which pages are read, roughly how many people — without tracking individuals and without needing one of those annoying "accept cookies" banners. Lightweight and respectful, which fits the spirit of the site.

## Comments: Cusdis

The comment box at the bottom of articles (and this page) is powered by **Cusdis**.

I chose it because readers **don't need to create an account or log in** to comment — just a name. And every comment is **held for me to approve** before it appears, which keeps out the spam. For a site that's all about peer review and challenge, low-friction comments matter.

## The newsletter: MailerLite

If you want an email when something new goes up, that's **MailerLite**.

The neat part is that I don't write those emails by hand. The site automatically publishes a machine-readable list of its newest articles (called an RSS feed), and MailerLite watches that list and emails subscribers when something new appears. Set up once, runs itself.

## The interactive tools — and where AI comes in

Two parts of the site are more than static pages, and they lean on a few more services.

- **Supabase** is a database — think a giant, fast spreadsheet that lives online. It holds the historical crime data behind the **Crime Dashboard**, and it manages signing in if you want to save research papers. The dashboard queries it to draw its charts.
- **data.police.uk** is the official UK open-data source. Automated jobs fetch the latest stop-and-search and crime figures from it each month — no manual updating — and store them ready for the dashboard. The data carries its own "where this came from and when" label so every figure is traceable.
- **The Research Assistant** searches across open academic databases (with names like OpenAlex, Crossref and Europe PMC — over 250 million works) to find evidence and link to free-to-read versions of papers.
- **Anthropic's Claude** is the AI behind the plain-language parts — turning a vague question into useful search terms, summarising findings, and helping interpret the data. To stop a runaway bill, there's a hard monthly **spending cap**: if it's hit, the AI features pause and say so rather than quietly costing a fortune. Answers are also cached, so asking the same thing twice doesn't cost twice.

## And the thing that ties it together: Claude Code

Here's the honest centre of all this. I can't write most of this code from scratch. What I *can* do is **describe what I want, in plain English, to an AI coding assistant** — Claude Code — which writes and changes the actual code, explains what it's doing, and helps me fix it when it breaks.

People sometimes call this "vibe coding". I'm not pretending it's the same as being a trained engineer. But it's real, it works, and it's let me build things — a live data dashboard, a research search — that I'd never have managed alone. I review the changes, I decide what goes in, and every change lands in GitHub with a note explaining it. Many of those notes are what feed the change log below.

## Why bother sharing all this?

Because two years ago I genuinely thought this was beyond me. If you're a curious person who assumes building something real on the internet is only for "proper" developers — it isn't, not any more. You can learn it one piece at a time, exactly like I am.

So: **suggestions are genuinely welcome.** If something here is wrong, unclear, or could be done better, leave a comment below or [get in touch](/contact). I'm learning as I go, and this page — like the site — will keep changing. The log of those changes starts right below.
