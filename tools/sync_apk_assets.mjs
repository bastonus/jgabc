import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const wwwDir = path.join(rootDir, 'www');
const androidAssetsDir = path.join(rootDir, 'android', 'app', 'src', 'main', 'assets', 'public');

console.log('=== 🔄 Synchronizing Wanted Assets to www/ and APK Bundle ===');

if (!fs.existsSync(wwwDir)) {
  fs.mkdirSync(wwwDir, { recursive: true });
}

// 1. Single Root Files
const rootFiles = [
  'divinum-officium.html',
  'index.html',
  'sw.js',
  'util.js',
  'psalmtone.js',
  'verseRef.js',
  'exsurge.min.js',
  'jquery.min.js',
  'moment.min.js',
  'moment.easter.js',
  'propersdata.js',
  'ordinarydata.js',
  'miscChants.js',
  'incipits.js',
  'jquery.hypher.js',
  'do_manifest.js',
  'canticumMap.json',
  'psalmMap.json',
  'version.json',
  'notifications.json',
  'manifest.json',
  'manifest.webmanifest',
  'favicon.ico',
  'Caeciliae-Staffless.ttf',
  'Caeciliae-Staffless-print.ttf'
];

let copiedFilesCount = 0;

for (const file of rootFiles) {
  const src = path.join(rootDir, file);
  const dest = path.join(wwwDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    copiedFilesCount++;
  } else {
    console.warn(`[WARN] Root file not found: ${file}`);
  }
}
console.log(`[SYNC] Copied ${copiedFilesCount} root files to www/`);

// Helper for recursive copy with exclusions
function copyDirectorySync(srcDir, destDir, options = {}) {
  const { excludeExt = [], excludeDirs = [], excludeFiles = [], includeOnlyExt = null } = options;
  if (!fs.existsSync(srcDir)) return 0;
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

  let count = 0;
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      if (excludeDirs.includes(entry.name)) continue;
      count += copyDirectorySync(srcPath, destPath, options);
    } else if (entry.isFile()) {
      if (excludeFiles.includes(entry.name)) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (excludeExt.includes(ext)) continue;
      if (includeOnlyExt && !includeOnlyExt.includes(ext)) continue;
      fs.copyFileSync(srcPath, destPath);
      count++;
    }
  }
  return count;
}

// 2. Mirror Full Directories
const fullDirs = ['css', 'js', 'data', 'patterns', 'icon', 'fonts', 'crampon', 'douay-rheims', 'vulgate', 'matos-soares', 'psalms'];
for (const dir of fullDirs) {
  const src = path.join(rootDir, dir);
  const dest = path.join(wwwDir, dir);
  const opts = { excludeDirs: ['vendor'] };
  if (dir === 'data') {
    // Les paquets volumineux GABC sont téléchargeables à la demande via GitHub Raw pour ne pas alourdir l'APK
    opts.excludeFiles = ['gregorian_all.json', 'gregorian_liturgy.json', 'gregorian_chants.json'];
  }
  const count = copyDirectorySync(src, dest, opts);
  console.log(`[SYNC] Copied ${count} files for ${dir}/`);
}

// 3. Pipeline Assets (Alignment Lab)
const pipelineSrc = path.join(rootDir, 'pipeline');
const pipelineDest = path.join(wwwDir, 'pipeline');
if (fs.existsSync(pipelineSrc)) {
  if (!fs.existsSync(pipelineDest)) fs.mkdirSync(pipelineDest, { recursive: true });
  const labFiles = ['alignment-lab.html', 'lab_data.js', 'lab_reviews.json'];
  for (const f of labFiles) {
    const s = path.join(pipelineSrc, f);
    if (fs.existsSync(s)) {
      fs.copyFileSync(s, path.join(pipelineDest, f));
      console.log(`[SYNC] Copied pipeline/${f}`);
    }
  }
  // Also sync pipeline/align if present
  const alignSrc = path.join(pipelineSrc, 'align');
  const alignDest = path.join(pipelineDest, 'align');
  if (fs.existsSync(alignSrc)) {
    if (!fs.existsSync(alignDest)) fs.mkdirSync(alignDest, { recursive: true });
    for (const f of ['alignment-lab.html', 'lab_data.js']) {
      const s = path.join(alignSrc, f);
      if (fs.existsSync(s)) fs.copyFileSync(s, path.join(alignDest, f));
    }
    console.log(`[SYNC] Copied pipeline/align files`);
  }
}

// 4. Image Assets (Temporale sacred art + SVG, EXCLUDING heavy img/saints)
const imgDest = path.join(wwwDir, 'img');
if (!fs.existsSync(imgDest)) fs.mkdirSync(imgDest, { recursive: true });

const gabcSvg = path.join(rootDir, 'img', 'gabc.svg');
if (fs.existsSync(gabcSvg)) {
  fs.copyFileSync(gabcSvg, path.join(imgDest, 'gabc.svg'));
}

const temporaSrc = path.join(rootDir, 'img', 'tempora');
const temporaDest = path.join(imgDest, 'tempora');
if (fs.existsSync(temporaSrc)) {
  const count = copyDirectorySync(temporaSrc, temporaDest);
  console.log(`[SYNC] Copied ${count} files for img/tempora/ (Sacred Art)`);
}

// 5. do_data (Breviary & Missal texts, EXCLUDING .gabc files)
const doDataSrc = path.join(rootDir, 'do_data');
const doDataDest = path.join(wwwDir, 'do_data');
if (fs.existsSync(doDataSrc)) {
  console.log('[SYNC] Copying do_data/ (excluding .gabc files)...');
  const count = copyDirectorySync(doDataSrc, doDataDest, { excludeExt: ['.gabc'] });
  console.log(`[SYNC] Copied ${count} liturgical texts for do_data/`);
}

// 6. Direct sync to android/app/src/main/assets/public/ if android directory exists
if (fs.existsSync(path.join(rootDir, 'android'))) {
  console.log('[SYNC] Updating Android assets directory directly...');
  if (!fs.existsSync(androidAssetsDir)) {
    fs.mkdirSync(androidAssetsDir, { recursive: true });
  }
  const apkCount = copyDirectorySync(wwwDir, androidAssetsDir, {
    excludeExt: ['.gabc'],
    excludeDirs: ['saints']
  });
  console.log(`[SYNC] Synchronized ${apkCount} files directly to ${androidAssetsDir}`);
}

console.log('=== ✅ Wanted assets successfully synchronized to www/ and APK bundle! ===');
