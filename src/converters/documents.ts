import { marked } from "marked";
import TurndownService from "turndown";
import { jsPDF } from "jspdf";
import { Document, Packer, Paragraph, TextRun } from "docx";
import * as mammoth from "mammoth";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import type { ConverterFn, ConverterModule } from "./types";
import { withExt } from "./types";
import { DEF, TEXT_FORMATS } from "./documents.meta";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

const PNG_MIME = "image/png";
const JPG_MIME = "image/jpeg";

function htmlToText(html: string): string {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el.textContent ?? "";
}

async function mdToHtml(md: string): Promise<string> {
  return marked.parse(md);
}

function htmlToMd(html: string): string {
  return new TurndownService().turndown(html);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function txtToHtml(text: string): string {
  const paragraphs = text.split(/\n{2,}/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`);
  return paragraphs.join("\n");
}

async function toPlainText(text: string, from: string): Promise<string> {
  switch (from) {
    case "txt":
      return text;
    case "html":
      return htmlToText(text);
    case "md":
      return htmlToText(await mdToHtml(text));
    default:
      throw new Error(`Unsupported text source: ${from}`);
  }
}

async function convertText(text: string, from: string, to: string): Promise<string> {
  if (from === to) return text;
  if (to === "html") {
    if (from === "md") return mdToHtml(text);
    if (from === "txt") return txtToHtml(text);
  }
  if (to === "md") {
    if (from === "html") return htmlToMd(text);
    if (from === "txt") return text;
  }
  if (to === "txt") {
    return toPlainText(text, from);
  }
  throw new Error(`Unsupported document conversion: ${from} -> ${to}`);
}

const convertPlainText: ConverterFn = async (job) => {
  const source = await job.file.text();
  const out = await convertText(source, job.from, job.to);
  const def = DEF[job.to];
  const blob = new Blob([out], { type: `${def.mime};charset=utf-8` });
  return { blob, filename: withExt(job.file.name, def.ext) };
};

function buildPdfBlob(text: string): Blob {
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 40;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const usableWidth = pageWidth - margin * 2;
  const lineHeight = 14;
  const linesPerPage = Math.floor((pageHeight - margin * 2) / lineHeight);

  const lines: string[] = pdf.splitTextToSize(text, usableWidth);
  let cursor = 0;
  let first = true;
  while (cursor < lines.length || first) {
    if (!first) pdf.addPage();
    first = false;
    const pageLines = lines.slice(cursor, cursor + linesPerPage);
    pdf.text(pageLines, margin, margin + lineHeight);
    cursor += linesPerPage;
  }
  return pdf.output("blob");
}

const convertToPdf: ConverterFn = async (job) => {
  const source = await job.file.text();
  const text = await toPlainText(source, job.from);
  const blob = buildPdfBlob(text);
  return { blob, filename: withExt(job.file.name, "pdf") };
};

async function buildDocxBlob(text: string): Promise<Blob> {
  const paragraphs = text.split("\n").map((line) => new Paragraph({ children: [new TextRun(line)] }));
  const doc = new Document({ sections: [{ children: paragraphs }] });
  return Packer.toBlob(doc);
}

const convertToDocx: ConverterFn = async (job) => {
  const source = await job.file.text();
  const text = await toPlainText(source, job.from);
  const blob = await buildDocxBlob(text);
  return { blob, filename: withExt(job.file.name, "docx") };
};

async function docxToHtml(file: File): Promise<string> {
  const { value } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  return value;
}

const convertFromDocx: ConverterFn = async (job) => {
  const html = await docxToHtml(job.file);
  let out: string;
  if (job.to === "html") out = html;
  else if (job.to === "md") out = htmlToMd(html);
  else if (job.to === "txt") out = htmlToText(html);
  else throw new Error(`Unsupported DOCX target: ${job.to}`);

  const def = DEF[job.to];
  const blob = new Blob([out], { type: `${def.mime};charset=utf-8` });
  return { blob, filename: withExt(job.file.name, def.ext) };
};

async function loadPdf(file: File) {
  const data = new Uint8Array(await file.arrayBuffer());
  return pdfjsLib.getDocument({ data }).promise;
}

const convertPdfToTxt: ConverterFn = async (job) => {
  const doc = await loadPdf(job.file);
  const pageTexts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item) => ("str" in item ? item.str : "")).join(" ");
    pageTexts.push(pageText);
  }
  const out = pageTexts.join("\n\n");
  const blob = new Blob([out], { type: "text/plain;charset=utf-8" });
  return { blob, filename: withExt(job.file.name, "txt") };
};

function makePdfRasterConverter(to: "png" | "jpg"): ConverterFn {
  const mime = to === "png" ? PNG_MIME : JPG_MIME;
  return async (job) => {
    const doc = await loadPdf(job.file);
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const canvasContext = canvas.getContext("2d");
    if (!canvasContext) throw new Error("Canvas is not supported in this browser.");
    await page.render({ canvasContext, viewport }).promise;

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error(`This browser can't encode ${mime}.`))),
        mime,
        to === "jpg" ? 0.92 : undefined,
      );
    });
    return { blob, filename: withExt(job.file.name, to) };
  };
}

const converters: Record<string, ConverterFn> = {};

for (const from of TEXT_FORMATS) {
  for (const to of TEXT_FORMATS) {
    if (from === to) continue;
    converters[`${from}->${to}`] = convertPlainText;
  }
}

for (const from of TEXT_FORMATS) {
  converters[`${from}->pdf`] = convertToPdf;
  converters[`${from}->docx`] = convertToDocx;
}

for (const to of TEXT_FORMATS) {
  converters[`docx->${to}`] = convertFromDocx;
}

converters["pdf->txt"] = convertPdfToTxt;
converters["pdf->png"] = makePdfRasterConverter("png");
converters["pdf->jpg"] = makePdfRasterConverter("jpg");

export const documents: ConverterModule = {
  formats: Object.values(DEF),
  converters,
};
