import {
  access,
  readFile,
  readdir
} from "node:fs/promises";

import process from "node:process";

const SELECTION_FILE = "selection.json";
const METADATA_FILE = "icons-metadata.json";
const RULES_FILE = "metadata-rules.json";
const CHART_JSON_FILE = "chart-list.json";
const CHART_JS_FILE = "chart-list.js";

const SITE_ICONS_FILE = "site/data/icons.json";
const SITE_CATEGORIES_FILE = "site/data/categories.json";
const SITE_TAGS_FILE = "site/data/tags.json";
const SITE_SEARCH_INDEX_FILE =
  "site/data/search-index.json";

const REQUIRED_FILES = [
  SELECTION_FILE,
  METADATA_FILE,
  RULES_FILE,
  CHART_JSON_FILE,
  CHART_JS_FILE,
  "style.css",
  "style.scss",
  "variables.scss",
  SITE_ICONS_FILE,
  SITE_CATEGORIES_FILE,
  SITE_TAGS_FILE,
  SITE_SEARCH_INDEX_FILE
];

const errors = [];
const warnings = [];

async function readJson(file) {
  try {
    return JSON.parse(
      await readFile(file, "utf8")
    );
  } catch (error) {
    fail(
      `Unable to read ${file}: ${error.message}`
    );

    return null;
  }
}

function fail(message) {
  errors.push(message);
}

function warn(message) {
  warnings.push(message);
}

