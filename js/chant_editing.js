
// --- Editorial / GABC Splicing Logic (Ported from propers.js) ---

var regexGabcNote = /-?[a-mA-M]([oOwWvVrRsS]*)[xy#~\+><_\.'012345]*(?=(?:\[[^\]]*\]?)*)/;

function spliceGabc(splices, gabc) {
    splices.forEach(function (splice) {
        gabc = gabc.slice(0, splice.index) + (splice.addString || '') + gabc.slice(splice.index + splice.removeLen);
    });
    return gabc;
}

function getSpliceForPart(part) {
    // Simplified context for mobile_propers
    var selPart = window.selPropers && window.selPropers[part];
    if (!selPart) return [];

    var style = (selPart.style || '');
    // Basic check for alleluias/psalm tones
    var isAlleluia = part === 'alleluia' || (part.match(/^graduale/) && /allelu[ij]a/i.test(selPart.text));

    if ((isAlleluia && style.match(/^psalm-tone(1|-sal)$/)) ||
        (!isAlleluia && style.match(/^psalm-tone/))) {
        return [];
    }

    // Try localStorage for stored splices
    // We use a simplified keying strategy if IDs are not fully available or 'part' based
    var id = getChantId(part);
    var currentSplice = localStorage[part + (id || '') + 'Splice'];

    if (!currentSplice) {
        // Try legacy hash lookup if needed, or default empty
        currentSplice = null;
    }

    currentSplice = (currentSplice && currentSplice.split) ? currentSplice.replace(/&/g, ' ').split('|') : [];
    return currentSplice.map(function (s) {
        var a = s.split('/');
        return { index: parseInt(a[0]), removeLen: parseInt(a[1]), addString: a[2] };
    });
}

function addSpliceToHash(part, splices) {
    var currentSplice = getSpliceForPart(part);
    splices = currentSplice.concat(splices);
    splices = splices.map(function (t) {
        return [t.index, t.removeLen, t.addString || ''].join('/');
    }).join('|').replace(/ /g, '&');

    var id = getChantId(part);
    localStorage[part + (id || '') + 'Splice'] = splices;
}

function removeSplicesForPart(part) {
    var id = getChantId(part);
    delete localStorage[part + (id || '') + 'Splice'];
    // Re-render
    updateTextAndChantForPart(part);
}

function editorialChange(e) {
    var selPart = window.selPropers && window.selPropers[e.data.part];
    if (!selPart) return;

    // Use activeExsurge or fallback to what we have in the editor
    // In mobile_propers, we might store it on the element or rely on recreating it
    // But GABC modifications rely on exact indices, so we need the SOURCE gabc that was rendered.
    // In layoutChantFromGabc, we should arguably store the gabc used.

    var gabc = selPart.activeExsurge || $('#' + e.data.part + '-preview').data('rendered-gabc');
    // If not found, maybe fetch from editor (but editor might be raw)
    if (!gabc) gabc = $('.chant-item[part="' + e.data.part + '"] .gabc-editor').val();

    var noteProperties = e.data.noteProperties,
        note = noteProperties.note,
        splice = {
            index: 0,
            removeLen: 0
        };

    switch (e.data.action) {
        case 'toggleBarBefore':
        case 'toggleBarAfter':
            var bar = e.data.barBefore || e.data.barAfter;
            var neumeIndex = note.neume && note.neume.score.notations.indexOf(note.neume);
            if (bar) {
                var mapping = bar.mapping,
                    barIndex = mapping.notations.indexOf(bar);
                if (barIndex === 0) {
                    splice.index = mapping.sourceIndex;
                    splice.removeLen = mapping.source.length;
                } else {
                    splice.index = bar.sourceIndex;
                    splice.removeLen = 1;
                }
            } else if (e.data.action === 'toggleBarBefore') {
                if (neumeIndex) {
                    var previousNeume = note.neume.score.notations[neumeIndex - 1];
                    if (previousNeume.constructor == exsurge.TextOnly) {
                        splice.addString = ',';
                        splice.index = previousNeume.mapping.sourceIndex + previousNeume.mapping.source.length - 1;
                        break;
                    }
                }
                splice.index = (note.neume || note).mapping.sourceIndex;
                splice.addString = '(,) ';
            } else {
                if (e.data.after == 'note') {
                    var notes = note.neume.mapping.notations.reduce(function (a, b) { return (a.concat(b.notes)) }, []);
                    var noteIndex = notes.indexOf(note);
                    if (noteIndex && notes[++noteIndex]) {
                        splice.index = notes[noteIndex].sourceIndex;
                        splice.addString = ',';
                    }
                    break;
                }
                if (neumeIndex) {
                    var nextNeume = note.neume.score.notations[neumeIndex + 1];
                    var efNextNeume = nextNeume.isAccidental ? note.neume.score.notations[neumeIndex + 2] : nextNeume;
                    if (efNextNeume.constructor == exsurge.TextOnly) {
                        splice.addString = ',';
                        splice.index = nextNeume.mapping.sourceIndex + nextNeume.mapping.source.length - 1;
                        break;
                    } else if (!efNextNeume.hasLyrics()) {
                        splice.addString = ',';
                        splice.index = nextNeume.sourceIndex || nextNeume.notes[0].sourceIndex;
                        break;
                    }
                }
                splice.index = (note.neume || note).mapping.sourceIndex + (note.neume || note).mapping.source.length;
                splice.addString = ' (,) ';
            }
            break;
        case 'addCarryOverBefore':
        case 'addCarryOverAfter':
            var bar = e.data.barBefore || e.data.barAfter;
            if (bar) {
                var mapping = bar.mapping,
                    barIndex = mapping.notations.indexOf(bar);
                if (barIndex === 0) {
                    var mappings = bar.score.mappings,
                        index = mappings.indexOf(mapping) - 1,
                        beforeBar = mappings[index];
                    while (index >= 0 && beforeBar.notations.length == 1 && beforeBar.notations[0].constructor == exsurge.TextOnly) {
                        beforeBar = mappings[--index] || mappings[0];
                    }
                    splice.index = beforeBar.sourceIndex + beforeBar.source.length - 1;
                } else {
                    var prevIndex = mapping.notations[barIndex - 1].notes.slice(-1)[0].sourceIndex,
                        substring = mapping.source.slice(prevIndex - mapping.sourceIndex),
                        offset = Math.min(bar.sourceIndex - prevIndex, substring.match(/\s|\/|$/).index)
                    splice.index = prevIndex + offset;
                }
                splice.addString = '[ob:0;6mm]';
            }
            break;
        case 'removePunctum':
            splice.index = note.sourceIndex;
            var match = gabc.slice(splice.index).match(regexGabcNote);
            if (match) {
                splice.removeLen = match[0].length;
                if (match[1].length > 1) {
                    // if it is a repeated virga, etc. just remove one of the repeat characters:
                    splice.removeLen = 1;
                    splice.index++;
                }
            }
            else splice.removeLen = 0;
            break;
        case 'removeEpisema':
            if (noteProperties.torculusNotes && noteProperties.torculusNotes.length) {
                var index = noteProperties.torculusNotes[0].sourceIndex,
                    index2 = noteProperties.torculusNotes[2].sourceIndex,
                    match = gabc.slice(index2).match(regexGabcNote);
                if (match) {
                    var sub = gabc.slice(index, index2 + match[0].length),
                        regex = /_+/g;
                    splice = [];
                    while (match = regex.exec(sub)) {
                        splice.unshift({
                            index: index + match.index,
                            removeLen: match[0].length
                        });
                    }
                }
            } else {
                splice.index = gabc.indexOf('_', note.sourceIndex);
                if (splice.index >= 0) splice.removeLen = 1;
                else splice.index = 0;
            }
            break;
        case 'torculus1':
        case 'torculus2':
        case 'torculus3':
        case 'torculus12':
            if (noteProperties.torculusNotes) {
                var index1 = noteProperties.torculusNotes[1].sourceIndex,
                    index2 = noteProperties.torculusNotes[2].sourceIndex,
                    match = [
                        gabc.slice(index1).match(regexGabcNote),
                        gabc.slice(index2).match(regexGabcNote)
                    ];
                if (match[0] || match[1]) {
                    var sub = [
                        match[0] && gabc.slice(index1, index1 + match[0][0].length),
                        match[1] && gabc.slice(index2, index2 + match[1][0].length)
                    ],
                        regex = /_+/;
                    splice = [];
                    for (var i = 1; i >= 0; --i) {
                        var s = sub[i];
                        if (!s) continue;
                        if (match = regex.exec(s)) {
                            splice.push({
                                index: noteProperties.torculusNotes[i + 1].sourceIndex + match.index,
                                removeLen: match[0].length
                            });
                            if (i < 1) index2 -= match[0].length;
                        }
                    }
                    switch (e.data.action) {
                        case 'torculus2':
                        case 'torculus12':
                            splice.push({
                                index: index1 + 1,
                                removeLen: 0,
                                addString: (e.data.action === 'torculus2') ? '_' : '__'
                            });
                            break;
                        case 'torculus1':
                            splice.push({
                                index: index1,
                                removeLen: 0,
                                addString: '_'
                            });
                            break;
                        case 'torculus3':
                            if (splice[0]) splice[0].removeLen--;
                            else splice.push({
                                index: index2 + 1,
                                removeLen: 0,
                                addString: '_'
                            });
                            break;
                    }
                }
            }
            break;
        case 'addMora':
        case 'addEpisema':
            splice.index = note.sourceIndex;
            var match = gabc.slice(splice.index).match(regexGabcNote);
            if (match) {
                splice.index += match[0].length;
            } else {
                return;
            }
            splice.addString = (e.data.action == 'addMora') ? '.' : '_';
            break;
        case 'removeMora':
            splice.index = gabc.indexOf('.', note.sourceIndex);
            if (splice.index >= 0) splice.removeLen = 1;
            else splice.index = 0;
            break;
        case 'removeQuilisma':
            splice.index = gabc.indexOf('w', note.sourceIndex);
            if (splice.index >= 0) splice.removeLen = 1;
            else splice.index = 0;
            break;
    }
    if (splice.constructor != [].constructor) splice = [splice];
    gabc = spliceGabc(splice, gabc);

    // UI Updates
    addSpliceToHash(e.data.part, splice);
    selPart.activeExsurge = gabc;

    // Update Editor
    var $card = $('.chant-item[part="' + e.data.part + '"]');
    var $txt = $card.find('.gabc-editor');
    $txt.val(gabc);

    // Re-render
    layoutChantFromGabc(e.data.part, gabc);

    // Hide toolbars
    removeChantContextMenus();
}
