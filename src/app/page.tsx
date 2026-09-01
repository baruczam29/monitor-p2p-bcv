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
  eur: CurrencyData;
  eurUsdRate: number | null;
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
  banks: BankStats[];
  totalAds: number;
  totalBanks: number;
  totalVolumeUsdt: number;
  fetchedAt: string | null;
  error?: string;
}

interface RankedBank extends BankStats {
  posicion: number;
  cambio: number;
  activo: boolean;
}

const BANK_GROUPS: { display: string; methods: string[]; abbr: string; color: string }[] = [
  { display: "Banesco", methods: ["Banesco"], abbr: "BA", color: "#00A651" },
  { display: "Mercantil", methods: ["Mercantil"], abbr: "ME", color: "#003DA5" },
  { display: "Provincial / BBVA", methods: ["Provincial", "BBVA"], abbr: "PR", color: "#004481" },
  { display: "BNC", methods: ["BNC Banco Nacional de Crédito"], abbr: "BN", color: "#D4213D" },
  { display: "Bancamiga", methods: ["Bancamiga"], abbr: "BM", color: "#F58220" },
  { display: "BDT", methods: ["Banco Digital de los Trabajadores", "Banco del Tesoro"], abbr: "DT", color: "#0077B6" },
  { display: "Banplus", methods: ["Banplus"], abbr: "B+", color: "#E30613" },
  { display: "Banco Plaza", methods: ["Banco Plaza", "Plaza"], abbr: "PL", color: "#006341" },
  { display: "Banco Activo", methods: ["Banco Activo"], abbr: "AC", color: "#CC0000" },
  { display: "BDV", methods: ["Banco de Venezuela", "Bank Transfer", "Pago Movil"], abbr: "BV", color: "#005BAA" },
];

const BANK_BRAND_MAP = new Map(BANK_GROUPS.map((g) => [g.display, { abbr: g.abbr, color: g.color }]));

function findApiBank(apiBanks: BankStats[], method: string): BankStats | undefined {
  const m = method.toLowerCase();
  return apiBanks.find((b) => b.banco.toLowerCase() === m);
}

function mergeGroup(apiBanks: BankStats[], methods: string[]): { stats: BankStats; activo: boolean } | null {
  const matches: BankStats[] = [];
  for (const method of methods) {
    const found = findApiBank(apiBanks, method);
    if (found) matches.push(found);
  }
  if (matches.length === 0) return null;

  const totalAds = matches.reduce((s, b) => s + b.cantidadAnuncios, 0);
  const totalVol = matches.reduce((s, b) => s + b.volumenDisponible, 0);
  const weightedPrice = matches.reduce((s, b) => s + b.precioPromedio * b.cantidadAnuncios, 0) / totalAds;

  return {
    stats: {
      banco: "",
      cantidadAnuncios: totalAds,
      volumenDisponible: Math.round(totalVol * 100) / 100,
      precioPromedio: Math.round(weightedPrice * 100) / 100,
      score: 0,
    },
    activo: true,
  };
}

function buildRankedList(
  apiBanks: BankStats[],
  prevRanking: Map<string, number>
): RankedBank[] {
  const items: RankedBank[] = BANK_GROUPS.map((group) => {
    const merged = mergeGroup(apiBanks, group.methods);
    if (merged) {
      return {
        ...merged.stats,
        banco: group.display,
        posicion: 0,
        cambio: 0,
        activo: true,
      };
    }
    return {
      banco: group.display,
      cantidadAnuncios: 0,
      volumenDisponible: 0,
      precioPromedio: 0,
      score: 0,
      posicion: 0,
      cambio: 0,
      activo: false,
    };
  });

  const activos = items.filter((b) => b.activo).sort((a, b) => b.precioPromedio - a.precioPromedio);
  const inactivos = items.filter((b) => !b.activo);
  const sorted = [...activos, ...inactivos];

  sorted.forEach((b, i) => {
    b.posicion = i + 1;
    const prev = prevRanking.get(b.banco);
    if (prev !== undefined) {
      b.cambio = prev - b.posicion;
    }
  });

  return sorted;
}

