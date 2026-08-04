import {
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import svgpath from "svgpath";

const SELECTION_FILE = "selection.json";
const METADATA_FILE = "icons-metadata.json";
const CHART_JSON_FILE = "chart-list.json";
const CHART_JS_FILE = "chart-list.js";
const SVG_DIRECTORY = "svg";

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    console.error(`Unable to read ${file}: ${error.message}`);
    process.exit(1);
  }
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function normalizeIconName(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function unicodeTextFromCode(code) {
  return Number(code).toString(16).padStart(4, "0");
}

/**
 * IcoMoon stores font paths using a font-oriented vertical axis.
 * The path must be flipped vertically to be rendered correctly inside
 * a standard SVG viewBox.
 */
function transformIcoMoonPath(pathData, ascent) {
  return svgpath(pathData)
    .scale(1, -1)
    .translate(0, ascent)
    .round(3)
    .toString();
}

function getSvgPathAttributes(attributes = {}) {
  const allowedAttributes = [
    "fill",
    "fill-opacity",
    "fill-rule",
    "opacity",
    "stroke",
    "stroke-width"
  ];

  const result = [];

  for (const attribute of allowedAttributes) {
    if (attributes[attribute] !== undefined) {
      result.push(
        `${attribute}="${escapeXml(attributes[attribute])}"`
      );
    }
  }

  if (!result.some((value) => value.startsWith("fill="))) {
    result.push('fill="currentColor"');
  }

  return result.join(" ");
}

function createStandaloneSvg({
  id,
  label,
  paths,
  attributes,
  width,
  height,
  ascent
}) {
  const pathElements = paths.map((pathData, index) => {
    const transformedPath = transformIcoMoonPath(pathData, ascent);
    const pathAttributes = getSvgPathAttributes(
      attributes[index] || {}
    );

    return `  <path ${pathAttributes} d="${escapeXml(transformedPath)}"/>`;
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<svg xmlns="http://www.w3.org/2000/svg"',
    `     viewBox="0 0 ${width} ${height}"`,
    '     role="img"',
    `     aria-labelledby="${id}-title">`,
    `  <title id="${id}-title">${escapeXml(label)}</title>`,
    ...pathElements,
    "</svg>",
    ""
  ].join("\n");
}

const selection = await readJson(SELECTION_FILE);
const metadata = await readJson(METADATA_FILE);

if (!Array.isArray(selection.icons)) {
  console.error(
    `${SELECTION_FILE} does not contain a valid "icons" array.`
  );
  process.exit(1);
}

const fontHeight = Number(selection.height || 1024);

const baselinePercentage = Number(
  selection.preferences?.fontPref?.metrics?.baseline || 0
);

/**
 * Example for the current Socicon configuration:
 *
 * Font height: 1024
 * Baseline: 6.25%
 * Ascent: 1024 - 64 = 960
 */
const ascent = fontHeight * (1 - baselinePercentage / 100);

await mkdir(SVG_DIRECTORY, { recursive: true });

/**
 * Remove previously generated SVG files so that icons deleted from
 * selection.json do not remain in the distribution.
 */
for (const file of await readdir(SVG_DIRECTORY)) {
  if (file.endsWith(".svg")) {
    await rm(path.join(SVG_DIRECTORY, file));
  }
}

const chart = [];
const seenNames = new Set();
const seenCodes = new Set();

for (const sourceIcon of selection.icons) {
  const properties = sourceIcon.properties || {};
  const icon = sourceIcon.icon || {};

  const id = normalizeIconName(properties.name);
  const code = Number(properties.code);
  const unicodeText = unicodeTextFromCode(code);

  if (!id) {
    throw new Error(
      `An icon has an invalid name: ${JSON.stringify(properties)}`
    );
  }

  if (!Number.isInteger(code)) {
    throw new Error(`Invalid Unicode code point for icon "${id}".`);
  }

  if (seenNames.has(id)) {
    throw new Error(`Duplicate icon name: "${id}".`);
  }

  if (seenCodes.has(code)) {
    throw new Error(
      `Duplicate Unicode code point: ${unicodeText} for icon "${id}".`
    );
  }

  seenNames.add(id);
  seenCodes.add(code);

  const iconMetadata = metadata[id];

  if (!iconMetadata) {
    throw new Error(
      `Missing metadata for icon "${id}". ` +
      `Add an entry to ${METADATA_FILE}.`
    );
  }

  const paths = Array.isArray(icon.paths) ? icon.paths : [];

  const attributes = Array.isArray(icon.attrs)
    ? icon.attrs
    : Array.isArray(sourceIcon.attrs)
      ? sourceIcon.attrs
      : [];

  if (paths.length === 0) {
    throw new Error(`No SVG path found for icon "${id}".`);
  }

  const width = Number(icon.width || fontHeight);

  const transformedPaths = paths.map((pathData) =>
    transformIcoMoonPath(pathData, ascent)
  );

  /**
   * Multiple SVG subpaths can be stored in a single "d" attribute.
   * Joining them preserves compatibility with the historical "path"
   * property used by chart-list.json.
   */
  const combinedPath = transformedPaths.join(" ");

  const label =
    iconMetadata.name ||
    icon.tags?.[0] ||
    id;

  chart.push({
    id,
    name: label,
    unicode: String.fromCodePoint(code),
    unicodeText,
    color: iconMetadata.color || "#000000",
    url: iconMetadata.url || "",
    category: iconMetadata.category || "Other",
    tags: Array.isArray(iconMetadata.tags)
      ? iconMetadata.tags.join(", ")
      : String(iconMetadata.tags || ""),
    path: combinedPath
  });

  const svg = createStandaloneSvg({
    id,
    label,
    paths,
    attributes,
    width,
    height: fontHeight,
    ascent
  });

  await writeFile(
    path.join(SVG_DIRECTORY, `${id}.svg`),
    svg,
    "utf8"
  );
}

/**
 * Keep catalog entries sorted alphabetically for stable and readable diffs.
 * Icon positions and Unicode code points are not modified.
 */
chart.sort((first, second) =>
  first.id.localeCompare(second.id, "en", {
    sensitivity: "base",
    numeric: true
  })
);

await writeFile(
  CHART_JSON_FILE,
  `${JSON.stringify(chart, null, 2)}\n`,
  "utf8"
);

/**
 * Preserve the historical global "chart" constant used by the demo.
 */
await writeFile(
  CHART_JS_FILE,
  `const chart = ${JSON.stringify(chart, null, 2)};\n`,
  "utf8"
);

console.log(
  `Generated ${chart.length} entries in ${CHART_JSON_FILE}.`
);

console.log(
  `Generated ${chart.length} entries in ${CHART_JS_FILE}.`
);

console.log(
  `Generated ${chart.length} individual SVG files in ${SVG_DIRECTORY}/.`
);