// Zombie Typer (좀비 타이퍼) - 강화 버전
// 기능: 콤보 보너스, 난이도별 단어, 체력 회복, 하이스코어 이펙트, 사운드 토글, 요약 정보 등

const gameArea = document.getElementById("gameArea");
const typeInput = document.getElementById("typeInput");
const scoreEl = document.getElementById("score");
const highScoreEl = document.getElementById("highScore");
const streakEl = document.getElementById("streak");
const livesEl = document.getElementById("lives");
const targetInfoEl = document.getElementElementById ? document.getElementById("targetInfo") : document.querySelector("#targetInfo");

const startBtn = document.getElementById("startBtn");
const pauseBtn = document.getElementById("pauseBtn");
const difficultySelect = document.getElementById("difficultySelect");
const soundToggleBtn = document.getElementById("soundToggle");

const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlayTitle");
const overlayMessage = document.getElementById("overlayMessage");
const restartBtn = document.getElementById("restartBtn");
const toastEl = document.getElementById("toast");

// 난이도별 한글 단어들
const easyWords = [
  "고양이","강아지","태양","달","별",
  "빨강","파랑","초록","새","물고기",
  "나무","책","코드","게임","놀기",
  "위","아래","왼쪽","오른쪽","문","집","방","불","비","눈"
];

const normalWords = [
  "달리기","걷기","점프","빠름","느림",
  "좋음","나쁨","열쇠","지도","바람","바다",
  "사과","포도","바나나","토마토","포탈","마법","좀비","코더"
];

const hardWords = [
  "타이핑연습","집중공격","난이도상승","연속타자","최고기록",
  "데드라인","시간압박","정확도체크","방어선유지","위기상황"
];

function getDifficultyMultiplier(diff) {
  // 난이도 차이를 더 극적으로 만들기 위한 배율
  // Easy는 매우 완만, Hard는 공격적으로 상승
  if (diff === "easy") return 0.4;
  if (diff === "hard") return 2.8;
  return 1; // normal
}

const state = {
  running: false,
  paused: false,
  zombies: [],
  score: 0,
  highScore: 0,
  streak: 0,
  maxStreak: 0,
  lives: 3,
  baseSpawnInterval: 2600,
  baseZombieSpeed: 150,
  spawnInterval: 2600,
  zombieSpeed: 150,
  difficultyMultiplier: 1,
  lastSpawnTime: 0,
  lastFrameTime: 0,
  startTime: 0,
  pauseStartedAt: null,
  rafId: null,
  wrongInputStreak: 0
};

let soundEnabled = true;
let audioCtx = null;
let toastTimer = null;

function getAudioCtx() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
  }
  return audioCtx;
}

function playSound(type) {
  if (!soundEnabled) return;
  const ctx = getAudioCtx();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  const now = ctx.currentTime;
  let freq = 440;

  switch (type) {
    case "spawn":
      freq = 260;
      break;
    case "kill":
      freq = 520;
      break;
    case "hit":
      freq = 180;
      break;
    case "wrong":
      freq = 150;
      break;
    case "life":
      freq = 600;
      break;
    case "record":
      freq = 700;
      break;
  }

  osc.frequency.setValueAtTime(freq, now);
  gain.gain.setValueAtTime(0.001, now);
  gain.gain.exponentialRampToValueAtTime(0.3, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

  osc.start(now);
  osc.stop(now + 0.2);
}

function updateSoundButton() {
  if (soundEnabled) {
    soundToggleBtn.textContent = "🔊 사운드 ON";
    soundToggleBtn.classList.remove("muted");
  } else {
    soundToggleBtn.textContent = "🔇 사운드 OFF";
    soundToggleBtn.classList.add("muted");
  }
}

function showToast(message) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove("show");
  }, 1400);
}

