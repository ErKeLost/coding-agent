import { randomUUID } from 'node:crypto';
import { ChildProcess, spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { WebSocket as WebSocketType } from 'ws';
import WebSocket from 'ws';

export type BrowserEngine = 'auto' | 'chrome' | 'chromium' | 'edge';
export type BrowserWaitUntil = 'load' | 'domcontentloaded' | 'interactive';

export type BrowserTarget = {
  selector?: string;
  text?: string;
  role?: string;
  name?: string;
  placeholder?: string;
  label?: string;
  index?: number;
  exact?: boolean;
};

export type BrowserSessionSummary = {
  sessionId: string;
  browserName: string;
  executablePath: string;
  debuggerPort: number;
  pid?: number;
  headless: boolean;
  viewport: {
    width: number;
    height: number;
  };
  startedAt: string;
  updatedAt: string;
  currentUrl: string;
  title: string;
  state: 'ready' | 'closed' | 'error';
};

type BrowserCreateOptions = {
  browser?: BrowserEngine;
  headless?: boolean;
  width?: number;
  height?: number;
  timeoutMs?: number;
};

type PageSummaryOptions = {
  includeScreenshot?: boolean;
  fullPage?: boolean;
  maxTextLength?: number;
  maxInteractives?: number;
};

type WaitForConditions = {
  target?: BrowserTarget;
  text?: string;
  urlIncludes?: string;
  titleIncludes?: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
};

type CdpResponse = {
  id?: number;
  result?: Record<string, unknown>;
  error?: { message?: string };
  method?: string;
  params?: Record<string, unknown>;
};

type BrowserExecutable = {
  browserName: string;
  executablePath: string;
};

type TargetResolution = {
  ok: boolean;
  descriptor?: string;
  reason?: string;
  x?: number;
  y?: number;
  value?: string;
};

type PageSummary = {
  title: string;
  url: string;
  readyState: string;
  textExcerpt: string;
  interactives: Array<{
    tag: string;
    role: string;
    text: string;
  }>;
  screenshotDataUrl?: string;
};

const BROWSER_SESSION_ROOT = path.join(
  os.homedir(),
  '.coding-agent',
  'browser-sessions',
);
const MAX_ACTIVE_BROWSER_SESSIONS = 4;
const IDLE_SESSION_TTL_MS = 15 * 60_000;
const DEFAULT_BROWSER_TIMEOUT_MS = 30_000;
const DEFAULT_POLL_INTERVAL_MS = 250;
const DEFAULT_VIEWPORT = {
  width: 1440,
  height: 960,
};

const macCandidates = {
  chrome: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ],
  chromium: [
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  ],
  edge: ['/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
};

const linuxCandidates = {
  chrome: ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'],
  chromium: ['/usr/bin/chromium', '/usr/bin/chromium-browser'],
  edge: ['/usr/bin/microsoft-edge', '/usr/bin/microsoft-edge-stable'],
};

const windowsCandidates = {
  chrome: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ],
  chromium: [
    'C:\\Program Files\\Chromium\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Chromium\\Application\\chrome.exe',
  ],
  edge: [
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ],
};

const sessions = new Map<string, BrowserSession>();
let cleanupHooksInstalled = false;

function nowIso() {
  return new Date().toISOString();
}

function ensureSessionRoot() {
  mkdirSync(BROWSER_SESSION_ROOT, { recursive: true });
  return BROWSER_SESSION_ROOT;
}

async function findFreePort() {
  const { createServer } = await import('node:net');
  return await new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port =
        typeof address === 'object' && address ? address.port : undefined;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        if (!port) {
          reject(new Error('Failed to allocate a browser debugging port.'));
          return;
        }
        resolve(port);
      });
    });
  });
}

function installCleanupHooks() {
  if (cleanupHooksInstalled) return;
  cleanupHooksInstalled = true;

  const shutdown = () => {
    for (const session of sessions.values()) {
      void session.close();
    }
  };

  process.once('exit', shutdown);
  process.once('SIGINT', () => {
    shutdown();
    process.exit(130);
  });
  process.once('SIGTERM', () => {
    shutdown();
    process.exit(143);
  });
}

