/**
 * Session metrics tracker for Pi Agent
 * Collects and tracks session-level metrics
 */

import type { AnalyticsManager } from "./analytics.js";
import type { PerformanceMonitor } from "./performance-monitor.js";
import type { RateLimiter } from "./rate-limiter.js";

export interface SessionMetrics {
	sessionId: string;
	startTime: Date;
	endTime?: Date;
	duration?: number;
	totalTokens: number;
	inputTokens: number;
	outputTokens: number;
	totalRequests: number;
	modelsSwitched: string[];
	featuresUsed: Set<string>;
	toolsExecuted: Map<string, number>;
	errors: Array<{
		timestamp: Date;
		error: string;
		context?: Record<string, unknown>;
	}>;
	performance: {
		averageResponseTime: number;
		slowestOperation: string | null;
		fastestOperation: string | null;
	};
}

/**
 * Session metrics tracker
 * Integrates analytics, performance monitoring, and rate limiting
 */
export class SessionMetricsTracker {
	private sessionId: string;
	private metrics: SessionMetrics;
	private analytics: AnalyticsManager;
	private performanceMonitor: PerformanceMonitor;
	private rateLimiter: RateLimiter;

	constructor(
		sessionId: string,
		analyticsManager: AnalyticsManager,
		performanceMonitor: PerformanceMonitor,
		rateLimiter: RateLimiter,
	) {
		this.sessionId = sessionId;
		this.analytics = analyticsManager;
		this.performanceMonitor = performanceMonitor;
		this.rateLimiter = rateLimiter;

		this.metrics = {
			sessionId,
			startTime: new Date(),
			totalTokens: 0,
			inputTokens: 0,
			outputTokens: 0,
			totalRequests: 0,
			modelsSwitched: [],
			featuresUsed: new Set(),
			toolsExecuted: new Map(),
			errors: [],
			performance: {
				averageResponseTime: 0,
				slowestOperation: null,
				fastestOperation: null,
			},
		};

		// Track session start
		this.analytics.trackEvent("session_start", {
			sessionId,
		});
	}

	/**
	 * Record token usage
	 */
	recordTokenUsage(model: string, inputTokens: number, outputTokens: number): void {
		this.metrics.inputTokens += inputTokens;
		this.metrics.outputTokens += outputTokens;
		this.metrics.totalTokens += inputTokens + outputTokens;

		this.analytics.trackTokenUsage(model, inputTokens, outputTokens);
		this.performanceMonitor.recordMetric("tokens_per_request", inputTokens + outputTokens);
	}

	/**
	 * Record API request
	 */
	recordRequest(endpoint: string): void {
		this.metrics.totalRequests++;
		this.rateLimiter.recordRequest(endpoint);
	}

	/**
	 * Record model switch
	 */
	recordModelSwitch(fromModel: string, toModel: string): void {
		if (!this.metrics.modelsSwitched.includes(fromModel)) {
			this.metrics.modelsSwitched.push(fromModel);
		}
		if (!this.metrics.modelsSwitched.includes(toModel)) {
			this.metrics.modelsSwitched.push(toModel);
		}

		this.analytics.trackModelSwitch(fromModel, toModel);
		this.performanceMonitor.incrementCount(`model_switch_${fromModel}_to_${toModel}`);
	}

	/**
	 * Record feature usage
	 */
	recordFeatureUsage(featureName: string, metadata?: Record<string, unknown>): void {
		this.metrics.featuresUsed.add(featureName);
		this.analytics.trackFeatureUsage(featureName, metadata);
		this.performanceMonitor.incrementCount(`feature_${featureName}`);
	}

	/**
	 * Record tool execution
	 */
	recordToolExecution(toolName: string, success: boolean, duration?: number): void {
		const count = this.metrics.toolsExecuted.get(toolName) || 0;
		this.metrics.toolsExecuted.set(toolName, count + 1);

		this.analytics.trackToolExecution(toolName, success, duration);
		this.performanceMonitor.recordMetric(`tool_${toolName}_execution_time`, duration || 0);
	}

