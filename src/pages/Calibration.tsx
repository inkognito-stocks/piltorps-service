import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addMonths, format } from "date-fns";
import { Check, ChevronLeft, ChevronRight, FileText, Gauge, Plus, Save, Trash2, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json, Tables } from "@/integrations/supabase/types";
import { machineCategories, TECHNICIANS, serviceIntervalMonths, type MachineCategory } from "@/lib/machines";
import {
  convertToUnit, defaultPoints, evaluate, fmt, matchModel, parseNum, QUANTITY_META, toleranceText,
  type MeasurementPoint, type Quantity, type SavedMeasurement, type VisionResult,
} from "@/lib/calibration";
import { renderCalibrationPdf, type CalibrationInstrument, type CalibrationPdfData } from "@/lib/generateCalibrationPdf";
import { openPdfWindow } from "@/lib/generatePdf";
import { getPhotoSignedUrls } from "@/lib/photoStorage";
import PhotoReader from "@/components/PhotoReader";
import SignaturePad from "@/components/SignaturePad";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type Tab = "new" | "history" | "instruments";
type Machine = Tables<"machines"> & { customers: { name: string } | null };
type Instrument = Tables<"instruments">;
type CalibrationRow = Tables<"calibrations"> & { customers: { name: string } | null };

const MEASURE_LABEL: Record<Quantity, string> = { force: "Kraft", temperature: "Temperatur", speed: "Hastighet" };
const PHOTO_KIND: Record<Quantity, "force_gauge" | "thermometer" | "speed_meter"> = {
  force: "force_gauge", temperature: "thermometer", speed: "speed_meter",
};
const BUCKET = "machine-photos";

export default function CalibrationPage() {
  const [tab, setTab] = useState<Tab>("new");
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Gauge className="h-6 w-6" /> Kalibrering</h1>
          <p className="text-muted-foreground mt-1">Fota etiketten, mät och få ett kalibreringscertifikat.</p>
        </div>
        <div className="inline-flex rounded-lg border bg-card p-1 text-sm">
          {([["new", "Ny"], ["history", "Historik"], ["instruments", "Instrument"]] as [Tab, string][]).map(([t, l]) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-md font-medium ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>{l}</button>
          ))}
        </div>
      </div>
      {tab === "new" && <NewCalibration onSaved={() => setTab("history")} />}
      {tab === "history" && <History />}
      {tab === "instruments" && <Instruments />}
    </div>
  );
}

// =====================================================================
// New calibration wizard
// =====================================================================