function getExecutableCandidates(browser: BrowserEngine) {
  const override = process.env.ROVIX_BROWSER_EXECUTABLE?.trim();
  if (override) {
    return [{ browserName: 'custom', executablePath: override }];
  }

  const candidateMap =
    process.platform === 'darwin'
      ? macCandidates
      : process.platform === 'win32'
        ? windowsCandidates
        : linuxCandidates;

  const order =
    browser === 'auto'
      ? (['chrome', 'chromium', 'edge'] as const)
      : ([browser] as const);

  return order.flatMap((name) =>
    candidateMap[name].map((executablePath) => ({
      browserName: name,
      executablePath,
    })),
  );
}

function resolveBrowserExecutable(browser: BrowserEngine) {
  const candidates = getExecutableCandidates(browser);
  const match = candidates.find((candidate) =>
    existsSync(candidate.executablePath),
  );
  if (match) {
    return match as BrowserExecutable;
  }

  throw new Error(
    [
      `No supported browser executable found for "${browser}".`,
      'Set ROVIX_BROWSER_EXECUTABLE to a Chrome/Chromium/Edge executable path to override detection.',
    ].join(' '),
  );
}

async function fetchJson<T>(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

async function poll<T>(
  work: () => Promise<T | null>,
  timeoutMs: number,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
) {
  const startedAt = Date.now();
  for (;;) {
    const value = await work();
    if (value !== null) {
      return value;
    }
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error('Timed out while waiting for the browser session.');
    }
    await delay(pollIntervalMs);
  }
}

function escapeForTemplate(value: string) {
  return JSON.stringify(value);
}

function buildResolveTargetExpression(target: BrowserTarget, action: 'point' | 'fill', text?: string) {
  return `
(() => {
  const target = ${JSON.stringify(target)};
  const action = ${escapeForTemplate(action)};
  const nextValue = ${JSON.stringify(text ?? '')};
  const normalize = (value) => (value ?? '').replace(/\\s+/g, ' ').trim();
  const matches = (value, query, exact) => {
    const left = normalize(value).toLowerCase();
    const right = normalize(query).toLowerCase();
    if (!right) return true;
    return exact ? left === right : left.includes(right);
  };
  const isVisible = (element) => {
    if (!(element instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(element);
    if (style.visibility === 'hidden' || style.display === 'none') return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const roleOf = (element) => {
    const explicit = element.getAttribute('role');
    if (explicit) return explicit;
    const tag = element.tagName.toLowerCase();
    if (tag === 'a') return 'link';
    if (tag === 'button') return 'button';
    if (tag === 'input') {
      const type = (element.getAttribute('type') || 'text').toLowerCase();
      return type === 'checkbox' ? 'checkbox' : type === 'radio' ? 'radio' : 'textbox';
    }
    if (tag === 'textarea') return 'textbox';
    if (tag === 'select') return 'combobox';
    return '';
  };
  const nameOf = (element) => {
    const aria = element.getAttribute('aria-label');
    if (aria) return aria;
    if ('labels' in element && Array.isArray(Array.from(element.labels || []))) {
      const labelText = Array.from(element.labels || [])
        .map((label) => normalize(label.textContent || ''))
        .filter(Boolean)
        .join(' ');
      if (labelText) return labelText;
    }
    const placeholder = element.getAttribute('placeholder');
    if (placeholder) return placeholder;
    const alt = element.getAttribute('alt');
    if (alt) return alt;
    const title = element.getAttribute('title');
    if (title) return title;
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      return element.value || '';
    }
    return element.innerText || element.textContent || '';
  };
  const all = Array.from(document.querySelectorAll('body *')).filter(isVisible);
  let candidates = all;
  if (target.selector) {
    candidates = Array.from(document.querySelectorAll(target.selector)).filter(isVisible);
  }
  if (target.role) {
    candidates = candidates.filter((element) => matches(roleOf(element), target.role || '', true));
  }
  if (target.name) {
    candidates = candidates.filter((element) => matches(nameOf(element), target.name || '', !!target.exact));
  }
  if (target.text) {
    candidates = candidates.filter((element) => matches(element.innerText || element.textContent || '', target.text || '', !!target.exact));
  }
  if (target.placeholder) {
    candidates = candidates.filter((element) =>
      matches(element.getAttribute('placeholder') || '', target.placeholder || '', !!target.exact),
    );
  }
  if (target.label) {
    candidates = candidates.filter((element) => {
      if (!('labels' in element)) return false;
      const labels = Array.from(element.labels || []);
      return labels.some((label) => matches(label.textContent || '', target.label || '', !!target.exact));
    });
  }
  if (candidates.length === 0) {
    return { ok: false, reason: 'No matching element found.' };
  }
  const index = Math.max(0, target.index || 0);
  const element = candidates[index];
  if (!element) {
    return { ok: false, reason: 'Matching elements were found, but the requested index does not exist.' };
  }
  element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' });
  const rect = element.getBoundingClientRect();
  const descriptor = [
    element.tagName.toLowerCase(),
    roleOf(element) ? 'role=' + roleOf(element) : '',
    normalize(nameOf(element)).slice(0, 120),
  ].filter(Boolean).join(' ');
  if (action === 'fill') {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      const prototype = element instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : HTMLTextAreaElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      setter?.call(element, nextValue);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.focus();
      return { ok: true, descriptor, value: element.value };
    }
    if (element instanceof HTMLElement && element.isContentEditable) {
      element.textContent = nextValue;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.focus();
      return { ok: true, descriptor, value: element.textContent || '' };
    }
    return { ok: false, reason: 'Target element is not fillable.' };
  }
  return {
    ok: true,
    descriptor,
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
})()
  `.trim();
}

