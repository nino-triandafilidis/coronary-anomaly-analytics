import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { componentTagger } from "lovable-tagger";
import { CTA_PARSER_PROMPT } from "./src/lib/prompts/paperParser.prompt";

const parsedReportsRoot = path.resolve(__dirname, "parsed_reports");
const parsedTxtDir = path.join(parsedReportsRoot, "txt");
const parsedJsonDir = path.join(parsedReportsRoot, "json");
const originalParsedJsonDir = path.join(parsedReportsRoot, "original_json");
const compareJsonDir = path.join(parsedReportsRoot, "compare_json");
const uploadedReportsDir = path.join(parsedReportsRoot, "uploads");
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const COMPARE_MODEL_NAME = "gpt-5.4";
const COMPARE_MAX_OUTPUT_TOKENS = 8192;

function sendJson(res: { statusCode: number; setHeader: (name: string, value: string) => void; end: (body?: string) => void }, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function getRequestBody(req: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function sanitizeReportId(id: unknown): string | null {
  if (typeof id !== "string") return null;
  return /^[a-zA-Z0-9._-]+$/.test(id) ? id : null;
}

function sanitizeFileName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^_+/, "");
  return cleaned || null;
}

function stripJsonFence(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractResponseText(response: unknown): string {
  if (
    response &&
    typeof response === "object" &&
    "output_text" in response &&
    typeof response.output_text === "string"
  ) {
    return response.output_text;
  }

  const output = response && typeof response === "object" && "output" in response
    ? (response as { output?: unknown }).output
    : undefined;
  if (!Array.isArray(output)) return "";

  const textParts: string[] = [];
  output.forEach((item) => {
    if (!item || typeof item !== "object") return;
    const content = "content" in item ? (item as { content?: unknown }).content : undefined;
    if (!Array.isArray(content)) return;
    content.forEach((part) => {
      if (!part || typeof part !== "object") return;
      if ("text" in part && typeof part.text === "string") textParts.push(part.text);
    });
  });

  return textParts.join("\n");
}

async function queryPaperParser(reportText: string, apiKey: string): Promise<unknown> {
  const prompt = CTA_PARSER_PROMPT.replace("{{REPORT_TEXT}}", reportText);
  const rawResponse = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: COMPARE_MODEL_NAME,
      input: prompt,
      max_output_tokens: COMPARE_MAX_OUTPUT_TOKENS,
    }),
  });

  const response = await rawResponse.json();
  if (!rawResponse.ok) {
    const message =
      response && typeof response === "object" && "error" in response
        ? (response as { error?: { message?: string } }).error?.message
        : rawResponse.statusText;
    throw new Error(message ?? "OpenAI comparison parse failed.");
  }

  const outputText = stripJsonFence(extractResponseText(response));
  if (!outputText) {
    throw new Error("OpenAI comparison parse returned no text output.");
  }

  return JSON.parse(outputText);
}

function buildStoredReportPayload(
  reportId: string,
  text: string,
  parseResult: unknown,
  storedAt: string,
  reviewed: boolean,
  updatedAt?: string,
  reviewDecisions: unknown[] = []
) {
  const txtPath = path.join(parsedTxtDir, `${reportId}.txt`);
  const jsonPath = path.join(parsedJsonDir, `${reportId}.json`);
  const originalJsonPath = path.join(originalParsedJsonDir, `${reportId}.json`);

  return {
    id: reportId,
    textFile: path.relative(__dirname, txtPath).replace(/\\/g, "/"),
    jsonFile: path.relative(__dirname, jsonPath).replace(/\\/g, "/"),
    originalJsonFile: path.relative(__dirname, originalJsonPath).replace(/\\/g, "/"),
    storedAt,
    ...(updatedAt ? { updatedAt } : {}),
    reviewed,
    text,
    parseResult,
    reviewDecisions,
  };
}

