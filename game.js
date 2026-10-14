const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const scoreValue = document.getElementById('score');
const levelValue = document.getElementById('level');
const progressFill = document.getElementById('level-progress');
const startScreen = document.getElementById('start-screen');
const pausedScreen = document.getElementById('paused-screen');
const gameOverScreen = document.getElementById('game-over');
const finalScore = document.getElementById('final-score');
const startButton = document.getElementById('start-button');
const restartButton = document.getElementById('restart-button');
const resumeButton = document.getElementById('resume-button');
const pauseButton = document.getElementById('pause-button');
const resetButton = document.getElementById('reset-button');
const menuButton = document.getElementById('menu-button');
const gameMenuButton = document.getElementById('game-menu-button');
const fireButton = document.getElementById('fire-button');

const DESIGN_SIZE = 600;
const LEVEL_COUNT = 15;
const POINTS_PER_LEVEL = 4;
const BASE_ENEMY_SPEED = 2;
const ENEMY_SPEED_STEP = 0.3;
const BASE_ENEMY_RADIUS = 16;
const ENEMY_RADIUS_STEP = -0.35;
const MIN_ENEMY_RADIUS = 8;
const BASE_BULLET_SPEED = 10;
const BULLET_SPEED_STEP = 0.1;
const BASE_PLAYER_SPEED = 6;
const PLAYER_SPEED_STEP = 0.08;
const FIXED_STEP = 1 / 60;
const MAX_ENEMIES = 64;

const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = DESIGN_SIZE * pixelRatio;
canvas.height = DESIGN_SIZE * pixelRatio;
ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

const stars = Array.from({ length: 70 }, (_, index) => ({
    x: (index * 137.5 + 29) % DESIGN_SIZE,
    y: (index * 83.7 + 17) % DESIGN_SIZE,
    radius: index % 9 === 0 ? 1.5 : 0.8,
    alpha: 0.18 + (index % 5) * 0.08,
}));

const player = {
    x: DESIGN_SIZE / 2,
    y: DESIGN_SIZE - 50,
    width: 30,
    height: 30,
    speed: BASE_PLAYER_SPEED,
};
const bullet = {
    x: 0,
    y: 0,
    width: 7,
    height: 14,
    speed: BASE_BULLET_SPEED + 2,
    active: false,
};

let enemies = [];
let score = 0;
let level = 1;
let gameStarted = false;
let gameOver = false;
let paused = false;
let leftPressed = false;
let rightPressed = false;
let fireHeld = false;
let autoFireTimer = null;
let dragPointer = null;
let dragOffset = 0;
let previousTime = 0;
let accumulator = 0;
let audioContext = null;
let musicGain = null;
let musicTimer = null;
let melodyIndex = 0;

const melody = [330, 392, 440, 392, 330, 294, 262, 294];
const rhythm = [0.28, 0.28, 0.28, 0.28, 0.28, 0.28, 0.28, 0.4];

function setButtonState(button, pressed) {
    button.classList.toggle('active', pressed);
}

function initializeAudio() {
    if (audioContext) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    try {
        audioContext = new AudioContextClass();
        musicGain = audioContext.createGain();
        musicGain.gain.value = 0.24;
        musicGain.connect(audioContext.destination);
    } catch {
        audioContext = null;
        musicGain = null;
    }
}

function playMusicStep() {
    if (!audioContext || !musicGain || audioContext.state !== 'running' || !gameStarted || paused || gameOver) {
        musicTimer = null;
        return;
    }
    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const noteGain = audioContext.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(melody[melodyIndex], now);
    noteGain.gain.setValueAtTime(0.14, now);
    noteGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    oscillator.connect(noteGain).connect(musicGain);
    oscillator.start(now);
    oscillator.stop(now + 0.24);
    melodyIndex = (melodyIndex + 1) % melody.length;
    musicTimer = window.setTimeout(playMusicStep, rhythm[melodyIndex] * 1000);
}

function startMusic() {
    if (!audioContext || musicTimer !== null || !gameStarted || paused || gameOver) return;
    if (audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
            if (musicTimer === -1) {
                musicTimer = null;
                playMusicStep();
            }
        }).catch(() => {});
        musicTimer = -1;
        return;
    }
    playMusicStep();
}

function stopMusic() {
    if (musicTimer === null) return;
    if (musicTimer !== -1) window.clearTimeout(musicTimer);
    musicTimer = null;
}

function unlockAudio() {
    initializeAudio();
    if (!audioContext) return;
    if (audioContext.state === 'suspended') {
        audioContext.resume().then(startMusic).catch(() => {});
    } else {
        startMusic();
    }
}

