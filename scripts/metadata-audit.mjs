import {
  readFile
} from "node:fs/promises";

import process from "node:process";

const METADATA_FILE = "icons-metadata.json";
const RULES_FILE = "metadata-rules.json";

const argumentsSet = new Set(
  process.argv.slice(2)
);

const showAllCategories =
  argumentsSet.has("--categories");

const showAllTags =
  argumentsSet.has("--tags");

const showOnlySummary =
  argumentsSet.has("--summary");

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

function incrementCounter(
  counter,
  key
) {
  counter.set(
    key,
    (counter.get(key) ?? 0) + 1
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
    console.error(
      `${file} must contain a JSON object.`
    );

    process.exit(1);
  }
}

function printSection(
  title,
  entries,
  formatter = null
) {
  if (showOnlySummary) {
    return;
  }

  console.log("");
  console.log(title);
  console.log("-".repeat(title.length));

  if (entries.length === 0) {
    console.log("None.");
    return;
  }

  for (const entry of entries) {
    if (formatter) {
      console.log(
        formatter(entry)
      );

      continue;
    }

    console.log(
      typeof entry === "string"
        ? entry
        : JSON.stringify(entry)
    );
  }
}

function printUsageMap(
  title,
  counter
) {
  if (showOnlySummary) {
    return;
  }

  console.log("");
  console.log(title);
  console.log("-".repeat(title.length));

  const entries = [...counter.entries()]
    .sort(
      (first, second) => {
        if (second[1] !== first[1]) {
          return second[1] - first[1];
        }

        return first[0].localeCompare(
          second[0],
          "en",
          {
            sensitivity: "base",
            numeric: true
          }
        );
      }
    );

  if (entries.length === 0) {
    console.log("None.");
    return;
  }

  for (const [label, count] of entries) {
    console.log(
      `${label || "(empty)"}: ${count}`
    );
  }
}

const metadata =
  await readJson(METADATA_FILE);

const rules =
  await readJson(RULES_FILE);

validateRootObject(
  metadata,
  METADATA_FILE
);

validateRootObject(
  rules,
  RULES_FILE
);

if (!Array.isArray(rules.categories)) {
  console.error(
    `${RULES_FILE} does not define a valid ` +
    '"categories" array.'
  );

  process.exit(1);
}

if (!Array.isArray(rules.forbiddenTags)) {
  console.error(
    `${RULES_FILE} does not define a valid ` +
    '"forbiddenTags" array.'
  );

  process.exit(1);
}

const allowedCategories =
  new Set(rules.categories);

const forbiddenTags =
  new Set(
    rules.forbiddenTags.map(
      normalizeTag
    )
  );

const categoryAliases =
  rules.categoryAliases &&
  typeof rules.categoryAliases === "object" &&
  !Array.isArray(rules.categoryAliases)
    ? rules.categoryAliases
    : {};

const tagAliases =
  rules.tagAliases &&
  typeof rules.tagAliases === "object" &&
  !Array.isArray(rules.tagAliases)
    ? rules.tagAliases
    : {};

const iconOverrides =
  rules.iconOverrides &&
  typeof rules.iconOverrides === "object" &&
  !Array.isArray(rules.iconOverrides)
    ? rules.iconOverrides
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

const categoryUsage = new Map();
const tagUsage = new Map();

const invalidMetadataEntries = [];
const missingNames = [];
const missingCategories = [];
const invalidCategories = [];
const categoryAliasesFound = [];
const missingTagArrays = [];
const emptyTags = [];
const tooFewTags = [];
const tooManyTags = [];
const duplicateTags = [];
const unsortedTags = [];
const nonNormalizedTags = [];
const forbiddenTagUsage = [];
const tagAliasesFound = [];
const brandNameTags = [];
const missingUrls = [];
const unknownOverrides = [];
const invalidOverrides = [];
const overrideDifferences = [];

