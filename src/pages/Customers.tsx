import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { machineCategories, type MachineCategory } from "@/lib/machines";
import { useMachineModels } from "@/hooks/useMachineModels";
import { supabase } from "@/integrations/supabase/client";
import { openPdfWindow, renderProtocolPdf } from "@/lib/generatePdf";
import { inspectionConfig, getCalibrationConfig } from "@/lib/inspectionConfig";
import { getPhotoSignedUrls } from "@/lib/photoStorage";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import MachineCalibrations from "@/components/MachineCalibrations";
import { Users, FileText, ChevronRight, Search, Pencil, Trash2, Wrench, ArrowLeft, Upload } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";
import type { PdfInspectionRow, PdfCalibrationRow, PdfMaterialRow } from "@/lib/generatePdf";

type ProtocolRow = Tables<"service_protocols">;

async function removePhotosWhere(column: "id" | "machine_id" | "customer_id", value: string) {
  const { data, error } = await supabase.from("service_protocols").select("photo_paths").eq(column, value);
  if (error) throw error;
  const paths = (data || []).flatMap((r) => r.photo_paths || []);
  if (paths.length > 0) {
    const { error: rmErr } = await supabase.storage.from("machine-photos").remove(paths);
    if (rmErr) console.error("Kunde inte ta bort foton", rmErr);
  }
}

function asArray<T>(v: unknown): T[] | null {
  return Array.isArray(v) ? (v as T[]) : null;
}

function buildPdfRows(p: ProtocolRow) {
  const inspectionRows =
    asArray<PdfInspectionRow>(p.inspection_items) ??
    (inspectionConfig[p.machine_category] || []).map((cfg) => {
      const row = p as unknown as Record<string, string | null>;
      return { label: cfg.label, status: row[cfg.status] || "OK", comment: row[cfg.comment] || "" };
    });
  const calibrationRows =
    asArray<PdfCalibrationRow>(p.calibration_items) ??
    getCalibrationConfig(p.machine_category, p.material_type || "PE").map((c) => ({
      label: c.label,
      unit: c.unit,
      refValue: c.refValue,
      measured: (c.field === "hotAir" ? p.hot_air_measured : p.plastic_mass_measured) || "",
      diff: (c.field === "hotAir" ? p.hot_air_diff : p.plastic_mass_diff) || "",
      status: (c.field === "hotAir" ? p.hot_air_status : p.plastic_mass_status) || "OK",
    }));
  const snapMat = p.material_item && typeof p.material_item === "object" && !Array.isArray(p.material_item)
    ? (p.material_item as unknown as PdfMaterialRow)
    : null;
  const materialRow: PdfMaterialRow | null = snapMat ?? (p.machine_category === "Plastextrudrar"
    ? {
        label: "Massflöde",
        unit: "g/min",
        measured: p.material_measured_mass || "",
        calculated: p.material_calculated || "",
        status: p.material_status || "OK",
      }
    : null);
  return { inspectionRows, calibrationRows, materialRow };
}

function ProtocolPhotos({ paths }: { paths: string[] }) {
  const { data: urls = [] } = useQuery({
    queryKey: ["protocol-photos", paths],
    queryFn: () => getPhotoSignedUrls(paths),
    enabled: paths.length > 0,
  });
  if (urls.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {urls.map((url, i) => (
        <a key={i} href={url} target="_blank" rel="noopener noreferrer">
          <img src={url} alt={`Maskinbild ${i + 1}`} className="h-16 w-16 object-cover rounded-md border border-border" />
        </a>
      ))}
    </div>
  );
}


