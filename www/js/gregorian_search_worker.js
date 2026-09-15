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

                // 1. Initialisation directe par transfert du tableau en mémoire
                if (payload && Array.isArray(payload.rawIndex)) {
                    if (engine) engine.buildIndex(payload.rawIndex);
                    self.postMessage({
                        type: 'INIT_DONE',
                        msgId: msgId,
                        payload: { totalChants: engine ? engine.chantsList.length : payload.rawIndex.length }
                    });
                    return;
                }

                // 2. Initialisation par importScripts de gregorian_index_data.js
                var loaded = false;
                var scriptCandidates = [
                    'gregorian_index_data.js',
                    '../js/gregorian_index_data.js',
                    './js/gregorian_index_data.js'
                ];
                for (var s = 0; s < scriptCandidates.length; s++) {
                    try {
                        importScripts(scriptCandidates[s]);
                        if (self.GREGORIAN_INDEX && Array.isArray(self.GREGORIAN_INDEX)) {
                            if (engine) engine.buildIndex(self.GREGORIAN_INDEX);
                            loaded = true;
                            self.postMessage({
                                type: 'INIT_DONE',
                                msgId: msgId,
                                payload: { totalChants: engine ? engine.chantsList.length : self.GREGORIAN_INDEX.length }
                            });
                            break;
                        }
                    } catch(e) {}
                }

                if (!loaded) {
                    throw new Error('Échec chargement index grégorien dans le Worker');
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
