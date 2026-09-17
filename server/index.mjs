/**
 * server/index.mjs — Serveur distant Oremus, Relais d'avis & Moteur de Calcul Distribué
 * 
 * Micro-service Node.js autonome conçu pour être déployé en 1 clic sur Coolify
 * (ou tout conteneur Docker / serveur VPS).
 * 
 * FONCTIONNALITÉS :
 * 1. Zéro dépendance externe (runtime natif Node.js 18+).
 * 2. Persistance locale sécurisée sur volume Docker (/data/reviews/, /data/jobs/, /data/alignments/).
 * 3. Réception en direct et exportation rapide des avis utilisateurs (/api/reviews/export, /api/reviews/export.csv).
 * 4. File de calcul distribué (Job Queue) pour mutualiser la puissance de calcul d'amis (/api/jobs/*).
 * 5. Portail web public d'accueil et de téléchargement du pack worker (/worker, /download/worker.zip).
 * 6. Healthcheck pour Coolify (/health).
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
const JOBS_DIR = path.join(DATA_DIR, 'jobs');
const ALIGNMENTS_DIR = path.join(DATA_DIR, 'alignments');
const PUBLIC_DIR = path.join(__dirname, 'public');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'bastonus';
const GITHUB_REPO = process.env.GITHUB_REPO || 'jgabc';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'master';
const API_KEY = process.env.API_KEY || '';

// Durée du bail d'une tâche attribuée à un worker (20 minutes)
const CLAIM_LEASE_MS = 20 * 60 * 1000;

// Fichiers d'état
const TASKS_FILE = path.join(JOBS_DIR, 'tasks.json');
const WORKERS_FILE = path.join(JOBS_DIR, 'workers.json');
const CATALOG_PATH = path.join(__dirname, 'catalog.json');

// Création des répertoires de données locaux
try {
  for (const d of [DATA_DIR, PENDING_DIR, JOBS_DIR, ALIGNMENTS_DIR, PUBLIC_DIR]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
} catch (err) {
  console.error('[FATAL] Impossible de créer les répertoires de données:', err);
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
        reject(new Error('Taille du corps de requête dépassée (max 50 Mo)'));
      }
    });
    req.on('end', () => {
      if (!body.trim()) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Format JSON invalide : ' + err.message));
      }
    });
    req.on('error', reject);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// MOTEUR DE GESTION DE LA FILE DE CALCUL DISTRIBUÉ (JOB QUEUE)
// ─────────────────────────────────────────────────────────────────────────────

let tasksCache = null;
let workersCache = null;

function loadTasks() {
  if (tasksCache) return tasksCache;
  if (fs.existsSync(TASKS_FILE)) {
    try {
      tasksCache = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
      return tasksCache;
    } catch (e) {
      console.warn('[JOBS] Erreur lecture tasks.json, réinitialisation...');
    }
  }

  // Initialisation à partir du catalogue de pièces
  let catalog = [];
  if (fs.existsSync(CATALOG_PATH)) {
    try {
      catalog = JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8'));
    } catch (e) {}
  }

  tasksCache = catalog.map(p => ({
    id: String(p.id),
    incipit: p.incipit || p.title || `Pièce #${p.id}`,
    part: p.part || 'Chant',
    youtube_id: p.youtube_id || '',
    youtube_url: p.youtube_url || (p.youtube_id ? `https://www.youtube.com/watch?v=${p.youtube_id}` : ''),
    gabc_src: p.gabc_src || '',
    status: 'pending', // 'pending' | 'claimed' | 'completed' | 'failed'
    worker_id: null,
    claimed_at: null,
    completed_at: null,
    error: null
  }));

  saveTasks();
  return tasksCache;
}

function saveTasks() {
  if (!tasksCache) return;
  try {
    fs.writeFileSync(TASKS_FILE, JSON.stringify(tasksCache, null, 2), 'utf8');
  } catch (e) {
    console.error('[JOBS] Erreur sauvegarde tasks.json:', e);
  }
}

function loadWorkers() {
  if (workersCache) return workersCache;
  if (fs.existsSync(WORKERS_FILE)) {
    try {
      workersCache = JSON.parse(fs.readFileSync(WORKERS_FILE, 'utf8'));
      return workersCache;
    } catch (e) {}
  }
  workersCache = {};
  return workersCache;
}

function saveWorkers() {
  if (!workersCache) return;
  try {
    fs.writeFileSync(WORKERS_FILE, JSON.stringify(workersCache, null, 2), 'utf8');
  } catch (e) {
    console.error('[JOBS] Erreur sauvegarde workers.json:', e);
  }
}

function claimNextTask(workerId) {
  const tasks = loadTasks();
  const now = Date.now();

  // Recherche d'une tâche en attente ou d'un bail expiré
  const task = tasks.find(t => 
    t.status === 'pending' || 
    (t.status === 'claimed' && t.claimed_at && (now - t.claimed_at > CLAIM_LEASE_MS))
  );

  if (!task) return null;

  task.status = 'claimed';
  task.worker_id = workerId || 'Ami-Anonyme';
  task.claimed_at = now;
  saveTasks();

  return {
    id: task.id,
    incipit: task.incipit,
    part: task.part,
    youtube_id: task.youtube_id,
    youtube_url: task.youtube_url,
    gabc_src: task.gabc_src
  };
}

function submitTaskResult(result) {
  const tasks = loadTasks();
  const pieceId = String(result.piece_id || result.id);
  const task = tasks.find(t => t.id === pieceId);

  if (!task) return { success: false, error: 'Tâche introuvable' };

  const now = Date.now();
  const workerId = result.worker_id || 'Ami-Anonyme';

  if (result.status === 'completed' && Array.isArray(result.timestamps)) {
    task.status = 'completed';
    task.completed_at = now;
    task.worker_id = workerId;
    task.error = null;

    // Enregistrement des horodatages validés
    const alignmentPath = path.join(ALIGNMENTS_DIR, `${pieceId}.json`);
    const alignmentData = {
      piece_id: pieceId,
      incipit: task.incipit,
      part: task.part,
      worker_id: workerId,
      compute_device: result.compute_device || 'Unknown',
      compute_time_sec: result.compute_time_sec || 0,
      audio_duration_sec: result.audio_duration_sec || 0,
      completed_at: new Date(now).toISOString(),
      timestamps: result.timestamps
    };
    try {
      fs.writeFileSync(alignmentPath, JSON.stringify(alignmentData, null, 2), 'utf8');
    } catch (e) {
      console.error('[JOBS] Erreur écriture alignement:', e);
    }

    // Mise à jour des statistiques du worker
    const workers = loadWorkers();
    if (!workers[workerId]) {
      workers[workerId] = { count: 0, last_active: null, device: result.compute_device || 'CPU' };
    }
    workers[workerId].count += 1;
    workers[workerId].last_active = new Date(now).toISOString();
    if (result.compute_device) workers[workerId].device = result.compute_device;
    saveWorkers();

    saveTasks();
    return { success: true, piece_id: pieceId, worker_total: workers[workerId].count };

  } else if (result.status === 'failed') {
    task.status = 'failed';
    task.error = result.error || 'Erreur inconnue signalée par le worker';
    saveTasks();
    return { success: true, piece_id: pieceId, status: 'failed_recorded' };
  }

  return { success: false, error: 'Données invalides fournies' };
}

function getJobsStats() {
  const tasks = loadTasks();
  const workers = loadWorkers();
  const now = Date.now();

  let completed = 0;
  let pending = 0;
  let inProgress = 0;
  let failed = 0;

  for (const t of tasks) {
    if (t.status === 'completed') completed++;
    else if (t.status === 'claimed') {
      if (t.claimed_at && (now - t.claimed_at < CLAIM_LEASE_MS)) {
        inProgress++;
      } else {
        pending++; // Bail expiré
      }
    } else if (t.status === 'failed') failed++;
    else pending++;
  }

  const leaderboard = Object.entries(workers)
    .map(([name, data]) => ({ name, count: data.count, last_active: data.last_active, device: data.device }))
    .sort((a, b) => b.count - a.count);

  return {
    total_pieces: tasks.length,
    completed,
    pending,
    in_progress: inProgress,
    failed,
    percentage: tasks.length > 0 ? ((completed / tasks.length) * 100).toFixed(1) : '0.0',
    active_workers: Object.keys(workers).length,
    leaderboard
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE WEB PUBLIQUE DE TÉLÉCHARGEMENT & INSTRUCTIONS (/worker)
// ─────────────────────────────────────────────────────────────────────────────

function renderWorkerPortalHtml(stats) {
  const lbRows = stats.leaderboard.length > 0 
    ? stats.leaderboard.slice(0, 10).map((w, idx) => `
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
          <td style="padding:10px 14px; font-weight:700; color:${idx === 0 ? '#fbbf24' : (idx === 1 ? '#94a3b8' : (idx === 2 ? '#b45309' : '#64748b'))};">#${idx + 1}</td>
          <td style="padding:10px 14px; font-weight:600; color:#f8fafc;">${w.name}</td>
          <td style="padding:10px 14px; font-size:0.85rem; color:#94a3b8;">${w.device || 'CPU'}</td>
          <td style="padding:10px 14px; text-align:right; font-weight:700; color:#10b981;">${w.count} chants</td>
        </tr>
      `).join('')
    : '<tr><td colspan="4" style="padding:18px; text-align:center; color:#64748b;">Soyez le premier ami à démarrer un calcul !</td></tr>';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Oremus — Calcul Distribué Liturgique</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>✦</text></svg>">
  <style>
    :root {
      --bg: #0b0f19;
      --card-bg: #131b2e;
      --card-border: #1e293b;
      --gold: #d97706;
      --gold-light: #fbbf24;
      --emerald: #10b981;
      --text: #f8fafc;
      --text-muted: #94a3b8;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 24px 16px 60px;
    }
    .container { max-width: 900px; margin: 0 auto; }
    .header { text-align: center; margin-bottom: 32px; }
    .badge {
      display: inline-block; padding: 4px 12px; border-radius: 999px;
      background: rgba(217, 119, 6, 0.15); border: 1px solid rgba(251, 191, 36, 0.3);
      color: var(--gold-light); font-size: 0.82rem; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.05em; margin-bottom: 12px;
    }
    h1 { font-size: 2.2rem; font-weight: 800; letter-spacing: -0.02em; margin-bottom: 8px; }
    p.lead { font-size: 1.05rem; color: var(--text-muted); max-width: 650px; margin: 0 auto; }
    
    .card {
      background: var(--card-bg); border: 1px solid var(--card-border);
      border-radius: 16px; padding: 24px; margin-bottom: 24px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
    }
    
    /* Progress Bar */
    .progress-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; }
    .progress-bar-bg { height: 14px; background: rgba(255,255,255,0.06); border-radius: 999px; overflow: hidden; }
    .progress-bar-fill { height: 100%; background: linear-gradient(90deg, #10b981, #34d399); width: ${stats.percentage}%; transition: width 0.5s ease; }
    
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-top: 18px; }
    .stat-box { background: rgba(0,0,0,0.2); border: 1px solid rgba(255,255,255,0.05); border-radius: 12px; padding: 14px; text-align: center; }
    .stat-val { font-size: 1.6rem; font-weight: 800; color: #fff; }
    .stat-lbl { font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; margin-top: 4px; }
    
    /* Big CTA Button */
    .cta-container { text-align: center; margin: 28px 0; }
    .btn-download {
      display: inline-flex; align-items: center; gap: 10px;
      background: linear-gradient(135deg, #d97706, #b45309);
      color: #fff; text-decoration: none; padding: 16px 32px;
      font-size: 1.15rem; font-weight: 700; border-radius: 14px;
      box-shadow: 0 10px 25px -5px rgba(217, 119, 6, 0.5);
      transition: transform 0.15s, box-shadow 0.15s;
    }
    .btn-download:hover { transform: translateY(-2px); box-shadow: 0 15px 30px -5px rgba(217, 119, 6, 0.7); }
    
    /* Steps Guide */
    .step-item { display: flex; gap: 16px; margin-bottom: 20px; align-items: flex-start; }
    .step-num {
      width: 36px; height: 36px; border-radius: 50%;
      background: var(--gold); color: #fff; display: flex;
      align-items: center; justify-content: center; font-weight: 800; flex-shrink: 0;
    }
    .step-title { font-size: 1.05rem; font-weight: 700; margin-bottom: 4px; color: #f8fafc; }
    .step-desc { font-size: 0.92rem; color: var(--text-muted); line-height: 1.5; }
    .code-pill { background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.1); padding: 2px 8px; border-radius: 6px; font-family: monospace; font-size: 0.88rem; color: #38bdf8; }
    
    /* Table */
    table { width: 100%; border-collapse: collapse; text-align: left; }
    
    /* FAQ */
    .faq-q { font-weight: 700; color: var(--gold-light); margin-top: 14px; margin-bottom: 4px; }
    .faq-a { font-size: 0.92rem; color: var(--text-muted); line-height: 1.5; }
  </style>
</head>
<body>
  <div class="container">
    <header class="header">
      <div class="badge">✦ Projet Liturgique Oremus ✦</div>
      <h1>Calcul Distribué d'Alignement</h1>
      <p class="lead">Prêtez la puissance de calcul de votre ordinateur pour aider à synchroniser les milliers de partitions de chant grégorien note par note !</p>
    </header>

    <!-- Progress Card -->
    <div class="card">
      <div class="progress-header">
        <span style="font-weight:700; font-size:1.1rem;">Progression globale de la synchronisation</span>
        <span style="font-weight:800; font-size:1.2rem; color:#10b981;">${stats.percentage}%</span>
      </div>
      <div class="progress-bar-bg">
        <div class="progress-bar-fill"></div>
      </div>
      <div class="stats-grid">
        <div class="stat-box">
          <div class="stat-val" style="color:#10b981;">${stats.completed}</div>
          <div class="stat-lbl">Chants finalisés</div>
        </div>
        <div class="stat-box">
          <div class="stat-val" style="color:#fbbf24;">${stats.pending}</div>
          <div class="stat-lbl">Chants restants</div>
        </div>
        <div class="stat-box">
          <div class="stat-val" style="color:#38bdf8;">${stats.active_workers}</div>
          <div class="stat-lbl">Ordinateurs d'amis</div>
        </div>
      </div>
    </div>

    <!-- Download Section -->
    <div class="cta-container">
      <a href="/download/worker.zip" class="btn-download">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
        Télécharger le pack Worker (oremus-worker.zip)
      </a>
      <div style="font-size:0.82rem; color:var(--text-muted); margin-top:8px;">Compatible Windows, Mac (M1/M2/M3/M4 & Intel) et Linux • Taille : ~10 Ko</div>
    </div>

    <!-- Instructions Guide -->
    <div class="card">
      <h2 style="font-size:1.3rem; margin-bottom:18px; display:flex; align-items:center; gap:8px;">
        <span>📖</span> Guide pas-à-pas pour les non-informaticiens
      </h2>

      <div class="step-item">
        <div class="step-num">1</div>
        <div>
          <div class="step-title">Télécharger et décompresser l'archive</div>
          <div class="step-desc">Cliquez sur le bouton orange ci-dessus pour télécharger <span class="code-pill">oremus-worker.zip</span>, puis faites un clic droit dessus &gt; <em>Extraire tout</em>.</div>
        </div>
      </div>

      <div class="step-item">
        <div class="step-num">2</div>
        <div>
          <div class="step-title">Lancer le script en 1 clic</div>
          <div class="step-desc">
            • <strong>Sous Windows</strong> : Double-cliquez simplement sur <span class="code-pill">start_worker.bat</span>.<br>
            • <strong>Sous Mac ou Linux</strong> : Ouvrez le Terminal dans le dossier et lancez <span class="code-pill">./start_worker.sh</span>.
          </div>
        </div>
      </div>

      <div class="step-item">
        <div class="step-num">3</div>
        <div>
          <div class="step-title">Indiquer votre prénom et laisser tourner !</div>
          <div class="step-desc">Entrez votre prénom ou pseudo pour figurer dans le tableau d'honneur des amis contributeurs. Votre ordinateur prend alors automatiquement les pièces une par une, télécharge le modèle d'IA acoustique et transmet les horodatages au serveur !</div>
        </div>
      </div>
    </div>

    <!-- Leaderboard -->
    <div class="card">
      <h2 style="font-size:1.3rem; margin-bottom:16px; display:flex; align-items:center; gap:8px;">
        <span>🏆</span> Tableau d'honneur des amis contributeurs
      </h2>
      <div style="overflow-x:auto;">
        <table>
          <thead>
            <tr style="border-bottom: 2px solid rgba(255,255,255,0.1); color:#94a3b8; font-size:0.8rem; text-transform:uppercase;">
              <th style="padding:10px 14px;">Rang</th>
              <th style="padding:10px 14px;">Contributeur</th>
              <th style="padding:10px 14px;">Matériel</th>
              <th style="padding:10px 14px; text-align:right;">Partitions alignées</th>
            </tr>
          </thead>
          <tbody>
            ${lbRows}
          </tbody>
        </table>
      </div>
    </div>

    <!-- FAQ -->
    <div class="card">
      <h2 style="font-size:1.3rem; margin-bottom:12px;">❓ Questions fréquentes (FAQ)</h2>
      
      <div class="faq-q">Puis-je arrêter le programme quand je veux ?</div>
      <div class="faq-a">Oui, à tout instant ! Fermez simplement la fenêtre noire ou appuyez sur Ctrl+C. Le serveur réattribuera automatiquement la tâche en cours à un autre ami, rien n'est perdu.</div>

      <div class="faq-q">Est-ce que cela va occuper mon disque dur ?</div>
      <div class="faq-a">Non, absolument pas. Chaque fichier audio est temporaire et immédiatement supprimé dès que l'alignement est calculé.</div>

      <div class="faq-q">Faut-il obligatoirement une carte graphique puissante ?</div>
      <div class="faq-a">Non, le processeur de votre ordinateur suffit amplement. Mais si vous possédez une carte NVIDIA ou un Mac M1/M2/M3/M4, le script l'utilisera automatiquement pour aller jusqu'à 10 fois plus vite !</div>
    </div>

    <footer style="text-align:center; color:#64748b; font-size:0.82rem; margin-top:30px;">
      Projet Oremus / Divinum Officium • Code source libre et ouvert sous licence GPL
    </footer>
  </div>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// SERVEUR HTTP PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

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

    const jobStats = getJobsStats();

    return sendJson(res, 200, {
      status: 'ok',
      service: 'oremus-coolify-relay',
      version: '1.1.0',
      time: new Date().toISOString(),
      github_sync_enabled: !!GITHUB_TOKEN,
      github_repo: `${GITHUB_OWNER}/${GITHUB_REPO}`,
      pending_reviews_on_disk: pendingCount,
      distributed_jobs: {
        total: jobStats.total_pieces,
        completed: jobStats.completed,
        pending: jobStats.pending,
        percentage: jobStats.percentage + '%'
      }
    });
  }

  // 2. Portail Web Public (/worker et /compute)
  if (req.method === 'GET' && (pathname === '/worker' || pathname === '/compute')) {
    const stats = getJobsStats();
    const html = renderWorkerPortalHtml(stats);
    res.writeHead(200, {
      ...CORS_HEADERS,
      'Content-Type': 'text/html; charset=utf-8'
    });
    return res.end(html);
  }

  // 3. Téléchargement du Pack Worker (/download/worker.zip et /worker.zip)
  if (req.method === 'GET' && (pathname === '/download/worker.zip' || pathname === '/worker.zip')) {
    const zipPath = path.join(PUBLIC_DIR, 'oremus-worker.zip');
    if (fs.existsSync(zipPath)) {
      const stat = fs.statSync(zipPath);
      res.writeHead(200, {
        ...CORS_HEADERS,
        'Content-Type': 'application/zip',
        'Content-Length': stat.size,
        'Content-Disposition': 'attachment; filename="oremus-worker.zip"'
      });
      return fs.createReadStream(zipPath).pipe(res);
    } else {
      return sendJson(res, 404, { error: 'Archive worker.zip non encore générée.' });
    }
  }

  // 4. API : Attribution de la prochaine tâche au worker (Claim)
  if (req.method === 'GET' && (pathname === '/api/jobs/claim' || pathname === '/api/jobs/next')) {
    const workerId = reqUrl.searchParams.get('worker_id') || reqUrl.searchParams.get('worker') || 'Ami-Anonyme';
    const job = claimNextTask(workerId);
    if (job) {
      return sendJson(res, 200, { ok: true, job });
    } else {
      return sendJson(res, 200, { ok: true, job: null, message: 'Toutes les pièces sont actuellement alignées ou en cours !' });
    }
  }

  // 5. API : Soumission du résultat calculé par le worker (Submit)
  if (req.method === 'POST' && pathname === '/api/jobs/submit') {
    try {
      const data = await parseBody(req);
      const resData = submitTaskResult(data);
      return sendJson(res, resData.success ? 200 : 400, resData);
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // 6. API : Statistiques des tâches distribuées
  if (req.method === 'GET' && (pathname === '/api/jobs/status' || pathname === '/api/jobs/stats')) {
    return sendJson(res, 200, getJobsStats());
  }

  // 7. API : Exportation des alignements collectés
  if (req.method === 'GET' && pathname === '/api/jobs/export') {
    try {
      const files = fs.readdirSync(ALIGNMENTS_DIR).filter(f => f.endsWith('.json'));
      const alignments = [];
      for (const f of files) {
        try {
          const content = JSON.parse(fs.readFileSync(path.join(ALIGNMENTS_DIR, f), 'utf8'));
          alignments.push(content);
        } catch (e) {}
      }
      return sendJson(res, 200, {
        total: alignments.length,
        alignments
      });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // 8. API : Exportation complète des avis utilisateurs (JSON)
  if (req.method === 'GET' && pathname === '/api/reviews/export') {
    try {
      const files = fs.readdirSync(PENDING_DIR).filter(f => f.endsWith('.json'));
      const allReviews = [];
      const approved = [];
      const erroneous = [];

      for (const f of files) {
        try {
          const raw = fs.readFileSync(path.join(PENDING_DIR, f), 'utf8');
          const rev = JSON.parse(raw);
          allReviews.push(rev);
          if (rev.status === 'approved') approved.push(rev);
          else erroneous.push(rev);
        } catch (e) {}
      }

      return sendJson(res, 200, {
        total: allReviews.length,
        approved_count: approved.length,
        erroneous_count: erroneous.length,
        target_ground_truth: approved,
        target_realign_or_fix: erroneous,
        reviews: allReviews
      });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // 9. API : Exportation des avis utilisateurs au format CSV
  if (req.method === 'GET' && pathname === '/api/reviews/export.csv') {
    try {
      const files = fs.readdirSync(PENDING_DIR).filter(f => f.endsWith('.json'));
      let csv = 'id,status,title,incipit,comment,author,reviewedAt,client,triggerReason,youtube_id\n';
      
      for (const f of files) {
        try {
          const r = JSON.parse(fs.readFileSync(path.join(PENDING_DIR, f), 'utf8'));
          const row = [
            r.id || '',
            r.status || '',
            `"${(r.title || '').replace(/"/g, '""')}"`,
            `"${(r.incipit || '').replace(/"/g, '""')}"`,
            `"${(r.comment || '').replace(/"/g, '""')}"`,
            r.author || '',
            r.reviewedAt || '',
            r.client || '',
            r.triggerReason || '',
            r.youtube_id || ''
          ];
          csv += row.join(',') + '\n';
        } catch (e) {}
      }

      res.writeHead(200, {
        ...CORS_HEADERS,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="oremus_reviews_export.csv"'
      });
      return res.end(csv);
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  // 10. Réception des relectures Oremus (Unique ou Lot par batch)
  if (req.method === 'POST' && (pathname === '/api/review' || pathname === '/api/reviews' || pathname === '/api/reviews/batch')) {
    try {
      const data = await parseBody(req);
      const reviewsMap = {};

      if (data.reviews && typeof data.reviews === 'object') {
        Object.assign(reviewsMap, data.reviews);
      } else if (data.piece_id && data.status) {
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

        try {
          fs.writeFileSync(filePath, JSON.stringify(reviewPayload, null, 2), 'utf8');
          savedFiles.push(fileName);
        } catch (writeErr) {
          console.error(`[ERROR] Impossible d'ecrire ${fileName} sur disque:`, writeErr);
        }
      }

      return sendJson(res, 201, {
        success: true,
        saved_locally: savedFiles.length,
        files: savedFiles
      });

    } catch (err) {
      console.error('[ERROR] Erreur lors du traitement du lot:', err);
      return sendJson(res, 500, { error: 'Erreur serveur interne : ' + err.message });
    }
  }

  // 11. Consultation des avis en attente sur le volume
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

  // 12. Statistiques des avis enregistrés
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
      'GET  /worker (Portail web public & instructions)',
      'GET  /download/worker.zip (Pack de calcul 1-clic)',
      'GET  /api/jobs/claim?worker_id=xxx',
      'POST /api/jobs/submit',
      'GET  /api/jobs/status',
      'GET  /api/jobs/export',
      'POST /api/review',
      'GET  /api/reviews/pending',
      'GET  /api/reviews/stats',
      'GET  /api/reviews/export',
      'GET  /api/reviews/export.csv'
    ]
  });
});

server.listen(PORT, HOST, () => {
  console.log(`=======================================================`);
  console.log(`🚀 Oremus Coolify Server actif sur http://${HOST}:${PORT}`);
  console.log(`📁 Repertoire de donnees : ${DATA_DIR}`);
  console.log(`✦ Portail Worker : http://${HOST}:${PORT}/worker`);
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
