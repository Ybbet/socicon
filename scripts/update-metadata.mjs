import {
  copyFile,
  readFile,
  writeFile
} from "node:fs/promises";
import process from "node:process";

const METADATA_FILE = "icons-metadata.json";
const RULES_FILE = "metadata-rules.json";

const argumentsList = new Set(process.argv.slice(2));

const writeChanges = argumentsList.has("--write");
const createBackup = !argumentsList.has("--no-backup");

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    console.error(`Unable to read ${file}: ${error.message}`);
    process.exit(1);
  }
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeTag(value) {
  return normalizeText(value).toLowerCase();
}

function unique(values) {
  return [...new Set(values)];
}

function arraysAreEqual(first, second) {
  return (
    first.length === second.length &&
    first.every((value, index) => value === second[index])
  );
}

function createBackupName() {
  const timestamp = new Date()
    .toISOString()
    .replaceAll(":", "-")
    .replace(/\.\d{3}Z$/, "Z");

  return `${METADATA_FILE}.${timestamp}.backup`;
}

function resolveCategory(category, rules) {
  const normalizedCategory = normalizeText(category);

  return rules.categoryAliases?.[normalizedCategory]
    ?? normalizedCategory;
}

function resolveTag(tag, rules) {
  const normalizedTag = normalizeTag(tag);

  if (!normalizedTag) {
    return null;
  }

  const alias = rules.tagAliases?.[normalizedTag];

  if (alias === null) {
    return null;
  }

  if (alias !== undefined) {
    return normalizeTag(alias);
  }

  return normalizedTag;
}

function normalizeTags(iconId, tags, rules) {
  const forbiddenTags = new Set(
    (rules.forbiddenTags ?? []).map(normalizeTag)
  );

  const normalizedIconId = normalizeTag(iconId);

  return unique(
    tags
      .map((tag) => resolveTag(tag, rules))
      .filter(Boolean)
      .filter((tag) => !forbiddenTags.has(tag))
      .filter((tag) => {
        if (!rules.removeBrandNameTags) {
          return true;
        }

        return tag !== normalizedIconId;
      })
  ).sort((first, second) =>
    first.localeCompare(second, "en", {
      sensitivity: "base"
    })
  );
}

function applyIconOverride(iconId, iconMetadata, rules) {
  const override = rules.iconOverrides?.[iconId];

  if (!override) {
    return iconMetadata;
  }

  const updatedMetadata = {
    ...iconMetadata
  };

  if (override.category !== undefined) {
    updatedMetadata.category = override.category;
  }

  let tags = Array.isArray(updatedMetadata.tags)
    ? [...updatedMetadata.tags]
    : [];

  /*
   * "tags" replaces the complete tag list.
   */
  if (Array.isArray(override.tags)) {
    tags = [...override.tags];
  }

  /*
   * "removeTags" removes specific tags while preserving the others.
   */
  if (Array.isArray(override.removeTags)) {
    const tagsToRemove = new Set(
      override.removeTags.map(normalizeTag)
    );

    tags = tags.filter(
      (tag) => !tagsToRemove.has(normalizeTag(tag))
    );
  }

  /*
   * "addTags" adds tags while preserving the existing list.
   */
  if (Array.isArray(override.addTags)) {
    tags.push(...override.addTags);
  }

  updatedMetadata.tags = tags;

  return updatedMetadata;
}

function validateMetadata(iconId, iconMetadata, rules) {
  const errors = [];

  const allowedCategories = new Set(
    rules.categories ?? []
  );

  if (
    allowedCategories.size > 0 &&
    !allowedCategories.has(iconMetadata.category)
  ) {
    errors.push(
      `Icon "${iconId}" uses an invalid category: ` +
      `"${iconMetadata.category}".`
    );
  }

  if (!Array.isArray(iconMetadata.tags)) {
    errors.push(
      `Icon "${iconId}" does not contain a valid tags array.`
    );
  }

  const minimumTags = Number(rules.minimumTags ?? 0);
  const maximumTags = Number(rules.maximumTags ?? 0);

  if (
    minimumTags > 0 &&
    iconMetadata.tags.length < minimumTags
  ) {
    errors.push(
      `Icon "${iconId}" must contain at least ` +
      `${minimumTags} tag(s).`
    );
  }

  if (
    maximumTags > 0 &&
    iconMetadata.tags.length > maximumTags
  ) {
    errors.push(
      `Icon "${iconId}" contains more than ` +
      `${maximumTags} tag(s).`
    );
  }

  return errors;
}