function formatBs(n: number | null): string {
  if (n === null || n === 0) return "—";
  return n.toLocaleString("es-VE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatVol(n: number): string {
  if (n === 0) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toLocaleString("es-VE", { maximumFractionDigits: 0 });
}

function BankBadge({ name }: { name: string }) {
  const brand = BANK_BRAND_MAP.get(name);
  if (!brand) return null;
  return (
    <span
      className="inline-flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-lg text-[10px] sm:text-xs font-bold shrink-0"
      style={{ backgroundColor: brand.color, color: "#fff" }}
    >
      {brand.abbr}
    </span>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
      style={{ backgroundColor: ok ? "#22c55e" : "#ef4444" }}
    />
  );
}

function ChangeIndicator({ cambio }: { cambio: number }) {
  if (cambio === 0) return <span style={{ color: "#475569" }}>—</span>;
  if (cambio > 0)
    return (
      <span className="flex items-center gap-0.5 font-semibold" style={{ color: "#22c55e" }}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M6 2L10 7H2L6 2Z" fill="currentColor" />
        </svg>
        {cambio}
      </span>
    );
  return (
    <span className="flex items-center gap-0.5 font-semibold" style={{ color: "#ef4444" }}>
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
        <path d="M6 10L2 5H10L6 10Z" fill="currentColor" />
      </svg>
      {Math.abs(cambio)}
    </span>
  );
}

export default function Home() {
  const [bcv, setBcv] = useState<BcvResponse | null>(null);
  const [ranked, setRanked] = useState<RankedBank[]>([]);
  const [totalAds, setTotalAds] = useState(0);
  const [totalVolumeUsdt, setTotalVolumeUsdt] = useState(0);
  const [bcvOk, setBcvOk] = useState(true);
  const [p2pOk, setP2pOk] = useState(true);
  const [lastBcvTime, setLastBcvTime] = useState<string | null>(null);
  const [lastP2pTime, setLastP2pTime] = useState<string | null>(null);
  const [clock, setClock] = useState("");
  const prevRanking = useRef<Map<string, number>>(new Map());
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

      const newRanked = buildRankedList(data.banks, prevRanking.current);
      setRanked(newRanked);
      setTotalAds(data.totalAds);
      setTotalVolumeUsdt(data.totalVolumeUsdt);

      const nextPrev = new Map<string, number>();
      newRanked.forEach((b) => nextPrev.set(b.banco, b.posicion));
      prevRanking.current = nextPrev;

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
    <main className="flex-1 p-3 sm:p-4 md:p-6 max-w-5xl mx-auto w-full">
      {/* Header */}
      <header className="flex items-center justify-between mb-3 sm:mb-4">
        <h1 className="text-lg sm:text-xl md:text-2xl font-bold tracking-tight">
          Monitor P2P &amp; BCV
        </h1>
        <div
          className="text-lg sm:text-xl md:text-2xl font-mono tabular-nums"
          style={{ color: "#3b82f6" }}
        >
          {clock}
        </div>
      </header>

      {/* BCV rates — grid on mobile, inline on desktop */}
      <div
        className="rounded-lg border px-3 sm:px-4 py-2.5 sm:py-3 mb-3 sm:mb-5 grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center gap-x-4 sm:gap-x-8 gap-y-2"
        style={{ backgroundColor: "#131926", borderColor: "#1e293b" }}
      >
        <BcvPill label="USD Oficial" value={bcv?.usd.promedio ?? null} color="#22c55e" />
        <BcvPill label="USD Paralelo" value={bcv?.paralelo.promedio ?? null} color="#f59e0b" />
        <BcvPill label="EUR Oficial" value={bcv?.eur.promedio ?? null} color="#8b5cf6" />
        {bcv?.usd.promedio && bcv?.paralelo.promedio && (
          <span className="text-xs sm:text-sm" style={{ color: "#64748b" }}>
            Brecha:{" "}
            <span className="font-mono font-semibold" style={{ color: "#f87171" }}>
              {(
                ((bcv.paralelo.promedio - bcv.usd.promedio) / bcv.usd.promedio) *
                100
              ).toFixed(1)}
              %
            </span>
          </span>
        )}
      </div>

      {/* P2P Table — main content */}
      <section
        className="rounded-xl border p-3 sm:p-4 md:p-6 mb-3 sm:mb-4"
        style={{ backgroundColor: "#131926", borderColor: "#1e293b" }}
      >
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <h2 className="text-sm sm:text-base md:text-lg font-semibold">
            Ranking bancos &middot; P2P (USDT &rarr; VES)
          </h2>
          {totalAds > 0 && (
            <span className="text-[10px] sm:text-xs" style={{ color: "#64748b" }}>
              {totalAds} anuncios
            </span>
          )}
        </div>

        {/* Desktop/tablet table */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr
                className="text-left border-b text-xs uppercase tracking-wider"
                style={{ borderColor: "#1e293b", color: "#475569" }}
              >
                <th className="py-2 pr-3 w-10">#</th>
                <th className="py-2 pr-3 w-10"></th>
                <th className="py-2 pr-3">Banco</th>
                <th className="py-2 pr-3 text-right">Precio venta (Bs)</th>
                <th className="py-2 pr-3 text-right">Anuncios</th>
                <th className="py-2 text-right">Volumen (USDT)</th>
              </tr>
            </thead>
            <tbody>
              {ranked.length > 0 ? (
                ranked.map((b) => (
                  <tr
                    key={b.banco}
                    className="border-b transition-opacity duration-300"
                    style={{ borderColor: "#1e293b", opacity: b.activo ? 1 : 0.35 }}
                  >
                    <td className="py-3 pr-3 font-mono text-sm" style={{ color: "#475569" }}>
                      {b.posicion}
                    </td>
                    <td className="py-3 pr-3 text-sm">
                      <ChangeIndicator cambio={b.cambio} />
                    </td>
                    <td className="py-3 pr-3 font-medium text-sm md:text-base">
                      <span className="flex items-center gap-2">
                        <BankBadge name={b.banco} />
                        {b.banco}
                      </span>
                    </td>
                    <td
                      className="py-3 pr-3 text-right font-mono text-lg md:text-xl font-bold tabular-nums"
                      style={{ color: b.activo ? "#f59e0b" : "#334155" }}
                    >
                      {formatBs(b.precioPromedio)}
                    </td>
                    <td
                      className="py-3 pr-3 text-right font-mono text-sm"
                      style={{ color: b.activo ? "#e8eaf0" : "#334155" }}
                    >
                      {b.activo ? b.cantidadAnuncios : "—"}
                    </td>
                    <td
                      className="py-3 text-right font-mono text-sm"
                      style={{ color: b.activo ? "#e8eaf0" : "#334155" }}
                    >
                      {b.activo ? formatVol(b.volumenDisponible) : "—"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-12 text-center" style={{ color: "#64748b" }}>
                    Cargando datos P2P…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile card list */}
        <div className="sm:hidden flex flex-col gap-2">
          {ranked.length > 0 ? (
            ranked.map((b) => (
              <div
                key={b.banco}
                className="rounded-lg border px-3 py-2.5 transition-opacity duration-300"
                style={{
                  borderColor: "#1e293b",
                  backgroundColor: "#0f1623",
                  opacity: b.activo ? 1 : 0.35,
                }}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="font-mono text-xs w-5 shrink-0" style={{ color: "#475569" }}>
                    {b.posicion}
                  </span>
                  <span className="text-xs w-5 shrink-0">
                    <ChangeIndicator cambio={b.cambio} />
                  </span>
                  <BankBadge name={b.banco} />
                  <span className="font-medium text-sm truncate">{b.banco}</span>
                  <span
                    className="ml-auto font-mono text-lg font-bold tabular-nums shrink-0"
                    style={{ color: b.activo ? "#f59e0b" : "#334155" }}
                  >
                    {formatBs(b.precioPromedio)}
                  </span>
                </div>
                {b.activo && (
                  <div className="flex gap-4 ml-12 text-[11px]" style={{ color: "#64748b" }}>
                    <span>{b.cantidadAnuncios} anuncios</span>
                    <span>{formatVol(b.volumenDisponible)} USDT</span>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="py-12 text-center text-sm" style={{ color: "#64748b" }}>
              Cargando datos P2P…
            </div>
          )}
        </div>
      </section>

      {/* Market totals */}
      {totalAds > 0 && (
        <div
          className="rounded-lg border px-3 sm:px-4 py-2.5 sm:py-3 mb-3 sm:mb-4 flex flex-wrap items-center gap-x-4 sm:gap-x-8 gap-y-1.5"
          style={{ backgroundColor: "#131926", borderColor: "#1e293b" }}
        >
          <span className="text-[10px] sm:text-xs uppercase tracking-wider" style={{ color: "#475569" }}>
            Mercado P2P total
          </span>
          <span className="flex items-center gap-1.5 sm:gap-2">
            <span className="text-xs sm:text-sm" style={{ color: "#94a3b8" }}>Anuncios</span>
            <span className="font-mono font-bold text-base sm:text-lg tabular-nums" style={{ color: "#e8eaf0" }}>
              {totalAds}
            </span>
          </span>
          <span className="flex items-center gap-1.5 sm:gap-2">
            <span className="text-xs sm:text-sm" style={{ color: "#94a3b8" }}>Volumen</span>
            <span className="font-mono font-bold text-base sm:text-lg tabular-nums" style={{ color: "#3b82f6" }}>
              {totalVolumeUsdt.toLocaleString("es-VE", { maximumFractionDigits: 0 })}
            </span>
            <span className="text-[10px] sm:text-xs" style={{ color: "#475569" }}>USDT</span>
          </span>
        </div>
      )}

      {/* Status bar */}
      <footer
        className="rounded-lg border px-3 sm:px-4 py-2 flex flex-wrap items-center gap-3 sm:gap-4 text-[10px] sm:text-xs"
        style={{ backgroundColor: "#131926", borderColor: "#1e293b", color: "#64748b" }}
      >
        <span className="flex items-center gap-1.5">
          <StatusDot ok={bcvOk} /> BCV {lastBcvTime ? `· ${lastBcvTime}` : ""}
        </span>
        <span className="flex items-center gap-1.5">
          <StatusDot ok={p2pOk} /> P2P {lastP2pTime ? `· ${lastP2pTime}` : ""}
        </span>
        <span className="ml-auto">Refresh cada 60s</span>
      </footer>
    </main>
  );
}

function BcvPill({
  label,
  value,
  color,
}: {
  label: string;
  value: number | null;
  color: string;
}) {
  return (
    <span className="flex items-center gap-1.5 sm:gap-2">
      <span className="text-[10px] sm:text-sm" style={{ color: "#94a3b8" }}>
        {label}
      </span>
      <span
        className="font-mono font-bold text-base sm:text-lg md:text-xl tabular-nums"
        style={{ color }}
      >
        {formatBs(value)}
      </span>
      <span className="text-[10px] sm:text-xs" style={{ color: "#475569" }}>
        Bs
      </span>
    </span>
  );
}
