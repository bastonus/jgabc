/**
 * =========================================================================
 * Oremus - gregorian_db.js
 * Gestionnaire de stockage, cache local et distribution universelle
 * des partitions grégoriennes (IndexedDB, CacheStorage & GitHub Usercontent)
 * =========================================================================
 */

(function(window) {
    'use strict';

    if (!window.GABC_LOCAL_CACHE) {
        window.GABC_LOCAL_CACHE = {};
    }

    var DB_NAME = 'oremus_gabc_db';
    var DB_VERSION = 1;
    var STORE_NAME = 'chants';
    var GITHUB_BASE = 'https://raw.githubusercontent.com/bastonus/jgabc/master/';
    var JSDELIVR_BASE = 'https://cdn.jsdelivr.net/gh/bastonus/jgabc@master/';

    function isValidGabcText(txt) {
        if (!txt || typeof txt !== 'string') return false;
        var trimmed = txt.trim();
        if (trimmed.length < 5) return false;
        if (trimmed.startsWith('<') || trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('{"')) return false;
        return (trimmed.indexOf('(') !== -1 && trimmed.indexOf(')') !== -1) || trimmed.indexOf('%%') !== -1 || trimmed.indexOf('name:') !== -1;
    }

    function fetchWithTimeout(url, timeoutMs) {
        var timeout = timeoutMs || 4000;
        if (typeof AbortController !== 'undefined') {
            var controller = new AbortController();
            var timer = setTimeout(function() {
                try { controller.abort(); } catch (e) {}
            }, timeout);
            return fetch(url, { signal: controller.signal })
                .finally(function() {
                    clearTimeout(timer);
                });
        }
        return fetch(url);
    }

    var _dbInstance = null;
    var _dbInitPromise = null;

    /**
     * Ouvre ou initialise la base de données IndexedDB
     */
    function getDB() {
        if (_dbInstance) return Promise.resolve(_dbInstance);
        if (_dbInitPromise) return _dbInitPromise;

        _dbInitPromise = new Promise(function(resolve, reject) {
            if (!('indexedDB' in window) || !window.indexedDB) {
                console.warn('[GregorianDB] IndexedDB non supporté dans cet environnement.');
                return resolve(null);
            }
            try {
                var req = window.indexedDB.open(DB_NAME, DB_VERSION);
                req.onupgradeneeded = function(e) {
                    var db = e.target.result;
                    if (!db.objectStoreNames.contains(STORE_NAME)) {
                        db.createObjectStore(STORE_NAME);
                    }
                };
                req.onsuccess = function(e) {
                    _dbInstance = e.target.result;
                    resolve(_dbInstance);
                };
                req.onerror = function(e) {
                    console.warn('[GregorianDB] Erreur ouverture IndexedDB:', e);
                    resolve(null);
                };
            } catch (err) {
                console.warn('[GregorianDB] Exception IndexedDB:', err);
                resolve(null);
            }
        });

        return _dbInitPromise;
    }

    /**
     * Lecture d'un chant dans IndexedDB
     */
    async function idbGet(key) {
        var db = await getDB();
        if (!db) return null;
        return new Promise(function(resolve) {
            try {
                var tx = db.transaction(STORE_NAME, 'readonly');
                var store = tx.objectStore(STORE_NAME);
                var req = store.get(String(key));
                req.onsuccess = function() {
                    resolve(req.result || null);
                };
                req.onerror = function() {
                    resolve(null);
                };
            } catch (e) {
                resolve(null);
            }
        });
    }

    /**
     * Écriture d'un chant dans IndexedDB
     */
    async function idbPut(key, val) {
        if (!key || !val) return;
        var db = await getDB();
        if (!db) return;
        return new Promise(function(resolve) {
            try {
                var tx = db.transaction(STORE_NAME, 'readwrite');
                var store = tx.objectStore(STORE_NAME);
                store.put(val, String(key));
                tx.oncomplete = function() { resolve(true); };
                tx.onerror = function() { resolve(false); };
            } catch (e) {
                resolve(false);
            }
        });
    }

    /**
     * Écriture par lots d'un dictionnaire dans IndexedDB avec suivi de progression
     */
    async function idbPutBatch(entriesObj, onProgress, cancelCheck) {
        var db = await getDB();
        if (!db) return 0;

        var keys = Object.keys(entriesObj);
        var total = keys.length;
        if (!total) return 0;

        var chunkSize = 500;
        var written = 0;

        for (var i = 0; i < total; i += chunkSize) {
            if (typeof cancelCheck === 'function' && cancelCheck()) {
                throw new Error('cancelled');
            }
            var chunkKeys = keys.slice(i, i + chunkSize);
            await new Promise(function(resolve, reject) {
                try {
                    var tx = db.transaction(STORE_NAME, 'readwrite');
                    var store = tx.objectStore(STORE_NAME);
                    for (var k = 0; k < chunkKeys.length; k++) {
                        var key = chunkKeys[k];
                        store.put(entriesObj[key], key);
                    }
                    tx.oncomplete = function() {
                        written += chunkKeys.length;
                        if (typeof onProgress === 'function') {
                            onProgress(Math.min(100, Math.round((written / total) * 100)));
                        }
                        resolve();
                    };
                    tx.onerror = function() {
                        resolve();
                    };
                } catch (e) {
                    resolve();
                }
            });
        }

        return written;
    }

    /**
     * Vide le magasin IndexedDB
     */
    async function idbClear() {
        var db = await getDB();
        if (!db) return;
        return new Promise(function(resolve) {
            try {
                var tx = db.transaction(STORE_NAME, 'readwrite');
                var store = tx.objectStore(STORE_NAME);
                store.clear();
                tx.oncomplete = function() { resolve(true); };
                tx.onerror = function() { resolve(false); };
            } catch (e) {
                resolve(false);
            }
        });
    }

    var gregorianDB = {
        /**
         * Statut d'installation des paquets
         */
        isPackInstalled: function(packType) {
            if (packType === 'liturgy') {
                return localStorage.getItem('do_module_gabc_liturgy_installed') === 'true';
            }
            if (packType === 'all') {
                return localStorage.getItem('do_module_gabc_all_installed') === 'true';
            }
            return false;
        },

        /**
         * Télécharge et installe le Pack Liturgique (Messes & Heures - 5 330 pièces)
         */
        installLiturgyPack: async function(onProgress, cancelCheck) {
            var self = this;
            if (typeof onProgress === 'function') onProgress(5);
            if (typeof cancelCheck === 'function' && cancelCheck()) throw new Error('cancelled');

            var urls = [
                'data/gregorian_liturgy.json',
                JSDELIVR_BASE + 'data/gregorian_liturgy.json',
                GITHUB_BASE + 'data/gregorian_liturgy.json'
            ];

            var json = null;
            for (var i = 0; i < urls.length; i++) {
                try {
                    if (typeof cancelCheck === 'function' && cancelCheck()) throw new Error('cancelled');
                    var res = await fetchWithTimeout(urls[i], 8000);
                    if (res.ok) {
                        if (typeof cancelCheck === 'function' && cancelCheck()) throw new Error('cancelled');
                        if (typeof onProgress === 'function') onProgress(40);
                        json = await res.json();
                        if (typeof cancelCheck === 'function' && cancelCheck()) throw new Error('cancelled');
                        if (typeof onProgress === 'function') onProgress(55);
                        break;
                    }
                } catch (e) {
                    if (e && e.message === 'cancelled') throw e;
                }
            }

            if (!json) {
                throw new Error('Impossible de télécharger le pack liturgique.');
            }

            // Ingestion dans IndexedDB
            await idbPutBatch(json, function(pct) {
                if (typeof onProgress === 'function') {
                    // Mapper 55% -> 100%
                    var mapped = 55 + Math.round((pct * 0.45));
                    onProgress(Math.min(100, mapped));
                }
            }, cancelCheck);

            // Met en cache mémoire pour accès instantané
            Object.assign(window.GABC_LOCAL_CACHE, json);
            localStorage.setItem('do_module_gabc_liturgy_installed', 'true');
            return Object.keys(json).length;
        },

        /**
         * Télécharge et installe le Pack Intégral (25 290 pièces GregoBase)
         */
        installAllPack: async function(onProgress, cancelCheck) {
            var self = this;
            if (typeof onProgress === 'function') onProgress(5);
            if (typeof cancelCheck === 'function' && cancelCheck()) throw new Error('cancelled');

            var urls = [
                'data/gregorian_all.json',
                JSDELIVR_BASE + 'data/gregorian_all.json',
                GITHUB_BASE + 'data/gregorian_all.json'
            ];

            var json = null;
            for (var i = 0; i < urls.length; i++) {
                try {
                    if (typeof cancelCheck === 'function' && cancelCheck()) throw new Error('cancelled');
                    var res = await fetchWithTimeout(urls[i], 12000);
                    if (res.ok) {
                        if (typeof cancelCheck === 'function' && cancelCheck()) throw new Error('cancelled');
                        if (typeof onProgress === 'function') onProgress(45);
                        json = await res.json();
                        if (typeof cancelCheck === 'function' && cancelCheck()) throw new Error('cancelled');
                        if (typeof onProgress === 'function') onProgress(60);
                        break;
                    }
                } catch (e) {
                    if (e && e.message === 'cancelled') throw e;
                }
            }

            if (!json) {
                throw new Error('Impossible de télécharger le pack intégral.');
            }

            // Ingestion dans IndexedDB
            await idbPutBatch(json, function(pct) {
                if (typeof onProgress === 'function') {
                    var mapped = 60 + Math.round((pct * 0.40));
                    onProgress(Math.min(100, mapped));
                }
            }, cancelCheck);

            Object.assign(window.GABC_LOCAL_CACHE, json);
            localStorage.setItem('do_module_gabc_all_installed', 'true');
            return Object.keys(json).length;
        },

        /**
         * Supprime un paquet du stockage hors-ligne local
         */
        deletePack: async function(packType) {
            if (packType === 'liturgy') {
                localStorage.removeItem('do_module_gabc_liturgy_installed');
            } else if (packType === 'all') {
                localStorage.removeItem('do_module_gabc_all_installed');
            }

            // Si plus aucun paquet n'est installé, vider la base locale pour libérer l'espace
            var liturgy = localStorage.getItem('do_module_gabc_liturgy_installed') === 'true';
            var all = localStorage.getItem('do_module_gabc_all_installed') === 'true';
            if (!liturgy && !all) {
                await idbClear();
                if ('caches' in window) {
                    try {
                        await caches.delete('oremus-gabc-cache');
                    } catch (ce) {}
                }
                window.GABC_LOCAL_CACHE = {};
                // Ré-injecter les pièces communes indispensables de l'Office
                if (window.HORAS_COMMON_CHANTS) {
                    Object.keys(window.HORAS_COMMON_CHANTS).forEach(function(k) {
                        var e = window.HORAS_COMMON_CHANTS[k];
                        window.GABC_LOCAL_CACHE[k] = (typeof e === 'string') ? e : (e.gabc || '');
                    });
                }
                if (window.HORAS_COMPLINE_CHANTS) {
                    Object.assign(window.GABC_LOCAL_CACHE, window.HORAS_COMPLINE_CHANTS);
                }
            }
        },

        /**
         * Récupère le code GABC d'un chant par son ID ou chemin
         * Cascade de résolution :
         * 1. Cache mémoire immédiat (window.GABC_LOCAL_CACHE)
         * 1b. Pièces communes de l'Office (HORAS_COMMON_CHANTS & HORAS_COMPLINE_CHANTS)
         * 1c. Gabarits fondamentaux intégrés (Incipit, dialogues, versets)
         * 2. IndexedDB local (si pack installé ou pièce déjà mise en cache)
         * 3. CacheStorage persistant (oremus-gabc-cache)
         * 4. Fichier local (gabc/, gregobase/, do_data/)
         * 5. En ligne via CDN jsDelivr mondial, GitHub Raw, et API GregoBase
         * 6. Auto-caching dynamique dans IndexedDB & CacheStorage
         */
        getGabc: async function(chantId) {
            if (!chantId) return null;
            var strId = String(chantId).replace(/^#/, '').trim();
            if (!strId) return null;

            // 1. Cache mémoire immédiat
            if (window.GABC_LOCAL_CACHE && window.GABC_LOCAL_CACHE[strId]) {
                return window.GABC_LOCAL_CACHE[strId];
            }

            // 1b. Pièces communes de l'Office (dialogues, versets, hymnes usuelles)
            if (window.HORAS_COMMON_CHANTS && window.HORAS_COMMON_CHANTS[strId]) {
                var cEntry = window.HORAS_COMMON_CHANTS[strId];
                var cGabc = (typeof cEntry === 'string') ? cEntry : (cEntry.gabc || null);
                if (cGabc && isValidGabcText(cGabc)) {
                    if (!window.GABC_LOCAL_CACHE) window.GABC_LOCAL_CACHE = {};
                    window.GABC_LOCAL_CACHE[strId] = cGabc;
                    return cGabc;
                }
            }
            if (window.HORAS_COMPLINE_CHANTS && window.HORAS_COMPLINE_CHANTS[strId]) {
                var compEntry = window.HORAS_COMPLINE_CHANTS[strId];
                var compGabc = (typeof compEntry === 'string') ? compEntry : (compEntry.gabc || null);
                if (compGabc && isValidGabcText(compGabc)) {
                    if (!window.GABC_LOCAL_CACHE) window.GABC_LOCAL_CACHE = {};
                    window.GABC_LOCAL_CACHE[strId] = compGabc;
                    return compGabc;
                }
            }

            // 1c. Table interne de secours inviolable pour les pièces d'ouverture et dialogues
            var CORE_OFFICE_FALLBACKS = {
                "deus_in_adjutorium_festal": "(c3) DE(h)us(h'_) (,) in(h) ad(h)ju(h)tó(i)ri(h)um(h) me(h)um(h'_) in(h)tén(g)de.(h.) (::) <sp>R/</sp>. Dó(h)mi(h)ne(h'_) (,) ad(h) ad(h)ju(h)ván(h)dum(h) me(h'_) fe(h)stí(g)na.(h.) (:) Gló(h)ri(h)a(h) Pa(h)tri,(h) et(h) Fí(h)li(h)o,(h'_) (,) et(h) Spi(h)rí(h)tu(h)i(h) San(g)cto.(h.) (:) Sic(h)ut(h) e(h)rat(h) in(h) prin(h)cí(h)pi(h)o,(h) et(h) nunc,(h) et(h) sem(h)per,(h.) (,) et(h) in(h) sǽ(h)cu(h)la(h) sæ(h)cu(h)ló(h)rum.(h) A(g)men.(h.) (;) Al(h)le(i)lú(hg~)ia.(g.) (::)",
                "deus_in_adjutorium_ferial": "(c3) DE(h)us(h) (,) in(h) ad(h)ju(h)tó(h)ri(h)um(h) me(h)um(h) in(h)tén(h)de.(h.) (::) <sp>R/</sp>. Dó(h)mi(h)ne(h) (,) ad(h) ad(h)ju(h)ván(h)dum(h) me(h) fe(h)stí(h)na.(h.) (:) Gló(h)ri(h)a(h) Pa(h)tri,(h) et(h) Fí(h)li(h)o,(h) (,) et(h) Spi(h)rí(h)tu(h)i(h) San(h)cto.(h.) (:) Sic(h)ut(h) e(h)rat(h) in(h) prin(h)cí(h)pi(h)o,(h) et(h) nunc,(h) et(h) sem(h)per,(h) (,) et(h) in(h) sǽ(h)cu(h)la(h) sæ(h)cu(h)ló(h)rum.(h) A(h)men.(h.) (;) Al(h)le(h)lú(h)ia.(h.) (::)",
                "deus_in_adjutorium_lent": "(c3) DE(h)us(h'_) (,) in(h) ad(h)ju(h)tó(i)ri(h)um(h) me(h)um(h'_) in(h)tén(g)de.(h.) (::) <sp>R/</sp>. Dó(h)mi(h)ne(h'_) (,) ad(h) ad(h)ju(h)ván(h)dum(h) me(h'_) fe(h)stí(g)na.(h.) (:) Gló(h)ri(h)a(h) Pa(h)tri,(h) et(h) Fí(h)li(h)o,(h'_) (,) et(h) Spi(h)rí(h)tu(h)i(h) San(g)cto.(h.) (:) Sic(h)ut(h) e(h)rat(h) in(h) prin(h)cí(h)pi(h)o,(h) et(h) nunc,(h) et(h) sem(h)per,(h.) (,) et(h) in(h) sǽ(h)cu(h)la(h) sæ(h)cu(h)ló(h)rum.(h) A(g)men.(h.) (;) Laus(h) ti(h)bi(h) Dó(h)mi(h)ne(h.) Rex(h) æ(h)tér(h)næ(i) gló(h)ri(h)æ.(g.) (::)",
                "domine_labia_mea": "(c3) Dó(h)mi(h)ne,(h'_) (,) lá(h)bi(h)a(h) me(h)a(h) a(h)pé(g)ri(h)es.(h.) (::) <sp>R/</sp>. Et(h) os(h) me(h)um(h'_) (,) an(h)nun(h)ti(h)á(h)bit(h) lau(h)dem(h) tu(g)am.(h.) (::)",
                "jube_domne": "(c3) <sp>V/</sp>. Ju(h)be(h) dom(h)ne(g) be(h)ne(h)dí(h)ce(d)re.(d.) (::) <sp>R/</sp>. Noc(h)tem(h) qui(h)é(h)tam(h) et(h) fi(h)nem(g) per(f)féc(h)tum(h.) (,) con(h)cé(h)dat(h) no(h)bis(h) Dó(h)mi(h)nus(h) om(h)ní(h)po(d)tens.(d.) (::) <sp>R/</sp>. A(g.)men.(h.) (::)",
                "converte_nos": "(c3) <sp>V/</sp>. Con(h)vér(h)te(h) nos(h) ✠(,) De(h)us(h) sa(h)lu(h)tá(g)ris(f) no(h)ster.(h.) (::) <sp>R/</sp>. Et(h) a(h)vér(h)te(h) i(h)ram(h) tu(h)am(g) a(f) no(h)bis.(h.) (::)"
            };
            if (CORE_OFFICE_FALLBACKS[strId]) {
                if (!window.GABC_LOCAL_CACHE) window.GABC_LOCAL_CACHE = {};
                window.GABC_LOCAL_CACHE[strId] = CORE_OFFICE_FALLBACKS[strId];
                return CORE_OFFICE_FALLBACKS[strId];
            }

            // 2. Base locale IndexedDB (si pack téléchargé ou pièce déjà consultée)
            try {
                var idbText = await idbGet(strId);
                if (idbText && isValidGabcText(idbText)) {
                    window.GABC_LOCAL_CACHE[strId] = idbText;
                    return idbText;
                }
            } catch (ie) {}

            // 3. CacheStorage persistant
            if ('caches' in window) {
                try {
                    var cache = await caches.open('oremus-gabc-cache');
                    var remoteUrlCheck = JSDELIVR_BASE + 'gregobase/' + encodeURIComponent(strId) + '.gabc';
                    var matched = await cache.match(remoteUrlCheck);
                    if (!matched) {
                        matched = await cache.match(GITHUB_BASE + 'gregobase/' + encodeURIComponent(strId) + '.gabc');
                    }
                    if (!matched) {
                        matched = await cache.match(JSDELIVR_BASE + 'gabc/' + encodeURIComponent(strId) + '.gabc');
                    }
                    if (!matched) {
                        matched = await cache.match(GITHUB_BASE + 'gabc/' + encodeURIComponent(strId) + '.gabc');
                    }
                    if (!matched && strId.indexOf('/') !== -1) {
                        var cPath = strId.replace(/^\//, '');
                        if (!cPath.endsWith('.gabc')) cPath += '.gabc';
                        matched = await cache.match(JSDELIVR_BASE + cPath);
                        if (!matched) matched = await cache.match(GITHUB_BASE + cPath);
                    }

                    // Recherche selon le chemin explicite de l'index universel
                    var indexedPath = null;
                    if (window.GregorianSearchEngine && typeof window.GregorianSearchEngine.getChantById === 'function') {
                        var cItem = window.GregorianSearchEngine.getChantById(strId);
                        if (cItem && cItem.path) indexedPath = cItem.path;
                    } else if (window.GREGORIAN_INDEX && Array.isArray(window.GREGORIAN_INDEX)) {
                        for (var idx = 0; idx < window.GREGORIAN_INDEX.length; idx++) {
                            if (window.GREGORIAN_INDEX[idx].id === strId && window.GREGORIAN_INDEX[idx].path) {
                                indexedPath = window.GREGORIAN_INDEX[idx].path;
                                break;
                            }
                        }
                    }

                    if (!matched && indexedPath) {
                        var cIdxP = indexedPath.replace(/^\//, '');
                        matched = await cache.match(JSDELIVR_BASE + cIdxP);
                        if (!matched) matched = await cache.match(GITHUB_BASE + cIdxP);
                    }

                    if (matched) {
                        var cachedText = await matched.text();
                        if (isValidGabcText(cachedText)) {
                            window.GABC_LOCAL_CACHE[strId] = cachedText;
                            idbPut(strId, cachedText).catch(function() {});
                            return cachedText;
                        }
                    }
                } catch (ce) {}
            }

            var isNumericId = /^\d+$/.test(strId);

            // 4. Fichier local relatif si disponible (ex: serveur local ou bundle complet)
            var localCandidates = [];
            if (indexedPath) {
                localCandidates.push(indexedPath.replace(/^\//, ''));
            }
            if (strId.indexOf('/') !== -1) {
                localCandidates.push(strId.replace(/^\//, '') + (strId.endsWith('.gabc') ? '' : '.gabc'));
            }
            if (isNumericId) {
                localCandidates.push('gregobase/' + encodeURIComponent(strId) + '.gabc');
                localCandidates.push('gabc/' + encodeURIComponent(strId) + '.gabc');
            } else {
                localCandidates.push('gabc/' + encodeURIComponent(strId) + '.gabc');
                localCandidates.push('gregobase/' + encodeURIComponent(strId) + '.gabc');
            }
            localCandidates.push('gabc/litanies/' + encodeURIComponent(strId) + '.gabc');

            for (var c = 0; c < localCandidates.length; c++) {
                try {
                    var resLocal = await fetchWithTimeout(localCandidates[c], 1500);
                    if (resLocal.ok) {
                        var textLocal = await resLocal.text();
                        if (isValidGabcText(textLocal)) {
                            window.GABC_LOCAL_CACHE[strId] = textLocal;
                            idbPut(strId, textLocal).catch(function() {});
                            return textLocal;
                        }
                    }
                } catch (le) {}
            }

            // 5. En ligne via multiples sources fiables : CDN jsDelivr (prioritaire, ultra-rapide) + GitHub Raw + GregoBase API
            var remoteCandidates = [];
            if (indexedPath) {
                var cleanIdxPath = indexedPath.replace(/^\//, '');
                remoteCandidates.push(JSDELIVR_BASE + cleanIdxPath);
                remoteCandidates.push(GITHUB_BASE + cleanIdxPath);
            }
            if (strId.indexOf('/') !== -1) {
                var cleanPath = strId.replace(/^\//, '');
                if (!cleanPath.endsWith('.gabc')) cleanPath += '.gabc';
                remoteCandidates.push(JSDELIVR_BASE + cleanPath);
                remoteCandidates.push(GITHUB_BASE + cleanPath);
            } else if (isNumericId) {
                // 1. CDN jsDelivr gregobase (prioritaire mondial)
                remoteCandidates.push(JSDELIVR_BASE + 'gregobase/' + encodeURIComponent(strId) + '.gabc');
                // 2. Direct GitHub Raw gregobase
                remoteCandidates.push(GITHUB_BASE + 'gregobase/' + encodeURIComponent(strId) + '.gabc');
                // 3. GregoBase Official Download API
                remoteCandidates.push('https://gregobase.selapa.net/download.php?id=' + encodeURIComponent(strId) + '&format=gabc');
                // 4. Fallback gabc
                remoteCandidates.push(JSDELIVR_BASE + 'gabc/' + encodeURIComponent(strId) + '.gabc');
                remoteCandidates.push(GITHUB_BASE + 'gabc/' + encodeURIComponent(strId) + '.gabc');
            } else {
                remoteCandidates.push(JSDELIVR_BASE + 'gabc/' + encodeURIComponent(strId) + '.gabc');
                remoteCandidates.push(GITHUB_BASE + 'gabc/' + encodeURIComponent(strId) + '.gabc');
                remoteCandidates.push(JSDELIVR_BASE + 'gregobase/' + encodeURIComponent(strId) + '.gabc');
                remoteCandidates.push(GITHUB_BASE + 'gregobase/' + encodeURIComponent(strId) + '.gabc');
                remoteCandidates.push(GITHUB_BASE + 'gabc/litanies/' + encodeURIComponent(strId) + '.gabc');
            }

            for (var r = 0; r < remoteCandidates.length; r++) {
                var rUrl = remoteCandidates[r];
                try {
                    var resRemote = await fetchWithTimeout(rUrl, 4500);
                    if (resRemote.ok) {
                        var textRemote = await resRemote.text();
                        if (isValidGabcText(textRemote)) {
                            // Mise en cache mémoire
                            window.GABC_LOCAL_CACHE[strId] = textRemote;

                            // Auto-caching persistant dans IndexedDB & CacheStorage
                            idbPut(strId, textRemote).catch(function() {});
                            if ('caches' in window) {
                                try {
                                    var cOpen = await caches.open('oremus-gabc-cache');
                                    cOpen.put(rUrl, new Response(textRemote));
                                } catch (cErr) {}
                            }

                            return textRemote;
                        }
                    }
                } catch (re) {}
            }

            return null;
        }
    };

    window.gregorianDB = gregorianDB;

})(window);
