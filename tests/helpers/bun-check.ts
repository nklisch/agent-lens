import { spawn } from "node:child_process";

/**
 * Check if Bun is available.
 */
export async function isBunAvailable(): Promise<boolean> {
	return new Promise((resolve) => {
		const proc = spawn("bun", ["--version"], { stdio: "pipe" });
		proc.on("close", (code) => resolve(code === 0));
		proc.on("error", () => resolve(false));
	});
}

/**
 * Whether Bun is available for the current test run.
 * Computed once at module load time for use with describe.skipIf.
 */
export const SKIP_NO_BUN: boolean = await isBunAvailable().then((ok) => !ok);
