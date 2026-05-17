// Modern Propers JS - Refactored for Dynamic Rendering & Premium UI

// --- Global State ---
window.appState = {
    rite: localStorage.getItem('rubricMode') === 'novus' ? 'novus' : 'traditional',
    tab: 'temporum', // temporum, sanctorum, communia, ordinarium, adlibitum
    date: moment(),
    selection: {
        temporum: null,
        sanctorum: null,
        communia: null,
        ordinarium: null,
        novusYear: 'A',
        adlibitum: null
    },
    settings: {
        theme: localStorage.getItem('theme') || 'dark',
        translations: JSON.parse(localStorage.getItem('translations') || '{"latin":true,"english":true}'),
        chantStyle: localStorage.getItem('defaultStyle') || 'full'
    }
};

// Data Holders
window.selPropers = null;
window.selOrdinaries = {};

// --- Initialization ---
$(function () {
    console.log("Modern Propers V2 Initializing...");

    initTheme();
    setupEventListeners();

    // Populate selectors
    doPopulate();

    // Auto-select date
    autoSelectDate();

    // Initial Render
    renderApp();
});

// --- Core Logic: Navigation & Rendering ---

function renderApp() {
    updateHeader();
    updateNavigation();
    renderContent();
}

function updateHeader() {
    let title = 'Propria Miss\u00e6';
    if (appState.tab === 'temporum') {
        title = appState.rite === 'novus'
            ? ($('#selSundayNovus option:selected').text() || 'Eligas diem...')
            : ($('#selSunday option:selected').text() || 'Eligas diem...');
    } else if (appState.tab === 'sanctorum') {
        title = $('#selSaint option:selected').text() || 'Eligas festum...';
    } else if (appState.tab === 'communia') {
        title = $('#selMass option:selected').text() || 'Eligas missam...';
    } else if (appState.tab === 'adlibitum') {
        title = 'Ad libitum';
    }
    $('#headerTitle').text(title);

    $('#btnRubric').text(appState.rite === 'novus' ? 'Novus Ordo' : 'Vetus Ordo');
    $('#btnRubric').toggleClass('active', appState.rite === 'novus');

    $('.selector-group').addClass('hidden');
    if (appState.tab === 'temporum') {
        $('#' + (appState.rite === 'novus' ? 'selectorTempNovus' : 'selectorTempTrad')).removeClass('hidden');
    } else if (appState.tab === 'sanctorum') {
        $('#selectorSanctorum').removeClass('hidden');
    } else if (appState.tab === 'communia') {
        $('#selectorCommunia').removeClass('hidden');
    } else if (appState.tab === 'adlibitum') {
        $('#selectorAdlibitum').removeClass('hidden');
        setTimeout(function() { $('#searchAdlibitum').focus(); }, 100);
    }
}

function updateNavigation() {
    $('.nav-item').removeClass('active');
    $(`.nav-item[data-tab="${appState.tab}"]`).addClass('active');
}

