import { FFmpeg } from "@ffmpeg/ffmpeg";
import coreURL from "@ffmpeg/core?url";
import wasmURL from "@ffmpeg/core/wasm?url";
import type { ConversionJob, ConverterFn, ConverterModule } from "./types";
import { withExt } from "./types";
import { AUDIO_FORMATS, AUDIO_TARGETS, DEF, VIDEO_FORMATS } from "./media.meta";

const GIF_MIME = "image/gif";

let ffmpegPromise: Promise<FFmpeg> | null = null;
function getFFmpeg(): Promise<FFmpeg> {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const ffmpeg = new FFmpeg();
      await ffmpeg.load({ coreURL, wasmURL });
      return ffmpeg;
    })();
  }
  return ffmpegPromise;
}

function codecArgs(to: string): string[] {
  switch (to) {
    case "mp4":
    case "mov":
      return ["-c:v", "libx264", "-preset", "fast", "-crf", "23", "-c:a", "aac"];
    case "webm":
      return ["-c:v", "libvpx-vp9", "-crf", "30", "-b:v", "0", "-c:a", "libopus"];
    case "mp3":
      return ["-c:a", "libmp3lame", "-b:a", "192k"];
    case "ogg":
      return ["-c:a", "libvorbis"];
    case "aac":
    case "m4a":
      return ["-c:a", "aac"];
    case "flac":
      return ["-c:a", "flac"];
    case "wav":
      return [];
    case "gif":
      return ["-vf", "fps=12,scale=480:-1:flags=lanczos", "-loop", "0"];
    default:
      throw new Error(`Unsupported media target: ${to}`);
  }
}

function mimeFor(to: string): string {
  return to === "gif" ? GIF_MIME : DEF[to].mime;
}

function extFor(to: string): string {
  return to === "gif" ? "gif" : DEF[to].ext;
}

async function transcode(job: ConversionJob): Promise<Blob> {
  const ffmpeg = await getFFmpeg();
  const inputName = `input.${job.from}`;
  const outputName = `output.${extFor(job.to)}`;
  const extractAudioOnly = VIDEO_FORMATS.includes(job.from) && AUDIO_TARGETS.includes(job.to);

  const onProgress = ({ progress }: { progress: number }) => {
    job.onProgress?.(Math.min(1, Math.max(0, progress)));
  };
  ffmpeg.on("progress", onProgress);

  try {
    await ffmpeg.writeFile(inputName, new Uint8Array(await job.file.arrayBuffer()));

    const args = ["-i", inputName];
    if (extractAudioOnly) args.push("-vn");
    args.push(...codecArgs(job.to), outputName);

    const code = await ffmpeg.exec(args);
    if (code !== 0) throw new Error(`ffmpeg failed to convert this file (exit code ${code}).`);

    const data = await ffmpeg.readFile(outputName);
    const bytes = typeof data === "string" ? data : new Uint8Array(data);
    const blob = new Blob([bytes], { type: mimeFor(job.to) });
    if (blob.size === 0) throw new Error("Conversion produced an empty file.");
    return blob;
  } finally {
    ffmpeg.off("progress", onProgress);
    await ffmpeg.deleteFile(inputName).catch(() => {});
    await ffmpeg.deleteFile(outputName).catch(() => {});
  }
}

const convertMedia: ConverterFn = async (job) => {
  const blob = await transcode(job);
  return { blob, filename: withExt(job.file.name, extFor(job.to)) };
};

const converters: Record<string, ConverterFn> = {};

for (const from of AUDIO_FORMATS) {
  for (const to of AUDIO_FORMATS) {
    if (from === to) continue;
    converters[`${from}->${to}`] = convertMedia;
  }
}

for (const from of VIDEO_FORMATS) {
  for (const to of VIDEO_FORMATS) {
    if (from === to) continue;
    converters[`${from}->${to}`] = convertMedia;
  }
}

for (const from of VIDEO_FORMATS) {
  for (const to of AUDIO_TARGETS) {
    converters[`${from}->${to}`] = convertMedia;
  }
}

for (const from of VIDEO_FORMATS) {
  converters[`${from}->gif`] = convertMedia;
}

export const media: ConverterModule = {
  formats: Object.values(DEF),
  converters,
};
