/**
 * =========================================================================
 * Oremus - gregorian_db.js
 * Gestionnaire de stockage et cache local des partitions grégoriennes
 * =========================================================================
 */

(function(window) {
    'use strict';

    if (!window.GABC_LOCAL_CACHE) {
        window.GABC_LOCAL_CACHE = {};
    }

    var gregorianDB = {
        _loadingDictPromise: null,

        /**
         * Charge le dictionnaire local de partitions en tâche de fond si nécessaire
         */
        _loadFullDictionary: async function() {
            if (this._loadingDictPromise) return this._loadingDictPromise;
            this._loadingDictPromise = (async function() {
                try {
                    var res = await fetch('data/gregorian_chants.json');
                    if (res.ok) {
                        var json = await res.json();
                        if (!window.GABC_LOCAL_CACHE) window.GABC_LOCAL_CACHE = {};
                        Object.assign(window.GABC_LOCAL_CACHE, json);
                        return json;
                    }
                } catch (e) {
                    console.warn('[GregorianDB] Chargement data/gregorian_chants.json:', e);
                }
                return null;
            })();
            return this._loadingDictPromise;
        },

        /**
         * Récupère le code GABC d'un chant par son ID
         * 1. Cache mémoire global
         * 2. Fichier local individuel (gabc/{id}.gabc)
         * 3. Dictionnaire global (data/gregorian_chants.json)
         */
        getGabc: async function(chantId) {
            if (!chantId) return null;
            var strId = String(chantId).replace(/^#/, '').trim();

            // 1. Cache mémoire immédiat
            if (window.GABC_LOCAL_CACHE && window.GABC_LOCAL_CACHE[strId]) {
                return window.GABC_LOCAL_CACHE[strId];
            }

            // 2. Fichier local gabc/{id}.gabc ou gabc/litanies/{id}.gabc
            try {
                var url = 'gabc/' + encodeURIComponent(strId) + '.gabc';
                var res = await fetch(url);
                if (res.ok) {
                    var text = await res.text();
                    if (!window.GABC_LOCAL_CACHE) window.GABC_LOCAL_CACHE = {};
                    window.GABC_LOCAL_CACHE[strId] = text;
                    return text;
                }
            } catch (e) {}

            try {
                var urlLit = 'gabc/litanies/' + encodeURIComponent(strId) + '.gabc';
                var resLit = await fetch(urlLit);
                if (resLit.ok) {
                    var textLit = await resLit.text();
                    if (!window.GABC_LOCAL_CACHE) window.GABC_LOCAL_CACHE = {};
                    window.GABC_LOCAL_CACHE[strId] = textLit;
                    return textLit;
                }
            } catch (e) {}

            // 3. Dictionnaire embarqué
            var dict = await this._loadFullDictionary();
            if (dict && dict[strId]) {
                return dict[strId];
            }

            // 4. Cache persistant CacheStorage (si déjà récupéré en ligne auparavant)
            var remoteUrl = 'https://raw.githubusercontent.com/bastonus/jgabc/master/gabc/' + encodeURIComponent(strId) + '.gabc';
            var remoteLitUrl = 'https://raw.githubusercontent.com/bastonus/jgabc/master/gabc/litanies/' + encodeURIComponent(strId) + '.gabc';

            if ('caches' in window) {
                try {
                    var cache = await caches.open('oremus-gabc-cache');
                    var matched = await cache.match(remoteUrl);
                    if (!matched) matched = await cache.match(remoteLitUrl);
                    if (matched) {
                        var cachedText = await matched.text();
                        if (!window.GABC_LOCAL_CACHE) window.GABC_LOCAL_CACHE = {};
                        window.GABC_LOCAL_CACHE[strId] = cachedText;
                        return cachedText;
                    }
                } catch (ce) {}
            }

            // 5. Récupération en ligne à la volée via GitHub Raw Usercontent (Mode Défaut APK)
            try {
                var resRemote = await fetch(remoteUrl);
                if (resRemote.ok) {
                    var textRemote = await resRemote.text();
                    if (!window.GABC_LOCAL_CACHE) window.GABC_LOCAL_CACHE = {};
                    window.GABC_LOCAL_CACHE[strId] = textRemote;
                    if ('caches' in window) {
                        try {
                            var cOpen = await caches.open('oremus-gabc-cache');
                            cOpen.put(remoteUrl, new Response(textRemote));
                        } catch(cErr) {}
                    }
                    return textRemote;
                }
            } catch (e) {}

            // Fallback litanies en ligne
            try {
                var resLitRemote = await fetch(remoteLitUrl);
                if (resLitRemote.ok) {
                    var textLitRemote = await resLitRemote.text();
                    if (!window.GABC_LOCAL_CACHE) window.GABC_LOCAL_CACHE = {};
                    window.GABC_LOCAL_CACHE[strId] = textLitRemote;
                    if ('caches' in window) {
                        try {
                            var cLitOpen = await caches.open('oremus-gabc-cache');
                            cLitOpen.put(remoteLitUrl, new Response(textLitRemote));
                        } catch(cErr) {}
                    }
                    return textLitRemote;
                }
            } catch (e) {}

            return null;
        }
    };

    window.gregorianDB = gregorianDB;

})(window);
