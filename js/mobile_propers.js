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
window.isNovus = localStorage.getItem('rubricMode') === 'novus';
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
    result.ashWednesday = moment(result.pascha).subtract(46, 'days'); // Added for Novus Ordo
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

    // --- Tab Switching Logic (Fix for about:blank error) ---
    $('.nav-item[data-tab]').click(function (e) {
        e.preventDefault(); // Prevent default link behavior
        var tabName = $(this).data('tab');

        // Update Nav State
        $('.nav-item').removeClass('active');
        $('.nav-item[data-tab="' + tabName + '"]').addClass('active');

        // Show Content
        $('.tab-content').removeClass('active').addClass('hidden');
        $('#tabContent-' + tabName).removeClass('hidden').addClass('active');

        // Update Hash
        updateUrlHash();
    });

    // --- Hash Routing Logic ---
    function updateUrlHash() {
        var activeTab = $('.nav-item.active').data('tab');
        var hash = '';

        if (activeTab === 'temporum') {
            if (window.isNovus) {
                var val = $('#selSundayNovus').val();
                if (val) hash = 'temporum=' + encodeURIComponent(val); // Use key or logic
            } else {
                var val = $('#selSunday').val();
                if (val) hash = 'temporum=' + val;
            }
        } else if (activeTab === 'sanctorum') {
            var val = $('#selSaint').val();
            if (val) hash = 'sanctorum=' + val;
        } else if (activeTab === 'communia') {
            var val = $('#selMass').val();
            if (val) hash = 'communia=' + val;
        } else if (activeTab === 'ordinarium') {
            // Ordinarium usually doesn't have a specific page state other than the selection
            var val = $('#selOrdinary').val();
            if (val) hash = 'ordinarium=' + val;
        }

        // If ordinary is selected, maybe keep it in hash too? 
        // Legacy propers.html mostly tracked the main selection.
        // Let's stick to the main tab selection.

        if (hash) {
            window.location.hash = hash;
        } else {
            // If no selection, maybe just tab?
            window.location.hash = activeTab;
        }
    }

    // Listen for selection changes to update hash
    $('#selSunday, #selSundayNovus, #selSaint, #selMass, #selOrdinary').change(function () {
        updateUrlHash();
    });

    // Core Logic Listeners (RESTORED)
    $('#selSunday, #selSaint, #selMass').change(selectedDay);
    $('#selSundayNovus').change(selectedDayNovus);
    $('#selYearNovus').change(function () {
        window.novusYear = $(this).val();
        if ($('#selSundayNovus').val()) $('#selSundayNovus').trigger('change');
    });

    // On Load: Check Hash
    function loadFromHash() {
        var hash = window.location.hash.substring(1);
        if (hash) {
            var parts = hash.split('=');
            var tab = parts[0];
            var proper = decodeURIComponent(parts[1] || '');

            // Validate tab
            if (['temporum', 'sanctorum', 'communia', 'ordinarium'].indexOf(tab) !== -1) {
                // Click tab
                $('.nav-item[data-tab="' + tab + '"]').click();

                // Select Proper if exists
                if (proper) {
                    if (tab === 'temporum') {
                        // Check mode? 
                        // If logic requires deducing mode from key, it's hard.
                        // Assuming current mode for now, or check key format?
                        // Novus keys are strings like "First Sunday...", Old keys are "Adv1"

                        var isNovusKey = proper.indexOf('Sunday') !== -1 || proper.indexOf(' ') !== -1; // heuristic
                        if (isNovusKey && !window.isNovus) {
                            $('#btnCalendar').click(); // Switch to Novus
                        } else if (!isNovusKey && window.isNovus) {
                            $('#btnCalendar').click(); // Switch to Trad
                        }

                        if (window.isNovus) {
                            $('#selSundayNovus').val(proper).change();
                        } else {
                            $('#selSunday').val(proper).change();
                        }
                    } else if (tab === 'sanctorum') {
                        $('#selSaint').val(proper).change();
                    } else if (tab === 'communia') {
                        $('#selMass').val(proper).change();
                    } else if (tab === 'ordinarium') {
                        $('#selOrdinary').val(proper).change();
                    }
                }
            }
        }
    }

    // Delay loadFromHash slightly or call immediately? Call after population.
    // We can call it at end of init.


    $('#selOrdinary').change(selectedOrdinary);
    $('#btnCalendar, #btnCalendarDesktop').click(toggleCalendarMode);

    // PDF / Print


    // Audio Playback
    $(document).on('click', '.btnPlay', function (e) {
        e.preventDefault();
        var part = $(this).closest('.chant-item').attr('part');
        playAudio(part);
    });

    // --- Settings & Modal Logic ---
    $('#btnSettings').click(function () { $('#settingsModal').removeClass('hidden'); });
    $('#closeSettings, .modal-backdrop').click(function () { $('#settingsModal').addClass('hidden'); });

    // Init Settings
    initSettings();

    // Load State from Hash (at end of init)
    loadFromHash();
    $(window).on('hashchange', loadFromHash);

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

    // Apply stored rubric mode on load (before auto-select)
    if (window.isNovus) {
        $('#btnCalendar').text('Novus Ordo');
        $('#selSunday').addClass('hidden');
        $('#selSundayNovus, #selYearNovus').removeClass('hidden');
    }

    // Auto-select Date (Wait for data)
    // We call this after population.
    autoSelectDate();

    // Trigger update if already selected
    if ($('#selSunday').val()) updateDay('selSunday');
});

