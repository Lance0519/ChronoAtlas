// Enriches the generated UNESCO seed with Wikidata/Wikipedia summaries,
// locationName, era, significance, and one MediaItem per entry.
// Run with no args to use src/data/unescoSeed.ts, or pass cached SPARQL JSON
// files to add their QIDs to the set.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const seedPath = path.join(root, "src/data/unescoSeed.ts");
const mediaPath = path.join(root, "src/data/unescoMedia.ts");
const placeholderPath = path.join(root, "public/evidence-placeholder.svg");
const inputs = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const refreshSummariesOnly = process.argv.includes("--refresh-summaries");
const refreshSourcesOnly = process.argv.includes("--refresh-sources");

const UA =
  "ChronoAtlasEnrichment/0.2 (https://github.com/chronoatlas/chronoatlas; educational-historical-atlas) node";
const PLACEHOLDER = "No description is recorded in Wikidata for this item.";
const WHC_API = "https://data.unesco.org/api/explore/v2.1/catalog/datasets/whc001/records";
const BATCH = 50;
// TextExtracts caps anonymous requests at 20 extracts, despite the 50-title limit.
const WIKI_BATCH = 20;
const CONCURRENCY = 2;
const HOST_GAP_MS = {
  "www.wikidata.org": 600,
  "en.wikipedia.org": 350,
  "commons.wikimedia.org": 350,
};

const LANG_PRIORITY = ["en", "mul", "tl", "fr", "es", "de", "it", "pt", "nl", "id", "ms"];
const SKIP_P31_LABELS = new Set([
  "world heritage site",
  "unesco world heritage site",
  "part of unesco world heritage site",
  "tourist attraction",
  "chinese aaaaa-rated tourist attraction",
  "group",
  "geographic location",
  "entity",
  "wikimedia list article",
]);
const ERA_P31_PATTERN =
  /\b(archaeological|prehistoric|ancient|historic(?:al)?|heritage|cultural landscape|cultural property|architectural ensemble|architectural landmark|megalithic|rock art|ghost town|ruins|roman|medieval|byzantine|colonial|neolithic|bronze age|iron age|paleolithic|mesolithic|chalcolithic|pre-columbian|baroque|gothic|romanesque|renaissance|ottoman|mughal|classical|hellenistic|pharaonic|inca|maya|aztec|khmer)\b/i;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const requestQueues = new Map();
const lastRequest = new Map();

async function pacedFetch(url, options) {
  const host = new URL(url).hostname;
  const previous = requestQueues.get(host) ?? Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  requestQueues.set(host, current);
  await previous;
  const gap = HOST_GAP_MS[host] ?? 200;
  const wait = gap - (Date.now() - (lastRequest.get(host) ?? 0));
  if (wait > 0) await sleep(wait);
  lastRequest.set(host, Date.now());
  try {
    return await fetch(url, options);
  } finally {
    release();
  }
}

const placeholderSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 300" role="img" aria-labelledby="title desc">
  <title id="title">Source record</title>
  <desc id="desc">Placeholder for a heritage site record with no image recorded in Wikidata.</desc>
  <rect width="480" height="300" fill="#f5efe3"/>
  <rect x="12" y="12" width="456" height="276" fill="none" stroke="#b9a98d" stroke-width="1"/>
  <line x1="40" y1="150" x2="440" y2="150" stroke="#b9a98d" stroke-width="1"/>
  <g fill="#2e2a24" font-family="Georgia, serif" text-anchor="middle">
    <text x="240" y="126" font-size="26" letter-spacing="3">SOURCE RECORD</text>
    <text x="240" y="192" font-size="22" letter-spacing="2">NO IMAGE</text>
  </g>