function success(message) {
  console.log(`Success: ${message}`);
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

function normalizeIdentifier(value) {
  return normalizeSearchText(value)
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeTag(value) {
  return normalizeSearchText(value);
}

function normalizeStatus(value) {
  return (
    normalizeSearchText(
      value || "active"
    ) || "active"
  );
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

function normalizeAliases(aliases) {
  if (!Array.isArray(aliases)) {
    return [];
  }

  return sortStrings(
    unique(
      aliases
        .map(normalizeText)
        .filter(Boolean)
    )
  );
}

function arraysAreEqual(
  first,
  second
) {
  return (
    Array.isArray(first) &&
    Array.isArray(second) &&
    first.length === second.length &&
    first.every(
      (value, index) =>
        value === second[index]
    )
  );
}

function valuesAreEqual(
  first,
  second
) {
  return (
    JSON.stringify(first) ===
    JSON.stringify(second)
  );
}

function incrementCounter(
  counter,
  key
) {
  counter.set(
    key,
    (counter.get(key) ?? 0) + 1
  );
}

function buildSearchText(icon) {
  return unique(
    [
      icon.id,
      icon.name,
      icon.category,
      ...icon.tags,
      ...icon.aliases
    ]
      .map(normalizeSearchText)
      .filter(Boolean)
  ).join(" ");
}

function buildSearchTokens(icon) {
  return sortStrings(
    unique(
      buildSearchText(icon)
        .split(/[^a-z0-9]+/)
        .map(normalizeSearchText)
        .filter(
          (token) =>
            token.length >= 2
        )
    )
  );
}

function validateRootObject(
  value,
  file
) {
  if (
    value === null ||
    Array.isArray(value) ||
    typeof value !== "object"
  ) {
    fail(
      `${file} must contain a JSON object.`
    );

    return false;
  }

  return true;
}

function validateRootArray(
  value,
  file
) {
  if (!Array.isArray(value)) {
    fail(
      `${file} must contain a JSON array.`
    );

    return false;
  }

  return true;
}

for (const file of REQUIRED_FILES) {
  try {
    await access(file);
  } catch {
    fail(
      `Required file not found: ${file}`
    );
  }
}

if (errors.length > 0) {
  printResultsAndExit();
}

const selection =
  await readJson(SELECTION_FILE);

const metadata =
  await readJson(METADATA_FILE);

const rules =
  await readJson(RULES_FILE);

const chart =
  await readJson(CHART_JSON_FILE);

const siteIcons =
  await readJson(SITE_ICONS_FILE);

const siteCategories =
  await readJson(SITE_CATEGORIES_FILE);

const siteTags =
  await readJson(SITE_TAGS_FILE);

const siteSearchIndex =
  await readJson(
    SITE_SEARCH_INDEX_FILE
  );

const rootsAreValid = [
  validateRootObject(
    selection,
    SELECTION_FILE
  ),

  validateRootObject(
    metadata,
    METADATA_FILE
  ),

  validateRootObject(
    rules,
    RULES_FILE
  ),

  validateRootArray(
    chart,
    CHART_JSON_FILE
  ),

  validateRootArray(
    siteIcons,
    SITE_ICONS_FILE
  ),

  validateRootArray(
    siteCategories,
    SITE_CATEGORIES_FILE
  ),

  validateRootArray(
    siteTags,
    SITE_TAGS_FILE
  ),

  validateRootArray(
    siteSearchIndex,
    SITE_SEARCH_INDEX_FILE
  )
].every(Boolean);

if (!rootsAreValid) {
  printResultsAndExit();
}

if (!Array.isArray(selection.icons)) {
  fail(
    `${SELECTION_FILE} does not contain ` +
    'a valid "icons" array.'
  );

  printResultsAndExit();
}

if (!Array.isArray(rules.categories)) {
  fail(
    `${RULES_FILE} does not define ` +
    'a valid "categories" array.'
  );
}

if (!Array.isArray(rules.forbiddenTags)) {
  fail(
    `${RULES_FILE} does not define ` +
    'a valid "forbiddenTags" array.'
  );
}

if (errors.length > 0) {
  printResultsAndExit();
}

const allowedCategories =
  new Set(rules.categories);

const forbiddenTags =
  new Set(
    rules.forbiddenTags.map(
      normalizeTag
    )
  );

const tagAliases =
  rules.tagAliases &&
  typeof rules.tagAliases === "object" &&
  !Array.isArray(rules.tagAliases)
    ? rules.tagAliases
    : {};

const categoryAliases =
  rules.categoryAliases &&
  typeof rules.categoryAliases === "object" &&
  !Array.isArray(rules.categoryAliases)
    ? rules.categoryAliases
    : {};

const removeBrandNameTags =
  rules.removeBrandNameTags === true;

const configuredMinimumTags =
  Number(rules.minimumTags);

const minimumTags =
  configuredMinimumTags > 0
    ? configuredMinimumTags
    : 0;

const configuredMaximumTags =
  Number(rules.maximumTags);

const maximumTags =
  configuredMaximumTags > 0
    ? configuredMaximumTags
    : 0;

const css =
  await readFile(
    "style.css",
    "utf8"
  );

const scss =
  await readFile(
    "style.scss",
    "utf8"
  );

const variables =
  await readFile(
    "variables.scss",
    "utf8"
  );

const chartJs =
  await readFile(
    CHART_JS_FILE,
    "utf8"
  );

let svgFileNames = [];

try {
  svgFileNames =
    await readdir("svg");
} catch (error) {
  fail(
    `Unable to read svg directory: ` +
    `${error.message}`
  );
}

const svgFiles =
  new Set(
    svgFileNames
      .filter(
        (file) =>
          file.endsWith(".svg")
      )
      .map(
        (file) =>
          file.slice(0, -4)
      )
  );

const selectionIcons =
  selection.icons;

const selectionById =
  new Map();


const chartById =
  new Map();

const siteIconsById =
  new Map();

const searchIndexById =
  new Map();

for (const sourceIcon of selectionIcons) {
  const id =
    sourceIcon.properties?.name;

  if (!id) {
    fail(
      `An icon in ${SELECTION_FILE} ` +
      "does not have a name."
    );

    continue;
  }

  if (selectionById.has(id)) {
    fail(
      `Duplicate icon identifier ` +
      `"${id}" in ${SELECTION_FILE}.`
    );

    continue;
  }

  selectionById.set(
    id,
    sourceIcon
  );
}

for (const chartEntry of chart) {
  const id =
    normalizeText(chartEntry?.id);

  if (!id) {
    fail(
      `${CHART_JSON_FILE} contains an entry ` +
      "without an identifier."
    );

    continue;
  }

  if (chartById.has(id)) {
    fail(
      `Duplicate icon identifier ` +
      `"${id}" in ${CHART_JSON_FILE}.`
    );

    continue;
  }

  chartById.set(
    id,
    chartEntry
  );
}

for (const siteIcon of siteIcons) {
  const id =
    normalizeText(siteIcon?.id);

  if (!id) {
    fail(
      `${SITE_ICONS_FILE} contains an entry ` +
      "without an identifier."
    );

    continue;
  }

  if (siteIconsById.has(id)) {
    fail(
      `Duplicate icon identifier ` +
      `"${id}" in ${SITE_ICONS_FILE}.`
    );

    continue;
  }

  siteIconsById.set(
    id,
    siteIcon
  );
}

for (
  const searchEntry
  of siteSearchIndex
) {
  const id =
    normalizeText(searchEntry?.id);

  if (!id) {
    fail(
      `${SITE_SEARCH_INDEX_FILE} contains ` +
      "an entry without an identifier."
    );

    continue;
  }

  if (searchIndexById.has(id)) {
    fail(
      `Duplicate icon identifier ` +
      `"${id}" in ` +
      `${SITE_SEARCH_INDEX_FILE}.`
    );

    continue;
  }

  searchIndexById.set(
    id,
    searchEntry
  );
}

if (
  selectionById.size !==
  Object.keys(metadata).length
) {
  fail(
    `${SELECTION_FILE} contains ` +
    `${selectionById.size} icons, but ` +
    `${METADATA_FILE} contains ` +
    `${Object.keys(metadata).length}.`
  );
}

if (
  selectionById.size !==
  chartById.size
) {
  fail(
    `${SELECTION_FILE} contains ` +
    `${selectionById.size} icons, but ` +
    `${CHART_JSON_FILE} contains ` +
    `${chartById.size}.`
  );
}

const expectedActiveIconIds =
  Object.entries(metadata)
    .filter(
      ([, iconMetadata]) =>
        normalizeStatus(
          iconMetadata.status
        ) === "active"
    )
    .map(
      ([iconId]) =>
        iconId
    );

if (
  siteIconsById.size !==
  expectedActiveIconIds.length
) {
  fail(
    `${SITE_ICONS_FILE} contains ` +
    `${siteIconsById.size} icons, but ` +
    `${expectedActiveIconIds.length} active ` +
    "icons are expected."
  );
}

if (
  searchIndexById.size !==
  siteIconsById.size
) {
  fail(
    `${SITE_SEARCH_INDEX_FILE} contains ` +
    `${searchIndexById.size} entries, but ` +
    `${SITE_ICONS_FILE} contains ` +
    `${siteIconsById.size}.`
  );
}

for (
  const [iconId, iconMetadata]
  of Object.entries(metadata)
) {
  if (!selectionById.has(iconId)) {
    fail(
      `Metadata exists for icon "${iconId}", ` +
      `but it is missing from ${SELECTION_FILE}.`
    );
  }

  validateMetadata(
    iconId,
    iconMetadata
  );
}

for (
  const [iconId, sourceIcon]
  of selectionById
) {
  validateSourceIcon(
    iconId,
    sourceIcon
  );
}

for (
  const [iconId, chartEntry]
  of chartById
) {
  if (!selectionById.has(iconId)) {
    fail(
      `Icon "${iconId}" exists in ` +
      `${CHART_JSON_FILE} but not in ` +
      `${SELECTION_FILE}.`
    );
  }

  if (!Object.hasOwn(metadata, iconId)) {
    fail(
      `Icon "${iconId}" exists in ` +
      `${CHART_JSON_FILE} but not in ` +
      `${METADATA_FILE}.`
    );
  }
}

for (const svgId of svgFiles) {
  if (!selectionById.has(svgId)) {
    fail(
      `SVG file svg/${svgId}.svg exists, ` +
      `but the icon is missing from ` +
      `${SELECTION_FILE}.`
    );
  }
}

validateChartJavaScript();
validateSiteData();

printResultsAndExit();

function validateMetadata(
  iconId,
  iconMetadata
) {
  if (
    iconMetadata === null ||
    Array.isArray(iconMetadata) ||
    typeof iconMetadata !== "object"
  ) {
    fail(
      `Metadata for icon "${iconId}" ` +
      "must be an object."
    );

    return;
  }

  const name =
    normalizeText(iconMetadata.name);

  const category =
    normalizeText(
      iconMetadata.category
    );

  if (!name) {
    fail(
      `Icon "${iconId}" does not have ` +
      "a metadata name."
    );
  }

  if (!category) {
    fail(
      `Icon "${iconId}" does not have ` +
      "a category."
    );
  } else if (
    !allowedCategories.has(category)
  ) {
    fail(
      `Icon "${iconId}" uses an invalid ` +
      `category: "${category}".`
    );
  }

  if (
    Object.hasOwn(
      categoryAliases,
      category
    )
  ) {
    fail(
      `Icon "${iconId}" still uses category ` +
      `alias "${category}". Use ` +
      `"${categoryAliases[category]}" instead.`
    );
  }

  if (!Array.isArray(iconMetadata.tags)) {
    fail(
      `Icon "${iconId}" does not contain ` +
      "a valid tags array."
    );

    return;
  }

  const originalTags =
    iconMetadata.tags;

  const normalizedTags =
    normalizeTags(originalTags);

  if (
    originalTags.length !==
    normalizedTags.length
  ) {
    fail(
      `Icon "${iconId}" contains empty, ` +
      "duplicate, or non-normalized tags."
    );
  }

  for (
    let index = 0;
    index < originalTags.length;
    index += 1
  ) {
    const originalTag =
      String(originalTags[index]);

    const normalizedTag =
      normalizeTag(originalTag);

    if (
      originalTag !== normalizedTag
    ) {
      fail(
        `Icon "${iconId}" contains a ` +
        `non-normalized tag: "${originalTag}".`
      );
    }

    if (
      forbiddenTags.has(normalizedTag)
    ) {
      fail(
        `Icon "${iconId}" uses the forbidden ` +
        `tag "${normalizedTag}".`
      );
    }

    if (
      Object.hasOwn(
        tagAliases,
        normalizedTag
      )
    ) {
      const replacement =
        tagAliases[normalizedTag];

      if (replacement === null) {
        fail(
          `Icon "${iconId}" uses deprecated ` +
          `tag "${normalizedTag}", which must ` +
          "be removed."
        );
      } else {
        fail(
          `Icon "${iconId}" uses tag alias ` +
          `"${normalizedTag}". Use ` +
          `"${replacement}" instead.`
        );
      }
    }

    if (
      removeBrandNameTags &&
      normalizedTag ===
        normalizeTag(iconId)
    ) {
      fail(
        `Icon "${iconId}" uses its own ` +
        "identifier as a tag."
      );
    }
  }

  if (
    !arraysAreEqual(
      originalTags,
      normalizedTags
    )
  ) {
    fail(
      `Tags for icon "${iconId}" must be ` +
      "unique and sorted alphabetically."
    );
  }

  if (
    minimumTags > 0 &&
    normalizedTags.length < minimumTags
  ) {
    fail(
      `Icon "${iconId}" must contain at least ` +
      `${minimumTags} tag(s).`
    );
  }

  if (
    maximumTags > 0 &&
    normalizedTags.length > maximumTags
  ) {
    fail(
      `Icon "${iconId}" contains more than ` +
      `${maximumTags} tag(s).`
    );
  }

  if (
    iconMetadata.aliases !== undefined
  ) {
    if (
      !Array.isArray(
        iconMetadata.aliases
      )
    ) {
      fail(
        `Icon "${iconId}" does not contain ` +
        "a valid aliases array."
      );
    } else {
      const normalizedAliases =
        normalizeAliases(
          iconMetadata.aliases
        );

      if (
        !arraysAreEqual(
          iconMetadata.aliases,
          normalizedAliases
        )
      ) {
        fail(
          `Aliases for icon "${iconId}" must ` +
          "be unique and sorted alphabetically."
        );
      }
    }
  }

  if (!normalizeText(iconMetadata.url)) {
    warn(
      `Icon "${iconId}" does not have ` +
      "an official URL."
    );
  }
}

function validateSourceIcon(
  iconId,
  sourceIcon
) {
  const code =
    Number(
      sourceIcon.properties?.code
    );

  if (!Number.isInteger(code)) {
    fail(
      `Icon "${iconId}" has an invalid ` +
      "Unicode code point."
    );

    return;
  }

  const unicodeText =
    code
      .toString(16)
      .padStart(4, "0")
      .toLowerCase();

  const iconMetadata =
    metadata[iconId];

  const chartIcon =
    chartById.get(iconId);

  if (!iconMetadata) {
    fail(
      `Metadata is missing for icon ` +
      `"${iconId}".`
    );
  }

  if (!chartIcon) {
    fail(
      `Icon "${iconId}" is missing from ` +
      `${CHART_JSON_FILE}.`
    );
  } else {
    validateChartEntry(
      iconId,
      chartIcon,
      iconMetadata,
      unicodeText
    );
  }

  if (!svgFiles.has(iconId)) {
    fail(
      `SVG file svg/${iconId}.svg is missing.`
    );
  }

  if (
    !css.includes(
      `.socicon-${iconId}:before`
    )
  ) {
    fail(
      `Icon "${iconId}" is missing from ` +
      "style.css."
    );
  }

  if (
    !scss.includes(
      `.socicon-${iconId}`
    )
  ) {
    fail(
      `Icon "${iconId}" is missing from ` +
      "style.scss."
    );
  }

  if (
    !variables.includes(
      `$socicon-${iconId}:`
    )
  ) {
    fail(
      `Icon "${iconId}" is missing from ` +
      "variables.scss."
    );
  }
}

function validateChartEntry(
  iconId,
  chartIcon,
  iconMetadata,
  expectedUnicodeText
) {
  const chartUnicodeText =
    normalizeText(
      chartIcon.unicodeText
    ).toLowerCase();

  if (
    chartUnicodeText !==
    expectedUnicodeText
  ) {
    fail(
      `Unicode mismatch for icon "${iconId}": ` +
      `${expectedUnicodeText} in ` +
      `${SELECTION_FILE}, ` +
      `${chartUnicodeText} in ` +
      `${CHART_JSON_FILE}.`
    );
  }

  if (
    normalizeText(chartIcon.name) !==
    normalizeText(iconMetadata.name)
  ) {
    fail(
      `Name mismatch for icon "${iconId}" ` +
      `between ${METADATA_FILE} and ` +
      `${CHART_JSON_FILE}.`
    );
  }

  if (
    normalizeText(chartIcon.color) !==
    normalizeText(iconMetadata.color)
  ) {
    fail(
      `Color mismatch for icon "${iconId}" ` +
      `between ${METADATA_FILE} and ` +
      `${CHART_JSON_FILE}.`
    );
  }

  if (
    normalizeText(chartIcon.url) !==
    normalizeText(iconMetadata.url)
  ) {
    fail(
      `URL mismatch for icon "${iconId}" ` +
      `between ${METADATA_FILE} and ` +
      `${CHART_JSON_FILE}.`
    );
  }

  if (
    normalizeText(chartIcon.category) !==
    normalizeText(
      iconMetadata.category
    )
  ) {
    fail(
      `Category mismatch for icon "${iconId}" ` +
      `between ${METADATA_FILE} and ` +
      `${CHART_JSON_FILE}.`
    );
  }

  const expectedTags =
    normalizeTags(
      iconMetadata.tags
    ).join(", ");

  if (
    normalizeText(chartIcon.tags) !==
    expectedTags
  ) {
    fail(
      `Tags mismatch for icon "${iconId}" ` +
      `between ${METADATA_FILE} and ` +
      `${CHART_JSON_FILE}.`
    );
  }

  if (!normalizeText(chartIcon.path)) {
    fail(
      `Icon "${iconId}" does not have a path ` +
      `in ${CHART_JSON_FILE}.`
    );
  }
}

function validateChartJavaScript() {
  const expectedChartJs =
    `const chart = ` +
    `${JSON.stringify(chart, null, 2)};\n`;

  if (chartJs !== expectedChartJs) {
    fail(
      `${CHART_JS_FILE} is not synchronized ` +
      `with ${CHART_JSON_FILE}.`
    );
  }
}

function validateSiteData() {
  const categoryCounts =
    new Map();

  const tagCounts =
    new Map();

  const categoriesByTag =
    new Map();

  for (const iconId of expectedActiveIconIds) {
    const iconMetadata =
      metadata[iconId];

    const chartEntry =
      chartById.get(iconId);

    const siteIcon =
      siteIconsById.get(iconId);

    const searchEntry =
      searchIndexById.get(iconId);

    if (!siteIcon) {
      fail(
        `Active icon "${iconId}" is missing ` +
        `from ${SITE_ICONS_FILE}.`
      );

      continue;
    }

    if (!chartEntry) {
      continue;
    }

    const expectedIcon = {
      id:
        iconId,

      name:
        normalizeText(
          iconMetadata.name ||
          chartEntry.name ||
          iconId
        ),

      category:
        normalizeText(
          iconMetadata.category
        ),

      categoryId:
        normalizeIdentifier(
          iconMetadata.category
        ),

      tags:
        normalizeTags(
          iconMetadata.tags
        ),

      aliases:
        normalizeAliases(
          iconMetadata.aliases
        ),

      status:
        normalizeStatus(
          iconMetadata.status
        ),

      color:
        normalizeText(
          iconMetadata.color ||
          chartEntry.color
        ),

      url:
        normalizeText(
          iconMetadata.url ||
          chartEntry.url
        ),

      unicode:
        normalizeText(
          chartEntry.unicode
        ),

      unicodeText:
        normalizeText(
          chartEntry.unicodeText
        ),

      cssClass:
        `socicon-${iconId}`,

      svg:
        `svg/${iconId}.svg`,

      path:
        normalizeText(
          chartEntry.path
        )
    };

    if (
      !valuesAreEqual(
        siteIcon,
        expectedIcon
      )
    ) {
      fail(
        `Entry "${iconId}" in ` +
        `${SITE_ICONS_FILE} is not ` +
        "synchronized with the source data."
      );
    }

    incrementCounter(
      categoryCounts,
      expectedIcon.category
    );

    for (const tag of expectedIcon.tags) {
      incrementCounter(
        tagCounts,
        tag
      );

      if (!categoriesByTag.has(tag)) {
        categoriesByTag.set(
          tag,
          new Set()
        );
      }

      categoriesByTag
        .get(tag)
        .add(
          expectedIcon.category
        );
    }

    if (!searchEntry) {
      fail(
        `Icon "${iconId}" is missing from ` +
        `${SITE_SEARCH_INDEX_FILE}.`
      );

      continue;
    }

    const expectedSearchEntry = {
      id:
        expectedIcon.id,

      name:
        expectedIcon.name,

      category:
        expectedIcon.category,

      categoryId:
        expectedIcon.categoryId,

      tags:
        expectedIcon.tags,

      aliases:
        expectedIcon.aliases,

      status:
        expectedIcon.status,

      text:
        buildSearchText(
          expectedIcon
        ),

      tokens:
        buildSearchTokens(
          expectedIcon
        )
    };

    if (
      !valuesAreEqual(
        searchEntry,
        expectedSearchEntry
      )
    ) {
      fail(
        `Entry "${iconId}" in ` +
        `${SITE_SEARCH_INDEX_FILE} is not ` +
        "synchronized with the source data."
      );
    }
  }

  for (const siteIcon of siteIcons) {
    if (
      !expectedActiveIconIds.includes(
        siteIcon.id
      )
    ) {
      fail(
        `Inactive or unknown icon ` +
        `"${siteIcon.id}" exists in ` +
        `${SITE_ICONS_FILE}.`
      );
    }
  }

  for (
    const searchEntry
    of siteSearchIndex
  ) {
    if (
      !expectedActiveIconIds.includes(
        searchEntry.id
      )
    ) {
      fail(
        `Inactive or unknown icon ` +
        `"${searchEntry.id}" exists in ` +
        `${SITE_SEARCH_INDEX_FILE}.`
      );
    }
  }

  validateSiteCategories(
    categoryCounts
  );

  validateSiteTags(
    tagCounts,
    categoriesByTag
  );
}

function validateSiteCategories(
  categoryCounts
) {
  const seenIds =
    new Set();

  const seenLabels =
    new Set();

  for (
    const category
    of siteCategories
  ) {
    const id =
      normalizeText(category.id);

    const label =
      normalizeText(category.label);

    if (!id || !label) {
      fail(
        `${SITE_CATEGORIES_FILE} contains ` +
        "an invalid category entry."
      );

      continue;
    }

    if (seenIds.has(id)) {
      fail(
        `Duplicate category identifier ` +
        `"${id}" in ` +
        `${SITE_CATEGORIES_FILE}.`
      );
    }

    if (seenLabels.has(label)) {
      fail(
        `Duplicate category label ` +
        `"${label}" in ` +
        `${SITE_CATEGORIES_FILE}.`
      );
    }

    seenIds.add(id);
    seenLabels.add(label);

    if (
      id !==
      normalizeIdentifier(label)
    ) {
      fail(
        `Category "${label}" uses invalid ` +
        `identifier "${id}".`
      );
    }

    if (
      !allowedCategories.has(label)
    ) {
      fail(
        `Unknown category "${label}" exists ` +
        `in ${SITE_CATEGORIES_FILE}.`
      );
    }

    const expectedCount =
      categoryCounts.get(label) ?? 0;

    if (
      Number(category.count) !==
      expectedCount
    ) {
      fail(
        `Category "${label}" has count ` +
        `${category.count}, expected ` +
        `${expectedCount}.`
      );
    }
  }

  for (
    const [category, count]
    of categoryCounts
  ) {
    const found =
      siteCategories.some(
        (item) =>
          item.label === category
      );

    if (!found) {
      fail(
        `Category "${category}" with ` +
        `${count} icon(s) is missing from ` +
        `${SITE_CATEGORIES_FILE}.`
      );
    }
  }
}

function validateSiteTags(
  tagCounts,
  categoriesByTag
) {
  const seenIds =
    new Set();

  const seenLabels =
    new Set();

  for (const tag of siteTags) {
    const id =
      normalizeText(tag.id);

    const label =
      normalizeText(tag.label);

    if (!id || !label) {
      fail(
        `${SITE_TAGS_FILE} contains an ` +
        "invalid tag entry."
      );

      continue;
    }

    if (seenIds.has(id)) {
      fail(
        `Duplicate tag identifier "${id}" ` +
        `in ${SITE_TAGS_FILE}.`
      );
    }

    if (seenLabels.has(label)) {
      fail(
        `Duplicate tag label "${label}" ` +
        `in ${SITE_TAGS_FILE}.`
      );
    }

    seenIds.add(id);
    seenLabels.add(label);

    if (
      id !==
      normalizeIdentifier(label)
    ) {
      fail(
        `Tag "${label}" uses invalid ` +
        `identifier "${id}".`
      );
    }

    const expectedCount =
      tagCounts.get(label) ?? 0;

    if (
      Number(tag.count) !==
      expectedCount
    ) {
      fail(
        `Tag "${label}" has count ` +
        `${tag.count}, expected ` +
        `${expectedCount}.`
      );
    }

    const expectedCategories =
      sortStrings(
        categoriesByTag.get(label) ??
        []
      );

    if (
      !valuesAreEqual(
        tag.categories,
        expectedCategories
      )
    ) {
      fail(
        `Tag "${label}" has invalid ` +
        `categories in ${SITE_TAGS_FILE}.`
      );
    }
  }

  for (
    const [tag, count]
    of tagCounts
  ) {
    const found =
      siteTags.some(
        (item) =>
          item.label === tag
      );

    if (!found) {
      fail(
        `Tag "${tag}" with ${count} icon(s) ` +
        `is missing from ${SITE_TAGS_FILE}.`
      );
    }
  }
}

function printResultsAndExit() {
  if (warnings.length > 0) {
    console.log("");
    console.log("Validation warnings");
    console.log("-------------------");

    for (const warning of warnings) {
      console.log(
        `Warning: ${warning}`
      );
    }
  }

  if (errors.length > 0) {
    console.error("");
    console.error("Validation errors");
    console.error("-----------------");

    for (const error of errors) {
      console.error(
        `Error: ${error}`
      );
    }

    console.error("");
    console.error(
      `Asset validation failed with ` +
      `${errors.length} error(s).`
    );

    process.exit(1);
  }

  console.log("");

  success(
    `${selectionById?.size ?? 0} icons ` +
    "were validated."
  );

  success(
    "Catalogs, styles, metadata, SVG files, " +
    "and website data are consistent."
  );

  if (warnings.length > 0) {
    success(
      `Validation completed with ` +
      `${warnings.length} warning(s).`
    );
  }

  process.exit(0);
}
