/**
 * Next.js runs this once when a server instance boots. We use it to start the
 * in-process BullMQ worker so the app stays a single process/container.
 * Guarded to the Node runtime, and non-fatal if Redis isn't up yet.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { startCleanupWorker } = await import("./lib/worker");
    startCleanupWorker();
    console.log("[cleanup] worker started");
  } catch (err) {
    console.error(
      "[cleanup] worker failed to start:",
      (err as Error).message,
      "— is Redis running? (REDIS_URL)",
    );
  }
}
