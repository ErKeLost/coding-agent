import { createTool } from '@mastra/core/tools';
import { LspLanguageId } from '@daytonaio/sdk';
import { z } from 'zod';
import { getSandboxById } from './daytona-client';
import {
  HowOneResultSchema,
  buildProjectPathCandidates,
  getSandboxIdOrThrow,
  loadText,
  normalizeSandboxPath,
} from './sandbox-helpers';

const LSP_DESCRIPTION = loadText('lsp.txt');

export const lspTool = createTool({
  id: 'lsp',
  description: LSP_DESCRIPTION,
  inputSchema: z.object({
    sandboxId: z.string().min(1),
    operation: z.enum([
      'documentSymbol',
      'workspaceSymbol',
      'sandboxSymbols',
      'completions',
      'didOpen',
      'didClose',
      'start',
      'stop',
    ]),
    languageId: z.enum(['typescript', 'javascript', 'python']).optional(),
    projectPath: z.string().optional(),
    filePath: z.string().min(1).optional(),
    line: z.number().int().min(1).optional(),
    character: z.number().int().min(1).optional(),
    query: z.string().optional(),
  }),
  outputSchema: HowOneResultSchema,
  execute: async (inputData) => {
    const sandboxId = getSandboxIdOrThrow(inputData.sandboxId);
    const sandbox = await getSandboxById(sandboxId);
    const languageId =
      inputData.languageId === 'python'
        ? LspLanguageId.PYTHON
        : inputData.languageId === 'javascript'
          ? LspLanguageId.JAVASCRIPT
          : LspLanguageId.TYPESCRIPT;
    const projectPathCandidates = buildProjectPathCandidates(inputData.projectPath);
    const filePath = inputData.filePath ? normalizeSandboxPath(inputData.filePath) : undefined;

    const fileRequiredOperations = new Set(['documentSymbol', 'didOpen', 'didClose', 'completions']);
    if (fileRequiredOperations.has(inputData.operation) && !inputData.filePath) {
      throw new Error(`filePath is required for ${inputData.operation}.`);
    }
    if (inputData.operation === 'completions') {
      if (inputData.line == null || inputData.character == null) {
        throw new Error('line and character are required for completions.');
      }
    }

    let lastError: unknown;
    for (const projectPath of projectPathCandidates) {
      const lsp = await sandbox.createLspServer(languageId, projectPath);
      try {
        if (inputData.operation === 'stop') {
          await lsp.stop();
          return {
            title: `${inputData.operation}`,
            output: 'Stopped LSP server.',
            metadata: { result: 'stopped' },
          };
        }

        await lsp.start();
        let result: unknown = null;
        if (inputData.operation === 'documentSymbol') {
          result = await lsp.documentSymbols(filePath as string);
        } else if (inputData.operation === 'workspaceSymbol' || inputData.operation === 'sandboxSymbols') {
          result = await lsp.sandboxSymbols(inputData.query ?? '');
        } else if (inputData.operation === 'completions') {
          result = await lsp.completions(filePath as string, {
            line: (inputData.line as number) - 1,
            character: (inputData.character as number) - 1,
          });
        } else if (inputData.operation === 'didOpen') {
          await lsp.didOpen(filePath as string);
          result = 'opened';
        } else if (inputData.operation === 'didClose') {
          await lsp.didClose(filePath as string);
          result = 'closed';
        } else if (inputData.operation === 'start') {
          result = 'started';
        }
        if (inputData.operation !== 'start') {
          await lsp.stop();
        }
        return {
          title: (() => {
            if (inputData.operation === 'documentSymbol') return `${inputData.operation} ${inputData.filePath}`;
            if (inputData.operation === 'completions') {
              return `${inputData.operation} ${inputData.filePath}:${inputData.line}:${inputData.character}`;
            }
            if (inputData.operation === 'didOpen' || inputData.operation === 'didClose') {
              return `${inputData.operation} ${inputData.filePath}`;
            }
            if (inputData.operation === 'workspaceSymbol' || inputData.operation === 'sandboxSymbols') {
              return `${inputData.operation} ${inputData.query ?? ''}`.trim();
            }
            return `${inputData.operation}`;
          })(),
          output: JSON.stringify(result ?? [], null, 2),
          metadata: { result: result ?? [] },
        };
      } catch (error) {
        lastError = error;
        try {
          await lsp.stop();
        } catch {
          // best-effort cleanup
        }
      }
    }

    const errorMessage =
      lastError instanceof Error ? lastError.message : `LSP start failed for ${projectPathCandidates.join(', ')}`;
    const details = lastError && typeof lastError === 'object' ? JSON.stringify(lastError) : '';
    throw new Error(
      details
        ? `${errorMessage} | details: ${details}`
        : `${errorMessage} | tried: ${projectPathCandidates.join(', ')}`,
    );
  },
});
