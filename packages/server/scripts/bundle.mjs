// One file the release ships (and the Docker image runs): dist/server.mjs. node:sqlite is built into Node 22, so nothing else is needed.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
const version = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')).version;
await build({
  entryPoints: ['src/index.ts'], outfile: 'dist/server.mjs', bundle: true, platform: 'node', format: 'esm', target: 'node22',
  define: { __APP_VERSION__: JSON.stringify(version) },
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});
console.log(`dist/server.mjs (${version})`);
