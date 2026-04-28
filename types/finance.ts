export type MarketMover = {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  volume: number;
  theme: string;
};

export type CandlePoint = {
  label: string;
  open: number;
  close: number;
  high: number;
  low: number;
};

export type MarketIndicators = {
  rsi: number;
  macd: number;
  signal: number;
};

export type WatchlistItem = {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  sparkline: number[];
  note: string;
};

export type MarketIndex = {
  name: string;
  value: number;
  change: number;
  changePct: number;
};

export type MarketResponse = {
  updatedAt: string;
  indices: MarketIndex[];
  trending: Array<{
    symbol: string;
    name: string;
    price: number;
    changePct: number;
    volume: number;
  }>;
  gainers: MarketMover[];
  losers: MarketMover[];
  candles: CandlePoint[];
  indicators: MarketIndicators;
  watchlist: WatchlistItem[];
};

export type LiveMarketQuote = {
  symbol: string;
  price: number | null;
  change: number | null;
  percentChange: number | null;
  volume: number | null;
};

export type LiveChartPoint = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type LiveIndexSnapshot = {
  name: string;
  value: number | null;
  change: number | null;
  percentChange: number | null;
};

export type LiveMutualFundSnapshot = {
  schemeCode: number;
  schemeName: string;
  nav: number | null;
  date: string;
};

export type LiveDataResponse = {
  symbol: string;
  price: number | null;
  change: number | null;
  percentChange: number | null;
  volume: number | null;
  timestamp: number;
  chartData: LiveChartPoint[];
  indices: LiveIndexSnapshot[];
  mutualFund: LiveMutualFundSnapshot | null;
  sourceStatus: {
    nse: "live" | "unavailable";
    yahoo: "live" | "unavailable";
    mfapi: "live" | "unavailable";
  };
};

export type NormalizedMarketData = {
  symbol: string;
  price: number | null;
  change: number | null;
  percentChange: number | null;
  volume: number | null;
  timestamp: number;
  source: "nse" | "yahoo";
};

export type PortfolioHolding = {
  symbol: string;
  assetName: string;
  quantity: number;
  buyPrice: number;
  currentPrice: number | null;
  investment: number;
  currentValue: number;
  profitLoss: number;
  returnsPercent: number;
  source: "nse" | "yahoo";
  timestamp: number;
};

export type PortfolioSnapshot = {
  holdings: PortfolioHolding[];
  totalInvestment: number;
  currentValue: number;
  profitLoss: number;
  returnsPercent: number;
  updatedAt: string;
};
