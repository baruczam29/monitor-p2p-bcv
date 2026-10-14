"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";

interface HistoryEntry {
  t: number;
  usd: number | null;
  par: number | null;
  eur: number | null;
  b: Record<string, [number | null, number | null]>;
}

interface MacroData {
  cierreAnterior: number | null;
  apertura: number | null;
  actual: number | null;
  variacionVsAyer: number | null;
  variacionIntradiaria: number | null;
  rangoHigh: number | null;
  rangoLow: number | null;
  label: "pre-market" | "market-open" | "market-closed";
}

function getVetComponents(utcEpochSec: number) {
  const vetMs = (utcEpochSec - 4 * 3600) * 1000;
  const d = new Date(vetMs);
  return {
    day: d.toISOString().split("T")[0],
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  };
}

function historyMarketAvg(entry: HistoryEntry): number | null {
  const values: number[] = [];
  for (const key of Object.keys(entry.b)) {
    const pair = entry.b[key];
    if (pair && pair[1]) values.push(pair[1]);
  }
  if (values.length === 0) return null;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function computeMacroData(history: HistoryEntry[]): MacroData {
  const OPEN_H = 8, OPEN_M = 30, CLOSE_H = 18, CLOSE_M = 30;
  const nowUtcSec = Math.floor(Date.now() / 1000);
  const nowVet = getVetComponents(nowUtcSec);
  const today = nowVet.day;

  const byDay = new Map<string, { t: number; avg: number; vetH: number; vetM: number }[]>();
  for (const entry of history) {
    const avg = historyMarketAvg(entry);
    if (avg === null) continue;
    const vet = getVetComponents(entry.t);
    const arr = byDay.get(vet.day) || [];
    arr.push({ t: entry.t, avg, vetH: vet.hour, vetM: vet.minute });
    byDay.set(vet.day, arr);
  }

  for (const [, entries] of byDay) entries.sort((a, b) => a.t - b.t);

  const days = [...byDay.keys()].sort();
  const prevDays = days.filter((d) => d < today);
  const prevDay = prevDays.length > 0 ? prevDays[prevDays.length - 1] : null;

  let cierreAnterior: number | null = null;
  if (prevDay) {
    const prevEntries = byDay.get(prevDay)!;
    const beforeClose = prevEntries.filter(
      (e) => e.vetH < CLOSE_H || (e.vetH === CLOSE_H && e.vetM <= CLOSE_M)
    );
    const candidates = beforeClose.length > 0 ? beforeClose : prevEntries;
    cierreAnterior = candidates[candidates.length - 1].avg;
  }

  const todayEntries = byDay.get(today) || [];

  let apertura: number | null = null;
  for (const e of todayEntries) {
    if (e.vetH > OPEN_H || (e.vetH === OPEN_H && e.vetM >= OPEN_M)) {
      apertura = e.avg;
      break;
    }
  }

  const nowMin = nowVet.hour * 60 + nowVet.minute;
  const openMin = OPEN_H * 60 + OPEN_M;
  const closeMin = CLOSE_H * 60 + CLOSE_M;

  let actual: number | null = null;
  let label: MacroData["label"];

  if (nowMin < openMin) {
    label = "pre-market";
    actual = cierreAnterior;
  } else if (nowMin <= closeMin) {
    label = "market-open";
    actual = todayEntries.length > 0 ? todayEntries[todayEntries.length - 1].avg : null;
  } else {
    label = "market-closed";
    if (todayEntries.length > 0) {
      const bc = todayEntries.filter(
        (e) => e.vetH < CLOSE_H || (e.vetH === CLOSE_H && e.vetM <= CLOSE_M)
      );
      actual = bc.length > 0 ? bc[bc.length - 1].avg : todayEntries[todayEntries.length - 1].avg;
    }
  }

  let variacionVsAyer: number | null = null;
  if (cierreAnterior && actual && label !== "pre-market") {
    variacionVsAyer = ((actual - cierreAnterior) / cierreAnterior) * 100;
  }

  let variacionIntradiaria: number | null = null;
  if (apertura && actual && label === "market-open") {
    variacionIntradiaria = ((actual - apertura) / apertura) * 100;
  }

  let rangoHigh: number | null = null;
  let rangoLow: number | null = null;
  if (todayEntries.length > 0) {
    const avgs = todayEntries.map((e) => e.avg);
    rangoHigh = Math.max(...avgs);
    rangoLow = Math.min(...avgs);
  }

  return { cierreAnterior, apertura, actual, variacionVsAyer, variacionIntradiaria, rangoHigh, rangoLow, label };
}

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
  mejorPrecio: number;
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
  trend: "up" | "down" | "same";
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
  const bestPrice = Math.max(...matches.map((b) => b.mejorPrecio));

  return {
    stats: {
      banco: "",
      cantidadAnuncios: totalAds,
      volumenDisponible: Math.round(totalVol * 100) / 100,
      precioPromedio: Math.round(weightedPrice * 100) / 100,
      mejorPrecio: bestPrice,
      score: 0,
    },
    activo: true,
  };
}