function renderContent() {
    const $stream = $('#content-stream');
    $stream.empty();

    if (!selPropers && appState.tab !== 'ordinarium' && appState.tab !== 'adlibitum') {
        $stream.append(`
            <div class="card" style="text-align:center; opacity:0.6; padding:40px; border-style:dashed;">
                <h3 style="margin-bottom:10px;">Select a Mass</h3>
                <p>Use the selectors above or the nav tabs below.</p>
            </div>
        `);
        return;
    }

    // Helper: resolve a proper chant ID from selPropers
    function resolveId(tradKey, novusKey) {
        if (!selPropers) return null;
        var id = selPropers[tradKey] || selPropers[novusKey];
        if (Array.isArray(id)) id = id[0];
        if (id && typeof id === 'object' && id.id) id = id.id;
        if (!id || id === 'no') return null;
        return id;
    }

    // Helper: render an ordinary part if not disabled
    function renderOrdinary(label, key) {
        if (selPropers && selPropers[key] === false) return;
        if (selOrdinaries && selOrdinaries[key]) {
            renderChantCard($stream, label, selOrdinaries[key], 'Ordinary');
        }
    }

    // Helper: render a proper chant
    function renderProper(label, tradKey, novusKey) {
        var id = resolveId(tradKey, novusKey);
        if (id) renderChantCard($stream, label, id, 'Proper');
    }

    // Helper: render readings (Epistle or Gospel)
    function renderReading(title, readings, index) {
        if (readings && readings[index]) {
            renderReadingCard($stream, title, readings[index]);
        }
    }

    // Get readings data
    var readings = null;
    if (appState.rite === 'traditional') {
        var selDay = appState.selection.temporum || appState.selection.sanctorum;
        if (selDay) {
            var prop = window.proprium && window.proprium[selDay];
            if (prop && prop.ref && window.lectiones[prop.ref]) {
                readings = window.lectiones[prop.ref];
            } else if (window.lectiones && window.lectiones[selDay]) {
                readings = window.lectiones[selDay];
            }
            if (!readings) {
                var match = /^Pent(Epi\d)$/.exec(selDay);
                var lecDay = match ? match[1] : selDay;
                if (window.lectiones && window.lectiones[lecDay]) readings = window.lectiones[lecDay];
            }
        }
    }

    // ===== ORDINARIUM TAB =====
    if (appState.tab === 'ordinarium') {
        var ordIdx = parseInt($('#selOrdinary').val()) - 1;
        var ord = (window.massOrdinary && !isNaN(ordIdx)) ? window.massOrdinary[ordIdx] : null;
        if (!ord) {
            $stream.append('<div class="card" style="text-align:center;opacity:0.6;padding:40px;border-style:dashed"><h3>Select an Ordinary</h3></div>');
            return;
        }
        var renderOrdPart = function(label, part) {
            if (!part) return;
            var arr = Array.isArray(part) ? part : [part];
            arr.forEach(function(p) { renderChantCard($stream, p.name || label, p.id, 'Ordinary'); });
        };
        renderOrdPart('Kyrie', ord.kyrie);
        renderOrdPart('Gloria', ord.gloria);
        renderOrdPart('Credo', ord.credo);
        renderOrdPart('Sanctus', ord.sanctus);
        renderOrdPart('Agnus Dei', ord.agnus);
        renderOrdPart('Ite Missa Est', ord.ite);
        renderOrdPart('Benedicamus', ord.benedicamus);
        initCardListeners();
        return;
    }

    // ===== AD LIBITUM TAB =====
    if (appState.tab === 'adlibitum') {
        if (appState.selection.adlibitum) {
            renderChantCard($stream, appState.selection.adlibitum.label, appState.selection.adlibitum.id, 'Ad libitum');
            initCardListeners();
        } else {
            $stream.append('<div class="card" style="text-align:center;opacity:0.6;padding:40px;border-style:dashed"><h3>Quaere cantum</h3><p>Scribe incipit supra ut cantum invenias.</p></div>');
        }
        return;
    }

    // ===== PROPER TABS: Temporum / Sanctorum / Votivæ =====
    var selDay = appState.selection.temporum || '';
    var isPaschal = /^Pasc/.test(selDay);

    // Asperges / Vidi Aquam (Temporum only)
    if (appState.tab === 'temporum' && !(selPropers && selPropers.asperges === false)) {
        if (window.ordinaryAdLib && window.ordinaryAdLib.asperges) {
            var aspId = isPaschal ? 958 : 497;
            renderChantCard($stream, isPaschal ? 'Vidi Aquam' : 'Asperges me', aspId, 'Ordinarium');
        }
    }

    renderProper('Introitus', 'inID', 'introitus');
    renderOrdinary('Kyrie', 'kyrie');
    renderOrdinary('Gloria', 'gloria');
    renderReading('Epistola', readings, 0);
    renderProper('Graduale', 'grID', 'graduale');
    renderProper('Tractus', 'trID', 'tractus');
    renderProper('Alleluia', 'alID', 'alleluia');
    renderProper('Sequentia', 'seqID', 'sequentia');
    renderReading('Evangelium', readings, readings ? readings.length - 1 : 1);
    renderOrdinary('Credo', 'credo');
    renderProper('Offertorium', 'ofID', 'offertorium');
    if (!(selPropers && selPropers.preface === false)) {
        if (window.ordinaryAdLib && window.ordinaryAdLib.preface) {
            renderChantCard($stream, 'Præfatio', window.ordinaryAdLib.preface[0].id, 'Ordinarium');
        }
    }
    renderOrdinary('Sanctus', 'sanctus');
    renderOrdinary('Agnus Dei', 'agnus');
    renderProper('Communio', 'coID', 'communio');
    renderOrdinary('Ite Missa Est', 'ite');
    initCardListeners();
}


