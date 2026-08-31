import os
import sys
import zipfile
import json
import time
import shutil

def build_ota():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    dist_dir = os.path.join(base_dir, 'dist')
    public_dir = os.path.join(base_dir, 'public')

    if not os.path.exists(dist_dir):
        print("dist directory does not exist! Run vite build first.")
        sys.exit(1)

    live_updates_dist = os.path.join(dist_dir, 'live-updates')
    live_updates_public = os.path.join(public_dir, 'live-updates')
    os.makedirs(live_updates_dist, exist_ok=True)
    os.makedirs(live_updates_public, exist_ok=True)

    timestamp = int(time.time() * 1000)
    bundle_id = f"bundle-{timestamp}"
    zip_dist_path = os.path.join(live_updates_dist, 'bundle.zip')

    print(f"Packaging OTA bundle from: {dist_dir}")
    with zipfile.ZipFile(zip_dist_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(dist_dir):
            rel_root = os.path.relpath(root, dist_dir)
            if 'downloads' in rel_root or 'live-updates' in rel_root:
                continue
            for file in files:
                full_path = os.path.join(root, file)
                arcname = os.path.relpath(full_path, dist_dir)
                zipf.write(full_path, arcname)

    zip_size = os.path.getsize(zip_dist_path)
    print(f"OTA bundle.zip created ({zip_size} bytes)")

    # Copy to public for static serving
    shutil.copyfile(zip_dist_path, os.path.join(live_updates_public, 'bundle.zip'))

    manifest = {
        "version": "1.0.0",
        "buildTimestamp": timestamp,
        "bundleId": bundle_id,
        "url": "https://family.rfqcollector.com/live-updates/bundle.zip"
    }

    manifest_json = json.dumps(manifest, indent=2)
    with open(os.path.join(live_updates_dist, 'version.json'), 'w', encoding='utf-8') as f:
        f.write(manifest_json)
    with open(os.path.join(live_updates_public, 'version.json'), 'w', encoding='utf-8') as f:
        f.write(manifest_json)

    print(f"OTA Manifest created for {bundle_id}!")

if __name__ == '__main__':
    build_ota()
