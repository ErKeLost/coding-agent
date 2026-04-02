import { Daytona, type Sandbox } from '@daytonaio/sdk';
import type { FileUpload } from '@daytonaio/sdk/src/FileSystem';

let daytonaInstance: Daytona | null = null;

export type DaytonaSandbox = Awaited<ReturnType<Daytona['get']>>;

export function getDaytonaClient() {
  if (!daytonaInstance) {
    daytonaInstance = new Daytona({
      apiKey: process.env.DAYTONA_API_KEY || '',
    }
    );
  }
  return daytonaInstance;
}

export async function getSandboxById(sandboxId: string): Promise<Sandbox> {
  const daytona = getDaytonaClient();
  return daytona.get(sandboxId);
}

export async function getSandbox(sandboxId: string): Promise<DaytonaSandbox> {
  return getSandboxById(sandboxId);
}

export function createFileUploadFormat(content: string, destination: string): FileUpload {
  return {
    source: Buffer.from(content, 'utf-8'),
    destination,
  };
}

const DEFAULT_WORKING_DIR = '/workspace';

export function normalizeSandboxPath(inputPath: string): string {
  if (inputPath.startsWith(DEFAULT_WORKING_DIR)) {
    return inputPath;
  }

  if (inputPath.startsWith('./')) {
    return `${DEFAULT_WORKING_DIR}${inputPath.slice(1)}`;
  }

  if (inputPath.startsWith('/')) {
    return `${DEFAULT_WORKING_DIR}${inputPath}`;
  }

  return `${DEFAULT_WORKING_DIR}/${inputPath}`;
}