function playSound(frequency, duration, type = 'sine', volume = 0.16) {
    if (!audioContext || audioContext.state !== 'running') return;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
}

function playLevelUpSound() {
    playSound(520, 0.12, 'triangle', 0.16);
    window.setTimeout(() => playSound(660, 0.1, 'triangle', 0.14), 110);
}

function playDeathSound() {
    playSound(120, 0.35, 'sawtooth', 0.22);
    window.setTimeout(() => playSound(90, 0.2, 'square', 0.12), 120);
}

function createEnemy(levelNumber) {
    const radius = Math.max(MIN_ENEMY_RADIUS, BASE_ENEMY_RADIUS + (levelNumber - 1) * ENEMY_RADIUS_STEP);
    return {
        x: Math.random() * (DESIGN_SIZE - radius * 2) + radius,
        y: -radius - Math.random() * 120,
        radius,
        speed: BASE_ENEMY_SPEED + (levelNumber - 1) * ENEMY_SPEED_STEP,
    };
}

function spawnEnemies(levelNumber) {
    enemies = [];
    for (let index = 0; index < 5; index += 1) {
        enemies.push(createEnemy(levelNumber));
    }
}

function updateHud() {
    scoreValue.textContent = String(score);
    levelValue.textContent = `${level} / ${LEVEL_COUNT}`;
    progressFill.style.width = `${(score % POINTS_PER_LEVEL) / POINTS_PER_LEVEL * 100}%`;
}

function resetGame() {
    gameStarted = true;
    gameOver = false;
    paused = false;
    leftPressed = false;
    rightPressed = false;
    stopAutoFire();
    score = 0;
    level = 1;
    player.x = DESIGN_SIZE / 2;
    player.y = DESIGN_SIZE - 50;
    player.width = 30;
    player.height = 30;
    player.speed = BASE_PLAYER_SPEED;
    bullet.active = false;
    bullet.x = 0;
    bullet.y = 0;
    bullet.width = 7;
    bullet.height = 14;
    bullet.speed = BASE_BULLET_SPEED + 2;
    spawnEnemies(level);
    startScreen.hidden = true;
    pausedScreen.hidden = true;
    gameOverScreen.hidden = true;
    setPauseButton(false);
    previousTime = 0;
    accumulator = 0;
    updateHud();
    unlockAudio();
}

function showMenu() {
    gameStarted = false;
    gameOver = false;
    paused = false;
    leftPressed = false;
    rightPressed = false;
    stopAutoFire();
    stopMusic();
    startScreen.hidden = false;
    pausedScreen.hidden = true;
    gameOverScreen.hidden = true;
    setPauseButton(false);
}

function setPauseButton(isPaused) {
    pauseButton.textContent = isPaused ? 'Resume' : 'Pause';
    pauseButton.setAttribute('aria-label', isPaused ? 'Resume game' : 'Pause game');
    pauseButton.setAttribute('aria-pressed', String(isPaused));
    setButtonState(pauseButton, isPaused);
}

function setPaused(nextPaused) {
    if (!gameStarted || gameOver) return;
    paused = nextPaused;
    leftPressed = false;
    rightPressed = false;
    dragPointer = null;
    stopAutoFire();
    pausedScreen.hidden = !paused;
    setPauseButton(paused);
    previousTime = 0;
    accumulator = 0;
    if (paused) stopMusic();
    else startMusic();
}

function togglePause() {
    setPaused(!paused);
}

function startAutoFire() {
    if (!gameStarted || paused || gameOver) return;
    fireHeld = true;
    if (autoFireTimer !== null) return;
    const tick = () => {
        if (!fireHeld || !gameStarted || paused || gameOver) {
            autoFireTimer = null;
            return;
        }
        fireBullet();
        autoFireTimer = window.setTimeout(tick, 70);
    };
    tick();
}

function stopAutoFire() {
    fireHeld = false;
    if (autoFireTimer !== null) {
        window.clearTimeout(autoFireTimer);
        autoFireTimer = null;
    }
}

function fireBullet() {
    if (!gameStarted || paused || gameOver || bullet.active) return;
    bullet.active = true;
    bullet.x = player.x;
    bullet.y = player.y - player.height / 2 - bullet.height / 2 - 4;
}

function updateDifficulty() {
    const nextLevel = Math.min(LEVEL_COUNT, Math.floor(score / POINTS_PER_LEVEL) + 1);
    if (nextLevel !== level) {
        level = nextLevel;
        playLevelUpSound();
        spawnEnemies(level);
    }

    for (const enemy of enemies) {
        enemy.speed = BASE_ENEMY_SPEED + (level - 1) * ENEMY_SPEED_STEP;
        enemy.radius = Math.max(MIN_ENEMY_RADIUS, BASE_ENEMY_RADIUS + (level - 1) * ENEMY_RADIUS_STEP);
    }
    bullet.speed = BASE_BULLET_SPEED + (level - 1) * BULLET_SPEED_STEP;
    player.speed = BASE_PLAYER_SPEED + (level - 1) * PLAYER_SPEED_STEP;
    updateHud();
}

