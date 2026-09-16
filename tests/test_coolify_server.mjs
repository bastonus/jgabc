/**
 * tests/test_coolify_server.mjs
 * 
 * Test de validation automatisé pour le serveur Coolify Oremus :
 * 1. Démarre le serveur Node.js sur un port dédié de test (ex: 4567).
 * 2. Vérifie la route /health (diagnostic Coolify).
 * 3. Envoie un lot de relectures similaire à celui émis par l'APK Android (sendBackgroundBatch).
 * 4. Valide l'écriture sur le volume de persistance local.
 * 5. Vérifie /api/reviews/pending et /api/reviews/stats.
 * 6. Nettoie les fichiers temporaires et arrête le serveur.
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const serverDir = path.join(rootDir, 'server');
const testDataDir = path.join(__dirname, 'temp_coolify_data');

const TEST_PORT = 4567;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

console.log('===============================================================');
console.log('🧪 TEST AUTOMATISÉ : SERVEUR DISTANT COOLIFY (OREMUS RELAY)');
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

// Nettoyage préalable du dossier de test
if (fs.existsSync(testDataDir)) {
  fs.rmSync(testDataDir, { recursive: true, force: true });
}
fs.mkdirSync(testDataDir, { recursive: true });

// Fonction helper pour requête HTTP
function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Oremus-Test-Runner/1.0'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          json = data;
        }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log(`🚀 Démarrage du serveur Coolify en local sur le port ${TEST_PORT}...`);

  const serverProcess = spawn('node', ['index.mjs'], {
    cwd: serverDir,
    env: {
      ...process.env,
      PORT: String(TEST_PORT),
      HOST: '127.0.0.1',
      DATA_DIR: testDataDir
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  serverProcess.stdout.on('data', (d) => {
    // console.log('[SERVER STDOUT]', d.toString().trim());
  });

  serverProcess.stderr.on('data', (d) => {
    console.error('[SERVER STDERR]', d.toString().trim());
  });

  // Attente du démarrage
  await new Promise(r => setTimeout(r, 1000));

  try {
    // ── Test 1 : Healthcheck ──
    console.log('\n🩺 Test 1 : Vérification de la route /health (Healthcheck Coolify)');
    const healthRes = await request('GET', '/health');
    assert(healthRes.status === 200, 'Le serveur renvoie un statut HTTP 200 sur /health');
    assert(healthRes.body && healthRes.body.status === 'ok', 'Le payload contient status: "ok"');
    assert(healthRes.body.service === 'oremus-coolify-relay', 'Le nom du service est identifié');

    // ── Test 2 : Envoi d'un lot d'avis (Batch) ──
    console.log('\n📦 Test 2 : Envoi d\'un lot d\'avis en arrière-plan (Batch APK / Web)');
    const batchPayload = {
      reviews: {
        '107': {
          status: 'approved',
          comment: 'Très bon alignement vidéo et neumes',
          reviewedAt: new Date().toISOString(),
          title: 'Kyrie XI',
          incipit: 'Kyrie eleison',
          youtube_id: 'sample_yt_107',
          author: 'frater_marcellus'
        },
        '338': {
          status: 'bad_gabc',
          comment: 'La mélodie vidéo ne correspond pas à la partition',
          reviewedAt: new Date().toISOString(),
          title: 'Gloria XI',
          incipit: 'Gloria in excelsis Deo',
          youtube_id: 'sample_yt_338',
          author: 'frater_marcellus'
        }
      },
      count: 2,
      client: 'android_apk',
      reason: 'visibility_hidden'
    };

    const reviewRes = await request('POST', '/api/review', batchPayload);
    assert(reviewRes.status === 201, 'Le serveur renvoie un statut HTTP 201 Created');
    assert(reviewRes.body && reviewRes.body.success === true, 'Le serveur confirme le succès de l\'enregistrement');
    assert(reviewRes.body.saved_locally === 2, '2 avis ont été enregistrés localement sur le volume');

    // ── Test 3 : Vérification de la persistance sur disque ──
    console.log('\n💾 Test 3 : Vérification de la persistance locale sur volume Docker');
    const pendingDir = path.join(testDataDir, 'pending');
    assert(fs.existsSync(pendingDir), 'Le sous-dossier pending existe sur le volume');
    const files = fs.readdirSync(pendingDir).filter(f => f.endsWith('.json'));
    assert(files.length === 2, 'Exactement 2 fichiers JSON ont été créés sur le volume');

    const file107 = files.find(f => f.startsWith('107__'));
    assert(file107 !== undefined, 'Le fichier pour la pièce 107 est bien présent');
    if (file107) {
      const content107 = JSON.parse(fs.readFileSync(path.join(pendingDir, file107), 'utf8'));
      assert(content107.status === 'approved', 'Pièce 107 : statut "approved" préservé');
      assert(content107.author === 'frater_marcellus', 'Pièce 107 : auteur préservé');
      assert(content107.triggerReason === 'visibility_hidden', 'Pièce 107 : motif de déclenchement préservé');
    }

    const file338 = files.find(f => f.startsWith('338__'));
    assert(file338 !== undefined, 'Le fichier pour la pièce 338 est bien présent');
    if (file338) {
      const content338 = JSON.parse(fs.readFileSync(path.join(pendingDir, file338), 'utf8'));
      assert(content338.status === 'bad_gabc', 'Pièce 338 : statut "bad_gabc" préservé');
      assert(content338.comment === 'La mélodie vidéo ne correspond pas à la partition', 'Pièce 338 : commentaire textuel préservé');
    }

    // ── Test 4 : Consultation des avis en attente ──
    console.log('\n🔍 Test 4 : Consultation de la liste /api/reviews/pending');
    const pendingListRes = await request('GET', '/api/reviews/pending');
    assert(pendingListRes.status === 200, 'GET /api/reviews/pending renvoie un statut 200');
    assert(pendingListRes.body.total === 2, 'Total d\'avis en attente = 2');

    // ── Test 5 : Statistiques des avis ──
    console.log('\n📊 Test 5 : Consultation des statistiques /api/reviews/stats');
    const statsRes = await request('GET', '/api/reviews/stats');
    assert(statsRes.status === 200, 'GET /api/reviews/stats renvoie un statut 200');
    assert(statsRes.body.breakdown.approved === 1, '1 avis approuvé comptabilisé');
    assert(statsRes.body.breakdown.bad_gabc === 1, '1 mauvais chant comptabilisé');
    assert(statsRes.body.breakdown.rejected === 0, '0 chant décalé comptabilisé');

  } finally {
    console.log('\n🛑 Arrêt du serveur de test...');
    serverProcess.kill('SIGTERM');
    await new Promise(r => setTimeout(r, 600));

    // Nettoyage
    try {
      fs.rmSync(testDataDir, { recursive: true, force: true });
      console.log('🧹 Dossier temporaire nettoyé avec succès.');
    } catch (e) {}
  }

  console.log('\n===============================================================');
  console.log(`📊 BILAN DES TESTS SERVEUR COOLIFY : ${passCount} SUCCÈS / ${failCount} ÉCHECS`);
  if (failCount === 0) {
    console.log('🎉 LE SERVEUR COOLIFY FONCTIONNE À LA PERFECTION !');
  } else {
    console.error('❌ DES ANOMALIES ONT ÉTÉ DÉTECTÉES.');
    process.exit(1);
  }
  console.log('===============================================================');
}

runTests().catch(err => {
  console.error('Exception pendant les tests :', err);
  process.exit(1);
});
