import "./style.css";
import { convertFile, detectFormat, getTargets } from "./converters/registry";
import type { FormatDef } from "./converters/types";
import { formatFileSize, wait } from "./utils/format";
import {
  ICON_ALERT,
  ICON_ARROW_LEFT,
  ICON_ARROW_RIGHT,
  ICON_CHECK,
  ICON_CLOSE,
  ICON_DOWNLOAD,
  ICON_REFRESH,
} from "./utils/icons";

const flipCard = document.getElementById("flipCard") as HTMLElement;
const frontFace = document.getElementById("frontFace") as HTMLElement;
const backContent = document.getElementById("backContent") as HTMLElement;

type Stage = "idle" | "picking" | "converting" | "done" | "error";

let stage: Stage = "idle";
let currentFile: File | null = null;
let currentFormat: FormatDef | null = null;
let resultBlob: Blob | null = null;
let resultFilename = "";

function badgeLabel(ext: string): string {
  return ext.slice(0, 4).toUpperCase();
}

function engineLabel(from: FormatDef, to: FormatDef): string {
  if (from.category === "audio" || from.category === "video" || to.category === "audio" || to.category === "video") {
    return "Transcoding locally with ffmpeg.wasm";
  }
  if (from.category === "image" || to.category === "image") {
    return "Redrawing locally with the Canvas API";
  }
  if (from.category === "document" || to.category === "document") {
    return "Rendering locally in your browser";
  }
  return "Converting locally in your browser";
}

function sortTargets(source: FormatDef, targets: FormatDef[]): FormatDef[] {
  return targets.slice().sort((a, b) => {
    const ap = a.category === source.category ? 0 : 1;
    const bp = b.category === source.category ? 0 : 1;
    if (ap !== bp) return ap - bp;
    return a.label.localeCompare(b.label);
  });
}

function renderDropzone() {
  stage = "idle";
  currentFile = null;
  currentFormat = null;
  resultBlob = null;
  flipCard.classList.add("is-idle");
  frontFace.innerHTML = `
    <div class="dropzone" id="dropzone">
      <input type="file" id="fileInput" aria-label="Choose a file to convert" />
      <div class="dropzone-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M7 18a4 4 0 0 1-.6-7.96A5 5 0 0 1 16.9 8.2 4.5 4.5 0 0 1 16.5 18H7Z" />
          <path d="M12 12v6" />
          <path d="m9.5 14.5 2.5-2.5 2.5 2.5" />
        </svg>
      </div>
      <p class="dropzone-title">Drop a file here</p>
      <p class="dropzone-sub"><span class="browse">Browse</span> from your device instead</p>
    </div>
  `;
  const input = document.getElementById("fileInput") as HTMLInputElement;
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (file) handleFile(file);
  });
}