function flashGameArea(type) {
  if (!gameArea) return;
  const layer = document.createElement("div");
  layer.className = "flash-layer " + (type === "kill" ? "flash-kill" : type === "damage" ? "flash-damage" : "flash-heal");
  gameArea.appendChild(layer);
  requestAnimationFrame(() => {
    layer.classList.add("show");
  });
  setTimeout(() => {
    layer.classList.remove("show");
    if (layer.parentNode) {
      layer.parentNode.removeChild(layer);
    }
  }, 200);
}

function resetState() {
  state.zombies.forEach(z => {
    if (z.el && z.el.parentNode) {
      z.el.parentNode.removeChild(z.el);
    }
  });
  state.zombies = [];
  state.score = 0;
  state.streak = 0;
  state.maxStreak = 0;
  state.lives = 3;
  state.lastSpawnTime = 0;
  state.lastFrameTime = 0;
  state.startTime = 0;
  state.pauseStartedAt = null;
  state.wrongInputStreak = 0;

  scoreEl.textContent = "0";
  streakEl.textContent = "0";
  livesEl.textContent = "❤❤❤";
  highScoreEl.textContent = String(state.highScore);
  if (targetInfoEl) {
    targetInfoEl.textContent = "가장 가까운 좀비의 단어를 보고 정확히 입력해 보세요.";
  }
}

function applyDifficulty() {
  const diff = difficultySelect.value;
  state.difficultyMultiplier = getDifficultyMultiplier(diff);

  // 난이도별 기본 속도 / 스폰 주기 차이
  if (diff === "easy") {
    state.baseSpawnInterval = 3400; // 좀 더 넉넉하게
    state.baseZombieSpeed = 110;    // 매우 느리게 시작
  } else if (diff === "hard") {
    state.baseSpawnInterval = 1900; // 시작부터 자주 등장
    state.baseZombieSpeed = 210;    // 시작 속도도 빠르게
  } else {
    // normal
    state.baseSpawnInterval = 2600;
    state.baseZombieSpeed = 150;
  }

  state.spawnInterval = state.baseSpawnInterval;
  state.zombieSpeed = state.baseZombieSpeed;
}

function updateScore() {
  const prevHigh = state.highScore;
  scoreEl.textContent = String(state.score);
  if (state.score > state.highScore) {
    state.highScore = state.score;
    highScoreEl.textContent = String(state.highScore);
    try {
      localStorage.setItem("zombieCoderHighScore", String(state.highScore));
    } catch (e) {
      // 저장 실패는 무시
    }
    if (state.highScore > prevHigh) {
      scoreEl.classList.add("highlight");
      highScoreEl.classList.add("highlight");
      playSound("record");
      showToast("NEW RECORD!");
      setTimeout(() => {
        scoreEl.classList.remove("highlight");
        highScoreEl.classList.remove("highlight");
      }, 800);
    }
  }
}

function updateStreak() {
  streakEl.textContent = String(state.streak);
}

function updateLives() {
  livesEl.textContent = "❤".repeat(state.lives);
}

function updateDynamicDifficulty(timestamp) {
  if (!state.startTime) return;
  const elapsedSec = (timestamp - state.startTime) / 1000;

  const diff = difficultySelect.value;

  // 시간 / 점수의 영향 비율을 난이도마다 다르게
  let timeDiv;
  if (diff === "easy") timeDiv = 32;       // 천천히 올라감
  else if (diff === "hard") timeDiv = 18;  // 빠르게 올라감
  else timeDiv = 24;

  const timeFactor  = elapsedSec / timeDiv;
  const scoreFactor = state.score / 120;
  const baseFactor  = timeFactor + scoreFactor;

  const factor = baseFactor * state.difficultyMultiplier;

  const baseSpeed = state.baseZombieSpeed;
  const maxSpeed  = 360;
  state.zombieSpeed = Math.min(baseSpeed + factor * 45, maxSpeed);

  const baseSpawn = state.baseSpawnInterval;
  let minSpawn;
  if (diff === "easy") minSpawn = 1500;      // Easy는 간격이 꽤 넉넉
  else if (diff === "hard") minSpawn = 600;  // Hard는 굉장히 촘촘
  else minSpawn = 900;

  state.spawnInterval = Math.max(baseSpawn - factor * 260, minSpawn);
}