// --- Component Rendering ---

function renderReadings($container) {
    if (!window.lectiones) return;

    // Logic to find reading key (Simplified from original)
    // In original: var match = /^Pent(Epi\d)$/.exec(selDay); var lecDay = match ? match[1] : selDay;
    // We need 'selDay' from state.
    let selDay = appState.selection.temporum || appState.selection.sanctorum;
    // Sanctorum readings tricky without map? 
    // Usually readings are linked in proprium via 'ref'.

    let readings = null;
    let prop = window.proprium && window.proprium[selDay];

    if (prop) {
        if (prop.ref && window.lectiones[prop.ref]) {
            readings = window.lectiones[prop.ref];
        } else if (window.lectiones[selDay]) {
            readings = window.lectiones[selDay];
        }
    }

    // Try parsing numbered
    if (!readings && selDay) {
        let match = /^Pent(Epi\d)$/.exec(selDay);
        let lecDay = match ? match[1] : selDay;
        if (window.lectiones[lecDay]) readings = window.lectiones[lecDay];
    }

    if (readings) {
        // Epistle (Index 0)
        if (readings[0]) renderReadingCard($container, 'Epistle', readings[0]);
        // Gospel (Index 1)
        if (readings[1]) renderReadingCard($container, 'Gospel', readings[1]);
    }
}

function renderReadingCard($container, title, ref) {
    var lang = appState.settings.readingLang || 'la';
    var editionMap = { la: 'vulgate', en: 'douay-rheims', fr: 'vulgate' };
    var edition = editionMap[lang] || 'vulgate';

    const $card = $(`
        <div class="card">
            <div class="card-header">
                <div class="card-title-group">
                    <span class="card-type">Lectio</span>
                    <h3 class="card-title">${title}</h3>
                </div>
            </div>
            <div class="reading-ref" style="font-size:0.85rem; opacity:0.7; padding:4px 16px;">${ref}</div>
            <div class="reading-content loading-pulse" style="padding:12px 16px;">Oneratur...</div>
        </div>
    `);
    $container.append($card);

    getReading({ ref: ref, edition: edition, language: lang }).then(function (spans) {
        var $content = $card.find('.reading-content').empty().removeClass('loading-pulse');
        if (spans && spans.length) {
            $content.append($('<div class="reading-text" style="line-height:1.9; font-family:\'Crimson Text\', serif; font-size:1.05rem;">').append(spans));
        } else {
            $content.html('<em style="opacity:0.5">Lectio non invenitur: ' + ref + '</em>');
        }
    });
}


function renderChantCard($container, part, id, typeLabel) {
    var typeClass = (typeLabel === 'Ordinarium') ? 'rubric-red' : '';
    var initialStyle = appState.settings.chantStyle;

    const cardHtml = `
        <div class="card chant-card" data-part="${part}" data-id="${id}">
            <div class="card-header">
                <div class="card-title-group">
                    <span class="card-type ${typeClass}">${typeLabel}</span>
                    <h3 class="card-title capitalize">${part}</h3>
                </div>
                <div class="card-actions">
                    <button class="btn-icon btn-play" title="Play"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg></button>
                    <button class="btn-icon btn-settings" title="Settings"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg></button>
                    <button class="btn-icon btn-edit" title="Edit GABC"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
                </div>
            </div>

            <div class="settings-panel hidden">
                <div>
                    <label class="control-label">Style</label>
                    <select class="modern-select sel-style">
                        <option value="full" ${initialStyle === 'full' ? 'selected' : ''}>Full Chant</option>
                        <option value="psalm-tone" ${initialStyle === 'psalm-tone' ? 'selected' : ''}>Psalm Tone</option>
                    </select>
                </div>
                <div class="tone-controls hidden">
                    <label class="control-label">Tone</label>
                    <select class="modern-select sel-tone"></select>
                </div>
                <div class="tone-controls hidden">
                    <label class="control-label">Ending</label>
                    <select class="modern-select sel-ending"></select>
                </div>
            </div>

            <textarea class="gabc-editor hidden"></textarea>
            
            <div class="chant-preview-container">
                <div class="chant-preview loading-pulse"></div>
            </div>

            <div class="commentary" style="display:none; text-align:center; color:#888; font-size:0.8rem; margin-top:8px;"></div>
        </div>
    `;
    const $card = $(cardHtml);
    $container.append($card);

    loadChantData($card, part, id);
}