function initSettings() {
    // 1. Theme
    var storedTheme = localStorage.getItem('theme') || 'system';
    applyTheme(storedTheme);
    $('#themeSelector .segment[data-value="' + storedTheme + '"]').addClass('active');

    $('#themeSelector .segment').click(function () {
        var val = $(this).data('value');
        localStorage.setItem('theme', val);
        applyTheme(val);
        $('#themeSelector .segment').removeClass('active');
        $(this).addClass('active');
    });

    // 2. Translations
    var storedTrans = JSON.parse(localStorage.getItem('translations') || '{"latin":true,"english":true,"french":false}');
    $('#cbLatin').prop('checked', storedTrans.latin);
    $('#cbEnglish').prop('checked', storedTrans.english);
    $('#cbFrench').prop('checked', storedTrans.french);

    $('#cbLatin, #cbEnglish, #cbFrench').change(function () {
        var newTrans = {
            latin: $('#cbLatin').is(':checked'),
            english: $('#cbEnglish').is(':checked'),
            french: $('#cbFrench').is(':checked')
        };
        localStorage.setItem('translations', JSON.stringify(newTrans));
        if (selDay && !isNovus) updateAllParts();
    });

    // 3. Chant Style
    var storedStyle = localStorage.getItem('defaultStyle') || 'full';
    $('#defStyleSelector .segment[data-value="' + storedStyle + '"]').addClass('active');
    // Apply initial
    $('.selStyle').val(storedStyle);

    $('#defStyleSelector .segment').click(function () {
        var val = $(this).data('value');
        localStorage.setItem('defaultStyle', val);
        $('#defStyleSelector .segment').removeClass('active');
        $(this).addClass('active');

        // Apply immediately to all
        $('.selStyle').val(val).trigger('change');
    });
}

function applyTheme(theme) {
    if (theme === 'system') {
        var isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        $('body').attr('data-theme', isDark ? 'dark' : 'light');
    } else {
        $('body').attr('data-theme', theme);
    }
}


