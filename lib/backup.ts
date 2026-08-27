import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import Database from "better-sqlite3";
import { closeDatabase, getDatabaseFilePath, getRawDb } from "@/lib/db/client";
import { runMigrations } from "@/lib/db/migrate";

const execFileAsync = promisify(execFile);
const ZIP_BIN = "/usr/bin/zip";
const UNZIP_BIN = "/usr/bin/unzip";

export type BackupManifest = {
  format: "tax-compliance-backup";
  version: 1;
  createdAt: string;
  timezone: "Australia/Melbourne";
  includesDatabase: true;
  includesFiles: true;
};

export type BackupArchive = {
  buffer: Buffer;
  entries: string[];
  manifest: BackupManifest;
};

type BackupPathOptions = {
  databaseFilePath?: string;
  filesDirectory?: string;
};

function resolvedDatabasePath(value?: string) {
  const candidate = value ?? getDatabaseFilePath();
  return path.isAbsolute(candidate) ? candidate : path.resolve(process.cwd(), candidate);
}

function resolvedFilesDirectory(databaseFilePath: string, value?: string) {
  const candidate = value ?? path.join(path.dirname(databaseFilePath), "files");
  return path.isAbsolute(candidate) ? candidate : path.resolve(process.cwd(), candidate);
}

async function archiveEntries(archivePath: string) {
  const result = await execFileAsync(UNZIP_BIN, ["-Z1", archivePath]);
  return result.stdout.split(/\r?\n/).map((entry) => entry.trim()).filter(Boolean);
}

function validateArchiveEntry(entry: string) {
  const segments = entry.split("/");
  if (!entry || entry.includes("\\") || entry.startsWith("/") || segments.includes("..") || path.posix.normalize(entry).startsWith("..")) {
    throw new Error(`Unsafe backup archive path: ${entry}`);
  }
  if (entry !== "app.db" && entry !== "manifest.json" && entry !== "files" && !entry.startsWith("files/")) {
    throw new Error(`Unsupported backup archive entry: ${entry}`);
  }
}

async function rejectExtractedSymlinks(root: string, current = root): Promise<void> {
  for (const entry of await fsp.readdir(current, { withFileTypes: true })) {
    const entryPath = path.join(current, entry.name);
    const stats = await fsp.lstat(entryPath);
    if (stats.isSymbolicLink()) throw new Error(`Symbolic links are not allowed in backup archives: ${entry.name}`);
    if (entry.isDirectory()) await rejectExtractedSymlinks(root, entryPath);
  }
}

function readManifest(value: string): BackupManifest {
  const manifest = JSON.parse(value) as Partial<BackupManifest>;
  if (
    manifest.format !== "tax-compliance-backup"
    || manifest.version !== 1
    || manifest.includesDatabase !== true
    || manifest.includesFiles !== true
    || manifest.timezone !== "Australia/Melbourne"
  ) {
    throw new Error("Unsupported or incomplete backup manifest");
  }
  return manifest as BackupManifest;
}

