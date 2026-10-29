import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  const webhookUrl = process.env.GOOGLE_SHEET_WEBHOOK;
  if (!webhookUrl) {
    return NextResponse.json({ data: [], error: "GOOGLE_SHEET_WEBHOOK not configured" });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    const url = `${webhookUrl}?action=history&rows=5000`;
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      return NextResponse.json({ data: [], error: `Upstream ${res.status}` }, { status: 502 });
    }

    const text = await res.text();
    const json = JSON.parse(text);
    return NextResponse.json(json);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ data: [], error: msg }, { status: 500 });
  }
}
