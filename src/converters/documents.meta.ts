import type { FormatDef } from "./types";

export const DEF: Record<string, FormatDef> = {
  md: { id: "md", label: "Markdown", ext: "md", mime: "text/markdown", category: "document" },
  html: { id: "html", label: "HTML", ext: "html", mime: "text/html", category: "document" },
  txt: { id: "txt", label: "Text", ext: "txt", mime: "text/plain", category: "document" },
  pdf: { id: "pdf", label: "PDF", ext: "pdf", mime: "application/pdf", category: "document" },
  docx: {
    id: "docx",
    label: "DOCX",
    ext: "docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    category: "document",
  },
};

export const TEXT_FORMATS = ["md", "html", "txt"];

export function documentsConverterKeys(): string[] {
  const keys: string[] = [];
  for (const from of TEXT_FORMATS) {
    for (const to of TEXT_FORMATS) {
      if (from !== to) keys.push(`${from}->${to}`);
    }
  }
  for (const from of TEXT_FORMATS) {
    keys.push(`${from}->pdf`);
    keys.push(`${from}->docx`);
  }
  for (const to of TEXT_FORMATS) {
    keys.push(`docx->${to}`);
  }
  keys.push("pdf->txt", "pdf->png", "pdf->jpg");
  return keys;
}