export default function CustomersPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(null);

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editCustomer, setEditCustomer] = useState<{ id: string; name: string; email: string; phone: string; contact_person: string } | null>(null);

  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importRows, setImportRows] = useState<{ name: string; email: string; phone: string; contact_person: string }[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteCustomerId, setDeleteCustomerId] = useState<string | null>(null);

  const [deleteProtocolId, setDeleteProtocolId] = useState<string | null>(null);
  const [deleteProtocolDialogOpen, setDeleteProtocolDialogOpen] = useState(false);

  const [deleteMachineId, setDeleteMachineId] = useState<string | null>(null);
  const [deleteMachineDialogOpen, setDeleteMachineDialogOpen] = useState(false);

  const [editMachineDialogOpen, setEditMachineDialogOpen] = useState(false);
  const [editMachine, setEditMachine] = useState<{ id: string; machine_model: string; machine_category: string; serial_number: string; service_interval_months: number } | null>(null);
  const { modelsByCategory } = useMachineModels();

  const [editProtocolDialogOpen, setEditProtocolDialogOpen] = useState(false);
  const [editProtocol, setEditProtocol] = useState<{
    id: string;
    technician: string;
    order_number: string;
    protocol_date: string;
    final_assessment: string;
    comments: string;
    next_calibration_date: string;
  } | null>(null);

  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  // All machines (for searching by serial number / model in the customer list)
  const { data: allMachines = [] } = useQuery({
    queryKey: ["all-machines"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("machines")
        .select("id, customer_id, machine_model, serial_number");
      if (error) throw error;
      return data;
    },
  });

  // Fetch machines for selected customer
  const { data: machines = [] } = useQuery({
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

  // Fetch protocols — filtered by machine if selected, otherwise by customer
  const { data: protocols = [] } = useQuery({
    queryKey: ["protocols", selectedCustomerId, selectedMachineId],
    queryFn: async () => {
      if (!selectedCustomerId) return [];
      let query = supabase
        .from("service_protocols")
        .select("*")
        .eq("customer_id", selectedCustomerId)
        .order("protocol_date", { ascending: false });

      if (selectedMachineId) {
        query = query.eq("machine_id", selectedMachineId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!selectedCustomerId,
  });

  const updateMutation = useMutation({
    mutationFn: async (customer: { id: string; name: string; email: string; phone: string; contact_person: string }) => {
      const { error } = await supabase.from("customers").update({
        name: customer.name,
        email: customer.email || null,
        phone: customer.phone || null,
        contact_person: customer.contact_person || null,
      }).eq("id", customer.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Kund uppdaterad!");
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setEditDialogOpen(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // --- CSV import ---------------------------------------------------------
  const parseCsv = (text: string) => {
    // Strip BOM, split into non-empty lines
    const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
    if (lines.length === 0) return [];
    // Detect delimiter: semicolon (common in Swedish Excel) or comma
    const delimiter = (lines[0].match(/;/g)?.length ?? 0) >= (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";

    const splitLine = (line: string) => {
      const out: string[] = [];
      let cur = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') { cur += '"'; i++; }
          else inQuotes = !inQuotes;
        } else if (ch === delimiter && !inQuotes) {
          out.push(cur); cur = "";
        } else cur += ch;
      }
      out.push(cur);
      return out.map((c) => c.trim());
    };

    const headerCells = splitLine(lines[0]).map((h) => h.toLowerCase());
    const known = ["name", "namn", "email", "e-post", "epost", "mail", "phone", "telefon", "tel", "contact_person", "kontaktperson", "kontakt"];
    const hasHeader = headerCells.some((h) => known.includes(h));

    const idx = { name: 0, email: 1, phone: 2, contact: 3 };
    if (hasHeader) {
      headerCells.forEach((h, i) => {
        if (["name", "namn"].includes(h)) idx.name = i;
        else if (["email", "e-post", "epost", "mail"].includes(h)) idx.email = i;
        else if (["phone", "telefon", "tel"].includes(h)) idx.phone = i;
        else if (["contact_person", "kontaktperson", "kontakt"].includes(h)) idx.contact = i;
      });
    }

    const dataLines = hasHeader ? lines.slice(1) : lines;
    return dataLines
      .map((line) => {
        const cells = splitLine(line);
        return {
          name: cells[idx.name] ?? "",
          email: cells[idx.email] ?? "",
          phone: cells[idx.phone] ?? "",
          contact_person: cells[idx.contact] ?? "",
        };
      })
      .filter((r) => r.name.trim() !== "");
  };

  const handleFile = async (file: File) => {
    setImportError(null);
    if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
      setImportError("Filen måste vara en CSV-fil.");
      return;
    }
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length === 0) {
        setImportError("Inga giltiga rader hittades. Kontrollera att filen har en kolumn med kundnamn.");
        return;
      }
      setImportRows(rows);
    } catch {
      setImportError("Kunde inte läsa filen.");
    }
  };

  const importMutation = useMutation({
    mutationFn: async (rows: typeof importRows) => {
      const payload = rows.map((r) => ({
        name: r.name.trim(),
        email: r.email.trim() || null,
        phone: r.phone.trim() || null,
        contact_person: r.contact_person.trim() || null,
      }));
      const { error } = await supabase.from("customers").insert(payload);
      if (error) throw error;
      return payload.length;
    },
    onSuccess: (count) => {
      toast.success(`${count} kund${count === 1 ? "" : "er"} importerade!`);
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setImportDialogOpen(false);
      setImportRows([]);
      setImportError(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // Remove stored photos first; machines and protocols then cascade.
      await removePhotosWhere("customer_id", id);
      const { error } = await supabase.from("customers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Kund borttagen!");
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setDeleteDialogOpen(false);
      setSelectedCustomerId(null);
      setSelectedMachineId(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteProtocolMutation = useMutation({
    mutationFn: async (id: string) => {
      await removePhotosWhere("id", id);
      const { error } = await supabase.from("service_protocols").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Protokoll borttaget!");
      queryClient.invalidateQueries({ queryKey: ["protocols", selectedCustomerId, selectedMachineId] });
      setDeleteProtocolDialogOpen(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateProtocolMutation = useMutation({
    mutationFn: async (proto: NonNullable<typeof editProtocol>) => {
      const { error } = await supabase
        .from("service_protocols")
        .update({
          technician: proto.technician || null,
          order_number: proto.order_number || null,
          protocol_date: proto.protocol_date || null,
          final_assessment: proto.final_assessment || null,
          comments: proto.comments || null,
          next_calibration_date: proto.next_calibration_date || null,
        })
        .eq("id", proto.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Protokoll uppdaterat!");
      queryClient.invalidateQueries({ queryKey: ["protocols", selectedCustomerId, selectedMachineId] });
      setEditProtocolDialogOpen(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const openEditProtocol = (p: ProtocolRow) => {
    setEditProtocol({
      id: p.id,
      technician: p.technician || "",
      order_number: p.order_number || "",
      protocol_date: p.protocol_date || "",
      final_assessment: p.final_assessment || "Godkänd för drift",
      comments: p.comments || "",
      next_calibration_date: p.next_calibration_date || "",
    });
    setEditProtocolDialogOpen(true);
  };


  const deleteMachineMutation = useMutation({
    mutationFn: async (id: string) => {
      // Remove stored photos first; protocols then cascade.
      await removePhotosWhere("machine_id", id);
      const { error } = await supabase.from("machines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Maskin borttagen!");
      queryClient.invalidateQueries({ queryKey: ["customer-machines", selectedCustomerId] });
      queryClient.invalidateQueries({ queryKey: ["protocols", selectedCustomerId, selectedMachineId] });
      setDeleteMachineDialogOpen(false);
      if (selectedMachineId === deleteMachineId) setSelectedMachineId(null);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateMachineMutation = useMutation({
    mutationFn: async (machine: { id: string; machine_model: string; machine_category: string; serial_number: string; service_interval_months: number }) => {
      const { error } = await supabase.from("machines").update({
        machine_model: machine.machine_model,
        machine_category: machine.machine_category,
        serial_number: machine.serial_number || null,
        service_interval_months: machine.service_interval_months,
      }).eq("id", machine.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Maskin uppdaterad!");
      queryClient.invalidateQueries({ queryKey: ["customer-machines", selectedCustomerId] });
      setEditMachineDialogOpen(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);
  const selectedMachine = machines.find((m) => m.id === selectedMachineId);
  const searchLower = search.trim().toLowerCase();
  const machineMatchFor = (customerId: string) =>
    searchLower
      ? allMachines.find(
          (m) =>
            m.customer_id === customerId &&
            ((m.serial_number && m.serial_number.toLowerCase().includes(searchLower)) ||
              (m.machine_model && m.machine_model.toLowerCase().includes(searchLower)))
        )
      : undefined;
  const filtered = customers.filter((c) => {
    if (!searchLower) return true;
    return c.name.toLowerCase().includes(searchLower) || !!machineMatchFor(c.id);
  });

  const openPdf = (p: ProtocolRow) => {
    const customerName = selectedCustomer?.name || "";
    const rows = buildPdfRows(p);
    const w = openPdfWindow();
    if (!w) return;
    renderProtocolPdf(w, {
      customerName,
      orderNumber: p.order_number || "",
      technician: p.technician || "",
      protocolDate: p.protocol_date,
      machineCategory: p.machine_category,
      machineModel: p.machine_model,
      serialNumber: p.serial_number || "",
      operationHours: p.operation_hours || "",
      driveMotorHours: p.drive_motor_hours || "",
      fanMotorHours: p.fan_motor_hours || "",
      materialType: p.material_type || "",
      inspectionRows: rows.inspectionRows,
      protectiveEarth: p.protective_earth || "",
      hvTest: p.hv_test || "",
      calibrationRows: rows.calibrationRows,
      materialRow: rows.materialRow,
      finalAssessment: p.final_assessment || "",
      nextCalibrationDate: p.next_calibration_date || "",
      signatureData: p.signature_data || "",
      timeSpent: p.time_spent || "",
      actionsPerformed: p.actions_performed || "",
      comments: p.comments || "",
    });
  };

  const openEdit = (c: Tables<"customers">) => {
    setEditCustomer({
      id: c.id,
      name: c.name,
      email: c.email || "",
      phone: c.phone || "",
      contact_person: c.contact_person || "",
    });
    setEditDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Kundregister</h1>
        <p className="text-muted-foreground mt-1">Alla kunder och deras maskiner & servicehistorik.</p>
      </div>

      {!selectedCustomerId ? (
        <>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Sök kund, serienummer eller modell..."
                className="pl-10"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button variant="outline" onClick={() => { setImportRows([]); setImportError(null); setImportDialogOpen(true); }}>
              <Upload className="h-4 w-4 mr-2" /> Importera CSV
            </Button>
          </div>


          <div className="space-y-2">
            {filtered.length === 0 && (
              <div className="section-card text-center py-12 text-muted-foreground">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Inga kunder hittades.</p>
              </div>
            )}
            {filtered.map((c) => {
              const nameMatches = searchLower && c.name.toLowerCase().includes(searchLower);
              const machineHit = !nameMatches ? machineMatchFor(c.id) : undefined;
              return (
              <div
                key={c.id}
                className="section-card w-full flex items-center justify-between hover:shadow-md transition-shadow"
              >
                <button
                  className="flex-1 text-left cursor-pointer"
                  onClick={() => { setSelectedCustomerId(c.id); setSelectedMachineId(null); }}
                >
                  <p className="font-medium">{c.name}</p>
                  {c.email && <p className="text-sm text-muted-foreground">{c.email}</p>}
                  {c.phone && <p className="text-sm text-muted-foreground">{c.phone}</p>}
                  {machineHit && (
                    <p className="text-sm text-primary mt-1">
                      Träff: {machineHit.machine_model}{machineHit.serial_number ? ` · SN ${machineHit.serial_number}` : ""}
                    </p>
                  )}
                </button>
                <div className="flex items-center gap-1 ml-2">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(c)} title="Redigera">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => { setDeleteCustomerId(c.id); setDeleteDialogOpen(true); }} title="Ta bort">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
              );
            })}
          </div>
        </>
      ) : (
        <>
          <Button variant="outline" size="sm" onClick={() => { if (selectedMachineId) { setSelectedMachineId(null); } else { setSelectedCustomerId(null); } }}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            {selectedMachineId ? "Tillbaka till kund" : "Tillbaka till listan"}
          </Button>

          <div className="section-card flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">{selectedCustomer?.name}</h2>
              {selectedCustomer?.email && <p className="text-sm text-muted-foreground">{selectedCustomer.email}</p>}
              {selectedCustomer?.phone && <p className="text-sm text-muted-foreground">Tel: {selectedCustomer.phone}</p>}
              {selectedCustomer?.contact_person && <p className="text-sm text-muted-foreground">Kontakt: {selectedCustomer.contact_person}</p>}
            </div>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" onClick={() => openEdit(selectedCustomer)}>
                <Pencil className="h-4 w-4 mr-1" /> Redigera
              </Button>
              <Button variant="outline" size="sm" className="text-destructive" onClick={() => { setDeleteCustomerId(selectedCustomer!.id); setDeleteDialogOpen(true); }}>
                <Trash2 className="h-4 w-4 mr-1" /> Ta bort
              </Button>
            </div>
          </div>

          {/* Machine list or machine-specific history */}
          {!selectedMachineId ? (
            <>
              <h3 className="text-base font-semibold flex items-center gap-2">
                <Wrench className="h-4 w-4" /> Maskiner
              </h3>
              {machines.length === 0 ? (
                <div className="section-card text-center py-8 text-muted-foreground">
                  <Wrench className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Inga maskiner registrerade.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {machines.map((m) => (
                    <div
                      key={m.id}
                      className="section-card flex items-center justify-between hover:shadow-md transition-shadow"
                    >
                      <button
                        className="flex-1 text-left cursor-pointer"
                        onClick={() => setSelectedMachineId(m.id)}
                      >
                        <p className="font-medium">{m.machine_model}</p>
                        <p className="text-sm text-muted-foreground">
                          {m.machine_category} {m.serial_number ? `· SN: ${m.serial_number}` : ""}
                        </p>
                      </button>
                      <div className="flex items-center gap-1 ml-2">
                        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setEditMachine({ id: m.id, machine_model: m.machine_model, machine_category: m.machine_category, serial_number: m.serial_number || "", service_interval_months: m.service_interval_months ?? 12 }); setEditMachineDialogOpen(true); }} title="Redigera maskin">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); setDeleteMachineId(m.id); setDeleteMachineDialogOpen(true); }} title="Ta bort maskin">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Also show all protocols for this customer */}
              <h3 className="text-base font-semibold mt-4">Alla serviceprotokoll</h3>
              {protocols.length === 0 ? (
                <div className="section-card text-center py-8 text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Inga protokoll registrerade.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {protocols.map((p) => (
                    <div key={p.id} className="section-card flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">{p.machine_model}</p>
                        <p className="text-sm text-muted-foreground">
                          {p.protocol_date} · SN: {p.serial_number || "—"} ·{" "}
                          <span className={p.final_assessment === "Godkänd för drift" ? "status-badge-success" : "status-badge-warning"}>
                            {p.final_assessment}
                          </span>
                        </p>
                        {p.comments && (
                          <p className="text-sm text-muted-foreground mt-1 italic">Kommentar: {p.comments}</p>
                        )}
                        {p.photo_paths && p.photo_paths.length > 0 && (
                          <ProtocolPhotos paths={p.photo_paths} />
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => openPdf(p)}>
                          <FileText className="h-4 w-4 mr-1" /> PDF
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => openEditProtocol(p)} title="Redigera">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => { setDeleteProtocolId(p.id); setDeleteProtocolDialogOpen(true); }}>

                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              {/* Machine-specific view */}
              <div className="section-card">
                <div className="flex items-center gap-2 mb-1">
                  <Wrench className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-base font-semibold">{selectedMachine?.machine_model}</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  {selectedMachine?.machine_category} {selectedMachine?.serial_number ? `· SN: ${selectedMachine.serial_number}` : ""}
                </p>
              </div>

              {selectedMachineId && <MachineCalibrations machineId={selectedMachineId} />}

              <h3 className="text-base font-semibold">Servicehistorik för {selectedMachine?.machine_model}</h3>
              {protocols.length === 0 ? (
                <div className="section-card text-center py-8 text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>Inga protokoll för denna maskin.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {protocols.map((p) => (
                    <div key={p.id} className="section-card flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium">{p.protocol_date}</p>
                        <p className="text-sm text-muted-foreground">
                          SN: {p.serial_number || "—"} ·{" "}
                          <span className={p.final_assessment === "Godkänd för drift" ? "status-badge-success" : "status-badge-warning"}>
                            {p.final_assessment}
                          </span>
                        </p>
                        {p.comments && (
                          <p className="text-sm text-muted-foreground mt-1 italic">Kommentar: {p.comments}</p>
                        )}
                        {p.photo_paths && p.photo_paths.length > 0 && (
                          <ProtocolPhotos paths={p.photo_paths} />
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => openPdf(p)}>
                          <FileText className="h-4 w-4 mr-1" /> PDF
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => openEditProtocol(p)} title="Redigera">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => { setDeleteProtocolId(p.id); setDeleteProtocolDialogOpen(true); }}>

                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Edit Customer Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redigera kund</DialogTitle>
          </DialogHeader>
          {editCustomer && (
            <div className="space-y-3">
              <div><Label>Kundnamn</Label><Input value={editCustomer.name} onChange={(e) => setEditCustomer({ ...editCustomer, name: e.target.value })} /></div>
              <div><Label>E-post</Label><Input value={editCustomer.email} onChange={(e) => setEditCustomer({ ...editCustomer, email: e.target.value })} /></div>
              <div><Label>Telefonnummer</Label><Input value={editCustomer.phone} onChange={(e) => setEditCustomer({ ...editCustomer, phone: e.target.value })} /></div>
              <div><Label>Kontaktperson</Label><Input value={editCustomer.contact_person} onChange={(e) => setEditCustomer({ ...editCustomer, contact_person: e.target.value })} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Avbryt</Button>
            <Button onClick={() => editCustomer && updateMutation.mutate(editCustomer)} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Sparar..." : "Spara"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ta bort kund</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Är du säker? Alla serviceprotokoll och maskiner för denna kund kommer också att tas bort.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={() => deleteCustomerId && deleteMutation.mutate(deleteCustomerId)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Tar bort..." : "Ta bort"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Protocol Confirm Dialog */}
      <Dialog open={deleteProtocolDialogOpen} onOpenChange={setDeleteProtocolDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ta bort protokoll</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Är du säker på att du vill ta bort detta serviceprotokoll?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteProtocolDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={() => deleteProtocolId && deleteProtocolMutation.mutate(deleteProtocolId)} disabled={deleteProtocolMutation.isPending}>
              {deleteProtocolMutation.isPending ? "Tar bort..." : "Ta bort"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Machine Confirm Dialog */}
      <Dialog open={deleteMachineDialogOpen} onOpenChange={setDeleteMachineDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ta bort maskin</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Är du säker? Alla serviceprotokoll kopplade till denna maskin kommer också att tas bort.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteMachineDialogOpen(false)}>Avbryt</Button>
            <Button variant="destructive" onClick={() => deleteMachineId && deleteMachineMutation.mutate(deleteMachineId)} disabled={deleteMachineMutation.isPending}>
              {deleteMachineMutation.isPending ? "Tar bort..." : "Ta bort"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Machine Dialog */}
      <Dialog open={editMachineDialogOpen} onOpenChange={setEditMachineDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redigera maskin</DialogTitle>
          </DialogHeader>
          {editMachine && (
            <div className="space-y-3">
              <div>
                <Label>Kategori</Label>
                <Select value={editMachine.machine_category} onValueChange={(val) => setEditMachine({ ...editMachine, machine_category: val, machine_model: "" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.keys(machineCategories).map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Modell</Label>
                <Select value={editMachine.machine_model} onValueChange={(val) => setEditMachine({ ...editMachine, machine_model: val })}>
                  <SelectTrigger><SelectValue placeholder="Välj modell" /></SelectTrigger>
                  <SelectContent>
                    {(() => {
                      const list = editMachine.machine_category
                        ? modelsByCategory[editMachine.machine_category as MachineCategory] ?? []
                        : [];
                      const exists = list.some((m) => m.name === editMachine.machine_model);
                      return (
                        <>
                          {editMachine.machine_model && !exists && (
                            <SelectItem value={editMachine.machine_model}>
                              {editMachine.machine_model} (utgången modell)
                            </SelectItem>
                          )}
                          {list.map((model) => (
                            <SelectItem key={model.id} value={model.name}>{model.name}</SelectItem>
                          ))}
                        </>
                      );
                    })()}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Serienummer</Label>
                <Input value={editMachine.serial_number} onChange={(e) => setEditMachine({ ...editMachine, serial_number: e.target.value })} />
              </div>
              <div>
                <Label>Serviceintervall</Label>
                <Select value={String(editMachine.service_interval_months)} onValueChange={(val) => setEditMachine({ ...editMachine, service_interval_months: Number(val) })}>
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
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditMachineDialogOpen(false)}>Avbryt</Button>
            <Button onClick={() => editMachine && updateMachineMutation.mutate(editMachine)} disabled={updateMachineMutation.isPending || !editMachine?.machine_model}>
              {updateMachineMutation.isPending ? "Sparar..." : "Spara"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Protocol Dialog */}
      <Dialog open={editProtocolDialogOpen} onOpenChange={setEditProtocolDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redigera protokoll</DialogTitle>
          </DialogHeader>
          {editProtocol && (
            <div className="space-y-3">
              <div><Label>Tekniker</Label><Input value={editProtocol.technician} onChange={(e) => setEditProtocol({ ...editProtocol, technician: e.target.value })} /></div>
              <div><Label>Ordernummer</Label><Input value={editProtocol.order_number} onChange={(e) => setEditProtocol({ ...editProtocol, order_number: e.target.value })} /></div>
              <div><Label>Datum</Label><Input type="date" value={editProtocol.protocol_date} onChange={(e) => setEditProtocol({ ...editProtocol, protocol_date: e.target.value })} /></div>
              <div>
                <Label>Slutbedömning</Label>
                <Select value={editProtocol.final_assessment} onValueChange={(val) => setEditProtocol({ ...editProtocol, final_assessment: val })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Godkänd för drift">Godkänd för drift</SelectItem>
                    <SelectItem value="Godkänd med anmärkning">Godkänd med anmärkning</SelectItem>
                    <SelectItem value="Ej godkänd">Ej godkänd</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Nästa rekommenderade kalibrering &amp; service</Label><Input type="date" value={editProtocol.next_calibration_date} onChange={(e) => setEditProtocol({ ...editProtocol, next_calibration_date: e.target.value })} /></div>
              <div><Label>Kommentar</Label><Textarea value={editProtocol.comments} onChange={(e) => setEditProtocol({ ...editProtocol, comments: e.target.value })} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditProtocolDialogOpen(false)}>Avbryt</Button>
            <Button onClick={() => editProtocol && updateProtocolMutation.mutate(editProtocol)} disabled={updateProtocolMutation.isPending}>
              {updateProtocolMutation.isPending ? "Sparar..." : "Spara"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import CSV dialog */}
      <Dialog open={importDialogOpen} onOpenChange={(o) => { setImportDialogOpen(o); if (!o) { setImportRows([]); setImportError(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Importera kunder från CSV</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Dra in en CSV-fil eller klicka för att välja. Kolumner: <strong>Namn</strong>, E-post, Telefon, Kontaktperson (i den ordningen, eller med rubriker).
            </p>

            <label
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file) handleFile(file);
              }}
              className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${isDragging ? "border-primary bg-primary/5" : "border-border"}`}
            >
              <Upload className="h-8 w-8 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Släpp CSV-filen här eller klicka för att bläddra</span>
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
              />
            </label>

            {importError && <p className="text-sm text-destructive">{importError}</p>}

            {importRows.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">{importRows.length} kunder redo att importeras:</p>
                <div className="max-h-48 overflow-y-auto rounded-md border border-border divide-y">
                  {importRows.map((r, i) => (
                    <div key={i} className="px-3 py-2 text-sm">
                      <span className="font-medium">{r.name}</span>
                      {(r.email || r.phone) && (
                        <span className="text-muted-foreground"> · {[r.email, r.phone].filter(Boolean).join(" · ")}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportDialogOpen(false)}>Avbryt</Button>
            <Button
              onClick={() => importMutation.mutate(importRows)}
              disabled={importRows.length === 0 || importMutation.isPending}
            >
              Importera {importRows.length > 0 ? `(${importRows.length})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>


  );
}

