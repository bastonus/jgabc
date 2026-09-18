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
      } else if (task.status === 'failed' && task.error && (task.error.includes('No module named') || task.error.includes('ImportError') || task.error.includes('ModuleNotFoundError'))) {
        // Déblocage des pièces échouées par manque de module local
        task.status = 'pending';
        task.error = null;
        task.claimed_at = null;
        task.worker_id = null;
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

  let task = tasks.find(t => 
    t.status === 'pending' || 
    (t.status === 'claimed' && t.claimed_at && (now - t.claimed_at > CLAIM_LEASE_MS))
  );

  // Si aucune tâche en attente, retenter les tâches ayant échoué précédemment
  if (!task) {
    task = tasks.find(t => t.status === 'failed' && (!t.failed_at || (now - t.failed_at > 120000)));
    if (task) {
      task.error = null;
    }
  }

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
  const workerId = (result.worker_id || '').trim();
  if (!workerId || workerId.toLowerCase() === 'ami-anonyme' || workerId.toLowerCase() === 'anonyme' || workerId.toLowerCase() === 'ami') {
    return { success: false, error: 'Nom ou pseudo de contributeur obligatoire pour comptabiliser vos points' };
  }

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
    const errStr = String(result.error || '');
    if (errStr.includes('No module named') || errStr.includes('ImportError') || errStr.includes('ModuleNotFoundError')) {
      task.status = 'pending';
      task.claimed_at = null;
      task.worker_id = null;
      task.error = null;
    } else {
      task.status = 'failed';
      task.failed_at = now;
      task.error = result.error || 'Erreur inconnue signalée par le worker';
    }
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

    const isTarget = (w) => targetWorker && targetWorker !== 'all' && String(w || '').toLowerCase().includes(targetWorker);

    // 1. Alignements calculés sur disque
    if (fs.existsSync(ALIGNMENTS_DIR)) {
      const files = fs.readdirSync(ALIGNMENTS_DIR).filter(f => f.endsWith('.json'));
      for (const f of files) {
        try {
          const item = JSON.parse(fs.readFileSync(path.join(ALIGNMENTS_DIR, f), 'utf8'));
          const pid = String(item.piece_id || f.replace('.json', ''));
          const wId = item.worker_id || 'Ami-Anonyme';
          seenPieceIds.add(pid);
          list.push({
            id: pid,
            piece_id: pid,
            incipit: item.incipit || `Pièce #${pid}`,
            part: item.part || 'Chant',
            worker: wId,
            worker_id: wId,
            is_user_piece: isTarget(wId),
            youtube_id: item.youtube_id || '',
            youtube_url: item.youtube_url || '',
            compute_time_sec: item.compute_time_sec || 0,
            audio_duration_sec: item.audio_duration_sec || 0,
            completed_at: item.completed_at || new Date().toISOString(),
            notes_count: Array.isArray(item.timestamps) ? item.timestamps.length : 0
          });
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
      seenPieceIds.add(pid);
      const task = taskMap.get(pid) || taskMap.get(String(key)) || {};
      list.push({
        id: pid,
        piece_id: pid,
        incipit: s.incipit || task.incipit || `Pièce #${pid}`,
        part: s.part || task.part || 'Chant',
        worker: workerName,
        worker_id: workerName,
        is_user_piece: isTarget(workerName),
        youtube_id: s.youtube_id || task.youtube_id || '',
        youtube_url: s.youtube_url || task.youtube_url || (s.youtube_id ? `https://www.youtube.com/watch?v=${s.youtube_id}` : ''),
        compute_time_sec: s.compute_time_sec || 3.8,
        audio_duration_sec: s.audio_duration_sec || 0,
        completed_at: s.completed_at || '2026-09-15T12:00:00.000Z',
        notes_count: s.timestamps.length
      });
    }

    // Tri : Les pièces calculées par l'utilisateur apparaissent EN PREMIER LIEU, puis par date de calcul décroissante
    list.sort((a, b) => {
      if (targetWorker && targetWorker !== 'all') {
        if (a.is_user_piece && !b.is_user_piece) return -1;
        if (!a.is_user_piece && b.is_user_piece) return 1;
      }
      return new Date(b.completed_at) - new Date(a.completed_at);
    });

    return list.slice(0, 60);
  } catch (e) {
    console.error('[WORKER] Erreur getWorkerPieces:', e);
    return [];
  }
}

function getPieceDetails(pieceId) {
  const safeId = String(pieceId).replace(/[^a-zA-Z0-9_\-\.]/g, '');
  const alignmentPath = path.join(ALIGNMENTS_DIR, `${safeId}.json`);
  const tasks = loadTasks();
  const task = tasks.find(t => String(t.id) === String(pieceId) || String(t.id) === safeId) || {};
  
  if (fs.existsSync(alignmentPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(alignmentPath, 'utf8'));
      return {
        id: data.piece_id || safeId,
        piece_id: data.piece_id || safeId,
        incipit: data.incipit || task.incipit || `Pièce #${safeId}`,
        part: data.part || task.part || 'Chant',
        youtube_id: data.youtube_id || task.youtube_id || '',
        youtube_url: data.youtube_url || task.youtube_url || (data.youtube_id ? `https://www.youtube.com/watch?v=${data.youtube_id}` : ''),
        gabc_src: data.gabc_src || task.gabc_src || '',
        timestamps: data.timestamps || [],
        notes_count: Array.isArray(data.timestamps) ? data.timestamps.length : 0,
        worker_id: data.worker_id || 'Ami',
        compute_device: data.compute_device || '',
        ...data
      };
    } catch (e) {}
  }

  // Fallback vers les alignements initiaux pré-calculés (seed)
  const seeds = loadSeedAlignments();
  if (seeds[pieceId] || seeds[safeId]) {
    const s = seeds[pieceId] || seeds[safeId];
    return {
      id: pieceId,
      piece_id: pieceId,
      incipit: s.incipit || task.incipit || `Pièce #${pieceId}`,
      part: s.part || task.part || 'Chant',
      youtube_id: s.youtube_id || task.youtube_id || '',
      youtube_url: s.youtube_url || task.youtube_url || (s.youtube_id ? `https://www.youtube.com/watch?v=${s.youtube_id}` : ''),
      gabc_src: s.gabc_src || task.gabc_src || '',
      timestamps: s.timestamps || [],
      notes_count: Array.isArray(s.timestamps) ? s.timestamps.length : 0,
      worker_id: s.worker_id || 'Atelier-Chantres',
      compute_device: s.compute_device || 'Meta MMS_FA (Curated)',
      pack: task.pack || 'liturgy',
      is_liturgy_pack: task.is_liturgy_pack !== undefined ? task.is_liturgy_pack : true
    };
  }

  if (task && task.id) {
    return {
      id: task.id,
      piece_id: task.id,
      incipit: task.incipit,
      part: task.part,
      youtube_id: task.youtube_id,
      youtube_url: task.youtube_url,
      gabc_src: task.gabc_src || '',
      timestamps: [],
      notes_count: 0,
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
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <meta name="theme-color" content="#000000">
  <title>Oremus — Calcul Distribué & Scriptorium Liturgique</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Crimson+Text:ital,wght@0,400;0,600;0,700;1,400;1,600&family=Inter:wght@300;400;500;600;700;800&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
  <script src="https://www.youtube.com/iframe_api"></script>
  <script src="/exsurge.min.js"></script>
  <style>
    /* Oremus Frameless Zero-Stroke Design System Tokens */
    :root {
      --primary-color: #c96b63;
      --primary-color-rgb: 201, 107, 99;
      --gold-sacred: #c4984f;
      --gold-sacred-bg: rgba(196, 152, 79, 0.12);

      --background-base: #000000;
      --background-surface: #0a0a0a;
      --background-card: #141414;
      --background-highlight: #1e1e22;

      --text-primary: #f8fafc;
      --text-secondary: #94a3b8;
      --text-tertiary: #64748b;

      --status-success: #10b981;
      --status-success-bg: rgba(16, 185, 129, 0.14);
      --status-warning: #f59e0b;
      --status-warning-bg: rgba(245, 158, 11, 0.14);
      --status-danger: #c96b63;
      --status-danger-bg: rgba(201, 107, 99, 0.14);

      --card-radius: 14px;
      --btn-radius: 12px;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--background-base);
      color: var(--text-primary);
      line-height: 1.5;
      padding: 16px 14px 60px;
    }
    .container { max-width: 860px; margin: 0 auto; }

    /* Top Bar Header (Monastic Rank Widget Frameless) */
    .header-bar {
      display: flex; justify-content: space-between; align-items: center;
      background: var(--background-surface); border: none !important;
      border-radius: var(--card-radius); padding: 12px 18px; margin-bottom: 24px;
    }
    .header-left { display: flex; align-items: center; gap: 14px; }
    .monk-avatar {
      width: 40px; height: 40px; border-radius: 50%;
      background: var(--gold-sacred); color: #121214;
      display: flex; align-items: center; justify-content: center;
      font-size: 1.05rem; font-weight: 800; font-family: 'Libre Baskerville', serif; flex-shrink: 0;
    }
    .monk-info-title {
      font-family: 'Libre Baskerville', 'Crimson Text', serif;
      font-weight: 700; font-size: 1.05rem; color: var(--text-primary);
    }
    .monk-info-sub {
      font-size: 0.78rem; color: var(--gold-sacred); display: flex; align-items: center; gap: 8px; margin-top: 1px;
    }
    .streak-pill {
      background: rgba(245, 158, 11, 0.14); color: #f59e0b;
      padding: 1px 7px; border-radius: 999px; font-weight: 700; font-size: 0.72rem;
    }
    .header-right { display: flex; align-items: center; gap: 10px; }
    .xp-counter-badge {
      background: rgba(255, 255, 255, 0.04);
      border-radius: 10px; padding: 6px 12px; text-align: right;
    }
    .xp-num { font-weight: 800; color: var(--gold-sacred); font-size: 0.95rem; }
    .xp-label { font-size: 0.68rem; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.05em; }

    /* Page Titles */
    .page-hero { text-align: center; margin-bottom: 26px; }
    .badge-hero {
      display: inline-block; padding: 3px 12px; border-radius: 999px;
      background: var(--gold-sacred-bg); color: var(--gold-sacred);
      font-size: 0.75rem; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.08em; margin-bottom: 8px;
    }
    h1 {
      font-family: 'Libre Baskerville', 'Crimson Text', serif;
      font-size: 1.95rem; font-weight: 700; letter-spacing: -0.01em; margin-bottom: 6px;
      color: var(--text-primary);
    }
    p.lead { font-size: 0.96rem; color: var(--text-secondary); max-width: 640px; margin: 0 auto; line-height: 1.5; }

    /* Cards (Frameless) */
    .card {
      background: var(--background-surface); border: none !important;
      border-radius: var(--card-radius); padding: 22px; margin-bottom: 20px;
    }
    .card-title {
      font-family: 'Libre Baskerville', 'Crimson Text', serif;
      font-size: 1.15rem; font-weight: 700; margin-bottom: 12px; display: flex; align-items: center; gap: 10px;
      color: var(--text-primary);
    }

    /* Progress Bar */
    .progress-bar-bg { height: 10px; background: rgba(255,255,255,0.06); border-radius: 999px; overflow: hidden; margin-top: 10px; }
    .progress-bar-fill { height: 100%; background: #10b981; width: ${stats.percentage}%; transition: width 0.5s; }
    .stats-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin-top: 16px; }
    .stat-chip { background: rgba(255,255,255,0.025); border-radius: 10px; padding: 12px; text-align: center; }
    .stat-chip-val { font-size: 1.45rem; font-weight: 800; }
    .stat-chip-lbl { font-size: 0.72rem; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2px; }

    /* Session Planner Controls */
    .planner-section { margin-top: 6px; }
    .choice-group-label { font-size: 0.80rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-tertiary); font-weight: 700; margin-bottom: 8px; }
    .btn-pill-group { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
    .btn-pill {
      background: rgba(255, 255, 255, 0.05); border: none;
      color: var(--text-secondary); padding: 8px 15px; border-radius: 9px;
      font-size: 0.88rem; font-weight: 500; cursor: pointer; transition: background 0.15s, color 0.15s;
    }
    .btn-pill:hover { background: rgba(255, 255, 255, 0.10); color: var(--text-primary); }
    .btn-pill.active { background: var(--primary-color); color: #fff; font-weight: 600; }

    .slider-row { display: flex; align-items: center; gap: 14px; margin-bottom: 20px; }
    .slider-input { flex: 1; accent-color: var(--primary-color); cursor: pointer; height: 6px; }
    .slider-val-badge {
      background: rgba(255,255,255,0.06); padding: 4px 10px; border-radius: 6px;
      font-weight: 700; color: var(--primary-color); min-width: 70px; text-align: center; font-size: 0.85rem;
    }

    /* Estimation Highlight Box */
    .estimation-card {
      background: rgba(16, 185, 129, 0.08); border-radius: 12px; padding: 16px;
      margin: 16px 0; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 14px;
    }
    .est-number { font-size: 1.7rem; font-weight: 800; color: #10b981; }
    .est-label { font-size: 0.82rem; color: var(--text-secondary); }
    .est-xp-badge { background: var(--gold-sacred-bg); color: var(--gold-sacred); padding: 4px 10px; border-radius: 6px; font-weight: 700; font-size: 0.82rem; }

    /* CTA Button */
    .btn-cta {
      display: inline-flex; align-items: center; justify-content: center; gap: 10px;
      background: rgba(255, 255, 255, 0.08); color: var(--text-primary);
      text-decoration: none; padding: 12px 24px; font-size: 0.95rem; font-weight: 600;
      border-radius: 10px; border: none; cursor: pointer; transition: background 0.15s; width: 100%;
    }
    .btn-cta:hover { background: rgba(255, 255, 255, 0.14); }

    /* CLI Command Section Styles */
    .cli-section { margin-top: 20px; }
    .cli-tabs { display: flex; gap: 8px; margin-bottom: 10px; padding-bottom: 6px; }
    .cli-tab-btn {
      background: none; border: none; color: var(--text-tertiary); padding: 6px 12px;
      font-size: 0.84rem; font-weight: 600; cursor: pointer; border-radius: 8px; transition: all 0.15s;
    }
    .cli-tab-btn:hover { color: var(--text-primary); }
    .cli-tab-btn.active {
      background: rgba(201, 107, 99, 0.14); color: var(--primary-color);
    }
    .cli-box {
      background: #000000; border-radius: 10px; padding: 12px 14px; display: flex;
      justify-content: space-between; align-items: center; gap: 14px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.86rem; color: var(--text-primary); margin-bottom: 8px; overflow-x: auto;
    }
    .cli-box code { white-space: nowrap; user-select: all; font-family: inherit; }
    .btn-copy-cli {
      background: rgba(201, 107, 99, 0.15); border: none; color: var(--primary-color);
      padding: 6px 12px; border-radius: 6px; font-size: 0.78rem; font-weight: 600;
      cursor: pointer; white-space: nowrap; transition: all 0.15s; display: flex; align-items: center; gap: 6px;
    }
    .btn-copy-cli:hover { background: rgba(201, 107, 99, 0.28); }
    .btn-copy-cli.copied { background: rgba(16, 185, 129, 0.2); color: #10b981; }

    /* Batch & Review Section */
    .batch-header-row { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-bottom: 14px; }
    .user-filter-box { display: flex; gap: 8px; align-items: center; }
    .user-input {
      background: rgba(255,255,255,0.05); border: none;
      color: #fff; padding: 8px 12px; border-radius: 8px; font-size: 0.88rem; outline: none;
    }
    .user-input:focus { background: rgba(255,255,255,0.08); }
    
    .pieces-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
    .piece-card {
      background: var(--background-card); border-radius: 12px;
      padding: 14px; display: flex; flex-direction: column;
      justify-content: space-between; gap: 10px; transition: background 0.15s;
      position: relative;
    }
    .piece-card:hover { background: var(--background-highlight); }
    .piece-card.is-user-card {
      border-left: 3px solid var(--gold-sacred);
      background: rgba(196, 152, 79, 0.05);
    }
    .piece-card.is-user-card:hover {
      background: rgba(196, 152, 79, 0.09);
    }
    .badge-user-piece {
      background: var(--gold-sacred-bg); color: var(--gold-sacred);
      padding: 2px 7px; border-radius: 6px; font-size: 0.70rem; font-weight: 700;
      letter-spacing: 0.03em;
    }
    .badge-other-piece {
      background: rgba(255,255,255,0.05); color: var(--text-tertiary);
      padding: 2px 7px; border-radius: 6px; font-size: 0.70rem; font-weight: 500;
    }
    .piece-title {
      font-family: 'Libre Baskerville', 'Crimson Text', serif;
      font-weight: 700; font-size: 0.98rem; color: #fff; line-height: 1.3;
    }
    .piece-meta { font-size: 0.78rem; color: var(--text-tertiary); display: flex; gap: 10px; }
    .btn-review-card {
      background: var(--gold-sacred-bg); border: none;
      color: var(--gold-sacred); padding: 7px 12px; border-radius: 8px;
      font-size: 0.82rem; font-weight: 600; cursor: pointer; text-align: center;
      transition: background 0.15s;
    }
    .btn-review-card:hover { background: rgba(196, 152, 79, 0.24); }

    /* Modal Review Player — style alignment-lab (frameless) */
    .modal-backdrop {
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(0,0,0,0.92); backdrop-filter: blur(12px);
      display: none; align-items: center; justify-content: center; z-index: 9999;
      padding: 16px;
    }
    .modal-content {
      background: #0a0a0a; border: none;
      border-radius: 20px; width: 100%; max-width: 820px; max-height: 94vh;
      overflow-y: auto; padding: 24px;
      box-shadow: 0 32px 64px rgba(0,0,0,0.9);
      position: relative;
    }
    .modal-close-btn {
      position: absolute; top: 16px; right: 16px;
      width: 32px; height: 32px; border-radius: 9px;
      background: rgba(255,255,255,0.07); border: none;
      color: #94a3b8; font-size: 1.0rem; cursor: pointer;
      display: inline-flex; align-items: center; justify-content: center;
      transition: background 0.15s, color 0.15s;
    }
    .modal-close-btn:hover { background: rgba(255,255,255,0.14); color: #fff; }
    .modal-chant-badge {
      display: inline-flex; align-items: center;
      font-size: 0.68rem; font-weight: 700; color: #c96b63;
      background: rgba(201,107,99,0.12); padding: 2px 8px;
      border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.04em;
      margin-bottom: 6px;
    }
    .modal-chant-title {
      font-size: 1.3rem; font-weight: 700;
      color: #f8fafc; margin-bottom: 2px; line-height: 1.25;
    }
    .modal-chant-sub { font-size: 0.8rem; color: #64748b; margin-bottom: 14px; }
    
    .modal-media-grid { display: flex; flex-direction: column; gap: 14px; margin-bottom: 16px; }
    .video-frame-container { width: 100%; aspect-ratio: 16/9; max-height: 260px; background: #000; border-radius: 12px; overflow: hidden; }
    .video-frame-container iframe { width: 100%; height: 100%; border: none; }

    /* Gregorian Score Box (Exsurge) */
    .modal-score-box {
      background: #000000; border-radius: 12px; padding: 14px;
      display: flex; flex-direction: column; gap: 8px;
    }
    .modal-score-header {
      display: flex; justify-content: space-between; align-items: center;
      padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .modal-score-title {
      font-size: 0.76rem; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.06em; color: var(--gold-sacred);
    }
    .modal-score-meta {
      font-size: 0.74rem; color: var(--text-tertiary);
    }
    .score-viewport {
      max-height: 280px; overflow-y: auto; overscroll-behavior: contain;
      padding: 12px 6px; font-family: 'Crimson Text', 'Libre Baskerville', Georgia, serif;
    }
    .score-viewport svg {
      display: block;
      width: 100%;
      height: auto;
      color: #ffffff !important;
      fill: #ffffff !important;
    }
    .score-viewport svg line {
      stroke: rgba(255, 255, 255, 0.55) !important;
      fill: none !important;
      pointer-events: none !important;
    }
    .score-viewport svg path.brace {
      stroke: #ffffff !important;
      fill: none !important;
    }
    .score-viewport svg .neumeLine,
    .score-viewport svg .neumeBeam,
    .score-viewport svg .dividerLine,
    .score-viewport svg .horizontalEpisema {
      fill: #ffffff !important;
    }
    .score-viewport svg path:not(.brace):not(.rubric):not([class*="rubric"]):not([class*="specialChar"]):not(.active):not([class*="active"]),
    .score-viewport svg use:not(.active):not([class*="active"]):not(.selected),
    .score-viewport svg .glyph {
      fill: #ffffff !important;
    }
    .score-viewport svg text:not(.active):not([class*="active"]):not(.rubric):not([class*="rubric"]),
    .score-viewport svg text:not(.active) tspan:not(.rubric):not([class*="rubric"]):not([class*="specialChar"]):not(.active):not([class*="active"]) {
      fill: #ffffff !important;
      font-family: 'Crimson Text', 'Libre Baskerville', Georgia, serif !important;
    }
    .score-viewport svg text.rubric,
    .score-viewport svg text.specialChar,
    .score-viewport svg tspan.rubric,
    .score-viewport svg tspan.specialChar,
    .score-viewport svg .rubric,
    .score-viewport svg [class*="rubric"],
    .score-viewport svg [class*="specialChar"] {
      fill: var(--primary-color) !important;
    }
    /* Note & syllabe active en cours de chant (reprise fidele du laboratoire) */
    .score-viewport svg use.active,
    .score-viewport svg use[class*="active"],
    .score-viewport svg use.active-note-highlight,
    .score-viewport svg text.active,
    .score-viewport svg text.active *,
    .score-viewport svg text.active tspan,
    .score-viewport svg tspan.active,
    .score-viewport svg text.dropCap.active,
    .score-viewport svg text.lyric.active,
    .score-viewport svg text.lyric.active tspan,
    .score-viewport svg text.aboveLinesText.active,
    .score-viewport svg text.aboveLinesText.active tspan,
    .score-viewport svg .note.active {
      fill: var(--primary-color) !important;
      color: var(--primary-color) !important;
      stroke: none !important;
      transition: fill 0.08s ease;
    }
    .score-viewport svg use[data-note-index],
    .score-viewport svg text[data-note-index],
    .score-viewport svg tspan[data-note-index] {
      cursor: pointer;
    }
    .score-viewport svg use[data-note-index]:hover {
      opacity: 0.82;
    }

    /* Barre de contrôle du lecteur dans la modal */
    .modal-player-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      background: rgba(255, 255, 255, 0.04);
      border-radius: 10px;
      font-size: 0.8rem;
    }
    .btn-player-mini {
      height: 32px;
      padding: 0 10px;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.08);
      border: none;
      color: var(--text-primary);
      font-size: 0.78rem;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      cursor: pointer;
      transition: background 0.15s ease;
    }
    .btn-player-mini:hover { background: rgba(255, 255, 255, 0.14); }
    .btn-player-mini:active { opacity: 0.8; }
    .btn-player-play {
      background: rgba(201, 107, 99, 0.22);
      color: #fff;
    }
    .btn-player-play:hover {
      background: rgba(201, 107, 99, 0.35);
    }
    .modal-player-time {
      font-family: monospace;
      font-size: 0.76rem;
      color: var(--text-secondary);
      margin-left: 4px;
    }
    .modal-player-hint {
      margin-left: auto;
      font-size: 0.72rem;
      color: var(--gold-sacred);
      opacity: 0.9;
    }
    @media (max-width: 600px) {
      .modal-player-hint { display: none; }
    }

    /* Boutons de décision — identiques au laboratoire d'alignement */
    .decision-buttons-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .btn-decision {
      height: 54px; border-radius: 12px;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 3px;
      cursor: pointer; user-select: none;
      border: none !important; outline: none !important;
      box-shadow: none !important; transform: none !important;
      padding: 6px 4px;
      transition: background-color 0.15s ease, opacity 0.15s ease;
    }
    .btn-decision:active { opacity: 0.8; }
    .btn-decision .decision-label {
      font-size: 0.84rem; font-weight: 600; line-height: 1.1;
      text-align: center; display: flex; align-items: center; gap: 5px;
    }
    .btn-decision .decision-xp { font-size: 0.65rem; opacity: 0.65; font-weight: 500; }
    .btn-decision.btn-approved { background: rgba(16,185,129,0.14) !important; color: #10b981 !important; }
    .btn-decision.btn-approved:hover { background: rgba(16,185,129,0.24) !important; }
    .btn-decision.btn-delayed { background: rgba(245,158,11,0.14) !important; color: #f59e0b !important; }
    .btn-decision.btn-delayed:hover { background: rgba(245,158,11,0.24) !important; }
    .btn-decision.btn-bad { background: rgba(201,107,99,0.14) !important; color: #c96b63 !important; }
    .btn-decision.btn-bad:hover { background: rgba(201,107,99,0.24) !important; }

    /* Ligne d'actions secondaires (Passer, Remarque) */
    .utility-actions-row { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
    .btn-utility {
      flex: 1; height: 34px; border-radius: 9px;
      background: rgba(255, 255, 255, 0.05) !important;
      border: none !important; outline: none !important;
      color: var(--text-muted); display: inline-flex; align-items: center; justify-content: center; gap: 6px;
      font-size: 0.78rem; font-weight: 500; cursor: pointer; transition: background 0.15s, color 0.15s;
    }
    .btn-utility:hover { background: rgba(255, 255, 255, 0.10) !important; color: #fff; }
    .btn-utility.btn-skip-prominent { flex: 2; font-weight: 600; color: #f8fafc; }
    .btn-utility.btn-comment-trigger {
      flex: 1; font-weight: 600; color: #f8fafc;
      background: rgba(201, 107, 99, 0.14) !important;
    }
    .btn-utility.btn-comment-trigger:hover { background: rgba(201, 107, 99, 0.24) !important; }

    /* Zone de commentaire dépliable */
    .decision-comment-view { display: flex; flex-direction: column; gap: 6px; width: 100%; margin-top: 8px; animation: commentExpandIn 0.2s ease-out; }
    @keyframes commentExpandIn { from { opacity: 0; transform: scaleY(0.96); } to { opacity: 1; transform: scaleY(1); } }
    .inline-comment-textarea {
      width: 100%; min-height: 56px; max-height: 120px; padding: 10px 12px;
      border-radius: 12px; background: #1e1e22 !important; border: none !important; outline: none !important;
      color: #f8fafc; font-family: inherit; font-size: 0.86rem; line-height: 1.4; resize: none; box-sizing: border-box;
    }
    .comment-actions-row { display: flex; gap: 10px; width: 100%; margin-top: 6px; }
    .btn-comment-cancel {
      flex: 1; height: 38px; border-radius: 10px;
      background: rgba(255, 255, 255, 0.08) !important; color: #f8fafc !important;
      border: none !important; font-size: 0.82rem; font-weight: 600; cursor: pointer;
    }
    .btn-comment-submit {
      flex: 1.3; height: 38px; border-radius: 10px;
      background: #c96b63 !important; color: #ffffff !important;
      border: none !important; font-size: 0.82rem; font-weight: 600; cursor: pointer;
      display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    }
    .btn-comment-submit:hover { filter: brightness(1.1); }

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
        <div class="monk-avatar" id="headerAvatar">I</div>
        <div>
          <div class="monk-info-title" id="headerTitle">Novice du Chœur</div>
          <div class="monk-info-sub">
            <span id="headerLevel">Degré 1 • Novicius</span>
            <span class="streak-pill" id="headerStreak">Série : 0</span>
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
          <div class="stat-chip-val" style="color: #10b981;" id="statCompleted">${stats.completed}</div>
          <div class="stat-chip-lbl">Chants alignés</div>
        </div>
        <div class="stat-chip">
          <div class="stat-chip-val" style="color: var(--gold-sacred);" id="statPending">${stats.pending}</div>
          <div class="stat-chip-lbl">En attente</div>
        </div>
        <div class="stat-chip">
          <div class="stat-chip-val" style="color: var(--primary-color);" id="statWorkers">${stats.active_workers}</div>
          <div class="stat-chip-lbl">Ordinateurs d'amis</div>
        </div>
      </div>
    </div>

    <!-- Section 1 : Interactive Session Planner with Estimator -->
    <div class="card">
      <div class="card-title">
        Planificateur de Session & Estimation
      </div>
      <p style="font-size:0.9rem; color:var(--text-secondary); margin-bottom:16px;">
        Choisissez combien de temps vous souhaitez consacrer au calcul. L'estimation est calculée dynamiquement à partir des benchmarks réels de nos serveurs.
      </p>

      <div class="planner-section">
        <!-- Étape 1 : Saisie obligatoire du prénom ou pseudo -->
        <div class="choice-group-label" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <span>1. Entrez votre prénom ou pseudo (obligatoire pour compter vos points) :</span>
          <span style="font-size:0.75rem; color:var(--gold-sacred); font-weight:700;">✦ +25 XP par chant calculé</span>
        </div>
        <div style="margin-bottom: 20px;">
          <input type="text" id="plannerWorkerInput" class="filter-input" style="max-width:100%; width:100%; font-size:1.02rem; padding:12px 14px; border-radius:10px; background:rgba(255,255,255,0.06); border:1.5px solid rgba(196,152,79,0.4); color:#ffffff; font-weight:600;" placeholder="Ex : theobald, frère-bernard, abbaye-saint-benoît..." autocomplete="name">
          <div style="font-size:0.78rem; color:var(--text-secondary); margin-top:6px;" id="plannerWorkerHint">
            ✦ Vos points d'XP et vos chants calculés seront automatiquement enregistrés et comptabilisés sous ce nom.
          </div>
        </div>

        <div class="choice-group-label">2. Choisissez la durée de votre session :</div>
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

        <div class="choice-group-label">3. Sélectionnez votre matériel (accélération) :</div>
        <div class="btn-pill-group" id="hardwareGroup">
          <button type="button" class="btn-pill active" data-hw="cuda">NVIDIA GPU (CUDA)</button>
          <button type="button" class="btn-pill" data-hw="mps">Apple Silicon (M1-M4)</button>
          <button type="button" class="btn-pill" data-hw="cpu">Processeur (CPU)</button>
        </div>

        <!-- Live Estimator Display -->
        <div class="estimation-card">
          <div>
            <div class="est-number" id="estPiecesDisplay">~43 chants</div>
            <div class="est-label">Estimation du nombre de partitions qui seront alignées</div>
          </div>
          <div style="text-align:right;">
            <div class="est-xp-badge" id="estXpDisplay">+1075 XP Monastiques</div>
            <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:4px;">+25 XP par chant calculé</div>
          </div>
        </div>

        <!-- Mode de lancement : 1. Ligne de commande directe (CLI) -->
        <div class="cli-section">
          <div class="choice-group-label" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <span>Option 1 : Lancement direct en Ligne de Commande (Terminal)</span>
            <span style="font-size:0.75rem; color:#10b981; text-transform:none; font-weight:700;">Zéro téléchargement manuel</span>
          </div>
          <p style="font-size:0.86rem; color:var(--text-secondary); margin-bottom:12px;">
            Copiez-collez une seule ligne dans votre terminal. L'environnement virtuel isolé et les modules IA sont configurés automatiquement.
          </p>

          <div class="cli-tabs">
            <button type="button" class="cli-tab-btn active" data-os="windows" onclick="switchCliTab('windows')">Windows (PowerShell)</button>
            <button type="button" class="cli-tab-btn" data-os="unix" onclick="switchCliTab('unix')">macOS & Linux (Bash)</button>
            <button type="button" class="cli-tab-btn" data-os="python" onclick="switchCliTab('python')">Python direct</button>
          </div>

          <div id="cliPanelWindows">
            <div class="cli-box">
              <code id="cliCmdWindows">irm https://api-oremus.silverhorse.fr/run.ps1 | iex</code>
              <button type="button" class="btn-copy-cli" onclick="copyCliCommand('cliCmdWindows', this)">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                Copier
              </button>
            </div>
            <div style="font-size:0.78rem; color:var(--text-tertiary);">
              <em>Note : Ouvrez PowerShell, collez la commande et appuyez sur <kbd style="background:rgba(255,255,255,0.1); padding:1px 5px; border-radius:4px;">Entrée</kbd>.</em>
            </div>
          </div>

          <div id="cliPanelUnix" style="display:none;">
            <div class="cli-box">
              <code id="cliCmdUnix">curl -fsSL https://api-oremus.silverhorse.fr/run.sh | bash</code>
              <button type="button" class="btn-copy-cli" onclick="copyCliCommand('cliCmdUnix', this)">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                Copier
              </button>
            </div>
            <div style="font-size:0.78rem; color:var(--text-tertiary);">
              <em>Note : Ouvrez votre Terminal (macOS / Linux), collez et appuyez sur <kbd style="background:rgba(255,255,255,0.1); padding:1px 5px; border-radius:4px;">Entrée</kbd>.</em>
            </div>
          </div>

          <div id="cliPanelPython" style="display:none;">
            <div class="cli-box">
              <code id="cliCmdPython">curl -fsSL https://api-oremus.silverhorse.fr/worker.py | python3 -</code>
              <button type="button" class="btn-copy-cli" onclick="copyCliCommand('cliCmdPython', this)">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                Copier
              </button>
            </div>
            <div style="font-size:0.78rem; color:var(--text-tertiary);">
              <em>Note : Exécution directe via Python (recommandé si PyTorch est déjà présent sur votre machine).</em>
            </div>
          </div>
        </div>

        <!-- Mode de lancement : 2. Pack ZIP 1-Clic -->
        <div style="margin-top:20px; padding-top:16px;">
          <div class="choice-group-label" style="margin-bottom:8px;">
            <span>Option 2 : Téléchargement du Pack Autonome (Archive ZIP)</span>
          </div>
          <p style="font-size:0.86rem; color:var(--text-secondary); margin-bottom:12px;">
            Idéal si vous préférez un dossier zippé avec lanceurs double-clic tout prêts.
          </p>
          <a href="/download/worker.zip" class="btn-cta">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            Télécharger le pack Worker (oremus-worker.zip)
          </a>
        </div>
      </div>
    </div>

    <!-- Quick-Start Instructions for Non-Tech Friends -->
    <div class="card">
      <div class="card-title">
        Instructions Simplifiées (1 Clic pour Débutants)
      </div>
      <p style="font-size:0.9rem; color:var(--text-secondary); margin-bottom:14px;">
        Aucune connaissance technique requise. Décompressez l'archive et lancez le script correspondant à votre système :
      </p>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:14px;">
        <div style="background:var(--background-card); border-radius:12px; padding:16px;">
          <div style="font-weight:700; color:#10b981; margin-bottom:8px; display:flex; align-items:center; gap:8px;">
            <strong>Windows (1 Clic)</strong>
          </div>
          <ol style="font-size:0.86rem; color:var(--text-secondary); margin-left:20px; line-height:1.6;">
            <li>Téléchargez et décompressez <strong style="color:#fff;">oremus-worker.zip</strong>.</li>
            <li>Double-cliquez simplement sur <code style="color:#10b981; background:rgba(16,185,129,0.1); padding:2px 6px; border-radius:4px;">start_worker.bat</code>.</li>
            <li>Indiquez votre pseudo et la durée souhaitée : l'alignement commence immédiatement !</li>
          </ol>
        </div>
        <div style="background:var(--background-card); border-radius:12px; padding:16px;">
          <div style="font-weight:700; color:var(--primary-color); margin-bottom:8px; display:flex; align-items:center; gap:8px;">
            <strong>macOS & Linux</strong>
          </div>
          <ol style="font-size:0.86rem; color:var(--text-secondary); margin-left:20px; line-height:1.6;">
            <li>Téléchargez et décompressez <strong style="color:#fff;">oremus-worker.zip</strong>.</li>
            <li>Dans le terminal ou Finder, lancez <code style="color:var(--primary-color); background:rgba(201,107,99,0.12); padding:2px 6px; border-radius:4px;">start_worker.sh</code>.</li>
            <li>L'accélération Apple Silicon (MPS) ou CUDA est détectée automatiquement.</li>
          </ol>
        </div>
      </div>
    </div>

    <!-- Section 2 : Mes Chants Récents Traités (Batch Aligné & Revue Directe) -->
    <div class="card" id="batchSection">
      <div class="batch-header-row">
        <div class="card-title" style="margin-bottom:0;">
          Mon Lot Récemment Aligné
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
        Tableau d'Honneur des Amis Contributeurs
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

    <!-- Modal : Lecteur de Revue Directe avec Partition Grégorienne Exsurge -->
    <div class="modal-backdrop" id="reviewModal" onclick="handleBackdropClick(event)">
      <div class="modal-content">
        <button type="button" class="modal-close-btn" onclick="closeReviewModal()" aria-label="Fermer">✕</button>

        <div style="margin-bottom:12px;">
          <div class="modal-chant-badge" id="modalPiecePart">Kyriale</div>
          <div class="modal-chant-title" id="modalPieceTitle">Incipit du Chant</div>
          <div class="modal-chant-sub" id="modalPieceAuthor">Aligné par : Ami</div>
        </div>

        <div class="modal-media-grid">
          <div class="video-frame-container">
            <div id="modalVideoContainer" style="position:relative; width:100%; height:100%;">
              <iframe id="modalVideoFrame" src="" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="position:absolute; top:0; left:0; width:100%; height:100%; border:none;"></iframe>
            </div>
          </div>

          <!-- Barre de transport et lecture synchronisée -->
          <div class="modal-player-bar">
            <button type="button" class="btn-player-mini" onclick="seekModalRelative(-3)" title="Reculer de 3s (Touche J)">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="11 19 2 12 11 5 11 19"/><polygon points="22 19 13 12 22 5 22 19"/></svg>
              <span>-3s</span>
            </button>
            <button type="button" class="btn-player-mini btn-player-play" onclick="toggleModalPlayPause()" id="modalBtnPlayPause" title="Lecture / Pause (Espace)">
              <svg id="modalIconPlay" viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              <svg id="modalIconPause" viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style="display:none;"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
              <span id="modalPlayText">Lecture</span>
            </button>
            <button type="button" class="btn-player-mini" onclick="seekModalRelative(3)" title="Avancer de 3s (Touche L)">
              <span>+3s</span>
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="13 19 22 12 13 5 13 19"/><polygon points="2 19 11 12 2 5 2 19"/></svg>
            </button>
            <span class="modal-player-time" id="modalTimeDisplay">0:00 / 0:00</span>
            <span class="modal-player-hint">✦ Cliquez sur un neume pour vous y synchroniser</span>
          </div>

          <!-- Affichage fidèle de la partition grégorienne via Exsurge -->
          <div class="modal-score-box">
            <div class="modal-score-header">
              <span class="modal-score-title">✦ Partition Grégorienne (Neumes)</span>
              <span class="modal-score-meta" id="modalNotesCountBadge">0 notes synchronisées</span>
            </div>
            <div class="score-viewport" id="modalScoreSlot">
              <div style="padding:24px; text-align:center; color:var(--text-tertiary); font-size:0.86rem;">
                Chargement des neumes grégoriens...
              </div>
            </div>
          </div>
        </div>

        <!-- 3 Boutons de décision identiques au Laboratoire d'Alignement -->
        <div class="decision-buttons-grid">
          <button type="button" class="btn-decision btn-approved" onclick="submitReviewVote('approved')" title="Bien aligné">
            <span class="decision-label">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              Bien aligné
            </span>
            <span class="decision-xp">+10 XP</span>
          </button>
          <button type="button" class="btn-decision btn-delayed" onclick="submitReviewVote('rejected')" title="Décalé">
            <span class="decision-label">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              Décalé
            </span>
            <span class="decision-xp">+10 XP</span>
          </button>
          <button type="button" class="btn-decision btn-bad" onclick="submitReviewVote('bad_gabc')" title="Mauvais chant">
            <span class="decision-label">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              Mauvais
            </span>
            <span class="decision-xp">+10 XP</span>
          </button>
        </div>

        <!-- Ligne d'actions secondaires : Passer & Remarque -->
        <div class="utility-actions-row">
          <button type="button" class="btn-utility btn-skip-prominent" onclick="closeReviewModal()">
            <span>Fermer / Passer</span>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
          <button type="button" class="btn-utility btn-comment-trigger" onclick="toggleReviewComment()">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            <span>Remarque</span>
          </button>
        </div>

        <!-- Zone de saisie d'une remarque (dépliable) -->
        <div class="decision-comment-view" id="modalCommentView" style="display:none;">
          <textarea id="modalCommentInput" class="inline-comment-textarea" placeholder="Précisez un décalage, mot incorrect ou problème audio..."></textarea>
          <div class="comment-actions-row">
            <button type="button" class="btn-comment-cancel" onclick="toggleReviewComment(false)">Annuler</button>
            <button type="button" class="btn-comment-submit" onclick="submitReviewWithComment()">
              <span>Envoyer la remarque</span>
            </button>
          </div>
        </div>
      </div>
    </div>

  </div>

  <script>
    // Configuration & Benchmarks transmis par le serveur
    const BENCHMARKS = ${JSON.stringify(benchmarks)};
    
    // Rangs Monastiques Oremus (Numération romaine monastique sans émojis)
    const MONK_RANKS = [
      { level: 1, title: "Novice du Chœur", latin: "Novicius", minXp: 0, icon: "I" },
      { level: 2, title: "Scribe du Chapitre", latin: "Scriptor", minXp: 100, icon: "II" },
      { level: 3, title: "Enlumineur Sacré", latin: "Illuminator", minXp: 250, icon: "III" },
      { level: 4, title: "Cantor du Lutrin", latin: "Cantor", minXp: 450, icon: "IV" },
      { level: 5, title: "Succenteur de Chœur", latin: "Succentor", minXp: 700, icon: "V" },
      { level: 6, title: "Maître de Chapelle", latin: "Magister Chori", minXp: 1000, icon: "VI" },
      { level: 7, title: "Prieur du Scriptorium", latin: "Prior", minXp: 1350, icon: "VII" },
      { level: 8, title: "Abbé Bénédictin", latin: "Abbas", minXp: 1700, icon: "VIII" },
      { level: 9, title: "Cardinal Préfet", latin: "Cardinalis", minXp: 2100, icon: "IX" },
      { level: 10, title: "Pape Saint Grégoire", latin: "Pontifex Maximus", minXp: 2600, icon: "X" }
    ];

    // State Local
    let userGamification = { xp: 0, level: 1, streak: 0 };
    let currentDurationMins = 30;
    let currentHardware = 'cuda';
    let currentReviewPieceId = null;
    let currentModalScore = null;
    let currentModalGabc = '';

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
      document.getElementById('headerStreak').textContent = \`Série : \${userGamification.streak}\`;
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

      const plannerInput = document.getElementById('plannerWorkerInput');
      const filterInput = document.getElementById('filterWorkerInput');
      const pseudo = (plannerInput ? plannerInput.value.trim() : '') ||
                     (filterInput ? filterInput.value.trim() : '') ||
                     localStorage.getItem('oremus_worker_name') || '';
      const durArg = currentDurationMins > 0 ? \` --duration \${currentDurationMins}\` : '';
      const origin = window.location.origin;

      // Commandes dynamiques avec pseudo obligatoire pour compter les points
      let winCode = '';
      let unixCode = '';
      let pyCode = '';

      if (pseudo) {
        winCode = \`$env:WORKER_NAME="\${pseudo}"; irm \${origin}/run.ps1 | iex\`;
        unixCode = \`WORKER_NAME="\${pseudo}" curl -fsSL \${origin}/run.sh | bash\`;
        pyCode = \`curl -fsSL \${origin}/worker.py | python3 - --name "\${pseudo}"\${durArg}\`;
      } else {
        winCode = \`irm \${origin}/run.ps1 | iex\`;
        unixCode = \`curl -fsSL \${origin}/run.sh | bash\`;
        pyCode = \`curl -fsSL \${origin}/worker.py | python3 -\`;
      }

      const elWin = document.getElementById('cliCmdWindows');
      const elUnix = document.getElementById('cliCmdUnix');
      const elPy = document.getElementById('cliCmdPython');
      if (elWin) elWin.textContent = winCode;
      if (elUnix) elUnix.textContent = unixCode;
      if (elPy) elPy.textContent = pyCode;
    }

    window.switchCliTab = function(os) {
      document.querySelectorAll('.cli-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.os === os));
      document.getElementById('cliPanelWindows').style.display = os === 'windows' ? 'block' : 'none';
      document.getElementById('cliPanelUnix').style.display = os === 'unix' ? 'block' : 'none';
      document.getElementById('cliPanelPython').style.display = os === 'python' ? 'block' : 'none';
    };

    window.copyCliCommand = function(elemId, btn) {
      const plannerInput = document.getElementById('plannerWorkerInput');
      const filterInput = document.getElementById('filterWorkerInput');
      const pseudo = (plannerInput ? plannerInput.value.trim() : '') ||
                     (filterInput ? filterInput.value.trim() : '') ||
                     localStorage.getItem('oremus_worker_name') || '';
      
      // Imposer la saisie du nom avant de pouvoir copier la commande
      if (!pseudo) {
        if (plannerInput) {
          plannerInput.focus();
          plannerInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
          plannerInput.style.borderColor = 'var(--primary-color)';
          plannerInput.style.boxShadow = '0 0 12px rgba(201, 107, 99, 0.4)';
          setTimeout(() => {
            plannerInput.style.borderColor = 'rgba(196,152,79,0.4)';
            plannerInput.style.boxShadow = 'none';
          }, 2000);
        }
        awardUserXp(0, 'Saisissez votre prénom ou pseudo pour compter vos points');
        return;
      }

      const codeElem = document.getElementById(elemId);
      if (!codeElem) return;
      const text = codeElem.textContent.trim();
      navigator.clipboard.writeText(text).then(() => {
        const oldHtml = btn.innerHTML;
        btn.innerHTML = 'Copié !';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.innerHTML = oldHtml;
          btn.classList.remove('copied');
        }, 1800);
      }).catch(() => {
        prompt('Copiez la commande ci-dessous (Ctrl+C) :', text);
      });
    };

    // 3. User Filter & Batch View (Priorité absolue aux pièces de l'utilisateur)
    function setupUserFilter() {
      const filterInput = document.getElementById('filterWorkerInput');
      const plannerInput = document.getElementById('plannerWorkerInput');
      const urlParams = new URLSearchParams(window.location.search);
      const paramUser = urlParams.get('worker') || urlParams.get('name') || '';
      const savedUser = paramUser || localStorage.getItem('oremus_worker_name') || '';

      if (savedUser) {
        if (filterInput) filterInput.value = savedUser;
        if (plannerInput) plannerInput.value = savedUser;
        localStorage.setItem('oremus_worker_name', savedUser);
      }

      function syncName(val) {
        localStorage.setItem('oremus_worker_name', val);
        if (filterInput && filterInput.value !== val) filterInput.value = val;
        if (plannerInput && plannerInput.value !== val) plannerInput.value = val;
        updateEstimator();
        fetchWorkerBatch(val);
      }

      if (plannerInput) {
        plannerInput.addEventListener('input', () => syncName(plannerInput.value.trim()));
      }
      if (filterInput) {
        filterInput.addEventListener('input', () => syncName(filterInput.value.trim()));
      }
      const refreshBtn = document.getElementById('btnRefreshBatch');
      if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
          fetchWorkerBatch(filterInput ? filterInput.value.trim() : '');
        });
      }
    }

    async function fetchWorkerBatch(workerName) {
      const grid = document.getElementById('piecesGrid');
      grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding:18px; color:var(--text-secondary); font-size:0.88rem;">Mise à jour de vos pièces récentes...</div>';
      
      try {
        const url = workerName ? \`/api/jobs/worker/\${encodeURIComponent(workerName)}/pieces\` : '/api/jobs/worker/pieces';
        const res = await fetch(url);
        const data = await res.json();
        
        let pieces = data.pieces || [];

        if (pieces.length === 0) {
          grid.innerHTML = \`
            <div style="grid-column: 1/-1; text-align:center; padding:24px; color:var(--text-tertiary); font-size:0.88rem;">
              Aucune pièce récemment calculée trouvée pour "<strong>\${workerName || 'tous'}</strong>".<br>
              Lancez le worker pour voir vos premiers chants apparaître ici !
            </div>\`;
          return;
        }

        const userPieces = pieces.filter(p => p.is_user_piece);
        let bannerHtml = '';

        if (userPieces.length > 0) {
          bannerHtml = \`
            <div style="grid-column: 1/-1; padding:10px 14px; border-radius:10px; background:rgba(196,152,79,0.1); font-size:0.84rem; color:var(--gold-sacred); margin-bottom:4px;">
              ✦ <strong>\${userPieces.length}</strong> partition(s) calculée(s) par vous (\${workerName}) placée(s) en tête de liste pour votre relecture.
            </div>\`;
        } else if (workerName) {
          bannerHtml = \`
            <div style="grid-column: 1/-1; padding:10px 14px; border-radius:10px; background:rgba(255,255,255,0.03); font-size:0.84rem; color:var(--text-secondary); margin-bottom:4px;">
              ✦ Aucune partition encore calculée par "\${workerName}". Voici les partitions de la communauté prêtes à être vérifiées :
            </div>\`;
        }

        grid.innerHTML = bannerHtml + pieces.map(p => \`
          <div class="piece-card \${p.is_user_piece ? 'is-user-card' : ''}">
            <div>
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; gap:6px;">
                <span style="font-size:0.75rem; color:var(--gold-sacred); font-weight:700; text-transform:uppercase;">\${p.part || 'Chant'}</span>
                \${p.is_user_piece 
                  ? '<span class="badge-user-piece">✦ Votre alignement</span>' 
                  : \`<span class="badge-other-piece">\${p.worker_id || 'Ami'}</span>\`}
              </div>
              <div class="piece-title">\${p.incipit || p.piece_id}</div>
              <div class="piece-meta" style="margin-top:6px;">
                <span>\${p.notes_count} notes</span>
                <span>\${p.compute_time_sec ? p.compute_time_sec + 's' : ''}</span>
              </div>
            </div>
            <button type="button" class="btn-review-card" onclick="openReviewModal('\${p.piece_id}')">
              Examiner & Réviser
            </button>
          </div>
        \`).join('');

      } catch(e) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding:18px; color:var(--primary-color);">Erreur lors de la récupération des pièces.</div>';
      }
    }

    // 4. Rendu Grégorien Exsurge & Modal de Revue Directe
    function preprocessGabcForExsurge(gabc) {
      if (!gabc) return '';
      gabc = gabc.replace(/<sp>['’]<\\/sp>/g, "'");
      gabc = gabc.replace(/<v>\\\\([VRA])bar<\\/v>/gi, function(m, b) { return b.toUpperCase() + '/.'; })
                 .replace(/<sp>([VRA])\\/?<\\/sp>\\.?/gi, function(m, b) { return b.toUpperCase() + '/.'; });
      gabc = gabc.replace(/(^|\\s|\\))<i>\\s*(Ps\\.?|Psalmus)\\s*<\\/i>/gi, '$1<c><i>Ps.</i></c>');
      gabc = gabc.replace(/(^|\\s|\\))(Ps\\.)(?=\\s+[A-ZÁÉÍÓÚ])/g, '$1<c><i>Ps.</i></c>');
      gabc = gabc.replace(/(^|\\s|\\))<i>\\s*([V℣]\\.?|Versus)\\s*<\\/i>/gi, '$1<c><i>℣.</i></c>');
      gabc = gabc.replace(/(^|\\s|\\))(V\\/\\.?)(?=\\s*[0-9A-ZÁÉÍÓÚ(])/g, '$1<c><i>℣.</i></c>');
      gabc = gabc.replace(/(^|\\s|\\))<i>\\s*([R℟]\\.?|Responsorium)\\s*<\\/i>/gi, '$1<c><i>℟.</i></c>');
      gabc = gabc.replace(/(^|\\s|\\))(R\\/\\.?)(?=\\s*[0-9A-ZÁÉÍÓÚ(])/g, '$1<c><i>℟.</i></c>');
      return gabc;
    }

    let modalYtPlayer = null;
    let modalPlaybackInterval = null;
    let currentModalPiece = null;
    let currentModalChantInfo = null;
    let modalActiveNoteIndex = -1;
    let modalActiveNoteEl = null;
    let modalActiveLyricEl = null;

    function _getChantInfo(score) {
      if (!score || !score.notations) return null;
      var allNotes = [].concat.apply([], score.notations.map(function(n){ return n.notes || []; }))
                              .filter(function(n){ return n && !n.isAccidental; });
      return { allNotes: allNotes, score: score };
    }

    function initModalPlayer(videoId) {
      if (modalPlaybackInterval) {
        clearInterval(modalPlaybackInterval);
        modalPlaybackInterval = null;
      }
      if (modalYtPlayer && typeof modalYtPlayer.destroy === 'function') {
        try { modalYtPlayer.destroy(); } catch(e) {}
        modalYtPlayer = null;
      }

      const container = document.getElementById('modalVideoContainer');
      if (!container) return;
      
      if (!videoId) {
        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-tertiary);font-size:13px;">Aucune piste vidéo disponible</div>';
        return;
      }

      const originParam = (window.location.protocol === 'http:' || window.location.protocol === 'https:')
        ? ('&origin=' + encodeURIComponent(window.location.origin))
        : '';
      const embedUrl = 'https://www.youtube-nocookie.com/embed/' + videoId + '?enablejsapi=1&autoplay=0&controls=1&modestbranding=1&rel=0&playsinline=1' + originParam;
      container.innerHTML = '<iframe id="modalVideoFrame" src="' + embedUrl + '" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="position:absolute; top:0; left:0; width:100%; height:100%; border:none;"></iframe>';

      function attach() {
        if (!window.YT || !window.YT.Player) {
          setTimeout(attach, 100);
          return;
        }
        try {
          modalYtPlayer = new YT.Player('modalVideoFrame', {
            events: {
              onReady: function() {
                updateModalPlayPauseState(false);
                startModalSyncTracker();
              },
              onStateChange: function(event) {
                if (event.data === YT.PlayerState.PLAYING) {
                  updateModalPlayPauseState(true);
                  startModalSyncTracker();
                } else {
                  updateModalPlayPauseState(false);
                }
              }
            }
          });
        } catch(err) {
          console.warn('YT.Player attach warning:', err);
        }
      }
      attach();
    }

    window.toggleModalPlayPause = function() {
      if (!modalYtPlayer || typeof modalYtPlayer.getPlayerState !== 'function') return;
      try {
        const state = modalYtPlayer.getPlayerState();
        if (state === YT.PlayerState.PLAYING) {
          modalYtPlayer.pauseVideo();
        } else {
          modalYtPlayer.playVideo();
        }
      } catch(e) {}
    };

    function updateModalPlayPauseState(isPlaying) {
      const iconPlay = document.getElementById('modalIconPlay');
      const iconPause = document.getElementById('modalIconPause');
      const label = document.getElementById('modalPlayText');
      if (iconPlay && iconPause) {
        iconPlay.style.display = isPlaying ? 'none' : 'block';
        iconPause.style.display = isPlaying ? 'block' : 'none';
      }
      if (label) {
        label.textContent = isPlaying ? 'Pause' : 'Lecture';
      }
    }

    window.seekModalRelative = function(sec) {
      if (!modalYtPlayer || typeof modalYtPlayer.getCurrentTime !== 'function') return;
      try {
        const cur = modalYtPlayer.getCurrentTime();
        modalYtPlayer.seekTo(Math.max(0, cur + sec), true);
      } catch(e) {}
    };

    function seekModalPlayer(sec) {
      if (!modalYtPlayer || typeof modalYtPlayer.seekTo !== 'function') return;
      try {
        modalYtPlayer.seekTo(Math.max(0, sec), true);
      } catch(e) {}
    }

    function startModalSyncTracker() {
      if (modalPlaybackInterval) clearInterval(modalPlaybackInterval);
      modalPlaybackInterval = setInterval(function() {
        if (!modalYtPlayer || typeof modalYtPlayer.getCurrentTime !== 'function') return;
        try {
          const cur = modalYtPlayer.getCurrentTime();
          if (typeof cur === 'number' && !isNaN(cur)) {
            syncModalActiveNote(cur);
            const dur = (typeof modalYtPlayer.getDuration === 'function') ? modalYtPlayer.getDuration() : 0;
            const timeEl = document.getElementById('modalTimeDisplay');
            if (timeEl && dur > 0) {
              const fmt = (s) => Math.floor(s / 60) + ':' + ('0' + Math.floor(s % 60)).slice(-2);
              timeEl.textContent = fmt(cur) + ' / ' + fmt(dur);
            }
          }
        } catch(e) {}
      }, 80);
    }

    function syncModalActiveNote(cur) {
      if (!currentModalPiece || !currentModalPiece.timestamps || !currentModalPiece.timestamps.length) return;
      const stamps = currentModalPiece.timestamps;
      var noteIdx = -1;

      for (var k = 0; k < stamps.length; k++) {
        var curNote = stamps[k];
        if (curNote.start === null || curNote.start === undefined) continue;
        var nxtTime = (k + 1 < stamps.length && stamps[k + 1].start !== undefined) ? stamps[k + 1].start : (curNote.end || curNote.start + 1.2);
        if (cur >= curNote.start && cur < nxtTime) {
          noteIdx = k;
          break;
        }
      }
      if (noteIdx === -1 && stamps.length > 0 && cur >= stamps[stamps.length - 1].start) {
        noteIdx = stamps.length - 1;
      }
      if (noteIdx >= 0 && noteIdx !== modalActiveNoteIndex) {
        highlightModalNote(noteIdx);
      }
    }

    function highlightModalNote(idx) {
      if (!currentModalChantInfo || !currentModalChantInfo.allNotes || !currentModalChantInfo.allNotes.length) return;
      if (idx < 0 || idx >= currentModalChantInfo.allNotes.length) return;
      if (idx === modalActiveNoteIndex && modalActiveNoteEl && modalActiveNoteEl.classList.contains('active')) return;

      modalActiveNoteIndex = idx;
      const note = currentModalChantInfo.allNotes[idx];
      const accentColor = '#c96b63';

      if (modalActiveNoteEl) {
        modalActiveNoteEl.classList.remove('active', 'active-note-highlight');
        modalActiveNoteEl.style.removeProperty('fill');
        modalActiveNoteEl = null;
      }
      if (modalActiveLyricEl) {
        modalActiveLyricEl.classList.remove('active');
        modalActiveLyricEl.style.removeProperty('fill');
        modalActiveLyricEl.style.removeProperty('color');
        if (modalActiveLyricEl.querySelectorAll) {
          modalActiveLyricEl.querySelectorAll('tspan').forEach(ts => {
            ts.classList.remove('active');
            ts.style.removeProperty('fill');
            ts.style.removeProperty('color');
          });
        }
        modalActiveLyricEl = null;
      }

      if (note && note.svgNode) {
        modalActiveNoteEl = note.svgNode;
        modalActiveNoteEl.classList.add('active', 'active-note-highlight');
        modalActiveNoteEl.style.setProperty('fill', accentColor, 'important');
      }
      if (note && note.neume && note.neume.lyrics && note.neume.lyrics.length > 0) {
        const l = note.neume.lyrics[0];
        if (l && l.svgNode) {
          modalActiveLyricEl = l.svgNode;
          modalActiveLyricEl.classList.add('active');
          modalActiveLyricEl.style.setProperty('fill', accentColor, 'important');
          modalActiveLyricEl.style.setProperty('color', accentColor, 'important');
          if (modalActiveLyricEl.querySelectorAll) {
            modalActiveLyricEl.querySelectorAll('tspan').forEach(ts => {
              ts.classList.add('active');
              ts.style.setProperty('fill', accentColor, 'important');
              ts.style.setProperty('color', accentColor, 'important');
            });
          }
        }
      }

      // Défilement automatique fluide vers le neume actif
      const slot = document.getElementById('modalScoreSlot');
      if (modalActiveNoteEl && slot) {
        const noteRect = modalActiveNoteEl.getBoundingClientRect();
        const slotRect = slot.getBoundingClientRect();
        if (noteRect.top < slotRect.top + 20 || noteRect.bottom > slotRect.bottom - 20) {
          modalActiveNoteEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }

    function setupModalScoreClicks(svg, info) {
      if (!svg || !info) return;
      svg.addEventListener('click', function(e) {
        var target = e.target;
        var targetIndex = -1;

        var indexedEl = target.closest ? target.closest('[data-note-index]') : null;
        if (indexedEl) {
          var parsed = parseInt(indexedEl.getAttribute('data-note-index'), 10);
          if (!isNaN(parsed) && parsed >= 0) targetIndex = parsed;
        }
        if (targetIndex === -1 && info.allNotes) {
          var candidate = target.closest ? (target.closest('use') || target.closest('text') || target) : target;
          if (candidate && candidate.source) {
            var sIdx = info.allNotes.indexOf(candidate.source);
            if (sIdx >= 0) targetIndex = sIdx;
          }
        }
        if (targetIndex >= 0 && currentModalPiece && currentModalPiece.timestamps && currentModalPiece.timestamps[targetIndex]) {
          const stamp = currentModalPiece.timestamps[targetIndex];
          if (stamp.start !== undefined && stamp.start !== null) {
            seekModalPlayer(stamp.start);
          }
          highlightModalNote(targetIndex);
        }
      });
    }

    function renderModalScore(gabcSrc) {
      const container = document.getElementById('modalScoreSlot');
      if (!container) return;
      currentModalGabc = gabcSrc || '';

      if (!gabcSrc) {
        container.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-tertiary); font-size:0.85rem;">Partition GABC non disponible pour cette pièce.</div>';
        return;
      }

      if (typeof exsurge === 'undefined') {
        container.innerHTML = '<div style="padding:20px; text-align:center; color:var(--status-danger); font-size:0.85rem;">Module Exsurge en cours de chargement...</div>';
        return;
      }

      try {
        const ctxt = new exsurge.ChantContext();
        const accentColor = '#c96b63';

        ctxt.textColor = '#ffffff';
        ctxt.noteColor = '#ffffff';
        ctxt.neumeLineColor = '#ffffff';
        ctxt.dividerLineColor = '#ffffff';
        ctxt.staffLineColor = 'rgba(255, 255, 255, 0.55)';

        ctxt.setFont("'Crimson Text', 'Libre Baskerville', Georgia, serif", 17.5);
        ctxt.setRubricColor(accentColor);
        ctxt.specialCharColor = accentColor;
        ctxt.rubricColor = accentColor;
        ctxt.asteriskProperties = { fill: accentColor, class: 'rubric' };
        ctxt.plusProperties = { fill: accentColor, class: 'rubric' };
        ctxt.specialCharProperties = { 'font-family': "'Exsurge Characters'", fill: accentColor, class: 'rubric' };
        ctxt.specialCharMap = { '℣': '℣', '℟': '℟', 'V': 'V', 'R': 'R', '+': '+', '*': '*' };
        ctxt.lyricTextColor = '#ffffff';
        ctxt.lyricTextFont = "'Crimson Text', 'Libre Baskerville', Georgia, serif";
        ctxt.annotationTextFont = ctxt.lyricTextFont;

        if (ctxt.textStyles) {
          Object.keys(ctxt.textStyles).forEach(function(k) {
            if (ctxt.textStyles[k]) {
              ctxt.textStyles[k].color = '#ffffff';
              ctxt.textStyles[k].font = "'Crimson Text', 'Libre Baskerville', Georgia, serif";
            }
          });
          if (ctxt.textStyles.al) {
            ctxt.textStyles.al.color = 'rgba(255, 255, 255, 0.85)';
            ctxt.textStyles.al.font = "'Crimson Text', 'Libre Baskerville', Georgia, serif";
            ctxt.textStyles.al.size = 12;
          }
        }

        const processed = preprocessGabcForExsurge(gabcSrc);
        const mappings = exsurge.Gabc.createMappingsFromSource(ctxt, processed);
        const score = new exsurge.ChantScore(ctxt, mappings, true);

        var availWidth = container.clientWidth || 700;
        if (availWidth < 340) availWidth = 340;
        ctxt.width = availWidth;

        score.performLayout(ctxt);

        score.layoutChantLines(ctxt, availWidth - 20, function() {
          container.innerHTML = '';
          const svgNode = score.createSvgNode(ctxt);
          svgNode.setAttribute('width', '100%');
          svgNode.style.width = '100%';
          svgNode.style.height = 'auto';
          svgNode.style.color = '#ffffff';
          svgNode.style.fill = '#ffffff';
          container.appendChild(svgNode);
          currentModalScore = score;
          currentModalChantInfo = _getChantInfo(score);

          if (currentModalChantInfo && currentModalChantInfo.allNotes) {
            var allUseElements = Array.from(svgNode.querySelectorAll('use'));
            allUseElements.forEach(function(u) {
              if (u.source) {
                var idx = currentModalChantInfo.allNotes.indexOf(u.source);
                if (idx >= 0) {
                  currentModalChantInfo.allNotes[idx].svgNode = u;
                  u.setAttribute('data-note-index', idx);
                  u.style.cursor = 'pointer';
                }
              }
            });

            currentModalChantInfo.allNotes.forEach(function(n, idx) {
              if (!n.svgNode) {
                var el = null;
                if (n.elementIndex !== undefined) {
                  el = svgNode.querySelector('use[element-index="' + n.elementIndex + '"]');
                }
                if (!el && n.sourceIndex !== undefined) {
                  el = svgNode.querySelector('use[source-index="' + n.sourceIndex + '"]');
                }
                if (el) {
                  n.svgNode = el;
                  el.setAttribute('data-note-index', idx);
                  el.style.cursor = 'pointer';
                }
              } else {
                n.svgNode.setAttribute('data-note-index', idx);
                n.svgNode.style.cursor = 'pointer';
              }

              if (n.neume && n.neume.lyrics) {
                n.neume.lyrics.forEach(function(l) {
                  if (l.svgNode) {
                    l.svgNode.setAttribute('data-note-index', idx);
                    l.svgNode.style.cursor = 'pointer';
                    if (l.svgNode.querySelectorAll) {
                      l.svgNode.querySelectorAll('tspan').forEach(function(ts) {
                        ts.setAttribute('data-note-index', idx);
                        ts.style.cursor = 'pointer';
                      });
                    }
                  }
                });
              }
            });

            if (score.notations) {
              score.notations.forEach(function(notat) {
                if (notat.notes && notat.notes.length > 0) {
                  var firstNote = notat.notes[0];
                  var nIdx = currentModalChantInfo.allNotes.indexOf(firstNote);
                  if (nIdx >= 0 && notat.lyrics) {
                    notat.lyrics.forEach(function(l) {
                      if (l.svgNode) {
                        l.svgNode.setAttribute('data-note-index', nIdx);
                        l.svgNode.style.cursor = 'pointer';
                        if (l.svgNode.querySelectorAll) {
                          l.svgNode.querySelectorAll('tspan').forEach(function(ts) {
                            ts.setAttribute('data-note-index', nIdx);
                            ts.style.cursor = 'pointer';
                          });
                        }
                      }
                    });
                  }
                }
              });
            }
          }

          setupModalScoreClicks(svgNode, currentModalChantInfo);
          highlightModalNote(0);
        });
      } catch (err) {
        console.error('Erreur Exsurge:', err);
        container.innerHTML = '<div style="padding:20px; color:var(--status-danger); text-align:center; font-size:0.85rem;">Erreur de rendu grégorien : ' + err.message + '</div>';
      }
    }

    window.openReviewModal = async function(pieceId) {
      currentReviewPieceId = pieceId;
      const modal = document.getElementById('reviewModal');
      modal.style.display = 'flex';

      document.getElementById('modalPieceTitle').textContent = 'Chargement de la partition...';
      const container = document.getElementById('modalVideoContainer');
      if (container) container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-tertiary);font-size:13px;">Chargement de la vidéo...</div>';
      document.getElementById('modalScoreSlot').innerHTML = '<div style="padding:24px; text-align:center; color:var(--text-tertiary); font-size:0.86rem;">Chargement des neumes grégoriens...</div>';
      document.getElementById('modalTimeDisplay').textContent = '0:00 / 0:00';
      updateModalPlayPauseState(false);

      try {
        const res = await fetch(\`/api/jobs/piece/\${encodeURIComponent(pieceId)}\`);
        const piece = await res.json();
        currentModalPiece = piece;

        document.getElementById('modalPieceTitle').textContent = piece.incipit || piece.piece_id;
        document.getElementById('modalPiecePart').textContent = piece.part || 'Liturgie';
        document.getElementById('modalPieceAuthor').textContent = \`Aligné par : \${piece.worker_id || 'Ami'}\`;
        document.getElementById('modalNotesCountBadge').textContent = \`\${piece.timestamps ? piece.timestamps.length : 0} notes synchronisées\`;

        const ytId = piece.youtube_id || (piece.youtube_url ? piece.youtube_url.split('v=')[1] : '');
        initModalPlayer(ytId);

        if (piece.gabc_src) {
          renderModalScore(piece.gabc_src);
        } else {
          document.getElementById('modalScoreSlot').innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-tertiary); font-size:0.85rem;">Partition GABC non disponible pour ce chant.</div>';
        }
      } catch(e) {
        document.getElementById('modalPieceTitle').textContent = 'Erreur de chargement';
        document.getElementById('modalScoreSlot').innerHTML = '<div style="padding:20px; text-align:center; color:var(--status-danger); font-size:0.85rem;">Impossible de charger la partition.</div>';
      }
    };

    window.closeReviewModal = function() {
      document.getElementById('reviewModal').style.display = 'none';
      if (modalPlaybackInterval) {
        clearInterval(modalPlaybackInterval);
        modalPlaybackInterval = null;
      }
      if (modalYtPlayer && typeof modalYtPlayer.destroy === 'function') {
        try { modalYtPlayer.destroy(); } catch(e) {}
        modalYtPlayer = null;
      }
      const container = document.getElementById('modalVideoContainer');
      if (container) container.innerHTML = '';
      document.getElementById('modalScoreSlot').innerHTML = '';
      currentModalScore = null;
      currentModalChantInfo = null;
      currentModalPiece = null;
      currentModalGabc = '';
      modalActiveNoteIndex = -1;
      modalActiveNoteEl = null;
      modalActiveLyricEl = null;
      toggleReviewComment(false);
      currentReviewPieceId = null;
    };

    // Raccourcis clavier identiques au Laboratoire d'Alignement
    window.addEventListener('keydown', function(e) {
      const modal = document.getElementById('reviewModal');
      if (!modal || modal.style.display !== 'flex') return;

      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        if (e.key === 'Escape') {
          e.preventDefault();
          toggleReviewComment(false);
          e.target.blur();
        } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          submitReviewWithComment();
        }
        return;
      }

      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        toggleModalPlayPause();
      } else if (e.key === '1' || e.key === 'ArrowRight') {
        e.preventDefault();
        submitReviewVote('approved');
      } else if (e.key === '2' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        submitReviewVote('rejected');
      } else if (e.key === '3' || e.key === 'ArrowLeft') {
        e.preventDefault();
        submitReviewVote('bad_gabc');
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        toggleReviewComment();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeReviewModal();
      } else if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        seekModalRelative(-3);
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        seekModalRelative(3);
      }
    });

    window.handleBackdropClick = function(e) {
      if (e.target === document.getElementById('reviewModal')) {
        closeReviewModal();
      }
    };

    window.toggleReviewComment = function(show) {
      const view = document.getElementById('modalCommentView');
      const input = document.getElementById('modalCommentInput');
      if (typeof show === 'boolean') {
        view.style.display = show ? 'flex' : 'none';
      } else {
        view.style.display = view.style.display === 'none' ? 'flex' : 'none';
      }
      if (view.style.display === 'flex') {
        input.focus();
      } else {
        input.value = '';
      }
    };

    window.submitReviewWithComment = function() {
      const comment = (document.getElementById('modalCommentInput').value || '').trim();
      submitReviewVote('commented', comment || 'Remarque utilisateur');
    };

    window.submitReviewVote = async function(status, customComment) {
      if (!currentReviewPieceId) return;
      
      const payload = {
        piece_id: currentReviewPieceId,
        status: status,
        comment: customComment || 'Relecture directe via portail worker',
        author: document.getElementById('filterWorkerInput').value.trim() || 'Ami-Reviewer'
      };

      try {
        const res = await fetch('/api/review', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        
        if (res.ok) {
          awardUserXp(10, 'Relecture');
          closeReviewModal();
          const pseudo = document.getElementById('filterWorkerInput').value.trim();
          fetchWorkerBatch(pseudo);
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

  // 3b. Fichiers CLI & ressources statiques (run.sh, run.ps1, worker.py, requirements.txt, exsurge.min.js)
  const CLI_FILES = {
    '/run.sh':            { name: 'run.sh',            mime: 'text/x-shellscript; charset=utf-8' },
    '/run.ps1':           { name: 'run.ps1',           mime: 'text/plain; charset=utf-8' },
    '/worker.py':         { name: 'worker.py',         mime: 'text/x-python; charset=utf-8' },
    '/requirements.txt':  { name: 'requirements.txt',  mime: 'text/plain; charset=utf-8' },
    '/exsurge.min.js':    { name: 'exsurge.min.js',    mime: 'application/javascript; charset=utf-8' },
  };
  if ((req.method === 'GET' || req.method === 'HEAD') && CLI_FILES[pathname]) {
    const { name, mime } = CLI_FILES[pathname];
    const filePath = path.join(PUBLIC_DIR, name);
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      res.writeHead(200, {
        ...CORS_HEADERS,
        'Content-Type': mime,
        'Content-Length': stat.size,
        'Content-Disposition': `attachment; filename="${name}"`,
      });
      return req.method === 'HEAD' ? res.end() : fs.createReadStream(filePath).pipe(res);
    } else {
      return sendJson(res, 404, { error: `Fichier ${name} non trouvé dans public/.` });
    }
  }

  // 3c. API : File d'alignements pour l'App ordonnée par intérêt liturgique (/api/alignments/queue)
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

  // 7. API : Attribution de la prochaine tâche au worker (Claim - Nom obligatoire pour compter les points)
  if (req.method === 'GET' && (pathname === '/api/jobs/claim' || pathname === '/api/jobs/next')) {
    const rawWorkerId = reqUrl.searchParams.get('worker_id') || reqUrl.searchParams.get('worker') || '';
    const workerId = rawWorkerId.trim();
    if (!workerId || workerId.toLowerCase() === 'ami-anonyme' || workerId.toLowerCase() === 'anonyme' || workerId.toLowerCase() === 'ami') {
      return sendJson(res, 400, {
        ok: false,
        error: 'Nom ou pseudo de contributeur obligatoire pour réclamer une partition et compter vos points.'
      });
    }
    const job = claimNextTask(workerId);
    if (job) {
      return sendJson(res, 200, { ok: true, job });
    } else {
      return sendJson(res, 200, { ok: true, job: null, message: 'Toutes les pièces sont actuellement alignées ou en cours !' });
    }
  }

  // 8. API : Soumission du résultat calculé par le worker (Submit - Nom obligatoire pour compter les points)
  if (req.method === 'POST' && pathname === '/api/jobs/submit') {
    try {
      const data = await parseBody(req);
      const rawWorkerId = data.worker_id || data.worker || '';
      const workerId = rawWorkerId.trim();
      if (!workerId || workerId.toLowerCase() === 'ami-anonyme' || workerId.toLowerCase() === 'anonyme' || workerId.toLowerCase() === 'ami') {
        return sendJson(res, 400, {
          success: false,
          error: 'Nom ou pseudo de contributeur obligatoire pour soumettre un calcul et comptabiliser vos points.'
        });
      }
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

  // 10b. API Admin : Purge des alignements recents (POST /api/admin/purge-recent)
  // Header requis : X-Admin-Key: <valeur de API_KEY> ou X-Admin-Key: oremus-purge-liturgique
  if (req.method === 'POST' && pathname === '/api/admin/purge-recent') {
    const adminKey = req.headers['x-admin-key'] || '';
    const FALLBACK_ADMIN_KEY = 'oremus-purge-liturgique';
    const validKey = API_KEY ? adminKey === API_KEY : adminKey === FALLBACK_ADMIN_KEY;
    if (!validKey) {
      return sendJson(res, 401, { error: 'Cle admin invalide ou absente (header X-Admin-Key requis).' });
    }
    try {
      const body = await parseBody(req);
      const hours = parseFloat(body.hours || '24');
      const cutoffMs = Date.now() - hours * 3600 * 1000;

      const seeds = loadSeedAlignments();
      const seedIds = new Set(Object.keys(seeds).map(k => String(seeds[k].piece_id || k)));

      const purgedIds = [];
      const tasks = loadTasks();

      if (fs.existsSync(ALIGNMENTS_DIR)) {
        const files = fs.readdirSync(ALIGNMENTS_DIR).filter(f => f.endsWith('.json'));
        for (const filename of files) {
          const filepath = path.join(ALIGNMENTS_DIR, filename);
          const pieceId = filename.replace('.json', '');
          if (seedIds.has(pieceId)) continue;

          let fileCompletedAt = fs.statSync(filepath).mtimeMs;
          try {
            const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
            if (data.completed_at) fileCompletedAt = new Date(data.completed_at).getTime();
          } catch (e) {}

          if (fileCompletedAt < cutoffMs) continue;

          purgedIds.push(pieceId);
          fs.unlinkSync(filepath);
        }
      }

      let resetCount = 0;
      for (const task of tasks) {
        if (purgedIds.includes(String(task.id))) {
          task.status = 'pending';
          task.worker_id = null;
          task.claimed_at = null;
          task.completed_at = null;
          task.error = null;
          resetCount++;
        }
      }
      if (resetCount > 0) saveTasks();

      console.log(`[ADMIN] Purge ${hours}h : ${purgedIds.length} alignements supprimes, ${resetCount} taches remises a pending.`);
      return sendJson(res, 200, {
        success: true,
        purged_count: purgedIds.length,
        reset_count: resetCount,
        purged_ids: purgedIds,
        cutoff_iso: new Date(cutoffMs).toISOString()
      });
    } catch (err) {
      return sendJson(res, 500, { success: false, error: err.message });
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
  console.log(`✦ Oremus Coolify Server actif sur http://${HOST}:${PORT}`);
  console.log(`✦ Repertoire de donnees : ${DATA_DIR}`);
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
