import {
  mkdir,
  readFile,
  writeFile
} from "node:fs/promises";

import path from "node:path";
import process from "node:process";

const METADATA_FILE = "icons-metadata.json";
const RULES_FILE = "metadata-rules.json";
const OUTPUT_FILE = "metadata-suggestions.json";

const CACHE_DIRECTORY = ".cache/metadata-enrichment";
const OFFICIAL_SITE_CACHE_DIRECTORY = path.join(
  CACHE_DIRECTORY,
  "official-sites"
);

const USER_AGENT =
  "SociconMetadataEnrichment/2.0 " +
  "(https://github.com/Ybbet/socicon)";

const REQUEST_TIMEOUT = 12_000;
const REQUEST_DELAY = 250;
const MAXIMUM_SOURCE_TEXT_LENGTH = 8_000;

const argumentsList = process.argv.slice(2);
const argumentsSet = new Set(argumentsList);

const forceRefresh = argumentsSet.has("--force");
const includeAll = argumentsSet.has("--all");

const onlyMissingTags =
  argumentsSet.has("--missing-tags");

const onlyInvalidCategories =
  argumentsSet.has("--invalid-categories");

const replaceTags =
  argumentsSet.has("--replace-tags");

const iconArgumentIndex =
  argumentsList.indexOf("--icon");

const selectedIcon =
  iconArgumentIndex !== -1
    ? argumentsList[iconArgumentIndex + 1]
    : null;

if (
  iconArgumentIndex !== -1 &&
  !selectedIcon
) {
  console.error(
    'The "--icon" option requires an icon identifier.'
  );

  process.exit(1);
}

/**
 * Categories are inferred only when the current category is missing
 * or invalid.
 *
 * Existing valid categories are always preserved.
 */
const CATEGORY_KEYWORDS = {
  Academic: [
    "academic",
    "course",
    "education",
    "educational",
    "learning",
    "research",
    "school",
    "student",
    "teacher",
    "training course",
    "university"
  ],

  Communication: [
    "audio call",
    "call",
    "chat",
    "communication",
    "conference",
    "encrypted messaging",
    "instant messaging",
    "message",
    "messaging",
    "video call",
    "voice call"
  ],

  Community: [
    "answer",
    "community",
    "discussion",
    "forum",
    "knowledge sharing",
    "online community",
    "question",
    "user community"
  ],

  Design: [
    "3d model",
    "creative platform",
    "design",
    "designer",
    "illustration",
    "portfolio",
    "prototype",
    "visual design"
  ],

  Development: [
    "api",
    "code hosting",
    "coding",
    "developer platform",
    "development platform",
    "git repository",
    "open source",
    "programming",
    "software development",
    "source code"
  ],

  Gaming: [
    "esports",
    "game launcher",
    "gaming",
    "gaming community",
    "mmorpg",
    "online game",
    "video game"
  ],

  Marketplace: [
    "buy and sell",
    "e-commerce",
    "ecommerce",
    "marketplace",
    "online marketplace",
    "online shopping",
    "retail",
    "shopping"
  ],

  Music: [
    "album",
    "artist",
    "audio platform",
    "digital music",
    "dj",
    "music",
    "musician",
    "playlist",
    "radio",
    "song"
  ],

  Photography: [
    "camera",
    "image hosting",
    "photo",
    "photographer",
    "photography",
    "picture",
    "stock image",
    "stock photo"
  ],

  Places: [
    "hotel",
    "local business",
    "location",
    "map",
    "place",
    "restaurant",
    "travel",
    "travel booking"
  ],

  Professional: [
    "business network",
    "career",
    "employment",
    "freelance",
    "job",
    "professional",
    "professional network",
    "recruitment",
    "work"
  ],

  Services: [
    "automation",
    "cloud service",
    "integration",
    "online service",
    "payment service",
    "productivity",
    "software service",
    "tool",
    "workflow"
  ],

  Social: [
    "microblogging",
    "social app",
    "social media",
    "social network",
    "social networking"
  ],

  Sport: [
    "athlete",
    "cycling",
    "fitness",
    "running",
    "sport",
    "sports",
    "training"
  ],

  Streaming: [
    "broadcast",
    "live stream",
    "livestream",
    "media streaming",
    "on-demand",
    "streaming"
  ],

  System: [
    "browser",
    "desktop environment",
    "linux distribution",
    "operating system",
    "software platform",
    "system software",
    "web browser"
  ],

  Transport: [
    "car",
    "driver",
    "mobility",
    "ride",
    "ridesharing",
    "taxi",
    "transport",
    "vehicle"
  ],

  Video: [
    "film",
    "movie",
    "short video",
    "video hosting",
    "video platform",
    "video sharing"
  ]
};

