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
        // Self-hosted via Fontsource (imported in BaseLayout.astro).
        display: ['"Plus Jakarta Sans Variable"', '"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['"Source Serif 4 Variable"', '"Source Serif 4"', 'ui-serif', 'Georgia', 'serif'],
        sans: ['"Plus Jakarta Sans Variable"', '"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', '"SF Mono"', 'Menlo', 'monospace'],
      },
      colors: {
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
      boxShadow: {
        card: '0 1px 2px rgb(var(--shadow-rgb) / 0.04)',
        'card-hover': '0 14px 32px -12px rgb(var(--shadow-rgb) / 0.18)',
        panel: '0 24px 48px -16px rgb(var(--shadow-rgb) / 0.22)',
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
