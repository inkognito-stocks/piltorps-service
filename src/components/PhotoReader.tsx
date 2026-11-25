import { useRef, useState } from "react";
import { Camera, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downscale, readImage, type VisionKind, type VisionResult } from "@/lib/calibration";
import { toast } from "sonner";

interface Props {
  kind: VisionKind;
  label: string;
  photo?: string;
  onResult: (result: VisionResult, photo: string) => void;
  size?: "sm" | "default" | "lg";
  variant?: "default" | "outline";
  className?: string;
}

/** Camera button: takes a photo, sends it to the AI reader and returns the values. */
export default function PhotoReader({ kind, label, photo, onResult, size = "default", variant = "outline", className }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const raw = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      const small = await downscale(raw);
      const result = await readImage(kind, small);
      onResult(result, small);
      if (result.confidence === "låg") toast.warning("Osäker avläsning – kontrollera värdena.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Avläsningen misslyckades");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`flex items-center gap-3 ${className || ""}`}>
      {photo && <img src={photo} alt="" className="h-12 w-12 rounded-md object-cover border" />}
      <Button type="button" size={size} variant={variant} disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? <Loader2 className="animate-spin" /> : photo ? <RefreshCw /> : <Camera />}
        {busy ? "Läser av..." : photo ? "Fota igen" : label}
      </Button>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handle} />
    </div>
  );
}
