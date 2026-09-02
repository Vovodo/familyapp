import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(frontendDir, '..');

const sourceApk = path.join(
  frontendDir,
  'android',
  'app',
  'build',
  'outputs',
  'apk',
  'debug',
  'app-debug.apk'
);

const canonicalApk = path.join(repoRoot, 'backend', 'app', 'static', 'ailem.apk');

const staleCopies = [
  canonicalApk,
  path.join(repoRoot, 'backend', 'static', 'ailem.apk'),
  path.join(repoRoot, 'ailem.apk'),
  path.join(repoRoot, 'static', 'ailem.apk'),
  path.join(frontendDir, 'public', 'downloads', 'ailem.apk'),
];

function removeIfExists(filePath) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    console.log('Eski APK silindi:', filePath);
  }
}

if (!fs.existsSync(sourceApk)) {
  console.error('Yeni derlenmiş APK bulunamadı:', sourceApk);
  console.error('Önce `npx cap sync android` ve `cd android && .\\gradlew.bat assembleDebug` çalıştır.');
  process.exit(1);
}

const sourceSize = fs.statSync(sourceApk).size;
if (sourceSize < 1_000_000) {
  console.error('Kaynak APK çok küçük, derleme başarısız görünüyor:', sourceApk, sourceSize);
  process.exit(1);
}

for (const stale of staleCopies) {
  removeIfExists(stale);
}

fs.mkdirSync(path.dirname(canonicalApk), { recursive: true });
fs.copyFileSync(sourceApk, canonicalApk);

const published = fs.statSync(canonicalApk);
console.log(
  'Yeni APK yayınlandı:',
  canonicalApk,
  `(${(published.size / (1024 * 1024)).toFixed(2)} MB)`
);
console.log('Web indirme: GET /api/v1/downloads/apk artık yalnızca bu dosyayı vermeli.');
