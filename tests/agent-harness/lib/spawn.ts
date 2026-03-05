import { spawn } from "node:child_process";

export interface SpawnResult {
	exitCode: number | null;
	stdout: string;
	stderr: string;
}

/**
 * Spawn a process and capture stdout/stderr.
 * Uses node:child_process (vitest runs under Node, not Bun).
 */
export function spawnCapture(command: string, args: string[], options?: { cwd?: string; env?: Record<string, string>; timeoutMs?: number }): Promise<SpawnResult & { timedOut: boolean }> {
	return new Promise((resolve) => {
		const proc = spawn(command, args, {
			cwd: options?.cwd,
			env: { ...process.env, ...(options?.env ?? {}) },
			stdio: "pipe",
		});

		let stdout = "";
		let stderr = "";
		let killed = false;

		proc.stdout.on("data", (chunk: Buffer) => {
			stdout += chunk.toString();
		});
		proc.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString();
		});

		const timer = options?.timeoutMs
			? setTimeout(() => {
					killed = true;
					proc.kill("SIGTERM");
					// Follow up with SIGKILL after 5s
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
