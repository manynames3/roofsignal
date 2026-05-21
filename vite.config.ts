import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { handleGeminiPhotoEvidenceRequest } from "./functions/_shared/geminiPhotoEvidence.mjs";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react(), geminiPhotoEvidenceDevApi(env)],
    test: {
      environment: "node",
      globals: true
    }
  };
});

function geminiPhotoEvidenceDevApi(env: Record<string, string>) {
  return {
    name: "gemini-photo-evidence-dev-api",
    configureServer(server) {
      server.middlewares.use("/api/photo-evidence-suggestions", async (req, res) => {
        if (!req.url) {
          res.statusCode = 400;
          res.end("Missing URL");
          return;
        }

        const body = await readRequestBody(req);
        const request = new Request(`http://127.0.0.1${req.url}`, {
          method: req.method,
          headers: req.headers as HeadersInit,
          body: req.method === "GET" || req.method === "HEAD" ? undefined : body
        });
        const response = await handleGeminiPhotoEvidenceRequest(request, env);

        res.statusCode = response.status;
        response.headers.forEach((value, key) => res.setHeader(key, value));
        res.end(Buffer.from(await response.arrayBuffer()));
      });
    }
  };
}

function readRequestBody(req: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