function buildRankedList(
  apiBanks: BankStats[],
  prevRanking: Map<string, number>,
  prevPrices: Map<string, number>
): RankedBank[] {
  const items: RankedBank[] = BANK_GROUPS.map((group) => {
    const merged = mergeGroup(apiBanks, group.methods);
    if (merged) {
      const prev = prevPrices.get(group.display);
      let trend: "up" | "down" | "same" = "same";
      if (prev !== undefined && prev !== merged.stats.mejorPrecio) {
        trend = merged.stats.mejorPrecio > prev ? "up" : "down";
      }
      return {
        ...merged.stats,
        banco: group.display,
        posicion: 0,
        cambio: 0,
        activo: true,
        trend,
      };
    }
    return {
      banco: group.display,
      cantidadAnuncios: 0,
      volumenDisponible: 0,
      precioPromedio: 0,
      mejorPrecio: 0,
      score: 0,
      posicion: 0,
      cambio: 0,
      activo: false,
      trend: "same" as const,
    };
  });

  const activos = items.filter((b) => b.activo).sort((a, b) => b.mejorPrecio - a.mejorPrecio);
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

function spreadColor(mejor: number, promedio: number): string {
  if (mejor === 0 || promedio === 0) return "#1a2844";
  const spread = ((mejor - promedio) / promedio) * 100;
  if (spread < 0.05) return "#f59e0b";
  if (spread <= 0.15) return "#22c55e";
  return "#ef4444";
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
      style={{ backgroundColor: ok ? "#22c55e" : "#ef4444" }}
    />
  );
}

function TrendArrow({ trend }: { trend: "up" | "down" | "same" }) {
  if (trend === "up")
    return (
      <span className="inline-flex items-center" style={{ color: "#22c55e" }}>
        <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
          <path d="M6 2L10 7H2L6 2Z" fill="currentColor" />
        </svg>
      </span>
    );
  if (trend === "down")
    return (
      <span className="inline-flex items-center" style={{ color: "#ef4444" }}>
        <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
          <path d="M6 10L2 5H10L6 10Z" fill="currentColor" />
        </svg>
      </span>
    );
  return (
    <span className="inline-flex items-center" style={{ color: "#2a3d5a" }}>
      <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
        <line x1="2" y1="6" x2="10" y2="6" stroke="currentColor" strokeWidth="2" />
      </svg>
    </span>
  );
}