</svg>
`;

function chunks(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function pool(items, limit, worker) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        await worker(items[index], index);
      }
    }),
  );
}

async function getJsonUrl(url) {
  let lastError;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const response = await pacedFetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.status === 429 || response.status >= 500) {
        const retry = Number(response.headers.get("retry-after"));
        const delay = retry > 0 ? retry * 1000 : 1000 * 2 ** Math.min(attempt, 5);
        await response.arrayBuffer().catch(() => {});
        if (attempt === 7) throw new Error(`HTTP ${response.status} after retries`);
        console.log(
          `${new URL(url).hostname}: HTTP ${response.status}, waiting ${Math.round(delay / 1000)}s`,
        );
        await sleep(delay);
        continue;
      }
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (data.error) throw new Error(JSON.stringify(data.error));
      return data;
    } catch (error) {
      lastError = error;
      if (attempt === 7) break;
      await sleep(1000 * 2 ** Math.min(attempt, 5));
    }
  }
  throw new Error(`${url}: ${lastError?.message ?? lastError}`);
}

async function getJson(base, params) {
  return getJsonUrl(`${base}?${new URLSearchParams(params)}`);
}

function readSeedArray(source, name) {
  const marker = `export const ${name}`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`${name} not found in ${seedPath}`);
  const equals = source.indexOf("=", start);
  const end = source.indexOf("\n", equals);
  return JSON.parse(
    source
      .slice(equals + 1, end)
      .trim()
      .replace(/;$/, ""),
  );
}

const stripHiddenHtml = (value) =>
  String(value ?? "")
    .replace(/<(div|span)\b[^>]*display\s*:\s*none[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");

const cleanText = (value) =>
  stripHiddenHtml(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

const cleanCreator = (value) => {
  const text = cleanText(value);
  if (!text) return null;
  if (/^(.{4,})\1$/.test(text)) {
    return text.slice(0, text.length / 2).trim();
  }
  if (text.toLowerCase() === "unknown authorunknown author") return "Unknown author";
  return text;
};

const isUsable = (value) => {
  const text = cleanText(value);
  return text.length > 0 && text !== PLACEHOLDER;
};

const isGenericDescription = (text) =>
  !text ||
  text === PLACEHOLDER ||
  /^UNESCO World Heritage Site\b/i.test(text) ||
  /^World Heritage Site\b/i.test(text);

const isGeneratedFallback = (text) =>
  /^UNESCO World Heritage Site (in |recorded in Wikidata\.)/.test(text);

const sentenceSegmenter = new Intl.Segmenter("en", { granularity: "sentence" });

function multiSentenceSummary(extract, maxChars = 480) {
  if (!extract) return null;
  const paragraphs = extract
    .split(/\n\s*\n/)
    .map((p) =>
      cleanText(p)
        .replace(/\[\d+\]|\[note \d+\]/gi, "")
        .replace(/\(\s*[;,]\s*/g, "(")
        .replace(/\(\s*\)/g, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
  if (!paragraphs.length) return null;
  const combined = paragraphs.slice(0, 2).join(" ");
  if (/\bmay refer to:\s*$/i.test(combined) && combined.length < 180) return null;
  if (combined.length <= maxChars) return combined;

  let depth = 0;
  let cutEnd = 0;
  for (const { segment, index } of sentenceSegmenter.segment(combined)) {
    const segEnd = index + segment.length;
    for (const ch of segment) {
      if (ch === "(" || ch === "[") depth++;
      else if ((ch === ")" || ch === "]") && depth > 0) depth--;
    }
    if (depth === 0) {
      const trimmedLen = combined.slice(0, segEnd).trimEnd().length;
      if (trimmedLen <= maxChars) cutEnd = trimmedLen;
      else break;
    }
  }
  if (cutEnd >= 60) return combined.slice(0, cutEnd).trimEnd();

  const head = combined.slice(0, maxChars - 1);
  const lastSpace = head.lastIndexOf(" ");
  return `${(lastSpace > 100 ? head.slice(0, lastSpace) : head).trimEnd()}…`;
}

/** Wikipedia/Commons return pages keyed by canonical title after redirects. */
function pageLookup(data) {
  const query = data?.query ?? {};
  const aliases = new Map();
  for (const list of [query.normalized ?? [], query.redirects ?? []]) {
    for (const item of list) aliases.set(item.from, item.to);
  }
  const pages = new Map(Object.values(query.pages ?? {}).map((page) => [page.title, page]));
  return (title) => {
    let current = title;
    const seen = new Set();
    while (aliases.has(current) && !seen.has(current)) {
      seen.add(current);
      current = aliases.get(current);
    }
    return pages.get(current) ?? pages.get(title);
  };
}

const slugify = (value) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");

function makeUniqueSlug(title, qid, usedSlugs) {
  const base = slugify(title) || "site";
  const qSuffix = qid.toLowerCase();
  let candidate = `${base}-${qSuffix}`;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(candidate)) {
    candidate = `site-${qSuffix}`;
  }
  let counter = 2;
  while (usedSlugs.has(candidate)) {
    candidate = `${base}-${qSuffix}-${counter++}`;
  }
  usedSlugs.add(candidate);
  return candidate;
}

function claimValues(entity, prop, { excludeEnded = false } = {}) {
  const raw = (entity?.claims?.[prop] ?? []).filter((c) => c?.rank !== "deprecated");
  const sorted = [
    ...raw.filter((c) => c.rank === "preferred"),
    ...raw.filter((c) => c.rank !== "preferred"),
  ];
  const filtered = excludeEnded ? sorted.filter((c) => !c.qualifiers?.P582?.length) : sorted;
  const active = filtered.length ? filtered : sorted;
  return active
    .map((c) => c?.mainsnak?.datavalue?.value)
    .filter((v) => v !== undefined && v !== null);
}

function claimIds(entity, prop, options) {
  return [
    ...new Set(
      claimValues(entity, prop, options)
        .map((v) => v?.id)
        .filter((id) => /^Q\d+$/.test(id ?? "")),
    ),
  ];
}

function parseWikibaseYear(timeVal) {
  if (!timeVal?.time) return null;
  const match = String(timeVal.time).match(/^([+-]\d{1,6})-\d{2}-\d{2}/);
  if (!match) return null;
  const raw = Number(match[1]);
  if (!Number.isFinite(raw)) return null;
  // Wikibase encodes 1 BCE as -0001 (precision >= 9) vs astronomical 0.
  const precision = timeVal.precision ?? 9;
  const astro = raw < 0 && precision >= 9 ? raw + 1 : raw;
  return astro >= -500000 && astro <= 2100 ? astro : null;
}

function pickEntityTitle(entity, fallbackTitle, qid) {
  const labels = entity?.labels ?? {};
  for (const lang of LANG_PRIORITY) {
    const val = cleanText(labels[lang]?.value);
    if (val && !/^Q\d+$/.test(val)) return val;
  }
  const enwiki = cleanText(entity?.sitelinks?.enwiki?.title);
  if (enwiki && !/^Q\d+$/.test(enwiki)) return enwiki;

  const otherLabels = Object.values(labels)
    .map((l) => cleanText(l?.value))
    .filter((v) => v && !/^Q\d+$/.test(v));
  const latinLabel = otherLabels.find((v) => /[A-Za-z]/.test(v));
  if (latinLabel) return latinLabel;
  if (otherLabels[0]) return otherLabels[0];

  for (const site of Object.values(entity?.sitelinks ?? {})) {
    const siteTitle = cleanText(site?.title).replace(/^(Category|Commons):/i, "");
    if (siteTitle && !/^Q\d+$/.test(siteTitle)) return siteTitle;
  }

  const fb = cleanText(fallbackTitle);
  return fb && !/^Q\d+$/.test(fb) ? fb : qid;
}

function pickRefLabel(entity) {
  if (!entity) return null;
  const labels = entity.labels ?? {};
  for (const lang of LANG_PRIORITY) {
    const val = cleanText(labels[lang]?.value);
    if (val && !/^Q\d+$/.test(val)) return val;
  }
  const enwiki = cleanText(entity.sitelinks?.enwiki?.title);
  if (enwiki && !/^Q\d+$/.test(enwiki)) return enwiki;
  const any = Object.values(labels)
    .map((l) => cleanText(l?.value))
    .find((v) => v && !/^Q\d+$/.test(v));
  return any ?? null;
}

function parsePhotoYear(ext) {
  const raw = cleanText(ext?.DateTimeOriginal?.value ?? ext?.DateTimeOriginal?.Value);
  if (!raw) return null;
  const iso = raw.match(/\b(1[89]\d{2}|20[0-2]\d)-\d{2}-\d{2}\b/);
  if (iso) {
    const y = Number(iso[1]);
    return y >= 1826 && y <= 2026 ? y : null;
  }
  const matches = [...raw.matchAll(/\b(1[89]\d{2}|20[0-2]\d)\b/g)].map((m) => Number(m[1]));
  const unique = [...new Set(matches)].filter((y) => y >= 1826 && y <= 2026);
  if (unique.length === 1) return unique[0];
  if (unique.length >= 2) {
    const span = Math.max(...unique) - Math.min(...unique);
    if (
      /\btaken on\b/i.test(raw) ||
      /^\d{4}\s*[–-]/.test(raw) ||
      (/\b(from|between)\b/i.test(raw) && span <= 45)
    ) {
      return unique[0];
    }
  }
  return null;
}

function buildAttribution(ext, creator, license) {
  const explicitAttr = cleanCreator(ext?.Attribution?.value ?? ext?.Attribution?.Value);
  const credit = cleanText(ext?.Credit?.value ?? ext?.Credit?.Value);
  const attrReq =
    cleanText(ext?.AttributionRequired?.value ?? ext?.AttributionRequired?.Value).toLowerCase() ===
    "true";

  if (explicitAttr) {
    return license && !explicitAttr.includes(license)
      ? `${explicitAttr} (${license})`
      : explicitAttr;
  }
  if (credit) {
    if (/^own work$/i.test(credit) || /^self-photographed$/i.test(credit)) {
      if (creator) {
        return `${creator}, ${credit}${attrReq && license ? ` (${license})` : ""}`;
      }
      return credit;
    }
    return attrReq && creator && !credit.includes(creator) ? `${creator}; ${credit}` : credit;
  }
  if (attrReq && creator) {
    return license ? `${creator} (${license})` : `${creator} (attribution required)`;
  }
  return null;
}

function formatYearPlain(year) {
  if (year === null || year === undefined) return null;
  return year <= 0 ? `${1 - year} BCE` : `${year} CE`;
}

const isUsableImageFilename = (name) => {
  if (!name || typeof name !== "string") return false;
  return !/\.(webm|ogv|ogg|oga|mp3|wav|flac|pdf|djvu|svg)$/i.test(name.trim());
};

const isUsableCatImage = (title) => {
  const name = title.replace(/^File:/i, "");
  if (!/\.(jpe?g|png|webp)$/i.test(name)) return false;
  if (
    /\b(map|locator|flag|coat[_ ]of[_ ]arms|emblem|seal|logo|diagram|plan|icon|banner)\b/i.test(
      name,
    )
  ) {
    return false;
  }
  return true;
};

async function fetchWhcDataset() {
  const byId = new Map();
  let offset = 0;
  const limit = 100;
  while (true) {
    const data = await getJson(WHC_API, { limit: String(limit), offset: String(offset) }).catch(
      () => null,
    );
    const rows = data?.results ?? [];
    if (!rows.length) break;
    for (const row of rows) {
      if (row?.id_no !== undefined && row?.id_no !== null) {
        byId.set(String(row.id_no).trim(), row);
      }
    }
    offset += rows.length;
    if (rows.length < limit) break;
  }
  console.log(`Fetched ${byId.size} official UNESCO WHC001 records from data.unesco.org`);
  return byId;
}

function matchWhcRecord(whcMap, p757List) {
  for (const raw of p757List) {
    const exact = String(raw).trim();
    if (whcMap.has(exact)) return { record: whcMap.get(exact), exact: true };
    const base = exact.split("-")[0].replace(/(rev|bis|ter)$/i, "");
    if (whcMap.has(base)) return { record: whcMap.get(base), exact: false };
  }
  return null;
}

function buildEntrySources({ qid, title, enwikiTitle, whcMatch, officialUrl }) {
  const out = [
    {
      id: `s-unesco-${qid.toLowerCase()}`,
      entryId: `e-unesco-${qid.toLowerCase()}`,
      title: `Wikidata: ${title}`,
      url: `https://www.wikidata.org/wiki/${qid}`,
      publisher: "Wikidata",
      accessedAt: "2026-11-25",
      sourceType: "knowledge base",
    },
  ];
  if (whcMatch?.record) {
    const idNo = String(whcMatch.record.id_no).trim();
    const whcTitle = cleanText(whcMatch.record.name_en) || title;
    out.push({
      id: `s-unesco-whc-${qid.toLowerCase()}`,
      entryId: `e-unesco-${qid.toLowerCase()}`,
      title: `UNESCO WHC #${idNo}: ${whcTitle}`,
      url: `https://data.unesco.org/explore/dataset/whc001/?q=${encodeURIComponent(idNo)}`,
      publisher: "UNESCO World Heritage Centre",
      accessedAt: "2026-11-25",
      sourceType: "heritage registry",
    });
  }
  if (enwikiTitle) {
    out.push({
      id: `s-unesco-wp-${qid.toLowerCase()}`,
      entryId: `e-unesco-${qid.toLowerCase()}`,
      title: `Wikipedia: ${enwikiTitle}`,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(enwikiTitle.replace(/ /g, "_"))}`,
      publisher: "Wikipedia",
      accessedAt: "2026-11-25",
      sourceType: "encyclopedia",
    });
  }
  if (officialUrl) {
    try {
      const parsed = new URL(officialUrl);
      if (parsed.protocol === "https:" || parsed.protocol === "http:") {
        out.push({
          id: `s-unesco-web-${qid.toLowerCase()}`,
          entryId: `e-unesco-${qid.toLowerCase()}`,
          title: `Official site: ${title}`,
          url: officialUrl,
          publisher: parsed.hostname.replace(/^www\./, ""),
          accessedAt: "2026-11-25",
          sourceType: "official site",
        });
      }
    } catch {
      // Ignore malformed external URLs
    }
  }
  return out;
}

const seedSource = await readFile(seedPath, "utf8");
const entries = readSeedArray(seedSource, "unescoEntries");
const sources = readSeedArray(seedSource, "unescoSources");

const seedQids = entries.map((entry) => entry.id.replace(/^e-unesco-/, "").toUpperCase());
const cachedQids = (
  await Promise.all(inputs.map(async (file) => JSON.parse(await readFile(file, "utf8"))))
)
  .flatMap((data) => data.results?.bindings ?? [])
  .map((row) => row.item?.value?.split("/").at(-1))
  .filter(Boolean);
const qids = [...new Set([...seedQids, ...cachedQids])];
console.log(`Read ${entries.length} seed entries, ${qids.length} unique QIDs`);

const wikidataUrl = "https://www.wikidata.org/w/api.php";
const wikipediaUrl = "https://en.wikipedia.org/w/api.php";
const commonsUrl = "https://commons.wikimedia.org/w/api.php";

if (refreshSummariesOnly) {
  const enwikiTitles = new Map();
  await pool(chunks(qids, BATCH), CONCURRENCY, async (batch) => {
    const data = await getJson(wikidataUrl, {
      action: "wbgetentities",
      props: "sitelinks",
      format: "json",
      ids: batch.join("|"),
      sitefilter: "enwiki",
    });
    for (const [qid, entity] of Object.entries(data?.entities ?? {})) {
      const title = entity?.sitelinks?.enwiki?.title;
      if (title) enwikiTitles.set(qid, title);
    }
  });
  const wikiEntries = [...enwikiTitles.entries()];
  const extracts = new Map();
  await pool(chunks(wikiEntries, WIKI_BATCH), CONCURRENCY, async (batch) => {
    const data = await getJson(wikipediaUrl, {
      action: "query",
      prop: "extracts",
      exintro: 1,
      explaintext: 1,
      exchars: 700,
      exlimit: 20,
      format: "json",
      redirects: 1,
      titles: batch.map(([, title]) => title).join("|"),
    });
    const pageFor = pageLookup(data);
    for (const [qid, title] of batch) {
      const extract = pageFor(title)?.extract;
      const summary = multiSentenceSummary(extract ?? "", 480);
      if (summary) extracts.set(qid, summary);
    }
  });
  let updated = 0;
  const patchedEntries = entries.map((entry) => {
    const qid = entry.id.replace(/^e-unesco-/, "").toUpperCase();
    const summary = extracts.get(qid);
    if (!summary) return entry;
    if (summary !== entry.summary) updated++;
    return { ...entry, summary };
  });
  const seedHeader = `// Generated from the Wikidata World Heritage Site query in scripts/fetch-unesco.mjs.
// Unreviewed drafts: labels, descriptions, inception years, and coordinates come from Wikidata.
// Titles, summaries, locationName, era, significance, and media were enriched by scripts/enrich-unesco.mjs.

import type { HistoricalEntry, SourceRef } from "../types/atlas";

`;
  await writeFile(
    seedPath,
    `${seedHeader}export const unescoEntries: HistoricalEntry[] = ${JSON.stringify(patchedEntries)};

export const unescoSources: SourceRef[] = ${JSON.stringify(sources)};
`,
    "utf8",
  );
  console.log(
    `Refreshed ${extracts.size} Wikipedia summaries (${updated} updated) in src/data/unescoSeed.ts`,
  );
  process.exit(0);
}

if (refreshSourcesOnly) {
  const whcMap = await fetchWhcDataset();
  const siteEntities = new Map();
  await pool(chunks(qids, BATCH), CONCURRENCY, async (batch) => {
    const data = await getJson(wikidataUrl, {
      action: "wbgetentities",
      props: "sitelinks|claims",
      format: "json",
      ids: batch.join("|"),
      sitefilter: "enwiki",
    });
    for (const [qid, entity] of Object.entries(data?.entities ?? {})) {
      if (entity?.id) siteEntities.set(qid, entity);
    }
  });

  let whcSummaryCount = 0;
  let whcSigCount = 0;
  const multiSources = [];
  const patchedEntries = entries.map((entry) => {
    const qid = entry.id.replace(/^e-unesco-/, "").toUpperCase();
    const entity = siteEntities.get(qid);
    const enwikiTitle = entity?.sitelinks?.enwiki?.title ?? null;
    const p757List = claimValues(entity, "P757").filter((v) => typeof v === "string");
    const officialUrl = claimValues(entity, "P856").find((v) => typeof v === "string") ?? null;
    const whcMatch = matchWhcRecord(whcMap, p757List);

    let summary = entry.summary;
    if (
      whcMatch?.exact &&
      whcMatch.record.short_description_en &&
      (!enwikiTitle || entry.summary.includes("designated as a UNESCO World Heritage Site"))
    ) {
      const whcSummary = multiSentenceSummary(whcMatch.record.short_description_en, 480);
      if (whcSummary) {
        summary = whcSummary;
        whcSummaryCount++;
      }
    }

    let significance = entry.significance;
    if (!significance && whcMatch?.record) {
      const just = multiSentenceSummary(whcMatch.record.justification_en ?? "", 320);
      const crit = cleanText(whcMatch.record.criteria_txt);
      const yr = cleanText(whcMatch.record.date_inscribed);
      if (just || crit) {
        significance = `UNESCO World Heritage${crit ? ` criteria ${crit}` : ""}${yr ? ` (inscribed ${yr})` : ""}${just ? `: ${just}` : "."}`;
        whcSigCount++;
      }
    }

    multiSources.push(
      ...buildEntrySources({ qid, title: entry.title, enwikiTitle, whcMatch, officialUrl }),
    );
    return { ...entry, summary, significance };
  });

  const seedHeader = `// Generated from the Wikidata World Heritage Site query in scripts/fetch-unesco.mjs.
// Unreviewed drafts: labels, descriptions, inception years, and coordinates come from Wikidata.
// Titles, summaries, locationName, era, significance, sources, and media were enriched by scripts/enrich-unesco.mjs.

import type { HistoricalEntry, SourceRef } from "../types/atlas";

`;
  await writeFile(
    seedPath,
    `${seedHeader}export const unescoEntries: HistoricalEntry[] = ${JSON.stringify(patchedEntries)};

export const unescoSources: SourceRef[] = ${JSON.stringify(multiSources)};
`,
    "utf8",
  );
  const byPub = multiSources.reduce((acc, s) => {
    acc[s.publisher] = (acc[s.publisher] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    `Refreshed multi-source provenance in src/data/unescoSeed.ts: ${multiSources.length} sources (${whcSummaryCount} UNESCO WHC summaries applied, ${whcSigCount} UNESCO significances added)`,
  );
  console.log("Sources by publisher:", byPub);
  process.exit(0);
}

const whcMap = await fetchWhcDataset();
const entities = new Map();
await pool(chunks(qids, BATCH), CONCURRENCY, async (batch) => {
  const data = await getJson(wikidataUrl, {
    action: "wbgetentities",
    props: "sitelinks|claims|descriptions|labels",
    format: "json",
    ids: batch.join("|"),
    languages: LANG_PRIORITY.join("|"),
  });
  for (const [qid, entity] of Object.entries(data?.entities ?? {})) {
    if (entity?.id) entities.set(qid, entity);
  }
});

// Second pass without language filter for any item still missing a label in LANG_PRIORITY.
const missingLabelQids = qids.filter((qid) => {
  const e = entities.get(qid);
  if (!e) return true;
  const hasLabel = LANG_PRIORITY.some((lang) => isUsable(e.labels?.[lang]?.value));
  const hasEnwiki = Boolean(e.sitelinks?.enwiki?.title);
  return !hasLabel && !hasEnwiki;
});
if (missingLabelQids.length) {
  console.log(`Running full-language label fallback for ${missingLabelQids.length} entities...`);
  await pool(chunks(missingLabelQids, BATCH), CONCURRENCY, async (batch) => {
    const data = await getJson(wikidataUrl, {
      action: "wbgetentities",
      props: "sitelinks|claims|descriptions|labels",
      format: "json",
      ids: batch.join("|"),
    });
    for (const [qid, entity] of Object.entries(data?.entities ?? {})) {
      if (entity?.id) entities.set(qid, entity);
    }
  });
}

const enwikiTitles = new Map();
const imageNames = new Map();
const categoryFallbacks = new Map();
const refQids = new Set();

for (const [qid, entity] of entities) {
  const wikiTitle = entity.sitelinks?.enwiki?.title;
  if (wikiTitle) enwikiTitles.set(qid, wikiTitle);

  const p18 = claimValues(entity, "P18").find(
    (v) => typeof v === "string" && isUsableImageFilename(v),
  );
  if (p18) {
    imageNames.set(qid, p18);
  } else {
    const p373 = claimValues(entity, "P373").find((v) => typeof v === "string");
    if (p373) categoryFallbacks.set(qid, p373);
  }

  for (const id of [
    ...claimIds(entity, "P17", { excludeEnded: true }),
    ...claimIds(entity, "P131", { excludeEnded: true }),
    ...claimIds(entity, "P276", { excludeEnded: true }),
    ...claimIds(entity, "P31"),
    ...claimIds(entity, "P361"),
    ...claimIds(entity, "P1435"),
    ...claimIds(entity, "P2348"),
    ...claimIds(entity, "P2614"),
  ]) {
    refQids.add(id);
  }
}

console.log(
  `Fetched ${entities.size} Wikidata entities (${enwikiTitles.size} with enwiki, ${refQids.size} referenced QIDs)`,
);

const refEntities = new Map();
const refIdList = [...refQids];
await pool(chunks(refIdList, BATCH), CONCURRENCY, async (batch) => {
  const data = await getJson(wikidataUrl, {
    action: "wbgetentities",
    props: "labels|descriptions|sitelinks",
    format: "json",
    ids: batch.join("|"),
    languages: LANG_PRIORITY.join("|"),
  });
  for (const [qid, entity] of Object.entries(data?.entities ?? {})) {
    if (entity?.id) refEntities.set(qid, entity);
  }
});

const missingRefIds = refIdList.filter((id) => !pickRefLabel(refEntities.get(id)));
if (missingRefIds.length) {
  await pool(chunks(missingRefIds, BATCH), CONCURRENCY, async (batch) => {
    const data = await getJson(wikidataUrl, {
      action: "wbgetentities",
      props: "labels|descriptions|sitelinks",
      format: "json",
      ids: batch.join("|"),
    });
    for (const [qid, entity] of Object.entries(data?.entities ?? {})) {
      if (entity?.id) refEntities.set(qid, entity);
    }
  });
}

const refLabel = (qid) => pickRefLabel(refEntities.get(qid));
const refDesc = (qid) => cleanText(refEntities.get(qid)?.descriptions?.en?.value) || null;
console.log(
  `Resolved ${refIdList.filter((id) => refLabel(id)).length}/${refIdList.length} referenced entity labels`,
);

// Wikipedia batch extracts
const wikiEntries = [...enwikiTitles.entries()];
const extracts = new Map();
await pool(chunks(wikiEntries, WIKI_BATCH), CONCURRENCY, async (batch) => {
  const data = await getJson(wikipediaUrl, {
    action: "query",
    prop: "extracts",
    exintro: 1,
    explaintext: 1,
    exchars: 700,
    exlimit: 20,
    format: "json",
    redirects: 1,
    titles: batch.map(([, title]) => title).join("|"),
  });
  const pageFor = pageLookup(data);
  for (const [qid, title] of batch) {
    const extract = pageFor(title)?.extract;
    const summary = multiSentenceSummary(extract ?? "", 480);
    if (summary) extracts.set(qid, summary);
  }
});

// REST fallback for enwiki titles that yielded no batch extract
const missingWiki = wikiEntries.filter(([qid]) => !extracts.has(qid));
if (missingWiki.length) {
  console.log(
    `Checking Wikipedia REST summary for ${missingWiki.length} remaining enwiki articles...`,
  );
  await pool(missingWiki, CONCURRENCY, async ([qid, title]) => {
    const encoded = encodeURIComponent(title.replace(/ /g, "_"));
    const data = await getJsonUrl(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`,
    ).catch(() => null);
    if (data && data.type !== "disambiguation" && data.extract) {
      const summary = multiSentenceSummary(data.extract, 480);
      if (summary) extracts.set(qid, summary);
    }
  });
}
console.log(`Found ${extracts.size} English Wikipedia summaries`);

