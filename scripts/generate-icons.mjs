import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const root = join(__dir, '..');
const svg = readFileSync(join(root, 'public/icon/icon.svg'), 'utf8');

const sizes = [16, 32, 48, 96, 128];

for (const size of sizes) {
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: size },
  });
  const png = resvg.render().asPng();
  const out = join(root, `public/icon/${size}.png`);
  writeFileSync(out, png);
  console.log(`✓ ${size}x${size} → public/icon/${size}.png`);
}
