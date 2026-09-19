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


function normalizeWorkerKey(name) {
  return String(name || '')
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function displayNameFor(key, fallback) {
  const workers = workersCache || {};
  for (const [k, v] of Object.entries(workers)) {
    if (normalizeWorkerKey(k) === key) return (v && v.display_name) || k;
  }
  return fallback;
}

function getValidatedDemoPieces() {
  const seeds = loadSeedAlignments();
  // Pieces validees via l'API, alignees par l'Atelier-Chantres (famille Dextera).
  // Remplace l'ancienne demo (264/8/14262) signalee comme mal alignee.
  const demoIds = ['16335', 'of-dextera_domini-alleluia', 'al-dextera_dei'];
  const modeById = { '16335': '2', 'of-dextera_domini-alleluia': '2', 'al-dextera_dei': '4' };
  const out = {};
  for (const pid of demoIds) {
    const p = seeds[pid];
    if (p && Array.isArray(p.timestamps) && p.timestamps.length > 0) {
      out[pid] = {
        piece_id: p.piece_id || pid,
        incipit: p.incipit,
        part: p.part || 'Liturgie',
        youtube_id: p.youtube_id,
        gabc_src: p.gabc_src,
        timestamps: p.timestamps || [],
        notes_count: (p.timestamps || []).length,
        audio_duration_sec: p.audio_duration_sec || 75.8,
        mode: p.mode || modeById[pid] || '2',
        worker_id: p.worker_id || 'Atelier-Chantres',
        validated_via: 'api'
      };
    }
  }
  return out;
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
  if (uniqueSeedPieces.size > 0 && !findWorkerKey(workersCache, 'Atelier-Chantres')) {
    workersCache['Atelier-Chantres'] = {
      count: uniqueSeedPieces.size,
      xp: uniqueSeedPieces.size * 25,
      review_count: 0,
      review_xp: 0,
      last_active: '2026-09-15T12:00:00.000Z',
      device: 'Meta MMS_FA (Curated)',
      display_name: 'Atelier-Chantres'
    };
  }

  rebuildWorkersFromTasks();

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

function xpForLevel(xp) { return 1 + Math.floor((xp || 0) / 100); }

function findWorkerKey(workers, name) {
  const target = normalizeWorkerKey(name);
  for (const k of Object.keys(workers)) {
    if (normalizeWorkerKey(k) === target) return k;
  }
  return null;
}

function ensureWorkerEntry(workers, displayName) {
  const clean = String(displayName || '').normalize('NFC').trim().replace(/\s+/g, ' ');
  let key = findWorkerKey(workers, clean);
  if (!key) {
    key = clean;
    workers[key] = { count: 0, xp: 0, review_count: 0, review_xp: 0, last_active: null, device: 'CPU', display_name: clean };
  }
  const entry = workers[key];
  // Preserve le plus bel affichage (ex: "Pierre-Albéric Théobald" plutot que "pierre-alberic theobald")
  if (clean && clean !== entry.display_name) {
    const hasUpper = /[A-ZÀ-Þ]/.test(clean);
    const curHasUpper = /[A-ZÀ-Þ]/.test(entry.display_name || '');
    if (hasUpper && !curHasUpper) entry.display_name = clean;
    else if (!entry.display_name) entry.display_name = clean;
  }
  if (typeof entry.xp !== 'number') entry.xp = (entry.count || 0) * 25 + (entry.review_xp || 0);
  if (typeof entry.review_xp !== 'number') entry.review_xp = 0;
  if (typeof entry.review_count !== 'number') entry.review_count = 0;
  return key;
}

function rebuildWorkersFromTasks() {
  if (!workersCache) workersCache = {};
  // Fusion des doublons (accents / casse / espaces) vers une cle canonique
  const merged = {};
  for (const [k, v] of Object.entries(workersCache)) {
    const nk = normalizeWorkerKey(k);
    let dest = null;
    for (const mk of Object.keys(merged)) {
      if (normalizeWorkerKey(mk) === nk) { dest = mk; break; }
    }
    if (!dest) {
      merged[k] = { ...v, display_name: v.display_name || k };
    } else {
      merged[dest].count = (merged[dest].count || 0) + (v.count || 0);
      merged[dest].xp = (merged[dest].xp || 0) + (v.xp || (v.count || 0) * 25);
      merged[dest].review_count = (merged[dest].review_count || 0) + (v.review_count || 0);
      merged[dest].review_xp = (merged[dest].review_xp || 0) + (v.review_xp || 0);
      if (v.last_active && (!merged[dest].last_active || v.last_active > merged[dest].last_active)) {
        merged[dest].last_active = v.last_active;
        if (v.device) merged[dest].device = v.device;
      }
    }
  }
  workersCache = merged;

  // Recomptage depuis tasks.json + alignements disque (repare les purges / pertes workers.json).
  // Ne diminue jamais un compteur existant : on prend le max (corrige le cas "8 vs 71").
  try {
    const counts = {};
    const lastActive = {};
    const devices = {};
    const displayNames = {};
    if (Array.isArray(tasksCache)) {
      for (const t of tasksCache) {
        if (t.status === 'completed' && t.worker_id) {
          const nk = normalizeWorkerKey(t.worker_id);
          if (!nk || nk === 'ami-anonyme' || nk === 'anonyme' || nk === 'ami') continue;
          counts[nk] = (counts[nk] || 0) + 1;
          displayNames[nk] = String(t.worker_id).normalize('NFC').trim().replace(/\s+/g, ' ');
          if (t.completed_at && (!lastActive[nk] || String(t.completed_at) > String(lastActive[nk]))) lastActive[nk] = t.completed_at;
        }
      }
    }
    if (fs.existsSync(ALIGNMENTS_DIR)) {
      for (const f of fs.readdirSync(ALIGNMENTS_DIR).filter(ff => ff.endsWith('.json'))) {
        try {
          const item = JSON.parse(fs.readFileSync(path.join(ALIGNMENTS_DIR, f), 'utf8'));
          if (item.worker_id) {
            const nk = normalizeWorkerKey(item.worker_id);
            // Compte disque seulement si la tache correspondante n'est plus completed (evite double compte)
            const pid = String(item.piece_id || f.replace('.json', ''));
            const task = Array.isArray(tasksCache) ? tasksCache.find(tt => String(tt.id) === pid) : null;
            if (!task || task.status !== 'completed') {
              counts[nk] = (counts[nk] || 0) + 1;
              displayNames[nk] = displayNames[nk] || String(item.worker_id).normalize('NFC').trim().replace(/\s+/g, ' ');
              if (item.completed_at && (!lastActive[nk] || String(item.completed_at) > String(lastActive[nk]))) lastActive[nk] = item.completed_at;
              if (item.compute_device) devices[nk] = item.compute_device;
            } else if (item.compute_device) {
              devices[nk] = devices[nk] || item.compute_device;
            }
          }
        } catch (e) {}
      }
    }
    for (const [nk, c] of Object.entries(counts)) {
      let key = findWorkerKey(workersCache, nk);
      if (!key) {
        key = displayNames[nk] || nk;
        workersCache[key] = { count: 0, xp: 0, review_count: 0, review_xp: 0, last_active: null, device: devices[nk] || 'CPU', display_name: displayNames[nk] || key };
      }
      const entry = workersCache[key];
      if ((entry.count || 0) < c) {
        // Preserve review_xp, recalcule xp = calculs*25 + reviews
        entry.count = c;
        entry.xp = c * 25 + (entry.review_xp || 0);
      }
      if (lastActive[nk] && (!entry.last_active || String(lastActive[nk]) > String(entry.last_active))) entry.last_active = lastActive[nk];
      if (devices[nk] && !entry.device) entry.device = devices[nk];
      if (displayNames[nk] && !entry.display_name) entry.display_name = displayNames[nk];
    }
  } catch (e) {}
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

  const cleanWorker = String(workerId || '').normalize('NFC').trim().replace(/\s+/g, ' ') || 'Ami-Anonyme';
  task.status = 'claimed';
  task.worker_id = cleanWorker;
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
  const workerId = String(result.worker_id || '').normalize('NFC').trim().replace(/\s+/g, ' ');
  if (!workerId || normalizeWorkerKey(workerId) === 'ami-anonyme' || normalizeWorkerKey(workerId) === 'anonyme' || normalizeWorkerKey(workerId) === 'ami') {
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

    // Mise à jour des statistiques du worker (+25 XP par chant calcule)
    const workers = loadWorkers();
    const wkey = ensureWorkerEntry(workers, workerId);
    workers[wkey].count += 1;
    workers[wkey].xp = (workers[wkey].xp || 0) + 25;
    workers[wkey].last_active = new Date(now).toISOString();
    if (result.compute_device) workers[wkey].device = result.compute_device;
    saveWorkers();

    saveTasks();
    return { success: true, piece_id: pieceId, worker_total: workers[wkey].count, xp: workers[wkey].xp, level: xpForLevel(workers[wkey].xp) };

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
    .map(([name, data]) => ({
      name: data.display_name || name,
      count: data.count || 0,
      xp: typeof data.xp === 'number' ? data.xp : (data.count || 0) * 25 + (data.review_xp || 0),
      level: xpForLevel(typeof data.xp === 'number' ? data.xp : (data.count || 0) * 25 + (data.review_xp || 0)),
      review_count: data.review_count || 0,
      last_active: data.last_active,
      device: data.device
    }))
    .sort((a, b) => (b.xp - a.xp) || (b.count - a.count));

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
    const targetWorker = normalizeWorkerKey(workerId);
    const seenPieceIds = new Set();

    const isTarget = (w) => targetWorker && targetWorker !== 'all' && normalizeWorkerKey(w).includes(targetWorker);

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
  <title>Oremus — Calcul Distribué Liturgique</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Crimson+Text:ital,wght@0,400;0,600;0,700;1,400;1,600&family=Inter:wght@300;400;500;600;700&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
  <script src="https://www.youtube.com/iframe_api"></script>
  <script src="/exsurge.min.js"></script>
  <style>
    :root {
      --primary-color: #c96b63;
      --primary-color-rgb: 201, 107, 99;
      --gold-sacred: #c4984f;
      --gold-sacred-bg: rgba(196, 152, 79, 0.12);
      --background-base: #000000;
      --background-surface: #0a0a0a;
      --score-bg: #000000;
      --score-text: #f4f4f6;
      --text-primary: #f8fafc;
      --text-secondary: #94a3b8;
      --text-tertiary: #64748b;
      --card-radius: 16px;
      --btn-radius: 12px;
      --pill-radius: 20px;
    }

    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      border: none !important;
      outline: none !important;
      box-shadow: none !important;
      text-shadow: none !important;
      -webkit-tap-highlight-color: transparent;
    }

    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #000000 !important;
      color: var(--text-primary);
      line-height: 1.5;
      padding: 32px 18px 80px;
    }

    .container {
      max-width: 820px;
      margin: 0 auto;
    }

    /* Aucun fond, aucun contour nulle part */
    .card, .demo-card, .demo-player-grid > div, .demo-toolbar, .demo-score-viewport,
    .demo-detail-chip, .estimation-card, .cli-box, .piece-card, .stat-chip,
    .modal-content, .modal-score-box, .score-viewport, table, th, td, header, nav, section,
    .utility-actions-row, .decision-buttons-grid, .video-frame-container {
      background: transparent !important;
      border: none !important;
      border-left: none !important;
      border-right: none !important;
      border-top: none !important;
      border-bottom: none !important;
      box-shadow: none !important;
      filter: none !important;
    }

    h1 {
      font-family: 'Libre Baskerville', 'Crimson Text', serif;
      font-size: 1.65rem;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: -0.01em;
      margin-bottom: 6px;
    }

    h2 {
      font-family: 'Libre Baskerville', 'Crimson Text', serif;
      font-size: 1.15rem;
      font-weight: 700;
      color: #ffffff;
    }

    a {
      color: var(--primary-color);
      text-decoration: underline;
      text-underline-offset: 3px;
    }

    /* Boutons et pilules transparents */
    .btn-pill-group {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 8px;
    }

    .btn-pill {
      background: transparent !important;
      color: var(--text-secondary);
      padding: 4px 6px;
      font-size: 0.85rem;
      font-weight: 500;
      cursor: pointer;
      transition: color 0.15s;
    }
    .btn-pill:hover {
      color: var(--text-primary);
    }
    .btn-pill.active {
      color: var(--primary-color) !important;
      font-weight: 700;
      text-decoration: underline;
      text-underline-offset: 4px;
    }

    /* Pastille active du mode partition simplifiée */
    .demo-chip-active {
      color: var(--primary-color) !important;
      font-weight: 700;
      text-decoration: underline;
      text-underline-offset: 3px;
    }

    /* Carte d'information du chant (parité alignment-lab, pure et simple) */
    .lab-chant-info-card {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 10px 0;
      flex-shrink: 0;
    }
    .chant-info-badge-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }
    .score-mode-badge {
      display: inline-flex;
      align-items: center;
      font-size: 0.68rem;
      font-weight: 700;
      color: var(--primary-color);
      padding: 2px 0;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .chant-info-title {
      margin: 2px 0 0 0;
      padding: 0;
      font-family: 'Libre Baskerville', 'Crimson Text', serif;
      font-size: 1.08rem;
      font-weight: 700;
      line-height: 1.25;
      color: var(--text-primary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .chant-info-details {
      font-size: 0.74rem;
      color: var(--text-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .card-type {
      color: var(--primary-color) !important;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-size: 0.72rem;
      line-height: 1.2;
    }

    /* Contrôles de lecture démo */
    .demo-btn {
      background: transparent !important;
      color: var(--primary-color);
      font-weight: 600;
      font-size: 0.88rem;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 0;
    }
    .demo-btn-sec {
      background: transparent !important;
      color: var(--text-secondary);
      font-size: 0.84rem;
      cursor: pointer;
      padding: 4px 6px;
    }
    .demo-btn-sec:hover {
      color: var(--text-primary);
    }
    .demo-slider {
      width: 100%;
      accent-color: var(--primary-color);
      cursor: pointer;
      height: 4px;
    }
    .demo-time {
      font-family: ui-monospace, SFMono-Regular, monospace;
      font-size: 0.84rem;
      color: var(--text-secondary);
      white-space: nowrap;
    }

    /* Champ de saisie épuré sans fond ni contour */
    .minimal-input {
      background: transparent !important;
      border: none !important;
      border-bottom: 1px solid rgba(255, 255, 255, 0.2) !important;
      color: #ffffff;
      padding: 6px 2px;
      font-size: 0.92rem;
      font-family: inherit;
      border-radius: 0 !important;
      transition: border-color 0.15s;
    }
    .minimal-input:focus {
      border-bottom: 1px solid var(--primary-color) !important;
    }

    /* CLI Tabs & Box */
    .cli-tabs {
      display: flex;
      gap: 14px;
      margin-bottom: 6px;
    }
    .cli-tab-btn {
      background: transparent !important;
      color: var(--text-tertiary);
      font-size: 0.82rem;
      font-weight: 500;
      cursor: pointer;
      padding: 3px 0;
    }
    .cli-tab-btn.active {
      color: var(--primary-color) !important;
      font-weight: 700;
      border-bottom: 1px solid var(--primary-color) !important;
    }
    .cli-box {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 8px 0;
    }
    .cli-box code {
      font-family: ui-monospace, SFMono-Regular, monospace;
      font-size: 0.86rem;
      color: var(--text-primary);
      word-break: break-all;
    }
    .btn-copy-cli {
      background: transparent !important;
      color: var(--primary-color);
      font-size: 0.82rem;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      text-decoration: underline;
      text-underline-offset: 3px;
    }

    /* Barre de progression épurée */
    .progress-bar-bg {
      height: 3px;
      background: rgba(255, 255, 255, 0.1);
      overflow: hidden;
    }
    .progress-bar-fill {
      height: 100%;
      background: var(--primary-color);
      width: ${stats.percentage}%;
      transition: width 0.4s;
    }

    /* Grille des pièces sans contour ni fond */
    .pieces-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
      gap: 14px;
      margin-top: 10px;
    }
    .piece-card {
      padding: 8px 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .piece-title {
      font-family: 'Libre Baskerville', serif;
      font-weight: 700;
      font-size: 0.94rem;
      color: var(--text-primary);
      line-height: 1.3;
    }
    .piece-meta {
      font-size: 0.78rem;
      color: var(--text-tertiary);
    }
    .btn-review-card {
      background: transparent !important;
      color: var(--primary-color);
      font-size: 0.82rem;
      font-weight: 600;
      cursor: pointer;
      text-align: left;
      text-decoration: underline;
      text-underline-offset: 3px;
      padding: 2px 0;
      margin-top: 2px;
    }

    /* Table des contributeurs */
    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
    }
    th {
      color: var(--text-tertiary);
      font-size: 0.74rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 8px 0;
    }
    td {
      padding: 8px 0;
      font-size: 0.88rem;
    }

    /* Rendu partition Exsurge (parité alignment-lab, pure et simple) */
    #demoScoreSlot, #modalScoreSlot.score-viewport {
      background: var(--score-bg);
      color: var(--score-text);
    }
    .score-viewport svg, #demoScoreSlot svg {
      display: block;
      margin: 0 auto;
      width: 100%;
      height: auto;
      overflow: visible;
      color: #ffffff !important;
      fill: #ffffff !important;
    }
    .score-viewport svg line, #demoScoreSlot svg line {
      stroke: rgba(255, 255, 255, 0.45) !important;
      fill: none !important;
      pointer-events: none !important;
    }
    .score-viewport svg text.rubric,
    .score-viewport svg text.specialChar,
    .score-viewport svg tspan.rubric,
    .score-viewport svg tspan.specialChar,
    #demoScoreSlot svg text.rubric,
    #demoScoreSlot svg text.specialChar,
    #demoScoreSlot svg tspan.rubric,
    #demoScoreSlot svg tspan.specialChar {
      fill: var(--primary-color) !important;
    }
    .score-viewport svg use.active,
    .score-viewport svg text.active,
    .score-viewport svg text.active tspan,
    .score-viewport svg tspan.active,
    #demoScoreSlot svg use.active,
    #demoScoreSlot svg use[class*="active"],
    #demoScoreSlot svg .active-note-highlight,
    .active-note-highlight {
      fill: var(--primary-color) !important;
      color: var(--primary-color) !important;
      stroke: none !important;
    }
    #demoScoreSlot svg use[data-demo-idx],
    #demoScoreSlot svg text[data-demo-idx],
    #demoScoreSlot svg tspan[data-demo-idx],
    .score-viewport svg use[data-note-index],
    .score-viewport svg text[data-note-index],
    .score-viewport svg tspan[data-note-index] {
      cursor: pointer;
    }

    /* Modal de relecture */
    .modal-backdrop {
      position: fixed;
      top: 0; left: 0;
      width: 100vw; height: 100vh;
      background: rgba(0, 0, 0, 0.95);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      padding: 16px;
    }
    .modal-content {
      background: #000000 !important;
      width: 100%;
      max-width: 780px;
      max-height: 92vh;
      overflow-y: auto;
      padding: 20px;
      position: relative;
    }
    .modal-close-btn {
      position: absolute;
      top: 14px; right: 14px;
      background: transparent !important;
      color: var(--text-secondary);
      font-size: 1.2rem;
      cursor: pointer;
    }
    .decision-buttons-grid {
      display: flex;
      gap: 16px;
      margin-top: 14px;
    }
    .btn-decision {
      background: transparent !important;
      color: var(--text-secondary);
      font-size: 0.88rem;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 0;
    }
    .btn-decision:hover {
      color: var(--text-primary);
    }
    .btn-decision.btn-approved {
      color: var(--primary-color) !important;
      text-decoration: underline;
      text-underline-offset: 4px;
    }
    .btn-utility {
      background: transparent !important;
      color: var(--text-tertiary);
      font-size: 0.82rem;
      cursor: pointer;
      padding: 6px 0;
      text-decoration: underline;
      text-underline-offset: 3px;
    }
    .btn-utility:hover {
      color: var(--text-primary);
    }
    .inline-comment-textarea {
      width: 100%;
      background: transparent !important;
      border: none !important;
      border-bottom: 1px solid rgba(255, 255, 255, 0.2) !important;
      color: #ffffff;
      padding: 8px 0;
      font-family: inherit;
      font-size: 0.85rem;
      resize: vertical;
      border-radius: 0 !important;
    }
    .inline-comment-textarea:focus {
      border-bottom-color: var(--primary-color) !important;
    }
  </style>
</head>
<body>
  <div class="container">

    <!-- En-tête épuré sans fioriture -->
    <header style="margin-bottom: 32px;">
      <div class="card-type">Scriptorium numérique</div>
      <h1>Calcul Distribué Oremus</h1>
      <p style="font-size:0.92rem; color:var(--text-secondary); margin-top:4px;">
        Synchronisation note-par-note du chant grégorien pour <a href="https://oremus.silverhorse.fr" target="_blank" rel="noopener">oremus.silverhorse.fr</a>.
      </p>
    </header>

    <!-- 1. Démonstration Réelle -->
    <section style="margin-bottom: 36px;" id="demoSection">
      <div style="display:flex; justify-content:space-between; align-items:baseline; flex-wrap:wrap; gap:8px; margin-bottom:8px;">
        <h2>Démonstration</h2>
        <div class="btn-pill-group" id="demoPiecePills">
          <button type="button" class="btn-pill active" data-demo-id="16335" onclick="switchDemoPiece('16335')">Dextera Domini (#16335)</button>
          <button type="button" class="btn-pill" data-demo-id="of-dextera_domini-alleluia" onclick="switchDemoPiece('of-dextera_domini-alleluia')">Dextera Domini (All.)</button>
          <button type="button" class="btn-pill" data-demo-id="al-dextera_dei" onclick="switchDemoPiece('al-dextera_dei')">Dextera Dei (All.)</button>
        </div>
      </div>

      <div class="lab-chant-info-card" style="margin-bottom:12px;">
        <div class="chant-info-badge-row">
          <span class="score-mode-badge" id="demoModeBadge">Mode 2</span>
          <span style="font-size:0.74rem; color:var(--text-tertiary);" id="demoNotesBadge">120 notes</span>
        </div>
        <h3 class="chant-info-title" id="demoPieceTitle">Dextera Domini</h3>
        <div class="chant-info-details" id="demoPieceSub">Données validées via l'API • Aligné par : Atelier-Chantres</div>
      </div>

      <div style="display:grid; grid-template-columns: 240px 1fr; gap:16px; margin-bottom:14px; align-items:center;">
        <div style="aspect-ratio:16/9; overflow:hidden; position:relative; background:#000;">
          <iframe id="demoVideoFrame" src="https://www.youtube-nocookie.com/embed/3lHW0OAHBCk?enablejsapi=1&autoplay=0&controls=1&modestbranding=1&rel=0&playsinline=1" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="width:100%; height:100%; border:none; position:absolute; top:0; left:0;"></iframe>
        </div>

        <div style="display:flex; flex-direction:column; gap:10px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <button type="button" class="demo-btn" id="btnDemoPlay" onclick="toggleDemoPlay()">
              <svg id="demoIconPlay" viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              <svg id="demoIconPause" viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style="display:none;"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
              <span id="demoPlayText">Lecture</span>
            </button>
            <button type="button" class="demo-btn-sec" onclick="seekDemoRelative(-3)">-3s</button>
            <button type="button" class="demo-btn-sec" onclick="seekDemoRelative(3)">+3s</button>
            <span class="demo-time" id="demoTimeDisplay" style="margin-left:auto;">0:00 / 1:15</span>
          </div>

          <input type="range" class="demo-slider" id="demoTimeSlider" min="0" max="100" value="0" step="0.1" oninput="onDemoSliderInput(this.value)">

          <div id="demoDetailText" style="font-size:0.78rem; color:var(--text-secondary);">
            Note active synchronisée sur la partition
          </div>
        </div>
      </div>

      <div id="demoScoreSlot" style="overflow-x:auto; padding:12px 16px; min-height:100px; font-family:'Crimson Text','Libre Baskerville',Georgia,serif;">
        <div style="color:var(--text-tertiary); font-size:0.84rem; padding:40px 0; text-align:center;">Chargement de la partition...</div>
      </div>
    </section>

    <!-- 2. Lancer un calcul -->
    <section style="margin-bottom: 36px;">
      <h2 style="margin-bottom:12px;">Lancer un calcul</h2>

      <div style="display:flex; flex-direction:column; gap:14px;">
        <div style="display:flex; align-items:center; gap:12px;">
          <label for="plannerWorkerInput" style="font-size:0.82rem; color:var(--text-secondary); white-space:nowrap;">Pseudo :</label>
          <input type="text" id="plannerWorkerInput" class="minimal-input" placeholder="theobald" autocomplete="name" style="flex:1; max-width:280px;">
        </div>

        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          <span style="font-size:0.82rem; color:var(--text-secondary); white-space:nowrap;">Durée :</span>
          <div class="btn-pill-group" id="durationGroup">
            <button type="button" class="btn-pill" data-mins="15">15 min</button>
            <button type="button" class="btn-pill active" data-mins="30">30 min</button>
            <button type="button" class="btn-pill" data-mins="60">1 h</button>
            <button type="button" class="btn-pill" data-mins="120">2 h</button>
            <button type="button" class="btn-pill" data-mins="0">Libre</button>
          </div>
          <input type="range" id="durationSlider" class="demo-slider" min="5" max="180" step="5" value="30" style="display:none;">
          <span id="sliderValDisplay" style="display:none;">30 min</span>
        </div>

        <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          <span style="font-size:0.82rem; color:var(--text-secondary); white-space:nowrap;">Matériel :</span>
          <div class="btn-pill-group" id="hardwareGroup">
            <button type="button" class="btn-pill active" data-hw="cuda">NVIDIA CUDA</button>
            <button type="button" class="btn-pill" data-hw="mps">Apple Silicon</button>
            <button type="button" class="btn-pill" data-hw="cpu">CPU</button>
          </div>
          <span id="estPiecesDisplay" style="font-size:0.80rem; color:var(--primary-color); margin-left:auto;">~43 chants</span>
          <span id="estXpDisplay" style="display:none;"></span>
        </div>

        <div style="margin-top:6px;">
          <div class="cli-tabs">
            <button type="button" class="cli-tab-btn active" data-os="windows" onclick="switchCliTab('windows')">Windows</button>
            <button type="button" class="cli-tab-btn" data-os="unix" onclick="switchCliTab('unix')">macOS / Linux</button>
            <button type="button" class="cli-tab-btn" data-os="python" onclick="switchCliTab('python')">Python</button>
          </div>

          <div id="cliPanelWindows">
            <div class="cli-box">
              <code id="cliCmdWindows">irm https://api-oremus.silverhorse.fr/run.ps1 | iex</code>
              <button type="button" class="btn-copy-cli" onclick="copyCliCommand('cliCmdWindows', this)">Copier</button>
            </div>
          </div>
          <div id="cliPanelUnix" style="display:none;">
            <div class="cli-box">
              <code id="cliCmdUnix">curl -fsSL https://api-oremus.silverhorse.fr/run.sh | bash</code>
              <button type="button" class="btn-copy-cli" onclick="copyCliCommand('cliCmdUnix', this)">Copier</button>
            </div>
          </div>
          <div id="cliPanelPython" style="display:none;">
            <div class="cli-box">
              <code id="cliCmdPython">curl -fsSL https://api-oremus.silverhorse.fr/worker.py | python3 -</code>
              <button type="button" class="btn-copy-cli" onclick="copyCliCommand('cliCmdPython', this)">Copier</button>
            </div>
          </div>

          <div style="margin-top:8px; font-size:0.78rem; color:var(--text-tertiary);">
            Archive autonome : <a href="/download/worker.zip" style="color:var(--text-secondary);">oremus-worker.zip</a>
          </div>
        </div>
      </div>
    </section>

    <!-- 3. Catalogue & Chants Récents -->
    <section style="margin-bottom: 36px;" id="batchSection">
      <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:8px;">
        <h2>Catalogue</h2>
        <span style="font-size:0.86rem; color:var(--primary-color);" id="progressPct">${stats.completed} / 885 (${stats.percentage}%)</span>
      </div>
      <div class="progress-bar-bg" style="margin-bottom:20px;">
        <div class="progress-bar-fill" id="progressBar"></div>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-bottom:12px;">
        <span style="font-size:0.90rem; font-weight:600; color:#fff;">Chants récemment calculés</span>
        <div style="display:flex; gap:8px; align-items:center;">
          <input type="text" id="filterWorkerInput" class="minimal-input" placeholder="Filtrer par pseudo..." style="width:150px;">
          <button type="button" class="demo-btn-sec" id="btnRefreshBatch">Rafraîchir</button>
        </div>
      </div>

      <div class="pieces-grid" id="piecesGrid">
        <div style="grid-column: 1/-1; padding:16px 0; color:var(--text-tertiary); font-size:0.84rem;">
          Chargement des pièces...
        </div>
      </div>
    </section>

    <!-- 4. Contributeurs -->
    <section style="margin-bottom: 36px;">
      <div style="display:flex; justify-content:space-between; align-items:baseline; flex-wrap:wrap; gap:8px; margin-bottom:4px;">
        <h2 style="margin-bottom:12px;">Contributeurs</h2>
        <span id="personalXpDisplay" style="font-size:0.82rem; color:var(--primary-color);">0 XP • Niv. 1 • Série 0</span>
      </div>
      <div style="font-size:0.76rem; color:var(--text-tertiary); margin-bottom:12px;">+25 XP par chant calculé • +10 XP par relecture • +15 XP par commentaire</div>
      <div style="overflow-x:auto;">
        <table>
          <thead>
            <tr>
              <th>Rang</th>
              <th>Contributeur</th>
              <th>Matériel</th>
              <th style="text-align:right;">Partitions</th>
              <th style="text-align:right;">XP</th>
            </tr>
          </thead>
          <tbody id="leaderboardTbody">
            <tr><td colspan="5" style="padding:12px 0; color:var(--text-tertiary);">Chargement...</td></tr>
          </tbody>
        </table>
      </div>
    </section>

  </div>

  <!-- Modal de relecture minimaliste -->
  <div class="modal-backdrop" id="reviewModal">
    <div class="modal-content">
      <button type="button" class="modal-close-btn" onclick="closeReviewModal()">✕</button>

      <div style="margin-bottom:14px;">
        <div style="font-size:0.75rem; color:var(--primary-color); text-transform:uppercase; margin-bottom:2px;" id="modalChantBadge">Relecture</div>
        <h3 style="font-family:'Libre Baskerville', serif; font-size:1.2rem; font-weight:700; color:#fff;" id="modalChantTitle">Titre du chant</h3>
        <div style="font-size:0.78rem; color:var(--text-tertiary);" id="modalChantSub">Détails de la partition</div>
      </div>

      <div style="aspect-ratio:16/9; max-height:220px; overflow:hidden; position:relative; background:#000; margin-bottom:14px;" id="modalVideoContainer"></div>

      <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
        <button type="button" class="demo-btn" onclick="toggleModalPlayPause()">
          <svg id="modalIconPlay" viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          <svg id="modalIconPause" viewBox="0 0 24 24" width="14" height="14" fill="currentColor" style="display:none;"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
          <span id="modalPlayText">Lecture</span>
        </button>
        <button type="button" class="demo-btn-sec" onclick="seekModalRelative(-3)">-3s</button>
        <button type="button" class="demo-btn-sec" onclick="seekModalRelative(3)">+3s</button>
        <span class="demo-time" id="modalTimeDisplay" style="margin-left:auto;">0:00 / 0:00</span>
      </div>

      <div class="score-viewport" id="modalScoreSlot" style="overflow-x:auto; min-height:120px; margin-bottom:16px;"></div>

      <div class="decision-buttons-grid">
        <button type="button" class="btn-decision btn-approved" onclick="submitReviewVote('approved')">
          ✓ Bien aligné
        </button>
        <button type="button" class="btn-decision" onclick="submitReviewVote('rejected')">
          Décalé
        </button>
        <button type="button" class="btn-decision" onclick="submitReviewVote('bad_gabc')">
          Mauvais chant
        </button>
        <button type="button" class="btn-utility" onclick="toggleReviewComment()" style="margin-left:auto;">
          Remarque
        </button>
      </div>

      <div id="modalCommentView" style="display:none; margin-top:10px;">
        <textarea id="modalCommentInput" class="inline-comment-textarea" placeholder="Précisez un décalage, mot incorrect ou problème audio..."></textarea>
        <div style="display:flex; gap:12px; margin-top:6px;">
          <button type="button" class="btn-utility" onclick="toggleReviewComment(false)">Annuler</button>
          <button type="button" class="demo-btn" onclick="submitReviewWithComment()">Envoyer</button>
        </div>
      </div>
    </div>
  </div>

  <script id="validatedDemoData" type="application/json">
${JSON.stringify(getValidatedDemoPieces())}
  </script>
  <script>
    // Configuration & Benchmarks
    const BENCHMARKS = ${JSON.stringify(benchmarks)};

    let userGamification = { xp: 0, level: 1, streak: 0 };
    let currentDurationMins = 30;
    let currentHardware = 'cuda';
    let currentReviewPieceId = null;
    let currentModalScore = null;
    let currentModalGabc = '';

    // Pièces liturgiques réelles certifiées
    let VALIDATED_DEMO_PIECES = {};
    try {
      const dataEl = document.getElementById('validatedDemoData');
      if (dataEl && dataEl.textContent) {
        VALIDATED_DEMO_PIECES = JSON.parse(dataEl.textContent);
      }
    } catch(err) {
      console.warn('Erreur parsing demo data:', err);
    }

    let currentDemoId = '16335';
    let currentDemoPiece = VALIDATED_DEMO_PIECES['16335'] || VALIDATED_DEMO_PIECES['264'] || null;
    let demoYtPlayer = null;
    let demoSyncInterval = null;
    let demoScore = null;
    let demoChantInfo = null;
    let demoActiveNoteIdx = -1;

    function initDemoPlayer(videoId) {
      if (demoSyncInterval) {
        clearInterval(demoSyncInterval);
        demoSyncInterval = null;
      }
      if (demoYtPlayer && typeof demoYtPlayer.destroy === 'function') {
        try { demoYtPlayer.destroy(); } catch(e) {}
        demoYtPlayer = null;
      }

      const container = document.querySelector('#demoSection iframe') ? document.querySelector('#demoSection iframe').parentElement : null;
      if (!container) return;
      container.innerHTML = '<iframe id="demoVideoFrame" src="https://www.youtube-nocookie.com/embed/' + videoId + '?enablejsapi=1&autoplay=0&controls=1&modestbranding=1&rel=0&playsinline=1" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="width:100%; height:100%; border:none; position:absolute; top:0; left:0;"></iframe>';

      function attachDemoYt() {
        if (!window.YT || !window.YT.Player) {
          setTimeout(attachDemoYt, 100);
          return;
        }
        try {
          demoYtPlayer = new YT.Player('demoVideoFrame', {
            events: {
              onReady: function() {
                updateDemoPlayButton(false);
                startDemoSyncTracker();
              },
              onStateChange: function(event) {
                if (event.data === YT.PlayerState.PLAYING) {
                  updateDemoPlayButton(true);
                  startDemoSyncTracker();
                } else {
                  updateDemoPlayButton(false);
                }
              }
            }
          });
        } catch(err) {
          console.warn('YT Demo Player attach warning:', err);
        }
      }
      attachDemoYt();
    }

    window.toggleDemoPlay = function() {
      if (!demoYtPlayer || typeof demoYtPlayer.getPlayerState !== 'function') return;
      try {
        const state = demoYtPlayer.getPlayerState();
        if (state === YT.PlayerState.PLAYING) {
          demoYtPlayer.pauseVideo();
        } else {
          demoYtPlayer.playVideo();
        }
      } catch(e) {}
    };

    function updateDemoPlayButton(isPlaying) {
      const iconPlay = document.getElementById('demoIconPlay');
      const iconPause = document.getElementById('demoIconPause');
      const label = document.getElementById('demoPlayText');
      if (iconPlay) iconPlay.style.display = isPlaying ? 'none' : 'block';
      if (iconPause) iconPause.style.display = isPlaying ? 'block' : 'none';
      if (label) label.textContent = isPlaying ? 'Pause' : 'Lecture';
    }

    window.seekDemoRelative = function(sec) {
      if (!demoYtPlayer || typeof demoYtPlayer.getCurrentTime !== 'function') return;
      try {
        const cur = demoYtPlayer.getCurrentTime();
        demoYtPlayer.seekTo(Math.max(0, cur + sec), true);
      } catch(e) {}
    };

    window.onDemoSliderInput = function(val) {
      if (!demoYtPlayer || !currentDemoPiece) return;
      const totalDur = (typeof demoYtPlayer.getDuration === 'function' && demoYtPlayer.getDuration() > 0)
        ? demoYtPlayer.getDuration()
        : (currentDemoPiece.audio_duration_sec || 60);
      const sec = (parseFloat(val) / 100.0) * totalDur;
      try {
        demoYtPlayer.seekTo(sec, true);
      } catch(e) {}
    };

    function startDemoSyncTracker() {
      if (demoSyncInterval) clearInterval(demoSyncInterval);
      demoSyncInterval = setInterval(function() {
        if (!demoYtPlayer || typeof demoYtPlayer.getCurrentTime !== 'function') return;
        try {
          const cur = demoYtPlayer.getCurrentTime();
          if (typeof cur === 'number' && !isNaN(cur)) {
            syncDemoActiveNote(cur);
            const dur = (typeof demoYtPlayer.getDuration === 'function' && demoYtPlayer.getDuration() > 0)
              ? demoYtPlayer.getDuration()
              : (currentDemoPiece ? currentDemoPiece.audio_duration_sec : 60);
            
            const slider = document.getElementById('demoTimeSlider');
            if (slider && dur > 0) {
              slider.value = ((cur / dur) * 100).toFixed(1);
            }
            const timeEl = document.getElementById('demoTimeDisplay');
            if (timeEl && dur > 0) {
              const fmt = function(s) {
                return Math.floor(s / 60) + ':' + ('0' + Math.floor(s % 60)).slice(-2);
              };
              timeEl.textContent = fmt(cur) + ' / ' + fmt(dur);
            }
          }
        } catch(e) {}
      }, 75);
    }

    function syncDemoActiveNote(cur) {
      if (!currentDemoPiece || !currentDemoPiece.timestamps || !currentDemoPiece.timestamps.length) return;
      const stamps = currentDemoPiece.timestamps;
      let noteIdx = -1;

      for (let k = 0; k < stamps.length; k++) {
        const curNote = stamps[k];
        if (curNote.start === null || curNote.start === undefined) continue;
        const nxtTime = (k + 1 < stamps.length && stamps[k + 1].start !== undefined)
          ? stamps[k + 1].start
          : (curNote.end || curNote.start + 1.2);
        if (cur >= curNote.start && cur < nxtTime) {
          noteIdx = k;
          break;
        }
      }
      if (noteIdx === -1 && stamps.length > 0 && cur >= stamps[stamps.length - 1].start) {
        noteIdx = stamps.length - 1;
      }
      if (noteIdx >= 0 && noteIdx !== demoActiveNoteIdx) {
        highlightDemoNote(noteIdx);
      }
    }

    function highlightDemoNote(idx) {
      if (idx === demoActiveNoteIdx) return;
      if (idx < 0 || !currentDemoPiece || !currentDemoPiece.timestamps || idx >= currentDemoPiece.timestamps.length) return;

      const prevIdx = demoActiveNoteIdx;
      demoActiveNoteIdx = idx;

      // Ligne d'information toujours mise à jour (même en mode simplifié)
      const stamp = currentDemoPiece.timestamps[idx];
      const chipEl = document.getElementById('demoDetailText');
      if (chipEl && stamp && typeof stamp.start === 'number') {
        chipEl.textContent = 'Note ' + (idx + 1) + '/' + currentDemoPiece.notes_count + ' (' + stamp.start.toFixed(2) + 's) • ' + currentDemoPiece.incipit;
      }

      const slot = document.getElementById('demoScoreSlot');

      // Mode simplifié : surligner la pastille texte
      try {
        const fb = document.getElementById('demoFallbackGrid');
        if (fb && slot) {
          const prev = fb.querySelector('.demo-chip-active');
          if (prev) prev.classList.remove('demo-chip-active');
          const cur = fb.querySelector('[data-demo-idx="' + idx + '"]');
          if (cur) {
            cur.classList.add('demo-chip-active');
            const fr = cur.getBoundingClientRect();
            const sr = slot.getBoundingClientRect();
            if (fr.top < sr.top + 10 || fr.bottom > sr.bottom - 10) {
              cur.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }
        }
      } catch (eFb) {}

      if (!demoChantInfo || !demoChantInfo.allNotes || idx >= demoChantInfo.allNotes.length) return;

      // Nettoyer ancienne note (aucun glow)
      if (prevIdx >= 0 && demoChantInfo.allNotes[prevIdx]) {
        const pNote = demoChantInfo.allNotes[prevIdx];
        if (pNote.svgNode) {
          pNote.svgNode.style.removeProperty('fill');
          pNote.svgNode.style.removeProperty('filter');
        }
        if (pNote.neume && pNote.neume.lyrics && pNote.neume.lyrics[0] && pNote.neume.lyrics[0].svgNode) {
          pNote.neume.lyrics[0].svgNode.style.removeProperty('fill');
          pNote.neume.lyrics[0].svgNode.style.removeProperty('color');
          if (pNote.neume.lyrics[0].svgNode.querySelectorAll) {
            pNote.neume.lyrics[0].svgNode.querySelectorAll('tspan').forEach(function(ts) {
              ts.style.removeProperty('fill');
              ts.style.removeProperty('color');
            });
          }
        }
      }

      // Mettre en valeur la nouvelle note avec la seule couleur #c96b63 (sans aucun glow)
      const curNote = demoChantInfo.allNotes[idx];
      const accent = '#c96b63';
      if (curNote && curNote.svgNode) {
        curNote.svgNode.style.setProperty('fill', accent, 'important');
        curNote.svgNode.style.removeProperty('filter');
      }
      if (curNote && curNote.neume && curNote.neume.lyrics && curNote.neume.lyrics[0] && curNote.neume.lyrics[0].svgNode) {
        const lNode = curNote.neume.lyrics[0].svgNode;
        lNode.style.setProperty('fill', accent, 'important');
        lNode.style.setProperty('color', accent, 'important');
        if (lNode.querySelectorAll) {
          lNode.querySelectorAll('tspan').forEach(function(ts) {
            ts.style.setProperty('fill', accent, 'important');
            ts.style.setProperty('color', accent, 'important');
          });
        }
      }

      if (curNote && curNote.svgNode && slot) {
        const nRect = curNote.svgNode.getBoundingClientRect();
        const sRect = slot.getBoundingClientRect();
        if (nRect.top < sRect.top + 20 || nRect.bottom > sRect.bottom - 20) {
          curNote.svgNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }

    // Partition simplifiée : pastilles texte cliquables (secours si Exsurge indisponible)
    function renderDemoFallback(reason) {
      const container = document.getElementById('demoScoreSlot');
      if (!container || !currentDemoPiece || !currentDemoPiece.timestamps || !currentDemoPiece.timestamps.length) {
        if (container) container.innerHTML = '<div style="color:var(--text-tertiary); font-size:0.84rem;">Partition indisponible. <button type="button" class="demo-btn-sec" onclick="switchDemoPiece(&quot;16335&quot;)">Réessayer</button></div>';
        return;
      }
      demoChantInfo = null;
      demoScore = null;
      const stamps = currentDemoPiece.timestamps;
      let html = '<div style="font-size:0.78rem; color:var(--text-secondary); margin-bottom:8px;">' +
        (reason || 'Partition simplifiée') + ' • ' + stamps.length + ' notes • cliquez pour naviguer</div>' +
        '<div id="demoFallbackGrid" style="display:flex; flex-wrap:wrap; gap:4px;">';
      for (let k = 0; k < stamps.length; k++) {
        const st = stamps[k];
        const t = (st && typeof st.start === 'number') ? st.start.toFixed(1) + 's' : '—';
        html += '<button type="button" data-demo-idx="' + k + '" onclick="seekDemoNote(' + k + ')" ' +
          'style="background:transparent; color:var(--text-secondary); font-size:0.72rem; padding:3px 7px; cursor:pointer; font-family:ui-monospace,monospace;">' +
          (k + 1) + ' · ' + t + '</button>';
      }
      html += '</div><div style="margin-top:8px;"><button type="button" class="demo-btn-sec" onclick="retryDemoScore()">Réessayer la partition</button></div>';
      container.innerHTML = html;
      const keepIdx = demoActiveNoteIdx;
      demoActiveNoteIdx = -1;
      if (keepIdx >= 0) highlightDemoNote(keepIdx);
    }

    window.seekDemoNote = function(idx) {
      if (!currentDemoPiece || !currentDemoPiece.timestamps || !currentDemoPiece.timestamps[idx]) return;
      const st = currentDemoPiece.timestamps[idx];
      if (demoYtPlayer && typeof demoYtPlayer.seekTo === 'function' && st && typeof st.start === 'number') {
        try { demoYtPlayer.seekTo(st.start, true); } catch (e) {}
      }
      highlightDemoNote(idx);
    };

    window.retryDemoScore = function() {
      demoActiveNoteIdx = -1;
      if (currentDemoPiece) {
        if (typeof exsurge === 'undefined') {
          waitForExsurge(function() {
            if (currentDemoPiece) renderDemoScore(currentDemoPiece.gabc_src);
          });
        } else {
          renderDemoScore(currentDemoPiece.gabc_src);
        }
      }
    };

    function renderDemoScore(gabcSrc) {
      const container = document.getElementById('demoScoreSlot');
      if (!container) return;
      if (typeof exsurge === 'undefined') {
        container.innerHTML = '<div style="color:var(--text-tertiary); font-size:0.84rem; padding:40px 0; text-align:center;">Chargement du moteur de partition…</div>';
        waitForExsurge(function() {
          if (currentDemoPiece) renderDemoScore(currentDemoPiece.gabc_src);
        });
        return;
      }
      if (!gabcSrc) {
        renderDemoFallback('Partition indisponible pour cette pièce');
        return;
      }

      try {
        const ctxt = new exsurge.ChantContext();
        ctxt.textColor = '#ffffff';
        ctxt.noteColor = '#ffffff';
        ctxt.neumeLineColor = '#ffffff';
        ctxt.dividerLineColor = '#ffffff';
        ctxt.staffLineColor = 'rgba(255, 255, 255, 0.45)';
        ctxt.setFont("'Crimson Text', 'Libre Baskerville', Georgia, serif", 17.5);
        ctxt.setRubricColor('#c96b63');
        ctxt.specialCharColor = '#c96b63';
        ctxt.lyricTextColor = '#ffffff';
        ctxt.lyricTextFont = "'Crimson Text', 'Libre Baskerville', Georgia, serif";

        const processed = preprocessGabcForExsurge(gabcSrc);
        const mappings = exsurge.Gabc.createMappingsFromSource(ctxt, processed);
        const score = new exsurge.ChantScore(ctxt, mappings, true);

        let availWidth = container.clientWidth || 720;
        if (availWidth < 340) availWidth = 340;
        ctxt.width = availWidth;

        score.performLayout(ctxt);
        score.layoutChantLines(ctxt, availWidth - 10, function() {
          try {
          container.innerHTML = '';
          const svgNode = score.createSvgNode(ctxt);
          svgNode.setAttribute('width', '100%');
          svgNode.style.width = '100%';
          svgNode.style.height = 'auto';
          svgNode.style.color = '#ffffff';
          svgNode.style.fill = '#ffffff';
          container.appendChild(svgNode);

          demoScore = score;
          demoChantInfo = _getChantInfo(score);

          if (demoChantInfo && demoChantInfo.allNotes) {
            const allUse = Array.from(svgNode.querySelectorAll('use'));
            allUse.forEach(function(u) {
              if (u.source) {
                const idx = demoChantInfo.allNotes.indexOf(u.source);
                if (idx >= 0) {
                  demoChantInfo.allNotes[idx].svgNode = u;
                  u.setAttribute('data-demo-idx', idx);
                  u.style.cursor = 'pointer';
                }
              }
            });

            demoChantInfo.allNotes.forEach(function(n, idx) {
              if (n.svgNode) {
                n.svgNode.setAttribute('data-demo-idx', idx);
                n.svgNode.style.cursor = 'pointer';
              }
              if (n.neume && n.neume.lyrics) {
                n.neume.lyrics.forEach(function(l) {
                  if (l.svgNode) {
                    l.svgNode.setAttribute('data-demo-idx', idx);
                    l.svgNode.style.cursor = 'pointer';
                    if (l.svgNode.querySelectorAll) {
                      l.svgNode.querySelectorAll('tspan').forEach(function(ts) {
                        ts.setAttribute('data-demo-idx', idx);
                        ts.style.cursor = 'pointer';
                      });
                    }
                  }
                });
              }
            });
          }

          svgNode.addEventListener('click', function(e) {
            const targetEl = e.target.closest ? e.target.closest('[data-demo-idx]') : null;
            if (targetEl) {
              const idx = parseInt(targetEl.getAttribute('data-demo-idx'), 10);
              if (!isNaN(idx) && currentDemoPiece && currentDemoPiece.timestamps && currentDemoPiece.timestamps[idx]) {
                const st = currentDemoPiece.timestamps[idx];
                if (demoYtPlayer && typeof demoYtPlayer.seekTo === 'function') {
                  demoYtPlayer.seekTo(st.start, true);
                }
                highlightDemoNote(idx);
              }
            }
          });

          highlightDemoNote(0);
          } catch (errSvg) {
            console.warn('Erreur rendu demo:', errSvg);
            renderDemoFallback('Rendu vectoriel indisponible');
          }
        });
      } catch(err) {
        console.warn('Erreur Exsurge demo:', err);
        renderDemoFallback('Rendu vectoriel indisponible');
      }
    }

    window.switchDemoPiece = function(pieceId) {
      demoActiveNoteIdx = -1;

      function applyPiece(p) {
        currentDemoId = pieceId;
        currentDemoPiece = p;
        document.querySelectorAll('#demoPiecePills .btn-pill').forEach(function(b) {
          b.classList.toggle('active', b.dataset.demoId === pieceId);
        });
        const subEl = document.getElementById('demoPieceSub');
        if (subEl) {
          subEl.textContent = 'Données validées via l\u2019API • Aligné par : ' + (p.worker_id || 'Atelier-Chantres');
        }
        const badgeEl = document.getElementById('demoModeBadge');
        if (badgeEl) {
          badgeEl.textContent = 'Mode ' + (p.mode || '—');
        }
        const notesEl = document.getElementById('demoNotesBadge');
        if (notesEl) {
          notesEl.textContent = (p.notes_count || (p.timestamps ? p.timestamps.length : 0)) + ' notes';
        }
        const titleEl = document.getElementById('demoPieceTitle');
        if (titleEl) {
          titleEl.textContent = p.incipit || ('Pièce #' + (p.piece_id || pieceId));
        }
        initDemoPlayer(p.youtube_id);
        renderDemoScore(p.gabc_src);
      }

      if (VALIDATED_DEMO_PIECES[pieceId]) {
        applyPiece(VALIDATED_DEMO_PIECES[pieceId]);
        return;
      }
      // Fallback : donnees validees via l'API en direct
      const slotEl = document.getElementById('demoScoreSlot');
      if (slotEl) slotEl.innerHTML = '<div style="color:var(--text-tertiary); font-size:0.84rem; padding:40px 0; text-align:center;">Chargement de la partition…</div>';
      fetch('/api/jobs/piece/' + encodeURIComponent(pieceId)).then(function(r) { return r.json(); }).then(function(p) {
        if (p && p.timestamps && p.timestamps.length) {
          VALIDATED_DEMO_PIECES[pieceId] = p;
          applyPiece(p);
        } else {
          renderDemoFallback('Pièce introuvable via l\u2019API');
        }
      }).catch(function() {
        renderDemoFallback('Connexion à l\u2019API impossible');
      });
    };

    function initInteractiveDemo() {
      const ids = Object.keys(VALIDATED_DEMO_PIECES || {});
      if (ids.length === 0) {
        const c = document.getElementById('demoScoreSlot');
        if (c) c.innerHTML = '<div style="color:var(--text-tertiary); font-size:0.84rem;">Aucune pièce de démonstration disponible. <button type="button" class="demo-btn-sec" onclick="switchDemoPiece(&quot;16335&quot;)">Réessayer</button></div>';
        // Dernière chance : données validées via l'API en direct
        switchDemoPiece('16335');
        return;
      }
      const firstId = VALIDATED_DEMO_PIECES['16335'] ? '16335' : ids[0];
      switchDemoPiece(firstId);
    }

    let exsurgeWaitTries = 0;
    function waitForExsurge(cb) {
      if (typeof exsurge !== 'undefined') {
        exsurgeWaitTries = 0;
        try { cb(); } catch (eCb) {
          console.warn('Erreur init partition:', eCb);
          renderDemoFallback('Rendu vectoriel indisponible');
        }
        return;
      }
      exsurgeWaitTries++;
      // Attente persistante (~60s) : aucun abandon silencieux, repli texte au-delà
      if (exsurgeWaitTries > 240) {
        if (!document.getElementById('demoFallbackGrid')) {
          renderDemoFallback('Moteur de partition indisponible');
        }
        return;
      }
      setTimeout(function() { waitForExsurge(cb); }, 250);
    }

    // Initialisation
    document.addEventListener('DOMContentLoaded', function() {
      initGamificationFromStorage();
      renderPersonalXp();
      setupPlannerEvents();
      setupUserFilter();
      updateEstimator();
      refreshLeaderboardAndPieces();

      waitForExsurge(initInteractiveDemo);
      setInterval(refreshLeaderboardAndPieces, 15000);
    });

    function initGamificationFromStorage() {
      try {
        const saved = localStorage.getItem('oremus_lab_gamification');
        if (saved) {
          const parsed = JSON.parse(saved);
          userGamification.xp = parsed.xp || 0;
          userGamification.level = parsed.level || (1 + Math.floor((parsed.xp || 0) / 100));
          userGamification.streak = parsed.streak || 0;
        }
      } catch(e) {}
    }

    function saveGamificationToStorage() {
      try {
        localStorage.setItem('oremus_lab_gamification', JSON.stringify(userGamification));
      } catch(e) {}
    }

    function awardUserXp(amount) {
      userGamification.xp += amount;
      userGamification.streak += 1;
      userGamification.level = 1 + Math.floor(userGamification.xp / 100);
      saveGamificationToStorage();
      renderPersonalXp();
    }

    function renderPersonalXp() {
      const el = document.getElementById('personalXpDisplay');
      if (el) {
        el.textContent = userGamification.xp + ' XP • Niv. ' + userGamification.level + ' • Série ' + userGamification.streak;
      }
      const est = document.getElementById('estXpDisplay');
      if (est) {
        const m = currentDurationMins > 0 ? currentDurationMins : 30;
        est.textContent = '';
      }
    }

    async function syncServerXp(pseudo) {
      if (!pseudo) return;
      try {
        const res = await fetch('/api/gamification?worker=' + encodeURIComponent(pseudo));
        const data = await res.json();
        if (data && typeof data.xp === 'number') {
          // Le serveur fait foi pour les calculs (+25/chant) ; on prend le max avec le local
          if (data.xp > userGamification.xp) {
            userGamification.xp = data.xp;
            userGamification.level = data.level || (1 + Math.floor(data.xp / 100));
            saveGamificationToStorage();
          }
          renderPersonalXp();
          return data;
        }
      } catch (e) {}
      return null;
    }

    function setupPlannerEvents() {
      const durationButtons = document.querySelectorAll('#durationGroup .btn-pill');
      durationButtons.forEach(function(btn) {
        btn.addEventListener('click', function() {
          durationButtons.forEach(function(b) { b.classList.remove('active'); });
          btn.classList.add('active');
          const mins = parseInt(btn.dataset.mins, 10);
          currentDurationMins = mins;
          updateEstimator();
        });
      });

      const hwButtons = document.querySelectorAll('#hardwareGroup .btn-pill');
      hwButtons.forEach(function(btn) {
        btn.addEventListener('click', function() {
          hwButtons.forEach(function(b) { b.classList.remove('active'); });
          btn.classList.add('active');
          currentHardware = btn.dataset.hw;
          updateEstimator();
        });
      });

      const plannerInput = document.getElementById('plannerWorkerInput');
      if (plannerInput) {
        plannerInput.value = localStorage.getItem('oremus_worker_name') || '';
        plannerInput.addEventListener('input', function() {
          localStorage.setItem('oremus_worker_name', plannerInput.value.trim());
          const filterInput = document.getElementById('filterWorkerInput');
          if (filterInput && !filterInput.value) filterInput.value = plannerInput.value.trim();
          updateEstimator();
        });
      }
    }

    function updateEstimator() {
      const bench = BENCHMARKS[currentHardware] || BENCHMARKS.cuda;
      const avgSec = bench.avg_sec || 4.2;
      
      let estimatedCount = 0;
      if (currentDurationMins > 0) {
        const totalSec = currentDurationMins * 60;
        estimatedCount = Math.max(1, Math.round(totalSec / avgSec));
      } else {
        estimatedCount = 100;
      }

      const estPieces = document.getElementById('estPiecesDisplay');
      if (estPieces) {
        estPieces.textContent = currentDurationMins > 0 ? ('~' + estimatedCount + ' chants') : 'Illimité';
      }

      const plannerInput = document.getElementById('plannerWorkerInput');
      const filterInput = document.getElementById('filterWorkerInput');
      const pseudo = (plannerInput ? plannerInput.value.trim() : '') ||
                     (filterInput ? filterInput.value.trim() : '') ||
                     localStorage.getItem('oremus_worker_name') || '';
      const durArg = currentDurationMins > 0 ? (' --duration ' + currentDurationMins) : '';
      const origin = window.location.origin;

      const winEl = document.getElementById('cliCmdWindows');
      if (winEl) {
        if (pseudo) {
          let sb = '& ([scriptblock]::Create((irm ' + origin + '/run.ps1))) -Name "' + pseudo + '"';
          if (currentDurationMins > 0) sb += ' -Duration ' + currentDurationMins;
          winEl.textContent = sb;
        } else {
          winEl.textContent = 'irm ' + origin + '/run.ps1 | iex';
        }
      }

      const unixEl = document.getElementById('cliCmdUnix');
      if (unixEl) {
        unixEl.textContent = pseudo
          ? ('curl -fsSL ' + origin + '/run.sh | WORKER_NAME="' + pseudo + '" bash -s --' + durArg)
          : ('curl -fsSL ' + origin + '/run.sh | bash');
      }

      const pyEl = document.getElementById('cliCmdPython');
      if (pyEl) {
        pyEl.textContent = pseudo
          ? ('curl -fsSL ' + origin + '/worker.py | python3 - --name "' + pseudo + '"' + durArg)
          : ('curl -fsSL ' + origin + '/worker.py | python3 -');
      }
    }

    window.switchCliTab = function(os) {
      document.querySelectorAll('.cli-tab-btn').forEach(function(b) {
        b.classList.toggle('active', b.dataset.os === os);
      });
      document.getElementById('cliPanelWindows').style.display = os === 'windows' ? 'block' : 'none';
      document.getElementById('cliPanelUnix').style.display = os === 'unix' ? 'block' : 'none';
      document.getElementById('cliPanelPython').style.display = os === 'python' ? 'block' : 'none';
    };

    window.copyCliCommand = function(elId, btn) {
      const el = document.getElementById(elId);
      if (!el) return;
      navigator.clipboard.writeText(el.textContent).then(function() {
        const orig = btn.textContent;
        btn.textContent = 'Copié !';
        setTimeout(function() { btn.textContent = orig; }, 1800);
      });
    };

    function setupUserFilter() {
      const filterInput = document.getElementById('filterWorkerInput');
      const btnRefresh = document.getElementById('btnRefreshBatch');
      const grid = document.getElementById('piecesGrid');
      const saved = localStorage.getItem('oremus_worker_name');
      if (saved && filterInput) filterInput.value = saved;

      if (grid) {
        grid.addEventListener('click', function(e) {
          const btn = e.target.closest ? e.target.closest('[data-piece-id]') : null;
          if (btn) {
            const pid = btn.getAttribute('data-piece-id');
            if (pid) openReviewModal(pid);
          }
        });
      }

      if (filterInput) {
        filterInput.addEventListener('input', function() {
          localStorage.setItem('oremus_worker_name', filterInput.value.trim());
          const plannerInput = document.getElementById('plannerWorkerInput');
          if (plannerInput && plannerInput.value !== filterInput.value) {
            plannerInput.value = filterInput.value;
          }
          updateEstimator();
        });
      }

      if (btnRefresh) {
        btnRefresh.addEventListener('click', function() {
          fetchWorkerBatch(filterInput ? filterInput.value.trim() : '');
        });
      }
    }

    async function fetchWorkerBatch(workerName) {
      const grid = document.getElementById('piecesGrid');
      if (!grid) return;
      grid.innerHTML = '<div style="grid-column: 1/-1; padding:12px 0; color:var(--text-secondary); font-size:0.85rem;">Mise à jour...</div>';
      
      try {
        const url = workerName ? ('/api/jobs/worker/' + encodeURIComponent(workerName) + '/pieces') : '/api/jobs/worker/pieces';
        const res = await fetch(url);
        const data = await res.json();
        const pieces = data.pieces || [];

        if (pieces.length === 0) {
          grid.innerHTML = '<div style="grid-column: 1/-1; padding:16px 0; color:var(--text-tertiary); font-size:0.85rem;">Aucune partition trouvée. Lancez le calcul pour voir vos chants ici.</div>';
          return;
        }

        grid.innerHTML = pieces.map(function(p) {
          var isUser = p.is_user_piece;
          var author = isUser ? 'Votre calcul' : (p.worker_id || 'Ami');
          var computeTime = p.compute_time_sec ? (' • ' + p.compute_time_sec + 's') : '';
          return '<div class="piece-card">' +
            '<div style="display:flex; justify-content:space-between; align-items:baseline; gap:6px;">' +
              '<span style="font-size:0.75rem; color:var(--primary-color); font-weight:600; text-transform:uppercase;">' + (p.part || 'Chant') + '</span>' +
              '<span style="font-size:0.75rem; color:var(--text-tertiary);">' + author + '</span>' +
            '</div>' +
            '<div class="piece-title">' + (p.incipit || p.piece_id) + '</div>' +
            '<div class="piece-meta">' +
              '<span>' + p.notes_count + ' notes</span>' + computeTime +
            '</div>' +
            '<button type="button" class="btn-review-card" data-piece-id="' + p.piece_id + '">' +
              'Examiner & Réviser' +
            '</button>' +
          '</div>';
        }).join('');

      } catch(e) {
        grid.innerHTML = '<div style="grid-column: 1/-1; padding:12px 0; color:var(--primary-color); font-size:0.85rem;">Erreur de chargement des pièces.</div>';
      }
    }

    function preprocessGabcForExsurge(gabc) {
      if (!gabc) return '';
      return gabc
        .split("<sp>'</sp>").join("'")
        .split("<sp>’</sp>").join("'")
        .replace(new RegExp("<v>\\\\\\\\([VRA])bar</v>", "gi"), function(m, b) { return b.toUpperCase() + '/.'; })
        .replace(new RegExp("<sp>([VRA])/?</sp>\\\\.?", "gi"), function(m, b) { return b.toUpperCase() + '/.'; })
        .replace(new RegExp("(^|\\\\s|\\\\))<i>\\\\s*(Ps\\\\.?|Psalmus)\\\\s*</i>", "gi"), "$1<c><i>Ps.</i></c>")
        .replace(new RegExp("(^|\\\\s|\\\\))(Ps\\\\.)(?=\\\\s+[A-ZÁÉÍÓÚ])", "g"), "$1<c><i>Ps.</i></c>")
        .replace(new RegExp("(^|\\\\s|\\\\))<i>\\\\s*([V℣]\\\\.?|Versus)\\\\s*</i>", "gi"), "$1<c><i>℣.</i></c>")
        .replace(new RegExp("(^|\\\\s|\\\\))(V/\\\\.?)(?=\\\\s*[0-9A-ZÁÉÍÓÚ(])", "g"), "$1<c><i>℣.</i></c>")
        .replace(new RegExp("(^|\\\\s|\\\\))<i>\\\\s*([R℟]\\\\.?|Responsorium)\\\\s*</i>", "gi"), "$1<c><i>℟.</i></c>")
        .replace(new RegExp("(^|\\\\s|\\\\))(R/\\\\.?)(?=\\\\s*[0-9A-ZÁÉÍÓÚ(])", "g"), "$1<c><i>℟.</i></c>");
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
        container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-tertiary);font-size:13px;">Aucune vidéo</div>';
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
      if (iconPlay) iconPlay.style.display = isPlaying ? 'none' : 'block';
      if (iconPause) iconPause.style.display = isPlaying ? 'block' : 'none';
      if (label) label.textContent = isPlaying ? 'Pause' : 'Lecture';
    }

    window.seekModalRelative = function(sec) {
      if (!modalYtPlayer || typeof modalYtPlayer.getCurrentTime !== 'function') return;
      try {
        const cur = modalYtPlayer.getCurrentTime();
        modalYtPlayer.seekTo(Math.max(0, cur + sec), true);
      } catch(e) {}
    };

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
              const fmt = function(s) {
                return Math.floor(s / 60) + ':' + ('0' + Math.floor(s % 60)).slice(-2);
              };
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
      if (idx < 0 || !currentModalPiece || !currentModalPiece.timestamps || idx >= currentModalPiece.timestamps.length) return;
      if (idx === modalActiveNoteIndex && currentModalChantInfo) return;
      modalActiveNoteIndex = idx;

      // Mode simplifié : pastille texte
      try {
        const fb = document.getElementById('modalFallbackGrid');
        const vp = document.getElementById('modalScoreSlot');
        if (fb && vp) {
          const prev = fb.querySelector('.demo-chip-active');
          if (prev) prev.classList.remove('demo-chip-active');
          const cur = fb.querySelector('[data-note-index="' + idx + '"]');
          if (cur) {
            cur.classList.add('demo-chip-active');
            const fr = cur.getBoundingClientRect();
            const vr = vp.getBoundingClientRect();
            if (fr.top < vr.top + 10 || fr.bottom > vr.bottom - 10) {
              cur.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }
        }
      } catch (eFb) {}

      if (!currentModalChantInfo || !currentModalChantInfo.allNotes || !currentModalChantInfo.allNotes.length) return;
      if (idx >= currentModalChantInfo.allNotes.length) return;
      const note = currentModalChantInfo.allNotes[idx];
      const accentColor = '#c96b63';

      if (modalActiveNoteEl) {
        modalActiveNoteEl.classList.remove('active');
        modalActiveNoteEl.style.removeProperty('fill');
        modalActiveNoteEl = null;
      }
      if (modalActiveLyricEl) {
        modalActiveLyricEl.classList.remove('active');
        modalActiveLyricEl.style.removeProperty('fill');
        modalActiveLyricEl.style.removeProperty('color');
        if (modalActiveLyricEl.querySelectorAll) {
          modalActiveLyricEl.querySelectorAll('tspan').forEach(function(ts) {
            ts.classList.remove('active');
            ts.style.removeProperty('fill');
            ts.style.removeProperty('color');
          });
        }
        modalActiveLyricEl = null;
      }

      if (note && note.svgNode) {
        modalActiveNoteEl = note.svgNode;
        modalActiveNoteEl.classList.add('active');
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
            modalActiveLyricEl.querySelectorAll('tspan').forEach(function(ts) {
              ts.classList.add('active');
              ts.style.setProperty('fill', accentColor, 'important');
              ts.style.setProperty('color', accentColor, 'important');
            });
          }
        }
      }

      const viewport = document.getElementById('modalScoreSlot');
      if (note && note.svgNode && viewport) {
        const noteRect = note.svgNode.getBoundingClientRect();
        const viewRect = viewport.getBoundingClientRect();
        if (noteRect.top < viewRect.top + 20 || noteRect.bottom > viewRect.bottom - 20) {
          note.svgNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }

    // Partition simplifiée de secours pour la modale (pastilles cliquables)
    function renderModalFallback(reason) {
      const container = document.getElementById('modalScoreSlot');
      if (!container || !currentModalPiece || !currentModalPiece.timestamps || !currentModalPiece.timestamps.length) {
        if (container) container.innerHTML = '<div style="padding:16px 0; color:var(--text-tertiary);">Partition indisponible.</div>';
        return;
      }
      currentModalChantInfo = null;
      currentModalScore = null;
      const stamps = currentModalPiece.timestamps;
      let html = '<div style="font-size:0.78rem; color:var(--text-secondary); margin-bottom:8px;">' +
        (reason || 'Partition simplifiée') + ' • ' + stamps.length + ' notes • cliquez pour naviguer</div>' +
        '<div id="modalFallbackGrid" style="display:flex; flex-wrap:wrap; gap:4px;">';
      for (var k = 0; k < stamps.length; k++) {
        const st = stamps[k];
        const t = (st && typeof st.start === 'number') ? st.start.toFixed(1) + 's' : '—';
        html += '<button type="button" data-note-index="' + k + '" onclick="seekModalNote(' + k + ')" ' +
          'style="background:transparent; color:var(--text-secondary); font-size:0.72rem; padding:3px 7px; cursor:pointer; font-family:ui-monospace,monospace;">' +
          (k + 1) + ' · ' + t + '</button>';
      }
      html += '</div><div style="margin-top:8px;"><button type="button" class="demo-btn-sec" onclick="retryModalScore()">Réessayer la partition</button></div>';
      container.innerHTML = html;
      const keepIdx = modalActiveNoteIndex;
      modalActiveNoteIndex = -1;
      if (keepIdx >= 0) highlightModalNote(keepIdx);
    }

    window.seekModalNote = function(idx) {
      if (!currentModalPiece || !currentModalPiece.timestamps || !currentModalPiece.timestamps[idx]) return;
      const st = currentModalPiece.timestamps[idx];
      if (modalYtPlayer && typeof modalYtPlayer.seekTo === 'function' && st && typeof st.start === 'number') {
        try { modalYtPlayer.seekTo(st.start, true); } catch (e) {}
      }
      highlightModalNote(idx);
    };

    window.retryModalScore = function() {
      modalActiveNoteIndex = -1;
      if (currentModalPiece) renderModalScore(currentModalPiece.gabc_src);
    };

    function renderModalScore(gabcSrc) {
      const container = document.getElementById('modalScoreSlot');
      if (!container) return;
      if (typeof exsurge === 'undefined') {
        container.innerHTML = '<div style="padding:40px 0; text-align:center; color:var(--text-tertiary);">Chargement du moteur de partition…</div>';
        waitForExsurge(function() {
          if (currentModalPiece) renderModalScore(currentModalPiece.gabc_src);
        });
        return;
      }
      if (!gabcSrc) {
        renderModalFallback('Partition indisponible pour cette pièce');
        return;
      }

      try {
        const ctxt = new exsurge.ChantContext();
        ctxt.textColor = '#ffffff';
        ctxt.noteColor = '#ffffff';
        ctxt.neumeLineColor = '#ffffff';
        ctxt.dividerLineColor = '#ffffff';
        ctxt.staffLineColor = 'rgba(255, 255, 255, 0.45)';
        ctxt.setFont("'Crimson Text', 'Libre Baskerville', Georgia, serif", 17.5);
        ctxt.setRubricColor('#c96b63');
        ctxt.specialCharColor = '#c96b63';
        ctxt.lyricTextColor = '#ffffff';
        ctxt.lyricTextFont = "'Crimson Text', 'Libre Baskerville', Georgia, serif";

        const processed = preprocessGabcForExsurge(gabcSrc);
        const mappings = exsurge.Gabc.createMappingsFromSource(ctxt, processed);
        const score = new exsurge.ChantScore(ctxt, mappings, true);

        let availWidth = container.clientWidth || 640;
        if (availWidth < 300) availWidth = 300;
        ctxt.width = availWidth;

        score.performLayout(ctxt);
        score.layoutChantLines(ctxt, availWidth - 10, function() {
          try {
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
            const allUse = Array.from(svgNode.querySelectorAll('use'));
            allUse.forEach(function(u) {
              if (u.source) {
                const idx = currentModalChantInfo.allNotes.indexOf(u.source);
                if (idx >= 0) {
                  currentModalChantInfo.allNotes[idx].svgNode = u;
                  u.setAttribute('data-note-index', idx);
                  u.style.cursor = 'pointer';
                }
              }
            });

            currentModalChantInfo.allNotes.forEach(function(n, idx) {
              if (n.svgNode) {
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
          }

          svgNode.addEventListener('click', function(e) {
            const targetEl = e.target.closest ? e.target.closest('[data-note-index]') : null;
            if (targetEl) {
              const idx = parseInt(targetEl.getAttribute('data-note-index'), 10);
              if (!isNaN(idx) && currentModalPiece && currentModalPiece.timestamps && currentModalPiece.timestamps[idx]) {
                const st = currentModalPiece.timestamps[idx];
                if (modalYtPlayer && typeof modalYtPlayer.seekTo === 'function') {
                  modalYtPlayer.seekTo(st.start, true);
                }
                highlightModalNote(idx);
              }
            }
          });

          highlightModalNote(0);
          } catch (errSvg) {
            console.warn('Erreur rendu modal:', errSvg);
            renderModalFallback('Rendu vectoriel indisponible');
          }
        });
      } catch(err) {
        console.warn('Erreur Exsurge modal:', err);
        renderModalFallback('Rendu vectoriel indisponible');
      }
    }

    window.openReviewModal = async function(pieceId) {
      currentReviewPieceId = pieceId;
      modalActiveNoteIndex = -1;
      modalActiveNoteEl = null;
      modalActiveLyricEl = null;

      const modal = document.getElementById('reviewModal');
      if (modal) modal.style.display = 'flex';

      document.getElementById('modalChantTitle').textContent = 'Chargement #' + pieceId + '...';
      document.getElementById('modalChantSub').textContent = '';
      document.getElementById('modalScoreSlot').innerHTML = '<div style="padding:16px 0; color:var(--text-tertiary);">Chargement de la partition...</div>';

      try {
        const res = await fetch('/api/jobs/piece/' + pieceId);
        const data = await res.json();
        const piece = data.piece || data;
        currentModalPiece = piece;

        document.getElementById('modalChantTitle').textContent = piece.incipit || ('Pièce #' + piece.piece_id);
        document.getElementById('modalChantSub').textContent = (piece.part || 'Liturgie') + ' • ' + (piece.notes_count || (piece.timestamps ? piece.timestamps.length : 0)) + ' notes' + (piece.worker_id ? ' • Calculé par ' + piece.worker_id : '');

        initModalPlayer(piece.youtube_id);
        renderModalScore(piece.gabc_src);

      } catch(e) {
        document.getElementById('modalChantTitle').textContent = 'Erreur #' + pieceId;
        document.getElementById('modalScoreSlot').innerHTML = '<div style="padding:16px 0; color:var(--primary-color);">Impossible de charger cette pièce.</div>';
      }
    };

    window.closeReviewModal = function() {
      if (modalPlaybackInterval) {
        clearInterval(modalPlaybackInterval);
        modalPlaybackInterval = null;
      }
      if (modalYtPlayer && typeof modalYtPlayer.destroy === 'function') {
        try { modalYtPlayer.destroy(); } catch(e) {}
        modalYtPlayer = null;
      }
      const modal = document.getElementById('reviewModal');
      if (modal) modal.style.display = 'none';
      currentReviewPieceId = null;
      currentModalPiece = null;
      currentModalChantInfo = null;
    };

    window.toggleReviewComment = function(forceShow) {
      const view = document.getElementById('modalCommentView');
      if (!view) return;
      const isVisible = view.style.display !== 'none';
      const show = typeof forceShow === 'boolean' ? forceShow : !isVisible;
      view.style.display = show ? 'block' : 'none';
      if (show) {
        const input = document.getElementById('modalCommentInput');
        if (input) input.focus();
      }
    };

    window.submitReviewVote = async function(status) {
      if (!currentReviewPieceId) return;
      const pseudo = (document.getElementById('filterWorkerInput') ? document.getElementById('filterWorkerInput').value.trim() : '') ||
                     localStorage.getItem('oremus_worker_name') || 'Anonyme';

      try {
        const res = await fetch('/api/reviews', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            piece_id: currentReviewPieceId,
            status: status,
            reviewer: pseudo,
            author: pseudo
          })
        });
        if (res.ok) {
          try {
            const data = await res.json();
            if (data && data.reviewer_xp && typeof data.reviewer_xp.xp === 'number') {
              if (data.reviewer_xp.xp > userGamification.xp) {
                userGamification.xp = data.reviewer_xp.xp;
                userGamification.level = data.reviewer_xp.level || userGamification.level;
                saveGamificationToStorage();
                renderPersonalXp();
              } else {
                awardUserXp(10);
              }
            } else {
              awardUserXp(10);
            }
          } catch (e) { awardUserXp(10); }
          closeReviewModal();
          fetchWorkerBatch(pseudo);
        }
      } catch(e) {
        alert("Erreur lors de l'envoi de l'avis");
      }
    };

    window.submitReviewWithComment = async function() {
      if (!currentReviewPieceId) return;
      const input = document.getElementById('modalCommentInput');
      const comment = input ? input.value.trim() : '';
      if (!comment) return;

      const pseudo = (document.getElementById('filterWorkerInput') ? document.getElementById('filterWorkerInput').value.trim() : '') ||
                     localStorage.getItem('oremus_worker_name') || 'Anonyme';

      try {
        const res = await fetch('/api/reviews', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            piece_id: currentReviewPieceId,
            status: 'rejected',
            comment: comment,
            reviewer: pseudo,
            author: pseudo
          })
        });
        if (res.ok) {
          try {
            const data = await res.json();
            if (data && data.reviewer_xp && typeof data.reviewer_xp.xp === 'number') {
              if (data.reviewer_xp.xp > userGamification.xp) {
                userGamification.xp = data.reviewer_xp.xp;
                userGamification.level = data.reviewer_xp.level || userGamification.level;
                saveGamificationToStorage();
                renderPersonalXp();
              } else {
                awardUserXp(15);
              }
            } else {
              awardUserXp(15);
            }
          } catch (e) { awardUserXp(15); }
          closeReviewModal();
          fetchWorkerBatch(pseudo);
        }
      } catch(e) {
        alert("Erreur lors de l'envoi du commentaire");
      }
    };

    async function refreshLeaderboardAndPieces() {
      try {
        const res = await fetch('/api/stats');
        const data = await res.json();

        const pctEl = document.getElementById('progressPct');
        if (pctEl) pctEl.textContent = (data.completed || 0) + ' / 885 (' + (data.percentage || 0) + '%)';

        const barEl = document.getElementById('progressBar');
        if (barEl) barEl.style.width = (data.percentage || 0) + '%';

        const tbody = document.getElementById('leaderboardTbody');
        if (tbody && data.leaderboard && data.leaderboard.length > 0) {
          tbody.innerHTML = data.leaderboard.map(function(w, idx) {
            const xpTxt = (typeof w.xp === 'number') ? (w.xp + ' XP • Niv. ' + (w.level || 1)) : (w.count + ' chants');
            return '<tr>' +
              '<td style="font-weight:600; color:var(--text-tertiary);">#' + (idx + 1) + '</td>' +
              '<td style="font-weight:600; color:#fff;">' + w.name + '</td>' +
              '<td style="color:var(--text-tertiary); font-size:0.82rem;">' + (w.device || 'CPU') + '</td>' +
              '<td style="text-align:right; font-weight:600; color:var(--primary-color);">' + w.count + ' chants</td>' +
              '<td style="text-align:right; color:var(--text-secondary); font-size:0.82rem;">' + xpTxt + '</td>' +
            '</tr>';
          }).join('');
        }

        const filterInput = document.getElementById('filterWorkerInput');
        const pseudo = filterInput ? filterInput.value.trim() : '';
        if (pseudo) syncServerXp(pseudo);
        fetchWorkerBatch(pseudo);

      } catch(e) {}
    }
  </script>
