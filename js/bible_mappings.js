// Avec la Bible Crampon 1923, les textes français (notamment Tobie, Judith, Esther)
// sont déjà rigoureusement conformes à la Vulgate clémentine (1:1 direct).
// La table spécifique AELF n'est plus nécessaire.
var DO_BIBLE_ALIGNMENT_MAP = {
    // Les alignements se font désormais par défaut en 1:1 direct.
};

/**
 * Construit la liste des lignes de versets synchronisées / réalignées.
 */
function getBibleAlignedRows(bookId, vernLang, chapterNum, laVerses, vernVerses) {
    var mapForBook = (typeof DO_BIBLE_ALIGNMENT_MAP !== 'undefined') ? DO_BIBLE_ALIGNMENT_MAP[bookId] : null;
    var mapForLang = mapForBook ? mapForBook[vernLang] : null;
    var mapForChapter = mapForLang ? mapForLang[chapterNum] : null;

    if (mapForChapter && Array.isArray(mapForChapter)) {
        return mapForChapter.map(function(item) {
            var laNum = item.la;
            var laTxt = (laVerses && laVerses[laNum] !== undefined) ? laVerses[laNum] : '';
            var vernTxt = '';
            var displayVernNum = '';
            var isVulgateSuppl = false;

            if (item.vern && Array.isArray(item.vern) && item.vern.length > 0) {
                displayVernNum = item.vern.join('-');
                var parts = [];
                item.vern.forEach(function(vn) {
                    if (vernVerses && vernVerses[vn]) {
                        parts.push(vernVerses[vn]);
                    }
                });
                vernTxt = parts.join(' ');
            } else if (item.vlg) {
                displayVernNum = String(laNum);
                vernTxt = item.vlg;
                isVulgateSuppl = true;
            } else {
                displayVernNum = '—';
                vernTxt = '<em>(Passage non présent dans le texte liturgique AELF)</em>';
            }

            return {
                laVNum: laNum,
                laText: laTxt,
                vernVNum: displayVernNum,
                vernText: vernTxt,
                isVulgateSuppl: isVulgateSuppl
            };
        });
    }

    // Comportement par défaut : alignement 1:1 direct
    var laKeys = Object.keys(laVerses || {}).map(Number);
    var vernKeys = vernVerses ? Object.keys(vernVerses).map(Number) : [];
    var allKeys = Array.from(new Set(laKeys.concat(vernKeys))).sort(function(a, b) { return a - b; });

    return allKeys.map(function(k) {
        return {
            laVNum: (laVerses && laVerses[k] !== undefined) ? k : null,
            laText: laVerses ? (laVerses[k] || '') : '',
            vernVNum: (vernVerses && vernVerses[k] !== undefined) ? k : null,
            vernText: vernVerses ? (vernVerses[k] || '') : '',
            isVulgateSuppl: false
        };
    });
}
