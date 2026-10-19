import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  base: "/notetype/",
  plugins: [react()],
  server: {
    proxy: {
      "/notetype/api": "http://127.0.0.1:8795",
      "/notetype/media": "http://127.0.0.1:8795",
    },
  },
});
