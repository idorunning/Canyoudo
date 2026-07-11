-- Newsletter subscription state, tracked on the reader's profile so the
-- account settings panel can show and toggle it from any device. The actual
-- list membership lives in MailerLite (see netlify/functions/mailerlite-subscribe.mts);
-- this column is the site-side source of truth for what the toggle should show.
--
-- NULL means "never chosen" (treated as not subscribed by the UI); true/false
-- record the reader's explicit choice.
--
-- Idempotent: safe to paste into the Supabase SQL editor more than once.

alter table reader_profiles
  add column if not exists subscribed boolean;
