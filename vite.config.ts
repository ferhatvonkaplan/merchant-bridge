import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: process.env.PUBLIC_BASE_PATH || "/",
  // Keep fonts as same-origin files so the production CSP needs no data: fonts.
  build: { assetsInlineLimit: 0 },
  plugins: [
    react(),
    {
      name: "production-content-security-policy",
      apply: "build",
      transformIndexHtml() {
        return [
          {
            tag: "meta",
            attrs: {
              "http-equiv": "Content-Security-Policy",
              content:
                "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; object-src 'none'; form-action 'none'",
            },
            injectTo: "head-prepend",
          },
        ];
      },
    },
  ],
  server: { port: 4173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
