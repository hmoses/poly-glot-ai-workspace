import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const here = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(here, '../../ios/www/index.html');
const outPath = resolve(here, '../data/catalog.json');
const source = readFileSync(sourcePath, 'utf8');

function scanBalanced(start, open, close) {
  let depth = 0, quote = null, escaped = false;
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if (c === open) depth++;
    else if (c === close && --depth === 0) return i + 1;
  }
  throw new Error(`Unbalanced ${open}${close}`);
}

const marker = 'const TEMPLATES=';
const markerAt = source.indexOf(marker);
const arrayStart = source.indexOf('[', markerAt + marker.length);
const arrayEnd = scanBalanced(arrayStart, '[', ']');
const templatesLiteral = source.slice(arrayStart, arrayEnd);

const tplStart = source.indexOf('const TPL={};');
const tplEnd = source.indexOf('function buildPrompt', tplStart);
const tplRegion = source.slice(tplStart, tplEnd);
const lastAssign = tplRegion.lastIndexOf('TPL[');
let end = lastAssign, quote = null, escaped = false;
for (; end < tplRegion.length; end++) {
  const c = tplRegion[end];
  if (quote) {
    if (escaped) escaped = false;
    else if (c === '\\') escaped = true;
    else if (c === quote) quote = null;
  } else if (c === '"' || c === "'") quote = c;
  else if (c === ';') { end++; break; }
}
const promptCode = tplRegion.slice(0, end);
const context = {};
vm.runInNewContext(`const TEMPLATES=${templatesLiteral};\n${promptCode}\nglobalThis.result={templates:TEMPLATES,prompts:TPL};`, context, { timeout: 5000 });
writeFileSync(outPath, JSON.stringify(context.result));
console.log(`Synced ${context.result.templates.length} templates and ${Object.keys(context.result.prompts).length} prompt bodies.`);
