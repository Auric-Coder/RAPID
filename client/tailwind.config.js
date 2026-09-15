/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // High-end dark theme styling colors
        cyber: {
          bg: '#0B0F19',
          card: '#161F30',
          border: '#1F2E45',
          accent: '#06B6D4', // Neon Cyan
          alert: '#F97316',  // Safety Orange
          success: '#10B981', // Emerald Green
          critical: '#EF4444' // Crimson Red
        }
      },
      fontFamily: {
        sans: ['Outfit', 'Inter', 'sans-serif'],
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'pulse-fast': 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'radar': 'radarPulse 2.5s infinite ease-out',
      },
      keyframes: {
        radarPulse: {
          '0%': { transform: 'scale(0.8)', opacity: '0.5' },
          '100%': { transform: 'scale(2.2)', opacity: '0' },
        }
      }
    },
  },
  plugins: [],
}
