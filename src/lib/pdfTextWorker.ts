import * as pdfjsLib from "pdfjs-dist";

const MAX_TEXT_ITEMS_PER_PAGE = 50_000;
const MAX_EXTRACTED_CHARS = 200_000;

type WorkerRequest = {
  type: "parse";
  arrayBuffer: ArrayBuffer;
};

type ProgressMessage = {
  type: "progress";
  loaded: number;
  total: number;
};

type ResultMessage = {
  type: "result";
  text: string;
};

type ErrorMessage = {
  type: "error";
  message: string;
};

type WorkerResponse = ProgressMessage | ResultMessage | ErrorMessage;

const post = (message: WorkerResponse) => {
  self.postMessage(message);
};

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  if (event.data.type !== "parse") return;

  const startedAt = performance.now();
  let loadingTask: pdfjsLib.PDFDocumentLoadingTask | null = null;

  try {
    loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(event.data.arrayBuffer),
      disableFontFace: true,
      isOffscreenCanvasSupported: false,
      maxImageSize: 4_000_000,
      stopAtErrors: true,
      useSystemFonts: false,
      useWorkerFetch: false,
    });

    const pdf = await loadingTask.promise;
    const pageTexts: string[] = [];
    let totalChars = 0;

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const pageStartedAt = performance.now();
      post({ type: "progress", loaded: pageNumber - 1, total: pdf.numPages });

      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent({
        includeMarkedContent: false,
      });

      if (content.items.length > MAX_TEXT_ITEMS_PER_PAGE) {
        throw new Error(
          `PDF page ${pageNumber} has ${content.items.length} text items, which is too complex to parse safely.`
        );
      }

      const text = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ");

      totalChars += text.length;
      if (totalChars > MAX_EXTRACTED_CHARS) {
        throw new Error(
          `PDF extracted text is too large (${totalChars.toLocaleString()} characters).`
        );
      }

      pageTexts.push(text);
      page.cleanup();
      post({ type: "progress", loaded: pageNumber, total: pdf.numPages });
      console.debug(
        `[PDFTextWorker] Page ${pageNumber}/${pdf.numPages} parsed in ${Math.round(
          performance.now() - pageStartedAt
        )}ms`
      );
    }

    await pdf.destroy();
    console.debug(
      `[PDFTextWorker] Parsed PDF in ${Math.round(performance.now() - startedAt)}ms`
    );
    post({ type: "result", text: pageTexts.join("\n\n") });
  } catch (err) {
    loadingTask?.destroy();
    post({
      type: "error",
      message: err instanceof Error ? err.message : "Failed to parse PDF.",
    });
  }
};