function loadChantData($card, part, id) {
    const gabcUrl = `gabc/${id}.gabc`;
    $.get(gabcUrl, function (data) {
        $card.find('.gabc-editor').val(data).data('full-gabc', data);

        const header = getHeader(data);
        if (header.name) $card.find('.card-title').text(header.name);
        if (header.commentary) $card.find('.commentary').text(header.commentary).show();

        renderChantSVG($card, data);
    }).fail(function () {
        $card.find('.chant-preview').text("Error loading chant.");
    });
}

function renderChantSVG($card, gabc) {
    const $preview = $card.find('.chant-preview').empty().removeClass('loading-pulse');

    var ctxt;
    if (typeof makeExsurgeChantContext === 'function') {
        ctxt = makeExsurgeChantContext();
    } else {
        ctxt = new exsurge.ChantContext();
        var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        ctxt.rubricColor = isDark ? '#ef5350' : '#c62828';
        ctxt.specialCharColor = isDark ? '#ef5350' : '#c62828';
        ctxt.lyricTextFont = "'Crimson Text', 'Libre Baskerville', serif";
        ctxt.annotationTextFont = ctxt.lyricTextFont;
        ctxt.staffLineColor = isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)';
        ctxt.noteColor = isDark ? '#e8e8e8' : '#1a1a1a';
    }

    var mappings = exsurge.Gabc.createMappingsFromSource(ctxt, gabc);
    var score = new exsurge.ChantScore(ctxt, mappings, true);

    var width = $card.width() - 20;
    ctxt.width = width;

    score.performLayout(ctxt);
    score.layoutChantLines(ctxt, width, function () {
        var svg = score.createSvgNode(ctxt);
        $preview.append(svg);

        // Responsive Note Clicks
        $(svg).find('.neume').on('click', function (e) {
            e.stopPropagation();
            playAudioNote();
        });
    });
}

// --- Event Handlers ---

// --- Ad Libitum incipit search ---
function buildIncipitIndex() {
    var list = [];
    if (typeof incipits !== 'undefined') {
        Object.keys(incipits).forEach(function(partName) {
            var part = incipits[partName];
            (function walk(obj, prefix) {
                Object.keys(obj).forEach(function(key) {
                    var val = obj[key];
                    var text = prefix ? prefix + ' ' + key : key;
                    if (typeof val === 'number') {
                        list.push({ label: partName + ': ' + text, id: val, part: partName });
                    } else if (typeof val === 'object' && val !== null) {
                        walk(val, text);
                    }
                });
            })(part, '');
        });
    }
    if (typeof miscChants !== 'undefined') {
        miscChants.forEach(function(chant) {
            if (chant.id && chant.name) {
                list.push({ label: 'Ad libitum: ' + chant.name, id: chant.id, part: 'Ad libitum' });
            }
        });
    }
    return list;
}

var _incipitIndex = null;
function getIncipitIndex() {
    if (!_incipitIndex) _incipitIndex = buildIncipitIndex();
    return _incipitIndex;
}

