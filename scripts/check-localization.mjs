import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SUPPORTED_LANGUAGES,
  applyLanguageInstructions,
  localizedTemplateMeta,
  resolveLanguage,
} from "../localization.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const catalog = JSON.parse(readFileSync(join(root, "data", "catalog.json"), "utf8"));
if (SUPPORTED_LANGUAGES.length !== 38) throw new Error(`Expected 38 languages, got ${SUPPORTED_LANGUAGES.length}`);
for (const lang of SUPPORTED_LANGUAGES) {
  const file = join(root, "data", "localizations", `tpl_${lang.code.toLowerCase()}.json`);
  if (!existsSync(file)) throw new Error(`Missing template localization: ${lang.code}`);
}
const sample = catalog.templates.find((t) => t.name === "Side Hustle Finder") ?? catalog.templates[0];
const spanish = localizedTemplateMeta(sample, "ES");
if (!spanish.name || !spanish.description) throw new Error("Spanish metadata localization failed");
if (resolveLanguage("Chinese (Traditional)").code !== "ZH_TW") throw new Error("Language name resolution failed");
const prompt = applyLanguageInstructions("Do the task.", "JA", "FR");
if (!prompt.includes("Japanese") || !prompt.includes("French")) throw new Error("Input/output language instructions failed");
console.log(JSON.stringify({
  supportedLanguages: SUPPORTED_LANGUAGES.length,
  localizedTemplateFiles: SUPPORTED_LANGUAGES.length,
  sampleEnglish: sample.name,
  sampleSpanish: spanish.name,
  multilingualInputOutput: true,
}, null, 2));
