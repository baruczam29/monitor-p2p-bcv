import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const webhookUrl = process.env.GOOGLE_SHEET_WEBHOOK;
  if (!webhookUrl) {
    return NextResponse.json({ data: [], error: "GOOGLE_SHEET_WEBHOOK not configured" });
  }

  try {
    const url = `${webhookUrl}?action=history&rows=50000`;
    const res = await fetch(url, { cache: "no-store" });

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
