import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";

const frontendDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stylesheetPath = join(frontendDirectory, "src/app/globals.css");

test("Tailwind scans application sources without scanning temporary build output", async () => {
  const outputDirectory = mkdtempSync(join(frontendDirectory, "tailwind-source-regression-"));
  const markerVariable = "--source-scan-regression";
  try {
    const markerClass = ["bg-[var(", markerVariable, ")]"].join("");
    writeFileSync(join(outputDirectory, "cache.sst"), ` ${markerClass} \n`);
    const result = await postcss([tailwindcss({ base: frontendDirectory, optimize: false })])
      .process(readFileSync(stylesheetPath, "utf8"), { from: stylesheetPath });

    assert.match(result.css, /\.flex\s*\{\s*display:\s*flex;/, "Application flex utilities must remain available");
    assert.match(result.css, /\.sticky\s*\{\s*position:\s*sticky;/, "Application sticky utilities must remain available");
    assert.ok(!result.css.includes(markerVariable), "A class found only in temporary .sst build output must not be generated");
  } finally {
    rmSync(outputDirectory, { recursive: true, force: true });
  }
});
