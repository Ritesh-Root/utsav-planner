// Writes brotli (quality 11) and gzip (level 9) copies of the built scripts and
// styles, so the server can send them without compressing on every request.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

const dir = 'dist/client/assets';
let saved = 0;
for (const name of readdirSync(dir).filter((f) => /\.(?:js|css)$/.test(f))) {
  const source = readFileSync(join(dir, name));
  const br = brotliCompressSync(source, {
    params: {
      [constants.BROTLI_PARAM_QUALITY]: 11,
      [constants.BROTLI_PARAM_SIZE_HINT]: source.length,
    },
  });
  writeFileSync(join(dir, `${name}.br`), br);
  writeFileSync(join(dir, `${name}.gz`), gzipSync(source, { level: 9 }));
  saved += source.length - br.length;
}
console.log(
  `precompressed scripts and styles (${(saved / 1024).toFixed(0)} KB smaller with brotli)`,
);
