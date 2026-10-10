import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";

const html = readFileSync(new URL("../public/workspace-widget.html", import.meta.url), "utf8");
const bundleJs = readFileSync(new URL("../data/widget-html.js", import.meta.url), "utf8");
const bundle = JSON.parse(bundleJs.replace(/^export default\s*/, "").replace(/;\s*$/, ""));
const server = readFileSync(new URL("../server.js", import.meta.url), "utf8");

test("bundled Neon GUI matches public widget byte-for-byte", () => {
  assert.equal(bundle, html);
});
test("embedded GUI module syntax is valid", () => {
  const match = html.match(/<script type="module">([\s\S]*?)<\/script>/);
  assert.ok(match, "expected embedded GUI module");
  assert.doesNotThrow(() => new Script(match[1], { filename: "workspace-widget.html" }));
});
test("every supported UI language has accessible editor controls", () => {
  const languages = JSON.parse(html.match(/const LANGUAGES=(\[[^\n]+\]);/)[1]);
  const translations = JSON.parse(html.match(/const EDITOR_UX=(\{[^\n]+\});/)[1]);
  assert.equal(languages.length, 38);
  assert.deepEqual(Object.keys(translations).sort(), languages.map(l => l.code).sort());
  for (const { code } of languages) {
    assert.equal(translations[code].length, 3);
    assert.ok(translations[code].every(s => typeof s === "string" && s.length > 2));
  }
});
test("prompt editor supports resizing, drafts and keyboard editing", () => {
  assert.match(html, /\.field textarea\{[^}]*min-height:210px/);
  assert.match(html, /function fitEditor\(el\)/);
  assert.match(html, /function enhanceEditors\(t\)/);
  assert.match(html, /const drafts=new Map\(\)/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /aria-keyshortcuts="Control\+Enter Meta\+Enter"/);
  assert.match(html, /const value=savedField\(t\.id,f\.key,f\.defaultValue\)/);
});
test("no changes to the entitlement gate, client/tool registration or display-mode availability", () => {
  assert.match(server, /const UI_META = Object\.freeze/);
  assert.match(server, /availableDisplayModes: \["inline", "fullscreen"\]/);
  assert.match(server, /registerAppTool\(server, "build_prompt"/);
  assert.match(server, /registerAppTool\(server, "prepare_compare"/);
  assert.match(html, /callTool\('build_prompt'/);
  assert.match(html, /callTool\('prepare_compare'/);
});