function getWordForSpawn(timestamp) {
  const diff = difficultySelect.value;
  let factor = 0;
  if (state.startTime) {
    const elapsedSec = (timestamp - state.startTime) / 1000;
    const scoreFactor = state.score / 80;
    // 난이도 배율까지 포함해서 단어 난이도도 공격적으로 조절
    factor = (elapsedSec / 28 + scoreFactor) * state.difficultyMultiplier;
  }

  let pool;
  if (diff === "easy") {
    // Easy: 거의 대부분 짧고 쉬운 단어, 후반에만 살짝 Normal 섞기
    if (factor < 1.5) {
      pool = easyWords;
    } else if (factor < 3) {
      pool = easyWords.concat(easyWords, normalWords);
    } else {
      pool = easyWords.concat(normalWords);
    }
  } else if (diff === "normal") {
    // Normal: 초반 easy+normal, 중반부터 normal 비중↑, 후반에 hard 섞기
    if (factor < 1) {
      pool = easyWords.concat(normalWords);
    } else if (factor < 2.5) {
      pool = easyWords.concat(normalWords, normalWords);
    } else if (factor < 4) {
      pool = normalWords.concat(normalWords, hardWords);
    } else {
      pool = normalWords.concat(hardWords, hardWords);
    }
  } else { // hard
    // Hard: 초반부터 normal+hard, 금방 hard 위주로 전환
    if (factor < 0.8) {
      pool = easyWords.concat(normalWords, hardWords);
    } else if (factor < 2) {
      pool = normalWords.concat(normalWords, hardWords);
    } else {
      pool = hardWords.concat(hardWords, normalWords);
    }
  }

  const idx = Math.floor(Math.random() * pool.length);
  return pool[idx];
}

function spawnZombie(timestamp) {
  const word = getWordForSpawn(timestamp);

  const el = document.createElement("div");
  el.className = "zombie";

  const emojiEl = document.createElement("div");
  emojiEl.className = "zombie-emoji";
  emojiEl.textContent = "🧟‍♂️";

  const wordEl = document.createElement("div");
  wordEl.className = "zombie-word";
  wordEl.textContent = word;

  el.appendChild(emojiEl);
  el.appendChild(wordEl);

  const gameWidth = gameArea.clientWidth || 600;
  const spawnX = gameWidth + 60;

  const zombie = {
    id: timestamp + Math.random(),
    word,
    el,
    x: spawnX
  };

  el.style.left = spawnX + "px";
  gameArea.appendChild(el);
  state.zombies.push(zombie);
  state.lastSpawnTime = timestamp;

  updateTargetHint();
  playSound("spawn");
}

function getFrontZombie() {
  if (state.zombies.length === 0) return null;
  return state.zombies.reduce((front, z) => (z.x < front.x ? z : front), state.zombies[0]);
}

function getMatchingZombieExact(input) {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const candidates = state.zombies.filter(z => z.word === trimmed);
  if (candidates.length === 0) return null;
  return candidates.reduce((front, z) => (z.x < front.x ? z : front), candidates[0]);
}

function getMatchingZombiePrefix(input) {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const candidates = state.zombies.filter(z => z.word.startsWith(trimmed));
  if (candidates.length === 0) return null;
  return candidates.reduce((front, z) => (z.x < front.x ? z : front), candidates[0]);
}

function updateTargetHint() {
  const front = getFrontZombie();
  if (!targetInfoEl) return;
  if (!front) {
    targetInfoEl.textContent = "새로운 좀비를 기다리는 중...";
  } else {
    targetInfoEl.textContent = `가장 가까운 좀비 단어: "${front.word}"`;
  }
}

