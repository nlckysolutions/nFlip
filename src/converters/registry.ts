import type { ConversionJob, ConversionResult, ConverterModule, FormatDef } from "./types";
import { images } from "./images";
import { data } from "./data";
import * as mediaMeta from "./media.meta";
import * as documentsMeta from "./documents.meta";

export const formats: FormatDef[] = [
  ...images.formats,
  ...data.formats,
  ...Object.values(mediaMeta.DEF),
  ...Object.values(documentsMeta.DEF),
];
export const formatMap = new Map(formats.map((f) => [f.id, f]));

const eagerKeys = new Set([...Object.keys(images.converters), ...Object.keys(data.converters)]);
const mediaKeys = new Set(mediaMeta.mediaConverterKeys());
const documentsKeys = new Set(documentsMeta.documentsConverterKeys());

const EXT_ALIASES: Record<string, string> = {
  jpeg: "jpg",
  yml: "yaml",
  htm: "html",
  markdown: "md",
};

export function detectFormat(file: File): FormatDef | null {
  const raw = file.name.split(".").pop()?.toLowerCase();
  if (!raw) return null;
  const ext = EXT_ALIASES[raw] ?? raw;
  return formatMap.get(ext) ?? null;
}

export function getTargets(from: string): FormatDef[] {
  const out: FormatDef[] = [];
  for (const key of eagerKeys) {
    if (key.startsWith(`${from}->`)) {
      const def = formatMap.get(key.slice(from.length + 2));
      if (def) out.push(def);
    }
  }
  for (const key of mediaKeys) {
    if (key.startsWith(`${from}->`)) {
      const def = formatMap.get(key.slice(from.length + 2));
      if (def) out.push(def);
    }
  }
  for (const key of documentsKeys) {
    if (key.startsWith(`${from}->`)) {
      const def = formatMap.get(key.slice(from.length + 2));
      if (def) out.push(def);
    }
  }
  return out;
}

export function hasConverter(from: string, to: string): boolean {
  const key = `${from}->${to}`;
  return eagerKeys.has(key) || mediaKeys.has(key) || documentsKeys.has(key);
}

let mediaModule: ConverterModule | null = null;
let documentsModule: ConverterModule | null = null;

export async function convertFile(job: ConversionJob): Promise<ConversionResult> {
  const key = `${job.from}->${job.to}`;

  if (key in images.converters) return images.converters[key](job);
  if (key in data.converters) return data.converters[key](job);

  if (mediaKeys.has(key)) {
    mediaModule ??= (await import("./media")).media;
    return mediaModule.converters[key](job);
  }

  if (documentsKeys.has(key)) {
    documentsModule ??= (await import("./documents")).documents;
    return documentsModule.converters[key](job);
  }

  throw new Error(`No converter registered for ${job.from} -> ${job.to}`);
}
