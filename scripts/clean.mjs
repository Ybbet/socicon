import {
  readdir,
  rm,
  stat
} from "node:fs/promises";
import path from "node:path";

const GENERATED_FILES = [
  "chart-list.json",
  "chart-list.js"
];

const SVG_DIRECTORY = "svg";

async function removeFile(file) {
  try {
    await rm(file);

    console.log(`Removed ${file}`);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

async function removeSvgDirectoryContent() {
  try {
    const directory = await stat(SVG_DIRECTORY);

    if (!directory.isDirectory()) {
      return;
    }

    const files = await readdir(SVG_DIRECTORY);

    let removed = 0;

    for (const file of files) {
      if (!file.endsWith(".svg")) {
        continue;
      }

      await rm(path.join(SVG_DIRECTORY, file));
      removed++;
    }

    console.log(`Removed ${removed} SVG file(s).`);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

async function main() {
  console.log("Cleaning generated assets...");
  console.log("");

  for (const file of GENERATED_FILES) {
    await removeFile(file);
  }

  await removeSvgDirectoryContent();

  console.log("");
  console.log("Generated assets successfully cleaned.");
}

main().catch((error) => {
  console.error("");
  console.error(`Error: ${error.message}`);
  process.exit(1);
});