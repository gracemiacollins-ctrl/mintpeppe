/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Space Grotesk', 'system-ui', 'sans-serif'],
      },
      colors: {
        neon: '#26FE07',
        deep: '#0F172A',
        memePink: '#FF3CAC',
        memeBlue: '#2B86C5',
        // Custom color palette based on the design
        'peppermint': {
          50: '#f0fff4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#26FE07', // Main neon color
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
        },
        'deep': {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0F172A', // Main deep color
        }
      },
      animation: {
        'gradient-shift': 'gradientShift 20s ease infinite',
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'bounce-gentle': 'bounceGentle 2s ease-in-out infinite',
      },
      keyframes: {
        gradientShift: {
          '0%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        bounceGentle: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'noise': 'url("https://grainy-gradients.vercel.app/noise.svg")',
        'main-gradient': 'linear-gradient(120deg, #071026 0%, #0f172a 50%, #0b1220 100%)',
        'mint-mist': `
          radial-gradient(circle at 28% 22%, rgba(180,255,210,0.12), transparent 40%),
          radial-gradient(circle at 72% 78%, rgba(140,255,185,0.07), transparent 35%),
          linear-gradient(rgba(38,254,7,0.025) 1px, transparent 1px),
          linear-gradient(90deg, rgba(38,254,7,0.025) 1px, transparent 1px)
        `,
      },
      backgroundSize: {
        '300%': '300% 300%',
        'grid': '60px 60px',
      },
      backdropBlur: {
        'xs': '2px',
      },
      boxShadow: {
        'neon': '0 0 20px rgba(38,254,7,0.3)',
        'neon-lg': '0 0 40px rgba(38,254,7,0.4)',
        'glass': '0 8px 32px rgba(0,0,0,0.1)',
        'card-hover': '0 12px 30px rgba(38,254,7,0.06)',
        'card-hover-lg': '0 12px 30px rgba(38,254,7,0.12)',
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
      },
      zIndex: {
        '60': '60',
      },
      aspectRatio: {
        'video': '16 / 9',
      },
      opacity: {
        '4': '0.04',
        '5': '0.05',
        '6': '0.06',
        '7': '0.07',
        '8': '0.08',
        '12': '0.12',
        '14': '0.14',
        '16': '0.16',
        '18': '0.18',
        '25': '0.25',
        '46': '0.46',
        '62': '0.62',
        '94': '0.94',
        '95': '0.95',
      },
    },
  },
  plugins: [],
}
