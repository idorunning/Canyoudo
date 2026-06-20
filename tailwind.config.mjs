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
        display: ['"DM Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        serif: ['"Source Serif 4"', 'ui-serif', 'Georgia', 'serif'],
        sans: ['"DM Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
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