	/**
	 * Record error
	 */
	recordError(error: Error | string, context?: Record<string, unknown>): void {
		const errorMessage = typeof error === "string" ? error : error.message;

		this.metrics.errors.push({
			timestamp: new Date(),
			error: errorMessage,
			context,
		});

		this.analytics.trackError(error, context);
		this.performanceMonitor.incrementCount("errors");
	}

	/**
	 * Record operation timing
	 */
	startOperation(operationId: string): void {
		this.performanceMonitor.startTimer(operationId);
	}

	/**
	 * End operation timing
	 */
	endOperation(operationName: string, operationId: string): number {
		return this.performanceMonitor.endTimer(operationName, operationId);
	}

	/**
	 * Get current metrics
	 */
	getMetrics(): SessionMetrics {
		const summary = this.performanceMonitor.getSummary();
		const times = Object.values(summary.metrics)
			.filter((s) => s !== null && s.count > 0)
			.map((s) => s!.average);

		return {
			...this.metrics,
			performance: {
				averageResponseTime: times.length > 0 ? times.reduce((a, b) => a + b) / times.length : 0,
				slowestOperation: summary.slowestOperations[0]?.[0] || null,
				fastestOperation: summary.slowestOperations[summary.slowestOperations.length - 1]?.[0] || null,
			},
		};
	}

	/**
	 * Get metrics report
	 */
	getReport(): string {
		const metrics = this.getMetrics();
		const duration = metrics.endTime
			? metrics.endTime.getTime() - metrics.startTime.getTime()
			: Date.now() - metrics.startTime.getTime();

		let report = "=== Session Metrics Report ===\n\n";

		report += `Session ID: ${metrics.sessionId}\n`;
		report += `Duration: ${(duration / 1000).toFixed(2)}s\n`;
		report += `Start Time: ${metrics.startTime.toISOString()}\n`;
		if (metrics.endTime) {
			report += `End Time: ${metrics.endTime.toISOString()}\n`;
		}

		report += `\nToken Usage:\n`;
		report += `  Total: ${metrics.totalTokens}\n`;
		report += `  Input: ${metrics.inputTokens}\n`;
		report += `  Output: ${metrics.outputTokens}\n`;

		report += `\nAPI Usage:\n`;
		report += `  Total Requests: ${metrics.totalRequests}\n`;
		report += `  Average Response Time: ${metrics.performance.averageResponseTime.toFixed(2)}ms\n`;

		report += `\nModels Used:\n`;
		for (const model of metrics.modelsSwitched) {
			const switchCount = this.performanceMonitor.getOperationCount(`model_switch_to_${model}`);
			report += `  ${model}${switchCount > 0 ? ` (${switchCount} switches)` : ""}\n`;
		}

		report += `\nFeatures Used:\n`;
		for (const feature of metrics.featuresUsed) {
			report += `  - ${feature}\n`;
		}

		report += `\nTools Executed:\n`;
		for (const [tool, count] of metrics.toolsExecuted) {
			report += `  ${tool}: ${count}x\n`;
		}

		if (metrics.errors.length > 0) {
			report += `\nErrors (${metrics.errors.length}):\n`;
			for (const error of metrics.errors.slice(-5)) {
				report += `  [${error.timestamp.toISOString()}] ${error.error}\n`;
			}
			if (metrics.errors.length > 5) {
				report += `  ... and ${metrics.errors.length - 5} more\n`;
			}
		}

		report += `\nPerformance:\n`;
		report += this.performanceMonitor.getReport();

		return report;
	}

	/**
	 * Finalize session
	 */
	async finalize(): Promise<void> {
		this.metrics.endTime = new Date();
		this.metrics.duration = this.metrics.endTime.getTime() - this.metrics.startTime.getTime();

		// Track session end
		this.analytics.trackEvent("session_end", {
			duration: this.metrics.duration,
			totalTokens: this.metrics.totalTokens,
			totalRequests: this.metrics.totalRequests,
			errors: this.metrics.errors.length,
			models: Array.from(this.metrics.modelsSwitched),
			features: Array.from(this.metrics.featuresUsed),
		});

		// Flush analytics
		await this.analytics.finalize();
	}
}
