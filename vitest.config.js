import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.js"],
    exclude: ["node_modules/**"],
    env: {
      DUX_LOG_DISABLED: "1",
    },
  },
});
