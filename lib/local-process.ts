export type LocalProcessRecord = {
  id: string;
  kind: 'dev-server' | 'command' | 'shell' | 'unified-exec';
  command: string;
  workingDirectory: string;
  host?: string;
  port?: number;
  url?: string;
  pid?: number;
  exitCode?: number;
  logPath?: string;
  status: 'running' | 'stopped' | 'failed';
  createdAt: string;
  updatedAt: string;
};
