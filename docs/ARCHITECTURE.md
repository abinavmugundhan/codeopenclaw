# OpenClaw Finance Agent – Architecture

## Overview
- **Reasoning:** `FinanceAgent` (LLM/Ollama) produces a structured `TradeIntent`.
- **Enforcement:** `PolicyEngine` consumes `TradeIntent` + `policy.yaml` + `TradeLedger` projections and deterministically ALLOW/DENY.
- **Execution:** `Executor` calls Alpaca paper trading (or Atomic Bot) only when allowed.
- **Evidence:** `AuditLogger` writes decisions to `audit.log`; `TradeLedger` keeps per-day state in `state/trade-ledger.json`.
- **Orchestration:** Exposed via MCP tools so OpenClaw (or any MCP client) can invoke with intent enforcement in-line.

## Policy Model
- Declarative YAML (`policy.yaml`) with named predicates mapped to code:
  - `asset_class_allowed`, `action_allowed`, `symbol_allowed`
  - `per_order_limit`, `per_symbol_daily_limit`, `daily_limit`
  - `market_hours`, `blackout_window`
  - `actor_allowed`, `delegation_limit`
- Limits section provides parameters; rules reference predicate names (no embedded JS).

## Ledger
- `TradeLedger` projects per-day totals before execution and records successful trades after execution.
- Supports aggregate and per-symbol caps; resets automatically each UTC day.

## MCP Tools
- `execute_trading_scenario(scenario, use_atomic_bot?, actor?, delegated_limit?)`
- `get_audit_logs`, `get_atomic_bot_balance`, `get_atomic_bot_history`, `llm_to_atomic_bot`
- All routes pass through policy evaluation before execution.

## Blocking Examples
- Oversized order (`per_order_limit`)
- Off-universe ticker (`symbol_allowed`)
- After-hours or blackout (`market_hours`, `blackout_window`)
- Delegation breach (`delegation_limit`)
- Per-symbol or daily aggregate breach (`per_symbol_daily_limit`, `daily_limit`)

## Allowed Path
1. MCP call → `FinanceAgent` → intent JSON
2. `PolicyEngine` evaluates predicates + ledger projections
3. If allowed: `Executor` hits Alpaca paper API → ledger record → audit log
4. If denied: audit log records denial with policy ID

## Demo Flow
- Run `npm run start` for canned scenarios (allowed + blocked).
- Run `npm run mcp` and call `execute_trading_scenario` for live demos with OpenClaw orchestration.
