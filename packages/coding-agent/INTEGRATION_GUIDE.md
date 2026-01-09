# Pi Agent Enhancement: Analytics, Monitoring & Metrics

## Overview

This document describes the new analytics, monitoring, and metrics systems added to Pi Agent to close the gap with Claude Code while maintaining our lightweight architecture.

## New Modules

### 1. Analytics Manager (`analytics.ts`)

Lightweight event tracking system with batched API calls.

**Features:**
- Event queue with configurable batch size
- Multiple event types (session_start, feature_used, model_switched, error_occurred, performance_metric, token_usage, tool_executed)
- Automatic batching to minimize API calls (default: 10 events per batch)
- Flush on interval or when batch is full
- EventEmitter interface for observability

**Usage:**

```typescript
import { AnalyticsManager } from "@mariozechner/pi-coding-agent";

const analytics = new AnalyticsManager("session-123", {
  enabled: true,
  batchSize: 10,
  flushIntervalMs: 5000,
  endpoint: "https://api.example.com/v1/analytics/batch",
});

// Track events
analytics.trackFeatureUsage("code_execution");
analytics.trackModelSwitch("claude-opus", "claude-sonnet");
analytics.trackTokenUsage("claude-opus", 150, 320);
analytics.trackError(error, { context: "tool execution" });

// Flush when done
await analytics.finalize();
```

**API Impact:** +1 request per batch (configurable, default ~1 per session)

### 2. Rate Limiter (`rate-limiter.ts`)

Per-operation rate limiting with quota tracking.

**Features:**
- Per-minute rate limiting
- Token-based rate limiting (optional)
- Sliding window tracking
- Quota reporting with percentages
- Per-operation configuration

**Usage:**

```typescript
import { RateLimiter } from "@mariozechner/pi-coding-agent";

const limiter = new RateLimiter({
  requestsPerMinute: 100,
  tokensPerMinute: 1000000,
});

// Set per-operation limits
limiter.setLimit("api_calls", { requestsPerMinute: 50 });
limiter.setLimit("code_execution", { requestsPerMinute: 20 });

// Check and record requests
if (limiter.isAllowed("api_calls")) {
  limiter.recordRequest("api_calls");
  // Perform the operation
}

// Get status
const status = limiter.getStatus("api_calls");
console.log(`${status.remainingQuota} requests remaining`);
```

**API Impact:** 0 additional requests (uses cached settings)

### 3. Performance Monitor (`performance-monitor.ts`)

Comprehensive performance metrics collection and analysis.

**Features:**
- Operation timing (start/end timers)
- Metric collection by name
- Statistical analysis (min, max, avg, median, stdDev, p95, p99)
- Operation counting
- Performance reports with formatting

**Usage:**

```typescript
import { PerformanceMonitor } from "@mariozechner/pi-coding-agent";

const perf = new PerformanceMonitor();

// Time operations
const opId = `op-${Date.now()}`;
perf.startTimer(opId);
await doExpensiveWork();
perf.endTimer("expensive_work", opId);

// Record custom metrics
perf.recordMetric("api_latency", responseTime, "ms");
perf.incrementCount("api_calls");

// Get analysis
const stats = perf.getStats("expensive_work");
console.log(`Average: ${stats.average}ms, P95: ${stats.p95}ms`);

// Get full report
console.log(perf.getReport());
```

**API Impact:** 0 additional requests (local only)

### 4. Session Metrics Tracker (`session-metrics.ts`)

Integrates analytics, performance, and rate limiting for session-level tracking.

**Features:**
- Unified session metrics tracking
- Token usage aggregation
- Model switch tracking
- Feature usage tracking
- Tool execution tracking
- Error tracking with context
- Comprehensive reporting
- Graceful finalization

**Usage:**

```typescript
import {
  AnalyticsManager,
  PerformanceMonitor,
  RateLimiter,
  SessionMetricsTracker,
} from "@mariozechner/pi-coding-agent";

// Initialize components
const analytics = new AnalyticsManager(sessionId);
const perf = new PerformanceMonitor();
const limiter = new RateLimiter({ requestsPerMinute: 100 });

// Create tracker
const tracker = new SessionMetricsTracker(sessionId, analytics, perf, limiter);

// Use throughout session
tracker.recordTokenUsage("claude-opus", 150, 320);
tracker.recordRequest("/v1/messages");
tracker.recordFeatureUsage("code_execution");
tracker.recordToolExecution("bash", true, 234);

// Get metrics at any time
const metrics = tracker.getMetrics();
console.log(`Total tokens: ${metrics.totalTokens}`);

// Finalize when done
await tracker.finalize();

// Get comprehensive report
console.log(tracker.getReport());
```

**API Impact:** +1 batch request per session end

## Integration with AgentSession

### Step 1: Initialize in AgentSession constructor

