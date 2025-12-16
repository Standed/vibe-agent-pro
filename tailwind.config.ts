import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Dark theme colors (Cinema Dark)
        'cine-black': '#09090b',
        'cine-dark': '#0c0c0e',
        'cine-bg': '#0c0c0e', // alias for ease of use
        'cine-bg-secondary': '#18181b',
        'cine-panel': '#18181b',
        'cine-border': '#27272a',
        'cine-accent': '#ffffff',
        'cine-accent-hover': '#e5e5e5',
        'cine-text-muted': '#a1a1aa',

        // Light theme colors (Cinema Light)
        'light-bg': '#ffffff',
        'light-bg-secondary': '#f8f9fa',
        'light-surface': '#f8f9fa',
        'light-panel': '#f1f3f5',
        'light-border': '#e9ecef',
        'light-accent': '#000000',
        'light-accent-hover': '#262626',
        'light-text': '#1a1a1a',
        'light-text-muted': '#6c757d',
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)'],
        mono: ['var(--font-geist-mono)'],
      },
    },
  },
  plugins: [],
};

export default config;
