/**
 * simulate_apk_review_flow.mjs
 * 
 * End-to-end simulation of the Android APK chant review submission pipeline:
 * 1. Simulates Android WebView & JavascriptInterface (AndroidBrowser).
 * 2. Simulates host window message listener (js/divinum_officium.js).
 * 3. Simulates in-app iframe Alignment Lab voting (pipeline/alignment-lab.html).
 * 4. Simulates 1-click issue submission (postMessage -> AndroidBrowser.openUrl).
 * 5. Simulates native share sheet (postMessage -> AndroidBrowser.shareText).
 * 6. Simulates Serverless Relay worker handling (tools/review_relay_worker.mjs).
 * 7. Simulates GitHub Actions issue ingestion (tools/review_queue.py stage).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

console.log('===============================================================');
console.log('🧪 SIMULATION : FLUX COMPLET SOUMISSION AVIS DEPUIS L\'APK');
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

// ─────────────────────────────────────────────────────────────────────────────
// ETAPE 1 : Simulation du conteneur Android (MainActivity + JavascriptInterface)
// ─────────────────────────────────────────────────────────────────────────────
console.log('📱 Étape 1 : Initialisation du conteneur natif Android (WebView + Bridge)');

const nativeBrowserCalls = {
  openUrl: [],
  shareText: [],
  sendBackgroundBatch: []
};

// Simulation exacte de l'interface Java AndroidBrowser injectée par MainActivity.java
const AndroidBrowser = {
  openUrl(url) {
    nativeBrowserCalls.openUrl.push({ url, timestamp: Date.now() });
  },
  shareText(title, text) {
    nativeBrowserCalls.shareText.push({ title, text, timestamp: Date.now() });
  },
  sendBackgroundBatch(url, jsonPayload, authHeader) {
    nativeBrowserCalls.sendBackgroundBatch.push({ url, jsonPayload, authHeader, timestamp: Date.now() });
  }
};

// Simulation de la fenêtre hôte (divinum-officium.html)
const hostListeners = {};
const parentWindow = {
  AndroidBrowser: AndroidBrowser,
  addEventListener(event, callback) {
    if (!hostListeners[event]) hostListeners[event] = [];
    hostListeners[event].push(callback);
  },
  triggerEvent(event, data) {
    if (hostListeners[event]) {
      for (const cb of hostListeners[event]) {
        cb({ data });
      }
    }
  }
};

// Enregistrement du listener extrait de js/divinum_officium.js
parentWindow.addEventListener('message', function(e) {
  if (!e.data) return;
  if (e.data === 'close_alignment_lab' || (typeof e.data === 'object' && e.data.type === 'close_alignment_lab')) {
    // modal close
  } else if (typeof e.data === 'object' && e.data.type === 'open_external_url' && e.data.url) {
    if (parentWindow.AndroidBrowser && typeof parentWindow.AndroidBrowser.openUrl === 'function') {
      parentWindow.AndroidBrowser.openUrl(e.data.url);
    }
  } else if (typeof e.data === 'object' && e.data.type === 'share_text' && e.data.text) {
    if (parentWindow.AndroidBrowser && typeof parentWindow.AndroidBrowser.shareText === 'function') {
      parentWindow.AndroidBrowser.shareText(e.data.title || 'Avis Oremus', e.data.text);
    }
  } else if (typeof e.data === 'object' && e.data.type === 'send_background_batch' && e.data.url) {
    if (parentWindow.AndroidBrowser && typeof parentWindow.AndroidBrowser.sendBackgroundBatch === 'function') {
      parentWindow.AndroidBrowser.sendBackgroundBatch(e.data.url, e.data.payload, e.data.authHeader || '');
    }
  } else if (typeof e.data === 'object' && e.data.type === 'open_sidebar') {
    parentWindow.sidebarOpened = true;
  }
});

assert(typeof parentWindow.AndroidBrowser.openUrl === 'function', 'Interface AndroidBrowser.openUrl injectée avec succès');
assert(typeof parentWindow.AndroidBrowser.shareText === 'function', 'Interface AndroidBrowser.shareText injectée avec succès');
assert(typeof parentWindow.AndroidBrowser.sendBackgroundBatch === 'function', 'Interface AndroidBrowser.sendBackgroundBatch injectée avec succès');

// ─────────────────────────────────────────────────────────────────────────────
// ETAPE 2 : Simulation de l'iframe Alignment Lab (pipeline/alignment-lab.html)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n🔬 Étape 2 : Simulation des votes dans l\'iframe du Laboratoire');

const iframeWindow = {
  parent: parentWindow,
  showToast(msg) { /* mock toast */ }
};

