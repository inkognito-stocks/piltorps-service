import { supabase } from "@/integrations/supabase/client";
import type { MachineCategory } from "@/lib/machines";

export type Quantity = "temperature" | "speed" | "force";

export interface MeasurementPoint {
  key: string;              // unique per calibration, e.g. "temperature"
  quantity: Quantity;
  label: string;            // "Varmluftstemperatur"
  hint?: string;            // "uppmätt vid munstyckets utlopp"
  unit: string;             // "°C"
  tolerance: number;        // 10
  toleranceType: "abs" | "pct";
  enabled: boolean;
  setValue: string;         // strings so the inputs can hold "4,00"
  actualValue: string;
}

export interface SavedMeasurement {
  key: string;
  quantity: Quantity;
  label: string;
  hint?: string;
  unit: string;
  tolerance: number;
  toleranceType: "abs" | "pct";
  setValue: number;
  actualValue: number;
  difference: number;
  pass: boolean;
}

export const QUANTITY_META: Record<Quantity, { label: string; hint: string; unit: string; tolerance: number; toleranceType: "abs" | "pct"; decimals: number }> = {
  temperature: { label: "Varmluftstemperatur", hint: "uppmätt vid hetluftsmunstyckets utlopp", unit: "°C", tolerance: 10, toleranceType: "abs", decimals: 0 },
  speed: { label: "Svetshastighet", hint: "", unit: "m/min", tolerance: 2, toleranceType: "pct", decimals: 2 },
  force: { label: "Svetskraft", hint: "uppmätt mellan tryckrullarna", unit: "N", tolerance: 50, toleranceType: "abs", decimals: 0 },
};

const point = (quantity: Quantity, enabled = true, overrides: Partial<MeasurementPoint> = {}): MeasurementPoint => ({
  key: quantity,
  quantity,
  label: QUANTITY_META[quantity].label,
  hint: QUANTITY_META[quantity].hint,
  unit: QUANTITY_META[quantity].unit,
  tolerance: QUANTITY_META[quantity].tolerance,
  toleranceType: QUANTITY_META[quantity].toleranceType,
  enabled,
  setValue: "",
  actualValue: "",
  ...overrides,
});

// Models where force between pressure rollers is measured by default (Twinny/Comet wedge welders,
// like Leister's own Twinny T7 certificate). Other models can switch the point on in the form.
const FORCE_MODELS = ["twinny", "comet"];

export function defaultPoints(category: MachineCategory | "", model: string): MeasurementPoint[] {
  const m = model.toLowerCase();
  switch (category) {
    case "Automatsvetsar":
      return [point("temperature"), point("speed"), point("force", FORCE_MODELS.some((x) => m.includes(x)))];
    case "Plastextrudrar":
      return [
        point("temperature", true, { key: "hot_air", label: "Förvärmningsluft" }),
        point("temperature", true, { key: "mass", label: "Plastmassa", hint: "uppmätt i extrudatet vid munstycket" }),
      ];
    case "Handmaskiner":
    case "Luftvärmare":
      return [point("temperature")];
    default:
      return [point("temperature"), point("speed", false), point("force", false)];
  }
}

export const parseNum = (v: string | number | null | undefined) => {
  if (v === null || v === undefined || v === "") return NaN;
  return parseFloat(String(v).replace(/\s/g, "").replace(",", "."));
};

export function evaluate(p: MeasurementPoint) {
  const set = parseNum(p.setValue);
  const act = parseNum(p.actualValue);
  if (Number.isNaN(set) || Number.isNaN(act)) return null;
  const difference = act - set;
  const limit = p.toleranceType === "pct" ? Math.abs(set) * (p.tolerance / 100) : p.tolerance;
  // tiny epsilon so 4.08 vs 4.00 at ±2 % passes despite float noise
  const pass = Math.abs(difference) <= limit + 1e-9;
  return { set, act, difference, limit, pass };
}

export const toleranceText = (p: { tolerance: number; toleranceType: "abs" | "pct"; unit: string }) =>
  p.toleranceType === "pct" ? `± ${p.tolerance} %` : `± ${p.tolerance} ${p.unit}`;

export const fmt = (n: number, q: Quantity) => {
  const d = QUANTITY_META[q].decimals;
  return n.toLocaleString("sv-SE", { minimumFractionDigits: d, maximumFractionDigits: d });
};

/** Convert an instrument reading to the unit used by the point. Returns null if unknown. */
export function convertToUnit(value: number, fromUnit: string | null | undefined, q: Quantity): number | null {
  const u = (fromUnit || "").trim().toLowerCase().replace("°", "");
  if (q === "force") {
    if (!u || u === "n") return value;
    if (u === "kn") return value * 1000;
    if (u === "dan") return value * 10;
    if (u === "kg" || u === "kgf") return value * 9.80665;
    if (u === "lbf" || u === "lb") return value * 4.44822;
    return null;
  }
  if (q === "temperature") {
    if (!u || u === "c") return value;
    if (u === "f") return (value - 32) * (5 / 9);
    return null;
  }
  if (q === "speed") {
    if (!u || u === "m/min") return value;
    if (u === "cm/min") return value / 100;
    if (u === "mm/s") return (value * 60) / 1000;
    if (u === "m/s") return value * 60;
    return null;
  }
  return null;
}

// ---------- AI image reading ----------

export type VisionKind = "label" | "force_gauge" | "thermometer" | "machine_display" | "speed_meter";

export interface VisionResult {
  model?: string | null;
  article_number?: string | null;
  serial_number?: string | null;
  rated_voltage?: string | null;
  rated_power?: string | null;
  value?: number | null;
  unit?: string | null;
  temperature_set?: number | null;
  temperature_actual?: number | null;
  speed_set?: number | null;
  speed_actual?: number | null;
  force_set?: number | null;
  confidence: "hög" | "medel" | "låg";
  notes?: string | null;
}

/** Shrink a camera photo so the upload stays well under the 4.5 MB function limit. */
export async function downscale(dataUrl: string, maxSide = 1600, quality = 0.85): Promise<string> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Kunde inte läsa bilden"));
    img.src = dataUrl;
  });
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

export async function readImage(kind: VisionKind, dataUrl: string): Promise<VisionResult> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const r = await fetch("/api/vision", {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ kind, image: dataUrl }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || `Avläsningen misslyckades (${r.status})`);
  return body as VisionResult;
}

// ---------- Model matching ----------

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export interface ModelRow { id: string; category: string; name: string; article_numbers: string[] }

/** Match a label reading to a known model: article number first, then normalised name. */
export function matchModel(models: ModelRow[], name?: string | null, article?: string | null): ModelRow | null {
  const art = (article || "").replace(/\s/g, "");
  if (art) {
    const byArt = models.find((m) => (m.article_numbers || []).some((a) => a.replace(/\s/g, "") === art));
    if (byArt) return byArt;
  }
  if (!name) return null;
  const n = norm(name);
  const exact = models.find((m) => norm(m.name) === n);
  if (exact) return exact;
  // longest model name contained in the label text ("LEISTER TWINNY T7 230V" -> "Twinny T7")
  const contained = models.filter((m) => n.includes(norm(m.name))).sort((a, b) => b.name.length - a.name.length);
  return contained[0] || null;
}
