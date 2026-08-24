/* =============================================================
   Divinum Officium & Missale Romanum — 100% Offline Engine
   Clean Monochrome Base + OLED + Dynamic Accent Tinting
   2 Distinct Settings: Latin Text (On/Off) + Vernacular Translation (None/Fr/En/Es/It/De/Pt)
   Row-by-Row Perfect Bilingual Alignment & Paginated Sacra Biblia Reader
   Recursive Section (@:Tag & @File:Tag) & Variable ($Var) Resolution
   ============================================================= */

// ---- Global State ----
var doState = window.doState = {
    hora: localStorage.getItem('do_hora') || 'missa',
    date: moment(),
    showLatin: (localStorage.getItem('do_show_latin') !== 'false'),
    vernacularLang: localStorage.getItem('do_vernacular_lang') || (localStorage.getItem('do_lang') === 'la' ? 'none' : (localStorage.getItem('do_lang') || 'fr')),
    edition: localStorage.getItem('do_edition') || '1960',
    rite: localStorage.getItem('do_rite') || 'traditional',
    officiumKey: localStorage.getItem('do_officiumKey') || null,
    includeOrdinarium: localStorage.getItem('do_ordinarium') === 'true',
    tempo: parseInt(localStorage.getItem('do_tempo'), 10) || 150,
    mobileLang: 'la',
    settings: {
        theme: localStorage.getItem('do_theme') || 'dark',
        color: localStorage.getItem('do_color') || '#c96b63'
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
        missa:        'Sainte Messe',
        matutinum:    'Matines',
        laudes:       'Laudes',
        prima:        'Prime',
        tertia:       'Tierce',
        sexta:        'Sexte',
        nona:         'None',
        vesperae:     'Vêpres',
        completorium: 'Complies',
        bible:        'Sainte Bible'
    },
    la: {
        missa:        'Sancta Missa',
        matutinum:    'Ad Matutinum',
        laudes:       'Ad Laudes',
        prima:        'Ad Primam',
        tertia:       'Ad Tertiam',
        sexta:        'Ad Sextam',
        nona:         'Ad Nonam',
        vesperae:     'Ad Vesperas',
        completorium: 'Ad Completorium',
        bible:        'Sacra Biblia'
    },
    en: {
        missa:        'Holy Mass',
        matutinum:    'Matins',
        laudes:       'Lauds',
        prima:        'Prime',
        tertia:       'Terce',
        sexta:        'Sext',
        nona:         'None',
        vesperae:     'Vespers',
        completorium: 'Compline',
        bible:        'Holy Bible'
    },
    es: {
        missa:        'Santa Misa',
        matutinum:    'Maitines',
        laudes:       'Laudes',
        prima:        'Prima',
        tertia:       'Tercia',
        sexta:        'Sexta',
        nona:         'Nona',
        vesperae:     'Vísperas',
        completorium: 'Completas',
        bible:        'Santa Biblia'
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
        edition_label: 'Édition',
        ordinarium_label: 'Ordinaire de la Messe',
        ordinarium_false: 'Propre uniquement',
        ordinarium_true: 'Avec l\'Ordinaire',
        latin_label: 'Texte Latin',
        latin_true: 'Latin actif',
        latin_false: 'Sans Latin',
        vernacular_label: 'Traduction vernaculaire',
        vernacular_none: 'Aucune traduction',
        theme_label: 'Thème d\'affichage',
        theme_light: 'Diurne (Blanc)',
        theme_dark: 'Nocturne (Noir)',
        theme_oled: 'OLED (Noir pur)',
        theme_auto: 'Automatique (Système)',
        color_label: 'Couleur d\'accentuation',
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
        edition_label: 'Editio',
        ordinarium_label: 'Ordinarium Missæ',
        ordinarium_false: 'Tantum Proprium',
        ordinarium_true: 'Cum Ordinario',
        latin_label: 'Textus Latinus',
        latin_true: 'Latina activa',
        latin_false: 'Sine Latina',
        vernacular_label: 'Translatio Vernacula',
        vernacular_none: 'Nulla translatio',
        theme_label: 'Thema',
        theme_light: 'Diurnum (Album)',
        theme_dark: 'Nocturnum (Nigrum)',
        theme_oled: 'OLED (Purum)',
        theme_auto: 'Automaticum',
        color_label: 'Color',
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
        edition_label: 'Edition',
        ordinarium_label: 'Order of Mass',
        ordinarium_false: 'Proper Only',
        ordinarium_true: 'With Ordinary',
        latin_label: 'Latin Text',
        latin_true: 'Latin active',
        latin_false: 'Without Latin',
        vernacular_label: 'Vernacular Translation',
        vernacular_none: 'No translation',
        theme_label: 'Display Theme',
        theme_light: 'Light (White)',
        theme_dark: 'Dark (Black)',
        theme_oled: 'OLED (Pure Black)',
        theme_auto: 'Automatic (System)',
        color_label: 'Accent Color',
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
        edition_label: 'Edición',
        ordinarium_label: 'Ordinario de la Misa',
        ordinarium_false: 'Solo Propio',
        ordinarium_true: 'Con Ordinario',
        latin_label: 'Texto Latino',
        latin_true: 'Latín activo',
        latin_false: 'Sin Latín',
        vernacular_label: 'Traducción vernácula',
        vernacular_none: 'Sin traducción',
        theme_label: 'Tema visual',
        theme_light: 'Diurno (Blanco)',
        theme_dark: 'Nocturno (Negro)',
        theme_oled: 'OLED (Negro puro)',
        theme_auto: 'Automático (Sistema)',
        color_label: 'Color de acento',
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

function updateUiTranslations() {
    var uiLang = getUiLang();
    var t = DO_UI_TRANSLATIONS[uiLang] || DO_UI_TRANSLATIONS['fr'] || DO_UI_TRANSLATIONS['la'];

    $('.do-brand-sub').text(t.app_sub);

    // Sidebar titles
    var $titles = $('.do-sidebar-nav .do-nav-section-title');
    if ($titles.length >= 3) {
        $titles.eq(0).text(t.liturgia_diei);
        $titles.eq(1).text(t.cursus_horarum);
        $titles.eq(2).text(t.sacra_biblia.toUpperCase());
    } else if ($titles.length >= 2) {
        $titles.eq(0).text(t.liturgia_diei);
        $titles.eq(1).text(t.cursus_horarum);
    }

    // Nav items in Sidebar
    $('.do-nav-item[data-hora="home"] .do-nav-label').text(t.home);
    $('.do-nav-item[data-hora="home"] .do-nav-tag').text(t.home_tag);
    $('.do-nav-item[data-hora="missa"] .do-nav-label').text(t.missa);
    $('.do-nav-item[data-hora="missa"] .do-nav-tag').text(t.missa_tag);
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
    
    // Ordinarium Missæ
    $('#labelOrdinariumText').text(t.ordinarium_label);
    $('#doOrdinariumOptions .settings-option-card[data-value="false"], #doOrdinariumOptions .settings-pill-btn[data-value="false"]').text(t.ordinarium_false);
    $('#doOrdinariumOptions .settings-option-card[data-value="true"], #doOrdinariumOptions .settings-pill-btn[data-value="true"]').text(t.ordinarium_true);

    // 2 Distinct Language settings
    $('#labelLatinText').text(t.latin_label);
    $('#doLatinOptions .settings-option-card[data-value="true"], #doLatinOptions .settings-pill-btn[data-value="true"], #doLatinOptions .segment[data-value="true"]').text(t.latin_true);
    $('#doLatinOptions .settings-option-card[data-value="false"], #doLatinOptions .settings-pill-btn[data-value="false"], #doLatinOptions .segment[data-value="false"]').text(t.latin_false);
    $('#labelVernacularText').text(t.vernacular_label);
    $('#doVernacularOptions .settings-option-card[data-value="none"], #doVernacularOptions .settings-option[data-value="none"]').text(t.vernacular_none);

    // Theme in Settings
    $('#labelThemeText').text(t.theme_label);
    $('#doThemeOptions .settings-option-card[data-value="light"], #doThemeOptions .settings-option[data-value="light"]').text(t.theme_light);
    $('#doThemeOptions .settings-option-card[data-value="dark"], #doThemeOptions .settings-option[data-value="dark"]').text(t.theme_dark);
    $('#doThemeOptions .settings-option-card[data-value="oled"], #doThemeOptions .settings-option[data-value="oled"]').text(t.theme_oled);
    $('#doThemeOptions .settings-option-card[data-value="auto"], #doThemeOptions .settings-option[data-value="auto"]').text(t.theme_auto);
    $('#labelColorText').text(t.color_label);

    // Date picker popup
    $('#datePickerPopup .do-date-label').text(t.date_label);
    $('#btnDateToday').text(t.btn_today);
}

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
        var wk = Math.floor(d.diff(easter, 'days') / 7) + 1;
        tempora = 'Pasc' + wk + '-' + dow;
    } else {
        var wk = Math.floor(d.diff(pentecost, 'days') / 7) + 1;
        tempora = 'Pent' + wk + '-' + dow;
    }

    return {
        sancti: mmdd,
        tempora: tempora,
        isSunday: dow === 0
    };
}

