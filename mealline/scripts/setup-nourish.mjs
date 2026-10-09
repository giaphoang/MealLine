/** Reuse MealLine's local service token without printing or rotating it. */
import { chmodSync, existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { spawnSync } from "node:child_process";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function readEnv(path) {
  return existsSync(path) ? parseEnv(readFileSync(path, "utf8")) : {};
}

async function setup() {
  const nourishRoot = resolve(process.argv[2] || join(appRoot, ".."));
  const appPath = join(appRoot, ".env");
  if (!existsSync(appPath)) throw new Error("MealLine environment is missing");
  const app = readEnv(appPath);
  // Match MealLine's .env.local-before-.env precedence and runtime fallback.
  const config = { ...readEnv(join(nourishRoot, ".env")), ...readEnv(join(nourishRoot, ".env.local")) };
  const statePath = join(nourishRoot, ".nourish", "runtime.json");
  const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : {};
  const token = process.env.NOURISH_VOICE_API_TOKEN || config.NOURISH_VOICE_API_TOKEN || state.voiceToken;
  if (typeof token !== "string" || !token || /[\r\n]/.test(token)) {
    throw new Error("MealLine service token is missing or invalid");
  }
  const base = new URL(app.NOURISH_API_URL || `http://127.0.0.1:${process.env.NOURISH_PORT || config.NOURISH_PORT || "3003"}`);
  if (base.protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)
    || base.username || base.password || base.pathname !== "/" || base.search || base.hash) {
    throw new Error("This setup command only connects the local MealLine server");
  }
  // The empty body always fails schema validation: verify auth without an intake.
  const response = await fetch(base.origin + "/api/voice-intakes", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-nourish-voice-token": token },
    body: "{}", redirect: "error", signal: AbortSignal.timeout(5000),
  });
  await response.body?.cancel();
  if (response.status !== 400) throw new Error("MealLine service authentication did not validate");

  const before = readFileSync(appPath, "utf8").replace(/\r\n/g, "\n").trimEnd();
  const lines = before.split("\n");
  for (const [name, value] of Object.entries({ NOURISH_API_URL: base.origin, NOURISH_VOICE_API_TOKEN: token })) {
    const pattern = new RegExp("^\\s*(?:export\\s+)?" + name + "\\s*=");
    const matches = lines.map((line, index) => pattern.test(line) ? index : -1).filter(index => index >= 0);
    if (matches.length > 1) throw new Error("Duplicate MealLine environment keys need review");
    const replacement = name + "=" + JSON.stringify(value);
    if (matches.length) lines[matches[0]] = replacement;
    else lines.push(replacement);
  }
  if (lines.join("\n") !== before) {
    const patch = `*** Begin Patch\n*** Update File: ${appPath}\n@@\n${before.split("\n").map(line => "-" + line).join("\n")}\n${lines.map(line => "+" + line).join("\n")}\n*** End Patch\n`;
    // Capture patch output privately: it contains credentials, never log it.
    const result = spawnSync("apply_patch", { input: patch, encoding: "utf8", stdio: "pipe" });
    if (result.status !== 0) throw new Error("Private environment update failed");
  }
  chmodSync(appPath, 0o600);
  console.log("MealLine staff-workspace authentication verified and configured privately. Restart the phone app to load it; no intake was created.");
}

setup().catch(() => {
  console.error("MealLine setup did not complete. Check the local MealLine path, server, and private service-token configuration. No secrets are logged.");
  process.exitCode = 1;
});
