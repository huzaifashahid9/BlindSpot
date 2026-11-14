import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LogoMark } from "@/components/Logo";
import ShareCard from "@/components/ShareCard";
import { fmtN, scorecardIds, scorecard, Scorecard, summary } from "@/lib/scorecard";

export async function generateStaticParams() {
  return scorecardIds().map((id) => ({ id }));
}

const where = (s: Scorecard) => (s.province ? `${s.name}, ${s.province}` : s.name);

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const s = scorecard(id);
  if (!s) return {};
  const title = `${s.name} fire scorecard · BlindSpot`;
  return { title, description: summary(s), openGraph: { title, description: summary(s) }, twitter: { card: "summary_large_image", title, description: summary(s) } };
}

function Tile({ k, v, sub, tone = "text-white" }: { k: string; v: string; sub: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{k}</p>
      <p className={`mt-2 font-display text-4xl font-bold ${tone}`}>{v}</p>
      <p className="mt-1 text-sm leading-snug text-slate-400">{sub}</p>
    </div>
  );
}

export default async function DistrictPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = scorecard(id);
  if (!s) notFound();
  const r = s.season.ratio;
  const seasonTone = r === null ? "text-white" : r >= 1.15 ? "text-rose-300" : r <= 0.85 ? "text-emerald-300" : "text-amber-200";
  const seasonV = r === null ? fmtN(s.season.now) : r >= 1.15 || r <= 0.85 ? `${r.toFixed(1)}x` : "about usual";
  const unit = s.level === "district" ? "districts" : "provinces";

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 md:py-12">
      <div className="flex items-center justify-between gap-3">
        <Link href="/" className="inline-flex items-center gap-2 font-display font-bold text-white">
          <LogoMark className="h-8 w-8" />
          <span>
            Blind<span className="text-orange-400">Spot</span>
          </span>
        </Link>
        <p className="text-xs text-slate-500">Data to {s.dataTo}</p>
      </div>

      <section className="mt-8 overflow-hidden rounded-3xl border border-slate-800 bg-[radial-gradient(ellipse_at_top_right,rgba(249,115,22,0.18),transparent_60%),#0a0e18] p-6 md:p-10">
        <p className="text-xs uppercase tracking-[0.25em] text-orange-300">{s.level === "country" ? "Country" : s.level === "province" ? "Province" : "District"} fire scorecard</p>
        <h1 className="mt-2 font-display text-5xl font-bold text-white md:text-6xl">{s.name}</h1>
        {s.province ? <p className="mt-1 text-lg text-slate-400">{s.province}</p> : null}
        <p className="mt-5 max-w-3xl text-lg leading-relaxed text-slate-200">{summary(s)}</p>
        <div className="mt-6">
          <ShareCard text={`${where(s)} fire scorecard from BlindSpot: ${summary(s)}`} />
        </div>
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Tile
          k="Fires since November 2000"
          v={fmtN(s.events)}
          sub={s.rank ? `Rank #${s.rank} of ${s.rankOf} ${unit}. Harmonized fire events, MODIS and VIIRS on one scale.` : "Harmonized fire events, MODIS and VIIRS on one scale."}
          tone="text-orange-300"
        />
        <Tile
          k={`This season, ${s.season.label}`}
          v={seasonV}
          sub={`${fmtN(s.season.now)} fire events so far, against a usual ${fmtN(s.season.median)} for the same dates (median of earlier years).`}
          tone={seasonTone}
        />
        <Tile k="Busiest month" v={s.peakMonth} sub="The month with the most fires over the whole record." />
        <Tile
          k="Seen only by Suomi NPP"
          v={s.onlySnpp !== null ? `${(s.onlySnpp * 100).toFixed(1)}%` : "n/a"}
          sub="Share of fire events since Nov 2023 that only Suomi NPP caught. It stopped on 2 Nov 2026, so fires like these now go unrecorded."
          tone="text-rose-300"
        />
        <Tile
          k="Unusual days that vanish"
          v={`${s.unusualLost} of ${s.unusualWindow}`}
          sub="Days with unusually many fires since Nov 2023 that would not look unusual without Suomi NPP."
        />
        <Tile
          k="Trust Score now"
          v={s.trustNow !== null ? `${Math.round(s.trustNow)}` : "n/a"}
          sub={
            s.trustNow !== null
              ? `Out of 100: how far you can rely on this ${s.level}'s fire record${s.trustBefore !== null ? ` (${Math.round(s.trustBefore)} with Suomi NPP)` : ""}.`
              : "Scored for districts only."
          }
          tone="text-sky-300"
        />
      </section>

      {s.industry.sites ? (
        <p className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/[0.06] p-4 text-sm text-slate-300">
          <b className="text-amber-200">{s.industry.sites} year-round hot spots</b> here (likely kilns, flares or factories) are kept out of these crop-fire
          numbers{s.industry.smog ? `; ${s.industry.smog} of them were hot during the last smog season` : ""}.
        </p>
      ) : null}

      <div className="mt-8 flex flex-wrap gap-3 text-sm">
        <Link href={`/?r=${s.id}#calendar`} className="rounded-lg bg-orange-500 px-4 py-2 font-semibold text-slate-950 hover:bg-orange-400">
          Open {s.name} in BlindSpot
        </Link>
        <a href={`/report?region=${s.id}`} className="rounded-lg border border-slate-700 px-4 py-2 text-slate-200 hover:bg-slate-800">
          Full report (PDF)
        </a>
        <Link href="/method" className="rounded-lg px-4 py-2 text-slate-400 hover:text-white">
          How these numbers are made
        </Link>
      </div>
      <p className="mt-8 text-xs text-slate-600">
        Source: NASA FIRMS active fire data (MODIS Terra and Aqua, VIIRS Suomi NPP, NOAA-20, NOAA-21), harmonized by BlindSpot for NASA Space Apps 2026.
      </p>
    </main>
  );
}
