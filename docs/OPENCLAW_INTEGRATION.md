# OpenClaw install and local connection

This guide keeps the setup simple and aligned with the current codebase.

## 1. Install OpenClaw

Use the official installer:

```bash
curl -fsSL https://openclaw.ai/install.sh | bash
```

On Windows, run that in WSL or Git Bash instead of plain PowerShell.

## 2. Verify the install

```bash
openclaw --version
openclaw doctor
```

## 3. Run onboarding

```bash
openclaw onboard
```

During onboarding:

- choose your model provider
- finish the local gateway setup
- set this repository as the workspace if prompted

## 4. Add your model provider key

You can enter the key during onboarding, or configure it afterward.

Examples:

```bash
setx OPENAI_API_KEY "your-openai-key"
setx ANTHROPIC_API_KEY "your-anthropic-key"
```

Open a new terminal after `setx` so the variables are available.

## 5. Start the OpenClaw gateway

If onboarding installed the daemon, verify it:

```bash
openclaw gateway status
```

If you want to run it manually:

```bash
openclaw gateway run
```

## 6. Point OpenClaw at this project

The simplest route is to use this repository as the OpenClaw workspace. This repo already contains a workspace skill under:

```text
skills/openclaw-finance-guardian/
```

If OpenClaw is already installed, set the workspace explicitly:

```bash
openclaw config set agents.defaults.workspace "D:/traindagent/openclaw-finance-agent"
```

Restart the gateway after changing the workspace:

```bash
openclaw gateway restart
```

## 7. Start the local trading MCP server

From this repository:

```bash
npm run mcp
```

This exposes the local finance agent as an MCP tool surface.

## 8. Example MCP config snippet

If you are manually wiring the local MCP server into an OpenClaw setup, use the example file in:

```text
docs/examples/openclaw-local-mcp.json
```

## 9. Expected request flow

1. OpenClaw receives the user request.
2. The workspace skill tells OpenClaw to call `simulate_trading_scenario` first.
3. The local agent converts the request into JSON intent.
4. The policy layer evaluates the intent and returns `ALLOW` or `DENY`.
5. Only if the user explicitly wants paper execution and the policy result is `ALLOW`, OpenClaw calls `execute_trading_scenario`.
6. The result and full trace are written to `audit.jsonl`.
