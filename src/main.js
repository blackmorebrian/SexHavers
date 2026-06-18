/**
 * MTG Commander Life Counter — Main Application
 *
 * A premium life counter for Magic: The Gathering Commander format
 * supporting 4 or 5 players, with immersive sound effects.
 */

import './style.css';
import SoundEngine from './sounds.js';

// ============================================================================
// Constants
// ============================================================================

const STARTING_LIFE = 40;
const POISON_LETHAL = 10;
const COMMANDER_LETHAL = 21;
const LONG_PRESS_MS = 400;
const LONG_PRESS_INTERVAL = 120;

const PLAYER_COLORS = [
  { name: 'Crimson',  hex: '#E63946', glow: 'rgba(230, 57, 70, 0.12)',  hue: 310 },
  { name: 'Coral',    hex: '#FF6B6B', glow: 'rgba(255, 107, 107, 0.12)', hue: 315 },
  { name: 'Sunset',   hex: '#FF8C42', glow: 'rgba(255, 140, 66, 0.12)',  hue: 340 },
  { name: 'Amber',    hex: '#FFB627', glow: 'rgba(255, 182, 39, 0.12)',  hue: 355 },
  { name: 'Gold',     hex: '#DAA520', glow: 'rgba(218, 165, 32, 0.12)',  hue: 0 },
  { name: 'Lime',     hex: '#A7C957', glow: 'rgba(167, 201, 87, 0.12)',  hue: 40 },
  { name: 'Emerald',  hex: '#2DC653', glow: 'rgba(45, 198, 83, 0.12)',   hue: 93 },
  { name: 'Teal',     hex: '#20B2AA', glow: 'rgba(32, 178, 170, 0.12)',  hue: 132 },
  { name: 'Cyan',     hex: '#00D4FF', glow: 'rgba(0, 212, 255, 0.12)',   hue: 148 },
  { name: 'Sky',      hex: '#4DA8DA', glow: 'rgba(77, 168, 218, 0.12)',  hue: 158 },
  { name: 'Indigo',   hex: '#5C6BC0', glow: 'rgba(92, 107, 192, 0.12)',  hue: 186 },
  { name: 'Violet',   hex: '#9B59B6', glow: 'rgba(155, 89, 182, 0.12)', hue: 238 },
  { name: 'Magenta',  hex: '#E040FB', glow: 'rgba(224, 64, 251, 0.12)', hue: 246 },
  { name: 'Rose',     hex: '#F48FB1', glow: 'rgba(244, 143, 177, 0.12)', hue: 295 },
  { name: 'Slate',    hex: '#6B7D8D', glow: 'rgba(107, 125, 141, 0.12)', hue: 157 },
  { name: 'Ivory',    hex: '#F5F0E8', glow: 'rgba(245, 240, 232, 0.08)', hue: 0 },
];

const DEFAULT_PLAYER_COLORS = [0, 9, 6, 3, 11]; // Crimson, Sky, Emerald, Amber, Violet

// ============================================================================
// Sound Engine Instance
// ============================================================================

const sound = new SoundEngine();

// ============================================================================
// Game State
// ============================================================================

let gameState = {
  screen: 'splash', // 'splash' | 'setup' | 'game'
  playerCount: 4,
  players: [],
  history: [],
  settings: {
    soundEnabled: true,
    volume: 0.7,
    autoDeductCommanderDamage: true,
  },
};

function createPlayers(count) {
  const players = [];
  for (let i = 0; i < count; i++) {
    players.push({
      id: i,
      name: `Player ${i + 1}`,
      life: STARTING_LIFE,
      poison: 0,
      colorIndex: DEFAULT_PLAYER_COLORS[i],
      commanderDamage: {}, // { opponentId: amount }
      isDead: false,
      deathReason: '',
    });
  }
  // Initialize commander damage tracking
  for (const player of players) {
    for (const other of players) {
      if (other.id !== player.id) {
        player.commanderDamage[other.id] = 0;
      }
    }
  }
  return players;
}

// ============================================================================
// History / Undo System
// ============================================================================

function pushHistory() {
  const snapshot = JSON.parse(JSON.stringify(gameState.players));
  gameState.history.push(snapshot);
  if (gameState.history.length > 50) gameState.history.shift();
}

function undo() {
  if (gameState.history.length === 0) return;
  gameState.players = gameState.history.pop();
  renderGameBoard();
  sound.playButtonClick();
}

// ============================================================================
// Death Checking
// ============================================================================

function checkDeath(player) {
  if (player.life <= 0) {
    player.isDead = true;
    player.deathReason = 'Life reached 0';
    return true;
  }
  if (player.poison >= POISON_LETHAL) {
    player.isDead = true;
    player.deathReason = `${player.poison} poison counters`;
    return true;
  }
  for (const [oppId, dmg] of Object.entries(player.commanderDamage)) {
    if (dmg >= COMMANDER_LETHAL) {
      const opp = gameState.players.find(p => p.id === parseInt(oppId));
      player.isDead = true;
      player.deathReason = `21+ commander damage from ${opp?.name || 'opponent'}`;
      return true;
    }
  }
  player.isDead = false;
  player.deathReason = '';
  return false;
}

