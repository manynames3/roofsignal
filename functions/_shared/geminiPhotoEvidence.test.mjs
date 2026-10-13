import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleGeminiPhotoEvidenceRequest } from "./geminiPhotoEvidence.mjs";

const ORIGIN = "https://app.example";
const URL_ = `${ORIGIN}/api/photo-evidence-suggestions`;
const ENV = { ENABLE_DEMO_GEMINI: "true", GEMINI_API_KEY: "key-secret-123" };
const encoder = new TextEncoder();

const photo = (overrides = {}) => ({
  photoId: "p1",
  fileName: "roof.jpg",
  mimeType: "image/jpeg",
  dataBase64: "QUJD",
  ...overrides
});

function streamOf(chunks) {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(typeof chunk === "string" ? encoder.encode(chunk) : chunk);
      controller.close();
    }
  });
}

// Plain request-like object: undici's Request rejects forbidden header names such as Host,
// and tests need streaming bodies with no Content-Length.
function makeRequest({ method = "POST", url = URL_, origin = ORIGIN, headers = {}, body } = {}) {
  const requestHeaders = new Headers(headers);
  if (origin !== null) requestHeaders.set("origin", origin);
  return {
    method,
    url,
    headers: requestHeaders,
    body: body === undefined ? null : typeof body === "string" ? streamOf([body]) : body
  };
}

const jsonRequest = (payload, options = {}) => makeRequest({ body: JSON.stringify(payload), ...options });

function geminiSuccess(extra = {}) {
  const text = JSON.stringify({
    suggestions: [
      { photoId: "p1", caption: "Ridge line", observations: ["no-obvious-damage", "not-a-real-flag"], confidence: 2, notes: ["n1"] },
      { photoId: "someone-elses", caption: "ignored", observations: [], confidence: 0.5, notes: [] }
    ],
    warnings: ["check on site"],
    ...extra
  });
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });
}

