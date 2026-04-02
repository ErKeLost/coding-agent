import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { LibSQLStore, LibSQLVector } from "@mastra/libsql";

declare global {
  var mastraStore: LibSQLStore | undefined;
  var mastraVector: LibSQLVector | undefined;
}

function getStorageDir() {
  const configuredDir = process.env.MASTRA_STORAGE_DIR?.trim();
  return configuredDir || path.join(homedir(), ".coding-agent");
}

function getDatabasePath() {
  const configuredPath = process.env.MASTRA_STORAGE_PATH?.trim();
  return configuredPath || path.join(getStorageDir(), "mastra.db");
}

function ensureStorageDir() {
  mkdirSync(path.dirname(getDatabasePath()), { recursive: true });
}

function getDatabaseUrl() {
  ensureStorageDir();
  return pathToFileURL(getDatabasePath()).toString();
}

export function getMastraStore() {
  if (!global.mastraStore) {
    global.mastraStore = new LibSQLStore({
      id: "mastra-storage",
      url: getDatabaseUrl(),
    });
  }

  return global.mastraStore;
}

export function getMastraVector() {
  if (!global.mastraVector) {
    global.mastraVector = new LibSQLVector({
      id: "mastra-vector",
      url: getDatabaseUrl(),
    });
  }

  return global.mastraVector;
}

export const mastraStore = getMastraStore();
export const mastraVector = getMastraVector();
let storageReadyPromise: Promise<void> | undefined;

export function ensureMastraStorageReady() {
  if (!storageReadyPromise) {
    storageReadyPromise = mastraStore.init();
  }

  return storageReadyPromise;
}
