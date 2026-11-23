export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#080b0a",
        panel: "#0e1311",
        line: "#222c27",
        acid: "#c8f65d",
        mint: "#74e6b5",
        amber: "#f4bd61",
      },
      fontFamily: {
        display: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["SFMono-Regular", "Consolas", "Liberation Mono", "monospace"],
      },
      boxShadow: {
        glow: "0 0 50px rgba(200, 246, 93, 0.08)",
      },
      animation: {
        pulseSoft: "pulseSoft 2.4s ease-in-out infinite",
        scan: "scan 7s linear infinite",
      },
      keyframes: {
        pulseSoft: {
          "0%, 100%": { opacity: "0.45" },
          "50%": { opacity: "1" },
        },
        scan: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(500%)" },
        },
      },
    },
  },
  plugins: [],
};
