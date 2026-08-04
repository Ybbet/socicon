import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";

const CHART_LIST_FILE = "chart-list.json";
const OUTPUT_FILE = "icons-metadata.json";

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    console.error(`Unable to read ${file}: ${error.message}`);
    process.exit(1);
  }
}

const chart = await readJson(CHART_LIST_FILE);

if (!Array.isArray(chart)) {
  console.error(`${CHART_LIST_FILE} must contain a JSON array.`);
  process.exit(1);
}

const metadata = {};

for (const item of chart) {
  if (!item.id) {
    console.error(
      `${CHART_LIST_FILE} contains an entry without an icon identifier.`
    );
    process.exit(1);
  }

  metadata[item.id] = {
    name: item.name || item.id,
    color: item.color || "#000000",
    url: item.url || "",
    category: item.category || "Other",
    tags: Array.isArray(item.tags)
      ? item.tags
      : String(item.tags || "")
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
  };
}

await writeFile(
  OUTPUT_FILE,
  `${JSON.stringify(metadata, null, 2)}\n`,
  "utf8"
);

console.log(
  `Generated ${OUTPUT_FILE} with ${Object.keys(metadata).length} icons.`
);