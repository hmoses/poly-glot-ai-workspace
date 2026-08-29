import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  preview: {
    functions: {
      mcp: {
        name: "Poly-Glot MCP Server",
        source: "./functions/mcp.js",
      },
      entitlements: {
        name: "Poly-Glot Entitlement API",
        source: "./functions/entitlements.js",
      },
    },
  },
});
