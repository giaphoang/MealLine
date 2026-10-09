import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import dotenv from "dotenv";
import { installedBrowser, browserHeadlessMode } from './browser.mjs';

export const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const backendDir = path.join(rootDir, "vendor/feed/packages/backend");
export const frontendDir = path.join(rootDir, "vendor/feed/packages/frontend");
export const stateDir = path.join(rootDir, ".nourish");
export const stateFile = path.join(stateDir, "runtime.json");
dotenv.config({ path: [path.join(rootDir, ".env.local"), path.join(rootDir, ".env")], quiet: true });

export function readState() {
  return fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, "utf8")) : {};
}

export function saveState(state) {
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  // npm or build artifacts can create this directory before runtime setup.
  // mkdir's mode does not protect an already-existing directory.
  fs.chmodSync(stateDir, 0o700);
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + "\n", { mode: 0o600 });
  fs.chmodSync(stateFile, 0o600);
}

export function ensureState() {
  const state = readState();
  state.jwtSecret ??= randomBytes(48).toString("hex");
  state.internalToken ??= randomBytes(48).toString("hex");
  state.voiceToken ??= randomBytes(48).toString("hex");
  state.agentToken ??= randomBytes(48).toString("hex");
  saveState(state);
  return state;
}

export function backendEnvironment(mode = "development", state = readState()) {
  if (!state.jwtSecret || !state.internalToken) throw new Error("Run ./setup.sh to initialize MealLine first.");
  const browser = installedBrowser();
  return {
    ...process.env,
    NODE_ENV: mode,
    DATABASE_URL: process.env.FEED_DATABASE_URL ?? `file:${path.join(stateDir, "feed.db")}`,
    STORAGE_PATH: process.env.FEED_STORAGE_PATH ?? path.join(stateDir, "storage"),
    PORT: process.env.NOURISH_PORT ?? "3003",
    HOST: "127.0.0.1",
    APP_URL: process.env.NOURISH_APP_URL ?? "http://localhost:3003/feed",
    JWT_SECRET: process.env.FEED_JWT_SECRET ?? state.jwtSecret,
    NOURISH_INTERNAL_TOKEN: state.internalToken,
    NOURISH_SOURCE_ARCHIVE: path.join(stateDir, 'source/mealline-source.tar.gz'),
    NOURISH_VOICE_API_TOKEN: process.env.NOURISH_VOICE_API_TOKEN || state.voiceToken,
    NOURISH_AGENT_API_TOKEN: process.env.NOURISH_AGENT_API_TOKEN || state.agentToken,
    NOURISH_CLIENT_PHONE_ENABLED: process.env.NOURISH_CLIENT_PHONE_ENABLED === 'true' ? 'true' : 'false',
    AUTH_ALLOWED_DOMAINS: process.env.STAFF_EMAIL_DOMAINS ?? "",
    FORCE_AUTH: "true",
    NOURISH_DEV_LOGIN: mode === 'development' && process.env.NOURISH_DEV_LOGIN === 'true' ? 'true' : 'false',
    COOKIE_DOMAIN: "",
    PUPPETEER_EXECUTABLE_PATH: browser,
    NOURISH_PDF_BROWSER_MODE: browserHeadlessMode(browser),
  };
}
