import { spawn } from "node:child_process";

/**
 * Check if GDB 14+ is available. Used with vitest's describe.skipIf.
 */
export async function isGdbAvailable(): Promise<boolean> {
	return new Promise((resolve) => {
		const proc = spawn("gdb", ["--version"], { stdio: "pipe" });
		let output = "";
		proc.stdout?.on("data", (d: Buffer) => {
			output += d.toString();
		});
		proc.stderr?.on("data", (d: Buffer) => {
			output += d.toString();
		});
		proc.on("close", (code) => {
			if (code !== 0) {
				resolve(false);
				return;
			}
			const match = output.match(/GNU gdb[^\d]*(\d+)\./);
			if (!match) {
				resolve(false);
				return;
			}
			resolve(parseInt(match[1], 10) >= 14);
		});
		proc.on("error", () => resolve(false));
	});
}

/**
 * Whether GDB 14+ is available for the current test run.
 */
export const SKIP_NO_GDB: boolean = await isGdbAvailable().then((ok) => !ok);