/**
 * Tags are suggested from explicit expressions found on the official
 * website.
 *
 * Multi-word expressions are preferred because they are generally
 * less ambiguous than isolated words.
 */
const TAG_KEYWORDS = {
  "3d": [
    "3d model",
    "3d models",
    "three-dimensional"
  ],

  academic: [
    "academic research",
    "academic community"
  ],

  answer: [
    "answer questions",
    "answers"
  ],

  app: [
    "mobile app",
    "desktop app",
    "web app"
  ],

  artist: [
    "independent artist",
    "music artist",
    "artists"
  ],

  audio: [
    "audio platform",
    "audio content",
    "digital audio"
  ],

  automation: [
    "workflow automation",
    "automate",
    "automation"
  ],

  blog: [
    "blog platform",
    "publish blog",
    "blogging"
  ],

  browser: [
    "web browser",
    "internet browser"
  ],

  business: [
    "business platform",
    "business network",
    "business service"
  ],

  call: [
    "audio call",
    "video call",
    "voice call"
  ],

  career: [
    "career opportunities",
    "career network"
  ],

  chat: [
    "group chat",
    "online chat",
    "private chat"
  ],

  cloud: [
    "cloud platform",
    "cloud service",
    "cloud storage"
  ],

  code: [
    "source code",
    "code hosting",
    "write code"
  ],

  collaboration: [
    "team collaboration",
    "collaboration platform",
    "collaborative platform"
  ],

  community: [
    "online community",
    "user community",
    "global community"
  ],

  creator: [
    "content creator",
    "digital creator",
    "creators"
  ],

  design: [
    "design platform",
    "visual design",
    "creative design"
  ],

  developer: [
    "developer platform",
    "software developer",
    "web developer"
  ],

  ecommerce: [
    "e-commerce",
    "ecommerce",
    "online commerce"
  ],

  education: [
    "online education",
    "educational platform",
    "online learning"
  ],

  encrypted: [
    "end-to-end encryption",
    "encrypted communication",
    "encrypted messaging"
  ],

  feed: [
    "rss feed",
    "news feed",
    "content feed"
  ],

  film: [
    "film platform",
    "films and movies",
    "movie platform"
  ],

  fitness: [
    "fitness tracking",
    "fitness platform",
    "workout"
  ],

  forum: [
    "discussion forum",
    "online forum",
    "community forum"
  ],

  freelance: [
    "freelance marketplace",
    "freelance platform",
    "freelancer"
  ],

  gaming: [
    "gaming platform",
    "gaming community",
    "video game",
    "online game"
  ],

  git: [
    "git repository",
    "git repositories",
    "git hosting"
  ],

  integration: [
    "app integration",
    "software integration",
    "integrations"
  ],

  job: [
    "job marketplace",
    "job search",
    "job opportunities",
    "recruitment platform"
  ],

  knowledge: [
    "knowledge sharing",
    "knowledge platform",
    "knowledge community"
  ],

  live: [
    "live broadcast",
    "live stream",
    "livestream"
  ],

  location: [
    "location based",
    "local places",
    "nearby places"
  ],

  map: [
    "online map",
    "mapping platform",
    "interactive map"
  ],

  marketplace: [
    "online marketplace",
    "digital marketplace",
    "buy and sell"
  ],

  message: [
    "instant messaging",
    "private messaging",
    "secure messaging",
    "send messages"
  ],

  mobile: [
    "mobile app",
    "mobile platform",
    "smartphone app"
  ],

  money: [
    "financial service",
    "money transfer",
    "digital finance"
  ],

  music: [
    "music platform",
    "music streaming",
    "digital music",
    "listen to music"
  ],

  network: [
    "professional network",
    "social network",
    "social networking"
  ],

  "open source": [
    "open source",
    "open-source"
  ],

  "operating system": [
    "operating system",
    "mobile operating system",
    "desktop operating system"
  ],

  payment: [
    "online payment",
    "payment platform",
    "payment service",
    "money transfer"
  ],

  photo: [
    "photo sharing",
    "photography platform",
    "share photos",
    "stock photo",
    "stock image"
  ],

  playlist: [
    "music playlist",
    "audio playlist",
    "playlists"
  ],

  podcast: [
    "podcast platform",
    "listen to podcasts",
    "podcasts"
  ],

  portfolio: [
    "creative portfolio",
    "online portfolio",
    "design portfolio"
  ],

  privacy: [
    "privacy focused",
    "privacy-focused",
    "private communication",
    "protect your privacy"
  ],

  programming: [
    "programming platform",
    "programming community",
    "programming language"
  ],

  question: [
    "ask questions",
    "questions and answers",
    "question and answer"
  ],

  radio: [
    "online radio",
    "internet radio",
    "radio station"
  ],

  repository: [
    "code repository",
    "git repository",
    "software repository"
  ],

  restaurant: [
    "restaurant booking",
    "restaurant review",
    "find restaurants"
  ],

  retail: [
    "online retail",
    "retail marketplace",
    "retail platform"
  ],

  review: [
    "customer reviews",
    "user reviews",
    "business reviews"
  ],

  ride: [
    "ride sharing",
    "ridesharing",
    "book a ride"
  ],

  search: [
    "search engine",
    "web search",
    "search platform"
  ],

  shopping: [
    "online shopping",
    "shopping platform",
    "shop online"
  ],

  social: [
    "social app",
    "social media",
    "social network",
    "social networking"
  ],

  sport: [
    "sports platform",
    "sports community",
    "sport tracking"
  ],

  store: [
    "app store",
    "online store",
    "digital store"
  ],

  stream: [
    "music streaming",
    "video streaming",
    "media streaming",
    "stream content"
  ],

  support: [
    "customer support",
    "support platform",
    "support service"
  ],

  travel: [
    "travel platform",
    "travel booking",
    "travel service",
    "book accommodation"
  ],

  video: [
    "video platform",
    "video hosting",
    "video sharing",
    "share videos"
  ],

  voice: [
    "voice chat",
    "voice call",
    "voice communication"
  ],

  web: [
    "web platform",
    "web service",
    "website builder"
  ],

  workflow: [
    "workflow automation",
    "automated workflow",
    "business workflow"
  ]
};

