/**
 * =========================================================================
 * Oremus - gregorian_search_ui.js
 * Contrôleur de Recherche Universelle & Défilement Infini / Rendu Différé
 * =========================================================================
 */

(function(window, $) {
    'use strict';

    var PAGE_SIZE = 50;
    var worker = null;
    var searchDebounceTimer = null;
    var currentQuery = '';
    var currentFilterPart = '';
    var currentFilterMode = '';
    var currentViewMode = localStorage.getItem('gregorian_view_mode') || 'grid';
    var isWorkerReady = false;
    var observer = null;
    var sentinelObserver = null;
    var currentLoadedCount = 0;
    var currentTotalCount = 0;
    var isLoadingMore = false;

    // Normalisation du latin liturgique et des diacritiques
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

    // Initialisation du Web Worker et chargement robuste de l'index universel
    function initWorker() {
        if (worker) return;
        try {
            worker = new Worker('js/gregorian_search_worker.js?v=2.58&ts=' + Date.now());
            worker.onmessage = handleWorkerMessage;
            worker.onerror = function(err) {
                console.error('[GregorianUI] Erreur Worker:', err);
            };

            // 1. Tenter l'initialisation interne par le Worker
            worker.postMessage({
                type: 'INIT',
                payload: {
                    url: 'data/gregorian_index.json?v=3.2&ts=' + Date.now()
                }
            });

            // 2. En parallèle, charger aussi l'index depuis le thread principal pour garantir le fonctionnement sous Android Capacitor
            loadIndexFromMainThread();
        } catch (e) {
            console.warn('[GregorianUI] Impossible d\'instancier le Web Worker:', e);
        }
    }

    var isIndexLoadedFromMain = false;
    function loadIndexFromMainThread() {
        if (isIndexLoadedFromMain) return;
        var urls = [
            'data/gregorian_index.json?v=3.2',
            './data/gregorian_index.json?v=3.2',
            '../data/gregorian_index.json?v=3.2'
        ];

        function tryFetch(i) {
            if (i >= urls.length) return;
            fetch(urls[i])
                .then(function(res) {
                    if (!res.ok) throw new Error('HTTP ' + res.status);
                    return res.json();
                })
                .then(function(jsonData) {
                    if (isIndexLoadedFromMain) return;
                    isIndexLoadedFromMain = true;
                    console.log('[GregorianUI] Index universel chargé avec succès via thread principal (' + (Array.isArray(jsonData) ? jsonData.length : 0) + ' éléments)');
                    if (worker) {
                        worker.postMessage({
                            type: 'LOAD_DATA',
                            payload: { data: jsonData }
                        });
                    }
                })
                .catch(function() {
                    tryFetch(i + 1);
                });
        }

        tryFetch(0);
    }

    // Réception des messages du Web Worker
    function handleWorkerMessage(e) {
        var msg = e.data || {};
        var type = msg.type;
        var payload = msg.payload || {};

        switch (type) {
            case 'INIT_DONE':
            case 'LOAD_DATA_DONE':
                isWorkerReady = true;
                $('#gregorianTotalBadge').text(payload.totalChants + ' éléments');
                if (window.doState && window.doState.hora === 'gregorian_search') {
                    triggerSearch(false);
                }
                break;

            case 'INIT_ERROR':
                console.warn('[GregorianUI] Worker INIT_ERROR, secours via thread principal:', payload.error);
                loadIndexFromMainThread();
                break;

            case 'SEARCH_RESULTS':
                renderSearchResults(payload);
                break;

            default:
                break;
        }
    }

    // IntersectionObserver pour le Lazy Rendering des partitions en mode grille
    // IntersectionObserver pour le Lazy Rendering des partitions visibles à l'écran avec annulation
    function initIntersectionObserver() {
        if (observer) {
            observer.disconnect();
        }
        if (typeof IntersectionObserver === 'undefined') {
            return;
        }

        observer = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                var target = entry.target;
                var $target = $(target);
                if (entry.isIntersecting) {
                    $target.data('is-visible', true);
                    lazyRenderChantScore($target);
                } else {
                    $target.data('is-visible', false);
                }
            });
        }, {
            root: null,
            rootMargin: '100px 0px',
            threshold: 0.01
        });
    }

    // Sentinel IntersectionObserver pour le défilement infini / chargement paresseux continu
    function initSentinelObserver() {
        if (sentinelObserver) {
            sentinelObserver.disconnect();
        }
        if (typeof IntersectionObserver === 'undefined') {
            return;
        }

        var sentinelEl = document.getElementById('gregorianScrollSentinel');
        if (!sentinelEl) return;

        sentinelObserver = new IntersectionObserver(function(entries) {
            entries.forEach(function(entry) {
                if (entry.isIntersecting && !isLoadingMore && currentLoadedCount < currentTotalCount) {
                    triggerSearch(true);
                }
            });
        }, {
            root: null,
            rootMargin: '300px 0px',
            threshold: 0.01
        });

        sentinelObserver.observe(sentinelEl);
    }

    // Assainissement autonome et complet du code GABC pour Exsurge
    function sanitizeGabc(gabc) {
        if (!gabc || typeof gabc !== 'string') return gabc;
        // 1. Traitement <eu>...</eu>
        gabc = gabc.replace(/<eu>([\s\S]*?)<\/eu>/gi, function(match, inner) {
            return inner.replace(/(^|\))([^()]+)(?=\(|$)/g, function(m, closeParen, text) {
                var trimmed = text.trim();
                if (!trimmed) return m;
                return closeParen + ' <c><i>' + trimmed + '</i></c> ';
            });
        }).replace(/<\/?eu>/gi, '');
        // 2. Supprimer TOUTES les balises de lignes supplémentaires [ll:*] et crochets
        gabc = gabc.replace(/\[[ou]?ll:[^\]]*\]/ig, '');
        gabc = gabc.replace(/\[(?:cs|alt|nobar)[^\]]*\]/ig, '');
        // 3. Normaliser \Vbar, \Rbar, <sp>...</sp>
        gabc = gabc.replace(/<v>\\([VRA])bar<\/v>/gi, function(m, b) {
            return b.toUpperCase() + '/.';
        }).replace(/<sp>([VRA])\/?<\/sp>\.?/gi, function(m, b) {
            return b.toUpperCase() + '/.';
        });
        // 4. Nettoyer les suffixes de numérotation .0, .1
        gabc = gabc.replace(/\.([0-9]+)(?=\))/g, '');
        return gabc;
    }

    // Tronquer intelligemment une partition GABC par nombre de notes en respectant les mots entiers
    function truncateGabcByNotes(gabc, targetNotes, maxTotalNotes) {
        if (!gabc) return '';
        targetNotes = targetNotes || 28;
        maxTotalNotes = maxTotalNotes || 36;

        gabc = sanitizeGabc(gabc);

        var parts = gabc.split('%%');
        if (parts.length < 2) return gabc;
        var header = parts.slice(0, -1).join('%%') + '%%';
        var body = parts[parts.length - 1];

        // Parser token par token: text, paren, notes, isWordEnd
        var tokenRegex = /([^\s()]+)?\s*(\([^)]*\))(\s*)/g;
        var match;
        var tokens = [];
        var isFirst = true;

        while ((match = tokenRegex.exec(body)) !== null) {
            var text = match[1] || '';
            var paren = match[2] || '';
            var trailingSpace = match[3] || '';
            var matchEnd = tokenRegex.lastIndex;

            // Clé initiale (ex: (c4), (f3), (cb3), etc.)
            if (isFirst && (!text || text === '') && /^\([c|f][b]?[1-4]\)$/i.test(paren)) {
                isFirst = false;
                tokens.push({ text: '', paren: paren, notes: 0, isClef: true, isWordEnd: true, end: matchEnd });
                continue;
            }
            isFirst = false;

            var pContent = paren.slice(1, -1);
            var isBar = /^[:;,.*~]+$/.test(pContent.trim()) || text.trim() === '*' || text.trim() === '†';
            var notesMatch = pContent.match(/[a-m]/gi);
            var nNotes = isBar ? 0 : (notesMatch ? notesMatch.length : 0);

            // Détection de fin de mot
            var isWordEnd = trailingSpace.length > 0 || isBar || text.indexOf(',') !== -1 || text.indexOf('.') !== -1 || text.indexOf(';') !== -1;

            tokens.push({
                text: text,
                paren: paren,
                notes: nNotes,
                isBar: isBar,
                isWordEnd: isWordEnd,
                isMelisma: nNotes >= 6,
                end: matchEnd
            });
        }

        var accumulatedNotes = 0;
        var cutIndex = -1;
        var i = 0;

        while (i < tokens.length) {
            var t = tokens[i];
            if (t.isClef) {
                cutIndex = t.end;
                i++;
                continue;
            }

            accumulatedNotes += t.notes;
            cutIndex = t.end;

            if (accumulatedNotes >= targetNotes) {
                // Si on est à la fin d'un mot, on coupe proprement
                if (t.isWordEnd) {
                    break;
                }
                // Sinon, tenter de terminer le mot en cours sauf si la fin est une très longue mélisme
                var canFinishWord = true;
                var peekIndex = i + 1;
                var peekNotes = 0;
                var wordEndPeekIndex = -1;

                while (peekIndex < tokens.length) {
                    var nextT = tokens[peekIndex];
                    if (nextT.isMelisma || (accumulatedNotes + peekNotes + nextT.notes > maxTotalNotes)) {
                        canFinishWord = false;
                        break;
                    }
                    peekNotes += nextT.notes;
                    if (nextT.isWordEnd) {
                        wordEndPeekIndex = nextT.end;
                        i = peekIndex;
                        accumulatedNotes += peekNotes;
                        break;
                    }
                    peekIndex++;
                }

                if (canFinishWord && wordEndPeekIndex !== -1) {
                    cutIndex = wordEndPeekIndex;
                }
                break;
            }

            i++;
        }

        if (cutIndex !== -1 && cutIndex < body.length) {
            var truncatedBody = body.substring(0, cutIndex).trim();
            if (!truncatedBody.endsWith('(::)') && !truncatedBody.endsWith('(:)') && !truncatedBody.endsWith('(;)')) {
                truncatedBody += ' (::)';
            }
            return header + '\n' + truncatedBody;
        }
        return gabc;
    }

    // Extrait une fenêtre GABC centrée autour du mot-clé recherché avec ses neumes avant/après et les paroles surlignées
    function extractGabcWindowWithHighlight(gabc, query, minNotes, maxNotes) {
        if (!gabc) return '';
        minNotes = minNotes || 45;
        maxNotes = maxNotes || 60;

        gabc = sanitizeGabc(gabc);

        var parts = gabc.split('%%');
        if (parts.length < 2) return gabc;
        var header = parts.slice(0, -1).join('%%') + '%%';
        var body = parts[parts.length - 1].trim();

        if (!query || !query.trim()) {
            return truncateGabcByNotes(gabc, minNotes, maxNotes);
        }

        // Trouver la clef initiale
        var clefMatch = body.match(/^\s*(\([cf]b?[1-4]\))/i);
        var initialClef = clefMatch ? clefMatch[1] : '(c4)';

        var normQ = normalizeLatin(query);
        var qTokens = normQ.split(/\s+/).filter(function(w) { return w.length > 1; });
        if (qTokens.length === 0) {
            return truncateGabcByNotes(gabc, minNotes, maxNotes);
        }

        // Découper le corps GABC en unités lexicales (texte + parenthèses de notes)
        var units = [];
        var current = '';
        var inParen = false;

        for (var i = 0; i < body.length; i++) {
            var char = body[i];
            if (char === '(') inParen = true;
            else if (char === ')') inParen = false;

            if (/\s/.test(char) && !inParen) {
                if (current.trim()) {
                    units.push(current.trim());
                    current = '';
                }
            } else {
                current += char;
            }
        }
        if (current.trim()) units.push(current.trim());

        // Compter les notes dans chaque unité et extraire le texte pur
        var unitNotes = [];
        var unitTexts = [];
        var lastKnownClef = initialClef;
        var unitClefs = [];

        for (var u = 0; u < units.length; u++) {
            var unitStr = units[u];
            var cm = unitStr.match(/\([cf]b?[1-4]\)/i);
            if (cm) lastKnownClef = cm[0];
            unitClefs.push(lastKnownClef);

            var noteCount = 0;
            var parenMatches = unitStr.match(/\(([^)]+)\)/g);
            if (parenMatches) {
                parenMatches.forEach(function(pm) {
                    var inner = pm.slice(1, -1).replace(/[,\.\:\;\!\?\/_\'\"\s]/g, '');
                    noteCount += inner.length;
                });
            }
            unitNotes.push(noteCount);

            var textOnly = unitStr.replace(/\([^)]*\)/g, '').replace(/<[^>]*>/g, '');
            unitTexts.push(normalizeLatin(textOnly));
        }

        // Trouver le match
        var matchStartIdx = -1;
        var matchEndIdx = -1;

        // 1. Séquence exacte
        for (var i = 0; i <= unitTexts.length - qTokens.length; i++) {
            var isSeq = true;
            for (var j = 0; j < qTokens.length; j++) {
                if (!unitTexts[i + j] || unitTexts[i + j].indexOf(qTokens[j]) === -1) {
                    isSeq = false;
                    break;
                }
            }
            if (isSeq) {
                matchStartIdx = i;
                matchEndIdx = i + qTokens.length - 1;
                break;
            }
        }

        // 2. Token unique
        if (matchStartIdx === -1) {
            for (var i = 0; i < unitTexts.length; i++) {
                for (var t = 0; t < qTokens.length; t++) {
                    if (unitTexts[i] && unitTexts[i].indexOf(qTokens[t]) !== -1) {
                        matchStartIdx = i;
                        matchEndIdx = i;
                        break;
                    }
                }
                if (matchStartIdx !== -1) break;
            }
        }

        // Si aucun match dans les paroles du GABC, retourner le début par défaut
        if (matchStartIdx === -1) {
            return truncateGabcByNotes(gabc, minNotes, maxNotes);
        }

        // Calculer la fenêtre : accumuler ~16 notes avant et ~35 notes après
        var targetNotesBefore = 16;
        var accumulatedBefore = 0;
        var windowStart = matchStartIdx;

        while (windowStart > 0 && accumulatedBefore < targetNotesBefore) {
            windowStart--;
            accumulatedBefore += unitNotes[windowStart];
        }

        var windowEnd = matchEndIdx;
        var accumulatedTotal = accumulatedBefore;
        for (var m = matchStartIdx; m <= matchEndIdx; m++) {
            accumulatedTotal += unitNotes[m];
        }

        while (windowEnd < units.length - 1 && accumulatedTotal < maxNotes) {
            windowEnd++;
            accumulatedTotal += unitNotes[windowEnd];
        }

        // Reconstruire les unités avec clef active et tags <c><b>...</b></c> sur les mots matchés
        var resultUnits = [];
        var activeClef = unitClefs[windowStart] || initialClef;

        if (windowStart > 0) {
            resultUnits.push(activeClef);
        }

        for (var k = windowStart; k <= windowEnd; k++) {
            var un = units[k];
            if (windowStart > 0 && /^\([cf]b?[1-4]\)$/i.test(un)) {
                continue; // éviter duplication de clef au tout début
            }

            if (k >= matchStartIdx && k <= matchEndIdx) {
                // Surligner le texte en rubric/bold
                un = un.replace(/([^()]+)(\([^)]*\))/g, '<c><b>$1</b></c>$2');
                if (!/\([^)]*\)$/.test(un) && !/<c>/.test(un)) {
                    un = '<c><b>' + un + '</b></c>';
                }
            }

            resultUnits.push(un);
        }

        var resultBody = resultUnits.join(' ').trim();
        if (!resultBody.endsWith('(::)') && !resultBody.endsWith('(:)') && !resultBody.endsWith('(;)')) {
            resultBody += ' (::)';
        }

        return header + '\n' + resultBody;
    }

    // Rendu différé de la partition GABC via Exsurge (strictement visible à l'écran, annulé si hors écran)
    async function lazyRenderChantScore($card) {
        if (currentViewMode === 'list') return;
        if (!$card.data('is-visible')) return;
        var chantId = $card.data('chant-id');
        var $scoreContainer = $card.find('.gregorian-score-container');
        if (!$scoreContainer.length || $scoreContainer.hasClass('is-rendered') || $card.data('is-rendering')) return;

        $card.data('is-rendering', true);

        try {
            var gabc = await window.gregorianDB.getGabc(chantId);
            if (!$card.data('is-visible')) {
                $card.data('is-rendering', false);
                return; // Annulation si la carte n'est plus visible à l'écran
            }

            if (!gabc) {
                $scoreContainer.html('<div class="gregorian-score-error" style="color: var(--text-tertiary); font-size: 0.8rem;">GABC indisponible</div>');
                $card.data('is-rendering', false);
                return;
            }

            // Si une recherche est active, extraire la fenêtre GABC centrée sur le mot recherché avec ses notes avant/après et paroles surlignées
            var previewGabc = currentQuery
                ? extractGabcWindowWithHighlight(gabc, currentQuery, 45, 60)
                : truncateGabcByNotes(gabc, 45, 60);

            renderGabcToContainer($scoreContainer[0], previewGabc, function(score) {
                if (!$card.data('is-visible')) {
                    $card.data('is-rendering', false);
                    return; // Annulation si scroll rapide avant affichage
                }
                $card.data('chant-score', score);
                $card.data('chant-gabc', gabc);
                $scoreContainer.removeClass('gregorian-skeleton').addClass('is-rendered').find('.gregorian-score-loader').remove();
                $card.data('is-rendering', false);
                if (observer) observer.unobserve($card[0]);
            }, false);
        } catch (e) {
            console.error('[GregorianUI] Erreur rendu chant ID ' + chantId, e);
            $scoreContainer.html('<div class="gregorian-score-error" style="color: var(--text-tertiary); font-size: 0.8rem;">Erreur de rendu</div>');
            $card.data('is-rendering', false);
        }
    }

    // Conversion GABC -> SVG vectoriel avec Exsurge (Thème sombre/clair natif & Sans fond blanc)
    function renderGabcToContainer(containerEl, gabcString, onScoreReady, isZoom) {
        if (typeof exsurge === 'undefined') {
            $(containerEl).html('<pre style="font-size:0.75rem; white-space:pre-wrap; color: var(--text-primary);">' + escapeHtml(gabcString) + '</pre>');
            return;
        }

        try {
            var ctxt = new exsurge.ChantContext();
            var curTheme = document.documentElement.getAttribute('data-theme') || 'dark';
            var isDark = (curTheme !== 'light');
            var accentColor = '#c96b63';

            ctxt.textColor = isDark ? '#ffffff' : '#111317';
            ctxt.noteColor = isDark ? '#ffffff' : '#111317';
            ctxt.neumeLineColor = isDark ? '#ffffff' : '#111317';
            ctxt.dividerLineColor = isDark ? '#ffffff' : '#111317';
            ctxt.staffLineColor = isDark ? 'rgba(255, 255, 255, 0.55)' : 'rgba(0, 0, 0, 0.45)';

            if (!isZoom) {
                // Mode vignette miniature (grille de recherche) : zoom accru et neumes bien grands
                ctxt.setGlyphScaling(1 / 11);
                ctxt.setFont("'Crimson Text', 'Libre Baskerville', serif", 17.5);
            } else {
                // Mode lecture plein écran : EXACTEMENT la même taille (16px) et proportion que dans la Messe
                ctxt.setFont("'Crimson Text', 'Libre Baskerville', serif", 16);
            }

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

            var cleanGabc = sanitizeGabc(gabcString);
            if (typeof window.preprocessGabcForExsurge === 'function') {
                cleanGabc = window.preprocessGabcForExsurge(cleanGabc);
            }

            var mappings = exsurge.Gabc.createMappingsFromSource(ctxt, cleanGabc);
            var score = new exsurge.ChantScore(ctxt, mappings, true);

            var header = parseGabcHeader(gabcString);
            var romanNumeral = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
            var partAbbrev = {
                verse: 'V/.', tractus: 'TRACT.', offertorium: 'OFFERT.',
                introitus: 'INTR.', graduale: 'GRAD.', communio: 'COMM.',
                sequentia: 'SEQ.', hymnus: 'HYMN.', antiphona: 'ANT.',
                responsorium: 'RESP.', canticum: 'CANT.', alleluia: 'ALLEL.',
                kyrie: 'KYRIE', gloria: 'GLORIA', credo: 'CREDO',
                sanctus: 'SANCTUS', agnus: 'AGNUS'
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
                var rawPart = (header['office-part'] || '').toLowerCase();
                var abbrev = partAbbrev[rawPart] || header['office-part'] || '';
                if (abbrev) topAnnotation = (abbrev === 'V/.' || abbrev === 'TRACT.' || abbrev === 'SEQ.') ? abbrev : abbrev.toUpperCase();
                var rawMode = header.mode;
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

            // Largeur de portée calibrée pour un zoom parfait en vignette
            var layoutWidth = isZoom
                ? Math.max(280, (window.innerWidth || 600) - 24)
                : 260;

            ctxt.width = layoutWidth;

            // performLayout obligatoire avant layoutChantLines pour initialiser les signes Exsurge
            score.performLayout(ctxt);

            score.layoutChantLines(ctxt, layoutWidth, function() {
                // En mode miniature vignette (grille), ne conserver strictement que les 2 premières lignes complètes
                if (!isZoom && score.lines && score.lines.length >= 2) {
                    var line0 = score.lines[0];
                    var line1 = score.lines[1];
                    delete line1.custos; // Supprimer le guidon de renvoi vers une 3e ligne
                    score.lines = [line0, line1];
                    score.bounds.x = 0;
                    score.bounds.y = 0;
                    score.bounds.width = Math.max(line0.bounds.width, line1.bounds.width);
                    score.bounds.height = line1.bounds.y + line1.bounds.height + 4;
                }

                var svg = score.createSvgNode(ctxt);
                if (svg) {
                    svg.setAttribute('width', '100%');
                    svg.setAttribute('overflow', 'hidden');
                    svg.style.width = '100%';
                    svg.style.maxWidth = '100%';
                    svg.style.height = 'auto';
                    svg.style.overflow = 'hidden';

                    var noteFill = isDark ? '#ffffff' : '#111317';
                    svg.setAttribute('fill', noteFill);
                    svg.style.fill = noteFill;

                    containerEl.innerHTML = '';
                    containerEl.appendChild(svg);

                    if (typeof onScoreReady === 'function') {
                        onScoreReady(score, ctxt);
                    }
                }
            });
        } catch (err) {
            console.warn('[GregorianUI] Exsurge render error:', err);
            $(containerEl).html('<div style="font-size: 0.8rem; color: var(--text-tertiary); padding: 8px;">Aperçu non disponible</div>');
        }
    }

    // Générer le HTML des cartes squelettes adaptatives pour le sentinel de chargement continu
    function getSentinelSkeletonHtml() {
        var w = window.innerWidth || document.documentElement.clientWidth || 800;
        var count = 4;
        if (w >= 1600) count = 12;
        else if (w >= 1280) count = 10;
        else if (w >= 900) count = 8;
        else if (w >= 600) count = 6;

        if (currentViewMode === 'list') {
            var listCount = Math.min(count, 5);
            var listCards = '';
            for (var k = 0; k < listCount; k++) {
                var wTitle = 45 + (k % 3) * 15;
                listCards += 
                    '<div class="gregorian-card gregorian-skeleton-card" style="aspect-ratio: auto; min-height: 48px; padding: 10px 14px; flex-direction: row; align-items: center; justify-content: space-between; margin-bottom: 6px;">' +
                    '  <div class="gregorian-title-skeleton do-skel" style="width: ' + wTitle + '%; height: 16px; margin: 0;"></div>' +
                    '  <div class="gregorian-title-skeleton do-skel" style="width: 54px; height: 16px; border-radius: 9999px; margin: 0;"></div>' +
                    '</div>';
            }
            return '<div class="gregorian-results is-list" style="margin-top: 8px;">' + listCards + '</div>';
        }

        var cards = '';
        for (var i = 0; i < count; i++) {
            var titleWidth = (i % 3 === 0) ? 'w70' : ((i % 3 === 1) ? 'w60' : 'w80');
            cards +=
                '  <div class="gregorian-card gregorian-skeleton-card">' +
                '    <div class="gregorian-title-skeleton do-skel ' + titleWidth + '"></div>' +
                '    <div class="gregorian-score-container gregorian-skeleton">' +
                '      <div class="gregorian-score-loader">' +
                '        <div class="gregorian-skeleton-staff">' +
                '          <div class="gregorian-staff-line"></div>' +
                '          <div class="gregorian-staff-line"></div>' +
                '          <div class="gregorian-staff-line"></div>' +
                '          <div class="gregorian-staff-line"></div>' +
                '        </div>' +
                '        <div class="gregorian-skeleton-staff">' +
                '          <div class="gregorian-staff-line"></div>' +
                '          <div class="gregorian-staff-line"></div>' +
                '          <div class="gregorian-staff-line"></div>' +
                '          <div class="gregorian-staff-line"></div>' +
                '        </div>' +
                '      </div>' +
                '    </div>' +
                '  </div>';
        }
        return '<div class="gregorian-skeleton-grid">' + cards + '</div>';
    }

    function getState() {
        return {
            query: currentQuery || '',
            part: currentFilterPart || '',
            mode: currentFilterMode || '',
            view: currentViewMode || 'grid'
        };
    }

    function setState(state) {
        if (!state) return;
        if (state.query !== undefined) {
            currentQuery = state.query;
            var $inp = $('#gregorianSearchInput');
            if ($inp.length && $inp.val() !== state.query) {
                $inp.val(state.query);
                $('#gregorianClearSearch').toggleClass('hidden', !state.query);
            }
        }
        if (state.part !== undefined) {
            currentFilterPart = state.part;
            $('.gregorian-filter-chip[data-part]').removeClass('active');
            if (state.part) {
                $('.gregorian-filter-chip[data-part="' + state.part + '"]').addClass('active');
            }
        }
        if (state.mode !== undefined) {
            currentFilterMode = state.mode ? String(state.mode) : '';
            $('.gregorian-filter-chip[data-mode]').removeClass('active');
            if (currentFilterMode) {
                $('.gregorian-filter-chip[data-mode="' + currentFilterMode + '"]').addClass('active');
            }
        }
        if (state.view !== undefined && state.view) {
            currentViewMode = state.view;
            localStorage.setItem('gregorian_view_mode', currentViewMode);
            $('#gregorianResultsContainer').removeClass('is-grid is-list').addClass('is-' + currentViewMode);
            $('#gregorianToggleViewBtn').html(getViewToggleIconHtml(currentViewMode));
        }
    }

    // Déclenchement de la recherche vers le Web Worker (Support du chargement continu par lots)
    function triggerSearch(isAppend) {
        if (!worker || !isWorkerReady) return;

        var query = $('#gregorianSearchInput').val();
        if (query === undefined) query = currentQuery || '';
        currentQuery = query;

        if (!isAppend) {
            currentLoadedCount = 0;
            isLoadingMore = false;
            if (window.OremusRouter && window.doState && window.doState.hora === 'gregorian_search') {
                window.OremusRouter.syncUrl({ push: false });
            }
        } else {
            if (isLoadingMore || (currentTotalCount > 0 && currentLoadedCount >= currentTotalCount)) return;
            isLoadingMore = true;
            $('#gregorianScrollSentinel').html(getSentinelSkeletonHtml()).show();
        }

        var userLang = (window.doState && window.doState.vernacularLang) ? window.doState.vernacularLang : (localStorage.getItem('do_vernacular_lang') || 'fr');
        worker.postMessage({
            type: 'SEARCH',
            payload: {
                query: query,
                filters: {
                    part: currentFilterPart,
                    mode: currentFilterMode,
                    lang: userLang
                },
                filterPart: currentFilterPart,
                filterMode: currentFilterMode,
                limit: PAGE_SIZE,
                offset: isAppend ? currentLoadedCount : 0,
                append: isAppend || false
            }
        });
    }

    // Affichage des résultats de recherche unifiée (Offices, Messes, Bible, Chants)
    function renderSearchResults(payload) {
        var items = payload.results || [];
        var isAppend = payload.append || false;
        var total = (payload.totalCount !== undefined) ? payload.totalCount : ((payload.totalFound !== undefined) ? payload.totalFound : items.length);
        var timeMs = (payload.tookMs !== undefined) ? payload.tookMs : (payload.timeMs || 0);

        currentTotalCount = total;
        if (!isAppend) {
            currentLoadedCount = items.length;
        } else {
            currentLoadedCount += items.length;
        }
        isLoadingMore = false;

        var $countEl = $('#gregorianResultCount');
        var $container = $('#gregorianResultsContainer');
        var $sentinel = $('#gregorianScrollSentinel');

        if (!$container.length) return;

        if (total === 0 || items.length === 0) {
            $countEl.text('0 résultat (' + timeMs + ' ms)');
            if (!isAppend) {
                $container.html(
                    '<div class="gregorian-empty-state">' +
                    '  <div class="gregorian-empty-icon">' +
                    '    <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>' +
                    '  </div>' +
                    '  <h3>Aucun résultat trouvé</h3>' +
                    '  <p>Essayez un autre mot-clé, office, messe, livre biblique ou pièce grégorienne.</p>' +
                    '</div>'
                );
            }
            $sentinel.empty().hide();
            return;
        }

        var countText = total + ' résultat' + (total > 1 ? 's' : '') + ' (' + timeMs + ' ms)';
        $countEl.text(countText);

        var html = '';
        items.forEach(function(item) {
            var incipitHtml = item.highlightedIncipit || escapeHtml(item.incipit || 'Sans titre');
            var rawIncipit = escapeHtml(item.incipit || 'Sans titre');
            var part = escapeHtml(item.part || 'Chant');
            var mode = item.mode ? ('Mode ' + escapeHtml(item.mode)) : '';
            var source = escapeHtml(item.book || item.ref || 'Oremus');
            var itemType = item.type || 'chant';
            var hasSnippet = !!(currentQuery && item.matchSnippet);
            var snippetClass = hasSnippet ? ' has-match-snippet' : '';

            if (itemType === 'officium') {
                var previewHtml = hasSnippet 
                    ? ('<p>' + item.matchSnippet + '</p>')
                    : (item.latinPreview || '<p class="do-dialog-line"><span class="do-resp-sym V">℣.</span> Deus, in adjutórium meum inténde.</p>');
                html += '<div class="gregorian-card gregorian-card-officium' + snippetClass + '" data-item-type="officium" data-hora="' + escapeHtml(item.hora || 'laudes') + '">';
                html += '  <div class="gregorian-card-header">';
                html += '    <div class="gregorian-card-titles">';
                html += '      <div class="gregorian-card-incipit" title="' + rawIncipit + '">' + incipitHtml + '</div>';
                html += '      <div class="gregorian-card-source">' + source + '</div>';
                html += '    </div>';
                html += '    <div class="gregorian-card-badges">';
                html += '      <span class="gregorian-badge-part">Office</span>';
                html += '    </div>';
                html += '  </div>';
                html += '  <div class="gregorian-text-preview">' + previewHtml + '</div>';
                html += '  <div class="gregorian-card-actions" style="justify-content: flex-end;">';
                html += '    <button class="gregorian-action-btn btn-open-hora" style="background: var(--primary-color, #c96b63); color: #ffffff; font-weight: 600;">';
                html += '      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>';
                html += '      <span>Prier l\'Office</span>';
                html += '    </button>';
                html += '  </div>';
                html += '</div>';

            } else if (itemType === 'missa') {
                var colorClass = item.color || 'green';
                var rankText = item.rank || 'Missa';
                var previewHtml = hasSnippet 
                    ? ('<p>' + item.matchSnippet + '</p>')
                    : (item.latinPreview || '<div class="do-rubric-inline">Introitus</div><p>Ad te levávi ánimam meam...</p>');
                html += '<div class="gregorian-card gregorian-card-missa' + snippetClass + '" data-item-type="missa" data-missa-key="' + escapeHtml(item.key || '') + '">';
                html += '  <div class="gregorian-card-header">';
                html += '    <div class="gregorian-card-titles">';
                html += '      <div class="gregorian-card-incipit" title="' + rawIncipit + '"><span class="hdd-color-dot ' + colorClass + '"></span>' + incipitHtml + '</div>';
                html += '      <div class="gregorian-card-source">' + source + '</div>';
                html += '    </div>';
                html += '    <div class="gregorian-card-badges">';
                html += '      <span class="gregorian-badge-part">' + escapeHtml(rankText) + '</span>';
                html += '    </div>';
                html += '  </div>';
                html += '  <div class="gregorian-text-preview">' + previewHtml + '</div>';
                html += '  <div class="gregorian-card-actions" style="justify-content: flex-end;">';
                html += '    <button class="gregorian-action-btn btn-open-missa" style="background: var(--primary-color, #c96b63); color: #ffffff; font-weight: 600;">';
                html += '      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>';
                html += '      <span>Prier la Messe</span>';
                html += '    </button>';
                html += '  </div>';
                html += '</div>';

            } else if (itemType === 'bible') {
                var previewHtml = hasSnippet 
                    ? ('<p>' + item.matchSnippet + '</p>')
                    : (item.latinPreview || '<span class="do-bible-vnum">1</span> In princípio...');
                html += '<div class="gregorian-card gregorian-card-bible' + snippetClass + '" data-item-type="bible" data-book-id="' + escapeHtml(item.bookId || '') + '">';
                html += '  <div class="gregorian-card-header">';
                html += '    <div class="gregorian-card-titles">';
                html += '      <div class="gregorian-card-incipit" title="' + rawIncipit + '">' + incipitHtml + '</div>';
                html += '      <div class="gregorian-card-source">' + source + '</div>';
                html += '    </div>';
                html += '    <div class="gregorian-card-badges">';
                html += '      <span class="gregorian-badge-part">Bible</span>';
                html += '    </div>';
                html += '  </div>';
                html += '  <div class="gregorian-text-preview">' + previewHtml + '</div>';
                html += '  <div class="gregorian-card-actions" style="justify-content: flex-end;">';
                html += '    <button class="gregorian-action-btn btn-open-bible" style="background: var(--primary-color, #c96b63); color: #ffffff; font-weight: 600;">';
                html += '      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"></polyline></svg>';
                html += '      <span>Lire ce Livre</span>';
                html += '    </button>';
                html += '  </div>';
                html += '</div>';

            } else {
                // Type Chant Grégorien
                var isAdLib = (item.tags || '').indexOf('Ad Libitum') !== -1;
                html += '<div class="gregorian-card' + snippetClass + '" data-chant-id="' + item.id + '">';
                html += '  <div class="gregorian-card-header">';
                html += '    <div class="gregorian-card-titles">';
                html += '      <div class="gregorian-card-incipit" title="' + rawIncipit + '">' + incipitHtml + '</div>';
                html += '      <div class="gregorian-card-source" title="' + source + '">' + source + '</div>';
                html += '    </div>';
                html += '    <div class="gregorian-card-badges">';
                html += '      <span class="gregorian-badge-part">' + part + '</span>';
                if (isAdLib) {
                    html += '      <span class="gregorian-badge-part">Ad Libitum</span>';
                }
                if (mode) {
                    html += '      <span class="gregorian-badge-mode">' + mode + '</span>';
                }
                html += '    </div>';
                html += '  </div>';

                // Conteneur de partition grégorienne dynamique
                html += '  <div class="gregorian-score-container gregorian-skeleton">';
                html += '    <div class="gregorian-score-loader">';
                html += '      <div class="gregorian-skeleton-staff">';
                html += '        <div class="gregorian-staff-line"></div>';
                html += '        <div class="gregorian-staff-line"></div>';
                html += '        <div class="gregorian-staff-line"></div>';
                html += '        <div class="gregorian-staff-line"></div>';
                html += '      </div>';
                html += '      <div class="gregorian-skeleton-staff">';
                html += '        <div class="gregorian-staff-line"></div>';
                html += '        <div class="gregorian-staff-line"></div>';
                html += '        <div class="gregorian-staff-line"></div>';
                html += '        <div class="gregorian-staff-line"></div>';
                html += '      </div>';
                html += '    </div>';
                html += '  </div>';

                // Actions
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
            }
        });

        if (!isAppend) {
            $container.html(html);
        } else {
            $container.append(html);
        }

        // Observer les cartes pour le Lazy Rendering SVG en mode grille
        if (currentViewMode === 'grid') {
            initIntersectionObserver();
            $container.find('.gregorian-card[data-chant-id]').each(function() {
                var $c = $(this);
                if (!$c.find('.gregorian-score-container').hasClass('is-rendered')) {
                    if (observer) {
                        observer.observe(this);
                    } else {
                        lazyRenderChantScore($c);
                    }
                }
            });
        }

        // Gestion du Sentinel de défilement continu
        if (currentLoadedCount < total) {
            $sentinel.html(getSentinelSkeletonHtml()).show();
            initSentinelObserver();
        } else {
            $sentinel.empty().hide();
            if (sentinelObserver) sentinelObserver.disconnect();
        }
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

    // Écoute audio du chant
    function playChant($card) {
        var $btn = $card.find('.btn-play-chant');
        if ($btn.hasClass('is-playing')) {
            stopAudio();
            return;
        }

        stopAudio();
        $btn.addClass('is-playing').html(
            '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>' +
            '<span>Arrêter</span>'
        );

        var score = $card.data('chant-score');
        if (score && typeof window.playScoreChant === 'function') {
            window.playScoreChant(score, function() {
                stopAudio();
            });
        } else if (typeof window.tones !== 'undefined') {
            window.tones.play('C4', 1500);
            setTimeout(stopAudio, 1500);
        }
    }

    function stopAudio() {
        $('.btn-play-chant').removeClass('is-playing').html(
            '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>' +
            '<span>Écouter</span>'
        );
        if (typeof window.stopScoreChant === 'function') {
            window.stopScoreChant();
        }
    }

    // Icônes solides (fill sans stroke) pour le bouton de bascule de vue
    function getViewToggleIconHtml(mode) {
        if (mode === 'grid') {
            return '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><rect x="3" y="4.5" width="18" height="3" rx="1.5"/><rect x="3" y="10.5" width="18" height="3" rx="1.5"/><rect x="3" y="16.5" width="18" height="3" rx="1.5"/></svg>';
        } else {
            return '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/></svg>';
        }
    }

    // Rendu complet de la page de recherche dans #do-content-stream
    function renderMainView() {
        initWorker();
        var $stream = $('#do-content-stream').empty();

        // Synchronisation des éléments dans l'en-tête
        $('#gregorianSearchInput').val(currentQuery);
        $('#gregorianClearSearch').toggleClass('hidden', !currentQuery);
        $('#gregorianToggleViewBtn').html(getViewToggleIconHtml(currentViewMode));

        $('.gregorian-filter-chip[data-part]').removeClass('active');
        if (currentFilterPart) {
            $('.gregorian-filter-chip[data-part="' + currentFilterPart + '"]').addClass('active');
        } else {
            $('.gregorian-filter-chip[data-part=""]').addClass('active');
        }

        $('.gregorian-filter-chip[data-mode]').removeClass('active');
        if (currentFilterMode) {
            $('.gregorian-filter-chip[data-mode="' + currentFilterMode + '"]').addClass('active');
        }

        var html = '';
        html += '<div class="gregorian-search-page">';
        html += '  <div class="gregorian-meta-bar">';
        html += '    <span id="gregorianResultCount">Recherche dans Oremus...</span>';
        html += '    <span id="gregorianTotalBadge">...</span>';
        html += '  </div>';
        html += '  <div id="gregorianResultsContainer" class="gregorian-results is-' + currentViewMode + '"></div>';
        html += '  <div id="gregorianScrollSentinel" class="gregorian-scroll-sentinel"></div>';
        html += '</div>';

        $stream.html(html);

        triggerSearch(false);
    }

    // Événements globaux
    function initEvents() {
        // Saisie dans le champ de recherche
        $(document).on('input', '#gregorianSearchInput', function() {
            var val = $(this).val();
            $('#gregorianClearSearch').toggleClass('hidden', !val);

            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(function() {
                triggerSearch(false);
            }, 150);
        });

        // Effacer la recherche
        $(document).on('click', '#gregorianClearSearch', function() {
            $('#gregorianSearchInput').val('').focus();
            $(this).addClass('hidden');
            triggerSearch(false);
        });

        // Filtres par parties liturgiques et modes
        $(document).on('click', '.gregorian-filter-chip', function() {
            if ($(this).attr('data-part') !== undefined) {
                $('.gregorian-filter-chip[data-part]').removeClass('active');
                $(this).addClass('active');
                currentFilterPart = $(this).attr('data-part') || '';
            } else if ($(this).attr('data-mode') !== undefined) {
                if ($(this).hasClass('active')) {
                    $(this).removeClass('active');
                    currentFilterMode = '';
                } else {
                    $('.gregorian-filter-chip[data-mode]').removeClass('active');
                    $(this).addClass('active');
                    currentFilterMode = $(this).attr('data-mode') || '';
                }
            }
            triggerSearch(false);
        });

        // Bascule Grille / Liste
        $(document).on('click', '#gregorianToggleViewBtn', function() {
            currentViewMode = (currentViewMode === 'grid') ? 'list' : 'grid';
            localStorage.setItem('gregorian_view_mode', currentViewMode);
            $('#gregorianResultsContainer').removeClass('is-grid is-list').addClass('is-' + currentViewMode);
            $(this).html(getViewToggleIconHtml(currentViewMode));

            if (currentViewMode === 'grid') {
                initIntersectionObserver();
                $('#gregorianResultsContainer').find('.gregorian-card[data-chant-id]').each(function() {
                    var $c = $(this);
                    if (!$c.find('.gregorian-score-container').hasClass('is-rendered')) {
                        if (observer) {
                            observer.observe(this);
                        } else {
                            lazyRenderChantScore($c);
                        }
                    }
                });
            }
        });

        // Navigation vers un Office Divin
        $(document).on('click', '.btn-open-hora, .gregorian-card-officium', function(e) {
            e.stopPropagation();
            var hora = $(this).closest('.gregorian-card-officium').data('hora');
            if (hora && window.doState) {
                window.doState.hora = hora;
                localStorage.setItem('do_hora', hora);
                if (typeof window.renderDO === 'function') window.renderDO();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });

        // Navigation vers une Messe
        $(document).on('click', '.btn-open-missa, .gregorian-card-missa', function(e) {
            e.stopPropagation();
            var key = $(this).closest('.gregorian-card-missa').data('missa-key');
            if (window.doState) {
                window.doState.hora = 'missa';
                localStorage.setItem('do_hora', 'missa');
                if (key) {
                    window.doState.officiumKey = key;
                    localStorage.setItem('do_officiumKey', key);
                }
                if (typeof window.renderDO === 'function') window.renderDO();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });

        // Navigation vers un Livre de la Bible
        $(document).on('click', '.btn-open-bible, .gregorian-card-bible', function(e) {
            e.stopPropagation();
            var bookId = $(this).closest('.gregorian-card-bible').data('book-id');
            if (bookId && window.doState) {
                window.doState.hora = 'bible';
                window.doState.bible.book = bookId;
                window.doState.bible.chapter = 1;
                window.doState.bible.page = 1;
                localStorage.setItem('do_hora', 'bible');
                localStorage.setItem('do_bible_book', bookId);
                localStorage.setItem('do_bible_chapter', 1);
                localStorage.setItem('do_bible_page', 1);
                if (typeof window.renderDO === 'function') window.renderDO();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });

        // Actions sur les cartes grégoriennes (Recherche)
        $(document).on('click', '.btn-play-chant', function(e) {
            e.stopPropagation();
            var $card = $(this).closest('.gregorian-card');
            var chantId = $card.data('chant-id');
            renderChantMainView(chantId, true);
        });

        $(document).on('click', '.btn-copy-gabc', async function(e) {
            e.stopPropagation();
            var $card = $(this).closest('.gregorian-card');
            var chantId = $card.data('chant-id');
            var gabc = $card.data('chant-gabc') || await window.gregorianDB.getGabc(chantId);

            if (gabc) {
                try {
                    await navigator.clipboard.writeText(gabc);
                    var $btn = $(this);
                    var origText = $btn.find('span').text();
                    $btn.find('span').text('Copié !');
                    setTimeout(function() {
                        $btn.find('span').text(origText);
                    }, 1500);
                } catch (err) {
                    alert('GABC:\n\n' + gabc);
                }
            }
        });

        $(document).on('click', '.btn-zoom-chant, .gregorian-score-container, .gregorian-card[data-chant-id]', function(e) {
            if ($(e.target).closest('.btn-play-chant, .btn-copy-gabc').length) return;
            e.stopPropagation();
            var $card = $(this).closest('.gregorian-card');
            var chantId = $card.data('chant-id');
            renderChantMainView(chantId, false);
        });

        // Actions dans la vue plein écran de la pièce grégorienne
        $(document).on('click', '.btn-play-main-chant', function(e) {
            e.stopPropagation();
            var $card = $(this).closest('.do-chant-main-view-card');
            if (window.switchToChantCard) {
                window.switchToChantCard($card, true);
            }
        });

        $(document).on('click', '.btn-copy-main-gabc', async function(e) {
            e.stopPropagation();
            var $card = $(this).closest('.do-chant-main-view-card');
            var gabc = $card.data('chant-gabc');
            if (gabc) {
                try {
                    await navigator.clipboard.writeText(gabc);
                    var $btn = $(this);
                    var origText = $btn.find('span').text();
                    $btn.find('span').text('Copié !');
                    setTimeout(function() {
                        $btn.find('span').text(origText);
                    }, 1500);
                } catch (err) {
                    alert('GABC:\n\n' + gabc);
                }
            }
        });

        $(document).on('click', '.btn-download-main-gabc', function(e) {
            e.stopPropagation();
            var $card = $(this).closest('.do-chant-main-view-card');
            var gabc = $card.data('chant-gabc') || '';
            var title = $card.data('chant-title') || 'chant';
            if (gabc) {
                var blob = new Blob([gabc], { type: 'text/plain;charset=utf-8' });
                var url = URL.createObjectURL(blob);
                var a = document.createElement('a');
                a.href = url;
                a.download = title.replace(/[^a-zA-Z0-9_-]/g, '_') + '.gabc';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }
        });
    }

    // Afficher une pièce grégorienne en grand dans le lecteur principal (#do-content-stream)
    async function renderChantMainView(chantId, isAutoPlay) {
        if (!chantId && window.doState && window.doState.currentChantId) {
            chantId = window.doState.currentChantId;
        }
        if (!chantId) {
            chantId = localStorage.getItem('do_chant_id');
        }
        if (!chantId) {
            if (window.doState) {
                window.doState.hora = 'gregorian_search';
                localStorage.setItem('do_hora', 'gregorian_search');
            }
            renderMainView();
            return;
        }

        chantId = String(chantId).replace(/^#/, '').trim();

        // Fermer les modales et basculer l'état vers gregorian_chant
        if (typeof window.closeModals === 'function') window.closeModals();
        if (window.doState) {
            window.doState.hora = 'gregorian_chant';
            window.doState.currentChantId = chantId;
            localStorage.setItem('do_hora', 'gregorian_chant');
            localStorage.setItem('do_chant_id', chantId);
            if (window.OremusRouter) {
                window.OremusRouter.syncUrl({ push: true });
            }
        }

        $('body').removeClass('is-search-mode is-bible-mode').addClass('is-chant-mode');
        window.scrollTo({ top: 0, behavior: 'smooth' });

        var $stream = $('#do-content-stream').empty();
        $stream.html(
            '<div style="padding: 32px 16px 20px 16px; opacity: 0.85;">' +
            '  <div class="gregorian-title-skeleton do-skel w60" style="margin: 0 auto 16px auto;"></div>' +
            '  <div class="gregorian-title-skeleton do-skel w90" style="margin: 0 auto 24px auto;"></div>' +
            '  <div class="gregorian-score-loader" style="padding: 16px 0;">' +
            '    <div class="gregorian-skeleton-staff">' +
            '      <div class="gregorian-staff-line"></div><div class="gregorian-staff-line"></div><div class="gregorian-staff-line"></div><div class="gregorian-staff-line"></div>' +
            '    </div>' +
            '    <div class="gregorian-skeleton-staff">' +
            '      <div class="gregorian-staff-line"></div><div class="gregorian-staff-line"></div><div class="gregorian-staff-line"></div><div class="gregorian-staff-line"></div>' +
            '    </div>' +
            '    <div class="gregorian-skeleton-staff">' +
            '      <div class="gregorian-staff-line"></div><div class="gregorian-staff-line"></div><div class="gregorian-staff-line"></div><div class="gregorian-staff-line"></div>' +
            '    </div>' +
            '  </div>' +
            '</div>'
        );

        var gabc = await window.gregorianDB.getGabc(chantId);
        if (!gabc) {
            if (window.gregorianDB && typeof window.gregorianDB._loadFullDictionary === 'function') {
                var dict = await window.gregorianDB._loadFullDictionary();
                if (dict && dict[chantId]) {
                    gabc = dict[chantId];
                }
            }
        }

        if (!gabc) {
            $('#doHeaderTitle .title-text').text('Chant #' + chantId);
            $('#doHourLabel').text('CANTUS GREGORIANUS');
            $stream.html('<div class="do-card is-missa" style="padding: 24px; text-align: center; color: var(--text-tertiary);">Partition grégorienne non disponible pour le chant #' + escapeHtml(chantId) + '.</div>');
            return;
        }

        var header = parseGabcHeader(gabc);
        var title = header.name || ('Chant #' + chantId);
        var officePart = header['office-part'] || 'Chant';
        var mode = header.mode || '';
        var book = header.book || 'Graduale Romanum / Liber Usualis';
        var commentary = header.commentary || 'Tradition grégorienne';
        var transcriber = header.transcriber || 'Éditions Solesmes / GregoBase';

        // Mise à jour de l'en-tête principal
        $('#doHeaderTitle .title-text').text(title);
        var subHeader = 'CANTUS GREGORIANUS • ' + (mode ? ('MODUS ' + mode) : officePart.toUpperCase());
        $('#doHourLabel').text(subHeader.toUpperCase());

        var cardHtml = 
            '<div class="do-card is-missa" data-chant-id="' + chantId + '" data-chant-part="' + escapeHtml(officePart) + '" data-chant-title="' + escapeHtml(title) + '">' +
            '  <div class="do-card-body">' +
            '    <div class="do-chant-card-wrapper" data-chant-id="' + chantId + '">' +
            '      <div class="do-chant-card">' +
            '        <div class="do-chant-preview gregorian-skeleton">' + (typeof window.renderChantSkeleton === 'function' ? window.renderChantSkeleton(3) : '') + '</div>' +
            '      </div>' +
            '    </div>' +
            '    <div class="do-card-actions" style="margin: 16px 0 16px 0; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; justify-content: flex-start; padding: 0;">' +
            '      <button class="gregorian-action-btn btn-play-main-chant" style="background: var(--primary-color, #c96b63); color: #ffffff; font-weight: 600; padding: 7px 15px; border-radius: 8px; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; border: none;">' +
            '        <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>' +
            '        <span>Écouter</span>' +
            '      </button>' +
            '      <button class="gregorian-action-btn btn-copy-main-gabc" style="padding: 7px 13px; border-radius: 8px; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; background: var(--background-surface); color: var(--text-primary); border: 1px solid var(--border-color);">' +
            '        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>' +
            '        <span>Copier GABC</span>' +
            '      </button>' +
            '      <button class="gregorian-action-btn btn-download-main-gabc" style="padding: 7px 13px; border-radius: 8px; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; background: var(--background-surface); color: var(--text-primary); border: 1px solid var(--border-color);">' +
            '        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>' +
            '        <span>Télécharger .gabc</span>' +
            '      </button>' +
            '    </div>' +
            '    <div class="do-chant-meta-plain" style="margin-top: 16px; display: flex; flex-direction: column; gap: 4px; font-family: \'Inter\', sans-serif; font-size: 0.82rem; color: var(--text-secondary); line-height: 1.5; text-align: left;">' +
            (book ? ('      <div><span style="color: var(--text-tertiary); font-weight: 500;">Source &amp; Livre :</span> ' + escapeHtml(book) + '</div>') : '') +
            (commentary ? ('      <div><span style="color: var(--text-tertiary); font-weight: 500;">Référence :</span> ' + escapeHtml(commentary) + '</div>') : '') +
            '      <div><span style="color: var(--text-tertiary); font-weight: 500;">GregoBase :</span> <a href="https://gregobase.selapa.net/chant.php?id=' + encodeURIComponent(chantId) + '" target="_blank" rel="noopener noreferrer" style="color: var(--primary-color); text-decoration: underline; text-underline-offset: 2px;">https://gregobase.selapa.net/chant.php?id=' + escapeHtml(chantId) + '</a>' + (transcriber ? (' • <span style="color: var(--text-tertiary); font-weight: 500;">Transcripteur :</span> ' + escapeHtml(transcriber)) : '') + '</div>' +
            '    </div>' +
            '  </div>' +
            '</div>';

        var $card = $(cardHtml);
        $stream.empty().append($card);

        var $chantWrapper = $card.find('.do-chant-card-wrapper');
        $chantWrapper.data('cached-gabc', gabc);

        // Utilisation directe du moteur natif de la Messe
        if (typeof window.renderSingleChantScore === 'function') {
            window.renderSingleChantScore($chantWrapper, true);
        }

        var $chantCard = $card.find('.do-chant-card');

        // Handler pour le bouton "Écouter"
        $card.find('.btn-play-main-chant').off('click').on('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            if (typeof window.switchToChantCard === 'function') {
                window.switchToChantCard($chantCard, true);
            }
        });

        // Synchronisation avec le lecteur audio (fermé par défaut)
        if (isAutoPlay) {
            if (typeof window.switchToChantCard === 'function') {
                window.switchToChantCard($chantCard, true);
            }
        } else {
            if (typeof window.closeDoPlayer === 'function') {
                window.closeDoPlayer();
            }
        }
    }

    // Point d'entrée pour naviguer vers la recherche
    function openSearch(query) {
        if (query !== undefined) {
            currentQuery = query;
        }
        if (window.doState) {
            window.doState.hora = 'gregorian_search';
            localStorage.setItem('do_hora', 'gregorian_search');
            if (typeof window.closeModals === 'function') window.closeModals();
            if (typeof window.renderDO === 'function') window.renderDO();
            if (window.OremusRouter) {
                window.OremusRouter.syncUrl({ push: true });
            }
        } else {
            renderMainView();
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Exports
    window.gregorianSearchUI = {
        initWorker: initWorker,
        renderMainView: renderMainView,
        renderChantMainView: renderChantMainView,
        openSearch: openSearch,
        getState: getState,
        setState: setState
    };

    window.openGregorianSearch = openSearch;
    window.openChantMainView = renderChantMainView;

    $(document).ready(function() {
        initWorker();
        initEvents();
    });

})(window, jQuery);
