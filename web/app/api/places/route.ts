// Place search for the region picker: any village, town or landmark in Pakistan -> coordinates.
// ?q=kara  -> type-ahead suggestions (Google Places Autocomplete, Pakistan only), no coordinates yet.
// ?id=...  -> coordinates for one suggestion (Place Details).
// GOOGLE_MAPS_API_KEY stays on the server. Answers are cached at the CDN for a day.

export const maxDuration = 15;

type Hit = { id?: string; name: string; address: string; lat?: number; lon?: number };
const inPK = (lat: number, lon: number) => lat >= 23.5 && lat <= 37.1 && lon >= 60.8 && lon <= 77.9;
const CACHE = { "Cache-Control": "public, s-maxage=86400" };
const G = "https://maps.googleapis.com/maps/api";

type GJ = { status: string; error_message?: string };

async function autocomplete(q: string, key: string): Promise<Hit[]> {
  const u = `${G}/place/autocomplete/json?input=${encodeURIComponent(q)}&components=country:pk&language=en&key=${key}`;
  const j = (await (await fetch(u, { signal: AbortSignal.timeout(8000) })).json()) as GJ & {
    predictions?: { place_id: string; description: string; structured_formatting?: { main_text: string; secondary_text?: string } }[];
  };
  if (j.status !== "OK" && j.status !== "ZERO_RESULTS") throw new Error(`autocomplete ${j.status} ${j.error_message ?? ""}`);
  return (j.predictions ?? []).map((p) => ({
    id: p.place_id,
    name: p.structured_formatting?.main_text ?? p.description.split(",")[0],
    address: p.structured_formatting?.secondary_text ?? p.description,
  }));
}

// Fallback when Autocomplete is not enabled on the key: full-text search, which returns coordinates directly.
async function textSearch(q: string, key: string): Promise<Hit[]> {
  const urls = [
    `${G}/place/textsearch/json?query=${encodeURIComponent(q + " Pakistan")}&region=pk&key=${key}`,
    `${G}/geocode/json?address=${encodeURIComponent(q)}&components=country:PK&key=${key}`,
  ];
  let last = "";
  for (const u of urls) {
    const j = (await (await fetch(u, { signal: AbortSignal.timeout(8000) })).json()) as GJ & {
      results?: { name?: string; formatted_address: string; geometry: { location: { lat: number; lng: number } } }[];
    };
    if (j.status === "OK" || j.status === "ZERO_RESULTS")
      return (j.results ?? [])
        .map((p) => ({ name: p.name ?? p.formatted_address.split(",")[0], address: p.formatted_address, lat: p.geometry.location.lat, lon: p.geometry.location.lng }))
        .filter((h) => inPK(h.lat, h.lon))
        .slice(0, 6);
    last = `${j.status} ${j.error_message ?? ""}`;
  }
  throw new Error(last);
}

async function details(id: string, key: string): Promise<Hit> {
  const u = `${G}/place/details/json?place_id=${encodeURIComponent(id)}&fields=geometry,name,formatted_address&key=${key}`;
  const j = (await (await fetch(u, { signal: AbortSignal.timeout(8000) })).json()) as GJ & {
    result?: { name?: string; formatted_address?: string; geometry: { location: { lat: number; lng: number } } };
  };
  if (j.status === "OK" && j.result)
    return { id, name: j.result.name ?? "", address: j.result.formatted_address ?? "", lat: j.result.geometry.location.lat, lon: j.result.geometry.location.lng };
  // Details not enabled: geocoding by place id gives the same point.
  const g = (await (await fetch(`${G}/geocode/json?place_id=${encodeURIComponent(id)}&key=${key}`, { signal: AbortSignal.timeout(8000) })).json()) as GJ & {
    results?: { formatted_address: string; geometry: { location: { lat: number; lng: number } } }[];
  };
  const r = g.results?.[0];
  if (!r) throw new Error(`details ${j.status} / geocode ${g.status}`);
  return { id, name: r.formatted_address.split(",")[0], address: r.formatted_address, lat: r.geometry.location.lat, lon: r.geometry.location.lng };
}

export async function GET(req: Request) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  const sp = new URL(req.url).searchParams;
  const q = sp.get("q")?.trim() ?? "";
  const id = sp.get("id")?.trim() ?? "";
  if (!q && !id) return Response.json({ configured: Boolean(key) });
  if (!key) return Response.json({ error: "Place search is not configured on the server." }, { status: 503 });
  if (q.length > 120 || id.length > 300) return Response.json({ error: "Query too long." }, { status: 400 });

  try {
    if (id) {
      const h = await details(id, key);
      if (!inPK(h.lat!, h.lon!)) return Response.json({ error: "That place is outside Pakistan." }, { status: 404 });
      return Response.json({ result: h }, { headers: CACHE });
    }
    let hits: Hit[] = [];
    try {
      hits = await autocomplete(q, key);
    } catch (e) {
      console.error(String(e));
    }
    if (!hits.length) hits = await textSearch(q, key);
    return Response.json({ results: hits }, { headers: CACHE });
  } catch (e) {
    console.error("places failed", String(e).slice(0, 300));
    return Response.json({ error: "Place search is unavailable right now. Try again in a moment." }, { status: 502 });
  }
}
