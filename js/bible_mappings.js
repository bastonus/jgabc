// ============================================================================
// DO_BIBLE_ALIGNMENT_MAP & Helper Functions
// Gère la synopse et le réalignement des versets entre la Vulgate latine et les
// traductions vernaculaires (notamment l'AELF grecque pour Tobie, Judith, etc.)
// ============================================================================

var DO_BIBLE_ALIGNMENT_MAP = {
    'Tobiæ': {
        'fr': {
            1: [
                { la: 1, vern: [1, 2] },
                { la: 2, vern: [2] },
                { la: 3, vern: [3] },
                { la: 4, vern: [4] },
                { la: 5, vern: [5] },
                { la: 6, vern: [6] },
                { la: 7, vern: [7, 8] },
                { la: 8, vern: [8] },
                { la: 9, vern: [9] },
                { la: 10, vern: [9, 10] },
                { la: 11, vern: [10] },
                { la: 12, vern: [11] },
                { la: 13, vern: [12, 13] },
                { la: 14, vern: [13, 14] },
                { la: 15, vern: [14] },
                { la: 16, vern: [14] },
                { la: 17, vern: [14] },
                { la: 18, vern: [15] },
                { la: 19, vern: [16] },
                { la: 20, vern: [16, 17] },
                { la: 21, vern: [18] },
                { la: 22, vern: [19] },
                { la: 23, vern: [20] },
                { la: 24, vern: [21] },
                { la: 25, vern: [22] }
            ],
            2: [
                { la: 1, vern: [1] },
                { la: 2, vern: [2] },
                { la: 3, vern: [3] },
                { la: 4, vern: [4] },
                { la: 5, vern: [5] },
                { la: 6, vern: [6] },
                { la: 7, vern: [7] },
                { la: 8, vern: [8] },
                { la: 9, vern: [9] },
                { la: 10, vern: [9, 10] },
                { la: 11, vern: [10] },
                { la: 12, vern: null, vlg: "Le Seigneur permit que cette épreuve lui arrivât, afin que sa patience servît d'exemple à la postérité, comme celle du saint homme Job." },
                { la: 13, vern: null, vlg: "Car, ayant toujours craint Dieu dès son enfance et gardé ses commandements, il ne murmura point contre Dieu de ce qu'il l'avait frappé de cécité," },
                { la: 14, vern: null, vlg: "mais il demeura inébranlable dans la crainte de Dieu, lui rendant grâces tous les jours de sa vie." },
                { la: 15, vern: null, vlg: "Et comme des rois insultaient au bienheureux Job, ainsi ses parents et ses proches se moquaient de sa vie, disant :" },
                { la: 16, vern: null, vlg: "« Où est ton espérance, pour laquelle tu faisais tant d'aumônes et de sépultures ? »" },
                { la: 17, vern: null, vlg: "Mais Tobie les reprenait, en disant : « Ne parlez pas ainsi :" },
                { la: 18, vern: null, vlg: "car nous sommes les enfants des saints, et nous attendons cette vie que Dieu donnera à ceux qui ne changent jamais la foi qu'ils lui doivent. »" },
                { la: 19, vern: [11] },
                { la: 20, vern: [12] },
                { la: 21, vern: [13] },
                { la: 22, vern: [14] },
                { la: 23, vern: [14] }
            ],
            3: [
                { la: 1, vern: [1] },
                { la: 2, vern: [2] },
                { la: 3, vern: [3] },
                { la: 4, vern: [4] },
                { la: 5, vern: [5] },
                { la: 6, vern: [6] },
                { la: 7, vern: [7] },
                { la: 8, vern: [8] },
                { la: 9, vern: [9] },
                { la: 10, vern: [10] },
                { la: 11, vern: [11] },
                { la: 12, vern: [12] },
                { la: 13, vern: [12] },
                { la: 14, vern: [12] },
                { la: 15, vern: [13] },
                { la: 16, vern: [14] },
                { la: 17, vern: [15] },
                { la: 18, vern: [15] },
                { la: 19, vern: [15] },
                { la: 20, vern: [15] },
                { la: 21, vern: [15] },
                { la: 22, vern: [15] },
                { la: 23, vern: [15] },
                { la: 24, vern: [16] },
                { la: 25, vern: [17] }
            ],
            4: [
                { la: 1, vern: [1, 2] },
                { la: 2, vern: [3] },
                { la: 3, vern: [3] },
                { la: 4, vern: [4] },
                { la: 5, vern: [4] },
                { la: 6, vern: [5, 6] },
                { la: 7, vern: [7] },
                { la: 8, vern: [8] },
                { la: 9, vern: [8] },
                { la: 10, vern: [9] },
                { la: 11, vern: [10] },
                { la: 12, vern: [11] },
                { la: 13, vern: [12] },
                { la: 14, vern: [13] },
                { la: 15, vern: [14] },
                { la: 16, vern: [15] },
                { la: 17, vern: [16] },
                { la: 18, vern: [17] },
                { la: 19, vern: [18] },
                { la: 20, vern: [19] },
                { la: 21, vern: [20] },
                { la: 22, vern: [20] },
                { la: 23, vern: [21] }
            ],
            5: [
                { la: 1, vern: [1] },
                { la: 2, vern: [2] },
                { la: 3, vern: [3] },
                { la: 4, vern: [3] },
                { la: 5, vern: [4] },
                { la: 6, vern: [5] },
                { la: 7, vern: [5] },
                { la: 8, vern: [6] },
                { la: 9, vern: [7, 8] },
                { la: 10, vern: [9] },
                { la: 11, vern: [10] },
                { la: 12, vern: [10] },
                { la: 13, vern: [10] },
                { la: 14, vern: [10] },
                { la: 15, vern: [10] },
                { la: 16, vern: [11, 12] },
                { la: 17, vern: [12] },
                { la: 18, vern: [13] },
                { la: 19, vern: [14] },
                { la: 20, vern: [15, 16] },
                { la: 21, vern: [17] },
                { la: 22, vern: [17] },
                { la: 23, vern: [18] },
                { la: 24, vern: [19] },
                { la: 25, vern: [20] },
                { la: 26, vern: [21] },
                { la: 27, vern: [22] },
                { la: 28, vern: [23] }
            ],
            6: [
                { la: 1, vern: [1] },
                { la: 2, vern: [2] },
                { la: 3, vern: [3] },
                { la: 4, vern: [4, 5] },
                { la: 5, vern: [5] },
                { la: 6, vern: [6] },
                { la: 7, vern: [7] },
                { la: 8, vern: [8] },
                { la: 9, vern: [9] },
                { la: 10, vern: [10, 11] },
                { la: 11, vern: [12] },
                { la: 12, vern: [13] },
                { la: 13, vern: [14] },
                { la: 14, vern: [14] },
                { la: 15, vern: [15] },
                { la: 16, vern: [15] },
                { la: 17, vern: [15, 16] },
                { la: 18, vern: [16, 17] },
                { la: 19, vern: [17] },
                { la: 20, vern: [18] },
                { la: 21, vern: [18] },
                { la: 22, vern: [19] }
            ],
            7: [
                { la: 1, vern: [1] },
                { la: 2, vern: [2] },
                { la: 3, vern: [3] },
                { la: 4, vern: [4] },
                { la: 5, vern: [5] },
                { la: 6, vern: [6] },
                { la: 7, vern: [7] },
                { la: 8, vern: [8] },
                { la: 9, vern: [9] },
                { la: 10, vern: [9] },
                { la: 11, vern: [10] },
                { la: 12, vern: [11] },
                { la: 13, vern: [12] },
                { la: 14, vern: [13] },
                { la: 15, vern: [14] },
                { la: 16, vern: [15] },
                { la: 17, vern: [16] },
                { la: 18, vern: [16] },
                { la: 19, vern: [16] },
                { la: 20, vern: [17] }
            ],
            8: [
                { la: 1, vern: [1] },
                { la: 2, vern: [2] },
                { la: 3, vern: [3] },
                { la: 4, vern: [3] },
                { la: 5, vern: [4] },
                { la: 6, vern: [5] },
                { la: 7, vern: [6] },
                { la: 8, vern: [7] },
                { la: 9, vern: [7] },
                { la: 10, vern: [8] },
                { la: 11, vern: [9] },
                { la: 12, vern: [10] },
                { la: 13, vern: [11] },
                { la: 14, vern: [12, 13] },
                { la: 15, vern: [14] },
                { la: 16, vern: [15] },
                { la: 17, vern: [16] },
                { la: 18, vern: [17] },
                { la: 19, vern: [18] },
                { la: 20, vern: [19] },
                { la: 21, vern: [19] },
                { la: 22, vern: [20] },
                { la: 23, vern: [20] },
                { la: 24, vern: [21] }
            ],
            9: [
                { la: 1, vern: [1] },
                { la: 2, vern: [2] },
                { la: 3, vern: [2] },
                { la: 4, vern: [2] },
                { la: 5, vern: [2] },
                { la: 6, vern: [3] },
                { la: 7, vern: [4] },
                { la: 8, vern: [4] },
                { la: 9, vern: [5] },
                { la: 10, vern: [6] },
                { la: 11, vern: [6] },
                { la: 12, vern: [6] }
            ],
            10: [
                { la: 1, vern: [1] },
                { la: 2, vern: [2] },
                { la: 3, vern: [3] },
                { la: 4, vern: [4] },
                { la: 5, vern: [5] },
                { la: 6, vern: [6] },
                { la: 7, vern: [7] },
                { la: 8, vern: [8, 9] },
                { la: 9, vern: [10] },
                { la: 10, vern: [11] },
                { la: 11, vern: [12] },
                { la: 12, vern: [13] },
                { la: 13, vern: [14] }
            ],
            11: [
                { la: 1, vern: [1] },
                { la: 2, vern: [2] },
                { la: 3, vern: [3] },
                { la: 4, vern: [4] },
                { la: 5, vern: [5] },
                { la: 6, vern: [6] },
                { la: 7, vern: [7] },
                { la: 8, vern: [8] },
                { la: 9, vern: [9] },
                { la: 10, vern: [10] },
                { la: 11, vern: [11] },
                { la: 12, vern: [11] },
                { la: 13, vern: [12] },
                { la: 14, vern: [13] },
                { la: 15, vern: [14, 15] },
                { la: 16, vern: [16] },
                { la: 17, vern: [17] },
                { la: 18, vern: [18] },
                { la: 19, vern: [18] },
                { la: 20, vern: [19] },
                { la: 21, vern: [19] }
            ],
            12: [
                { la: 1, vern: [1] },
                { la: 2, vern: [2] },
                { la: 3, vern: [3] },
                { la: 4, vern: [4] },
                { la: 5, vern: [5] },
                { la: 6, vern: [6] },
                { la: 7, vern: [7] },
                { la: 8, vern: [8] },
                { la: 9, vern: [9] },
                { la: 10, vern: [10] },
                { la: 11, vern: [11] },
                { la: 12, vern: [12] },
                { la: 13, vern: [13] },
                { la: 14, vern: [14] },
                { la: 15, vern: [15] },
                { la: 16, vern: [16] },
                { la: 17, vern: [17] },
                { la: 18, vern: [18] },
                { la: 19, vern: [19] },
                { la: 20, vern: [20] },
                { la: 21, vern: [21] },
                { la: 22, vern: [22] }
            ],
            13: [
                { la: 1, vern: [1] },
                { la: 2, vern: [2] },
                { la: 3, vern: [3] },
                { la: 4, vern: [4] },
                { la: 5, vern: [5] },
                { la: 6, vern: [6] },
                { la: 7, vern: [6] },
                { la: 8, vern: [7] },
                { la: 9, vern: [8] },
                { la: 10, vern: [9] },
                { la: 11, vern: [10] },
                { la: 12, vern: [11] },
                { la: 13, vern: [11] },
                { la: 14, vern: [12] },
                { la: 15, vern: [13] },
                { la: 16, vern: [13] },
                { la: 17, vern: [14] },
                { la: 18, vern: [14] },
                { la: 19, vern: [15] },
                { la: 20, vern: [16] },
                { la: 21, vern: [16] },
                { la: 22, vern: [17] },
                { la: 23, vern: [18] }
            ],
            14: [
                { la: 1, vern: [1] },
                { la: 2, vern: [2] },
                { la: 3, vern: [3] },
                { la: 4, vern: [4] },
                { la: 5, vern: [5] },
                { la: 6, vern: [6] },
                { la: 7, vern: [7] },
                { la: 8, vern: [8] },
                { la: 9, vern: [9] },
                { la: 10, vern: [10] },
                { la: 11, vern: [11] },
                { la: 12, vern: [11] },
                { la: 13, vern: [12] },
                { la: 14, vern: [12] },
                { la: 15, vern: [13] },
                { la: 16, vern: [14] },
                { la: 17, vern: [14] }
            ]
        }
    }
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