// Image fallback 1: enwiki pageimages for records lacking P18
const missingImgWiki = wikiEntries.filter(([qid]) => !imageNames.has(qid));
if (missingImgWiki.length) {
  await pool(chunks(missingImgWiki, BATCH), CONCURRENCY, async (batch) => {
    const data = await getJson(wikipediaUrl, {
      action: "query",
      prop: "pageimages",
      piprop: "name",
      redirects: 1,
      format: "json",
      titles: batch.map(([, title]) => title).join("|"),
    });
    const pageFor = pageLookup(data);
    for (const [qid, title] of batch) {
      const name = pageFor(title)?.pageimage;
      if (name && isUsableImageFilename(name) && isUsableCatImage(name)) {
        imageNames.set(qid, name);
      }
    }
  });
}

// Image fallback 2: Commons category P373 for records still lacking an image
const missingCatImg = [...categoryFallbacks.entries()].filter(([qid]) => !imageNames.has(qid));
if (missingCatImg.length) {
  await pool(missingCatImg, CONCURRENCY, async ([qid, cat]) => {
    const data = await getJson(commonsUrl, {
      action: "query",
      list: "categorymembers",
      cmtitle: `Category:${cat.replace(/^Category:/i, "")}`,
      cmtype: "file",
      cmlimit: 8,
      format: "json",
    }).catch(() => null);
    const hit = (data?.query?.categorymembers ?? [])
      .map((m) => m.title)
      .find((t) => t && isUsableCatImage(t));
    if (hit) imageNames.set(qid, hit.replace(/^File:/i, ""));
  });
}

