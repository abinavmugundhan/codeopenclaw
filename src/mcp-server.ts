import dotenv from 'dotenv';
import path from 'path';
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { FinanceAgent } from './agent';
import { PolicyEngine } from './policy';
import { Executor } from './executor';
import { AuditLogger } from './logger';
import { TradeLedger } from './ledger';
import { ExecutionRecord } from './types';

dotenv.config();

const POLICY_FILE = path.resolve(process.cwd(), 'policy.yaml');

// Initialize OpenClaw-facing components.
const agent = new FinanceAgent();
const ledger = new TradeLedger();
const policyEngine = new PolicyEngine(POLICY_FILE, ledger);
const executor = new Executor();
const logger = new AuditLogger();

async function evaluateScenario(params: {
  scenario: string;
  actor?: string;
  delegatedLimit?: number;
  simulateAfterHours?: boolean;
}) {
  const intent = await agent.generateIntent(params.scenario);
  if (params.actor) {
    intent.actor = params.actor;
  }
  if (params.delegatedLimit != null) {
    intent.delegated_limit = params.delegatedLimit;
  }

  const intentId = logger.logIntent(params.scenario, intent);
  const evaluation = policyEngine.evaluateIntent(
    intent,
    params.simulateAfterHours ? { now: new Date(Date.UTC(2024, 0, 1, 1, 0, 0)) } : undefined
  );
  logger.logPolicyDecision(intentId, evaluation);

  return { intent, intentId, evaluation };
}

