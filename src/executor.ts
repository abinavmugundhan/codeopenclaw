import Alpaca from '@alpacahq/alpaca-trade-api';
import { TradeIntent } from './types';
import { AtomicBotClient } from './atomic-bot';

export class Executor {
  private alpaca: any;
  public atomicBot: AtomicBotClient;

  constructor() {
    this.alpaca = new Alpaca({
      keyId: process.env.APCA_API_KEY_ID || 'dummy_key',
      secretKey: process.env.APCA_API_SECRET_KEY || 'dummy_secret',
      paper: true,
    });
    
    this.atomicBot = new AtomicBotClient();
  }

  public async executeTrade(intent: TradeIntent, useAtomicBot: boolean = false) {
    console.log(`[Executor] Executing trade via ${useAtomicBot ? 'Atomic Bot' : 'Alpaca'}: ${intent.action.toUpperCase()} ${intent.quantity} ${intent.symbol}`);
    
    if (useAtomicBot && this.atomicBot.isConfigured()) {
      return this.executeAtomicBotTrade(intent);
    } else {
      return this.executeAlpacaTrade(intent);
    }
  }

  private async executeAlpacaTrade(intent: TradeIntent) {
    try {
      const order = await this.alpaca.createOrder({
        symbol: intent.symbol,
        qty: intent.quantity,
        side: intent.action,
        type: 'market',
        time_in_force: 'gtc',
      });
      console.log(`[Executor] Alpaca order executed successfully: ${order.id}`);
      return { source: 'alpaca', order };
    } catch (e: any) {
      console.error(`[Executor] Failed to execute trade on Alpaca:`, e.message || e);
      throw e;
    }
  }

  private async executeAtomicBotTrade(intent: TradeIntent) {
    try {
      const response = await this.atomicBot.executeTrade({
        action: intent.action,
        symbol: intent.symbol,
        quantity: intent.quantity,
      });

      if (response.success) {
        console.log(`[Executor] Atomic Bot trade executed successfully: ${response.transactionId}`);
        return { source: 'atomic-bot', response };
      } else {
        console.error(`[Executor] Atomic Bot trade failed: ${response.error}`);
        throw new Error(response.error);
      }
    } catch (e: any) {
      console.error(`[Executor] Failed to execute trade via Atomic Bot:`, e.message || e);
      throw e;
    }
  }

  public async getAtomicBotBalance() {
    if (!this.atomicBot.isConfigured()) {
      throw new Error('Atomic Bot API not configured');
    }
    return this.atomicBot.getBalance();
  }

  public async getAtomicBotHistory(symbol?: string) {
    if (!this.atomicBot.isConfigured()) {
      throw new Error('Atomic Bot API not configured');
    }
    return this.atomicBot.getTransactionHistory(symbol);
  }
}
