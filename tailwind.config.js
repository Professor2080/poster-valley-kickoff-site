/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#050607',
        paper: '#f2eee7',
        muted: 'rgba(8, 11, 14, 0.58)',
        'blue-haze': '#365d8d',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        heading: ['Space Grotesk', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        poster: 'var(--poster-shadow)',
        object: '0 24px 70px rgba(0, 0, 0, 0.24)',
      },
    },
  },
  plugins: [],
}
