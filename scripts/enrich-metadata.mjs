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
const WIKIPEDIA_CACHE_DIRECTORY = path.join(
  CACHE_DIRECTORY,
  "wikipedia"
);

const USER_AGENT =
  "SociconMetadataEnrichment/1.0 " +
  "(https://github.com/Ybbet/socicon)";

const REQUEST_TIMEOUT = 12_000;
const REQUEST_DELAY = 250;

const argumentsList = process.argv.slice(2);
const argumentsSet = new Set(argumentsList);

const forceRefresh = argumentsSet.has("--force");
const includeAll = argumentsSet.has("--all");
const onlyMissingTags = argumentsSet.has("--missing-tags");
const onlyInvalidCategories =
  argumentsSet.has("--invalid-categories");

const iconArgumentIndex = argumentsList.indexOf("--icon");

const selectedIcon =
  iconArgumentIndex !== -1
    ? argumentsList[iconArgumentIndex + 1]
    : null;

const CATEGORY_KEYWORDS = {
  Academic: [
    "academic",
    "course",
    "education",
    "learning",
    "research",
    "school",
    "student",
    "teacher",
    "university"
  ],
  Communication: [
    "call",
    "chat",
    "communication",
    "conference",
    "encrypted messaging",
    "instant messaging",
    "message",
    "messaging",
    "video call",
    "voice"
  ],
  Community: [
    "answer",
    "community",
    "discussion",
    "forum",
    "knowledge sharing",
    "question",
    "user-generated"
  ],
  Design: [
    "3d model",
    "creative",
    "design",
    "designer",
    "illustration",
    "portfolio",
    "prototype",
    "visual"
  ],
  Development: [
    "api",
    "code",
    "coding",
    "developer",
    "development",
    "git",
    "open source",
    "programming",
    "repository",
    "software development"
  ],
  Gaming: [
    "esports",
    "game",
    "games",
    "gaming",
    "launcher",
    "mmorpg",
    "player",
    "video game"
  ],
  Marketplace: [
    "buy",
    "commerce",
    "e-commerce",
    "ecommerce",
    "marketplace",
    "retail",
    "sell",
    "shopping",
    "store"
  ],
  Music: [
    "album",
    "artist",
    "audio",
    "dj",
    "music",
    "musician",
    "playlist",
    "radio",
    "song"
  ],
  Photography: [
    "camera",
    "image",
    "images",
    "photo",
    "photography",
    "picture",
    "stock photo"
  ],
  Places: [
    "hotel",
    "local business",
    "location",
    "map",
    "place",
    "restaurant",
    "review",
    "travel"
  ],
  Professional: [
    "business",
    "career",
    "company",
    "employment",
    "freelance",
    "job",
    "professional",
    "recruitment",
    "work"
  ],
  Services: [
    "automation",
    "cloud service",
    "integration",
    "online service",
    "payment",
    "productivity",
    "service",
    "tool",
    "workflow"
  ],
  Social: [
    "microblogging",
    "networking service",
    "social",
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
    "on-demand",
    "stream",
    "streaming"
  ],
  System: [
    "browser",
    "desktop environment",
    "linux",
    "operating system",
    "platform",
    "software",
    "system"
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
    "video",
    "video hosting",
    "video sharing"
  ]
};