function setupEventListeners() {
    $('.nav-item').on('click', function (e) {
        e.preventDefault();
        appState.tab = $(this).data('tab');
        updateNavigation();
        updateHeader();
        renderContent();
    });

    $('#btnRubric').on('click', function () {
        appState.rite = appState.rite === 'novus' ? 'traditional' : 'novus';
        localStorage.setItem('rubricMode', appState.rite === 'novus' ? 'novus' : 'traditional');
        doPopulate();
        autoSelectDate();
        renderApp();
    });

    $('.modern-select').on('change', function () {
        const id = $(this).attr('id');
        const val = $(this).val();

        if (id === 'selSunday') appState.selection.temporum = val;
        if (id === 'selSundayNovus') appState.selection.temporum = val;
        if (id === 'selSaint') appState.selection.sanctorum = val;
        if (id === 'selMass') appState.selection.communia = val;
        if (id === 'selOrdinary') appState.selection.ordinarium = val;

        handleSelectionChange(id, val);
    });

    // Ad Libitum search
    $('#searchAdlibitum').on('input', function() {
        var q = $(this).val().toLowerCase().trim();
        var $dd = $('#searchDropdown');
        if (q.length < 2) { $dd.addClass('hidden').empty(); return; }
        var results = getIncipitIndex().filter(function(item) {
            return item.label.toLowerCase().indexOf(q) >= 0;
        }).slice(0, 20);
        $dd.empty();
        if (!results.length) { $dd.addClass('hidden'); return; }
        results.forEach(function(item) {
            $('<div class="search-result-item">').text(item.label).on('click', function() {
                appState.selection.adlibitum = item;
                $('#searchAdlibitum').val(item.label);
                $dd.addClass('hidden').empty();
                renderContent();
                updateHeader();
            }).appendTo($dd);
        });
        $dd.removeClass('hidden');
    });
    $(document).on('click', function(e) {
        if (!$(e.target).closest('.search-input-wrapper').length) {
            $('#searchDropdown').addClass('hidden');
        }
    });

    // selOrdinary is now in settings panel — wire it here
    $('#selOrdinary').off('change').on('change', function () {
        var val = $(this).val();
        appState.selection.ordinarium = val;
        if (window.massOrdinary && val) {
            var ord = window.massOrdinary[parseInt(val) - 1];
            if (ord) {
                ['kyrie', 'gloria', 'credo', 'sanctus', 'agnus', 'ite', 'benedicamus'].forEach(function(p) {
                    if (ord[p]) selOrdinaries[p] = Array.isArray(ord[p]) ? ord[p][0].id : ord[p].id;
                });
            }
        } else {
            selOrdinaries = {};
        }
        if (selPropers || appState.tab === 'adlibitum') renderContent();
    });

    $('.segment[data-val]').on('click', function () {
        appState.selection.novusYear = $(this).data('val');
        $(this).siblings().removeClass('active');
        $(this).addClass('active');
        // Refresh
        if ($('#selSundayNovus').val()) $('#selSundayNovus').trigger('change');
    });


    // --- Settings Panel ---
    $('#btnSettings').on('click', function () {
        $('#settingsPanel, #settingsBackdrop').addClass('active');
    });
    $('#btnCloseSettings, #settingsBackdrop').on('click', function () {
        $('#settingsPanel, #settingsBackdrop').removeClass('active');
    });

    // Theme selection
    $('#themeOptions').on('click', '.settings-option', function () {
        var val = $(this).data('value');
        $(this).addClass('active').siblings().removeClass('active');
        appState.settings.theme = val;
        localStorage.setItem('theme', val);
        applyTheme(val);
    });

    // Accent color
    $('#colorOptions').on('click', '.color-swatch', function () {
        var color = $(this).data('color');
        $(this).addClass('active').siblings().removeClass('active');
        localStorage.setItem('accentColor', color);
        document.documentElement.style.setProperty('--accent-color', color);
    });

    // Reading language
    $('#langOptions').on('click', '.settings-option', function () {
        var val = $(this).data('value');
        $(this).addClass('active').siblings().removeClass('active');
        appState.settings.readingLang = val;
        localStorage.setItem('readingLang', val);
        renderContent();
    });
}

