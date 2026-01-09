/**
 * Analytics and telemetry system for Pi Agent
 * Lightweight event tracking with batched API calls
 */

import { EventEmitter } from "events";

export type AnalyticsEventType =
	| "session_start"
	| "session_end"
	| "feature_used"
	| "model_switched"
	| "error_occurred"
	| "performance_metric"
	| "token_usage"
	| "tool_executed";

export interface AnalyticsEvent {
	timestamp: string;
	type: AnalyticsEventType;
	sessionId: string;
	data: Record<string, unknown>;
}

export interface AnalyticsConfig {
	enabled: boolean;
	batchSize: number;
	flushIntervalMs: number;
	endpoint?: string;
}

/**
 * Analytics manager for Pi Agent
 * Collects events locally and batches them for API submission
 */
export class AnalyticsManager extends EventEmitter {
	private queue: AnalyticsEvent[] = [];
	private config: AnalyticsConfig;
	private sessionId: string;
	private flushTimer?: NodeJS.Timeout;
	private isSubmitting = false;

	constructor(sessionId: string, config: Partial<AnalyticsConfig> = {}) {
		super();
		this.sessionId = sessionId;
		this.config = {
			enabled: true,
			batchSize: 10,
			flushIntervalMs: 5000,
			...config,
		};

		if (this.config.enabled && this.config.flushIntervalMs > 0) {
			this.startFlushTimer();
		}
	}

	/**
	 * Track an analytics event
	 */
	trackEvent(type: AnalyticsEventType, data: Record<string, unknown> = {}): void {
		if (!this.config.enabled) return;

		const event: AnalyticsEvent = {
			timestamp: new Date().toISOString(),
			type,
			sessionId: this.sessionId,
			data,
		};

		this.queue.push(event);
		this.emit("event_tracked", event);

		// Flush if batch size reached
		if (this.queue.length >= this.config.batchSize) {
			this.flushEvents();
		}
	}

	/**
	 * Track feature usage
	 */
	trackFeatureUsage(featureName: string, metadata?: Record<string, unknown>): void {
		this.trackEvent("feature_used", {
			feature: featureName,
			...metadata,
		});
	}

	/**
	 * Track model switch
	 */
	trackModelSwitch(fromModel: string, toModel: string): void {
		this.trackEvent("model_switched", {
			from: fromModel,
			to: toModel,
		});
	}

	/**
	 * Track error
	 */
	trackError(error: Error | string, context?: Record<string, unknown>): void {
		this.trackEvent("error_occurred", {
			error: typeof error === "string" ? error : error.message,
			stack: error instanceof Error ? error.stack : undefined,
			...context,
		});
	}

	/**
	 * Track performance metric
	 */
	trackPerformance(metric: string, value: number, unit?: string): void {
		this.trackEvent("performance_metric", {
			metric,
			value,
			unit,
		});
	}

	/**
	 * Track token usage
	 */
	trackTokenUsage(model: string, inputTokens: number, outputTokens: number): void {
		this.trackEvent("token_usage", {
			model,
			inputTokens,
			outputTokens,
			totalTokens: inputTokens + outputTokens,
		});
	}

	/**
	 * Track tool execution
	 */
	trackToolExecution(toolName: string, success: boolean, duration?: number): void {
		this.trackEvent("tool_executed", {
			tool: toolName,
			success,
			duration,
		});
	}

	/**
	 * Flush events to server
	 */
	async flushEvents(): Promise<void> {
		if (this.queue.length === 0 || this.isSubmitting) return;

		this.isSubmitting = true;
		const eventsToSend = [...this.queue];
		this.queue = [];

		try {
			await this.submitEvents(eventsToSend);
			this.emit("batch_submitted", eventsToSend.length);
		} catch (error) {
			// Re-add events to queue if submission failed
			this.queue = [...eventsToSend, ...this.queue];
			this.emit("batch_failed", {
				count: eventsToSend.length,
				error,
			});
		} finally {
			this.isSubmitting = false;
		}
	}

	/**
	 * Submit events to analytics endpoint
	 * Can be overridden for testing or custom implementations
	 */
	protected async submitEvents(events: AnalyticsEvent[]): Promise<void> {
		if (!this.config.endpoint) {
			// In offline mode, just emit locally
			this.emit("batch_queued", events.length);
			return;
		}

		const response = await fetch(this.config.endpoint, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				batchId: `${this.sessionId}-${Date.now()}`,
				events,
				timestamp: new Date().toISOString(),
			}),
		});

		if (!response.ok) {
			throw new Error(`Analytics submission failed: ${response.status}`);
		}
	}

	/**
	 * Get queue size
	 */
	getQueueSize(): number {
		return this.queue.length;
	}

	/**
	 * Get pending events
	 */
	getPendingEvents(): AnalyticsEvent[] {
		return [...this.queue];
	}

	/**
	 * Start auto-flush timer
	 */
	private startFlushTimer(): void {
		this.flushTimer = setInterval(() => {
			if (this.queue.length > 0) {
				this.flushEvents();
			}
		}, this.config.flushIntervalMs);
	}

	/**
	 * Stop auto-flush timer
	 */
	private stopFlushTimer(): void {
		if (this.flushTimer) {
			clearInterval(this.flushTimer);
			this.flushTimer = undefined;
		}
	}

	/**
	 * Finalize analytics session
	 * Flushes remaining events and cleans up
	 */
	async finalize(): Promise<void> {
		this.stopFlushTimer();
		await this.flushEvents();
	}

	/**
	 * Reset analytics (for testing)
	 */
	reset(): void {
		this.queue = [];
		this.isSubmitting = false;
	}
}
