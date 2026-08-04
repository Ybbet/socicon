import {
  copyFile,
  readFile,
  writeFile
} from "node:fs/promises";

import process from "node:process";

const METADATA_FILE = "icons-metadata.json";
const RULES_FILE = "metadata-rules.json";

const argumentsList = process.argv.slice(2);
const argumentsSet = new Set(argumentsList);

const writeChanges =
  argumentsSet.has("--write");

const createBackup =
  !argumentsSet.has("--no-backup");

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

async function writeJson(
  file,
  value
) {
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

function createBackupName() {
  const timestamp =
    new Date()
      .toISOString()
      .replaceAll(":", "-")
      .replace(/\.\d{3}Z$/, "Z");

  return (
    `${METADATA_FILE}.` +
    `${timestamp}.backup`
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

function getObjectRule(
  rules,
  property
) {
  const value =
    rules[property];

  if (
    value === undefined
  ) {
    return {};
  }

  if (
    value === null ||
    Array.isArray(value) ||
    typeof value !== "object"
  ) {
    console.error(
      `${RULES_FILE} property "${property}" ` +
      "must contain a JSON object."
    );

    process.exit(1);
  }

  return value;
}

function getArrayRule(
  rules,
  property
) {
  const value =
    rules[property];

  if (!Array.isArray(value)) {
    console.error(
      `${RULES_FILE} property "${property}" ` +
      "must contain a JSON array."
    );

    process.exit(1);
  }

  return value;
}

function resolveCategory(
  category,
  categoryAliases
) {
  const normalizedCategory =
    normalizeText(category);

  if (
    Object.hasOwn(
      categoryAliases,
      normalizedCategory
    )
  ) {
    return normalizeText(
      categoryAliases[
        normalizedCategory
      ]
    );
  }

  return normalizedCategory;
}

function resolveTag(
  tag,
  tagAliases
) {
  const normalizedTag =
    normalizeTag(tag);

  if (!normalizedTag) {
    return null;
  }

  if (
    !Object.hasOwn(
      tagAliases,
      normalizedTag
    )
  ) {
    return normalizedTag;
  }

  const replacement =
    tagAliases[normalizedTag];

  if (replacement === null) {
    return null;
  }

  return normalizeTag(
    replacement
  );
}

function normalizeTags({
  iconId,
  tags,
  tagAliases,
  forbiddenTags,
  removeBrandNameTags
}) {
  if (!Array.isArray(tags)) {
    return [];
  }

  const normalizedIconId =
    normalizeTag(iconId);

  return sortStrings(
    unique(
      tags
        .map(
          (tag) =>
            resolveTag(
              tag,
              tagAliases
            )
        )
        .filter(Boolean)
        .filter(
          (tag) =>
            !forbiddenTags.has(tag)
        )
        .filter((tag) => {
          if (!removeBrandNameTags) {
            return true;
          }

          return (
            tag !== normalizedIconId
          );
        })
    )
  );
}

function validateOverride({
  iconId,
  override,
  metadata,
  allowedCategories
}) {
  const errors = [];

  if (
    !Object.hasOwn(
      metadata,
      iconId
    )
  ) {
    errors.push(
      `Metadata override references unknown icon ` +
      `"${iconId}".`
    );

    return errors;
  }

  if (
    override === null ||
    Array.isArray(override) ||
    typeof override !== "object"
  ) {
    errors.push(
      `Metadata override for icon "${iconId}" ` +
      "must be an object."
    );

    return errors;
  }

  if (
    override.category !== undefined
  ) {
    const category =
      normalizeText(
        override.category
      );

    if (!category) {
      errors.push(
        `Metadata override for icon "${iconId}" ` +
        "contains an empty category."
      );
    } else if (
      !allowedCategories.has(category)
    ) {
      errors.push(
        `Metadata override for icon "${iconId}" ` +
        `uses an invalid category: "${category}".`
      );
    }
  }

  for (const property of [
    "tags",
    "addTags",
    "removeTags"
  ]) {
    if (
      override[property] !== undefined &&
      !Array.isArray(
        override[property]
      )
    ) {
      errors.push(
        `Metadata override property ` +
        `"${iconId}.${property}" must be an array.`
      );
    }
  }

  return errors;
}

function applyIconOverride({
  iconId,
  iconMetadata,
  override
}) {
  if (!override) {
    return {
      ...iconMetadata
    };
  }

  const updatedMetadata = {
    ...iconMetadata
  };

  if (
    override.category !== undefined
  ) {
    updatedMetadata.category =
      override.category;
  }

  let tags =
    Array.isArray(
      updatedMetadata.tags
    )
      ? [...updatedMetadata.tags]
      : [];

  /*
   * A complete "tags" array replaces the existing tag list.
   */
  if (
    Array.isArray(
      override.tags
    )
  ) {
    tags = [
      ...override.tags
    ];
  }

  /*
   * "removeTags" removes selected tags while preserving the rest.
   */
  if (
    Array.isArray(
      override.removeTags
    )
  ) {
    const tagsToRemove =
      new Set(
        override.removeTags
          .map(normalizeTag)
          .filter(Boolean)
      );

    tags = tags.filter(
      (tag) =>
        !tagsToRemove.has(
          normalizeTag(tag)
        )
    );
  }

  /*
   * "addTags" appends selected tags before final normalization.
   */
  if (
    Array.isArray(
      override.addTags
    )
  ) {
    tags.push(
      ...override.addTags
    );
  }

  updatedMetadata.tags =
    tags;

  return updatedMetadata;
}

function validateMetadata({
  iconId,
  iconMetadata,
  allowedCategories,
  forbiddenTags,
  tagAliases,
  categoryAliases,
  removeBrandNameTags,
  minimumTags,
  maximumTags
}) {
  const errors = [];

  if (
    iconMetadata === null ||
    Array.isArray(iconMetadata) ||
    typeof iconMetadata !== "object"
  ) {
    errors.push(
      `Metadata for icon "${iconId}" must be an object.`
    );

    return errors;
  }

  const category =
    normalizeText(
      iconMetadata.category
    );

  if (!category) {
    errors.push(
      `Icon "${iconId}" does not have a category.`
    );
  } else if (
    !allowedCategories.has(category)
  ) {
    errors.push(
      `Icon "${iconId}" uses an invalid category: ` +
      `"${category}".`
    );
  }

  if (
    Object.hasOwn(
      categoryAliases,
      category
    )
  ) {
    errors.push(
      `Icon "${iconId}" still uses category alias ` +
      `"${category}".`
    );
  }

  if (
    !Array.isArray(
      iconMetadata.tags
    )
  ) {
    errors.push(
      `Icon "${iconId}" does not contain a valid tags array.`
    );

    return errors;
  }

  const tags =
    iconMetadata.tags;

  if (
    minimumTags > 0 &&
    tags.length < minimumTags
  ) {
    errors.push(
      `Icon "${iconId}" must contain at least ` +
      `${minimumTags} tag(s).`
    );
  }

  if (
    maximumTags > 0 &&
    tags.length > maximumTags
  ) {
    errors.push(
      `Icon "${iconId}" contains more than ` +
      `${maximumTags} tag(s).`
    );
  }

  const normalizedIconId =
    normalizeTag(iconId);

  for (const tag of tags) {
    const normalizedTag =
      normalizeTag(tag);

    if (
      String(tag) !== normalizedTag
    ) {
      errors.push(
        `Icon "${iconId}" contains a non-normalized ` +
        `tag: "${tag}".`
      );
    }

    if (
      forbiddenTags.has(
        normalizedTag
      )
    ) {
      errors.push(
        `Icon "${iconId}" uses the forbidden tag ` +
        `"${normalizedTag}".`
      );
    }

    if (
      Object.hasOwn(
        tagAliases,
        normalizedTag
      )
    ) {
      errors.push(
        `Icon "${iconId}" still uses tag alias ` +
        `"${normalizedTag}".`
      );
    }

    if (
      removeBrandNameTags &&
      normalizedTag === normalizedIconId
    ) {
      errors.push(
        `Icon "${iconId}" uses its own identifier ` +
        "as a tag."
      );
    }
  }

  const normalizedTags =
    sortStrings(
      unique(
        tags
          .map(normalizeTag)
          .filter(Boolean)
      )
    );

  if (
    !arraysAreEqual(
      tags,
      normalizedTags
    )
  ) {
    errors.push(
      `Tags for icon "${iconId}" must be ` +
      "normalized, unique, and sorted alphabetically."
    );
  }

  return errors;
}

const metadata =
  await readJson(
    METADATA_FILE
  );

const rules =
  await readJson(
    RULES_FILE
  );

validateRootObject(
  metadata,
  METADATA_FILE
);

validateRootObject(
  rules,
  RULES_FILE
);

const categories =
  getArrayRule(
    rules,
    "categories"
  );

const forbiddenTagsList =
  getArrayRule(
    rules,
    "forbiddenTags"
  );

const categoryAliases =
  getObjectRule(
    rules,
    "categoryAliases"
  );

const tagAliases =
  getObjectRule(
    rules,
    "tagAliases"
  );

const iconOverrides =
  getObjectRule(
    rules,
    "iconOverrides"
  );

const allowedCategories =
  new Set(
    categories.map(
      normalizeText
    )
  );

if (
  allowedCategories.size === 0
) {
  console.error(
    `${RULES_FILE} does not define any allowed categories.`
  );

  process.exit(1);
}

const forbiddenTags =
  new Set(
    forbiddenTagsList
      .map(normalizeTag)
      .filter(Boolean)
  );

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

const validationErrors = [];

for (
  const [iconId, override]
  of Object.entries(iconOverrides)
) {
  validationErrors.push(
    ...validateOverride({
      iconId,
      override,
      metadata,
      allowedCategories
    })
  );
}

if (
  validationErrors.length > 0
) {
  console.error("");
  console.error(
    "Rule validation errors"
  );
  console.error(
    "----------------------"
  );

  for (const error of validationErrors) {
    console.error(
      `- ${error}`
    );
  }

  console.error("");
  console.error(
    "Metadata was not updated."
  );

  process.exit(1);
}

const updatedMetadata =
  structuredClone(metadata);

const changedIcons = [];
const unchangedIcons = [];

for (
  const [iconId, originalMetadata]
  of Object.entries(metadata)
) {
  if (
    selectedIcon &&
    iconId !== selectedIcon
  ) {
    continue;
  }

  if (
    originalMetadata === null ||
    Array.isArray(originalMetadata) ||
    typeof originalMetadata !== "object"
  ) {
    validationErrors.push(
      `Metadata for icon "${iconId}" must be an object.`
    );

    continue;
  }

  let iconMetadata = {
    ...originalMetadata,

    category:
      resolveCategory(
        originalMetadata.category,
        categoryAliases
      ),

    tags:
      Array.isArray(
        originalMetadata.tags
      )
        ? [...originalMetadata.tags]
        : []
  };

  iconMetadata =
    applyIconOverride({
      iconId,
      iconMetadata,
      override:
        iconOverrides[iconId]
    });

  iconMetadata.category =
    resolveCategory(
      iconMetadata.category,
      categoryAliases
    );

  iconMetadata.tags =
    normalizeTags({
      iconId,
      tags:
        iconMetadata.tags,
      tagAliases,
      forbiddenTags,
      removeBrandNameTags
    });

  validationErrors.push(
    ...validateMetadata({
      iconId,
      iconMetadata,
      allowedCategories,
      forbiddenTags,
      tagAliases,
      categoryAliases,
      removeBrandNameTags,
      minimumTags,
      maximumTags
    })
  );

  const originalCategory =
    normalizeText(
      originalMetadata.category
    );

  const originalTags =
    Array.isArray(
      originalMetadata.tags
    )
      ? originalMetadata.tags
      : [];

  const categoryChanged =
    originalCategory !==
    iconMetadata.category;

  const tagsChanged =
    !arraysAreEqual(
      originalTags,
      iconMetadata.tags
    );

  if (
    categoryChanged ||
    tagsChanged
  ) {
    changedIcons.push({
      id: iconId,

      previousCategory:
        originalCategory,

      category:
        iconMetadata.category,

      previousTags:
        originalTags,

      tags:
        iconMetadata.tags
    });
  } else {
    unchangedIcons.push(iconId);
  }

  updatedMetadata[iconId] =
    iconMetadata;
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

  for (const error of validationErrors) {
    console.error(
      `- ${error}`
    );
  }

  console.error("");
  console.error(
    "Metadata was not updated because validation failed."
  );

  process.exit(1);
}

console.log(
  `Processed ${
    selectedIcon
      ? 1
      : Object.keys(metadata).length
  } icon(s).`
);

console.log(
  `Changed ${changedIcons.length} icon(s).`
);

console.log(
  `Left ${unchangedIcons.length} icon(s) unchanged.`
);

if (
  changedIcons.length > 0
) {
  console.log("");
  console.log(
    "Planned changes"
  );
  console.log(
    "---------------"
  );

  for (const change of changedIcons) {
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

if (!writeChanges) {
  console.log("");
  console.log(
    "Dry-run completed. No file was modified."
  );

  const command =
    selectedIcon
      ? `npm run metadata:update -- --icon ` +
        `${selectedIcon} --write`
      : "npm run metadata:update -- --write";

  console.log(
    `Run "${command}" to apply these changes.`
  );

  process.exit(0);
}

if (
  changedIcons.length === 0
) {
  console.log("");
  console.log(
    "Metadata is already up to date."
  );

  process.exit(0);
}

if (createBackup) {
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
  `Applied changes to ${changedIcons.length} icon(s).`
);
