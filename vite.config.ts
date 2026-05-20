import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { componentTagger } from "lovable-tagger";

const parsedReportsRoot = path.resolve(__dirname, "parsed_reports");
const parsedTxtDir = path.join(parsedReportsRoot, "txt");
const parsedJsonDir = path.join(parsedReportsRoot, "json");
const originalParsedJsonDir = path.join(parsedReportsRoot, "original_json");

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

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    parsedReportsFileApi(),
    mode === "development" && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
