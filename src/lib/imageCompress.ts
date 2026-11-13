/**
 * Prépare une image avant envoi : redimensionnée (côté le plus long ≤ maxSide)
 * et compressée en JPEG (ou PNG si transparence). Les photos de téléphone de
 * 5 à 15 Mo deviennent quelques centaines de Ko, sans perte visible.
 * Si le navigateur ne sait pas lire le format, le fichier d'origine est renvoyé.
 */
export async function compressImage(file: File, maxSide = 1600, quality = 0.85): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif" || file.type === "image/svg+xml") return file;
  try {
    const bitmap = await loadBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();

    const keepAlpha = file.type === "image/png" || file.type === "image/webp";
    const type = keepAlpha && hasTransparency(ctx, w, h) ? "image/png" : "image/jpeg";
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, type, quality));
    if (!blob) return file;
    // garder l'original s'il est déjà plus léger et pas trop grand
    if (blob.size >= file.size && scale === 1) return file;
    const base = file.name.replace(/\.[^.]+$/, "") || "image";
    return new File([blob], `${base}.${type === "image/png" ? "png" : "jpg"}`, { type });
  } catch {
    return file;
  }
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try { return await createImageBitmap(file); } catch { /* repli ci-dessous */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function hasTransparency(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const step = Math.max(1, Math.floor(Math.min(w, h) / 40));
  const { data } = ctx.getImageData(0, 0, w, h);
  for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) if (data[(y * w + x) * 4 + 3] < 250) return true;
  return false;
}
