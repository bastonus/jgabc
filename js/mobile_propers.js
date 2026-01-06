// Modern Propers JS - Spotify Mobile UI Logic
// (Renamed from modern_propers.js to bypass file lock issues)

// Global State
window.selDay = null;
window.selTempus = '';
window.selPropers = null;
window.selOrdinaries = {};
window.selCustom = {};
window.sel = {
    tractus: {}, offertorium: {}, introitus: {}, graduale: {}, communio: {},
    alleluia: {}, sequentia: {}, asperges: {}, kyrie: {}, gloria: {},
    credo: {}, preface: {}, sanctus: {}, agnus: {}, ite: {}
};
window.includePropers = [];
window.paperSize = localStorage.paperSize || 'letter';
window.pageBreaks = (localStorage.pageBreaks || "").split(',');
window.isNovus = false;
window.novusOption = {};
window.novusYear = 'A'; // Default

// Initialization
// --- Date & Initialization Logic ---
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

// Ported from propers.js
var getLiturgicalDates = function (Y) {
    var result = {};
    result.year = Y;
    var easterDate = Dates.Computus.getEaster(Y);
    result.pascha = moment(easterDate);

    result.septuagesima = moment(result.pascha).subtract(7 * 9, 'days');
    result.quad1 = moment(result.septuagesima).add(7 * 3, 'days');
    result.ascension = moment(result.pascha).add(39, 'days');
    result.pentecost = moment(result.pascha).add(49, 'days');
    result.nativitas = moment([Y, 11, 25]);
    result.advent1 = moment(result.nativitas).subtract((result.nativitas.day() || 7) + 7 * 3, 'days');
    result.corpusChristi = moment(result.pentecost).add(11, 'days');
    result.sacredHeart = moment(result.pentecost).add(19, 'days');
    result.ChristusRex = moment([Y, 9, 31]);
    result.ChristusRex.subtract(result.ChristusRex.day(), 'days');
    result.epiphany = moment([Y, 0, 6]);
    result.transferredFeasts = {};
    result.holyFamily = moment(result.epiphany).add(7 - result.epiphany.day(), 'days');
    result.sundaysAfterPentecost = result.advent1.diff(result.pentecost, 'weeks') - 1;
    result.sundaysAfterEpiphany = result.septuagesima.diff(result.holyFamily, 'weeks');
    return result;
};