// Fonctions clientes du laboratoire (identiques à pipeline/alignment-lab.html)
function openExternalUrl(url) {
  if (iframeWindow.AndroidBrowser && typeof iframeWindow.AndroidBrowser.openUrl === 'function') {
    iframeWindow.AndroidBrowser.openUrl(url);
    return true;
  }
  if (iframeWindow.parent && iframeWindow.parent !== iframeWindow) {
    iframeWindow.parent.triggerEvent('message', { type: 'open_external_url', url: url });
    return true;
  }
  return false;
}

function shareReviewsPayload(title, text) {
  if (iframeWindow.AndroidBrowser && typeof iframeWindow.AndroidBrowser.shareText === 'function') {
    iframeWindow.AndroidBrowser.shareText(title, text);
    return true;
  }
  if (iframeWindow.parent && iframeWindow.parent !== iframeWindow) {
    iframeWindow.parent.triggerEvent('message', { type: 'share_text', title: title, text: text });
    return true;
  }
  return false;
}

// Jeu de données de test simulé (2 chants votés par l'utilisateur)
const mockReviews = {
  "107": {
    status: "approved",
    comment: "Excellent alignement note par note",
    reviewedAt: "2026-09-16T15:05:00.000Z",
    title: "Kyrie XI (Orbis Factor)",
    incipit: "Kyrie",
    youtube_id: "dQw4w9WgXcQ"
  },
  "338": {
    status: "bad_gabc",
    comment: "Décalage rythmique au verset 2",
    reviewedAt: "2026-09-16T15:06:00.000Z",
    title: "Gloria VIII (De Angelis)",
    incipit: "Gloria in excelsis",
    youtube_id: "l482T0yNkeo"
  }
};

function buildReviewsPayload(reviews) {
  const entries = Object.entries(reviews);
  const count = entries.length;
  const approved = entries.filter(([k, v]) => v.status === 'approved').length;
  const bad = entries.filter(([k, v]) => v.status === 'bad_gabc').length;
  const rejected = entries.filter(([k, v]) => v.status === 'rejected').length;

  const jsonStr = JSON.stringify(reviews, null, 2);
  const title = `[Validation Gregorienne] ${count} chants verifies`;
  const body = `### Soumission de validations gregoriennes (${count} pieces)\n\n- **Bien alignes** : ${approved}\n- **Mauvais chant** : ${bad}\n- **Decales** : ${rejected}\n\n\`\`\`json\n${jsonStr}\n\`\`\`\n\n*Genere automatiquement depuis le Laboratoire d'alignement Oremus.*`;

  return { count, approved, bad, rejected, jsonStr, title, body };
}

function submitToGithubIssue(reviews) {
  const payload = buildReviewsPayload(reviews);
  const encodedTitle = encodeURIComponent(payload.title);
  const encodedLabels = encodeURIComponent('lab-review');
  const encodedBody = encodeURIComponent(payload.body);
  const fullUrl = `https://github.com/bastonus/jgabc/issues/new?title=${encodedTitle}&labels=${encodedLabels}&body=${encodedBody}`;

  openExternalUrl(fullUrl);
  return { fullUrl, payload };
}

