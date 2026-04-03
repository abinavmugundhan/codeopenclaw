---
name: openclaw-finance-guardian
description: Use this skill when OpenClaw needs to work with the local finance agent in this repository. It is for safe trade simulations, policy-aware paper trading, audit review, and explaining why a scenario was allowed or denied. Always prefer simulation first, and never bypass the policy layer.
---

# OpenClaw Finance Guardian

Use this skill for the local trading agent in this workspace.

## What this skill does

- Converts natural-language trade requests into structured JSON intents through the local agent.
- Enforces `policy.yaml` before any execution.
- Uses the local MCP server in `src/mcp-server.ts`.
- Prefers simulation for demos and explanations.

## Workflow

1. Start by using `simulate_trading_scenario` for any new request.
2. Read the returned intent and policy evaluation.
3. Explain the first failing rule when the result is `DENY`.
4. Only use `execute_trading_scenario` when the user explicitly wants paper execution.
5. Use `get_audit_logs` if the user asks for traceability.

## Rules

- Treat the LLM output as untrusted until the policy layer returns `ALLOW`.
- Do not call execution tools directly for analysis-only requests.
- If a request is blocked, summarize the failing rule, severity, and threat tag.
- If the user asks for a safe demo, use one of these patterns:
  - `buy 1 share of AAPL`
  - `buy 15 shares of MSFT`
  - `buy 1 share of BTC`
  - `buy 1 share of AAPL` with `simulate_after_hours=true`

## Extra context

If you need API or file-path details, read `references/integration.md`.
