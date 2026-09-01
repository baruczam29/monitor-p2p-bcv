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

export async function GET() {
  const [usd, paralelo] = await Promise.all([
    fetchRate("https://ve.dolarapi.com/v1/dolares/oficial"),
    fetchRate("https://ve.dolarapi.com/v1/dolares/paralelo"),
  ]);

  return NextResponse.json({ usd, paralelo, fetchedAt: new Date().toISOString() });
}