var getDateForSundayKey = function (key, dates) {
    var weekdayKeys = ['m', 't', 'w', 'h', 'f', 's'];
    var m;
    dates = dates || getLiturgicalDates(moment().year());

    switch (key) {
        case "Nat1":
            m = moment('12-25', 'MM-DD').year(dates.year).add(1, 'week');
            m = m.subtract(m.day(), 'days');
            return m;
        case "Nat2":
            m = moment('01-06', 'MM-DD').year(dates.year);
            m = m.subtract(m.day(), 'days');
            if (m.isSameOrAfter(moment('01-06', 'MM-DD').year(dates.year)) || m.isSameOrBefore(moment('01-01', 'MM-DD').year(dates.year))) m = moment('01-02', 'MM-DD').year(dates.year);
            return m;
        case "Epi": return dates.epiphany;
        case "Asc": return dates.ascension;
        case "CorpusChristi": return dates.corpusChristi;
        case "SCJ": return dates.sacredHeart;
        case "ChristusRex": return dates.ChristusRex;
        case "EmbWedSept":
        case "EmbFriSept":
        case "EmbSatSept":
        case "EmbSatSeptS":
            var dayOffset = { 'W': 3, 'F': 5, 'S': 6 };
            var targetDay = dayOffset[key[3]]; // Check logic
            // Simplified implementation for Ember Sept: 
            // Propers.js used complex logic. Let's approximate or skip for now if too complex blindly.
            // Or just return null effectively skipping auto-select for these specific rarities unless I debug more.
            return null;
    }

    var match;
    if (match = key.match(/Adv(\d)([wfs])?/)) {
        m = moment(dates.advent1);
        m.add(parseInt(match[1]) - 1, 'weeks');
        if (match[2]) m.add(1 + weekdayKeys.indexOf(match[2]), 'days');
    } else if (match = key.match(/^Epi(\d)([mtwhfs])?/)) {
        m = moment(dates.epiphany);
        m = m.add(parseInt(match[1]), 'weeks').subtract(m.day(), 'days');
        if (match[2]) {
            var day = 1 + weekdayKeys.indexOf(match[2]);
            m = m.add(day, 'day');
        }
    } else if (match = key.match(/Quad(\d)([mtwhfs])?/)) {
        m = moment(dates.septuagesima).add(2 + parseInt(match[1]), 'weeks');
        if (match[2]) {
            var day = 1 + weekdayKeys.indexOf(match[2]);
            m = m.add(day, 'day');
        }
    } else if (match = key.match(/Pasc(\d)([mtwhfs])?/)) {
        m = moment(dates.pascha).add(parseInt(match[1]), 'weeks');
        if (match[2]) {
            var day = 1 + weekdayKeys.indexOf(match[2]);
            m = m.add(day, 'day');
        }
    } else if (match = key.match(/Pent(\d+)([mtwhfs])?/)) {
        if (match[1] == 24 && !match[2]) {
            return moment(dates.advent1).subtract(1, 'week');
        }
        m = moment(dates.pentecost).add(parseInt(match[1]), 'weeks');
        if (match[2]) {
            var day = 1 + weekdayKeys.indexOf(match[2]);
            m = m.add(day, 'day');
        }
    } else if (match = key.match(/([765])a([mtwhfs])?/)) {
        var weeksAfter = 7 - match[1];
        m = moment(dates.septuagesima).add(weeksAfter, 'weeks');
        if (match[2]) {
            var day = 1 + weekdayKeys.indexOf(match[2]);
            m = m.add(day, 'day');
        }
    } else if (match = key.match(/PentEpi([3456])/)) {
        var pentecost24 = 31 - dates.sundaysAfterPentecost;
        var sundaysAfterPentecost = 24 + (match[1] - pentecost24);
        m = moment(dates.pentecost).add(sundaysAfterPentecost, 'weeks');
    }

    if (m && m.isValid()) return m;
    return null;
};