function initCardListeners() {
    $('.btn-play').off('click').on('click', function () {
        playAudioNote();
    });

    $('.btn-edit').off('click').on('click', function () {
        var $card = $(this).closest('.card');
        var $editor = $card.find('.gabc-editor');
        $editor.toggleClass('hidden');
        if (!$editor.hasClass('hidden')) $editor.focus();
    });

    $('.btn-settings').off('click').on('click', function () {
        $(this).toggleClass('active');
        $(this).closest('.card').find('.settings-panel').toggleClass('hidden');
    });

    // Wire per-card style selector
    $('.sel-style').off('change').on('change', function () {
        var $card = $(this).closest('.card');
        var style = $(this).val();
        var gabc = $card.find('.gabc-editor').val();
        var isPsalmTone = style === 'psalm-tone';
        $card.find('.tone-controls').toggleClass('hidden', !isPsalmTone);
        if (gabc) renderChantSVG($card, gabc);
    });

    // Wire GABC editor live update
    $('.gabc-editor').off('input').on('input', function () {
        var $card = $(this).closest('.card');
        var gabc = $(this).val();
        if (gabc.length > 20) renderChantSVG($card, gabc);
    });
}

// --- Helpers ---

function handleSelectionChange(id, val) {
    if (!val) return;

    if (id === 'selSunday' || id === 'selSundayNovus') {
        if (appState.rite === 'novus') {
            let baseData = window.propriumNoviOrdinis[val];
            if (baseData) {
                selPropers = {};
                Object.keys(baseData).forEach(k => {
                    let d = baseData[k];
                    selPropers[k] = (d[appState.selection.novusYear] || d.A || d);
                });
            }
        } else {
            selPropers = window.proprium[val];
        }
        renderContent();

    } else if (id === 'selSaint') {
        selPropers = window.proprium[val];
        renderContent();

    } else if (id === 'selMass') {
        selPropers = window.proprium[val];
        renderContent();
        $('#selectionModal').removeClass('active');
    } else if (id === 'selOrdinary') {
        if (window.massOrdinary) {
            let ord = window.massOrdinary[val - 1];
            if (ord) {
                ['kyrie', 'gloria', 'credo', 'sanctus', 'agnus', 'ite', 'benedicamus'].forEach(p => {
                    if (ord[p]) selOrdinaries[p] = Array.isArray(ord[p]) ? ord[p][0].id : ord[p].id;
                });
            }
        }
        renderContent();
    }
}

// getChantId is no longer needed — ID resolution is inline in renderContent().
// Kept as a no-op for any callers.
function getChantId(part) { return null; }

// --- Date Logic Re-Implementation ---
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
    result.ashWednesday = moment(result.pascha).subtract(46, 'days');
    return result;
};

// --- Restored Liturgical Logic ---

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

