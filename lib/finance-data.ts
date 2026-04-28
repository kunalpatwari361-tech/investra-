import type { MarketResponse } from "@/types/finance";

export const marketResponse: MarketResponse = {
  updatedAt: "2026-04-25T09:13:00+05:30",
  indices: [
    { name: "NIFTY 50", value: 24182.35, change: 188.4, changePct: 0.79 },
    { name: "SENSEX", value: 79642.18, change: 612.54, changePct: 0.77 },
    { name: "BANK NIFTY", value: 52984.7, change: -104.15, changePct: -0.2 },
    { name: "NIFTY IT", value: 38115.5, change: 421.9, changePct: 1.12 }
  ],
  trending: [
    { symbol: "BEL", name: "Bharat Electronics", price: 312.4, changePct: 3.42, volume: 5824000 },
    { symbol: "DLF", name: "DLF Ltd", price: 913.15, changePct: 2.88, volume: 3621400 },
    { symbol: "TRENT", name: "Trent Ltd", price: 4821.2, changePct: 2.14, volume: 1148300 }
  ],
  gainers: [
    { symbol: "COFORGE", name: "Coforge", price: 6541.2, changePct: 4.62, volume: 642300, theme: "IT momentum" },
    { symbol: "LTIM", name: "LTIMindtree", price: 5922.5, changePct: 3.95, volume: 721800, theme: "Large-cap tech" },
    { symbol: "INDIGO", name: "InterGlobe Aviation", price: 4721.8, changePct: 3.2, volume: 428900, theme: "Travel demand" }
  ],
  losers: [
    { symbol: "BPCL", name: "Bharat Petroleum", price: 284.35, changePct: -2.18, volume: 2108400, theme: "Energy pressure" },
    { symbol: "DIVISLAB", name: "Divi's Labs", price: 4210.6, changePct: -1.84, volume: 318200, theme: "Healthcare lag" },
    { symbol: "SBIN", name: "State Bank of India", price: 786.9, changePct: -1.22, volume: 2946100, theme: "Banking softness" }
  ],
  candles: [
    { label: "09:15", open: 24020, close: 24082, high: 24101, low: 23988 },
    { label: "10:00", open: 24084, close: 24126, high: 24140, low: 24060 },
    { label: "11:00", open: 24120, close: 24094, high: 24162, low: 24088 },
    { label: "12:00", open: 24092, close: 24148, high: 24173, low: 24082 },
    { label: "13:00", open: 24144, close: 24136, high: 24176, low: 24120 },
    { label: "14:00", open: 24138, close: 24182, high: 24202, low: 24125 }
  ],
  indicators: {
    rsi: 61.4,
    macd: 18.7,
    signal: 14.2
  },
  watchlist: [
    {
      symbol: "RELIANCE",
      name: "Reliance Industries",
      price: 2898.7,
      changePct: 1.31,
      sparkline: [2870, 2876, 2884, 2880, 2892, 2898],
      note: "Energy strength"
    },
    {
      symbol: "TCS",
      name: "Tata Consultancy Services",
      price: 3922.6,
      changePct: 0.88,
      sparkline: [3862, 3870, 3888, 3902, 3911, 3922],
      note: "Steady follow-through"
    },
    {
      symbol: "HDFCBANK",
      name: "HDFC Bank",
      price: 1712.3,
      changePct: 0.54,
      sparkline: [1694, 1698, 1702, 1708, 1710, 1712],
      note: "Range breakout watch"
    }
  ]
};
