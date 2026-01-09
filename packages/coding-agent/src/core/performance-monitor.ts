/**
 * Performance monitoring for Pi Agent
 * Tracks metrics like execution time, token usage, and operation counts
 */

export interface PerformanceMetric {
	name: string;
	value: number;
	unit: string;
	timestamp: Date;
	metadata?: Record<string, unknown>;
}

export interface PerformanceStats {
	count: number;
	total: number;
	min: number;
	max: number;
	average: number;
	median: number;
	stdDev: number;
	p95: number;
	p99: number;
}

/**
 * Performance monitor for Pi Agent
 * Collects and analyzes performance metrics
 */
export class PerformanceMonitor {
	private metrics: Map<string, number[]> = new Map();
	private startTimes: Map<string, number> = new Map();
	private operationCounts: Map<string, number> = new Map();

	/**
	 * Start timing an operation
	 */
	startTimer(operationId: string): void {
		this.startTimes.set(operationId, Date.now());
	}

	/**
	 * End timing an operation
	 */
	endTimer(operationName: string, operationId: string): number {
		const startTime = this.startTimes.get(operationId);
		if (!startTime) {
			console.warn(`No start time found for operation: ${operationId}`);
			return 0;
		}

		const duration = Date.now() - startTime;
		this.recordMetric(operationName, duration, "ms");
		this.startTimes.delete(operationId);
		this.incrementCount(operationName);

		return duration;
	}

	/**
	 * Record a performance metric
	 */
	recordMetric(name: string, value: number, _unit: string = "ms"): void {
		const values = this.metrics.get(name) || [];
		values.push(value);
		this.metrics.set(name, values);
	}

	/**
	 * Increment operation count
	 */
	incrementCount(operationName: string): void {
		const count = this.operationCounts.get(operationName) || 0;
		this.operationCounts.set(operationName, count + 1);
	}

	/**
	 * Get statistics for a metric
	 */
	getStats(metricName: string): PerformanceStats | null {
		const values = this.metrics.get(metricName);
		if (!values || values.length === 0) return null;

		const sorted = [...values].sort((a, b) => a - b);
		const total = values.reduce((a, b) => a + b, 0);
		const average = total / values.length;

		// Calculate standard deviation
		const variance = values.reduce((sum, val) => sum + (val - average) ** 2, 0) / values.length;
		const stdDev = Math.sqrt(variance);

		// Calculate percentiles
		const p95Index = Math.ceil(sorted.length * 0.95) - 1;
		const p99Index = Math.ceil(sorted.length * 0.99) - 1;

		return {
			count: values.length,
			total,
			min: sorted[0],
			max: sorted[sorted.length - 1],
			average,
			median: sorted[Math.floor(sorted.length / 2)],
			stdDev,
			p95: sorted[Math.max(0, p95Index)],
			p99: sorted[Math.max(0, p99Index)],
		};
	}

	/**
	 * Get operation count
	 */
	getOperationCount(operationName: string): number {
		return this.operationCounts.get(operationName) || 0;
	}

	/**
	 * Get all operation counts
	 */
	getAllOperationCounts(): Record<string, number> {
		return Object.fromEntries(this.operationCounts);
	}

	/**
	 * Get all metrics
	 */
	getAllMetrics(): Record<string, PerformanceStats | null> {
		const result: Record<string, PerformanceStats | null> = {};
		for (const metricName of this.metrics.keys()) {
			result[metricName] = this.getStats(metricName);
		}
		return result;
	}

	/**
	 * Get summary of all metrics
	 */
	getSummary(): {
		metrics: Record<string, PerformanceStats | null>;
		operations: Record<string, number>;
		slowestOperations: Array<readonly [string, number]>;
	} {
		const metrics = this.getAllMetrics();
		const operations = this.getAllOperationCounts();

		// Find slowest operations by average time
		const slowest = Object.entries(metrics)
			.filter(([_, stats]) => stats !== null)
			.map(([name, stats]) => [name, stats!.average] as const)
			.sort((a, b) => b[1] - a[1])
			.slice(0, 10);

		return {
			metrics,
			operations,
			slowestOperations: slowest,
		};
	}

	/**
	 * Reset metrics
	 */
	reset(metricName?: string): void {
		if (metricName) {
			this.metrics.delete(metricName);
			this.operationCounts.delete(metricName);
		} else {
			this.metrics.clear();
			this.operationCounts.clear();
			this.startTimes.clear();
		}
	}

	/**
	 * Format stats for display
	 */
	formatStats(stats: PerformanceStats, unit: string = "ms"): string {
		return (
			`avg: ${stats.average.toFixed(2)}${unit}, ` +
			`min: ${stats.min.toFixed(2)}${unit}, ` +
			`max: ${stats.max.toFixed(2)}${unit}, ` +
			`p95: ${stats.p95.toFixed(2)}${unit}, ` +
			`p99: ${stats.p99.toFixed(2)}${unit} (n=${stats.count})`
		);
	}

	/**
	 * Get performance report
	 */
	getReport(): string {
		const summary = this.getSummary();
		let report = "=== Performance Report ===\n\n";

		report += "Operation Counts:\n";
		for (const [op, count] of Object.entries(summary.operations)) {
			report += `  ${op}: ${count}\n`;
		}

		report += "\nSlowest Operations:\n";
		for (const [op, _time] of summary.slowestOperations) {
			const stats = summary.metrics[op];
			if (stats) {
				report += `  ${op}: ${this.formatStats(stats)}\n`;
			}
		}

		report += "\nAll Metrics:\n";
		for (const [name, stats] of Object.entries(summary.metrics)) {
			if (stats) {
				report += `  ${name}: ${this.formatStats(stats)}\n`;
			}
		}

		return report;
	}
}