function maybeHealOnStreak() {
  if (state.streak > 0 && state.streak % 20 === 0 && state.lives < 3) {
    state.lives += 1;
    updateLives();
    flashGameArea("heal");
    playSound("life");
  }
}

function killZombie(zombie) {
  zombie.el.classList.add("dead");
  setTimeout(() => {
    if (zombie.el && zombie.el.parentNode) {
      zombie.el.parentNode.removeChild(zombie.el);
    }
  }, 280);
  state.zombies = state.zombies.filter(z => z.id !== zombie.id);
  state.score += 10;

  state.streak += 1;
  if (state.streak > state.maxStreak) {
    state.maxStreak = state.streak;
  }
  state.wrongInputStreak = 0;

  updateScore();
  updateStreak();
  maybeHealOnStreak();
  updateTargetHint();
  flashGameArea("kill");
  playSound("kill");
}

function missZombie(zombie) {
  if (zombie.el && zombie.el.parentNode) {
    zombie.el.parentNode.removeChild(zombie.el);
  }
  state.zombies = state.zombies.filter(z => z.id !== zombie.id);
  state.lives -= 1;
  state.streak = 0;
  state.wrongInputStreak = 0;
  updateLives();
  updateStreak();
  updateTargetHint();

  gameArea.classList.add("shake");
  flashGameArea("damage");
  playSound("hit");
  setTimeout(() => gameArea.classList.remove("shake"), 400);

  if (state.lives <= 0) {
    endGame(false);
  }
}

function loop(timestamp) {
  if (!state.running || state.paused) return;

  if (!state.startTime) {
    state.startTime = timestamp;
    state.lastFrameTime = timestamp;
    state.lastSpawnTime = timestamp;
    spawnZombie(timestamp);
  }

  updateDynamicDifficulty(timestamp);

  const delta = timestamp - state.lastFrameTime;
  state.lastFrameTime = timestamp;

  const moveDist = (state.zombieSpeed * delta) / 1000;
  state.zombies.forEach(z => {
    z.x -= moveDist;
    z.el.style.left = z.x + "px";
  });

  const out = state.zombies.filter(z => z.x < -60);
  out.forEach(z => missZombie(z));

  if (timestamp - state.lastSpawnTime >= state.spawnInterval) {
    spawnZombie(timestamp);
  }

  state.rafId = requestAnimationFrame(loop);
}

function startGame() {
  if (state.rafId) {
    cancelAnimationFrame(state.rafId);
    state.rafId = null;
  }
  resetState();
  applyDifficulty();

  state.running = true;
  state.paused = false;
  state.startTime = 0;
  state.lastFrameTime = 0;
  state.lastSpawnTime = 0;
  state.pauseStartedAt = null;

  overlay.classList.add("hidden");
  startBtn.textContent = "⏹ 게임 재시작";
  pauseBtn.disabled = false;
  pauseBtn.textContent = "일시정지";

  typeInput.disabled = false;
  typeInput.value = "";
  typeInput.classList.remove("error", "shake");
  typeInput.focus();

  state.rafId = requestAnimationFrame(loop);
}

function togglePause() {
  if (!state.running) return;

  if (!state.paused) {
    state.paused = true;
    state.pauseStartedAt = performance.now();
    if (state.rafId) {
      cancelAnimationFrame(state.rafId);
      state.rafId = null;
    }
    typeInput.disabled = true;
    typeInput.blur();
    pauseBtn.textContent = "재개";
  } else {
    state.paused = false;
    const resumeTime = performance.now();
    if (state.pauseStartedAt != null && state.startTime !== 0) {
      const pausedDuration = resumeTime - state.pauseStartedAt;
      state.startTime += pausedDuration;
      state.lastFrameTime += pausedDuration;
      state.lastSpawnTime += pausedDuration;
    }
    state.pauseStartedAt = null;
    pauseBtn.textContent = "일시정지";
    typeInput.disabled = false;
    typeInput.focus();
    state.rafId = requestAnimationFrame(loop);
  }
}


