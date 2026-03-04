import { spawn } from "node:child_process";

/**
 * Check if javac (JDK 17+) is available. Used with vitest's describe.skipIf.
 */
export async function isJavacAvailable(): Promise<boolean> {
	return new Promise((resolve) => {
		const proc = spawn("javac", ["-version"], { stdio: "pipe" });
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
			// Require javac 17+
			const match = output.match(/javac (\d+)/);
			if (!match) {
				resolve(false);
				return;
			}
			resolve(parseInt(match[1], 10) >= 17);
		});
		proc.on("error", () => resolve(false));
	});
}

/**
 * Whether javac 17+ is available for the current test run.
 */
export const SKIP_NO_JAVAC: boolean = await isJavacAvailable().then((ok) => !ok);
