# Members gate — the crime dashboard behind sign-in

The crime dashboard and the rest of the data explorer now sit behind the same
free sign-in as the research assistant. A logged-out visitor sees each page's
public overview (its hero — title, description, the "what this is") plus a
sign-in prompt; a signed-in reader sees the full interactive tool. One sign-in
covers the whole members area (the dashboard *and* the research assistant) —
it's the same Supabase project.

## What's gated

Every page under `/data`:

- `/data` — the Crime Dashboard
- `/data/crime`, `/data/disproportionality` — the explorer readings + charts
- `/data/neighbourhood`, `/data/lookup` — the postcode tools
- `/data/coverage` — forces & data quality
- `/data/explore` — the explorer hub
- `/data/force/[id]` — per-force dashboards

The page **hero stays public** as the basic overview; only the interactive body
(AI readings, charts, pickers, chat, lookups) is behind the gate.

## How it works (static site, client-side auth)

Identical in spirit to `/research` (see `docs/research-assistant-v3.md`):

- `src/components/MemberGate.astro` wraps each page's interactive body. Given
  `hasAuth` (computed per page from the `PUBLIC_SUPABASE_*` env vars) it renders
  a sign-in prompt (default-visible), the gated tool (hidden), and a skeleton.
  A tiny inline `<head>` script pre-hides the prompt and shows the skeleton when
  a Supabase token is already in `localStorage`, so a returning member sees
  skeleton → tool rather than a sign-in flash.
- `src/scripts/members/gate.ts` is the controller: it resolves the Supabase
  session, shows the tool to members and the sign-in routes (email magic link +
  Google) to everyone else, and swaps live on sign-in/out. `supabase-js` is
  imported dynamically, so a visitor who never signs in doesn't download it.

### Why nothing is billed for logged-out visitors

Several data scripts auto-fetch on load, and some of those fire an **AI**
interpretation (`/api/interpret`, `/api/db-interpret`). The gate exposes an
`onMembersUnlock(cb)` helper and a `members:unlock` event; those auto-firing
scripts (the `PersonaInterpreter` component and the explorer page scripts) wait
on it, so they only run once the reader is unlocked. A logged-out visitor never
triggers an interpretation. User-initiated actions (chat, postcode lookups)
need no guard — they live inside the hidden tool until sign-in anyway.

### Graceful degrade

With no Supabase configured at build time (`hasAuth=false`) there's no gate at
all: the content renders for everyone and the unlock signal fires immediately,
so the deferred scripts still run. Same behaviour as `/research` on a keyless
deploy.

## One setup note

The Supabase **Redirect URLs** allowlist must use `…/**` (not `…/*`) so a
reader signing in from a deep page like `/data/force/metropolitan` is returned
there rather than bounced out — see `docs/google-login-setup.md`, Part 3.
