/**
 * =========================================================================
 * Oremus - build_universal_gregorian_index.mjs
 * Compilateur Universel d'Index Grégorien & Liturgique (25 000+ Pièces)
 * =========================================================================
 */

import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const gregobaseIndexPath = path.join(rootDir, 'gregobase', 'gregobase_index.json');
const currentIndexJsPath = path.join(rootDir, 'js', 'gregorian_index_data.js');
const outJsonPath = path.join(rootDir, 'data', 'gregorian_index.json');
const outJsPath = path.join(rootDir, 'js', 'gregorian_index_data.js');

const OFFICE_PARTS_MAP = {
    'in': 'Introitus', 'intr': 'Introitus', 'introitus': 'Introitus',
    'gr': 'Graduale', 'grad': 'Graduale', 'graduale': 'Graduale',
    'al': 'Alleluia', 'all': 'Alleluia', 'alleluia': 'Alleluia',
    'tr': 'Tractus', 'tract': 'Tractus', 'tractus': 'Tractus',
    'seq': 'Sequentia', 'sequentia': 'Sequentia',
    'of': 'Offertorium', 'offert': 'Offertorium', 'offertorium': 'Offertorium',
    'co': 'Communio', 'comm': 'Communio', 'communio': 'Communio',
    'an': 'Antiphona', 'ant': 'Antiphona', 'antiphona': 'Antiphona',
    're': 'Responsorium', 'resp': 'Responsorium', 'responsorium': 'Responsorium',
    'hy': 'Hymnus', 'hymn': 'Hymnus', 'hymnus': 'Hymnus',
    'ky': 'Kyrie', 'gl': 'Gloria', 'cr': 'Credo', 'sa': 'Sanctus', 'ag': 'Agnus Dei',
    'ite': 'Ite Missa Est', 'ps': 'Psalmus', 'ca': 'Canticum', 'or': 'Oratio', 'lit': 'Litaniae', 'va': 'Varia'
};

function normalizePart(raw) {
    if (!raw) return 'Chant';
    const s = String(raw).replace(/[;:,.]/g, '').trim();
    const clean = s.toLowerCase().replace(/[^a-z]/g, '');
    return OFFICE_PARTS_MAP[clean] || s || 'Chant';
}

function normalizeMode(raw) {
    if (!raw) return '';
    return String(raw).replace(/[^0-9a-zA-Z]/g, '').trim();
}

function parseGabcHeader(raw) {
    const lines = raw.split(/\r?\n/);
    const headers = {};
    for (const line of lines) {
        if (line.trim() === '%%') break;
        const colIdx = line.indexOf(':');
        if (colIdx !== -1) {
            const k = line.slice(0, colIdx).trim().toLowerCase();
            const v = line.slice(colIdx + 1).replace(/;$/, '').trim();
            headers[k] = v;
        }
    }
    return headers;
}

function scanGabcFiles(dir, onFile) {
    if (!fs.existsSync(dir)) return;
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const it of items) {
        const full = path.join(dir, it.name);
        if (it.isDirectory()) {
            scanGabcFiles(full, onFile);
        } else if (it.name.endsWith('.gabc')) {
            const rel = path.relative(rootDir, full).replace(/\\/g, '/');
            onFile(full, it.name, rel);
        }
    }
}

