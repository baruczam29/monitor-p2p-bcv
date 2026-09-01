"use client";

import { useEffect, useState, useCallback, useRef } from "react";

interface CurrencyData {
  compra: number | null;
  venta: number | null;
  promedio: number | null;
  fechaActualizacion: string | null;
  error: string | null;
}

interface BcvResponse {
  usd: CurrencyData;
  paralelo: CurrencyData;
  fetchedAt: string;
}

interface BankStats {
  banco: string;
  cantidadAnuncios: number;
  volumenDisponible: number;
  precioPromedio: number;
  score: number;
}

interface P2pResponse {
  top10: BankStats[];
  totalAds: number;
  totalBanks: number;
  fetchedAt: string | null;
  error?: string;
}

function formatBs(n: number | null): string {
  if (n === null) return "—";
  return n.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-VE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className="inline-block w-3 h-3 rounded-full"
      style={{ backgroundColor: ok ? "#22c55e" : "#ef4444" }}
    />
  );
}

export default function Home() {
  const [bcv, setBcv] = useState<BcvResponse | null>(null);
  const [p2p, setP2p] = useState<P2pResponse | null>(null);
  const [bcvOk, setBcvOk] = useState(true);
  const [p2pOk, setP2pOk] = useState(true);
  const [lastBcvTime, setLastBcvTime] = useState<string | null>(null);
  const [lastP2pTime, setLastP2pTime] = useState<string | null>(null);
  const [clock, setClock] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchBcv = useCallback(async () => {
    try {
      const res = await fetch("/api/bcv");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: BcvResponse = await res.json();
      setBcv(data);
      setBcvOk(true);
      setLastBcvTime(new Date().toLocaleTimeString("es-VE"));
    } catch {
      setBcvOk(false);
    }
  }, []);

  const fetchP2p = useCallback(async () => {
    try {
      const res = await fetch("/api/p2p");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: P2pResponse = await res.json();
      if (data.error) throw new Error(data.error);
      setP2p(data);
      setP2pOk(true);
      setLastP2pTime(new Date().toLocaleTimeString("es-VE"));
    } catch {
      setP2pOk(false);
    }
  }, []);

  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString("es-VE", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    fetchBcv();
    fetchP2p();
    intervalRef.current = setInterval(() => {
      fetchBcv();
      fetchP2p();
    }, 60_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchBcv, fetchP2p]);

  return (
    <main className="flex-1 p-4 md:p-8 max-w-6xl mx-auto w-full">
      {/* Header */}
      <header className="flex items-center justify-between mb-8">
        <h1 className="text-2xl md:text-4xl font-bold tracking-tight">
          Monitor P2P &amp; BCV
        </h1>
        <div className="text-2xl md:text-4xl font-mono tabular-nums" style={{ color: "#3b82f6" }}>
          {clock}
        </div>
      </header>

      {/* BCV Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <BcvCard label="USD Oficial" flag="🏛️" data={bcv?.usd ?? null} accentColor="#22c55e" />
        <BcvCard label="USD Paralelo" flag="📊" data={bcv?.paralelo ?? null} accentColor="#f59e0b" />
      </div>

      {/* P2P Table */}
      <section
        className="rounded-xl border p-4 md:p-6 mb-8"
        style={{ backgroundColor: "#131926", borderColor: "#1e293b" }}
      >
        <h2 className="text-lg md:text-xl font-semibold mb-4">
          Top 10 bancos &middot; Binance P2P (USDT &rarr; VES, venta)
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm md:text-base">
            <thead>
              <tr className="text-left border-b" style={{ borderColor: "#1e293b", color: "#64748b" }}>
                <th className="py-2 pr-4 w-10">#</th>
                <th className="py-2 pr-4">Banco</th>
                <th className="py-2 pr-4 text-right">Precio venta prom. (Bs)</th>
                <th className="py-2 pr-4 text-right">Anuncios</th>
                <th className="py-2 text-right">Volumen (USDT)</th>
              </tr>
            </thead>
            <tbody>
              {p2p && p2p.top10.length > 0 ? (
                p2p.top10.map((b, i) => (
                  <tr key={b.banco} className="border-b" style={{ borderColor: "#1e293b" }}>
                    <td className="py-3 pr-4 font-mono" style={{ color: "#64748b" }}>
                      {i + 1}
                    </td>
                    <td className="py-3 pr-4 font-medium">{b.banco}</td>
                    <td className="py-3 pr-4 text-right font-mono" style={{ color: "#f59e0b" }}>
                      {formatBs(b.precioPromedio)}
                    </td>
                    <td className="py-3 pr-4 text-right font-mono">{b.cantidadAnuncios}</td>
                    <td className="py-3 text-right font-mono">
                      {b.volumenDisponible.toLocaleString("es-VE", { maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-8 text-center" style={{ color: "#64748b" }}>
                    {p2p?.error ? `Error: ${p2p.error}` : "Cargando datos P2P…"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {p2p && !p2p.error && (
          <p className="text-xs mt-3" style={{ color: "#64748b" }}>
            {p2p.totalAds} anuncios analizados de {p2p.totalBanks} métodos de pago
          </p>
        )}
      </section>

      {/* Status bar */}
      <footer
        className="rounded-xl border px-4 py-3 flex flex-wrap items-center gap-4 text-sm"
        style={{ backgroundColor: "#131926", borderColor: "#1e293b", color: "#64748b" }}
      >
        <span className="flex items-center gap-2">
          <StatusDot ok={bcvOk} /> BCV {lastBcvTime ? `· ${lastBcvTime}` : ""}
        </span>
        <span className="flex items-center gap-2">
          <StatusDot ok={p2pOk} /> P2P {lastP2pTime ? `· ${lastP2pTime}` : ""}
        </span>
        <span className="ml-auto text-xs">Actualización automática cada 60s</span>
      </footer>
    </main>
  );
}

function BcvCard({
  label,
  flag,
  data,
  accentColor = "#22c55e",
}: {
  label: string;
  flag: string;
  data: CurrencyData | null;
  accentColor?: string;
}) {
  return (
    <div className="rounded-xl border p-4 md:p-6" style={{ backgroundColor: "#131926", borderColor: "#1e293b" }}>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-2xl">{flag}</span>
        <h2 className="text-lg font-semibold">{label}</h2>
        {data?.error && (
          <span
            className="text-xs px-2 py-0.5 rounded"
            style={{ backgroundColor: "#ef4444", color: "#fff" }}
          >
            Error
          </span>
        )}
      </div>
      <p className="text-4xl md:text-5xl font-bold font-mono tabular-nums mb-3" style={{ color: accentColor }}>
        {formatBs(data?.promedio ?? null)}{" "}
        <span className="text-lg font-normal" style={{ color: "#64748b" }}>
          Bs
        </span>
      </p>
      <div className="flex gap-6 text-sm" style={{ color: "#64748b" }}>
        <span>
          Compra: <span className="font-mono" style={{ color: "#e8eaf0" }}>{formatBs(data?.compra ?? null)}</span>
        </span>
        <span>
          Venta: <span className="font-mono" style={{ color: "#e8eaf0" }}>{formatBs(data?.venta ?? null)}</span>
        </span>
      </div>
      <p className="text-xs mt-2" style={{ color: "#64748b" }}>
        Actualizado: {formatDate(data?.fechaActualizacion ?? null)}
      </p>
    </div>
  );
}
