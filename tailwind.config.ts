import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'cine-black': '#09090b',
        'cine-dark': '#0c0c0e',
        'cine-panel': '#18181b',
        'cine-border': '#27272a',
        'cine-accent': '#a855f7',
        'cine-accent-hover': '#9333ea',
        'cine-text-muted': '#a1a1aa',
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
