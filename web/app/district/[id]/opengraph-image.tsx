import { ImageResponse } from "next/og";
import { scorecardIds, scorecard } from "@/lib/scorecard";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "BlindSpot fire scorecard";

export async function generateStaticParams() {
  return scorecardIds().map((id) => ({ id }));
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = scorecard(id);
  const r = s?.season.ratio ?? null;
  const tiles: [string, string, string][] = s
    ? [
        ["Fires since 2000", s.events.toLocaleString("en-US"), s.rank ? `#${s.rank} of ${s.rankOf}` : "harmonized"],
        ["This season", r === null ? "n/a" : r >= 1.15 || r <= 0.85 ? `${r.toFixed(1)}x usual` : "normal", `${s.season.now.toLocaleString("en-US")} so far`],
        ["Only Suomi NPP saw", s.onlySnpp !== null ? `${(s.onlySnpp * 100).toFixed(1)}%` : "n/a", "now unrecorded"],
        ["Trust Score", s.trustNow !== null ? `${Math.round(s.trustNow)}` : "n/a", "out of 100"],
      ]
    : [];
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: 64,
          background: "radial-gradient(ellipse at 85% 0%, rgba(249,115,22,0.35), transparent 55%), #070a12",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", fontSize: 34, fontWeight: 700 }}>
            <span>Blind</span>
            <span style={{ color: "#fb923c" }}>Spot</span>
          </div>
          <div style={{ display: "flex", fontSize: 22, color: "#fdba74", letterSpacing: 4 }}>FIRE SCORECARD</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 48 }}>
          <div style={{ display: "flex", fontSize: 92, fontWeight: 800, lineHeight: 1 }}>{s?.name ?? "Pakistan"}</div>
          <div style={{ display: "flex", fontSize: 32, color: "#94a3b8", marginTop: 12 }}>{s?.province ?? (s?.level === "country" ? "Pakistan, 2000 to 2026" : "")}</div>
        </div>
        <div style={{ display: "flex", marginTop: "auto", gap: 20 }}>
          {tiles.map(([k, v, sub]) => (
            <div
              key={k}
              style={{ display: "flex", flexDirection: "column", flex: 1, padding: 24, borderRadius: 20, border: "2px solid #1e293b", background: "rgba(15,23,42,0.85)" }}
            >
              <div style={{ display: "flex", fontSize: 20, color: "#64748b" }}>{k}</div>
              <div style={{ display: "flex", fontSize: 46, fontWeight: 800, color: "#fdba74", marginTop: 8 }}>{v}</div>
              <div style={{ display: "flex", fontSize: 20, color: "#94a3b8", marginTop: 4 }}>{sub}</div>
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
