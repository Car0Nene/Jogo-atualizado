// Família Fighter — motor do jogo.
// Simulação em passo fixo (60 Hz), máquina de estados por lutador, hitbox/hurtbox,
// combos, rounds (melhor de 3), IA com dificuldade, 2 jogadores locais, gamepad e touch.
(() => {
  'use strict';

  // ======================================================================
  // Constantes
  // ======================================================================
  const H = 540;
  const BASE_W = 960;
  const MIN_W = 720; // telas 4:3 (tablets)
  const MAX_W = 1280;
  const STAGE_W = 1600;
  const FLOOR = 450;
  const STEP = 1 / 60;
  const WALL = 46;
  // Câmera aproximada (personagens grandes, como nos jogos de luta). worldW = largura do
  // mundo visível; camTop = topo visível (sobe quando alguém pula alto).
  const ZOOM = 1.4;
  const CAM_TOP = H - H / ZOOM;
  const MAX_HP = 1400;
  const FAR_W = (STAGE_W + MAX_W) / 2;

  const SPR = window.FF_SPRITES || {};
  const AS = window.FF_SPRITE_SCALE || 1; // resolução do atlas (desenho divide por isso)
  const SPRITE_VERSION = window.FF_SPRITE_VERSION || '1';
  const DIALOGUE = window.FF_DIALOGUE || { intro: {}, juraci: {}, carlos: {} };
  const TRANSFORM_TIME = 1.5;
  const Audio = window.FFAudio || { play() {}, startMusic() {}, stopMusic() {}, pauseMusic() {}, configure() {}, unlock() {} };
  const Account = window.FFAccount || { recordMatch() {}, isOpen: () => false, close() {} };

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const rand = (a, b) => a + Math.random() * (b - a);

  const canvas = $('#game');
  const ctx = canvas.getContext('2d', { alpha: false });

  // ======================================================================
  // Configurações persistentes (validadas: o localStorage pode ser editado)
  // ======================================================================
  const DEFAULTS = {
    sound: true, music: true, voice: true, talk: true, volume: 0.7, vibration: true, touch: 'auto',
    difficulty: 'normal', stage: 'padaria', mode: 'cpu', fighter: 'juraci', opponent: 'auto', fightMusic: 'stage',
    rounds: 2, roundTime: 60
  };
  const ENUMS = {
    touch: ['auto', 'always', 'never'],
    difficulty: ['easy', 'normal', 'hard'],
    stage: ['padaria', 'quintal', 'festa', 'bar', 'praia', 'random'],
    mode: ['cpu', 'versus'],
    fighter: ['juraci', 'carlos', 'pedro', 'daniel', 'franciely', 'gabi'],
    opponent: ['auto', 'juraci', 'carlos', 'pedro', 'daniel', 'franciely', 'gabi'],
    fightMusic: ['stage', 'theme', 'chip'],
    rounds: [1, 2, 3],
    roundTime: [45, 60, 99, 0]
  };
  const settings = (() => {
    let stored = {};
    try { stored = JSON.parse(localStorage.getItem('ff-settings') || '{}') || {}; } catch { stored = {}; }
    const result = { ...DEFAULTS };
    for (const key of Object.keys(DEFAULTS)) {
      if (typeof stored[key] === typeof DEFAULTS[key]) result[key] = stored[key];
    }
    for (const [key, values] of Object.entries(ENUMS)) if (!values.includes(result[key])) result[key] = DEFAULTS[key];
    result.volume = clamp(Number(result.volume) || 0, 0, 1);
    return result;
  })();
  function saveSettings() {
    try { localStorage.setItem('ff-settings', JSON.stringify(settings)); } catch { /* modo privado */ }
    Audio.configure({ sound: settings.sound, music: settings.music, voice: settings.voice, volume: settings.volume });
  }
  Audio.configure({ sound: settings.sound, music: settings.music, voice: settings.voice, volume: settings.volume });

  // ======================================================================
  // Imagens
  // ======================================================================
  const loadImage = src => { const img = new Image(); img.decoding = 'async'; img.src = src; return img; };
  const ready = img => img && (img instanceof HTMLCanvasElement || (img.complete && img.naturalWidth > 0));
  // WebP nítido; se o navegador não abrir, usa o PNG. ?v= impede misturar versões no cache.
  const atlas = loadImage(`assets/sprites/fighters.webp?v=${SPRITE_VERSION}`);
  atlas.addEventListener('error', () => {
    if (!atlas.src.includes('.png')) atlas.src = `assets/sprites/fighters.png?v=${SPRITE_VERSION}`;
  });
  const portraits = { juraci: loadImage('assets/portraits/juraci.png'), carlos: loadImage('assets/portraits/carlos.png'),
    pedro: loadImage('assets/portraits/pedro.png'), daniel: loadImage('assets/portraits/daniel.png'),
    franciely: loadImage('assets/portraits/franciely.png'), gabi: loadImage('assets/portraits/gabi.png') };
  let altAtlas = null;

  function buildAltAtlas() {
    // Cores alternativas para luta espelhada (mesmo personagem dos dois lados):
    // troca só a cor das roupas; pele, cabelo e tons neutros são preservados.
    try {
      const c = document.createElement('canvas');
      c.width = atlas.naturalWidth;
      c.height = atlas.naturalHeight;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(atlas, 0, 0);
      let data;
      try {
        data = g.getImageData(0, 0, c.width, c.height);
      } catch {
        data = null; // aberto via file:// em alguns navegadores: canvas "contaminado"
      }
      if (data) {
        const p = data.data;
        for (let i = 0; i < p.length; i += 4) {
          if (!p[i + 3]) continue;
          const r = p[i] / 255;
          const gr = p[i + 1] / 255;
          const b = p[i + 2] / 255;
          const max = Math.max(r, gr, b);
          const min = Math.min(r, gr, b);
          const d = max - min;
          if (d < 0.12) continue; // cinzas, preto e branco
          let h = max === r ? ((gr - b) / d) % 6 : max === gr ? (b - r) / d + 2 : (r - gr) / d + 4;
          h *= 60;
          if (h < 0) h += 360;
          if (h >= 8 && h <= 52) continue; // tons de pele, cabelo, dourado
          const l = (max + min) / 2;
          const s = d / (1 - Math.abs(2 * l - 1));
          const nh = (h + 150) % 360;
          const k = n => (n + nh / 30) % 12;
          const a = s * Math.min(l, 1 - l);
          const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
          p[i] = Math.round(f(0) * 255);
          p[i + 1] = Math.round(f(8) * 255);
          p[i + 2] = Math.round(f(4) * 255);
        }
        g.putImageData(data, 0, 0);
      } else if (typeof g.filter === 'string') {
        g.clearRect(0, 0, c.width, c.height);
        g.filter = 'hue-rotate(150deg)';
        g.drawImage(atlas, 0, 0);
      }
      altAtlas = c;
    } catch (error) {
      console.warn('Sem paleta alternativa para luta espelhada.', error);
      altAtlas = null;
    }
  }
  function onAtlasReady() {
    $('#loadingNote').hidden = true;
    buildAltAtlas();
  }
  if (ready(atlas)) onAtlasReady(); else atlas.addEventListener('load', onAtlasReady);
  atlas.addEventListener('error', () => {
    $('#loadingNote').textContent = 'Não foi possível carregar os sprites. Verifique a conexão e recarregue.';
  });

  // ======================================================================
  // Personagens e golpes
  // box: [alcanceInicial, alcanceFinal, alturaMin, alturaMax] relativo aos pés e à frente do lutador
  // chain: botão → golpe para o qual pode cancelar quando acerta (combo)
  // ======================================================================
  const CHARS = {
    juraci: {
      name: 'JURACI', heavyLabel: 'FORTE',
      desc: 'Rápida e esperta. Especial: Super Bolo de Cenoura (projétil que derruba).',
      scale: 1.22, height: 148, crouchHeight: 92, width: 30,
      walk: 225, back: 175, jumpV: 900, jumpX: 250, gravity: 2500,
      moves: {
        light:  { anim: 'light', startup: 0.06, active: 0.08, recovery: 0.12, damage: 40, box: [18, 108, 96, 128], hitstun: 0.27, blockstun: 0.16, push: 230, hitstop: 0.05, chain: { light: 'medium', heavy: 'heavy' } },
        medium: { anim: 'medium', startup: 0.09, active: 0.09, recovery: 0.18, damage: 60, box: [18, 128, 82, 130], hitstun: 0.32, blockstun: 0.18, push: 280, hitstop: 0.07, chain: { heavy: 'heavy' } },
        heavy:  { anim: 'heavy', startup: 0.14, active: 0.1, recovery: 0.28, damage: 90, box: [18, 152, 70, 132], hitstun: 0.42, blockstun: 0.22, push: 430, hitstop: 0.09, lunge: 140, heavy: true },
        air:    { anim: 'medium', frame: 1, startup: 0.07, active: 0.2, recovery: 0.1, damage: 55, box: [6, 112, 30, 120], hitstun: 0.32, blockstun: 0.18, push: 220, hitstop: 0.06 },
        special: { anim: 'special', startup: 0.34, active: 0, recovery: 0.34, projectile: { sprite: 'cake', speed: 560, damage: 150, w: 40, h: 36, y: 100 } }
      }
    },
    carlos: {
      name: 'CARLOS', heavyLabel: 'CHUTE',
      desc: 'Forte e versátil. Especial: alterna entre Gordão (+força) e Modo Fé (+defesa).',
      scale: 1.2, height: 156, crouchHeight: 96, width: 32,
      walk: 215, back: 170, jumpV: 920, jumpX: 240, gravity: 2550,
      moves: {
        light:  { anim: 'light', startup: 0.06, active: 0.08, recovery: 0.12, damage: 42, box: [18, 106, 100, 134], hitstun: 0.27, blockstun: 0.16, push: 230, hitstop: 0.05, chain: { light: 'medium', heavy: 'heavy' } },
        medium: { anim: 'medium', startup: 0.1, active: 0.09, recovery: 0.18, damage: 62, box: [18, 130, 88, 136], hitstun: 0.32, blockstun: 0.18, push: 280, hitstop: 0.07, chain: { heavy: 'heavy' } },
        heavy:  { anim: 'heavy', startup: 0.15, active: 0.11, recovery: 0.28, damage: 86, box: [18, 156, 50, 140], hitstun: 0.42, blockstun: 0.22, push: 420, hitstop: 0.09, lunge: 120, heavy: true, chain: { heavy: 'combo' } },
        combo:  { anim: 'special', startup: 0.12, active: 0.12, recovery: 0.36, damage: 110, box: [18, 168, 40, 140], hitstun: 0.5, blockstun: 0.26, push: 380, hitstop: 0.11, lunge: 180, heavy: true, knockdown: true },
        air:    { anim: 'heavy', frame: 1, startup: 0.07, active: 0.2, recovery: 0.1, damage: 58, box: [6, 118, 20, 110], hitstun: 0.32, blockstun: 0.18, push: 220, hitstop: 0.06 }
      }
    },
    pedro: {
      name: 'PEDRO', heavyLabel: 'CHUTE',
      desc: '"Fuma, bebe e vence!" Meia barra: fumaça de cigarro. Barra cheia: Heineken e vira Monstrão.',
      scale: 1.2, height: 158, crouchHeight: 98, width: 30,
      walk: 220, back: 172, jumpV: 910, jumpX: 245, gravity: 2520,
      transformTime: 1.3,
      moves: {
        light:  { anim: 'light', startup: 0.07, active: 0.08, recovery: 0.12, damage: 40, box: [18, 118, 100, 134], hitstun: 0.27, blockstun: 0.16, push: 230, hitstop: 0.05, chain: { light: 'medium', heavy: 'heavy' } },
        medium: { anim: 'medium', startup: 0.1, active: 0.09, recovery: 0.18, damage: 60, box: [18, 126, 92, 136], hitstun: 0.32, blockstun: 0.18, push: 280, hitstop: 0.07, chain: { heavy: 'heavy' } },
        heavy:  { anim: 'heavy', startup: 0.15, active: 0.11, recovery: 0.28, damage: 90, box: [18, 160, 70, 150], hitstun: 0.42, blockstun: 0.22, push: 430, hitstop: 0.09, lunge: 120, heavy: true },
        air:    { anim: 'heavy', frame: 2, startup: 0.07, active: 0.2, recovery: 0.1, damage: 56, box: [6, 118, 20, 120], hitstun: 0.32, blockstun: 0.18, push: 220, hitstop: 0.06 },
        smoke:  { anim: 'smoke', startup: 0.36, active: 0, recovery: 0.3, projectile: { sprite: 'smoke', speed: 300, damage: 70, w: 70, h: 60, y: 122, life: 1.7, knockdown: false, hitstun: 0.85, cough: true } }
      }
    },
    daniel: {
      name: 'DANIEL', heavyLabel: 'CHUTE',
      desc: '"Partiu praia?" Especial: Modo Natal Praia — rápido e imprevisível: dança, bate o carro ou toma uma (se a esposa deixar).',
      scale: 1.2, height: 152, crouchHeight: 92, width: 30,
      walk: 235, back: 180, jumpV: 940, jumpX: 255, gravity: 2550,
      transformTime: 1.3,
      moves: {
        light:  { anim: 'light', startup: 0.06, active: 0.08, recovery: 0.12, damage: 40, box: [18, 110, 96, 130], hitstun: 0.27, blockstun: 0.16, push: 230, hitstop: 0.05, chain: { light: 'medium', heavy: 'heavy' } },
        medium: { anim: 'medium', startup: 0.09, active: 0.09, recovery: 0.18, damage: 58, box: [18, 132, 88, 132], hitstun: 0.32, blockstun: 0.18, push: 280, hitstop: 0.07, chain: { heavy: 'heavy' } },
        heavy:  { anim: 'heavy', startup: 0.14, active: 0.11, recovery: 0.28, damage: 88, box: [18, 160, 60, 150], hitstun: 0.42, blockstun: 0.22, push: 420, hitstop: 0.09, lunge: 130, heavy: true },
        air:    { anim: 'jump', frame: 2, startup: 0.07, active: 0.2, recovery: 0.1, damage: 55, box: [6, 112, 20, 120], hitstun: 0.32, blockstun: 0.18, push: 220, hitstop: 0.06 },
        dance:  { anim: 'dance', startup: 0.3, active: 0, recovery: 0.3, notes: true }
      }
    },
    franciely: {
      name: 'FRANCIELY', heavyLabel: 'CHUTE',
      desc: '"Cuidar também é lutar!" Barra cheia: fica irritada sem motivo, briga com o Carlos e bate uma fome sem fim. Meia barra: jato de leite.',
      scale: 1.2, height: 150, crouchHeight: 92, width: 31,
      walk: 220, back: 172, jumpV: 900, jumpX: 240, gravity: 2520,
      transformTime: 1.2,
      moves: {
        light:  { anim: 'light', startup: 0.06, active: 0.08, recovery: 0.12, damage: 40, box: [18, 110, 96, 130], hitstun: 0.27, blockstun: 0.16, push: 230, hitstop: 0.05, chain: { light: 'medium', heavy: 'heavy' } },
        medium: { anim: 'medium', startup: 0.09, active: 0.09, recovery: 0.18, damage: 60, box: [18, 128, 88, 132], hitstun: 0.32, blockstun: 0.18, push: 280, hitstop: 0.07, chain: { heavy: 'heavy' } },
        heavy:  { anim: 'heavy', startup: 0.14, active: 0.11, recovery: 0.28, damage: 88, box: [18, 158, 60, 145], hitstun: 0.42, blockstun: 0.22, push: 420, hitstop: 0.09, lunge: 130, heavy: true },
        air:    { anim: 'heavy', frame: 1, startup: 0.07, active: 0.2, recovery: 0.1, damage: 55, box: [6, 115, 20, 120], hitstun: 0.32, blockstun: 0.18, push: 220, hitstop: 0.06 },
        milk:   { anim: 'mama', startup: 0.35, active: 0, recovery: 0.3, projectile: { sprite: 'milk', speed: 620, damage: 75, w: 90, h: 34, y: 105, life: 1.4, knockdown: false, hitstun: 0.6 } }
      }
    },
    gabi: {
      name: 'GABI', heavyLabel: 'CHUTE',
      desc: '"Faz o L, ama o Lula!" Barra cheia: Super L e brigadeiros (a Juraci vem buscar a panela). Meia barra: canto.',
      scale: 1.2, height: 150, crouchHeight: 92, width: 30,
      walk: 225, back: 175, jumpV: 910, jumpX: 245, gravity: 2520,
      moves: {
        light:  { anim: 'light', startup: 0.06, active: 0.08, recovery: 0.12, damage: 40, box: [18, 112, 96, 130], hitstun: 0.27, blockstun: 0.16, push: 230, hitstop: 0.05, chain: { light: 'medium', heavy: 'heavy' } },
        medium: { anim: 'medium', startup: 0.09, active: 0.09, recovery: 0.18, damage: 60, box: [18, 130, 88, 132], hitstun: 0.32, blockstun: 0.18, push: 280, hitstop: 0.07, chain: { heavy: 'heavy' } },
        heavy:  { anim: 'heavy', startup: 0.14, active: 0.11, recovery: 0.28, damage: 88, box: [18, 160, 70, 150], hitstun: 0.42, blockstun: 0.22, push: 420, hitstop: 0.09, lunge: 130, heavy: true },
        air:    { anim: 'heavy', frame: 2, startup: 0.07, active: 0.2, recovery: 0.1, damage: 55, box: [6, 115, 20, 120], hitstun: 0.32, blockstun: 0.18, push: 220, hitstop: 0.06 },
        dance:  { anim: 'dance', startup: 0.3, active: 0, recovery: 0.3, notes: true },
        superL: { anim: 'dance', frame: 3, startup: 0.4, active: 0, recovery: 0.45, superL: true }
      }
    }
  };
  const FIGHTER_IDS = Object.keys(CHARS);
  // Lutador só pode ser escolhido se os sprites dele existem no atlas.
  const available = id => Boolean(SPR[id] && SPR[id].idle && SPR[id].idle.length);
  const PLAYABLE = FIGHTER_IDS.filter(available);

  // Formas temporárias (especiais de transformação). atk = dano causado, def = dano recebido.
  const FORMS = {
    normal: { atk: 1, def: 1, speed: 1, push: 1, reach: 1, wide: 0 },
    gordao: { atk: 1.25, def: 0.9, speed: 0.8, push: 1.35, reach: 1.15, wide: 12, jump: 0.88, label: 'GORDÃO +FORÇA', color: '#ffb347', aura: [255, 150, 40] },
    crente: { atk: 1, def: 0.55, speed: 1, push: 1, reach: 1, wide: 0, label: 'MODO FÉ +DEFESA', color: '#fff1a3', aura: [255, 244, 170] },
    hulk:   { atk: 1.3, def: 0.8, speed: 0.88, push: 1.3, reach: 1.15, wide: 14, jump: 0.9, label: 'MONSTRÃO HEINEKEN', color: '#7dff8a', aura: [80, 255, 110] },
    praia:  { atk: 1, def: 1, speed: 1.3, push: 1, reach: 1, wide: 0, jump: 1.08, label: 'NATAL PRAIA!', color: '#ff8ad8', aura: [255, 120, 220], wild: true },
    brava:  { atk: 1.35, def: 0.9, speed: 1.15, push: 1.2, reach: 1, wide: 0, label: 'IRRITADA + FOME', color: '#ff6b6b', aura: [255, 70, 60], hungry: true }
  };
  const form = f => FORMS[f.form] || FORMS.normal;
  const FORM_TIME = 10;
  const otherFighter = id => (id === 'juraci' ? 'carlos' : 'juraci');
  const randomOther = id => {
    const others = PLAYABLE.filter(other => other !== id);
    return others[Math.floor(Math.random() * others.length)];
  };

  // ======================================================================
  // Estado global
  // ======================================================================
  let app = 'splash';         // splash | select | fight | result
  let paused = false;
  let fighters = [];
  let projectiles = [];
  let effects = [];
  let particles = [];
  let match = null;
  let clock = 0;
  let hitstop = 0;
  let superFreeze = 0;
  let superOwner = null;
  let shake = 0;
  let camX = (STAGE_W - BASE_W) / 2;
  let viewW = BASE_W;
  let worldW = BASE_W / ZOOM;
  let camTop = CAM_TOP;
  let renderScale = 1;
  let offsetX = 0;
  let offsetY = 0;
  let stageCache = null;
  let lastTs = 0;
  let accumulator = 0;
  let touchSeen = matchMedia('(pointer: coarse)').matches;
  let installPrompt = null;
  let dialogReturnFocus = null;

  // ======================================================================
  // Entrada (teclado, toque, gamepad, IA) — cada fonte escreve em inputs[slot]
  // ======================================================================
  const HOLDS = ['left', 'right', 'up', 'down', 'guard'];
  const makeInput = () => ({ kb: {}, touch: {}, pad: {}, ai: {}, padPrev: [] });
  const inputs = [makeInput(), makeInput()];

  const KEYS_SOLO = {
    KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
    KeyW: 'up', ArrowUp: 'up', Space: 'up', KeyS: 'down', ArrowDown: 'down',
    KeyI: 'guard', KeyJ: 'light', KeyK: 'heavy', KeyL: 'special',
    KeyF: 'light', KeyG: 'heavy', KeyH: 'guard', KeyT: 'special'
  };
  const KEYS_P1 = { KeyA: 'left', KeyD: 'right', KeyW: 'up', KeyS: 'down', KeyF: 'light', KeyG: 'heavy', KeyH: 'guard', KeyT: 'special' };
  const KEYS_P2 = {
    ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
    KeyJ: 'light', KeyK: 'heavy', KeyI: 'guard', KeyL: 'special',
    Numpad1: 'light', Numpad2: 'heavy', Numpad3: 'guard', Numpad0: 'special'
  };

  function keyBindings() {
    return match && match.mode === 'versus' ? [[0, KEYS_P1], [1, KEYS_P2]] : [[0, KEYS_SOLO]];
  }

  function clearInputs() {
    for (const input of inputs) { input.kb = {}; input.touch = {}; input.pad = {}; input.ai = {}; }
    for (const f of fighters) f.buffer = [];
    $$('.control.is-down').forEach(b => b.classList.remove('is-down'));
    resetStick();
  }

  function pushAction(slot, action) {
    const f = fighters[slot];
    if (!f || app !== 'fight' || paused || !match) return;
    if (match.sub === 'talk') { match.skipTalk = true; return; } // qualquer botão pula a conversa
    if (match.sub !== 'fight') return;
    f.buffer.push({ action, t: clock });
  }

  function isTyping(target) {
    return target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
  }

  function anyDialogOpen() {
    return !$('#menuDialog').hidden || !$('#moveList').hidden || Account.isOpen();
  }

  document.addEventListener('keydown', event => {
    if (isTyping(event.target)) return; // nunca roubar teclas de campos de formulário
    if (event.code === 'Escape') {
      if (!$('#menuDialog').hidden) { closeMenuDialog(); return; }
      if (!$('#moveList').hidden) { $('#moveList').hidden = true; return; }
      if (Account.isOpen()) { Account.close(); return; }
      if (app === 'fight') { event.preventDefault(); togglePause(); }
      else if (FLOW_SCREENS.includes(app)) flowBack();
      else if (app === 'vs') beginFight();
      return;
    }
    if (anyDialogOpen()) return;
    if (FLOW_SCREENS.includes(app) && !event.repeat && flowKey(event)) return;
    if (app === 'vs' && ['Enter', 'Space', 'KeyJ'].includes(event.code)) { beginFight(); return; }
    if (event.code === 'KeyP' && app === 'fight') { togglePause(); return; }
    if (app !== 'fight' || paused) return;
    if (match && match.sub === 'talk' && !event.repeat
      && (event.code === 'Enter' || keyBindings().some(([, map]) => map[event.code]))) {
      event.preventDefault();
      match.skipTalk = true;
      return;
    }
    for (const [slot, map] of keyBindings()) {
      const action = map[event.code];
      if (!action) continue;
      event.preventDefault();
      if (HOLDS.includes(action)) inputs[slot].kb[action] = true;
      if (action !== 'up' && !HOLDS.includes(action) && !event.repeat) pushAction(slot, action);
    }
  });
  document.addEventListener('keyup', event => {
    for (const [slot, map] of keyBindings()) {
      const action = map[event.code];
      if (action && HOLDS.includes(action)) inputs[slot].kb[action] = false;
    }
  });

  // ---------- Toque: direcional analógico + botões ----------
  const stick = $('#stick');
  const knob = stick.querySelector('.stick-knob');
  let stickPointer = null;
  function resetStick() {
    stickPointer = null;
    knob.style.transform = '';
    Object.assign(inputs[0].touch, { left: false, right: false, up: false, down: false });
  }
  function updateStick(event) {
    const rect = stick.getBoundingClientRect();
    const radius = rect.width / 2;
    let dx = (event.clientX - rect.left - radius) / radius;
    let dy = (event.clientY - rect.top - radius) / radius;
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    knob.style.transform = `translate(${dx * radius * 0.55}px, ${dy * radius * 0.55}px)`;
    const t = inputs[0].touch;
    t.left = dx < -0.38;
    t.right = dx > 0.38;
    t.up = dy < -0.55;
    t.down = dy > 0.55;
  }
  stick.addEventListener('pointerdown', event => {
    event.preventDefault();
    if (stickPointer !== null) return;
    stickPointer = event.pointerId;
    stick.setPointerCapture(event.pointerId);
    updateStick(event);
  });
  stick.addEventListener('pointermove', event => { if (event.pointerId === stickPointer) updateStick(event); });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    stick.addEventListener(type, event => { if (event.pointerId === stickPointer) resetStick(); });
  }

  $$('.control[data-act]').forEach(button => {
    const action = button.dataset.act;
    const press = event => {
      event.preventDefault();
      button.setPointerCapture?.(event.pointerId);
      button.classList.add('is-down');
      if (action === 'guard') inputs[0].touch.guard = true;
      else pushAction(0, action);
    };
    const release = event => {
      event.preventDefault();
      button.classList.remove('is-down');
      if (action === 'guard') inputs[0].touch.guard = false;
    };
    button.addEventListener('pointerdown', press);
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
    button.addEventListener('contextmenu', event => event.preventDefault());
  });

  // ---------- Gamepad ----------
  // A = pular · X = soco · Y = forte · B = especial · LB/RB/LT/RT = defesa · Start = pausa
  function pollGamepads() {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    const versus = match && match.mode === 'versus';
    for (let i = 0; i < 2; i++) {
      const slot = versus ? i : 0;
      if (!versus && i > 0) break;
      const pad = pads[i];
      const input = inputs[slot];
      if (!pad) { input.pad = {}; continue; }
      const pressed = k => Boolean(pad.buttons[k] && pad.buttons[k].pressed);
      const ax = pad.axes[0] || 0;
      const ay = pad.axes[1] || 0;
      input.pad = {
        left: ax < -0.4 || pressed(14),
        right: ax > 0.4 || pressed(15),
        up: ay < -0.6 || pressed(12) || pressed(0),
        down: ay > 0.6 || pressed(13),
        guard: pressed(4) || pressed(5) || pressed(6) || pressed(7)
      };
      const edge = k => pressed(k) && !input.padPrev[k];
      if (edge(2)) pushAction(slot, 'light');
      if (edge(3)) pushAction(slot, 'heavy');
      if (edge(1)) pushAction(slot, 'special');
      if (edge(9)) togglePause();
      input.padPrev = pad.buttons.map(b => b.pressed);
    }
  }

  // ======================================================================
  // Lutadores
  // ======================================================================
  function createFighter(slot, id, isCpu, alt) {
    return {
      slot, id, ch: CHARS[id], isCpu, alt,
      x: STAGE_W / 2 + (slot === 0 ? -170 : 170), y: 0, vx: 0, vy: 0,
      facing: slot === 0 ? 1 : -1,
      hp: MAX_HP, hpLag: MAX_HP, lagDelay: 0, meter: 0,
      state: 'idle', t: 0, stun: 0,
      move: null, moveName: '', hitDone: false, connected: false, airborne: false, airAttacked: false,
      invuln: 0, flash: 0, form: 'normal', formTime: 0, nextForm: 'gordao', crouchGuard: false,
      combo: 0, comboShow: 0, held: {}, prevUp: false, buffer: [],
      say: null, sayCooldown: 0, food: 'cake',
      stats: { hits: 0, maxCombo: 0, damage: 0 },
      ai: { timer: 0.5, moveDir: 0, guardT: 0, threatKey: '', willBlock: false, reactAt: 0, chainKey: '', aaTried: false }
    };
  }

  function resetFighterForRound(f) {
    Object.assign(f, {
      x: STAGE_W / 2 + (f.slot === 0 ? -170 : 170), y: 0, vx: 0, vy: 0,
      facing: f.slot === 0 ? 1 : -1, hp: MAX_HP, hpLag: MAX_HP, state: 'idle', t: 0, stun: 0,
      move: null, invuln: 0, flash: 0, form: 'normal', formTime: 0, combo: 0, comboShow: 0, buffer: [],
      airAttacked: false, say: null, sayCooldown: 0
    });
  }

  // ---------- Falas (balões + voz) ----------
  function pickLine(list, f) {
    if (!Array.isArray(list) || !list.length) return '';
    const opponent = fighters[1 - f.slot];
    const name = opponent ? CHARS[opponent.id].name.charAt(0) + CHARS[opponent.id].name.slice(1).toLowerCase() : '';
    return String(list[Math.floor(Math.random() * list.length)]).replaceAll('{oponente}', name);
  }

  // important = ignora o intervalo mínimo entre falas (usado em especiais, K.O., vitória)
  function say(f, key, { important = false, duration = 0, chance = 1, text = '' } = {}) {
    if (!f) return;
    if (!important && (f.sayCooldown > 0 || Math.random() > chance)) return;
    // voz real gravada (quando existe trecho para esse momento) no lugar da voz do navegador
    const clipKey = !text && VOICE_CLIPS[f.id] && VOICE_CLIPS[f.id][key];
    if (clipKey && Audio.hasClip && Audio.hasClip(f.id, clipKey) && Math.random() < 0.75) {
      const clipText = Audio.playClip(f.id, clipKey);
      f.say = { text: clipText, t: 0, life: duration || clamp(1.1 + clipText.length * 0.045, 1.4, 3.2) };
      f.sayCooldown = important ? 1.2 : 3.5;
      return;
    }
    const line = text || pickLine((DIALOGUE[f.id] || {})[key], f);
    if (!line) return;
    f.say = { text: line, t: 0, life: duration || clamp(1.1 + line.length * 0.045, 1.4, 3.2) };
    f.sayCooldown = important ? 1.2 : 3.5;
    Audio.speak(line, f.id);
  }

  // momento da fala → trecho gravado (js/audio.js → CLIPS)
  const VOICE_CLIPS = {
    franciely: { angry: 'isso', combo: 'ferrinho', win: 'montar', milk: 'isso' }
  };

  const opponentOf = f => fighters[1 - f.slot];
  const grounded = f => f.y <= 0 && f.vy <= 0;
  const NEUTRAL = new Set(['idle', 'walk', 'crouch', 'guard']);
  const INVULNERABLE = new Set(['launch', 'down', 'getup', 'ko', 'transform', 'win']);

  function setState(f, state) {
    if (f.state !== state) { f.state = state; f.t = 0; }
  }

  function toNeutral(f) {
    f.state = 'idle';
    f.t = 0;
    f.move = null;
    f.airAttacked = false;
    opponentOf(f).combo = 0;
  }

  function speedMul(f) {
    return form(f).speed;
  }

  function takeAction(f, allowed) {
    const index = f.buffer.findIndex(b => allowed.includes(b.action));
    if (index < 0) return null;
    return f.buffer.splice(index, 1)[0].action;
  }

  function faceOpponent(f) {
    const o = opponentOf(f);
    if (Math.abs(o.x - f.x) > 4) f.facing = o.x > f.x ? 1 : -1;
  }

  function startAttack(f, name) {
    const move = f.ch.moves[name];
    if (!move) return false;
    f.state = 'attack';
    f.t = 0;
    f.attackId = (f.attackId || 0) + 1;
    f.move = move;
    f.moveName = name;
    if (name === 'combo') say(f, 'special', { chance: 0.6 });
    f.hitDone = false;
    f.connected = false;
    f.airborne = f.y > 0;
    if (!f.airborne) f.vx = (move.lunge || 0) * f.facing;
    Audio.play('whoosh');
    return true;
  }

  const transformTime = f => f.ch.transformTime || TRANSFORM_TIME;

  function fizzle(f) {
    Audio.play('fizzle');
    spark(f.x + f.facing * 30, FLOOR - f.y - 100, '#7ce8ff', 6);
    return false;
  }

  function startTransform(f, nextForm) {
    f.meter = 0;
    superFreeze = 0.4;
    superOwner = f;
    f.nextForm = nextForm;
    f.state = 'transform';
    f.t = 0;
    f.vx = 0;
    f.transformStage = 0;
    Audio.play('transform');
    spark(f.x, FLOOR - f.y - 80, '#ffe680', 24);
  }

  // Especiais. L = especial principal (barra cheia). ↓ + L = segundo especial (meia barra).
  //  Juraci    L: Super Bolo de Cenoura        ↓L: chama o Dadá pra lavar a louça (chão molhado)
  //  Carlos    L: Gordão (come) / Modo Fé (batismo), alternando
  //  Pedro     L: bebe Heineken → Monstrão     ↓L: fumaça de cigarro
  //  Daniel    L: Modo Natal Praia + surpresa   ↓L: dancinha com notas musicais
  //  Franciely L: irritada + briga com o Carlos + fome sem fim   ↓L: jato de leite
  //  Gabi      L: Super L + brigadeiros (a Juraci vem buscar)    ↓L: canto
  function useHalf(f, attack, lineKey) {
    if (f.meter < 50) return fizzle(f);
    f.meter -= 50;
    startAttack(f, attack);
    if (lineKey) say(f, lineKey, { important: true, duration: 1.2 });
    return true;
  }

  function trySpecial(f, alt = false) {
    if (alt) {
      if (f.id === 'juraci') {
        if (f.meter < 50 || cameos.some(c => c.kind === 'dada' && c.owner === f)) return fizzle(f);
        f.meter -= 50;
        say(f, 'dada', { important: true, duration: 1.3 });
        spawnCameo('dada', f);
        return true;
      }
      if (f.id === 'pedro') return useHalf(f, 'smoke', 'smoke');
      if (f.id === 'daniel') return useHalf(f, 'dance', 'dance');
      if (f.id === 'franciely') return useHalf(f, 'milk', 'milk');
      if (f.id === 'gabi') return useHalf(f, 'dance', 'sing');
    }
    if (f.id === 'pedro') {
      if (f.meter >= 100 && f.form === 'normal') {
        startTransform(f, 'hulk');
        say(f, 'drink', { important: true, duration: 0.8 });
        return true;
      }
      return useHalf(f, 'smoke', 'smoke'); // já é Monstrão: L solta fumaça
    }
    if (f.meter < 100) return fizzle(f);
    if (f.id === 'franciely') {
      startTransform(f, 'brava');
      say(f, 'angry', { important: true, duration: 1.1 });
      const o = opponentOf(f);
      if (o.id === 'carlos') {
        // o adversário É o Carlos: ele foge de medo
        o.state = 'hitstun'; o.t = 0; o.stun = 1.1; o.vx = Math.sign(o.x - f.x || 1) * 900;
        say(o, 'flee', { important: true });
      } else {
        spawnCameo('carlosFlee', f);
      }
      return true;
    }
    if (f.id === 'gabi') {
      f.meter = 0;
      superFreeze = 0.4;
      superOwner = f;
      startAttack(f, 'superL');
      say(f, 'superL', { important: true });
      Audio.play('special');
      return true;
    }
    if (f.id === 'carlos') {
      startTransform(f, f.form === 'gordao' ? 'crente' : f.form === 'crente' ? 'gordao' : f.nextForm);
      f.food = Math.random() < 0.5 ? 'cake' : 'pizza';
      if (f.nextForm === 'gordao') say(f, f.food === 'cake' ? 'eatCake' : 'eatPizza', { important: true, duration: 0.7 });
      else say(f, 'baptize', { important: true, duration: 0.9 });
    } else if (f.id === 'daniel') {
      startTransform(f, 'praia');
      say(f, 'praia', { important: true, duration: 1.1 });
    } else {
      f.meter = 0;
      superFreeze = 0.4;
      superOwner = f;
      startAttack(f, 'special');
      say(f, 'special', { important: true });
      Audio.play('special');
      spark(f.x, FLOOR - f.y - 80, '#ffe680', 24);
    }
    return true;
  }

  // Surpresa do Modo Natal Praia (Daniel é imprevisível!)
  function praiaEvent(f) {
    const roll = Math.random();
    if (roll < 0.34) {
      // bate o carro: um carrinho atravessa a tela vindo de trás do Daniel
      say(f, 'car', { important: true });
      const fromLeft = f.facing > 0;
      spawnProjectile(f, {
        sprite: 'car', speed: 980, damage: 150, w: 150, h: 62, y: 34, life: 3,
        x: fromLeft ? camX - 140 : camX + worldW + 140
      });
      Audio.play('horn');
    } else if (roll < 0.67) {
      // pede pra esposa: ela pode deixar (cura) ou não
      say(f, 'askWife', { important: true, duration: 1.4 });
      f.wifeT = 1.5;
    } else {
      // show: três notas musicais voando
      say(f, 'sing', { important: true });
      spawnNotes(f);
    }
  }

  function spawnNotes(f) {
    for (let i = 0; i < 3; i++) {
      spawnProjectile(f, { sprite: 'note', speed: 430, damage: 40, w: 34, h: 40, y: 85 + i * 32, life: 2.2, wave: 18, offset: -i * 60, knockdown: false, hitstun: 0.4 });
    }
    Audio.play('special');
  }

  // Gabi: um "L" gigante voa e chovem brigadeiros no adversário; no fim a Juraci vem buscar a panela.
  function superL(f) {
    spawnProjectile(f, { sprite: 'L', speed: 540, damage: 120, w: 70, h: 110, y: 95, life: 2.4 });
    const o = opponentOf(f);
    for (let i = 0; i < 7; i++) {
      projectiles.push({
        owner: f, sprite: 'brigadeiro', x: o.x + rand(-90, 90), y: 420 + i * 30, baseY: 0, vx: 0, vy: -520,
        w: 26, h: 26, life: 3, max: 3, spin: rand(0, 6), wave: 0, delay: 0.5 + i * 0.12,
        move: { damage: 22, push: 60, hitstun: 0.22, blockstun: 0.12, hitstop: 0.03, heavy: false, knockdown: false }
      });
    }
    say(f, 'brigadeiro', { important: true, duration: 1.4 });
    spawnCameo('juraciPan', f, 1.6);
  }

  // ---------- Participações especiais (personagens que entram e saem da cena) ----------
  let cameos = [];
  function spawnCameo(kind, owner, delay = 0) {
    const dir = owner.facing;
    const behind = dir > 0 ? camX - 70 : camX + worldW + 70;
    cameos.push({
      kind, owner, dir, delay, t: 0, phase: 'enter', hit: false,
      x: kind === 'carlosFlee' ? owner.x - dir * 30 : behind,
      say: null
    });
  }

  function cameoSay(c, text, duration = 1.6, voice = '') {
    if (!text) return;
    c.say = { text, t: 0, life: duration };
    if (c.owner) c.owner.say = null; // evita balões sobrepostos
    if (voice) Audio.speak(text, voice);
  }

  function updateCameos(dt) {
    for (const c of cameos) {
      if (c.delay > 0) { c.delay -= dt; continue; }
      c.t += dt;
      if (c.say) { c.say.t += dt; if (c.say.t >= c.say.life) c.say = null; }
      const owner = c.owner;
      const o = opponentOf(owner);
      if (c.kind === 'dada') {
        const target = owner.x - owner.facing * 75;
        if (c.phase === 'enter') {
          if (c.t > 0.35 && !c.replied) { c.replied = true; cameoSay(c, pickLine(DIALOGUE.dada?.reply, owner) || 'Já vou, irmã!', 1.6, 'dada'); }
          c.walkDir = Math.sign(target - c.x) || 1;
          c.x += c.walkDir * 280 * dt;
          if (Math.abs(target - c.x) < 10) { c.phase = 'wash'; c.t = 0; }
        } else if (c.phase === 'wash') {
          if (Math.random() < 0.5) particles.push({ kind: 'bubble', x: c.x + rand(-20, 20), y: FLOOR - 70, vx: rand(-30, 30), vy: rand(-90, -40), life: 0.8, max: 0.8, color: '#e8f8ff', size: rand(4, 8) });
          if (c.t >= 0.6 && !c.soaped) {
            c.soaped = true;
            // água com sabão escorre pelo chão: quem estiver no chão escorrega
            projectiles.push({
              owner, sprite: 'soap', x: c.x, y: 12, baseY: 12, vx: Math.sign(o.x - c.x || 1) * 360, w: 90, h: 24,
              life: 3, max: 3, spin: 0, wave: 0, groundOnly: true,
              move: { damage: 50, push: 200, hitstun: 0.4, blockstun: 0.2, hitstop: 0.06, heavy: true, knockdown: true, unblockable: true }
            });
            cameoSay(c, pickLine(DIALOGUE.dada?.wash, owner), 1.5);
            Audio.play('splash');
          }
          if (c.t >= 1.5) { c.phase = 'leave'; c.t = 0; }
        } else {
          c.walkDir = owner.facing > 0 ? -1 : 1;
          c.x += c.walkDir * 300 * dt;
          if (c.x < camX - 120 || c.x > camX + worldW + 120) c.done = true;
        }
      } else if (c.kind === 'carlosFlee') {
        if (!c.said) { c.said = true; cameoSay(c, pickLine(DIALOGUE.carlos?.flee, owner), 1.4, 'carlos'); }
        c.x += c.dir * 640 * dt;
        if (!c.hit && Math.abs(c.x - o.x) < 50 && o.y < 60 && !(o.invuln > 0 || INVULNERABLE.has(o.state))) {
          c.hit = true;
          applyHit(owner, o, { damage: 70, push: 300, hitstun: 0.5, blockstun: 0.25, hitstop: 0.08, heavy: true, knockdown: true }, c.x - c.dir * 40, o.x, 90);
        }
        if (c.x < camX - 150 || c.x > camX + worldW + 150) c.done = true;
      } else if (c.kind === 'juraciPan') {
        const panX = owner.x - owner.facing * 70;
        if (!c.panX) c.panX = panX;
        if (o.id === 'juraci' && c.phase === 'enter') {
          // a adversária é a própria Juraci: ela larga a luta pra pegar a panela!
          // espera ela levantar (o L pode ter derrubado) e então ela larga a luta pela panela
          if (!NEUTRAL.has(o.state) || !grounded(o)) {
            if (c.t > 4) c.done = true;
            continue;
          }
          o.state = 'hitstun'; o.t = 0; o.stun = 1.4; o.vx = 0; o.holdPan = 1.6;
          say(o, 'brigadeiro', { important: true });
          c.done = true;
          continue;
        }
        if (c.phase === 'enter') {
          c.walkDir = Math.sign(c.panX - c.x) || 1;
          c.x += c.walkDir * 300 * dt;
          if (Math.abs(c.panX - c.x) < 12) { c.phase = 'grab'; c.t = 0; cameoSay(c, pickLine(DIALOGUE.juraci?.brigadeiro, owner), 1.6, 'juraci'); }
        } else if (c.phase === 'grab') {
          if (c.t >= 0.9) { c.phase = 'leave'; c.t = 0; c.carrying = true; }
        } else {
          c.walkDir = owner.facing > 0 ? -1 : 1;
          c.x += c.walkDir * 280 * dt;
          if (c.x < camX - 120 || c.x > camX + worldW + 120) c.done = true;
        }
      }
    }
    cameos = cameos.filter(c => !c.done);
  }

  function wifeAnswers(f) {
    const allowed = Math.random() < 0.5;
    const lines = (DIALOGUE.daniel || {})[allowed ? 'wifeYes' : 'wifeNo'];
    announce(pickLine(lines, f) || (allowed ? 'Pode, amor!' : 'NÃO!'), 'esposa', 'ESPOSA DO DANIEL');
    if (allowed) {
      f.hp = Math.min(MAX_HP, f.hp + 150);
      f.drinkT = 1.6;
      spark(f.x, FLOOR - 120, '#7dff8a', 18);
      Audio.play('bless');
    }
    f.replyKey = allowed ? 'drinkOk' : 'drinkNo';
    f.replyT = 1.2;
  }

  // Aviso no alto da tela (ex.: resposta da esposa do Daniel)
  let announcement = null;
  function announce(text, voice, label) {
    announcement = { text, label, t: 0, life: clamp(1.4 + text.length * 0.05, 1.8, 3) };
    Audio.speak(text, voice);
  }

  // Transformações:
  //  Carlos Gordão  = come um bolo ou uma pizza (mordidas + farelos) e engorda.
  //  Carlos Modo Fé = é batizado: chuva de água e luz do céu, depois ergue os braços.
  //  Pedro Monstrão = bebe uma Heineken (bolhas verdes) e fica musculoso.
  //  Daniel Praia   = dança com microfone e notas musicais, depois vem a surpresa.
  function transformStep(f, dt) {
    const t = f.t;
    const headY = FLOOR - f.ch.height + 10;
    const total = transformTime(f);
    if (f.nextForm === 'hulk') {
      if (t >= 0.3 && f.transformStage === 0) { f.transformStage = 1; say(f, 'gulp', { important: true, duration: 0.6 }); }
      if (t >= 0.85 && f.transformStage === 1) { f.transformStage = 2; Audio.play('transform'); shake = Math.max(shake, 5); }
      if (Math.random() < 0.5) particles.push({ x: f.x + rand(-30, 30), y: headY + rand(10, 90), vx: rand(-20, 20), vy: rand(-160, -60), life: 0.5, max: 0.5, color: Math.random() < 0.5 ? '#5dff6a' : '#d8ffd0', size: rand(3, 6) });
    } else if (f.nextForm === 'brava') {
      // fumacinha vermelha de raiva saindo da cabeça
      if (Math.random() < 0.7) particles.push({ x: f.x + rand(-14, 14), y: headY - 10, vx: rand(-60, 60), vy: rand(-200, -120), life: 0.5, max: 0.5, color: Math.random() < 0.5 ? '#ff4d4d' : '#ffb3a7', size: rand(4, 7) });
      if (t >= 0.65 && f.transformStage === 0) { f.transformStage = 1; say(f, 'hungry', { important: true, duration: 0.9 }); }
    } else if (f.nextForm === 'praia') {
      if (Math.floor(t / 0.16) !== Math.floor((t - dt) / 0.16)) {
        particles.push({ kind: 'note', x: f.x + rand(-50, 50), y: headY + rand(0, 40), vx: rand(-60, 60), vy: rand(-220, -120), life: 0.8, max: 0.8, color: ['#ff6fd8', '#62efff', '#ffe066', '#9b5de5'][Math.floor(rand(0, 4))], size: 22 });
        if (Math.random() < 0.5) Audio.play('ui');
      }
    } else if (f.nextForm === 'gordao') {
      if (t >= 0.35 && f.transformStage === 0) {
        f.transformStage = 1;
        say(f, 'chew', { important: true, duration: 0.6 });
      }
      // farelos a cada mordida
      if (t < 0.85 && Math.floor(t / 0.14) !== Math.floor((t - dt) / 0.14)) {
        Audio.play('bite');
        for (let i = 0; i < 6; i++) {
          particles.push({ x: f.x + f.facing * 26, y: headY + 30, vx: rand(-90, 90), vy: rand(-160, -40), life: 0.5, max: 0.5, color: f.food === 'pizza' ? (Math.random() < 0.5 ? '#ffcf5a' : '#c0392b') : (Math.random() < 0.5 ? '#f3c38b' : '#ff8a3d'), size: rand(3, 5) });
        }
      }
    } else {
      // água do batismo caindo sobre a cabeça
      if (t < 0.95) {
        for (let i = 0; i < 3; i++) {
          particles.push({ x: f.x + rand(-34, 34), y: FLOOR - 250 + rand(-10, 10), vx: rand(-15, 15), vy: rand(250, 380), life: 0.42, max: 0.42, color: Math.random() < 0.6 ? '#8fdcff' : '#e8fbff', size: rand(3, 5) });
        }
        if (Math.random() < 0.3) particles.push({ x: f.x + rand(-40, 40), y: FLOOR - 6, vx: rand(-120, 120), vy: rand(-200, -80), life: 0.35, max: 0.35, color: '#bfefff', size: 3 });
      }
      if (t >= 0.95 && f.transformStage === 0) {
        f.transformStage = 1;
        Audio.play('bless');
      }
    }
    if (t >= total) {
      f.form = f.nextForm;
      f.formTime = FORM_TIME;
      const [r, g, b] = form(f).aura || [255, 220, 120];
      spark(f.x, FLOOR - 90, `rgb(${r},${g},${b})`, 30);
      if (f.id === 'carlos') {
        f.nextForm = f.form === 'gordao' ? 'crente' : 'gordao';
        say(f, f.form === 'gordao' ? 'fat' : 'blessed', { important: true });
      } else if (f.form === 'hulk') {
        say(f, 'hulk', { important: true });
      }
      toNeutral(f);
      if (f.form === 'praia') praiaEvent(f);
    }
  }

  function stepFighter(f, dt) {
    f.t += dt;
    f.invuln = Math.max(0, f.invuln - dt);
    f.flash = Math.max(0, f.flash - dt);
    f.comboShow = Math.max(0, f.comboShow - dt);
    f.sayCooldown = Math.max(0, f.sayCooldown - dt);
    if (f.say) {
      f.say.t += dt;
      if (f.say.t >= f.say.life) f.say = null;
    }
    if (f.formTime > 0) {
      f.formTime -= dt;
      if (f.formTime <= 0) {
        f.formTime = 0;
        if (f.id === 'carlos') f.nextForm = f.form === 'gordao' ? 'crente' : 'gordao';
        f.form = 'normal';
        spark(f.x, FLOOR - f.y - 80, '#ffffff', 14);
        say(f, 'formEnd', { chance: 0.7 });
      }
    }
    // eventos com atraso do Daniel: esposa responde, depois ele comenta
    if (f.wifeT > 0) {
      f.wifeT -= dt;
      if (f.wifeT <= 0) wifeAnswers(f);
    }
    if (f.replyT > 0) {
      f.replyT -= dt;
      if (f.replyT <= 0) say(f, f.replyKey, { important: true });
    }
    if (f.drinkT > 0) f.drinkT -= dt;
    if (f.holdPan > 0) f.holdPan -= dt;
    // Franciely irritada: fome sem fim — vai beliscando e recuperando vida
    if (form(f).hungry && f.hp > 0) {
      f.hp = Math.min(MAX_HP, f.hp + 14 * dt);
      if (Math.random() < dt * 0.35) say(f, 'hungry', { chance: 0.8 });
      if (Math.random() < dt * 2) particles.push({ x: f.x + rand(-30, 30), y: FLOOR - f.y - f.ch.height + rand(-10, 10), vx: rand(-30, 30), vy: rand(-120, -60), life: 0.5, max: 0.5, color: '#ff5a4a', size: rand(3, 6) });
    }
    if (form(f).wild && Math.random() < dt * 3) {
      particles.push({ kind: 'note', x: f.x + rand(-40, 40), y: FLOOR - f.y - f.ch.height + rand(0, 30), vx: rand(-40, 40), vy: rand(-140, -80), life: 0.7, max: 0.7, color: ['#ff6fd8', '#62efff', '#ffe066'][Math.floor(rand(0, 3))], size: 18 });
    }
    // barra de vida "atrasada" (vermelha) acompanha a real depois de um instante
    if (f.hpLag > f.hp) {
      f.lagDelay -= dt;
      if (f.lagDelay <= 0) f.hpLag = Math.max(f.hp, f.hpLag - 600 * dt);
    } else {
      f.hpLag = f.hp;
    }

    const input = inputs[f.slot];
    const live = match.sub === 'fight';
    for (const k of HOLDS) f.held[k] = live && Boolean(input.kb[k] || input.touch[k] || input.pad[k] || input.ai[k]);
    if (f.held.up && !f.prevUp) pushAction(f.slot, 'jump');
    f.prevUp = f.held.up;
    f.buffer = f.buffer.filter(b => clock - b.t < 0.18);

    switch (f.state) {
      case 'idle': case 'walk': case 'crouch': case 'guard':
        neutral(f);
        break;
      case 'jumpsquat':
        f.vx = 0;
        if (f.t >= 0.06) {
          const dir = (f.held.right ? 1 : 0) - (f.held.left ? 1 : 0);
          f.vy = f.ch.jumpV * (form(f).jump || 1);
          f.vx = dir * f.ch.jumpX * speedMul(f);
          f.y = 1;
          setState(f, 'air');
          Audio.play('jump');
        }
        break;
      case 'air': {
        const action = f.airAttacked ? null : takeAction(f, ['light', 'heavy']);
        if (action) { f.airAttacked = true; startAttack(f, 'air'); }
        break;
      }
      case 'attack':
        attackStep(f);
        break;
      case 'hitstun': case 'blockstun':
        if (f.t >= f.stun && grounded(f)) toNeutral(f);
        break;
      case 'landing':
        if (f.t >= f.stun) toNeutral(f);
        break;
      case 'down':
        if (f.t >= 0.6) {
          if (f.hp <= 0) setState(f, 'ko');
          else { setState(f, 'getup'); f.invuln = 0.6; }
        }
        break;
      case 'getup':
        if (f.t >= 0.4) toNeutral(f);
        break;
      case 'transform':
        transformStep(f, dt);
        break;
      case 'win':
        // Pedro foge pro Bar da Simone
        if (f.id === 'pedro') { f.vx = 0; f.x += (f.escapeDir || 1) * 75 * dt; }
        break;
      default:
        break;
    }
    physics(f, dt);
  }

  function neutral(f) {
    faceOpponent(f);
    const action = takeAction(f, ['jump', 'special', 'light', 'heavy']);
    if (action === 'jump') { f.state = 'jumpsquat'; f.t = 0; return; }
    if (action === 'special') { trySpecial(f, Boolean(f.held.down)); return; }
    if (action === 'light' || action === 'heavy') { startAttack(f, action); return; }
    const h = f.held;
    if (h.guard) { setState(f, 'guard'); f.crouchGuard = h.down; f.vx = 0; return; }
    if (h.down) { setState(f, 'crouch'); f.vx = 0; return; }
    const dir = (h.right ? 1 : 0) - (h.left ? 1 : 0);
    if (dir) {
      const forward = dir === f.facing;
      f.vx = dir * (forward ? f.ch.walk : f.ch.back) * speedMul(f);
      setState(f, 'walk');
    } else {
      f.vx = 0;
      setState(f, 'idle');
    }
  }

  function attackStep(f) {
    const m = f.move;
    const o = opponentOf(f);
    const total = m.startup + m.active + m.recovery;
    if ((m.projectile || m.notes || m.superL) && !f.hitDone && f.t >= m.startup) {
      f.hitDone = true;
      if (m.projectile) spawnProjectile(f, m.projectile);
      if (m.notes) spawnNotes(f);
      if (m.superL) superL(f);
    }
    if (m.box && !f.hitDone && f.t >= m.startup && f.t <= m.startup + m.active) {
      const box = hitbox(f, m);
      if (resolveHit(f, o, m, box)) f.hitDone = true;
    }
    // cancelamento: combos e "super cancel" para o especial
    if (f.connected && f.t >= m.startup) {
      if (m.chain) {
        const button = takeAction(f, Object.keys(m.chain));
        if (button) { startAttack(f, m.chain[button]); return; }
      }
      const alt = Boolean(f.held.down);
      if (f.meter >= (alt ? 50 : 100) && takeAction(f, ['special'])) { trySpecial(f, alt); return; }
    }
    if (f.t >= total) {
      if (f.y > 0) { f.state = 'air'; f.t = 0; } else toNeutral(f);
    }
  }

  function physics(f, dt) {
    const airborne = f.y > 0 || f.vy > 0;
    if (airborne) {
      f.vy -= f.ch.gravity * dt;
      f.y += f.vy * dt;
      if (f.y <= 0) {
        f.y = 0;
        f.vy = 0;
        land(f);
      }
    } else if (f.state !== 'walk') {
      f.vx *= Math.exp(-8 * dt);
      if (Math.abs(f.vx) < 4) f.vx = 0;
    }
    f.x += f.vx * dt;
  }

  function land(f) {
    dust(f.x, 0.6);
    if (f.state === 'launch') {
      setState(f, 'down');
      f.vx *= 0.3;
      shake = Math.max(shake, 4);
      dust(f.x, 1.1);
      Audio.play('land');
    } else if (f.state === 'air' || f.state === 'attack') {
      f.stun = f.state === 'attack' ? 0.12 : 0.05;
      f.state = 'landing';
      f.t = 0;
      f.vx = 0;
      f.move = null;
      Audio.play('land');
    } else if (f.state === 'hitstun') {
      f.vx *= 0.5;
    }
  }

  // ======================================================================
  // Colisão e dano
  // ======================================================================
  function hitbox(f, m) {
    const reach = form(f).reach;
    const a = f.x + f.facing * m.box[0];
    const b = f.x + f.facing * m.box[1] * reach;
    return { x1: Math.min(a, b), x2: Math.max(a, b), y1: f.y + m.box[2], y2: f.y + m.box[3] };
  }

  function hurtbox(f) {
    const crouched = f.state === 'crouch' || (f.state === 'guard' && f.crouchGuard);
    const h = crouched ? f.ch.crouchHeight : f.ch.height;
    const w = f.ch.width + 8 + form(f).wide;
    return { x1: f.x - w, x2: f.x + w, y1: f.y, y2: f.y + h };
  }

  const overlaps = (a, b) => a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;

  function isBlocking(def, fromX) {
    if (!grounded(def) || !def.held.guard) return false;
    if (!NEUTRAL.has(def.state) && def.state !== 'blockstun') return false;
    const side = Math.sign(fromX - def.x) || def.facing;
    return side === def.facing; // só bloqueia golpes vindos da frente
  }

  function resolveHit(att, def, m, box) {
    if (def.invuln > 0 || INVULNERABLE.has(def.state)) return false;
    const hurt = hurtbox(def);
    if (!overlaps(box, hurt)) return false;
    const cx = (Math.max(box.x1, hurt.x1) + Math.min(box.x2, hurt.x2)) / 2;
    const cy = (Math.max(box.y1, hurt.y1) + Math.min(box.y2, hurt.y2)) / 2;
    applyHit(att, def, m, att.x, cx, cy);
    return true;
  }

  function applyHit(att, def, m, fromX, cx, cy) {
    const dir = Math.sign(def.x - fromX) || att.facing;
    // Natal Praia: dano imprevisível (de 60% a 180%)
    const atkMul = form(att).atk * (form(att).wild ? rand(0.6, 1.8) : 1);
    const defMul = form(def).def;
    const pushMul = form(att).push;
    att.connected = true;
    if (!m.unblockable && isBlocking(def, fromX)) {
      const chip = Math.round(m.damage * 0.12 * atkMul * defMul);
      def.hp = Math.max(1, def.hp - chip);
      def.lagDelay = 0.4;
      def.state = 'blockstun';
      def.t = 0;
      def.stun = m.blockstun;
      def.vx = dir * m.push * 0.8 * pushMul;
      // encurralado na parede: quem atacou é empurrado para trás
      if (def.x <= WALL + 2 || def.x >= STAGE_W - WALL - 2) att.vx = -dir * m.push * 0.6;
      att.meter = Math.min(100, att.meter + 5);
      def.meter = Math.min(100, def.meter + 8);
      hitstop = 0.05;
      shake = Math.max(shake, 2);
      spark(cx, FLOOR - cy, '#8fe3ff', 8);
      addEffect('star', cx, FLOOR - cy, 0.45, 0.18);
      Audio.play('block');
      return;
    }
    const scaling = Math.max(0.4, 1 - att.combo * 0.16);
    const damage = Math.max(1, Math.round(m.damage * atkMul * defMul * scaling));
    def.hp = Math.max(0, def.hp - damage);
    def.lagDelay = 0.45;
    att.combo += 1;
    att.comboShow = 1.2;
    att.stats.hits += 1;
    att.stats.damage += damage;
    att.stats.maxCombo = Math.max(att.stats.maxCombo, att.combo);
    if (att.combo === 3) say(att, 'combo', { chance: 0.6 });
    if (def.hp > 0 && (m.knockdown || def.y > 0)) say(def, 'knockdown', { chance: 0.45 });
    att.meter = Math.min(100, att.meter + 10);
    def.meter = Math.min(100, def.meter + 6);
    def.flash = 0.2;
    def.move = null;
    const knockdown = m.knockdown || def.hp === 0 || def.y > 0;
    if (knockdown) {
      def.state = 'launch';
      def.t = 0;
      def.vy = def.hp === 0 ? 640 : 520;
      def.vx = dir * (260 + m.push * 0.3) * pushMul;
      def.y = Math.max(def.y, 1);
    } else {
      def.state = 'hitstun';
      def.t = 0;
      def.stun = m.hitstun;
      def.vx = dir * m.push * pushMul;
    }
    if (m.cough && def.hp > 0) say(def, '', { important: true, text: 'Cof! Cof! Cof!', duration: 1 });
    hitstop = def.hp === 0 ? 0.2 : m.hitstop || 0.06;
    shake = Math.max(shake, m.heavy || knockdown ? 7 : 4);
    addEffect('burst', cx, FLOOR - cy, m.heavy || knockdown ? 0.85 : 0.55, 0.22);
    spark(cx, FLOOR - cy, '#ffe25a', m.heavy ? 14 : 8);
    Audio.play(m.heavy || knockdown ? 'hitHeavy' : 'hitLight');
    if (!def.isCpu && settings.vibration && touchSeen && navigator.vibrate) {
      try { navigator.vibrate(m.heavy || knockdown ? 45 : 20); } catch { /* sem suporte */ }
    }
    if (def.hp === 0 && match.sub === 'fight') onKO(att, def);
  }

  function spawnProjectile(f, p) {
    projectiles.push({
      owner: f, sprite: p.sprite,
      x: p.x !== undefined ? p.x : f.x + f.facing * (64 + (p.offset || 0)),
      y: f.y + p.y, baseY: f.y + p.y, vx: f.facing * p.speed,
      w: p.w, h: p.h, life: p.life || 2.6, max: p.life || 2.6, spin: 0, wave: p.wave || 0,
      move: {
        damage: p.damage, push: 300, hitstun: p.hitstun || 0.45, blockstun: 0.26, hitstop: 0.12,
        heavy: true, knockdown: p.knockdown !== false, cough: Boolean(p.cough)
      }
    });
  }

  function updateProjectiles(dt) {
    for (const p of projectiles) {
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.x += p.vx * dt;
      p.life -= dt;
      p.spin += dt * 9;
      if (p.wave) p.y = p.baseY + Math.sin(p.spin * 1.3) * p.wave;
      if (p.vy) {
        p.y += p.vy * dt;
        if (p.y <= 8) { // brigadeiro caiu no chão
          p.dead = true;
          spark(p.x, FLOOR - 6, '#5a2d14', 5);
          continue;
        }
      }
      if (p.groundOnly && opponentOf(p.owner).y > 20) { // pulou por cima da água
        continue;
      }
      if (p.sprite === 'smoke') { p.w += dt * 30; p.h += dt * 20; p.vx *= Math.exp(-0.5 * dt); }
      const trail = { cake: ['#ffb9d1', '#ffe9a8'], smoke: ['#d9d4e6', '#a9a3b8'], car: ['#777', '#bbb'], note: ['#ff6fd8', '#62efff'] }[p.sprite] || ['#fff', '#ddd'];
      if (Math.random() < 0.6) particles.push({ x: p.x - Math.sign(p.vx) * (p.w / 2), y: FLOOR - p.y + rand(-8, 8), vx: -p.vx * 0.05, vy: rand(-30, 10), life: 0.35, max: 0.35, color: trail[Math.random() < 0.5 ? 0 : 1], size: rand(3, 6) });
      const target = opponentOf(p.owner);
      const box = { x1: p.x - p.w / 2, x2: p.x + p.w / 2, y1: p.y - p.h / 2, y2: p.y + p.h / 2 };
      if (!p.dead && !(target.invuln > 0 || INVULNERABLE.has(target.state)) && overlaps(box, hurtbox(target))) {
        p.dead = true;
        applyHit(p.owner, target, p.move, p.x - Math.sign(p.vx) * 40, p.x, p.y);
        if (p.sprite === 'cake') addEffect('cakeHit', p.x, FLOOR - p.y, 0.9, 0.35);
        else if (p.sprite === 'car') { addEffect('burst', p.x, FLOOR - p.y, 1.2, 0.35); Audio.play('crash'); }
        else addEffect('burst', p.x, FLOOR - p.y, 0.6, 0.25);
      }
    }
    // projéteis opostos se anulam
    for (let i = 0; i < projectiles.length; i++) {
      for (let j = i + 1; j < projectiles.length; j++) {
        const a = projectiles[i];
        const b = projectiles[j];
        if (a.owner !== b.owner && a.sprite !== 'car' && b.sprite !== 'car' && Math.abs(a.x - b.x) < 40 && Math.abs(a.y - b.y) < 40) {
          a.dead = b.dead = true;
          addEffect('cakeHit', (a.x + b.x) / 2, FLOOR - a.y, 0.9, 0.35);
        }
      }
    }
    projectiles = projectiles.filter(p => !p.dead && p.life > 0 && p.x > -400 && p.x < STAGE_W + 400);
  }

  function resolvePush() {
    const [a, b] = fighters;
    // corpos não se atravessam (exceto pulando por cima)
    const minDist = a.ch.width + b.ch.width;
    const dx = b.x - a.x;
    if (Math.abs(a.y - b.y) < 90 && Math.abs(dx) < minDist && a.state !== 'down' && b.state !== 'down') {
      const side = Math.sign(dx) || a.facing;
      const overlap = minDist - Math.abs(dx);
      a.x -= side * overlap / 2;
      b.x += side * overlap / 2;
    }
    for (const f of fighters) f.x = clamp(f.x, WALL, STAGE_W - WALL);
    if (Math.abs(b.x - a.x) < minDist && Math.abs(a.y - b.y) < 90) {
      const side = Math.sign(b.x - a.x) || a.facing;
      const target = minDist;
      if (a.x <= WALL + 0.5 || a.x >= STAGE_W - WALL - 0.5) b.x = clamp(a.x + side * target, WALL, STAGE_W - WALL);
      else a.x = clamp(b.x - side * target, WALL, STAGE_W - WALL);
    }
    // os dois sempre cabem na tela
    const sep = b.x - a.x;
    const maxSep = worldW - 110; // os dois sempre cabem na câmera aproximada
    if (Math.abs(sep) > maxSep) {
      const excess = Math.abs(sep) - maxSep;
      const s = Math.sign(sep);
      const aAway = -s * a.vx > 0;
      const bAway = s * b.vx > 0;
      if (aAway && !bAway) a.x += s * excess;
      else if (bAway && !aAway) b.x -= s * excess;
      else { a.x += s * excess / 2; b.x -= s * excess / 2; }
    }
  }

  // ======================================================================
  // IA
  // ======================================================================
  const AI_LEVELS = {
    easy:   { react: 0.5, block: 0.15, antiAir: 0.1, aggression: 0.4, chain: 0.15, special: 0.3, jumpIn: 0.04, retreat: 0.25 },
    normal: { react: 0.3, block: 0.45, antiAir: 0.35, aggression: 0.58, chain: 0.5, special: 0.6, jumpIn: 0.08, retreat: 0.18 },
    hard:   { react: 0.16, block: 0.78, antiAir: 0.7, aggression: 0.72, chain: 0.9, special: 0.85, jumpIn: 0.12, retreat: 0.12 }
  };

  function runAI(f, dt) {
    const o = opponentOf(f);
    const ai = f.ai;
    const src = inputs[f.slot].ai;
    const L = AI_LEVELS[match.difficulty] || AI_LEVELS.normal;
    const dist = Math.abs(o.x - f.x);
    const toward = Math.sign(o.x - f.x) || 1;
    ai.timer -= dt;
    ai.guardT = Math.max(0, ai.guardT - dt);

    // ao sair de atordoamento/levantar sob pressão: defende ou contra-ataca
    const recovering = ['hitstun', 'blockstun', 'getup', 'landing'].includes(ai.prevState);
    ai.prevState = f.state;
    if (recovering && NEUTRAL.has(f.state) && dist < 190) {
      const roll = Math.random();
      if (o.state === 'attack' && o.move && o.t > o.move.startup + o.move.active && roll < L.block) {
        pushAction(f.slot, 'light'); // pune o golpe que ficou na recuperação
      } else if (roll < L.block) {
        ai.guardT = 0.25 + rand(0, 0.2);
      } else if (roll < L.block + L.aggression * 0.3) {
        pushAction(f.slot, 'light');
      }
    }

    // reação a ameaças: golpe saindo ou projétil vindo
    let threatKey = '';
    if (o.state === 'attack' && o.move && o.t < o.move.startup + 0.03 && dist < 200) threatKey = `atk${o.moveName}${Math.round(match.t * 2)}`;
    const incoming = projectiles.find(p => p.owner === o && Math.sign(f.x - p.x) === Math.sign(p.vx) && Math.abs(p.x - f.x) < 280);
    if (incoming) threatKey = 'proj' + projectiles.indexOf(incoming);
    if (threatKey && threatKey !== ai.threatKey) {
      ai.threatKey = threatKey;
      ai.willBlock = Math.random() < L.block;
      ai.reactAt = clock + L.react * rand(0.3, 0.8);
    }
    if (threatKey && ai.willBlock && clock >= ai.reactAt && NEUTRAL.has(f.state)) {
      if (incoming && Math.random() < L.antiAir * 0.3 && Math.abs(incoming.x - f.x) > 150) {
        src.right = toward > 0; src.left = toward < 0;
        pushAction(f.slot, 'jump');
        ai.willBlock = false;
      } else {
        ai.guardT = 0.3;
      }
    }
    if (!threatKey) ai.threatKey = '';
    src.guard = ai.guardT > 0;
    if (src.guard) { src.left = src.right = src.down = false; return; }

    // antiaéreo
    if (o.y > 40 && dist < 200 && !ai.aaTried && NEUTRAL.has(f.state)) {
      ai.aaTried = true;
      if (Math.random() < L.antiAir) pushAction(f.slot, 'heavy');
    }
    if (o.y === 0) ai.aaTried = false;

    // continuar combo quando acerta (decide uma vez por golpe)
    if (f.state === 'attack' && f.connected && f.move && f.move.chain && ai.chainKey !== f.attackId) {
      ai.chainKey = f.attackId;
      if (Math.random() < L.chain) {
        const options = Object.keys(f.move.chain);
        pushAction(f.slot, options[Math.floor(Math.random() * options.length)]);
      }
    }

    if (ai.timer <= 0) {
      ai.timer = L.react + rand(0, 0.25);
      ai.crouch = false;
      const full = f.meter >= 100 && f.form === 'normal';
      const wantsSpecial = (f.id === 'juraci' && f.meter >= 100 && dist > 180)
        || (['carlos', 'daniel', 'franciely', 'pedro'].includes(f.id) && full)
        || (f.id === 'gabi' && f.meter >= 100 && dist > 150);
      // segundo especial (↓ + L) com meia barra, de longe
      const wantsAlt = !wantsSpecial && f.meter >= 50 && f.id !== 'carlos' && dist > 230 && Math.random() < L.special * 0.35;
      if (wantsAlt) {
        ai.crouch = true;
        src.down = true;
        f.held.down = true;
        pushAction(f.slot, 'special');
        ai.moveDir = 0;
      } else if (wantsSpecial && Math.random() < L.special) {
        pushAction(f.slot, 'special');
        ai.moveDir = 0;
      } else if (dist > 165) {
        ai.moveDir = toward;
        if (Math.random() < L.jumpIn && dist < 340) pushAction(f.slot, 'jump');
      } else if (dist < 135 && Math.random() < L.aggression) {
        ai.moveDir = 0;
        pushAction(f.slot, Math.random() < 0.62 ? 'light' : 'heavy');
      } else if (Math.random() < L.retreat) {
        ai.moveDir = -toward;
      } else {
        ai.moveDir = dist > 115 ? toward : 0;
        ai.crouch = Math.random() < 0.08;
      }
    }
    src.left = ai.moveDir < 0;
    src.right = ai.moveDir > 0;
    src.down = Boolean(ai.crouch);
  }

  // ======================================================================
  // Efeitos visuais
  // ======================================================================
  function addEffect(name, x, y, scale = 1, life = 0.25) {
    effects.push({ name, x, y, scale, life, max: life, rot: rand(-0.4, 0.4) });
  }
  function spark(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2);
      const s = rand(80, 320);
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80, life: rand(0.2, 0.45), max: 0.45, color, size: rand(3, 6) });
    }
  }
  function dust(x, scale) {
    addEffect('dust', x, FLOOR - 14 * scale, 0.45 * scale, 0.3);
  }
  function updateEffects(dt) {
    for (const e of effects) e.life -= dt;
    effects = effects.filter(e => e.life > 0);
    for (const p of particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 700 * dt;
      p.life -= dt;
    }
    particles = particles.filter(p => p.life > 0);
    if (particles.length > 400) particles.splice(0, particles.length - 400);
  }

  // ======================================================================
  // Partida e rounds
  // ======================================================================
  function resolveStage() {
    if (settings.stage !== 'random') return settings.stage;
    const list = ['padaria', 'quintal', 'festa', 'bar', 'praia'];
    return list[Math.floor(Math.random() * list.length)];
  }
  // AUTO = adversário sorteado entre os outros lutadores. Na tela de seleção (preview)
  // a prévia vai alternando entre eles.
  function resolveOpponent(preview = false) {
    if (settings.opponent !== 'auto') return settings.opponent;
    if (!preview) return randomOther(settings.fighter);
    const others = PLAYABLE.filter(id => id !== settings.fighter);
    return others[Math.floor(clock / 1.1) % others.length];
  }

  // prepareOnly: só monta a luta (usado pela tela VS, que começa a luta depois)
  function startMatch(prepareOnly = false) {
    const p1 = settings.fighter;
    const p2 = resolveOpponent();
    const mode = settings.mode;
    match = {
      mode, difficulty: settings.difficulty, stage: resolveStage(),
      wins: [0, 0], round: 1, sub: 'intro', t: 0, roundWinner: -1, resultShown: false,
      winsNeeded: settings.rounds, roundTime: settings.roundTime || Infinity, timer: settings.roundTime || Infinity
    };
    fighters = [createFighter(0, p1, false, false), createFighter(1, p2, mode === 'cpu', p1 === p2)];
    ensureStage(match.stage);
    $('#heavyLabel').textContent = CHARS[p1].heavyLabel;
    $('[data-act="heavy"]').setAttribute('aria-label', CHARS[p1].heavyLabel === 'CHUTE' ? 'Chute' : 'Golpe forte');
    startRound();
    paused = false;
    Audio.unlock();
    if (prepareOnly) return;
    setApp('fight');
    playFightMusic();
    if (matchMedia('(pointer: coarse)').matches) void enterFullscreen();
  }

  // Música da luta: uma faixa gravada por cenário (padrão), sempre "Bolo da Juraci" ou 8-bit.
  const STAGE_MUSIC = { padaria: 'theme', quintal: 'ff3', festa: 'ff2', bar: 'ff2', praia: 'ff3' };
  function playFightMusic() {
    if (!match) return;
    if (settings.fightMusic === 'chip') Audio.startMusic(match.stage);
    else Audio.startMusic(settings.fightMusic === 'theme' ? 'theme' : STAGE_MUSIC[match.stage] || 'theme', 0.6);
  }

  function startRound() {
    for (const f of fighters) resetFighterForRound(f);
    projectiles = [];
    effects = [];
    particles = [];
    cameos = [];
    announcement = null;
    hitstop = 0;
    superFreeze = 0;
    shake = 0;
    match.sub = 'intro';
    match.t = 0;
    match.timer = match.roundTime;
    match.roundWinner = -1;
    match.perfect = false;
    camX = (STAGE_W - worldW) / 2;
    camTop = CAM_TOP;
    clearInputs();
    const intros = DIALOGUE.intro || {};
    const options = intros[`${fighters[0].id}>${fighters[1].id}`] || intros['*'];
    if (match.round === 1 && settings.talk && Array.isArray(options) && options.length) {
      match.sub = 'talk';
      match.skipTalk = false;
      match.talk = { lines: options[Math.floor(Math.random() * options.length)], i: -1, next: 0.35 };
    } else {
      beginIntro();
    }
  }

  function beginIntro() {
    for (const f of fighters) f.say = null;
    Audio.stopSpeech();
    // Franciely na praia: "Na praia a gente só desarma!" (voz real) no 1º round
    const fran = fighters.find(f => f.id === 'franciely');
    if (fran && match.stage === 'praia' && match.round === 1 && Audio.hasClip && Audio.hasClip('franciely', 'desarma')) {
      const clipText = Audio.playClip('franciely', 'desarma');
      fran.say = { text: clipText, t: 0, life: 2 };
    }
    match.sub = 'intro';
    match.t = 0;
    Audio.play('round');
  }

  function updateTalk() {
    const talk = match.talk;
    if (match.skipTalk) { beginIntro(); return; }
    if (match.t < talk.next) return;
    talk.i += 1;
    if (talk.i >= talk.lines.length) { beginIntro(); return; }
    const [who, text] = talk.lines[talk.i];
    const f = fighters[who === 'p2' ? 1 : 0];
    const line = pickLine([text], f);
    const duration = clamp(1.3 + line.length * 0.05, 1.7, 3.6);
    for (const other of fighters) if (other !== f) other.say = null;
    say(f, '', { important: true, text: line, duration });
    talk.next = match.t + duration + 0.12;
  }

  function onKO(att, def) {
    match.sub = 'ko';
    match.t = 0;
    match.roundWinner = att.slot;
    match.perfect = att.hp === MAX_HP;
    say(def, 'lose', { important: true });
    Audio.play('ko');
  }

  function endRound() {
    const w = match.roundWinner;
    if (w >= 0) match.wins[w] += 1;
    match.sub = 'roundEnd';
    match.t = 0;
    if (w >= 0) {
      const f = fighters[w];
      // no Bar da Simone o Pedro vai direto pra porta; nos outros, sai de cena
      f.escapeDir = match.stage === 'bar' ? Math.sign(STAGE_W / 2 - f.x) || 1 : Math.sign(f.x - opponentOf(f).x) || 1;
      if (grounded(f)) { f.state = 'win'; f.t = 0; f.vx = 0; }
    }
    if (w >= 0) {
      Audio.play('win');
      say(fighters[w], 'win', { important: true, duration: 2.3 });
    }
  }

  function updateMatch(dt) {
    match.t += dt;
    switch (match.sub) {
      case 'talk':
        updateTalk();
        break;
      case 'intro':
        if (match.t >= 1.9) {
          match.sub = 'fight';
          match.t = 0;
          Audio.play('fight');
        }
        break;
      case 'fight':
        match.timer = Math.max(0, match.timer - dt);
        if (match.timer === 0) {
          match.sub = 'timeup';
          match.t = 0;
          const [a, b] = fighters;
          match.roundWinner = a.hp === b.hp ? -1 : a.hp > b.hp ? 0 : 1;
          Audio.play('ko');
        }
        break;
      case 'ko': {
        const loser = fighters[1 - match.roundWinner];
        if (match.t >= 2.2 && (loser.state === 'ko' || loser.state === 'down')) endRound();
        break;
      }
      case 'timeup':
        if (match.t >= 1.8) endRound();
        break;
      case 'roundEnd': {
        const w = match.roundWinner;
        if (w >= 0 && fighters[w].state !== 'win' && grounded(fighters[w]) && NEUTRAL.has(fighters[w].state)) {
          fighters[w].state = 'win';
          fighters[w].t = 0;
        }
        if (match.t >= 2.4) {
          const done = match.wins[0] >= match.winsNeeded || match.wins[1] >= match.winsNeeded || match.round >= match.winsNeeded * 2 + 1;
          if (done) showResult();
          else { match.round += 1; startRound(); }
        }
        break;
      }
      default:
        break;
    }
  }

  function tick(dt) {
    clock += dt;
    updateEffects(dt);
    shake = Math.max(0, shake - dt * 30);
    if (superFreeze > 0) { superFreeze -= dt; return; }
    if (hitstop > 0) { hitstop -= dt; return; }
    const slow = match.sub === 'ko' && match.t < 1.1 ? 0.35 : 1;
    const sdt = dt * slow;
    if (match.sub === 'fight') {
      for (const f of fighters) if (f.isCpu) runAI(f, sdt);
    } else {
      // ninguém age durante anúncios/K.O.: entradas são ignoradas em stepFighter
      for (const input of inputs) input.ai = {};
      for (const f of fighters) f.buffer = [];
    }
    for (const f of fighters) stepFighter(f, sdt);
    updateProjectiles(sdt);
    updateCameos(sdt);
    if (announcement) { announcement.t += sdt; if (announcement.t >= announcement.life) announcement = null; }
    resolvePush();
    updateMatch(dt);
    // câmera segue o centro da luta
    const target = clamp((fighters[0].x + fighters[1].x) / 2 - worldW / 2, 0, STAGE_W - worldW);
    // sobe a câmera quando alguém pula alto, para a cabeça não sumir sob o placar
    const highest = Math.min(...fighters.map(f => FLOOR - f.y - f.ch.height));
    const topTarget = clamp(Math.min(CAM_TOP, highest - 85), 30, CAM_TOP);
    camTop += (topTarget - camTop) * Math.min(1, dt * 6);
    camX += (target - camX) * Math.min(1, dt * 7);
    updateSpecialButton();
  }

  let lastMeterShown = -1;
  function updateSpecialButton() {
    const f = fighters[0];
    if (!f) return;
    const value = Math.round(f.meter);
    if (value === lastMeterShown) return;
    lastMeterShown = value;
    const button = $('[data-act="special"]');
    button.style.setProperty('--meter', `${value}%`);
    button.classList.toggle('ready', value >= 100);
  }

  function showResult() {
    if (match.resultShown) return;
    match.resultShown = true;
    const [a, b] = fighters;
    const [wa, wb] = match.wins;
    const versus = match.mode === 'versus';
    let title;
    let outcome;
    if (wa === wb) { title = 'EMPATE!'; outcome = 'draw'; }
    else if (wa > wb) { title = versus ? `1P ${CHARS[a.id].name} VENCE!` : 'VOCÊ VENCEU!'; outcome = 'win'; }
    else { title = versus ? `2P ${CHARS[b.id].name} VENCE!` : `${CHARS[b.id].name} (CPU) VENCE!`; outcome = 'loss'; }
    $('#resultTitle').textContent = title;
    $('#resultText').textContent = `Placar de rounds: ${wa} × ${wb} · ${stageNames[match.stage]}`;
    const stats = [
      ['GOLPES', a.stats.hits],
      ['MAIOR COMBO', a.stats.maxCombo],
      ['DANO CAUSADO', a.stats.damage]
    ];
    const list = $('#resultStats');
    list.replaceChildren(...stats.map(([label, value]) => {
      const div = document.createElement('div');
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = label;
      dd.textContent = String(value);
      div.append(dt, dd);
      return div;
    }));
    $('#syncStatus').textContent = '';
    setApp('result');
    Audio.startMusic('theme');
    if (!versus) void Account.recordMatch(outcome, a.id);
  }

  // ======================================================================
  // Cenários (pré-renderizados em canvas fora da tela — desenhados uma vez)
  // ======================================================================
  const stageNames = {
    padaria: 'Padaria da Juju',
    quintal: 'Quintal da Família',
    festa: 'Festa Junina',
    bar: 'Bar da Simone',
    praia: 'Praia'
  };

  function seeded(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function layer(width, k) {
    const c = document.createElement('canvas');
    c.width = Math.ceil(width * k);
    c.height = Math.ceil(H * k);
    const g = c.getContext('2d');
    g.scale(k, k);
    return [c, g];
  }

  function gtext(g, value, x, y, size, fill, align = 'center', stroke = '#2a1020', lw = 4, font = 'Impact, "Arial Black", sans-serif') {
    g.font = `${size}px ${font}`;
    g.textAlign = align;
    g.textBaseline = 'alphabetic';
    if (stroke) { g.lineJoin = 'round'; g.lineWidth = lw; g.strokeStyle = stroke; g.strokeText(value, x, y); }
    g.fillStyle = fill;
    g.fillText(value, x, y);
  }

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  function cloud(g, x, y, s, color) {
    g.fillStyle = color;
    g.beginPath();
    for (const [dx, dy, r] of [[0, 0, 26], [28, -12, 30], [58, -2, 24], [84, 6, 18], [-24, 8, 18]]) {
      g.moveTo(x + dx * s + r * s, y + dy * s);
      g.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2);
    }
    g.fill();
  }

  function perspectiveFloor(g, width, base, line, top = FLOOR) {
    const grad = g.createLinearGradient(0, top, 0, H);
    grad.addColorStop(0, base[0]);
    grad.addColorStop(1, base[1]);
    g.fillStyle = grad;
    g.fillRect(0, top, width, H - top);
    g.strokeStyle = line;
    g.lineWidth = 2;
    let y = top;
    let step = 10;
    while (y < H) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(width, y); g.stroke();
      y += step;
      step *= 1.35;
    }
    const vx = width / 2;
    for (let x = -width; x <= width * 2; x += 70) {
      g.beginPath();
      g.moveTo(vx + (x - vx) * 0.55, top);
      g.lineTo(x, H);
      g.stroke();
    }
    g.fillStyle = '#0003';
    g.fillRect(0, top, width, 6);
  }

  function bush(g, x, y, s, rnd) {
    for (let i = 0; i < 6; i++) {
      g.fillStyle = i % 2 ? '#2f8a3c' : '#3fa34c';
      g.beginPath();
      g.arc(x + (rnd() - 0.5) * 50 * s, y - rnd() * 22 * s, (14 + rnd() * 12) * s, 0, Math.PI * 2);
      g.fill();
    }
  }

  function flowerPot(g, x, rnd) {
    g.fillStyle = '#a0522d';
    g.beginPath();
    g.moveTo(x - 24, FLOOR - 46); g.lineTo(x + 24, FLOOR - 46); g.lineTo(x + 17, FLOOR); g.lineTo(x - 17, FLOOR);
    g.fill();
    g.fillStyle = '#7a3b1f';
    g.fillRect(x - 27, FLOOR - 50, 54, 8);
    bush(g, x, FLOOR - 50, 0.8, rnd);
    const colors = ['#ff7eb6', '#ffd23f', '#ffffff', '#ff4d6d'];
    for (let i = 0; i < 9; i++) {
      g.fillStyle = colors[i % colors.length];
      g.beginPath();
      g.arc(x + (rnd() - 0.5) * 50, FLOOR - 60 - rnd() * 26, 4.5, 0, Math.PI * 2);
      g.fill();
    }
  }

  const STAGES = {
    padaria: {
      far(g, w) {
        const rnd = seeded(11);
        const sky = g.createLinearGradient(0, 0, 0, FLOOR);
        sky.addColorStop(0, '#5fb7f2'); sky.addColorStop(0.6, '#bfe6ff'); sky.addColorStop(1, '#ffe6b8');
        g.fillStyle = sky; g.fillRect(0, 0, w, H);
        for (let i = 0; i < 9; i++) cloud(g, rnd() * w, 30 + rnd() * 70, 0.6 + rnd() * 0.7, '#ffffffd8');
        for (let x = -20; x < w; x += 70 + rnd() * 60) {
          const bh = 120 + rnd() * 120;
          const bw = 60 + rnd() * 80;
          g.fillStyle = rnd() < 0.5 ? '#d7a9a0' : '#c49aa6';
          g.fillRect(x, FLOOR - 120 - bh, bw, bh + 120);
          g.fillStyle = '#ffffff55';
          for (let wy = FLOOR - 110 - bh; wy < FLOOR - 140; wy += 26) for (let wx = x + 10; wx < x + bw - 14; wx += 22) g.fillRect(wx, wy, 10, 14);
        }
      },
      near(g, w) {
        const rnd = seeded(7);
        const top = 96;
        // fachada
        const wall = g.createLinearGradient(0, top, 0, FLOOR);
        wall.addColorStop(0, '#f2c493'); wall.addColorStop(1, '#d9925f');
        g.fillStyle = wall; g.fillRect(0, top, w, FLOOR - top);
        g.fillStyle = '#ffffff14';
        for (let y = top + 70; y < FLOOR; y += 18) for (let x = (y / 18 % 2) * 30; x < w; x += 60) g.fillRect(x, y, 56, 2);
        g.fillStyle = '#7f2f2a'; g.fillRect(0, top - 12, w, 22);
        g.fillStyle = '#5a1f26'; g.fillRect(0, top + 8, w, 5);
        // toldo listrado com babado
        for (let x = 0; x < w; x += 44) {
          g.fillStyle = (x / 44) % 2 ? '#fff3dc' : '#e5485a';
          g.fillRect(x, top + 13, 44, 38);
          g.beginPath(); g.arc(x + 22, top + 51, 22, 0, Math.PI); g.fill();
        }
        g.fillStyle = '#0002'; g.fillRect(0, top + 73, w, 8);
        // vitrines
        const windows = [120, 470, 1030, 1340];
        for (const wx of windows) {
          g.fillStyle = '#5b2a1f'; g.fillRect(wx - 6, 196, 232, 168);
          const glass = g.createLinearGradient(wx, 200, wx + 220, 360);
          glass.addColorStop(0, '#d9f3ff'); glass.addColorStop(1, '#8fc5e8');
          g.fillStyle = glass; g.fillRect(wx, 202, 220, 156);
          g.fillStyle = '#8b5a3c'; g.fillRect(wx, 290, 220, 6); g.fillRect(wx, 344, 220, 6);
          for (let i = 0; i < 4; i++) {
            const cx = wx + 30 + i * 52;
            g.fillStyle = ['#f6d7a7', '#7a3f22', '#ffb3c9', '#fff1dc'][i];
            g.fillRect(cx - 18, 266, 36, 24);
            g.fillStyle = '#ffffff'; g.fillRect(cx - 18, 262, 36, 6);
            g.fillStyle = '#e63946'; g.beginPath(); g.arc(cx, 259, 4, 0, Math.PI * 2); g.fill();
            g.fillStyle = ['#e9c58a', '#c97945'][i % 2]; g.fillRect(cx - 14, 326, 28, 18);
          }
          g.fillStyle = '#ffffff66';
          g.beginPath(); g.moveTo(wx + 20, 202); g.lineTo(wx + 60, 202); g.lineTo(wx + 10, 330); g.lineTo(wx, 330); g.lineTo(wx, 250); g.fill();
        }
        // porta
        const door = w / 2 - 70;
        g.fillStyle = '#4a2418'; g.fillRect(door - 10, 170, 160, FLOOR - 170);
        g.fillStyle = '#7b3f26'; g.fillRect(door, 180, 140, FLOOR - 180);
        g.fillStyle = '#bfe6ff'; g.fillRect(door + 14, 196, 112, 120);
        g.fillStyle = '#e5485a'; roundRect(g, door + 30, 236, 80, 30, 6); g.fill();
        gtext(g, 'ABERTO', door + 70, 258, 17, '#fff', 'center', '#7a1020', 3);
        g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(door + 122, 350, 6, 0, Math.PI * 2); g.fill();
        // placas
        g.fillStyle = '#ffe1ec'; roundRect(g, 380, 116, 250, 70, 24); g.fill();
        g.strokeStyle = '#d6336c'; g.lineWidth = 4; g.stroke();
        gtext(g, 'Bolos da Juju', 505, 152, 30, '#c2185b', 'center', '#fff', 5, '"Brush Script MT", "Segoe Script", cursive');
        gtext(g, 'feito com amor ♥', 505, 175, 14, '#8a1846', 'center', null);
        g.fillStyle = '#8b5a3c'; roundRect(g, 1000, 118, 240, 64, 10); g.fill();
        g.strokeStyle = '#4a2a18'; g.lineWidth = 4; g.stroke();
        gtext(g, 'Família é tudo! ♥', 1120, 160, 26, '#ffe9c4', 'center', '#3b1f12', 4, '"Brush Script MT", "Segoe Script", cursive');
        // mesa com toalha xadrez
        const tx = 230;
        const ty = 336;
        g.fillStyle = '#6b3a24'; g.fillRect(tx + 12, ty + 30, 10, FLOOR - ty - 30); g.fillRect(tx + 238, ty + 30, 10, FLOOR - ty - 30);
        for (let i = 0; i < 13; i++) for (let j = 0; j < 3; j++) {
          g.fillStyle = (i + j) % 2 ? '#ffffff' : '#f06292';
          g.fillRect(tx + i * 20, ty + j * 14, 20, 14);
        }
        for (let i = 0; i < 5; i++) {
          g.fillStyle = '#ffffffcc'; g.fillRect(tx + 18 + i * 46, ty - 26, 36, 26);
          g.fillStyle = '#c98b5a'; g.fillRect(tx + 21 + i * 46, ty - 16, 30, 14);
          g.fillStyle = '#fff5e6'; g.fillRect(tx + 21 + i * 46, ty - 21, 30, 5);
        }
        flowerPot(g, 70, rnd);
        flowerPot(g, w - 80, rnd);
        flowerPot(g, 940, rnd);
        g.fillStyle = '#6b2f22'; g.fillRect(0, FLOOR - 16, w, 16);
        perspectiveFloor(g, w, ['#d48a5a', '#9c5534'], '#7d3f2655');
      }
    },
    quintal: {
      far(g, w) {
        const rnd = seeded(23);
        const sky = g.createLinearGradient(0, 0, 0, FLOOR);
        sky.addColorStop(0, '#2b1b55'); sky.addColorStop(0.45, '#b4437a'); sky.addColorStop(0.8, '#ff9a5a'); sky.addColorStop(1, '#ffd08a');
        g.fillStyle = sky; g.fillRect(0, 0, w, H);
        const sun = g.createRadialGradient(w * 0.55, 300, 10, w * 0.55, 300, 200);
        sun.addColorStop(0, '#fff4c2'); sun.addColorStop(0.3, '#ffd36ecc'); sun.addColorStop(1, '#ff9a5a00');
        g.fillStyle = sun; g.fillRect(0, 0, w, H);
        g.fillStyle = '#ffe9a8'; g.beginPath(); g.arc(w * 0.55, 300, 62, 0, Math.PI * 2); g.fill();
        for (let i = 0; i < 6; i++) cloud(g, rnd() * w, 60 + rnd() * 90, 0.5 + rnd() * 0.6, '#ffb08a99');
        g.fillStyle = '#6b2f5a';
        g.beginPath(); g.moveTo(0, FLOOR);
        for (let x = 0; x <= w; x += 40) g.lineTo(x, 290 + Math.sin(x / 140) * 28 + rnd() * 10);
        g.lineTo(w, FLOOR); g.fill();
        g.fillStyle = '#3d1d45';
        for (let x = 20; x < w; x += 90 + rnd() * 80) {
          const s = 0.6 + rnd() * 0.6;
          g.fillRect(x - 4 * s, 300 - 60 * s, 8 * s, 80 * s);
          g.beginPath(); g.arc(x, 300 - 70 * s, 34 * s, 0, Math.PI * 2); g.fill();
        }
      },
      near(g, w) {
        const rnd = seeded(5);
        // casa (esquerda)
        g.fillStyle = '#f4dcb6'; g.fillRect(0, 160, 520, FLOOR - 160);
        g.fillStyle = '#e0c094'; for (let y = 175; y < FLOOR; y += 22) g.fillRect(0, y, 520, 2);
        g.fillStyle = '#a63d2a';
        g.beginPath(); g.moveTo(-20, 170); g.lineTo(260, 70); g.lineTo(560, 170); g.fill();
        g.fillStyle = '#c4553a';
        for (let r = 0; r < 4; r++) for (let x = -20 + r * 18; x < 560 - r * 18; x += 26) {
          const y = 166 - r * 22;
          if (y < 70 + Math.abs(x - 260) * 0.33) continue;
          g.beginPath(); g.arc(x, y, 12, Math.PI, 0); g.fill();
        }
        g.fillStyle = '#4b6fb5'; g.fillRect(80, 220, 54, 110); g.fillRect(226, 220, 54, 110);
        g.fillStyle = '#bfe6ff'; g.fillRect(134, 220, 92, 110);
        g.fillStyle = '#ffffff'; g.fillRect(178, 220, 4, 110); g.fillRect(134, 272, 92, 4);
        g.fillStyle = '#6b3a24'; g.fillRect(360, 230, 100, FLOOR - 230);
        g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(444, 340, 5, 0, Math.PI * 2); g.fill();
        // portão de ferro
        g.fillStyle = '#b4573d'; g.fillRect(560, 236, 40, FLOOR - 236); g.fillRect(1010, 236, 40, FLOOR - 236);
        g.fillStyle = '#2b2233';
        g.fillRect(600, 262, 410, 6); g.fillRect(600, 400, 410, 6);
        for (let x = 610; x < 1010; x += 22) {
          g.fillRect(x, 248, 5, FLOOR - 248);
          g.beginPath(); g.moveTo(x - 4, 252); g.lineTo(x + 2.5, 236); g.lineTo(x + 9, 252); g.fill();
        }
        // muro de tijolos (direita)
        g.fillStyle = '#b4573d'; g.fillRect(1050, 250, w - 1050, FLOOR - 250);
        for (let y = 250, row = 0; y < FLOOR; y += 20, row++) {
          for (let x = 1050 + (row % 2) * 22; x < w; x += 44) {
            g.fillStyle = rnd() < 0.5 ? '#c4643f' : '#a94f35';
            g.fillRect(x + 1, y + 1, 41, 17);
          }
        }
        g.fillStyle = '#7d3a28'; g.fillRect(1050, 242, w - 1050, 12);
        // mangueira
        g.fillStyle = '#5a3a22'; g.fillRect(1290, 150, 34, FLOOR - 150);
        bush(g, 1306, 170, 2.6, rnd);
        bush(g, 1250, 190, 2, rnd);
        bush(g, 1370, 190, 2, rnd);
        g.fillStyle = '#ffb703';
        for (let i = 0; i < 8; i++) { g.beginPath(); g.ellipse(1220 + rnd() * 180, 130 + rnd() * 90, 6, 9, 0, 0, Math.PI * 2); g.fill(); }
        // varal
        g.strokeStyle = '#ddd'; g.lineWidth = 2;
        g.fillStyle = '#6b4a2c'; g.fillRect(620, 150, 8, 90); g.fillRect(980, 150, 8, 90);
        g.beginPath(); g.moveTo(624, 156); g.quadraticCurveTo(804, 186, 984, 156); g.stroke();
        const clothes = ['#ff4d6d', '#3ec1d3', '#ffd23f', '#7bd389', '#ffffff', '#f72585'];
        for (let i = 0; i < 6; i++) {
          const x = 660 + i * 54;
          const y = 160 + Math.sin((i + 0.5) / 6 * Math.PI) * 26;
          g.fillStyle = clothes[i];
          if (i % 2) g.fillRect(x, y, 34, 40); else { g.fillRect(x, y, 38, 18); g.fillRect(x + 4, y + 18, 12, 26); g.fillRect(x + 22, y + 18, 12, 26); }
        }
        bush(g, 40, FLOOR - 4, 1.2, rnd);
        bush(g, 540, FLOOR - 4, 1, rnd);
        bush(g, 1080, FLOOR - 4, 1.1, rnd);
        bush(g, w - 40, FLOOR - 4, 1.3, rnd);
        flowerPot(g, 300, rnd);
        // calçamento
        g.fillStyle = '#c97b4f'; g.fillRect(0, FLOOR, w, H - FLOOR);
        for (let y = FLOOR, row = 0; y < H; y += 14 + row * 3, row++) {
          for (let x = (row % 2) * 24 - 24; x < w; x += 48) {
            g.fillStyle = rnd() < 0.5 ? '#d68a5a' : '#b86c43';
            g.fillRect(x + 1, y + 1, 46, 12 + row * 3);
          }
        }
        g.fillStyle = '#0003'; g.fillRect(0, FLOOR, w, 6);
      }
    },
    festa: {
      far(g, w) {
        const rnd = seeded(31);
        const sky = g.createLinearGradient(0, 0, 0, FLOOR);
        sky.addColorStop(0, '#070726'); sky.addColorStop(0.6, '#24164f'); sky.addColorStop(1, '#5a2a5e');
        g.fillStyle = sky; g.fillRect(0, 0, w, H);
        for (let i = 0; i < 180; i++) {
          g.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.7})`;
          const s = rnd() < 0.1 ? 2.5 : 1.4;
          g.fillRect(rnd() * w, rnd() * 300, s, s);
        }
        g.fillStyle = '#fff6d5'; g.beginPath(); g.arc(w * 0.78, 90, 34, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#24164f'; g.beginPath(); g.arc(w * 0.78 + 14, 82, 30, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#1a1035';
        g.beginPath(); g.moveTo(0, FLOOR);
        for (let x = 0; x <= w; x += 30) g.lineTo(x, 320 + Math.sin(x / 180) * 30);
        g.lineTo(w, FLOOR); g.fill();
        // igrejinha no morro
        const cx = w * 0.3;
        g.fillStyle = '#2a1d4a'; g.fillRect(cx - 40, 240, 80, 80);
        g.beginPath(); g.moveTo(cx - 48, 244); g.lineTo(cx, 206); g.lineTo(cx + 48, 244); g.fill();
        g.fillRect(cx - 12, 170, 24, 50);
        g.fillRect(cx - 2, 150, 4, 22); g.fillRect(cx - 9, 158, 18, 4);
        g.fillStyle = '#ffd36e'; g.fillRect(cx - 8, 270, 16, 22); g.fillRect(cx - 4, 184, 8, 12);
      },
      near(g, w) {
        const rnd = seeded(13);
        // chão de terra
        const ground = g.createLinearGradient(0, 330, 0, H);
        ground.addColorStop(0, '#5a3a28'); ground.addColorStop(1, '#3a2418');
        g.fillStyle = ground; g.fillRect(0, 360, w, H - 360);
        // barracas
        const stalls = [[130, 'PIPOCA', '#e5485a'], [520, 'PAMONHA', '#2a9d8f'], [1030, 'CANJICA', '#f4a261'], [1390, 'CORREIO ELEGANTE', '#9b5de5']];
        for (const [x, label, color] of stalls) {
          g.fillStyle = '#6b4a2c'; g.fillRect(x - 100, 220, 10, 160); g.fillRect(x + 90, 220, 10, 160);
          for (let i = 0; i < 10; i++) {
            g.fillStyle = i % 2 ? '#fff3dc' : color;
            g.beginPath(); g.moveTo(x - 110 + i * 22, 228); g.lineTo(x - 110 + i * 22 + 22, 228); g.lineTo(x - 110 + i * 22 + 22, 200); g.lineTo(x - 110 + i * 22, 196); g.fill();
          }
          g.fillStyle = '#8b5a3c'; g.fillRect(x - 104, 300, 208, 80);
          g.fillStyle = '#a06a45'; g.fillRect(x - 104, 300, 208, 10);
          g.fillStyle = '#fff3dc'; roundRect(g, x - 80, 240, 160, 34, 6); g.fill();
          gtext(g, label, x, 264, label.length > 10 ? 15 : 22, color, 'center', '#2a1020', 3);
        }
        // fogueira (toras; as chamas são animadas)
        const fx = 800;
        g.fillStyle = '#4a2a18';
        g.save(); g.translate(fx, 372);
        for (const r of [-0.5, 0.5, -0.15, 0.15]) { g.save(); g.rotate(r); g.fillRect(-60, -8, 120, 16); g.restore(); }
        g.restore();
        // bandeirinhas
        const colors = ['#ff4d6d', '#ffd23f', '#3ec1d3', '#7bd389', '#ffffff', '#f77f00', '#9b5de5'];
        for (let row = 0; row < 3; row++) {
          const y0 = 40 + row * 46;
          g.strokeStyle = '#ddd'; g.lineWidth = 1.5;
          g.beginPath();
          for (let x = 0; x <= w; x += 4) {
            const y = y0 + Math.sin((x / 400) * Math.PI) ** 2 * 40;
            if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
          }
          g.stroke();
          for (let x = 10 + row * 14, i = 0; x < w; x += 28, i++) {
            const y = y0 + Math.sin((x / 400) * Math.PI) ** 2 * 40;
            g.fillStyle = colors[(i + row * 2) % colors.length];
            g.beginPath(); g.moveTo(x, y); g.lineTo(x + 20, y); g.lineTo(x + 20, y + 22); g.lineTo(x + 10, y + 15); g.lineTo(x, y + 22); g.fill();
          }
        }
        // lampiões
        for (let x = 330; x < w; x += 420) {
          g.fillStyle = '#4a3a2a'; g.fillRect(x - 3, 180, 6, 200);
          const glow = g.createRadialGradient(x, 176, 2, x, 176, 60);
          glow.addColorStop(0, '#ffe08acc'); glow.addColorStop(1, '#ffe08a00');
          g.fillStyle = glow; g.fillRect(x - 60, 116, 120, 120);
          g.fillStyle = '#ffd36e'; g.fillRect(x - 8, 164, 16, 22);
        }
        for (let i = 0; i < 260; i++) {
          g.fillStyle = rnd() < 0.5 ? '#c9a24a66' : '#00000033';
          g.fillRect(rnd() * w, FLOOR + rnd() * (H - FLOOR), 6 + rnd() * 6, 2);
        }
        g.fillStyle = '#00000040'; g.fillRect(0, FLOOR, w, 4);
      },
      animate(g, cam, t) {
        // chamas da fogueira (dinâmicas)
        const x = 800 - cam;
        if (x < -160 || x > worldW + 160) return;
        const glow = g.createRadialGradient(x, 330, 10, x, 330, 220);
        glow.addColorStop(0, `rgba(255,170,60,${0.32 + Math.sin(t * 9) * 0.05})`);
        glow.addColorStop(1, 'rgba(255,120,40,0)');
        g.fillStyle = glow;
        g.fillRect(x - 220, 110, 440, 340);
        // línguas de fogo arredondadas, cada uma oscilando em ritmo próprio
        const flames = [['rgba(255,84,0,0.9)', 54, 1], ['rgba(255,158,0,0.92)', 40, 0.78], ['rgba(255,230,120,0.95)', 24, 0.55]];
        for (const [color, width, hmul] of flames) {
          g.fillStyle = color;
          for (let i = 0; i < 3; i++) {
            const cx = x + (i - 1) * width * 0.55;
            const h = (70 + Math.sin(t * 10 + i * 2.1) * 14 + (i === 1 ? 22 : 0)) * hmul;
            const sway = Math.sin(t * 7 + i) * 8 * hmul;
            const half = width * 0.55;
            g.beginPath();
            g.moveTo(cx - half, 372);
            g.quadraticCurveTo(cx - half * 0.9, 372 - h * 0.55, cx + sway, 372 - h);
            g.quadraticCurveTo(cx + half * 0.9, 372 - h * 0.55, cx + half, 372);
            g.closePath();
            g.fill();
          }
        }
      }
    }
  };

  function palm(g, x, baseY, h, lean) {
    g.strokeStyle = '#7a4a26';
    g.lineWidth = 16;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x, baseY);
    g.quadraticCurveTo(x + lean * 0.4, baseY - h * 0.6, x + lean, baseY - h);
    g.stroke();
    g.strokeStyle = '#5e3818';
    g.lineWidth = 2;
    for (let i = 1; i < 10; i++) {
      const t = i / 10;
      const px = x + lean * t * t;
      const py = baseY - h * t;
      g.beginPath(); g.moveTo(px - 8, py); g.lineTo(px + 8, py + 3); g.stroke();
    }
    const tx = x + lean;
    const ty = baseY - h;
    g.fillStyle = '#2f9e44';
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI + (i / 6) * Math.PI + 0.2;
      g.save();
      g.translate(tx, ty);
      g.rotate(a);
      g.beginPath();
      g.ellipse(48, 0, 52, 11, 0.25, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    g.fillStyle = '#7a5230';
    for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(tx - 8 + i * 8, ty + 8, 7, 0, Math.PI * 2); g.fill(); }
  }

  Object.assign(STAGES, {
    bar: {
      far(g, w) {
        const rnd = seeded(41);
        const sky = g.createLinearGradient(0, 0, 0, FLOOR);
        sky.addColorStop(0, '#0d0624'); sky.addColorStop(1, '#3b1250');
        g.fillStyle = sky; g.fillRect(0, 0, w, H);
        for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(255,255,255,${0.2 + rnd() * 0.6})`; g.fillRect(rnd() * w, rnd() * 200, 1.5, 1.5); }
        for (let x = 0; x < w; x += 60 + rnd() * 70) {
          const bh = 140 + rnd() * 160;
          g.fillStyle = '#1a0d33';
          g.fillRect(x, FLOOR - 90 - bh, 70 + rnd() * 50, bh + 90);
          for (let wy = FLOOR - 80 - bh; wy < FLOOR - 100; wy += 24) {
            for (let wx = x + 8; wx < x + 60; wx += 18) {
              if (rnd() < 0.45) { g.fillStyle = rnd() < 0.5 ? '#ffd36e' : '#ff7ad9'; g.fillRect(wx, wy, 8, 12); }
            }
          }
        }
      },
      near(g, w) {
        const rnd = seeded(43);
        // fachada de tijolos do bar
        g.fillStyle = '#3a1630';
        g.fillRect(0, 120, w, FLOOR - 120);
        for (let y = 120, row = 0; y < FLOOR; y += 18, row++) {
          for (let x = (row % 2) * 20; x < w; x += 40) {
            g.fillStyle = rnd() < 0.5 ? '#4b1d3d' : '#431935';
            g.fillRect(x + 1, y + 1, 38, 16);
          }
        }
        // vitrines iluminadas
        for (const wx of [90, 420, 1060, 1360]) {
          g.fillStyle = '#1a0a1f'; g.fillRect(wx - 6, 210, 196, 150);
          const glow = g.createLinearGradient(wx, 216, wx, 354);
          glow.addColorStop(0, '#ff5fb0'); glow.addColorStop(1, '#6a1b9a');
          g.fillStyle = glow; g.fillRect(wx, 216, 184, 138);
          g.fillStyle = '#00000055';
          for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(wx + 40 + i * 52, 330, 16, Math.PI, 0); g.fill(); g.fillRect(wx + 24 + i * 52, 330, 32, 24); }
        }
        // porta e letreiro neon "Bar da Simone"
        const door = w / 2 - 80;
        g.fillStyle = '#12060f'; g.fillRect(door, 230, 160, FLOOR - 230);
        g.fillStyle = '#ff3d7f55'; g.fillRect(door + 8, 238, 144, FLOOR - 246);
        g.fillStyle = '#000000aa';
        g.beginPath(); g.ellipse(door + 55, 320, 16, 20, 0, 0, Math.PI * 2); g.fill(); g.fillRect(door + 38, 335, 34, FLOOR - 340);
        g.beginPath(); g.ellipse(door + 105, 318, 16, 20, 0, 0, Math.PI * 2); g.fill(); g.fillRect(door + 88, 333, 34, FLOOR - 338);
        g.save();
        g.shadowColor = '#ff4fd8';
        g.shadowBlur = 24;
        g.strokeStyle = '#ff7ae6';
        g.lineWidth = 4;
        roundRect(g, w / 2 - 170, 132, 340, 84, 16); g.stroke();
        gtext(g, 'Bar da Simone', w / 2, 188, 44, '#ffd6f7', 'center', '#ff2fb4', 3, '"Brush Script MT", "Segoe Script", cursive');
        g.restore();
        // mesinhas na calçada
        for (const tx of [300, 1250]) {
          g.fillStyle = '#c0c0c0'; g.fillRect(tx - 4, 380, 8, FLOOR - 380);
          g.fillStyle = '#e0e0e0'; g.beginPath(); g.ellipse(tx, 380, 40, 9, 0, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#1f8a3a'; g.fillRect(tx - 18, 352, 9, 26); g.fillRect(tx + 8, 356, 9, 22);
          g.fillStyle = '#d62839'; g.fillRect(tx - 18, 362, 9, 6); g.fillRect(tx + 8, 364, 9, 6);
        }
        // calçada molhada refletindo o neon
        const floor = g.createLinearGradient(0, FLOOR, 0, H);
        floor.addColorStop(0, '#2a1033'); floor.addColorStop(1, '#14061c');
        g.fillStyle = floor; g.fillRect(0, FLOOR, w, H - FLOOR);
        g.fillStyle = '#ff4fd822';
        g.fillRect(w / 2 - 170, FLOOR + 8, 340, 18);
        g.strokeStyle = '#00000055'; g.lineWidth = 2;
        for (let x = 0; x < w; x += 80) { g.beginPath(); g.moveTo(x, FLOOR); g.lineTo(x - 40, H); g.stroke(); }
      },
      animate(g, cam, t) {
        // neon piscando de vez em quando
        if (Math.sin(t * 3.1) > 0.97) {
          g.fillStyle = 'rgba(20,0,20,0.25)';
          g.fillRect(STAGE_W / 2 - 170 - cam, 132, 340, 84);
        }
      }
    },
    praia: {
      far(g, w) {
        const rnd = seeded(51);
        const sky = g.createLinearGradient(0, 0, 0, 330);
        sky.addColorStop(0, '#5b4bd1'); sky.addColorStop(0.5, '#ff7eb6'); sky.addColorStop(1, '#ffd08a');
        g.fillStyle = sky; g.fillRect(0, 0, w, 330);
        g.fillStyle = '#fff1b8'; g.beginPath(); g.arc(w * 0.6, 300, 58, 0, Math.PI * 2); g.fill();
        for (let i = 0; i < 6; i++) cloud(g, rnd() * w, 50 + rnd() * 110, 0.5 + rnd() * 0.6, '#ffc4e0aa');
        const sea = g.createLinearGradient(0, 300, 0, FLOOR);
        sea.addColorStop(0, '#3aa6d8'); sea.addColorStop(1, '#1c6fa8');
        g.fillStyle = sea; g.fillRect(0, 300, w, FLOOR - 300);
        g.fillStyle = '#ffe9a855';
        for (let i = 0; i < 40; i++) g.fillRect(w * 0.6 - 60 + rnd() * 120, 305 + rnd() * 100, 20 + rnd() * 30, 2);
      },
      near(g, w) {
        const rnd = seeded(53);
        // espuma das ondas e areia
        g.fillStyle = '#ffffffcc';
        for (let x = 0; x < w; x += 30) { g.beginPath(); g.arc(x, 388 + Math.sin(x / 50) * 4, 16, Math.PI, 0); g.fill(); }
        const sand = g.createLinearGradient(0, 392, 0, H);
        sand.addColorStop(0, '#f6d48f'); sand.addColorStop(1, '#e0aa5c');
        g.fillStyle = sand; g.fillRect(0, 392, w, H - 392);
        g.fillStyle = '#c9944f66';
        for (let i = 0; i < 300; i++) g.fillRect(rnd() * w, 400 + rnd() * (H - 400), 3, 2);
        palm(g, 70, 430, 300, 60);
        palm(g, 520, 420, 250, -50);
        palm(g, 1160, 425, 280, 70);
        palm(g, 1540, 430, 310, -60);
        // guarda-sol e cadeira de praia
        const ux = 330;
        g.strokeStyle = '#f1f1f1'; g.lineWidth = 5;
        g.beginPath(); g.moveTo(ux, 300); g.lineTo(ux + 10, 430); g.stroke();
        for (let i = 0; i < 6; i++) {
          g.fillStyle = i % 2 ? '#ffffff' : '#e5383b';
          g.beginPath(); g.moveTo(ux, 290);
          g.arc(ux, 330, 90, Math.PI + (i / 6) * Math.PI, Math.PI + ((i + 1) / 6) * Math.PI);
          g.closePath(); g.fill();
        }
        g.strokeStyle = '#8b5a3c'; g.lineWidth = 5;
        g.beginPath(); g.moveTo(ux - 40, 430); g.lineTo(ux + 10, 380); g.lineTo(ux + 60, 430); g.stroke();
        g.fillStyle = '#3ec1d3'; g.fillRect(ux - 20, 380, 60, 8);
        // placa "Partiu Praia!"
        g.fillStyle = '#8b5a3c'; g.fillRect(1395, 330, 10, 100);
        g.fillStyle = '#c98b5a'; roundRect(g, 1320, 300, 160, 56, 8); g.fill();
        gtext(g, 'Partiu Praia!', 1400, 337, 24, '#4a2a18', 'center', null, 0, '"Brush Script MT", "Segoe Script", cursive');
        // árvore de Natal de praia (Natal Praia!)
        const tx = 860;
        for (let i = 0; i < 4; i++) {
          g.fillStyle = '#2f9e44';
          g.beginPath(); g.moveTo(tx, 250 + i * 35); g.lineTo(tx - 30 - i * 14, 300 + i * 35); g.lineTo(tx + 30 + i * 14, 300 + i * 35); g.fill();
        }
        g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(tx, 248, 8, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#7a4a26'; g.fillRect(tx - 7, 400, 14, 30);
        for (let i = 0; i < 10; i++) { g.fillStyle = ['#e63946', '#62efff', '#ff6fd8'][i % 3]; g.beginPath(); g.arc(tx - 40 + rnd() * 80, 280 + rnd() * 110, 4, 0, Math.PI * 2); g.fill(); }
      }
    }
  });
  // Cenários com arte pintada (assets/stages). ground = linha do chão na imagem (px originais),
  // que fica alinhada com os pés dos lutadores; scale = ampliação da imagem no mundo.
  const STAGE_ART = {
    bar: { src: 'assets/stages/bar.webp', ground: 440, scale: 0.97 },
    praia: { src: 'assets/stages/praia.webp', ground: 380, scale: 1.05 }
  };
  for (const [name, art] of Object.entries(STAGE_ART)) {
    art.img = loadImage(art.src);
    art.img.addEventListener('load', () => {
      if (stageCache && stageCache.name === name) { stageCache = null; ensureStage(name); }
      stageThumbs.delete(name);
      if (app === 'stage') refreshStageScreen();
    });
    const procedural = STAGES[name];
    const drawArt = (g, w) => {
      const { img, ground, scale } = art;
      const dw = img.naturalWidth * scale;
      const dh = img.naturalHeight * scale;
      const dx = (w - dw) / 2;
      const dy = FLOOR - ground * scale;
      if (dy > 0) { // completa o céu acima da imagem com a cor do topo
        g.drawImage(img, 0, 0, img.naturalWidth, 2, 0, 0, w, dy + 2);
      }
      g.drawImage(img, dx, dy, dw, dh);
      if (dy + dh < H) { // completa o chão abaixo com a cor média da base da imagem, escurecendo
        if (!art.floor) {
          try {
            const probe = document.createElement('canvas');
            probe.width = 64; probe.height = 4;
            const pg = probe.getContext('2d');
            pg.drawImage(img, 0, img.naturalHeight - 12, img.naturalWidth, 12, 0, 0, 64, 4);
            const px = pg.getImageData(0, 0, 64, 4).data;
            let r = 0, gg = 0, b = 0;
            for (let i = 0; i < px.length; i += 4) { r += px[i]; gg += px[i + 1]; b += px[i + 2]; }
            const n = px.length / 4;
            art.floor = [r / n, gg / n, b / n].map(Math.round);
          } catch { art.floor = [90, 80, 70]; }
        }
        const [r, gg, b] = art.floor;
        const grad = g.createLinearGradient(0, dy + dh, 0, H);
        grad.addColorStop(0, `rgb(${r},${gg},${b})`);
        grad.addColorStop(1, `rgb(${r * 0.55 | 0},${gg * 0.55 | 0},${b * 0.55 | 0})`);
        g.fillStyle = grad;
        g.fillRect(0, dy + dh - 1, w, H - dy - dh + 1);
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.fillRect(0, dy + dh - 1, w, 3);
      }
    };
    STAGES[name] = {
      far: (g, w) => (ready(art.img) ? drawArt(g, w) : procedural.far(g, w)),
      near: (g, w) => (ready(art.img) ? drawArt(g, w) : procedural.near(g, w)),
      get animate() { return ready(art.img) ? null : procedural.animate; }
    };
  }

  // Miniaturas dos cenários (tela de escolha de cenário)
  const stageThumbs = new Map();
  function stageThumb(name) {
    if (stageThumbs.has(name)) return stageThumbs.get(name);
    const def = STAGES[name] || STAGES.padaria;
    const k = 0.32;
    const view = 900; // pedaço central do cenário
    const [c, g] = layer(view, k);
    g.save();
    g.translate(-(STAGE_W - view) / 2, 0);
    def.far(g, FAR_W);
    def.near(g, STAGE_W);
    g.restore();
    stageThumbs.set(name, c);
    return c;
  }

  function ensureStage(name) {
    const k = clamp(renderScale * ZOOM, 1, 2.4); // resolução do cenário acompanha o zoom
    if (stageCache && stageCache.name === name && stageCache.k === k) return stageCache;
    const def = STAGES[name] || STAGES.padaria;
    const [far, fg] = layer(FAR_W, k);
    def.far(fg, FAR_W);
    const [near, ng] = layer(STAGE_W, k);
    def.near(ng, STAGE_W);
    stageCache = { name, k, far, near, animate: def.animate };
    return stageCache;
  }

  function drawStage(cam) {
    const s = stageCache;
    if (!s) return;
    const k = s.k;
    const farX = cam * 0.5;
    const w = Math.min(worldW, s.far.width / k - farX);
    ctx.drawImage(s.far, farX * k, 0, w * k, H * k, 0, 0, w, H);
    ctx.drawImage(s.near, cam * k, 0, worldW * k, H * k, 0, 0, worldW, H);
    if (s.animate) s.animate(ctx, cam, clock);
  }

  // ======================================================================
  // Desenho dos lutadores
  // ======================================================================
  function cycle(frames, fps, time) {
    if (!Array.isArray(frames) || !frames.length) return null;
    const v = Number.isFinite(time) ? time : 0;
    return frames[Math.floor(v * fps) % frames.length];
  }

  function attackFrame(frames, f) {
    if (!Array.isArray(frames) || !frames.length) return null;
    const m = f.move;
    if (!m) return frames[0];
    if (m.frame !== undefined) return frames[Math.min(m.frame, frames.length - 1)];
    const n = frames.length;
    if (n === 1) return frames[0];
    if (f.t < m.startup) return frames[Math.min(n - 2, Math.floor((f.t / m.startup) * (n - 1)))];
    if (f.t < m.startup + m.active + m.recovery * 0.6) return frames[n - 1];
    return frames[0];
  }

  const pickFrame = (frames, i) => {
    if (!Array.isArray(frames) || !frames.length) return null;
    return frames[clamp(Math.floor(i), 0, frames.length - 1)];
  };

  // Deitado no chão para quem não tem sprite de queda: gira a pose em pé.
  function lying(lean, S, amount) {
    lean.frame = S.idle[0];
    lean.rot = -1.5 * amount;
    lean.dy = -22 * amount;
  }

  function frameFor(f) {
    const S = SPR[f.id];
    if (!S) return null;
    const lean = { frame: null, rot: 0, dx: 0, dy: 0, sx: 1, sy: 1 };
    const fallback = Array.isArray(S.idle) && S.idle.length ? S.idle : [];
    if (!fallback.length) return null;
    const t = f.t;

    if (f.state === 'transform') {
      const total = transformTime(f);
      const frames = Array.isArray(S[f.nextForm]) && S[f.nextForm].length ? S[f.nextForm] : fallback;
      switch (f.nextForm) {
        case 'gordao':
          if (t < 0.85) {
            // comendo: pose parada com "mastigada" (leve achatamento a cada mordida)
            lean.frame = S.idle[0];
            lean.sy = 1 - Math.sin(((t % 0.14) / 0.14) * Math.PI) * 0.025;
          } else {
            lean.frame = pickFrame(frames, Math.floor(((t - 0.85) / (total - 0.85)) * frames.length));
          }
          break;
        case 'crente':
          // batismo: ajoelhado sob a água, depois levanta erguendo os braços
          lean.frame = pickFrame(frames, t < 0.45 ? 0 : t < 0.95 ? 1 : t < 1.25 ? 2 : 3);
          break;
        case 'hulk':
          // bebe a Heineken e cresce
          if (t < 0.95) lean.frame = pickFrame(S.drink, t < 0.3 ? 0 : t < 0.7 ? 1 : 2);
          else {
            lean.frame = pickFrame(S.hulk, 0);
            const grow = clamp((t - 0.95) / (total - 0.95), 0, 1);
            lean.sx = lean.sy = 0.82 + grow * 0.18;
          }
          break;
        case 'praia':
          lean.frame = cycle(S.dance || fallback, 8, t);
          break;
        case 'brava':
          lean.frame = pickFrame(S.guard || fallback, 1);
          lean.dx = Math.sin(t * 70) * 3; // tremendo de raiva
          break;
        default:
          lean.frame = pickFrame(frames, Math.floor((t / total) * frames.length));
      }
      return lean;
    }

    const special = ['launch', 'down', 'ko', 'getup', 'win'].includes(f.state);

    // Formas "grandes": Gordão (Carlos) e Monstrão (Pedro)
    const big = f.form === 'gordao' && S.gordao ? { windup: S.gordao[2], pose: S.gordao[3], hurt: S.gordao[1] }
      : f.form === 'hulk' && S.hulk ? { windup: S.hulk[0], pose: S.hulk[0], hurt: S.hulk[0] } : null;
    if (big && !special) {
      if (f.state === 'attack') {
        const active = f.move && t >= f.move.startup;
        lean.frame = active ? big.pose : big.windup;
        lean.dx = active ? 18 : -6;
        lean.sx = active ? 1.06 : 0.96;
      } else if (f.state === 'hitstun' || f.state === 'blockstun') {
        lean.frame = big.hurt;
        lean.rot = -0.08;
      } else {
        lean.frame = big.pose;
        const bounce = f.state === 'walk' ? Math.abs(Math.sin(t * 10)) * 0.05 : Math.sin(clock * 5) * 0.015;
        lean.sy = 1 - bounce;
        lean.sx = 1 + bounce;
        if (f.state === 'crouch') { lean.sy = 0.8; lean.sx = 1.08; }
      }
      return lean;
    }

    // Natal Praia: Daniel de gorro de Papai Noel, dançando e chutando
    if (f.form === 'praia' && S.praia && ['idle', 'walk', 'attack'].includes(f.state)) {
      if (f.state === 'attack') lean.frame = pickFrame(S.praia, f.move && t >= f.move.startup ? 3 : 2);
      else if (f.state === 'walk') lean.frame = cycle(S.praia, 10, t);
      else { lean.frame = S.praia[1]; lean.dy = -Math.abs(Math.sin(clock * 6)) * 6; }
      return lean;
    }

    switch (f.state) {
      case 'idle': lean.frame = cycle(S.idle, 6, clock + f.slot * 0.4); break;
      case 'walk': {
        const backwards = Math.sign(f.vx) !== f.facing;
        const frames = backwards ? [...S.walk].reverse() : S.walk;
        lean.frame = cycle(frames, 9, t);
        break;
      }
      case 'crouch': lean.frame = S.crouch[t < 0.06 || S.crouch.length < 2 ? 0 : 1 + (Math.floor(clock * 3) % (S.crouch.length - 1))]; break;
      case 'guard': lean.frame = f.crouchGuard ? pickFrame(S.crouch, 1) : pickFrame(S.guard, t < 0.05 ? 0 : 1); break;
      case 'blockstun': lean.frame = f.crouchGuard ? pickFrame(S.crouch, 1) : pickFrame(S.guard, 1); lean.dx = -4; break;
      case 'jumpsquat': case 'landing': lean.frame = S.jump[0]; break;
      case 'air': {
        const n = S.jump.length;
        lean.frame = f.vy > 350 ? pickFrame(S.jump, 1) : f.vy > -250 ? pickFrame(S.jump, 2) : S.jump[n - 1];
        break;
      }
      case 'attack': lean.frame = attackFrame(S[f.move.anim] || fallback, f); break;
      case 'hitstun':
        if (f.holdPan > 0 && S.idle) { lean.frame = S.idle[0]; break; } // Juraci pegou a panela
        if (S.hurt) lean.frame = pickFrame(S.hurt, Math.floor(t * 12));
        else { lean.frame = pickFrame(S.guard, 1) || S.idle[0]; lean.rot = -0.16; lean.dx = -6; }
        break;
      case 'launch':
        if (S.knockdown) lean.frame = S.knockdown[f.vy > 0 ? 0 : 1];
        else lying(lean, S, 0.45);
        break;
      case 'down': case 'ko':
        if (S.knockdown) lean.frame = S.knockdown[S.knockdown.length - 1];
        else lying(lean, S, 1);
        break;
      case 'getup':
        if (S.getup) lean.frame = pickFrame(S.getup, Math.floor((t / 0.4) * S.getup.length));
        else if (S.knockdown) lean.frame = t < 0.2 ? S.knockdown[0] : S.crouch[0];
        else if (t < 0.2) lying(lean, S, 0.5);
        else lean.frame = S.crouch[0];
        break;
      case 'win':
        switch (f.id) {
          case 'carlos': lean.frame = S.crente[3]; lean.dy = -Math.abs(Math.sin(t * 5)) * 8; break;
          case 'juraci': lean.frame = S.special[2]; lean.dy = -Math.abs(Math.sin(t * 5)) * 8; break;
          case 'pedro': lean.frame = cycle(S.escape || S.walk, 6, t); break; // indo pro Bar da Simone
          case 'daniel': lean.frame = cycle(S.win || S.idle, 2.5, t); break;
          default: lean.frame = cycle(S.win || S.dance || S.idle, 2.5, t);
        }
        break;
      default: lean.frame = fallback[0];
    }
    if (!lean.frame) {
      lean.frame = cycle(fallback, 6, clock + f.slot * 0.4) || fallback[0];
    }
    return lean;
  }

  function drawShadow(f) {
    const x = f.x - camX;
    const s = clamp(1 - f.y / 300, 0.35, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath();
    ctx.ellipse(x, FLOOR + 2, (form(f).wide ? 64 : 44) * s, 9 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawAura(f, x, footY) {
    if (f.form === 'normal' && f.state !== 'transform') return;
    const key = f.state === 'transform' ? f.nextForm : f.form;
    const [r, g, b] = (FORMS[key] && FORMS[key].aura) || [255, 200, 80];
    const pulse = 0.75 + Math.sin(clock * 8) * 0.15;
    const glow = ctx.createRadialGradient(x, footY - 80, 10, x, footY - 80, 120);
    glow.addColorStop(0, `rgba(${r},${g},${b},${0.48 * pulse})`);
    glow.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(x - 130, footY - 210, 260, 230);
    if (f.form === 'crente') {
      const cy = footY - f.ch.height - 40 + Math.sin(clock * 3) * 4;
      ctx.fillStyle = '#fff3b0';
      ctx.shadowColor = '#ffe066';
      ctx.shadowBlur = 14;
      ctx.fillRect(x - 3, cy - 14, 6, 30);
      ctx.fillRect(x - 11, cy - 6, 22, 6);
      ctx.shadowBlur = 0;
    }
  }

  function drawFighter(f) {
    const pose = frameFor(f);
    const x = f.x - camX;
    const footY = FLOOR - f.y;
    if (f.state === 'transform' && f.nextForm === 'crente') drawBaptism(f, x, footY);
    drawAura(f, x, footY);
    if (!pose || !pose.frame || !ready(atlas)) {
      ctx.fillStyle = f.id === 'juraci' ? '#f21870' : '#181b27';
      ctx.fillRect(x - 28, footY - f.ch.height, 56, f.ch.height);
      return;
    }
    const [sx, sy, sw, sh, ax, ay] = pose.frame;
    const s = f.ch.scale;
    const img = f.alt && altAtlas ? altAtlas : atlas;
    ctx.save();
    ctx.translate(x + pose.dx * f.facing, footY + (pose.dy || 0));
    if (pose.rot) ctx.rotate(pose.rot * f.facing);
    ctx.scale(f.facing * s * pose.sx, s * pose.sy);
    const blink = (f.flash > 0 || (f.invuln > 0 && f.state === 'getup') || (f.state === 'idle' && f.invuln > 0))
      && Math.floor(clock * 30) % 2 === 0;
    if (blink) ctx.globalAlpha = 0.55;
    ctx.drawImage(img, sx, sy, sw, sh, -ax / AS, -ay / AS, sw / AS, sh / AS);
    ctx.restore();
    if (f.state === 'transform' && f.nextForm === 'gordao' && f.t < 0.85) drawFood(f, x, footY);
    drawHeldItems(f);
    if (f.state === 'guard' || f.state === 'blockstun') {
      const h = f.crouchGuard ? f.ch.crouchHeight : f.ch.height;
      ctx.strokeStyle = `rgba(143,227,255,${f.state === 'blockstun' ? 0.9 : 0.45})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(x + f.facing * 34, footY - h / 2, 16, h / 2, 0, f.facing > 0 ? -Math.PI / 2 : Math.PI / 2, f.facing > 0 ? Math.PI / 2 : Math.PI * 1.5);
      ctx.stroke();
    }
  }

  // Bolo ou pizza na mão do Carlos, diminuindo a cada mordida.
  function drawFood(f, x, footY) {
    const bites = Math.floor(f.t / 0.14);
    const left = clamp(1 - bites * 0.15, 0.2, 1);
    const hx = x + f.facing * 30;
    const hy = footY - f.ch.height + 52;
    if (f.food === 'pizza') {
      ctx.save();
      ctx.translate(hx, hy);
      ctx.scale(f.facing, 1);
      ctx.rotate(-0.5);
      const len = 46 * left;
      ctx.fillStyle = '#c8873e'; // borda
      ctx.fillRect(-4, -15, 8, 30);
      ctx.fillStyle = '#ffcf5a'; // queijo
      ctx.beginPath(); ctx.moveTo(2, -14); ctx.lineTo(2 + len, 0); ctx.lineTo(2, 14); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#c0392b'; // calabresa
      for (const [px, py] of [[10, -5], [12, 6], [22, 1], [32, -2]]) {
        if (px < len - 4) { ctx.beginPath(); ctx.arc(px, py, 3.6, 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.restore();
    } else {
      drawFx('cake', hx + f.facing * 6, hy, 0.75 * (0.45 + left * 0.55), 1, 0);
    }
  }

  // Batismo: feixe de luz do céu e uma nuvenzinha derramando água.
  function drawBaptism(f, x, footY) {
    const fade = clamp(f.t < 0.2 ? f.t / 0.2 : (TRANSFORM_TIME - f.t) / 0.4, 0, 1);
    ctx.save();
    ctx.globalAlpha = fade;
    const beam = ctx.createLinearGradient(x - 60, 0, x + 60, 0);
    beam.addColorStop(0, 'rgba(255,240,170,0)');
    beam.addColorStop(0.5, 'rgba(255,245,190,0.55)');
    beam.addColorStop(1, 'rgba(255,240,170,0)');
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(x - 30, 0); ctx.lineTo(x + 30, 0); ctx.lineTo(x + 75, footY); ctx.lineTo(x - 75, footY);
    ctx.fill();
    if (f.t < 1.0) {
      const cy = footY - 262;
      ctx.fillStyle = '#eef8ff';
      for (const [dx, dy, r] of [[-26, 4, 18], [0, -6, 24], [26, 4, 18], [0, 10, 18]]) {
        ctx.beginPath(); ctx.arc(x + dx, cy + dy, r, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  // Balão de fala estilo quadrinho acima do personagem.
  function drawBubble(f) {
    if (!f.say) return;
    const { text, t, life } = f.say;
    const appear = Math.min(1, t / 0.12);
    const alpha = Math.min(appear, (life - t) / 0.2);
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.font = '800 17px system-ui, "Segoe UI", Arial, sans-serif';
    const maxW = 230;
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = word; } else line = test;
    }
    if (line) lines.push(line);
    const w = Math.max(...lines.map(l => ctx.measureText(l).width)) + 26;
    const h = lines.length * 21 + 16;
    // posição da cabeça no mundo → tela (o balão é desenhado sem o zoom, para o texto ficar legível)
    const headX = (f.x - camX) * ZOOM;
    const headY = (FLOOR - f.y - (form(f).wide ? f.ch.height + 10 : f.ch.height) - 6 - camTop) * ZOOM;
    const bx = clamp(headX - w / 2 + f.facing * 30, 8, viewW - w - 8);
    const by = Math.max(96, headY - h - 18);
    const pop = 0.85 + appear * 0.15;
    ctx.translate(bx + w / 2, by + h);
    ctx.scale(pop, pop);
    ctx.translate(-(bx + w / 2), -(by + h));
    const loud = /!$/.test(text) && text === text.toUpperCase();
    ctx.fillStyle = loud ? '#fff3b0' : '#ffffff';
    ctx.strokeStyle = '#1a1030';
    ctx.lineWidth = 3;
    roundRect(ctx, bx, by, w, h, 14);
    ctx.fill();
    ctx.stroke();
    // rabinho apontando para a cabeça
    const tx = clamp(headX, bx + 18, bx + w - 18);
    ctx.beginPath();
    ctx.moveTo(tx - 9, by + h - 1.5);
    ctx.lineTo(tx + f.facing * -4, by + h + 16);
    ctx.lineTo(tx + 9, by + h - 1.5);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(tx - 9, by + h);
    ctx.lineTo(tx + f.facing * -4, by + h + 16);
    ctx.lineTo(tx + 9, by + h);
    ctx.stroke();
    ctx.fillStyle = { juraci: '#a0124f', carlos: '#1d2a6b', pedro: '#3a1450', daniel: '#b0156e', franciely: '#1d4f91', gabi: '#b3121f', dada: '#3b2a1a' }[f.id] || '#1d2a6b';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    lines.forEach((l, i) => ctx.fillText(l, bx + w / 2, by + 9 + i * 21));
    ctx.restore();
  }

  // ---------- Projéteis desenhados por código ----------
  function drawProjectile(p) {
    if (p.delay > 0) return;
    const x = p.x - camX;
    const y = FLOOR - p.y;
    const dir = Math.sign(p.vx) || 1;
    ctx.save();
    switch (p.sprite) {
      case 'cake':
        ctx.restore();
        drawFx('cake', x, y, 0.9, 1, Math.sin(p.spin) * 0.25);
        return;
      case 'smoke': {
        // nuvem de fumaça de cigarro
        const fade = clamp(p.life / p.max * 2, 0, 1);
        ctx.globalAlpha = 0.85 * fade;
        for (let i = 0; i < 6; i++) {
          const a = p.spin * 0.4 + i;
          ctx.fillStyle = i % 2 ? '#d9d4e6' : '#bdb6cc';
          ctx.beginPath();
          ctx.arc(x + Math.cos(a) * p.w * 0.28, y + Math.sin(a * 1.3) * p.h * 0.22, p.h * 0.32, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'car': {
        // carrinho vermelho desgovernado
        ctx.translate(x, y + 6);
        ctx.scale(dir, 1);
        ctx.fillStyle = '#d62839';
        roundRect(ctx, -75, -30, 150, 34, 8); ctx.fill();
        ctx.fillStyle = '#b81f2f';
        roundRect(ctx, -40, -54, 76, 28, 10); ctx.fill();
        ctx.fillStyle = '#bfe6ff';
        ctx.fillRect(-32, -48, 30, 18); ctx.fillRect(4, -48, 26, 18);
        ctx.fillStyle = '#ffe066'; ctx.fillRect(66, -22, 9, 9);
        ctx.fillStyle = '#222';
        for (const wx of [-45, 45]) { ctx.beginPath(); ctx.arc(wx, 6, 15, 0, Math.PI * 2); ctx.fill(); }
        ctx.fillStyle = '#aaa';
        for (const wx of [-45, 45]) { ctx.beginPath(); ctx.arc(wx, 6, 6, 0, Math.PI * 2); ctx.fill(); }
        // gorro de Natal no teto (Natal Praia!)
        ctx.fillStyle = '#e63946';
        ctx.beginPath(); ctx.moveTo(-14, -54); ctx.lineTo(14, -54); ctx.lineTo(24, -76); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.fillRect(-16, -57, 32, 6);
        ctx.beginPath(); ctx.arc(24, -76, 5, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'note':
        ctx.fillStyle = ['#ff6fd8', '#62efff', '#ffe066'][Math.floor(p.baseY) % 3];
        ctx.strokeStyle = '#2a1040';
        ctx.lineWidth = 4;
        ctx.font = '900 44px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeText('♫', x, y);
        ctx.fillText('♫', x, y);
        break;
      case 'L': {
        // "L" gigante, vermelho e brilhante
        ctx.translate(x, y);
        ctx.rotate(Math.sin(p.spin) * 0.08);
        ctx.shadowColor = '#ff3b3b';
        ctx.shadowBlur = 22;
        ctx.font = '900 120px Impact, "Arial Black", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 8;
        ctx.strokeStyle = '#fff';
        ctx.strokeText('L', 0, 0);
        ctx.fillStyle = '#e3121f';
        ctx.fillText('L', 0, 0);
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#fff';
        ctx.font = '900 22px Arial, sans-serif';
        ctx.fillText('★', 14, -30);
        break;
      }
      case 'brigadeiro':
        drawBrigadeiro(x, y, 1);
        break;
      case 'soap': {
        // água com sabão escorrendo no chão
        ctx.globalAlpha = clamp(p.life / p.max * 2, 0, 1);
        ctx.fillStyle = 'rgba(140,210,255,0.55)';
        ctx.beginPath(); ctx.ellipse(x, FLOOR - 3, p.w / 2, 9, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#ffffffcc';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 6; i++) {
          ctx.beginPath();
          ctx.arc(x - p.w / 2 + 10 + i * (p.w - 20) / 5, FLOOR - 10 - Math.abs(Math.sin(p.spin + i)) * 10, 4 + (i % 3), 0, Math.PI * 2);
          ctx.stroke();
        }
        break;
      }
      case 'milk': {
        // jato de leite
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = '#fffdf5';
        ctx.strokeStyle = '#d9e7f5';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(x, y, p.w / 2, p.h / 3, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
        for (let i = 0; i < 4; i++) {
          ctx.beginPath();
          ctx.arc(x - dir * (p.w / 2 + i * 12), y + Math.sin(p.spin + i) * 8, 7 - i, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      default:
        ctx.restore();
        drawFx(p.sprite, x, y, 0.9, 1, 0);
        return;
    }
    ctx.restore();
  }

  function drawBrigadeiro(x, y, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fillStyle = '#3b1e0f';
    ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#6b3a1e';
    ctx.beginPath(); ctx.arc(-3, -3, 6, 0, Math.PI * 2); ctx.fill();
    const sprinkles = ['#ffd23f', '#ff6fd8', '#ffffff', '#62efff'];
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = sprinkles[i % 4];
      ctx.fillRect(Math.cos(i * 2.4) * 8 - 1, Math.sin(i * 2.4) * 8 - 1, 3, 2);
    }
    ctx.restore();
  }

  // Panela de brigadeiro (no chão ou nas mãos da Juraci)
  function drawPot(x, y, s = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fillStyle = '#8d99a6';
    roundRect(ctx, -26, -26, 52, 26, 6); ctx.fill();
    ctx.fillStyle = '#5c6670';
    ctx.fillRect(-34, -22, 9, 5); ctx.fillRect(25, -22, 9, 5);
    ctx.fillStyle = '#4a250f';
    ctx.beginPath(); ctx.ellipse(0, -26, 25, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c69c6d';
    ctx.save(); ctx.translate(8, -30); ctx.rotate(0.6); ctx.fillRect(-2, -26, 4, 30); ctx.restore();
    ctx.restore();
  }

  // Bacia de louça com espuma (Dadá lavando)
  function drawBasin(x, y) {
    ctx.save();
    ctx.fillStyle = '#4f86c6';
    ctx.beginPath(); ctx.moveTo(x - 30, y - 28); ctx.lineTo(x + 30, y - 28); ctx.lineTo(x + 22, y); ctx.lineTo(x - 22, y); ctx.fill();
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(x - 24 + i * 10, y - 30 + Math.sin(clock * 6 + i) * 2, 7, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#e8e8e8';
    ctx.beginPath(); ctx.ellipse(x + 10, y - 36, 12, 4, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Dadá: senhor de uns 65–70 anos, magro e careca (desenhado por código)
  function drawDada(x, footY, dir, walking, scrubbing) {
    const step = walking ? Math.sin(clock * 14) : 0;
    ctx.save();
    ctx.translate(x, footY);
    ctx.scale(dir * 1.2, 1.2);
    const skin = '#5b3a29';
    // pernas
    ctx.strokeStyle = '#3b3f58';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-3, -58); ctx.lineTo(-3 + step * 9, -4); ctx.moveTo(4, -58); ctx.lineTo(4 - step * 9, -4); ctx.stroke();
    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(-10 + step * 9, -6, 13, 6); ctx.fillRect(-3 - step * 9, -6, 13, 6);
    // tronco (camisa de botão clara, bem magro) e avental
    ctx.fillStyle = '#e8e2d0';
    roundRect(ctx, -11, -104, 22, 50, 6); ctx.fill();
    ctx.fillStyle = '#4f86c6';
    ctx.fillRect(-9, -84, 18, 30);
    ctx.fillStyle = '#cfc8b4';
    for (let i = 0; i < 3; i++) ctx.fillRect(-1, -100 + i * 9, 2, 2);
    // braços
    ctx.strokeStyle = skin;
    ctx.lineWidth = 5;
    const scrub = scrubbing ? Math.sin(clock * 20) * 6 : 0;
    ctx.beginPath();
    ctx.moveTo(-8, -98); ctx.lineTo(-12 - step * 4, -70);
    ctx.moveTo(8, -98); ctx.lineTo(scrubbing ? 22 + scrub : 12 + step * 4, scrubbing ? -78 : -70);
    ctx.stroke();
    // pescoço e cabeça careca, bigode grisalho
    ctx.fillStyle = skin;
    ctx.fillRect(-3, -112, 6, 9);
    ctx.beginPath(); ctx.ellipse(1, -124, 10, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff40';
    ctx.beginPath(); ctx.ellipse(-2, -131, 4, 2.5, -0.4, 0, Math.PI * 2); ctx.fill(); // brilho da careca
    ctx.fillStyle = '#d9d9d9';
    ctx.fillRect(3, -118, 8, 2);
    ctx.fillStyle = '#111';
    ctx.fillRect(6, -127, 2, 2);
    ctx.fillStyle = skin;
    ctx.fillRect(9, -124, 3, 3); // nariz
    if (scrubbing) {
      // prato e esponja
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(28, -76, 12, 4, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(18 + scrub, -84, 8, 6);
    }
    ctx.restore();
  }

  function drawCameo(c) {
    if (c.delay > 0) {
      if (c.kind === 'juraciPan') drawPot((c.panX || c.owner.x - c.owner.facing * 70) - camX, FLOOR);
      return;
    }
    const x = c.x - camX;
    if (c.kind === 'dada') {
      drawDada(x, FLOOR, c.phase === 'wash' ? c.owner.facing : c.walkDir || 1, c.phase !== 'wash', c.phase === 'wash');
      if (c.phase === 'wash') drawBasin(x + c.owner.facing * 30, FLOOR);
      return;
    }
    const sprite = (id, frames, fps, dir) => {
      const S = SPR[id];
      const list = S && S[frames];
      if (!list || !ready(atlas)) return;
      const [sx, sy, sw, sh, ax, ay] = cycle(list, fps, c.t);
      const s = CHARS[id].scale;
      ctx.save();
      ctx.translate(x, FLOOR);
      ctx.scale(dir * s, s);
      ctx.drawImage(atlas, sx, sy, sw, sh, -ax / AS, -ay / AS, sw / AS, sh / AS);
      ctx.restore();
    };
    if (c.kind === 'carlosFlee') {
      sprite('carlos', 'run', 12, c.dir);
      // gotas de suor de medo
      ctx.fillStyle = '#9fdcff';
      for (let i = 0; i < 3; i++) ctx.fillRect(x - c.dir * (20 + i * 9), FLOOR - 160 + Math.sin(clock * 20 + i) * 5, 4, 7);
    } else if (c.kind === 'juraciPan') {
      if (c.phase === 'enter' || c.phase === 'leave') sprite('juraci', 'walk', 9, c.walkDir || 1);
      else sprite('juraci', 'idle', 6, c.owner.facing * -1);
      if (c.carrying) drawPot(x + (c.walkDir || 1) * 26, FLOOR - 78, 0.9);
      else drawPot(c.panX - camX, FLOOR);
    }
  }

  function cameoBubbleTarget(c) {
    return { x: c.x, y: 0, form: 'normal', ch: { height: 150 }, facing: c.walkDir || c.dir || 1, id: c.kind === 'dada' ? 'dada' : c.kind === 'carlosFlee' ? 'carlos' : 'juraci', say: c.say };
  }

  // Itens nas mãos: garrafa do Daniel (quando a esposa deixa) e panela da Juraci
  function drawHeldItems(f) {
    const x = f.x - camX;
    const footY = FLOOR - f.y;
    if (f.drinkT > 0) drawFx('heineken', x + f.facing * 26, footY - f.ch.height + 55, 1, 1, f.facing * -0.5);
    if (f.holdPan > 0) drawPot(x + f.facing * 28, footY - 72, 0.9);
  }

  function drawAnnouncement() {
    if (!announcement) return;
    const { text, label, t, life } = announcement;
    const alpha = clamp(Math.min(t / 0.15, (life - t) / 0.25), 0, 1);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = '800 20px system-ui, "Segoe UI", Arial, sans-serif';
    const w = Math.max(ctx.measureText(text).width, 160) + 40;
    const x = viewW / 2 - w / 2;
    const y = 104;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#1a1030';
    ctx.lineWidth = 3;
    roundRect(ctx, x, y, w, 52, 14); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#d6336c';
    ctx.font = '900 12px system-ui, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    if (label) ctx.fillText(label, viewW / 2, y + 6);
    ctx.fillStyle = '#1a1030';
    ctx.font = '800 20px system-ui, "Segoe UI", Arial, sans-serif';
    ctx.fillText(text, viewW / 2, y + 22);
    ctx.restore();
  }

  function drawFx(name, x, y, scale, alpha, rot) {
    const fr = SPR.fx && SPR.fx[name] && SPR.fx[name][0];
    if (!fr || !ready(atlas)) return;
    const [sx, sy, sw, sh, ax, ay] = fr;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    ctx.scale(scale, scale);
    ctx.drawImage(atlas, sx, sy, sw, sh, -ax / AS, -ay / AS, sw / AS, sh / AS);
    ctx.restore();
  }

  // ======================================================================
  // HUD
  // ======================================================================
  function hudText(value, x, y, size, fill, align = 'left', stroke = '#170d24', lw = 5) {
    ctx.font = `${size}px Impact, "Arial Black", sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    ctx.lineWidth = lw;
    ctx.strokeStyle = stroke;
    ctx.strokeText(value, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(value, x, y);
  }

  function drawPortrait(f, x, y, size, mirror) {
    ctx.fillStyle = f.slot === 0 ? '#f21870' : '#d79a0b';
    ctx.fillRect(x - 3, y - 3, size + 6, size + 6);
    ctx.fillStyle = '#2b1f4f';
    ctx.fillRect(x, y, size, size);
    const img = portraits[f.id];
    if (ready(img)) {
      const crop = Math.min(img.naturalWidth, img.naturalHeight);
      ctx.save();
      ctx.beginPath(); ctx.rect(x, y, size, size); ctx.clip();
      if (mirror) { ctx.translate(x * 2 + size, 0); ctx.scale(-1, 1); }
      ctx.drawImage(img, 0, 0, crop, crop, x, y, size, size);
      ctx.restore();
    }
    const tag = f.slot === 0 ? '1P' : match.mode === 'versus' ? '2P' : 'CPU';
    hudText(tag, mirror ? x + 4 : x + size - 4, y + size + 2, 16, f.slot === 0 ? '#ff88ac' : '#ffd95b', mirror ? 'left' : 'right', '#170d24', 4);
  }

  function drawSide(f, mirror) {
    const cx = viewW / 2;
    const size = 60;
    const px = mirror ? viewW - 14 - size : 14;
    drawPortrait(f, px, 12, size, mirror);
    const barW = cx - 50 - (14 + size + 10);
    const barX = mirror ? cx + 50 : 14 + size + 10;
    const y = 16;
    ctx.fillStyle = '#170d24';
    ctx.fillRect(barX - 3, y - 3, barW + 6, 28);
    ctx.fillStyle = '#4a1530';
    ctx.fillRect(barX, y, barW, 22);
    const lagW = barW * f.hpLag / MAX_HP;
    const hpW = barW * f.hp / MAX_HP;
    ctx.fillStyle = '#ff3b3b';
    ctx.fillRect(mirror ? barX + barW - lagW : barX, y, lagW, 22);
    const low = f.hp < MAX_HP * 0.25;
    ctx.fillStyle = low && Math.floor(clock * 6) % 2 ? '#ff9a3c' : '#ffe14d';
    ctx.fillRect(mirror ? barX + barW - hpW : barX, y, hpW, 22);
    ctx.fillStyle = '#ffffff55';
    ctx.fillRect(mirror ? barX + barW - hpW : barX, y, hpW, 6);
    // nome + vitórias
    hudText(CHARS[f.id].name, mirror ? barX + barW : barX, y + 46, 22, '#ffffff', mirror ? 'right' : 'left');
    for (let i = 0; i < match.winsNeeded; i++) {
      const wx = mirror ? barX + 14 + i * 22 : barX + barW - 14 - i * 22;
      ctx.fillStyle = '#170d24';
      ctx.beginPath(); ctx.arc(wx, y + 38, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = i < match.wins[f.slot] ? '#ffd23f' : '#3b2a55';
      ctx.beginPath(); ctx.arc(wx, y + 38, 6, 0, Math.PI * 2); ctx.fill();
    }
    // barra de especial
    const mw = barW * 0.62;
    const mx = mirror ? barX + barW - mw : barX;
    const my = y + 54;
    ctx.fillStyle = '#170d24';
    ctx.fillRect(mx - 2, my - 2, mw + 4, 12);
    ctx.fillStyle = '#241a31';
    ctx.fillRect(mx, my, mw, 8);
    const fill = mw * f.meter / 100;
    const full = f.meter >= 100;
    ctx.fillStyle = full ? (Math.floor(clock * 8) % 2 ? '#ffffff' : '#62efff') : '#36b8d6';
    ctx.fillRect(mirror ? mx + mw - fill : mx, my, fill, 8);
    let status = full ? 'ESPECIAL PRONTO!' : '';
    let color = '#92f4ff';
    if (f.form !== 'normal') {
      status = `${form(f).label} ${Math.ceil(f.formTime)}s`;
      color = form(f).color;
    }
    if (status) hudText(status, mirror ? mx - 8 : mx + mw + 8, my + 9, 13, color, mirror ? 'right' : 'left', '#170d24', 4);
    // combo
    if (f.combo >= 2 && f.comboShow > 0) {
      const pop = 1 + Math.max(0, f.comboShow - 1.0) * 2;
      ctx.save();
      ctx.translate(mirror ? viewW - 70 : 70, 170);
      ctx.scale(pop, pop);
      hudText(`${f.combo} HITS`, 0, 0, 30, '#ffd23f', mirror ? 'right' : 'left', '#7f291d', 6);
      hudText('COMBO!', 0, 22, 16, '#ffffff', mirror ? 'right' : 'left', '#7f291d', 4);
      ctx.restore();
    }
  }

  function drawHud() {
    const cx = viewW / 2;
    drawSide(fighters[0], false);
    drawSide(fighters[1], true);
    ctx.fillStyle = '#170d24';
    roundRect(ctx, cx - 44, 6, 88, 62, 10); ctx.fill();
    ctx.fillStyle = '#3b1f3f';
    roundRect(ctx, cx - 39, 11, 78, 52, 8); ctx.fill();
    const time = Number.isFinite(match.timer) ? Math.ceil(match.timer) : null;
    if (time === null) hudText('∞', cx, 52, 40, '#fff16b', 'center', '#7f291d', 5);
    else hudText(String(time).padStart(2, '0'), cx, 52, 38, time <= 10 && Math.floor(clock * 4) % 2 ? '#ff5a5a' : '#fff16b', 'center', '#7f291d', 5);
    hudText(`ROUND ${match.round}`, cx, 82, 13, '#ffd0e0', 'center', '#170d24', 4);
  }

  function banner(textValue, sub, progress, color = '#ffd23f') {
    const cx = viewW / 2;
    const appear = Math.min(1, progress * 5);
    const scale = 0.6 + appear * 0.4 + Math.max(0, 0.2 - progress) * 2;
    ctx.save();
    ctx.globalAlpha = Math.min(1, appear * 1.2);
    ctx.fillStyle = 'rgba(16,13,32,0.55)';
    ctx.fillRect(0, H / 2 - 62, viewW, 110);
    ctx.translate(cx, H / 2 + 16);
    ctx.scale(scale, scale);
    hudText(textValue, 0, 0, 74, color, 'center', '#7f291d', 10);
    if (sub) hudText(sub, 0, 34, 22, '#ffffff', 'center', '#170d24', 5);
    ctx.restore();
  }

  function drawBanners() {
    const t = match.t;
    switch (match.sub) {
      case 'intro':
        if (t < 1.1) {
          const final = match.winsNeeded > 1 && match.wins[0] === match.winsNeeded - 1 && match.wins[1] === match.winsNeeded - 1;
          banner(final ? 'ROUND FINAL' : `ROUND ${match.round}`, stageNames[match.stage], t);
        } else {
          banner('LUTEM!', '', t - 1.1, '#ff6b3d');
        }
        break;
      case 'fight':
        if (t < 0.5) banner('LUTEM!', '', 0.2 + t, '#ff6b3d');
        break;
      case 'ko':
        if (t > 0.15) banner('K.O.!', match.perfect ? 'PERFEITO!' : '', t - 0.15, '#ff3b3b');
        break;
      case 'timeup':
        banner('TEMPO!', '', t, '#ffd23f');
        break;
      case 'roundEnd': {
        const w = match.roundWinner;
        if (w < 0) banner('EMPATE', 'ninguém pontua', t);
        else banner(`${CHARS[fighters[w].id].name} VENCE!`, match.perfect ? 'VITÓRIA PERFEITA' : `${match.wins[0]} × ${match.wins[1]}`, t);
        break;
      }
      default:
        break;
    }
  }

  // ======================================================================
  // Render principal
  // ======================================================================
  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#100d20';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (app === 'splash') return; // o menu cobre tudo
    ctx.setTransform(renderScale, 0, 0, renderScale, offsetX, offsetY);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, viewW, H); ctx.clip();
    if (shake > 0) ctx.translate(rand(-shake, shake), rand(-shake, shake) * 0.6);
    const cam = app === 'fight' || app === 'result' ? camX : (STAGE_W - worldW) / 2 + Math.sin(clock * 0.2) * 220;
    // mundo com zoom: ancorado embaixo, topo = camTop
    ctx.scale(ZOOM, ZOOM);
    ctx.translate(0, -(app === 'fight' || app === 'result' ? camTop : CAM_TOP));
    drawStage(cam);
    if (app === 'fight' || app === 'result') {
      if (superFreeze > 0) {
        ctx.fillStyle = `rgba(10,5,30,${Math.min(0.55, superFreeze * 2)})`;
        ctx.fillRect(0, 0, worldW, H);
      }
      for (const f of fighters) drawShadow(f);
      const order = [...fighters].sort((a, b) => (a.state === 'attack') - (b.state === 'attack'));
      for (const f of order) drawFighter(f);
      for (const c of cameos) drawCameo(c);
      for (const p of projectiles) drawProjectile(p);
      for (const e of effects) {
        const k = 1 - e.life / e.max;
        drawFx(e.name, e.x - camX, e.y, e.scale * (0.7 + k * 0.6), Math.min(1, (e.life / e.max) * 1.6), e.rot);
      }
      for (const p of particles) {
        ctx.globalAlpha = clamp(p.life / p.max * 1.5, 0, 1);
        ctx.fillStyle = p.color;
        if (p.kind === 'note') {
          ctx.font = `900 ${p.size}px Arial, sans-serif`;
          ctx.textAlign = 'center';
          ctx.fillText('♪', p.x - camX, p.y);
        } else if (p.kind === 'bubble') {
          ctx.strokeStyle = '#ffffffcc';
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(p.x - camX, p.y, p.size, 0, Math.PI * 2); ctx.stroke();
        } else {
          ctx.fillRect(p.x - camX - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    if ((app === 'fight' || app === 'result') && match) {
      drawHud();
      for (const f of fighters) drawBubble(f);
      for (const c of cameos) if (c.say && c.delay <= 0) drawBubble(cameoBubbleTarget(c));
      drawAnnouncement();
      drawBanners();
      if (match.sub === 'talk' && app === 'fight') {
        const hint = touchEnabled() ? 'Toque na tela para pular' : 'Aperte qualquer golpe ou Enter para pular';
        ctx.globalAlpha = 0.6 + Math.sin(clock * 4) * 0.25;
        hudText(hint, viewW / 2, H - 18, 15, '#ffffff', 'center', '#170d24', 4);
        ctx.globalAlpha = 1;
      }
    }
  }

  function frame(ts) {
    requestAnimationFrame(frame);
    const dt = lastTs ? Math.min(0.1, (ts - lastTs) / 1000) : 0;
    lastTs = ts;
    if (app === 'fight') pollGamepads();
    if (app === 'fight' && !paused && match && !isBlockedByRotation()) {
      accumulator += dt;
      let steps = 0;
      while (accumulator >= STEP && steps < 5) {
        tick(STEP);
        accumulator -= STEP;
        steps++;
      }
      if (steps === 5) accumulator = 0;
    } else {
      accumulator = 0;
      clock += dt;
    }
    if (app === 'chars') {
      drawBigFighter($('#p1Card .big-preview'), $('#p1Card').dataset.fighter, false);
      const p2 = $('#p2Card').dataset.fighter;
      drawBigFighter($('#p2Card .big-preview'), p2, true, p2 === settings.fighter, !p2);
    } else if (app === 'stage') drawStagePreview();
    else if (app === 'vs') drawVersus();
    render();
  }

  // ======================================================================
  // Telas, pausa, orientação, tela cheia
  // ======================================================================
  const ui = {
    splash: $('#splash'), chars: $('#charSelect'), stage: $('#stageSelect'), options: $('#optionsSelect'), vs: $('#vsScreen'), result: $('#result'), pause: $('#pause'),
    rotate: $('#rotateNotice'), controls: $('#controls'), pauseButton: $('#pauseButton')
  };

  function touchEnabled() {
    return settings.touch === 'always' || (settings.touch === 'auto' && touchSeen);
  }

  function isPortraitPhone() {
    return matchMedia('(orientation: portrait)').matches && (matchMedia('(pointer: coarse)').matches || innerWidth < 700);
  }
  function isBlockedByRotation() {
    return app === 'fight' && isPortraitPhone();
  }

  function updateOverlays() {
    ui.splash.hidden = app !== 'splash';
    ui.chars.hidden = app !== 'chars';
    ui.stage.hidden = app !== 'stage';
    ui.options.hidden = app !== 'options';
    ui.vs.hidden = app !== 'vs';
    ui.result.hidden = app !== 'result';
    ui.pause.hidden = !(app === 'fight' && paused);
    ui.rotate.hidden = !isBlockedByRotation();
    const live = app === 'fight' && !paused;
    ui.controls.hidden = !(live && touchEnabled());
    ui.pauseButton.hidden = !live;
  }

  function setApp(next) {
    app = next;
    if (next !== 'fight') paused = false;
    updateOverlays();
    if (next === 'chars') $('#charConfirm').focus({ preventScroll: true });
    if (next === 'stage') $('#stageConfirm').focus({ preventScroll: true });
    if (next === 'options') $('#fightStart').focus({ preventScroll: true });
    if (next === 'splash') $('#splashStart').focus({ preventScroll: true });
    if (next === 'result') $('#replay').focus({ preventScroll: true });
  }

  function goSplash() {
    clearTimeout(vsTimer);
    Audio.startMusic('theme');
    Audio.stopSpeech();
    setApp('splash');
  }

  function pauseGame() {
    if (app !== 'fight' || paused) return;
    paused = true;
    clearInputs();
    Audio.pauseMusic(true);
    Audio.stopSpeech();
    updateOverlays();
    $('#resume').focus({ preventScroll: true });
  }
  function resumeGame() {
    if (app !== 'fight' || !paused) return;
    paused = false;
    lastTs = 0;
    Audio.pauseMusic(false);
    updateOverlays();
  }
  function togglePause() {
    if (paused) resumeGame(); else pauseGame();
  }

  async function enterFullscreen() {
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      }
      if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape');
    } catch { /* nem todo navegador permite (ex.: iPhone) */ }
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    canvas.width = Math.max(1, Math.round(cssW * dpr));
    canvas.height = Math.max(1, Math.round(cssH * dpr));
    // largura visível acompanha a proporção da tela (4:3 até 21:9), sem faixas pretas
    viewW = clamp(Math.round(H * (cssW / Math.max(1, cssH))), MIN_W, MAX_W);
    renderScale = Math.min(canvas.width / viewW, canvas.height / H);
    offsetX = (canvas.width - viewW * renderScale) / 2;
    offsetY = (canvas.height - H * renderScale) / 2;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (stageCache) {
      const name = stageCache.name;
      stageCache = null;
      ensureStage(name);
    }
    ui.pauseButton.style.top = `${(offsetY + 92 * renderScale) / dpr}px`;
    worldW = viewW / ZOOM;
    camX = clamp(camX, 0, STAGE_W - worldW);
    updateOverlays();
    if (isBlockedByRotation() && !paused) pauseGame();
  }
  let resizeQueued = false;
  function queueResize() {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => { resizeQueued = false; resize(); });
  }

  // ======================================================================
  // Seleção de personagem
  // ======================================================================
  function setChecked(selector, attr, value) {
    $$(selector).forEach(button => button.setAttribute('aria-checked', String(button.dataset[attr] === value)));
  }

  // ======================================================================
  // Telas de escolha (estilo jogo de luta): lutador → cenário → dificuldade → VS → luta
  // ======================================================================
  // Frase de efeito e golpes de cada lutador (aparecem no painel grande e na lista de golpes)
  const PROFILE = {
    juraci: { quote: '"Bolos são minha vida!"', moves: [['L', 'Super Bolo de Cenoura: bolo voador que derruba'], ['↓ + L', 'Chama o Dadá: "Já vou, irmã!" — chão molhado']] },
    carlos: { quote: '"Tô firme! Tô forte!"', moves: [['L', 'Gordão (come e engorda: +força) / Modo Fé (batismo: +defesa)'], ['J J K K', 'Combo do Chute: o 4º golpe derruba']] },
    pedro: { quote: '"Fuma, bebe e vence!"', moves: [['L', 'Bebe uma Heineken e vira o Monstrão'], ['↓ + L', 'Fumaça de cigarro: o adversário tosse']] },
    daniel: { quote: '"Partiu praia?"', moves: [['L', 'Natal Praia: rápido, imprevisível — carro, esposa ou show'], ['↓ + L', 'Dancinha com notas musicais']] },
    franciely: { quote: '"Cuidar também é lutar!"', moves: [['L', 'Irritada sem motivo: Carlos foge e bate a fome sem fim'], ['↓ + L', 'Jato de leite']] },
    gabi: { quote: '"Faz o L, ama o Lula!"', moves: [['L', 'Super L + chuva de brigadeiros (a Juraci busca a panela)'], ['↓ + L', 'Canto com notas musicais']] }
  };
  const STAGE_INFO = {
    padaria: 'A padaria da Juju, com bolos na vitrine.',
    quintal: 'O quintal da família no pôr do sol, com varal e mangueira.',
    festa: 'Noite de festa junina, bandeirinhas e fogueira.',
    bar: 'Aqui a resenha é garantida! Cerveja gelada e futebol na TV.',
    praia: 'Sol, mar e diversão! Calçadão, guarda-sóis e vôlei.'
  };
  const STAGE_IDS = ['padaria', 'quintal', 'festa', 'bar', 'praia'];
  const FLOW_SCREENS = ['chars', 'stage', 'options'];

  const flow = { phase: 'p1', cursor: 'juraci', stageCursor: 'padaria' };
  const rosterIds = () => [...FIGHTER_IDS, 'auto'];

  // ---------- montagem (uma vez) ----------
  function buildRoster() {
    const roster = $('#roster');
    roster.replaceChildren(...rosterIds().map(id => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tile';
      b.dataset.id = id;
      b.setAttribute('role', 'option');
      const label = document.createElement('span');
      if (id === 'auto') {
        const q = document.createElement('div');
        q.className = 'tile-random';
        q.textContent = '?';
        b.append(q);
        label.textContent = 'ALEATÓRIO';
      } else {
        const img = document.createElement('img');
        img.src = `assets/portraits/${id}.png`;
        img.alt = '';
        img.decoding = 'async';
        img.addEventListener('error', () => { img.style.visibility = 'hidden'; });
        b.append(img);
        label.textContent = CHARS[id].name;
        if (!available(id)) { b.disabled = true; b.title = 'Em breve'; }
      }
      b.append(label);
      b.addEventListener('click', () => {
        if (b.disabled) return;
        if (flow.cursor === id) confirmChar();
        else { flow.cursor = id; Audio.play('ui'); refreshChars(); }
      });
      return b;
    }));
  }

  function buildStageList() {
    const list = $('#stageList');
    list.replaceChildren(...[...STAGE_IDS, 'random'].map(id => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'stage-tile';
      b.dataset.id = id;
      b.setAttribute('role', 'option');
      if (id === 'random') {
        const q = document.createElement('div');
        q.className = 'tile-random';
        q.textContent = '🎲';
        b.append(q);
      } else {
        b.append(document.createElement('canvas'));
      }
      const label = document.createElement('span');
      label.textContent = id === 'random' ? 'ALEATÓRIO' : stageNames[id].toUpperCase();
      b.append(label);
      b.addEventListener('click', () => {
        if (flow.stageCursor === id) confirmStage();
        else { flow.stageCursor = id; Audio.play('ui'); refreshStageScreen(); }
      });
      return b;
    }));
  }

  // ---------- painéis grandes ----------
  function fillCard(card, id, { tag, waiting, locked }) {
    const info = id && id !== 'auto' ? CHARS[id] : null;
    card.querySelector('.card-name').textContent = info ? info.name : id === 'auto' ? 'ALEATÓRIO' : '???';
    card.querySelector('.card-quote').textContent = info ? PROFILE[id].quote : 'Um adversário surpresa!';
    const moves = card.querySelector('.card-moves');
    moves.replaceChildren(...(info ? PROFILE[id].moves : []).map(([key, text]) => {
      const li = document.createElement('li');
      const b = document.createElement('b');
      b.textContent = `${key}: `;
      li.append(b, text);
      return li;
    }));
    if (tag) card.querySelector('.slot-tag').textContent = tag;
    card.classList.toggle('waiting', Boolean(waiting));
    card.classList.toggle('locked', Boolean(locked));
    card.dataset.fighter = id || '';
  }

  // desenha o lutador grande (parado, animado) num canvas de painel
  function drawBigFighter(cv, id, mirror, alt = false, dim = false) {
    const g = cv.getContext('2d');
    g.clearRect(0, 0, cv.width, cv.height);
    if (!id || !ready(atlas)) return;
    g.globalAlpha = dim ? 0.35 : 1;
    let showId = id;
    if (id === 'auto') { // aleatório: alterna os lutadores como "roleta"
      const others = PLAYABLE.filter(x => x !== settings.fighter);
      showId = others[Math.floor(clock * 6) % others.length];
      g.globalAlpha = 0.45;
    }
    const S = SPR[showId];
    if (!S) return;
    const [sx, sy, sw, sh, ax, ay] = cycle(S.idle, 6, clock + (mirror ? 0.3 : 0));
    const s = Math.min((cv.height * 0.86) / (sh / AS), (cv.width * 0.9) / (sw / AS)) / AS;
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath(); g.ellipse(cv.width / 2, cv.height - 18, cv.width * 0.25, 10, 0, 0, Math.PI * 2); g.fill();
    g.save();
    g.translate(cv.width / 2, cv.height - 18);
    g.scale(mirror ? -s : s, s);
    g.drawImage(alt && altAtlas ? altAtlas : atlas, sx, sy, sw, sh, -ax, -ay, sw, sh);
    g.restore();
    g.globalAlpha = 1;
  }

  // ---------- 1) lutador ----------
  function openChars(phase = 'p1') {
    flow.phase = phase;
    flow.cursor = phase === 'p1' ? settings.fighter : settings.opponent;
    if (!rosterIds().includes(flow.cursor)) flow.cursor = phase === 'p1' ? 'juraci' : 'auto';
    setApp('chars');
    refreshChars();
  }

  function refreshChars() {
    const versus = settings.mode === 'versus';
    const p1Phase = flow.phase === 'p1';
    setChecked('[data-mode]', 'mode', settings.mode);
    const p2tag = versus ? '2P' : 'CPU';
    $('#charStep').textContent = 'PASSO 1 DE 3';
    $('#charTitle').textContent = p1Phase ? 'ESCOLHA SEU LUTADOR' : versus ? '2P: ESCOLHA SEU LUTADOR' : 'ESCOLHA O ADVERSÁRIO';
    const p1 = p1Phase ? flow.cursor : settings.fighter;
    const p2 = p1Phase ? null : flow.cursor;
    fillCard($('#p1Card'), p1, { tag: '1P', locked: !p1Phase });
    fillCard($('#p2Card'), p2, { tag: p2tag, waiting: p1Phase });
    $('#charConfirm').textContent = p1Phase ? 'CONFIRMAR ▶' : 'ESCOLHER CENÁRIO ▶';
    $('#charHelp').textContent = touchSeen
      ? 'Toque no lutador para ver · toque de novo (ou em CONFIRMAR) para escolher'
      : 'Setas para escolher · Enter confirma · Esc volta';
    for (const tile of $$('#roster .tile')) {
      const id = tile.dataset.id;
      tile.classList.toggle('cursor-p1', p1Phase && id === flow.cursor);
      tile.classList.toggle('cursor-p2', !p1Phase && id === flow.cursor);
      tile.classList.toggle('pick-p1', !p1Phase && id === settings.fighter);
      tile.dataset.p2tag = p2tag;
      tile.disabled = id === 'auto' ? p1Phase : !available(id); // 'aleatório' só vale para o adversário
      tile.setAttribute('aria-selected', String(id === flow.cursor));
    }
  }

  function confirmChar() {
    const id = flow.cursor;
    if (flow.phase === 'p1') {
      if (id === 'auto' || !available(id)) return;
      settings.fighter = id;
      saveSettings();
      Audio.play('confirm');
      flow.phase = 'p2';
      flow.cursor = settings.opponent && rosterIds().includes(settings.opponent) ? settings.opponent : 'auto';
      refreshChars();
      return;
    }
    settings.opponent = id;
    saveSettings();
    Audio.play('confirm');
    openStage();
  }

  // ---------- 2) cenário ----------
  function openStage() {
    flow.stageCursor = settings.stage;
    setApp('stage');
    refreshStageScreen();
  }

  function refreshStageScreen() {
    if (app !== 'stage') return;
    const id = flow.stageCursor;
    for (const tile of $$('#stageList .stage-tile')) {
      tile.setAttribute('aria-selected', String(tile.dataset.id === id));
      const cv = tile.querySelector('canvas');
      if (cv) {
        const thumb = stageThumb(tile.dataset.id);
        cv.width = thumb.width;
        cv.height = thumb.height;
        cv.getContext('2d').drawImage(thumb, 0, 0);
      }
    }
    $('#stageName').textContent = id === 'random' ? 'CENÁRIO ALEATÓRIO' : stageNames[id];
    $('#stageDesc').textContent = id === 'random' ? 'O jogo sorteia um dos cenários.' : STAGE_INFO[id];
    drawStagePreview();
  }

  function drawStagePreview() {
    const cv = $('#stageBig');
    const g = cv.getContext('2d');
    const id = flow.stageCursor === 'random' ? STAGE_IDS[Math.floor(clock * 1.5) % STAGE_IDS.length] : flow.stageCursor;
    const thumb = stageThumb(id);
    g.drawImage(thumb, 0, 0, cv.width, cv.height);
    // os dois lutadores escolhidos, de pé no cenário
    if (ready(atlas)) {
      const ids = [settings.fighter, settings.opponent === 'auto' ? null : settings.opponent];
      ids.forEach((fid, i) => {
        const S = fid && SPR[fid];
        if (!S) return;
        const [sx, sy, sw, sh, ax, ay] = cycle(S.idle, 6, clock + i * 0.3);
        const s = (cv.height / 540) * 1.25 * ZOOM / AS;
        g.save();
        g.translate(cv.width * (i ? 0.66 : 0.34), cv.height * ((FLOOR - 40) / 540) + 40 * (cv.height / 540));
        g.scale(i ? -s : s, s);
        g.drawImage(i && fid === settings.fighter && altAtlas ? altAtlas : atlas, sx, sy, sw, sh, -ax, -ay, sw, sh);
        g.restore();
      });
    }
    if (flow.stageCursor === 'random') {
      g.fillStyle = 'rgba(16,13,32,0.45)';
      g.fillRect(0, 0, cv.width, cv.height);
      g.font = '900 120px Impact, "Arial Black", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#ffd94a';
      g.fillText('?', cv.width / 2, cv.height / 2);
    }
  }

  function confirmStage() {
    settings.stage = flow.stageCursor;
    saveSettings();
    Audio.play('confirm');
    openOptions();
  }

  // ---------- 3) dificuldade e regras ----------
  function openOptions() {
    setApp('options');
    refreshOptions();
  }

  function refreshOptions() {
    const versus = settings.mode === 'versus';
    setChecked('[data-difficulty]', 'difficulty', settings.difficulty);
    $$('[data-rounds]').forEach(b => b.setAttribute('aria-checked', String(Number(b.dataset.rounds) === settings.rounds)));
    $$('[data-time]').forEach(b => b.setAttribute('aria-checked', String(Number(b.dataset.time) === settings.roundTime)));
    $('#diffCards').classList.toggle('disabled', versus);
    $('#versusNote').hidden = !versus;
    $('#optionsTitle').textContent = versus ? 'REGRAS DA LUTA' : 'DIFICULDADE';
    const opp = settings.opponent === 'auto' ? 'ALEATÓRIO' : CHARS[settings.opponent].name;
    const stage = settings.stage === 'random' ? 'Cenário aleatório' : stageNames[settings.stage];
    $('#matchSummary').textContent = `${CHARS[settings.fighter].name} × ${opp} · ${stage}`;
  }

  // ---------- VS ----------
  let vsTimer = 0;
  function showVersus() {
    Audio.play('confirm');
    startMatch(true); // prepara a luta (lutadores, cenário) sem começar
    const [a, b] = fighters;
    const sides = [[$('.vs-left'), a], [$('.vs-right'), b]];
    for (const [el, f] of sides) {
      el.querySelector('.vs-name').textContent = CHARS[f.id].name;
      el.style.animation = 'none';
      void el.offsetWidth; // reinicia a animação de entrada
      el.style.animation = '';
    }
    $('#vsStage').textContent = stageNames[match.stage];
    setApp('vs');
    Audio.play('fight');
    clearTimeout(vsTimer);
    vsTimer = setTimeout(beginFight, 2300);
  }
  function drawVersus() {
    if (!fighters.length) return;
    drawBigFighter($('.vs-left canvas'), fighters[0].id, false);
    drawBigFighter($('.vs-right canvas'), fighters[1].id, true, fighters[1].alt);
  }
  function beginFight() {
    clearTimeout(vsTimer);
    if (app !== 'vs') return;
    setApp('fight');
    playFightMusic();
    if (matchMedia('(pointer: coarse)').matches) void enterFullscreen();
  }

  // ---------- navegação por teclado/controle ----------
  function moveCursor(dx, dy) {
    if (app === 'chars') {
      const ids = rosterIds().filter(id => {
        const tile = $(`#roster .tile[data-id="${id}"]`);
        return tile && !tile.disabled;
      });
      const cols = getComputedStyle($('#roster')).gridTemplateColumns.split(' ').length || 4;
      const all = rosterIds();
      let i = all.indexOf(flow.cursor);
      for (let n = 0; n < all.length; n++) {
        i = (i + dx + dy * cols + all.length) % all.length;
        if (ids.includes(all[i])) break;
      }
      flow.cursor = all[i];
      Audio.play('ui');
      refreshChars();
    } else if (app === 'stage') {
      const all = [...STAGE_IDS, 'random'];
      const i = all.indexOf(flow.stageCursor);
      flow.stageCursor = all[(i + dx + dy * 2 + all.length) % all.length];
      Audio.play('ui');
      refreshStageScreen();
    } else if (app === 'options') {
      if (settings.mode === 'versus') return;
      const all = ENUMS.difficulty;
      settings.difficulty = all[(all.indexOf(settings.difficulty) + dx + dy + all.length) % all.length];
      saveSettings();
      Audio.play('ui');
      refreshOptions();
    }
  }
  function flowConfirm() {
    if (app === 'chars') confirmChar();
    else if (app === 'stage') confirmStage();
    else if (app === 'options') showVersus();
  }
  function flowBack() {
    Audio.play('ui');
    if (app === 'chars') {
      if (flow.phase === 'p2') { flow.phase = 'p1'; flow.cursor = settings.fighter; refreshChars(); }
      else goSplash();
    } else if (app === 'stage') openChars('p2');
    else if (app === 'options') openStage();
  }
  function flowKey(event) {
    const map = {
      ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0],
      ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1]
    };
    if (map[event.code]) { event.preventDefault(); moveCursor(...map[event.code]); return true; }
    if (['Enter', 'Space', 'KeyJ', 'KeyF'].includes(event.code)) { event.preventDefault(); flowConfirm(); return true; }
    if (['Backspace', 'KeyK', 'KeyG'].includes(event.code)) { event.preventDefault(); flowBack(); return true; }
    return false;
  }

  // ---------- lista de golpes ----------
  function openMoveList() {
    const id = fighters[0] ? fighters[0].id : settings.fighter;
    const heavy = CHARS[id].heavyLabel.toLowerCase();
    const rows = [
      ['J', 'Soco'], ['K', heavy.charAt(0).toUpperCase() + heavy.slice(1)], ['I', 'Defesa (segure; só defende de frente)'],
      ['J J K', 'Combo básico (quando os golpes acertam)'], ['↑ + J/K', 'Golpe no ar'],
      ...PROFILE[id].moves
    ];
    $('#moveListTitle').textContent = `GOLPES — ${CHARS[id].name}`;
    $('#moveListItems').replaceChildren(...rows.map(([key, text]) => {
      const li = document.createElement('li');
      const k = document.createElement('kbd');
      k.textContent = key;
      li.append(k, text);
      return li;
    }));
    $('#moveList').hidden = false;
    $('#closeMoveList').focus({ preventScroll: true });
  }

  // ---------- ligações ----------
  buildRoster();
  buildStageList();
  $$('[data-mode]').forEach(b => b.addEventListener('click', () => {
    settings.mode = b.dataset.mode;
    saveSettings();
    Audio.play('ui');
    refreshChars();
  }));
  $$('[data-difficulty]').forEach(b => b.addEventListener('click', () => {
    if (settings.difficulty === b.dataset.difficulty && app === 'options') { showVersus(); return; }
    settings.difficulty = b.dataset.difficulty;
    saveSettings();
    Audio.play('ui');
    refreshOptions();
  }));
  $$('[data-rounds]').forEach(b => b.addEventListener('click', () => {
    settings.rounds = Number(b.dataset.rounds);
    saveSettings(); Audio.play('ui'); refreshOptions();
  }));
  $$('[data-time]').forEach(b => b.addEventListener('click', () => {
    settings.roundTime = Number(b.dataset.time);
    saveSettings(); Audio.play('ui'); refreshOptions();
  }));
  $$('.flow-back').forEach(b => b.addEventListener('click', flowBack));
  $('#charConfirm').addEventListener('click', confirmChar);
  $('#stageConfirm').addEventListener('click', confirmStage);
  $('#fightStart').addEventListener('click', showVersus);
  $('#vsScreen').addEventListener('click', beginFight);
  $('#closeMoveList').addEventListener('click', () => { $('#moveList').hidden = true; $('#pauseMoves').focus({ preventScroll: true }); });
  $('#pauseMoves').addEventListener('click', openMoveList);

  if (!available(settings.fighter)) settings.fighter = 'juraci';
  if (settings.opponent !== 'auto' && !available(settings.opponent)) settings.opponent = 'auto';


  // ======================================================================
  // Diálogos do menu
  // ======================================================================
  function openMenuDialog(title, message, withSettings = false) {
    dialogReturnFocus = document.activeElement;
    $('#menuDialogTitle').textContent = title;
    $('#menuDialogText').textContent = message;
    $('#menuDialogText').hidden = !message;
    $('#settingsPanel').hidden = !withSettings;
    $('#setSound').checked = settings.sound;
    $('#setMusic').checked = settings.music;
    $('#setFightMusic').value = settings.fightMusic;
    $('#setVoice').checked = settings.voice;
    $('#setTalk').checked = settings.talk;
    $('#setVolume').value = String(settings.volume);
    $('#setVibration').checked = settings.vibration;
    $('#setTouch').value = settings.touch;
    $('#menuDialog').hidden = false;
    $('#closeMenuDialog').focus({ preventScroll: true });
    $('#menuDialog .dialog-panel').scrollTop = 0;
    $('#menuDialog').scrollTop = 0;
  }
  function closeMenuDialog() {
    $('#menuDialog').hidden = true;
    updateOverlays();
    if (dialogReturnFocus instanceof HTMLElement) dialogReturnFocus.focus({ preventScroll: true });
  }

  $('#setSound').addEventListener('change', e => { settings.sound = e.currentTarget.checked; saveSettings(); Audio.play('ui'); });
  $('#setMusic').addEventListener('change', e => {
    settings.music = e.currentTarget.checked;
    saveSettings();
    if (settings.music) {
      if (app === 'fight' && match) playFightMusic(); else Audio.startMusic('theme');
      if (app === 'fight' && paused) Audio.pauseMusic(true);
    }
  });
  $('#setFightMusic').addEventListener('change', e => {
    if (!ENUMS.fightMusic.includes(e.currentTarget.value)) return;
    settings.fightMusic = e.currentTarget.value;
    saveSettings();
    if (settings.music && app === 'fight' && match) {
      playFightMusic();
      if (paused) Audio.pauseMusic(true);
    }
  });
  $('#setVolume').addEventListener('input', e => { settings.volume = clamp(Number(e.currentTarget.value), 0, 1); saveSettings(); });
  $('#setVolume').addEventListener('change', () => Audio.play('ui'));
  $('#setVibration').addEventListener('change', e => { settings.vibration = e.currentTarget.checked; saveSettings(); });
  $('#setTalk').addEventListener('change', e => { settings.talk = e.currentTarget.checked; saveSettings(); });
  $('#setVoice').addEventListener('change', e => {
    settings.voice = e.currentTarget.checked;
    saveSettings();
    if (settings.voice) Audio.speak('Olá, família!', 'juraci');
  });
  $('#setTouch').addEventListener('change', e => {
    if (ENUMS.touch.includes(e.currentTarget.value)) settings.touch = e.currentTarget.value;
    saveSettings();
    updateOverlays();
  });

  const SETTINGS_TEXT = '';
  $('#splashStart').addEventListener('click', () => {
    Audio.unlock();
    Audio.play('confirm');
    Audio.startMusic('theme');
    openChars('p1');
  });
  $('#menuSettings').addEventListener('click', () => openMenuDialog('CONFIGURAÇÕES', SETTINGS_TEXT, true));
  $('#pauseSettings').addEventListener('click', () => openMenuDialog('CONFIGURAÇÕES', SETTINGS_TEXT, true));
  $('#menuCredits').addEventListener('click', () => openMenuDialog('CRÉDITOS',
    'Família Fighter é um projeto de Carlos, inspirado em sua família: Juraci, Carlos, Pedro, Daniel, Franciely e Gabi. Músicas: "Bolo da Juraci" e "Family Fighter". Voz real: Franciely. Efeitos sonoros sintetizados pelo próprio navegador.'));
  $('#menuExit').addEventListener('click', () => openMenuDialog('ATÉ A PRÓXIMA!',
    'Para sair, feche esta aba ou o aplicativo. O navegador não permite que o jogo feche a tela sozinho.'));
  $('#closeMenuDialog').addEventListener('click', closeMenuDialog);
  $('#replay').addEventListener('click', startMatch);
  $('#toSelect').addEventListener('click', () => { Audio.startMusic('theme'); openChars('p1'); });
  $('#toStage').addEventListener('click', () => { Audio.startMusic('theme'); openStage(); });
  $('#toMenu').addEventListener('click', goSplash);
  $('#resume').addEventListener('click', resumeGame);
  $('#restartFight').addEventListener('click', startMatch);
  $('#pauseMenu').addEventListener('click', goSplash);
  ui.pauseButton.addEventListener('click', pauseGame);
  $('#fullscreenButton').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else void enterFullscreen();
  });
  if (!document.documentElement.requestFullscreen) $('#fullscreenButton').hidden = true;

  $('#installApp').addEventListener('click', async () => {
    if (!installPrompt) return;
    try {
      await installPrompt.prompt();
      await installPrompt.userChoice;
    } catch (error) {
      console.error('Não foi possível iniciar a instalação.', error);
    } finally {
      installPrompt = null;
      $('#installApp').hidden = true;
    }
  });
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    $('#installApp').hidden = false;
  });
  window.addEventListener('appinstalled', () => { installPrompt = null; $('#installApp').hidden = true; });

  window.addEventListener('touchstart', () => {
    if (!touchSeen) { touchSeen = true; updateOverlays(); }
  }, { passive: true, once: true });
  window.addEventListener('blur', () => { clearInputs(); pauseGame(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
  window.addEventListener('resize', queueResize);
  window.addEventListener('orientationchange', queueResize);
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  canvas.addEventListener('pointerdown', () => {
    if (app === 'fight' && !paused && match && match.sub === 'talk') match.skipTalk = true;
  });

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register('./sw.js').catch(error => console.error('Modo offline indisponível.', error));
  }

  // Gancho de testes: só existe rodando em localhost com #debug na URL.
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && location.hash === '#debug') {
    window.__ff = {
      state: () => ({ app, sub: match && match.sub, fighters: fighters.map(f => ({ id: f.id, state: f.state, form: f.form, hp: Math.round(f.hp), meter: f.meter })), cameos: cameos.map(c => c.kind), projectiles: projectiles.map(p => p.sprite) }),
      meter: (slot, value) => { if (fighters[slot]) fighters[slot].meter = value; },
      special: (slot, alt) => { if (fighters[slot]) { fighters[slot].held.down = Boolean(alt); trySpecial(fighters[slot], Boolean(alt)); } },
      cameo: (kind, slot) => spawnCameo(kind, fighters[slot || 0]),
      event: slot => praiaEvent(fighters[slot || 0]),
      ko: slot => { const f = fighters[slot]; if (f) { f.hp = 1; } },
      music: () => Audio.debugMusic && Audio.debugMusic(),
      zoom: () => ({ ZOOM, worldW, camTop, viewW })
    };
  }
  resize();
  updateOverlays();
  requestAnimationFrame(frame);
})();
