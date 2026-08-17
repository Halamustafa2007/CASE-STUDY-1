
const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const ctx = overlay.getContext('2d');
const countdownEl = document.getElementById('countdown');
const playerMoveEl = document.getElementById('playerMove');
const playerEmojiEl = document.getElementById('playerEmoji');
const aiMoveEl = document.getElementById('aiMove');
const aiEmojiEl = document.getElementById('aiEmoji');
const aiAvatar = document.getElementById('aiAvatar');
const thinkingEl = document.getElementById('thinking');
const startBtn = document.getElementById('startBtn');
const difficultySel = document.getElementById('difficulty');
const resultBanner = document.getElementById('resultBanner');

const playerScoreEl = document.getElementById('playerScore');
const aiScoreEl = document.getElementById('aiScore');
const drawScoreEl = document.getElementById('drawScore');
const roundEl = document.getElementById('round');

const MOVES = ['rock', 'paper', 'scissors'];
const EMOJI = { rock: '✊', paper: '✋', scissors: '✌️' };

let currentLandmarks = null;   
let currentGesture = { move: null, confidence: 0 };
let playerHistory = [];        // for medium/hard AI
let scores = { player: 0, ai: 0, draw: 0, round: 0 };
let roundActive = false;

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function beep(freq = 440, duration = 0.12, type = 'sine') {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.value = 0.15;
  osc.connect(gain).connect(audioCtx.destination);
  osc.start();
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
  osc.stop(audioCtx.currentTime + duration);
}

const hands = new Hands({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
  maxNumHands: 1,
  modelComplexity: 1,
  minDetectionConfidence: 0.7,
  minTrackingConfidence: 0.6
});

hands.onResults(onHandResults);

const camera = new Camera(video, {
  onFrame: async () => { await hands.send({ image: video }); },
  width: 480,
  height: 360
});

const permissionGate = document.getElementById('permissionGate');
const enableCameraBtn = document.getElementById('enableCameraBtn');
const permissionError = document.getElementById('permissionError');
const gameWrap = document.getElementById('gameWrap');

enableCameraBtn.addEventListener('click', async () => {
  enableCameraBtn.disabled = true;
  enableCameraBtn.textContent = 'Requesting access...';
  permissionError.classList.add('hidden');

  try {

    await camera.start();
    permissionGate.classList.add('hidden');
    gameWrap.classList.remove('hidden');
  } catch (err) {
    console.error('Camera access failed:', err);
    enableCameraBtn.disabled = false;
    enableCameraBtn.textContent = 'Try Again ▶';
    permissionError.textContent =
      'Camera access was blocked or unavailable. Please allow camera permission in your browser settings and try again.';
    permissionError.classList.remove('hidden');
  }
});

function resizeCanvas() {
  overlay.width = video.videoWidth || 480;
  overlay.height = video.videoHeight || 360;
}
video.addEventListener('loadedmetadata', resizeCanvas);