function NewCalibration({ onSaved }: { onSaved: () => void }) {
  const qc = useQueryClient();
  const today = format(new Date(), "yyyy-MM-dd");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const pdfWindowRef = useRef<Window | null>(null);

  // --- Step 1: machine
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [labelNote, setLabelNote] = useState<string | null>(null);
  const [category, setCategory] = useState<MachineCategory | "">("");
  const [model, setModel] = useState("");
  const [articleNumber, setArticleNumber] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [ratedVoltage, setRatedVoltage] = useState("");
  const [ratedPower, setRatedPower] = useState("");
  const [machine, setMachine] = useState<Machine | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerOpen, setCustomerOpen] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [lookupDone, setLookupDone] = useState(false);

  // --- Step 2: measurements
  const [points, setPoints] = useState<MeasurementPoint[]>([]);
  const [pointsModel, setPointsModel] = useState("");
  const [aiNotes, setAiNotes] = useState<Record<string, string>>({});
  const [instrumentIds, setInstrumentIds] = useState<Partial<Record<Quantity, string>>>({});
  const [ambientTemp, setAmbientTemp] = useState("");
  const [ambientHumidity, setAmbientHumidity] = useState("");
  const [safetyHv, setSafetyHv] = useState("");
  const [safetyGround, setSafetyGround] = useState("");

  // --- Step 3: sign
  const [technician, setTechnician] = useState("");
  const [date, setDate] = useState(today);
  const [orderNumber, setOrderNumber] = useState("");
  const [nextDate, setNextDate] = useState(format(addMonths(new Date(), 12), "yyyy-MM-dd"));
  const [resultOverride, setResultOverride] = useState<string | null>(null);
  const [comments, setComments] = useState("");
  const [signature, setSignature] = useState("");

  const { data: models = [] } = useQuery({
    queryKey: ["machine-models-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("machine_models").select("*").eq("active", true).order("sort_order");
      if (error) throw error;
      return data;
    },
  });
  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });
  const { data: instruments = [] } = useQuery({
    queryKey: ["instruments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("instruments").select("*").eq("active", true).order("name");
      if (error) throw error;
      return data;
    },
  });

  // Pre-select the first active instrument per quantity.
  useEffect(() => {
    setInstrumentIds((prev) => {
      const next = { ...prev };
      (["force", "temperature", "speed"] as Quantity[]).forEach((q) => {
        if (!next[q]) next[q] = instruments.find((i) => i.measure === q)?.id;
      });
      return next;
    });
  }, [instruments]);

  const customer = customers.find((c) => c.id === customerId);
  const filteredCustomers = customers.filter((c) => c.name.toLowerCase().includes(customerSearch.toLowerCase()));

  // Look up an existing machine by serial number (across all customers).
  const lookupMachine = async (serial: string) => {
    setLookupDone(false);
    const sn = serial.trim();
    if (!sn) { setMachine(null); setLookupDone(true); return; }
    const { data } = await supabase.from("machines").select("*, customers(name)").ilike("serial_number", sn).limit(1);
    const m = (data?.[0] as Machine | undefined) || null;
    setMachine(m);
    if (m) {
      setCustomerId(m.customer_id);
      setCustomerSearch(m.customers?.name || "");
      setCategory(m.machine_category as MachineCategory);
      setModel((cur) => cur || m.machine_model);
      if (!articleNumber && m.article_number) setArticleNumber(m.article_number);
    }
    setLookupDone(true);
  };

  const onLabel = async (r: VisionResult, photo: string) => {
    setPhotos((p) => ({ ...p, label: photo }));
    setLabelNote(r.notes || null);
    setArticleNumber(r.article_number || "");
    setSerialNumber(r.serial_number || "");
    setRatedVoltage(r.rated_voltage || "");
    setRatedPower(r.rated_power || "");
    const match = matchModel(models, r.model, r.article_number);
    if (match) {
      setCategory(match.category as MachineCategory);
      setModel(match.name);
      toast.success(`Identifierad: ${match.name}`);
    } else {
      setCategory("");
      setModel("");
      toast.warning(`Okänd modell "${r.model || "?"}" – välj modell manuellt.`);
    }
    await lookupMachine(r.serial_number || "");
  };

  const goToMeasurements = () => {
    if (!model || !category) return toast.error("Välj maskinmodell");
    if (!customerId && !(creatingCustomer && newCustomerName.trim())) return toast.error("Välj eller skapa kund");
    // Keep entered values if the user goes back and forth with the same model.
    if (pointsModel !== model || !points.length) {
      setPoints(defaultPoints(category, model));
      setPointsModel(model);
    }
    setStep(2);
  };

  // --- measurement helpers
  const updatePoint = (key: string, patch: Partial<MeasurementPoint>) =>
    setPoints((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  const onDisplay = (r: VisionResult, photo: string) => {
    setPhotos((p) => ({ ...p, display: photo }));
    const found: string[] = [];
    setPoints((ps) => ps.map((p) => {
      const v = p.quantity === "temperature" ? r.temperature_set : p.quantity === "speed" ? r.speed_set : r.force_set;
      // Extruders: the display temperature is the hot-air set value, never the mass temperature.
      if (v === null || v === undefined || p.key === "mass") return p;
      found.push(p.label);
      return { ...p, setValue: String(v).replace(".", ",") };
    }));
    setAiNotes((n) => ({ ...n, display: r.notes || "" }));
    if (found.length) toast.success(`Inställda värden avlästa: ${found.join(", ")}`);
    else toast.warning("Hittade inga inställda värden på displayen");
  };

  const onInstrument = (p: MeasurementPoint) => (r: VisionResult, photo: string) => {
    setPhotos((ph) => ({ ...ph, [p.key]: photo }));
    if (r.value === null || r.value === undefined) {
      toast.warning("Kunde inte läsa av något värde");
      return;
    }
    const v = convertToUnit(r.value, r.unit, p.quantity);
    if (v === null) {
      toast.warning(`Okänd enhet "${r.unit}" – skriv in värdet manuellt`);
      return;
    }
    const decimals = QUANTITY_META[p.quantity].decimals;
    updatePoint(p.key, { actualValue: v.toFixed(decimals).replace(".", ",") });
    setAiNotes((n) => ({ ...n, [p.key]: [r.unit && r.unit.toLowerCase() !== p.unit.toLowerCase() ? `Omräknat från ${r.value} ${r.unit}` : "", r.notes || ""].filter(Boolean).join(" · ") }));
  };

  const activePoints = points.filter((p) => p.enabled);
  const evaluated = activePoints.map((p) => ({ p, e: evaluate(p) }));
  const allMeasured = evaluated.length > 0 && evaluated.every((x) => x.e);
  const autoResult = allMeasured && evaluated.every((x) => x.e!.pass) && safetyHv !== "Ej godkänd" && safetyGround !== "Ej godkänd" ? "Godkänd" : "Ej godkänd";
  const result = resultOverride || autoResult;
  const usedQuantities = Array.from(new Set(activePoints.map((p) => p.quantity)));

  const instrumentSnapshot = (): CalibrationInstrument[] =>
    usedQuantities
      .map((q) => instruments.find((i) => i.id === instrumentIds[q]))
      .filter(Boolean)
      .map((i) => ({
        measure: MEASURE_LABEL[i!.measure as Quantity],
        name: i!.name,
        device_id: i!.device_id || "",
        certificate_no: i!.certificate_no || "",
        valid_until: i!.certificate_valid_until,
      }));

  const expiredInstruments = usedQuantities
    .map((q) => instruments.find((i) => i.id === instrumentIds[q]))
    .filter((i) => i?.certificate_valid_until && i.certificate_valid_until < date);

  const resetAll = () => {
    setStep(1); setPhotos({}); setLabelNote(null); setCategory(""); setModel(""); setArticleNumber(""); setSerialNumber("");
    setRatedVoltage(""); setRatedPower(""); setMachine(null); setCustomerId(null); setCustomerSearch(""); setNewCustomerName("");
    setCreatingCustomer(false); setLookupDone(false); setPoints([]); setPointsModel(""); setAiNotes({}); setAmbientTemp(""); setAmbientHumidity("");
    setSafetyHv(""); setSafetyGround(""); setOrderNumber(""); setResultOverride(null); setComments(""); setSignature("");
    setDate(today); setNextDate(format(addMonths(new Date(), 12), "yyyy-MM-dd"));
  };

  const save = useMutation({
    mutationFn: async () => {
      let custId = customerId;
      let custName = customer?.name || "";
      if (!custId) {
        const { data, error } = await supabase.from("customers").insert({ name: newCustomerName.trim() }).select().single();
        if (error) throw error;
        custId = data.id; custName = data.name;
      }

      let machineId = machine && machine.customer_id === custId ? machine.id : null;
      if (!machineId) {
        const { data, error } = await supabase.from("machines").insert({
          customer_id: custId!, machine_category: category, machine_model: model,
          serial_number: serialNumber.trim() || null, article_number: articleNumber.trim() || null,
          service_interval_months: serviceIntervalMonths[category as MachineCategory] ?? 12,
        }).select().single();
        if (error) {
          if ((error as { code?: string }).code === "23505") throw new Error("Kunden har redan en maskin med detta serienummer");
          throw error;
        }
        machineId = data.id;
      } else if (articleNumber && !machine!.article_number) {
        await supabase.from("machines").update({ article_number: articleNumber.trim() }).eq("id", machineId);
      }

      // Teach the model list this article number so the next label is matched instantly.
      const mm = models.find((m) => m.name === model && m.category === category);
      const art = articleNumber.trim();
      if (mm && art && !(mm.article_numbers || []).includes(art)) {
        await supabase.from("machine_models").update({ article_numbers: [...(mm.article_numbers || []), art] }).eq("id", mm.id);
      }

      const measurements: SavedMeasurement[] = evaluated.map(({ p, e }) => ({
        key: p.key, quantity: p.quantity, label: p.label, hint: p.hint, unit: p.unit,
        tolerance: p.tolerance, toleranceType: p.toleranceType,
        setValue: e!.set, actualValue: e!.act, difference: Math.round(e!.difference * 1000) / 1000, pass: e!.pass,
      }));
      const instrumentsSnap = instrumentSnapshot();

      const { data: cal, error } = await supabase.from("calibrations").insert({
        customer_id: custId!, machine_id: machineId, calibration_date: date, technician: technician || null,
        order_number: orderNumber || null, machine_category: category, machine_model: model,
        article_number: art || null, serial_number: serialNumber.trim() || null,
        rated_voltage: ratedVoltage || null, rated_power: ratedPower || null,
        ambient_temperature: Number.isNaN(parseNum(ambientTemp)) ? null : parseNum(ambientTemp),
        ambient_humidity: Number.isNaN(parseNum(ambientHumidity)) ? null : parseNum(ambientHumidity),
        measurements: measurements as unknown as Json, instruments: instrumentsSnap as unknown as Json,
        safety_high_voltage: safetyHv || null, safety_ground_conductor: safetyGround || null,
        result, next_calibration_date: nextDate || null, comments: comments || null,
        signature_data: signature || null, ai_readings: aiNotes as unknown as Json,
      }).select().single();
      if (error) throw error;

      // Photos are evidence for the certificate; failure here must not lose the calibration.
      try {
        const paths: Record<string, string> = {};
        for (const [k, dataUrl] of Object.entries(photos)) {
          const blob = await (await fetch(dataUrl)).blob();
          const path = `calibrations/${cal.id}/${k}.jpg`;
          const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: true });
          if (upErr) throw upErr;
          paths[k] = path;
        }
        if (Object.keys(paths).length) await supabase.from("calibrations").update({ photo_paths: paths }).eq("id", cal.id);
      } catch (e) {
        console.error(e);
        toast.error("Kalibreringen sparades men bilderna kunde inte laddas upp.");
      }

      const pdf: CalibrationPdfData = {
        certificateNo: cal.certificate_no, customerName: custName, orderNumber, machineModel: model,
        articleNumber: art, serialNumber, ratedVoltage, ratedPower, date, technician, measurements,
        safetyHighVoltage: safetyHv, safetyGround, ambientTemperature: ambientTemp, ambientHumidity,
        instruments: instrumentsSnap, result, nextCalibrationDate: nextDate, comments, signatureData: signature,
      };
      return pdf;
    },
    onSuccess: (pdf) => {
      toast.success(`Certifikat ${pdf.certificateNo} sparat`);
      const w = pdfWindowRef.current;
      if (w && !w.closed) renderCalibrationPdf(w, pdf);
      pdfWindowRef.current = null;
      qc.invalidateQueries({ queryKey: ["calibrations"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      qc.invalidateQueries({ queryKey: ["machine-models-all"] });
      resetAll();
      onSaved();
    },
    onError: (e: Error) => {
      pdfWindowRef.current?.close();
      pdfWindowRef.current = null;
      toast.error(e.message);
    },
  });

  const handleSave = () => {
    if (!allMeasured) return toast.error("Alla aktiva mätpunkter behöver inställt och uppmätt värde");
    pdfWindowRef.current = openPdfWindow(); // must open inside the click (Safari)
    save.mutate();
  };

  // ------------------------------------------------------------------
  return (
    <div className="space-y-6">
      <Stepper step={step} />

      {step === 1 && (
        <div className="section-card space-y-5">
          <h2 className="form-section-title">1. Fota maskinens etikett</h2>
          <p className="text-sm text-muted-foreground">Typskylten med modell, artikelnummer och serienummer. Appen känner igen maskinen och kopplar den till kunden om den finns.</p>
          <PhotoReader kind="label" label="Fota etiketten" size="lg" variant="default" photo={photos.label} onResult={onLabel} />
          {labelNote && <p className="text-xs text-muted-foreground italic">AI: {labelNote}</p>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Kategori</Label>
              <Select value={category} onValueChange={(v) => { setCategory(v as MachineCategory); setModel(""); }}>
                <SelectTrigger><SelectValue placeholder="Välj kategori" /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(machineCategories) as MachineCategory[]).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Modell</Label>
              <Select value={model} onValueChange={setModel} disabled={!category}>
                <SelectTrigger><SelectValue placeholder="Välj modell" /></SelectTrigger>
                <SelectContent>
                  {models.filter((m) => m.category === category).map((m) => <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Artikelnummer</Label><Input value={articleNumber} onChange={(e) => setArticleNumber(e.target.value)} placeholder="t.ex. 164.197" /></div>
            <div>
              <Label>Serienummer</Label>
              <Input value={serialNumber} onChange={(e) => { setSerialNumber(e.target.value); setLookupDone(false); }}
                onBlur={() => lookupMachine(serialNumber)} />
            </div>
            <div><Label>Märkspänning</Label><Input value={ratedVoltage} onChange={(e) => setRatedVoltage(e.target.value)} placeholder="230 V" /></div>
            <div><Label>Märkeffekt</Label><Input value={ratedPower} onChange={(e) => setRatedPower(e.target.value)} placeholder="3450 W" /></div>
          </div>

          {lookupDone && machine && (
            <div className="rounded-md border border-green-300 bg-green-50 text-green-900 text-sm p-3 flex gap-2">
              <Check className="h-4 w-4 mt-0.5 shrink-0" />
              <span>Maskinen finns redan: <strong>{machine.machine_model}</strong> · SN {machine.serial_number} hos <strong>{machine.customers?.name}</strong>. Kalibreringen kopplas dit.</span>
            </div>
          )}
          {lookupDone && !machine && serialNumber && (
            <div className="rounded-md border bg-muted/50 text-sm p-3">Ny maskin – den läggs upp på vald kund när du sparar.</div>
          )}

          <div className="space-y-2">
            <Label>Kund</Label>
            {!creatingCustomer ? (
              <div className="relative space-y-2">
                <Input placeholder="Sök kund..." value={customerSearch}
                  onChange={(e) => { setCustomerSearch(e.target.value); setCustomerId(null); setCustomerOpen(true); }}
                  onFocus={() => setCustomerOpen(true)} />
                {customerOpen && !customerId && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setCustomerOpen(false)} />
                    <div className="absolute z-50 left-0 right-0 border rounded-md bg-popover shadow-lg max-h-60 overflow-y-auto">
                      {filteredCustomers.length ? filteredCustomers.map((c) => (
                        <button key={c.id} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-accent border-b last:border-0"
                          onClick={() => { setCustomerId(c.id); setCustomerSearch(c.name); setCustomerOpen(false); }}>{c.name}</button>
                      )) : <p className="px-3 py-2 text-sm text-muted-foreground">Inga kunder hittades</p>}
                    </div>
                  </>
                )}
                {machine && customerId && customerId !== machine.customer_id && (
                  <p className="text-xs text-amber-700">Annan kund än maskinens registrerade ägare – en ny maskinpost skapas på vald kund.</p>
                )}
                <Button type="button" variant="outline" size="sm" onClick={() => { setCreatingCustomer(true); setCustomerId(null); }}>
                  <Plus /> Ny kund
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input placeholder="Kundnamn" value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} autoFocus />
                <Button type="button" variant="outline" onClick={() => { setCreatingCustomer(false); setNewCustomerName(""); }}><X /></Button>
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <Button size="lg" onClick={goToMeasurements}>Till mätning <ChevronRight /></Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <div className="section-card space-y-4">
            <h2 className="form-section-title">2. Inställda värden</h2>
            <p className="text-sm text-muted-foreground">Fota maskinens display så fylls de inställda värdena i automatiskt.</p>
            <PhotoReader kind="machine_display" label="Fota maskinens display" variant="default" photo={photos.display} onResult={onDisplay} />
            {aiNotes.display && <p className="text-xs text-muted-foreground italic">AI: {aiNotes.display}</p>}
          </div>

          {points.map((p) => {
            const e = p.enabled ? evaluate(p) : null;
            return (
              <div key={p.key} className={`section-card space-y-3 ${p.enabled ? "" : "opacity-60"}`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{p.label} <span className="text-muted-foreground font-normal">[{p.unit}]</span></h3>
                    <p className="text-xs text-muted-foreground">Tolerans {toleranceText(p)}{p.hint ? ` · ${p.hint}` : ""}</p>
                  </div>
                  <Switch checked={p.enabled} onCheckedChange={(v) => updatePoint(p.key, { enabled: v })} />
                </div>
                {p.enabled && (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      <div><Label className="text-xs">Inställt</Label><Input inputMode="decimal" value={p.setValue} onChange={(ev) => updatePoint(p.key, { setValue: ev.target.value })} /></div>
                      <div><Label className="text-xs">Uppmätt</Label><Input inputMode="decimal" value={p.actualValue} onChange={(ev) => updatePoint(p.key, { actualValue: ev.target.value })} /></div>
                      <div>
                        <Label className="text-xs">Differens</Label>
                        <div className={`h-10 rounded-md flex items-center justify-center text-sm font-semibold ${!e ? "bg-muted text-muted-foreground" : e.pass ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                          {e ? `${e.difference > 0 ? "+" : ""}${fmt(e.difference, p.quantity)} · ${e.pass ? "Godkänd" : "Ej godkänd"}` : "—"}
                        </div>
                      </div>
                    </div>
                    <PhotoReader kind={PHOTO_KIND[p.quantity]} size="sm"
                      label={p.quantity === "force" ? "Fota Hahne-displayen" : p.quantity === "temperature" ? "Fota termometern" : "Fota hastighetsmätaren"}
                      photo={photos[p.key]} onResult={onInstrument(p)} />
                    {aiNotes[p.key] && <p className="text-xs text-muted-foreground italic">AI: {aiNotes[p.key]}</p>}
                  </>
                )}
              </div>
            );
          })}

          <div className="section-card space-y-4">
            <h2 className="form-section-title">Mätinstrument</h2>
            {usedQuantities.map((q) => {
              const list = instruments.filter((i) => i.measure === q);
              return (
                <div key={q} className="grid grid-cols-[100px_1fr] items-center gap-3">
                  <span className="text-sm">{MEASURE_LABEL[q]}</span>
                  {list.length ? (
                    <Select value={instrumentIds[q] || ""} onValueChange={(v) => setInstrumentIds((s) => ({ ...s, [q]: v }))}>
                      <SelectTrigger><SelectValue placeholder="Välj instrument" /></SelectTrigger>
                      <SelectContent>
                        {list.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}{i.device_id ? ` · ${i.device_id}` : ""}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : <span className="text-sm text-muted-foreground">Inget instrument registrerat – lägg till under fliken Instrument.</span>}
                </div>
              );
            })}
            {expiredInstruments.length > 0 && (
              <p className="text-sm text-amber-700 flex gap-2"><TriangleAlert className="h-4 w-4 shrink-0 mt-0.5" />
                Certifikatet har gått ut för: {expiredInstruments.map((i) => i!.name).join(", ")}</p>
            )}
          </div>

          <div className="section-card space-y-4">
            <h2 className="form-section-title">Elsäkerhet & provningsförhållanden</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <PassFail label="Högspänningsprov" value={safetyHv} onChange={setSafetyHv} />
              <PassFail label="Skyddsledare" value={safetyGround} onChange={setSafetyGround} />
              <div><Label>Omgivningstemperatur (°C)</Label><Input inputMode="decimal" value={ambientTemp} onChange={(e) => setAmbientTemp(e.target.value)} /></div>
              <div><Label>Luftfuktighet (%)</Label><Input inputMode="decimal" value={ambientHumidity} onChange={(e) => setAmbientHumidity(e.target.value)} /></div>
            </div>
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}><ChevronLeft /> Tillbaka</Button>
            <Button size="lg" onClick={() => {
              if (!allMeasured) return toast.error("Fyll i inställt och uppmätt värde för alla aktiva mätpunkter");
              setStep(3);
            }}>Granska & signera <ChevronRight /></Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-6">
          <div className="section-card space-y-3">
            <h2 className="form-section-title">3. Sammanställning</h2>
            <p className="text-sm"><strong>{model}</strong> · Art {articleNumber || "—"} · SN {serialNumber || "—"} · {customer?.name || newCustomerName}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-muted-foreground"><th className="text-left py-2">Mätpunkt</th><th>Inställt</th><th>Uppmätt</th><th>Diff</th><th>Tolerans</th><th>Status</th></tr></thead>
                <tbody>
                  {evaluated.map(({ p, e }) => (
                    <tr key={p.key} className="border-b last:border-0 text-center">
                      <td className="text-left py-2">{p.label}</td>
                      <td>{fmt(e!.set, p.quantity)} {p.unit}</td>
                      <td>{fmt(e!.act, p.quantity)} {p.unit}</td>
                      <td>{fmt(e!.difference, p.quantity)}</td>
                      <td>{toleranceText(p)}</td>
                      <td><span className={e!.pass ? "status-badge-success" : "status-badge-destructive"}>{e!.pass ? "Godkänd" : "Ej godkänd"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="section-card space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Tekniker</Label>
                <Select value={technician} onValueChange={setTechnician}>
                  <SelectTrigger><SelectValue placeholder="Välj tekniker" /></SelectTrigger>
                  <SelectContent>{TECHNICIANS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Ordernummer</Label><Input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} /></div>
              <div><Label>Datum</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
              <div><Label>Nästa kalibrering</Label><Input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} /></div>
              <div>
                <Label>Resultat {resultOverride ? "(manuellt)" : "(automatiskt)"}</Label>
                <Select value={result} onValueChange={(v) => setResultOverride(v === autoResult ? null : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Godkänd">Godkänd</SelectItem>
                    <SelectItem value="Ej godkänd">Ej godkänd</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Kommentar</Label><Textarea rows={2} value={comments} onChange={(e) => setComments(e.target.value)} /></div>
            <div><Label>Teknikerns signatur</Label><SignaturePad value={signature} onChange={setSignature} /></div>
          </div>

          <div className="flex justify-between gap-3">
            <Button variant="outline" onClick={() => setStep(2)}><ChevronLeft /> Tillbaka</Button>
            <Button size="lg" className="flex-1 sm:flex-none" onClick={handleSave} disabled={save.isPending}>
              <Save /> {save.isPending ? "Sparar..." : "Spara och skapa certifikat"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stepper({ step }: { step: number }) {
  const steps = ["Maskin", "Mätning", "Signera"];
  return (
    <div className="flex items-center gap-2 text-sm">
      {steps.map((s, i) => (
        <div key={s} className="flex items-center gap-2">
          <span className={`h-7 w-7 rounded-full flex items-center justify-center font-semibold ${step > i + 1 ? "bg-green-600 text-white" : step === i + 1 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
            {step > i + 1 ? <Check className="h-4 w-4" /> : i + 1}
          </span>
          <span className={step === i + 1 ? "font-semibold" : "text-muted-foreground"}>{s}</span>
          {i < steps.length - 1 && <span className="w-6 h-px bg-border" />}
        </div>
      ))}
    </div>
  );
}

function PassFail({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <Select value={value || "none"} onValueChange={(v) => onChange(v === "none" ? "" : v)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Ej utfört</SelectItem>
          <SelectItem value="Godkänd">Godkänd</SelectItem>
          <SelectItem value="Ej godkänd">Ej godkänd</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

// =====================================================================
// History
// =====================================================================

export function calibrationToPdf(c: CalibrationRow): CalibrationPdfData {
  return {
    certificateNo: c.certificate_no, customerName: c.customers?.name || "", orderNumber: c.order_number,
    machineModel: c.machine_model, articleNumber: c.article_number, serialNumber: c.serial_number,
    ratedVoltage: c.rated_voltage, ratedPower: c.rated_power, date: c.calibration_date, technician: c.technician,
    measurements: (c.measurements as unknown as SavedMeasurement[]) || [],
    safetyHighVoltage: c.safety_high_voltage, safetyGround: c.safety_ground_conductor,
    ambientTemperature: c.ambient_temperature, ambientHumidity: c.ambient_humidity,
    instruments: (c.instruments as unknown as CalibrationInstrument[]) || [],
    result: c.result, nextCalibrationDate: c.next_calibration_date, comments: c.comments, signatureData: c.signature_data,
  };
}

function History() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [toDelete, setToDelete] = useState<CalibrationRow | null>(null);
  const [photosFor, setPhotosFor] = useState<{ id: string; urls: string[] } | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ["calibrations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("calibrations").select("*, customers(name)")
        .order("calibration_date", { ascending: false }).order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return data as CalibrationRow[];
    },
  });

  const rows = useMemo(() => {
    const s = search.toLowerCase();
    return data.filter((c) => !s || [c.certificate_no, c.machine_model, c.serial_number, c.customers?.name].some((v) => v?.toLowerCase().includes(s)));
  }, [data, search]);

  const del = useMutation({
    mutationFn: async (c: CalibrationRow) => {
      const paths = Object.values((c.photo_paths as Record<string, string>) || {});
      if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
      const { error } = await supabase.from("calibrations").delete().eq("id", c.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Kalibrering borttagen"); qc.invalidateQueries({ queryKey: ["calibrations"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const showPhotos = async (c: CalibrationRow) => {
    const paths = Object.values((c.photo_paths as Record<string, string>) || {});
    if (!paths.length) return toast.info("Inga bilder sparade");
    try { setPhotosFor({ id: c.id, urls: await getPhotoSignedUrls(paths) }); } catch (e) { toast.error("Kunde inte hämta bilderna"); }
  };

  return (
    <div className="space-y-4">
      <Input placeholder="Sök certifikat, kund, modell eller serienummer..." value={search} onChange={(e) => setSearch(e.target.value)} />
      {isLoading ? <p className="text-muted-foreground">Laddar...</p> : rows.length === 0 ? (
        <p className="text-muted-foreground">Inga kalibreringar ännu.</p>
      ) : rows.map((c) => (
        <div key={c.id} className="section-card !p-4 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium">{c.machine_model} <span className="text-muted-foreground font-normal">· SN {c.serial_number || "—"}</span></p>
              <p className="text-sm text-muted-foreground truncate">{c.customers?.name} · {c.calibration_date} · {c.certificate_no}</p>
            </div>
            <span className={c.result === "Godkänd" ? "status-badge-success" : "status-badge-destructive"}>{c.result}</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={() => { const w = openPdfWindow(); if (w) renderCalibrationPdf(w, calibrationToPdf(c)); }}><FileText /> Certifikat</Button>
            <Button size="sm" variant="outline" onClick={() => showPhotos(c)}>Bilder</Button>
            <Button size="sm" variant="ghost" className="text-destructive ml-auto" onClick={() => setToDelete(c)}><Trash2 /></Button>
          </div>
          {photosFor?.id === c.id && (
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 pt-2">
              {photosFor.urls.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer"><img src={u} alt="" className="aspect-square object-cover rounded-md border" /></a>)}
            </div>
          )}
        </div>
      ))}

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort kalibrering {toDelete?.certificate_no}?</AlertDialogTitle>
            <AlertDialogDescription>Kalibreringen och dess bilder raderas permanent. Det går inte att ångra.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90" onClick={() => toDelete && del.mutate(toDelete)}>Ta bort</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// =====================================================================
// Instruments (traceability)
// =====================================================================

const emptyInstrument = { measure: "force", name: "", device_id: "", certificate_no: "", certificate_valid_until: "" };

function Instruments() {
  const qc = useQueryClient();
  const [form, setForm] = useState<typeof emptyInstrument & { id?: string }>(emptyInstrument);
  const { data = [] } = useQuery({
    queryKey: ["instruments-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("instruments").select("*").order("measure").order("name");
      if (error) throw error;
      return data as Instrument[];
    },
  });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["instruments-all"] }); qc.invalidateQueries({ queryKey: ["instruments"] }); };

  const saveInstrument = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Ange namn");
      const row = {
        measure: form.measure, name: form.name.trim(), device_id: form.device_id || null,
        certificate_no: form.certificate_no || null, certificate_valid_until: form.certificate_valid_until || null,
      };
      const { error } = form.id
        ? await supabase.from("instruments").update(row).eq("id", form.id)
        : await supabase.from("instruments").insert(row);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Instrument sparat"); setForm(emptyInstrument); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = async (i: Instrument, active: boolean) => {
    const { error } = await supabase.from("instruments").update({ active }).eq("id", i.id);
    if (error) toast.error(error.message); else refresh();
  };

  return (
    <div className="space-y-6">
      <div className="section-card space-y-4">
        <h2 className="form-section-title">{form.id ? "Redigera instrument" : "Lägg till instrument"}</h2>
        <p className="text-sm text-muted-foreground">Instrumenten och deras kalibreringscertifikat skrivs ut på varje certifikat för spårbarhet.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Storhet</Label>
            <Select value={form.measure} onValueChange={(v) => setForm({ ...form, measure: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="force">Kraft (N)</SelectItem>
                <SelectItem value="temperature">Temperatur (°C)</SelectItem>
                <SelectItem value="speed">Hastighet (m/min)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Namn</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="t.ex. Hahne kraftmätare" /></div>
          <div><Label>Instrument-ID / serienr</Label><Input value={form.device_id} onChange={(e) => setForm({ ...form, device_id: e.target.value })} /></div>
          <div><Label>Certifikatnummer</Label><Input value={form.certificate_no} onChange={(e) => setForm({ ...form, certificate_no: e.target.value })} /></div>
          <div><Label>Certifikat giltigt t.o.m.</Label><Input type="date" value={form.certificate_valid_until} onChange={(e) => setForm({ ...form, certificate_valid_until: e.target.value })} /></div>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => saveInstrument.mutate()} disabled={saveInstrument.isPending}><Save /> Spara</Button>
          {form.id && <Button variant="outline" onClick={() => setForm(emptyInstrument)}>Avbryt</Button>}
        </div>
      </div>

      {data.map((i) => {
        const expired = i.certificate_valid_until && i.certificate_valid_until < format(new Date(), "yyyy-MM-dd");
        return (
          <div key={i.id} className={`section-card !p-4 flex items-center justify-between gap-3 ${i.active ? "" : "opacity-50"}`}>
            <div className="min-w-0">
              <p className="font-medium">{i.name} <span className="text-muted-foreground font-normal">· {MEASURE_LABEL[i.measure as Quantity]}</span></p>
              <p className={`text-sm ${expired ? "text-amber-700" : "text-muted-foreground"}`}>
                ID {i.device_id || "—"} · Cert {i.certificate_no || "—"}{i.certificate_valid_until ? ` · t.o.m. ${i.certificate_valid_until}` : ""}{expired ? " (utgånget)" : ""}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => setForm({
                id: i.id, measure: i.measure, name: i.name, device_id: i.device_id || "",
                certificate_no: i.certificate_no || "", certificate_valid_until: i.certificate_valid_until || "",
              })}>Ändra</Button>
              <Switch checked={i.active} onCheckedChange={(v) => toggle(i, v)} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