function difficultyLabel() {
  const diff = difficultySelect.value;
  if (diff === "easy") return "Easy";
  if (diff === "hard") return "Hard";
  return "Normal";
}

function endGame(cleared) {
  state.running = false;
  state.paused = false;
  if (state.rafId) {
    cancelAnimationFrame(state.rafId);
    state.rafId = null;
  }

  let elapsedSec = 0;
  if (state.startTime) {
    const now = performance.now();
    elapsedSec = Math.max(0, Math.round((now - state.startTime) / 1000));
  }

  overlayTitle.textContent = cleared ? "Stage Clear!" : "Game Over";
  overlayMessage.textContent =
    `플레이 시간: ${elapsedSec}초\n` +
    `최종 점수: ${state.score}\n` +
    `최고 콤보: ${state.maxStreak}\n` +
    `High Score: ${state.highScore}\n` +
    `난이도: ${difficultyLabel()}`;
  overlay.classList.remove("hidden");
  pauseBtn.disabled = true;
}

let inputErrorTimer = null;

typeInput.addEventListener("input", () => {
  if (!state.running || state.paused) return;

  const value = typeInput.value;
  const trimmed = value.trim();
  if (!trimmed) {
    typeInput.classList.remove("error", "shake");
    return;
  }

  const target = getMatchingZombiePrefix(trimmed);
  if (!target) {
    typeInput.classList.add("error");
  } else {
    typeInput.classList.remove("error");
  }
});

typeInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    if (!state.running || state.paused) return;

    const trimmed = typeInput.value.trim();
    if (!trimmed) return;

    const target = getMatchingZombieExact(trimmed);
    if (!target) {
      typeInput.classList.add("error", "shake");
      typeInput.value = "";
      state.wrongInputStreak += 1;
      playSound("wrong");

      if (inputErrorTimer) clearTimeout(inputErrorTimer);
      inputErrorTimer = setTimeout(() => {
        typeInput.classList.remove("error", "shake");
      }, 400);

      if (state.wrongInputStreak >= 3) {
        state.streak = 0;
        updateStreak();
        gameArea.classList.add("shake");
        flashGameArea("damage");
        setTimeout(() => gameArea.classList.remove("shake"), 400);
        state.wrongInputStreak = 0;
      }
      return;
    }

    killZombie(target);
    typeInput.value = "";
    typeInput.classList.remove("error", "shake");
  }
});

gameArea.addEventListener("click", () => {
  if (!state.running) return;
  typeInput.focus();
});

startBtn.addEventListener("click", () => {
  startGame();
});

pauseBtn.addEventListener("click", () => {
  togglePause();
});

difficultySelect.addEventListener("change", () => {
  startGame();
});

restartBtn.addEventListener("click", () => {
  startGame();
});

soundToggleBtn.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  try {
    localStorage.setItem("zombieCoderSound", soundEnabled ? "on" : "off");
  } catch (e) {
    // ignore
  }
  updateSoundButton();
});

window.addEventListener("blur", () => {
  if (state.running && !state.paused) {
    togglePause();
  }
});

window.addEventListener("resize", () => {
  updateTargetHint();
});

document.addEventListener("DOMContentLoaded", () => {
  typeInput.value = "";
  applyDifficulty();
  try {
    const stored = localStorage.getItem("zombieCoderHighScore");
    if (stored) {
      state.highScore = parseInt(stored, 10) || 0;
    }
  } catch (e) {
    state.highScore = 0;
  }
  try {
    const soundPref = localStorage.getItem("zombieCoderSound");
    if (soundPref === "off") {
      soundEnabled = false;
    }
  } catch (e) {
    soundEnabled = true;
  }
  highScoreEl.textContent = String(state.highScore);
  updateSoundButton();
});
