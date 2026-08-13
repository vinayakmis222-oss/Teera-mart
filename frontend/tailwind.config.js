/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./public/index.html"],
  theme: {
    extend: {
      colors: {
        terracotta: {
          DEFAULT: "#C4633A",
          hover: "#A6512B",
          light: "#E8B79A",
          soft: "#F4E4DA",
        },
        charcoal: {
          DEFAULT: "#2B2B2B",
          muted: "#5C5C5C",
          light: "#8A8A8A",
        },
        "off-white": {
          DEFAULT: "#F7F3EF",
          alt: "#EFEAE4",
        },
        sage: "#7E9476",
        ochre: "#D4A373",
        cream: "#FBF8F4",
        // Shadcn overrides mapping
        background: "#F7F3EF",
        foreground: "#2B2B2B",
        card: { DEFAULT: "#FFFFFF", foreground: "#2B2B2B" },
        popover: { DEFAULT: "#FFFFFF", foreground: "#2B2B2B" },
        primary: { DEFAULT: "#C4633A", foreground: "#F7F3EF" },
        secondary: { DEFAULT: "#EFEAE4", foreground: "#2B2B2B" },
        muted: { DEFAULT: "#EFEAE4", foreground: "#5C5C5C" },
        accent: { DEFAULT: "#F4E4DA", foreground: "#C4633A" },
        destructive: { DEFAULT: "#B0413E", foreground: "#F7F3EF" },
        border: "#E5DFD7",
        input: "#E5DFD7",
        ring: "#C4633A",
      },
      fontFamily: {
        heading: ["'Cabinet Grotesk'", "'Manrope'", "system-ui", "sans-serif"],
        body: ["'Manrope'", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      borderRadius: {
        lg: "8px",
        md: "6px",
        sm: "4px",
      },
      boxShadow: {
        card: "0 4px 20px rgba(43,43,43,0.05)",
        cardHover: "0 8px 30px rgba(196,99,58,0.14)",
        dropdown: "0 10px 40px rgba(43,43,43,0.08)",
      },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
        "fade-up": { "0%": { opacity: "0", transform: "translateY(12px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        "marquee": { "0%": { transform: "translateX(0)" }, "100%": { transform: "translateX(-50%)" } },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-up": "fade-up 0.5s ease-out both",
        "marquee": "marquee 30s linear infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