function parsedReportsFileApi() {
  return {
    name: "parsed-reports-file-api",
    configureServer(server) {
      server.middlewares.use("/api/parsed-reports", async (req, res, next) => {
        try {
          await fs.mkdir(parsedTxtDir, { recursive: true });
          await fs.mkdir(parsedJsonDir, { recursive: true });
          await fs.mkdir(originalParsedJsonDir, { recursive: true });

          const method = req.method ?? "GET";
          const url = new URL(req.url ?? "/", "http://localhost");
          const pathParts = url.pathname.replace(/^\/+/, "").split("/").filter(Boolean);
          const reportIdFromPath = pathParts[0] ? decodeURIComponent(pathParts[0]) : "";
          const actionFromPath = pathParts[1] ? decodeURIComponent(pathParts[1]) : "";

          if (method === "GET" && !reportIdFromPath) {
            const files = await fs.readdir(parsedJsonDir);
            const reports = await Promise.all(
              files
                .filter((file) => file.endsWith(".json"))
                .map(async (file) => {
                  const fullPath = path.join(parsedJsonDir, file);
                  const raw = await fs.readFile(fullPath, "utf8");
                  const report = JSON.parse(raw);
                  const stat = await fs.stat(fullPath);
                  const reportId = sanitizeReportId(report.id) ?? file.replace(/\.json$/, "");
                  const originalJsonPath = path.join(originalParsedJsonDir, `${reportId}.json`);
                  if (!existsSync(originalJsonPath)) {
                    await fs.writeFile(originalJsonPath, raw, "utf8");
                  }
                  return {
                    ...report,
                    originalJsonFile:
                      report.originalJsonFile ??
                      path.relative(__dirname, originalJsonPath).replace(/\\/g, "/"),
                    reviewed: report.reviewed ?? false,
                    reviewDecisions: report.reviewDecisions ?? [],
                    storedAt: report.storedAt ?? stat.mtime.toISOString(),
                  };
                })
            );
            reports.sort((a, b) => String(b.storedAt).localeCompare(String(a.storedAt)));
            sendJson(res, 200, { reports });
            return;
          }

          if (method === "GET" && reportIdFromPath) {
            const reportId = sanitizeReportId(reportIdFromPath);
            if (!reportId) {
              sendJson(res, 400, { error: "Invalid report id." });
              return;
            }
            const jsonPath = path.join(parsedJsonDir, `${reportId}.json`);
            if (!existsSync(jsonPath)) {
              sendJson(res, 404, { error: "Report not found." });
              return;
            }
            const raw = await fs.readFile(jsonPath, "utf8");
            const originalJsonPath = path.join(originalParsedJsonDir, `${reportId}.json`);
            if (!existsSync(originalJsonPath)) {
              await fs.writeFile(originalJsonPath, raw, "utf8");
            }
            const report = JSON.parse(raw);
            sendJson(res, 200, {
              ...report,
              originalJsonFile:
                report.originalJsonFile ??
                path.relative(__dirname, originalJsonPath).replace(/\\/g, "/"),
              reviewed: report.reviewed ?? false,
              reviewDecisions: report.reviewDecisions ?? [],
            });
            return;
          }

          if (method === "POST" && reportIdFromPath && actionFromPath === "restore") {
            const reportId = sanitizeReportId(reportIdFromPath);
            if (!reportId) {
              sendJson(res, 400, { error: "Invalid report id." });
              return;
            }

            const jsonPath = path.join(parsedJsonDir, `${reportId}.json`);
            const originalJsonPath = path.join(originalParsedJsonDir, `${reportId}.json`);
            const txtPath = path.join(parsedTxtDir, `${reportId}.txt`);
            if (!existsSync(jsonPath) || !existsSync(originalJsonPath) || !existsSync(txtPath)) {
              sendJson(res, 404, { error: "Report or original parsed JSON not found." });
              return;
            }

            const existing = JSON.parse(await fs.readFile(jsonPath, "utf8"));
            const original = JSON.parse(await fs.readFile(originalJsonPath, "utf8"));
            const text = await fs.readFile(txtPath, "utf8");
            const updatedAt = new Date().toISOString();
            const restoredPayload = buildStoredReportPayload(
              reportId,
              text,
              original.parseResult,
              existing.storedAt ?? original.storedAt ?? updatedAt,
              false,
              updatedAt,
              []
            );

            await fs.writeFile(jsonPath, JSON.stringify(restoredPayload, null, 2), "utf8");
            sendJson(res, 200, restoredPayload);
            return;
          }

          if (method === "POST") {
            const body = JSON.parse(await getRequestBody(req));
            const reportId = sanitizeReportId(body.reportId);
            if (!reportId || typeof body.text !== "string" || typeof body.parseResult !== "object") {
              sendJson(res, 400, { error: "Expected reportId, text, and parseResult." });
              return;
            }

            const txtPath = path.join(parsedTxtDir, `${reportId}.txt`);
            const jsonPath = path.join(parsedJsonDir, `${reportId}.json`);
            const originalJsonPath = path.join(originalParsedJsonDir, `${reportId}.json`);
            if (existsSync(txtPath) || existsSync(jsonPath) || existsSync(originalJsonPath)) {
              sendJson(res, 409, { error: `Report ${reportId} already exists.` });
              return;
            }

            const storedAt = new Date().toISOString();
            const jsonPayload = buildStoredReportPayload(
              reportId,
              body.text,
              body.parseResult,
              storedAt,
              false
            );

            await fs.writeFile(txtPath, body.text, "utf8");
            await fs.writeFile(jsonPath, JSON.stringify(jsonPayload, null, 2), "utf8");
            await fs.writeFile(originalJsonPath, JSON.stringify(jsonPayload, null, 2), "utf8");
            sendJson(res, 201, jsonPayload);
            return;
          }

          if (method === "PUT" && reportIdFromPath) {
            const reportId = sanitizeReportId(reportIdFromPath);
            if (!reportId) {
              sendJson(res, 400, { error: "Invalid report id." });
              return;
            }

            const jsonPath = path.join(parsedJsonDir, `${reportId}.json`);
            const txtPath = path.join(parsedTxtDir, `${reportId}.txt`);
            if (!existsSync(jsonPath) || !existsSync(txtPath)) {
              sendJson(res, 404, { error: "Report not found." });
              return;
            }

            const body = JSON.parse(await getRequestBody(req));
            if (typeof body.parseResult !== "object") {
              sendJson(res, 400, { error: "Expected parseResult." });
              return;
            }
            if (
              "reviewDecisions" in body &&
              body.reviewDecisions !== undefined &&
              !Array.isArray(body.reviewDecisions)
            ) {
              sendJson(res, 400, { error: "Expected reviewDecisions to be an array." });
              return;
            }

            const existing = JSON.parse(await fs.readFile(jsonPath, "utf8"));
            const text = await fs.readFile(txtPath, "utf8");
            const updatedAt = new Date().toISOString();
            const originalJsonPath = path.join(originalParsedJsonDir, `${reportId}.json`);
            if (!existsSync(originalJsonPath)) {
              await fs.writeFile(originalJsonPath, JSON.stringify(existing, null, 2), "utf8");
            }
            const jsonPayload = {
              ...buildStoredReportPayload(
                reportId,
                text,
                body.parseResult,
                existing.storedAt ?? updatedAt,
                existing.reviewed === true || body.reviewed === true,
                updatedAt,
                Array.isArray(body.reviewDecisions)
                  ? body.reviewDecisions
                  : existing.reviewDecisions ?? []
              ),
              ...("originalJsonFile" in existing ? { originalJsonFile: existing.originalJsonFile } : {}),
            };

            await fs.writeFile(jsonPath, JSON.stringify(jsonPayload, null, 2), "utf8");
            sendJson(res, 200, jsonPayload);
            return;
          }

          if (method === "DELETE" && reportIdFromPath) {
            const reportId = sanitizeReportId(reportIdFromPath);
            if (!reportId) {
              sendJson(res, 400, { error: "Invalid report id." });
              return;
            }
            await Promise.allSettled([
              fs.unlink(path.join(parsedTxtDir, `${reportId}.txt`)),
              fs.unlink(path.join(parsedJsonDir, `${reportId}.json`)),
              fs.unlink(path.join(originalParsedJsonDir, `${reportId}.json`)),
            ]);
            sendJson(res, 200, { ok: true });
            return;
          }

          next();
        } catch (err) {
          sendJson(res, 500, {
            error: err instanceof Error ? err.message : "Parsed report file API failed.",
          });
        }
      });
    },
  };
}

