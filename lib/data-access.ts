import { getMarketOverview, getUnifiedQuote } from "@/lib/services/marketDataService";
import type { LiveMarketQuote, MarketResponse } from "@/types/finance";

type DataEnvelope<T> = {
  data: T;
  source: string;
  toolsUsed: string[];
};

export async function getMarketSnapshot(force = false): Promise<DataEnvelope<MarketResponse>> {
  void force;

  const envelope = await getMarketOverview();

  return {
    data: envelope.data,
    source: `${envelope.source}://market-overview`,
    toolsUsed: ["marketDataService.getMarketOverview()"]
  };
}

export async function getMarketData(
  symbol: string,
  force = false
): Promise<DataEnvelope<LiveMarketQuote>> {
  void force;

  const normalized = symbol.trim().toUpperCase();
  const envelope = await getUnifiedQuote(normalized);
  const data: LiveMarketQuote = {
    symbol: envelope.data.symbol,
    price: envelope.data.price,
    change: envelope.data.change,
    percentChange: envelope.data.percentChange,
    volume: envelope.data.volume
  };

  return {
    data,
    source: `${envelope.source}://quote`,
    toolsUsed: [`marketDataService.getUnifiedQuote("${normalized}")`]
  };
}
