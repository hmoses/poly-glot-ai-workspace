/**
 * POLY-GLOT LOCALIZATION LAYER
 *
 * Shared by ChatGPT and Claude through the MCP server. The native app already
 * ships localized UI/template metadata. This module reuses that source data so
 * the marketplace clients do not become English-only forks.
 *
 * Security note: language selection changes presentation/instructions only. It
 * never changes subscription state or bypasses template entitlement checks.
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const SUPPORTED_LANGUAGES = Object.freeze([
  ["EN","English","🇺🇸"],["ES","Spanish","🇪🇸"],["FR","French","🇫🇷"],["DE","German","🇩🇪"],
  ["IT","Italian","🇮🇹"],["PT","Portuguese","🇧🇷"],["NL","Dutch","🇳🇱"],["RU","Russian","🇷🇺"],
  ["ZH","Chinese (Simplified)","🇨🇳"],["ZH_TW","Chinese (Traditional)","🇹🇼"],["JA","Japanese","🇯🇵"],["KO","Korean","🇰🇷"],
  ["AR","Arabic","🇸🇦"],["HI","Hindi","🇮🇳"],["BN","Bengali","🇧🇩"],["TR","Turkish","🇹🇷"],
  ["PL","Polish","🇵🇱"],["SV","Swedish","🇸🇪"],["NO","Norwegian","🇳🇴"],["DA","Danish","🇩🇰"],
  ["FI","Finnish","🇫🇮"],["EL","Greek","🇬🇷"],["HE","Hebrew","🇮🇱"],["ID","Indonesian","🇮🇩"],
  ["MS","Malay","🇲🇾"],["TH","Thai","🇹🇭"],["VI","Vietnamese","🇻🇳"],["UK","Ukrainian","🇺🇦"],
  ["CS","Czech","🇨🇿"],["RO","Romanian","🇷🇴"],["HU","Hungarian","🇭🇺"],["SK","Slovak","🇸🇰"],
  ["HR","Croatian","🇭🇷"],["CA","Catalan","🇪🇸"],["AF","Afrikaans","🇿🇦"],["SW","Swahili","🇰🇪"],
  ["HA","Hausa","🇳🇬"],["AM","Amharic","🇪🇹"],
].map(([code,name,flag]) => Object.freeze({ code, name, flag })));

const byCode = new Map(SUPPORTED_LANGUAGES.map((x) => [x.code, x]));
const byName = new Map(SUPPORTED_LANGUAGES.map((x) => [x.name.toLowerCase(), x]));
const localeCache = new Map();
const widgetLocales = JSON.parse(readFileSync(join(__dirname, "data", "widget-locales.json"), "utf8"));

export function resolveLanguage(value, fallback = "EN") {
  if (!value) return byCode.get(fallback) ?? byCode.get("EN");
  const raw = String(value).trim();
  const normalized = raw.toUpperCase().replaceAll("-", "_");
  if (byCode.has(normalized)) return byCode.get(normalized);
  if (normalized === "ZH_TW" || normalized === "ZH_HANT") return byCode.get("ZH_TW");
  if (normalized === "ZH_CN" || normalized === "ZH_HANS") return byCode.get("ZH");
  return byName.get(raw.toLowerCase()) ?? byCode.get(fallback) ?? byCode.get("EN");
}

export function languagePublicList() {
  return SUPPORTED_LANGUAGES.map(({ code, name, flag }) => ({ code, name, flag }));
}

export function uiStrings(uiLanguage = "EN") {
  const lang = resolveLanguage(uiLanguage);
  return { ...(widgetLocales.EN ?? {}), ...(widgetLocales[lang.code] ?? {}) };
}

export function localizedTemplateMeta(template, uiLanguage = "EN") {
  const lang = resolveLanguage(uiLanguage);
  if (lang.code === "EN") return { name: template.name, description: template.desc };
  if (!localeCache.has(lang.code)) {
    const filename = `tpl_${lang.code.toLowerCase()}.json`;
    const path = join(__dirname, "data", "localizations", filename);
    let data = {};
    if (existsSync(path)) {
      try { data = JSON.parse(readFileSync(path, "utf8")); } catch { data = {}; }
    }
    localeCache.set(lang.code, data);
  }
  const translated = localeCache.get(lang.code)?.templates?.[template.name];
  return {
    name: translated?.n || template.name,
    description: translated?.d || template.desc,
  };
}

export function localizedFieldLabel(fieldKey, uiLanguage = "EN") {
  const lang = resolveLanguage(uiLanguage);
  if (lang.code === "EN") return String(fieldKey).replaceAll("_", " ");
  if (!localeCache.has(lang.code)) {
    localizedTemplateMeta({ name: "", desc: "" }, lang.code);
  }
  return localeCache.get(lang.code)?.fields?.[fieldKey] || String(fieldKey).replaceAll("_", " ");
}

export function languageContext({ uiLanguage = "EN", inputLanguage = "EN", outputLanguage = "EN" } = {}) {
  const ui = resolveLanguage(uiLanguage);
  const input = resolveLanguage(inputLanguage, ui.code);
  const output = resolveLanguage(outputLanguage, ui.code);
  return {
    uiLanguage: ui,
    inputLanguage: input,
    outputLanguage: output,
    supportedCount: SUPPORTED_LANGUAGES.length,
  };
}

export function applyLanguageInstructions(prompt, inputLanguage, outputLanguage) {
  let body = String(prompt ?? "");
  const input = resolveLanguage(inputLanguage);
  const output = resolveLanguage(outputLanguage);
  if (input.code !== "EN") {
    body += `\n\nThe user-provided field values may be written in ${input.name}. Interpret them faithfully and preserve their meaning.`;
  }
  if (output.code !== "EN") {
    body += `\n\nRespond entirely in ${output.name}.`;
  }
  return body;
}
