import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL;
const runId = randomUUID().replaceAll("-", "");
const specs = [
  { name: "gate0-settings", file: "gate0-settings.spec.ts", port: 3100 },
  { name: "gate1-dashboard", file: "gate1-dashboard.spec.ts", port: 3101 },
  { name: "gate2-csv", file: "gate2-csv.spec.ts", port: 3102 },
  { name: "gate2-inbox", file: "gate2-inbox.spec.ts", port: 3103 },
  { name: "gate2-upload", file: "gate2-upload.spec.ts", port: 3104 },
  { name: "gate3-bas", file: "gate3-bas.spec.ts", port: 3105 },
  { name: "gate4-ai-disabled", file: "gate4-ai-disabled.spec.ts", port: 3106 },
  { name: "gate4-closed-period", file: "gate4-closed-period.spec.ts", port: 3107 },
  { name: "final-regression", file: "final-regression.spec.ts", port: 3108 },
] as const;

const servers = externalBaseURL ? [] : specs.map((spec) => ({
  command: "npm run e2e:server",
  url: `http://127.0.0.1:${spec.port}/api/health`,
  name: `e2e-${spec.name}`,
  env: {
    DATABASE_PATH: path.join(os.tmpdir(), `tax-compliance-e2e-${runId}-${spec.name}`, "app.db"),
    INGEST_TOKEN: "test-ingest-token",
    AI_ENABLED: "false",
    AI_ALLOW_REAL_DATA: "false",
    NEXT_DIST_DIR: `.next-e2e-${runId}-${spec.name}`,
    PORT: String(spec.port),
  },
  reuseExistingServer: false,
  timeout: 120_000,
  gracefulShutdown: { signal: "SIGTERM" as const, timeout: 5_000 },
}));

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  webServer: servers,
  projects: specs.map((spec) => ({
    name: spec.name,
    testMatch: spec.file,
    use: {
      ...devices["Desktop Chrome"],
      baseURL: externalBaseURL ?? `http://127.0.0.1:${spec.port}`,
      trace: "on-first-retry" as const,
    },
  })),
});