const metadata = await readJson(METADATA_FILE);
const rules = await readJson(RULES_FILE);

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

const updatedMetadata = {};

const changedIcons = [];
const unchangedIcons = [];
const validationErrors = [];

for (const [iconId, originalMetadata] of Object.entries(metadata)) {
  let iconMetadata = {
    ...originalMetadata,
    category: resolveCategory(
      originalMetadata.category,
      rules
    ),
    tags: Array.isArray(originalMetadata.tags)
      ? [...originalMetadata.tags]
      : []
  };

  iconMetadata = applyIconOverride(
    iconId,
    iconMetadata,
    rules
  );

  iconMetadata.category = resolveCategory(
    iconMetadata.category,
    rules
  );

  iconMetadata.tags = normalizeTags(
    iconId,
    iconMetadata.tags,
    rules
  );

  const originalCategory = normalizeText(
    originalMetadata.category
  );

  const originalTags = Array.isArray(originalMetadata.tags)
    ? originalMetadata.tags
    : [];

  const categoryChanged =
    originalCategory !== iconMetadata.category;

  const tagsChanged =
    !arraysAreEqual(originalTags, iconMetadata.tags);

  if (categoryChanged || tagsChanged) {
    changedIcons.push({
      id: iconId,
      previousCategory: originalCategory,
      category: iconMetadata.category,
      previousTags: originalTags,
      tags: iconMetadata.tags
    });
  } else {
    unchangedIcons.push(iconId);
  }

  validationErrors.push(
    ...validateMetadata(iconId, iconMetadata, rules)
  );

  updatedMetadata[iconId] = iconMetadata;
}

/*
 * Detect overrides referencing icons that do not exist.
 */
for (const iconId of Object.keys(rules.iconOverrides ?? {})) {
  if (!Object.hasOwn(metadata, iconId)) {
    validationErrors.push(
      `Metadata override references unknown icon "${iconId}".`
    );
  }
}

console.log(
  `Processed ${Object.keys(metadata).length} icons.`
);

console.log(
  `Changed ${changedIcons.length} icon(s).`
);

console.log(
  `Left ${unchangedIcons.length} icon(s) unchanged.`
);

if (changedIcons.length > 0) {
  console.log("");
  console.log("Planned changes");
  console.log("---------------");

  for (const change of changedIcons) {
    console.log("");
    console.log(change.id);

    if (change.previousCategory !== change.category) {
      console.log(
        `  Category: "${change.previousCategory}" ` +
        `-> "${change.category}"`
      );
    }

    if (!arraysAreEqual(change.previousTags, change.tags)) {
      console.log(
        `  Tags: ${JSON.stringify(change.previousTags)}`
      );

      console.log(
        `     -> ${JSON.stringify(change.tags)}`
      );
    }
  }
}

if (validationErrors.length > 0) {
  console.error("");
  console.error("Validation errors");
  console.error("-----------------");

  for (const error of validationErrors) {
    console.error(`- ${error}`);
  }

  console.error("");
  console.error(
    "Metadata was not updated because validation failed."
  );

  process.exit(1);
}

if (!writeChanges) {
  console.log("");
  console.log(
    "Dry-run completed. No file was modified."
  );

  console.log(
    `Run "npm run metadata:update -- --write" ` +
    `to apply these changes.`
  );

  process.exit(0);
}

if (changedIcons.length === 0) {
  console.log("");
  console.log("Metadata is already up to date.");
  process.exit(0);
}

if (createBackup) {
  const backupFile = createBackupName();

  await copyFile(METADATA_FILE, backupFile);

  console.log("");
  console.log(`Created backup: ${backupFile}`);
}

await writeFile(
  METADATA_FILE,
  `${JSON.stringify(updatedMetadata, null, 2)}\n`,
  "utf8"
);

console.log("");
console.log(
  `Updated ${METADATA_FILE} successfully.`
);