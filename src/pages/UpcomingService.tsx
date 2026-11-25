import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { CalendarClock, Mail, Trash2, CheckCircle } from "lucide-react";
import { differenceInDays } from "date-fns";
import { toast } from "sonner";
import { useUpcomingService } from "@/hooks/useUpcomingService";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function UpcomingServicePage() {
  const queryClient = useQueryClient();
  const [confirmReminder, setConfirmReminder] = useState<{ id: string } | null>(null);

  const { upcoming, isLoading, today, parseLocalDate } = useUpcomingService();

  const markReminderSent = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("service_protocols")
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["upcoming-service"] }),
  });

  const deleteProtocol = useMutation({
    mutationFn: async (id: string) => {
      const { data: row } = await supabase.from("service_protocols").select("photo_paths").eq("id", id).maybeSingle();
      const paths = row?.photo_paths || [];
      if (paths.length > 0) {
        const { error: rmErr } = await supabase.storage.from("machine-photos").remove(paths);
        if (rmErr) console.error("Kunde inte ta bort foton", rmErr);
      }
      const { error } = await supabase
        .from("service_protocols")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["upcoming-service"] });
      toast.success("Protokollet har tagits bort.");
    },
  });

  const sendReminder = async (p: any) => {
    const customer = p.customers as { name: string; email: string | null } | null;
    if (!customer?.email) {
      alert("Kunden har ingen registrerad e-postadress.");
      return;
    }

    const subject = encodeURIComponent(`Påminnelse: Service av ${p.machine_model} (SN: ${p.serial_number || "—"})`);
    const body = encodeURIComponent(
      `Hej ${customer.name}\n\n` +
      `Enligt vårt senaste serviceprotokoll är det nu dags för service av er maskin.\n\n` +
      `Maskinmodell: ${p.machine_model}\n` +
      `Serienummer: ${p.serial_number || "—"}\n` +
      `Senaste service: ${p.protocol_date}\n` +
      `Förfallodatum: ${p.next_calibration_date}\n\n` +
      `Vänligen kontakta oss för att boka en ny service.\n\n` +
      `Med vänliga hälsningar,\n` +
      `Piltorps Varmluft AB\n\n` +
      `Backa Bergögata 11\n` +
      `42246 Hisings Backa\n` +
      `031583065`
    );

    window.open(`mailto:${customer.email}?subject=${subject}&body=${body}`);
    // Don't mark as sent immediately — ask the user for confirmation afterwards
    setConfirmReminder({ id: p.id });
  };


  const getDaysLabel = (dateStr: string) => {
    const diff = differenceInDays(parseLocalDate(dateStr), today);
    if (diff < 0) return { text: `${Math.abs(diff)} dagar försenad`, className: "status-badge-destructive" };
    if (diff <= 14) return { text: `${diff} dagar kvar`, className: "status-badge-warning" };
    return { text: `${diff} dagar kvar`, className: "status-badge-success" };
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Kommande service</h1>
        <p className="text-muted-foreground mt-1">Maskiner som snart behöver service (inom 60 dagar).</p>
      </div>

      {isLoading ? (
        <div className="section-card text-center py-12 text-muted-foreground">Laddar...</div>
      ) : upcoming.length === 0 ? (
        <div className="section-card text-center py-12 text-muted-foreground">
          <CalendarClock className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>Inga maskiner behöver service inom de närmaste 60 dagarna.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {upcoming.map((p) => {
            const customer = p.customers as { name: string; email: string | null } | null;
            const daysInfo = getDaysLabel(p.next_calibration_date!);
            const reminderSent = !!(p as any).reminder_sent_at;
            return (
              <div
                key={p.id}
                className={`section-card flex items-center justify-between gap-4 ${reminderSent ? "opacity-60" : ""}`}
              >
                <div className="flex-1 min-w-0">
                  <p className={`font-medium truncate ${reminderSent ? "line-through" : ""}`}>
                    {customer?.name || "Okänd kund"}
                  </p>
                  <p className={`text-sm text-muted-foreground ${reminderSent ? "line-through" : ""}`}>
                    {p.machine_model} · SN: {p.serial_number || "—"}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-muted-foreground">Förfaller: {p.next_calibration_date}</span>
                    <span className={daysInfo.className}>{daysInfo.text}</span>
                    {reminderSent && (
                      <span className="inline-flex items-center gap-1 text-xs text-green-600">
                        <CheckCircle className="h-3 w-3" />
                        Påminnelse skickad
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => sendReminder(p)}
                    disabled={reminderSent}
                  >
                    <Mail className="h-4 w-4 mr-1" />
                    {reminderSent ? "Skickad" : "Påminn"}
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Ta bort protokoll</AlertDialogTitle>
                        <AlertDialogDescription>
                          Är du säker på att du vill ta bort detta serviceprotokoll? Detta kan inte ångras.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Avbryt</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteProtocol.mutate(p.id)}>
                          Ta bort
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!confirmReminder} onOpenChange={(open) => !open && setConfirmReminder(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Skickades påminnelsen?</AlertDialogTitle>
            <AlertDialogDescription>
              Bekräfta att du skickade e-postpåminnelsen så markeras protokollet som påmint.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setConfirmReminder(null)}>Nej</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmReminder) markReminderSent.mutate(confirmReminder.id);
                setConfirmReminder(null);
              }}
            >
              Ja
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}


