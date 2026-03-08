import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import type { Socket } from "node:net";
import { join } from "node:path";
import { LaunchError } from "../core/errors.js";
import type { AttachConfig, DAPConnection, DebugAdapter, LaunchConfig, PrerequisiteResult } from "./base.js";
import { allocatePort, CONNECT_PATIENT, connectTCP, downloadError, downloadToFile, ensureAdapterCacheDir, getAdapterCacheDir, gracefulDispose, spawnAndWait } from "./helpers.js";

/**
 * Pinned java-debug-adapter version.
 */
const JAVA_DEBUG_VERSION = "0.53.0";

/**
 * Returns the path to the java-debug-adapter JAR cache directory.
 */
export function getJavaDebugAdapterCachePath(): string {
	return join(getAdapterCacheDir("java-debug"), `java-debug-adapter-${JAVA_DEBUG_VERSION}.jar`);
}

/**
 * Check if the java-debug-adapter JAR is cached.
 */
function isJavaDebugAdapterCached(): boolean {
	return existsSync(getJavaDebugAdapterCachePath());
}

/**
 * Download and cache the java-debug-adapter fat JAR from Maven Central.
 * Returns the path to the cached JAR.
 */
export async function downloadAndCacheJavaDebugAdapter(): Promise<string> {
	const jarPath = getJavaDebugAdapterCachePath();
	ensureAdapterCacheDir("java-debug");

	// Maven Central URL for java-debug-adapter
	const url = `https://repo1.maven.org/maven2/com/microsoft/java/com.microsoft.java.debug.plugin/${JAVA_DEBUG_VERSION}/com.microsoft.java.debug.plugin-${JAVA_DEBUG_VERSION}.jar`;

	try {
		await downloadToFile(url, jarPath, "java-debug-adapter");
	} catch (err) {
		throw downloadError("java-debug-adapter", JAVA_DEBUG_VERSION, url, jarPath, err, `To install manually, download the JAR and place it at: ${jarPath}`);
	}

	if (!existsSync(jarPath)) {
		throw new Error(`java-debug-adapter download completed but JAR not found at: ${jarPath}`);
	}

	return jarPath;
}

/**
 * Parse a JDK version string like "javac 17.0.8" and extract major version.
 */
function parseJavacVersion(output: string): number {
	const match = output.match(/javac\s+(\d+)/);
	return match ? parseInt(match[1], 10) : 0;
}

/**
 * Parse a java command to extract main class and classpaths.
 * Handles: "java Main", "java -jar app.jar", "java -cp classes Main"
 */
function parseJavaCommand(command: string): { mainClass: string; classPaths: string[]; jarMode: boolean } {
	const parts = command.trim().split(/\s+/);
	let i = 0;

	// Skip "java" prefix
	if (parts[i] === "java") i++;

	const classPaths: string[] = ["."];
	let mainClass = "";
	let jarMode = false;

	while (i < parts.length) {
		const arg = parts[i];
		if (arg === "-jar") {
			jarMode = true;
			i++;
			if (i < parts.length) {
				classPaths[0] = parts[i] ?? ".";
				i++;
			}
		} else if (arg === "-cp" || arg === "-classpath") {
			i++;
			if (i < parts.length) {
				classPaths[0] = parts[i] ?? ".";
				i++;
			}
		} else if (arg?.startsWith("-")) {
			// Skip other flags
			i++;
		} else {
			// This is the main class
			mainClass = arg ?? "";
			i++;
		}
	}

	return { mainClass, classPaths, jarMode };
}

export class JavaAdapter implements DebugAdapter {
	id = "java";
	fileExtensions = [".java"];
	displayName = "Java (java-debug-adapter)";

	private adapterProcess: ChildProcess | null = null;
	private socket: Socket | null = null;

