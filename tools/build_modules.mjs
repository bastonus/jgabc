import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist_modules');
const dataDir = path.join(rootDir, 'data');

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

function runFastZip(items, packPath) {
  console.log(`[PACK] Creating ${path.basename(packPath)} (${items.length} items)...`);
  const listFile = path.join(distDir, 'filelist.tmp');
  fs.writeFileSync(listFile, items.join('\n'), 'utf8');

  try {
    const packPy = path.join(rootDir, 'tools', 'pack_zip.py');
    execSync(`python "${packPy}" "${listFile}" "${packPath}" "${rootDir}"`, { stdio: 'inherit' });
  } catch (e) {
    console.warn('[PACK] Python zip failed, falling back to PowerShell Compress-Archive...', e.message);
    const tempZip = packPath.replace(/\.pack$/, '.zip');
    if (fs.existsSync(tempZip)) fs.unlinkSync(tempZip);
    const psCmd = `powershell -Command "$files = Get-Content '${listFile}'; Compress-Archive -Path $files -DestinationPath '${tempZip}' -Force"`;
    execSync(psCmd, { stdio: 'inherit' });
    if (fs.existsSync(packPath)) fs.unlinkSync(packPath);
    fs.renameSync(tempZip, packPath);
  }

  if (fs.existsSync(listFile)) fs.unlinkSync(listFile);

  const sizeMb = (fs.statSync(packPath).size / (1024 * 1024)).toFixed(2);
  console.log(`[PACK] Created ${path.basename(packPath)}: ${sizeMb} MB`);
}

function findFilesRecursive(dir, extension, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
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

function buildJsonDictionary(fileList, outputPath) {
  console.log(`[JSON] Compiling ${path.basename(outputPath)} from ${fileList.length} files...`);
  const dict = {};
  for (const file of fileList) {
    try {
      const content = fs.readFileSync(file, 'utf8').trim();
      const baseName = path.parse(file).name;
      dict[baseName] = content;

      // Also index relative path without extension if in do_data
      const rel = path.relative(rootDir, file).replace(/\\/g, '/');
      const relNoExt = rel.replace(/\.gabc$/, '');
      if (rel.startsWith('do_data/')) {
        dict[relNoExt] = content;
        // Also short path without "do_data/"
        dict[relNoExt.replace(/^do_data\//, '')] = content;
      }
    } catch (e) {}
  }

  const jsonStr = JSON.stringify(dict);
  fs.writeFileSync(outputPath, jsonStr, 'utf8');
  const sizeMb = (fs.statSync(outputPath).size / (1024 * 1024)).toFixed(2);
  console.log(`[JSON] Created ${path.basename(outputPath)}: ${sizeMb} MB (${Object.keys(dict).length} index entries)`);
}

async function buildPacks() {
  console.log('=== 📦 Building External Asset Modules & Dictionaries ===');

  // 1. Pack Saints Images (img/saints)
  const saintsDir = path.join(rootDir, 'img', 'saints');
  const saintsPackPath = path.join(distDir, 'saints.pack');
  if (fs.existsSync(saintsDir)) {
    const saintImages = findFilesRecursive(saintsDir, '.webp');
    runFastZip(saintImages, saintsPackPath);
  } else {
    console.warn('[PACK] Warning: img/saints directory not found!');
  }

  // 2. Pack 1: Liturgy Pack (Messes & Heures - gabc/ + do_data/**/*.gabc)
  const gabcDir = path.join(rootDir, 'gabc');
  const doDataDir = path.join(rootDir, 'do_data');
  const liturgyFiles = [
    ...findFilesRecursive(gabcDir, '.gabc'),
    ...findFilesRecursive(doDataDir, '.gabc')
  ];
  console.log(`[PACK] Found ${liturgyFiles.length} liturgical files (Missa & Horas).`);
  
  const liturgyPackPath = path.join(distDir, 'liturgy.pack');
  runFastZip(liturgyFiles, liturgyPackPath);

  const liturgyJsonPath = path.join(dataDir, 'gregorian_liturgy.json');
  buildJsonDictionary(liturgyFiles, liturgyJsonPath);

  // 3. Pack 2: All GABC score files recursively (*.gabc)
  const gabcPackPath = path.join(distDir, 'gabc.pack');
  const allGabcFiles = findFilesRecursive(rootDir, '.gabc');
  console.log(`[PACK] Found ${allGabcFiles.length} .gabc files across repository.`);
  runFastZip(allGabcFiles, gabcPackPath);

  const allJsonPath = path.join(dataDir, 'gregorian_all.json');
  buildJsonDictionary(allGabcFiles, allJsonPath);

  console.log('=== ✅ Modules & Dictionaries built successfully in dist_modules/ & data/ ===');
}

buildPacks().catch((err) => {
  console.error('[PACK] Error building modules:', err);
  process.exit(1);
});