```typescript
import {
  AnalyticsManager,
  PerformanceMonitor,
  RateLimiter,
  SessionMetricsTracker,
} from "./core/index.js";

export class AgentSession {
  private metrics: SessionMetricsTracker;

  constructor(config: AgentSessionConfig) {
    const sessionId = generateSessionId();

    const analytics = new AnalyticsManager(sessionId, {
      enabled: !config.offline,
      batchSize: 10,
      flushIntervalMs: 5000,
      endpoint: config.analyticsEndpoint,
    });

    const perf = new PerformanceMonitor();
    const limiter = new RateLimiter({ requestsPerMinute: 100 });

    this.metrics = new SessionMetricsTracker(
      sessionId,
      analytics,
      perf,
      limiter,
    );

    // ... rest of initialization
  }
}
```

### Step 2: Track API calls

```typescript
// In your API client or agent-session.ts
private async callModel(messages: Message[]) {
  this.metrics.startOperation(`model-call-${Date.now()}`);

  try {
    this.metrics.recordRequest("/v1/messages");

    const response = await this.apiClient.post("/v1/messages", {
      messages,
      model: this.currentModel,
    });

    this.metrics.recordTokenUsage(
      this.currentModel,
      response.usage.input_tokens,
      response.usage.output_tokens,
    );

    this.metrics.endOperation("model_call", `model-call-${Date.now()}`);

    return response;
  } catch (error) {
    this.metrics.recordError(error, { context: "model_call" });
    throw error;
  }
}
```

### Step 3: Track feature usage

```typescript
// When features are used
private executeCodeTool(code: string) {
  this.metrics.recordFeatureUsage("code_execution", {
    language: detectLanguage(code),
  });

  // ... execute code
}

private switchModel(newModel: string) {
  this.metrics.recordModelSwitch(this.currentModel, newModel);
  this.currentModel = newModel;
}
```

### Step 4: Finalize on shutdown

```typescript
async shutdown() {
  // ... cleanup
  await this.metrics.finalize();
}
```

## Behavioral Changes

### Request Count Impact

**Before:**
- ~23 requests per session
- 22 OAuth token refreshes
- 1 GitHub Copilot fallback check

**After (with analytics enabled):**
- ~24-25 requests per session
- 22 OAuth token refreshes (unchanged)
- 1 GitHub Copilot fallback check (unchanged)
- +1 Analytics batch (10 events per batch)

**Still 3-4x lighter than Claude Code (85 requests)**

### No Breaking Changes

- All features optional
- Graceful degradation if endpoints unavailable
- Analytics can be disabled via config
- Offline mode supported

## Configuration

### Disable Analytics

```typescript
const analytics = new AnalyticsManager(sessionId, {
  enabled: false,
});
```

### Increase Batch Size (fewer requests)

```typescript
const analytics = new AnalyticsManager(sessionId, {
  batchSize: 20, // 2x fewer requests
  flushIntervalMs: 10000, // Flush less frequently
});
```

### Custom Analytics Endpoint

```typescript
const analytics = new AnalyticsManager(sessionId, {
  endpoint: "https://your-analytics-server.com/events",
});
```

### Custom Rate Limits

```typescript
const limiter = new RateLimiter({
  requestsPerMinute: 200, // Increase default
  tokensPerMinute: 2000000,
});

limiter.setLimit("code_execution", { requestsPerMinute: 50 });
```

## Comparison: Before vs After

| Aspect | Before | After |
|--------|--------|-------|
| **Requests/session** | ~23 | ~24-25 |
| **Analytics** | None | Batched events |
| **Performance Tracking** | None | Full metrics |
| **Rate Limiting** | None | Enforced quotas |
| **Feature Tracking** | None | Detailed usage |
| **Error Tracking** | None | Contextual errors |
| **Reporting** | None | Comprehensive |
| **vs Claude Code** | 3.7x lighter | 3.3x lighter |

## Benefits

✅ **Feature Management**: Understand what features are used  
✅ **Performance Insights**: Identify bottlenecks  
✅ **Error Tracking**: Debug issues with context  
✅ **Usage Analytics**: Understand user patterns  
✅ **Rate Limiting**: Prevent abuse, enforce quotas  
✅ **Still Lightweight**: Only +1-2 requests  
✅ **Privacy Conscious**: Batch events, no streaming  
✅ **Optional**: Can be disabled or configured  

## Next Steps

1. Integrate with AgentSession
2. Add event tracking throughout codebase
3. Set up analytics endpoint (or use local mode)
4. Configure rate limits based on tier
5. Monitor and optimize event tracking
6. Add dashboards for metrics visualization

## Testing

```typescript
// Test without network
const analytics = new AnalyticsManager(sessionId, {
  enabled: true,
  endpoint: undefined, // Offline mode
});

// Test batching
analytics.trackEvent("feature_used", { name: "test" });
console.log(analytics.getQueueSize()); // 1
analytics.trackEvent("feature_used", { name: "test2" });
console.log(analytics.getPendingEvents()); // Check queue

// Test performance
const perf = new PerformanceMonitor();
perf.startTimer("op1");
await delay(100);
perf.endTimer("test_operation", "op1");
console.log(perf.getStats("test_operation")); // Check metrics
```

## Questions & Future Work

- Should analytics be opt-in or opt-out by default?
- Should we integrate with Anthropic's dashboard?
- What additional metrics would be useful?
- Should we expose metrics via API or just locally?
