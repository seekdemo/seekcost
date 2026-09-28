import type {
  IBKRCashBalance,
  IBKRCashFlow,
  IBKRLot,
  IBKROpenPosition,
  IBKRParsedPreviewPayload,
  IBKRParsedRow,
} from "./types";

async function decodeFile(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const encodings = ["utf-8", "utf-8-sig", "gb18030", "gbk", "latin1"];

  for (const encoding of encodings) {
    try {
      const text = new TextDecoder(encoding, { fatal: false }).decode(bytes);
      if (text.includes("活动账单") || text.includes("Activity Statement") || text.includes("交易")) {
        return text;
      }
    } catch {
      // ignore and continue trying the next encoding
    }
  }

  return new TextDecoder().decode(bytes);
}

function parseCSVLine(line: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts.map((part) => part.trim());
}

function parseNumber(raw: string): number | null {
  if (!raw || raw === "-" || raw === "--") return null;
  const normalized = raw.trim().replaceAll(",", "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseTrades(text: string): { rows: IBKRParsedRow[]; totalTradeLines: number } {
  const lines = text.split(/\r?\n/);
  const rows: IBKRParsedRow[] = [];
  let totalTradeLines = 0;
  let inStockSection = false;
  let exchangeOffset = 0;

  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = parseCSVLine(line);
    if (parts.length < 4) continue;

    const section = parts[0];
    const rowType = parts[1];
    if (section !== "交易") continue;

    if (rowType === "Header") {
      const headerText = parts.join(",");
      inStockSection = headerText.includes("收盘价格");
      exchangeOffset = headerText.includes("交易所") ? 1 : 0;
      continue;
    }

    if (rowType !== "Data" || !inStockSection) continue;
    totalTradeLines += 1;

    const discriminator = parts[2] ?? "";
    const assetClass = parts[3] ?? "";
    if (discriminator !== "Order" || assetClass !== "股票") continue;

    const o = exchangeOffset;
    const currency = parts[4] ?? "USD";
    const symbol = (parts[5] ?? "").toUpperCase();
    const datetimeStr = parts[6] ?? "";
    const qty = parseNumber(parts[7 + o] ?? "");
    const price = parseNumber(parts[8 + o] ?? "");
    if (!symbol || symbol === "-" || qty == null || price == null || qty === 0) continue;

    const txType = qty > 0 ? "buy" : "sell";
    const closePrice = parseNumber(parts[9 + o] ?? "") ?? 0;
    const amount = parseNumber(parts[10 + o] ?? "") ?? 0;
    const commission = Math.abs(parseNumber(parts[11 + o] ?? "") ?? 0);
    const costBasis = Math.abs(parseNumber(parts[12 + o] ?? "") ?? 0);
    const realizedPnl = parseNumber(parts[13 + o] ?? "") ?? 0;
    const mtmPnl = parseNumber(parts[14 + o] ?? "") ?? 0;
    const tradeCodes = parts[15 + o] ?? "";
    const date = datetimeStr.includes(",") ? datetimeStr.split(",")[0].trim() : datetimeStr;

    rows.push({
      datetime_str: datetimeStr,
      date,
      tx_type: txType,
      symbol,
      quantity: Math.abs(qty),
      price: Math.abs(price),
      close_price: closePrice,
      currency,
      amount,
      commission,
      cost_basis: costBasis,
      realized_pnl: realizedPnl,
      mtm_pnl: mtmPnl,
      trade_codes: tradeCodes,
      description: `${symbol} ${txType.toUpperCase()} ${Math.abs(qty)}@${Math.abs(price)}`,
    });
  }

  return { rows, totalTradeLines };
}

function parseCashFlows(text: string): IBKRCashFlow[] {
  const flows: IBKRCashFlow[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parts = parseCSVLine(line);
    if (parts.length < 6) continue;
    if (parts[0] !== "存款和取款" || parts[1] !== "Data") continue;

    const currency = parts[2] ?? "";
    const date = parts[3] ?? "";
    const description = parts[4] ?? "";
    if (!date || currency.startsWith("总数")) continue;

    const amount = parseNumber(parts[5] ?? "");
    if (amount == null) continue;

    flows.push({
      date,
      currency,
      description,
      amount,
      flow_type: amount >= 0 ? "deposit" : "withdrawal",
    });
  }
  return flows;
}

