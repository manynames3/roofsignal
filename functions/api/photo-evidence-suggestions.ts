import { handleGeminiPhotoEvidenceRequest } from "../_shared/geminiPhotoEvidence.mjs";

export function onRequest(context: { request: Request; env: Record<string, string | undefined> }) {
  return handleGeminiPhotoEvidenceRequest(context.request, context.env);
}
