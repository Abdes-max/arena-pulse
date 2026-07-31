import { defineConfig } from 'vitest/config';

// @ionic/core has no "exports" map in its package.json, so when Vitest treats it
// as an external dependency, Node's native ESM resolver fails on the bare
// `@ionic/core/components` directory import used by @ionic/angular's bundle.
// Inlining the package forces Vite's own (more lenient) resolver to handle it.
export default defineConfig({
  ssr: {
    noExternal: [/@ionic\/(core|angular)/],
  },
  test: {
    server: {
      deps: {
        inline: [/@ionic\/(core|angular)/],
      },
    },
  },
});