// ============================================================================

// ============================================================================
// Screen Wake Lock
// ============================================================================

let wakeLock = null;

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
    }
  } catch (err) {
    // Silently fail
  }
}

// ============================================================================
// Render Functions
// ============================================================================

const app = document.getElementById('app');

// ── Splash Screen ──────────────────────────────────────────────────────────

function renderSplash() {
  app.innerHTML = `
    <div class="splash-screen" id="splash-screen">
      <div class="splash-bg"></div>
      <div class="splash-content">
        <div class="splash-logo-container">
          <img src="/sex-havers-logo.png" alt="Sex Havers Logo" class="splash-logo-img" id="splash-logo" />
          <div class="splash-logo-glow"></div>
        </div>
        <div class="splash-tap-text" id="splash-tap">TAP TO ENTER</div>
      </div>
      <div class="splash-particles" id="splash-particles"></div>
    </div>
  `;

  // Add splash-specific styles
  const style = document.createElement('style');
  style.id = 'splash-styles';
  style.textContent = `
    .splash-screen {
      width: 100%; height: 100%;
      display: flex; align-items: center; justify-content: center;
      background: #030305;
      position: relative; overflow: hidden;
      cursor: pointer;
    }

    .splash-bg {
      position: absolute; top: 0; left: 0; right: 0; bottom: 0;
      background:
        radial-gradient(ellipse at 50% 50%, rgba(218, 165, 32, 0.06) 0%, transparent 50%),
        radial-gradient(ellipse at 30% 70%, rgba(155, 89, 182, 0.04) 0%, transparent 40%),
        radial-gradient(ellipse at 70% 30%, rgba(230, 57, 70, 0.04) 0%, transparent 40%);
      animation: splashBgPulse 4s ease-in-out infinite alternate;
    }

    @keyframes splashBgPulse {
      0% { opacity: 0.5; }
      100% { opacity: 1; }
    }

    .splash-content {
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      z-index: 10;
      animation: splashFadeIn 1.2s cubic-bezier(0.16, 1, 0.3, 1) both;
    }

    @keyframes splashFadeIn {
      from { opacity: 0; transform: scale(0.8) translateY(30px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }

    .splash-logo-container {
      position: relative;
      width: min(70vw, 70vh, 500px);
      height: min(70vw, 70vh, 500px);
      display: flex; align-items: center; justify-content: center;
    }

    .splash-logo-img {
      width: 100%; height: 100%;
      object-fit: contain;
      filter: drop-shadow(0 0 40px rgba(218, 165, 32, 0.3)) drop-shadow(0 0 80px rgba(218, 165, 32, 0.1));
      animation: splashLogoFloat 3s ease-in-out infinite;
      /* Invert to make it white-on-dark */
      filter: invert(1) drop-shadow(0 0 40px rgba(218, 165, 32, 0.4)) drop-shadow(0 0 80px rgba(218, 165, 32, 0.15));
    }

    @keyframes splashLogoFloat {
      0%, 100% { transform: translateY(0) scale(1); }
      50% { transform: translateY(-8px) scale(1.01); }
    }

    .splash-logo-glow {
      position: absolute;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      width: 120%; height: 120%;
      border-radius: 50%;
      background: radial-gradient(circle, rgba(218, 165, 32, 0.12) 0%, transparent 60%);
      animation: glowPulse 2s ease-in-out infinite alternate;
      pointer-events: none;
    }

    @keyframes glowPulse {
      0% { opacity: 0.4; transform: translate(-50%, -50%) scale(0.9); }
      100% { opacity: 1; transform: translate(-50%, -50%) scale(1.1); }
    }

    .splash-tap-text {
      font-family: 'Outfit', sans-serif;
      font-size: 0.9rem;
      font-weight: 600;
      color: rgba(218, 165, 32, 0.5);
      text-transform: uppercase;
      letter-spacing: 0.25em;
      margin-top: 2rem;
      animation: tapPulse 2s ease-in-out infinite;
    }

    @keyframes tapPulse {
      0%, 100% { opacity: 0.3; }
      50% { opacity: 0.8; }
    }

    .splash-particles {
      position: absolute; top: 0; left: 0; right: 0; bottom: 0;
      pointer-events: none; z-index: 5;
    }

    .splash-particle {
      position: absolute;
      width: 2px; height: 2px;
      background: rgba(218, 165, 32, 0.6);
      border-radius: 50%;
      animation: particleFloat linear infinite;
    }

    @keyframes particleFloat {
      0% { transform: translateY(100vh) scale(0); opacity: 0; }
      10% { opacity: 1; }
      90% { opacity: 1; }
      100% { transform: translateY(-10vh) scale(1); opacity: 0; }
    }

    /* Splash entrance BOOM animation */
    .splash-boom .splash-logo-img {
      animation: splashBoom 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) both !important;
    }

    @keyframes splashBoom {
      0% { transform: scale(0.3); opacity: 0; filter: invert(1) drop-shadow(0 0 0px rgba(218, 165, 32, 0)); }
      50% { transform: scale(1.15); filter: invert(1) drop-shadow(0 0 80px rgba(218, 165, 32, 0.8)) drop-shadow(0 0 160px rgba(218, 165, 32, 0.4)); }
      100% { transform: scale(1); filter: invert(1) drop-shadow(0 0 40px rgba(218, 165, 32, 0.4)) drop-shadow(0 0 80px rgba(218, 165, 32, 0.15)); }
    }

    .splash-exit {
      animation: splashExit 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards !important;
    }

    @keyframes splashExit {
      to { opacity: 0; transform: scale(1.1); }
    }
  `;
  document.head.appendChild(style);

  // Create floating particles
  const particlesEl = document.getElementById('splash-particles');
  for (let i = 0; i < 20; i++) {
    const particle = document.createElement('div');
    particle.className = 'splash-particle';
    particle.style.left = `${Math.random() * 100}%`;
    particle.style.animationDuration = `${3 + Math.random() * 5}s`;
    particle.style.animationDelay = `${Math.random() * 5}s`;
    particle.style.width = `${1 + Math.random() * 3}px`;
    particle.style.height = particle.style.width;
    particlesEl.appendChild(particle);
  }

  // Trigger the entrance boom after a tiny delay
  setTimeout(() => {
    const content = document.querySelector('.splash-content');
    if (content) content.classList.add('splash-boom');
  }, 200);

  // Handle tap to continue
  const splashScreen = document.getElementById('splash-screen');
  let splashTapped = false;

  splashScreen.addEventListener('click', async () => {
    if (splashTapped) return;
    splashTapped = true;

    // Initialize audio context and load intro
    await sound.resume();
    await sound.loadIntro();
    sound.loadAllExternalSounds();

    // Play the Intro
    sound.playIntro();

    // Visual flash
    const flash = document.createElement('div');
    flash.style.cssText = `
      position: absolute; top: 0; left: 0; right: 0; bottom: 0;
      background: radial-gradient(circle, rgba(218, 165, 32, 0.3), transparent);
      z-index: 100; pointer-events: none;
      animation: flashOut 0.8s ease-out forwards;
    `;
    splashScreen.appendChild(flash);

    const flashStyle = document.createElement('style');
    flashStyle.textContent = `
      @keyframes flashOut {
        0% { opacity: 1; }
        100% { opacity: 0; }
      }
    `;
    document.head.appendChild(flashStyle);

    // Transition to setup after the voice plays
    setTimeout(() => {
      const content = document.querySelector('.splash-content');
      if (content) content.classList.add('splash-exit');

      setTimeout(() => {
        gameState.screen = 'setup';
        // Remove splash styles
        document.getElementById('splash-styles')?.remove();
        renderSetup();
      }, 500);
    }, 2200);
  });

  // Load voices (needed for some browsers)
  if ('speechSynthesis' in window) {
    speechSynthesis.getVoices();
    speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
  }
}

