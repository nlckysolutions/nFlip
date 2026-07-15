import type { ConverterFn, ConverterModule, FormatDef } from "./types";
import { withExt } from "./types";

const DEF: Record<string, FormatDef> = {
  png: { id: "png", label: "PNG", ext: "png", mime: "image/png", category: "image" },
  jpg: { id: "jpg", label: "JPG", ext: "jpg", mime: "image/jpeg", category: "image" },
  webp: { id: "webp", label: "WebP", ext: "webp", mime: "image/webp", category: "image" },
  bmp: { id: "bmp", label: "BMP", ext: "bmp", mime: "image/bmp", category: "image" },
  ico: { id: "ico", label: "ICO", ext: "ico", mime: "image/x-icon", category: "image" },
  svg: { id: "svg", label: "SVG", ext: "svg", mime: "image/svg+xml", category: "image" },
  gif: { id: "gif", label: "GIF", ext: "gif", mime: "image/gif", category: "image" },
};

// Formats we can decode from (browser-native raster/vector decoding).
const INPUT_FORMATS = ["png", "jpg", "webp", "bmp", "gif", "svg"];
// Formats we can actually encode to.
const OUTPUT_FORMATS = ["png", "jpg", "webp", "bmp", "ico", "svg"];

async function loadSource(file: File): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file);
  } catch {
    return loadImageElement(file);
  }
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode this image."));
    };
    img.src = url;
  });
}

function drawToCanvas(source: ImageBitmap | HTMLImageElement): HTMLCanvasElement {
  const w = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
  const h = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
  if (!w || !h) throw new Error("Image has no visible dimensions.");
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not supported in this browser.");
  ctx.drawImage(source as CanvasImageSource, 0, 0, w, h);
  return canvas;
}

function withWhiteBackground(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = canvas.height;
  const ctx = out.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, 0, 0);
  return out;
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error(`This browser can't encode ${mime}.`))),
      mime,
      quality,
    );
  });
}

function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Could not read encoded image data."));
    reader.readAsDataURL(blob);
  });
}

function encodeBMP(imageData: ImageData): Blob {
  const { width, height, data } = imageData;
  const rowSize = Math.floor((24 * width + 31) / 32) * 4;
  const pixelArraySize = rowSize * height;
  const fileSize = 54 + pixelArraySize;
  const buffer = new ArrayBuffer(fileSize);
  const view = new DataView(buffer);

  view.setUint8(0, 0x42);
  view.setUint8(1, 0x4d);
  view.setUint32(2, fileSize, true);
  view.setUint32(6, 0, true);
  view.setUint32(10, 54, true);

  view.setUint32(14, 40, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(30, 0, true);
  view.setUint32(34, pixelArraySize, true);
  view.setInt32(38, 2835, true);
  view.setInt32(42, 2835, true);
  view.setUint32(46, 0, true);
  view.setUint32(50, 0, true);

  let offset = 54;
  for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      view.setUint8(offset++, data[i + 2]);
      view.setUint8(offset++, data[i + 1]);
      view.setUint8(offset++, data[i]);
    }
    for (let p = 0; p < rowSize - width * 3; p++) view.setUint8(offset++, 0);
  }
  return new Blob([buffer], { type: "image/bmp" });
}

async function encodeICO(canvas: HTMLCanvasElement): Promise<Blob> {
  const size = Math.min(256, Math.max(canvas.width, canvas.height));
  const square = document.createElement("canvas");
  square.width = size;
  square.height = size;
  const ctx = square.getContext("2d")!;
  const scale = Math.min(size / canvas.width, size / canvas.height, 1) || 1;
  const dw = canvas.width * scale;
  const dh = canvas.height * scale;
  ctx.drawImage(canvas, (size - dw) / 2, (size - dh) / 2, dw, dh);

  const pngBlob = await canvasToBlob(square, "image/png");
  const pngBytes = new Uint8Array(await pngBlob.arrayBuffer());

  const headerSize = 6 + 16;
  const buffer = new ArrayBuffer(headerSize + pngBytes.length);
  const view = new DataView(buffer);
  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  view.setUint16(4, 1, true);

  const dir = 6;
  const dim = size >= 256 ? 0 : size;
  view.setUint8(dir, dim);
  view.setUint8(dir + 1, dim);
  view.setUint8(dir + 2, 0);
  view.setUint8(dir + 3, 0);
  view.setUint16(dir + 4, 1, true);
  view.setUint16(dir + 6, 32, true);
  view.setUint32(dir + 8, pngBytes.length, true);
  view.setUint32(dir + 12, headerSize, true);

  new Uint8Array(buffer, headerSize).set(pngBytes);
  return new Blob([buffer], { type: "image/x-icon" });
}

async function encodeSVGWrap(canvas: HTMLCanvasElement): Promise<Blob> {
  const pngBlob = await canvasToBlob(canvas, "image/png");
  const dataUrl = await blobToDataURL(pngBlob);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}" ` +
    `viewBox="0 0 ${canvas.width} ${canvas.height}"><image width="${canvas.width}" height="${canvas.height}" href="${dataUrl}"/></svg>`;
  return new Blob([svg], { type: "image/svg+xml" });
}

async function encodeImagePDF(canvas: HTMLCanvasElement): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const orientation = canvas.width >= canvas.height ? "l" : "p";
  const pdf = new jsPDF({ orientation, unit: "px", format: [canvas.width, canvas.height] });
  const dataUrl = canvas.toDataURL("image/jpeg", 0.95);
  pdf.addImage(dataUrl, "JPEG", 0, 0, canvas.width, canvas.height);
  return pdf.output("blob");
}

async function convertImage(file: File, to: string): Promise<Blob> {
  const source = await loadSource(file);
  const canvas = drawToCanvas(source);

  switch (to) {
    case "png":
      return canvasToBlob(canvas, "image/png");
    case "jpg":
      return canvasToBlob(withWhiteBackground(canvas), "image/jpeg", 0.92);
    case "webp":
      return canvasToBlob(canvas, "image/webp", 0.92);
    case "bmp": {
      const ctx = withWhiteBackground(canvas).getContext("2d")!;
      return encodeBMP(ctx.getImageData(0, 0, canvas.width, canvas.height));
    }
    case "ico":
      return encodeICO(canvas);
    case "svg":
      return encodeSVGWrap(canvas);
    case "pdf":
      return encodeImagePDF(withWhiteBackground(canvas));
    default:
      throw new Error(`Unsupported image target: ${to}`);
  }
}

function makeConverter(to: string): ConverterFn {
  return async (job) => {
    const blob = await convertImage(job.file, to);
    const ext = to === "pdf" ? "pdf" : DEF[to].ext;
    return { blob, filename: withExt(job.file.name, ext) };
  };
}

const converters: Record<string, ConverterFn> = {};
for (const from of INPUT_FORMATS) {
  for (const to of [...OUTPUT_FORMATS, "pdf"]) {
    if (from === to) continue;
    converters[`${from}->${to}`] = makeConverter(to);
  }
}

export const images: ConverterModule = {
  formats: Object.values(DEF),
  converters,
};
