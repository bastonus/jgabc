/**
 * server/index.mjs — Serveur distant Oremus & Relais de Synchronisation
 * 
 * Micro-service Node.js autonome conçu pour être déployé en 1 clic sur Coolify
 * (ou tout conteneur Docker / serveur VPS).
 * 
 * FONCTIONNALITÉS :
 * 1. Zéro dépendance externe (fonctionne avec le runtime natif Node.js 18+).
 * 2. Persistance locale sécurisée sur volume Docker (/data/reviews/pending/).
 * 3. Synchronisation GitHub bidirectionnelle directe (optionnelle via GITHUB_TOKEN).
 * 4. Support complet des requêtes en arrière-plan d'Oremus APK (AndroidBrowser.sendBackgroundBatch)
 *    et Web/PWA (fetch avec keepalive).
 * 5. Endpoints de santé pour Coolify (/health).
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration via variables d'environnement
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PENDING_DIR = path.join(DATA_DIR, 'pending');
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'bastonus';
const GITHUB_REPO = process.env.GITHUB_REPO || 'jgabc';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'master';
const API_KEY = process.env.API_KEY || '';

// Création des répertoires de données locaux
try {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(PENDING_DIR)) fs.mkdirSync(PENDING_DIR, { recursive: true });
} catch (err) {
  console.error('[FATAL] Impossible de créer le répertoire de données:', err);
}

// En-têtes CORS universels
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, User-Agent',
  'Access-Control-Max-Age': '86400'
};

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    ...CORS_HEADERS,
    'Content-Type': 'application/json; charset=utf-8'
  });
  res.end(JSON.stringify(data, null, 2));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 50 * 1024 * 1024) { // 50 MB max
        req.destroy();
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Format JSON invalide : ' + err.message));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Commit direct d'un fichier dans le dépôt GitHub via l'API REST
 */
async function commitReviewToGithub(fileName, contentObj) {
  if (!GITHUB_TOKEN) return { committed: false, reason: 'no_token' };
  
  const filePath = `pipeline/reviews/pending/${fileName}`;
  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`;
  const contentBase64 = Buffer.from(JSON.stringify(contentObj, null, 2), 'utf8').toString('base64');
  
  const res = await fetch(apiUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Oremus-Coolify-Relay/1.0',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: `[Auto-Sync Coolify] Validation #${contentObj.id || 'piece'} (${contentObj.status || 'review'})`,
      content: contentBase64,
      branch: GITHUB_BRANCH
    })
  });
  
  if (res.ok || res.status === 201) {
    return { committed: true };
  } else {
    const errText = await res.text();
    return { committed: false, status: res.status, error: errText };
  }
}