describe("handleGeminiPhotoEvidenceRequest", () => {
  const fetchMock = vi.fn();
  let errorSpy;

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("fails closed unless ENABLE_DEMO_GEMINI is exactly true", async () => {
    for (const env of [{ GEMINI_API_KEY: "k" }, { ...ENV, ENABLE_DEMO_GEMINI: "1" }, { ...ENV, ENABLE_DEMO_GEMINI: "TRUE" }, { ...ENV, ENABLE_DEMO_GEMINI: "" }]) {
      const response = await handleGeminiPhotoEvidenceRequest(jsonRequest({ photos: [photo()] }), env);
      expect(response.status).toBe(403);
      expect((await response.json()).configured).toBe(false);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects missing, null and cross-origin Origin headers", async () => {
    for (const origin of [null, "null", "https://evil.example", "http://app.example", "https://app.example.evil.example"]) {
      const response = await handleGeminiPhotoEvidenceRequest(jsonRequest({ photos: [photo()] }, { origin }), ENV);
      expect(response.status, String(origin)).toBe(403);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts the same origin and the dev-server Host fallback", async () => {
    fetchMock.mockImplementation(async () => geminiSuccess());

    const same = await handleGeminiPhotoEvidenceRequest(jsonRequest({ photos: [photo()] }), ENV);
    expect(same.status).toBe(200);

    const dev = await handleGeminiPhotoEvidenceRequest(
      jsonRequest({ photos: [photo()] }, { url: "http://127.0.0.1/api/photo-evidence-suggestions", origin: "http://localhost:5173", headers: { host: "localhost:5173" } }),
      ENV
    );
    expect(dev.status).toBe(200);

    const spoofedHost = await handleGeminiPhotoEvidenceRequest(
      jsonRequest({ photos: [photo()] }, { url: "http://127.0.0.1/api/x", origin: "https://evil.example", headers: { host: "localhost:5173" } }),
      ENV
    );
    expect(spoofedHost.status).toBe(403);
  });

  it("never sends CORS allow headers and labels itself as an unauthenticated demo", async () => {
    fetchMock.mockImplementation(async () => geminiSuccess());
    const responses = [
      await handleGeminiPhotoEvidenceRequest(jsonRequest({ photos: [photo()] }), ENV),
      await handleGeminiPhotoEvidenceRequest(jsonRequest({ photos: [photo()] }, { origin: "https://evil.example" }), ENV),
      await handleGeminiPhotoEvidenceRequest(makeRequest({ method: "OPTIONS" }), ENV),
      await handleGeminiPhotoEvidenceRequest(makeRequest({ method: "GET" }), ENV)
    ];
    for (const response of responses) {
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
    }
    const body = await responses[0].json();
    expect(body.notice).toMatch(/no user authentication/i);
    expect(body.notice).toMatch(/AWS backend/);
  });

  it("answers OPTIONS with a 204 that has a null body", async () => {
    const response = await handleGeminiPhotoEvidenceRequest(makeRequest({ method: "OPTIONS" }), {});
    expect(response.status).toBe(204);
    expect(response.body).toBeNull();
    expect(await response.text()).toBe("");
  });

  it("rejects non-POST methods", async () => {
    const response = await handleGeminiPhotoEvidenceRequest(makeRequest({ method: "GET" }), ENV);
    expect(response.status).toBe(405);
  });

  it("reports an unconfigured key only after the origin check passes", async () => {
    const response = await handleGeminiPhotoEvidenceRequest(jsonRequest({ photos: [photo()] }), { ENABLE_DEMO_GEMINI: "true" });
    expect(response.status).toBe(200);
    expect((await response.json()).configured).toBe(false);
  });

  it("rejects an oversized declared Content-Length without calling the provider", async () => {
    const response = await handleGeminiPhotoEvidenceRequest(
      jsonRequest({ photos: [photo()] }, { headers: { "content-length": String(50 * 1024 * 1024) } }),
      ENV
    );
    expect(response.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("bounds the body even when Content-Length is absent or lies, and stops reading early", async () => {
    let pulls = 0;
    const chunk = new Uint8Array(1024 * 1024);
    const endless = new ReadableStream({
      pull(controller) {
        pulls += 1;
        if (pulls > 200) controller.close();
        else controller.enqueue(chunk);
      }
    });

    const response = await handleGeminiPhotoEvidenceRequest(
      makeRequest({ body: endless, headers: { "content-length": "10" } }),
      ENV
    );
    expect(response.status).toBe(413);
    expect(pulls).toBeLessThan(20);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON", async () => {
    const response = await handleGeminiPhotoEvidenceRequest(makeRequest({ body: "{not json" }), ENV);
    expect(response.status).toBe(400);
  });

  it("rejects unsupported image types, malformed base64 and missing photos", async () => {
    const bad = [
      photo({ mimeType: "text/html" }),
      photo({ mimeType: "image/svg+xml" }),
      photo({ dataBase64: "not base64!!" }),
      photo({ dataBase64: "QUJ" }),
      photo({ photoId: "x".repeat(121) }),
      null
    ];
    for (const candidate of bad) {
      const response = await handleGeminiPhotoEvidenceRequest(jsonRequest({ photos: [candidate] }), ENV);
      expect(response.status).toBe(400);
    }
    expect((await handleGeminiPhotoEvidenceRequest(jsonRequest({}), ENV)).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a photo above the base64 cap", async () => {
    const response = await handleGeminiPhotoEvidenceRequest(jsonRequest({ photos: [photo({ dataBase64: "A".repeat(1_500_004) })] }), ENV);
    expect(response.status).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls Gemini with the key in a header, a timeout signal and normalized output", async () => {
    fetchMock.mockImplementation(async () => geminiSuccess());
    const response = await handleGeminiPhotoEvidenceRequest(jsonRequest({ photos: [photo({ mimeType: "IMAGE/JPEG" })] }), {
      ...ENV,
      GEMINI_MODEL: "gemini-test-model"
    });

    expect(response.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-test-model:generateContent");
    expect(url).not.toContain("key-secret-123");
    expect(init.headers["x-goog-api-key"]).toBe("key-secret-123");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(init.body).contents[0].parts[2].inline_data.mime_type).toBe("image/jpeg");

    const body = await response.json();
    expect(body.suggestions).toEqual([
      { photoId: "p1", caption: "Ridge line", observations: ["no-obvious-damage"], confidence: 1, notes: ["n1"] }
    ]);
    expect(body.warnings).toEqual(["check on site"]);
  });

  it("falls back to the default model when GEMINI_MODEL is malformed", async () => {
    fetchMock.mockImplementation(async () => geminiSuccess());
    await handleGeminiPhotoEvidenceRequest(jsonRequest({ photos: [photo()] }), { ...ENV, GEMINI_MODEL: "../other?key=1" });
    expect(fetchMock.mock.calls[0][0]).toContain("/models/gemini-2.5-flash-lite:generateContent");
  });

  it("does not return or log the provider error body", async () => {
    fetchMock.mockImplementation(async () => new Response('{"error":"API key key-secret-123 is invalid for project 42"}', { status: 400 }));
    const response = await handleGeminiPhotoEvidenceRequest(jsonRequest({ photos: [photo()] }), ENV);

    expect(response.status).toBe(502);
    const text = await response.text();
    expect(JSON.parse(text)).toMatchObject({ error: "Gemini returned 400.", suggestions: [] });
    expect(text).not.toContain("key-secret-123");
    expect(text).not.toContain("project 42");
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("key-secret-123");
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("project 42");
  });

  it("does not echo exception text such as JSON parse snippets from the provider", async () => {
    fetchMock.mockImplementation(async () => new Response("<html>secret upstream page key-secret-123</html>", { status: 200 }));
    const response = await handleGeminiPhotoEvidenceRequest(jsonRequest({ photos: [photo()] }), ENV);

    expect(response.status).toBe(502);
    const text = await response.text();
    expect(text).not.toContain("secret upstream page");
    expect(text).not.toContain("key-secret-123");
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("secret upstream page");
  });

  it("aborts the provider call after the timeout", async () => {
    const timers = [];
    vi.spyOn(globalThis, "setTimeout").mockImplementation((callback, delay) => {
      timers.push({ callback, delay });
      return timers.length;
    });
    vi.spyOn(globalThis, "clearTimeout").mockImplementation(() => {});

    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
          timers.find((timer) => timer.delay === 18_000).callback();
        })
    );

    const response = await handleGeminiPhotoEvidenceRequest(jsonRequest({ photos: [photo()] }), ENV);
    expect(timers.some((timer) => timer.delay === 18_000)).toBe(true);
    expect(response.status).toBe(504);
    expect((await response.json()).error).toBe("Gemini request timed out.");
  });
});