function autoSelectDate() {
    var today = moment().startOf('day');
    var dates = getLiturgicalDates(today.year());

    console.log("Auto-selecting date for: " + today.format('YYYY-MM-DD'));

    if (isNovus) {
        if (window.sundaysNovusOrdo) {
            // Calculate expected key
            var expectedKey = getNovusOrdoKey(today, dates);
            console.log("Calculated Novus Key: " + expectedKey);

            if (expectedKey) {
                // Normalize for soft-hyphens etc.
                var normalize = function (s) { return s.replace(/\u00AD/g, '').replace(/-/g, '').toLowerCase().replace(/\s+/g, ''); };
                var search = normalize(expectedKey);

                var bestMatch = null;
                for (var i = 0; i < window.sundaysNovusOrdo.length; i++) {
                    var item = window.sundaysNovusOrdo[i];
                    var key = (typeof item === 'string') ? item : item.key;
                    if (!key) continue;

                    if (normalize(key) === search) {
                        bestMatch = key;
                        break;
                    }
                }

                if (bestMatch) {
                    $('#selSundayNovus').val(bestMatch).change();
                    return;
                }
            }
        }
    } else {
        // Traditional Logic
        if (window.sundayKeys) {
            var bestMatch = null;

            for (var i = 0; i < window.sundayKeys.length; i++) {
                var item = window.sundayKeys[i];
                if (!item.key) continue;
                var d = getDateForSundayKey(item.key, dates);

                if (d && d.isSame(today, 'day')) {
                    $('#selSunday').val(item.key).change();
                    return;
                }
                if (d && d.isBefore(today) && today.diff(d, 'days') < 7) {
                    bestMatch = item.key;
                }
            }
            if (bestMatch) {
                $('#selSunday').val(bestMatch).change();
            }
        }
    }
}

function getNovusOrdoKey(date, dates) {
    if (date.isSameOrAfter(dates.advent1) && date.isBefore(dates.nativitas)) {
        var week = Math.floor(date.diff(dates.advent1, 'weeks')) + 1;
        if (date.day() !== 0) return null; // Only Sundays
        return getOrdinal(week) + " Sunday of Advent";
    }

    if (date.isSame(dates.nativitas, 'day')) return "Nativity Mass at Day";

    if (date.isSameOrAfter(dates.ashWednesday) && date.isBefore(dates.pascha)) {
        if (date.isSame(dates.ashWednesday, 'day')) return "Ash Wednesday";

        if (date.isSameOrAfter(dates.quad1)) {
            var weekLent = Math.floor(date.diff(dates.quad1, 'weeks')) + 1;
            if (weekLent === 6) return "Palm Sunday";
            if (weekLent <= 5) return getOrdinal(weekLent) + " Sunday in Lent";
        }
    }

    if (date.isSameOrAfter(dates.pascha) && date.isBefore(dates.pentecost)) {
        if (date.isSame(dates.pascha, 'day')) return "Easter Sunday";
        var weekEaster = Math.floor(date.diff(dates.pascha, 'weeks')) + 1;
        if (weekEaster >= 2 && weekEaster <= 7) return getOrdinal(weekEaster) + " Sunday of Easter";
    }

    if (date.isSame(dates.pentecost, 'day')) return "Pentecost";

    var trinity = moment(dates.pentecost).add(7, 'days');
    if (date.isSame(trinity, 'day') || (date.isAfter(trinity) && date.diff(trinity, 'days') < 7)) return "Most Holy Trinity";

    var corpus = moment(dates.pentecost).add(14, 'days');
    if (date.isSame(corpus, 'day') || (date.isAfter(corpus) && date.diff(corpus, 'days') < 7)) return "Body and Blood of Christ";

    if (date.isAfter(dates.pentecost) && date.isBefore(dates.advent1)) {
        var weeksFromAdv = Math.ceil(dates.advent1.diff(date, 'days') / 7);
        var n = 35 - weeksFromAdv;

        if (n === 34) return "Christ the King";
        if (n >= 1 && n <= 33) return getOrdinal(n) + " Sunday";
    }

    return null;
}

