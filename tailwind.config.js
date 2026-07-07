/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#050607',
        frost: '#f4f7f2',
        mint: '#43d6b4',
        coral: '#ff7e5f',
        amber: '#f6c370',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        heading: ['Space Grotesk', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 24px 90px rgba(67, 214, 180, 0.20), 0 12px 34px rgba(0, 0, 0, 0.35)',
        soft: '0 18px 60px rgba(0, 0, 0, 0.30)',
      },
    },
  },
  plugins: [],
}
