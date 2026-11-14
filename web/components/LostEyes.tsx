"use client";

import dynamic from "next/dynamic";
import { fmt, LostEyesFile, pct, Region, SAT_COLOR, SAT_LABEL, SATS } from "@/lib/data";

const BlindSpotMap = dynamic(() => import("@/components/BlindSpotMap"), { ssr: false, loading: () => <div className="h-[480px] rounded-2xl bg-slate-900" /> });

type Props = { le: LostEyesFile; region: Region; regions: Region[]; onPickRegion: (id: string) => void };

export default function LostEyes({ le, region, regions, onPickRegion }: Props) {
  const r = le.regions[region.id] ?? le.regions.PAK;
  const nat = le.regions.PAK;
  const monthly = (le.regions[region.id]?.monthly ?? nat.monthly) || [];
  const bySize = (le.regions[region.id]?.by_size ?? nat.by_size) || [];
  const maxM = Math.max(1, ...monthly.map((m) => m.all));

  const ranked = regions
    .filter((x) => x.level === "district" && le.regions[x.id] && le.regions[x.id].events >= 500)
    .map((x) => ({ x, s: le.regions[x.id].only_share.SNPP, n: le.regions[x.id].events }))
    .sort((a, b) => b.s - a.s)
    .slice(0, 10);

  const W = 720, H = 180, bw = W / Math.max(1, monthly.length);

  return (
    <div className="space-y-8">
      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-5 md:col-span-2">
          <p className="text-sm text-rose-200">
            {region.name}, {le.window.from} to {le.window.to}
          </p>
          <p className="mt-1 text-5xl font-bold text-white">{pct(r.only_share.SNPP)}</p>
          <p className="mt-2 text-slate-200">
            of fire events were seen <b>only</b> by Suomi NPP ({fmt(r.only.SNPP)} of {fmt(r.events)}). NASA stopped Suomi NPP fire data at 13:00 UTC
            on 2 November 2026, so fires like these now go unrecorded.
          </p>
          {r.low_conf ? <p className="mt-2 text-xs text-amber-300">Fewer than 100 events here: treat this share as rough.</p> : null}
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <p className="text-sm text-slate-400">Seen only by one satellite</p>
          <ul className="mt-2 space-y-1.5 text-sm">
            {SATS.map((s) => (
              <li key={s} className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: SAT_COLOR[s] }} />
                <span className="flex-1 text-slate-300">{SAT_LABEL[s]}</span>
                <span className="font-mono text-white">{pct(r.only_share[s])}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-400">
            Each VIIRS satellite catches about a quarter of events no other satellite sees: small, short fires are often caught by one pass only.
            That is why losing one satellite matters.
          </p>
        </div>
      </section>

      <section>
        <p className="hud-label">The blind-spot map</p>
        <h3 className="mb-1 font-display text-xl font-semibold text-white">Where Pakistan&apos;s fire record went blind on 2 November 2026</h3>
        <p className="mb-3 text-sm text-slate-400">Each district coloured by the share of its fires that no satellite but Suomi NPP saw. Brighter = more of its fires now go unrecorded.</p>
        <BlindSpotMap regions={regions} onPick={onPickRegion} />
      </section>

      <section>
        <h3 className="mb-1 font-semibold text-white">The record, month by month, with and without Suomi NPP</h3>
        <p className="mb-3 text-sm text-slate-400">Full bar: every fused fire event. Red part: events only Suomi NPP saw, which the record loses from now on.</p>
        <svg viewBox={`0 0 ${W} ${H + 24}`} className="w-full">
          {monthly.map((m, i) => {
            const hAll = (m.all / maxM) * H;
            const hNo = (m.no_snpp / maxM) * H;
            return (
              <g key={m.month}>
                <title>{`${m.month}: ${m.all.toLocaleString()} events, ${(m.all - m.no_snpp).toLocaleString()} only Suomi NPP`}</title>
                <rect x={i * bw + 1} y={H - hAll} width={bw - 2} height={hAll - hNo} fill={SAT_COLOR.SNPP} />
                <rect x={i * bw + 1} y={H - hNo} width={bw - 2} height={hNo} fill="#94a3b8" />
                {m.month.endsWith("-01") || (i === 0 && !monthly.slice(1, 4).some((x) => x.month.endsWith("-01"))) ? (
                  <text x={i * bw + 2} y={H + 16} fontSize={11} fill="#94a3b8">
                    {m.month}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div>
          <h3 className="mb-1 font-semibold text-white">Small fires are the ones we lose</h3>
          <p className="mb-3 text-sm text-slate-400">Share of events seen only by Suomi NPP, by harmonized fire power.</p>
          <ul className="space-y-2">
            {bySize.map((b) => (
              <li key={b.size} className="text-sm">
                <div className="flex justify-between text-slate-300">
                  <span>{b.size}</span>
                  <span className="font-mono">
                    {pct(b.only_snpp_share)} <span className="text-slate-500">of {fmt(b.events)}</span>
                  </span>
                </div>
                <div className="mt-1 h-2 rounded bg-slate-800">
                  <div className="h-2 rounded" style={{ width: `${b.only_snpp_share * 100 * 2.5}%`, background: SAT_COLOR.SNPP }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-1 font-semibold text-white">Districts losing the most</h3>
          <p className="mb-3 text-sm text-slate-400">Districts with 500+ events, by share seen only by Suomi NPP. Click one to open it.</p>
          <ol className="space-y-1 text-sm">
            {ranked.map(({ x, s, n }, i) => (
              <li key={x.id}>
                <button className="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-slate-800" onClick={() => onPickRegion(x.id)}>
                  <span className="w-5 text-slate-500">{i + 1}</span>
                  <span className="flex-1 text-slate-200">{x.name}</span>
                  <span className="font-mono text-rose-300">{pct(s)}</span>
                  <span className="w-20 text-right text-xs text-slate-500">{fmt(n)} events</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <p className="text-xs text-slate-500">{le.note} Not a model: these are counts of real events in the period when all five satellites were flying.</p>
    </div>
  );
}
