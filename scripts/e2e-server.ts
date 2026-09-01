import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const databasePath = process.env.DATABASE_PATH;
const port = process.env.PORT;
const distDir = process.env.NEXT_DIST_DIR;

if (!databasePath || !path.isAbsolute(databasePath) || !databasePath.startsWith(`${os.tmpdir()}${path.sep}`)) {
  throw new Error("E2E server requires an absolute DATABASE_PATH under the OS temporary directory");
}
if (!port || !/^\d+$/.test(port)) {
  throw new Error("E2E server requires a numeric PORT");
}
if (!distDir || !/^\.next-e2e-[A-Za-z0-9-]+$/.test(distDir)) {
  throw new Error("E2E server requires a unique .next-e2e-* NEXT_DIST_DIR");
}

const validatedDatabasePath = databasePath;
const validatedPort = port;
const validatedDistDir = distDir;

async function main() {
  fs.mkdirSync(path.dirname(validatedDatabasePath), { recursive: true });
  const { seedDatabase } = await import("../lib/db/seed");
  seedDatabase();

  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const nextProcess = spawn(npmCommand, ["run", "dev", "--", "--port", validatedPort], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  let shuttingDown = false;
  function cleanup() {
    fs.rmSync(validatedDatabasePath, { force: true });
    fs.rmSync(path.dirname(validatedDatabasePath), { recursive: true, force: true });
    fs.rmSync(path.resolve(process.cwd(), validatedDistDir), { recursive: true, force: true });
  }

  function stopNext(signal: NodeJS.Signals) {
    if (shuttingDown) return;
    shuttingDown = true;
    nextProcess.kill(signal);
  }

  process.on("SIGINT", () => stopNext("SIGINT"));
  process.on("SIGTERM", () => stopNext("SIGTERM"));
  nextProcess.on("error", (error) => {
    cleanup();
    console.error(error);
    process.exitCode = 1;
  });
  nextProcess.on("exit", (code) => {
    cleanup();
    process.exitCode = code ?? 1;
  });
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
