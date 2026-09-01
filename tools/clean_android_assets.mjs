import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const androidAssetsDir = path.join(rootDir, 'android', 'app', 'src', 'main', 'assets', 'public');

function cleanAssets(dir) {
  if (!fs.existsSync(dir)) return;
  const items = fs.readdirSync(dir, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      // Remove img/saints directory from Android bundle
      if (fullPath.replace(/\\/g, '/').endsWith('img/saints')) {
        console.log(`[CLEAN-APK] Removing external asset directory from APK bundle: ${fullPath}`);
        fs.rmSync(fullPath, { recursive: true, force: true });
      } else {
        cleanAssets(fullPath);
      }
    } else if (item.isFile() && item.name.endsWith('.gabc')) {
      // Remove all .gabc files from Android bundle
      fs.unlinkSync(fullPath);
    }
  }
}

console.log('=== 🧹 Cleaning external module files (.gabc, img/saints) from Capacitor Android Assets ===');
cleanAssets(androidAssetsDir);
console.log('=== ✅ Capacitor assets cleaned. APK weight minimized! ===');