function onHandResults(results) {
  resizeCanvas();
  ctx.save();
  ctx.clearRect(0, 0, overlay.width, overlay.height);

  if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
    const landmarks = results.multiHandLandmarks[0];
    currentLandmarks = landmarks;
    drawSkeleton(landmarks);


    currentGesture = classifyGesture(landmarks);
    if (!roundActive) {
      setPlayerReadout(currentGesture.move);
    }
  } else {
    currentLandmarks = null;
    currentGesture = { move: null, confidence: 0 };
  }
  ctx.restore();
}
function drawSkeleton(landmarks) {
  const w = overlay.width;
  const h = overlay.height;

  if (window.HAND_CONNECTIONS) {
    ctx.save();
    ctx.shadowColor = '#6be3ff';
    ctx.shadowBlur = 8;
    ctx.strokeStyle = '#6be3ff';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    HAND_CONNECTIONS.forEach(([startIdx, endIdx]) => {
      const start = landmarks[startIdx];
      const end = landmarks[endIdx];
      ctx.beginPath();
      ctx.moveTo(start.x * w, start.y * h);
      ctx.lineTo(end.x * w, end.y * h);
      ctx.stroke();
    });
    ctx.restore();
  }

  ctx.save();
  ctx.shadowColor = '#ffd93d';
  ctx.shadowBlur = 6;
  landmarks.forEach((pt, i) => {
    const radius = i === 0 ? 7 : 5;
    ctx.beginPath();
    ctx.arc(pt.x * w, pt.y * h, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd93d';
    ctx.fill();
    ctx.strokeStyle = '#05070f';
    ctx.lineWidth = 1;
    ctx.stroke();
  });
  ctx.restore();
}

function setPlayerReadout(move) {
  playerEmojiEl.textContent = move ? EMOJI[move] : '✋';
  playerMoveEl.textContent = move || '—';
}


function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function isFingerOpen(landmarks, tipIdx, pipIdx, mcpIdx) {
  const wrist = landmarks[0];
  const tip = landmarks[tipIdx];
  const pip = landmarks[pipIdx];
  const mcp = landmarks[mcpIdx];
  // open if tip is farther from wrist than the pip joint (finger extended)
  return dist(tip, wrist) > dist(pip, wrist) * 1.05 && dist(tip, mcp) > dist(pip, mcp);
}

function isThumbOpen(landmarks) {

  const wrist = landmarks[0];
  const tip = landmarks[4];
  const mcp = landmarks[2];
  return dist(tip, wrist) > dist(mcp, wrist) * 1.15;
}

function classifyGesture(landmarks) {
  const thumb = isThumbOpen(landmarks);
  const index = isFingerOpen(landmarks, 8, 6, 5);
  const middle = isFingerOpen(landmarks, 12, 10, 9);
  const ring = isFingerOpen(landmarks, 16, 14, 13);
  const pinky = isFingerOpen(landmarks, 20, 18, 17);

  const openCount = [index, middle, ring, pinky].filter(Boolean).length;

  let move = null;
  let confidence = 0.6;

  if (index && middle && !ring && !pinky) {
    move = 'scissors';
    confidence = 0.85;
  } else if (openCount >= 3) {
    move = 'paper';
    confidence = thumb ? 0.9 : 0.75;
  } else if (openCount === 0 && !thumb) {
    move = 'rock';
    confidence = 0.85;
  } else if (openCount <= 1) {
    move = 'rock';
    confidence = 0.6;
  }

  return { move, confidence };
}

function counterMove(move) {
  if (move === 'rock') return 'paper';
  if (move === 'paper') return 'scissors';
  return 'rock';
}

function aiEasyMove() {
  return MOVES[Math.floor(Math.random() * 3)];
}

function aiMediumMove() {

  if (playerHistory.length < 2) return aiEasyMove();
  const recent = playerHistory.slice(-5);
  const counts = { rock: 0, paper: 0, scissors: 0 };
  recent.forEach(m => counts[m]++);
  const mostFrequent = Object.keys(counts).reduce((a, b) => (counts[a] >= counts[b] ? a : b));
  return counterMove(mostFrequent);
}

function aiHardMove() {
  // Simple "predictive" model: build a transition table of
  // (previous move -> next move) from history and predict
  // the player's most likely next move given their last move.
  if (playerHistory.length < 3) return aiMediumMove();

  const transitions = {}; // { rock: {rock:0,paper:0,scissors:0}, ... }
  MOVES.forEach(m => (transitions[m] = { rock: 0, paper: 0, scissors: 0 }));

  for (let i = 0; i < playerHistory.length - 1; i++) {
    const from = playerHistory[i];
    const to = playerHistory[i + 1];
    transitions[from][to]++;
  }

  const lastMove = playerHistory[playerHistory.length - 1];
  const predictions = transitions[lastMove];
  const predicted = Object.keys(predictions).reduce((a, b) =>
    predictions[a] >= predictions[b] ? a : b
  );

  // If we have no real signal yet, fall back to medium strategy
  const totalSignal = predictions.rock + predictions.paper + predictions.scissors;
  if (totalSignal === 0) return aiMediumMove();

  return counterMove(predicted);
}

function getAiMove() {
  const difficulty = difficultySel.value;
  if (difficulty === 'easy') return aiEasyMove();
  if (difficulty === 'medium') return aiMediumMove();
  return aiHardMove();
}

function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

async function runRound() {
  if (roundActive) return;
  roundActive = true;
  startBtn.disabled = true;
  resultBanner.classList.add('hidden');
  setPlayerReadout(null);
  aiEmojiEl.textContent = '🤖';
  aiMoveEl.textContent = '—';
  thinkingEl.classList.remove('hidden');

  countdownEl.classList.remove('hidden');
  const steps = ['3', '2', '1', 'Detect!'];
  for (const step of steps) {
    countdownEl.textContent = step;
    beep(step === 'Detect!' ? 880 : 440, 0.1);
    await sleep(700);
  }
  countdownEl.classList.add('hidden');
  thinkingEl.classList.add('hidden');

  const captured = currentLandmarks
    ? classifyGesture(currentLandmarks)
    : { move: null, confidence: 0 };
  const playerMove = captured.move || MOVES[Math.floor(Math.random() * 3)]; // fallback if no hand seen

  setPlayerReadout(playerMove);

  const aiMove = getAiMove();
  aiEmojiEl.textContent = EMOJI[aiMove];
  aiAvatar.classList.add('shake');
  aiMoveEl.textContent = aiMove;

  resolveRound(playerMove, aiMove);

  playerHistory.push(playerMove);

  await sleep(400);
  aiAvatar.classList.remove('shake');
  startBtn.disabled = false;
  roundActive = false;
}

function resolveRound(playerMove, aiMove) {
  scores.round++;
  let outcome; // 'win' | 'lose' | 'draw'

  if (playerMove === aiMove) {
    outcome = 'draw';
    scores.draw++;
  } else if (
    (playerMove === 'rock' && aiMove === 'scissors') ||
    (playerMove === 'paper' && aiMove === 'rock') ||
    (playerMove === 'scissors' && aiMove === 'paper')
  ) {
    outcome = 'win';
    scores.player++;
  } else {
    outcome = 'lose';
    scores.ai++;
  }

  showResult(outcome);
  updateScoreboard();
}

function showResult(outcome) {
  resultBanner.classList.remove('hidden', 'win', 'lose', 'draw');
  if (outcome === 'win') {
    resultBanner.textContent = '🎉 You Win!';
    resultBanner.classList.add('win');
    beep(660, 0.2);
    launchConfetti();
  } else if (outcome === 'lose') {
    resultBanner.textContent = '💥 You Lose!';
    resultBanner.classList.add('lose');
    beep(220, 0.25, 'square');
    document.body.style.animation = 'none';
    void document.body.offsetWidth; // restart animation trick
    document.body.style.animation = 'shakeScreen 0.4s ease';
  } else {
    resultBanner.textContent = '🤝 Draw';
    resultBanner.classList.add('draw');
    beep(330, 0.15);
  }
}

function updateScoreboard() {
  playerScoreEl.textContent = scores.player;
  aiScoreEl.textContent = scores.ai;
  drawScoreEl.textContent = scores.draw;
  roundEl.textContent = scores.round;
}
function launchConfetti() {
  for (let i = 0; i < 24; i++) {
    const piece = document.createElement('div');
    piece.textContent = ['🎉', '✨', '⭐'][Math.floor(Math.random() * 3)];
    piece.style.position = 'fixed';
    piece.style.left = Math.random() * 100 + 'vw';
    piece.style.top = '-20px';
    piece.style.fontSize = 14 + Math.random() * 14 + 'px';
    piece.style.transition = 'transform 1.2s ease-in, opacity 1.2s ease-in';
    piece.style.zIndex = 999;
    document.body.appendChild(piece);
    requestAnimationFrame(() => {
      piece.style.transform = `translateY(${80 + Math.random() * 20}vh) rotate(${Math.random() * 360}deg)`;
      piece.style.opacity = '0';
    });
    setTimeout(() => piece.remove(), 1300);
  }
}

const styleTag = document.createElement('style');
styleTag.textContent = `
@keyframes shakeScreen {
  0%,100% { transform: translate(0,0); }
  20% { transform: translate(-6px,4px); }
  40% { transform: translate(6px,-4px); }
  60% { transform: translate(-4px,-4px); }
  80% { transform: translate(4px,4px); }
}`;
document.head.appendChild(styleTag);

startBtn.addEventListener('click', runRound);