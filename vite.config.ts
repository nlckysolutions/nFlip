import { defineConfig } from "vite";

export default defineConfig({
  base: "/",
  define: {
    global: "globalThis",
  },
  build: {
    target: "es2022",
    sourcemap: false,
  },
  optimizeDeps: {
    exclude: ["@ffmpeg/ffmpeg", "@ffmpeg/core"],
  },
  worker: {
    format: "es",
  },
});
