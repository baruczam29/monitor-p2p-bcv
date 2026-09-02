import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const webhookUrl = process.env.GOOGLE_SHEET_WEBHOOK;
  if (!webhookUrl) {
    return NextResponse.json({ error: "GOOGLE_SHEET_WEBHOOK not configured" }, { status: 500 });
  }

  try {
    const payload = await request.json();
    payload.timestamp = new Date().toISOString();

    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      redirect: "manual",
    });

    // Google Apps Script executes doPost on the initial POST,
    // then responds with 302 redirect. The 302 means the script ran.
    if (res.status === 302 || res.status === 200) {
      return NextResponse.json({ ok: true, timestamp: payload.timestamp });
    }

    const text = await res.text().catch(() => "");
    return NextResponse.json({ error: `Webhook returned ${res.status}`, detail: text.slice(0, 200) }, { status: 502 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
