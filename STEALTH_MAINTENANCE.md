# Stealth Maintenance Guide: Pi vs. Claude Code

This guide outlines the process for verifying and maintaining stealth compatibility between `pi-mono` and official `@anthropic-ai/claude-code` releases. Use this when Anthropic releases a new version of Claude Code to ensure `pi` remains undetectable.

## 1. The Strategy

To remain undetectable, `pi` must mimic `claude-code`'s network footprint 1:1, specifically:
1.  **Headers**: User-Agent, beta flags, custom headers.
2.  **Telemetry**: Statsig events (`tengu_*`) and internal logging.
3.  **Call Order**: The sequence of init, prompt, and tool execution events.

## 2. Tooling Setup

We use a Node.js-based interceptor script to capture cleartext traffic from both tools without needing complex proxy setups.

Create `scripts/intercept.mjs` in your `pi-mono` repo:

```javascript
/**
 * scripts/intercept.mjs
 * Usage: node --import ./scripts/intercept.mjs <cli-path> [args]
 */
import fs from 'fs';
import path from 'path';
import https from 'https';

const LOG_FILE = path.resolve(process.cwd(), 'traffic.jsonl');
// Clear log on start
try { fs.unlinkSync(LOG_FILE); } catch(e) {}

const log = (type, data) => {
  fs.appendFileSync(LOG_FILE, JSON.stringify({
    timestamp: new Date().toISOString(),
    source: process.argv[1].includes('pi') ? 'pi' : 'claude',
    type,
    ...data
  }) + '\n');
};

// Patch global fetch (used by Claude Code and Pi)
const originalFetch = global.fetch;
global.fetch = async function(url, options = {}) {
  // Capture request
  log('request', {
    method: options.method || 'GET',
    url: url.toString(),
    headers: options.headers || {}
  });
  
  // Create a spy response
  const response = await originalFetch.apply(this, arguments);
  const clone = response.clone();
  
  // Capture response body asynchronously
  clone.text().then(text => {
    log('response', {
      url: url.toString(),
      status: response.status,
      bodyPreview: text.substring(0, 200)
    });
  }).catch(() => {});

  return response;
};

console.error(`[Interceptor] Logging traffic to ${LOG_FILE}`);
```

## 3. Capturing Traffic

Run identical prompts on both tools to generate comparable data.

**Prompt**: `"write 10 lines to /tmp/test.txt"`

### Capture Official Claude Code
```bash
# Install latest claude-code if needed
npm install -g @anthropic-ai/claude-code@latest

# Run with interceptor
node --import ./scripts/intercept.mjs \
  $(which claude) \
  -p "write 10 lines to /tmp/test.txt" \
  --print > claude-output.txt

# Rename log for comparison
mv traffic.jsonl claude-traffic.jsonl
```

### Capture Pi
```bash
# Build pi
npm run build -w @mariozechner/pi-coding-agent

# Run with interceptor
node --import ./scripts/intercept.mjs \
  ./packages/coding-agent/dist/cli.js \
  -p "write 10 lines to /tmp/test.txt" \
  --print > pi-output.txt

# Rename log for comparison
mv traffic.jsonl pi-traffic.jsonl
```

## 4. Comparison Checklist

Use `jq` or a text editor to compare `claude-traffic.jsonl` and `pi-traffic.jsonl`.

### ✅ Check 1: Headers (Critical)
Look at the `fetch` events to `api.anthropic.com`.

| Header | Expected Value (Example) | Location in Pi |
| :--- | :--- | :--- |
| `user-agent` | `claude-cli/2.1.2 (external, cli)` | `packages/ai/src/providers/anthropic.ts` |
| `anthropic-beta` | `claude-code-20250219,interleaved-thinking...` | `packages/ai/src/providers/anthropic.ts` |
| `anthropic-dangerous...` | `true` | `packages/ai/src/providers/anthropic.ts` |

**Action**: If versions differ, update `claudeCodeVersion` constant.

### ✅ Check 2: Telemetry Structure
Look for calls to `statsig.anthropic.com`.

Verify specific `tengu_*` events match:
- `tengu_init`: Startup metadata (check `version` and `betas`).
- `tengu_input_prompt`: Sent before inference.
- `tengu_tool_search_mode_decision`: Sent before tool usage.

**Action**: Update `packages/coding-agent/src/core/claude-telemetry.ts` if JSON structure changes.

### ✅ Check 3: Metadata
Ensure `env` and `user` blocks in the JSON payload look authentic.

- `userType`: "external"
- `entrypoint`: "sdk-cli"
- `platform`: Should match host OS (e.g., "darwin", "linux")

## 5. Codebase Reference

When updates are needed, here are the source files:

- **Telemetry Implementation**: 
  `packages/coding-agent/src/core/claude-telemetry.ts`
  *(Handles Statsig API formats and event payloads)*

- **Telemetry Integration & Hooks**:
  `packages/coding-agent/src/core/sdk.ts`
  *(Initializes telemetry)*
  
  `packages/coding-agent/src/core/agent-session.ts`
  *(Triggers prompt/tool events)*

- **API Headers & Protocol**:
  `packages/ai/src/providers/anthropic.ts`
  *(Defines User-Agent, Headers, and Beta flags)*

## 6. Quick Update Routine

1. **Bump Version**: Update `CLAUDE_CODE_VERSION` in `claude-telemetry.ts` and `claudeCodeVersion` in `anthropic.ts`.
2. **Check Betas**: Run `claude-code` and check if new items appeared in `anthropic-beta` header. Add them to `anthropic.ts`.
3. **Verify**: Run the capture steps above to confirm alignment.
