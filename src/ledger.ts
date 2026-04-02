import fs from 'fs';
import path from 'path';
import { TradeIntent } from './types';

type LedgerSnapshot = {
  date: string;
  totalQuantity: number;
  perSymbol: Record<string, number>;
};

/**
 * Lightweight local ledger to track daily executed quantities.
 * Keeps totals per calendar day (UTC) to enforce aggregate limits deterministically.
 */
export class TradeLedger {
  private ledgerFile: string;

  constructor(ledgerFile: string = path.resolve(process.cwd(), 'state', 'trade-ledger.json')) {
    this.ledgerFile = ledgerFile;
    this.ensureFile();
  }

  private ensureFile() {
    const dir = path.dirname(this.ledgerFile);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.ledgerFile)) {
      const today = this.currentDateKey();
      this.write({ date: today, totalQuantity: 0, perSymbol: {} });
    }
  }

  private currentDateKey(): string {
    return new Date().toISOString().substring(0, 10); // YYYY-MM-DD in UTC
  }

  private read(): LedgerSnapshot {
    try {
      const raw = fs.readFileSync(this.ledgerFile, 'utf8');
      return JSON.parse(raw) as LedgerSnapshot;
    } catch {
      const today = this.currentDateKey();
      return { date: today, totalQuantity: 0, perSymbol: {} };
    }
  }

  private write(snapshot: LedgerSnapshot) {
    fs.writeFileSync(this.ledgerFile, JSON.stringify(snapshot, null, 2), 'utf8');
  }

  /**
   * Returns the ledger snapshot for today; resets counts if the file is from a prior day.
   */
  public getToday(): LedgerSnapshot {
    const snap = this.read();
    const today = this.currentDateKey();
    if (snap.date !== today) {
      const fresh: LedgerSnapshot = { date: today, totalQuantity: 0, perSymbol: {} };
      this.write(fresh);
      return fresh;
    }
    return snap;
  }

  /**
   * Compute projected totals if the provided intent is executed.
   */
  public projectWith(intent: TradeIntent): { projectedTotal: number; projectedSymbolTotal: number } {
    const snap = this.getToday();
    const symbolQty = snap.perSymbol[intent.symbol] || 0;
    return {
      projectedTotal: snap.totalQuantity + intent.quantity,
      projectedSymbolTotal: symbolQty + intent.quantity,
    };
  }

  /**
   * Record a successfully executed trade into the ledger.
   */
  public recordExecution(intent: TradeIntent) {
    const snap = this.getToday();
    snap.totalQuantity += intent.quantity;
    snap.perSymbol[intent.symbol] = (snap.perSymbol[intent.symbol] || 0) + intent.quantity;
    this.write(snap);
  }
}
