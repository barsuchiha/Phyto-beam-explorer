import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const version = (path) =>
  createHash("sha256").update(read(path)).digest("hex").slice(0, 12);
for (const page of ["index.html", "models.html"])
  test(`${page} versions every module and stylesheet, including transitive imports`, () => {
    const html = read(page),
      match = html.match(
        /<script type="importmap" id="pbe-importmap">([\s\S]*?)<\/script>/,
      );
    assert.ok(match, "Run npm run prepare:publish before publishing");
    const { imports } = JSON.parse(match[1]);
    const walk = (dir) =>
      readdirSync(new URL(dir, root), { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(dir + e.name + "/") : [dir + e.name],
      );
    for (const path of walk("src/").filter((p) => p.endsWith(".js"))) {
      assert.equal(
        imports["./" + path],
        `./${path}?v=${version(path)}`,
        `Stale module version: ${path}; run npm run prepare:publish`,
      );
      for (const [, specifier] of read(path)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .matchAll(/from\s+["']([^"']+)["']/g)) {
        const resolved = new URL(specifier, new URL(path, root));
        const relative = resolved.href.slice(root.href.length);
        assert.ok(imports["./" + relative], `Import map missing ${relative}`);
      }
    }
    const entry = page === "index.html" ? "src/app.js" : "src/models-app.js";
    assert.ok(html.includes(`src="./${entry}?v=${version(entry)}"`));
    assert.ok(html.indexOf('type="importmap"') < html.indexOf('type="module"'));
    for (const [, path] of html.matchAll(/href="\.\/(styles\/[^?]+\.css)\?/g))
      assert.ok(
        html.includes(`href="./${path}?v=${version(path)}"`),
        `Stale CSS version: ${path}`,
      );
  });
