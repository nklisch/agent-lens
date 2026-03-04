/**
 * Register SIGINT and SIGTERM handlers that call the given cleanup function
 * and then exit cleanly. Use in entry points instead of repeating signal handler boilerplate.
 */
export function setupGracefulShutdown(cleanup: () => Promise<void>): void {
	process.on("SIGINT", async () => {
		await cleanup();
		process.exit(0);
	});
	process.on("SIGTERM", async () => {
		await cleanup();
		process.exit(0);
	});
}
