const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const pausedScreen = document.getElementById('paused-screen');
const menuScreen = document.getElementById('menu-screen');
const gameOverScreen = document.getElementById('game-over');
const finalScore = document.getElementById('final-score');
const restartButton = document.getElementById('restart-button');
const pauseButton = document.getElementById('pause-button');
const menuButton = document.getElementById('menu-button');
const menuResumeButton = document.getElementById('menu-resume-button');
const menuRestartButton = document.getElementById('menu-restart-button');
const menuEndButton = document.getElementById('menu-end-button');
const musicToggleButton = document.getElementById('music-toggle-button');
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
let gameStarted = true;
let gameOver = false;
let paused = false;
let menuOpen = false;
let musicEnabled = true;
let leftPressed = false;
let rightPressed = false;
let fireHeld = false;
let autoFireTimer = null;
let previousTime = 0;
let accumulator = 0;
let audioContext = null;
let musicGain = null;
let musicTimer = null;
let melodyIndex = 0;

const melody = [330, 392, 440, 392, 330, 294, 262, 294];
const rhythm = [0.28, 0.28, 0.28, 0.28, 0.28, 0.28, 0.28, 0.4];
const stars = Array.from({ length: 72 }, (_, index) => ({
    x: (index * 137.5 + 29) % DESIGN_SIZE,
    y: (index * 83.7 + 17) % DESIGN_SIZE,
    radius: index % 11 === 0 ? 1.35 : 0.65,
    speed: 3 + index % 7,
    alpha: 0.2 + (index % 5) * 0.09,
}));
let explosions = [];
let visualTime = 0;

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
        musicGain.gain.value = musicEnabled ? 0.24 : 0;
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

function resetGame() {
    gameStarted = true;
    gameOver = false;
    paused = false;
    menuOpen = false;
    explosions = [];
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
    menuScreen.hidden = true;
    menuButton.setAttribute('aria-expanded', 'false');
    pausedScreen.hidden = true;
    gameOverScreen.hidden = true;
    setPauseButton(false);
    previousTime = 0;
    accumulator = 0;
    unlockAudio();
}

function setPauseButton(isPaused) {
    pauseButton.textContent = isPaused ? 'Resume' : 'Pause';
    pauseButton.setAttribute('aria-label', isPaused ? 'Resume game' : 'Pause game');
    pauseButton.setAttribute('aria-pressed', String(isPaused));
    setButtonState(pauseButton, isPaused);
}

function setPaused(nextPaused) {
    if (!gameStarted || gameOver || (menuOpen && !nextPaused)) return;
    paused = nextPaused;
    leftPressed = false;
    rightPressed = false;
    stopAutoFire();
    pausedScreen.hidden = !paused;
    setPauseButton(paused);
    previousTime = 0;
    accumulator = 0;
    if (paused) stopMusic();
    else startMusic();
}

function togglePause() {
    if (menuOpen) return;
    setPaused(!paused);
}

function openMenu() {
    if (!gameStarted || gameOver || menuOpen) return;
    menuOpen = true;
    setPaused(true);
    pausedScreen.hidden = true;
    menuScreen.hidden = false;
    menuButton.setAttribute('aria-expanded', 'true');
}

function closeMenu() {
    if (!menuOpen) return;
    menuOpen = false;
    menuScreen.hidden = true;
    pausedScreen.hidden = true;
    menuButton.setAttribute('aria-expanded', 'false');
    setPaused(false);
}

function toggleMusic() {
    musicEnabled = !musicEnabled;
    initializeAudio();
    if (audioContext && musicGain) {
        musicGain.gain.setTargetAtTime(musicEnabled ? 0.24 : 0, audioContext.currentTime, 0.025);
    }
    musicToggleButton.textContent = musicEnabled ? 'Music On' : 'Music Off';
    musicToggleButton.setAttribute('aria-pressed', String(musicEnabled));
}