async function readJson(file) {
  try {
    return JSON.parse(
      await readFile(file, "utf8")
    );
  } catch (error) {
    console.error(
      `Unable to read ${file}: ${error.message}`
    );

    process.exit(1);
  }
}

async function readJsonIfExists(file) {
  try {
    return JSON.parse(
      await readFile(file, "utf8")
    );
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }

    console.error(
      `Unable to read ${file}: ${error.message}`
    );

    process.exit(1);
  }
}

async function writeJson(file, value) {
  await writeFile(
    file,
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8"
  );
}

function normalizeText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSearchText(value) {
  return normalizeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function normalizeTag(value) {
  return normalizeSearchText(value);
}

function unique(values) {
  return [...new Set(values)];
}

function sortStrings(values) {
  return [...values].sort(
    (first, second) =>
      first.localeCompare(
        second,
        "en",
        {
          sensitivity: "base",
          numeric: true
        }
      )
  );
}

function arraysAreEqual(first, second) {
  return (
    first.length === second.length &&
    first.every(
      (value, index) =>
        value === second[index]
    )
  );
}

function escapeFileName(value) {
  return encodeURIComponent(value)
    .replaceAll("%", "_")
    .replaceAll("/", "_");
}

function decodeHtmlEntities(value) {
  return String(value ?? "")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replace(/&#(\d+);/g, (_, code) =>
      String.fromCodePoint(Number(code))
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(
        parseInt(code, 16)
      )
    );
}

function stripHtml(value) {
  return decodeHtmlEntities(
    String(value ?? "")
      .replace(
        /<script\b[^>]*>[\s\S]*?<\/script>/gi,
        " "
      )
      .replace(
        /<style\b[^>]*>[\s\S]*?<\/style>/gi,
        " "
      )
      .replace(
        /<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi,
        " "
      )
      .replace(
        /<svg\b[^>]*>[\s\S]*?<\/svg>/gi,
        " "
      )
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function delay(milliseconds) {
  return new Promise((resolve) =>
    setTimeout(resolve, milliseconds)
  );
}

async function fetchWithTimeout(
  url,
  options = {},
  timeout = REQUEST_TIMEOUT
) {
  const controller = new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    timeout
  );

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml," +
          "application/json;q=0.9,*/*;q=0.8",
        ...options.headers
      }
    });
  } finally {
    clearTimeout(timer);
  }
}