function buildPageSummaryExpression(maxTextLength: number, maxInteractives: number) {
  return `
(() => {
  const normalize = (value) => (value ?? '').replace(/\\s+/g, ' ').trim();
  const isVisible = (element) => {
    if (!(element instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(element);
    if (style.visibility === 'hidden' || style.display === 'none') return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const text = normalize(document.body?.innerText || '').slice(0, ${maxTextLength});
  const interactives = Array.from(
    document.querySelectorAll('a, button, input, textarea, select, [role="button"], [role="link"], [role="textbox"]'),
  )
    .filter(isVisible)
    .slice(0, ${maxInteractives})
    .map((element) => ({
      tag: element.tagName.toLowerCase(),
      role: element.getAttribute('role') || '',
      text: normalize(
        element.getAttribute('aria-label') ||
          element.getAttribute('placeholder') ||
          element.getAttribute('title') ||
          element.textContent ||
          '',
      ).slice(0, 120),
    }));
  return {
    title: document.title || '',
    url: window.location.href,
    readyState: document.readyState,
    textExcerpt: text,
    interactives,
  };
})()
  `.trim();
}

class BrowserSession {
  readonly sessionId: string;
  readonly browserName: string;
  readonly executablePath: string;
  readonly debuggerPort: number;
  readonly headless: boolean;
  readonly viewport: { width: number; height: number };
  readonly startedAt: string;
  private updatedAt: string;
  private currentUrl = 'about:blank';
  private title = '';
  private state: 'ready' | 'closed' | 'error' = 'ready';
  private readonly userDataDir: string;
  private readonly process: ChildProcess;
  private readonly ws: WebSocketType;
  private nextId = 0;
  private readonly pending = new Map<
    number,
    {
      resolve: (value: Record<string, unknown>) => void;
      reject: (reason?: unknown) => void;
    }
  >();

  private constructor(args: {
    sessionId: string;
    browserName: string;
    executablePath: string;
    debuggerPort: number;
    headless: boolean;
    viewport: { width: number; height: number };
    userDataDir: string;
    process: ChildProcess;
    ws: WebSocketType;
  }) {
    this.sessionId = args.sessionId;
    this.browserName = args.browserName;
    this.executablePath = args.executablePath;
    this.debuggerPort = args.debuggerPort;
    this.headless = args.headless;
    this.viewport = args.viewport;
    this.userDataDir = args.userDataDir;
    this.process = args.process;
    this.ws = args.ws;
    this.startedAt = nowIso();
    this.updatedAt = this.startedAt;

    this.ws.on('message', (payload) => {
      const raw = typeof payload === 'string' ? payload : payload.toString();
      let parsed: CdpResponse;
      try {
        parsed = JSON.parse(raw) as CdpResponse;
      } catch {
        return;
      }

      if (typeof parsed.id === 'number') {
        const pending = this.pending.get(parsed.id);
        if (!pending) return;
        this.pending.delete(parsed.id);
        if (parsed.error?.message) {
          pending.reject(new Error(parsed.error.message));
          return;
        }
        pending.resolve(parsed.result ?? {});
        return;
      }

      if (parsed.method === 'Page.frameNavigated') {
        const frame = parsed.params?.frame as { url?: string } | undefined;
        if (typeof frame?.url === 'string' && frame.url.trim()) {
          this.currentUrl = frame.url;
        }
      }
    });

    this.ws.on('close', () => {
      this.state = 'closed';
    });

    this.process.once('close', () => {
      this.state = this.state === 'closed' ? 'closed' : 'error';
    });
  }

