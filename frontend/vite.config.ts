import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  define: {
    global: "globalThis",
  },
  optimizeDeps: {
    include: ["@coral-xyz/anchor", "@solana/web3.js", "buffer"],
  },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 1400,
  },
});
