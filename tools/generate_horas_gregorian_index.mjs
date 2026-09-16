#!/usr/bin/env node
/**
 * =============================================================================
 * Oremus - Script de Génération de l'Index Grégorien des Heures de l'Office
 * (Divinum Officium & GregoBase 18 745 GABC)
 * =============================================================================
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const gregobaseDir = path.join(rootDir, 'gregobase');
const doHoursDir = path.join(rootDir, 'do_data', 'horas', 'Latin');
const outputDir = path.join(rootDir, 'data');

console.log('=== 📖 Oremus : Générateur d\'Index Grégorien pour les Heures ===');

function normalizeLatin(str) {
    if (!str) return '';
    return String(str)
        .toLowerCase()
        .replace(/æ|ǽ/g, 'ae')
        .replace(/œ|œ́/g, 'oe')
        .replace(/v/g, 'u')
        .replace(/j/g, 'i')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[\*\+\,\.\;\:\!\?\(\)\[\]\{\}\/\\℣℟†—–\-\_]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function extractGabcLyrics(gabcText) {
    if (!gabcText) return '';
    const parts = gabcText.split(/\r?\n%%\r?\n/);
    const body = parts.length > 1 ? parts[1] : gabcText;
    return body
        .replace(/\([^)]*\)/g, '')
        .replace(/<[^>]*>/g, '')
        .replace(/\[[^\]]*\]/g, '')
        .replace(/\{[^\}]*\}/g, '')
        .replace(/[0-9]/g, '')
        .replace(/[\*\+\,\.\;\:\!\?\℣℟†—–\-\_]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function parseGabcHeader(gabcText) {
    const header = {};
    const parts = gabcText.split(/\r?\n%%\r?\n/);
    const headerPart = parts[0] || '';
    const lines = headerPart.split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('%')) continue;
        const m = trimmed.match(/^([\w\-]+)\s*:\s*([^;]+);?/);
        if (m) {
            header[m[1].toLowerCase()] = m[2].trim();
        }
    }
    return header;
}

function getBookScore(bookStr) {
    if (!bookStr) return 50;
    const b = bookStr.toLowerCase();
    if (b.includes('liber antiphonarius') || b.includes('antiphonale romanum')) return 100;
    if (b.includes('liber usualis')) return 95;
    if (b.includes('antiphonale monasticum')) return 85;
    if (b.includes('nocturnale romanum')) return 80;
    if (b.includes('graduale romanum')) return 75;
    if (b.includes('processionale')) return 70;
    return 60;
}

function makeIncipitKey(normStr) {
    if (!normStr) return '';
    let s = normStr.replace(/^(ant|ps|v|r)\s+/, '').trim();
    const words = s.split(' ').filter(w => w.length > 1);
    const key = words.slice(0, 6).join(' ');
    return key.slice(0, 42).trim();
}

async function run() {
    console.log(`[1/4] 📂 Scan des fichiers GregoBase dans ${gregobaseDir}...`);
    const allFiles = fs.readdirSync(gregobaseDir).filter(f => f.endsWith('.gabc'));
    console.log(`      Trouvé ${allFiles.length} fichiers GABC.`);

    const incipitIndex = new Map();
    const chantMetaMap = new Map();
    let officeCount = 0;

    const officePartsWhiteList = new Set([
        'antiphona', 'hymnus', 'responsorium', 'responsorium breve',
        'invitatorium', 'canticum', 'tonus', 'toni communes', 'oratio', 'varia',
        'psalmus', 'sequentia'
    ]);

    for (const file of allFiles) {
        const chantId = file.replace('.gabc', '');
        const fullPath = path.join(gregobaseDir, file);
        let content = '';
        try {
            content = fs.readFileSync(fullPath, 'utf8');
        } catch (e) {
            continue;
        }

        const header = parseGabcHeader(content);
        const rawPart = (header['office-part'] || '').trim();
        const normPart = rawPart.toLowerCase();

        const isOfficePart = officePartsWhiteList.has(normPart) ||
            normPart.includes('antiphon') ||
            normPart.includes('hymn') ||
            normPart.includes('respons') ||
            normPart.includes('invitat') ||
            normPart.includes('cantic') ||
            normPart.includes('tonus');

        const lyrics = extractGabcLyrics(content);
        const rawName = header.name || '';
        const normLyrics = normalizeLatin(lyrics);
        const normName = normalizeLatin(rawName);

        const score = getBookScore(header.book);
        const item = {
            id: chantId,
            name: rawName,
            part: rawPart || 'Antiphona',
            mode: header.mode || '',
            book: header.book || '',
            score: score
        };

        chantMetaMap.set(chantId, item);

        if (isOfficePart || lyrics.length > 5) {
            officeCount++;

            const keyLyrics = makeIncipitKey(normLyrics);
            if (keyLyrics && keyLyrics.length >= 6) {
                if (!incipitIndex.has(keyLyrics)) incipitIndex.set(keyLyrics, []);
                incipitIndex.get(keyLyrics).push(item);
            }

            const keyName = makeIncipitKey(normName);
            if (keyName && keyName.length >= 6 && keyName !== keyLyrics) {
                if (!incipitIndex.has(keyName)) incipitIndex.set(keyName, []);
                incipitIndex.get(keyName).push(item);
            }
        }
    }

    console.log(`[1/4] ✅ ${officeCount} pièces de l'Office cataloguées avec ${incipitIndex.size} clés d'incipit distinctes.`);

    for (const [k, list] of incipitIndex.entries()) {
        list.sort((a, b) => b.score - a.score);
    }

    console.log(`[2/4] 📖 Scan et appariement avec les textes de Divinum Officium (do_data/horas/Latin)...`);

    function findBestChantForLine(lineText) {
        if (!lineText) return null;
        const norm = normalizeLatin(lineText);
        if (norm.length < 5) return null;

        const key = makeIncipitKey(norm);
        if (incipitIndex.has(key)) {
            return incipitIndex.get(key)[0];
        }

        const words = key.split(' ');
        for (let w = Math.min(words.length - 1, 4); w >= 3; w--) {
            const subKey = words.slice(0, w).join(' ');
            if (incipitIndex.has(subKey)) {
                return incipitIndex.get(subKey)[0];
            }
        }

        for (const [k, list] of incipitIndex.entries()) {
            if (k.startsWith(key) || key.startsWith(k)) {
                return list[0];
            }
        }

        return null;
    }

    const doSubDirs = ['Tempora', 'Sancti', 'Commune'];
    const doOfficeMap = {};
    let matchedSectionsCount = 0;
    let totalSectionsCount = 0;

    for (const sub of doSubDirs) {
        const subPath = path.join(doHoursDir, sub);
        if (!fs.existsSync(subPath)) continue;
        const files = fs.readdirSync(subPath).filter(f => f.endsWith('.txt'));

        for (const f of files) {
            const fileKey = `${sub}/${f.replace('.txt', '')}`;
            const fullPath = path.join(subPath, f);
            const content = fs.readFileSync(fullPath, 'utf8');

            const sections = {};
            let curTag = null;
            let curLines = [];

            for (const line of content.split(/\r?\n/)) {
                const trimmed = line.trim();
                const mTag = trimmed.match(/^\[([^\]]+)\]/);
                if (mTag) {
                    if (curTag) sections[curTag] = curLines;
                    curTag = mTag[1].trim();
                    curLines = [];
                } else if (curTag) {
                    if (trimmed) curLines.push(trimmed);
                }
            }
            if (curTag) sections[curTag] = curLines;

            const fileMatches = {};

            for (const [secTag, lines] of Object.entries(sections)) {
                if (!/^(Ant|Hymnus|Respons|Invit|Versum)/i.test(secTag)) continue;
                if (!lines.length || lines[0].startsWith('@')) continue;

                totalSectionsCount++;
                const firstLine = lines[0].replace(/^[0-9\.\s]+/, '').replace(/^R\.\s*/, '').replace(/^V\.\s*/, '');
                const match = findBestChantForLine(firstLine);
                if (match) {
                    fileMatches[secTag] = {
                        id: match.id,
                        name: match.name,
                        part: match.part,
                        mode: match.mode,
                        book: match.book
                    };
                    matchedSectionsCount++;
                }
            }

            if (Object.keys(fileMatches).length > 0) {
                doOfficeMap[fileKey] = fileMatches;
            }
        }
    }

    console.log(`[2/4] ✅ Appariement réussi pour ${matchedSectionsCount} sections liturgiques sur ${totalSectionsCount} analysées (${Math.round((matchedSectionsCount/totalSectionsCount)*100)} % de couverture initiale).`);

    console.log(`[3/4] 📦 Construction des gabarits GABC des dialogues et versets communs...`);
    const commonChants = {
        "deus_in_adjutorium_festal": {
            name: "Deus in adjutorium (Tonus festivus)",
            part: "Incipit",
            gabc: "(c3) DE(h)us(h'_) (,) in(h) ad(h)ju(h)tó(i)ri(h)um(h) me(h)um(h'_) in(h)tén(g)de.(h.) (::) <sp>R/</sp>. Dó(h)mi(h)ne(h'_) (,) ad(h) ad(h)ju(h)ván(h)dum(h) me(h'_) fe(h)stí(g)na.(h.) (:) Gló(h)ri(h)a(h) Pa(h)tri,(h) et(h) Fí(h)li(h)o,(h'_) (,) et(h) Spi(h)rí(h)tu(h)i(h) San(g)cto.(h.) (:) Sic(h)ut(h) e(h)rat(h) in(h) prin(h)cí(h)pi(h)o,(h) et(h) nunc,(h) et(h) sem(h)per,(h.) (,) et(h) in(h) sǽ(h)cu(h)la(h) sæ(h)cu(h)ló(h)rum.(h) A(g)men.(h.) (;) Al(h)le(i)lú(hg~)ia.(g.) (::)"
        },
        "deus_in_adjutorium_ferial": {
            name: "Deus in adjutorium (Tonus ferialis)",
            part: "Incipit",
            gabc: "(c3) DE(h)us(h) (,) in(h) ad(h)ju(h)tó(h)ri(h)um(h) me(h)um(h) in(h)tén(h)de.(h.) (::) <sp>R/</sp>. Dó(h)mi(h)ne(h) (,) ad(h) ad(h)ju(h)ván(h)dum(h) me(h) fe(h)stí(h)na.(h.) (:) Gló(h)ri(h)a(h) Pa(h)tri,(h) et(h) Fí(h)li(h)o,(h) (,) et(h) Spi(h)rí(h)tu(h)i(h) San(h)cto.(h.) (:) Sic(h)ut(h) e(h)rat(h) in(h) prin(h)cí(h)pi(h)o,(h) et(h) nunc,(h) et(h) sem(h)per,(h) (,) et(h) in(h) sǽ(h)cu(h)la(h) sæ(h)cu(h)ló(h)rum.(h) A(h)men.(h.) (;) Al(h)le(h)lú(h)ia.(h.) (::)"
        },
        "domine_labia_mea": {
            name: "Domine labia mea aperies",
            part: "Incipit",
            gabc: "(c3) Dó(h)mi(h)ne,(h'_) (,) lá(h)bi(h)a(h) me(h)a(h) a(h)pé(g)ri(h)es.(h.) (::) <sp>R/</sp>. Et(h) os(h) me(h)um(h'_) (,) an(h)nun(h)ti(h)á(h)bit(h) lau(h)dem(h) tu(g)am.(h.) (::)"
        },
        "jube_domne": {
            name: "Jube domne benedicere",
            part: "Versiculus",
            gabc: "(c3) <sp>V/</sp>. Ju(h)be(h) dom(h)ne(g) be(h)ne(h)dí(h)ce(d)re.(d.) (::) <sp>R/</sp>. Noc(h)tem(h) qui(h)é(h)tam(h) et(h) fi(h)nem(g) per(f)féc(h)tum(h.) (,) con(h)cé(h)dat(h) no(h)bis(h) Dó(h)mi(h)nus(h) om(h)ní(h)po(d)tens.(d.) (::) <sp>R/</sp>. A(g.)men.(h.) (::)"
        },
        "converte_nos": {
            name: "Converte nos Deus salutaris noster",
            part: "Versiculus",
            gabc: "(c3) <sp>V/</sp>. Con(h)vér(h)te(h) nos(h) ✠(,) De(h)us(h) sa(h)lu(h)tá(g)ris(f) no(h)ster.(h.) (::) <sp>R/</sp>. Et(h) a(h)vér(h)te(h) i(h)ram(h) tu(h)am(g) a(f) no(h)bis.(h.) (::)"
        },
        "adjutorium_nostrum": {
            name: "Adjutorium nostrum in nomine Domini",
            part: "Versiculus",
            gabc: "(c3) <sp>V/</sp>. Ad(h)ju(h)tó(h)ri(h)um(h) nos(h)trum(h) ✠(,) in(h) nó(h)mi(h)ne(h) Dó(h)mi(f)ni.(f.) (::) <sp>R/</sp>. Qui(h) fe(h)cit(h) cæ(h)lum(h) et(h) ter(h)ram.(f.) (::)"
        },
        "custodi_nos": {
            name: "Custodi nos Domine",
            part: "Versiculus",
            gabc: "(c3) <sp>V/</sp>. Cus(h)tó(h)di(h) nos(h) Dó(h)mi(h)ne(h) ut(h) pu(h)píl(h)lam(h) ó(h)cu(h)li.(g'_[oh:h]//hGF'Efgf.) (::) <sp>R/</sp>. Sub(h) um(h)bra(h) a(h)lá(h)rum(h) tu(h)á(h)rum(h) pró(h)te(h)ge(h) nos.(g'_[oh:h]//hGF'Efgf.) (::)"
        },
        "tu_autem_domine": {
            name: "Tu autem Domine miserere nobis",
            part: "Versiculus",
            gabc: "(c3) <sp>V/</sp>. Tu(h) au(g)tem(f) Dó(h)mi(h)ne(h.) (,) mi(h)se(h)ré(h)re(h) no(h.)bis.(d.) (::) <sp>R/</sp>. De(h)o(h) grá(h)ti(d)as.(d.) (::)"
        },
        "benedicamus_domino_festal": {
            name: "Benedicamus Domino (In Festis)",
            part: "Conclusio",
            gabc: "(c3) <sp>V/</sp>. Be(h)ne(h)di(h)cá(hi)mus(i) Dó(i)mi(i)no.(iHG.) (::) <sp>R/</sp>. De(i)o(i) grá(i)ti(i)as.(iHG.) (::)"
        },
        "benedicamus_domino_ferial": {
            name: "Benedicamus Domino (Ferialis)",
            part: "Conclusio",
            gabc: "(c3) <sp>V/</sp>. Be(h)ne(h)di(h)cá(h)mus(h) Dó(f)mi(e)no.(ef..) (::) <sp>R/</sp>. De(h)o(h) grá(f)ti(e)as.(ef..) (::)"
        }
    };

    const incipitExport = {};
    for (const [k, list] of incipitIndex.entries()) {
        incipitExport[k] = list.slice(0, 3).map(x => ({
            id: x.id,
            name: x.name,
            part: x.part,
            mode: x.mode,
            book: x.book
        }));
    }

    console.log(`[4/4] 💾 Sauvegarde des fichiers dans ${outputDir}...`);
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // 1. Map des offices DO direct (compact, rapide)
    const officeMapPath = path.join(outputDir, 'horas_office_map.json');
    fs.writeFileSync(officeMapPath, JSON.stringify(doOfficeMap), 'utf8');

    // 2. Chants communs invariables
    const commonOutputPath = path.join(outputDir, 'horas_common_chants.json');
    fs.writeFileSync(commonOutputPath, JSON.stringify(commonChants, null, 2), 'utf8');

    // 3. Dictionnaire universel des incipits (minifié)
    const incipitMapPath = path.join(outputDir, 'horas_incipits_map.json');
    fs.writeFileSync(incipitMapPath, JSON.stringify(incipitExport), 'utf8');

    // 4. Version combinée pour rétrocompatibilité
    const mapOutputPath = path.join(outputDir, 'horas_gregorian_map.json');
    fs.writeFileSync(mapOutputPath, JSON.stringify({
        generatedAt: new Date().toISOString(),
        sections: doOfficeMap,
        incipits: incipitExport
    }), 'utf8');

    console.log(`[SUCCÈS] 🎉 Fichiers générés :`);
    console.log(`         - ${officeMapPath} (${Math.round(fs.statSync(officeMapPath).size / 1024)} Ko)`);
    console.log(`         - ${commonOutputPath} (${Math.round(fs.statSync(commonOutputPath).size / 1024)} Ko)`);
    console.log(`         - ${incipitMapPath} (${Math.round(fs.statSync(incipitMapPath).size / 1024)} Ko)`);
}

run().catch(err => {
    console.error('[!] Erreur critique :', err);
    process.exit(1);
});