for (
  const [iconId, iconMetadata]
  of Object.entries(metadata)
) {
  if (
    iconMetadata === null ||
    Array.isArray(iconMetadata) ||
    typeof iconMetadata !== "object"
  ) {
    invalidMetadataEntries.push(iconId);
    continue;
  }

  const name =
    normalizeText(iconMetadata.name);

  const category =
    normalizeText(
      iconMetadata.category
    );

  if (!name) {
    missingNames.push(iconId);
  }

  if (!category) {
    missingCategories.push(iconId);
  } else {
    incrementCounter(
      categoryUsage,
      category
    );

    if (
      !allowedCategories.has(category)
    ) {
      invalidCategories.push({
        icon: iconId,
        category
      });
    }

    if (
      Object.hasOwn(
        categoryAliases,
        category
      )
    ) {
      categoryAliasesFound.push({
        icon: iconId,
        category,
        replacement:
          categoryAliases[category]
      });
    }
  }

  if (
    !Array.isArray(
      iconMetadata.tags
    )
  ) {
    missingTagArrays.push(iconId);
    continue;
  }

  const originalTags =
    iconMetadata.tags;

  const normalizedTags =
    normalizeTags(originalTags);

  if (normalizedTags.length === 0) {
    emptyTags.push(iconId);
  }

  if (
    minimumTags > 0 &&
    normalizedTags.length < minimumTags
  ) {
    tooFewTags.push({
      icon: iconId,
      count: normalizedTags.length,
      minimum: minimumTags
    });
  }

  if (
    maximumTags > 0 &&
    normalizedTags.length > maximumTags
  ) {
    tooManyTags.push({
      icon: iconId,
      count: normalizedTags.length,
      maximum: maximumTags
    });
  }

  const seenTags = new Set();

  for (const originalValue of originalTags) {
    const originalTag =
      String(originalValue);

    const normalizedTag =
      normalizeTag(originalValue);

    if (!normalizedTag) {
      nonNormalizedTags.push({
        icon: iconId,
        tag: originalTag,
        reason: "empty"
      });

      continue;
    }

    incrementCounter(
      tagUsage,
      normalizedTag
    );

    if (seenTags.has(normalizedTag)) {
      duplicateTags.push({
        icon: iconId,
        tag: normalizedTag
      });
    }

    seenTags.add(normalizedTag);

    if (
      originalTag !== normalizedTag
    ) {
      nonNormalizedTags.push({
        icon: iconId,
        tag: originalTag,
        replacement: normalizedTag
      });
    }

    if (
      forbiddenTags.has(
        normalizedTag
      )
    ) {
      forbiddenTagUsage.push({
        icon: iconId,
        tag: normalizedTag
      });
    }

    if (
      Object.hasOwn(
        tagAliases,
        normalizedTag
      )
    ) {
      tagAliasesFound.push({
        icon: iconId,
        tag: normalizedTag,
        replacement:
          tagAliases[normalizedTag]
      });
    }

    if (
      removeBrandNameTags &&
      normalizedTag ===
        normalizeTag(iconId)
    ) {
      brandNameTags.push({
        icon: iconId,
        tag: normalizedTag
      });
    }
  }

  if (
    originalTags.length ===
      normalizedTags.length &&
    !arraysAreEqual(
      originalTags,
      normalizedTags
    )
  ) {
    unsortedTags.push({
      icon: iconId,
      current: originalTags,
      expected: normalizedTags
    });
  }

  if (
    !normalizeText(
      iconMetadata.url
    )
  ) {
    missingUrls.push(iconId);
  }
}

for (
  const [iconId, override]
  of Object.entries(iconOverrides)
) {
  if (
    !Object.hasOwn(metadata, iconId)
  ) {
    unknownOverrides.push(iconId);
    continue;
  }

  if (
    override === null ||
    Array.isArray(override) ||
    typeof override !== "object"
  ) {
    invalidOverrides.push({
      icon: iconId,
      reason: "Override must be an object."
    });

    continue;
  }

  const metadataEntry =
    metadata[iconId];

  if (
    override.category !== undefined
  ) {
    const overrideCategory =
      normalizeText(
        override.category
      );

    if (
      !allowedCategories.has(
        overrideCategory
      )
    ) {
      invalidOverrides.push({
        icon: iconId,
        reason:
          `Invalid override category ` +
          `"${overrideCategory}".`
      });
    }

    if (
      normalizeText(
        metadataEntry.category
      ) !== overrideCategory
    ) {
      overrideDifferences.push({
        icon: iconId,
        field: "category",
        current:
          metadataEntry.category,
        expected:
          overrideCategory
      });
    }
  }

  if (
    override.tags !== undefined
  ) {
    if (!Array.isArray(override.tags)) {
      invalidOverrides.push({
        icon: iconId,
        reason:
          "Override tags must be an array."
      });
    } else {
      const overrideTags =
        normalizeTags(
          override.tags
        );

      if (
        !arraysAreEqual(
          override.tags,
          overrideTags
        )
      ) {
        invalidOverrides.push({
          icon: iconId,
          reason:
            "Override tags must be normalized, " +
            "unique, and sorted."
        });
      }

      const metadataTags =
        normalizeTags(
          metadataEntry.tags
        );

      if (
        !arraysAreEqual(
          metadataTags,
          overrideTags
        )
      ) {
        overrideDifferences.push({
          icon: iconId,
          field: "tags",
          current:
            metadataTags,
          expected:
            overrideTags
        });
      }
    }
  }
}

