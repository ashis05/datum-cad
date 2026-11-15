import type { NextConfig } from "next";

// Turbopack resolves alias targets relative to the project root (frontend/),
// not as absolute FS paths.
const emptyModule = "./lib/empty-module.js";

const nextConfig: NextConfig = {
  devIndicators: false,
  // replicad and replicad-opencascadejs ship Node-only code paths
  // (require("fs") / require("path")) that are unreachable in the browser but
  // still statically resolved by the bundler. Alias them to an empty module so
  // the client build succeeds. The WASM kernel is loaded from /public at
  // runtime via locateFile, not through these paths.
  turbopack: {
    resolveAlias: {
      // Scope to the browser build only — Next's own server/SSR code needs the
      // real fs/path, so a global alias would break it.
      fs: { browser: emptyModule },
      path: { browser: emptyModule },
      "node:fs": { browser: emptyModule },
      "node:path": { browser: emptyModule },
    },
  },
};

export default nextConfig;