  static async create(options: BrowserCreateOptions = {}) {
    installCleanupHooks();
    ensureSessionRoot();

    const browser = resolveBrowserExecutable(options.browser ?? 'auto');
    const sessionId = `browser-${randomUUID()}`;
    const debuggerPort = await findFreePort();
    const userDataDir = path.join(BROWSER_SESSION_ROOT, sessionId);
    mkdirSync(userDataDir, { recursive: true });
    const viewport = {
      width: Math.max(320, options.width ?? DEFAULT_VIEWPORT.width),
      height: Math.max(320, options.height ?? DEFAULT_VIEWPORT.height),
    };
    const headless = options.headless ?? true;
    const args = [
      `--remote-debugging-port=${debuggerPort}`,
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-default-apps',
      '--disable-dev-shm-usage',
      '--disable-popup-blocking',
      '--disable-renderer-backgrounding',
      '--disable-sync',
      '--metrics-recording-only',
      '--mute-audio',
      '--new-window',
      `--window-size=${viewport.width},${viewport.height}`,
      ...(headless ? ['--headless=new', '--hide-scrollbars'] : []),
      'about:blank',
    ];

    const processHandle = spawn(browser.executablePath, args, {
      stdio: 'ignore',
      detached: false,
    });

    const timeoutMs = options.timeoutMs ?? DEFAULT_BROWSER_TIMEOUT_MS;
    const target = await poll<
      { webSocketDebuggerUrl: string } | null
    >(
      async () => {
        try {
          const targets = await fetchJson<
            Array<{ type?: string; webSocketDebuggerUrl?: string }>
          >(`http://127.0.0.1:${debuggerPort}/json/list`, 1500);
          const pageTarget = targets.find(
            (entry) =>
              entry.type === 'page' &&
              typeof entry.webSocketDebuggerUrl === 'string',
          );
          return pageTarget?.webSocketDebuggerUrl
            ? { webSocketDebuggerUrl: pageTarget.webSocketDebuggerUrl }
            : null;
        } catch {
          return null;
        }
      },
      timeoutMs,
    );

    const ws = await new Promise<WebSocketType>((resolve, reject) => {
      const socket = new WebSocket(target.webSocketDebuggerUrl);
      const onError = (error: Error) => {
        reject(error);
      };
      socket.once('open', () => {
        socket.off('error', onError);
        resolve(socket);
      });
      socket.once('error', onError);
    });

    const session = new BrowserSession({
      sessionId,
      browserName: browser.browserName,
      executablePath: browser.executablePath,
      debuggerPort,
      headless,
      viewport,
      userDataDir,
      process: processHandle,
      ws,
    });

    await session.initialize();
    sessions.set(sessionId, session);
    pruneSessions(sessionId);
    return session;
  }

  async initialize() {
    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await this.send('DOM.enable');
    await this.send('Emulation.setDeviceMetricsOverride', {
      width: this.viewport.width,
      height: this.viewport.height,
      deviceScaleFactor: 1,
      mobile: false,
    });
  }

  touch() {
    this.updatedAt = nowIso();
  }

  getSummary(): BrowserSessionSummary {
    return {
      sessionId: this.sessionId,
      browserName: this.browserName,
      executablePath: this.executablePath,
      debuggerPort: this.debuggerPort,
      pid: this.process.pid ?? undefined,
      headless: this.headless,
      viewport: { ...this.viewport },
      startedAt: this.startedAt,
      updatedAt: this.updatedAt,
      currentUrl: this.currentUrl,
      title: this.title,
      state: this.state,
    };
  }

  isExpired() {
    return Date.now() - new Date(this.updatedAt).getTime() > IDLE_SESSION_TTL_MS;
  }

  async send(method: string, params?: Record<string, unknown>) {
    if (this.state === 'closed') {
      throw new Error(`Browser session ${this.sessionId} is closed.`);
    }
    const id = ++this.nextId;
    this.touch();
    return await new Promise<Record<string, unknown>>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate<T>(expression: string) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    const exception = result.exceptionDetails as
      | { text?: string }
      | undefined;
    if (exception?.text) {
      throw new Error(exception.text);
    }
    const payload = result.result as { value?: T } | undefined;
    return payload?.value as T;
  }

