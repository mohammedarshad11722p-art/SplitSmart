// Location: frontend/lib/image.ts
// Shrinks a phone photo before upload: 8 MB → ~400 KB uploads in a second on
// 4G instead of 15. Text on a bill stays readable at 2000 px.
// If the browser can't decode the format (e.g. HEIC on Chrome), we just send
// the original and let Cloudinary convert it.

const MAX_SIDE = 2000;

export async function compressImage(file: File): Promise<{ blob: Blob; filename: string }> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return { blob: file, filename: file.name };
    return { blob, filename: file.name.replace(/\.\w+$/, "") + ".jpg" };
  } catch {
    return { blob: file, filename: file.name };
  }
}
