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
const RULES_FILE = "metadata-rules.json";

const CHART_JSON_FILE = "chart-list.json";
const CHART_JS_FILE = "chart-list.js";
const SVG_DIRECTORY = "svg";

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

function normalizeIconName(value) {
  return normalizeSearchText(value)
    .replace(/[^a-z0-9_-]+/g, "-")
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

function unicodeTextFromCode(code) {
  return Number(code)
    .toString(16)
    .padStart(4, "0")
    .toLowerCase();
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/**
 * Convert IcoMoon paths to the coordinate system historically used
 * by chart-list.json and chart-list.js.
 *
 * This transformation must not be applied to standalone SVG files,
 * because paths from selection.json already use the correct orientation.
 */
function transformIcoMoonPath(
  pathData,
  ascent
) {
  return svgpath(pathData)
    .scale(1, -1)
    .translate(0, ascent)
    .round(3)
    .toString();
}

function getSvgPathAttributes(
  attributes = {}
) {
  const allowedAttributes = [
    "fill",
    "fill-opacity",
    "fill-rule",
    "opacity",
    "stroke",
    "stroke-linecap",
    "stroke-linejoin",
    "stroke-miterlimit",
    "stroke-opacity",
    "stroke-width"
  ];

  const result = [];

  for (
    const attribute
    of allowedAttributes
  ) {
    if (
      attributes[attribute] === undefined
    ) {
      continue;
    }

    result.push(
      `${attribute}="${escapeXml(
        attributes[attribute]
      )}"`
    );
  }

  if (
    !result.some(
      (value) =>
        value.startsWith("fill=")
    )
  ) {
    result.push(
      'fill="currentColor"'
    );
  }

  return result.join(" ");
}

function createStandaloneSvg({
  id,
  label,
  paths,
  attributes,
  width,
  height
}) {
  const pathElements =
    paths.map(
      (pathData, index) => {
        const pathAttributes =
          getSvgPathAttributes(
            attributes[index] ?? {}
          );

        /*
         * Paths from selection.json already use the correct orientation
         * for a standalone SVG viewBox.
         */
        return (
          `  <path ${pathAttributes} ` +
          `d="${escapeXml(pathData)}"/>`
        );
      }
    );

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
  if (
    iconMetadata === null ||
    Array.isArray(iconMetadata) ||
    typeof iconMetadata !== "object"
  ) {
    throw new Error(
      `Metadata for icon "${iconId}" must be an object.`
    );
  }

  const warnings = [];

  const name =
    normalizeText(iconMetadata.name);

  const color =
    normalizeText(iconMetadata.color);

  const url =
    normalizeText(iconMetadata.url);

  const category =
    normalizeText(
      iconMetadata.category
    );

  if (!name) {
    throw new Error(
      `Icon "${iconId}" does not have a metadata name.`
    );
  }

  if (!color) {
    throw new Error(
      `Icon "${iconId}" does not have a color.`
    );
  }

  if (!url) {
    warnings.push(
      `Icon "${iconId}" does not have an official URL.`
    );
  }

  if (!category) {
    throw new Error(
      `Icon "${iconId}" does not have a category.`
    );
  }

  if (
    !allowedCategories.has(category)
  ) {
    throw new Error(
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
    throw new Error(
      `Icon "${iconId}" still uses category alias ` +
      `"${category}".`
    );
  }

  if (
    !Array.isArray(
      iconMetadata.tags
    )
  ) {
    throw new Error(
      `Icon "${iconId}" does not contain a valid tags array.`
    );
  }

  const originalTags =
    iconMetadata.tags;

  const normalizedTags =
    normalizeTags(originalTags);

  if (
    !arraysAreEqual(
      originalTags,
      normalizedTags
    )
  ) {
    throw new Error(
      `Tags for icon "${iconId}" must be normalized, ` +
      "unique, and sorted alphabetically."
    );
  }

  if (
    minimumTags > 0 &&
    normalizedTags.length < minimumTags
  ) {
    throw new Error(
      `Icon "${iconId}" must contain at least ` +
      `${minimumTags} tag(s).`
    );
  }

  if (
    maximumTags > 0 &&
    normalizedTags.length > maximumTags
  ) {
    throw new Error(
      `Icon "${iconId}" contains more than ` +
      `${maximumTags} tag(s).`
    );
  }

  const normalizedIconId =
    normalizeTag(iconId);

  for (const tag of normalizedTags) {
    if (
      forbiddenTags.has(tag)
    ) {
      throw new Error(
        `Icon "${iconId}" uses the forbidden tag ` +
        `"${tag}".`
      );
    }

    if (
      Object.hasOwn(
        tagAliases,
        tag
      )
    ) {
      const replacement =
        tagAliases[tag];

      if (replacement === null) {
        throw new Error(
          `Icon "${iconId}" uses deprecated tag ` +
          `"${tag}", which must be removed.`
        );
      }

      throw new Error(
        `Icon "${iconId}" uses tag alias ` +
        `"${tag}". Use "${replacement}" instead.`
      );
    }

    if (
      removeBrandNameTags &&
      tag === normalizedIconId
    ) {
      throw new Error(
        `Icon "${iconId}" uses its own identifier as a tag.`
      );
    }
  }

  return {
    metadata: {
      name,
      color,
      url,
      category,
      tags: normalizedTags
    },
    warnings
  };
}

function validateSourceIcon({
  sourceIcon,
  seenNames,
  seenCodes,
  defaultWidth
}) {
  const properties =
    sourceIcon.properties ?? {};

  const icon =
    sourceIcon.icon ?? {};

  const id =
    normalizeIconName(
      properties.name
    );

  const code =
    Number(properties.code);

  if (!id) {
    throw new Error(
      `An icon has an invalid name: ` +
      `${JSON.stringify(properties)}`
    );
  }

  if (!Number.isInteger(code)) {
    throw new Error(
      `Invalid Unicode code point for icon "${id}".`
    );
  }

  if (
    code < 0 ||
    code > 0x10ffff
  ) {
    throw new Error(
      `Unicode code point for icon "${id}" is out of range.`
    );
  }

  if (seenNames.has(id)) {
    throw new Error(
      `Duplicate icon name: "${id}".`
    );
  }

  if (seenCodes.has(code)) {
    throw new Error(
      `Duplicate Unicode code point: ` +
      `${unicodeTextFromCode(code)} ` +
      `for icon "${id}".`
    );
  }

  const paths =
    Array.isArray(icon.paths)
      ? icon.paths
      : [];

  if (paths.length === 0) {
    throw new Error(
      `No SVG path found for icon "${id}".`
    );
  }

  for (
    let index = 0;
    index < paths.length;
    index += 1
  ) {
    if (
      typeof paths[index] !== "string" ||
      !paths[index].trim()
    ) {
      throw new Error(
        `Invalid SVG path ${index + 1} ` +
        `for icon "${id}".`
      );
    }
  }

  /*
   * IcoMoon omits the width property for glyphs using the default
   * square dimensions. In that case, the font height is used.
   */
  const width =
    Number(
      icon.width ??
      sourceIcon.width ??
      defaultWidth
    );

  if (
    !Number.isFinite(width) ||
    width <= 0
  ) {
    throw new Error(
      `Invalid SVG width for icon "${id}".`
    );
  }

  const attributes =
    Array.isArray(icon.attrs)
      ? icon.attrs
      : Array.isArray(
          sourceIcon.attrs
        )
        ? sourceIcon.attrs
        : [];

  seenNames.add(id);
  seenCodes.add(code);

  return {
    id,
    code,
    icon,
    paths,
    attributes,
    width
  };
}

async function removeGeneratedSvgFiles() {
  await mkdir(
    SVG_DIRECTORY,
    {
      recursive: true
    }
  );

  const files =
    await readdir(
      SVG_DIRECTORY
    );

  for (const file of files) {
    if (
      !file.endsWith(".svg")
    ) {
      continue;
    }

    await rm(
      path.join(
        SVG_DIRECTORY,
        file
      )
    );
  }
}

const selection =
  await readJson(SELECTION_FILE);

const metadata =
  await readJson(METADATA_FILE);

const rules =
  await readJson(RULES_FILE);

validateRootObject(
  selection,
  SELECTION_FILE
);

validateRootObject(
  metadata,
  METADATA_FILE
);

validateRootObject(
  rules,
  RULES_FILE
);

if (
  !Array.isArray(
    selection.icons
  )
) {
  console.error(
    `${SELECTION_FILE} does not contain ` +
    'a valid "icons" array.'
  );

  process.exit(1);
}

if (
  !Array.isArray(
    rules.categories
  ) ||
  rules.categories.length === 0
) {
  console.error(
    `${RULES_FILE} does not define ` +
    'a valid non-empty "categories" array.'
  );

  process.exit(1);
}

if (
  !Array.isArray(
    rules.forbiddenTags
  )
) {
  console.error(
    `${RULES_FILE} does not define ` +
    'a valid "forbiddenTags" array.'
  );

  process.exit(1);
}

const categoryAliases =
  rules.categoryAliases &&
  typeof rules.categoryAliases === "object" &&
  !Array.isArray(
    rules.categoryAliases
  )
    ? rules.categoryAliases
    : {};

const tagAliases =
  rules.tagAliases &&
  typeof rules.tagAliases === "object" &&
  !Array.isArray(
    rules.tagAliases
  )
    ? rules.tagAliases
    : {};

const allowedCategories =
  new Set(
    rules.categories.map(
      normalizeText
    )
  );

const forbiddenTags =
  new Set(
    rules.forbiddenTags
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

const fontHeight =
  Number(
    selection.height || 1024
  );

if (
  !Number.isFinite(fontHeight) ||
  fontHeight <= 0
) {
  console.error(
    `${SELECTION_FILE} contains an invalid font height.`
  );

  process.exit(1);
}

const baselinePercentage =
  Number(
    selection.preferences
      ?.fontPref
      ?.metrics
      ?.baseline ?? 0
  );

if (
  !Number.isFinite(
    baselinePercentage
  ) ||
  baselinePercentage < 0 ||
  baselinePercentage >= 100
) {
  console.error(
    `${SELECTION_FILE} contains an invalid baseline percentage.`
  );

  process.exit(1);
}

/**
 * Example for the current Socicon configuration:
 *
 * Font height: 1024
 * Baseline: 6.25%
 * Ascent: 1024 - 64 = 960
 */
const ascent =
  fontHeight *
  (
    1 -
    baselinePercentage / 100
  );

await removeGeneratedSvgFiles();

const chart = [];
const warnings = [];
const seenNames = new Set();
const seenCodes = new Set();

for (
  const sourceIcon
  of selection.icons
) {
  const validatedSource =
    validateSourceIcon({
      sourceIcon,
      seenNames,
      seenCodes,
      defaultWidth: fontHeight
    });

  const {
    id,
    code,
    paths,
    attributes,
    width
  } = validatedSource;

  const iconMetadata =
    metadata[id];

  if (!iconMetadata) {
    throw new Error(
      `Missing metadata for icon "${id}". ` +
      `Add an entry to ${METADATA_FILE}.`
    );
  }

  const {
    metadata: validatedMetadata,
    warnings: metadataWarnings
  } =
    validateMetadata({
      iconId: id,
      iconMetadata,
      allowedCategories,
      forbiddenTags,
      tagAliases,
      categoryAliases,
      removeBrandNameTags,
      minimumTags,
      maximumTags
    });

  warnings.push(
    ...metadataWarnings
  );

  const unicodeText =
    unicodeTextFromCode(code);

  const transformedPaths =
    paths.map(
      (pathData) =>
        transformIcoMoonPath(
          pathData,
          ascent
        )
    );

  /*
   * Multiple SVG subpaths can be stored in a single "d" attribute.
   * Joining them preserves compatibility with the historical "path"
   * property used by chart-list.json.
   */
  const combinedPath =
    transformedPaths.join(" ");

  chart.push({
    id,
    name:
      validatedMetadata.name,
    unicode:
      String.fromCodePoint(code),
    unicodeText,
    color:
      validatedMetadata.color,
    url:
      validatedMetadata.url,
    category:
      validatedMetadata.category,
    tags:
      validatedMetadata.tags.join(", "),
    path:
      combinedPath
  });

  const svg =
    createStandaloneSvg({
      id,
      label:
        validatedMetadata.name,
      paths,
      attributes,
      width,
      height:
        fontHeight
    });

  await writeFile(
    path.join(
      SVG_DIRECTORY,
      `${id}.svg`
    ),
    svg,
    "utf8"
  );
}

for (
  const iconId
  of Object.keys(metadata)
) {
  if (!seenNames.has(iconId)) {
    throw new Error(
      `Metadata exists for icon "${iconId}", ` +
      `but the icon is missing from ${SELECTION_FILE}.`
    );
  }
}

/**
 * Keep catalog entries sorted alphabetically for stable and readable
 * diffs. Icon positions and Unicode code points are not modified.
 */
chart.sort(
  (first, second) =>
    first.id.localeCompare(
      second.id,
      "en",
      {
        sensitivity: "base",
        numeric: true
      }
    )
);

await writeFile(
  CHART_JSON_FILE,
  `${JSON.stringify(
    chart,
    null,
    2
  )}\n`,
  "utf8"
);

/**
 * Preserve the historical global "chart" constant used by the demo.
 */
await writeFile(
  CHART_JS_FILE,
  `const chart = ${JSON.stringify(
    chart,
    null,
    2
  )};\n`,
  "utf8"
);

console.log(
  `Generated ${chart.length} entries in ` +
  `${CHART_JSON_FILE}.`
);

console.log(
  `Generated ${chart.length} entries in ` +
  `${CHART_JS_FILE}.`
);

console.log(
  `Generated ${chart.length} individual SVG files in ` +
  `${SVG_DIRECTORY}/.`
);

if (warnings.length > 0) {
  console.log("");
  console.log(
    `Generation completed with ${warnings.length} warning(s).`
  );

  for (const warning of warnings) {
    console.log(
      `Warning: ${warning}`
    );
  }
}
