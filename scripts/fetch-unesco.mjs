import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const inputs = process.argv.slice(2);

const query = (offset) => `SELECT ?item ?itemLabel ?itemDescription ?inception ?coord WHERE {
  ?item wdt:P1435 wd:Q9259; wdt:P625 ?coord.
  OPTIONAL { ?item wdt:P571 ?inception }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,mul,fr,es,de,it,pt,nl,tl,id,ms". }
}
LIMIT 2000 OFFSET ${offset}`;

async function fetchPage(offset) {
  const response = await fetch(
    `https://query.wikidata.org/sparql?query=${encodeURIComponent(query(offset))}&format=json`,
    {
      headers: {
        "User-Agent": "ChronoAtlas/0.1 (local prototype)",
        Accept: "application/sparql-results+json",
      },
      signal: AbortSignal.timeout(180_000),
    },
  );
  if (!response.ok) throw new Error(`Wikidata returned ${response.status}`);
  return response.json();
}

async function fetchAll() {
  const bindings = [];
  for (let offset = 0; ; offset += 2000) {
    const page = await fetchPage(offset);
    bindings.push(...page.results.bindings);
    console.log(`Fetched ${page.results.bindings.length} rows at offset ${offset}`);
    if (page.results.bindings.length < 2000) break;
  }
  return { results: { bindings } };
}

const results = inputs.length
  ? (
      await Promise.all(inputs.map(async (file) => JSON.parse(await readFile(file, "utf8"))))
    ).flatMap((data) => data.results.bindings)
  : (await fetchAll()).results.bindings;
const seen = new Set();
const rows = results.filter((row) => {
  if (!row.item?.value || !row.coord?.value || seen.has(row.item.value)) return false;
  seen.add(row.item.value);
  return true;
});

const slugify = (value) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");

const entries = [];
const sources = [];

for (const row of rows) {
  const qid = row.item.value.split("/").at(-1);
  const coord = row.coord.value.match(/Point\(([-\d.eE]+) ([-\d.eE]+)\)/);
  if (!qid || !coord) continue;

  const longitude = Number(coord[1]);
  const latitude = Number(coord[2]);
  const title = row.itemLabel?.value ?? qid;
  const year = row.inception?.value?.match(/^(-?\+?\d{1,6})-\d{2}-\d{2}/);
  const slug = `${slugify(title) || "site"}-${qid.toLowerCase()}`;
  const id = `e-unesco-${qid.toLowerCase()}`;
  const url = `https://www.wikidata.org/wiki/${qid}`;

  entries.push({
    id,
    title,
    slug,
    scope:
      latitude >= 5 && latitude <= 20 && longitude >= 117 && longitude <= 126
        ? "local"
        : "international",
    entryType: "place",
    era: null,
    startYear: year ? Number(year[1].replace("+", "")) : null,
    endYear: null,
    dateIsApproximate: true,
    locationName: null,
    summary: row.itemDescription?.value ?? "No description is recorded in Wikidata for this item.",
    significance: null,
    origin: { latitude, longitude },
    current: null,
    originPrecision: "unknown",
    currentPrecision: null,
    originSource: url,
    currentSource: null,
    reviewed: false,
  });

  sources.push({
    id: `s-unesco-${qid.toLowerCase()}`,
    entryId: id,
    title: `Wikidata: ${title}`,
    url,
    publisher: "Wikidata",
    accessedAt: "2026-11-25",
    sourceType: "knowledge base",
  });
}

const output = `// Generated from the Wikidata World Heritage Site query in scripts/fetch-unesco.mjs.
// Unreviewed drafts: labels, descriptions, inception years, and coordinates come from Wikidata.

import type { HistoricalEntry, SourceRef } from "../types/atlas";

export const unescoEntries: HistoricalEntry[] = ${JSON.stringify(entries)};

export const unescoSources: SourceRef[] = ${JSON.stringify(sources)};
`;

await writeFile(path.join(root, "src/data/unescoSeed.ts"), output, "utf8");
console.log(`Wrote ${entries.length} Wikidata records to src/data/unescoSeed.ts`);
