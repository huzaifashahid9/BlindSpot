// Place search for the region picker: any village, town or landmark in Pakistan -> coordinates.
// Uses Google Places with GOOGLE_MAPS_API_KEY, which stays on the server. Cached at the CDN for a day.

export const maxDuration = 15;

type Hit = { name: string; address: string; lat: number; lon: number };
const PK = { low: { latitude: 23.5, longitude: 60.8 }, high: { latitude: 37.1, longitude: 77.9 } };
const inPK = (h: Hit) => h.lat >= 23.5 && h.lat <= 37.1 && h.lon >= 60.8 && h.lon <= 77.9;

async function placesNew(q: string, key: string): Promise<Hit[]> {
  const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.location" },
    body: JSON.stringify({ textQuery: q, regionCode: "PK", pageSize: 6, locationRestriction: { rectangle: PK } }),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`places ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const j = (await r.json()) as { places?: { displayName?: { text: string }; formattedAddress?: string; location: { latitude: number; longitude: number } }[] };
  return (j.places ?? []).map((p) => ({ name: p.displayName?.text ?? "", address: p.formattedAddress ?? "", lat: p.location.latitude, lon: p.location.longitude }));
}

// Older keys often have only the classic Places or Geocoding APIs switched on.
async function classic(q: string, key: string): Promise<Hit[]> {
  const urls = [
    `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(q)}&region=pk&key=${key}`,
    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(q)}&components=country:PK&key=${key}`,
  ];
  let last = "";
  for (const u of urls) {
    const r = await fetch(u, { signal: AbortSignal.timeout(8000) });
    const j = (await r.json()) as { status: string; error_message?: string; results?: { name?: string; formatted_address: string; geometry: { location: { lat: number; lng: number } } }[] };
    if (j.status === "OK" || j.status === "ZERO_RESULTS")
      return (j.results ?? []).slice(0, 6).map((p) => ({ name: p.name ?? p.formatted_address.split(",")[0], address: p.formatted_address, lat: p.geometry.location.lat, lon: p.geometry.location.lng }));
    last = `${j.status} ${j.error_message ?? ""}`;
  }
  throw new Error(last);
}

export async function GET(req: Request) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (!q) return Response.json({ configured: Boolean(key) });
  if (!key) return Response.json({ error: "Place search is not configured (GOOGLE_MAPS_API_KEY missing on the server)." }, { status: 503 });
  if (q.length > 120) return Response.json({ error: "Query too long." }, { status: 400 });
  const errors: string[] = [];
  for (const f of [classic, placesNew]) {
    try {
      const hits = (await f(q, key)).filter(inPK);
      return Response.json({ results: hits }, { headers: { "Cache-Control": "public, s-maxage=86400" } });
    } catch (e) {
      errors.push(String(e).slice(0, 200));
    }
  }
  console.error("places failed", errors);
  return Response.json({ error: "Place search failed. Check that the Places API (New) or Geocoding API is enabled for the key.", detail: errors.join(" | ") }, { status: 502 });
}
