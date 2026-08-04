import { readFile } from "node:fs/promises";
import process from "node:process";

const METADATA_FILE = "icons-metadata.json";
const RULES_FILE = "metadata-rules.json";

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    console.error(`Unable to read ${file}: ${error.message}`);
    process.exit(1);
  }
}

function normalizeTag(tag) {
  return String(tag).trim().toLowerCase();
}

const metadata = await readJson(METADATA_FILE);
const rules = await readJson(RULES_FILE);

const allowedCategories = new Set(rules.categories);
const forbiddenTags = new Set(
  rules.forbiddenTags.map(normalizeTag)
);

const categoryUsage = new Map();
const tagUsage = new Map();

const invalidCategories = [];
const forbiddenTagUsage = [];
const duplicateTags = [];
const emptyTags = [];
const aliasesFound = [];

for (const [iconId, icon] of Object.entries(metadata)) {
  const category = String(icon.category || "").trim();

  categoryUsage.set(
    category,
    (categoryUsage.get(category) || 0) + 1
  );

  if (!allowedCategories.has(category)) {
    invalidCategories.push({
      icon: iconId,
      category
    });
  }

  const tags = Array.isArray(icon.tags)
    ? icon.tags.map(normalizeTag).filter(Boolean)
    : [];

  if (tags.length === 0) {
    emptyTags.push(iconId);
  }

  const uniqueTags = new Set();

  for (const tag of tags) {
    tagUsage.set(tag, (tagUsage.get(tag) || 0) + 1);

    if (uniqueTags.has(tag)) {
      duplicateTags.push({
        icon: iconId,
        tag
      });
    }

    uniqueTags.add(tag);

    if (forbiddenTags.has(tag)) {
      forbiddenTagUsage.push({
        icon: iconId,
        tag
      });
    }

    if (rules.tagAliases[tag]) {
      aliasesFound.push({
        icon: iconId,
        tag,
        replacement: rules.tagAliases[tag]
      });
    }

    if (tag === normalizeTag(iconId)) {
      aliasesFound.push({
        icon: iconId,
        tag,
        replacement: "(remove brand-name tag)"
      });
    }
  }
}

function printSection(title, entries) {
  console.log("");
  console.log(title);
  console.log("-".repeat(title.length));

  if (entries.length === 0) {
    console.log("None.");
    return;
  }

  for (const entry of entries) {
    console.log(
      typeof entry === "string"
        ? entry
        : JSON.stringify(entry)
    );
  }
}

console.log(
  `Audited ${Object.keys(metadata).length} icons.`
);

console.log(
  `Found ${categoryUsage.size} distinct categories.`
);

console.log(
  `Found ${tagUsage.size} distinct tags.`
);

printSection(
  "Invalid categories",
  invalidCategories
);

printSection(
  "Forbidden tag usage",
  forbiddenTagUsage
);

printSection(
  "Tag aliases to normalize",
  aliasesFound
);

printSection(
  "Duplicate tags",
  duplicateTags
);

printSection(
  "Icons without tags",
  emptyTags
);

if (
  invalidCategories.length > 0 ||
  forbiddenTagUsage.length > 0 ||
  duplicateTags.length > 0
) {
  process.exitCode = 1;
}