	/**
	 * Check for JDK 17+ and java-debug-adapter JAR.
	 */
	async checkPrerequisites(): Promise<PrerequisiteResult> {
		// Check javac
		const javacResult = await new Promise<{ ok: boolean; version: number }>((resolve) => {
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
					resolve({ ok: false, version: 0 });
					return;
				}
				const version = parseJavacVersion(output);
				resolve({ ok: true, version });
			});
			proc.on("error", () => resolve({ ok: false, version: 0 }));
		});

		if (!javacResult.ok) {
			return {
				satisfied: false,
				missing: ["javac"],
				installHint: "Install JDK 17+ from https://adoptium.net",
			};
		}

		if (javacResult.version < 17) {
			return {
				satisfied: false,
				missing: ["javac (17+)"],
				installHint: `JDK ${javacResult.version} is too old. Install JDK 17+ from https://adoptium.net`,
			};
		}

		// Check java-debug-adapter JAR
		if (!isJavaDebugAdapterCached()) {
			return {
				satisfied: false,
				missing: ["java-debug-adapter"],
				installHint: "The java-debug-adapter JAR will be downloaded automatically on first use.",
			};
		}

		return { satisfied: true };
	}

	/**
	 * Launch a Java program via java-debug-adapter.
	 */
	async launch(config: LaunchConfig): Promise<DAPConnection> {
		const cwd = config.cwd ?? process.cwd();

		// Ensure JAR is cached
		let jarPath = getJavaDebugAdapterCachePath();
		if (!isJavaDebugAdapterCached()) {
			jarPath = await downloadAndCacheJavaDebugAdapter();
		}

		const port = config.port ?? (await allocatePort());

		// Spawn java-debug-adapter server
		const { process: adapterProc } = await spawnAndWait({
			cmd: "java",
			args: ["-jar", jarPath, "--port", String(port)],
			cwd,
			env: { ...process.env, ...config.env },
			readyPattern: /listening|started|ready/i,
			timeoutMs: 20_000,
			label: "java-debug-adapter",
		});

		this.adapterProcess = adapterProc;

		const socket = await connectTCP("127.0.0.1", port, CONNECT_PATIENT.maxRetries, CONNECT_PATIENT.retryDelayMs).catch((err) => {
			adapterProc.kill();
			throw new LaunchError(`Could not connect to java-debug-adapter on port ${port}: ${err.message}`);
		});

		this.socket = socket;

		const { mainClass, classPaths, jarMode } = parseJavaCommand(config.command);

		const launchArgs: Record<string, unknown> = {
			mainClass: jarMode ? "" : mainClass,
			classPaths,
			cwd,
			env: config.env ?? {},
		};

		if (jarMode) {
			launchArgs.jarPath = classPaths[0];
		}

		return {
			reader: socket,
			writer: socket,
			process: adapterProc,
			launchArgs,
		};
	}

	/**
	 * Attach to a JVM with JDWP agent enabled.
	 */
	async attach(config: AttachConfig): Promise<DAPConnection> {
		const host = config.host ?? "127.0.0.1";
		const jdwpPort = config.port ?? 5005;

		// Ensure JAR is cached
		let jarPath = getJavaDebugAdapterCachePath();
		if (!isJavaDebugAdapterCached()) {
			jarPath = await downloadAndCacheJavaDebugAdapter();
		}

		const dapPort = await allocatePort();

		const { process: adapterProc } = await spawnAndWait({
			cmd: "java",
			args: ["-jar", jarPath, "--port", String(dapPort)],
			readyPattern: /listening|started|ready/i,
			timeoutMs: 20_000,
			label: "java-debug-adapter",
		});

		this.adapterProcess = adapterProc;

		const socket = await connectTCP("127.0.0.1", dapPort, CONNECT_PATIENT.maxRetries, CONNECT_PATIENT.retryDelayMs).catch((err) => {
			adapterProc.kill();
			throw new LaunchError(`Could not connect to java-debug-adapter on port ${dapPort}: ${err.message}`);
		});

		this.socket = socket;

		return {
			reader: socket,
			writer: socket,
			process: adapterProc,
			launchArgs: {
				request: "attach",
				hostName: host,
				port: jdwpPort,
			},
		};
	}

	async dispose(): Promise<void> {
		await gracefulDispose(this.socket, this.adapterProcess);
		this.socket = null;
		this.adapterProcess = null;
	}
}