function update() {
    if (!gameStarted || paused || gameOver) return;

    if (leftPressed) player.x -= player.speed;
    if (rightPressed) player.x += player.speed;
    player.x = Math.max(player.width / 2, Math.min(DESIGN_SIZE - player.width / 2, player.x));

    if (bullet.active) {
        bullet.y -= bullet.speed;
        if (bullet.y + bullet.height / 2 < 0) bullet.active = false;
    }

    for (const enemy of enemies) {
        enemy.y += enemy.speed;
        if (enemy.y - enemy.radius > DESIGN_SIZE) {
            enemy.y = -enemy.radius;
            enemy.x = Math.random() * (DESIGN_SIZE - enemy.radius * 2) + enemy.radius;
        }
    }

    const hitEnemyIndex = enemies.findIndex((enemy) => bullet.active &&
        Math.hypot(bullet.x - enemy.x, bullet.y - enemy.y) < enemy.radius + bullet.width / 2);
    if (hitEnemyIndex !== -1) {
        score += 1;
        bullet.active = false;
        enemies.splice(hitEnemyIndex, 1);
        updateDifficulty();
    }

    if (enemies.some((enemy) =>
        Math.hypot(player.x - enemy.x, player.y - enemy.y) < enemy.radius + player.width / 2)) {
        finishGame();
    }
}

function finishGame() {
    if (gameOver) return;
    gameOver = true;
    leftPressed = false;
    rightPressed = false;
    stopAutoFire();
    stopMusic();
    playDeathSound();
    pausedScreen.hidden = true;
    finalScore.textContent = `Final score: ${score} · Level ${level}`;
    gameOverScreen.hidden = false;
}

function drawPlayer() {
    const scale = Math.max(1, player.width / 30);
    const x = player.x;
    const y = player.y;
    ctx.fillStyle = '#68e6ff';
    ctx.beginPath();
    ctx.moveTo(x, y - 18 * scale);
    ctx.lineTo(x + 14 * scale, y + 6 * scale);
    ctx.lineTo(x + 6 * scale, y + 10 * scale);
    ctx.lineTo(x + 6 * scale, y + 16 * scale);
    ctx.lineTo(x - 6 * scale, y + 16 * scale);
    ctx.lineTo(x - 6 * scale, y + 10 * scale);
    ctx.lineTo(x - 14 * scale, y + 6 * scale);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#0a4d91';
    ctx.beginPath();
    ctx.moveTo(x - 6 * scale, y + 2 * scale);
    ctx.lineTo(x + 6 * scale, y + 2 * scale);
    ctx.lineTo(x + 4 * scale, y - 4 * scale);
    ctx.lineTo(x - 4 * scale, y - 4 * scale);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#b9f7ff';
    ctx.fillRect(x - 4 * scale, y - 14 * scale, 8 * scale, 3 * scale);
    ctx.fillRect(x - 10 * scale, y + 8 * scale, 20 * scale, 3 * scale);
}

function drawEnemy(enemy) {
    const scale = Math.max(1, enemy.radius / 8);
    const x = enemy.x;
    const y = enemy.y;
    ctx.fillStyle = '#ff5fa2';
    ctx.beginPath();
    ctx.moveTo(x, y - 16 * scale);
    ctx.lineTo(x + 12 * scale, y - 4 * scale);
    ctx.lineTo(x + 14 * scale, y + 12 * scale);
    ctx.lineTo(x + 6 * scale, y + 16 * scale);
    ctx.lineTo(x - 6 * scale, y + 16 * scale);
    ctx.lineTo(x - 14 * scale, y + 12 * scale);
    ctx.lineTo(x - 12 * scale, y - 4 * scale);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ff2d85';
    ctx.beginPath();
    ctx.moveTo(x - 14 * scale, y + 8 * scale);
    ctx.lineTo(x - 20 * scale, y + 18 * scale);
    ctx.lineTo(x - 10 * scale, y + 12 * scale);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + 14 * scale, y + 8 * scale);
    ctx.lineTo(x + 20 * scale, y + 18 * scale);
    ctx.lineTo(x + 10 * scale, y + 12 * scale);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffbbc4';
    ctx.beginPath();
    ctx.ellipse(x, y + 2 * scale, 6 * scale, 8 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd4ed';
    ctx.beginPath();
    ctx.arc(x, y - 6 * scale, 3 * scale, 0, Math.PI * 2);
    ctx.fill();
}