const TAG_KEYWORDS = {
  "3d": [
    "3d",
    "three-dimensional"
  ],
  academic: [
    "academic"
  ],
  answer: [
    "answer"
  ],
  app: [
    "application",
    "mobile app"
  ],
  artist: [
    "artist"
  ],
  audio: [
    "audio"
  ],
  automation: [
    "automation"
  ],
  blog: [
    "blog",
    "blogging"
  ],
  browser: [
    "browser",
    "web browser"
  ],
  business: [
    "business"
  ],
  call: [
    "call",
    "calling"
  ],
  career: [
    "career"
  ],
  chat: [
    "chat"
  ],
  cloud: [
    "cloud"
  ],
  code: [
    "code",
    "coding"
  ],
  collaboration: [
    "collaboration",
    "collaborative"
  ],
  community: [
    "community"
  ],
  creator: [
    "content creator",
    "creator"
  ],
  design: [
    "design"
  ],
  developer: [
    "developer"
  ],
  ecommerce: [
    "e-commerce",
    "ecommerce"
  ],
  education: [
    "education",
    "learning"
  ],
  encrypted: [
    "encrypted",
    "encryption",
    "end-to-end encryption"
  ],
  feed: [
    "feed",
    "rss"
  ],
  film: [
    "film",
    "movie"
  ],
  fitness: [
    "fitness",
    "training"
  ],
  forum: [
    "forum"
  ],
  freelance: [
    "freelance",
    "freelancer"
  ],
  gaming: [
    "game",
    "games",
    "gaming",
    "video game"
  ],
  git: [
    "git"
  ],
  integration: [
    "integration"
  ],
  job: [
    "employment",
    "job",
    "recruitment"
  ],
  knowledge: [
    "knowledge"
  ],
  live: [
    "live stream",
    "livestream"
  ],
  location: [
    "location"
  ],
  map: [
    "map",
    "mapping"
  ],
  marketplace: [
    "marketplace"
  ],
  message: [
    "instant messaging",
    "message",
    "messaging"
  ],
  mobile: [
    "mobile",
    "smartphone"
  ],
  money: [
    "finance",
    "money"
  ],
  music: [
    "music",
    "song"
  ],
  network: [
    "network",
    "networking"
  ],
  "open source": [
    "open source",
    "open-source"
  ],
  "operating system": [
    "operating system"
  ],
  payment: [
    "payment",
    "transaction"
  ],
  photo: [
    "image",
    "photo",
    "photography",
    "picture"
  ],
  playlist: [
    "playlist"
  ],
  podcast: [
    "podcast"
  ],
  portfolio: [
    "portfolio"
  ],
  privacy: [
    "privacy",
    "private"
  ],
  programming: [
    "programming"
  ],
  question: [
    "question"
  ],
  radio: [
    "radio"
  ],
  repository: [
    "repository",
    "repositories"
  ],
  restaurant: [
    "restaurant"
  ],
  retail: [
    "retail"
  ],
  review: [
    "review",
    "reviews"
  ],
  ride: [
    "ride",
    "ridesharing"
  ],
  search: [
    "search",
    "search engine"
  ],
  shopping: [
    "buy",
    "shopping"
  ],
  social: [
    "social media",
    "social network",
    "social networking"
  ],
  sport: [
    "sport",
    "sports"
  ],
  store: [
    "app store",
    "online store",
    "store"
  ],
  stream: [
    "stream",
    "streaming"
  ],
  support: [
    "support"
  ],
  travel: [
    "hotel",
    "tourism",
    "travel"
  ],
  video: [
    "video",
    "video hosting",
    "video sharing"
  ],
  voice: [
    "voice"
  ],
  web: [
    "web",
    "website"
  ],
  workflow: [
    "workflow"
  ]
};

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    console.error(`Unable to read ${file}: ${error.message}`);
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
  return normalizeText(value).toLowerCase();
}

function normalizeIconName(value) {
  return normalizeText(value)
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeTag(value) {
  return normalizeSearchText(value);
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
    .replaceAll("&#39;", "'")
    .replaceAll("&#x27;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replace(/&#(\d+);/g, (_, code) =>
      String.fromCodePoint(Number(code))
    )
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCodePoint(parseInt(code, 16))
    );
}

