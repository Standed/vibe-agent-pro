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
        // Semantic Token System
        primary: {
          DEFAULT: '#6366f1', // Indigo-500
          hover: '#4f46e5',   // Indigo-600
          foreground: '#ffffff',
        },
        success: {
          DEFAULT: '#10b981', // Emerald-500
          foreground: '#ffffff',
        },
        warning: {
          DEFAULT: '#f59e0b', // Amber-500
          foreground: '#ffffff',
        },
        error: {
          DEFAULT: '#ef4444', // Red-500
          foreground: '#ffffff',
        },

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
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