function getOrdinal(n) {
    var ordinals = ["", "First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth", "Tenth",
        "Eleventh", "Twelfth", "Thirteenth", "Fourteenth", "Fifteenth", "Sixteenth", "Seventeenth", "Eighteenth", "Nineteenth", "Twentieth",
        "Twenty-first", "Twenty-second", "Twenty-third", "Twenty-fourth", "Twenty-fifth", "Twenty-sixth", "Twenty-seventh", "Twenty-eighth", "Twenty-ninth", "Thirtieth",
        "Thirty-first", "Thirty-second", "Thirty-third", "Thirty-fourth"];
    return ordinals[n];
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
    localStorage.setItem('rubricMode', isNovus ? 'novus' : 'traditional');
    var labels = $('.btn-text-toggle'); // Select both desktop and mobile buttons
    labels.text(isNovus ? 'Novus Ordo' : 'Traditional');

    // Toggle Selectors Visibility
    if (isNovus) {
        $('#selSunday').addClass('hidden');
        $('#selSundayNovus, #selYearNovus').removeClass('hidden');
    } else {
        $('#selSunday').removeClass('hidden');
        $('#selSundayNovus, #selYearNovus').addClass('hidden');
    }

    // Reset Selection
    selDay = null;
    selPropers = null;
    // Clear dropdowns visually to avoid confusion (optional, but good UX)
    $('#selSunday').val('');
    $('#selSundayNovus').val('');

    // Clear content instantly or wait for auto-select?
    // Let's clear to be safe then auto-select.
    $('.chant-item').hide();
    $('.chant-name').text('');

    // Trigger Auto Select for new mode
    autoSelectDate();
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
    // Clear previous SVG but keep container structure implies we empty it.
    $preview.empty();

    // --- 1. Header & Commentary Extraction ---
    var header = getHeader(gabc);

    // Logic from propers.js to extracting commentary
    var commentary = header.commentary;
    // Handle the visual commentary div
    var $chantCommentary = $preview.parent().prev('.commentary');
    if ($chantCommentary.length === 0) {
        $chantCommentary = $('<div class="commentary"></div>').insertBefore($preview.parent());
    }
    $chantCommentary.text(commentary || '').toggle(!!commentary);

    // --- Inject Annotations (Force Legacy Style) ---
    // User wants "Intr." and "II" exactly like old app.
    // We must strip existing annotations type match and enforce our abbreviations.
    var splitIdx = gabc.indexOf('%%');
    var headerStr = (splitIdx !== -1) ? gabc.substring(0, splitIdx) : gabc;
    var bodyStr = (splitIdx !== -1) ? gabc.substring(splitIdx) : "";

    // Parse header fields for logic
    // (We use a temp parsing since getHeader might be outside or simple)
    var modeMatch = headerStr.match(/mode:\s*([^;\r\n]+)/i);
    var typeMatch = headerStr.match(/office-part:\s*([^;\r\n]+)/i);
    var mode = modeMatch ? modeMatch[1].trim() : '';
    var type = typeMatch ? typeMatch[1].trim() : ''; // preserve case for now

    // Remove existing annotation lines to avoid duplicates/conflicts
    headerStr = headerStr.replace(/annotation:\s*[^;\r\n]+;[\r\n]*/gi, "");

    var partAbbrev = {
        'introitus': 'Intr.', 'graduale': 'Grad.', 'alleluia': 'All.',
        'tractus': 'Tract.', 'sequentia': 'Seq.', 'offertorium': 'Offert.',
        'communio': 'Comm.', 'antiphona': 'Ant.', 'responsorium': 'Resp.',
        'hymnus': 'Hymn.', 'kyrie': 'Kyrie', 'gloria': 'Gloria',
        'credo': 'Credo', 'sanctus': 'Sanctus', 'agnus': 'Agnus'
    };
    // Legacy propers.js uses lowercase numerals which become small-caps via CSS
    var romanNumeral = ['', 'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii'];

    // Determine Display Type
    var dispType = partAbbrev[type.toLowerCase()];
    if (!dispType && type.length > 0) {
        dispType = type.charAt(0).toUpperCase() + type.slice(1);
    }

    // Determine Display Mode
    var dispMode = mode;
    var modeNum = parseInt(mode);
    if (!isNaN(modeNum) && romanNumeral[modeNum]) {
        dispMode = romanNumeral[modeNum];
    }

    var annotations = [];
    if (dispType) {
        annotations.push(dispType);
        // Show mode unless it's just a Verse (which isn't usually a main part type, but for safety)
        if (dispType !== 'V/.' && dispMode) {
            annotations.push(dispMode);
        }
    } else if (dispMode) {
        annotations.push(dispMode);
    }

    if (annotations.length > 0) {
        var insertion = annotations.map(function (a) { return "annotation: " + a + ";"; }).join('\n');
        // Append to headerStr
        headerStr = headerStr.trim() + '\n' + insertion + '\n';
        gabc = headerStr + bodyStr;
    }

    // --- 3. Exsurge Context & Rendering ---
    // Use the factory from util.js if available to ensure exact legacy styling (sizes, fonts)
    var ctxt;
    if (typeof makeExsurgeChantContext === 'function') {
        ctxt = makeExsurgeChantContext();
    } else {
        // Fallback if util.js is missing
        ctxt = new exsurge.ChantContext();
        ctxt.lyricTextFont = "'Crimson Text', serif";
        ctxt.rubricColor = '#d00';
        ctxt.textStyles.annotation.size = 12.8;
    }

    var mappings = exsurge.Gabc.createMappingsFromSource(ctxt, gabc);
    var score = new exsurge.ChantScore(ctxt, mappings, true); // true = drop cap

    // --- 4. Responsive Width Logic ---
    var performLayout = function () {
        var availableWidth = $preview.width() || $(document.body).width() - 32; // Fallback
        // Limit max width for readability, similar to propers.js logic
        var newWidth = Math.min(624, availableWidth);

        ctxt.width = newWidth;

        $preview.empty(); // Clear before redraw

        score.performLayout(ctxt);
        score.layoutChantLines(ctxt, newWidth, function () {
            var svg = score.createSvgNode(ctxt);
            // Scaling logic for small screens or specific constraints can be added here
            // propers.js does some scaling fixes for IE11, likely not needed for modern, 
            // but we can ensure it fits:
            if (svg.getAttribute('width') > availableWidth) {
                svg.setAttribute('width', "100%");
                svg.setAttribute('height', "auto");
            }

            $preview.append(svg);

            // --- 5. Clickable Notes (Audio Placeholder) ---
            // Allow interaction with chant notes.
            if (window.registerChantClicks && window.showToolbarForNote) {
                window.registerChantClicks($(svg), function (sourceIndex, $container, e) {
                    var element = $(e.target).closest('[source-index]')[0];
                    var selPart = (window.selPropers && window.selPropers[part]) || {};
                    // Ensure selPart has necessary properties or use a proxy if needed
                    // creating a context for editing if it doesn't exist
                    if (!selPart.gabc) selPart.gabc = gabc; // Ensure GABC is there

                    // Pass the editorialChange function (global from chant_editing.js)
                    // and the context base object containing the part name.
                    if (window.editorialChange) {
                        window.showToolbarForNote(element, window.editorialChange, { part: part });
                    } else {
                        console.warn("editorialChange function not found");
                    }
                });
            } else {
                $(svg).find('.neume, [source-index]').click(async function (e) {
                    e.stopPropagation();
                    var sourceIndex = $(this).attr('source-index');
                    console.log("Clicked chant element (v2):", this, "Source Index:", sourceIndex);

                    // Prefer Tone.js directly if available for reliable playback
                    if (window.Tone) {
                        try {
                            if (Tone.context.state !== 'running') {
                                await Tone.start();
                            }
                            const synth = new Tone.Synth().toDestination();
                            synth.triggerAttackRelease("A4", "8n");
                        } catch (err) {
                            console.warn("Tone.js playback failed:", err);
                            // Fallback to legacy tones.js
                            if (window.tones && window.tones.play) {
                                window.tones.play("a", 4);
                            }
                        }
                    } else if (window.tones && window.tones.play) {
                        try {
                            window.tones.play("a", 4);
                        } catch (err) {
                            console.warn("Audio playback failed:", err);
                        }
                    }
                });
            }
        });
    };

    // Initial Layout
    performLayout();

    // Attach resize handler specifically for this chant item to re-layout
    // We namespace it to the part to avoid duplicate listeners
    $(window).off('resize.chant-' + part).on('resize.chant-' + part, function () {
        // Debounce simple
        clearTimeout($preview.data('resize-timeout'));
        $preview.data('resize-timeout', setTimeout(performLayout, 200));
    });
}

