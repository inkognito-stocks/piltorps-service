import { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatabaseZap } from "lucide-react";

// The old Lovable Cloud backend. These are public (anon) values from the old app's .env.
const OLD_URL = "https://moxoanrhnukxbnwaqiix.supabase.co";
const OLD_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1veG9hbnJobnVreGJud2FxaWl4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5NTkwMDksImV4cCI6MjA4OTUzNTAwOX0.dxKdusw44ERP2qD2Bbxsa4yGM6nBjV4Vi7GpDkFG3_0";
const BUCKET = "machine-photos";

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function Migrate() {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const add = (l: string) => setLog((x) => [...x, l]);

  const run = async () => {
    setRunning(true);
    setLog([]);
    const old = createClient(OLD_URL, OLD_KEY, { auth: { persistSession: false, storageKey: "old-lovable" } });
    try {
      const { error: authErr } = await old.auth.signInWithPassword({ email, password });
      if (authErr) throw new Error("Inloggning i gamla appen misslyckades: " + authErr.message);
      add("Inloggad i gamla appen.");

      const fetchAll = async (table: string) => {
        const rows: any[] = [];
        for (let from = 0; ; from += 1000) {
          const { data, error } = await old.from(table).select("*").range(from, from + 999);
          if (error) throw new Error(`${table}: ${error.message}`);
          rows.push(...(data || []));
          if (!data || data.length < 1000) break;
        }
        return rows;
      };
      const upsert = async (table: string, rows: any[], onConflict = "id") => {
        for (let i = 0; i < rows.length; i += 50) {
          const { error } = await (supabase.from(table as any) as any).upsert(rows.slice(i, i + 50), { onConflict });
          if (error) throw new Error(`${table}: ${error.message}`);
        }
        add(`✓ ${table}: ${rows.length} rader`);
      };

      const models = await fetchAll("machine_models");
      await upsert("machine_models", models.map(({ id, created_at, ...r }) => r), "category,name");
      await upsert("customers", await fetchAll("customers"));
      await upsert("machines", await fetchAll("machines"));
      const protocols = await fetchAll("service_protocols");
      await upsert("service_protocols", protocols);

      const paths = protocols.flatMap((p) => p.photo_paths || []);
      add(`Kopierar ${paths.length} bilder...`);
      let ok = 0;
      for (const path of paths) {
        const { data: blob, error } = await old.storage.from(BUCKET).download(path);
        if (error || !blob) { add(`✗ ${path}: ${error?.message}`); continue; }
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: true });
        if (upErr) add(`✗ ${path}: ${upErr.message}`); else ok++;
      }
      add(`✓ Bilder: ${ok} av ${paths.length}`);
      add("Klart. Du kan köra om flytten – befintliga rader skrivs över, inget dubbleras.");
      await old.auth.signOut();
      qc.invalidateQueries();
    } catch (e) {
      add("FEL: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><DatabaseZap className="h-6 w-6" /> Flytta data från Lovable</h1>
        <p className="text-muted-foreground mt-1">Logga in med ditt konto i den gamla appen. Kunder, maskiner, modeller, protokoll och bilder kopieras hit. Den gamla appen ändras inte.</p>
      </div>
      <div className="section-card space-y-3">
        <div><Label>E-post (gamla appen)</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div><Label>Lösenord (gamla appen)</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <Button onClick={run} disabled={running || !email || !password}>{running ? "Flyttar..." : "Starta flytt"}</Button>
      </div>
      {log.length > 0 && <pre className="section-card text-xs whitespace-pre-wrap">{log.join("\n")}</pre>}
    </div>
  );
}
