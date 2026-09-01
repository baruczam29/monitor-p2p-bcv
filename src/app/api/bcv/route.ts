import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

interface DolarApiResponse {
  compra: number;
  venta: number;
  promedio: number;
  fechaActualizacion: string;
}

interface CurrencyResult {
  compra: number | null;
  venta: number | null;
  promedio: number | null;
  fechaActualizacion: string | null;
  error: string | null;
}

interface FawazResponse {
  eur: Record<string, number>;
}

async function fetchWithTimeout(url: string, ms = 8000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(id);
  }
}

async function fetchRate(url: string): Promise<CurrencyResult> {
  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: DolarApiResponse = await res.json();
    return {
      compra: data.compra,
      venta: data.venta,
      promedio: data.promedio,
      fechaActualizacion: data.fechaActualizacion,
      error: null,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { compra: null, venta: null, promedio: null, fechaActualizacion: null, error: msg };
  }
}

async function fetchEurUsd(): Promise<number | null> {
  try {
    const res = await fetchWithTimeout(
      "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/eur.json"
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: FawazResponse = await res.json();
    return data.eur?.usd ?? null;
  } catch {
    return null;
  }
}

export async function GET() {
  const [usd, paralelo, eurUsdRate] = await Promise.all([
    fetchRate("https://ve.dolarapi.com/v1/dolares/oficial"),
    fetchRate("https://ve.dolarapi.com/v1/dolares/paralelo"),
    fetchEurUsd(),
  ]);

  let eur: CurrencyResult;
  if (usd.promedio && eurUsdRate) {
    const eurBcv = Math.round(usd.promedio * eurUsdRate * 100) / 100;
    eur = {
      compra: null,
      venta: null,
      promedio: eurBcv,
      fechaActualizacion: usd.fechaActualizacion,
      error: null,
    };
  } else {
    eur = { compra: null, venta: null, promedio: null, fechaActualizacion: null, error: "No se pudo calcular EUR" };
  }

  return NextResponse.json({ usd, paralelo, eur, eurUsdRate, fetchedAt: new Date().toISOString() });
}
