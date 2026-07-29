/** @type {import('tailwindcss').Config} */
// Colours are driven by CSS variables (space-separated RGB channels defined in
// src/styles/global.css), so a single `.dark` class on <html> reskins the whole
// site. The `<alpha-value>` placeholder lets opacity modifiers (bg-accent/10,
// bg-paper-100/80, …) keep working against the variable-based colours.
const withAlpha = (v) => `rgb(var(${v}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
  theme: {
    extend: {
      fontFamily: {
        // Self-hosted via Fontsource (imported in BaseLayout.astro). One
        // superfamily doing two jobs: Source Sans 3 is the institution's voice
        // (nav, headlines, labels, figures) and Source Serif 4 is its argument
        // (article bodies). They were drawn together, so a caption and the
        // paragraph under it agree without any tuning.
        //
        // `mono` is the system stack and is used for one thing: code samples.
        // The instrument voice is set in the sans with tabular figures — a
        // typewriter face is harder to read at label sizes and made ordinary
        // metadata look like terminal output.
        display: ['"Source Sans 3 Variable"', '"Source Sans 3"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['"Source Serif 4 Variable"', '"Source Serif 4"', 'ui-serif', 'Georgia', 'serif'],
        sans: ['"Source Sans 3 Variable"', '"Source Sans 3"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', '"SF Mono"', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        // The desk the page is laid on — a step below every panel on it.
        canvas: withAlpha('--canvas'),
        // The structural 2px line. Full-strength ink on paper, a mid blue-grey
        // on navy — see --rule in global.css.
        rule: withAlpha('--rule'),
        paper: {
          50: withAlpha('--paper-50'),
          100: withAlpha('--paper-100'),
          200: withAlpha('--paper-200'),
        },
        ink: {
          900: withAlpha('--ink-900'),
          800: withAlpha('--ink-800'),
          700: withAlpha('--ink-700'),
          600: withAlpha('--ink-600'),
          500: withAlpha('--ink-500'),
          400: withAlpha('--ink-400'),
          300: withAlpha('--ink-300'),
          200: withAlpha('--ink-200'),
        },
        accent: {
          DEFAULT: withAlpha('--accent'),
          dark: withAlpha('--accent-dark'),
          light: withAlpha('--accent-light'),
        },
        // The second and third voices. `signal` marks a figure worth stopping
        // on (a live reading, a headline number); `flag` marks harm or a
        // withdrawn claim. Neither is decorative — if a colour here is not
        // carrying meaning, it is the wrong colour.
        signal: withAlpha('--signal'),
        flag: withAlpha('--flag'),
        chart: {
          blue: withAlpha('--chart-blue'),
          teal: withAlpha('--chart-teal'),
          green: withAlpha('--chart-green'),
          amber: withAlpha('--chart-amber'),
          red: withAlpha('--chart-red'),
          violet: withAlpha('--chart-violet'),
          slate: withAlpha('--chart-slate'),
        },
        // The constant dark panel (footer, quote band, tools CTA) — dark in
        // both themes. See --night-* in global.css.
        night: {
          50: withAlpha('--night-50'),
          100: withAlpha('--night-100'),
          line: withAlpha('--night-line'),
          ink: withAlpha('--night-ink'),
          dim: withAlpha('--night-ink-dim'),
        },
      },
      // Elevation. Each step is a tight contact shadow plus a wide ambient
      // one — a single blurred rectangle reads as a grey smudge, two read as
      // an object above a surface. Values live in global.css so the ramp can
      // be re-tuned for dark mode without touching a component.
      boxShadow: {
        e1: 'var(--e1)',
        e2: 'var(--e2)',
        e3: 'var(--e3)',
        e4: 'var(--e4)',
        well: 'var(--well-inset)',
        edge: 'inset 0 1px 0 rgb(var(--edge-lit) / var(--edge-lit-alpha))',
        // Retained aliases so existing markup keeps its elevation.
        card: 'var(--e1)',
        'card-hover': 'var(--e3)',
        panel: 'var(--e4)',
      },
      borderRadius: {
        1: 'var(--r1)',
        2: 'var(--r2)',
        3: 'var(--r3)',
        4: 'var(--r4)',
      },
      transitionTimingFunction: {
        swift: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      maxWidth: {
        // The article reading measure. Kept in step with the `--measure` custom
        // property on `.prose-article` in global.css (the magazine text column).
        prose: '36rem',
        wide: '72rem',
      },
      typography: ({ theme }) => ({
        DEFAULT: {
          css: {
            color: theme('colors.ink.800'),
            maxWidth: 'none',
          },
        },
      }),
    },
  },
  plugins: [],
};
