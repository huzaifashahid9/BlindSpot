// Ask BlindSpot: Gemini with function calling over the site's own static data.
// The API key stays on the server (GEMINI_API_KEY); the browser never sees it.
import { GoogleGenAI, type Content, type FunctionDeclaration } from "@google/genai";

const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
const MAX_ROUNDS = 5;

type Json = Record<string, unknown>;

const SYSTEM = `You are BlindSpot, an assistant for a NASA Space Apps project that harmonizes MODIS and VIIRS fire detections for Pakistan.
Rules:
- Answer ONLY with facts and numbers returned by the tools. Never invent or estimate a number. If the tools do not have it, say so.
- Always call find_region first when the user names a place, then use its id.
- Name the period your numbers cover. Data runs from 15 Nov 2023 to 14 Nov 2026.
- "Fire events" are fused detections from all satellites; FRP is fire radiative power in megawatts on the VIIRS scale.
- Suomi NPP stopped delivering fire data on 2 Nov 2026. "Only Suomi NPP" events are those the record now loses.
- Copy numbers exactly as the tools give them (you may turn a share like 0.2293 into 22.93% or 22.9%).
- Keep answers short: 2 to 5 sentences. Reply in the user's language (English or Urdu); keep place names in English letters.`;

const tools: FunctionDeclaration[] = [
  { name: "find_region", description: "Find a region (Pakistan, a province, or a district) by name. Returns matching ids.",
    parametersJsonSchema: { type: "object", properties: { name: { type: "string", description: "Place name in English, e.g. Lahore, Punjab, Sheikhupura" } }, required: ["name"] } },
  { name: "region_summary", description: "Totals for a region: fire events, total FRP, unusual days, crop burning seasons (start, peak, end), critical weeks, Lost Eyes shares, Trust Score.",
    parametersJsonSchema: { type: "object", properties: { region_id: { type: "string" } }, required: ["region_id"] } },
  { name: "daily_series", description: "Daily fire events, FRP, unusual flag, events without Suomi NPP, raw MODIS and VIIRS detection counts for a date range. Ranges over 92 days are returned as monthly totals.",
    parametersJsonSchema: { type: "object", properties: { region_id: { type: "string" }, from: { type: "string", description: "YYYY-MM-DD" }, to: { type: "string", description: "YYYY-MM-DD" } }, required: ["region_id", "from", "to"] } },
  { name: "unusual_days", description: "Days flagged unusual (harmonized FRP above the 90th percentile for that time of year) in a region, optionally within a date range.",
    parametersJsonSchema: { type: "object", properties: { region_id: { type: "string" }, from: { type: "string" }, to: { type: "string" } }, required: ["region_id"] } },
  { name: "lost_eyes", description: "What the fire record loses without Suomi NPP (and Terra, Aqua): share of events seen only by each satellite, by fire size, by month.",
    parametersJsonSchema: { type: "object", properties: { region_id: { type: "string" } }, required: ["region_id"] } },
  { name: "top_districts", description: "Rank districts by a metric: only_snpp_share, events, or unusual_days. Optionally within one province.",
    parametersJsonSchema: { type: "object", properties: { metric: { type: "string", enum: ["only_snpp_share", "events", "unusual_days"] }, province: { type: "string" } }, required: ["metric"] } },
  { name: "method_numbers", description: "Validation and method numbers: detections, duplicates removed, FRP calibration error before and after, confidence scores, satellite pass drift.",
    parametersJsonSchema: { type: "object", properties: {} } },
];

async function data<T = Json>(origin: string, path: string): Promise<T> {
  const r = await fetch(`${origin}/data/${path}`, { cache: "force-cache" });
  if (!r.ok) throw new Error(`missing data: ${path}`);
  return r.json() as Promise<T>;
}

