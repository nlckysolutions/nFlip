import type { FormatDef } from "./types";

export const DEF: Record<string, FormatDef> = {
  mp3: { id: "mp3", label: "MP3", ext: "mp3", mime: "audio/mpeg", category: "audio" },
  wav: { id: "wav", label: "WAV", ext: "wav", mime: "audio/wav", category: "audio" },
  ogg: { id: "ogg", label: "OGG", ext: "ogg", mime: "audio/ogg", category: "audio" },
  flac: { id: "flac", label: "FLAC", ext: "flac", mime: "audio/flac", category: "audio" },
  aac: { id: "aac", label: "AAC", ext: "aac", mime: "audio/aac", category: "audio" },
  m4a: { id: "m4a", label: "M4A", ext: "m4a", mime: "audio/mp4", category: "audio" },
  mp4: { id: "mp4", label: "MP4", ext: "mp4", mime: "video/mp4", category: "video" },
  webm: { id: "webm", label: "WebM", ext: "webm", mime: "video/webm", category: "video" },
  mov: { id: "mov", label: "MOV", ext: "mov", mime: "video/quicktime", category: "video" },
};

export const AUDIO_FORMATS = ["mp3", "wav", "ogg", "flac", "aac", "m4a"];
export const VIDEO_FORMATS = ["mp4", "webm", "mov"];
export const AUDIO_TARGETS = ["mp3", "wav", "ogg", "m4a"];

export function mediaConverterKeys(): string[] {
  const keys: string[] = [];
  for (const from of AUDIO_FORMATS) {
    for (const to of AUDIO_FORMATS) {
      if (from !== to) keys.push(`${from}->${to}`);
    }
  }
  for (const from of VIDEO_FORMATS) {
    for (const to of VIDEO_FORMATS) {
      if (from !== to) keys.push(`${from}->${to}`);
    }
  }
  for (const from of VIDEO_FORMATS) {
    for (const to of AUDIO_TARGETS) keys.push(`${from}->${to}`);
    keys.push(`${from}->gif`);
  }
  return keys;
}