async function readCache(directory, key) {
  if (forceRefresh) {
    return null;
  }

  const file = path.join(
    directory,
    `${escapeFileName(key)}.json`
  );

  try {
    return JSON.parse(
      await readFile(file, "utf8")
    );
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(
        `Unable to read cache file ${file}: ` +
        `${error.message}`
      );
    }

    return null;
  }
}

async function writeCache(
  directory,
  key,
  value
) {
  await mkdir(
    directory,
    {
      recursive: true
    }
  );

  const file = path.join(
    directory,
    `${escapeFileName(key)}.json`
  );

  await writeJson(file, value);
}

function getMetaContent(
  html,
  attributeName
) {
  const escapedAttributeName =
    attributeName.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

  const patterns = [
    new RegExp(
      `<meta[^>]+property=["']${escapedAttributeName}["']` +
      `[^>]+content=["']([^"']*)["'][^>]*>`,
      "i"
    ),

    new RegExp(
      `<meta[^>]+content=["']([^"']*)["']` +
      `[^>]+property=["']${escapedAttributeName}["'][^>]*>`,
      "i"
    ),

    new RegExp(
      `<meta[^>]+name=["']${escapedAttributeName}["']` +
      `[^>]+content=["']([^"']*)["'][^>]*>`,
      "i"
    ),

    new RegExp(
      `<meta[^>]+content=["']([^"']*)["']` +
      `[^>]+name=["']${escapedAttributeName}["'][^>]*>`,
      "i"
    )
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);

    if (match?.[1]) {
      return normalizeText(
        decodeHtmlEntities(match[1])
      );
    }
  }

  return "";
}

function getJsonLdDescriptions(html) {
  const descriptions = [];

  const pattern =
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  for (
    const match of html.matchAll(pattern)
  ) {
    const source = match[1]?.trim();

    if (!source) {
      continue;
    }

    try {
      const parsed = JSON.parse(source);

      collectJsonLdDescriptions(
        parsed,
        descriptions
      );
    } catch {
      /*
       * Invalid or non-standard JSON-LD is ignored.
       */
    }
  }

  return unique(
    descriptions
      .map(normalizeText)
      .filter(Boolean)
  );
}

function collectJsonLdDescriptions(
  value,
  descriptions
) {
  if (!value) {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectJsonLdDescriptions(
        item,
        descriptions
      );
    }

    return;
  }

  if (typeof value !== "object") {
    return;
  }

  if (
    typeof value.description === "string"
  ) {
    descriptions.push(
      value.description
    );
  }

  if (value["@graph"]) {
    collectJsonLdDescriptions(
      value["@graph"],
      descriptions
    );
  }
}

function extractRelevantPageText(html) {
  const metadataText = [
    getMetaContent(
      html,
      "og:description"
    ),

    getMetaContent(
      html,
      "description"
    ),

    getMetaContent(
      html,
      "twitter:description"
    ),

    ...getJsonLdDescriptions(html)
  ]
    .filter(Boolean)
    .join(" ");

  if (metadataText) {
    return normalizeText(
      metadataText
    ).slice(
      0,
      MAXIMUM_SOURCE_TEXT_LENGTH
    );
  }

  /*
   * Visible page text is used only as a fallback because it can
   * contain navigation labels and other unrelated content.
   */
  return stripHtml(html).slice(
    0,
    MAXIMUM_SOURCE_TEXT_LENGTH
  );
}

