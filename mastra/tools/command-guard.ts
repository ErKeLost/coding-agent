/**
 * Command Guard — Codex-style execution policy for runCommand.
 *
 * Three decisions (mirroring Codex execpolicy):
 *  - "allow"    : proceed without restriction
 *  - "warn"     : allow but annotate; agent should surface reason to user
 *  - "forbidden": block outright; tool returns error instead of executing
 *
 * Rules are matched by command prefix (first token = program name, then args).
 * A rule matches when every token in its prefix matches the actual command.
 * "*" is a wildcard that matches any single token.
 * More-specific rules (longer prefix) take priority over shorter ones.
 */

export type Decision = "allow" | "warn" | "forbidden";

export interface GuardRule {
  /** Program name (first token). */
  program: string;
  /** Remaining argument prefix tokens. "*" matches any single token. */
  args?: string[];
  decision: Decision;
  /** Human-readable reason surfaced in error / warning messages. */
  reason: string;
}

export interface GuardResult {
  decision: Decision;
  reason: string;
  matchedRule: string;
}

// ---------------------------------------------------------------------------
// Default rule table — ordered from most-specific to least-specific.
// ---------------------------------------------------------------------------
const DEFAULT_RULES: GuardRule[] = [
  // ── Absolutely forbidden ────────────────────────────────────────────────
  { program: "rm",      args: ["-rf", "/"],           decision: "forbidden", reason: "Deleting the filesystem root is forbidden." },
  { program: "rm",      args: ["-rf", "/*"],          decision: "forbidden", reason: "Mass-delete of filesystem root is forbidden." },
  { program: "rm",      args: ["-r",  "/"],           decision: "forbidden", reason: "Recursive delete of / is forbidden." },
  { program: "rm",      args: ["--no-preserve-root"], decision: "forbidden", reason: "--no-preserve-root flag is forbidden." },
  { program: "dd",      args: ["of=/dev/"],           decision: "forbidden", reason: "Writing directly to block devices is forbidden." },
  { program: "mkfs",                                  decision: "forbidden", reason: "Formatting block devices is forbidden." },
  { program: "mkfs.ext4",                             decision: "forbidden", reason: "Formatting block devices is forbidden." },
  { program: "mkfs.vfat",                             decision: "forbidden", reason: "Formatting block devices is forbidden." },
  { program: "fdisk",                                 decision: "forbidden", reason: "Partitioning disks is forbidden." },
  { program: "parted",                                decision: "forbidden", reason: "Partitioning disks is forbidden." },
  { program: "shred",   args: ["-u"],                 decision: "forbidden", reason: "Secure-erasing files is forbidden." },
  { program: "wipefs",                                decision: "forbidden", reason: "Wiping filesystem signatures is forbidden." },
  { program: "cryptsetup",                            decision: "forbidden", reason: "Disk encryption operations are forbidden." },
  { program: ":(){:|:&};:", decision: "forbidden",    reason: "Fork bomb is forbidden." },

  // ── Credentials / secrets ───────────────────────────────────────────────
  { program: "cat",   args: ["/etc/passwd"],  decision: "forbidden", reason: "Reading /etc/passwd is forbidden." },
  { program: "cat",   args: ["/etc/shadow"],  decision: "forbidden", reason: "Reading /etc/shadow is forbidden." },
  { program: "cat",   args: ["*/.ssh/*"],     decision: "warn",      reason: "Reading SSH keys — confirm this is intentional." },
  { program: "cp",    args: ["*/.ssh/*"],     decision: "warn",      reason: "Copying SSH keys — confirm this is intentional." },
  { program: "curl",  args: ["-o", "*/.ssh/*"], decision: "forbidden", reason: "Writing to ~/.ssh via curl is forbidden." },

  // ── Force / destructive git ──────────────────────────────────────────────
  { program: "git", args: ["push", "--force"],          decision: "warn", reason: "Force-pushing rewrites remote history. Confirm intent." },
  { program: "git", args: ["push", "-f"],               decision: "warn", reason: "Force-pushing rewrites remote history. Confirm intent." },
  { program: "git", args: ["reset", "--hard"],          decision: "warn", reason: "Hard reset discards uncommitted work. Confirm intent." },
  { program: "git", args: ["clean", "-fd"],             decision: "warn", reason: "git clean removes untracked files. Confirm intent." },
  { program: "git", args: ["clean", "-fxd"],            decision: "warn", reason: "git clean -fxd removes untracked + ignored files. Confirm intent." },

  // ── Risky system commands ────────────────────────────────────────────────
  { program: "chmod", args: ["777"],        decision: "warn",      reason: "chmod 777 makes files world-writable. Use with care." },
  { program: "chown", args: ["root"],       decision: "warn",      reason: "Changing ownership to root. Confirm intent." },
  { program: "sudo",                        decision: "warn",      reason: "Running with elevated privileges. Confirm intent." },
  { program: "su",                          decision: "warn",      reason: "Switching user. Confirm intent." },
  { program: "visudo",                      decision: "forbidden", reason: "Editing sudoers is forbidden." },
  { program: "pkill",  args: ["-9"],        decision: "warn",      reason: "Force-killing processes. Confirm intent." },
  { program: "kill",   args: ["-9"],        decision: "warn",      reason: "SIGKILL signal. Confirm intent." },
  { program: "killall",                     decision: "warn",      reason: "Killing all matching processes. Confirm intent." },

  // ── Network exfiltration risks ───────────────────────────────────────────
  { program: "curl",  args: ["*", "|", "bash"], decision: "forbidden", reason: "Piping curl to bash is forbidden (remote code execution risk)." },
  { program: "wget",  args: ["*", "-O", "-"],   decision: "warn",      reason: "Piping wget to stdout. Review the URL before proceeding." },

  // ── Package manager destructive ops ─────────────────────────────────────
  { program: "npm",  args: ["publish"],      decision: "warn", reason: "Publishing to npm registry. Confirm intent." },
  { program: "pnpm", args: ["publish"],      decision: "warn", reason: "Publishing to npm registry. Confirm intent." },
  { program: "yarn", args: ["publish"],      decision: "warn", reason: "Publishing to npm registry. Confirm intent." },
  { program: "bun",  args: ["publish"],      decision: "warn", reason: "Publishing to npm registry. Confirm intent." },
  { program: "cargo", args: ["publish"],     decision: "warn", reason: "Publishing to crates.io. Confirm intent." },

  // ── Cloud / infra irreversible operations ───────────────────────────────
  { program: "terraform", args: ["destroy"], decision: "warn", reason: "terraform destroy deletes all managed infrastructure. Confirm intent." },
  { program: "aws",  args: ["s3", "rm"],     decision: "warn", reason: "Deleting S3 objects. Confirm intent." },
  { program: "gcloud", args: ["projects", "delete"], decision: "warn", reason: "Deleting a GCP project. Confirm intent." },
];

