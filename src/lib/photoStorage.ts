import { supabase } from "@/integrations/supabase/client";

const BUCKET = "machine-photos";
const MAX_WIDTH = 1280;
const QUALITY = 0.8;

// Compress a data URL image: redraw to canvas with max width 1280px, export JPEG @0.8
async function compressDataUrl(dataUrl: string): Promise<Blob> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Kunde inte läsa bilden"));
    img.src = dataUrl;
  });

  const scale = img.width > MAX_WIDTH ? MAX_WIDTH / img.width : 1;
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas stöds inte");
  ctx.drawImage(img, 0, 0, width, height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Kunde inte komprimera bilden"));
    }, "image/jpeg", QUALITY);
  });
}

// Compress and upload an array of data-URL photos. Returns the storage paths.
export async function uploadMachinePhotos(photos: string[], protocolId: string): Promise<string[]> {
  const paths: string[] = [];
  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    if (!photo.startsWith("data:")) {
      // Already a stored path
      paths.push(photo);
      continue;
    }
    const blob = await compressDataUrl(photo);
    const path = `${protocolId}/${Date.now()}-${i}.jpg`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
      contentType: "image/jpeg",
      upsert: false,
    });
    if (error) throw error;
    paths.push(path);
  }
  return paths;
}

// Get signed URLs for stored photo paths (valid 1 hour).
export async function getPhotoSignedUrls(paths: string[]): Promise<string[]> {
  if (!paths || paths.length === 0) return [];
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
  if (error) throw error;
  return (data || []).map((d) => d.signedUrl).filter(Boolean) as string[];
}

