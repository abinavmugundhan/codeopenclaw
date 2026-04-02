import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import dotenv from 'dotenv';
import path from 'path';

import { FinanceAgent } from './agent';
import { PolicyEngine } from './policy';
import { Executor } from './executor';
import { AuditLogger } from './logger';
import { TradeLedger } from './ledger';

dotenv.config();

const POLICY_FILE = path.resolve(process.cwd(), 'policy.yaml');

// Initialize OpenClaw components
const agent = new FinanceAgent();
const ledger = new TradeLedger();
const policyEngine = new PolicyEngine(POLICY_FILE, ledger);
const executor = new Executor();
const logger = new AuditLogger();

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
          "Executes a natural language trading scenario through the OpenClaw Finance Agent. It will parse the intent, evaluate it against strict local YAML policies, and execute on Alpaca paper trading if allowed.",
        inputSchema: {
          type: "object",
          properties: {
            scenario: {
              type: "string",
              description: "The trading scenario in natural language, e.g. 'safely buy 1 share of AAPL'",
            },
            use_atomic_bot: {
              type: "boolean",
              description: "Whether to execute via Atomic Bot API instead of Alpaca (default: false)",
            },
            actor: {
              type: "string",
              description: "Optional agent role initiating the trade (e.g., analyst, trader, risk)",
            },
            delegated_limit: {
              type: "number",
              description: "Optional delegated max quantity; trade will be blocked if quantity exceeds this",
            },
          },
          required: ["scenario"],
        },
      },
      {
        name: "get_audit_logs",
        description: "Retrieves the recent audit logs of the OpenClaw Finance Agent to review executed, blocked, or skipped trades.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_atomic_bot_balance",
        description: "Retrieves the account balance from Atomic Bot API.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_atomic_bot_history",
        description: "Retrieves transaction history from Atomic Bot API.",
        inputSchema: {
          type: "object",
          properties: {
            symbol: {
              type: "string",
              description: "Optional symbol to filter history by (e.g. 'AAPL')",
            },
          },
        },
      },
      {
        name: "llm_to_atomic_bot",
        description: "Direct LLM-to-Atomic Bot API connection. The LLM generates the API call and executes it directly on Atomic Bot.",
        inputSchema: {
          type: "object",
          properties: {
            prompt: {
              type: "string",
              description: "Natural language trading request that the LLM will convert to Atomic Bot API call",
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
      // 1. Agent Reasoning -> Generates Intent Object
      const intent = await agent.generateIntent(scenario);
      // Optional overrides passed explicitly
      if (request.params.arguments?.actor) {
        intent.actor = String(request.params.arguments.actor);
      }
      if (request.params.arguments?.delegated_limit != null) {
        intent.delegated_limit = Number(request.params.arguments.delegated_limit);
      }
      logger.logIntent({ scenario, intent });

      // 2. Policy Engine Evaluation (Deterministic Enforcement)
      const evaluation = policyEngine.evaluateIntent(intent);
      logger.logPolicyDecision(intent, evaluation);
      
      // 3. Conditional Execution Based on Policy Engine Result
      if (evaluation.allowed) {
        if (useAtomicBot && !executor.atomicBot.isConfigured()) {
          logger.logExecution(intent, 'SKIPPED', 'Atomic Bot requested but not configured');
          return {
            content: [
              {
                type: "text",
                text: `✅ Intent ALLOWED by policies: ${JSON.stringify(intent)}\n⚠️ SKIPPED execution because Atomic Bot API key is not set in .env.`,
              },
            ],
          };
        } else if (!useAtomicBot && (!process.env.APCA_API_KEY_ID || process.env.APCA_API_KEY_ID === 'YOUR_PAPER_KEY')) {
          logger.logExecution(intent, 'SKIPPED', 'No Alpaca API Key set in .env');
          return {
            content: [
              {
                type: "text",
                text: `✅ Intent ALLOWED by policies: ${JSON.stringify(intent)}\n⚠️ SKIPPED execution because no real Alpaca API key is set in .env.`,
              },
            ],
          };
          } else {
          try {
             const receipt = await executor.executeTrade(intent, useAtomicBot);
             const orderId = 'order' in receipt ? receipt.order.id : receipt.response.transactionId;
             ledger.recordExecution(intent);
             logger.logExecution(intent, 'SUCCESS', { source: receipt.source, id: orderId });
             return {
              content: [
                {
                  type: "text",
                  text: `✅ Intent ALLOWED by policies: ${JSON.stringify(intent)}\n✅ Trade executed successfully via ${receipt.source}! Order ID: ${orderId}`,
                },
              ],
            };
          } catch (err: any) {
             logger.logExecution(intent, 'FAILED', err.message);
             return {
              content: [
                {
                  type: "text",
                  text: `✅ Intent ALLOWED by policies: ${JSON.stringify(intent)}\n❌ Trade execution failed: ${err.message}`,
                },
              ],
             };
          }
        }
      } else {
        logger.logExecution(intent, 'BLOCKED_BY_POLICY', evaluation);
        return {
          content: [
            {
              type: "text",
              text: `❌ Intent DENIED by policies: ${JSON.stringify(intent)}\nReason: ${evaluation.reason} (Policy ID: ${evaluation.failedPolicyId})`,
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
      
      // LLM directly calls Atomic Bot API
      const result = await agent.executeWithAtomicBot(prompt);
      
      // Log the interaction
      logger.logIntent({ scenario: prompt, intent: result.llmRequest });
      logger.logExecution(result.llmRequest, result.apiResponse.success ? 'SUCCESS' : 'FAILED', result.apiResponse);

      return {
        content: [
          {
            type: "text",
            text: `🤖 LLM-to-Atomic Bot Direct API Connection\n\n📝 User Request: "${prompt}"\n🔧 LLM Generated API Call: ${JSON.stringify(result.llmRequest)}\n📊 Atomic Bot Response: ${JSON.stringify(result.apiResponse)}`,
          },
        ],
      };
    } catch (error: any) {
      console.error(`[MCP] LLM-to-Atomic Bot API failed:`, error.message);
      return {
        content: [
          {
            type: "text",
            text: `❌ LLM-to-Atomic Bot API failed: ${error.message}`,
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