const server = http.createServer(async (req, res) => {
  // Pre-flight OPTIONS
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    return res.end();
  }

  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = reqUrl.pathname;

  // 1. Diagnostics & Healthcheck Coolify
  if (pathname === '/' || pathname === '/health') {
    let pendingCount = 0;
    try {
      if (fs.existsSync(PENDING_DIR)) {
        pendingCount = fs.readdirSync(PENDING_DIR).filter(f => f.endsWith('.json')).length;
      }
    } catch (e) {}

    return sendJson(res, 200, {
      status: 'ok',
      service: 'oremus-coolify-relay',
      version: '1.0.0',
      time: new Date().toISOString(),
      github_sync_enabled: !!GITHUB_TOKEN,
      github_repo: `${GITHUB_OWNER}/${GITHUB_REPO}`,
      pending_reviews_on_disk: pendingCount
    });
  }

  // Vérification de la clé API si configurée
  if (API_KEY) {
    const auth = req.headers['authorization'] || reqUrl.searchParams.get('key');
    if (!auth || (auth !== API_KEY && auth !== `Bearer ${API_KEY}`)) {
      return sendJson(res, 401, { error: 'Non autorise. Cle API invalide.' });
    }
  }

  // 2. Réception des relectures (Unique ou Lot par batch)
  if (req.method === 'POST' && (pathname === '/api/review' || pathname === '/api/reviews' || pathname === '/api/reviews/batch')) {
    try {
      const data = await parseBody(req);
      const reviewsMap = {};

      // Cas A : Lot de relectures envoyé par Oremus ({ reviews: { '107': { ... } } })
      if (data.reviews && typeof data.reviews === 'object') {
        Object.assign(reviewsMap, data.reviews);
      }
      // Cas B : Relecture individuelle ({ piece_id: '107', status: 'approved', ... })
      else if (data.piece_id && data.status) {
        reviewsMap[data.piece_id] = data;
      }

      const count = Object.keys(reviewsMap).length;
      if (count === 0) {
        return sendJson(res, 400, { error: 'Aucun avis valide fourni dans la requete.' });
      }

      const client = data.client || 'oremus_client';
      const reason = data.reason || 'manual_or_timer';
      const nowIso = new Date().toISOString();
      const timestamp = Date.now();

      const savedFiles = [];
      const githubResults = [];

      for (const [pieceId, rev] of Object.entries(reviewsMap)) {
        const safeId = String(pieceId).replace(/[^a-zA-Z0-9_-]/g, '_');
        const rand = Math.random().toString(36).substring(2, 6);
        const fileName = `${safeId}__coolify_${timestamp}_${rand}.json`;
        const filePath = path.join(PENDING_DIR, fileName);

        const reviewPayload = {
          id: pieceId,
          status: rev.status || 'unreviewed',
          comment: rev.comment || '',
          reviewedAt: rev.reviewedAt || nowIso,
          title: rev.title || '',
          incipit: rev.incipit || '',
          youtube_id: rev.youtube_id || '',
          author: rev.author || 'mobile_reviewer',
          client: client,
          triggerReason: reason,
          receivedAt: nowIso
        };

        // Sauvegarde sur volume local persistant
        try {
          fs.writeFileSync(filePath, JSON.stringify(reviewPayload, null, 2), 'utf8');
          savedFiles.push(fileName);
        } catch (writeErr) {
          console.error(`[ERROR] Impossible d'ecrire ${fileName} sur disque:`, writeErr);
        }

        // Commit GitHub direct si activé
        if (GITHUB_TOKEN) {
          try {
            const ghRes = await commitReviewToGithub(fileName, reviewPayload);
            githubResults.push({ id: pieceId, ...ghRes });
          } catch (ghErr) {
            githubResults.push({ id: pieceId, committed: false, error: ghErr.message });
          }
        }
      }

      console.log(`[SYNC] ${savedFiles.length}/${count} avis enregistres (client: ${client}, declencheur: ${reason})`);

      return sendJson(res, 201, {
        success: true,
        saved_locally: savedFiles.length,
        committed_to_github: githubResults.filter(r => r.committed).length,
        files: savedFiles,
        github_details: GITHUB_TOKEN ? githubResults : 'github_sync_disabled'
      });

    } catch (err) {
      console.error('[ERROR] Erreur lors du traitement du lot:', err);
      return sendJson(res, 500, { error: 'Erreur serveur interne : ' + err.message });
    }
  }

  // 3. Consultation des avis en attente sur le volume
  if (req.method === 'GET' && pathname === '/api/reviews/pending') {
    try {
      const files = fs.readdirSync(PENDING_DIR).filter(f => f.endsWith('.json'));
      const pendingList = [];
      for (const f of files) {
        try {
          const raw = fs.readFileSync(path.join(PENDING_DIR, f), 'utf8');
          pendingList.push(JSON.parse(raw));
        } catch (e) {}
      }
      return sendJson(res, 200, {
        total: pendingList.length,
        reviews: pendingList
      });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // 4. Statistiques des avis enregistrés
  if (req.method === 'GET' && pathname === '/api/reviews/stats') {
    try {
      const files = fs.readdirSync(PENDING_DIR).filter(f => f.endsWith('.json'));
      let approved = 0, bad_gabc = 0, rejected = 0;
      for (const f of files) {
        try {
          const content = JSON.parse(fs.readFileSync(path.join(PENDING_DIR, f), 'utf8'));
          if (content.status === 'approved') approved++;
          else if (content.status === 'bad_gabc') bad_gabc++;
          else if (content.status === 'rejected') rejected++;
        } catch (e) {}
      }
      return sendJson(res, 200, {
        total_pending: files.length,
        breakdown: { approved, bad_gabc, rejected }
      });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // 404 Route non trouvée
  return sendJson(res, 404, {
    error: 'Route non trouvee.',
    available_endpoints: [
      'GET  /health',
      'POST /api/review',
      'GET  /api/reviews/pending',
      'GET  /api/reviews/stats'
    ]
  });
});

server.listen(PORT, HOST, () => {
  console.log(`=======================================================`);
  console.log(`🚀 Oremus Coolify Relay Server actif sur http://${HOST}:${PORT}`);
  console.log(`📁 Repertoire de donnees local : ${PENDING_DIR}`);
  console.log(`🐙 Sync GitHub : ${GITHUB_TOKEN ? 'ACTIVEE (' + GITHUB_OWNER + '/' + GITHUB_REPO + ')' : 'DESACTIVEE (sauvegarde locale seule)'}`);
  console.log(`=======================================================`);
});

// Arrêt propre du serveur
function gracefulShutdown(signal) {
  console.log(`[SHUTDOWN] Signal ${signal} recu. Arret propre du serveur...`);
  server.close(() => {
    console.log('[SHUTDOWN] Serveur arrete.');
    process.exit(0);
  });
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