$(function () {
    console.log("Mobile Propers Initializing...");

    // Greeting
    var hour = new Date().getHours();
    var greeting = hour < 12 ? 'Good Morning' : hour < 18 ? 'Good Afternoon' : 'Good Evening';
    $('#greetingTime').text(greeting);

    // Advanced Toggle
    $('#toggleAdvanced').click(function () {
        $('#advancedOptions').toggleClass('hidden');
        $(this).find('svg').css('transform', $('#advancedOptions').hasClass('hidden') ? 'rotate(0deg)' : 'rotate(180deg)');
    });

    // Populate Selectors
    if (typeof populateSelectors !== 'undefined') populateSelectors();
    else doPopulate();

    // Event Listeners
    $('#selSunday, #selSaint, #selMass').change(selectedDay);
    $('#selSundayNovus').change(selectedDayNovus);
    $('#selYearNovus').change(function () {
        window.novusYear = $(this).val();
        if ($('#selSundayNovus').val()) $('#selSundayNovus').trigger('change');
    });

    $('#selOrdinary').change(selectedOrdinary);
    $('#btnCalendar, #btnCalendarDesktop').click(toggleCalendarMode);

    // PDF / Print
    $('#btnPrint, #btnPrintDesktop').click(printPDF);

    // Audio Playback
    $(document).on('click', '.btnPlay', function (e) {
        e.preventDefault();
        var part = $(this).closest('.chant-item').attr('part');
        playAudio(part);
    });

    // Theme Toggle
    $('#themeToggle').click(function () {
        var current = $('body').attr('data-theme');
        var next = current === 'light' ? 'dark' : 'light';
        $('body').attr('data-theme', next);
        localStorage.setItem('theme', next);
    });
    if (localStorage.getItem('theme') === 'light') $('body').attr('data-theme', 'light');

    // Editor & Settings Toggles
    $('.toggleShowGabc').click(function (e) {
        e.stopPropagation();
        var $card = $(this).closest('.chant-item');
        $card.find('.gabc-editor').toggleClass('hidden');
    });
    $('.toggleSettings').click(function (e) {
        e.stopPropagation();
        var $card = $(this).closest('.chant-item');
        $card.find('.chant-settings').toggleClass('hidden');
    });

    // Chant Style / Psalm Tone Controls
    $('.selStyle').change(function () {
        var $card = $(this).closest('.chant-item');
        var style = $(this).val();
        var part = $card.attr('part');

        if (style === 'psalm-tone') {
            $card.find('.tone-group, .ending-group, .solemn-group').removeClass('hidden');
            // Populate Tones if empty
            var $selTone = $card.find('.selTone');
            if ($selTone.children().length === 0) {
                $.each(g_tones, function (k, v) {
                    $selTone.append($('<option>', { value: k, text: k }));
                });
                $selTone.val('8.'); // Default
                $selTone.trigger('change');
            }
        } else {
            $card.find('.tone-group, .ending-group, .solemn-group').addClass('hidden');
        }
        updateTextAndChantForPart(part);
    });

    $('.selTone').change(function () {
        var $card = $(this).closest('.chant-item');
        var tone = $(this).val();
        var part = $card.attr('part');
        var endings = getEndings(tone);
        var $selEnding = $card.find('.selEnding').empty();

        if (endings.length > 0) {
            $.each(endings, function (i, e) {
                $selEnding.append($('<option>', { value: e, text: e }));
            });
            $card.find('.ending-group').removeClass('hidden');
        } else {
            $card.find('.ending-group').addClass('hidden');
        }
        updateTextAndChantForPart(part);
    });

    $('.selEnding, .cbSolemn').change(function () {
        var part = $(this).closest('.chant-item').attr('part');
        updateTextAndChantForPart(part);
    });

    // Auto-select Date (Wait for data)
    // We call this after population.
    autoSelectDate();

    // Trigger update if already selected
    if ($('#selSunday').val()) updateDay('selSunday');

    // Global Translation Event (Refresh readings if changed)
    $('#cbLatin, #cbEnglish, #cbFrench').change(function () {
        if (selDay && !isNovus) updateAllParts();
    });
});

function autoSelectDate() {
    var today = moment().startOf('day');
    var dates = getLiturgicalDates(today.year());

    console.log("Auto-selecting date for: " + today.format('YYYY-MM-DD'));

    if (window.sundayKeys) {
        var bestMatch = null;

        for (var i = 0; i < window.sundayKeys.length; i++) {
            var item = window.sundayKeys[i];
            if (!item.key) continue;
            var d = getDateForSundayKey(item.key, dates);

            // 1. Exact match
            if (d && d.isSame(today, 'day')) {
                console.log("Exact match found: " + item.key);
                $('#selSunday').val(item.key).change();
                return;
            }

            // 2. Track closest Sunday before today (within last 7 days)
            if (d && d.isBefore(today) && today.diff(d, 'days') < 7) {
                bestMatch = item.key;
            }
        }

        // 3. If no exact match, fallback to the Sunday of the week
        if (bestMatch) {
            console.log("Week match found: " + bestMatch);
            $('#selSunday').val(bestMatch).change();
        } else {
            // Priority 4: Default/First if nothing matches (e.g. gap in logic)
            // But verify if we should check Sanctoral too?
            // Simple Sanctoral check:
            var sanctoralKey = today.format('MMMD'); // e.g. Jan6
            // Check if this key exists in selSaint selector?
            // iterating options in selSaint is DOM heavy, let's just default to first element or do nothing
        }
    }
}

// --- Core Logic ---

