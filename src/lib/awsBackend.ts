import type {
  PhotoEvidence,
  PropertyDetails,
  SavedReadinessReport,
  SolarOpportunityAssumptions,
  SolarOpportunityEstimate,
  UploadedPhoto,
  VisibleConditionFlag
} from "../types/roof";
import type { VisionPhotoEvidenceSuggestion } from "./visionAnalysisProvider";

const AUTH_KEY = "roofsignal.awsAuth.v1";
const MAX_GEMINI_PHOTOS = 8;
const MAX_IMAGE_EDGE = 1024;
const JPEG_QUALITY = 0.78;

interface AwsConfig {
  apiUrl: string;
  region: string;
  userPoolClientId: string;
  cognitoDomain: string;
}

export interface AwsAuthSession {
  accessToken: string;
  idToken: string;
  email: string;
  companyId: string;
  role: string;
  expiresAt: number;
}

interface PresignResponse {
  uploadUrl: string;
  storageKey: string;
  expiresIn: number;
}

interface GeminiPhotoPayload {
  photoId: string;
  fileName: string;
  mimeType: string;
  dataBase64: string;
}

export interface AccessRequestInput {
  name: string;
  email: string;
  companyName: string;
  phone: string;
  notes: string;
}

export function isAwsBackendConfigured(): boolean {
  return Boolean(getAwsConfig());
}

export function getAwsConfig(): AwsConfig | null {
  const apiUrl = import.meta.env.VITE_AWS_API_URL?.trim();
  const region = import.meta.env.VITE_AWS_REGION?.trim();
  const userPoolClientId = import.meta.env.VITE_AWS_USER_POOL_CLIENT_ID?.trim();
  const cognitoDomain = import.meta.env.VITE_AWS_COGNITO_DOMAIN?.trim();

  if (!apiUrl || !region || !userPoolClientId || !cognitoDomain) return null;

  return {
    apiUrl: apiUrl.replace(/\/+$/, ""),
    region,
    userPoolClientId,
    cognitoDomain: cognitoDomain.replace(/\/+$/, "")
  };
}

export function getStoredAuthSession(): AwsAuthSession | null {
  if (typeof localStorage === "undefined") return null;

  const raw = localStorage.getItem(AUTH_KEY);
  if (!raw) return null;

  try {
    const session = JSON.parse(raw) as AwsAuthSession;
    if (!session.accessToken || session.expiresAt * 1000 < Date.now() + 30_000) {
      clearAwsAuthSession();
      return null;
    }
    return session;
  } catch {
    clearAwsAuthSession();
    return null;
  }
}

export function consumeAuthSessionFromUrl(): AwsAuthSession | null {
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  const params = new URLSearchParams(hash);
  const accessToken = params.get("access_token");
  const idToken = params.get("id_token");

  if (!accessToken || !idToken) return getStoredAuthSession();

  const accessPayload = decodeJwtPayload(accessToken);
  const idPayload = decodeJwtPayload(idToken);
  const session: AwsAuthSession = {
    accessToken,
    idToken,
    email: String(idPayload.email ?? accessPayload.email ?? ""),
    companyId: String(idPayload["custom:companyId"] ?? accessPayload["custom:companyId"] ?? ""),
    role: String(idPayload["custom:role"] ?? accessPayload["custom:role"] ?? "admin"),
    expiresAt: Number(accessPayload.exp ?? idPayload.exp ?? 0)
  };

  localStorage.setItem(AUTH_KEY, JSON.stringify(session));

  const url = new URL(window.location.href);
  url.hash = "";
  window.history.replaceState({}, "", url.toString());
  return session;
}

export function clearAwsAuthSession() {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(AUTH_KEY);
  }
}

export function getAwsLoginUrl(): string {
  const config = requireAwsConfig();
  const redirectUri = `${window.location.origin}/app`;
  const url = new URL(`${config.cognitoDomain}/login`);
  url.searchParams.set("client_id", config.userPoolClientId);
  url.searchParams.set("response_type", "token");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("redirect_uri", redirectUri);
  return url.toString();
}

export function getAwsLogoutUrl(): string {
  const config = requireAwsConfig();
  const url = new URL(`${config.cognitoDomain}/logout`);
  url.searchParams.set("client_id", config.userPoolClientId);
  url.searchParams.set("logout_uri", `${window.location.origin}/`);
  return url.toString();
}

