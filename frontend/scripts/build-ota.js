import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const frontendDir = path.resolve(__dirname, '..');
const distDir = path.join(frontendDir, 'dist');
const liveUpdatesDir = path.join(distDir, 'live-updates');

async function buildOta() {
  console.log('🚀 Generating Live Update (OTA) bundle...');

  if (!fs.existsSync(distDir)) {
    console.error('❌ dist/ directory does not exist! Run `npm run build` first.');
    process.exit(1);
  }

  // Create live-updates directory in dist and public
  fs.mkdirSync(liveUpdatesDir, { recursive: true });
  const publicLiveUpdatesDir = path.join(frontendDir, 'public', 'live-updates');
  fs.mkdirSync(publicLiveUpdatesDir, { recursive: true });

  const timestamp = Date.now();
  const bundleId = `bundle-${timestamp}`;
  const zipPathInDist = path.join(liveUpdatesDir, 'bundle.zip');
  const zipPathInPublic = path.join(publicLiveUpdatesDir, 'bundle.zip');

  // Create zip using python zipfile module (cross-platform)
  const pythonScript = `
import zipfile, os

dist_dir = r"${distDir}"
zip_path = r"${zipPathInDist}"

with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
    for root, dirs, files in os.walk(dist_dir):
        # Exclude downloads and live-updates folder from inside the zip
        if 'downloads' in root or 'live-updates' in root:
            continue
        for file in files:
            file_path = os.path.join(root, file)
            arcname = os.path.relpath(file_path, dist_dir)
            zipf.write(file_path, arcname)

print(f"Created bundle.zip size: {os.path.getsize(zip_path)} bytes")
`;

  execSync(`python -c "${pythonScript.replace(/\n/g, ' ')}"`, { stdio: 'inherit' });

  // Copy to public as well so it's committed / preserved
  fs.copyFileSync(zipPathInDist, zipPathInPublic);

  const manifest = {
    version: '1.0.0',
    buildTimestamp: timestamp,
    bundleId: bundleId,
    url: 'https://family.rfqcollector.com/live-updates/bundle.zip',
  };

  const manifestJson = JSON.stringify(manifest, null, 2);
  fs.writeFileSync(path.join(liveUpdatesDir, 'version.json'), manifestJson, 'utf-8');
  fs.writeFileSync(path.join(publicLiveUpdatesDir, 'version.json'), manifestJson, 'utf-8');

  console.log(`✅ Live Update Manifest created: ${bundleId}`);
  console.log(`📦 OTA Bundle ready at: ${zipPathInDist}`);
}

buildOta().catch((err) => {
  console.error('Failed to build OTA bundle:', err);
  process.exit(1);
});