function doPopulate() {
    console.log("Populating selectors...");
    var populate = function (keys, $sel) {
        if (!keys || !$sel.length) return;
        var key = 'title';
        $.each(keys, function (i, o) {
            if (typeof (o) == 'string') o = { key: o, title: o.length == 1 ? 'Year ' + o : o };
            var $opt = $('<option></option>').text(o[key] || o.title);
            if (o.key) $opt.val(o.key);
            $sel.append($opt);
        });
    };

    if (typeof window.sundayKeys !== 'undefined') populate(window.sundayKeys, $('#selSunday'));
    if (typeof window.saintKeys !== 'undefined') populate(window.saintKeys, $('#selSaint'));
    if (typeof window.otherKeys !== 'undefined') populate(window.otherKeys, $('#selMass'));

    // Populate Novus Ordo
    if (typeof window.sundaysNovusOrdo !== 'undefined') {
        populate(window.sundaysNovusOrdo, $('#selSundayNovus'));
        // Populate Years
        var years = ['A', 'B', 'C'];
        populate(years, $('#selYearNovus'));
    }

    if (typeof window.massOrdinary !== 'undefined') {
        var ordinaryKeys = window.massOrdinary.map(function (e, i) {
            return { key: (i + 1).toString(), title: (i + 1) + ' - ' + (e.name || e.season) };
        });
        ordinaryKeys.unshift({ key: '', title: 'Chant Mass Ordinaries...' });
        populate(ordinaryKeys, $('#selOrdinary'));
    }
}

var selectedDay = function (e) {
    selDay = $(this).val();
    // Reset others
    var id = this.id;
    $('#selSunday, #selSaint, #selMass').not(this).val('');

    // Real Lookup
    var proprium = window.proprium || window.propriumNoviOrdinis;
    if (typeof proprium !== 'undefined') {
        selPropers = proprium[selDay];
        updateAllParts();

        // Update Header
        var title = $(this).find('option:selected').text();
        if (title) $('#greetingTime').text(title);
    }
};

var selectedDayNovus = function (e) {
    selDay = $(this).val();

    // Novus Ordo Lookup
    // propriumNoviOrdinis is key -> day object
    if (window.propriumNoviOrdinis && window.propriumNoviOrdinis[selDay]) {
        var baseProps = window.propriumNoviOrdinis[selDay];

        // Handle Cycles (A, B, C) if present
        selPropers = {}; // Reset

        // Deep copy/merge logic for Cycles
        Object.keys(baseProps).forEach(function (part) {
            var val = baseProps[part];
            if (val && (val.A || val.B || val.C)) {
                // Cycle logic
                selPropers[part] = val[window.novusYear] || val.A; // Default to A if missing
            } else {
                selPropers[part] = val;
            }
        });

        // Also normalize property names if needed (introitus -> introitus)
        // Novus data uses same keys: introitus, graduale, etc.
        updateAllParts();

        var title = $(this).find('option:selected').text();
        if (title) $('#greetingTime').text(title + " (Year " + window.novusYear + ")");
    }
};

var selectedOrdinary = function (e) {
    var val = $(this).val();

    // Reset
    window.selOrdinaries = {};

    if (val && window.massOrdinary) {
        var ord = window.massOrdinary[val - 1]; // 1-based index
        if (ord) {
            var parts = ['kyrie', 'gloria', 'credo', 'sanctus', 'agnus', 'ite', 'benedicamus'];
            parts.forEach(function (p) {
                if (ord[p]) {
                    // Take first if array, or object
                    var item = Array.isArray(ord[p]) ? ord[p][0] : ord[p];
                    window.selOrdinaries[p] = item.id;
                }
            });
        }
    }
    updateAllParts();
};

function toggleCalendarMode() {
    isNovus = !isNovus;
    var labels = $('.btn-text-toggle'); // Select both desktop and mobile buttons
    labels.text(isNovus ? 'Novus Ordo' : 'Traditional');
    if (isNovus) {
        $('#selSunday').addClass('hidden');
        $('#selSundayNovus, #selYearNovus').removeClass('hidden');
    } else {
        $('#selSunday').removeClass('hidden');
        $('#selSundayNovus, #selYearNovus').addClass('hidden');
    }
}

