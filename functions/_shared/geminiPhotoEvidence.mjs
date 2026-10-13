const ALLOWED_FLAGS = [
  "no-obvious-damage",
  "curling-or-lifted-shingles",
  "missing-or-damaged-shingles",
  "granule-loss-or-bare-spots",
  "damaged-flashing-or-penetrations",
  "valley-or-gutter-wear",
  "sagging-or-soft-decking",
  "interior-staining",
  "limited-or-unclear-photos"
];

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-lite";
const MAX_PHOTOS = 8;
const MAX_REQUEST_BYTES = 10 * 1024 * 1024;
// The client downsizes to a 1024px JPEG (or sends files under ~850 KB), so this is generous.
const MAX_PHOTO_BASE64_CHARS = 1_500_000;
const MAX_ID_LENGTH = 120;
const PROVIDER_TIMEOUT_MS = 18_000;
const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;
const MODEL_PATTERN = /^[A-Za-z0-9._-]+$/;
const DEMO_NOTICE =
  "Demo endpoint: same-origin only, with no user authentication or per-user rate limiting. " +
  "Use the authenticated AWS backend (Cognito + per-company limits) for anything beyond a demo.";

export async function handleGeminiPhotoEvidenceRequest(request, env = {}) {
  if (request.method === "OPTIONS") {
    // Same-origin requests never preflight, and no CORS headers are sent, so cross-origin preflights fail.
    return jsonResponse({}, 204);
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  if (env.ENABLE_DEMO_GEMINI !== "true") {
    return jsonResponse(
      {
        configured: false,
        suggestions: [],
        error: "The demo Gemini endpoint is disabled. Set ENABLE_DEMO_GEMINI=true to enable it for a demo, or use the authenticated AWS backend."
      },
      403
    );
  }

  if (!isSameOrigin(request)) {
    return jsonResponse({ configured: true, suggestions: [], error: "Cross-origin or origin-less requests are not allowed." }, 403);
  }

  const apiKey = env.GEMINI_API_KEY || env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    return jsonResponse(
      {
        configured: false,
        suggestions: [],
        error: "Gemini API key is not configured. Set GEMINI_API_KEY on the server or Cloudflare Pages project."
      },
      200
    );
  }

  const body = await readBodyWithLimit(request, MAX_REQUEST_BYTES);
  if (body.tooLarge) {
    return jsonResponse({ configured: true, suggestions: [], error: "Request body is too large." }, 413);
  }

  let payload;
  try {
    payload = JSON.parse(body.text);
  } catch {
    return jsonResponse({ configured: true, suggestions: [], error: "Invalid JSON payload." }, 400);
  }

  const photos = Array.isArray(payload?.photos) ? payload.photos.slice(0, MAX_PHOTOS) : [];
  if (photos.some((photo) => typeof photo?.dataBase64 === "string" && photo.dataBase64.length > MAX_PHOTO_BASE64_CHARS)) {
    return jsonResponse({ configured: true, suggestions: [], error: "A photo is too large for the demo endpoint." }, 413);
  }

  const validPhotos = photos.filter(isValidPhoto).map((photo) => ({
    photoId: photo.photoId,
    fileName: photo.fileName.slice(0, MAX_ID_LENGTH),
    mimeType: photo.mimeType.toLowerCase(),
    dataBase64: photo.dataBase64
  }));

  if (validPhotos.length === 0) {
    return jsonResponse({ configured: true, suggestions: [], error: "No valid photos were provided." }, 400);
  }

  const model = typeof env.GEMINI_MODEL === "string" && MODEL_PATTERN.test(env.GEMINI_MODEL) ? env.GEMINI_MODEL : DEFAULT_GEMINI_MODEL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);

  try {
    const geminiPayload = buildGeminiRequest(validPhotos);
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify(geminiPayload),
      signal: controller.signal
    });

    const responseText = await response.text();
    if (!response.ok) {
      // The provider body is never returned or logged; it can echo request details.
      console.error("gemini_provider_error", { providerStatus: response.status });
      return jsonResponse({ configured: true, suggestions: [], error: `Gemini returned ${response.status}.` }, 502);
    }

    const gemini = JSON.parse(responseText);
    const modelText = gemini?.candidates?.[0]?.content?.parts?.map((part) => part.text).filter(Boolean).join("\n") ?? "";
    const parsed = parseModelJson(modelText);
    const suggestions = normalizeSuggestions(parsed?.suggestions, validPhotos);

    return jsonResponse({
      configured: true,
      provider: "gemini",
      model,
      suggestions,
      warnings: normalizeWarnings(parsed?.warnings)
    });
  } catch (error) {
    // Exception messages (including JSON parse errors) can quote provider output, so only the type is kept.
    const timedOut = error instanceof Error && error.name === "AbortError";
    console.error("gemini_request_failed", { errorType: error instanceof Error ? error.name : "unknown" });
    return jsonResponse(
      {
        configured: true,
        suggestions: [],
        error: timedOut ? "Gemini request timed out." : "Gemini photo evidence request failed."
      },
      timedOut ? 504 : 502
    );
  } finally {
    clearTimeout(timeout);
  }
}

function isSameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return false;
  }

  if (origin === url.origin) return true;
  // Behind the Vite dev middleware the request URL is synthetic, so also accept the browser's own Host.
  const host = request.headers.get("host");
  return Boolean(host) && origin === `${url.protocol}//${host}`;
}

function isValidPhoto(photo) {
  return (
    photo !== null &&
    typeof photo === "object" &&
    typeof photo.photoId === "string" &&
    photo.photoId.length > 0 &&
    photo.photoId.length <= MAX_ID_LENGTH &&
    typeof photo.fileName === "string" &&
    typeof photo.mimeType === "string" &&
    SUPPORTED_IMAGE_TYPES.includes(photo.mimeType.toLowerCase()) &&
    typeof photo.dataBase64 === "string" &&
    photo.dataBase64.length > 0 &&
    photo.dataBase64.length % 4 === 0 &&
    BASE64_PATTERN.test(photo.dataBase64)
  );
}

// Content-Length can be absent or wrong (chunked uploads), so the stream itself is counted.
async function readBodyWithLimit(request, limit) {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) return { tooLarge: true };
  if (!request.body) return { text: "" };

  const reader = request.body.getReader();
  const chunks = [];
  let received = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.byteLength;
    if (received > limit) {
      await reader.cancel().catch(() => {});
      return { tooLarge: true };
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { text: "" };
  }
}

function normalizeWarnings(warnings) {
  return Array.isArray(warnings)
    ? warnings.filter((warning) => typeof warning === "string").slice(0, 5).map((warning) => warning.slice(0, 200))
    : [];
}

function buildGeminiRequest(photos) {
  const parts = [
    {
      text: [
        "You are assisting a roofing and solar sales rep with pre-appointment visible-risk triage.",
        "Inspect each roof photo only for visible evidence categories from the allowed tag list.",
        "Do not claim to perform a licensed inspection, engineering review, insurance decision, or permitting decision.",
        "Return one suggestion per photo. If a photo is unclear, use limited-or-unclear-photos.",
        "If no visible issue is apparent, use no-obvious-damage.",
        "Use concise, homeowner-friendly captions. Keep notes factual and cautious.",
        "Return JSON only. Do not wrap the JSON in Markdown.",
        `Allowed observation tags: ${ALLOWED_FLAGS.join(", ")}.`
      ].join("\n")
    }
  ];

  photos.forEach((photo, index) => {
    parts.push({ text: `Photo ${index + 1}: photoId=${photo.photoId}; fileName=${photo.fileName}` });
    parts.push({
      inline_data: {
        mime_type: photo.mimeType,
        data: photo.dataBase64
      }
    });
  });

  return {
    contents: [{ parts }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
      responseJsonSchema: {
        type: "object",
        properties: {
          suggestions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                photoId: { type: "string" },
                caption: { type: "string" },
                observations: {
                  type: "array",
                  items: { type: "string" }
                },
                confidence: { type: "number" },
                notes: {
                  type: "array",
                  items: { type: "string" }
                }
              },
              required: ["photoId", "caption", "observations", "confidence", "notes"]
            }
          },
          warnings: {
            type: "array",
            items: { type: "string" }
          }
        },
        required: ["suggestions"]
      }
    }
  };
}

function parseModelJson(text) {
  if (!text.trim()) return { suggestions: [] };

  for (const candidate of [text, text.match(/\{[\s\S]*\}/)?.[0]]) {
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {
      // Try the next candidate.
    }
  }
  return { suggestions: [] };
}

function normalizeSuggestions(suggestions, photos) {
  const photoIds = new Set(photos.map((photo) => photo.photoId));
  const seen = new Set();

  return (Array.isArray(suggestions) ? suggestions : [])
    .filter((suggestion) => photoIds.has(suggestion?.photoId) && !seen.has(suggestion.photoId))
    .map((suggestion) => {
      seen.add(suggestion.photoId);
      const observations = Array.isArray(suggestion.observations)
        ? suggestion.observations.filter((flag) => ALLOWED_FLAGS.includes(flag))
        : [];

      return {
        photoId: suggestion.photoId,
        caption: typeof suggestion.caption === "string" && suggestion.caption.trim()
          ? suggestion.caption.trim().slice(0, 180)
          : "Roof photo reviewed for visible readiness evidence.",
        observations: observations.length ? Array.from(new Set(observations)) : ["limited-or-unclear-photos"],
        confidence: clampConfidence(suggestion.confidence),
        notes: Array.isArray(suggestion.notes)
          ? suggestion.notes.filter((note) => typeof note === "string").slice(0, 3).map((note) => note.slice(0, 160))
          : []
      };
    });
}

function clampConfidence(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0.45;
  return Math.min(1, Math.max(0, numeric));
}

// No Access-Control-* headers on purpose: the endpoint is same-origin only.
function jsonResponse(payload, status = 200) {
  const headers = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    Vary: "Origin"
  };

  if (status === 204) {
    return new Response(null, { status, headers: { ...headers, Allow: "POST, OPTIONS" } });
  }

  return new Response(JSON.stringify({ ...payload, notice: DEMO_NOTICE }), {
    status,
    headers: { ...headers, "Content-Type": "application/json" }
  });
}