const errorGroups = [
  invalidMetadataEntries,
  missingNames,
  missingCategories,
  invalidCategories,
  categoryAliasesFound,
  missingTagArrays,
  tooFewTags,
  tooManyTags,
  duplicateTags,
  unsortedTags,
  nonNormalizedTags,
  forbiddenTagUsage,
  tagAliasesFound,
  brandNameTags,
  unknownOverrides,
  invalidOverrides
];

const errorCount =
  errorGroups.reduce(
    (total, entries) =>
      total + entries.length,
    0
  );

const warningCount =
  emptyTags.length +
  missingUrls.length +
  overrideDifferences.length;

console.log(
  `Audited ${Object.keys(metadata).length} icon(s).`
);

console.log(
  `Found ${categoryUsage.size} distinct categor` +
  `${categoryUsage.size === 1 ? "y" : "ies"}.`
);

console.log(
  `Found ${tagUsage.size} distinct tag(s).`
);

console.log(
  `Found ${errorCount} error(s).`
);

console.log(
  `Found ${warningCount} warning(s).`
);

printSection(
  "Invalid metadata entries",
  invalidMetadataEntries
);

printSection(
  "Icons without names",
  missingNames
);

printSection(
  "Icons without categories",
  missingCategories
);

printSection(
  "Invalid categories",
  invalidCategories,
  (entry) =>
    `${entry.icon}: "${entry.category}"`
);

printSection(
  "Category aliases to normalize",
  categoryAliasesFound,
  (entry) =>
    `${entry.icon}: "${entry.category}" ` +
    `-> "${entry.replacement}"`
);

printSection(
  "Icons without valid tag arrays",
  missingTagArrays
);

printSection(
  "Icons without tags",
  emptyTags
);

printSection(
  "Icons with too few tags",
  tooFewTags,
  (entry) =>
    `${entry.icon}: ${entry.count} ` +
    `(minimum: ${entry.minimum})`
);

printSection(
  "Icons with too many tags",
  tooManyTags,
  (entry) =>
    `${entry.icon}: ${entry.count} ` +
    `(maximum: ${entry.maximum})`
);

printSection(
  "Duplicate tags",
  duplicateTags,
  (entry) =>
    `${entry.icon}: "${entry.tag}"`
);

printSection(
  "Tags requiring normalization",
  nonNormalizedTags,
  (entry) => {
    if (entry.reason === "empty") {
      return (
        `${entry.icon}: empty tag value`
      );
    }

    return (
      `${entry.icon}: "${entry.tag}" ` +
      `-> "${entry.replacement}"`
    );
  }
);

printSection(
  "Unsorted tag lists",
  unsortedTags,
  (entry) =>
    `${entry.icon}: ` +
    `${JSON.stringify(entry.current)} ` +
    `-> ${JSON.stringify(entry.expected)}`
);

printSection(
  "Forbidden tag usage",
  forbiddenTagUsage,
  (entry) =>
    `${entry.icon}: "${entry.tag}"`
);

printSection(
  "Tag aliases to normalize",
  tagAliasesFound,
  (entry) => {
    if (entry.replacement === null) {
      return (
        `${entry.icon}: remove ` +
        `"${entry.tag}"`
      );
    }

    return (
      `${entry.icon}: "${entry.tag}" ` +
      `-> "${entry.replacement}"`
    );
  }
);

printSection(
  "Brand-name tags to remove",
  brandNameTags,
  (entry) =>
    `${entry.icon}: "${entry.tag}"`
);

printSection(
  "Icons without official URLs",
  missingUrls
);

printSection(
  "Unknown icon overrides",
  unknownOverrides
);

printSection(
  "Invalid icon overrides",
  invalidOverrides,
  (entry) =>
    `${entry.icon}: ${entry.reason}`
);

printSection(
  "Metadata differing from overrides",
  overrideDifferences,
  (entry) =>
    `${entry.icon}.${entry.field}: ` +
    `${JSON.stringify(entry.current)} ` +
    `-> ${JSON.stringify(entry.expected)}`
);

if (showAllCategories) {
  printUsageMap(
    "Category usage",
    categoryUsage
  );
}

if (showAllTags) {
  printUsageMap(
    "Tag usage",
    tagUsage
  );
}

if (errorCount > 0) {
  process.exitCode = 1;
}
