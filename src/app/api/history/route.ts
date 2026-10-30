import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface HistoryEntry {
  t: number;
  b: Record<string, [number | null, number | null]>;
  [key: string]: unknown;
}

interface ChunkResponse {
  data?: HistoryEntry[];
  totalRows?: number;
  error?: string;
}

const CHUNK_SIZE = 5000;
const MAX_CHUNKS = 3;

async function fetchChunk(
  webhookUrl: string,
  offset: number,
  signal: AbortSignal
): Promise<ChunkResponse> {
  try {
    const url = `${webhookUrl}?action=history&rows=${CHUNK_SIZE}&offset=${offset}`;
    const res = await fetch(url, { cache: "no-store", signal });
    if (!res.ok) return { data: [] };
    const text = await res.text();
    return JSON.parse(text);
  } catch {
    return { data: [] };
  }
}

export async function GET() {
  const webhookUrl = process.env.GOOGLE_SHEET_WEBHOOK;
  if (!webhookUrl) {
    return NextResponse.json({ data: [], error: "GOOGLE_SHEET_WEBHOOK not configured" });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const offsets = Array.from({ length: MAX_CHUNKS }, (_, i) => i * CHUNK_SIZE);
    const chunks = await Promise.all(
      offsets.map((offset) => fetchChunk(webhookUrl, offset, controller.signal))
    );
    clearTimeout(timeout);

    const allData: HistoryEntry[] = [];
    const seen = new Set<number>();
    for (const chunk of chunks) {
      if (chunk.data) {
        for (const entry of chunk.data) {
          if (!seen.has(entry.t)) {
            seen.add(entry.t);
            allData.push(entry);
          }
        }
      }
    }

    allData.sort((a, b) => a.t - b.t);

    const totalRows = chunks[0]?.totalRows ?? allData.length;

    return NextResponse.json({ data: allData, totalRows });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ data: [], error: msg }, { status: 500 });
  }
}
