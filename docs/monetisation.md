# Covering the running costs

Two small income streams, both optional and both switched on by env vars in
Netlify (Site configuration → Environment variables → Add a variable, then
Deploys → Trigger deploy). Until a var is set, the matching feature renders
nothing at all.

(Display ads were considered and rejected: AdSense pays roughly £0.50–£2 per
1,000 pageviews, needs a UK/EEA cookie-consent banner, and doesn't pay its
way below ~10,000 pageviews a month.)

| What | Env var | Effort | Realistic return |
|---|---|---|---|
| Donation link | `PUBLIC_SUPPORT_URL` | 10 min | A few pounds/month from regular readers |
| Amazon affiliate tags | `PUBLIC_AMAZON_ASSOCIATES_TAG` | 30 min | Small % of any book sales |

## 1 — Donation link (10 min)

1. Create a free page at [buymeacoffee.com](https://buymeacoffee.com) (or
   Ko-fi — both take card payments with no account needed from the supporter).
2. Copy your page URL, e.g. `https://buymeacoffee.com/thinkingaboutpolicing`.
3. In Netlify, set `PUBLIC_SUPPORT_URL` to that URL and redeploy.

That single var switches on two asks on every page (both invisible until it's
set): a slim "buy me a coffee" banner at the top, and a fuller thank-you block
in the footer. Both say plainly that donations cover only the LLM API bills
and the time spent building the site.

## 2 — Amazon affiliate tags (30 min)

1. Sign up at [affiliate-program.amazon.co.uk](https://affiliate-program.amazon.co.uk)
   (Amazon Associates). You'll choose a tracking ID — something like
   `thinkingabou-21`.
2. In Netlify, set `PUBLIC_AMAZON_ASSOCIATES_TAG` to that ID and redeploy.

From then on, any **Books** entry whose buy link points at Amazon gets your
tag appended automatically — on the /books page and in the "From the author"
promo at the foot of matching articles. Non-Amazon links are left alone.
Links carry `rel="sponsored"` as Google requires.

**Note:** Amazon requires you to identify yourself as an Associate. Add a line
to the About page (editable in the CMS): *"As an Amazon Associate I earn from
qualifying purchases."* They also close accounts with no sales in 180 days —
relevant while the Books list is empty.

## The other lever: cut the API cost itself

The main spend is the Anthropic key behind the research assist and the
dashboard interpreter. Both already cache hard at Netlify's edge, and the
assist uses Haiku for overviews. If cost ever bites, the next steps are
longer edge-cache lifetimes and a hard monthly cap — ask Claude to wire
those in.
