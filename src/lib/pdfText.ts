type PdfTextItem = {
  str: string;
  hasEOL?: boolean;
};

function isPdfTextItem(item: unknown): item is PdfTextItem {
  return (
    typeof item === "object" &&
    item !== null &&
    "str" in item &&
    typeof item.str === "string"
  );
}

export function joinPdfTextItems(items: readonly unknown[]): string {
  let text = "";

  for (const item of items) {
    if (!isPdfTextItem(item)) continue;
    text += item.str;
    text += item.hasEOL ? "\n" : " ";
  }

  return text.trimEnd();
}
