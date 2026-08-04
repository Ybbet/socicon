import {
  copyFile,
  readFile,
  writeFile
} from "node:fs/promises";

import process from "node:process";

const METADATA_FILE = "icons-metadata.json";
const SUGGESTIONS_FILE = "metadata-suggestions.json";

const argumentsSet = new Set(process.argv.slice(2));

const noBackup = argumentsSet.has("--no-backup");

async function readJson(file) {
  return JSON.parse(
    await readFile(file, "utf8")
  );
}

async function writeJson(file, data) {
  await writeFile(
    file,
    `${JSON.stringify(data, null, 2)}\n`,
    "utf8"
  );
}

function normalizeTag(tag) {
  return String(tag)
    .trim()
    .toLowerCase();
}

function unique(values) {
  return [...new Set(values)];
}

function normalizeTags(tags) {
  return unique(
    (tags ?? [])
      .map(normalizeTag)
      .filter(Boolean)
  ).sort((a, b) =>
    a.localeCompare(b, "en")
  );
}

function backupName() {
  return `${METADATA_FILE}.${new Date()
    .toISOString()
    .replaceAll(":", "-")}.backup`;
}

const metadata = await readJson(METADATA_FILE);
const suggestions = await readJson(SUGGESTIONS_FILE);

let applied = 0;
let skipped = 0;
let unchanged = 0;

if (!noBackup) {
  const backup = backupName();

  await copyFile(
    METADATA_FILE,
    backup
  );

  console.log(
    `Created backup: ${backup}`
  );
}

for (const [
  iconId,
  suggestion
] of Object.entries(
  suggestions.icons ?? {}
)) {

  if (!suggestion.approved) {
    skipped++;
    continue;
  }

  const icon = metadata[iconId];

  if (!icon) {
    console.warn(
      `Unknown icon "${iconId}", skipped.`
    );
    skipped++;
    continue;
  }

  const proposed =
    suggestion.suggested ?? {};

  let changed = false;

  /*
   * Category
   */
  if (
    proposed.category &&
    proposed.category !== icon.category
  ) {
    icon.category =
      proposed.category;

    changed = true;
  }

  /*
   * Description
   */
  if (
    proposed.description &&
    proposed.description !==
      icon.description
  ) {
    icon.description =
      proposed.description;

    changed = true;
  }

  /*
   * Tags
   */
  if (
    Array.isArray(proposed.tags) &&
    proposed.tags.length > 0
  ) {

    const tags = normalizeTags([
      ...(icon.tags ?? []),
      ...proposed.tags
    ]);

    const previous =
      normalizeTags(icon.tags);

    if (
      JSON.stringify(tags) !==
      JSON.stringify(previous)
    ) {
      icon.tags = tags;
      changed = true;
    }
  }

  /*
   * Optional fields
   */

  for (const field of [
    "aliases",
    "status",
    "color",
    "url"
  ]) {

    if (
      proposed[field] !== undefined &&
      JSON.stringify(
        proposed[field]
      ) !==
        JSON.stringify(icon[field])
    ) {

      icon[field] =
        proposed[field];

      changed = true;
    }
  }

  if (changed) {
    applied++;
  } else {
    unchanged++;
  }
}

await writeJson(
  METADATA_FILE,
  metadata
);

console.log("");
console.log(
  "Metadata update summary"
);
console.log(
  "-----------------------"
);

console.log(
  `Applied   : ${applied}`
);

console.log(
  `Skipped   : ${skipped}`
);

console.log(
  `Unchanged : ${unchanged}`
);

console.log("");
console.log(
  `${METADATA_FILE} updated successfully.`
);