// Location: backend/src/middleware/upload.ts
// Parses multipart/form-data uploads (how browsers send files).
// memoryStorage keeps the file in RAM as a Buffer: we stream it straight to
// Cloudinary, so nothing is written to Render's (temporary) disk.
import multer from "multer";
import { AppError } from "./errorHandler";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);

export const uploadBillImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 }, // 10 MB, one file
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES.has(file.mimetype)) return cb(null, true);
    cb(new AppError(400, "INVALID_FILE_TYPE", "Please upload a JPG, PNG, WEBP or HEIC photo"));
  },
}).single("image"); // the form field must be named "image"
