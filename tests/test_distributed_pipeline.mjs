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
  assert(Array.isArray(statusRes.json.leaderboard), 'Tableau du leaderboard présent');

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
  assert(statusRes2.json.completed === 1, '1 tâche marquée comme complétée');
  assert(statusRes2.json.leaderboard.length >= 1, 'Au moins un contributeur au classement');
  assert(statusRes2.json.leaderboard[0].name === 'Ami-Alexandre-RTX', 'Nom du contributeur fidèle');
  assert(statusRes2.json.leaderboard[0].count === 1, 'Score du contributeur = 1');

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
