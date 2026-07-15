export type Category = "image" | "data" | "document" | "audio" | "video";

export interface FormatDef {
  id: string;
  label: string;
  ext: string;
  mime: string;
  category: Category;
}

export interface ConversionJob {
  file: File;
  from: string;
  to: string;
  onProgress?: (ratio: number) => void;
}

export interface ConversionResult {
  blob: Blob;
  filename: string;
}

export type ConverterFn = (job: ConversionJob) => Promise<ConversionResult>;

export interface ConverterModule {
  formats: FormatDef[];
  /** key is `${from}->${to}` */
  converters: Record<string, ConverterFn>;
}

export function withExt(name: string, ext: string): string {
  const base = name.includes(".") ? name.slice(0, name.lastIndexOf(".")) : name;
  return `${base}.${ext}`;
}