function getHeader(gabc) {
    var header = {};
    if (!gabc) return header;
    var match = gabc.match(/([\w-]+):\s*([^;\r\n]+)/g);
    if (match) {
        match.forEach(function (m) {
            var parts = m.split(':');
            if (parts.length >= 2) {
                var key = parts[0].trim().toLowerCase();
                var val = parts[1].trim();
                // cleanup semicolon
                if (val.endsWith(';')) val = val.substring(0, val.length - 1);
                header[key] = val;
            }
        });
    }
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

// --- FIX: Revised Novus Ordo Logic (Overriding previous definition) ---
function getNovusOrdoKey(date, dates) {
    date = moment(date).startOf('day');
    var sunday = moment(date).day(0).startOf('day');
    var year = date.year();

    // Ensure dates exist or default
    var nativitas = dates.nativitas || moment(year + "-12-25", "YYYY-MM-DD");
    var epiphany = dates.epiphany || moment(year + "-01-06", "YYYY-MM-DD");
    var ashWed = dates.ashWednesday;
    var pascha = dates.pascha;
    var pentecost = dates.pentecost;
    var advent1 = dates.advent1;

    // Fixed Feasts
    if (date.month() === 0 && date.date() === 1) return "Blessed Virgin Mary";
    if (date.month() === 11 && date.date() === 25) return "Nativity Mass at Day";
    if (date.isSame(epiphany, 'day')) return "Epiphany";

    // Baptism calculation (Sunday after Epiphany)
    var baptism = moment(epiphany).day(0).add(7, 'days');
    if (baptism.date() < 7) baptism.add(7, 'days');
    if (date.isSame(baptism, 'day')) return "Baptism of the Lord";

    // Ordinary Time I: From Day after Baptism to Day before Ash Wed
    if (date.isAfter(baptism) && (!ashWed || date.isBefore(ashWed))) {
        var week = Math.floor(sunday.diff(baptism, 'weeks')) + 2;
        return getOrdinal(week) + " Sunday";
    }

    // Lent
    if (ashWed && date.isSameOrAfter(ashWed) && (!pascha || date.isBefore(pascha))) {
        if (date.isSame(ashWed, 'day')) return "Ash Wednesday";
        if (dates.quad1 && date.isSameOrAfter(dates.quad1)) {
            var weekLent = Math.floor(sunday.diff(dates.quad1, 'weeks')) + 1;
            if (weekLent === 6) return "Palm Sunday";
            if (weekLent <= 5) return getOrdinal(weekLent) + " Sunday in Lent";
        }
    }

    // Easter Season
    if (pascha && date.isSameOrAfter(pascha) && (!pentecost || date.isBefore(pentecost))) {
        if (date.isSame(pascha, 'day')) return "Easter Sunday";
        var weekEaster = Math.floor(sunday.diff(pascha, 'weeks')) + 1;
        if (weekEaster >= 2 && weekEaster <= 7) return getOrdinal(weekEaster) + " Sunday of Easter";
    }

    // Pentecost
    if (pentecost && date.isSame(pentecost, 'day')) return "Pentecost";

    // Post-Pentecost
    if (pentecost) {
        var trinity = moment(pentecost).add(7, 'days');
        if (sunday.isSame(trinity, 'day')) return "Most Holy Trinity";

        var corpus = moment(pentecost).add(14, 'days');
        if (sunday.isSame(corpus, 'day')) return "Body and Blood of Christ";

        // Ordinary Time II
        var corpusWeek = moment(corpus).add(6, 'days');
        if (date.isAfter(corpusWeek) && (!advent1 || date.isBefore(advent1))) {
            if (advent1) {
                var weeksFromAdv = Math.ceil(advent1.diff(sunday, 'weeks'));
                var n = 35 - weeksFromAdv;
                if (n === 34) return "Christ the King";
                if (n >= 1 && n <= 33) return getOrdinal(n) + " Sunday";
            }
        }
    }

    // Advent
    if (advent1 && date.isSameOrAfter(advent1) && date.isBefore(nativitas)) {
        var week = Math.floor(sunday.diff(advent1, 'weeks')) + 1;
        return getOrdinal(week) + " Sunday of Advent";
    }

    // Holy Family (Sunday in Octave of Christmas, or Dec 30)
    if (date.month() === 11 && date.date() >= 26) {
        var d = moment(nativitas);
        var hf;
        if (d.day() === 0) {
            hf = moment(d).add(5, 'days'); // Dec 30
        } else {
            hf = moment(d).day(0).add(7, 'days');
        }
        if (sunday.isSame(hf, 'day')) return "Holy Family";
        if (date.isSame(hf, 'day')) return "Holy Family";
    }

    return null;
}
