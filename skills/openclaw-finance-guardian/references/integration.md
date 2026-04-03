# Local finance agent integration

## Repo surfaces

- MCP server entrypoint: `src/mcp-server.ts`
- API server entrypoint: `src/api-server.ts`
- Policy file: `policy.yaml`
- Audit logs: `audit.jsonl`, `audit.log`
- Demo scenarios: `src/index.ts`

## MCP tools

- `simulate_trading_scenario`
  - Safe path for demos and policy explanations.
  - Inputs: `scenario`, optional `actor`, optional `delegated_limit`, optional `simulate_after_hours`.
- `execute_trading_scenario`
  - Only for paper execution after policy approval.
  - Inputs: `scenario`, optional `use_atomic_bot`, optional `actor`, optional `delegated_limit`.
- `get_audit_logs`
- `get_atomic_bot_balance`
- `get_atomic_bot_history`
- `llm_to_atomic_bot`

## Expected flow

1. User gives a natural-language trade request.
2. `FinanceAgent` returns a JSON intent.
3. `PolicyEngine` evaluates the intent against `policy.yaml` and ledger state.
4. If the decision is `ALLOW`, the executor may call Alpaca paper trading or Atomic Bot.
5. If the decision is `DENY`, execution is blocked automatically.
6. `AuditLogger` writes the full trail to `audit.jsonl`.