// Resolve Commons imageinfo + extmetadata
const uniqueImages = [...new Set(imageNames.values())];
const imageInfo = new Map();
await pool(chunks(uniqueImages, BATCH), CONCURRENCY, async (batch) => {
  const data = await getJson(commonsUrl, {
    action: "query",
    titles: batch.map((name) => `File:${name.replace(/^File:/i, "")}`).join("|"),
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: 960,
    format: "json",
  });
  const pageFor = pageLookup(data);
  for (const name of batch) {
    const info = pageFor(`File:${name.replace(/^File:/i, "")}`)?.imageinfo?.[0];
    if (!info) continue;
    const url = info.thumburl || info.url;
    if (!url || !isUsableImageFilename(url.split("?")[0])) continue;
    const ext = info.extmetadata ?? {};
    const creator = cleanCreator(ext.Artist?.Value ?? ext.Artist?.value);
    const license = cleanText(ext.LicenseShortName?.Value ?? ext.LicenseShortName?.value) || null;
    const rawLicUrl = cleanText(ext.LicenseUrl?.Value ?? ext.LicenseUrl?.value);
    const licenseUrl = /^https?:\/\//i.test(rawLicUrl) ? rawLicUrl : null;
    const photoYear = parsePhotoYear(ext);
    const period =
      photoYear !== null && photoYear <= 1960
        ? "archival"
        : photoYear !== null && photoYear >= 1990
          ? "modern"
          : "unknown";
    const attributionText = buildAttribution(ext, creator, license);
    imageInfo.set(name, {
      url,
      creator,
      license,
      licenseUrl,
      attributionText,
      photoYear,
      period,
    });
  }
});
console.log(`Resolved ${imageInfo.size}/${uniqueImages.length} Commons images`);