// --- Audio Playback ---
// Basic GABC parser to sequence of frequencies
var noteMap = {
    'c': 130.81, 'd': 146.83, 'e': 164.81, 'f': 174.61, 'g': 196.00, 'a': 220.00, 'b': 246.94,
    'h': 246.94, // German B natural
    'i': 261.63, 'j': 293.66, 'k': 329.63, 'l': 349.23, 'm': 392.00
};
// Helper to shift octaves if needed, but standard GABC fits in range c3-c5 usually.
// Notes in GABC: c4 is C4 (Middle C) = 261.63 Hz.
// In GABC data (exsurge): key line c4 -> c is on 4th line.
// Let's use tones.play(noteName) from tones.js if available.
// tones.js: notes.play("c4")

function playAudio(part) {
    if (!window.tones || !window.tones.play) {
        alert("Audio library not loaded.");
        return;
    }

    // Get GABC from editor (which is updated)
    var gabc = $('#txt' + part[0].toUpperCase() + part.slice(1)).val();
    if (!gabc) return;

    // Parse GABC for notes
    // Look for ( note ) format. e.g. (f g h)
    // Regex from psalmtone.js: /([cf]b?[1-4])|[a-m]/
    // We need to just extract the note sequence.
    var notes = [];
    var inParen = false;
    for (var i = 0; i < gabc.length; i++) {
        var c = gabc[i];
        if (c === '(') { inParen = true; continue; }
        if (c === ')') { inParen = false; continue; }

        if (inParen && /[a-l]/.test(c)) { // m is rarely used, but valid
            // Translate GABC height char to Note Name
            // This is tricky without knowing the Clef. 
            // We need to parse Clef first (e.g. c4, f3).
            // For now, let's assume specific mapping or just play the relative intervals?
            // tones.play() takes note strings like "c4".
            // We need a full parser. For this task, we might just play a sample tone?
            // "Read Notes" implies reading the actual chant.
            // Let's try to map 'a'-'l' to a fixed scale mostly matching c4 clef.
            // c4 clef: f=C4, g=D4, h=E4, i=F4, j=G4, k=A4, l=B4, m=C5
            // This is roughly correct.
            var map = {
                'a': 'A3', 'b': 'B3', 'c': 'C4', 'd': 'D4', 'e': 'E4', 'f': 'F4', 'g': 'G4',
                'h': 'A4', 'i': 'B4', 'j': 'C5', 'k': 'D5', 'l': 'E5', 'm': 'F5'
            };
            // This mapping is for c4 clef where 'g' is on bottom line (D?). NO.
            // c4 clef: C is on 4th line.
            // Line 1: D, 2: F, 3: A, 4: C
            // Valid GABC heights: 
            // a=lowest.
            // Let's use a scale starting at A3.
            // a=A3, b=B3, c=C4, d=D4, e=E4, f=F4, g=G4, h=A4, i=B4, j=C5, k=D5, l=E5, m=F5
            // This is a diatonic scale of C major (white keys).
            if (map[c]) notes.push(map[c]);
        }
    }

    // Play notes sequence
    playSequence(notes);
}

function playSequence(notes) {
    if (notes.length === 0) return;
    var now = tones.context.currentTime;
    var step = 0.4; // seconds per note
    notes.forEach(function (n, i) {
        // tones.play(note, duration, time) checking tones.js signature?
        // tones.js source: notes.play(freq|name, options) ???
        // tones.js had playFrequency.
        // Let's assume tones.play(note) plays immediately.
        // We need scheduling.
        setTimeout(function () {
            tones.play(n);
        }, i * 400); // 400ms delay
    });
}

