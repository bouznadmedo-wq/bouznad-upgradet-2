/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#0a0d12',
          900: '#0f141b',
          850: '#141a23',
          800: '#1a212c',
          700: '#222b38',
          600: '#2c3645',
          500: '#3a4656',
          400: '#5a6677',
          300: '#8a94a5',
          200: '#b8c0cc',
          100: '#e2e6ec',
        },
        accent: {
          DEFAULT: '#22d3ee',
          50: '#ecfeff',
          100: '#cffafe',
          400: '#22d3ee',
          500: '#06b6d4',
          600: '#0891b2',
          700: '#0e7490',
        },
        success: {
          DEFAULT: '#34d399',
          600: '#059669',
          700: '#047857',
        },
        warning: {
          DEFAULT: '#fbbf24',
          600: '#d97706',
        },
        danger: {
          DEFAULT: '#f87171',
          600: '#dc2626',
          700: '#b91c1c',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(34,211,238,0.25), 0 8px 30px -8px rgba(34,211,238,0.35)',
        card: '0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px -12px rgba(0,0,0,0.6)',
      },
    },
  },
  plugins: [],
};