// Build enriched entries
const usedSlugs = new Set();
const counts = {
  wikipedia: 0,
  wikidataDesc: 0,
  wikidataStructured: 0,
  countryFallback: 0,
  generic: 0,
};

const enriched = entries.map((entry, idx) => {
  const qid = entry.id.replace(/^e-unesco-/, "").toUpperCase();
  const entity = entities.get(qid);
  const title = pickEntityTitle(entity, entry.title, qid);
  const slug = makeUniqueSlug(title, qid, usedSlugs);

  // Location name from P131 (or P276) + P17
  const p17Labels = claimIds(entity, "P17", { excludeEnded: true }).map(refLabel).filter(Boolean);
  const p131Ids = claimIds(entity, "P131", { excludeEnded: true });
  const locIds = p131Ids.length ? p131Ids : claimIds(entity, "P276", { excludeEnded: true });
  const locLabels = locIds.map(refLabel).filter(Boolean);
  const locationParts = [];
  const seenLoc = new Set();
  for (const part of [...locLabels.slice(0, 2), ...p17Labels.slice(0, 1)]) {
    const key = part.toLowerCase();
    if (seenLoc.has(key)) continue;
    if (key === title.toLowerCase() && p17Labels.length > 0 && part !== p17Labels[0]) continue;
    seenLoc.add(key);
    locationParts.push(part);
  }
  const locationName = locationParts.length ? locationParts.join(", ") : null;

  // Dates from existing seed or P571/P580/P582
  let startYear = entry.startYear;
  if (startYear === null) {
    const p571 = claimValues(entity, "P571")[0] ?? claimValues(entity, "P580")[0];
    startYear = parseWikibaseYear(p571);
  }
  let endYear = entry.endYear;
  if (endYear === null) {
    const p582 = claimValues(entity, "P582")[0] ?? claimValues(entity, "P576")[0];
    const parsedEnd = parseWikibaseYear(p582);
    if (parsedEnd !== null && (startYear === null || parsedEnd >= startYear)) {
      endYear = parsedEnd;
    }
  }

  // Era from P2348 (time period) or explicit P31 historical/heritage classification
  const p2348Labels = claimIds(entity, "P2348").map(refLabel).filter(Boolean);
  const p31Labels = claimIds(entity, "P31").map(refLabel).filter(Boolean);
  const specificP31 = p31Labels.filter((l) => !SKIP_P31_LABELS.has(l.toLowerCase()));
  const heritageP31 = specificP31.filter((l) => ERA_P31_PATTERN.test(l));
  let era = null;
  if (p2348Labels.length) {
    const raw = p2348Labels.slice(0, 2).join(" / ");
    era = raw.charAt(0).toUpperCase() + raw.slice(1);
  } else if (heritageP31.length) {
    const raw = heritageP31[0];
    era = raw.charAt(0).toUpperCase() + raw.slice(1);
  }

  // Significance from P2614 (World Heritage criteria) or explicit P1435 / P757 / WHC001 heritage notes
  const p2614Ids = claimIds(entity, "P2614");
  const p1435Claims = (entity?.claims?.P1435 ?? []).filter((c) => c?.rank !== "deprecated");
  const whClaim = p1435Claims.find((c) => c?.mainsnak?.datavalue?.value?.id === "Q9259");
  const inscribedYear = parseWikibaseYear(whClaim?.qualifiers?.P580?.[0]?.datavalue?.value);
  const p757List = claimValues(entity, "P757").filter((v) => typeof v === "string");
  const p757Ref = p757List[0];
  const whcMatch = matchWhcRecord(whcMap, p757List);
  const officialUrl = claimValues(entity, "P856").find((v) => typeof v === "string") ?? null;
  const otherDesignations = claimIds(entity, "P1435")
    .filter((id) => id !== "Q9259" && id !== "Q43113623")
    .map(refLabel)
    .filter(Boolean);

  let significance = null;
  if (p2614Ids.length) {
    const labelsList = [];
    const descList = [];
    for (const cid of p2614Ids) {
      const cl = refLabel(cid);
      const cd = refDesc(cid)?.replace(/\s*\(UNESCO World Heritage List\)\s*$/i, "");
      if (cl) labelsList.push(cl);
      if (cd && descList.length < 2) descList.push(cd);
    }
    const metaParts = [];
    if (inscribedYear !== null) metaParts.push(`inscribed ${inscribedYear}`);
    if (p757Ref) metaParts.push(`ref. ${p757Ref}`);
    const metaSuffix = metaParts.length ? ` (${metaParts.join(", ")})` : "";
    if (labelsList.length) {
      significance = `UNESCO World Heritage criteria ${labelsList.join(", ")}${metaSuffix}${descList.length ? `: ${descList.join("; ")}.` : "."}`;
    }
  } else if (
    whcMatch?.record &&
    (whcMatch.record.justification_en || whcMatch.record.criteria_txt)
  ) {
    const just = multiSentenceSummary(whcMatch.record.justification_en ?? "", 320);
    const crit = cleanText(whcMatch.record.criteria_txt);
    const yr = cleanText(whcMatch.record.date_inscribed);
    significance = `UNESCO World Heritage${crit ? ` criteria ${crit}` : ""}${yr ? ` (inscribed ${yr})` : ""}${just ? `: ${just}` : "."}`;
  } else if (inscribedYear !== null || p757Ref || otherDesignations.length) {
    const parts = [];
    if (inscribedYear !== null || p757Ref) {
      const meta = [
        inscribedYear !== null ? `inscribed ${inscribedYear}` : null,
        p757Ref ? `ref. ${p757Ref}` : null,
      ]
        .filter(Boolean)
        .join(", ");
      parts.push(`UNESCO World Heritage Site (${meta})`);
    }
    if (otherDesignations.length) {
      parts.push(`Also designated: ${otherDesignations.slice(0, 2).join(", ")}`);
    }
    significance = `${parts.join(". ")}.`;
  }

  // Summary resolution
  const apiEnDesc = cleanText(entity?.descriptions?.en?.value);
  const seedSummary = cleanText(entry.summary);
  const usableEnDesc = !isGenericDescription(apiEnDesc)
    ? apiEnDesc
    : !isGenericDescription(seedSummary) && !isGeneratedFallback(seedSummary)
      ? seedSummary
      : null;

  const p361Labels = claimIds(entity, "P361").map(refLabel).filter(Boolean);
  const country = p17Labels[0] ?? null;

  let summary;
  const whcDesc =
    whcMatch?.exact && whcMatch.record.short_description_en
      ? multiSentenceSummary(whcMatch.record.short_description_en, 480)
      : null;
  if (extracts.has(qid)) {
    summary = extracts.get(qid);
    counts.wikipedia++;
  } else if (whcDesc) {
    summary = whcDesc;
    counts.wikidataDesc++;
  } else if (usableEnDesc && usableEnDesc.length >= 45) {
    summary = usableEnDesc.endsWith(".") ? usableEnDesc : `${usableEnDesc}.`;
    counts.wikidataDesc++;
  } else {
    // Construct a factual, non-fabricated summary from Wikidata claims
    const typeLabel = usableEnDesc || specificP31[0] || null;
    const fragments = [];
    if (typeLabel) {
      const capType = typeLabel.charAt(0).toUpperCase() + typeLabel.slice(1);
      fragments.push(locationName ? `${capType} in ${locationName}` : capType);
    } else if (locationName) {
      fragments.push(`Heritage property in ${locationName}`);
    }
    const parent = p361Labels.find((p) => p.toLowerCase() !== title.toLowerCase());
    if (parent && fragments.length) {
      fragments.push(`part of ${parent}`);
    }
    if (startYear !== null && fragments.length) {
      fragments.push(`dating from ${formatYearPlain(startYear)}`);
    }
    if (fragments.length) {
      const whTag = inscribedYear
        ? `designated as a UNESCO World Heritage Site in ${inscribedYear}`
        : "designated as a UNESCO World Heritage Site";
      summary = `${fragments.join(", ")}, ${whTag}.`;
      counts.wikidataStructured++;
    } else if (country) {
      summary = `UNESCO World Heritage Site in ${country}.`;
      counts.countryFallback++;
    } else {
      summary = "UNESCO World Heritage Site recorded in Wikidata.";
      counts.generic++;
    }
  }

  const enrichedEntry = {
    ...entry,
    title,
    slug,
    era,
    startYear,
    endYear,
    locationName,
    summary,
    significance,
  };

  const enwikiTitle = enwikiTitles.get(qid) ?? null;
  const entrySources = buildEntrySources({
    qid,
    title,
    enwikiTitle,
    whcMatch,
    officialUrl,
  });

  const filename = imageNames.get(qid);
  const image = filename ? imageInfo.get(filename) : undefined;
  return {
    entry: enrichedEntry,
    sources: entrySources,
    filename,
    image,
    wikidataUrl: `https://www.wikidata.org/wiki/${qid}`,
  };
});