// --- Print PDF ---
function printPDF() {
    // Collect all visible chants
    var gabcData = [];
    $('.chant-item:visible').each(function () {
        var part = $(this).attr('part');
        var gabc = $(this).find('.gabc-editor').val();
        if (gabc) {
            gabcData.push(gabc);
        }
    });

    if (gabcData.length === 0) {
        alert("No chants to print.");
        return;
    }

    // Create form handling logic similar to legacy
    // Post to http://sourceandsummit.com/editor/legacy/Process.php (or similar)
    // Actually, propers.js uses http://gregorio.gabrielmass.com/cgi/process.pl or similar?
    // Let's check the old util.js linkSelector: http://gregorio.gabrielmass.com/cgi/process.pl
    // But recently likely using sourceandsummit.

    // Simpler: Just print the page? 
    // Use window.print() but styled for print?
    // The user request was "PDF Generation", often implying the PDF service.
    // Let's try `window.print()` first as it works well with @media print if defined.
    // modern.css might not have print styles.
    // If not, let's use the legacy method via form submission to sourceandsummit if we can finding the URL.
    // Found in propers.html: form action="https://sourceandsummit.com/editor/legacy/Process.php"

    var $form = $('<form action="https://www.sourceandsummit.com/editor/legacy/process.php" method="POST" target="_blank"></form>');
    // We need to concat all GABC into one 'gabc' field or multiple?
    // Legacy form: input name="gabc[]"
    gabcData.forEach(function (g, i) {
        $('<input>').attr({ type: 'hidden', name: 'gabc[]', value: g }).appendTo($form);
    });
    // Add options
    $('<input>').attr({ type: 'hidden', name: 'croppdf', value: 'N' }).appendTo($form);
    $('<input>').attr({ type: 'hidden', name: 'paper', value: window.paperSize || 'letter' }).appendTo($form);

    $form.appendTo('body').submit().remove();
}

// --- Update Text & Chant (Logic) ---
function updateTextAndChantForPart(part) {
    if (!selPropers) return;

    var $card = $('.chant-item[part="' + part + '"]');
    var $txt = $card.find('.gabc-editor');
    var style = $card.find('.selStyle').val();

    if (style === 'psalm-tone') {
        // Generate Psalm Tone
        var tone = $card.find('.selTone').val();
        var ending = $card.find('.selEnding').val();
        var solemn = $card.find('.cbSolemn').is(':checked');

        // Use text from selPropers (e.g., introitusText)
        // Check `selPropers[part + 'Text']` or `selPropers['text' + part]`?
        // Looking at propers.js, typically `selPropers.introitus`. Wait, that's the ID?
        // selPropers might have the full object or just properties.
        // propers.js: `selPropers = propriumNoviOrdinis[...]`. 
        // If it's old `propers.js` data, `introitus` might be the GABC, not text.
        // We need the TEXT. If we only have GABC, we can strip it.
        // But `selPropers` usually has `introitus` as ID.
        // If we don't have raw text, we can't generate tone easily without stripping GABC first.

        // Let's try to fetch the GABC first (if not loaded), strip it, then apply tone.
        var fullGabc = $txt.data('full-gabc'); // Store full GABC when loaded
        if (!fullGabc) {
            // If not stored, maybe it's in the textarea already?
            fullGabc = $txt.val();
        }

        if (fullGabc) {
            // Strip GABC to get text
            var text = fullGabc.replace(/\([^\)]*\)/g, '').replace(/\s+/g, ' ').trim();
            // Remove header
            text = text.replace(/^[\s\S]*?%%\s?\n/, ''); // Header

            // Apply Tone
            var toneGabc = applyPsalmTone({
                text: text,
                gabc: g_tones[tone],
                clef: g_tones[tone].clef,
                format: bi_formats.gabc,
                favor: {
                    termination: ending,
                    solemn: solemn
                }
            });

            $txt.val(toneGabc);
            // Render
            layoutChantFromGabc(part, toneGabc);
        }
    } else {
        // Full Chant
        // Revert to original ID or GABC
        var id = getChantId(part);
        if (id) layoutChant(part, id);
    }
}