// ── Setup Screen ──────────────────────────────────────────────────────────

function renderSetup() {
  const playerConfigs = [];
  for (let i = 0; i < gameState.playerCount; i++) {
    const selectedColorHex = PLAYER_COLORS[DEFAULT_PLAYER_COLORS[i]].hex;
    
    // Generate minimap cells
    const minimapCells = Array.from({ length: gameState.playerCount }).map((_, cellIdx) => {
      const isActive = cellIdx === i;
      return `<div class="minimap-cell ${isActive ? 'active' : ''}" style="${isActive ? `--active-color: ${selectedColorHex};` : ''}" id="minimap-cell-${i}-${cellIdx}"></div>`;
    }).join('');

    const colorSwatches = PLAYER_COLORS.map((c, ci) => `
      <div class="color-swatch ${ci === DEFAULT_PLAYER_COLORS[i] ? 'active' : ''}"
           style="background: ${c.hex};"
           data-player="${i}" data-color="${ci}"
           id="swatch-${i}-${ci}"></div>
    `).join('');

    playerConfigs.push(`
      <div class="player-config-row" id="player-row-${i}">
        <div class="setup-minimap players-${gameState.playerCount}">
          ${minimapCells}
        </div>
        <span class="player-number">${i + 1}</span>
        <input type="text" class="player-name-input"
               id="player-name-${i}"
               placeholder="Player ${i + 1}"
               value="Player ${i + 1}"
               maxlength="12" />
        <div class="color-picker-container" id="color-picker-${i}">
          ${colorSwatches}
        </div>
      </div>
    `);
  }

  app.innerHTML = `
    <div class="setup-screen">
      <div class="setup-container">
        <div class="setup-header">
          <h1 class="setup-logo">COMMANDER</h1>
          <p class="setup-subtitle">Life Counter</p>
        </div>

        <div class="player-count-selector">
          <button class="player-count-btn ${gameState.playerCount === 4 ? 'active' : ''}"
                  id="btn-4-players">
            <span class="count-number">4</span>
            Players
          </button>
          <button class="player-count-btn ${gameState.playerCount === 5 ? 'active' : ''}"
                  id="btn-5-players">
            <span class="count-number">5</span>
            Players
          </button>
        </div>

        <div class="player-configs" id="player-configs">
          ${playerConfigs.join('')}
        </div>

        <button class="start-game-btn" id="start-game-btn">
          ⚔️ START GAME ⚔️
        </button>
      </div>
    </div>
  `;

  // Event listeners
  document.getElementById('btn-4-players').addEventListener('click', () => {
    gameState.playerCount = 4;
    sound.playButtonClick();
    renderSetup();
  });

  document.getElementById('btn-5-players').addEventListener('click', () => {
    gameState.playerCount = 5;
    sound.playButtonClick();
    renderSetup();
  });

  // Color swatch clicks
  document.querySelectorAll('.color-swatch').forEach(swatch => {
    swatch.addEventListener('click', () => {
      const playerIdx = parseInt(swatch.dataset.player);
      const colorIdx = parseInt(swatch.dataset.color);
      DEFAULT_PLAYER_COLORS[playerIdx] = colorIdx;
      sound.playButtonClick();

      // Update active states for this player
      document.querySelectorAll(`[data-player="${playerIdx}"]`).forEach(s => {
        s.classList.remove('active');
      });
      swatch.classList.add('active');
      
      // Update the minimap highlight color
      const activeCell = document.getElementById(`minimap-cell-${playerIdx}-${playerIdx}`);
      if (activeCell) {
        activeCell.style.setProperty('--active-color', PLAYER_COLORS[colorIdx].hex);
      }
    });
  });

  // Start game
  document.getElementById('start-game-btn').addEventListener('click', () => {
    // Gather player names and colors
    gameState.players = createPlayers(gameState.playerCount);
    for (let i = 0; i < gameState.playerCount; i++) {
      const nameInput = document.getElementById(`player-name-${i}`);
      gameState.players[i].name = nameInput.value.trim() || `Player ${i + 1}`;
      gameState.players[i].colorIndex = DEFAULT_PLAYER_COLORS[i];
    }

    gameState.screen = 'game';
    gameState.history = [];
    sound.playGameStart();
    requestWakeLock();
    renderGameBoard();
  });
}

