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

export async function handleGeminiPhotoEvidenceRequest(request, env = {}) {
  if (request.method === "OPTIONS") {
    return jsonResponse({}, 204);
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
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

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ configured: true, suggestions: [], error: "Invalid JSON payload." }, 400);
  }

  const photos = Array.isArray(payload?.photos) ? payload.photos.slice(0, MAX_PHOTOS) : [];
  const validPhotos = photos.filter(
    (photo) =>
      typeof photo.photoId === "string" &&
      typeof photo.fileName === "string" &&
      typeof photo.mimeType === "string" &&
      typeof photo.dataBase64 === "string" &&
      photo.dataBase64.length > 0
  );

  if (validPhotos.length === 0) {
    return jsonResponse({ configured: true, suggestions: [], error: "No valid photos were provided." }, 400);
  }

  try {
    const model = env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL;
    const geminiPayload = buildGeminiRequest(validPhotos);
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify(geminiPayload)
    });

    const responseText = await response.text();
    if (!response.ok) {
      return jsonResponse(
        {
          configured: true,
          suggestions: [],
          error: `Gemini returned ${response.status}.`,
          details: safelyTruncate(responseText, 700)
        },
        502
      );
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
      warnings: parsed?.warnings ?? []
    });
  } catch (error) {
    return jsonResponse(
      {
        configured: true,
        suggestions: [],
        error: error instanceof Error ? error.message : "Gemini photo evidence request failed."
      },
      500
    );
  }
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

  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : { suggestions: [] };
  }
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

function jsonResponse(payload, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}

function safelyTruncate(value, maxLength) {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}
