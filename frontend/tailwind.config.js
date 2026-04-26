/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      // ─── Brand palette ────────────────────────────────────────────────
      // Warm light palette — amber accent, warm off-white surfaces
      colors: {
        // Canvas / surfaces — warm off-white backgrounds
        canvas:  '#fdf8f0',
        surface: { DEFAULT: '#faf4ea', alt: '#f5ede0' },
        card:    '#fefcf8',
        border:  { DEFAULT: '#e8e0d0', strong: '#d8cdb8' },
        // Amber — refined muted-gold brand accent & CTAs
        amber: {
          DEFAULT: '#b8843a',
          hover:   '#9a6e2e',
          bg:      '#f0e8d4',
          light:   '#e8d8b0',
        },
        // Derived text tones — warm brown, no neutral grays
        text: {
          primary:   '#2e2820',
          secondary: '#5a5040',
          muted:     '#9a8e80',
        },
        // Semantic — standard for notifications, kept faithful
        red: {
          50:  '#fef2f2',
          100: '#fee2e2',
          200: '#fecaca',
          300: '#fca5a5',
          400: '#f87171',
          500: '#ef4444',
          600: '#dc2626',
          700: '#b91c1c',
          800: '#991b1b',
          900: '#7f1d1d',
        },
        green: {
          50:  '#ecfdf5',
          100: '#d1fae5',
          200: '#a7f3d0',
          300: '#6ee7b7',
          400: '#34d399',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
          800: '#065f46',
          900: '#064e3b',
        },
        blue: {
          50:  '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
      },

      // ─── Typography ───────────────────────────────────────────────────
      fontFamily: {
        display: ['Cormorant Garamond', 'Georgia', 'serif'],
        sans:    ['Inter', 'system-ui', 'sans-serif'],
        mono:    ['JetBrains Mono', 'monospace'],
      },
      fontSize: {
        'xs':   ['12px', { lineHeight: '1.5',  letterSpacing: '0.01em'  }],
        'sm':   ['14px', { lineHeight: '1.5',  letterSpacing: '0'       }],
        'base': ['16px', { lineHeight: '1.625', letterSpacing: '0'      }],
        'lg':   ['18px', { lineHeight: '1.5',  letterSpacing: '0'       }],
        'xl':   ['20px', { lineHeight: '1.4',  letterSpacing: '0'       }],
        '2xl':  ['24px', { lineHeight: '1.3',  letterSpacing: '-0.01em' }],
        '3xl':  ['30px', { lineHeight: '1.2',  letterSpacing: '-0.01em' }],
        '4xl':  ['36px', { lineHeight: '1.15', letterSpacing: '-0.02em' }],
        '5xl':  ['48px', { lineHeight: '1.1',  letterSpacing: '-0.02em' }],
        '6xl':  ['60px', { lineHeight: '1.05', letterSpacing: '-0.03em' }],
        '7xl':  ['72px', { lineHeight: '1.0',  letterSpacing: '-0.03em' }],
        '8xl':  ['96px', { lineHeight: '0.95', letterSpacing: '-0.04em' }],
      },

      // ─── Border radius ────────────────────────────────────────────────
      borderRadius: {
        'none':  '0',
        'sm':    '4px',
        DEFAULT: '6px',
        'md':    '8px',
        'lg':    '12px',
        'xl':    '16px',
        '2xl':   '24px',
        'full':  '9999px',
      },

      // ─── Shadows (warm-tinted to match #2e2820 text-primary) ─────────
      boxShadow: {
        'xs':    '0 1px 2px 0 rgba(46,40,32,0.05)',
        'sm':    '0 1px 3px 0 rgba(46,40,32,0.08), 0 1px 2px -1px rgba(46,40,32,0.04)',
        DEFAULT: '0 2px 6px -1px rgba(46,40,32,0.08), 0 2px 4px -2px rgba(46,40,32,0.04)',
        'md':    '0 4px 10px -2px rgba(46,40,32,0.09), 0 2px 6px -3px rgba(46,40,32,0.04)',
        'lg':    '0 10px 20px -4px rgba(46,40,32,0.10), 0 4px 8px -4px rgba(46,40,32,0.04)',
        'xl':    '0 20px 40px -8px rgba(46,40,32,0.12), 0 8px 16px -6px rgba(46,40,32,0.05)',
        '2xl':   '0 32px 64px -12px rgba(46,40,32,0.18)',
        'none':  'none',
      },

      // ─── Animations ───────────────────────────────────────────────────
      animation: {
        'fade-in':  'fadeIn 0.25s ease-out forwards',
        'slide-up': 'slideUp 0.3s ease-out forwards',
        'fade-up':  'fadeUp 0.4s ease-out forwards',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%':   { opacity: '0', transform: 'translateY(8px)'  },
          '100%': { opacity: '1', transform: 'translateY(0)'     },
        },
        fadeUp: {
          '0%':   { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)'     },
        },
      },
    },
  },
  plugins: [],
};
