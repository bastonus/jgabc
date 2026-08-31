/**
 * =========================================================================
 * Oremus - gregorian_search_worker.js
 * Web Worker asynchrone pour la recherche universelle & extraction d'extraits
 * (Offices, Messes, Pièces Grégoriennes, Sacra Biblia)
 * =========================================================================
 */

'use strict';

// Mots vides pour éviter la sur-pondération des longs livres bibliques
var STOP_WORDS = new Set(['de', 'des', 'du', 'la', 'le', 'les', 'et', 'in', 'ad', 'a', 'un', 'une', 'qui', 'que', 'non', 'est', 'ut', 'te', 'me', 'se', 'cum']);

// Dictionnaire étendu d'équivalences liturgiques FR / LA / EN
var LITURGICAL_SYNONYMS = {
    // Temps liturgiques
    'paques': ['pascha', 'resurrectio', 'in albis', 'victimae paschali', 'surrexit'],
    'pâques': ['pascha', 'resurrectio', 'in albis', 'victimae paschali', 'surrexit'],
    'noel': ['nativitas', 'puer natus', 'hodie christus', 'in nocte nativitatis'],
    'noël': ['nativitas', 'puer natus', 'hodie christus', 'in nocte nativitatis'],
    'avent': ['adventus', 'rorate', 'propter sion'],
    'careme': ['quadragesima', 'cinerum', 'emendemus', 'parce domine'],
    'carême': ['quadragesima', 'cinerum', 'emendemus', 'parce domine'],
    'cendres': ['cinerum', 'in capite jejunii'],
    'mercredi des cendres': ['cinerum', 'in capite jejunii'],
    'rameaux': ['palmarum', 'in palmis', 'hosanna', 'pueri hebraeorum', 'gloria laus'],
    'semaine sainte': ['hebdomadae sanctae', 'in passione'],
    'jeudi saint': ['in coena domini', 'mandatum', 'nos autem gloriari'],
    'vendredi saint': ['in parasceve', 'crucem tuam', 'popule meus'],
    'samedi saint': ['sabbato sancto', 'in nocte sancta'],
    'ascension': ['ascensio', 'viri galilaei', 'ascendit deus'],
    'pentecote': ['pentecostes', 'veni creator', 'veni sancte', 'spiritus domini'],
    'pentecôte': ['pentecostes', 'veni creator', 'veni sancte', 'spiritus domini'],
    'trinite': ['trinitas', 'sanctissimae trinitatis', 'benedicta sit'],
    'trinité': ['trinitas', 'sanctissimae trinitatis', 'benedicta sit'],
    'sainte trinite': ['trinitas', 'sanctissimae trinitatis', 'benedicta sit'],
    'sainte trinité': ['trinitas', 'sanctissimae trinitatis', 'benedicta sit'],
    'fete dieu': ['corporis christi', 'corpus christi', 'lauda sion', 'cibavit eos'],
    'fête dieu': ['corporis christi', 'corpus christi', 'lauda sion', 'cibavit eos'],
    'sacre coeur': ['cordis jesu', 'cogitationes cordis'],
    'sacré coeur': ['cordis jesu', 'cogitationes cordis'],
    'christ roi': ['christi regis', 'dignus est agnus'],
    'toussaint': ['omnium sanctorum', 'gaudeamus omnes'],
    'messe des morts': ['missa pro defunctis', 'requiem', 'defunctis', 'dies irae'],
    'morts': ['defunctis', 'requiem', 'dies irae'],
    'defunts': ['defunctis', 'requiem'],
    'défunts': ['defunctis', 'requiem'],

    // Fêtes Mariales
    'marie': ['mariae', 'maria', 'virgo', 'virginis', 'bmv'],
    'sainte marie': ['mariae', 'maria', 'virgo', 'virginis', 'bmv'],
    'notre dame': ['mariae', 'maria', 'virgo', 'virginis', 'bmv'],
    'vierge': ['virgo', 'virginis', 'mariae'],
    'assomption': ['assumptio', 'signum magnum', 'assumpta est'],
    'annonciation': ['annuntiatio', 'rorate caeli', 'missus est gabriel'],
    'immaculee conception': ['immaculata conceptio', 'gaudens gaudebo'],
    'immaculée conception': ['immaculata conceptio', 'gaudens gaudebo'],
    'nativite de la vierge': ['nativitas mariae', 'gaudeamus'],
    'nativité de la vierge': ['nativitas mariae', 'gaudeamus'],
    'purification': ['purificatio', 'suscepimus deus', 'lumen ad revelationem'],
    'chandeleur': ['purificatio', 'suscepimus deus', 'lumen ad revelationem'],
    'rosaire': ['rosarii', 'gaudeamus'],
    'douleurs': ['dolorum', 'mater dolorosa', 'stabat mater'],

    // Saints majeurs
    'saint joseph': ['joseph', 'sponsi bmv'],
    'saint jean baptiste': ['joannis baptistae'],
    'saint pierre': ['petri', 'petrus', 'tu es petrus'],
    'saint paul': ['pauli', 'paulus', 'scio cui credidi'],
    'saint jean': ['joannis', 'joannes', 'in medio ecclesiae'],
    'saint michel': ['michael', 'benedicite dominum'],
    'saint martin': ['martini', 'martinus'],
    'saint louis': ['ludovici'],
    'saint benoit': ['benedicti'],
    'saint benoît': ['benedicti'],
    'sainte therese': ['theresiae'],
    'sainte thérèse': ['theresiae'],
    'sainte jeanne d\'arc': ['joannae de arc'],

    // Heures de l'Office Divin
    'matines': ['matutinum'],
    'laudes': ['laudes'],
    'prime': ['prima'],
    'tierce': ['tertia'],
    'sexte': ['sexta'],
    'none': ['nona'],
    'vepres': ['vesperae'],
    'vêpres': ['vesperae'],
    'complies': ['completorium'],

    // Antiennes mariales
    'salve regina': ['salve regina', 'vita dulcedo'],
    'alma redemptoris': ['alma redemptoris mater'],
    'ave regina caelorum': ['ave regina caelorum', 'gaude virgo'],
    'regina caeli': ['regina caeli', 'resurrexit sicut dixit']
};