  async waitForReadyState(
    waitUntil: BrowserWaitUntil,
    timeoutMs = DEFAULT_BROWSER_TIMEOUT_MS,
  ) {
    const matcher =
      waitUntil === 'load'
        ? (value: string) => value === 'complete'
        : waitUntil === 'domcontentloaded'
          ? (value: string) => value === 'interactive' || value === 'complete'
          : (value: string) =>
              value === 'interactive' || value === 'complete';

    await poll(
      async () => {
        try {
          const readyState = await this.evaluate<string>('document.readyState');
          return matcher(readyState) ? readyState : null;
        } catch {
          return null;
        }
      },
      timeoutMs,
    );
  }

  async navigate(
    url: string,
    waitUntil: BrowserWaitUntil = 'load',
    timeoutMs = DEFAULT_BROWSER_TIMEOUT_MS,
  ) {
    await this.send('Page.navigate', { url });
    await this.waitForReadyState(waitUntil, timeoutMs);
    const summary = await this.getPageSummary({
      includeScreenshot: false,
      maxTextLength: 2500,
      maxInteractives: 12,
    });
    this.currentUrl = summary.url;
    this.title = summary.title;
    this.touch();
    return summary;
  }

  async click(
    target: BrowserTarget,
    options: {
      timeoutMs?: number;
      waitAfterMs?: number;
    } = {},
  ) {
    const resolution = await this.evaluate<TargetResolution>(
      buildResolveTargetExpression(target, 'point'),
    );
    if (!resolution?.ok || typeof resolution.x !== 'number' || typeof resolution.y !== 'number') {
      throw new Error(resolution?.reason || 'Failed to resolve click target.');
    }

    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: resolution.x,
      y: resolution.y,
      button: 'none',
    });
    await this.send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: resolution.x,
      y: resolution.y,
      button: 'left',
      clickCount: 1,
    });
    await this.send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: resolution.x,
      y: resolution.y,
      button: 'left',
      clickCount: 1,
    });

    if ((options.waitAfterMs ?? 500) > 0) {
      await delay(options.waitAfterMs ?? 500);
    }

    const summary = await this.getPageSummary({
      includeScreenshot: false,
      maxTextLength: 2000,
      maxInteractives: 12,
    });
    this.currentUrl = summary.url;
    this.title = summary.title;
    return {
      descriptor: resolution.descriptor ?? 'target',
      summary,
    };
  }

  async type(
    target: BrowserTarget,
    text: string,
    options: {
      pressEnter?: boolean;
      waitAfterMs?: number;
    } = {},
  ) {
    const resolution = await this.evaluate<TargetResolution>(
      buildResolveTargetExpression(target, 'fill', text),
    );
    if (!resolution?.ok) {
      throw new Error(resolution?.reason || 'Failed to resolve fill target.');
    }

    if (options.pressEnter) {
      await this.send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'Enter',
        code: 'Enter',
        windowsVirtualKeyCode: 13,
        nativeVirtualKeyCode: 13,
      });
      await this.send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'Enter',
        code: 'Enter',
        windowsVirtualKeyCode: 13,
        nativeVirtualKeyCode: 13,
      });
    }

    if ((options.waitAfterMs ?? 350) > 0) {
      await delay(options.waitAfterMs ?? 350);
    }

    const summary = await this.getPageSummary({
      includeScreenshot: false,
      maxTextLength: 1800,
      maxInteractives: 12,
    });
    this.currentUrl = summary.url;
    this.title = summary.title;

    return {
      descriptor: resolution.descriptor ?? 'target',
      value: resolution.value ?? text,
      summary,
    };
  }

  async waitFor(conditions: WaitForConditions) {
    const timeoutMs = conditions.timeoutMs ?? DEFAULT_BROWSER_TIMEOUT_MS;
    const pollIntervalMs = conditions.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

    const result = await poll<PageSummary | null>(
      async () => {
        try {
          const summary = await this.getPageSummary({
            includeScreenshot: false,
            maxTextLength: 1200,
            maxInteractives: 8,
          });
          const matchesText = conditions.text
            ? summary.textExcerpt.toLowerCase().includes(conditions.text.toLowerCase())
            : true;
          const matchesUrl = conditions.urlIncludes
            ? summary.url.toLowerCase().includes(conditions.urlIncludes.toLowerCase())
            : true;
          const matchesTitle = conditions.titleIncludes
            ? summary.title.toLowerCase().includes(conditions.titleIncludes.toLowerCase())
            : true;
          const matchesTarget = conditions.target
            ? Boolean(
                await this.evaluate<TargetResolution>(
                  buildResolveTargetExpression(conditions.target, 'point'),
                ).then((value) => value?.ok),
              )
            : true;

          return matchesText && matchesUrl && matchesTitle && matchesTarget
            ? summary
            : null;
        } catch {
          return null;
        }
      },
      timeoutMs,
      pollIntervalMs,
    );

    this.currentUrl = result.url;
    this.title = result.title;
    return result;
  }

  async getPageSummary(options: PageSummaryOptions = {}) {
    const maxTextLength = Math.max(200, options.maxTextLength ?? 2200);
    const maxInteractives = Math.max(1, options.maxInteractives ?? 12);
    const summary = await this.evaluate<Omit<PageSummary, 'screenshotDataUrl'>>(
      buildPageSummaryExpression(maxTextLength, maxInteractives),
    );

    let screenshotDataUrl: string | undefined;
    if (options.includeScreenshot) {
      const capture = await this.send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: options.fullPage ?? false,
      });
      const data = capture.data;
      if (typeof data === 'string' && data.length > 0) {
        screenshotDataUrl = `data:image/png;base64,${data}`;
      }
    }

    this.currentUrl = summary.url;
    this.title = summary.title;
    this.touch();

    return {
      ...summary,
      screenshotDataUrl,
    };
  }

  async close() {
    if (this.state === 'closed') {
      sessions.delete(this.sessionId);
      return;
    }

    this.state = 'closed';
    sessions.delete(this.sessionId);
    for (const pending of this.pending.values()) {
      pending.reject(new Error(`Browser session ${this.sessionId} closed.`));
    }
    this.pending.clear();

    try {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close();
      }
    } catch {
      // noop
    }

    try {
      if (this.process.pid) {
        this.process.kill('SIGTERM');
      }
    } catch {
      // noop
    }

    try {
      rmSync(this.userDataDir, { recursive: true, force: true });
    } catch {
      // noop
    }
  }
}

