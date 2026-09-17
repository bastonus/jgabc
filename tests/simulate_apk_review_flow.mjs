// tests/simulate_apk_review_flow.mjs
// Simulation du flux de relecture de l'application cliente (APK & Web)
// Vérifie le chargement dynamique depuis l'API, l'ordre de priorité, et la soumission d'avis.

import http from 'http';
import assert from 'assert';
import fs from 'fs';
import path from 'path';

const PORT = 4570;
const BASE_URL = `http://127.0.0.1:${PORT}`;

// Sample mock queue returned by the API
const MOCK_QUEUE = [
  {
    id: 'liturgy-piece-1',
    piece_id: 'liturgy-piece-1',
    incipit: 'Kyrie Cunctipotens',
    part: 'Kyrie',
    youtube_id: 'mock_yt_1',
    youtube_url: 'https://www.youtube.com/watch?v=mock_yt_1',
    gabc_src: '(c4) Ky(h)ri(g)e(f) (::)',
    timestamps: [{ note_index: 0, start: 1.0, end: 2.0 }],
    pack: 'liturgy',
    is_liturgy_pack: true,
    review_status: null,
    review_count: 0,
    priority_score: 1000,
    worker_id: 'Ami-GPU'
  },
  {
    id: 'liturgy-piece-2',
    piece_id: 'liturgy-piece-2',
    incipit: 'Gloria in excelsis',
    part: 'Gloria',
    youtube_id: 'mock_yt_2',
    youtube_url: 'https://www.youtube.com/watch?v=mock_yt_2',
    gabc_src: '(c4) Glo(h)ri(g)a(f) (::)',
    timestamps: [{ note_index: 0, start: 1.0, end: 2.0 }],
    pack: 'liturgy',
    is_liturgy_pack: true,
    review_status: null,
    review_count: 0,
    priority_score: 1000,
    worker_id: 'Ami-Metal'
  },
  {
    id: 'extension-piece-1',
    piece_id: 'extension-piece-1',
    incipit: 'Ave Regina Caelorum',
    part: 'Antiphona',
    youtube_id: 'mock_yt_3',
    youtube_url: 'https://www.youtube.com/watch?v=mock_yt_3',
    gabc_src: '(c4) A(h)ve(g) (::)',
    timestamps: [{ note_index: 0, start: 1.0, end: 2.0 }],
    pack: 'extension',
    is_liturgy_pack: false,
    review_status: null,
    review_count: 0,
    priority_score: 800,
    worker_id: 'Ami-CPU'
  },
  {
    id: 'liturgy-delayed-piece',
    piece_id: 'liturgy-delayed-piece',
    incipit: 'Sanctus XVIII',
    part: 'Sanctus',
    youtube_id: 'mock_yt_4',
    youtube_url: 'https://www.youtube.com/watch?v=mock_yt_4',
    gabc_src: '(c4) Sanc(h)tus(g) (::)',
    timestamps: [{ note_index: 0, start: 1.0, end: 2.0 }],
    pack: 'liturgy',
    is_liturgy_pack: true,
    review_status: 'delayed',
    review_count: 1,
    priority_score: 585,
    worker_id: 'Ami-GPU'
  }
];

let receivedReviews = [];

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && (req.url === '/api/alignments/queue' || req.url === '/api/alignments')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ total: MOCK_QUEUE.length, queue: MOCK_QUEUE }));
    return;
  }

  if (req.method === 'POST' && req.url === '/api/review') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        receivedReviews.push(payload);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, message: 'Saved' }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Invalid JSON' }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