function stripHtml(value) {
  return decodeHtmlEntities(
    String(value ?? "")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function shortenDescription(value, maximumLength = 220) {
  const description = normalizeText(value);

  if (description.length <= maximumLength) {
    return description;
  }

  const shortened = description.slice(0, maximumLength + 1);
  const lastSpace = shortened.lastIndexOf(" ");

  return `${shortened.slice(
    0,
    lastSpace > 0 ? lastSpace : maximumLength
  )}…`;
}

function unique(values) {
  return [...new Set(values)];
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
    const response = await fetch(url, {
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

    return response;
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
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(
        `Unable to read cache file ${file}: ${error.message}`
      );
    }

    return null;
  }
}

async function writeCache(directory, key, value) {
  await mkdir(directory, {
    recursive: true
  });

  const file = path.join(
    directory,
    `${escapeFileName(key)}.json`
  );

  await writeJson(file, value);
}

function getMetaContent(html, propertyName) {
  const patterns = [
    new RegExp(
      `<meta[^>]+property=["']${propertyName}["'][^>]+content=["']([^"']*)["'][^>]*>`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${propertyName}["'][^>]*>`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+name=["']${propertyName}["'][^>]+content=["']([^"']*)["'][^>]*>`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${propertyName}["'][^>]*>`,
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

function getHtmlTitle(html) {
  const match = html.match(
    /<title[^>]*>([\s\S]*?)<\/title>/i
  );

  return match?.[1]
    ? normalizeText(
        decodeHtmlEntities(stripHtml(match[1]))
      )
    : "";
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
    const response = await fetchWithTimeout(url);

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status} ${response.statusText}`
      );
    }

    const contentType =
      response.headers.get("content-type") ?? "";

    if (!contentType.includes("text/html")) {
      throw new Error(
        `Unsupported content type: ${contentType}`
      );
    }

    const html = await response.text();

    const result = {
      requestedUrl: url,
      finalUrl: response.url,
      title:
        getMetaContent(html, "og:title") ||
        getHtmlTitle(html),
      description:
        getMetaContent(html, "og:description") ||
        getMetaContent(html, "description") ||
        getMetaContent(html, "twitter:description"),
      siteName: getMetaContent(html, "og:site_name"),
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

async function searchWikipedia(query) {
  const cached = await readCache(
    WIKIPEDIA_CACHE_DIRECTORY,
    query
  );

  if (cached) {
    return cached;
  }

  const parameters = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: query,
    gsrlimit: "3",
    prop: "extracts|info",
    exintro: "1",
    explaintext: "1",
    inprop: "url",
    redirects: "1",
    format: "json",
    origin: "*"
  });

  const url =
    `https://en.wikipedia.org/w/api.php?${parameters}`;

  try {
    const response = await fetchWithTimeout(url, {
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();

    const pages = Object.values(
      data.query?.pages ?? {}
    )
      .map((page) => ({
        pageId: page.pageid,
        title: page.title,
        extract: normalizeText(page.extract),
        url: page.fullurl
      }))
      .sort(
        (first, second) =>
          Number(first.pageId) - Number(second.pageId)
      );

    const result = {
      query,
      pages
    };

    await writeCache(
      WIKIPEDIA_CACHE_DIRECTORY,
      query,
      result
    );

    return result;
  } catch (error) {
    const result = {
      query,
      pages: [],
      error: error.message
    };

    await writeCache(
      WIKIPEDIA_CACHE_DIRECTORY,
      query,
      result
    );

    return result;
  }
}

function selectWikipediaPage(
  pages,
  iconName,
  officialUrl
) {
  if (!Array.isArray(pages) || pages.length === 0) {
    return null;
  }

  const normalizedName =
    normalizeSearchText(iconName);

  let officialHost = "";

  try {
    officialHost = new URL(officialUrl)
      .hostname
      .replace(/^www\./, "")
      .split(".")[0]
      .toLowerCase();
  } catch {
    officialHost = "";
  }

  const scoredPages = pages.map((page) => {
    const title = normalizeSearchText(page.title);
    const extract = normalizeSearchText(page.extract);

    let score = 0;

    if (title === normalizedName) {
      score += 100;
    }

    if (title.startsWith(normalizedName)) {
      score += 50;
    }

    if (title.includes(normalizedName)) {
      score += 30;
    }

    if (
      officialHost &&
      extract.includes(officialHost)
    ) {
      score += 20;
    }

    if (
      extract.includes("company") ||
      extract.includes("service") ||
      extract.includes("platform") ||
      extract.includes("website") ||
      extract.includes("application")
    ) {
      score += 10;
    }

    return {
      ...page,
      score
    };
  });

  scoredPages.sort(
    (first, second) => second.score - first.score
  );

  return scoredPages[0];
}

function scoreCategories(text, allowedCategories) {
  const normalizedText = normalizeSearchText(text);

  const results = [];

  for (
    const [category, keywords]
    of Object.entries(CATEGORY_KEYWORDS)
  ) {
    if (
      allowedCategories.size > 0 &&
      !allowedCategories.has(category)
    ) {
      continue;
    }

    let score = 0;
    const matches = [];

    for (const keyword of keywords) {
      const normalizedKeyword =
        normalizeSearchText(keyword);

      if (normalizedText.includes(normalizedKeyword)) {
        score += normalizedKeyword.includes(" ")
          ? 3
          : 1;

        matches.push(keyword);
      }
    }

    if (score > 0) {
      results.push({
        category,
        score,
        matches
      });
    }
  }

  results.sort((first, second) => {
    if (second.score !== first.score) {
      return second.score - first.score;
    }

    return first.category.localeCompare(
      second.category,
      "en"
    );
  });

  return results;
}

function extractTags(text, maximumTags = 6) {
  const normalizedText = normalizeSearchText(text);
  const matches = [];

  for (
    const [tag, keywords]
    of Object.entries(TAG_KEYWORDS)
  ) {
    let score = 0;

    for (const keyword of keywords) {
      const normalizedKeyword =
        normalizeSearchText(keyword);

      if (normalizedText.includes(normalizedKeyword)) {
        score += normalizedKeyword.includes(" ")
          ? 3
          : 1;
      }
    }

    if (score > 0) {
      matches.push({
        tag,
        score
      });
    }
  }

  matches.sort((first, second) => {
    if (second.score !== first.score) {
      return second.score - first.score;
    }

    return first.tag.localeCompare(
      second.tag,
      "en"
    );
  });

  return unique(
    matches.map((match) => match.tag)
  ).slice(0, maximumTags);
}

function shouldProcessIcon(
  iconId,
  metadata,
  allowedCategories
) {
  if (
    selectedIcon &&
    iconId !== selectedIcon
  ) {
    return false;
  }

  if (includeAll) {
    return true;
  }

  const tags = Array.isArray(metadata.tags)
    ? metadata.tags.filter(Boolean)
    : [];

  const hasMissingTags = tags.length === 0;

  const hasInvalidCategory =
    !allowedCategories.has(metadata.category);

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
    hasInvalidCategory ||
    !metadata.description
  );
}

function determineConfidence({
  officialDescription,
  wikipediaPage,
  categoryScores,
  tags
}) {
  let score = 0;

  if (officialDescription) {
    score += 2;
  }

  if (wikipediaPage?.extract) {
    score += 2;
  }

  if (categoryScores[0]?.score >= 3) {
    score += 2;
  } else if (categoryScores[0]?.score > 0) {
    score += 1;
  }

  if (tags.length >= 3) {
    score += 2;
  } else if (tags.length > 0) {
    score += 1;
  }

  if (score >= 7) {
    return "high";
  }

  if (score >= 4) {
    return "medium";
  }

  return "low";
}

function mergeCurrentAndSuggestedTags(
  currentTags,
  suggestedTags,
  maximumTags
) {
  return unique([
    ...(Array.isArray(currentTags)
      ? currentTags.map(normalizeTag)
      : []),
    ...suggestedTags.map(normalizeTag)
  ])
    .filter(Boolean)
    .slice(0, maximumTags);
}

async function enrichIcon(
  iconId,
  iconMetadata,
  rules
) {
  const name = normalizeIconName(
    iconMetadata.name || iconId
  );

  console.log(`Processing ${iconId}...`);

  const officialSite = await fetchOfficialSite(
    iconMetadata.url
  );

  await delay(REQUEST_DELAY);

  const wikipediaResult = await searchWikipedia(
    `${name} service platform`
  );

  await delay(REQUEST_DELAY);

  const wikipediaPage = selectWikipediaPage(
    wikipediaResult.pages,
    name,
    iconMetadata.url
  );

  const officialDescription =
    officialSite?.description ?? "";

  const wikipediaDescription =
    wikipediaPage?.extract ?? "";

  const combinedText = [
    name,
    officialSite?.title,
    officialSite?.siteName,
    officialDescription,
    wikipediaPage?.title,
    wikipediaDescription,
    ...(Array.isArray(iconMetadata.tags)
      ? iconMetadata.tags
      : [])
  ]
    .filter(Boolean)
    .join(" ");

  const allowedCategories = new Set(
    rules.categories ?? []
  );

  const categoryScores = scoreCategories(
    combinedText,
    allowedCategories
  );

  const currentCategoryIsValid =
    allowedCategories.has(iconMetadata.category);

  const suggestedCategory =
    categoryScores[0]?.category ||
    (
      currentCategoryIsValid
        ? iconMetadata.category
        : null
    );

  const maximumTags =
    Number(rules.maximumTags) > 0
      ? Number(rules.maximumTags)
      : 6;

  const extractedTags = extractTags(
    combinedText,
    maximumTags
  );

  const suggestedTags =
    mergeCurrentAndSuggestedTags(
      iconMetadata.tags,
      extractedTags,
      maximumTags
    );

  const description = shortenDescription(
    officialDescription ||
    wikipediaDescription
  );

  const confidence = determineConfidence({
    officialDescription,
    wikipediaPage,
    categoryScores,
    tags: suggestedTags
  });

  const sources = [];

  if (officialSite?.finalUrl) {
    sources.push({
      type: "official",
      url: officialSite.finalUrl,
      title:
        officialSite.title ||
        officialSite.siteName ||
        name
    });
  } else if (iconMetadata.url) {
    sources.push({
      type: "official",
      url: iconMetadata.url,
      error: officialSite?.error
    });
  }

  if (wikipediaPage?.url) {
    sources.push({
      type: "wikipedia",
      url: wikipediaPage.url,
      title: wikipediaPage.title
    });
  }

  return {
    approved: false,
    confidence,
    sources,
    current: {
      category: iconMetadata.category,
      tags: Array.isArray(iconMetadata.tags)
        ? iconMetadata.tags
        : [],
      description: iconMetadata.description ?? ""
    },
    suggested: {
      category: suggestedCategory,
      tags: suggestedTags,
      description
    },
    evidence: {
      officialDescription:
        officialDescription || null,
      wikipediaExtract:
        wikipediaDescription || null,
      categoryMatches:
        categoryScores.slice(0, 3)
    },
    warnings: [
      ...(officialSite?.error
        ? [
            `Official website request failed: ${officialSite.error}`
          ]
        : []),
      ...(wikipediaResult.error
        ? [
            `Wikipedia request failed: ${wikipediaResult.error}`
          ]
        : []),
      ...(!suggestedCategory
        ? ["No category could be suggested."]
        : []),
      ...(suggestedTags.length === 0
        ? ["No tags could be suggested."]
        : [])
    ]
  };
}

const metadata = await readJson(METADATA_FILE);
const rules = await readJson(RULES_FILE);

const allowedCategories = new Set(
  rules.categories ?? []
);

await mkdir(CACHE_DIRECTORY, {
  recursive: true
});

const existingSuggestions = await readJsonIfExists(
  OUTPUT_FILE
);

const suggestions = {
  generatedAt: new Date().toISOString(),
  source: METADATA_FILE,
  rules: RULES_FILE,
  icons: {
    ...(existingSuggestions?.icons ?? {})
  }
};

async function readJsonIfExists(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
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

const iconsToProcess = Object.entries(metadata)
  .filter(([iconId, iconMetadata]) =>
    shouldProcessIcon(
      iconId,
      iconMetadata,
      allowedCategories
    )
  );

if (iconsToProcess.length === 0) {
  console.log("No icon requires enrichment.");
  process.exit(0);
}

console.log(
  `Found ${iconsToProcess.length} icon(s) to enrich.`
);

console.log("");

let processedCount = 0;
let failedCount = 0;

for (const [iconId, iconMetadata] of iconsToProcess) {
  try {
    suggestions.icons[iconId] =
      await enrichIcon(
        iconId,
        iconMetadata,
        rules
      );

    processedCount += 1;
  } catch (error) {
    failedCount += 1;

    console.error(
      `Unable to enrich "${iconId}": ${error.message}`
    );

    suggestions.icons[iconId] = {
      approved: false,
      confidence: "low",
      current: {
        category: iconMetadata.category,
        tags: iconMetadata.tags ?? [],
        description:
          iconMetadata.description ?? ""
      },
      suggested: {
        category: null,
        tags: [],
        description: ""
      },
      sources: [],
      evidence: {},
      warnings: [
        `Enrichment failed: ${error.message}`
      ]
    };
  }

  await writeJson(
    OUTPUT_FILE,
    suggestions
  );
}

console.log("");
console.log(
  `Processed ${processedCount} icon(s).`
);

console.log(
  `Failed to enrich ${failedCount} icon(s).`
);

console.log(
  `Suggestions written to ${OUTPUT_FILE}.`
);

console.log("");
console.log(
  "Review each suggestion and set " +
  '"approved" to true before applying it.'
);