// ---------------------------------------------------------------------------
// Tokenizer — simple shell-like split (handles quoted args naively)
// ---------------------------------------------------------------------------
export function tokenizeCommand(command: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (ch === "'" && !inDouble) { inSingle = !inSingle; continue; }
    if (ch === '"' && !inSingle) { inDouble = !inDouble; continue; }
    if ((ch === " " || ch === "\t") && !inSingle && !inDouble) {
      if (current) { tokens.push(current); current = ""; }
    } else {
      current += ch;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

// ---------------------------------------------------------------------------
// Matching — supports wildcard "*" and prefix matching on dangerous tokens
// ---------------------------------------------------------------------------
function tokenMatches(pattern: string, token: string): boolean {
  if (pattern === "*") return true;
  // glob-style suffix: "pattern/*" matches any token starting with "pattern/"
  if (pattern.endsWith("/*") || pattern.endsWith("*")) {
    const prefix = pattern.replace(/\*$/, "");
    return token.startsWith(prefix);
  }
  return pattern === token;
}

function ruleMatches(rule: GuardRule, tokens: string[]): boolean {
  if (!tokens.length) return false;
  // Match program (basename in case full path is given)
  const prog = tokens[0];
  const progBase = prog.includes("/") ? prog.split("/").at(-1)! : prog;
  if (progBase !== rule.program && prog !== rule.program) return false;

  const argPatterns = rule.args ?? [];
  // Check if all pattern args appear as a subsequence in actual args
  // (not requiring contiguous match — handles flags in any order for simple cases)
  // For prefix-style rules (ordered), try contiguous match first
  if (argPatterns.length === 0) return true;
  const actualArgs = tokens.slice(1);
  // Contiguous prefix match
  if (actualArgs.length >= argPatterns.length) {
    const matches = argPatterns.every((pat, i) => tokenMatches(pat, actualArgs[i]));
    if (matches) return true;
  }
  // Loose match: each pattern token must appear somewhere in actual args
  return argPatterns.every(pat =>
    pat === "*" || actualArgs.some(tok => tokenMatches(pat, tok))
  );
}

// ---------------------------------------------------------------------------
// Main guard function
// ---------------------------------------------------------------------------
export function checkCommand(
  command: string,
  extraRules: GuardRule[] = [],
): GuardResult {
  const tokens = tokenizeCommand(command);
  if (!tokens.length) {
    return { decision: "allow", reason: "", matchedRule: "(empty)" };
  }

  const allRules = [...extraRules, ...DEFAULT_RULES];

  // Find the most specific (longest prefix) matching rule
  let bestMatch: { rule: GuardRule; score: number } | null = null;
  for (const rule of allRules) {
    if (ruleMatches(rule, tokens)) {
      const score = (rule.args?.length ?? 0) + 1;
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { rule, score };
      }
    }
  }

  if (!bestMatch) {
    return { decision: "allow", reason: "", matchedRule: "(no match)" };
  }

  const ruleLabel = `${bestMatch.rule.program}${bestMatch.rule.args ? " " + bestMatch.rule.args.join(" ") : ""}`;
  return {
    decision: bestMatch.rule.decision,
    reason: bestMatch.rule.reason,
    matchedRule: ruleLabel,
  };
}