export async function submitAccessRequest(input: AccessRequestInput) {
  const config = requireAwsConfig();
  await awsFetch(config, "/request-access", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export async function listAwsReports(session: AwsAuthSession): Promise<SavedReadinessReport[]> {
  const payload = await awsJson<{ reports: SavedReadinessReport[] }>(session, "/reports");
  return payload.reports ?? [];
}

export async function createAwsReport(session: AwsAuthSession, savedReport: SavedReadinessReport): Promise<SavedReadinessReport> {
  const payload = await awsJson<{ report: SavedReadinessReport }>(session, "/reports", {
    method: "POST",
    body: JSON.stringify({ savedReport })
  });
  return payload.report;
}

export async function getAwsReport(session: AwsAuthSession, reportId: string): Promise<SavedReadinessReport> {
  const payload = await awsJson<{ report: SavedReadinessReport }>(session, `/reports/${encodeURIComponent(reportId)}`);
  return payload.report;
}

export async function deleteAwsReport(session: AwsAuthSession, reportId: string): Promise<void> {
  await awsJson(session, `/reports/${encodeURIComponent(reportId)}`, { method: "DELETE" });
}

export async function createAwsShareLink(session: AwsAuthSession, reportId: string): Promise<{ shareId: string; expiresAt: number }> {
  return awsJson(session, `/reports/${encodeURIComponent(reportId)}/share`, { method: "POST" });
}

export async function getSharedAwsReport(shareId: string): Promise<SavedReadinessReport> {
  const config = requireAwsConfig();
  const payload = await awsFetch(config, `/share/${encodeURIComponent(shareId)}`).then((response) => response.json()) as {
    report: SavedReadinessReport;
  };
  return payload.report;
}

export async function getAwsCrmExport(session: AwsAuthSession, reportId: string): Promise<{ fileName: string; csv: string }> {
  return awsJson(session, `/reports/${encodeURIComponent(reportId)}/crm-export`, { method: "POST" });
}

export async function requestAwsSolarEstimate(
  session: AwsAuthSession,
  details: PropertyDetails,
  assumptions: SolarOpportunityAssumptions
): Promise<SolarOpportunityEstimate> {
  const payload = await awsJson<{ estimate: SolarOpportunityEstimate }>(session, "/solar-estimate", {
    method: "POST",
    body: JSON.stringify({ details, assumptions })
  });
  return payload.estimate;
}

export async function requestAwsPhotoEvidenceSuggestions(
  session: AwsAuthSession,
  photos: UploadedPhoto[]
): Promise<{ configured: boolean; suggestions: VisionPhotoEvidenceSuggestion[]; warnings?: string[]; error?: string }> {
  const payloadPhotos = await Promise.all(photos.slice(0, MAX_GEMINI_PHOTOS).map(toGeminiPhotoPayload));
  const payload = await awsJson<{
    configured: boolean;
    suggestions: VisionPhotoEvidenceSuggestion[];
    warnings?: string[];
    error?: string;
  }>(session, "/photo-evidence-suggestions", {
    method: "POST",
    body: JSON.stringify({ photos: payloadPhotos })
  });
  return {
    ...payload,
    suggestions: (payload.suggestions ?? []).map((suggestion) => ({
      ...suggestion,
      observations: suggestion.observations.filter(isVisibleConditionFlag)
    }))
  };
}

export async function attachAwsPhotoStorage(
  session: AwsAuthSession,
  photos: UploadedPhoto[],
  evidence: PhotoEvidence[]
): Promise<PhotoEvidence[]> {
  const storageByPhotoId = new Map<string, string>();

  for (const photo of photos) {
    if (!photo.previewUrl.startsWith("blob:")) continue;

    const blob = await fetch(photo.previewUrl).then((response) => response.blob());
    const presign = await awsJson<PresignResponse>(session, "/photos/presign", {
      method: "POST",
      body: JSON.stringify({
        fileName: photo.fileName,
        contentType: blob.type || photo.type || "image/jpeg",
        sizeBytes: blob.size || photo.sizeBytes
      })
    });

    const uploadResponse = await fetch(presign.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": blob.type || photo.type || "image/jpeg"
      },
      body: blob
    });

    if (!uploadResponse.ok) {
      throw new Error(`Photo upload failed for ${photo.fileName}.`);
    }

    storageByPhotoId.set(photo.id, presign.storageKey);
  }

  return evidence.map((item) => ({
    ...item,
    storageKey: storageByPhotoId.get(item.photoId) ?? item.storageKey
  }));
}

export function downloadCsv(fileName: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

async function awsJson<T>(session: AwsAuthSession, path: string, init: RequestInit = {}): Promise<T> {
  const config = requireAwsConfig();
  const response = await awsFetch(config, path, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.idToken}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });
  return response.json() as Promise<T>;
}

async function awsFetch(config: AwsConfig, path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`${config.apiUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });

  if (!response.ok) {
    let message = `AWS API returned ${response.status}.`;
    try {
      const payload = await response.json() as { error?: string };
      message = payload.error ?? message;
    } catch {
      // Keep the status-based message.
    }
    throw new Error(message);
  }

  return response;
}

function requireAwsConfig(): AwsConfig {
  const config = getAwsConfig();
  if (!config) throw new Error("AWS backend is not configured.");
  return config;
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const [, payload] = token.split(".");
  if (!payload) return {};
  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  try {
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return {};
  }
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
    reader.onerror = () => reject(reader.error ?? new Error("Could not read image."));
    reader.readAsDataURL(blob);
  });
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
