import {
  copyFile,
  readFile,
  writeFile
} from "node:fs/promises";

import process from "node:process";

const METADATA_FILE = "icons-metadata.json";
const SUGGESTIONS_FILE = "metadata-suggestions.json";
const RULES_FILE = "metadata-rules.json";

const argumentsList = process.argv.slice(2);
const argumentsSet = new Set(argumentsList);

const noBackup =
  argumentsSet.has("--no-backup");

const dryRun =
  argumentsSet.has("--dry-run");

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

function normalizeTag(value) {
  return normalizeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
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
    first.length === second.length &&
    first.every(
      (value, index) =>
        value === second[index]
    )
  );
}

function createBackupName() {
  const timestamp = new Date()
    .toISOString()
    .replaceAll(":", "-")
    .replace(/\.\d{3}Z$/, "Z");

  return (
    `${METADATA_FILE}.` +
    `${timestamp}.backup`
  );
}

function validateRootData({
  metadata,
  suggestions,
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

  if (
    suggestions === null ||
    Array.isArray(suggestions) ||
    typeof suggestions !== "object"
  ) {
    errors.push(
      `${SUGGESTIONS_FILE} must contain a JSON object.`
    );
  }

  if (
    suggestions &&
    (
      suggestions.icons === null ||
      Array.isArray(suggestions.icons) ||
      typeof suggestions.icons !== "object"
    )
  ) {
    errors.push(
      `${SUGGESTIONS_FILE} must contain an "icons" object.`
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

function validateSuggestion({
  iconId,
  suggested,
  allowedCategories,
  minimumTags,
  maximumTags
}) {
  const errors = [];

  const category =
    normalizeText(
      suggested.category
    );

  const tags =
    normalizeTags(
      suggested.tags
    );

  if (!category) {
    errors.push(
      `Approved suggestion for icon "${iconId}" ` +
      "does not define a category."
    );
  } else if (
    allowedCategories.size > 0 &&
    !allowedCategories.has(category)
  ) {
    errors.push(
      `Approved suggestion for icon "${iconId}" ` +
      `uses an invalid category: "${category}".`
    );
  }

  if (!Array.isArray(suggested.tags)) {
    errors.push(
      `Approved suggestion for icon "${iconId}" ` +
      "does not define a valid tags array."
    );
  }

  if (
    minimumTags > 0 &&
    tags.length < minimumTags
  ) {
    errors.push(
      `Approved suggestion for icon "${iconId}" ` +
      `must contain at least ${minimumTags} tag(s).`
    );
  }

  if (
    maximumTags > 0 &&
    tags.length > maximumTags
  ) {
    errors.push(
      `Approved suggestion for icon "${iconId}" ` +
      `contains more than ${maximumTags} tag(s).`
    );
  }

  return {
    errors,
    category,
    tags
  };
}

const metadata =
  await readJson(METADATA_FILE);

const suggestions =
  await readJson(SUGGESTIONS_FILE);

const rules =
  await readJson(RULES_FILE);

const rootErrors =
  validateRootData({
    metadata,
    suggestions,
    rules
  });

if (rootErrors.length > 0) {
  for (const error of rootErrors) {
    console.error(
      `Error: ${error}`
    );
  }

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

if (
  selectedIcon &&
  !Object.hasOwn(
    suggestions.icons,
    selectedIcon
  )
) {
  console.error(
    `No suggestion exists for icon "${selectedIcon}".`
  );

  process.exit(1);
}

const updatedMetadata =
  structuredClone(metadata);

const changes = [];
const validationErrors = [];

let approvedCount = 0;
let skippedCount = 0;
let unchangedCount = 0;
let unknownCount = 0;

for (
  const [iconId, suggestion]
  of Object.entries(
    suggestions.icons
  )
) {
  if (
    selectedIcon &&
    iconId !== selectedIcon
  ) {
    continue;
  }

  if (
    suggestion?.approved !== true
  ) {
    skippedCount += 1;
    continue;
  }

  approvedCount += 1;

  if (
    !Object.hasOwn(
      updatedMetadata,
      iconId
    )
  ) {
    validationErrors.push(
      `Approved suggestion references unknown icon "${iconId}".`
    );

    unknownCount += 1;
    continue;
  }

  const suggested =
    suggestion.suggested;

  if (
    suggested === null ||
    Array.isArray(suggested) ||
    typeof suggested !== "object"
  ) {
    validationErrors.push(
      `Approved suggestion for icon "${iconId}" ` +
      'does not contain a valid "suggested" object.'
    );

    continue;
  }

  const validation =
    validateSuggestion({
      iconId,
      suggested,
      allowedCategories,
      minimumTags,
      maximumTags
    });

  validationErrors.push(
    ...validation.errors
  );

  if (
    validation.errors.length > 0
  ) {
    continue;
  }

  const iconMetadata =
    updatedMetadata[iconId];

  const currentCategory =
    normalizeText(
      iconMetadata.category
    );

  const currentTags =
    normalizeTags(
      iconMetadata.tags
    );

  const categoryChanged =
    currentCategory !==
    validation.category;

  const tagsChanged =
    !arraysAreEqual(
      currentTags,
      validation.tags
    );

  if (
    !categoryChanged &&
    !tagsChanged
  ) {
    unchangedCount += 1;
    continue;
  }

  changes.push({
    id: iconId,

    previousCategory:
      currentCategory,

    category:
      validation.category,

    previousTags:
      currentTags,

    tags:
      validation.tags
  });

  iconMetadata.category =
    validation.category;

  /*
   * Approved tags replace the complete current tag list.
   * This prevents stale or irrelevant tags from accumulating.
   */
  iconMetadata.tags =
    validation.tags;
}

if (
  validationErrors.length > 0
) {
  console.error("");
  console.error(
    "Validation errors"
  );
  console.error(
    "-----------------"
  );

  for (
    const error
    of validationErrors
  ) {
    console.error(
      `- ${error}`
    );
  }

  console.error("");
  console.error(
    "No metadata was updated."
  );

  process.exit(1);
}

console.log(
  `Reviewed ${approvedCount} approved suggestion(s).`
);

console.log(
  `Skipped ${skippedCount} unapproved suggestion(s).`
);

console.log(
  `Found ${changes.length} icon(s) to update.`
);

console.log(
  `Found ${unchangedCount} unchanged approved suggestion(s).`
);

if (unknownCount > 0) {
  console.log(
    `Found ${unknownCount} unknown icon(s).`
  );
}

if (
  changes.length > 0
) {
  console.log("");
  console.log(
    "Planned changes"
  );
  console.log(
    "---------------"
  );

  for (const change of changes) {
    console.log("");
    console.log(
      change.id
    );

    if (
      change.previousCategory !==
      change.category
    ) {
      console.log(
        `  Category: ` +
        `"${change.previousCategory}" ` +
        `-> "${change.category}"`
      );
    }

    if (
      !arraysAreEqual(
        change.previousTags,
        change.tags
      )
    ) {
      console.log(
        `  Tags: ` +
        `${JSON.stringify(
          change.previousTags
        )}`
      );

      console.log(
        `     -> ` +
        `${JSON.stringify(
          change.tags
        )}`
      );
    }
  }
}

if (dryRun) {
  console.log("");
  console.log(
    "Dry-run completed. No file was modified."
  );

  process.exit(0);
}

if (
  changes.length === 0
) {
  console.log("");
  console.log(
    "Metadata is already up to date."
  );

  process.exit(0);
}

if (!noBackup) {
  const backupFile =
    createBackupName();

  await copyFile(
    METADATA_FILE,
    backupFile
  );

  console.log("");
  console.log(
    `Created backup: ${backupFile}`
  );
}

await writeJson(
  METADATA_FILE,
  updatedMetadata
);

console.log("");
console.log(
  `Updated ${METADATA_FILE} successfully.`
);

console.log(
  `Applied ${changes.length} suggestion(s).`
);