// Aliases pour le parseur de références bibliques (ex: "Ps 22", "Jn 3 16")
var BIBLE_BOOK_ALIASES = {
    'gen': 'genesis', 'genese': 'genesis', 'genesis': 'genesis',
    'ex': 'exodus', 'exode': 'exodus', 'exodus': 'exodus',
    'lev': 'leviticus', 'levitique': 'leviticus', 'leviticus': 'leviticus',
    'num': 'numeri', 'nombres': 'numeri', 'numeri': 'numeri',
    'deut': 'deuteronomium', 'dt': 'deuteronomium', 'deuteronome': 'deuteronomium',
    'ps': 'psalmi', 'psaume': 'psalmi', 'psaumes': 'psalmi', 'psalmus': 'psalmi', 'psalmi': 'psalmi',
    'prov': 'proverbia', 'proverbes': 'proverbia',
    'eccl': 'ecclesiastes', 'ecclesiaste': 'ecclesiastes', 'qoh': 'ecclesiastes',
    'cant': 'canticum', 'cantique': 'canticum',
    'is': 'isaias', 'isaie': 'isaias', 'isaïe': 'isaias', 'isaias': 'isaias',
    'jer': 'jeremias', 'jeremie': 'jeremias', 'jérémie': 'jeremias',
    'lam': 'lamentationes', 'lamentations': 'lamentationes',
    'ez': 'ezechiel', 'ezechiel': 'ezechiel', 'ézéchiel': 'ezechiel',
    'dan': 'daniel', 'daniel': 'daniel',
    'mt': 'matthaeus', 'mat': 'matthaeus', 'matthieu': 'matthaeus', 'matthaeus': 'matthaeus',
    'mc': 'marcus', 'marc': 'marcus', 'marcus': 'marcus',
    'lc': 'lucas', 'luc': 'lucas', 'lucas': 'lucas',
    'jn': 'joannes', 'jean': 'joannes', 'jo': 'joannes', 'io': 'joannes', 'joannes': 'joannes',
    'act': 'actus', 'actes': 'actus',
    'rom': 'romanos', 'romains': 'romanos',
    '1cor': '1 corinthios', '1 cor': '1 corinthios', '1 corinthiens': '1 corinthios',
    '2cor': '2 corinthios', '2 cor': '2 corinthios', '2 corinthiens': '2 corinthios',
    'gal': 'galatas', 'galates': 'galatas',
    'eph': 'ephesios', 'ephesiens': 'ephesios',
    'phil': 'philippenses', 'philippiens': 'philippenses',
    'col': 'colossenses', 'colossiens': 'colossenses',
    '1thess': '1 thessalonicenses', '1 thess': '1 thessalonicenses',
    '2thess': '2 thessalonicenses', '2 thess': '2 thessalonicenses',
    '1tim': '1 timotheum', '1 tim': '1 timotheum',
    '2tim': '2 timotheum', '2 tim': '2 timotheum',
    'tit': 'titum', 'tite': 'titum',
    'heb': 'hebraeos', 'hebreux': 'hebraeos',
    'jacq': 'jacobus', 'jacques': 'jacobus', 'jac': 'jacobus',
    '1p': '1 petrus', '1 pierre': '1 petrus', '1pi': '1 petrus',
    '2p': '2 petrus', '2 pierre': '2 petrus', '2pi': '2 petrus',
    '1jn': '1 joannes', '1 jean': '1 joannes',
    '2jn': '2 joannes', '2 jean': '2 joannes',
    '3jn': '3 joannes', '3 jean': '3 joannes',
    'ap': 'apocalypsis', 'apoc': 'apocalypsis', 'apocalypse': 'apocalypsis'
};