function autoSelectDate() {
    var today = moment().startOf('day');
    var dates = getLiturgicalDates(today.year());

    if (appState.rite === 'novus') {
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
                }
            }
        }
    } else {
        if (window.sundayKeys) {
            var bestMatch = null;
            for (var i = 0; i < window.sundayKeys.length; i++) {
                var item = window.sundayKeys[i];
                if (!item.key) continue;
                var d = getDateForSundayKey(item.key, dates);

                if (d && d.isSame(today, 'day')) {
                    $('#selSunday').val(item.key).change();
                    bestMatch = null;
                    break;
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

    // Auto-select Saint if there's a match today
    if (window.saintKeys) {
        var bestSaintMatch = null;
        for (var i = 0; i < window.saintKeys.length; i++) {
            var item = window.saintKeys[i];
            if (!item.key) continue;
            var m = moment(item.key, 'MMMD').year(today.year());
            if (m.isValid() && m.isSame(today, 'day')) {
                bestSaintMatch = item.key;
                break;
            }
        }
        if (bestSaintMatch) {
            $('#selSaint').val(bestSaintMatch).change();
        }
    }

    // Default Votivae to first available if none selected
    if (window.otherKeys && !appState.selection.communia) {
        for (var i = 0; i < window.otherKeys.length; i++) {
            if (window.otherKeys[i].key) {
                $('#selMass').val(window.otherKeys[i].key).change();
                break;
            }
        }
    }
}

// ... Additional helper functions from original file can be added here if critical ...

function doPopulate() {
    if (typeof window.sundayKeys !== 'undefined') populate(window.sundayKeys, $('#selSunday'));
    if (typeof window.saintKeys !== 'undefined') populate(window.saintKeys, $('#selSaint'));
    if (typeof window.otherKeys !== 'undefined') populate(window.otherKeys, $('#selMass'));
    if (typeof window.sundaysNovusOrdo !== 'undefined') populate(window.sundaysNovusOrdo, $('#selSundayNovus'));
    if (window.massOrdinary) {
        var opts = window.massOrdinary.map(function(e, i) {
            var label = e.name ? (e.name + ' — ' + e.season) : e.season;
            return { key: (i + 1).toString(), title: label, en: label };
        });
        populate(opts, $('#selOrdinary'));
    }
}

function populate(keys, $sel) {
    if (!keys) return;
    $sel.empty();

    var defaultText = 'Eligas...';
    var id = $sel.attr('id');
    if (id === 'selSunday' || id === 'selSundayNovus') defaultText = 'Eligas diem...';
    else if (id === 'selSaint') defaultText = 'Eligas festum...';
    else if (id === 'selMass') defaultText = 'Eligas missam...';
    else if (id === 'selOrdinary') defaultText = 'Ordinaria Missæ in cantu gregoriano...';

    $sel.append(new Option(defaultText, ''));
    var $currentGroup = null;
    $.each(keys, function (i, o) {
        if (typeof o === 'string') o = { key: o, title: o };
        // Group header (no key, or group:true)
        if (!o.key || o.group) {
            $currentGroup = $('<optgroup>').attr('label', o.title || o.en);
            $sel.append($currentGroup);
            return;
        }
        // Title-only header row (has title but no key)
        if (o.title && !o.key) {
            $currentGroup = null;
            return;
        }
        var $opt = $(new Option(o.title || o.en, o.key));
        if ($currentGroup) {
            $currentGroup.append($opt);
        } else {
            $sel.append($opt);
        }
    });
}

function initTheme() {
    var theme = appState.settings.theme;
    applyTheme(theme);

    // Sync settings panel active states
    $('#themeOptions .settings-option').each(function () {
        $(this).toggleClass('active', $(this).data('value') === theme);
    });

    var savedColor = localStorage.getItem('accentColor');
    if (savedColor) {
        document.documentElement.style.setProperty('--accent-color', savedColor);
        $('#colorOptions .color-swatch').each(function () {
            $(this).toggleClass('active', $(this).data('color') === savedColor);
        });
    }

    var savedLang = localStorage.getItem('readingLang') || 'la';
    // Ensure fillion (French, server-only) doesn't get used locally
    if (savedLang === 'fr') savedLang = 'la';
    appState.settings.readingLang = savedLang;
    $('#langOptions .settings-option').each(function () {
        $(this).toggleClass('active', $(this).data('value') === savedLang);
    });
}

function applyTheme(theme) {
    if (theme === 'auto') {
        document.documentElement.removeAttribute('data-theme');
    } else {
        document.documentElement.setAttribute('data-theme', theme);
    }
}

function getHeader(gabc) {
    var header = {};
    if (!gabc) return header;
    var match = gabc.match(/([\w-]+):\s*([^;\r\n]+)/g);
    if (match) {
        match.forEach(function (m) {
            var parts = m.split(':');
            if (parts.length >= 2) {
                header[parts[0].trim().toLowerCase()] = parts[1].trim();
            }
        });
    }
    return header;
}
// --- Restored Novus Ordo Logic ---
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

    // Holy Family
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

function getOrdinal(n) {
    var ordinals = ["", "First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth", "Tenth",
        "Eleventh", "Twelfth", "Thirteenth", "Fourteenth", "Fifteenth", "Sixteenth", "Seventeenth", "Eighteenth", "Nineteenth", "Twentieth",
        "Twenty-first", "Twenty-second", "Twenty-third", "Twenty-fourth", "Twenty-fifth", "Twenty-sixth", "Twenty-seventh", "Twenty-eighth", "Twenty-ninth", "Thirtieth",
        "Thirty-first", "Thirty-second", "Thirty-third", "Thirty-fourth"];
    return ordinals[n] || n;
}

function playAudioNote() {
    if (window.Tone) {
        if (Tone.context.state !== 'running') Tone.start();
        const synth = new Tone.Synth().toDestination();
        synth.triggerAttackRelease("C4", "8n");
    }
}