function draw() {
    ctx.fillStyle = '#030609';
    ctx.fillRect(0, 0, DESIGN_SIZE, DESIGN_SIZE);
    for (const star of stars) {
        ctx.globalAlpha = star.alpha;
        ctx.fillStyle = '#d9ffff';
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    for (const enemy of enemies) drawEnemy(enemy);
    if (bullet.active) {
        ctx.fillStyle = '#ffe56b';
        ctx.fillRect(bullet.x - bullet.width / 2, bullet.y - bullet.height / 2, bullet.width, bullet.height);
    }
    drawPlayer();
}

function frame(time) {
    if (!previousTime) previousTime = time;
    const elapsed = Math.min((time - previousTime) / 1000, 0.05);
    previousTime = time;
    if (gameStarted && !paused && !gameOver) {
        accumulator += elapsed;
        while (accumulator >= FIXED_STEP) {
            update();
            accumulator -= FIXED_STEP;
        }
    } else {
        accumulator = 0;
    }
    draw();
    requestAnimationFrame(frame);
}

function setHeldButton(button, onStart, onEnd) {
    const release = (event) => {
        if (event) event.preventDefault();
        setButtonState(button, false);
        onEnd();
    };
    button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        unlockAudio();
        if (paused || gameOver) return;
        button.setPointerCapture(event.pointerId);
        setButtonState(button, true);
        onStart();
    });
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', () => release());
}

for (const button of document.querySelectorAll('[data-move]')) {
    const direction = Number(button.dataset.move);
    setHeldButton(button,
        () => { if (gameStarted) direction < 0 ? leftPressed = true : rightPressed = true; },
        () => { if (direction < 0) leftPressed = false; else rightPressed = false; });
}

setHeldButton(fireButton, startAutoFire, stopAutoFire);
pauseButton.addEventListener('click', togglePause);
resumeButton.addEventListener('click', () => setPaused(false));
startButton.addEventListener('click', resetGame);
restartButton.addEventListener('click', resetGame);
resetButton.addEventListener('click', resetGame);
menuButton.addEventListener('click', showMenu);
gameMenuButton.addEventListener('click', showMenu);

canvas.addEventListener('pointerdown', (event) => {
    unlockAudio();
    if (!gameStarted || paused || gameOver) return;
    event.preventDefault();
    dragPointer = event.pointerId;
    const bounds = canvas.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * DESIGN_SIZE;
    dragOffset = player.x - x;
    canvas.setPointerCapture(event.pointerId);
});
canvas.addEventListener('pointermove', (event) => {
    if (dragPointer !== event.pointerId || !gameStarted || paused || gameOver) return;
    const bounds = canvas.getBoundingClientRect();
    player.x = Math.max(player.width / 2, Math.min(DESIGN_SIZE - player.width / 2,
        ((event.clientX - bounds.left) / bounds.width) * DESIGN_SIZE + dragOffset));
});
canvas.addEventListener('pointerup', () => { dragPointer = null; });
canvas.addEventListener('pointercancel', () => { dragPointer = null; });

function handleKeyDown(event) {
    unlockAudio();
    if (['ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
    if (event.code === 'Escape') {
        showMenu();
        return;
    }
    if (!gameStarted && (event.code === 'Enter' || event.code === 'Space')) {
        resetGame();
        return;
    }
    if (gameOver) {
        if (event.code === 'Enter' || event.code === 'KeyR') resetGame();
        return;
    }
    if (event.code === 'KeyP') {
        togglePause();
        return;
    }
    if (paused) return;
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') leftPressed = true;
    if (event.code === 'ArrowRight' || event.code === 'KeyD') rightPressed = true;
    if (event.code === 'Space' && !event.repeat) fireBullet();
    if (event.code === 'KeyR') resetGame();
}

function handleKeyUp(event) {
    if (event.code === 'ArrowLeft' || event.code === 'KeyA') leftPressed = false;
    if (event.code === 'ArrowRight' || event.code === 'KeyD') rightPressed = false;
}

window.addEventListener('keydown', handleKeyDown);
window.addEventListener('keyup', handleKeyUp);
window.addEventListener('pointerdown', unlockAudio, { once: true });
window.addEventListener('resize', () => {
    const nextRatio = Math.min(window.devicePixelRatio || 1, 2);
    if (nextRatio === pixelRatio) return;
    canvas.width = DESIGN_SIZE * nextRatio;
    canvas.height = DESIGN_SIZE * nextRatio;
    ctx.setTransform(nextRatio, 0, 0, nextRatio, 0, 0);
});

spawnEnemies(level);
updateHud();
requestAnimationFrame(frame);
