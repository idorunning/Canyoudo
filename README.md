# Thinking About Policing

The new home of thinkingaboutpolicing.co.uk. Built with Astro, deployed on Netlify, edited in markdown.

## What you've got

A static site with three sections — Police Policy, Public Policy, Other — plus a homepage that lists everything by date, an About page, an RSS feed, a sitemap, and a comments system that requires no login from your readers.

Each article is a single markdown file. Write it in VS Code, commit, push. Netlify rebuilds in about 30 seconds.

---

## First-time setup

You'll need Node.js 20 or later. Check with `node -v`. If it's older, install the current LTS from nodejs.org.

```bash
# In the project folder
npm install
```

That pulls down Astro, Tailwind, and the supporting packages. Takes a couple of minutes the first time.

### Comments (optional but recommended)

The site uses **Cusdis** for comments. It's a lightweight, free, no-login comment system. Readers can leave a name and email (email is optional) and post. You moderate from a dashboard.

To switch it on:

1. Sign up at [cusdis.com](https://cusdis.com)
2. Create a new site for thinkingaboutpolicing.co.uk
3. Copy the App ID it gives you
4. In the project root, copy `.env.example` to `.env`
5. Paste the App ID after `PUBLIC_CUSDIS_APP_ID=`

If you skip this, the comments section shows a small "not configured" notice locally and just won't appear on production until you set the env var in Netlify.

---

## Running locally

```bash
npm run dev
```

Open http://localhost:4321. The site reloads as you edit.

To preview the production build before deploying:

```bash
npm run build
npm run preview
```

---

## Writing an article

Articles live in `src/content/` under one of three folders. The folder decides which section the article appears in.

```
src/content/
├── police-policy/
├── public-policy/
└── other/
```

To add an article, create a new `.md` file in the appropriate folder. The filename becomes the URL slug — `early-intervention.md` becomes `/police-policy/early-intervention/`. Keep it lowercase, hyphens between words, no spaces.

### Frontmatter

Every article starts with a YAML block. Like this:

```yaml
---
title: "The piece's title"
description: "One-line summary. Shows on the homepage and as the meta description for social sharing."
pubDate: 2026-05-27
tags: ["misconduct", "early intervention"]
---
```

That's the minimum. Optional fields:

```yaml
updatedDate: 2026-06-01            # if you've revised it
heroImage: /images/something.jpg   # top image for the article
draft: true                        # hides it from build until you remove this
author: "Nathan Tracey"            # defaults to your name if omitted
```

### The body

Below the second `---`, write in plain markdown.

```markdown
## A heading

A paragraph. **Bold**, *italic*, [a link](https://example.com).

> A blockquote, set in italic on the page.

- A bulleted
- list

1. A numbered
2. list

Code in `backticks` for short snippets, or three-fenced blocks for longer ones.
```

Headings start at `##` (h2). The article title is the h1, set automatically from the frontmatter. Don't put a second h1 in the body.

### Images

Drop image files into `public/images/`. Reference them in markdown as `/images/filename.jpg`. They'll be served from the root of the site.

For big hero images, use the `heroImage` field in frontmatter. For images inside the body, use markdown syntax: `![alt text](/images/filename.jpg)`.

---

## Deploying

### One-time setup with Netlify

The cleanest workflow is GitHub + Netlify.

1. Create a new repository on GitHub (private or public, your choice)
2. Push this project to it:
   ```bash
   git init
   git add .
   git commit -m "Initial site"
   git remote add origin https://github.com/your-username/thinkingaboutpolicing.git
   git branch -M main
   git push -u origin main
   ```
3. On Netlify: "Add new site" → "Import an existing project" → connect GitHub → pick the repo
4. Build settings should auto-detect from `netlify.toml`. Build command: `npm run build`. Publish directory: `dist`.
5. Click deploy

Once deployed, set your Cusdis App ID:

- Netlify dashboard → Site settings → Environment variables
- Add `PUBLIC_CUSDIS_APP_ID` with the value from Cusdis

Redeploy once for the env var to take effect.

### Pointing your domain

Once the site builds successfully on a `*.netlify.app` URL, point your domain at it:

1. Netlify → Domain settings → Add custom domain → `thinkingaboutpolicing.co.uk`
2. Netlify will give you DNS records to add at your registrar
3. Either change the nameservers to Netlify's, or add an A record + CNAME pointing at Netlify
4. Wait for DNS to propagate (usually under an hour)
5. Netlify will provision a free SSL certificate via Let's Encrypt automatically

Until you flip DNS, the WordPress site keeps running. Zero-downtime cutover.

### Publishing new articles

After initial setup, the workflow for new articles is:

1. Create the markdown file in the right folder
2. Write it
3. `git add . && git commit -m "New article: title" && git push`
4. Netlify rebuilds and deploys. Done.

No dashboard. No editor. No plugins to update.

---

## Migrating the WordPress posts

With under twenty articles, the cleanest route is manual copy-paste.

For each existing post:

1. Open it in WordPress
2. Switch to the text/code view
3. Copy the body
4. Create a new `.md` file in the right section folder
5. Add frontmatter at the top with the title, description, original pubDate
6. Paste the body and clean up any leftover WordPress shortcodes or HTML

If a piece has images, download them, put them in `public/images/`, and update the references.

---

## Project structure (for reference)

```
thinkingaboutpolicing/
├── astro.config.mjs       # Astro config
├── tailwind.config.mjs    # Tailwind theme (fonts, colours)
├── netlify.toml           # Netlify build settings
├── package.json
├── public/                # Static files served as-is
│   ├── favicon.svg
│   └── robots.txt
└── src/
    ├── content/           # Articles — one folder per section
    │   ├── config.ts      # Frontmatter schema
    │   ├── police-policy/
    │   ├── public-policy/
    │   └── other/
    ├── layouts/
    │   ├── BaseLayout.astro     # Page shell (head, nav, footer)
    │   └── ArticleLayout.astro  # Article page template
    ├── components/
    │   ├── Header.astro
    │   ├── Footer.astro
    │   ├── ArticleCard.astro
    │   ├── SectionBadge.astro
    │   └── Comments.astro
    ├── pages/
    │   ├── index.astro          # Homepage
    │   ├── about.astro
    │   ├── rss.xml.js           # RSS feed
    │   ├── police-policy/
    │   │   ├── index.astro      # Section listing
    │   │   └── [slug].astro     # Article template
    │   ├── public-policy/
    │   │   └── ...
    │   └── other/
    │       └── ...
    └── styles/
        └── global.css           # Article body styling
```

---

## Tweaking the design

The visual theme lives in two places.

**`tailwind.config.mjs`** controls colours and fonts. Change the `accent` colours to retune the editorial accent (currently a muted crimson). Change the font families if you want a different typeface.

**`src/styles/global.css`** has the article body styling — the `.prose-article` class. Change line-height, heading sizes, link styling, blockquote treatment.

For layout changes, the Astro files in `src/layouts/` and `src/components/` are where to look. They use Tailwind classes throughout.

---

## Gotchas worth flagging

- **Don't put two h1s in an article.** The title is auto-rendered as h1. Use `##` and below in the body.
- **`draft: true` hides articles from the build.** Useful for work-in-progress. Remove it (or set `false`) to publish.
- **Filenames become URLs.** `Early-Intervention.md` becomes `/police-policy/Early-Intervention/`. Keep them lowercase with hyphens.
- **The dev server runs on port 4321**, not 3000.
- **Cusdis App ID must be set in Netlify env vars too**, not just locally. Local `.env` only affects `npm run dev`.

---

That's the lot. If something's broken or unclear, the Astro docs at docs.astro.build cover most of it.