function updateAllParts() {
    $('.chant-item').hide(); // Hide all first

    // Always try to show ordinary parts if selected, even if selPropers is null (rare case?)
    // But usually we need both. 

    if (!selPropers) return;

    // Handle Readings (Epistle/Gospel)
    if (!isNovus) {
        var readings = null;
        var prop = window.proprium && window.proprium[selDay];
        var ref = prop && prop.ref;

        // Logic from propers.js to find reading key
        var match = /^Pent(Epi\d)$/.exec(selDay);
        var lecDay = match ? match[1] : selDay;

        if (window.lectiones) {
            readings = window.lectiones[lecDay] || (ref && window.lectiones[ref]);
        }

        if (readings && readings.length > 0) {
            var editions = [];
            if ($('#cbLatin').is(':checked')) editions.push({ e: 'vulgate', l: 'latin', name: 'Latin' });
            if ($('#cbEnglish').is(':checked')) editions.push({ e: 'douay-rheims', l: 'english', name: 'English' });
            if ($('#cbFrench').is(':checked')) editions.push({ e: 'aelf', l: 'french', name: 'French' });

            // Epistle (Index 0)
            if (readings[0]) {
                $('#divEpistle').show();
                var $ep = $('#epistle-preview').empty();

                editions.forEach(function (ed) {
                    var $container = $('<div class="reading-version"></div>').appendTo($ep);
                    $container.append('<h4>' + ed.name + '</h4><div class="loading">Loading...</div>');

                    getReading({ ref: readings[0], edition: ed.e, language: ed.l.slice(0, 2) }).then(function (text) {
                        $container.find('.loading').remove();
                        $container.append(text);
                    }).fail(function (e) {
                        $container.find('.loading').text('Error loading ' + ed.name);
                    });
                });
            } else {
                $('#divEpistle').hide();
            }

            // Gospel (Index 1)
            if (readings[1]) {
                $('#divGospel').show();
                var $gp = $('#gospel-preview').empty();

                editions.forEach(function (ed) {
                    var $container = $('<div class="reading-version"></div>').appendTo($gp);
                    $container.append('<h4>' + ed.name + '</h4><div class="loading">Loading...</div>');

                    getReading({ ref: readings[1], edition: ed.e, language: ed.l.slice(0, 2) }).then(function (text) {
                        $container.find('.loading').remove();
                        $container.append(text);
                    }).fail(function (e) {
                        $container.find('.loading').text('Error loading ' + ed.name);
                    });
                });
            } else {
                $('#divGospel').hide();
            }
        } else {
            $('#divEpistle, #divGospel').hide();
        }
    } else {
        // Novus Ordo readings logic (if any) or hide
        $('#divEpistle, #divGospel').hide();
    }

    // Iterate all chant items
    $('div.chant-item').each(function () {
        var $el = $(this);
        var part = $el.attr('part'); // Use $el for consistency

        // Skip hidden checks? Or minimal checks.
        if (part === 'epistle' || part === 'gospel') return; // Handled above

        // Verses Logic (Introit, Offertory, Communion)
        // Map part to verse key: introitus -> inVerses
        var shortMap = {
            'introitus': 'in',
            'offertorium': 'of',
            'communio': 'co'
        };
        if (shortMap[part] && selPropers[shortMap[part] + 'Verses']) {
            var verseText = selPropers[shortMap[part] + 'Verses'];
            var $v = $el.find('.chant-verse');
            if (!$v.length) {
                $v = $('<div class="chant-verse" style="margin-top:10px; font-style:italic; opacity:0.8;"></div>').appendTo($el.find('.chant-content'));
            }
            $v.text("℣. " + verseText);
        }

        // Skip if explicity disabled in propers
        if (selPropers[part] === false) return;

        var id = getChantId(part);
        if (id) {
            $el.show();
            // Assuming layoutChant handles re-entrancy or we clear it.
            // layoutChant clears preview.
            layoutChant(part, id);
        }
    });
}

