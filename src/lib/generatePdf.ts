import { PILTORPS_LOGO, LEISTER_LOGO } from "./logoData";
import { toast } from "sonner";

export interface PdfInspectionRow {
  label: string;
  status: string;
  comment: string;
}

export interface PdfCalibrationRow {
  label: string;
  unit?: string;
  refValue?: number | string | null;
  measured: string;
  diff: string;
  status: string;
}

export interface PdfMaterialRow {
  label: string;
  unit?: string;
  measured: string;
  calculated: string;
  status: string;
}

export interface ProtocolData {
  customerName: string;
  orderNumber: string;
  technician: string;
  protocolDate: string;
  machineCategory: string;
  machineModel: string;
  serialNumber: string;
  operationHours: string;
  driveMotorHours: string;
  fanMotorHours: string;
  materialType: string;
  inspectionRows: PdfInspectionRow[];
  protectiveEarth: string;
  hvTest: string;
  calibrationRows: PdfCalibrationRow[];
  materialRow?: PdfMaterialRow | null;
  finalAssessment: string;
  nextCalibrationDate: string;
  signatureData: string;
  timeSpent?: string;
  actionsPerformed?: string;
  comments?: string;
}

// Escape user-provided text before interpolating into HTML to prevent XSS.
function esc(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Open the print window synchronously inside the click handler so Safari/iOS
// popup blocking doesn't kill it after an await.
export function openPdfWindow(): Window | null {
  const w = window.open("", "_blank");
  if (!w) {
    toast.error("Tillåt popup-fönster för den här sidan för att få PDF:en");
    return null;
  }
  w.document.write(
    `<!DOCTYPE html><html><head><meta charset="utf-8"/><title> </title></head><body style="font-family:Arial,Helvetica,sans-serif;padding:24px;color:#1a1a1a;">Genererar protokoll...</body></html>`
  );
  return w;
}

// Build a sensible default "Save as PDF" filename.
function buildFileName(data: ProtocolData): string {
  const raw = `Serviceprotokoll_${data.customerName}_${data.machineModel}_${data.protocolDate}`;
  return raw
    .replace(/\s+/g, "_")
    .replace(/[\\/:*?"<>|#%{}$!'`@+=&]/g, "")
    .replace(/_+/g, "_");
}

const withUnit = (value: string, unit?: string) =>
  value ? `${esc(value)}${unit ? " " + esc(unit) : ""}` : "";

export function renderProtocolPdf(w: Window, data: ProtocolData) {
  _renderPdf(w, data, PILTORPS_LOGO, LEISTER_LOGO);
}

function _renderPdf(w: Window, data: ProtocolData, piltorpsLogo: string, leisterLogo: string) {
  const inspectionHtml = data.inspectionRows
    .map(
      (r) =>
        `<tr><td class="cell">${esc(r.label)}</td><td class="cell center">${esc(r.status)}</td><td class="cell">${esc(r.comment)}</td></tr>`
    )
    .join("");

  // Only draw a row when something was actually measured — a lone "OK" status
  // must not produce an empty calibration row.
  const calibrationRows = (data.calibrationRows || [])
    .filter((r) => r.measured || r.diff)
    .map(
      (r) =>
        `<tr><td class="cell">${esc(r.label)}</td><td class="cell center">${withUnit(r.measured, r.unit)}</td><td class="cell center">${withUnit(r.diff, r.unit)}</td><td class="cell center">${esc(r.status)}</td></tr>`
    );

  const showHours = data.operationHours || data.driveMotorHours || data.fanMotorHours;

  const calibrationSection = calibrationRows.length > 0 ? `
    <h2>3. Temperaturkalibrering</h2>
    <table>
      <tr class="header"><td class="cell">Kontrollpunkt</td><td class="cell center">Uppmätt</td><td class="cell center">Diff</td><td class="cell center">Status</td></tr>
      ${calibrationRows.join("")}
    </table>` : "";

  const mat = data.materialRow;
  const matUnit = mat?.unit ? ` (${esc(mat.unit)})` : "";
  const materialSection = (mat && (mat.measured || mat.calculated)) ? `
    <h2>4. Uppmätt massa</h2>
    <table>
      <tr class="header"><td class="cell">Kontrollpunkt</td><td class="cell center">Uppmätt${matUnit}</td><td class="cell center">Beräknat${matUnit}</td><td class="cell center">Status</td></tr>
      <tr><td class="cell">${esc(mat.label)}${data.materialType ? " (" + esc(data.materialType) + ")" : ""}</td><td class="cell center">${esc(mat.measured)}</td><td class="cell center">${esc(mat.calculated)}</td><td class="cell center">${esc(mat.status)}</td></tr>
    </table>` : "";


  const actionsSection = data.actionsPerformed ? `
    <h2>Utförda åtgärder</h2>
    <div class="assessment">${esc(data.actionsPerformed)}</div>` : "";

  // Determine assessment border color
  let assessmentBorderColor = "#bbb";
  if (data.finalAssessment === "Godkänd för drift") assessmentBorderColor = "#27ae60";
  else if (data.finalAssessment === "Godkänd med anmärkning") assessmentBorderColor = "#f39c12";
  else if (data.finalAssessment === "Ej godkänd") assessmentBorderColor = "#e74c3c";

  const hasSignature = typeof data.signatureData === "string" && data.signatureData.startsWith("data:image/");

  w.document.open();
  w.document.write(`<!DOCTYPE html><html><head>
<meta charset="utf-8"/>
<title>${esc(buildFileName(data))}</title>
<style>
  @page { size: A4; margin: 15mm; margin-top: 10mm; margin-bottom: 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #1a1a1a; padding: 0; }
  .page { max-width: 210mm; margin: 0 auto; }
  .logo-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 2px solid #1a1a1a; }
  .logo-header img { height: 40px; }
  h1 { font-size: 16px; text-align: center; margin: 10px 0 8px; text-transform: uppercase; letter-spacing: 1px; }
  h2 { font-size: 12px; margin: 12px 0 4px; padding: 3px 6px; background: #e8e8e8; border-left: 3px solid #1a1a1a; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; page-break-inside: avoid; }
  tr { page-break-inside: avoid; }
  .cell { border: 1px solid #bbb; padding: 4px 6px; font-size: 10px; }
  .center { text-align: center; }
  .header td { background: #f0f0f0; font-weight: bold; font-size: 10px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 16px; margin-bottom: 8px; font-size: 10px; }
  .info-grid span { padding: 2px 0; }
  .info-grid strong { min-width: 110px; display: inline-block; }
  .safety-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; margin-bottom: 8px; }
  .safety-item { font-size: 10px; padding: 3px 0; }
  .assessment { border: 2px solid ${assessmentBorderColor}; padding: 6px; margin: 8px 0; min-height: 40px; font-size: 10px; border-radius: 4px; }
  .section-block { page-break-inside: avoid; }
  .sig-section { margin-top: 60px; page-break-inside: avoid; }
  .sig-block p { font-size: 10px; margin-bottom: 4px; }
  .sig-img { max-height: 60px; display: block; border: 2px solid #1a1a1a; padding: 4px; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .page { max-width: none; }
    button, .no-print, nav, .scroll-area, [data-radix-scroll-area-viewport] { display: none !important; }
  }
</style>
</head><body>
<div class="page">
  <div class="logo-header">
    <img src="${piltorpsLogo}" alt="Piltorps Varmluft AB" />
    <img src="${leisterLogo}" alt="Leister" />
  </div>

  <h1>Service- &amp; Kalibreringsprotokoll</h1>

  <div class="info-grid">
    <span><strong>Kund:</strong> ${esc(data.customerName)}</span>
    <span><strong>Ordernummer:</strong> ${esc(data.orderNumber) || "—"}</span>
    <span><strong>Tekniker:</strong> ${esc(data.technician) || "—"}</span>
    <span><strong>Datum:</strong> ${esc(data.protocolDate)}</span>
    <span><strong>Kategori:</strong> ${esc(data.machineCategory)}</span>
    <span><strong>Modell:</strong> ${esc(data.machineModel)}</span>
    <span><strong>Serienummer:</strong> ${esc(data.serialNumber) || "—"}</span>
  </div>

  ${showHours ? `
  <table>
    <tr class="header">
      ${data.operationHours ? '<td class="cell center">Drifttid</td>' : ""}
      ${data.driveMotorHours ? '<td class="cell center">Drivmotor</td>' : ""}
      ${data.fanMotorHours ? '<td class="cell center">Fläktmotor</td>' : ""}
    </tr>
    <tr>
      ${data.operationHours ? `<td class="cell center">${esc(data.operationHours)} h</td>` : ""}
      ${data.driveMotorHours ? `<td class="cell center">${esc(data.driveMotorHours)} h</td>` : ""}
      ${data.fanMotorHours ? `<td class="cell center">${esc(data.fanMotorHours)} h</td>` : ""}
    </tr>
  </table>` : ""}

  <div class="section-block">
  <h2>1. Okulärbesiktning &amp; Funktion</h2>
  <table>
    <tr class="header"><td class="cell">Kontrollpunkt</td><td class="cell center">Status</td><td class="cell">Kommentar</td></tr>
    ${inspectionHtml}
  </table>
  </div>

  <div class="section-block">
  <h2>2. Elsäkerhetsprovning</h2>
  <div class="safety-grid">
    <div class="safety-item"><strong>Skyddsjord:</strong> ${esc(data.protectiveEarth) || "—"}</div>
    <div class="safety-item"><strong>HV-test:</strong> ${esc(data.hvTest) || "—"}</div>
  </div>
  </div>

  ${calibrationSection}
  ${materialSection}
  ${actionsSection}

  <div class="section-block">
  <h2>Slutbedömning</h2>
  <div class="assessment">${esc(data.finalAssessment)}</div>
  ${data.comments ? `<div style="margin-top:6px;font-size:11px;"><strong>Kommentar:</strong> ${esc(data.comments)}</div>` : ""}

  <div class="info-grid" style="margin-top:8px;">
    <span style="font-weight:bold;font-size:11px;">Nästa rekommenderade kalibrering &amp; service: ${esc(data.nextCalibrationDate) || "—"}</span>
  </div>
  </div>

  <div class="sig-section">
    <div class="sig-block">
      <p><strong>Teknikers signatur:</strong></p>
      ${hasSignature ? `<img class="sig-img" src="${esc(data.signatureData)}" alt="Signatur" />` : '<div style="border:2px solid #1a1a1a;height:50px;width:200px;"></div>'}
    </div>
  </div>
</div>

<script>
  var imgs = document.querySelectorAll('img');
  var loaded = 0;
  var total = imgs.length;
  if (total === 0) { window.print(); }
  else {
    imgs.forEach(function(img) {
      if (img.complete) { loaded++; if(loaded>=total) window.print(); }
      else {
        img.onload = function() { loaded++; if(loaded>=total) window.print(); };
        img.onerror = function() { loaded++; if(loaded>=total) window.print(); };
      }
    });
  }
</script>
</body></html>`);
  w.document.close();
}

