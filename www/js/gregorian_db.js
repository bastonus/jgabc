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

    var _dbInstance = null;
    var _dbInitPromise = null;

    /**
     * Ouvre ou initialise la base de données IndexedDB
     */
    function getDB() {
        if (_dbInstance) return Promise.resolve(_dbInstance);
        if (_dbInitPromise) return _dbInitPromise;

        _dbInitPromise = new Promise(function(resolve, reject) {
            if (!('indexedDB' in window)) {
                console.warn('[GregorianDB] IndexedDB non supporté dans cet environnement.');
                return resolve(null);
            }
            try {
                var req = indexedDB.open(DB_NAME, DB_VERSION);
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
                GITHUB_BASE + 'data/gregorian_liturgy.json'
            ];

            var json = null;
            for (var i = 0; i < urls.length; i++) {
                try {
                    if (typeof cancelCheck === 'function' && cancelCheck()) throw new Error('cancelled');
                    var res = await fetch(urls[i]);
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
                GITHUB_BASE + 'data/gregorian_all.json'
            ];

            var json = null;
            for (var i = 0; i < urls.length; i++) {
                try {
                    if (typeof cancelCheck === 'function' && cancelCheck()) throw new Error('cancelled');
                    var res = await fetch(urls[i]);
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
            }
        },

        /**
         * Récupère le code GABC d'un chant par son ID ou chemin
         * Cascade de résolution :
         * 1. Cache mémoire immédiat (window.GABC_LOCAL_CACHE)
         * 2. IndexedDB local (si pack installé ou pièce déjà mise en cache)
         * 3. CacheStorage persistant (oremus-gabc-cache)
         * 4. Fichier local (gabc/, gregobase/, do_data/)
         * 5. En ligne à la volée via GitHub Usercontent (raw.githubusercontent.com)
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

            // 2. Base locale IndexedDB (si pack téléchargé ou pièce déjà consultée)
            try {
                var idbText = await idbGet(strId);
                if (idbText) {
                    window.GABC_LOCAL_CACHE[strId] = idbText;
                    return idbText;
                }
            } catch (ie) {}

            // 3. CacheStorage persistant
            if ('caches' in window) {
                try {
                    var cache = await caches.open('oremus-gabc-cache');
                    var remoteUrlCheck = GITHUB_BASE + 'gabc/' + encodeURIComponent(strId) + '.gabc';
                    var matched = await cache.match(remoteUrlCheck);
                    if (!matched) {
                        var remoteGbCheck = GITHUB_BASE + 'gregobase/' + encodeURIComponent(strId) + '.gabc';
                        matched = await cache.match(remoteGbCheck);
                    }
                    if (!matched && strId.indexOf('/') !== -1) {
                        matched = await cache.match(GITHUB_BASE + strId.replace(/^\//, '') + '.gabc');
                    }
                    if (matched) {
                        var cachedText = await matched.text();
                        window.GABC_LOCAL_CACHE[strId] = cachedText;
                        idbPut(strId, cachedText).catch(function() {});
                        return cachedText;
                    }
                } catch (ce) {}
            }

            // 4. Fichier local relatif si disponible (ex: serveur local ou bundle complet)
            var localCandidates = [
                'gabc/' + encodeURIComponent(strId) + '.gabc',
                'gregobase/' + encodeURIComponent(strId) + '.gabc',
                'gabc/litanies/' + encodeURIComponent(strId) + '.gabc'
            ];
            if (strId.indexOf('/') !== -1) {
                localCandidates.unshift(strId.replace(/^\//, '') + (strId.endsWith('.gabc') ? '' : '.gabc'));
            }

            for (var c = 0; c < localCandidates.length; c++) {
                try {
                    var resLocal = await fetch(localCandidates[c]);
                    if (resLocal.ok) {
                        var textLocal = await resLocal.text();
                        if (textLocal && textLocal.indexOf('(') !== -1) {
                            window.GABC_LOCAL_CACHE[strId] = textLocal;
                            idbPut(strId, textLocal).catch(function() {});
                            return textLocal;
                        }
                    }
                } catch (le) {}
            }

            // 5. En ligne à la volée via GitHub Raw Usercontent (Comportement Par Défaut)
            var remoteCandidates = [
                GITHUB_BASE + 'gabc/' + encodeURIComponent(strId) + '.gabc',
                GITHUB_BASE + 'gregobase/' + encodeURIComponent(strId) + '.gabc',
                GITHUB_BASE + 'gabc/litanies/' + encodeURIComponent(strId) + '.gabc'
            ];
            if (strId.indexOf('/') !== -1) {
                var cleanPath = strId.replace(/^\//, '');
                if (!cleanPath.endsWith('.gabc')) cleanPath += '.gabc';
                remoteCandidates.unshift(GITHUB_BASE + cleanPath);
            }

            for (var r = 0; r < remoteCandidates.length; r++) {
                var rUrl = remoteCandidates[r];
                try {
                    var resRemote = await fetch(rUrl);
                    if (resRemote.ok) {
                        var textRemote = await resRemote.text();
                        if (textRemote && textRemote.indexOf('(') !== -1) {
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
