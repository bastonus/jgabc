/**
 * =========================================================================
 * Oremus - gregorian_search_worker.js
 * Web Worker asynchrone pour la recherche universelle & extraction d'extraits
 * =========================================================================
 */

'use strict';

try {
    importScripts('gregorian_search_engine.js');
} catch (e) {
    console.warn('[Worker] Impossible d\'importer gregorian_search_engine.js:', e);
}

self.addEventListener('message', async function(e) {
    var data = e.data || {};
    var type = data.type;
    var payload = data.payload || {};
    var msgId = data.msgId;

    var engine = self.GregorianSearchEngine;

    switch (type) {
        case 'INIT':
            try {
                if (engine && engine.isInitialized) {
                    self.postMessage({
                        type: 'INIT_DONE',
                        msgId: msgId,
                        payload: { totalChants: engine.chantsList.length }
                    });
                    return;
                }
                var urls = [
                    payload.url,
                    'data/gregorian_index.json',
                    './data/gregorian_index.json',
                    '../data/gregorian_index.json',
                    (self.location && self.location.origin ? (self.location.origin + '/data/gregorian_index.json') : null)
                ].filter(Boolean);

                var loaded = false;
                for (var u = 0; u < urls.length; u++) {
                    try {
                        var res = await fetch(urls[u]);
                        if (res && res.ok) {
                            var json = await res.json();
                            if (engine) engine.buildIndex(json);
                            loaded = true;
                            self.postMessage({
                                type: 'INIT_DONE',
                                msgId: msgId,
                                payload: { totalChants: engine ? engine.chantsList.length : json.length }
                            });
                            break;
                        }
                    } catch (fetchErr) {}
                }

                if (!loaded) {
                    throw new Error('Échec fetch worker pour toutes les URLs');
                }
            } catch (err) {
                console.warn('[Worker] Erreur init index:', err);
                self.postMessage({
                    type: 'INIT_ERROR',
                    msgId: msgId,
                    payload: { error: err.message }
                });
            }
            break;

        case 'LOAD_DATA':
            if (payload.data && engine) {
                engine.buildIndex(payload.data);
                self.postMessage({
                    type: 'LOAD_DATA_DONE',
                    msgId: msgId,
                    payload: { totalChants: engine.chantsList.length }
                });
            }
            break;

        case 'SEARCH':
            if (!engine || !engine.isInitialized) {
                self.postMessage({
                    type: 'SEARCH_RESULTS',
                    msgId: msgId,
                    payload: { query: payload.query, results: [], totalCount: 0, totalFound: 0, tookMs: 0, timeMs: 0 }
                });
                return;
            }
            var searchFilters = payload.filters || {
                part: payload.filterPart,
                mode: payload.filterMode,
                lang: payload.lang
            };
            var searchRes = engine.executeSearch(payload.query, searchFilters, payload.limit, payload.offset);
            self.postMessage({
                type: 'SEARCH_RESULTS',
                msgId: msgId,
                payload: {
                    query: searchRes.query,
                    results: searchRes.results,
                    totalCount: searchRes.totalCount,
                    totalFound: searchRes.totalCount,
                    tookMs: searchRes.tookMs,
                    timeMs: searchRes.tookMs,
                    append: payload.append || false,
                    offset: payload.offset || 0
                }
            });
            break;

        case 'GET_BY_ID':
            var found = engine ? engine.getById(payload.id) : null;
            self.postMessage({
                type: 'GET_BY_ID_RESULT',
                msgId: msgId,
                payload: { id: payload.id, chant: found }
            });
            break;

        default:
            console.warn('[Worker] Type de message inconnu:', type);
    }
});
