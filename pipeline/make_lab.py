import os

HTML_CONTENT = r'''<!DOCTYPE html>
<html lang="fr" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>Laboratoire d'Alignement GABC ↔ YouTube — Oremus</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Crimson+Text:ital,wght@0,400;0,600;0,700;1,400;1,600;1,700&family=Inter:wght@300;400;500;600;700&family=Libre+Baskerville:ital,wght@0,400;0,700;1,400;1,700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../css/modern.css">
<link rel="stylesheet" href="../../css/divinum_officium.css">
<script src="../../jquery.min.js"></script>
<script src="../../exsurge.min.js"></script>
<script src="lab_data.js"></script>
<script src="https://www.youtube.com/iframe_api"></script>

<style>
:root {
  --primary-color: #c96b63;
  --primary-color-rgb: 201, 107, 99;
  --bg-app: #121214;
  --surface-1: #1a1a1e;
  --surface-2: #222228;
  --surface-3: #2c2c34;
  --border-subtle: rgba(255, 255, 255, 0.08);
  --border-strong: rgba(255, 255, 255, 0.16);
  --text-primary: #f4f4f6;
  --text-secondary: #a1a1aa;
  --text-tertiary: #71717a;
  --success: #589c77;
  --warning: #c4984f;
}
[data-theme="light"] {
  --bg-app: #f7f7f9;
  --surface-1: #ffffff;
  --surface-2: #f0f0f4;
  --surface-3: #e4e4eb;
  --border-subtle: rgba(0, 0, 0, 0.08);
  --border-strong: rgba(0, 0, 0, 0.16);
  --text-primary: #18181b;
  --text-secondary: #71717a;
  --text-tertiary: #a1a1aa;
}

body {
  font-family: 'Inter', -apple-system, sans-serif;
  background: var(--bg-app);
  color: var(--text-primary);
  margin: 0;
  padding: 0;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

/* ── Top Header ── */
.lab-header {
  background: var(--surface-1);
  border-bottom: 1px solid var(--border-subtle);
  padding: 12px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  position: sticky;
  top: 0;
  z-index: 1000;
  box-shadow: 0 2px 8px rgba(0,0,0,0.25);
}
.lab-header-left {
  display: flex;
  align-items: center;
  gap: 14px;
}
.lab-logo-badge {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--primary-color);
  display: flex;
  align-items: center;
  gap: 8px;
  text-decoration: none;
}
.lab-title-group h1 {
  font-size: 0.92rem;
  font-weight: 600;
  margin: 0;
  line-height: 1.2;
}
.lab-title-group span {
  font-size: 0.72rem;
  color: var(--text-secondary);
}
.lab-header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.lab-btn-secondary {
  background: var(--surface-2);
  border: 1px solid var(--border-subtle);
  color: var(--text-primary);
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 0.78rem;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  text-decoration: none;
  transition: all 0.15s ease;
}
.lab-btn-secondary:hover {
  background: var(--surface-3);
  border-color: var(--primary-color);
  color: var(--primary-color);
}

/* ── Main Container ── */
.lab-main {
  max-width: 1440px;
  width: 100%;
  margin: 0 auto;
  padding: 20px;
  box-sizing: border-box;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* ── Piece Selector Tabs ── */
.piece-nav-bar {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
  scrollbar-width: thin;
}
.piece-tab-btn {
  background: var(--surface-1);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 10px 16px;
  color: var(--text-secondary);
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  white-space: nowrap;
  transition: all 0.15s ease;
  min-width: 175px;
}
.piece-tab-btn:hover {
  background: var(--surface-2);
  color: var(--text-primary);
  border-color: var(--border-strong);
}
.piece-tab-btn.active {
  background: var(--surface-2);
  border-color: var(--primary-color);
  color: var(--primary-color);
  box-shadow: 0 0 0 1px var(--primary-color), 0 4px 12px rgba(var(--primary-color-rgb), 0.15);
}
.piece-tab-title {
  font-weight: 600;
  font-size: 0.88rem;
  color: inherit;
}
.piece-tab-subtitle {
  font-size: 0.70rem;
  opacity: 0.8;
  display: flex;
  gap: 6px;
}

/* ── Two Column Grid Layout ── */
.lab-grid {
  display: grid;
  grid-template-columns: 460px 1fr;
  gap: 20px;
  align-items: start;
}
@media (max-width: 1040px) {
  .lab-grid {
    grid-template-columns: 1fr;
  }
}

/* ── Left Column: Media Player & YouTube ── */
.media-col {
  display: flex;
  flex-direction: column;
  gap: 16px;
  position: sticky;
  top: 70px;
}
@media (max-width: 1040px) {
  .media-col {
    position: static;
  }
}
.card-box {
  background: var(--surface-1);
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 4px 16px rgba(0,0,0,0.15);
}
.card-header {
  padding: 12px 18px;
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--surface-2);
}
.card-header-title {
  font-size: 0.82rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 8px;
}
.video-wrapper {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  background: #000;
}
.video-wrapper iframe, .video-wrapper div#ytPlayerSlot {
  width: 100%;
  height: 100%;
  border: 0;
  display: block;
}

/* ── Native Player Bar Controls ── */
.lab-player-controls {
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.progress-container {
  display: flex;
  align-items: center;
  gap: 10px;
}
.time-label {
  font-size: 0.75rem;
  font-family: monospace;
  color: var(--text-secondary);
  min-width: 38px;
}
.custom-progress-track {
  flex: 1;
  height: 6px;
  background: var(--surface-3);
  border-radius: 3px;
  position: relative;
  cursor: pointer;
  overflow: visible;
}
.custom-progress-fill {
  height: 100%;
  background: var(--primary-color);
  border-radius: 3px;
  width: 0%;
  transition: width 0.05s linear;
  position: relative;
}
.custom-progress-thumb {
  position: absolute;
  right: -5px;
  top: -4px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0,0,0,0.5);
  transform: scale(0);
  transition: transform 0.15s ease;
}
.custom-progress-track:hover .custom-progress-thumb {
  transform: scale(1);
}

.playback-buttons-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.main-btn-group {
  display: flex;
  align-items: center;
  gap: 10px;
}
.hero-play-btn {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: var(--primary-color);
  color: #fff;
  border: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(var(--primary-color-rgb), 0.35);
  transition: all 0.15s ease;
}
.hero-play-btn:hover {
  transform: scale(1.06);
  filter: brightness(1.1);
}
.hero-play-btn:active {
  transform: scale(0.96);
}
.round-ctrl-btn {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  background: var(--surface-2);
  border: 1px solid var(--border-subtle);
  color: var(--text-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
}
.round-ctrl-btn:hover {
  background: var(--surface-3);
  color: var(--primary-color);
  border-color: var(--primary-color);
}
.pill-toggle-btn {
  background: var(--surface-2);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  border-radius: 20px;
  padding: 5px 12px;
  font-size: 0.74rem;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: all 0.15s ease;
}
.pill-toggle-btn.active {
  background: rgba(var(--primary-color-rgb), 0.15);
  border-color: var(--primary-color);
  color: var(--primary-color);
  font-weight: 600;
}

/* ── Live Note & Alignment Status HUD ── */
.hud-card {
  padding: 14px 18px;
  background: var(--surface-2);
  border-top: 1px solid var(--border-subtle);
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}
.hud-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.hud-label {
  font-size: 0.68rem;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.hud-value {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--text-primary);
  font-family: monospace;
}
.hud-value.highlighted {
  color: var(--primary-color);
}

/* ── Offset Calibration Bar ── */
.offset-bar {
  padding: 10px 18px;
  border-top: 1px solid var(--border-subtle);
  background: var(--surface-1);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 0.76rem;
}
.offset-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}
.offset-btn {
  background: var(--surface-2);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 0.72rem;
  cursor: pointer;
}
.offset-btn:hover {
  background: var(--surface-3);
  color: var(--primary-color);
}

/* ── Right Column: Gregorian Partition (Exsurge SVG) ── */
.score-col {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.score-card {
  background: var(--surface-1);
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 4px 16px rgba(0,0,0,0.15);
}
.score-toolbar {
  padding: 12px 18px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--surface-2);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.score-toolbar-left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.score-part-badge {
  background: rgba(var(--primary-color-rgb), 0.15);
  color: var(--primary-color);
  font-size: 0.70rem;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 6px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.score-chant-title {
  font-size: 1.05rem;
  font-family: 'Crimson Text', 'Libre Baskerville', serif;
  font-weight: 700;
}
.score-zoom-ctrls {
  display: flex;
  align-items: center;
  gap: 4px;
}
.zoom-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: var(--surface-1);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.85rem;
}
.zoom-btn:hover {
  color: var(--primary-color);
  border-color: var(--primary-color);
}

/* ── Score Container & SVG Rendering ── */
.exsurge-score-viewport {
  padding: 24px 20px;
  overflow-x: auto;
  min-height: 280px;
  background: var(--surface-1);
  display: flex;
  justify-content: center;
  transition: transform 0.2s ease;
  transform-origin: top center;
}
.exsurge-score-viewport svg {
  max-width: 100%;
  height: auto;
  display: block;
}

/* Note hover and active pulse */
.exsurge-score-viewport svg use[source-index],
.exsurge-score-viewport svg text.lyric,
.exsurge-score-viewport svg text.dropCap,
.exsurge-score-viewport svg text.aboveLinesText {
  cursor: pointer;
  transition: fill 0.12s ease, transform 0.12s ease;
}
.exsurge-score-viewport svg use[source-index]:hover {
  fill: var(--warning) !important;
}
.exsurge-score-viewport svg text.lyric:hover {
  fill: var(--primary-color) !important;
}

/* Active Highlight (synchronized with YouTube video) */
.exsurge-score-viewport svg use.active,
.exsurge-score-viewport svg use[source-index].active,
.exsurge-score-viewport svg text.lyric.active,
.exsurge-score-viewport svg text.lyric.active tspan,
.exsurge-score-viewport svg text.dropCap.active,
.exsurge-score-viewport svg text.aboveLinesText.active {
  fill: var(--primary-color) !important;
  color: var(--primary-color) !important;
}
.exsurge-score-viewport svg use.active {
  filter: drop-shadow(0 0 4px rgba(var(--primary-color-rgb), 0.6)) !important;
}

/* ── Breakdown & Priors Visualizer ── */
.breakdown-card {
  padding: 16px 18px;
  border-top: 1px solid var(--border-subtle);
  background: var(--surface-2);
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.breakdown-title {
  font-size: 0.74rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.prior-bar-track {
  width: 100%;
  height: 14px;
  background: var(--surface-3);
  border-radius: 4px;
  overflow: hidden;
  display: flex;
}
.prior-segment {
  height: 100%;
  transition: opacity 0.1s ease;
}
.prior-segment.active {
  opacity: 1 !important;
  filter: brightness(1.6);
  box-shadow: 0 0 6px #fff;
}

.gabc-code-details {
  border-top: 1px solid var(--border-subtle);
  margin-top: 6px;
  padding-top: 10px;
}
.gabc-code-details summary {
  font-size: 0.74rem;
  color: var(--text-secondary);
  cursor: pointer;
}
.gabc-code-details summary:hover {
  color: var(--primary-color);
}
.gabc-raw-box {
  background: var(--bg-app);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: 10px 14px;
  font-family: monospace;
  font-size: 0.72rem;
  color: #a0c8a0;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 160px;
  overflow-y: auto;
  margin-top: 8px;
  line-height: 1.5;
}

/* ── Footer ── */
.lab-footer {
  padding: 16px 20px;
  text-align: center;
  font-size: 0.75rem;
  color: var(--text-tertiary);
  border-top: 1px solid var(--border-subtle);
  background: var(--surface-1);
}
</style>
</head>
<body>

<header class="lab-header">
  <div class="lab-header-left">
    <a href="../../divinum-officium.html" class="lab-logo-badge">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
      <span>Oremus</span>
    </a>
    <div class="lab-title-group">
      <h1>Laboratoire d'Alignement GABC ↔ YouTube</h1>
      <span>v3.1 corrigé — Rendu vectoriel Exsurge SVG & Synchronisation vidéo note par note</span>
    </div>
  </div>
  <div class="lab-header-actions">
    <button id="btnToggleTheme" class="lab-btn-secondary" title="Changer le thème">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
      <span id="themeLabel">Thème</span>
    </button>
    <a href="../../divinum-officium.html" class="lab-btn-secondary">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
      <span>Retour à Oremus</span>
    </a>
  </div>
</header>

<main class="lab-main">

  <!-- 5 Pieces Navigation Tabs -->
  <div class="piece-nav-bar" id="pieceNavBar"></div>

  <!-- Main Grid: Media Player on Left, Partition SVG on Right -->
  <div class="lab-grid">

    <!-- Left Column: Video + Native Oremus Player Controls -->
    <div class="media-col">
      <div class="card-box">
        <div class="card-header">
          <span class="card-header-title">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Enregistrement YouTube
          </span>
          <span id="ytSourceBadge" style="font-size:0.72rem; color:var(--text-tertiary);">—</span>
        </div>

        <!-- YouTube Video IFrame Container -->
        <div class="video-wrapper">
          <div id="ytPlayerSlot"></div>
        </div>

        <!-- Native Oremus Audio/Video Player Bar -->
        <div class="lab-player-controls">
          <!-- Time & Progress Bar -->
          <div class="progress-container">
            <span id="lblCurrentTime" class="time-label">0:00</span>
            <div class="custom-progress-track" id="progressTrack" title="Cliquer pour naviguer">
              <div class="custom-progress-fill" id="progressFill">
                <span class="custom-progress-thumb"></span>
              </div>
            </div>
            <span id="lblTotalTime" class="time-label">0:00</span>
          </div>

          <!-- Controls Row -->
          <div class="playback-buttons-row">
            <div class="main-btn-group">
              <!-- Restart Button -->
              <button id="btnRestart" class="round-ctrl-btn" title="Recommencer depuis le début (⏮)">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><polygon points="19,20 9,12 19,4"/><line x1="5" y1="5" x2="5" y2="19" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>
              </button>
              <!-- Hero Play/Pause -->
              <button id="btnHeroPlay" class="hero-play-btn" title="Lecture / Pause (Espace)">
                <svg id="iconPlay" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><polygon points="6,4 20,12 6,20"/></svg>
                <svg id="iconPause" viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style="display:none;"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
              </button>
              <!-- Step Next Note -->
              <button id="btnNextNote" class="round-ctrl-btn" title="Note suivante (⏭)">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><polygon points="5,4 15,12 5,20"/><line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>
              </button>
            </div>

            <!-- Setting Pills -->
            <div style="display:flex; align-items:center; gap:8px;">
              <button id="btnSpeedCycle" class="pill-toggle-btn" title="Vitesse de lecture">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                <span id="lblSpeed">1.0×</span>
              </button>
              <button id="btnToggleSync" class="pill-toggle-btn active" title="Synchroniser la partition avec la vidéo">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                <span>Sync</span>
              </button>
            </div>
          </div>
        </div>

        <!-- Offset Calibration Controls -->
        <div class="offset-bar">
          <span style="color:var(--text-secondary); display:flex; align-items:center; gap:4px;">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            Calibrage intro : <strong id="lblOffsetVal" style="color:var(--primary-color); margin-left:3px;">0.0s</strong>
          </span>
          <div class="offset-controls">
            <button class="offset-btn" onclick="adjustOffset(-0.5)">-0.5s</button>
            <button class="offset-btn" onclick="setOffset(0)">0s</button>
            <button class="offset-btn" onclick="setOffset(2.0)">2s</button>
            <button class="offset-btn" onclick="setOffset(4.0)">4s</button>
            <button class="offset-btn" onclick="adjustOffset(+0.5)">+0.5s</button>
          </div>
        </div>

        <!-- Live Note & Word HUD Status -->
        <div class="hud-card">
          <div class="hud-item">
            <span class="hud-label">Note active / Total</span>
            <span class="hud-value highlighted" id="hudNoteIndex">— / —</span>
          </div>
          <div class="hud-item">
            <span class="hud-label">Mot en cours</span>
            <span class="hud-value" id="hudWordText">—</span>
          </div>
          <div class="hud-item">
            <span class="hud-label">Token GABC (Hauteur)</span>
            <span class="hud-value" id="hudTokenName">—</span>
          </div>
          <div class="hud-item">
            <span class="hud-label">Poids de durée (Prior)</span>
            <span class="hud-value" id="hudDurationWeight">—</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Right Column: Partition Grégorienne Exsurge SVG -->
    <div class="score-col">
      <div class="score-card">
        <!-- Score Header Toolbar -->
        <div class="score-toolbar">
          <div class="score-toolbar-left">
            <span id="scorePartBadge" class="score-part-badge">INTROITUS</span>
            <span id="scoreChantTitle" class="score-chant-title">—</span>
          </div>
          <div class="score-zoom-ctrls">
            <button class="zoom-btn" onclick="zoomScore(-0.1)" title="Réduire">−</button>
            <button class="zoom-btn" onclick="zoomScore(0)" title="Taille normale">1:1</button>
            <button class="zoom-btn" onclick="zoomScore(+0.1)" title="Agrandir">+</button>
          </div>
        </div>

        <!-- Exsurge SVG Render Target Container -->
        <div class="exsurge-score-viewport" id="scoreContainer">
          <div style="display:flex; align-items:center; justify-content:center; height:200px; color:var(--text-tertiary);">
            Chargement de la partition vectorielle...
          </div>
        </div>

        <!-- Rhythmic Prior Timeline Breakdown -->
        <div class="breakdown-card">
          <div class="breakdown-title">
            <span>Distribution des durées pondérées GABC (Priors rythmiques)</span>
            <span id="breakdownTotalNotes" style="font-weight:400; text-transform:none;">— notes</span>
          </div>
          <div class="prior-bar-track" id="priorBarTrack" title="Barre des priors proportionnels au GABC"></div>

          <details class="gabc-code-details">
            <summary>Voir le code source GABC officiel de la pièce</summary>
            <pre class="gabc-raw-box" id="rawGabcBox"></pre>
          </details>
        </div>
      </div>
    </div>

  </div>

</main>

<footer class="lab-footer">
  Oremus / Divinum Officium — Module d'alignement audio-partition grégorienne v3.1 corrigé (WhisperX + CREPE + Priors GABC)
</footer>

<script>
// ── Palette for Word Segment Highlights in Prior Bar ──
const WORD_COLORS = [
  '#c96b63', '#987dc2', '#589c77', '#c4984f', '#5c8bb8',
  '#cc738a', '#ba8155', '#7e8590', '#9c8b5f', '#6b8caa'
];

let currentPieceIndex = 0;
let ytPlayer = null;
let ytReady = false;
let isPlaying = false;
let syncEnabled = true;
let currentPlaybackSpeed = 1.0;
let currentScoreScale = 1.0;
let introOffsetSec = 0.0;
let currentScore = null;
let currentChantInfo = null;
let activeNoteIndex = -1;
let activeNoteEl = null;
let activeLyricEl = null;
let progressInterval = null;

// ── 1. GABC Preprocessing for Exsurge (From divinum_officium.js) ──
function preprocessGabcForExsurge(gabc) {
  if (!gabc || typeof gabc !== 'string') return gabc;
  gabc = gabc.replace(/<eu>([\s\S]*?)<\/eu>/gi, function(match, inner) {
    return inner.replace(/(^|\))([^()]+)(?=\(|$)/g, function(m, closeParen, text) {
      var trimmed = text.trim();
      if (!trimmed) return m;
      var leadingSpace = text.match(/^\s*/)[0];
      var trailingSpace = text.match(/\s*$/)[0];
      return closeParen + leadingSpace + '<c><i>' + trimmed + '</i></c>' + trailingSpace;
    });
  });
  gabc = gabc.replace(/<\/?eu>/gi, '');
  gabc = gabc.replace(/\[[ou]?ll:[^\]]*\]/ig, '');
  gabc = gabc.replace(/\[(?:cs|alt|nobar)[^\]]*\]/ig, '');
  gabc = gabc.replace(/<v>\\([VRA])bar<\/v>/gi, function(m, b) { return b.toUpperCase() + '/.'; })
             .replace(/<sp>([VRA])\/?<\/sp>\.?/gi, function(m, b) { return b.toUpperCase() + '/.'; });
  gabc = gabc.replace(/(^|\s|\))<i>\s*(Ps\.?|Psalmus)\s*<\/i>/gi, '$1<c><i>Ps.</i></c>');
  gabc = gabc.replace(/(^|\s|\))(Ps\.)(?=\s+[A-ZÁÉÍÓÚ])/g, '$1<c><i>Ps.</i></c>');
  gabc = gabc.replace(/(^|\s|\))<i>\s*([V℣]\.?|Versus)\s*<\/i>/gi, '$1<c><i>℣.</i></c>');
  gabc = gabc.replace(/(^|\s|\))(V\/\.?)(?=\s*[0-9A-ZÁÉÍÓÚ(])/g, '$1<c><i>℣.</i></c>');
  gabc = gabc.replace(/(^|\s|\))<i>\s*([R℟]\.?|Responsorium)\s*<\/i>/gi, '$1<c><i>℟.</i></c>');
  gabc = gabc.replace(/(^|\s|\))(R\/\.?)(?=\s*[0-9A-ZÁÉÍÓÚ(])/g, '$1<c><i>℟.</i></c>');
  gabc = gabc.replace(/(^|\s|\))<i>\s*(?:Extra\s+)?T\.?\s*P\.?\s*<\/i>/gi, '$1<c><i>T. P.</i></c>');
  return gabc;
}

// ── 2. Weighted Durations & Inter-phrase Gaps (From divinum_officium.js) ──
function _chantNoteWeightedDuration(allNotes, idx) {
  var note = allNotes[idx];
  if (!note || (note.constructor && note.constructor.name !== 'Note' && !note.pitch)) return 1;
  var nextNote = allNotes[idx+1];
  if (nextNote && nextNote.constructor && nextNote.constructor.name !== 'Note') nextNote = null;
  var dur = 1;
  try {
    if (note.morae && note.morae.length) dur = (note.morae.length > 1) ? 2.4 : 1.9;
    else if (nextNote && nextNote.morae && nextNote.morae.length) dur = 1.8;
    else if (note.episemata && note.episemata.length) dur = 1.25;
    else if (window.exsurge && note.shape === exsurge.NoteShape.Quilisma) dur = 0.9;
  } catch(e) {}
  return dur;
}

function _getChantWeightedInfo(score) {
  if (!score || !score.notations) return null;
  var allNotes = [].concat.apply([], score.notations.map(function(n){ return n.notes || []; }))
                          .filter(function(n){ return n && !n.isAccidental; });
  if (!allNotes.length) return null;
  var noteDurs = [];
  for (var i = 0; i < allNotes.length; i++) {
    noteDurs.push(_chantNoteWeightedDuration(allNotes, i));
  }
  var gapAfterNote = {};
  var notePos = 0;
  for (var ni = 0; ni < score.notations.length; ni++) {
    var notat = score.notations[ni];
    var isDiv = !!(notat.isDivider || /Bar$/.test(String(notat.constructor && notat.constructor.name || '')));
    if (notat.notes && notat.notes.length) {
      var cnt = notat.notes.filter(function(n){ return !n.isAccidental; }).length;
      notePos += cnt;
    } else if (isDiv) {
      var gap = 0;
      var cname = String(notat.constructor && notat.constructor.name || String(notat.constructor));
      if (/DoubleBar|FullBar/.test(cname)) gap = 1.6;
      else if (/HalfBar|DominicanBar|Virgula/.test(cname)) gap = 0.7;
      else gap = 0.45;
      var prevIdx = notePos - 1;
      if (prevIdx >= 0) gapAfterNote[prevIdx] = Math.max(gapAfterNote[prevIdx] || 0, gap);
    }
  }
  var total = 0;
  for (var k = 0; k < noteDurs.length; k++) {
    total += noteDurs[k];
    if (gapAfterNote[k]) total += gapAfterNote[k];
  }
  return { allNotes: allNotes, noteDurs: noteDurs, gapAfterNote: gapAfterNote, total: total };
}

function _fractionToChantIndex(info, fraction) {
  if (!info || !info.allNotes.length) return 0;
  var target = Math.max(0, Math.min(info.total, fraction * info.total));
  var cum = 0;
  for (var i = 0; i < info.allNotes.length; i++) {
    var nd = info.noteDurs[i];
    if (target < cum + nd) return i;
    cum += nd;
    var gap = info.gapAfterNote[i] || 0;
    if (gap) {
      if (target < cum + gap) return i;
      cum += gap;
    }
  }
  return info.allNotes.length - 1;
}

function _indexToFraction(info, idx) {
  if (!info || !info.total) return 0;
  var cum = 0;
  for (var i = 0; i < idx && i < info.allNotes.length; i++) {
    cum += info.noteDurs[i];
    if (info.gapAfterNote[i]) cum += info.gapAfterNote[i];
  }
  return cum / info.total;
}

// ── 3. Score Rendering via Exsurge ──
function renderPieceScore(piece) {
  const container = document.getElementById('scoreContainer');
  container.innerHTML = '<div style="color:var(--text-tertiary); padding:40px;">Mise en page Exsurge en cours...</div>';

  const ctxt = new exsurge.ChantContext();
  const curTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  const isDark = (curTheme !== 'light');
  const accentColor = '#c96b63';

  ctxt.textColor = isDark ? '#ffffff' : '#111317';
  ctxt.noteColor = isDark ? '#ffffff' : '#111317';
  ctxt.neumeLineColor = isDark ? '#ffffff' : '#111317';
  ctxt.dividerLineColor = isDark ? '#ffffff' : '#111317';
  ctxt.staffLineColor = isDark ? 'rgba(255, 255, 255, 0.55)' : 'rgba(0, 0, 0, 0.45)';

  ctxt.setFont("'Crimson Text', 'Libre Baskerville', serif", 16);
  ctxt.setRubricColor(accentColor);
  ctxt.specialCharColor = accentColor;
  ctxt.rubricColor = accentColor;
  ctxt.lyricTextColor = isDark ? '#ffffff' : '#111317';
  ctxt.lyricTextFont = "'Crimson Text', 'Libre Baskerville', serif";
  ctxt.annotationTextFont = ctxt.lyricTextFont;

  if (ctxt.textStyles) {
    Object.keys(ctxt.textStyles).forEach(function(k) {
      if (ctxt.textStyles[k]) {
        ctxt.textStyles[k].color = isDark ? '#ffffff' : '#111317';
        ctxt.textStyles[k].font = "'Crimson Text', 'Libre Baskerville', serif";
      }
    });
  }

  const processed = preprocessGabcForExsurge(piece.gabc_src);
  const mappings = exsurge.Gabc.createMappingsFromSource(ctxt, processed);
  const score = new exsurge.ChantScore(ctxt, mappings, true);

  // Annotation: Office Part + Mode
  var romanNumeral = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
  var topAnnot = (piece.part || 'Chant').toUpperCase().slice(0, 5) + '.';
  var mMatch = piece.gabc_src.match(/mode:\s*([1-8])/i);
  var bottomAnnot = mMatch ? romanNumeral[parseInt(mMatch[1], 10)] : '';
  if (topAnnot && bottomAnnot) {
    score.annotation = new exsurge.Annotations(ctxt, '%' + topAnnot + '%', '%' + bottomAnnot + '%');
  } else if (topAnnot) {
    score.annotation = new exsurge.Annotations(ctxt, '%' + topAnnot + '%');
  }

  // Layout width
  var availWidth = container.clientWidth || 740;
  if (availWidth < 360) availWidth = 360;
  ctxt.width = availWidth;

  score.performLayout(ctxt);
  score.layoutChantLines(ctxt, availWidth, function() {
    var svg = score.createSvgNode(ctxt);
    if (!svg) {
      container.innerHTML = '<div style="color:red;">Erreur création SVG</div>';
      return;
    }
    svg.setAttribute('width', '100%');
    svg.style.width = '100%';
    svg.style.maxWidth = '100%';
    svg.style.height = 'auto';

    var noteFill = isDark ? '#ffffff' : '#111317';
    svg.setAttribute('fill', noteFill);
    svg.style.fill = noteFill;

    container.innerHTML = '';
    container.appendChild(svg);

    currentScore = score;
    score.svg = svg;
    currentChantInfo = _getChantWeightedInfo(score);

    // Build Prior Bar Segments
    buildPriorBar(piece, currentChantInfo);

    // Setup interactive note-click handlers
    setupScoreClickHandlers(svg, currentChantInfo);

    // Reset highlight
    highlightNote(0);
  });
}

// ── 4. Interactive Note-Click on SVG Score ──
function setupScoreClickHandlers(svg, info) {
  if (!svg || !info) return;

  svg.addEventListener('click', function(e) {
    var target = e.target;
    var noteEl = target.closest('use[source-index], use[element-index]');
    var lyricEl = target.closest('text.lyric, text.dropCap, text.aboveLinesText, text');

    var targetIndex = -1;

    if (noteEl) {
      // Find note in allNotes
      for (var i = 0; i < info.allNotes.length; i++) {
        if (info.allNotes[i].svgNode === noteEl ||
            info.allNotes[i].sourceIndex == noteEl.getAttribute('source-index') ||
            info.allNotes[i].elementIndex == noteEl.getAttribute('element-index')) {
          targetIndex = i;
          break;
        }
      }
    } else if (lyricEl) {
      // Find note corresponding to this syllable
      for (var j = 0; j < info.allNotes.length; j++) {
        var n = info.allNotes[j];
        if (n.neume && n.neume.lyrics && n.neume.lyrics.some(l => l.svgNode === lyricEl || lyricEl.contains(l.svgNode))) {
          targetIndex = j;
          break;
        }
      }
      if (targetIndex === -1) {
        var grp = lyricEl.closest('g.ChantNotationElement');
        if (grp) {
          var firstUse = grp.querySelector('use[source-index]');
          if (firstUse) {
            for (var k = 0; k < info.allNotes.length; k++) {
              if (info.allNotes[k].svgNode === firstUse || info.allNotes[k].sourceIndex == firstUse.getAttribute('source-index')) {
                targetIndex = k;
                break;
              }
            }
          }
        }
      }
    }

    if (targetIndex >= 0) {
      var timestamps = PIECES[currentPieceIndex].timestamps;
      if (timestamps && timestamps[targetIndex]) {
        var sec = timestamps[targetIndex].start;
        if (ytPlayer && ytReady) ytPlayer.seekTo(sec, true);
        highlightNote(targetIndex);
      } else {
        var frac = _indexToFraction(info, targetIndex);
        seekToFraction(frac);
        highlightNote(targetIndex);
      }
    }
  });
}

// ── 5. Note & Syllable Highlighting ──
function highlightNote(idx) {
  if (!currentChantInfo || !currentChantInfo.allNotes.length) return;
  if (idx < 0 || idx >= currentChantInfo.allNotes.length) return;
  if (idx === activeNoteIndex && activeNoteEl && activeNoteEl.classList.contains('active')) return;

  activeNoteIndex = idx;
  const note = currentChantInfo.allNotes[idx];
  const accentColor = '#c96b63';

  // Un-highlight previous note
  if (activeNoteEl) {
    activeNoteEl.classList.remove('active', 'porrectus-left', 'porrectus-right');
    activeNoteEl.style.removeProperty('fill');
    activeNoteEl = null;
  }
  // Un-highlight previous lyric
  if (activeLyricEl) {
    activeLyricEl.classList.remove('active');
    activeLyricEl.style.removeProperty('fill');
    activeLyricEl.querySelectorAll('tspan').forEach(ts => {
      ts.classList.remove('active');
      ts.style.removeProperty('fill');
    });
    activeLyricEl = null;
  }

  // Find note SVG node
  var noteElem = note.svgNode;
  if (!noteElem && currentScore && currentScore.svg) {
    if (note.elementIndex !== undefined) {
      noteElem = currentScore.svg.querySelector('use[element-index="' + note.elementIndex + '"]');
    }
    if (!noteElem && note.sourceIndex !== undefined) {
      noteElem = currentScore.svg.querySelector('use[source-index="' + note.sourceIndex + '"]');
    }
  }

  if (noteElem) {
    var href = noteElem.getAttribute('href') || (noteElem.attributes && noteElem.attributes['href'] ? noteElem.attributes['href'].value : '');
    if (href === '#None' && noteElem.previousSibling) {
      noteElem = noteElem.previousSibling;
      noteElem.classList.add('porrectus-right');
    } else if (/^#Porrectus/.test(href)) {
      noteElem.classList.add('porrectus-left');
    }

    noteElem.classList.add('active');
    noteElem.style.setProperty('fill', accentColor, 'important');
    activeNoteEl = noteElem;

    // Highlight corresponding lyric text
    var lyricEl = null;
    if (note.neume && note.neume.lyrics && note.neume.lyrics.length > 0 && note.neume.lyrics[0].svgNode) {
      lyricEl = note.neume.lyrics[0].svgNode;
    }
    if (!lyricEl) {
      var grp = noteElem.closest('g.ChantNotationElement') || noteElem.parentNode.parentNode;
      if (grp) lyricEl = grp.querySelector('text.lyric, text.dropCap, text.aboveLinesText, text');
    }
    if (lyricEl) {
      lyricEl.classList.add('active');
      lyricEl.style.setProperty('fill', accentColor, 'important');
      lyricEl.querySelectorAll('tspan').forEach(ts => {
        ts.classList.add('active');
        ts.style.setProperty('fill', accentColor, 'important');
      });
      activeLyricEl = lyricEl;
    }

    // Auto-scroll score line smoothly
    try {
      var lineEl = noteElem.closest('g.ChantLine');
      if (lineEl && lineEl.scrollIntoViewIfNeeded) {
        lineEl.scrollIntoViewIfNeeded({ block: 'nearest', behavior: 'smooth' });
      }
    } catch(e) {}
  }

  // Highlight Prior Bar Segment
  document.querySelectorAll('.prior-segment').forEach((el, i) => {
    if (i === idx) el.classList.add('active');
    else el.classList.remove('active');
  });

  // Update HUD
  updateHUD(idx, note);
}

function updateHUD(idx, note) {
  document.getElementById('hudNoteIndex').textContent = (idx + 1) + ' / ' + currentChantInfo.allNotes.length;
  var pName = note && note.pitch ? note.pitch.toString() : '—';
  var shape = note && note.shape !== undefined ? (note.shape === 0 ? 'Punctum' : 'Neume') : '';
  document.getElementById('hudTokenName').textContent = pName + ' ' + (shape ? '(' + shape + ')' : '');

  var timestamps = PIECES[currentPieceIndex].timestamps;
  if (timestamps && timestamps[idx]) {
    var ts = timestamps[idx];
    document.getElementById('hudDurationWeight').textContent = ts.start.toFixed(2) + 's → ' + ts.end.toFixed(2) + 's (' + Math.round(ts.duration * 1000) + ' ms)';
    if (ts.word) document.getElementById('hudWordText').textContent = ts.word;
  } else {
    var durWeight = currentChantInfo.noteDurs[idx] || 1;
    document.getElementById('hudDurationWeight').textContent = durWeight.toFixed(2) + '× (prior)';
  }

  // Find lyric syllable text
  var txt = '—';
  if (note && note.neume && note.neume.lyrics && note.neume.lyrics.length > 0) {
    txt = note.neume.lyrics[0].text || '—';
  } else if (activeLyricEl) {
    txt = activeLyricEl.textContent || '—';
  }
  document.getElementById('hudWordText').textContent = txt.trim() || '—';
}

// ── 6. Build Prior Bar Segments ──
function buildPriorBar(piece, info) {
  const track = document.getElementById('priorBarTrack');
  track.innerHTML = '';
  if (!info || !info.allNotes.length) return;

  document.getElementById('breakdownTotalNotes').textContent = info.allNotes.length + ' notes';

  const total = info.total;
  info.allNotes.forEach((n, idx) => {
    const seg = document.createElement('div');
    seg.className = 'prior-segment';
    const dur = info.noteDurs[idx] + (info.gapAfterNote[idx] || 0);
    const pct = (dur / total) * 100;
    seg.style.width = pct + '%';
    const colIdx = Math.floor((idx / info.allNotes.length) * WORD_COLORS.length);
    seg.style.backgroundColor = WORD_COLORS[colIdx % WORD_COLORS.length];
    seg.style.opacity = (0.35 + (idx % 2) * 0.25).toFixed(2);
    seg.title = 'Note ' + (idx+1) + ' | Poids: ' + dur.toFixed(2);
    seg.onclick = function() {
      var frac = _indexToFraction(info, idx);
      seekToFraction(frac);
      highlightNote(idx);
    };
    track.appendChild(seg);
  });
}

// ── 7. YouTube Player & Real-time Synchronization Loop ──
function initYouTubePlayer(videoId) {
  if (!window.YT || !window.YT.Player) {
    setTimeout(() => initYouTubePlayer(videoId), 200);
    return;
  }

  if (ytPlayer && typeof ytPlayer.destroy === 'function') {
    try { ytPlayer.destroy(); } catch(e) {}
    ytPlayer = null;
    ytReady = false;
  }

  document.getElementById('ytPlayerSlot').innerHTML = '';

  ytPlayer = new YT.Player('ytPlayerSlot', {
    videoId: videoId,
    playerVars: {
      autoplay: 0,
      controls: 1,
      modestbranding: 1,
      rel: 0,
      playsinline: 1
    },
    events: {
      onReady: function() {
        ytReady = true;
        if (currentPlaybackSpeed !== 1.0) {
          try { ytPlayer.setPlaybackRate(currentPlaybackSpeed); } catch(e) {}
        }
        updateTimeDisplays();
      },
      onStateChange: function(event) {
        if (event.data === YT.PlayerState.PLAYING) {
          isPlaying = true;
          document.getElementById('iconPlay').style.display = 'none';
          document.getElementById('iconPause').style.display = 'block';
          startProgressLoop();
        } else {
          isPlaying = false;
          document.getElementById('iconPlay').style.display = 'block';
          document.getElementById('iconPause').style.display = 'none';
          if (event.data === YT.PlayerState.ENDED) {
            seekToFraction(0);
          }
        }
      }
    }
  });
}

function startProgressLoop() {
  if (progressInterval) clearInterval(progressInterval);
  progressInterval = setInterval(function() {
    if (!ytPlayer || !ytReady) return;
    try {
      var cur = ytPlayer.getCurrentTime() || 0;
      var dur = ytPlayer.getDuration() || 0;
      if (dur > 0) {
        // Adjust for intro offset if configured
        var effCur = Math.max(0, cur - introOffsetSec);
        var effDur = Math.max(1, dur - introOffsetSec);
        var frac = Math.max(0, Math.min(1, effCur / effDur));

        // Update progress bar
        document.getElementById('progressFill').style.width = (frac * 100) + '%';
        document.getElementById('lblCurrentTime').textContent = formatTime(cur);
        document.getElementById('lblTotalTime').textContent = formatTime(dur);

        // Synchronize note highlighting on Exsurge SVG score!
        if (syncEnabled) {
          var timestamps = PIECES[currentPieceIndex].timestamps;
          if (timestamps && timestamps.length > 0) {
            var noteIdx = -1;
            for (var i = 0; i < timestamps.length; i++) {
              if (cur >= timestamps[i].start && cur < timestamps[i].end) {
                noteIdx = i;
                break;
              }
            }
            if (noteIdx === -1 && cur >= timestamps[timestamps.length - 1].end) {
              noteIdx = timestamps.length - 1;
            }
            if (noteIdx >= 0) {
              highlightNote(noteIdx);
            }
          } else if (currentChantInfo) {
            var targetIdx = _fractionToChantIndex(currentChantInfo, frac);
            highlightNote(targetIdx);
          }
        }
      }
    } catch(e) {}
  }, 35);
}

function updateTimeDisplays() {
  if (!ytPlayer || !ytReady) return;
  try {
    var cur = ytPlayer.getCurrentTime() || 0;
    var dur = ytPlayer.getDuration() || 0;
    document.getElementById('lblCurrentTime').textContent = formatTime(cur);
    document.getElementById('lblTotalTime').textContent = formatTime(dur);
    if (dur > 0) {
      document.getElementById('progressFill').style.width = ((cur / dur) * 100) + '%';
    }
  } catch(e) {}
}

function seekToFraction(frac) {
  if (!ytPlayer || !ytReady) return;
  try {
    var dur = ytPlayer.getDuration() || 0;
    if (dur > 0) {
      var effDur = Math.max(1, dur - introOffsetSec);
      var targetSec = introOffsetSec + (frac * effDur);
      ytPlayer.seekTo(targetSec, true);
      document.getElementById('progressFill').style.width = (frac * 100) + '%';
      document.getElementById('lblCurrentTime').textContent = formatTime(targetSec);
    }
  } catch(e) {}
}

function formatTime(sec) {
  if (isNaN(sec) || sec < 0) sec = 0;
  var m = Math.floor(sec / 60);
  var s = Math.floor(sec % 60);
  return m + ':' + (s < 10 ? '0' : '') + s;
}

// ── 8. Controls Interactions ──
document.getElementById('btnHeroPlay').onclick = function() {
  if (!ytPlayer || !ytReady) return;
  if (isPlaying) {
    ytPlayer.pauseVideo();
  } else {
    ytPlayer.playVideo();
  }
};

document.getElementById('btnRestart').onclick = function() {
  seekToFraction(0);
  highlightNote(0);
  if (ytPlayer && ytReady) ytPlayer.seekTo(0, true);
};

document.getElementById('btnNextNote').onclick = function() {
  if (!currentChantInfo) return;
  var nextIdx = Math.min(currentChantInfo.allNotes.length - 1, activeNoteIndex + 1);
  var frac = _indexToFraction(currentChantInfo, nextIdx);
  seekToFraction(frac);
  highlightNote(nextIdx);
};

const speeds = [0.75, 1.0, 1.25, 1.5];
document.getElementById('btnSpeedCycle').onclick = function() {
  var curIdx = speeds.indexOf(currentPlaybackSpeed);
  currentPlaybackSpeed = speeds[(curIdx + 1) % speeds.length];
  document.getElementById('lblSpeed').textContent = currentPlaybackSpeed.toFixed(currentPlaybackSpeed % 1 === 0 ? 1 : 2) + '×';
  if (ytPlayer && ytReady) {
    try { ytPlayer.setPlaybackRate(currentPlaybackSpeed); } catch(e) {}
  }
};

document.getElementById('btnToggleSync').onclick = function() {
  syncEnabled = !syncEnabled;
  this.classList.toggle('active', syncEnabled);
};

// Progress Track Click & Drag
document.getElementById('progressTrack').onclick = function(e) {
  var rect = this.getBoundingClientRect();
  var frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  seekToFraction(frac);
  if (currentChantInfo) {
    var idx = _fractionToChantIndex(currentChantInfo, frac);
    highlightNote(idx);
  }
};

// Offset Adjustments
function setOffset(sec) {
  introOffsetSec = sec;
  document.getElementById('lblOffsetVal').textContent = sec.toFixed(1) + 's';
}
function adjustOffset(delta) {
  introOffsetSec = Math.max(0, introOffsetSec + delta);
  document.getElementById('lblOffsetVal').textContent = introOffsetSec.toFixed(1) + 's';
}

// Score Zoom
function zoomScore(delta) {
  if (delta === 0) currentScoreScale = 1.0;
  else currentScoreScale = Math.max(0.6, Math.min(1.8, currentScoreScale + delta));
  const el = document.getElementById('scoreContainer');
  el.style.transform = 'scale(' + currentScoreScale + ')';
}

// Theme Toggle
document.getElementById('btnToggleTheme').onclick = function() {
  var cur = document.documentElement.getAttribute('data-theme') || 'dark';
  var nxt = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', nxt);
  renderPieceScore(PIECES[currentPieceIndex]);
};

// Keyboard Shortcuts: Space for Play/Pause, Arrows for Notes
window.addEventListener('keydown', function(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.code === 'Space') {
    e.preventDefault();
    document.getElementById('btnHeroPlay').click();
  } else if (e.code === 'ArrowRight') {
    e.preventDefault();
    document.getElementById('btnNextNote').click();
  } else if (e.code === 'ArrowLeft') {
    e.preventDefault();
    if (currentChantInfo && activeNoteIndex > 0) {
      var prevIdx = activeNoteIndex - 1;
      var frac = _indexToFraction(currentChantInfo, prevIdx);
      seekToFraction(frac);
      highlightNote(prevIdx);
    }
  }
});

// ── 9. Load Piece by Index ──
function loadPiece(index) {
  if (index < 0 || index >= PIECES.length) return;
  currentPieceIndex = index;
  const piece = PIECES[index];

  // Update tabs active state
  document.querySelectorAll('.piece-tab-btn').forEach((tab, i) => {
    tab.classList.toggle('active', i === index);
  });

  // Metadata headers
  document.getElementById('scorePartBadge').textContent = (piece.part || 'Chant').toUpperCase();
  document.getElementById('scoreChantTitle').textContent = piece.incipit;
  document.getElementById('ytSourceBadge').textContent = '▶ ' + (piece.source || 'YouTube');
  document.getElementById('rawGabcBox').textContent = piece.gabc_src;

  // Reset offset for piece
  introOffsetSec = 0.0;
  document.getElementById('lblOffsetVal').textContent = '0.0s';

  // Render Gregorian score via Exsurge
  renderPieceScore(piece);

  // Load YouTube video
  initYouTubePlayer(piece.youtube_id);
}

// ── 10. Initialization ──
function init() {
  const navBar = document.getElementById('pieceNavBar');
  navBar.innerHTML = '';

  PIECES.forEach((piece, idx) => {
    const btn = document.createElement('button');
    btn.className = 'piece-tab-btn' + (idx === 0 ? ' active' : '');
    btn.innerHTML = `
      <span class="piece-tab-title">${piece.incipit.split('(')[0].trim()}</span>
      <span class="piece-tab-subtitle">${piece.part} · ${piece.total_notes} notes</span>
    `;
    btn.onclick = () => loadPiece(idx);
    navBar.appendChild(btn);
  });

  // Window resize debounced re-render
  let resizeTimeout = null;
  window.addEventListener('resize', function() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(function() {
      if (currentPieceIndex >= 0 && PIECES[currentPieceIndex]) {
        renderPieceScore(PIECES[currentPieceIndex]);
      }
    }, 250);
  });

  // Start with first piece
  loadPiece(0);
}

// Run on window load
window.addEventListener('DOMContentLoaded', init);
</script>

</body>
</html>
'''

output_path = os.path.join(os.path.dirname(__file__), 'align', 'alignment-lab.html')
with open(output_path, 'w', encoding='utf-8') as f:
    f.write(HTML_CONTENT)
print(f"alignment-lab.html successfully written! Size: {len(HTML_CONTENT)} characters")