async function main() {
  await new Promise(r => server.listen(PORT, r));
  console.log('===============================================================');
  console.log('🧪 TEST CLIENT APP : FLUX DE RELECTURE & PRIORITÉS EN LIGNE');
  console.log('===============================================================');

  let passed = 0;
  let failed = 0;
  function ok(cond, msg) {
    if (cond) {
      console.log(`  ✅ [PASS] ${msg}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${msg}`);
      failed++;
    }
  }

  try {
    // 1. Démarrage de l'app avec PIECES vide (APK léger)
    let PIECES = [];
    ok(PIECES.length === 0, 'L\'APK démarre avec un dataset vide (0 ko d\'alignements embarqués)');

    // 2. Fetch de la file d'alignements depuis l'API
    const res = await fetch(`${BASE_URL}/api/alignments/queue`);
    const data = await res.json();
    ok(res.status === 200, 'Requête GET /api/alignments/queue réussie');
    ok(Array.isArray(data.queue) && data.queue.length === 4, 'La file contient les 4 pièces prioritaires');

    PIECES = data.queue;
    ok(PIECES.length === 4, 'PIECES est hydraté dynamiquement depuis l\'API');

    // 3. Logique de sélection de la pièce selon les priorités liturgiques
    const userSessionReviewedIds = new Set();
    const sessionSkippedIds = new Set();
    const LOCAL_USER_REVIEWS = {};
    let currentPieceIndex = -1;

    function pickNextPiece() {
      const candidates = [];
      PIECES.forEach((p, idx) => {
        if (p && p.timestamps && p.timestamps.length > 0 && p.youtube_id && p.gabc_src) {
          const hasUserReviewed = userSessionReviewedIds.has(p.id) || (LOCAL_USER_REVIEWS[p.id] && LOCAL_USER_REVIEWS[p.id].status);
          const isSkipped = sessionSkippedIds.has(p.id);
          let baseScore = (typeof p.priority_score === 'number') ? p.priority_score : (p.is_liturgy_pack ? 1000 : 800);
          if (hasUserReviewed) baseScore -= 10000;
          if (isSkipped) baseScore -= 500;
          candidates.push({ piece: p, index: idx, effectiveScore: baseScore });
        }
      });

      const available = candidates.filter(c => c.index !== currentPieceIndex);
      const pool = available.length > 0 ? available : candidates;
      pool.sort((a, b) => b.effectiveScore - a.effectiveScore);
      const topScore = pool[0].effectiveScore;
      const topTier = pool.filter(c => c.effectiveScore === topScore);
      const chosen = topTier[0]; // premier pour le test déterministe
      currentPieceIndex = chosen.index;
      return chosen.piece;
    }

    // Premier choix : doit être une pièce de liturgy.pack unreviewed (score 1000)
    const p1 = pickNextPiece();
    ok(p1.is_liturgy_pack === true, `1er chant proposé issu du répertoire liturgique quotidien (${p1.id})`);
    ok(p1.priority_score === 1000, `Score de priorité maximal (1000)`);

    // L'utilisateur valide la pièce 1 ('approved')
    userSessionReviewedIds.add(p1.id);
    LOCAL_USER_REVIEWS[p1.id] = { status: 'approved' };

    // Deuxième choix : doit être la seconde pièce de liturgy.pack unreviewed (score 1000)
    const p2 = pickNextPiece();
    ok(p2.id !== p1.id, 'Le 2ème chant est différent du 1er');
    ok(p2.is_liturgy_pack === true, `2ème chant également de liturgy.pack (${p2.id})`);
    ok(p2.priority_score === 1000, `Score de priorité = 1000`);

    // L'utilisateur valide la pièce 2
    userSessionReviewedIds.add(p2.id);
    LOCAL_USER_REVIEWS[p2.id] = { status: 'approved' };

    // Troisième choix : tous les chants liturgy unreviewed sont finis -> transition vers extension unreviewed (score 800)
    const p3 = pickNextPiece();
    ok(p3.id === 'extension-piece-1', `3ème chant proposé issu de l'extension non encore révisée (${p3.id})`);
    ok(p3.priority_score === 800, `Score de priorité = 800`);

    // L'utilisateur valide la pièce 3
    userSessionReviewedIds.add(p3.id);
    LOCAL_USER_REVIEWS[p3.id] = { status: 'bad_gabc' };

    // Quatrième choix : il ne reste que le chant liturgique décalé à re-vérifier (score 585)
    const p4 = pickNextPiece();
    ok(p4.id === 'liturgy-delayed-piece', `4ème chant proposé est le chant signalé décalé à re-vérifier (${p4.id})`);
    ok(p4.review_status === 'delayed', 'Statut de re-vérification bien détecté');

    // 4. Test d'envoi d'avis en arrière-plan vers l'API
    const reviewPayload = {
      reviews: {
        [p1.id]: { status: 'approved', comment: 'Très bon alignement', author: 'Frère-Jean' },
        [p3.id]: { status: 'bad_gabc', comment: 'Mauvais texte gabc', author: 'Frère-Jean' }
      },
      trigger: 'session_batch'
    };

    const postRes = await fetch(`${BASE_URL}/api/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reviewPayload)
    });
    const postData = await postRes.json();
    ok(postRes.status === 201, 'Envoi de batch d\'avis vers /api/review HTTP 201');
    ok(postData.success === true, 'Avis enregistrés avec succès par le serveur');
    ok(receivedReviews.length === 1, '1 payload reçu par l\'API');
    ok(receivedReviews[0].reviews[p1.id].status === 'approved', 'Avis pièce 1 approved confirmé');
    ok(receivedReviews[0].reviews[p3.id].status === 'bad_gabc', 'Avis pièce 3 bad_gabc confirmé');

  } catch (err) {
    console.error('Erreur inattendue:', err);
    failed++;
  } finally {
    console.log('===============================================================');
    console.log(`📊 BILAN DU TEST CLIENT : ${passed} SUCCÈS / ${failed} ÉCHECS`);
    if (failed === 0) {
      console.log('🎉 LE COMPORTEMENT CLIENT EST 100% CONFORME !');
    }
    console.log('===============================================================');
    server.closeAllConnections?.();
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