function renderPicker(file: File) {
  stage = "picking";
  flipCard.classList.remove("is-idle");
  currentFile = file;
  const format = detectFormat(file);
  currentFormat = format;
  const targets = format ? sortTargets(format, getTargets(format.id)) : [];

  const chipsHtml = targets.length
    ? `<div class="format-grid" id="formatGrid">${targets
        .map(
          (t, i) =>
            `<button type="button" class="format-chip" style="--i:${i}" data-format="${t.id}">${t.label}</button>`,
        )
        .join("")}</div>`
    : `<p class="picker-empty">${
        format
          ? `nFlip can't convert .${format.ext} files yet — support for new targets is on the way.`
          : `nFlip doesn't recognize this file type yet. Try an image, audio/video, document, or data file.`
      }</p>`;

  frontFace.innerHTML = `
    <div class="picker">
      <div class="file-summary">
        <div class="file-summary-icon">${format ? badgeLabel(format.ext) : "?"}</div>
        <div class="file-summary-meta">
          <div class="file-summary-name"></div>
          <div class="file-summary-size"></div>
        </div>
        <button type="button" class="file-summary-reset" id="resetBtn" aria-label="Choose a different file">${ICON_CLOSE}</button>
      </div>
      ${targets.length ? '<div class="picker-label">Flip into</div>' : ""}
      ${chipsHtml}
    </div>
  `;

  frontFace.querySelector<HTMLElement>(".file-summary-name")!.textContent = file.name;
  frontFace.querySelector<HTMLElement>(".file-summary-size")!.textContent = formatFileSize(file.size);

  document.getElementById("resetBtn")!.addEventListener("click", () => {
    flipCard.classList.remove("is-flipped");
    renderDropzone();
  });

  const grid = document.getElementById("formatGrid");
  if (grid) {
    grid.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".format-chip");
      if (!btn || !currentFile || !currentFormat) return;
      const target = targets.find((t) => t.id === btn.dataset.format);
      if (target) startConversion(currentFile, currentFormat, target);
    });
  }
}

function renderConverting(from: FormatDef, to: FormatDef) {
  backContent.innerHTML = `
    <div class="flip-run">
      <div class="flip-run-icon">${badgeLabel(from.ext)}</div>
      <div class="flip-run-arrow">${ICON_ARROW_RIGHT}</div>
      <div class="flip-run-icon is-target">${badgeLabel(to.ext)}</div>
    </div>
    <div class="status-title">Converting…</div>
    <div class="status-sub">${engineLabel(from, to)}</div>
    <div class="progress-track"><div class="progress-fill is-indeterminate" id="progressFill"></div></div>
  `;
}

function updateProgress(ratio: number) {
  const fill = backContent.querySelector<HTMLElement>("#progressFill");
  if (!fill) return;
  if (ratio <= 0) return;
  fill.classList.remove("is-indeterminate");
  fill.style.width = `${Math.min(100, Math.round(ratio * 100))}%`;
}

function renderDone(from: FormatDef, to: FormatDef, originalSize: number) {
  stage = "done";
  backContent.innerHTML = `
    <div class="flip-run">
      <div class="flip-run-icon">${badgeLabel(from.ext)}</div>
      <div class="flip-run-arrow">${ICON_ARROW_RIGHT}</div>
      <div class="flip-run-icon is-target">${badgeLabel(to.ext)}</div>
    </div>
    <div class="success-check">${ICON_CHECK}</div>
    <div class="status-title">Converted</div>
    <div class="result-meta"></div>
    <div class="back-actions">
      <button type="button" class="btn btn-primary" id="downloadBtn">${ICON_DOWNLOAD}Download ${to.label}</button>
      <button type="button" class="btn btn-ghost" id="againBtn">${ICON_REFRESH}Convert another</button>
    </div>
  `;
  backContent.querySelector<HTMLElement>(".result-meta")!.textContent = resultBlob
    ? `${formatFileSize(originalSize)} → ${formatFileSize(resultBlob.size)}`
    : "";

  document.getElementById("downloadBtn")!.addEventListener("click", () => {
    if (!resultBlob) return;
    const url = URL.createObjectURL(resultBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = resultFilename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  document.getElementById("againBtn")!.addEventListener("click", () => {
    flipCard.classList.remove("is-flipped");
    setTimeout(renderDropzone, 350);
  });
}

function renderError(message: string) {
  stage = "error";
  backContent.innerHTML = `
    <div class="error-icon">${ICON_ALERT}</div>
    <div class="status-title">Conversion failed</div>
    <div class="result-meta"></div>
    <div class="back-actions">
      <button type="button" class="btn btn-ghost" id="backBtn">${ICON_ARROW_LEFT}Back</button>
    </div>
  `;
  backContent.querySelector<HTMLElement>(".result-meta")!.textContent = message;

  document.getElementById("backBtn")!.addEventListener("click", () => {
    flipCard.classList.remove("is-flipped");
    if (currentFile) setTimeout(() => renderPicker(currentFile!), 350);
  });
}

async function startConversion(file: File, from: FormatDef, to: FormatDef) {
  stage = "converting";
  flipCard.classList.add("is-flipped");
  renderConverting(from, to);

  try {
    const [result] = await Promise.all([
      convertFile({
        file,
        from: from.id,
        to: to.id,
        onProgress: updateProgress,
      }),
      wait(450),
    ]);
    resultBlob = result.blob;
    resultFilename = result.filename;
    renderDone(from, to, file.size);
  } catch (err) {
    renderError(err instanceof Error ? err.message : "Something went wrong during conversion.");
  }
}

function handleFile(file: File) {
  flipCard.classList.remove("is-flipped");
  renderPicker(file);
}

flipCard.addEventListener("dragover", (e) => {
  e.preventDefault();
  if (stage === "converting") return;
  flipCard.classList.add("is-dragging");
});

flipCard.addEventListener("dragleave", (e) => {
  if (e.target === flipCard || !flipCard.contains(e.relatedTarget as Node | null)) {
    flipCard.classList.remove("is-dragging");
  }
});

flipCard.addEventListener("drop", (e) => {
  e.preventDefault();
  flipCard.classList.remove("is-dragging");
  if (stage === "converting") return;
  const file = e.dataTransfer?.files?.[0];
  if (file) handleFile(file);
});

renderDropzone();