// ---- File Fetcher (100% Local Relative Path) ----
function fetchLocalFile(path, callback) {
    if (DO_LOCAL_CACHE[path] !== undefined) {
        callback(null, DO_LOCAL_CACHE[path]);
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

    // External file reference e.g. @Commune/C4a or @Sancti/02-24 or @Commune/C1:Introitus
    if (firstLine.indexOf('@') === 0) {
        var ref = firstLine.substring(1).trim();
        var parts = ref.split(':');
        var filePath = parts[0].trim();
        var targetSec = parts[1] ? parts[1].trim() : sectionName;

        if (!/\.txt$/i.test(filePath)) filePath += '.txt';

        var primaryCorpus = isMissa ? 'missa' : 'horas';
        var altCorpus = isMissa ? 'horas' : 'missa';

        var candidatePaths = [];
        candidatePaths.push('do_data/' + primaryCorpus + '/' + langFolder + '/' + filePath);
        candidatePaths.push('do_data/' + altCorpus + '/' + langFolder + '/' + filePath);
        if (langFolder !== 'Latin') {
            candidatePaths.push('do_data/' + primaryCorpus + '/Latin/' + filePath);
            candidatePaths.push('do_data/' + altCorpus + '/Latin/' + filePath);
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
                        resolveSectionText(match.key, match.lines, extSections, langFolder, isMissa, callback, depth + 1);
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
        var mC = mRule[1].match(/(?:vide|ex)\s+(?:Commune\/)?(C\d+[a-z]?|Sancti\/[^\s;]+)/i);
        if (mC) return mC[1];
    }
    var mRank = text.match(/\[Rank\][^\n]*\n([^\[\n]+)/i);
    if (mRank) {
        var mC2 = mRank[1].match(/(?:vide|ex)\s+(?:Commune\/)?(C\d+[a-z]?|Sancti\/[^\s;]+)/i);
        if (mC2) return mC2[1];
    }
    var mGen = text.match(/(?:vide|ex)\s+(?:Commune\/)?(C\d+[a-z]?|Sancti\/[^\s;]+)/i);
    if (mGen) return mGen[1];
    return null;
}

function loadCommunePropersForMissa(daySections, laFileText, langFolder, callback) {
    var rawDayText = Object.keys(daySections).map(function(k) { return '[' + k + ']\n' + daySections[k].join('\n'); }).join('\n\n');
    var comRef = extractCommuneRef(rawDayText) || extractCommuneRef(laFileText);

    if (!comRef) {
        callback(daySections);
        return;
    }

    var cleanRef = comRef.replace(/^Commune\//i, '');
    if (!/\.txt$/i.test(cleanRef)) cleanRef += '.txt';

    var candidatePaths = [];
    if (/^Sancti\//i.test(cleanRef)) {
        candidatePaths.push('do_data/missa/' + langFolder + '/' + cleanRef);
        candidatePaths.push('do_data/horas/' + langFolder + '/' + cleanRef);
        candidatePaths.push('do_data/missa/Latin/' + cleanRef);
        candidatePaths.push('do_data/horas/Latin/' + cleanRef);
    } else {
        candidatePaths.push('do_data/horas/' + langFolder + '/Commune/' + cleanRef);
        candidatePaths.push('do_data/missa/' + langFolder + '/Commune/' + cleanRef);
        candidatePaths.push('do_data/horas/Latin/Commune/' + cleanRef);
        candidatePaths.push('do_data/missa/Latin/Commune/' + cleanRef);
    }

    var tryIdx = 0;
    function tryNextCom() {
        if (tryIdx >= candidatePaths.length) {
            callback(daySections);
            return;
        }
        var p = candidatePaths[tryIdx++];
        fetchLocalFile(p, function(err, data) {
            if (!err && data) {
                var comSec = parseSections(data);
                var merged = {};
                Object.keys(comSec).forEach(function(k) { merged[k] = comSec[k]; });
                Object.keys(daySections).forEach(function(k) {
                    if (daySections[k] && daySections[k].length) {
                        merged[k] = daySections[k];
                    }
                });
                callback(merged);
                return;
            }
            tryNextCom();
        });
    }

    tryNextCom();
}

function loadMissaData(date, lang, callback) {
    var codes = computeLiturgicalCodes(date);
    var langFolder = getLangFolder(lang);
    var feastKey = doState.officiumKey || null;

    var sanctiCode = feastKey || codes.sancti;
    var temporaCode = feastKey || codes.tempora;

    var sanctiPath = 'do_data/missa/' + langFolder + '/Sancti/' + sanctiCode + '.txt';
    var temporaPath = 'do_data/missa/' + langFolder + '/Tempora/' + temporaCode + '.txt';
    var laSanctiPath = 'do_data/missa/Latin/Sancti/' + sanctiCode + '.txt';
    var laTemporaPath = 'do_data/missa/Latin/Tempora/' + temporaCode + '.txt';

    // Helper to load vern + latin counterpart
    function loadFilePair(vPath, lPath, onLoaded) {
        fetchLocalFile(vPath, function(errV, vData) {
            if (!errV && vData) {
                fetchLocalFile(lPath, function(errL, lData) {
                    onLoaded(vData, (!errL && lData) ? lData : vData);
                });
            } else {
                fetchLocalFile(lPath, function(errL, lData) {
                    if (!errL && lData) {
                        onLoaded(lData, lData);
                    } else {
                        onLoaded(null, null);
                    }
                });
            }
        });
    }

    // If user explicitly selected an office/feast key, honor it directly
    if (feastKey) {
        loadFilePair(sanctiPath, laSanctiPath, function(sData, laSData) {
            if (sData) {
                processMissaFile(sData, laSData, langFolder, lang, callback);
            } else {
                loadFilePair(temporaPath, laTemporaPath, function(tData, laTData) {
                    if (tData) {
                        processMissaFile(tData, laTData, langFolder, lang, callback);
                    } else if (langFolder !== 'Latin') {
                        loadMissaData(date, 'la', callback);
                    } else {
                        callback(null, null);
                    }
                });
            }
        });
        return;
    }

    // Automatic Sunday resolution:
    // On Sunday, default to Temporale unless Sancti is a greater feast (I. classis or Festum Domini).
    if (codes.isSunday) {
        fetchLocalFile(laSanctiPath, function(errS, laSanctiData) {
            var isGreater = (!errS && laSanctiData) ? isSanctiGreaterFeastOnSunday(laSanctiData) : false;
            if (isGreater) {
                loadFilePair(sanctiPath, laSanctiPath, function(sData, laSData) {
                    if (sData) {
                        processMissaFile(sData, laSData, langFolder, lang, callback);
                    } else {
                        loadFilePair(temporaPath, laTemporaPath, function(tData, laTData) {
                            if (tData) processMissaFile(tData, laTData, langFolder, lang, callback);
                            else callback(null, null);
                        });
                    }
                });
            } else {
                loadFilePair(temporaPath, laTemporaPath, function(tData, laTData) {
                    if (tData) {
                        processMissaFile(tData, laTData, langFolder, lang, callback);
                    } else {
                        loadFilePair(sanctiPath, laSanctiPath, function(sData, laSData) {
                            if (sData) processMissaFile(sData, laSData, langFolder, lang, callback);
                            else callback(null, null);
                        });
                    }
                });
            }
        });
    } else {
        // Weekday (Feria): Sancti first, fallback to Temporale
        loadFilePair(sanctiPath, laSanctiPath, function(sData, laSData) {
            if (sData) {
                processMissaFile(sData, laSData, langFolder, lang, callback);
            } else {
                loadFilePair(temporaPath, laTemporaPath, function(tData, laTData) {
                    if (tData) {
                        processMissaFile(tData, laTData, langFolder, lang, callback);
                    } else if (langFolder !== 'Latin') {
                        loadMissaData(date, 'la', callback);
                    } else {
                        callback(null, null);
                    }
                });
            }
        });
    }
}

function processMissaFile(fileText, laFileText, langFolder, langKey, callback) {
    if (typeof laFileText === 'function') {
        callback = laFileText;
        laFileText = fileText;
    }
    var rawSections = parseSections(fileText);
    var feastTitle = (rawSections['Officium'] && rawSections['Officium'][0]) ? rawSections['Officium'][0].trim() : 'Missa Diei';

    loadCommunePropersForMissa(rawSections, laFileText, langFolder, function(fullSections) {
        if (rawSections['Officium']) fullSections['Officium'] = rawSections['Officium'];
        var finalTitle = (fullSections['Officium'] && fullSections['Officium'][0]) ? fullSections['Officium'][0].trim() : feastTitle;

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
                callback(null, { title: finalTitle, cards: orderedCards });
            }
            return;
        }

        var ordoPath = 'do_data/missa/' + langFolder + '/Ordo/Ordo.txt';
        fetchLocalFile(ordoPath, function(oErr, oData) {
            var ordoParts = (!oErr && oData) ? parseOrdoFile(oData) : {};
            assembleFullMissa(fullSections, ordoParts, langFolder, finalTitle, callback);
        });
    });
}

function assembleFullMissa(propSec, ordoParts, langFolder, feastTitle, callback) {
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

        callback(null, { title: feastTitle, cards: cards });
    }
}

function loadHoursData(date, hora, langKey, callback) {
    var codes = computeLiturgicalCodes(date);
    var langFolder = getLangFolder(langKey);
    var feastKey = doState.officiumKey || null;

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

    var feastKey = doState.officiumKey || null;
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

        callback(null, { title: feastTitle, cards: cards });
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

        callback(null, { title: feastTitle, cards: cards });
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
                    callback(null, { title: feastTitle, cards: cards });
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
                    callback(null, { title: feastTitle, cards: cards });
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

    callback(null, { title: feastTitle, cards: cards });
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
    return out;
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

function formatSingleParagraph(l) {
    if (!l) return '';
    l = l.trim();

    // Skip lone dashes, hyphens, underscores or horizontal rule markers
    if (/^[-–—_~*]+$/.test(l)) return '';

    if (/^!/i.test(l)) {
        var rText = l.replace(/^!+/, '').trim();
        if (/^(Ps\.|[0-9]?\s?[A-Z][a-z]+ [0-9]+:)/i.test(rText) && rText.length < 35) {
            return '<span class="do-source-ref">' + escHtml(rText) + '</span>';
        }
        return '<div class="do-rubric-inline">' + formatLiturgicalSymbols(escHtml(rText)) + '</div>';
    }

    // Speakers: S (Sacerdos), P (Populus), M (Minister), C (Cantor/Celebrans), O (Omnes/Orans), V (Versiculus), R (Responsorium), D (Diaconus)
    if (/^[SMPCOvrVRD]\.[\s\u00a0]*/i.test(l)) {
        var sym = l.substring(0, 1).toUpperCase();
        var symDisp = (sym === 'V') ? '℣.' : (sym === 'R') ? '℟.' : (sym + '.');
        var rest = l.replace(/^[SMPCOvrVRD]\.[\s\u00a0]*/i, '').trim();
        var text = formatLiturgicalSymbols(escHtml(rest));
        return '<p class="do-dialog-line"><span class="do-resp-sym ' + sym + '">' + symDisp + '</span> ' + text + '</p>';
    }

    return '<p>' + formatLiturgicalSymbols(escHtml(l)) + '</p>';
}

// Psalm verse without numbers (Continuous chanting flow)
function formatSinglePsalmVerse(line, isDox) {
    if (!line) return '<div class="do-psalm-verse"></div>';
    line = line.trim();

    if (/^[-–—_~*]+$/.test(line)) return '';

    if (/^\{[^\}]+\}$/.test(line)) {
        return '<div class="do-rubric-inline">' + escHtml(line.substring(1, line.length - 1)) + '</div>';
    }

    if (/^Ant\./i.test(line)) {
        var antContent = line.replace(/^Ant\.\s*/i, '');
        return '<div class="do-antiphon-line"><span class="do-ant-tag">Ant.</span> ' + formatLiturgicalSymbols(escHtml(antContent)) + '</div>';
    }

    var inner = formatLiturgicalSymbols(escHtml(line));

    return '<div class="do-psalm-verse' + (isDox ? ' do-doxology' : '') + '">' +
        '<span class="do-verse-text">' + inner + '</span>' +
    '</div>';
}

function formatSingleRespLine(line) {
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
    return '<span class="do-resp-line">' +
        (sym ? '<span class="do-resp-sym ' + symCls + '">' + sym + '</span> ' : '') +
        inner +
    '</span>';
}

function formatSingleStanza(st) {
    return '<div class="do-hymn-stanza">' +
        st.filter(function(line) { return line && !/^[-–—_~*]+$/.test(line.trim()); }).map(function(line) {
            var cleanLine = line.replace(/^[vvr]\.\s*/i, '');
            return '<span class="do-hymn-line">' + formatLiturgicalSymbols(escHtml(cleanLine)) + '</span>';
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
    if (/^!/.test(line) || /^\{/.test(line)) {
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
                    '<div class="do-col-la">' + (laSt.length ? formatSingleStanza(laSt) : '') + '</div>' +
                    '<div class="do-col-vernacular">' + (vernSt.length ? formatSingleStanza(vernSt) : '') + '</div>' +
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
                    '<div class="do-col-la">' + (laL ? formatSinglePsalmVerse(laL, isDox) : '') + '</div>' +
                    '<div class="do-col-vernacular">' + (vernL ? formatSinglePsalmVerse(vernL, isDox) : '') + '</div>' +
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
                    '<div class="do-col-la">' + (laL ? formatSingleRespLine(laL) : '') + '</div>' +
                    '<div class="do-col-vernacular">' + (vernL ? formatSingleRespLine(vernL) : '') + '</div>' +
                '</div>'
            );
        }
    } else if (/antiphona/i.test(badge)) {
        var laText = formatLiturgicalSymbols(escHtml(laProcessed.join(' ')));
        var vernText = formatLiturgicalSymbols(escHtml(vernProcessed.join(' ')));
        rows.push(
            '<div class="do-bilingual-row">' +
                '<div class="do-col-la"><div class="do-antiphon-text">' + laText + '</div></div>' +
                '<div class="do-col-vernacular"><div class="do-antiphon-text">' + vernText + '</div></div>' +
            '</div>'
        );
    } else {
        var aligned = alignBilingualBlocks(laProcessed, vernProcessed);
        aligned.forEach(function(pair) {
            var laP = pair.la ? formatSingleParagraph(pair.la) : '';
            var vernP = pair.vern ? formatSingleParagraph(pair.vern) : '';
            if (laP || vernP) {
                rows.push(
                    '<div class="do-bilingual-row">' +
                        '<div class="do-col-la">' + laP + '</div>' +
                        '<div class="do-col-vernacular">' + vernP + '</div>' +
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

    // Strip DO metadata tags
    line = line.replace(/\{:H-[^:]+:\}/g, '');
    line = line.replace(/;;[0-9]+.*$/, '');
    line = line.replace(/!x!/g, '');

    return line;
}

function formatLiturgicalSymbols(text) {
    if (!text) return '';

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
        return formatHymn(processedLines);
    } else if (/psalmus|canticum|invitatorium/i.test(badge)) {
        return formatPsalm(processedLines);
    } else if (/responsorium/i.test(badge)) {
        return formatResponsory(processedLines);
    } else if (/antiphona/i.test(badge)) {
        return '<div class="do-antiphon-text">' + formatLiturgicalSymbols(escHtml(processedLines.join(' '))) + '</div>';
    } else {
        return formatTextBlock(processedLines);
    }
}

function formatHymn(lines) {
    var stanzas = splitHymnStanzas(lines);
    return stanzas.map(function(st) {
        return formatSingleStanza(st);
    }).join('');
}

function formatPsalm(lines) {
    var html = '';
    lines.forEach(function(line) {
        line = line.trim();
        if (!line) return;

        var isDox = /gl[oó]ria patri|sicut erat|gloire au p|comme il [eé]tait|glory be|as it was in|gloria al padre|como era en/i.test(line);
        html += formatSinglePsalmVerse(line, isDox);
    });
    return html;
}

function formatResponsory(lines) {
    var html = '';
    lines.forEach(function(line) {
        html += formatSingleRespLine(line);
    });
    return '<div class="do-responsory">' + html + '</div>';
}

function formatTextBlock(lines) {
    return '<div class="do-text-block">' +
        lines.map(function(l) {
            return formatSingleParagraph(l);
        }).join('') +
    '</div>';
}

function escHtml(str) {
    return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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
    var $stream = $('#do-content-stream');
    $stream.html(renderLoading());

    var bookId = doState.bible.book || 'Genesis';
    var chapterNum = parseInt(doState.bible.chapter, 10) || 1;
    var pageNum = parseInt(doState.bible.page, 10) || 1;
    var pageSize = doState.bible.pageSize || '15';

    var bkObj = DO_BIBLE_BOOKS.find(function(b) { return b.id === bookId; }) || DO_BIBLE_BOOKS[0];
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
    var t = DO_UI_TRANSLATIONS[uiLang] || DO_UI_TRANSLATIONS['fr'];

    var bookId = bkObj.id;
    var bookTitle = bkObj[uiLang] || bkObj.fr || bkObj.la;
    var maxCh = bkObj.chapters || 1;

    var laKeys = Object.keys(laVerses).map(Number);
    var vernKeys = vernVerses ? Object.keys(vernVerses).map(Number) : [];
    var allKeys = Array.from(new Set(laKeys.concat(vernKeys))).sort(function(a, b) { return a - b; });

    // Pagination computations
    var isAll = (pageSize === 'all' || pageSize === 0 || !pageSize);
    var vpp = isAll ? (allKeys.length || 1) : parseInt(pageSize, 10);
    var totalPages = isAll ? 1 : Math.max(1, Math.ceil(allKeys.length / vpp));

    if (pageNum > totalPages) pageNum = totalPages;
    if (pageNum < 1) pageNum = 1;
    doState.bible.page = pageNum;

    // Automatically persist reading position
    localStorage.setItem('do_bible_book', bookId);
    localStorage.setItem('do_bible_chapter', chapterNum);
    localStorage.setItem('do_bible_page', pageNum);
    localStorage.setItem('do_bible_pageSize', isAll ? 'all' : vpp);

    var startIdx = isAll ? 0 : (pageNum - 1) * vpp;
    var endIdx = isAll ? allKeys.length : Math.min(startIdx + vpp, allKeys.length);
    var visibleKeys = allKeys.slice(startIdx, endIdx);

    var vStart = visibleKeys.length ? visibleKeys[0] : 1;
    var vEnd = visibleKeys.length ? visibleKeys[visibleKeys.length - 1] : 1;

    // Update Header
    var headerText = bookTitle + ' ' + chapterNum + ' (p. ' + pageNum + '/' + totalPages + ')';
    $('#doHeaderTitle .title-text').text(headerText);
    $('#doHourLabel').text(('SACRA BIBLIA • ' + (bkObj.cat || 'Vetus Testamentum')).toUpperCase());

    // Top Bookmark Banner
    var $bookmarkBanner = $('<div class="do-bible-bookmark-banner">')
        .html('<span class="do-bookmark-badge">🔖 Signet automatique</span> <span class="do-bookmark-info"><strong>' +
            escHtml(bookTitle) + ' ' + chapterNum + '</strong> — Page ' + pageNum + '/' + totalPages +
            (visibleKeys.length ? ' (versets ' + vStart + ' à ' + vEnd + ')' : '') + '</span>');

    // Controls Toolbar HTML
    var $toolbar = $('<div class="do-bible-main-toolbar">');

    // Book Select
    var $bookSelect = $('<select id="doBibleMainBookSelect" class="do-bible-select">');
    var categories = ['Pentateuque', 'Livres Historiques', 'Livres Sapientiaux', 'Grands Prophètes', 'Petits Prophètes', 'Évangiles & Actes', 'Épîtres de saint Paul', 'Épîtres Catholiques', 'Apocalypse'];
    categories.forEach(function(cat) {
        var $group = $('<optgroup>').attr('label', cat.toUpperCase());
        DO_BIBLE_BOOKS.filter(function(b) { return b.cat === cat; }).forEach(function(b) {
            var label = b[uiLang] || b.fr || b.la;
            var $opt = $('<option>').val(b.id).text(label);
            if (b.id === bookId) $opt.prop('selected', true);
            $group.append($opt);
        });
        $bookSelect.append($group);
    });

    // Chapter Select
    var $chSelect = $('<select id="doBibleMainChapterSelect" class="do-bible-select" style="min-width:110px;">');
    for (var c = 1; c <= maxCh; c++) {
        var $opt = $('<option>').val(c).text((uiLang === 'fr' ? 'Chap. ' : uiLang === 'la' ? 'Cap. ' : 'Ch. ') + c);
        if (c === chapterNum) $opt.prop('selected', true);
        $chSelect.append($opt);
    }

    // Page Select
    var $pgSelect = $('<select id="doBibleMainPageSelect" class="do-bible-select" style="min-width:140px;">');
    for (var p = 1; p <= totalPages; p++) {
        var pStart = (p - 1) * vpp + 1;
        var pEnd = Math.min(p * vpp, allKeys.length);
        var $opt = $('<option>').val(p).text('Page ' + p + '/' + totalPages + (allKeys.length ? ' (v. ' + pStart + '–' + pEnd + ')' : ''));
        if (p === pageNum) $opt.prop('selected', true);
        $pgSelect.append($opt);
    }

    // Page Size Select
    var $vppSelect = $('<select id="doBibleMainVppSelect" class="do-bible-select" style="min-width:120px;">')
        .append('<option value="10"' + (vpp === 10 && !isAll ? ' selected' : '') + '>10 versets / p.</option>')
        .append('<option value="15"' + (vpp === 15 && !isAll ? ' selected' : '') + '>15 versets / p.</option>')
        .append('<option value="25"' + (vpp === 25 && !isAll ? ' selected' : '') + '>25 versets / p.</option>')
        .append('<option value="50"' + (vpp === 50 && !isAll ? ' selected' : '') + '>50 versets / p.</option>')
        .append('<option value="all"' + (isAll ? ' selected' : '') + '>Tout le chapitre</option>');

    var isFirstPage = (pageNum <= 1 && chapterNum <= 1 && DO_BIBLE_BOOKS.indexOf(bkObj) === 0);
    var isLastPage = (pageNum >= totalPages && chapterNum >= maxCh && DO_BIBLE_BOOKS.indexOf(bkObj) === DO_BIBLE_BOOKS.length - 1);

    var $prevBtn = $('<button class="do-bible-nav-btn" id="btnBiblePrev">')
        .html('<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg> <span>' + (uiLang === 'fr' ? 'Page préc.' : 'Præcedens') + '</span>')
        .prop('disabled', isFirstPage);

    var $nextBtn = $('<button class="do-bible-nav-btn" id="btnBibleNext">')
        .html('<span>' + (uiLang === 'fr' ? 'Page suiv.' : 'Sequens') + '</span> <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>')
        .prop('disabled', isLastPage);

    $toolbar.append(
        $('<div class="do-bible-select-group">').append($bookSelect).append($chSelect).append($pgSelect).append($vppSelect),
        $('<div class="do-bible-nav-group">').append($prevBtn).append($nextBtn)
    );

    // Verses Body
    var bodyHtml = '';
    var isBilingual = (doState.showLatin && doState.vernacularLang && doState.vernacularLang !== 'none' && vernVerses);
    var isVernOnly = (!doState.showLatin && doState.vernacularLang && doState.vernacularLang !== 'none' && vernVerses);

    if (visibleKeys.length) {
        if (isBilingual) {
            var rows = [];
            visibleKeys.forEach(function(vNum) {
                var laText = laVerses[vNum] || '';
                var vernText = vernVerses ? (vernVerses[vNum] || '') : '';
                rows.push(
                    '<div class="do-bilingual-row do-bible-row">' +
                        '<div class="do-col-la"><span class="do-bible-vnum">' + vNum + '</span> ' + formatLiturgicalSymbols(escHtml(laText)) + '</div>' +
                        '<div class="do-col-vernacular"><span class="do-bible-vnum">' + vNum + '</span> ' + formatLiturgicalSymbols(escHtml(vernText)) + '</div>' +
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
            visibleKeys.forEach(function(vNum) {
                var vernText = vernVerses ? (vernVerses[vNum] || '') : '';
                rows.push(
                    '<div class="do-bible-single-verse">' +
                        '<span class="do-bible-vnum">' + vNum + '</span> ' + formatLiturgicalSymbols(escHtml(vernText)) +
                    '</div>'
                );
            });
            bodyHtml = '<div class="do-bible-single-col">' + rows.join('') + '</div>';
        } else {
            var rows = [];
            visibleKeys.forEach(function(vNum) {
                var laText = laVerses[vNum] || '';
                rows.push(
                    '<div class="do-bible-single-verse">' +
                        '<span class="do-bible-vnum">' + vNum + '</span> ' + formatLiturgicalSymbols(escHtml(laText)) +
                    '</div>'
                );
            });
            bodyHtml = '<div class="do-bible-single-col">' + rows.join('') + '</div>';
        }
    } else {
        bodyHtml = '<div class="do-empty"><h3>Capitulum vacuum</h3><p>Textus non inventus.</p></div>';
    }

    // Main Card HTML
    var cardTitle = bookTitle + ' — ' + (uiLang === 'fr' ? 'Chapitre ' : 'Capitulum ') + chapterNum;
    var pageBadge = 'Page ' + pageNum + ' / ' + totalPages + (visibleKeys.length ? ' (v. ' + vStart + '–' + vEnd + ')' : '');

    var cardHtml = '<div class="do-card is-bible">' +
        '<div class="do-card-header">' +
            '<div>' +
                '<span class="do-card-type">' + escHtml((bkObj.cat || 'Sacra Scriptura').toUpperCase()) + '</span>' +
                '<h3 class="do-card-title">' + escHtml(cardTitle) + '</h3>' +
            '</div>' +
            '<div class="do-card-actions">' +
                '<span class="do-badge" style="font-size:0.8rem; color:var(--primary-color); font-weight:600;">' + escHtml(pageBadge) + '</span>' +
            '</div>' +
        '</div>' +
        '<div class="do-card-body">' + bodyHtml + '</div>' +
    '</div>';

    // Bottom Navigation Bar
    var $bottomBar = $('<div class="do-bible-bottom-nav">').append(
        $prevBtn,
        $('<span class="do-bible-page-indicator">').text('Page ' + pageNum + ' / ' + totalPages),
        $nextBtn
    );

    $stream.append(cardHtml).append($bottomBar);
    if ($stream[0]) {
        var offsetVal = (doState.mobileLang === 'vern') ? 'calc(-50% - 0.75rem)' : '0%';
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

function renderHomeView() {
    var $stream = $('#do-content-stream').empty();
    var uiLang = getUiLang();
    var curDateFormatted = formatLiturgicalDate(doState.date, uiLang);
    var curHora = getCurrentLiturgicalHora();
    var descs = DO_HORA_DESCRIPTIONS[uiLang] || DO_HORA_DESCRIPTIONS['fr'];
    var curHoraInfo = descs[curHora] || { name: curHora, time: '', desc: '' };

    $('#doHourLabel').text(uiLang === 'fr' ? 'ACCUEIL • ' + curDateFormatted.toUpperCase() : 'HODIE • ' + curDateFormatted.toUpperCase());
    $('#doHeaderTitle .title-text').text(uiLang === 'fr' ? 'Tableau de bord liturgique' : 'Tabularium Liturgicum');

    loadMissaData(doState.date, 'la', function(err, laResult) {
        var feastTitle = (laResult && laResult.title) ? laResult.title : curDateFormatted;

        var $home = $('<div class="do-home-view">');

        // Hero Card
        var $hero = $('<div class="do-home-hero">')
            .append(
                $('<div class="do-home-hero-top">')
                    .append('<span class="do-home-date-badge">' + escHtml(curDateFormatted) + '</span>')
                    .append('<span class="do-home-rank-pill"><svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><circle cx="12" cy="12" r="6"></circle></svg> ' + (uiLang === 'fr' ? 'Heure actuelle : ' + curHoraInfo.name : 'Hora apta : ' + curHoraInfo.name) + '</span>')
            )
            .append('<h2 class="do-home-feast-title">' + escHtml(feastTitle) + '</h2>')
            .append(
                $('<div class="do-home-hero-actions">')
                    .append(
                        $('<button class="do-home-current-btn">')
                            .html('<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> <span>' + (uiLang === 'fr' ? 'Prier ' + curHoraInfo.name : 'Ora ' + curHoraInfo.name) + '</span>')
                            .on('click', function() {
                                doState.hora = curHora;
                                localStorage.setItem('do_hora', curHora);
                                renderDO();
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                            })
                    )
                    .append(
                        $('<button class="do-home-secondary-btn">')
                            .html('<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6l4 2"></path></svg> <span>' + (uiLang === 'fr' ? 'Sainte Messe' : 'Sancta Missa') + '</span>')
                            .on('click', function() {
                                doState.hora = 'missa';
                                localStorage.setItem('do_hora', 'missa');
                                renderDO();
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                            })
                    )
            );

        $home.append($hero);

        // Section: Cursus Horarum
        var $horaeSection = $('<div class="do-home-section">')
            .append(
                $('<div class="do-home-section-header">')
                    .append('<h3 class="do-home-section-title">' + (uiLang === 'fr' ? 'Les Heures de l’Office Divin' : 'Cursus Horarum Divini Officii') + '</h3>')
            );

        var $horaeGrid = $('<div class="do-home-grid">');
        var hoursList = ['matutinum', 'laudes', 'prima', 'tertia', 'sexta', 'nona', 'vesperae', 'completorium'];

        var horaIcons = {
            matutinum: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>',
            laudes: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line></svg>',
            prima: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 14 14"></polyline></svg>',
            tertia: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 15 11"></polyline></svg>',
            sexta: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 12 17"></polyline></svg>',
            nona: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 9 15"></polyline></svg>',
            vesperae: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 18a5 5 0 0 0-10 0"></path><line x1="12" y1="2" x2="12" y2="9"></line><line x1="4.22" y1="10.22" x2="5.64" y2="11.64"></line><line x1="1" y1="18" x2="3" y2="18"></line><line x1="21" y1="18" x2="23" y2="18"></line><line x1="18.36" y1="11.64" x2="19.78" y2="10.22"></line></svg>',
            completorium: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>'
        };

        hoursList.forEach(function(hKey) {
            var hInfo = descs[hKey] || { name: hKey, time: '', desc: '' };
            var isCurrent = (hKey === curHora);

            var $card = $('<button class="do-home-card' + (isCurrent ? ' is-current' : '') + '">')
                .append('<div class="do-home-card-icon">' + (horaIcons[hKey] || '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle></svg>') + '</div>')
                .append(
                    $('<div class="do-home-card-info">')
                        .append('<span class="do-home-card-name">' + escHtml(hInfo.name) + (isCurrent ? ' <small style="color:var(--primary-color); font-weight:700;">● ' + (uiLang === 'fr' ? 'En ce moment' : 'Nunc') + '</small>' : '') + '</span>')
                        .append('<span class="do-home-card-time">' + escHtml(hInfo.time + ' • ' + hInfo.desc) + '</span>')
                )
                .on('click', function() {
                    doState.hora = hKey;
                    localStorage.setItem('do_hora', hKey);
                    renderDO();
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                });

            $horaeGrid.append($card);
        });

        $horaeSection.append($horaeGrid);
        $home.append($horaeSection);

        // Section: Missa & Biblia
        var $extraSection = $('<div class="do-home-section">')
            .append(
                $('<div class="do-home-section-header">')
                    .append('<h3 class="do-home-section-title">' + (uiLang === 'fr' ? 'Messe & Sainte Écriture' : 'Missa & Sacra Biblia') + '</h3>')
            );

        var $extraGrid = $('<div class="do-home-grid">');

        // Missa Card
        var $missaCard = $('<button class="do-home-card">')
            .append('<div class="do-home-card-icon"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M2 12h20"></path></svg></div>')
            .append(
                $('<div class="do-home-card-info">')
                    .append('<span class="do-home-card-name">' + (uiLang === 'fr' ? 'Sainte Messe du Jour' : 'Sancta Missa') + '</span>')
                    .append('<span class="do-home-card-time">' + (uiLang === 'fr' ? 'Propre des lectures et prières de la Messe' : 'Proprium et Ordinarium Missae') + '</span>')
            )
            .on('click', function() {
                doState.hora = 'missa';
                localStorage.setItem('do_hora', 'missa');
                renderDO();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });

        // Bible Card
        var $bibleCard = $('<button class="do-home-card">')
            .append('<div class="do-home-card-icon"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg></div>')
            .append(
                $('<div class="do-home-card-info">')
                    .append('<span class="do-home-card-name">' + (uiLang === 'fr' ? 'Sainte Bible (Vulgate)' : 'Sacra Biblia Vulgata') + '</span>')
                    .append('<span class="do-home-card-time">' + (uiLang === 'fr' ? '73 livres avec traduction verset par verset' : 'Vetus et Novum Testamentum') + '</span>')
            )
            .on('click', function() {
                openBible('Matt', 1, 1);
            });

        $extraGrid.append($missaCard).append($bibleCard);
        $extraSection.append($extraGrid);
        $home.append($extraSection);

        $stream.append($home);
    });
}

// ---- Main Render Function ----
function renderDO() {
    updateSidebarAndHeader();
    closeHeaderDropdown();

    var isHome = (doState.hora === 'home');
    if (isHome) {
        renderHomeView();
        return;
    }

    var isBible = (doState.hora === 'bible');
    if (isBible) {
        renderBibleMainView();
        return;
    }

    var $stream = $('#do-content-stream');
    $stream.html(renderLoading());

    var isMissa = (doState.hora === 'missa');
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

function displayResult(result, vernResult) {
    var $stream = $('#do-content-stream').empty();
    var uiLang = getUiLang();

    if (!result || !result.cards || !result.cards.length) {
        var notFoundTitle = (uiLang === 'fr') ? 'Office non trouvé' : (uiLang === 'en') ? 'Office not found' : (uiLang === 'es') ? 'Oficio no encontrado' : 'Officium non inventum';
        var notFoundDesc = (uiLang === 'fr') ? 'Les textes pour ce jour ne sont pas disponibles.' : 'Textus pro hac die non inveniuntur in repositorio locali.';
        $stream.html('<div class="do-empty"><h3>' + notFoundTitle + '</h3><p>' + notFoundDesc + '</p></div>');
        return;
    }

    var title = '';
    if (vernResult && vernResult.title && doState.vernacularLang && doState.vernacularLang !== 'none') {
        title = vernResult.title;
    } else if (result && result.title) {
        title = result.title;
    }

    if (title) {
        $('#doSidebarFeastTitle').text(title);
        $('#doHeaderTitle .title-text').text(title);
    }

    var vernMap = {};
    if (vernResult && vernResult.cards) {
        vernResult.cards.forEach(function(vc) {
            if (vc && vc.id) {
                vernMap[vc.id] = vc;
            }
        });
    }

    result.cards.forEach(function(card) {
        var vernCard = (card.id && vernMap[card.id]) ? vernMap[card.id] : null;
        var cardHtml = renderOfficeCardHTML(card, vernCard);
        $stream.append(cardHtml);
    });

    if ($stream[0]) {
        var offsetVal = (doState.mobileLang === 'vern') ? 'calc(-50% - 0.75rem)' : '0%';
        $stream[0].style.setProperty('--bilingual-offset', offsetVal);
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

    // Ordinarium Missæ UI state
    $('#doOrdinariumOptions .settings-option-card, #doOrdinariumOptions .settings-pill-btn, #doOrdinariumOptions .segment').removeClass('active');
    $('#doOrdinariumOptions [data-value="' + doState.includeOrdinarium + '"]').addClass('active');

    // 2 Distinct Language settings UI state
    $('#doLatinOptions .settings-option-card, #doLatinOptions .settings-pill-btn, #doLatinOptions .segment').removeClass('active');
    $('#doLatinOptions [data-value="' + doState.showLatin + '"]').addClass('active');

    $('#doVernacularOptions .settings-option-card, #doVernacularOptions .settings-option').removeClass('active');
    $('#doVernacularOptions [data-value="' + doState.vernacularLang + '"]').addClass('active');

    $('#doThemeOptions .settings-option-card, #doThemeOptions .settings-option').removeClass('active');
    $('#doThemeOptions [data-value="' + doState.settings.theme + '"]').addClass('active');

    $('#doColorOptions .color-swatch-circle, #doColorOptions .color-swatch').removeClass('active');
    $('#doColorOptions [data-color="' + doState.settings.color + '"]').addClass('active');
}

function openBible(bookId, chapterNum, pageNum) {
    doState.hora = 'bible';
    localStorage.setItem('do_hora', 'bible');
    if (bookId) {
        doState.bible.book = bookId;
        localStorage.setItem('do_bible_book', bookId);
    }
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
    $('#settingsPanel, #doSidebar').removeClass('open active');
    $('#settingsBackdrop, #sidebarBackdrop').removeClass('open active');
    closeHeaderDropdown();
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
    'CorpusChristi': "Fête-Dieu (Très Saint Sacrement)",
    'SCJ': "Fête du Sacré-Cœur de Jésus",
    'ChristusRex': "Fête du Christ-Roi"
};

function getVernacularItemTitle(item, uiLang) {
    if (!uiLang) uiLang = getUiLang();
    var k = item.key || '';

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

    // French UI (Default / 'fr')
    if (DO_FR_TEMPORA_TITLES[k]) {
        return DO_FR_TEMPORA_TITLES[k];
    }
    var mPent = k.match(/^Pent(\d+)$/i);
    if (mPent) return mPent[1] + "e Dimanche après la Pentecôte";
    var mEpi = k.match(/^Epi(\d+)$/i);
    if (mEpi) return mEpi[1] + "e Dimanche après l'Épiphanie";
    var mQuad = k.match(/^Quad(\d+)$/i);
    if (mQuad) return mQuad[1] + "e Dimanche de Carême";
    var mAdv = k.match(/^Adv(\d+)$/i);
    if (mAdv) return mAdv[1] + "e Dimanche de l'Avent";

    var t = item.en || item.title || item.key;
    t = t.replace(/^[A-Za-z]{3}\s*\d{1,2}:\s*/, '').replace(/^\d{1,2}\s*[A-Za-z]{3}:\s*/, '');

    var frReplacements = [
        [/\bOur Lady of Mount Carmel\b/gi, 'Notre-Dame du Mont-Carmel'],
        [/\bOur Lady of the Rosary\b/gi, 'Notre-Dame du Rosaire'],
        [/\bOur Lady of Sorrows\b/gi, 'Notre-Dame des Sept Douleurs'],
        [/\bOur Lady of Lourdes\b/gi, 'Notre-Dame de Lourdes'],
        [/\bOur Lady of Ransom\b/gi, 'Notre-Dame de la Merci'],
        [/\bOur Lady of Good Counsel\b/gi, 'Notre-Dame du Bon Conseil'],
        [/\bOur Lady of Perpetual Help\b/gi, 'Notre-Dame du Perpétuel Secours'],
        [/\bOur Lady of the Snows\b/gi, 'Notre-Dame des Neiges'],
        [/\bOur Lady of\s+/gi, 'Notre-Dame de '],
        [/\bAssumption of the BVM\b/gi, 'Assomption de la Très Sainte Vierge Marie'],
        [/\bNativity of the BVM\b/gi, 'Nativité de la Très Sainte Vierge Marie'],
        [/\bImmaculate Conception\b/gi, 'Immaculée Conception de la Vierge Marie'],
        [/\bAnnunciation\b/gi, 'Annonciation de la Vierge Marie'],
        [/\bPurification\b/gi, 'Purification de la Vierge Marie (Chandeleur)'],
        [/\bVisitation\b/gi, 'Visitation de la Vierge Marie'],
        [/\bAll Saints\b/gi, 'La Toussaint'],
        [/\bAll Souls\b/gi, 'Commémoration de tous les fidèles défunts'],
        [/\bChristmas\b/gi, 'Nativité de Notre Seigneur (Noël)'],
        [/\bEpiphany\b/gi, 'Épiphanie de Notre Seigneur'],
        [/\bCircumcision of Our Lord\b/gi, 'Circoncision de Notre Seigneur'],
        [/\bBaptism of Our Lord Jesus Christ\b/gi, 'Baptême de Notre Seigneur Jésus-Christ'],
        [/\bTransfiguration of Our Lord\b/gi, 'Transfiguration de Notre Seigneur'],
        [/\bExaltation of the Holy Cross\b/gi, 'Exaltation de la Sainte Croix'],
        [/\bFinding of the Holy Cross\b/gi, 'Invention de la Sainte Croix'],
        [/\bSeven Holy Brothers\b/gi, 'Les Sept Saints Frères Martyrs'],
        [/\bSeven Holy Founders\b/gi, 'Les Sept Saints Fondateurs des Servites'],
        [/\bHoly Guardian Angels\b/gi, 'Les Saints Anges Gardiens'],
        [/\bHoly Innocents\b/gi, 'Les Saints Innocents Martyrs'],
        [/\bDedication of the Lateran Basilica\b/gi, 'Dédicace de la Basilique du Latran'],
        [/\bDedication of the Basilica of St Mary Major\b/gi, 'Dédicace de Sainte-Marie-Majeure'],
        [/\bDedication of the Basilicas of Ss Peter and Paul\b/gi, 'Dédicace des Basiliques des Saints Pierre et Paul'],
        [/\bChair of St Peter at Rome\b/gi, 'Chaire de Saint Pierre à Rome'],
        [/\bChair of St Peter at Antioch\b/gi, 'Chaire de Saint Pierre à Antioche'],
        [/\bConversion of St Paul\b/gi, 'Conversion de Saint Paul'],
        [/\bCommemoration of St Paul\b/gi, 'Commémoration de Saint Paul'],
        [/\bThe Beheading of St John the Baptist\b/gi, 'Décollation de Saint Jean-Baptiste'],
        [/\bNativity of St John the Baptist\b/gi, 'Nativité de Saint Jean-Baptiste'],
        [/\bSts\s+/gi, 'Saints '],
        [/\bSt\s+/gi, 'Saint '],
        [/\bSs\s+/gi, 'Saints '],
        [/\bS\s+/gi, 'Saint '],
        [/\bBartholomew\b/gi, 'Barthélemy'],
        [/\bLawrence\b/gi, 'Laurent'],
        [/\bStephen\b/gi, 'Étienne'],
        [/\bGregory\b/gi, 'Grégoire'],
        [/\bPeter\b/gi, 'Pierre'],
        [/\bPaul\b/gi, 'Paul'],
        [/\bJohn\b/gi, 'Jean'],
        [/\bJames\b/gi, 'Jacques'],
        [/\bThomas\b/gi, 'Thomas'],
        [/\bAndrew\b/gi, 'André'],
        [/\bPhilip\b/gi, 'Philippe'],
        [/\bMatthew\b/gi, 'Matthieu'],
        [/\bMark\b/gi, 'Marc'],
        [/\bLuke\b/gi, 'Luc'],
        [/\bSimon and Jude\b/gi, 'Simon et Jude'],
        [/\bMary Magdalen\b/gi, 'Marie-Madeleine'],
        [/\bAnne\b/gi, 'Anne'],
        [/\bJoachim\b/gi, 'Joachim'],
        [/\bJoseph\b/gi, 'Joseph'],
        [/\bMichael Archangel\b/gi, 'Michel Archange'],
        [/\bRaphael Archangel\b/gi, 'Raphaël Archange'],
        [/\bGabriel Archangel\b/gi, 'Gabriel Archange'],
        [/\bAugustine\b/gi, 'Augustin'],
        [/\bJerome\b/gi, 'Jérôme'],
        [/\bAmbrose\b/gi, 'Ambroise'],
        [/\bHilary\b/gi, 'Hilaire'],
        [/\bAthanasius\b/gi, 'Athanase'],
        [/\bChrysostom\b/gi, 'Chrysostome'],
        [/\bBasil\b/gi, 'Basile'],
        [/\bBernard\b/gi, 'Bernard'],
        [/\bFrancis of Assisi\b/gi, 'François d\'Assise'],
        [/\bFrancis de Sales\b/gi, 'François de Sales'],
        [/\bDominic\b/gi, 'Dominique'],
        [/\bTherese of the Child Jesus\b/gi, 'Thérèse de l\'Enfant-Jésus'],
        [/\bTeresa of Avila\b/gi, 'Thérèse d\'Avila'],
        [/\bAnthony of Padua\b/gi, 'Antoine de Padoue'],
        [/\bIgnatius of Loyola\b/gi, 'Ignace de Loyola'],
        [/\bLouis\b/gi, 'Louis'],
        [/\bDenis\b/gi, 'Denis'],
        [/\bMartin\b/gi, 'Martin'],
        [/\bNicholas\b/gi, 'Nicolas'],
        [/\bCecilia\b/gi, 'Cécile'],
        [/\bAgnes\b/gi, 'Agnès'],
        [/\bLucy\b/gi, 'Lucie'],
        [/\bAgatha\b/gi, 'Agathe'],
        [/\bCatherine of Siena\b/gi, 'Catherine de Sienne'],
        [/\bCatherine of Alexandria\b/gi, 'Catherine d\'Alexandrie'],
        [/\bJoan of Arc\b/gi, 'Jeanne d\'Arc'],
        [/\bDoctor of the Church\b/gi, 'Docteur de l\'Église'],
        [/\bDoctor\b/gi, 'Docteur'],
        [/\bPope and Martyr\b/gi, 'Pape et Martyr'],
        [/\bPope\b/gi, 'Pape'],
        [/\bBishop and Martyr\b/gi, 'Évêque et Martyr'],
        [/\bBishop and Confessor\b/gi, 'Évêque et Confesseur'],
        [/\bBishop\b/gi, 'Évêque'],
        [/\bMartyr\b/gi, 'Martyr'],
        [/\bMartyrs\b/gi, 'Martyrs'],
        [/\bConfessor\b/gi, 'Confesseur'],
        [/\bAbbot\b/gi, 'Abbé'],
        [/\bVirgin and Martyr\b/gi, 'Vierge et Martyre'],
        [/\bVirgin\b/gi, 'Vierge'],
        [/\bWidow\b/gi, 'Veuve'],
        [/\bApostle\b/gi, 'Apôtre'],
        [/\bEvangelist\b/gi, 'Évangéliste'],
        [/\bCompanions\b/gi, 'Compagnons'],
        [/\band\b/gi, 'et']
    ];

    frReplacements.forEach(function(pair) {
        t = t.replace(pair[0], pair[1]);
    });
    return t;
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

function renderHeaderDropdown() {
    var isBible = (doState.hora === 'bible');
    var uiLang = getUiLang();

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
            var mode = doState.hddMode || 'temporum';
            var dateFormatted = formatLiturgicalDate(doState.date, uiLang);

            var $calContainer = $('<div id="hddCustomCalendar" class="hdd-custom-calendar' + (doState.calOpen ? '' : ' hidden') + '"></div>');

            var $searchBar = $('<div class="hdd-search-bar">')
                .append('<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" class="hdd-search-icon"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>')
                .append('<input type="text" id="hddSearchInput" class="hdd-search-input" placeholder="' + escHtml(searchPlaceholder) + '" autocomplete="off" spellcheck="false">');

            var $controlsRow = $('<div class="hdd-controls-row">');

            var $modeGroup = $('<div class="hdd-mode-group">')
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
            var mode = doState.hddMode || 'temporum';
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
            var isNT = (bk.cat === 'Évangiles' || bk.cat === 'Actes des Apôtres' || bk.cat === 'Épîtres de saint Paul' || bk.cat === 'Épîtres Catholiques' || bk.cat === 'Apocalypse');
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
        var mode = doState.hddMode || 'temporum';
        var curDateStr = doState.date.format('YYYY-MM-DD');
        var year = doState.date.year();

        var allSundays = (typeof sundayKeys !== 'undefined' ? sundayKeys : (window.sundayKeys || []));
        var allSaints = (typeof saintKeys !== 'undefined' ? saintKeys : (window.saintKeys || []));

        var groups = {};

        if (mode === 'temporum') {
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
                if (!groups[grp]) groups[grp] = [];
                groups[grp].push(item);
            });
        } else {
            allSaints.forEach(function(item) {
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

                var grp = getSanctoralMonthGroup(item.key, uiLang);
                if (!groups[grp]) groups[grp] = [];
                groups[grp].push(item);
            });
        }

        var hasItems = false;
        Object.keys(groups).forEach(function(grpName) {
            var items = groups[grpName];
            if (!items || !items.length) return;
            hasItems = true;

            $list.append('<div class="hdd-group-title">' + escHtml(grpName) + '</div>');

            items.forEach(function(item) {
                var itemDate = getDateForLiturgicalKey(item.key, year);
                var isSel = itemDate && itemDate.format('YYYY-MM-DD') === curDateStr;
                var dateBadge = itemDate ? itemDate.format('DD MMM') : '';
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
    var isSun = (date.day() === 0);
    return isSun ? 'temporum' : 'sanctorum';
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
    var theme = doState.settings.theme;
    if (theme === 'auto') {
        var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
        document.documentElement.setAttribute('data-theme', theme);
    }
    applyColor(doState.settings.color);
}

function applyColor(hex) {
    doState.settings.color = hex;
    var r = parseInt(hex.slice(1,3), 16);
    var g = parseInt(hex.slice(3,5), 16);
    var b = parseInt(hex.slice(5,7), 16);
    document.documentElement.style.setProperty('--primary-color', hex);
    document.documentElement.style.setProperty('--primary-color-rgb', r + ',' + g + ',' + b);
    localStorage.setItem('do_color', hex);
}

// ---- Event Listeners ----
function setupEventListeners() {
    $(document).on('click', '.do-brand, #btnBrandHome', function(e) {
        e.preventDefault();
        doState.hora = 'home';
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
        renderDO();
    });

    $(document).on('click', '.do-hora-sub', function(e) {
        e.preventDefault();
        var hora = $(this).data('hora');
        $('#doHoraePicker').addClass('hidden');
        doState.hora = hora;
        localStorage.setItem('do_hora', hora);
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

    // Bible Previous Page / Chapter Navigation
    $(document).on('click', '#btnBiblePrev', function() {
        var bkObj = DO_BIBLE_BOOKS.find(function(b) { return b.id === doState.bible.book; }) || DO_BIBLE_BOOKS[0];
        if (doState.bible.page > 1) {
            doState.bible.page--;
            renderBibleMainView();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (doState.bible.chapter > 1) {
            doState.bible.chapter--;
            doState.bible.page = 9999; // Automatically clamped to totalPages of the previous chapter
            renderBibleMainView();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            var curIdx = DO_BIBLE_BOOKS.indexOf(bkObj);
            if (curIdx > 0) {
                var prevBk = DO_BIBLE_BOOKS[curIdx - 1];
                doState.bible.book = prevBk.id;
                doState.bible.chapter = prevBk.chapters;
                doState.bible.page = 9999;
                renderBibleMainView();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }
    });

    // Bible Next Page / Chapter Navigation
    $(document).on('click', '#btnBibleNext', function() {
        var bkObj = DO_BIBLE_BOOKS.find(function(b) { return b.id === doState.bible.book; }) || DO_BIBLE_BOOKS[0];
        var currentLang = doState.vernacularLang || 'fr';
        var laPath = 'vulgate/' + bkObj.id + '.txt';

        fetchLocalFile(laPath, function(err, laData) {
            var laVerses = (!err && laData) ? parseBibleFileVerses(laData, doState.bible.chapter) : {};
            var totalVerses = Object.keys(laVerses).length;
            var isAll = (doState.bible.pageSize === 'all');
            var vpp = isAll ? totalVerses : (parseInt(doState.bible.pageSize, 10) || 15);
            var totalPages = isAll ? 1 : Math.max(1, Math.ceil(totalVerses / vpp));

            if (doState.bible.page < totalPages) {
                doState.bible.page++;
            } else if (doState.bible.chapter < bkObj.chapters) {
                doState.bible.chapter++;
                doState.bible.page = 1;
            } else {
                var curIdx = DO_BIBLE_BOOKS.indexOf(bkObj);
                if (curIdx < DO_BIBLE_BOOKS.length - 1) {
                    var nextBk = DO_BIBLE_BOOKS[curIdx + 1];
                    doState.bible.book = nextBk.id;
                    doState.bible.chapter = 1;
                    doState.bible.page = 1;
                }
            }
            renderBibleMainView();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
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
        e.stopPropagation();
        $('#doSidebar').addClass('open active');
        $('#sidebarBackdrop').addClass('open active');
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
    $('#doOrdinariumOptions').on('click', '.settings-option-card, .settings-pill-btn, .segment', function() {
        var val = $(this).data('value') === true || $(this).data('value') === 'true';
        doState.includeOrdinarium = val;
        localStorage.setItem('do_ordinarium', val);
        $('#doOrdinariumOptions .settings-option-card, #doOrdinariumOptions .settings-pill-btn, #doOrdinariumOptions .segment').removeClass('active');
        $(this).addClass('active');
        renderDO();
    });

    // 2 Distinct Settings: Latin Text Toggle
    $('#doLatinOptions').on('click', '.settings-option-card, .settings-pill-btn, .segment', function() {
        var val = $(this).data('value') === true || $(this).data('value') === 'true';
        if (!val && (!doState.vernacularLang || doState.vernacularLang === 'none')) {
            doState.vernacularLang = 'fr';
            localStorage.setItem('do_vernacular_lang', 'fr');
        }
        doState.showLatin = val;
        localStorage.setItem('do_show_latin', val);
        $('#doLatinOptions .settings-option-card, #doLatinOptions .settings-pill-btn, #doLatinOptions .segment').removeClass('active');
        $(this).addClass('active');
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

    $('#doColorOptions').on('click', '.color-swatch-circle, .color-swatch', function() {
        $('#doColorOptions .color-swatch-circle, #doColorOptions .color-swatch').removeClass('active');
        $(this).addClass('active');
        applyColor($(this).data('color'));
    });

    // Global Touch Gestures (Synchronized whole-page bilingual swipe & Sidebar drawer)
    var touchStartX = 0;
    var touchStartY = 0;
    var touchIsEdge = false;
    var isDraggingBilingual = false;
    var shiftDistance = 0;
    var initialOffsetPx = 0;

    $(document).on('touchstart', function(e) {
        if (e.originalEvent.touches && e.originalEvent.touches.length === 1) {
            touchStartX = e.originalEvent.touches[0].clientX;
            touchStartY = e.originalEvent.touches[0].clientY;
            touchIsEdge = (touchStartX <= 35);
            isDraggingBilingual = false;

            var isBilingual = (doState.showLatin && doState.vernacularLang && doState.vernacularLang !== 'none');
            var isSidebarOpen = $('#doSidebar').hasClass('open') || $('#doSidebar').hasClass('active');

            if (isBilingual && !isSidebarOpen) {
                var $wrapper = $('.do-bilingual-wrapper').first();
                var cardW = $wrapper.length ? $wrapper.width() : $(window).width();
                shiftDistance = cardW + 24; // width + gap
                initialOffsetPx = (doState.mobileLang === 'vern') ? -shiftDistance : 0;
            }
        }
    });

    $(document).on('touchmove', function(e) {
        if (!touchStartX || !e.originalEvent.touches || !e.originalEvent.touches.length) return;
        var currentX = e.originalEvent.touches[0].clientX;
        var currentY = e.originalEvent.touches[0].clientY;
        var deltaX = currentX - touchStartX;
        var deltaY = currentY - touchStartY;
        var isSidebarOpen = $('#doSidebar').hasClass('open') || $('#doSidebar').hasClass('active');

        if (isSidebarOpen) return;

        // If swiping right from left edge while in Latin -> intend to open drawer, don't drag cards
        if (touchIsEdge && deltaX > 0 && doState.mobileLang === 'la') return;

        // Detect horizontal intent
        if (Math.abs(deltaX) > 10 && Math.abs(deltaX) > Math.abs(deltaY)) {
            var isBilingual = (doState.showLatin && doState.vernacularLang && doState.vernacularLang !== 'none');
            if (isBilingual && shiftDistance > 0) {
                isDraggingBilingual = true;
                stopBilingualSwipeHint();
                $('.do-bilingual-row').addClass('is-dragging');

                var targetOffset = initialOffsetPx + deltaX;
                // Clamp with gentle rubber banding
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
    });

    $(document).on('touchend', function(e) {
        if (!touchStartX || !e.originalEvent.changedTouches || !e.originalEvent.changedTouches.length) return;
        var touchEndX = e.originalEvent.changedTouches[0].clientX;
        var touchEndY = e.originalEvent.changedTouches[0].clientY;
        var deltaX = touchEndX - touchStartX;
        var deltaY = touchEndY - touchStartY;
        var isSidebarOpen = $('#doSidebar').hasClass('open') || $('#doSidebar').hasClass('active');

        $('.do-bilingual-row').removeClass('is-dragging');

        // Swiping left when sidebar is open -> close sidebar
        if (isSidebarOpen && deltaX < -40 && Math.abs(deltaX) > Math.abs(deltaY)) {
            closeModals();
            touchStartX = 0;
            touchStartY = 0;
            touchIsEdge = false;
            isDraggingBilingual = false;
            return;
        }

        var isBilingual = (doState.showLatin && doState.vernacularLang && doState.vernacularLang !== 'none');

        if (isBilingual && isDraggingBilingual) {
            var $stream = $('#do-content-stream');
            if (initialOffsetPx === 0) {
                // Was at Latin
                if (deltaX < -50) {
                    // Snap all cards simultaneously to Vernacular
                    doState.mobileLang = 'vern';
                    if ($stream.length && $stream[0]) {
                        $stream[0].style.setProperty('--bilingual-offset', 'calc(-50% - 0.75rem)');
                    }
                } else {
                    // Snap back to Latin
                    doState.mobileLang = 'la';
                    if ($stream.length && $stream[0]) {
                        $stream[0].style.setProperty('--bilingual-offset', '0%');
                    }
                }
            } else {
                // Was at Vernacular
                if (deltaX > 50) {
                    // Snap all cards simultaneously to Latin
                    doState.mobileLang = 'la';
                    if ($stream.length && $stream[0]) {
                        $stream[0].style.setProperty('--bilingual-offset', '0%');
                    }
                } else {
                    // Snap back to Vernacular
                    doState.mobileLang = 'vern';
                    if ($stream.length && $stream[0]) {
                        $stream[0].style.setProperty('--bilingual-offset', 'calc(-50% - 0.75rem)');
                    }
                }
            }
        } else if (!isSidebarOpen) {
            // Not dragging bilingual (e.g. edge swipe or already at Latin)
            var isAtLatin = (doState.mobileLang === 'la');
            if ((touchIsEdge || isAtLatin) && deltaX > 50 && Math.abs(deltaX) > Math.abs(deltaY) * 1.2) {
                $('#doSidebar').addClass('open active');
                $('#sidebarBackdrop').addClass('open active');
            }
        }

        touchStartX = 0;
        touchStartY = 0;
        touchIsEdge = false;
        isDraggingBilingual = false;
    });

    if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function(e) {
            if (doState.settings.theme === 'auto') {
                document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
            }
        });
    }

    $(document).on('click', function(e) {
        if ($('#headerDropdown').hasClass('hidden')) return;
        if ($(e.target).closest('#headerDropdown, .header-title-area, .do-top-header, .dropdown-trigger').length) return;
        closeHeaderDropdown();
    });
}

// ---- Initialization ----
$(function() {
    console.log('Divinum Officium & Missale Initialized with Recursive Section & Variable Resolver.');
    $('#doDateInput').val(doState.date.format('YYYY-MM-DD'));
    initTheme();
    setupEventListeners();
    renderDO();
});
