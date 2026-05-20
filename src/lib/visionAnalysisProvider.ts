import type { UploadedPhoto, VisibleConditionFlag } from "../types/roof";

export interface VisionRoofObservation {
  conditionFlags: VisibleConditionFlag[];
  observations: string[];
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
  Future integration point:
  - VITE_VISION_PROVIDER=openai | anthropic | gemini | custom
  - VITE_VISION_ENABLED=true
  - Implement VisionAnalysisProvider in a server-side route or edge function.

  Keep API keys off the client in production. This MVP only exposes the interface
  and environment placeholders so rule-based assessments never pretend to be AI.
*/