function ChangeIndicator({ cambio }: { cambio: number }) {
  if (cambio === 0) return <span style={{ color: "#2a3d5a" }}>—</span>;
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

async function logToSheet(bcvData: BcvResponse | null, rankedBanks: RankedBank[], ads: number, volume: number) {
  try {
    const bancos = BANK_GROUPS.map((group) => {
      const bank = rankedBanks.find((b) => b.banco === group.display);
      if (!bank || !bank.activo) {
        return { banco: group.display, mejorPrecio: null, promedio: null, anuncios: 0, volumen: 0 };
      }
      return {
        banco: group.display,
        mejorPrecio: bank.mejorPrecio,
        promedio: bank.precioPromedio,
        anuncios: bank.cantidadAnuncios,
        volumen: bank.volumenDisponible,
      };
    });

    await fetch("/api/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        usdOficial: bcvData?.usd.promedio ?? null,
        usdParalelo: bcvData?.paralelo.promedio ?? null,
        eurOficial: bcvData?.eur.promedio ?? null,
        totalAnuncios: ads,
        totalVolumenUsdt: Math.round(volume * 100) / 100,
        bancos,
      }),
    });
  } catch {
    // logging silencioso
  }
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
  const [macro, setMacro] = useState<MacroData | null>(null);
  const prevRanking = useRef<Map<string, number>>(new Map());
  const prevPricesRef = useRef<Map<string, number>>(new Map());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const latestBcv = useRef<BcvResponse | null>(null);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/history");
      if (!res.ok) return;
      const json = await res.json();
      if (json.data && Array.isArray(json.data)) {
        setMacro(computeMacroData(json.data));
      }
    } catch {
      // history is optional — macro banner simply won't show
    }
  }, []);

  const fetchBcv = useCallback(async () => {
    try {
      const res = await fetch("/api/bcv");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: BcvResponse = await res.json();
      setBcv(data);
      latestBcv.current = data;
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

      const newRanked = buildRankedList(data.banks, prevRanking.current, prevPricesRef.current);
      setRanked(newRanked);

      const sumAds = newRanked.reduce((s, b) => s + b.cantidadAnuncios, 0);
      const sumVol = newRanked.reduce((s, b) => s + b.volumenDisponible, 0);
      setTotalAds(sumAds);
      setTotalVolumeUsdt(Math.round(sumVol * 100) / 100);

      const nextPrev = new Map<string, number>();
      const nextPrices = new Map<string, number>();
      newRanked.forEach((b) => {
        nextPrev.set(b.banco, b.posicion);
        if (b.activo) nextPrices.set(b.banco, b.mejorPrecio);
      });
      prevRanking.current = nextPrev;
      prevPricesRef.current = nextPrices;

      setP2pOk(true);
      setLastP2pTime(new Date().toLocaleTimeString("es-VE"));

      logToSheet(latestBcv.current, newRanked, sumAds, sumVol);
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
    fetchHistory();
    intervalRef.current = setInterval(() => {
      fetchBcv();
      fetchP2p();
      fetchHistory();
    }, 60_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchBcv, fetchP2p, fetchHistory]);

  return (
    <main className="flex-1 p-3 sm:p-4 md:p-6 max-w-5xl mx-auto w-full">
      {/* Header */}
      <header className="flex items-center justify-between mb-3 sm:mb-4">
        <h1 className="text-lg sm:text-xl md:text-2xl font-bold tracking-tight">
          Monitor P2P &amp; BCV
        </h1>
        <div className="flex items-center gap-3 sm:gap-4">
          <Link
            href="/charts"
            className="flex items-center gap-1 text-xs sm:text-sm font-medium hover:opacity-80 transition-opacity"
            style={{ color: "#0266FD" }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 12L5.5 7L8 9.5L14 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M11 3H14V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Charts
          </Link>
          <span
            className="text-lg sm:text-xl md:text-2xl font-mono tabular-nums"
            style={{ color: "#0266FD" }}
          >
            {clock}
          </span>
        </div>
      </header>

      {/* BCV rates — grid on mobile, inline on desktop */}
      <div
        className="rounded-lg border px-3 sm:px-4 py-2.5 sm:py-3 mb-3 sm:mb-5 grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center gap-x-4 sm:gap-x-8 gap-y-2"
        style={{ backgroundColor: "#060d1b", borderColor: "#0e1f3d" }}
      >
        <BcvPill label="USD Oficial" value={bcv?.usd.promedio ?? null} color="#22c55e" />
        <BcvPill label="USD Paralelo" value={bcv?.paralelo.promedio ?? null} color="#f59e0b" />
        <BcvPill label="EUR Oficial" value={bcv?.eur.promedio ?? null} color="#8b5cf6" />
        {bcv?.usd.promedio && bcv?.paralelo.promedio && (
          <span className="text-xs sm:text-sm" style={{ color: "#3d5070" }}>
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

      {/* Macro banner — market data */}
      <MacroBanner
        macro={macro}
        liveAvg={
          ranked.filter((b) => b.activo).length > 0
            ? ranked.filter((b) => b.activo).reduce((s, b) => s + b.precioPromedio, 0) /
              ranked.filter((b) => b.activo).length
            : null
        }
      />

      {/* P2P Table — main content */}
      <section
        className="rounded-xl border p-3 sm:p-4 md:p-6 mb-3 sm:mb-4"
        style={{ backgroundColor: "#060d1b", borderColor: "#0e1f3d" }}
      >
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <h2 className="text-sm sm:text-base md:text-lg font-semibold">
            Ranking bancos &middot; P2P (USDT &rarr; VES)
          </h2>
          {totalAds > 0 && (
            <span className="text-[10px] sm:text-xs" style={{ color: "#3d5070" }}>
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
                style={{ borderColor: "#0e1f3d", color: "#2a3d5a" }}
              >
                <th className="py-2 pr-3 w-10">#</th>
                <th className="py-2 pr-3 w-10"></th>
                <th className="py-2 pr-3">Banco</th>
                <th className="py-2 pr-3 text-right">Mejor precio (Bs)</th>
                <th className="py-2 pr-3 text-right">Promedio (Bs)</th>
                <th className="py-2 pr-3 text-right">Spread</th>
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
                    style={{ borderColor: "#0e1f3d", opacity: b.activo ? 1 : 0.35 }}
                  >
                    <td className="py-3 pr-3 font-mono text-sm" style={{ color: "#2a3d5a" }}>
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
                      className="py-3 pr-3 text-right font-mono text-xl md:text-2xl font-bold tabular-nums"
                      style={{ color: b.activo ? "#f59e0b" : "#1a2844" }}
                    >
                      <span className="inline-flex items-center justify-end gap-1">
                        {b.activo && <TrendArrow trend={b.trend} />}
                        {formatBs(b.mejorPrecio)}
                      </span>
                    </td>
                    <td
                      className="py-3 pr-3 text-right font-mono text-sm tabular-nums"
                      style={{ color: b.activo ? spreadColor(b.mejorPrecio, b.precioPromedio) : "#1a2844" }}
                    >
                      {formatBs(b.precioPromedio)}
                    </td>
                    <td
                      className="py-3 pr-3 text-right font-mono text-sm font-semibold"
                      style={{ color: b.activo ? spreadColor(b.mejorPrecio, b.precioPromedio) : "#1a2844" }}
                    >
                      {b.activo && b.mejorPrecio > 0
                        ? `${(((b.mejorPrecio - b.precioPromedio) / b.precioPromedio) * 100).toFixed(2)}%`
                        : "—"}
                    </td>
                    <td
                      className="py-3 pr-3 text-right font-mono text-sm"
                      style={{ color: b.activo ? "#e8edf5" : "#1a2844" }}
                    >
                      {b.activo ? b.cantidadAnuncios : "—"}
                    </td>
                    <td
                      className="py-3 text-right font-mono text-sm"
                      style={{ color: b.activo ? "#e8edf5" : "#1a2844" }}
                    >
                      {b.activo ? formatVol(b.volumenDisponible) : "—"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="py-12 text-center" style={{ color: "#3d5070" }}>
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
                  borderColor: "#0e1f3d",
                  backgroundColor: "#040a16",
                  opacity: b.activo ? 1 : 0.35,
                }}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="font-mono text-xs w-5 shrink-0" style={{ color: "#2a3d5a" }}>
                    {b.posicion}
                  </span>
                  <span className="text-xs w-5 shrink-0">
                    <ChangeIndicator cambio={b.cambio} />
                  </span>
                  <BankBadge name={b.banco} />
                  <span className="font-medium text-sm truncate">{b.banco}</span>
                  <span
                    className="ml-auto font-mono text-xl font-bold tabular-nums shrink-0 inline-flex items-center gap-1"
                    style={{ color: b.activo ? "#f59e0b" : "#1a2844" }}
                  >
                    {b.activo && <TrendArrow trend={b.trend} />}
                    {formatBs(b.mejorPrecio)}
                  </span>
                </div>
                {b.activo && (
                  <div className="flex gap-4 ml-12 text-[11px]" style={{ color: "#3d5070" }}>
                    <span className="inline-flex items-center gap-0.5" style={{ color: spreadColor(b.mejorPrecio, b.precioPromedio) }}>
                      Prom: {formatBs(b.precioPromedio)} ({b.mejorPrecio > 0 ? `${(((b.mejorPrecio - b.precioPromedio) / b.precioPromedio) * 100).toFixed(2)}%` : "—"})
                    </span>
                    <span>{b.cantidadAnuncios} anuncios</span>
                    <span>{formatVol(b.volumenDisponible)} USDT</span>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="py-12 text-center text-sm" style={{ color: "#3d5070" }}>
              Cargando datos P2P…
            </div>
          )}
        </div>
      </section>

      {/* Market totals */}
      {totalAds > 0 && (
        <div
          className="rounded-lg border px-3 sm:px-4 py-2.5 sm:py-3 mb-3 sm:mb-4 flex flex-wrap items-center gap-x-4 sm:gap-x-8 gap-y-1.5"
          style={{ backgroundColor: "#060d1b", borderColor: "#0e1f3d" }}
        >
          <span className="text-[10px] sm:text-xs uppercase tracking-wider" style={{ color: "#2a3d5a" }}>
            Mercado P2P total
          </span>
          <span className="flex items-center gap-1.5 sm:gap-2">
            <span className="text-xs sm:text-sm" style={{ color: "#7a8fad" }}>Anuncios</span>
            <span className="font-mono font-bold text-base sm:text-lg tabular-nums" style={{ color: "#e8edf5" }}>
              {totalAds}
            </span>
          </span>
          <span className="flex items-center gap-1.5 sm:gap-2">
            <span className="text-xs sm:text-sm" style={{ color: "#7a8fad" }}>Volumen</span>
            <span className="font-mono font-bold text-base sm:text-lg tabular-nums" style={{ color: "#0266FD" }}>
              {totalVolumeUsdt.toLocaleString("es-VE", { maximumFractionDigits: 0 })}
            </span>
            <span className="text-[10px] sm:text-xs" style={{ color: "#2a3d5a" }}>USDT</span>
          </span>
        </div>
      )}

      {/* Status bar */}
      <footer
        className="rounded-lg border px-3 sm:px-4 py-2 flex flex-wrap items-center gap-3 sm:gap-4 text-[10px] sm:text-xs"
        style={{ backgroundColor: "#060d1b", borderColor: "#0e1f3d", color: "#3d5070" }}
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

function variacionColor(v: number | null): string {
  if (v === null) return "#3d5070";
  if (Math.abs(v) < 0.05) return "#f59e0b";
  return v > 0 ? "#22c55e" : "#ef4444";
}

function variacionSign(v: number | null): string {
  if (v === null) return "--";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(2)}%`;
}

function MacroBanner({ macro, liveAvg }: { macro: MacroData | null; liveAvg: number | null }) {
  if (!macro) return null;

  const precio = liveAvg ?? macro.actual;
  const showVariacion = macro.label !== "pre-market" && macro.cierreAnterior !== null && precio !== null;
  const variacion = showVariacion
    ? ((precio! - macro.cierreAnterior!) / macro.cierreAnterior!) * 100
    : null;

  return (
    <div
      className="rounded-lg border px-3 sm:px-4 py-2.5 sm:py-3 mb-3 sm:mb-5 grid grid-cols-2 sm:flex sm:flex-wrap sm:items-center gap-x-4 sm:gap-x-8 gap-y-2"
      style={{ backgroundColor: "#060d1b", borderColor: "#0e1f3d" }}
    >
      {/* Cierre anterior */}
      <span className="flex items-center gap-1.5 sm:gap-2">
        <span className="text-[10px] sm:text-sm" style={{ color: "#7a8fad" }}>Cierre anterior</span>
        <span className="font-mono font-bold text-base sm:text-lg tabular-nums" style={{ color: "#e8edf5" }}>
          {macro.cierreAnterior !== null ? formatBs(macro.cierreAnterior) : "--"}
        </span>
      </span>

      {/* Variacion % — between cierre and apertura */}
      <span className="flex items-center gap-1.5 sm:gap-2">
        <span className="text-[10px] sm:text-sm" style={{ color: "#7a8fad" }}>Variacion</span>
        <span
          className="font-mono font-bold text-base sm:text-lg tabular-nums"
          style={{ color: variacionColor(variacion) }}
        >
          {variacionSign(variacion)}
        </span>
      </span>

      {/* Apertura de mercado */}
      {macro.apertura !== null && (
        <span className="flex items-center gap-1.5 sm:gap-2">
          <span className="text-[10px] sm:text-sm" style={{ color: "#7a8fad" }}>Apertura</span>
          <span className="font-mono font-bold text-base sm:text-lg tabular-nums" style={{ color: "#e8edf5" }}>
            {formatBs(macro.apertura)}
          </span>
        </span>
      )}

      {/* Rango */}
      {macro.rangoHigh !== null && macro.rangoLow !== null && (
        <span className="flex items-center gap-1.5 sm:gap-2 col-span-2 sm:col-span-1">
          <span className="text-[10px] sm:text-sm" style={{ color: "#7a8fad" }}>Rango</span>
          <span className="font-mono text-sm sm:text-base tabular-nums" style={{ color: "#3d5070" }}>
            {formatBs(macro.rangoLow)} – {formatBs(macro.rangoHigh)}
          </span>
        </span>
      )}
    </div>
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
      <span className="text-[10px] sm:text-sm" style={{ color: "#7a8fad" }}>
        {label}
      </span>
      <span
        className="font-mono font-bold text-base sm:text-lg md:text-xl tabular-nums"
        style={{ color }}
      >
        {formatBs(value)}
      </span>
      <span className="text-[10px] sm:text-xs" style={{ color: "#2a3d5a" }}>
        Bs
      </span>
    </span>
  );
}
