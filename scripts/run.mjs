import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { backendDir, frontendDir, backendEnvironment } from "./environment.mjs";

const mode = process.argv[2] === "start" ? "production" : "development";
const env = backendEnvironment(mode);
if (process.argv.includes('--local-login')) {
  if (mode !== 'development') throw new Error('Local developer login is unavailable in production.');
  env.NOURISH_DEV_LOGIN = 'true';
}
if (!fs.existsSync(path.join(backendDir, "dist/index.js")) || !fs.existsSync(path.join(frontendDir, "dist/index.html"))) {
  throw new Error("Run ./setup.sh and npm run build before starting MealLine.");
}
let child;
let stopping = false;
function launch() {
  child = spawn(process.execPath, [path.join(backendDir, "dist/index.js")], { cwd: backendDir, env, stdio: "inherit" });
  child.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
  child.on("exit", (code) => {
    // FEED deliberately exits with 75 after an atomic restore/reset. Restart
    // against the swapped database so the existing recovery feature works
    // without Docker or a separate process supervisor.
    if (code === 75 && !stopping) launch();
    else process.exitCode = code ?? 0;
  });
}
launch();
process.on("SIGINT", () => { stopping = true; child.kill("SIGINT"); });
process.on("SIGTERM", () => { stopping = true; child.kill("SIGTERM"); });
console.log(`MealLine workspace: http://localhost:${env.PORT}/feed`);
if (env.NOURISH_DEV_LOGIN === 'true') console.log('Local developer sign-in enabled. Do not expose or tunnel this development server.');
