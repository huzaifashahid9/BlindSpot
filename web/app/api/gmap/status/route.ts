// Tells the maps whether Google basemaps can be offered (the key lives only on the server).
export function GET() {
  return Response.json({ configured: Boolean(process.env.GOOGLE_MAPS_API_KEY) });
}
