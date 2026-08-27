// Bundles the game into one self-contained dist/index.html -- no imports, no
// server, no dependencies. Open the file and it plays.
//
// The whole build is a topological sort plus string concatenation, which is all
// this project needs: every module is a plain ES module with single-line
// imports and no default exports.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IMPORT_LINE = /^\s*import\s+\{[^}]*\}\s+from\s+['"](.+?)['"];?\s*$/gm;

const modules = new Map();   // absolute path -> { source, deps }

function load(path) {
  if (modules.has(path)) return;
  const source = readFileSync(path, 'utf8');
  const deps = [...source.matchAll(IMPORT_LINE)].map((m) => resolve(dirname(path), m[1]));
  modules.set(path, { source, deps });
  for (const dep of deps) load(dep);
}

/** Depth-first post-order: a module is emitted only after everything it needs. */
function order(path, seen = new Set(), out = []) {
  if (seen.has(path)) return out;
  seen.add(path);
  for (const dep of modules.get(path).deps) order(dep, seen, out);
  out.push(path);
  return out;
}

const entry = resolve(root, 'src/main.js');
load(entry);

const bundle = order(entry)
  .map((path) => {
    const body = modules.get(path).source
      .replace(IMPORT_LINE, '')
      .replace(/^export\s+(?=(const|let|function|class)\b)/gm, '')
      .trim();
    return '// ==== ' + relative(root, path) + ' ' + '='.repeat(Math.max(0, 60 - path.length)) + '\n' + body;
  })
  .join('\n\n');

const source = readFileSync(resolve(root, 'index.html'), 'utf8');

// Strip the file:// guard. It exists to redirect people from the module-loading
// page to this one; leaving it in would make this file redirect to itself.
const guarded = source.replace(/<script id="file-guard">[\s\S]*?<\/script>\s*/, '');
if (guarded === source) {
  console.error('build: file-guard script not found -- did index.html change?');
  process.exit(1);
}

const html = guarded.replace(
  /<script type="module" src="\.\/src\/main\.js"><\/script>/,
  '<script type="module">\n' + bundle + '\n</script>',
);

if (html.includes('src="./src/main.js"')) {
  console.error('build: failed to replace the module script tag');
  process.exit(1);
}

mkdirSync(resolve(root, 'dist'), { recursive: true });
writeFileSync(resolve(root, 'dist/index.html'), html);
console.log('dist/index.html  ' + (html.length / 1024).toFixed(1) + ' kB, ' + modules.size + ' modules inlined');

// Body-only variant, for hosts that supply their own document skeleton.
// Keeps the font <link> (valid in body) and drops the wrapper tags.
const pick = (re, label) => {
  const m = html.match(re);
  if (!m) { console.error('build: could not find ' + label); process.exit(1); }
  return m[1];
};
const fragment = [
  '<title>' + pick(/<title>([\s\S]*?)<\/title>/, 'title') + '</title>',
  html.match(/<link rel="stylesheet" href="https:\/\/fonts[^>]*>/)?.[0] ?? '',
  '<style>' + pick(/<style>([\s\S]*?)<\/style>/, 'styles') + '</style>',
  pick(/<body>([\s\S]*?)<\/body>/, 'body').trim(),
].filter(Boolean).join('\n');

writeFileSync(resolve(root, 'dist/embed.html'), fragment);
console.log('dist/embed.html  ' + (fragment.length / 1024).toFixed(1) + ' kB, body-only variant');
