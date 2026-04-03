import axios from 'axios';
import { AtomicBotClient } from './atomic-bot';
import { getLlmApiKey, getLlmModel, getLlmProvider, getOllamaBaseUrl, LlmProvider } from './config';
import { parseIntentHeuristically } from './parser';
import { TradeIntent } from './types';

export class FinanceAgent {
  private provider: LlmProvider;
  private ollamaUrl: string;
  private modelName: string;
  private atomicBot: AtomicBotClient;

  constructor(modelName?: string, provider: LlmProvider = getLlmProvider()) {
    this.provider = provider;
    this.ollamaUrl = getOllamaBaseUrl();
    this.modelName = modelName || getLlmModel(provider);
    this.atomicBot = new AtomicBotClient();
  }

  private getLogProviderLabel(): string {
    return `${this.provider}:${this.modelName}`;
  }

  private extractJsonText(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) {
      throw new Error('Model returned an empty response.');
    }

    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced?.[1]) {
      return fenced[1].trim();
    }

    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return trimmed.slice(firstBrace, lastBrace + 1).trim();
    }

    return trimmed;
  }

  private async requestStructuredJson(systemInstruction: string, prompt: string): Promise<string> {
    if (this.provider === 'openai' || this.provider === 'openrouter') {
      return this.requestOpenAiCompatibleJson(systemInstruction, prompt);
    }

    if (this.provider === 'anthropic') {
      return this.requestAnthropicJson(systemInstruction, prompt);
    }

    return this.requestOllamaJson(systemInstruction, prompt);
  }

  private async requestOllamaJson(systemInstruction: string, prompt: string): Promise<string> {
    const response = await axios.post(
      this.ollamaUrl,
      {
        model: this.modelName,
        prompt: `${systemInstruction}\n\nUser Request: ${prompt}\n\nJSON Output:`,
        stream: false,
        format: 'json',
      },
      { timeout: 10000 }
    );

    return this.extractJsonText(response.data.response || '');
  }

  private async requestOpenAiCompatibleJson(systemInstruction: string, prompt: string): Promise<string> {
    const apiKey = getLlmApiKey(this.provider);
    if (!apiKey) {
      throw new Error(`Missing ${this.provider.toUpperCase()} API key.`);
    }

    const url = this.provider === 'openrouter'
      ? 'https://openrouter.ai/api/v1/chat/completions'
      : 'https://api.openai.com/v1/chat/completions';

    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    };

    if (this.provider === 'openrouter') {
      headers['HTTP-Referer'] = 'https://openclaw-finance-agent.local';
      headers['X-Title'] = 'OpenClaw Finance Agent';
    }

    const response = await axios.post(
      url,
      {
        model: this.modelName,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: `User Request: ${prompt}\n\nJSON Output:` },
        ],
      },
      { headers, timeout: 15000 }
    );

    const content = response.data?.choices?.[0]?.message?.content;
    if (typeof content === 'string') {
      return this.extractJsonText(content);
    }
    if (Array.isArray(content)) {
      const text = content
        .map((part) => (typeof part?.text === 'string' ? part.text : ''))
        .join('\n');
      return this.extractJsonText(text);
    }

    throw new Error('OpenAI-compatible provider returned no message content.');
  }

  private async requestAnthropicJson(systemInstruction: string, prompt: string): Promise<string> {
    const apiKey = getLlmApiKey('anthropic');
    if (!apiKey) {
      throw new Error('Missing ANTHROPIC_API_KEY.');
    }

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: this.modelName,
        max_tokens: 300,
        temperature: 0,
        system: systemInstruction,
        messages: [
          {
            role: 'user',
            content: `User Request: ${prompt}\n\nJSON Output:`,
          },
        ],
      },
      {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        timeout: 15000,
      }
    );

    const content = response.data?.content;
    if (Array.isArray(content)) {
      const text = content
        .map((part) => (part?.type === 'text' ? part.text : ''))
        .join('\n');
      return this.extractJsonText(text);
    }

    throw new Error('Anthropic returned no text content.');
  }

  private normalizeIntent(intent: Partial<TradeIntent>, prompt: string): TradeIntent {
    const fallback = parseIntentHeuristically(prompt);
    const action = intent.action === 'sell' || intent.action === 'buy' ? intent.action : fallback.action;
    const symbol = (intent.symbol || fallback.symbol || 'AAPL').toUpperCase();
    const quantity = Number.isFinite(intent.quantity) && Number(intent.quantity) > 0
      ? Math.floor(Number(intent.quantity))
      : fallback.quantity;
    const assetClass = intent.asset_class || fallback.asset_class || 'equity';

    return {
      action,
      symbol,
      quantity,
      asset_class: assetClass,
      actor: intent.actor,
      delegated_limit: intent.delegated_limit,
      delegated_by: intent.delegated_by,
    };
  }

  public async generateIntent(prompt: string): Promise<TradeIntent> {
    console.log(`\n[Agent] Converting user prompt into JSON intent via ${this.getLogProviderLabel()}: "${prompt}"`);
    
    const systemInstruction = `You are the reasoning layer of a secure financial agent.
You DO NOT execute trades. You ONLY convert natural language into a structured intent for a separate policy layer.
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
      const responseText = await this.requestStructuredJson(systemInstruction, prompt);

      try {
        const parsed = JSON.parse(responseText.trim()) as Partial<TradeIntent>;
        const intent = this.normalizeIntent(parsed, prompt);
        console.log(`[Agent] Model generated Intent:`, JSON.stringify(intent));
        return intent;
      } catch (parseError) {
        console.error(`[Agent] Failed to parse model response as JSON:`, responseText);
        throw parseError;
      }
    } catch (err: any) {
      console.error(`[Agent] LLM request failed for ${this.getLogProviderLabel()}:`, err.message);
      
      const fallbackIntent = parseIntentHeuristically(prompt);
      console.log(`[Agent] Falling back to heuristic intent:`, JSON.stringify(fallbackIntent));
      return fallbackIntent;
    }
  }

  public async executeWithAtomicBot(prompt: string): Promise<any> {
    console.log(`\n[Agent] LLM directly calling Atomic Bot API via ${this.getLogProviderLabel()} for: "${prompt}"`);
    
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
      const responseText = await this.requestStructuredJson(systemInstruction, prompt);
      const apiRequest = JSON.parse(responseText.trim());
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
