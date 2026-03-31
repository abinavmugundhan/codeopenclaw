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
import { getOllamaModel } from './config';

const PROJECT_ROOT = path.resolve(__dirname, '..');
dotenv.config({ path: path.resolve(PROJECT_ROOT, '.env') });

const POLICY_FILE = path.resolve(PROJECT_ROOT, 'policy.yaml');

const agent = new FinanceAgent();
const policyEngine = new PolicyEngine(POLICY_FILE);
const executor = new Executor();
const logger = new AuditLogger(PROJECT_ROOT);

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
          "Executes a natural language trading scenario through the OpenClaw Finance Agent. It parses intent, evaluates strict local YAML policies, and executes on Alpaca paper trading if allowed.",
        inputSchema: {
          type: "object",
          properties: {
            scenario: {
              type: "string",
              description: "The trading scenario in natural language, e.g. 'safely buy 1 share of AAPL'",
            },
          },
          required: ["scenario"],
        },
      },
      {
        name: "get_audit_logs",
        description: "Retrieves recent audit logs to review executed, blocked, or skipped trades.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "get_agent_status",
        description: "Returns local runtime status including configured model, policy path, and whether Alpaca execution is enabled.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      }
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "execute_trading_scenario") {
    const scenario = String(request.params.arguments?.scenario);
    if (!scenario) {
      throw new Error("Scenario is required");
    }

    try {
      const intent = await agent.generateIntent(scenario);
      logger.logIntent({ scenario, intent });

      const evaluation = policyEngine.evaluateIntent(intent);
      logger.logPolicyDecision(intent, evaluation);
      
      if (evaluation.allowed) {
        if (!executor.isConfigured()) {
          logger.logExecution(intent, 'SKIPPED', 'No Alpaca API credentials set in .env');
          return {
            content: [
              {
                type: "text",
                text: `Intent ALLOWED by policies: ${JSON.stringify(intent)}\nSKIPPED execution because Alpaca paper trading credentials are not configured.`,
              },
            ],
          };
        }

        try {
          const receipt = await executor.executeTrade(intent);
          logger.logExecution(intent, 'SUCCESS', { id: receipt.id });
          return {
            content: [
              {
                type: "text",
                text: `Intent ALLOWED by policies: ${JSON.stringify(intent)}\nTrade executed successfully on Alpaca. Order ID: ${receipt.id}`,
              },
            ],
          };
        } catch (err: any) {
          logger.logExecution(intent, 'FAILED', err.message);
          return {
            content: [
              {
                type: "text",
                text: `Intent ALLOWED by policies: ${JSON.stringify(intent)}\nTrade execution on Alpaca failed: ${err.message}`,
              },
            ],
          };
        }
      }

      logger.logExecution(intent, 'BLOCKED_BY_POLICY', evaluation);
      return {
        content: [
          {
            type: "text",
            text: `Intent DENIED by policies: ${JSON.stringify(intent)}\nReason: ${evaluation.reason} (Policy ID: ${evaluation.failedPolicyId})`,
          },
        ],
      };
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
      const logs = fs.readFileSync(path.resolve(PROJECT_ROOT, 'audit.log'), 'utf8');
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

  if (request.params.name === "get_agent_status") {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              projectRoot: PROJECT_ROOT,
              policyFile: POLICY_FILE,
              ollamaModel: getOllamaModel(),
              alpacaExecutionEnabled: executor.isConfigured(),
            },
            null,
            2
          ),
        },
      ],
    };
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