function uploadedReportsFileApi() {
  return {
    name: "uploaded-reports-file-api",
    configureServer(server) {
      server.middlewares.use("/api/uploaded-reports", async (req, res, next) => {
        try {
          await fs.mkdir(uploadedReportsDir, { recursive: true });

          const method = req.method ?? "GET";
          if (method !== "POST") {
            next();
            return;
          }

          const body = JSON.parse(await getRequestBody(req));
          const uploadId = sanitizeReportId(body.uploadId);
          const fileName = sanitizeFileName(body.fileName);
          const dataBase64 = typeof body.dataBase64 === "string" ? body.dataBase64 : "";

          if (!uploadId || !fileName || !dataBase64) {
            sendJson(res, 400, {
              error: "Expected uploadId, fileName, and dataBase64.",
            });
            return;
          }

          const ext = path.extname(fileName);
          const base = path.basename(fileName, ext);
          const storedName = `${uploadId}-${base}${ext}`;
          const storedPath = path.join(uploadedReportsDir, storedName);

          await fs.writeFile(storedPath, Buffer.from(dataBase64, "base64"));

          sendJson(res, 201, {
            uploadId,
            fileName,
            storedFile: path.relative(__dirname, storedPath).replace(/\\/g, "/"),
            storedAt: new Date().toISOString(),
          });
        } catch (err) {
          sendJson(res, 500, {
            error: err instanceof Error ? err.message : "Uploaded report file API failed.",
          });
        }
      });
    },
  };
}

