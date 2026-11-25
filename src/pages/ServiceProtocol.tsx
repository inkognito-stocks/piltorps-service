import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { machineCategories, MachineCategory, serviceIntervalMonths } from "@/lib/machines";
import { useMachineModels } from "@/hooks/useMachineModels";
import { openPdfWindow, renderProtocolPdf } from "@/lib/generatePdf";
import { inspectionConfig, getCalibrationConfig } from "@/lib/inspectionConfig";
import { uploadMachinePhotos } from "@/lib/photoStorage";
import SignaturePad from "@/components/SignaturePad";
import PhotoCapture from "@/components/PhotoCapture";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { format, addMonths, isValid } from "date-fns";
import { FileText, Save, Camera, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const handmaskinerWithHours = ["Triac AT", "Solano AT", "Ghibli AW"];

export default function ServiceProtocolPage() {
  const queryClient = useQueryClient();
  const { modelsByCategory } = useMachineModels();
  const today = format(new Date(), "yyyy-MM-dd");
  const nextCal = format(addMonths(new Date(), 12), "yyyy-MM-dd");
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);

  // Refs for validation scroll
  const customerRef = useRef<HTMLDivElement>(null);
  const machineRef = useRef<HTMLDivElement>(null);
  const [validationErrors, setValidationErrors] = useState<Set<string>>(new Set());

  // Form state
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerContact, setNewCustomerContact] = useState("");
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [orderNumber, setOrderNumber] = useState("");
  const [technician, setTechnician] = useState("");
  const [protocolDate, setProtocolDate] = useState(today);
  const [machineCategory, setMachineCategory] = useState<MachineCategory | "">("");
  const [machineModel, setMachineModel] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [operationHours, setOperationHours] = useState("");
  const [driveMotorHours, setDriveMotorHours] = useState("");
  const [fanMotorHours, setFanMotorHours] = useState("");
  const [plasticType, setPlasticType] = useState<"PE" | "PP">("PE");
  const [timeSpent, setTimeSpent] = useState("");
  const [actionsPerformed, setActionsPerformed] = useState("");
  const [comments, setComments] = useState("");

  // Machine selection state
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(null);
  const [showNewMachineDialog, setShowNewMachineDialog] = useState(false);
  const [newMachineCategory, setNewMachineCategory] = useState<MachineCategory | "">("");
  const [newMachineModel, setNewMachineModel] = useState("");
  const [newMachineSerial, setNewMachineSerial] = useState("");
  const [newMachineInterval, setNewMachineInterval] = useState<number>(12);
  // When a machine was just selected, its interval-derived date should win over the category effect.
  const machineSelectRef = useRef(false);
  // Interval of the currently selected machine (null = fall back to category default).
  const [machineIntervalMonths, setMachineIntervalMonths] = useState<number | null>(null);
  // True once the user edits the next-service date manually; stops automatic recalculation.
  const nextDateTouched = useRef(false);

  // Parse numbers written with either decimal comma or dot.
  const parseNum = (v: string) => parseFloat(String(v).replace(",", "."));

  // Print window opened synchronously on click (Safari/iOS popup rules).
  const pdfWindowRef = useRef<Window | null>(null);


  const activeInspection = machineCategory ? inspectionConfig[machineCategory] || [] : [];
  const activeCalibration = machineCategory ? getCalibrationConfig(machineCategory, plasticType) : [];

  const automatsvetsarNoDisplay = ["Uniroof ST", "Twinny S"];
  const showHoursFields = (machineCategory === "Automatsvetsar" && !automatsvetsarNoDisplay.includes(machineModel))
    || machineCategory === "Plastextrudrar"
    || (machineCategory === "Handmaskiner" && handmaskinerWithHours.includes(machineModel));
  const showDriveMotor = (machineCategory === "Automatsvetsar" && !automatsvetsarNoDisplay.includes(machineModel))
    || machineCategory === "Plastextrudrar";

  const [inspection, setInspection] = useState<Record<string, { status: string; comment: string }>>({});

  useEffect(() => {
    if (machineCategory) {
      setInspection(initialInspection(machineCategory));

      // Don't overwrite the date that handleMachineSelect just set from the machine's own interval.
      if (machineSelectRef.current) {
        machineSelectRef.current = false;
        return;
      }
      if (!nextDateTouched.current) {
        setNextCalibrationDate(computeNextDate(serviceIntervalMonths[machineCategory]));
      }
    }
  }, [machineCategory]);


  const [protectiveEarth, setProtectiveEarth] = useState("");
  const [hvTest, setHvTest] = useState("");
  const [hotAirMeasured, setHotAirMeasured] = useState("");
  const [hotAirDiff, setHotAirDiff] = useState("");
  const [hotAirStatus, setHotAirStatus] = useState("OK");
  const [plasticMassMeasured, setPlasticMassMeasured] = useState("");
  const [plasticMassDiff, setPlasticMassDiff] = useState("");
  const [plasticMassStatus, setPlasticMassStatus] = useState("OK");

  useEffect(() => {
    if (!hotAirMeasured || !machineCategory) { setHotAirDiff(""); return; }
    const ref = activeCalibration.find(c => c.field === "hotAir")?.refValue;
    const num = parseNum(hotAirMeasured);
    if (ref === undefined || Number.isNaN(num)) { setHotAirDiff(""); return; }
    setHotAirDiff((num - ref).toFixed(1));
  }, [hotAirMeasured, machineCategory, plasticType]);

  useEffect(() => {
    if (!plasticMassMeasured || !machineCategory) { setPlasticMassDiff(""); return; }
    const ref = activeCalibration.find(c => c.field === "plasticMass")?.refValue;
    const num = parseNum(plasticMassMeasured);
    if (ref === undefined || Number.isNaN(num)) { setPlasticMassDiff(""); return; }
    setPlasticMassDiff((num - ref).toFixed(1));
  }, [plasticMassMeasured, machineCategory, plasticType]);


  const [finalAssessment, setFinalAssessment] = useState("Godkänd för drift");
  const [nextCalibrationDate, setNextCalibrationDate] = useState(nextCal);
  const [signatureData, setSignatureData] = useState("");
  const [machinePhotos, setMachinePhotos] = useState<string[]>([]);
  const [materialMeasuredMass, setMaterialMeasuredMass] = useState("");
  const [materialCalculated, setMaterialCalculated] = useState("");
  const [materialStatus, setMaterialStatus] = useState("OK");

  // Fetch customers
  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch machines for selected customer
  const { data: customerMachines = [] } = useQuery({
    queryKey: ["customer-machines", selectedCustomerId],
    queryFn: async () => {
      if (!selectedCustomerId) return [];
      const { data, error } = await supabase
        .from("machines")
        .select("*")
        .eq("customer_id", selectedCustomerId)
        .order("machine_model");
      if (error) throw error;
      return data;
    },
    enabled: !!selectedCustomerId,
  });

  const filteredCustomers = customers.filter((c) =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase())
  );

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);

  // Duplicate-name warning when creating a new customer (matches both directions).
  const dupName = newCustomerName.trim().toLowerCase();
  const duplicateCustomer = showNewCustomer && dupName.length >= 3
    ? customers.find((c) => {
        const n = c.name.trim().toLowerCase();
        return n === dupName || n.includes(dupName) || dupName.includes(n);
      })
    : undefined;

  // Single source of truth for the next service date: always protocolDate + months.
  const computeNextDate = (months: number): string => {
    if (!months || !protocolDate) return "";
    const [y, m, d] = protocolDate.split("-").map(Number);
    const base = new Date(y, (m || 1) - 1, d || 1);
    if (!isValid(base)) return "";
    const next = addMonths(base, months);
    if (!isValid(next)) return "";
    return format(next, "yyyy-MM-dd");
  };

  const initialInspection = (cat: MachineCategory) => {
    const cfg = inspectionConfig[cat] || [];
    const init: Record<string, { status: string; comment: string }> = {};
    cfg.forEach((c) => { init[c.status] = { status: "OK", comment: "" }; });
    return init;
  };

  // Populate category/model/serial and interval-derived date from a machine record.
  const selectMachine = (machine: Tables<"machines">) => {
    // Never inherit measurements, statuses or signature from the previous machine.
    resetProtocolFields();
    setSelectedMachineId(machine.id);
    machineSelectRef.current = true;
    const cat = machine.machine_category as MachineCategory;
    setMachineCategory(cat);
    setMachineModel(machine.machine_model);
    setSerialNumber(machine.serial_number || "");
    setInspection(initialInspection(cat));
    const months = machine.service_interval_months ?? 0;
    setMachineIntervalMonths(months);
    setNextCalibrationDate(computeNextDate(months));
    setValidationErrors(prev => { const n = new Set(prev); n.delete("machine"); return n; });
  };

  // When a machine is selected from dropdown, populate category/model/serial
  const handleMachineSelect = (machineId: string) => {
    const machine = customerMachines.find((m) => m.id === machineId);
    if (machine) {
      selectMachine(machine);
    } else {
      setSelectedMachineId(machineId);
    }
  };

  // Recalculate the next service date when the protocol date changes,
  // unless the user edited the date field manually.
  useEffect(() => {
    if (nextDateTouched.current) return;
    const months = machineIntervalMonths ?? (machineCategory ? serviceIntervalMonths[machineCategory] : 0);
    setNextCalibrationDate(computeNextDate(months));
  }, [protocolDate]);

  // Reset machine selection when customer changes
  useEffect(() => {
    setSelectedMachineId(null);
    setMachineCategory("");
    setMachineModel("");
    setSerialNumber("");
    setMachineIntervalMonths(null);
  }, [selectedCustomerId]);


  // Add new machine mutation
  const addMachineMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCustomerId || !newMachineCategory || !newMachineModel) {
        throw new Error("Fyll i kategori och modell");
      }
      const { data, error } = await supabase.from("machines").insert({
        customer_id: selectedCustomerId,
        machine_category: newMachineCategory,
        machine_model: newMachineModel,
        serial_number: newMachineSerial || null,
        service_interval_months: newMachineInterval,
      }).select().single();
      if (error) {
        if ((error as { code?: string }).code === "23505") {
          throw new Error("Det finns redan en maskin med detta serienummer på kunden");
        }
        throw error;
      }
      return data;
    },
    onSuccess: (data) => {
      toast.success("Maskin tillagd!");
      queryClient.invalidateQueries({ queryKey: ["customer-machines", selectedCustomerId] });
      setShowNewMachineDialog(false);
      setNewMachineCategory("");
      setNewMachineModel("");
      setNewMachineSerial("");
      setNewMachineInterval(12);
      // Reset all protocol fields for the new machine
      resetProtocolFields();
      // Auto-select the new machine (sets category/model/serial + interval date)
      selectMachine(data);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Reset all protocol-specific fields (keeps customer, order, technician, date)
  const resetProtocolFields = useCallback(() => {
    setOperationHours("");
    setDriveMotorHours("");
    setFanMotorHours("");
    setPlasticType("PE");
    setProtectiveEarth("");
    setHvTest("");
    setHotAirMeasured("");
    setHotAirDiff("");
    setHotAirStatus("OK");
    setPlasticMassMeasured("");
    setPlasticMassDiff("");
    setPlasticMassStatus("OK");
    setMaterialMeasuredMass("");
    setMaterialCalculated("");
    setMaterialStatus("OK");
    setFinalAssessment("Godkänd för drift");
    nextDateTouched.current = false;
    setNextCalibrationDate(computeNextDate(machineCategory ? serviceIntervalMonths[machineCategory] : 0));
    setSignatureData("");
    setMachinePhotos([]);
    setTimeSpent("");
    setActionsPerformed("");
    setComments("");
    setValidationErrors(new Set());
  }, [machineCategory, protocolDate]);


  // Validation
  const validateForm = (): boolean => {
    const errors = new Set<string>();
    if (!showNewCustomer && !selectedCustomerId) errors.add("customer");
    if (showNewCustomer && !newCustomerName) errors.add("customer");
    if (!selectedMachineId && (!machineCategory || !machineModel)) errors.add("machine");
    setValidationErrors(errors);

    if (errors.size > 0) {
      const firstError = errors.has("customer") ? customerRef : machineRef;
      firstError.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return false;
    }
    return true;
  };

  // Frozen snapshot of the rows as they look right now. Saved with the protocol so
  // later changes to inspectionConfig never alter an already-saved protocol.
  const buildSnapshot = () => {
    const inspectionItems = activeInspection.map((cfg) => ({
      key: cfg.status,
      label: cfg.label,
      status: inspection[cfg.status]?.status || "OK",
      comment: inspection[cfg.status]?.comment || "",
    }));
    const calibrationItems = activeCalibration.map((cal) => ({
      key: cal.field,
      label: cal.label,
      unit: cal.unit,
      refValue: cal.refValue,
      measured: cal.field === "hotAir" ? hotAirMeasured : plasticMassMeasured,
      diff: cal.field === "hotAir" ? hotAirDiff : plasticMassDiff,
      status: cal.field === "hotAir" ? hotAirStatus : plasticMassStatus,
    }));
    const materialItem =
      machineCategory === "Plastextrudrar"
        ? {
            label: "Massflöde",
            unit: "g/min",
            measured: materialMeasuredMass,
            calculated: materialCalculated,
            status: materialStatus,
          }
        : null;
    return { inspectionItems, calibrationItems, materialItem };
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      let customerId = selectedCustomerId;

      if (showNewCustomer && newCustomerName) {
        const { data, error } = await supabase
          .from("customers")
          .insert({
            name: newCustomerName,
            email: newCustomerEmail || null,
            phone: newCustomerPhone || null,
            contact_person: newCustomerContact || null,
          })
          .select()
          .single();
        if (error) throw error;
        customerId = data.id;
      }

      if (!customerId) throw new Error("Välj eller skapa en kund");
      if (!machineCategory || !machineModel) throw new Error("Välj maskinmodell");

      // If new customer or no machine selected, create a machine record.
      // A new customer must never reuse another customer's machine.
      let machineId = showNewCustomer ? null : selectedMachineId;
      if (!machineId) {
        const { data: machineData, error: machineErr } = await supabase.from("machines").insert({
          customer_id: customerId,
          machine_category: machineCategory,
          machine_model: machineModel,
          serial_number: serialNumber || null,
          service_interval_months: serviceIntervalMonths[machineCategory],
        }).select().single();
        if (machineErr) {
          if ((machineErr as { code?: string }).code === "23505") {
            throw new Error("Det finns redan en maskin med detta serienummer på kunden");
          }
          throw machineErr;
        }
        machineId = machineData.id;
      }

      const snap = buildSnapshot();
      const record: Record<string, unknown> = {
        customer_id: customerId,
        machine_id: machineId,
        order_number: orderNumber || null,
        technician: technician || null,
        protocol_date: protocolDate,
        machine_category: machineCategory,
        machine_model: machineModel,
        serial_number: serialNumber || null,
        operation_hours: operationHours || null,
        drive_motor_hours: driveMotorHours || null,
        fan_motor_hours: fanMotorHours || null,
        material_type: machineCategory === "Plastextrudrar" ? plasticType : null,
        protective_earth: protectiveEarth || null,
        hv_test: hvTest || null,
        hot_air_measured: hotAirMeasured || null,
        hot_air_diff: hotAirDiff || null,
        hot_air_status: hotAirStatus,
        plastic_mass_measured: activeCalibration.some(c => c.field === "plasticMass") ? (plasticMassMeasured || null) : null,
        plastic_mass_diff: activeCalibration.some(c => c.field === "plasticMass") ? (plasticMassDiff || null) : null,
        plastic_mass_status: activeCalibration.some(c => c.field === "plasticMass") ? plasticMassStatus : null,
        material_measured_mass: machineCategory === "Plastextrudrar" ? (materialMeasuredMass || null) : null,
        material_calculated: machineCategory === "Plastextrudrar" ? (materialCalculated || null) : null,
        material_status: machineCategory === "Plastextrudrar" ? materialStatus : null,
        final_assessment: finalAssessment,
        next_calibration_date: nextCalibrationDate || null,
        signature_data: signatureData || null,
        time_spent: timeSpent || null,
        actions_performed: actionsPerformed || null,
        comments: comments || null,
        inspection_items: snap.inspectionItems,
        calibration_items: snap.calibrationItems,
        material_item: snap.materialItem,
      };

      for (const cfg of activeInspection) {
        record[cfg.status] = inspection[cfg.status]?.status || "OK";
        record[cfg.comment] = inspection[cfg.status]?.comment || null;
      }

      const { data: inserted, error } = await supabase
        .from("service_protocols")
        .insert(record as TablesInsert<"service_protocols">)
        .select()
        .single();
      if (error) throw error;

      // Compress and upload machine photos, then store their paths
      if (machinePhotos.length > 0 && inserted?.id) {
        try {
          const paths = await uploadMachinePhotos(machinePhotos, inserted.id);
          await supabase.from("service_protocols").update({ photo_paths: paths }).eq("id", inserted.id);
        } catch (e) {
          console.error("Bilduppladdning misslyckades", e);
          toast.error("Protokollet sparades men bilderna kunde inte laddas upp.");
        }
      }

      return { customerId, customerName: showNewCustomer ? newCustomerName : selectedCustomer?.name || "" };
    },
    onSuccess: ({ customerName }) => {
      toast.success("Protokoll sparat!");
      queryClient.invalidateQueries({ queryKey: ["customers"] });

      const pdfWindow = pdfWindowRef.current;
      if (pdfWindow && !pdfWindow.closed) {
        const pdfSnap = buildSnapshot();
        renderProtocolPdf(pdfWindow, {
          customerName,
          orderNumber,
          technician,
          protocolDate,
          machineCategory,
          machineModel,
          serialNumber,
          operationHours,
          driveMotorHours,
          fanMotorHours,
          materialType: machineCategory === "Plastextrudrar" ? plasticType : "",
          inspectionRows: pdfSnap.inspectionItems,
          protectiveEarth,
          hvTest,
          calibrationRows: pdfSnap.calibrationItems,
          materialRow: pdfSnap.materialItem,
          finalAssessment,
          nextCalibrationDate,
          signatureData,
          timeSpent,
          actionsPerformed,
          comments,
        });
      }
      pdfWindowRef.current = null;


      // Clear the form so the next protocol starts fresh (technician is kept).
      resetProtocolFields();
      setSelectedCustomerId(null);
      setCustomerSearch("");
      setShowNewCustomer(false);
      setNewCustomerName("");
      setNewCustomerEmail("");
      setNewCustomerPhone("");
      setNewCustomerContact("");
      setSelectedMachineId(null);
      setMachineIntervalMonths(null);
      setMachineCategory("");
      setMachineModel("");
      setSerialNumber("");
      setOrderNumber("");
      setProtocolDate(today);
      setInspection({});
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    onError: (err: Error) => {
      pdfWindowRef.current?.close();
      pdfWindowRef.current = null;
      toast.error(err.message);
    },
  });


  const updateInspection = (statusKey: string, field: "status" | "comment", val: string) => {
    setInspection((prev) => ({ ...prev, [statusKey]: { ...prev[statusKey], [field]: val } }));
  };

  const handleSave = () => {
    if (!validateForm()) return;
    // Open the window while still inside the click handler; save even if blocked.
    pdfWindowRef.current = openPdfWindow();
    saveMutation.mutate();
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Service- & Kalibreringsprotokoll</h1>
        <p className="text-muted-foreground mt-1">Fyll i protokollet nedan för att registrera service.</p>
      </div>

      {/* Huvudinformation */}
      <div className="section-card space-y-5">
        <h2 className="form-section-title">Huvudinformation</h2>

        <div ref={customerRef} className="space-y-3">
          <Label>Kund *</Label>
          {!showNewCustomer ? (
            <div className="space-y-2 relative">
              <Input
                placeholder="Sök kund..."
                value={customerSearch}
                onChange={(e) => { setCustomerSearch(e.target.value); setSelectedCustomerId(null); }}
                onFocus={() => setCustomerDropdownOpen(true)}
                className={validationErrors.has("customer") ? "ring-2 ring-destructive" : ""}
              />
              {customerDropdownOpen && !selectedCustomerId && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setCustomerDropdownOpen(false)} />
                  <div className="absolute z-50 left-0 right-0 mt-1 border rounded-md bg-popover shadow-lg max-h-60 overflow-y-auto">
                    {filteredCustomers.length > 0 ? filteredCustomers.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors border-b last:border-b-0"
                        onClick={() => {
                          setSelectedCustomerId(c.id);
                          setCustomerSearch(c.name);
                          setCustomerDropdownOpen(false);
                          setValidationErrors(prev => { const n = new Set(prev); n.delete("customer"); return n; });
                        }}
                      >
                        <span className="font-medium">{c.name}</span>
                        {c.email && <span className="text-muted-foreground ml-2 text-xs">— {c.email}</span>}
                      </button>
                    )) : (
                      <p className="px-3 py-2 text-sm text-muted-foreground">Inga kunder hittades</p>
                    )}
                  </div>
                </>
              )}
              {selectedCustomerId && (
                <p className="text-sm text-muted-foreground">
                  Vald: <strong>{selectedCustomer?.name}</strong>{" "}
                  <button type="button" className="text-primary underline ml-2" onClick={() => { setSelectedCustomerId(null); setCustomerSearch(""); }}>Ändra</button>
                </p>
              )}
              <Button type="button" variant="outline" size="sm" onClick={() => {
                setShowNewCustomer(true);
                setSelectedCustomerId(null);
                setCustomerSearch("");
                setSelectedMachineId(null);
                setMachineIntervalMonths(null);
                setMachineCategory("");
                setMachineModel("");
                setSerialNumber("");
              }}>
                + Skapa ny kund
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Input
                placeholder="Kundnamn *"
                value={newCustomerName}
                onChange={(e) => setNewCustomerName(e.target.value)}
                className={validationErrors.has("customer") && !newCustomerName ? "ring-2 ring-destructive" : ""}
              />
              {duplicateCustomer && (
                <div className="rounded-md border border-yellow-400 bg-yellow-50 text-yellow-900 text-sm p-3 space-y-2">
                  <p>Det finns redan en kund med liknande namn: <strong>{duplicateCustomer.name}</strong></p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedCustomerId(duplicateCustomer.id);
                      setCustomerSearch(duplicateCustomer.name);
                      setShowNewCustomer(false);
                      setNewCustomerName("");
                    }}
                  >
                    Använd befintlig kund
                  </Button>
                </div>
              )}
              <Input placeholder="E-post" value={newCustomerEmail} onChange={(e) => setNewCustomerEmail(e.target.value)} />
              <Input placeholder="Telefonnummer" value={newCustomerPhone} onChange={(e) => setNewCustomerPhone(e.target.value)} />
              <Input placeholder="Kontaktperson" value={newCustomerContact} onChange={(e) => setNewCustomerContact(e.target.value)} />
              <Button type="button" variant="outline" size="sm" onClick={() => setShowNewCustomer(false)}>
                Avbryt — sök befintlig
              </Button>
            </div>
          )}
        </div>

        {/* Machine selection — filtered by customer or manual entry for new customer */}
        <div ref={machineRef} className="space-y-3">
          <Label>Maskin *</Label>
          {showNewCustomer ? (
            /* New customer mode — show category/model dropdowns directly */
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Kategori</Label>
                  <Select value={machineCategory} onValueChange={(v) => { setMachineCategory(v as MachineCategory); setMachineModel(""); }}>
                    <SelectTrigger className={validationErrors.has("machine") && !machineCategory ? "ring-2 ring-destructive" : ""}>
                      <SelectValue placeholder="Välj kategori" />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(machineCategories) as MachineCategory[]).map((cat) => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Modell</Label>
                  <Select value={machineModel} onValueChange={(v) => { setMachineModel(v); setValidationErrors(prev => { const n = new Set(prev); n.delete("machine"); return n; }); }} disabled={!machineCategory}>
                    <SelectTrigger className={validationErrors.has("machine") && !machineModel ? "ring-2 ring-destructive" : ""}>
                      <SelectValue placeholder="Välj modell" />
                    </SelectTrigger>
                    <SelectContent>
                      {machineCategory && modelsByCategory[machineCategory as MachineCategory].map((m) => (
                        <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          ) : selectedCustomerId && customerMachines.length > 0 ? (
            <div className="space-y-2">
              <Select
                value={selectedMachineId || ""}
                onValueChange={handleMachineSelect}
              >
                <SelectTrigger className={validationErrors.has("machine") ? "ring-2 ring-destructive" : ""}>
                  <SelectValue placeholder="Välj maskin..." />
                </SelectTrigger>
                <SelectContent>
                  {customerMachines.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.machine_model} {m.serial_number ? `(SN: ${m.serial_number})` : ""} — {m.machine_category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" variant="outline" size="sm" onClick={() => setShowNewMachineDialog(true)}>
                <Plus className="h-3 w-3 mr-1" /> Lägg till ny maskin på kund
              </Button>
            </div>
          ) : selectedCustomerId ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Inga maskiner registrerade på denna kund.</p>
              <Button type="button" variant="outline" size="sm" onClick={() => setShowNewMachineDialog(true)}>
                <Plus className="h-3 w-3 mr-1" /> Lägg till ny maskin på kund
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Välj en kund först för att se maskiner.</p>
          )}

          {/* Show selected machine details (read-only) */}
          {!showNewCustomer && selectedMachineId && machineCategory && (
            <div className="text-sm text-muted-foreground bg-muted/50 rounded-md p-3">
              <strong>Vald:</strong> {machineModel} ({machineCategory}) {serialNumber ? `· SN: ${serialNumber}` : ""}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <div><Label>Datum</Label><Input type="date" value={protocolDate} onChange={(e) => setProtocolDate(e.target.value)} /></div>
          <div><Label>Ordernummer</Label><Input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} /></div>
          <div>
            <Label>Tekniker</Label>
            <Select value={technician} onValueChange={setTechnician}>
              <SelectTrigger><SelectValue placeholder="Välj tekniker" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Martin Öberg">Martin Öberg</SelectItem>
                <SelectItem value="Mattias Piltorp">Mattias Piltorp</SelectItem>
                <SelectItem value="Peter Piltorp">Peter Piltorp</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <div><Label>Serienummer</Label><Input value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} /></div>
          {showHoursFields && (
            <div><Label>Drifttid (h)</Label><Input inputMode="numeric" value={operationHours} onChange={(e) => setOperationHours(e.target.value)} /></div>
          )}
          {showDriveMotor && (
            <div><Label>Drivmotor (h)</Label><Input inputMode="numeric" value={driveMotorHours} onChange={(e) => setDriveMotorHours(e.target.value)} /></div>
          )}
          {showHoursFields && (
            <div><Label>Fläktmotor (h)</Label><Input inputMode="numeric" value={fanMotorHours} onChange={(e) => setFanMotorHours(e.target.value)} /></div>
          )}
        </div>
      </div>

      {/* Sektion 1: Okulärbesiktning */}
      {machineCategory && activeInspection.length > 0 && (
        <div className="section-card space-y-4">
          <h2 className="form-section-title">1. Okulärbesiktning & Funktion</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 font-medium text-muted-foreground">Kontrollpunkt</th>
                  <th className="text-left py-2 font-medium text-muted-foreground w-32">Status</th>
                  <th className="text-left py-2 font-medium text-muted-foreground">Kommentar</th>
                </tr>
              </thead>
              <tbody>
                {activeInspection.map((cfg) => (
                  <tr key={cfg.status} className="border-b last:border-0">
                    <td className="py-2.5 pr-4">{cfg.label}</td>
                    <td className="py-2.5 pr-4">
                      <Select value={inspection[cfg.status]?.status || "OK"} onValueChange={(v) => updateInspection(cfg.status, "status", v)}>
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="OK">OK</SelectItem>
                          <SelectItem value="Anmärkning">Anmärkning</SelectItem>
                          <SelectItem value="Ej OK">Ej OK</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="py-2.5">
                      <Input
                        className="h-8"
                        placeholder="Eventuell kommentar..."
                        value={inspection[cfg.status]?.comment || ""}
                        onChange={(e) => updateInspection(cfg.status, "comment", e.target.value)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tidsåtgång & Utförda åtgärder */}
      {machineCategory && (
        <div className="section-card space-y-4">
          <h2 className="form-section-title">Tidsåtgång & Utförda åtgärder</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Tidsåtgång (h) <span className="text-xs text-muted-foreground italic">(visas ej i utskrift)</span></Label>
              <Input type="number" step="0.5" min="0" value={timeSpent} onChange={(e) => setTimeSpent(e.target.value)} placeholder="t.ex. 2.5" />
            </div>
          </div>
          <div>
            <Label>Utförda åtgärder</Label>
            <Textarea
              value={actionsPerformed}
              onChange={(e) => setActionsPerformed(e.target.value)}
              placeholder="t.ex. bytt värmeelement, rengjort filter, kalibrerat..."
              rows={3}
            />
          </div>
          <div>
            <Label>Kommentar</Label>
            <Textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Ev. problem, synpunkter eller övrig information..."
              rows={3}
            />
          </div>
        </div>
      )}

      {/* Sektion 2: Elsäkerhetsprovning */}
      <div className="section-card space-y-4">
        <h2 className="form-section-title">2. Elsäkerhetsprovning</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><Label>Skyddsjord</Label><Input value={protectiveEarth} onChange={(e) => setProtectiveEarth(e.target.value)} /></div>
          <div><Label>Högspänningsprov (HV-test)</Label><Input value={hvTest} onChange={(e) => setHvTest(e.target.value)} /></div>
        </div>
      </div>

      {/* Sektion 3: Temperaturkalibrering */}
      {machineCategory && activeCalibration.length > 0 && (
        <div className="section-card space-y-4">
          <h2 className="form-section-title">3. Temperaturkalibrering</h2>

          {machineCategory === "Plastextrudrar" && (
            <div className="max-w-xs">
              <Label>Plastsort</Label>
              <Select value={plasticType} onValueChange={(v) => setPlasticType(v as "PE" | "PP")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PE">PE</SelectItem>
                  <SelectItem value="PP">PP</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 font-medium text-muted-foreground">Mätpunkt</th>
                  <th className="text-left py-2 font-medium text-muted-foreground">Uppmätt</th>
                  <th className="text-left py-2 font-medium text-muted-foreground">Diff</th>
                  <th className="text-left py-2 font-medium text-muted-foreground w-32">Status</th>
                </tr>
              </thead>
              <tbody>
                {activeCalibration.map((cal) => {
                  const measured = cal.field === "hotAir" ? hotAirMeasured : plasticMassMeasured;
                  const diff = cal.field === "hotAir" ? hotAirDiff : plasticMassDiff;
                  return (
                    <tr key={cal.field} className="border-b last:border-0">
                      <td className="py-2.5 pr-4">{cal.label}</td>
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-1">
                          <Input className="h-8"
                            inputMode="decimal"
                            value={measured}
                            onChange={(e) => cal.field === "hotAir" ? setHotAirMeasured(e.target.value) : setPlasticMassMeasured(e.target.value)}
                          />
                          <span className="text-xs text-muted-foreground whitespace-nowrap">{cal.unit}</span>
                        </div>
                      </td>
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-1">
                          <Input className="h-8 bg-muted/50" value={diff} readOnly tabIndex={-1} />
                          <span className="text-xs text-muted-foreground whitespace-nowrap">{cal.unit}</span>
                        </div>
                      </td>
                      <td className="py-2.5">
                        <Select
                          value={cal.field === "hotAir" ? hotAirStatus : plasticMassStatus}
                          onValueChange={(v) => cal.field === "hotAir" ? setHotAirStatus(v) : setPlasticMassStatus(v)}
                        >
                          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="OK">OK</SelectItem>
                            <SelectItem value="Ej OK">Ej OK</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sektion 4: Uppmätt massa - only for Plastextrudrar */}
      {machineCategory === "Plastextrudrar" && (
        <div className="section-card space-y-4">
          <h2 className="form-section-title">4. Uppmätt massa</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 font-medium text-muted-foreground">Mätpunkt</th>
                  <th className="text-left py-2 font-medium text-muted-foreground">Uppmätt (g/min)</th>
                  <th className="text-left py-2 font-medium text-muted-foreground">Beräknat (g/min)</th>
                  <th className="text-left py-2 font-medium text-muted-foreground w-32">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b last:border-0">
                  <td className="py-2.5 pr-4">Massflöde</td>
                  <td className="py-2.5 pr-4">
                    <Input className="h-8" inputMode="decimal" value={materialMeasuredMass} onChange={(e) => setMaterialMeasuredMass(e.target.value)} />
                  </td>
                  <td className="py-2.5 pr-4">
                    <Input className="h-8" inputMode="decimal" value={materialCalculated} onChange={(e) => setMaterialCalculated(e.target.value)} />
                  </td>
                  <td className="py-2.5">
                    <Select value={materialStatus} onValueChange={setMaterialStatus}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="OK">OK</SelectItem>
                        <SelectItem value="Ej OK">Ej OK</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Maskinbilder */}
      <div className="section-card space-y-4">
        <h2 className="form-section-title flex items-center gap-2">
          <Camera className="h-4 w-4" />
          Maskinbilder
        </h2>
        <PhotoCapture photos={machinePhotos} onChange={setMachinePhotos} maxPhotos={4} />
      </div>

      <div className="section-card space-y-5">
        <h2 className="form-section-title">Slutbedömning & Signatur</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Slutbedömning</Label>
            <Select value={finalAssessment} onValueChange={setFinalAssessment}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Godkänd för drift">Godkänd för drift</SelectItem>
                <SelectItem value="Godkänd med anmärkning">Godkänd med anmärkning</SelectItem>
                <SelectItem value="Ej godkänd">Ej godkänd</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Nästa rekommenderade kalibrering & service</Label>
            <Input type="date" value={nextCalibrationDate} onChange={(e) => { nextDateTouched.current = true; setNextCalibrationDate(e.target.value); }} />
          </div>
        </div>
        <div>
          <Label>Teknikerns signatur</Label>
          <SignaturePad value={signatureData} onChange={setSignatureData} />
        </div>
      </div>

      <Button
        size="lg"
        className="w-full"
        onClick={handleSave}
        disabled={saveMutation.isPending}
      >
        {saveMutation.isPending ? (
          "Sparar..."
        ) : (
          <>
            <Save className="h-4 w-4 mr-2" />
            Spara och Generera PDF
          </>
        )}
      </Button>

      {/* Add New Machine Dialog */}
      <Dialog open={showNewMachineDialog} onOpenChange={setShowNewMachineDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lägg till ny maskin</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Kategori *</Label>
              <Select value={newMachineCategory} onValueChange={(v) => { setNewMachineCategory(v as MachineCategory); setNewMachineModel(""); setNewMachineInterval(serviceIntervalMonths[v as MachineCategory]); }}>
                <SelectTrigger><SelectValue placeholder="Välj kategori" /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(machineCategories) as MachineCategory[]).map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Modell *</Label>
              <Select value={newMachineModel} onValueChange={setNewMachineModel} disabled={!newMachineCategory}>
                <SelectTrigger><SelectValue placeholder="Välj modell" /></SelectTrigger>
                <SelectContent>
                  {newMachineCategory && modelsByCategory[newMachineCategory as MachineCategory].map((m) => (
                    <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Serienummer</Label>
              <Input value={newMachineSerial} onChange={(e) => setNewMachineSerial(e.target.value)} placeholder="Valfritt" />
            </div>
            <div>
              <Label>Serviceintervall</Label>
              <Select value={String(newMachineInterval)} onValueChange={(v) => setNewMachineInterval(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Inget</SelectItem>
                  <SelectItem value="12">12 månader</SelectItem>
                  <SelectItem value="18">18 månader</SelectItem>
                  <SelectItem value="24">24 månader</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewMachineDialog(false)}>Avbryt</Button>
            <Button onClick={() => addMachineMutation.mutate()} disabled={addMachineMutation.isPending || !newMachineCategory || !newMachineModel}>
              {addMachineMutation.isPending ? "Sparar..." : "Lägg till"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

