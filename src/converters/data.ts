import * as Papa from "papaparse";
import { load as yamlLoad, dump as yamlDump } from "js-yaml";
import * as TOML from "@iarna/toml";
import { XMLParser, XMLBuilder } from "fast-xml-parser";
import type { ConverterFn, ConverterModule, FormatDef } from "./types";
import { withExt } from "./types";

const DEF: Record<string, FormatDef> = {
  json: { id: "json", label: "JSON", ext: "json", mime: "application/json", category: "data" },
  csv: { id: "csv", label: "CSV", ext: "csv", mime: "text/csv", category: "data" },
  yaml: { id: "yaml", label: "YAML", ext: "yaml", mime: "application/yaml", category: "data" },
  xml: { id: "xml", label: "XML", ext: "xml", mime: "application/xml", category: "data" },
  toml: { id: "toml", label: "TOML", ext: "toml", mime: "application/toml", category: "data" },
};

const FORMAT_IDS = Object.keys(DEF);

function csvRows(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      if (Array.isArray(v)) return v;
    }
    return [value];
  }
  return [{ value }];
}

function xmlRoot(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const keys = Object.keys(value as Record<string, unknown>);
    if (keys.length === 1) return value as Record<string, unknown>;
  }
  return { root: value };
}

type TomlMap = Parameters<typeof TOML.stringify>[0];

function tomlRoot(value: unknown): TomlMap {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as TomlMap;
  }
  return { value } as TomlMap;
}

const parsers: Record<string, (text: string) => unknown> = {
  json: (t) => JSON.parse(t),
  yaml: (t) => yamlLoad(t),
  toml: (t) => TOML.parse(t),
  xml: (t) => new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" }).parse(t),
  csv: (t) => {
    const result = Papa.parse(t.trim(), { header: true, dynamicTyping: true, skipEmptyLines: true });
    if (result.errors.length) throw new Error(result.errors[0].message);
    return result.data;
  },
};

const serializers: Record<string, (value: unknown) => string> = {
  json: (v) => JSON.stringify(v, null, 2),
  yaml: (v) => yamlDump(v, { lineWidth: 100 }),
  toml: (v) => TOML.stringify(tomlRoot(v)),
  xml: (v) =>
    new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: "@_", format: true, indentBy: "  " }).build(
      xmlRoot(v),
    ),
  csv: (v) => Papa.unparse(csvRows(v)),
};

const convertData: ConverterFn = async (job) => {
  const text = await job.file.text();
  const parse = parsers[job.from];
  const serialize = serializers[job.to];
  if (!parse || !serialize) throw new Error(`Unsupported data conversion: ${job.from} -> ${job.to}`);

  let value: unknown;
  try {
    value = parse(text);
  } catch (err) {
    throw new Error(`Couldn't parse ${job.from.toUpperCase()}: ${(err as Error).message}`);
  }

  let out: string;
  try {
    out = serialize(value);
  } catch (err) {
    throw new Error(`Couldn't write ${job.to.toUpperCase()}: ${(err as Error).message}`);
  }

  const def = DEF[job.to];
  const blob = new Blob([out], { type: `${def.mime};charset=utf-8` });
  return { blob, filename: withExt(job.file.name, def.ext) };
};

const converters: Record<string, ConverterFn> = {};
for (const from of FORMAT_IDS) {
  for (const to of FORMAT_IDS) {
    if (from === to) continue;
    converters[`${from}->${to}`] = convertData;
  }
}

export const data: ConverterModule = {
  formats: Object.values(DEF),
  converters,
};
