import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// Rasterize our code-native mark for email clients, which strip SVG images.
const taskRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(taskRoot, 'vendor/feed/packages/backend/package.json'));
const sharp = require('sharp');
const brandDir = path.join(taskRoot, 'vendor/feed/packages/frontend/public/brand');
for (const filename of ['mealline-mark.png', 'nourish-mark.png']) {
  // Keep the former URL working for saved appearances and older email links.
  await sharp(path.join(brandDir, 'mealline-mark.svg')).resize(128, 128).png().toFile(path.join(brandDir, filename));
}
