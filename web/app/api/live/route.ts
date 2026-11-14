// LIVE: the last 48 hours of fire detections over Pakistan from NASA FIRMS (near real time).
// The FIRMS key stays on the server (FIRMS_MAP_KEY). Vercel's CDN caches the answer for 15 minutes.

export const maxDuration = 30;

const BBOX = "60,23,80,37";
const SOURCES = ["VIIRS_NOAA20_NRT", "VIIRS_NOAA21_NRT", "MODIS_NRT"] as const;
// satellite index = bit position used across the site: Terra 0, Aqua 1, Suomi NPP 2, NOAA-20 3, NOAA-21 4
const SAT_INDEX: Record<string, number> = { terra: 0, t: 0, aqua: 1, a: 1, n: 2, npp: 2, n20: 3, "noaa-20": 3, "1": 3, n21: 4, "noaa-21": 4, "2": 4 };

function parse(csv: string, source: string) {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2 || !lines[0].includes("latitude")) return [];
  const h = lines[0].split(",");
  const col = (n: string) => h.indexOf(n);
  const [iLat, iLon, iDate, iTime, iSat, iFrp, iConf] = ["latitude", "longitude", "acq_date", "acq_time", "satellite", "frp", "confidence"].map(col);
  const out: [number, number, number, number, number, string][] = [];
  for (let k = 1; k < lines.length; k++) {
    const c = lines[k].split(",");
    const t = c[iTime].padStart(4, "0");
    const ms = Date.parse(`${c[iDate]}T${t.slice(0, 2)}:${t.slice(2)}:00Z`);
    const sat = SAT_INDEX[(c[iSat] ?? "").toLowerCase()] ?? (source.includes("NOAA20") ? 3 : source.includes("NOAA21") ? 4 : 0);
    out.push([Number(c[iLat]), Number(c[iLon]), Math.round(ms / 60000), sat, Number(c[iFrp]), c[iConf]]);
  }
  return out;
}

export async function GET() {
  const key = process.env.FIRMS_MAP_KEY;
  if (!key) return Response.json({ error: "Live feed is not configured yet (FIRMS_MAP_KEY missing on the server)." }, { status: 503 });
  const results = await Promise.all(
    SOURCES.map(async (s) => {
      try {
        const r = await fetch(`https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/${s}/${BBOX}/2`, { signal: AbortSignal.timeout(20000) });
        const text = await r.text();
        if (!r.ok || /invalid|error/i.test(text.slice(0, 200))) return { s, fires: [], error: text.slice(0, 120) };
        return { s, fires: parse(text, s) };
      } catch (e) {
        return { s, fires: [], error: String(e).slice(0, 120) };
      }
    }),
  );
  const fires = results.flatMap((x) => x.fires);
  return Response.json(
    {
      updated: new Date().toISOString(),
      fields: ["lat", "lon", "utc_minute", "sat", "frp", "confidence"],
      sources: Object.fromEntries(results.map((x) => [x.s, { n: x.fires.length, error: "error" in x ? x.error : undefined }])),
      fires,
    },
    { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=1800" } },
  );
}