async function fetchOfficialSite(url) {
  if (!url) {
    return null;
  }

  const cached = await readCache(
    OFFICIAL_SITE_CACHE_DIRECTORY,
    url
  );

  if (cached) {
    return cached;
  }

  try {
    const response =
      await fetchWithTimeout(url);

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status} ` +
        `${response.statusText}`
      );
    }

    const contentType =
      response.headers.get(
        "content-type"
      ) ?? "";

    if (
      !contentType.includes("text/html")
    ) {
      throw new Error(
        `Unsupported content type: ` +
        `${contentType}`
      );
    }

    const html = await response.text();

    const result = {
      requestedUrl: url,
      finalUrl: response.url,
      sourceText:
        extractRelevantPageText(html),
      status: response.status
    };

    await writeCache(
      OFFICIAL_SITE_CACHE_DIRECTORY,
      url,
      result
    );

    return result;
  } catch (error) {
    const result = {
      requestedUrl: url,
      error: error.message
    };

    await writeCache(
      OFFICIAL_SITE_CACHE_DIRECTORY,
      url,
      result
    );

    return result;
  }
}

function containsKeyword(
  sourceText,
  keyword
) {
  const normalizedSource =
    normalizeSearchText(sourceText);

  const normalizedKeyword =
    normalizeSearchText(keyword);

  if (!normalizedKeyword) {
    return false;
  }

  const escapedKeyword =
    normalizedKeyword.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

  const pattern = new RegExp(
    `(^|[^a-z0-9])${escapedKeyword}` +
    `([^a-z0-9]|$)`,
    "i"
  );

  return pattern.test(
    normalizedSource
  );
}

function scoreKeywordList(
  sourceText,
  keywords
) {
  let score = 0;
  const matches = [];

  for (const keyword of keywords) {
    if (
      !containsKeyword(
        sourceText,
        keyword
      )
    ) {
      continue;
    }

    const normalizedKeyword =
      normalizeSearchText(keyword);

    const keywordScore =
      normalizedKeyword.includes(" ")
        ? 3
        : 1;

    score += keywordScore;
    matches.push(keyword);
  }

  return {
    score,
    matches
  };
}

function scoreCategories(
  sourceText,
  allowedCategories
) {
  const results = [];

  for (
    const [category, keywords]
    of Object.entries(
      CATEGORY_KEYWORDS
    )
  ) {
    if (
      allowedCategories.size > 0 &&
      !allowedCategories.has(category)
    ) {
      continue;
    }

    const result =
      scoreKeywordList(
        sourceText,
        keywords
      );

    if (result.score === 0) {
      continue;
    }

    results.push({
      category,
      score: result.score,
      matches: result.matches
    });
  }

  results.sort(
    (first, second) => {
      if (
        second.score !== first.score
      ) {
        return (
          second.score -
          first.score
        );
      }

      return first.category.localeCompare(
        second.category,
        "en"
      );
    }
  );

  return results;
}

function extractTagMatches(sourceText) {
  const results = [];

  for (
    const [tag, keywords]
    of Object.entries(TAG_KEYWORDS)
  ) {
    const result =
      scoreKeywordList(
        sourceText,
        keywords
      );

    /*
     * Require either one explicit multi-word expression or at least
     * two matching expressions before suggesting a tag.
     */
    const hasExplicitPhrase =
      result.matches.some(
        (keyword) =>
          normalizeSearchText(
            keyword
          ).includes(" ")
      );

    if (
      result.score < 2 &&
      !hasExplicitPhrase
    ) {
      continue;
    }

    results.push({
      tag,
      score: result.score,
      matches: result.matches
    });
  }

  results.sort(
    (first, second) => {
      if (
        second.score !== first.score
      ) {
        return (
          second.score -
          first.score
        );
      }

      return first.tag.localeCompare(
        second.tag,
        "en"
      );
    }
  );

  return results;
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) {
    return [];
  }

  return sortStrings(
    unique(
      tags
        .map(normalizeTag)
        .filter(Boolean)
    )
  );
}

function buildSuggestedTags({
  currentTags,
  tagMatches,
  maximumTags
}) {
  const extractedTags =
    tagMatches.map(
      (match) => match.tag
    );

  const values = replaceTags
    ? extractedTags
    : [
        ...currentTags,
        ...extractedTags
      ];

  return normalizeTags(values).slice(
    0,
    maximumTags
  );
}

function selectSuggestedCategory({
  currentCategory,
  allowedCategories,
  categoryScores
}) {
  if (
    allowedCategories.has(
      currentCategory
    )
  ) {
    return currentCategory;
  }

  const first = categoryScores[0];
  const second = categoryScores[1];

  if (!first) {
    return null;
  }

  /*
   * Category inference requires strong evidence and a meaningful
   * difference from the second candidate.
   */
  if (first.score < 4) {
    return null;
  }

  if (
    second &&
    first.score - second.score < 2
  ) {
    return null;
  }

  return first.category;
}

function shouldProcessIcon({
  iconId,
  iconMetadata,
  allowedCategories
}) {
  if (
    selectedIcon &&
    iconId !== selectedIcon
  ) {
    return false;
  }

  if (includeAll) {
    return true;
  }

  const tags = normalizeTags(
    iconMetadata.tags
  );

  const hasMissingTags =
    tags.length === 0;

  const hasInvalidCategory =
    !allowedCategories.has(
      iconMetadata.category
    );

  if (
    onlyMissingTags &&
    !hasMissingTags
  ) {
    return false;
  }

  if (
    onlyInvalidCategories &&
    !hasInvalidCategory
  ) {
    return false;
  }

  if (
    onlyMissingTags ||
    onlyInvalidCategories
  ) {
    return true;
  }

  return (
    hasMissingTags ||
    hasInvalidCategory
  );
}

function determineConfidence({
  officialSite,
  currentCategoryIsValid,
  suggestedCategory,
  categoryScores,
  tagMatches,
  suggestedTags
}) {
  if (
    officialSite?.error ||
    !officialSite?.sourceText
  ) {
    return "low";
  }

  let score = 0;

  if (currentCategoryIsValid) {
    score += 2;
  } else if (
    suggestedCategory &&
    categoryScores[0]?.score >= 6
  ) {
    score += 2;
  } else if (suggestedCategory) {
    score += 1;
  }

  if (tagMatches.length >= 3) {
    score += 2;
  } else if (tagMatches.length > 0) {
    score += 1;
  }

  if (suggestedTags.length >= 3) {
    score += 2;
  } else if (suggestedTags.length > 0) {
    score += 1;
  }

  if (score >= 5) {
    return "high";
  }

  if (score >= 3) {
    return "medium";
  }

  return "low";
}

async function enrichIcon(
  iconId,
  iconMetadata,
  rules
) {
  console.log(
    `Processing ${iconId}...`
  );

  const officialSite =
    await fetchOfficialSite(
      iconMetadata.url
    );

  await delay(REQUEST_DELAY);

  const allowedCategories =
    new Set(
      Array.isArray(rules.categories)
        ? rules.categories
        : []
    );

  const currentCategory =
    normalizeText(
      iconMetadata.category
    );

  const currentCategoryIsValid =
    allowedCategories.has(
      currentCategory
    );

  const currentTags =
    normalizeTags(
      iconMetadata.tags
    );

  const sourceText =
    officialSite?.sourceText ?? "";

  const categoryScores =
    scoreCategories(
      sourceText,
      allowedCategories
    );

  const tagMatches =
    extractTagMatches(sourceText);

  const suggestedCategory =
    selectSuggestedCategory({
      currentCategory,
      allowedCategories,
      categoryScores
    });

  const configuredMaximumTags =
    Number(rules.maximumTags);

  const maximumTags =
    configuredMaximumTags > 0
      ? configuredMaximumTags
      : 6;

  const suggestedTags =
    buildSuggestedTags({
      currentTags,
      tagMatches,
      maximumTags
    });

  const warnings = [];

  if (!iconMetadata.url) {
    warnings.push(
      "No official URL is defined."
    );
  }

  if (officialSite?.error) {
    warnings.push(
      `Official website request failed: ` +
      `${officialSite.error}`
    );
  }

  if (
    !officialSite?.error &&
    !sourceText
  ) {
    warnings.push(
      "No relevant text was found on the official website."
    );
  }

  if (
    !currentCategoryIsValid &&
    !suggestedCategory
  ) {
    warnings.push(
      "No reliable category could be suggested."
    );
  }

  if (
    currentTags.length === 0 &&
    suggestedTags.length === 0
  ) {
    warnings.push(
      "No reliable tags could be suggested."
    );
  }

  const sources = [];

  if (officialSite?.finalUrl) {
    sources.push({
      type: "official",
      url: officialSite.finalUrl
    });
  } else if (iconMetadata.url) {
    sources.push({
      type: "official",
      url: iconMetadata.url,
      error:
        officialSite?.error ?? null
    });
  }

  const confidence =
    determineConfidence({
      officialSite,
      currentCategoryIsValid,
      suggestedCategory,
      categoryScores,
      tagMatches,
      suggestedTags
    });

  return {
    approved: false,
    confidence,
    sources,

    current: {
      category: currentCategory,
      tags: currentTags
    },

    suggested: {
      category: suggestedCategory,
      tags: suggestedTags
    },

    evidence: {
      categoryMatches:
        categoryScores.slice(0, 3),

      tagMatches:
        tagMatches.slice(
          0,
          maximumTags
        )
    },

    warnings
  };
}

const metadata =
  await readJson(METADATA_FILE);

const rules =
  await readJson(RULES_FILE);

if (
  metadata === null ||
  Array.isArray(metadata) ||
  typeof metadata !== "object"
) {
  console.error(
    `${METADATA_FILE} must contain a JSON object.`
  );

  process.exit(1);
}

if (
  rules === null ||
  Array.isArray(rules) ||
  typeof rules !== "object"
) {
  console.error(
    `${RULES_FILE} must contain a JSON object.`
  );

  process.exit(1);
}

const allowedCategories =
  new Set(
    Array.isArray(rules.categories)
      ? rules.categories
      : []
  );

if (allowedCategories.size === 0) {
  console.error(
    `${RULES_FILE} does not define any allowed categories.`
  );

  process.exit(1);
}

if (
  selectedIcon &&
  !Object.hasOwn(
    metadata,
    selectedIcon
  )
) {
  console.error(
    `Unknown icon "${selectedIcon}".`
  );

  process.exit(1);
}

await mkdir(
  CACHE_DIRECTORY,
  {
    recursive: true
  }
);

const existingSuggestions =
  await readJsonIfExists(
    OUTPUT_FILE
  );

const suggestions = {
  generatedAt:
    new Date().toISOString(),

  source:
    METADATA_FILE,

  rules:
    RULES_FILE,

  icons: {
    ...(
      existingSuggestions?.icons ??
      {}
    )
  }
};

const iconsToProcess =
  Object.entries(metadata)
    .filter(
      ([iconId, iconMetadata]) =>
        shouldProcessIcon({
          iconId,
          iconMetadata,
          allowedCategories
        })
    );

if (
  iconsToProcess.length === 0
) {
  console.log(
    "No icon requires metadata enrichment."
  );

  process.exit(0);
}

console.log(
  `Found ${iconsToProcess.length} ` +
  `icon(s) to enrich.`
);

console.log("");

let processedCount = 0;
let changedCount = 0;
let unchangedCount = 0;
let failedCount = 0;

for (
  const [iconId, iconMetadata]
  of iconsToProcess
) {
  try {
    const suggestion =
      await enrichIcon(
        iconId,
        iconMetadata,
        rules
      );

    suggestions.icons[iconId] =
      suggestion;

    const categoryChanged =
      suggestion.suggested.category !==
      suggestion.current.category;

    const tagsChanged =
      !arraysAreEqual(
        suggestion.suggested.tags,
        suggestion.current.tags
      );

    if (
      categoryChanged ||
      tagsChanged
    ) {
      changedCount += 1;
    } else {
      unchangedCount += 1;
    }

    processedCount += 1;
  } catch (error) {
    failedCount += 1;

    console.error(
      `Unable to enrich "${iconId}": ` +
      `${error.message}`
    );

    suggestions.icons[iconId] = {
      approved: false,
      confidence: "low",

      sources: [],

      current: {
        category:
          normalizeText(
            iconMetadata.category
          ),

        tags:
          normalizeTags(
            iconMetadata.tags
          )
      },

      suggested: {
        category:
          allowedCategories.has(
            iconMetadata.category
          )
            ? iconMetadata.category
            : null,

        tags:
          normalizeTags(
            iconMetadata.tags
          )
      },

      evidence: {
        categoryMatches: [],
        tagMatches: []
      },

      warnings: [
        `Enrichment failed: ` +
        `${error.message}`
      ]
    };
  }

  /*
   * Save after each icon so that progress is not lost when a later
   * request fails or the process is interrupted.
   */
  await writeJson(
    OUTPUT_FILE,
    suggestions
  );
}

console.log("");
console.log(
  "Metadata enrichment summary"
);
console.log(
  "---------------------------"
);

console.log(
  `Processed : ${processedCount}`
);

console.log(
  `Changed   : ${changedCount}`
);

console.log(
  `Unchanged : ${unchangedCount}`
);

console.log(
  `Failed    : ${failedCount}`
);

console.log("");
console.log(
  `Suggestions written to ` +
  `${OUTPUT_FILE}.`
);

console.log("");
console.log(
  "Review each category and tag suggestion, " +
  'then set "approved" to true before applying it.'
);
