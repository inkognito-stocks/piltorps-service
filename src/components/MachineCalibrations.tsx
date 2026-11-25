import { useQuery } from "@tanstack/react-query";
import { Gauge } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { openPdfWindow } from "@/lib/generatePdf";
import { renderCalibrationPdf } from "@/lib/generateCalibrationPdf";
import { calibrationToPdf } from "@/pages/Calibration";

/** Calibration certificates for one machine, shown in the customer register. */
export default function MachineCalibrations({ machineId }: { machineId: string }) {
  const { data = [] } = useQuery({
    queryKey: ["calibrations", "machine", machineId],
    queryFn: async () => {
      const { data, error } = await supabase.from("calibrations").select("*, customers(name)")
        .eq("machine_id", machineId).order("calibration_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  if (!data.length) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-base font-semibold flex items-center gap-2"><Gauge className="h-4 w-4" /> Kalibreringscertifikat</h3>
      {data.map((c) => (
        <div key={c.id} className="section-card !p-4 flex items-center justify-between gap-3">
          <div>
            <p className="font-medium">{c.calibration_date} · {c.certificate_no}</p>
            <p className={`text-sm ${c.result === "Godkänd" ? "text-green-700" : "text-red-700"}`}>{c.result}{c.next_calibration_date ? ` · nästa ${c.next_calibration_date}` : ""}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => { const w = openPdfWindow(); if (w) renderCalibrationPdf(w, calibrationToPdf(c)); }}>Visa</Button>
        </div>
      ))}
    </div>
  );
}