function endGameFromMenu() {
    if (!menuOpen) return;
    menuOpen = false;
    menuScreen.hidden = true;
    paused = false;
    pausedScreen.hidden = true;
    menuButton.setAttribute('aria-expanded', 'false');
    setPauseButton(false);
    finishGame();
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

function spawnExplosion(x, y, scale) {
    explosions.push({ x, y, scale, startedAt: visualTime });
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
        const hitEnemy = enemies[hitEnemyIndex];
        spawnExplosion(hitEnemy.x, hitEnemy.y, 1);
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
    spawnExplosion(player.x, player.y, 2.2);
    pausedScreen.hidden = true;
    finalScore.textContent = `Final score: ${score} · Level ${level}`;
    gameOverScreen.hidden = false;
}

function drawPlayer() {
    const x = player.x;
    const y = player.y;
    const flameLength = 8 + (Math.sin(visualTime * 31) + 1) * 5;

    ctx.save();
    ctx.shadowColor = '#ff8a32';
    ctx.shadowBlur = 11;
    const flame = ctx.createLinearGradient(x, y + 13, x, y + 20 + flameLength);
    flame.addColorStop(0, '#fff6a0');
    flame.addColorStop(0.35, '#ffb437');
    flame.addColorStop(1, 'rgba(255, 75, 28, 0)');
    ctx.fillStyle = flame;
    ctx.beginPath();
    ctx.moveTo(x - 5, y + 12);
    ctx.lineTo(x, y + 20 + flameLength);
    ctx.lineTo(x + 5, y + 12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.shadowColor = '#38dfff';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#147da7';
    ctx.beginPath();
    ctx.moveTo(x - 7, y + 2);
    ctx.lineTo(x - 20, y + 13);
    ctx.lineTo(x - 13, y - 5);
    ctx.lineTo(x - 5, y - 11);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + 7, y + 2);
    ctx.lineTo(x + 20, y + 13);
    ctx.lineTo(x + 13, y - 5);
    ctx.lineTo(x + 5, y - 11);
    ctx.closePath();
    ctx.fill();

    const hull = ctx.createLinearGradient(x - 8, y, x + 8, y);
    hull.addColorStop(0, '#2de7ff');
    hull.addColorStop(0.48, '#e8ffff');
    hull.addColorStop(1, '#20a6e5');
    ctx.fillStyle = hull;
    ctx.beginPath();
    ctx.moveTo(x, y - 21);
    ctx.lineTo(x + 8, y - 1);
    ctx.lineTo(x + 7, y + 11);
    ctx.lineTo(x, y + 16);
    ctx.lineTo(x - 7, y + 11);
    ctx.lineTo(x - 8, y - 1);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#75dfff';
    ctx.beginPath();
    ctx.ellipse(x, y - 5, 4.2, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.82)';
    ctx.beginPath();
    ctx.ellipse(x - 1.2, y - 7, 1.2, 3.2, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(213,250,255,.9)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - 15, y + 8);
    ctx.lineTo(x - 8, y + 4);
    ctx.moveTo(x + 15, y + 8);
    ctx.lineTo(x + 8, y + 4);
    ctx.stroke();
    ctx.restore();
}

function drawEnemy(enemy, index) {
    const wobbleX = Math.sin(visualTime * 3.1 + index * 1.7) * 1.6;
    const wobbleY = Math.sin(visualTime * 4.2 + index) * 0.8;
    const x = enemy.x + wobbleX;
    const y = enemy.y + wobbleY;
    const scale = Math.max(0.72, enemy.radius / 16);

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.shadowColor = '#a3d9ff';
    ctx.shadowBlur = 8;
    const dome = ctx.createLinearGradient(0, -17, 0, 2);
    dome.addColorStop(0, '#d8f5ff');
    dome.addColorStop(0.42, '#6d99ad');
    dome.addColorStop(1, '#273e4d');
    ctx.fillStyle = dome;
    ctx.beginPath();
    ctx.ellipse(0, -5, 11, 11, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    const saucer = ctx.createLinearGradient(0, -3, 0, 11);
    saucer.addColorStop(0, '#f0f3f5');
    saucer.addColorStop(0.35, '#8c999f');
    saucer.addColorStop(0.72, '#4e5b63');
    saucer.addColorStop(1, '#c5cdd1');
    ctx.fillStyle = saucer;
    ctx.beginPath();
    ctx.ellipse(0, 1, 17, 6.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#dce8ec';
    ctx.lineWidth = 1;
    ctx.stroke();

    const lights = ['#ff5c72', '#ffd452', '#58f0cb', '#72aaff', '#ff83dd'];
    lights.forEach((color, lightIndex) => {
        const lightX = -11 + lightIndex * 5.5;
        const lit = Math.sin(visualTime * 8 + index * 1.9 + lightIndex * 1.7) > -0.1;
        ctx.fillStyle = lit ? color : '#34424b';
        ctx.shadowColor = color;
        ctx.shadowBlur = lit ? 7 : 0;
        ctx.beginPath();
        ctx.arc(lightX, 3.3, 1.25, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.restore();
}

function drawLaser() {
    ctx.save();
    ctx.shadowColor = '#ffda45';
    ctx.shadowBlur = 16;
    const laser = ctx.createLinearGradient(bullet.x - 3, bullet.y, bullet.x + 3, bullet.y);
    laser.addColorStop(0, '#ff9e28');
    laser.addColorStop(0.35, '#fff46c');
    laser.addColorStop(0.5, '#ffffff');
    laser.addColorStop(0.7, '#fff46c');
    laser.addColorStop(1, '#ff9e28');
    ctx.fillStyle = laser;
    ctx.beginPath();
    ctx.moveTo(bullet.x, bullet.y - 12);
    ctx.lineTo(bullet.x + 3, bullet.y - 5);
    ctx.lineTo(bullet.x + 2, bullet.y + 10);
    ctx.lineTo(bullet.x, bullet.y + 12);
    ctx.lineTo(bullet.x - 2, bullet.y + 10);
    ctx.lineTo(bullet.x - 3, bullet.y - 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

function drawExplosions() {
    explosions = explosions.filter((burst) => visualTime - burst.startedAt < 0.8 * burst.scale);
    for (const burst of explosions) {
        const age = visualTime - burst.startedAt;
        const duration = 0.8 * burst.scale;
        const progress = Math.max(0, age / duration);
        const radius = (8 + progress * 27) * burst.scale;
        const alpha = 1 - progress;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.globalCompositeOperation = 'lighter';
        const glow = ctx.createRadialGradient(burst.x, burst.y, 0, burst.x, burst.y, radius);
        glow.addColorStop(0, '#fffbd0');
        glow.addColorStop(0.18, '#ffd94f');
        glow.addColorStop(0.52, '#ff7138');
        glow.addColorStop(1, 'rgba(255,55,30,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(burst.x, burst.y, radius, 0, Math.PI * 2);
        ctx.fill();

        for (let particle = 0; particle < 12; particle += 1) {
            const angle = particle * Math.PI * 2 / 12 + burst.startedAt * 3;
            const distance = radius * (0.35 + (particle % 3) * 0.16);
            ctx.fillStyle = particle % 3 === 0 ? '#fff8a8' : '#ff8a3c';
            ctx.beginPath();
            ctx.arc(
                burst.x + Math.cos(angle) * distance,
                burst.y + Math.sin(angle) * distance,
                Math.max(1, (3.2 - progress * 2) * burst.scale),
                0,
                Math.PI * 2,
            );
            ctx.fill();
        }
        ctx.restore();
    }
}

function draw() {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, DESIGN_SIZE, DESIGN_SIZE);

    for (const star of stars) {
        const starY = (star.y + visualTime * star.speed) % DESIGN_SIZE;
        const flicker = 0.78 + Math.sin(visualTime * 2 + star.x) * 0.22;
        ctx.globalAlpha = star.alpha * flicker;
        ctx.fillStyle = '#d9e9ff';
        ctx.beginPath();
        ctx.arc(star.x, starY, star.radius, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    enemies.forEach(drawEnemy);
    if (bullet.active) drawLaser();
    drawPlayer();
    drawExplosions();

    ctx.fillStyle = '#f4f8ff';
    ctx.font = 'bold 18px Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(70,170,255,.6)';
    ctx.shadowBlur = 7;
    ctx.fillText(`SCORE  ${score}`, 18, 16);
    ctx.font = 'bold 13px Arial, sans-serif';
    ctx.fillStyle = '#a8d9ff';
    ctx.fillText(`LEVEL  ${level} / ${LEVEL_COUNT}`, 19, 40);
    ctx.shadowBlur = 0;
}

function frame(time) {
    visualTime = time / 1000;
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
menuButton.addEventListener('click', openMenu);
menuResumeButton.addEventListener('click', closeMenu);
menuRestartButton.addEventListener('click', resetGame);
menuEndButton.addEventListener('click', endGameFromMenu);
musicToggleButton.addEventListener('click', toggleMusic);
restartButton.addEventListener('click', resetGame);

function handleKeyDown(event) {
    unlockAudio();
    if (['ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
    if (event.code === 'Escape' || event.code === 'KeyM') {
        if (menuOpen) closeMenu();
        else openMenu();
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
draw();
requestAnimationFrame(frame);
