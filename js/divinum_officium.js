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
    function unlockAudio() {
        if (unlocked) return;
        if (window.Tone && typeof Tone.start === 'function') {
            Tone.start().then(function() {
                unlocked = true;
            }).catch(function() {});
        }
        if (window.tones && window.tones.context && window.tones.context.state === 'suspended') {
            window.tones.context.resume().catch(function() {});
        }
    }
    ['click', 'touchstart', 'touchend', 'pointerdown', 'keydown'].forEach(function(evt) {
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
    tempo: parseInt(localStorage.getItem('do_tempo'), 10) || 150,
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
    }
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

var DO_UI_TRANSLATIONS = {
    fr: {
        app_sub: 'BRÉVIAIRE & MISSEL',
        home: 'Accueil',
        home_tag: 'Hodie & Cursus',
        liturgia_diei: 'Liturgie du Jour',
        cursus_horarum: 'Heures Canoniales',
        sacra_biblia: 'Sainte Bible',
        sacra_biblia_tag: 'Vulgata & AELF',
        missa: 'Messe',
        missa_tag: 'Sainte Messe',
        missa_gregorian: 'Messe & Grégorien',
        missa_gregorian_tag: 'Page de Test',
        matutinum: 'Matines',
        matutinum_tag: 'Vigiles',
        laudes: 'Laudes',
        laudes_tag: 'Aurore',
        prima: 'Prime',
        prima_tag: '1ère Heure',
        tertia: 'Tierce',
        tertia_tag: '3ème Heure',
        sexta: 'Sexte',
        sexta_tag: 'Midi',
        nona: 'None',
        nona_tag: '9ème Heure',
        vesperae: 'Vêpres',
        vesperae_tag: 'Soir',
        completorium: 'Complies',
        completorium_tag: 'Nuit',
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
        missa: 'Missa',
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
    $.ajax({
        url: path,
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
                if (Object.keys(sec).length > 2) {
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
            if (Object.keys(sec).length > 2) {
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
    fetchLocalFile(ordoPath, function(oErr, oData) {
        var ordoParts = (!oErr && oData) ? parseOrdoFile(oData) : {};
        assembleFullMissa(fullSections, ordoParts, langFolder, feastTitle, callback, loadedPath, detectedCommune);
    });
}

function assembleFullMissa(propSec, ordoParts, langFolder, feastTitle, callback, loadedPath, communeRef) {
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
        if (kyrie.length) cards.push({ id: 'kyrie', type: 'Kýrie & Glória in excélsis', badge: 'Ordinarium', lines: kyrie });
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

    return '<div class="do-card' + cardMod + '">' +
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
    if (/^[SMPCOvrVRD]\.[\s\u00a0]*/i.test(line)) {
        return line.charAt(0).toUpperCase();
    }
    // Lines starting with !, {, or entirely enclosed in parentheses or rubric text
    if (/^!/.test(line) || /^\{/.test(line) || /^\([^)]+\):?$/i.test(line) || (/^\(/.test(line) && /\)$/.test(line))) {
        return 'RUBRIC';
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

        // Exact match of speaker / rubric type
        if (laSp && vernSp && laSp === vernSp) {
            rows.push({ la: laL, vern: vernL });
            i++; j++;
            continue;
        }

        // Lookahead in Vernacular (up to 3 steps)
        var matchInVern = -1;
        for (var k = 1; k <= 3 && j + k < m; k++) {
            if (getSpeakerType(vernLines[j + k]) === laSp) {
                matchInVern = k;
                break;
            }
        }

        // Lookahead in Latin (up to 3 steps)
        var matchInLa = -1;
        for (var k = 1; k <= 3 && i + k < n; k++) {
            if (getSpeakerType(laLines[i + k]) === vernSp) {
                matchInLa = k;
                break;
            }
        }

        if (matchInVern > 0 && (matchInLa < 0 || matchInVern <= matchInLa)) {
            rows.push({ la: '', vern: vernL });
            j++;
            continue;
        } else if (matchInLa > 0) {
            rows.push({ la: laL, vern: '' });
            i++;
            continue;
        }

        // Default: match row
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

function renderChantSkeleton() {
    return '<div class="do-chant-skeleton">' +
        '<div class="do-skel w95"></div>' +
        '<div class="do-skel w85"></div>' +
        '<div class="do-skel w90"></div>' +
        '<div class="do-skel w80"></div>' +
        '<div class="do-skel w60"></div>' +
    '</div>';
}

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
    var vernFolder = (vernLang === 'fr') ? 'aelf' : (vernLang === 'en') ? 'douay-rheims' : (vernLang === 'pt') ? 'matos-soares' : null;
    var vernPath = vernFolder ? (vernFolder + '/' + bookId + '.txt') : null;

    fetchLocalFile(laPath, function(err, laData) {
        var laVerses = (!err && laData) ? parseBibleFileVerses(laData, chapterNum) : {};

        if (vernPath && vernLang) {
            fetchLocalFile(vernPath, function(err2, vernData) {
                var vernVerses = (!err2 && vernData) ? parseBibleFileVerses(vernData, chapterNum) : {};
                buildBibleMainViewHTML(bkObj, chapterNum, pageNum, pageSize, laVerses, vernVerses);
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
    var isBilingual = (doState.showLatin && vernLang && vernVerses);
    var isVernOnly = (!doState.showLatin && vernLang && vernVerses);

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
    var cardTitle = bookTitle + ' — Cap. ' + chapterNum;
    var countBadge = visibleRows.length ? (visibleRows.length + ' versus') : '';

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


function renderHomeView() {
    var $stream = $('#do-content-stream').empty();
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

        var $view = $('<div class="do-home-styled">');

        // ---- BARRE DE RECHERCHE GLOBALE ----
        var searchPlaceholder = (uiLang === 'fr') ? "Rechercher un saint, un dimanche, une fête ou un livre biblique..." : "Quære sanctum, dominicam aut librum...";
        var $searchBar = $('<div class="do-home-search-bar-wrap">')
            .append('<svg class="do-home-search-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>')
            .append('<input type="text" id="doHomeSearchInput" class="do-home-search-input" placeholder="' + escHtml(searchPlaceholder) + '" autocomplete="off">')
            .append('<button id="doHomeSearchClear" class="do-home-search-clear hidden">&times;</button>')
            .append('<div id="doHomeSearchResults" class="do-home-search-results hidden"></div>');

        $view.append($searchBar);

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

        $stream.append($view);
        setupHomeSearch();
    });
}

function renderDO() {
    updateEffectiveColor();
    updateSidebarAndHeader();
    closeHeaderDropdown();

    var isHome = (doState.hora === 'home');
    var isBible = (doState.hora === 'bible');
    $('body').toggleClass('is-bible-mode', isBible);

    if (isHome) {
        renderHomeView();
        return;
    }

    if (isBible) {
        closeDoPlayer();
        renderBibleMainView();
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
        var kyrieList = [];
        var kId = getOrdId(ord.kyrie);
        if (kId) kyrieList.push({ id: kId, name: getOrdName(ord.kyrie, 'Kyrie eleison'), part: 'Kyrie' });
        var gId = getOrdId(ord.gloria);
        if (gId) kyrieList.push({ id: gId, name: getOrdName(ord.gloria, 'Gloria in excelsis Deo'), part: 'Gloria' });
        if (kyrieList.length) result['kyrie'] = kyrieList;
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

    // 2. Remove ledger line indications like [oll:1{}] or [ull:0;12mm]
    gabc = gabc.replace(/\[[ou]ll:[01]?[{}][01]?\]/ig, '');

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

function formatChantTime(s) {
    if (isNaN(s) || s < 0) s = 0;
    var m = Math.floor(s / 60);
    var sec = Math.floor(s % 60);
    return m + ':' + (sec < 10 ? '0' : '') + sec;
}

function updateDoPlayerProgressAndTime(score, note, progressFraction) {
    if (!score || !score.notations) return;
    var allNotes = [].concat.apply([], score.notations.map(function(notat) { return notat.notes || []; }));
    if (!allNotes.length) return;

    var tempoBpm = parseInt($('#playerTempoValue').text(), 10) || 150;
    var secPerNote = 60 / tempoBpm;
    var totalSeconds = allNotes.length * secPerNote;

    var pct = 0;
    var currentIdx = 0;

    if (typeof progressFraction === 'number') {
        pct = Math.max(0, Math.min(100, progressFraction * 100));
        currentIdx = Math.floor(progressFraction * allNotes.length);
    } else if (note) {
        var idx = allNotes.indexOf(note);
        if (idx < 0) {
            for (var i = 0; i < allNotes.length; i++) {
                if (allNotes[i] === note || (note.sourceIndex !== undefined && allNotes[i].sourceIndex === note.sourceIndex) || (note.elementIndex !== undefined && allNotes[i].elementIndex === note.elementIndex)) {
                    idx = i;
                    break;
                }
            }
        }
        currentIdx = Math.max(0, idx);
        pct = (currentIdx / allNotes.length) * 100;
    }

    var elapsedSec = currentIdx * secPerNote;
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

var _doCurrentPlayerCard = null;
var _doCurrentScore = null;
var _doProgressInterval = null;
var _doActiveNoteEl = null; // The single currently-highlighted note element
var _doActiveLyricEl = null; // The single currently-highlighted lyric text element

function clearActiveNote() {
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

function handleChantElementClick(clickedEl, e) {
    if (e) e.stopPropagation();

    // Deactivate on Bible pages
    if (window.doState && window.doState.hora === 'bible') return;

    // Stop previous chant cleanly if one was playing
    var wasPlaying = (window.isPlayingChant && window.isPlayingChant());
    if (window.stopScore) {
        window.stopScore();
    }
    setDoPlayerBarState(false);

    // Clear previous selection
    clearActiveNote();

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

    if (noteEl) {
        noteEl.classList.add('active');
        noteEl.style.setProperty('fill', accentColor, 'important');
        _doActiveNoteEl = noteEl;
    }
    if (lyricEl) {
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
    }
    // Update player UI to target card and score
    updateDoPlayerUI($card, score, wasPlaying);
    updateDoPlayerProgressAndTime(score, note);

    if (wasPlaying) {
        if (window.Tone) {
            if (typeof Tone.start === 'function') Tone.start().catch(function(){});
            if (Tone.context && Tone.context.state !== 'running') Tone.context.resume().catch(function(){});
        }
        if (window.playScore) {
            window.playScore(score, score.defaultStartPitch, note);
            setDoPlayerBarState(true);
        }
    }
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

    if (_doCurrentPlayerCard) {
        _doCurrentPlayerCard.removeClass('is-playing');
        _doCurrentPlayerCard.removeData('selected-start-note');
        var svg = _doCurrentPlayerCard.find('svg')[0];
        if (svg) $(svg).find('use.active, text.active, tspan.active').removeClass('active porrectus-left porrectus-right');
    }
    _doCurrentPlayerCard = null;
    _doCurrentScore = null;
}

function initDoPlayer() {
    // Restart from beginning button
    $('#playerBtnRestart').off('click').on('click', function(e) {
        e.stopPropagation();
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
        if (window.Tone) {
            if (typeof Tone.start === 'function') Tone.start().catch(function(){});
            if (Tone.context && Tone.context.state !== 'running') Tone.context.resume().catch(function(){});
        }
        if (window.isPlayingChant && window.isPlayingChant()) {
            // Currently playing → pause/resume
            if (window.playPauseScore) {
                var resumed = window.playPauseScore();
                setDoPlayerBarState(resumed);
            } else if (window.stopScore) {
                window.stopScore();
                setDoPlayerBarState(false);
            }
        } else if (_doCurrentScore && window.playScore) {
            // Start from selected note (if user clicked a note) or from beginning
            var startNote = _doCurrentPlayerCard ? _doCurrentPlayerCard.data('selected-start-note') : null;
            window.playScore(_doCurrentScore, _doCurrentScore.defaultStartPitch, startNote);
            setDoPlayerBarState(true);
        }
    });

    // Close and stop player buttons
    $('#playerBtnClose, #playerBtnStop').off('click').on('click', function(e) {
        e.stopPropagation();
        closeDoPlayer();
    });

    // Next note button (step forward)
    $('#playerBtnNext').off('click').on('click', function(e) {
        e.stopPropagation();
        if (window.stepForward) {
            window.stepForward();
        }
    });

    // Transposition Pitch Down / Up (pure parameter adjustment, no auto-play)
    $('#playerPitchDown').off('click').on('click', function(e) {
        e.stopPropagation();
        if (!_doCurrentScore) return;
        var p = _doCurrentScore.defaultStartPitch;
        var curVal = (p && typeof p.toInt === 'function') ? p.toInt() : (typeof p === 'number' ? p : 0);
        var newVal = curVal - 1;
        _doCurrentScore.defaultStartPitch = (window.exsurge && window.exsurge.Pitch) ? new exsurge.Pitch(newVal) : newVal;
        updateDoPitchUI(_doCurrentScore);
    });

    $('#playerPitchUp').off('click').on('click', function(e) {
        e.stopPropagation();
        if (!_doCurrentScore) return;
        var p = _doCurrentScore.defaultStartPitch;
        var curVal = (p && typeof p.toInt === 'function') ? p.toInt() : (typeof p === 'number' ? p : 0);
        var newVal = curVal + 1;
        _doCurrentScore.defaultStartPitch = (window.exsurge && window.exsurge.Pitch) ? new exsurge.Pitch(newVal) : newVal;
        updateDoPitchUI(_doCurrentScore);
    });

    // Solesmes Salicus Lengthening toggle
    $('#playerBtnSolesmes').off('click').on('click', function(e) {
        e.stopPropagation();
        if (window.getIsUsingSolesmesLengths && window.setIsUsingSolesmesLengths) {
            var next = !window.getIsUsingSolesmesLengths();
            window.setIsUsingSolesmesLengths(next);
            $(this).toggleClass('active', next);
        }
    });

    // Tempo minus / plus (10 BPM increments)
    $('#playerTempoMinus').off('click').on('click', function(e) {
        e.stopPropagation();
        var cur = parseInt($('#playerTempoValue').text(), 10) || 150;
        var next = Math.max(60, cur - 10);
        $('#playerTempoValue').text(next);
        if (window.setTempo) window.setTempo(next);
        if (_doCurrentScore) updateDoPlayerProgressAndTime(_doCurrentScore, null, window.getChantProgress ? window.getChantProgress() : 0);
    });

    $('#playerTempoPlus').off('click').on('click', function(e) {
        e.stopPropagation();
        var cur = parseInt($('#playerTempoValue').text(), 10) || 150;
        var next = Math.min(300, cur + 10);
        $('#playerTempoValue').text(next);
        if (window.setTempo) window.setTempo(next);
        if (_doCurrentScore) updateDoPlayerProgressAndTime(_doCurrentScore, null, window.getChantProgress ? window.getChantProgress() : 0);
    });

    // Progress bar click to seek
    $('#playerProgressBarContainer').off('click').on('click', function(e) {
        e.stopPropagation();
        if (!_doCurrentPlayerCard || !_doCurrentScore) return;
        var rect = this.getBoundingClientRect();
        var clickX = e.clientX - rect.left;
        var percent = Math.max(0, Math.min(1, clickX / rect.width));

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
            handleChantElementClick(targetNode, e);

            if (window.Tone) {
                if (typeof Tone.start === 'function') Tone.start().catch(function(){});
                if (Tone.context && Tone.context.state !== 'running') Tone.context.resume().catch(function(){});
            }

            if (window.playScore) {
                window.playScore(_doCurrentScore, _doCurrentScore.defaultStartPitch, note);
                setDoPlayerBarState(true);
            }
        }
    });

    // Delegated note + syllable click on content stream
    var NOTE_SEL = '.do-chant-card svg use[source-index], .do-chant-card svg text[source-index], .do-chant-card svg text.lyric, .do-chant-card svg text.lyric tspan, .do-chant-card svg text.dropCap, .do-chant-card svg text.dropCap tspan, .do-chant-card svg text.aboveLinesText, .do-chant-card svg text.aboveLinesText tspan';
    $('#do-content-stream').off('click', NOTE_SEL).on('click', NOTE_SEL, function(e) {
        handleChantElementClick(this, e);
    });

    // Delegated click on chant cards / previews (clicks near notes/syllables or anywhere on card)
    $('#do-content-stream').off('click', '.do-chant-card, .do-chant-preview, .do-chant-preview svg').on('click', '.do-chant-card, .do-chant-preview, .do-chant-preview svg', function(e) {
        if ($(e.target).closest('use[source-index], text[source-index], text.lyric, text.dropCap, text.aboveLinesText').length) return;
        var $card = $(this).closest('.do-chant-card');
        if (!$card.length) return;

        var svg = $card.find('svg')[0];
        if (svg) {
            var nearest = findNearestChantElement(svg, e.pageX, e.pageY);
            if (nearest) {
                handleChantElementClick(nearest, e);
                return;
            }
        }
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

function isElementInVisibleViewport(el) {
    if (!el) return false;
    var rect = el.getBoundingClientRect();
    var playerBar = document.getElementById('modernPlayerBar');
    var bottomReserved = (playerBar && playerBar.classList.contains('visible')) ? playerBar.offsetHeight + 20 : 80;
    var topReserved = 70; // Top header navbar

    return (
        rect.top >= topReserved &&
        rect.bottom <= (window.innerHeight - bottomReserved) &&
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
        var rect = activeElem.getBoundingClientRect();
        var playerBar = document.getElementById('modernPlayerBar');
        var bottomBarH = (playerBar && playerBar.classList.contains('visible')) ? playerBar.offsetHeight : 100;
        var topBarH = 60;
        var visibleH = window.innerHeight - topBarH - bottomBarH;
        var targetY = window.scrollY + rect.top - (topBarH + visibleH / 2) + (rect.height / 2);

        _isAutoScrolling = true;
        window.scrollTo({
            top: Math.max(0, targetY),
            behavior: 'smooth'
        });
        setTimeout(function() {
            _isAutoScrolling = false;
        }, 600);
    } catch(e) {
        if (activeElem.scrollIntoView) {
            _isAutoScrolling = true;
            activeElem.scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(function() { _isAutoScrolling = false; }, 600);
        }
    }
}

window.onChantNoteActive = function(el) {
    if (!window.isPlayingChant || !window.isPlayingChant()) return;
    if (_userIsScrolling) return; // Do not interrupt manual user scrolling
    if (el && !isElementInVisibleViewport(el)) {
        centerActiveNote(false);
    }
};

function initUserScrollTracker() {
    function handleUserScrollInteraction() {
        if (_isAutoScrolling) return;
        _userIsScrolling = true;
        if (_userScrollTimer) clearTimeout(_userScrollTimer);
        _userScrollTimer = setTimeout(function() {
            _userIsScrolling = false;
            // After 2.5s without scroll, if chant is playing and active note is out of view, re-center!
            if (window.isPlayingChant && window.isPlayingChant()) {
                var activeElem = document.querySelector('svg use.active, svg .active');
                if (activeElem && !isElementInVisibleViewport(activeElem)) {
                    centerActiveNote(false);
                }
            }
        }, 2500);
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

    $('.do-chant-card').removeClass('is-playing');
    if ($card) $card.addClass('is-playing');
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

function startDoProgressTracking() {
    if (_doProgressInterval) clearInterval(_doProgressInterval);
    _doProgressInterval = setInterval(function() {
        if (!window.isPlayingChant || !window.isPlayingChant()) {
            if (_doProgressInterval) clearInterval(_doProgressInterval);
            setDoPlayerBarState(false);
            return;
        }
        if (window.getChantProgress) {
            var percent = window.getChantProgress() * 100;
            if (percent > 100) percent = 100;
            $('#playerProgressFill').css('width', percent + '%');
            if (percent >= 100) {
                setDoPlayerBarState(false);
            }
        }
    }, 150);
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

    var pitchObj = (score.defaultStartPitch && typeof score.defaultStartPitch.toInt === 'function') 
        ? score.defaultStartPitch 
        : new exsurge.Pitch(startPitch);

    var noteNames = ['Do', 'Do♯', 'Ré', 'Ré♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'];
    var stepIndex = (typeof pitchObj.step === 'number') ? (pitchObj.step % 12) : 0;
    var stepName = noteNames[stepIndex] || 'La';
    $('#playerStartingPitch').text(stepName + (pitchObj.octave !== undefined ? pitchObj.octave : ''));
}

function renderSingleChantScore($wrapper, force) {
    if (!force && $wrapper.data('do-rendered')) return;
    var chantId = $wrapper.data('chant-id');
    var defaultName = $wrapper.data('chant-name') || ('Chant ' + chantId);
    var defaultPart = $wrapper.data('chant-part') || 'Chant grégorien';

    if (!chantId) {
        $wrapper.html('<div class="do-chant-error">Identifiant de chant non spécifié.</div>');
        return;
    }

    var cachedGabc = $wrapper.data('cached-gabc');
    if (cachedGabc) {
        $wrapper.data('do-rendered', true);
        processGabcData(cachedGabc);
        return;
    }

    $wrapper.data('do-rendered', true);
    var gabcUrl = 'gabc/' + chantId + '.gabc';

    function processGabcData(data) {
        if (!data) {
            $wrapper.html('<div class="do-chant-error">Partition ' + chantId + ' non disponible.</div>');
            return;
        }
        $wrapper.data('cached-gabc', data);
        var header = parseGabcHeader(data);
        var title = header.name || defaultName;
        var officePart = header['office-part'] || defaultPart;
        var mode = header.mode || '';

        var modeHtml = mode ? '<span class="do-chant-mode-badge">Ton ' + escHtml(mode) + '</span>' : '';

        var cardHtml = 
            '<div class="do-chant-card">' +
                '<div class="do-chant-preview">' + renderChantSkeleton() + '</div>' +
            '</div>';

        var $card = $(cardHtml);
        $wrapper.empty().append($card);

        $card.data('chant-part', officePart);
        $card.data('chant-title', title);

        var $preview = $card.find('.do-chant-preview');

        // Exsurge Rendering
        if (typeof exsurge !== 'undefined') {
            try {
                var ctxt = new exsurge.ChantContext();
                var curTheme = document.documentElement.getAttribute('data-theme') || 'dark';
                var isDark = (curTheme !== 'light');
                var accentColor = doState.settings.color || '#c96b63';

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

                var processedGabc = preprocessGabcForExsurge(data);
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
                    var svg = score.createSvgNode(ctxt);
                    if (svg) {
                        svg.setAttribute('width', '100%');
                        svg.style.width = '100%';
                        svg.style.maxWidth = '100%';
                        svg.style.height = 'auto';

                        var noteFill = isDark ? '#ffffff' : '#111317';
                        svg.setAttribute('fill', noteFill);
                        svg.style.fill = noteFill;

                        $preview.empty().append(svg);
                        $card.data('chant-score', score);
                        $card.data('chant-ctxt', ctxt);
                        $card.data('chant-gabc', processedGabc);
                    }
                });
            } catch(e) {
                console.warn('Exsurge error:', e);
                $preview.html('<div class="do-chant-error">Erreur de rendu Exsurge: ' + escHtml(e.message) + '</div>');
            }
        } else {
            $preview.html('<div class="do-chant-error">Moteur Exsurge non chargé.</div>');
        }
    }

    if (GABC_LOCAL_CACHE[chantId]) {
        processGabcData(GABC_LOCAL_CACHE[chantId]);
    } else {
        $.ajax({
            url: gabcUrl,
            dataType: 'text',
            cache: true
        }).done(function(data) {
            GABC_LOCAL_CACHE[chantId] = data;
            processGabcData(data);
        }).fail(function() {
            $wrapper.html('<div class="do-chant-error">Impossible de charger la partition ' + chantId + '.</div>');
        });
    }
}

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
    if (!doState.includeGregorian) return;
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
            if (doState.includeGregorian) {
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
    if (!doState.includeGregorian) return;
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
            if (entry.isIntersecting) {
                var el = entry.target;
                observer.unobserve(el);
                var $wrapper = $(el);
                if (doState.includeGregorian) {
                    renderSingleChantScore($wrapper);
                }
            }
        });
    }, {
        root: null,
        rootMargin: '300px 0px 300px 0px',
        threshold: 0.01
    });

    return chantIntersectionObserver;
}

function renderAllChantScoresInDOM($root, force) {
    var $wrappers = ($root || $('#do-content-stream')).find('.do-chant-card-wrapper');
    if (!$wrappers.length) return;

    if (!doState.includeGregorian) {
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
                    '<div class="do-chant-card"><div class="do-chant-preview">' + renderChantSkeleton() + '</div></div>' +
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

    // Render all chant scores in DOM when Gregorian is enabled
    if (isMissa && doState.includeGregorian) {
        renderAllChantScoresInDOM($stream);
    }

    startBilingualSwipeHint();
}

var swipeHintTimer = null;

function startBilingualSwipeHint() {
    if ($(window).width() > 768) return;
    if (localStorage.getItem('do_swipe_hint_done')) return;

    var isBilingual = (doState.showLatin && doState.vernacularLang && doState.vernacularLang !== 'none');
    if (!isBilingual) return;

    if (swipeHintTimer) {
        clearInterval(swipeHintTimer);
        swipeHintTimer = null;
    }

    // Initial hint after 1.2s
    setTimeout(function() {
        playBilingualSwipeHint();
    }, 1200);

    // Repeat every 5.5s until user swipes
    swipeHintTimer = setInterval(function() {
        if (localStorage.getItem('do_swipe_hint_done') || doState.mobileLang === 'vern') {
            stopBilingualSwipeHint();
            return;
        }
        playBilingualSwipeHint();
    }, 5500);
}

function playBilingualSwipeHint() {
    if (localStorage.getItem('do_swipe_hint_done') || doState.mobileLang === 'vern') {
        stopBilingualSwipeHint();
        return;
    }
    var $rows = $('.do-bilingual-row');
    if ($rows.length) {
        $rows.addClass('do-bilingual-hint-anim');
        setTimeout(function() {
            $rows.removeClass('do-bilingual-hint-anim');
        }, 1300);
    }
}

function stopBilingualSwipeHint() {
    if (swipeHintTimer) {
        clearInterval(swipeHintTimer);
        swipeHintTimer = null;
    }
    localStorage.setItem('do_swipe_hint_done', 'true');
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
    } else {
        $('#doHourLabel').text((horaLabel + ' • ' + dateFormatted).toUpperCase());
    }

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
    renderDO();
}

function closeModals() {
    $('#settingsPanel, #doSidebar').removeClass('open active anim-overshoot').css('transform', '');
    $('#settingsBackdrop, #sidebarBackdrop').removeClass('open active').css({ 'opacity': '', 'display': '' });
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
        "Dec25_1": "Nativitas Domini, Missa ad media noctem",
        "Dec25_2": "Nativitas Domini, Missa ad matutinam",
        "Dec25_3": "Nativitas Domini, Missa interdiu",
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
        "Jan5": "S. Télesphore, Pape et Martyr",
        "Jan11": "S. Hygin, Pape et Martyr",
        "Jan13": "Baptism of Our Lord Jesus Christ",
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
        "Feb15": "SS. Faustini et Jovitæ Martyrum",
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
        "May11": "Ss Philip and James",
        "May12": "Saints Nérée, Achille, la Vierge Domitille et Pancrace, Martyrs",
        "May13": "Saint Robert Bellarmin, Évêque, Confesseur et Docteur de l’Église",
        "May14": "Saint Boniface Martyr",
        "May15": "S. Joannis Baptistæ de la Salle Confessoris",
        "May16": "Saint Ubald, Évêque et Confesseur",
        "May17": "Saint Pascal Baylon Confesseur",
        "May18": "S. Venantii Martyris",
        "May19": "S. Pierre Celestin Pape et Confesseur",
        "May20": "S. Bernardini Senensis Confessoris",
        "May24": "Our Lady Help of Christians",
        "May25": "S. Gregoire VII Pape et Confesseur",
        "May26": "S. Philippe Neri Confesseur",
        "May27": "S. Bède le Vénérable, Confesseur et Docteur de l’Église",
        "May28": "St Augustin de Cantorbéry, évêque et confesseur",
        "May29": "S. Marie-Madeleine de Pazzi, Vierge",
        "May30": "S. Felix Ier Pape et Martyr",
        "May31": "Queenship of BVM",
        "Jun1": "S. Angèle Mérici, Vierge",
        "Jun2": "Ss. Marcellini, Petri, atque Erasmi Martyrum",
        "Jun4": "S. Francisci Caracciolo Confessoris",
        "Jun5": "S. Boniface Évêque et Martyr",
        "Jun6": "S. Norbert Evêque et Confesseur",
        "Jun9": "Ss. Prime et Félicien Martyrs",
        "Jun10": "S. Marguerite Reine et Veuve",
        "Jun11": "S. Barnabé Apôtre",
        "Jun12": "S. Jean de S. Facond Confesseur",
        "Jun13": "S. Antoine de Padoue Confesseur",
        "Jun14": "S. Basile le Grand, Confesseur et Docteur de l’Église",
        "Jun15": "Ss. Vite, Modeste et Crescence, Martyrs",
        "Jun17": "St Gregory Barbadici",
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
        "Jul2": "The Visitation of BVM",
        "Jul3": "S. Léon, Pape et Confesseur",
        "Jul3a": "S. Léon, Pape et Confesseur",
        "Jul4": "Within the octave of the Apostles Peter and Paul",
        "Jul5": "S. Antoine Marie Zaccaria, Confesseur",
        "Jul6": "Octave des Ss. Apôtres Pierre et Paul",
        "Jul7": "Ss Cyrille et Méthode, Évêques et Confesseurs",
        "Jul8": "Ste Élisabeth, Reine du Portugal, Veuve",
        "Jul10": "Les saints Sept Frères Martys, et les saintes Rufine et Seconde, Vierges et Martyres",
        "Jul11": "S. Pie Ier, Pape et Martyr",
        "Jul11a": "S. Pie Ier, Pape et Martyr",
        "Jul12": "S. Jean Gualbert, Abbé",
        "Jul13": "S. Anaclet, Pape et Martyr",
        "Jul14": "S. Bonaventure, Évêque, Confesseur et Docteur de l’Église",
        "Jul15": "S. Henri, Empereur et Confesseur",
        "Jul16": "Our Lady of Mount Carmel",
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
        "Aug5": "Dedication of the Basilica of St Mary Major",
        "Aug6": "Transfiguration of Our Lord",
        "Aug7": "S. Gaétan de Thiène, Confesseur",
        "Aug8": "Ss Cyriaque, Large et Smaragde, Martyrs",
        "Aug8a": "Ss Cyriaque, Large et Smaragde, Martyrs",
        "Aug9": "S. Jean-Marie Vianney, Confesseur",
        "Aug10": "S. Laurent, Martyr",
        "Aug11": "Ss Tiburce et Suzanne, Vierge, Martyrs",
        "Aug12": "Ste Claire, Vierge",
        "Aug13": "Ss, Hippolyte et Cassien, Martyrs",
        "Aug14": "Vigil of Assumption of BVM",
        "Aug15": "Assumption of BVM",
        "Aug16": "St Joachim, père de la B. V. M.",
        "Aug17": "S. Hyacinthe, Confesseur",
        "Aug18": "St Agapitus",
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
        "Sep8": "Nativity of BVM",
        "Sep9": "S. Gorgon, Martyr",
        "Sep9a": "S. Pierre Claver, Confesseur",
        "Sep10": "S. Nicolas de Tolentino, Confesseur",
        "Sep11": "Saints Prote et Hyacinthe, Martyrs",
        "Sep12": "Le Très Saint Nom de Marie",
        "Sep14": "The Exaltation of the Holy Cross",
        "Sep15": "Seven Sorrows of BVM",
        "Sep16": "Ss Corneille, Pape, et Cyprien, Évêque, Martyrs",
        "Sep17": "Impression des Stigmates de Saint François",
        "Sep18": "S. Joseph de Cupertino, Confesseur",
        "Sep19": "St Janvier, Evêque, et ses Compagnons, Martyrs",
        "Sep19laSalette": "Notre-Dame de La Salette",
        "Sep20": "St Eustache et ses compagnons, Martyrs",
        "Sep21": "St Matthieu, Apôtre et Evangéliste",
        "Sep22": "St Thomas de Villeneuve, Evêque et Confesseur",
        "Sep23": "St Lin, Pape et Martyr",
        "Sep24": "Our Lady of Ransom",
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
        "Oct7": "The Most Holy Rosary of BVM",
        "Oct8": "Ste Brigitte, Veuve",
        "Oct9": "St Jean Léonardi, Confesseur",
        "Oct10": "St François de Borgia, Confesseur",
        "Oct11": "Maternitatis Beatæ Mariæ Virginis",
        "Oct13": "St Edouard, Roi et Confesseur",
        "Oct14": "St Calixte Ier, Pape et Martyr",
        "Oct15": "Ste Thérèse, Vierge",
        "Oct16": "Ste Hedwige, Veuve",
        "Oct17": "Ste Marguerite-Marie Alacoque, Vierge",
        "Oct18": "St Luc, Evangéliste",
        "Oct19": "St Pierre d’Alcantara, Confesseur",
        "Oct20": "St Jean de Kenty, Confesseur",
        "Oct21": "St Hilarion, Abbé",
        "Oct23": "St Anthony Mary Claret",
        "Oct24": "St Raphaël, Archange",
        "Oct25": "Sts Chrysanthe et Darie, Martyrs",
        "Oct25a": "Sts Chrysanthe et Darie, Martyrs",
        "Oct26": "St Evariste, Pape et Martyr",
        "Oct27": "Vigile des Sts Simon et Jude, Apôtres",
        "Oct28": "Sts Simon et Jude, Apôtres",
        "Oct31": "Vigile de la fête de tous les Saints",
        "Nov1": "Tous les Saints",
        "Nov4": "St Charles Evêque et Confesseur",
        "Nov5": "The Feast of the Holy Relics",
        "Nov8": "Dans l'octave de la Toussaint",
        "Nov9": "The Dedication of the Lateran Basilica",
        "Nov10": "St. André Avellin Confesseur",
        "Nov11": "St Martin, Evêque et Confesseur",
        "Nov12": "S. Martini Papæ et Martyris",
        "Nov13": "S. Didace Confesseur",
        "Nov13a": "S. Didace Confesseur",
        "Nov14": "St. Josaphat Evêque et Martyrs",
        "Nov15": "St. Albert le Grand, Evêque Confesseur et Docteur de l'Eglise",
        "Nov16": "Ste Gertrude Vierge",
        "Nov17": "St. Grégoire Thaumaturge Evêque et Confesseur",
        "Nov18": "The Dedication of the Basilicas of Ss Peter and Paul",
        "Nov19": "Ste. Elisabeth Veuve",
        "Nov20": "St. Félix de Valois Confesseur",
        "Nov21": "The Presentation of BVM",
        "Nov22": "Ste Cécile Vierge et Martyre",
        "Nov23": "St Clément Ier Pape et Martyr",
        "Nov24": "St. Jean de la Croix Confesseur et Docteur de l'Eglise",
        "Nov25": "Ste Catherine Vierge et Martyre",
        "Nov26": "St Silvestre Abbé",
        "Nov27": "Our Lady of the Miraculous Medal",
        "Nov29": "Vigile de St André Apôtre",
        "Nov29a": "Vigile de St André Apôtre",
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
        "Jul11a": "S. Pii I Papæ et Martyris",
        "Jul12": "S. Joannis Gualberti Abbatis",
        "Jul13": "S. Anacleti Papæ et Martyris",
        "Jul14": "S. Bonaventuræ Episcopi Confessoris et Ecclesiæ Doctoris",
        "Jul15": "S. Henrici Imperatoris Confessoris",
        "Jul16": "Our Lady of Mount Carmel",
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
        "Oct25a": "Ss. Chrysanthi et Dariæ Martyrum",
        "Oct26": "S. Evaristi Papæ et Martyris",
        "Oct27": "In Vigilia Ss. Simonis et Judæ Ap.",
        "Oct28": "Ss. Simonis et Judæ Apostolorum",
        "Oct31": "In Vigilia Omnium Sanctorum",
        "Nov1": "Omnium Sanctorum",
        "Nov4": "S. Caroli Episcopi et Confessoris",
        "Nov5": "The Feast of the Holy Relics",
        "Nov8": "In Octava Omnium Sanctorum",
        "Nov9": "The Dedication of the Lateran Basilica",
        "Nov10": "S. Andreæ Avellini Confessoris",
        "Nov11": "S. Martini Episcopi et Confessoris",
        "Nov12": "S. Martini Papæ et Martyris",
        "Nov13": "S. Didaci Confessoris",
        "Nov13a": "S. Didaci Confessoris",
        "Nov14": "S. Josaphat Episcopi et Martyris",
        "Nov15": "S. Alberti Magni Episcopi Confessoris et Ecclesiæ Doctoris",
        "Nov16": "S. Gertrudis Virginis",
        "Nov17": "S. Gregorii Thaumaturgi Episcopi et Confessoris",
        "Nov18": "The Dedication of the Basilicas of Ss Peter and Paul",
        "Nov19": "S. Elisabeth Viduæ",
        "Nov20": "S. Felicis de Valois Confessoris",
        "Nov21": "The Presentation of BVM",
        "Nov22": "S. Cæciliæ Virginis et Martyris",
        "Nov23": "S. Clementis Papæ et Martyris",
        "Nov24": "S. Joannis a Cruce Confessoris et Ecclesiæ Doctoris",
        "Nov25": "S. Catharinæ Virginis et Martyris",
        "Nov26": "S. Silvestri Abbatis",
        "Nov27": "Our Lady of the Miraculous Medal",
        "Nov29": "In Vigilia S. Andreæ Apostoli",
        "Nov29a": "In Vigilia S. Andreæ Apostoli",
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
        "Oct25a": "Sts. Chrysanthus and Daria, Martyrs",
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
        "Nov13a": "St. Didacus, Confessor",
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
        "Nov29a": "Vigil of St. Andrew the Apostle",
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
        doState.date = mDate;
        doState.officiumKey = null;
        doState.userChangedHddMode = false;
        localStorage.removeItem('do_officiumKey');
        doState.calView = { year: mDate.year(), month: mDate.month() };
        closeHeaderDropdown();
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
                                doState.bible.book = bk.id;
                                doState.bible.chapter = chNum;
                                doState.bible.page = 1;
                                localStorage.setItem('do_bible_book', bk.id);
                                localStorage.setItem('do_bible_chapter', chNum);
                                localStorage.setItem('do_bible_page', 1);
                                closeHeaderDropdown();
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
                        if (itemDate && itemDate.isValid()) {
                            doState.date = itemDate;
                            doState.officiumKey = null;
                            doState.userChangedHddMode = false;
                            localStorage.removeItem('do_officiumKey');
                        }
                        closeHeaderDropdown();
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

function openHeaderDropdown() {
    if (!doState.userChangedHddMode) {
        doState.hddMode = getDefaultHddModeForDate(doState.date);
    }
    renderHeaderDropdown();
    $('#headerDropdown').removeClass('hidden');
    $('.dropdown-icon').css('transform', 'rotate(180deg)');
    setTimeout(function() {
        var $list = $('#hddItemsList');
        var $sel = $('#hddItemsList .hdd-item-card.selected, #hddItemsList .hdd-bible-ch-btn.active');
        if ($sel.length && $sel[0] && $list.length && $list[0]) {
            $list[0].scrollTop = $sel[0].offsetTop - 120;
        }
    }, 50);
}

function closeHeaderDropdown() {
    $('#headerDropdown').addClass('hidden');
    $('.dropdown-icon').css('transform', 'rotate(0deg)');
}

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
    // Check pending native icon alias from previous 'Apply later' selection
    var pendingAlias = localStorage.getItem('do_pending_icon_alias');
    if (pendingAlias) {
        applyNativeAndroidAppIcon(pendingAlias, false);
        localStorage.removeItem('do_pending_icon_alias');
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

    if (isAndroidNativeApp()) {
        pendingIconConfig = { color: color, isSync: isSync, alias: alias };
        $('#appIconModalBackdrop, #appIconModal').removeClass('hidden');
    } else {
        applyIconColor(color, isSync);
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

// ── Haptic Feedback Engine ──
function triggerHapticFeedback(duration) {
    if (localStorage.getItem('do_haptics') === 'false') return;
    var dur = duration || 25;
    try {
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics) {
            window.Capacitor.Plugins.Haptics.impact({ style: 'MEDIUM' }).catch(function() {
                try { window.Capacitor.Plugins.Haptics.vibrate({ duration: dur }); } catch (e) {}
            });
        }
    } catch (e) {}
    try {
        if (navigator && navigator.vibrate) {
            navigator.vibrate(dur);
        }
    } catch (e) {}
}

// ── GitHub Releases Update Engine ──
var CURRENT_APP_VERSION = 'beta-0.0.25';

function parseVersionString(str) {
    if (!str) return [0, 0, 0];
    var clean = str.replace(/^v/i, '').replace(/^beta-/i, '');
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

function checkForAppUpdates(isManual) {
    // Ne jamais exécuter ni afficher de pop-up de mise à jour sur le site Web
    if (!isNativeAndroidApp()) {
        if (isManual) {
            var $statusText = $('#updateStatusText');
            $statusText.text('Version Web en ligne (Toujours à jour)').css('color', 'var(--text-tertiary)');
        }
        return;
    }

    var includeBeta = (localStorage.getItem('do_include_beta') !== 'false');
    var $statusText = $('#updateStatusText');
    if (isManual) {
        $statusText.text('Recherche en cours sur GitHub...').css('color', 'var(--text-secondary)');
    }

    var apiUrl = 'https://api.github.com/repos/bastonus/jgabc/releases?_ts=' + Date.now();
    fetch(apiUrl, {
        headers: { 'Accept': 'application/vnd.github.v3+json' },
        cache: 'no-cache'
    })
        .then(function(res) {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return res.json();
        })
        .then(function(releases) {
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
                if (isManual) {
                    $statusText.text('Mise à jour disponible : ' + latestTag).css('color', 'var(--primary-color)');
                }
                showUpdateModal(targetRelease);
            } else {
                if (isManual) {
                    $statusText.text('Vous utilisez la dernière version (' + CURRENT_APP_VERSION + ')').css('color', 'var(--text-tertiary)');
                }
            }
        })
        .catch(function(err) {
            console.warn('Update check failed:', err);
            if (isManual) {
                $statusText.text('Impossible de vérifier les mises à jour (hors-ligne)').css('color', '#c96b63');
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
    
    // Find APK asset
    var apkAsset = null;
    if (release.assets && release.assets.length) {
        apkAsset = release.assets.filter(function(a) {
            return a.name && a.name.toLowerCase().endsWith('.apk');
        })[0] || release.assets[0];
    }
    var downloadUrl = (apkAsset && apkAsset.browser_download_url) ? apkAsset.browser_download_url : (release.html_url || 'https://github.com/bastonus/jgabc/releases');

    $('#updateVersionTag').text(tagName + (isBeta ? ' (Bêta)' : ''));
    $('#updateNotesContent').html(parseMarkdownToHtml(bodyNotes));

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
    $banner.addClass('is-visible');
}

function hideUpdateBanner() {
    var $banner = $('#appUpdateBanner');
    $banner.removeClass('is-visible');
    $('#updateNotesCollapsible').removeClass('is-open');
    $('#btnToggleUpdateNotes').removeClass('is-active');
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

    $('#btnOpenFeedbackExternal').off('click').on('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        window.open(tallyDirectUrl, '_system');
    });

    $('#feedbackModalBackdrop, #feedbackModal').removeClass('hidden');
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

// ---- Event Listeners ----
function setupEventListeners() {
    // Feedback Modal Triggers
    $(document).on('click', '#btnFeedbackSidebar, #btnFeedbackSettings', function(e) {
        e.preventDefault();
        e.stopPropagation();
        closeModals();
        openFeedbackModal();
    });

    $(document).on('click', '#btnCloseFeedbackModal, #feedbackModalBackdrop', function(e) {
        e.preventDefault();
        e.stopPropagation();
        closeFeedbackModal();
    });

    $(document).on('click', '.do-brand, #btnBrandHome', function(e) {
        e.preventDefault();
        doState.hora = 'home';
        doState.officiumKey = null;
        doState.testFeastKey = null;
        localStorage.removeItem('do_officiumKey');
        localStorage.setItem('do_hora', 'home');
        closeModals();
        renderDO();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    $(document).on('click', '.do-nav-item', function(e) {
        e.preventDefault();
        var hora = $(this).data('hora');
        if (hora === 'bible') {
            openBible();
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
        renderDO();
    });

    $(document).on('click', '.bottom-nav .nav-item', function(e) {
        e.preventDefault();
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
        renderDO();
    });

    $(document).on('click', '.do-hora-sub', function(e) {
        e.preventDefault();
        var hora = $(this).data('hora');
        $('#doHoraePicker').addClass('hidden');
        doState.hora = hora;
        localStorage.setItem('do_hora', hora);
        if (hora !== 'missa_gregorian') {
            doState.officiumKey = null;
            doState.testFeastKey = null;
            localStorage.removeItem('do_officiumKey');
        }
        renderDO();
    });

    // Open Bible directly in main view from Psalm card button
    $(document).on('click', '.do-bible-btn', function(e) {
        e.stopPropagation();
        var bk = $(this).data('book') || 'Psalmi';
        var ch = $(this).data('chapter') || 1;
        openBible(bk, ch, 1);
    });

    // Bible Main View Controls: Change Book
    $(document).on('change', '#doBibleMainBookSelect', function() {
        var bk = $(this).val();
        doState.bible.book = bk;
        doState.bible.chapter = 1;
        doState.bible.page = 1;
        localStorage.setItem('do_bible_book', bk);
        localStorage.setItem('do_bible_chapter', 1);
        localStorage.setItem('do_bible_page', 1);
        renderBibleMainView();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // Bible Main View Controls: Change Chapter
    $(document).on('change', '#doBibleMainChapterSelect', function() {
        var ch = parseInt($(this).val(), 10);
        doState.bible.chapter = ch;
        doState.bible.page = 1;
        localStorage.setItem('do_bible_chapter', ch);
        localStorage.setItem('do_bible_page', 1);
        renderBibleMainView();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // Bible Main View Controls: Change Page
    $(document).on('change', '#doBibleMainPageSelect', function() {
        var pg = parseInt($(this).val(), 10) || 1;
        doState.bible.page = pg;
        localStorage.setItem('do_bible_page', pg);
        renderBibleMainView();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // Bible Main View Controls: Change Page Size (Verses per page)
    $(document).on('change', '#doBibleMainVppSelect', function() {
        var val = $(this).val();
        doState.bible.pageSize = (val === 'all') ? 'all' : parseInt(val, 10);
        doState.bible.page = 1;
        localStorage.setItem('do_bible_pageSize', val);
        localStorage.setItem('do_bible_page', 1);
        renderBibleMainView();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // Bible Previous Chapter Navigation
    $(document).on('click', '#btnBiblePrev, .btnBiblePrev', function() {
        var bkObj = DO_BIBLE_BOOKS.find(function(b) { return b.id === doState.bible.book; }) || DO_BIBLE_BOOKS[0];
        if (doState.bible.chapter > 1) {
            doState.bible.chapter--;
            doState.bible.page = 1;
            renderBibleMainView();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            var curIdx = DO_BIBLE_BOOKS.indexOf(bkObj);
            if (curIdx > 0) {
                var prevBk = DO_BIBLE_BOOKS[curIdx - 1];
                doState.bible.book = prevBk.id;
                doState.bible.chapter = prevBk.chapters;
                doState.bible.page = 1;
                renderBibleMainView();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }
    });

    // Bible Next Chapter Navigation
    $(document).on('click', '#btnBibleNext, .btnBibleNext', function() {
        var bkObj = DO_BIBLE_BOOKS.find(function(b) { return b.id === doState.bible.book; }) || DO_BIBLE_BOOKS[0];
        if (doState.bible.chapter < bkObj.chapters) {
            doState.bible.chapter++;
            doState.bible.page = 1;
            renderBibleMainView();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            var curIdx = DO_BIBLE_BOOKS.indexOf(bkObj);
            if (curIdx < DO_BIBLE_BOOKS.length - 1) {
                var nextBk = DO_BIBLE_BOOKS[curIdx + 1];
                doState.bible.book = nextBk.id;
                doState.bible.chapter = 1;
                doState.bible.page = 1;
                renderBibleMainView();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }
    });

    $('#btnPrevDay, #btnHddPrevDay').on('click', function(e) {
        if (e) e.stopPropagation();
        doState.date.subtract(1, 'day');
        doState.officiumKey = null;
        doState.userChangedHddMode = false;
        localStorage.removeItem('do_officiumKey');
        $('#doDateInput').val(doState.date.format('YYYY-MM-DD'));
        renderDO();
        if (!$('#headerDropdown').hasClass('hidden')) {
            renderHeaderDropdown();
        }
    });

    $('#btnNextDay, #btnHddNextDay').on('click', function(e) {
        if (e) e.stopPropagation();
        doState.date.add(1, 'day');
        doState.officiumKey = null;
        doState.userChangedHddMode = false;
        localStorage.removeItem('do_officiumKey');
        $('#doDateInput').val(doState.date.format('YYYY-MM-DD'));
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
        doState.date = moment();
        doState.officiumKey = null;
        doState.userChangedHddMode = false;
        localStorage.removeItem('do_officiumKey');
        if (doState.calView) {
            doState.calView = { year: doState.date.year(), month: doState.date.month() };
        }
        closeHeaderDropdown();
        renderDO();
    });

    // Toggle In-App Calendar in Dropdown
    $(document).on('click', '#btnHddCalendarToggle', function(e) {
        e.stopPropagation();
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
        closeModals();
    });

    $('#btnSettings, #btnSettingsSidebar').on('click', function() {
        $('#settingsPanel').addClass('open active');
        $('#settingsBackdrop').addClass('open active');
    });

    $('#btnCloseSettings, #settingsBackdrop').on('click', function() {
        closeModals();
    });

    // Ordinarium Missæ Toggle
    $('#toggleOrdinarium').on('change', function() {
        var isChecked = $(this).is(':checked');
        doState.includeOrdinarium = isChecked;
        localStorage.setItem('do_ordinarium', isChecked);
        renderDO();
    });

    // Gregorian Chant Toggle in Settings
    $('#toggleGregorian').on('change', function() {
        var isChecked = $(this).is(':checked');
        doState.includeGregorian = isChecked;
        localStorage.setItem('do_include_gregorian', isChecked);
        if (!isChecked && doState.hora === 'missa_gregorian') {
            doState.hora = 'missa';
            localStorage.setItem('do_hora', 'missa');
        }
        renderDO();
    });

    // Note Keyboard buttons in Settings (Instant pitch playback)
    $(document).on('click', '#doNoteKeyboard .do-note-key-btn', function(e) {
        e.preventDefault();
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
        var $bar = $('#modernPlayerBar');
        var isNowVis = !$bar.hasClass('visible');
        $bar.toggleClass('visible', isNowVis);
        $('body').toggleClass('player-dock-open', isNowVis);
        $(this).find('span').text(isNowVis ? 'Masquer le lecteur' : 'Afficher le lecteur');
    });

    // Open Test Page Button in Settings
    $(document).on('click', '#btnOpenTestMissa, #btnOpenTestMissaDirect', function(e) {
        e.preventDefault();
        doState.hora = 'missa_gregorian';
        localStorage.setItem('do_hora', 'missa_gregorian');
        closeModals();
        renderDO();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // Demo Update Banner Trigger (from Settings or Test Page)
    $(document).on('click', '#btnDemoUpdateBanner, #btnDemoUpdateBannerTestPage', function(e) {
        e.preventDefault();
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
        doState.includeGregorian = !doState.includeGregorian;
        localStorage.setItem('do_include_gregorian', doState.includeGregorian);
        var isNowOn = doState.includeGregorian;
        $(this).toggleClass('active', isNowOn);
        $(this).find('span').text('Partitions Grégoriennes : ' + (isNowOn ? 'ACTIVÉES' : 'DÉSACTIVÉES'));
        $('#toggleGregorian').prop('checked', isNowOn);
        renderAllChantScoresInDOM($('#do-content-stream'));
    });

    $(document).on('change', '#doKyrialeSelect', function() {
        doState.selectedKyriale = $(this).val();
        localStorage.setItem('do_selected_kyriale', doState.selectedKyriale);
        renderDO();
    });

    $(document).on('change', '#doTestProperSelect', function() {
        var val = $(this).val();
        doState.testFeastKey = val || null;
        renderDO();
    });

    // 0. Rubricæ & Editio Select
    $('#doEditionSelect').on('change', function() {
        var val = $(this).val();
        doState.edition = val;
        localStorage.setItem('do_edition', val);
        DO_LOCAL_CACHE = {}; // Vider le cache mémoire pour recharger immédiatement la nouvelle édition
        renderDO();
    });

    // 3. Textus Latinus Toggle
    $('#toggleLatin').on('change', function() {
        var isChecked = $(this).is(':checked');
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
        $('#doThemeOptions .settings-option-card, #doThemeOptions .settings-option').removeClass('active');
        $(this).addClass('active');
        doState.settings.theme = $(this).data('value');
        localStorage.setItem('do_theme', doState.settings.theme);
        initTheme();
    });

    $('#toggleLiturgicalColor').on('change', function() {
        var isChecked = $(this).is(':checked');
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
        var chosenColor = $(this).data('icon-color');
        $('#doIconColorOptions .color-swatch-circle').removeClass('active');
        $(this).addClass('active');
        $('#toggleSyncIconColor').prop('checked', false);
        $('#doIconColorOptions').css('opacity', '1').css('pointer-events', 'auto');
        requestIconColorChange(chosenColor, false);
    });

    // App Icon Modal Listeners (Android restart / delay)
    $(document).on('click', '#btnRestartAppIcon', function(e) {
        e.preventDefault();
        if (pendingIconConfig) {
            applyIconColor(pendingIconConfig.color, pendingIconConfig.isSync);
            applyNativeAndroidAppIcon(pendingIconConfig.alias, true);
            closeAppIconModal();
            triggerHapticFeedback(30);
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
        if (isChecked) triggerHapticFeedback(20);
    });

    $('#toggleAutoUpdate').on('change', function() {
        localStorage.setItem('do_auto_update', $(this).is(':checked') ? 'true' : 'false');
    });

    $('#toggleIncludeBeta').on('change', function() {
        localStorage.setItem('do_include_beta', $(this).is(':checked') ? 'true' : 'false');
    });

    $('#btnCheckUpdatesManual').on('click', function(e) {
        e.preventDefault();
        checkForAppUpdates(true);
    });

    $(document).on('click', '#btnToggleUpdateNotes', function(e) {
        e.preventDefault();
        var $notes = $('#updateNotesCollapsible');
        var isOpen = $notes.hasClass('is-open');
        $notes.toggleClass('is-open', !isOpen);
        $(this).toggleClass('is-active', !isOpen);
    });

    $(document).on('click', '#btnCloseUpdateBanner, #btnCloseUpdateModal, #btnDismissUpdate', function(e) {
        e.preventDefault();
        hideUpdateBanner();
    });

    $(document).on('click', '#btnDownloadAppWebSidebar, #btnDownloadAppSettings', function(e) {
        e.preventDefault();
        window.open('https://github.com/bastonus/jgabc/releases', '_blank');
    });

    if (isNativeAndroidApp()) {
        $('.web-only-btn, #btnDownloadAppWebSidebar, #btnDownloadAppSettings').hide();
        if (localStorage.getItem('do_auto_update') !== 'false') {
            setTimeout(function() {
                checkForAppUpdates(false);
            }, 2500);
        }
    } else {
        // Web platform: show download app button, hide native updater controls
        $('.web-only-btn, #btnDownloadAppWebSidebar, #btnDownloadAppSettings').show();
        $('#toggleAutoUpdate').closest('.settings-toggle-row').hide();
        $('#toggleIncludeBeta').closest('.settings-toggle-row').hide();
        $('.update-check-wrapper').hide();
        $('#labelUpdatesText').text('Application & Retours');
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
            var isBilingual = (doState.showLatin && doState.vernacularLang && doState.vernacularLang !== 'none');
            if (isBilingual) {
                var $wrapper = $('.do-bilingual-wrapper').first();
                var cardW = $wrapper.length ? $wrapper.width() : $(window).width();
                shiftDistance = cardW + 24;
                initialOffsetPx = (doState.mobileLang === 'vern') ? -shiftDistance : 0;
                touchMode = 'candidate_bilingual';
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
                triggerHapticFeedback(20);
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
                triggerHapticFeedback(20);
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
                    if (prevLang !== 'vern') triggerHapticFeedback();
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
                    if (prevLang !== 'la') triggerHapticFeedback();
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
    $('#doDateInput').val(doState.date.format('YYYY-MM-DD'));
    initTheme();
    setupEventListeners();
    renderDO();
});
