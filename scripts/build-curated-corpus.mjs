// Builds and verifies the curated starter corpus (src/data/seed.ts) and
// idempotent Supabase seed script (supabase/seed.sql) from multiple live public
// heritage, museum, archival, and knowledge-base sources:
// - UNESCO World Heritage Centre Open Data API (data.unesco.org whc001)
// - National Museum of the Philippines REST API (nationalmuseum.gov.ph/wp-json)
// - Musée du Louvre Collections Open JSON API (collections.louvre.fr)
// - Wikidata API (www.wikidata.org/w/api.php)
// - English Wikivoyage API (en.wikivoyage.org/w/api.php)
// - English Wikipedia API (en.wikipedia.org/w/api.php)
// - Wikimedia Commons API (commons.wikimedia.org/w/api.php)
// - Verified official heritage/library/museum institutional endpoints
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const seedPath = path.join(root, "src/data/seed.ts");
const sqlPath = path.join(root, "supabase/seed.sql");

const UA =
  "ChronoAtlasDataBuilder/0.3 (https://github.com/chronoatlas/chronoatlas; educational-historical-atlas) node";
const WHC_API = "https://data.unesco.org/api/explore/v2.1/catalog/datasets/whc001/records";
const NMP_API = "https://www.nationalmuseum.gov.ph/wp-json/wp/v2";
const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
const WIKIVOYAGE_API = "https://en.wikivoyage.org/w/api.php";
const WIKI_API = "https://en.wikipedia.org/w/api.php";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const ACCESSED_AT = "2026-11-25";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const stripHiddenHtml = (value) =>
  String(value ?? "")
    .replace(/<(div|span)\b[^>]*display\s*:\s*none[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");

const cleanText = (value) =>
  stripHiddenHtml(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#8211;|&ndash;/g, "–")
    .replace(/&#8212;|&mdash;/g, "—")
    .replace(/&#8217;|&#0?39;|&rsquo;/g, "'")
    .replace(/&#8220;|&#8221;|&ldquo;|&rdquo;|&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

const cleanCreator = (value) => {
  const text = cleanText(value);
  if (!text) return null;
  if (/^(.{4,})\1$/.test(text)) return text.slice(0, text.length / 2).trim();
  if (text.toLowerCase() === "unknown authorunknown author") return "Unknown author";
  return text;
};

async function getJsonUrl(url) {
  let lastError;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(45_000),
      });
      if (response.status === 429 || response.status >= 500) {
        const retry = Number(response.headers.get("retry-after"));
        const delay = retry > 0 ? retry * 1000 : 2000 * 2 ** attempt;
        await response.arrayBuffer().catch(() => {});
        await sleep(delay);
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return JSON.parse(await response.text());
    } catch (error) {
      lastError = error;
      await sleep(1500 * 2 ** attempt);
    }
  }
  throw new Error(`${url}: ${lastError?.message ?? lastError}`);
}

async function getJson(base, params) {
  return getJsonUrl(`${base}?${new URLSearchParams({ ...params, format: "json" })}`);
}

const sentenceSegmenter = new Intl.Segmenter("en", { granularity: "sentence" });

function multiSentenceSummary(extract, maxChars = 440) {
  if (!extract) return null;
  const paragraphs = String(extract)
    .split(/\n\s*\n/)
    .map((p) =>
      cleanText(p)
        .replace(/\[\d+\]|\[note \d+\]/gi, "")
        .replace(/\(\s*[;,]\s*/g, "(")
        .replace(/\(\s+/g, "(")
        .replace(/\s+\)/g, ")")
        .replace(/\(\s*\)/g, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
  if (!paragraphs.length) return null;
  const combined = paragraphs.slice(0, 2).join(" ");
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
  return `${(lastSpace > 80 ? head.slice(0, lastSpace) : head).trimEnd()}…`;
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

// 55 curated entries with verified Wikidata QIDs, optional UNESCO WHC IDs,
// National Museum PH / Louvre / institutional records, and archival+modern Commons pairs.
// Astronomical year numbering: 500 BCE = -499, 1 BCE = 0, 1 CE = 1, null = unknown.
const SPECS = [
  {
    id: "e-intramuros",
    title: "Intramuros",
    slug: "intramuros",
    qid: "Q772211",
    scope: "local",
    entryType: "place",
    era: "Spanish colonial",
    startYear: 1571,
    endYear: null,
    dateIsApproximate: false,
    locationName: "Manila, Metro Manila",
    significance: "Administrative and religious centre of Spanish Manila.",
    origin: { latitude: 14.5939, longitude: 120.9736 },
    originPrecision: "area_centroid",
    originSource: "https://intramuros.gov.ph/",
    wikiTitle: "Intramuros",
    wikivoyageTitle: "Manila/Intramuros",
    extraSources: [
      {
        title: "Intramuros Administration Official Portal",
        url: "https://intramuros.gov.ph/",
        publisher: "Intramuros Administration",
        sourceType: "official site",
      },
    ],
    media: [
      {
        id: "m-intramuros",
        file: "Baluartillo_de_San_José,_Manila,_Filipinas,_2023-08-26,_DD_41.jpg",
        caption: "Baluartillo de San José, Intramuros, Manila (2023).",
        comparisonGroup: "intramuros-compare",
        periodOverride: "modern",
      },
      {
        id: "m-intramuros-archival",
        file: "Manila_Walled_City_Destruction_May_1945.jpg",
        caption: "Intramuros historic core after the 1945 Battle of Manila.",
        comparisonGroup: "intramuros-compare",
        periodOverride: "archival",
      },
    ],
  },
  {
    id: "e-fort-santiago",
    title: "Fort Santiago",
    slug: "fort-santiago",
    qid: "Q478181",
    scope: "local",
    entryType: "place",
    era: "Spanish colonial",
    startYear: 1571,
    endYear: null,
    dateIsApproximate: false,
    locationName: "Intramuros, Manila",
    significance:
      "Defensive citadel at the mouth of the Pasig River where José Rizal was imprisoned before his 1896 execution.",
    origin: { latitude: 14.5956, longitude: 120.9716 },
    originPrecision: "approximate",
    originSource: "https://www.wikidata.org/wiki/Q478181",
    wikiTitle: "Fort Santiago",
    wikivoyageTitle: "Manila/Intramuros",
    extraSources: [
      {
        title: "Intramuros Administration: Fort Santiago District",
        url: "https://intramuros.gov.ph/",
        publisher: "Intramuros Administration",
        sourceType: "official site",
      },
    ],
    media: [
      {
        id: "m-fort-santiago",
        file: "Fort_Santiago,_Intramuros.JPG",
        caption: "Gate of Fort Santiago, Intramuros, Manila (2012).",
        comparisonGroup: "fort-santiago-compare",
        periodOverride: "modern",
      },
      {
        id: "m-fort-santiago-archival",
        file: "Fort_Santiago_1880_gate.jpg",
        caption: "Gate of Fort Santiago in Intramuros, photographed in 1880.",
        comparisonGroup: "fort-santiago-compare",
        periodOverride: "archival",
      },
    ],
  },
  {
    id: "e-san-agustin",
    title: "San Agustin Church",
    slug: "san-agustin-church",
    qid: "Q1306513",
    whcId: "677",
    preferWhcSummary: false,
    scope: "local",
    entryType: "place",
    era: "Spanish colonial",
    startYear: 1607,
    endYear: null,
    dateIsApproximate: false,
    locationName: "Intramuros, Manila",
    significance:
      "Oldest stone church in the Philippines and part of the Baroque Churches of the Philippines UNESCO World Heritage Site.",
    origin: { latitude: 14.5934, longitude: 120.9722 },
    originPrecision: "approximate",
    originSource: "https://data.unesco.org/explore/dataset/whc001/?q=677",
    wikiTitle: "San Agustin Church (Manila)",
    extraSources: [
      {
        title: "San Agustin Church Official Website",
        url: "http://sanagustinchurch.org/",
        publisher: "San Agustin Parish, Intramuros",
        sourceType: "official site",
      },
    ],
    media: [
      {
        id: "m-san-agustin",
        file: "San_Agustin_Church,_Manila,_A_Unesco_World_Heritage_Site.jpg",
        caption: "Facade of San Agustin Church, Intramuros, Manila (2015).",
        comparisonGroup: "san-agustin-compare",
        periodOverride: "modern",
      },
      {
        id: "m-san-agustin-archival",
        file: "Manila_Walled_City_Destruction_May_1945.jpg",
        caption: "San Agustin Church standing intact amid the ruins of Intramuros in May 1945.",
        comparisonGroup: "san-agustin-compare",
        periodOverride: "archival",
      },
    ],
  },
  {
    id: "e-manila-cathedral",
    title: "Manila Cathedral",
    slug: "manila-cathedral",
    qid: "Q773443",
    scope: "local",
    entryType: "place",
    era: "Spanish colonial / Postwar",
    startYear: 1571,
    endYear: null,
    dateIsApproximate: false,
    locationName: "Intramuros, Manila",
    significance:
      "Seat of the Roman Catholic Archdiocese of Manila, rebuilt multiple times after earthquakes and World War II.",
    origin: { latitude: 14.5915, longitude: 120.9736 },
    originPrecision: "exact",
    originSource: "https://www.wikidata.org/wiki/Q773443",
    wikiTitle: "Manila Cathedral",
    extraSources: [
      {
        title: "The Manila Cathedral Official Website",
        url: "https://manilacathedral.com.ph/",
        publisher: "Minor Basilica of the Immaculate Conception",
        sourceType: "official site",
      },
    ],
    media: [
      {
        id: "m-manila-cathedral",
        file: "Catedral_de_la_Inmaculada_Concepción,_Manila,_Filipinas,_2023-08-26,_DD_21.jpg",
        caption: "Manila Cathedral facade on Plaza de Roma, Intramuros (2023).",
        comparisonGroup: "manila-cathedral-compare",
        periodOverride: "modern",
      },
      {
        id: "m-manila-cathedral-archival",
        file: "Manila_Cathedral_before_the_1880_earthquake.jpg",
        caption: "Manila Cathedral prior to the July 1880 Luzon earthquakes.",
        comparisonGroup: "manila-cathedral-compare",
        periodOverride: "archival",
      },
    ],
  },
  {
    id: "e-rizal-park",
    title: "Rizal Park",
    slug: "rizal-park",
    qid: "Q2306339",
    scope: "local",
    entryType: "place",
    era: "Spanish colonial / American period",
    startYear: 1820,
    endYear: null,
    dateIsApproximate: true,
    locationName: "Ermita, Manila",
    significance:
      "Historic Bagumbayan field where José Rizal was executed in 1896 and Philippine independence was proclaimed in 1946.",
    origin: { latitude: 14.5825, longitude: 120.9783 },
    originPrecision: "area_centroid",
    originSource: "http://www.nationalparks.ph/",
    wikiTitle: "Rizal Park",
    wikivoyageTitle: "Manila/Ermita-Malate",
    extraSources: [
      {
        title: "National Parks Development Committee: Rizal Park",
        url: "http://www.nationalparks.ph/",
        publisher: "National Parks Development Committee (Philippines)",
        sourceType: "government heritage agency",
      },
    ],
    media: [
      {
        id: "m-rizal-park",
        file: "Rizal_Monument_(Manila,_2024).jpg",
        caption: "Rizal Monument in Rizal Park (Luneta), Manila (2024).",
        comparisonGroup: "rizal-park-compare",
        periodOverride: "modern",
      },
      {
        id: "m-rizal-park-archival",
        file: "Rizal_park_1930_PG.jpg",
        caption: "Archival photograph of Rizal Monument and Luneta, Manila (1922).",
        comparisonGroup: "rizal-park-compare",
        periodOverride: "archival",
      },
    ],
  },
  {
    id: "e-malacanang-palace",
    title: "Malacañang Palace",
    slug: "malacanang-palace",
    qid: "Q942688",
    scope: "local",
    entryType: "place",
    era: "Spanish colonial / Republic",
    startYear: 1750,
    endYear: null,
    dateIsApproximate: true,
    locationName: "San Miguel, Manila",
    significance:
      "Official residence and principal workplace of the President of the Philippines since 1935, and earlier seat of colonial governors.",
    origin: { latitude: 14.5939, longitude: 120.9945 },
    originPrecision: "exact",
    originSource: "https://www.wikidata.org/wiki/Q942688",
    wikiTitle: "Malacañang Palace",
    media: [
      {
        id: "m-malacanang-palace",
        file: "FvfMalacanangManila0087_31.JPG",
        caption: "Malacañang Palace facade in San Miguel, Manila (2014).",
        comparisonGroup: "malacanang-compare",
        periodOverride: "modern",
      },
      {
        id: "m-malacanang-palace-archival",
        file: "Malacanang_Palace_1898.jpg",
        caption: "Malacañang Palace along the Pasig River, photographed in 1898.",
        comparisonGroup: "malacanang-compare",
        periodOverride: "archival",
      },
    ],
  },
  {
    id: "e-ust",
    title: "University of Santo Tomas",
    slug: "university-of-santo-tomas",
    qid: "Q1401524",
    scope: "local",
    entryType: "place",
    era: "Spanish colonial",
    startYear: 1611,
    endYear: null,
    dateIsApproximate: false,
    locationName: "Sampaloc, Manila",
    significance:
      "Founded in 1611, the oldest extant university charter in Asia; its Sampaloc campus also served as an internment camp during World War II.",
    origin: { latitude: 14.6097, longitude: 120.9897 },
    originPrecision: "area_centroid",
    originSource: "https://www.ust.edu.ph/",
    wikiTitle: "University of Santo Tomas",
    extraSources: [
      {
        title: "University of Santo Tomas Official Website",
        url: "https://www.ust.edu.ph/",
        publisher: "University of Santo Tomas",
        sourceType: "official site",
      },
    ],
    media: [
      {
        id: "m-ust",
        file: "University_of_Santo_Tomas_Main_Building_front_(España_Boulevard,_Sampaloc,_Manila;_12-18-2023).jpg",
        caption: "University of Santo Tomas Main Building in Sampaloc, Manila (2023).",
        comparisonGroup: "ust-compare",
        periodOverride: "modern",
      },
      {
        id: "m-ust-archival",
        file: "Santo_Tomas_Internment_Camp_Liberation_.jpg",
        caption:
          "Liberation of the Santo Tomas Internment Camp at the University of Santo Tomas, February 1945.",
        comparisonGroup: "ust-compare",
        periodOverride: "archival",
      },
    ],
  },
  {
    id: "e-quiapo-church",
    title: "Quiapo Church",
    slug: "quiapo-church",
    qid: "Q1899439",
    scope: "local",
    entryType: "place",
    era: "Spanish colonial",
    startYear: 1588,
    endYear: null,
    dateIsApproximate: true,
    locationName: "Quiapo, Manila",
    significance:
      "Minor Basilica and National Shrine housing the Jesús Nazareno (Black Nazarene), central to annual Manila devotional processions.",
    origin: { latitude: 14.5988, longitude: 120.9838 },
    originPrecision: "exact",
    originSource: "https://www.wikidata.org/wiki/Q1899439",
    wikiTitle: "Quiapo Church",
    extraSources: [
      {
        title: "Quiapo Church Official Website",
        url: "https://quiapochurch.com.ph/",
        publisher: "Minor Basilica and National Shrine of Jesus Nazareno",
        sourceType: "official site",
      },
    ],
    media: [
      {
        id: "m-quiapo-church",
        file: "StJohnTheBaptistParishQuiapo.jpg",
        caption: "Minor Basilica of the Black Nazarene (Quiapo Church), Manila.",
        comparisonGroup: null,
      },
    ],
  },
  {
    id: "e-binondo",
    title: "Binondo",
    slug: "binondo",
    qid: "Q1903520",
    scope: "local",
    entryType: "place",
    era: "Spanish colonial",
    startYear: 1594,
    endYear: null,
    dateIsApproximate: false,
    locationName: "Binondo, Manila",
    significance:
      "Established in 1594 across the Pasig River from Intramuros; recognized as the oldest Chinatown in the world.",
    origin: { latitude: 14.6, longitude: 120.967 },
    originPrecision: "area_centroid",
    originSource: "https://www.wikidata.org/wiki/Q1903520",
    wikiTitle: "Binondo",
    wikivoyageTitle: "Manila/Binondo",
    media: [
      {
        id: "m-binondo",
        file: "Binondo_Skyline_and_Mapua_University,_Manila,_May_2025.jpg",
        caption: "Historic Binondo district across the Pasig River, Manila (2025).",
        comparisonGroup: null,
      },
    ],
  },
  {
    id: "e-corregidor",
    title: "Corregidor Island",
    slug: "corregidor-island",
    qid: "Q928075",
    scope: "local",
    entryType: "place",
    era: "Spanish colonial / World War II",
    startYear: null,
    endYear: null,
    dateIsApproximate: false,
    locationName: "Manila Bay, Cavite",
    significance:
      "Strategic fortified island guarding Manila Bay and site of the 1942 Battle of Corregidor.",
    origin: { latitude: 14.3856, longitude: 120.5731 },
    originPrecision: "area_centroid",
    originSource: "https://www.wikidata.org/wiki/Q928075",
    wikiTitle: "Corregidor",
    wikivoyageTitle: "Corregidor",
    media: [
      {
        id: "m-corregidor",
        file: "Corregidor_island_from_air_(Cavite_City;_04-29-2024).jpg",
        caption: "Aerial view of Corregidor Island at the entrance of Manila Bay (2024).",
        comparisonGroup: "corregidor-compare",
        periodOverride: "modern",
      },
      {
        id: "m-corregidor-archival",
        file: "Malinta_Tunnel_Surrender,_Corregidor_Island_(1942).jpeg",
        caption: "Surrender at Malinta Tunnel, Corregidor Island, May 1942.",
        comparisonGroup: "corregidor-compare",
        periodOverride: "archival",
      },
    ],
  },
  {
    id: "e-barasoain-church",
    title: "Barasoain Church",
    slug: "barasoain-church",
    qid: "Q4858463",
    scope: "local",
    entryType: "place",
    era: "Philippine Revolution",
    startYear: 1888,
    endYear: null,
    dateIsApproximate: false,
    locationName: "Malolos, Bulacan",
    significance:
      "Site of the 1898 Malolos Congress, drafting of the Malolos Constitution, and inauguration of the First Philippine Republic in 1899.",
    origin: { latitude: 14.8464, longitude: 120.8123 },
    originPrecision: "exact",
    originSource: "https://www.wikidata.org/wiki/Q4858463",
    wikiTitle: "Barasoain Church",
    wikivoyageTitle: "Malolos",
    media: [
      {
        id: "m-barasoain-church",
        file: "Barasoain_Church_2023.jpg",
        caption: "Facade of Barasoain Church, Malolos, Bulacan (2023).",
        comparisonGroup: "barasoain-compare",
        periodOverride: "modern",
      },
      {
        id: "m-barasoain-church-archival",
        file: "Malolos_congress.jpg",
        caption: "Session of the Malolos Congress inside Barasoain Church, 1898.",
        comparisonGroup: "barasoain-compare",
        periodOverride: "archival",
      },
    ],
  },
  {
    id: "e-vigan",
    title: "Historic City of Vigan",
    slug: "historic-city-of-vigan",
    qid: "Q235004",
    whcId: "502",
    preferWhcSummary: true,
    scope: "local",
    entryType: "place",
    era: "Spanish colonial",
    startYear: 1572,
    endYear: null,
    dateIsApproximate: false,
    locationName: "Vigan, Ilocos Sur",
    significance:
      "UNESCO World Heritage Site preserving an intact 16th-century Spanish colonial town plan blending Asian and European building traditions.",
    origin: { latitude: 17.5747, longitude: 120.3869 },
    originPrecision: "area_centroid",
    originSource: "https://data.unesco.org/explore/dataset/whc001/?q=502",
    wikiTitle: "Vigan",
    wikivoyageTitle: "Vigan",
    extraSources: [
      {
        title: "City Government of Vigan Official Website",
        url: "https://www.vigancity.gov.ph/",
        publisher: "City Government of Vigan",
        sourceType: "official site",
      },
    ],
    media: [
      {
        id: "m-vigan",
        file: "Vigan_Calle_Crisologo.jpg",
        caption: "Calle Crisologo in the Historic City of Vigan, Ilocos Sur (2012).",
        comparisonGroup: null,
      },
    ],
  },
  {
    id: "e-paoay-church",
    title: "Paoay Church",
    slug: "paoay-church",
    qid: "Q2796994",
    whcId: "677",
    preferWhcSummary: false,
    scope: "local",
    entryType: "place",
    era: "Spanish colonial",
    startYear: 1710,
    endYear: null,
    dateIsApproximate: false,
    locationName: "Paoay, Ilocos Norte",
    significance:
      "Earthquake Baroque church completed in 1710 with massive coral-stone buttresses; part of the Baroque Churches of the Philippines UNESCO site.",
    origin: { latitude: 18.0615, longitude: 120.5216 },
    originPrecision: "exact",
    originSource: "https://data.unesco.org/explore/dataset/whc001/?q=677",
    wikiTitle: "Paoay Church",
    wikivoyageTitle: "Ilocos Norte",
    media: [
      {
        id: "m-paoay-church",
        file: "Paoay_Church_and_Bell_Tower.jpg",
        caption: "Saint Augustine Parish Church (Paoay Church) and bell tower, Ilocos Norte.",
        comparisonGroup: null,
      },
    ],
  },
  {
    id: "e-miagao-church",
    title: "Miagao Church",
    slug: "miagao-church",
    qid: "Q2660525",
    whcId: "677",
    preferWhcSummary: false,
    scope: "local",
    entryType: "place",
    era: "Spanish colonial",
    startYear: 1787,
    endYear: 1797,
    dateIsApproximate: true,
    locationName: "Miagao, Iloilo",
    significance:
      "Fortress-Baroque church carved from yellowish-ochre sandstone with indigenous botanical relief; part of the Baroque Churches of the Philippines UNESCO site.",
    origin: { latitude: 10.6419, longitude: 122.2355 },
    originPrecision: "exact",
    originSource: "https://data.unesco.org/explore/dataset/whc001/?q=677",
    wikiTitle: "Miagao Church",
    media: [
      {
        id: "m-miagao-church",
        file: "Miagao_Church_(Iloilo-Antique_Road,_Miagao,_Iloilo;_04-05-2024).jpg",
        caption: "Miagao Church facade in Miagao, Iloilo (2024).",
        comparisonGroup: null,
      },
    ],
  },
  {
    id: "e-banaue",
    title: "Banaue Rice Terraces",
    slug: "banaue-rice-terraces",
    qid: "Q826551",
    whcId: "722",
    preferWhcSummary: false,
    scope: "local",
    entryType: "place",
    era: "Precolonial",
    startYear: null,
    endYear: null,
    dateIsApproximate: false,
    locationName: "Banaue, Ifugao",
    significance:
      "A living agricultural landscape in the Cordillera mountains of Ifugao, including the neighboring Batad and Bangaan terrace clusters.",
    origin: { latitude: 16.9333, longitude: 121.0667 },
    originPrecision: "area_centroid",
    originSource: "https://data.unesco.org/explore/dataset/whc001/?q=722",
    wikiTitle: "Banaue Rice Terraces",
    wikivoyageTitle: "Banaue",
    media: [
      {
        id: "m-banaue",
        file: "Banaue-terrace.JPG",
        caption: "Mountain rice terraces at Banaue, Ifugao.",
        comparisonGroup: null,
      },
    ],
  },
  {
    id: "e-tabon-caves",
    title: "Tabon Caves",
    slug: "tabon-caves",
    qid: "Q477329",
    scope: "local",
    entryType: "place",
    era: "Prehistoric / Paleolithic to Metal Age",
    startYear: null,
    endYear: null,
    dateIsApproximate: true,
    locationName: "Quezon, Palawan",
    significance:
      "Archaeological cave complex at Lipuun Point yielding Upper Paleolithic Tabon Man fossils and the Neolithic Manunggul burial jar.",
    origin: { latitude: 9.2799, longitude: 117.9814 },
    originPrecision: "exact",
    originSource:
      "https://www.nationalmuseum.gov.ph/our-museums/regional-area-and-site-museums/tabon-cave-complex/",
    wikiTitle: "Tabon Caves",
    nmpPageSlug: "tabon-cave-complex",
    media: [
      {
        id: "m-tabon-caves",
        file: "TabonCaves.JPG",
        caption: "Limestone cliff and entrance to the Tabon Caves complex, Lipuun Point, Palawan.",
        comparisonGroup: null,
      },
    ],
  },
  {
    id: "e-chocolate-hills",
    title: "Chocolate Hills",
    slug: "chocolate-hills",
    qid: "Q977422",
    scope: "local",
    entryType: "place",
    era: "Natural heritage",
    startYear: null,
    endYear: null,
    dateIsApproximate: false,
    locationName: "Carmen, Bohol",
    significance:
      "National Geological Monument of more than 1,260 conical karst limestone hills across central Bohol.",
    origin: { latitude: 9.9167, longitude: 124.1667 },
    originPrecision: "area_centroid",
    originSource: "https://www.wikidata.org/wiki/Q977422",
    wikiTitle: "Chocolate Hills",
    wikivoyageTitle: "Bohol",
    media: [
      {
        id: "m-chocolate-hills",
        file: "Chocolate_Hills_Bohol.JPG",
        caption: "Conical karst mounds of the Chocolate Hills in Bohol.",
        comparisonGroup: null,
      },
    ],
  },
  {
    id: "e-magellans-cross",
    title: "Magellan's Cross Pavilion",
    slug: "magellans-cross-pavilion",
    qid: "Q107462441",
    scope: "local",
    entryType: "place",
    era: "Early colonial",
    startYear: 1521,
    endYear: null,
    dateIsApproximate: false,
    locationName: "Cebu City, Cebu",
    significance: "Marks the 1521 arrival of the Magellan expedition in Cebu.",
    origin: { latitude: 10.2935, longitude: 123.902 },
    originPrecision: "exact",
    originSource: "https://www.wikidata.org/wiki/Q107462441",
    wikiTitle: "Magellan's Cross",
    wikivoyageTitle: "Cebu City",
    media: [
      {
        id: "m-magellans-cross",
        file: "Magellan's_Cross_2024-07-05.jpg",
        caption: "Magellan's Cross pavilion on Plaza Sugbo, Cebu City (2024).",
        comparisonGroup: null,
      },
    ],
  },
  {
    id: "e-basilica-santo-nino",
    title: "Basilica del Santo Niño",
    slug: "basilica-del-santo-nino",
    qid: "Q666552",
    scope: "local",
    entryType: "place",
    era: "Spanish colonial",
    startYear: 1565,
    endYear: null,
    dateIsApproximate: false,
    locationName: "Cebu City, Cebu",
    significance:
      "Oldest Roman Catholic church in the Philippines, founded in 1565 where the image of the Santo Niño de Cebú was rediscovered.",
    origin: { latitude: 10.2939, longitude: 123.9014 },
    originPrecision: "exact",
    originSource: "https://www.wikidata.org/wiki/Q666552",
    wikiTitle: "Basilica del Santo Niño",
    wikivoyageTitle: "Cebu City",
    media: [
      {
        id: "m-basilica-santo-nino",
        file: "Basilica_del_Santo_Niño_2024-07-05.jpg",
        caption: "Basilica Minore del Santo Niño de Cebú, Cebu City (2024).",
        comparisonGroup: null,
      },
    ],
  },
  {
    id: "e-fort-san-pedro",
    title: "Fort San Pedro",
    slug: "fort-san-pedro",
    qid: "Q1472845",
    scope: "local",
    entryType: "place",
    era: "Spanish colonial",
    startYear: 1565,
    endYear: null,
    dateIsApproximate: false,
    locationName: "Cebu City, Cebu",
    significance:
      "Oldest triangular bastion fort in the Philippines, originally founded in 1565 under Miguel López de Legazpi and rebuilt in stone in 1738.",
    origin: { latitude: 10.2922, longitude: 123.9058 },
    originPrecision: "exact",
    originSource: "https://www.wikidata.org/wiki/Q1472845",
    wikiTitle: "Fort San Pedro",
    wikivoyageTitle: "Cebu City",
    media: [
      {
        id: "m-fort-san-pedro",
        file: "Fort_San_Pedro,_Cebu-City_(49063919082).jpg",
        caption: "Bastion and courtyard of Fort San Pedro, Cebu City.",
        comparisonGroup: null,
      },
    ],
  },
  {
    id: "e-aguinaldo-shrine",
    title: "Aguinaldo Shrine",
    slug: "aguinaldo-shrine",
    qid: "Q3550173",
    scope: "local",
    entryType: "place",
    era: "Philippine Revolution",
    startYear: 1898,
    endYear: null,
    dateIsApproximate: false,
    locationName: "Kawit, Cavite",
    significance:
      "Ancestral house of Emilio Aguinaldo where Philippine Independence from Spain was proclaimed on June 12, 1898.",
    origin: { latitude: 14.445, longitude: 120.9069 },
    originPrecision: "exact",
    originSource: "https://www.wikidata.org/wiki/Q3550173",
    wikiTitle: "Aguinaldo Shrine",
    wikivoyageTitle: "Kawit",
    media: [
      {
        id: "m-aguinaldo-shrine",
        file: "AguinaldoShrinejf0944_13.JPG",
        caption: "Emilio Aguinaldo Shrine in Kawit, Cavite.",
        comparisonGroup: null,
      },
    ],
  },
  {
    id: "e-rizal-shrine-dapitan",
    title: "Rizal Shrine (Dapitan)",
    slug: "rizal-shrine-dapitan",
    qid: "Q1704121",
    scope: "local",
    entryType: "place",
    era: "Late Spanish colonial",
    startYear: 1892,
    endYear: 1896,
    dateIsApproximate: false,
    locationName: "Dapitan, Zamboanga del Norte",
    significance:
      "Estate in Talisay where José Rizal lived in exile from 1892 to 1896, establishing a school, clinic, and waterworks.",
    origin: { latitude: 8.6672, longitude: 123.4167 },
    originPrecision: "exact",
    originSource: "https://www.wikidata.org/wiki/Q1704121",
    wikiTitle: "José Rizal Memorial Protected Landscape",
    wikivoyageTitle: "Dapitan",
    media: [
      {
        id: "m-rizal-shrine-dapitan",
        file: "Jose_Rizal_Shrine,_Dapitan,_Zamboanga_del_Norte.JPG",
        caption: "Reconstructed house at the Rizal Shrine in Dapitan, Zamboanga del Norte.",
        comparisonGroup: null,
      },
    ],
  },
  {
    id: "e-national-museum",
    title: "National Museum of Fine Arts",
    slug: "national-museum-of-fine-arts",
    qid: "Q123815605",
    scope: "local",
    entryType: "place",
    era: "American period / 20th century",
    startYear: 1926,
    endYear: null,
    dateIsApproximate: false,
    locationName: "Ermita, Manila",
    significance:
      "Neoclassical former Legislative Building (completed 1926) now housing Juan Luna's Spoliarium and Philippine fine arts.",
    origin: { latitude: 14.5869, longitude: 120.9812 },
    originPrecision: "exact",
    originSource: "https://www.nationalmuseum.gov.ph/our-museums/national-museum-of-fine-arts/",
    wikiTitle: "National Museum of Fine Arts (Manila)",
    nmpPageSlug: "national-museum-of-fine-arts",
    preferNmpSummary: true,
    media: [
      {
        id: "m-national-museum",
        file: "04762jfNational_Museum_of_the_Philippines_Ermita_Manilafvf_07.jpg",
        caption: "National Museum of Fine Arts building in Ermita, Manila (2017).",
        comparisonGroup: null,
      },
    ],
  },
  {
    id: "e-national-museum-anthropology",
    title: "National Museum of Anthropology",
    slug: "national-museum-of-anthropology",
    qid: "Q3330472",
    scope: "local",
    entryType: "place",
    era: "20th century",
    startYear: 1940,
    endYear: null,
    dateIsApproximate: true,
    locationName: "Rizal Park, Manila",
    significance:
      "Repository for national archaeological treasures including the Manunggul Jar, Laguna Copperplate Inscription, and San Diego shipwreck artifacts.",
    origin: { latitude: 14.5853, longitude: 120.9808 },
    originPrecision: "exact",
    originSource: "https://www.nationalmuseum.gov.ph/our-museums/national-museum-of-anthropology/",
    wikiTitle: "National Museum of Anthropology (Manila)",
    nmpPageSlug: "national-museum-of-anthropology",
    preferNmpSummary: true,
    media: [
      {
        id: "m-national-museum-anthropology",
        file: "National_Museum_of_Anthropology_(Ermita,_Manila)(06-30-2024).jpg",
        caption: "National Museum of Anthropology at Agrifina Circle, Rizal Park, Manila (2024).",
        comparisonGroup: null,
      },
    ],
  },

  // === 2. Philippine Relocated & Local Artifacts (10) ===
  {
    id: "e-spoliarium",
    title: "Spoliarium",
    slug: "spoliarium",
    qid: "Q3348220",
    scope: "local",
    entryType: "artifact",
    era: "Late 19th century",
    startYear: 1884,
    endYear: null,
    dateIsApproximate: false,
    locationName: "Painted in Rome; held in Manila",
    significance:
      "Gold-medal canvas by Juan Luna at the 1884 Exposición Nacional de Bellas Artes in Madrid, now the centerpiece of the National Museum of Fine Arts.",
    origin: { latitude: 41.9028, longitude: 12.4964 },
    current: { latitude: 14.5869, longitude: 120.9812 },
    originPrecision: "area_centroid",
    currentPrecision: "exact",
    originSource: "https://www.wikidata.org/wiki/Q3348220",
    currentSource:
      "https://www.nationalmuseum.gov.ph/exhibitions/fine-arts/gallery-spoliarium-hall/",
    wikiTitle: "Spoliarium",
    nmpPageSlug: "gallery-spoliarium-hall",
    preferNmpSummary: true,
    media: [
      {
        id: "m-spoliarium",
        file: "Spoliarium.jpg",
        caption:
          "Juan Luna, Spoliarium, 1884 (oil on canvas, National Museum of Fine Arts, Manila).",
        comparisonGroup: null,
        isArtworkReproduction: true,
      },
    ],
  },
  {
    id: "e-manunggul-jar",
    title: "Manunggul Jar",
    slug: "manunggul-jar",
    qid: "Q6753165",
    scope: "local",
    entryType: "artifact",
    era: "Late Neolithic",
    startYear: -889,
    endYear: -709,
    dateIsApproximate: true,
    locationName: "Excavated at Tabon Caves, Palawan; held in Manila",
    significance:
      "National Cultural Treasure depicting two figures sailing to the afterlife; a masterwork of precolonial Philippine pottery.",
    origin: { latitude: 9.2799, longitude: 117.9814 },
    current: { latitude: 14.5853, longitude: 120.9808 },
    originPrecision: "exact",
    currentPrecision: "exact",
    originSource: "https://www.wikidata.org/wiki/Q6753165",
    currentSource: "https://www.nationalmuseum.gov.ph/our-collections/archaeology/burial-jars/",
    wikiTitle: "Manunggul Jar",
    nmpPageSlug: "burial-jars",
    extraSources: [
      {
        title: "National Museum of the Philippines: Burial Jars Collection",
        url: "https://www.nationalmuseum.gov.ph/our-collections/archaeology/burial-jars/",
        publisher: "National Museum of the Philippines",
        sourceType: "museum catalogue",
      },
    ],
    media: [
      {
        id: "m-manunggul-jar",
        file: "Manunggul_Jar.jpg",
        caption: "Manunggul Jar displayed at the National Museum of Anthropology, Manila.",
        comparisonGroup: null,
      },
    ],
  },
  {
    id: "e-laguna-copperplate",
    title: "Laguna Copperplate Inscription",
    slug: "laguna-copperplate-inscription",
    qid: "Q1463293",
    scope: "local",
    entryType: "artifact",
    era: "Precolonial / Shaka 822",
    startYear: 900,
    endYear: null,
    dateIsApproximate: false,
    locationName: "Found in Lumban, Laguna; held in Manila",
    significance:
      "Oldest known written document found in the Philippines (dated 900 CE in Kawi script), recording debt acquittal and early Luzon-Java ties.",
    origin: { latitude: 14.297, longitude: 121.459 },
    current: { latitude: 14.5853, longitude: 120.9808 },
    originPrecision: "approximate",
    currentPrecision: "exact",
    originSource: "https://www.wikidata.org/wiki/Q1463293",
    currentSource:
      "https://www.nationalmuseum.gov.ph/2022/09/20/the-9th-to-10th-century-archaeological-evidence-of-maritime-relations-between-the-philippines-and-the-islands-of-southeast-asia/",
    wikiTitle: "Laguna Copperplate Inscription",
    extraSources: [
      {
        title:
          "National Museum of the Philippines: 9th–10th Century Maritime Relations & Laguna Copperplate",
        url: "https://www.nationalmuseum.gov.ph/2022/09/20/the-9th-to-10th-century-archaeological-evidence-of-maritime-relations-between-the-philippines-and-the-islands-of-southeast-asia/",
        publisher: "National Museum of the Philippines",
        sourceType: "museum catalogue",
      },
    ],
    media: [
      {
        id: "m-laguna-copperplate",
        file: "Laguna_Copperplate_Inscription_in_the_National_Museum_of_Anthropology.jpg",
        caption:
          "Laguna Copperplate Inscription on display at the National Museum of Anthropology, Manila.",
        comparisonGroup: null,
      },
    ],
  },
  {
    id: "e-golden-tara",
    title: "Golden Tara of Agusan",
    slug: "golden-tara-of-agusan",
    qid: "Q33159150",
    scope: "local",
    entryType: "artifact",
    era: "Precolonial / Butuan polity",
    startYear: 850,
    endYear: 950,
    dateIsApproximate: true,
    locationName: "Found near Esperanza, Agusan del Sur; held in Chicago",
    significance:
      "21-karat solid gold statuette demonstrating precolonial Hindu-Buddhist metallurgy and maritime trade in Mindanao.",
    origin: { latitude: 8.68, longitude: 125.65 },
    current: { latitude: 41.8661, longitude: -87.6169 },
    originPrecision: "approximate",
    currentPrecision: "exact",
    originSource: "https://www.wikidata.org/wiki/Q33159150",
    currentSource: "https://www.fieldmuseum.org/",
    wikiTitle: "Agusan image",
    extraSources: [
      {
        title: "Field Museum of Natural History (Current Holding Institution)",
        url: "https://www.fieldmuseum.org/",
        publisher: "Field Museum",
        sourceType: "museum catalogue",
      },
    ],
    media: [
      {
        id: "m-golden-tara",
        file: "Filippine,_provincia_di_agusan,_immagine_hindu,_statuetta_in_oro_massiccio,_xiii_secolo.jpg",
        caption: "The Agusan image (Golden Tara) gold statuette.",
        comparisonGroup: null,
      },
    ],
  },
  {
    id: "e-balangay-boats",
    title: "Balangay (Butuan Boats)",
    slug: "balangay-butuan-boats",
    qid: "Q804634",
    scope: "local",
    entryType: "artifact",
    era: "Precolonial / Maritime Southeast Asia",
    startYear: 689,
    endYear: 988,
    dateIsApproximate: true,
    locationName: "Butuan, Agusan del Norte",
    significance:
      "Oldest excavated watercraft in the Philippines (radiocarbon-dated 689–988 CE), demonstrating plank-built ocean navigation before European contact.",
    origin: { latitude: 8.948, longitude: 125.543 },
    current: null,
    originPrecision: "area_centroid",
    currentPrecision: null,
    originSource:
      "https://www.nationalmuseum.gov.ph/exhibitions/nmp-butuan/butuan-boat-site-museum/",
    wikiTitle: "Balangay",
    nmpPageSlug: "butuan-boat-site-museum",
    extraSources: [
      {
        title: "National Museum of the Philippines: Butuan Boat Site Museum",
        url: "https://www.nationalmuseum.gov.ph/exhibitions/nmp-butuan/butuan-boat-site-museum/",
        publisher: "National Museum of the Philippines",
        sourceType: "museum catalogue",
      },
    ],
    media: [
      {
        id: "m-balangay-boats",
        file: "Planks_of_a_Butuan_balangay_in_the_Butuan_National_Museum.jpg",
        caption: "Excavated planks of a Butuan balangay preserved in Butuan.",
        comparisonGroup: null,
      },
    ],
  },
  {
    id: "e-boxer-codex",
    title: "Boxer Codex",
    slug: "boxer-codex",
    qid: "Q3701552",
    scope: "local",
    entryType: "artifact",
    era: "Early Spanish colonial",
    startYear: 1590,
    endYear: null,
    dateIsApproximate: true,
    locationName: "Compiled in Manila; held in Bloomington, Indiana",
    significance:
      "1590 illustrated manuscript documenting dress, society, and beliefs across the Philippines and maritime East and Southeast Asia.",
    origin: { latitude: 14.5939, longitude: 120.9736 },
    current: { latitude: 39.1678, longitude: -86.5189 },
    originPrecision: "area_centroid",
    currentPrecision: "exact",
    originSource: "https://www.wikidata.org/wiki/Q3701552",
    currentSource:
      "https://webapp1.dlib.indiana.edu/metsnav3/general/index.html#mets=http%3A%2F%2Fpurl.dlib.indiana.edu%2Fiudl%2Fgeneral%2Fmets%2FVAB8326",
    wikiTitle: "Boxer Codex",
    extraSources: [
      {
        title: "Indiana University Lilly Library Digital Collection: The Boxer Codex (VAB8326)",
        url: "https://webapp1.dlib.indiana.edu/metsnav3/general/index.html#mets=http%3A%2F%2Fpurl.dlib.indiana.edu%2Fiudl%2Fgeneral%2Fmets%2FVAB8326",
        publisher: "Indiana University Lilly Library",
        sourceType: "library archive",
      },
    ],
    media: [
      {
        id: "m-boxer-codex",
        file: "Visayans_1.png",
        caption:
          "Folio from the Boxer Codex (c. 1590) depicting Visayan inhabitants of the Philippines.",
        comparisonGroup: null,
        isArtworkReproduction: true,
      },
    ],
  },
  {
    id: "e-doctrina-christiana",
    title: "Doctrina Christiana",
    slug: "doctrina-christiana",
    qid: "Q2576737",
    scope: "local",
    entryType: "artifact",
    era: "Early Spanish colonial",
    startYear: 1593,
    endYear: null,
    dateIsApproximate: false,
    locationName: "Printed in Manila; held in Washington, D.C.",
    significance:
      "Among the earliest surviving woodblock books printed in the Philippines (1593), preserving early Tagalog in Latin and Baybayin scripts.",
    origin: { latitude: 14.6, longitude: 120.967 },
    current: { latitude: 38.8886, longitude: -77.0047 },
    originPrecision: "area_centroid",
    currentPrecision: "exact",
    originSource: "https://www.wikidata.org/wiki/Q2576737",
    currentSource: "https://www.wikidata.org/wiki/Q131454",
    wikiTitle: "Doctrina Christiana",
    media: [
      {
        id: "m-doctrina-christiana",
        file: "Doctrina-cristiana.jpg",
        caption: "Title page of Doctrina Christiana (Manila, 1593).",
        comparisonGroup: null,
        isArtworkReproduction: true,
      },
    ],
  },
  {
    id: "e-bells-of-balangiga",
    title: "Bells of Balangiga",
    slug: "bells-of-balangiga",
    qid: "Q4850035",
    scope: "local",
    entryType: "artifact",
    era: "Spanish colonial / Philippine–American War",
    startYear: 1863,
    endYear: null,
    dateIsApproximate: true,
    locationName: "Balangiga, Eastern Samar (held in Wyoming 1901–2018; returned 2018)",
    significance:
      "Three parish church bells seized by U.S. forces in 1901 after the Balangiga conflict and formally repatriated to Balangiga Church in December 2018.",
    origin: { latitude: 11.1095, longitude: 125.3853 },
    current: null,
    originPrecision: "exact",
    currentPrecision: null,
    originSource: "https://www.wikidata.org/wiki/Q4850035",
    wikiTitle: "Balangiga bells",
    media: [
      {
        id: "m-bells-of-balangiga",
        file: "Balangiga_Bells_2023-11-18.jpg",
        caption:
          "The repatriated Bells of Balangiga at St. Lawrence the Martyr Church, Eastern Samar (2023).",
        comparisonGroup: null,
      },
    ],
  },
  {
    id: "e-noli-manuscript",
    title: "Noli Me Tángere Original Manuscript",
    slug: "noli-me-tangere-manuscript",
    qid: "Q568299",
    scope: "local",
    entryType: "artifact",
    era: "Late Spanish colonial / Propaganda Movement",
    startYear: 1887,
    endYear: null,
    dateIsApproximate: false,
    locationName: "Published in Berlin; held in Manila",
    significance:
      "José Rizal's 1887 reformist novel manuscript, instrumental to Philippine nationalist consciousness and preserved at the National Library.",
    origin: { latitude: 52.52, longitude: 13.405 },
    current: { latitude: 14.582, longitude: 120.981 },
    originPrecision: "area_centroid",
    currentPrecision: "exact",
    originSource: "https://www.wikidata.org/wiki/Q568299",
    currentSource: "https://web.nlp.gov.ph/",
    wikiTitle: "Noli Me Tángere (novel)",
    extraSources: [
      {
        title: "National Library of the Philippines (Custodian of Original Manuscript)",
        url: "https://web.nlp.gov.ph/",
        publisher: "National Library of the Philippines",
        sourceType: "library archive",
      },
    ],
    media: [
      {
        id: "m-noli-manuscript",
        file: "Noli_Me_Tangere.jpg",
        caption: "Cover of the first edition of José Rizal's Noli Me Tángere (Berlin, 1887).",
        comparisonGroup: null,
        isArtworkReproduction: true,
      },
    ],
  },
  {
    id: "e-san-diego-astrolabe",
    title: "San Diego Galleon Artifacts",
    slug: "san-diego-galleon-artifacts",
    qid: "Q499961",
    scope: "local",
    entryType: "artifact",
    era: "Early Spanish colonial",
    startYear: 1600,
    endYear: null,
    dateIsApproximate: false,
    locationName: "Sunk off Fortune Island, Nasugbu; held in Manila",
    significance:
      "Cargo, navigational instruments, Ming porcelain, and weaponry recovered from the Spanish galleon San Diego, sunk in 1600 off Nasugbu.",
    origin: { latitude: 14.056, longitude: 120.492 },
    current: { latitude: 14.5853, longitude: 120.9808 },
    originPrecision: "approximate",
    currentPrecision: "exact",
    originSource: "https://www.wikidata.org/wiki/Q499961",
    currentSource:
      "https://www.nationalmuseum.gov.ph/2021/12/27/kraak-porcelain-from-san-diego-shipwreck/",
    wikiTitle: "San Diego (ship)",
    extraSources: [
      {
        title: "National Museum of the Philippines: San Diego Shipwreck Collection",
        url: "https://www.nationalmuseum.gov.ph/2021/12/27/kraak-porcelain-from-san-diego-shipwreck/",
        publisher: "National Museum of the Philippines",
        sourceType: "museum catalogue",
      },
    ],
    media: [
      {
        id: "m-san-diego-astrolabe",
        file: "The_Mauritius_sinks_the_Spanish_ship_during_the_battle_in_Manila_Bay,_December_14,_1600.jpg",
        caption:
          "17th-century engraving depicting the sinking of the galleon San Diego off Manila Bay, December 14, 1600.",
        comparisonGroup: null,
        isArtworkReproduction: true,
      },
    ],
  },

  // === 3. International Places (14) ===
  {
    id: "e-stonehenge",
    title: "Stonehenge",
    slug: "stonehenge",
    qid: "Q39671",
    whcId: "373",
    preferWhcSummary: true,
    scope: "international",
    entryType: "place",
    era: "Neolithic / Bronze Age",
    startYear: -3000,
    endYear: -1500,
    dateIsApproximate: true,
    locationName: "Wiltshire, England",
    significance:
      "Prehistoric megalithic stone circle on Salisbury Plain, part of a UNESCO World Heritage ceremonial landscape.",
    origin: { latitude: 51.1789, longitude: -1.8262 },
    originPrecision: "exact",
    originSource: "https://data.unesco.org/explore/dataset/whc001/?q=373",
    wikiTitle: "Stonehenge",
    wikivoyageTitle: "Stonehenge",
    media: [
      {
        id: "m-stonehenge",
        file: "Stonehenge2007_07_30.jpg",
        caption: "Stonehenge standing stones on Salisbury Plain (2007).",
        comparisonGroup: "stonehenge-compare",
        periodOverride: "modern",
      },
      {
        id: "m-stonehenge-archival",
        file: "Stonehenge_1877.JPG",
        caption: "Stonehenge photographed in July 1877 by Edwin J. Acott.",
        comparisonGroup: "stonehenge-compare",
        periodOverride: "archival",
      },
    ],
  },
  {
    id: "e-angkor-wat",
    title: "Angkor Wat",
    slug: "angkor-wat",
    qid: "Q43473",
    whcId: "668",
    preferWhcSummary: true,
    scope: "international",
    entryType: "place",
    era: "Khmer Empire",
    startYear: 1100,
    endYear: null,
    dateIsApproximate: true,
    locationName: "Siem Reap, Cambodia",
    significance:
      "Monumental 12th-century temple complex of the Khmer Empire and the largest religious structure in the world by land area.",
    origin: { latitude: 13.4125, longitude: 103.867 },
    originPrecision: "exact",
    originSource: "https://data.unesco.org/explore/dataset/whc001/?q=668",
    wikiTitle: "Angkor Wat",
    wikivoyageTitle: "Angkor Archaeological Park",
    media: [
      {
        id: "m-angkor-wat",
        file: "Angkor_Wat.jpg",
        caption: "West facade and moat of Angkor Wat, Siem Reap (2005).",
        comparisonGroup: "angkor-wat-compare",
        periodOverride: "modern",
      },
      {
        id: "m-angkor-wat-archival",
        file: "Angkor_Wat_1900-1910.jpg",
        caption: "Archival photograph of Angkor Wat across the western causeway, c. 1900–1910.",
        comparisonGroup: "angkor-wat-compare",
        periodOverride: "archival",
      },
    ],
  },
  {
    id: "e-machu-picchu",
    title: "Machu Picchu",
    slug: "machu-picchu",
    qid: "Q676203",
    whcId: "274",
    preferWhcSummary: true,
    scope: "international",
    entryType: "place",
    era: "Inca",
    startYear: 1450,
    endYear: null,
    dateIsApproximate: true,
    locationName: "Cusco region, Peru",
    significance:
      "High-altitude 15th-century Inca citadel in the eastern Peruvian Andes and a UNESCO World Heritage Site.",
    origin: { latitude: -13.1631, longitude: -72.545 },
    originPrecision: "exact",
    originSource: "https://data.unesco.org/explore/dataset/whc001/?q=274",
    wikiTitle: "Machu Picchu",
    wikivoyageTitle: "Machu Picchu",
    extraSources: [
      {
        title: "Santuario Histórico de Machupicchu (Official Portal)",
        url: "http://www.machupicchu.gob.pe/",
        publisher: "Ministerio de Cultura del Perú",
        sourceType: "official site",
      },
    ],
    media: [
      {
        id: "m-machu-picchu",
        file: "Machu_Picchu,_2023_(012).jpg",
        caption: "Terraces and stone buildings of Machu Picchu (2023).",
        comparisonGroup: "machu-picchu-compare",
        periodOverride: "modern",
      },
      {
        id: "m-machu-picchu-archival",
        file: "Partial_view_of_Machu_Picchu_in_1911.jpg",
        caption: "Partial view of Machu Picchu photographed during the 1911 Yale expedition.",
        comparisonGroup: "machu-picchu-compare",
        periodOverride: "archival",
      },
    ],
  },
  {
    id: "e-great-pyramid-giza",
    title: "Great Pyramid of Giza",
    slug: "great-pyramid-of-giza",
    qid: "Q37200",
    whcId: "86",
    preferWhcSummary: false,
    scope: "international",
    entryType: "place",
    era: "Old Kingdom Egypt",
    startYear: -2599,
    endYear: null,
    dateIsApproximate: true,
    locationName: "Giza, Egypt",
    significance:
      "Oldest and only surviving Wonder of the Ancient World, constructed c. 2600 BCE for Pharaoh Khufu.",
    origin: { latitude: 29.9792, longitude: 31.1342 },
    originPrecision: "exact",
    originSource: "https://data.unesco.org/explore/dataset/whc001/?q=86",
    wikiTitle: "Great Pyramid of Giza",
    wikivoyageTitle: "Giza",
    media: [
      {
        id: "m-great-pyramid-giza",
        file: "All_Gizah_Pyramids.jpg",
        caption: "Great Pyramid and Giza plateau complex, Egypt (2006).",
        comparisonGroup: "giza-compare",
        periodOverride: "modern",
      },
      {
        id: "m-great-pyramid-giza-archival",
        file: "Giza_Necopolis_by_Félix_Bonfils_c1880s.JPG",
        caption: "Giza plateau and pyramids photographed by Félix Bonfils, c. 1880.",
        comparisonGroup: "giza-compare",
        periodOverride: "archival",
      },
    ],
  },
  {
    id: "e-colosseum",
    title: "Colosseum",
    slug: "colosseum",
    qid: "Q10285",
    whcId: "91",
    preferWhcSummary: false,
    scope: "international",
    entryType: "place",
    era: "Roman Empire / Flavian dynasty",
    startYear: 72,
    endYear: 80,
    dateIsApproximate: false,
    locationName: "Rome, Italy",
    significance:
      "Largest ancient amphitheatre ever constructed (72–80 CE) and enduring landmark of Imperial Rome.",
    origin: { latitude: 41.8903, longitude: 12.4922 },
    originPrecision: "exact",
    originSource: "https://data.unesco.org/explore/dataset/whc001/?q=91",
    wikiTitle: "Colosseum",
    wikivoyageTitle: "Rome/Colosseo",
    media: [
      {
        id: "m-colosseum",
        file: "Colosseo_2020.jpg",
        caption: "Exterior facade of the Colosseum in Rome (2020).",
        comparisonGroup: "colosseum-compare",
        periodOverride: "modern",
      },
      {
        id: "m-colosseum-archival",
        file: "Colosseum_and_Arch_of_Constantine_(est._1870).jpg",
        caption: "The Colosseum and Arch of Constantine in Rome, c. 1870.",
        comparisonGroup: "colosseum-compare",
        periodOverride: "archival",
      },
    ],
  },
  {
    id: "e-acropolis-athens",
    title: "Acropolis of Athens",
    slug: "acropolis-of-athens",
    qid: "Q131013",
    whcId: "404",
    preferWhcSummary: true,
    scope: "international",
    entryType: "place",
    era: "Classical Greece",
    startYear: -446,
    endYear: -431,
    dateIsApproximate: true,
    locationName: "Athens, Greece",
    significance:
      "Citadel of Classical Athens housing the Parthenon, Erechtheion, and Propylaea, UNESCO World Heritage Site.",
    origin: { latitude: 37.9717, longitude: 23.7261 },
    originPrecision: "exact",
    originSource: "https://data.unesco.org/explore/dataset/whc001/?q=404",
    wikiTitle: "Acropolis of Athens",
    wikivoyageTitle: "Athens/Acropolis",
    extraSources: [
      {
        title: "Hellenic Ministry of Culture: Acropolis of Athens",
        url: "http://odysseus.culture.gr/h/3/gh351.jsp?obj_id=2384",
        publisher: "Hellenic Ministry of Culture",
        sourceType: "government heritage agency",
      },
    ],
    media: [
      {
        id: "m-acropolis-athens",
        file: "Acropolis_of_Athens_at_dusk.jpg",
        caption: "The Acropolis of Athens and Parthenon at dusk (2023).",
        comparisonGroup: "acropolis-compare",
        periodOverride: "modern",
      },
      {
        id: "m-acropolis-athens-archival",
        file: "49._Athènes._Acropole._Côté_O._MET_DP-13897-003.jpg",
        caption:
          "1842 daguerreotype of the Acropolis of Athens by Joseph-Philibert Girault de Prangey.",
        comparisonGroup: "acropolis-compare",
        periodOverride: "archival",
      },
    ],
  },
  {
    id: "e-taj-mahal",
    title: "Taj Mahal",
    slug: "taj-mahal",
    qid: "Q9141",
    whcId: "252",
    preferWhcSummary: true,
    scope: "international",
    entryType: "place",
    era: "Mughal Empire",
    startYear: 1631,
    endYear: 1653,
    dateIsApproximate: true,
    locationName: "Agra, Uttar Pradesh, India",
    significance:
      "Ivory-white marble mausoleum commissioned in 1631 by Emperor Shah Jahan, synthesizing Persian, Islamic, and Indian architecture.",
    origin: { latitude: 27.175, longitude: 78.0419 },
    originPrecision: "exact",
    originSource: "https://data.unesco.org/explore/dataset/whc001/?q=252",
    wikiTitle: "Taj Mahal",
    wikivoyageTitle: "Agra",
    extraSources: [
      {
        title: "Taj Mahal Official Website",
        url: "https://www.tajmahal.gov.in/",
        publisher: "Archaeological Survey of India / Department of Tourism UP",
        sourceType: "official site",
      },
    ],
    media: [
      {
        id: "m-taj-mahal",
        file: "Taj_Mahal_(Edited).jpeg",
        caption: "The Taj Mahal mausoleum in Agra, India (2010).",
        comparisonGroup: "taj-mahal-compare",
        periodOverride: "modern",
      },
      {
        id: "m-taj-mahal-archival",
        file: "Sambourneagra1860s.jpg",
        caption: "Taj Mahal photographed by Samuel Bourne in the 1860s.",
        comparisonGroup: "taj-mahal-compare",
        periodOverride: "archival",
      },
    ],
  },
  {
    id: "e-alhambra",
    title: "Alhambra",
    slug: "alhambra",
    qid: "Q47476",
    whcId: "314",
    preferWhcSummary: true,
    scope: "international",
    entryType: "place",
    era: "Nasrid Kingdom of Granada",
    startYear: 1238,
    endYear: null,
    dateIsApproximate: false,
    locationName: "Granada, Spain",
    significance:
      "Nasrid palace and fortress complex begun in 1238, celebrated as the pinnacle of Moorish architecture in Iberia.",
    origin: { latitude: 37.1775, longitude: -3.59 },
    originPrecision: "exact",
    originSource: "https://data.unesco.org/explore/dataset/whc001/?q=314",
    wikiTitle: "Alhambra",
    wikivoyageTitle: "Granada",
    extraSources: [
      {
        title: "Patronato de la Alhambra y Generalife",
        url: "https://www.alhambra-patronato.es/en",
        publisher: "Patronato de la Alhambra y Generalife",
        sourceType: "official site",
      },
    ],
    media: [
      {
        id: "m-alhambra",
        file: "Dawn_Charles_V_Palace_Alhambra_Granada_Andalusia_Spain.jpg",
        caption: "Alhambra palace complex overlooking Granada, Spain.",
        comparisonGroup: null,
      },
    ],
  },
  {
    id: "e-forbidden-city",
    title: "Forbidden City",
    slug: "forbidden-city",
    qid: "Q80290",
    whcId: "439",
    preferWhcSummary: true,
    scope: "international",
    entryType: "place",
    era: "Ming and Qing dynasties",
    startYear: 1406,
    endYear: 1420,
    dateIsApproximate: false,
    locationName: "Beijing, China",
    significance:
      "Imperial palace complex at the heart of Beijing that served Ming and Qing emperors from 1420 to 1924.",
    origin: { latitude: 39.9158, longitude: 116.3908 },
    originPrecision: "exact",
    originSource: "https://data.unesco.org/explore/dataset/whc001/?q=439",
    wikiTitle: "Forbidden City",
    wikivoyageTitle: "Beijing/Dongcheng",
    media: [
      {
        id: "m-forbidden-city",
        file: "The_Forbidden_City_-_View_from_Coal_Hill.jpg",
        caption: "Panoramic view of the Forbidden City from Jingshan (Coal Hill), Beijing.",
        comparisonGroup: null,
      },
    ],
  },
  {
    id: "e-petra",
    title: "Petra",
    slug: "petra",
    qid: "Q5788",
    whcId: "326",
    preferWhcSummary: true,
    scope: "international",
    entryType: "place",
    era: "Nabataean Kingdom",
    startYear: -311,
    endYear: null,
    dateIsApproximate: true,
    locationName: "Ma'an Governorate, Jordan",
    significance:
      "Caravan capital of the Nabataean Kingdom famed for rock-cut sandstone facades and water conduit engineering.",
    origin: { latitude: 30.3289, longitude: 35.4403 },
    originPrecision: "area_centroid",
    originSource: "https://data.unesco.org/explore/dataset/whc001/?q=326",
    wikiTitle: "Petra",
    wikivoyageTitle: "Petra",
    media: [
      {
        id: "m-petra",
        file: "Al_Deir_Petra.JPG",
        caption: "Ad-Deir (The Monastery), rock-cut Nabataean monument at Petra, Jordan.",
        comparisonGroup: null,
      },
    ],
  },
  {
    id: "e-borobudur",
    title: "Borobudur",
    slug: "borobudur",
    qid: "Q42798",
    whcId: "592",
    preferWhcSummary: true,
    scope: "international",
    entryType: "place",
    era: "Shailendra dynasty / 9th century",
    startYear: 800,
    endYear: null,
    dateIsApproximate: true,
    locationName: "Magelang, Central Java, Indonesia",
    significance:
      "World's largest Buddhist temple, built in the 9th century with nine stacked platforms and 2,672 narrative relief panels.",
    origin: { latitude: -7.608, longitude: 110.204 },
    originPrecision: "exact",
    originSource: "https://data.unesco.org/explore/dataset/whc001/?q=592",
    wikiTitle: "Borobudur",
    wikivoyageTitle: "Borobudur",
    media: [
      {
        id: "m-borobudur",
        file: "Borobudur-Nothwest-view.jpg",
        caption: "Borobudur temple monument in Central Java, Indonesia (2008).",
        comparisonGroup: "borobudur-compare",
        periodOverride: "modern",
      },
      {
        id: "m-borobudur-archival",
        file: "COLLECTIE_TROPENMUSEUM_Boeddhabeeld_van_de_Borobudur_TMnr_60013976.jpg",
        caption:
          "Buddha statue and stupas at Borobudur photographed in 1873 by Isidore van Kinsbergen.",
        comparisonGroup: "borobudur-compare",
        periodOverride: "archival",
      },
    ],
  },
  {
    id: "e-hagia-sophia",
    title: "Hagia Sophia",
    slug: "hagia-sophia",
    qid: "Q12506",
    whcId: "356",
    preferWhcSummary: false,
    scope: "international",
    entryType: "place",
    era: "Byzantine / Ottoman",
    startYear: 532,
    endYear: 537,
    dateIsApproximate: false,
    locationName: "Istanbul, Turkey",
    significance:
      "Completed in 537 CE under Emperor Justinian I as a Byzantine cathedral with a monumental pendentive dome, later an Ottoman imperial mosque.",
    origin: { latitude: 41.0083, longitude: 28.98 },
    originPrecision: "exact",
    originSource: "https://data.unesco.org/explore/dataset/whc001/?q=356",
    wikiTitle: "Hagia Sophia",
    wikivoyageTitle: "Istanbul/Sultanahmet",
    media: [
      {
        id: "m-hagia-sophia",
        file: "Hagia_Sophia_(228968325).jpeg",
        caption: "Exterior dome and minarets of Hagia Sophia, Istanbul.",
        comparisonGroup: null,
      },
    ],
  },
  {
    id: "e-pompeii",
    title: "Pompeii",
    slug: "pompeii",
    qid: "Q43332",
    whcId: "829",
    preferWhcSummary: true,
    scope: "international",
    entryType: "place",
    era: "Roman Antiquity",
    startYear: -599,
    endYear: 79,
    dateIsApproximate: true,
    locationName: "Campania, Italy",
    significance:
      "Roman city preserved beneath volcanic ash during the 79 CE eruption of Mount Vesuvius, offering a detailed record of Roman urban life.",
    origin: { latitude: 40.7506, longitude: 14.4897 },
    originPrecision: "area_centroid",
    originSource: "https://data.unesco.org/explore/dataset/whc001/?q=829",
    wikiTitle: "Pompeii",
    wikivoyageTitle: "Pompeii",
    extraSources: [
      {
        title: "Parco Archeologico di Pompei",
        url: "https://pompeiisites.org/en/",
        publisher: "Parco Archeologico di Pompei",
        sourceType: "official site",
      },
    ],
    media: [
      {
        id: "m-pompeii",
        file: "Aerial_image_of_Pompeii_and_Mount_Vesuvius_(view_from_the_southeast).jpg",
        caption: "Aerial view of the Pompeii archaeological site and Mount Vesuvius.",
        comparisonGroup: null,
      },
    ],
  },
  {
    id: "e-chichen-itza",
    title: "Chichen Itza",
    slug: "chichen-itza",
    qid: "Q5859",
    whcId: "483",
    preferWhcSummary: true,
    scope: "international",
    entryType: "place",
    era: "Maya Terminal Classic",
    startYear: 600,
    endYear: 900,
    dateIsApproximate: true,
    locationName: "Yucatán, Mexico",
    significance:
      "Major Maya ceremonial and political centre featuring El Castillo (Temple of Kukulcán) and a UNESCO World Heritage designation.",
    origin: { latitude: 20.6831, longitude: -88.5686 },
    originPrecision: "exact",
    originSource: "https://data.unesco.org/explore/dataset/whc001/?q=483",
    wikiTitle: "Chichen Itza",
    wikivoyageTitle: "Chichen Itza",
    media: [
      {
        id: "m-chichen-itza",
        file: "Chichen_Itza_3.jpg",
        caption: "Temple of Kukulcán (El Castillo) at Chichen Itza, Yucatán.",
        comparisonGroup: null,
      },
    ],
  },

  // === 4. International Relocated & Landmark Artifacts (7) ===
  {
    id: "e-rosetta-stone",
    title: "Rosetta Stone",
    slug: "rosetta-stone",
    qid: "Q48584",
    scope: "international",
    entryType: "artifact",
    era: "Ptolemaic Egypt",
    startYear: -195,
    endYear: null,
    dateIsApproximate: false,
    locationName: "Inscribed at Memphis / found at Rashid; held in London",
    significance:
      "Trilingual decree of 196 BCE in hieroglyphs, Demotic, and Ancient Greek that unlocked the decipherment of Egyptian hieroglyphs.",
    origin: { latitude: 31.4044, longitude: 30.4164 },
    current: { latitude: 51.5194, longitude: -0.1269 },
    originPrecision: "approximate",
    currentPrecision: "exact",
    originSource: "https://www.wikidata.org/wiki/Q48584",
    currentSource:
      "https://sketchfab.com/3d-models/the-rosetta-stone-1e03509704a3490e99a173e53b93e282",
    wikiTitle: "Rosetta Stone",
    extraSources: [
      {
        title: "British Museum 3D Capture: The Rosetta Stone",
        url: "https://sketchfab.com/3d-models/the-rosetta-stone-1e03509704a3490e99a173e53b93e282",
        publisher: "The British Museum (Sketchfab)",
        sourceType: "museum catalogue",
      },
    ],
    media: [
      {
        id: "m-rosetta-stone",
        file: "Rosetta_Stone.JPG",
        caption: "The Rosetta Stone exhibited in the British Museum, London.",
        comparisonGroup: null,
      },
    ],
  },
  {
    id: "e-parthenon-sculptures",
    title: "Parthenon Sculptures",
    slug: "parthenon-sculptures",
    qid: "Q606662",
    scope: "international",
    entryType: "artifact",
    era: "Classical Greece",
    startYear: -446,
    endYear: -431,
    dateIsApproximate: true,
    locationName: "Created for the Parthenon, Athens; held in London",
    significance:
      "5th-century BCE marble friezes and metopes removed from the Acropolis of Athens in the early 19th century and exhibited at the British Museum.",
    origin: { latitude: 37.9715, longitude: 23.7266 },
    current: { latitude: 51.5194, longitude: -0.1269 },
    originPrecision: "exact",
    currentPrecision: "exact",
    originSource: "http://odysseus.culture.gr/h/3/gh351.jsp?obj_id=2384",
    currentSource: "https://www.wikidata.org/wiki/Q6373",
    wikiTitle: "Elgin Marbles",
    extraSources: [
      {
        title: "Hellenic Ministry of Culture: Parthenon & Acropolis Origin Context",
        url: "http://odysseus.culture.gr/h/3/gh351.jsp?obj_id=2384",
        publisher: "Hellenic Ministry of Culture",
        sourceType: "government heritage agency",
      },
    ],
    media: [
      {
        id: "m-parthenon-sculptures",
        file: "Elgin-marbles-jan-2024.jpg",
        caption: "Parthenon Sculptures gallery at the British Museum, London (2024).",
        comparisonGroup: null,
      },
    ],
  },
  {
    id: "e-bust-of-nefertiti",
    title: "Bust of Nefertiti",
    slug: "bust-of-nefertiti",
    qid: "Q582172",
    scope: "international",
    entryType: "artifact",
    era: "New Kingdom Egypt / Amarna Period",
    startYear: -1344,
    endYear: null,
    dateIsApproximate: true,
    locationName: "Crafted at Amarna, Egypt; held in Berlin",
    significance:
      "Painted limestone portrait attributed to sculptor Thutmose (c. 1345 BCE), excavated at Tell el-Amarna in 1912 and exhibited in Berlin.",
    origin: { latitude: 27.6453, longitude: 30.8964 },
    current: { latitude: 52.5206, longitude: 13.3978 },
    originPrecision: "approximate",
    currentPrecision: "exact",
    originSource: "https://www.wikidata.org/wiki/Q582172",
    currentSource: "https://www.smb.museum/en/museums-institutions/neues-museum/home/",
    wikiTitle: "Nefertiti Bust",
    extraSources: [
      {
        title: "Neues Museum Berlin (Staatliche Museen zu Berlin)",
        url: "https://www.smb.museum/en/museums-institutions/neues-museum/home/",
        publisher: "Staatliche Museen zu Berlin",
        sourceType: "museum catalogue",
      },
    ],
    media: [
      {
        id: "m-bust-of-nefertiti",
        file: "Nofretete_Neues_Museum.jpg",
        caption: "Bust of Nefertiti displayed in the Neues Museum, Berlin.",
        comparisonGroup: null,
      },
    ],
  },
  {
    id: "e-code-of-hammurabi",
    title: "Code of Hammurabi",
    slug: "code-of-hammurabi",
    qid: "Q93304",
    scope: "international",
    entryType: "artifact",
    era: "Old Babylonian Empire",
    startYear: -1752,
    endYear: null,
    dateIsApproximate: true,
    locationName: "Excavated at Susa, Iran; held in Paris",
    significance:
      "Basalt stele inscribed in Akkadian cuneiform (c. 1753 BCE) with 282 legal provisions; moved in antiquity from Babylon to Susa and excavated in 1901.",
    origin: { latitude: 32.1906, longitude: 48.2578 },
    current: { latitude: 48.8611, longitude: 2.3358 },
    originPrecision: "approximate",
    currentPrecision: "exact",
    originSource: "https://www.wikidata.org/wiki/Q93304",
    currentSource: "https://collections.louvre.fr/en/ark:/53355/cl010174436",
    wikiTitle: "Code of Hammurabi",
    louvreArkId: "cl010174436",
    extraSources: [
      {
        title: "Musée du Louvre Collections: Code de Hammurabi (SB 8)",
        url: "https://collections.louvre.fr/en/ark:/53355/cl010174436",
        publisher: "Musée du Louvre",
        sourceType: "museum catalogue",
      },
    ],
    media: [
      {
        id: "m-code-of-hammurabi",
        file: "P1050763_Louvre_code_Hammurabi_face_rwk.JPG",
        caption: "Basalt stele of the Code of Hammurabi in the Louvre Museum, Paris.",
        comparisonGroup: null,
      },
    ],
  },
  {
    id: "e-cyrus-cylinder",
    title: "Cyrus Cylinder",
    slug: "cyrus-cylinder",
    qid: "Q405008",
    scope: "international",
    entryType: "artifact",
    era: "Achaemenid Empire",
    startYear: -538,
    endYear: null,
    dateIsApproximate: true,
    locationName: "Excavated at Babylon, Iraq; held in London",
    significance:
      "Clay cylinder inscribed in Akkadian cuneiform for Cyrus the Great after the 539 BCE conquest of Babylon, unearthed in 1879.",
    origin: { latitude: 32.5425, longitude: 44.4211 },
    current: { latitude: 51.5194, longitude: -0.1269 },
    originPrecision: "approximate",
    currentPrecision: "exact",
    originSource: "https://www.wikidata.org/wiki/Q405008",
    currentSource: "https://www.wikidata.org/wiki/Q6373",
    wikiTitle: "Cyrus Cylinder",
    media: [
      {
        id: "m-cyrus-cylinder",
        file: "Cyrus_Cylinder_front.jpg",
        caption: "The Cyrus Cylinder exhibited in the British Museum, London.",
        comparisonGroup: null,
      },
    ],
  },
  {
    id: "e-terracotta-army",
    title: "Terracotta Army",
    slug: "terracotta-army",
    qid: "Q47672",
    whcId: "441",
    preferWhcSummary: false,
    scope: "international",
    entryType: "artifact",
    era: "Qin dynasty",
    startYear: -209,
    endYear: -208,
    dateIsApproximate: true,
    locationName: "Lintong, Xi'an, Shaanxi, China",
    significance:
      "Thousands of life-sized terracotta warriors buried with Qin Shi Huang (c. 210–209 BCE) and preserved on site at the Mausoleum Museum in Xi'an.",
    origin: { latitude: 34.385, longitude: 109.2731 },
    current: null,
    originPrecision: "exact",
    currentPrecision: null,
    originSource: "https://data.unesco.org/explore/dataset/whc001/?q=441",
    wikiTitle: "Terracotta Army",
    wikivoyageTitle: "Xi'an",
    extraSources: [
      {
        title: "Emperor Qinshihuang's Mausoleum Site Museum",
        url: "https://www.bmy.com.cn/",
        publisher: "Emperor Qinshihuang's Mausoleum Site Museum",
        sourceType: "museum catalogue",
      },
    ],
    media: [
      {
        id: "m-terracotta-army",
        file: "51714-Terracota-Army.jpg",
        caption: "Excavated soldiers in Pit 1 of the Terracotta Army, Xi'an, China.",
        comparisonGroup: null,
      },
    ],
  },
  {
    id: "e-dead-sea-scrolls",
    title: "Dead Sea Scrolls",
    slug: "dead-sea-scrolls",
    qid: "Q145780",
    scope: "international",
    entryType: "artifact",
    era: "Second Temple period",
    startYear: -299,
    endYear: 100,
    dateIsApproximate: true,
    locationName: "Found at Qumran Caves; held in Jerusalem",
    significance:
      "Ancient Jewish biblical and sectarian manuscripts (3rd century BCE – 1st century CE) discovered in the Qumran Caves between 1946 and 1956.",
    origin: { latitude: 31.7408, longitude: 35.4586 },
    current: { latitude: 31.7733, longitude: 35.2028 },
    originPrecision: "approximate",
    currentPrecision: "exact",
    originSource: "https://www.wikidata.org/wiki/Q145780",
    currentSource: "https://www.deadseascrolls.org.il/",
    wikiTitle: "Dead Sea Scrolls",
    extraSources: [
      {
        title: "The Leon Levy Dead Sea Scrolls Digital Library",
        url: "https://www.deadseascrolls.org.il/",
        publisher: "Israel Antiquities Authority",
        sourceType: "library archive",
      },
    ],
    media: [
      {
        id: "m-dead-sea-scrolls",
        file: "The_Great_Isaiah_Scroll_MS_A_(1QIsa)_-_Google_Art_Project.jpg",
        caption:
          "The Great Isaiah Scroll (1QIsa) from Qumran Cave 1, Shrine of the Book, Israel Museum.",
        comparisonGroup: null,
      },
    ],
  },
];

// 40 typed relationships covering all 9 relationship types
const LINKS = [
  {
    id: "l1",
    sourceId: "e-fort-santiago",
    targetId: "e-intramuros",
    relationshipType: "related_site",
    relationshipLabel: "Within the walled city",
    description: null,
  },
  {
    id: "l2",
    sourceId: "e-san-agustin",
    targetId: "e-intramuros",
    relationshipType: "related_site",
    relationshipLabel: "Within the walled city",
    description: null,
  },
  {
    id: "l3",
    sourceId: "e-magellans-cross",
    targetId: "e-intramuros",
    relationshipType: "historical_influence",
    relationshipLabel: "Early colonial Cebu and Manila",
    description: "Both records belong to the early Spanish colonial period.",
  },
  {
    id: "l4",
    sourceId: "e-spoliarium",
    targetId: "e-national-museum",
    relationshipType: "artifact_relocation",
    relationshipLabel: "Painted in Rome, held in Manila",
    description: null,
  },
  {
    id: "l5",
    sourceId: "e-manila-cathedral",
    targetId: "e-intramuros",
    relationshipType: "related_site",
    relationshipLabel: "Metropolitan cathedral of Intramuros",
    description: "Situated at Plaza de Roma inside the historic core of Manila.",
  },
  {
    id: "l6",
    sourceId: "e-rizal-park",
    targetId: "e-fort-santiago",
    relationshipType: "same_event",
    relationshipLabel: "Imprisonment and execution of José Rizal",
    description:
      "José Rizal was held at Fort Santiago before his execution at Bagumbayan on December 30, 1896.",
  },
  {
    id: "l7",
    sourceId: "e-rizal-park",
    targetId: "e-rizal-shrine-dapitan",
    relationshipType: "political_association",
    relationshipLabel: "Exile in Dapitan before Bagumbayan",
    description:
      "Rizal spent four years exiled in Dapitan (1892–1896) prior to his trial and execution in Manila.",
  },
  {
    id: "l8",
    sourceId: "e-noli-manuscript",
    targetId: "e-rizal-park",
    relationshipType: "historical_influence",
    relationshipLabel: "Reformist novel linked to the 1896 trial",
    description:
      "Rizal's writings formed part of the political context cited by Spanish authorities prior to his execution at Bagumbayan.",
  },
  {
    id: "l9",
    sourceId: "e-ust",
    targetId: "e-intramuros",
    relationshipType: "predecessor",
    relationshipLabel: "Founded in Intramuros before relocating to Sampaloc",
    description:
      "Established inside Intramuros in 1611 before transferring its main campus to Sampaloc in 1927.",
  },
  {
    id: "l10",
    sourceId: "e-doctrina-christiana",
    targetId: "e-binondo",
    relationshipType: "artifact_origin",
    relationshipLabel: "Early woodblock printing in Manila",
    description:
      "Printed in 1593 with participation from Chinese artisans in early colonial Manila.",
  },
  {
    id: "l11",
    sourceId: "e-boxer-codex",
    targetId: "e-intramuros",
    relationshipType: "artifact_origin",
    relationshipLabel: "Compiled in late-16th-century Spanish Manila",
    description:
      "Produced c. 1590 in Spanish Manila to document peoples across the Philippines and East Asia.",
  },
  {
    id: "l12",
    sourceId: "e-binondo",
    targetId: "e-intramuros",
    relationshipType: "cultural_exchange",
    relationshipLabel: "1594 trading settlement across the Pasig River",
    description:
      "Established across the Pasig from Intramuros as a hub of Chinese-Filipino commerce and craftsmanship.",
  },
  {
    id: "l13",
    sourceId: "e-quiapo-church",
    targetId: "e-manila-cathedral",
    relationshipType: "related_site",
    relationshipLabel: "Historic Catholic shrines of Manila",
    description: "Two principal ecclesiastical landmarks of the Archdiocese of Manila.",
  },
  {
    id: "l14",
    sourceId: "e-malacanang-palace",
    targetId: "e-intramuros",
    relationshipType: "successor",
    relationshipLabel: "Executive seat succeeding Intramuros colonial governance",
    description:
      "Became the official residence of Manila's chief executive after the 1863 earthquake damaged the Palacio del Gobernador in Intramuros.",
  },
  {
    id: "l15",
    sourceId: "e-corregidor",
    targetId: "e-fort-santiago",
    relationshipType: "same_event",
    relationshipLabel: "1942 defense of Manila Bay and wartime occupation",
    description:
      "Both fortresses formed part of the Manila Bay harbor defense network during World War II.",
  },
  {
    id: "l16",
    sourceId: "e-barasoain-church",
    targetId: "e-aguinaldo-shrine",
    relationshipType: "political_association",
    relationshipLabel: "1898 Independence and the Malolos Republic",
    description:
      "Following the June 1898 proclamation in Kawit, the Malolos Congress convened at Barasoain Church to frame the First Philippine Republic.",
  },
  {
    id: "l17",
    sourceId: "e-malacanang-palace",
    targetId: "e-barasoain-church",
    relationshipType: "political_association",
    relationshipLabel: "Executive seats of Philippine governance",
    description:
      "Connects the First Philippine Republic capital at Malolos with the presidential seat in Manila.",
  },
  {
    id: "l18",
    sourceId: "e-paoay-church",
    targetId: "e-san-agustin",
    relationshipType: "related_site",
    relationshipLabel: "Baroque Churches of the Philippines ensemble",
    description:
      "Inscribed together in 1993 as part of the UNESCO World Heritage Baroque Churches serial property.",
  },
  {
    id: "l19",
    sourceId: "e-miagao-church",
    targetId: "e-san-agustin",
    relationshipType: "related_site",
    relationshipLabel: "Baroque Churches of the Philippines ensemble",
    description:
      "Inscribed together in 1993 as part of the UNESCO World Heritage Baroque Churches serial property.",
  },
  {
    id: "l20",
    sourceId: "e-vigan",
    targetId: "e-paoay-church",
    relationshipType: "cultural_exchange",
    relationshipLabel: "Ilocos colonial trade and architectural corridor",
    description:
      "Neighboring Ilocos heritage landmarks sharing Spanish-colonial masonry and lime-mortar construction.",
  },
  {
    id: "l21",
    sourceId: "e-basilica-santo-nino",
    targetId: "e-magellans-cross",
    relationshipType: "related_site",
    relationshipLabel: "Adjacent 16th-century Cebu City monuments",
    description: "Located beside one another at Plaza Sugbo in historic Cebu City.",
  },
  {
    id: "l22",
    sourceId: "e-fort-san-pedro",
    targetId: "e-basilica-santo-nino",
    relationshipType: "related_site",
    relationshipLabel: "1565 Spanish settlement monuments in Cebu",
    description: "Both foundations date to Miguel López de Legazpi's 1565 expedition in Cebu.",
  },
  {
    id: "l23",
    sourceId: "e-manunggul-jar",
    targetId: "e-tabon-caves",
    relationshipType: "artifact_origin",
    relationshipLabel: "Excavated in Manunggul Cave, Lipuun Point",
    description:
      "Recovered from a Neolithic burial chamber inside the Tabon Caves complex in Palawan.",
  },
  {
    id: "l24",
    sourceId: "e-manunggul-jar",
    targetId: "e-national-museum-anthropology",
    relationshipType: "artifact_relocation",
    relationshipLabel: "Held at the National Museum of Anthropology",
    description:
      "Relocated from Lipuun Point, Palawan to the National Museum in Manila for conservation and public display.",
  },
  {
    id: "l25",
    sourceId: "e-laguna-copperplate",
    targetId: "e-national-museum-anthropology",
    relationshipType: "artifact_relocation",
    relationshipLabel: "Held at the National Museum of Anthropology",
    description:
      "Unearthed in Lumban, Laguna in 1987 and curated at the National Museum of Anthropology in Manila.",
  },
  {
    id: "l26",
    sourceId: "e-san-diego-astrolabe",
    targetId: "e-national-museum-anthropology",
    relationshipType: "artifact_relocation",
    relationshipLabel: "Recovered off Fortune Island, exhibited in Manila",
    description:
      "Excavated from the 1600 wreck site off Nasugbu and exhibited at the National Museum of Anthropology.",
  },
  {
    id: "l27",
    sourceId: "e-national-museum-anthropology",
    targetId: "e-national-museum",
    relationshipType: "related_site",
    relationshipLabel: "National Museum Complex buildings in Rizal Park",
    description:
      "Adjacent neoclassical buildings facing Agrifina Circle and Padre Burgos Avenue in Manila.",
  },
  {
    id: "l28",
    sourceId: "e-golden-tara",
    targetId: "e-balangay-boats",
    relationshipType: "cultural_exchange",
    relationshipLabel: "Precolonial Agusan–Butuan maritime network",
    description:
      "Both artifacts attest to precolonial goldworking, trade, and seafaring in northeastern Mindanao.",
  },
  {
    id: "l29",
    sourceId: "e-laguna-copperplate",
    targetId: "e-borobudur",
    relationshipType: "cultural_exchange",
    relationshipLabel: "Old Malay and Kawi-script maritime exchange",
    description:
      "The 900 CE Kawi inscription reflects shared Javanese-Malay administrative and calendar conventions in maritime Southeast Asia.",
  },
  {
    id: "l30",
    sourceId: "e-bells-of-balangiga",
    targetId: "e-aguinaldo-shrine",
    relationshipType: "political_association",
    relationshipLabel: "Philippine–American War heritage and repatriation",
    description:
      "Connects the 1898 Independence site with one of the defining war-trophy repatriation cases of the Philippine–American War.",
  },
  {
    id: "l31",
    sourceId: "e-rosetta-stone",
    targetId: "e-great-pyramid-giza",
    relationshipType: "cultural_exchange",
    relationshipLabel: "Ancient Egyptian civilization and script decipherment",
    description:
      "Decipherment of the Rosetta Stone opened modern epigraphic study of Old Kingdom monuments including Giza.",
  },
  {
    id: "l32",
    sourceId: "e-bust-of-nefertiti",
    targetId: "e-great-pyramid-giza",
    relationshipType: "cultural_exchange",
    relationshipLabel: "Pharaonic Egyptian royal art and archaeology",
    description:
      "Spans Old Kingdom monumental tombs at Giza and New Kingdom Amarna royal sculpture.",
  },
  {
    id: "l33",
    sourceId: "e-parthenon-sculptures",
    targetId: "e-acropolis-athens",
    relationshipType: "artifact_origin",
    relationshipLabel: "Removed from the Parthenon on the Acropolis",
    description:
      "Sculpted in the 5th century BCE for the Parthenon before removal in the early 19th century.",
  },
  {
    id: "l34",
    sourceId: "e-parthenon-sculptures",
    targetId: "e-rosetta-stone",
    relationshipType: "related_site",
    relationshipLabel: "Held in the British Museum, London",
    description:
      "Both antiquities are displayed in the permanent collections of the British Museum.",
  },
  {
    id: "l35",
    sourceId: "e-cyrus-cylinder",
    targetId: "e-rosetta-stone",
    relationshipType: "related_site",
    relationshipLabel: "Held in the British Museum, London",
    description: "Both ancient royal inscriptions are curated in the British Museum collections.",
  },
  {
    id: "l36",
    sourceId: "e-code-of-hammurabi",
    targetId: "e-cyrus-cylinder",
    relationshipType: "historical_influence",
    relationshipLabel: "Mesopotamian cuneiform royal inscriptions",
    description:
      "Two foundational Akkadian cuneiform monuments linked to Babylon's royal and legal traditions.",
  },
  {
    id: "l37",
    sourceId: "e-pompeii",
    targetId: "e-colosseum",
    relationshipType: "same_event",
    relationshipLabel: "Flavian-era Roman Empire (79–80 CE)",
    description:
      "Pompeii was buried by Vesuvius in 79 CE during the reign of Emperor Titus, one year before the Colosseum's 80 CE inauguration.",
  },
  {
    id: "l38",
    sourceId: "e-hagia-sophia",
    targetId: "e-colosseum",
    relationshipType: "successor",
    relationshipLabel: "Eastern Roman monumental architecture after Rome",
    description:
      "Demonstrates the transition from Flavian Roman concrete engineering to Justinianic Byzantine dome architecture.",
  },
  {
    id: "l39",
    sourceId: "e-angkor-wat",
    targetId: "e-borobudur",
    relationshipType: "historical_influence",
    relationshipLabel: "Monumental Southeast Asian temple mountains",
    description:
      "Both complexes express Indianized cosmological mountain plans in carved volcanic stone and sandstone.",
  },
  {
    id: "l40",
    sourceId: "e-dead-sea-scrolls",
    targetId: "e-petra",
    relationshipType: "cultural_exchange",
    relationshipLabel: "Antiquity across the Jordan Rift Valley",
    description:
      "Contemporaneous Dead Sea and Nabataean manuscript and trade traditions bridging the 3rd century BCE to 1st century CE.",
  },
];

// === Fetch 1: Official UNESCO WHC001 records from data.unesco.org ===
const whcIds = [...new Set(SPECS.map((s) => s.whcId).filter(Boolean))];
const whcById = new Map();
if (whcIds.length) {
  const where = `id_no in (${whcIds.map((id) => `"${id}"`).join(",")})`;
  const data = await getJsonUrl(`${WHC_API}?where=${encodeURIComponent(where)}&limit=50`);
  for (const row of data?.results ?? []) {
    if (row?.id_no) whcById.set(String(row.id_no).trim(), row);
  }
}
console.log(`Fetched ${whcById.size}/${whcIds.length} official UNESCO WHC001 records`);

// === Fetch 2: National Museum of the Philippines REST API pages ===
const nmpBySlug = new Map();
const nmpSlugs = [...new Set(SPECS.map((s) => s.nmpPageSlug).filter(Boolean))];
for (const slug of nmpSlugs) {
  const pages = await getJsonUrl(`${NMP_API}/pages?slug=${encodeURIComponent(slug)}`).catch(
    () => [],
  );
  const page = Array.isArray(pages) ? pages[0] : null;
  if (page) {
    const title = cleanText(page.title?.rendered || slug);
    let rawText = cleanText(page.content?.rendered || page.excerpt?.rendered || "");
    const shortHeading = title.replace(/^NMFA:\s*/i, "");
    for (const prefix of [title, shortHeading]) {
      if (prefix && rawText.toLowerCase().startsWith(prefix.toLowerCase())) {
        rawText = rawText.slice(prefix.length).trim();
        break;
      }
    }
    nmpBySlug.set(slug, {
      title,
      url: page.link,
      summary: multiSentenceSummary(rawText, 440),
    });
  }
}
console.log(`Fetched ${nmpBySlug.size}/${nmpSlugs.length} National Museum PH REST records`);

// === Fetch 3: Musée du Louvre Open JSON API ===
const louvreData = await getJsonUrl(
  "https://collections.louvre.fr/ark:/53355/cl010174436.json",
).catch(() => null);
console.log(`Fetched Louvre API record: ${louvreData ? louvreData.title : "none"}`);

// === Fetch 4: Wikidata entities for all 55 QIDs ===
const wdEntities = new Map();
const allQids = [...new Set(SPECS.map((s) => s.qid))];
for (let i = 0; i < allQids.length; i += 30) {
  await sleep(350);
  const data = await getJson(WIKIDATA_API, {
    action: "wbgetentities",
    props: "labels|descriptions|claims",
    ids: allQids.slice(i, i + 30).join("|"),
    languages: "en|mul",
  });
  for (const [qid, entity] of Object.entries(data?.entities ?? {})) {
    if (entity?.id) wdEntities.set(qid, entity);
  }
}
console.log(`Fetched ${wdEntities.size}/${allQids.length} Wikidata entities`);

// === Fetch 5: English Wikivoyage summaries ===
const wikivoyageByTitle = new Map();
const wvTitles = [...new Set(SPECS.map((s) => s.wikivoyageTitle).filter(Boolean))];
for (let i = 0; i < wvTitles.length; i += 20) {
  await sleep(300);
  const batch = wvTitles.slice(i, i + 20);
  const data = await getJson(WIKIVOYAGE_API, {
    action: "query",
    prop: "extracts",
    exintro: "1",
    explaintext: "1",
    exchars: "400",
    exlimit: "20",
    redirects: "1",
    titles: batch.join("|"),
  }).catch(() => null);
  if (!data) continue;
  const pageFor = pageLookup(data);
  for (const title of batch) {
    const page = pageFor(title);
    if (page && !page.missing && page.extract) {
      wikivoyageByTitle.set(title, {
        title: page.title,
        url: `https://en.wikivoyage.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`,
      });
    }
  }
}
console.log(`Matched ${wikivoyageByTitle.size}/${wvTitles.length} English Wikivoyage guides`);

// === Fetch 6: English Wikipedia extracts ===
const wikiSummaries = new Map();
const wikiTitles = [...new Set(SPECS.map((s) => s.wikiTitle))];
for (let i = 0; i < wikiTitles.length; i += 15) {
  await sleep(350);
  const data = await getJson(WIKI_API, {
    action: "query",
    prop: "extracts",
    exintro: "1",
    explaintext: "1",
    exchars: "700",
    exlimit: "20",
    redirects: "1",
    titles: wikiTitles.slice(i, i + 15).join("|"),
  });
  const pageFor = pageLookup(data);
  for (const title of wikiTitles.slice(i, i + 15)) {
    const page = pageFor(title);
    const summary = multiSentenceSummary(page?.extract ?? "", 440);
    if (!summary) throw new Error(`Missing Wikipedia extract for ${title}`);
    wikiSummaries.set(title, {
      summary,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent((page?.title || title).replace(/ /g, "_"))}`,
    });
  }
}
console.log(`Fetched ${wikiSummaries.size}/${wikiTitles.length} Wikipedia extracts`);

// === Fetch 7: Wikimedia Commons imageinfo + extmetadata ===
const allFiles = [...new Set(SPECS.flatMap((s) => s.media.map((m) => m.file)))];
const imageInfo = new Map();
for (let i = 0; i < allFiles.length; i += 35) {
  await sleep(400);
  const batch = allFiles.slice(i, i + 35);
  const data = await getJson(COMMONS_API, {
    action: "query",
    titles: batch.map((f) => `File:${f.replace(/^File:/i, "")}`).join("|"),
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "960",
  });
  const pageFor = pageLookup(data);
  for (const file of batch) {
    const page = pageFor(`File:${file.replace(/^File:/i, "")}`);
    const info = page?.imageinfo?.[0];
    if (!info) throw new Error(`Missing Commons imageinfo for ${file}`);
    const imageUrl = info.thumburl || info.url;
    if (!imageUrl) throw new Error(`Missing URL for ${file}`);
    const ext = info.extmetadata ?? {};
    const creator = cleanCreator(ext.Artist?.Value ?? ext.Artist?.value);
    const license = cleanText(ext.LicenseShortName?.Value ?? ext.LicenseShortName?.value) || null;
    const rawLicUrl = cleanText(ext.LicenseUrl?.Value ?? ext.LicenseUrl?.value);
    const licenseUrl = /^https?:\/\//i.test(rawLicUrl) ? rawLicUrl : null;
    const photoYear = parsePhotoYear(ext);
    const attributionText = buildAttribution(ext, creator, license);
    imageInfo.set(file, {
      imageUrl,
      sourceUrl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replace(/^File:/i, ""))}`,
      creator,
      license,
      licenseUrl,
      attributionText,
      photoYear,
    });
  }
}
console.log(`Resolved ${imageInfo.size}/${allFiles.length} Wikimedia Commons images`);

// === Verify external non-Wikimedia source URLs return HTTP 200 ===
const candidateUrls = [
  ...new Set(
    SPECS.flatMap((s) => [
      s.originSource,
      s.currentSource,
      ...(s.extraSources ?? []).map((x) => x.url),
    ]).filter(
      (u) =>
        u &&
        !u.includes("wikipedia.org") &&
        !u.includes("wikidata.org") &&
        !u.includes("wikivoyage.org"),
    ),
  ),
];
const verifiedUrls = new Set();
for (let i = 0; i < candidateUrls.length; i += 6) {
  const batch = candidateUrls.slice(i, i + 6);
  await Promise.all(
    batch.map(async (url) => {
      try {
        const r = await fetch(url, {
          headers: { "User-Agent": UA },
          signal: AbortSignal.timeout(15_000),
        });
        await r.arrayBuffer().catch(() => {});
        if (r.status >= 200 && r.status < 400) verifiedUrls.add(url);
      } catch {
        // Leave out unreachable URLs rather than storing dead links
      }
    }),
  );
}
console.log(
  `Verified ${verifiedUrls.size}/${candidateUrls.length} non-Wikimedia source URLs HTTP 200`,
);

// === Build seedEntries, seedMedia, seedSources ===
const summaryOriginCounts = { unesco: 0, nmp: 0, louvre: 0, wikipedia: 0 };
const seedEntries = SPECS.map((s) => {
  const whc = s.whcId ? whcById.get(s.whcId) : null;
  const nmp = s.nmpPageSlug ? nmpBySlug.get(s.nmpPageSlug) : null;

  // Choose primary summary across UNESCO WHC, National Museum PH, Louvre, and Wikipedia
  let summary = wikiSummaries.get(s.wikiTitle).summary;
  let usedNonWikiSummary = false;
  if (s.preferNmpSummary && nmp?.summary && nmp.summary.length >= 90) {
    summary = nmp.summary;
    summaryOriginCounts.nmp++;
    usedNonWikiSummary = true;
  } else if (s.preferWhcSummary && whc?.short_description_en) {
    const whcSum = multiSentenceSummary(whc.short_description_en, 440);
    if (whcSum && whcSum.length >= 90) {
      summary = whcSum;
      summaryOriginCounts.unesco++;
      usedNonWikiSummary = true;
    }
  } else if (s.louvreArkId && louvreData) {
    const locationNote = louvreData.currentLocation
      ? ` Held at the Musée du Louvre (${cleanText(louvreData.currentLocation)}).`
      : "";
    const combined = `${summary}${locationNote}`;
    summary = combined.length <= 480 ? combined : summary;
    summaryOriginCounts.louvre++;
    usedNonWikiSummary = true;
  }
  if (!usedNonWikiSummary) summaryOriginCounts.wikipedia++;

  // Enrich significance with UNESCO WHC justification/criteria when available
  let significance = s.significance;
  if (whc?.criteria_txt && whc?.date_inscribed) {
    const just = multiSentenceSummary(whc.justification_en ?? "", 260);
    if (!significance.includes(whc.criteria_txt)) {
      significance = `${significance} UNESCO World Heritage criteria ${whc.criteria_txt} (inscribed ${whc.date_inscribed})${just ? `: ${just}` : "."}`;
    }
  }

  const originSource =
    s.originSource && (verifiedUrls.has(s.originSource) || s.originSource.includes("wikidata.org"))
      ? s.originSource
      : `https://www.wikidata.org/wiki/${s.qid}`;
  const currentSource =
    s.current && s.currentSource
      ? verifiedUrls.has(s.currentSource) || s.currentSource.includes("wikidata.org")
        ? s.currentSource
        : `https://www.wikidata.org/wiki/${s.qid}`
      : null;

  return {
    id: s.id,
    title: s.title,
    slug: s.slug,
    scope: s.scope,
    entryType: s.entryType,
    era: s.era,
    startYear: s.startYear,
    endYear: s.endYear,
    dateIsApproximate: s.dateIsApproximate,
    locationName: s.locationName,
    summary,
    significance,
    origin: s.origin,
    current: s.current ?? null,
    originPrecision: s.originPrecision,
    currentPrecision: s.current ? s.currentPrecision : null,
    originSource,
    currentSource,
    reviewed: false,
  };
});
console.log("Primary summary sources:", summaryOriginCounts);

const seedMedia = [];
for (const s of SPECS) {
  for (const m of s.media) {
    const info = imageInfo.get(m.file);
    let period = "unknown";
    if (!m.isArtworkReproduction) {
      if (m.periodOverride) period = m.periodOverride;
      else if (info.photoYear !== null && info.photoYear <= 1960) period = "archival";
      else if (info.photoYear !== null && info.photoYear >= 1990) period = "modern";
    }
    seedMedia.push({
      id: m.id,
      entryId: s.id,
      imageUrl: info.imageUrl,
      sourceUrl: info.sourceUrl,
      caption: m.caption,
      period,
      photoYear: info.photoYear,
      creator: info.creator,
      license: info.license,
      licenseUrl: info.licenseUrl,
      attributionText: info.attributionText,
      comparisonGroup: m.comparisonGroup ?? null,
    });
  }
}

const seedSources = [];
let srcIdx = 1;
for (const s of SPECS) {
  const seenUrls = new Set();
  const pushSource = (source) => {
    if (!source.url || seenUrls.has(source.url)) return;
    seenUrls.add(source.url);
    seedSources.push({
      id: `s-${srcIdx++}`,
      entryId: s.id,
      accessedAt: ACCESSED_AT,
      ...source,
    });
  };

  const whc = s.whcId ? whcById.get(s.whcId) : null;
  if (whc) {
    pushSource({
      title: `UNESCO WHC #${whc.id_no}: ${cleanText(whc.name_en)}`,
      url: `https://data.unesco.org/explore/dataset/whc001/?q=${encodeURIComponent(String(whc.id_no))}`,
      publisher: "UNESCO World Heritage Centre",
      sourceType: "heritage registry",
    });
  }

  const nmp = s.nmpPageSlug ? nmpBySlug.get(s.nmpPageSlug) : null;
  if (nmp && verifiedUrls.has(nmp.url)) {
    pushSource({
      title: `National Museum of the Philippines: ${nmp.title}`,
      url: nmp.url,
      publisher: "National Museum of the Philippines",
      sourceType: "museum catalogue",
    });
  }

  for (const extra of s.extraSources ?? []) {
    if (verifiedUrls.has(extra.url)) {
      pushSource(extra);
    }
  }

  pushSource({
    title: `Wikidata: ${s.title}`,
    url: `https://www.wikidata.org/wiki/${s.qid}`,
    publisher: "Wikidata",
    sourceType: "knowledge base",
  });

  const wv = s.wikivoyageTitle ? wikivoyageByTitle.get(s.wikivoyageTitle) : null;
  if (wv) {
    pushSource({
      title: `Wikivoyage: ${wv.title}`,
      url: wv.url,
      publisher: "Wikivoyage",
      sourceType: "travel heritage guide",
    });
  }

  const wp = wikiSummaries.get(s.wikiTitle);
  if (wp) {
    pushSource({
      title: s.title,
      url: wp.url,
      publisher: "Wikipedia",
      sourceType: "encyclopedia",
    });
  }
}

// === Verify HTTP 200 on every single media URL ===
console.log(`Verifying HTTP 200 on all ${seedMedia.length} curated media URLs...`);
const uniqueMediaUrls = [...new Set(seedMedia.map((m) => m.imageUrl))];
const urlStatus = new Map();
for (let i = 0; i < uniqueMediaUrls.length; i += 5) {
  const chunk = uniqueMediaUrls.slice(i, i + 5);
  await Promise.all(
    chunk.map(async (url) => {
      let status = 0;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          let r = await fetch(url, {
            method: "HEAD",
            headers: { "User-Agent": UA },
            signal: AbortSignal.timeout(25_000),
          });
          if (r.status === 405) {
            r = await fetch(url, {
              method: "GET",
              headers: { "User-Agent": UA, Range: "bytes=0-0" },
              signal: AbortSignal.timeout(25_000),
            });
          }
          status = r.status;
          if (status === 200 || status === 206) break;
          await sleep(1500);
        } catch {
          await sleep(1500);
        }
      }
      urlStatus.set(url, status);
    }),
  );
  await sleep(250);
}
const badUrls = [...urlStatus.entries()].filter(([, st]) => st !== 200 && st !== 206);
if (badUrls.length) {
  throw new Error(`Non-200 image URLs detected: ${JSON.stringify(badUrls)}`);
}
console.log(
  `All ${uniqueMediaUrls.length}/${uniqueMediaUrls.length} unique media URLs returned HTTP 200!`,
);

// === Sanity checks ===
const entryIds = new Set(seedEntries.map((e) => e.id));
const slugs = new Set(seedEntries.map((e) => e.slug));
if (slugs.size !== seedEntries.length) throw new Error("Duplicate curated slug detected");
for (const e of seedEntries) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(e.slug)) throw new Error(`Invalid slug: ${e.slug}`);
  if (e.reviewed !== false) throw new Error(`Entry ${e.id} must have reviewed: false`);
  if (e.scope === "local" && e.entryType === "place") {
    const srcTitles = seedSources.filter((s) => s.entryId === e.id).map((s) => s.title);
    const hay = [e.title, e.era ?? "", e.locationName ?? "", ...srcTitles].join(" ").toLowerCase();
    if (hay.includes("walls")) throw new Error(`Forbidden test substring "walls" in ${e.id}`);
  }
}
const linkPairs = new Set();
for (const l of LINKS) {
  if (!entryIds.has(l.sourceId) || !entryIds.has(l.targetId)) {
    throw new Error(`Broken link endpoints in ${l.id}`);
  }
  if (l.sourceId === l.targetId) throw new Error(`Self link in ${l.id}`);
  const key = `${l.sourceId}|${l.targetId}|${l.relationshipType}`;
  if (linkPairs.has(key)) throw new Error(`Duplicate typed link ${key}`);
  linkPairs.add(key);
}

const groups = new Map();
for (const m of seedMedia) {
  if (!m.comparisonGroup) continue;
  const arr = groups.get(m.comparisonGroup) ?? [];
  arr.push(m);
  groups.set(m.comparisonGroup, arr);
}
for (const [g, items] of groups) {
  const arch = items.find((x) => x.period === "archival");
  const mod = items.find((x) => x.period === "modern");
  if (!arch || !mod) throw new Error(`Incomplete comparison group ${g}`);
  if (arch.photoYear === null || arch.photoYear > 1960) {
    throw new Error(`Comparison group ${g} archival photoYear invalid: ${arch.photoYear}`);
  }
  if (mod.photoYear === null || mod.photoYear < 1990) {
    throw new Error(`Comparison group ${g} modern photoYear invalid: ${mod.photoYear}`);
  }
}

// === Write src/data/seed.ts ===
const seedTs = `// Generated by scripts/build-curated-corpus.mjs from live UNESCO World Heritage Open Data,
// National Museum of the Philippines, Musée du Louvre, Wikidata, Wikivoyage, Wikipedia,
// Wikimedia Commons, and verified official heritage institution sources.
// Every entry is an unreviewed draft with provenance preserved.

import type { EntryLink, HistoricalEntry, MediaItem, SourceRef } from "../types/atlas";

export const seedEntries: HistoricalEntry[] = ${JSON.stringify(seedEntries, null, 2)};

export const seedMedia: MediaItem[] = ${JSON.stringify(seedMedia, null, 2)};

export const seedLinks: EntryLink[] = ${JSON.stringify(LINKS, null, 2)};

export const seedSources: SourceRef[] = ${JSON.stringify(seedSources, null, 2)};
`;
await writeFile(seedPath, seedTs, "utf8");

const srcByType = seedSources.reduce((acc, s) => {
  acc[s.sourceType] = (acc[s.sourceType] ?? 0) + 1;
  return acc;
}, {});
console.log(
  `Wrote ${seedEntries.length} curated entries, ${seedMedia.length} media items, ${LINKS.length} links, ${seedSources.length} sources to src/data/seed.ts`,
);
console.log("Curated sources by type:", srcByType);

// === Write idempotent supabase/seed.sql ===
const sqlStr = (v) =>
  v === null || v === undefined ? "null" : `'${String(v).replaceAll("'", "''")}'`;
const sqlInt = (v) => (v === null || v === undefined ? "null" : String(Math.trunc(v)));
const sqlBool = (v) => (v ? "true" : "false");
const sqlPoint = (coord) =>
  coord
    ? `st_setsrid(st_makepoint(${coord.longitude}, ${coord.latitude}), 4326)::geography`
    : "null";

const entryRowsSql = seedEntries
  .map(
    (e) =>
      `  (${sqlStr(e.title)}, ${sqlStr(e.slug)}, ${sqlStr(e.scope)}, ${sqlStr(e.entryType)}, ${sqlStr(e.era)}, ${sqlInt(e.startYear)}, ${sqlInt(e.endYear)}, ${sqlBool(e.dateIsApproximate)}, ${sqlStr(e.locationName)}, ${sqlStr(e.summary)}, ${sqlStr(e.significance)}, ${sqlPoint(e.origin)}, ${sqlPoint(e.current)}, ${sqlStr(e.originPrecision)}, ${sqlStr(e.currentPrecision)}, ${sqlStr(e.originSource)}, ${sqlStr(e.currentSource)}, ${sqlBool(e.reviewed)})`,
  )
  .join(",\n");

const slugById = new Map(seedEntries.map((e) => [e.id, e.slug]));

const mediaInsertSql = (() => {
  const orderCount = new Map();
  return seedMedia
    .map((m) => {
      const slug = slugById.get(m.entryId);
      const order = orderCount.get(m.entryId) ?? 0;
      orderCount.set(m.entryId, order + 1);
      return `insert into public.entry_media (entry_id, image_url, source_url, caption, photo_year, media_period, creator, attribution_text, license, license_url, comparison_group, display_order)
select e.id, ${sqlStr(m.imageUrl)}, ${sqlStr(m.sourceUrl)}, ${sqlStr(m.caption)}, ${sqlInt(m.photoYear)}, ${sqlStr(m.period)}, ${sqlStr(m.creator)}, ${sqlStr(m.attributionText)}, ${sqlStr(m.license)}, ${sqlStr(m.licenseUrl)}, ${sqlStr(m.comparisonGroup)}, ${order}
from public.entries e
where e.slug = ${sqlStr(slug)}
  and not exists (
    select 1 from public.entry_media em
    where em.entry_id = e.id and em.image_url = ${sqlStr(m.imageUrl)}
  );`;
    })
    .join("\n\n");
})();

const sourceInsertSql = seedSources
  .map((s) => {
    const slug = slugById.get(s.entryId);
    return `insert into public.entry_sources (entry_id, source_title, source_url, publisher, source_type)
select e.id, ${sqlStr(s.title)}, ${sqlStr(s.url)}, ${sqlStr(s.publisher)}, ${sqlStr(s.sourceType)}
from public.entries e
where e.slug = ${sqlStr(slug)}
  and not exists (
    select 1 from public.entry_sources es
    where es.entry_id = e.id and es.source_url = ${sqlStr(s.url)}
  );`;
  })
  .join("\n\n");

const linkInsertSql = LINKS.map((l) => {
  const srcSlug = slugById.get(l.sourceId);
  const tgtSlug = slugById.get(l.targetId);
  return `insert into public.entry_links (source_id, target_id, relationship_type, relationship_label, description)
select a.id, b.id, ${sqlStr(l.relationshipType)}, ${sqlStr(l.relationshipLabel)}, ${sqlStr(l.description)}
from public.entries a, public.entries b
where a.slug = ${sqlStr(srcSlug)} and b.slug = ${sqlStr(tgtSlug)}
on conflict (source_id, target_id, relationship_type) do update set
  relationship_label = excluded.relationship_label,
  description = excluded.description;`;
}).join("\n\n");

const seedSql = `-- Generated by scripts/build-curated-corpus.mjs from the multi-source ChronoAtlas curated corpus.
-- Idempotent seed script: safe to re-run after supabase/migrations/0001_initial.sql.

insert into public.entries (
  title, slug, scope, entry_type, era, start_year, end_year, date_is_approximate,
  location_name, summary, significance, origin_location, current_location,
  origin_coordinate_precision, current_coordinate_precision,
  origin_coordinate_source, current_coordinate_source, reviewed
) values
${entryRowsSql}
on conflict (slug) do update set
  title = excluded.title,
  scope = excluded.scope,
  entry_type = excluded.entry_type,
  era = excluded.era,
  start_year = excluded.start_year,
  end_year = excluded.end_year,
  date_is_approximate = excluded.date_is_approximate,
  location_name = excluded.location_name,
  summary = excluded.summary,
  significance = excluded.significance,
  origin_location = excluded.origin_location,
  current_location = excluded.current_location,
  origin_coordinate_precision = excluded.origin_coordinate_precision,
  current_coordinate_precision = excluded.current_coordinate_precision,
  origin_coordinate_source = excluded.origin_coordinate_source,
  current_coordinate_source = excluded.current_coordinate_source,
  reviewed = excluded.reviewed;

${mediaInsertSql}

${sourceInsertSql}

${linkInsertSql}
`;

await writeFile(sqlPath, seedSql, "utf8");
console.log(
  `Wrote idempotent supabase/seed.sql (${seedEntries.length} entries, ${seedMedia.length} media, ${seedSources.length} sources, ${LINKS.length} links, ${groups.size} comparison pairs)`,
);
