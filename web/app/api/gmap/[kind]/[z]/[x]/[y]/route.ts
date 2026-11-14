// Google Maps tiles (Map Tiles API) through our server, so GOOGLE_MAPS_API_KEY never reaches the browser.
// Sessions are created once per map kind and reused until they expire.

const KINDS: Record<string, object> = {
  dark: {
    mapType: "roadmap",
    styles: [
      { stylers: [{ invert_lightness: true }, { saturation: -90 }, { lightness: -10 }] },
      { elementType: "labels.text.fill", stylers: [{ color: "#94a3b8" }] },
      { featureType: "water", stylers: [{ color: "#0b1220" }] },
    ],
  },
  roadmap: { mapType: "roadmap" },
  satellite: { mapType: "satellite" },
  hybrid: { mapType: "satellite", layerTypes: ["layerRoadmap"] },
  terrain: { mapType: "terrain", layerTypes: ["layerRoadmap"] },
};
const sessions = new Map<string, { id: string; until: number }>();

async function session(kind: string, key: string) {
  const s = sessions.get(kind);
  if (s && s.until > Date.now() + 60_000) return s.id;
  const r = await fetch(`https://tile.googleapis.com/v1/createSession?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...KINDS[kind], language: "en-US", region: "PK" }),
  });
  if (!r.ok) throw new Error(`createSession ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = (await r.json()) as { session: string; expiry: string };
  sessions.set(kind, { id: j.session, until: Number(j.expiry) * 1000 });
  return j.session;
}

export async function GET(_req: Request, ctx: { params: Promise<{ kind: string; z: string; x: string; y: string }> }) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  const { kind, z, x, y } = await ctx.params;
  if (!key) return new Response("Google maps not configured", { status: 503 });
  if (!KINDS[kind] || ![z, x, y].every((v) => /^\d{1,7}$/.test(v)) || Number(z) > 20) return new Response("Bad tile", { status: 400 });
  try {
    let id = await session(kind, key);
    let r = await fetch(`https://tile.googleapis.com/v1/2dtiles/${z}/${x}/${y}?session=${id}&key=${key}`);
    if (r.status === 401 || r.status === 403) {
      sessions.delete(kind);
      id = await session(kind, key);
      r = await fetch(`https://tile.googleapis.com/v1/2dtiles/${z}/${x}/${y}?session=${id}&key=${key}`);
    }
    if (!r.ok) return new Response(null, { status: r.status === 404 ? 404 : 502 });
    // Google allows its tiles to be kept for a day by the viewer's browser, not by shared caches.
    return new Response(r.body, { headers: { "Content-Type": r.headers.get("content-type") ?? "image/png", "Cache-Control": "private, max-age=86400" } });
  } catch (e) {
    console.error("gmap tile failed", String(e).slice(0, 300));
    return new Response(null, { status: 502 });
  }
}
