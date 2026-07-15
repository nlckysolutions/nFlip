# nFlip

A file converter that runs entirely in the browser. Drop a file, pick a target
format, get a download — nothing is ever uploaded anywhere.

By [NlckySolutions](https://nlckysolutions.org). Live at [nflip.dev](https://nflip.dev).

## How conversion works

Everything happens client-side:

- **Images** (PNG, JPG, WebP, BMP, ICO, SVG) — the Canvas API
- **Structured data** (JSON, CSV, YAML, XML, TOML) — small parser/serializer libraries
- **Documents** (PDF, DOCX, Markdown, HTML, TXT) — pdf.js, jsPDF, mammoth, marked, turndown, docx
- **Audio & video** (MP3, WAV, OGG, FLAC, AAC, M4A, MP4, WebM, MOV, GIF) — [ffmpeg.wasm](https://ffmpegwasm.netlify.app/), self-hosted, no CDN

Each format family is a self-contained module under `src/converters/`, registered
in `src/converters/registry.ts`. Adding a new format means adding a `FormatDef`
and one or more `from->to` entries to a module's `converters` map — the UI picks
up new targets automatically.

## Development

```bash
npm install
npm run dev
```

## Build & deploy

```bash
npm run build
```

Pushing to `main` builds and deploys to GitHub Pages automatically via
`.github/workflows/deploy.yml`. The custom domain is set via `public/CNAME`.
