import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const AdmZip = require('adm-zip');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const frontendDir = path.resolve(__dirname, '..');
const distDir = path.join(frontendDir, 'dist');
const liveUpdatesDist = path.join(distDir, 'live-updates');
const liveUpdatesPublic = path.join(frontendDir, 'public', 'live-updates');

function buildOta() {
  console.log('🚀 Generating Live Update (OTA) bundle with pure Node.js (adm-zip)...');

  if (!fs.existsSync(distDir)) {
    console.error('❌ dist/ directory does not exist! Run vite build first.');
    process.exit(1);
  }

  fs.mkdirSync(liveUpdatesDist, { recursive: true });
  fs.mkdirSync(liveUpdatesPublic, { recursive: true });

  const timestamp = Date.now();
  const bundleId = `bundle-${timestamp}`;
  const zipPathInDist = path.join(liveUpdatesDist, 'bundle.zip');
  const zipPathInPublic = path.join(liveUpdatesPublic, 'bundle.zip');

  const zip = new AdmZip();

  // Recursively add all dist files except downloads and live-updates
  function addFiles(currentDir, zipSubDir = '') {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'downloads' || entry.name === 'live-updates') {
        continue;
      }
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        addFiles(fullPath, zipSubDir ? `${zipSubDir}/${entry.name}` : entry.name);
      } else if (entry.isFile()) {
        const fileContent = fs.readFileSync(fullPath);
        zip.addFile(zipSubDir ? `${zipSubDir}/${entry.name}` : entry.name, fileContent);
      }
    }
  }

  addFiles(distDir);
  zip.writeZip(zipPathInDist);
  zip.writeZip(zipPathInPublic);

  const manifest = {
    version: '1.0.0',
    buildTimestamp: timestamp,
    bundleId: bundleId,
    url: 'https://family.rfqcollector.com/live-updates/bundle.zip',
  };

  const manifestJson = JSON.stringify(manifest, null, 2);
  fs.writeFileSync(path.join(liveUpdatesDist, 'version.json'), manifestJson, 'utf-8');
  fs.writeFileSync(path.join(liveUpdatesPublic, 'version.json'), manifestJson, 'utf-8');

  console.log(`✅ Live Update Manifest created for: ${bundleId}`);
  console.log(`📦 OTA Bundle size: ${fs.statSync(zipPathInDist).size} bytes`);
}

try {
  buildOta();
} catch (err) {
  console.error('Failed to build OTA bundle:', err);
  process.exit(1);
}
