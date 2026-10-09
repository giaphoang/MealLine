/**
 * Background worker: claims due outbox jobs with leases, sends approved
 * updates, retries with bounded backoff, and flags overdue follow-ups.
 * Restart-safe: leases expire, pending jobs survive restarts.
 * Usage: npm run worker
 */
import { claimDueJobs, processJob, flagOverdueFollowups } from "../lib/notify";
import { closeDb } from "../lib/db";

const POLL_MS = 15_000;
let stopping = false;

async function tick() {
  try {
    const jobs = await claimDueJobs(10);
    for (const job of jobs) {
      if (stopping) break;
      await processJob(job);
      console.log(`[worker] processed ${job.kind} ${job.job_key} (attempt ${job.attempts + 1})`);
    }
    const overdue = await flagOverdueFollowups();
    if (overdue > 0) console.log(`[worker] flagged ${overdue} overdue unowned follow-up(s)`);
  } catch (e) {
    console.error("[worker] tick error:", e);
  }
}

async function main() {
  console.log("[worker] starting (poll every 15s)...");
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  while (!stopping) {
    await tick();
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

async function shutdown() {
  stopping = true;
  console.log("[worker] shutting down...");
  await closeDb();
  process.exit(0);
}

main().catch((e) => {
  console.error("[worker] fatal:", e);
  process.exit(1);
});
