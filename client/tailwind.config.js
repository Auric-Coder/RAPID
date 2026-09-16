/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Semantic tokens — named for what a colour is FOR, backed by CSS
        // custom properties in src/index.css so [data-theme="dark"] can
        // redefine the values without touching a single component class.
        page: 'var(--color-page)',
        surface: 'var(--color-surface)',
        border: 'var(--color-border)',
        'border-strong': 'var(--color-border-strong)',
        text: 'var(--color-text)',
        muted: 'var(--color-text-muted)',
        accent: 'var(--color-accent)',
        'on-solid': 'var(--color-text-on-solid)',
        status: {
          normal: 'var(--status-normal)',
          warning: 'var(--status-warning)',
          urgent: 'var(--status-urgent)',
          critical: 'var(--status-critical)',
        },
      },
      fontFamily: {
        // Paper Command (docs/research/DIRECTION.md, direction A): one text
        // family, one accent (mono, for anything tabular — coordinates,
        // timestamps, IDs, battery/telemetry readouts).
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
}