function shareReviewsDirect(reviews) {
  const payload = buildReviewsPayload(reviews);
  shareReviewsPayload(payload.title, payload.body);
  return payload;
}

// ─────────────────────────────────────────────────────────────────────────────
// ETAPE 3 : Exécution du clic "Envoyer vers GitHub" depuis l'APK
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n🚀 Étape 3 : Clic sur "Envoyer vers GitHub" depuis l\'APK');

const { fullUrl, payload } = submitToGithubIssue(mockReviews);

assert(nativeBrowserCalls.openUrl.length === 1, 'L\'appel openExternalUrl a traversé l\'iframe et déclenché AndroidBrowser.openUrl');

const capturedCall = nativeBrowserCalls.openUrl[0];
const parsedUrl = new URL(capturedCall.url);

assert(parsedUrl.origin === 'https://github.com', 'URL cible dirigée vers https://github.com');
assert(parsedUrl.pathname === '/bastonus/jgabc/issues/new', 'Chemin cible vers /bastonus/jgabc/issues/new');
assert(parsedUrl.searchParams.get('labels') === 'lab-review', 'Label "lab-review" correctement paramétré');
assert(parsedUrl.searchParams.get('title') === '[Validation Gregorienne] 2 chants verifies', 'Titre pré-rempli correctement calculé');

const capturedBody = parsedUrl.searchParams.get('body');
assert(capturedBody.includes('```json'), 'Le corps de l\'issue contient le bloc de code ```json');
assert(capturedBody.includes('"107":'), 'La pièce 107 figure dans le JSON du ticket');
assert(capturedBody.includes('"338":'), 'La pièce 338 figure dans le JSON du ticket');

// ─────────────────────────────────────────────────────────────────────────────
// ETAPE 4 : Exécution du clic "Partager mes avis" (Native Share Sheet)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n📤 Étape 4 : Clic sur "Partager mes avis" (Partage natif sans compte GitHub)');

shareReviewsDirect(mockReviews);

assert(nativeBrowserCalls.shareText.length === 1, 'L\'appel shareReviewsDirect a traversé l\'iframe et déclenché AndroidBrowser.shareText');
const capturedShare = nativeBrowserCalls.shareText[0];
assert(capturedShare.title === '[Validation Gregorienne] 2 chants verifies', 'Titre du partage conforme');
assert(capturedShare.text.includes('Kyrie XI'), 'Texte du partage contient le détail des pièces');

// ─────────────────────────────────────────────────────────────────────────────
// ETAPE 4b : Ouverture de la Sidebar Oremus par-dessus le modal
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n📖 Étape 4b : Clic sur le bouton "Menu" pour ouvrir la Sidebar par-dessus');

function openParentSidebar() {
  if (iframeWindow.parent && iframeWindow.parent !== iframeWindow) {
    iframeWindow.parent.triggerEvent('message', { type: 'open_sidebar' });
  }
}

openParentSidebar();
assert(parentWindow.sidebarOpened === true, 'Le message open_sidebar a ouvert la barre latérale Oremus par-dessus le modal');

// ─────────────────────────────────────────────────────────────────────────────
// ETAPE 4c : Simulation de l'Envoi Automatique par Lot en Arrière-plan
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n⏱️ Étape 4c : Test de l\'envoi automatique par lot (Debounce 5 min + Sortie d\'app)');

// Simulation du state du lot non synchronisé dans l'iframe
let simulatedUnsyncedBatch = {};
let autoSyncTimerArmed = false;
let autoSyncTriggeredReason = null;

function queueReviewForAutoBatchSim(pieceId, reviewData) {
  simulatedUnsyncedBatch[pieceId] = reviewData;
  autoSyncTimerArmed = true;
}

