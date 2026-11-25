import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { differenceInDays } from "date-fns";

// Parse a "y-m-d" DATE string as local midnight to avoid UTC off-by-one errors.
const parseLocalDate = (dateStr: string) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export function useUpcomingService() {
  const { data: protocols = [], isLoading } = useQuery({
    queryKey: ["upcoming-service"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_protocols")
        .select("*, customers(name, email)")
        .not("next_calibration_date", "is", null)
        .order("next_calibration_date", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Keep only the latest protocol per machine.
  const latestByMachine = new Map<string, (typeof protocols)[number]>();
  for (const p of protocols) {
    const key = p.machine_id ?? `${p.machine_model ?? ""}|${p.serial_number ?? ""}`;
    const existing = latestByMachine.get(key);
    if (!existing || new Date(p.protocol_date) > new Date(existing.protocol_date)) {
      latestByMachine.set(key, p);
    }
  }

  const upcoming = Array.from(latestByMachine.values())
    .filter((p) => {
      if (!p.next_calibration_date) return false;
      const diff = differenceInDays(parseLocalDate(p.next_calibration_date), today);
      return diff <= 60;
    })
    .sort(
      (a, b) =>
        new Date(a.next_calibration_date!).getTime() - new Date(b.next_calibration_date!).getTime()
    );

  const dueCount = upcoming.filter((p) => !(p as any).reminder_sent_at).length;

  return { upcoming, dueCount, isLoading, today, parseLocalDate };
}

