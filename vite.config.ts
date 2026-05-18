import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { componentTagger } from "lovable-tagger";

const parsedReportsRoot = path.resolve(__dirname, "parsed_reports");
const parsedTxtDir = path.join(parsedReportsRoot, "txt");
const parsedJsonDir = path.join(parsedReportsRoot, "json");

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

function parsedReportsFileApi() {
  return {
    name: "parsed-reports-file-api",
    configureServer(server) {
      server.middlewares.use("/api/parsed-reports", async (req, res, next) => {
        try {
          await fs.mkdir(parsedTxtDir, { recursive: true });
          await fs.mkdir(parsedJsonDir, { recursive: true });

          const method = req.method ?? "GET";
          const url = new URL(req.url ?? "/", "http://localhost");
          const reportIdFromPath = decodeURIComponent(url.pathname.replace(/^\/+/, ""));

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
                  return {
                    ...report,
                    reviewed: report.reviewed ?? false,
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
            const report = JSON.parse(await fs.readFile(jsonPath, "utf8"));
            sendJson(res, 200, { ...report, reviewed: report.reviewed ?? false });
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
            if (existsSync(txtPath) || existsSync(jsonPath)) {
              sendJson(res, 409, { error: `Report ${reportId} already exists.` });
              return;
            }

            const storedAt = new Date().toISOString();
            const jsonPayload = {
              id: reportId,
              textFile: path.relative(__dirname, txtPath).replace(/\\/g, "/"),
              jsonFile: path.relative(__dirname, jsonPath).replace(/\\/g, "/"),
              storedAt,
              reviewed: false,
              text: body.text,
              parseResult: body.parseResult,
            };

            await fs.writeFile(txtPath, body.text, "utf8");
            await fs.writeFile(jsonPath, JSON.stringify(jsonPayload, null, 2), "utf8");
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

            const existing = JSON.parse(await fs.readFile(jsonPath, "utf8"));
            const text = await fs.readFile(txtPath, "utf8");
            const updatedAt = new Date().toISOString();
            const jsonPayload = {
              ...existing,
              id: reportId,
              text,
              updatedAt,
              reviewed: existing.reviewed === true || body.reviewed === true,
              parseResult: body.parseResult,
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