function compareReportsFileApi(apiKey: string | undefined) {
  return {
    name: "compare-reports-file-api",
    configureServer(server) {
      server.middlewares.use("/api/compare-reports", async (req, res, next) => {
        try {
          await fs.mkdir(parsedTxtDir, { recursive: true });
          await fs.mkdir(compareJsonDir, { recursive: true });

          const method = req.method ?? "GET";
          const url = new URL(req.url ?? "/", "http://localhost");
          const pathParts = url.pathname.replace(/^\/+/, "").split("/").filter(Boolean);
          const actionFromPath = pathParts[0] ? decodeURIComponent(pathParts[0]) : "";

          if (method === "GET" && !actionFromPath) {
            const files = await fs.readdir(compareJsonDir);
            const reports = await Promise.all(
              files
                .filter((file) => file.endsWith(".json"))
                .map(async (file) => {
                  const fullPath = path.join(compareJsonDir, file);
                  const raw = await fs.readFile(fullPath, "utf8");
                  const stat = await fs.stat(fullPath);
                  return {
                    id: file.replace(/\.json$/, ""),
                    jsonFile: path.relative(__dirname, fullPath).replace(/\\/g, "/"),
                    parsedAt: stat.mtime.toISOString(),
                    result: JSON.parse(raw),
                  };
                })
            );
            reports.sort((a, b) => a.id.localeCompare(b.id));
            sendJson(res, 200, { reports });
            return;
          }

          if (method === "POST" && actionFromPath === "run") {
            if (!apiKey) {
              sendJson(res, 400, {
                error: "VITE_OPENAI_API_KEY is not set. Add it to .env before running comparison.",
              });
              return;
            }

            const files = (await fs.readdir(parsedTxtDir)).filter((file) => file.endsWith(".txt"));
            const results: Array<{ id: string; status: "saved" | "failed"; error?: string }> = [];

            for (const file of files) {
              const id = file.replace(/\.txt$/, "");
              if (!sanitizeReportId(id)) {
                results.push({ id, status: "failed", error: "Invalid report id." });
                continue;
              }

              try {
                const text = await fs.readFile(path.join(parsedTxtDir, file), "utf8");
                const parsed = await queryPaperParser(text, apiKey);
                await fs.writeFile(
                  path.join(compareJsonDir, `${id}.json`),
                  JSON.stringify(parsed, null, 2),
                  "utf8"
                );
                results.push({ id, status: "saved" });
              } catch (err) {
                results.push({
                  id,
                  status: "failed",
                  error: err instanceof Error ? err.message : "Unknown comparison parse error.",
                });
              }
            }

            sendJson(res, 200, {
              total: files.length,
              saved: results.filter((item) => item.status === "saved").length,
              failed: results.filter((item) => item.status === "failed").length,
              results,
            });
            return;
          }

          next();
        } catch (err) {
          sendJson(res, 500, {
            error: err instanceof Error ? err.message : "Compare report file API failed.",
          });
        }
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
    },
    plugins: [
      react(),
      uploadedReportsFileApi(),
      parsedReportsFileApi(),
      compareReportsFileApi(env.VITE_OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY),
      mode === "development" && componentTagger(),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
