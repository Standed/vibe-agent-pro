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
        'cine-panel': '#18181b',
        'cine-border': '#27272a',
        'cine-accent': '#a855f7',
        'cine-accent-hover': '#9333ea',
        'cine-text-muted': '#a1a1aa',

        // Light theme colors (Cinema Light)
        'light-bg': '#ffffff',
        'light-surface': '#f8f9fa',
        'light-panel': '#f1f3f5',
        'light-border': '#e9ecef',
        'light-accent': '#7c3aed',
        'light-accent-hover': '#6d28d9',
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