const media = enriched.map(({ entry, filename, image, wikidataUrl }) => {
  const base = {
    id: `m-${entry.id.replace(/^e-/, "")}`,
    entryId: entry.id,
    comparisonGroup: null,
  };
  if (image) {
    return {
      ...base,
      imageUrl: image.url,
      sourceUrl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(filename)}`,
      caption: `Wikidata image: ${entry.title}`,
      period: image.period,
      photoYear: image.photoYear,
      creator: image.creator,
      license: image.license,
      licenseUrl: image.licenseUrl,
      attributionText: image.attributionText,
    };
  }
  return {
    ...base,
    imageUrl: "/evidence-placeholder.svg",
    sourceUrl: wikidataUrl,
    caption: "No image recorded — source record only",
    period: "unknown",
    photoYear: null,
    creator: null,
    license: null,
    licenseUrl: null,
    attributionText: null,
  };
});

const seedHeader = `// Generated from the Wikidata World Heritage Site query in scripts/fetch-unesco.mjs.
// Unreviewed drafts: labels, descriptions, inception years, and coordinates come from Wikidata.
// Titles, summaries, locationName, era, significance, and media were enriched by scripts/enrich-unesco.mjs.

import type { HistoricalEntry, SourceRef } from "../types/atlas";

`;
await writeFile(
  seedPath,
  `${seedHeader}export const unescoEntries: HistoricalEntry[] = ${JSON.stringify(enriched.map((item) => item.entry))};

export const unescoSources: SourceRef[] = ${JSON.stringify(enriched.flatMap((item) => item.sources))};
`,
  "utf8",
);
await writeFile(
  mediaPath,
  `// Generated by scripts/enrich-unesco.mjs from Wikidata and Wikimedia Commons.
// Entries without a Commons image get an evidence placeholder, never an invented picture.

import type { MediaItem } from "../types/atlas";

export const unescoMedia: MediaItem[] = ${JSON.stringify(media)};
`,
  "utf8",
);
await writeFile(placeholderPath, placeholderSvg, "utf8");

const sample = media.filter((item) => item.imageUrl.startsWith("https://")).slice(0, 5);
const checks = await Promise.allSettled(
  sample.map(async (item) => {
    const response = await fetch(item.imageUrl, {
      method: "HEAD",
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(30_000),
    });
    return response.status;
  }),
);
const ok = checks.filter((result) => result.status === "fulfilled" && result.value === 200).length;

const rawQidTitles = enriched.filter(({ entry }) => /^Q\d+$/.test(entry.title)).length;
const invalidSlugs = enriched.filter(
  ({ entry }) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(entry.slug),
).length;
const withLocation = enriched.filter(({ entry }) => entry.locationName).length;
const withEra = enriched.filter(({ entry }) => entry.era).length;
const withSignificance = enriched.filter(({ entry }) => entry.significance).length;
const imageCount = media.filter((item) => item.imageUrl !== "/evidence-placeholder.svg").length;
const archivalCount = media.filter((item) => item.period === "archival").length;
const modernCount = media.filter((item) => item.period === "modern").length;

console.log(`Wrote ${enriched.length} entries to src/data/unescoSeed.ts`);
console.log(
  `Wrote ${media.length} MediaItems to src/data/unescoMedia.ts and public/evidence-placeholder.svg`,
);
console.log(`Raw Q-ID titles remaining: ${rawQidTitles}, invalid slugs: ${invalidSlugs}`);
console.log(
  `Metadata coverage: locationName ${withLocation}/${enriched.length}, era ${withEra}/${enriched.length}, significance ${withSignificance}/${enriched.length}`,
);
console.log(
  `Summaries: Wikipedia ${counts.wikipedia}, Wikidata desc ${counts.wikidataDesc}, Wikidata structured ${counts.wikidataStructured}, country fallback ${counts.countryFallback}, generic fallback ${counts.generic}`,
);
console.log(
  `Images: ${imageCount}, placeholders: ${media.length - imageCount}, periods: archival=${archivalCount}, modern=${modernCount}, unknown=${media.length - archivalCount - modernCount}`,
);
console.log(
  `Commons metadata: ${media.filter((item) => item.creator).length} creators, ${media.filter((item) => item.license).length} licenses, ${media.filter((item) => item.photoYear !== null).length} photoYears`,
);
console.log(`Image URL spot-check: ${ok}/${sample.length} HTTP 200`);
