/* =============================================================
   Divinum Officium & Missale Romanum — 100% Offline Engine
   Clean Monochrome Base + OLED + Dynamic Accent Tinting
   2 Distinct Settings: Latin Text (On/Off) + Vernacular Translation (None/Fr/En/Es/It/De/Pt)
   Row-by-Row Perfect Bilingual Alignment & Paginated Sacra Biblia Reader
   Recursive Section (@:Tag & @File:Tag) & Variable ($Var) Resolution
   ============================================================= */

// ---- Automatic Audio Context Unlock on First User Gesture ----
(function() {
    var unlocked = false;
    var unlockEvents = ['click', 'touchend', 'pointerup', 'mouseup', 'keydown'];

    function removeListeners() {
        unlockEvents.forEach(function(evt) {
            window.removeEventListener(evt, unlockAudio, { capture: true });
        });
    }

    function unlockAudio() {
        if (unlocked) return;

        var toneRawCtx = (window.Tone && window.Tone.context && (window.Tone.context.rawContext || window.Tone.context._context || window.Tone.context));
        var tonesCtx = (window.tones && window.tones.context);

        if ((!toneRawCtx || toneRawCtx.state === 'running') && (!tonesCtx || tonesCtx.state === 'running')) {
            unlocked = true;
            removeListeners();
            return;
        }

        var promises = [];
        if (window.Tone && typeof window.Tone.start === 'function') {
            try {
                promises.push(window.Tone.start());
            } catch(e) {}
        }
        if (toneRawCtx && toneRawCtx.state === 'suspended' && typeof toneRawCtx.resume === 'function') {
            try {
                promises.push(toneRawCtx.resume());
            } catch(e) {}
        }
        if (tonesCtx && tonesCtx !== toneRawCtx && tonesCtx.state === 'suspended' && typeof tonesCtx.resume === 'function') {
            try {
                promises.push(tonesCtx.resume());
            } catch(e) {}
        }

        if (promises.length > 0) {
            Promise.all(promises).then(function() {
                unlocked = true;
                removeListeners();
            }).catch(function() {});
        } else {
            unlocked = true;
            removeListeners();
        }
    }

    unlockEvents.forEach(function(evt) {
        window.addEventListener(evt, unlockAudio, { capture: true, passive: true });
    });
})();

// ---- Global State ----
var doState = window.doState = {
    hora: localStorage.getItem('do_hora') || 'home',
    date: moment(),
    showLatin: (localStorage.getItem('do_show_latin') !== 'false'),
    vernacularLang: localStorage.getItem('do_vernacular_lang') || (localStorage.getItem('do_lang') === 'la' ? 'none' : (localStorage.getItem('do_lang') || 'fr')),
    edition: localStorage.getItem('do_edition') || '1960',
    rite: localStorage.getItem('do_rite') || 'traditional',
    officiumKey: localStorage.getItem('do_officiumKey') || null,
    testFeastKey: null,
    includeOrdinarium: localStorage.getItem('do_ordinarium') === 'true',
    includeGregorian: (localStorage.getItem('do_include_gregorian') !== 'false'),
    selectedKyriale: localStorage.getItem('do_selected_kyriale') || 'auto',
    tempo: parseInt(localStorage.getItem('do_tempo'), 10) || 165,
    mobileLang: 'la',
    settings: {
        theme: localStorage.getItem('do_theme') || 'auto',
        color: localStorage.getItem('do_color') || '#c96b63',
        liturgicalColorSync: (localStorage.getItem('do_liturgical_color_sync') === 'true'),
        iconSync: localStorage.getItem('do_icon_sync') === 'true',
        iconColor: localStorage.getItem('do_icon_color') || 'default'
    },
    bible: {
        book: localStorage.getItem('do_bible_book') || 'Genesis',
        chapter: parseInt(localStorage.getItem('do_bible_chapter'), 10) || 1,
        page: parseInt(localStorage.getItem('do_bible_page'), 10) || 1,
        pageSize: localStorage.getItem('do_bible_pageSize') || '15'
    },
    currentChantId: localStorage.getItem('do_chant_id') || null
};

var DO_LOCAL_CACHE = {};

function getUiLang() {
    if (doState.vernacularLang && doState.vernacularLang !== 'none') {
        return doState.vernacularLang;
    }
    return doState.showLatin ? 'la' : 'fr';
}

var DO_HORA_TITLES_BY_LANG = {
    fr: {
        missa:            'Sainte Messe',
        missa_gregorian:  'Messe & Grégorien',
        matutinum:        'Matines',
        laudes:           'Laudes',
        prima:            'Prime',
        tertia:           'Tierce',
        sexta:            'Sexte',
        nona:             'None',
        vesperae:         'Vêpres',
        completorium:     'Complies',
        bible:            'Sainte Bible'
    },
    la: {
        missa:            'Sancta Missa',
        missa_gregorian:  'Missa cum Cantu',
        matutinum:        'Ad Matutinum',
        laudes:           'Ad Laudes',
        prima:            'Ad Primam',
        tertia:           'Ad Tertiam',
        sexta:            'Ad Sextam',
        nona:             'Ad Nonam',
        vesperae:         'Ad Vesperas',
        completorium:     'Ad Completorium',
        bible:            'Sacra Biblia'
    },
    en: {
        missa:            'Holy Mass',
        missa_gregorian:  'Mass & Chant',
        matutinum:        'Matins',
        laudes:           'Lauds',
        prima:            'Prime',
        tertia:           'Terce',
        sexta:            'Sext',
        nona:             'None',
        vesperae:         'Vespers',
        completorium:     'Compline',
        bible:            'Holy Bible'
    },
    es: {
        missa:            'Santa Misa',
        missa_gregorian:  'Misa y Canto',
        matutinum:        'Maitines',
        laudes:           'Laudes',
        prima:            'Prima',
        tertia:           'Tercia',
        sexta:            'Sexta',
        nona:             'Nona',
        vesperae:         'Vísperas',
        completorium:     'Completas',
        bible:            'Santa Biblia'
    }
};

var DO_EDITIONS = {
    '1960': {
        name: 'Rubrics 1960 - 1960',
        label: 'Rubriques 1960 (Défaut)',
        short: '1960',
        suffixes: ['r', ''],
        folders: ['Sancti', 'Tempora', 'Commune']
    },
    '1960_usa': {
        name: 'Rubrics 1960 - 2020 USA',
        label: 'Rubriques 1960 (USA)',
        short: '1960 USA',
        suffixes: ['usa', 'r', ''],
        folders: ['Sancti', 'Tempora', 'Commune']
    },
    '1955': {
        name: 'Reduced - 1955',
        label: 'Rubriques 1955 (Simplifié)',
        short: '1955',
        suffixes: ['1955', 'r', 'da', ''],
        folders: ['Sancti', 'Tempora', 'Commune']
    },
    '1954': {
        name: 'Divino Afflatu - 1954',
        label: 'Divino Afflatu (1954)',
        short: 'DA 1954',
        suffixes: ['1954', 'da', ''],
        folders: ['Sancti', 'Tempora', 'Commune']
    },
    '1939': {
        name: 'Divino Afflatu - 1939',
        label: 'Divino Afflatu (1939)',
        short: 'DA 1939',
        suffixes: ['1939', 'da', ''],
        folders: ['Sancti', 'Tempora', 'Commune']
    },
    '1570': {
        name: 'Tridentine - 1570',
        label: 'Tridentin (1570)',
        short: 'Tridentin 1570',
        suffixes: ['1570', 'o', 't', ''],
        folders: ['Sancti', 'Tempora', 'Commune']
    },
    '1888': {
        name: 'Tridentine - 1888',
        label: 'Tridentin (1888)',
        short: 'Tridentin 1888',
        suffixes: ['1888', 'o', 't', ''],
        folders: ['Sancti', 'Tempora', 'Commune']
    },
    '1906': {
        name: 'Tridentine - 1906',
        label: 'Tridentin (1906)',
        short: 'Tridentin 1906',
        suffixes: ['1906', 'o', 't', ''],
        folders: ['Sancti', 'Tempora', 'Commune']
    },
    'monastic_1963': {
        name: 'Monastic - 1963',
        label: 'Monastique (1963)',
        short: 'Monastique 1963',
        suffixes: ['m3', 'm', ''],
        folders: ['SanctiM', 'Sancti', 'Tempora', 'Commune']
    },
    'monastic_barroux': {
        name: 'Monastic - 1963 - Barroux',
        label: 'Monastique (Barroux)',
        short: 'Barroux',
        suffixes: ['bar', 'm3', 'm', ''],
        folders: ['SanctiM', 'Sancti', 'Tempora', 'Commune']
    },
    'monastic_1930': {
        name: 'Monastic - 1930',
        label: 'Monastique (1930)',
        short: 'Monastique 1930',
        suffixes: ['m2', 'm', ''],
        folders: ['SanctiM', 'Sancti', 'Tempora', 'Commune']
    },
    'monastic_1617': {
        name: 'Monastic - 1617',
        label: 'Monastique (1617)',
        short: 'Monastique 1617',
        suffixes: ['m1', 'm', ''],
        folders: ['SanctiM', 'Sancti', 'Tempora', 'Commune']
    },
    'cistercian_1951': {
        name: 'Ordo Cisterciensis - 1951',
        label: 'Cistercien (1951)',
        short: 'Cistercien 1951',
        suffixes: ['cist', ''],
        folders: ['Sancti', 'Tempora', 'Commune']
    },
    'cistercian_altovado': {
        name: 'Ordo Cisterciensis - Altovado',
        label: 'Cistercien (Altovado)',
        short: 'Altovado',
        suffixes: ['AV', 'cist', ''],
        folders: ['Sancti', 'Tempora', 'Commune']
    },
    'dominican_1962': {
        name: 'Ordo Praedicatorum - 1962',
        label: 'Dominicain (1962)',
        short: 'Dominicain',
        suffixes: ['op', ''],
        folders: ['Sancti', 'Tempora', 'Commune']
    }
};

var LATIN_MONTHS = ['Januarii', 'Februarii', 'Martii', 'Aprilis', 'Maii', 'Junii', 'Julii', 'Augusti', 'Septembris', 'Octobris', 'Novembris', 'Decembris'];
var FRENCH_MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
var SPANISH_MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
var ENGLISH_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
var ITALIAN_MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'octobre', 'novembre', 'dicembre'];
var GERMAN_MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

function formatLiturgicalDate(mom, lang) {
    if (!mom) return '';
    var d = mom.date();
    var m = mom.month(); // 0-11
    var y = mom.year();

    if (lang === 'fr') return d + ' ' + FRENCH_MONTHS[m] + ' ' + y;
    if (lang === 'la') return d + ' ' + LATIN_MONTHS[m] + ' ' + y;
    if (lang === 'es') return d + ' de ' + SPANISH_MONTHS[m] + ' de ' + y;
    if (lang === 'it') return d + ' ' + ITALIAN_MONTHS[m] + ' ' + y;
    if (lang === 'de') return d + '. ' + GERMAN_MONTHS[m] + ' ' + y;
    return d + ' ' + ENGLISH_MONTHS[m] + ' ' + y;
}

function formatBadgeDate(mom, lang) {
    if (!mom || !mom.isValid()) return '';
    var d = mom.date();
    var dStr = (d < 10 ? '0' + d : '' + d);
    var m = mom.month(); // 0-11

    var monthsFr = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
    var monthsLa = ['Jan', 'Feb', 'Mar', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var monthsEs = ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sept.', 'oct.', 'nov.', 'dic.'];
    var monthsIt = ['genn.', 'febbr.', 'mar.', 'apr.', 'magg.', 'giugno', 'luglio', 'ag.', 'sett.', 'ott.', 'nov.', 'dic.'];
    var monthsDe = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'];
    var monthsEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    var monthLabel;
    if (lang === 'fr') monthLabel = monthsFr[m];
    else if (lang === 'la') monthLabel = monthsLa[m];
    else if (lang === 'es') monthLabel = monthsEs[m];
    else if (lang === 'it') monthLabel = monthsIt[m];
    else if (lang === 'de') monthLabel = monthsDe[m];
    else monthLabel = monthsEn[m];

    return dStr + ' ' + monthLabel;
}

// ---- All 73 Canonical Bible Books in jgabc ----
var DO_BIBLE_BOOKS = [
    // Pentateuque
    { id: 'Genesis', la: 'Genesis', fr: 'Genèse', en: 'Genesis', es: 'Génesis', chapters: 50, cat: 'Pentateuque' },
    { id: 'Exodus', la: 'Exodus', fr: 'Exode', en: 'Exodus', es: 'Éxodo', chapters: 40, cat: 'Pentateuque' },
    { id: 'Leviticus', la: 'Leviticus', fr: 'Lévitique', en: 'Leviticus', es: 'Levítico', chapters: 27, cat: 'Pentateuque' },
    { id: 'Numeri', la: 'Numeri', fr: 'Nombres', en: 'Numbers', es: 'Números', chapters: 36, cat: 'Pentateuque' },
    { id: 'Deuteronomium', la: 'Deuteronomium', fr: 'Deutéronome', en: 'Deuteronomy', es: 'Deuteronomio', chapters: 34, cat: 'Pentateuque' },

    // Livres Historiques
    { id: 'Josue', la: 'Josue', fr: 'Josué', en: 'Joshua', es: 'Josué', chapters: 24, cat: 'Livres Historiques' },
    { id: 'Judicum', la: 'Judicum', fr: 'Juges', en: 'Judges', es: 'Jueces', chapters: 21, cat: 'Livres Historiques' },
    { id: 'Ruth', la: 'Ruth', fr: 'Ruth', en: 'Ruth', es: 'Rut', chapters: 4, cat: 'Livres Historiques' },
    { id: 'Regum 1', la: '1 Regum (1 Samuel)', fr: '1 Samuel', en: '1 Samuel', es: '1 Samuel', chapters: 31, cat: 'Livres Historiques' },
    { id: 'Regum 2', la: '2 Regum (2 Samuel)', fr: '2 Samuel', en: '2 Samuel', es: '2 Samuel', chapters: 24, cat: 'Livres Historiques' },
    { id: 'Regum 3', la: '3 Regum (1 Rois)', fr: '1 Rois', en: '1 Kings', es: '1 Reyes', chapters: 22, cat: 'Livres Historiques' },
    { id: 'Regum 4', la: '4 Regum (2 Rois)', fr: '2 Rois', en: '2 Kings', es: '2 Reyes', chapters: 25, cat: 'Livres Historiques' },
    { id: 'Paralipomenon 1', la: '1 Paralipomenon', fr: '1 Chroniques', en: '1 Chronicles', es: '1 Crónicas', chapters: 29, cat: 'Livres Historiques' },
    { id: 'Paralipomenon 2', la: '2 Paralipomenon', fr: '2 Chroniques', en: '2 Chronicles', es: '2 Crónicas', chapters: 36, cat: 'Livres Historiques' },
    { id: 'Esdræ', la: 'Esdras', fr: 'Esdras', en: 'Ezra', es: 'Esdras', chapters: 10, cat: 'Livres Historiques' },
    { id: 'Nehemiæ', la: 'Nehemias', fr: 'Néhémie', en: 'Nehemiah', es: 'Nehemías', chapters: 13, cat: 'Livres Historiques' },
    { id: 'Tobiæ', la: 'Tobias', fr: 'Tobie', en: 'Tobit', es: 'Tobías', chapters: 14, cat: 'Livres Historiques' },
    { id: 'Judith', la: 'Judith', fr: 'Judith', en: 'Judith', es: 'Judit', chapters: 16, cat: 'Livres Historiques' },
    { id: 'Esther', la: 'Esther', fr: 'Esther', en: 'Esther', es: 'Ester', chapters: 16, cat: 'Livres Historiques' },
    { id: 'Machabæorum 1', la: '1 Machabæorum', fr: '1 Maccabées', en: '1 Maccabees', es: '1 Macabeos', chapters: 16, cat: 'Livres Historiques' },
    { id: 'Machabæorum 2', la: '2 Machabæorum', fr: '2 Maccabées', en: '2 Maccabees', es: '2 Macabeos', chapters: 15, cat: 'Livres Historiques' },

    // Livres Poétiques & Sapientiaux
    { id: 'Job', la: 'Job', fr: 'Job', en: 'Job', es: 'Job', chapters: 42, cat: 'Livres Sapientiaux' },
    { id: 'Psalmi', la: 'Psalmi (Liber Psalmorum)', fr: 'Psaumes (Livre des Psaumes)', en: 'Psalms', es: 'Salmos', chapters: 150, cat: 'Livres Sapientiaux' },
    { id: 'Proverbia', la: 'Proverbia', fr: 'Proverbes', en: 'Proverbs', es: 'Proverbios', chapters: 31, cat: 'Livres Sapientiaux' },
    { id: 'Ecclesiastes', la: 'Ecclesiastes', fr: 'Ecclésiaste (Qohélet)', en: 'Ecclesiastes', es: 'Eclesiastés', chapters: 12, cat: 'Livres Sapientiaux' },
    { id: 'Canticum Canticorum', la: 'Canticum Canticorum', fr: 'Cantique des Cantiques', en: 'Song of Songs', es: 'Cantar de los Cantares', chapters: 8, cat: 'Livres Sapientiaux' },
    { id: 'Sapientia', la: 'Sapientia', fr: 'Sagesse de Salomon', en: 'Wisdom', es: 'Sabiduría', chapters: 19, cat: 'Livres Sapientiaux' },
    { id: 'Ecclesiasticus', la: 'Ecclesiasticus', fr: 'Siracide (Ecclésiastique)', en: 'Sirach', es: 'Sirácida', chapters: 51, cat: 'Livres Sapientiaux' },

    // Grands Prophètes
    { id: 'Isaias', la: 'Isaias', fr: 'Isaïe', en: 'Isaiah', es: 'Isaías', chapters: 66, cat: 'Grands Prophètes' },
    { id: 'Jeremias', la: 'Jeremias', fr: 'Jérémie', en: 'Jeremiah', es: 'Jeremías', chapters: 52, cat: 'Grands Prophètes' },
    { id: 'Lamentationes', la: 'Lamentationes', fr: 'Lamentations', en: 'Lamentations', es: 'Lamentaciones', chapters: 5, cat: 'Grands Prophètes' },
    { id: 'Baruch', la: 'Baruch', fr: 'Baruch', en: 'Baruch', es: 'Baruc', chapters: 6, cat: 'Grands Prophètes' },
    { id: 'Ezechiel', la: 'Ezechiel', fr: 'Ézéchiel', en: 'Ezekiel', es: 'Ezequiel', chapters: 48, cat: 'Grands Prophètes' },
    { id: 'Daniel', la: 'Daniel', fr: 'Daniel', en: 'Daniel', es: 'Daniel', chapters: 14, cat: 'Grands Prophètes' },

    // Petits Prophètes
    { id: 'Osee', la: 'Osee', fr: 'Osée', en: 'Hosea', es: 'Oseas', chapters: 14, cat: 'Petits Prophètes' },
    { id: 'Joel', la: 'Joel', fr: 'Joël', en: 'Joel', es: 'Joel', chapters: 3, cat: 'Petits Prophètes' },
    { id: 'Amos', la: 'Amos', fr: 'Amos', en: 'Amos', es: 'Amós', chapters: 9, cat: 'Petits Prophètes' },
    { id: 'Abdias', la: 'Abdias', fr: 'Abdias', en: 'Obadiah', es: 'Abdías', chapters: 1, cat: 'Petits Prophètes' },
    { id: 'Jonas', la: 'Jonas', fr: 'Jonas', en: 'Jonah', es: 'Jonás', chapters: 4, cat: 'Petits Prophètes' },
    { id: 'Michæa', la: 'Michæas', fr: 'Michée', en: 'Micah', es: 'Miqueas', chapters: 7, cat: 'Petits Prophètes' },
    { id: 'Nahum', la: 'Nahum', fr: 'Nahum', en: 'Nahum', es: 'Nahúm', chapters: 3, cat: 'Petits Prophètes' },
    { id: 'Habacuc', la: 'Habacuc', fr: 'Habacuc', en: 'Habakkuk', es: 'Habacuc', chapters: 3, cat: 'Petits Prophètes' },
    { id: 'Sophonias', la: 'Sophonias', fr: 'Sophonie', en: 'Zephaniah', es: 'Sofonías', chapters: 3, cat: 'Petits Prophètes' },
    { id: 'Aggæus', la: 'Aggæus', fr: 'Aggée', en: 'Haggai', es: 'Ageo', chapters: 2, cat: 'Petits Prophètes' },
    { id: 'Zacharias', la: 'Zacharias', fr: 'Zacharie', en: 'Zechariah', es: 'Zacarías', chapters: 14, cat: 'Petits Prophètes' },
    { id: 'Malachias', la: 'Malachias', fr: 'Malachie', en: 'Malachi', es: 'Malaquías', chapters: 4, cat: 'Petits Prophètes' },

    // Évangiles & Actes
    { id: 'Matthæus', la: 'Evangelium secundum Matthæum', fr: 'Évangile selon saint Matthieu', en: 'Gospel of Matthew', es: 'Evangelio según San Mateo', chapters: 28, cat: 'Évangiles & Actes' },
    { id: 'Marcus', la: 'Evangelium secundum Marcum', fr: 'Évangile selon saint Marc', en: 'Gospel of Mark', es: 'Evangelio según San Marcos', chapters: 16, cat: 'Évangiles & Actes' },
    { id: 'Lucas', la: 'Evangelium secundum Lucam', fr: 'Évangile selon saint Luc', en: 'Gospel of Luke', es: 'Evangelio selon San Lucas', chapters: 24, cat: 'Évangiles & Actes' },
    { id: 'Joannes', la: 'Evangelium secundum Joannem', fr: 'Évangile selon saint Jean', en: 'Gospel of John', es: 'Evangelio según San Juan', chapters: 21, cat: 'Évangiles & Actes' },
    { id: 'Actus Apostolorum', la: 'Actus Apostolorum', fr: 'Actes des Apôtres', en: 'Acts of the Apostles', es: 'Hechos de los Apóstoles', chapters: 28, cat: 'Évangiles & Actes' },

    // Épîtres de saint Paul
    { id: 'Ad Romanos', la: 'Ad Romanos', fr: 'Aux Romains', en: 'Romans', es: 'Romanos', chapters: 16, cat: 'Épîtres de saint Paul' },
    { id: 'Ad Corinthios 1', la: '1 ad Corinthios', fr: '1 Corinthiens', en: '1 Corinthians', es: '1 Corintios', chapters: 16, cat: 'Épîtres de saint Paul' },
    { id: 'Ad Corinthios 2', la: '2 ad Corinthios', fr: '2 Corinthiens', en: '2 Corinthians', es: '2 Corintios', chapters: 13, cat: 'Épîtres de saint Paul' },
    { id: 'Ad Galatas', la: 'Ad Galatas', fr: 'Aux Galates', en: 'Galatians', es: 'Gálatas', chapters: 6, cat: 'Épîtres de saint Paul' },
    { id: 'Ad Ephesios', la: 'Ad Ephesios', fr: 'Aux Éphésiens', en: 'Ephesians', es: 'Efesios', chapters: 6, cat: 'Épîtres de saint Paul' },
    { id: 'Ad Philippenses', la: 'Ad Philippenses', fr: 'Aux Philippiens', en: 'Philippians', es: 'Filipenses', chapters: 4, cat: 'Épîtres de saint Paul' },
    { id: 'Ad Colossenses', la: 'Ad Colossenses', fr: 'Aux Colossiens', en: 'Colossians', es: 'Colosenses', chapters: 4, cat: 'Épîtres de saint Paul' },
    { id: 'Ad Thessalonicenses 1', la: '1 ad Thessalonicenses', fr: '1 Thessaloniciens', en: '1 Thessalonians', es: '1 Tesalonicenses', chapters: 5, cat: 'Épîtres de saint Paul' },
    { id: 'Ad Thessalonicenses 2', la: '2 ad Thessalonicenses', fr: '2 Thessaloniciens', en: '2 Thessalonians', es: '2 Tesalonicenses', chapters: 3, cat: 'Épîtres de saint Paul' },
    { id: 'Ad Timotheum 1', la: '1 ad Timotheum', fr: '1 Timothée', en: '1 Timothy', es: '1 Timoteo', chapters: 6, cat: 'Épîtres de saint Paul' },
    { id: 'Ad Timotheum 2', la: '2 ad Timotheum', fr: '2 Timothy', en: '2 Timothy', es: '2 Timoteo', chapters: 4, cat: 'Épîtres de saint Paul' },
    { id: 'Ad Titum', la: 'Ad Titum', fr: 'À Tite', en: 'Titus', es: 'Tito', chapters: 3, cat: 'Épîtres de saint Paul' },
    { id: 'Ad Philemonem', la: 'Ad Philemonem', fr: 'À Philémon', en: 'Philemon', es: 'Filemón', chapters: 1, cat: 'Épîtres de saint Paul' },
    { id: 'Ad Hebræos', la: 'Ad Hebræos', fr: 'Aux Hébreux', en: 'Hebrews', es: 'Hebreos', chapters: 13, cat: 'Épîtres de saint Paul' },

    // Épîtres Catholiques & Apocalypse
    { id: 'Jacobi', la: 'Epistola Jacobi', fr: 'Épître de saint Jacques', en: 'James', es: 'Santiago', chapters: 5, cat: 'Épîtres Catholiques' },
    { id: 'Petri 1', la: '1 Petri', fr: '1 Pierre', en: '1 Peter', es: '1 Pedro', chapters: 5, cat: 'Épîtres Catholiques' },
    { id: 'Petri 2', la: '2 Petri', fr: '2 Pierre', en: '2 Peter', es: '2 Pedro', chapters: 3, cat: 'Épîtres Catholiques' },
    { id: 'Joannis 1', la: '1 Joannis', fr: '1 Jean', en: '1 John', es: '1 Juan', chapters: 5, cat: 'Épîtres Catholiques' },
    { id: 'Joannis 2', la: '2 Joannis', fr: '2 Jean', en: '2 John', es: '2 Juan', chapters: 1, cat: 'Épîtres Catholiques' },
    { id: 'Joannis 3', la: '3 Joannis', fr: '3 Jean', en: '3 John', es: '3 Juan', chapters: 1, cat: 'Épîtres Catholiques' },
    { id: 'Judæ', la: 'Epistola Judæ', fr: 'Épître de saint Jude', en: 'Jude', es: 'Judas', chapters: 1, cat: 'Épîtres Catholiques' },
    { id: 'Apocalypsis', la: 'Apocalypsis Joannis', fr: 'Apocalypse de saint Jean', en: 'Revelation', es: 'Apocalipsis', chapters: 22, cat: 'Apocalypse' }
];

var BIBLE_BOOK_ALIASES = {
    'matt': 'Matthæus',
    'matth': 'Matthæus',
    'matthieu': 'Matthæus',
    'matthew': 'Matthæus',
    'mattheus': 'Matthæus',
    'matthæus': 'Matthæus',
    'mt': 'Matthæus',
    'marc': 'Marcus',
    'mark': 'Marcus',
    'marcus': 'Marcus',
    'mc': 'Marcus',
    'luc': 'Lucas',
    'luke': 'Lucas',
    'lucas': 'Lucas',
    'lc': 'Lucas',
    'jean': 'Joannes',
    'john': 'Joannes',
    'joannes': 'Joannes',
    'johannes': 'Joannes',
    'jn': 'Joannes',
    'actes': 'Actus Apostolorum',
    'acts': 'Actus Apostolorum',
    'actus': 'Actus Apostolorum',
    'romains': 'Ad Romanos',
    'romans': 'Ad Romanos',
    'romanos': 'Ad Romanos',
    'rm': 'Ad Romanos',
    '1 corinthiens': 'Ad Corinthios 1',
    '1 corinthians': 'Ad Corinthios 1',
    '1 cor': 'Ad Corinthios 1',
    '2 corinthiens': 'Ad Corinthios 2',
    '2 corinthians': 'Ad Corinthios 2',
    '2 cor': 'Ad Corinthios 2',
    'galates': 'Ad Galatas',
    'galatians': 'Ad Galatas',
    'ephesiens': 'Ad Ephesios',
    'ephesians': 'Ad Ephesios',
    'philippiens': 'Ad Philippenses',
    'philippians': 'Ad Philippenses',
    'colossiens': 'Ad Colossenses',
    'colossians': 'Ad Colossenses',
    '1 thessaloniciens': 'Ad Thessalonicenses 1',
    '2 thessaloniciens': 'Ad Thessalonicenses 2',
    '1 timothee': 'Ad Timotheum 1',
    '2 timothee': 'Ad Timotheum 2',
    'tite': 'Ad Titum',
    'titus': 'Ad Titum',
    'philemon': 'Ad Philemonem',
    'hebreux': 'Ad Hebræos',
    'hebrews': 'Ad Hebræos',
    'hebraeos': 'Ad Hebræos',
    'jacques': 'Jacobi',
    'james': 'Jacobi',
    '1 pierre': 'Petri 1',
    '1 peter': 'Petri 1',
    '2 pierre': 'Petri 2',
    '2 peter': 'Petri 2',
    '1 jean': 'Joannis 1',
    '2 jean': 'Joannis 2',
    '3 jean': 'Joannis 3',
    'jude': 'Judæ',
    'judas': 'Judæ',
    'apocalypse': 'Apocalypsis',
    'revelation': 'Apocalypsis',
    'genese': 'Genesis',
    'genesis': 'Genesis',
    'exode': 'Exodus',
    'exodus': 'Exodus',
    'levitique': 'Leviticus',
    'nombres': 'Numeri',
    'deuteronome': 'Deuteronomium',
    'psaumes': 'Psalmi',
    'psalms': 'Psalmi',
    'proverbes': 'Proverbia',
    'proverbs': 'Proverbia',
    'isaie': 'Isaias',
    'isaias': 'Isaias',
    'isaiah': 'Isaias',
    'jeremie': 'Jeremias',
    'jeremias': 'Jeremias',
    'jeremiah': 'Jeremias'
};

function normalizeBibleBookId(input) {
    if (!input || typeof input !== 'string') return 'Genesis';
    var clean = input.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (BIBLE_BOOK_ALIASES[clean]) return BIBLE_BOOK_ALIASES[clean];

    var direct = DO_BIBLE_BOOKS.find(function(b) {
        return b.id.toLowerCase() === input.trim().toLowerCase() ||
               (b.la && b.la.toLowerCase() === input.trim().toLowerCase()) ||
               (b.fr && b.fr.toLowerCase() === input.trim().toLowerCase()) ||
               (b.en && b.en.toLowerCase() === input.trim().toLowerCase()) ||
               (b.es && b.es.toLowerCase() === input.trim().toLowerCase());
    });
    if (direct) return direct.id;

    var normMatch = DO_BIBLE_BOOKS.find(function(b) {
        var bIdClean = b.id.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        var bFrClean = (b.fr || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        var bLaClean = (b.la || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return bIdClean === clean || bFrClean === clean || bLaClean === clean;
    });
    if (normMatch) return normMatch.id;

    var partial = DO_BIBLE_BOOKS.find(function(b) {
        var bIdClean = b.id.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        var bFrClean = (b.fr || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        return bIdClean.indexOf(clean) === 0 || bFrClean.indexOf(clean) === 0;
    });
    if (partial) return partial.id;

    var valid = DO_BIBLE_BOOKS.find(function(b) { return b.id === input; });
    return valid ? valid.id : 'Genesis';
}

if (doState.bible && doState.bible.book) {
    doState.bible.book = normalizeBibleBookId(doState.bible.book);
}

/* =========================================================================
   OremusRouter — URL State Synchronization & Deep Linking Engine
   Synchronisation automatique des arguments HTML (URL query & history state)
   sans rechargement de page (SPA replaceState / pushState / popstate).
   ========================================================================= */
var OremusRouter = window.OremusRouter = {
    _isHandlingPopState: false,
    _lastSerializedState: '',
    _debounceSyncTimer: null,

    // Normaliser une chaîne de date ISO (ex: YYYY-MM-DD) ou 'today' / 'yesterday' / 'tomorrow'
    parseDateParam: function(val) {
        if (!val) return null;
        val = String(val).trim().toLowerCase();
        if (val === 'today' || val === 'hodie') return moment();
        if (val === 'yesterday' || val === 'heri') return moment().subtract(1, 'day');
        if (val === 'tomorrow' || val === 'cras') return moment().add(1, 'day');
        var m = moment(val, ['YYYY-MM-DD', 'YYYY/MM/DD', 'DD-MM-YYYY', 'DD/MM/YYYY', 'YYYYMMDD'], true);
        if (m.isValid()) return m;
        m = moment(val);
        return m.isValid() ? m : null;
    },

    // Extraire et parser les paramètres depuis search (ou hash)
    getParams: function(urlSearchOrHash) {
        var src = (typeof urlSearchOrHash === 'string') 
            ? urlSearchOrHash 
            : (window.location.search || window.location.hash || '');
        
        if (src.indexOf('?') === 0 || src.indexOf('#') === 0) {
            src = src.substring(1);
        }

        var params = {};
        if (!src) return params;

        var pairs = src.replace(/#/g, '&').split('&');
        for (var i = 0; i < pairs.length; i++) {
            var pair = pairs[i];
            if (!pair) continue;
            var eqIdx = pair.indexOf('=');
            var k = '', v = '';
            if (eqIdx >= 0) {
                k = decodeURIComponent(pair.substring(0, eqIdx).replace(/\+/g, ' ')).trim();
                v = decodeURIComponent(pair.substring(eqIdx + 1).replace(/\+/g, ' ')).trim();
            } else {
                k = decodeURIComponent(pair.replace(/\+/g, ' ')).trim();
                v = 'true';
            }
            if (k) {
                params[k] = v;
            }
        }
        return params;
    },

    // Construire une URL query string propre et élégante à partir de l'état
    buildQueryString: function(stateOverride) {
        var st = stateOverride || window.doState;
        if (!st) return '';

        var q = new URLSearchParams();

        // 1. Date (si ce n'est pas aujourd'hui ou si précisé)
        if (st.date && moment.isMoment(st.date)) {
            var curDateStr = st.date.format('YYYY-MM-DD');
            var todayStr = moment().format('YYYY-MM-DD');
            if (curDateStr !== todayStr || (st.hora && st.hora !== 'home' && st.hora !== 'bible' && st.hora !== 'gregorian_search')) {
                q.set('date', curDateStr);
            }
        }

        // 2. Hora / Catégorie
        var hora = st.hora || 'home';
        if (hora !== 'home') {
            q.set('hora', hora);
        }

        // 3. Fête / Propre spécifique
        if (st.officiumKey) {
            q.set('key', st.officiumKey);
        } else if (st.testFeastKey) {
            q.set('test', st.testFeastKey);
        }

        // 4. Sacra Biblia
        if (hora === 'bible' && st.bible) {
            var bk = st.bible.book || 'Genesis';
            var ch = st.bible.chapter || 1;
            var pg = st.bible.page || 1;
            var ps = st.bible.pageSize || '15';
            
            // Format concis : bible=Genesis:1:1
            if (pg > 1) {
                q.set('bible', bk + ':' + ch + ':' + pg);
            } else if (ch > 1 || bk !== 'Genesis') {
                q.set('bible', bk + ':' + ch);
            } else {
                q.set('bible', bk);
            }

            if (ps && ps !== '15') {
                q.set('vpp', String(ps));
            }
        }

        // 5. Recherche Grégorienne / Universelle
        if (hora === 'gregorian_search') {
            if (window.gregorianSearchUI && typeof window.gregorianSearchUI.getState === 'function') {
                var searchState = window.gregorianSearchUI.getState();
                if (searchState.query) q.set('q', searchState.query);
                if (searchState.part) q.set('part', searchState.part);
                if (searchState.mode) q.set('mode', String(searchState.mode));
                if (searchState.view && searchState.view !== 'grid') q.set('view', searchState.view);
            }
        }

        // 6. Chant Grégorien plein écran
        if (hora === 'gregorian_chant') {
            var chantId = st.currentChantId || localStorage.getItem('do_chant_id');
            if (chantId) {
                q.set('chant', chantId);
            }
        }

        // 7. Options liturgiques & Traductions
        if (st.edition && st.edition !== '1960') {
            q.set('ed', st.edition);
        }
        if (st.vernacularLang && st.vernacularLang !== 'fr') {
            q.set('lang', st.vernacularLang);
        }
        if (st.showLatin === false) {
            q.set('latin', '0');
        }
        if (st.includeOrdinarium === true) {
            q.set('ord', '1');
        }
        if (st.includeGregorian === false) {
            q.set('greg', '0');
        }
        if (st.selectedKyriale && st.selectedKyriale !== 'auto') {
            q.set('kyr', st.selectedKyriale);
        }

        var res = q.toString();
        return res ? ('?' + res) : '';
    },

    // Synchroniser l'état vers l'URL (sans rechargement)
    syncUrl: function(options) {
        if (OremusRouter._isHandlingPopState) return;

        options = options || {};
        var isPush = !!options.push;
        var debounceMs = (options.debounce !== undefined) ? options.debounce : 0;

        if (debounceMs > 0) {
            clearTimeout(OremusRouter._debounceSyncTimer);
            OremusRouter._debounceSyncTimer = setTimeout(function() {
                OremusRouter._executeSyncUrl(isPush);
            }, debounceMs);
        } else {
            OremusRouter._executeSyncUrl(isPush);
        }
    },

    _executeSyncUrl: function(isPush) {
        var newQuery = OremusRouter.buildQueryString();
        var currentUrl = window.location.pathname + window.location.search + window.location.hash;
        var targetUrl = window.location.pathname + (newQuery || '');

        if (newQuery === OremusRouter._lastSerializedState && currentUrl === targetUrl) {
            return;
        }

        OremusRouter._lastSerializedState = newQuery;

        try {
            var stateObj = {
                oremus: true,
                hora: doState.hora,
                date: doState.date ? doState.date.format('YYYY-MM-DD') : null,
                officiumKey: doState.officiumKey,
                bible: doState.bible ? { book: doState.bible.book, chapter: doState.bible.chapter, page: doState.bible.page } : null,
                ts: Date.now()
            };

            if (isPush) {
                window.history.pushState(stateObj, '', targetUrl);
            } else {
                window.history.replaceState(stateObj, '', targetUrl);
            }
        } catch (e) {
            console.warn('[OremusRouter] history state sync error:', e);
        }

        OremusRouter.updateDocumentTitle();
    },

    // Mettre à jour dynamiquement le titre de la page <title>
    updateDocumentTitle: function() {
        var uiLang = getUiLang();
        var hora = doState.hora;
        var title = 'Oremus';

        if (hora === 'home') {
            title = 'Oremus • Divinum Officium & Missale Romanum';
        } else if (hora === 'bible') {
            var bkId = doState.bible.book || 'Genesis';
            var bkObj = (typeof DO_BIBLE_BOOKS !== 'undefined') ? (DO_BIBLE_BOOKS.find(function(b) { return b.id === bkId; }) || DO_BIBLE_BOOKS[0]) : { id: bkId };
            var bkTitle = (uiLang === 'la' ? bkObj.la : (bkObj[uiLang] || bkObj.fr || bkObj.la)) || bkObj.id;
            title = bkTitle + ' ' + (doState.bible.chapter || 1) + ' • Sacra Biblia — Oremus';
        } else if (hora === 'gregorian_search') {
            var q = '';
            if (window.gregorianSearchUI && typeof window.gregorianSearchUI.getState === 'function') {
                q = window.gregorianSearchUI.getState().query;
            }
            title = q ? ('« ' + q + ' » • Recherche — Oremus') : 'Recherche Grégorienne — Oremus';
        } else if (hora === 'gregorian_chant') {
            var chantTitle = $('#doHeaderTitle .title-text').text() || ('Chant #' + doState.currentChantId);
            title = chantTitle + ' • Cantus Gregorianus — Oremus';
        } else {
            var horaMap = DO_HORA_TITLES_BY_LANG[uiLang] || DO_HORA_TITLES_BY_LANG['fr'] || DO_HORA_TITLES_BY_LANG['la'];
            var horaLabel = horaMap[hora] || hora;
            var dateFormatted = formatLiturgicalDate(doState.date, uiLang);
            title = horaLabel + ' • ' + dateFormatted + ' — Oremus';
        }

        document.title = title;
    },

    // Charger l'état depuis l'URL actuelle
    loadFromUrl: function(urlSearchOrHash, options) {
        options = options || {};
        var params = OremusRouter.getParams(urlSearchOrHash);
        var hasExplicitParams = Object.keys(params).length > 0;

        if (!hasExplicitParams) {
            OremusRouter.syncUrl({ push: false });
            return false;
        }

        // 1. Date
        var dateVal = params.date || params.d;
        if (dateVal) {
            var parsedDate = OremusRouter.parseDateParam(dateVal);
            if (parsedDate && parsedDate.isValid()) {
                doState.date = parsedDate;
                $('#doDateInput').val(doState.date.format('YYYY-MM-DD'));
            }
        }

        // 2. Hora / Catégorie
        var horaVal = params.hora || params.h || params.cat || params.office;
        if (horaVal) {
            horaVal = String(horaVal).trim().toLowerCase();
            var validHorae = [
                'home', 'missa', 'missa_gregorian', 'matutinum', 'laudes', 
                'prima', 'tertia', 'sexta', 'nona', 'vesperae', 'completorium', 
                'bible', 'gregorian_search', 'gregorian_chant', 'search', 'chant'
            ];
            if (horaVal === 'search') horaVal = 'gregorian_search';
            if (horaVal === 'chant') horaVal = 'gregorian_chant';
            if (validHorae.indexOf(horaVal) >= 0) {
                doState.hora = horaVal;
                localStorage.setItem('do_hora', horaVal);
            }
        }

        // 3. Fête / Propre
        var keyVal = params.key || params.sancti || params.tempora || params.festum;
        if (keyVal) {
            doState.officiumKey = keyVal;
            localStorage.setItem('do_officiumKey', keyVal);
        } else if (params.hora && params.hora !== 'missa_gregorian') {
            doState.officiumKey = null;
            localStorage.removeItem('do_officiumKey');
        }

        var testVal = params.test || params.testFeastKey;
        if (testVal) {
            doState.testFeastKey = testVal;
        }

        // 4. Sacra Biblia
        var bibleVal = params.bible || params.book || params.bk;
        if (bibleVal || doState.hora === 'bible') {
            if (bibleVal) {
                var bParts = String(bibleVal).split(/[:\/\.]/);
                var rawBk = bParts[0] || 'Genesis';
                var normBk = (typeof normalizeBibleBookId === 'function') ? normalizeBibleBookId(rawBk) : rawBk;
                doState.bible.book = normBk;
                localStorage.setItem('do_bible_book', normBk);

                if (bParts.length > 1) {
                    var chNum = parseInt(bParts[1], 10);
                    if (!isNaN(chNum) && chNum > 0) {
                        doState.bible.chapter = chNum;
                        localStorage.setItem('do_bible_chapter', chNum);
                    }
                } else if (params.chapter || params.ch || params.cap) {
                    var chNum2 = parseInt(params.chapter || params.ch || params.cap, 10);
                    if (!isNaN(chNum2) && chNum2 > 0) {
                        doState.bible.chapter = chNum2;
                        localStorage.setItem('do_bible_chapter', chNum2);
                    }
                }

                if (bParts.length > 2) {
                    var pgNum = parseInt(bParts[2], 10);
                    if (!isNaN(pgNum) && pgNum > 0) {
                        doState.bible.page = pgNum;
                        localStorage.setItem('do_bible_page', pgNum);
                    }
                } else if (params.page || params.pg || params.p) {
                    var pgNum2 = parseInt(params.page || params.pg || params.p, 10);
                    if (!isNaN(pgNum2) && pgNum2 > 0) {
                        doState.bible.page = pgNum2;
                        localStorage.setItem('do_bible_page', pgNum2);
                    }
                }
            }

            var vppVal = params.vpp || params.pageSize || params.limit;
            if (vppVal) {
                doState.bible.pageSize = (vppVal === 'all') ? 'all' : (parseInt(vppVal, 10) || 15);
                localStorage.setItem('do_bible_pageSize', vppVal);
            }
        }

        // 5. Recherche Grégorienne
        var queryVal = params.q || params.query || params.search;
        var partVal = params.part || params.office_part;
        var modeVal = params.mode;
        var viewVal = params.view;

        if (queryVal !== undefined || partVal || modeVal || viewVal) {
            if (window.gregorianSearchUI && typeof window.gregorianSearchUI.setState === 'function') {
                window.gregorianSearchUI.setState({
                    query: queryVal || '',
                    part: partVal || '',
                    mode: modeVal || '',
                    view: viewVal || ''
                });
            }
            if (queryVal && doState.hora === 'home') {
                doState.hora = 'gregorian_search';
                localStorage.setItem('do_hora', 'gregorian_search');
            }
        }

        // 6. Chant Grégorien
        var chantVal = params.chant || params.id || params.chantId;
        if (chantVal) {
            doState.currentChantId = chantVal;
            doState.hora = 'gregorian_chant';
            localStorage.setItem('do_hora', 'gregorian_chant');
            localStorage.setItem('do_chant_id', chantVal);
        }

        // 7. Options liturgiques & Langue
        var langVal = params.lang || params.vernacular;
        if (langVal) {
            doState.vernacularLang = langVal;
            localStorage.setItem('do_vernacular_lang', langVal);
        }

        var edVal = params.ed || params.edition || params.rubrics;
        if (edVal) {
            doState.edition = edVal;
            localStorage.setItem('do_edition', edVal);
        }

        var latVal = params.latin || params.la;
        if (latVal !== undefined) {
            doState.showLatin = (latVal === '1' || latVal === 'true');
            localStorage.setItem('do_show_latin', doState.showLatin);
        }

        var ordVal = params.ord || params.ordinarium;
        if (ordVal !== undefined) {
            doState.includeOrdinarium = (ordVal === '1' || ordVal === 'true');
            localStorage.setItem('do_ordinarium', doState.includeOrdinarium);
        }

        var gregVal = params.greg || params.gregorian || params.cantus;
        if (gregVal !== undefined) {
            doState.includeGregorian = (gregVal === '1' || gregVal === 'true');
            localStorage.setItem('do_include_gregorian', doState.includeGregorian);
        }

        var kyrVal = params.kyr || params.kyriale;
        if (kyrVal) {
            doState.selectedKyriale = kyrVal;
            localStorage.setItem('do_selected_kyriale', kyrVal);
        }

        return true;
    },

    // Gestion du bouton Retour / Suivant du navigateur (popstate)
    handlePopState: function(event) {
        OremusRouter._isHandlingPopState = true;
        try {
            if (typeof closeModals === 'function') closeModals();
            if (typeof closeMassTocPanel === 'function') closeMassTocPanel();
            $('#doHoraePicker').addClass('hidden');

            OremusRouter.loadFromUrl(window.location.search || window.location.hash);

            if (typeof renderDO === 'function') {
                renderDO();
            }
        } finally {
            setTimeout(function() {
                OremusRouter._isHandlingPopState = false;
            }, 50);
        }
    },

    // Initialisation au démarrage de l'application
    init: function() {
        OremusRouter.loadFromUrl(window.location.search || window.location.hash);

        window.addEventListener('popstate', OremusRouter.handlePopState);

        window.addEventListener('hashchange', function() {
            if (window.location.hash) {
                OremusRouter.handlePopState();
            }
        });
    },

    // Générer une URL de partage absolue pour l'état actuel
    getShareableUrl: function() {
        var base = window.location.origin + window.location.pathname;
        return base + OremusRouter.buildQueryString();
    }
};

var DO_UI_TRANSLATIONS = {
    fr: {
        app_sub: 'BRÉVIAIRE & MISSEL',
        home: 'Accueil',
        home_tag: 'Hodie & Cursus',
        liturgia_diei: 'Liturgie du Jour',
        cursus_horarum: 'Heures Canoniales',
        sacra_biblia: 'Sacra Biblia',
        sacra_biblia_tag: '',
        missa: 'Sancta Missa',
        missa_tag: '',
        missa_gregorian: 'Missa & Cantus',
        missa_gregorian_tag: '',
        matutinum: 'Matutinum',
        matutinum_tag: '',
        laudes: 'Laudes',
        laudes_tag: '',
        prima: 'Prima',
        prima_tag: '',
        tertia: 'Tertia',
        tertia_tag: '',
        sexta: 'Sexta',
        sexta_tag: '',
        nona: 'Nona',
        nona_tag: '',
        vesperae: 'Vesperæ',
        vesperae_tag: '',
        completorium: 'Completorium',
        completorium_tag: '',
        horae: 'Heures',
        settings_title: 'Paramètres',
        edition_label: 'Rubricæ & Editio',
        content_label: 'Textus & Cantus',
        ordinarium_label: 'Ordinarium Missæ',
        gregorian_label: 'Cantus Gregorianus',
        latin_label: 'Textus Latinus',
        latin_true: 'Latin actif',
        latin_false: 'Sans Latin',
        vernacular_label: 'Translatio Vernacula',
        vernacular_none: 'Aucune traduction',
        theme_label: 'Thema',
        theme_light: 'Diurnum',
        theme_dark: 'Nocturnum',
        theme_oled: 'OLED',
        theme_auto: 'Automaticum',
        color_label: 'Color',
        icon_label: 'Imago applicationis',
        haptics_label: 'Gestus & Haptica',
        updates_label: 'Renovatio Applicationis',
        liturgical_color_sync: 'Couleur selon la journée liturgique',
        officium_modal_title: 'Choisir un Office / une Fête',
        officium_search_placeholder: 'Rechercher une fête ou un office...',
        officium_tab_tempora: 'Temps liturgique',
        officium_tab_sancti: 'Saints & Fêtes',
        date_label: 'Date',
        btn_today: 'Aujourd\'hui',
        close: 'Fermer',
        chapter_prev: 'Page précédente',
        chapter_next: 'Page suivante',
        select_book: 'Livre',
        select_chapter: 'Chapitre'
    },
    la: {
        app_sub: 'BREVIARIUM & MISSALE',
        home: 'Hodie',
        home_tag: 'Tabularium',
        liturgia_diei: 'Liturgia Diei',
        cursus_horarum: 'Cursus Horarum',
        sacra_biblia: 'Sacra Biblia',
        sacra_biblia_tag: 'Vulgata',
        missa: 'Sancta Missa',
        missa_tag: 'Sancta Missa',
        missa_gregorian: 'Missa & Cantus',
        missa_gregorian_tag: 'Experimentum',
        matutinum: 'Matutinum',
        matutinum_tag: 'Vigiliae',
        laudes: 'Laudes',
        laudes_tag: 'Aurora',
        prima: 'Prima',
        prima_tag: 'Hora I',
        tertia: 'Tertia',
        tertia_tag: 'Hora III',
        sexta: 'Sexta',
        sexta_tag: 'Meridies',
        nona: 'Nona',
        nona_tag: 'Hora IX',
        vesperae: 'Vesperæ',
        vesperae_tag: 'Vesperum',
        completorium: 'Completorium',
        completorium_tag: 'Noctis',
        horae: 'Horæ',
        settings_title: 'Optiones',
        edition_label: 'Rubricæ & Editio',
        content_label: 'Textus & Cantus',
        ordinarium_label: 'Ordinarium Missæ',
        gregorian_label: 'Cantus Gregorianus',
        latin_label: 'Textus Latinus',
        latin_true: 'Latina activa',
        latin_false: 'Sine Latina',
        vernacular_label: 'Translatio Vernacula',
        vernacular_none: 'Nulla translatio',
        theme_label: 'Thema',
        theme_light: 'Diurnum',
        theme_dark: 'Nocturnum',
        theme_oled: 'OLED',
        theme_auto: 'Automaticum',
        color_label: 'Color',
        icon_label: 'Imago applicationis',
        haptics_label: 'Gestus & Haptica',
        updates_label: 'Renovatio Applicationis',
        liturgical_color_sync: 'Color secundum diem liturgicum',
        officium_modal_title: 'Officium Elige',
        officium_search_placeholder: 'Quaere officium aut diem...',
        officium_tab_tempora: 'Tempora',
        officium_tab_sancti: 'Sancti',
        date_label: 'Dies',
        btn_today: 'Hodie',
        close: 'Claudere',
        chapter_prev: 'Pagina præcedens',
        chapter_next: 'Pagina sequens',
        select_book: 'Liber',
        select_chapter: 'Capitulum'
    },
    en: {
        app_sub: 'BREVIARY & MISSAL',
        liturgia_diei: 'Liturgy of the Day',
        cursus_horarum: 'Canonical Hours',
        sacra_biblia: 'Holy Bible',
        sacra_biblia_tag: 'Vulgate & Douay-Rheims',
        missa: 'Mass',
        missa_tag: 'Holy Mass',
        missa_gregorian: 'Mass & Chant',
        missa_gregorian_tag: 'Test Page',
        matutinum: 'Matins',
        matutinum_tag: 'Vigils',
        laudes: 'Lauds',
        laudes_tag: 'Dawn',
        prima: 'Prime',
        prima_tag: '1st Hour',
        tertia: 'Terce',
        tertia_tag: '3rd Hour',
        sexta: 'Sext',
        nona: 'None',
        nona_tag: '9th Hour',
        vesperae: 'Vespers',
        vesperae_tag: 'Evening',
        completorium: 'Compline',
        completorium_tag: 'Night',
        horae: 'Hours',
        settings_title: 'Settings',
        edition_label: 'Rubricæ & Editio',
        content_label: 'Textus & Cantus',
        ordinarium_label: 'Ordinarium Missæ',
        gregorian_label: 'Cantus Gregorianus',
        latin_label: 'Textus Latinus',
        latin_true: 'Latin active',
        latin_false: 'Without Latin',
        vernacular_label: 'Translatio Vernacula',
        vernacular_none: 'No translation',
        theme_label: 'Thema',
        theme_light: 'Diurnum',
        theme_dark: 'Nocturnum',
        theme_oled: 'OLED',
        theme_auto: 'Automaticum',
        color_label: 'Color',
        icon_label: 'Imago applicationis',
        haptics_label: 'Gestus & Haptica',
        updates_label: 'Renovatio Applicationis',
        liturgical_color_sync: 'Color by liturgical day',
        officium_modal_title: 'Select Office / Feast',
        officium_search_placeholder: 'Search a feast or office...',
        officium_tab_tempora: 'Proper of Seasons',
        officium_tab_sancti: 'Proper of Saints',
        date_label: 'Date',
        btn_today: 'Today',
        close: 'Close',
        chapter_prev: 'Previous Page',
        chapter_next: 'Next Page',
        select_book: 'Book',
        select_chapter: 'Chapter'
    },
    es: {
        app_sub: 'BREVIARIO Y MISAL',
        liturgia_diei: 'Liturgia del Día',
        cursus_horarum: 'Horas Canónicas',
        sacra_biblia: 'Santa Biblia',
        sacra_biblia_tag: 'Vulgata',
        missa: 'Misa',
        missa_tag: 'Santa Misa',
        missa_gregorian: 'Misa y Canto',
        missa_gregorian_tag: 'Página de Prueba',
        matutinum: 'Maitines',
        matutinum_tag: 'Vigilias',
        laudes: 'Laudes',
        laudes_tag: 'Aurora',
        prima: 'Prima',
        prima_tag: '1ª Hora',
        tertia: 'Tercia',
        tertia_tag: '3ª Hora',
        sexta: 'Sexta',
        sexta_tag: 'Mediodía',
        nona: 'Nona',
        nona_tag: '9ª Hora',
        vesperae: 'Vísperas',
        vesperae_tag: 'Tarde',
        completorium: 'Completas',
        completorium_tag: 'Noche',
        horae: 'Horas',
        settings_title: 'Ajustes',
        edition_label: 'Rubricæ & Editio',
        content_label: 'Textus & Cantus',
        ordinarium_label: 'Ordinarium Missæ',
        gregorian_label: 'Cantus Gregorianus',
        latin_label: 'Textus Latinus',
        latin_true: 'Latín activo',
        latin_false: 'Sin Latín',
        vernacular_label: 'Translatio Vernacula',
        vernacular_none: 'Sin traducción',
        theme_label: 'Thema',
        theme_light: 'Diurnum',
        theme_dark: 'Nocturnum',
        theme_oled: 'OLED',
        theme_auto: 'Automaticum',
        color_label: 'Color',
        icon_label: 'Imago applicationis',
        haptics_label: 'Gestus & Haptica',
        updates_label: 'Renovatio Applicationis',
        liturgical_color_sync: 'Color según el día litúrgico',
        officium_modal_title: 'Seleccionar Oficio / Fiesta',
        officium_search_placeholder: 'Buscar una fiesta u oficio...',
        officium_tab_tempora: 'Tiempo Litúrgico',
        officium_tab_sancti: 'Santoral',
        date_label: 'Fecha',
        btn_today: 'Hoy',
        close: 'Cerrar',
        chapter_prev: 'Página anterior',
        chapter_next: 'Página siguiente',
        select_book: 'Libro',
        select_chapter: 'Capítulo'
    }
};
var DO_TRANSLATIONS = window.DO_TRANSLATIONS = DO_UI_TRANSLATIONS;

function updateUiLanguage() {
    var lang = (doState.vernacularLang && doState.vernacularLang !== 'none') ? doState.vernacularLang : 'la';
    var t = DO_UI_TRANSLATIONS[lang] || DO_UI_TRANSLATIONS.la || DO_UI_TRANSLATIONS.fr;

    // Header & Subtitle
    $('.do-brand-sub').text(t.app_sub);

    // Sidebar items
    $('#btnNavHome .do-nav-label').text(t.liturgia_diei);
    $('#btnNavCursus .do-nav-label').text(t.cursus_horarum);
    $('.do-nav-item[data-hora="missa"] .do-nav-label').text(t.missa);
    $('.do-nav-item[data-hora="missa"] .do-nav-tag').text(t.missa_tag);
    $('.do-nav-item[data-hora="missa_gregorian"] .do-nav-label').text(t.missa_gregorian);
    $('.do-nav-item[data-hora="missa_gregorian"] .do-nav-tag').text(t.missa_gregorian_tag);
    $('.do-nav-item[data-hora="matutinum"] .do-nav-label').text(t.matutinum);
    $('.do-nav-item[data-hora="matutinum"] .do-nav-tag').text(t.matutinum_tag);
    $('.do-nav-item[data-hora="laudes"] .do-nav-label').text(t.laudes);
    $('.do-nav-item[data-hora="laudes"] .do-nav-tag').text(t.laudes_tag);
    $('.do-nav-item[data-hora="prima"] .do-nav-label').text(t.prima);
    $('.do-nav-item[data-hora="prima"] .do-nav-tag').text(t.prima_tag);
    $('.do-nav-item[data-hora="tertia"] .do-nav-label').text(t.tertia);
    $('.do-nav-item[data-hora="tertia"] .do-nav-tag').text(t.tertia_tag);
    $('.do-nav-item[data-hora="sexta"] .do-nav-label').text(t.sexta);
    $('.do-nav-item[data-hora="sexta"] .do-nav-tag').text(t.sexta_tag);
    $('.do-nav-item[data-hora="nona"] .do-nav-label').text(t.nona);
    $('.do-nav-item[data-hora="nona"] .do-nav-tag').text(t.nona_tag);
    $('.do-nav-item[data-hora="vesperae"] .do-nav-label').html(t.vesperae);
    $('.do-nav-item[data-hora="vesperae"] .do-nav-tag').text(t.vesperae_tag);
    $('.do-nav-item[data-hora="completorium"] .do-nav-label').text(t.completorium);
    $('.do-nav-item[data-hora="completorium"] .do-nav-tag').text(t.completorium_tag);

    // Bible Sidebar item
    $('#btnSidebarBible .do-nav-label').text(t.sacra_biblia);
    $('#btnSidebarBible .do-nav-tag').text(t.sacra_biblia_tag);

    // Bottom nav items
    $('.bottom-nav .nav-item[data-hora="matutinum"] span').text(t.matutinum);
    $('.bottom-nav .nav-item[data-hora="laudes"] span').text(t.laudes);
    $('.bottom-nav .nav-item[data-hora="vesperae"] span').html(t.vesperae);
    $('.bottom-nav .nav-item[data-hora="completorium"] span').text(t.completorium);
    $('.bottom-nav .nav-item[data-hora="horae"] span').html(t.horae);

    // Settings panel labels
    $('#settingsPanel .settings-header h2').text(t.settings_title);
    $('#btnSettingsSidebar span').text(t.settings_title);
    
    // Category Headers in Latin
    $('#labelEditionText').text(t.edition_label || 'Rubricæ & Editio');
    $('#labelContentText').text(t.content_label || 'Textus & Cantus');
    $('#labelOrdinariumText').text(t.ordinarium_label || 'Ordinarium Missæ');
    $('#labelGregorianText').text(t.gregorian_label || 'Cantus Gregorianus');
    $('#labelLatinText').text(t.latin_label || 'Textus Latinus');
    $('#labelVernacularText').text(t.vernacular_label || 'Translatio Vernacula');
    $('#doVernacularOptions .settings-option-card[data-value="none"], #doVernacularOptions .settings-option[data-value="none"]').text(t.vernacular_none);

    // Theme in Settings
    $('#labelThemeText').text(t.theme_label || 'Thema');
    $('#doThemeOptions .settings-option-card[data-value="light"] .theme-name').text(t.theme_light || 'Diurnum');
    $('#doThemeOptions .settings-option-card[data-value="dark"] .theme-name').text(t.theme_dark || 'Nocturnum');
    $('#doThemeOptions .settings-option-card[data-value="oled"] .theme-name').text(t.theme_oled || 'OLED');
    $('#doThemeOptions .settings-option-card[data-value="auto"] .theme-name').text(t.theme_auto || 'Automaticum');
    $('#labelColorText').text(t.color_label || 'Color');
    $('#labelLiturgicalColorText').text(t.liturgical_color_sync);
    $('#labelIconText').text(t.icon_label || 'Imago applicationis');
    $('#labelHapticsText').text(t.haptics_label || 'Gestus & Haptica');
    $('#labelUpdatesText').text(t.updates_label || 'Renovatio Applicationis');

    // Date picker popup
    $('#datePickerPopup .do-date-label').text(t.date_label);
    $('#btnDateToday').text(t.btn_today);
}
var updateUiTranslations = window.updateUiTranslations = updateUiLanguage;

// ---- Standard Liturgical Formulas & Prayers ----
var DO_PRAYER_ENDINGS = {
    '$Per Dominum': {
        la: 'Per Dóminum nostrum Jesum Christum, Fílium tuum: qui tecum vivit et regnat in unitáte Spíritus Sancti Deus, per ómnia sǽcula sæculórum. R. Amen.',
        fr: 'Par notre Seigneur Jésus-Christ, votre Fils, qui vit et règne avec vous en l’unité du Saint-Esprit, Dieu, pour tous les siècles des siècles. R. Amen.',
        en: 'Through our Lord Jesus Christ, your Son, who lives and reigns with you in the unity of the Holy Spirit, God, for ever and ever. R. Amen.',
        es: 'Por nuestro Seigneur Jesucristo, tu Hijo, que contigo vive y reina en la unidad del Espíritu Santo y es Dios, por los siglos de los siglos. R. Amén.'
    },
    '$Qui tecum': {
        la: 'Qui tecum vivit et regnat in unitáte Spíritus Sancti Deus, per ómnia sǽcula sæculórum. R. Amen.',
        fr: 'Lui qui vit et règne avec vous en l’unité du Saint-Esprit, Dieu, pour tous les siècles des siècles. R. Amen.',
        en: 'Who lives and reigns with you in the unity of the Holy Spirit, God, for ever and ever. R. Amen.',
        es: 'Él que contigo vive y reina en la unidad del Espíritu Santo y es Dios, por los siglos de los siglos. R. Amén.'
    },
    '$Qui vivis': {
        la: 'Qui vivis et regnas cum Deo Patre, in unitáte Spíritus Sancti Deus, per ómnia sǽcula sæculórum. R. Amen.',
        fr: 'Vous qui vivez et régnez avec Dieu le Père, en l’unité du Saint-Esprit, Dieu, pour tous les siècles des siècles. R. Amen.',
        en: 'Who live and reign with God the Father, in the unity of the Holy Spirit, God, for ever and ever. R. Amen.',
        es: 'Tú que vives y reinas con Dios Padre en la unidad del Espíritu Santo y eres Dios, por los siglos de los siglos. R. Amén.'
    },
    '$Deo gratias': {
        la: 'R. Deo grátias.',
        fr: 'R. Rendons grâces à Dieu.',
        en: 'R. Thanks be to God.',
        es: 'R. Demos gracias a Dios.'
    },
    '$Amen': {
        la: 'R. Amen.',
        fr: 'R. Ainsi soit-il.',
        en: 'R. Amen.',
        es: 'R. Amén.'
    }
};

var DO_GLORIA_PATRI = {
    la: 'Glória Patri, et Fílio, * et Spirítui Sancto.\nSicut erat in princípio, et nunc, et semper, * et in sǽcula sæculórum. Amen.',
    fr: 'Gloire au Père, et au Fils, * et au Saint-Esprit.\nComme il était au commencement, maintenant et toujours, * et dans les siècles des siècles. Ainsi soit-il.',
    en: 'Glory be to the Father, and to the Son, * and to the Holy Ghost.\nAs it was in the beginning, is now, * and ever shall be, world without end. Amen.',
    es: 'Gloria al Padre, y al Hijo, * y al Espíritu Santo.\nComo era en el principio, ahora y siempre, * por los siglos de los siglos. Amén.'
};

var DO_LITURGY_I18N = {
    incipit_matutinum: {
        la: [
            'V. Dómine, lábia + mea apéries.',
            'R. Et os meum annuntiábit laudem tuam.',
            'V. Deus + in adjutórium meum inténde.',
            'R. Dómine, ad adjuvándum me festína.',
            'Glória Patri, et Fílio, * et Spirítui Sancto.',
            'Sicut erat in princípio, et nunc, et semper, * et in sǽcula sæculórum. Amen.',
            'Allelúia.'
        ],
        fr: [
            'V. Seigneur, + ouvrez mes lèvres.',
            'R. Et ma bouche publiera votre louange.',
            'V. Dieu, + venez à mon aide.',
            'R. Seigneur, hâtez-vous de me secourir.',
            'Gloire au Père, et au Fils, * et au Saint-Esprit.',
            'Comme il était au commencement, maintenant et toujours, * et dans les siècles des siècles. Ainsi soit-il.',
            'Alléluia.'
        ],
        en: [
            'V. O Lord, + open thou my lips.',
            'R. And my mouth shall declare thy praise.',
            'V. O God, + come to my assistance.',
            'R. O Lord, make haste to help me.',
            'Glory be to the Father, and to the Son, * and to the Holy Ghost.',
            'As it was in the beginning, is now, * and ever shall be, world without end. Amen.',
            'Alleluia.'
        ],
        es: [
            'V. Señor, + abre mis labios.',
            'R. Y mi boca proclamará tu alabanza.',
            'V. Dios mío, + ven en mi auxilio.',
            'R. Señor, date prisa en socorrerme.',
            'Gloria al Padre, y al Hijo, * y al Espíritu Santo.',
            'Como era en el principio, ahora y siempre, * por los siglos de los siglos. Amén.',
            'Aleluya.'
        ]
    },
    incipit_day: {
        la: [
            'V. Deus + in adjutórium meum inténde.',
            'R. Dómine, ad adjuvándum me festína.',
            'Glória Patri, et Fílio, * et Spirítui Sancto.',
            'Sicut erat in princípio, et nunc, et semper, * et in sǽcula sæculórum. Amen.',
            'Allelúia.'
        ],
        fr: [
            'V. Dieu, + venez à mon aide.',
            'R. Seigneur, hâtez-vous de me secourir.',
            'Gloire au Père, et au Fils, * et au Saint-Esprit.',
            'Comme il était au commencement, maintenant et toujours, * et dans les siècles des siècles. Ainsi soit-il.',
            'Alléluia.'
        ],
        en: [
            'V. O God, + come to my assistance.',
            'R. O Lord, make haste to help me.',
            'Glory be to the Father, and to the Son, * and to the Holy Ghost.',
            'As it was in the beginning, is now, * and ever shall be, world without end. Amen.',
            'Alleluia.'
        ],
        es: [
            'V. Dios mío, + ven en mi auxilio.',
            'R. Señor, date prisa en socorrerme.',
            'Gloria al Padre, y al Hijo, * y al Espíritu Santo.',
            'Como era en el principio, ahora y siempre, * por los siglos de los siglos. Amén.',
            'Aleluya.'
        ]
    },
    incipit_completorium: {
        la: [
            'V. Jube, domne, benedícere.',
            'Benedíctio. Noctem quiétam et finem perféctum concédat nobis Dóminus omnípotens. R. Amen.'
        ],
        fr: [
            'V. Veuillez, Père, me bénir.',
            'Bénédiction. Que le Seigneur tout-puissant nous accorde une nuit tranquille et une fin parfaite. R. Amen.'
        ],
        en: [
            'V. Pray, Father, give thy blessing.',
            'Blessing. May the Lord Almighty grant us a quiet night and a perfect end. R. Amen.'
        ],
        es: [
            'V. Bendice, Padre.',
            'Bendición. El Señor omnipotente nos conceda una noche tranquila y una santa muerte. R. Amén.'
        ]
    },
    lectio_brevis_comp: {
        la: ['Fratres: Sóbrii estóte, et vigiláte: quia adversárius vester diábolus tamquam leo rúgiens círcuit, quærens quem dévoret: cui resístite fortes in fide.', 'R. Deo grátias.'],
        fr: ['Mes frères : Soyez sobres et veillez, car votre adversaire, le diable, comme un lion rugissant, rôde autour de vous, cherchant qui il pourra dévorer : résistez-lui, forts dans la foi.', 'R. Rendons grâces à Dieu.'],
        en: ['Brethren: Be sober, be vigilant; because your adversary the devil, as a roaring lion, walketh about, seeking whom he may devour: whom resist steadfast in the faith.', 'R. Thanks be to God.'],
        es: ['Hermanos: Sed sobrios y velad, porque vuestro adversario el diablo, como león rugiente, ronda buscando a quien devorar: resistidle firmes en la fe.', 'R. Demos gracias a Dios.']
    },
    preces_comp: {
        la: [
            'V. Adjutórium nostrum + in nómine Dómini.',
            'R. Qui fecit cælum et terram.',
            'Pater noster (secreto)'
        ],
        fr: [
            'V. Notre secours + est dans le nom du Seigneur.',
            'R. Qui a fait le ciel et la terre.',
            'Notre Père (en secret)'
        ],
        en: [
            'V. Our help + is in the name of the Lord.',
            'R. Who made heaven and earth.',
            'Our Father (secretly)'
        ],
        es: [
            'V. Nuestro auxilio + es el nombre del Señor.',
            'R. Que hizo el cielo y la tierra.',
            'Padre nuestro (en secreto)'
        ]
    },
    confiteor: {
        la: [
            'Confíteor Deo omnipoténti, beátæ Maríæ semper Vírgini, beáto Michaéli Archángelo, beáto Joánni Baptístæ, sanctis Apóstolis Petro et Paulo, et ómnibus Sanctis, quia peccávi nimis cogitatióne, verbo et ópere: mea culpa, mea culpa, mea máxima culpa.',
            'Ídeo precor beátam Maríam semper Vírginem, beátum Michaélem Archángelum, beátum Joánnem Baptístam, sanctos Apóstolos Petrum et Paulum, et omnes Sanctos, oráre pro me ad Dóminum Deum nostrum.',
            'Misereátur nostri omnípotens Deus, et dimíssis peccátis nostris, perdúcat nos ad vitam ætérnam. R. Amen.',
            'Indulgéntiam, + absolutiónem et remissiónem peccatórum nostrórum tríbuat nobis omnípotens et miséricors Dóminus. R. Amen.',
            'V. Convérte nos, + Deus, salutáris noster.',
            'R. Et avérte iram tuam a nobis.'
        ],
        fr: [
            'Je confesse à Dieu tout-puissant, à la bienheureuse Marie toujours Vierge, à saint Michel Archange, à saint Jean-Baptiste, aux saints apôtres Pierre et Paul, et à tous les saints, que j\'ai beaucoup péché par pensées, par paroles et par actions : c\'est ma faute, c\'est ma faute, c\'est ma très grande faute.',
            'C\'est pourquoi je supplie la bienheureuse Marie toujours Vierge, saint Michel Archange, saint Jean-Baptiste, les saints apôtres Pierre et Paul, et tous les saints, de prier pour moi le Seigneur notre Dieu.',
            'Que le Dieu tout-puissant nous fasse miséricorde, qu\'Il nous pardonne nos péchés et nous conduise à la vie éternelle. R. Amen.',
            'Que le Seigneur tout-puissant et miséricordieux nous accorde le pardon, + l\'absolution et la rémission de nos péchés. R. Amen.',
            'V. Convertissez-nous, + ô Dieu, notre Sauveur.',
            'R. Et détournez votre colère de nous.'
        ],
        en: [
            'I confess to almighty God, to blessed Mary ever Virgin, to blessed Michael the Archangel, to blessed John the Baptist, the holy Apostles Peter and Paul, and to all the saints, that I have sinned exceedingly in thought, word, and deed: through my fault, through my fault, through my most grievous fault.',
            'Therefore I beseech blessed Mary ever Virgin, blessed Michael the Archangel, blessed John the Baptist, the holy Apostles Peter and Paul, and all the saints, to pray to the Lord our God for me.',
            'May almighty God have mercy upon us, forgive us our sins, and bring us to life everlasting. R. Amen.',
            'May the almighty and merciful Lord grant us pardon, + absolution, and remission of our sins. R. Amen.',
            'V. Turn us then, + O God our Saviour.',
            'R. And let thine anger cease from us.'
        ],
        es: [
            'Yo confieso ante Dios todopoderoso, ante la bienaventurada siempre Virgen María, ante el bienaventurado san Miguel Arcángel, san Juan Bautista, los santos apóstoles Pedro y Pablo y todos los santos, que he pecado gravemente de pensamiento, palabra y obra: por mi culpa, por mi culpa, por mi gran culpa.',
            'Por eso ruego a la bienaventurada siempre Virgen María, a san Miguel Arcángel, a san Juan Bautista, a los santos apóstoles Pedro y Pablo y a todos los santos, que roguéis por mí a Dios nuestro Señor.',
            'Dios todopoderoso tenga misericordia de nosotros, perdone nuestros pecados y nos lleve a la vida eterna. R. Amén.',
            'El Señor omnipotente y misericordioso nos conceda el perdón, + la absolución y la remisión de nuestros pecados. R. Amén.',
            'V. Conviértenos, + Dios salvador nuestro.',
            'R. Y aparta de nosotros tu ira.'
        ]
    },
    ant_miserere: {
        la: ['Miserére mihi, Dómine, * et exáudi oratiónem meam.'],
        fr: ['Ayez pitié de moi, Seigneur, * et exaucez ma prière.'],
        en: ['Have mercy on me, O Lord, * and hearken unto my prayer.'],
        es: ['Ten piedad de mí, Señor, * y escucha mi oración.']
    },
    hymn_te_lucis: {
        la: ['Te lucis ante términum,\nRerum Creátor, póscimus,\nUt sólita cleméntia\nSis præsul ad custódiam.', 'Præsta, Pater omnípotens,\nPer Jesum Christum Dóminum,\nQui tecum in perpétuum\nRegnat cum Sancto Spíritu. Amen.'],
        fr: ['Avant la fin de la lumière,\nCréateur de toutes choses, nous vous prions,\nAvec votre clémence ordinaire,\nDe nous prendre sous votre garde.', 'Accordez-nous cette grâce, Père tout-puissant,\nPar Jésus-Christ le Seigneur,\nQui vit et règne à jamais avec vous\nDans l’unité du Saint-Esprit. Ainsi soit-il.'],
        en: ['Before the ending of the day,\nCreator of the world, we pray\nThat with thy wonted favor thou\nWouldst be our guard and keeper now.', 'Almighty Father, hear our prayer\nThrough Jesus Christ thine only Son,\nWho with the Holy Ghost and thee\nDoth live and reign eternally. Amen.'],
        es: ['Antes que la luz decline,\nCreador del universo, te rogamos\nQue por tu clemencia infinita\nSeas nuestra custodia y guarda.', 'Concédenoslo, Padre omnipotente,\nPor Jesucristo el Señor,\nQue contigo vive y reina por siempre\nEn la unidad del Espíritu Santo. Amén.']
    },
    cap_tu_autem: {
        la: ['Tu autem in nobis es, Dómine, et nomen sanctum tuum invocátum est super nos: ne derelínquas nos, Dómine, Deus noster.', 'R. Deo grátias.'],
        fr: ['Mais vous, vous êtes au milieu de nous, Seigneur, et votre saint nom est invoqué sur nous ; ne nous abandonnez pas, ô Seigneur notre Dieu.', 'R. Rendons grâces à Dieu.'],
        en: ['Thou, O Lord, art in the midst of us, and we are called by thy holy name: leave us not, O Lord our God.', 'R. Thanks be to God.'],
        es: ['Mas tú, Señor, estás en medio de nosotros, y tu santo nombre ha sido invocado sobre nosotros: no nos desampares, Señor, Dios nuestro.', 'R. Demos gracias a Dios.']
    },
    resp_in_manus: {
        la: ['V. In manus tuas, Dómine, * Comméndo spíritum meum.', 'R. In manus tuas, Dómine, * Comméndo spíritum meum.', 'V. Redemísti nos, Dómine, Deus veritátis.', 'R. Comméndo spíritum meum.', 'Glória Patri, et Fílio, * et Spirítui Sancto.', 'R. In manus tuas, Dómine, * Comméndo spíritum meum.', 'V. Custódi nos, Dómine, ut pupíllam óculi.', 'R. Sub umbra alárum tuárum prótege nos.'],
        fr: ['V. En vos mains, Seigneur, * Je remets mon esprit.', 'R. En vos mains, Seigneur, * Je remets mon esprit.', 'V. C’est vous qui nous avez rachetés, Seigneur, Dieu de vérité.', 'R. Je remets mon esprit.', 'Gloire au Père, et au Fils, * et au Saint-Esprit.', 'R. En vos mains, Seigneur, * Je remets mon esprit.', 'V. Gardez-nous, Seigneur, comme la prunelle de l’œil.', 'R. À l’ombre de vos ailes protégez-nous.'],
        en: ['V. Into thy hands, O Lord, * I commend my spirit.', 'R. Into thy hands, O Lord, * I commend my spirit.', 'V. For thou hast redeemed us, O Lord, thou God of truth.', 'R. I commend my spirit.', 'Glory be to the Father, and to the Son, * and to the Holy Ghost.', 'R. Into thy hands, O Lord, * I commend my spirit.', 'V. Keep us, O Lord, as the apple of thine eye.', 'R. Hide us under the shadow of thy wings.'],
        es: ['V. En tus manos, Señor, * Encomiendo mi espíritu.', 'R. En tus manos, Señor, * Encomiendo mi espíritu.', 'V. Tú nos has redimido, Señor, Dios de la verdad.', 'R. Encomiendo mi espíritu.', 'Gloria al Padre, y al Hijo, * y al Espíritu Santo.', 'R. En tus manos, Señor, * Encomiendo mi espíritu.', 'V. Guárdanos, Señor, como a la niña de tus ojos.', 'R. Protégenos bajo la sombra de tus alas.']
    },
    canticum_nunc_dimittis: {
        la: ['Ant. Salva nos, Dómine, vigilántes, * custódi nos dormiéntes; ut vigilémus cum Christo, et requiescámus in pace.', 'Nunc dimíttis servum tuum, Dómine, * secúndum verbum tuum in pace:', 'Quia vidérunt óculi mei * salutáre tuum:', 'Quod parásti * ante fáciem ómnium populórum:', 'Lumen ad revelatiónem géntium, * et glóriam plebis tuæ Israël.', 'Glória Patri, et Fílio, * et Spirítui Sancto.', 'Sicut erat in princípio, et nunc, et semper, * et in sǽcula sæculórum. Amen.', 'Ant. Salva nos, Dómine, vigilántes, * custódi nos dormiéntes; ut vigilémus cum Christo, et requiescámus in pace.'],
        fr: ['Ant. Sauvez-nous, Seigneur, quand nous veillons, * gardez-nous quand nous dormons, afin que nous veillions avec le Christ et reposions dans la paix.', 'Maintenant, Seigneur, vous laissez aller votre serviteur en paix, * selon votre parole :', 'Car mes yeux ont vu * le salut qui vient de vous,', 'Que vous avez préparé * à la face de tous les peuples :', 'Lumière pour éclairer les nations, * et gloire de votre peuple d\'Israël.', 'Gloire au Père, et au Fils, * et au Saint-Esprit.', 'Comme il était au commencement, maintenant et toujours, * et dans les siècles des siècles. Ainsi soit-il.', 'Ant. Sauvez-nous, Seigneur, quand nous veillons, * gardez-nous quand nous dormons, afin que nous veillions avec le Christ et reposions dans la paix.'],
        en: ['Ant. Save us, O Lord, while we are awake, * and guard us while we sleep, that we may watch with Christ, and rest in peace.', 'Lord, now lettest thou thy servant depart in peace, * according to thy word:', 'For mine eyes have seen * thy salvation,', 'Which thou hast prepared * before the face of all people:', 'A light to lighten the Gentiles, * and the glory of thy people Israel.', 'Glory be to the Father, and to the Son, * and to the Holy Ghost.', 'As it was in the beginning, is now, * and ever shall be, world without end. Amen.', 'Ant. Save us, O Lord, while we are awake, * and guard us while we sleep, that we may watch with Christ, and rest in peace.'],
        es: ['Ant. Sálvanos, Señor, despiertos, * guárdanos dormidos; para que velemos con Cristo y descansemos en paz.', 'Ahora, Señor, según tu promesa, * puedes dejar a tu siervo irse en paz.', 'Porque mis ojos han visto * a tu Salvador,', 'A quien has presentado * ante todos los pueblos:', 'Luz para alumbrar a las naciones * y gloria de tu pueblo Israel.', 'Gloria al Padre, y al Hijo, * y al Espíritu Santo.', 'Como era en el principio, ahora y siempre, * por los siglos de los siglos. Amén.', 'Ant. Sálvanos, Señor, despiertos, * guárdanos dormidos; para que velemos con Cristo y descansemos en paz.']
    },
    oratio_visita: {
        la: ['Visita, quǽsumus, Dómine, habitatiónem istam, et omnes insídias inimíci ab ea lónge repélle: Ángeli tui sancti hábitent in ea, qui nos in pace custódiant; et benedíctio tua sit super nos semper.', '$Per Dominum'],
        fr: ['Visitez, nous vous en supplions, Seigneur, cette demeure, et repoussez-en bien loin toutes les embûches de l’ennemi ; que vos saints Anges y habitent pour nous garder dans la paix, et que votre bénédiction repose toujours sur nous.', '$Per Dominum'],
        en: ['Visit, we beseech thee, O Lord, this dwelling, and drive far from it all snares of the enemy: let thy holy angels dwell herein, who may keep us in peace, and let thy blessing be always upon us.', '$Per Dominum'],
        es: ['Visita, Señor, esta morada, y aleja de ella todas las asechanzas del enemigo; que tus santos ángeles habiten en ella para guardarnos en paz, y que tu bendición esté siempre sobre nosotros.', '$Per Dominum']
    },
    salve_regina: {
        la: ['Salve, Regína, mater misericórdiæ; vita, dulcédo et spes nostra, salve.', 'Ad te clamámus, éxsules fílii Hevæ; ad te suspirámus, geméntes et flentes in hac lacrimárum valle.', 'Eja ergo, advocáta nostra, illos tuos misericórdes óculos ad nos convérte.', 'Et Jesum, benedíctum fructum ventris tui, nobis post hoc exsílium osténde.', 'O clemens, o pia, o dulcis Virgo María.'],
        fr: ['Salut, ô Reine, Mère de miséricorde, notre vie, notre douceur et notre espérance, salut !', 'Enfants d\'Ève, exilés, nous crions vers vous ; vers vous nous soupirons, gémissant et pleurant dans cette vallée de larmes.', 'Ô vous, notre avocate, tournez vers nous vos regards miséricordieux.', 'Et après cet exil, montrez-nous Jésus, le fruit béni de vos entrailles.', 'Ô clémente, ô bonne, ô douce Vierge Marie !'],
        en: ['Hail, Holy Queen, Mother of Mercy, our life, our sweetness, and our hope!', 'To thee do we cry, poor banished children of Eve; to thee do we send up our sighs, mourning and weeping in this valley of tears.', 'Turn, then, most gracious advocate, thine eyes of mercy toward us,', 'And after this our exile, show unto us the blessed fruit of thy womb, Jesus.', 'O clement, O loving, O sweet Virgin Mary!'],
        es: ['Dios te salve, Reina y Madre de misericordia, vida, dulzura y esperanza nuestra; Dios te salve.', 'A ti llamamos los desterrados hijos de Eva; a ti suspiramos, gimiendo y llorando en este valle de lágrimas.', 'Ella, pues, Señora, abogada nuestra, vuelve a nosotros esos tus ojos misericordiosos;', 'Y después de este destierro muéstranos a Jesús, fruto bendito de tu vientre.', '¡Oh clementísima, oh piadosa, oh dulce Virgen María!']
    },
    canticum_magnificat: {
        la: ['Magníficat * ánima mea Dóminum.', 'Et exsultávit spíritus meus * in Deo salutári meo.', 'Quia respéxit humilitátem ancíllæ suæ: * ecce enim ex hoc beátam me dicent omnes generatiónes.', 'Quia fécit mihi magna qui potens est: * et sanctum nomen ejus.', 'Et misericórdia ejus a progénie in progénies * timéntibus eum.', 'Fécit poténtiam in bráchio suo: * dispérsit supérbos mente cordis sui.', 'Depósuit poténtes de sede, * et exaltávit húmiles.', 'Esuriéntes implévit bonis: * et dívites dimísit inánes.', 'Suscépit Israël púerum suum, * recordátus misericórdiæ suæ.', 'Sicut locútus est ad patres nostros, * Ábraham et sémini ejus in sǽcula.', 'Glória Patri, et Fílio, * et Spirítui Sancto.', 'Sicut erat in princípio, et nunc, et semper, * et in sǽcula sæculórum. Amen.'],
        fr: ['Mon âme * glorifie le Seigneur,', 'Et mon esprit tressaille de joie * en Dieu mon Sauveur,', 'Parce qu’il a jeté les yeux sur la bassesse de sa servante : * désormais toutes les générations me diront bienheureuse.', 'Car le Tout-Puissant a fait pour moi de grandes choses : * et son nom est saint.', 'Et sa miséricorde s’étend d’âge en âge * sur ceux qui le craignent.', 'Il a déployé la force de son bras : * il a dispersé les hommes au cœur orgueilleux.', 'Il a renversé les puissants de leurs trônes, * et il a élevé les humbles.', 'Il a comblé de biens les affamés, * et il a renvoyé les riches les mains vides.', 'Il a pris sous sa garde Israël son serviteur, * se souvenant de sa miséricorde,', 'Comme il l’avait promis à nos pères, * en faveur d’Abraham et de sa postérité pour toujours.', 'Gloire au Père, et au Fils, * et au Saint-Esprit.', 'Comme il était au commencement, maintenant et toujours, * et dans les siècles des siècles. Ainsi soit-il.'],
        en: ['My soul * doth magnify the Lord,', 'And my spirit hath rejoiced * in God my Saviour.', 'Because he hath regarded the humility of his handmaid; * for behold from henceforth all generations shall call me blessed.', 'Because he that is mighty hath done great things to me; * and holy is his name.', 'And his mercy is from generation unto generations, * to them that fear him.', 'He hath power in his arm: * he hath scattered the proud in the conceit of their heart.', 'He hath put down the mighty from their seat, * and hath exalted the humble.', 'He hath filled the hungry with good things; * and the rich he hath sent empty away.', 'He hath received Israel his servant, * being mindful of his mercy:', 'As he spoke to our fathers, * to Abraham and to his seed for ever.', 'Glory be to the Father, and to the Son, * and to the Holy Ghost.', 'As it was in the beginning, is now, * and ever shall be, world without end. Amen.'],
        es: ['Proclama mi alma * la grandeza del Señor,', 'Se alegra mi espíritu * en Dios, mi Salvador;', 'Porque ha mirado la humildad de su esclava: * desde ahora me felicitarán todas las generaciones,', 'Porque el Poderoso ha hecho obras grandes por mí: * su nombre es santo,', 'Y su misericordia llega a sus fieles * de generación en generación.', 'Él hace proezas con su brazo: * dispersa a los soberbios de corazón,', 'Derriba del trono a los poderosos * y enaltece a los humildes,', 'A los hambrientos los colma de bienes * y a los ricos los despide vacíos.', 'Auxilia a Israel, su siervo, * acordándose de la misericordia,', 'Como lo había prometido a nuestros padres, * en favor de Abrahán y su descendencia por siempre.', 'Gloria al Padre, y al Hijo, * y al Espíritu Santo.', 'Como era en el principio, ahora y siempre, * por los siglos de los siglos. Amén.']
    },
    canticum_benedictus: {
        la: ['Benedíctus Dóminus Deus Israël: * quia visitávit, et fecit redemptiónem plebis suæ:', 'Et eréxit cornu salútis nobis: * in domo David, púeri sui:', 'Sicut locútus est per os sanctórum, * qui a sǽculo sunt, prophetárum ejus:', 'Salútem ex inimícis nostris, * et de manu ómnium, qui odérunt nos:', 'Ad faciéndam misericórdiam cum pátribus nostris: * et memorári testaménti sui sancti.', 'Jusjurándum, quod jurávit ad Ábraham patrem nostrum, * datúrum se nobis:', 'Ut sine timóre, de manu inimicórum nostrórum liberáti, * serviámus illi.', 'In sanctitáte, et justítia coram ipso, * ómnibus diébus nostris.', 'Et tu, puer, Prophéta Altíssimi vocáberis: * præíbis enim ante fáciem Dómini paráre vias ejus:', 'Ad dandam sciéntiam salútis plebi ejus: * in remissiónem peccatórum eórum:', 'Per víscera misericórdiæ Dei nostri: * in quibus visitávit nos, óriens ex alto:', 'Illumináre his, qui in ténebris, et in umbra mortis sedent: * ad dirigéndos pedes nostros in viam pacis.', 'Glória Patri, et Fílio, * et Spirítui Sancto.', 'Sicut erat in princípio, et nunc, et semper, * et in sǽcula sæculórum. Amen.'],
        fr: ['Béni soit le Seigneur, le Dieu d\'Israël, * de ce qu\'Il a visité et racheté son peuple ;', 'Et Il nous a suscité un puissant Sauveur, * dans la maison de David, son serviteur,', 'Selon qu\'Il l\'avait annoncé par la bouche de ses saints, * de ses prophètes des temps anciens ;', 'Qu\'Il nous délivrerait de nos ennemis, * et des mains de tous ceux qui nous haïssent ;', 'Pour faire miséricorde à nos pères, * et se souvenir de son alliance sainte,', 'Selon le serment qu\'Il a fait à Abraham, notre père, * de nous accorder', 'Qu\'après avoir été délivrés de la main de nos ennemis, * nous le servions sans crainte,', 'Dans la sainteté et la justice en sa présence, * tous les jours de notre vie.', 'Et toi, petit enfant, tu seras appelé le prophète du Très-Haut ; * car tu marcheras devant la face du Seigneur, pour préparer ses voies,', 'Afin de donner à son peuple la connaissance du salut, * par la rémission de ses péchés,', 'Par les entrailles de la miséricorde de notre Dieu, * par lesquelles le soleil levant nous a visités d\'en haut,', 'Pour éclairer ceux qui sont assis dans les ténèbres et dans l\'ombre de la mort, * pour diriger nos pas dans la voie de la paix.', 'Gloire au Père, et au Fils, * et au Saint-Esprit.', 'Comme il était au commencement, maintenant et toujours, * et dans les siècles des siècles. Ainsi soit-il.'],
        en: ['Blessed be the Lord God of Israel; * for he hath visited and redeemed his people;', 'And hath raised up an horn of salvation for us * in the house of his servant David;', 'As he spake by the mouth of his holy prophets, * which have been since the world began:', 'That we should be saved from our enemies, * and from the hand of all that hate us;', 'To perform the mercy promised to our fathers, * and to remember his holy covenant;', 'The oath which he sware to our father Abraham, * that he would grant unto us,', 'That we being delivered out of the hand of our enemies * might serve him without fear,', 'In holiness and righteousness before him, * all the days of our life.', 'And thou, child, shalt be called the prophet of the Highest: * for thou shalt go before the face of the Lord to prepare his ways;', 'To give knowledge of salvation unto his people * by the remission of their sins,', 'Through the tender mercy of our God; * whereby the dayspring from on high hath visited us,', 'To give light to them that sit in darkness and in the shadow of death, * to guide our feet into the way of peace.', 'Glory be to the Father, and to the Son, * and to the Holy Ghost.', 'As it was in the beginning, is now, * and ever shall be, world without end. Amen.'],
        es: ['Bendito sea el Señor, Dios de Israel, * porque ha visitado y redimido a su pueblo,', 'Suscitándonos una fuerza de salvación * en la casa de David, su siervo,', 'Según lo había predicho desde antiguo * por boca de sus santos profetas:', 'Es la salvación que nos libra de nuestros enemigos * y de la mano de todos los que nos odian;', 'Ha realizado así la misericordia que tuvo con nuestros padres, * recordando su santa alianza', 'Y el juramento que juró a nuestro padre Abrahán * para concedernos', 'Que, libres de temor, arrancados de la mano de los enemigos, * le sirvamos', 'Con santidad y justicia en su presencia, * todos nuestros días.', 'Y a ti, niño, te llamarán profeta del Altísimo, * porque irás delante del Señor a preparar sus caminos,', 'Anunciando a su pueblo la salvación, * el perdón de sus pecados.', 'Por la entrañable misericordia de nuestro Dios, * nos visitará el sol que nace de lo alto,', 'Para iluminar a los que viven en tinieblas y en sombra de muerte, * para guiar nuestros pasos por el camino de la paz.', 'Gloria al Padre, y al Hijo, * y al Espíritu Santo.', 'Como era en el principio, ahora y siempre, * por los siglos de los siglos. Amén.']
    },
    te_deum: {
        la: ['Te Deum laudámus: * te Dóminum confitémur.', 'Te ætérnum Patrem * omnis terra venerátur.', 'Tibi omnes Ángeli, * tibi Cæli, et univérsæ Potestátes:', 'Tibi Chérubim et Séraphim * incessábili voce proclámant:', 'Sanctus, Sanctus, Sanctus * Dóminus Deus Sábaoth.', 'Pleni sunt cæli et terra * majestátis glóriæ tuæ.', 'Te gloriósus * Apostolórum chorus,', 'Te Prophetárum * laudábilis númerus,', 'Te Mártyrum candidátus * laudat exércitus.', 'Te per orbem terrárum * sancta confitétur Ecclésia,', 'Patrem * imménsæ majestátis;', 'Venerándum tuum verum * et únicum Fílium;', 'Sanctum quoque * Paráclitum Spíritum.', 'Tu Rex glóriæ, * Christe.', 'Tu Patris * sempitérnus es Fílius.'],
        fr: ['À vous, Dieu, nos louanges ! * Vous, Seigneur, nous vous acclamons !', 'À vous, Père éternel, * l’hommage de la terre entière.', 'Pour vous tous les Anges, * les Cieux et toutes les Puissances,', 'Pour vous les Chérubins et les Séraphins * chantent sans cesse d\'une voix éclatante :', 'Saint, Saint, Saint * est le Seigneur, Dieu de l\'univers !', 'Le ciel et la terre sont remplis * de la majesté de votre gloire.', 'À vous le chœur glorieux * des Apôtres,', 'À vous la foule louable * des Prophètes,', 'À vous la blanche armée * des Martyrs vous louent.', 'Sur toute la surface de la terre, * la sainte Église proclame votre gloire,', 'Père * d’infinie majesté,', 'Votre Fils unique * et véritable, digne d\'adoration,', 'Et le Saint-Esprit * Consolateur.', 'Vous êtes le Roi de gloire, * ô Christ !', 'Vous êtes le Fils éternel * du Père.'],
        en: ['We praise thee, O God: * we acknowledge thee to be the Lord.', 'All the earth doth worship thee, * the Father everlasting.', 'To thee all Angels cry aloud: * the Heavens, and all the Powers therein.', 'To thee Cherubim and Seraphim * continually do cry,', 'Holy, Holy, Holy, * Lord God of Sabaoth;', 'Heaven and earth are full * of the Majesty of thy glory.', 'The glorious company of the Apostles * praise thee.', 'The goodly fellowship of the Prophets * praise thee.', 'The noble army of Martyrs * praise thee.', 'The holy Church throughout all the world * doth acknowledge thee;', 'The Father * of an infinite Majesty;', 'Thine honourable, true, * and only Son;', 'Also the Holy Ghost, * the Comforter.', 'Thou art the King of Glory, * O Christ.', 'Thou art the everlasting * Son of the Father.'],
        es: ['A ti, Dios, te alabamos, * a ti, Señor, te reconocemos.', 'A ti, eterno Padre, * te venera toda la creación.', 'Los ángeles todos, los cielos * y todas las potestades te honran.', 'Los querubines y serafines * te cantan sin cesar:', 'Santo, Santo, Santo * es el Señor, Dios del universo.', 'Los cielos y la tierra están llenos * de la majestad de tu gloria.', 'A ti el glorioso coro de los Apóstoles, *', 'A ti la multitud admirable de los Profetas, *', 'A ti el blanco ejército de los Mártires te alaban.', 'A ti la santa Iglesia proclama por toda la tierra, *', 'Padre * de inmensa majestad,', 'Hijo único * y verdadero, digno de adoración,', 'Espíritu Santo, * Defensor.', 'Tú eres el Rey de la gloria, * Cristo.', 'Tú eres el Hijo único * del Padre.']
    }
};

function getLitText(key, lang) {
    var item = DO_LITURGY_I18N[key];
    if (!item) return [];
    return item[lang] || item['fr'] || item['la'] || [];
}

function getLangFolder(langKey) {
    var map = {
        fr: 'Francais',
        en: 'English',
        es: 'Espanol',
        it: 'Italiano',
        de: 'Deutsch',
        pl: 'Polski',
        pt: 'Portugues',
        nl: 'Nederlands',
        hu: 'Magyar',
        cs: 'Bohemice',
        da: 'Dansk',
        uk: 'Ukrainian',
        vi: 'Vietnamice',
        la: 'Latin'
    };
    return map[langKey] || 'Latin';
}

// ---- Calendar Computations ----
function computeLiturgicalCodes(mom) {
    var y = mom.year();
    var easter = moment(moment.easter(y));
    var ashWed = moment(easter).subtract(46, 'days');
    var septuagesima = moment(easter).subtract(63, 'days');
    var pentecost = moment(easter).add(49, 'days');

    var christmas = moment({ year: y, month: 11, day: 25 });
    var daysToSun = (7 - christmas.day()) % 7;
    var advent4 = moment(christmas).subtract(daysToSun === 0 ? 0 : daysToSun, 'days');
    var advent1 = moment(advent4).subtract(21, 'days');

    var d = mom;
    var dow = d.day(); // 0=Sun
    var mmdd = d.format('MM-DD');

    var tempora = '';
    if (d.isSameOrAfter(advent1) && d.isBefore(christmas)) {
        var wk = Math.floor(d.diff(advent1, 'days') / 7) + 1;
        tempora = 'Adv' + wk + '-' + dow;
    } else if (d.isSameOrAfter(christmas) || d.isBefore(moment({ year: y, month: 0, day: 6 }))) {
        tempora = 'Nat1-' + dow;
    } else if (d.isSameOrAfter(moment({ year: y, month: 0, day: 6 })) && d.isBefore(septuagesima)) {
        var epi = moment({ year: y, month: 0, day: 6 });
        var wk = Math.floor(d.diff(epi, 'days') / 7) + 1;
        tempora = 'Epi' + wk + '-' + dow;
    } else if (d.isSameOrAfter(septuagesima) && d.isBefore(ashWed)) {
        var wk = Math.floor(d.diff(septuagesima, 'days') / 7) + 1;
        tempora = 'Quadp' + wk + '-' + dow;
    } else if (d.isSameOrAfter(ashWed) && d.isBefore(easter)) {
        var wk = Math.floor(d.diff(ashWed, 'days') / 7) + 1;
        tempora = 'Quad' + wk + '-' + dow;
    } else if (d.isSameOrAfter(easter) && d.isBefore(pentecost)) {
        var wk = Math.floor(d.diff(easter, 'days') / 7);
        tempora = 'Pasc' + wk + '-' + dow;
    } else {
        var wk = Math.floor(d.diff(pentecost, 'days') / 7);
        if (wk === 0) {
            tempora = 'Pasc7-' + dow;
        } else {
            var pStr = (wk < 10 ? '0' + wk : '' + wk);
            tempora = 'Pent' + pStr + '-' + dow;
        }
    }

    return {
        sancti: mmdd,
        tempora: tempora,
        isSunday: dow === 0
    };
}

// ---- Manifest & File Existence Checker (Prevents 404 console errors) ----
function fileExistsInManifest(path) {
    if (!window.DO_MANIFEST) return true; // If manifest not loaded, fallback to network
    if (!path) return false;
    var norm = path.toLowerCase().replace(/\\/g, '/');
    return !!window.DO_MANIFEST[norm];
}

// ---- File Fetcher (100% Local Relative Path with 404 Prevention) ----
var DO_DATA_BUILD_VERSION = '202609011135';
function fetchLocalFile(path, callback) {
    if (DO_LOCAL_CACHE[path] !== undefined) {
        callback(null, DO_LOCAL_CACHE[path]);
        return;
    }
    if (!fileExistsInManifest(path)) {
        DO_LOCAL_CACHE[path] = null;
        callback('File not found in manifest', null);
        return;
    }
    var reqUrl = path + (path.indexOf('?') >= 0 ? '&' : '?') + 'v=' + DO_DATA_BUILD_VERSION;
    $.ajax({
        url: reqUrl,
        dataType: 'text',
        cache: true
    }).done(function(data) {
        DO_LOCAL_CACHE[path] = data;
        callback(null, data);
    }).fail(function(err) {
        DO_LOCAL_CACHE[path] = null;
        callback(err, null);
    });
}

function cleanAndMergeLines(rawLines) {
    if (!rawLines) return [];
    var lines = [];
    var cur = '';

    rawLines.forEach(function(l) {
        l = l.trim();
        if (!l) return;

        // Skip internal DO conditional lines like *D, *&Introibo, !*D, !*S, &Vidiaquam, etc.
        if (/^!?\*[A-Za-z0-9_&]/i.test(l)) return;
        if (/^&/i.test(l)) return;
        if (/^[-–—_~*]+$/.test(l)) return;
        l = l.replace(/^!x!/i, '');

        var endsWithTilde = /~$/.test(l);
        l = l.replace(/~+$/, '').trim();

        if (cur) {
            var strippedL = l.replace(/^!+/, '').trim();
            cur += ' ' + strippedL;
        } else {
            cur = l;
        }

        if (!endsWithTilde) {
            if (cur && !/^[-–—_~*]+$/.test(cur.trim())) {
                lines.push(cur);
            }
            cur = '';
        }
    });
    if (cur && !/^[-–—_~*]+$/.test(cur.trim())) lines.push(cur);
    return lines;
}

function parseSections(text) {
    if (!text) return {};
    var sections = {};
    var currentSection = null;
    var rawSections = {};
    var lines = text.split(/\r?\n/);

    lines.forEach(function(line) {
        var headerMatch = line.match(/^\[([^\]]+)\]/);
        if (headerMatch) {
            currentSection = headerMatch[1].trim();
            if (!rawSections[currentSection]) {
                rawSections[currentSection] = [];
            }
        } else if (currentSection) {
            rawSections[currentSection].push(line);
        }
    });

    Object.keys(rawSections).forEach(function(k) {
        sections[k] = cleanAndMergeLines(rawSections[k]);
    });

    return sections;
}

function parseOrdoFile(text) {
    if (!text) return {};
    var parts = {};
    var currentPart = null;
    var rawParts = {};
    var lines = text.split(/\r?\n/);

    lines.forEach(function(line) {
        var headerMatch = line.match(/^#\s*([^\r\n]+)/);
        if (headerMatch) {
            currentPart = headerMatch[1].trim();
            if (!rawParts[currentPart]) {
                rawParts[currentPart] = [];
            }
        } else if (currentPart) {
            rawParts[currentPart].push(line);
        }
    });

    Object.keys(rawParts).forEach(function(k) {
        parts[k] = cleanAndMergeLines(rawParts[k]);
    });

    return parts;
}

// Load a psalm from Psalmorum folder
function fetchPsalmText(psalmNum, langKey, callback) {
    var langFolder = getLangFolder(langKey);
    var p = 'do_data/horas/' + langFolder + '/Psalterium/Psalmorum/Psalm' + psalmNum + '.txt';
    fetchLocalFile(p, function(err, data) {
        if (!err && data) {
            var rawLines = data.split(/\r?\n/).filter(function(l) { return l.trim().length > 0; });
            var cleaned = rawLines.map(function(l) {
                return l.replace(/^\d+:\d+[a-z]?\s*/i, '');
            });
            callback(cleaned);
        } else {
            if (langFolder !== 'Latin') {
                fetchPsalmText(psalmNum, 'la', callback);
            } else {
                callback([]);
            }
        }
    });
}

function getSectionWithAliases(sectionsObj, targetSec) {
    if (!sectionsObj || !targetSec) return null;
    if (sectionsObj[targetSec] && sectionsObj[targetSec].length) return { key: targetSec, lines: sectionsObj[targetSec] };

    var aliases = {
        'Lectio': ['Lectio', 'Epistola', 'Lectio1', 'Lectio 1', 'Lesson', 'Epistola Pauli'],
        'Epistola': ['Epistola', 'Lectio', 'Lectio1', 'Lectio 1', 'Lesson', 'Epistola Pauli'],
        'Oratio': ['Oratio', 'Collecta', 'Oratio 1', 'Oratio Pauli'],
        'Secreta': ['Secreta', 'Secret', 'Super oblata', 'Secreta Pauli'],
        'Postcommunio': ['Postcommunio', 'Postcommunion', 'Post communionem', 'Postcommunio Pauli'],
        'Evangelium': ['Evangelium', 'Gospel'],
        'Graduale': ['Graduale', 'GradualeP', 'Tractus'],
        'Tractus': ['Tractus', 'Graduale', 'GradualeP'],
        'Introitus': ['Introitus', 'Introit'],
        'Offertorium': ['Offertorium', 'Offertory'],
        'Communio': ['Communio', 'Communion'],
        'Ant Vespera': ['Ant Vespera', 'Ant 1', 'Ant', 'Ant Vesperas'],
        'Ant Laudes': ['Ant Laudes', 'Ant 2', 'Ant', 'Ant Laude']
    };

    var list = aliases[targetSec] || [];
    for (var i = 0; i < list.length; i++) {
        var a = list[i];
        if (sectionsObj[a] && sectionsObj[a].length) return { key: a, lines: sectionsObj[a] };
    }

    var tLow = targetSec.toLowerCase().trim();
    var keys = Object.keys(sectionsObj);
    for (var k = 0; k < keys.length; k++) {
        if (keys[k].toLowerCase().trim() === tLow && sectionsObj[keys[k]].length) {
            return { key: keys[k], lines: sectionsObj[keys[k]] };
        }
    }
    return null;
}

// Resolve Section Reference e.g. @Sancti/02-24 or @Commune/C4a or @Commune/C1:Introitus
function resolveSectionText(sectionName, sectionLines, baseSectionObj, langFolder, isMissa, callback, depth) {
    if (typeof depth !== 'number') depth = 0;
    if (depth > 6 || !sectionLines || !sectionLines.length) {
        callback(sectionLines || []);
        return;
    }

    var firstLine = sectionLines[0].trim();

    // Local section reference @:Lectio6_ or @:Ant Vespera
    if (firstLine.indexOf('@:') === 0) {
        var targetSec = firstLine.substring(2).trim();
        var match = getSectionWithAliases(baseSectionObj, targetSec);
        if (match) {
            resolveSectionText(match.key, match.lines, baseSectionObj, langFolder, isMissa, callback, depth + 1);
            return;
        }
    }

    // External file reference e.g. @Commune/C4 or @Commune/C4::s/N\./.../ or @Sancti/02-24:Ant 1
    if (firstLine.indexOf('@') === 0) {
        var ref = firstLine.substring(1).trim();
        var subPart = null;
        var subIdx = ref.indexOf('::');
        if (subIdx !== -1) {
            subPart = ref.substring(subIdx + 2);
            ref = ref.substring(0, subIdx);
        }

        var parts = ref.split(':');
        var filePath = parts[0].trim();
        var targetSec = (parts[1] && parts[1].trim()) ? parts[1].trim() : sectionName;

        if (!/\.txt$/i.test(filePath)) filePath += '.txt';

        var isCommune = /^(?:Commune\/|C\d+)/i.test(filePath);
        var candidatePaths = [];
        if (isCommune) {
            var cPath = filePath.startsWith('Commune/') ? filePath : ('Commune/' + filePath);
            candidatePaths.push('do_data/horas/' + langFolder + '/' + cPath);
            candidatePaths.push('do_data/horas/Latin/' + cPath);
            candidatePaths.push('do_data/missa/' + langFolder + '/' + cPath);
            candidatePaths.push('do_data/missa/Latin/' + cPath);
        } else {
            var primaryCorpus = isMissa ? 'missa' : 'horas';
            var altCorpus = isMissa ? 'horas' : 'missa';
            candidatePaths.push('do_data/' + primaryCorpus + '/' + langFolder + '/' + filePath);
            candidatePaths.push('do_data/' + altCorpus + '/' + langFolder + '/' + filePath);
            if (langFolder !== 'Latin') {
                candidatePaths.push('do_data/' + primaryCorpus + '/Latin/' + filePath);
                candidatePaths.push('do_data/' + altCorpus + '/Latin/' + filePath);
            }
        }

        var tryIdx = 0;
        function tryNextCandidate() {
            if (tryIdx >= candidatePaths.length) {
                callback(sectionLines);
                return;
            }
            var path = candidatePaths[tryIdx++];
            fetchLocalFile(path, function(err, data) {
                if (!err && data) {
                    var extSections = parseSections(data);
                    var match = getSectionWithAliases(extSections, targetSec);
                    if (match) {
                        resolveSectionText(match.key, match.lines, extSections, langFolder, isMissa, function(resLines) {
                            if (subPart) {
                                var subMatch = subPart.match(/^s\/([^\/]+)\/([^\/]*)\//);
                                if (subMatch) {
                                    var pat = new RegExp(subMatch[1], 'g');
                                    var rep = subMatch[2];
                                    resLines = resLines.map(function(l) { return l.replace(pat, rep); });
                                }
                            }
                            callback(resLines);
                        }, depth + 1);
                        return;
                    }
                }
                tryNextCandidate();
            });
        }

        tryNextCandidate();
        return;
    }

    callback(sectionLines);
}

// Interleaved Invitatorium (Antiphon + Psalm 94)
function buildInvitatoriumLines(invitAnt, langKey) {
    var rawAnt = (invitAnt && invitAnt.length) ? invitAnt[0] : (langKey === 'la' ? 'Regem Apostolórum Dóminum, * Veníte, adorémus.' : 'Le Seigneur, Roi des Apôtres, * Venez, adorons.');
    rawAnt = rawAnt.replace(/^v\.\s*/i, '').replace(/\{:H-[^:]+:\}/g, '').trim();

    var antParts = rawAnt.split('*');
    var fullAnt = 'Ant. ' + rawAnt;
    var halfAnt = 'Ant. ' + (antParts.length > 1 ? antParts[1].trim() : rawAnt);

    if (langKey === 'la') {
        return [
            '{Antiphona ex Commune aut Festo}',
            fullAnt,
            fullAnt,
            'Veníte, exsultémus Dómino: * jubilémus Deo, salutári nostro: præoccupémus fáciem ejus in confessióne, et in psalmis jubilémus ei.',
            fullAnt,
            'Quóniam Deus magnus Dóminus: * et Rex magnus super omnes deos, quóniam non repéllet Dóminus plebem suam: quia in manu ejus sunt omnes fines terræ, et altitúdines móntium ipse cónspicit.',
            halfAnt,
            'Quóniam ipsíus est mare, et ipse fecit illud, et áridam fundavérunt manus ejus: (genuflectitur) veníte, adorémus, et procidámus ante Deum: plorémus coram Dómino, qui fecit nos, quia ipse est Dóminus, Deus noster; nos autem pópulus ejus, et oves páscuæ ejus.',
            fullAnt,
            'Hódie, si vocem ejus audiéritis, nolíte obduráre corda vestra, sicut in exacerbatióne secúndum diem tentatiónis in desérto: ubi tentavérunt me patres vestri, probavérunt et vidérunt ópera mea.',
            halfAnt,
            'Quadragínta annis proximus fui generatióni huic, et dixi: Semper hi errant corde; ipsi vero non cognovérunt vias meas: quibus jurávi in ira mea: Si introíbunt in réquiem meam.',
            fullAnt,
            'Glória Patri, et Fílio, * et Spirítui Sancto.',
            'Sicut erat in princípio, et nunc, et semper, * et in sǽcula sæculórum. Amen.',
            halfAnt,
            fullAnt
        ];
    } else if (langKey === 'fr') {
        return [
            '{Antienne du Commun ou de la Fête}',
            fullAnt,
            fullAnt,
            'Venez, réjouissons-nous devant le Seigneur ; * poussons des cris de joie vers Dieu, notre Sauveur. Allons au-devant de Lui avec des louanges, et chantons des cantiques à Sa gloire.',
            fullAnt,
            'Car le Seigneur est le grand Dieu, * et le grand Roi au-dessus de tous les dieux. Dans Sa main sont tous les confins de la terre, et les sommets des montagnes Lui appartiennent.',
            halfAnt,
            'À Lui est la mer, et c’est Lui qui l’a faite, et Ses mains ont formé le continent : (on s\'agenouille) venez, adorons et prosternons-nous devant Dieu : pleurons devant le Seigneur qui nous a faits, car Il est le Seigneur notre Dieu ; et nous sommes le peuple de Son pâturage et les brebis de Sa main.',
            fullAnt,
            'Aujourd’hui, si vous entendez Sa voix, gardez-vous d’endurcir vos cœurs, comme au jour de la tentation dans le désert, où vos pères M’ont tenté, M’ont mis à l’épreuve et ont vu Mes œuvres.',
            halfAnt,
            'Pendant quarante ans Je fus irrité contre cette génération, et Je dis : Leur cœur ne cesse de s’égarer ; et ils n’ont point connu Mes voies : de sorte que J’ai juré dans Ma colère : Ils n’entreront point dans Mon repos.',
            fullAnt,
            'Gloire au Père, et au Fils, * et au Saint-Esprit.',
            'Comme il était au commencement, maintenant et toujours, * et dans les siècles des siècles. Ainsi soit-il.',
            halfAnt,
            fullAnt
        ];
    } else {
        return [
            '{Antiphon from the Common or Feast}',
            fullAnt,
            fullAnt,
            'Come let us praise the Lord with joy: let us joyfully sing to God our saviour. Let us come before his presence with thanksgiving, and make a joyful noise to him with psalms.',
            fullAnt,
            'For the Lord is a great God, and a great King above all gods. For in his hand are all the ends of the earth, and the heights of the mountains are his.',
            halfAnt,
            'For the sea is his, and he made it: and his hands formed the dry land: (genuflect) Come let us adore and fall down: and weep before the Lord that made us: For he is the Lord our God: and we are the people of his pasture and the sheep of his hand.',
            fullAnt,
            'Today if you shall hear his voice, harden not your hearts: As in the provocation, according to the day of temptation in the wilderness: where your fathers tempted me, they proved me, and saw my works.',
            halfAnt,
            'Forty years long was I offended with that generation, and I said: These always err in heart. And these men have not known my ways: so I swore in my wrath that they shall not enter into my rest.',
            fullAnt,
            'Glory be to the Father, and to the Son, * and to the Holy Ghost.',
            'As it was in the beginning, is now, * and ever shall be, world without end. Amen.',
            halfAnt,
            fullAnt
        ];
    }
}

// ---- Liturgical Precedence Helper ----
function isSanctiGreaterFeastOnSunday(sanctiFileText) {
    if (!sanctiFileText) return false;
    var rankMatch = sanctiFileText.match(/\[Rank\]([\s\S]*?)(?=\n\[|$)/i);
    var rankText = rankMatch ? rankMatch[1] : sanctiFileText.substring(0, 400);

    // 1st Class Feast (Rank >= 6 or "I classis", "1. classis", "Duplex I" with strict word boundaries)
    if (/\bI\s*classis|\b1\s*classis|\bDuplex\s+I\b|;;[6789](\.\d+)?;;/i.test(rankText) && !/\bII\s*classis|\bIII\s*classis/i.test(rankText)) {
        return true;
    }

    // Feast of the Lord of II. class (Festum Domini)
    if (/Festum\s+Domini/i.test(sanctiFileText) && (/\bII\s*classis|\b2\s*classis|\bDuplex\s+II\b/i.test(rankText) || /;;5\.\d+;;/.test(rankText))) {
        return true;
    }

    return false;
}

// ---- Data Loaders for Mass & Office ----

function extractCommuneRef(text) {
    if (!text) return null;
    var mRule = text.match(/\[Rule\][^\n]*\n([^\[\n]+)/i);
    if (mRule) {
        var mC = mRule[1].match(/(?:vide|ex)\s+(?:Commune\/)?(C\d+(?:-[0-9]+)?[a-z\-]*(?:Pasc)?|Sancti\/[^\s;]+)/i);
        if (mC) return mC[1].trim();
    }
    var mRank = text.match(/\[Rank\][^\n]*\n([^\[\n]+)/i);
    if (mRank) {
        var mC2 = mRank[1].match(/(?:vide|ex)\s+(?:Commune\/)?(C\d+(?:-[0-9]+)?[a-z\-]*(?:Pasc)?|Sancti\/[^\s;]+)/i);
        if (mC2) return mC2[1].trim();
    }
    var headerPart = text.split(/\n\s*\[/)[0];
    var mTop = headerPart.match(/^\s*@([A-Za-z0-9_\-\/]+)(?:\s|\n|$)/);
    if (mTop && !mTop[1].startsWith(':')) return mTop[1].trim();

    var mGen = text.match(/(?:vide|ex)\s+(?:Commune\/)?(C\d+(?:-[0-9]+)?[a-z\-]*(?:Pasc)?|Sancti\/[^\s;]+)/i);
    if (mGen) return mGen[1].trim();
    return null;
}

function loadRecursiveDOFile(relPath, langFolder, isMissa, callback, depth, visited) {
    if (!depth) depth = 0;
    if (!visited) visited = {};
    if (depth > 6 || visited[relPath]) {
        callback({});
        return;
    }
    visited[relPath] = true;

    var cleanPath = relPath;
    if (!/\.txt$/i.test(cleanPath)) cleanPath += '.txt';

    var isCommune = /^(?:Commune\/|C\d+)/i.test(cleanPath);
    var candidatePaths = [];

    var ed = DO_EDITIONS[doState.edition] || DO_EDITIONS['1960'];
    var suffixes = (ed && ed.suffixes) ? ed.suffixes : ['r', ''];

    if (isCommune) {
        var cClean = cleanPath.replace(/^Commune\//i, '').replace(/\.txt$/i, '');
        var cVariants = [cClean];
        var cNoTrailing = cClean.replace(/[a-z]+$/i, '');
        if (cNoTrailing && cVariants.indexOf(cNoTrailing) === -1) cVariants.push(cNoTrailing);
        var cBase = cClean.replace(/-[0-9]+[a-z]*$/i, '').replace(/[a-z]+$/i, '');
        if (cBase && cVariants.indexOf(cBase) === -1) cVariants.push(cBase);

        cVariants.forEach(function(cv) {
            var cPath = 'Commune/' + cv + '.txt';
            candidatePaths.push('do_data/missa/' + langFolder + '/' + cPath);
            candidatePaths.push('do_data/horas/' + langFolder + '/' + cPath);
            candidatePaths.push('do_data/missa/Latin/' + cPath);
            candidatePaths.push('do_data/horas/Latin/' + cPath);
        });
    } else {
        var rawStem = cleanPath.replace(/\.txt$/i, '');
        var parts = rawStem.split('/');
        var subfolder = parts.length > 1 ? parts[0] : '';
        var filename = parts.length > 1 ? parts[1] : parts[0];

        var primaryCorpus = isMissa ? 'missa' : 'horas';
        var altCorpus = isMissa ? 'horas' : 'missa';

        var folderCandidates = [subfolder];
        if (ed && ed.folders && ed.folders.indexOf('SanctiM') !== -1 && subfolder === 'Sancti') {
            folderCandidates.unshift('SanctiM');
        }

        folderCandidates.forEach(function(fld) {
            suffixes.forEach(function(sfx) {
                var fileWithSfx = (fld ? (fld + '/') : '') + filename + (sfx ? sfx : '') + '.txt';
                candidatePaths.push('do_data/' + primaryCorpus + '/' + langFolder + '/' + fileWithSfx);
                candidatePaths.push('do_data/' + altCorpus + '/' + langFolder + '/' + fileWithSfx);
                candidatePaths.push('do_data/' + primaryCorpus + '/Latin/' + fileWithSfx);
                candidatePaths.push('do_data/' + altCorpus + '/Latin/' + fileWithSfx);
            });
        });

        candidatePaths.push('do_data/' + primaryCorpus + '/' + langFolder + '/' + cleanPath);
        candidatePaths.push('do_data/' + altCorpus + '/' + langFolder + '/' + cleanPath);
        candidatePaths.push('do_data/' + primaryCorpus + '/Latin/' + cleanPath);
        candidatePaths.push('do_data/' + altCorpus + '/Latin/' + cleanPath);
    }

    // Filter candidate paths with manifest so only existing files are requested
    if (window.DO_MANIFEST) {
        var existingOnly = candidatePaths.filter(function(p) { return fileExistsInManifest(p); });
        if (existingOnly.length > 0) {
            candidatePaths = existingOnly;
        }
    }
    candidatePaths = candidatePaths.filter(function(v, i, a) { return a.indexOf(v) === i; });

    var tryIdx = 0;
    function tryLoad() {
        if (tryIdx >= candidatePaths.length) {
            callback({});
            return;
        }
        var p = candidatePaths[tryIdx++];
        fetchLocalFile(p, function(err, data) {
            if (!err && data) {
                var laP = p.replace('/' + langFolder + '/', '/Latin/');
                fetchLocalFile(laP, function(errLa, laData) {
                    var fullTextForRules = (laData || '') + '\n' + data;
                    var baseRef = extractCommuneRef(fullTextForRules);
                    var curSections = parseSections(data);

                    if (baseRef) {
                        var baseClean = baseRef;
                        if (!/^(Sancti|Tempora|Commune)\//i.test(baseClean)) {
                            baseClean = 'Commune/' + baseClean;
                        }
                        loadRecursiveDOFile(baseClean, langFolder, isMissa, function(baseSections) {
                            var merged = Object.assign({}, baseSections, curSections);
                            callback(merged);
                        }, depth + 1, visited);
                    } else {
                        callback(curSections);
                    }
                });
                return;
            } else {
                tryLoad();
            }
        });
    }

    tryLoad();
}

function loadMissaData(date, lang, callback) {
    var codes = computeLiturgicalCodes(date);
    var langFolder = getLangFolder(lang);
    var isTestMissa = (doState.hora === 'missa_gregorian');
    var rawKey = isTestMissa ? (doState.testFeastKey || doState.officiumKey) : doState.officiumKey;
    var feastKey = convertFeastKeyToCode(rawKey) || null;

    var sanctiCode = feastKey || codes.sancti;
    var temporaCode = feastKey || codes.tempora;

    var isDirectTempora = feastKey && /^(Adv|Quad|Pasc|Pent|Epi|7a|6a|5a)/i.test(feastKey);
    var primaryPath = isDirectTempora ? ('Tempora/' + temporaCode) : ('Sancti/' + sanctiCode);
    var fallbackPath = isDirectTempora ? ('Sancti/' + sanctiCode) : ('Tempora/' + temporaCode);

    if (codes.isSunday && !feastKey) {
        fetchLocalFile('do_data/missa/Latin/Sancti/' + sanctiCode + '.txt', function(errS, laSData) {
            var isGreater = (!errS && laSData) ? isSanctiGreaterFeastOnSunday(laSData) : false;
            var target = isGreater ? primaryPath : fallbackPath;
            var alt = isGreater ? fallbackPath : primaryPath;
            loadRecursiveDOFile(target, langFolder, true, function(sec) {
                if (sec && (sec['Officium'] || Object.keys(sec).length > 0)) {
                    processMissaSections(sec, langFolder, lang, callback, target);
                } else {
                    loadRecursiveDOFile(alt, langFolder, true, function(sec2) {
                        processMissaSections(sec2, langFolder, lang, callback, alt);
                    });
                }
            });
        });
    } else {
        loadRecursiveDOFile(primaryPath, langFolder, true, function(sec) {
            if (sec && (sec['Officium'] || Object.keys(sec).length > 0)) {
                processMissaSections(sec, langFolder, lang, callback, primaryPath);
            } else {
                loadRecursiveDOFile(fallbackPath, langFolder, true, function(sec2) {
                    processMissaSections(sec2, langFolder, lang, callback, fallbackPath);
                });
            }
        });
    }
}

function processMissaSections(fullSections, langFolder, langKey, callback, loadedPath) {
    if (!fullSections || Object.keys(fullSections).length === 0) {
        callback(null, null);
        return;
    }
    var feastTitle = (fullSections['Officium'] && fullSections['Officium'][0]) ? fullSections['Officium'][0].trim() : 'Missa Diei';

    var detectedCommune = null;
    try {
        var rawStr = JSON.stringify(fullSections);
        var commMatch = rawStr.match(/@Commune\/(C\d+(?:-[0-9]+)?[a-z\-]*(?:Pasc)?)/i) || rawStr.match(/vide\s+(C\d+(?:-[0-9]+)?[a-z\-]*(?:Pasc)?)/i);
        if (commMatch) detectedCommune = commMatch[1];
    } catch(e) {}

    var standardPropers = [
        { key: 'Introitus', label: 'Introitus', badge: 'Proprium' },
        { key: 'Oratio', label: 'Collecta / Oratio', badge: 'Oratio' },
        { key: 'Lectio', label: 'Epistola', badge: 'Lectio' },
        { key: 'Graduale', label: 'Graduale', badge: 'Proprium' },
        { key: 'Tractus', label: 'Tractus', badge: 'Proprium' },
        { key: 'Alleluia', label: 'Alleluia', badge: 'Proprium' },
        { key: 'Sequentia', label: 'Sequentia', badge: 'Proprium' },
        { key: 'Evangelium', label: 'Evangelium', badge: 'Evangelium' },
        { key: 'Offertorium', label: 'Offertorium', badge: 'Proprium' },
        { key: 'Secreta', label: 'Secreta', badge: 'Oratio' },
        { key: 'Communio', label: 'Communio', badge: 'Proprium' },
        { key: 'Postcommunio', label: 'Postcommunio', badge: 'Oratio' }
    ];

    if (!doState.includeOrdinarium) {
        var propDict = {};
        var pPending = standardPropers.length;

        standardPropers.forEach(function(p) {
            var lines = fullSections[p.key];
            if (!lines || !lines.length) {
                var match = getSectionWithAliases(fullSections, p.key);
                if (match) lines = match.lines;
            }

            if (lines && lines.length) {
                resolveSectionText(p.key, lines, fullSections, langFolder, true, function(resolvedLines) {
                    propDict[p.key] = {
                        id: p.key.toLowerCase(),
                        type: p.label,
                        badge: p.badge,
                        lines: resolvedLines
                    };
                    pPending--;
                    if (pPending === 0) finish();
                });
            } else {
                pPending--;
                if (pPending === 0) finish();
            }
        });

        function finish() {
            var orderedCards = [];
            standardPropers.forEach(function(p) {
                if (propDict[p.key]) {
                    orderedCards.push(propDict[p.key]);
                }
            });
            callback(null, { title: feastTitle, cards: orderedCards, loadedPath: loadedPath || null, communeRef: detectedCommune || null });
        }
        return;
    }

    var ordoPath = 'do_data/missa/' + langFolder + '/Ordo/Ordo.txt';
    var prayersPath = 'do_data/missa/' + langFolder + '/Ordo/Prayers.txt';
    fetchLocalFile(ordoPath, function(oErr, oData) {
        var ordoParts = (!oErr && oData) ? parseOrdoFile(oData) : {};
        fetchLocalFile(prayersPath, function(pErr, pData) {
            var prayersSec = (!pErr && pData) ? parseSections(pData) : {};
            var ultEv = prayersSec['Ultima Evangelium'] || prayersSec['UltimaEvangelium'] || prayersSec['Ultimaev'] || [];
            assembleFullMissa(fullSections, ordoParts, ultEv, langFolder, feastTitle, callback, loadedPath, detectedCommune);
        });
    });
}

function assembleFullMissa(propSec, ordoParts, ultEvLines, langFolder, feastTitle, callback, loadedPath, communeRef) {
    var cards = [];

    function getOrdoSection(keys) {
        for (var i = 0; i < keys.length; i++) {
            if (ordoParts[keys[i]] && ordoParts[keys[i]].length) {
                return ordoParts[keys[i]];
            }
        }
        return [];
    }

    var incipit = getOrdoSection(['Incipit']);
    var kyrie = getOrdoSection(['Kyrie']);
    var credo = getOrdoSection(['Credo', 'Profession de Foi']);
    var offertoryPrayers = getOrdoSection(['Offertorium', 'Offertoire']);
    var praefatio = getOrdoSection(['Præfatio', 'Préface', 'Praefatio']);
    var canon = getOrdoSection(['Canon']);
    var communionPrep = getOrdoSection(['Preparatio Communionis', 'Préparation à la Communion']);
    var conclusio = getOrdoSection(['Conclusio', 'Conclusion']);
    var leonis = getOrdoSection(['Orationes Leonis XIII', 'Prières de Léon XIII']);

    // Ensure Ultimum Evangelium (Saint Jean 1:1-14) is included in conclusio
    if (ultEvLines && ultEvLines.length) {
        var hasUltEvInConclusio = conclusio.some(function(l) {
            return /In princípio erat Verbum|Au commencement était le Verbe|In the beginning was the Word/i.test(l);
        });
        if (!hasUltEvInConclusio) {
            conclusio = conclusio.concat(ultEvLines);
        }
    }

    var propKeys = ['Introitus', 'Oratio', 'Lectio', 'Graduale', 'Tractus', 'Alleluia', 'Sequentia', 'Evangelium', 'Offertorium', 'Secreta', 'Communio', 'Postcommunio'];
    var resolvedProps = {};
    var pending = propKeys.length;

    propKeys.forEach(function(k) {
        var lines = propSec[k];
        if (lines && lines.length) {
            resolveSectionText(k, lines, propSec, langFolder, true, function(res) {
                resolvedProps[k] = res;
                pending--;
                if (pending === 0) finishAssembly();
            });
        } else {
            pending--;
            if (pending === 0) finishAssembly();
        }
    });

    function finishAssembly() {
        if (incipit.length) cards.push({ id: 'incipit', type: 'Preces ad gradus altaris', badge: 'Ordinarium', lines: incipit });
        if (resolvedProps['Introitus']) cards.push({ id: 'introitus', type: 'Introitus', badge: 'Proprium', lines: resolvedProps['Introitus'] });
        if (kyrie.length) {
            var kyrieLines = [];
            var gloriaLines = [];
            var isGloriaPart = false;

            kyrie.forEach(function(line) {
                if (/^!!\s*Gloria|^!\*&GloriaM|^v\.\s*Glória in excélsis/i.test(line)) {
                    isGloriaPart = true;
                }
                if (isGloriaPart) {
                    gloriaLines.push(line);
                } else {
                    kyrieLines.push(line);
                }
            });

            if (kyrieLines.length) {
                cards.push({ id: 'kyrie', type: 'Kýrie eléison', badge: 'Ordinarium', lines: kyrieLines });
            }
            if (gloriaLines.length) {
                cards.push({ id: 'gloria', type: 'Glória in excélsis Deo', badge: 'Ordinarium', lines: gloriaLines });
            }
        }
        if (resolvedProps['Oratio']) cards.push({ id: 'oratio', type: 'Collecta / Oratio', badge: 'Oratio', lines: resolvedProps['Oratio'] });
        if (resolvedProps['Lectio']) cards.push({ id: 'lectio', type: 'Epistola', badge: 'Lectio', lines: resolvedProps['Lectio'] });
        if (resolvedProps['Graduale']) cards.push({ id: 'graduale', type: 'Graduale', badge: 'Proprium', lines: resolvedProps['Graduale'] });
        if (resolvedProps['Tractus']) cards.push({ id: 'tractus', type: 'Tractus', badge: 'Proprium', lines: resolvedProps['Tractus'] });
        if (resolvedProps['Alleluia']) cards.push({ id: 'alleluia', type: 'Alleluia', badge: 'Proprium', lines: resolvedProps['Alleluia'] });
        if (resolvedProps['Sequentia']) cards.push({ id: 'sequentia', type: 'Sequentia', badge: 'Proprium', lines: resolvedProps['Sequentia'] });
        if (resolvedProps['Evangelium']) cards.push({ id: 'evangelium', type: 'Evangelium', badge: 'Evangelium', lines: resolvedProps['Evangelium'] });
        if (credo.length) cards.push({ id: 'credo', type: 'Credo in unum Deum', badge: 'Ordinarium', lines: credo });
        if (resolvedProps['Offertorium']) cards.push({ id: 'offertorium', type: 'Offertorium', badge: 'Proprium', lines: resolvedProps['Offertorium'] });
        if (offertoryPrayers.length) cards.push({ id: 'offertory_prayers', type: 'Preces Offertorii', badge: 'Ordinarium', lines: offertoryPrayers });
        if (resolvedProps['Secreta']) cards.push({ id: 'secreta', type: 'Secreta', badge: 'Oratio', lines: resolvedProps['Secreta'] });
        if (praefatio.length) cards.push({ id: 'praefatio', type: 'Præfatio & Sanctus', badge: 'Ordinarium', lines: praefatio });
        if (canon.length) cards.push({ id: 'canon', type: 'Canon Missæ & Consecratio', badge: 'Canon', lines: canon });
        if (communionPrep.length) cards.push({ id: 'communion_prep', type: 'Pater Noster, Agnus Dei & Preces Communionis', badge: 'Ordinarium', lines: communionPrep });
        if (resolvedProps['Communio']) cards.push({ id: 'communio', type: 'Communio', badge: 'Proprium', lines: resolvedProps['Communio'] });
        if (resolvedProps['Postcommunio']) cards.push({ id: 'postcommunio', type: 'Postcommunio', badge: 'Oratio', lines: resolvedProps['Postcommunio'] });
        if (conclusio.length) cards.push({ id: 'conclusio', type: 'Ite Missa est & Ultimum Evangelium', badge: 'Ordinarium', lines: conclusio });
        if (leonis.length) cards.push({ id: 'leonis', type: 'Orationes Leonis XIII', badge: 'Preces', lines: leonis });

        callback(null, { title: feastTitle, cards: cards, loadedPath: loadedPath || null, communeRef: communeRef || null });
    }
}

function convertFeastKeyToCode(key) {
    if (!key) return null;

    // Direct season / proper mappings to Divinum Officium file codes
    var seasonMap = {
        'Adv1': 'Adv1-0', 'Adv2': 'Adv2-0', 'Adv3': 'Adv3-0', 'Adv4': 'Adv4-0',
        'Dec25_1': '12-25', 'Dec25_2': '12-25', 'Dec25_3': '12-25',
        'Epi': '01-06', 'Epi1': 'Epi1-0', 'Epi2': 'Epi2-0', 'Epi3': 'Epi3-0', 'Epi4': 'Epi4-0', 'Epi5': 'Epi5-0', 'Epi6': 'Epi6-0',
        '7a': 'Quadp1-0', '6a': 'Quadp2-0', '5a': 'Quadp3-0', '5aw': 'Quadp3-3',
        'Quad1': 'Quad1-0', 'Quad2': 'Quad2-0', 'Quad3': 'Quad3-0', 'Quad4': 'Quad4-0',
        'Quad5': 'Quad5-0', 'Quad6': 'Quad6-0', 'Quad6h': 'Quad6-4', 'Quad6f': 'Quad6-5', 'Quad6s': 'Quad6-6',
        'Pasc0': 'Pasc0-0', 'Pasc1': 'Pasc1-0', 'Pasc2': 'Pasc2-0', 'Pasc3': 'Pasc3-0', 'Pasc4': 'Pasc4-0', 'Pasc5': 'Pasc5-0',
        'Asc': 'Pasc5-4', 'Pasc6': 'Pasc6-0', 'Pent0': 'Pasc7-0',
        'Trin': 'Pent01-0', 'Corp': 'Pent01-4', 'SH': 'Pent02-5', 'ChristRex': '10-DU',
        'SMadvent': 'C11', 'SMchristmas': 'C11', 'SMlent': 'C11', 'SMpasch': 'C11', 'SMperannum': 'C11',
        'requiem': 'Defunctorum', 'nuptial': 'C12', 'angels': '09-29'
    };

    if (seasonMap[key]) return seasonMap[key];

    // Pent01 - Pent24
    var pentMatch = key.match(/^Pent(\d+)$/i);
    if (pentMatch) {
        var pNum = parseInt(pentMatch[1], 10);
        var pStr = (pNum < 10 ? '0' + pNum : '' + pNum);
        return 'Pent' + pStr + '-0';
    }

    var m = key.match(/^([A-Za-z]{3})(\d+)(.*)$/);
    if (m) {
        var mon = m[1], day = m[2], sfx = m[3];
        var monMap = {
            'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'May': '05', 'Jun': '06',
            'Jul': '07', 'Aug': '08', 'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
        };
        if (monMap[mon]) {
            var dInt = parseInt(day, 10);
            var dd = (dInt < 10 ? '0' + dInt : '' + dInt);
            return dd ? (monMap[mon] + '-' + dd + sfx) : key;
        }
    }
    return key;
}

function resolveAllHoursCards(cards, fullSections, langFolder, callback) {
    if (!cards || !cards.length) {
        callback([]);
        return;
    }
    var pending = cards.length;
    var resolvedCards = new Array(cards.length);

    cards.forEach(function(card, idx) {
        if (!card.lines || !card.lines.length) {
            resolvedCards[idx] = card;
            pending--;
            if (pending === 0) callback(resolvedCards);
            return;
        }

        resolveSectionText(card.id, card.lines, fullSections, langFolder, false, function(resLines) {
            card.lines = resLines;
            resolvedCards[idx] = card;
            pending--;
            if (pending === 0) callback(resolvedCards);
        });
    });
}


function loadHoursData(date, hora, langKey, callback) {
    var codes = computeLiturgicalCodes(date);
    var langFolder = getLangFolder(langKey);
    var feastKey = convertFeastKeyToCode(doState.officiumKey) || null;

    var laDayPath = 'do_data/horas/Latin/Sancti/' + (feastKey || codes.sancti) + '.txt';
    var laTempPath = 'do_data/horas/Latin/Tempora/' + (feastKey || codes.tempora) + '.txt';

    // If user explicitly selected a feast/office, honor it directly
    if (feastKey) {
        fetchLocalFile(laDayPath, function(err, laData) {
            var dayFileText = (!err && laData) ? laData : null;
            if (!dayFileText) {
                fetchLocalFile(laTempPath, function(err2, laTData) {
                    processHoursWithLatinRule((!err2 && laTData) ? laTData : '', hora, langFolder, langKey, date, true, callback);
                });
            } else {
                processHoursWithLatinRule(dayFileText, hora, langFolder, langKey, date, false, callback);
            }
        });
        return;
    }

    // Automatic Sunday resolution:
    if (codes.isSunday) {
        fetchLocalFile(laDayPath, function(errS, laSanctiData) {
            var isGreater = (!errS && laSanctiData) ? isSanctiGreaterFeastOnSunday(laSanctiData) : false;
            if (isGreater) {
                // Greater feast (I. classis or Festum Domini)
                processHoursWithLatinRule(laSanctiData, hora, langFolder, langKey, date, false, callback);
            } else {
                // Standard Sunday: Temporale takes precedence
                fetchLocalFile(laTempPath, function(errT, laTData) {
                    if (!errT && laTData) {
                        processHoursWithLatinRule(laTData, hora, langFolder, langKey, date, true, callback);
                    } else if (laSanctiData) {
                        processHoursWithLatinRule(laSanctiData, hora, langFolder, langKey, date, false, callback);
                    } else {
                        processHoursWithLatinRule('', hora, langFolder, langKey, date, false, callback);
                    }
                });
            }
        });
    } else {
        // Weekday (Feria): Sancti first, fallback to Temporale
        fetchLocalFile(laDayPath, function(err, laData) {
            var dayFileText = (!err && laData) ? laData : null;
            if (!dayFileText) {
                fetchLocalFile(laTempPath, function(err2, laTData) {
                    processHoursWithLatinRule((!err2 && laTData) ? laTData : '', hora, langFolder, langKey, date, true, callback);
                });
            } else {
                processHoursWithLatinRule(dayFileText, hora, langFolder, langKey, date, false, callback);
            }
        });
    }
}

function processHoursWithLatinRule(laFileText, hora, langFolder, langKey, date, isTemporaleSource, callback) {
    var laSec = parseSections(laFileText);
    var ruleLine = (laSec['Rule'] && laSec['Rule'][0]) ? laSec['Rule'][0] : '';
    var communeMatch = ruleLine.match(/ex\s+([A-Za-z0-9]+)/);
    var communeFile = communeMatch ? communeMatch[1] : null;

    var feastKey = convertFeastKeyToCode(doState.officiumKey) || null;
    var codes = computeLiturgicalCodes(date);
    var vernDayPath = 'do_data/horas/' + langFolder + '/Sancti/' + (feastKey || codes.sancti) + '.txt';
    var vernTempPath = 'do_data/horas/' + langFolder + '/Tempora/' + (feastKey || codes.tempora) + '.txt';

    fetchLocalFile(vernDayPath, function(err, vData) {
        var vFile = (!err && vData) ? vData : null;
        if (!vFile) {
            fetchLocalFile(vernTempPath, function(err2, vTData) {
                assembleWithCommune(laSec, parseSections(vTData || ''), communeFile, hora, langFolder, langKey, callback);
            });
        } else {
            assembleWithCommune(laSec, parseSections(vFile), communeFile, hora, langFolder, langKey, callback);
        }
    });
}

function assembleWithCommune(laDaySec, vernDaySec, communeFile, hora, langFolder, langKey, callback) {
    if (communeFile) {
        var laComPath = 'do_data/horas/Latin/Commune/' + communeFile + '.txt';
        var vernComPath = 'do_data/horas/' + langFolder + '/Commune/' + communeFile + '.txt';

        fetchLocalFile(laComPath, function(err1, laComData) {
            var laComSec = (!err1 && laComData) ? parseSections(laComData) : {};
            fetchLocalFile(vernComPath, function(err2, vComData) {
                var vernComSec = (!err2 && vComData) ? parseSections(vComData) : {};
                assembleOfficeStrict(laDaySec, vernDaySec, laComSec, vernComSec, hora, langFolder, langKey, callback);
            });
        });
    } else {
        assembleOfficeStrict(laDaySec, vernDaySec, {}, {}, hora, langFolder, langKey, callback);
    }
}

function assembleOfficeStrict(laDay, vDay, laCom, vCom, hora, langFolder, langKey, callback) {
    var cards = [];
    var activeDay = (langFolder === 'Latin') ? laDay : vDay;
    var activeCom = (langFolder === 'Latin') ? laCom : vCom;

    var feastTitle = (activeDay['Officium'] && activeDay['Officium'][0]) ? activeDay['Officium'][0].trim() : (laDay['Officium'] && laDay['Officium'][0] ? laDay['Officium'][0].trim() : 'Officium Diei');

    // Recursive Section Resolver across Day, Commune & Fallbacks
    function getSec(tag, visited) {
        if (!visited) visited = {};
        if (visited[tag]) return null;
        visited[tag] = true;

        var raw = activeDay[tag] || activeCom[tag] || laDay[tag] || laCom[tag] || null;
        if (!raw || !raw.length) {
            // Also try aliases
            var match = getSectionWithAliases(activeDay, tag) || getSectionWithAliases(activeCom, tag) || getSectionWithAliases(laDay, tag) || getSectionWithAliases(laCom, tag);
            if (match) raw = match.lines;
            else return null;
        }

        var first = raw[0].trim();
        // Local section reference @:Ant Vespera or @:Hymnus Vespera
        if (first.indexOf('@:') === 0) {
            var targetTag = first.substring(2).trim();
            var resolved = getSec(targetTag, visited);
            if (resolved) return resolved;
        }
        // External file reference @Commune/C1:Hymnus or @Commune/C4a or @Sancti/02-24:Ant 1
        if (first.indexOf('@') === 0) {
            var parts = first.substring(1).split(':');
            var secName = parts[1] ? parts[1].trim() : tag;
            if (secName) {
                var resolved2 = getSec(secName, visited);
                if (resolved2) return resolved2;
            }
        }

        return raw;
    }

    // ---- MATUTINUM ----
    if (hora === 'matutinum') {
        cards.push({ id: 'incipit', type: 'Incipit', badge: 'Incipit', lines: getLitText('incipit_matutinum', langKey) });

        var invitAnt = getSec('Invit') || (langKey === 'la' ? ['Regem Apostolórum Dóminum, * Veníte, adorémus.'] : ['Le Seigneur, Roi des Apôtres, * Venez, adorons.']);
        cards.push({ id: 'invitatorium', type: 'Invitatorium', badge: 'Invitatorium', lines: buildInvitatoriumLines(invitAnt, langKey) });

        var hymMat = getSec('Hymnus Matutinum') || getSec('Hymnus Vespera') || getSec('Hymnus') || (langKey === 'la' ? ['Ætérna Christi múnera,\nApostolórum glóriam,\nPalmas et hymnos débitos\nLætis canámus méntibus.'] : ['Chantons avec des cœurs joyeux\nLes bienfaits éternels du Christ,\nLa gloire des Apôtres,\nPalmes et hymnes mérités.']);
        cards.push({ id: 'hymnus', type: 'Hymnus', badge: 'Hymnus', lines: hymMat });

        var antMat = getSec('Ant Matutinum') || getSec('Ant Vespera') || (langKey === 'la' ? ['In omnem terram * exívit sonus eórum.'] : ['Dans toute la terre, * leur bruit s’est répandu.']);
        cards.push({ id: 'nocturnus', type: 'Nocturnus & Psalmi', badge: 'Psalmus', lines: antMat });

        for (var i = 1; i <= 9; i++) {
            var lec = getSec('Lectio' + i);
            var resp = getSec('Responsory' + i) || getSec('Responsorium' + i);
            if (lec && lec.length) {
                cards.push({ id: 'lectio_' + i, type: 'Lectio ' + i, badge: 'Lectio', lines: lec });
                if (resp && resp.length) {
                    cards.push({ id: 'responsory_' + i, type: 'Responsorium ' + i, badge: 'Responsorium', lines: resp });
                }
            }
        }

        cards.push({ id: 'te_deum', type: 'Te Deum', badge: 'Hymnus', lines: getLitText('te_deum', langKey) });

        var oraMat = getSec('Oratio') || ['$Per Dominum'];
        cards.push({ id: 'oratio', type: 'Oratio', badge: 'Oratio', lines: oraMat });

        resolveAllHoursCards(cards, Object.assign({}, activeCom, activeDay), langFolder, function(finalCards) { callback(null, { title: feastTitle, cards: finalCards }); });
        return;
    }

    // ---- LAUDES ----
    if (hora === 'laudes') {
        cards.push({ id: 'incipit', type: 'Incipit', badge: 'Incipit', lines: getLitText('incipit_day', langKey) });

        var antLaudes = getSec('Ant Laudes') || getSec('Ant Vespera') || (langKey === 'la' ? ['Allelúia, * allelúia, allelúia.'] : ['Alléluia, * alléluia, alléluia.']);
        cards.push({ id: 'antiphona', type: 'Antiphonæ & Psalmi', badge: 'Psalmus', lines: antLaudes });

        var capLaudes = getSec('Capitulum Laudes') || getSec('Capitulum Vespera') || (langKey === 'la' ? ['Benedíctus Deus, et Pater Dómini nostri Jesu Christi.', 'R. Deo grátias.'] : ['Béni soit Dieu, et Père de notre Seigneur Jésus-Christ.', 'R. Rendons grâces à Dieu.']);
        cards.push({ id: 'capitulum', type: 'Capitulum', badge: 'Capitulum', lines: capLaudes });

        var hymLaudes = getSec('Hymnus Laudes') || getSec('Hymnus Vespera') || getSec('Hymnus') || (langKey === 'la' ? ['Ætérne rerum Cónditor,\nNoctem diémque qui regis,\nEt témporum das témpora,\nUt álleves fastídium:'] : ['Créateur éternel des choses,\nToi qui gouvernes la nuit et le jour,\nEt donnes au temps la diversité des saisons,\nPour soulager la lassitude humaine :']);
        cards.push({ id: 'hymnus', type: 'Hymnus', badge: 'Hymnus', lines: hymLaudes });

        var verLaudes = getSec('Versum 2') || getSec('Versum 1') || (langKey === 'la' ? ['V. Dóminus regnávit, decórem índuit.', 'R. Índuit Dóminus fortitúdinem, et præcínxit se virtúte.'] : ['V. Le Seigneur est Roi, il s’est revêtu de splendeur.', 'R. Le Seigneur s’est revêtu de puissance et s’en est ceint.']);
        cards.push({ id: 'versus', type: 'Versus', badge: 'Versus', lines: verLaudes });

        var antBen = getSec('Ant Benedictus') || getSec('Ant 2') || ['Benedíctus * Dóminus Deus Israël.'];
        cards.push({ id: 'benedictus', type: 'Canticum Benedictus', badge: 'Canticum', lines: ['Ant. ' + antBen.join(' ')].concat(getLitText('canticum_benedictus', langKey)) });

        var oraLaudes = getSec('Oratio') || ['$Per Dominum'];
        cards.push({ id: 'oratio', type: 'Oratio', badge: 'Oratio', lines: oraLaudes });

        resolveAllHoursCards(cards, Object.assign({}, activeCom, activeDay), langFolder, function(finalCards) { callback(null, { title: feastTitle, cards: finalCards }); });
        return;
    }

    // ---- VESPERAE ----
    if (hora === 'vesperae') {
        cards.push({ id: 'incipit', type: 'Incipit', badge: 'Incipit', lines: getLitText('incipit_day', langKey) });

        var antLines = getSec('Ant Vespera') || ['Dixit Dóminus * Dómino meo: Sede a dextris meis.'];
        var capitulum = getSec('Capitulum Vespera') || getSec('Capitulum Laudes') || (langKey === 'la' ? ['Benedíctus Deus, et Pater Dómini nostri Jésus Christi.', 'R. Deo grátias.'] : ['Béni soit Dieu, et Père de notre Seigneur Jésus-Christ.', 'R. Rendons grâces à Dieu.']);
        var hymnus = getSec('Hymnus Vespera') || getSec('Hymnus') || (langKey === 'la' ? ['Lucis Creátor óptime,\nLucem diérum próferens,\nPrimórdiis lucis novæ,\nMundi parans oríginem:'] : ['Dieu bon, créateur de la lumière,\nQui avez produit le flambeau des jours,\nVous avez préludé à l’origine de ce monde,\nEn allumant les premiers éclats de ces astres nouveaux.']);
        var versus = getSec('Versum 1') || (langKey === 'la' ? ['V. Dirigátur, Dómine, orátio mea.', 'R. Sicut incénsum in conspéctu tuo.'] : ['V. Que ma prière s’élève, Seigneur.', 'R. Comme l’encens devant votre face.']);
        var antMag = getSec('Ant Magnificat') || getSec('Ant 1') || getSec('Ant 3') || ['Magníficat * ánima mea Dóminum.'];
        var oratio = getSec('Oratio') || ['$Per Dominum'];

        var psalmNums = [109, 110, 111, 112, 113];
        var loadedPsalms = [];
        var pPending = psalmNums.length;

        psalmNums.forEach(function(pNum, idx) {
            fetchPsalmText(pNum, langKey, function(pLines) {
                var antText = antLines[idx] || antLines[0] || '';
                var dox = (langKey === 'la') ? ['Glória Patri, et Fílio, * et Spirítui Sancto.', 'Sicut erat in princípio, et nunc, et semper, * et in sǽcula sæculórum. Amen.'] : ['Gloire au Père, et au Fils, * et au Saint-Esprit.', 'Comme il était au commencement, maintenant et toujours, * et dans les siècles des siècles. Ainsi soit-il.'];
                loadedPsalms[idx] = {
                    id: 'psalmus_' + pNum,
                    type: 'Psalmus ' + pNum,
                    badge: 'Psalmus',
                    lines: (antText ? ['Ant. ' + antText] : []).concat(pLines.length ? pLines : ['Psalmus ' + pNum]).concat(dox)
                };
                pPending--;
                if (pPending === 0) {
                    cards = cards.concat(loadedPsalms).concat([
                        { id: 'capitulum', type: 'Capitulum', badge: 'Capitulum', lines: capitulum },
                        { id: 'hymnus', type: 'Hymnus', badge: 'Hymnus', lines: hymnus },
                        { id: 'versus', type: 'Versus', badge: 'Versus', lines: versus },
                        { id: 'magnificat', type: 'Canticum Magnificat', badge: 'Canticum', lines: ['Ant. ' + antMag.join(' ')].concat(getLitText('canticum_magnificat', langKey)) },
                        { id: 'oratio', type: 'Oratio', badge: 'Oratio', lines: oratio }
                    ]);
                    resolveAllHoursCards(cards, Object.assign({}, activeCom, activeDay), langFolder, function(finalCards) { callback(null, { title: feastTitle, cards: finalCards }); });
                }
            });
        });
        return;
    }

    // ---- COMPLETORIUM ----
    if (hora === 'completorium') {
        fetchPsalmText(4, langKey, function(ps4) {
            fetchPsalmText(90, langKey, function(ps90) {
                fetchPsalmText(133, langKey, function(ps133) {
                    var dox = (langKey === 'la') ? ['Glória Patri, et Fílio, * et Spirítui Sancto.', 'Sicut erat in princípio, et nunc, et semper, * et in sǽcula sæculórum. Amen.'] : ['Gloire au Père, et au Fils, * et au Saint-Esprit.', 'Comme il était au commencement, maintenant et toujours, * et dans les siècles des siècles. Ainsi soit-il.'];
                    cards = [
                        { id: 'incipit', type: 'Incipit', badge: 'Incipit', lines: getLitText('incipit_completorium', langKey) },
                        { id: 'lectio_brevis', type: 'Lectio Brevis', badge: 'Lectio', lines: getLitText('lectio_brevis_comp', langKey) },
                        { id: 'preces_comp', type: 'Preces & Confiteor', badge: 'Oratio', lines: getLitText('preces_comp', langKey).concat(getLitText('confiteor', langKey)) },
                        { id: 'antiphona', type: 'Antiphona', badge: 'Antiphona', lines: getLitText('ant_miserere', langKey) },
                        { id: 'psalmus_4', type: 'Psalmus 4', badge: 'Psalmus', lines: ps4.concat(dox) },
                        { id: 'psalmus_90', type: 'Psalmus 90', badge: 'Psalmus', lines: ps90.concat(dox) },
                        { id: 'psalmus_133', type: 'Psalmus 133', badge: 'Psalmus', lines: ps133.concat(dox) },
                        { id: 'hymnus', type: 'Hymnus', badge: 'Hymnus', lines: getLitText('hymn_te_lucis', langKey) },
                        { id: 'capitulum', type: 'Capitulum', badge: 'Capitulum', lines: getLitText('cap_tu_autem', langKey) },
                        { id: 'responsorium', type: 'Responsorium Breve', badge: 'Responsorium', lines: getLitText('resp_in_manus', langKey) },
                        { id: 'nunc_dimittis', type: 'Canticum Nunc Dimittis', badge: 'Canticum', lines: getLitText('canticum_nunc_dimittis', langKey) },
                        { id: 'oratio', type: 'Oratio', badge: 'Oratio', lines: getLitText('oratio_visita', langKey) },
                        { id: 'salve_regina', type: 'Antiphona Finalis B.M.V.', badge: 'Antiphona', lines: getLitText('salve_regina', langKey) }
                    ];
                    resolveAllHoursCards(cards, Object.assign({}, activeCom, activeDay), langFolder, function(finalCards) { callback(null, { title: feastTitle, cards: finalCards }); });
                });
            });
        });
        return;
    }

    // ---- LITTLE HOURS (Prima, Tertia, Sexta, Nona) ----
    var minorHymnsLa = {
        prima:  ['Jam lucis orto sídere,\nDeum precémur súpplices,\nUt in diúrnis áctibus\nNos servet a nocéntibus.'],
        tertia: ['Nunc, Sancte, nobis, Spíritus,\nUnum Patri cum Fílio,\nDignáre promptus íngeri\nNostro refúsus péctori.'],
        sexta:  ['Rector potens, verax Deus,\nQui témperas rerum vices,\nSplendóre mane ínstruis,\nEt ígnibus merídiem:'],
        nona:   ['Rerum, Deus, tenax vigor,\nImmótus in te pérmanens,\nLucis diúrnæ témpora\nSuccéssibus detérminans:']
    };

    var minorHymnsFr = {
        prima:  ['Déjà l’astre du jour se lève,\nPrions Dieu suppliants\nQu’en toutes nos actions du jour\nIl nous garde de tout péché.'],
        tertia: ['Viens maintenant, Saint-Esprit,\nUn avec le Père et le Fils,\nDaigne promptement descendre\nEt remplir nos cœurs de ta grâce.'],
        sexta:  ['Souverain puissant, Dieu de vérité,\nQui règles l’ordre de l’univers,\nTu pares le matin de splendeur\nEt le midi de feux éclatants.'],
        nona:   ['Dieu, force immuable des choses,\nToi qui demeures immobile en toi-même,\nEt règles les heures du jour\nDans leur cours successif.']
    };

    var hymLines = (langKey === 'la') ? (minorHymnsLa[hora] || minorHymnsLa.prima) : (minorHymnsFr[hora] || minorHymnsLa[hora] || minorHymnsLa.prima);
    var capMinor = getSec('Capitulum ' + hora.charAt(0).toUpperCase() + hora.slice(1)) || getSec('Capitulum Laudes') || (langKey === 'la' ? ['Dóminus Deus noster.', 'R. Deo grátias.'] : ['Le Seigneur est notre Dieu.', 'R. Rendons grâces à Dieu.']);
    var respMinor = getSec('Responsory Breve ' + hora.charAt(0).toUpperCase() + hora.slice(1)) || (langKey === 'la' ? ['V. Adjuva nos, Deus. R. Amen.'] : ['V. Venez à notre secours, ô Dieu. R. Amen.']);
    var oraMinor = getSec('Oratio') || ['$Per Dominum'];

    cards = [
        { id: 'incipit', type: 'Incipit', badge: 'Incipit', lines: getLitText('incipit_day', langKey) },
        { id: 'hymnus', type: 'Hymnus', badge: 'Hymnus', lines: hymLines },
        { id: 'capitulum', type: 'Capitulum', badge: 'Capitulum', lines: capMinor },
        { id: 'responsorium', type: 'Responsorium Breve', badge: 'Responsorium', lines: respMinor },
        { id: 'oratio', type: 'Oratio', badge: 'Oratio', lines: oraMinor }
    ];

    resolveAllHoursCards(cards, Object.assign({}, activeCom, activeDay), langFolder, function(finalCards) { callback(null, { title: feastTitle, cards: finalCards }); });
}

// ---- UI Card Renderer with 2 Distinct Language Parameters ----

function renderOfficeCardHTML(cardData, vernCardData) {
    var type = cardData.type || '';
    var badge = cardData.badge || 'Liturgia';
    var lines = cardData.lines || [];

    var isCanticle = /magnificat|benedictus|nunc dimittis|canticum/i.test(type + badge);
    var isAntiphon = /antiphona/i.test(type + badge);
    var isMissa = (doState.hora === 'missa');

    var cardMod = isMissa ? ' is-missa' : isCanticle ? ' is-canticle' : isAntiphon ? ' is-antiphon' : '';
    var typeMod = isMissa ? ' is-missa' : isCanticle ? ' is-canticle' : isAntiphon ? ' is-rubric' : '';

    var bodyHtml = '';
    var isBilingual = (doState.showLatin && doState.vernacularLang && doState.vernacularLang !== 'none' && vernCardData && vernCardData.lines && vernCardData.lines.length);
    var isVernOnly = (!doState.showLatin && doState.vernacularLang && doState.vernacularLang !== 'none' && vernCardData && vernCardData.lines && vernCardData.lines.length);

    if (isBilingual) {
        bodyHtml = renderBilingualCardBody(lines, vernCardData.lines, badge, doState.vernacularLang);
    } else if (isVernOnly) {
        bodyHtml = formatCardBody(vernCardData.lines, badge, doState.vernacularLang);
    } else {
        bodyHtml = formatCardBody(lines, badge, 'la');
    }

    // Check if card is a psalm to add clickable Bible button
    var bibleBtnHtml = '';
    var psMatch = (type + ' ' + cardData.id).match(/psalm(?:us|_)?\s*(\d+)/i);
    if (psMatch) {
        var psNum = psMatch[1];
        bibleBtnHtml = '<button class="do-bible-btn" data-book="Psalmi" data-chapter="' + psNum + '" title="Ouvrir le Psaume ' + psNum + ' dans la Bible">' +
            '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>' +
            '<span>Ps. ' + psNum + ' (Bible)</span>' +
        '</button>';
    }

    var cardIdAttr = cardData.id ? ' data-card-id="' + escHtml(cardData.id) + '"' : '';
    return '<div class="do-card' + cardMod + '"' + cardIdAttr + '>' +
        '<div class="do-card-header">' +
            '<div>' +
                '<span class="do-card-type' + typeMod + '">' + escHtml(badge.toUpperCase()) + '</span>' +
                '<h3 class="do-card-title">' + escHtml(type) + '</h3>' +
            '</div>' +
            (bibleBtnHtml ? '<div class="do-card-actions">' + bibleBtnHtml + '</div>' : '') +
        '</div>' +
        '<div class="do-card-body">' + bodyHtml + '</div>' +
    '</div>';
}

function getProcessedLines(lines, targetLang) {
    if (!lines || !lines.length) return [];
    var out = [];
    lines.forEach(function(rawLine) {
        var cl = cleanLiturgicalLine(rawLine, targetLang);
        if (cl) {
            cl.split('\n').forEach(function(sub) {
                sub = sub.trim();
                if (sub) out.push(sub);
            });
        }
    });

    // Merge broken lines starting with mid-prayer parenthetical rubrics
    var merged = [];
    out.forEach(function(line) {
        if (merged.length && /^\([^)]+\)\s+[A-Za-z\u00C0-\u024F]/i.test(line) && !/^[SMPCOvrVRD]\.[\s\u00a0]*/i.test(line) && !/^!/.test(line)) {
            var prev = merged[merged.length - 1];
            if (/^[SMPCOvrVRD]\.[\s\u00a0]*/i.test(prev) && !/^!/.test(prev)) {
                merged[merged.length - 1] = prev + ' ' + line;
                return;
            }
        }
        merged.push(line);
    });

    return merged;
}

function splitHymnStanzas(lines) {
    var stanzas = [];
    var cur = [];
    lines.forEach(function(l) {
        if (!l || l === '_') {
            if (cur.length) { stanzas.push(cur); cur = []; }
        } else {
            cur.push(l);
        }
    });
    if (cur.length) stanzas.push(cur);
    if (!stanzas.length && lines.length) stanzas = [lines];
    return stanzas;
}

// ---- Language-Aware Hyphenation Engine (Hypher Integration) ----
function hyphenateHtmlText(html, lang) {
    if (!html || typeof html !== 'string') return html;
    if (typeof Hypher === 'undefined' || !Hypher.languages) return html;

    var targetLang = (lang || 'la').toLowerCase();
    var h = Hypher.languages[targetLang];
    if (!h) {
        if (targetLang === 'fr' || targetLang === 'fr-fr') h = Hypher.languages['fr-FR'] || Hypher.languages['fr'];
        else if (targetLang === 'en' || targetLang === 'en-us') h = Hypher.languages['en-us'] || Hypher.languages['en'];
        else if (targetLang === 'la' || targetLang === 'la_va') h = Hypher.languages['la'] || Hypher.languages['la_VA'];
        else if (targetLang === 'it') h = Hypher.languages['it'];
        else if (targetLang === 'pl') h = Hypher.languages['pl'];
    }
    if (!h) return html;

    var parts = html.split(/(<[^>]+>)/g);
    for (var i = 0; i < parts.length; i++) {
        if (parts[i] && !parts[i].startsWith('<')) {
            parts[i] = h.hyphenateText(parts[i]);
        }
    }
    return parts.join('');
}

function hyphenateDomTree(el, lang) {
    if (!el || typeof Hypher === 'undefined' || !Hypher.languages) return;
    var targetLang = (lang || 'la').toLowerCase();
    var h = Hypher.languages[targetLang];
    if (!h) {
        if (targetLang === 'fr' || targetLang === 'fr-fr') h = Hypher.languages['fr-FR'] || Hypher.languages['fr'];
        else if (targetLang === 'en' || targetLang === 'en-us') h = Hypher.languages['en-us'] || Hypher.languages['en'];
        else if (targetLang === 'la' || targetLang === 'la_va') h = Hypher.languages['la'] || Hypher.languages['la_VA'];
        else if (targetLang === 'it') h = Hypher.languages['it'];
        else if (targetLang === 'pl') h = Hypher.languages['pl'];
    }
    if (!h) return;

    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
    var node;
    while ((node = walker.nextNode())) {
        var pName = node.parentNode ? node.parentNode.nodeName : '';
        if (pName === 'SCRIPT' || pName === 'STYLE') continue;
        if (node.nodeValue && node.nodeValue.indexOf('\u00AD') === -1) {
            node.nodeValue = h.hyphenateText(node.nodeValue);
        }
    }
}

function applyHyphenationToContainer($container) {
    if (typeof Hypher === 'undefined' || !Hypher.languages || !$container || !$container.length) return;

    var vernLang = (doState.vernacularLang && doState.vernacularLang !== 'none') ? doState.vernacularLang : 'fr';

    // 1. Process explicit Latin elements
    $container.find('.do-col-la, [lang="la"], .do-bible-la-col').each(function() {
        hyphenateDomTree(this, 'la');
    });

    // 2. Process explicit Vernacular elements
    $container.find('.do-col-vernacular, [lang="' + vernLang + '"], .do-bible-vern-col').each(function() {
        hyphenateDomTree(this, vernLang);
    });

    // 3. Process single cards & any remaining card bodies
    $container.find('.do-card-body').each(function() {
        var cLang = $(this).attr('lang') || $(this).closest('[lang]').attr('lang') || (doState.showLatin ? 'la' : vernLang);
        hyphenateDomTree(this, cLang);
    });
}

function formatSingleParagraph(l, langKey) {
    if (!l) return '';
    l = l.trim();

    // Skip lone dashes, hyphens, underscores or horizontal rule markers
    if (/^[-–—_~*]+$/.test(l)) return '';

    // Consecration words (e.g. !!!HOC EST ENIM CORPUS MEUM or !!!CAR CECI EST MON CORPS)
    // Must be rendered in black (normal body text color), bold/distinctive, NOT in red rubric color
    if (/^!{3,}/.test(l) || /^!(HOC EST ENIM|HIC EST ENIM|CAR CECI EST)/i.test(l)) {
        var cText = l.replace(/^!+/, '').trim();
        var formattedConsecration = formatLiturgicalSymbols(escHtml(cText));
        if (langKey) formattedConsecration = hyphenateHtmlText(formattedConsecration, langKey);
        return '<p class="do-consecration-words"><strong>' + formattedConsecration + '</strong></p>';
    }

    if (/^!/i.test(l)) {
        var rText = l.replace(/^!+/, '').trim();
        if (/^(Ps\.|[0-9]?\s?[A-Z][a-z]+ [0-9]+:)/i.test(rText) && rText.length < 35) {
            return '<span class="do-source-ref">' + escHtml(rText) + '</span>';
        }
        var formattedRubric = formatLiturgicalSymbols(escHtml(rText));
        if (langKey) formattedRubric = hyphenateHtmlText(formattedRubric, langKey);
        return '<div class="do-rubric-inline">' + formattedRubric + '</div>';
    }

    // Speakers: S (Sacerdos), P (Populus), M (Minister), C (Cantor/Celebrans), O (Omnes/Orans), V (Versiculus), R (Responsorium), D (Diaconus)
    if (/^[SMPCOvrVRD]\.[\s\u00a0]*/i.test(l)) {
        var sym = l.substring(0, 1).toUpperCase();
        var symDisp = (sym === 'V') ? '℣.' : (sym === 'R') ? '℟.' : (sym + '.');
        var rest = l.replace(/^[SMPCOvrVRD]\.[\s\u00a0]*/i, '').trim();
        var text = formatLiturgicalSymbols(escHtml(rest));
        if (langKey) text = hyphenateHtmlText(text, langKey);
        return '<p class="do-dialog-line"><span class="do-resp-sym ' + sym + '">' + symDisp + '</span> ' + text + '</p>';
    }

    var text = formatLiturgicalSymbols(escHtml(l));
    if (langKey) text = hyphenateHtmlText(text, langKey);
    return '<p>' + text + '</p>';
}

// ---- Latin Psalmody & Cadence Formatting Engine with Partie Avant Detector ----
var VOWELS = /[aáàeéèiíìoóòuúùyýỳæœ]/i;
var ACCENTED_VOWELS = /[áéíóúý]/i;

function getSyllables(word) {
    if (!word) return [];
    return word.match(/[^aeiouyáéíóúæœ]*[aeiouyáéíóúæœ]+(?:[^aeiouyáéíóúæœ]+(?![aeiouyáéíóúæœ]))?/gi) || [word];
}

function findTonicSyllableIndex(syllables) {
    var n = syllables.length;
    if (n <= 1) return 0;
    if (n === 2) return 0; // Pénultième automatique en latin classique/ecclésiastique

    // Cherche un accent explicite
    for (var i = 0; i < n; i++) {
        if (ACCENTED_VOWELS.test(syllables[i])) return i;
    }

    // Par défaut sur la pénultième si non spécifié
    return n - 2;
}

function processHemistich(hemistich, accentsCount, prepCount) {
    if (typeof accentsCount !== 'number') accentsCount = 1;
    if (typeof prepCount !== 'number') prepCount = 0;

    var tokens = hemistich.trim().split(/\s+/);
    if (!tokens.length || !tokens[0]) return hemistich;

    // Build flattened syllable list with word references
    var allSyllables = [];
    tokens.forEach(function(rawWord, wIdx) {
        var leadMatch = rawWord.match(/^[^\p{L}]+/u);
        var trailMatch = rawWord.match(/[^\p{L}]+$/u);
        var leading = leadMatch ? leadMatch[0] : '';
        var trailing = trailMatch ? trailMatch[0] : '';
        var cleanWord = rawWord.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');

        if (!cleanWord) {
            allSyllables.push({ text: rawWord, isPunct: true, wIdx: wIdx, isTonic: false, leading: '', trailing: '' });
            return;
        }

        var syls = getSyllables(cleanWord);
        var tonicIdx = findTonicSyllableIndex(syls);

        syls.forEach(function(sText, sIdx) {
            allSyllables.push({
                text: sText,
                isPunct: false,
                wIdx: wIdx,
                sIdx: sIdx,
                isFirstInWord: (sIdx === 0),
                isLastInWord: (sIdx === syls.length - 1),
                isTonic: (sIdx === tonicIdx && syls.length > 1 || ACCENTED_VOWELS.test(sText)),
                leading: (sIdx === 0 ? leading : ''),
                trailing: (sIdx === syls.length - 1 ? trailing : ''),
                type: 'recit'
            });
        });
    });

    // 1. Find cadence accents scanning backwards
    var accentsFound = 0;
    var firstAccentSylIdx = -1;

    for (var i = allSyllables.length - 1; i >= 0; i--) {
        var s = allSyllables[i];
        if (s.isPunct) continue;
        if (s.isTonic && accentsFound < accentsCount) {
            s.type = 'accent';
            accentsFound++;
            firstAccentSylIdx = i;
        }
    }

    if (firstAccentSylIdx === -1 && allSyllables.length > 0) {
        firstAccentSylIdx = Math.max(0, allSyllables.length - 2);
        allSyllables[firstAccentSylIdx].type = 'accent';
    }

    // 2. Détecteur de partie avant (syllabes de préparation avant le premier accent de cadence)
    if (prepCount > 0 && firstAccentSylIdx > 0) {
        var prepsFound = 0;
        for (var j = firstAccentSylIdx - 1; j >= 0 && prepsFound < prepCount; j--) {
            var sp = allSyllables[j];
            if (!sp.isPunct) {
                sp.type = 'prep';
                prepsFound++;
            }
        }
    }

    // 3. Rebuild formatted hemistich
    var result = '';
    var curWordIdx = -1;

    allSyllables.forEach(function(s) {
        if (s.wIdx !== curWordIdx) {
            if (curWordIdx !== -1) result += ' ';
            curWordIdx = s.wIdx;
        }
        var formattedText = s.text;
        if (s.type === 'accent') {
            formattedText = '<b>' + formattedText + '</b>';
        } else if (s.type === 'prep') {
            formattedText = '<u>' + formattedText + '</u>';
        }
        result += s.leading + formattedText + s.trailing;
    });

    return result;
}

function formatPsalmodie(verset, options) {
    if (!verset) return '';
    if (!options) options = {};

    var accentsMed = options.accentsMediante !== undefined ? options.accentsMediante : 1;
    var prepMed = options.prepMediante !== undefined ? options.prepMediante : 0;
    var accentsTerm = options.accentsTerminaison !== undefined ? options.accentsTerminaison : 1;
    var prepTerm = options.prepTerminaison !== undefined ? options.prepTerminaison : 0;

    // Split on flexe † if present
    var flexPart = '';
    var mainVerse = verset;
    if (verset.indexOf('†') !== -1) {
        var fParts = verset.split('†');
        flexPart = processHemistich(fParts[0], 1, 0) + ' <span class="do-flexe">†</span> ';
        mainVerse = fParts.slice(1).join('†');
    }

    var parts = mainVerse.split('*');
    if (parts.length !== 2) {
        return flexPart + processHemistich(mainVerse, accentsMed, prepMed);
    }

    var left = processHemistich(parts[0], accentsMed, prepMed);
    var right = processHemistich(parts[1], accentsTerm, prepTerm);

    return flexPart + left + ' <span class="do-verse-mediant">*</span> ' + right;
}

// Export for global access
if (typeof window !== 'undefined') {
    window.getSyllables = getSyllables;
    window.findTonicSyllableIndex = findTonicSyllableIndex;
    window.processHemistich = processHemistich;
    window.formatPsalmodie = formatPsalmodie;
}

// Psalm verse without numbers (Continuous chanting flow with Cadence and Preparation support)
function formatSinglePsalmVerse(line, isDox, toneOptions, langKey) {
    if (!line) return '<div class="do-psalm-verse"></div>';
    line = line.trim();

    if (/^[-–—_~*]+$/.test(line)) return '';

    if (/^\{[^\}]+\}$/.test(line)) {
        var r = escHtml(line.substring(1, line.length - 1));
        if (langKey) r = hyphenateHtmlText(r, langKey);
        return '<div class="do-rubric-inline">' + r + '</div>';
    }

    if (/^Ant\./i.test(line)) {
        var antContent = line.replace(/^Ant\.\s*/i, '');
        var antHtml = formatLiturgicalSymbols(escHtml(antContent));
        if (langKey) antHtml = hyphenateHtmlText(antHtml, langKey);
        return '<div class="do-antiphon-line"><span class="do-ant-tag">Ant.</span> ' + antHtml + '</div>';
    }

    var inner;
    if (line.indexOf('*') !== -1 || line.indexOf('†') !== -1) {
        inner = formatPsalmodie(line, toneOptions);
    } else {
        inner = formatLiturgicalSymbols(escHtml(line));
    }
    if (langKey) inner = hyphenateHtmlText(inner, langKey);

    return '<div class="do-psalm-verse' + (isDox ? ' do-doxology' : '') + '">' +
        '<span class="do-verse-text">' + inner + '</span>' +
    '</div>';
}

function formatSingleRespLine(line, langKey) {
    if (!line) return '';
    line = line.trim();
    if (/^[-–—_~*]+$/.test(line)) return '';

    var sym = '', symCls = '';
    if (/^V\./i.test(line)) { sym = '℣.'; symCls = 'V'; line = line.replace(/^V\.\s*/i, ''); }
    else if (/^R\./i.test(line) || /^R\.br\./i.test(line)) { sym = '℟.'; symCls = 'R'; line = line.replace(/^R\.(br\.)?\s*/i, ''); }
    else if (/^[SMPCOD]\./i.test(line)) {
        var s = line.substring(0, 1).toUpperCase();
        sym = s + '.'; symCls = s;
        line = line.replace(/^[SMPCOD]\.\s*/i, '');
    }

    var inner = formatLiturgicalSymbols(escHtml(line));
    if (langKey) inner = hyphenateHtmlText(inner, langKey);
    return '<span class="do-resp-line">' +
        (sym ? '<span class="do-resp-sym ' + symCls + '">' + sym + '</span> ' : '') +
        inner +
    '</span>';
}

function formatSingleStanza(st, langKey) {
    return '<div class="do-hymn-stanza">' +
        st.filter(function(line) { return line && !/^[-–—_~*]+$/.test(line.trim()); }).map(function(line) {
            var cleanLine = line.replace(/^[vvr]\.\s*/i, '');
            var formattedLine = formatLiturgicalSymbols(escHtml(cleanLine));
            if (langKey) formattedLine = hyphenateHtmlText(formattedLine, langKey);
            return '<span class="do-hymn-line">' + formattedLine + '</span>';
        }).join('') +
    '</div>';
}

function getSpeakerType(line) {
    if (!line) return null;
    line = line.trim();
    if (/^[-–—_~*]+$/.test(line)) return null;
    // Lines starting with !, {, or entirely enclosed in parentheses or rubric text
    if (/^!/.test(line) || /^\{/.test(line) || /^\([^)]+\):?$/i.test(line) || (/^\(/.test(line) && /\)$/.test(line))) {
        return 'RUBRIC';
    }
    if (/^[SMPCOvrVRD]\.[\s\u00a0]*/i.test(line)) {
        return line.charAt(0).toUpperCase();
    }
    return 'TEXT';
}

function alignBilingualBlocks(laLines, vernLines) {
    var rows = [];
    var i = 0, j = 0;
    var n = laLines.length, m = vernLines.length;

    while (i < n || j < m) {
        var laL = (i < n) ? laLines[i] : '';
        var vernL = (j < m) ? vernLines[j] : '';

        if (!laL && !vernL) break;

        var laSp = getSpeakerType(laL);
        var vernSp = getSpeakerType(vernL);

        // 1. Both lines have identical speaker/rubric type
        if (laSp && vernSp && laSp === vernSp) {
            rows.push({ la: laL, vern: vernL });
            i++; j++;
            continue;
        }

        // 2. Both are liturgical prayer content (TEXT, V, R, S, P, M, C, O, D)
        var isLaPrayer = (laSp !== 'RUBRIC' && laSp !== null);
        var isVernPrayer = (vernSp !== 'RUBRIC' && vernSp !== null);

        if (isLaPrayer && isVernPrayer) {
            rows.push({ la: laL, vern: vernL });
            i++; j++;
            continue;
        }

        // 3. Both are rubrics
        if (laSp === 'RUBRIC' && vernSp === 'RUBRIC') {
            rows.push({ la: laL, vern: vernL });
            i++; j++;
            continue;
        }

        // 4. One is a RUBRIC and the other is a PRAYER
        // Check if the prayer is immediately followed by a rubric or if the rubric has a counterpart
        if (laSp === 'RUBRIC' && isVernPrayer) {
            // Check if Latin has a prayer immediately at i+1 matching vernL
            if (i + 1 < n && getSpeakerType(laLines[i + 1]) !== 'RUBRIC') {
                // If vernLines also has a rubric soon, don't desynchronize
                rows.push({ la: laL, vern: '' });
                i++;
                continue;
            }
        } else if (vernSp === 'RUBRIC' && isLaPrayer) {
            // Check if Vernacular has a prayer immediately at j+1 matching laL
            if (j + 1 < m && getSpeakerType(vernLines[j + 1]) !== 'RUBRIC') {
                rows.push({ la: '', vern: vernL });
                j++;
                continue;
            }
        }

        // 5. Default lockstep
        rows.push({ la: laL, vern: vernL });
        if (i < n) i++;
        if (j < m) j++;
    }

    return rows;
}

function renderBilingualCardBody(linesLa, linesVern, badge, langKey) {
    var laProcessed = getProcessedLines(linesLa, 'la').filter(function(l) { return l && !/^[-–—_~*]+$/.test(l.trim()); });
    var vernProcessed = getProcessedLines(linesVern, langKey).filter(function(l) { return l && !/^[-–—_~*]+$/.test(l.trim()); });
    var vernLangAttr = langKey || 'fr';

    var rows = [];

    if (/hymnus/i.test(badge)) {
        var laStanzas = splitHymnStanzas(laProcessed);
        var vernStanzas = splitHymnStanzas(vernProcessed);
        var maxS = Math.max(laStanzas.length, vernStanzas.length);
        for (var i = 0; i < maxS; i++) {
            var laSt = laStanzas[i] || [];
            var vernSt = vernStanzas[i] || [];
            rows.push(
                '<div class="do-bilingual-row">' +
                    '<div class="do-col-la" lang="la">' + (laSt.length ? formatSingleStanza(laSt, 'la') : '') + '</div>' +
                    '<div class="do-col-vernacular" lang="' + vernLangAttr + '">' + (vernSt.length ? formatSingleStanza(vernSt, langKey) : '') + '</div>' +
                '</div>'
            );
        }
    } else if (/psalmus|canticum|invitatorium/i.test(badge)) {
        var maxV = Math.max(laProcessed.length, vernProcessed.length);
        for (var i = 0; i < maxV; i++) {
            var laL = laProcessed[i] || '';
            var vernL = vernProcessed[i] || '';
            var isDox = /gl[oó]ria patri|sicut erat|gloire au p|comme il [eé]tait|glory be|as it was in|gloria al padre|como era en/i.test(laL || vernL);
            rows.push(
                '<div class="do-bilingual-row">' +
                    '<div class="do-col-la" lang="la">' + (laL ? formatSinglePsalmVerse(laL, isDox, null, 'la') : '') + '</div>' +
                    '<div class="do-col-vernacular" lang="' + vernLangAttr + '">' + (vernL ? formatSinglePsalmVerse(vernL, isDox, null, langKey) : '') + '</div>' +
                '</div>'
            );
        }
    } else if (/responsorium/i.test(badge)) {
        var maxR = Math.max(laProcessed.length, vernProcessed.length);
        for (var i = 0; i < maxR; i++) {
            var laL = laProcessed[i] || '';
            var vernL = vernProcessed[i] || '';
            rows.push(
                '<div class="do-bilingual-row">' +
                    '<div class="do-col-la" lang="la">' + (laL ? formatSingleRespLine(laL, 'la') : '') + '</div>' +
                    '<div class="do-col-vernacular" lang="' + vernLangAttr + '">' + (vernL ? formatSingleRespLine(vernL, langKey) : '') + '</div>' +
                '</div>'
            );
        }
    } else if (/antiphona/i.test(badge)) {
        var laText = hyphenateHtmlText(formatLiturgicalSymbols(escHtml(laProcessed.join(' '))), 'la');
        var vernText = hyphenateHtmlText(formatLiturgicalSymbols(escHtml(vernProcessed.join(' '))), langKey);
        rows.push(
            '<div class="do-bilingual-row">' +
                '<div class="do-col-la" lang="la"><div class="do-antiphon-text">' + laText + '</div></div>' +
                '<div class="do-col-vernacular" lang="' + vernLangAttr + '"><div class="do-antiphon-text">' + vernText + '</div></div>' +
            '</div>'
        );
    } else {
        var aligned = alignBilingualBlocks(laProcessed, vernProcessed);
        aligned.forEach(function(pair) {
            var laP = pair.la ? formatSingleParagraph(pair.la, 'la') : '';
            var vernP = pair.vern ? formatSingleParagraph(pair.vern, langKey) : '';
            if (laP || vernP) {
                rows.push(
                    '<div class="do-bilingual-row">' +
                        '<div class="do-col-la" lang="la">' + laP + '</div>' +
                        '<div class="do-col-vernacular" lang="' + vernLangAttr + '">' + vernP + '</div>' +
                    '</div>'
                );
            }
        });
    }

    return '<div class="do-bilingual-wrapper">' +
        '<div class="do-bilingual-grid">' +
            rows.join('') +
        '</div>' +
    '</div>';
}

function cleanLiturgicalLine(line, langKey) {
    if (!line) return '';
    line = line.trim();

    // Expand Variables & Endings
    var cleanKey = line.replace(/[\.\s]+$/, '').trim();
    if (DO_PRAYER_ENDINGS[cleanKey]) {
        return (DO_PRAYER_ENDINGS[cleanKey][langKey]) ? DO_PRAYER_ENDINGS[cleanKey][langKey] : DO_PRAYER_ENDINGS[cleanKey]['la'];
    }
    if (DO_PRAYER_ENDINGS[line]) {
        return (DO_PRAYER_ENDINGS[line][langKey]) ? DO_PRAYER_ENDINGS[line][langKey] : DO_PRAYER_ENDINGS[line]['la'];
    }
    if (/^&Gloria[12]?/i.test(line)) {
        return (DO_GLORIA_PATRI[langKey]) ? DO_GLORIA_PATRI[langKey] : DO_GLORIA_PATRI['la'];
    }

    if (/^\$Deo gr[aá]tias/i.test(line)) {
        return (DO_PRAYER_ENDINGS['$Deo gratias'][langKey]) ? DO_PRAYER_ENDINGS['$Deo gratias'][langKey] : DO_PRAYER_ENDINGS['$Deo gratias']['la'];
    }
    if (/^\$Per Dominum/i.test(line)) {
        return (DO_PRAYER_ENDINGS['$Per Dominum'][langKey]) ? DO_PRAYER_ENDINGS['$Per Dominum'][langKey] : DO_PRAYER_ENDINGS['$Per Dominum']['la'];
    }
    if (/^\$Qui tecum/i.test(line)) {
        return (DO_PRAYER_ENDINGS['$Qui tecum'][langKey]) ? DO_PRAYER_ENDINGS['$Qui tecum'][langKey] : DO_PRAYER_ENDINGS['$Qui tecum']['la'];
    }
    if (/^\$Qui vivis/i.test(line)) {
        return (DO_PRAYER_ENDINGS['$Qui vivis'][langKey]) ? DO_PRAYER_ENDINGS['$Qui vivis'][langKey] : DO_PRAYER_ENDINGS['$Qui vivis']['la'];
    }
    if (/^\$Amen/i.test(line)) {
        return (DO_PRAYER_ENDINGS['$Amen'][langKey]) ? DO_PRAYER_ENDINGS['$Amen'][langKey] : DO_PRAYER_ENDINGS['$Amen']['la'];
    }

    // Replace embedded $Variables
    line = line.replace(/\$Deo gr[aá]tias\.?/gi, function() {
        return (DO_PRAYER_ENDINGS['$Deo gratias'][langKey]) ? DO_PRAYER_ENDINGS['$Deo gratias'][langKey] : DO_PRAYER_ENDINGS['$Deo gratias']['la'];
    });
    line = line.replace(/\$Per Dominum\.?/gi, function() {
        return (DO_PRAYER_ENDINGS['$Per Dominum'][langKey]) ? DO_PRAYER_ENDINGS['$Per Dominum'][langKey] : DO_PRAYER_ENDINGS['$Per Dominum']['la'];
    });
    line = line.replace(/\$Qui tecum\.?/gi, function() {
        return (DO_PRAYER_ENDINGS['$Qui tecum'][langKey]) ? DO_PRAYER_ENDINGS['$Qui tecum'][langKey] : DO_PRAYER_ENDINGS['$Qui tecum']['la'];
    });
    line = line.replace(/\$Qui vivis\.?/gi, function() {
        return (DO_PRAYER_ENDINGS['$Qui vivis'][langKey]) ? DO_PRAYER_ENDINGS['$Qui vivis'][langKey] : DO_PRAYER_ENDINGS['$Qui vivis']['la'];
    });
    line = line.replace(/\$Amen\.?/gi, function() {
        return (DO_PRAYER_ENDINGS['$Amen'][langKey]) ? DO_PRAYER_ENDINGS['$Amen'][langKey] : DO_PRAYER_ENDINGS['$Amen']['la'];
    });

    // Strip DO metadata tags & timing directives
    line = line.replace(/\{:H-[^:]+:\}/g, '');
    line = line.replace(/;;[0-9]+.*$/, '');
    line = line.replace(/!x!/g, '');
    line = line.replace(/\bwait\d+\b/gi, '');
    line = line.replace(/\bpause\d*\b/gi, '');

    return line.trim();
}

function formatLiturgicalSymbols(text) {
    if (!text) return '';

    // Restore safe formatting tags (em, i, b, strong, u, small, span, br, sub, sup) after escHtml
    text = text
        .replace(/&lt;(\/?(em|i|b|strong|u|small|span|br|sub|sup)(|\s+class="[^"]*"|\s+style="[^"]*"))&gt;/gi, '<$1>')
        .replace(/&lt;br\s*\/?&gt;/gi, '<br>');

    // Verse numbers in scripture & liturgical readings (e.g. "10 Nos stulti...", "11 Usque in hanc horam...")
    text = text.replace(/(^|[\s\.;?!:\(\[\{])(\d{1,3})\s+([A-Za-z\u00C0-\u024F])/g, '$1<span class="do-verse-num">$2</span> $3');

    // Asterisks
    text = text
        .replace(/\s\*\s/g, ' <span class="do-asterisk">*</span> ')
        .replace(/\s\*/g, ' <span class="do-asterisk">*</span>')
        .replace(/\*\s/g, '<span class="do-asterisk">*</span> ');

    // Crosses: † (dagger/flexe), ✠ (Maltese cross), + (plus sign), ‡ (double dagger), ☩, ✚
    text = text
        .replace(/[†‡✠☩✚]/g, function(m) { return '<span class="do-cross">' + m + '</span>'; })
        .replace(/\s\+\s/g, ' <span class="do-cross">✠</span> ')
        .replace(/\s\+/g, ' <span class="do-cross">✠</span>')
        .replace(/\+\s/g, '<span class="do-cross">✠</span> ');

    // Responsory and Versicle symbols: ℟., R., ℣., V.
    text = text.replace(/℟\.?/g, '<span class="do-resp-sym R">℟.</span>');
    text = text.replace(/℣\.?/g, '<span class="do-resp-sym V">℣.</span>');
    text = text.replace(/(^|[\s\.;?!:\(\[\{])R\.(\s*|$|<|\.)/g, '$1<span class="do-resp-sym R">℟.</span>$2');
    text = text.replace(/(^|[\s\.;?!:\(\[\{])V\.(\s+[A-Za-z\u00C0-\u024F]|$|<|\.)/g, '$1<span class="do-resp-sym V">℣.</span>$2');

    // All parenthetical indications & rubrics: (5a), (6), (genuflectitur), (on s'agenouille), (secreto), etc.
    text = text.replace(/\(([^)]+)\)/g, function(match, inner) {
        return '<span class="do-rubric-inline">(' + inner + ')</span>';
    });

    return text;
}

function formatCardBody(lines, badge, langKey) {
    if (!lines || !lines.length) return '';

    var targetLang = langKey || getUiLang();
    var processedLines = getProcessedLines(lines, targetLang);

    if (/hymnus/i.test(badge)) {
        return formatHymn(processedLines, targetLang);
    } else if (/psalmus|canticum|invitatorium/i.test(badge)) {
        return formatPsalm(processedLines, targetLang);
    } else if (/responsorium/i.test(badge)) {
        return formatResponsory(processedLines, targetLang);
    } else if (/antiphona/i.test(badge)) {
        var antTxt = formatLiturgicalSymbols(escHtml(processedLines.join(' ')));
        return '<div class="do-antiphon-text">' + hyphenateHtmlText(antTxt, targetLang) + '</div>';
    } else {
        return formatTextBlock(processedLines, targetLang);
    }
}

function formatHymn(lines, langKey) {
    var stanzas = splitHymnStanzas(lines);
    return stanzas.map(function(st) {
        return formatSingleStanza(st, langKey);
    }).join('');
}

function formatPsalm(lines, langKey) {
    var html = '';
    lines.forEach(function(line) {
        line = line.trim();
        if (!line) return;

        var isDox = /gl[oó]ria patri|sicut erat|gloire au p|comme il [eé]tait|glory be|as it was in|gloria al padre|como era en/i.test(line);
        html += formatSinglePsalmVerse(line, isDox, null, langKey);
    });
    return html;
}

function formatResponsory(lines, langKey) {
    var html = '';
    lines.forEach(function(line) {
        html += formatSingleRespLine(line, langKey);
    });
    return '<div class="do-responsory">' + html + '</div>';
}

function formatTextBlock(lines, langKey) {
    return '<div class="do-text-block">' +
        lines.map(function(l) {
            return formatSingleParagraph(l, langKey);
        }).join('') +
    '</div>';
}

function escHtml(str) {
    if (str == null) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function renderLoading() {
    function skCard() {
        return '<div class="do-skeleton-card">' +
            '<div class="do-skel w30 h20"></div>' +
            '<div class="do-skel w90"></div>' +
            '<div class="do-skel w70"></div>' +
            '<div class="do-skel w50"></div>' +
        '</div>';
    }
    return '<div class="do-skeleton-list">' + skCard() + skCard() + skCard() + '</div>';
}

function renderChantSkeleton(staffCount) {
    var count = staffCount || 2;
    var staffHtml = 
        '<div class="gregorian-skeleton-staff">' +
            '<div class="gregorian-staff-line"></div>' +
            '<div class="gregorian-staff-line"></div>' +
            '<div class="gregorian-staff-line"></div>' +
            '<div class="gregorian-staff-line"></div>' +
        '</div>';
    var html = '<div class="do-chant-skeleton gregorian-score-loader">';
    for (var i = 0; i < count; i++) {
        html += staffHtml;
    }
    html += '</div>';
    return html;
}
window.renderChantSkeleton = renderChantSkeleton;

// ---- Sacra Biblia Paginated Main Reader View ----

function parseBibleFileVerses(rawText, targetChapter) {
    if (!rawText) return {};
    var verses = {};
    var lines = rawText.split(/\r?\n/);
    lines.forEach(function(line) {
        line = line.trim();
        if (!line) return;
        var parts = line.split('\t');
        if (parts.length >= 3) {
            var ch = parseInt(parts[0], 10);
            var v = parseInt(parts[1], 10);
            var txt = parts.slice(2).join('\t').trim();
            if (ch === targetChapter) {
                verses[v] = txt;
            }
        }
    });
    return verses;
}

function renderBibleMainView() {
    closeDoPlayer();
    $('body').addClass('is-bible-mode');
    var $stream = $('#do-content-stream');
    $stream.html(renderLoading());

    var rawBookId = doState.bible.book || 'Genesis';
    var normId = normalizeBibleBookId(rawBookId);
    var bkObj = DO_BIBLE_BOOKS.find(function(b) { return b.id === normId; }) || DO_BIBLE_BOOKS[0];
    var bookId = bkObj.id;
    doState.bible.book = bookId;
    localStorage.setItem('do_bible_book', bookId);

    var chapterNum = parseInt(doState.bible.chapter, 10) || 1;
    var pageNum = parseInt(doState.bible.page, 10) || 1;
    var pageSize = doState.bible.pageSize || '15';
    var maxCh = bkObj.chapters || 1;

    if (chapterNum > maxCh) chapterNum = maxCh;
    if (chapterNum < 1) chapterNum = 1;
    doState.bible.chapter = chapterNum;

    var vernLang = (doState.vernacularLang && doState.vernacularLang !== 'none') ? doState.vernacularLang : null;
    var laPath = 'vulgate/' + bookId + '.txt';
    var vernFolder = (vernLang === 'fr') ? 'crampon' : (vernLang === 'en') ? 'douay-rheims' : (vernLang === 'pt') ? 'matos-soares' : null;
    var vernPath = vernFolder ? (vernFolder + '/' + bookId + '.txt') : null;

    fetchLocalFile(laPath, function(err, laData) {
        var laVerses = (!err && laData) ? parseBibleFileVerses(laData, chapterNum) : {};

        if (vernPath && vernLang) {
            fetchLocalFile(vernPath, function(err2, vernData) {
                var vernVerses = (!err2 && vernData) ? parseBibleFileVerses(vernData, chapterNum) : {};
                buildBibleMainViewHTML(bkObj, chapterNum, pageNum, pageSize, laVerses, (Object.keys(vernVerses).length > 0 ? vernVerses : null));
            });
        } else {
            buildBibleMainViewHTML(bkObj, chapterNum, pageNum, pageSize, laVerses, null);
        }
    });
}

function buildBibleMainViewHTML(bkObj, chapterNum, pageNum, pageSize, laVerses, vernVerses) {
    var $stream = $('#do-content-stream').empty();
    var uiLang = getUiLang();
    var vernLang = (doState.vernacularLang && doState.vernacularLang !== 'none') ? doState.vernacularLang : null;
    var t = DO_UI_TRANSLATIONS[uiLang] || DO_UI_TRANSLATIONS['fr'];

    var bookId = bkObj.id;
    var bookTitle = bkObj[uiLang] || bkObj.fr || bkObj.la;
    var maxCh = bkObj.chapters || 1;

    var alignedRows = (typeof getBibleAlignedRows === 'function')
        ? getBibleAlignedRows(bookId, vernLang, chapterNum, laVerses, vernVerses)
        : [];

    // Full chapter display (no pagination)
    doState.bible.page = 1;

    // Automatically persist reading position
    localStorage.setItem('do_bible_book', bookId);
    localStorage.setItem('do_bible_chapter', chapterNum);
    localStorage.setItem('do_bible_page', 1);

    var visibleRows = alignedRows;

    // Update Header
    var headerText = bookTitle + ' ' + chapterNum;
    $('#doHeaderTitle .title-text').text(headerText);
    $('#doHourLabel').text(('SACRA BIBLIA • ' + (bkObj.cat || 'Vetus Testamentum')).toUpperCase());

    var isFirstChapter = (chapterNum <= 1 && DO_BIBLE_BOOKS.indexOf(bkObj) === 0);
    var isLastChapter = (chapterNum >= maxCh && DO_BIBLE_BOOKS.indexOf(bkObj) === DO_BIBLE_BOOKS.length - 1);

    // Verses Body
    var bodyHtml = '';
    var hasVernVerses = (vernVerses && typeof vernVerses === 'object' && Object.keys(vernVerses).length > 0);
    var isBilingual = (doState.showLatin && vernLang && hasVernVerses);
    var isVernOnly = (!doState.showLatin && vernLang && hasVernVerses);

    if (visibleRows.length) {
        if (isBilingual) {
            var rows = [];
            visibleRows.forEach(function(r) {
                var laFormatted = r.laText ? hyphenateHtmlText(formatLiturgicalSymbols(escHtml(r.laText)), 'la') : '';
                var vernFormatted = r.vernText ? hyphenateHtmlText(formatLiturgicalSymbols(escHtml(r.vernText)), vernLang || 'fr') : '';
                var laVNumHtml = r.laVNum ? ('<span class="do-bible-vnum">' + r.laVNum + '</span> ') : '';
                var vernVNumHtml = r.vernVNum ? ('<span class="do-bible-vnum">' + r.vernVNum + '</span> ') : '';
                if (r.isVulgateSuppl) {
                    vernVNumHtml = '<span class="do-bible-vnum">' + (r.vernVNum || '') + '</span> <span class="do-bible-suppl-badge" style="font-size:0.75rem; color:var(--primary-color); opacity:0.85; font-style:italic; margin-right:0.35em;">[Vulgate]</span> ';
                }
                rows.push(
                    '<div class="do-bilingual-row do-bible-row">' +
                        '<div class="do-col-la" lang="la">' + laVNumHtml + laFormatted + '</div>' +
                        '<div class="do-col-vernacular" lang="' + (vernLang || 'fr') + '">' + vernVNumHtml + vernFormatted + '</div>' +
                    '</div>'
                );
            });
            bodyHtml = '<div class="do-bilingual-wrapper">' +
                '<div class="do-bilingual-grid do-bible-grid">' +
                    rows.join('') +
                '</div>' +
            '</div>';
        } else if (isVernOnly) {
            var rows = [];
            visibleRows.forEach(function(r) {
                var vernFormatted = r.vernText ? hyphenateHtmlText(formatLiturgicalSymbols(escHtml(r.vernText)), vernLang || 'fr') : '';
                var vernVNumHtml = r.vernVNum ? ('<span class="do-bible-vnum">' + r.vernVNum + '</span> ') : '';
                if (r.isVulgateSuppl) {
                    vernVNumHtml = '<span class="do-bible-vnum">' + (r.vernVNum || '') + '</span> <span class="do-bible-suppl-badge" style="font-size:0.75rem; color:var(--primary-color); opacity:0.85; font-style:italic; margin-right:0.35em;">[Vulgate]</span> ';
                }
                rows.push(
                    '<div class="do-bible-single-verse" lang="' + (vernLang || 'fr') + '">' +
                        vernVNumHtml + vernFormatted +
                    '</div>'
                );
            });
            bodyHtml = '<div class="do-bible-single-col">' + rows.join('') + '</div>';
        } else {
            var rows = [];
            visibleRows.forEach(function(r) {
                var laFormatted = r.laText ? hyphenateHtmlText(formatLiturgicalSymbols(escHtml(r.laText)), 'la') : '';
                var laVNumHtml = r.laVNum ? ('<span class="do-bible-vnum">' + r.laVNum + '</span> ') : '';
                rows.push(
                    '<div class="do-bible-single-verse" lang="la">' +
                        laVNumHtml + laFormatted +
                    '</div>'
                );
            });
            bodyHtml = '<div class="do-bible-single-col">' + rows.join('') + '</div>';
        }
    } else {
        bodyHtml = '<div class="do-empty"><h3>Capitulum vacuum</h3><p>Textus non inventus.</p></div>';
    }

    // Main Card HTML
    var chapterWord = (uiLang === 'fr') ? 'Chapitre ' : (uiLang === 'la' ? 'Caput ' : (uiLang === 'es' ? 'Capítulo ' : 'Chapter '));
    var cardTitle = bookTitle + ' — ' + chapterWord + chapterNum;
    var versesWord = (uiLang === 'fr') ? 'versets' : (uiLang === 'la' ? 'versus' : (uiLang === 'es' ? 'versículos' : 'verses'));
    var countBadge = visibleRows.length ? (visibleRows.length + ' ' + versesWord) : '';

    var cardHtml = '<div class="do-card is-bible">' +
        '<div class="do-card-header">' +
            '<div>' +
                '<span class="do-card-type">' + escHtml((bkObj.cat || 'Sacra Scriptura').toUpperCase()) + '</span>' +
                '<h3 class="do-card-title">' + escHtml(cardTitle) + '</h3>' +
            '</div>' +
            (countBadge ? '<div class="do-card-actions"><span class="do-badge" style="font-size:0.8rem; color:var(--primary-color); font-weight:600;">' + escHtml(countBadge) + '</span></div>' : '') +
        '</div>' +
        '<div class="do-card-body">' + bodyHtml + '</div>' +
    '</div>';

    // Bottom Navigation Floating Bar (Previous / Next Chapter in Latin)
    var $prevBtnBottom = $('<button class="do-bible-nav-btn btnBiblePrev" id="btnBiblePrevBottom">')
        .html('<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg> <span>Caput præcedens</span>')
        .prop('disabled', isFirstChapter);

    var $nextBtnBottom = $('<button class="do-bible-nav-btn btnBibleNext" id="btnBibleNextBottom">')
        .html('<span>Caput sequens</span> <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>')
        .prop('disabled', isLastChapter);

    var $bottomBar = $('<div class="do-bible-bottom-nav">').append(
        $('<div class="do-bible-bottom-nav-inner">').append(
            $prevBtnBottom,
            $nextBtnBottom
        )
    );

    $stream.append(cardHtml).append($bottomBar);
    applyHyphenationToContainer($stream);
    if ($stream[0]) {
        var offsetVal = (doState.mobileLang === 'vern') ? 'calc(-50% - 12px)' : '0%';
        $stream[0].style.setProperty('--bilingual-offset', offsetVal);
    }
}

function getCurrentLiturgicalHora() {
    var h = new Date().getHours();
    if (h >= 0 && h < 6) return 'matutinum';
    if (h >= 6 && h < 9) return 'laudes';
    if (h >= 9 && h < 11) return 'tertia';
    if (h >= 11 && h < 14) return 'sexta';
    if (h >= 14 && h < 17) return 'nona';
    if (h >= 17 && h < 21) return 'vesperae';
    return 'completorium';
}

var DO_HORA_DESCRIPTIONS = {
    fr: {
        matutinum: { name: 'Matines', time: '00h00 – 06h00', desc: 'Vigile et prière de la nuit' },
        laudes: { name: 'Laudes', time: '06h00 – 09h00', desc: 'Louanges au lever du soleil' },
        prima: { name: 'Prime', time: '06h00 – 08h00', desc: 'Consécration de la journée' },
        tertia: { name: 'Tierce', time: '09h00 – 11h00', desc: 'Descente du Saint-Esprit' },
        sexta: { name: 'Sexte', time: '11h00 – 14h00', desc: 'Crucifixion de Notre Seigneur' },
        nona: { name: 'None', time: '14h00 – 17h00', desc: 'Mort de Jésus sur la Croix' },
        vesperae: { name: 'Vêpres', time: '17h00 – 21h00', desc: 'Prière du soir et encens spirituel' },
        completorium: { name: 'Complies', time: '21h00 – 00h00', desc: 'Dernière prière avant la nuit' },
        missa: { name: 'Sainte Messe', time: 'Missa Diei', desc: 'Saint Sacrifice & Liturgie eucharistique' },
        bible: { name: 'Sainte Écriture', time: 'Biblia Sacra', desc: 'Vulgate latine & Traduction' }
    },
    la: {
        matutinum: { name: 'Matutinum', time: '00:00 – 06:00', desc: 'Vigiliae et oratio nocturna' },
        laudes: { name: 'Laudes', time: '06:00 – 09:00', desc: 'Laudes matutinae' },
        prima: { name: 'Prima', time: '06:00 – 08:00', desc: 'Hora prima diurna' },
        tertia: { name: 'Tertia', time: '09:00 – 11:00', desc: 'Hora tertia' },
        sexta: { name: 'Sexta', time: '11:00 – 14:00', desc: 'Hora meridiana' },
        nona: { name: 'Nona', time: '14:00 – 17:00', desc: 'Hora nona' },
        vesperae: { name: 'Vesperae', time: '17:00 – 21:00', desc: 'Oratio vespertina' },
        completorium: { name: 'Completorium', time: '21:00 – 00:00', desc: 'Oratio ante quietem' },
        missa: { name: 'Sancta Missa', time: 'Missa Diei', desc: 'Sacrificium Eucharisticum' },
        bible: { name: 'Sacra Biblia', time: 'Biblia Sacra', desc: 'Vulgata Clementina' }
    }
};

function setupHomeSearch() {
    $(document).off('input', '#doHomeSearchInput').on('input', '#doHomeSearchInput', function() {
        var query = $(this).val();
        var $results = $('#doHomeSearchResults');
        var $clear = $('#doHomeSearchClear');
        var uiLang = getUiLang();
        var year = doState.date.year();

        if (!query || !query.trim()) {
            $results.addClass('hidden').empty();
            $clear.addClass('hidden');
            return;
        }

        $clear.removeClass('hidden');
        var normQuery = normalizeSearchStr(query);
        var tokens = normQuery.split(/\s+/).filter(Boolean);

        var matches = [];

        // 1. Search Sanctoral
        if (typeof saintKeys !== 'undefined' && Array.isArray(saintKeys)) {
            var seenKeys = {};
            saintKeys.forEach(function(item) {
                if (!item.key) return;
                var baseKey = item.key.replace(/_[a-z0-9]+$/i, '');
                if (item.key.indexOf('_') !== -1 && seenKeys[baseKey]) return;
                if (seenKeys[item.key]) return;
                seenKeys[item.key] = true;
                seenKeys[baseKey] = true;

                var dispTitle = getVernacularItemTitle(item, uiLang);
                var titleLa = item.title || item.key;
                var searchTarget = normalizeSearchStr(dispTitle + ' ' + titleLa + ' ' + (item.en || '') + ' ' + item.key);

                var matchesAll = tokens.every(function(t) { return searchTarget.indexOf(t) >= 0; });
                if (matchesAll) {
                    var itemDate = getDateForLiturgicalKey(item.key, year);
                    matches.push({
                        type: 'sanctoral',
                        key: item.key,
                        title: dispTitle,
                        date: itemDate,
                        dateBadge: itemDate ? formatBadgeDate(itemDate, uiLang) : ''
                    });
                }
            });
        }

        // 2. Search Tempora
        if (typeof temporaKeys !== 'undefined' && Array.isArray(temporaKeys)) {
            temporaKeys.forEach(function(item) {
                if (!item.key) return;
                var dispTitle = getVernacularItemTitle(item, uiLang);
                var titleLa = item.title || item.key;
                var searchTarget = normalizeSearchStr(dispTitle + ' ' + titleLa + ' ' + (item.en || '') + ' ' + item.key);

                var matchesAll = tokens.every(function(t) { return searchTarget.indexOf(t) >= 0; });
                if (matchesAll) {
                    var itemDate = getDateForLiturgicalKey(item.key, year);
                    matches.push({
                        type: 'tempora',
                        key: item.key,
                        title: dispTitle,
                        date: itemDate,
                        dateBadge: itemDate ? formatBadgeDate(itemDate, uiLang) : ''
                    });
                }
            });
        }

        // 3. Search Bible Books
        if (typeof DO_BIBLE_BOOKS !== 'undefined' && Array.isArray(DO_BIBLE_BOOKS)) {
            DO_BIBLE_BOOKS.forEach(function(b) {
                var nameFr = b.fr || b.la || b.id;
                var nameLa = b.la || b.id;
                var searchTarget = normalizeSearchStr(nameFr + ' ' + nameLa + ' ' + b.id);
                var matchesAll = tokens.every(function(t) { return searchTarget.indexOf(t) >= 0; });
                if (matchesAll) {
                    matches.push({
                        type: 'bible',
                        id: b.id,
                        title: (uiLang === 'fr' ? nameFr : nameLa) + ' (Bible)',
                        dateBadge: b.cat || 'Sacra Biblia'
                    });
                }
            });
        }

        if (!matches.length) {
            $results.html('<div class="do-search-no-results">' + (uiLang === 'fr' ? 'Aucun résultat trouvé' : 'Nullum inventum') + '</div>').removeClass('hidden');
            return;
        }

        $results.empty().removeClass('hidden');
        var capped = matches.slice(0, 15);

        capped.forEach(function(m) {
            var $item = $('<div class="do-home-search-item">')
                .append('<span class="do-search-item-title">' + escHtml(m.title) + '</span>')
                .append('<span class="do-search-item-badge">' + escHtml(m.dateBadge) + '</span>')
                .on('click', function(e) {
                    e.stopPropagation();
                    if (m.type === 'bible') {
                        openBible(m.id, 1, 1);
                    } else {
                        if (m.date && m.date.isValid()) {
                            doState.date = m.date;
                            doState.officiumKey = m.key;
                            localStorage.setItem('do_officiumKey', m.key);
                            $('#doDateInput').val(doState.date.format('YYYY-MM-DD'));
                        }
                        renderDO();
                    }
                    $results.addClass('hidden').empty();
                    $('#doHomeSearchInput').val('');
                    $clear.addClass('hidden');
                });

            $results.append($item);
        });
    });

    $(document).off('click', '#doHomeSearchClear').on('click', '#doHomeSearchClear', function(e) {
        e.stopPropagation();
        $('#doHomeSearchInput').val('').focus();
        $('#doHomeSearchResults').addClass('hidden').empty();
        $(this).addClass('hidden');
    });

    $(document).off('click.homeSearch').on('click.homeSearch', function(e) {
        if (!$(e.target).closest('.do-home-search-bar-wrap').length) {
            $('#doHomeSearchResults').addClass('hidden');
        }
    });
}

function parseBioContent(rawText) {
    if (!rawText) return { author: '', ref: '', text: '' };
    var lines = Array.isArray(rawText) ? rawText : rawText.split('\n');
    var author = '';
    var ref = '';
    var bodyLines = [];
    var filtered = [];

    for (var i = 0; i < lines.length; i++) {
        var l = (lines[i] || '').trim();
        if (!l || l === '_') continue;
        if (l.charAt(0) === '@' || l.charAt(0) === '&' || l.charAt(0) === '$') continue;
        if (/^\(sed\s+/i.test(l)) continue;
        filtered.push(l);
    }

    var idx = 0;
    while (idx < filtered.length && idx < 3) {
        var line = filtered[idx];
        if (line.charAt(0) === '!') {
            var cleanL = line.replace(/^!+/, '').trim();
            if (!author && /^(?:Pour|In|De|Ad|Festa)\b/i.test(cleanL) && cleanL.length < 90) {
                author = cleanL;
            } else if (!ref && cleanL.length < 150) {
                ref = cleanL;
            } else {
                bodyLines.push(cleanL);
            }
            idx++;
        } else if (!author && /^(?:Sermo|Homilia|Tractatus|Lectio|Epistola|Ex\b|De\b|Du\b|Des\b|Au\b|Sermon|Hom[ée]lie|Trait[ée]|Lecture|Lettre|Livre|From\b|Lesson\b|Treatise\b)\b/i.test(line) && line.length < 120 && !/\b(?:ayant|voyant|disant|faisant|alors|fut|est|sont|avait|ont|naquit|vint|mourut)\b/i.test(line)) {
            author = line.replace(/\.+$/, '').trim();
            idx++;
        } else {
            break;
        }
    }

    while (idx < filtered.length) {
        var remLine = filtered[idx];
        if (remLine.charAt(0) === '!') {
            bodyLines.push(remLine.replace(/^!+/, '').trim());
        } else {
            bodyLines.push(remLine);
        }
        idx++;
    }

    var bodyText = bodyLines.join(' ').replace(/\s+/g, ' ').trim();
    return {
        author: author,
        ref: ref,
        text: bodyText
    };
}

function cleanBioParagraph(rawText) {
    var parsed = parseBioContent(rawText);
    return parsed.text || '';
}

function extractMartyrologyBio(martContent, keywords) {
    if (!martContent) return '';
    var rawParas = martContent.split('\n\n');
    if (!rawParas || rawParas.length <= 1) {
        rawParas = martContent.split('\n');
    }
    var paras = [];
    for (var i = 0; i < rawParas.length; i++) {
        var p = (rawParas[i] || '').trim();
        if (p && !/^Le\s+/i.test(p) && !/^Aux\s+calendes/i.test(p) && p !== '_') {
            paras.push(p);
        }
    }
    if (keywords) {
        var kwList = [];
        var rawKws = Array.isArray(keywords) ? keywords : (typeof keywords === 'string' ? keywords.split('\n') : []);
        for (var k = 0; k < rawKws.length; k++) {
            var kw = (rawKws[k] || '').trim().toLowerCase();
            if (kw.length > 3) kwList.push(kw);
        }
        for (var j = 0; j < paras.length; j++) {
            var pClean = cleanBioParagraph(paras[j]);
            var pLower = pClean.toLowerCase();
            for (var m = 0; m < kwList.length; m++) {
                if (pLower.indexOf(kwList[m]) !== -1) {
                    return pClean;
                }
            }
        }
    }
    if (paras.length > 0) {
        return cleanBioParagraph(paras[0]);
    }
    return '';
}

function openSaintImagePreview(imgSrc, title) {
    $('#doSaintPreviewModal').remove();

    var $modal = $('<div id="doSaintPreviewModal" class="do-saint-preview-backdrop">');
    var $dialog = $('<div class="do-saint-preview-dialog">');
    
    var $closeBtn = $('<button type="button" class="do-saint-preview-close" aria-label="Fermer">' +
        '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
        '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>');
    $dialog.append($closeBtn);

    var $imgWrap = $('<div class="do-saint-preview-image-wrap">');
    var $img = $('<img class="do-saint-preview-img">').attr('src', imgSrc).attr('alt', title || '');
    $imgWrap.append($img);
    $dialog.append($imgWrap);

    var match = imgSrc ? imgSrc.match(/(?:saints|tempora)\/([A-Za-z0-9_-]+)\.webp/) : null;
    var dateCode = match ? match[1] : null;
    var meta = null;
    if (window.DO_TEMPORA_ART_METADATA && dateCode && window.DO_TEMPORA_ART_METADATA[dateCode]) {
        meta = window.DO_TEMPORA_ART_METADATA[dateCode];
    } else if (window.DO_SAINT_ART_METADATA && dateCode && window.DO_SAINT_ART_METADATA[dateCode]) {
        meta = window.DO_SAINT_ART_METADATA[dateCode];
    }

    if (title || meta) {
        var $caption = $('<div class="do-saint-preview-caption">');
        if (title) {
            var $h2 = $('<h2 class="do-saint-preview-title">').text(title);
            $caption.append($h2);
        }
        if (meta) {
            var $meta = $('<div class="do-saint-preview-meta">');
            var metaParts = [];
            if (meta.artwork) metaParts.push('« ' + meta.artwork + ' »');
            if (meta.artist) {
                var artStr = meta.artist;
                if (meta.year) artStr += ' (' + meta.year + ')';
                metaParts.push(artStr);
            }
            if (meta.location) metaParts.push(meta.location);
            $meta.text(metaParts.join(' — '));
            $caption.append($meta);
        }
        $dialog.append($caption);
    }

    $modal.append($dialog);
    $('body').append($modal);

    function closeModal() {
        $modal.fadeOut(150, function() {
            $modal.remove();
        });
        $(document).off('keydown.saintPreview');
    }

    $closeBtn.on('click', function(e) {
        e.stopPropagation();
        closeModal();
    });

    $modal.on('click', function(e) {
        if (!$(e.target).closest('.do-saint-preview-image-wrap').length) {
            closeModal();
        }
    });

    $(document).off('keydown.saintPreview').on('keydown.saintPreview', function(e) {
        if (e.key === 'Escape' || e.keyCode === 27) {
            closeModal();
        }
    });
}

function buildHomeSaintCard(date, uiLang, feastTitle, missaResult, callback, isMissaMode) {
    var codes = computeLiturgicalCodes(date);
    var sanctiCode = codes.sancti;
    var temporaCode = codes.tempora;
    var isTempora = false;

    if (missaResult && missaResult.loadedPath) {
        if (missaResult.loadedPath.indexOf('Tempora/') === 0) {
            temporaCode = missaResult.loadedPath.replace('Tempora/', '');
            isTempora = true;
        } else if (missaResult.loadedPath.indexOf('Sancti/') === 0) {
            sanctiCode = missaResult.loadedPath.replace('Sancti/', '');
        }
    } else if (codes.isSunday) {
        isTempora = true;
    }

    var langFolder = getLangFolder(uiLang);

    // Résolution intelligente de l'image (évite les 404 sur les féries sans image)
    var isSaintsInstalled = (window.OremusModuleManager && typeof window.OremusModuleManager.isInstalled === 'function')
        ? window.OremusModuleManager.isInstalled('saints')
        : false;

    var saintRelPath = 'img/saints/' + sanctiCode + '.webp';
    var saintRemoteUrl = 'https://raw.githubusercontent.com/bastonus/jgabc/master/' + saintRelPath;
    var saintImg = isSaintsInstalled ? saintRelPath : saintRemoteUrl;

    var temporaImg = 'img/tempora/' + temporaCode + '.webp';
    var temporaSunCode = (temporaCode || '').replace(/-\d+$/, '-0');
    var temporaSunImg = 'img/tempora/' + temporaSunCode + '.webp';
    var temporaRemoteUrl = 'https://raw.githubusercontent.com/bastonus/jgabc/master/' + temporaImg;
    var temporaSunRemoteUrl = 'https://raw.githubusercontent.com/bastonus/jgabc/master/' + temporaSunImg;

    var hasTemporaImg = !!(window.DO_TEMPORA_ART_METADATA && window.DO_TEMPORA_ART_METADATA[temporaCode]);
    var hasTemporaSunImg = !!(window.DO_TEMPORA_ART_METADATA && window.DO_TEMPORA_ART_METADATA[temporaSunCode]);
    var hasSaintImg = !!(window.DO_SAINT_ART_METADATA && window.DO_SAINT_ART_METADATA[sanctiCode]);

    var imgPath = '';
    if (isTempora) {
        if (hasTemporaImg) {
            imgPath = temporaImg;
        } else if (hasSaintImg) {
            imgPath = saintImg;
        } else if (hasTemporaSunImg) {
            imgPath = temporaSunImg;
        } else {
            imgPath = temporaImg;
        }
    } else {
        if (hasSaintImg) {
            imgPath = saintImg;
        } else if (hasTemporaImg) {
            imgPath = temporaImg;
        } else if (hasTemporaSunImg) {
            imgPath = temporaSunImg;
        } else {
            imgPath = saintImg;
        }
    }

    var loadPath = isTempora ? ('Tempora/' + temporaCode) : ('Sancti/' + sanctiCode);

    loadRecursiveDOFile(loadPath, langFolder, false, function(sec) {
        var bioData = null;
        var sourceName = (uiLang === 'fr') ? 'Bréviaire Romain' : (uiLang === 'la') ? 'Breviarium Romanum' : 'Roman Breviary';

        if (sec) {
            var raw = sec['Lectio94'] || sec['Lectio93'] || sec['Lectio91'] || sec['Lectio4_'] || sec['Lectio4'] || sec['Homilia'] || sec['Lectio7'] || '';
            if (Array.isArray(raw)) raw = raw.join('\n');
            if (raw) bioData = parseBioContent(raw);
        }

        if (bioData && bioData.text) {
            finishCard(bioData, sourceName);
            return;
        }

        if (isTempora) {
            if (sec && (sec['Lectio1'] || sec['Lectio2'] || sec['Lectio3'])) {
                var rawL = sec['Lectio1'] || sec['Lectio2'] || sec['Lectio3'];
                if (Array.isArray(rawL)) rawL = rawL.join('\n');
                if (rawL) bioData = parseBioContent(rawL);
            }
            if (bioData && bioData.text) {
                finishCard(bioData, sourceName);
                return;
            }
        }

        var martPath = 'do_data/horas/' + langFolder + '/Martyrologium/' + sanctiCode + '.txt';
        fetchLocalFile(martPath, function(mErr, martData) {
            if (!mErr && martData) {
                var saintNames = (sec && sec['Name']) ? sec['Name'] : null;
                var bioText = extractMartyrologyBio(martData, saintNames);
                if (bioText) {
                    sourceName = (uiLang === 'fr') ? 'Martyrologe Romain' : 'Martyrologium Romanum';
                    bioData = { author: '', ref: '', text: bioText };
                }
            }
            finishCard(bioData, sourceName);
        });

        function finishCard(bioData, source) {
            var bioObj = (typeof bioData === 'string') ? { author: '', ref: '', text: bioData } : (bioData || {});
            var bioText = bioObj.text || '';
            if (!bioText) {
                callback(null);
                return;
            }

            var $hero = $('<div class="do-home-saint-hero' + (isMissaMode ? ' do-missa-saint-hero' : '') + '">');
            
            var headerH = $('.do-top-header').outerHeight() || 64;
            $hero[0].style.setProperty('--do-header-offset', headerH + 'px');

            // Zone d'ambiance floutée pleine largeur (arrière-plan immersif)
            // Le bgClip clippe le débordement horizontal sans affecter le parent sticky
            var $bgClip = $('<div class="do-home-saint-hero-bg-clip">');
            var $bgWrap = $('<div class="do-home-saint-hero-bg-wrap">');
            var $bgImg = $('<img class="do-home-saint-hero-bg" alt="" aria-hidden="true">')
                .attr('src', imgPath)
                .on('error', function() {
                    $(this).css('opacity', '0');
                });
            var $overlay = $('<div class="do-home-saint-hero-overlay"></div>');
            $bgWrap.append($bgImg).append($overlay);
            $bgClip.append($bgWrap);
            $hero.append($bgClip);

            // Conteneur de l'image nette (centré dans le hero, par-dessus le fond flouté)
            var $body = $('<div class="do-home-saint-hero-body">');
            var $thumbWrap = $('<div class="do-home-saint-hero-thumb-wrap">');
            var $thumbImg = $('<img class="do-home-saint-hero-thumb">')
                .attr('src', imgPath)
                .attr('alt', feastTitle || '')
                .on('error', function() {
                    var $img = $(this);
                    // Fallback en ligne transparent vers GitHub Raw Usercontent si l'image locale échoue
                    if (!$img.data('tried-remote')) {
                        $img.data('tried-remote', true);
                        if (isTempora && hasTemporaImg) {
                            $img.attr('src', temporaRemoteUrl);
                            $bgImg.attr('src', temporaRemoteUrl);
                            return;
                        } else if (saintRelPath && (!isTempora || hasSaintImg)) {
                            $img.attr('src', saintRemoteUrl);
                            $bgImg.attr('src', saintRemoteUrl);
                            return;
                        } else if (hasTemporaSunImg) {
                            $img.attr('src', temporaSunRemoteUrl);
                            $bgImg.attr('src', temporaSunRemoteUrl);
                            return;
                        }
                    }
                    $hero.addClass('do-hero-no-image');
                    $bgClip.hide();
                    $thumbWrap.hide();
                    if (typeof compute3Lines === 'function') {
                        setTimeout(compute3Lines, 10);
                    }
                });
            $thumbWrap.append($thumbImg);
            $body.append($thumbWrap);

            // Texte biographique à droite de l'image dans le hero
            var $content = $('<div class="do-home-saint-hero-content">');

            var $bioHeader = null;
            if (bioObj.author || bioObj.ref) {
                $bioHeader = $('<div class="do-saint-bio-header">');
                if (bioObj.author) {
                    $bioHeader.append($('<div class="do-saint-bio-author">').text(bioObj.author));
                }
                if (bioObj.ref) {
                    $bioHeader.append($('<div class="do-saint-bio-ref">').text(bioObj.ref));
                }
                $content.append($bioHeader);
            }

            var $p = $('<p class="do-home-saint-hero-text">').attr('lang', (uiLang === 'la' ? 'la' : 'fr'));
            $content.append($p);
            $body.append($content);
            $hero.append($body);

            var isExpanded = false;
            var isLong = false;
            var truncatedHtml = '';

            var seeMoreLabel = (uiLang === 'fr') ? 'voir plus' : (uiLang === 'la') ? 'plura' : 'see more';
            var seeLessLabel = (uiLang === 'fr') ? 'voir moins' : (uiLang === 'la') ? 'minus' : 'see less';

            function compute3Lines() {
                // Desktop (>= 768px) : Jamais de 'voir plus', affichage intégral direct
                if (window.innerWidth >= 768) {
                    isLong = false;
                    isExpanded = true;
                    $p.text(bioText);
                    $hero.css('cursor', 'default');
                    $content.css('cursor', 'default');
                    return;
                }

                // Mobile (< 768px) : Aperçu tronqué sur 3 lignes avec 'voir plus'
                $content.css('cursor', 'pointer');
                var words = bioText.trim().split(/\s+/);
                
                // Mesure précise de la hauteur d'une seule ligne dans le DOM
                $p.empty();
                $p.text('A');
                var singleH = $p.outerHeight() || 26;
                if (singleH < 15) singleH = 26;

                var targetMaxH = Math.round(singleH * 3.12);

                $p.text(bioText);
                if ($p.outerHeight() <= targetMaxH) {
                    isLong = false;
                    $p.text(bioText);
                    $hero.css('cursor', 'default');
                    $content.css('cursor', 'default');
                    return;
                }

                isLong = true;
                $hero.css('cursor', 'pointer');

                // Recherche binaire du nombre exact de mots pour que "... voir plus" tienne dans targetMaxH
                var low = 1;
                var high = words.length;
                var best = 1;

                while (low <= high) {
                    var mid = Math.floor((low + high) / 2);
                    var candidate = words.slice(0, mid).join(' ').replace(/[,;.:\s]+$/, '') + '…';
                    $p.text(candidate + ' ').append($('<span class="do-home-saint-inline-more">').text(seeMoreLabel));
                    
                    if ($p.outerHeight() <= targetMaxH) {
                        best = mid;
                        low = mid + 1;
                    } else {
                        high = mid - 1;
                    }
                }

                // Garantie absolue : tant que la hauteur dépasse targetMaxH, on retire un mot
                while (best > 1) {
                    var safeCut = words.slice(0, best).join(' ').replace(/[,;.:\s]+$/, '') + '…';
                    $p.text(safeCut + ' ').append($('<span class="do-home-saint-inline-more">').text(seeMoreLabel));
                    if ($p.outerHeight() <= targetMaxH) {
                        break;
                    }
                    best--;
                }

                truncatedHtml = $p.html();
            }

            function toggleExpand() {
                // Sur desktop, le texte est toujours déjà intégral : pas de toggle
                if (window.innerWidth >= 768 || !isLong) return;
                isExpanded = !isExpanded;
                if (isExpanded) {
                    $p.text(bioText + ' ').append($('<span class="do-home-saint-inline-more">').text(seeLessLabel));
                } else {
                    if (truncatedHtml) {
                        $p.html(truncatedHtml);
                    } else {
                        compute3Lines();
                    }
                }
            }

            // Cliquer sur l'image ouvre l'aperçu plein écran avec le nom du saint en gros
            $thumbWrap.on('click', function(e) {
                e.stopPropagation();
                openSaintImagePreview(imgPath, feastTitle);
            });

            // Cliquer sur le texte ou 'voir plus'/'voir moins' étend ou réduit
            $content.on('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                toggleExpand();
            });
            $hero.on('click', function(e) {
                if (!$(e.target).closest('.do-home-saint-hero-thumb-wrap, .do-home-saint-hero-content').length) {
                    toggleExpand();
                }
            });

            function setupSaintParallax() {
                var bgEl = $bgImg[0];
                if (!bgEl) return;

                var ticking = false;
                function onScrollParallax() {
                    var scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
                    if (scrollY <= 900) {
                        var translateY = scrollY * 0.15;
                        var scaleVal = (window.innerWidth >= 768) ? '1.22' : '1.15';
                        bgEl.style.transform = 'scale(' + scaleVal + ') translate3d(0, ' + translateY.toFixed(1) + 'px, 0)';
                    }
                    ticking = false;
                }

                $(window).off('scroll.saintParallax').on('scroll.saintParallax', function() {
                    if (!ticking) {
                        window.requestAnimationFrame(onScrollParallax);
                        ticking = true;
                    }
                });

                onScrollParallax();
            }

            function updateSaintBgFullBleed() {
                var wrapperEl = document.querySelector('.do-main-wrapper') || document.querySelector('.app-main') || document.body;
                var heroEl = $hero[0];
                var bgClipEl = $bgClip[0];
                if (!wrapperEl || !heroEl || !bgClipEl) return;
                var wrapperRect = wrapperEl.getBoundingClientRect();
                var heroRect = heroEl.getBoundingClientRect();
                var leftDelta = heroRect.left - wrapperRect.left;
                bgClipEl.style.left = (-leftDelta) + 'px';
                bgClipEl.style.width = wrapperRect.width + 'px';
            }

            callback($hero, function() {
                compute3Lines();
                setupSaintParallax();
                updateSaintBgFullBleed();
                if (document.fonts && document.fonts.ready) {
                    document.fonts.ready.then(function() {
                        if (!isExpanded) compute3Lines();
                        updateSaintBgFullBleed();
                    });
                }
            });

            $(window).off('resize.saintHero').on('resize.saintHero', function() {
                updateSaintBgFullBleed();
                if (!isExpanded && isLong) {
                    compute3Lines();
                }
            });
        }
    });
}

function renderHomeView() {
    var $stream = $('#do-content-stream').empty();
    if ($stream[0]) {
        $stream[0].style.setProperty('--bilingual-offset', '0%');
    }
    var uiLang = getUiLang();
    var curDateFormatted = formatLiturgicalDate(doState.date, uiLang);
    var curHora = getCurrentLiturgicalHora();
    var descs = DO_HORA_DESCRIPTIONS[uiLang] || DO_HORA_DESCRIPTIONS['fr'];

    // Header label shows formatted date
    $('#doHourLabel').text(curDateFormatted.toUpperCase());

    loadMissaData(doState.date, (uiLang === 'la' ? 'la' : 'fr'), function(err, result) {
        var rawTitle = (result && result.title) ? result.title : curDateFormatted;
        var feastTitle = getLocalizedFeastTitle(rawTitle, uiLang);

        // Put the feast title directly in the header
        $('#doHeaderTitle .title-text').text(feastTitle);
        $('#doSidebarFeastTitle').text(feastTitle);
        checkHeaderTitleMarquee();

        var $view = $('<div class="do-home-styled">');

        var onSaintAttached = null;
        var isViewInDom = false;

        // ---- HERO DU SAINT DU JOUR — placé AVANT do-home-styled dans le content-area
        // (même max-width 760px que la messe, pas limité à 680px du do-home-styled)
        var $saintCardWrap = $('<div id="doHomeSaintCardWrap" class="do-home-saint-card-wrap">');

        buildHomeSaintCard(doState.date, uiLang, feastTitle, result, function($card, onAttached) {
            if ($card) {
                $saintCardWrap.append($card);
                onSaintAttached = onAttached;
                if (isViewInDom && typeof onSaintAttached === 'function') {
                    requestAnimationFrame(function() {
                        onSaintAttached();
                    });
                }
            }
        });

        // ---- SECTION MESSE & BIBLE (CÔTE À CÔTE SUR LA MÊME LIGNE SANS FLÈCHE) ----
        var $topCardsGrid = $('<div class="do-top-cards-scroll">');

        // Missa Card
        var $missaCard = $('<div class="do-extra-link-card">')
            .append(
                $('<div class="do-extra-link-content">')
                    .append('<div class="do-extra-link-title">' + (uiLang === 'fr' ? 'Sainte Messe du Jour' : 'Sancta Missa Diei') + '</div>')
                    .append('<div class="do-extra-link-subtitle">' + (uiLang === 'fr' ? 'Introït, Collecte, Épître, Graduel, Évangile, Offertoire, Secrète, Communion...' : 'Introitus, Oratio, Epistola, Graduale, Evangelium, Offertorium, Secreta, Communio...') + '</div>')
            )
            .on('click', function() {
                doState.hora = 'missa';
                localStorage.setItem('do_hora', 'missa');
                renderDO();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });

        // Bible Card
        var $bibleCard = $('<div class="do-extra-link-card">')
            .append(
                $('<div class="do-extra-link-content">')
                    .append('<div class="do-extra-link-title">' + (uiLang === 'fr' ? 'Sainte Bible (Vulgate)' : 'Sacra Biblia Vulgata') + '</div>')
                    .append('<div class="do-extra-link-subtitle">' + (uiLang === 'fr' ? 'Les 73 livres de l’Ancien et du Nouveau Testament bilingue' : '73 libri Canonici Veteris et Novi Testamenti bilinguis') + '</div>')
            )
            .on('click', function() {
                openBible('Matthæus', 1, 1);
            });

        $topCardsGrid.append($missaCard).append($bibleCard);
        $view.append($topCardsGrid);

        // ---- TIMELINE VERTICALE DE L'OFFICE DIVIN (LIGNE BORNEE MATINES -> COMPLIES) ----
        var $timelineSection = $('<div class="do-home-section-wrap">');
        var $timeline = $('<div class="do-styled-timeline">');

        var hoursList = ['matutinum', 'laudes', 'prima', 'tertia', 'sexta', 'nona', 'vesperae', 'completorium'];

        hoursList.forEach(function(hKey) {
            var hInfo = descs[hKey] || { name: hKey, time: '', desc: '' };
            var isCurrent = (hKey === curHora);

            var $row = $('<div class="do-timeline-row' + (isCurrent ? ' active' : '') + '">')
                .append(
                    $('<div class="do-node-track">')
                        .append('<div class="do-line-segment do-line-top"></div>')
                        .append('<div class="do-node-dot' + (isCurrent ? ' is-active' : '') + '"></div>')
                        .append('<div class="do-line-segment do-line-bottom"></div>')
                )
                .append(
                    $('<div class="do-row-main">')
                        .append('<span class="do-row-name">' + escHtml(hInfo.name) + '</span>')
                        .append('<span class="do-row-time">' + escHtml(hInfo.time) + '</span>')
                )
                .on('click', function() {
                    doState.hora = hKey;
                    localStorage.setItem('do_hora', hKey);
                    renderDO();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                });

            $timeline.append($row);
        });

        $timelineSection.append($timeline);
        $view.append($timelineSection);

        $stream.append($saintCardWrap);
        $stream.append($view);
        isViewInDom = true;
        if (typeof onSaintAttached === 'function') {
            requestAnimationFrame(function() {
                onSaintAttached();
            });
        }
        setupHomeSearch();
    });
}

function renderDO() {
    updateEffectiveColor();
    updateSidebarAndHeader();
    closeHeaderDropdown();
    if (window.OremusRouter) {
        window.OremusRouter.syncUrl({ push: false });
    }

    var isHome = (doState.hora === 'home');
    var isBible = (doState.hora === 'bible');
    var isSearch = (doState.hora === 'gregorian_search');
    var isChant = (doState.hora === 'gregorian_chant');
    var isMissa = (doState.hora === 'missa' || doState.hora === 'missa_gregorian');
    $('body').toggleClass('is-home-mode', isHome);
    $('body').toggleClass('is-missa-mode', isMissa);
    $('body').toggleClass('is-bible-mode', isBible);
    $('body').toggleClass('is-search-mode', isSearch);
    $('body').toggleClass('is-chant-mode', isChant);
    if (!isHome && !isMissa) {
        $(window).off('scroll.saintParallax');
    }
    if (typeof updateHeaderScrollState === 'function') {
        updateHeaderScrollState();
    }

    if (isHome) {
        hideMassToc();
        renderHomeView();
        return;
    }

    if (isBible) {
        hideMassToc();
        closeDoPlayer();
        renderBibleMainView();
        return;
    }

    if (isSearch) {
        hideMassToc();
        closeDoPlayer();
        if (window.gregorianSearchUI && typeof window.gregorianSearchUI.renderMainView === 'function') {
            window.gregorianSearchUI.renderMainView();
        }
        return;
    }

    if (isChant) {
        hideMassToc();
        var chantId = doState.currentChantId || localStorage.getItem('do_chant_id');
        if (!chantId) {
            doState.hora = 'gregorian_search';
            localStorage.setItem('do_hora', 'gregorian_search');
            if (window.gregorianSearchUI && typeof window.gregorianSearchUI.renderMainView === 'function') {
                window.gregorianSearchUI.renderMainView();
            }
            return;
        }
        if (window.gregorianSearchUI && typeof window.gregorianSearchUI.renderChantMainView === 'function') {
            window.gregorianSearchUI.renderChantMainView(chantId);
        } else {
            $(document).ready(function() {
                if (window.gregorianSearchUI && typeof window.gregorianSearchUI.renderChantMainView === 'function') {
                    window.gregorianSearchUI.renderChantMainView(chantId);
                }
            });
        }
        return;
    }

    var $stream = $('#do-content-stream');
    $stream.html(renderLoading());

    var isMissa = (doState.hora === 'missa' || doState.hora === 'missa_gregorian');
    var vernLang = (doState.vernacularLang && doState.vernacularLang !== 'none') ? doState.vernacularLang : null;

    if (isMissa) {
        loadMissaData(doState.date, 'la', function(err, laResult) {
            if (vernLang) {
                loadMissaData(doState.date, vernLang, function(err2, vernResult) {
                    displayResult(laResult, vernResult);
                });
            } else {
                displayResult(laResult, null);
            }
        });
    } else {
        loadHoursData(doState.date, doState.hora, 'la', function(err, laResult) {
            if (vernLang) {
                loadHoursData(doState.date, doState.hora, vernLang, function(err2, vernResult) {
                    displayResult(laResult, vernResult);
                });
            } else {
                displayResult(laResult, null);
            }
        });
    }
}

var DO_ROMAN_TO_ORDINAL_FR = {
    'I': '1er', 'II': '2e', 'III': '3e', 'IV': '4e', 'V': '5e', 'VI': '6e',
    'VII': '7e', 'VIII': '8e', 'IX': '9e', 'X': '10e', 'XI': '11e', 'XII': '12e',
    'XIII': '13e', 'XIV': '14e', 'XV': '15e', 'XVI': '16e', 'XVII': '17e',
    'XVIII': '18e', 'XIX': '19e', 'XX': '20e', 'XXI': '21e', 'XXII': '22e',
    'XXIII': '23e', 'XXIV': '24e'
};

var DO_FERIA_NAMES_FR = {
    'Feria II': 'Lundi',
    'Feria III': 'Mardi',
    'Feria IV': 'Mercredi',
    'Feria V': 'Jeudi',
    'Feria VI': 'Vendredi',
    'Sabbato': 'Samedi'
};

function getLocalizedFeastTitle(rawTitle, uiLang) {
    if (!uiLang) uiLang = getUiLang();
    if (!rawTitle) return '';
    if (uiLang === 'la') return rawTitle;

    var clean = rawTitle.trim();
    if (typeof DO_UNIFIED_TITLES !== 'undefined' && DO_UNIFIED_TITLES[uiLang]) {
        var dict = DO_UNIFIED_TITLES[uiLang];
        if (dict[clean]) return dict[clean];
        var keys = Object.keys(dict);
        for (var i = 0; i < keys.length; i++) {
            var k = keys[i];
            if (DO_UNIFIED_TITLES.la && DO_UNIFIED_TITLES.la[k] === clean) {
                return dict[k];
            }
        }
    }
    if (uiLang === 'fr' || uiLang === 'bilingual') {
        if (typeof DO_FR_TEMPORA_TITLES !== 'undefined' && DO_FR_TEMPORA_TITLES[clean]) {
            return DO_FR_TEMPORA_TITLES[clean];
        }

        // Match "Dominica X Post/post Pentecosten"
        var mPent = clean.match(/^Dominica\s+([IVXLCDM]+)\s+(?:post|Post)\s+Pentecosten?/i);
        if (mPent && DO_ROMAN_TO_ORDINAL_FR[mPent[1].toUpperCase()]) {
            return DO_ROMAN_TO_ORDINAL_FR[mPent[1].toUpperCase()] + ' Dimanche après la Pentecôte';
        }

        // Match "Feria X post Dominicam Y post Pentecosten"
        var mFeriaPent = clean.match(/^(Feria\s+(?:II|III|IV|V|VI)|Sabbato)\s+(?:post\s+Dominicam\s+([IVXLCDM]+)\s+(?:post|Post)\s+Pentecosten?)/i);
        if (mFeriaPent) {
            var dayFr = DO_FERIA_NAMES_FR[mFeriaPent[1]] || mFeriaPent[1];
            var sunOrd = DO_ROMAN_TO_ORDINAL_FR[mFeriaPent[2].toUpperCase()] || mFeriaPent[2];
            return dayFr + ' après le ' + sunOrd + ' Dimanche après la Pentecôte';
        }

        // Match "Dominica X Adventus"
        var mAdv = clean.match(/^Dominica\s+([IVXLCDM]+)\s+Adventus/i);
        if (mAdv && DO_ROMAN_TO_ORDINAL_FR[mAdv[1].toUpperCase()]) {
            return DO_ROMAN_TO_ORDINAL_FR[mAdv[1].toUpperCase()] + " Dimanche de l'Avent";
        }

        // Match "Dominica X in Quadragesima"
        var mQuad = clean.match(/^Dominica\s+([IVXLCDM]+)\s+in\s+Quadragesim/i);
        if (mQuad && DO_ROMAN_TO_ORDINAL_FR[mQuad[1].toUpperCase()]) {
            return DO_ROMAN_TO_ORDINAL_FR[mQuad[1].toUpperCase()] + ' Dimanche de Carême';
        }

        // Match "Dominica X post Epiphaniam"
        var mEpi = clean.match(/^Dominica\s+([IVXLCDM]+)\s+(?:post|Post)\s+Epiphaniam/i);
        if (mEpi && DO_ROMAN_TO_ORDINAL_FR[mEpi[1].toUpperCase()]) {
            return DO_ROMAN_TO_ORDINAL_FR[mEpi[1].toUpperCase()] + " Dimanche après l'Épiphanie";
        }

        // Match "Dominica X post Pascha"
        var mPasc = clean.match(/^Dominica\s+([IVXLCDM]+)\s+(?:post|Post)\s+Pascha/i);
        if (mPasc && DO_ROMAN_TO_ORDINAL_FR[mPasc[1].toUpperCase()]) {
            return DO_ROMAN_TO_ORDINAL_FR[mPasc[1].toUpperCase()] + ' Dimanche après Pâques';
        }

        if (/^Dominica Resurrectionis/i.test(clean)) return "Dimanche de Pâques (Résurrection)";
        if (/^Dominica in Albis/i.test(clean)) return "Dimanche de Quasimodo (In Albis)";
        if (/^Dominica Pentecostes/i.test(clean)) return "Dimanche de la Pentecôte";
        if (/^Dominica Sanctissimæ Trinitatis/i.test(clean)) return "La Très Sainte Trinité";
        if (/^Dominica infra Octavam Nativitatis/i.test(clean)) return "Dimanche dans l'Octave de Noël";
        if (/^Dominica post Ascensionem/i.test(clean)) return "Dimanche après l'Ascension";
        if (/^Dominica Passionis/i.test(clean)) return "Dimanche de la Passion";
        if (/^Dominica in Palmis/i.test(clean)) return "Dimanche des Rameaux";
        if (/^Dominica in Septuagesima/i.test(clean)) return "Dimanche de la Septuagésime";
        if (/^Dominica in Sexagesima/i.test(clean)) return "Dimanche de la Sexagésime";
        if (/^Dominica in Quinquagesima/i.test(clean)) return "Dimanche de la Quinquagésime";
        if (/^Feria IV Cinerum/i.test(clean)) return "Mercredi des Cendres";
    }
    return clean;
}

// =============================================================
// GREGORIAN CHANT ENGINE (PROPRIUM, KYRIALE & EXSURGE NOTATION)
// =============================================================

var GABC_LOCAL_CACHE = {};

function parseGabcHeader(gabc) {
    var header = {};
    if (!gabc) return header;
    var lines = gabc.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
        var l = lines[i].trim();
        if (l === '%%') break;
        var m = l.match(/^([\w-]+)\s*:\s*([^;]+);/);
        if (m) {
            var key = m[1].toLowerCase();
            var val = m[2].trim();
            if (key === 'annotation') {
                if (!header.annotations) header.annotations = [];
                header.annotations.push(val);
                header.annotation = val;
            } else {
                header[key] = val;
            }
        }
    }
    return header;
}

var DO_COMMUNE_TO_PROPRIUM = {
    'C1': 'mass_i_martyr_bishop',
    'C1-1': 'mass_ii_martyr_bishop',
    'C1A': 'mass_holy_pope',
    'C1B': 'mass_ii_martyr_bishop',
    'C1V': 'mass_vigil_apostle',
    'C2': 'mass_i_martyr_bishop',
    'C2-1': 'mass_ii_martyr_bishop',
    'C2-1B': 'mass_ii_martyr_bishop',
    'C2A': 'mass_i_martyr_not_bishop',
    'C2A-1': 'mass_ii_martyr_not_bishop',
    'C2B': 'mass_ii_martyr_not_bishop',
    'C2B-1': 'mass_ii_martyr_not_bishop',
    'C3': 'mass_martyrs_paschal',
    'C3A': 'mass_one_martyr',
    'C3A-1': 'mass_one_martyr',
    'C3B': 'mass_i_two_or_more_martyr',
    'C3C': 'mass_ii_two_or_more_martyr',
    'C3D': 'mass_iii_two_or_more_martyr',
    'C4': 'mass_i_confessor_bishop',
    'C4-1': 'mass_ii_confessor_bishop',
    'C4-1B': 'mass_ii_confessor_bishop',
    'C4A': 'mass_i_confessor_bishop',
    'C4B': 'mass_ii_confessor_bishop',
    'C4B-1': 'mass_ii_confessor_bishop',
    'C4C': 'mass_doctors',
    'C5': 'mass_i_confessor_not_bishop',
    'C5-1': 'mass_i_confessor_not_bishop',
    'C5A': 'mass_i_confessor_not_bishop',
    'C5B': 'mass_i_confessor_not_bishop',
    'C5C': 'mass_abbots',
    'C6': 'mass_i_virgin_martyr',
    'C6A': 'mass_i_virgin_martyr',
    'C6B': 'mass_ii_virgin_martyr',
    'C7': 'mass_i_virgin_not_martyr',
    'C7A': 'mass_i_virgin_not_martyr',
    'C7B': 'mass_ii_virgin_not_martyr',
    'C8': 'mass_holy_woman_martyr',
    'C8A': 'mass_holy_woman_martyr',
    'C8B': 'mass_holy_woman_not_martyr',
    'C9': 'mass_dedication_church',
    'C10': 'mass_bvm',
    'C10A': 'mass_bvm',
    'C10B': 'mass_bvm',
    'C10C': 'mass_bvm',
    'C10PASC': 'mass_bvm',
    'C11': 'SMperannum',
    'C12': 'nuptial_mass',
    'DEFUNCTORUM': 'requiem'
};

function convertDOKeyToPropriumKey(key, mom) {
    if (!key && mom && mom.isValid()) {
        var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return monthNames[mom.month()] + mom.date();
    }
    if (!key) return null;
    var clean = key.replace(/^(Sancti|Tempora|Commune)\//i, '').replace(/\.txt$/i, '').trim();

    if (typeof proprium !== 'undefined' && proprium[clean]) return clean;

    var m = clean.match(/^(\d{2})-(\d{2})(.*)$/);
    if (m) {
        var monInt = parseInt(m[1], 10);
        var dayInt = parseInt(m[2], 10);
        var sfx = m[3] || '';
        var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        if (monInt >= 1 && monInt <= 12) {
            var saintKey = monthNames[monInt - 1] + dayInt + sfx;
            if (typeof proprium !== 'undefined' && proprium[saintKey]) return saintKey;
            var saintKeyBase = monthNames[monInt - 1] + dayInt;
            if (typeof proprium !== 'undefined' && proprium[saintKeyBase]) return saintKeyBase;
            return saintKey;
        }
    }

    var commMatch = clean.match(/^C\d+(?:-[0-9]+)?[a-z\-]*(?:Pasc)?/i);
    if (commMatch) {
        var cCode = commMatch[0].toUpperCase();
        if (DO_COMMUNE_TO_PROPRIUM[cCode]) return DO_COMMUNE_TO_PROPRIUM[cCode];
        var cNoTrailing = cCode.replace(/[a-z]+$/i, '');
        if (DO_COMMUNE_TO_PROPRIUM[cNoTrailing]) return DO_COMMUNE_TO_PROPRIUM[cNoTrailing];
        var cBase = cCode.replace(/-[0-9]+[a-z]*$/i, '').replace(/[a-z]+$/i, '');
        if (DO_COMMUNE_TO_PROPRIUM[cBase]) return DO_COMMUNE_TO_PROPRIUM[cBase];
    }

    var pentMatch = clean.match(/^Pent0?(\d+)/i);
    if (pentMatch) {
        var pNum = parseInt(pentMatch[1], 10);
        if (typeof proprium !== 'undefined') {
            if (proprium['Pent' + pNum]) return 'Pent' + pNum;
            if (proprium['Pent0' + pNum]) return 'Pent0' + pNum;
        }
        return 'Pent' + pNum;
    }
    var tempMatch = clean.match(/^(Adv\d|Quad\d|Quadp\d|Pasc\d|Epi\d)/i);
    if (tempMatch) {
        return tempMatch[1];
    }

    return clean;
}

function getGregorianChantsMapForMissa(mom, officiumKey, selectedKyriale, missaResult) {
    var result = {};
    if (typeof proprium === 'undefined') return result;

    var prop = null;
    var matchedKey = null;

    // 1. Direct key match (from officiumKey if set)
    if (officiumKey) {
        var pk = convertDOKeyToPropriumKey(officiumKey, mom);
        if (pk && proprium[pk]) {
            prop = proprium[pk];
            matchedKey = pk;
        } else if (proprium[officiumKey]) {
            prop = proprium[officiumKey];
            matchedKey = officiumKey;
        }
    }

    // 2. From missaResult (loadedPath / communeRef)
    if (!prop && missaResult) {
        if (missaResult.loadedPath) {
            var pkLoaded = convertDOKeyToPropriumKey(missaResult.loadedPath, mom);
            if (pkLoaded && proprium[pkLoaded]) {
                prop = proprium[pkLoaded];
                matchedKey = pkLoaded;
            }
        }
        if (!prop && missaResult.communeRef) {
            var commKey = DO_COMMUNE_TO_PROPRIUM[missaResult.communeRef] || DO_COMMUNE_TO_PROPRIUM[missaResult.communeRef.replace(/[a-z]$/i, '')];
            if (commKey && proprium[commKey]) {
                prop = proprium[commKey];
                matchedKey = commKey;
            }
        }
    }

    // 3. Date-based matching (Sanctoral or Tempora based on liturgical day)
    if (!prop && mom && mom.isValid()) {
        var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        var saintKey = monthNames[mom.month()] + mom.date();
        var codes = computeLiturgicalCodes(mom);
        var tempKey = codes.tempora ? codes.tempora.replace(/-\d+$/, '') : '';
        var normTempKey = tempKey ? tempKey.replace(/^Pent0?(\d+)$/i, 'Pent$1') : '';

        // If not Sunday, prioritize Sanctoral if today has a saint in proprium
        if (!codes.isSunday) {
            if (proprium[saintKey]) {
                prop = proprium[saintKey];
                matchedKey = saintKey;
            } else if (normTempKey && proprium[normTempKey]) {
                prop = proprium[normTempKey];
                matchedKey = normTempKey;
            } else if (tempKey && proprium[tempKey]) {
                prop = proprium[tempKey];
                matchedKey = tempKey;
            }
        } else {
            // Sunday: prioritize Tempora unless feast is major Sanctoral
            if (normTempKey && proprium[normTempKey]) {
                prop = proprium[normTempKey];
                matchedKey = normTempKey;
            } else if (tempKey && proprium[tempKey]) {
                prop = proprium[tempKey];
                matchedKey = tempKey;
            } else if (proprium[saintKey]) {
                prop = proprium[saintKey];
                matchedKey = saintKey;
            }
        }
    }

    // Handle reference redirects in proprium (e.g. Aug25 -> mass_i_confessor_not_bishop)
    var refDepth = 0;
    while (prop && prop.ref && proprium[prop.ref] && refDepth < 5) {
        prop = proprium[prop.ref];
        refDepth++;
    }

    // Default fallback if still null
    if (!prop) {
        prop = proprium['Pent14'] || proprium['Pent12'] || proprium['SMperannum'] || proprium['C4'] || {};
    }

    // 3. Resolve Kyriale Ordinary Chants
    var ord = null;
    if (typeof massOrdinary !== 'undefined' && massOrdinary.length) {
        var ordIdx = -1;
        if (selectedKyriale && selectedKyriale !== 'auto') {
            ordIdx = parseInt(selectedKyriale, 10) - 1;
        }
        if (ordIdx >= 0 && ordIdx < massOrdinary.length) {
            ord = massOrdinary[ordIdx];
        } else {
            // Auto selection based on liturgical season
            var y = mom ? mom.year() : moment().year();
            var easter = moment(moment.easter(y));
            var septuagesima = moment(easter).subtract(63, 'days');
            var pentecost = moment(easter).add(49, 'days');

            if (mom && mom.isSameOrAfter(easter) && mom.isBefore(pentecost)) {
                ord = massOrdinary[0]; // Missa I (Lux et origo - Paschal)
            } else if (mom && (mom.isSameOrAfter(septuagesima) && mom.isBefore(easter))) {
                ord = massOrdinary[16]; // Missa XVII (Advent & Lent)
            } else if (mom && (mom.day() === 0)) {
                ord = massOrdinary[10]; // Missa XI (Orbis factor - Sundays)
            } else {
                ord = massOrdinary[7]; // Missa VIII (De Angelis)
            }
        }
    }

    function getOrdId(part) {
        if (!part) return null;
        if (Array.isArray(part)) return part[0] ? (part[0].id || part[0]) : null;
        return part.id || part;
    }
    function getOrdName(part, defaultName) {
        if (!part) return defaultName;
        if (Array.isArray(part)) return (part[0] && part[0].name) ? part[0].name : defaultName;
        return part.name || defaultName;
    }

    var isPaschal = mom ? (mom.isSameOrAfter(moment(moment.easter(mom.year()))) && mom.isBefore(moment(moment.easter(mom.year())).add(49, 'days'))) : false;
    var aspId = isPaschal ? 958 : 497;
    var aspName = isPaschal ? 'Vidi aquam' : 'Asperges me';

    // Map into section IDs matching assembleFullMissa card IDs
    result['incipit'] = [{ id: aspId, name: aspName, part: 'Antiphona' }];
    if (prop.inID) result['introitus'] = [{ id: prop.inID, name: 'Introitus', part: 'Introitus' }];
    
    if (ord) {
        var kId = getOrdId(ord.kyrie);
        if (kId) result['kyrie'] = [{ id: kId, name: getOrdName(ord.kyrie, 'Kyrie eleison'), part: 'Kyrie' }];
        var gId = getOrdId(ord.gloria);
        if (gId) result['gloria'] = [{ id: gId, name: getOrdName(ord.gloria, 'Gloria in excelsis Deo'), part: 'Gloria' }];
    }

    if (prop.grID) result['graduale'] = [{ id: prop.grID, name: 'Graduale', part: 'Graduale' }];
    if (prop.trID) result['tractus'] = [{ id: prop.trID, name: 'Tractus', part: 'Tractus' }];
    if (prop.alID) result['alleluia'] = [{ id: prop.alID, name: 'Alleluia', part: 'Alleluia' }];
    if (prop.seqID) result['sequentia'] = [{ id: prop.seqID, name: 'Sequentia', part: 'Sequentia' }];

    // Credo (Credo III 749 by default or Credo I 344)
    var credoId = (ord && ord.credo) ? getOrdId(ord.credo) : 749;
    var credoName = (ord && ord.credo) ? getOrdName(ord.credo, 'Credo III') : 'Credo III';
    result['credo'] = [{ id: credoId, name: credoName, part: 'Credo' }];

    if (prop.ofID) result['offertorium'] = [{ id: prop.ofID, name: 'Offertorium', part: 'Offertorium' }];

    if (ord && ord.sanctus) {
        var sId = getOrdId(ord.sanctus);
        if (sId) result['praefatio'] = [{ id: sId, name: getOrdName(ord.sanctus, 'Sanctus'), part: 'Sanctus' }];
    }

    if (ord && ord.agnus) {
        var aId = getOrdId(ord.agnus);
        if (aId) result['communion_prep'] = [{ id: aId, name: getOrdName(ord.agnus, 'Agnus Dei'), part: 'Agnus Dei' }];
    }

    if (prop.coID) result['communio'] = [{ id: prop.coID, name: 'Communio', part: 'Communio' }];

    if (ord && ord.ite) {
        var iId = getOrdId(ord.ite);
        if (iId) result['conclusio'] = [{ id: iId, name: getOrdName(ord.ite, 'Ite Missa est'), part: 'Ite Missa est' }];
    }

    return result;
}

function preprocessGabcForExsurge(gabc) {
    if (!gabc || typeof gabc !== 'string') return gabc;

    // 1. Process <eu>...</eu> (Euouae - saeculorum Amen termination)
    // Convert each syllable inside <eu> into italic rubric colored letters: <c><i>E</i></c>(h) <c><i>u</i></c>(h)...
    gabc = gabc.replace(/<eu>([\s\S]*?)<\/eu>/gi, function(match, inner) {
        return inner.replace(/(^|\))([^()]+)(?=\(|$)/g, function(m, closeParen, text) {
            var trimmed = text.trim();
            if (!trimmed) return m;
            var leadingSpace = text.match(/^\s*/)[0];
            var trailingSpace = text.match(/\s*$/)[0];
            return closeParen + leadingSpace + '<c><i>' + trimmed + '</i></c>' + trailingSpace;
        });
    });
    // Remove any remaining unclosed <eu> or </eu> tags
    gabc = gabc.replace(/<\/?eu>/gi, '');

    // 2. Remove ledger line indications like [ll:1], [oll:1{}], [ull:0;12mm], [cs:...], [nobar]
    gabc = gabc.replace(/\[[ou]?ll:[^\]]*\]/ig, '');
    gabc = gabc.replace(/\[(?:cs|alt|nobar)[^\]]*\]/ig, '');

    // 3. Normalize \Vbar, \Rbar, \Abar to standard bar symbols
    gabc = gabc.replace(/<v>\\([VRA])bar<\/v>/gi, function(m, b) {
        return b.toUpperCase() + '/.';
    }).replace(/<sp>([VRA])\/?<\/sp>\.?/gi, function(m, b) {
        return b.toUpperCase() + '/.';
    });

    // 4. Wrap standard rubric indicators (Ps., V., R., T.P., ij., etc.) in rubric coloring
    // Match <i>Ps.</i>, <i>Ps</i>, <i>Psalmus</i>, Ps.
    gabc = gabc.replace(/(^|\s|\))<i>\s*(Ps\.?|Psalmus)\s*<\/i>/gi, '$1<c><i>Ps.</i></c>');
    gabc = gabc.replace(/(^|\s|\))(Ps\.)(?=\s+[A-ZÁÉÍÓÚ])/g, '$1<c><i>Ps.</i></c>');

    // Match <i>V.</i>, <i>℣.</i>, <i>℣</i>, <i>Versus</i>, V/.
    gabc = gabc.replace(/(^|\s|\))<i>\s*([V℣]\.?|Versus)\s*<\/i>/gi, '$1<c><i>℣.</i></c>');
    gabc = gabc.replace(/(^|\s|\))(V\/\.?)(?=\s*[0-9A-ZÁÉÍÓÚ(])/g, '$1<c><i>℣.</i></c>');

    // Match <i>R.</i>, <i>℟.</i>, <i>℟</i>, <i>Responsorium</i>, R/.
    gabc = gabc.replace(/(^|\s|\))<i>\s*([R℟]\.?|Responsorium)\s*<\/i>/gi, '$1<c><i>℟.</i></c>');
    gabc = gabc.replace(/(^|\s|\))(R\/\.?)(?=\s*[0-9A-ZÁÉÍÓÚ(])/g, '$1<c><i>℟.</i></c>');

    // Match <i>T.P.</i>, <i>T. P.</i>, <i>Tp.</i>, <i>Extra T.P.</i>
    gabc = gabc.replace(/(^|\s|\))<i>\s*(?:Extra\s+)?T\.?\s*P\.?\s*<\/i>/gi, '$1<c><i>T. P.</i></c>');

    // Match <i>ij.</i>, <i>iij.</i>, <i>bis</i>, <i>ter</i>
    gabc = gabc.replace(/(^|\s|\))<i>\s*(i+j\.?|bis|ter)\s*<\/i>/gi, function(m, p1, p2) {
        return p1 + '<c><i>' + p2 + '</i></c>';
    });

    // Match section annotations like <i>Tractus</i>, <i>Graduale</i>, <i>Canticum</i>, <i>Post Septuagesimam</i>, <i>Sequentia</i>
    gabc = gabc.replace(/(^|\s|\))<i>\s*(Tractus|Graduale|Canticum|Post Septuagesimam|Sequentia|Offertorium|Communio|Introitus)\s*<\/i>/gi, function(m, p1, p2) {
        return p1 + '<c><i>' + p2 + '</i></c>';
    });

    // 5. Episemata fixes and alt text formatting
    gabc = gabc.replace(/\\emph{([^(}]+)\}/g, '<c><i>$1</i></c>');
    gabc = gabc.replace(/(v[A-Z]__[A-Z])([^_])/g, '$1_3$2');
    gabc = gabc.replace(/\\hspace{[^}]*}/g, '');

    // 6. Make standalone asterisks and daggers rubric colored
    gabc = gabc.replace(/([^)]\s+)([*†])(?=\s*\()/g, '$1<c>$2</c>');

    return gabc;
}
window.preprocessGabcForExsurge = preprocessGabcForExsurge;

function formatChantTime(s) {
    if (isNaN(s) || s < 0) s = 0;
    var m = Math.floor(s / 60);
    var sec = Math.floor(s % 60);
    return m + ':' + (sec < 10 ? '0' : '') + sec;
}

// Helpers for weighted durations (mora / dotted notes, episema, salicus, quilisma, inter-phrase gaps)
function _chantIsSalicus(allNotes, idx) {
    try {
        var note = allNotes[idx];
        if (!note) return false;
        var nextNote = allNotes[idx+1];
        if (nextNote && nextNote.constructor && nextNote.constructor.name !== 'Note') nextNote = null;
        var prevNote = allNotes[idx-1];
        if (prevNote && prevNote.constructor && prevNote.constructor.name !== 'Note') prevNote = null;
        if (note.ictus && prevNote && (note.pitch.toInt() - prevNote.pitch.toInt() == 7) && nextNote && (nextNote.pitch.toInt() - note.pitch.toInt() == 1)) return true;
        var isSolesmes = (typeof window.getIsUsingSolesmesLengths === 'function' ? window.getIsUsingSolesmesLengths() : (localStorage.isUsingSolesmesLengths !== 'false'));
        if (isSolesmes && note.ictus && note.ictus.glyphCode === 'VerticalEpisemaBelow' && note.glyphVisualizer && (note.glyphVisualizer.glyphCode === 'PodatusLower' || note.glyphVisualizer.glyphCode === 'BeginningAscLiquescent') && prevNote && nextNote && (note.pitch.toInt() - prevNote.pitch.toInt() > 0) && (nextNote.pitch.toInt() - note.pitch.toInt() > 0)) return true;
    } catch(e) {}
    return false;
}
function _chantNoteWeightedDuration(allNotes, idx) {
    var note = allNotes[idx];
    if (!note) return 1;
    if (note.constructor && note.constructor.name !== 'Note' && !note.pitch) return 1;
    var nextNote = allNotes[idx+1];
    if (nextNote && nextNote.constructor && nextNote.constructor.name !== 'Note') nextNote = null;
    var prevNote = allNotes[idx-1];
    if (prevNote && prevNote.constructor && prevNote.constructor.name !== 'Note') prevNote = null;
    var dur = 1;
    try {
        if (note.morae && note.morae.length) dur = 2;
        else if (nextNote && ( (nextNote.morae && nextNote.morae.length > 1) || (window.exsurge && nextNote.shape === exsurge.NoteShape.Quilisma) || _chantIsSalicus(allNotes, idx))) dur = 1.8;
        else if (note.episemata && note.episemata.length) {
            var cnt = 1;
            if (prevNote && prevNote.episemata && prevNote.episemata.length) cnt++;
            if (nextNote && nextNote.episemata && nextNote.episemata.length) cnt++;
            dur += 0.9 / cnt;
        }
    } catch(e) {}
    return dur;
}
function _getChantWeightedInfo(score) {
    if (!score || !score.notations) return null;
    var allNotes = [].concat.apply([], score.notations.map(function(n){ return n.notes || []; })).filter(function(n){ return n && !n.isAccidental; });
    if (!allNotes.length) return null;
    var noteDurs = [];
    for (var i=0;i<allNotes.length;i++) noteDurs.push(_chantNoteWeightedDuration(allNotes,i));
    // Inter-phrase gaps: walk notations to detect bar after each note block
    var gapAfterNote = {};
    var notePos = 0;
    for (var ni=0; ni<score.notations.length; ni++) {
        var notat = score.notations[ni];
        var isDiv = !!(notat.isDivider || /Bar$/.test(String(notat.constructor && notat.constructor.name || '')));
        if (notat.notes && notat.notes.length) {
            var cnt = notat.notes.filter(function(n){ return !n.isAccidental; }).length;
            notePos += cnt;
        } else if (isDiv) {
            var gap = 0;
            var cname = String(notat.constructor && notat.constructor.name || String(notat.constructor));
            if (/DoubleBar|FullBar/.test(cname)) gap = 1.6; // longer silence between phrases
            else if (/HalfBar|DominicanBar|Virgula/.test(cname)) gap = 0.7;
            else gap = 0.45;
            // attribute gap to previous note
            var prevIdx = notePos - 1;
            if (prevIdx >= 0) gapAfterNote[prevIdx] = Math.max(gapAfterNote[prevIdx]||0, gap);
        }
    }
    var total = 0;
    for (var k=0;k<noteDurs.length;k++) { total += noteDurs[k]; if (gapAfterNote[k]) total += gapAfterNote[k]; }
    return { allNotes: allNotes, noteDurs: noteDurs, gapAfterNote: gapAfterNote, total: total };
}
function _fractionToChantIndex(info, fraction) {
    if (!info) return 0;
    var target = Math.max(0, Math.min(info.total, fraction * info.total));
    var cum = 0;
    for (var i=0;i<info.allNotes.length;i++) {
        var nd = info.noteDurs[i];
        if (target < cum + nd) return i;
        cum += nd;
        var gap = info.gapAfterNote[i] || 0;
        if (gap) {
            if (target < cum + gap) return i; // stay on same note during inter-phrase silence
            cum += gap;
        }
    }
    return info.allNotes.length - 1;
}
function _indexToFraction(info, idx) {
    if (!info || !info.total) return 0;
    var cum = 0;
    for (var i=0;i<idx && i<info.allNotes.length;i++) { cum += info.noteDurs[i]; if (info.gapAfterNote[i]) cum += info.gapAfterNote[i]; }
    return cum / info.total;
}

function updateDoPlayerProgressAndTime(score, note, progressFraction) {
    if (!score || !score.notations) return;
    var info = _getChantWeightedInfo(score);
    if (!info) return;
    var allNotes = info.allNotes;
    var tempoBpm = parseInt(localStorage.getItem('do_tempo'), 10) || (window.Tone && window.Tone.Transport && window.Tone.Transport.bpm ? window.Tone.Transport.bpm.value : 165) || 165;
    // fallback to #playerTempoValue if it exists (legacy)
    var pv = $('#playerTempoValue').text();
    if (pv) { var pvTempo = parseInt(pv,10); if (!isNaN(pvTempo) && pvTempo>30) tempoBpm = pvTempo; }
    var secPerUnit = 60 / tempoBpm;
    var totalSeconds = info.total * secPerUnit;

    var pct = 0;
    var elapsedUnits = 0;

    if (typeof progressFraction === 'number') {
        pct = Math.max(0, Math.min(100, progressFraction * 100));
        elapsedUnits = progressFraction * info.total;
    } else if (note) {
        var idx = allNotes.indexOf(note);
        if (idx < 0) {
            for (var i = 0; i < allNotes.length; i++) {
                if (allNotes[i] === note || (note.sourceIndex !== undefined && allNotes[i].sourceIndex === note.sourceIndex) || (note.elementIndex !== undefined && allNotes[i].elementIndex === note.elementIndex)) {
                    idx = i; break;
                }
            }
        }
        idx = Math.max(0, idx);
        elapsedUnits = 0;
        for (var j=0;j<idx;j++) { elapsedUnits += info.noteDurs[j]; if (info.gapAfterNote[j]) elapsedUnits += info.gapAfterNote[j]; }
        pct = (elapsedUnits / info.total) * 100;
    } else {
        // no note and no fraction -> at start
        pct = 0; elapsedUnits = 0;
    }

    var elapsedSec = elapsedUnits * secPerUnit;
    var remainingSec = Math.max(0, totalSeconds - elapsedSec);
    $('#playerProgressFill').css('width', pct + '%');
    $('#playerCurrentTime').text(formatChantTime(elapsedSec));
    $('#playerChantTime').text(formatChantTime(totalSeconds)).attr('title', 'Durée totale : ' + formatChantTime(totalSeconds) + ' (restant : ' + formatChantTime(remainingSec) + ')');
}

function findNearestChantElement(svg, pageX, pageY) {
    if (!svg) return null;
    var candidates = svg.querySelectorAll('use[source-index], text.lyric, text.dropCap, text.aboveLinesText, text[source-index]');
    if (!candidates.length) return null;

    var bestEl = null;
    var bestDist = Infinity;

    for (var i = 0; i < candidates.length; i++) {
        var el = candidates[i];
        var rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;

        var cx = window.pageXOffset + rect.left + rect.width / 2;
        var cy = window.pageYOffset + rect.top + rect.height / 2;

        var dx = pageX - cx;
        var dy = pageY - cy;
        // Weight vertical distance slightly higher to favor elements on the clicked line
        var dist = (dx * dx) + (dy * dy * 3);

        if (dist < bestDist) {
            bestDist = dist;
            bestEl = el;
        }
    }

    return bestEl;
}
function findNextChantElement(svg, pageX, pageY) {
    if (!svg) return null;
    var candidates = svg.querySelectorAll('use[source-index], text.lyric, text.dropCap, text.aboveLinesText, text[source-index]');
    if (!candidates.length) return null;
    var bestEl = null;
    var bestScore = Infinity;
    for (var i = 0; i < candidates.length; i++) {
        var el = candidates[i];
        var rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;
        var cx = window.pageXOffset + rect.left + rect.width / 2;
        var cy = window.pageYOffset + rect.top + rect.height / 2;
        // Is candidate after click in reading order (left->right, top->bottom)
        var isAfter = (cy > pageY + 8) || (Math.abs(cy - pageY) <= 20 && cx > pageX + 4);
        if (!isAfter) continue;
        // Score: primary by vertical distance, then horizontal
        var dy = cy - pageY;
        var dx = cx - pageX;
        // For same line, prefer smallest dx; for next line, prefer smallest dy then dx
        var score = dy * 1000 + dx;
        if (dy < 0) score += 100000;
        if (score < bestScore) { bestScore = score; bestEl = el; }
    }
    // Fallback to nearest if no after found (e.g. click at end)
    if (!bestEl) return findNearestChantElement(svg, pageX, pageY);
    return bestEl;
}

var _doCurrentPlayerCard = null;
var _doCurrentScore = null;
var _doProgressInterval = null;
var _doActiveNoteEl = null; // The single currently-highlighted note element
var _doActiveLyricEl = null; // The single currently-highlighted lyric text element

function clearActiveNote(force) {
    // Keep manual first-click highlight for 4s
    if (!force && Date.now() < _manualHighlightUntil) {
        return;
    }
    if (_doActiveNoteEl) {
        _doActiveNoteEl.classList.remove('active', 'porrectus-left', 'porrectus-right');
        _doActiveNoteEl.style.removeProperty('fill');
        _doActiveNoteEl = null;
    }
    if (_doActiveLyricEl) {
        _doActiveLyricEl.classList.remove('active');
        _doActiveLyricEl.style.removeProperty('fill');
        $(_doActiveLyricEl).find('tspan').each(function() {
            this.classList.remove('active');
            this.style.removeProperty('fill');
        });
        _doActiveLyricEl = null;
    }
    // Remove active class and inline fill from all notes, texts, tspans across all chant cards
    document.querySelectorAll('.do-chant-card svg .active, .do-chant-card svg text.active, .do-chant-card svg tspan.active, .do-chant-card svg use.active').forEach(function(el) {
        el.classList.remove('active', 'porrectus-left', 'porrectus-right');
        el.style.removeProperty('fill');
    });
    document.querySelectorAll('.do-chant-card svg text tspan').forEach(function(el) {
        el.classList.remove('active');
        el.style.removeProperty('fill');
    });
}

/**
 * Build the note play sequence as a video would perform it:
 * At each DoubleBar or FullBar, the antiphon (notes from note[0] to first DoubleBar)
 * is repeated before continuing.
 *
 * Returns an array of note indices into allNotes.
 * The cache is keyed on the score object to avoid rebuilding each frame.
 */
function _buildChantSequenceWithRepeats(score, allNotes) {
    if (score._cachedRepeatSequence && score._cachedRepeatSequence.notes === allNotes) {
        return score._cachedRepeatSequence.seq;
    }

    // Find the index (in allNotes) of the first note after the first DoubleBar/FullBar
    var firstBreakIdx = -1; // index into allNotes of the first note in the refrain section
    var noteCount = 0;

    for (var ni = 0; ni < (score.notations || []).length; ni++) {
        var notat = score.notations[ni];
        var isDoubleBar = (notat.constructor && (
            notat.constructor.name === 'DoubleBar' ||
            notat.constructor.name === 'FullBar'
        ));
        // Fallback: check class string representation
        if (!isDoubleBar && notat.constructor) {
            var cname = String(notat.constructor);
            isDoubleBar = /DoubleBar|FullBar/.test(cname);
        }

        if (!isDoubleBar && notat.notes) {
            noteCount += notat.notes.filter(function(n) { return !n.isAccidental; }).length;
        }

        if (isDoubleBar && firstBreakIdx === -1 && noteCount > 0) {
            firstBreakIdx = noteCount; // notes before the bar = antiphon
            break;
        }
    }

    // If no double bar found, no repeat structure → identity sequence
    var seq;
    if (firstBreakIdx <= 0 || firstBreakIdx >= allNotes.length) {
        seq = allNotes.map(function(_, i) { return i; });
    } else {
        // Antiphon = [0 .. firstBreakIdx-1]
        // Verse sections are separated by subsequent double bars
        // Simplified model: A B₁ A B₂ A ...  where A=antiphon, Bₙ=each verse
        var antiphon = [];
        for (var a = 0; a < firstBreakIdx; a++) antiphon.push(a);

        seq = antiphon.slice(); // first antiphon

        // Collect verse blocks by scanning further DoubleBar positions
        var verseStart = firstBreakIdx;
        var prevBarNoteCount = firstBreakIdx;
        var innerNoteCount = firstBreakIdx;

        for (var ni2 = 0; ni2 < (score.notations || []).length; ni2++) {
            var notat2 = score.notations[ni2];
            var isBar2 = (notat2.constructor && /DoubleBar|FullBar/.test(String(notat2.constructor)));
            var notes2 = (notat2.notes || []).filter(function(n) { return !n.isAccidental; });

            if (!isBar2) {
                innerNoteCount += notes2.length;
            } else if (innerNoteCount > prevBarNoteCount) {
                // We have a new verse block: [prevBarNoteCount .. innerNoteCount-1]
                if (prevBarNoteCount === firstBreakIdx) {
                    // Skip the first bar (already handled as antiphon end)
                    prevBarNoteCount = innerNoteCount;
                    continue;
                }
                var block = [];
                for (var b = prevBarNoteCount; b < innerNoteCount; b++) block.push(b);
                seq = seq.concat(block).concat(antiphon); // verse + antiphon repeat
                prevBarNoteCount = innerNoteCount;
            }
        }

        // Remaining notes after last bar (if any)
        if (prevBarNoteCount < allNotes.length) {
            var tail = [];
            for (var t = prevBarNoteCount; t < allNotes.length; t++) tail.push(t);
            seq = seq.concat(tail);
        }
    }

    score._cachedRepeatSequence = { notes: allNotes, seq: seq };
    return seq;
}

var _manualHighlightUntil = 0;
function highlightChantNoteAtFraction(fraction) {
    // Keep manual click highlight for 4s (first use for a piece) — must be before sync check
    if (Date.now() < _manualHighlightUntil) {
        return;
    }
    if (window.doYT && window.doYT.syncEnabled === false) {
        clearActiveNote();
        return;
    }
    if (typeof fraction !== 'number' || isNaN(fraction)) return;
    if (!_doCurrentScore || !_doCurrentScore.notations) return;
    var info = _getChantWeightedInfo(_doCurrentScore);
    if (!info || !info.allNotes.length) return;
    var allNotes = info.allNotes;

    var targetIdx;

    var isYtVideo = (window.doYT && window.doYT.activeId && window.doYT.activeId !== 'synth' && window.doYT.syncEnabled !== false);
    if (isYtVideo) {
        var seq = _buildChantSequenceWithRepeats(_doCurrentScore, allNotes);
        // Build weighted durations for seq
        var seqDurs = [];
        var seqTotal = 0;
        for (var si=0; si<seq.length; si++) { var d = info.noteDurs[seq[si]] || 1; seqDurs.push(d); seqTotal += d; if (info.gapAfterNote[seq[si]]) { seqTotal += info.gapAfterNote[seq[si]]; } }
        // For simplicity map via cumulative weighted seq (including gaps approximated after each seq element)
        var targetUnits = fraction * seqTotal;
        var cum = 0;
        targetIdx = seq[0];
        for (var s2=0; s2<seq.length; s2++) {
            var sd = seqDurs[s2];
            if (targetUnits < cum + sd) { targetIdx = seq[s2]; break; }
            cum += sd;
            var sg = info.gapAfterNote[seq[s2]] || 0;
            if (sg) {
                if (targetUnits < cum + sg) { targetIdx = seq[s2]; break; }
                cum += sg;
            }
            if (s2 === seq.length-1) targetIdx = seq[s2];
        }
    } else {
        targetIdx = _fractionToChantIndex(info, fraction);
    }

    var note = allNotes[targetIdx];
    if (!note) return;

    var $card = _doCurrentPlayerCard;
    var scoreSvg = ($card && $card.find('svg')[0]) || _doCurrentScore.svg;
    if (!scoreSvg) return;

    var noteElem = note.svgNode;
    if (!noteElem) {
        var elemIdx = note.elementIndex;
        if (elemIdx !== undefined) {
            noteElem = $(scoreSvg).find('use[element-index="' + elemIdx + '"]')[0];
        }
        if (!noteElem && note.sourceIndex !== undefined) {
            noteElem = $(scoreSvg).find('use[source-index="' + note.sourceIndex + '"]')[0];
        }
    }

    if (!noteElem) return;
    if (noteElem === _doActiveNoteEl && noteElem.classList.contains('active')) return;

    var accentColor = (window.doState && window.doState.settings && window.doState.settings.color) || localStorage.getItem('do_color') || '#c96b63';

    if (_doActiveNoteEl && _doActiveNoteEl !== noteElem) {
        _doActiveNoteEl.classList.remove('active', 'porrectus-left', 'porrectus-right');
        _doActiveNoteEl.style.removeProperty('fill');
    }
    $(scoreSvg).find('use.active').each(function() {
        if (this !== noteElem) {
            this.classList.remove('active', 'porrectus-left', 'porrectus-right');
            this.style.removeProperty('fill');
        }
    });

    var href = noteElem.getAttribute('href') || (noteElem.attributes && noteElem.attributes.getNamedItem && noteElem.attributes.getNamedItem('href') ? noteElem.attributes.getNamedItem('href').value : '');
    if (href === '#None' && noteElem.previousSibling) {
        noteElem = noteElem.previousSibling;
        noteElem.classList.remove('porrectus-left');
        noteElem.classList.add('porrectus-right');
    } else if (/^#Porrectus/.test(href)) {
        noteElem.classList.add('porrectus-left');
    }

    noteElem.classList.add('active');
    noteElem.style.setProperty('fill', accentColor, 'important');
    _doActiveNoteEl = noteElem;

    // Find and highlight corresponding syllable
    var lyricEl = null;
    if (note.neume && note.neume.lyrics && note.neume.lyrics.length > 0 && note.neume.lyrics[0].svgNode) {
        lyricEl = note.neume.lyrics[0].svgNode;
    }
    if (!lyricEl) {
        var $grp = $(noteElem).closest('g.ChantNotationElement, g[class*="ChantNotation"]');
        if (!$grp.length) $grp = $(noteElem).parent().parent();
        lyricEl = $grp.find('text.lyric, text.dropCap, text.aboveLinesText, text')[0];
    }

    if (lyricEl) {
        if (_doActiveLyricEl && _doActiveLyricEl !== lyricEl) {
            _doActiveLyricEl.classList.remove('active');
            _doActiveLyricEl.style.removeProperty('fill');
            $(_doActiveLyricEl).find('tspan').each(function() {
                this.classList.remove('active');
                this.style.removeProperty('fill');
            });
        }
        $(scoreSvg).find('text.active, tspan.active').each(function() {
            if (this !== lyricEl && !lyricEl.contains(this)) {
                this.classList.remove('active');
                this.style.removeProperty('fill');
            }
        });

        lyricEl.classList.add('active');
        lyricEl.style.setProperty('fill', accentColor, 'important');
        $(lyricEl).find('tspan').each(function() {
            this.classList.add('active');
            this.style.setProperty('fill', accentColor, 'important');
        });
        _doActiveLyricEl = lyricEl;
    }

    if (typeof isElementInVisibleViewport === 'function' && typeof centerActiveNote === 'function') {
        if (!isElementInVisibleViewport(noteElem) && (typeof _userIsScrolling === 'undefined' || !_userIsScrolling)) {
            centerActiveNote(false);
        }
    }
}

function handleChantElementClick(clickedEl, e) {
    if (e) e.stopPropagation();

    // Deactivate on Bible pages
    if (window.doState && window.doState.hora === 'bible') return;

    var isYtActive = (window.doYT && window.doYT.activeId && window.doYT.activeId !== 'synth');
    var wasPlaying = (window.isPlayingChant && window.isPlayingChant()) || (isYtActive && $('#playerBtnPlay').hasClass('playing'));

    if (!isYtActive) {
        if (window.stopScore) {
            window.stopScore();
        }
        setDoPlayerBarState(false);
    }

    // Clear previous selection (force) and keep new highlight for 4s
    clearActiveNote(true);
    _manualHighlightUntil = Date.now() + 4000;

    var $clicked = $(clickedEl);
    var $card = $clicked.closest('.do-chant-card');
    if (!$card.length) return;
    var score = $card.data('chant-score');
    if (!score) return;

    var noteEl = null;
    var lyricEl = null;
    var note = null;

    var accentColor = (window.doState && window.doState.settings && window.doState.settings.color) || localStorage.getItem('do_color') || '#c96b63';

    if (clickedEl.tagName.toLowerCase() === 'use') {
        // Direct note glyph clicked
        noteEl = clickedEl;
        note = noteEl.source || null;

        // Fallback: search score notations if note.source is not attached
        if (!note && score && score.notations) {
            var elemIdx = noteEl.getAttribute('element-index');
            var srcIdx = noteEl.getAttribute('source-index');
            for (var i = 0; i < score.notations.length; i++) {
                var notat = score.notations[i];
                if (notat.notes) {
                    for (var j = 0; j < notat.notes.length; j++) {
                        var n = notat.notes[j];
                        if ((elemIdx !== null && n.elementIndex == elemIdx) || (srcIdx !== null && n.sourceIndex == srcIdx) || (n.svgNode === noteEl)) {
                            note = n;
                            break;
                        }
                    }
                    if (note) break;
                }
            }
        }

        // Find associated syllable/lyric text
        if (note && note.neume && note.neume.lyrics && note.neume.lyrics.length > 0 && note.neume.lyrics[0].svgNode) {
            lyricEl = note.neume.lyrics[0].svgNode;
        } else {
            var $group = $clicked.closest('g.ChantNotationElement, g[class*="ChantNotation"]');
            if (!$group.length) $group = $clicked.parent().parent();
            var $txt = $group.find('text.lyric, text.dropCap, text.aboveLinesText, text');
            if ($txt.length) {
                lyricEl = $txt[0];
            }
        }
    } else {
        // Text / tspan clicked (syllable or dropCap or aboveLines)
        var $textEl = $clicked.closest('text');
        lyricEl = $textEl[0] || clickedEl;

        // Try resolving note from Lyric object
        var lyricObj = lyricEl.source || null;
        if (lyricObj && lyricObj.notation && lyricObj.notation.notes && lyricObj.notation.notes.length > 0) {
            note = lyricObj.notation.notes[0];
            noteEl = note.svgNode || null;
        }

        if (!noteEl) {
            var $group = $(lyricEl).closest('g.ChantNotationElement, g[class*="ChantNotation"]');
            if (!$group.length) $group = $(lyricEl).parent();
            var $noteEl = $group.find('use[source-index], use.note, use').first();
            if ($noteEl.length) {
                noteEl = $noteEl[0];
                note = noteEl.source || null;
            }
        }

        if (!note && noteEl && score && score.notations) {
            var elemIdx2 = noteEl.getAttribute('element-index');
            var srcIdx2 = noteEl.getAttribute('source-index');
            for (var k = 0; k < score.notations.length; k++) {
                var notat2 = score.notations[k];
                if (notat2.notes) {
                    for (var m = 0; m < notat2.notes.length; m++) {
                        var n2 = notat2.notes[m];
                        if ((elemIdx2 !== null && n2.elementIndex == elemIdx2) || (srcIdx2 !== null && n2.sourceIndex == srcIdx2) || (n2.svgNode === noteEl)) {
                            note = n2;
                            break;
                        }
                    }
                    if (note) break;
                }
            }
        }
    }

    var syncOn = (!window.doYT || window.doYT.syncEnabled !== false);
    if (noteEl && syncOn) {
        noteEl.classList.add('active');
        noteEl.style.setProperty('fill', accentColor, 'important');
        _doActiveNoteEl = noteEl;
    }
    if (lyricEl && syncOn) {
        lyricEl.classList.add('active');
        lyricEl.style.setProperty('fill', accentColor, 'important');
        $(lyricEl).find('tspan').each(function() {
            this.classList.add('active');
            this.style.setProperty('fill', accentColor, 'important');
        });
        _doActiveLyricEl = lyricEl;
    }

    if (note) {
        $card.data('selected-start-note', note);
    } else if (noteEl && score && score.notations) {
        // First click on asterisk/other non-note: try to resolve note from noteEl via next element
        try {
            var svgForNext = $card.find('svg')[0];
            var nextEl = findNextChantElement(svgForNext, e ? e.pageX : (window.pageXOffset + noteEl.getBoundingClientRect().left), e ? e.pageY : (window.pageYOffset + noteEl.getBoundingClientRect().top));
            if (nextEl && nextEl !== noteEl) {
                var nIdx = nextEl.getAttribute('element-index') || nextEl.getAttribute('source-index');
                for (var ii=0; ii<score.notations.length; ii++) {
                    var nn = score.notations[ii];
                    if (nn.notes) for (var jj=0; jj<nn.notes.length; jj++) {
                        var n = nn.notes[jj];
                        if ((nIdx && (n.elementIndex==nIdx || n.sourceIndex==nIdx)) || n.svgNode===nextEl) { note=n; noteEl=nextEl; break; }
                    }
                    if (note) break;
                }
                if (note) $card.data('selected-start-note', note);
            }
        } catch(e9){}
    }
    // Keep manual highlight for 3s when not playing (first click)
    if (!wasPlaying) { _manualHighlightUntil = Date.now() + 3000; }
    // Update player UI to target card and score
    updateDoPlayerUI($card, score, false); // never auto-play on note click

    // If YouTube video is active: seek to note position but do NOT resume playback
    if (isYtActive) {
        if (note && score && score.notations) {
            var info2 = _getChantWeightedInfo(score);
            var allNotesList = info2 ? info2.allNotes : [].concat.apply([], score.notations.map(function(n) { return n.notes || []; })).filter(function(n) { return !n.isAccidental; });
            var noteIndex = allNotesList.indexOf(note);
            if (noteIndex >= 0 && allNotesList.length > 0) {
                // Convert note index → video fraction using repeat-aware sequence with weighted durations
                var seq = _buildChantSequenceWithRepeats(score, allNotesList);
                var seqPos = seq.indexOf(noteIndex);
                if (seqPos < 0) seqPos = 0;
                var fracPos = 0;
                if (info2) {
                    var seqDurs2 = []; var seqTot2 = 0;
                    for (var sd2=0; sd2<seq.length; sd2++) { var dd = info2.noteDurs[seq[sd2]]||1; seqDurs2.push(dd); seqTot2+=dd; var gg = info2.gapAfterNote[seq[sd2]]||0; if(gg) seqTot2+=gg; }
                    var cum2 = 0;
                    for (var sp=0; sp<seqPos; sp++) { cum2 += seqDurs2[sp]; var gg2 = info2.gapAfterNote[seq[sp]]||0; if(gg2) cum2+=gg2; }
                    fracPos = seqTot2 ? cum2/seqTot2 : seqPos/seq.length;
                } else {
                    fracPos = seqPos / seq.length;
                }

                var ytPlayer = window.doYT.activePlayer || window.doYT.players[window.doYT.activeId];
                // Keep lastPercentage for first use when player not ready
                try { window.doYT.lastPercentage = fracPos; } catch(e0){}
                if (ytPlayer && typeof ytPlayer.getDuration === 'function') {
                    var dur = ytPlayer.getDuration() || 0;
                    if (dur > 0) {
                        try { ytPlayer.seekTo(fracPos * dur, true); } catch(e){ }
                        // Always pause after seek — user must press Play
                        try { if (typeof ytPlayer.pauseVideo === 'function') ytPlayer.pauseVideo(); } catch(e2){}
                        setDoPlayerBarState(false);
                        $('#playerProgressFill').css('width', (fracPos * 100) + '%');
                        $('#playerCurrentTime').text(formatChantTime(fracPos * dur));
                        try { updateDoPlayerProgressAndTime(score, note, fracPos); } catch(e3){}
                    } else {
                        // Duration not yet known — fallback to score-based time
                        try { updateDoPlayerProgressAndTime(score, note, fracPos); } catch(e4){}
                        $('#playerProgressFill').css('width', (fracPos * 100) + '%');
                        // Store pending seek for when player becomes ready
                        try { if (!window.doYT.pendingSeeks) window.doYT.pendingSeeks = {}; window.doYT.pendingSeeks[window.doYT.activeId] = fracPos; } catch(e6){}
                    }
                } else {
                    // Player not ready yet — update visual cursor and timestamp from score position
                    try { updateDoPlayerProgressAndTime(score, note, fracPos); } catch(e5){}
                    $('#playerProgressFill').css('width', (fracPos * 100) + '%');
                    try { if (!window.doYT.pendingSeeks) window.doYT.pendingSeeks = {}; window.doYT.pendingSeeks[window.doYT.activeId] = fracPos; } catch(e7){}
                }
            }
        }
        return;
    }

    // Synth mode: update progress bar cursor to clicked note position
    updateDoPlayerProgressAndTime(score, note);
    // Do NOT call playScore here — wait for the user to press Play
}

function switchToChantCard($targetCard, autoPlay) {
    if (!$targetCard || !$targetCard.length) return false;
    var score = $targetCard.data('chant-score');
    if (!score) return false;

    if (window.stopScore) window.stopScore();
    clearActiveNote();
    $('.do-chant-card').removeClass('is-playing');

    _doCurrentPlayerCard = $targetCard;
    _doCurrentScore = score;
    $targetCard.removeData('selected-start-note');

    updateDoPlayerUI($targetCard, score, !!autoPlay);
    updateDoPlayerProgressAndTime(score, null, 0);

    try {
        var cardEl = $targetCard[0];
        var rect = cardEl.getBoundingClientRect();
        if (rect.top < 70 || rect.bottom > window.innerHeight - 100) {
            cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    } catch(e) {}

    if (autoPlay) {
        if (window.Tone) {
            if (typeof Tone.start === 'function') Tone.start().catch(function(){});
            if (Tone.context && Tone.context.state !== 'running') Tone.context.resume().catch(function(){});
        }
        if (window.playScore) {
            window.playScore(score, score.defaultStartPitch, null);
            setDoPlayerBarState(true);
        }
    }
    return true;
}

function switchToNextChantCard(autoPlay) {
    var $allCards = $('.do-chant-card:visible');
    if (!$allCards.length) return false;
    if (!_doCurrentPlayerCard) {
        return switchToChantCard($allCards.first(), autoPlay);
    }
    var idx = $allCards.index(_doCurrentPlayerCard);
    if (idx >= 0 && idx + 1 < $allCards.length) {
        return switchToChantCard($allCards.eq(idx + 1), autoPlay);
    }
    return false;
}

function switchToPrevChantCard(autoPlay) {
    var $allCards = $('.do-chant-card:visible');
    if (!$allCards.length) return false;
    if (!_doCurrentPlayerCard) {
        return switchToChantCard($allCards.first(), autoPlay);
    }
    var idx = $allCards.index(_doCurrentPlayerCard);
    if (idx > 0) {
        return switchToChantCard($allCards.eq(idx - 1), autoPlay);
    }
    return false;
}

window.switchToChantCard = switchToChantCard;
window.switchToNextChantCard = switchToNextChantCard;
window.switchToPrevChantCard = switchToPrevChantCard;

function closeDoPlayer() {
    if (window.doYT && typeof window.doYT.pauseAll === 'function') {
        window.doYT.pauseAll();
    }
    if (window.stopScore) {
        window.stopScore();
    }
    setDoPlayerBarState(false);
    if (_doProgressInterval) clearInterval(_doProgressInterval);
    $('#playerProgressFill').css('width', '0%');
    $('#playerCurrentTime').text('0:00');
    $('#playerChantTime').text('0:00');

    // Animate the player bar down and hide it completely
    var playerBar = document.getElementById('modernPlayerBar');
    if (playerBar) {
        playerBar.classList.remove('visible');
        playerBar.style.transform = 'translateY(100%)';
        playerBar.style.opacity = '0';
        playerBar.style.pointerEvents = 'none';
        setTimeout(function() {
            if (!playerBar.classList.contains('visible')) {
                playerBar.style.visibility = 'hidden';
            }
        }, 300);
    }
    $('body').removeClass('player-dock-open');
    document.documentElement.style.setProperty('--player-drag-y', '0px');
    document.documentElement.style.setProperty('--player-bar-offset', '0px');

    if (_doCurrentPlayerCard) {
        _doCurrentPlayerCard.removeClass('is-playing');
        _doCurrentPlayerCard.removeData('selected-start-note');
        var svg = _doCurrentPlayerCard.find('svg')[0];
        if (svg) $(svg).find('use.active, text.active, tspan.active').removeClass('active porrectus-left porrectus-right');
    }
    _doCurrentPlayerCard = null;
    _doCurrentScore = null;
    _progressBarInitialPeekDone = false;
}

function initDoPlayer() {
    // Restart from beginning button
    $('#playerBtnRestart').off('click').on('click', function(e) {
        e.stopPropagation();
        triggerHapticFeedback('medium');
        if (window.doYT && window.doYT.activeId && window.doYT.activeId !== 'synth') {
            var player = window.doYT.activePlayer || window.doYT.players[window.doYT.activeId];
            if (player && typeof player.seekTo === 'function') {
                player.seekTo(0, true);
                player.playVideo();
                setDoPlayerBarState(true);
                $('#playerProgressFill').css('width', '0%');
                highlightChantNoteAtFraction(0);
                return;
            }
        }
        if (!_doCurrentScore) return;
        if (window.stopScore) window.stopScore();
        if (_doCurrentPlayerCard) {
            _doCurrentPlayerCard.removeData('selected-start-note');
            var svg = _doCurrentPlayerCard.find('svg')[0];
            if (svg) $(svg).find('use.active, text.active, tspan.active').removeClass('active porrectus-left porrectus-right');
        }
        if (window.clearActiveNote) window.clearActiveNote();
        $('#playerProgressFill').css('width', '0%');
        updateDoPlayerProgressAndTime(_doCurrentScore, null, 0);

        if (window.Tone) {
            if (typeof Tone.start === 'function') Tone.start().catch(function(){});
            if (Tone.context && Tone.context.state !== 'running') Tone.context.resume().catch(function(){});
        }
        if (window.playScore) {
            window.playScore(_doCurrentScore, _doCurrentScore.defaultStartPitch, null);
            setDoPlayerBarState(true);
        }
    });

    // Play/Pause button
    $('#playerBtnPlay').off('click').on('click', function(e) {
        e.stopPropagation();
        triggerHapticFeedback('toggle');
        if (window.doYT && window.doYT.activeId && window.doYT.activeId !== 'synth') {
            var activeId = window.doYT.activeId;
            var player = window.doYT.activePlayer || window.doYT.players[activeId];
            var isReady = window.doYT.readyPlayers && window.doYT.readyPlayers[activeId];
            var isYtPlaying = $('#playerBtnPlay').hasClass('playing');

            if (isYtPlaying) {
                if (player && typeof player.pauseVideo === 'function') player.pauseVideo();
                setDoPlayerBarState(false);
            } else {
                if (player && isReady && typeof player.playVideo === 'function') {
                    player.playVideo();
                    setDoPlayerBarState(true);
                    _userIsScrolling = false;
                    if (_userScrollTimer) { clearTimeout(_userScrollTimer); _userScrollTimer = null; }
                    setTimeout(function() { centerActiveNote(false); }, 120);
                } else {
                    // Player not yet loaded — create the iframe and play on ready
                    var $activeItem = $('#playerVideoList .do-yt-item.is-active');
                    var videoId = $activeItem.data('video-id');
                    if (activeId && videoId && window.doYT.ensureIframeAndPlayer) {
                        var curSpeedText = $('#playerSpeedCycleBtn').find('.do-speed-label').text() || '1.0';
                        var curSpeed = parseFloat(curSpeedText) || 1.0;
                        if (!window.doYT.pendingPlays) window.doYT.pendingPlays = {};
                        window.doYT.pendingPlays[activeId] = true;
                        window.doYT.ensureIframeAndPlayer(activeId, videoId, $activeItem, curSpeed);
                        _userIsScrolling = false;
                        if (_userScrollTimer) { clearTimeout(_userScrollTimer); _userScrollTimer = null; }
                        setTimeout(function() { centerActiveNote(false); }, 300);
                    }
                }
            }
            return;
        }
        if (window.Tone) {
            if (typeof Tone.start === 'function') Tone.start().catch(function(){});
            if (Tone.context && Tone.context.state !== 'running') Tone.context.resume().catch(function(){});
        }
        if (window.isPlayingChant && window.isPlayingChant()) {
            // Currently playing → pause/resume
            if (window.playPauseScore) {
                var resumed = window.playPauseScore();
                setDoPlayerBarState(resumed);
                if (resumed) {
                    _userIsScrolling = false;
                    if (_userScrollTimer) { clearTimeout(_userScrollTimer); _userScrollTimer = null; }
                    setTimeout(function() { centerActiveNote(false); }, 100);
                }
                if (resumed && window.doYT && typeof window.doYT.pauseAll === 'function') {
                    window.doYT.pauseAll();
                }
            } else if (window.stopScore) {
                window.stopScore();
                setDoPlayerBarState(false);
            }
        } else if (_doCurrentScore && window.playScore) {
            if (window.doYT && typeof window.doYT.pauseAll === 'function') {
                window.doYT.pauseAll();
            }
            // Start from selected note (if user clicked a note) or from beginning
            var startNote = _doCurrentPlayerCard ? _doCurrentPlayerCard.data('selected-start-note') : null;
            window.playScore(_doCurrentScore, _doCurrentScore.defaultStartPitch, startNote);
            setDoPlayerBarState(true);
            // Scroll immediately on play start (even if note still visible) — force to visible center
            _userIsScrolling = false;
            if (_userScrollTimer) { clearTimeout(_userScrollTimer); _userScrollTimer = null; }
            setTimeout(function() { centerActiveNote(true); }, 120);
        }
    });

    // Close and stop player buttons
    $('#playerBtnClose, #playerBtnStop').off('click').on('click', function(e) {
        e.stopPropagation();
        triggerHapticFeedback('light');
        closeDoPlayer();
    });

    // Next note button (step forward)
    $('#playerBtnNext').off('click').on('click', function(e) {
        e.stopPropagation();
        triggerHapticFeedback('step');
        if (window.stepForward) {
            window.stepForward();
        }
    });

    // Pitch drawer toggle (button → open/close in-player drawer)
    $(document).off('click.dopitchpill', '#playerPitchPill').on('click.dopitchpill', '#playerPitchPill', function(e) {
        e.stopPropagation();
        if ($(this).hasClass('is-disabled')) return;
        if ($('#playerPitchDrawer').is(':visible')) {
            closeDoPitchBubble();
        } else {
            openDoPitchBubble();
        }
    });

    // Pitch chip selection in drawer
    $(document).off('click.dopitchchip', '.do-pitch-chip').on('click.dopitchchip', '.do-pitch-chip', function(e) {
        e.stopPropagation();
        triggerHapticFeedback('selection');
        var val = parseInt($(this).data('pitch-val'), 10);
        if (isNaN(val) || !_doCurrentScore || !window.exsurge) return;
        _doCurrentScore.defaultStartPitch = new exsurge.Pitch(val);
        updateDoPitchUI(_doCurrentScore);
        // Keep drawer open after selection so user can compare
    });

    // Reset pitch to natural default
    $(document).off('click.doresetpitch', '#btnResetPitch').on('click.doresetpitch', '#btnResetPitch', function(e) {
        e.stopPropagation();
        triggerHapticFeedback('selection');
        if (!_doCurrentScore || _doCurrentScore._naturalStartPitch == null || !window.exsurge) return;
        _doCurrentScore.defaultStartPitch = new exsurge.Pitch(_doCurrentScore._naturalStartPitch);
        updateDoPitchUI(_doCurrentScore);
    });

    // Solesmes Salicus Lengthening toggle
    $('#playerBtnSolesmes').off('click').on('click', function(e) {
        e.stopPropagation();
        triggerHapticFeedback('toggle');
        if (window.getIsUsingSolesmesLengths && window.setIsUsingSolesmesLengths) {
            var next = !window.getIsUsingSolesmesLengths();
            window.setIsUsingSolesmesLengths(next);
            $(this).toggleClass('active', next);
        }
    });

    // Speed cycle button (1.0x -> 1.25x -> 1.5x -> 2.0x -> 0.5x -> 0.75x) - BPM en dur (ne pas calculer depuis tempo courant)
    var SPEED_CYCLE = [1.0, 1.25, 1.5, 2.0, 0.5, 0.75];
    var BASE_TEMPO = 165;
    var SPEED_BPM = { "0.5": 83, "0.75": 124, "1": 165, "1.0": 165, "1.25": 206, "1.5": 248, "2": 330, "2.0": 330 };
    $('#playerSpeedCycleBtn').off('click').on('click', function(e) {
        e.stopPropagation();
        triggerHapticFeedback('selection');
        var curSpeedText = $(this).find('.do-speed-label').text() || '1.0';
        var curSpeed = parseFloat(curSpeedText) || 1.0;
        // tolerant index lookup (floating point)
        var curIdx = -1;
        for (var si = 0; si < SPEED_CYCLE.length; si++) { if (Math.abs(SPEED_CYCLE[si] - curSpeed) < 0.001) { curIdx = si; break; } }
        var nextIdx = (curIdx + 1) % SPEED_CYCLE.length;
        if (curIdx === -1) nextIdx = 0; // fallback to 1.0x
        var nextSpeed = SPEED_CYCLE[nextIdx];
        $(this).find('.do-speed-label').text(nextSpeed.toFixed(nextSpeed % 1 === 0 ? 1 : 2) + '\u00D7');
        $(this).toggleClass('active', nextSpeed !== 1.0);
        
        var key = String(nextSpeed % 1 === 0 ? nextSpeed.toFixed(1) : nextSpeed.toFixed(2));
        // BPM en dur, pas BASE*nextSpeed depuis tempo courant (qui n'est pas 1×)
        var calculatedTempo = SPEED_BPM[key] || Math.round(BASE_TEMPO * nextSpeed);
        if ($('#playerTempoValue').length) $('#playerTempoValue').text(calculatedTempo);
        // Preserve musical position before tempo change
        var savedFraction = 0;
        try { savedFraction = window.getChantProgress ? window.getChantProgress() : 0; } catch(e0) { savedFraction = 0; }
        if (typeof savedFraction !== 'number' || isNaN(savedFraction)) savedFraction = 0;
        savedFraction = Math.max(0, Math.min(1, savedFraction));
        // Update synth tempo WITHOUT the '+16n' jump (direct bpm change keeps cursor)
        try {
            localStorage.setItem('do_tempo', String(calculatedTempo));
            if (window.Tone && window.Tone.Transport && window.Tone.Transport.bpm) window.Tone.Transport.bpm.value = calculatedTempo;
            // Do NOT call window.setTempo which does clear+schedule '+16n' and moves cursor
            // If playing, reschedule next note with new tempo to avoid one-note lag
            if (window.Tone && window.Tone.Transport && window.Tone.Transport.state === 'started' && window._chantNotes && window._getChantNoteId && window._getNoteDuration && window.timeoutNextNote !== undefined) {
                try {
                    var nid = window._getChantNoteId();
                    var curDur = 1;
                    try { curDur = window._getNoteDuration(window._chantNotes, Math.max(0, nid-1)); } catch(ee) { curDur = 1; }
                    // Clear old schedule and reschedule with new tempo's 4n * curDur
                    // Keep musical position: next note still at same fraction, just faster/slower
                    window.Tone.Transport.clear(window.timeoutNextNote);
                    window.timeoutNextNote = window.Tone.Transport.scheduleOnce(window.playNextNote, '+' + (new window.Tone.Time("4n").toSeconds() * curDur));
                } catch(e9) {}
            }
        } catch(e2) {}
        // Persist speed for YT iframe creation
        try { localStorage.setItem('do_last_speed', String(nextSpeed)); } catch(e4) {}

        if (window.doYT && window.doYT.activeId && window.doYT.activeId !== 'synth') {
            var player = window.doYT.activePlayer || window.doYT.players[window.doYT.activeId];
            if (player && typeof player.setPlaybackRate === 'function') {
                try { player.setPlaybackRate(nextSpeed); } catch(e) {}
            }
            // Keep YT highlight at same fraction
            try { highlightChantNoteAtFraction(savedFraction); } catch(e6) {}
            try { if (_doCurrentScore) updateDoPlayerProgressAndTime(_doCurrentScore, null, savedFraction); } catch(e7) {}
        } else {
            // Synth: keep highlight/progress at same fraction
            try { if (_doCurrentScore) updateDoPlayerProgressAndTime(_doCurrentScore, null, savedFraction); } catch(e5) {}
            try { highlightChantNoteAtFraction(savedFraction); } catch(e8) {}
        }
    });
    // Sync initial label avec vitesse stockée en dur (pas do_tempo/BASE qui n'est pas 1×)
    (function syncSpeedLabel(){
        try {
            var storedSpeed = parseFloat(localStorage.getItem('do_last_speed'));
            var hasSpeed = !isNaN(storedSpeed);
            var best = 1.0;
            if (hasSpeed) {
                // valide et trouve closest dans cycle
                var bestDiff = Infinity;
                for (var bi=0; bi<SPEED_CYCLE.length; bi++) { var d=Math.abs(SPEED_CYCLE[bi]-storedSpeed); if(d<bestDiff){bestDiff=d; best=SPEED_CYCLE[bi];}}
                $('#playerSpeedCycleBtn').find('.do-speed-label').text(best.toFixed(best % 1 === 0 ? 1 : 2) + '\u00D7');
                $('#playerSpeedCycleBtn').toggleClass('active', best !== 1.0);
                // Assure do_tempo en dur cohérent avec vitesse
                var k = String(best % 1 === 0 ? best.toFixed(1) : best.toFixed(2));
                var bpm = SPEED_BPM[k];
                if (bpm) {
                    try { localStorage.setItem('do_tempo', String(bpm)); if (window.Tone && window.Tone.Transport && window.Tone.Transport.bpm) window.Tone.Transport.bpm.value = bpm; } catch(ee){}
                }
            }
        } catch(e6){}
    })();

    function syncPlayerBarOffset() {
        var playerBar = document.getElementById('modernPlayerBar');
        if (!playerBar) return;
        var mb = Math.abs(parseInt(window.getComputedStyle(playerBar).marginBottom, 10)) || 0;
        var visibleH = playerBar.offsetHeight - mb;
        if (visibleH > 50 && visibleH < 800) {
            document.documentElement.style.setProperty('--player-bar-offset', visibleH + 'px');
        }
    }
    window.syncPlayerBarOffset = syncPlayerBarOffset;
    window.addEventListener('resize', syncPlayerBarOffset);

    // Swipe down to dismiss grab handle / player bar gesture (progressive like sidebar drawer)
    (function initSwipeToClose() {
        var playerBar = document.getElementById('modernPlayerBar');
        if (!playerBar) return;
        var startY = 0, currentY = 0, startTime = 0, isDragging = false;

        function onTouchStart(e) {
            if (!e.touches || e.touches.length !== 1) return;
            // Only start if touching the grab handle area, the player bar background or title
            var target = e.target;
            if (!$(target).closest('#playerDragHandleWrap, #playerDragHandle, .do-player-top-row, .do-player-name-wrapper, .do-player-part-badge').length &&
                target !== playerBar) {
                return;
            }
            startY = e.touches[0].clientY;
            currentY = startY;
            startTime = Date.now();
            isDragging = true;
            $('body').addClass('is-dragging-player');
            playerBar.style.setProperty('transition', 'none', 'important');
            document.documentElement.style.setProperty('--player-drag-y', '0px');
        }

        function onTouchMove(e) {
            if (!isDragging || !e.touches || !e.touches.length) return;
            currentY = e.touches[0].clientY;
            var deltaY = currentY - startY;

            if (deltaY > 0) {
                if (e.cancelable) e.preventDefault();
                // Direct 1:1 progressive follow-through
                var barH = playerBar.offsetHeight || 140;
                var progress = Math.min(1, Math.max(0, deltaY / barH));
                var opacity = 1 - (progress * 0.7);
                playerBar.style.setProperty('transform', 'translateY(' + deltaY + 'px)', 'important');
                playerBar.style.setProperty('opacity', opacity.toFixed(3), 'important');
                document.documentElement.style.setProperty('--player-drag-y', deltaY + 'px');
            } else {
                // Elastic resistance if dragged upwards
                var resistanceY = deltaY * 0.25;
                playerBar.style.setProperty('transform', 'translateY(' + resistanceY + 'px)', 'important');
                document.documentElement.style.setProperty('--player-drag-y', resistanceY + 'px');
            }
        }

        function onTouchEnd(e) {
            if (!isDragging) return;
            isDragging = false;
            $('body').removeClass('is-dragging-player');

            var touchEndY = (e.changedTouches && e.changedTouches.length) ? e.changedTouches[0].clientY : currentY;
            var deltaY = touchEndY - startY;
            var dt = Math.max(1, Date.now() - startTime);
            var vy = deltaY / dt; // velocity in px/ms
            var barH = playerBar.offsetHeight || 140;

            playerBar.style.removeProperty('transition');

            var isTap = (Math.abs(deltaY) < 6 && dt < 300);
            var isHandleTap = isTap && $(e.target).closest('#playerDragHandleWrap, #playerDragHandle').length > 0;

            // Upward drag beyond threshold → auto-press Videos button (open sources)
            var THRESH_UP = 48;
            var THRESH_DOWN_CLOSE = 32;
            if (deltaY < -THRESH_UP && !isTap) {
                var $videoBtn = $('#playerBtnExpandVideos');
                var $videoDrawer = $('#playerVideoDrawer');
                if ($videoDrawer.is(':hidden') && $videoBtn.is(':visible')) {
                    triggerHapticFeedback('light');
                    $videoBtn.trigger('click');
                    playerBar.style.setProperty('transition', 'transform 0.20s cubic-bezier(0.2, 1, 0.3, 1), opacity 0.20s ease', 'important');
                    playerBar.style.setProperty('transform', 'translateY(0)', 'important');
                    playerBar.style.setProperty('opacity', '1', 'important');
                    document.documentElement.style.setProperty('--player-drag-y', '0px');
                    setTimeout(function() {
                        playerBar.style.removeProperty('transition');
                        playerBar.style.removeProperty('transform');
                        playerBar.style.removeProperty('opacity');
                    }, 200);
                    return;
                }
            }
            // Downward drag when sources open → close sources instead of dismissing player
            if (deltaY > THRESH_DOWN_CLOSE && !isTap) {
                var $drawerOpen = $('#playerVideoDrawer');
                var $pitchOpen = $('#playerPitchDrawer');
                if ($drawerOpen.is(':visible') || $pitchOpen.is(':visible')) {
                    triggerHapticFeedback('light');
                    if ($drawerOpen.is(':visible')) $('#playerBtnExpandVideos').trigger('click');
                    else if ($pitchOpen.is(':visible')) closeDoPitchBubble();
                    playerBar.style.setProperty('transition', 'transform 0.20s cubic-bezier(0.2, 1, 0.3, 1), opacity 0.20s ease', 'important');
                    playerBar.style.setProperty('transform', 'translateY(0)', 'important');
                    playerBar.style.setProperty('opacity', '1', 'important');
                    document.documentElement.style.setProperty('--player-drag-y', '0px');
                    setTimeout(function() {
                        playerBar.style.removeProperty('transition');
                        playerBar.style.removeProperty('transform');
                        playerBar.style.removeProperty('opacity');
                    }, 200);
                    return;
                }
            }

            // Dismiss if pulled down > 15% of player height (approx 20-25px) OR flick down (vy > 0.25) OR simply tapped the grab handle
            if (deltaY > barH * 0.15 || deltaY > 20 || (deltaY > 10 && vy > 0.25) || isHandleTap) {
                triggerHapticFeedback('light');
                playerBar.style.setProperty('transition', 'transform 0.22s cubic-bezier(0.2, 0.9, 0.3, 1), opacity 0.18s ease', 'important');
                playerBar.style.setProperty('transform', 'translateY(100%)', 'important');
                playerBar.style.setProperty('opacity', '0', 'important');
                document.documentElement.style.setProperty('--player-drag-y', (playerBar.offsetHeight || 140) + 'px');
                setTimeout(function() {
                    playerBar.style.removeProperty('transition');
                    playerBar.style.removeProperty('transform');
                    playerBar.style.removeProperty('opacity');
                    document.documentElement.style.setProperty('--player-drag-y', '0px');
                    closeDoPlayer();
                }, 220);
            } else {
                // Smooth snap back to natural position
                playerBar.style.setProperty('transition', 'transform 0.20s cubic-bezier(0.2, 1, 0.3, 1), opacity 0.20s ease', 'important');
                playerBar.style.setProperty('transform', 'translateY(0)', 'important');
                playerBar.style.setProperty('opacity', '1', 'important');
                document.documentElement.style.setProperty('--player-drag-y', '0px');
                setTimeout(function() {
                    playerBar.style.removeProperty('transition');
                    playerBar.style.removeProperty('transform');
                    playerBar.style.removeProperty('opacity');
                }, 200);
            }
        }

        // Mouse dragging support on desktop
        function onMouseDown(e) {
            if (e.button !== 0) return;
            var target = e.target;
            if (!$(target).closest('#playerDragHandleWrap, #playerDragHandle, .do-player-top-row').length && target !== playerBar) {
                return;
            }
            if ($(target).closest('button, input, select, a, .do-player-progress-section').length) return;

            startY = e.clientY;
            currentY = startY;
            startTime = Date.now();
            isDragging = true;
            $('body').addClass('is-dragging-player');
            playerBar.style.setProperty('transition', 'none', 'important');
            document.documentElement.style.setProperty('--player-drag-y', '0px');

            function onMouseMove(e) {
                if (!isDragging) return;
                currentY = e.clientY;
                var deltaY = currentY - startY;
                if (deltaY > 0) {
                    e.preventDefault();
                    var barH = playerBar.offsetHeight || 140;
                    var progress = Math.min(1, Math.max(0, deltaY / barH));
                    var opacity = 1 - (progress * 0.7);
                    playerBar.style.setProperty('transform', 'translateY(' + deltaY + 'px)', 'important');
                    playerBar.style.setProperty('opacity', opacity.toFixed(3), 'important');
                    document.documentElement.style.setProperty('--player-drag-y', deltaY + 'px');
                } else {
                    var resistanceY = deltaY * 0.25;
                    playerBar.style.setProperty('transform', 'translateY(' + resistanceY + 'px)', 'important');
                    document.documentElement.style.setProperty('--player-drag-y', resistanceY + 'px');
                }
            }

            function onMouseUp(e) {
                if (!isDragging) return;
                window.removeEventListener('mousemove', onMouseMove);
                window.removeEventListener('mouseup', onMouseUp);
                onTouchEnd({ changedTouches: [{ clientY: e.clientY }] });
            }

            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
        }

        playerBar.addEventListener('touchstart', onTouchStart, { passive: true });
        window.addEventListener('touchmove', onTouchMove, { passive: false });
        window.addEventListener('touchend', onTouchEnd, { passive: true });
        window.addEventListener('touchcancel', onTouchEnd, { passive: true });
        playerBar.addEventListener('mousedown', onMouseDown);
    })();

    // Progress bar click & drag scrubbing without forcing play
    function seekToTimelinePercent(percent) {
        percent = Math.max(0, Math.min(1, percent));
        var isYtActive = (window.doYT && window.doYT.activeId && window.doYT.activeId !== 'synth');
        var wasPlaying = (window.isPlayingChant && window.isPlayingChant()) || (isYtActive && $('#playerBtnPlay').hasClass('playing'));

        if (isYtActive) {
            var player = window.doYT.activePlayer || window.doYT.players[window.doYT.activeId];
            if (player && typeof player.getDuration === 'function') {
                var dur = player.getDuration() || (window.doYT.durations && window.doYT.durations[window.doYT.activeId]) || 0;
                if (dur > 0) {
                    player.seekTo(percent * dur, true);
                    if (wasPlaying && typeof player.playVideo === 'function') {
                        player.playVideo();
                        setDoPlayerBarState(true);
                    } else if (typeof player.pauseVideo === 'function') {
                        player.pauseVideo();
                        setDoPlayerBarState(false);
                    }
                    $('#playerProgressFill').css('width', (percent * 100) + '%');
                    $('#playerCurrentTime').text(formatChantTime(percent * dur));
                    highlightChantNoteAtFraction(percent);
                    return;
                }
            }
        }

        if (!_doCurrentPlayerCard || !_doCurrentScore) return;

        var allNotes = [].concat.apply([], (_doCurrentScore.notations || []).map(function(n) { return n.notes || []; }));
        if (!allNotes.length) return;
        var targetIdx = Math.floor(percent * (allNotes.length - 1));
        var note = allNotes[targetIdx];

        var svg = _doCurrentPlayerCard.find('svg')[0];
        var targetNode = (note && note.svgNode) || null;
        if (!targetNode && svg && note) {
            var elemIdx = note.elementIndex;
            if (elemIdx !== undefined) {
                targetNode = $(svg).find('use[element-index="' + elemIdx + '"]')[0];
            }
            if (!targetNode && note.sourceIndex !== undefined) {
                targetNode = $(svg).find('use[source-index="' + note.sourceIndex + '"]')[0];
            }
        }

        if (note && targetNode) {
            handleChantElementClick(targetNode, null);
        } else {
            $('#playerProgressFill').css('width', (percent * 100) + '%');
            updateDoPlayerProgressAndTime(_doCurrentScore, note, percent);
            highlightChantNoteAtFraction(percent);
        }
    }

    var $track = $('#playerProgressBarContainer');
    var isScrubbing = false;

    function getPercentFromEvent(e) {
        var rect = $track[0].getBoundingClientRect();
        var clientX = (e.touches && e.touches.length) ? e.touches[0].clientX : (e.clientX !== undefined ? e.clientX : (e.originalEvent && e.originalEvent.clientX));
        return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    }

    $track.off('click mousedown touchstart').on('click', function(e) {
        e.stopPropagation();
        triggerHapticFeedback('subtle');
        var pct = getPercentFromEvent(e);
        seekToTimelinePercent(pct);
    }).on('mousedown touchstart', function(e) {
        isScrubbing = true;

        function onMove(me) {
            if (!isScrubbing) return;
            var movePct = getPercentFromEvent(me);
            seekToTimelinePercent(movePct);
        }

        function onEnd() {
            isScrubbing = false;
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onEnd);
            window.removeEventListener('touchmove', onMove);
            window.removeEventListener('touchend', onEnd);
        }

        window.addEventListener('mousemove', onMove, { passive: true });
        window.addEventListener('mouseup', onEnd, { passive: true });
        window.addEventListener('touchmove', onMove, { passive: true });
        window.addEventListener('touchend', onEnd, { passive: true });
    });

    // Delegated note + syllable click on content stream
    var NOTE_SEL = '.do-chant-card svg use[source-index], .do-chant-card svg text[source-index], .do-chant-card svg text.lyric, .do-chant-card svg text.lyric tspan, .do-chant-card svg text.dropCap, .do-chant-card svg text.dropCap tspan, .do-chant-card svg text.aboveLinesText, .do-chant-card svg text.aboveLinesText tspan';
    $('#do-content-stream').off('click', NOTE_SEL).on('click', NOTE_SEL, function(e) {
        triggerHapticFeedback('note');
        handleChantElementClick(this, e);
    });

    // Delegated click on chant cards / previews (clicks near notes/syllables or anywhere on card)
    $('#do-content-stream').off('click', '.do-chant-card, .do-chant-preview, .do-chant-preview svg').on('click', '.do-chant-card, .do-chant-preview, .do-chant-preview svg', function(e) {
        if ($(e.target).closest('use[source-index], text[source-index], text.lyric, text.dropCap, text.aboveLinesText').length) return;
        var $card = $(this).closest('.do-chant-card');
        if (!$card.length) return;

        var svg = $card.find('svg')[0];
        if (svg) {
            // For asterisk or any non-syllable/note element, go to the next element in reading order
            var txt = (e.target.textContent || '').trim();
            var isSpecial = /^[*†‡]+$/.test(txt) || $(e.target).is('text,tspan') && txt.length <= 2;
            var nearest = isSpecial ? findNextChantElement(svg, e.pageX, e.pageY) : findNextChantElement(svg, e.pageX, e.pageY);
            if (nearest) {
                triggerHapticFeedback('note');
                handleChantElementClick(nearest, e);
                return;
            }
        }
        triggerHapticFeedback('light');
        switchToChantCard($card, false);
    });

    // Keyboard shortcuts: Escape to close, Space for Play/Pause, PageUp/PageDown or Alt+Arrows for Partition switching
    $(document).off('keydown.doplayer').on('keydown.doplayer', function(e) {
        if ($(e.target).is('input, select, textarea, [contenteditable="true"]')) return;
        var playerBar = document.getElementById('modernPlayerBar');
        if (!playerBar || !playerBar.classList.contains('visible')) return;

        if (e.key === 'Escape') {
            e.preventDefault();
            closeDoPlayer();
        } else if (e.key === ' ' || e.code === 'Space') {
            e.preventDefault();
            $('#playerBtnPlay').trigger('click');
        } else if (e.key === 'PageDown' || (e.altKey && e.key === 'ArrowRight') || (e.ctrlKey && e.key === 'ArrowRight')) {
            e.preventDefault();
            switchToNextChantCard(window.isPlayingChant && window.isPlayingChant());
        } else if (e.key === 'PageUp' || (e.altKey && e.key === 'ArrowLeft') || (e.ctrlKey && e.key === 'ArrowLeft')) {
            e.preventDefault();
            switchToPrevChantCard(window.isPlayingChant && window.isPlayingChant());
        }
    });

    // Click on Chant Title or Badge to center view on active note / score
    $(document).off('click.docenter', '#playerChantName, .do-player-name-wrapper, #playerChantPart, .do-player-info-col')
        .on('click.docenter', '#playerChantName, .do-player-name-wrapper, #playerChantPart, .do-player-info-col', function(e) {
            e.preventDefault();
            _userIsScrolling = false;
            if (_userScrollTimer) clearTimeout(_userScrollTimer);
            centerActiveNote(true);
        });

    initUserScrollTracker();

    $(window).off('resize.domarquee').on('resize.domarquee', function() {
        if (_doCurrentPlayerCard) checkTitleMarquee();
    });
}

var _userIsScrolling = false;
var _userScrollTimer = null;
var _isAutoScrolling = false;

function _getViewportOffsets() {
    // Visible viewport = window minus header / notification banners (top) and player dock (bottom)
    // Use getBoundingClientRect to get actual on-screen obstruction, fixing the 400px padding/margin hack of the player bar.
    var topH = 0;
    try {
        var candidates = [];
        var headerEl = document.querySelector('.do-top-header');
        if (headerEl) candidates.push(headerEl);
        var bannerEls = document.querySelectorAll('#appUpdateBanner, #appRemoteNotificationBanner, #appInstallBanner, .do-update-banner, .do-remote-notif-banner, .do-install-banner');
        for (var i = 0; i < bannerEls.length; i++) candidates.push(bannerEls[i]);
        var maxBottom = 0;
        for (var j = 0; j < candidates.length; j++) {
            var el = candidates[j];
            if (!el || !el.getBoundingClientRect) continue;
            var cs = window.getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden') continue;
            // .is-visible gate for banners; header has no gate
            var isBanner = el.id === 'appUpdateBanner' || el.id === 'appRemoteNotificationBanner' || el.id === 'appInstallBanner' || el.classList.contains('do-update-banner');
            if (isBanner && !el.classList.contains('is-visible')) {
                // also accept jQuery :visible fallback via offsetHeight
                if (!el.offsetHeight || el.offsetHeight < 4) continue;
                // if banner not marked is-visible but still has height, treat as hidden
                if (el.getBoundingClientRect().height < 4) continue;
            }
            if (el.offsetHeight < 4 && el.getBoundingClientRect().height < 4) continue;
            var rect = el.getBoundingClientRect();
            // Only consider elements anchored at top of viewport (top <= 80)
            if (rect.top > 80) continue;
            if (rect.bottom > maxBottom) maxBottom = rect.bottom;
        }
        if (maxBottom > 0) topH = Math.ceil(maxBottom);
    } catch(e) {}
    if (!topH) {
        var h = document.querySelector('.do-top-header');
        topH = h ? (h.offsetHeight || 56) : 56;
        // include safe-area if header bottom not yet measured (fallback)
        if (topH < 48) topH = 56;
    }

    var bottomH = 0;
    try {
        var playerBar = document.getElementById('modernPlayerBar');
        if (playerBar && playerBar.classList.contains('visible')) {
            var cs2 = window.getComputedStyle(playerBar);
            if (cs2.display !== 'none' && cs2.visibility !== 'hidden') {
                var rect2 = playerBar.getBoundingClientRect();
                // Player bar uses padding-bottom 400px + margin-bottom -400px hack; visible height = offsetHeight - |marginBottom|
                var mb = Math.abs(parseInt(cs2.marginBottom, 10)) || 0;
                var visibleH = (playerBar.offsetHeight || rect2.height || 0) - mb;
                // Also clamp via rect top: innerHeight - rect.top is inflated by 400, so use visibleH
                if (visibleH < 20) visibleH = Math.max(0, window.innerHeight - rect2.top - mb);
                if (visibleH > 0 && visibleH < 900) bottomH = Math.ceil(visibleH);
                else bottomH = Math.ceil(visibleH);
            }
        }
    } catch(e2) {}
    return { top: topH, bottom: bottomH };
}

function _getElemRect(el) {
    // SVG <use> elements often return zero-size rects; climb to nearest svg or card
    var rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
        var svgEl = el.ownerSVGElement || el.closest('svg');
        if (svgEl) rect = svgEl.getBoundingClientRect();
    }
    if (rect.width === 0 && rect.height === 0) {
        var card = el.closest ? el.closest('.do-chant-card, .do-score-wrap') : null;
        if (card) rect = card.getBoundingClientRect();
    }
    return rect;
}

function isElementInVisibleViewport(el) {
    if (!el) return false;
    var rect = _getElemRect(el);
    var off = _getViewportOffsets();
    var margin = 12; // small safety margin inside visible area
    return (
        rect.top >= (off.top + margin) &&
        rect.bottom <= (window.innerHeight - off.bottom - margin) &&
        rect.left >= 0 &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
}

function centerActiveNote(force) {
    var activeElem = document.querySelector('svg use.active, svg .active');
    if (!activeElem && _doCurrentPlayerCard && _doCurrentPlayerCard.length) {
        activeElem = _doCurrentPlayerCard[0];
    }
    if (!activeElem) return;

    if (!force && isElementInVisibleViewport(activeElem)) {
        return;
    }

    try {
        var noteRect = activeElem.getBoundingClientRect();
        if (noteRect.width === 0 && noteRect.height === 0) {
            var svgEl = activeElem.ownerSVGElement;
            if (svgEl) {
                var svgRect = svgEl.getBoundingClientRect();
                var ex = parseFloat(activeElem.getAttribute('x') || 0);
                var ey = parseFloat(activeElem.getAttribute('y') || 0);
                if (svgEl.viewBox && svgEl.viewBox.baseVal.width) {
                    var scaleY = svgRect.height / svgEl.viewBox.baseVal.height;
                    noteRect = { top: svgRect.top + ey * scaleY, height: 14 };
                } else {
                    noteRect = svgRect;
                }
            }
        }
        if (!noteRect.height && noteRect.height !== 0) {
            noteRect = _getElemRect(activeElem);
        }

        var off = _getViewportOffsets();
        var visibleTop = off.top;
        var visibleBottom = window.innerHeight - off.bottom;
        var visibleMid = (visibleTop + visibleBottom) / 2;
        var noteMidPage = (window.scrollY || window.pageYOffset) + noteRect.top + (noteRect.height || 14) / 2;
        var targetY = noteMidPage - visibleMid;
        var maxScroll = Math.max(0, (document.documentElement.scrollHeight || document.body.scrollHeight) - window.innerHeight);
        if (targetY < 0) targetY = 0;
        if (targetY > maxScroll) targetY = maxScroll;

        _isAutoScrolling = true;
        window.scrollTo({ top: targetY, behavior: 'smooth' });
        setTimeout(function() { _isAutoScrolling = false; }, 750);
    } catch(e) {
        try {
            var off2 = _getViewportOffsets();
            var vb = window.innerHeight - off2.bottom;
            var vt = off2.top;
            // Fallback use native scrollIntoView then correct for header/player
            _isAutoScrolling = true;
            activeElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(function() {
                // Nudge to true visible center after native call
                var r = activeElem.getBoundingClientRect();
                var curMid = r.top + (r.height || 14)/2;
                var visMid = (vt + vb)/2;
                var delta = curMid - visMid;
                if (Math.abs(delta) > 8) {
                    window.scrollBy({ top: delta, behavior: 'smooth' });
                }
                setTimeout(function(){ _isAutoScrolling = false; }, 400);
            }, 380);
            setTimeout(function() { _isAutoScrolling = false; }, 900);
        } catch(e2) {}
    }
}

var _lastActiveNoteTop = null;
window.onChantNoteActive = function(el) {
    if (window.doYT && window.doYT.syncEnabled === false) return;
    var isSynthPlaying = window.isPlayingChant && window.isPlayingChant();
    var isYtPlaying = window.doYT && window.doYT.activeId && window.doYT.activeId !== 'synth' && document.getElementById('playerBtnPlay') && document.getElementById('playerBtnPlay').classList.contains('playing');
    if (!isSynthPlaying && !isYtPlaying) return;
    if (_userIsScrolling) return;
    if (!el) return;
    if (!isElementInVisibleViewport(el)) {
        centerActiveNote(false);
        try { _lastActiveNoteTop = el.getBoundingClientRect().top; } catch(e) {}
        return;
    }
    // Even if still visible, re-center when jumping to a new staff line (vertical gap > 60px)
    try {
        var curTop = el.getBoundingClientRect().top;
        if (_lastActiveNoteTop !== null && Math.abs(curTop - _lastActiveNoteTop) > 60) {
            centerActiveNote(false);
        }
        _lastActiveNoteTop = curTop;
    } catch(e) {}
};

function initUserScrollTracker() {
    function handleUserScrollInteraction() {
        if (_isAutoScrolling) return;
        _userIsScrolling = true;
        if (_userScrollTimer) clearTimeout(_userScrollTimer);
        _userScrollTimer = setTimeout(function() {
            _userIsScrolling = false;
            // After 10s without user scroll, if chant is playing, re-center if out of view.
            // Works whether video/tonality drawers are open or closed (viewport offsets recomputed).
            if (window.isPlayingChant && window.isPlayingChant()) {
                var activeElem = document.querySelector('svg use.active, svg .active');
                if (activeElem && !isElementInVisibleViewport(activeElem)) {
                    centerActiveNote(false);
                }
            } else if (window.doYT && window.doYT.activeId && window.doYT.activeId !== 'synth') {
                // YT video playing case: use same 10s idle re-center
                var ytPlaying = document.getElementById('playerBtnPlay') && document.getElementById('playerBtnPlay').classList.contains('playing');
                if (ytPlaying) {
                    var activeElem2 = document.querySelector('svg use.active, svg .active');
                    if (activeElem2 && !isElementInVisibleViewport(activeElem2)) {
                        centerActiveNote(false);
                    }
                }
            }
        }, 10000);
    }

    window.removeEventListener('wheel', handleUserScrollInteraction);
    window.removeEventListener('touchmove', handleUserScrollInteraction);
    window.addEventListener('wheel', handleUserScrollInteraction, { passive: true });
    window.addEventListener('touchmove', handleUserScrollInteraction, { passive: true });
    $(window).off('scroll.douser').on('scroll.douser', function() {
        if (!_isAutoScrolling) {
            handleUserScrollInteraction();
        }
    });

    window.removeEventListener('scroll', updateHeaderScrollState);
    window.addEventListener('scroll', updateHeaderScrollState, { passive: true });
    updateHeaderScrollState();
}

function updateHeaderScrollState() {
    var scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
    var isScrolled = scrollY > 10;
    var headerEl = document.querySelector('.do-top-header');
    if (headerEl) {
        headerEl.classList.toggle('is-scrolled', isScrolled);
    }
    if (document.body) {
        document.body.classList.toggle('is-header-scrolled', isScrolled);
    }
}

function updateDoPlayerUI($card, score, isPlaying, startNote) {
    if (window.doState && window.doState.hora === 'bible') return;

    _doCurrentPlayerCard = $card;
    _doCurrentScore = score;

    var part = ($card && $card.data('chant-part')) || '';
    var title = ($card && $card.data('chant-title')) || '';

    if (part) {
        $('#playerChantPart').text(part.toUpperCase()).show();
    } else {
        $('#playerChantPart').hide();
    }
    $('#playerChantName').text(title);
    checkTitleMarquee();

    if (score) {
        try {
            updateDoPitchUI(score);
        } catch(e) {}
    }

    // Force display of the player bar dock directly
    var playerBar = document.getElementById('modernPlayerBar');
    if (playerBar) {
        playerBar.classList.add('visible');
        playerBar.style.transform = 'translateY(0)';
        playerBar.style.opacity = '1';
        playerBar.style.visibility = 'visible';
        playerBar.style.pointerEvents = 'auto';
    }
    document.body.classList.add('player-dock-open');
    setDoPlayerBarState(isPlaying);
    requestAnimationFrame(function() {
        if (typeof syncPlayerBarOffset === 'function') syncPlayerBarOffset();
    });

    $('.do-chant-card').removeClass('is-playing');
    if ($card) $card.addClass('is-playing');

    // Populate YouTube video drawer if chant ID is present and changed
    var chantId = ($card && ($card.data('chant-id') || $card.attr('data-chant-id'))) || '';
    if (!chantId && $card) {
        var $wrapper = $card.closest('[data-chant-id]');
        if ($wrapper.length) chantId = $wrapper.data('chant-id');
    }
    if (!window.doYT || window.doYT.currentChantId !== chantId) {
        _videoDrawerHasPeeked = false;
        _progressBarInitialPeekDone = false;
        updatePlayerVideoDrawer(chantId);
    }
    updateDoPitchButtonState();
    // One-time subtle progress bar peek at the very beginning (animated right shift to hint next), only if not chanting
    if (!_progressBarInitialPeekDone && !isPlaying) {
        var prog = 0;
        try { prog = window.getChantProgress ? window.getChantProgress() : 0; } catch(e) {}
        if (prog === 0) {
            _progressBarInitialPeekDone = true;
            var $fill = $('#playerProgressFill');
            if ($fill.length) {
                $fill.css('transition', 'width 520ms cubic-bezier(0.2, 0.9, 0.3, 1)');
                // small animated nudge to the right
                setTimeout(function(){ $fill.css('width', '3.5%'); }, 180);
                setTimeout(function(){ $fill.css('width', '0%'); }, 950);
                setTimeout(function(){ $fill.css('transition', ''); }, 1500);
            }
        }
    }
}

function escapeHtmlLocal(str) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// YouTube IFrame API & Audio Sources Manager for GABC Player
window.doYT = window.doYT || {
    players: {},
    durations: {},
    pendingSeeks: {},
    skipSegments: {},     // videoId → [{start, end}] from SponsorBlock
    activeId: 'synth',
    activePlayer: null,
    pending: [],
    ready: false,
    _inited: false,
    lastPercentage: 0,
    syncEnabled: (localStorage.getItem('do_video_sync_enabled') !== 'false'),

    init: function() {
        if (window.doYT._inited) return;
        window.doYT._inited = true;

        var prevReady = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = function() {
            window.doYT.ready = true;
            if (typeof prevReady === 'function') {
                try { prevReady(); } catch(e) {}
            }
            window.doYT.setupPending();
        };

        if (window.YT && window.YT.Player) {
            window.doYT.ready = true;
        } else if (!document.getElementById('yt-iframe-api-script')) {
            var tag = document.createElement('script');
            tag.id = 'yt-iframe-api-script';
            tag.src = "https://www.youtube.com/iframe_api";
            var first = document.getElementsByTagName('script')[0];
            if (first && first.parentNode) {
                first.parentNode.insertBefore(tag, first);
            } else {
                document.head.appendChild(tag);
            }
        }
    },

    setupPending: function() {
        var list = window.doYT.pending.slice();
        window.doYT.pending = [];
        list.forEach(function(item) {
            window.doYT.createPlayer(item.elementId, item.videoId, item.$item, item.curSpeed);
        });
    },

    getCurrentFraction: function() {
        var el = document.getElementById('playerProgressFill');
        var fillW = parseFloat(el ? el.style.width : 0) || 0;
        var barFrac = (fillW > 0) ? Math.max(0, Math.min(1, fillW / 100)) : 0;

        if (window.doYT.activeId === 'synth') {
            if (window.getChantProgress) {
                var p = window.getChantProgress();
                if (typeof p === 'number' && !isNaN(p) && p > 0) return Math.max(0, Math.min(1, p));
            }
            if (barFrac > 0) return barFrac;
        } else if (window.doYT.activePlayer) {
            try {
                var cur = window.doYT.activePlayer.getCurrentTime() || 0;
                var dur = window.doYT.activePlayer.getDuration() || 0;
                if (dur > 0 && cur > 0) return Math.max(0, Math.min(1, cur / dur));
            } catch(e) {}
        }
        if (barFrac > 0) return barFrac;
        return window.doYT.lastPercentage || 0;
    },

    pauseAll: function(exceptId) {
        Object.keys(window.doYT.players).forEach(function(id) {
            if (id === exceptId) return;
            var p = window.doYT.players[id];
            try {
                if (p && typeof p.pauseVideo === 'function' && window.doYT.readyPlayers && window.doYT.readyPlayers[id]) {
                    p.pauseVideo();
                }
            } catch (e) {}
        });
    },

    destroyAll: function() {
        Object.keys(window.doYT.players).forEach(function(id) {
            try {
                var p = window.doYT.players[id];
                if (p && typeof p.destroy === 'function') {
                    p.destroy();
                }
            } catch (e) {}
        });
        window.doYT.players = {};
        window.doYT.readyPlayers = {};
        window.doYT.durations = {};
        window.doYT.pendingSeeks = {};
        window.doYT.pendingPlays = {};
        window.doYT.pending = [];
        window.doYT.activeId = 'synth';
        window.doYT.activePlayer = null;
        window.doYT.lastPercentage = 0;
    },

    ensureIframeAndPlayer: function(iframeId, videoId, $item, curSpeed) {
        window.doYT.init();

        var iframeEl = document.getElementById(iframeId);
        if (!iframeEl) {
            var originParam = (window.location.protocol === 'http:' || window.location.protocol === 'https:') ? ('&origin=' + encodeURIComponent(window.location.origin)) : '';
            var embedUrl = 'https://www.youtube.com/embed/' + videoId + '?enablejsapi=1&controls=1&disablekb=1&modestbranding=1&playsinline=1&rel=0&iv_load_policy=3&fs=0' + originParam;
            var $slot = $('#' + iframeId + '_slot');
            if (!$slot.length) $slot = $item.find('.do-yt-thumb-wrap');
            var $iframe = $('<iframe id="' + iframeId + '" src="' + escapeHtmlLocal(embedUrl) + '" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0; border-radius: 12px;"></iframe>');
            $slot.empty().append($iframe);
        }

        window.doYT.createPlayer(iframeId, videoId, $item, curSpeed);
    },

    createPlayer: function(elementId, videoId, $item, curSpeed) {
        if (!window.YT || !window.YT.Player) {
            window.doYT.pending.push({ elementId: elementId, videoId: videoId, $item: $item, curSpeed: curSpeed });
            return;
        }

        if (window.doYT.players[elementId]) {
            return;
        }

        try {
            var player = new YT.Player(elementId, {
                events: {
                    onReady: function(event) {
                        if (!window.doYT.readyPlayers) window.doYT.readyPlayers = {};
                        window.doYT.readyPlayers[elementId] = true;
                        window.doYT.players[elementId] = player;
                        window.doYT.activePlayer = player;

                        var dur = player.getDuration();
                        if (dur) window.doYT.durations[elementId] = dur;

                        // Store the active videoId for SponsorBlock lookup
                        window.doYT._activeVideoId = videoId;
                        fetchSponsorBlockSegments(videoId);

                        if (curSpeed && typeof player.setPlaybackRate === 'function') {
                            try { player.setPlaybackRate(curSpeed); } catch(e) {}
                        }

                        if (window.doYT.pendingSeeks && typeof window.doYT.pendingSeeks[elementId] === 'number') {
                            var seekToSec = window.doYT.pendingSeeks[elementId];
                            delete window.doYT.pendingSeeks[elementId];
                            if (seekToSec > 0) {
                                try { player.seekTo(seekToSec, true); } catch(e) {}
                            }
                        }

                        if (window.doYT.pendingPlays && window.doYT.pendingPlays[elementId]) {
                            delete window.doYT.pendingPlays[elementId];
                            try { player.playVideo(); } catch(e) {}
                            setDoPlayerBarState(true);
                            _userIsScrolling = false;
                            if (_userScrollTimer) { clearTimeout(_userScrollTimer); _userScrollTimer = null; }
                            setTimeout(function() { centerActiveNote(false); }, 180);
                        }
                    },
                    onStateChange: function(event) {
                        if (event.data === 1 || event.data === 3) {
                            if (window.doYT && window.doYT.pendingSeeks && typeof window.doYT.pendingSeeks[elementId] === 'number') {
                                var seekToSec = window.doYT.pendingSeeks[elementId];
                                delete window.doYT.pendingSeeks[elementId];
                                if (seekToSec > 0) {
                                    try { player.seekTo(seekToSec, true); } catch(e) {}
                                }
                            }
                        }

                        // 1 = PLAYING, 2 = PAUSED, 0 = ENDED, 3 = BUFFERING
                        if (event.data === 1) {
                            window.doYT.activeId = elementId;
                            window.doYT.activePlayer = player;
                            window.doYT.pauseAll(elementId);

                            if (window.isPlayingChant && window.isPlayingChant()) {
                                if (window.stopScore) window.stopScore();
                                else if (window.playPauseScore) window.playPauseScore();
                            }

                            $('.do-yt-item').removeClass('is-active');
                            $item.addClass('is-active');
                            $item.find('.do-yt-poster').addClass('is-hidden');

                            setDoPlayerBarState(true);
                            _userIsScrolling = false;
                            if (_userScrollTimer) { clearTimeout(_userScrollTimer); _userScrollTimer = null; }
                            setTimeout(function() { centerActiveNote(false); }, 150);
                        } else if (event.data === 2) {
                            if (window.doYT.activeId === elementId) {
                                setDoPlayerBarState(false);
                            }
                        } else if (event.data === 0) {
                            if (window.doYT.activeId === elementId) {
                                setDoPlayerBarState(false);
                                $('#playerProgressFill').css('width', '100%');
                            }
                            $item.find('.do-yt-poster').removeClass('is-hidden');
                        }
                    }
                }
            });
            window.doYT.players[elementId] = player;
        } catch (err) {
            console.warn('[doYT] YT.Player init exception:', err);
        }
    },

    selectSynth: function(keepPercentage) {
        var fraction = keepPercentage !== false ? window.doYT.getCurrentFraction() : 0;

        // Stop everything
        if (window.isPlayingChant && window.isPlayingChant()) {
            if (window.stopScore) window.stopScore();
        }
        window.doYT.pauseAll();
        window.doYT.activeId = 'synth';
        window.doYT.activePlayer = null;

        $('.do-yt-item').removeClass('is-active');
        $('#doYtItem_synth').addClass('is-active');
        updateDoPitchButtonState();
        if ($('#playerVideoDrawer').is(':visible')) { _sourceScrollInteracting = false; startSourceIdleAutoScroll(); }

        // Restore score times and set cursor position, but do NOT play
        if (_doCurrentScore && _doCurrentScore.notations) {
            var allNotes = [].concat.apply([], _doCurrentScore.notations.map(function(notation) { return notation.notes || notation; })).filter(function(notation) { return !notation.isAccidental; });
            var tempoBpm = parseInt(localStorage.getItem('do_tempo'), 10) || (window.Tone && window.Tone.Transport && window.Tone.Transport.bpm ? window.Tone.Transport.bpm.value : 165) || 165;
            var pv2 = $('#playerTempoValue').text();
            if (pv2) { var pvTempo2 = parseInt(pv2,10); if (!isNaN(pvTempo2) && pvTempo2>30) tempoBpm = pvTempo2; }
            var secPerNote = 60 / tempoBpm;
            var totalSeconds = allNotes.length * secPerNote;
            var elapsedSec = fraction * totalSeconds;
            $('#playerCurrentTime').text(formatChantTime(elapsedSec));
            $('#playerChantTime').text(formatChantTime(totalSeconds));

            var targetIdx = (allNotes.length && fraction > 0) ? Math.max(0, Math.min(allNotes.length - 1, Math.floor(fraction * allNotes.length))) : 0;
            var targetNote = allNotes[targetIdx] || null;
            if (_doCurrentPlayerCard && targetNote) {
                _doCurrentPlayerCard.data('selected-start-note', targetNote);
            }
        }

        // Always paused — user must press Play
        setDoPlayerBarState(false);

        if (fraction >= 0) {
            highlightChantNoteAtFraction(fraction);
        }
    },

    selectVideo: function(iframeId, videoId, $item) {
        // Save current position before switching source
        var fraction = window.doYT.getCurrentFraction();

        // Stop synth if running
        if (window.isPlayingChant && window.isPlayingChant()) {
            if (window.stopScore) window.stopScore();
            else if (window.playPauseScore) window.playPauseScore();
        }

        window.doYT.pauseAll(iframeId);
        window.doYT.activeId = iframeId;

        // Visual outline on the active card
        $('.do-yt-item').removeClass('is-active');
        $item.addClass('is-active');
        $item.find('.do-yt-poster').addClass('is-hidden');
        updateDoPitchButtonState();
        if ($('#playerVideoDrawer').is(':visible')) { _sourceScrollInteracting = false; startSourceIdleAutoScroll(); }

        var curSpeedText = $('#playerSpeedCycleBtn').find('.do-speed-label').text() || '1.0';
        var curSpeed = parseFloat(curSpeedText) || 1.0;

        var dur = window.doYT.durations[iframeId] || parseFloat($item.data('duration-sec')) || 0;
        var targetTime = (dur > 0 && fraction > 0) ? (fraction * dur) : 0;

        // Update player bar time display
        if (dur > 0) {
            $('#playerCurrentTime').text(formatChantTime(targetTime));
            $('#playerChantTime').text(formatChantTime(dur)).attr('title', 'Durée vidéo : ' + formatChantTime(dur));
        }

        // Save the seek position so Play can resume from there
        if (!window.doYT.pendingSeeks) window.doYT.pendingSeeks = {};
        if (targetTime > 0) {
            window.doYT.pendingSeeks[iframeId] = targetTime;
        }

        // If player already loaded: seek to position and stay paused
        var player = window.doYT.players[iframeId];
        var isReady = window.doYT.readyPlayers && window.doYT.readyPlayers[iframeId];
        if (player && isReady) {
            window.doYT.activePlayer = player;
            if (typeof player.setPlaybackRate === 'function') {
                try { player.setPlaybackRate(curSpeed); } catch(e) {}
            }
            if (targetTime > 0 && typeof player.seekTo === 'function') {
                try { player.seekTo(targetTime, true); } catch(e) {}
            }
            if (typeof player.pauseVideo === 'function') {
                try { player.pauseVideo(); } catch(e) {}
            }
        } else {
            // Not loaded yet: remember we want to seek when ready, but NOT play
            window.doYT.activePlayer = null;
        }

        // Always show paused state
        setDoPlayerBarState(false);

        if (fraction >= 0) {
            highlightChantNoteAtFraction(fraction);
        }
    }
};

// Delegated click on the Synth Card
$(document).off('click', '#doYtItem_synth').on('click', '#doYtItem_synth', function(e) {
    e.stopPropagation();
    triggerHapticFeedback('selection');
    window.doYT.selectSynth(true);
});

// Delegated click on a Video Card or Poster
$(document).off('click', '.do-yt-item:not(.is-synth)').on('click', '.do-yt-item:not(.is-synth)', function(e) {
    if ($(e.target).closest('a[href]').length) return; // let external link work
    e.stopPropagation();
    triggerHapticFeedback('selection');
    var $item = $(this);
    var iframeId = $item.data('iframe-id') || $item.find('iframe').attr('id');
    var videoId = $item.data('video-id');
    window.doYT.selectVideo(iframeId, videoId, $item);
});

function updateSynthCardThumbnail(chantId, gabcText) {
    // Logo SVG officiel statique à 3 notes Exsurge (img/gabc.svg)
}

function updatePlayerVideoDrawer(chantId) {
    var $drawer = $('#playerVideoDrawer');
    var $list = $('#playerVideoList');
    var $btn = $('#playerBtnExpandVideos');

    if (window.doYT) {
        window.doYT.currentChantId = chantId;
        window.doYT.destroyAll();
    }

    if (!chantId || !window.GREGORIAN_YOUTUBE_AUDIO || !window.GREGORIAN_YOUTUBE_AUDIO[chantId]) {
        $btn.hide();
        $('#playerBtnToggleSync').hide();
        $drawer.addClass('hidden').hide();
        $btn.removeClass('active');
        if (typeof syncPlayerBarOffset === 'function') syncPlayerBarOffset();
        return;
    }

    var entry = window.GREGORIAN_YOUTUBE_AUDIO[chantId];
    if (!entry || !Array.isArray(entry.audios) || !entry.audios.length) {
        $btn.hide();
        $('#playerBtnToggleSync').hide();
        $drawer.addClass('hidden').hide();
        $btn.removeClass('active');
        if (typeof syncPlayerBarOffset === 'function') syncPlayerBarOffset();
        return;
    }

    $btn.css('display', 'inline-flex').show();
    $('#playerBtnToggleSync').css('display', 'inline-flex').show();
    updateDoSyncButtonState();
    if (window.doYT) window.doYT.init();

    var originParam = (window.location.protocol === 'http:' || window.location.protocol === 'https:') ? ('&origin=' + encodeURIComponent(window.location.origin)) : '';

    var html = '';

    // ── 1. Première carte : Générateur de notes natif (Format carré avec logo officiel Exsurge 3 notes sans ligne) ──
    var isSynthActive = (!window.doYT || window.doYT.activeId === 'synth');
    html += '<div id="doYtItem_synth" class="do-yt-item is-synth ' + (isSynthActive ? 'is-active' : '') + '" title="Cliquer pour écouter la partition GABC native" style="display: flex; flex-direction: column; gap: 6px; text-decoration: none;">';
    html += '  <div class="do-yt-thumb-wrap" style="position: relative; display: block; width: 100%; padding-bottom: 100%; height: 0; overflow: hidden; border-radius: 12px;">';
    html += '    <div class="do-yt-synth-card">';
    html += '      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" style="width: 58%; height: 58%; pointer-events: none;">';
    html += '        <g fill="var(--primary-color, #c96b63)">';
    html += '          <path d="M0-60.906c33.333 0 50 9.635 50 28.906v94.53C39.062 51.595 22.396 46.126 0 46.126s-39.063 5.47-50 16.406V-32c0-19.27 16.667-28.906 50-28.906z" transform="translate(26, 68) scale(0.22)" />';
    html += '          <path d="M0-60.906c33.333 0 50 9.635 50 28.906v94.53C39.062 51.595 22.396 46.126 0 46.126s-39.063 5.47-50 16.406V-32c0-19.27 16.667-28.906 50-28.906z" transform="translate(50, 50) scale(0.22)" />';
    html += '          <path d="M0-60.906c33.333 0 50 9.635 50 28.906v94.53C39.062 51.595 22.396 46.126 0 46.126s-39.063 5.47-50 16.406V-32c0-19.27 16.667-28.906 50-28.906z" transform="translate(74, 32) scale(0.22)" />';
    html += '        </g>';
    html += '      </svg>';
    html += '    </div>';
    html += '  </div>';
    html += '  <div style="display: flex; flex-direction: column; gap: 2px;">';
    html += '    <div class="do-yt-title">Synthétiseur d\'orgue</div>';
    html += '    <div class="do-yt-channel"><span>Partition GABC</span></div>';
    html += '  </div>';
    html += '</div>';

    // ── 2. Cartes suivantes : Enregistrements vidéo YouTube (chargement différé / lazy-loaded) ──
    entry.audios.forEach(function(item, idx) {
        var vId = item.id;
        var title = item.title || 'Enregistrement audio';
        var source = item.source || item.channel || 'Interprétation grégorienne';
        var duration = item.duration ? (' (' + item.duration + ')') : '';
        var ytUrl = item.url || ('https://www.youtube.com/watch?v=' + vId);
        var thumbUrl = 'https://i.ytimg.com/vi/' + vId + '/mqdefault.jpg';
        var iframeId = 'doYtPlayer_' + chantId + '_' + idx;

        var durSec = 0;
        if (item.duration) {
            var p = String(item.duration).split(':').map(Number);
            if (p.length === 2) durSec = p[0] * 60 + p[1];
            else if (p.length === 3) durSec = p[0] * 3600 + p[1] * 60 + p[2];
            window.doYT.durations[iframeId] = durSec;
        }

        html += '<div id="item_' + iframeId + '" class="do-yt-item" data-iframe-id="' + iframeId + '" data-video-id="' + escapeHtmlLocal(vId) + '" data-duration-sec="' + durSec + '" data-duration="' + escapeHtmlLocal(item.duration || '') + '" title="Cliquer pour écouter cet enregistrement" style="display: flex; flex-direction: column; gap: 6px; text-decoration: none;">';
        html += '  <div class="do-yt-thumb-wrap" style="position: relative; display: block; width: 100%; padding-bottom: 56.25%; height: 0; overflow: hidden; border-radius: 12px; background: #000;">';
        html += '    <div id="' + iframeId + '_slot" class="do-yt-iframe-slot" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;"></div>';
        
        // Poster / Couverture épurée
        html += '    <div class="do-yt-poster" title="Écouter cet enregistrement">';
        html += '      <img src="' + escapeHtmlLocal(thumbUrl) + '" class="do-yt-poster-img" alt="' + escapeHtmlLocal(title) + '">';
        html += '    </div>';
        html += '  </div>';

        // Titre et Source (titre tronqué à 2 lignes, chaîne à 1 ligne)
        html += '  <a href="' + escapeHtmlLocal(ytUrl) + '" target="_blank" rel="noopener noreferrer" style="text-decoration: none; display: flex; flex-direction: column; gap: 2px;">';
        html += '    <div class="do-yt-title" title="' + escapeHtmlLocal(title) + duration + '">' + escapeHtmlLocal(title) + duration + '</div>';
        html += '    <div class="do-yt-channel" title="' + escapeHtmlLocal(source) + '">';
        html += '      <svg viewBox="0 0 24 24" width="12" height="12" fill="#ff0000" style="flex-shrink: 0;"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>';
        html += '      <span>' + escapeHtmlLocal(source) + '</span>';
        html += '    </div>';
        html += '  </a>';
        html += '</div>';
    });

    $list.html(html);

    if (!$drawer.is(':hidden')) {
        requestAnimationFrame(function() {
            if (typeof syncPlayerBarOffset === 'function') syncPlayerBarOffset();
        });
    }
}

// ── Auto-scroll: scroll active source into view after idle ──────────────
var _sourceScrollTimer = null;
var _sourceScrollInteracting = false;
var _videoDrawerHasPeeked = false; // one-time peek at beginning (animated) only, not while chanting
var _progressBarInitialPeekDone = false;

function scrollActiveSourceIntoView(animate) {
    var $list = $('#playerVideoList');
    if (!$list.length) return;
    var listEl = $list[0];
    var $active = $list.find('.do-yt-item.is-active').first();
    if (!$active.length) return;

    // Respect the list's own left padding so the item isn't flush against the edge
    var paddingLeft = parseInt(window.getComputedStyle(listEl).paddingLeft, 10) || 0;

    // Target scroll: item's offsetLeft minus the padding (so it appears with the same left gap as the first item)
    var itemLeft = $active[0].offsetLeft - paddingLeft;
    if (itemLeft < 0) itemLeft = 0;

    // Don't over-scroll past the right end
    var maxScroll = listEl.scrollWidth - listEl.clientWidth;
    var targetScroll = Math.min(itemLeft, maxScroll);
    if (targetScroll < 0) targetScroll = 0;

    if (animate) {
        $(listEl).stop(true).animate({ scrollLeft: targetScroll }, 400, 'swing');
    } else {
        listEl.scrollLeft = targetScroll;
    }
}

function startSourceIdleAutoScroll() {
    clearTimeout(_sourceScrollTimer);
    _sourceScrollTimer = setTimeout(function() {
        if (!_sourceScrollInteracting) {
            scrollActiveSourceIntoView(true);
        }
    }, 10000);
}

// Track user interaction with the source list to pause auto-scroll
$(document).on('scroll.sourceautoscroll touchstart.sourceautoscroll mousedown.sourceautoscroll', '#playerVideoList', function() {
    _sourceScrollInteracting = true;
    clearTimeout(_sourceScrollTimer);
    // Resume auto-scroll eligibility after user has stopped interacting for 10s
    clearTimeout(_sourceScrollTimer._resumeTimer);
    _sourceScrollTimer._resumeTimer = setTimeout(function() {
        _sourceScrollInteracting = false;
        startSourceIdleAutoScroll();
    }, 10000);
});

// Toggle handler for playerBtnExpandVideos
$(document).on('click', '#playerBtnExpandVideos', function(e) {
    e.stopPropagation();
    triggerHapticFeedback('toggle');
    var $drawer = $('#playerVideoDrawer');
    var isHidden = $drawer.is(':hidden');
    if (isHidden) {
        // Close pitch drawer if open (mutually exclusive)
        var $pitchDrawer = $('#playerPitchDrawer');
        if ($pitchDrawer.is(':visible')) {
            $pitchDrawer.slideUp(150, function() { $pitchDrawer.addClass('hidden'); });
            $('#playerPitchPill').removeClass('active');
        }
        $drawer.removeClass('hidden').slideDown(200, function() {
            if (typeof syncPlayerBarOffset === 'function') syncPlayerBarOffset();
            var $list = $('#playerVideoList');
            if ($list.length) {
                var listEl = $list[0];
                var maxScroll = listEl.scrollWidth - listEl.clientWidth;
                if (maxScroll > 0) {
                    var isPlaying = (window.isPlayingChant && window.isPlayingChant());
                    // One-time animated peek at the very beginning, only if not chanting
                    if (!_videoDrawerHasPeeked && !isPlaying && listEl.scrollLeft === 0) {
                        scrollActiveSourceIntoView(false);
                        var peekOffset = Math.min(listEl.scrollLeft + 36, maxScroll);
                        _videoDrawerHasPeeked = true;
                        // animated shift to the right to reveal next card, then gently snap back after pause
                        $(listEl).stop(true).animate({ scrollLeft: peekOffset }, 480, 'swing', function() {
                            setTimeout(function(){
                                if (!_sourceScrollInteracting) $(listEl).stop(true).animate({ scrollLeft: listEl.scrollLeft - 16 }, 380, 'swing');
                            }, 900);
                        });
                    } else {
                        scrollActiveSourceIntoView(false);
                    }
                }
            }
            _sourceScrollInteracting = false;
            startSourceIdleAutoScroll();
            // Re-center chant after layout change (video drawer open) — on click Source, always keep active note/card visible
            setTimeout(function(){
                var ae=document.querySelector('svg use.active, svg .active');
                if (!ae && _doCurrentPlayerCard) ae=_doCurrentPlayerCard[0];
                if(ae && !isElementInVisibleViewport(ae)) centerActiveNote(false);
            }, 230);
        });
        $(this).addClass('active');
    } else {
        $drawer.slideUp(200, function() {
            $drawer.addClass('hidden');
            if (typeof syncPlayerBarOffset === 'function') syncPlayerBarOffset();
            clearTimeout(_sourceScrollTimer);
            setTimeout(function(){
                var ae=document.querySelector('svg use.active, svg .active');
                if (!ae && _doCurrentPlayerCard) ae=_doCurrentPlayerCard[0];
                if(ae && !isElementInVisibleViewport(ae)) centerActiveNote(false);
            }, 220);
        });
        $(this).removeClass('active');
        if (window.doYT && typeof window.doYT.pauseAll === 'function') {
            window.doYT.pauseAll();
        }
    }
});

// Toggle handler for playerBtnToggleSync
$(document).off('click', '#playerBtnToggleSync').on('click', '#playerBtnToggleSync', function(e) {
    e.stopPropagation();
    triggerHapticFeedback('toggle');
    if (!window.doYT) window.doYT = {};
    window.doYT.syncEnabled = (window.doYT.syncEnabled === false);
    var isEnabled = window.doYT.syncEnabled;
    localStorage.setItem('do_video_sync_enabled', isEnabled ? 'true' : 'false');
    updateDoSyncButtonState();

    if (!isEnabled) {
        clearActiveNote();
    } else {
        if (window.doYT && window.doYT.activeId && window.doYT.activeId !== 'synth') {
            var player = window.doYT.activePlayer || window.doYT.players[window.doYT.activeId];
            if (player && typeof player.getCurrentTime === 'function' && typeof player.getDuration === 'function') {
                var cur = player.getCurrentTime() || 0;
                var dur = player.getDuration() || 0;
                if (dur > 0) {
                    highlightChantNoteAtFraction(cur / dur);
                }
            }
        } else if (window.getChantProgress) {
            var frac = window.getChantProgress();
            if (frac >= 0) {
                highlightChantNoteAtFraction(frac);
            }
        }
    }
});

function updateDoSyncButtonState() {
    var $btn = $('#playerBtnToggleSync');
    if (!$btn.length) return;
    var isEnabled = (!window.doYT || window.doYT.syncEnabled !== false);
    if (isEnabled) {
        $btn.addClass('active').attr('title', 'Synchronisation active (Cliquer pour désactiver le suivi des notes)');
    } else {
        $btn.removeClass('active').attr('title', 'Synchronisation désactivée (Cliquer pour activer le suivi des notes)');
    }
}

var _marqueeRaf = null;

function checkTitleMarquee() {
    var wrapper = document.querySelector('.do-player-name-wrapper');
    var el = document.getElementById('playerChantName');
    if (!wrapper || !el) return;

    if (_marqueeRaf) {
        cancelAnimationFrame(_marqueeRaf);
        _marqueeRaf = null;
    }
    el.style.transform = 'none';
    wrapper.style.webkitMaskImage = 'none';
    wrapper.style.maskImage = 'none';

    setTimeout(function() {
        var wrapperW = wrapper.getBoundingClientRect().width;
        var textW = el.scrollWidth;
        if (textW > wrapperW + 2 && wrapperW > 0) {
            var maxDist = Math.ceil(textW - wrapperW + 8);
            startSmoothMarquee(el, wrapper, maxDist);
        }
    }, 60);
}

function startSmoothMarquee(el, wrapper, maxDist) {
    if (_marqueeRaf) cancelAnimationFrame(_marqueeRaf);

    var startPause = 1800; // ms to pause at start
    var endPause = 1800;   // ms to pause at end
    var speed = 25;        // px per second
    var scrollDuration = Math.max(1200, (maxDist / speed) * 1000); // ms
    var totalCycle = startPause + scrollDuration + endPause + scrollDuration;

    var startTime = null;

    function step(timestamp) {
        if (!startTime) startTime = timestamp;
        var elapsed = (timestamp - startTime) % totalCycle;
        var currentX = 0;

        if (elapsed < startPause) {
            currentX = 0;
        } else if (elapsed < startPause + scrollDuration) {
            var progress = (elapsed - startPause) / scrollDuration;
            // Smooth easeInOut cubic
            var ease = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
            currentX = -maxDist * ease;
        } else if (elapsed < startPause + scrollDuration + endPause) {
            currentX = -maxDist;
        } else {
            var progress = (elapsed - startPause - scrollDuration - endPause) / scrollDuration;
            var ease = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
            currentX = -maxDist * (1 - ease);
        }

        el.style.transform = 'translateX(' + currentX.toFixed(2) + 'px)';

        // Exact physical edge fades:
        // Left fade: 0 at currentX === 0, smoothly ramping to 1 over first 8px of movement
        var leftFade = Math.min(1, Math.max(0, Math.abs(currentX) / 8));
        // Right fade: 0 at currentX === -maxDist, smoothly ramping to 1 over last 8px of movement
        var rightFade = Math.min(1, Math.max(0, (maxDist - Math.abs(currentX)) / 8));

        // When leftFade is 0: gradient starts at solid #000 (0% transparent, 100% opaque, zero fade)
        // When leftFade is 1: gradient starts at transparent 0px, fading to #000 at 12px
        var maskStr = 'linear-gradient(to right, rgba(0,0,0,' + (1 - leftFade).toFixed(3) + ') 0px, #000 ' + (12 * leftFade).toFixed(1) + 'px, #000 calc(100% - ' + (12 * rightFade).toFixed(1) + 'px), rgba(0,0,0,' + (1 - rightFade).toFixed(3) + ') 100%)';

        wrapper.style.webkitMaskImage = maskStr;
        wrapper.style.maskImage = maskStr;

        _marqueeRaf = requestAnimationFrame(step);
    }

    _marqueeRaf = requestAnimationFrame(step);
}

var _headerMarqueeRaf = null;

function checkHeaderTitleMarquee() {
    var wrapper = document.querySelector('.do-header-title-wrapper');
    var el = document.querySelector('#doHeaderTitle .title-text');
    if (!wrapper || !el) return;

    if (_headerMarqueeRaf) {
        cancelAnimationFrame(_headerMarqueeRaf);
        _headerMarqueeRaf = null;
    }
    el.style.transform = 'none';
    wrapper.style.webkitMaskImage = 'none';
    wrapper.style.maskImage = 'none';

    setTimeout(function() {
        var wrapperW = wrapper.getBoundingClientRect().width;
        var textW = el.scrollWidth;
        if (textW > wrapperW + 3 && wrapperW > 0) {
            var maxDist = Math.ceil(textW - wrapperW + 10);
            startHeaderSmoothMarquee(el, wrapper, maxDist, 2);
        } else {
            el.style.transform = 'none';
            wrapper.style.webkitMaskImage = 'none';
            wrapper.style.maskImage = 'none';
        }
    }, 70);
}

function startHeaderSmoothMarquee(el, wrapper, maxDist, maxCycles) {
    if (_headerMarqueeRaf) cancelAnimationFrame(_headerMarqueeRaf);

    maxCycles = maxCycles || 2;
    var startPause = 2000; // ms to pause at start
    var endPause = 1800;   // ms to pause at end
    var speed = 28;        // px per second
    var scrollDuration = Math.max(1200, (maxDist / speed) * 1000); // ms
    var singleCycle = startPause + scrollDuration + endPause + scrollDuration;
    var totalDuration = singleCycle * maxCycles;

    var startTime = null;

    function step(timestamp) {
        if (!startTime) startTime = timestamp;
        var totalElapsed = timestamp - startTime;

        if (totalElapsed >= totalDuration) {
            // Settle gracefully at start with soft right fade
            el.style.transform = 'translateX(0px)';
            var finalMask = 'linear-gradient(to right, #000 0px, #000 calc(100% - 16px), rgba(0,0,0,0) 100%)';
            wrapper.style.webkitMaskImage = finalMask;
            wrapper.style.maskImage = finalMask;
            _headerMarqueeRaf = null;
            return;
        }

        var elapsed = totalElapsed % singleCycle;
        var currentX = 0;

        if (elapsed < startPause) {
            currentX = 0;
        } else if (elapsed < startPause + scrollDuration) {
            var progress = (elapsed - startPause) / scrollDuration;
            var ease = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
            currentX = -maxDist * ease;
        } else if (elapsed < startPause + scrollDuration + endPause) {
            currentX = -maxDist;
        } else {
            var progress = (elapsed - startPause - scrollDuration - endPause) / scrollDuration;
            var ease = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
            currentX = -maxDist * (1 - ease);
        }

        el.style.transform = 'translateX(' + currentX.toFixed(2) + 'px)';

        var leftFade = Math.min(1, Math.max(0, Math.abs(currentX) / 8));
        var rightFade = Math.min(1, Math.max(0, (maxDist - Math.abs(currentX)) / 8));
        var maskStr = 'linear-gradient(to right, rgba(0,0,0,' + (1 - leftFade).toFixed(3) + ') 0px, #000 ' + (14 * leftFade).toFixed(1) + 'px, #000 calc(100% - ' + (14 * rightFade).toFixed(1) + 'px), rgba(0,0,0,' + (1 - rightFade).toFixed(3) + ') 100%)';

        wrapper.style.webkitMaskImage = maskStr;
        wrapper.style.maskImage = maskStr;

        _headerMarqueeRaf = requestAnimationFrame(step);
    }

    _headerMarqueeRaf = requestAnimationFrame(step);
}

$(window).off('resize.doheadermarquee').on('resize.doheadermarquee', function() {
    checkHeaderTitleMarquee();
});

$(document).off('pointerenter.doheadermarquee', '#doHeaderTitle')
    .on('pointerenter.doheadermarquee', '#doHeaderTitle', function() {
        checkHeaderTitleMarquee();
    });

function setDoPlayerBarState(isPlaying) {
    if (isPlaying) {
        $('#playerBtnPlay').addClass('playing');
        // Pause icon — two clean vertical bars
        $('#playerBtnPlay').html('<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>');
        startDoProgressTracking();
    } else {
        $('#playerBtnPlay').removeClass('playing');
        // Play icon — clean filled triangle
        $('#playerBtnPlay').html('<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><polygon points="6,4 20,12 6,20"/></svg>');
        if (_doProgressInterval) clearInterval(_doProgressInterval);
    }
}


/**
 * Fetch non-musical segments from SponsorBlock for a given YouTube videoId.
 * Categories: music_offtopic (talking over music), intro, outro, sponsor, interaction.
 * Result cached in window.doYT.skipSegments[videoId].
 */
function fetchSponsorBlockSegments(videoId) {
    if (!videoId) return;
    if (window.doYT.skipSegments.hasOwnProperty(videoId)) return; // already fetched or fetching

    // Mark as fetching (null = in progress, array = done)
    window.doYT.skipSegments[videoId] = null;

    var cats = encodeURIComponent(JSON.stringify(['music_offtopic', 'intro', 'outro', 'sponsor', 'interaction']));
    var url = 'https://sponsor.ajay.app/api/skipSegments?videoID=' + encodeURIComponent(videoId) + '&categories=' + cats;

    fetch(url, { method: 'GET', headers: { 'Accept': 'application/json' }, cache: 'no-store' })
        .then(function(r) {
            if (r.status === 404) return []; // 404 = no segments, normal case — not an error
            if (!r.ok) return [];
            return r.json();
        })
        .then(function(data) {
            var segs = [];
            (data || []).forEach(function(seg) {
                if (seg.segment && seg.segment.length === 2) {
                    segs.push({ start: seg.segment[0], end: seg.segment[1] });
                }
            });
            segs.sort(function(a, b) { return a.start - b.start; });
            window.doYT.skipSegments[videoId] = segs;
            if (segs.length > 0) {
                console.debug('[SponsorBlock] ' + segs.length + ' segment(s) à sauter pour ' + videoId);
            }
        })
        .catch(function() {
            window.doYT.skipSegments[videoId] = []; // network error → treat as no segments
        });
}

/**
 * Given raw currentTime and segments, return the "musical time" (skipping non-musical segments)
 * and the "musical duration". Used for sync fraction calculation.
 */
function _sponsorBlockMusicalTime(cur, dur, segments) {
    if (!segments || !segments.length) return { musicalCur: cur, musicalDur: dur };

    var skippedBefore = 0; // total skipped seconds before cur
    var totalSkipped = 0;  // total non-musical seconds in full video

    segments.forEach(function(seg) {
        var segLen = Math.max(0, seg.end - seg.start);
        totalSkipped += segLen;
        if (seg.end <= cur) {
            skippedBefore += segLen;
        } else if (seg.start < cur) {
            // We're inside a skip segment — count partial
            skippedBefore += (cur - seg.start);
        }
    });

    return {
        musicalCur: Math.max(0, cur - skippedBefore),
        musicalDur: Math.max(1, dur - totalSkipped)
    };
}

function startDoProgressTracking() {
    if (_doProgressInterval) clearInterval(_doProgressInterval);
    _doProgressInterval = setInterval(function() {
        if (window.doYT && window.doYT.activeId && window.doYT.activeId !== 'synth') {
            var activeId = window.doYT.activeId;
            var player = window.doYT.activePlayer || window.doYT.players[activeId];
            if (player && typeof player.getCurrentTime === 'function' && typeof player.getDuration === 'function') {
                var cur = player.getCurrentTime() || 0;
                var dur = player.getDuration() || 0;
                if (dur > 0) {
                    // ── SponsorBlock: skip non-musical segments ──
                    var videoId = (window.doYT._activeVideoId || '');
                    var segs = window.doYT.skipSegments[videoId] || [];
                    for (var si = 0; si < segs.length; si++) {
                        var seg = segs[si];
                        if (cur >= seg.start && cur < seg.end) {
                            // We're inside a skip segment — jump to its end
                            try { player.seekTo(seg.end, true); } catch(e) {}
                            return; // skip this frame's highlight update
                        }
                    }

                    // ── Compute musical fraction (excluding skipped segments) ──
                    var mt = _sponsorBlockMusicalTime(cur, dur, segs);
                    var frac = mt.musicalCur / mt.musicalDur;
                    frac = Math.max(0, Math.min(1, frac));

                    window.doYT.lastPercentage = frac;
                    var percent = frac * 100;
                    $('#playerProgressFill').css('width', percent + '%');
                    $('#playerCurrentTime').text(formatChantTime(cur));
                    $('#playerChantTime').text(formatChantTime(dur)).attr('title', 'Durée vidéo : ' + formatChantTime(dur));
                    // Ne pas écraser le highlight manuel (1er clic) quand la vidéo est en pause — même fonction que 2e/3e clic supprimée pour 1er usage
                    var isYtPlaying = false;
                    try { isYtPlaying = player.getPlayerState && player.getPlayerState() === 1; } catch(e){}
                    if (!isYtPlaying) return;
                    if (window.doYT.syncEnabled !== false) {
                        highlightChantNoteAtFraction(frac);
                    }
                }
            }
            return;
        }

        if (!window.isPlayingChant || !window.isPlayingChant()) {
            if (_doProgressInterval) clearInterval(_doProgressInterval);
            setDoPlayerBarState(false);
            return;
        }
        if (window.getChantProgress) {
            var frac = window.getChantProgress();
            if (window.doYT) window.doYT.lastPercentage = frac;
            var percent = frac * 100;
            if (percent > 100) percent = 100;
            $('#playerProgressFill').css('width', percent + '%');
            // Update elapsed time for synth
            if (_doCurrentScore && _doCurrentScore.notations) {
                var allN = [].concat.apply([], _doCurrentScore.notations.map(function(n) { return n.notes || []; }));
                var tempoBpm = parseInt(localStorage.getItem('do_tempo'), 10) || (window.Tone && window.Tone.Transport && window.Tone.Transport.bpm ? window.Tone.Transport.bpm.value : 165) || 165;
                var pv3 = $('#playerTempoValue').text();
                if (pv3) { var pvTempo3 = parseInt(pv3,10); if (!isNaN(pvTempo3) && pvTempo3>30) tempoBpm = pvTempo3; }
                var secPerNote = 60 / tempoBpm;
                var totalSec = allN.length * secPerNote;
                $('#playerCurrentTime').text(formatChantTime(frac * totalSec));
            }
            if (percent >= 100) {
                setDoPlayerBarState(false);
            }
        }
    }, 150);
}

function updateDoPitchButtonState() {
    var isYtActive = (window.doYT && window.doYT.activeId && window.doYT.activeId !== 'synth');
    var $pill = $('#playerPitchPill');
    if (!$pill.length) return;
    if (isYtActive) {
        $pill.addClass('is-disabled');
        $pill.attr('title', 'Tonalité désactivée en mode vidéo (disponible avec le synthétiseur GABC)');
        closeDoPitchBubble();
    } else {
        $pill.removeClass('is-disabled');
        $pill.attr('title', 'Tonalité de départ (Cliquer pour choisir le ton)');
    }
}

function populateDoPitchBubble() {
    if (!_doCurrentScore || !window.exsurge) return;
    var score = _doCurrentScore;
    var currentVal = (score.defaultStartPitch && typeof score.defaultStartPitch.toInt === 'function') 
        ? score.defaultStartPitch.toInt() 
        : 0;
    var naturalVal = (score._naturalStartPitch != null) ? score._naturalStartPitch : currentVal;

    var noteNames = ['Do', 'Do♯', 'Ré', 'Ré♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'];
    var html = '';

    // Offer 13 chromatic semitones from -6 to +6 around natural pitch
    for (var offset = -6; offset <= 6; offset++) {
        var val = naturalVal + offset;
        var p = new exsurge.Pitch(val);
        // JS modulo can be negative — force positive
        var stepIdx = ((p.step % 12) + 12) % 12;
        var sName = noteNames[stepIdx] || '';
        var oct = (p.octave !== undefined) ? p.octave : '';
        var fullName = sName + oct;

        var diffText = (offset === 0) ? 'défaut' : (offset > 0 ? ('+' + offset) : String(offset));
        var isActive = (val === currentVal);

        html += '<div class="do-pitch-chip ' + (isActive ? 'is-active' : '') + '" data-pitch-val="' + val + '" title="' + fullName + (offset !== 0 ? (' (' + diffText + ' demi-tons)') : ' (ton naturel)') + '">';
        html += '  <span class="do-pitch-chip-note">' + fullName + '</span>';
        html += '  <span class="do-pitch-chip-diff">' + diffText + '</span>';
        html += '</div>';
    }

    $('#playerPitchBubbleGrid').html(html);

    // Show or hide reset button depending on whether pitch differs from natural
    if (currentVal !== naturalVal) {
        $('#btnResetPitch').show();
    } else {
        $('#btnResetPitch').hide();
    }
}

function openDoPitchBubble() {
    var $pill = $('#playerPitchPill');
    if (!$pill.length || $pill.hasClass('is-disabled')) return;
    if (!_doCurrentScore || !window.exsurge) return;

    var $drawer = $('#playerPitchDrawer');
    if (!$drawer.length) return;

    // Close video drawer if open (mutually exclusive)
    var $videoDrawer = $('#playerVideoDrawer');
    if ($videoDrawer.is(':visible')) {
        $videoDrawer.slideUp(150, function() {
            $videoDrawer.addClass('hidden');
            $('#playerBtnExpandVideos').removeClass('active');
            if (typeof syncPlayerBarOffset === 'function') syncPlayerBarOffset();
        });
    }

    populateDoPitchBubble();
    triggerHapticFeedback('light');

    $drawer.removeClass('hidden').slideDown(200, function() {
        if (typeof syncPlayerBarOffset === 'function') syncPlayerBarOffset();
        // Re-center after pitch drawer changes viewport bottom — on click source/tonality, always keep active note visible (playing or not)
        setTimeout(function(){
            var ae=document.querySelector('svg use.active, svg .active');
            if (!ae && _doCurrentPlayerCard) ae=_doCurrentPlayerCard[0];
            if(ae && !isElementInVisibleViewport(ae)) centerActiveNote(false);
        }, 220);
    });
    $pill.addClass('active');
}

function closeDoPitchBubble() {
    var $drawer = $('#playerPitchDrawer');
    if ($drawer.length && $drawer.is(':visible')) {
        $drawer.slideUp(200, function() {
            $drawer.addClass('hidden');
            if (typeof syncPlayerBarOffset === 'function') syncPlayerBarOffset();
            setTimeout(function(){
                var ae=document.querySelector('svg use.active, svg .active');
                if (!ae && _doCurrentPlayerCard) ae=_doCurrentPlayerCard[0];
                if(ae && !isElementInVisibleViewport(ae)) centerActiveNote(false);
            }, 220);
        });
    }
    $('#playerPitchPill').removeClass('active');
}

function updateDoPitchUI(score) {
    if (!score || !window.exsurge) return;
    var lowPitch = 100000, highPitch = 0, startPitch = null;
    if (score.notations) {
        score.notations.forEach(function(notation) {
            if (notation.notes) {
                notation.notes.forEach(function(note) {
                    if (note.pitch) {
                        var pitch = note.pitch.toInt();
                        if (startPitch == null) startPitch = pitch;
                        lowPitch = Math.min(lowPitch, pitch);
                        highPitch = Math.max(highPitch, pitch);
                    }
                });
            }
        });
    }

    if (startPitch == null) return;

    if (!score.defaultStartPitch && window.calculateDefaultStartPitch) {
        score.defaultStartPitch = window.calculateDefaultStartPitch(startPitch, lowPitch, highPitch);
    }

    if (score.defaultStartPitch && score._naturalStartPitch == null) {
        score._naturalStartPitch = (typeof score.defaultStartPitch.toInt === 'function') 
            ? score.defaultStartPitch.toInt() 
            : score.defaultStartPitch;
    }

    var pitchObj = (score.defaultStartPitch && typeof score.defaultStartPitch.toInt === 'function') 
        ? score.defaultStartPitch 
        : new exsurge.Pitch(startPitch);

    var noteNames = ['Do', 'Do♯', 'Ré', 'Ré♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'];
    var stepIndex = (typeof pitchObj.step === 'number') ? (pitchObj.step % 12) : 0;
    var stepName = noteNames[stepIndex] || 'La';
    $('#playerStartingPitch').text(stepName + (pitchObj.octave !== undefined ? pitchObj.octave : ''));

    // Update is-transposed indicator on the button itself
    var isTransposed = (score._naturalStartPitch != null && pitchObj.toInt() !== score._naturalStartPitch);
    $('#playerPitchPill').toggleClass('is-transposed', isTransposed);

    // Refresh chips if pitch drawer is open
    if ($('#playerPitchDrawer').is(':visible')) {
        populateDoPitchBubble();
    }
}

function renderSingleChantScore($wrapper, force) {
    if (!$wrapper || !$wrapper.length) return;
    if (!force && $wrapper.data('do-rendered')) return;
    var chantId = $wrapper.data('chant-id');
    var defaultName = $wrapper.data('chant-name') || ('Chant ' + chantId);
    var defaultPart = $wrapper.data('chant-part') || 'Chant grégorien';

    if (!chantId) {
        $wrapper.html('<div class="do-chant-error">Identifiant de chant non spécifié.</div>');
        return;
    }

    if (!force && $wrapper.data('is-visible') === false) {
        return;
    }
    if ($wrapper.data('is-rendering')) return;

    var $card = $wrapper.find('.do-chant-card');
    if (!$card.length) {
        var cardHtml = 
            '<div class="do-chant-card">' +
                '<div class="do-chant-preview gregorian-skeleton">' + renderChantSkeleton(2) + '</div>' +
            '</div>';
        $card = $(cardHtml);
        $wrapper.empty().append($card);
    }
    $card.data('chant-part', defaultPart);
    $card.data('chant-title', defaultName);

    var $preview = $card.find('.do-chant-preview');
    if (!$preview.hasClass('is-rendered') && !$preview.find('.gregorian-score-loader').length) {
        $preview.addClass('gregorian-skeleton').html(renderChantSkeleton(2));
    }

    $wrapper.data('is-rendering', true);

    async function loadGabcAndRender() {
        try {
            var cachedGabc = $wrapper.data('cached-gabc') || GABC_LOCAL_CACHE[chantId];
            if (!cachedGabc && window.gregorianDB && typeof window.gregorianDB.getGabc === 'function') {
                try {
                    cachedGabc = await window.gregorianDB.getGabc(chantId);
                } catch(e) {}
            }
            if (!cachedGabc) {
                try {
                    cachedGabc = await $.ajax({
                        url: 'gabc/' + chantId + '.gabc',
                        dataType: 'text',
                        cache: true
                    });
                } catch(e) {}
            }
            if (!cachedGabc) {
                try {
                    cachedGabc = await $.ajax({
                        url: 'https://raw.githubusercontent.com/bastonus/jgabc/master/gabc/' + encodeURIComponent(chantId) + '.gabc',
                        dataType: 'text',
                        cache: true
                    });
                } catch(e) {}
            }

            // Check if card moved out of viewport during async download
            if (!force && $wrapper.data('is-visible') === false) {
                $wrapper.data('is-rendering', false);
                return;
            }

            if (!cachedGabc) {
                $preview.removeClass('gregorian-skeleton').html('<div class="do-chant-error">Partition #' + escHtml(chantId) + ' non disponible.</div>');
                $wrapper.data('is-rendering', false);
                return;
            }

            $wrapper.data('cached-gabc', cachedGabc);
            GABC_LOCAL_CACHE[chantId] = cachedGabc;
            updateSynthCardThumbnail(chantId, cachedGabc);

            var header = parseGabcHeader(cachedGabc);
            var title = header.name || defaultName;
            var officePart = header['office-part'] || defaultPart;
            var mode = header.mode || '';

            $card.data('chant-part', officePart);
            $card.data('chant-title', title);

            if (typeof exsurge === 'undefined') {
                $preview.removeClass('gregorian-skeleton').html('<div class="do-chant-error">Moteur Exsurge non chargé.</div>');
                $wrapper.data('is-rendering', false);
                return;
            }

            var ctxt = new exsurge.ChantContext();
            var curTheme = document.documentElement.getAttribute('data-theme') || 'dark';
            var isDark = (curTheme !== 'light');
            var accentColor = (doState && doState.settings && doState.settings.color) ? doState.settings.color : '#c96b63';

            ctxt.textColor = isDark ? '#ffffff' : '#111317';
            ctxt.noteColor = isDark ? '#ffffff' : '#111317';
            ctxt.neumeLineColor = isDark ? '#ffffff' : '#111317';
            ctxt.dividerLineColor = isDark ? '#ffffff' : '#111317';
            ctxt.staffLineColor = isDark ? 'rgba(255, 255, 255, 0.55)' : 'rgba(0, 0, 0, 0.45)';

            ctxt.setFont("'Crimson Text', 'Libre Baskerville', serif", 16);
            ctxt.setRubricColor(accentColor);
            ctxt.specialCharColor = accentColor;
            ctxt.rubricColor = accentColor;
            ctxt.lyricTextColor = isDark ? '#ffffff' : '#111317';
            ctxt.lyricTextFont = "'Crimson Text', 'Libre Baskerville', serif";
            ctxt.annotationTextFont = ctxt.lyricTextFont;

            if (ctxt.textStyles) {
                Object.keys(ctxt.textStyles).forEach(function(k) {
                    if (ctxt.textStyles[k]) {
                        ctxt.textStyles[k].color = isDark ? '#ffffff' : '#111317';
                        ctxt.textStyles[k].font = "'Crimson Text', 'Libre Baskerville', serif";
                    }
                });
            }

            var processedGabc = preprocessGabcForExsurge(cachedGabc);
            var mappings = exsurge.Gabc.createMappingsFromSource(ctxt, processedGabc);
            var score = new exsurge.ChantScore(ctxt, mappings, true);

            // Setup Exsurge annotations (propers.html Solesmes style above drop cap)
            var romanNumeral = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
            var partAbbrev = {
                verse: 'V/.',
                tractus: 'Tract.',
                offertorium: 'Offert.',
                introitus: 'Intr.',
                graduale: 'Grad.',
                communio: 'Comm.',
                sequentia: 'Seq.',
                hymnus: 'Hymn.',
                antiphona: 'Ant.',
                responsorium: 'Resp.',
                canticum: 'Cant.',
                alleluia: 'Allel.'
            };

            var topAnnotation = '';
            var bottomAnnotation = '';

            if (header.annotations && header.annotations.length >= 2) {
                topAnnotation = header.annotations[0];
                bottomAnnotation = header.annotations[1];
            } else if (header.annotations && header.annotations.length === 1) {
                topAnnotation = header.annotations[0];
                if (header.mode) {
                    var mInt = parseInt(header.mode, 10);
                    bottomAnnotation = (mInt >= 1 && mInt <= 8) ? romanNumeral[mInt] : header.mode;
                }
            } else {
                var rawPart = (officePart || header['office-part'] || '').toLowerCase();
                var abbrev = partAbbrev[rawPart] || officePart || '';
                if (abbrev) topAnnotation = (abbrev === 'V/.' || abbrev === 'Tract.' || abbrev === 'Seq.') ? abbrev : abbrev.toUpperCase();
                var rawMode = header.mode || mode;
                if (rawMode) {
                    var modeNum = parseInt(rawMode, 10);
                    bottomAnnotation = (modeNum >= 1 && modeNum <= 8) ? romanNumeral[modeNum] : rawMode;
                }
            }

            if (topAnnotation && bottomAnnotation) {
                score.annotation = new exsurge.Annotations(ctxt, '%' + topAnnotation + '%', '%' + bottomAnnotation + '%');
            } else if (topAnnotation) {
                score.annotation = new exsurge.Annotations(ctxt, '%' + topAnnotation + '%');
            } else if (bottomAnnotation) {
                score.annotation = new exsurge.Annotations(ctxt, '%' + bottomAnnotation + '%');
            }

            var width = getOptimalChantWidth($card);
            ctxt.width = width;

            score.performLayout(ctxt);
            score.layoutChantLines(ctxt, width, function() {
                if (!force && $wrapper.data('is-visible') === false) {
                    $wrapper.data('is-rendering', false);
                    return;
                }

                var svg = score.createSvgNode(ctxt);
                if (svg) {
                    svg.setAttribute('width', '100%');
                    svg.style.width = '100%';
                    svg.style.maxWidth = '100%';
                    svg.style.height = 'auto';

                    var noteFill = isDark ? '#ffffff' : '#111317';
                    svg.setAttribute('fill', noteFill);
                    svg.style.fill = noteFill;

                    $preview.removeClass('gregorian-skeleton').addClass('is-rendered').find('.gregorian-score-loader').remove();
                    $preview.empty().append(svg);

                    $card.data('chant-score', score);
                    $card.data('chant-ctxt', ctxt);
                    $card.data('chant-gabc', processedGabc);
                    $wrapper.data('do-rendered', true);
                    $wrapper.data('is-rendering', false);

                    if (chantIntersectionObserver) {
                        chantIntersectionObserver.unobserve($wrapper[0]);
                    }
                }
            });
        } catch(e) {
            console.warn('[DivinumOfficium] Exsurge error chant ID ' + chantId, e);
            $preview.removeClass('gregorian-skeleton').html('<div class="do-chant-error">Erreur de rendu Exsurge: ' + escHtml(e.message) + '</div>');
            $wrapper.data('is-rendering', false);
        }
    }

    loadGabcAndRender();
}
window.renderSingleChantScore = renderSingleChantScore;
window.relayoutAllChantScores = relayoutAllChantScores;
window.getOptimalChantWidth = getOptimalChantWidth;

function getOptimalChantWidth($card) {
    var $preview = $card.find('.do-chant-preview');
    var w = 0;
    if ($preview.length && $preview.width() > 100) {
        w = $preview.width();
    } else if ($card.innerWidth() > 100) {
        w = $card.innerWidth() - 32;
    } else {
        var $stream = $('#do-content-stream');
        if ($stream.length && $stream.width() > 100) {
            w = $stream.width() - (window.innerWidth <= 768 ? 48 : 80);
        } else {
            w = $(window).width() - (window.innerWidth <= 768 ? 32 : 80);
        }
    }
    return Math.max(280, Math.floor(w));
}

function relayoutAllChantScores() {
    if (!doState.includeGregorian && doState.hora !== 'gregorian_chant') return;
    $('.do-chant-card').each(function() {
        var $card = $(this);
        var score = $card.data('chant-score');
        var ctxt = $card.data('chant-ctxt');
        var data = $card.data('chant-gabc');
        if (score && ctxt && data) {
            var newWidth = getOptimalChantWidth($card);
            if (Math.abs((ctxt.width || 0) - newWidth) > 6) {
                ctxt.width = newWidth;
                score.performLayout(ctxt);
                score.layoutChantLines(ctxt, newWidth, function() {
                    var svg = score.createSvgNode(ctxt);
                    if (svg) {
                        svg.setAttribute('width', '100%');
                        svg.style.width = '100%';
                        svg.style.maxWidth = '100%';
                        svg.style.height = 'auto';

                        var curTheme = document.documentElement.getAttribute('data-theme') || 'dark';
                        var isDark = (curTheme !== 'light');
                        var noteFill = isDark ? '#ffffff' : '#111317';
                        svg.setAttribute('fill', noteFill);
                        svg.style.fill = noteFill;

                        $card.find('.do-chant-preview').empty().append(svg);

                        // Rebind note + syllable click with proximity detection
                        $(svg).on('click', function(e) {
                            var nearest = findNearestChantElement(svg, e.pageX, e.pageY);
                            if (nearest) {
                                handleChantElementClick(nearest, e);
                            } else {
                                updateDoPlayerUI($card, score, false);
                            }
                        });
                    }
                });
            }
        }
    });
}

var chantResizeTimer = null;
var chantResizeObserver = null;

function setupChantResizeObserver() {
    if (typeof ResizeObserver === 'undefined') return;
    if (chantResizeObserver) {
        chantResizeObserver.disconnect();
    }
    chantResizeObserver = new ResizeObserver(function() {
        if (chantResizeTimer) clearTimeout(chantResizeTimer);
        chantResizeTimer = setTimeout(function() {
            if (doState.includeGregorian || doState.hora === 'gregorian_chant') {
                relayoutAllChantScores();
            }
        }, 50);
    });

    var streamEl = document.getElementById('do-content-stream');
    if (streamEl) chantResizeObserver.observe(streamEl);

    var appLayoutEl = document.querySelector('.app-layout');
    if (appLayoutEl) chantResizeObserver.observe(appLayoutEl);
}

$(window).on('resize orientationchange', function() {
    if (!doState.includeGregorian && doState.hora !== 'gregorian_chant') return;
    if (chantResizeTimer) clearTimeout(chantResizeTimer);
    chantResizeTimer = setTimeout(function() {
        relayoutAllChantScores();
    }, 60);
});

var chantIntersectionObserver = null;

function setupChantIntersectionObserver() {
    if (chantIntersectionObserver) {
        chantIntersectionObserver.disconnect();
        chantIntersectionObserver = null;
    }
    if (typeof IntersectionObserver === 'undefined') return null;

    chantIntersectionObserver = new IntersectionObserver(function(entries, observer) {
        entries.forEach(function(entry) {
            var el = entry.target;
            var $wrapper = $(el);
            if (entry.isIntersecting) {
                $wrapper.data('is-visible', true);
                if (doState.includeGregorian || doState.hora === 'gregorian_chant') {
                    renderSingleChantScore($wrapper, false);
                }
            } else {
                $wrapper.data('is-visible', false);
            }
        });
    }, {
        root: null,
        rootMargin: '200px 0px',
        threshold: 0.01
    });

    return chantIntersectionObserver;
}

function renderAllChantScoresInDOM($root, force) {
    var $wrappers = ($root || $('#do-content-stream')).find('.do-chant-card-wrapper');
    if (!$wrappers.length) return;

    if (!doState.includeGregorian && doState.hora !== 'gregorian_chant') {
        $wrappers.hide();
        return;
    }

    $wrappers.show();

    if (force) {
        if (chantIntersectionObserver) {
            chantIntersectionObserver.disconnect();
        }
        $wrappers.each(function() {
            $(this).removeData('do-rendered');
            renderSingleChantScore($(this), true);
        });
        setupChantResizeObserver();
        return;
    }

    if (typeof IntersectionObserver !== 'undefined') {
        var observer = setupChantIntersectionObserver();
        if (observer) {
            $wrappers.each(function() {
                if (!$(this).data('do-rendered')) {
                    observer.observe(this);
                }
            });
            setupChantResizeObserver();
            return;
        }
    }

    setTimeout(function() {
        $wrappers.each(function() {
            renderSingleChantScore($(this), force);
        });
        setupChantResizeObserver();
    }, 20);
}

function renderTestMissaBannerAndToolbar() {
    var isGregorianOn = (doState.includeGregorian !== false);
    var curKyriale = doState.selectedKyriale || 'auto';

    var kyrialeOptionsHtml = 
        '<option value="auto"' + (curKyriale === 'auto' ? ' selected' : '') + '>⚡ Automatique (selon le temps)</option>' +
        '<option value="1"' + (curKyriale === '1' ? ' selected' : '') + '>Missa I : Lux et origo (Temps Pascal)</option>' +
        '<option value="2"' + (curKyriale === '2' ? ' selected' : '') + '>Missa II : Kyrie fons bonitatis (Ière classe)</option>' +
        '<option value="3"' + (curKyriale === '3' ? ' selected' : '') + '>Missa III : Kyrie Deus sempiterne (Ière classe)</option>' +
        '<option value="4"' + (curKyriale === '4' ? ' selected' : '') + '>Missa IV : Cunctipotens Genitor Deus (IIème classe)</option>' +
        '<option value="8"' + (curKyriale === '8' ? ' selected' : '') + '>Missa VIII : De Angelis (Solennités)</option>' +
        '<option value="9"' + (curKyriale === '9' ? ' selected' : '') + '>Missa IX : Cum jubilo (Sainte Vierge)</option>' +
        '<option value="10"' + (curKyriale === '10' ? ' selected' : '') + '>Missa X : Alme Pater (Sainte Vierge)</option>' +
        '<option value="11"' + (curKyriale === '11' ? ' selected' : '') + '>Missa XI : Orbis factor (Dimanches de l\'année)</option>' +
        '<option value="17"' + (curKyriale === '17' ? ' selected' : '') + '>Missa XVII : Avent &amp; Carême</option>' +
        '<option value="18"' + (curKyriale === '18' ? ' selected' : '') + '>Missa XVIII : Deus Genitor alme (Féries)</option>' +
        '<option value="19"' + (curKyriale === '19' ? ' selected' : '') + '>Missa pro defunctis (Requiem)</option>';

    var curProper = doState.testFeastKey || doState.officiumKey || '';
    var properOptionsHtml = '<option value="">— Propre du jour (Automatique) —</option>';
    if (typeof sundayKeys !== 'undefined') {
        properOptionsHtml += '<optgroup label="Proprium de Tempore">';
        sundayKeys.forEach(function(item) {
            if (item.key) {
                var isSel = (curProper === item.key);
                properOptionsHtml += '<option value="' + escHtml(item.key) + '"' + (isSel ? ' selected' : '') + '>' + escHtml(item.title || item.en) + '</option>';
            }
        });
        properOptionsHtml += '</optgroup>';
    }
    if (typeof otherKeys !== 'undefined') {
        properOptionsHtml += '<optgroup label="Messes Votives &amp; Communs">';
        otherKeys.forEach(function(item) {
            if (item.key) {
                var isSel = (curProper === item.key);
                properOptionsHtml += '<option value="' + escHtml(item.key) + '"' + (isSel ? ' selected' : '') + '>' + escHtml(item.title || item.en) + '</option>';
            }
        });
        properOptionsHtml += '</optgroup>';
    }

    var html = 
        '<div class="do-test-banner">' +
            '<div class="do-test-banner-header">' +
                '<div>' +
                    '<div class="do-test-badge">🧪 Experimentum • Liturgia &amp; Cantus</div>' +
                    '<h2 class="do-test-title">Sainte Messe &amp; Chant Grégorien Intercalé</h2>' +
                    '<p class="do-test-desc">' +
                        'Page de test unifiée : Textes liturgiques bilingues du Missel Romain (Divinum Officium) avec partitions grégoriennes interactives (GABC / Exsurge) intercalées.' +
                    '</p>' +
                '</div>' +
            '</div>' +
            '<div class="do-test-toolbar">' +
                '<button id="btnToggleGregorianChants" class="do-test-ctrl-btn' + (isGregorianOn ? ' active' : '') + '">' +
                    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>' +
                    '<span>Partitions Grégoriennes : ' + (isGregorianOn ? 'ACTIVÉES' : 'DÉSACTIVÉES') + '</span>' +
                '</button>' +
                '<button id="btnDemoUpdateBannerTestPage" class="do-test-ctrl-btn" title="Tester l\'animation de la bannière de mise à jour">' +
                    '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>' +
                    '<span>🚀 Démo Bannière MAJ</span>' +
                '</button>' +
                '<div class="do-test-select-wrapper">' +
                    '<span class="do-test-select-label">Kyriale :</span>' +
                    '<select id="doKyrialeSelect" class="do-test-select">' + kyrialeOptionsHtml + '</select>' +
                '</div>' +
                '<div class="do-test-select-wrapper">' +
                    '<span class="do-test-select-label">Propre :</span>' +
                    '<select id="doTestProperSelect" class="do-test-select">' + properOptionsHtml + '</select>' +
                '</div>' +
            '</div>' +
        '</div>';

    return html;
}

function displayResult(result, vernResult) {
    var $stream = $('#do-content-stream').empty();
    var uiLang = getUiLang();

    if (!result || !result.cards || !result.cards.length) {
        var notFoundTitle = (uiLang === 'fr') ? 'Office non trouvé' : (uiLang === 'en') ? 'Office not found' : (uiLang === 'es') ? 'Oficio no encontrado' : 'Officium non inventum';
        var notFoundDesc = (uiLang === 'fr') ? 'Les textes pour ce jour ne sont pas disponibles.' : 'Textus pro hac die non inveniuntur in repositorio locali.';
        $stream.html('<div class="do-empty"><h3>' + notFoundTitle + '</h3><p>' + notFoundDesc + '</p></div>');
        return;
    }

    var isTestMissa = (doState.hora === 'missa_gregorian');
    var isMissa = (doState.hora === 'missa' || isTestMissa);

    if (isTestMissa) {
        $stream.append(renderTestMissaBannerAndToolbar());
    }

    var title = '';
    if (vernResult && vernResult.title && doState.vernacularLang && doState.vernacularLang !== 'none') {
        title = vernResult.title;
    } else if (result && result.title) {
        title = result.title;
    }

    if (title) {
        $('#doSidebarFeastTitle').text(getLocalizedFeastTitle(title, getUiLang()));
        $('#doHeaderTitle .title-text').text(getLocalizedFeastTitle(title, getUiLang()));
        checkHeaderTitleMarquee();
    }

    var onSaintAttached = null;
    var isViewInDom = false;

    // ---- COMPOSANT SAINT DU JOUR / FÊTE AU DÉBUT DE LA MESSE ----
    if (isMissa) {
        var $saintCardWrap = $('<div id="doMissaSaintCardWrap" class="do-home-saint-card-wrap do-missa-saint-card-wrap">');
        $stream.append($saintCardWrap);

        var feastTitleStr = getLocalizedFeastTitle(title, uiLang);
        buildHomeSaintCard(doState.date, uiLang, feastTitleStr, result, function($card, onAttached) {
            if ($card) {
                $saintCardWrap.append($card);
                onSaintAttached = onAttached;
                if (isViewInDom && typeof onSaintAttached === 'function') {
                    requestAnimationFrame(function() {
                        onSaintAttached();
                    });
                }
            } else {
                $saintCardWrap.remove();
            }
        }, true);
    }

    var vernMap = {};
    if (vernResult && vernResult.cards) {
        vernResult.cards.forEach(function(vc) {
            if (vc && vc.id) {
                vernMap[vc.id] = vc;
            }
        });
    }

    var chantsMap = (isMissa && doState.includeGregorian) ? getGregorianChantsMapForMissa(doState.date, doState.testFeastKey || doState.officiumKey, doState.selectedKyriale, result) : {};

    result.cards.forEach(function(card) {
        var vernCard = (card.id && vernMap[card.id]) ? vernMap[card.id] : null;
        var cardHtml = renderOfficeCardHTML(card, vernCard);
        var $cardNode = $(cardHtml);

        // If card has associated Gregorian chant(s)
        var chantList = (isMissa && doState.includeGregorian && card.id && chantsMap[card.id]) ? chantsMap[card.id] : null;
        if (chantList && chantList.length) {
            chantList.forEach(function(ch) {
                var wrapperHtml = 
                    '<div class="do-chant-card-wrapper' + (doState.includeGregorian ? '' : ' hidden') + '" ' +
                    'data-chant-id="' + escHtml(ch.id) + '" ' +
                    'data-chant-name="' + escHtml(ch.name) + '" ' +
                    'data-chant-part="' + escHtml(ch.part) + '"' +
                    (doState.includeGregorian ? '' : ' style="display:none;"') + '>' +
                    '<div class="do-chant-card"><div class="do-chant-preview gregorian-skeleton">' + renderChantSkeleton(2) + '</div></div>' +
                    '</div>';
                
                $cardNode.find('.do-card-body').prepend(wrapperHtml);
            });
        }

        $stream.append($cardNode);
    });

    applyHyphenationToContainer($stream);

    if ($stream[0]) {
        var offsetVal = (doState.mobileLang === 'vern') ? 'calc(-50% - 12px)' : '0%';
        $stream[0].style.setProperty('--bilingual-offset', offsetVal);
    }

    // Lazy render chant scores via IntersectionObserver when Gregorian is enabled
    if (isMissa && doState.includeGregorian) {
        renderAllChantScoresInDOM($stream, false);
    }

    if (isMissa) {
        setupMassToc(result);
    } else {
        hideMassToc();
    }

    isViewInDom = true;
    if (typeof onSaintAttached === 'function') {
        requestAnimationFrame(function() {
            onSaintAttached();
        });
    }

    startBilingualSwipeHint();
}

var swipeHintTimer = null;
var swipeHintScrollDebounce = null;
var isSwipeHintAnimating = false;

function ensureBilingualGestureIndicator() {
    if (!$('#doBilingualGestureIndicator').length) {
        $('body').append(
            '<div id="doBilingualGestureIndicator" aria-hidden="true">' +
                '<div class="do-gesture-glow-bar"></div>' +
            '</div>'
        );
    }
}

function isViewportOverBilingualText() {
    var vpH = window.innerHeight || $(window).height() || 600;
    var vpTopMargin = vpH * 0.15;
    var vpBottomMargin = vpH * 0.85;

    // 1. Check if Gregorian chant scores dominate the active middle of the viewport
    var isChantDominating = false;
    $('.do-chant-card-wrapper:visible, .do-chant-card:visible, .gabc-chant-preview:visible').each(function() {
        var rect = this.getBoundingClientRect();
        var visibleTop = Math.max(rect.top, vpTopMargin);
        var visibleBottom = Math.min(rect.bottom, vpBottomMargin);
        if (visibleBottom > visibleTop) {
            var visibleHeight = visibleBottom - visibleTop;
            // If chant score occupies more than 30% of active viewport, consider it a chant section
            if (visibleHeight > (vpH * 0.30)) {
                isChantDominating = true;
                return false; // break loop
            }
        }
    });

    if (isChantDominating) {
        return false;
    }

    // 2. Check if bilingual text rows are visible in the viewport with substantial text
    var visibleTextCharCount = 0;
    var visibleBilingualRowCount = 0;

    $('.do-bilingual-row:visible').each(function() {
        var rect = this.getBoundingClientRect();
        if (rect.bottom > vpTopMargin && rect.top < vpBottomMargin) {
            visibleBilingualRowCount++;
            var text = $(this).text() || '';
            visibleTextCharCount += text.trim().length;
            if (visibleTextCharCount >= 70 && visibleBilingualRowCount >= 2) {
                return false; // found sufficient bilingual text
            }
        }
    });

    return (visibleBilingualRowCount > 0 && visibleTextCharCount >= 50);
}

function isBilingualSwipeHintAllowed() {
    if ($('body').hasClass('mass-toc-open') || $('body').hasClass('header-dropdown-open')) return false;
    if ($('#doMassTocPanel:not(.hidden)').length > 0 || $('#headerDropdown:not(.hidden)').length > 0) return false;
    if ($('#settingsPanel.open, .update-modal:not(.hidden), .feedback-modal:not(.hidden)').length > 0) return false;
    return true;
}

function startBilingualSwipeHint() {
    if ($(window).width() > 768) return;

    var isBilingual = (doState.showLatin && doState.vernacularLang && doState.vernacularLang !== 'none' && doState.hora !== 'home');
    if (!isBilingual || doState.mobileLang === 'vern' || !isBilingualSwipeHintAllowed()) {
        stopBilingualSwipeHint();
        return;
    }

    if (swipeHintTimer) {
        clearInterval(swipeHintTimer);
        swipeHintTimer = null;
    }
    $(window).off('scroll.bilingualSwipeHint');

    ensureBilingualGestureIndicator();

    // Check on initial load after short delay
    setTimeout(function() {
        if (isBilingualSwipeHintAllowed() && doState.mobileLang === 'la' && isViewportOverBilingualText()) {
            playBilingualSwipeHint();
        }
    }, 1000);

    // Listen to scroll: trigger hint when user scrolls to a text section
    $(window).on('scroll.bilingualSwipeHint', function() {
        if (!isBilingualSwipeHintAllowed() || doState.mobileLang === 'vern') {
            stopBilingualSwipeHint();
            return;
        }
        if (swipeHintScrollDebounce) clearTimeout(swipeHintScrollDebounce);
        swipeHintScrollDebounce = setTimeout(function() {
            if (isBilingualSwipeHintAllowed() && doState.mobileLang === 'la' && !isSwipeHintAnimating && isViewportOverBilingualText()) {
                playBilingualSwipeHint();
            }
        }, 350);
    });

    // Periodic repeat: only plays when currently over bilingual text
    swipeHintTimer = setInterval(function() {
        if (!isBilingualSwipeHintAllowed() || doState.mobileLang === 'vern') {
            stopBilingualSwipeHint();
            return;
        }
        if (!isSwipeHintAnimating && isViewportOverBilingualText()) {
            playBilingualSwipeHint();
        }
    }, 8500);
}

function playBilingualSwipeHint() {
    if (!isBilingualSwipeHintAllowed() || doState.mobileLang === 'vern' || isSwipeHintAnimating) {
        if (doState.mobileLang === 'vern' || !isBilingualSwipeHintAllowed()) stopBilingualSwipeHint();
        return;
    }
    ensureBilingualGestureIndicator();

    var $pill = $('#doBilingualGestureIndicator');
    var $rows = $('.do-bilingual-row');

    isSwipeHintAnimating = true;
    $pill.removeClass('active');
    $rows.removeClass('do-bilingual-hint-anim');

    // Force CSS reflow to replay single pulse animation
    if ($pill.length && $pill[0]) void $pill[0].offsetWidth;

    $pill.addClass('active');
    if ($rows.length) {
        $rows.addClass('do-bilingual-hint-anim');
    }

    setTimeout(function() {
        isSwipeHintAnimating = false;
        $pill.removeClass('active');
        $rows.removeClass('do-bilingual-hint-anim');
    }, 2200);
}

function stopBilingualSwipeHint() {
    if (swipeHintTimer) {
        clearInterval(swipeHintTimer);
        swipeHintTimer = null;
    }
    if (swipeHintScrollDebounce) {
        clearTimeout(swipeHintScrollDebounce);
        swipeHintScrollDebounce = null;
    }
    $(window).off('scroll.bilingualSwipeHint');
    isSwipeHintAnimating = false;
    $('#doBilingualGestureIndicator').removeClass('active').remove();
    $('.do-bilingual-row').removeClass('do-bilingual-hint-anim');
}

function updateSidebarAndHeader() {
    updateUiTranslations();

    var uiLang = getUiLang();
    var hora = doState.hora;
    var horaMap = DO_HORA_TITLES_BY_LANG[uiLang] || DO_HORA_TITLES_BY_LANG['fr'] || DO_HORA_TITLES_BY_LANG['la'];
    var horaLabel = horaMap[hora] || hora;
    var dateFormatted = formatLiturgicalDate(doState.date, uiLang);

    $('.do-nav-item').removeClass('active');
    $('.do-nav-item[data-hora="' + hora + '"]').addClass('active');
    $('#btnBrandHome, .do-brand').toggleClass('active', hora === 'home');

    $('.bottom-nav .nav-item').removeClass('active');
    $('.bottom-nav .nav-item[data-hora="' + hora + '"]').addClass('active');

    $('#doDateLabel').text(dateFormatted);
    if (hora === 'bible') {
        var bookId = doState.bible.book || 'Genesis';
        var bkObj = DO_BIBLE_BOOKS.filter(function(b) { return b.id === bookId; })[0] || DO_BIBLE_BOOKS[0];
        var bookTitle = (uiLang === 'la' ? bkObj.la : (bkObj[uiLang] || bkObj.fr || bkObj.la)) || bkObj.id;
        $('#doHourLabel').text(('SACRA BIBLIA • ' + (bkObj.cat || 'Vulgata')).toUpperCase());
        $('#doHeaderTitle .title-text').text(bookTitle + ' • ' + (uiLang === 'fr' ? 'Chapitre ' : 'Capitulum ') + doState.bible.chapter);
    } else if (hora === 'gregorian_search') {
        $('#doHourLabel').text((uiLang === 'fr' ? 'OREMVS • RECHERCHE VNIVERSELLE' : (uiLang === 'la' ? 'OREMVS • QVÆRERE' : 'OREMVS • SEARCH')).toUpperCase());
        $('#doHeaderTitle .title-text').text(uiLang === 'fr' ? 'Recherche' : (uiLang === 'la' ? 'Quærere' : 'Search'));
    } else if (hora === 'gregorian_chant') {
        $('#doHourLabel').text('CANTUS GREGORIANUS');
        if (!doState.currentChantId) {
            $('#doHeaderTitle .title-text').text('Cantus Gregorianus');
        }
    } else {
        $('#doHourLabel').text((horaLabel + ' • ' + dateFormatted).toUpperCase());
    }
    checkHeaderTitleMarquee();

    // Rubricæ / Editio UI state
    $('#doEditionSelect').val(doState.edition || '1960');

    // Toggles UI state (Ordinarium, Gregorian, Latin)
    $('#toggleOrdinarium').prop('checked', doState.includeOrdinarium);
    $('#toggleGregorian').prop('checked', doState.includeGregorian);
    $('#toggleLatin').prop('checked', doState.showLatin);

    $('#doVernacularOptions .settings-option-card, #doVernacularOptions .settings-option').removeClass('active');
    $('#doVernacularOptions [data-value="' + doState.vernacularLang + '"]').addClass('active');

    $('#doThemeOptions .settings-option-card, #doThemeOptions .settings-option').removeClass('active');
    $('#doThemeOptions [data-value="' + doState.settings.theme + '"]').addClass('active');

    // Liturgical color sync state & swatches
    $('#toggleLiturgicalColor').prop('checked', doState.settings.liturgicalColorSync);
    $('#doColorOptions .color-swatch-circle, #doColorOptions .color-swatch').removeClass('active');
    $('#doColorOptions [data-color="' + doState.settings.color + '"]').addClass('active');
    if (doState.settings.liturgicalColorSync) {
        $('#doColorOptions').css('opacity', '0.45').css('pointer-events', 'none');
    } else {
        $('#doColorOptions').css('opacity', '1').css('pointer-events', 'auto');
    }

    // Icon color & sync state
    $('#toggleSyncIconColor').prop('checked', doState.settings.iconSync);
    $('#doIconColorOptions .color-swatch-circle').removeClass('active');
    if (doState.settings.iconSync) {
        $('#doIconColorOptions').css('opacity', '0.45').css('pointer-events', 'none');
    } else {
        $('#doIconColorOptions').css('opacity', '1').css('pointer-events', 'auto');
        $('#doIconColorOptions [data-icon-color="' + doState.settings.iconColor + '"]').addClass('active');
    }
    updateFaviconAndAppIcon();

    // Haptics & Updates state
    $('#toggleHaptics').prop('checked', localStorage.getItem('do_haptics') !== 'false');
    $('#toggleAutoUpdate').prop('checked', localStorage.getItem('do_auto_update') !== 'false');
    $('#toggleIncludeBeta').prop('checked', localStorage.getItem('do_include_beta') !== 'false');
    $('#updateStatusText').text('Version actuelle : ' + CURRENT_APP_VERSION).css('color', 'var(--text-tertiary)');
}

function openBible(bookId, chapterNum, pageNum) {
    doState.hora = 'bible';
    localStorage.setItem('do_hora', 'bible');
    var normalizedId = normalizeBibleBookId(bookId || doState.bible.book || 'Genesis');
    doState.bible.book = normalizedId;
    localStorage.setItem('do_bible_book', normalizedId);
    if (chapterNum) {
        doState.bible.chapter = parseInt(chapterNum, 10);
        localStorage.setItem('do_bible_chapter', doState.bible.chapter);
    }
    if (pageNum !== undefined) {
        doState.bible.page = parseInt(pageNum, 10) || 1;
        localStorage.setItem('do_bible_page', doState.bible.page);
    }
    closeModals();
    if (window.OremusRouter) {
        window.OremusRouter.syncUrl({ push: true });
    }
    renderDO();
}

function closeModals() {
    $('#settingsPanel, #doSidebar').removeClass('open active anim-overshoot').css('transform', '');
    $('#settingsBackdrop, #sidebarBackdrop').removeClass('open active').css({ 'opacity': '', 'display': '' });
    $('#remoteNotificationModalBackdrop, #remoteNotificationModal').addClass('hidden');
    $('#feedbackModalBackdrop, #feedbackModal').addClass('hidden');
    $('#pwaInstallModalBackdrop, #pwaInstallModal').addClass('hidden');
    $('#appIconModalBackdrop, #appIconModal').addClass('hidden');
    $('#notificationPromptModalBackdrop, #notificationPromptModal').addClass('hidden');
    if (typeof window.closeGregorianSearch === 'function') {
        window.closeGregorianSearch();
    } else {
        $('#gregorianSearchModal, #gregorianZoomModal').removeClass('is-open');
    }
    $('#doSaintPreviewModal').remove();
    $('body').removeClass('sidebar-open is-dragging-sidebar');
    closeHeaderDropdown();
    document.body.style.overflow = '';
}

// ---- Liturgical Dates & Computus for Dropdown ----
var Dates = {
    Computus: {
        getEaster: function (Y) {
            var C = Math.floor(Y / 100);
            var N = Y - 19 * Math.floor(Y / 19);
            var K = Math.floor((C - 17) / 25);
            var I = C - Math.floor(C / 4) - Math.floor((C - K) / 3) + 19 * N + 15;
            I = I - 30 * Math.floor((I / 30));
            I = I - Math.floor(I / 28) * (1 - Math.floor(I / 28) * Math.floor(29 / (I + 1)) * Math.floor((21 - N) / 11));
            var J = Y + Math.floor(Y / 4) + I + 2 - C + Math.floor(C / 4);
            J = J - 7 * Math.floor(J / 7);
            var L = I - J;
            var Month = 3 + Math.floor((L + 40) / 44);
            var Day = L + 28 - 31 * Math.floor(Month / 4);
            return new Date(Y, Month - 1, Day);
        }
    }
};

function getLiturgicalDates(Y) {
    var result = { year: Y };
    var easterDate = Dates.Computus.getEaster(Y);
    result.pascha = moment(easterDate);
    result.septuagesima = moment(result.pascha).subtract(63, 'days');
    result.quad1 = moment(result.septuagesima).add(21, 'days');
    result.ashWednesday = moment(result.pascha).subtract(46, 'days');
    result.ascension = moment(result.pascha).add(39, 'days');
    result.pentecost = moment(result.pascha).add(49, 'days');
    result.corpusChristi = moment(result.pentecost).add(11, 'days');
    result.sacredHeart = moment(result.pentecost).add(19, 'days');
    result.nativitas = moment({ year: Y, month: 11, day: 25 });
    var natDay = result.nativitas.day() || 7;
    result.advent1 = moment(result.nativitas).subtract(natDay + 21, 'days');
    result.epiphany = moment({ year: Y, month: 0, day: 6 });
    result.holyFamily = moment(result.epiphany).add(7 - result.epiphany.day(), 'days');
    result.ChristusRex = moment({ year: Y, month: 9, day: 31 });
    result.ChristusRex.subtract(result.ChristusRex.day(), 'days');
    result.sundaysAfterPentecost = result.advent1.diff(result.pentecost, 'weeks') - 1;
    return result;
}

function getDateForLiturgicalKey(key, year) {
    if (!key) return null;
    year = year || doState.date.year();
    var dates = getLiturgicalDates(year);

    // Saint Key: e.g. "Aug15", "Jan06", "Dec25_1", "Sep19laSalette"
    var saintMatch = key.match(/^([A-Z][a-z]{2})(\d{1,2})/);
    var monthMap = {
        Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
        Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
    };
    if (saintMatch && monthMap[saintMatch[1]] !== undefined && !/^Quad|^Pent|^Pasc|^Adv|^Emb/.test(key)) {
        var mNum = monthMap[saintMatch[1]];
        var dNum = parseInt(saintMatch[2], 10);
        return moment({ year: year, month: mNum, day: dNum });
    }

    switch (key) {
        case "Nat1":
            var m = moment({ year: year, month: 11, day: 25 }).add(1, 'week');
            return m.subtract(m.day(), 'days');
        case "Nat2":
            var m2 = moment({ year: year, month: 0, day: 6 }).subtract(1, 'days');
            m2.subtract(m2.day(), 'days');
            if (m2.month() !== 0 || m2.date() <= 1) m2 = moment({ year: year, month: 0, day: 2 });
            return m2;
        case "Epi": return moment(dates.epiphany);
        case "Asc": return moment(dates.ascension);
        case "CorpusChristi": return moment(dates.corpusChristi);
        case "SCJ": return moment(dates.sacredHeart);
        case "ChristusRex": return moment(dates.ChristusRex);
        case "Pasc0": case "Pascha": return moment(dates.pascha);
        case "Pent0": case "Pentecost": return moment(dates.pentecost);
        case "7a": case "Septuagesima": return moment(dates.septuagesima);
        case "6a": case "Sexagesima": return moment(dates.septuagesima).add(1, 'week');
        case "5a": case "Quinquagesima": return moment(dates.septuagesima).add(2, 'weeks');
        case "5aw": return moment(dates.ashWednesday);
        case "EmbWedSept":
            var cross = moment({ year: year, month: 8, day: 14 });
            var sunAfter = moment(cross).add((7 - cross.day()) % 7 || 7, 'days');
            return moment(sunAfter).add(3, 'days');
        case "EmbFriSept":
            var cross = moment({ year: year, month: 8, day: 14 });
            var sunAfter = moment(cross).add((7 - cross.day()) % 7 || 7, 'days');
            return moment(sunAfter).add(5, 'days');
        case "EmbSatSept": case "EmbSatSeptS":
            var cross = moment({ year: year, month: 8, day: 14 });
            var sunAfter = moment(cross).add((7 - cross.day()) % 7 || 7, 'days');
            return moment(sunAfter).add(6, 'days');
    }

    var weekdayKeys = ['m', 't', 'w', 'h', 'f', 's'];
    var match;
    if (match = key.match(/Adv(\d)([wfs])?/)) {
        var mAdv = moment(dates.advent1).add(parseInt(match[1], 10) - 1, 'weeks');
        if (match[2]) mAdv.add(1 + weekdayKeys.indexOf(match[2]), 'days');
        return mAdv;
    } else if (match = key.match(/^Epi(\d)([mtwhfs])?/)) {
        var mEpi = moment(dates.epiphany).add(parseInt(match[1], 10), 'weeks').subtract(dates.epiphany.day(), 'days');
        if (match[2]) mEpi.add(1 + weekdayKeys.indexOf(match[2]), 'days');
        return mEpi;
    } else if (match = key.match(/Quad(\d)([mtwhfs])?/)) {
        var mQuad = moment(dates.septuagesima).add(2 + parseInt(match[1], 10), 'weeks');
        if (match[2]) mQuad.add(1 + weekdayKeys.indexOf(match[2]), 'days');
        return mQuad;
    } else if (match = key.match(/Pasc(\d)([mtwhfs])?/)) {
        var mPasc = moment(dates.pascha).add(parseInt(match[1], 10), 'weeks');
        if (match[2]) mPasc.add(1 + weekdayKeys.indexOf(match[2]), 'days');
        return mPasc;
    } else if (match = key.match(/Pent(\d+)([mtwhfs])?/)) {
        var num = parseInt(match[1], 10);
        if (num === 24 && !match[2]) {
            return moment(dates.advent1).subtract(1, 'week');
        }
        var mPent = moment(dates.pentecost).add(num, 'weeks');
        if (match[2]) mPent.add(1 + weekdayKeys.indexOf(match[2]), 'days');
        return mPent;
    } else if (match = key.match(/([765])a([mtwhfs])?/)) {
        var weeksAfter = 7 - parseInt(match[1], 10);
        var mPre = moment(dates.septuagesima).add(weeksAfter, 'weeks');
        if (match[2]) mPre.add(1 + weekdayKeys.indexOf(match[2]), 'days');
        return mPre;
    } else if (match = key.match(/PentEpi([3456])/)) {
        var pentecost24 = 31 - dates.sundaysAfterPentecost;
        var sundaysAfterPentecost = 24 + (parseInt(match[1], 10) - pentecost24);
        return moment(dates.pentecost).add(sundaysAfterPentecost, 'weeks');
    }

    return null;
}

// ---- Header Dropdown Builder ----
function getLiturgicalSeasonGroup(key, uiLang) {
    if (!uiLang) uiLang = getUiLang();
    if (uiLang === 'fr') {
        if (/^Adv/.test(key)) return "Temps de l'Avent";
        if (/^Nat|^Dec2|^Jan1|^Jan5|^Epi/.test(key)) return 'Temps de Noël & Épiphanie';
        if (/^[765]a|^Quad/.test(key)) return 'Septuagésime & Carême';
        if (/^Pasc|^Asc|^Pent0$/.test(key)) return 'Temps Pascal';
        if (/^Pent|^Corpus|^SCJ|^ChristusRex/.test(key)) return 'Temps après la Pentecôte';
        return 'Propre du Temps';
    }
    if (uiLang === 'en') {
        if (/^Adv/.test(key)) return 'Advent Season';
        if (/^Nat|^Dec2|^Jan1|^Jan5|^Epi/.test(key)) return 'Christmas & Epiphany Season';
        if (/^[765]a|^Quad/.test(key)) return 'Septuagesima & Lent';
        if (/^Pasc|^Asc|^Pent0$/.test(key)) return 'Easter Season';
        if (/^Pent|^Corpus|^SCJ|^ChristusRex/.test(key)) return 'Season after Pentecost';
        return 'Proper of Time';
    }
    if (/^Adv/.test(key)) return 'Tempus Adventus';
    if (/^Nat|^Dec2|^Jan1|^Jan5|^Epi/.test(key)) return 'Tempus Nativitatis & Epiphaniæ';
    if (/^[765]a|^Quad/.test(key)) return 'Tempus Septuagesimæ & Quadragesimæ';
    if (/^Pasc|^Asc|^Pent0$/.test(key)) return 'Tempus Paschale';
    if (/^Pent|^Corpus|^SCJ|^ChristusRex/.test(key)) return 'Tempus post Pentecosten';
    return 'Proprium Temporum';
}

function getSanctoralMonthGroup(key, uiLang) {
    if (!uiLang) uiLang = getUiLang();
    var m = (key || '').substring(0, 3);
    var monthMap = {
        Jan: { fr: 'Janvier', en: 'January', la: 'Januarius', es: 'Enero' },
        Feb: { fr: 'Février', en: 'February', la: 'Februarius', es: 'Febrero' },
        Mar: { fr: 'Mars', en: 'March', la: 'Martius', es: 'Marzo' },
        Apr: { fr: 'Avril', en: 'April', la: 'Aprilis', es: 'Abril' },
        May: { fr: 'Mai', en: 'May', la: 'Maius', es: 'Mayo' },
        Jun: { fr: 'Juin', en: 'June', la: 'Junius', es: 'Junio' },
        Jul: { fr: 'Juillet', en: 'July', la: 'Julius', es: 'Julio' },
        Aug: { fr: 'Août', en: 'August', la: 'Augustus', es: 'Agosto' },
        Sep: { fr: 'Septembre', en: 'September', la: 'September', es: 'Septiembre' },
        Oct: { fr: 'Octobre', en: 'October', la: 'October', es: 'Octubre' },
        Nov: { fr: 'Novembre', en: 'November', la: 'November', es: 'Noviembre' },
        Dec: { fr: 'Décembre', en: 'December', la: 'December', es: 'Diciembre' }
    };
    var obj = monthMap[m];
    if (!obj) return (uiLang === 'fr' ? 'Sanctoral' : (uiLang === 'en' ? 'Proper of Saints' : 'Proprium Sanctorum'));
    return obj[uiLang] || obj['fr'] || obj['la'];
}

var DO_UNIFIED_TITLES = {
    "fr": {
        "Adv1": "1er Dimanche de l'Avent",
        "Adv2": "2e Dimanche de l'Avent",
        "Adv3": "3e Dimanche de l'Avent (Gaudete)",
        "Adv3w": "Mercredi des Quatre-Temps de l'Avent",
        "Adv3f": "Vendredi des Quatre-Temps de l'Avent",
        "Adv3s": "Samedi des Quatre-Temps de l'Avent",
        "Adv3ss": "Samedi des Quatre-Temps de l'Avent (forme brève)",
        "Adv4": "4e Dimanche de l'Avent",
        "Dec24": "Vigile de la Nativité",
        "Dec25_1": "Nativité de Notre Seigneur (Messe de Minuit)",
        "Dec25_2": "Nativité de Notre Seigneur (Messe de l'Aurore)",
        "Dec25_3": "Nativité de Notre Seigneur (Messe du Jour)",
        "Nat1": "Dimanche dans l'Octave de la Nativité",
        "Jan1": "Octava Nativitatis (Circumcisione Domini)",
        "Nat2": "Le Saint Nom de Jésus",
        "Jan5a": "In Vigilia Epiphaniæ",
        "Epi": "Epiphania",
        "Epi1": "Fête de la Sainte Famille (1er Dimanche après l'Épiphanie)",
        "Epi1s": "  Feria post I post Epiphaniam",
        "Epi2": "2e Dimanche après l'Épiphanie",
        "Epi3": "3e Dimanche après l'Épiphanie",
        "Epi4": "4e Dimanche après l'Épiphanie",
        "Epi5": "5e Dimanche après l'Épiphanie",
        "Epi6": "6e Dimanche après l'Épiphanie",
        "7a": "Septuagesima",
        "6a": "Sexagesima",
        "5a": "Quinquagesima",
        "5aw": "Feria IV Cinerum",
        "5ah": "  Feria V post Cinerum",
        "5af": "  Feria VI post Cinerum",
        "5as": "  Sabbato post Cinerum",
        "Quad1": "1er Dimanche de Carême",
        "Quad1m": "  Feria II post Dominicam I Quadragesimæ",
        "Quad1t": "  Feria III post Dominicam I Quadragesimæ",
        "Quad1w": "Mercredi des Quatre-Temps de Carême",
        "Quad1h": "  Feria V post Dominicam I Quadragesimæ",
        "Quad1f": "Vendredi des Quatre-Temps de Carême",
        "Quad1s": "Samedi des Quatre-Temps de Carême",
        "Quad1ss": "  Sabbato IV Temporum (forma brevior)",
        "Quad2": "2e Dimanche de Carême",
        "Quad2m": "  Feria II post Dominicam II Quadragesimæ",
        "Quad2t": "  Feria III post Dominicam II Quadragesimæ",
        "Quad2w": "  Feria IV post Dominicam II Quadragesimæ",
        "Quad2h": "  Feria V post Dominicam II Quadragesimæ",
        "Quad2f": "  Feria VI post Dominicam II Quadragesimæ",
        "Quad2s": "  Sabbato post Dominicam II Quadragesimæ",
        "Quad3": "3e Dimanche de Carême",
        "Quad3m": "  Feria II post Dominicam III Quadragesime",
        "Quad3t": "  Feria III post Dominicam III Quadragesimæ",
        "Quad3w": "  Feria IV post Dominicam III Quadragesimæ",
        "Quad3h": "  Feria V post Dominicam III Quadragesimæ",
        "Quad3f": "  Feria VI post Dominicam III Quadragesimæ",
        "Quad3s": "  Sabbato post Dominicam III Quadragesimæ",
        "Quad4": "4e Dimanche de Carême (Lætare)",
        "Quad4m": "  Feria II post Dominicam IV Quadragesime",
        "Quad4t": "  Feria III post Dominicam IV Quadragesimæ",
        "Quad4w": "  Feria IV post Dominicam IV Quadragesimæ",
        "Quad4h": "  Feria V post Dominicam IV Quadragesimæ",
        "Quad4f": "  Feria VI post Dominicam IV Quadragesimæ",
        "Quad4s": "  Sabbato post Dominicam IV Quadragesimæ",
        "Quad5": "Dimanche de la Passion",
        "Quad5m": "  Feria II post Dominicam I Passionis",
        "Quad5t": "  Feria III post Dominicam I Passionis",
        "Quad5w": "  Feria IV post Dominicam I Passionis",
        "Quad5h": "  Feria V post Dominicam I Passionis",
        "Quad5f": "  Feria VI post Dominicam I Passionis",
        "Quad5f_sd": "  Feria VI: Septem Dolorum beatæ Mariæ Virginis",
        "Quad5s": "  Sabbato post Dominicam I Passionis",
        "Quad6": "Dimanche des Rameaux",
        "Quad6_v": "Dominica in Palmis (ante 1955)",
        "Quad6m": "  Feria II Hebdomadæ Sanctæ",
        "Quad6t": "  Feria III Hebdomadæ Sanctæ",
        "Quad6t_v": "  Feria III Hebdomadæ Sanctæ (ante 1955)",
        "Quad6w": "  Feria IV Hebdomadæ Sanctæ",
        "Quad6w_v": "  Feria IV Hebdomadæ Sanctæ (ante 1955)",
        "Quad6h": "Feria V in Cena Domini",
        "Quad6h_v": "Feria V in Cena Domini (ante 1955)",
        "Quad6h-lotio": "  Antiphonæ ad Lotionem Pedum",
        "Quad6f": "Feria VI in Passione et Morte Domini",
        "Quad6f_v": "Feria VI in Parasceve (ante 1955)",
        "Quad6s": "Vigilia Paschalis",
        "Quad6s_v": "Vigilia Paschalis (ante 1955)",
        "Pasc0": "Dimanche de Pâques (Résurrection du Seigneur)",
        "Pasc0m": "Lundi de Pâques",
        "Pasc0t": "Mardi de Pâques",
        "Pasc0w": "Feria IV in Oct Paschæ",
        "Pasc0h": "Feria V in Oct Paschæ",
        "Pasc0f": "Feria VI in Oct Paschæ",
        "Pasc0s": "Sabbato in Oct Paschæ",
        "Pasc1": "Dimanche in Albis (Quasimodo)",
        "Pasc2": "2e Dimanche après Pâques (du Bon Pasteur)",
        "Pasc2w": "S. Joseph Sponsi B. Mariæ V.",
        "Pasc3": "3e Dimanche après Pâques",
        "Pasc4": "4e Dimanche après Pâques",
        "Pasc5": "5e Dimanche après Pâques",
        "Asc": "Ascension de Notre Seigneur",
        "Pasc6": "Dimanche après l'Ascension",
        "Pasc6s": "Sabbato in Vigilia Pentecostes",
        "Pasc6s_v": "Sabbato in Vigilia Pentecostes (ante 1955)",
        "Pent0": "Dimanche de la Pentecôte",
        "Pent0m": "Lundi de la Pentecôte",
        "Pent0t": "Mardi de la Pentecôte",
        "Pent0w": "Mercredi des Quatre-Temps de la Pentecôte",
        "Pent0h": "Feria V in Oct Pentecostes",
        "Pent0f": "Vendredi des Quatre-Temps de la Pentecôte",
        "Pent0s": "Samedi des Quatre-Temps de la Pentecôte",
        "Pent0ss": "Sabbato IV Temporum (forma brevior)",
        "Pent1": "Fête de la Très Sainte Trinité",
        "Pent1w": "  Feria post 1 post Pentecosten",
        "CorpusChristi": "Fête-Dieu (Très Saint Sacrement)",
        "Pent2": "2e Dimanche après la Pentecôte (dans l'Octave de la Fête-Dieu)",
        "SCJ": "Fête du Sacré-Cœur de Jésus",
        "Pent3": "3e Dimanche après la Pentecôte (dans l'Octave du Sacré-Cœur)",
        "Pent4": "4e Dimanche après la Pentecôte",
        "Pent5": "5e Dimanche après la Pentecôte",
        "Pent6": "6e Dimanche après la Pentecôte",
        "Pent7": "7e Dimanche après la Pentecôte",
        "Pent8": "8e Dimanche après la Pentecôte",
        "Pent9": "9e Dimanche après la Pentecôte",
        "Pent10": "10e Dimanche après la Pentecôte",
        "Pent11": "11e Dimanche après la Pentecôte",
        "Pent12": "12e Dimanche après la Pentecôte",
        "Pent13": "13e Dimanche après la Pentecôte",
        "Pent14": "14e Dimanche après la Pentecôte",
        "Pent15": "15e Dimanche après la Pentecôte",
        "Pent16": "16e Dimanche après la Pentecôte",
        "Pent17": "17e Dimanche après la Pentecôte",
        "EmbWedSept": "Mercredi des Quatre-Temps de Septembre",
        "EmbFriSept": "Vendredi des Quatre-Temps de Septembre",
        "EmbSatSept": "Samedi des Quatre-Temps de Septembre",
        "EmbSatSeptS": "Sabbato IV Temporum (forma brevior)",
        "Pent18": "18e Dimanche après la Pentecôte",
        "Pent19": "19e Dimanche après la Pentecôte",
        "Pent20": "20e Dimanche après la Pentecôte",
        "Pent21": "21e Dimanche après la Pentecôte",
        "Pent22": "22e Dimanche après la Pentecôte",
        "ChristusRex": "Fête de Notre Seigneur Jésus-Christ Roi",
        "Pent23": "23e Dimanche après la Pentecôte",
        "PentEpi3": "3e Dimanche anticipé après l'Épiphanie",
        "PentEpi4": "4e Dimanche anticipé après l'Épiphanie",
        "PentEpi5": "5e Dimanche anticipé après l'Épiphanie",
        "PentEpi6": "6e Dimanche anticipé après l'Épiphanie",
        "Pent24": "24e et Dernier Dimanche après la Pentecôte",
        "nuptialis": "Messe de Mariage (Missa pro Sponso et Sponsa)",
        "defunctorum": "Messe des Morts (Requiem)",
        "dedicatio": "Dédicace de l'Église",
        "litaniis": "Ad Litaniis Maj. et Min.",
        "votiveST": "Messe votive de la Sainte Trinité",
        "votiveA": "Messe votive des Saints Anges",
        "votiveJ": "Messe votive de Saint Joseph",
        "votivePP": "Messe votive des Saints Pierre et Paul",
        "votiveOA": "Messe votive de tous les Saints Apôtres",
        "votiveSS": "Messe votive du Saint-Esprit",
        "votiveSES": "Messe votive du Très Saint Sacrement",
        "votiveJCSES": "Messe votive du Christ Prêtre Éternel",
        "votiveSC": "Messe votive de la Sainte Croix",
        "votivePJC": "Messe votive de la Passion de Notre Seigneur",
        "votiveSCJ": "Messe votive du Sacré-Cœur de Jésus",
        "SMadvent": "Ab Adventu usque ad Nativitatem",
        "SMchristmas": "A Nativitate usque ad Purificationem",
        "SMlent": "A Purificatione usque ad Pascha",
        "SMeaster": "A Pascha usque ad Pentecosten",
        "SMpentecost": "A Pentecoste usque ad Adventum",
        "Aug22": "Fête du Cœur Immaculé de Marie",
        "votiveECJ": "De Eucharistico Corde Jesu",
        "mass_vigil_apostle": "In Vigiliis Apostolorum (Ego autem sicut)",
        "mass_holy_pope": "Commune Summorum Pontificum (Si diligis me)",
        "mass_i_martyr_bishop": "Missa I (Statuit)",
        "mass_ii_martyr_bishop": "Missa II (Sacerdotes Dei)",
        "mass_i_martyr_not_bishop": "Missa I (In virtute tua)",
        "mass_ii_martyr_not_bishop": "Missa II (Laetabitur justus)",
        "mass_one_martyr": "Pro uno Martyre (Protexisti me)",
        "mass_two_or_more_martyr": "Pro pluribus Martyribus (Sancti tui)",
        "mass_i_two_or_more_martyr": "Missa I (Intret in conspectu)",
        "mass_ii_two_or_more_martyr": "Missa II (Sapientiam sanctorum)",
        "mass_iii_two_or_more_martyr": "Missa III (Salus autem)",
        "mass_i_confessor_bishop": "Missa I (Statuit)",
        "mass_ii_confessor_bishop": "Missa II (Sacerdotes tui)",
        "mass_doctors": "Pro Doctoribus (In medio)",
        "mass_i_confessor_not_bishop": "Missa I (Os justi)",
        "mass_ii_confessor_not_bishop": "Missa II (Justus ut palma)",
        "mass_abbots": "Pro Abbatibus (Os justi)",
        "mass_i_virgin_martyr": "Pro Virgine et Martyre I (Loquebar)",
        "mass_ii_virgin_martyr": "Pro Virgine et Martyre II (Me exspectaverunt)",
        "mass_i_virgin_not_martyr": "Pro Virgine tantum I (Dilexisti)",
        "mass_ii_virgin_not_martyr": "Pro Virgine tantum II (Vultum tuum)",
        "mass_holy_woman_martyr": "Pro Martyre (Me exspectaverunt)",
        "mass_holy_woman_not_martyr": "Pro nec Virgine nec Martyre (Cognovi)",
        "Jan5": "S. Télesphore, Pape et Martyr",
        "Jan11": "S. Hygin, Pape et Martyr",
        "Jan13": "Baptême de Notre-Seigneur Jésus-Christ",
        "Jan14": "S. Hilaire Evêque et Confesseur Docteur de l'Eglise",
        "Jan15": "S. Paul, Premier Ermite et Confesseur",
        "Jan16": "S. Marcel Ier, Pape et Martyr",
        "Jan17": "S. Antoine, Abbé",
        "Jan18": "Chaire de Saint Pierre à Rome",
        "Jan19": "SS. Marius, Marthe, Audifax et Abacum Martyrs",
        "Jan20": "Saints Fabien et Sébastien, Martyrs",
        "Jan21": "Sainte Agnès, Vierge et Martyre",
        "Jan22": "Saints Vincent et Anastase, Martyrs",
        "Jan23": "S. Raymond de Peñafort, Confesseur",
        "Jan24": "S. Timothée, Évêque et Martyr",
        "Jan25": "In Conversione S. Pauli Apostoli",
        "Jan26": "S. Polycarpe, Évêque et Martyr",
        "Jan27": "S. Jean Chrysostome, Évêque et Docteur",
        "Jan28": "S. Petri Nolasci Confessoris",
        "Jan29": "S. François de Sales, Évêque et Docteur",
        "Jan30": "Sainte Martine, Vierge et Martyre",
        "Jan31": "S. Joannis Bosco Confessoris",
        "Feb1": "S. Ignatii Episcopi et Martyris",
        "Feb2": "Purification de la Bse Vierge Marie (Chandeleur)",
        "Feb3": "S. Blasii Episcopi et Martyris",
        "Feb4": "S. Andreæ Corsini Episcopi et Confessoris",
        "Feb5": "S. Agathæ Virginis et Martyris",
        "Feb6": "S. Titi Episcopi et Confessoris",
        "Feb7": "S. Romualdi Abbatis",
        "Feb8": "S. Joannis de Matha Confessoris",
        "Feb9": "S. Cyrilli Episc. Alexandrini Confessoris et Ecclesiæ Doctoris",
        "Feb10": "S. Scholasticæ Virginis",
        "Feb11": "Apparition de la Bse Vierge Marie à Lourdes",
        "Feb12": "Ss. Septem Fundatorum Ordinis Servorum B. M. V.",
        "Feb14": "S. Valentini Presbyteri et Martyris",
        "Feb15": "SS. Faustini et Jovitæ Martyrum",
        "Feb18": "S. Simeonis Episcopi et Martyris",
        "Feb18a": "S. Simeonis Episcopi et Martyris",
        "Feb22": "In Cathedra S. Petri Apostoli Antiochiæ",
        "Feb23": "S. Pierre Damien, Évêque, Confesseur et Docteur",
        "Feb23or24": "Feb 23 vel 24: In vigilia S Matthiæ",
        "Feb24or25": "S. Matthiæ Apostoli",
        "Feb27or28": "S. Gabrielis a Virgine Perdolente Confessoris",
        "Mar4": "S. Casimiri Confessoris",
        "Mar6": "Ss. Perpetuæ et Felicitatis Martyrum",
        "Mar7": "S. Thomæ de Aquino Confessoris et Ecclesiæ Doctoris",
        "Mar8": "S. Joannis de Deo Confessoris",
        "Mar9": "S. Franciscæ Romanæ Viduæ",
        "Mar10": "Ss. Quadraginta Martyrum",
        "Mar12": "S. Gregorii Papæ Confessoris et Ecclesiæ Doctoris",
        "Mar17": "S. Patrick Évêque et Confesseur",
        "Mar18": "S. Cyrille Évêque de Jérusalem Confesseur et Docteur de l'Église",
        "Mar21": "S. Benedicti Abbatis",
        "Mar24": "S. Gabrielis Archangeli",
        "Mar27": "S. Joannis Damasceni Confessoris",
        "Mar28": "S. Joannis a Capistrano Confessoris",
        "Apr2": "S. Francisci de Paula Confessoris",
        "Apr4": "S. Isidori Episcopi Confessoris et Ecclesiæ Doctoris",
        "Apr5": "S. Vincentii Ferrerii Confessoris",
        "Apr11": "S. Leonis I Papæ Confessoris et Ecclesiæ Doctoris",
        "Apr13": "S. Hermenegildi Martyris",
        "Apr14": "S. Justini Martyris",
        "Apr17": "S. Aniceti Papæ et Martyris",
        "Apr21": "S. Anselmi Episcopi Confessoris et Ecclesiæ Doctoris",
        "Apr22": "Saints Soter et Caius, Souverains Pontifs et Martyrs",
        "Apr23": "S. Georgii Martyris",
        "Apr24": "S. Fidelis de Sigmaringa Martyris",
        "Apr25": "S. Marc Evangeliste",
        "Apr26": "Sts Clet et Marcellin Souverin Pontifes et Martyrs",
        "Apr27": "S. Pierre Canisius Confesseur et Docteur de l'Eglise",
        "Apr28": "S. Pauli a Cruce Confessoris",
        "Apr29": "S. Pierre Martyr",
        "Apr30": "S. Catharinæ Senensis Virginis",
        "May2": "SAINT ATHANASE, ÉVÊQUE, CONFES. ET DOCT. DE L’ÉGLISE",
        "May3": "In Inventione S Crucis",
        "May4": "S. Monique Veuve",
        "May5": "S. Pii V Papæ et Confessoris",
        "May6": "S. Joannis Apostoli ante Portam Latinam",
        "May7": "S. Stanislai Episcopi et Martyris",
        "May8": "In Apparitione S. Michaelis Archangeli",
        "May9": "Saint Grégoire de Nazianze, Évêque, Confesseur et Docteur de l'Église",
        "May10": "Saint Antonin Évêque et Confesseur",
        "May11": "Saints Philippe et Jacques, Apôtres",
        "May12": "Saints Nérée, Achille, la Vierge Domitille et Pancrace, Martyrs",
        "May13": "Saint Robert Bellarmin, Évêque, Confesseur et Docteur de l’Église",
        "May14": "Saint Boniface Martyr",
        "May15": "S. Joannis Baptistæ de la Salle Confessoris",
        "May16": "Saint Ubald, Évêque et Confesseur",
        "May17": "Saint Pascal Baylon Confesseur",
        "May18": "S. Venantii Martyris",
        "May19": "S. Pierre Celestin Pape et Confesseur",
        "May20": "S. Bernardin de Sienne, Confesseur",
        "May24": "Notre-Dame Auxiliatrice",
        "May25": "S. Gregoire VII Pape et Confesseur",
        "May26": "S. Philippe Néri Confesseur",
        "May27": "S. Bède le Vénérable, Confesseur et Docteur de l’Église",
        "May28": "St Augustin de Cantorbéry, évêque et confesseur",
        "May29": "S. Marie-Madeleine de Pazzi, Vierge",
        "May30": "S. Felix Ier Pape et Martyr",
        "May31": "La Bienheureuse Vierge Marie Reine",
        "Jun1": "S. Angèle Mérici, Vierge",
        "Jun2": "Ss. Marcellin, Pierre et Erasme, Martyrs",
        "Jun4": "S. François Caracciolo, Confesseur",
        "Jun5": "S. Boniface Évêque et Martyr",
        "Jun6": "S. Norbert Evêque et Confesseur",
        "Jun9": "Ss. Prime et Félicien Martyrs",
        "Jun10": "S. Marguerite Reine et Veuve",
        "Jun11": "S. Barnabé Apôtre",
        "Jun12": "S. Jean de S. Facond Confesseur",
        "Jun13": "S. Antoine de Padoue Confesseur",
        "Jun14": "S. Basile le Grand, Confesseur et Docteur de l’Église",
        "Jun15": "Ss. Guy, Modeste et Crescence, Martyrs",
        "Jun17": "S. Grégoire Barbarigo, Évêque et Confesseur",
        "Jun18": "S. Éphrem le Syrien, Confesseur et Docteur de l’Église",
        "Jun19": "S. Julienne de Falconieri, Vierge",
        "Jun19a": "S. Julienne de Falconieri, Vierge",
        "Jun20": "S. Silvère, Pape et Martyr",
        "Jun21": "S. Louis de Gonzague, Confesseur",
        "Jun22": "S. Paulin de Nole, Évêque et Confesseur",
        "Jun23": "Vigile de la Nativité de S. Jean-Baptiste",
        "Jun24": "Nativité de Saint Jean-Baptiste",
        "Jun25": "S. Guillaume, Abbé",
        "Jun26": "Ss. Jean et Paul, Martyrs",
        "Jun28": "S. Irénée, Évêque et Martyr",
        "Jun29": "Les Ss. Apôtres Pierre et Paul",
        "Jun30": "En la Commémoraison de l’Apôtre S. Paul",
        "Jul1": "Le Très Précieux Sang de Notre Seigneur Jésus-Christ",
        "Jul2": "La Visitation de la Bse Vierge Marie",
        "Jul3": "S. Léon, Pape et Confesseur",
        "Jul3a": "S. Léon, Pape et Confesseur",
        "Jul4": "Dans l'Octave des Saints Apôtres Pierre et Paul",
        "Jul5": "S. Antoine Marie Zaccaria, Confesseur",
        "Jul6": "Octave des Ss. Apôtres Pierre et Paul",
        "Jul7": "Ss Cyrille et Méthode, Évêques et Confesseurs",
        "Jul8": "Ste Élisabeth, Reine du Portugal, Veuve",
        "Jul10": "Les saints Sept Frères Martys, et les saintes Rufine et Seconde, Vierges et Martyres",
        "Jul11": "S. Pie Ier, Pape et Martyr",
        "Jul12": "S. Jean Gualbert, Abbé",
        "Jul13": "S. Anaclet, Pape et Martyr",
        "Jul14": "S. Bonaventure, Évêque, Confesseur et Docteur de l’Église",
        "Jul15": "S. Henri, Empereur et Confesseur",
        "Jul16": "Notre-Dame du Mont-Carmel",
        "Jul17": "S. Alexis, Confesseur",
        "Jul18": "S. Camille de Lellis, Confesseur",
        "Jul19": "S. Vincent de Paul, Confesseur",
        "Jul20": "S. Jérôme Émilien, Confesseur",
        "Jul21": "Ste Praxède, Vierge",
        "Jul21a": "Ste Praxède, Vierge",
        "Jul22": "Ste Marie-Madeleine, pénitente",
        "Jul23": "S. Apollinaire, Évêque et Martyr",
        "Jul24": "Vigile de S. Jacques, Apôtre",
        "Jul25": "S. Jacques, Apôtre",
        "Jul26": "Ste Anne, mère de la T.S. Vierge Marie",
        "Jul27": "S. Pantaléon, Martyr",
        "Jul28": "Ss Nazaire et Celse, Martyrs, Victor, Pape et Martyr et Innocent Ier, Pape et Confesseur",
        "Jul29": "Ste Marthe, Vierge",
        "Jul30": "Ss Abdon et Sennen, Martyrs",
        "Jul31": "S. Ignace, Confesseur",
        "Aug1": "S. Pierre aux Liens",
        "Aug1a": "S. Pierre aux Liens",
        "Aug2": "S. Alphonse Marie de Liguori, Évêque, Confesseur et Docteur de l’Église",
        "Aug3": "Invention de S. Étienne, Premier Martyr",
        "Aug4": "S. Dominique, Confesseur",
        "Aug5": "Dédicace de la Basilique Sainte-Marie-Majeure (Notre-Dame des Neiges)",
        "Aug6": "La Transfiguration de Notre-Seigneur",
        "Aug7": "S. Gaétan de Thiène, Confesseur",
        "Aug8": "Ss Cyriaque, Large et Smaragde, Martyrs",
        "Aug8a": "Ss Cyriaque, Large et Smaragde, Martyrs",
        "Aug9": "S. Jean-Marie Vianney, Confesseur",
        "Aug10": "S. Laurent, Martyr",
        "Aug11": "Ss Tiburce et Suzanne, Vierge, Martyrs",
        "Aug12": "Ste Claire, Vierge",
        "Aug13": "Ss, Hippolyte et Cassien, Martyrs",
        "Aug14": "Vigile de l'Assomption de la Bse Vierge Marie",
        "Aug15": "L'Assomption de la Bienheureuse Vierge Marie",
        "Aug16": "St Joachim, père de la B. V. M.",
        "Aug17": "S. Hyacinthe, Confesseur",
        "Aug18": "S. Agapit, Martyr",
        "Aug19": "S. Jean Eudes, Confesseur",
        "Aug20": "S. Bernard, Abbé et Docteur de l’Église",
        "Aug21": "Ste Jeanne-Françoise Frémiot de Chantal, Veuve",
        "Aug23": "S. Philippe Beniti, Confesseur",
        "Aug24": "S. Barthélemy, Apôtre",
        "Aug25": "S. Louis, Roi et Confesseur",
        "Aug26": "S. Zéphyrin, Pape et Martyr",
        "Aug27": "S. Joseph Calasanz, Confesseur",
        "Aug28": "S. Augustin, Évêque, Confesseur et Docteur de l’Église",
        "Aug29": "Décollation de S. Jean-Baptiste",
        "Aug30": "Sainte Rose de Lima, Vierge",
        "Aug31": "S. Raymond Nonnat, Confesseur",
        "Sep1": "S. Gilles, Abbé",
        "Sep2": "S. Étienne, Roi et Confesseur",
        "Sep3": "S. Pie X, Pape et Confesseur",
        "Sep5": "S. Laurent Justinien, Évêque et Confesseur",
        "Sep8": "Nativité de la Bienheureuse Vierge Marie",
        "Sep9": "S. Gorgon, Martyr",
        "Sep9a": "S. Pierre Claver, Confesseur",
        "Sep10": "S. Nicolas de Tolentino, Confesseur",
        "Sep11": "Saints Prote et Hyacinthe, Martyrs",
        "Sep12": "Le Très Saint Nom de Marie",
        "Sep14": "L'Exaltation de la Sainte Croix",
        "Sep15": "Les Sept Douleurs de la Bse Vierge Marie",
        "Sep16": "Ss Corneille, Pape, et Cyprien, Évêque, Martyrs",
        "Sep17": "Impression des Stigmates de Saint François",
        "Sep18": "S. Joseph de Cupertino, Confesseur",
        "Sep19": "St Janvier, Evêque, et ses Compagnons, Martyrs",
        "Sep19laSalette": "Notre-Dame de La Salette",
        "Sep20": "St Eustache et ses compagnons, Martyrs",
        "Sep21": "St Matthieu, Apôtre et Evangéliste",
        "Sep22": "St Thomas de Villeneuve, Evêque et Confesseur",
        "Sep23": "St Lin, Pape et Martyr",
        "Sep24": "Notre-Dame de la Merci",
        "Sep26": "St Cyprien et Ste Justine, Martyrs",
        "Sep26a": "Saints Isaac Jogues, Jean de Brébeuf et leurs Compagnons",
        "Sep27": "Sts Côme et Damien, Martyrs",
        "Sep28": "St Wenceslas, Duc et Martyr",
        "Sep29": "Dédicace de St Michel, Archange",
        "Sep30": "St Jérôme, Confesseur et Docteur de l'Eglise",
        "Oct1": "Saint Rémi, Evêque et Confesseur",
        "Oct2": "Sts Anges Gardiens",
        "Oct3": "Ste Thérèse de l’Enfant Jésus, vierge et docteur de l’Eglise",
        "Oct4": "St François d’Assise, Confesseur",
        "Oct5": "St Placide et ses Compagnons, Martyrs",
        "Oct6": "St Bruno, Confesseur",
        "Oct7": "Le Très Saint Rosaire de la Bse Vierge Marie",
        "Oct8": "Ste Brigitte, Veuve",
        "Oct9": "St Jean Léonardi, Confesseur",
        "Oct10": "St François de Borgia, Confesseur",
        "Oct11": "Maternité de la Bienheureuse Vierge Marie",
        "Oct13": "St Edouard, Roi et Confesseur",
        "Oct14": "St Calixte Ier, Pape et Martyr",
        "Oct15": "Ste Thérèse, Vierge",
        "Oct16": "Ste Hedwige, Veuve",
        "Oct17": "Ste Marguerite-Marie Alacoque, Vierge",
        "Oct18": "St Luc, Evangéliste",
        "Oct19": "St Pierre d’Alcantara, Confesseur",
        "Oct20": "St Jean de Kenty, Confesseur",
        "Oct21": "St Hilarion, Abbé",
        "Oct23": "St Antoine-Marie Claret, Évêque et Confesseur",
        "Oct24": "St Raphaël, Archange",
        "Oct25": "Sts Chrysanthe et Darie, Martyrs",
        "Oct26": "St Evariste, Pape et Martyr",
        "Oct27": "Vigile des Sts Simon et Jude, Apôtres",
        "Oct28": "Sts Simon et Jude, Apôtres",
        "Oct31": "Vigile de la fête de tous les Saints",
        "Nov1": "Tous les Saints",
        "Nov2": "Commémoration de tous les fidèles défunts",
        "Nov4": "St Charles Evêque et Confesseur",
        "Nov5": "Fête des Saintes Reliques",
        "Nov8": "Dans l'octave de la Toussaint",
        "Nov9": "Dédicace de la Basilique du Latran",
        "Nov10": "St. André Avellin Confesseur",
        "Nov11": "St Martin, Evêque et Confesseur",
        "Nov12": "S. Martin Ier, Pape et Martyr",
        "Nov13": "S. Didace Confesseur",
        "Nov14": "St. Josaphat Evêque et Martyrs",
        "Nov15": "St. Albert le Grand, Evêque Confesseur et Docteur de l'Eglise",
        "Nov16": "Ste Gertrude Vierge",
        "Nov17": "St. Grégoire Thaumaturge Evêque et Confesseur",
        "Nov18": "Dédicace des Basiliques des Saints Pierre et Paul",
        "Nov19": "Ste. Elisabeth Veuve",
        "Nov20": "St. Félix de Valois Confesseur",
        "Nov21": "Présentation de la Bienheureuse Vierge Marie",
        "Nov22": "Ste Cécile Vierge et Martyre",
        "Nov23": "St Clément Ier Pape et Martyr",
        "Nov24": "St. Jean de la Croix Confesseur et Docteur de l'Eglise",
        "Nov25": "Ste Catherine Vierge et Martyre",
        "Nov26": "St Silvestre Abbé",
        "Nov27": "Notre-Dame de la Médaille Miraculeuse",
        "Nov29": "Vigile de St André Apôtre (ou S. Saturnin)",
        "Nov30": "St André Apôtre",
        "Dec2": "Ste Bibiane Vierge et Martyre",
        "Dec3": "S. François Xavier Confesseur",
        "Dec4": "St Pierre Chrysologue Evêque Confesseur et Docteur de l'Eglise",
        "Dec5": "St Sabba Abbé",
        "Dec6": "St Nicolas Evêque et Confesseur",
        "Dec7": "St Ambroise Evêque Confesseur et Docteur de l'Eglise",
        "Dec8": "Immaculée Conception de la Vierge Marie",
        "Dec10": "Saint Melchiade, Pape et Martyr",
        "Dec11": "Saint Damase Ier, Pape et Confesseur",
        "Dec12": "Notre-Dame de Guadalupe",
        "Dec13": "Sainte Lucie, Vierge et Martyre",
        "Dec16": "Saint Eusèbe, Évêque et Martyr",
        "Dec20": "Vigile de Saint Thomas, Apôtre",
        "Dec21": "Saint Thomas, Apôtre",
        "Dec26": "Saint Étienne, Premier Martyr",
        "Dec27": "Saint Jean, Apôtre et Évangéliste",
        "Dec28": "Les Saints Innocents, Martyrs",
        "Dec29": "Saint Thomas de Cantorbéry, Évêque et Martyr",
        "Dec31": "Saint Sylvestre Ier, Pape et Confesseur",
        "Dec31_v": "Saint Sylvestre Ier, Pape et Confesseur",
        "Quad": "Septuagesima usque ad Finem Quadragesimæ",
        "Pasch": "Tempus Paschale",
        "Nat0": "Vigile de la Nativité",
        "Quadp1": "Dimanche de la Septuagésime",
        "Quadp2": "Dimanche de la Sexagésime",
        "Quadp3": "Dimanche de la Quinquagésime",
        "Quadw": "Mercredi des Cendres",
        "HolyThurs": "Jeudi Saint (In Cœna Domini)",
        "GoodFri": "Vendredi Saint (In Parasceve)",
        "HolySat": "Samedi Saint (Vigile Pascale)",
        "Dec25": "Nativité de Notre Seigneur (Noël)",
        "Dec25a": "Nativité de Notre Seigneur (Messe de Minuit)",
        "Dec25b": "Nativité de Notre Seigneur (Messe de l'Aurore)",
        "Dec25c": "Nativité de Notre Seigneur (Messe du Jour)",
        "Dominica I Adventus": "1er Dimanche de l'Avent",
        "Dominica II Adventus": "2e Dimanche de l'Avent",
        "Dominica III Adventus": "3e Dimanche de l'Avent (Gaudete)",
        "Dominica IV Adventus": "4e Dimanche de l'Avent"
    },
    "la": {
        "Adv1": "Dominica I Adventus",
        "Adv2": "Dominica II Adventus",
        "Adv3": "Dominica III Adventus (Gaudete)",
        "Adv3w": "Feria Quarta IV Temporum Adventus",
        "Adv3f": "Feria Sexta IV Temporum Adventus",
        "Adv3s": "Sabbato IV Temporum Adventus",
        "Adv3ss": "Sabbato IV Temporum (forma brevior)",
        "Adv4": "Dominica IV Adventus",
        "Dec24": "pridie Nativitas",
        "Dec25_1": "Nativitas Domini, Missa ad media noctem",
        "Dec25_2": "Nativitas Domini, Missa ad matutinam",
        "Dec25_3": "Nativitas Domini, Missa interdiu",
        "Nat1": "Dominica infra Octavam Nativitatis",
        "Jan1": "Octava Nativitatis (Circumcisione Domini)",
        "Nat2": "Sanctissimi Nominis Jesu",
        "Jan5a": "In Vigilia Epiphaniæ",
        "Epi": "Epiphania",
        "Epi1": "Sanctæ Familiæ Jesu, Mariæ, Joseph",
        "Epi1s": "  Feria post I post Epiphaniam",
        "Epi2": "Dominica II post Epiphaniam",
        "Epi3": "Dominica III post Epiphaniam",
        "Epi4": "Dominica IV post Epiphaniam",
        "Epi5": "Dominica V post Epiphaniam",
        "Epi6": "Dominica VI post Epiphaniam",
        "7a": "Septuagesima",
        "6a": "Sexagesima",
        "5a": "Quinquagesima",
        "5aw": "Feria IV Cinerum",
        "5ah": "  Feria V post Cinerum",
        "5af": "  Feria VI post Cinerum",
        "5as": "  Sabbato post Cinerum",
        "Quad1": "Dominica I in Quadragesima",
        "Quad1m": "  Feria II post Dominicam I Quadragesimæ",
        "Quad1t": "  Feria III post Dominicam I Quadragesimæ",
        "Quad1w": "Feria Quarta IV Temporum Quadragesimæ",
        "Quad1h": "  Feria V post Dominicam I Quadragesimæ",
        "Quad1f": "Feria Sexta IV Temporum Quadragesimæ",
        "Quad1s": "Sabbato IV Temporum Quadragesimæ",
        "Quad1ss": "  Sabbato IV Temporum (forma brevior)",
        "Quad2": "Dominica II in Quadragesima",
        "Quad2m": "  Feria II post Dominicam II Quadragesimæ",
        "Quad2t": "  Feria III post Dominicam II Quadragesimæ",
        "Quad2w": "  Feria IV post Dominicam II Quadragesimæ",
        "Quad2h": "  Feria V post Dominicam II Quadragesimæ",
        "Quad2f": "  Feria VI post Dominicam II Quadragesimæ",
        "Quad2s": "  Sabbato post Dominicam II Quadragesimæ",
        "Quad3": "Dominica III in Quadragesima",
        "Quad3m": "  Feria II post Dominicam III Quadragesime",
        "Quad3t": "  Feria III post Dominicam III Quadragesimæ",
        "Quad3w": "  Feria IV post Dominicam III Quadragesimæ",
        "Quad3h": "  Feria V post Dominicam III Quadragesimæ",
        "Quad3f": "  Feria VI post Dominicam III Quadragesimæ",
        "Quad3s": "  Sabbato post Dominicam III Quadragesimæ",
        "Quad4": "Dominica IV in Quadragesima (Lætare)",
        "Quad4m": "  Feria II post Dominicam IV Quadragesime",
        "Quad4t": "  Feria III post Dominicam IV Quadragesimæ",
        "Quad4w": "  Feria IV post Dominicam IV Quadragesimæ",
        "Quad4h": "  Feria V post Dominicam IV Quadragesimæ",
        "Quad4f": "  Feria VI post Dominicam IV Quadragesimæ",
        "Quad4s": "  Sabbato post Dominicam IV Quadragesimæ",
        "Quad5": "Dominica I Passionis",
        "Quad5m": "  Feria II post Dominicam I Passionis",
        "Quad5t": "  Feria III post Dominicam I Passionis",
        "Quad5w": "  Feria IV post Dominicam I Passionis",
        "Quad5h": "  Feria V post Dominicam I Passionis",
        "Quad5f": "  Feria VI post Dominicam I Passionis",
        "Quad5f_sd": "  Feria VI: Septem Dolorum beatæ Mariæ Virginis",
        "Quad5s": "  Sabbato post Dominicam I Passionis",
        "Quad6": "Dominica II Passionis seu in Palmis",
        "Quad6_v": "Dominica in Palmis (ante 1955)",
        "Quad6m": "  Feria II Hebdomadæ Sanctæ",
        "Quad6t": "  Feria III Hebdomadæ Sanctæ",
        "Quad6t_v": "  Feria III Hebdomadæ Sanctæ (ante 1955)",
        "Quad6w": "  Feria IV Hebdomadæ Sanctæ",
        "Quad6w_v": "  Feria IV Hebdomadæ Sanctæ (ante 1955)",
        "Quad6h": "Feria V in Cena Domini",
        "Quad6h_v": "Feria V in Cena Domini (ante 1955)",
        "Quad6h-lotio": "  Antiphonæ ad Lotionem Pedum",
        "Quad6f": "Feria VI in Passione et Morte Domini",
        "Quad6f_v": "Feria VI in Parasceve (ante 1955)",
        "Quad6s": "Vigilia Paschalis",
        "Quad6s_v": "Vigilia Paschalis (ante 1955)",
        "Pasc0": "Dominica Resurrectionis",
        "Pasc0m": "Feria Secunda infra Octavam Paschæ",
        "Pasc0t": "Feria Tertia infra Octavam Paschæ",
        "Pasc0w": "Feria IV in Oct Paschæ",
        "Pasc0h": "Feria V in Oct Paschæ",
        "Pasc0f": "Feria VI in Oct Paschæ",
        "Pasc0s": "Sabbato in Oct Paschæ",
        "Pasc1": "Dominica in Albis in Octava Paschæ",
        "Pasc2": "Dominica II post Pascha (Boni Pastoris)",
        "Pasc2w": "S. Joseph Sponsi B. Mariæ V.",
        "Pasc3": "Dominica III post Pascha",
        "Pasc4": "Dominica IV post Pascha",
        "Pasc5": "Dominica V post Pascha",
        "Asc": "In Ascensione Domini",
        "Pasc6": "Dominica post Ascensionem",
        "Pasc6s": "Sabbato in Vigilia Pentecostes",
        "Pasc6s_v": "Sabbato in Vigilia Pentecostes (ante 1955)",
        "Pent0": "Dominica Pentecostes",
        "Pent0m": "Feria Secunda infra Octavam Pentecostes",
        "Pent0t": "Feria Tertia infra Octavam Pentecostes",
        "Pent0w": "Feria Quarta IV Temporum Pentecostes",
        "Pent0h": "Feria V in Oct Pentecostes",
        "Pent0f": "Feria Sexta IV Temporum Pentecostes",
        "Pent0s": "Sabbato IV Temporum Pentecostes",
        "Pent0ss": "Sabbato IV Temporum (forma brevior)",
        "Pent1": "In Festo Sanctissimæ Trinitatis",
        "Pent1w": "  Feria post 1 post Pentecosten",
        "CorpusChristi": "Sanctissimi Corporis Christi",
        "Pent2": "Dominica II post Pentecosten",
        "SCJ": "Sacratissimi Cordis Jesu",
        "Pent3": "Dominica III post Pentecosten",
        "Pent4": "Dominica IV post Pentecosten",
        "Pent5": "Dominica V post Pentecosten",
        "Pent6": "Dominica VI post Pentecosten",
        "Pent7": "Dominica VII post Pentecosten",
        "Pent8": "Dominica VIII post Pentecosten",
        "Pent9": "Dominica IX post Pentecosten",
        "Pent10": "Dominica X post Pentecosten",
        "Pent11": "Dominica XI post Pentecosten",
        "Pent12": "Dominica XII post Pentecosten",
        "Pent13": "Dominica XIII post Pentecosten",
        "Pent14": "Dominica XIV post Pentecosten",
        "Pent15": "Dominica XV post Pentecosten",
        "Pent16": "Dominica XVI post Pentecosten",
        "Pent17": "Dominica XVII post Pentecosten",
        "EmbWedSept": "Feria Quarta IV Temporum Septembris",
        "EmbFriSept": "Feria Sexta IV Temporum Septembris",
        "EmbSatSept": "Sabbato IV Temporum Septembris",
        "EmbSatSeptS": "Sabbato IV Temporum (forma brevior)",
        "Pent18": "Dominica XVIII post Pentecosten",
        "Pent19": "Dominica XIX post Pentecosten",
        "Pent20": "Dominica XX post Pentecosten",
        "Pent21": "Dominica XXI post Pentecosten",
        "Pent22": "Dominica XXII post Pentecosten",
        "ChristusRex": "Domini Nostri Jesu Christi Regis",
        "Pent23": "Dominica XXIII post Pentecosten",
        "PentEpi3": "Dominica III quæ superfuit post Epiphaniam",
        "PentEpi4": "Dominica IV quæ superfuit post Epiphaniam",
        "PentEpi5": "Dominica V quæ superfuit post Epiphaniam",
        "PentEpi6": "Dominica VI quæ superfuit post Epiphaniam",
        "Pent24": "Dominica XXIV et Ultima post Pentecosten",
        "nuptialis": "Missa pro Sponso et Sponsa",
        "defunctorum": "Missa Defunctorum",
        "dedicatio": "In Anniversario Dedicationis Ecclesiæ",
        "litaniis": "Ad Litaniis Maj. et Min.",
        "votiveST": "Missa votiva de Sanctissima Trinitate",
        "votiveA": "Missa votiva de Angelis",
        "votiveJ": "Missa votiva de Sancto Joseph",
        "votivePP": "Missa votiva de SS. Apostolis Petro et Paulo",
        "votiveOA": "Missa votiva de omnibus SS. Apostolis",
        "votiveSS": "Missa votiva de Spiritu Sancto",
        "votiveSES": "Missa votiva de Sanctissimo Sacramento",
        "votiveJCSES": "Missa votiva de Jesu Christo Summo et Æterno Sacerdote",
        "votiveSC": "Missa votiva de Sancta Cruce",
        "votivePJC": "Missa votiva de Passione D.N. Jesu Christi",
        "votiveSCJ": "Missa votiva de Sacratissimo Corde Jesu",
        "SMadvent": "Ab Adventu usque ad Nativitatem",
        "SMchristmas": "A Nativitate usque ad Purificationem",
        "SMlent": "A Purificatione usque ad Pascha",
        "SMeaster": "A Pascha usque ad Pentecosten",
        "SMpentecost": "A Pentecoste usque ad Adventum",
        "Aug22": "Feast of the Immaculate Heart of BVM",
        "votiveECJ": "De Eucharistico Corde Jesu",
        "mass_vigil_apostle": "In Vigiliis Apostolorum (Ego autem sicut)",
        "mass_holy_pope": "Commune Summorum Pontificum (Si diligis me)",
        "mass_i_martyr_bishop": "Missa I (Statuit)",
        "mass_ii_martyr_bishop": "Missa II (Sacerdotes Dei)",
        "mass_i_martyr_not_bishop": "Missa I (In virtute tua)",
        "mass_ii_martyr_not_bishop": "Missa II (Laetabitur justus)",
        "mass_one_martyr": "Pro uno Martyre (Protexisti me)",
        "mass_two_or_more_martyr": "Pro pluribus Martyribus (Sancti tui)",
        "mass_i_two_or_more_martyr": "Missa I (Intret in conspectu)",
        "mass_ii_two_or_more_martyr": "Missa II (Sapientiam sanctorum)",
        "mass_iii_two_or_more_martyr": "Missa III (Salus autem)",
        "mass_i_confessor_bishop": "Missa I (Statuit)",
        "mass_ii_confessor_bishop": "Missa II (Sacerdotes tui)",
        "mass_doctors": "Pro Doctoribus (In medio)",
        "mass_i_confessor_not_bishop": "Missa I (Os justi)",
        "mass_ii_confessor_not_bishop": "Missa II (Justus ut palma)",
        "mass_abbots": "Pro Abbatibus (Os justi)",
        "mass_i_virgin_martyr": "Pro Virgine et Martyre I (Loquebar)",
        "mass_ii_virgin_martyr": "Pro Virgine et Martyre II (Me exspectaverunt)",
        "mass_i_virgin_not_martyr": "Pro Virgine tantum I (Dilexisti)",
        "mass_ii_virgin_not_martyr": "Pro Virgine tantum II (Vultum tuum)",
        "mass_holy_woman_martyr": "Pro Martyre (Me exspectaverunt)",
        "mass_holy_woman_not_martyr": "Pro nec Virgine nec Martyre (Cognovi)",
        "Jan5": "S. Telesphori Papæ et Martyris",
        "Jan11": "S. Hygini Papæ et Martyris",
        "Jan13": "Baptism of Our Lord Jesus Christ",
        "Jan14": "S. Hilarii Episcopi Confessoris Ecclesiæ Doctoris",
        "Jan15": "S. Pauli Primi Eremitæ et Confessoris",
        "Jan16": "S. Marcelli Papæ et Martyris",
        "Jan17": "S. Antonii Abbatis",
        "Jan18": "Cathedræ S. Petri Romæ",
        "Jan19": "Ss. Marii, Marthæ, Audifacis, et Abachum Martyrum",
        "Jan20": "Ss. Fabiani et Sebastiani Martyrum",
        "Jan21": "S. Agnetis Virginis et Martyris",
        "Jan22": "Ss. Vincentii et Anastasii Martyrum",
        "Jan23": "S. Raymundi de Peñafort Confessoris",
        "Jan24": "S. Timothei Episcopi et Martyris",
        "Jan25": "In Conversione S. Pauli Apostoli",
        "Jan26": "S. Polycarpi Episcopi et Martyris",
        "Jan27": "S. Joannis Chrysostomi Episcopi Confessoris et Ecclesiæ Doctoris",
        "Jan28": "S. Petri Nolasci Confessoris",
        "Jan29": "S. Francisci Salesii Episcopi Confessoris et Ecclesiæ Doctoris",
        "Jan30": "S. Martinæ Virginis et Martyris",
        "Jan31": "S. Joannis Bosco Confessoris",
        "Feb1": "S. Ignatii Episcopi et Martyris",
        "Feb2": "Purification of BVM",
        "Feb3": "S. Blasii Episcopi et Martyris",
        "Feb4": "S. Andreæ Corsini Episcopi et Confessoris",
        "Feb5": "S. Agathæ Virginis et Martyris",
        "Feb6": "S. Titi Episcopi et Confessoris",
        "Feb7": "S. Romualdi Abbatis",
        "Feb8": "S. Joannis de Matha Confessoris",
        "Feb9": "S. Cyrilli Episc. Alexandrini Confessoris et Ecclesiæ Doctoris",
        "Feb10": "S. Scholasticæ Virginis",
        "Feb11": "Apparition of BVM at Lourdes",
        "Feb12": "Ss. Septem Fundatorum Ordinis Servorum B. M. V.",
        "Feb14": "S. Valentini Presbyteri et Martyris",
        "Feb15": "SS. Faustini et Jovitæ",
        "Feb18": "S. Simeonis Episcopi et Martyris",
        "Feb18a": "S. Simeonis Episcopi et Martyris",
        "Feb22": "In Cathedra S. Petri Apostoli Antiochiæ",
        "Feb23": "St Peter Damian",
        "Feb23or24": "Feb 23 vel 24: In vigilia S Matthiæ",
        "Feb24or25": "S. Matthiæ Apostoli",
        "Feb27or28": "S. Gabrielis a Virgine Perdolente Confessoris",
        "Mar4": "S. Casimiri Confessoris",
        "Mar6": "Ss. Perpetuæ et Felicitatis Martyrum",
        "Mar7": "S. Thomæ de Aquino Confessoris et Ecclesiæ Doctoris",
        "Mar8": "S. Joannis de Deo Confessoris",
        "Mar9": "S. Franciscæ Romanæ Viduæ",
        "Mar10": "Ss. Quadraginta Martyrum",
        "Mar12": "S. Gregorii Papæ Confessoris et Ecclesiæ Doctoris",
        "Mar17": "S. Patricii Episcopi et Confessoris",
        "Mar18": "S. Cyrilli Episcopi Hierosolymitani Confessoris et Ecclesiæ Doctoris",
        "Mar21": "S. Benedicti Abbatis",
        "Mar24": "S. Gabrielis Archangeli",
        "Mar27": "S. Joannis Damasceni Confessoris et Ecclesiæ Doctoris",
        "Mar28": "S. Joannis a Capistrano Confessoris",
        "Apr2": "S. Francisci de Paula Confessoris",
        "Apr4": "S. Isidori Episcopi Confessoris et Ecclesiæ Doctoris",
        "Apr5": "S. Vincentii Ferrerii Confessoris",
        "Apr11": "S. Leonis I Papæ Confessoris et Ecclesiæ Doctoris",
        "Apr13": "S. Hermenegildi Martyris",
        "Apr14": "S. Justini Martyris",
        "Apr17": "S. Aniceti Papæ et Martyris",
        "Apr21": "S. Anselmi Episcopi Confessoris et Ecclesiæ Doctoris",
        "Apr22": "SS. Soteris et Caji Summorum Pontificum et Martyrum",
        "Apr23": "S. Georgii Martyris",
        "Apr24": "S. Fidelis de Sigmaringa Martyris",
        "Apr25": "S. Marci Evangelistæ",
        "Apr26": "SS. Cleti et Marcellini Summorum Pontificum et Martyrum",
        "Apr27": "S. Petri Canisii Confessoris et Ecclesiæ Doctoris",
        "Apr28": "S. Pauli a Cruce Confessoris",
        "Apr29": "S. Petri Martyris",
        "Apr30": "S. Catharinæ Senensis Virginis",
        "May2": "S. Athanasii Episcopi Confessoris et Ecclesiæ Doctoris",
        "May3": "In Inventione S Crucis",
        "May4": "S. Monicæ Viduæ",
        "May5": "S. Pii V Papæ et Confessoris",
        "May6": "S. Joannis Apostoli ante Portam Latinam",
        "May7": "S. Stanislai Episcopi et Martyris",
        "May8": "In Apparitione S. Michaëlis Archangeli",
        "May9": "S. Gregorii Nazianzeni Episcopi Confessoris et Ecclesiæ Doctoris",
        "May10": "S. Antonini Episcopi et Confessoris",
        "May11": "Ss Philip and James",
        "May12": "Ss. Nerei, Achillei et Domitillæ Virg. atque Pancratii Martyrum",
        "May13": "S. Roberti Bellarmino Episcopi Confessoris et Ecclesiæ Doctoris",
        "May14": "S. Bonifatii Martyris",
        "May15": "S. Joannis Baptistæ de la Salle Confessoris",
        "May16": "S. Ubaldi Episcopi et Confessoris",
        "May17": "S. Paschalis Baylon Confessoris",
        "May18": "S. Venantii Martyris",
        "May19": "S. Petri Celestini Papæ et Confessoris",
        "May20": "S. Bernardini Senensis Confessoris",
        "May24": "Our Lady Help of Christians",
        "May25": "S. Gregorii VII Papæ et Confessoris",
        "May26": "S. Philippi Neri Confessoris",
        "May27": "S. Bedæ Venerabilis Confessoris et Ecclesiæ Doctoris",
        "May28": "S. Augustini Episcopi et Confessoris",
        "May29": "S. Mariæ Magdalenæ de Pazzis Virginis",
        "May30": "S. Felicis I Papæ et Martyris",
        "May31": "Queenship of BVM",
        "Jun1": "S. Angelæ Mericiæ Virginis",
        "Jun2": "Ss. Marcellini, Petri, atque Erasmi, Episcopi, Martyrum",
        "Jun4": "S. Francisci Caracciolo Confessoris",
        "Jun5": "S. Bonifatii Episcopi et Martyris",
        "Jun6": "S. Norberti Episcopi et Confessoris",
        "Jun9": "Ss. Primi et Feliciani Martyrum",
        "Jun10": "S. Margaritæ Reginæ Viduæ",
        "Jun11": "S. Barnabæ Apostoli",
        "Jun12": "S. Joannis a S. Facundo Confessoris",
        "Jun13": "S. Antonii de Padua Confessoris",
        "Jun14": "S. Basilii Magni, Episcopis Confessoris et Ecclesiæ Doctoris",
        "Jun15": "Ss. Viti, Modesti atque Crescentiæ Martyrum",
        "Jun17": "St Gregory Barbadici",
        "Jun18": "S. Ephræm Syri Confessoris et Ecclesiæ Doctoris",
        "Jun19": "S. Julianæ de Falconeriis Virginis",
        "Jun19a": "S. Julianæ de Falconeriis Virginis",
        "Jun20": "S. Silverii Papæ et Martyris",
        "Jun21": "S. Aloisii Gonzagæ Confessoris",
        "Jun22": "S. Paulini Episcopi et Confessoris",
        "Jun23": "In Vigilia S. Joannis Baptistæ",
        "Jun24": "In Nativitate S. Joannis Baptistæ",
        "Jun25": "S. Gulielmi Abbatis",
        "Jun26": "Ss. Joannis et Pauli Martyrum",
        "Jun28": "S. Irenæi Episcopi et Martyris",
        "Jun29": "SS. Apostolorum Petri et Pauli",
        "Jun30": "In Commemoratione S. Pauli Apostoli",
        "Jul1": "Pretiosissimi Sanguinis Domini Nostri Jesu Christi",
        "Jul2": "The Visitation of BVM",
        "Jul3": "S. Leonis Papæ et Confessoris",
        "Jul3a": "S. Leonis Papæ et Confessoris",
        "Jul4": "Within the octave of the Apostles Peter and Paul",
        "Jul5": "S. Antonii Mariæ Zaccaria Confessoris",
        "Jul6": "In Octava Ss. Apostolorum Petri et Pauli",
        "Jul7": "Ss. Cyrilli et Methodii Pont. et Conf.",
        "Jul8": "S. Elisabeth Reg. Portugaliæ Viduæ",
        "Jul10": "Ss. Septem Fratrum Martyrum, ac Rufinæ et Secundæ Virginum et Martyrum",
        "Jul11": "S. Pii I Papæ et Martyris",
        "Jul12": "S. Joannis Gualberti Abbatis",
        "Jul13": "S. Anacleti Papæ et Martyris",
        "Jul14": "S. Bonaventuræ Episcopi Confessoris et Ecclesiæ Doctoris",
        "Jul15": "S. Henrici Imperatoris Confessoris",
        "Jul16": "Beatæ Mariæ Virginis de Monte Carmelo",
        "Jul17": "S. Alexii Confessoris",
        "Jul18": "S. Camilli de Lellis Confessoris",
        "Jul19": "S. Vincentii a Paulo Confessoris",
        "Jul20": "S. Hieronymi Æmiliani Confessoris",
        "Jul21": "S. Praxedis Virginis",
        "Jul21a": "S. Praxedis Virginis",
        "Jul22": "S. Mariæ Magdalenæ Pœnitentis",
        "Jul23": "S. Apollinaris Episcopi et Martyris",
        "Jul24": "In Vigilia S. Jacobi Ap.",
        "Jul25": "S. Jacobi Apostoli",
        "Jul26": "S. Annæ Matris B.M.V.",
        "Jul27": "S. Pantaleonis Martyris",
        "Jul28": "Ss. Nazarii et Celsi Martyrum, Victoris I Papæ et Martyris ac Innocentii I Papæ et Confessoris",
        "Jul29": "S. Marthæ Virginis",
        "Jul30": "S. Abdon et Sennen Martyrum",
        "Jul31": "S. Ignatii Confessoris",
        "Aug1": "S. Petri ad Vincula",
        "Aug1a": "S. Petri ad Vincula",
        "Aug2": "S. Alfonsi Mariæ de Ligorio Episcopi Confessoris et Ecclesiæ Doctoris",
        "Aug3": "De Inventione S. Stephani Protomartyris",
        "Aug4": "S. Dominici Confessoris",
        "Aug5": "Dedication of the Basilica of St Mary Major",
        "Aug6": "Transfiguration of Our Lord",
        "Aug7": "S. Cajetani Confessoris",
        "Aug8": "Ss. Cyriaci, Largi et Smaragdi Martyrum",
        "Aug8a": "Ss. Cyriaci, Largi et Smaragdi Martyrum",
        "Aug9": "S. Joannis Mariæ Vianney Confessoris",
        "Aug10": "S. Laurentii Martyris",
        "Aug11": "Ss. Tiburtii et Susannæ Virginis, Martyrum",
        "Aug12": "S. Claræ Virginis",
        "Aug13": "Ss. Hippolyti et Cassiani Martyrum",
        "Aug14": "Vigil of Assumption of BVM",
        "Aug15": "Assumption of BVM",
        "Aug16": "S. Joachim Confessoris, Patris B. M. V.",
        "Aug17": "S. Hyacinthi Confessoris",
        "Aug18": "St Agapitus",
        "Aug19": "S. Joannis Eudes Confessoris",
        "Aug20": "S. Bernardi Abbatis et Ecclesiæ Doctoris",
        "Aug21": "S. Joannæ Franciscæ Frémiot de Chantal Viduæ",
        "Aug23": "S. Philippi Benitii Confessoris",
        "Aug24": "S. Bartholomæi Apostoli",
        "Aug25": "S. Ludovici Regis Franciæ Confessoris",
        "Aug26": "S. Zephyrini Papæ et Martyris",
        "Aug27": "S. Josephi Calasanctii Confessoris",
        "Aug28": "S. Augustini Episcopi et Confessoris et Ecclesiæ Doctoris",
        "Aug29": "In Decollatione S. Joannis Baptistæ",
        "Aug30": "S. Rosæ a Sancta Maria Limanæ Virginis",
        "Aug31": "S. Raymundi Nonnati Confessoris",
        "Sep1": "S. Ægidii Abbatis",
        "Sep2": "S. Stephani Regis Hungariæ Confessoris",
        "Sep3": "S. Pii X Papæ Confessoris",
        "Sep5": "S. Laurentii Justiniani Episcopi et Confessoris",
        "Sep8": "Nativity of BVM",
        "Sep9": "S. Gorgonii Martyris",
        "Sep9a": "S. Petri Claver Confessoris",
        "Sep10": "S. Nicolai de Tolentino Confessoris",
        "Sep11": "Ss. Proti et Hyacinthi Martyrum",
        "Sep12": "Sanctissimi Nominis Mariæ",
        "Sep14": "The Exaltation of the Holy Cross",
        "Sep15": "Seven Sorrows of BVM",
        "Sep16": "Ss. Cornelii Papæ et Cypriani Episcopi, Martyrum",
        "Sep17": "Impressionis Stigmatum S. Francisci",
        "Sep18": "S. Josephi de Cupertino Confessoris",
        "Sep19": "S. Januarii Episcopi et Sociorum Martyrum",
        "Sep19laSalette": "Beatæ Mariæ Virginis de La Salette",
        "Sep20": "Ss. Eustachii et Sociorum Martyrum",
        "Sep21": "S. Matthæi Apostoli et Evangelistæ",
        "Sep22": "S. Thomæ de Villanova Episcopi et Confessoris",
        "Sep23": "S. Lini Papæ et Martyris",
        "Sep24": "Our Lady of Ransom",
        "Sep26": "Ss. Cypriani et Justinæ Virginis, Martyrum",
        "Sep26a": "Ss. Isaaci Jogues, Joannis de Brébeuf et Sociorum Martyrum",
        "Sep27": "Ss. Cosmæ et Damiani Martyrum",
        "Sep28": "S. Wenceslai Ducis et Martyris",
        "Sep29": "In Dedicatione S. Michaëlis Archangelis",
        "Sep30": "S. Hieronymi Presbyteris Confessoris et Ecclesiæ Doctoris",
        "Oct1": "S. Remigii Episcopi et Confessoris",
        "Oct2": "Ss. Angelorum Custodum",
        "Oct3": "S. Theresiæ a Jesu Infante Virginis",
        "Oct4": "S. Francisci Confessoris",
        "Oct5": "Ss. Placidi et Sociorum Martyrum",
        "Oct6": "S. Brunonis Confessoris",
        "Oct7": "The Most Holy Rosary of BVM",
        "Oct8": "S. Birgittæ Viduæ",
        "Oct9": "S. Joannis Leonardi Confessoris",
        "Oct10": "S. Francisci Borgiæ Confessoris",
        "Oct11": "Maternitatis Beatæ Mariæ Virginis",
        "Oct13": "S. Eduardi Regis Confessoris",
        "Oct14": "S. Callisti Papæ et Martyris",
        "Oct15": "S. Teresiæ Virginis",
        "Oct16": "S. Hedwigis Viduæ",
        "Oct17": "S. Margaritæ Mariæ Alacoque Virginis",
        "Oct18": "S. Lucæ Evangelistæ",
        "Oct19": "S. Petri de Alcantara Confessoris",
        "Oct20": "S. Joannis Cantii Confessoris",
        "Oct21": "S. Hilarionis Abbatis",
        "Oct23": "St Anthony Mary Claret",
        "Oct24": "S. Raphaëlis Archangeli",
        "Oct25": "Ss. Chrysanthi et Dariæ Martyrum",
        "Oct26": "S. Evaristi Papæ et Martyris",
        "Oct27": "In Vigilia Ss. Simonis et Judæ Ap.",
        "Oct28": "Ss. Simonis et Judæ Apostolorum",
        "Oct31": "In Vigilia Omnium Sanctorum",
        "Nov1": "Omnium Sanctorum",
        "Nov4": "S. Caroli Episcopi et Confessoris",
        "Nov5": "In Festo Sanctarum Reliquiarum",
        "Nov8": "In Octava Omnium Sanctorum",
        "Nov9": "In Dedicatione Archibasilicæ Ssmi Salvatoris",
        "Nov10": "S. Andreæ Avellini Confessoris",
        "Nov11": "S. Martini Episcopi et Confessoris",
        "Nov12": "S. Martini Papæ et Martyris",
        "Nov13": "S. Didaci Confessoris",
        "Nov14": "S. Josaphat Episcopi et Martyris",
        "Nov15": "S. Alberti Magni Episcopi Confessoris et Ecclesiæ Doctoris",
        "Nov16": "S. Gertrudis Virginis",
        "Nov17": "S. Gregorii Thaumaturgi Episcopi et Confessoris",
        "Nov18": "In Dedicatione Basilicarum Ss. Petri et Pauli",
        "Nov19": "S. Elisabeth Viduæ",
        "Nov20": "S. Felicis de Valois Confessoris",
        "Nov21": "In Praesentatione B. Mariæ Virginis",
        "Nov22": "S. Cæciliæ Virginis et Martyris",
        "Nov23": "S. Clementis Papæ et Martyris",
        "Nov24": "S. Joannis a Cruce Confessoris et Ecclesiæ Doctoris",
        "Nov25": "S. Catharinæ Virginis et Martyris",
        "Nov26": "S. Silvestri Abbatis",
        "Nov27": "Beatæ Mariæ Virginis a Sacro Numismate",
        "Nov29": "In Vigilia S. Andreæ Apostoli",
        "Nov30": "S. Andreæ Apostoli",
        "Dec2": "S. Bibianæ Virginis et Martyris",
        "Dec3": "S. Francisci Xaverii Confessoris",
        "Dec4": "S. Petri Chrysologi Episcopi Confessoris et Ecclesiæ Doctoris",
        "Dec5": "S. Sabbæ Abbatis",
        "Dec6": "S. Nicolai Episcopi et Confessoris",
        "Dec7": "S. Ambrosii Episcopi Confessoris et Ecclesiæ Doctoris",
        "Dec8": "The Immaculate Conception of BVM",
        "Dec10": "St Melchiades",
        "Dec11": "S. Damasi Papæ et Confessoris",
        "Dec12": "Our Lady of Guadalupe",
        "Dec13": "S. Luciæ Virginis et Martyris",
        "Dec16": "S. Eusebii Episcopi et Martyris",
        "Dec20": "In Vigilia S Thomæ Apostoli",
        "Dec21": "S. Thomæ Apostoli",
        "Dec26": "S. Stephani Protomartyris",
        "Dec27": "S. Joannis Apostoli et Evangelistæ",
        "Dec28": "Ss. Innocentium",
        "Dec29": "S. Thomæ Cantuariensis Episcopi et Martyris",
        "Dec31": "S. Silvestri Papæ et Confessoris",
        "Dec31_v": "S. Silvestri Papæ et Confessoris",
        "Quad": "Septuagesima usque ad Finem Quadragesimæ",
        "Pasch": "Tempus Paschale",
        "Nat0": "In Vigilia Nativitatis Domini",
        "Quadp1": "Dominica in Septuagesima",
        "Quadp2": "Dominica in Sexagesima",
        "Quadp3": "Dominica in Quinquagesima",
        "Quadw": "Feria Quarta Cinerum",
        "HolyThurs": "Feria Quinta in Cœna Domini",
        "GoodFri": "Feria Sexta in Parasceve",
        "HolySat": "Sabbato Sancto (Vigilia Paschalis)"
    },
    "en": {
        "Adv1": "1st Sunday in Advent",
        "Adv2": "2nd Sunday in Advent",
        "Adv3": "3rd Sunday in Advent (Gaudete)",
        "Adv3w": "Ember Wednesday in Advent",
        "Adv3f": "Ember Friday in Advent",
        "Adv3s": "Ember Saturday in Advent",
        "Adv3ss": "Ember Saturday (shorter form)",
        "Adv4": "4th Sunday in Advent",
        "Dec24": "Christmas Eve",
        "Dec25_1": "The Nativity of our Lord (Christmas), Mass at Midnight",
        "Dec25_2": "Christmas, Mass at dawn",
        "Dec25_3": "Christmas, Mass during the day",
        "Nat1": "Sunday within the Octave of Christmas",
        "Jan1": "Octave day of Christmas (Jan 1.)",
        "Nat2": "Holy Name of Jesus",
        "Jan5a": "Vigil of Epiphany",
        "Epi": "Epiphany",
        "Epi1": "Feast of the Holy Family (1st Sunday after Epiphany)",
        "Epi1s": "  Feria after 1st Sunday after Epiphany",
        "Epi2": "2nd Sunday after Epiphany",
        "Epi3": "3rd Sunday after Epiphany",
        "Epi4": "4th Sunday after Epiphany",
        "Epi5": "5th Sunday after Epiphany",
        "Epi6": "6th Sunday after Epiphany",
        "7a": "Septuagesima",
        "6a": "Sexagesima",
        "5a": "Quinquagesima",
        "5aw": "Ash Wednesday",
        "5ah": "  Thursday after Ash Wednesday",
        "5af": "  Friday after Ash Wednesday",
        "5as": "  Saturday after Ash Wednesday",
        "Quad1": "1st Sunday of Lent",
        "Quad1m": "  Monday in the 1st week of Lent",
        "Quad1t": "  Tuesday in the 1st week of Lent",
        "Quad1w": "Ember Wednesday of Lent",
        "Quad1h": "  Thursday in the 1st week of Lent",
        "Quad1f": "Ember Friday of Lent",
        "Quad1s": "Ember Saturday of Lent",
        "Quad1ss": "  Ember Saturday (shorter form)",
        "Quad2": "2nd Sunday of Lent",
        "Quad2m": "  Monday in the 2nd week of Lent",
        "Quad2t": "  Tuesday in the 2nd week of Lent",
        "Quad2w": "  Wednesday in the 2nd week of Lent",
        "Quad2h": "  Thursday in the 2nd week of Lent",
        "Quad2f": "  Friday in the 2nd week of Lent",
        "Quad2s": "  Saturday in the 2nd week of Lent",
        "Quad3": "3rd Sunday of Lent",
        "Quad3m": "  Monday in the 3rd week of Lent",
        "Quad3t": "  Tuesday in the 3rd week of Lent",
        "Quad3w": "  Wednesday in the 3rd week of Lent",
        "Quad3h": "  Thursday in the 3rd week of Lent",
        "Quad3f": "  Friday in the 3rd week of Lent",
        "Quad3s": "  Saturday in the 3rd week of Lent",
        "Quad4": "4th Sunday of Lent (Laetare)",
        "Quad4m": "  Monday in the 4th week of Lent",
        "Quad4t": "  Tuesday in the 4th week of Lent",
        "Quad4w": "  Wednesday in the 4th week of Lent",
        "Quad4h": "  Thursday in the 4th week of Lent",
        "Quad4f": "  Friday in the 4th week of Lent",
        "Quad4s": "  Saturday in the 4th week of Lent",
        "Quad5": "Passion Sunday",
        "Quad5m": "  Monday in Passion Week",
        "Quad5t": "  Tuesday in Passion Week",
        "Quad5w": "  Wednesday in Passion Week",
        "Quad5h": "  Thursday in Passion Week",
        "Quad5f": "  Friday in Passion Week",
        "Quad5f_sd": "  Friday: The Seven Sorrows of the Blessed Virgin Mary",
        "Quad5s": "  Saturday in Passion Week",
        "Quad6": "Palm Sunday",
        "Quad6_v": "Palm Sunday (pre 1955)",
        "Quad6m": "  Monday in Holy Week",
        "Quad6t": "  Tuesday in Holy Week",
        "Quad6t_v": "  Tuesday in Holy Week (pre 1955)",
        "Quad6w": "  Wednesday in Holy Week",
        "Quad6w_v": "  Wednesday in Holy Week (pre 1955)",
        "Quad6h": "Maundy Thursday",
        "Quad6h_v": "Maundy Thursday (pre 1955)",
        "Quad6h-lotio": "  Antiphons at the Washing of the Feet",
        "Quad6f": "Good Friday",
        "Quad6f_v": "Good Friday (pre 1955)",
        "Quad6s": "Easter Vigil",
        "Quad6s_v": "Easter Vigil (pre 1955)",
        "Pasc0": "Easter Sunday",
        "Pasc0m": "Easter Monday",
        "Pasc0t": "Easter Tuesday",
        "Pasc0w": "Easter Wednesday",
        "Pasc0h": "Easter Thursday",
        "Pasc0f": "Easter Friday",
        "Pasc0s": "Easter Saturday",
        "Pasc1": "Low Sunday (Octave of Easter)",
        "Pasc2": "2nd Sunday after Easter (Good Shepherd)",
        "Pasc2w": "Solemnity of St Joseph",
        "Pasc3": "3rd Sunday after Easter",
        "Pasc4": "4th Sunday after Easter",
        "Pasc5": "5th Sunday after Easter",
        "Asc": "Ascension of Our Lord",
        "Pasc6": "Sunday after the Ascension",
        "Pasc6s": "Pentecost Vigil (Whitsun Eve)",
        "Pasc6s_v": "Pentecost Vigil (Whitsun Eve) (pre 1955)",
        "Pent0": "Pentecost Sunday",
        "Pent0m": "Pentecost Monday",
        "Pent0t": "Pentecost Tuesday",
        "Pent0w": "Ember Wednesday of Pentecost",
        "Pent0h": "Pentecost Thursday",
        "Pent0f": "Ember Friday of Pentecost",
        "Pent0s": "Ember Saturday of Pentecost",
        "Pent0ss": "Ember Saturday (shorter form)",
        "Pent1": "Trinity Sunday",
        "Pent1w": "  Feria after 1st Sunday after Pentecost",
        "CorpusChristi": "Corpus Christi",
        "Pent2": "2nd Sunday after Pentecost (Sunday within the Octave of Corpus Christi)",
        "SCJ": "Feast of the Most Sacred Heart of Jesus",
        "Pent3": "3rd Sunday after Pentecost (Sunday within the Octave of Sacred Heart)",
        "Pent4": "4th Sunday after Pentecost",
        "Pent5": "5th Sunday after Pentecost",
        "Pent6": "6th Sunday after Pentecost",
        "Pent7": "7th Sunday after Pentecost",
        "Pent8": "8th Sunday after Pentecost",
        "Pent9": "9th Sunday after Pentecost",
        "Pent10": "10th Sunday after Pentecost",
        "Pent11": "11th Sunday after Pentecost",
        "Pent12": "12th Sunday after Pentecost",
        "Pent13": "13th Sunday after Pentecost",
        "Pent14": "14th Sunday after Pentecost",
        "Pent15": "15th Sunday after Pentecost",
        "Pent16": "16th Sunday after Pentecost",
        "Pent17": "17th Sunday after Pentecost",
        "EmbWedSept": "Ember Wednesday in September",
        "EmbFriSept": "Ember Friday in September",
        "EmbSatSept": "Ember Saturday in September",
        "EmbSatSeptS": "Ember Saturday (shorter form)",
        "Pent18": "18th Sunday after Pentecost",
        "Pent19": "19th Sunday after Pentecost",
        "Pent20": "20th Sunday after Pentecost",
        "Pent21": "21st Sunday after Pentecost",
        "Pent22": "22nd Sunday after Pentecost",
        "ChristusRex": "Feast of Christ the King",
        "Pent23": "23rd Sunday after Pentecost",
        "PentEpi3": "3rd Sunday remaining after Epiphany",
        "PentEpi4": "4th Sunday remaining after Epiphany",
        "PentEpi5": "5th Sunday remaining after Epiphany",
        "PentEpi6": "6th Sunday remaining after Epiphany",
        "Pent24": "24th and Last Sunday after Pentecost",
        "nuptialis": "Wedding Mass",
        "defunctorum": "Mass for the Dead",
        "dedicatio": "Mass of the dedication of a church",
        "litaniis": "At Major and Minor Litanies",
        "votiveST": "Votive Mass of the Most Holy Trinity",
        "votiveA": "Votive Mass of the Holy Angels",
        "votiveJ": "Votive Mass of Saint Joseph",
        "votivePP": "Votive Mass of Saints Peter and Paul",
        "votiveOA": "Votive Mass of the Apostles",
        "votiveSS": "Votive Mass of the Holy Ghost",
        "votiveSES": "Votive Mass of the Most Holy Sacrament",
        "votiveJCSES": "Votive Mass of Christ the Eternal High Priest",
        "votiveSC": "Votive Mass of the Holy Cross",
        "votivePJC": "Votive Mass of the Passion of Our Lord Jesus Christ",
        "votiveSCJ": "Votive Mass of the Most Sacred Heart of Jesus",
        "SMadvent": "in Advent",
        "SMchristmas": "From Christmas to Candlemas",
        "SMlent": "From Candlemas to Easter",
        "SMeaster": "From Easter to Pentecost",
        "SMpentecost": "From Pentecost to Advent",
        "Aug22": "Feast of the Immaculate Heart of BVM",
        "votiveECJ": "Of the Eucharistic Heart of Jesus",
        "mass_vigil_apostle": "Mass Vigil of an Apostle (Ego autem sicut)",
        "mass_holy_pope": "Mass of a Holy Pope (Si diligis me)",
        "mass_i_martyr_bishop": "Mass I (Statuit)",
        "mass_ii_martyr_bishop": "Mass II (Sacerdotes Dei)",
        "mass_i_martyr_not_bishop": "Mass I (In virtute tua)",
        "mass_ii_martyr_not_bishop": "Mass II (Laetabitur justus)",
        "mass_one_martyr": "One Martyr (Protexisti me)",
        "mass_two_or_more_martyr": "Two or more Martyrs (Sancti tui)",
        "mass_i_two_or_more_martyr": "Mass I (Intret in conspectu)",
        "mass_ii_two_or_more_martyr": "Mass II (Sapientiam sanctorum)",
        "mass_iii_two_or_more_martyr": "Mass III (Salus autem)",
        "mass_i_confessor_bishop": "Mass I (Statuit)",
        "mass_ii_confessor_bishop": "Mass II (Sacerdotes tui)",
        "mass_doctors": "Doctors (In medio)",
        "mass_i_confessor_not_bishop": "Mass I (Os justi)",
        "mass_ii_confessor_not_bishop": "Mass II (Justus ut palma)",
        "mass_abbots": "Abbots (Os justi)",
        "mass_i_virgin_martyr": "Virgin Martyr, Mass I (Loquebar)",
        "mass_ii_virgin_martyr": "Virgin Martyr, Mass II (Me exspectaverunt)",
        "mass_i_virgin_not_martyr": "Virgin not a Martyr, Mass I (Dilexisti)",
        "mass_ii_virgin_not_martyr": "Virgin not a Martyr, Mass II (Vultum tuum)",
        "mass_holy_woman_martyr": "Martyr (Me exspectaverunt)",
        "mass_holy_woman_not_martyr": "Neither Virgin nor Martyr (Cognovi)",
        "Jan5": "St Telesphorus",
        "Jan11": "St Hyginus",
        "Jan13": "Baptism of Our Lord Jesus Christ",
        "Jan14": "St. Hilary, Bishop of Poitiers, Confessor and Doctor of the Church",
        "Jan15": "St. Paul the First Hermit, Confessor",
        "Jan16": "St. Marcellus, Pope and Martyr",
        "Jan17": "S. Anthony, Abbot",
        "Jan18": "Chair of St. Peter at Rome",
        "Jan19": "Ss. Marius, Martha, Audifax, and Abachum, Martyrs",
        "Jan20": "Ss. Fabian and Sebastian, Martyrs",
        "Jan21": "S. Agnes, Virgin and Martyr",
        "Jan22": "Ss. Vincent and Anastasius, Martyrs",
        "Jan23": "S. Raymond of Penafort, Confessor",
        "Jan24": "St. Timothy, Bishop and Martyr",
        "Jan25": "Conversion of St. Paul the Apostle",
        "Jan26": "St. Polycarp, Bishop and Martyr",
        "Jan27": "St. John Chrysostom, Bishop, Confessor, and Doctor of the Church",
        "Jan28": "St. Peter Nolasco, Confessor",
        "Jan29": "St. Francis de Sales, Bishop, Confessor, and Doctor of the Church",
        "Jan30": "St. Martina, Virgin and Martyr",
        "Jan31": "St. John Bosco, Confessor",
        "Feb1": "St. Ignatius, Bishop and Martyr",
        "Feb2": "Purification of BVM",
        "Feb3": "St. Blase, Bishop and Martyr",
        "Feb4": "St. Andrew Corsini, Bishop and Confessor",
        "Feb5": "St. Agatha, Virgin and Martyr",
        "Feb6": "St. Titus, Bishop and Confessor",
        "Feb7": "St. Romuald, Abbot",
        "Feb8": "St. John of Matha, Confessor",
        "Feb9": "St. Cyril of Alexandria, Bishop, Confessor, and Doctor of the Church",
        "Feb10": "St. Scholastica, Virgin",
        "Feb11": "Apparition of BVM at Lourdes",
        "Feb12": "Seven Holy Founders of the Order of the Servants of the Blessed Virgin Mary",
        "Feb14": "St. Valentine, Priest and Martyr",
        "Feb15": "Sts. Faustinus and Jovita, Martyrs",
        "Feb18": "St. Simeon, Bishop and Martyr",
        "Feb18a": "St. Simeon, Bishop and Martyr",
        "Feb22": "Chair of St. Peter at Antioch",
        "Feb23": "St Peter Damian",
        "Feb23or24": "Feb 23 or 24: Vigil of St Matthias",
        "Feb24or25": "St. Matthias the Apostle",
        "Feb27or28": "St. Gabriel of the Sorrowful Virgin, Confessor",
        "Mar4": "St. Casimir, Confessor",
        "Mar6": "Sts. Perpetua and Felicity, Martyrs",
        "Mar7": "St. Thomas Aquinas, Confessor and Doctor of the Church",
        "Mar8": "St. John of God, Confessor",
        "Mar9": "St. Frances of Rome, Widow",
        "Mar10": "Forty Holy Martyrs",
        "Mar12": "S. Gregory the Great, Pope, Confessor and Doctor of the Church",
        "Mar17": "St. Patrick, Bishop and Confessor",
        "Mar18": "St. Cyril of Jerusalem, Confessor and Doctor of the Church",
        "Mar21": "St. Benedict, Abbot",
        "Mar24": "St. Gabriel the Archangel",
        "Mar27": "St. John Damascene, Confessor",
        "Mar28": "St. John of Capistrano, Confessor",
        "Apr2": "St. Francis of Paula, Confessor",
        "Apr4": "S. Isidore of Seville, Bishop, Confessor and Doctor of the Church",
        "Apr5": "St. Vincent Ferrer, Confessor",
        "Apr11": "St. Leo the Great, Pope, Confessor and Doctor of the Church",
        "Apr13": "St. Hermenegild, Martyr",
        "Apr14": "St. Justini Martyr",
        "Apr17": "St. Anicetus, Pope and Martyr",
        "Apr21": "St. Anselm, Bishop, Confessor and Doctor of the Church",
        "Apr22": "Sts. Soter and Caius, Popes and Martyrs",
        "Apr23": "St. George, Martyr",
        "Apr24": "St. Fidelis of Sigmaringen, Martyr",
        "Apr25": "St. Mark the Evangelist",
        "Apr26": "Sts. Cletus and Marcellinus, Popes and Martyrs",
        "Apr27": "St. Peter Canisius, Confessor and Doctor of the Church",
        "Apr28": "St. Paul of the Cross, Confessor",
        "Apr29": "St. Peter the Martyr",
        "Apr30": "St. Catherine of Siena, Virgin",
        "May2": "S. Athanasius, Confessor and Doctor of the Church",
        "May3": "Finding of the Holy Cross",
        "May4": "St. Monica, Widow",
        "May5": "St. Pius V, Pope and Confessor",
        "May6": "St. John the Apostle Before the Latin Gate",
        "May7": "St. Stanislaus, Bishop and Martyr",
        "May8": "Apparition of St. Michael the Archangel",
        "May9": "St. Gregory Nazianzen, Bishop, Confessor and Doctor of the Church",
        "May10": "St. Antoninus, Bishop and Confessor",
        "May11": "Ss Philip and James",
        "May12": "Ss. Nereus, Achilleus and Domitilla the Virgin and Pancras, Martyrs",
        "May13": "St. Robert Bellarmine, Bishop, Confessor and Doctor of the Church",
        "May14": "St. Boniface, Martyr",
        "May15": "St. John Baptist de la Salle, Confessor",
        "May16": "St. Ubald, Bishop and Confessor",
        "May17": "St. Pascal Baylon Confessor",
        "May18": "St. Venantius, Martyr",
        "May19": "St. Peter Celestine, Pope and Confessor",
        "May20": "St. Bernardine of Siena, Confessor",
        "May24": "Our Lady Help of Christians",
        "May25": "St. Gregory VII, Pope and Confessor",
        "May26": "St. Philip Neri, Confessor",
        "May27": "St. Bede the Venerable, Confessor and Doctor of the Church",
        "May28": "St. Augustine of Canterbury, Bishop and Confessor",
        "May29": "St. Mary Magdalene de Pazzi, Virgin",
        "May30": "St. Felix, Pope and Martyr",
        "May31": "Queenship of BVM",
        "Jun1": "St. Angela Merici, Virgin",
        "Jun2": "Sts. Marcellinus, Peter, and Erasmus, Martyrs",
        "Jun4": "St. Francis Caracciolo, Confessor",
        "Jun5": "St. Boniface, Bishop and Martyr",
        "Jun6": "St. Norbert, Bishop and Confessor",
        "Jun9": "Sts. Primus and Felician, Martyrs",
        "Jun10": "St. Margaret, Queen and Widow",
        "Jun11": "St. Barnabas the Apostle",
        "Jun12": "St. John of St. Facundus, Confessor",
        "Jun13": "St. Anthony of Padua, Confessor",
        "Jun14": "St. Basil the Great, Confessor and Doctor of the Church",
        "Jun15": "Sts. Vitus, Modestus and Crescentia, Martyrs",
        "Jun17": "St Gregory Barbadici",
        "Jun18": "St. Ephraem of Syria, Confessor and Doctor of the Church",
        "Jun19": "St. Juliana Falconeri, Virgin",
        "Jun19a": "St. Juliana Falconeri, Virgin",
        "Jun20": "St. Silverius, Pope and Martyr",
        "Jun21": "St. Aloysius Gonzaga, Confessor",
        "Jun22": "St. Paulinus of Nola, Bishop and Confessor",
        "Jun23": "Vigil of the Nativity of St. John the Baptist",
        "Jun24": "Nativity of St. John the Baptist",
        "Jun25": "St. William, Abbot",
        "Jun26": "Sts. John and Paul, Martyrs",
        "Jun28": "St. Irenaeus, Bishop and Martyr",
        "Jun29": "Sts. Peter and Paul, Apostles",
        "Jun30": "Commemoration of St. Paul the Apostle",
        "Jul1": "Most Precious Blood of Our Lord Jesus Christ",
        "Jul2": "The Visitation of BVM",
        "Jul3": "St. Leo II, Pope and Confessor",
        "Jul3a": "St. Leo II, Pope and Confessor",
        "Jul4": "Within the octave of the Apostles Peter and Paul",
        "Jul5": "St. Anthony Mary Zaccaria, Confessor",
        "Jul6": "Octave of Sts. Peter and Paul",
        "Jul7": "Sts. Cyril and Methodius, Bishops and Confessors",
        "Jul8": "St. Elizabeth of Portugal, Queen and Widow",
        "Jul10": "Seven Brothers, Martyrs, and Sts. Rufina and Secunda, Virgins and Martyrs",
        "Jul11": "St. Pius I, Pope and Martyr",
        "Jul11a": "St. Pius I, Pope and Martyr",
        "Jul12": "St. John Gualbert, Abbot",
        "Jul13": "St. Anacletus, Pope and Martyr",
        "Jul14": "St. Bonaventure, Bishop, Confessor and Doctor of the Church",
        "Jul15": "St. Henry the Emperor, Confessor",
        "Jul16": "Our Lady of Mount Carmel",
        "Jul17": "St. Alexis, Confessor",
        "Jul18": "St. Camillus de Lellis, Confessor",
        "Jul19": "St. Vincent de Paul, Confessor",
        "Jul20": "St. Jerome Emiliani, Confessor",
        "Jul21": "St. Praxedes, Virgin",
        "Jul21a": "St. Praxedes, Virgin",
        "Jul22": "St. Mary Magdalene, Penitent",
        "Jul23": "St. Apollinaris, Bishop and Martyr",
        "Jul24": "Vigil of St. James the Apostle",
        "Jul25": "St. James the Apostle",
        "Jul26": "St. Anne, Mother of the Blessed Virgin Mary",
        "Jul27": "S. Pantaleon Martyr",
        "Jul28": "Sts. Nazarius and Celsus, Martyr, Pope Victor I, Martyr, and Pope Innocent I, Confessor",
        "Jul29": "St. Martha, Virgin",
        "Jul30": "St. Abdon and Sennen, Martyr",
        "Jul31": "St. Ignatius of Loyola, Confessor",
        "Aug1": "St. Peter in Chains",
        "Aug1a": "St. Peter in Chains",
        "Aug2": "St. Alphonsus Liguori, Bishop, Confessor and Doctor of the Church",
        "Aug3": "Finding of St. Stephen the First Martyr",
        "Aug4": "St. Dominic the Confessor",
        "Aug5": "Dedication of the Basilica of St Mary Major",
        "Aug6": "Transfiguration of Our Lord",
        "Aug7": "St. Cajetan, Confessor",
        "Aug8": "Sts. Cyriacus, Largus and Smaragdus, Martyrs",
        "Aug8a": "Sts. Cyriacus, Largus and Smaragdus, Martyrs",
        "Aug9": "St. Jean-Marie Vianney, Confessor",
        "Aug10": "St. Lawrence, Martyr",
        "Aug11": "Sts. Tiburtius and Susanna, Martyrs",
        "Aug12": "St. Clare, Virgin",
        "Aug13": "Sts. Hippolytus and Cassian, Martyrs",
        "Aug14": "Vigil of Assumption of BVM",
        "Aug15": "Assumption of BVM",
        "Aug16": "St. Joachim, Confessor, Father of the Blessed Virgin Mary",
        "Aug17": "St. Hyacinth, Confessor",
        "Aug18": "St Agapitus",
        "Aug19": "St. John Eudes, Confessor",
        "Aug20": "St. Bernard of Clairvaux, Abbot and Doctor of the Church",
        "Aug21": "St. Jeanne-Françoise Frémiot de Chantal, Widow;Duplex",
        "Aug23": "St. Philip Benizi, Confessor",
        "Aug24": "St. Bartholomew the Apostle",
        "Aug25": "St. Louis, Confessor",
        "Aug26": "St. Zephyrinus, Pope and Martyr",
        "Aug27": "St. Joseph Calasanz, Confessor",
        "Aug28": "St. Augustine of Hippo, Bishop, Confessor, and Doctor of the Church",
        "Aug29": "Beheading of St. John the Baptist",
        "Aug30": "St. Rose of Lima, Virgin",
        "Aug31": "St. Raymond Nonnatus, Confessor",
        "Sep1": "St. Giles, Abbot",
        "Sep2": "St. Stephen, King of Hungary, Confessor",
        "Sep3": "St. Pius X, Pope and Confessor",
        "Sep5": "St. Lawrence Justinian, Bishop and Confessor",
        "Sep8": "Nativity of BVM",
        "Sep9": "S. Gorgonius, Martyr",
        "Sep9a": "S. Gorgonius, Martyr",
        "Sep10": "St. Nicholas of Tolentino Confessor",
        "Sep11": "Sts. Protus and Hyacinth Martyrs",
        "Sep12": "Most Holy Name of Mary",
        "Sep14": "The Exaltation of the Holy Cross",
        "Sep15": "Seven Sorrows of BVM",
        "Sep16": "Sts. Cornelius, Pope and Cyprian, Bishop, Martyrs",
        "Sep17": "Impression of the Stigmata of St. Francis",
        "Sep18": "St. Joseph of Cupertino Confessor",
        "Sep19": "St. Januarius, Bishop and Companions, Martyrs",
        "Sep19laSalette": "St. Januarius, Bishop and Companions, Martyrs",
        "Sep20": "S. Eustachius and Companions, Martyrs",
        "Sep21": "St. Matthew, Apostle and Evangelist",
        "Sep22": "St. Thomas of Villanova, Bishop and Confessor",
        "Sep23": "St. Linus, Pope and Martyr",
        "Sep24": "Our Lady of Ransom",
        "Sep26": "Sts. Cyprian and Justina, Martyrs",
        "Sep26a": "Sts. Cyprian and Justina, Martyrs",
        "Sep27": "Sts. Cosmas and Damian, Martyrs",
        "Sep28": "St. Wenceslaus, Duke and Martyr",
        "Sep29": "Dedication of the Archbasilica of St. Michael the Archangel",
        "Sep30": "St. Jerome, Priest, Confessor and Doctor of the Church",
        "Oct1": "St. Remigius, Bishop and Confessor",
        "Oct2": "Guardian Angels",
        "Oct3": "St. Thérèse of the Child Jesus, Virgin",
        "Oct4": "St. Francis of Assisi, Confessor",
        "Oct5": "Sts. Placidus and Companions Martyrs",
        "Oct6": "St. Bruno, Confessor",
        "Oct7": "The Most Holy Rosary of BVM",
        "Oct8": "St. Birgitta, Widow",
        "Oct9": "St. John Leonard, Confessor",
        "Oct10": "St. Francis Borgia, Confessor",
        "Oct11": "The Motherhood of BVM",
        "Oct13": "St. Edward the Confessor, King",
        "Oct14": "St. Callistus, Pope and Martyr",
        "Oct15": "St. Teresa of Avila, Virgin",
        "Oct16": "St. Hedwig, Widow",
        "Oct17": "St. Marguerite-Marie Alacoque, Virgin",
        "Oct18": "St. Luke the Evangelist",
        "Oct19": "St. Peter of Alcantara, Confessor",
        "Oct20": "St. John Cantius, Confessor",
        "Oct21": "St. Hilarion, Abbot",
        "Oct23": "St Anthony Mary Claret",
        "Oct24": "St. Raphael the Archangel;Duplex majus",
        "Oct25": "Sts. Chrysanthus and Daria, Martyrs",
        "Oct26": "St. Evaristus, Pope and Martyr",
        "Oct27": "Vigil of Sts. Simon and Jude, Apostles",
        "Oct28": "Sts. Simon and Jude, Apostles",
        "Oct31": "Vigil of All Saints",
        "Nov1": "All Saints",
        "Nov4": "St. Charles Borromeo, Bishop and Confessor",
        "Nov5": "The Feast of the Holy Relics",
        "Nov8": "Octave of All Saints",
        "Nov9": "The Dedication of the Lateran Basilica",
        "Nov10": "St. Andrew Avellino Confessor",
        "Nov11": "St. Martin, Bishop of Tours, Confessor",
        "Nov12": "St. Martin I, Pope and Martyr",
        "Nov13": "St. Didacus, Confessor",
        "Nov14": "St. Josaphat, Bishop and Martyr",
        "Nov15": "St. Albert the Great, Bishop, Confessor and Doctor of the Church",
        "Nov16": "St. Gertrude, Virgin",
        "Nov17": "St. Gregory the Wonderworker, Bishop and Confessor",
        "Nov18": "The Dedication of the Basilicas of Ss Peter and Paul",
        "Nov19": "St. Elizabeth, Widow",
        "Nov20": "St. Felix de Valois, Confessor",
        "Nov21": "The Presentation of BVM",
        "Nov22": "St. Cecilia, Virgin and Martyr",
        "Nov23": "St. Clement, Pope and Martyr",
        "Nov24": "St. John of the Cross, Confessor and Doctor of the Church",
        "Nov25": "St. Catharine of Alexandria, Virgin and Martyr",
        "Nov26": "St. Sylvester, Abbot",
        "Nov27": "Our Lady of the Miraculous Medal",
        "Nov29": "Vigil of St. Andrew the Apostle",
        "Nov30": "St. Andrew the Apostle",
        "Dec2": "St. Bibiana, Virgin and Martyr",
        "Dec3": "St. Francis Xavier, Confessor",
        "Dec4": "St. Peter Chrysologus, Bishop, Confessor and Doctor of the Church",
        "Dec5": "St. Sabbas, Abbot",
        "Dec6": "St. Nicholas, Bishop and Confessor",
        "Dec7": "St. Ambrose, Bishop, Confessor and Doctor of the Church",
        "Dec8": "The Immaculate Conception of BVM",
        "Dec10": "St Melchiades",
        "Dec11": "St. Damasus, Pope and Confessor",
        "Dec12": "Our Lady of Guadalupe",
        "Dec13": "St. Lucy, Virgin and Martyr",
        "Dec16": "St. Eusebius, Bishop and Martyr",
        "Dec20": "Vigil of St Thomas",
        "Dec21": "St. Thomas the Apostle",
        "Dec26": "St. Stephen the First Martyr",
        "Dec27": "St. John the Apostle, Evangelist",
        "Dec28": "Holy Innocents",
        "Dec29": "St. Thomas of Canterbury, Bishop and Martyr",
        "Dec31": "St. Sylvester, Pope and Confessor",
        "Dec31_v": "St. Sylvester, Pope and Confessor",
        "Quad": "Septuagesima through Lent",
        "Pasch": "Paschal Time",
        "Nat0": "Vigil of Christmas",
        "Quadp1": "Septuagesima Sunday",
        "Quadp2": "Sexagesima Sunday",
        "Quadp3": "Quinquagesima Sunday",
        "Quadw": "Ash Wednesday",
        "HolyThurs": "Maundy Thursday",
        "GoodFri": "Good Friday",
        "HolySat": "Holy Saturday (Easter Vigil)"
    }
};

var DO_FR_TEMPORA_TITLES = {
    'Adv1': "Ier Dimanche de l'Avent",
    'Adv2': "IIe Dimanche de l'Avent",
    'Adv3': "IIIe Dimanche de l'Avent (Gaudete)",
    'Adv3w': "Mercredi des Quatre-Temps de l'Avent",
    'Adv3f': "Vendredi des Quatre-Temps de l'Avent",
    'Adv3s': "Samedi des Quatre-Temps de l'Avent",
    'Adv4': "IVe Dimanche de l'Avent",
    'Nat1': "Dimanche dans l'Octave de Noël",
    'Epi1': "La Sainte Famille",
    'Epi2': "IIe Dimanche après l'Épiphanie",
    'Epi3': "IIIe Dimanche après l'Épiphanie",
    'Epi4': "IVe Dimanche après l'Épiphanie",
    'Epi5': "Ve Dimanche après l'Épiphanie",
    'Epi6': "VIe Dimanche après l'Épiphanie",
    '7a': "Dimanche de la Septuagésime",
    '6a': "Dimanche de la Sexagésime",
    '5a': "Dimanche de la Quinquagésime",
    '5aw': "Mercredi des Cendres",
    'Quad1': "Ier Dimanche de Carême",
    'Quad2': "IIe Dimanche de Carême",
    'Quad3': "IIIe Dimanche de Carême",
    'Quad4': "IVe Dimanche de Carême (Lætare)",
    'Quad5': "Dimanche de la Passion",
    'Quad6': "Dimanche des Rameaux",
    'Pasc0': "Dimanche de Pâques (Résurrection)",
    'Pasc1': "Dimanche de Quasimodo (In Albis)",
    'Pasc2': "IIe Dimanche après Pâques (Bon Pasteur)",
    'Pasc3': "IIIe Dimanche après Pâques",
    'Pasc4': "IVe Dimanche après Pâques",
    'Pasc5': "Ve Dimanche après Pâques",
    'Asc': "Ascension de Notre Seigneur",
    'Asc1': "Dimanche après l'Ascension",
    'Pent0': "Dimanche de la Pentecôte",
    'Pent1': "La Très Sainte Trinité",
    'Pent01': "La Très Sainte Trinité",
    'Pent2': "2e Dimanche après la Pentecôte",
    'Pent02': "2e Dimanche après la Pentecôte",
    'Pent3': "3e Dimanche après la Pentecôte",
    'Pent03': "3e Dimanche après la Pentecôte",
    'Pent4': "4e Dimanche après la Pentecôte",
    'Pent04': "4e Dimanche après la Pentecôte",
    'Pent5': "5e Dimanche après la Pentecôte",
    'Pent05': "5e Dimanche après la Pentecôte",
    'Pent6': "6e Dimanche après la Pentecôte",
    'Pent06': "6e Dimanche après la Pentecôte",
    'Pent7': "7e Dimanche après la Pentecôte",
    'Pent07': "7e Dimanche après la Pentecôte",
    'Pent8': "8e Dimanche après la Pentecôte",
    'Pent08': "8e Dimanche après la Pentecôte",
    'Pent9': "9e Dimanche après la Pentecôte",
    'Pent09': "9e Dimanche après la Pentecôte",
    'Pent10': "10e Dimanche après la Pentecôte",
    'Pent11': "11e Dimanche après la Pentecôte",
    'Pent12': "12e Dimanche après la Pentecôte",
    'Pent13': "13e Dimanche après la Pentecôte",
    'Pent14': "14e Dimanche après la Pentecôte",
    'Pent15': "15e Dimanche après la Pentecôte",
    'Pent16': "16e Dimanche après la Pentecôte",
    'Pent17': "17e Dimanche après la Pentecôte",
    'Pent18': "18e Dimanche après la Pentecôte",
    'Pent19': "19e Dimanche après la Pentecôte",
    'Pent20': "20e Dimanche après la Pentecôte",
    'Pent21': "21e Dimanche après la Pentecôte",
    'Pent22': "22e Dimanche après la Pentecôte",
    'Pent23': "23e Dimanche après la Pentecôte",
    'Pent24': "24e et dernier Dimanche après la Pentecôte",
    'CorpusChristi': "Fête-Dieu (Très Saint Sacrement)",
    'SCJ': "Fête du Sacré-Cœur de Jésus",
    'ChristusRex': "Fête du Christ-Roi"
};

function getVernacularItemTitle(item, uiLang) {
    if (!uiLang) uiLang = getUiLang();
    var k = item.key || '';

    // Check authentic [Officium] dictionary matching header and file
    if (typeof DO_UNIFIED_TITLES !== 'undefined' && DO_UNIFIED_TITLES[uiLang] && DO_UNIFIED_TITLES[uiLang][k]) {
        return DO_UNIFIED_TITLES[uiLang][k];
    }
    if ((uiLang === 'fr' || uiLang === 'bilingual') && typeof DO_UNIFIED_TITLES !== 'undefined' && DO_UNIFIED_TITLES.fr && DO_UNIFIED_TITLES.fr[k]) {
        return DO_UNIFIED_TITLES.fr[k];
    }

    // Temporal fallback
    if (typeof DO_FR_TEMPORA_TITLES !== 'undefined' && DO_FR_TEMPORA_TITLES[k] && (uiLang === 'fr' || uiLang === 'bilingual')) {
        return DO_FR_TEMPORA_TITLES[k];
    }

    // Latin UI
    if (uiLang === 'la') {
        var laT = item.title || item.key;
        return laT.replace(/^[A-Za-z]{3}\s*\d{1,2}:\s*/, '').replace(/^\d{1,2}\s*[A-Za-z]{3}:\s*/, '');
    }

    // English UI
    if (uiLang === 'en') {
        var enT = item.en || item.title || item.key;
        return enT.replace(/^[A-Za-z]{3}\s*\d{1,2}:\s*/, '').replace(/^\d{1,2}\s*[A-Za-z]{3}:\s*/, '');
    }

    var t = item.title || item.en || item.key;
    return t.replace(/^[A-Za-z]{3}\s*\d{1,2}:\s*/, '').replace(/^\d{1,2}\s*[A-Za-z]{3}:\s*/, '');
}

var DO_MONTH_NAMES = {
    fr: ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'],
    la: ['Januarius', 'Februarius', 'Martius', 'Aprilis', 'Maius', 'Junius', 'Julius', 'Augustus', 'September', 'October', 'November', 'December'],
    en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    es: ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
};

var DO_WEEKDAY_NAMES = {
    fr: ['Di', 'Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa'],
    la: ['Do', 'Fe2', 'Fe3', 'Fe4', 'Fe5', 'Fe6', 'Sa'],
    en: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
    es: ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá']
};

function renderCustomCalendarGrid() {
    var $container = $('#hddCustomCalendar');
    if (!$container.length) return;
    $container.empty();

    var uiLang = getUiLang();
    if (!doState.calView) {
        doState.calView = { year: doState.date.year(), month: doState.date.month() };
    }

    var year = doState.calView.year;
    var month = doState.calView.month;
    var monthNames = DO_MONTH_NAMES[uiLang] || DO_MONTH_NAMES['fr'];
    var monthTitle = monthNames[month] + ' ' + year;

    // Month Navigation Row
    var $monthRow = $('<div class="hdd-cal-month-row">')
        .append('<button id="btnHddCalPrevMonth" class="hdd-cal-month-nav" title="Mensis præcedens"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg></button>')
        .append('<span class="hdd-cal-month-title">' + escHtml(monthTitle) + '</span>')
        .append('<button id="btnHddCalNextMonth" class="hdd-cal-month-nav" title="Mensis sequens"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg></button>');

    // Weekdays Row
    var weekDays = DO_WEEKDAY_NAMES[uiLang] || DO_WEEKDAY_NAMES['fr'];
    var $weekRow = $('<div class="hdd-cal-weekdays">');
    weekDays.forEach(function(wd) {
        $weekRow.append('<span>' + wd + '</span>');
    });

    // Days Grid
    var $daysGrid = $('<div class="hdd-cal-days-grid">');

    var startOfMonth = moment({ year: year, month: month, day: 1 });
    var daysInMonth = startOfMonth.daysInMonth();
    var firstDayOfWeek = startOfMonth.day(); // 0 = Sun

    var prevMonth = moment(startOfMonth).subtract(1, 'month');
    var prevMonthDays = prevMonth.daysInMonth();
    for (var i = firstDayOfWeek - 1; i >= 0; i--) {
        var dayNum = prevMonthDays - i;
        var mDate = moment(prevMonth).date(dayNum);
        $daysGrid.append(createCalDayButton(dayNum, true, mDate));
    }

    var todayStr = moment().format('YYYY-MM-DD');
    var curSelectedStr = doState.date.format('YYYY-MM-DD');

    for (var d = 1; d <= daysInMonth; d++) {
        var mDate = moment({ year: year, month: month, day: d });
        var isToday = (mDate.format('YYYY-MM-DD') === todayStr);
        var isSelected = (mDate.format('YYYY-MM-DD') === curSelectedStr);
        $daysGrid.append(createCalDayButton(d, false, mDate, isToday, isSelected));
    }

    var nextMonth = moment(startOfMonth).add(1, 'month');
    var totalCells = firstDayOfWeek + daysInMonth;
    var remaining = 7 - (totalCells % 7);
    if (remaining < 7) {
        for (var n = 1; n <= remaining; n++) {
            var mDate = moment(nextMonth).date(n);
            $daysGrid.append(createCalDayButton(n, true, mDate));
        }
    }

    $container.append($monthRow).append($weekRow).append($daysGrid);
}

function createCalDayButton(dayNum, isOther, mDate, isToday, isSelected) {
    var cls = 'hdd-cal-day-cell';
    if (isOther) cls += ' other-month';
    if (isToday) cls += ' today';
    if (isSelected) cls += ' selected';

    var $btn = $('<button class="' + cls + '">').text(dayNum);
    $btn.on('click', function(e) {
        e.stopPropagation();
        triggerHapticFeedback('selection');
        doState.date = mDate;
        doState.officiumKey = null;
        doState.userChangedHddMode = false;
        localStorage.removeItem('do_officiumKey');
        doState.calView = { year: mDate.year(), month: mDate.month() };
        closeHeaderDropdown();
        if (window.OremusRouter) window.OremusRouter.syncUrl({ push: true });
        renderDO();
    });
    return $btn;
}

function formatMonthGroupTitle(momDate, uiLang) {
    if (!momDate || !momDate.isValid()) return '';
    var mIdx = momDate.month();
    var yr = momDate.year();
    var monthNamesFr = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    var monthNamesLa = ['Ianuarius', 'Februarius', 'Martius', 'Aprilis', 'Maius', 'Iunius', 'Iulius', 'Augustus', 'September', 'October', 'November', 'December'];
    var monthNamesEn = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    var monthNamesEs = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    var mName = (uiLang === 'la') ? monthNamesLa[mIdx] : (uiLang === 'fr') ? monthNamesFr[mIdx] : (uiLang === 'es') ? monthNamesEs[mIdx] : monthNamesEn[mIdx];
    return mName + ' ' + yr;
}

function renderHeaderDropdown() {
    var isBible = (doState.hora === 'bible');
    var uiLang = getUiLang();

    var yearStr = doState.date ? doState.date.year() : moment().year();
    var annusLabel = (uiLang === 'fr' ? 'Année ' + yearStr : (uiLang === 'es' ? 'Año ' + yearStr : (uiLang === 'en' ? 'Year ' + yearStr : 'Annus ' + yearStr)));
    var temporaleLabel = (uiLang === 'fr' ? 'Temporal' : (uiLang === 'es' ? 'Temporal' : (uiLang === 'en' ? 'Temporal' : 'Temporale')));
    var sanctoraleLabel = (uiLang === 'fr' ? 'Sanctoral' : (uiLang === 'es' ? 'Santoral' : (uiLang === 'en' ? 'Sanctoral' : 'Sanctorale')));
    var todayLabel = (uiLang === 'fr' ? "Aujourd'hui" : (uiLang === 'es' ? 'Hoy' : (uiLang === 'en' ? 'Today' : 'Hodie')));
    var searchPlaceholder = (uiLang === 'fr' ? 'Rechercher un jour ou une fête…' : (uiLang === 'es' ? 'Buscar un día o fiesta…' : (uiLang === 'en' ? 'Search a day or feast…' : 'Quaere diem vel festum…')));
    var bibleSearchPlaceholder = (uiLang === 'fr' ? 'Rechercher un livre ou un chapitre…' : (uiLang === 'es' ? 'Buscar un libro o capítulo…' : (uiLang === 'en' ? 'Search a book or chapter…' : 'Quaere librum vel caput…')));

    var curMode = isBible ? 'bible' : 'liturgy';
    var controlsMode = $('#hddControlsContainer').attr('data-mode');

    if (controlsMode !== curMode) {
        $('#hddControlsContainer').attr('data-mode', curMode).empty();
        if (isBible) {
            var bibleMode = doState.hddBibleMode || 'vetus';
            var $searchBar = $('<div class="hdd-search-bar">')
                .append('<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" class="hdd-search-icon"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>')
                .append('<input type="text" id="hddSearchInput" class="hdd-search-input" placeholder="' + escHtml(bibleSearchPlaceholder) + '" autocomplete="off" spellcheck="false">');

            var $controlsRow = $('<div class="hdd-controls-row">');
            var $modeGroup = $('<div class="hdd-mode-group" style="width:100%;">')
                .append('<button class="hdd-mode-btn' + (bibleMode === 'vetus' ? ' active' : '') + '" data-bible-mode="vetus">Vetus Testamentum (46)</button>')
                .append('<button class="hdd-mode-btn' + (bibleMode === 'novum' ? ' active' : '') + '" data-bible-mode="novum">Novum Testamentum (27)</button>');
            $controlsRow.append($modeGroup);

            $('#hddControlsContainer').append($searchBar).append($controlsRow);
        } else {
            var mode = doState.hddMode || 'annus';
            var dateFormatted = formatLiturgicalDate(doState.date, uiLang);

            var $calContainer = $('<div id="hddCustomCalendar" class="hdd-custom-calendar' + (doState.calOpen ? '' : ' hidden') + '"></div>');

            var $searchBar = $('<div class="hdd-search-bar">')
                .append('<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" class="hdd-search-icon"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>')
                .append('<input type="text" id="hddSearchInput" class="hdd-search-input" placeholder="' + escHtml(searchPlaceholder) + '" autocomplete="off" spellcheck="false">');

            var $controlsRow = $('<div class="hdd-controls-row">');

            var $modeGroup = $('<div class="hdd-mode-group">')
                .append('<button class="hdd-mode-btn' + (mode === 'annus' ? ' active' : '') + '" data-mode="annus">' + escHtml(annusLabel) + '</button>')
                .append('<button class="hdd-mode-btn' + (mode === 'temporum' ? ' active' : '') + '" data-mode="temporum">' + escHtml(temporaleLabel) + '</button>')
                .append('<button class="hdd-mode-btn' + (mode === 'sanctorum' ? ' active' : '') + '" data-mode="sanctorum">' + escHtml(sanctoraleLabel) + '</button>');

            var $dateGroup = $('<div class="hdd-date-group">')
                .append('<button id="btnHddPrevDay" class="hdd-date-nav" title="Præcedens"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"></polyline></svg></button>')
                .append(
                    $('<button id="btnHddCalendarToggle" class="hdd-date-btn" title="Calendrier">')
                        .append('<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>')
                        .append('<span id="hddDateBtnText">' + escHtml(dateFormatted) + '</span>')
                        .append('<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" class="hdd-cal-chevron' + (doState.calOpen ? ' open' : '') + '"><polyline points="6 9 12 15 18 9"></polyline></svg>')
                )
                .append('<button id="btnHddNextDay" class="hdd-date-nav" title="Sequens"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg></button>')
                .append('<button id="btnHddToday" class="hdd-today-btn">' + escHtml(todayLabel) + '</button>');

            $controlsRow.append($modeGroup).append($dateGroup);

            $('#hddControlsContainer').append($calContainer).append($searchBar).append($controlsRow);
            if (doState.calOpen) {
                renderCustomCalendarGrid();
            }
        }
    } else {
        if (isBible) {
            var bibleMode = doState.hddBibleMode || 'vetus';
            $('.hdd-mode-btn[data-bible-mode]').removeClass('active');
            $('.hdd-mode-btn[data-bible-mode="' + bibleMode + '"]').addClass('active');
            $('#hddSearchInput').attr('placeholder', bibleSearchPlaceholder);
        } else {
            var mode = doState.hddMode || 'annus';
            $('.hdd-mode-btn[data-mode="annus"]').text(annusLabel);
            $('.hdd-mode-btn[data-mode="temporum"]').text(temporaleLabel);
            $('.hdd-mode-btn[data-mode="sanctorum"]').text(sanctoraleLabel);
            $('.hdd-mode-btn[data-mode]').removeClass('active');
            $('.hdd-mode-btn[data-mode="' + mode + '"]').addClass('active');
            $('#btnHddToday').text(todayLabel);
            $('#hddDateBtnText').text(formatLiturgicalDate(doState.date, uiLang));
            $('#hddSearchInput').attr('placeholder', searchPlaceholder);
            if (doState.calOpen) {
                renderCustomCalendarGrid();
            }
        }
    }

    renderHeaderDropdownItems();
}

var DO_LITURGICAL_FR_ALIASES = {
    // Seasons
    'Adv': 'Avent premier deuxieme troisieme quatrieme',
    'Nat': 'Noel Nativite Circoncision Sainte Famille Saint Nom de Jesus',
    'Epi': 'Epiphanie Rois Mages Bapteme du Seigneur',
    '7a': 'Septuagesime',
    '6a': 'Sexagesime',
    '5a': 'Quinquagesime',
    '5aw': 'Mercredi des Cendres Cendres',
    'Quad': 'Careme Quadragesime',
    'Quad5': 'Passion Temps de la Passion',
    'Quad6': 'Rameaux Semaine Sainte Lundi Saint Mardi Saint Mercredi Saint Jeudi Saint Vendredi Saint Samedi Saint',
    'Pasc': 'Paques Temps Pascal Octave de Paques Quasimodo Bon Pasteur',
    'Asc': 'Ascension du Seigneur',
    'Pent': 'Pentecote Octave de Pentecote Sainte Trinite Saint Sacrement Fete Dieu Sacre Coeur Christ Roi',
    'CorpusChristi': 'Saint Sacrement Fete Dieu Corpus Domini',
    'SCJ': 'Sacre Coeur de Jesus',
    'ChristusRex': 'Christ Roi du Monde',
    // Universal Major Feasts & Saints
    '08-15': 'Assomption Sainte Vierge Marie',
    '11-01': 'Toussaint Fete de tous les saints',
    '11-02': 'Fideles Defunts Morts',
    '12-08': 'Immaculee Conception',
    '12-25': 'Noel Nativite du Seigneur',
    '01-01': 'Circoncision Sainte Marie Mere de Dieu Jour de l An',
    '01-06': 'Epiphanie Rois Mages',
    '02-02': 'Purification Chandeleur Presentation',
    '03-19': 'Saint Joseph Epoux de la Vierge Marie',
    '03-25': 'Annonciation de la Sainte Vierge',
    '06-24': 'Saint Jean Baptiste',
    '06-29': 'Saints Pierre et Paul Apotres',
    '08-06': 'Transfiguration',
    '08-24': 'Saint Barthelemy Barthelemy Apotre',
    '08-25': 'Saint Louis Roi de France',
    '09-14': 'Exaltation de la Sainte Croix',
    '09-29': 'Saint Michel Archange Anges',
    '10-07': 'Notre Dame du Rosaire'
};

function getFrAliasesForKey(key) {
    if (!key) return '';
    var res = [];
    Object.keys(DO_LITURGICAL_FR_ALIASES).forEach(function(k) {
        if (key.indexOf(k) === 0 || key === k) {
            res.push(DO_LITURGICAL_FR_ALIASES[k]);
        }
    });
    return res.join(' ');
}

function normalizeSearchStr(str) {
    if (!str) return '';
    return str.toString()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // remove all accents and diacritics
        .replace(/æ/g, 'ae')
        .replace(/œ/g, 'oe')
        .replace(/’/g, "'")
        .trim();
}

function renderHeaderDropdownItems() {
    var isBible = (doState.hora === 'bible');
    var $list = $('#hddItemsList').empty();
    var uiLang = getUiLang();
    var rawInput = $('#hddSearchInput').val() || '';
    var normalizedFilter = normalizeSearchStr(rawInput);
    var tokens = normalizedFilter.split(/\s+/).filter(Boolean);

    if (isBible) {
        var bibleMode = doState.hddBibleMode || 'vetus';
        var bookGroups = {};

        DO_BIBLE_BOOKS.forEach(function(bk) {
            var isNT = (bk.cat === 'Évangiles & Actes' || bk.cat === 'Évangiles' || bk.cat === 'Actes des Apôtres' || bk.cat === 'Épîtres de saint Paul' || bk.cat === 'Épîtres Catholiques' || bk.cat === 'Apocalypse');
            if (!tokens.length && ((bibleMode === 'vetus' && isNT) || (bibleMode === 'novum' && !isNT))) return;

            var titleLa = bk.la || bk.id;
            var titleVern = bk[uiLang] || bk.fr || bk.en || '';
            var fullSearchStr = normalizeSearchStr(titleLa + ' ' + titleVern + ' ' + (bk.fr || '') + ' ' + (bk.en || '') + ' ' + bk.id + ' ' + (bk.cat || ''));

            if (tokens.length > 0) {
                var matchesAll = tokens.every(function(tok) { return fullSearchStr.indexOf(tok) >= 0; });
                if (!matchesAll) return;
            }

            var catName = bk.cat || (isNT ? 'Novum Testamentum' : 'Vetus Testamentum');
            if (!bookGroups[catName]) bookGroups[catName] = [];
            bookGroups[catName].push(bk);
        });

        var hasBooks = false;
        Object.keys(bookGroups).forEach(function(catName) {
            var bks = bookGroups[catName];
            if (!bks.length) return;
            hasBooks = true;

            $list.append('<div class="hdd-group-title">' + escHtml(catName) + '</div>');

            bks.forEach(function(bk) {
                var isCurBook = (bk.id === doState.bible.book);
                var bkTitle = (uiLang === 'la' ? bk.la : (bk[uiLang] || bk.fr || bk.la)) || bk.id;

                var $card = $('<div class="hdd-bible-book-card">');
                var $header = $('<div class="hdd-bible-book-header">')
                    .append('<span class="hdd-bible-book-name">' + escHtml(bkTitle) + (bk.la && bk.la !== bkTitle ? ' <small style="opacity:0.6; font-weight:normal;">(' + escHtml(bk.la) + ')</small>' : '') + '</span>')
                    .append('<span class="hdd-bible-book-cat">' + bk.chapters + ' ' + (uiLang === 'fr' ? 'chap.' : 'cap.') + '</span>');

                var $chGrid = $('<div class="hdd-bible-chapters-grid">');
                for (var ch = 1; ch <= bk.chapters; ch++) {
                    var isCurCh = (isCurBook && ch === doState.bible.chapter);
                    (function(chNum) {
                        var $chBtn = $('<button class="hdd-bible-ch-btn' + (isCurCh ? ' active' : '') + '">')
                            .text(chNum)
                            .on('click', function(e) {
                                e.stopPropagation();
                                triggerHapticFeedback('selection');
                                doState.bible.book = bk.id;
                                doState.bible.chapter = chNum;
                                doState.bible.page = 1;
                                localStorage.setItem('do_bible_book', bk.id);
                                localStorage.setItem('do_bible_chapter', chNum);
                                localStorage.setItem('do_bible_page', 1);
                                closeHeaderDropdown();
                                if (window.OremusRouter) window.OremusRouter.syncUrl({ push: true });
                                renderDO();
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                            });
                        $chGrid.append($chBtn);
                    })(ch);
                }

                $card.append($header).append($chGrid);
                $list.append($card);
            });
        });

        if (!hasBooks) {
            $list.html('<div style="text-align:center; padding:32px 16px; opacity:0.6; font-size:0.9rem; font-family:\'Inter\',sans-serif;">' + (uiLang === 'fr' ? 'Aucun livre trouvé pour votre recherche' : 'Nullus liber inventus') + '</div>');
        }

    } else {
        var mode = doState.hddMode || 'annus';
        var curDateStr = doState.date.format('YYYY-MM-DD');
        var year = doState.date.year();

        var allSundays = (typeof sundayKeys !== 'undefined' ? sundayKeys : (window.sundayKeys || []));
        var allSaints = (typeof saintKeys !== 'undefined' ? saintKeys : (window.saintKeys || []));

        var groups = {};
        var groupOrder = [];

        if (mode === 'annus') {
            var allItems = [];
            var seenKeys = {};

            // 1. Temporale items
            allSundays.forEach(function(item) {
                if (!item.key) return;
                var itemDate = getDateForLiturgicalKey(item.key, year);
                if (!itemDate || !itemDate.isValid()) return;

                var titleLa = item.title || item.key;
                var titleEn = item.en || '';
                var titleFr = (typeof item.fr === 'string' ? item.fr : '');
                var frAlias = getFrAliasesForKey(item.key);
                var searchTarget = normalizeSearchStr(titleLa + ' ' + titleEn + ' ' + titleFr + ' ' + item.key + ' ' + frAlias);

                if (tokens.length > 0) {
                    var matchesAll = tokens.every(function(tok) { return searchTarget.indexOf(tok) >= 0; });
                    if (!matchesAll) return;
                }

                allItems.push({
                    item: item,
                    itemDate: itemDate,
                    isTempora: true
                });
            });

            // 2. Sanctorale items
            allSaints.forEach(function(item) {
                if (!item.key) return;
                var baseKey = item.key.replace(/_[a-z0-9]+$/i, '');
                if (item.key.indexOf('_') !== -1 && seenKeys[baseKey]) return;
                if (seenKeys[item.key]) return;
                seenKeys[item.key] = true;
                seenKeys[baseKey] = true;

                var itemDate = getDateForLiturgicalKey(item.key, year);
                if (!itemDate || !itemDate.isValid()) return;

                var titleLa = item.title || item.key;
                var titleEn = item.en || '';
                var titleFr = (typeof item.fr === 'string' ? item.fr : '');
                var frAlias = getFrAliasesForKey(item.key);
                var searchTarget = normalizeSearchStr(titleLa + ' ' + titleEn + ' ' + titleFr + ' ' + item.key + ' ' + frAlias);

                if (tokens.length > 0) {
                    var matchesAll = tokens.every(function(tok) { return searchTarget.indexOf(tok) >= 0; });
                    if (!matchesAll) return;
                }

                allItems.push({
                    item: item,
                    itemDate: itemDate,
                    isTempora: false
                });
            });

            // Sort all items chronologically by date
            allItems.sort(function(a, b) {
                var diff = a.itemDate.valueOf() - b.itemDate.valueOf();
                if (diff !== 0) return diff;
                return a.isTempora ? -1 : 1;
            });

            // Group chronologically by month
            allItems.forEach(function(entry) {
                var grp = formatMonthGroupTitle(entry.itemDate, uiLang);
                if (!groups[grp]) {
                    groups[grp] = [];
                    groupOrder.push(grp);
                }
                groups[grp].push(entry);
            });

        } else if (mode === 'temporum') {
            allSundays.forEach(function(item) {
                if (!item.key) return;
                var titleLa = item.title || item.key;
                var titleEn = item.en || '';
                var titleFr = (typeof item.fr === 'string' ? item.fr : '');
                var frAlias = getFrAliasesForKey(item.key);
                var searchTarget = normalizeSearchStr(titleLa + ' ' + titleEn + ' ' + titleFr + ' ' + item.key + ' ' + frAlias);

                if (tokens.length > 0) {
                    var matchesAll = tokens.every(function(tok) { return searchTarget.indexOf(tok) >= 0; });
                    if (!matchesAll) return;
                }

                var grp = getLiturgicalSeasonGroup(item.key, uiLang);
                if (!groups[grp]) {
                    groups[grp] = [];
                    groupOrder.push(grp);
                }
                groups[grp].push(item);
            });
        } else {
            var seenKeys = {};
            allSaints.forEach(function(item) {
                if (!item.key) return;
                var baseKey = item.key.replace(/_[a-z0-9]+$/i, '');
                if (item.key.indexOf('_') !== -1 && seenKeys[baseKey]) return;
                if (seenKeys[item.key]) return;
                seenKeys[item.key] = true;
                seenKeys[baseKey] = true;
                var titleLa = item.title || item.key;
                var titleEn = item.en || '';
                var titleFr = (typeof item.fr === 'string' ? item.fr : '');
                var frAlias = getFrAliasesForKey(item.key);
                var searchTarget = normalizeSearchStr(titleLa + ' ' + titleEn + ' ' + titleFr + ' ' + item.key + ' ' + frAlias);

                if (tokens.length > 0) {
                    var matchesAll = tokens.every(function(tok) { return searchTarget.indexOf(tok) >= 0; });
                    if (!matchesAll) return;
                }

                var grp = getSanctoralMonthGroup(item.key, uiLang);
                if (!groups[grp]) {
                    groups[grp] = [];
                    groupOrder.push(grp);
                }
                groups[grp].push(item);
            });
        }

        var hasItems = false;
        (groupOrder.length ? groupOrder : Object.keys(groups)).forEach(function(grpName) {
            var rawList = groups[grpName];
            if (!rawList || !rawList.length) return;
            hasItems = true;

            $list.append('<div class="hdd-group-title">' + escHtml(grpName) + '</div>');

            rawList.forEach(function(rawEntry) {
                var item = rawEntry.item ? rawEntry.item : rawEntry;
                var itemDate = rawEntry.itemDate ? rawEntry.itemDate : getDateForLiturgicalKey(item.key, year);
                var isSel = doState.officiumKey ? (item.key === doState.officiumKey) : (itemDate && itemDate.format('YYYY-MM-DD') === curDateStr && !item.key.match(/_[a-z0-9]+$/i));
                var dateBadge = itemDate ? formatBadgeDate(itemDate, uiLang) : '';
                var dispTitle = getVernacularItemTitle(item, uiLang);

                var $card = $('<button class="hdd-item-card' + (isSel ? ' selected' : '') + '">')
                    .append('<span class="hdd-item-title">' + escHtml(dispTitle) + '</span>')
                    .append('<span class="hdd-item-date">' + dateBadge + '</span>')
                    .on('click', function(e) {
                        e.stopPropagation();
                        triggerHapticFeedback('selection');
                        if (itemDate && itemDate.isValid()) {
                            doState.date = itemDate;
                            doState.officiumKey = null;
                            doState.userChangedHddMode = false;
                            localStorage.removeItem('do_officiumKey');
                        }
                        closeHeaderDropdown();
                        if (window.OremusRouter) window.OremusRouter.syncUrl({ push: true });
                        renderDO();
                    });

                $list.append($card);
            });
        });

        if (!hasItems) {
            $list.html('<div style="text-align:center; padding:32px 16px; opacity:0.6; font-size:0.9rem; font-family:\'Inter\',sans-serif;">' + (uiLang === 'fr' ? 'Aucune fête trouvée pour votre recherche' : 'Nullum festum inventum') + '</div>');
        }
    }
}

function getDefaultHddModeForDate(date) {
    return 'annus';
}

function updateHeaderDropdownPosition() {
    var $dd = $('#headerDropdown');
    if ($dd.hasClass('hidden')) return;
    var headerEl = document.querySelector('.do-top-header');
    if (headerEl) {
        var headerBottom = headerEl.getBoundingClientRect().bottom;
        $dd.css({
            'top': Math.round(headerBottom) + 'px',
            'max-height': 'calc(100dvh - ' + Math.round(headerBottom) + 'px)',
            'height': 'calc(100dvh - ' + Math.round(headerBottom) + 'px)'
        });
    }
}

function openHeaderDropdown() {
    if (typeof closeMassTocPanel === 'function') {
        closeMassTocPanel();
    }
    $('body').addClass('header-dropdown-open');
    if (!doState.userChangedHddMode) {
        doState.hddMode = getDefaultHddModeForDate(doState.date);
    }
    renderHeaderDropdown();
    updateHeaderDropdownPosition();
    $('#headerDropdown').removeClass('hidden');
    $('.dropdown-icon').css('transform', 'rotate(180deg)');
    setTimeout(function() {
        updateHeaderDropdownPosition();
        var $list = $('#hddItemsList');
        var $sel = $('#hddItemsList .hdd-item-card.selected, #hddItemsList .hdd-bible-ch-btn.active');
        if ($sel.length && $sel[0] && $list.length && $list[0]) {
            $list[0].scrollTop = $sel[0].offsetTop - 120;
        }
    }, 50);
}

function closeHeaderDropdown() {
    $('body').removeClass('header-dropdown-open');
    $('#headerDropdown').addClass('hidden');
    $('.dropdown-icon').css('transform', 'rotate(0deg)');
}

window.addEventListener('resize', updateHeaderDropdownPosition);
window.addEventListener('scroll', updateHeaderDropdownPosition, { passive: true });

// ---- Theme & Color Management ----
function initTheme() {
    var theme = doState.settings.theme || 'auto';
    var effectiveTheme = theme;
    if (theme === 'auto') {
        var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        effectiveTheme = prefersDark ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', effectiveTheme);
    } else {
        document.documentElement.setAttribute('data-theme', theme);
    }
    updateStatusBarTheme(effectiveTheme);
    updateEffectiveColor();
    updateFaviconAndAppIcon();
    if (doState.hora === 'missa_gregorian') {
        renderAllChantScoresInDOM($('#do-content-stream'), true);
    }
}

function updateStatusBarTheme(theme) {
    var isLight = (theme === 'light');
    var bgColor = (theme === 'oled') ? '#000000' : (theme === 'light' ? '#faf8f5' : '#121214');

    // 1. Update HTML meta theme-color
    var $meta = $('meta[name="theme-color"]');
    if (!$meta.length) {
        $meta = $('<meta name="theme-color">').appendTo('head');
    }
    $meta.attr('content', bgColor);

    // 2. Update Android native status bar via JavascriptInterface
    try {
        if (window.AndroidAppIcon && typeof window.AndroidAppIcon.setStatusBarTheme === 'function') {
            window.AndroidAppIcon.setStatusBarTheme(theme, bgColor);
        }
    } catch (e) {
        console.warn('StatusBar native error:', e);
    }

    // 3. Fallback to Capacitor StatusBar plugin
    try {
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.StatusBar) {
            window.Capacitor.Plugins.StatusBar.setStyle({
                style: isLight ? 'LIGHT' : 'DARK'
            }).catch(function() {});
            window.Capacitor.Plugins.StatusBar.setBackgroundColor({
                color: bgColor
            }).catch(function() {});
        }
    } catch (e) {}
}

function getEffectiveIconColor() {
    if (doState.settings.iconSync) {
        return doState.settings.color || '#c96b63';
    }
    return (doState.settings.iconColor === 'default') ? '#e4e4e7' : (doState.settings.iconColor || '#e4e4e7');
}

function updateFaviconAndAppIcon() {
    var effColor = getEffectiveIconColor();
    var svgData = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">' +
        '<rect width="512" height="512" rx="115" fill="#121214"/>' +
        '<g transform="translate(256, 256) scale(1.7) translate(-163.926, -590.396)">' +
        '<g transform="matrix(5.069816,0,0,5.069816,-1181.3253,-599.436706)">' +
        '<path d="M265.345,214.945C268.352,214.945 271.145,215.453 273.725,216.47C276.305,217.487 278.57,218.903 280.52,220.72C282.47,222.537 283.987,224.662 285.07,227.095C286.154,229.528 286.695,232.162 286.695,234.995C286.695,237.695 286.148,240.228 285.054,242.595C283.96,244.962 282.438,247.028 280.488,248.795C278.539,250.562 276.273,251.945 273.691,252.945C271.108,253.945 268.329,254.445 265.354,254.445C262.378,254.445 259.599,253.945 257.017,252.945C254.435,251.945 252.169,250.562 250.219,248.795C248.27,247.028 246.745,244.962 245.645,242.595C244.545,240.228 243.995,237.695 243.995,234.995C243.995,232.162 244.537,229.528 245.62,227.095C246.704,224.662 248.22,222.537 250.17,220.72C252.12,218.903 254.385,217.487 256.965,216.47C259.545,215.453 262.338,214.945 265.345,214.945ZM265.351,251.195C267.947,251.195 270.187,250.545 272.07,249.245C273.954,247.945 275.412,246.088 276.445,243.675C277.479,241.261 277.995,238.418 277.995,235.145C277.995,231.678 277.487,228.678 276.47,226.145C275.454,223.612 273.998,221.653 272.103,220.27C270.208,218.887 267.958,218.195 265.353,218.195C262.748,218.195 260.503,218.883 258.617,220.259C256.732,221.635 255.273,223.593 254.242,226.134C253.211,228.675 252.695,231.678 252.695,235.141C252.695,238.411 253.212,241.253 254.245,243.67C255.279,246.087 256.739,247.945 258.626,249.245C260.515,250.545 262.756,251.195 265.351,251.195Z" fill="' + effColor + '" style="fill-rule:nonzero;"/>' +
        '</g>' +
        '<path d="M146.046,524.564L182.114,524.564C182.114,524.564 182.805,526.506 182.281,527.223C174.967,537.224 176.131,571.602 176.131,571.602C176.131,571.602 204.276,572.294 214.858,566.283C215.39,565.981 216.687,566.449 216.687,566.449L216.853,599.359C216.853,599.359 215.237,600.405 214.526,600.024C201.866,593.237 175.798,594.539 175.798,594.539C176.325,627.366 172.945,671.274 194.747,666.343C187.793,678.365 141.254,678.642 134.079,666.675C158.651,671.495 148.595,614.457 151.698,594.539C151.698,594.539 121.225,594.401 112.804,600.024C112.308,600.356 111.142,599.359 111.142,599.359L111.308,566.283C111.308,566.283 112.506,565.44 112.97,565.784C121.973,572.461 151.365,571.436 151.365,571.436C151.365,571.436 151.753,539.191 145.382,526.891C145.011,526.175 146.046,524.564 146.046,524.564Z" fill="' + effColor + '"/>' +
        '</g></svg>';
    var faviconUri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgData);
    
    // Remove existing favicon and apple touch icon links to force instant browser refresh
    $('link[rel*="icon"]').remove();
    $('link[rel="apple-touch-icon"]').remove();

    var $newFavicon = $('<link rel="icon" id="dynamicFavicon" type="image/svg+xml">').attr('href', faviconUri);
    var $newApple = $('<link rel="apple-touch-icon" id="dynamicAppleIcon">').attr('href', faviconUri);
    $('head').append($newFavicon).append($newApple);

    // Update Live preview in Settings
    $('#iconPreviewSvg path').attr('fill', effColor);
    var labelText = doState.settings.iconSync ? 'Synchronisé avec l\'application (' + doState.settings.color + ')' : (doState.settings.iconColor === 'default' ? 'Sans couleur (Neutre / Blanc)' : 'Couleur personnalisée (' + doState.settings.iconColor + ')');
    $('#iconPreviewDesc').text(labelText);

    // Sync Android native launcher icon
    var colorAliasMap = {
        '#c96b63': 'Red',
        '#987dc2': 'Purple',
        '#8a6b9a': 'Purple',
        '#589c77': 'Green',
        '#5b8a72': 'Green',
        '#c4984f': 'Gold',
        '#c49b4b': 'Gold',
        '#5c8bb8': 'Blue',
        '#5078a0': 'Blue',
        '#cc738a': 'Rose',
        '#c46b85': 'Rose',
        '#ba8155': 'Amber',
        '#7e8590': 'Grey',
        '#202022': 'Default',
        '#e4e4e7': 'Default'
    };
    var currentAlias = colorAliasMap[(effColor || '').toLowerCase()] || 'Default';
    if (isAndroidNativeApp()) {
        applyNativeAndroidAppIcon(currentAlias, false);
    }
}

var pendingIconConfig = null;

function isAndroidNativeApp() {
    return !!(window.AndroidAppIcon || (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()));
}

function requestIconColorChange(color, isSync) {
    var effColor = (isSync !== undefined ? isSync : doState.settings.iconSync) 
        ? (doState.settings.color || '#c96b63') 
        : ((color !== undefined ? color : doState.settings.iconColor) === 'default' ? '#e4e4e7' : (color || doState.settings.iconColor || '#e4e4e7'));
    
    var colorAliasMap = {
        '#c96b63': 'Red',
        '#987dc2': 'Purple',
        '#8a6b9a': 'Purple',
        '#589c77': 'Green',
        '#5b8a72': 'Green',
        '#c4984f': 'Gold',
        '#c49b4b': 'Gold',
        '#5c8bb8': 'Blue',
        '#5078a0': 'Blue',
        '#cc738a': 'Rose',
        '#c46b85': 'Rose',
        '#ba8155': 'Amber',
        '#7e8590': 'Grey',
        '#202022': 'Default',
        '#e4e4e7': 'Default'
    };
    var alias = colorAliasMap[(effColor || '').toLowerCase()] || 'Default';

    applyIconColor(color, isSync);

    if (isAndroidNativeApp()) {
        pendingIconConfig = { color: color, isSync: isSync, alias: alias };
        applyNativeAndroidAppIcon(alias, false);
        $('#appIconModalBackdrop, #appIconModal').removeClass('hidden');
    }
}

function closeAppIconModal() {
    $('#appIconModalBackdrop, #appIconModal').addClass('hidden');
    pendingIconConfig = null;
}

function applyNativeAndroidAppIcon(aliasSuffix, restartNow) {
    try {
        if (window.AndroidAppIcon && typeof window.AndroidAppIcon.setIcon === 'function') {
            window.AndroidAppIcon.setIcon(aliasSuffix || 'Default', !!restartNow);
        } else if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.AppIcon) {
            if (aliasSuffix && aliasSuffix !== 'Default') {
                window.Capacitor.Plugins.AppIcon.setName({ name: 'MainActivity' + aliasSuffix }).catch(function() {});
            } else {
                window.Capacitor.Plugins.AppIcon.reset().catch(function() {});
            }
        }
    } catch (e) {
        console.warn('Native app icon error:', e);
    }
}

function applyIconColor(color, isSync) {
    if (isSync !== undefined) {
        doState.settings.iconSync = !!isSync;
        localStorage.setItem('do_icon_sync', doState.settings.iconSync ? 'true' : 'false');
    }
    if (color !== undefined) {
        doState.settings.iconColor = color;
        localStorage.setItem('do_icon_color', color);
    }
    updateFaviconAndAppIcon();
}

// ── Haptic Feedback Engine (Intelligent, Multi-tier & Design-aware) ──
function triggerHapticFeedback(patternOrType, fallbackDuration) {
    if (localStorage.getItem('do_haptics') === 'false') return;

    var styleMode = localStorage.getItem('do_haptic_style') || 'balanced'; // 'light' | 'balanced' | 'rich'
    var type = 'tap';
    var customDur = 20;

    if (typeof patternOrType === 'string') {
        type = patternOrType;
    } else if (typeof patternOrType === 'number') {
        customDur = patternOrType;
        type = 'custom';
    } else if (Array.isArray(patternOrType)) {
        type = 'custom_array';
    }

    var capHaptics = (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics) ? window.Capacitor.Plugins.Haptics : null;

    try {
        if (capHaptics) {
            switch (type) {
                case 'selection':
                case 'subtle':
                    if (styleMode === 'light') {
                        capHaptics.selectionChanged().catch(function(){});
                    } else {
                        capHaptics.impact({ style: 'LIGHT' }).catch(function(){});
                    }
                    break;
                case 'light':
                case 'step':
                case 'note':
                    capHaptics.impact({ style: 'LIGHT' }).catch(function(){});
                    break;
                case 'medium':
                case 'swipe':
                case 'toggle':
                case 'tap':
                    if (styleMode === 'light') {
                        capHaptics.impact({ style: 'LIGHT' }).catch(function(){});
                    } else if (styleMode === 'rich') {
                        capHaptics.impact({ style: 'MEDIUM' }).catch(function(){});
                    } else {
                        capHaptics.impact({ style: 'LIGHT' }).catch(function(){});
                    }
                    break;
                case 'heavy':
                case 'open':
                case 'celebrate':
                    if (styleMode === 'light') {
                        capHaptics.impact({ style: 'MEDIUM' }).catch(function(){});
                    } else {
                        capHaptics.impact({ style: 'HEAVY' }).catch(function(){});
                    }
                    break;
                case 'success':
                    capHaptics.notification({ type: 'SUCCESS' }).catch(function(){
                        capHaptics.impact({ style: 'MEDIUM' }).catch(function(){});
                    });
                    break;
                case 'warning':
                    capHaptics.notification({ type: 'WARNING' }).catch(function(){
                        capHaptics.impact({ style: 'HEAVY' }).catch(function(){});
                    });
                    break;
                case 'error':
                    capHaptics.notification({ type: 'ERROR' }).catch(function(){});
                    break;
                case 'custom':
                    capHaptics.vibrate({ duration: customDur }).catch(function(){
                        capHaptics.impact({ style: 'MEDIUM' }).catch(function(){});
                    });
                    break;
                default:
                    capHaptics.impact({ style: 'LIGHT' }).catch(function(){});
                    break;
            }
            return;
        }
    } catch (e) {}

    // Fallback Web navigator.vibrate with patterned vibration signatures
    try {
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            if (navigator.userActivation && !navigator.userActivation.hasBeenActive) {
                return;
            }
            if (typeof document !== 'undefined' && document.hidden) {
                return;
            }
            var mult = (styleMode === 'light') ? 0.6 : (styleMode === 'rich') ? 1.4 : 1.0;
            switch (type) {
                case 'selection':
                case 'subtle':
                    navigator.vibrate(Math.round(8 * mult));
                    break;
                case 'light':
                case 'step':
                case 'note':
                    navigator.vibrate(Math.round(12 * mult));
                    break;
                case 'medium':
                case 'swipe':
                case 'toggle':
                case 'tap':
                    navigator.vibrate(Math.round(20 * mult));
                    break;
                case 'heavy':
                case 'open':
                    navigator.vibrate(Math.round(35 * mult));
                    break;
                case 'success':
                    navigator.vibrate([Math.round(15 * mult), 40, Math.round(25 * mult)]);
                    break;
                case 'warning':
                    navigator.vibrate([Math.round(25 * mult), 50, Math.round(35 * mult)]);
                    break;
                case 'error':
                    navigator.vibrate([Math.round(35 * mult), 40, Math.round(35 * mult), 40, Math.round(50 * mult)]);
                    break;
                case 'custom_array':
                    navigator.vibrate(patternOrType);
                    break;
                case 'custom':
                    navigator.vibrate(Math.round(customDur * mult));
                    break;
                default:
                    navigator.vibrate(Math.round((fallbackDuration || 18) * mult));
                    break;
            }
        }
    } catch (e) {}
}

// ── GitHub Releases Update Engine ──
var CURRENT_APP_VERSION = 'beta-0.0.55';

function parseVersionString(str) {
    if (!str) return [0, 0, 0];
    var clean = str.replace(/^(v|beta-|vbeta-)+/i, '').trim();
    var parts = clean.split('.').map(function(p) {
        var n = parseInt(p, 10);
        return isNaN(n) ? 0 : n;
    });
    while (parts.length < 3) parts.push(0);
    return parts;
}

function compareVersions(v1, v2) {
    var p1 = parseVersionString(v1);
    var p2 = parseVersionString(v2);
    for (var i = 0; i < Math.max(p1.length, p2.length); i++) {
        var num1 = p1[i] || 0;
        var num2 = p2[i] || 0;
        if (num1 > num2) return 1;
        if (num1 < num2) return -1;
    }
    return 0;
}

function isNativeAndroidApp() {
    try {
        return !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
    } catch (e) {
        return false;
    }
}

function isAppForeground() {
    return (typeof document !== 'undefined' && document.visibilityState === 'visible');
}

function checkForAppUpdates(isManual) {
    var includeBeta = (localStorage.getItem('do_include_beta') !== 'false');
    var $statusText = $('#updateStatusText');
    if (isManual) {
        $statusText.text('Recherche en cours sur GitHub...').css('color', 'var(--text-secondary)');
    }

    var rawVersionUrl = 'https://raw.githubusercontent.com/bastonus/jgabc/master/version.json?_ts=' + Date.now();
    var localVersionUrl = './version.json?_ts=' + Date.now();

    function handleReleasesData(releases) {
        if (!Array.isArray(releases) || !releases.length) {
            if (isManual) {
                $statusText.text('Aucune release disponible sur GitHub').css('color', 'var(--text-tertiary)');
            }
            return;
        }

        // Filter out drafts and prereleases if beta not requested
        var validReleases = releases.filter(function(r) {
            if (r.draft) return false;
            if (!includeBeta && r.prerelease) return false;
            return true;
        });

        // Sort descending by semantic version so the true newest release is always first
        validReleases.sort(function(a, b) {
            return compareVersions(b.tag_name, a.tag_name);
        });

        if (!validReleases.length) {
            if (isManual) {
                $statusText.text('Aucune version stable récente trouvée').css('color', 'var(--text-tertiary)');
            }
            return;
        }

        var targetRelease = validReleases[0];
        var latestTag = targetRelease.tag_name;
        var isNewer = compareVersions(latestTag, CURRENT_APP_VERSION) > 0;

        if (isNewer) {
            window._hasPendingAppUpdate = true;
            if (isManual) {
                $statusText.text('Mise à jour disponible : ' + latestTag).css('color', 'var(--primary-color)');
            }

            var isDismissed = false;
            try {
                isDismissed = sessionStorage.getItem('do_dismissed_update_' + latestTag) === 'true';
            } catch (e) {}

            if (!isDismissed || isManual) {
                showUpdateBanner(targetRelease);

                // Send official system notification on Android ONLY if not already pushed and ONLY in background
                var updateKey = 'update_' + latestTag;
                if (window.OremusSystemNotifications && typeof window.OremusSystemNotifications.send === 'function') {
                    window.OremusSystemNotifications.send(
                        'Mise à jour disponible : ' + latestTag,
                        'Une nouvelle version d\'Oremus est prête au téléchargement.',
                        'updates',
                        { releaseTag: latestTag },
                        updateKey
                    );
                }
            }
        } else {
            window._hasPendingAppUpdate = false;
            if (isManual) {
                $statusText.text('Vous utilisez la dernière version (' + CURRENT_APP_VERSION + ')').css('color', 'var(--text-tertiary)');
            }
        }
    }

    function handleFallbackVersionFile(data) {
        if (!data || !data.latestVersion) throw new Error('Invalid version file');
        var tagName = data.tagName || data.latestVersion;
        var directApkUrl = data.downloadUrl || ('https://github.com/bastonus/jgabc/releases/download/' + tagName + '/Oremus.apk');
        if (directApkUrl.endsWith('app-release.apk')) {
            directApkUrl = directApkUrl.replace(/app-release\.apk$/i, 'Oremus.apk');
        }
        var pseudoRelease = {
            tag_name: tagName,
            html_url: data.htmlUrl || ('https://github.com/bastonus/jgabc/releases/tag/' + tagName),
            body: data.body || ('Mise à jour ' + tagName),
            published_at: data.releaseDate || new Date().toISOString(),
            assets: [
                {
                    name: 'Oremus.apk',
                    browser_download_url: directApkUrl
                }
            ]
        };
        handleReleasesData([pseudoRelease]);
    }

    // Check raw version.json directly (no GitHub API rate limit / 403 Forbidden)
    fetch(rawVersionUrl, { cache: 'no-cache' })
        .then(function(r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        })
        .then(function(vData) {
            handleFallbackVersionFile(vData);
        })
        .catch(function(rawErr) {
            return fetch(localVersionUrl, { cache: 'no-cache' })
                .then(function(r) { return r.json(); })
                .then(function(vData) {
                    handleFallbackVersionFile(vData);
                });
        })
        .catch(function(err) {
            if (isManual) {
                $statusText.text('Vous utilisez la dernière version locale (' + CURRENT_APP_VERSION + ')').css('color', 'var(--text-tertiary)');
            }
        });
}

function parseMarkdownToHtml(md) {
    if (!md) return '';
    var escaped = md
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // Headings
    escaped = escaped.replace(/^#### (.*?)$/gm, '<h5 class="update-md-h4">$1</h5>');
    escaped = escaped.replace(/^### (.*?)$/gm, '<h4 class="update-md-h3">$1</h4>');
    escaped = escaped.replace(/^## (.*?)$/gm, '<h3 class="update-md-h2">$1</h3>');
    escaped = escaped.replace(/^# (.*?)$/gm, '<h2 class="update-md-h1">$1</h2>');

    // Bold & Italic & Code
    escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    escaped = escaped.replace(/\*(.*?)\*/g, '<em>$1</em>');
    escaped = escaped.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Lists
    escaped = escaped.replace(/^[ \t]*[-*+][ \t]+(.*?)$/gm, '<li class="update-md-li">$1</li>');
    escaped = escaped.replace(/(<li class="update-md-li">[\s\S]*?<\/li>)/g, '<ul class="update-md-ul">$1</ul>');
    escaped = escaped.replace(/<\/ul>\s*<ul class="update-md-ul">/g, '');

    // Paragraphs
    escaped = escaped.replace(/\n\n+/g, '</p><p class="update-md-p">');
    escaped = escaped.replace(/\n/g, '<br>');

    return '<div class="update-md-content"><p class="update-md-p">' + escaped + '</p></div>';
}

function showUpdateBanner(release) {
    var tagName = release.tag_name || 'Nouvelle version';
    var isBeta = release.prerelease;
    var bodyNotes = release.body || 'Améliorations générales et corrections de stabilité.';
    window._currentUpdateReleaseTag = tagName;
    
    // Find APK asset
    var apkAsset = null;
    if (release.assets && release.assets.length) {
        apkAsset = release.assets.filter(function(a) {
            return a.name && a.name.toLowerCase().endsWith('.apk');
        })[0] || release.assets[0];
    }
    var downloadUrl = (apkAsset && apkAsset.browser_download_url) ? apkAsset.browser_download_url : (release.html_url || 'https://github.com/bastonus/jgabc/releases');

    var displayTag = tagName;
    if (isBeta && !/b[eê]ta/i.test(tagName)) {
        displayTag += ' (Bêta)';
    }
    $('#updateVersionTag').text(displayTag);

    // Setup progress callback hooks
    window.onUpdateDownloadProgress = function(percent) {
        $('#updateDownloadProgressWrapper').removeClass('hidden');
        $('#btnDownloadUpdate').addClass('hidden');
        $('#updateDownloadProgressBar').css('width', percent + '%');
        $('#updateDownloadProgressText').text(percent + '%');
        if (percent >= 100) {
            $('#updateDownloadProgressText').text('Installation…');
            setTimeout(function() {
                $('#updateDownloadProgressWrapper').addClass('hidden');
                $('#btnDownloadUpdate').removeClass('hidden');
            }, 3500);
        }
    };

    window.onUpdateDownloadError = function(errMsg) {
        $('#updateDownloadProgressWrapper').addClass('hidden');
        $('#btnDownloadUpdate').removeClass('hidden');
        console.warn('Update download error:', errMsg);
    };

    $('#btnDownloadUpdate').off('click').on('click', function(e) {
        e.preventDefault();
        
        // 1. Android Native In-App Direct APK Downloader & Installer
        if (window.AndroidAppUpdate && typeof window.AndroidAppUpdate.downloadAndInstallApk === 'function') {
            $('#updateDownloadProgressWrapper').removeClass('hidden');
            $('#btnDownloadUpdate').addClass('hidden');
            $('#updateDownloadProgressBar').css('width', '0%');
            $('#updateDownloadProgressText').text('0%');
            window.AndroidAppUpdate.downloadAndInstallApk(downloadUrl, tagName);
            return;
        }

        // 2. Demo mode / Web simulation (smooth visual progress)
        if (tagName.includes('Démo') || !isNativeAndroidApp()) {
            $('#updateDownloadProgressWrapper').removeClass('hidden');
            $('#btnDownloadUpdate').addClass('hidden');
            var simPercent = 0;
            var simInterval = setInterval(function() {
                simPercent += Math.floor(Math.random() * 12) + 8;
                if (simPercent >= 100) {
                    simPercent = 100;
                    clearInterval(simInterval);
                    window.onUpdateDownloadProgress(100);
                    if (!tagName.includes('Démo')) {
                        setTimeout(function() { window.open(downloadUrl, '_system'); }, 600);
                    }
                } else {
                    window.onUpdateDownloadProgress(simPercent);
                }
            }, 120);
            return;
        }

        // 3. Fallback
        window.open(downloadUrl, '_system');
    });

    var $banner = $('#appUpdateBanner');
    $('#updateDownloadProgressWrapper').addClass('hidden');
    $('#btnDownloadUpdate').removeClass('hidden');

    // Hide competing banners (one notification at a time)
    $('#appRemoteNotificationBanner').removeClass('is-visible');
    $('#appInstallBanner').removeClass('is-visible');

    $banner.addClass('is-visible');
    setTimeout(updateHeaderDropdownPosition, 300);
}

function hideUpdateBanner() {
    var $banner = $('#appUpdateBanner');
    $banner.removeClass('is-visible');
    setTimeout(updateHeaderDropdownPosition, 300);
    if (window._currentUpdateReleaseTag) {
        try {
            sessionStorage.setItem('do_dismissed_update_' + window._currentUpdateReleaseTag, 'true');
        } catch (e) {}
    }

    // When update banner is closed, allow next pending remote notification to display if any
    setTimeout(function() {
        if (window.OremusNotifications && typeof window.OremusNotifications.check === 'function') {
            window.OremusNotifications.check(false);
        }
    }, 400);
}

function showUpdateModal(release) {
    showUpdateBanner(release);
}

function hideUpdateModal() {
    hideUpdateBanner();
}

function openFeedbackModal() {
    var formId = "b5QOV2";
    var curVersion = typeof CURRENT_APP_VERSION !== 'undefined' ? CURRENT_APP_VERSION : 'beta';
    var curDate = doState.date ? doState.date.format('YYYY-MM-DD') : '';
    var curHora = doState.hora || 'missa';
    var platform = window.Capacitor ? 'Android App' : 'Web';
    var theme = doState.theme || 'dark';

    var queryParams = 'app_version=' + encodeURIComponent(curVersion) +
        '&liturgical_date=' + encodeURIComponent(curDate) +
        '&office=' + encodeURIComponent(curHora) +
        '&platform=' + encodeURIComponent(platform) +
        '&theme=' + encodeURIComponent(theme);

    var tallyEmbedUrl = 'https://tally.so/embed/' + formId + '?alignLeft=1&hideTitle=1&transparentBackground=1&dynamicHeight=0&' + queryParams;
    var tallyDirectUrl = 'https://tally.so/r/' + formId + '?' + queryParams;

    var $iframe = $('#tallyFeedbackIframe');
    var $loading = $('#feedbackLoading').show();
    $('#feedbackFallbackLink').attr('href', tallyDirectUrl);

    var safetyTimer = setTimeout(function() {
        $loading.fadeOut(180);
    }, 1200);

    $iframe.off('load').on('load', function() {
        clearTimeout(safetyTimer);
        $loading.fadeOut(150);
    });

    if ($iframe.attr('src') !== tallyEmbedUrl) {
        $iframe.attr('src', tallyEmbedUrl);
    } else {
        clearTimeout(safetyTimer);
        $loading.hide();
    }

    $('#btnReloadFeedback').off('click').on('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        reloadFeedbackForm();
    });

    $('#btnOpenFeedbackExternal').off('click').on('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        window.open(tallyDirectUrl, '_system');
    });

    $('#feedbackModalBackdrop, #feedbackModal').removeClass('hidden');
}

function reloadFeedbackForm() {
    var formId = "b5QOV2";
    var curVersion = typeof CURRENT_APP_VERSION !== 'undefined' ? CURRENT_APP_VERSION : 'beta';
    var curDate = doState.date ? doState.date.format('YYYY-MM-DD') : '';
    var curHora = doState.hora || 'missa';
    var platform = window.Capacitor ? 'Android App' : 'Web';
    var theme = doState.theme || 'dark';

    var queryParams = 'app_version=' + encodeURIComponent(curVersion) +
        '&liturgical_date=' + encodeURIComponent(curDate) +
        '&office=' + encodeURIComponent(curHora) +
        '&platform=' + encodeURIComponent(platform) +
        '&theme=' + encodeURIComponent(theme) +
        '&_t=' + Date.now();

    var tallyEmbedUrl = 'https://tally.so/embed/' + formId + '?alignLeft=1&hideTitle=1&transparentBackground=1&dynamicHeight=0&' + queryParams;
    var tallyDirectUrl = 'https://tally.so/r/' + formId + '?' + queryParams;

    var $iframe = $('#tallyFeedbackIframe');
    var $loading = $('#feedbackLoading').show();
    $('#feedbackFallbackLink').attr('href', tallyDirectUrl);

    var safetyTimer = setTimeout(function() {
        $loading.fadeOut(180);
    }, 1200);

    $iframe.off('load').on('load', function() {
        clearTimeout(safetyTimer);
        $loading.fadeOut(150);
    });

    $iframe.attr('src', tallyEmbedUrl);
}

function closeFeedbackModal() {
    $('#feedbackModalBackdrop, #feedbackModal').addClass('hidden');
}

function applyColor(hex, isDynamic) {
    if (!hex) hex = '#c96b63';
    doState.settings.color = hex;
    var r = parseInt(hex.slice(1,3), 16);
    var g = parseInt(hex.slice(3,5), 16);
    var b = parseInt(hex.slice(5,7), 16);
    document.documentElement.style.setProperty('--primary-color', hex);
    document.documentElement.style.setProperty('--primary-color-rgb', r + ',' + g + ',' + b);
    if (!isDynamic) {
        localStorage.setItem('do_color', hex);
    }
    if (doState.settings.iconSync) {
        updateFaviconAndAppIcon();
    }
    if (doState.hora === 'missa_gregorian') {
        renderAllChantScoresInDOM($('#do-content-stream'), true);
    }
    $('#doColorOptions .color-swatch-circle, #doColorOptions .color-swatch').removeClass('active');
    $('#doColorOptions [data-color="' + hex + '"]').addClass('active');
}

function getLiturgicalColorForDay(date, officiumKey, callback) {
    var codes = computeLiturgicalCodes(date);
    var feastKey = convertFeastKeyToCode(officiumKey) || null;
    var targetKey = feastKey || codes.sancti;

    function evalSanctiColor(sanctiText) {
        if (!sanctiText) return null;
        var text = sanctiText.toLowerCase();
        if (text.indexOf('vide c2') !== -1 || text.indexOf('vide c3') !== -1 || text.indexOf('martyr') !== -1) {
            return '#c96b63'; // Rouge (Martyrs)
        }
        if (text.indexOf('vide c9') !== -1 || text.indexOf('vide c11') !== -1 || text.indexOf('mariæ') !== -1 || text.indexOf('mariae') !== -1 || text.indexOf('virginis mari') !== -1) {
            return '#c4984f'; // Or / Blanc (Vierge Marie)
        }
        if (text.indexOf('vide c4') !== -1 || text.indexOf('vide c5') !== -1 || text.indexOf('vide c6') !== -1 || text.indexOf('vide c7') !== -1 || text.indexOf('vide c8') !== -1 || text.indexOf('vide c12') !== -1) {
            return '#c4984f'; // Or / Blanc (Confesseurs, Vierges, Dédicaces)
        }
        if (text.indexOf('vide c10') !== -1 || text.indexOf('defunctorum') !== -1) {
            return '#7e8590'; // Gris minéral / Noir (Défunts)
        }
        if (text.indexOf('vide c1') !== -1) {
            return '#c96b63'; // Rouge (Apôtres)
        }
        return null;
    }

    function evalTemporaColor(tempCode) {
        if (!tempCode) return '#589c77';
        if (tempCode === 'Adv3-0') return '#cc738a'; // Gaudete Rose
        if (tempCode.indexOf('Adv') === 0) return '#987dc2'; // Avent Violet
        if (tempCode.indexOf('Nat') === 0) return '#c4984f'; // Noël Or/Blanc
        if (tempCode === 'Quad4-0') return '#cc738a'; // Laetare Rose
        if (tempCode.indexOf('Quadp') === 0 || tempCode.indexOf('Quad') === 0) return '#987dc2'; // Carême/Septuagésime Violet
        if (tempCode.indexOf('Pasc7') === 0) return '#c96b63'; // Octave de Pentecôte Rouge
        if (tempCode.indexOf('Pasc') === 0) return '#c4984f'; // Temps Pascal Or/Blanc
        if (tempCode.indexOf('Pent01-0') === 0) return '#c4984f'; // Trinité Or/Blanc
        return '#589c77'; // Vert (Temps après la Pentecôte / Épiphanie)
    }

    var laDayPath = 'do_data/horas/Latin/Sancti/' + targetKey + '.txt';
    fetchLocalFile(laDayPath, function(err, data) {
        if (!err && data) {
            var sanctiColor = evalSanctiColor(data);
            if (sanctiColor) {
                if (codes.isSunday && !feastKey) {
                    var isGreater = isSanctiGreaterFeastOnSunday(data);
                    if (!isGreater) {
                        callback(evalTemporaColor(codes.tempora));
                        return;
                    }
                }
                callback(sanctiColor);
                return;
            }
        }
        callback(evalTemporaColor(codes.tempora));
    });
}

function updateEffectiveColor() {
    if (doState.settings.liturgicalColorSync) {
        getLiturgicalColorForDay(doState.date, doState.officiumKey, function(color) {
            applyColor(color, true);
        });
    } else {
        var manualColor = localStorage.getItem('do_color') || '#c96b63';
        applyColor(manualColor, false);
    }
}

// ── PWA & Service Worker Engine ──
var deferredInstallPrompt = null;

function isIosDevice() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isAndroidDevice() {
    return /Android/i.test(navigator.userAgent);
}

function isAppStandalone() {
    return !!(
        (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
        window.navigator.standalone === true ||
        isNativeAndroidApp()
    );
}

var _swRegistration = null;

function requestPersistentStorage() {
    try {
        if (navigator.storage && navigator.storage.persist) {
            navigator.storage.persisted().then(function(isPersisted) {
                console.log('[Storage] Storage persisted:', isPersisted);
                if (!isPersisted) {
                    navigator.storage.persist().then(function(granted) {
                        console.log('[Storage] Persistence request granted:', granted);
                    });
                }
            }).catch(function(e) {
                console.warn('[Storage] Persistence check error:', e);
            });
        }
    } catch (e) {}
}

function registerOremusServiceWorker() {
    requestPersistentStorage();

    if ('serviceWorker' in navigator) {
        window.addEventListener('load', function() {
            navigator.serviceWorker.register('sw.js')
                .then(function(reg) {
                    _swRegistration = reg;
                    console.log('[PWA] Service Worker registered with scope:', reg.scope);

                    reg.onupdatefound = function() {
                        var installingWorker = reg.installing;
                        if (!installingWorker) return;
                        installingWorker.onstatechange = function() {
                            if (installingWorker.state === 'installed') {
                                if (navigator.serviceWorker.controller) {
                                    console.log('[PWA] Nouvelle version installée en arrière-plan.');
                                }
                            }
                        };
                    };
                })
                .catch(function(err) {
                    console.warn('[PWA] Service Worker registration failed:', err);
                });

            // iOS app resume check: force check for updates when returning to the app
            document.addEventListener('visibilitychange', function() {
                if (document.visibilityState === 'visible' && _swRegistration) {
                    _swRegistration.update().catch(function() {});
                }
            });

            window.addEventListener('focus', function() {
                if (_swRegistration) {
                    _swRegistration.update().catch(function() {});
                }
            });
        });
    }
}

function showInstallBanner() {
    // Only show on mobile (iOS or Android web), not standalone, not native app, not desktop
    if (isNativeAndroidApp() || isAppStandalone() || (window.innerWidth && window.innerWidth > 900)) return;
    if (!isIosDevice() && !isAndroidDevice()) return;

    try {
        if (sessionStorage.getItem('do_dismissed_install_banner') === 'true' ||
            localStorage.getItem('do_dismissed_install_banner') === 'true') {
            return;
        }
    } catch (e) {}

    // Strict single banner rule: if update banner or remote notification banner is active, do not display install banner
    if ($('#appUpdateBanner').hasClass('is-visible') || $('#appRemoteNotificationBanner').hasClass('is-visible')) {
        return;
    }

    var $banner = $('#appInstallBanner');
    if (!$banner.length) return;

    if (isIosDevice()) {
        $('#installPlatformTag').text('iOS');
        $banner.find('.do-update-banner-title').text('Installer l\'application');
        $('#btnInstallAppBanner span').text('Installer');
    } else if (isAndroidDevice()) {
        $('#installPlatformTag').text('APK');
        $banner.find('.do-update-banner-title').text('Application Android');
        $('#btnInstallAppBanner span').text('Télécharger');
    }

    $banner.addClass('is-visible');
    setTimeout(updateHeaderDropdownPosition, 300);
}

function hideInstallBanner(permanent) {
    var $banner = $('#appInstallBanner');
    $banner.removeClass('is-visible');
    setTimeout(updateHeaderDropdownPosition, 300);
    if (permanent) {
        try {
            sessionStorage.setItem('do_dismissed_install_banner', 'true');
        } catch (e) {}
    }
}

function showPwaInstallModal() {
    if (!isIosDevice()) return;
    $('#pwaInstallModalBackdrop, #pwaInstallModal').removeClass('hidden');
}

function hidePwaInstallModal() {
    $('#pwaInstallModalBackdrop, #pwaInstallModal').addClass('hidden');
}

function triggerPwaInstall() {
    if (isIosDevice()) {
        showPwaInstallModal();
    } else if (isAndroidDevice()) {
        window.open('https://github.com/bastonus/jgabc/releases', '_blank');
    } else if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        deferredInstallPrompt.userChoice.then(function(choiceResult) {
            if (choiceResult && choiceResult.outcome === 'accepted') {
                console.log('[PWA] User accepted installation');
            }
            deferredInstallPrompt = null;
        });
    }
}

// =============================================================
// REMOTE GITHUB NOTIFICATION ENGINE (BARS, TOASTS & RICH POPUPS)
// =============================================================

var OremusNotifications = (function() {
    var GITHUB_FEED_URL = 'https://raw.githubusercontent.com/bastonus/jgabc/master/notifications.json';
    var LOCAL_FEED_URL = './notifications.json';
    var activeNotifications = [];
    var currentBannerNotif = null;
    var currentModalNotif = null;
    var floatingTimer = null;

    function getPlatform() {
        if (isNativeAndroidApp()) return 'android_native';
        if (isIosDevice()) return isAppStandalone() ? 'ios_pwa' : 'ios_web';
        if (isAndroidDevice()) return isAppStandalone() ? 'android_pwa' : 'android_web';
        if (isAppStandalone()) return 'pwa';
        return 'web';
    }

    function isPlatformMatching(platforms) {
        if (!platforms || !Array.isArray(platforms) || platforms.includes('all')) return true;
        var p = getPlatform();
        var isIos = isIosDevice();
        var isAndroid = isAndroidDevice();

        for (var i = 0; i < platforms.length; i++) {
            var target = platforms[i].toLowerCase();
            if (target === p) return true;
            if (target === 'ios' && isIos) return true;
            if (target === 'android' && isAndroid) return true;
            if (target === 'android_web' && isAndroid && !isNativeAndroidApp()) return true;
            if (target === 'android_native' && isNativeAndroidApp()) return true;
            if (target === 'pwa' && isAppStandalone()) return true;
            if (target === 'web' && !isNativeAndroidApp() && !isAppStandalone()) return true;
        }
        return false;
    }

    function isFrequencyAllowed(notif) {
        var freq = notif.frequency || 'once';
        var id = notif.id;

        // If cancelled by another notification, never show
        if (localStorage.getItem('do_notif_status_' + id) === 'cancelled') {
            return false;
        }

        if (freq === 'once') {
            return localStorage.getItem('do_notif_status_' + id) !== 'dismissed';
        } else if (freq === 'session') {
            return sessionStorage.getItem('do_notif_session_' + id) !== 'dismissed';
        } else if (freq === 'always') {
            return sessionStorage.getItem('do_notif_temp_dismiss_' + id) !== 'true';
        }
        return true;
    }

    function markNotificationDismissed(notifId, freq) {
        if (freq === 'once') {
            try { localStorage.setItem('do_notif_status_' + notifId, 'dismissed'); } catch (e) {}
        } else if (freq === 'session') {
            try { sessionStorage.setItem('do_notif_session_' + notifId, 'dismissed'); } catch (e) {}
        } else {
            try { sessionStorage.setItem('do_notif_temp_dismiss_' + notifId, 'true'); } catch (e) {}
        }
    }

    function getIconSvg(iconName) {
        var icons = {
            'sparkles': '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>',
            'bell': '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path>',
            'download': '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line>',
            'music': '<path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle>',
            'book-open': '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>',
            'info': '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>',
            'alert': '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>',
            'check': '<polyline points="20 6 9 17 4 12"></polyline>',
            'cross': '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>'
        };

        var path = icons[iconName] || icons['bell'];
        return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' + path + '</svg>';
    }

    function fetchFeed(forceRefresh) {
        var rawUrl = GITHUB_FEED_URL + '?_ts=' + Date.now();

        // 1. Interrogation directe du fichier raw (sans headers personnalisés pour éviter le rejet OPTIONS CORS et sans rate-limit API)
        return fetch(rawUrl)
            .then(function(res) {
                if (!res.ok) throw new Error('Raw HTTP ' + res.status);
                return res.json();
            })
            .catch(function(rawErr) {
                // 2. Repli local direct (fichier embarqué ou cache localStorage) sans interroger api.github.com
                return fetch(LOCAL_FEED_URL + '?_ts=' + Date.now())
                    .then(function(r) {
                        if (!r.ok) throw new Error('Local HTTP ' + r.status);
                        return r.json();
                    })
                    .catch(function() {
                        var cached = localStorage.getItem('do_remote_notifications_cache');
                        if (cached) {
                            try { return JSON.parse(cached); } catch (e) {}
                        }
                        return { notifications: [] };
                    });
            })
            .then(function(data) {
                if (data && Array.isArray(data.notifications)) {
                    try {
                        localStorage.setItem('do_remote_notifications_cache', JSON.stringify(data));
                    } catch (e) {}
                    return data.notifications;
                }
                return [];
            })
            .catch(function(err) {
                return [];
            });
    }

    function evaluateNotifications(list) {
        if (!Array.isArray(list) || !list.length) return [];

        var now = new Date();

        // 1. Process cancellations first
        list.forEach(function(n) {
            if (n.enabled && Array.isArray(n.cancelsNotifications)) {
                n.cancelsNotifications.forEach(function(cancelId) {
                    try {
                        localStorage.setItem('do_notif_status_' + cancelId, 'cancelled');
                    } catch (e) {}
                });
            }
        });

        // 2. Filter valid notifications
        var valid = list.filter(function(n) {
            if (!n || !n.enabled) return false;
            if (!n.id) return false;

            // Platform check
            if (!isPlatformMatching(n.platforms)) return false;

            // Frequency / cancellation check
            if (!isFrequencyAllowed(n)) return false;

            // Date limits
            if (n.startDate && new Date(n.startDate) > now) return false;
            if (n.endDate && new Date(n.endDate) < now) return false;

            // Version bounds
            if (n.minVersion && typeof compareVersions === 'function') {
                if (compareVersions(CURRENT_APP_VERSION, n.minVersion) < 0) return false;
            }
            if (n.maxVersion && typeof compareVersions === 'function') {
                if (compareVersions(CURRENT_APP_VERSION, n.maxVersion) > 0) return false;
            }

            // Dependency check: only show if dependsOn was dismissed
            if (n.dependsOn) {
                var depStatus = localStorage.getItem('do_notif_status_' + n.dependsOn);
                if (depStatus !== 'dismissed' && depStatus !== 'cancelled') {
                    return false;
                }
            }

            return true;
        });

        // 3. Sort by priority (higher priority first)
        valid.sort(function(a, b) {
            var pa = (typeof a.priority === 'number') ? a.priority : 0;
            var pb = (typeof b.priority === 'number') ? b.priority : 0;
            return pb - pa;
        });

        return valid;
    }

    function showBanner(notif) {
        if (!notif) return;

        // Strict single banner rule: if update banner is currently visible, do not stack remote banner
        if ($('#appUpdateBanner').hasClass('is-visible')) {
            return;
        }

        // Hide lower priority install banner
        $('#appInstallBanner').removeClass('is-visible');

        currentBannerNotif = notif;
        var bannerData = notif.banner || {};
        var $banner = $('#appRemoteNotificationBanner');
        if (!$banner.length) return;

        // Reset style classes
        $banner.removeClass('style-liturgical style-ios style-android style-warning style-accent');
        if (notif.style) {
            $banner.addClass('style-' + notif.style);
        }

        // Icon
        var iconSvg = getIconSvg(notif.icon || 'bell');
        $('#remoteNotifBannerIcon').html(iconSvg);

        // Text and Badge
        var bannerText = bannerData.text || notif.title || 'Notification';
        var bannerTag = bannerData.tag || notif.badge || 'Info';
        $('#remoteNotifBannerTitle').text(bannerText);
        $('#remoteNotifBannerTag').text(bannerTag);

        // Action button
        var actionLabel = bannerData.actionLabel || 'Voir';
        $('#btnRemoteNotifAction span').text(actionLabel);

        if (bannerData.dismissible === false) {
            $('#btnCloseRemoteNotifBanner').hide();
        } else {
            $('#btnCloseRemoteNotifBanner').show();
        }

        $banner.addClass('is-visible');
        setTimeout(updateHeaderDropdownPosition, 300);
    }

    function hideBanner(markDismissed) {
        var $banner = $('#appRemoteNotificationBanner');
        $banner.removeClass('is-visible');
        setTimeout(updateHeaderDropdownPosition, 300);

        if (markDismissed && currentBannerNotif) {
            markNotificationDismissed(currentBannerNotif.id, currentBannerNotif.frequency);
        }

        // Sequential notification chaining: show the next pending notification after dismissing
        setTimeout(function() {
            if (!$('#appUpdateBanner').hasClass('is-visible') && !window._hasPendingAppUpdate) {
                checkAndRun(false);
            }
        }, 400);
    }

    function showFloating(notif) {
        if (!notif) return;
        var $toast = $('#appFloatingNotification');
        if (!$toast.length) return;

        var iconSvg = getIconSvg(notif.icon || 'bell');
        $('#floatingNotifIconCircle').html(iconSvg);
        $('#floatingNotifTitle').text(notif.title || 'Oremus');
        $('#floatingNotifBadge').text(notif.badge || 'Info');
        $('#floatingNotifBody').text(notif.message || (notif.banner ? notif.banner.text : ''));

        if (notif.banner && notif.banner.actionLabel) {
            $('#btnFloatingNotifAction').show().find('span').text(notif.banner.actionLabel);
        } else {
            $('#btnFloatingNotifAction').show().find('span').text('Voir');
        }

        $toast.removeClass('hidden');
        triggerHapticFeedback('light');

        if (floatingTimer) clearTimeout(floatingTimer);
        floatingTimer = setTimeout(function() {
            hideFloating(false);
        }, 9000);
    }

    function hideFloating(markDismissed) {
        var $toast = $('#appFloatingNotification');
        $toast.addClass('hidden');
        if (floatingTimer) {
            clearTimeout(floatingTimer);
            floatingTimer = null;
        }
        if (markDismissed && currentBannerNotif) {
            markNotificationDismissed(currentBannerNotif.id, currentBannerNotif.frequency);
        }
    }

    function showModal(notif) {
        if (!notif) return;
        currentModalNotif = notif;
        var modalData = notif.modal || {};

        var title = modalData.title || notif.title || 'Annonce';
        var subtitle = modalData.subtitle || notif.subtitle || '';
        var badge = notif.badge || 'Oremus';
        var message = notif.message || '';
        var icon = modalData.icon || notif.icon || 'bell';

        // Header
        $('#remoteNotifModalTitle').text(title);
        $('#remoteNotifModalTag').text(badge);
        $('#remoteNotifModalIconCircle').html(getIconSvg(icon));

        // Subtitle
        if (subtitle) {
            $('#remoteNotifModalSubtitle').text(subtitle).removeClass('hidden');
        } else {
            $('#remoteNotifModalSubtitle').addClass('hidden');
        }

        // Message body
        if (message) {
            var formatted = (typeof parseMarkdownToHtml === 'function') ? parseMarkdownToHtml(message) : message;
            $('#remoteNotifModalMessage').html(formatted).removeClass('hidden');
        } else {
            $('#remoteNotifModalMessage').addClass('hidden');
        }

        // Render Wrappers (Cards, Callouts, Steps)
        var $wrappersContainer = $('#remoteNotifModalWrappers');
        $wrappersContainer.empty();

        if (Array.isArray(modalData.wrappers) && modalData.wrappers.length) {
            modalData.wrappers.forEach(function(w) {
                if (w.type === 'card') {
                    var cardIcon = getIconSvg(w.icon || 'sparkles');
                    var cardHtml = '<div class="remote-notif-card-item">' +
                        '<div class="remote-notif-card-icon">' + cardIcon + '</div>' +
                        '<div class="remote-notif-card-text">' +
                            '<div class="remote-notif-card-title">' + (w.title || '') + '</div>' +
                            '<div class="remote-notif-card-desc">' + (w.content || '') + '</div>' +
                        '</div>' +
                    '</div>';
                    $wrappersContainer.append(cardHtml);
                } else if (w.type === 'callout') {
                    var styleClass = w.style ? 'style-' + w.style : '';
                    var calloutHtml = '<div class="remote-notif-callout ' + styleClass + '">' +
                        (w.title ? '<div class="remote-notif-callout-title">' + w.title + '</div>' : '') +
                        '<div class="remote-notif-callout-content">' + (w.content || '') + '</div>' +
                    '</div>';
                    $wrappersContainer.append(calloutHtml);
                } else if (w.type === 'steps') {
                    var stepsHtml = '<div class="remote-notif-steps-box">';
                    if (w.title) stepsHtml += '<div class="remote-notif-steps-title">' + w.title + '</div>';
                    stepsHtml += '<div class="remote-notif-steps-list">';
                    if (Array.isArray(w.steps)) {
                        w.steps.forEach(function(stepText, idx) {
                            stepsHtml += '<div class="remote-notif-step-row">' +
                                '<span class="remote-notif-step-num">' + (idx + 1) + '</span>' +
                                '<span class="remote-notif-step-desc">' + stepText + '</span>' +
                            '</div>';
                        });
                    }
                    stepsHtml += '</div></div>';
                    $wrappersContainer.append(stepsHtml);
                }
            });
        }

        // Render Action Buttons
        var $actionsContainer = $('#remoteNotifModalActions');
        $actionsContainer.empty();

        var buttons = modalData.buttons;
        if (!Array.isArray(buttons) || !buttons.length) {
            buttons = [
                { label: 'J\'ai compris', type: 'primary', action: 'dismiss', dismissOnClick: true }
            ];
        }

        buttons.forEach(function(btn, idx) {
            var btnTypeClass = 'remote-notif-btn-' + (btn.type || 'primary');
            var $btn = $('<button class="remote-notif-btn ' + btnTypeClass + '"></button>');
            $btn.text(btn.label || 'Action');
            $btn.data('btn-index', idx);
            $btn.data('btn-action', btn.action || 'dismiss');
            $btn.data('btn-url', btn.url || '');
            $btn.data('btn-target', btn.target || '');
            $btn.data('btn-dismiss', btn.dismissOnClick !== false);
            $actionsContainer.append($btn);
        });

        $('#remoteNotificationModalBackdrop, #remoteNotificationModal').removeClass('hidden');
        triggerHapticFeedback('open');
    }

    function hideModal(markDismissed) {
        $('#remoteNotificationModalBackdrop, #remoteNotificationModal').addClass('hidden');
        if (markDismissed && currentModalNotif) {
            markNotificationDismissed(currentModalNotif.id, currentModalNotif.frequency);
        }

        // Sequential notification chaining: show the next pending notification after dismissing modal
        setTimeout(function() {
            if (!$('#appUpdateBanner').hasClass('is-visible') && !window._hasPendingAppUpdate) {
                checkAndRun(false);
            }
        }, 400);
    }

    function handleAction(notif, actionType, url, target) {
        if (!actionType) actionType = 'open_modal';

        if (actionType === 'open_modal') {
            showModal(notif);
        } else if (actionType === 'open_feedback') {
            hideModal(true);
            openFeedbackModal();
        } else if (actionType === 'open_url') {
            if (url) {
                window.open(url, '_blank');
            }
        } else if (actionType === 'open_page') {
            if (target) {
                closeModals();
                doState.hora = target;
                localStorage.setItem('do_hora', target);
                renderDO();
            }
        } else if (actionType === 'copy_text') {
            if (url && navigator.clipboard) {
                navigator.clipboard.writeText(url);
                triggerHapticFeedback('success');
            }
        } else if (actionType === 'dismiss') {
            hideModal(true);
        }
    }

    function checkAndRun(forceRefresh) {
        fetchFeed(forceRefresh).then(function(list) {
            var valid = evaluateNotifications(list);
            activeNotifications = valid;

            if (!valid.length) {
                console.log('[RemoteNotifications] No pending notifications for current platform & state.');
                return;
            }

            // Do not show remote notification if app update banner is visible or pending update is found
            if ($('#appUpdateBanner').hasClass('is-visible') || window._hasPendingAppUpdate) {
                console.log('[RemoteNotifications] App update banner has priority, postponing remote notification.');
                return;
            }

            var primary = valid[0];

            // Decide presentation for in-app display (highest priority first)
            if (primary.banner && primary.banner.show !== false) {
                showBanner(primary);
            } else if (primary.target === 'toast' || primary.target === 'floating') {
                showFloating(primary);
            } else if (primary.target === 'modal' || primary.autoOpenModal) {
                showModal(primary);
            }

            // Remote notification is shown in-app; background system push will be handled when the app enters background
        });
    }

    return {
        check: checkAndRun,
        showBanner: showBanner,
        hideBanner: hideBanner,
        showFloating: showFloating,
        hideFloating: hideFloating,
        showModal: showModal,
        hideModal: hideModal,
        handleAction: handleAction,
        getActive: function() { return activeNotifications; },
        getCurrentBanner: function() { return currentBannerNotif; },
        getCurrentModal: function() { return currentModalNotif; }
    };
})();

// =============================================================
// SYSTEM / ANDROID OFFICIAL NOTIFICATIONS & 20-MIN PROMPT ENGINE
// =============================================================

var OremusSystemNotifications = (function() {
    var CHANNELS = {
        'updates': { id: 'oremus_updates', name: 'Mises à jour de l\'application', desc: 'Notifications lors de la parution de nouvelles versions et correctifs' },
        'announcements': { id: 'oremus_announcements', name: 'Annonces & Canal officiel', desc: 'Alertes et informations officielles diffusées en temps réel' },
        'liturgy': { id: 'oremus_liturgy', name: 'Fêtes liturgiques & Prière', desc: 'Rappels des fêtes liturgiques et temps de prière' }
    };

    function isSupported() {
        if (isNativeAndroidApp() && window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) {
            return true;
        }
        return ('Notification' in window);
    }

    function isEnabled() {
        return localStorage.getItem('do_notifications_enabled') !== 'false';
    }

    function isCategoryEnabled(cat) {
        if (!cat) return true;
        return localStorage.getItem('do_notif_cat_' + cat) !== 'false';
    }

    function setCategoryEnabled(cat, enabled) {
        if (!cat) return;
        localStorage.setItem('do_notif_cat_' + cat, enabled ? 'true' : 'false');
    }

    function setEnabled(enabled) {
        localStorage.setItem('do_notifications_enabled', enabled ? 'true' : 'false');
        $('#toggleSystemNotifications').prop('checked', enabled);
        if (enabled) {
            $('#subNotificationSettings').slideDown(150);
        } else {
            $('#subNotificationSettings').slideUp(150);
        }
    }

    function initChannels() {
        if (isNativeAndroidApp() && window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) {
            try {
                var plugin = window.Capacitor.Plugins.LocalNotifications;
                if (typeof plugin.createChannel === 'function') {
                    Object.keys(CHANNELS).forEach(function(key) {
                        var ch = CHANNELS[key];
                        plugin.createChannel({
                            id: ch.id,
                            name: ch.name,
                            description: ch.desc,
                            importance: 4,
                            visibility: 1
                        }).catch(function() {});
                    });
                }

                // Handle click on native push notification: open the linked popup modal
                plugin.addListener('localNotificationActionPerformed', function(notificationAction) {
                    var extra = (notificationAction && notificationAction.notification) ? notificationAction.notification.extra : null;
                    var notifId = extra ? extra.notifId : null;
                    if (notifId && window.OremusNotifications) {
                        var list = window.OremusNotifications.getActive();
                        var target = list.find(function(n) { return n.id === notifId; });
                        if (target) {
                            setTimeout(function() {
                                window.OremusNotifications.showModal(target);
                            }, 500);
                        }
                    }
                });
            } catch (e) {}
        }
    }

    function openSystemSettings() {
        if (window.AndroidNotification && typeof window.AndroidNotification.openSystemNotificationSettings === 'function') {
            window.AndroidNotification.openSystemNotificationSettings();
            return;
        }
        if (isNativeAndroidApp() && window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
            try {
                window.Capacitor.Plugins.App.openUrl({ url: 'package:' + window.location.hostname });
            } catch (e) {}
        }
    }

    function requestPermission() {
        if (!isSupported()) return Promise.resolve(false);

        if (isNativeAndroidApp() && window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) {
            return window.Capacitor.Plugins.LocalNotifications.requestPermissions().then(function(res) {
                var granted = res && (res.display === 'granted' || res.display === 'prompt-with-rationale');
                setEnabled(granted);
                if (granted) {
                    initChannels();
                    triggerHapticFeedback('success');
                }
                return granted;
            }).catch(function(err) {
                console.warn('[SystemNotifications] Native permission request error:', err);
                return false;
            });
        }

        if ('Notification' in window) {
            return Notification.requestPermission().then(function(perm) {
                var granted = (perm === 'granted');
                setEnabled(granted);
                if (granted) triggerHapticFeedback('success');
                return granted;
            }).catch(function() {
                return false;
            });
        }

        return Promise.resolve(false);
    }

    function send(title, body, category, extra, dedupeKey) {
        if (!isEnabled()) return;

        // Strictly do NOT send system push notification if the app is currently in foreground / open
        if (isAppForeground()) {
            console.log('[SystemNotifications] Skipped push notification: App is open in foreground.');
            return;
        }

        // Strict deduplication: Never send the same notification twice
        if (dedupeKey) {
            var pushKey = 'do_system_pushed_' + dedupeKey;
            if (localStorage.getItem(pushKey) === 'true') {
                return;
            }
            try { localStorage.setItem(pushKey, 'true'); } catch (e) {}
        }

        var cat = category || 'announcements';
        if (!isCategoryEnabled(cat)) {
            console.log('[SystemNotifications] Skipped disabled category:', cat);
            return;
        }

        var channelInfo = CHANNELS[cat] || CHANNELS['announcements'];

        // 1. Native Android Local Notifications via Capacitor
        if (isNativeAndroidApp() && window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) {
            try {
                var notifId = dedupeKey ? (Math.abs(hashCode(dedupeKey)) % 900000 + 100000) : (Math.floor(Math.random() * 900000) + 100000);
                window.Capacitor.Plugins.LocalNotifications.schedule({
                    notifications: [
                        {
                            id: notifId,
                            title: title || 'Oremus',
                            body: body || '',
                            channelId: channelInfo.id,
                            smallIcon: 'ic_notification',
                            iconColor: '#c96b63',
                            schedule: { at: new Date(Date.now() + 500) },
                            sound: undefined,
                            attachments: undefined,
                            actionTypeId: '',
                            extra: extra || {}
                        }
                    ]
                }).catch(function(err) {
                    console.warn('[SystemNotifications] Native schedule error:', err);
                });
            } catch (e) {
                console.warn('[SystemNotifications] Native dispatch exception:', e);
            }
            return;
        }

        // 2. Web Notification API fallback
        if ('Notification' in window && Notification.permission === 'granted') {
            try {
                new Notification(title || 'Oremus', {
                    body: body || '',
                    icon: 'icon/icon-192.png',
                    badge: 'icon/favicon.svg'
                });
            } catch (e) {
                console.warn('[SystemNotifications] Web notification exception:', e);
            }
        }
    }

    function scheduleBackgroundNotifs(notifsList) {
        if (!isEnabled() || !Array.isArray(notifsList) || !notifsList.length) return;
        if (!isNativeAndroidApp() || !window.Capacitor || !window.Capacitor.Plugins || !window.Capacitor.Plugins.LocalNotifications) return;

        // Never schedule while app is active / visible
        if (isAppForeground()) return;

        try {
            var plugin = window.Capacitor.Plugins.LocalNotifications;
            notifsList.forEach(function(n, idx) {
                if (!n || !n.id) return;
                var pushedKey = 'do_system_pushed_' + n.id;
                if (localStorage.getItem(pushedKey) === 'true') return; // Push only once per announcement

                // Mark immediately in localStorage so it can never be pushed or scheduled again
                try { localStorage.setItem(pushedKey, 'true'); } catch (e) {}

                var notifTitle = n.title || (n.banner ? n.banner.text : 'Oremus');
                var notifBody = n.message || (n.subtitle || 'Nouvelle information disponible dans votre bréviaire.');
                var delayMs = (idx === 0) ? 60000 : ((idx + 1) * 300000); // 1 min, 5 min, etc.
                var channelInfo = CHANNELS['announcements'];

                plugin.schedule({
                    notifications: [
                        {
                            id: Math.abs(hashCode(n.id || 'oremus')) % 900000 + 100000,
                            title: notifTitle,
                            body: notifBody,
                            channelId: channelInfo.id,
                            smallIcon: 'ic_notification',
                            iconColor: '#c96b63',
                            schedule: { at: new Date(Date.now() + delayMs) },
                            extra: { notifId: n.id }
                        }
                    ]
                }).catch(function(err) {
                    console.warn('[SystemNotifications] Background schedule error:', err);
                });
            });
        } catch (e) {
            console.warn('[SystemNotifications] Background schedule exception:', e);
        }
    }

    function hashCode(str) {
        var hash = 0;
        for (var i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return hash;
    }

    // Schedule background notifications when user leaves the application
    if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', function() {
            if (document.visibilityState === 'hidden') {
                if (window.OremusNotifications && typeof window.OremusNotifications.getActive === 'function') {
                    var active = window.OremusNotifications.getActive();
                    if (active && active.length) {
                        scheduleBackgroundNotifs(active);
                    }
                }
            }
        });
    }

    return {
        isSupported: isSupported,
        isEnabled: isEnabled,
        isCategoryEnabled: isCategoryEnabled,
        setCategoryEnabled: setCategoryEnabled,
        setEnabled: setEnabled,
        initChannels: initChannels,
        openSystemSettings: openSystemSettings,
        requestPermission: requestPermission,
        scheduleBackgroundNotifs: scheduleBackgroundNotifs,
        send: send
    };
})();

var OremusUsageTracker = (function() {
    var USAGE_KEY = 'do_app_usage_seconds';
    var PROMPT_SHOWN_KEY = 'do_notif_prompt_shown';
    var NEVER_ASK_KEY = 'do_notif_never_ask';
    var TARGET_SECONDS = 1200; // 20 minutes

    function getUsageSeconds() {
        try {
            return parseInt(localStorage.getItem(USAGE_KEY) || '0', 10) || 0;
        } catch (e) {
            return 0;
        }
    }

    function addUsage(seconds) {
        var current = getUsageSeconds() + seconds;
        try {
            localStorage.setItem(USAGE_KEY, current.toString());
        } catch (e) {}
        checkThreshold(current);
    }

    function checkThreshold(seconds) {
        if (localStorage.getItem(NEVER_ASK_KEY) === 'true') return;
        if (localStorage.getItem(PROMPT_SHOWN_KEY) === 'true') return;

        // If notifications are already explicitly allowed, don't ask again
        if (localStorage.getItem('do_notifications_enabled') === 'true') {
            return;
        }

        if (seconds >= TARGET_SECONDS) {
            showPrompt();
        }
    }

    function showPrompt() {
        $('#notificationPromptModalBackdrop, #notificationPromptModal').removeClass('hidden');
        triggerHapticFeedback('open');
    }

    function hidePrompt() {
        $('#notificationPromptModalBackdrop, #notificationPromptModal').addClass('hidden');
    }

    function init() {
        // Track active usage every 15 seconds
        setInterval(function() {
            if (document.visibilityState === 'visible') {
                addUsage(15);
            }
        }, 15000);
    }

    return {
        init: init,
        showPrompt: showPrompt,
        hidePrompt: hidePrompt,
        getUsageSeconds: getUsageSeconds
    };
})();

// ---- Event Listeners ----
function setupEventListeners() {
    // 20-Minute Notification Permission Prompt Listeners
    $(document).on('click', '#btnEnableNotifPrompt', function(e) {
        e.preventDefault();
        triggerHapticFeedback('selection');
        OremusSystemNotifications.requestPermission();
        try {
            localStorage.setItem('do_notif_prompt_shown', 'true');
        } catch (e) {}
        OremusUsageTracker.hidePrompt();
    });

    $(document).on('click', '#btnLaterNotifPrompt, #btnCloseNotifPromptModal, #notificationPromptModalBackdrop', function(e) {
        e.preventDefault();
        triggerHapticFeedback('light');
        // Delay prompt for another 10 minutes
        try {
            var cur = OremusUsageTracker.getUsageSeconds();
            localStorage.setItem('do_app_usage_seconds', Math.max(0, cur - 600).toString());
        } catch (e) {}
        OremusUsageTracker.hidePrompt();
    });

    $(document).on('click', '#btnNeverNotifPrompt', function(e) {
        e.preventDefault();
        triggerHapticFeedback('light');
        try {
            localStorage.setItem('do_notif_never_ask', 'true');
            localStorage.setItem('do_notif_prompt_shown', 'true');
        } catch (e) {}
        OremusUsageTracker.hidePrompt();
    });

    // Settings Toggle for System Notifications (Master & Categories)
    var isNotifActive = OremusSystemNotifications.isEnabled();
    $('#toggleSystemNotifications').prop('checked', isNotifActive).on('change', function() {
        var isChecked = $(this).is(':checked');
        if (isChecked) {
            OremusSystemNotifications.requestPermission();
        } else {
            OremusSystemNotifications.setEnabled(false);
            triggerHapticFeedback('light');
        }
    });

    if (!isNotifActive) {
        $('#subNotificationSettings').hide();
    }

    $('#toggleNotifUpdates').prop('checked', OremusSystemNotifications.isCategoryEnabled('updates')).on('change', function() {
        OremusSystemNotifications.setCategoryEnabled('updates', $(this).is(':checked'));
        triggerHapticFeedback('selection');
    });

    $('#toggleNotifAnnouncements').prop('checked', OremusSystemNotifications.isCategoryEnabled('announcements')).on('change', function() {
        OremusSystemNotifications.setCategoryEnabled('announcements', $(this).is(':checked'));
        triggerHapticFeedback('selection');
    });

    $('#toggleNotifLiturgy').prop('checked', OremusSystemNotifications.isCategoryEnabled('liturgy')).on('change', function() {
        OremusSystemNotifications.setCategoryEnabled('liturgy', $(this).is(':checked'));
        triggerHapticFeedback('selection');
    });

    $(document).on('click', '#btnOpenAndroidNotifSettings', function(e) {
        e.preventDefault();
        triggerHapticFeedback('selection');
        OremusSystemNotifications.openSystemSettings();
    });

    // Remote Notification Event Listeners — Clicking anywhere on banner or toast opens the linked popup modal
    $(document).on('click', '#appRemoteNotificationBanner', function(e) {
        // If clicking on close button, let close handler handle it
        if ($(e.target).closest('#btnCloseRemoteNotifBanner').length) return;
        e.preventDefault();
        var notif = OremusNotifications.getCurrentBanner();
        if (notif) {
            var bannerData = notif.banner || {};
            OremusNotifications.handleAction(notif, bannerData.actionType || 'open_modal', bannerData.url, bannerData.target);
            if (bannerData.dismissOnClick) {
                OremusNotifications.hideBanner(true);
            }
        }
    });

    $(document).on('click', '#btnRemoteNotifAction', function(e) {
        e.preventDefault();
        e.stopPropagation();
        var notif = OremusNotifications.getCurrentBanner();
        if (notif) {
            var bannerData = notif.banner || {};
            OremusNotifications.handleAction(notif, bannerData.actionType || 'open_modal', bannerData.url, bannerData.target);
            if (bannerData.dismissOnClick) {
                OremusNotifications.hideBanner(true);
            }
        }
    });

    $(document).on('click', '#btnCloseRemoteNotifBanner', function(e) {
        e.preventDefault();
        e.stopPropagation();
        triggerHapticFeedback('light');
        OremusNotifications.hideBanner(true);
    });

    $(document).on('click', '#btnCloseUpdateBanner', function(e) {
        e.preventDefault();
        triggerHapticFeedback('light');
        hideUpdateBanner();
    });

    $(document).on('click', '#appFloatingNotification, #btnFloatingNotifAction', function(e) {
        if ($(e.target).closest('#btnCloseFloatingNotif').length) return;
        e.preventDefault();
        var notif = OremusNotifications.getCurrentBanner() || (OremusNotifications.getActive().length ? OremusNotifications.getActive()[0] : null);
        if (notif) {
            var bannerData = notif.banner || {};
            OremusNotifications.handleAction(notif, bannerData.actionType || 'open_modal', bannerData.url, bannerData.target);
            OremusNotifications.hideFloating(true);
        }
    });

    $(document).on('click', '#btnCloseFloatingNotif', function(e) {
        e.preventDefault();
        e.stopPropagation();
        triggerHapticFeedback('light');
        OremusNotifications.hideFloating(true);
    });

    $(document).on('click', '#btnCloseRemoteNotifModal, #btnDismissRemoteNotifModal, #remoteNotificationModalBackdrop', function(e) {
        e.preventDefault();
        triggerHapticFeedback('light');
        OremusNotifications.hideModal(true);
    });

    $(document).on('click', '#remoteNotifModalActions .remote-notif-btn', function(e) {
        e.preventDefault();
        var $btn = $(this);
        var notif = OremusNotifications.getCurrentModal();
        var action = $btn.data('btn-action');
        var url = $btn.data('btn-url');
        var target = $btn.data('btn-target');
        var shouldDismiss = $btn.data('btn-dismiss');

        triggerHapticFeedback('selection');

        if (notif) {
            OremusNotifications.handleAction(notif, action, url, target);
            if (shouldDismiss) {
                OremusNotifications.hideModal(true);
            }
        } else {
            OremusNotifications.hideModal(false);
        }
    });
    // Feedback Modal Triggers
    $(document).on('click', '#btnFeedbackSidebar, #btnFeedbackSettings', function(e) {
        e.preventDefault();
        e.stopPropagation();
        triggerHapticFeedback('open');
        closeModals();
        openFeedbackModal();
    });

    $(document).on('click', '#btnCloseFeedbackModal, #feedbackModalBackdrop', function(e) {
        e.preventDefault();
        e.stopPropagation();
        triggerHapticFeedback('light');
        closeFeedbackModal();
    });

    $(document).on('click', '.do-brand, #btnBrandHome', function(e) {
        e.preventDefault();
        triggerHapticFeedback('medium');
        doState.hora = 'home';
        doState.officiumKey = null;
        doState.testFeastKey = null;
        localStorage.removeItem('do_officiumKey');
        localStorage.setItem('do_hora', 'home');
        closeModals();
        if (window.OremusRouter) window.OremusRouter.syncUrl({ push: true });
        renderDO();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    $(document).on('click', '.do-nav-item', function(e) {
        e.preventDefault();
        triggerHapticFeedback('selection');
        var hora = $(this).data('hora');
        if (hora === 'bible') {
            openBible();
            return;
        }
        if (hora === 'gregorian_search') {
            closeModals();
            if (typeof window.openGregorianSearch === 'function') {
                window.openGregorianSearch();
            }
            return;
        }
        doState.hora = hora;
        localStorage.setItem('do_hora', hora);
        if (hora !== 'missa_gregorian') {
            doState.officiumKey = null;
            doState.testFeastKey = null;
            localStorage.removeItem('do_officiumKey');
        }
        closeModals();
        if (window.OremusRouter) window.OremusRouter.syncUrl({ push: true });
        renderDO();
    });

    $(document).on('click', '#btnSidebarSearchHeader, #btnSidebarGregorianSearch', function(e) {
        e.preventDefault();
        triggerHapticFeedback('selection');
        closeModals();
        if (typeof window.openGregorianSearch === 'function') {
            window.openGregorianSearch();
        }
    });

    $(document).on('click focus', '#doHomeSearchInput', function(e) {
        if (typeof window.openGregorianSearch === 'function') {
            var initialVal = $(this).val();
            window.openGregorianSearch(initialVal);
            $(this).blur();
        }
    });

    $(document).on('click', '.bottom-nav .nav-item', function(e) {
        e.preventDefault();
        triggerHapticFeedback('selection');
        var hora = $(this).data('hora');
        if (hora === 'horae') {
            $('#doHoraePicker').toggleClass('hidden');
            return;
        }
        $('#doHoraePicker').addClass('hidden');
        doState.hora = hora;
        localStorage.setItem('do_hora', hora);
        if (hora !== 'missa_gregorian') {
            doState.officiumKey = null;
            doState.testFeastKey = null;
            localStorage.removeItem('do_officiumKey');
        }
        if (window.OremusRouter) window.OremusRouter.syncUrl({ push: true });
        renderDO();
    });

    $(document).on('click', '.do-hora-sub', function(e) {
        e.preventDefault();
        triggerHapticFeedback('selection');
        var hora = $(this).data('hora');
        $('#doHoraePicker').addClass('hidden');
        doState.hora = hora;
        localStorage.setItem('do_hora', hora);
        if (hora !== 'missa_gregorian') {
            doState.officiumKey = null;
            doState.testFeastKey = null;
            localStorage.removeItem('do_officiumKey');
        }
        if (window.OremusRouter) window.OremusRouter.syncUrl({ push: true });
        renderDO();
    });

    // Open Bible directly in main view from Psalm card button
    $(document).on('click', '.do-bible-btn', function(e) {
        e.stopPropagation();
        triggerHapticFeedback('selection');
        var bk = $(this).data('book') || 'Psalmi';
        var ch = $(this).data('chapter') || 1;
        openBible(bk, ch, 1);
    });

    // Bible Main View Controls: Change Book
    $(document).on('change', '#doBibleMainBookSelect', function() {
        triggerHapticFeedback('selection');
        var bk = $(this).val();
        doState.bible.book = bk;
        doState.bible.chapter = 1;
        doState.bible.page = 1;
        localStorage.setItem('do_bible_book', bk);
        localStorage.setItem('do_bible_chapter', 1);
        localStorage.setItem('do_bible_page', 1);
        if (window.OremusRouter) window.OremusRouter.syncUrl({ push: true });
        renderBibleMainView();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // Bible Main View Controls: Change Chapter
    $(document).on('change', '#doBibleMainChapterSelect', function() {
        triggerHapticFeedback('selection');
        var ch = parseInt($(this).val(), 10);
        doState.bible.chapter = ch;
        doState.bible.page = 1;
        localStorage.setItem('do_bible_chapter', ch);
        localStorage.setItem('do_bible_page', 1);
        if (window.OremusRouter) window.OremusRouter.syncUrl({ push: true });
        renderBibleMainView();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // Bible Main View Controls: Change Page
    $(document).on('change', '#doBibleMainPageSelect', function() {
        triggerHapticFeedback('selection');
        var pg = parseInt($(this).val(), 10) || 1;
        doState.bible.page = pg;
        localStorage.setItem('do_bible_page', pg);
        if (window.OremusRouter) window.OremusRouter.syncUrl({ push: false });
        renderBibleMainView();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // Bible Main View Controls: Change Page Size (Verses per page)
    $(document).on('change', '#doBibleMainVppSelect', function() {
        triggerHapticFeedback('selection');
        var val = $(this).val();
        doState.bible.pageSize = (val === 'all') ? 'all' : parseInt(val, 10);
        doState.bible.page = 1;
        localStorage.setItem('do_bible_pageSize', val);
        localStorage.setItem('do_bible_page', 1);
        if (window.OremusRouter) window.OremusRouter.syncUrl({ push: false });
        renderBibleMainView();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // Bible Previous Chapter Navigation
    $(document).on('click', '#btnBiblePrev, .btnBiblePrev', function() {
        triggerHapticFeedback('step');
        var bkObj = DO_BIBLE_BOOKS.find(function(b) { return b.id === doState.bible.book; }) || DO_BIBLE_BOOKS[0];
        if (doState.bible.chapter > 1) {
            doState.bible.chapter--;
            doState.bible.page = 1;
            if (window.OremusRouter) window.OremusRouter.syncUrl({ push: true });
            renderBibleMainView();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            var curIdx = DO_BIBLE_BOOKS.indexOf(bkObj);
            if (curIdx > 0) {
                var prevBk = DO_BIBLE_BOOKS[curIdx - 1];
                doState.bible.book = prevBk.id;
                doState.bible.chapter = prevBk.chapters;
                doState.bible.page = 1;
                if (window.OremusRouter) window.OremusRouter.syncUrl({ push: true });
                renderBibleMainView();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }
    });

    // Bible Next Chapter Navigation
    $(document).on('click', '#btnBibleNext, .btnBibleNext', function() {
        triggerHapticFeedback('step');
        var bkObj = DO_BIBLE_BOOKS.find(function(b) { return b.id === doState.bible.book; }) || DO_BIBLE_BOOKS[0];
        if (doState.bible.chapter < bkObj.chapters) {
            doState.bible.chapter++;
            doState.bible.page = 1;
            if (window.OremusRouter) window.OremusRouter.syncUrl({ push: true });
            renderBibleMainView();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            var curIdx = DO_BIBLE_BOOKS.indexOf(bkObj);
            if (curIdx < DO_BIBLE_BOOKS.length - 1) {
                var nextBk = DO_BIBLE_BOOKS[curIdx + 1];
                doState.bible.book = nextBk.id;
                doState.bible.chapter = 1;
                doState.bible.page = 1;
                if (window.OremusRouter) window.OremusRouter.syncUrl({ push: true });
                renderBibleMainView();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }
    });

    $('#btnPrevDay, #btnHddPrevDay').on('click', function(e) {
        if (e) e.stopPropagation();
        triggerHapticFeedback('step');
        doState.date.subtract(1, 'day');
        doState.officiumKey = null;
        doState.userChangedHddMode = false;
        localStorage.removeItem('do_officiumKey');
        $('#doDateInput').val(doState.date.format('YYYY-MM-DD'));
        if (window.OremusRouter) window.OremusRouter.syncUrl({ push: true });
        renderDO();
        if (!$('#headerDropdown').hasClass('hidden')) {
            renderHeaderDropdown();
        }
    });

    $('#btnNextDay, #btnHddNextDay').on('click', function(e) {
        if (e) e.stopPropagation();
        triggerHapticFeedback('step');
        doState.date.add(1, 'day');
        doState.officiumKey = null;
        doState.userChangedHddMode = false;
        localStorage.removeItem('do_officiumKey');
        $('#doDateInput').val(doState.date.format('YYYY-MM-DD'));
        if (window.OremusRouter) window.OremusRouter.syncUrl({ push: true });
        renderDO();
        if (!$('#headerDropdown').hasClass('hidden')) {
            renderHeaderDropdown();
        }
    });

    // Dropdown Toggle from Header Title Area
    $(document).on('click', '.header-title-area, #doHeaderTitle', function(e) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        triggerHapticFeedback('medium');
        if (doState.hora === 'gregorian_search') {
            $('#gregorianSearchInput').focus();
            return;
        }
        if ($('#headerDropdown').hasClass('hidden')) {
            openHeaderDropdown();
        } else {
            closeHeaderDropdown();
        }
    });

    // Prevent clicks inside the dropdown from closing it
    $(document).on('click', '#headerDropdown', function(e) {
        e.stopPropagation();
    });

    // Mode Toggle (Temporale vs Sanctorale OR Vetus vs Novum Testamentum)
    $(document).on('click', '.hdd-mode-btn', function(e) {
        e.stopPropagation();
        triggerHapticFeedback('selection');
        var bibleMode = $(this).data('bible-mode');
        if (bibleMode) {
            doState.hddBibleMode = bibleMode;
        } else {
            doState.hddMode = $(this).data('mode');
            doState.userChangedHddMode = true;
        }
        renderHeaderDropdown();
    });

    // Today in Dropdown
    $(document).on('click', '#btnHddToday, #btnDateToday', function(e) {
        e.stopPropagation();
        triggerHapticFeedback('selection');
        doState.date = moment();
        doState.officiumKey = null;
        doState.userChangedHddMode = false;
        localStorage.removeItem('do_officiumKey');
        if (doState.calView) {
            doState.calView = { year: doState.date.year(), month: doState.date.month() };
        }
        closeHeaderDropdown();
        if (window.OremusRouter) window.OremusRouter.syncUrl({ push: true });
        renderDO();
    });

    // Toggle In-App Calendar in Dropdown
    $(document).on('click', '#btnHddCalendarToggle', function(e) {
        e.stopPropagation();
        triggerHapticFeedback('toggle');
        doState.calOpen = !doState.calOpen;
        $('.hdd-cal-chevron').toggleClass('open', doState.calOpen);
        $('#hddCustomCalendar').toggleClass('hidden', !doState.calOpen);
        if (doState.calOpen) {
            doState.calView = { year: doState.date.year(), month: doState.date.month() };
            renderCustomCalendarGrid();
        }
    });

    // Prev / Next Month in Custom Calendar
    $(document).on('click', '#btnHddCalPrevMonth', function(e) {
        e.stopPropagation();
        triggerHapticFeedback('step');
        if (!doState.calView) doState.calView = { year: doState.date.year(), month: doState.date.month() };
        doState.calView.month--;
        if (doState.calView.month < 0) {
            doState.calView.month = 11;
            doState.calView.year--;
        }
        renderCustomCalendarGrid();
    });

    $(document).on('click', '#btnHddCalNextMonth', function(e) {
        e.stopPropagation();
        triggerHapticFeedback('step');
        if (!doState.calView) doState.calView = { year: doState.date.year(), month: doState.date.month() };
        doState.calView.month++;
        if (doState.calView.month > 11) {
            doState.calView.month = 0;
            doState.calView.year++;
        }
        renderCustomCalendarGrid();
    });

    // Prev / Next Day in Dropdown
    $(document).on('click', '#btnHddPrevDay', function(e) {
        e.stopPropagation();
        doState.date.subtract(1, 'day');
        doState.officiumKey = null;
        localStorage.removeItem('do_officiumKey');
        if (doState.calView) {
            doState.calView = { year: doState.date.year(), month: doState.date.month() };
        }
        renderHeaderDropdown();
        if (window.OremusRouter) window.OremusRouter.syncUrl({ push: true });
        renderDO();
    });

    $(document).on('click', '#btnHddNextDay', function(e) {
        e.stopPropagation();
        doState.date.add(1, 'day');
        doState.officiumKey = null;
        localStorage.removeItem('do_officiumKey');
        if (doState.calView) {
            doState.calView = { year: doState.date.year(), month: doState.date.month() };
        }
        renderHeaderDropdown();
        if (window.OremusRouter) window.OremusRouter.syncUrl({ push: true });
        renderDO();
    });

    // Filter search
    $(document).on('input', '#hddSearchInput', function() {
        renderHeaderDropdownItems();
    });

    $(document).on('click', '#btnOpenSidebarMobile', function(e) {
        e.preventDefault();
        e.stopPropagation();
        triggerHapticFeedback(20);
        var $sb = $('#doSidebar');
        $sb.removeClass('anim-overshoot');
        if ($sb[0]) void $sb[0].offsetWidth; // force reflow
        $sb.addClass('open active anim-overshoot');
        $('#sidebarBackdrop').addClass('open active');
        $('body').addClass('sidebar-open');
        document.body.style.overflow = 'hidden';
    });

    $('#btnCloseSidebar, #sidebarBackdrop').on('click', function() {
        triggerHapticFeedback('light');
        closeModals();
    });

    $('#btnSettings, #btnSettingsSidebar').on('click', function() {
        triggerHapticFeedback('open');
        $('#settingsPanel').addClass('open active');
        $('#settingsBackdrop').addClass('open active');
    });

    $('#btnCloseSettings, #settingsBackdrop').on('click', function() {
        triggerHapticFeedback('light');
        closeModals();
    });

    // Ordinarium Missæ Toggle
    $('#toggleOrdinarium').on('change', function() {
        var isChecked = $(this).is(':checked');
        triggerHapticFeedback('toggle');
        doState.includeOrdinarium = isChecked;
        localStorage.setItem('do_ordinarium', isChecked);
        renderDO();
    });

    // Gregorian Chant Toggle in Settings
    $('#toggleGregorian').on('change', function() {
        var isChecked = $(this).is(':checked');
        triggerHapticFeedback('toggle');
        doState.includeGregorian = isChecked;
        localStorage.setItem('do_include_gregorian', isChecked);
        if (!isChecked && doState.hora === 'missa_gregorian') {
            doState.hora = 'missa';
            localStorage.setItem('do_hora', 'missa');
        }
        renderDO();
    });

    // Search Image Preview Toggle in Settings (désactivé par défaut)
    (function() {
        var stored = localStorage.getItem('do_search_images');
        var enabled = stored === 'true'; // false par défaut
        $('#toggleSearchImages').prop('checked', enabled);
        window.doSearchImagesEnabled = enabled;
    })();
    $('#toggleSearchImages').on('change', function() {
        var isChecked = $(this).is(':checked');
        triggerHapticFeedback('toggle');
        window.doSearchImagesEnabled = isChecked;
        localStorage.setItem('do_search_images', isChecked ? 'true' : 'false');
        // Re-rendre les résultats pour appliquer immédiatement
        if (window.gregorianSearchUI && typeof window.gregorianSearchUI.triggerSearch === 'function') {
            window.gregorianSearchUI.triggerSearch(false);
        }
    });

    // Note Keyboard buttons in Settings (Instant pitch playback)
    $(document).on('click', '#doNoteKeyboard .do-note-key-btn', function(e) {
        e.preventDefault();
        triggerHapticFeedback('note');
        var pitch = $(this).data('pitch');
        var $btn = $(this);
        $btn.addClass('playing');
        setTimeout(function() { $btn.removeClass('playing'); }, 260);

        if (window.Tone) {
            if (typeof Tone.start === 'function') Tone.start().catch(function(){});
            if (Tone.context && Tone.context.state !== 'running') Tone.context.resume().catch(function(){});
            var s = window._doSynth;
            if (!s) {
                var newSynth = new Tone.Synth({
                    "oscillator": { type: "custom", partials: [0.3, 0.03, 0.05] },
                    "envelope": { "attack": 0.04, "decay": 0.3, "sustain": 0.4, "release": 0.6 }
                });
                s = window._doSynth = typeof newSynth.toDestination === 'function' ? newSynth.toDestination() : newSynth.toMaster();
            }
            s.triggerAttackRelease(pitch, "8n");
        }
    });

    // Floating Player Dock Toggle in Settings
    $(document).on('click', '#btnTogglePlayerDock', function(e) {
        e.preventDefault();
        triggerHapticFeedback('toggle');
        var $bar = $('#modernPlayerBar');
        var isNowVis = !$bar.hasClass('visible');
        $bar.toggleClass('visible', isNowVis);
        $('body').toggleClass('player-dock-open', isNowVis);
        $(this).find('span').text(isNowVis ? 'Masquer le lecteur' : 'Afficher le lecteur');
    });

    // Open Test Page Button in Settings
    $(document).on('click', '#btnOpenTestMissa, #btnOpenTestMissaDirect', function(e) {
        e.preventDefault();
        triggerHapticFeedback('medium');
        doState.hora = 'missa_gregorian';
        localStorage.setItem('do_hora', 'missa_gregorian');
        closeModals();
        renderDO();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // Demo Update Banner Trigger (from Settings or Test Page)
    $(document).on('click', '#btnDemoUpdateBanner, #btnDemoUpdateBannerTestPage', function(e) {
        e.preventDefault();
        triggerHapticFeedback('success');
        showUpdateBanner({
            tag_name: 'beta-1.0.0 (Démo)',
            prerelease: true,
            body: '### Mise à jour de démonstration\n- ✨ **Bannière discrète en haut** qui décale le contenu vers le bas façon Compose / NuvioMobile.\n- 🚀 Animations fluides 60fps sans pop-up intrusive bloquante.\n- 📖 Notes de version intégrées avec accordéon repliable.\n- 🎵 Partitions grégoriennes interactives synchronisées.'
        });
        closeModals();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // Test Banner Toolbar Controls
    $(document).on('click', '#btnToggleGregorianChants', function(e) {
        e.preventDefault();
        triggerHapticFeedback('toggle');
        doState.includeGregorian = !doState.includeGregorian;
        localStorage.setItem('do_include_gregorian', doState.includeGregorian);
        var isNowOn = doState.includeGregorian;
        $(this).toggleClass('active', isNowOn);
        $(this).find('span').text('Partitions Grégoriennes : ' + (isNowOn ? 'ACTIVÉES' : 'DÉSACTIVÉES'));
        $('#toggleGregorian').prop('checked', isNowOn);
        renderAllChantScoresInDOM($('#do-content-stream'));
    });

    $(document).on('change', '#doKyrialeSelect', function() {
        triggerHapticFeedback('selection');
        doState.selectedKyriale = $(this).val();
        localStorage.setItem('do_selected_kyriale', doState.selectedKyriale);
        renderDO();
    });

    $(document).on('change', '#doTestProperSelect', function() {
        triggerHapticFeedback('selection');
        var val = $(this).val();
        doState.testFeastKey = val || null;
        renderDO();
    });

    // 0. Rubricæ & Editio Select
    $('#doEditionSelect').on('change', function() {
        triggerHapticFeedback('selection');
        var val = $(this).val();
        doState.edition = val;
        localStorage.setItem('do_edition', val);
        DO_LOCAL_CACHE = {}; // Vider le cache mémoire pour recharger immédiatement la nouvelle édition
        renderDO();
    });

    // 3. Textus Latinus Toggle
    $('#toggleLatin').on('change', function() {
        var isChecked = $(this).is(':checked');
        triggerHapticFeedback('toggle');
        if (!isChecked && (!doState.vernacularLang || doState.vernacularLang === 'none')) {
            doState.vernacularLang = 'fr';
            localStorage.setItem('do_vernacular_lang', 'fr');
            $('#doVernacularOptions .settings-option-card, #doVernacularOptions .settings-option').removeClass('active');
            $('#doVernacularOptions [data-value="fr"]').addClass('active');
        }
        doState.showLatin = isChecked;
        localStorage.setItem('do_show_latin', isChecked);
        renderDO();
    });

    // 2 Distinct Settings: Vernacular Translation Select
    $('#doVernacularOptions').on('click', '.settings-option-card, .settings-option', function() {
        triggerHapticFeedback('selection');
        var val = $(this).data('value');
        if (val === 'none' && !doState.showLatin) {
            doState.showLatin = true;
            localStorage.setItem('do_show_latin', true);
        }
        doState.vernacularLang = val;
        localStorage.setItem('do_vernacular_lang', val);
        $('#doVernacularOptions .settings-option-card, #doVernacularOptions .settings-option').removeClass('active');
        $(this).addClass('active');
        renderDO();
    });

    $('#doThemeOptions').on('click', '.settings-option-card, .settings-option', function() {
        triggerHapticFeedback('selection');
        $('#doThemeOptions .settings-option-card, #doThemeOptions .settings-option').removeClass('active');
        $(this).addClass('active');
        doState.settings.theme = $(this).data('value');
        localStorage.setItem('do_theme', doState.settings.theme);
        initTheme();
    });

    $('#toggleLiturgicalColor').on('change', function() {
        var isChecked = $(this).is(':checked');
        triggerHapticFeedback('toggle');
        doState.settings.liturgicalColorSync = isChecked;
        localStorage.setItem('do_liturgical_color_sync', isChecked);
        if (isChecked) {
            $('#doColorOptions').css('opacity', '0.45').css('pointer-events', 'none');
        } else {
            $('#doColorOptions').css('opacity', '1').css('pointer-events', 'auto');
        }
        updateEffectiveColor();
    });

    $('#doColorOptions').on('click', '.color-swatch-circle, .color-swatch', function() {
        triggerHapticFeedback('selection');
        if (doState.settings.liturgicalColorSync) {
            doState.settings.liturgicalColorSync = false;
            localStorage.setItem('do_liturgical_color_sync', false);
            $('#toggleLiturgicalColor').prop('checked', false);
            $('#doColorOptions').css('opacity', '1').css('pointer-events', 'auto');
        }
        $('#doColorOptions .color-swatch-circle, #doColorOptions .color-swatch').removeClass('active');
        $(this).addClass('active');
        applyColor($(this).data('color'), false);
    });

    $('#toggleSyncIconColor').on('change', function() {
        var isChecked = $(this).is(':checked');
        triggerHapticFeedback('toggle');
        if (isChecked) {
            $('#doIconColorOptions').css('opacity', '0.45').css('pointer-events', 'none');
            $('#doIconColorOptions .color-swatch-circle').removeClass('active');
        } else {
            $('#doIconColorOptions').css('opacity', '1').css('pointer-events', 'auto');
            $('#doIconColorOptions .color-swatch-circle').removeClass('active');
            $('#doIconColorOptions [data-icon-color="' + doState.settings.iconColor + '"]').addClass('active');
        }
        requestIconColorChange(undefined, isChecked);
    });

    $('#doIconColorOptions').on('click', '.color-swatch-circle', function() {
        triggerHapticFeedback('selection');
        var chosenColor = $(this).data('icon-color');
        $('#doIconColorOptions .color-swatch-circle').removeClass('active');
        $(this).addClass('active');
        $('#toggleSyncIconColor').prop('checked', false);
        $('#doIconColorOptions').css('opacity', '1').css('pointer-events', 'auto');
        requestIconColorChange(chosenColor, false);
    });

    /* =============================================================
       OremusModuleManager — Gestionnaire des Modules (En Ligne & Hors-Ligne)
       ============================================================= */
    var OremusModuleManager = window.OremusModuleManager = {
        modules: {
            gabc: {
                id: 'gabc',
                name: 'Cantus Gregorianus & GABC',
                sizeText: '8.7 Mo',
                url: 'https://raw.githubusercontent.com/bastonus/jgabc/master/data/gregorian_chants.json',
                storageKey: 'do_module_gabc_installed',
                rowId: '#moduleRowGabc',
                badgeId: '#badgeModuleGabc',
                btnDownloadId: '#btnDownloadModuleGabc',
                btnDeleteId: '#btnDeleteModuleGabc',
                progressWrapperId: '#moduleProgressGabc',
                progressBarId: '#moduleProgressBarGabc',
                progressTextId: '#moduleProgressTextGabc',
                btnPauseId: '#btnPauseModuleGabc',
                btnCancelId: '#btnCancelModuleGabc',
                isPaused: false,
                isCancelled: false,
                currentPercent: 0,
                interval: null
            },
            saints: {
                id: 'saints',
                name: 'Iconographia Sanctorum',
                sizeText: '12.9 Mo',
                url: 'https://raw.githubusercontent.com/bastonus/jgabc/master/img/saints/',
                storageKey: 'do_module_saints_installed',
                rowId: '#moduleRowSaints',
                badgeId: '#badgeModuleSaints',
                btnDownloadId: '#btnDownloadModuleSaints',
                btnDeleteId: '#btnDeleteModuleSaints',
                progressWrapperId: '#moduleProgressSaints',
                progressBarId: '#moduleProgressBarSaints',
                progressTextId: '#moduleProgressTextSaints',
                btnPauseId: '#btnPauseModuleSaints',
                btnCancelId: '#btnCancelModuleSaints',
                isPaused: false,
                isCancelled: false,
                currentPercent: 0,
                interval: null
            }
        },

        isInstalled: function(modId) {
            var m = this.modules[modId];
            return m ? (localStorage.getItem(m.storageKey) === 'true') : false;
        },

        initUI: function() {
            var self = this;

            // Visible uniquement dans l'APK Android natif (Capacitor)
            if (!isNativeAndroidApp()) {
                $('#settingsGroupModules').hide();
                return;
            }

            Object.keys(self.modules).forEach(function(id) {
                self.updateModuleCardUI(id);
            });
        },

        updateModuleCardUI: function(modId) {
            var m = this.modules[modId];
            if (!m) return;

            var installed = this.isInstalled(modId);
            var $badge = $(m.badgeId);
            var $btnDl = $(m.btnDownloadId);
            var $btnDel = $(m.btnDeleteId);
            var $prog = $(m.progressWrapperId);

            $prog.addClass('hidden');

            if (installed) {
                if ($badge.length) $badge.text('Hors-ligne actif').addClass('is-installed').removeClass('is-online is-downloading');
                $btnDl.hide();
                $btnDel.show();
            } else {
                if ($badge.length) $badge.text('En ligne').addClass('is-online').removeClass('is-installed is-downloading');
                $btnDl.show().find('span').text('Rendre disponible hors connexion (' + m.sizeText + ')');
                $btnDel.hide();
            }
        },

        togglePauseModule: function(modId) {
            var m = this.modules[modId];
            if (!m) return;
            triggerHapticFeedback('selection');
            m.isPaused = !m.isPaused;
            var $pauseBtn = $(m.btnPauseId);
            var $txt = $(m.progressTextId);
            if (m.isPaused) {
                $pauseBtn.addClass('is-paused').attr('title', 'Reprendre le téléchargement');
                $pauseBtn.find('.do-icon-pause').hide();
                $pauseBtn.find('.do-icon-play').show();
                $txt.text(m.currentPercent + '% (Pause)');
                showToastNotification('Téléchargement mis en pause.', 'info');
            } else {
                $pauseBtn.removeClass('is-paused').attr('title', 'Mettre en pause');
                $pauseBtn.find('.do-icon-pause').show();
                $pauseBtn.find('.do-icon-play').hide();
                $txt.text(m.currentPercent + '%');
                showToastNotification('Reprise du téléchargement.', 'info');
            }
        },

        cancelModuleDownload: function(modId) {
            var m = this.modules[modId];
            if (!m) return;
            triggerHapticFeedback('warning');
            m.isCancelled = true;
            m.isPaused = false;
            m.currentPercent = 0;

            if (m.interval) {
                clearInterval(m.interval);
                m.interval = null;
            }

            var $prog = $(m.progressWrapperId);
            var $bar = $(m.progressBarId);
            var $txt = $(m.progressTextId);
            var $btnDl = $(m.btnDownloadId);
            var $btnDel = $(m.btnDeleteId);
            var $pauseBtn = $(m.btnPauseId);

            $pauseBtn.removeClass('is-paused').attr('title', 'Mettre en pause');
            $pauseBtn.find('.do-icon-pause').show();
            $pauseBtn.find('.do-icon-play').hide();

            $prog.addClass('hidden');
            $bar.css('width', '0%');
            $txt.text('0%');
            $btnDl.show();
            $btnDel.hide();

            showToastNotification('Téléchargement de ' + m.name + ' annulé.', 'info');
        },

        downloadModule: function(modId, onComplete) {
            var self = this;
            var m = self.modules[modId];
            if (!m) return;

            triggerHapticFeedback('medium');
            m.isPaused = false;
            m.isCancelled = false;
            m.currentPercent = 0;
            if (m.interval) { clearInterval(m.interval); m.interval = null; }

            var $btnDl = $(m.btnDownloadId);
            var $btnDel = $(m.btnDeleteId);
            var $prog = $(m.progressWrapperId);
            var $bar = $(m.progressBarId);
            var $txt = $(m.progressTextId);
            var $pauseBtn = $(m.btnPauseId);

            $pauseBtn.removeClass('is-paused').attr('title', 'Mettre en pause');
            $pauseBtn.find('.do-icon-pause').show();
            $pauseBtn.find('.do-icon-play').hide();

            $btnDl.hide();
            $btnDel.hide();
            $prog.removeClass('hidden');
            $bar.css('width', '3%');
            $txt.text('3%');
            m.currentPercent = 3;

            function setProgress(pct) {
                if (m.isCancelled) return;
                m.currentPercent = pct;
                $bar.css('width', pct + '%');
                if (!m.isPaused) {
                    $txt.text(pct + '%');
                }
            }

            function waitWhilePaused() {
                return new Promise(function(resolve) {
                    var check = function() {
                        if (m.isCancelled) return resolve(false);
                        if (!m.isPaused) return resolve(true);
                        setTimeout(check, 150);
                    };
                    check();
                });
            }

            var promise;
            if (modId === 'gabc') {
                var currentPct = 5;
                m.interval = setInterval(function() {
                    if (m.isCancelled) {
                        clearInterval(m.interval);
                        m.interval = null;
                        return;
                    }
                    if (m.isPaused) return;

                    currentPct = Math.min(94, currentPct + Math.floor(Math.random() * 8) + 4);
                    setProgress(currentPct);
                }, 200);

                promise = (window.gregorianDB && typeof window.gregorianDB._loadFullDictionary === 'function')
                    ? window.gregorianDB._loadFullDictionary().catch(function() {})
                    : fetch(m.url).catch(function() {});
                
                promise = promise.then(function() {
                    if (m.interval) { clearInterval(m.interval); m.interval = null; }
                    if (m.isCancelled) return Promise.reject('cancelled');
                    setProgress(100);
                });
            } else if (modId === 'saints') {
                if ('caches' in window && window.DO_SAINT_ART_METADATA) {
                    var keys = Object.keys(window.DO_SAINT_ART_METADATA);
                    var total = keys.length;
                    var loaded = 0;
                    promise = caches.open('oremus-saints-cache').then(function(cache) {
                        var batchSize = 10;
                        var batchPromise = Promise.resolve();
                        for (var i = 0; i < total; i += batchSize) {
                            (function(subKeys) {
                                batchPromise = batchPromise.then(function() {
                                    if (m.isCancelled) return Promise.reject('cancelled');
                                    return waitWhilePaused().then(function(canContinue) {
                                        if (!canContinue || m.isCancelled) return Promise.reject('cancelled');
                                        return Promise.all(subKeys.map(function(k) {
                                            var u = 'https://raw.githubusercontent.com/bastonus/jgabc/master/img/saints/' + k + '.webp';
                                            return cache.add(u).catch(function() {}).then(function() {
                                                loaded++;
                                                var pct = Math.round((loaded / total) * 100);
                                                setProgress(pct);
                                            });
                                        }));
                                    });
                                });
                            })(keys.slice(i, i + batchSize));
                        }
                        return batchPromise;
                    });
                } else {
                    var pct = 5;
                    m.interval = setInterval(function() {
                        if (m.isCancelled) {
                            clearInterval(m.interval);
                            m.interval = null;
                            return;
                        }
                        if (m.isPaused) return;
                        pct = Math.min(95, pct + 12);
                        setProgress(pct);
                    }, 220);
                    promise = new Promise(function(r) { setTimeout(r, 2000); }).then(function() {
                        if (m.interval) { clearInterval(m.interval); m.interval = null; }
                        if (m.isCancelled) return Promise.reject('cancelled');
                        setProgress(100);
                    });
                }
            } else {
                promise = Promise.resolve();
            }

            promise.then(function() {
                if (m.isCancelled) return;
                setProgress(100);
                setTimeout(function() {
                    if (m.isCancelled) return;
                    localStorage.setItem(m.storageKey, 'true');
                    $prog.addClass('hidden');
                    self.updateModuleCardUI(modId);
                    triggerHapticFeedback('success');
                    showToastNotification('Module ' + m.name + ' téléchargé pour usage hors-ligne !', 'success');
                    if (typeof onComplete === 'function') onComplete(true);
                }, 350);
            }).catch(function(err) {
                if (err === 'cancelled' || m.isCancelled) {
                    return;
                }
                localStorage.setItem(m.storageKey, 'true');
                $prog.addClass('hidden');
                self.updateModuleCardUI(modId);
                if (typeof onComplete === 'function') onComplete(true);
            });
        },

        deleteModule: function(modId) {
            var self = this;
            var m = self.modules[modId];
            if (!m) return;

            triggerHapticFeedback('warning');
            localStorage.removeItem(m.storageKey);
            if ('caches' in window) {
                if (modId === 'saints') {
                    caches.delete('oremus-saints-cache').catch(function() {});
                } else if (modId === 'gabc') {
                    caches.delete('oremus-gabc-cache').catch(function() {});
                }
            }
            self.updateModuleCardUI(modId);
            showToastNotification('Module ' + m.name + ' retiré du cache (disponible en ligne).', 'info');
        }
    };

    // Binding des boutons des modules dans les Paramètres
    $(document).on('click', '#btnDownloadModuleGabc', function(e) {
        e.preventDefault();
        OremusModuleManager.downloadModule('gabc');
    });

    $(document).on('click', '#btnDeleteModuleGabc', function(e) {
        e.preventDefault();
        OremusModuleManager.deleteModule('gabc');
    });

    $(document).on('click', '#btnPauseModuleGabc', function(e) {
        e.preventDefault();
        OremusModuleManager.togglePauseModule('gabc');
    });

    $(document).on('click', '#btnCancelModuleGabc', function(e) {
        e.preventDefault();
        OremusModuleManager.cancelModuleDownload('gabc');
    });

    $(document).on('click', '#btnDownloadModuleSaints', function(e) {
        e.preventDefault();
        OremusModuleManager.downloadModule('saints');
    });

    $(document).on('click', '#btnDeleteModuleSaints', function(e) {
        e.preventDefault();
        OremusModuleManager.deleteModule('saints');
    });

    $(document).on('click', '#btnPauseModuleSaints', function(e) {
        e.preventDefault();
        OremusModuleManager.togglePauseModule('saints');
    });

    $(document).on('click', '#btnCancelModuleSaints', function(e) {
        e.preventDefault();
        OremusModuleManager.cancelModuleDownload('saints');
    });

    OremusModuleManager.initUI();

    // App Icon Modal Listeners (Android restart / delay)
    $(document).on('click', '#btnRestartAppIcon', function(e) {
        e.preventDefault();
        if (pendingIconConfig) {
            applyIconColor(pendingIconConfig.color, pendingIconConfig.isSync);
            applyNativeAndroidAppIcon(pendingIconConfig.alias, true);
            closeAppIconModal();
            triggerHapticFeedback('warning');
            setTimeout(function() {
                if (window.AndroidAppIcon && typeof window.AndroidAppIcon.restartApp === 'function') {
                    window.AndroidAppIcon.restartApp();
                } else {
                    location.reload();
                }
            }, 300);
        } else {
            closeAppIconModal();
        }
    });

    $(document).on('click', '#btnDismissAppIcon, #btnCloseAppIconModal, #appIconModalBackdrop', function(e) {
        e.preventDefault();
        triggerHapticFeedback('light');
        if (pendingIconConfig) {
            // Apply later: save locally and schedule silent apply on next launch
            applyIconColor(pendingIconConfig.color, pendingIconConfig.isSync);
            localStorage.setItem('do_pending_icon_alias', pendingIconConfig.alias);
        }
        closeAppIconModal();
    });

    // Haptics & Updates settings listeners
    $('#toggleHaptics').on('change', function() {
        var isChecked = $(this).is(':checked');
        localStorage.setItem('do_haptics', isChecked ? 'true' : 'false');
        if (isChecked) triggerHapticFeedback('success');
    });

    // Haptic Style Preset Selector (Subtil, Équilibré, Riche)
    var savedHapticStyle = localStorage.getItem('do_haptic_style') || 'balanced';
    $('#doHapticStyleOptions [data-haptic-style]').removeClass('active');
    $('#doHapticStyleOptions [data-haptic-style="' + savedHapticStyle + '"]').addClass('active');

    $('#doHapticStyleOptions').on('click', '.settings-option-card', function() {
        var style = $(this).data('haptic-style') || 'balanced';
        localStorage.setItem('do_haptic_style', style);
        $('#doHapticStyleOptions .settings-option-card').removeClass('active');
        $(this).addClass('active');
        if (style === 'light') triggerHapticFeedback('subtle');
        else if (style === 'balanced') triggerHapticFeedback('medium');
        else if (style === 'rich') triggerHapticFeedback('success');
    });

    $('#toggleAutoUpdate').on('change', function() {
        triggerHapticFeedback('toggle');
        localStorage.setItem('do_auto_update', $(this).is(':checked') ? 'true' : 'false');
    });

    $('#toggleIncludeBeta').on('change', function() {
        triggerHapticFeedback('toggle');
        localStorage.setItem('do_include_beta', $(this).is(':checked') ? 'true' : 'false');
    });

    $('#btnCheckUpdatesManual').on('click', function(e) {
        e.preventDefault();
        triggerHapticFeedback('medium');
        checkForAppUpdates(true);
    });

    $(document).on('click', '#btnToggleUpdateNotes', function(e) {
        e.preventDefault();
        triggerHapticFeedback('selection');
        var $notes = $('#updateNotesCollapsible');
        var isOpen = $notes.hasClass('is-open');
        $notes.toggleClass('is-open', !isOpen);
        $(this).toggleClass('is-active', !isOpen);
    });

    // ── PWA & Service Worker Listeners ──
    window.addEventListener('beforeinstallprompt', function(e) {
        e.preventDefault();
        deferredInstallPrompt = e;
        if (!isAppStandalone()) {
            showInstallBanner();
        }
    });

    $(document).on('click', '#btnInstallAppBanner', function(e) {
        e.preventDefault();
        triggerPwaInstall();
    });

    $(document).on('click', '#btnCloseInstallBanner', function(e) {
        e.preventDefault();
        hideInstallBanner(true);
    });

    $(document).on('click', '#btnClosePwaInstallModal, #btnDismissPwaInstallModal, #pwaInstallModalBackdrop', function(e) {
        e.preventDefault();
        hidePwaInstallModal();
    });

    $(document).on('click', '#btnActionPwaInstallModal', function(e) {
        e.preventDefault();
        if (deferredInstallPrompt) {
            triggerPwaInstall();
        } else {
            hidePwaInstallModal();
        }
    });

    $(document).on('click', '#btnDownloadAppWebSidebar, #btnDownloadAppSettings', function(e) {
        e.preventDefault();
        triggerPwaInstall();
    });

    registerOremusServiceWorker();

    if (isNativeAndroidApp() || isIosDevice() || isAppStandalone()) {
        $('.web-only-btn, #btnDownloadAppWebSidebar, #btnDownloadAppSettings, .web-download-app-wrapper').hide();
        if (isNativeAndroidApp()) {
            if (localStorage.getItem('do_auto_update') !== 'false') {
                setTimeout(function() {
                    checkForAppUpdates(false);
                }, 2500);
            }
        } else {
            $('#toggleAutoUpdate').closest('.settings-toggle-row').hide();
            $('#toggleIncludeBeta').closest('.settings-toggle-row').hide();
            $('.update-check-wrapper').hide();
            $('#labelUpdatesText').text('Retours & Suggestions');

            // Strictly iOS mobile banner
            if (isIosDevice() && !isAppStandalone()) {
                setTimeout(function() {
                    showInstallBanner();
                }, 1800);
            }
        }
    } else {
        // Desktop / Android Web platform: show download app button for APK, hide updater controls (never show on desktop)
        $('.web-only-btn, #btnDownloadAppWebSidebar, #btnDownloadAppSettings, .web-download-app-wrapper').show();
        $('#toggleAutoUpdate').closest('.settings-toggle-row').hide();
        $('#toggleIncludeBeta').closest('.settings-toggle-row').hide();
        $('.update-check-wrapper').hide();
        $('#labelUpdatesText').text('Application & Retours');

        // On mobile Android browser, show the mobile top banner leading to GitHub APK
        if (isAndroidDevice() && !isAppStandalone()) {
            setTimeout(function() {
                showInstallBanner();
            }, 1800);
        }
    }

    // Global Touch Gestures (Synchronized whole-page bilingual swipe & Sidebar drawer)
    // Global Touch Gestures (Interactive smooth mobile drawer drag & Bilingual swipe)
    var touchStartX = 0;
    var touchStartY = 0;
    var touchStartTime = 0;
    var isTouchActive = false;
    var touchMode = 'none'; // 'none' | 'candidate_sidebar_open' | 'candidate_sidebar_close' | 'candidate_bilingual' | 'sidebar_open' | 'sidebar_close' | 'bilingual'
    var shiftDistance = 0;
    var initialOffsetPx = 0;

    function handleGlobalTouchStart(e) {
        if (!e.touches || e.touches.length !== 1) return;
        var t = e.touches[0];
        touchStartX = t.clientX;
        touchStartY = t.clientY;
        touchStartTime = Date.now();
        isTouchActive = true;
        touchMode = 'none';

        // Check if on mobile view
        var isMobile = (window.innerWidth < 900);
        var $sidebar = $('#doSidebar');
        $sidebar.removeClass('anim-overshoot');
        var isSidebarOpen = $sidebar.hasClass('open') || $sidebar.hasClass('active');
        var target = e.target;
        var isTargetInsideSidebar = $(target).closest('#doSidebar').length > 0;
        var isTargetBackdrop = $(target).closest('#sidebarBackdrop').length > 0;
        var isTargetMenuBtn = $(target).closest('#btnOpenSidebarMobile').length > 0;

        // Form control & menu button exception (do not intercept inputs/selects or menu button tap)
        if ($(target).closest('input, select, textarea, .do-edition-select, .settings-select-wrapper, #btnOpenSidebarMobile').length) {
            isTouchActive = false;
            return;
        }

        // Modal / Dialog / Settings panel / Player bar / Header dropdown / Mass TOC summary exception
        if ($(target).closest('.update-modal, .feedback-modal, .settings-panel, .remote-notif-card, #modernPlayerBar, #headerDropdown, .do-header-dropdown, #doMassTocPanel, #doMassTocBackdrop, #doMassTocPill, .do-mass-toc-panel, .do-mass-toc-backdrop, .do-mass-toc-pill').length ||
            $('.update-modal:not(.hidden), .feedback-modal:not(.hidden), #settingsPanel.open, #headerDropdown:not(.hidden), #doMassTocPanel:not(.hidden)').length > 0 ||
            $('body').hasClass('header-dropdown-open') || $('body').hasClass('mass-toc-open')) {
            isTouchActive = false;
            return;
        }

        if (isMobile) {
            if (isSidebarOpen) {
                if (isTargetInsideSidebar || isTargetBackdrop) {
                    touchMode = 'candidate_sidebar_close';
                }
            } else {
                if (touchStartX <= 80) {
                    touchMode = 'candidate_sidebar_open';
                }
            }
        }

        // If not a sidebar candidate, check bilingual swipe candidate
        if (touchMode === 'none' && !isSidebarOpen) {
            var isHome = (doState.hora === 'home');
            var hasBilingualRows = $('.do-bilingual-wrapper, .do-bilingual-grid, .do-bilingual-row').length > 0;
            var isBilingual = !isHome && hasBilingualRows && (doState.showLatin && doState.vernacularLang && doState.vernacularLang !== 'none');
            if (isBilingual) {
                var $wrapper = $('.do-bilingual-wrapper').first();
                var cardW = $wrapper.length ? $wrapper.width() : $(window).width();
                shiftDistance = cardW + 24;
                initialOffsetPx = (doState.mobileLang === 'vern') ? -shiftDistance : 0;
                touchMode = 'candidate_bilingual';
                $('#doBilingualGestureIndicator').removeClass('active');
                $('.do-bilingual-row').removeClass('do-bilingual-hint-anim');
            }
        }
    }

    function handleGlobalTouchMove(e) {
        if (!isTouchActive || !e.touches || !e.touches.length) return;
        var t = e.touches[0];
        var currentX = t.clientX;
        var currentY = t.clientY;
        var deltaX = currentX - touchStartX;
        var deltaY = currentY - touchStartY;
        var absX = Math.abs(deltaX);
        var absY = Math.abs(deltaY);

        var $sidebar = $('#doSidebar');
        var $backdrop = $('#sidebarBackdrop');
        var sidebarW = 290;

        // Disambiguate candidate modes
        if (touchMode === 'candidate_sidebar_open') {
            if (absX > 6 && absX > absY) {
                if (deltaX > 0) {
                    touchMode = 'sidebar_open';
                    $('body').addClass('is-dragging-sidebar');
                    $backdrop.css('display', 'block');
                } else {
                    touchMode = 'none';
                }
            } else if (absY > 10) {
                touchMode = 'none';
            }
        } else if (touchMode === 'candidate_sidebar_close') {
            if (absX > 6 && absX > absY) {
                touchMode = 'sidebar_close';
                $('body').addClass('is-dragging-sidebar');
                $backdrop.css('display', 'block');
            } else if (absY > 10) {
                touchMode = 'none'; // allow vertical scroll in nav
            }
        } else if (touchMode === 'candidate_bilingual') {
            if (absX > 10 && absX > absY) {
                touchMode = 'bilingual';
                stopBilingualSwipeHint();
                $('.do-bilingual-row').addClass('is-dragging');
            } else if (absY > 12) {
                touchMode = 'none';
            }
        }

        // Active smooth tracking with natural response
        if (touchMode === 'sidebar_open') {
            if (e.cancelable) e.preventDefault();
            var currentOffset = -sidebarW + deltaX;
            if (currentOffset > 0) {
                currentOffset = currentOffset * 0.40; // light natural over-drag
            }
            var progress = Math.min(1, Math.max(0, (sidebarW + currentOffset) / sidebarW));
            if ($sidebar[0]) $sidebar[0].style.setProperty('transform', 'translateX(' + currentOffset + 'px)', 'important');
            if ($backdrop[0]) $backdrop[0].style.setProperty('opacity', progress.toFixed(3), 'important');
        } else if (touchMode === 'sidebar_close') {
            if (e.cancelable) e.preventDefault();
            var currentOffset = deltaX;
            if (currentOffset > 0) {
                currentOffset = currentOffset * 0.40;
            } else if (currentOffset < -sidebarW) {
                currentOffset = -sidebarW + (currentOffset + sidebarW) * 0.40;
            }
            var progress = Math.min(1, Math.max(0, (sidebarW + currentOffset) / sidebarW));
            if ($sidebar[0]) $sidebar[0].style.setProperty('transform', 'translateX(' + currentOffset + 'px)', 'important');
            if ($backdrop[0]) $backdrop[0].style.setProperty('opacity', progress.toFixed(3), 'important');
        } else if (touchMode === 'bilingual') {
            if (e.cancelable) e.preventDefault();
            var targetOffset = initialOffsetPx + deltaX;
            if (targetOffset > 0) {
                targetOffset = targetOffset * 0.25;
            } else if (targetOffset < -shiftDistance) {
                var over = targetOffset + shiftDistance;
                targetOffset = -shiftDistance + (over * 0.25);
            }
            var $stream = $('#do-content-stream');
            if ($stream.length && $stream[0]) {
                $stream[0].style.setProperty('--bilingual-offset', targetOffset + 'px');
            }
        }
    }

    function handleGlobalTouchEnd(e) {
        if (!isTouchActive) return;
        isTouchActive = false;

        var touchEndX = (e.changedTouches && e.changedTouches.length) ? e.changedTouches[0].clientX : touchStartX;
        var touchEndY = (e.changedTouches && e.changedTouches.length) ? e.changedTouches[0].clientY : touchStartY;
        var deltaX = touchEndX - touchStartX;
        var deltaY = touchEndY - touchStartY;
        var dt = Math.max(1, Date.now() - touchStartTime);
        var vx = deltaX / dt; // velocity in px/ms

        var $sidebar = $('#doSidebar');
        var $backdrop = $('#sidebarBackdrop');
        var sidebarW = 290;

        $('.do-bilingual-row').removeClass('is-dragging');

        if (touchMode === 'sidebar_open') {
            $('body').removeClass('is-dragging-sidebar');
            $sidebar.css('transform', '');
            $backdrop.css({ 'opacity': '', 'display': '' });

            var currentOffset = -sidebarW + deltaX;
            var progress = (sidebarW + currentOffset) / sidebarW;

            if (progress > 0.20 || (vx > 0.18 && deltaX > 15) || deltaX > 45) {
                // Snap Open instantly
                $sidebar.addClass('open active');
                $backdrop.addClass('open active');
                $('body').addClass('sidebar-open');
                document.body.style.overflow = 'hidden';
                triggerHapticFeedback('open');
            } else {
                // Snap Back Closed instantly
                $sidebar.removeClass('open active');
                $backdrop.removeClass('open active');
                $('body').removeClass('sidebar-open');
                document.body.style.overflow = '';
            }
        } else if (touchMode === 'sidebar_close') {
            $('body').removeClass('is-dragging-sidebar');
            $sidebar.css('transform', '');
            $backdrop.css({ 'opacity': '', 'display': '' });

            var currentOffset = deltaX;
            var progress = (sidebarW + currentOffset) / sidebarW;

            if (progress < 0.80 || (vx < -0.18 && deltaX < -15) || deltaX < -45) {
                // Snap Closed instantly
                closeModals();
                triggerHapticFeedback('light');
            } else {
                // Snap Back Open instantly
                $sidebar.addClass('open active');
                $backdrop.addClass('open active');
                $('body').addClass('sidebar-open');
                document.body.style.overflow = 'hidden';
            }
        } else if (touchMode === 'bilingual') {
            var $stream = $('#do-content-stream');
            if (initialOffsetPx === 0) {
                // Was at Latin
                if (deltaX < -50 || (vx < -0.32 && deltaX < -20)) {
                    var prevLang = doState.mobileLang;
                    doState.mobileLang = 'vern';
                    if (prevLang !== 'vern') triggerHapticFeedback('swipe');
                    if ($stream.length && $stream[0]) {
                        $stream[0].style.setProperty('--bilingual-offset', 'calc(-50% - 0.75rem)');
                    }
                } else {
                    doState.mobileLang = 'la';
                    if ($stream.length && $stream[0]) {
                        $stream[0].style.setProperty('--bilingual-offset', '0%');
                    }
                }
            } else {
                // Was at Vernacular
                if (deltaX > 50 || (vx > 0.32 && deltaX > 20)) {
                    var prevLang = doState.mobileLang;
                    doState.mobileLang = 'la';
                    if (prevLang !== 'la') triggerHapticFeedback('swipe');
                    if ($stream.length && $stream[0]) {
                        $stream[0].style.setProperty('--bilingual-offset', '0%');
                    }
                } else {
                    doState.mobileLang = 'vern';
                    if ($stream.length && $stream[0]) {
                        $stream[0].style.setProperty('--bilingual-offset', 'calc(-50% - 0.75rem)');
                    }
                }
            }
        }

        touchMode = 'none';
    }

    document.addEventListener('touchstart', handleGlobalTouchStart, { passive: true });
    document.addEventListener('touchmove', handleGlobalTouchMove, { passive: false });
    document.addEventListener('touchend', handleGlobalTouchEnd, { passive: true });
    document.addEventListener('touchcancel', handleGlobalTouchEnd, { passive: true });

    if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
            if (doState.settings.theme === 'auto') {
                document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
                if (doState.hora === 'missa_gregorian') {
                    renderAllChantScoresInDOM($('#do-content-stream'), true);
                }
            }
        });
    }

    $(document).on('click', function(e) {
        if ($('#headerDropdown').hasClass('hidden')) return;
        if ($(e.target).closest('#headerDropdown, .header-title-area, .do-top-header, .dropdown-trigger').length) return;
        closeHeaderDropdown();
    });

    initDoPlayer();
}

// ---- Initialization ----
$(function() {
    console.log('Divinum Officium & Missale Initialized with Recursive Section & Variable Resolver.');
    initTheme();
    setupEventListeners();

    // Initialize Router & Deep-Linking from URL (No Page Refresh)
    if (window.OremusRouter) {
        window.OremusRouter.init();
    }

    $('#doDateInput').val(doState.date.format('YYYY-MM-DD'));
    renderDO();

    // Initialize system notification channels (Android)
    if (window.OremusSystemNotifications && typeof window.OremusSystemNotifications.initChannels === 'function') {
        window.OremusSystemNotifications.initChannels();
    }

    // Check for Releases FIRST (highest priority), then Remote Notifications
    setTimeout(function() {
        if (typeof checkForAppUpdates === 'function') {
            checkForAppUpdates(false);
        }
        setTimeout(function() {
            if (window.OremusNotifications && typeof window.OremusNotifications.check === 'function') {
                window.OremusNotifications.check(false);
            }
        }, 1200);
    }, 1200);

    // Initialize 20-minute usage tracker
    if (window.OremusUsageTracker && typeof window.OremusUsageTracker.init === 'function') {
        window.OremusUsageTracker.init();
    }

    // ── Android Native Back Button (Capacitor) ──
    function handleAppBackButton() {
        var hasOpenModals = $('#settingsPanel').hasClass('open') ||
                            $('#doSidebar').hasClass('open') ||
                            $('#gregorianSearchModal').hasClass('is-open') ||
                            $('#gregorianZoomModal').hasClass('is-open') ||
                            !$('#headerDropdown').hasClass('hidden') ||
                            !$('#remoteNotificationModal').hasClass('hidden') ||
                            !$('#feedbackModal').hasClass('hidden') ||
                            !$('#pwaInstallModal').hasClass('hidden') ||
                            !$('#appIconModal').hasClass('hidden') ||
                            !$('#notificationPromptModal').hasClass('hidden') ||
                            !$('#doHoraePicker').hasClass('hidden') ||
                            !$('#doMassTocPanel').hasClass('hidden');

        if (hasOpenModals) {
            closeModals();
            closeMassTocPanel();
            $('#doHoraePicker').addClass('hidden');
            return true;
        }

        if (window.history && window.history.length > 1 && doState.hora !== 'home') {
            window.history.back();
            return true;
        }

        if (doState.hora !== 'home') {
            doState.hora = 'home';
            doState.officiumKey = null;
            doState.testFeastKey = null;
            localStorage.removeItem('do_officiumKey');
            localStorage.setItem('do_hora', 'home');
            if (window.OremusRouter) window.OremusRouter.syncUrl({ push: true });
            renderDO();
            window.scrollTo({ top: 0, behavior: 'smooth' });
            return true;
        }

        return false;
    }

    // Capacitor Native Android Back Button Listener
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
        window.Capacitor.Plugins.App.addListener('backButton', function(event) {
            var handled = handleAppBackButton();
            if (!handled && event && typeof event.canGoBack !== 'undefined' && !event.canGoBack) {
                window.Capacitor.Plugins.App.exitApp();
            }
        });
    }

    // ── Automatic Reset to Home / Today after Inactivity (30 minutes) ──
    var LAST_ACTIVE_TIMESTAMP_KEY = 'do_last_active_timestamp';
    var INACTIVITY_RESET_MS = 30 * 60 * 1000; // 30 minutes

    function recordActivity() {
        try {
            localStorage.setItem(LAST_ACTIVE_TIMESTAMP_KEY, Date.now().toString());
        } catch (e) {}
    }

    function checkInactivityReset() {
        try {
            var lastActiveStr = localStorage.getItem(LAST_ACTIVE_TIMESTAMP_KEY);
            if (lastActiveStr) {
                var lastActive = parseInt(lastActiveStr, 10);
                var diff = Date.now() - lastActive;
                if (diff >= INACTIVITY_RESET_MS) {
                    console.log('[Oremus] Inactivity reset triggered (' + Math.round(diff / 60000) + ' min elapsed). Returning to Home / Today.');
                    doState.date = moment();
                    doState.hora = 'home';
                    doState.officiumKey = null;
                    doState.testFeastKey = null;
                    localStorage.removeItem('do_officiumKey');
                    localStorage.setItem('do_hora', 'home');
                    $('#doDateInput').val(doState.date.format('YYYY-MM-DD'));
                    closeModals();
                    renderDO();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            }
            recordActivity();
        } catch (e) {
            console.warn('[Oremus] checkInactivityReset exception:', e);
        }
    }

    // Record initial activity
    recordActivity();

    // Recheck on visibility return / focus
    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'visible') {
            checkInactivityReset();
            if (typeof checkForAppUpdates === 'function') {
                checkForAppUpdates(false);
            }
            setTimeout(function() {
                if (window.OremusNotifications) {
                    window.OremusNotifications.check(false);
                }
            }, 1000);
        } else {
            recordActivity();
        }
    });

    // Update activity timestamp on user interaction
    ['touchstart', 'mousedown', 'keydown', 'scroll'].forEach(function(evt) {
        window.addEventListener(evt, function() {
            recordActivity();
        }, { passive: true });
    });

    // Initialize TOC UI events
    initMassTocEvents();

    // Check initial hash for search or specific screens
    if (window.location.hash === '#search' && typeof window.openGregorianSearch === 'function') {
        setTimeout(function() {
            window.openGregorianSearch();
        }, 150);
    }
});

/* ═══════════════════════════════════════════════════════════════════
   ── MASS TABLE OF CONTENTS / INDEX (FLOATING PILL & FLYOUT) ──
   ═══════════════════════════════════════════════════════════════════ */

var _massTocGroups = [
    {
        title: "1. Avant-Messe & Parole",
        items: [
            { label: "Prières au bas de l'autel", match: /Judica me|Confiteor|Au bas de l'autel/i, cardId: /^Prayers/i, badge: "Ordinaire" },
            { label: "Introït", match: /^Introitus|^Introït/i, cardId: /^Introitus/i, badge: "Propre" },
            { label: "Kyrie eleison", match: /^Kyrie/i, cardId: /^Kyrie/i, badge: "Ordinaire" },
            { label: "Gloria in excelsis", match: /^Gloria/i, cardId: /^Gloria/i, badge: "Ordinaire" },
            { label: "Collecte (Oraison)", match: /^Oratio|^Collecta|^Collecte/i, cardId: /^Oratio/i, badge: "Propre" },
            { label: "Épître / Lecture", match: /^Epistola|^Lectio|^Épître|^Lecture/i, cardId: /^Epistola|^Lectio/i, badge: "Propre" },
            { label: "Graduel", match: /^Graduale|^Graduel/i, cardId: /^Graduale/i, badge: "Propre" },
            { label: "Alléluia", match: /^Alleluia/i, cardId: /^Alleluia/i, badge: "Propre" },
            { label: "Trait", match: /^Tractus|^Trait/i, cardId: /^Tractus/i, badge: "Propre" },
            { label: "Séquence", match: /^Sequentia|^Séquence/i, cardId: /^Sequentia/i, badge: "Propre" },
            { label: "Évangile", match: /^Evangelium|^Évangile/i, cardId: /^Evangelium/i, badge: "Propre" },
            { label: "Credo", match: /^Credo/i, cardId: /^Credo/i, badge: "Ordinaire" }
        ]
    },
    {
        title: "2. Offertoire & Préparation",
        items: [
            { label: "Offertoire", match: /^Offertorium|^Offertoire/i, cardId: /^Offertorium/i, badge: "Propre" },
            { label: "Oblation du Pain & du Calice", match: /Suscipe sancte Pater|Offerimus tibi|Oblation/i, cardId: /^Oblation/i, badge: "Ordinaire" },
            { label: "Lavabo & Suscipe Sancta Trinitas", match: /Lavabo|Suscipe sancta Trinitas/i, cardId: /^Lavabo/i, badge: "Ordinaire" },
            { label: "Orate Fratres & Secrète", match: /^Secreta|^Secrète|Orate fratres/i, cardId: /^Secreta/i, badge: "Propre" }
        ]
    },
    {
        title: "3. Canon & Consécration",
        items: [
            { label: "Préface & Sanctus", match: /^Praefatio|^Préface|Sanctus/i, cardId: /^Praefatio|^Sanctus/i, badge: "Ordinaire" },
            { label: "Canon Romain", match: /^Te igitur|^Canon/i, cardId: /^Canon/i, badge: "Ordinaire" },
            { label: "Consécration & Élévation", match: /Qui pridie|Hoc est enim|Consécration|Élévation/i, cardId: /^Consecratio/i, badge: "Ordinaire" },
            { label: "Pater Noster & Fraction", match: /^Pater noster|Fractio|Fraction/i, cardId: /^Pater/i, badge: "Ordinaire" }
        ]
    },
    {
        title: "4. Communion & Envoi",
        items: [
            { label: "Agnus Dei & Prières", match: /^Agnus Dei|Domine Jesu Christe/i, cardId: /^Agnus/i, badge: "Ordinaire" },
            { label: "Communion", match: /^Communio|^Communion/i, cardId: /^Communio/i, badge: "Propre" },
            { label: "Postcommunion", match: /^Postcommunio|^Postcommunion/i, cardId: /^Postcommunio/i, badge: "Propre" },
            { label: "Ite Missa Est & Bénédiction", match: /Ite missa est|Benedicat vos|Placeat tibi/i, cardId: /^Ite|^Benedictio/i, badge: "Ordinaire" },
            { label: "Dernier Évangile (In principio)", match: /In principio|Dernier Évangile/i, cardId: /^LastGospel|^InPrincipio/i, badge: "Ordinaire" }
        ]
    }
];

var _massTocSectionsMap = [];
var _massTocScrollDebounce = null;

function setupMassToc(missaResult) {
    _massTocSectionsMap = [];
    var $list = $('#doMassTocList').empty();
    var $cards = $('#do-content-stream .do-card');

    if (!$cards.length) {
        hideMassToc();
        return;
    }

    var usedCards = new Set();

    _massTocGroups.forEach(function(group, gIdx) {
        var groupItemsHtml = '';
        var hasMatchingItems = false;

        group.items.forEach(function(item) {
            // Find corresponding card in DOM
            var matchedCard = null;
            $cards.each(function() {
                if (usedCards.has(this)) return; // Don't reuse matched card
                var $c = $(this);
                var cardId = ($c.attr('data-card-id') || '').trim();
                var cardTitle = ($c.find('.do-card-title').text() || '').trim();
                var cardType = ($c.find('.do-card-type').text() || '').trim();

                if ((item.cardId && item.cardId.test(cardId)) ||
                    (item.match && (item.match.test(cardTitle) || item.match.test(cardType)))) {
                    matchedCard = this;
                    usedCards.add(this);
                    return false; // break
                }
            });

            if (matchedCard) {
                hasMatchingItems = true;
                var sectionId = 'mass-sec-' + gIdx + '-' + _massTocSectionsMap.length;
                matchedCard.setAttribute('id', sectionId);

                // Use the card's real display title or item label
                var rawCardTitle = $(matchedCard).find('.do-card-title').text().trim();
                var displayLabel = rawCardTitle || item.label;

                _massTocSectionsMap.push({
                    id: sectionId,
                    label: displayLabel,
                    element: matchedCard
                });

                groupItemsHtml += 
                    '<button class="do-mass-toc-item" data-target-id="' + sectionId + '" data-label="' + escHtml(displayLabel) + '">' +
                        '<span>' + escHtml(displayLabel) + '</span>' +
                    '</button>';
            }
        });

        if (hasMatchingItems) {
            var groupHtml = 
                '<div class="do-mass-toc-group">' +
                    groupItemsHtml +
                '</div>';
            $list.append(groupHtml);
        }
    });

    // Update bottom toggle button active states
    updateMassTocToggleStates();

    var isAlreadyOpen = $('body').hasClass('mass-toc-open') || !$('#doMassTocPanel').hasClass('hidden');

    if (_massTocSectionsMap.length > 0) {
        $('#doMassTocPill').removeClass('hidden');
        if (isAlreadyOpen) {
            $('#doMassTocPill').addClass('is-open');
            $('#doMassTocPanel').removeClass('hidden');
            $('#doMassTocBackdrop').removeClass('hidden');
            stopBilingualSwipeHint();
        } else {
            $('#doMassTocCurrentLabel').text('Sommaire');
        }
        initMassTocScrollSpy();
        updateMassTocActiveItem();
        updateMassTocListScrollMask();
    } else {
        hideMassToc();
    }
}

function updateMassTocToggleStates() {
    var chantActive = (doState.includeGregorian !== false);
    var ordinariumActive = (doState.includeOrdinarium === true);

    $('#btnMassTocToggleChant').toggleClass('is-active', chantActive);
    $('#btnMassTocToggleOrdinarium').toggleClass('is-active', ordinariumActive);
}

function hideMassToc() {
    $('#doMassTocPill').addClass('hidden');
    closeMassTocPanel();
    _massTocSectionsMap = [];
}

function openMassTocPanel() {
    triggerHapticFeedback('light');
    
    // Stop and hide bilingual swipe hint tutorial
    if (typeof stopBilingualSwipeHint === 'function') {
        stopBilingualSwipeHint();
    }
    $('#doBilingualGestureIndicator').remove();

    $('html, body').addClass('mass-toc-open');
    $('#doMassTocBackdrop').removeClass('hidden');
    $('#doMassTocPanel').removeClass('hidden');
    $('#doMassTocPill').addClass('is-open');
    $('#doMassTocPill .do-mass-toc-pill-icon').html(
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">' +
            '<line x1="18" y1="6" x2="6" y2="18"></line>' +
            '<line x1="6" y1="6" x2="18" y2="18"></line>' +
        '</svg>'
    );
    updateMassTocToggleStates();
    updateMassTocActiveItem();
    updateMassTocListScrollMask();
}

function updateMassTocListScrollMask() {
    var el = document.getElementById('doMassTocList');
    if (!el) return;
    var scrollTop = el.scrollTop;
    var scrollHeight = el.scrollHeight;
    var clientHeight = el.clientHeight;
    var isAtTop = (scrollTop <= 4);
    var isAtBottom = ((scrollTop + clientHeight) >= (scrollHeight - 4));
    var noScroll = (scrollHeight <= clientHeight + 4);

    var $el = $(el);
    $el.toggleClass('no-scroll', noScroll);
    $el.toggleClass('at-top', isAtTop && !noScroll);
    $el.toggleClass('at-bottom', isAtBottom && !noScroll);
}

function closeMassTocPanel() {
    $('html, body').removeClass('mass-toc-open');
    $('#doMassTocBackdrop').addClass('hidden');
    $('#doMassTocPanel').addClass('hidden');
    $('#doMassTocPill').removeClass('is-open');
    $('#doMassTocPill .do-mass-toc-pill-icon').html(
        '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
            '<line x1="8" y1="6" x2="21" y2="6"></line>' +
            '<line x1="8" y1="12" x2="21" y2="12"></line>' +
            '<line x1="8" y1="18" x2="21" y2="18"></line>' +
            '<circle cx="3.5" cy="6" r="1.5" fill="currentColor"></circle>' +
            '<circle cx="3.5" cy="12" r="1.5" fill="currentColor"></circle>' +
            '<circle cx="3.5" cy="18" r="1.5" fill="currentColor"></circle>' +
        '</svg>'
    );
}

function toggleMassTocPanel() {
    if ($('#doMassTocPanel').hasClass('hidden')) {
        openMassTocPanel();
    } else {
        triggerHapticFeedback('light');
        closeMassTocPanel();
    }
}

function updateMassTocActiveItem() {
    if (!_massTocSectionsMap || !_massTocSectionsMap.length) return;

    var $header = $('.do-top-header:visible');
    var headerH = $header.length ? $header.outerHeight() : 60;
    var $banner = $('.do-update-banner:visible');
    if ($banner.length) {
        headerH += $banner.outerHeight();
    }

    var vpTop = headerH;
    var vpBottom = window.innerHeight;

    // Adjust active reading viewport if player dock is open
    var $player = $('#modernPlayerBar:visible');
    if ($player.length && $('body').hasClass('player-dock-open')) {
        var playerRect = $player[0].getBoundingClientRect();
        if (playerRect.top > 0 && playerRect.top < vpBottom) {
            vpBottom = playerRect.top;
        }
    }

    var maxVisibleHeight = 0;
    var bestVisibleSec = null;
    var lastPassedSec = _massTocSectionsMap[0];

    // Detect if reached extreme top or bottom of page
    var scrollY = window.scrollY || window.pageYOffset || 0;
    var isAtTop = (scrollY <= 40);
    var isAtBottom = (window.innerHeight + scrollY >= (document.documentElement.scrollHeight - 40));

    for (var i = 0; i < _massTocSectionsMap.length; i++) {
        var sec = _massTocSectionsMap[i];
        var el = document.getElementById(sec.id) || sec.element;
        if (!el || !document.contains(el)) continue;

        var rect = el.getBoundingClientRect();
        
        // Track the last section whose top has entered or passed above the reading threshold
        if (rect.top <= (vpTop + 120)) {
            lastPassedSec = sec;
        }

        var visibleTop = Math.max(rect.top, vpTop);
        var visibleBottom = Math.min(rect.bottom, vpBottom);
        var visibleHeight = Math.max(0, visibleBottom - visibleTop);

        if (visibleHeight > maxVisibleHeight) {
            maxVisibleHeight = visibleHeight;
            bestVisibleSec = sec;
        }
    }

    var activeSec = null;
    if (isAtTop) {
        activeSec = _massTocSectionsMap[0];
    } else if (isAtBottom && _massTocSectionsMap.length) {
        activeSec = _massTocSectionsMap[_massTocSectionsMap.length - 1];
    } else if (bestVisibleSec && maxVisibleHeight > 30) {
        activeSec = bestVisibleSec;
    } else if (lastPassedSec) {
        activeSec = lastPassedSec;
    } else {
        activeSec = _massTocSectionsMap[0];
    }

    if (activeSec && activeSec.label) {
        $('#doMassTocList .do-mass-toc-item').removeClass('is-active');
        var $activeItem = $('#doMassTocList .do-mass-toc-item[data-target-id="' + activeSec.id + '"]');
        $activeItem.addClass('is-active');
        $('#doMassTocCurrentLabel').text(activeSec.label);
    }
}

function initMassTocScrollSpy() {
    $(window).off('scroll.domasstoc').on('scroll.domasstoc', function() {
        if (_massTocScrollDebounce) clearTimeout(_massTocScrollDebounce);
        _massTocScrollDebounce = setTimeout(function() {
            updateMassTocActiveItem();
        }, 50);
    });

    updateMassTocActiveItem();
}

function initMassTocEvents() {
    // Toggle panel on Pill click (morphs between Open and Close)
    $(document).off('click.domasstocpill', '#doMassTocPill').on('click.domasstocpill', '#doMassTocPill', function(e) {
        e.preventDefault();
        e.stopPropagation();
        toggleMassTocPanel();
    });

    // Close panel on backdrop click
    $(document).off('click.domasstocclose', '#doMassTocBackdrop')
        .on('click.domasstocclose', '#doMassTocBackdrop', function(e) {
            e.preventDefault();
            closeMassTocPanel();
        });

    // Prevent background touch scrolling when touch originates outside #doMassTocPanel
    $('#doMassTocBackdrop').off('touchmove.domasstoc').on('touchmove.domasstoc', function(e) {
        e.preventDefault();
    });

    // Stop propagation of wheel and touch events on TOC panel so it scrolls isolated
    $('#doMassTocPanel').off('wheel.domasstoc touchmove.domasstoc')
        .on('wheel.domasstoc touchmove.domasstoc', function(e) {
            e.stopPropagation();
        });

    // Update top & bottom fading gradients on list scroll
    $('#doMassTocList').off('scroll.domasstoclist').on('scroll.domasstoclist', function() {
        updateMassTocListScrollMask();
    });

    // Precise scroll on item click: aligns top of section card with generous margin below header
    $(document).off('click.domasstocitem', '.do-mass-toc-item').on('click.domasstocitem', '.do-mass-toc-item', function(e) {
        e.preventDefault();
        var targetId = $(this).attr('data-target-id');
        var targetEl = document.getElementById(targetId);
        if (targetEl) {
            triggerHapticFeedback('selection');
            closeMassTocPanel();

            // Pre-render any pending chant scores immediately so all SVG heights are final
            if (doState.includeGregorian) {
                renderAllChantScoresInDOM($('#do-content-stream'), true);
            }

            function calcScrollTarget() {
                var $header = $('.do-top-header:visible');
                var headerH = $header.length ? $header.outerHeight() : 60;
                var $banner = $('.do-update-banner:visible');
                if ($banner.length) {
                    headerH += $banner.outerHeight();
                }
                var rect = targetEl.getBoundingClientRect();
                return window.scrollY + rect.top - headerH - 28;
            }

            setTimeout(function() {
                var targetY = Math.max(0, calcScrollTarget());
                window.scrollTo({
                    top: targetY,
                    behavior: 'smooth'
                });

                // Periodic check during scroll animation to compensate for any font/SVG reflow
                [120, 280, 500, 750].forEach(function(delay) {
                    setTimeout(function() {
                        var currentTarget = Math.max(0, calcScrollTarget());
                        if (Math.abs(window.scrollY - currentTarget) > 8) {
                            window.scrollTo({
                                top: currentTarget,
                                behavior: 'smooth'
                            });
                        }
                    }, delay);
                });
            }, 40);
        }
    });

    // Bottom Toggle: Chant Grégorien
    $(document).off('click.domasstocchant', '#btnMassTocToggleChant').on('click.domasstocchant', '#btnMassTocToggleChant', function(e) {
        e.preventDefault();
        triggerHapticFeedback('light');
        doState.includeGregorian = !doState.includeGregorian;
        localStorage.setItem('do_include_gregorian', doState.includeGregorian);
        $('#toggleGregorian').prop('checked', doState.includeGregorian);
        updateMassTocToggleStates();
        renderDO();
    });

    // Bottom Toggle: Ordinaire de la messe
    $(document).off('click.domasstocord', '#btnMassTocToggleOrdinarium').on('click.domasstocord', '#btnMassTocToggleOrdinarium', function(e) {
        e.preventDefault();
        triggerHapticFeedback('light');
        doState.includeOrdinarium = !doState.includeOrdinarium;
        localStorage.setItem('do_ordinarium', doState.includeOrdinarium);
        $('#toggleOrdinarium').prop('checked', doState.includeOrdinarium);
        updateMassTocToggleStates();
        renderDO();
    });

    // Close on Escape key
    $(document).off('keydown.domasstoc').on('keydown.domasstoc', function(e) {
        if (e.key === 'Escape' && !$('#doMassTocPanel').hasClass('hidden')) {
            e.preventDefault();
            closeMassTocPanel();
        }
    });
}


