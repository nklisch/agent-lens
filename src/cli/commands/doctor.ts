import { defineCommand } from "citty";
import { PythonAdapter } from "../../adapters/python.js";
import { listAdapters, registerAdapter } from "../../adapters/registry.js";
import type { OutputMode } from "../format.js";
import { resolveOutputMode } from "../format.js";

export interface DoctorResult {
	platform: string;
	runtime: string;
	runtimeVersion: string;
	adapters: Array<{
		id: string;
		displayName: string;
		status: "available" | "missing";
		version?: string;
		installHint?: string;
	}>;
}

/**
 * Run all doctor checks and return structured results.
 */
export async function runDoctorChecks(): Promise<DoctorResult> {
	const platform = `${process.platform} ${process.arch}`;

	// Detect runtime version
	const bunVersion = (typeof Bun !== "undefined" ? Bun.version : null) ?? process.versions.bun ?? process.version;
	const runtimeName = process.versions.bun ? "Bun" : "Node.js";
	const runtime = runtimeName;
	const runtimeVersion = bunVersion;

	const adapters = listAdapters();
	const adapterResults: DoctorResult["adapters"] = [];

	for (const adapter of adapters) {
		const prereq = await adapter.checkPrerequisites();
		if (prereq.satisfied) {
			// Try to get version for python adapter
			let version: string | undefined;
			if (adapter.id === "python") {
				version = await getPythonDebugpyVersion();
			}
			adapterResults.push({
				id: adapter.id,
				displayName: adapter.displayName,
				status: "available",
				version,
			});
		} else {
			adapterResults.push({
				id: adapter.id,
				displayName: adapter.displayName,
				status: "missing",
				installHint: prereq.installHint,
			});
		}
	}

	return { platform, runtime, runtimeVersion, adapters: adapterResults };
}

async function getPythonDebugpyVersion(): Promise<string | undefined> {
	try {
		const { spawn } = await import("node:child_process");
		const result = await new Promise<string>((resolve, reject) => {
			const proc = spawn("python3", ["-m", "debugpy", "--version"], { stdio: "pipe" });
			let stdout = "";
			let stderr = "";
			proc.stdout.on("data", (chunk: Buffer) => {
				stdout += chunk.toString();
			});
			proc.stderr.on("data", (chunk: Buffer) => {
				stderr += chunk.toString();
			});
			proc.on("close", (code) => {
				if (code === 0) {
					resolve((stdout + stderr).trim());
				} else {
					reject(new Error("Non-zero exit"));
				}
			});
			proc.on("error", reject);
		});
		// debugpy outputs version like "1.8.0"
		return result.trim() || undefined;
	} catch {
		return undefined;
	}
}

/**
 * Format doctor results for the chosen output mode.
 */
export function formatDoctor(result: DoctorResult, mode: OutputMode): string {
	if (mode === "json") {
		return JSON.stringify(result, null, 2);
	}

	const lines: string[] = [`Agent Lens v0.1.0`, `Platform: ${result.platform}`, `Runtime: ${result.runtime} ${result.runtimeVersion}`, "", "Adapters:"];

	for (const adapter of result.adapters) {
		if (adapter.status === "available") {
			const version = adapter.version ? `  v${adapter.version}` : "";
			lines.push(`  [OK]  ${adapter.displayName.padEnd(22)}${version}`);
		} else {
			const hint = adapter.installHint ? `  not installed — ${adapter.installHint}` : "  not installed";
			lines.push(`  [--]  ${adapter.displayName.padEnd(22)}${hint}`);
		}
	}

	return lines.join("\n");
}

export const doctorCommand = defineCommand({
	meta: {
		name: "doctor",
		description: "Check installed debuggers and system readiness",
	},
	args: {
		json: {
			type: "boolean",
			description: "Output as JSON",
			default: false,
		},
		quiet: {
			type: "boolean",
			description: "Minimal output",
			default: false,
		},
	},
	async run({ args }) {
		const mode = resolveOutputMode(args);

		// Register adapters directly (doctor doesn't need the daemon)
		registerAdapter(new PythonAdapter());

		const result = await runDoctorChecks();
		process.stdout.write(`${formatDoctor(result, mode)}\n`);

		// Exit code: 0 if at least one adapter available, 1 if none
		const hasAvailable = result.adapters.some((a) => a.status === "available");
		process.exit(hasAvailable ? 0 : 1);
	},
});
