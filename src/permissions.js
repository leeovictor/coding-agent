import { resolve, sep } from "node:path";

export const BASH_ALLOWLIST = [
  "ls", "pwd", "cat", "head", "tail", "wc", "grep", "rg", "find",
  "which", "whereis", "echo", "printf", "tree", "file", "stat", "du", "df",
  "date", "whoami", "uname", "hostname", "printenv", "history", "jobs", "ps",
  "git status", "git log", "git diff", "git show", "git blame",
  "git ls-files", "git rev-parse", "git reflog", "git describe",
  "git symbolic-ref", "git config --get", "git stash list", "git remote -v",
  "node --version", "node -v",
  "npm list", "npm ls", "npm --version", "npm view",
  "npx --version", "python --version", "python3 --version",
  "git --version",
];

const SEGMENT_SEP = /\s*(?:&&|\|\||&|\||;)\s*/;
const DANGEROUS_PATTERNS = /(?:[<>]|`|\$\(|-exec\b|-execdir\b|-ok\b|-okdir\b)/;

function segmentAllowed(segment) {
  const tokens = segment.trim().split(/\s+/);
  for (let len = Math.min(tokens.length, 3); len >= 1; len--) {
    const prefix = tokens.slice(0, len).join(" ");
    if (BASH_ALLOWLIST.includes(prefix)) return true;
  }
  return false;
}

export function isBashAllowed(command) {
  if (!command || typeof command !== "string") return false;
  if (DANGEROUS_PATTERNS.test(command)) return false;
  const segments = command.split(SEGMENT_SEP).filter(Boolean);
  return segments.length > 0 && segments.every(segmentAllowed);
}

export function isPathWithinCwd(target) {
  if (!target || typeof target !== "string") return false;
  const cwd = process.cwd();
  const resolved = resolve(cwd, target);
  return resolved === cwd || resolved.startsWith(cwd + sep);
}
