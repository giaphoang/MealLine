/** Reuse supplied provider keys without printing them or copying browser JWTs. */
import { chmodSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

function read(path) { return existsSync(path) ? parseEnv(readFileSync(path, "utf8")) : {}; }
function patchEnv(path, updates) {
  const exists = existsSync(path);
  const before = exists ? readFileSync(path, "utf8").replace(/\r\n/g, "\n") : "";
  let lines = before.trimEnd().split("\n").filter((line, i) => line || i > 0);
  for (const [name, value] of Object.entries(updates)) {
    if (/[\r\n]/.test(value)) throw new Error("Invalid multiline credential");
    const index = lines.findIndex(line => new RegExp("^(?:export\\s+)?" + name + "\\s*=").test(line));
    const replacement = name + "=" + JSON.stringify(value);
    if (index < 0) lines.push(replacement); else lines[index] = replacement;
  }
  const patch = exists ? `*** Update File: ${path}\n@@\n${before.trimEnd().split("\n").map(line => "-" + line).join("\n")}\n${lines.map(line => "+" + line).join("\n")}\n`
    : `*** Add File: ${path}\n${lines.map(line => "+" + line).join("\n")}\n`;
  const result = spawnSync("apply_patch", { input: "*** Begin Patch\n" + patch + "*** End Patch\n", encoding: "utf8" });
  if (result.status !== 0) throw new Error("Private environment update failed");
  chmodSync(path, 0o600);
}

try {
  const sourcePath = process.argv[2];
  if (!sourcePath) throw new Error("Usage: node scripts/setup-agent.mjs /path/to/existing/provider.env");
  const app = read(".env");
  const previous = read("voice_agent/.env");
  const providers = read(resolve(sourcePath));
  const agent = {};
  for (const name of ["OPENAI_API_KEY", "OPENAI_MODEL", "DEEPGRAM_API_KEY", "DEEPGRAM_MODEL", "CARTESIA_API_KEY", "CARTESIA_MODEL", "CARTESIA_VOICE_ID"]) {
    const value = previous[name] || providers[name];
    if (value) agent[name] = value;
  }
  for (const name of ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"]) agent[name] = app[name] || "";
  const required = ["OPENAI_API_KEY", "DEEPGRAM_API_KEY", "CARTESIA_API_KEY", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"];
  if (required.some(name => !agent[name])) throw new Error("Required voice provider credentials are missing");
  const shared = app.MEALLINE_AGENT_KEY?.length >= 32 ? app.MEALLINE_AGENT_KEY : randomBytes(32).toString("hex");
  patchEnv("voice_agent/.env", { ...agent, MEALLINE_AGENT_KEY: shared, MEALLINE_BASE_URL: "http://127.0.0.1:3000" });
  patchEnv(".env", { MEALLINE_AGENT_KEY: shared, MEALLINE_AGENT_URL: "http://127.0.0.1:7860", MEALLINE_VOICE_TRANSPORT: "pipecat" });
  console.log("MealLine voice adapter configured; private environment files have owner-only permissions. No JWT copied, database reset, or public routing changed.");
} catch {
  console.error("Voice setup did not complete. Check the supplied environment path and required provider credentials; no secrets are logged.");
  process.exitCode = 1;
}
