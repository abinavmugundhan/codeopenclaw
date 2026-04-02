import axios from 'axios';
import { AtomicBotRequest, AtomicBotResponse } from './types';

export class AtomicBotClient {
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;

  constructor(apiKey?: string, baseUrl?: string, timeout: number = 10000) {
    this.apiKey = apiKey || process.env.ATOMIC_BOT_API_KEY || '';
    this.baseUrl = baseUrl || process.env.ATOMIC_BOT_BASE_URL || 'https://api.atomicbot.com/v1';
    this.timeout = timeout;
  }

  private async makeRequest(endpoint: string, data: AtomicBotRequest): Promise<AtomicBotResponse> {
    if (!this.apiKey) {
      throw new Error('Atomic Bot API key not configured. Please set ATOMIC_BOT_API_KEY environment variable.');
    }

    try {
      const response = await axios.post(
        `${this.baseUrl}${endpoint}`,
        data,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: this.timeout,
        }
      );

      return response.data as AtomicBotResponse;
    } catch (error: any) {
      console.error(`[AtomicBot] API request failed:`, error.message);
      
      if (error.response) {
        return {
          success: false,
          error: error.response.data?.message || `HTTP ${error.response.status}`,
          timestamp: new Date().toISOString(),
        };
      }
      
      return {
        success: false,
        error: error.message || 'Unknown error occurred',
        timestamp: new Date().toISOString(),
      };
    }
  }

  public async executeTrade(request: AtomicBotRequest): Promise<AtomicBotResponse> {
    console.log(`[AtomicBot] Executing trade: ${request.action.toUpperCase()} ${request.quantity || 'N/A'} ${request.symbol}`);
    return this.makeRequest('/trade', request);
  }

  public async analyzeMarket(request: AtomicBotRequest): Promise<AtomicBotResponse> {
    console.log(`[AtomicBot] Analyzing market for: ${request.symbol}`);
    return this.makeRequest('/analyze', request);
  }

  public async getStatus(request: AtomicBotRequest): Promise<AtomicBotResponse> {
    console.log(`[AtomicBot] Getting status for: ${request.symbol}`);
    return this.makeRequest('/status', request);
  }

  public async getBalance(): Promise<AtomicBotResponse> {
    console.log(`[AtomicBot] Getting account balance`);
    return this.makeRequest('/balance', { action: 'status', symbol: 'ACCOUNT' });
  }

  public async getTransactionHistory(symbol?: string): Promise<AtomicBotResponse> {
    console.log(`[AtomicBot] Getting transaction history${symbol ? ` for ${symbol}` : ''}`);
    return this.makeRequest('/history', { action: 'status', symbol: symbol || 'ALL' });
  }

  public isConfigured(): boolean {
    return !!this.apiKey;
  }
}
