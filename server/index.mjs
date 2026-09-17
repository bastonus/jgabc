/**
 * server/index.mjs — Serveur distant Oremus, Relais d'avis & Moteur de Calcul Distribué Interactif
 * 
 * Micro-service Node.js autonome conçu pour être déployé en 1 clic sur Coolify
 * (ou tout conteneur Docker / serveur VPS).
 * 
 * FONCTIONNALITÉS :
 * 1. Zéro dépendance externe (runtime natif Node.js 18+).
 * 2. Persistance locale sécurisée sur volume Docker (/data/reviews/, /data/jobs/, /data/alignments/).
 * 3. Réception en direct et exportation rapide des avis utilisateurs (/api/reviews/export, /api/reviews/export.csv).
 * 4. File de calcul distribué (Job Queue) pour mutualiser la puissance de calcul d'amis (/api/jobs/*).
 * 5. Portail web public interactif d'entraînement, estimation de temps, et relecture directe du lot (/worker).
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
const SEED_ALIGNMENTS_PATH = path.join(__dirname, 'alignments_seed.json');

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
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, HEAD',
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
let seedAlignmentsCache = null;

function loadSeedAlignments() {
  if (seedAlignmentsCache) return seedAlignmentsCache;
  seedAlignmentsCache = {};
  if (fs.existsSync(SEED_ALIGNMENTS_PATH)) {
    try {
      seedAlignmentsCache = JSON.parse(fs.readFileSync(SEED_ALIGNMENTS_PATH, 'utf8'));
    } catch (e) {
      console.warn('[ALIGNMENTS] Erreur lecture alignments_seed.json:', e.message);
    }
  }
  return seedAlignmentsCache;
}

function syncTasksWithAlignments() {
  if (!tasksCache || !Array.isArray(tasksCache)) return;
  const seeds = loadSeedAlignments();
  const diskFiles = new Set();
  try {
    if (fs.existsSync(ALIGNMENTS_DIR)) {
      fs.readdirSync(ALIGNMENTS_DIR).filter(f => f.endsWith('.json')).forEach(f => {
        diskFiles.add(f.replace('.json', ''));
      });
    }
  } catch (e) {}

  let modified = false;
  const existingIds = new Set();

  for (const task of tasksCache) {
    const pid = String(task.id);
    existingIds.add(pid);
    if (task.status !== 'completed') {
      if (diskFiles.has(pid)) {
        task.status = 'completed';
        if (!task.completed_at) task.completed_at = new Date().toISOString();
        if (!task.worker_id) task.worker_id = 'Ami-Anonyme';
        modified = true;
      } else if (seeds[pid] && Array.isArray(seeds[pid].timestamps) && seeds[pid].timestamps.length > 0) {
        task.status = 'completed';
        task.worker_id = seeds[pid].worker_id || 'Atelier-Chantres';
        task.completed_at = seeds[pid].completed_at || '2026-09-15T12:00:00.000Z';
        if (seeds[pid].incipit && (!task.incipit || task.incipit.startsWith('Pièce #'))) {
          task.incipit = seeds[pid].incipit;
        }
        modified = true;
      }
    }
  }

  // Intégrer les pièces seed avec horodatages réels qui ne figuraient pas dans le catalogue
  for (const [key, s] of Object.entries(seeds)) {
    const pid = String(s.piece_id || key);
    if (!existingIds.has(pid) && !existingIds.has(key) && Array.isArray(s.timestamps) && s.timestamps.length > 0) {
      tasksCache.push({
        id: pid,
        incipit: s.incipit || `Pièce #${pid}`,
        part: s.part || 'Chant',
        youtube_id: s.youtube_id || '',
        youtube_url: s.youtube_url || (s.youtube_id ? `https://www.youtube.com/watch?v=${s.youtube_id}` : ''),
        gabc_src: s.gabc_src || '',
        pack: 'liturgy',
        is_liturgy_pack: true,
        status: 'completed',
        worker_id: s.worker_id || 'Atelier-Chantres',
        claimed_at: null,
        completed_at: s.completed_at || '2026-09-15T12:00:00.000Z',
        error: null
      });
      existingIds.add(pid);
      modified = true;
    }
  }

  if (modified) {
    saveTasks();
  }
}

function loadTasks() {
  if (tasksCache) return tasksCache;
  if (fs.existsSync(TASKS_FILE)) {
    try {
      tasksCache = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
    } catch (e) {
      console.warn('[JOBS] Erreur lecture tasks.json, réinitialisation...');
    }
  }

  // Initialisation à partir du catalogue de pièces si nécessaire
  if (!tasksCache) {
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
      pack: p.pack || (p.is_liturgy_pack ? 'liturgy' : 'extension'),
      is_liturgy_pack: p.is_liturgy_pack !== undefined ? p.is_liturgy_pack : (p.pack === 'liturgy'),
      status: 'pending', // 'pending' | 'claimed' | 'completed' | 'failed'
      worker_id: null,
      claimed_at: null,
      completed_at: null,
      error: null
    }));
  }

  // Synchronisation systématique avec les alignements pré-calculés et sur disque
  syncTasksWithAlignments();

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
    } catch (e) {}
  }
  if (!workersCache) workersCache = {};

  // S'assurer que le compte Atelier-Chantres (seed curator) apparaît au leaderboard
  const seeds = loadSeedAlignments();
  const seedKeys = Object.keys(seeds).filter(k => Array.isArray(seeds[k].timestamps) && seeds[k].timestamps.length > 0);
  const uniqueSeedPieces = new Set(seedKeys.map(k => seeds[k].piece_id || k));
  if (uniqueSeedPieces.size > 0 && !workersCache['Atelier-Chantres']) {
    workersCache['Atelier-Chantres'] = {
      count: uniqueSeedPieces.size,
      last_active: '2026-09-15T12:00:00.000Z',
      device: 'Meta MMS_FA (Curated)'
    };
  }

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

    // Enregistrement des horodatages validés avec métadonnées complètes pour la relecture
    const alignmentPath = path.join(ALIGNMENTS_DIR, `${pieceId}.json`);
    const alignmentData = {
      piece_id: pieceId,
      incipit: task.incipit,
      part: task.part,
      worker_id: workerId,
      youtube_id: task.youtube_id || '',
      youtube_url: task.youtube_url || '',
      gabc_src: task.gabc_src || '',
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

function getBenchmarks() {
  const defaultBenchmarks = {
    cuda: { id: 'cuda', name: 'NVIDIA GPU (CUDA)', avg_sec: 4.2, speed_label: 'Ultra Rapide', pieces_per_hour: 857 },
    mps: { id: 'mps', name: 'Apple Silicon (Metal M1-M4)', avg_sec: 11.5, speed_label: 'Très Rapide', pieces_per_hour: 313 },
    cpu: { id: 'cpu', name: 'Processeur Standard (CPU)', avg_sec: 24.0, speed_label: 'Standard', pieces_per_hour: 150 }
  };

  try {
    const files = fs.readdirSync(ALIGNMENTS_DIR).filter(f => f.endsWith('.json'));
    const timesByDevice = { cuda: [], mps: [], cpu: [] };

    for (const f of files.slice(0, 50)) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(ALIGNMENTS_DIR, f), 'utf8'));
        const dev = String(data.compute_device || '').toLowerCase();
        const t = parseFloat(data.compute_time_sec);
        if (t > 0.5 && t < 300) {
          if (dev.includes('nvidia') || dev.includes('cuda') || dev.includes('rtx') || dev.includes('gtx')) {
            timesByDevice.cuda.push(t);
          } else if (dev.includes('apple') || dev.includes('mps') || dev.includes('metal')) {
            timesByDevice.mps.push(t);
          } else {
            timesByDevice.cpu.push(t);
          }
        }
      } catch (e) {}
    }

    for (const k of ['cuda', 'mps', 'cpu']) {
      if (timesByDevice[k].length >= 2) {
        const sum = timesByDevice[k].reduce((a, b) => a + b, 0);
        const avg = Math.round((sum / timesByDevice[k].length) * 10) / 10;
        defaultBenchmarks[k].avg_sec = avg;
        defaultBenchmarks[k].pieces_per_hour = Math.round(3600 / Math.max(1, avg));
      }
    }
  } catch (e) {}

  return defaultBenchmarks;
}

function getWorkerPieces(workerId) {
  try {
    const list = [];
    const targetWorker = (workerId || '').trim().toLowerCase();
    const seenPieceIds = new Set();

    // 1. Alignements calculés sur disque
    if (fs.existsSync(ALIGNMENTS_DIR)) {
      const files = fs.readdirSync(ALIGNMENTS_DIR).filter(f => f.endsWith('.json'));
      for (const f of files) {
        try {
          const item = JSON.parse(fs.readFileSync(path.join(ALIGNMENTS_DIR, f), 'utf8'));
          const pid = String(item.piece_id || f.replace('.json', ''));
          const wId = item.worker_id || 'Ami-Anonyme';
          if (!targetWorker || targetWorker === 'all' || wId.toLowerCase().includes(targetWorker)) {
            seenPieceIds.add(pid);
            list.push({
              id: pid,
              piece_id: pid,
              incipit: item.incipit || `Pièce #${pid}`,
              part: item.part || 'Chant',
              worker: wId,
              worker_id: wId,
              youtube_id: item.youtube_id || '',
              youtube_url: item.youtube_url || '',
              compute_time_sec: item.compute_time_sec || 0,
              audio_duration_sec: item.audio_duration_sec || 0,
              completed_at: item.completed_at || new Date().toISOString(),
              notes_count: Array.isArray(item.timestamps) ? item.timestamps.length : 0
            });
          }
        } catch (e) {}
      }
    }

    // 2. Alignements pré-calculés issus du seed (Atelier-Chantres)
    const seeds = loadSeedAlignments();
    const tasks = loadTasks();
    const taskMap = new Map(tasks.map(t => [String(t.id), t]));

    for (const [key, s] of Object.entries(seeds)) {
      const pid = String(s.piece_id || key);
      if (seenPieceIds.has(pid)) continue;
      if (!Array.isArray(s.timestamps) || s.timestamps.length === 0) continue;

      const workerName = (s.worker_id || 'Atelier-Chantres');
      if (!targetWorker || targetWorker === 'all' || workerName.toLowerCase().includes(targetWorker)) {
        seenPieceIds.add(pid);
        const task = taskMap.get(pid) || taskMap.get(String(key)) || {};
        list.push({
          id: pid,
          piece_id: pid,
          incipit: s.incipit || task.incipit || `Pièce #${pid}`,
          part: s.part || task.part || 'Chant',
          worker: workerName,
          worker_id: workerName,
          youtube_id: s.youtube_id || task.youtube_id || '',
          youtube_url: s.youtube_url || task.youtube_url || (s.youtube_id ? `https://www.youtube.com/watch?v=${s.youtube_id}` : ''),
          compute_time_sec: s.compute_time_sec || 3.8,
          audio_duration_sec: s.audio_duration_sec || 0,
          completed_at: s.completed_at || '2026-09-15T12:00:00.000Z',
          notes_count: s.timestamps.length
        });
      }
    }

    list.sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at));
    return list.slice(0, 50);
  } catch (e) {
    console.error('[WORKER] Erreur getWorkerPieces:', e);
    return [];
  }
}

function getPieceDetails(pieceId) {
  const safeId = String(pieceId).replace(/[^a-zA-Z0-9_\-\.]/g, '');
  const alignmentPath = path.join(ALIGNMENTS_DIR, `${safeId}.json`);
  
  if (fs.existsSync(alignmentPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(alignmentPath, 'utf8'));
      return {
        id: data.piece_id || safeId,
        ...data
      };
    } catch (e) {}
  }

  // Fallback vers les alignements initiaux pré-calculés (seed)
  const seeds = loadSeedAlignments();
  if (seeds[pieceId] || seeds[safeId]) {
    const s = seeds[pieceId] || seeds[safeId];
    const tasks = loadTasks();
    const task = tasks.find(t => t.id === pieceId) || {};
    return {
      id: pieceId,
      piece_id: pieceId,
      incipit: task.incipit || `Pièce #${pieceId}`,
      part: task.part || 'Chant',
      youtube_id: task.youtube_id || '',
      youtube_url: task.youtube_url || (task.youtube_id ? `https://www.youtube.com/watch?v=${task.youtube_id}` : ''),
      gabc_src: task.gabc_src || '',
      timestamps: s.timestamps || [],
      notes_count: Array.isArray(s.timestamps) ? s.timestamps.length : 0,
      worker_id: s.worker_id || 'Atelier-Chantres',
      compute_device: s.compute_device || 'Meta MMS_FA (Curated)',
      pack: task.pack || 'liturgy',
      is_liturgy_pack: task.is_liturgy_pack !== undefined ? task.is_liturgy_pack : true
    };
  }

  const tasks = loadTasks();
  const task = tasks.find(t => t.id === pieceId);
  if (task) {
    return {
      id: task.id,
      piece_id: task.id,
      incipit: task.incipit,
      part: task.part,
      youtube_id: task.youtube_id,
      youtube_url: task.youtube_url,
      gabc_src: task.gabc_src,
      timestamps: [],
      status: task.status,
      pack: task.pack || 'liturgy',
      is_liturgy_pack: task.is_liturgy_pack !== undefined ? task.is_liturgy_pack : true
    };
  }

  return null;
}

/**
 * Construit la file dynamique des pièces alignées pour revue dans l'application,
 * ordonnée par priorité d'intérêt liturgique :
 * 1. Pièces jamais révisées issues de liturgy.pack (cœur de la liturgie quotidienne)
 * 2. Pièces jamais révisées issues de l'extension (gabc.pack)
 * 3. Pièces signalées 'décalé' (pour vérification)
 * 4. Pièces déjà approuvées
 * Décroissance fine selon le nombre de relectures pour maximiser la couverture globale.
 */
