import {
  access,
  readFile,
  readdir
} from "node:fs/promises";
import process from "node:process";

const REQUIRED_FILES = [
  "selection.json",
  "icons-metadata.json",
  "chart-list.json",
  "chart-list.js",
  "style.css",
  "style.scss",
  "variables.scss"
];

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    console.error(`Unable to read ${file}: ${error.message}`);
    process.exitCode = 1;
    return null;
  }
}

function fail(message) {
  console.error(`Error: ${message}`);
  process.exitCode = 1;
}

function success(message) {
  console.log(`Success: ${message}`);
}

for (const file of REQUIRED_FILES) {
  try {
    await access(file);
  } catch {
    fail(`Required file not found: ${file}`);
  }
}

const selection = await readJson("selection.json");
const metadata = await readJson("icons-metadata.json");
const chart = await readJson("chart-list.json");
const rules = await readJson("metadata-rules.json");

const allowedCategories = new Set(rules.categories);
const forbiddenTags = new Set(
  rules.forbiddenTags.map((tag) => tag.toLowerCase())
);

if (!selection || !metadata || !chart) {
  process.exit(1);
}

if (!Array.isArray(selection.icons)) {
  fail('selection.json does not contain a valid "icons" array.');
  process.exit(1);
}

if (!Array.isArray(chart)) {
  fail("chart-list.json must contain a JSON array.");
  process.exit(1);
}

const css = await readFile("style.css", "utf8");
const scss = await readFile("style.scss", "utf8");
const variables = await readFile("variables.scss", "utf8");
const chartJs = await readFile("chart-list.js", "utf8");

const selectionIcons = selection.icons;
const chartById = new Map(
  chart.map((item) => [item.id, item])
);

const svgFiles = new Set(
  (await readdir("svg"))
    .filter((file) => file.endsWith(".svg"))
    .map((file) => file.slice(0, -4))
);

if (selectionIcons.length !== chart.length) {
  fail(
    `selection.json contains ${selectionIcons.length} icons, ` +
    `but chart-list.json contains ${chart.length}.`
  );
}

for (const sourceIcon of selectionIcons) {
  const id = sourceIcon.properties?.name;
  const code = Number(sourceIcon.properties?.code);

  if (!id) {
    fail("An icon in selection.json does not have a name.");
    continue;
  }

  if (!Number.isInteger(code)) {
    fail(`Icon "${id}" has an invalid Unicode code point.`);
    continue;
  }

  const unicodeText = code.toString(16).padStart(4, "0");
  const iconMetadata = metadata[id];

  if (!metadata[id]) {
    fail(`Metadata is missing for icon "${id}".`);
  }
  if (
    iconMetadata &&
    !allowedCategories.has(iconMetadata.category)
  ) {
    fail(
      `Icon "${id}" uses an invalid category: ` +
      `"${iconMetadata.category}".`
    );
  }

  if (iconMetadata) {
    const tags = Array.isArray(iconMetadata.tags)
      ? iconMetadata.tags
      : [];

    const normalizedTags = tags.map((tag) =>
      String(tag).trim().toLowerCase()
    );

    if (new Set(normalizedTags).size !== normalizedTags.length) {
      fail(`Icon "${id}" contains duplicate tags.`);
    }

    for (const tag of normalizedTags) {
      if (forbiddenTags.has(tag)) {
        fail(
          `Icon "${id}" uses the forbidden tag "${tag}".`
        );
      }

      if (tag !== tag.toLowerCase()) {
        fail(
          `Icon "${id}" contains a non-lowercase tag: "${tag}".`
        );
      }
    }
  }
  if (!chartById.has(id)) {
    fail(`Icon "${id}" is missing from chart-list.json.`);
  }

  if (!svgFiles.has(id)) {
    fail(`SVG file svg/${id}.svg is missing.`);
  }

  if (!css.includes(`.socicon-${id}:before`)) {
    fail(`Icon "${id}" is missing from style.css.`);
  }

  if (!scss.includes(`.socicon-${id}`)) {
    fail(`Icon "${id}" is missing from style.scss.`);
  }

  if (!variables.includes(`$socicon-${id}:`)) {
    fail(`Icon "${id}" is missing from variables.scss.`);
  }

  const chartIcon = chartById.get(id);

  if (
    chartIcon &&
    String(chartIcon.unicodeText).toLowerCase() !==
      unicodeText.toLowerCase()
  ) {
    fail(
      `Unicode mismatch for icon "${id}": ` +
      `${unicodeText} in selection.json, ` +
      `${chartIcon.unicodeText} in chart-list.json.`
    );
  }
}

for (const item of chart) {
  const existsInSelection = selectionIcons.some(
    (icon) => icon.properties?.name === item.id
  );

  if (!existsInSelection) {
    fail(
      `Icon "${item.id}" exists in chart-list.json ` +
      `but not in selection.json.`
    );
  }
}

for (const svgId of svgFiles) {
  const existsInSelection = selectionIcons.some(
    (icon) => icon.properties?.name === svgId
  );

  if (!existsInSelection) {
    fail(
      `SVG file svg/${svgId}.svg exists, ` +
      `but the icon is missing from selection.json.`
    );
  }
}

const expectedChartJs =
  `const chart = ${JSON.stringify(chart, null, 2)};\n`;

if (chartJs !== expectedChartJs) {
  fail(
    "chart-list.js is not synchronized with chart-list.json."
  );
}

if (process.exitCode) {
  console.error("");
  console.error("Asset validation failed.");
  process.exit(1);
}

success(`${selectionIcons.length} icons were validated.`);
success("Catalogs, styles, metadata, and SVG files are consistent.");