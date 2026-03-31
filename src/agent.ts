import { TradeIntent } from './types';
import axios from 'axios';
import { getOllamaModel } from './config';
import { parseIntentHeuristically } from './parser';

export class FinanceAgent {
  private ollamaUrl = 'http://127.0.0.1:11434/api/generate';
  private modelName: string;

  constructor(modelName: string = getOllamaModel()) {
    this.modelName = modelName;
  }

  public async generateIntent(prompt: string): Promise<TradeIntent> {
    console.log(`\n[Agent] Analyzing scenario/prompt via Ollama (${this.modelName}): "${prompt}"`);
    
    const systemInstruction = `You are an expert financial trading AI. 
Analyze the following user request and extract the correct trading intent.
You MUST respond ONLY with a raw JSON object exactly matching this schema:
{
  "action": "buy" | "sell",
  "symbol": "UPPERCASE_TICKER",
  "quantity": integer,
  "asset_class": "equity"
}
Do not output markdown code blocks (e.g. \`\`\`json). Just the raw JSON string.`;

    try {
      // Calling local Ollama via axios
      const response = await axios.post(this.ollamaUrl, {
        model: this.modelName,
        prompt: `${systemInstruction}\n\nUser Request: ${prompt}\n\nJSON Output:`,
        stream: false,
        format: 'json' // Tells Ollama to enforce JSON output
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

      const fallbackIntent = parseIntentHeuristically(prompt);
      console.log(`[Agent] Falling back to heuristic intent:`, JSON.stringify(fallbackIntent));
      return fallbackIntent;
    }
  }
}
