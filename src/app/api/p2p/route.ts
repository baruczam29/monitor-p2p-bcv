import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface BinanceAd {
  adv: {
    price: string;
    surplusAmount: string;
    tradeMethods: { tradeMethodName: string }[];
  };
}

interface BinanceResponse {
  data: BinanceAd[];
}

interface BankStats {
  banco: string;
  cantidadAnuncios: number;
  volumenDisponible: number;
  precioPromedio: number;
  score: number;
}

const BINANCE_URL = "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search";

async function fetchPage(page: number): Promise<BinanceAd[]> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(BINANCE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        asset: "USDT",
        fiat: "VES",
        tradeType: "SELL",
        page,
        rows: 20,
        payTypes: [],
        publisherType: null,
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Binance HTTP ${res.status}`);
    const data: BinanceResponse = await res.json();
    return data.data ?? [];
  } finally {
    clearTimeout(id);
  }
}

export async function GET() {
  try {
    const pages = await Promise.all([fetchPage(1), fetchPage(2), fetchPage(3)]);
    const allAds = pages.flat();

    const bankMap = new Map<string, { prices: number[]; volume: number }>();

    for (const ad of allAds) {
      const price = parseFloat(ad.adv.price);
      const volume = parseFloat(ad.adv.surplusAmount);
      for (const method of ad.adv.tradeMethods) {
        const name = method.tradeMethodName;
        const entry = bankMap.get(name) ?? { prices: [], volume: 0 };
        entry.prices.push(price);
        entry.volume += volume;
        bankMap.set(name, entry);
      }
    }

    const banks: BankStats[] = [];
    for (const [banco, data] of bankMap.entries()) {
      const avg = data.prices.reduce((a, b) => a + b, 0) / data.prices.length;
      banks.push({
        banco,
        cantidadAnuncios: data.prices.length,
        volumenDisponible: Math.round(data.volume * 100) / 100,
        precioPromedio: Math.round(avg * 100) / 100,
        score: 0,
      });
    }

    const maxCount = Math.max(...banks.map((b) => b.cantidadAnuncios), 1);
    const maxVolume = Math.max(...banks.map((b) => b.volumenDisponible), 1);

    for (const b of banks) {
      const normCount = b.cantidadAnuncios / maxCount;
      const normVol = b.volumenDisponible / maxVolume;
      b.score = normCount * 0.5 + normVol * 0.5;
    }

    banks.sort((a, b) => b.score - a.score);

    return NextResponse.json({
      banks,
      totalAds: allAds.length,
      totalBanks: bankMap.size,
      fetchedAt: new Date().toISOString(),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg, banks: [], totalAds: 0, totalBanks: 0, fetchedAt: null }, { status: 502 });
  }
}
