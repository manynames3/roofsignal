import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { attachAwsPhotoStorage, consumeAuthSessionFromUrl } from "./awsBackend";
import type { AwsAuthSession } from "./awsBackend";
import type { PhotoEvidence, UploadedPhoto } from "../types/roof";

const session: AwsAuthSession = {
  accessToken: "access-token",
  idToken: "id-token",
  email: "rep@example.com",
  companyId: "acme",
  role: "rep",
  expiresAt: Math.floor(Date.now() / 1000) + 3600
};

const photo: UploadedPhoto = {
  id: "photo-1",
  fileName: "roof.png",
  previewUrl: "blob:http://localhost/photo-1",
  sizeBytes: 10,
  type: "image/png",
  lastModified: 0
};

const evidence: PhotoEvidence[] = [
  { photoId: "photo-1", fileName: "roof.png", caption: "Ridge", observations: [], source: "rep-entered" }
];

const storageKey = "companies/acme/uploads/0123456789abcdef0123456789abcdef/roof.png";
const uploadFields = {
  key: storageKey,
  "Content-Type": "image/png",
  policy: "signed-policy",
  "x-amz-signature": "signature"
};

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("consumeAuthSessionFromUrl", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("does not invent an admin role when account claims are absent", () => {
    const payload = btoa(JSON.stringify({ email: "rep@example.com", exp: session.expiresAt }));
    const token = `header.${payload}.signature`;
    const location = new URL("https://app.example/app");
    location.hash = new URLSearchParams({ access_token: token, id_token: token }).toString();
    const setItem = vi.fn();
    vi.stubGlobal("window", { location, history: { replaceState: vi.fn() } });
    vi.stubGlobal("localStorage", { getItem: vi.fn(), setItem });

    const result = consumeAuthSessionFromUrl();

    expect(result?.role).toBe("");
    expect(result?.companyId).toBe("");
    expect(JSON.parse(setItem.mock.calls[0][1]).role).toBe("");
  });
});

describe("attachAwsPhotoStorage", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const blob = new Blob(["roof-bytes"], { type: "image/png" });

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("VITE_AWS_API_URL", "https://api.example/");
    vi.stubEnv("VITE_AWS_REGION", "us-east-1");
    vi.stubEnv("VITE_AWS_USER_POOL_CLIENT_ID", "client-id");
    vi.stubEnv("VITE_AWS_COGNITO_DOMAIN", "https://auth.example");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function queueUpload(uploadStatus: number) {
    fetchMock
      .mockResolvedValueOnce({ blob: async () => blob } as unknown as Response)
      .mockResolvedValueOnce(
        jsonResponse({ uploadUrl: "https://bucket.s3.amazonaws.com/", uploadFields, storageKey, expiresIn: 900 })
      )
      .mockResolvedValueOnce(new Response(null, { status: uploadStatus }));
  }

  it("uploads with a presigned POST form carrying the policy fields before the file", async () => {
    queueUpload(204);

    const result = await attachAwsPhotoStorage(session, [photo], evidence);

    expect(fetchMock).toHaveBeenCalledTimes(3);

    const [presignUrl, presignInit] = fetchMock.mock.calls[1];
    expect(presignUrl).toBe("https://api.example/photos/presign");
    expect((presignInit?.headers as Record<string, string>).Authorization).toBe("Bearer id-token");
    expect(JSON.parse(String(presignInit?.body))).toEqual({
      fileName: "roof.png",
      contentType: "image/png",
      sizeBytes: blob.size
    });

    const [uploadUrl, uploadInit] = fetchMock.mock.calls[2];
    expect(uploadUrl).toBe("https://bucket.s3.amazonaws.com/");
    expect(uploadInit?.method).toBe("POST");
    // A manual Content-Type would drop the multipart boundary; the browser must set it.
    expect(uploadInit?.headers).toBeUndefined();

    const form = uploadInit?.body;
    expect(form).toBeInstanceOf(FormData);
    const names = Array.from((form as FormData).keys());
    expect(names).toEqual([...Object.keys(uploadFields), "file"]);
    expect((form as FormData).get("Content-Type")).toBe("image/png");
    expect((form as FormData).get("policy")).toBe("signed-policy");
    const file = (form as FormData).get("file") as File;
    expect(file.size).toBe(blob.size);
    expect(file.name).toBe("roof.png");

    expect(result[0].storageKey).toBe(storageKey);
  });

  it("never uses a presigned PUT", async () => {
    queueUpload(204);
    await attachAwsPhotoStorage(session, [photo], evidence);
    expect(fetchMock.mock.calls.map(([, init]) => init?.method)).not.toContain("PUT");
  });

  it("fails without attaching a storage key when S3 rejects the upload", async () => {
    queueUpload(403);
    await expect(attachAwsPhotoStorage(session, [photo], evidence)).rejects.toThrow("Photo upload failed for roof.png.");
  });

  it("skips photos that are not local blobs", async () => {
    const hosted = { ...photo, previewUrl: "https://signed.example/photo.png" };
    const result = await attachAwsPhotoStorage(session, [hosted], evidence);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result[0].storageKey).toBeUndefined();
  });
});
