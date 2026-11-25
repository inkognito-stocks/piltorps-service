// Vercel serverless function: reads a photo with Claude and returns structured values.
// Env: ANTHROPIC_API_KEY (required, secret), ANTHROPIC_MODEL (optional).
// SUPABASE_URL / SUPABASE_ANON_KEY default to the project's public values.
const SUPABASE_URL = process.env.SUPABASE_URL || "https://nmjocthfuatqralbtamk.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "sb_publishable_I4VjYsEK-poY2MJn0POTsw_KODHaoFT";

type Kind = "label" | "force_gauge" | "thermometer" | "machine_display" | "speed_meter";

const PROMPTS: Record<Kind, string> = {
  label:
    "Bilden visar typskylten/etiketten på en Leister-maskin (hetluftsverktyg, svetsautomat, extruder eller luftvärmare). " +
    "Läs av modellnamn (t.ex. 'TWINNY T7', 'UNIROOF 700', 'WELDPLAST S2', 'TRIAC ST'), artikelnummer (Leister-format NNN.NNN, ibland märkt 'Art. No.'), " +
    "serienummer (märkt 'S/N', 'Serial' eller 'No.'), märkspänning (V) och märkeffekt (W). Gissa aldrig – lämna tomt (null) om ett fält inte syns tydligt.",
  force_gauge:
    "Bilden visar displayen på ett kraftmätinstrument (Hahne eller liknande) som mäter svetskraft mellan tryckrullar. " +
    "Läs av det visade kraftvärdet och enheten exakt som det står (N, kN, daN, kg, lbf). Om både aktuellt värde och toppvärde (peak/max) visas, rapportera toppvärdet som value och nämn det andra i notes.",
  thermometer:
    "Bilden visar displayen på en temperaturmätare/termometer som mäter hetluftstemperatur vid munstycket. Läs av visad temperatur och enhet.",
  speed_meter:
    "Bilden visar displayen på ett instrument som mäter svetshastighet. Läs av visat värde och enhet (m/min, cm/min, mm/s).",
  machine_display:
    "Bilden visar displayen/kontrollpanelen på en Leister-maskin. Läs av de INSTÄLLDA (bör-) värdena: temperatur (°C), hastighet (m/min) och svetskraft (N) om de visas. " +
    "Om displayen visar både bör- och ärvärde, ange börvärdet som set-värde och ärvärdet separat. Lämna null för storheter som inte visas.",
};

const TOOL = {
  name: "report_reading",
  description: "Rapportera avlästa värden från bilden.",
  input_schema: {
    type: "object",
    properties: {
      model: { type: ["string", "null"], description: "Maskinens modellnamn (endast etikett)" },
      article_number: { type: ["string", "null"] },
      serial_number: { type: ["string", "null"] },
      rated_voltage: { type: ["string", "null"], description: "t.ex. '230 V'" },
      rated_power: { type: ["string", "null"], description: "t.ex. '3450 W'" },
      value: { type: ["number", "null"], description: "Avläst värde (instrument)" },
      unit: { type: ["string", "null"] },
      temperature_set: { type: ["number", "null"] },
      temperature_actual: { type: ["number", "null"] },
      speed_set: { type: ["number", "null"] },
      speed_actual: { type: ["number", "null"] },
      force_set: { type: ["number", "null"] },
      confidence: { type: "string", enum: ["hög", "medel", "låg"] },
      notes: { type: ["string", "null"], description: "Kort kommentar på svenska om något var oklart" },
    },
    required: ["confidence"],
  },
};

async function verifyUser(authHeader: string | undefined): Promise<boolean> {
  const url = SUPABASE_URL;
  const key = SUPABASE_ANON_KEY;
  if (!authHeader?.startsWith("Bearer ")) return false;
  const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: authHeader } });
  return r.ok;
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!(await verifyUser(req.headers.authorization))) return res.status(401).json({ error: "Inte inloggad" });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: "ANTHROPIC_API_KEY saknas på servern" });

  const { kind, image } = (typeof req.body === "string" ? JSON.parse(req.body) : req.body) || {};
  if (!PROMPTS[kind as Kind]) return res.status(400).json({ error: "Okänd bildtyp" });
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/.exec(image || "");
  if (!m) return res.status(400).json({ error: "Bild saknas" });

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
      max_tokens: 1024,
      tools: [TOOL],
      tool_choice: { type: "tool", name: TOOL.name },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } },
            { type: "text", text: PROMPTS[kind as Kind] + " Använd verktyget report_reading för svaret." },
          ],
        },
      ],
    }),
  });
  const data = await r.json();
  if (!r.ok) return res.status(502).json({ error: data?.error?.message || "AI-tjänsten svarade med fel" });
  const block = (data.content || []).find((b: any) => b.type === "tool_use");
  if (!block) return res.status(502).json({ error: "Inget avläst värde returnerades" });
  return res.status(200).json(block.input);
}
