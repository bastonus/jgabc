import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist_modules');

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

function runPowerShellZip(items, packPath) {
  const tempZip = packPath.replace(/\.pack$/, '.zip');
  console.log(`[PACK] Creating ${path.basename(packPath)} (${items.length} items)...`);
  if (fs.existsSync(tempZip)) fs.unlinkSync(tempZip);
  if (fs.existsSync(packPath)) fs.unlinkSync(packPath);

  // Write file list to temp file for PowerShell
  const listFile = path.join(distDir, 'filelist.tmp');
  fs.writeFileSync(listFile, items.join('\r\n'), 'utf8');

  const psCmd = `powershell -Command "$files = Get-Content '${listFile}'; Compress-Archive -Path $files -DestinationPath '${tempZip}' -Force"`;
  execSync(psCmd, { stdio: 'inherit' });

  if (fs.existsSync(listFile)) fs.unlinkSync(listFile);
  fs.renameSync(tempZip, packPath);

  const sizeMb = (fs.statSync(packPath).size / (1024 * 1024)).toFixed(2);
  console.log(`[PACK] Created ${path.basename(packPath)}: ${sizeMb} MB`);
}

function findFilesRecursive(dir, extension, fileList = []) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    const filePath = path.join(dir, file.name);
    if (file.isDirectory()) {
      if (!['node_modules', '.git', 'android', 'dist_modules'].includes(file.name)) {
        findFilesRecursive(filePath, extension, fileList);
      }
    } else if (file.isFile() && file.name.endsWith(extension)) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

async function buildPacks() {
  console.log('=== 📦 Building External Asset Modules (.pack) ===');

  // 1. Pack Saints Images (img/saints)
  const saintsDir = path.join(rootDir, 'img', 'saints');
  const saintsPackPath = path.join(distDir, 'saints.pack');
  if (fs.existsSync(saintsDir)) {
    const saintImages = findFilesRecursive(saintsDir, '.webp');
    runPowerShellZip(saintImages, saintsPackPath);
  } else {
    console.warn('[PACK] Warning: img/saints directory not found!');
  }

  // 2. Pack GABC score files recursively (*.gabc)
  const gabcPackPath = path.join(distDir, 'gabc.pack');
  const allGabcFiles = findFilesRecursive(rootDir, '.gabc');
  console.log(`[PACK] Found ${allGabcFiles.length} .gabc files across repository.`);
  runPowerShellZip(allGabcFiles, gabcPackPath);

  console.log('=== ✅ Modules built successfully in dist_modules/ ===');
}

buildPacks().catch((err) => {
  console.error('[PACK] Error building modules:', err);
  process.exit(1);
});
