/**
 * =========================================================================
 * Oremus - gregobase_ui.js
 * Contrôleur de l'explorateur Grégobase (22 541 partitions)
 * Style 100% identique à la page de recherche universelle (Quærere)
 * Header en 2 lignes : Recherche intégrée + Catégories Grégobase en dessous (chips)
 * Navigation triée par catégories (Usages, Incipits, Modes, Sources, Thèmes)
 * Rendu Exsurge vectoriel dynamique, ZÉRO bordure, ZÉRO marge parasite.
 * =========================================================================
 */

(function(window, $) {
    'use strict';

    var PAGE_SIZE = 40;

    // Métadonnées descriptives pour les usages liturgiques
    var USAGE_METADATA = {
        'Antiphona': { code: 'an', fr: 'Antienne' },
        'Chant': { code: 'ch', fr: 'Chant' },
        'Hymnus': { code: 'hy', fr: 'Hymne' },
        'Responsorium': { code: 're', fr: 'Grand Répons' },
        'Alleluia': { code: 'al', fr: 'Alléluia' },
        'Communio': { code: 'co', fr: 'Communion' },
        'Introitus': { code: 'in', fr: 'Introït' },
        'Offertorium': { code: 'of', fr: 'Offertoire' },
        'Responsorium breve': { code: 'rb', fr: 'Répons bref' },
        'Graduale': { code: 'gr', fr: 'Graduel' },
        'Oratio': { code: 'or', fr: 'Oraison' },
        'Kyriale': { code: 'ky', fr: 'Kyriale' },
        'Varia': { code: 'va', fr: 'Varia' },
        'Tractus': { code: 'tr', fr: 'Trait' },
        'Psalmus': { code: 'ps', fr: 'Psaume' },
        'Sequentia': { code: 'se', fr: 'Séquence' },
        'Prosa': { code: 'pa', fr: 'Prose' },
        'Canticum': { code: 'ca', fr: 'Cantique' },
        'Supplicatio': { code: 'su', fr: 'Supplication' },
        'Tropa': { code: 'tp', fr: 'Trope' },
        'Praefationes': { code: 'pr', fr: 'Préface' },
        'Improperia': { code: 'im', fr: 'Impropères' },
        'Rhythmus': { code: 'rh', fr: 'Rythme' },
        'Toni Communes': { code: 'tc', fr: 'Tons communs' }
    };

    // Modes grégoriens
    var MODE_METADATA = {
        '1': { roman: 'I', name: 'Dorius', type: 'Authentique' },
        '2': { roman: 'II', name: 'Hypodorius', type: 'Plagal' },
        '3': { roman: 'III', name: 'Phrygius', type: 'Authentique' },
        '4': { roman: 'IV', name: 'Hypophrygius', type: 'Plagal' },
        '5': { roman: 'V', name: 'Lydius', type: 'Authentique' },
        '6': { roman: 'VI', name: 'Hypolydius', type: 'Plagal' },
        '7': { roman: 'VII', name: 'Mixolydius', type: 'Authentique' },
        '8': { roman: 'VIII', name: 'Hypomixolydius', type: 'Plagal' }
    };

    // État du module Grégobase
    var state = {
        tab: 'usage', // 'usage', 'incipit', 'mode', 'source', 'tag'
        filterType: null, // null (vue par catégories) ou 'usage' | 'incipit' | 'mode' | 'source' | 'tag'
        filterValue: null,
        searchQuery: '',
        inCategoryQuery: '',
        subMode: '',
        subNabcOnly: false,
        viewMode: localStorage.getItem('gregorian_view_mode') || 'grid',
        loadedCount: 0,
        matchingChants: [],
        searchMatchingChants: [],
        searchLoadedCount: 0
    };

    // Données indexées
    var isIndexed = false;
    var allChants = [];
    var indexes = {
        incipits: {}, // letter -> array
        usages: {},   // part -> array
        modes: {},    // mode -> array
        sources: {},  // book name -> array
        tags: {}      // tag name -> array
    };

    var scoreObserver = null;
    var sentinelObserver = null;

    // Normalisation latin
    function normalizeLatin(str) {
        if (!str) return '';
        return String(str)
            .toLowerCase()
            .replace(/æ|ǽ/g, 'ae')
            .replace(/œ|œ́/g, 'oe')
            .replace(/v/g, 'u')
            .replace(/j/g, 'i')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[\*\+\,\.\;\:\!\?\(\)\[\]\{\}\/\\℣℟†—–\-\_]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Indexation complète des partitions de chants
    function buildGregobaseIndex() {
        if (isIndexed) return;
        var rawList = window.GREGORIAN_INDEX;
        if (!rawList || !Array.isArray(rawList)) return;

        allChants = rawList.filter(function(item) {
            return item.type === 'chant' || (!item.type && item.id);
        });

        indexes.incipits = {};
        indexes.usages = {};
        indexes.modes = {};
        indexes.sources = {};
        indexes.tags = {};

        for (var i = 0; i < allChants.length; i++) {
            var c = allChants[i];

            // A. Par Incipit (lettre initiale)
            var inc = (c.incipit || '').trim();
            var firstChar = '#';
            if (inc.length > 0) {
                var clean = inc[0].toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
                if (/^[A-Z]$/.test(clean)) {
                    firstChar = clean;
                }
            }
            if (!indexes.incipits[firstChar]) indexes.incipits[firstChar] = [];
            indexes.incipits[firstChar].push(c);

            // B. Par Usage liturgique
            var part = (c.part || 'Varia').trim();
            if (!indexes.usages[part]) indexes.usages[part] = [];
            indexes.usages[part].push(c);

            // C. Par Mode grégorien
            var m = (c.mode || '').trim();
            var modeKey = m || 'Sans mode';
            if (!indexes.modes[modeKey]) indexes.modes[modeKey] = [];
            indexes.modes[modeKey].push(c);

            // D. Par Source / Livre
            var bk = (c.book || '').trim();
            if (!bk) {
                if (!indexes.sources['Non spécifié']) indexes.sources['Non spécifié'] = [];
                indexes.sources['Non spécifié'].push(c);
            } else {
                var bookParts = bk.split(/[;&]/);
                for (var b = 0; b < bookParts.length; b++) {
                    var sName = bookParts[b].trim();
                    if (!sName) continue;
                    if (!indexes.sources[sName]) indexes.sources[sName] = [];
                    indexes.sources[sName].push(c);
                }
            }

            // E. Par Tags & Thèmes
            var tgs = (c.tags || '').trim();
            if (tgs) {
                var tagParts = tgs.split(/[;,\/]/);
                for (var t = 0; t < tagParts.length; t++) {
                    var tName = tagParts[t].trim();
                    if (!tName || tName.length < 2) continue;
                    if (!indexes.tags[tName]) indexes.tags[tName] = [];
                    indexes.tags[tName].push(c);
                }
            }
        }

        // Moteur de recherche global
        var engine = window.GregorianSearchEngine || window.gregorianSearchEngine;
        if (engine && !engine.isInitialized) {
            engine.buildIndex(window.GREGORIAN_INDEX);
        }

        // Mettre à jour les compteurs réels dans les chips du header
        $('#chipCountUsage').text(Object.keys(indexes.usages).length);
        $('#chipCountSource').text(Object.keys(indexes.sources).length);
        $('#chipCountTag').text(Object.keys(indexes.tags).length);

        isIndexed = true;
    }

    // Affichage principal de Grégobase
    function renderMainView() {
        buildGregobaseIndex();

        // Activation du mode Grégobase
        $('body').removeClass('is-search-mode is-bible-mode is-chant-mode').addClass('is-gregobase-mode');
        $('#doHourLabel').text('GRÉGOBASE • BASE DE DONNÉES GRÉGORIENNE');
        $('#doHeaderTitle .title-text').text('Grégobase');

        // Masquer impérativement le bouton et panneau Sommaire (TOC de la messe)
        if (typeof window.hideMassToc === 'function') {
            window.hideMassToc();
        }
        $('#doMassTocPill, #doMassTocPanel, #doMassTocBackdrop').addClass('hidden');

        // Synchronisation de l'en-tête (Ligne 1 : Recherche + Bascule de vue)
        $('#gregobaseSearchInput').val(state.searchQuery);
        $('#gregobaseClearSearch').toggleClass('hidden', !state.searchQuery);
        if (typeof window.getViewToggleIconHtml === 'function') {
            $('#gregobaseToggleViewBtn').html(window.getViewToggleIconHtml(state.viewMode));
        }

        // Synchronisation de l'en-tête (Ligne 2 : Chips de catégories)
        syncCategoryChipsUI();

        var $stream = $('#do-content-stream').empty();
        var html = '<div class="gregobase-page" id="gregobasePageRoot">';

        if (state.searchQuery && state.searchQuery.trim()) {
            // VUE 1 : RECHERCHE GLOBALE GRÉGOBASE (l'utilisateur a saisi du texte)
            html += '<div class="gregobase-search-meta-bar">';
            html += '  <span id="gregobaseSearchResultCount">Recherche dans Grégobase...</span>';
            html += '  <button id="gregobaseSearchToggleViewBtn" class="gregobase-view-toggle-btn" title="Changer de vue">';
            if (typeof window.getViewToggleIconHtml === 'function') {
                html += window.getViewToggleIconHtml(state.viewMode);
            } else {
                html += '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/></svg>';
            }
            html += '  </button>';
            html += '</div>';
            html += '<div id="gregobaseResultsContainer" class="gregorian-results is-' + state.viewMode + '"></div>';
            html += '<div id="gregobaseSentinel" class="gregobase-sentinel"></div>';
            html += '</div>';
            $stream.html(html);

            executeGregobaseSearch(false);
        } else if (state.filterType) {
            // VUE 2 : NAVIGATEUR DE CHANTS DANS UNE CATÉGORIE SÉLECTIONNÉE
            html += renderChantBrowserHeader();
            html += '<div id="gregobaseResultsContainer" class="gregorian-results is-' + state.viewMode + '"></div>';
            html += '<div id="gregobaseSentinel" class="gregobase-sentinel"></div>';
            html += '</div>';
            $stream.html(html);

            populateFilteredChants();
        } else {
            // VUE 3 : TRIÉ PAR CATÉGORIES COMME AVANT (selon l'onglet actif dans le header)
            html += '<div id="gregobaseTabContent" class="gregobase-tab-content">';
            html += renderTabContent(state.tab);
            html += '</div>';
            html += '</div>';
            $stream.html(html);
        }

        window.scrollTo({ top: 0, behavior: 'instant' });
    }

    // Synchronisation de l'état actif des chips du header
    function syncCategoryChipsUI() {
        $('#gregobaseFilterBar .gregorian-filter-chip[data-tab]').removeClass('active');
        if (!state.searchQuery) {
            $('#gregobaseFilterBar .gregorian-filter-chip[data-tab="' + state.tab + '"]').addClass('active');
        }
    }

    // Rendu du contenu selon l'onglet actif (trié par catégories comme avant)
    function renderTabContent(tab) {
        switch (tab) {
            case 'incipit':
                return renderAllIncipitsView();
            case 'mode':
                return renderAllModesView();
            case 'source':
                return renderAllSourcesView();
            case 'tag':
                return renderAllTagsView();
            case 'usage':
            default:
                return renderAllUsagesView();
        }
    }

    // 1. Vue des Usages liturgiques (24 catégories)
    function renderAllUsagesView() {
        var preferredOrder = [
            'Antiphona', 'Responsorium', 'Hymnus', 'Introitus', 'Graduale', 'Alleluia',
            'Tractus', 'Offertorium', 'Communio', 'Kyriale', 'Sequentia', 'Chant',
            'Responsorium breve', 'Canticum', 'Psalmus', 'Oratio', 'Praefationes',
            'Supplicatio', 'Varia', 'Tropa', 'Prosa', 'Improperia', 'Rhythmus', 'Toni Communes'
        ];

        var usagesKeys = Object.keys(indexes.usages);
        var sortedUsages = usagesKeys.sort(function(a, b) {
            var idxA = preferredOrder.indexOf(a);
            var idxB = preferredOrder.indexOf(b);
            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1;
            if (idxB !== -1) return 1;
            return (indexes.usages[b] || []).length - (indexes.usages[a] || []).length;
        });

        var html = '<div class="gregobase-category-grid">';
        sortedUsages.forEach(function(uName) {
            var items = indexes.usages[uName] || [];
            html += '<div class="gregobase-category-card" data-filter-type="usage" data-filter-value="' + escapeHtml(uName) + '">';
            html += '  <span class="gregobase-cat-name">' + escapeHtml(uName) + '</span>';
            html += '  <span class="gregobase-cat-count">' + items.length.toLocaleString('fr-FR') + '</span>';
            html += '</div>';
        });
        html += '</div>';
        return html;
    }

    // 2. Vue des Incipits (A–Z)
    function renderAllIncipitsView() {
        var letters = ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P','Q','R','S','T','U','V','W','Z','#'];
        var html = '<div class="gregobase-alphabet-grid">';
        letters.forEach(function(letter) {
            var count = (indexes.incipits[letter] || []).length;
            html += '<div class="gregobase-letter-card" data-filter-type="incipit" data-filter-value="' + letter + '">';
            html += '  <span class="gregobase-letter-char">' + (letter === '#' ? '…' : letter) + '</span>';
            html += '  <span class="gregobase-letter-count">' + count.toLocaleString('fr-FR') + '</span>';
            html += '</div>';
        });
        html += '</div>';
        return html;
    }

    // 3. Vue des Modes (I à VIII + Peregrinus)
    function renderAllModesView() {
        var html = '<div class="gregobase-category-grid">';
        for (var m = 1; m <= 8; m++) {
            var mStr = String(m);
            var mInfo = MODE_METADATA[mStr];
            var mCount = (indexes.modes[mStr] || []).length;
            html += '<div class="gregobase-category-card" data-filter-type="mode" data-filter-value="' + mStr + '">';
            html += '  <span class="gregobase-cat-name">Mode ' + mInfo.roman + ' (' + mInfo.name + ')</span>';
            html += '  <span class="gregobase-cat-count">' + mCount.toLocaleString('fr-FR') + '</span>';
            html += '</div>';
        }

        var pCount = (indexes.modes['p'] || []).length;
        if (pCount) {
            html += '<div class="gregobase-category-card" data-filter-type="mode" data-filter-value="p">';
            html += '  <span class="gregobase-cat-name">Tonus Peregrinus</span>';
            html += '  <span class="gregobase-cat-count">' + pCount.toLocaleString('fr-FR') + '</span>';
            html += '</div>';
        }
        html += '</div>';
        return html;
    }

    // 4. Vue des Sources (Livres & Éditions)
    function renderAllSourcesView() {
        var sortedSources = Object.keys(indexes.sources).sort(function(a, b) {
            return indexes.sources[b].length - indexes.sources[a].length;
        });

        var html = '<div class="gregobase-category-grid">';
        sortedSources.forEach(function(sName) {
            var sCount = indexes.sources[sName].length;
            html += '<div class="gregobase-category-card" data-filter-type="source" data-filter-value="' + escapeHtml(sName) + '">';
            html += '  <span class="gregobase-cat-name" title="' + escapeHtml(sName) + '">' + escapeHtml(sName) + '</span>';
            html += '  <span class="gregobase-cat-count">' + sCount.toLocaleString('fr-FR') + '</span>';
            html += '</div>';
        });
        html += '</div>';
        return html;
    }

    // 5. Vue des Tags & Thèmes
    function renderAllTagsView() {
        var sortedTags = Object.keys(indexes.tags).sort(function(a, b) {
            return indexes.tags[b].length - indexes.tags[a].length;
        });

        var html = '<div class="gregobase-category-grid">';
        sortedTags.forEach(function(tName) {
            var tCount = indexes.tags[tName].length;
            html += '<div class="gregobase-category-card" data-filter-type="tag" data-filter-value="' + escapeHtml(tName) + '">';
            html += '  <span class="gregobase-cat-name">' + escapeHtml(tName) + '</span>';
            html += '  <span class="gregobase-cat-count">' + tCount.toLocaleString('fr-FR') + '</span>';
            html += '</div>';
        });
        html += '</div>';
        return html;
    }

    // En-tête du navigateur de catégorie (2 lignes compactes)
    function renderChantBrowserHeader() {
        var fLabel = '';
        var fType = state.filterType;
        var fVal = state.filterValue;

        if (fType === 'usage') fLabel = fVal;
        else if (fType === 'incipit') fLabel = (fVal === '#' ? 'Sans incipit' : 'Incipit ' + fVal);
        else if (fType === 'mode') fLabel = 'Mode ' + (MODE_METADATA[fVal] ? MODE_METADATA[fVal].roman : fVal);
        else if (fType === 'source') fLabel = fVal;
        else if (fType === 'tag') fLabel = fVal;
        else fLabel = fVal || 'Partitions';

        var html = '';
        html += '<div class="gregobase-browser-header-group">';

        // Ligne 1 : Bouton Retour, Titre de la catégorie et Bascule de vue
        html += '  <div class="gregobase-browser-top-row">';
        html += '    <div class="gregobase-browser-left">';
        html += '      <button class="gregobase-back-btn" id="btnGregobaseBack" aria-label="Retour aux catégories">';
        html += '        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>';
        html += '        <span>Retour</span>';
        html += '      </button>';
        html += '      <div class="gregobase-category-heading">';
        html += '        <span class="gregobase-category-title">' + escapeHtml(fLabel) + '</span>';
        html += '        <span class="gregobase-category-pill" id="gregobaseBrowserCount">...</span>';
        html += '      </div>';
        html += '    </div>';
        html += '    <div class="gregobase-browser-right">';
        html += '      <button class="gregobase-view-toggle-btn" id="gregobaseBrowserViewToggle" title="Changer de vue" aria-label="Changer de vue">';
        if (typeof window.getViewToggleIconHtml === 'function') {
            html += window.getViewToggleIconHtml(state.viewMode);
        } else {
            html += '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/></svg>';
        }
        html += '      </button>';
        html += '    </div>';
        html += '  </div>';

        // Ligne 2 : Filtres internes à la catégorie
        html += '  <div class="gregobase-browser-filter-row">';
        html += '    <div class="gregobase-filter-search">';
        html += '      <span class="gregobase-search-icon">';
        html += '        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M10 2a8 8 0 0 1 6.32 12.9l5.39 5.38a1 1 0 0 1-1.42 1.42l-5.38-5.39A8 8 0 1 1 10 2zm0 2a6 6 0 1 0 0 12 6 6 0 0 0 0-12z"/></svg>';
        html += '      </span>';
        html += '      <input type="text" id="gregobaseBrowserSearchInput" placeholder="Filtrer dans ' + escapeHtml(fLabel) + '..." value="' + escapeHtml(state.inCategoryQuery) + '" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">';
        html += '      <button id="gregobaseBrowserClearSearch" class="gregorian-clear-btn' + (state.inCategoryQuery ? '' : ' hidden') + '" style="right:8px; position:absolute;" aria-label="Effacer">';
        html += '        <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
        html += '      </button>';
        html += '    </div>';

        html += '    <div class="gregobase-filter-actions">';
        if (fType !== 'mode') {
            html += '      <select class="gregobase-select-filter" id="gregobaseSubModeSelect" aria-label="Filtrer par mode">';
            html += '        <option value="">Tous modes</option>';
            for (var m = 1; m <= 8; m++) {
                var sel = (state.subMode === String(m)) ? ' selected' : '';
                html += '<option value="' + m + '"' + sel + '>Mode ' + m + '</option>';
            }
            html += '      </select>';
        }

        var nabcActiveClass = state.subNabcOnly ? ' active' : '';
        html += '      <button class="gregobase-filter-pill-nabc' + nabcActiveClass + '" id="gregobaseNabcFilterToggle" title="Afficher uniquement les pièces avec neumes anciens">';
        html += '        <span>NABC</span>';
        html += '      </button>';
        html += '    </div>';

        html += '  </div>';
        html += '</div>';

        return html;
    }

    // Ouvrir une catégorie spécifique
    function openCategory(filterType, filterValue) {
        state.filterType = filterType;
        state.filterValue = filterValue;
        state.inCategoryQuery = '';
        state.subMode = '';
        state.subNabcOnly = false;
        state.loadedCount = 0;
        state.matchingChants = [];
        renderMainView();
    }

    // Exécuter la recherche globale dans Grégobase
    function executeGregobaseSearch(isLoadMore) {
        buildGregobaseIndex();
        var q = (state.searchQuery || '').trim();
        var engine = window.GregorianSearchEngine || window.gregorianSearchEngine;

        if (!isLoadMore) {
            state.searchLoadedCount = 0;
            state.searchMatchingChants = [];
        }

        var total = 0;
        var results = [];

        if (q && engine) {
            var searchRes = engine.executeSearch(q, { part: 'chant' }, PAGE_SIZE, state.searchLoadedCount);
            results = searchRes.results || [];
            total = searchRes.totalMatches || 0;
        } else if (q) {
            var qNorm = normalizeLatin(q);
            var filtered = allChants.filter(function(c) {
                var inc = normalizeLatin(c.incipit || '');
                var txt = normalizeLatin(c.fullTextLa || '');
                return inc.indexOf(qNorm) !== -1 || txt.indexOf(qNorm) !== -1;
            });
            total = filtered.length;
            results = filtered.slice(state.searchLoadedCount, state.searchLoadedCount + PAGE_SIZE);
        } else {
            total = allChants.length;
            results = allChants.slice(state.searchLoadedCount, state.searchLoadedCount + PAGE_SIZE);
        }

        if (!isLoadMore) {
            state.searchMatchingChants = results;
            state.searchLoadedCount = results.length;
            var label = total.toLocaleString('fr-FR') + ' partition' + (total > 1 ? 's trouvées' : ' trouvée') + ' pour « ' + escapeHtml(q) + ' »';
            $('#gregobaseSearchResultCount').text(label);
            $('#gregobaseResultsContainer').empty();
        } else {
            state.searchMatchingChants = state.searchMatchingChants.concat(results);
            state.searchLoadedCount += results.length;
        }

        renderChantBatchResults(results, !isLoadMore, total, true);
    }

    // Filtrer et afficher les chants de la catégorie sélectionnée
    function populateFilteredChants() {
        var baseList = [];
        var fType = state.filterType;
        var fVal = state.filterValue;

        if (fType === 'usage') {
            baseList = indexes.usages[fVal] || [];
        } else if (fType === 'incipit') {
            baseList = indexes.incipits[fVal] || [];
        } else if (fType === 'mode') {
            baseList = indexes.modes[fVal] || [];
        } else if (fType === 'source') {
            baseList = indexes.sources[fVal] || [];
        } else if (fType === 'tag') {
            baseList = indexes.tags[fVal] || [];
        } else {
            baseList = allChants;
        }

        var filtered = baseList;

        // Sous-filtre texte interne
        if (state.inCategoryQuery && state.inCategoryQuery.trim()) {
            var q = normalizeLatin(state.inCategoryQuery.trim());
            filtered = filtered.filter(function(c) {
                var incNorm = normalizeLatin(c.incipit || '');
                var textNorm = normalizeLatin(c.fullTextLa || '');
                return incNorm.indexOf(q) !== -1 || textNorm.indexOf(q) !== -1;
            });
        }

        // Sous-filtre mode
        if (state.subMode) {
            filtered = filtered.filter(function(c) {
                return (c.mode || '').trim() === state.subMode;
            });
        }

        // Sous-filtre NABC
        if (state.subNabcOnly) {
            filtered = filtered.filter(function(c) {
                return c.has_nabc || (c.tags && c.tags.indexOf('NABC') !== -1) || c.nabc_lines > 0;
            });
        }

        state.matchingChants = filtered;
        state.loadedCount = 0;

        $('#gregobaseBrowserCount').text(filtered.length.toLocaleString('fr-FR') + ' partitions');

        loadMoreCategoryChants(true);
    }

    // Charger les chants de la catégorie par lots
    function loadMoreCategoryChants(isInitial) {
        var total = state.matchingChants.length;
        if (total === 0) {
            $('#gregobaseResultsContainer').html('<div style="grid-column: 1/-1; text-align:center; padding: 48px 16px; color: var(--text-tertiary); font-family: \'Inter\', sans-serif;">Aucune partition ne correspond à vos critères dans cette catégorie.</div>');
            $('#gregobaseSentinel').empty().hide();
            return;
        }

        var start = state.loadedCount;
        var end = Math.min(start + PAGE_SIZE, total);
        var batch = state.matchingChants.slice(start, end);
        state.loadedCount = end;

        renderChantBatchResults(batch, isInitial, total, false);
    }

    // Générer et insérer le HTML des cartes de chants (Style Quærere)
    function renderChantBatchResults(batch, isInitial, total, isSearch) {
        var $container = $('#gregobaseResultsContainer');
        var $sentinel = $('#gregobaseSentinel');
        var currentLoaded = isSearch ? state.searchLoadedCount : state.loadedCount;

        if (total === 0) {
            $container.html('<div style="grid-column: 1/-1; text-align:center; padding: 48px 16px; color: var(--text-tertiary); font-family: \'Inter\', sans-serif;">Aucune partition trouvée.</div>');
            $sentinel.empty().hide();
            return;
        }

        var html = '';
        batch.forEach(function(item) {
            var rawIncipit = item.incipit || 'Sans incipit';
            var incipitHtml = escapeHtml(rawIncipit);
            var part = item.part || 'Chant';
            var mode = item.mode ? ('Mode ' + item.mode) : '';
            var source = item.book ? item.book.split(';')[0].split('&')[0].trim() : 'GregoBase';
            var hasNabc = item.has_nabc || (item.tags || '').indexOf('NABC') !== -1 || item.nabc_lines > 0;

            html += '<div class="gregorian-card" data-chant-id="' + item.id + '" style="cursor: pointer;">';
            html += '  <div class="gregorian-card-header">';
            html += '    <div class="gregorian-card-titles">';
            html += '      <div class="gregorian-card-incipit" title="' + escapeHtml(rawIncipit) + '">' + incipitHtml + '</div>';
            html += '      <div class="gregorian-card-source" title="' + escapeHtml(source) + '">' + escapeHtml(source) + '</div>';
            html += '    </div>';
            html += '    <div class="gregorian-card-badges">';
            html += '      <span class="gregorian-badge-part">' + escapeHtml(part) + '</span>';
            if (mode) {
                html += '      <span class="gregorian-badge-mode">' + escapeHtml(mode) + '</span>';
            }
            if (hasNabc) {
                html += '      <span class="gregorian-badge-part do-badge-nabc" title="Neumes adiastématiques anciens">NABC</span>';
            }
            html += '    </div>';
            html += '  </div>';

            // Conteneur de partition grégorienne dynamique
            html += '  <div class="gregorian-score-container gregorian-skeleton">';
            html += '    <div class="gregorian-score-loader">';
            html += '      <div class="gregorian-skeleton-staff">';
            html += '        <div class="gregorian-staff-line"></div><div class="gregorian-staff-line"></div><div class="gregorian-staff-line"></div><div class="gregorian-staff-line"></div>';
            html += '      </div>';
            html += '      <div class="gregorian-skeleton-staff">';
            html += '        <div class="gregorian-staff-line"></div><div class="gregorian-staff-line"></div><div class="gregorian-staff-line"></div><div class="gregorian-staff-line"></div>';
            html += '      </div>';
            html += '    </div>';
            html += '  </div>';

            // Actions de la carte
            html += '  <div class="gregorian-card-actions">';
            html += '    <button class="gregorian-action-btn btn-play-chant" title="Écouter">';
            html += '      <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
            html += '      <span>Écouter</span>';
            html += '    </button>';
            html += '    <div style="display:flex; gap:6px;">';
            html += '      <button class="gregorian-action-btn btn-copy-gabc" title="Copier le code GABC">';
            html += '        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
            html += '        <span>GABC</span>';
            html += '      </button>';
            html += '      <button class="gregorian-action-btn btn-zoom-chant" title="Agrandir la partition">';
            html += '        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6"></path><path d="M9 21H3v-6"></path><path d="M21 3l-7 7"></path><path d="M3 21l7-7"></path></svg>';
            html += '        <span>Zoom</span>';
            html += '      </button>';
            html += '    </div>';
            html += '  </div>';

            html += '</div>';
        });

        if (isInitial) {
            $container.html(html);
        } else {
            $container.append(html);
        }

        // Observer pour le rendu SVG différé
        initChantsScoreObserver($container);

        // Observer pour le défilement infini
        if (currentLoaded < total) {
            $sentinel.html('<div style="color:var(--text-tertiary); font-size:0.8rem; font-family:\'Inter\',sans-serif;">Chargement des partitions suivantes...</div>').show();
            initSentinelObserver(isSearch);
        } else {
            $sentinel.empty().hide();
        }
    }

    // Observer pour le défilement infini
    function initSentinelObserver(isSearch) {
        if (sentinelObserver) sentinelObserver.disconnect();
        var sentinelEl = document.getElementById('gregobaseSentinel');
        if (!sentinelEl || typeof IntersectionObserver === 'undefined') return;

        sentinelObserver = new IntersectionObserver(function(entries) {
            if (entries[0] && entries[0].isIntersecting) {
                if (isSearch) {
                    if (state.searchLoadedCount < (state.searchMatchingChants.length || 99999)) {
                        executeGregobaseSearch(true);
                    }
                } else {
                    if (state.loadedCount < state.matchingChants.length) {
                        loadMoreCategoryChants(false);
                    }
                }
            }
        }, { rootMargin: '300px' });

        sentinelObserver.observe(sentinelEl);
    }

    // Observer pour le rendu Exsurge SVG des cartes visibles
    function initChantsScoreObserver($container) {
        if (state.viewMode === 'list') {
            return;
        }

        if (typeof IntersectionObserver === 'undefined') {
            $container.find('.gregorian-card[data-chant-id]').slice(0, 8).each(function() {
                var $c = $(this);
                $c.data('is-visible', true);
                renderCardScore($c);
            });
            return;
        }

        if (!scoreObserver) {
            scoreObserver = new IntersectionObserver(function(entries) {
                entries.forEach(function(entry) {
                    var $card = $(entry.target);
                    if (entry.isIntersecting) {
                        $card.data('is-visible', true);
                        renderCardScore($card);
                    } else {
                        $card.data('is-visible', false);
                    }
                });
            }, {
                root: null,
                rootMargin: '200px 0px',
                threshold: 0.01
            });
        }

        $container.find('.gregorian-card[data-chant-id]').each(function() {
            var $c = $(this);
            if (!$c.find('.gregorian-score-container').hasClass('is-rendered')) {
                scoreObserver.observe(this);
            }
        });

        // Rendu immédiat du premier lot visible
        $container.find('.gregorian-card[data-chant-id]').slice(0, 6).each(function() {
            var $c = $(this);
            $c.data('is-visible', true);
            renderCardScore($c);
        });
    }

    // Rendu de la partition dans la vignette de la carte
    async function renderCardScore($card) {
        if (state.viewMode === 'list') return;
        var chantId = $card.data('chant-id');
        var $scoreContainer = $card.find('.gregorian-score-container');
        if (!$scoreContainer.length || $scoreContainer.hasClass('is-rendered') || $card.data('is-rendering')) return;

        $card.data('is-rendering', true);
        if (scoreObserver) scoreObserver.unobserve($card[0]);

        try {
            if (!window.gregorianDB || typeof window.gregorianDB.getGabc !== 'function') {
                $card.data('is-rendering', false);
                return;
            }

            var gabc = await window.gregorianDB.getGabc(chantId);
            if (!gabc) {
                $scoreContainer.html('<div style="color: var(--text-tertiary); font-size: 0.75rem; padding: 12px 0;">GABC non disponible</div>');
                $card.data('is-rendering', false);
                return;
            }

            $card.data('chant-gabc', gabc);

            // 1. Délégation au moteur éprouvé de rendu universel de l'application
            if (typeof window.renderGregorianGabcToContainer === 'function') {
                var previewGabc = (window.gregorianSearchUI && typeof window.gregorianSearchUI.truncateGabcByNotes === 'function')
                    ? window.gregorianSearchUI.truncateGabcByNotes(gabc, 45, 60)
                    : gabc;

                window.renderGregorianGabcToContainer($scoreContainer[0], previewGabc, function(score) {
                    $card.data('chant-score', score);
                    $scoreContainer.removeClass('gregorian-skeleton').addClass('is-rendered').find('.gregorian-score-loader').remove();
                    $card.data('is-rendering', false);
                }, false);
            } else if (typeof exsurge !== 'undefined') {
                // 2. Rendu direct robuste via Exsurge (createSvgNode)
                var ctxt = new exsurge.ChantContext();
                var curTheme = document.documentElement.getAttribute('data-theme') || 'dark';
                var isDark = (curTheme !== 'light');
                ctxt.textColor = isDark ? '#ffffff' : '#111317';
                ctxt.noteColor = isDark ? '#ffffff' : '#111317';
                ctxt.neumeLineColor = isDark ? '#ffffff' : '#111317';
                ctxt.dividerLineColor = isDark ? '#ffffff' : '#111317';
                ctxt.staffLineColor = isDark ? 'rgba(255, 255, 255, 0.55)' : 'rgba(0, 0, 0, 0.45)';
                ctxt.setGlyphScaling(1 / 11);
                ctxt.setFont("'Crimson Text', 'Libre Baskerville', serif", 17.5);
                ctxt.setRubricColor('#c96b63');
                ctxt.lyricTextColor = isDark ? '#ffffff' : '#111317';
                ctxt.lyricTextFont = "'Crimson Text', 'Libre Baskerville', serif";

                var cleanGabc = gabc;
                if (typeof window.preprocessGabcForExsurge === 'function') {
                    cleanGabc = window.preprocessGabcForExsurge(cleanGabc);
                }
                var mappings = exsurge.Gabc.createMappingsFromSource(ctxt, cleanGabc);
                var score = new exsurge.ChantScore(ctxt, mappings, false);
                $card.data('chant-score', score);

                score.performLayout(ctxt);
                var scoreContainer = $scoreContainer[0];
                var width = scoreContainer.clientWidth || 320;
                score.layoutWidth = width;
                score.performLayout(ctxt);

                var svgNode = score.createSvgNode(ctxt);
                if (svgNode) {
                    svgNode.setAttribute('preserveAspectRatio', 'xMinYMin meet');
                    scoreContainer.innerHTML = '';
                    scoreContainer.appendChild(svgNode);
                    $scoreContainer.removeClass('gregorian-skeleton').addClass('is-rendered').find('.gregorian-score-loader').remove();
                }
                $card.data('is-rendering', false);
            } else {
                $scoreContainer.removeClass('gregorian-skeleton').find('.gregorian-score-loader').remove();
                $card.data('is-rendering', false);
            }
        } catch (err) {
            console.warn('[Grégobase] Erreur rendu vignette score', chantId, err);
            $scoreContainer.removeClass('gregorian-skeleton').find('.gregorian-score-loader').remove();
            $card.data('is-rendering', false);
        }
    }

    // Ouvrir Grégobase
    function openGregobase(filterType, filterValue) {
        if (window.doState) {
            window.doState.hora = 'gregobase';
            localStorage.setItem('do_hora', 'gregobase');
        }

        $('.do-nav-item').removeClass('active');
        $('#btnSidebarGregobase').addClass('active');

        if (typeof window.closeSidebarMobile === 'function') {
            window.closeSidebarMobile();
        }

        if (filterType && filterValue !== undefined) {
            state.filterType = filterType;
            state.filterValue = filterValue;
            state.searchQuery = '';
        }

        if (window.OremusRouter && typeof window.OremusRouter.syncUrl === 'function') {
            window.OremusRouter.syncUrl({ push: true });
        }

        renderMainView();
    }

    // Initialisation des événements utilisateurs
    function initEvents() {
        // Clic sur l'item Grégobase dans la Sidebar
        $(document).on('click', '#btnSidebarGregobase', function(e) {
            e.preventDefault();
            if (typeof window.triggerHapticFeedback === 'function') window.triggerHapticFeedback('selection');
            openGregobase();
        });

        // Clic sur les chips de catégories dans l'en-tête (Ligne 2)
        $(document).on('click', '#gregobaseFilterBar .gregorian-filter-chip[data-tab]', function(e) {
            e.preventDefault();
            var tab = $(this).data('tab');
            if (!tab) return;
            if (typeof window.triggerHapticFeedback === 'function') window.triggerHapticFeedback('selection');
            state.tab = tab;
            state.filterType = null;
            state.filterValue = null;
            state.searchQuery = '';
            $('#gregobaseSearchInput').val('');
            $('#gregobaseClearSearch').addClass('hidden');
            renderMainView();
        });

        // Défilement fluide à la molette sur la barre de chips du header
        $(document).on('wheel', '#gregobaseFilterBar', function(e) {
            var evt = e.originalEvent || e;
            if (evt.deltaY !== 0 && this.scrollWidth > this.clientWidth) {
                e.preventDefault();
                this.scrollLeft += evt.deltaY;
            }
        });

        // Clic sur une carte de catégorie (Usages, Modes, Sources, Tags) ou de lettre (Incipits)
        $(document).on('click', '.gregobase-category-card, .gregobase-letter-card', function(e) {
            if ($(e.target).closest('.gregobase-view-toggle-btn').length) return;
            var fType = $(this).data('filter-type');
            var fVal = $(this).data('filter-value');
            if (fType && fVal !== undefined) {
                if (typeof window.triggerHapticFeedback === 'function') window.triggerHapticFeedback('selection');
                openCategory(fType, String(fVal));
            }
        });

        // Clic sur le bouton Retour du navigateur de chants
        $(document).on('click', '#btnGregobaseBack', function() {
            if (typeof window.triggerHapticFeedback === 'function') window.triggerHapticFeedback('selection');
            state.filterType = null;
            state.filterValue = null;
            state.inCategoryQuery = '';
            state.subMode = '';
            state.subNabcOnly = false;
            renderMainView();
        });

        // Saisie dans la barre de recherche Grégobase de l'en-tête (Ligne 1)
        var debounceSearch = null;
        $(document).on('input', '#gregobaseSearchInput', function() {
            var val = $(this).val();
            state.searchQuery = val;
            $('#gregobaseClearSearch').toggleClass('hidden', !val);

            clearTimeout(debounceSearch);
            debounceSearch = setTimeout(function() {
                if (state.searchQuery && state.searchQuery.trim()) {
                    state.filterType = null;
                    state.filterValue = null;
                    if (!$('#gregobaseSearchResultCount').length) {
                        renderMainView();
                    } else {
                        executeGregobaseSearch(false);
                    }
                } else {
                    renderMainView();
                }
            }, 180);
        });

        // Effacer la recherche globale dans l'en-tête
        $(document).on('click', '#gregobaseClearSearch', function() {
            $('#gregobaseSearchInput').val('').focus();
            state.searchQuery = '';
            $(this).addClass('hidden');
            renderMainView();
        });

        // Bascule de vue dans l'en-tête (Ligne 1) ou dans la barre de résultat
        $(document).on('click', '#gregobaseToggleViewBtn, #gregobaseSearchToggleViewBtn, #gregobaseBrowserViewToggle', function() {
            state.viewMode = (state.viewMode === 'grid') ? 'list' : 'grid';
            localStorage.setItem('gregobase_view_mode', state.viewMode);
            localStorage.setItem('gregorian_view_mode', state.viewMode);

            $('#gregobaseResultsContainer').attr('class', 'gregorian-results is-' + state.viewMode);
            var iconHtml = (typeof window.getViewToggleIconHtml === 'function')
                ? window.getViewToggleIconHtml(state.viewMode)
                : '';
            if (iconHtml) {
                $('#gregobaseToggleViewBtn, #gregobaseSearchToggleViewBtn, #gregobaseBrowserViewToggle').html(iconHtml);
            }

            if (state.viewMode === 'grid') {
                initChantsScoreObserver($('#gregobaseResultsContainer'));
            }
        });

        // Saisie dans le filtre interne à une catégorie
        var debounceInCat = null;
        $(document).on('input', '#gregobaseBrowserSearchInput', function() {
            var val = $(this).val();
            state.inCategoryQuery = val;
            $('#gregobaseBrowserClearSearch').toggleClass('hidden', !val);
            clearTimeout(debounceInCat);
            debounceInCat = setTimeout(function() {
                populateFilteredChants();
            }, 180);
        });

        // Effacer le filtre interne
        $(document).on('click', '#gregobaseBrowserClearSearch', function() {
            $('#gregobaseBrowserSearchInput').val('').focus();
            state.inCategoryQuery = '';
            $(this).addClass('hidden');
            populateFilteredChants();
        });

        // Sous-filtre par Mode dans la catégorie
        $(document).on('change', '#gregobaseSubModeSelect', function() {
            state.subMode = $(this).val();
            populateFilteredChants();
        });

        // Sous-filtre NABC dans la catégorie
        $(document).on('click', '#gregobaseNabcFilterToggle', function() {
            state.subNabcOnly = !state.subNabcOnly;
            $(this).toggleClass('active', state.subNabcOnly);
            populateFilteredChants();
        });

        // Clic sur une pièce grégorienne -> OUVERTURE DU CHANT IDENTIQUE À QUÆRERE
        $(document).on('click', '.gregobase-page .gregorian-card[data-chant-id], .gregobase-page .btn-zoom-chant', function(e) {
            if ($(e.target).closest('.btn-play-chant, .btn-copy-gabc').length) return;
            e.preventDefault();
            e.stopPropagation();
            if (typeof window.triggerHapticFeedback === 'function') window.triggerHapticFeedback('selection');
            var chantId = $(this).closest('.gregorian-card').data('chant-id');
            if (chantId && typeof window.openChantMainView === 'function') {
                window.openChantMainView(chantId, false);
            }
        });

        // Clic bouton Écouter
        $(document).on('click', '.gregobase-page .btn-play-chant', function(e) {
            e.preventDefault();
            e.stopPropagation();
            var $card = $(this).closest('.gregorian-card');
            var chantId = $card.data('chant-id');

            var $btn = $(this);
            if ($btn.hasClass('is-playing')) {
                $btn.removeClass('is-playing').html('<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg><span>Écouter</span>');
                if (typeof window.stopScoreChant === 'function') window.stopScoreChant();
                return;
            }

            $('.btn-play-chant').removeClass('is-playing').html('<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg><span>Écouter</span>');
            $btn.addClass('is-playing').html('<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg><span>Arrêter</span>');

            var score = $card.data('chant-score');
            if (score && typeof window.playScoreChant === 'function') {
                window.playScoreChant(score, function() {
                    $btn.removeClass('is-playing').html('<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg><span>Écouter</span>');
                });
            } else if (typeof window.tones !== 'undefined') {
                window.tones.play('C4', 1500);
                setTimeout(function() {
                    $btn.removeClass('is-playing').html('<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg><span>Écouter</span>');
                }, 1500);
            }
        });

        // Clic bouton Copier GABC
        $(document).on('click', '.gregobase-page .btn-copy-gabc', async function(e) {
            e.preventDefault();
            e.stopPropagation();
            var $card = $(this).closest('.gregorian-card');
            var chantId = $card.data('chant-id');
            var gabc = $card.data('chant-gabc');

            if (!gabc && window.gregorianDB) {
                gabc = await window.gregorianDB.getGabc(chantId);
            }

            if (gabc) {
                try {
                    await navigator.clipboard.writeText(gabc);
                    var $btn = $(this);
                    var originalHtml = $btn.html();
                    $btn.html('<span>Copié !</span>');
                    setTimeout(function() {
                        $btn.html(originalHtml);
                    }, 1500);
                } catch (err) {
                    alert('GABC :\n\n' + gabc);
                }
            }
        });

        // Gestion du hash d'URL #gregobase ou #scores
        if (window.location && (window.location.hash === '#gregobase' || window.location.hash === '#scores')) {
            setTimeout(function() {
                openGregobase();
            }, 100);
        }
    }

    // Exports
    window.gregobaseUI = {
        renderMainView: renderMainView,
        openCategory: openCategory,
        openGregobase: openGregobase,
        getState: function() { return state; },
        setState: function(st) { Object.assign(state, st); },
        buildIndex: buildGregobaseIndex
    };

    window.openGregobase = openGregobase;

    $(document).ready(function() {
        initEvents();
    });

})(window, jQuery);
