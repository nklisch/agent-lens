import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

export interface SpawnResult {
	exitCode: number | null;
	stdout: string;
	stderr: string;
}

export interface SpawnOptions {
	cwd?: string;
	env?: Record<string, string>;
	timeoutMs?: number;
	/** Called for each line of stdout as it arrives. */
	onStdoutLine?: (line: string) => void;
	/** If true, strip test framework env vars (VITEST, NODE_ENV=test, etc.) */
	cleanEnv?: boolean;
}

/** Strip env vars injected by test frameworks that can interfere with external binaries. */
function buildCleanEnv(extra?: Record<string, string>): Record<string, string> {
	const env = { ...process.env } as Record<string, string>;
	// Remove test framework vars that leak into spawned processes
	const strip = ["VITEST", "VITEST_WORKER_ID", "VITEST_POOL_ID", "JEST_WORKER_ID"];
	for (const key of strip) {
		delete env[key];
	}
	if (env.NODE_ENV === "test") {
		delete env.NODE_ENV;
	}
	return { ...env, ...(extra ?? {}) };
}

/**
 * Spawn a process and capture stdout/stderr.
 * Uses node:child_process (vitest runs under Node, not Bun).
 */
export function spawnCapture(command: string, args: string[], options?: SpawnOptions): Promise<SpawnResult & { timedOut: boolean }> {
	return new Promise((resolve) => {
		const env = options?.cleanEnv ? buildCleanEnv(options?.env) : { ...process.env, ...(options?.env ?? {}) };
		const proc = spawn(command, args, {
			cwd: options?.cwd,
			env,
			stdio: ["ignore", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";
		let killed = false;

		if (options?.onStdoutLine) {
			const rl = createInterface({ input: proc.stdout });
			rl.on("line", (line) => {
				stdout += `${line}\n`;
				options.onStdoutLine?.(line);
			});
		} else {
			proc.stdout.on("data", (chunk: Buffer) => {
				stdout += chunk.toString();
			});
		}

		proc.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString();
		});

		const timer = options?.timeoutMs
			? setTimeout(() => {
					killed = true;
					proc.kill("SIGTERM");
					setTimeout(() => proc.kill("SIGKILL"), 5000);
				}, options.timeoutMs)
			: null;

		proc.on("close", (code) => {
			if (timer) clearTimeout(timer);
			resolve({ exitCode: killed ? null : code, stdout, stderr, timedOut: killed });
		});

		proc.on("error", (err) => {
			if (timer) clearTimeout(timer);
			resolve({ exitCode: null, stdout, stderr: stderr + err.message, timedOut: false });
		});
	});
}