function addDays(start: string, n: number) {
  const d = new Date(start + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

async function runTool(origin: string, name: string, a: Json): Promise<Json> {
  const regionsFile = await data<{ regions: Json[] }>(origin, "regions.json");
  const regions = regionsFile.regions;
  const id = String(a.region_id ?? "");
  switch (name) {
    case "find_region": {
      const q = String(a.name ?? "").toLowerCase().trim();
      const hits = regions.filter((r) => String(r.name).toLowerCase().includes(q) || q.includes(String(r.name).toLowerCase()));
      return { matches: hits.slice(0, 8).map((r) => ({ id: r.id, name: r.name, level: r.level, parent: r.parent })) };
    }
    case "region_summary": {
      const reg = regions.find((r) => r.id === id);
      if (!reg) return { error: "unknown region_id" };
      const cal = await data<Json>(origin, `calendar/${id}.json`).catch(() => null);
      const le = await data<{ regions: Record<string, Json> }>(origin, "lost_eyes.json");
      const l = le.regions[id] ?? null;
      return { region: reg, period: "2023-11-15 to 2026-11-14", seasons: cal?.seasons ?? [], critical_iso_weeks: cal?.critical_weeks ?? [],
        lost_eyes: l ? { events: l.events, only_share: l.only_share, snpp_saw_share: l.snpp_saw_share } : null };
    }
    case "daily_series": {
      const cal = await data<Record<string, unknown[]> & { start: string; days: number }>(origin, `calendar/${id}.json`).catch(() => null);
      if (!cal) return { error: "no calendar for region" };
      const from = String(a.from), to = String(a.to);
      const rows = [];
      for (let i = 0; i < cal.days; i++) {
        const d = addDays(cal.start, i);
        if (d < from || d > to) continue;
        rows.push({ date: d, events: cal.events[i], frp_mw: cal.frp[i], events_without_snpp: cal.events_no_snpp[i], unusual: !!cal.unusual[i],
          raw_modis_detections: cal.raw_modis[i], raw_viirs_detections: cal.raw_viirs[i] });
      }
      if (rows.length <= 92) return { rows };
      const months: Record<string, Json & { events: number; frp_mw: number; events_without_snpp: number; unusual_days: number }> = {};
      for (const r of rows) {
        const m = r.date.slice(0, 7);
        months[m] ??= { month: m, events: 0, frp_mw: 0, events_without_snpp: 0, unusual_days: 0 };
        months[m].events += Number(r.events); months[m].frp_mw += Number(r.frp_mw);
        months[m].events_without_snpp += Number(r.events_without_snpp); months[m].unusual_days += r.unusual ? 1 : 0;
      }
      return { monthly: Object.values(months).map((m) => ({ ...m, frp_mw: Math.round(m.frp_mw) })) };
    }
    case "unusual_days": {
      const cal = await data<Record<string, unknown[]> & { start: string; days: number }>(origin, `calendar/${id}.json`).catch(() => null);
      if (!cal) return { error: "no calendar for region" };
      const out = [];
      for (let i = 0; i < cal.days; i++) {
        const d = addDays(cal.start, i);
        if (a.from && d < String(a.from)) continue;
        if (a.to && d > String(a.to)) continue;
        if (cal.unusual[i]) out.push({ date: d, events: cal.events[i], frp_mw: cal.frp[i], percentile: cal.pctl[i] });
      }
      return { count: out.length, days: out.slice(-40) };
    }
    case "lost_eyes": {
      const le = await data<{ window: Json; regions: Record<string, Json> }>(origin, "lost_eyes.json");
      return { window: le.window, ...(le.regions[id] ?? { error: "no data for region" }) };
    }
    case "top_districts": {
      const metric = String(a.metric);
      const prov = a.province ? String(a.province).toLowerCase() : null;
      const provId = prov ? regions.find((r) => r.level === "province" && String(r.name).toLowerCase().includes(prov))?.id : null;
      const list = regions
        .filter((r) => r.level === "district" && (!provId || r.parent === provId) && Number(r.events ?? 0) >= (metric === "only_snpp_share" ? 500 : 1))
        .sort((x, y) => Number(y[metric] ?? 0) - Number(x[metric] ?? 0))
        .slice(0, 10)
        .map((r) => ({ id: r.id, name: r.name, [metric]: r[metric], events: r.events }));
      return { metric, province: provId ?? "all", districts: list };
    }
    case "method_numbers": {
      const v = await data<Json>(origin, "validation.json");
      return { detections: v.detections, swath_duplicates: v.swath_duplicates, events: v.events, persistent_events: v.persistent_events,
        frp_calibration: v.frp_calibration, lost_eyes_national: v.lost_eyes_national, pass_drift: v.pass_drift };
    }
  }
  return { error: `unknown tool ${name}` };
}

// Every number in the answer must appear in a tool result (allowing % and rounding).
function numbersOk(answer: string, toolText: string) {
  const known = new Set<string>();
  for (const m of toolText.matchAll(/-?\d+(?:\.\d+)?/g)) {
    const x = Number(m[0]);
    for (const v of [x, x * 100]) for (const d of [0, 1, 2]) known.add(v.toFixed(d));
  }
  const bad: string[] = [];
  const cleaned = answer.replace(/(\d),(\d{3})/g, "$1$2");
  for (const m of cleaned.matchAll(/\d+(?:\.\d+)?/g)) {
    const raw = m[0];
    const x = Number(raw);
    if (x <= 12 && Number.isInteger(x)) continue; // small counts like "2 satellites", months, sentence numbers
    if (/^(19|20)\d\d$/.test(raw)) continue; // years
    const dec = raw.includes(".") ? raw.split(".")[1].length : 0;
    if (!known.has(x.toFixed(Math.min(dec, 2)))) bad.push(raw);
  }
  return bad;
}

export async function POST(req: Request) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return Response.json({ error: "The assistant is not configured yet (GEMINI_API_KEY missing on the server)." }, { status: 503 });
  let body: { question?: string; regionId?: string; history?: { role: string; text: string }[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  const question = String(body.question ?? "").slice(0, 600);
  if (!question.trim()) return Response.json({ error: "Empty question" }, { status: 400 });
  const origin = new URL(req.url).origin;
  const ai = new GoogleGenAI({ apiKey: key });

  const contents: Content[] = (body.history ?? []).slice(0, -1).map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.text }] }));
  contents.push({ role: "user", parts: [{ text: `${question}\n\n(The user is currently looking at region id: ${body.regionId ?? "PAK"})` }] });

  const used: string[] = [];
  let toolText = "";
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const res = await ai.models.generateContent({ model: MODEL, contents, config: { systemInstruction: SYSTEM, tools: [{ functionDeclarations: tools }], temperature: 0.2 } });
        const calls = res.functionCalls ?? [];
        if (calls.length === 0) {
          const answer = (res.text ?? "").trim();
          const bad = numbersOk(answer, toolText);
          if (bad.length === 0 || attempt === 1) {
            return Response.json({ answer, checked: bad.length === 0, unchecked: bad, tools: [...new Set(used)] });
          }
          contents.push({ role: "model", parts: [{ text: answer }] });
          contents.push({ role: "user", parts: [{ text: `These numbers do not appear in any tool result: ${bad.join(", ")}. Rewrite the answer using only numbers the tools returned, calling tools again if needed.` }] });
          break;
        }
        const modelContent = res.candidates?.[0]?.content;
        if (modelContent) contents.push(modelContent);
        const parts = [];
        for (const c of calls) {
          const out = await runTool(origin, c.name ?? "", (c.args ?? {}) as Json).catch((e) => ({ error: String(e) }));
          used.push(c.name ?? "");
          toolText += JSON.stringify(out) + "\n";
          parts.push({ functionResponse: { id: c.id, name: c.name, response: { output: out } } });
        }
        contents.push({ role: "user", parts });
      }
    }
    return Response.json({ answer: "I could not finish looking that up. Try a more specific question.", checked: false, tools: [...new Set(used)] });
  } catch (e) {
    const msg = String(e);
    const limited = /429|RESOURCE_EXHAUSTED|quota/i.test(msg);
    return Response.json({ error: limited ? "The assistant is busy (rate limit). Try again in a minute." : "The assistant failed to answer. Try again." , detail: limited ? undefined : msg.slice(0, 200) }, { status: limited ? 429 : 500 });
  }
}