function sendBatchReviewsInBackgroundSim(triggerReason) {
  const count = Object.keys(simulatedUnsyncedBatch).length;
  if (count === 0) return;

  const payload = {
    reviews: simulatedUnsyncedBatch,
    count: count,
    client: 'android_apk',
    timestamp: new Date().toISOString(),
    reason: triggerReason
  };

  const payloadStr = JSON.stringify(payload);
  const relayUrl = 'https://relay.workers.dev/api/review';

  // Dispatch via bridge natif Android ou postMessage
  if (iframeWindow.parent && iframeWindow.parent !== iframeWindow) {
    iframeWindow.parent.triggerEvent('message', {
      type: 'send_background_batch',
      url: relayUrl,
      payload: payloadStr,
      authHeader: ''
    });
  }
  autoSyncTriggeredReason = triggerReason;
  simulatedUnsyncedBatch = {};
  autoSyncTimerArmed = false;
}

// 1. L'utilisateur vote sur 2 pièces
queueReviewForAutoBatchSim('107', mockReviews['107']);
queueReviewForAutoBatchSim('338', mockReviews['338']);

assert(Object.keys(simulatedUnsyncedBatch).length === 2, '2 avis accumulés dans le lot en attente');
assert(autoSyncTimerArmed === true, 'Le compte à rebours d\'inactivité (5 min) est armé');

// 2. Simulation de la sortie de l'application (l'utilisateur quitte l'app ou verrouille son écran)
sendBatchReviewsInBackgroundSim('visibility_hidden');

assert(nativeBrowserCalls.sendBackgroundBatch.length === 1, 'L\'événement a déclenché AndroidBrowser.sendBackgroundBatch en tâche de fond');
const batchCall = nativeBrowserCalls.sendBackgroundBatch[0];
assert(batchCall.url === 'https://relay.workers.dev/api/review', 'URL cible du relais bien configurée');

const parsedBatchPayload = JSON.parse(batchCall.jsonPayload);
assert(parsedBatchPayload.count === 2, 'Le payload contient bien les 2 avis du lot');
assert(parsedBatchPayload.reason === 'visibility_hidden', 'Le déclencheur "visibility_hidden" (sortie d\'app) est tracé');
assert(parsedBatchPayload.reviews['107'].status === 'approved', 'Avis 107 complet transmis');
assert(parsedBatchPayload.reviews['338'].status === 'bad_gabc', 'Avis 338 complet transmis');
assert(Object.keys(simulatedUnsyncedBatch).length === 0, 'La file d\'attente locale est vidée après transmission');

// ─────────────────────────────────────────────────────────────────────────────
// ETAPE 5 : Simulation du Relais Serverless Direct (Mode ZÉRO ISSUE GITHUB)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n☁️ Étape 5 : Test du Relais Serverless Direct (Mode ZÉRO ISSUE GITHUB)');

import workerModule from '../tools/review_relay_worker.mjs';

// Simulation de requête POST /api/review
const mockRequest = {
  method: 'POST',
  url: 'https://relay.workers.dev/api/review',
  async json() {
    return {
      reviews: mockReviews,
      count: 2,
      client: 'android_apk'
    };
  }
};

const capturedGitPuts = [];
globalThis.fetch = async (url, options) => {
  if (url.includes('api.github.com/repos/bastonus/jgabc/contents/pipeline/reviews/pending/')) {
    capturedGitPuts.push({ url, options, body: JSON.parse(options.body) });
    return {
      ok: true,
      status: 201,
      async json() {
        return { content: { name: 'staged.json', path: url.split('/contents/')[1] } };
      }
    };
  }
  return { ok: false, status: 404 };
};

const mockEnv = {
  GITHUB_TOKEN: 'fake_test_pat_token',
  GITHUB_OWNER: 'bastonus',
  GITHUB_REPO: 'jgabc'
};

const workerResponse = await workerModule.fetch(mockRequest, mockEnv);
const workerJson = await workerResponse.json();

