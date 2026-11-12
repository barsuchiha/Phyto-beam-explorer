import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((item) => {
    const path = join(dir, item.name);
    return item.isDirectory() ? files(path) : [path];
  });
}
const version = (path) =>
  createHash("sha256")
    .update(readFileSync(join(root, path)))
    .digest("hex")
    .slice(0, 12);
const imports = Object.fromEntries(
  files(join(root, "src"))
    .filter((p) => p.endsWith(".js"))
    .sort()
    .map((p) => {
      const name = "./" + relative(root, p).split("\\").join("/");
      return [name, `${name}?v=${version(name)}`];
    }),
);
const block = `<script type="importmap" id="pbe-importmap">\n${JSON.stringify(
  { imports },
  null,
  2,
)
  .split("\n")
  .map((line) => "      " + line)
  .join("\n")}\n    </script>`;
const htmlPath = join(root, "index.html");
let html = readFileSync(htmlPath, "utf8");
if (html.includes('id="pbe-importmap"'))
  html = html.replace(
    /<script type="importmap" id="pbe-importmap">[\s\S]*?<\/script>/,
    block,
  );
else
  html = html.replace(
    '<script type="module"',
    `${block}\n    <script type="module"`,
  );
html = html.replace(
  /(src|href)="(\.\/(?:src\/app\.js|styles\/[^"?]+\.css))(?:\?v=[a-f0-9]+)?"/g,
  (_, attr, path) => `${attr}="${path}?v=${version(path)}"`,
);
writeFileSync(htmlPath, html);
console.log(
  `Versioned ${Object.keys(imports).length} modules and styles in index.html`,
);