</body>
</html>`;
}

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
      const headers = {
        ...CORS_HEADERS,
        'Content-Type': mime,
        'Content-Length': stat.size,
      };
      if (!name.endsWith('.js')) {
        headers['Content-Disposition'] = `attachment; filename="${name}"`;
      }
      res.writeHead(200, headers);
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
  if (req.method === 'GET' && (pathname === '/api/jobs/status' || pathname === '/api/jobs/stats' || pathname === '/api/stats')) {
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
        const pid = String(task.id);
        if (seedIds.has(pid)) continue;

        let shouldReset = purgedIds.includes(pid);
        if (!shouldReset && task.status === 'completed') {
          const cAt = task.completed_at ? new Date(task.completed_at).getTime() : 0;
          if (cAt >= cutoffMs || body.all_non_seed === true) {
            shouldReset = true;
          }
        }
        if (!shouldReset && body.all_non_seed === true) {
          shouldReset = true;
        }

        if (shouldReset) {
          task.status = 'pending';
          task.worker_id = null;
          task.claimed_at = null;
          task.completed_at = null;
          task.error = null;
          resetCount++;
        }
      }
      if (resetCount > 0) saveTasks();

      // Réinitialiser les statistiques des workers si demandé
      if (body.reset_workers === true || body.all_non_seed === true) {
        const workers = loadWorkers();
        for (const wKey of Object.keys(workers)) {
          if (wKey !== 'Atelier-Chantres') {
            delete workers[wKey];
          }
        }
        saveWorkers();
      }

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

      // Attribution XP serveur au relecteur (+10 par vote, +15 si commentaire)
      let reviewerXp = null;
      try {
        const reviewerRaw = data.reviewer || data.author || Object.values(reviewsMap)[0]?.reviewer || Object.values(reviewsMap)[0]?.author || '';
        const reviewer = String(reviewerRaw).normalize('NFC').trim().replace(/\s+/g, ' ');
        if (reviewer && normalizeWorkerKey(reviewer) !== 'anonyme' && normalizeWorkerKey(reviewer) !== 'ami-anonyme') {
          const workers = loadWorkers();
          const wkey = ensureWorkerEntry(workers, reviewer);
          let gained = 0;
          for (const rev of Object.values(reviewsMap)) {
            gained += (rev.comment && String(rev.comment).trim()) ? 15 : 10;
          }
          workers[wkey].review_count = (workers[wkey].review_count || 0) + Object.keys(reviewsMap).length;
          workers[wkey].review_xp = (workers[wkey].review_xp || 0) + gained;
          workers[wkey].xp = (workers[wkey].xp || 0) + gained;
          workers[wkey].last_active = nowIso;
          saveWorkers();
          reviewerXp = { xp: workers[wkey].xp, level: xpForLevel(workers[wkey].xp), gained };
        }
      } catch (e) {}

      return sendJson(res, 201, {
        success: true,
        saved_locally: savedFiles.length,
        files: savedFiles,
        reviewer_xp: reviewerXp
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

  // 15b. Gamification serveur : XP par contributeur (+25/calcul, +10/vote, +15/commentaire)
  if (req.method === 'GET' && (pathname === '/api/gamification' || pathname.startsWith('/api/worker/'))) {
    let workerName = reqUrl.searchParams.get('worker') || reqUrl.searchParams.get('worker_id') || '';
    if (pathname.startsWith('/api/worker/')) {
      const rest = decodeURIComponent(pathname.replace('/api/worker/', ''));
      const parts = rest.split('/');
      if (parts[0] && parts[0] !== 'xp' && parts[0] !== 'gamification') workerName = parts[0];
      else if (parts[1]) workerName = parts[1];
    }
    const workers = loadWorkers();
    const key = workerName ? findWorkerKey(workers, workerName) : null;
    if (key) {
      const d = workers[key];
      const xp = typeof d.xp === 'number' ? d.xp : (d.count || 0) * 25 + (d.review_xp || 0);
      return sendJson(res, 200, {
        worker: d.display_name || key,
        count: d.count || 0,
        review_count: d.review_count || 0,
        xp, level: xpForLevel(xp),
        last_active: d.last_active || null,
        device: d.device || ''
      });
    }
    return sendJson(res, 200, { worker: workerName || null, count: 0, review_count: 0, xp: 0, level: 1 });
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
