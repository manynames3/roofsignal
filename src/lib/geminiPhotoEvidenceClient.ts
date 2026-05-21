import type { UploadedPhoto, VisibleConditionFlag } from "../types/roof";
import type { VisionPhotoEvidenceSuggestion } from "./visionAnalysisProvider";

const MAX_GEMINI_PHOTOS = 8;
const MAX_IMAGE_EDGE = 1024;
const JPEG_QUALITY = 0.78;

interface GeminiPhotoPayload {
  photoId: string;
  fileName: string;
  mimeType: string;
  dataBase64: string;
}

export interface GeminiPhotoEvidenceResponse {
  configured: boolean;
  provider?: "gemini";
  model?: string;
  suggestions: VisionPhotoEvidenceSuggestion[];
  warnings?: string[];
  error?: string;
  details?: string;
}

export async function requestGeminiPhotoEvidenceSuggestions(
  photos: UploadedPhoto[]
): Promise<GeminiPhotoEvidenceResponse> {
  const payloadPhotos = await Promise.all(photos.slice(0, MAX_GEMINI_PHOTOS).map(toGeminiPhotoPayload));
  const response = await fetch("/api/photo-evidence-suggestions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ photos: payloadPhotos })
  });

  const payload = await response.json() as GeminiPhotoEvidenceResponse;

  if (!response.ok) {
    throw new Error(payload.error || `Gemini suggestion request failed with ${response.status}.`);
  }

  return {
    ...payload,
    suggestions: normalizeClientSuggestions(payload.suggestions ?? [])
  };
}

async function toGeminiPhotoPayload(photo: UploadedPhoto): Promise<GeminiPhotoPayload> {
  const response = await fetch(photo.previewUrl);
  const blob = await response.blob();
  const imageBlob = await resizeImageBlob(blob).catch(() => blob);
  const dataBase64 = await blobToBase64(imageBlob);

  return {
    photoId: photo.id,
    fileName: photo.fileName,
    mimeType: imageBlob.type || blob.type || photo.type || "image/jpeg",
    dataBase64
  };
}

async function resizeImageBlob(blob: Blob): Promise<Blob> {
  if (!blob.type.startsWith("image/")) return blob;

  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));

  if (scale >= 1 && blob.size <= 850_000) {
    bitmap.close();
    return blob;
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return blob;
  }

  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  return new Promise((resolve) => {
    canvas.toBlob((resized) => resolve(resized ?? blob), "image/jpeg", JPEG_QUALITY);
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result ?? "");
      resolve(value.includes(",") ? value.split(",")[1] : value);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read image for Gemini."));
    reader.readAsDataURL(blob);
  });
}

function normalizeClientSuggestions(suggestions: VisionPhotoEvidenceSuggestion[]): VisionPhotoEvidenceSuggestion[] {
  return suggestions.map((suggestion) => ({
    photoId: suggestion.photoId,
    caption: suggestion.caption,
    observations: suggestion.observations.filter(isVisibleConditionFlag),
    confidence: Number.isFinite(suggestion.confidence) ? suggestion.confidence : 0.45,
    notes: suggestion.notes ?? []
  }));
}

function isVisibleConditionFlag(value: string): value is VisibleConditionFlag {
  return [
    "no-obvious-damage",
    "curling-or-lifted-shingles",
    "missing-or-damaged-shingles",
    "granule-loss-or-bare-spots",
    "damaged-flashing-or-penetrations",
    "valley-or-gutter-wear",
    "sagging-or-soft-decking",
    "interior-staining",
    "limited-or-unclear-photos"
  ].includes(value);
}