// ── Game Board ──────────────────────────────────────────────────────────

function renderGameBoard() {
  const count = gameState.playerCount;

  const quadrants = gameState.players.map((player, idx) => {
    const color = PLAYER_COLORS[player.colorIndex];
    const isRotated = count === 4 ? idx < 2 : idx < 3;
    const poisonActive = player.poison > 0 ? 'active' : '';
    const poisonedClass = player.poison > 0 ? 'poisoned' : '';

    // Commander damage total received
    const totalCmdDmg = Object.values(player.commanderDamage).reduce((a, b) => a + b, 0);
    const cmdActive = totalCmdDmg > 0 ? 'active' : '';

    return `
      <div class="player-quadrant ${isRotated ? 'rotated' : ''} ${poisonedClass}"
           id="quadrant-${idx}"
           style="--player-color: ${color.hex}; --player-color-glow: ${color.glow}; --player-hue: ${color.hue}deg; background: linear-gradient(135deg, rgba(10,10,16,0.97), rgba(10,10,16,0.93)); border: 1px solid ${color.hex}22;">

        <img src="/sex-havers-logo.png" class="quadrant-watermark" alt="Logo Watermark" />

        <div class="touch-zone gain" id="touch-gain-${idx}" data-player="${idx}" data-action="gain"></div>
        <div class="touch-zone loss" id="touch-loss-${idx}" data-player="${idx}" data-action="loss"></div>

        <div class="player-content">
          <div class="player-name" style="color: ${color.hex}99;">${player.name}</div>
          <div class="life-total" id="life-${idx}" style="color: ${player.isDead ? 'var(--death-red)' : 'var(--text-primary)'};">${player.life}</div>
          <div class="life-change-indicator" id="indicator-${idx}"></div>

          <div class="counter-bar">
            <div class="counter-pill poison ${poisonActive}" id="poison-pill-${idx}" data-player="${idx}">
              <span class="icon">☠️</span>
              <span>${player.poison}</span>
            </div>
            <div class="counter-pill commander ${cmdActive}" id="cmd-pill-${idx}" data-player="${idx}">
              <span class="icon">⚔️</span>
              <span>${totalCmdDmg}</span>
            </div>
          </div>
        </div>

        ${renderDeathOverlay(player)}
        ${renderPoisonPanel(player)}
        ${renderCommanderPanel(player)}
      </div>
    `;
  }).join('');

  app.innerHTML = `
    <div class="game-board players-${count}" id="game-board">
      ${quadrants}
    </div>
    <div class="hud-bar" id="hud-bar">
      <button class="hud-btn" id="hud-undo" title="Undo">⏪</button>
      <button class="hud-btn" id="hud-restart" title="Restart Match">🔄</button>
      <button class="hud-btn" id="hud-sound" title="Toggle Sound">${gameState.settings.soundEnabled ? '🔊' : '🔇'}</button>
      <button class="hud-btn" id="hud-settings" title="Settings">⚙️</button>
    </div>
    ${renderSettingsPanel()}
    ${renderConfirmModal()}
  `;

  attachGameListeners();
}

