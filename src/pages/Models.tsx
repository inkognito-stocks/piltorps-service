import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { machineCategories, type MachineCategory } from "@/lib/machines";
import { MachineModel } from "@/hooks/useMachineModels";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Wrench, Pencil, Trash2, ChevronUp, ChevronDown, Plus, Check, X } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const CATEGORIES = Object.keys(machineCategories) as MachineCategory[];

export default function ModelsPage() {
  const queryClient = useQueryClient();

  const { data: models = [] } = useQuery({
    queryKey: ["machine-models", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("machine_models")
        .select("*")
        .order("category", { ascending: true })
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data as MachineModel[];
    },
  });

  const [newName, setNewName] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<MachineModel | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ model: MachineModel; newName: string; count: number } | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["machine-models"] });
    queryClient.invalidateQueries({ queryKey: ["all-machines"] });
    queryClient.invalidateQueries({ queryKey: ["upcoming-service"] });
  };

  const addMutation = useMutation({
    mutationFn: async ({ category, name }: { category: MachineCategory; name: string }) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Namnet får inte vara tomt");
      const existing = models.filter((m) => m.category === category);
      if (existing.some((m) => m.name.toLowerCase() === trimmed.toLowerCase())) {
        throw new Error("Modellen finns redan i den här kategorin");
      }
      const maxSort = existing.reduce((max, m) => Math.max(max, m.sort_order), -1);
      const { error } = await supabase.from("machine_models").insert({
        category, name: trimmed, sort_order: maxSort + 1,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => { setNewName((p) => ({ ...p, [vars.category]: "" })); invalidate(); toast.success("Modell tillagd"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("machine_models").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const reorderMutation = useMutation({
    mutationFn: async ({ a, b }: { a: MachineModel; b: MachineModel }) => {
      const { error: e1 } = await supabase.from("machine_models").update({ sort_order: b.sort_order }).eq("id", a.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("machine_models").update({ sort_order: a.sort_order }).eq("id", b.id);
      if (e2) throw e2;
    },
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("machine_models").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { setDeleteTarget(null); invalidate(); toast.success("Modell borttagen"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const renameMutation = useMutation({
    mutationFn: async ({ model, newName }: { model: MachineModel; newName: string }) => {
      const trimmed = newName.trim();
      if (!trimmed) throw new Error("Namnet får inte vara tomt");
      if (
        models.some(
          (m) => m.category === model.category && m.id !== model.id && m.name.toLowerCase() === trimmed.toLowerCase()
        )
      ) {
        throw new Error("Modellen finns redan i den här kategorin");
      }
      // Update the model itself
      const { error } = await supabase.from("machine_models").update({ name: trimmed }).eq("id", model.id);
      if (error) throw error;
      // Propagate to registered machines (NOT service_protocols — signed documents)
      const { error: mErr } = await supabase
        .from("machines")
        .update({ machine_model: trimmed })
        .eq("machine_model", model.name)
        .eq("machine_category", model.category);
      if (mErr) throw mErr;
    },
    onSuccess: () => { setRenameTarget(null); setEditingId(null); invalidate(); toast.success("Modell omdöpt"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const startRename = async (model: MachineModel) => {
    const trimmed = editValue.trim();
    if (!trimmed) { toast.error("Namnet får inte vara tomt"); return; }
    if (trimmed.toLowerCase() === model.name.toLowerCase() && trimmed === model.name) {
      setEditingId(null);
      return;
    }
    if (
      models.some(
        (m) => m.category === model.category && m.id !== model.id && m.name.toLowerCase() === trimmed.toLowerCase()
      )
    ) {
      toast.error("Modellen finns redan i den här kategorin");
      return;
    }
    // Count affected machines
    const { count } = await supabase
      .from("machines")
      .select("id", { count: "exact", head: true })
      .eq("machine_model", model.name)
      .eq("machine_category", model.category);
    setRenameTarget({ model, newName: trimmed, count: count ?? 0 });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Wrench className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-bold">Maskinmodeller</h1>
        <a href="/migrate" className="ml-auto text-sm text-primary underline">Flytta data från Lovable</a>
      </div>

      {CATEGORIES.map((category) => {
        const list = models
          .filter((m) => m.category === category)
          .sort((a, b) => a.sort_order - b.sort_order);
        return (
          <div key={category} className="section-card space-y-3">
            <h2 className="font-semibold text-base">{category}</h2>

            <div className="flex gap-2">
              <Input
                placeholder="Ny modell..."
                value={newName[category] ?? ""}
                onChange={(e) => setNewName((p) => ({ ...p, [category]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === "Enter") addMutation.mutate({ category, name: newName[category] ?? "" }); }}
              />
              <Button
                onClick={() => addMutation.mutate({ category, name: newName[category] ?? "" })}
                disabled={addMutation.isPending || !(newName[category] ?? "").trim()}
              >
                <Plus className="h-4 w-4 mr-1" /> Lägg till
              </Button>
            </div>

            <div className="divide-y">
              {list.map((model, idx) => (
                <div key={model.id} className="flex items-center gap-2 py-2">
                  <div className="flex flex-col">
                    <button
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      disabled={idx === 0}
                      onClick={() => reorderMutation.mutate({ a: model, b: list[idx - 1] })}
                    ><ChevronUp className="h-4 w-4" /></button>
                    <button
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      disabled={idx === list.length - 1}
                      onClick={() => reorderMutation.mutate({ a: model, b: list[idx + 1] })}
                    ><ChevronDown className="h-4 w-4" /></button>
                  </div>

                  <div className="flex-1">
                    {editingId === model.id ? (
                      <div className="flex items-center gap-2">
                        <Input
                          value={editValue}
                          autoFocus
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") startRename(model); if (e.key === "Escape") setEditingId(null); }}
                        />
                        <Button size="icon" variant="ghost" onClick={() => startRename(model)}><Check className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => setEditingId(null)}><X className="h-4 w-4" /></Button>
                      </div>
                    ) : (
                      <span className={model.active ? "" : "text-muted-foreground line-through"}>{model.name}</span>
                    )}
                  </div>

                  {editingId !== model.id && (
                    <>
                      <div className="flex items-center gap-1">
                        <Switch
                          checked={model.active}
                          onCheckedChange={(active) => toggleActiveMutation.mutate({ id: model.id, active })}
                        />
                        <span className="text-xs text-muted-foreground w-10">{model.active ? "Aktiv" : "Av"}</span>
                      </div>
                      <Button size="icon" variant="ghost" onClick={() => { setEditingId(model.id); setEditValue(model.name); }} title="Byt namn">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setDeleteTarget(model)} title="Ta bort">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
              {list.length === 0 && <p className="text-sm text-muted-foreground py-2">Inga modeller ännu.</p>}
            </div>
          </div>
        );
      })}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ta bort {deleteTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Maskiner som redan är registrerade med denna modell påverkas inte.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}>
              Ta bort
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!renameTarget} onOpenChange={(o) => !o && setRenameTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Byt namn på modell?</AlertDialogTitle>
            <AlertDialogDescription>
              {renameTarget?.count ?? 0} registrerade maskiner kommer att byta namn till "{renameTarget?.newName}". Sparade protokoll påverkas inte. Fortsätt?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => renameTarget && renameMutation.mutate({ model: renameTarget.model, newName: renameTarget.newName })}
            >
              Fortsätt
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