// Normalisation du latin liturgique et des diacritiques
function normalizeLatin(str) {
    if (!str) return '';
    return String(str)
        .toLowerCase()
        // Ligatures latines
        .replace(/æ|ǽ/g, 'ae')
        .replace(/œ|œ́/g, 'oe')
        // Équivalences consonnes/voyelles latines
        .replace(/v/g, 'u')
        .replace(/j/g, 'i')
        // Accents et diacritiques
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        // Ponctuation liturgique et symboles
        .replace(/[\*\+\,\.\;\:\!\?\(\)\[\]\{\}\/\\℣℟†—–\-\_]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// Racinisation (Stemming) pour le latin liturgique
function latinStem(word) {
    if (!word || word.length <= 3) return word;
    var w = word;
    w = w.replace(/(averunt|erunt|ibunt|ebunt|abunt|issent|issint|issetis|issatis|erimus|eritis|abimus|ebimus|ibimus)$/, '');
    if (w.length >= 4) {
        w = w.replace(/(ibus|orum|arum|iant|ient|uant|erunt|atus|itas|ator|atur|etur|itur|amur|emur|imur|ando|endo|indo)$/, '');
    }
    if (w.length >= 4) {
        w = w.replace(/(isti|imus|istis|erunt|atis|etis|itis|amus|emus|imus|aret|eret|iret|abam|ebam|ibam|abat|ebat|ibat|ante|ente|inte|orum|arum|ibus|ium)$/, '');
    }
    if (w.length >= 3) {
        w = w.replace(/(us|um|am|em|im|as|os|es|is|ae|ui|ei|ii|ia|io|ie|at|et|it|nt|ur|er|or|ar|to|te|ti|ta)$/, '');
    }
    return w.length >= 3 ? w : word;
}

// Parseur de référence biblique
function parseBibleReference(query) {
    if (!query) return null;
    var clean = query.toLowerCase().replace(/[,:]/g, ' ').replace(/\s+/g, ' ').trim();
    var match = clean.match(/^([0-9]?\s*[a-zéèêïîç]+)\s+([0-9]+)(?:\s+([0-9]+))?$/i);
    if (!match) return null;

    var bookKey = match[1].replace(/\s+/g, '');
    var canonicalBook = BIBLE_BOOK_ALIASES[bookKey] || BIBLE_BOOK_ALIASES[match[1]];
    if (!canonicalBook) return null;

    return {
        book: canonicalBook,
        chapter: parseInt(match[2], 10),
        verse: match[3] ? parseInt(match[3], 10) : null
    };
}

var chantsList = [];
var chantsMap = {};
var tokenInvertedIndex = new Map();
var stemInvertedIndex = new Map();
var isInitialized = false;

// Extraction robuste de snippets
function extractSmartSnippet(fullText, query) {
    if (!fullText || !query) return null;
    var normQ = normalizeLatin(query);
    if (!normQ) return null;

    var origWords = fullText.split(/\s+/).filter(function(w) { return w.length > 0; });
    var normWords = origWords.map(function(w) { return normalizeLatin(w); });
    var rawTokens = normQ.split(/\s+/).filter(function(w) { return w.length > 0; });
    var significantTokens = rawTokens.filter(function(w) { return !STOP_WORDS.has(w); });
    var qTokens = significantTokens.length > 0 ? significantTokens : rawTokens;
    if (qTokens.length === 0) return null;

    var qStems = qTokens.map(function(t) { return latinStem(t); });
    var bestMatchIdx = -1;

    // 1. Recherche de séquence exacte
    for (var i = 0; i <= normWords.length - qTokens.length; i++) {
        var seqMatch = true;
        for (var j = 0; j < qTokens.length; j++) {
            if (normWords[i + j].indexOf(qTokens[j]) === -1) {
                seqMatch = false;
                break;
            }
        }
        if (seqMatch) {
            bestMatchIdx = i;
            break;
        }
    }

    // 2. Recherche du mot le plus pertinent
    if (bestMatchIdx === -1) {
        for (var k = 0; k < normWords.length; k++) {
            var nw = normWords[k];
            var stem = latinStem(nw);
            for (var t = 0; t < qTokens.length; t++) {
                if (nw.indexOf(qTokens[t]) !== -1 || (stem.length >= 3 && stem === qStems[t])) {
                    bestMatchIdx = k;
                    break;
                }
            }
            if (bestMatchIdx !== -1) break;
        }
    }

    if (bestMatchIdx === -1) return null;

    var winStart = Math.max(0, bestMatchIdx - 10);
    var winEnd = Math.min(origWords.length, bestMatchIdx + qTokens.length + 38);

    var snippetParts = [];
    if (winStart > 0) snippetParts.push('…');

    for (var m = winStart; m < winEnd; m++) {
        var nw = normWords[m];
        var nstem = latinStem(nw);
        var isHighlighted = false;

        for (var qt = 0; qt < qTokens.length; qt++) {
            if (qTokens[qt].length >= 2 && (nw.indexOf(qTokens[qt]) !== -1 || (nstem.length >= 3 && nstem === qStems[qt]))) {
                isHighlighted = true;
                break;
            }
        }

        if (isHighlighted) {
            snippetParts.push('<mark class="search-highlight">' + origWords[m] + '</mark>');
        } else {
            snippetParts.push(origWords[m]);
        }
    }

    if (winEnd < origWords.length) snippetParts.push('…');
    return snippetParts.join(' ');
}

// Surlignage du titre
function highlightTitle(text, query) {
    if (!text || !query) return text || '';
    var normQ = normalizeLatin(query);
    if (!normQ) return text;
    var qTokens = normQ.split(/\s+/).filter(function(w) { return w.length >= 2 && !STOP_WORDS.has(w); });
    if (!qTokens.length) qTokens = normQ.split(/\s+/).filter(function(w) { return w.length >= 2; });
    if (!qTokens.length) return text;

    var words = String(text).split(/\s+/);
    return words.map(function(w) {
        var nw = normalizeLatin(w);
        var match = qTokens.some(function(t) { return nw.indexOf(t) !== -1; });
        return match ? ('<mark class="search-highlight">' + w + '</mark>') : w;
    }).join(' ');
}

var defaultShowcaseList = [];

// Création du showcase d'accueil équilibré : Messe, Genèse, Office, Grégorien
function buildShowcaseList() {
    var missae = [];
    var biblia = [];
    var officia = [];
    var chants = [];

    for (var i = 0; i < chantsList.length; i++) {
        var item = chantsList[i];
        if (item.type === 'missa') missae.push(item);
        else if (item.type === 'bible') biblia.push(item);
        else if (item.type === 'officium') officia.push(item);
        else chants.push(item);
    }

    var showcase = [];
    var seenIds = new Set();

    function pushItem(it) {
        if (it && !seenIds.has(it.id)) {
            seenIds.add(it.id);
            showcase.push(it);
        }
    }

    // 1. Les 4 têtes de file demandées :
    // D'abord une Messe (Messe du Temps / Avent 1)
    var firstMissa = missae.find(function(m) { return m.key === 'Adv1-0' || m.id.indexOf('Adv') !== -1; }) || missae[0];
    pushItem(firstMissa);

    // Puis la Genèse (Bible)
    var firstBible = biblia.find(function(b) { return b.bookId === 'Genesis' || b.id === 'bible_Genesis'; }) || biblia[0];
    pushItem(firstBible);

    // Puis un Office (Laudes ou Vêpres)
    var firstOfficium = officia.find(function(o) { return o.hora === 'laudes' || o.id === 'hora_laudes'; }) || officia[0];
    pushItem(firstOfficium);

    // Puis un Chant Grégorien
    if (chants.length > 0) pushItem(chants[0]);

    // 2. Intercalation équilibrée de toutes les catégories :
    var mIdx = 0, bIdx = 0, oIdx = 0, cIdx = 1;
    var maxLen = Math.max(missae.length, biblia.length, officia.length, chants.length);

    for (var step = 0; step < maxLen; step++) {
        if (mIdx < missae.length) pushItem(missae[mIdx++]);
        if (bIdx < biblia.length) pushItem(biblia[bIdx++]);
        if (oIdx < officia.length) pushItem(officia[oIdx++]);
        if (cIdx < chants.length) pushItem(chants[cIdx++]);
        if (cIdx < chants.length) pushItem(chants[cIdx++]);
    }

    for (var k = 0; k < chantsList.length; k++) {
        pushItem(chantsList[k]);
    }

    defaultShowcaseList = showcase;
}

// Construction de l'index en mémoire avec Index Inversé Multilingue
function buildIndex(data) {
    if (!Array.isArray(data)) return;
    chantsList = data;
    chantsMap = {};
    tokenInvertedIndex = new Map();
    stemInvertedIndex = new Map();

    for (var i = 0; i < chantsList.length; i++) {
        var item = chantsList[i];
        chantsMap[item.id] = item;
        item.normIncipit = normalizeLatin(item.incipit || '');
        item.normTitleLa = normalizeLatin(item.titleLa || item.incipit || '');
        item.normTitleFr = normalizeLatin(item.titleFr || item.titleVern || '');
        item.normTitleEn = normalizeLatin(item.titleEn || '');
        item.normFullTextLa = normalizeLatin(item.fullTextLa || item.fullText || item.incipit || '');
        item.normFullTextFr = normalizeLatin(item.fullTextFr || '');
        item.normFullTextEn = normalizeLatin(item.fullTextEn || '');
        item.normTags = normalizeLatin(item.tags || '');
        item.normPart = normalizeLatin(item.part || '');
        item.normMode = String(item.mode || '').trim();

        var incipitWords = item.normIncipit.split(/\s+/).filter(function(w) { return w.length > 1; });
        item.incipitTokenSet = new Set(incipitWords);

        var titleWords = (item.normTitleLa + ' ' + item.normTitleFr).split(/\s+/).filter(function(w) { return w.length > 1; });
        item.titleTokenSet = new Set(titleWords);

        var fullStr = item.normIncipit + ' ' + item.normTitleLa + ' ' + item.normTitleFr + ' ' + item.normTags + ' ' + item.normFullTextLa + ' ' + item.normFullTextFr;
        var words = fullStr.split(/\s+/).filter(function(w) { return w.length > 1 && !STOP_WORDS.has(w); });
        var seenTokens = new Set();
        var seenStems = new Set();

        for (var j = 0; j < words.length; j++) {
            var w = words[j];
            if (!seenTokens.has(w)) {
                seenTokens.add(w);
                var arr = tokenInvertedIndex.get(w);
                if (!arr) {
                    arr = [];
                    tokenInvertedIndex.set(w, arr);
                }
                arr.push(i);
            }

            var st = latinStem(w);
            if (st.length >= 3 && !seenStems.has(st)) {
                seenStems.add(st);
                var sarr = stemInvertedIndex.get(st);
                if (!sarr) {
                    sarr = [];
                    stemInvertedIndex.set(st, sarr);
                }
                sarr.push(i);
            }
        }
    }

    buildShowcaseList();
    isInitialized = true;
}

// Exécution ultra-rapide de la recherche (< 2 ms)
function executeSearch(query, filters, limit, offset) {
    var startTime = Date.now();
    query = (query || '').trim();
    limit = limit || 50;
    offset = offset || 0;

    var filterPart = (filters && filters.part) ? filters.part.toLowerCase() : null;
    var filterMode = (filters && filters.mode) ? String(filters.mode).trim() : null;
    var userLang = (filters && filters.lang) ? String(filters.lang).toLowerCase() : 'fr';
    if (userLang === 'none') userLang = 'la';

    if (!query && !filterPart && !filterMode) {
        var sourceList = defaultShowcaseList.length > 0 ? defaultShowcaseList : chantsList;
        var defaultSlice = sourceList.slice(offset, offset + limit).map(function(c) {
            var clone = Object.assign({}, c);
            clone.highlightedIncipit = clone.incipit;
            clone.matchSnippet = null;
            return clone;
        });
        return {
            query: query,
            results: defaultSlice,
            totalCount: chantsList.length,
            tookMs: Date.now() - startTime
        };
    }

    var normQ = normalizeLatin(query);
    var rawTokens = normQ ? normQ.split(/\s+/).filter(function(w) { return w.length > 0; }) : [];
    var significantTokens = rawTokens.filter(function(w) { return !STOP_WORDS.has(w) || rawTokens.length === 1; });
    var qTokens = significantTokens.length > 0 ? significantTokens : rawTokens;
    var qStems = qTokens.map(function(t) { return latinStem(t); });
    var synonyms = normQ ? (LITURGICAL_SYNONYMS[normQ] || LITURGICAL_SYNONYMS[query.toLowerCase()] || []) : [];
    var bibleRef = parseBibleReference(query);

    var scores = new Float32Array(chantsList.length);
    var matchedSet = new Uint8Array(chantsList.length);

    // 0. Recherche biblique directe
    if (bibleRef) {
        for (var b = 0; b < chantsList.length; b++) {
            var bItem = chantsList[b];
            if (bItem.type === 'bible' && (bItem.normIncipit.indexOf(bibleRef.book) !== -1 || bItem.id.indexOf(bibleRef.book) !== -1)) {
                scores[b] += 600;
                matchedSet[b] = 1;
            }
        }
    }

    // 1. Synonymes liturgiques
    if (synonyms.length > 0) {
        for (var s = 0; s < synonyms.length; s++) {
            var syn = synonyms[s];
            var normSyn = normalizeLatin(syn);
            var synTokens = normSyn.split(/\s+/).filter(function(w) { return w.length > 0 && !STOP_WORDS.has(w); });
            for (var st = 0; st < synTokens.length; st++) {
                var stok = synTokens[st];
                var list = tokenInvertedIndex.get(stok);
                if (list) {
                    for (var l = 0; l < list.length; l++) {
                        var idx = list[l];
                        var item = chantsList[idx];
                        if (item.incipitTokenSet.has(stok) || item.titleTokenSet.has(stok) || item.normTags.indexOf(stok) !== -1) {
                            scores[idx] += 120;
                        } else {
                            scores[idx] += 15;
                        }
                        matchedSet[idx] = 1;
                    }
                }
            }
        }
    }

    // 2. Index inversé pour les tokens
    for (var t = 0; t < qTokens.length; t++) {
        var tok = qTokens[t];
        var stem = qStems[t];
        var tokList = tokenInvertedIndex.get(tok);

        if (tokList) {
            for (var k = 0; k < tokList.length; k++) {
                var tIdx = tokList[k];
                var tItem = chantsList[tIdx];
                if (tItem.incipitTokenSet.has(tok) || tItem.titleTokenSet.has(tok)) {
                    scores[tIdx] += 60;
                } else {
                    scores[tIdx] += 20;
                }
                matchedSet[tIdx] = 1;
            }
        }

        if (stem.length >= 3) {
            var stemList = stemInvertedIndex.get(stem);
            if (stemList) {
                for (var sm = 0; sm < stemList.length; sm++) {
                    var sIdx = stemList[sm];
                    scores[sIdx] += 10;
                    matchedSet[sIdx] = 1;
                }
            }
        }
    }

    // 3. Filtrage & Scoring fin des candidats
    var candidates = [];
    for (var c = 0; c < chantsList.length; c++) {
        if (!matchedSet[c] && normQ) continue;

        var chant = chantsList[c];

        // Filtre Partie / Types
        if (filterPart) {
            var f = filterPart.toLowerCase().replace(/[;:,.]/g, '').trim();
            var ctype = chant.type || 'chant';
            var cp = (chant.part || '').toLowerCase().replace(/[;:,.]/g, '').trim();
            var ct = (chant.tags || '').toLowerCase();

            if (f === 'officium' || f === 'offices' || f === 'office') {
                if (ctype !== 'officium') continue;
            } else if (f === 'missa' || f === 'messes' || f === 'messe') {
                if (ctype !== 'missa') continue;
            } else if (f === 'bible' || f === 'scriptura') {
                if (ctype !== 'bible') continue;
            } else if (f === 'chant' || f === 'chants') {
                if (ctype !== 'chant') continue;
            } else if (f === 'ad_libitum' || f === 'adlib') {
                if (ct.indexOf('ad lib') === -1 && cp.indexOf('ad lib') === -1 && (chant.incipit || '').toLowerCase().indexOf('ad lib') === -1) {
                    continue;
                }
            } else if (f === 'kyriale' || f === 'ordinarium') {
                if (ct.indexOf('kyriale') === -1 && ['kyrie', 'gloria', 'credo', 'sanctus', 'agnus dei', 'ite missa est'].indexOf(cp) === -1) {
                    continue;
                }
            } else if (f === 'introitus' || f === 'introit' || f === 'introits') {
                if (cp.indexOf('intr') === -1 && ct.indexOf('intr') === -1) continue;
            } else if (f === 'graduale' || f === 'graduel' || f === 'graduels') {
                if (cp.indexOf('grad') === -1 && ct.indexOf('grad') === -1) continue;
            } else if (f === 'alleluia' || f === 'alleluias') {
                if (cp.indexOf('allel') === -1 && ct.indexOf('allel') === -1) continue;
            } else if (f === 'tractus' || f === 'trait' || f === 'traits') {
                if (cp.indexOf('tract') === -1 && ct.indexOf('tract') === -1) continue;
            } else if (f === 'sequentia' || f === 'sequence' || f === 'sequences') {
                if (cp.indexOf('seq') === -1 && ct.indexOf('seq') === -1) continue;
            } else if (f === 'offertorium' || f === 'offertoire' || f === 'offertoires') {
                if (cp.indexOf('offert') === -1 && ct.indexOf('offert') === -1) continue;
            } else if (f === 'communio' || f === 'communion' || f === 'communions') {
                if (cp.indexOf('comm') === -1 && ct.indexOf('comm') === -1) continue;
            } else if (f === 'antiphona' || f === 'antienne' || f === 'antiennes') {
                if (cp.indexOf('ant') === -1 && ct.indexOf('ant') === -1) continue;
            } else if (f === 'responsorium' || f === 'repons') {
                if (cp.indexOf('resp') === -1 && ct.indexOf('resp') === -1) continue;
            } else if (f === 'hymnus' || f === 'hymne' || f === 'hymnes') {
                if (cp.indexOf('hymn') === -1 && ct.indexOf('hymn') === -1) continue;
            } else if (cp !== f && cp.indexOf(f) === -1) {
                continue;
            }
        }

        // Filtre Mode
        if (filterMode && chant.mode && chant.mode !== filterMode) {
            continue;
        }

        var sc = scores[c];

        // Construire la chaîne de recherche autorisée pour la langue choisie
        var chantSearchText = '';
        var chantTitle = '';
        if (userLang === 'fr') {
            chantTitle = (chant.normTitleLa || '') + ' ' + (chant.normTitleFr || '');
            chantSearchText = (chant.normIncipit || '') + ' ' + chantTitle + ' ' + (chant.normTags || '') + ' ' + (chant.normFullTextLa || '') + ' ' + (chant.normFullTextFr || '');
        } else if (userLang === 'en') {
            chantTitle = (chant.normTitleLa || '') + ' ' + (chant.normTitleEn || '');
            chantSearchText = (chant.normIncipit || '') + ' ' + chantTitle + ' ' + (chant.normTags || '') + ' ' + (chant.normFullTextLa || '') + ' ' + (chant.normFullTextEn || '');
        } else {
            chantTitle = (chant.normTitleLa || '');
            chantSearchText = (chant.normIncipit || '') + ' ' + chantTitle + ' ' + (chant.normTags || '') + ' ' + (chant.normFullTextLa || '');
        }

        if (normQ) {
            var hasExactMatch = (chantSearchText.indexOf(normQ) !== -1);
            if (!hasExactMatch) {
                var allFound = true;
                for (var qt = 0; qt < qTokens.length; qt++) {
                    if (chantSearchText.indexOf(qTokens[qt]) === -1) {
                        allFound = false;
                        break;
                    }
                }
                // Si la recherche ne provient pas de la langue autorisée, ignorer
                if (!allFound && sc < 100) {
                    continue;
                }
            }

            if (chant.normIncipit === normQ) {
                sc += 500;
            } else if (chant.normIncipit.indexOf(normQ) === 0) {
                sc += 300;
            } else if (chant.normIncipit.indexOf(normQ) !== -1) {
                sc += 150;
            }

            if (chantTitle) {
                if (chantTitle === normQ) sc += 400;
                else if (chantTitle.indexOf(normQ) !== -1) sc += 180;
            }

            if (chant.normTags && chant.normTags.indexOf(normQ) !== -1) {
                sc += 100;
            }

            if (qTokens.length > 1) {
                var incipitHits = 0;
                for (var qh = 0; qh < qTokens.length; qh++) {
                    if (chant.incipitTokenSet.has(qTokens[qh])) incipitHits++;
                }
                if (incipitHits === qTokens.length) {
                    sc += 250;
                }
            }

            if (hasExactMatch) {
                sc += 70;
            }

            if (chant.type === 'missa' || chant.type === 'officium') {
                sc += 50;
            }
        }

        if (sc > 0 || !normQ) {
            scores[c] = sc;
            candidates.push(c);
        }
    }

    candidates.sort(function(a, b) {
        return scores[b] - scores[a];
    });

    var totalCount = candidates.length;
    var paginatedSlice = candidates.slice(offset, offset + limit);

    // Extraction intelligente de snippets UNIQUEMENT dans la langue choisie
    var results = paginatedSlice.map(function(idx) {
        var item = chantsList[idx];
        var clone = Object.assign({}, item);
        clone.score = scores[idx];
        clone.highlightedIncipit = highlightTitle(item.incipit, query);

        var snip = null;
        if (normQ) {
            if (userLang === 'fr') {
                if (item.fullTextFr) snip = extractSmartSnippet(item.fullTextFr, query);
                if (!snip && item.fullTextLa) snip = extractSmartSnippet(item.fullTextLa, query);
            } else if (userLang === 'en') {
                if (item.fullTextEn) snip = extractSmartSnippet(item.fullTextEn, query);
                if (!snip && item.fullTextLa) snip = extractSmartSnippet(item.fullTextLa, query);
            } else {
                if (item.fullTextLa) snip = extractSmartSnippet(item.fullTextLa, query);
            }
            if (!snip && item.latinPreview && normalizeLatin(item.latinPreview).indexOf(normQ) !== -1) {
                snip = highlightTitle(item.latinPreview, query);
            }
        }

        clone.matchSnippet = snip;
        return clone;
    });

    return {
        query: query,
        results: results,
        totalCount: totalCount,
        tookMs: Date.now() - startTime
    };
}

// Réception des messages du thread principal
self.addEventListener('message', async function(e) {
    var data = e.data || {};
    var type = data.type;
    var payload = data.payload || {};
    var msgId = data.msgId;

    switch (type) {
        case 'INIT':
            try {
                var url = payload.url || '../data/gregorian_index.json';
                var res = await fetch(url);
                if (res.ok) {
                    var json = await res.json();
                    buildIndex(json);
                    self.postMessage({
                        type: 'INIT_DONE',
                        msgId: msgId,
                        payload: { totalChants: chantsList.length }
                    });
                } else {
                    throw new Error('HTTP ' + res.status);
                }
            } catch (err) {
                console.error('[Worker] Erreur init index:', err);
                self.postMessage({
                    type: 'INIT_ERROR',
                    msgId: msgId,
                    payload: { error: err.message }
                });
            }
            break;

        case 'LOAD_DATA':
            if (payload.data) {
                buildIndex(payload.data);
                self.postMessage({
                    type: 'LOAD_DATA_DONE',
                    msgId: msgId,
                    payload: { totalChants: chantsList.length }
                });
            }
            break;

        case 'SEARCH':
            if (!isInitialized) {
                self.postMessage({
                    type: 'SEARCH_RESULTS',
                    msgId: msgId,
                    payload: { query: payload.query, results: [], totalCount: 0, totalFound: 0, tookMs: 0, timeMs: 0 }
                });
                return;
            }
            var searchFilters = payload.filters || {
                part: payload.filterPart,
                mode: payload.filterMode
            };
            var searchRes = executeSearch(payload.query, searchFilters, payload.limit, payload.offset);
            self.postMessage({
                type: 'SEARCH_RESULTS',
                msgId: msgId,
                payload: {
                    query: searchRes.query,
                    results: searchRes.results,
                    totalCount: searchRes.totalCount,
                    totalFound: searchRes.totalCount,
                    tookMs: searchRes.tookMs,
                    timeMs: searchRes.tookMs,
                    append: payload.append || false,
                    offset: payload.offset || 0
                }
            });
            break;

        case 'GET_BY_ID':
            var found = chantsMap[payload.id] || null;
            self.postMessage({
                type: 'GET_BY_ID_RESULT',
                msgId: msgId,
                payload: { id: payload.id, chant: found }
            });
            break;

        default:
            console.warn('[Worker] Type de message inconnu:', type);
    }
});

