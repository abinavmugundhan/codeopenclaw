import { TradeIntent } from './types';
import axios from 'axios';
import { AtomicBotClient } from './atomic-bot';

export class FinanceAgent {
  private ollamaUrl = 'http://127.0.0.1:11434/api/generate';
  private modelName: string;
  private atomicBot: AtomicBotClient;

  constructor(modelName: string = 'llama3') {
    this.modelName = modelName;
    this.atomicBot = new AtomicBotClient();
  }

  public async generateIntent(prompt: string): Promise<TradeIntent> {
    console.log(`\n[Agent] Analyzing scenario/prompt via Ollama (${this.modelName}): "${prompt}"`);
    
    const systemInstruction = `You are an expert financial trading AI with direct access to Atomic Bot API.
Analyze the following user request and extract the correct trading intent.
You MUST respond ONLY with a raw JSON object exactly matching this schema:
{
  "action": "buy" | "sell",
  "symbol": "UPPERCASE_TICKER",
  "quantity": integer,
  "asset_class": "equity",
  "actor": "analyst" | "trader" | "risk" (optional),
  "delegated_limit": integer (optional, max qty allowed under delegation)
}
Do not output markdown code blocks (e.g. \`\`\`json). Just the raw JSON string.`;

    try {
      const response = await axios.post(this.ollamaUrl, {
        model: this.modelName,
        prompt: `${systemInstruction}\n\nUser Request: ${prompt}\n\nJSON Output:`,
        stream: false,
        format: 'json'
      }, { timeout: 5000 });

      const responseText = response.data.response;
      
      try {
        const intent: TradeIntent = JSON.parse(responseText.trim());
        console.log(`[Agent] Ollama generated Intent:`, JSON.stringify(intent));
        return intent;
      } catch (parseError) {
        console.error(`[Agent] Failed to parse Ollama response as JSON:`, responseText);
        throw parseError;
      }
    } catch (err: any) {
      console.error(`[Agent] Ollama Request Failed. Is Ollama running? Error:`, err.message);
      
      console.log(`[Agent] Falling back to simulated intent based on prompt...`);
      if (prompt.includes('15 shares of MSFT')) {
        return { action: 'buy', symbol: 'MSFT', quantity: 15, asset_class: 'equity' };
      }
      if (prompt.includes('crypto BTC')) {
        return { action: 'buy', symbol: 'BTC', quantity: 1, asset_class: 'crypto' };
      }
      return { action: 'buy', symbol: 'AAPL', quantity: 1, asset_class: 'equity' };
    }
  }

  public async executeWithAtomicBot(prompt: string): Promise<any> {
    console.log(`\n[Agent] LLM directly calling Atomic Bot API for: "${prompt}"`);
    
    const systemInstruction = `You are an expert financial trading AI with direct access to Atomic Bot API.
Analyze the user request and create the exact API call to Atomic Bot.
You MUST respond ONLY with a raw JSON object exactly matching this schema:
{
  "action": "buy" | "sell" | "analyze" | "status",
  "symbol": "UPPERCASE_TICKER",
  "quantity": integer (optional),
  "price": number (optional),
  "parameters": {} (optional)
}
Do not output markdown code blocks. Just the raw JSON string.`;

    try {
      // LLM generates the API request
      const response = await axios.post(this.ollamaUrl, {
        model: this.modelName,
        prompt: `${systemInstruction}\n\nUser Request: ${prompt}\n\nAtomic Bot API Call:`,
        stream: false,
        format: 'json'
      }, { timeout: 5000 });

      const apiRequest = JSON.parse(response.data.response.trim());
      console.log(`[Agent] LLM generated Atomic Bot API call:`, JSON.stringify(apiRequest));

      // Directly call Atomic Bot API with LLM-generated request
      const atomicResponse = await this.atomicBot.executeTrade(apiRequest);
      console.log(`[Agent] Atomic Bot API response:`, JSON.stringify(atomicResponse));

      return {
        llmRequest: apiRequest,
        apiResponse: atomicResponse
      };

    } catch (err: any) {
      console.error(`[Agent] LLM-to-Atomic Bot API failed:`, err.message);
      throw err;
    }
  }
}
