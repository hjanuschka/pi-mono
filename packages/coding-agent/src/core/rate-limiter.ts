/**
 * Rate limiting and quota management for Pi Agent
 * Supports per-operation rate limiting with configurable limits
 */

export interface RateLimitConfig {
	/** Maximum requests per minute */
	requestsPerMinute: number;
	/** Maximum tokens per minute */
	tokensPerMinute?: number;
	/** Maximum concurrent operations */
	maxConcurrent?: number;
}

export interface RateLimitStatus {
	operation: string;
	requestsInWindow: number;
	limit: number;
	resetTime: Date;
	remainingQuota: number;
	percentageUsed: number;
}

/**
 * Rate limiter for Pi Agent operations
 * Tracks usage in sliding windows and enforces limits
 */
export class RateLimiter {
	private limits: Map<string, RateLimitConfig>;
	private requestTimestamps: Map<string, number[]> = new Map();
	private tokenCounts: Map<string, number[]> = new Map();
	private windowDurationMs = 60000; // 1 minute

	constructor(defaultConfig: RateLimitConfig = { requestsPerMinute: 100 }) {
		this.limits = new Map();
		this.setLimit("default", defaultConfig);
	}

	/**
	 * Set rate limit for an operation
	 */
	setLimit(operation: string, config: RateLimitConfig): void {
		this.limits.set(operation, config);
	}

	/**
	 * Get rate limit for an operation
	 */
	getLimit(operation: string): RateLimitConfig {
		return this.limits.get(operation) || this.limits.get("default")!;
	}

	/**
	 * Check if an operation is allowed
	 */
	isAllowed(operation: string): boolean {
		const limit = this.getLimit(operation);
		const now = Date.now();
		const windowStart = now - this.windowDurationMs;

		const timestamps = (this.requestTimestamps.get(operation) || []).filter((t) => t > windowStart);

		return timestamps.length < limit.requestsPerMinute;
	}

	/**
	 * Record a request
	 * Throws if rate limit exceeded
	 */
	recordRequest(operation: string): void {
		if (!this.isAllowed(operation)) {
			const limit = this.getLimit(operation);
			throw new Error(
				`Rate limit exceeded for "${operation}": ` + `${limit.requestsPerMinute} requests per minute allowed`,
			);
		}

		const now = Date.now();
		const timestamps = this.requestTimestamps.get(operation) || [];
		timestamps.push(now);
		this.requestTimestamps.set(operation, timestamps);

		// Clean old timestamps
		this.cleanOldTimestamps(operation);
	}

	/**
	 * Get remaining quota for an operation
	 */
	getRemainingQuota(operation: string): number {
		const limit = this.getLimit(operation);
		const now = Date.now();
		const windowStart = now - this.windowDurationMs;

		const timestamps = (this.requestTimestamps.get(operation) || []).filter((t) => t > windowStart);

		return Math.max(0, limit.requestsPerMinute - timestamps.length);
	}

	/**
	 * Get rate limit status
	 */
	getStatus(operation: string): RateLimitStatus {
		const limit = this.getLimit(operation);
		const now = Date.now();
		const windowStart = now - this.windowDurationMs;

		const timestamps = (this.requestTimestamps.get(operation) || []).filter((t) => t > windowStart);

		const requestsInWindow = timestamps.length;
		const remainingQuota = Math.max(0, limit.requestsPerMinute - requestsInWindow);
		const percentageUsed = (requestsInWindow / limit.requestsPerMinute) * 100;

		// Find the oldest request in window to calculate reset time
		const oldestRequest = timestamps[0] || now;
		const resetTime = new Date(oldestRequest + this.windowDurationMs);

		return {
			operation,
			requestsInWindow,
			limit: limit.requestsPerMinute,
			resetTime,
			remainingQuota,
			percentageUsed,
		};
	}

	/**
	 * Record token usage for an operation
	 */
	recordTokenUsage(operation: string, tokens: number): void {
		if (this.getLimit(operation).tokensPerMinute) {
			const now = Date.now();
			const windowStart = now - this.windowDurationMs;

			const counts = (this.tokenCounts.get(operation) || []).filter((t) => t > windowStart);
			counts.push(tokens);
			this.tokenCounts.set(operation, counts);

			const totalTokens = counts.reduce((a, b) => a + b, 0);
			const limit = this.getLimit(operation).tokensPerMinute;

			if (totalTokens > limit!) {
				throw new Error(`Token rate limit exceeded for "${operation}": ` + `${limit} tokens per minute allowed`);
			}
		}
	}

	/**
	 * Get token usage status
	 */
	getTokenUsageStatus(operation: string): {
		tokensUsed: number;
		limit: number;
		remaining: number;
		percentageUsed: number;
	} | null {
		const limit = this.getLimit(operation).tokensPerMinute;
		if (!limit) return null;

		const now = Date.now();
		const windowStart = now - this.windowDurationMs;

		const counts = (this.tokenCounts.get(operation) || []).filter((t) => t > windowStart);
		const tokensUsed = counts.reduce((a, b) => a + b, 0);
		const remaining = Math.max(0, limit - tokensUsed);
		const percentageUsed = (tokensUsed / limit) * 100;

		return {
			tokensUsed,
			limit,
			remaining,
			percentageUsed,
		};
	}

	/**
	 * Reset rate limit for operation
	 */
	reset(operation?: string): void {
		if (operation) {
			this.requestTimestamps.delete(operation);
			this.tokenCounts.delete(operation);
		} else {
			this.requestTimestamps.clear();
			this.tokenCounts.clear();
		}
	}

	/**
	 * Clean old timestamps for an operation
	 */
	private cleanOldTimestamps(operation: string): void {
		const now = Date.now();
		const windowStart = now - this.windowDurationMs;

		const timestamps = (this.requestTimestamps.get(operation) || []).filter((t) => t > windowStart);

		if (timestamps.length === 0) {
			this.requestTimestamps.delete(operation);
		} else {
			this.requestTimestamps.set(operation, timestamps);
		}
	}

	/**
	 * Get all operation statuses
	 */
	getAllStatuses(): RateLimitStatus[] {
		const statuses: RateLimitStatus[] = [];
		for (const operation of this.limits.keys()) {
			statuses.push(this.getStatus(operation));
		}
		return statuses;
	}

	/**
	 * Check if any limit is near threshold
	 */
	hasNearLimitWarnings(threshold: number = 0.8): string[] {
		const warnings: string[] = [];
		for (const status of this.getAllStatuses()) {
			if (status.percentageUsed >= threshold * 100) {
				warnings.push(`${status.operation}: ${status.percentageUsed.toFixed(1)}% of quota used`);
			}
		}
		return warnings;
	}
}
