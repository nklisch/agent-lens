import { spawn } from "node:child_process";

/**
 * Check if debugpy is available. Used with vitest's describe.skipIf.
 */
export async function isDebugpyAvailable(): Promise<boolean> {
	return new Promise((resolve) => {
		const proc = spawn("python3", ["-m", "debugpy", "--version"], { stdio: "pipe" });
		let _output = "";
		proc.stdout?.on("data", (d: Buffer) => {
			_output += d.toString();
		});
		proc.stderr?.on("data", (d: Buffer) => {
			_output += d.toString();
		});
		proc.on("close", (code) => {
			resolve(code === 0);
		});
		proc.on("error", () => resolve(false));
	});
}

/**
 * Whether debugpy is available for the current test run.
 * Computed once at module load time for use with describe.skipIf.
 */
export const SKIP_NO_DEBUGPY: boolean = await isDebugpyAvailable().then((ok) => !ok);
