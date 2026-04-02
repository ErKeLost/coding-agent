import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { LocalProcessRecord } from '@/lib/local-process';

const REGISTRY_DIR = path.join(os.homedir(), '.coding-agent');
const REGISTRY_PATH = path.join(REGISTRY_DIR, 'processes.json');

function ensureRegistryDir() {
  mkdirSync(REGISTRY_DIR, { recursive: true });
}

function sortRecords(records: LocalProcessRecord[]) {
  return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getProcessRegistryPath() {
  ensureRegistryDir();
  return REGISTRY_PATH;
}

export function readProcessRegistry() {
  ensureRegistryDir();
  if (!existsSync(REGISTRY_PATH)) {
    return [] as LocalProcessRecord[];
  }

  try {
    const content = readFileSync(REGISTRY_PATH, 'utf8');
    const parsed = JSON.parse(content) as LocalProcessRecord[];
    return Array.isArray(parsed) ? sortRecords(parsed) : [];
  } catch {
    return [];
  }
}

export function writeProcessRegistry(records: LocalProcessRecord[]) {
  ensureRegistryDir();
  writeFileSync(REGISTRY_PATH, JSON.stringify(sortRecords(records), null, 2));
}

export function upsertProcessRecord(record: LocalProcessRecord) {
  const records = readProcessRegistry();
  const index = records.findIndex(entry => entry.id === record.id);
  if (index >= 0) {
    records[index] = record;
  } else {
    records.push(record);
  }
  writeProcessRegistry(records);
  return record;
}

export function findProcessRecord(processId: string) {
  return readProcessRegistry().find(entry => entry.id === processId);
}

export function updateProcessRecord(
  processId: string,
  update: Partial<LocalProcessRecord>,
) {
  const records = readProcessRegistry();
  const index = records.findIndex(entry => entry.id === processId);
  if (index < 0) return null;
  const next = {
    ...records[index],
    ...update,
    updatedAt: new Date().toISOString(),
  };
  records[index] = next;
  writeProcessRegistry(records);
  return next;
}

export function removeMissingProcessState(record: LocalProcessRecord) {
  if (record.status === 'stopped') return record;
  if (!record.pid) return record;
  try {
    process.kill(record.pid, 0);
    return record;
  } catch {
    return updateProcessRecord(record.id, { status: 'stopped' }) ?? {
      ...record,
      status: 'stopped',
      updatedAt: new Date().toISOString(),
    };
  }
}