export async function createBackupArchive(options: BackupPathOptions = {}): Promise<BackupArchive> {
  runMigrations();
  const databaseFilePath = resolvedDatabasePath(options.databaseFilePath);
  const filesDirectory = resolvedFilesDirectory(databaseFilePath, options.filesDirectory);
  const workDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), "tax-compliance-backup-"));
  const stagedDatabasePath = path.join(workDirectory, "app.db");
  const stagedFilesPath = path.join(workDirectory, "files");
  const archivePath = path.join(workDirectory, "backup.zip");
  const manifest: BackupManifest = {
    format: "tax-compliance-backup",
    version: 1,
    createdAt: new Date().toISOString(),
    timezone: "Australia/Melbourne",
    includesDatabase: true,
    includesFiles: true,
  };

  try {
    const sourceDb = options.databaseFilePath ? new Database(databaseFilePath) : getRawDb();
    try {
      await sourceDb.backup(stagedDatabasePath);
    } finally {
      if (options.databaseFilePath) sourceDb.close();
    }
    if (!fs.existsSync(filesDirectory)) {
      await fsp.mkdir(stagedFilesPath, { recursive: true });
    } else {
      await fsp.cp(filesDirectory, stagedFilesPath, { recursive: true });
    }
    await fsp.writeFile(path.join(workDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await execFileAsync(ZIP_BIN, ["-q", "-r", archivePath, "."], { cwd: workDirectory });
    const entries = await archiveEntries(archivePath);
    entries.forEach(validateArchiveEntry);
    return { buffer: await fsp.readFile(archivePath), entries, manifest };
  } finally {
    await fsp.rm(workDirectory, { recursive: true, force: true });
  }
}

function requiredTableNames(databaseFilePath: string) {
  const database = new Database(databaseFilePath, { readonly: true });
  try {
    const rows = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>;
    return new Set(rows.map((row) => row.name));
  } finally {
    database.close();
  }
}

export async function restoreBackupArchive(buffer: Buffer | Uint8Array, options: BackupPathOptions = {}) {
  const targetDatabasePath = resolvedDatabasePath(options.databaseFilePath);
  const targetFilesPath = resolvedFilesDirectory(targetDatabasePath, options.filesDirectory);
  const workDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), "tax-compliance-restore-"));
  const archivePath = path.join(workDirectory, "backup.zip");
  const extractionPath = path.join(workDirectory, "extracted");
  const rollbackPath = path.join(workDirectory, "rollback");
  await fsp.mkdir(extractionPath, { recursive: true });
  await fsp.writeFile(archivePath, buffer);

  let databaseWasClosed = false;
  try {
    const entries = await archiveEntries(archivePath);
    entries.forEach(validateArchiveEntry);
    if (!entries.includes("app.db") || !entries.includes("manifest.json")) throw new Error("Backup is missing app.db or manifest.json");
    await execFileAsync(UNZIP_BIN, ["-q", archivePath, "-d", extractionPath]);
    await rejectExtractedSymlinks(extractionPath);
    const manifest = readManifest(await fsp.readFile(path.join(extractionPath, "manifest.json"), "utf8"));
    const stagedDatabasePath = path.join(extractionPath, "app.db");
    const tables = requiredTableNames(stagedDatabasePath);
    for (const required of ["entities", "transactions", "obligations", "bas_worksheets"]) {
      if (!tables.has(required)) throw new Error(`Backup database is missing table: ${required}`);
    }

    await fsp.mkdir(rollbackPath, { recursive: true });
    const currentDatabaseExists = fs.existsSync(targetDatabasePath);
    const currentFilesExists = fs.existsSync(targetFilesPath);
    if (currentDatabaseExists) await fsp.copyFile(targetDatabasePath, path.join(rollbackPath, "app.db"));
    if (currentFilesExists) await fsp.cp(targetFilesPath, path.join(rollbackPath, "files"), { recursive: true });

    const replacesCurrentDatabase = path.resolve(targetDatabasePath) === path.resolve(getDatabaseFilePath()) && currentDatabaseExists;
    if (replacesCurrentDatabase) {
      getRawDb().pragma("wal_checkpoint(TRUNCATE)");
      closeDatabase();
      databaseWasClosed = true;
    }

    await fsp.mkdir(path.dirname(targetDatabasePath), { recursive: true });
    await fsp.rm(`${targetDatabasePath}-wal`, { force: true });
    await fsp.rm(`${targetDatabasePath}-shm`, { force: true });
    await fsp.copyFile(stagedDatabasePath, targetDatabasePath);
    await fsp.rm(targetFilesPath, { recursive: true, force: true });
    await fsp.mkdir(path.dirname(targetFilesPath), { recursive: true });
    const stagedFilesPath = path.join(extractionPath, "files");
    if (fs.existsSync(stagedFilesPath)) {
      await fsp.cp(stagedFilesPath, targetFilesPath, { recursive: true });
    } else {
      await fsp.mkdir(targetFilesPath, { recursive: true });
    }

    return manifest;
  } catch (error) {
    const rollbackDatabasePath = path.join(rollbackPath, "app.db");
    const rollbackFilesPath = path.join(rollbackPath, "files");
    if (fs.existsSync(rollbackDatabasePath)) {
      await fsp.rm(`${targetDatabasePath}-wal`, { force: true });
      await fsp.rm(`${targetDatabasePath}-shm`, { force: true });
      await fsp.copyFile(rollbackDatabasePath, targetDatabasePath);
    }
    if (fs.existsSync(rollbackFilesPath)) {
      await fsp.rm(targetFilesPath, { recursive: true, force: true });
      await fsp.cp(rollbackFilesPath, targetFilesPath, { recursive: true });
    }
    throw error;
  } finally {
    if (databaseWasClosed) {
      // The next request will lazily reopen the restored database.
    }
    await fsp.rm(workDirectory, { recursive: true, force: true });
  }
}
