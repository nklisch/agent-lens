import { spawn } from "node:child_process";

/**
 * Check if cargo is available. Used with vitest's describe.skipIf.
 */
export async function isCargoAvailable(): Promise<boolean> {
	return new Promise((resolve) => {
		const proc = spawn("cargo", ["--version"], { stdio: "pipe" });
		proc.on("close", (code) => resolve(code === 0));
		proc.on("error", () => resolve(false));
	});
}

/**
 * Whether cargo is available for the current test run.
 */
export const SKIP_NO_CARGO: boolean = await isCargoAvailable().then((ok) => !ok);
