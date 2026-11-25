import { PILTORPS_LOGO, LEISTER_LOGO } from "./logoData";
import { fmt, toleranceText, type SavedMeasurement } from "./calibration";

export interface CalibrationInstrument {
  measure: string;      // "Kraft"
  name: string;         // "Hahne kraftmätare"
  device_id: string;
  certificate_no: string;
  valid_until?: string | null;
}

export interface CalibrationPdfData {
  certificateNo: string;
  customerName: string;
  orderNumber?: string | null;
  machineModel: string;
  articleNumber?: string | null;
  serialNumber?: string | null;
  ratedVoltage?: string | null;
  ratedPower?: string | null;
  date: string;
  technician?: string | null;
  measurements: SavedMeasurement[];
  safetyHighVoltage?: string | null;
  safetyGround?: string | null;
  ambientTemperature?: number | string | null;
  ambientHumidity?: number | string | null;
  instruments: CalibrationInstrument[];
  result: string;
  nextCalibrationDate?: string | null;
  comments?: string | null;
  signatureData?: string | null;
}

function esc(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const cond = (v?: string | null) => {
  if (!v) return `<td class="c">—</td>`;
  const ok = v === "Godkänd";
  const bad = v === "Ej godkänd";
  return `<td class="c ${ok ? "pass" : bad ? "fail" : ""}">${esc(v)}</td>`;
};

const fileName = (d: CalibrationPdfData) =>
  `Kalibreringscertifikat_${d.certificateNo}_${d.machineModel}_${d.serialNumber || ""}`
    .replace(/\s+/g, "_").replace(/[\\/:*?"<>|#%{}$!'`@+=&]/g, "").replace(/_+/g, "_");

export function renderCalibrationPdf(w: Window, d: CalibrationPdfData, autoPrint = true) {
  const measurementBlocks = d.measurements
    .map(
      (m) => `
    <div class="box">
      <div class="box-head"><span><b>${esc(m.label)} [${esc(m.unit)}]</b>${m.hint ? `<br/><span class="hint">(${esc(m.hint)})</span>` : ""}</span><b>${esc(toleranceText(m))}</b></div>
      <table>
        <tr class="h"><td>Inställt värde</td><td>Uppmätt värde</td><td>Differens</td><td>Status</td></tr>
        <tr><td class="c">${fmt(m.setValue, m.quantity)}</td><td class="c">${fmt(m.actualValue, m.quantity)}</td><td class="c">${fmt(m.difference, m.quantity)}</td>${cond(m.pass ? "Godkänd" : "Ej godkänd")}</tr>
      </table>
    </div>`,
    )
    .join("");

  const instrumentRows = d.instruments
    .map((i) => `<tr><td>${esc(i.measure)}</td><td>${esc(i.name)}${i.device_id ? ` · ${esc(i.device_id)}` : ""}</td><td>${esc(i.certificate_no) || "—"}${i.valid_until ? ` (giltigt t.o.m. ${esc(i.valid_until)})` : ""}</td></tr>`)
    .join("");

  const hasAmbient = d.ambientTemperature !== null && d.ambientTemperature !== undefined && d.ambientTemperature !== "" ||
    d.ambientHumidity !== null && d.ambientHumidity !== undefined && d.ambientHumidity !== "";
  const hasSafety = !!(d.safetyHighVoltage || d.safetyGround);
  const hasSig = typeof d.signatureData === "string" && d.signatureData.startsWith("data:image/");
  const resultColor = d.result === "Godkänd" ? "#2e7d32" : "#c62828";

  w.document.open();
  w.document.write(`<!DOCTYPE html><html lang="sv"><head><meta charset="utf-8"/>
<title>${esc(fileName(d))}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 10.5px; color: #1a1a1a; }
  .page { max-width: 186mm; margin: 0 auto; }
  .top { display: flex; justify-content: space-between; align-items: center; padding-bottom: 8px; border-bottom: 2px solid #1a1a1a; }
  .top img { height: 38px; }
  h1 { font-size: 20px; margin: 14px 0 2px; letter-spacing: .5px; }
  .certno { font-size: 11px; color: #555; margin-bottom: 12px; }
  .grid { display: grid; grid-template-columns: 0.9fr 1.1fr; gap: 12px; }
  .field { background: #f3f3f3; padding: 6px 8px; margin-bottom: 4px; }
  .field .k { font-size: 9px; font-weight: bold; color: #555; }
  .field .v { font-size: 15px; margin-top: 2px; }
  .box { background: #f6f6f6; padding: 8px; margin-bottom: 8px; page-break-inside: avoid; }
  .box-head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px; font-size: 10.5px; }
  .hint { font-weight: normal; color: #555; font-size: 9.5px; }
  table { width: 100%; border-collapse: collapse; }
  td { border: 1px solid #333; padding: 4px 6px; background: #fff; }
  tr.h td { background: #d9d9d9; font-weight: bold; text-align: center; }
  td.c { text-align: center; }
  td.pass { background: #a8d5a2; }
  td.fail { background: #f2a7a7; }
  .method { font-size: 9.5px; line-height: 1.45; color: #333; text-align: justify; }
  .result { margin-top: 10px; border: 2px solid ${resultColor}; color: ${resultColor}; font-weight: bold; font-size: 14px; padding: 8px 10px; display: flex; justify-content: space-between; }
  .sig img { max-height: 55px; display: block; margin-top: 4px; }
  .foot { margin-top: 14px; font-size: 9.5px; color: #444; border-top: 1px solid #bbb; padding-top: 6px; display: flex; justify-content: space-between; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body><div class="page">
  <div class="top"><img src="${PILTORPS_LOGO}" alt="Piltorps Varmluft AB"/><img src="${LEISTER_LOGO}" alt="Leister"/></div>
  <h1>Kalibreringscertifikat</h1>
  <div class="certno">Certifikat nr ${esc(d.certificateNo)}</div>

  <div class="grid">
    <div>
      <div class="field"><div class="k">Kund</div><div class="v">${esc(d.customerName)}</div></div>
      <div class="field"><div class="k">Maskintyp</div><div class="v">${esc(d.machineModel)}</div></div>
      <div class="field"><div class="k">Artikelnummer</div><div class="v">${esc(d.articleNumber) || "—"}</div></div>
      <div class="field"><div class="k">Serienummer</div><div class="v">${esc(d.serialNumber) || "—"}</div></div>
      ${d.ratedVoltage ? `<div class="field"><div class="k">Märkspänning</div><div class="v">${esc(d.ratedVoltage)}</div></div>` : ""}
      ${d.ratedPower ? `<div class="field"><div class="k">Märkeffekt</div><div class="v">${esc(d.ratedPower)}</div></div>` : ""}
      <div class="field"><div class="k">Datum</div><div class="v">${esc(d.date)}</div></div>
      ${d.orderNumber ? `<div class="field"><div class="k">Ordernummer</div><div class="v">${esc(d.orderNumber)}</div></div>` : ""}
      <div class="field sig"><div class="k">Tekniker / signatur</div><div class="v">${esc(d.technician) || ""}</div>${hasSig ? `<img src="${esc(d.signatureData)}" alt="Signatur"/>` : ""}</div>
      <div class="field"><div class="k">Mätmetod</div><div class="method">Härmed intygas att ovan angivna maskin har provats och att dess mätnoggrannhet har kontrollerats genom jämförande mätning. Jämförande mätningar har utförts med mätinstrument med spårbart kalibreringscertifikat.</div></div>
    </div>
    <div>
      ${measurementBlocks}
      ${hasSafety ? `<div class="box"><div class="box-head"><b>Allmänt</b></div>
        <table><tr class="h"><td style="text-align:left">Elsäkerhetsprov</td><td>Status</td></tr>
        <tr><td>Högspänningsprov</td>${cond(d.safetyHighVoltage)}</tr>
        <tr><td>Skyddsledare</td>${cond(d.safetyGround)}</tr></table></div>` : ""}
      ${hasAmbient ? `<div class="box"><div class="box-head"><b>Provningsförhållanden</b></div>
        <table><tr class="h"><td style="text-align:left">Omgivning</td><td>Värde</td><td>Enhet</td></tr>
        ${d.ambientTemperature !== null && d.ambientTemperature !== "" && d.ambientTemperature !== undefined ? `<tr><td>Temperatur</td><td class="c">${esc(d.ambientTemperature)}</td><td class="c">°C</td></tr>` : ""}
        ${d.ambientHumidity !== null && d.ambientHumidity !== "" && d.ambientHumidity !== undefined ? `<tr><td>Luftfuktighet</td><td class="c">${esc(d.ambientHumidity)}</td><td class="c">%</td></tr>` : ""}
        </table></div>` : ""}
      ${instrumentRows ? `<div class="box"><div class="box-head"><b>Mätinstrument</b></div>
        <table><tr class="h"><td style="text-align:left">Storhet</td><td>Instrument / ID</td><td>Certifikat nr</td></tr>${instrumentRows}</table></div>` : ""}
    </div>
  </div>

  <div class="result"><span>Resultat: ${esc(d.result)}</span><span>Nästa kalibrering: ${esc(d.nextCalibrationDate) || "—"}</span></div>
  ${d.comments ? `<div style="margin-top:8px"><b>Kommentar:</b> ${esc(d.comments)}</div>` : ""}

  <div class="foot"><span><b>Piltorps Varmluft AB</b> · Auktoriserad Leister-återförsäljare</span><span>${esc(d.certificateNo)}</span></div>
</div>
${autoPrint ? `<script>
  var imgs = Array.from(document.images), left = imgs.length;
  function done(){ if(--left<=0) window.print(); }
  if (!left) window.print(); else imgs.forEach(function(i){ if(i.complete) done(); else { i.onload=done; i.onerror=done; } });
</script>` : ""}
</body></html>`);
  w.document.close();
}