const server = new Server(
  {
    name: "openclaw-finance-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "execute_trading_scenario",
        description:
          "Parse a trading request, enforce YAML policies, and execute via Alpaca paper trading or Atomic Bot only if the decision is ALLOW.",
        inputSchema: {
          type: "object",
          properties: {
            scenario: {
              type: "string",
              description: "Trading scenario in natural language, for example 'buy 1 share of AAPL'",
            },
            use_atomic_bot: {
              type: "boolean",
              description: "Execute via Atomic Bot instead of Alpaca.",
            },
            actor: {
              type: "string",
              description: "Optional role initiating the request, such as analyst or trader.",
            },
            delegated_limit: {
              type: "number",
              description: "Optional delegated maximum quantity.",
            },
          },
          required: ["scenario"],
        },
      },
      {
        name: "simulate_trading_scenario",
        description:
          "Run the full reasoning and policy enforcement flow without executing any trade. Use this for safe demos and explanations.",
        inputSchema: {
          type: "object",
          properties: {
            scenario: {
              type: "string",
              description: "Trading scenario in natural language.",
            },
            actor: {
              type: "string",
              description: "Optional role initiating the request.",
            },
            delegated_limit: {
              type: "number",
              description: "Optional delegated maximum quantity.",
            },
            simulate_after_hours: {
              type: "boolean",
              description: "Force evaluation in an after-hours context for demos.",
            },
          },
          required: ["scenario"],
        },
      },
      {
        name: "get_audit_logs",
        description: "Retrieve the recent audit log tail for traceability.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_atomic_bot_balance",
        description: "Retrieve the account balance from Atomic Bot.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_atomic_bot_history",
        description: "Retrieve transaction history from Atomic Bot.",
        inputSchema: {
          type: "object",
          properties: {
            symbol: {
              type: "string",
              description: "Optional symbol filter, for example 'AAPL'.",
            },
          },
        },
      },
      {
        name: "llm_to_atomic_bot",
        description:
          "Generate an Atomic Bot request from natural language, but still enforce the same policy layer before any execution.",
        inputSchema: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "Natural-language trading request.",
            },
          },
          required: ["prompt"],
        },
      }
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "execute_trading_scenario") {
    const scenario = String(request.params.arguments?.scenario);
    const useAtomicBot = Boolean(request.params.arguments?.use_atomic_bot) || false;

    if (!scenario) {
      throw new Error("Scenario is required");
    }

    try {
      const { intent, intentId, evaluation } = await evaluateScenario({
        scenario,
        actor: request.params.arguments?.actor ? String(request.params.arguments.actor) : undefined,
        delegatedLimit: request.params.arguments?.delegated_limit != null
          ? Number(request.params.arguments.delegated_limit)
          : undefined,
      });

      if (evaluation.decision !== 'ALLOW') {
        logger.logExecution(intentId, { status: 'BLOCKED', details: evaluation });
        const topReason = evaluation.reasons.find((reason) => reason.result === 'FAIL');
        return {
          content: [
            {
              type: "text",
              text: `DENY: ${JSON.stringify(intent)}\nReason: ${topReason?.message || evaluation.failedPolicyId || 'Policy failure'}`,
            },
          ],
        };
      }

      if (useAtomicBot && !executor.atomicBot.isConfigured()) {
        logger.logExecution(intentId, { status: 'SKIPPED', details: 'Atomic Bot requested but not configured' });
        return {
          content: [
            {
              type: "text",
              text: `ALLOW: ${JSON.stringify(intent)}\nSKIPPED: Atomic Bot API key is not set in .env.`,
            },
          ],
        };
      }

      if (!useAtomicBot && (!process.env.APCA_API_KEY_ID || process.env.APCA_API_KEY_ID === 'YOUR_PAPER_KEY')) {
        logger.logExecution(intentId, { status: 'SKIPPED', details: 'No Alpaca API key set in .env' });
        return {
          content: [
            {
              type: "text",
              text: `ALLOW: ${JSON.stringify(intent)}\nSKIPPED: No real Alpaca API key is set in .env.`,
            },
          ],
        };
      }

      try {
        const receipt = await executor.executeTrade(intent, useAtomicBot);
        const orderId = 'order' in receipt ? receipt.order.id : receipt.response.transactionId;
        ledger.recordExecution(intent);
        logger.logExecution(intentId, { status: 'SUCCESS', backend: receipt.source, details: { id: orderId } });
        return {
          content: [
            {
              type: "text",
              text: `ALLOW: ${JSON.stringify(intent)}\nSUCCESS: Trade executed via ${receipt.source}. Order ID: ${orderId}`,
            },
          ],
        };
      } catch (err: any) {
        logger.logExecution(intentId, { status: 'FAILED', details: err.message });
        return {
          content: [
            {
              type: "text",
              text: `ALLOW: ${JSON.stringify(intent)}\nFAILED: Trade execution failed: ${err.message}`,
            },
          ],
        };
      }
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error processing scenario: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  if (request.params.name === "simulate_trading_scenario") {
    const scenario = String(request.params.arguments?.scenario);
    if (!scenario) {
      throw new Error("Scenario is required");
    }

    try {
      const { intent, intentId, evaluation } = await evaluateScenario({
        scenario,
        actor: request.params.arguments?.actor ? String(request.params.arguments.actor) : undefined,
        delegatedLimit: request.params.arguments?.delegated_limit != null
          ? Number(request.params.arguments.delegated_limit)
          : undefined,
        simulateAfterHours: Boolean(request.params.arguments?.simulate_after_hours),
      });

      const execution: ExecutionRecord = evaluation.decision === 'ALLOW'
        ? { status: 'SKIPPED', details: 'Simulation only; no execution attempted.' }
        : { status: 'BLOCKED', details: evaluation };
      logger.logExecution(intentId, execution);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              scenario,
              intent,
              evaluation,
              execution,
            }, null, 2),
          },
        ],
      };
    } catch (error: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error simulating scenario: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  if (request.params.name === "get_audit_logs") {
    try {
      const fs = require('fs');
      const logs = fs.readFileSync(path.resolve(process.cwd(), 'audit.log'), 'utf8');
      return {
        content: [
          {
            type: "text",
            text: logs.length > 5000 ? logs.substring(logs.length - 5000) : logs,
          },
        ],
      };
    } catch (e: any) {
      return {
        content: [{ type: "text", text: `Error reading audit log: ${e.message}` }],
      };
    }
  }

  if (request.params.name === "get_atomic_bot_balance") {
    try {
      const balance = await executor.getAtomicBotBalance();
      return {
        content: [
          {
            type: "text",
            text: `Atomic Bot Balance: ${JSON.stringify(balance)}`,
          },
        ],
      };
    } catch (e: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error getting Atomic Bot balance: ${e.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  if (request.params.name === "get_atomic_bot_history") {
    try {
      const symbol = request.params.arguments?.symbol as string;
      const history = await executor.getAtomicBotHistory(symbol);
      return {
        content: [
          {
            type: "text",
            text: `Atomic Bot Transaction History: ${JSON.stringify(history)}`,
          },
        ],
      };
    } catch (e: any) {
      return {
        content: [
          {
            type: "text",
            text: `Error getting Atomic Bot history: ${e.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  if (request.params.name === "llm_to_atomic_bot") {
    const prompt = String(request.params.arguments?.prompt);
    if (!prompt) {
      throw new Error("Prompt is required");
    }

    try {
      console.log(`[MCP] Direct LLM-to-Atomic Bot API request: "${prompt}"`);
      const { intent, intentId, evaluation } = await evaluateScenario({ scenario: prompt });

      if (evaluation.decision !== 'ALLOW') {
        logger.logExecution(intentId, { status: 'BLOCKED', details: evaluation });
        return {
          content: [
            {
              type: "text",
              text: `DENY: First failing rule: ${evaluation.reasons.find((reason) => reason.result === 'FAIL')?.rule ?? evaluation.failedPolicyId}`,
            },
          ],
        };
      }

      if (!executor.atomicBot.isConfigured()) {
        logger.logExecution(intentId, { status: 'SKIPPED', details: 'Atomic Bot not configured' });
        return {
          content: [
            {
              type: "text",
              text: `ALLOW: ${JSON.stringify(intent)}\nSKIPPED: Atomic Bot is not configured.`,
            },
          ],
        };
      }

      const result = await agent.executeWithAtomicBot(prompt);
      logger.logExecution(intentId, {
        status: result.apiResponse.success ? 'SUCCESS' : 'FAILED',
        backend: 'atomic-bot',
        details: result.apiResponse,
      });

      return {
        content: [
          {
            type: "text",
            text: `LLM-to-Atomic Bot Direct API Connection\n\nUser Request: "${prompt}"\nGenerated API Call: ${JSON.stringify(result.llmRequest)}\nAtomic Bot Response: ${JSON.stringify(result.apiResponse)}`,
          },
        ],
      };
    } catch (error: any) {
      console.error(`[MCP] LLM-to-Atomic Bot API failed:`, error.message);
      return {
        content: [
          {
            type: "text",
            text: `FAILED: LLM-to-Atomic Bot API failed: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }

  throw new Error("Unknown tool");
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("OpenClaw Finance MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
