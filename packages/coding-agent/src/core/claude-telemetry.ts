import * as crypto from "crypto";
import { randomUUID } from "crypto";
import os from "os";

// Constants from intercepted traffic
const STATSIG_API = "https://statsig.anthropic.com/v1/rgstr";
const STATSIG_CLIENT_KEY = "client-RRNS7R65EAtReO5XA4xDC3eU6ZdJQi6lLEP6b5j32Me";
const EVENT_LOGGING_API = "https://api.anthropic.com/api/event_logging/batch";
const CLAUDE_CODE_VERSION = "2.1.2";

export interface TelemetryConfig {
	sessionId: string;
	deviceId?: string;
	userId?: string;
	enabled: boolean;
}

export class ClaudeCodeTelemetry {
	private sessionId: string;
	private deviceId: string;
	private userId: string;
	private enabled: boolean;
	private startTime: number;
	private stableID: string;

	constructor(config: TelemetryConfig) {
		this.sessionId = config.sessionId || randomUUID();
		this.deviceId = config.deviceId || this.generateDeviceId();
		this.userId = config.userId || this.deviceId;
		this.enabled = config.enabled;
		this.startTime = Date.now();
		this.stableID = randomUUID();
	}

	private generateDeviceId(): string {
		// Generate a consistent device ID based on hostname/platform if possible, or random
		const data = os.hostname() + os.platform() + os.arch();
		return crypto.createHash("sha256").update(data).digest("hex");
	}

	private getEnvMetadata() {
		return JSON.stringify({
			platform: os.platform(),
			arch: os.arch(),
			nodeVersion: process.version,
			terminal: process.env.TERM || "xterm",
			packageManagers: "npm,yarn", // Mimic
			runtimes: "node",
			isRunningWithBun: false,
			isCi: false,
			isClaubbit: false,
			isClaudeCodeRemote: false,
			isConductor: false,
			isGithubAction: false,
			isClaudeCodeAction: false,
			isClaudeAiAuth: false,
			version: CLAUDE_CODE_VERSION,
			versionBase: CLAUDE_CODE_VERSION,
			buildTime: new Date(Date.now() - 86400000).toISOString(), // Mock build time
			deploymentEnvironment: "docker", // Or local
		});
	}

	private getUserMetadata() {
		return {
			customIDs: {
				sessionId: this.sessionId,
			},
			userID: this.userId,
			appVersion: CLAUDE_CODE_VERSION,
			custom: {
				userType: "external",
				subscriptionType: "",
				firstTokenTime: 0,
			},
			statsigEnvironment: {
				tier: "production",
			},
		};
	}

	private getStatsigMetadata() {
		return {
			sdkVersion: "3.12.1",
			sdkType: "javascript-client",
			stableID: this.stableID,
			sessionID: randomUUID(), // Statsig session ID is different from app session ID
			fallbackUrl: null,
		};
	}

	async trackTenguEvent(eventName: string, metadata: Record<string, string>) {
		if (!this.enabled) return;

		const event = {
			eventName,
			metadata: {
				...metadata,
				model: "claude-sonnet-4-5-20250929", // Default model seen in logs
				sessionId: this.sessionId,
				userType: "external",
				betas: "claude-code-20250219,interleaved-thinking-2025-05-14",
				env: this.getEnvMetadata(),
				entrypoint: "sdk-cli",
				isInteractive: "false",
				clientType: "sdk-cli",
				sweBenchRunId: "",
				sweBenchInstanceId: "",
				sweBenchTaskId: "",
			},
			user: this.getUserMetadata(),
			time: Date.now(),
		};

		const body = {
			events: [event],
			statsigMetadata: this.getStatsigMetadata(),
		};

		const url = `${STATSIG_API}?k=${STATSIG_CLIENT_KEY}&st=javascript-client&sv=3.12.1&t=${Date.now()}&sid=${this.sessionId}&ec=1`;

		try {
			// Fire and forget, but log error if fails
			fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(body),
			}).catch(() => {});
		} catch (e) {
			// Ignore
		}
	}

	async logInternalEvent(eventName: string, additionalMetadata: Record<string, any> = {}) {
		if (!this.enabled) return;

		const eventId = randomUUID();
		const event = {
			event_type: "ClaudeCodeInternalEvent",
			event_data: {
				event_name: eventName,
				client_timestamp: new Date().toISOString(),
				model: "claude-sonnet-4-5-20250929",
				session_id: this.sessionId,
				user_type: "external",
				betas: "claude-code-20250219,interleaved-thinking-2025-05-14",
				env: JSON.parse(this.getEnvMetadata()), // Internal events use object, not string
				entrypoint: "sdk-cli",
				is_interactive: false,
				client_type: "sdk-cli",
				additional_metadata: JSON.stringify(additionalMetadata),
				event_id: eventId,
				device_id: this.deviceId,
			},
		};

		try {
			fetch(EVENT_LOGGING_API, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ events: [event] }),
			}).catch(() => {});
		} catch (e) {
			// Ignore
		}
	}

	// Specific event helpers

	async trackInit() {
		await this.trackTenguEvent("tengu_init", {
			hasInitialPrompt: "false",
			hasStdin: "true",
			verbose: "false",
			debug: "false",
			debugToStderr: "false",
			print: "false",
			outputFormat: "text",
			inputFormat: "text",
			numAllowedTools: "0",
			numDisallowedTools: "0",
			mcpClientCount: "0",
			worktree: "false",
			dangerouslySkipPermissionsPassed: "false",
			modeIsBypass: "false",
			allowDangerouslySkipPermissionsPassed: "false",
		});
	}

	async trackInputPrompt(isNegative: boolean = false, isKeepGoing: boolean = false) {
		await this.trackTenguEvent("tengu_input_prompt", {
			is_negative: String(isNegative),
			is_keep_going: String(isKeepGoing),
		});
	}

	async trackBeforeNormalize(msgCount: number) {
		await this.trackTenguEvent("tengu_api_before_normalize", {
			preNormalizedMessageCount: String(msgCount),
		});
	}

	async trackAfterNormalize(msgCount: number) {
		await this.trackTenguEvent("tengu_api_after_normalize", {
			postNormalizedMessageCount: String(msgCount),
		});
	}

	async trackApiCacheBreakpoints(messageCount: number, cachingEnabled: boolean) {
		await this.trackTenguEvent("tengu_api_cache_breakpoints", {
			totalMessageCount: String(messageCount),
			cachingEnabled: String(cachingEnabled),
		});
	}

	async trackCacheStats(hits: number, misses: number) {
		const total = hits + misses;
		const hitRate = total > 0 ? hits / total : 0;

		// This goes to both? Logs show tengu_config_cache_stats in both statsig and internal events
		// But mostly internal events for the detailed stats

		await this.logInternalEvent("tengu_config_cache_stats", {
			cache_hits: hits,
			cache_misses: misses,
			hit_rate: hitRate,
		});
	}

	async trackToolSearchModeDecision() {
		await this.trackTenguEvent("tengu_tool_search_mode_decision", {
			enabled: "false",
			mode: "standard",
			reason: "mcp_search_unavailable",
			mcpToolCount: "0",
		});
	}

	async trackContextSize(totalContextSize: number) {
		await this.trackTenguEvent("tengu_context_size", {
			git_status_size: "0",
			claude_md_size: "0",
			total_context_size: String(totalContextSize),
			project_file_count_rounded: "0",
			mcp_tools_count: "0",
			mcp_servers_count: "0",
			mcp_tools_tokens: "0",
			non_mcp_tools_count: "4",
			non_mcp_tools_tokens: "0",
		});
	}
}
