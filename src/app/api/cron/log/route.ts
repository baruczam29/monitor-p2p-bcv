import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const BINANCE_URL = "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search";

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

interface DolarApiResponse {
  promedio: number;
  fechaActualizacion: string;
}

interface FawazResponse {
  eur: Record<string, number>;
}

const BANK_GROUPS = [
  { display: "Banesco", methods: ["Banesco"] },
  { display: "Mercantil", methods: ["Mercantil"] },
  { display: "Provincial / BBVA", methods: ["Provincial", "BBVA"] },
  { display: "BNC", methods: ["BNC Banco Nacional de Crédito"] },
  { display: "Bancamiga", methods: ["Bancamiga"] },
  { display: "BDT", methods: ["Banco Digital de los Trabajadores", "Banco del Tesoro"] },
  { display: "Banplus", methods: ["Banplus"] },
  { display: "Banco Plaza", methods: ["Banco Plaza", "Plaza"] },
  { display: "Banco Activo", methods: ["Banco Activo"] },
  { display: "BDV", methods: ["Banco de Venezuela", "Bank Transfer", "Pago Movil"] },
];

async function fetchWithTimeout(url: string, ms = 8000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(id);
  }
}

async function fetchP2pPage(page: number): Promise<BinanceAd[]> {
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
    if (!res.ok) return [];
    const data: BinanceResponse = await res.json();
    return data.data ?? [];
  } finally {
    clearTimeout(id);
  }
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const webhookUrl = process.env.GOOGLE_SHEET_WEBHOOK;
  if (!webhookUrl) {
    return NextResponse.json({ error: "GOOGLE_SHEET_WEBHOOK not configured" }, { status: 500 });
  }

  try {
    const pageNums = Array.from({ length: 10 }, (_, i) => i + 1);
    const [pages, usdRes, paraleloRes, eurUsdRes] = await Promise.all([
      Promise.all(pageNums.map(fetchP2pPage)),
      fetchWithTimeout("https://ve.dolarapi.com/v1/dolares/oficial").then((r) => r.ok ? r.json() as Promise<DolarApiResponse> : null).catch(() => null),
      fetchWithTimeout("https://ve.dolarapi.com/v1/dolares/paralelo").then((r) => r.ok ? r.json() as Promise<DolarApiResponse> : null).catch(() => null),
      fetchWithTimeout("https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/eur.json").then((r) => r.ok ? r.json() as Promise<FawazResponse> : null).catch(() => null),
    ]);

    const allAds = pages.flat();
    const bankMap = new Map<string, { prices: number[]; volume: number }>();
    let totalVolume = 0;

    for (const ad of allAds) {
      const price = parseFloat(ad.adv.price);
      const volume = parseFloat(ad.adv.surplusAmount);
      totalVolume += volume;
      for (const method of ad.adv.tradeMethods) {
        const entry = bankMap.get(method.tradeMethodName) ?? { prices: [], volume: 0 };
        entry.prices.push(price);
        entry.volume += volume;
        bankMap.set(method.tradeMethodName, entry);
      }
    }

    const timestamp = new Date().toISOString();
    const usdOficial = usdRes?.promedio ?? null;
    const usdParalelo = paraleloRes?.promedio ?? null;
    const eurUsdRate = eurUsdRes?.eur?.usd ?? null;
    const eurOficial = usdOficial && eurUsdRate ? Math.round(usdOficial * eurUsdRate * 100) / 100 : null;

    const bankRows = BANK_GROUPS.map((group) => {
      const matches: { prices: number[]; volume: number }[] = [];
      for (const method of group.methods) {
        const found = bankMap.get(method);
        if (found) matches.push(found);
      }
      if (matches.length === 0) {
        return { banco: group.display, mejorPrecio: null, promedio: null, anuncios: 0, volumen: 0 };
      }
      const allPrices = matches.flatMap((m) => m.prices);
      const totalAds = allPrices.length;
      const totalVol = matches.reduce((s, m) => s + m.volume, 0);
      const avg = allPrices.reduce((a, b) => a + b, 0) / totalAds;
      const best = Math.max(...allPrices);
      return {
        banco: group.display,
        mejorPrecio: Math.round(best * 100) / 100,
        promedio: Math.round(avg * 100) / 100,
        anuncios: totalAds,
        volumen: Math.round(totalVol * 100) / 100,
      };
    });

    const payload = {
      timestamp,
      usdOficial,
      usdParalelo,
      eurOficial,
      totalAnuncios: allAds.length,
      totalVolumenUsdt: Math.round(totalVolume * 100) / 100,
      bancos: bankRows,
    };

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json({ error: `Webhook failed: ${res.status}`, detail: text }, { status: 502 });
    }

    return NextResponse.json({ ok: true, timestamp, banks: bankRows.length });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
