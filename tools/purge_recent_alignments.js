#!/usr/bin/env node
/**
 * purge_recent_alignments.js
 * Invalide les alignements soumis dans les N dernieres heures sur le serveur.
 * Usage: node tools/purge_recent_alignments.js [--hours 24] [--dry-run]
 *
 * Modifie directement server/data/alignments/ et server/data/jobs/tasks.json.
 * Ne touche PAS a server/alignments_seed.json (alignements certifies).
 */

const fs = require("fs");
const path = require("path");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const HOURS_ARG = args.indexOf("--hours");
const HOURS = HOURS_ARG !== -1 ? parseFloat(args[HOURS_ARG + 1]) : 24;
const CUTOFF_MS = Date.now() - HOURS * 3600 * 1000;

const REPO_ROOT = path.resolve(__dirname, "..");
const ALIGNMENTS_DIR = path.join(REPO_ROOT, "server", "data", "alignments");
const TASKS_FILE = path.join(REPO_ROOT, "server", "data", "jobs", "tasks.json");
const SEED_FILE = path.join(REPO_ROOT, "server", "alignments_seed.json");

console.log("\n=== Purge des alignements des " + HOURS + "h dernieres heures ===");
console.log("  Seuil de coupure : " + new Date(CUTOFF_MS).toISOString());
console.log("  Mode : " + (DRY_RUN ? "DRY RUN (aucune modification)" : "REEL (modifications appliquees)") + "\n");

let seedIds = new Set();
if (fs.existsSync(SEED_FILE)) {
  try {
    const seeds = JSON.parse(fs.readFileSync(SEED_FILE, "utf8"));
    seedIds = new Set(Object.keys(seeds).map(k => String(seeds[k].piece_id || k)));
    console.log("  Seeds proteges : " + seedIds.size + " pieces");
  } catch (e) {
    console.warn("  [WARN] Impossible de lire alignments_seed.json : " + e.message);
  }
}

const purgedIds = [];
if (!fs.existsSync(ALIGNMENTS_DIR)) {
  console.log("  [INFO] Dossier " + ALIGNMENTS_DIR + " inexistant -- rien a purger.");
} else {
  const files = fs.readdirSync(ALIGNMENTS_DIR).filter(function(f) { return f.endsWith(".json"); });
  console.log("  Fichiers d alignement trouves : " + files.length);

  for (const filename of files) {
    const filepath = path.join(ALIGNMENTS_DIR, filename);
    const stat = fs.statSync(filepath);
    const mtime = stat.mtimeMs;

    if (mtime < CUTOFF_MS) continue;

    const pieceId = filename.replace(".json", "");
    if (seedIds.has(pieceId)) {
      console.log("  [SKIP] " + filename + " -- seed protege");
      continue;
    }

    let fileCompletedAt = mtime;
    try {
      const data = JSON.parse(fs.readFileSync(filepath, "utf8"));
      if (data.completed_at) {
        fileCompletedAt = new Date(data.completed_at).getTime();
      }
    } catch (e) {}

    if (fileCompletedAt < CUTOFF_MS) continue;

    purgedIds.push(pieceId);
    if (DRY_RUN) {
      console.log("  [DRY] Purgerait : " + filename + " (completed=" + new Date(fileCompletedAt).toISOString() + ")");
    } else {
      fs.unlinkSync(filepath);
      console.log("  [DELETE] " + filename + " supprime");
    }
  }
}

if (purgedIds.length === 0) {
  console.log("\n  Aucun alignement recent a purger.");
} else if (!fs.existsSync(TASKS_FILE)) {
  console.log("\n  [WARN] " + TASKS_FILE + " introuvable -- taches non reinitalisees.");
} else {
  let tasks = [];
  try {
    tasks = JSON.parse(fs.readFileSync(TASKS_FILE, "utf8"));
  } catch (e) {
    console.error("  [ERROR] Lecture tasks.json : " + e.message);
    process.exit(1);
  }

  let resetCount = 0;
  for (const task of tasks) {
    if (purgedIds.includes(String(task.id))) {
      if (DRY_RUN) {
        console.log("  [DRY] Remettrait a pending : task " + task.id + " (" + (task.incipit || "?") + ")");
      } else {
        task.status = "pending";
        task.worker_id = null;
        task.claimed_at = null;
        task.completed_at = null;
        task.error = null;
        console.log("  [RESET] Task " + task.id + " (" + (task.incipit || "?") + ") -> pending");
      }
      resetCount++;
    }
  }

  if (!DRY_RUN && resetCount > 0) {
    fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2), "utf8");
    console.log("\n  tasks.json mis a jour : " + resetCount + " tache(s) remise(s) a pending.");
  }
}

console.log("\n=== Purge terminee : " + purgedIds.length + " alignement(s) concernes ===\n");