function getAlignmentsQueue(options = {}) {
  const tasks = loadTasks();
  const seeds = loadSeedAlignments();
  const reviewsByPiece = {};

  // 1. Lire les avis enregistrés
  try {
    if (fs.existsSync(PENDING_DIR)) {
      const revFiles = fs.readdirSync(PENDING_DIR).filter(f => f.endsWith('.json'));
      for (const rf of revFiles) {
        try {
          const rev = JSON.parse(fs.readFileSync(path.join(PENDING_DIR, rf), 'utf8'));
          const pid = rev.piece_id || rev.id;
          if (pid) {
            if (!reviewsByPiece[pid]) {
              reviewsByPiece[pid] = { count: 0, status: rev.status, author: rev.author };
            }
            reviewsByPiece[pid].count++;
            if (rev.status) reviewsByPiece[pid].status = rev.status;
          }
        } catch (e) {}
      }
    }
  } catch (e) {}

  // 2. Vérifier les alignements calculés sur disque
  const diskAlignments = new Set();
  try {
    if (fs.existsSync(ALIGNMENTS_DIR)) {
      const files = fs.readdirSync(ALIGNMENTS_DIR).filter(f => f.endsWith('.json'));
      for (const f of files) {
        diskAlignments.add(f.replace('.json', ''));
      }
    }
  } catch (e) {}

  const list = [];

  for (const t of tasks) {
    const pid = String(t.id);
    let alignData = null;

    if (diskAlignments.has(pid)) {
      try {
        alignData = JSON.parse(fs.readFileSync(path.join(ALIGNMENTS_DIR, `${pid}.json`), 'utf8'));
      } catch (e) {}
    } else if (seeds[pid]) {
      alignData = seeds[pid];
    }

    // Proposer uniquement les pièces dotées d'horodatages réels
    if (alignData && Array.isArray(alignData.timestamps) && alignData.timestamps.length > 0) {
      const rev = reviewsByPiece[pid] || { count: 0, status: null };
      const isLit = t.is_liturgy_pack !== undefined ? t.is_liturgy_pack : (t.pack === 'liturgy');
      const packName = isLit ? 'liturgy' : 'extension';

      // 3. Calcul du score de priorité liturgique
      let score = 0;
      const status = rev.status || null;

      if (!status || rev.count === 0) {
        // Priorité absolue aux pièces non révisées pour accélérer la validation
        score = isLit ? 1000 : 800;
      } else if (status === 'delayed' || status === 'rejected') {
        score = isLit ? 600 : 500;
      } else if (status === 'approved') {
        score = isLit ? 300 : 200;
      } else if (status === 'bad_gabc') {
        score = 100;
      } else {
        score = 150;
      }

      // Privilégier les pièces ayant le moins de votes pour tout couvrir
      score -= Math.min(60, rev.count * 15);

      list.push({
        id: pid,
        piece_id: pid,
        incipit: t.incipit || `Pièce #${pid}`,
        part: t.part || 'Chant',
        youtube_id: t.youtube_id || '',
        youtube_url: t.youtube_url || (t.youtube_id ? `https://www.youtube.com/watch?v=${t.youtube_id}` : ''),
        gabc_src: t.gabc_src || '',
        timestamps: alignData.timestamps,
        notes_count: alignData.timestamps.length,
        audio_duration_sec: alignData.audio_duration_sec || 0,
        worker_id: alignData.worker_id || 'Inconnu',
        compute_device: alignData.compute_device || '',
        pack: packName,
        is_liturgy_pack: isLit,
        review_status: status,
        review_count: rev.count,
        priority_score: score
      });
    }
  }

  // Tri décroissant par priorité
  list.sort((a, b) => b.priority_score - a.priority_score);

  let unreviewedCount = 0;
  let litCount = 0;
  let extCount = 0;

  for (const item of list) {
    if (!item.review_status || item.review_count === 0) unreviewedCount++;
    if (item.is_liturgy_pack) litCount++;
    else extCount++;
  }

  return {
    ok: true,
    total: list.length,
    total_aligned: list.length,
    unreviewed_count: unreviewedCount,
    liturgy_pack_count: litCount,
    extension_count: extCount,
    queue: list,
    pieces: list
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE WEB PUBLIQUE DE TÉLÉCHARGEMENT & INSTRUCTIONS (/worker)
// Style inspiré fidèlement du Laboratoire d'Alignement (pipeline/alignment-lab.html)
// ─────────────────────────────────────────────────────────────────────────────

function renderWorkerPortalHtml(stats, benchmarks) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>Oremus — Calcul Distribué & Scriptorium Liturgique</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>✦</text></svg>">
  <style>
    :root {
      --bg: #090d16;
      --surface: #111726;
      --surface-card: #161f33;
      --surface-elevated: #1b263e;
      --border: #1e293b;
      --border-accent: rgba(196, 152, 79, 0.35);
      --gold: #c4984f;
      --gold-light: #fbbf24;
      --gold-dark: #926628;
      --emerald: #10b981;
      --crimson: #ef4444;
      --blue: #38bdf8;
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --radius: 14px;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 16px 12px 60px;
    }
    .container { max-width: 960px; margin: 0 auto; }
    
    /* Top Bar Header (Monastic Rank Widget) */
    .header-bar {
      display: flex; justify-content: space-between; align-items: center;
      background: var(--surface); border: 1px solid var(--border-accent);
      border-radius: var(--radius); padding: 12px 18px; margin-bottom: 24px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    }
    .header-left { display: flex; align-items: center; gap: 14px; }
    .monk-avatar {
      width: 44px; height: 44px; border-radius: 50%;
      background: linear-gradient(135deg, var(--gold-dark), var(--gold));
      display: flex; align-items: center; justify-content: center;
      font-size: 1.3rem; border: 2px solid var(--gold-light);
      box-shadow: 0 0 12px rgba(251, 191, 36, 0.3);
    }
    .monk-info-title { font-weight: 700; font-size: 1.05rem; color: #fff; }
    .monk-info-sub { font-size: 0.8rem; color: var(--gold-light); display: flex; align-items: center; gap: 8px; }
    .streak-pill { background: rgba(239, 68, 68, 0.2); border: 1px solid rgba(239, 68, 68, 0.4); color: #f87171; padding: 1px 6px; border-radius: 999px; font-weight: 700; font-size: 0.75rem; }
    
    .header-right { display: flex; align-items: center; gap: 10px; }
    .xp-counter-badge {
      background: rgba(0,0,0,0.4); border: 1px solid var(--border);
      border-radius: 8px; padding: 6px 12px; text-align: right;
    }
    .xp-num { font-weight: 800; color: var(--gold-light); font-size: 0.95rem; }
    .xp-label { font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; }

    /* Titles */
    .page-hero { text-align: center; margin-bottom: 28px; }
    .badge-hero {
      display: inline-block; padding: 4px 14px; border-radius: 999px;
      background: rgba(196, 152, 79, 0.15); border: 1px solid var(--border-accent);
      color: var(--gold-light); font-size: 0.82rem; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.06em; margin-bottom: 10px;
    }
    h1 { font-size: 2.1rem; font-weight: 800; letter-spacing: -0.02em; margin-bottom: 6px; }
    p.lead { font-size: 1.02rem; color: var(--text-muted); max-width: 680px; margin: 0 auto; }

    /* Cards */
    .card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 22px; margin-bottom: 22px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.35);
    }
    .card-gold { border-color: var(--border-accent); background: linear-gradient(180deg, rgba(22, 31, 51, 0.9), var(--surface)); }
    .card-title { font-size: 1.25rem; font-weight: 700; margin-bottom: 14px; display: flex; align-items: center; gap: 10px; color: #fff; }

    /* Progress Bar */
    .progress-bar-bg { height: 12px; background: rgba(255,255,255,0.06); border-radius: 999px; overflow: hidden; margin-top: 10px; }
    .progress-bar-fill { height: 100%; background: linear-gradient(90deg, #10b981, #34d399); width: ${stats.percentage}%; transition: width 0.5s; }
    .stats-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-top: 16px; }
    .stat-chip { background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 12px; text-align: center; }
    .stat-chip-val { font-size: 1.5rem; font-weight: 800; }
    .stat-chip-lbl { font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase; margin-top: 2px; }

    /* Session Planner Controls */
    .planner-section { margin-top: 8px; }
    .choice-group-label { font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--gold-light); font-weight: 700; margin-bottom: 8px; }
    .btn-pill-group { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
    .btn-pill {
      background: var(--surface-card); border: 1px solid var(--border);
      color: var(--text); padding: 8px 16px; border-radius: 8px;
      font-size: 0.9rem; font-weight: 600; cursor: pointer; transition: all 0.15s;
    }
    .btn-pill:hover { border-color: var(--gold); color: #fff; }
    .btn-pill.active { background: var(--gold); color: #000; font-weight: 700; border-color: var(--gold-light); box-shadow: 0 0 10px rgba(251, 191, 36, 0.4); }

    .slider-row { display: flex; align-items: center; gap: 14px; margin-bottom: 20px; }
    .slider-input { flex: 1; accent-color: var(--gold-light); cursor: pointer; height: 6px; }
    .slider-val-badge { background: rgba(0,0,0,0.3); border: 1px solid var(--gold); padding: 4px 10px; border-radius: 6px; font-weight: 700; color: var(--gold-light); min-width: 75px; text-align: center; }

    /* Estimation Highlight Box */
    .estimation-card {
      background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.3);
      border-radius: 12px; padding: 16px; margin: 16px 0; display: flex;
      justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px;
    }
    .est-number { font-size: 1.8rem; font-weight: 900; color: #34d399; }
    .est-label { font-size: 0.85rem; color: var(--text-muted); }
    .est-xp-badge { background: rgba(251, 191, 36, 0.15); border: 1px solid var(--gold); color: var(--gold-light); padding: 4px 10px; border-radius: 6px; font-weight: 700; font-size: 0.85rem; }

    /* CTA Button */
    .btn-cta {
      display: inline-flex; align-items: center; justify-content: center; gap: 10px;
      background: linear-gradient(135deg, var(--gold), #926628);
      color: #fff; text-decoration: none; padding: 14px 28px;
      font-size: 1.05rem; font-weight: 700; border-radius: 10px; border: none;
      cursor: pointer; box-shadow: 0 8px 20px -4px rgba(196, 152, 79, 0.4);
      transition: transform 0.15s, box-shadow 0.15s; width: 100%;
    }
    .btn-cta:hover { transform: translateY(-2px); box-shadow: 0 12px 25px -4px rgba(196, 152, 79, 0.6); }

    /* Batch & Review Section */
    .batch-header-row { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; }
    .user-filter-box { display: flex; gap: 8px; align-items: center; }
    .user-input {
      background: rgba(0,0,0,0.3); border: 1px solid var(--border);
      color: #fff; padding: 8px 12px; border-radius: 8px; font-size: 0.9rem;
    }
    .user-input:focus { border-color: var(--gold); outline: none; }
    
    .pieces-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
    .piece-card {
      background: var(--surface-card); border: 1px solid var(--border);
      border-radius: 10px; padding: 14px; display: flex; flex-direction: column;
      justify-content: space-between; gap: 10px; transition: border-color 0.15s;
    }
    .piece-card:hover { border-color: rgba(255,255,255,0.2); }
    .piece-title { font-weight: 700; font-size: 0.95rem; color: #fff; line-height: 1.3; }
    .piece-meta { font-size: 0.8rem; color: var(--text-muted); display: flex; gap: 10px; }
    .btn-review-card {
      background: rgba(196, 152, 79, 0.15); border: 1px solid var(--gold);
      color: var(--gold-light); padding: 6px 12px; border-radius: 6px;
      font-size: 0.85rem; font-weight: 700; cursor: pointer; text-align: center;
      transition: all 0.15s;
    }
    .btn-review-card:hover { background: var(--gold); color: #000; }

    /* Modal Review Player */
    .modal-backdrop {
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(0,0,0,0.8); backdrop-filter: blur(6px);
      display: none; align-items: center; justify-content: center; z-index: 9999;
      padding: 16px;
    }
    .modal-content {
      background: var(--surface); border: 1px solid var(--border-accent);
      border-radius: 16px; width: 100%; max-width: 680px; max-height: 90vh;
      overflow-y: auto; padding: 22px; box-shadow: 0 20px 40px rgba(0,0,0,0.6);
      position: relative;
    }
    .modal-close {
      position: absolute; top: 14px; right: 14px; background: none; border: none;
      color: var(--text-muted); font-size: 1.5rem; cursor: pointer;
    }
    .video-frame-container { width: 100%; aspect-ratio: 16/9; background: #000; border-radius: 10px; overflow: hidden; margin: 14px 0; }
    .video-frame-container iframe { width: 100%; height: 100%; border: none; }
    .review-action-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 18px; }
    .btn-vote-approve { background: rgba(16, 185, 129, 0.2); border: 1px solid #10b981; color: #34d399; padding: 10px; border-radius: 8px; font-weight: 700; cursor: pointer; }
    .btn-vote-sync { background: rgba(245, 158, 11, 0.2); border: 1px solid #f59e0b; color: #fbbf24; padding: 10px; border-radius: 8px; font-weight: 700; cursor: pointer; }
    .btn-vote-bad { background: rgba(239, 68, 68, 0.2); border: 1px solid #ef4444; color: #f87171; padding: 10px; border-radius: 8px; font-weight: 700; cursor: pointer; }

    /* Floating XP Toast */
    .xp-float-toast {
      position: fixed; top: 24px; right: 24px;
      background: linear-gradient(135deg, var(--gold-dark), var(--gold));
      color: #fff; padding: 10px 18px; border-radius: 999px;
      font-weight: 800; font-size: 1.05rem; z-index: 10000;
      box-shadow: 0 10px 25px rgba(217, 119, 6, 0.5);
      animation: floatUp 1.5s ease-out forwards;
    }
    @keyframes floatUp {
      0% { opacity: 0; transform: translateY(20px); }
      20% { opacity: 1; transform: translateY(0); }
      80% { opacity: 1; transform: translateY(-5px); }
      100% { opacity: 0; transform: translateY(-25px); }
    }
    
    /* Table */
    table { width: 100%; border-collapse: collapse; text-align: left; }
    th { color: var(--text-muted); font-size: 0.75rem; text-transform: uppercase; padding: 8px 12px; border-bottom: 1px solid var(--border); }
    td { padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,0.04); font-size: 0.9rem; }
  </style>
</head>
<body>
  <div class="container">

    <!-- Header / Scriptorium Monastic Rank Widget -->
    <header class="header-bar">
      <div class="header-left">
        <div class="monk-avatar" id="headerAvatar">📖</div>
        <div>
          <div class="monk-info-title" id="headerTitle">Novice du Scriptorium</div>
          <div class="monk-info-sub">
            <span id="headerLevel">Degré 1 • Novicius</span>
            <span class="streak-pill" id="headerStreak">🔥 Série : 0</span>
          </div>
        </div>
      </div>
      <div class="header-right">
        <div class="xp-counter-badge">
          <div class="xp-num" id="headerXp">0 XP</div>
          <div class="xp-label">Consacrés</div>
        </div>
        <a href="/" class="btn-pill" style="text-decoration:none; padding:6px 12px; font-size:0.8rem;">✦ Laboratoire</a>
      </div>
    </header>

    <!-- Page Hero -->
    <div class="page-hero">
      <div class="badge-hero">✦ Projet Liturgique Oremus ✦</div>
      <h1>Calcul Distribué & Entraînement</h1>
      <p class="lead">Prêtez votre machine pour aligner automatiquement les partitions grégoriennes, révisez immédiatement votre lot et gagnez des points d'enluminure monastique !</p>
    </div>

    <!-- Live Overall Progress -->
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:8px;">
        <span style="font-weight:700;">Progression du Catalogue (885 pièces)</span>
        <span style="font-weight:800; color:var(--emerald); font-size:1.15rem;" id="progressPct">${stats.percentage}%</span>
      </div>
      <div class="progress-bar-bg">
        <div class="progress-bar-fill" id="progressBar" style="width: ${stats.percentage}%;"></div>
      </div>
      <div class="stats-row">
        <div class="stat-chip">
          <div class="stat-chip-val" style="color:var(--emerald);" id="statCompleted">${stats.completed}</div>
          <div class="stat-chip-lbl">Chants alignés</div>
        </div>
        <div class="stat-chip">
          <div class="stat-chip-val" style="color:var(--gold-light);" id="statPending">${stats.pending}</div>
          <div class="stat-chip-lbl">En attente</div>
        </div>
        <div class="stat-chip">
          <div class="stat-chip-val" style="color:var(--blue);" id="statWorkers">${stats.active_workers}</div>
          <div class="stat-chip-lbl">Ordinateurs d'amis</div>
        </div>
      </div>
    </div>

    <!-- Section 1 : Interactive Session Planner with Estimator -->
    <div class="card card-gold">
      <div class="card-title">
        <span>⏱️</span> Planificateur de Session & Estimation
      </div>
      <p style="font-size:0.9rem; color:var(--text-muted); margin-bottom:16px;">
        Choisissez combien de temps vous souhaitez consacrer au calcul. L'estimation est calculée dynamiquement à partir des benchmarks réels de nos serveurs.
      </p>

      <div class="planner-section">
        <div class="choice-group-label">1. Choisissez la durée de votre session :</div>
        <div class="btn-pill-group" id="durationGroup">
          <button type="button" class="btn-pill" data-mins="15">15 minutes</button>
          <button type="button" class="btn-pill active" data-mins="30">30 minutes</button>
          <button type="button" class="btn-pill" data-mins="60">1 heure</button>
          <button type="button" class="btn-pill" data-mins="120">2 heures</button>
          <button type="button" class="btn-pill" data-mins="0">Libre (infini)</button>
        </div>

        <div class="slider-row">
          <input type="range" id="durationSlider" class="slider-input" min="5" max="180" step="5" value="30">
          <div class="slider-val-badge" id="sliderValDisplay">30 min</div>
        </div>

        <div class="choice-group-label">2. Sélectionnez votre matériel (accélération) :</div>
        <div class="btn-pill-group" id="hardwareGroup">
          <button type="button" class="btn-pill active" data-hw="cuda">🚀 NVIDIA GPU (CUDA)</button>
          <button type="button" class="btn-pill" data-hw="mps">🍏 Apple Silicon (M1-M4)</button>
          <button type="button" class="btn-pill" data-hw="cpu">💻 Processeur (CPU)</button>
        </div>

        <!-- Live Estimator Display -->
        <div class="estimation-card">
          <div>
            <div class="est-number" id="estPiecesDisplay">~43 chants</div>
            <div class="est-label">Estimation du nombre de partitions qui seront alignées</div>
          </div>
          <div style="text-align:right;">
            <div class="est-xp-badge" id="estXpDisplay">+1075 XP Monastiques</div>
            <div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">+25 XP par chant calculé</div>
          </div>
        </div>

        <a href="/download/worker.zip" class="btn-cta">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
          Télécharger le pack Worker pour cette session (oremus-worker.zip)
        </a>
        <div style="font-size:0.8rem; color:var(--text-muted); text-align:center; margin-top:8px;" id="cmdHint">
          Commande directe : <span style="font-family:monospace; color:var(--blue);" id="cmdSnippet">python worker.py --name "MonAmi" --duration 30</span>
        </div>
      </div>
    </div>

    <!-- Quick-Start Instructions for Non-Tech Friends -->
    <div class="card">
      <div class="card-title">
        <span>🚀</span> Instructions Simplifiées (1 Clic pour Débutants)
      </div>
      <p style="font-size:0.9rem; color:var(--text-muted); margin-bottom:14px;">
        Aucune connaissance technique requise. Décompressez l'archive et lancez le script correspondant à votre système :
      </p>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:14px;">
        <div style="background:var(--surface-elevated); border:1px solid var(--border); border-radius:10px; padding:14px;">
          <div style="font-weight:700; color:var(--emerald); margin-bottom:8px; display:flex; align-items:center; gap:8px;">
            <span style="font-size:1.1rem;">🪟</span> <strong>Windows (1 Clic)</strong>
          </div>
          <ol style="font-size:0.86rem; color:var(--text-muted); margin-left:20px; line-height:1.6;">
            <li>Téléchargez et décompressez <strong style="color:#fff;">oremus-worker.zip</strong>.</li>
            <li>Double-cliquez simplement sur <code style="color:var(--emerald); background:rgba(16,185,129,0.1); padding:2px 6px; border-radius:4px;">start_worker.bat</code>.</li>
            <li>Indiquez votre pseudo et la durée souhaitée : l'alignement commence immédiatement !</li>
          </ol>
        </div>
        <div style="background:var(--surface-elevated); border:1px solid var(--border); border-radius:10px; padding:14px;">
          <div style="font-weight:700; color:var(--blue); margin-bottom:8px; display:flex; align-items:center; gap:8px;">
            <span style="font-size:1.1rem;">🍎</span> <strong>macOS & Linux</strong>
          </div>
          <ol style="font-size:0.86rem; color:var(--text-muted); margin-left:20px; line-height:1.6;">
            <li>Téléchargez et décompressez <strong style="color:#fff;">oremus-worker.zip</strong>.</li>
            <li>Dans le terminal ou Finder, lancez <code style="color:var(--blue); background:rgba(56,189,248,0.1); padding:2px 6px; border-radius:4px;">start_worker.sh</code>.</li>
            <li>L'accélération Apple Silicon (MPS) ou CUDA est détectée automatiquement.</li>
          </ol>
        </div>
      </div>
    </div>

    <!-- Section 2 : Mes Chants Récents Traités (Batch Aligné & Revue Directe) -->
    <div class="card" id="batchSection">
      <div class="batch-header-row">
        <div class="card-title" style="margin-bottom:0;">
          <span>📋</span> Mon Lot Récemment Aligné
        </div>
        <div class="user-filter-box">
          <input type="text" id="filterWorkerInput" class="user-input" placeholder="Votre pseudo d'ami..." style="width:160px;">
          <button type="button" class="btn-pill" id="btnRefreshBatch" style="padding:6px 12px; font-size:0.85rem;">Rafraîchir</button>
        </div>
      </div>
      <p style="font-size:0.9rem; color:var(--text-muted); margin-bottom:14px;">
        Voici les dernières pièces calculées par votre machine. Vous pouvez directement les réviser pour valider les horodatages et gagner +10 XP supplémentaires par revue !
      </p>

      <div class="pieces-grid" id="piecesGrid">
        <div style="grid-column: 1/-1; text-align:center; padding:24px; color:var(--text-muted);">
          Chargement des pièces récemment calculées...
        </div>
      </div>
    </div>

    <!-- Section 3 : Leaderboard des Amis -->
    <div class="card">
      <div class="card-title">
        <span>🏆</span> Tableau d'Honneur des Amis Contributeurs
      </div>
      <div style="overflow-x:auto;">
        <table>
          <thead>
            <tr>
              <th>Rang</th>
              <th>Contributeur</th>
              <th>Matériel</th>
              <th style="text-align:right;">Partitions alignées</th>
            </tr>
          </thead>
          <tbody id="leaderboardTbody">
            <tr><td colspan="4" style="text-align:center; padding:18px; color:var(--text-muted);">Chargement du classement...</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal : Lecteur de Revue Directe -->
    <div class="modal-backdrop" id="reviewModal">
      <div class="modal-content">
        <button type="button" class="modal-close" onclick="closeReviewModal()">&times;</button>
        <div class="badge-hero" id="modalPiecePart" style="margin-bottom:6px;">Kyriale</div>
        <h2 id="modalPieceTitle" style="font-size:1.4rem; margin-bottom:4px;">Incipit du Chant</h2>
        <div style="font-size:0.85rem; color:var(--text-muted);" id="modalPieceAuthor">Aligné par : Ami</div>

        <div class="video-frame-container">
          <iframe id="modalVideoFrame" src="" allowfullscreen allow="autoplay"></iframe>
        </div>

        <div style="background:rgba(0,0,0,0.3); border:1px solid var(--border); border-radius:8px; padding:10px; margin-top:10px; font-size:0.85rem;" id="modalTimestampsSummary">
          Horodatages calculés : <strong style="color:var(--emerald);" id="modalNotesCount">0</strong> notes synchronisées.
        </div>

        <div class="review-action-row">
          <button type="button" class="btn-vote-approve" onclick="submitReviewVote('approved')">
            ✅ Approuver (+10 XP)
          </button>
          <button type="button" class="btn-vote-sync" onclick="submitReviewVote('rejected')">
            ⚠️ Décalage (+10 XP)
          </button>
          <button type="button" class="btn-vote-bad" onclick="submitReviewVote('bad_gabc')">
            ❌ Mauvais GABC (+10 XP)
          </button>
        </div>
      </div>
    </div>

  </div>

  <script>
    // Configuration & Benchmarks transmis par le serveur
    const BENCHMARKS = ${JSON.stringify(benchmarks)};
    
    // Rangs Monastiques Oremus (Identiques au Laboratoire d'Alignement)
    const MONK_RANKS = [
      { level: 1, title: "Novice du Chœur", latin: "Novicius", minXp: 0, icon: "📖" },
      { level: 2, title: "Scribe du Chapitre", latin: "Scriptor", minXp: 100, icon: "✒️" },
      { level: 3, title: "Enlumineur Sacré", latin: "Illuminator", minXp: 250, icon: "🎨" },
      { level: 4, title: "Cantor du Lutrin", latin: "Cantor", minXp: 450, icon: "🎵" },
      { level: 5, title: "Succenteur de Chœur", latin: "Succentor", minXp: 700, icon: "🔔" },
      { level: 6, title: "Maître de Chapelle", latin: "Magister Chori", minXp: 1000, icon: "👑" },
      { level: 7, title: "Prieur du Scriptorium", latin: "Prior", minXp: 1350, icon: "🏛️" },
      { level: 8, title: "Abbé Bénédictin", latin: "Abbas", minXp: 1700, icon: "✝️" },
      { level: 9, title: "Cardinal Préfet", latin: "Cardinalis", minXp: 2100, icon: "🕊️" },
      { level: 10, title: "Pape Saint Grégoire", latin: "Pontifex Maximus", minXp: 2600, icon: "⚜️" }
    ];

    // State Local
    let userGamification = { xp: 0, level: 1, streak: 0 };
    let currentDurationMins = 30;
    let currentHardware = 'cuda';
    let currentReviewPieceId = null;

    // Initialisation
    document.addEventListener('DOMContentLoaded', () => {
      initGamificationFromStorage();
      setupPlannerEvents();
      setupUserFilter();
      updateEstimator();
      refreshLeaderboardAndPieces();
      
      // Auto-refresh toutes les 15 secondes
      setInterval(refreshLeaderboardAndPieces, 15000);
    });

    // 1. Gamification State
    function initGamificationFromStorage() {
      try {
        const saved = localStorage.getItem('oremus_lab_gamification');
        if (saved) {
          const parsed = JSON.parse(saved);
          userGamification.xp = parsed.xp || 0;
          userGamification.level = parsed.level || 1;
          userGamification.streak = parsed.streak || 0;
        }
      } catch(e) {}
      renderGamificationHeader();
    }

    function saveGamificationToStorage() {
      try {
        localStorage.setItem('oremus_lab_gamification', JSON.stringify(userGamification));
      } catch(e) {}
      renderGamificationHeader();
    }

    function renderGamificationHeader() {
      let currentRank = MONK_RANKS[0];
      for (let i = 0; i < MONK_RANKS.length; i++) {
        if (userGamification.xp >= MONK_RANKS[i].minXp) currentRank = MONK_RANKS[i];
        else break;
      }
      userGamification.level = currentRank.level;

      document.getElementById('headerAvatar').textContent = currentRank.icon;
      document.getElementById('headerTitle').textContent = currentRank.title;
      document.getElementById('headerLevel').textContent = \`Degré \${currentRank.level} • \${currentRank.latin}\`;
      document.getElementById('headerXp').textContent = \`\${userGamification.xp} XP\`;
      document.getElementById('headerStreak').textContent = \`🔥 Série : \${userGamification.streak}\`;
    }

    function awardUserXp(amount, label) {
      userGamification.xp += amount;
      userGamification.streak += 1;
      saveGamificationToStorage();

      // Floating golden toast
      const toast = document.createElement('div');
      toast.className = 'xp-float-toast';
      toast.textContent = \`+\${amount} XP \${label || ''}\`;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 1600);
    }

    // 2. Interactive Session Planner & Dynamic Estimator
    function setupPlannerEvents() {
      const durationButtons = document.querySelectorAll('#durationGroup .btn-pill');
      const slider = document.getElementById('durationSlider');
      const sliderVal = document.getElementById('sliderValDisplay');

      durationButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          durationButtons.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          const mins = parseInt(btn.dataset.mins, 10);
          currentDurationMins = mins;
          if (mins > 0) {
            slider.value = mins;
            sliderVal.textContent = \`\${mins} min\`;
          } else {
            sliderVal.textContent = 'Libre';
          }
          updateEstimator();
        });
      });

      slider.addEventListener('input', () => {
        const mins = parseInt(slider.value, 10);
        currentDurationMins = mins;
        sliderVal.textContent = \`\${mins} min\`;
        durationButtons.forEach(b => {
          b.classList.toggle('active', parseInt(b.dataset.mins, 10) === mins);
        });
        updateEstimator();
      });

      const hwButtons = document.querySelectorAll('#hardwareGroup .btn-pill');
      hwButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          hwButtons.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          currentHardware = btn.dataset.hw;
          updateEstimator();
        });
      });
    }

    function updateEstimator() {
      const bench = BENCHMARKS[currentHardware] || BENCHMARKS.cuda;
      const avgSec = bench.avg_sec || 4.2;
      
      let estimatedCount = 0;
      if (currentDurationMins > 0) {
        const totalSec = currentDurationMins * 60;
        estimatedCount = Math.max(1, Math.round(totalSec / avgSec));
      } else {
        estimatedCount = 100; // Estimation symbolique pour session libre
      }

      const potentialXp = estimatedCount * 25; // 25 XP par chant calculé
      
      document.getElementById('estPiecesDisplay').textContent = currentDurationMins > 0 ? \`~\${estimatedCount} chants\` : 'Illimité (continu)';
      document.getElementById('estXpDisplay').textContent = \`+\${potentialXp} XP Monastiques\`;

      const pseudo = document.getElementById('filterWorkerInput').value.trim() || 'Ami';
      const durArg = currentDurationMins > 0 ? \` --duration \${currentDurationMins}\` : '';
      document.getElementById('cmdSnippet').textContent = \`python worker.py --name "\${pseudo}"\${durArg}\`;
    }

    // 3. User Filter & Batch View
    function setupUserFilter() {
      const input = document.getElementById('filterWorkerInput');
      const savedUser = localStorage.getItem('oremus_worker_name') || '';
      if (savedUser) input.value = savedUser;

      input.addEventListener('input', () => {
        localStorage.setItem('oremus_worker_name', input.value.trim());
        updateEstimator();
        fetchWorkerBatch(input.value.trim());
      });

      document.getElementById('btnRefreshBatch').addEventListener('click', () => {
        fetchWorkerBatch(input.value.trim());
      });
    }

    async function fetchWorkerBatch(workerName) {
      const grid = document.getElementById('piecesGrid');
      grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding:18px; color:var(--text-muted);">Mise à jour de vos pièces récentes...</div>';
      
      try {
        const url = workerName ? \`/api/jobs/worker/\${encodeURIComponent(workerName)}/pieces\` : '/api/jobs/worker/pieces';
        const res = await fetch(url);
        const data = await res.json();
        
        let pieces = data.pieces || [];
        let isFallback = false;

        if (pieces.length === 0 && workerName) {
          // Fallback vers les pièces communautaires pour permettre la relecture immédiate
          const commRes = await fetch('/api/jobs/worker/pieces');
          const commData = await commRes.json();
          if (commData.pieces && commData.pieces.length > 0) {
            pieces = commData.pieces;
            isFallback = true;
          }
        }

        if (pieces.length === 0) {
          grid.innerHTML = \`
            <div style="grid-column: 1/-1; text-align:center; padding:24px; color:var(--text-muted);">
              Aucune pièce récemment calculée trouvée pour "<strong>\${workerName || 'tous'}</strong>".<br>
              Lancez le worker pour voir vos premiers chants apparaître ici !
            </div>\`;
          return;
        }

        const banner = isFallback ? \`
          <div style="grid-column: 1/-1; padding:12px 16px; border-radius:10px; background:rgba(196,152,79,0.12); border:1px solid var(--border-accent); font-size:0.85rem; color:var(--gold-light); margin-bottom:12px; text-align:center;">
            ✦ Vous n'avez pas encore de calcul personnel pour "<strong>\${workerName}</strong>". Voici les partitions pré-alignées disponibles pour vous entraîner et gagner des points :
          </div>\` : '';

        grid.innerHTML = banner + pieces.map(p => \`
          <div class="piece-card">
            <div>
              <div style="font-size:0.75rem; color:var(--gold-light); font-weight:700; text-transform:uppercase;">\${p.part || 'Chant'}</div>
              <div class="piece-title">\${p.incipit || p.piece_id}</div>
              <div class="piece-meta" style="margin-top:6px;">
                <span>🎵 \${p.notes_count} notes</span>
                <span>⚡ \${p.compute_time_sec ? p.compute_time_sec + 's' : ''}</span>
              </div>
            </div>
            <button type="button" class="btn-review-card" onclick="openReviewModal('\${p.piece_id}')">
              🔍 Examiner & Réviser
            </button>
          </div>
        \`).join('');

      } catch(e) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding:18px; color:var(--crimson);">Erreur lors de la récupération des pièces.</div>';
      }
    }

    // 4. Modal de Revue Directe
    window.openReviewModal = async function(pieceId) {
      currentReviewPieceId = pieceId;
      const modal = document.getElementById('reviewModal');
      modal.style.display = 'flex';

      document.getElementById('modalPieceTitle').textContent = 'Chargement de la partition...';
      document.getElementById('modalVideoFrame').src = 'about:blank';

      try {
        const res = await fetch(\`/api/jobs/piece/\${encodeURIComponent(pieceId)}\`);
        const piece = await res.json();

        document.getElementById('modalPieceTitle').textContent = piece.incipit || piece.piece_id;
        document.getElementById('modalPiecePart').textContent = piece.part || 'Liturgie';
        document.getElementById('modalPieceAuthor').textContent = \`Aligné par : \${piece.worker_id || 'Ami'}\`;
        document.getElementById('modalNotesCount').textContent = piece.timestamps ? piece.timestamps.length : 0;

        const ytId = piece.youtube_id || (piece.youtube_url ? piece.youtube_url.split('v=')[1] : '');
        if (ytId) {
          document.getElementById('modalVideoFrame').src = \`https://www.youtube-nocookie.com/embed/\${ytId}?autoplay=0\`;
        }
      } catch(e) {
        document.getElementById('modalPieceTitle').textContent = 'Erreur de chargement';
      }
    };

    window.closeReviewModal = function() {
      document.getElementById('reviewModal').style.display = 'none';
      document.getElementById('modalVideoFrame').src = 'about:blank';
      currentReviewPieceId = null;
    };

    window.submitReviewVote = async function(status) {
      if (!currentReviewPieceId) return;
      
      const payload = {
        piece_id: currentReviewPieceId,
        status: status,
        comment: 'Relecture directe via portail worker',
        author: document.getElementById('filterWorkerInput').value.trim() || 'Ami-Reviewer'
      };

      try {
        const res = await fetch('/api/review', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        
        if (res.ok) {
          awardUserXp(10, '📜 Relecture');
          closeReviewModal();
        } else {
          alert('Erreur lors de l\\'enregistrement du vote.');
        }
      } catch(e) {
        alert('Impossible de joindre le serveur.');
      }
    };

    // 5. Leaderboard & Progression globale
    async function refreshLeaderboardAndPieces() {
      try {
        const res = await fetch('/api/jobs/status');
        const data = await res.json();

        document.getElementById('progressPct').textContent = \`\${data.percentage}%\`;
        document.getElementById('progressBar').style.width = \`\${data.percentage}%\`;
        document.getElementById('statCompleted').textContent = data.completed;
        document.getElementById('statPending').textContent = data.pending;
        document.getElementById('statWorkers').textContent = data.active_workers;

        const tbody = document.getElementById('leaderboardTbody');
        if (data.leaderboard && data.leaderboard.length > 0) {
          tbody.innerHTML = data.leaderboard.map((w, idx) => \`
            <tr>
              <td style="font-weight:700; color:\${idx === 0 ? '#fbbf24' : (idx === 1 ? '#94a3b8' : (idx === 2 ? '#b45309' : 'var(--text-muted)'))};">#\${idx + 1}</td>
              <td style="font-weight:600; color:#fff;">\${w.name}</td>
              <td style="color:var(--text-muted); font-size:0.85rem;">\${w.device || 'CPU'}</td>
              <td style="text-align:right; font-weight:700; color:var(--emerald);">\${w.count} chants</td>
            </tr>
          \`).join('');
        }

        // Rafraîchir aussi le lot si affiché
        const pseudo = document.getElementById('filterWorkerInput').value.trim();
        fetchWorkerBatch(pseudo);

      } catch(e) {}
    }
  </script>
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

  // 1. Diagnostics & Healthcheck Coolify (GET et HEAD)
  if ((req.method === 'GET' || req.method === 'HEAD') && (pathname === '/' || pathname === '/health')) {
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
      version: '1.2.0',
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
  if ((req.method === 'GET' || req.method === 'HEAD') && (pathname === '/worker' || pathname === '/compute')) {
    const stats = getJobsStats();
    const benchmarks = getBenchmarks();
    const html = renderWorkerPortalHtml(stats, benchmarks);
    res.writeHead(200, {
      ...CORS_HEADERS,
      'Content-Type': 'text/html; charset=utf-8'
    });
    return res.end(req.method === 'HEAD' ? null : html);
  }

  // 3. Téléchargement du Pack Worker (/download/worker.zip et /worker.zip)
  if ((req.method === 'GET' || req.method === 'HEAD') && (pathname === '/download/worker.zip' || pathname === '/worker.zip')) {
    const zipPath = path.join(PUBLIC_DIR, 'oremus-worker.zip');
    if (fs.existsSync(zipPath)) {
      const stat = fs.statSync(zipPath);
      res.writeHead(200, {
        ...CORS_HEADERS,
        'Content-Type': 'application/zip',
        'Content-Length': stat.size,
        'Content-Disposition': 'attachment; filename="oremus-worker.zip"'
      });
      return req.method === 'HEAD' ? res.end() : fs.createReadStream(zipPath).pipe(res);
    } else {
      return sendJson(res, 404, { error: 'Archive worker.zip non encore générée.' });
    }
  }

  // 3b. API : File d'alignements pour l'App ordonnée par intérêt liturgique (/api/alignments/queue)
  if (req.method === 'GET' && (pathname === '/api/alignments/queue' || pathname === '/api/alignments/feed' || pathname === '/api/alignments')) {
    return sendJson(res, 200, getAlignmentsQueue());
  }

  // 4. API : Benchmarks réels de calcul par matériel (/api/jobs/benchmarks)
  if (req.method === 'GET' && pathname === '/api/jobs/benchmarks') {
    return sendJson(res, 200, getBenchmarks());
  }

  // 5. API : Consultation du lot récent calculé par un worker (/api/jobs/worker/:id/pieces)
  if (req.method === 'GET' && (pathname.startsWith('/api/jobs/worker/') || pathname === '/api/jobs/recent')) {
    let workerId = reqUrl.searchParams.get('worker_id') || reqUrl.searchParams.get('worker') || '';
    if (pathname.startsWith('/api/jobs/worker/')) {
      const parts = pathname.replace('/api/jobs/worker/', '').split('/');
      if (parts[0] && parts[0] !== 'pieces') workerId = decodeURIComponent(parts[0]);
    }
    const pieces = getWorkerPieces(workerId);
    return sendJson(res, 200, {
      worker_id: workerId || 'all',
      total: pieces.length,
      pieces
    });
  }

  // 6. API : Détail complet d'une pièce pour inspection/relecture (/api/jobs/piece/:id)
  if (req.method === 'GET' && pathname.startsWith('/api/jobs/piece/')) {
    const pieceId = decodeURIComponent(pathname.replace('/api/jobs/piece/', ''));
    const details = getPieceDetails(pieceId);
    if (details) {
      return sendJson(res, 200, details);
    } else {
      return sendJson(res, 404, { error: `Pièce ${pieceId} introuvable.` });
    }
  }

  // 7. API : Attribution de la prochaine tâche au worker (Claim)
  if (req.method === 'GET' && (pathname === '/api/jobs/claim' || pathname === '/api/jobs/next')) {
    const workerId = reqUrl.searchParams.get('worker_id') || reqUrl.searchParams.get('worker') || 'Ami-Anonyme';
    const job = claimNextTask(workerId);
    if (job) {
      return sendJson(res, 200, { ok: true, job });
    } else {
      return sendJson(res, 200, { ok: true, job: null, message: 'Toutes les pièces sont actuellement alignées ou en cours !' });
    }
  }

  // 8. API : Soumission du résultat calculé par le worker (Submit)
  if (req.method === 'POST' && pathname === '/api/jobs/submit') {
    try {
      const data = await parseBody(req);
      const resData = submitTaskResult(data);
      return sendJson(res, resData.success ? 200 : 400, resData);
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
    }
  }

  // 9. API : Statistiques des tâches distribuées
  if (req.method === 'GET' && (pathname === '/api/jobs/status' || pathname === '/api/jobs/stats')) {
    return sendJson(res, 200, getJobsStats());
  }

  // 10. API : Exportation des alignements collectés
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

  // 11. API : Exportation complète des avis utilisateurs (JSON)
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

  // 12. API : Exportation des avis utilisateurs au format CSV
  if (req.method === 'GET' && pathname === '/api/reviews/export.csv') {
    try {
      const files = fs.readdirSync(PENDING_DIR).filter(f => f.endsWith('.json'));
      let csv = 'id,status,title,incipit,comment,author,reviewedAt,client,triggerReason,youtube_id\\n';
      
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
          csv += row.join(',') + '\\n';
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

  // 13. Réception des relectures Oremus (Unique ou Lot par batch)
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

  // 14. Consultation des avis en attente sur le volume
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

  // 15. Statistiques des avis enregistrés
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
      'GET  /worker (Portail interactif & revue directe)',
      'GET  /download/worker.zip (Pack de calcul 1-clic)',
      'GET  /api/jobs/benchmarks',
      'GET  /api/alignments/queue (File prioritaire pour l\'App mobile & web)',
      'GET  /api/jobs/worker/:worker_id/pieces',
      'GET  /api/jobs/piece/:piece_id',
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
  console.log(`✦ Portail Interactif Worker : http://${HOST}:${PORT}/worker`);
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