function pruneSessions(exemptSessionId?: string) {
  for (const session of sessions.values()) {
    if (session.sessionId === exemptSessionId) continue;
    if (session.isExpired()) {
      void session.close();
    }
  }

  const active = Array.from(sessions.values())
    .filter((session) => session.getSummary().state === 'ready')
    .sort(
      (left, right) =>
        new Date(left.getSummary().updatedAt).getTime() -
        new Date(right.getSummary().updatedAt).getTime(),
    );

  while (active.length > MAX_ACTIVE_BROWSER_SESSIONS - 1) {
    const oldest = active.shift();
    if (!oldest || oldest.sessionId === exemptSessionId) continue;
    void oldest.close();
  }
}

export async function createBrowserSession(options: BrowserCreateOptions = {}) {
  return await BrowserSession.create(options);
}

export function getBrowserSession(sessionId: string) {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error(
      `Browser session "${sessionId}" was not found. Use browser_open to create a new session first.`,
    );
  }
  if (session.getSummary().state !== 'ready') {
    throw new Error(
      `Browser session "${sessionId}" is no longer active. Use browser_open to create a new session.`,
    );
  }
  session.touch();
  return session;
}

export function listBrowserSessions() {
  pruneSessions();
  return Array.from(sessions.values()).map((session) => session.getSummary());
}

export async function closeBrowserSession(sessionId: string) {
  const session = sessions.get(sessionId);
  if (!session) {
    return false;
  }
  await session.close();
  return true;
}

export function formatBrowserSummary(summary: PageSummary) {
  const interactives =
    summary.interactives.length > 0
      ? summary.interactives
          .map((item, index) => {
            const parts = [item.tag, item.role, item.text]
              .filter(Boolean)
              .join(' | ');
            return `${index + 1}. ${parts}`;
          })
          .join('\n')
      : 'No obvious interactive elements captured.';

  return [
    `Title: ${summary.title || '(untitled page)'}`,
    `URL: ${summary.url}`,
    `Ready state: ${summary.readyState}`,
    '',
    'Visible text excerpt:',
    summary.textExcerpt || '(no visible text excerpt captured)',
    '',
    'Interactive elements:',
    interactives,
  ].join('\n');
}