function parseCashBalances(text: string): IBKRCashBalance[] {
  const byCurrency: Record<string, { ending_cash?: number; settled_cash?: number }> = {};

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parts = parseCSVLine(line);
    if (parts.length < 5) continue;
    if (parts[0] !== "现金报告" || parts[1] !== "Data") continue;

    const metric = parts[2] ?? "";
    const currency = (parts[3] ?? "").toUpperCase();
    if (!currency || currency === "基础货币总结" || currency.startsWith("总数")) continue;
    if (metric !== "期末现金" && metric !== "期末已结算现金") continue;

    const amount = parseNumber(parts[4] ?? "");
    if (amount == null) continue;

    byCurrency[currency] ??= {};
    if (metric === "期末现金") {
      byCurrency[currency].ending_cash = amount;
    } else {
      byCurrency[currency].settled_cash = amount;
    }
  }

  return Object.entries(byCurrency)
    .filter(([, value]) => value.ending_cash != null)
    .map(([currency, value]) => ({
      currency,
      ending_cash: value.ending_cash ?? 0,
      settled_cash: value.settled_cash ?? null,
    }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

function parseProductNames(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parts = parseCSVLine(line);
    if (parts.length < 5) continue;
    if (parts[0] !== "金融产品信息" || parts[1] !== "Data" || parts[2] !== "股票") continue;

    const symbol = (parts[3] ?? "").toUpperCase();
    const description = parts[4] ?? "";
    if (symbol && description) result[symbol] = description;
  }
  return result;
}

function parseRealizedBySymbol(text: string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parts = parseCSVLine(line);
    if (parts.length < 10) continue;
    if (parts[0] !== "已实现和未实现的表现总结" || parts[1] !== "Data") continue;
    if (parts[2] !== "股票") continue;
    const symbol = (parts[3] ?? "").toUpperCase();
    if (!symbol || symbol === "总数") continue;
    const realized = parseNumber(parts[9] ?? "");
    if (realized != null) result[symbol] = realized;
  }
  return result;
}

function parseOpenPositions(text: string): IBKROpenPosition[] {
  const positions: IBKROpenPosition[] = [];
  let hasOpenColumn = false;
  let currentSymbol = "";

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const parts = parseCSVLine(line);
    if (parts.length < 10) continue;
    if (parts[0] !== "未平仓持仓") continue;

    if (parts[1] === "Header") {
      hasOpenColumn = parts.join(",").includes("开盘");
      continue;
    }

    if (parts[1] !== "Data" || parts[3] !== "股票") continue;

    const discriminator = parts[2] ?? "";
    const currency = parts[4] ?? "USD";
    const symbol = (parts[5] ?? "").toUpperCase();
    const offset = hasOpenColumn ? 1 : 0;

    if (discriminator === "Summary") {
      currentSymbol = symbol;
      const quantity = parseNumber(parts[6 + offset] ?? "");
      const multiplier = parseNumber(parts[7 + offset] ?? "") ?? 1;
      const costPrice = parseNumber(parts[8 + offset] ?? "");
      const costBasis = parseNumber(parts[9 + offset] ?? "") ?? 0;
      const closePrice = parseNumber(parts[10 + offset] ?? "") ?? 0;
      const marketValue = parseNumber(parts[11 + offset] ?? "") ?? 0;
      const unrealizedPnl = parseNumber(parts[12 + offset] ?? "") ?? 0;
      if (!symbol || quantity == null || costPrice == null) continue;

      positions.push({
        symbol,
        currency,
        quantity,
        multiplier,
        cost_price: costPrice,
        cost_basis: costBasis,
        close_price: closePrice,
        market_value: marketValue,
        unrealized_pnl: unrealizedPnl,
        lots: [],
      });
      continue;
    }

    if (discriminator === "Lot" && hasOpenColumn && positions.length > 0 && positions[positions.length - 1]?.symbol === currentSymbol) {
      const lot: IBKRLot = {
        open_datetime: parts[6] ?? "",
        quantity: parseNumber(parts[7] ?? "") ?? 0,
        cost_price: parseNumber(parts[9] ?? "") ?? 0,
        cost_basis: parseNumber(parts[10] ?? "") ?? 0,
        close_price: parseNumber(parts[11] ?? "") ?? 0,
        market_value: parseNumber(parts[12] ?? "") ?? 0,
        unrealized_pnl: parseNumber(parts[13] ?? "") ?? 0,
      };
      if (lot.quantity > 0 && lot.cost_price > 0) {
        positions[positions.length - 1].lots.push(lot);
      }
    }
  }

  return positions;
}

export async function parseIBKRActivityStatement(file: File): Promise<IBKRParsedPreviewPayload> {
  const text = await decodeFile(file);
  if (!text.includes("活动账单") && !text.includes("Activity Statement")) {
    throw new Error("请上传 IBKR 活动报表 (Activity Statement)");
  }

  const { rows, totalTradeLines } = parseTrades(text);
  if (rows.length === 0) {
    throw new Error("未找到股票交易记录，请确认报表包含股票交易 section");
  }

  return {
    total_trade_lines: totalTradeLines,
    rows,
    cash_flows: parseCashFlows(text),
    cash_balances: parseCashBalances(text),
    open_positions: parseOpenPositions(text),
    realized_by_symbol: parseRealizedBySymbol(text),
    product_names: parseProductNames(text),
  };
}