function renderDeathOverlay(player) {
  return `
    <div class="death-overlay ${player.isDead ? 'visible' : ''}" id="death-${player.id}">
      <div class="death-skull">💀</div>
      <div class="death-text">ELIMINATED</div>
      <div class="death-reason">${player.deathReason}</div>
    </div>
  `;
}

function renderPoisonPanel(player) {
  return `
    <div class="poison-panel" id="poison-panel-${player.id}">
      <div class="poison-panel-title">☠️ POISON COUNTERS</div>
      <div class="poison-display">
        <button class="poison-btn" data-player="${player.id}" data-action="poison-minus">−</button>
        <div class="poison-value ${player.poison >= POISON_LETHAL ? 'lethal' : ''}"
             id="poison-value-${player.id}">${player.poison}</div>
        <button class="poison-btn" data-player="${player.id}" data-action="poison-plus">+</button>
      </div>
      <button class="poison-close-btn" data-player="${player.id}" data-action="close-poison">CLOSE</button>
    </div>
  `;
}

function renderCommanderPanel(player) {
  const rows = Object.entries(player.commanderDamage).map(([oppId, dmg]) => {
    const opp = gameState.players.find(p => p.id === parseInt(oppId));
    if (!opp) return '';
    const oppColor = PLAYER_COLORS[opp.colorIndex];
    return `
      <div class="commander-damage-row">
        <span class="cmd-opponent-name" style="color: ${oppColor.hex};">${opp.name}</span>
        <div class="cmd-damage-controls">
          <button class="cmd-btn" data-player="${player.id}" data-opponent="${oppId}" data-action="cmd-minus">−</button>
          <span class="cmd-damage-value ${dmg >= COMMANDER_LETHAL ? 'lethal' : ''}"
                id="cmd-val-${player.id}-${oppId}">${dmg}</span>
          <button class="cmd-btn" data-player="${player.id}" data-opponent="${oppId}" data-action="cmd-plus">+</button>
          <div class="cmd-change-indicator" id="cmd-indicator-${player.id}-${oppId}"></div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="commander-panel" id="cmd-panel-${player.id}">
      <div class="commander-panel-title">⚔️ COMMANDER DAMAGE RECEIVED</div>
      <div class="commander-damage-grid">${rows}</div>
      <button class="commander-close-btn" data-player="${player.id}" data-action="close-cmd">CLOSE</button>
    </div>
  `;
}

function renderSettingsPanel() {
  return `
    <div class="settings-panel" id="settings-panel">
      <div class="settings-content">
        <div class="settings-title">⚙️ Settings</div>

        <div class="setting-row">
          <div>
            <div class="setting-label">Sound Effects</div>
            <div class="setting-description">Toggle all game sounds</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="setting-sound" ${gameState.settings.soundEnabled ? 'checked' : ''} />
            <span class="toggle-slider"></span>
          </label>
        </div>

        <div class="setting-row">
          <div>
            <div class="setting-label">Volume</div>
          </div>
          <input type="range" class="volume-slider" id="setting-volume"
                 min="0" max="100" value="${gameState.settings.volume * 100}" />
        </div>

        <div class="setting-row">
          <div>
            <div class="setting-label">Auto-deduct Commander Damage</div>
            <div class="setting-description">Subtract life when adding commander damage</div>
          </div>
          <label class="toggle-switch">
            <input type="checkbox" id="setting-auto-cmd" ${gameState.settings.autoDeductCommanderDamage ? 'checked' : ''} />
            <span class="toggle-slider"></span>
          </label>
        </div>

        <div class="settings-actions">
          <button class="settings-btn restart" id="restart-match">🔄 Restart Match</button>
          <button class="settings-btn setup" id="return-setup">👥 Return to Setup</button>
        </div>
        <button class="settings-close-btn" id="settings-close">Done</button>
      </div>
    </div>
  `;
}

function renderConfirmModal() {
  return `
    <div class="modal-overlay" id="confirm-modal">
      <div class="modal-content">
        <h2>Restart Match?</h2>
        <p>This will reset all life totals and commander damage to their starting values. Are you sure?</p>
        <div class="modal-actions">
          <button class="modal-btn cancel" id="confirm-cancel">Cancel</button>
          <button class="modal-btn confirm" id="confirm-restart">Restart Match</button>
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
// Event Listeners
// ============================================================================

function attachGameListeners() {
  // ── Life touch zones (gain / loss) ──
  document.querySelectorAll('.touch-zone').forEach(zone => {
    let pressTimer = null;
    let pressInterval = null;
    let isLongPress = false;

    const handlePress = () => {
      const playerIdx = parseInt(zone.dataset.player);
      const action = zone.dataset.action;
      isLongPress = false;

      pressTimer = setTimeout(() => {
        isLongPress = true;
        // First heavy action
        doLifeChange(playerIdx, action === 'gain' ? 5 : -5, true);

        pressInterval = setInterval(() => {
          doLifeChange(playerIdx, action === 'gain' ? 5 : -5, true);
        }, LONG_PRESS_INTERVAL);
      }, LONG_PRESS_MS);
    };

    const handleRelease = () => {
      clearTimeout(pressTimer);
      clearInterval(pressInterval);

      if (!isLongPress) {
        const playerIdx = parseInt(zone.dataset.player);
        const action = zone.dataset.action;
        doLifeChange(playerIdx, action === 'gain' ? 1 : -1, false);
      }
    };

    zone.addEventListener('touchstart', (e) => { e.preventDefault(); handlePress(); }, { passive: false });
    zone.addEventListener('touchend', (e) => { e.preventDefault(); handleRelease(); });
    zone.addEventListener('touchcancel', () => { clearTimeout(pressTimer); clearInterval(pressInterval); });
    zone.addEventListener('mousedown', handlePress);
    zone.addEventListener('mouseup', handleRelease);
    zone.addEventListener('mouseleave', () => { clearTimeout(pressTimer); clearInterval(pressInterval); });
  });

  // ── Poison pills → open poison panel ──
  document.querySelectorAll('.counter-pill.poison').forEach(pill => {
    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      const playerIdx = parseInt(pill.dataset.player);
      const panel = document.getElementById(`poison-panel-${playerIdx}`);
      panel.classList.toggle('open');
      sound.playButtonClick();
    });
  });

  // ── Commander pills → open commander panel ──
  document.querySelectorAll('.counter-pill.commander').forEach(pill => {
    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      const playerIdx = parseInt(pill.dataset.player);
      const panel = document.getElementById(`cmd-panel-${playerIdx}`);
      panel.classList.toggle('open');
      sound.playButtonClick();
    });
  });

  // ── Poison +/- buttons ──
  document.querySelectorAll('[data-action="poison-plus"], [data-action="poison-minus"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const playerIdx = parseInt(btn.dataset.player);
      const player = gameState.players[playerIdx];
      pushHistory();

      if (btn.dataset.action === 'poison-plus') {
        player.poison++;
        sound.playPoisonCounter();
      } else {
        player.poison = Math.max(0, player.poison - 1);
        sound.playButtonClick();
      }

      // Update DOM directly instead of full re-render
      document.getElementById(`poison-value-${playerIdx}`).textContent = player.poison;
      document.getElementById(`poison-pill-${playerIdx}`).querySelector('span:last-child').textContent = player.poison;
      
      const pill = document.getElementById(`poison-pill-${playerIdx}`);
      const quadrant = document.getElementById(`quadrant-${playerIdx}`);
      
      if (player.poison > 0) {
        pill.classList.add('active');
        quadrant.classList.add('poisoned');
      } else {
        pill.classList.remove('active');
        quadrant.classList.remove('poisoned');
      }
      
      if (player.poison >= POISON_LETHAL) {
        document.getElementById(`poison-value-${playerIdx}`).classList.add('lethal');
      } else {
        document.getElementById(`poison-value-${playerIdx}`).classList.remove('lethal');
      }

      const justDied = checkDeath(player);
      if (justDied) {
        sound.playDeath();
        renderGameBoard();
      }
    });
  });

  // ── Close poison panel ──
  document.querySelectorAll('[data-action="close-poison"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const playerIdx = parseInt(btn.dataset.player);
      document.getElementById(`poison-panel-${playerIdx}`).classList.remove('open');
    });
  });

  // ── Commander damage +/- buttons ──
  document.querySelectorAll('[data-action="cmd-plus"], [data-action="cmd-minus"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const playerIdx = parseInt(btn.dataset.player);
      const oppIdx = parseInt(btn.dataset.opponent);
      const player = gameState.players[playerIdx];
      pushHistory();

      if (btn.dataset.action === 'cmd-plus') {
        player.commanderDamage[oppIdx]++;
        sound.playCommanderDamage();

        // Screen shake on commander damage
        const board = document.getElementById('game-board');
        board.classList.remove('screen-shake');
        void board.offsetWidth;
        board.classList.add('screen-shake');
        setTimeout(() => board.classList.remove('screen-shake'), 400);

        // Flash gold
        const quadrant = document.getElementById(`quadrant-${playerIdx}`);
        quadrant.classList.remove('flash-gold');
        void quadrant.offsetWidth;
        quadrant.classList.add('flash-gold');
        setTimeout(() => quadrant.classList.remove('flash-gold'), 400);

        // Auto-deduct life
        if (gameState.settings.autoDeductCommanderDamage) {
          doLifeChange(playerIdx, -1, false);
        }
      } else {
        player.commanderDamage[oppIdx] = Math.max(0, player.commanderDamage[oppIdx] - 1);
        sound.playButtonClick();
        
        if (gameState.settings.autoDeductCommanderDamage) {
          doLifeChange(playerIdx, 1, false);
        }
      }

      // Indicator logic
      const indicatorId = `cmd-indicator-${playerIdx}-${oppIdx}`;
      const indicatorEl = document.getElementById(indicatorId);
      const amount = btn.dataset.action === 'cmd-plus' ? 1 : -1;
      
      if (indicatorEl) {
        if (!lifeChangeAccumulators[indicatorId]) {
          lifeChangeAccumulators[indicatorId] = { total: 0, timerId: null };
        }
        const acc = lifeChangeAccumulators[indicatorId];
        acc.total += amount;

        if (acc.timerId) clearTimeout(acc.timerId);

        indicatorEl.textContent = acc.total > 0 ? `+${acc.total}` : `${acc.total}`;
        
        const activeClass = acc.total > 0 ? 'show-gain' : 'show-loss';
        const inactiveClass = acc.total > 0 ? 'show-loss' : 'show-gain';
        
        indicatorEl.classList.remove(inactiveClass);
        indicatorEl.classList.add(activeClass);

        acc.timerId = setTimeout(() => {
          acc.total = 0;
          indicatorEl.classList.remove('show-gain', 'show-loss');
        }, 1500);
      }

      // Update DOM directly instead of full re-render
      const totalCmdDmg = Object.values(player.commanderDamage).reduce((a, b) => a + b, 0);
      document.getElementById(`cmd-val-${playerIdx}-${oppIdx}`).textContent = player.commanderDamage[oppIdx];
      document.getElementById(`cmd-pill-${playerIdx}`).querySelector('span:last-child').textContent = totalCmdDmg;
      
      const pill = document.getElementById(`cmd-pill-${playerIdx}`);
      if (totalCmdDmg > 0) {
        pill.classList.add('active');
      } else {
        pill.classList.remove('active');
      }
      
      if (player.commanderDamage[oppIdx] >= COMMANDER_LETHAL) {
        document.getElementById(`cmd-val-${playerIdx}-${oppIdx}`).classList.add('lethal');
      } else {
        document.getElementById(`cmd-val-${playerIdx}-${oppIdx}`).classList.remove('lethal');
      }

      const justDied = checkDeath(player);
      if (justDied) {
        sound.playDeath();
        renderGameBoard();
      }
    });
  });

  // ── Close commander panel ──
  document.querySelectorAll('[data-action="close-cmd"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const playerIdx = parseInt(btn.dataset.player);
      document.getElementById(`cmd-panel-${playerIdx}`).classList.remove('open');
    });
  });

  // ── HUD buttons ──
  document.getElementById('hud-undo')?.addEventListener('click', (e) => {
    e.stopPropagation();
    undo();
  });

  // Dedicated HUD Restart (single click opens confirmation modal)
  document.getElementById('hud-restart')?.addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('confirm-modal').classList.add('open');
    sound.playButtonClick();
  });

  // Modal actions
  document.getElementById('confirm-cancel')?.addEventListener('click', () => {
    document.getElementById('confirm-modal').classList.remove('open');
    sound.playButtonClick();
  });

  document.getElementById('confirm-restart')?.addEventListener('click', () => {
    document.getElementById('confirm-modal').classList.remove('open');
    gameState.players.forEach(p => {
      p.life = STARTING_LIFE;
      p.poison = 0;
      p.isDead = false;
      p.deathReason = '';
      Object.keys(p.commanderDamage).forEach(oppId => {
        p.commanderDamage[oppId] = 0;
      });
    });
    gameState.history = [];
    sound.playGameStart();
    renderGameBoard();
  });

  document.getElementById('hud-sound')?.addEventListener('click', (e) => {
    e.stopPropagation();
    gameState.settings.soundEnabled = !gameState.settings.soundEnabled;
    sound.setMuted(!gameState.settings.soundEnabled);
    document.getElementById('hud-sound').textContent = gameState.settings.soundEnabled ? '🔊' : '🔇';
    sound.playButtonClick();
  });

  document.getElementById('hud-settings')?.addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('settings-panel').classList.add('open');
    sound.playButtonClick();
  });

  // ── Settings panel ──
  document.getElementById('settings-close')?.addEventListener('click', () => {
    document.getElementById('settings-panel').classList.remove('open');
    sound.playButtonClick();
  });

  document.getElementById('setting-sound')?.addEventListener('change', (e) => {
    gameState.settings.soundEnabled = e.target.checked;
    sound.setMuted(!gameState.settings.soundEnabled);
    document.getElementById('hud-sound').textContent = gameState.settings.soundEnabled ? '🔊' : '🔇';
  });

  document.getElementById('setting-volume')?.addEventListener('input', (e) => {
    gameState.settings.volume = parseInt(e.target.value) / 100;
    sound.setVolume(gameState.settings.volume);
  });

  document.getElementById('setting-auto-cmd')?.addEventListener('change', (e) => {
    gameState.settings.autoDeductCommanderDamage = e.target.checked;
  });

  document.getElementById('restart-match')?.addEventListener('click', () => {
    gameState.players.forEach(p => {
      p.life = STARTING_LIFE;
      p.poison = 0;
      p.isDead = false;
      p.deathReason = '';
      Object.keys(p.commanderDamage).forEach(oppId => {
        p.commanderDamage[oppId] = 0;
      });
    });
    gameState.history = [];
    sound.playGameStart();
    renderGameBoard();
  });

  document.getElementById('return-setup')?.addEventListener('click', () => {
    gameState.screen = 'setup';
    gameState.history = [];
    sound.playButtonClick();
    renderSetup();
  });
}

// ============================================================================
// Life Change Logic
// ============================================================================

function doLifeChange(playerIdx, amount, isHeavy) {
  const player = gameState.players[playerIdx];
  if (player.isDead) return;

  pushHistory();
  player.life += amount;

  // Play appropriate sound
  if (amount > 0) {
    if (isHeavy) {
      sound.playLifeGainHeavy();
    } else {
      sound.playLifeGain();
    }
  } else {
    if (isHeavy) {
      sound.playLifeLossHeavy();
    } else {
      sound.playLifeLoss();
    }
  }

  // Visual feedback
  const lifeEl = document.getElementById(`life-${playerIdx}`);
  const indicatorEl = document.getElementById(`indicator-${playerIdx}`);
  const quadrant = document.getElementById(`quadrant-${playerIdx}`);

  if (lifeEl) {
    lifeEl.textContent = player.life;
    lifeEl.classList.remove('pulse-up', 'pulse-down');
    void lifeEl.offsetWidth; // Force reflow for re-animation
    lifeEl.classList.add(amount > 0 ? 'pulse-up' : 'pulse-down');
  }

  if (indicatorEl) {
    if (!lifeChangeAccumulators[playerIdx]) {
      lifeChangeAccumulators[playerIdx] = { total: 0, timerId: null };
    }
    const acc = lifeChangeAccumulators[playerIdx];
    acc.total += amount;

    if (acc.timerId) {
      clearTimeout(acc.timerId);
    }

    indicatorEl.textContent = acc.total > 0 ? `+${acc.total}` : `${acc.total}`;
    
    // Add the class (don't force reflow so it stays smoothly on screen)
    const activeClass = acc.total > 0 ? 'show-gain' : 'show-loss';
    const inactiveClass = acc.total > 0 ? 'show-loss' : 'show-gain';
    
    indicatorEl.classList.remove(inactiveClass);
    indicatorEl.classList.add(activeClass);

    // Set a timeout to fade it out and reset the accumulator
    acc.timerId = setTimeout(() => {
      // GOOP EFFECT CHECK
      if (acc.total <= -5 && Math.random() < 0.20) {
        renderGoopEffect(playerIdx);
      }

      acc.total = 0;
      indicatorEl.classList.remove('show-gain', 'show-loss');
    }, 1500);
  }

  if (quadrant) {
    quadrant.classList.remove('flash-red', 'flash-green');
    void quadrant.offsetWidth;
    quadrant.classList.add(amount > 0 ? 'flash-green' : 'flash-red');
    setTimeout(() => quadrant.classList.remove('flash-red', 'flash-green'), 300);
  }

  // Check for death
  const justDied = checkDeath(player);
  if (justDied) {
    sound.playDeath();
    renderGameBoard();
  }
}

function renderGoopEffect(playerIdx) {
  const quadrant = document.getElementById(`quadrant-${playerIdx}`);
  if (!quadrant) return;

  sound.playGoop();

  const overlay = document.createElement('div');
  overlay.className = 'goop-overlay';
  
  const text = document.createElement('div');
  text.className = 'goop-text';
  text.textContent = 'GOOPED';
  overlay.appendChild(text);

  const numSplatters = Math.floor(Math.random() * 3) + 4; // 4 to 6 splatters
  for (let i = 0; i < numSplatters; i++) {
    const splat = document.createElement('div');
    splat.className = 'goop-splatter';
    
    const top = Math.random() * 80 + 10;
    const left = Math.random() * 80 + 10;
    const scale = Math.random() * 1.5 + 0.5;
    const rot = Math.random() * 360;
    
    splat.style.top = `${top}%`;
    splat.style.left = `${left}%`;
    splat.style.setProperty('--s', scale);
    splat.style.setProperty('--rot', `${rot}deg`);
    
    overlay.appendChild(splat);
  }

  quadrant.appendChild(overlay);

  setTimeout(() => {
    overlay.remove();
  }, 2000);
}

// ============================================================================
// Bootstrap
// ============================================================================

const lifeChangeAccumulators = {};

// Start on splash screen
renderSplash();
