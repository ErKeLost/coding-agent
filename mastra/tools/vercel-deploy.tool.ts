import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getSandbox } from './daytona-client';
import { buildShellCommand, extractCommandResult } from './daytona-helpers';
import { normalizePackageCommand, readSandboxTextFile, writeSandboxTextFile } from './sandbox-helpers';
import { emitToolProgress } from './tool-progress';

const WORKSPACE_ROOT = '/workspace';
const DeployOutputSchema = z.object({
  success: z.boolean().describe('Whether the deployment workflow completed successfully.'),
  deploymentUrl: z
    .string()
    .optional()
    .describe('Final public URL after aliasing (projectName-<hash>.customDomain).'),
  errorStep: z
    .string()
    .optional()
    .describe('Step name that failed (config/install/link/pull/build/deploy/alias/unexpected).'),
  stdout: z.string().optional().describe('Captured stdout from the failed step.'),
  stderr: z.string().optional().describe('Captured stderr from the failed step.'),
});

function extractDeploymentUrl(output: string) {
  const matches = output.match(/https?:\/\/[^\s]+/g);
  if (!matches || matches.length === 0) return undefined;
  const vercelMatches = matches.filter((url) => /vercel\.app\b/i.test(url));
  return (vercelMatches.length > 0 ? vercelMatches : matches).slice(-1)[0];
}

function normalizeBaseDomain(value?: string) {
  if (!value) return undefined;
  const trimmed = value.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return trimmed || undefined;
}

