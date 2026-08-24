const { hairlineWidth } = require("nativewind/theme");

/**
 * Blink rider — NativeWind (Tailwind v3) config.
 *
 * Colors resolve through CSS variables defined in ./global.css, so the
 * semantic names below are the only thing components ever reference.
 * Raw ramps (blink-*, ink-*) are exposed for the brand-fixed cases the DS
 * calls out: the yellow header sweep, black pills, price gold.
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "../../packages/mobile-ui/src/**/*.{ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        border: "var(--color-border)",
        input: "var(--color-input)",
        ring: "var(--color-ring)",
        overlay: "var(--color-overlay)",
        background: "var(--color-background)",
        foreground: "var(--color-foreground)",
        strong: "var(--color-strong)",
        subtle: "var(--color-subtle)",
        price: "var(--color-price)",
        primary: {
          DEFAULT: "var(--color-primary)",
          foreground: "var(--color-primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--color-secondary)",
          foreground: "var(--color-secondary-foreground)",
        },
        muted: {
          DEFAULT: "var(--color-muted)",
          foreground: "var(--color-muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--color-accent)",
          foreground: "var(--color-accent-foreground)",
        },
        card: {
          DEFAULT: "var(--color-card)",
          foreground: "var(--color-card-foreground)",
        },
        inverse: {
          DEFAULT: "var(--color-inverse)",
          foreground: "var(--color-inverse-foreground)",
        },
        destructive: {
          DEFAULT: "var(--color-destructive)",
          foreground: "var(--color-destructive-foreground)",
          soft: "var(--color-destructive-soft)",
        },
        success: {
          DEFAULT: "var(--color-success)",
          foreground: "var(--color-success-foreground)",
          soft: "var(--color-success-soft)",
        },
        warning: {
          DEFAULT: "var(--color-warning)",
          foreground: "var(--color-warning-foreground)",
          soft: "var(--color-warning-soft)",
        },
        info: {
          DEFAULT: "var(--color-info)",
          foreground: "var(--color-info-foreground)",
          soft: "var(--color-info-soft)",
        },
        // Brand-fixed ramps. These do not theme — per the DS, the yellow is
        // the identity and the ink pills are ink in both schemes.
        blink: {
          50: "#FFFAE8",
          100: "#FFF2C2",
          200: "#FFE68F",
          300: "#FFD84F",
          400: "#FFC50B",
          500: "#F5B800",
          600: "#D89F00",
          700: "#A87B00",
          800: "#6E5000",
        },
        ink: {
          50: "#F8FAFD",
          100: "#EFF1F5",
          200: "#E4E7EC",
          300: "#CBD1DA",
          400: "#A8B0BC",
          500: "#818A99",
          600: "#5A6372",
          700: "#3A4150",
          800: "#242A36",
          900: "#151A24",
          950: "#0A0E16",
        },
      },
      fontFamily: {
        sans: ["Rubik_400Regular"],
        medium: ["Rubik_500Medium"],
        semibold: ["Rubik_600SemiBold"],
        bold: ["Rubik_700Bold"],
        black: ["Rubik_800ExtraBold"],
        italic: ["Rubik_700Bold_Italic"],
      },
      fontSize: {
        // DS type scale. [size, lineHeight] in px, as NativeWind expects.
        caption: ["11px", "15px"],
        label: ["12px", "16px"],
        "body-sm": ["13px", "19px"],
        body: ["15px", "23px"],
        "body-lg": ["18px", "28px"],
        price: ["17px", "22px"],
        "price-lg": ["24px", "29px"],
        h4: ["16px", "22px"],
        h3: ["18px", "23px"],
        h2: ["22px", "28px"],
        h1: ["28px", "34px"],
      },
      letterSpacing: {
        label: "0.72px", // 0.06em at 12px — uppercase eyebrows
        h1: "-0.56px", // -0.02em at 28px
        h2: "-0.33px",
      },
      spacing: {
        // DS 4px scale, named so screens read like the spec
        "space-1": "4px",
        "space-2": "6px",
        "space-3": "8px",
        "space-4": "12px",
        "space-5": "16px",
        "space-6": "20px",
        "space-7": "24px",
        "space-8": "32px",
        "space-9": "40px",
        "space-10": "48px",
        "space-11": "64px",
        screen: "16px", // --pad-screen
        "nav-h": "72px", // --bottom-nav-h
        control: "44px", // --control-h, minimum hit target
        "control-sm": "34px",
        "control-lg": "52px",
      },
      borderRadius: {
        sm: "8px",
        md: "12px", // buttons, inputs
        lg: "14px", // cards
        xl: "20px", // sheets
        "2xl": "28px", // the header bottom sweep — signature shape
        pill: "999px",
      },
      borderWidth: {
        hairline: hairlineWidth(),
      },
      boxShadow: {
        xs: "0 1px 2px rgba(10,14,22,.05)",
        card: "0 2px 8px -2px rgba(10,14,22,.08)",
        md: "0 6px 18px -4px rgba(10,14,22,.10)",
        lg: "0 20px 44px -14px rgba(10,14,22,.22)",
        brand: "0 10px 26px -10px rgba(216,159,0,.55)",
        nav: "0 -2px 12px rgba(10,14,22,.06)",
      },
      minHeight: {
        control: "44px",
      },
    },
  },
  plugins: [],
};
