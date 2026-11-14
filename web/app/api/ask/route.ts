// Ask BlindSpot: Gemini with function calling over the site's own static data.
// The API key stays on the server (GEMINI_API_KEY); the browser never sees it.
import { GoogleGenAI, ThinkingLevel, type Content, type FunctionDeclaration } from "@google/genai";

// 2.5 Flash with thinking switched off answers tool-calling questions fast and reliably.
const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
// Tried in order when a model is missing (404) or overloaded (503 / UNAVAILABLE).
// Google retires models for new keys without notice, so the chain spans two generations.
// Flash-Lite first: fastest, and the free tier gives it the most requests per minute and per day.
const MODELS = [...new Set([MODEL, "gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-2.5-flash"])];
const RETRYABLE = /429|RESOURCE_EXHAUSTED|quota|404|NOT_FOUND|not found|not supported|503|UNAVAILABLE|overloaded|high demand|500|INTERNAL|504|DEADLINE|timed? ?out|aborted/i;
const MAX_ROUNDS = 5;

// Gemini plus tool calls can take a while; the platform default may be shorter.
export const maxDuration = 60;

type Json = Record<string, unknown>;

const SYSTEM = `You are BlindSpot, an assistant for a NASA Space Apps project that harmonizes MODIS and VIIRS fire detections for Pakistan.
Rules:
- Answer ONLY with facts and numbers returned by the tools. Never invent or estimate a number. If the tools do not have it, say so.
- Always call find_region first when the user names a place, then use its id.
- Name the period your numbers cover. Use region_summary or method_numbers to see what period the data covers.
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
  { name: "day_detail", description: "Everything about one day in a region: events, harmonized events, FRP, unusual flag and percentile vs the same days in other years, the same date in other years, top districts that day, how many fires only Suomi NPP saw, strongest fire.",
    parametersJsonSchema: { type: "object", properties: { region_id: { type: "string" }, date: { type: "string", description: "YYYY-MM-DD" } }, required: ["region_id", "date"] } },
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
    case "day_detail": {
      const date = String(a.date ?? "");
      const rid = id || "PAK";
      const cal = await data<Record<string, unknown[]> & { start: string; days: number }>(origin, `calendar/${rid}.json`).catch(() => null);
      if (!cal) return { error: "unknown region_id" };
      const i = Math.round((Date.parse(date) - Date.parse(cal.start)) / 864e5);
      if (!(i >= 0 && i < cal.days)) return { error: "date outside the record" };
      // same day in other years
      const others: Json[] = [];
      for (let k = i % 365; k < cal.days; k += 365) if (Math.abs(k - i) >= 300) others.push({ date: addDays(cal.start, k), events: (cal.events_h ?? cal.events)[k] });
      const day = await data<{ fields: string[]; rows: unknown[][] }>(origin, `events/${date}.json`).catch(() => null);
      const byDistrict: Record<string, number> = {};
      let onlySnpp = 0, multi = 0, maxFrp = 0;
      if (day) {
        const f = (n: string) => day.fields.indexOf(n);
        const regionName = String(regions.find((r) => r.id === rid)?.name ?? "");
        const kids = new Set(regions.filter((r) => r.parent === rid).map((r) => String(r.name)));
        for (const row of day.rows) {
          const dist = row[f("district")] as string | null;
          if (row[f("persistent")]) continue;
          if (rid !== "PAK" && dist !== regionName && !kids.has(String(dist))) continue;
          byDistrict[dist ?? "border"] = (byDistrict[dist ?? "border"] ?? 0) + 1;
          const sats = String(row[f("sats")]);
          if (sats === "SNPP") onlySnpp++;
          if (sats.includes(",")) multi++;
          maxFrp = Math.max(maxFrp, Number(row[f("frp")]));
        }
      }
      return {
        date, region_id: rid,
        events: cal.events[i], harmonized_events: (cal.events_h ?? cal.events)[i], frp_mw: cal.frp[i],
        unusual: cal.unusual[i], percentile_vs_same_days_other_years: cal.pctl[i],
        same_day_other_years: others,
        top_districts: Object.entries(byDistrict).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([name, n]) => ({ name, events: n })),
        seen_only_by_suomi_npp: onlySnpp, seen_by_two_or_more_satellites: multi, strongest_fire_frp_mw: maxFrp,
      };
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

// Health check: open /api/ask in a browser to see whether the key is set and which model is used.
export async function GET() {
  return Response.json({ configured: Boolean(process.env.GEMINI_API_KEY), models: MODELS });
}

const EXPLAIN_CACHE = new Map<string, Json>();

function thinkingFor(m: string) {
  // no long "thinking" pass: the data does the work, and it keeps each call well inside the deadline
  if (m.startsWith("gemini-2.5")) return { thinkingConfig: { thinkingBudget: 0 } };
  if (m.startsWith("gemini-3")) return { thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL } };
  return {};
}

/** The same briefing, written from the numbers without AI (used when Gemini is unavailable). */
function plainBriefing(d: Json, name: string) {
  const n = (v: unknown) => Number(v ?? 0).toLocaleString("en-US");
  const p = d.percentile_vs_same_days_other_years as number | null;
  const top = (d.top_districts as { name: string; events: number }[] | undefined) ?? [];
  const s1 = `${name} recorded ${n(d.harmonized_events)} harmonized fire events on ${d.date}${p === null || p === undefined ? "" : p >= 100 ? ", more than on the same days in any other year on record" : `, more than ${p}% of the same days in other years`}${d.unusual ? ", which makes it an unusual day" : ""}.`;
  const s2 = top.length ? `It burned most in ${top.slice(0, 3).map((t) => `${t.name} (${n(t.events)})`).join(", ")}.` : "";
  const s3 = `${n(d.seen_only_by_suomi_npp)} fires were seen only by Suomi NPP, so a record without it would have missed them.`;
  return [s1, s2, s3].filter(Boolean).join(" ");
}

export async function POST(req: Request) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return Response.json({ error: "BlindSpot AI is not configured yet (GEMINI_API_KEY missing on the server)." }, { status: 503 });
  let body: { question?: string; regionId?: string; history?: { role: string; text: string }[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  const question = String(body.question ?? "").slice(0, 600);
  if (!question.trim()) return Response.json({ error: "Empty question" }, { status: 400 });
  const origin = new URL(req.url).origin;
  const ai = new GoogleGenAI({ apiKey: key, httpOptions: { timeout: 25000 } });

  // "Explain this day": look the day up first, then one Gemini call with no tools. If every model is
  // busy or out of quota, answer with a plain briefing written from the same numbers.
  const ex = (body as { explain?: { date?: string; regionId?: string; regionName?: string } }).explain;
  if (ex?.date && /^\d{4}-\d{2}-\d{2}$/.test(ex.date)) {
    const ck = `${ex.regionId ?? "PAK"}|${ex.date}`;
    const hit = EXPLAIN_CACHE.get(ck);
    if (hit) return Response.json(hit);
    const d = await runTool(origin, "day_detail", { region_id: ex.regionId ?? "PAK", date: ex.date }).catch((e) => ({ error: String(e) }));
    if ((d as Json).error) return Response.json({ answer: `No data for ${ex.date}: ${(d as Json).error}`, checked: false, tools: ["day_detail"] });
    const dText = JSON.stringify(d);
    const prompt = `Data for ${ex.date} in ${ex.regionName ?? ex.regionId} (JSON from BlindSpot):\n${dText}\n\nBrief an emergency manager in 3 short sentences: how unusual the day was compared with the same days in other years, where it burned most, and how many fires only Suomi NPP saw. Use only numbers from the JSON.`;
    const t1 = Date.now();
    for (let k = 0; k < MODELS.length && Date.now() - t1 < 45000; k++) {
      try {
        const res = await ai.models.generateContent({ model: MODELS[k], contents: [{ role: "user", parts: [{ text: prompt }] }], config: { systemInstruction: SYSTEM, temperature: 0.2, ...thinkingFor(MODELS[k]) } });
        const answer = (res.text ?? "").trim();
        if (!answer) continue;
        const out = { answer, checked: numbersOk(answer, dText).length === 0, tools: ["day_detail"], model: MODELS[k] };
        EXPLAIN_CACHE.set(ck, out);
        return Response.json(out);
      } catch (e) {
        console.error("explain", MODELS[k], String(e).slice(0, 300));
      }
    }
    return Response.json({ answer: plainBriefing(d as Json, ex.regionName ?? String(ex.regionId)), checked: true, tools: ["day_detail"], fallback: true });
  }

  const contents: Content[] = (body.history ?? []).slice(0, -1).map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.text }] }));
  contents.push({ role: "user", parts: [{ text: `${question}\n\n(The user is currently looking at region id: ${body.regionId ?? "PAK"})` }] });

  const used: string[] = [];
  let toolText = "";
  let mi = 0;
  const t0 = Date.now();
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const configFor = (m: string) => ({
          systemInstruction: SYSTEM,
          tools: [{ functionDeclarations: tools }],
          temperature: 0.2,
          // no long "thinking" pass: the tools do the work, and it keeps each call well inside the deadline
          ...thinkingFor(m),
        });
        let res;
        for (let tries = 0; ; tries++) {
          try {
            res = await ai.models.generateContent({ model: MODELS[mi], contents, config: configFor(MODELS[mi]) });
            break;
          } catch (e) {
            if (!RETRYABLE.test(String(e)) || tries >= 6 || Date.now() - t0 > 50000) throw e;
            // first retry the same model after a short pause, then move down the list
            // a missing model will never come back: move on at once; a busy one gets one retry first
            // a slow model (deadline) or a missing one: go straight to the next, faster model
            const gone = /429|RESOURCE_EXHAUSTED|quota|404|NOT_FOUND|not found|no longer available|not supported|504|DEADLINE|timed? ?out|aborted/i.test(String(e));
            if ((gone || tries % 2 === 1) && mi < MODELS.length - 1) mi++;
            await new Promise((r) => setTimeout(r, 600 * (tries + 1)));
          }
        }
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
          parts.push({ functionResponse: { ...(c.id ? { id: c.id } : {}), name: c.name, response: { output: out } } });
        }
        contents.push({ role: "user", parts });
      }
    }
    return Response.json({ answer: "I could not finish looking that up. Try a more specific question.", checked: false, tools: [...new Set(used)] });
  } catch (e) {
    const msg = String(e);
    console.error("ask failed", MODELS[mi], msg.slice(0, 500));
    const limited = /429|RESOURCE_EXHAUSTED|quota/i.test(msg);
    const busy = /503|UNAVAILABLE|overloaded|high demand|504|DEADLINE/i.test(msg);
    return Response.json(
      {
        error: limited ? "BlindSpot AI is busy right now. Try again in a minute." : busy ? "BlindSpot AI is busy right now. Try again in a few seconds." : "BlindSpot AI could not answer that. Try again.",
        detail: `${MODELS[mi]}: ${msg.slice(0, 220)}`,
      },
      { status: limited ? 429 : busy ? 503 : 500 },
    );
  }
}
