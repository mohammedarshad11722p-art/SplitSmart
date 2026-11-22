// Location: backend/src/lib/cloudinary.ts
// Uploads bill photos to Cloudinary and builds an AI-friendly image URL.
import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";
import { env } from "../config/env";
import { AppError } from "../middleware/errorHandler";

if (env.cloudinaryConfigured) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true, // always https URLs
  });
}

export interface UploadedImage {
  url: string; // original image, for showing to users
  publicId: string; // Cloudinary's id, needed to delete/transform later
  aiUrl: string; // resized JPEG version that we send to the AI
}

/** Streams an in-memory file (from multer) to Cloudinary. */
export function uploadBillImage(buffer: Buffer): Promise<UploadedImage> {
  if (!env.cloudinaryConfigured) {
    return Promise.reject(new AppError(500, "CLOUDINARY_NOT_CONFIGURED", "Image storage is not configured"));
  }

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: "splitsmart/bills", resource_type: "image" },
      (error, result?: UploadApiResponse) => {
        if (error || !result) {
          return reject(new AppError(502, "UPLOAD_FAILED", "Could not upload the image. Please try again."));
        }
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          aiUrl: buildAiImageUrl(result.public_id),
        });
      },
    );
    stream.end(buffer);
  });
}

/**
 * Cloudinary can transform images on the fly through the URL.
 * - w_1600,c_limit: shrink big phone photos (8 MB → ~300 KB) without upscaling
 * - f_jpg: converts iPhone HEIC photos to JPEG, which every AI model accepts
 * - q_auto: good quality at a small size
 * Smaller images = faster and cheaper AI calls, and text stays readable at 1600px.
 */
export function buildAiImageUrl(publicId: string): string {
  return cloudinary.url(publicId, {
    secure: true,
    transformation: [{ width: 1600, crop: "limit", quality: "auto", fetch_format: "jpg" }],
  });
}
