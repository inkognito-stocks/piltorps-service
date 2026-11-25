import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MachineCategory } from "@/lib/machines";

export interface MachineModel {
  id: string;
  category: string;
  name: string;
  sort_order: number;
  active: boolean;
  created_at: string;
}

export type ModelsByCategory = Record<MachineCategory, MachineModel[]>;

const EMPTY: ModelsByCategory = {
  Handmaskiner: [],
  Automatsvetsar: [],
  Plastextrudrar: [],
  Luftvärmare: [],
};

/**
 * Fetches active machine models grouped by category (ordered by sort_order).
 */
export function useMachineModels() {
  const query = useQuery({
    queryKey: ["machine-models", "active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("machine_models")
        .select("*")
        .eq("active", true)
        .order("category", { ascending: true })
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data as MachineModel[];
    },
  });

  const grouped: ModelsByCategory = { ...EMPTY, Handmaskiner: [], Automatsvetsar: [], Plastextrudrar: [], Luftvärmare: [] };
  for (const m of query.data ?? []) {
    if (grouped[m.category as MachineCategory]) {
      grouped[m.category as MachineCategory].push(m);
    }
  }

  return { modelsByCategory: grouped, isLoading: query.isLoading };
}