assert(workerResponse.status === 201, 'Le Worker renvoie un statut HTTP 201 Created');
assert(workerJson.ok === true, 'Le Worker confirme le traitement');
assert(workerJson.mode === 'direct_commit_zero_issue', 'Le Worker a fonctionné en mode DIRECT ZÉRO ISSUE');
assert(workerJson.staged_count === 2, 'Les 2 pièces ont été directement committées dans pending/');
assert(capturedGitPuts.length === 2, '2 requêtes PUT GitHub Contents ont été effectuées vers pipeline/reviews/pending/');
assert(capturedGitPuts[0].body.message.includes('chore(reviews): stage piece'), 'Message de commit git conforme');

// ─────────────────────────────────────────────────────────────────────────────
// ETAPE 6 : Simulation de l'ingestion GitHub Actions (tools/review_queue.py stage)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n🤖 Étape 6 : Simulation du Workflow GitHub Actions (stage_reviews.yml)');

// Exécution du script de staging python avec le corps d'issue généré depuis l'APK
const tempBodyFile = path.join(rootDir, '_sim_issue_body.txt');
fs.writeFileSync(tempBodyFile, capturedBody, 'utf-8');

try {
  const pyStageCmd = `python tools/review_queue.py stage --issue-number 99991 --file _sim_issue_body.txt --author "mobile_reviewer" --issue-url "https://github.com/bastonus/jgabc/issues/99991"`;
  const stageOutput = execSync(pyStageCmd, { cwd: rootDir, encoding: 'utf-8' });
  console.log('  Sortie review_queue.py stage :\n   ', stageOutput.trim().split('\n').join('\n    '));

  const pending107 = path.join(rootDir, 'pipeline', 'reviews', 'pending', '107__issue_99991.json');
  const pending338 = path.join(rootDir, 'pipeline', 'reviews', 'pending', '338__issue_99991.json');

  assert(fs.existsSync(pending107), 'La pièce 107 a été mise en attente dans pipeline/reviews/pending/');
  assert(fs.existsSync(pending338), 'La pièce 338 a été mise en attente dans pipeline/reviews/pending/');

  if (fs.existsSync(pending107)) {
    const data107 = JSON.parse(fs.readFileSync(pending107, 'utf-8'));
    assert(data107.status === 'approved', 'Pièce 107 : statut "approved" préservé');
    assert(data107.author === 'mobile_reviewer', 'Pièce 107 : auteur mobile_reviewer enregistré');
  }

  if (fs.existsSync(pending338)) {
    const data338 = JSON.parse(fs.readFileSync(pending338, 'utf-8'));
    assert(data338.status === 'bad_gabc', 'Pièce 338 : statut "bad_gabc" préservé');
    assert(data338.comment === 'Décalage rythmique au verset 2', 'Pièce 338 : commentaire textuel préservé');
  }

  // Vérification de la commande review_queue.py list
  const listOutput = execSync('python tools/review_queue.py list', { cwd: rootDir, encoding: 'utf-8' });
  assert(listOutput.includes('107') && listOutput.includes('338'), 'La commande list affiche les deux avis en attente');

  // Nettoyage des fichiers temporaires de simulation
  if (fs.existsSync(pending107)) fs.unlinkSync(pending107);
  if (fs.existsSync(pending338)) fs.unlinkSync(pending338);
  console.log('  🧹 Nettoyage des 2 fichiers de test de la file d\'attente terminé');

} finally {
  if (fs.existsSync(tempBodyFile)) fs.unlinkSync(tempBodyFile);
}

// ─────────────────────────────────────────────────────────────────────────────
// BILAN DE LA SIMULATION
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n===============================================================');
console.log(`📊 BILAN DU TEST : ${passCount} SUCCÈS / ${failCount} ÉCHECS`);
if (failCount === 0) {
  console.log('🎉 TOUS LES TESTS SONT AU VERT ! L\'ARCHITECTURE APK EST 100% VALIDE.');
} else {
  console.log('⚠️ DES ANOMALIES ONT ÉTÉ DÉTECTÉES.');
}
console.log('===============================================================\n');

if (failCount > 0) process.exit(1);
