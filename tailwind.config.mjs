/** @type {import('tailwindcss').Config} */
export default {
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
          50: '#fbf8f1',
          100: '#f7f3eb',
          200: '#ede5d3',
        },
        ink: {
          900: '#1a1817',
          800: '#2a2724',
          700: '#3d3936',
          600: '#5a544e',
          500: '#7a7268',
          400: '#9c9389',
          300: '#c4bcae',
          200: '#ddd6c8',
        },
        accent: {
          DEFAULT: '#7c2828',
          dark: '#5a1c1c',
          light: '#a14545',
        },
      },
      maxWidth: {
        prose: '38rem',
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
