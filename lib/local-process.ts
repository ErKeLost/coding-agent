export type LocalProcessRecord = {
  id: string;
  kind: 'dev-server';
  command: string;
  workingDirectory: string;
  host: string;
  port: number;
  url: string;
  pid?: number;
  logPath?: string;
  status: 'running' | 'stopped';
  createdAt: string;
  updatedAt: string;
};