async function buildUniversalIndex() {
    console.log('=== 🚀 Building Universal Gregorian Index (25,000+ items) ===');

    const finalChantsMap = new Map();
    const nonChantsList = [];

    // 1. Lire l'index actuel pour préserver les Messes (566), Heures (8), Bible (73) et les textes des chants riches
    if (fs.existsSync(currentIndexJsPath)) {
        console.log('[1/4] Reading existing rich liturgical items from gregorian_index_data.js...');
        const jsCode = fs.readFileSync(currentIndexJsPath, 'utf8');
        const sandbox = { window: {} };
        vm.createContext(sandbox);
        vm.runInContext(jsCode, sandbox);
        const existingList = sandbox.window.GREGORIAN_INDEX || [];

        for (const item of existingList) {
            if (item.type !== 'chant') {
                nonChantsList.push(item);
            } else {
                // Pour les chants déjà indexés, conserver tous les champs riches (dont fullTextLa) mais retirer le code GABC brut
                const clean = { ...item };
                delete clean.gabc;
                if (clean.part) clean.part = normalizePart(clean.part);
                if (clean.mode) clean.mode = normalizeMode(clean.mode);
                finalChantsMap.set(String(item.id), clean);
            }
        }
        console.log(`      Found ${nonChantsList.length} liturgical items (Messes, Heures, Bible) and ${finalChantsMap.size} existing core chants.`);
    }

    // 2. Charger les 18 745 pièces de GregoBase
    if (fs.existsSync(gregobaseIndexPath)) {
        console.log('[2/4] Merging GregoBase dataset (18,745 pieces)...');
        const gregobase = JSON.parse(fs.readFileSync(gregobaseIndexPath, 'utf8'));
        let addedCount = 0;
        let enrichedCount = 0;

        for (const item of gregobase) {
            const id = String(item.id);
            const existing = finalChantsMap.get(id);

            const part = normalizePart(item.office_part_name || item.office_part);
            const mode = normalizeMode(item.mode);
            const incipit = item.incipit || ('Chant #' + id);

            if (existing) {
                if (!existing.book && item.book) existing.book = item.book;
                if (!existing.mode && mode) existing.mode = mode;
                if (!existing.part || existing.part === 'Chant') existing.part = part;
                if (item.has_nabc && (!existing.tags || existing.tags.indexOf('NABC') === -1)) {
                    existing.tags = (existing.tags ? existing.tags + ', ' : '') + 'NABC';
                }
                enrichedCount++;
            } else {
                const tags = [];
                if (part && part !== 'Chant') tags.push(part);
                tags.push('Grégorien');
                if (mode) tags.push('Mode ' + mode);
                if (item.has_nabc) tags.push('NABC');
                if (incipit.toLowerCase().indexOf('ad lib') !== -1) tags.push('Ad Libitum');
                if (['Kyrie', 'Gloria', 'Credo', 'Sanctus', 'Agnus Dei', 'Ite Missa Est'].indexOf(part) !== -1) tags.push('Kyriale');

                const entry = {
                    id: id,
                    type: 'chant',
                    incipit: incipit,
                    part: part,
                    tags: tags.join(', ')
                };
                if (mode) entry.mode = mode;
                if (item.book) entry.book = item.book;

                finalChantsMap.set(id, entry);
                addedCount++;
            }
        }
        console.log(`      Added ${addedCount} new chants, enriched ${enrichedCount} existing chants.`);
    }

    // 3. Scanner les répertoires GABC additionnels (do_data, gabc, GABC-video-notes-alignement)
    console.log('[3/4] Scanning additional GABC directories (do_data, gabc, alignement)...');
    const extraDirs = [
        path.join(rootDir, 'do_data'),
        path.join(rootDir, 'gabc'),
        path.join(rootDir, 'GABC-video-notes-alignement')
    ];

    let extraAddedCount = 0;

    for (const d of extraDirs) {
        scanGabcFiles(d, (fullPath, filename, relPath) => {
            const stem = path.basename(filename, '.gabc');
            const id = stem;

            if (finalChantsMap.has(id)) {
                // Si l'ID existe déjà mais n'a pas de chemin explicite vers do_data
                const existing = finalChantsMap.get(id);
                if (!existing.path && relPath.startsWith('do_data/')) {
                    existing.path = relPath;
                }
                return;
            }

            try {
                const content = fs.readFileSync(fullPath, 'utf8');
                const h = parseGabcHeader(content);
                const incipit = h.name || stem.replace(/[_-]/g, ' ');
                if (!incipit || incipit.length < 2) return;

                const part = normalizePart(h['office-part']);
                const mode = normalizeMode(h.mode);
                const tags = [];
                if (part && part !== 'Chant') tags.push(part);
                tags.push('Grégorien');
                if (mode) tags.push('Mode ' + mode);
                if (h['nabc-lines'] || /nabc-lines:\s*[1-9]/i.test(content) || /\([^)]*\|[^)]*\)/.test(content)) {
                    tags.push('NABC');
                }
                if (incipit.toLowerCase().indexOf('ad lib') !== -1) tags.push('Ad Libitum');
                if (['Kyrie', 'Gloria', 'Credo', 'Sanctus', 'Agnus Dei', 'Ite Missa Est'].indexOf(part) !== -1) tags.push('Kyriale');

                const entry = {
                    id: id,
                    type: 'chant',
                    incipit: incipit,
                    part: part,
                    tags: tags.join(', ')
                };
                if (mode) entry.mode = mode;
                if (h.book) entry.book = h.book;
                if (h.commentary) entry.ref = h.commentary;
                if (relPath) entry.path = relPath;

                finalChantsMap.set(id, entry);
                extraAddedCount++;
            } catch (e) {}
        });
    }
    console.log(`      Added ${extraAddedCount} additional chants from liturgical folders.`);

    // 4. Assembler l'Index Universel Complet
    console.log('[4/4] Assembling and formatting unified index...');
    const allChants = Array.from(finalChantsMap.values());

    // Ordre de présentation : non-chants (Offices, Messes, Bible) en tête pour la mise en avant, puis pièces grégoriennes
    const universalIndex = [
        ...nonChantsList,
        ...allChants
    ];

    console.log(`\n=== 📊 Index Statistics ===`);
    console.log(`  • Canonical Hours (Officia): ${nonChantsList.filter(x => x.type === 'officium').length}`);
    console.log(`  • Liturgical Masses (Missae): ${nonChantsList.filter(x => x.type === 'missa').length}`);
    console.log(`  • Holy Bible Books (Vulgate): ${nonChantsList.filter(x => x.type === 'bible').length}`);
    console.log(`  • Gregorian Chants (GABC):   ${allChants.length}`);
    console.log(`  -----------------------------------------`);
    console.log(`  • TOTAL UNIVERSAL ENTRIES:   ${universalIndex.length}`);

    // Écriture du JSON
    const jsonStr = JSON.stringify(universalIndex);
    fs.writeFileSync(outJsonPath, jsonStr, 'utf8');
    const jsonMb = (Buffer.byteLength(jsonStr, 'utf8') / (1024 * 1024)).toFixed(2);
    console.log(`\n  ✅ Wrote ${outJsonPath} (${jsonMb} MB)`);

    // Écriture du JS bundle pour chargement synchrone direct
    const jsStr = `(typeof window !== "undefined" ? window : self).GREGORIAN_INDEX = ${jsonStr};\n`;
    fs.writeFileSync(outJsPath, jsStr, 'utf8');
    const jsMb = (Buffer.byteLength(jsStr, 'utf8') / (1024 * 1024)).toFixed(2);
    console.log(`  ✅ Wrote ${outJsPath} (${jsMb} MB)`);

    console.log('\n=== 🎉 Universal Index Successfully Built! ===');
}

buildUniversalIndex().catch(err => {
    console.error('[!] Error building universal index:', err);
    process.exit(1);
});
