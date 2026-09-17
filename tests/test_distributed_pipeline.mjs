/**
 * test_distributed_pipeline.mjs — Test automatisé du système de calcul distribué
 * et de l'export des avis Oremus.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const TEST_PORT = 4568;
const TEST_BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const TEST_DATA_DIR = path.join(rootDir, 'tests', 'temp_dist_data');

console.log('===============================================================');
console.log('🧪 TEST AUTOMATISÉ : PIPELINE DE CALCUL DISTRIBUÉ & EXPORTS');
console.log('===============================================================\n');

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    passCount++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    failCount++;
  }
}

function requestHttp(method, pathName, payload = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathName, TEST_BASE_URL);
    const options = {
      method: method,
      headers: {
        'User-Agent': 'Oremus-Dist-Tester/1.0',
        ...headers
      }
    };
    if (payload && typeof payload === 'object' && !headers['Content-Type']) {
      options.headers['Content-Type'] = 'application/json';
    }

    const req = http.request(url, options, (res) => {
      let data = [];
      res.on('data', chunk => data.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(data);
        const text = buffer.toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch (e) {}
        resolve({
          status: res.statusCode,
          headers: res.headers,
          bodyText: text,
          json: json,
          rawBuffer: buffer
        });
      });
    });

    req.on('error', reject);
    if (payload) {
      req.write(typeof payload === 'string' ? payload : JSON.stringify(payload));
    }
    req.end();
  });
}

// Nettoyage préalable
if (fs.existsSync(TEST_DATA_DIR)) {
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
}
fs.mkdirSync(TEST_DATA_DIR, { recursive: true });

// Démarrage du serveur en local
console.log(`🚀 Démarrage du serveur de test sur le port ${TEST_PORT}...`);
const serverProcess = spawn('node', ['server/index.mjs'], {
  cwd: rootDir,
  env: {
    ...process.env,
    PORT: String(TEST_PORT),
    HOST: '127.0.0.1',
    DATA_DIR: TEST_DATA_DIR
  },
  stdio: ['ignore', 'pipe', 'pipe']
});

serverProcess.stderr.on('data', data => console.error(`[SERVER ERR] ${data}`));

// Attente démarrage
await new Promise(r => setTimeout(r, 1200));

try {
  // ── TEST 1 : Route /health ──
  console.log('\n🩺 Test 1 : Vérification de la route /health avec métriques distribuées');
  const healthRes = await requestHttp('GET', '/health');
  assert(healthRes.status === 200, 'GET /health répond HTTP 200');
  assert(healthRes.json && healthRes.json.status === 'ok', 'Payload contient status: "ok"');
  assert(healthRes.json && healthRes.json.distributed_jobs !== undefined, 'Métrique distributed_jobs présente');

  // ── TEST 2 : Portail web public /worker ──
  console.log('\n🌐 Test 2 : Portail web public des workers (/worker)');
  const workerPageRes = await requestHttp('GET', '/worker');
  assert(workerPageRes.status === 200, 'GET /worker répond HTTP 200');
  assert(workerPageRes.headers['content-type'].includes('text/html'), 'Content-Type est text/html');
  assert(workerPageRes.bodyText.includes('Calcul Distribué'), 'Page contient le titre "Calcul Distribué"');
  assert(workerPageRes.bodyText.includes('start_worker.bat'), 'Instructions Windows présentes');
  assert(workerPageRes.bodyText.includes('start_worker.sh'), 'Instructions Mac/Linux présentes');

  // ── TEST 3 : Téléchargement du ZIP worker ──
  console.log('\n📦 Test 3 : Téléchargement du pack worker (/download/worker.zip)');
  const zipRes = await requestHttp('GET', '/download/worker.zip');
  assert(zipRes.status === 200, 'GET /download/worker.zip répond HTTP 200');
  assert(zipRes.headers['content-type'].includes('zip'), 'Content-Type est application/zip');
  assert(zipRes.rawBuffer.length > 1000, `Taille du ZIP valide (${zipRes.rawBuffer.length} octets)`);

  // ── TEST 4 : Statut initial de la file de calcul ──
  console.log('\n📊 Test 4 : Consultation du statut de calcul (/api/jobs/status)');
  const statusRes = await requestHttp('GET', '/api/jobs/status');
  assert(statusRes.status === 200, 'GET /api/jobs/status répond HTTP 200');
  assert(statusRes.json.total_pieces >= 0, `Nombre de pièces dans le catalogue : ${statusRes.json.total_pieces}`);
  assert(statusRes.json.completed >= 20, `Pièces pré-alignées (seed) synchronisées dans le statut : ${statusRes.json.completed}`);
  assert(Array.isArray(statusRes.json.leaderboard), 'Tableau du leaderboard présent');
  const initialCompleted = statusRes.json.completed;

  // ── TEST 5 : Attribution d'une tâche (Claim) ──
  console.log('\n🎯 Test 5 : Attribution d\'une tâche à un worker (/api/jobs/claim)');
  const claimRes = await requestHttp('GET', '/api/jobs/claim?worker_id=Ami-Alexandre-RTX');
  assert(claimRes.status === 200, 'GET /api/jobs/claim répond HTTP 200');
  assert(claimRes.json.ok === true, 'Réponse ok: true');
  
  const claimedJob = claimRes.json.job;
  assert(claimedJob !== null && claimedJob.id !== undefined, `Tâche attribuée avec succès (ID: ${claimedJob ? claimedJob.id : 'none'})`);

  // ── TEST 6 : Soumission du résultat (Submit) ──
  console.log('\n📤 Test 6 : Soumission de l\'alignement calculé (/api/jobs/submit)');
  const mockTimestamps = [
    { note_index: 0, pitch: "f", word: "Kyrie", start: 1.2, end: 2.1, confidence: 0.9 },
    { note_index: 1, pitch: "g", word: "Kyrie", start: 2.1, end: 2.8, confidence: 0.92 }
  ];

  const submitPayload = {
    piece_id: claimedJob.id,
    worker_id: 'Ami-Alexandre-RTX',
    timestamps: mockTimestamps,
    notes_count: 2,
    audio_duration_sec: 14.5,
    compute_device: 'NVIDIA RTX 4080',
    compute_time_sec: 1.8,
    status: 'completed'
  };

  const submitRes = await requestHttp('POST', '/api/jobs/submit', submitPayload);
  assert(submitRes.status === 200, 'POST /api/jobs/submit répond HTTP 200');
  assert(submitRes.json.success === true, 'Succès confirmé');
  assert(submitRes.json.worker_total === 1, 'Total du worker incrémenté à 1');

  // Vérification que le fichier d'alignement a été créé sur disque
  const alignmentFile = path.join(TEST_DATA_DIR, 'alignments', `${claimedJob.id}.json`);
  assert(fs.existsSync(alignmentFile), `Fichier d'alignement généré sur disque : ${claimedJob.id}.json`);

  // ── TEST 7 : Mise à jour du Leaderboard ──
  console.log('\n🏆 Test 7 : Vérification du leaderboard mis à jour');
  const statusRes2 = await requestHttp('GET', '/api/jobs/status');
  assert(statusRes2.json.completed === initialCompleted + 1, '1 tâche supplémentaire marquée comme complétée');
  assert(statusRes2.json.leaderboard.length >= 1, 'Au moins un contributeur au classement');
  const alexContributor = statusRes2.json.leaderboard.find(c => c.name === 'Ami-Alexandre-RTX');
  assert(alexContributor !== undefined, 'Nom du contributeur fidèle (Ami-Alexandre-RTX)');
  assert(alexContributor && alexContributor.count === 1, 'Score du contributeur = 1');

  // ── TEST 8 : Export des alignements collectés ──
  console.log('\n📦 Test 8 : Export des alignements (/api/jobs/export)');
  const exportAlignRes = await requestHttp('GET', '/api/jobs/export');
  assert(exportAlignRes.status === 200, 'GET /api/jobs/export répond HTTP 200');
  assert(exportAlignRes.json.total === 1, '1 alignement dans l\'export global');
  assert(exportAlignRes.json.alignments[0].piece_id === String(claimedJob.id), 'ID de la pièce concordant');

  // ── TEST 9 : Export des revues en JSON et CSV ──
  console.log('\n📑 Test 9 : Exportation des avis utilisateurs (/api/reviews/export)');
  // Envoyer un avis de test
  await requestHttp('POST', '/api/review', {
    piece_id: 'piece_test_101',
    status: 'approved',
    comment: 'Alignement parfait',
    author: 'verificateur_1'
  });
  await requestHttp('POST', '/api/review', {
    piece_id: 'piece_test_102',
    status: 'bad_gabc',
    comment: 'Texte latin tronqué',
    author: 'verificateur_2'
  });

  const exportRevJson = await requestHttp('GET', '/api/reviews/export');
  assert(exportRevJson.status === 200, 'GET /api/reviews/export répond HTTP 200');
  assert(exportRevJson.json.total === 2, '2 avis détectés dans l\'export JSON');
  assert(exportRevJson.json.approved_count === 1, '1 avis approved');
  assert(exportRevJson.json.erroneous_count === 1, '1 avis erroneous (bad_gabc)');

  const exportRevCsv = await requestHttp('GET', '/api/reviews/export.csv');
  assert(exportRevCsv.status === 200, 'GET /api/reviews/export.csv répond HTTP 200');
  assert(exportRevCsv.headers['content-type'].includes('text/csv'), 'Content-Type est text/csv');
  assert(exportRevCsv.bodyText.includes('piece_test_101') && exportRevCsv.bodyText.includes('piece_test_102'), 'CSV contient les deux identifiants');

  // ── TEST 10 : Statistiques de benchmarks matériels ──
  console.log('\n⚡ Test 10 : Benchmarks réels de calcul (/api/jobs/benchmarks)');
  const benchRes = await requestHttp('GET', '/api/jobs/benchmarks');
  assert(benchRes.status === 200, 'GET /api/jobs/benchmarks répond HTTP 200');
  assert(benchRes.json && benchRes.json.cuda !== undefined, 'Benchmarks contiennent le profil CUDA');
  assert(benchRes.json && benchRes.json.mps !== undefined, 'Benchmarks contiennent le profil MPS');
  assert(benchRes.json && benchRes.json.cpu !== undefined, 'Benchmarks contiennent le profil CPU');
  assert(benchRes.json.cuda.pieces_per_hour > 0, `Vitesse CUDA positive (${benchRes.json.cuda.pieces_per_hour} pièces/h)`);

  // ── TEST 11 : Lot de pièces récemment calculées par un worker ──
  console.log('\n📋 Test 11 : Récupération du lot récemment calculé (/api/jobs/worker/:id/pieces)');
  const workerBatchRes = await requestHttp('GET', '/api/jobs/worker/Ami-Alexandre-RTX/pieces');
  assert(workerBatchRes.status === 200, 'GET /api/jobs/worker/Ami-Alexandre-RTX/pieces répond HTTP 200');
  assert(workerBatchRes.json.total >= 1, `Total de pièces pour Ami-Alexandre-RTX >= 1 (${workerBatchRes.json.total})`);
  assert(workerBatchRes.json.pieces[0].id === String(claimedJob.id), 'Identifiant de pièce correspond à la soumission');
  assert(workerBatchRes.json.pieces[0].worker === 'Ami-Alexandre-RTX', 'Contributeur bien identifié');

  // ── TEST 12 : Détail complet d'une pièce pour relecture directe ──
  console.log('\n🔍 Test 12 : Détail d\'une pièce pour relecture directe (/api/jobs/piece/:id)');
  const pieceDetailRes = await requestHttp('GET', `/api/jobs/piece/${claimedJob.id}`);
  assert(pieceDetailRes.status === 200, `GET /api/jobs/piece/${claimedJob.id} répond HTTP 200`);
  assert(pieceDetailRes.json.id === String(claimedJob.id), 'ID conforme dans le détail');
  assert(Array.isArray(pieceDetailRes.json.timestamps), 'Horodatages présents sous forme de tableau');
  assert(pieceDetailRes.json.timestamps.length === 2, '2 notes synchronisées présentes');
  assert(pieceDetailRes.json.youtube_url !== undefined || pieceDetailRes.json.youtube_id !== undefined, 'Lien YouTube disponible pour player');

  // ── TEST 13 : File dynamique d'alignements pour l'App (/api/alignments/queue) ──
  console.log('\n⚜️ Test 13 : Consultation de la file dynamique d\'alignements pour l\'App (/api/alignments/queue)');
  const queueRes = await requestHttp('GET', '/api/alignments/queue');
  assert(queueRes.status === 200, 'GET /api/alignments/queue répond HTTP 200');
  assert(queueRes.json.ok === true, 'Réponse ok: true');
  assert(queueRes.json.total_aligned >= 1, `Total de pièces alignées >= 1 (${queueRes.json.total_aligned})`);
  assert(Array.isArray(queueRes.json.pieces), 'La réponse contient un tableau de pièces');

  const foundPiece = queueRes.json.pieces.find(p => p.id === String(claimedJob.id));
  assert(foundPiece !== undefined, `La pièce récemment alignée (${claimedJob.id}) figure dans la file de l'App`);
  assert(foundPiece && foundPiece.timestamps && foundPiece.timestamps.length === 2, 'Les horodatages sont complets');
  assert(foundPiece && typeof foundPiece.is_liturgy_pack === 'boolean', 'Le drapeau is_liturgy_pack est présent');
  assert(foundPiece && foundPiece.priority_score > 0, `Score de priorité liturgique calculé : ${foundPiece ? foundPiece.priority_score : 0}`);

  // ── TEST 14 : Vérification de l'ordonnancement par priorité liturgique ──
  console.log('\n🎯 Test 14 : Vérification du tri par ordre de priorité (liturgy.pack & non-révisé)');
  const piecesList = queueRes.json.pieces;
  let isSorted = true;
  for (let i = 0; i < piecesList.length - 1; i++) {
    if (piecesList[i].priority_score < piecesList[i + 1].priority_score) {
      isSorted = false;
      break;
    }
  }
  assert(isSorted === true, 'Les pièces sont rigoureusement triées par priority_score décroissant');
  assert(piecesList[0].priority_score >= 800, `La première pièce proposée est de haute priorité (score ${piecesList[0].priority_score})`);

} finally {
  console.log('\n🛑 Arrêt du serveur de test...');
  serverProcess.kill('SIGTERM');
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
}

console.log('\n===============================================================');
console.log(`📊 BILAN DU TEST DISTRIBUÉ : ${passCount} SUCCÈS / ${failCount} ÉCHECS`);
if (failCount === 0) {
  console.log('🎉 TOUS LES TESTS DISTRIBUÉS SONT AU VERT ! PIPELINE VALIDÉ.');
} else {
  console.log('⚠️ DES ANOMALIES ONT ÉTÉ DÉTECTÉES.');
}
console.log('===============================================================\n');

if (failCount > 0) process.exit(1);