function normalizeSubdomainLabel(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

function isProjectMissing(output: string) {
  const text = output.toLowerCase();
  return (
    text.includes('project not found') ||
    text.includes('could not find project') ||
    text.includes('404') ||
    text.includes('not exists')
  );
}

function isAlreadyExists(output: string) {
  const text = output.toLowerCase();
  return text.includes('already exists') || text.includes('already linked');
}

type DeployConfig =
  | { ok: true; token: string; scope: string; baseDomain: string }
  | { ok: false; message: string };

function resolveDeployConfig(): DeployConfig {
  const token = process.env.VC_TOKEN || process.env.VERCEL_TOKEN || '';
  const scope = process.env.VC_TEAM_ID || process.env.VERCEL_ORG_ID || '';
  const envCustomDomain = process.env.VC_CUSTOM_DOMAIN || '';
  const baseDomain = normalizeBaseDomain(envCustomDomain);

  if (!token) {
    return {
      ok: false,
      message: 'Missing VC_TOKEN (or VERCEL_TOKEN) environment variable.',
    };
  }
  if (!scope) {
    return {
      ok: false,
      message: 'Missing VC_TEAM_ID (or VERCEL_ORG_ID) environment variable.',
    };
  }
  if (!baseDomain) {
    return {
      ok: false,
      message: 'Missing VC_CUSTOM_DOMAIN environment variable.',
    };
  }
  return { ok: true, token, scope, baseDomain };
}

async function hasVercelProjectConfig(
  sandbox: Awaited<ReturnType<typeof getSandbox>>,
  workingDirectory: string,
) {
  const script = [
    'import os',
    'path = os.path.join(os.getcwd(), ".vercel", "project.json")',
    'print("1" if os.path.exists(path) else "0")',
  ].join('\n');
  const command = buildShellCommand(`python - <<'PY'\n${script}\nPY`, workingDirectory);
  const result = await sandbox.process.executeCommand(command);
  const { stdout } = extractCommandResult(result);
  return stdout.trim() === '1';
}

async function readVercelProjectName(
  sandbox: Awaited<ReturnType<typeof getSandbox>>,
  workingDirectory: string,
) {
  const script = [
    'import json, os',
    'path = os.path.join(os.getcwd(), ".vercel", "project.json")',
    'if not os.path.exists(path):',
    '  print("")',
    'else:',
    '  with open(path, "r") as f:',
    '    data = json.load(f)',
    '  print(data.get("name", ""))',
  ].join('; ');
  const command = buildShellCommand(`python -c ${JSON.stringify(script)}`, workingDirectory);
  const result = await sandbox.process.executeCommand(command);
  const { stdout } = extractCommandResult(result);
  const value = stdout.trim();
  return value.length > 0 ? value : undefined;
}
async function readAliasDomain(sandboxId: string) {
  const filePath = `${WORKSPACE_ROOT}/.howone/deploy/alias.json`;
  try {
    const raw = await readSandboxTextFile(sandboxId, filePath);
    const data = JSON.parse(raw) as { aliasDomain?: string };
    return data.aliasDomain?.trim() || undefined;
  } catch {
    return undefined;
  }
}

async function writeAliasDomain(sandboxId: string, aliasDomain: string) {
  const filePath = `${WORKSPACE_ROOT}/.howone/deploy/alias.json`;
  const content = JSON.stringify({ aliasDomain }, null, 2);
  await writeSandboxTextFile(sandboxId, filePath, content);
}

export const deployTool = createTool({
  id: 'deploy',
  description:
    'Deploy the current sandbox project with Vercel CLI (bunx): install deps, create project, link, build, deploy, and alias to a generated subdomain. Reads credentials and domain from the agent environment.',
  inputSchema: z.object({
    sandboxId: z.string().min(1).describe('Target Daytona sandbox ID for deployment.'),
    projectName: z
      .string()
      .min(1)
      .describe('Vercel project name used for project creation/link and subdomain prefix.'),
    aliasSubdomain: z
      .string()
      .optional()
      .describe('Optional subdomain to use for aliasing (defaults to projectName).'),
  }),
  outputSchema: DeployOutputSchema.describe('Deployment result with URLs and error details.'),
  execute: async (inputData, context) => {
    const sandbox = await getSandbox(inputData.sandboxId);
    const workingDirectory = WORKSPACE_ROOT;
    const projectSlug = inputData.projectName.trim();
    if (!projectSlug) {
      return {
        success: false,
        errorStep: 'config',
        stderr: 'Missing projectName.',
      };
    }

    await emitToolProgress('deploy', context, {
      step: 'config',
      runState: 'running',
      message: 'Validating deploy environment variables and domain config.',
    });
    const config = resolveDeployConfig();
    if (!config.ok) {
      await emitToolProgress('deploy', context, {
        step: 'config',
        runState: 'failed',
        message: config.message,
      });
      return {
        success: false,
        errorStep: 'config',
        stderr: config.message,
      };
    }
    const { token, scope, baseDomain } = config;
    await emitToolProgress('deploy', context, {
      step: 'config',
      runState: 'completed',
      message: `Config ready (team=${scope}, domain=${baseDomain}).`,
    });

    const tokenArgValue = `--token ${token}`;
    const scopeArgValue = `--scope ${scope}`;
    const storedAlias = await readAliasDomain(inputData.sandboxId);
    const aliasPrefixRaw = inputData.aliasSubdomain?.trim() || projectSlug;
    const aliasPrefix = normalizeSubdomainLabel(aliasPrefixRaw);
    if (!aliasPrefix) {
      return {
        success: false,
        errorStep: 'config',
        stderr: 'aliasSubdomain/projectName is invalid for DNS label.',
      };
    }
    const aliasDomain = storedAlias ?? `${aliasPrefix}.${baseDomain}`;

    const runStep = async (step: string, command: string, timeoutMs?: number) => {
      await emitToolProgress('deploy', context, { step, runState: 'running' });
      const startedAt = Date.now();
      const normalized = normalizePackageCommand(command);
      const shellCommand = buildShellCommand(normalized, workingDirectory, timeoutMs);
      const sessionId = `mastra-deploy-${step}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await sandbox.process.createSession(sessionId);
      const result = await sandbox.process.executeSessionCommand(sessionId, {
        command: shellCommand,
        runAsync: false,
      });

      const { stdout, stderr, exitCode } = extractCommandResult(result);
      const durationMs = Date.now() - startedAt;
      console.log(`[deploy] step=${step} exitCode=${exitCode} durationMs=${durationMs} stderr=${stderr.slice(0, 1000)}`);
      await emitToolProgress('deploy', context, {
        step,
        runState: exitCode === 0 ? 'completed' : 'failed',
        stdout,
        stderr,
        durationMs,
      });
      return { stdout, stderr, exitCode };
    };

    try {
      await emitToolProgress('deploy', context, {
        step: 'project-check',
        runState: 'running',
        message: `Ensuring Vercel project "${projectSlug}" is linked.`,
      });
      const hasProjectConfig = await hasVercelProjectConfig(sandbox, workingDirectory);
      const linkedProjectName = hasProjectConfig
        ? await readVercelProjectName(sandbox, workingDirectory)
        : undefined;
      const isAlreadyLinked = hasProjectConfig && linkedProjectName === projectSlug;
      await emitToolProgress('deploy', context, {
        step: 'project-check',
        runState: 'completed',
        message: isAlreadyLinked
          ? `Linked project detected: ${projectSlug}`
          : `No matching linked project found (current=${linkedProjectName ?? 'none'}).`,
      });

      if (!isAlreadyLinked) {
        const linkCommand = [
          'bunx vercel link',
          `--project ${projectSlug}`,
          '--yes',
          scopeArgValue,
          tokenArgValue,
        ]
          .filter(Boolean)
          .join(' ');

        const firstLink = await runStep('link', linkCommand);
        if (firstLink.exitCode !== 0) {
          const linkOutput = `${firstLink.stdout}\n${firstLink.stderr}`;
          if (!isProjectMissing(linkOutput)) {
            return {
              success: false,
              errorStep: 'link',
              stdout: firstLink.stdout,
              stderr: firstLink.stderr,
            };
          }

          const addCommand = [
            'bunx vercel project add',
            projectSlug,
            scopeArgValue,
            tokenArgValue,
          ]
            .filter(Boolean)
            .join(' ');
          const add = await runStep('project-add', addCommand);
          if (add.exitCode !== 0 && !isAlreadyExists(`${add.stdout}\n${add.stderr}`)) {
            return {
              success: false,
              errorStep: 'project-add',
              stdout: add.stdout,
              stderr: add.stderr,
            };
          }

          const retryLink = await runStep('link', linkCommand);
          if (retryLink.exitCode !== 0) {
            return {
              success: false,
              errorStep: 'link',
              stdout: retryLink.stdout,
              stderr: retryLink.stderr,
            };
          }
        }

        const pullCommand = [
          'bunx vercel pull',
          '--yes',
          scopeArgValue,
          tokenArgValue,
        ]
          .filter(Boolean)
          .join(' ');
        const pull = await runStep('pull', pullCommand);
        if (pull.exitCode !== 0) {
          return {
            success: false,
            errorStep: 'pull',
            stdout: pull.stdout,
            stderr: pull.stderr,
          };
        }
      }

      const install = await runStep('install', 'bun install');
      if (install.exitCode !== 0) {
        return {
          success: false,
          errorStep: 'install',
          stdout: install.stdout,
          stderr: install.stderr,
        };
      }

      const build = await runStep('build', 'bun run build');
      if (build.exitCode !== 0) {
        return {
          success: false,
          errorStep: 'build',
          stdout: build.stdout,
          stderr: build.stderr,
        };
      }

      const deploy = await runStep(
        'deploy',
        `bunx vercel deploy --prod --cwd dist ${tokenArgValue} ${scopeArgValue} --yes`,
      );
      if (deploy.exitCode !== 0) {
        return {
          success: false,
          errorStep: 'deploy',
          stdout: deploy.stdout,
          stderr: deploy.stderr,
        };
      }

      console.log(`[deploy] Extracting deployment URL from deploy step output.`);

      const deploymentUrl = extractDeploymentUrl(`${deploy.stdout}\n${deploy.stderr}`);
      if (!deploymentUrl) {
        return {
          success: false,
          errorStep: 'deploy',
          stderr: 'Failed to detect deployment URL from Vercel output.',
        };
      }

      console.log(`[deploy] Deployment URL detected: ${deploymentUrl}`);
      await emitToolProgress('deploy', context, {
        step: "deploy",
        runState: 'completed',
        previewUrl: deploymentUrl,
      });

      const alias = await runStep(
        'alias',
        `CI=1 VERCEL_CI=1 bunx vercel alias set ${deploymentUrl} ${aliasDomain} ${tokenArgValue} ${scopeArgValue}`,
        120_000,
      );
      console.log(`[deploy] Alias step completed with exit code ${alias.exitCode}.`);
      if (alias.exitCode !== 0) {
        return {
          success: false,
          errorStep: 'alias',
          stdout: alias.stdout,
          stderr: alias.stderr,
        };
      }
      await writeAliasDomain(inputData.sandboxId, aliasDomain);

      return {
        success: true,
        deploymentUrl: `https://${aliasDomain}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await emitToolProgress('deploy', context, {
        step: "unexpected",
        runState: 'failed',
        message,
      });
      return {
        success: false,
        errorStep: 'unexpected',
        stderr: message,
      };
    }
  },
});
