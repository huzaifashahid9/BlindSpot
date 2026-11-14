"use client";

import { useEffect, useMemo, useState } from "react";
import { fmt, getJSON } from "@/lib/data";

type Bin = { bin: number; scan_from_km: number; scan_to_km: number; ratio: number; n_pairs: number };
type Pairs = { from: string; to: string; n: number; pairs: [number, number, number][] };

const BIN_COLOR = ["#fde68a", "#fbbf24", "#f97316", "#ef4444", "#be123c"];
const W = 560, H = 420, PAD = { l: 52, r: 16, t: 16, b: 44 };
const LO = Math.log10(0.5), HI = Math.log10(3000);
const sx = (v: number) => PAD.l + ((Math.log10(Math.max(v, 0.5)) - LO) / (HI - LO)) * (W - PAD.l - PAD.r);
const sy = (v: number) => H - PAD.b - ((Math.log10(Math.max(v, 0.5)) - LO) / (HI - LO)) * (H - PAD.t - PAD.b);
const TICKS = [1, 10, 100, 1000];

/** Same fire, two eyes: matched MODIS and VIIRS readings, the calibration, and the pixel sizes behind it. */
export default function TwoEyes({ bins, medianRatio }: { bins: Bin[]; medianRatio: number }) {
  const [data, setData] = useState<Pairs | null>(null);
  const [after, setAfter] = useState(false);
  const [scan, setScan] = useState(1);
  useEffect(() => {
    getJSON<Pairs>("pairs_sample.json").then(setData).catch(() => setData(null));
  }, []);

  const binOf = (s: number) => {
    const i = bins.findIndex((b) => s <= b.scan_to_km);
    return i < 0 ? bins.length - 1 : i;
  };
  const pts = useMemo(
    () =>
      (data?.pairs ?? []).map(([v, m, s]) => {
        const b = binOf(s);
        return { x: sx(v), yRaw: sy(m), yCal: sy(m / bins[b].ratio), b };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, bins],
  );

  // pixel footprints, nadir to swath edge (approximate): MODIS 1 x 1 km to about 4.8 x 2 km, VIIRS 375 m to about 800 m
  const f = (scan - 1) / 3.8;
  const mW = scan, mH = 1 + f, vS = 0.375 + 0.425 * f;
  const b = bins[binOf(scan)];
  const KM = 62; // pixels per km in the footprint drawing
  const boxW = 5 * KM + 20, boxH = 2.3 * KM + 20;
  const vCols = Math.ceil(mW / vS) + 1, vRows = Math.ceil(mH / vS) + 1;

  return (
    <div className="not-prose my-6 space-y-6 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 md:p-5">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-semibold text-white">Same fire, two eyes</p>
          <div className="inline-flex rounded-lg border border-slate-700 p-0.5 text-sm" role="tablist">
            {[
              [false, "As measured"],
              [true, "After calibration"],
            ].map(([k, l]) => (
              <button
                key={String(k)}
                role="tab"
                aria-selected={after === k}
                onClick={() => setAfter(k as boolean)}
                className={`rounded-md px-3 py-1 ${after === k ? "bg-orange-500 font-semibold text-slate-950" : "text-slate-300 hover:text-white"}`}
              >
                {l as string}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-1 text-sm text-slate-400">
          Each dot is one fire seen by Aqua MODIS and by VIIRS within 30 minutes. If both agreed, every dot would sit on the dashed line.{" "}
          {after ? "After dividing MODIS by the ratio for its pixel size, the cloud moves onto the line." : `As measured, MODIS reads about ${medianRatio.toFixed(1)} times higher.`}
        </p>
        <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" role="img" aria-label="Scatter of MODIS against VIIRS fire radiative power">
          {TICKS.map((t) => (
            <g key={t}>
              <line x1={sx(t)} x2={sx(t)} y1={PAD.t} y2={H - PAD.b} stroke="#1e293b" />
              <line y1={sy(t)} y2={sy(t)} x1={PAD.l} x2={W - PAD.r} stroke="#1e293b" />
              <text x={sx(t)} y={H - PAD.b + 16} textAnchor="middle" fontSize={11} fill="#64748b">
                {t}
              </text>
              <text x={PAD.l - 8} y={sy(t) + 4} textAnchor="end" fontSize={11} fill="#64748b">
                {t}
              </text>
            </g>
          ))}
          <text x={(W + PAD.l) / 2} y={H - 6} textAnchor="middle" fontSize={12} fill="#94a3b8">
            VIIRS fire power (MW)
          </text>
          <text x={14} y={(H - PAD.b) / 2} textAnchor="middle" fontSize={12} fill="#94a3b8" transform={`rotate(-90 14 ${(H - PAD.b) / 2})`}>
            MODIS fire power (MW){after ? ", calibrated" : ""}
          </text>
          <g>
            {pts.map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={0}
                r={2.2}
                fill={BIN_COLOR[p.b]}
                fillOpacity={0.45}
                style={{ transform: `translateY(${after ? p.yCal : p.yRaw}px)`, transition: "transform 900ms cubic-bezier(.2,.8,.2,1)" }}
              />
            ))}
          </g>
          <line x1={sx(0.5)} y1={sy(0.5)} x2={sx(3000)} y2={sy(3000)} stroke="#e2e8f0" strokeDasharray="5 5" strokeWidth={1.5} />
          <text x={sx(1500) + 6} y={sy(1500) + 18} textAnchor="start" fontSize={11} fill="#e2e8f0">
            agree
          </text>
          <line
            x1={sx(0.5)}
            y1={sy(0.5 * medianRatio)}
            x2={sx(3000 / medianRatio)}
            y2={sy(3000)}
            stroke="#f97316"
            strokeWidth={2}
            style={{ opacity: after ? 0 : 1, transition: "opacity 600ms" }}
          />
          <text x={sx(3000 / medianRatio) - 6} y={sy(3000) + 14} textAnchor="end" fontSize={11} fill="#fdba74" style={{ opacity: after ? 0 : 1, transition: "opacity 600ms" }}>
            MODIS {medianRatio.toFixed(1)}x higher
          </text>
        </svg>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
          <span>MODIS pixel size:</span>
          {bins.map((x, i) => (
            <span key={x.bin} className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: BIN_COLOR[i] }} />
              {x.scan_from_km} to {x.scan_to_km} km
            </span>
          ))}
        </div>
        {data ? (
          <p className="mt-2 text-xs text-slate-500">
            Showing {fmt(data.n)} matched pairs from {data.from} to {data.to}. The ratios themselves were fitted on all pairs in the record.
          </p>
        ) : null}
      </div>

      <div className="border-t border-slate-800 pt-5">
        <p className="font-semibold text-white">Why the two disagree: pixel size, to scale</p>
        <p className="mt-1 text-sm text-slate-400">
          Drag from the middle of the satellite&apos;s path (nadir) to the edge of its view. MODIS pixels stretch far more than VIIRS pixels, and the bigger the
          pixel, the more the reading is smeared over the background.
        </p>
        <label className="mt-3 flex items-center gap-3 text-sm text-slate-300">
          <span className="w-14 text-xs text-slate-500">nadir</span>
          <input type="range" min={1} max={4.8} step={0.05} value={scan} onChange={(e) => setScan(Number(e.target.value))} className="flex-1 accent-orange-500" aria-label="Position across the swath" />
          <span className="w-14 text-right text-xs text-slate-500">edge</span>
        </label>
        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_200px] md:items-center">
          <svg viewBox={`0 0 ${boxW} ${boxH}`} className="w-full rounded-xl bg-[#0b1220]" role="img" aria-label="MODIS and VIIRS pixel footprints to scale">
            <defs>
              <clipPath id="modis-px">
                <rect x={0} y={0} width={mW * KM} height={mH * KM} />
              </clipPath>
            </defs>
            <g transform={`translate(10 10)`}>
              <g clipPath="url(#modis-px)">
              {Array.from({ length: vRows }).map((_, r) =>
                Array.from({ length: vCols }).map((__, c) =>
                  c * vS < mW && r * vS < mH ? (
                    <rect
                      key={`${r}-${c}`}
                      x={c * vS * KM}
                      y={r * vS * KM}
                      width={vS * KM}
                      height={vS * KM}
                      fill="#38bdf8"
                      fillOpacity={0.08}
                      stroke="#38bdf8"
                      strokeOpacity={0.6}
                      strokeWidth={1}
                    />
                  ) : null,
                ),
              )}
              </g>
              <rect x={0} y={0} width={mW * KM} height={mH * KM} fill="none" stroke="#f97316" strokeWidth={3} rx={2} style={{ transition: "all 120ms" }} />
              <circle cx={0.5 * vS * KM} cy={0.5 * vS * KM} r={0.06 * KM} fill="#fde68a" />
              <circle cx={0.5 * vS * KM} cy={0.5 * vS * KM} r={0.12 * KM} fill="#f97316" fillOpacity={0.35} />
              <line x1={0} x2={KM} y1={boxH - 26} y2={boxH - 26} stroke="#94a3b8" strokeWidth={2} />
              <text x={KM + 6} y={boxH - 22} fontSize={11} fill="#94a3b8">
                1 km
              </text>
            </g>
          </svg>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-xs text-orange-300">MODIS pixel</dt>
              <dd className="font-mono text-white">
                {mW.toFixed(1)} x {mH.toFixed(1)} km
              </dd>
            </div>
            <div>
              <dt className="text-xs text-sky-300">VIIRS pixel</dt>
              <dd className="font-mono text-white">
                {Math.round(vS * 1000)} x {Math.round(vS * 1000)} m
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">One MODIS pixel covers</dt>
              <dd className="font-mono text-white">{Math.round((mW * mH) / (vS * vS))} VIIRS pixels</dd>
            </div>
            <div className="rounded-lg border border-orange-400/40 bg-orange-500/10 p-2">
              <dt className="text-xs text-orange-200">Ratio BlindSpot applies here</dt>
              <dd className="font-display text-2xl font-semibold text-white">{b.ratio.toFixed(2)}x</dd>
              <dd className="text-xs text-slate-400">from {fmt(b.n_pairs)} matched pairs</dd>
            </div>
          </dl>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Pixel sizes are approximate (MODIS about 1 km at nadir to about 4.8 by 2 km at the edge; VIIRS 375 m to about 800 m). The small dot is a 100 m fire.
        </p>
      </div>
    </div>
  );
}
