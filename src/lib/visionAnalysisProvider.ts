import type { PhotoEvidence, UploadedPhoto, VisibleConditionFlag } from "../types/roof";

export interface VisionPhotoEvidenceSuggestion {
  photoId: string;
  caption: string;
  observations: VisibleConditionFlag[];
  confidence: number;
  notes: string[];
}

export interface VisionRoofObservation {
  conditionFlags: VisibleConditionFlag[];
  observations: string[];
  photoEvidenceSuggestions: VisionPhotoEvidenceSuggestion[];
  confidence: number;
}

export interface VisionAnalysisProvider {
  analyzeRoofPhotos(photos: UploadedPhoto[]): Promise<VisionRoofObservation>;
}

export function isVisionAnalysisConfigured(): boolean {
  return import.meta.env.VITE_VISION_ENABLED === "true" && Boolean(import.meta.env.VITE_VISION_PROVIDER);
}

export async function getVisionObservation(
  photos: UploadedPhoto[],
  provider?: VisionAnalysisProvider
): Promise<VisionRoofObservation | null> {
  if (!provider || !isVisionAnalysisConfigured() || photos.length === 0) {
    return null;
  }

  return provider.analyzeRoofPhotos(photos);
}

/*
  Future provider abstraction:
  - VITE_VISION_PROVIDER=openai | anthropic | gemini | custom
  - VITE_VISION_ENABLED=true
  - Implement VisionAnalysisProvider in a server-side route or edge function.
  - Convert VisionPhotoEvidenceSuggestion results into PhotoEvidence records with
    source: "vision-suggested", then require rep confirmation before scoring.

  Keep API keys off the client in production. The current Gemini endpoint follows
  this pattern for photo evidence suggestions; this interface remains available
  for future multi-provider support.
*/

export function toVisionSuggestedPhotoEvidence(
  photos: UploadedPhoto[],
  suggestions: VisionPhotoEvidenceSuggestion[]
): PhotoEvidence[] {
  const suggestionsByPhotoId = new Map(suggestions.map((suggestion) => [suggestion.photoId, suggestion]));

  return photos.flatMap((photo) => {
    const suggestion = suggestionsByPhotoId.get(photo.id);
    if (!suggestion) return [];

    return {
      photoId: photo.id,
      fileName: photo.fileName,
      previewUrl: photo.previewUrl,
      caption: suggestion.caption,
      observations: [...suggestion.observations],
      source: "vision-suggested" as const
    };
  });
}
