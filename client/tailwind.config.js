import plugin from 'tailwindcss/plugin'

// Every themed colour is a [light, dark] pair of "r g b" channels. The pairs become
// CSS variables (see the plugin below), so components use one set of classes and the
// theme switch is a single `data-theme` attribute on <html>.
const palette = {
  canvas: ['246 247 249', '17 17 19'],
  surface: ['255 255 255', '27 27 29'],
  ink: ['26 26 26', '244 244 245'],
  // Text-safe violet; `violet` itself stays the fixed fill colour behind white text.
  accent: ['80 70 229', '165 160 255'],
  gray: {
    50: ['249 250 251', '38 38 41'],
    100: ['243 244 246', '44 44 48'],
    200: ['229 231 235', '50 50 54'],
    300: ['209 213 219', '66 66 72'],
    400: ['156 163 175', '133 133 142'],
    500: ['107 114 128', '161 161 170'],
    600: ['75 85 99', '212 212 216'],
    700: ['55 65 81', '228 228 231'],
  },
  slate: {
    50: ['248 250 252', '33 33 36'],
    100: ['241 245 249', '44 44 48'],
    200: ['226 232 240', '50 50 54'],
    700: ['51 65 85', '228 228 231'],
  },
  red: {
    50: ['254 242 242', '42 21 23'],
    100: ['254 226 226', '58 26 29'],
    200: ['254 202 202', '92 35 39'],
    600: ['220 38 38', '248 113 113'],
    700: ['185 28 28', '252 165 165'],
    800: ['153 27 27', '254 202 202'],
  },
  amber: {
    50: ['255 251 235', '42 33 16'],
    100: ['254 243 199', '58 45 18'],
    200: ['253 230 138', '92 69 19'],
    700: ['180 83 9', '251 191 36'],
    800: ['146 64 14', '252 211 77'],
    900: ['120 53 15', '253 230 138'],
    950: ['69 26 3', '254 243 199'],
  },
  emerald: {
    50: ['236 253 245', '16 39 29'],
    100: ['209 250 229', '20 53 42'],
    200: ['167 243 208', '31 90 67'],
    700: ['4 120 87', '110 231 183'],
    800: ['6 95 70', '167 243 208'],
  },
  sky: {
    50: ['240 249 255', '16 34 46'],
    200: ['186 230 253', '29 74 99'],
    700: ['3 105 161', '125 211 252'],
  },
  blue: {
    50: ['239 246 255', '18 28 51'],
    100: ['219 234 254', '23 36 71'],
    200: ['191 219 254', '37 57 122'],
    700: ['29 78 216', '147 180 255'],
    950: ['23 37 84', '219 230 255'],
  },
  orange: {
    100: ['255 237 213', '58 35 18'],
    200: ['254 215 170', '92 56 19'],
    800: ['154 52 18', '253 186 116'],
  },
}

const isPair = (value) => Array.isArray(value)
const channel = (name) => `rgb(var(--${name}) / <alpha-value>)`

const colors = {}
const light = {}
const dark = {}
for (const [name, value] of Object.entries(palette)) {
  if (isPair(value)) {
    colors[name] = channel(name)
    light[`--${name}`] = value[0]
    dark[`--${name}`] = value[1]
    continue
  }
  colors[name] = {}
  for (const [step, pair] of Object.entries(value)) {
    colors[name][step] = channel(`${name}-${step}`)
    light[`--${name}-${step}`] = pair[0]
    dark[`--${name}-${step}`] = pair[1]
  }
}

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ...colors,
        violet: { DEFAULT: '#635BFF', dark: '#4F46E5' },
      },
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'sans-serif',
        ],
      },
      boxShadow: {
        card: '0 8px 24px rgba(15, 23, 42, 0.06)',
      },
    },
  },
  plugins: [
    plugin(({ addBase }) => {
      addBase({
        ':root': light,
        ':root[data-theme="dark"]': dark,
      })
    }),
  ],
}
