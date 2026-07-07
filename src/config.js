import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CONFIG_DIR = join(homedir(), ".dux");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

function ensureDir(dirPath) {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true, mode: 0o700 });
  }
}

export function loadConfig(configDir) {
  const configFile = configDir ? join(configDir, "config.json") : CONFIG_FILE;
  try {
    return JSON.parse(readFileSync(configFile, "utf8"));
  } catch {
    return {};
  }
}

export function saveConfig(values, configDir) {
  const dir = configDir || CONFIG_DIR;
  const configFile = configDir ? join(configDir, "config.json") : CONFIG_FILE;
  ensureDir(dir);
  const current = loadConfig(configDir);
  const next = { ...current, ...values };
  writeFileSync(configFile, JSON.stringify(next, null, 2) + "\n", {
    mode: 0o600,
    encoding: "utf8",
  });
}
