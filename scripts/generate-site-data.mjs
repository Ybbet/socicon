import {
  mkdir,
  readFile,
  writeFile
} from "node:fs/promises";

import path from "node:path";
import process from "node:process";

const METADATA_FILE = "icons-metadata.json";
const CHART_LIST_FILE = "chart-list.json";
const RULES_FILE = "metadata-rules.json";

const OUTPUT_DIRECTORY = "site/data";

const ICONS_FILE = path.join(
  OUTPUT_DIRECTORY,
  "icons.json"
);

const CATEGORIES_FILE = path.join(
  OUTPUT_DIRECTORY,
  "categories.json"
);

const TAGS_FILE = path.join(
  OUTPUT_DIRECTORY,
  "tags.json"
);

const SEARCH_INDEX_FILE = path.join(
  OUTPUT_DIRECTORY,
  "search-index.json"
);

const argumentsSet = new Set(
  process.argv.slice(2)
);

const compactOutput = argumentsSet.has("--compact");
const includeInactive = argumentsSet.has("--include-inactive");

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

async function writeJson(file, data) {
  const content = compactOutput
    ? `${JSON.stringify(data)}\n`
    : `${JSON.stringify(data, null, 2)}\n`;

  await writeFile(
    file,
    content,
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

function normalizeIdentifier(value) {
  return normalizeSearchText(value)
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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

function compareIcons(first, second) {
  return first.name.localeCompare(
    second.name,
    "en",
    {
      sensitivity: "base",
      numeric: true
    }
  );
}

function compareLabels(first, second) {
  return first.label.localeCompare(
    second.label,
    "en",
    {
      sensitivity: "base",
      numeric: true
    }
  );
}

function incrementCounter(map, key) {
  map.set(
    key,
    (map.get(key) ?? 0) + 1
  );
}

function normalizeStatus(value) {
  const status = normalizeSearchText(
    value || "active"
  );

  return status || "active";
}

function normalizeAliases(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return sortStrings(
    unique(
      value
        .map(normalizeText)
        .filter(Boolean)
    )
  );
}

function normalizeTags(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return sortStrings(
    unique(
      value
        .map(normalizeTag)
        .filter(Boolean)
    )
  );
}

function getChartEntryMap(chartList) {
  return new Map(
    chartList.map((entry) => [
      entry.id,
      entry
    ])
  );
}

function validateRootData({
  metadata,
  chartList,
  rules
}) {
  const errors = [];

  if (
    metadata === null ||
    Array.isArray(metadata) ||
    typeof metadata !== "object"
  ) {
    errors.push(
      `${METADATA_FILE} must contain a JSON object.`
    );
  }

  if (!Array.isArray(chartList)) {
    errors.push(
      `${CHART_LIST_FILE} must contain a JSON array.`
    );
  }

  if (
    rules === null ||
    Array.isArray(rules) ||
    typeof rules !== "object"
  ) {
    errors.push(
      `${RULES_FILE} must contain a JSON object.`
    );
  }

  return errors;
}

function validateIcon({
  iconId,
  metadata,
  chartEntry,
  allowedCategories,
  maximumTags
}) {
  const errors = [];
  const warnings = [];

  if (!metadata.name) {
    errors.push(
      `Icon "${iconId}" does not have a name.`
    );
  }

  if (!metadata.category) {
    errors.push(
      `Icon "${iconId}" does not have a category.`
    );
  } else if (
    allowedCategories.size > 0 &&
    !allowedCategories.has(metadata.category)
  ) {
    errors.push(
      `Icon "${iconId}" uses an invalid category: ` +
      `"${metadata.category}".`
    );
  }

  if (!Array.isArray(metadata.tags)) {
    errors.push(
      `Icon "${iconId}" does not contain a valid tags array.`
    );
  }

  const tags = normalizeTags(
    metadata.tags
  );

  if (
    maximumTags > 0 &&
    tags.length > maximumTags
  ) {
    warnings.push(
      `Icon "${iconId}" contains more than ` +
      `${maximumTags} tags.`
    );
  }

  if (!metadata.url) {
    warnings.push(
      `Icon "${iconId}" does not have an official URL.`
    );
  }

  if (!metadata.description) {
    warnings.push(
      `Icon "${iconId}" does not have a description.`
    );
  }

  if (!chartEntry) {
    errors.push(
      `Icon "${iconId}" is missing from ${CHART_LIST_FILE}.`
    );

    return {
      errors,
      warnings
    };
  }

  if (!chartEntry.unicodeText) {
    errors.push(
      `Icon "${iconId}" does not have a Unicode value.`
    );
  }

  if (!chartEntry.path) {
    errors.push(
      `Icon "${iconId}" does not have an SVG path.`
    );
  }

  return {
    errors,
    warnings
  };
}

function buildIconRecord({
  iconId,
  metadata,
  chartEntry
}) {
  const tags = normalizeTags(
    metadata.tags
  );

  const aliases = normalizeAliases(
    metadata.aliases
  );

  const status = normalizeStatus(
    metadata.status
  );

  return {
    id: iconId,
    name: normalizeText(
      metadata.name || chartEntry.name || iconId
    ),
    category: normalizeText(
      metadata.category
    ),
    categoryId: normalizeIdentifier(
      metadata.category
    ),
    tags,
    aliases,
    description: normalizeText(
      metadata.description
    ),
    status,
    color: normalizeText(
      metadata.color || chartEntry.color
    ),
    url: normalizeText(
      metadata.url || chartEntry.url
    ),
    unicode: normalizeText(
      chartEntry.unicode
    ),
    unicodeText: normalizeText(
      chartEntry.unicodeText
    ),
    cssClass: `socicon-${iconId}`,
    svg: `svg/${iconId}.svg`,
    path: normalizeText(
      chartEntry.path
    )
  };
}

function buildCategoryRecords(
  icons,
  rules
) {
  const counters = new Map();

  for (const icon of icons) {
    incrementCounter(
      counters,
      icon.category
    );
  }

  const configuredCategories = Array.isArray(
    rules.categories
  )
    ? rules.categories
    : [];

  const labels = unique([
    ...configuredCategories,
    ...counters.keys()
  ]);

  return labels
    .map((label) => ({
      id: normalizeIdentifier(label),
      label,
      count: counters.get(label) ?? 0
    }))
    .filter(
      (category) =>
        category.count > 0
    )
    .sort(compareLabels);
}

function buildTagRecords(icons) {
  const counters = new Map();
  const categoriesByTag = new Map();

  for (const icon of icons) {
    for (const tag of icon.tags) {
      incrementCounter(
        counters,
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
        .add(icon.category);
    }
  }

  return [...counters.entries()]
    .map(([tag, count]) => ({
      id: normalizeIdentifier(tag),
      label: tag,
      count,
      categories: sortStrings(
        categoriesByTag.get(tag) ?? []
      )
    }))
    .sort(compareLabels);
}

function buildSearchText(icon) {
  return unique(
    [
      icon.id,
      icon.name,
      icon.category,
      ...icon.tags,
      ...icon.aliases,
      icon.description
    ]
      .map(normalizeSearchText)
      .filter(Boolean)
  ).join(" ");
}

function buildSearchTokens(icon) {
  const text = buildSearchText(icon);

  return sortStrings(
    unique(
      text
        .split(/[^a-z0-9]+/)
        .map(normalizeSearchText)
        .filter(
          (token) =>
            token.length >= 2
        )
    )
  );
}

function buildSearchIndex(icons) {
  return icons.map((icon) => ({
    id: icon.id,
    name: icon.name,
    category: icon.category,
    categoryId: icon.categoryId,
    tags: icon.tags,
    aliases: icon.aliases,
    description: icon.description,
    status: icon.status,
    text: buildSearchText(icon),
    tokens: buildSearchTokens(icon)
  }));
}

function findDuplicateIdentifiers(records) {
  const identifiers = new Map();
  const duplicates = [];

  for (const record of records) {
    if (!identifiers.has(record.id)) {
      identifiers.set(
        record.id,
        record.label
      );

      continue;
    }

    duplicates.push({
      id: record.id,
      first: identifiers.get(record.id),
      second: record.label
    });
  }

  return duplicates;
}

function validateGeneratedData({
  icons,
  categories,
  tags,
  searchIndex
}) {
  const errors = [];

  if (
    icons.length !==
    searchIndex.length
  ) {
    errors.push(
      "The search index does not contain the same " +
      "number of entries as the icon catalog."
    );
  }

  const iconIds = new Set();

  for (const icon of icons) {
    if (iconIds.has(icon.id)) {
      errors.push(
        `Duplicate icon identifier: "${icon.id}".`
      );
    }

    iconIds.add(icon.id);
  }

  for (const entry of searchIndex) {
    if (!iconIds.has(entry.id)) {
      errors.push(
        `Search index contains unknown icon "${entry.id}".`
      );
    }
  }

  const categoryIds =
    new Set(
      categories.map(
        (category) => category.id
      )
    );

  for (const icon of icons) {
    if (
      !categoryIds.has(icon.categoryId)
    ) {
      errors.push(
        `Icon "${icon.id}" references unknown category ` +
        `"${icon.categoryId}".`
      );
    }
  }

  const categoryDuplicates =
    findDuplicateIdentifiers(categories);

  for (const duplicate of categoryDuplicates) {
    errors.push(
      `Category identifier collision "${duplicate.id}" ` +
      `between "${duplicate.first}" and "${duplicate.second}".`
    );
  }

  const tagDuplicates =
    findDuplicateIdentifiers(tags);

  for (const duplicate of tagDuplicates) {
    errors.push(
      `Tag identifier collision "${duplicate.id}" ` +
      `between "${duplicate.first}" and "${duplicate.second}".`
    );
  }

  const categoryCounts = new Map();

  for (const icon of icons) {
    incrementCounter(
      categoryCounts,
      icon.category
    );
  }

  for (const category of categories) {
    const expected =
      categoryCounts.get(category.label) ?? 0;

    if (category.count !== expected) {
      errors.push(
        `Category "${category.label}" has an invalid count: ` +
        `${category.count}, expected ${expected}.`
      );
    }
  }

  const tagCounts = new Map();

  for (const icon of icons) {
    for (const tag of icon.tags) {
      incrementCounter(
        tagCounts,
        tag
      );
    }
  }

  for (const tag of tags) {
    const expected =
      tagCounts.get(tag.label) ?? 0;

    if (tag.count !== expected) {
      errors.push(
        `Tag "${tag.label}" has an invalid count: ` +
        `${tag.count}, expected ${expected}.`
      );
    }
  }

  return errors;
}

const metadata = await readJson(
  METADATA_FILE
);

const chartList = await readJson(
  CHART_LIST_FILE
);

const rules = await readJson(
  RULES_FILE
);

const rootErrors = validateRootData({
  metadata,
  chartList,
  rules
});

if (rootErrors.length > 0) {
  for (const error of rootErrors) {
    console.error(`Error: ${error}`);
  }

  process.exit(1);
}

const allowedCategories = new Set(
  Array.isArray(rules.categories)
    ? rules.categories
    : []
);

const maximumTags =
  Number(rules.maximumTags) > 0
    ? Number(rules.maximumTags)
    : 0;

const chartEntryMap =
  getChartEntryMap(chartList);

const errors = [];
const warnings = [];
const icons = [];

for (
  const [iconId, iconMetadata]
  of Object.entries(metadata)
) {
  const chartEntry =
    chartEntryMap.get(iconId);

  const validation =
    validateIcon({
      iconId,
      metadata: iconMetadata,
      chartEntry,
      allowedCategories,
      maximumTags
    });

  errors.push(
    ...validation.errors
  );

  warnings.push(
    ...validation.warnings
  );

  if (!chartEntry) {
    continue;
  }

  const icon = buildIconRecord({
    iconId,
    metadata: iconMetadata,
    chartEntry
  });

  if (
    !includeInactive &&
    icon.status !== "active"
  ) {
    continue;
  }

  icons.push(icon);
}

for (const chartEntry of chartList) {
  if (
    !Object.hasOwn(
      metadata,
      chartEntry.id
    )
  ) {
    errors.push(
      `Icon "${chartEntry.id}" exists in ` +
      `${CHART_LIST_FILE} but not in ${METADATA_FILE}.`
    );
  }
}

if (errors.length > 0) {
  console.error("");
  console.error("Validation errors");
  console.error("-----------------");

  for (const error of errors) {
    console.error(`- ${error}`);
  }

  console.error("");
  console.error(
    "Site data generation failed."
  );

  process.exit(1);
}

icons.sort(compareIcons);

const categories =
  buildCategoryRecords(
    icons,
    rules
  );

const tags =
  buildTagRecords(icons);

const searchIndex =
  buildSearchIndex(icons);

const generatedErrors =
  validateGeneratedData({
    icons,
    categories,
    tags,
    searchIndex
  });

if (generatedErrors.length > 0) {
  console.error("");
  console.error(
    "Generated data validation errors"
  );
  console.error(
    "--------------------------------"
  );

  for (const error of generatedErrors) {
    console.error(`- ${error}`);
  }

  console.error("");
  console.error(
    "Site data generation failed."
  );

  process.exit(1);
}

await mkdir(
  OUTPUT_DIRECTORY,
  {
    recursive: true
  }
);

await writeJson(
  ICONS_FILE,
  icons
);

await writeJson(
  CATEGORIES_FILE,
  categories
);

await writeJson(
  TAGS_FILE,
  tags
);

await writeJson(
  SEARCH_INDEX_FILE,
  searchIndex
);

console.log(
  `Generated ${icons.length} icon entries in ${ICONS_FILE}.`
);

console.log(
  `Generated ${categories.length} categories in ${CATEGORIES_FILE}.`
);

console.log(
  `Generated ${tags.length} tags in ${TAGS_FILE}.`
);

console.log(
  `Generated ${searchIndex.length} search entries in ` +
  `${SEARCH_INDEX_FILE}.`
);

if (warnings.length > 0) {
  console.log("");
  console.log(
    `Completed with ${warnings.length} warning(s).`
  );

  for (const warning of warnings) {
    console.log(`Warning: ${warning}`);
  }
} else {
  console.log("");
  console.log(
    "Site data generated successfully."
  );
}