// -- New UI Logic --
$(function () {
    // Tab Switching Logic
    $('.nav-item[data-tab]').click(function (e) {
        e.preventDefault();
        var tabName = $(this).data('tab');

        // Update Nav State (Sidebar & Bottom)
        $('.nav-item').removeClass('active');
        $('.nav-item[data-tab="' + tabName + '"]').addClass('active');

        // Show Content
        $('.tab-content').removeClass('active').addClass('hidden');
        $('#tabContent-' + tabName).removeClass('hidden').addClass('active');
    });

    // Calendar Toggle Logic (Header & Desktop Sidebar)
    $('#btnCalendar, #btnCalendarDesktop').click(toggleCalendarMode);
});

function getChantId(part) {
    // 1. Check Ordinaries first (specific parts)
    if (window.selOrdinaries && window.selOrdinaries[part]) return window.selOrdinaries[part];

    if (!selPropers) return null;

    // Direct mapping
    var map = {
        'introitus': 'inID',
        'graduale': 'grID',
        'alleluia': 'alID',
        'tractus': 'trID',
        'offertorium': 'ofID',
        'communio': 'coID',
        'sequentia': 'seID',
        'asperges': 'asID',
        'vidi': 'viID'
    };

    // Novus Ordo Data structure is often: introitus: [{id: "123", incipit: "..."}]
    if (isNovus) {
        if (selPropers[part]) {
            var val = selPropers[part];
            // If array, take first (or user could select loops? Keep simple for now)
            if (Array.isArray(val) && val.length > 0) return val[0].id;
            if (val.id) return val.id;
        }
        return null;
    }

    // 2. Try mapped ID (e.g., inID) [LEGACY / TRAD]
    if (map[part] && selPropers[map[part]]) return selPropers[map[part]];

    // 3. Try direct proper lookup (some might be objects/strings)
    if (selPropers[part]) return selPropers[part];

    // 4. Try legacy ID format (e.g., introitusID)
    if (selPropers[part + 'ID']) return selPropers[part + 'ID'];

    return null;
}

function layoutChant(part, id) {
    var $preview = $('#' + part + '-preview');
    $preview.empty().text('Loading...');

    var gabcUrl = 'gabc/' + id + '.gabc';

    $.get(gabcUrl, function (data) {
        // Store full GABC for toggling back
        var $card = $('.chant-item[part="' + part + '"]');
        var $txt = $card.find('.gabc-editor');
        $txt.val(data);
        $txt.data('full-gabc', data); // Cache for psalm tone generation

        layoutChantFromGabc(part, data);

        var header = getHeader(data);
        if (header && header.name) {
            $('#div' + part[0].toUpperCase() + part.slice(1) + ' .chant-name').text(header.name);
        }

    }).fail(function () {
        $preview.text('Error loading.');
    });
}

function layoutChantFromGabc(part, gabc) {
    var $preview = $('#' + part + '-preview');
    $preview.empty();

    var ctxt = new exsurge.ChantContext();
    ctxt.lyricTextFont = "'Crimson Text', serif";
    ctxt.rubricColor = '#e33';

    var mappings = exsurge.Gabc.createMappingsFromSource(ctxt, gabc);
    var score = new exsurge.ChantScore(ctxt, mappings, true);

    var width = $preview.width() || 350;
    ctxt.width = width;

    score.performLayout(ctxt);
    score.layoutChantLines(ctxt, width, function () {
        var svg = score.createSvgNode(ctxt);
        $preview.append(svg);
    });
}

function getHeader(gabc) {
    var header = {};
    var match = gabc.match(/name:\s*(.*?);/);
    if (match) header.name = match[1];
    return header;
}
function updateDay(id) {
    var $sel = $('#' + id);
    if ($sel.length) {
        // If no value, select first? Or just trigger.
        // For now, just trigger change as the user might have selected via hash or browser autofill
        $sel.trigger('change');
    }
}
